import { z } from "zod";

/**
 * SEC helper (CIK mapping + companyfacts)
 * - Wajib set env: SEC_USER_AGENT (format disarankan: "AppName/1.0 (contact: email@domain.com)")
 * - Guardrail:
 *   - Jangan cache kalau mapping kosong / terlalu kecil (biasanya fetch gagal)
 *   - Retry ringan untuk 429/5xx
 *   - Normalisasi ticker (BRK.B -> BRK-B)
 */

const SEC_TICKER_URLS = [
  "https://www.sec.gov/files/company_tickers.json",
  "https://www.sec.gov/files/company_tickers_exchange.json",
] as const;

const TTL_OK_MS = 1000 * 60 * 60 * 24; // 24 jam kalau mapping valid
const TTL_SMALL_MS = 1000 * 60 * 5; // 5 menit kalau mapping kecil tapi tidak kosong (jaga-jaga)
const MIN_MAP_SIZE_OK = 1000; // kalau di bawah ini, biasanya fetch tidak lengkap/blocked

const CikMapEntry = z.object({
  cik_str: z.union([z.string(), z.number()]).optional(),
  cik: z.union([z.number(), z.string()]).optional(),
  ticker: z.string().optional(),
  title: z.string().optional(),
});

type CikMap = Record<string, { cik: number; title: string }>;

let cikCache: { map: CikMap; ts: number; ttl: number } | null = null;
let cikInFlight: Promise<CikMap> | null = null;

function secHeaders() {
  const ua = process.env.SEC_USER_AGENT;
  if (!ua) {
    throw new Error(
      'Missing env SEC_USER_AGENT. Set it in Vercel (Production + Preview) e.g. "SahamAI/1.0 (contact: email@domain.com)".'
    );
  }
  return {
    "User-Agent": ua,
    Accept: "application/json,text/plain,*/*",
  } as Record<string, string>;
}

function normalizeTicker(ticker: string) {
  const t = ticker.trim().toUpperCase();
  // SEC sering pakai BRK-B bukan BRK.B
  const dash = t.replace(".", "-");
  // juga kadang input user pakai spasi
  return { raw: t, alt: dash };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchJsonWithRetry(url: string, tries = 3): Promise<any> {
  let lastErr: any = null;

  for (let i = 0; i < tries; i++) {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 12_000); // 12s
    try {
      const res = await fetch(url, {
        headers: secHeaders(),
        cache: "no-store",
        signal: ac.signal,
      });

      if (res.ok) return res.json();

      // kalau rate limit / server error, retry
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        lastErr = new Error(`SEC ${res.status} from ${url}`);
        // backoff ringan
        await sleep(400 * (i + 1));
        continue;
      }

      // error lain: jangan retry terlalu banyak
      const txt = await res.text().catch(() => "");
      throw new Error(`SEC ${res.status} from ${url}: ${txt || res.statusText}`);
    } catch (e: any) {
      lastErr = e;
      // kalau abort/timeout, retry
      await sleep(250 * (i + 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastErr ?? new Error(`Failed to fetch ${url}`);
}

function buildCikMapFromRaw(raw: any): CikMap {
  const map: CikMap = {};

  // SEC kadang: object dengan key "0","1",... -> entry
  // kadang: array
  // kadang: {data:[...]} (jarang)
  const items: any[] = Array.isArray(raw)
    ? raw
    : raw?.data && Array.isArray(raw.data)
    ? raw.data
    : Object.values(raw ?? {});

  for (const it of items) {
    const parsed = CikMapEntry.safeParse(it);
    if (!parsed.success) continue;

    const tick = (it.ticker ?? "").toString().toUpperCase().trim();
    const cikRaw = it.cik_str ?? it.cik;
    const cikNum = Number(cikRaw);
    const title = (it.title ?? "").toString();

    if (!tick) continue;
    if (!Number.isFinite(cikNum) || cikNum <= 0) continue;

    map[tick] = { cik: cikNum, title };
  }

  return map;
}

async function loadCikMap(): Promise<CikMap> {
  const now = Date.now();

  // cache hit
  if (cikCache && now - cikCache.ts < cikCache.ttl) {
    return cikCache.map;
  }

  // dedupe concurrent calls
  if (cikInFlight) return cikInFlight;

  cikInFlight = (async () => {
    let bestMap: CikMap = {};

    for (const url of SEC_TICKER_URLS) {
      try {
        const raw = await fetchJsonWithRetry(url, 3);
        const map = buildCikMapFromRaw(raw);

        // pilih yang terbesar
        if (Object.keys(map).length > Object.keys(bestMap).length) bestMap = map;

        // kalau sudah cukup besar, stop
        if (Object.keys(bestMap).length >= MIN_MAP_SIZE_OK) break;
      } catch {
        // coba url berikutnya
      }
    }

    const size = Object.keys(bestMap).length;

    // Guardrail caching:
    // - kalau kosong: JANGAN cache (biar request berikutnya masih coba fetch lagi)
    // - kalau kecil tapi tidak kosong: cache pendek
    // - kalau besar: cache normal
    if (size === 0) {
      cikCache = null;
    } else if (size < MIN_MAP_SIZE_OK) {
      cikCache = { map: bestMap, ts: now, ttl: TTL_SMALL_MS };
    } else {
      cikCache = { map: bestMap, ts: now, ttl: TTL_OK_MS };
    }

    return bestMap;
  })().finally(() => {
    cikInFlight = null;
  });

  return cikInFlight;
}

export async function getCikForTicker(
  ticker: string
): Promise<{ cik: number; title: string } | null> {
  const { raw, alt } = normalizeTicker(ticker);
  const map = await loadCikMap();

  // coba raw, lalu versi alt (BRK.B -> BRK-B)
  return map[raw] ?? map[alt] ?? null;
}

export async function getCompanyFacts(cik: number): Promise<any> {
  if (!Number.isFinite(cik) || cik <= 0) throw new Error(`Invalid CIK: ${cik}`);

  const cik10 = cik.toString().padStart(10, "0");
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`;

  const raw = await fetchJsonWithRetry(url, 3);
  return raw;
}
