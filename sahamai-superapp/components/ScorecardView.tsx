import { Card } from "@/components/Card";
import { ScoreBar } from "@/components/ScoreBar";
import { ReasonList } from "@/components/ReasonList";

export function ScorecardView({ data }: { data: any }) {
  const sc = data?.scorecard;
  if (!sc) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Verdict & Margin of Safety" right={<div className="text-xs text-zinc-500">Explainable</div>}>
        <div className="flex items-center justify-between">
          <div className="text-2xl font-semibold">{data.verdict}</div>
          <div className="text-sm text-zinc-600">
            Score: <span className="font-medium">{sc.total}</span>/100
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-zinc-50 p-3">
            <div className="text-zinc-600">Price</div>
            <div className="font-medium">${Number(data.price.close).toFixed(2)}</div>
            <div className="text-xs text-zinc-500">{data.price.date}</div>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <div className="text-zinc-600">Intrinsic (heuristic)</div>
            <div className="font-medium">
              {data.valuation.intrinsicPerShare ? `$${Number(data.valuation.intrinsicPerShare).toFixed(2)}` : "—"}
            </div>
            <div className="text-xs text-zinc-500">
              MOS {data.valuation.mos !== null ? `${(Number(data.valuation.mos) * 100).toFixed(1)}%` : "—"} (req{" "}
              {Math.round(Number(data.valuation.mosRequired) * 100)}%)
            </div>
          </div>
        </div>

        {data.explanation?.length ? (
          <div className="mt-3 rounded-xl border bg-white p-3">
            <div className="text-sm font-medium">Why this verdict</div>
            <ReasonList items={data.explanation} />
          </div>
        ) : null}

        {data.fundamentals?.warnings?.length ? (
          <div className="mt-3 rounded-xl border bg-yellow-50 p-3">
            <div className="text-sm font-medium text-yellow-900">Data quality warnings</div>
            <ReasonList items={data.fundamentals.warnings} />
          </div>
        ) : null}
      </Card>

      <Card title="Score Breakdown (with reasons)">
        <div className="space-y-4">
          {(["quality", "financial", "value", "integrity"] as const).map((k) => (
            <div key={k} className="rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium capitalize">{k}</div>
                <div className="text-sm text-zinc-600">{sc[k].score}/100</div>
              </div>
              <div className="mt-2">
                <ScoreBar value={sc[k].score} />
              </div>
              <ReasonList items={sc[k].reasons} />
            </div>
          ))}
        </div>
      </Card>

      <Card title="Key Metrics">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Metric label="ROE" value={fmtPct(data.metrics.roe)} />
          <Metric label="P/E" value={fmtX(data.metrics.pe)} />
          <Metric label="P/B" value={fmtX(data.metrics.pb)} />
          <Metric label="FCF Yield" value={fmtPct(data.metrics.fcfYield)} />
        </div>
        <div className="mt-3 text-xs text-zinc-500">
          Evidence end dates — Equity: {data.fundamentals.equityEnd ?? "—"}, Shares: {data.fundamentals.sharesEnd ?? "—"},
          Net income: {data.fundamentals.evidence.netIncomeSource}.
        </div>
      </Card>

      <Card title="Evidence Links">
        <div className="text-sm">
          <a className="text-blue-600 hover:underline" href={data.fundamentals.evidence.secCompanyFactsUrl} target="_blank">
            SEC Company Facts (XBRL JSON)
          </a>
          <div className="mt-2 text-xs text-zinc-500">
            Catatan: Sistem mengutamakan data terstruktur. Jika ada missing/anomaly, verdict otomatis ditahan.
          </div>
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3">
      <div className="text-zinc-600">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
function fmtPct(x: any) {
  if (typeof x !== "number") return "—";
  return `${(x * 100).toFixed(1)}%`;
}
function fmtX(x: any) {
  if (typeof x !== "number") return "—";
  return `${x.toFixed(1)}x`;
}
