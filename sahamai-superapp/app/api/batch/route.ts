import { NextResponse } from "next/server";
import { z } from "zod";

import { getCikForTicker, getCompanyFacts } from "@/lib/sec";
import { getLatestCloseUS } from "@/lib/stooq";
import { extractUsFundamentals } from "@/lib/usXbrlExtract";
import { buildScoreBreakdown, computeMetrics } from "@/lib/score";
import strategy from "@/data/strategy.us.json";

const Body = z.object({
  tickers: z.array(z.string().min(1).max(10)).min(1).max(25),
  delayMs: z.number().int().min(0).max(1000).optional(),
});

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request) {
  try {
    const runAt = new Date().toISOString();
    const json = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const { tickers, delayMs } = parsed.data;
    const results: any[] = [];

    for (const tRaw of tickers) {
      const ticker = tRaw.toUpperCase().trim();
      try {
        const cikInfo = await getCikForTicker(ticker);
        if (!cikInfo) throw new Error(`CIK tidak ditemukan untuk ${ticker}`);

        const [{ close, date }, facts] = await Promise.all([
          getLatestCloseUS(ticker),
          getCompanyFacts(cikInfo.cik),
        ]);

        const fundamentals = extractUsFundamentals(ticker, cikInfo.cik, facts);
        const metrics = computeMetrics(fundamentals, close);

        const priorSnapshot = null; // future: load from DB
        const { breakdown, verdict, mos, intrinsic, explanation } = buildScoreBreakdown(
          fundamentals,
          close,
          priorSnapshot
        );

        results.push({
          ok: true,
          ticker,
          company: cikInfo.title,
          price: { close, date, source: "stooq" },
          fundamentals,
          metrics,
          valuation: {
            intrinsicPerShare: intrinsic,
            mos,
            mosRequired: strategy.mos_required,
          },
          scorecard: breakdown,
          verdict,
          explanation,
        });
      } catch (e: any) {
        results.push({ ok: false, ticker, error: e?.message ?? "Unknown error" });
      }

      if (delayMs && delayMs > 0) await sleep(delayMs);
    }

    return NextResponse.json({ ok: true, runAt, count: results.length, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
