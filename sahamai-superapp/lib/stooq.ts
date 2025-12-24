import { z } from "zod";

const Row = z.object({
  Date: z.string(),
  Close: z.string(),
});

export async function getLatestCloseUS(ticker: string): Promise<{ close: number; date: string }> {
  const t = ticker.trim().toLowerCase();
  const symbol = `${t}.us`;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Stooq failed (${res.status})`);

  const csv = (await res.text()).trim();
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("Stooq returned empty CSV.");

  const headers = lines[0].split(",");
  const closeIdx = headers.indexOf("Close");
  const dateIdx = headers.indexOf("Date");
  if (closeIdx < 0 || dateIdx < 0) throw new Error("Unexpected Stooq CSV header.");

  for (let i = lines.length - 1; i >= 1; i--) {
    const cols = lines[i].split(",");
    const r = { Date: cols[dateIdx], Close: cols[closeIdx] };
    const parsed = Row.safeParse(r);
    if (!parsed.success) continue;
    const close = Number(parsed.data.Close);
    if (!Number.isFinite(close)) continue;
    return { close, date: parsed.data.Date };
  }
  throw new Error("No valid Close rows in Stooq CSV.");
}
