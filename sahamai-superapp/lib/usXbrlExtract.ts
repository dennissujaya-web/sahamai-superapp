export type CompanyFacts = any;

type Entry = {
  val: number;
  end?: string;
  start?: string;
  fy?: number;
  fp?: string;
  accn?: string;
  filed?: string;
};

function entries(facts: CompanyFacts, ns: string, tag: string, unit: string): Entry[] {
  try {
    const obj = facts?.facts?.[ns]?.[tag];
    const arr = obj?.units?.[unit];
    if (!Array.isArray(arr)) return [];
    return arr.filter((e: any) => typeof e?.val === "number" && typeof e?.end === "string");
  } catch {
    return [];
  }
}

function durationDays(e: Entry): number | null {
  if (!e.start || !e.end) return null;
  const s = new Date(e.start.slice(0, 10));
  const t = new Date(e.end.slice(0, 10));
  const d = Math.round((t.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return Number.isFinite(d) ? d : null;
}

function pickLatestInstant(arr: Entry[]): Entry | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => (a.end ?? "").localeCompare(b.end ?? ""));
  return s[s.length - 1] ?? null;
}

function pickPrevInstant(arr: Entry[]): Entry | null {
  if (arr.length < 2) return null;
  const s = [...arr].sort((a, b) => (a.end ?? "").localeCompare(b.end ?? ""));
  return s[s.length - 2] ?? null;
}

function sumLastNQuarters(arr: Entry[], n = 4): { value: number; end: string } | null {
  const q = arr
    .map((e) => ({ e, d: durationDays(e) }))
    .filter((x) => x.d !== null && x.d! >= 70 && x.d! <= 120)
    .map((x) => x.e);

  if (q.length < n) return null;
  const sorted = [...q].sort((a, b) => (a.end ?? "").localeCompare(b.end ?? ""));

  const uniq: Entry[] = [];
  const seen = new Set<string>();
  for (let i = sorted.length - 1; i >= 0; i--) {
    const end = sorted[i].end ?? "";
    if (!end || seen.has(end)) continue;
    seen.add(end);
    uniq.push(sorted[i]);
    if (uniq.length >= n) break;
  }
  if (uniq.length < n) return null;
  uniq.reverse();

  const value = uniq.reduce((s, e) => s + (e.val ?? 0), 0);
  const end = uniq[uniq.length - 1].end!;
  return { value, end };
}

function pickLatestFY(arr: Entry[]): { value: number; end: string; fy?: number } | null {
  const y = arr
    .map((e) => ({ e, d: durationDays(e) }))
    .filter((x) => x.d !== null && x.d! >= 330 && x.d! <= 400)
    .map((x) => x.e);

  if (!y.length) return null;
  const sorted = [...y].sort((a, b) => (a.end ?? "").localeCompare(b.end ?? ""));
  const last = sorted[sorted.length - 1];
  return { value: last.val, end: last.end!, fy: last.fy };
}

function bestTTM(arr: Entry[]): { value: number | null; end: string | null; source: string } {
  const q = sumLastNQuarters(arr, 4);
  if (q) return { value: q.value, end: q.end, source: "TTM_QUARTERS" };
  const fy = pickLatestFY(arr);
  if (fy) return { value: fy.value, end: fy.end, source: `FY_${fy.fy ?? ""}`.trim() };
  return { value: null, end: null, source: "MISSING" };
}

export type UsFundamentals = {
  ticker: string;
  cik: number;

  netIncomeTTM: number | null;
  netIncomeEnd: string | null;
  equity: number | null;
  equityEnd: string | null;
  equityPrev: number | null;

  shares: number | null;
  sharesEnd: string | null;

  revenueTTM: number | null;
  ocfTTM: number | null;
  capexTTM: number | null;

  cash: number | null;
  debt: number | null;

  warnings: string[];
  evidence: {
    secCompanyFactsUrl: string;
    netIncomeSource: string;
    equityEnd?: string | null;
    sharesEnd?: string | null;
  };
};

export function extractUsFundamentals(ticker: string, cik: number, facts: CompanyFacts): UsFundamentals {
  const warnings: string[] = [];

  const niArr = entries(facts, "us-gaap", "NetIncomeLoss", "USD");
  const ni = bestTTM(niArr);
  if (ni.source === "MISSING") warnings.push("Net income tidak ditemukan (us-gaap:NetIncomeLoss USD).");

  let eqArr = entries(facts, "us-gaap", "StockholdersEquity", "USD");
  if (!eqArr.length) {
    eqArr = entries(facts, "us-gaap", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "USD");
  }
  const eqLatest = pickLatestInstant(eqArr);
  const eqPrev = pickPrevInstant(eqArr);
  if (!eqLatest) warnings.push("Equity tidak ditemukan (StockholdersEquity).");

  let shArr = entries(facts, "dei", "EntityCommonStockSharesOutstanding", "shares");
  if (!shArr.length) shArr = entries(facts, "us-gaap", "CommonStockSharesOutstanding", "shares");
  const shLatest = pickLatestInstant(shArr);
  if (!shLatest) warnings.push("Shares outstanding tidak ditemukan (dei:EntityCommonStockSharesOutstanding).");

  const rev = bestTTM(entries(facts, "us-gaap", "Revenues", "USD"));
  const ocf = bestTTM(entries(facts, "us-gaap", "NetCashProvidedByUsedInOperatingActivities", "USD"));
  const cap = bestTTM(entries(facts, "us-gaap", "PaymentsToAcquirePropertyPlantAndEquipment", "USD"));

  const cashLatest = pickLatestInstant(entries(facts, "us-gaap", "CashAndCashEquivalentsAtCarryingValue", "USD"));
  const debtLatest = pickLatestInstant(entries(facts, "us-gaap", "LongTermDebt", "USD"));

  const shares = shLatest?.val ?? null;
  if (shares !== null && !(shares >= 1e6 && shares <= 2e11)) warnings.push(`Shares di luar range wajar (1e6..2e11): ${shares}`);

  return {
    ticker: ticker.toUpperCase(),
    cik,
    netIncomeTTM: ni.value,
    netIncomeEnd: ni.end,
    equity: eqLatest?.val ?? null,
    equityEnd: eqLatest?.end ?? null,
    equityPrev: eqPrev?.val ?? null,
    shares,
    sharesEnd: shLatest?.end ?? null,
    revenueTTM: rev.value,
    ocfTTM: ocf.value,
    capexTTM: cap.value !== null ? Math.abs(cap.value) : null,
    cash: cashLatest?.val ?? null,
    debt: debtLatest?.val ?? null,
    warnings,
    evidence: {
      secCompanyFactsUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, "0")}.json`,
      netIncomeSource: ni.source,
      equityEnd: eqLatest?.end ?? null,
      sharesEnd: shLatest?.end ?? null,
    },
  };
}
