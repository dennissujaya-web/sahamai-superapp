import { z } from "zod";

const CikMapEntry = z.object({
  cik_str: z.string().optional(),
  cik: z.number().optional(),
  ticker: z.string().optional(),
  title: z.string().optional(),
});

type CikMap = Record<string, { cik: number; title: string }>;

let cikCache: { map: CikMap; ts: number } | null = null;

function reqHeaders() {
  const ua = process.env.SEC_USER_AGENT;
  if (!ua) {
    throw new Error('Missing env SEC_USER_AGENT. Set it in hosting env, e.g. "SahamAI/0.1 (contact: you@email.com)".');
  }
  return {
    "User-Agent": ua,
    "Accept": "application/json,text/plain,*/*",
    "Accept-Encoding": "gzip, deflate",
  };
}

export async function getCikForTicker(ticker: string): Promise<{ cik: number; title: string } | null> {
  const t = ticker.trim().toUpperCase();
  const now = Date.now();

  if (cikCache && now - cikCache.ts < 1000 * 60 * 60 * 24) {
    return cikCache.map[t] ?? null;
  }

  const urls = [
    "https://www.sec.gov/files/company_tickers.json",
    "https://www.sec.gov/files/company_tickers_exchange.json",
  ];

  let map: CikMap = {};
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: reqHeaders(), cache: "no-store" });
      if (!res.ok) continue;
      const raw = await res.json();

      const items: any[] = Array.isArray(raw)
        ? raw
        : (raw && raw.data && Array.isArray(raw.data) ? raw.data : Object.values(raw ?? {}));

      for (const it of items) {
        const parsed = CikMapEntry.safeParse(it);
        if (!parsed.success) continue;
        const tick = (it.ticker ?? "").toString().toUpperCase().trim();
        const cik = Number(it.cik_str ?? it.cik);
        const title = (it.title ?? "").toString();
        if (tick && Number.isFinite(cik)) map[tick] = { cik, title };
      }
      if (Object.keys(map).length > 1000) break;
    } catch {
      // try next url
    }
  }

  cikCache = { map, ts: now };
  return map[t] ?? null;
}

export async function getCompanyFacts(cik: number): Promise<any> {
  const cik10 = cik.toString().padStart(10, "0");
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`;
  const res = await fetch(url, { headers: reqHeaders(), cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`SEC companyfacts failed (${res.status}): ${t || res.statusText}`);
  }
  return res.json();
}
