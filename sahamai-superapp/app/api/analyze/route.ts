import { NextResponse } from "next/server";
import { z } from "zod";

import { getCikForTicker, getCompanyFacts } from "@/lib/sec";
import { getLatestCloseUS } from "@/lib/stooq";
import { extractUsFundamentals } from "@/lib/usXbrlExtract";
import { buildScoreBreakdown, computeMetrics } from "@/lib/score";
import strategy from "@/data/strategy.us.json";

const Query = z.object({ ticker: z.string().min(1).max(10) });

export async function GET(req: Request) {
  try {
    const runAt = new Date().toISOString();
    const { searchParams } = new URL(req.url);
    const parsed = Query.safeParse({ ticker: searchParams.get("ticker") ?? "" });
    if (!parsed.success) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });

    const ticker = parsed.data.ticker.toUpperCase();
    const cikInfo = await getCikForTicker(ticker);
    if (!cikInfo) return NextResponse.json({ error: `CIK tidak ditemukan untuk ${ticker}` }, { status: 404 });

    const [{ close, date }, facts] = await Promise.all([
      getLatestCloseUS(ticker),
      getCompanyFacts(cikInfo.cik),
    ]);

    const fundamentals = extractUsFundamentals(ticker, cikInfo.cik, facts);
    const metrics = computeMetrics(fundamentals, close);

    const priorSnapshot = null; // future: load from DB
    const { breakdown, verdict, mos, intrinsic, explanation } = buildScoreBreakdown(fundamentals, close, priorSnapshot);

    return NextResponse.json({
      ok: true,
      runAt,
      ticker,
      company: cikInfo.title,
      price: { close, date, source: "stooq" },
      fundamentals,
      metrics,
      valuation: { intrinsicPerShare: intrinsic, mos, mosRequired: strategy.mos_required },
      scorecard: breakdown,
      verdict,
      explanation,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
