import strategy from "@/data/strategy.us.json";
import type { UsFundamentals } from "@/lib/usXbrlExtract";

export type ScoreBreakdown = {
  total: number;
  quality: { score: number; reasons: string[] };
  financial: { score: number; reasons: string[] };
  value: { score: number; reasons: string[] };
  integrity: { score: number; reasons: string[] };
};

function safeDiv(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

export function computeMetrics(f: UsFundamentals, price: number) {
  const mcap = f.shares ? price * f.shares : null;
  const avgEq = f.equity !== null && f.equityPrev !== null ? (f.equity + f.equityPrev) / 2 : f.equity;
  const roe = safeDiv(f.netIncomeTTM, avgEq);
  const pe = mcap && f.netIncomeTTM && f.netIncomeTTM > 0 ? mcap / f.netIncomeTTM : null;
  const pb = mcap && f.equity && f.equity > 0 ? mcap / f.equity : null;
  const fcf = f.ocfTTM !== null && f.capexTTM !== null ? f.ocfTTM - f.capexTTM : null;
  const fcfYield = fcf !== null && mcap ? fcf / mcap : null;
  return { mcap, roe, pe, pb, fcf, fcfYield };
}

export function intrinsicValuePerShare(f: UsFundamentals, price: number) {
  if (!f.netIncomeTTM || !f.shares || f.netIncomeTTM <= 0 || f.shares <= 0) return null;
  const eps = f.netIncomeTTM / f.shares;
  const { roe } = computeMetrics(f, price);
  let fairPE = strategy.fair_pe.base;
  if (roe !== null) {
    if (roe >= 0.20) fairPE = strategy.fair_pe.roe_ge_20;
    else if (roe >= 0.15) fairPE = strategy.fair_pe.roe_ge_15;
    else if (roe < 0.08) fairPE = strategy.fair_pe.roe_lt_8;
  }
  return eps * fairPE;
}

export function buildScoreBreakdown(
  f: UsFundamentals,
  price: number,
  priorSnapshot: any | null
): { breakdown: ScoreBreakdown; verdict: string; mos: number | null; intrinsic: number | null; explanation: string[] } {
  const weights = strategy.scoring.weights;
  const { roe, pe, pb, fcfYield } = computeMetrics(f, price);

  const explanation: string[] = [];
  const hardWarn = f.warnings.some((w) => /terlalu besar|di luar range/i.test(w));

  // QUALITY
  const qReasons: string[] = [];
  let q = 0.5;
  if (roe !== null) {
    if (roe >= strategy.scoring.quality.roe_great) { q = 1.0; qReasons.push(`ROE kuat (${(roe*100).toFixed(1)}%).`); }
    else if (roe >= strategy.scoring.quality.roe_good) { q = 0.8; qReasons.push(`ROE baik (${(roe*100).toFixed(1)}%).`); }
    else if (roe < 0.08) { q = 0.3; qReasons.push(`ROE rendah (${(roe*100).toFixed(1)}%) → cek apakah sementara.`); }
    else { q = 0.55; qReasons.push(`ROE moderat (${(roe*100).toFixed(1)}%).`); }
  } else {
    q = 0.4;
    qReasons.push("ROE tidak tersedia → skor kualitas ditahan.");
  }
  if (fcfYield !== null) {
    if (fcfYield >= strategy.scoring.quality.fcf_yield_great) { q = Math.min(1, q + 0.15); qReasons.push(`FCF yield tinggi (${(fcfYield*100).toFixed(1)}%).`); }
    else if (fcfYield >= strategy.scoring.quality.fcf_yield_good) { q = Math.min(1, q + 0.08); qReasons.push(`FCF yield lumayan (${(fcfYield*100).toFixed(1)}%).`); }
  }

  // FINANCIAL
  const fReasons: string[] = [];
  let fin = 0.55;
  const dte = (f.debt !== null && f.equity !== null && f.equity > 0) ? (f.debt / f.equity) : null;
  if (dte !== null) {
    if (dte >= strategy.scoring.financial.debt_to_equity_fail) { fin = 0.2; fReasons.push(`Debt/Equity tinggi (${dte.toFixed(2)}x).`); }
    else if (dte >= strategy.scoring.financial.debt_to_equity_warn) { fin = 0.4; fReasons.push(`Debt/Equity agak tinggi (${dte.toFixed(2)}x).`); }
    else { fin = 0.8; fReasons.push(`Debt/Equity sehat (${dte.toFixed(2)}x).`); }
  } else {
    fin = 0.45;
    fReasons.push("Debt/Equity tidak bisa dihitung (data debt/equity kurang).");
  }

  // VALUE
  const vReasons: string[] = [];
  let val = 0.5;
  if (pe !== null) {
    if (pe <= strategy.scoring.value.pe_great) { val = 0.95; vReasons.push(`PE rendah (${pe.toFixed(1)}x).`); }
    else if (pe <= strategy.scoring.value.pe_good) { val = 0.75; vReasons.push(`PE wajar (${pe.toFixed(1)}x).`); }
    else { val = 0.35; vReasons.push(`PE tinggi (${pe.toFixed(1)}x).`); }
  } else {
    val = 0.35;
    vReasons.push("PE tidak tersedia (net income missing/negatif).");
  }
  if (pb !== null && pb >= strategy.scoring.value.pb_warn) {
    vReasons.push(`PB tinggi (${pb.toFixed(1)}x) → butuh growth/quality untuk membenarkan.`);
    val = Math.max(0.15, val - 0.12);
  }

  // INTEGRITY
  const iReasons: string[] = [];
  let integ = 0.55;
  const priorShares = priorSnapshot?.fundamentals?.shares ? Number(priorSnapshot.fundamentals.shares) : null;
  if (f.shares !== null && priorShares !== null && priorShares > 0) {
    const dil = (f.shares - priorShares) / priorShares;
    if (dil >= strategy.scoring.integrity.dilution_fail) { integ = 0.2; iReasons.push(`Dilusi tinggi (+${(dil*100).toFixed(1)}%).`); }
    else if (dil >= strategy.scoring.integrity.dilution_warn) { integ = 0.4; iReasons.push(`Ada dilusi (+${(dil*100).toFixed(1)}%).`); }
    else { integ = 0.7; iReasons.push("Tidak ada indikasi dilusi besar (vs snapshot sebelumnya)."); }
  } else {
    iReasons.push("Belum bisa cek dilusi (belum ada snapshot sebelumnya).");
  }

  if (hardWarn) {
    explanation.push("⚠️ Ada anomaly data → verdict ditahan (anti 'pede salah').");
    q = Math.min(q, 0.45);
    fin = Math.min(fin, 0.45);
    val = Math.min(val, 0.45);
    integ = Math.min(integ, 0.45);
  }

  const total = weights.quality * q + weights.financial * fin + weights.value * val + weights.integrity * integ;
  const intrinsic = intrinsicValuePerShare(f, price);
  const mos = intrinsic ? (intrinsic / price - 1) : null;

  let verdict = "NEEDS_REVIEW";
  if (!hardWarn && mos !== null) {
    if (mos >= strategy.mos_required) verdict = "BUY";
    else if (mos >= 0) verdict = "HOLD";
    else verdict = "AVOID";
  }

  const breakdown: ScoreBreakdown = {
    total: Math.round(total * 100),
    quality: { score: Math.round(q * 100), reasons: qReasons },
    financial: { score: Math.round(fin * 100), reasons: fReasons },
    value: { score: Math.round(val * 100), reasons: vReasons },
    integrity: { score: Math.round(integ * 100), reasons: iReasons },
  };

  return { breakdown, verdict, mos, intrinsic, explanation };
}
