"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { ScorecardView } from "@/components/ScorecardView";

import watchlist from "@/data/watchlist.us.json";

const TickerSchema = z.string().min(1).max(10).regex(/^[A-Za-z.\-]+$/);

export default function Page() {
  const [ticker, setTicker] = useState("AAPL");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [daily, setDaily] = useState<any | null>(null);
  const [dailyErr, setDailyErr] = useState<string | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyRunning, setDailyRunning] = useState(false);

  const tone = useMemo(() => {
    const v = data?.verdict;
    if (v === "BUY") return "green";
    if (v === "HOLD") return "yellow";
    if (v === "AVOID") return "red";
    return "zinc";
  }, [data]);

  useEffect(() => {
    // load latest daily snapshot if available
    loadDaily();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDaily() {
    setDailyErr(null);
    setDailyLoading(true);
    try {
      const res = await fetch(`/daily/latest.json?ts=${Date.now()}`);
      if (!res.ok) throw new Error("Belum ada snapshot harian. Jalankan GitHub Actions dulu.");
      const j = await res.json();
      setDaily(j);
    } catch (e: any) {
      setDailyErr(e?.message ?? "Error");
    } finally {
      setDailyLoading(false);
    }
  }

  async function runWatchlistNow() {
    setDailyErr(null);
    setDailyRunning(true);
    try {
      const res = await fetch(`/api/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(watchlist),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Batch failed");
      setDaily(j);
    } catch (e: any) {
      setDailyErr(e?.message ?? "Error");
    } finally {
      setDailyRunning(false);
    }
  }

  async function run() {
    setErr(null);
    setData(null);
    const t = ticker.trim().toUpperCase();
    const ok = TickerSchema.safeParse(t);
    if (!ok.success) {
      setErr("Ticker tidak valid. Contoh: AAPL, MSFT, GOOGL");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/analyze?ticker=${encodeURIComponent(t)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Failed");
      setData(j);
    } catch (e: any) {
      setErr(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-2xl font-semibold tracking-tight">US Value Investing Analyzer</div>
            <div className="mt-1 text-sm text-zinc-600">
              Ticker → ambil harga (Stooq) + fundamental (SEC XBRL) → scoring + MOS + alasan.
            </div>
          </div>

          <div className="flex gap-2">
            <input
              className="w-36 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="AAPL"
            />
            <button
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              disabled={loading}
              onClick={run}
            >
              {loading ? "Running..." : "Analyze"}
            </button>
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border bg-red-50 p-3 text-sm text-red-800">
            {err}
            <div className="mt-1 text-xs text-red-700">
              Pastikan environment variable <code className="px-1">SEC_USER_AGENT</code> sudah diset di hosting.
            </div>
          </div>
        ) : null}

        {data ? (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <Badge tone={tone as any}>{data.verdict}</Badge>
            <div className="text-zinc-600">
              {data.ticker} — {data.company}
            </div>
          </div>
        ) : null}
      </div>

      <DailyWatchlist
        daily={daily}
        loading={dailyLoading}
        running={dailyRunning}
        error={dailyErr}
        onReload={loadDaily}
        onRunNow={runWatchlistNow}
        onPick={(t) => {
          setTicker(t);
          // run analyze immediately for convenience
          setTimeout(() => {
            void (async () => {
              setErr(null);
              setData(null);
              setLoading(true);
              try {
                const res = await fetch(`/api/analyze?ticker=${encodeURIComponent(t)}`);
                const j = await res.json();
                if (!res.ok) throw new Error(j?.error ?? "Failed");
                setData(j);
              } catch (e: any) {
                setErr(e?.message ?? "Error");
              } finally {
                setLoading(false);
              }
            })();
          }, 0);
        }}
      />

      {data ? <ScorecardView data={data} /> : <EmptyState />}
    </div>
  );
}

function DailyWatchlist({
  daily,
  loading,
  running,
  error,
  onReload,
  onRunNow,
  onPick,
}: {
  daily: any | null;
  loading: boolean;
  running: boolean;
  error: string | null;
  onReload: () => void;
  onRunNow: () => void;
  onPick: (ticker: string) => void;
}) {
  const items = useMemo(() => {
    const raw: any[] = daily?.results ?? [];
    const okOnly = raw.filter((x) => x && x.ok);
    function vRank(v: string) {
      if (v === "BUY") return 0;
      if (v === "HOLD") return 1;
      if (v === "AVOID") return 2;
      return 3;
    }
    return okOnly
      .map((x) => {
        const mos = typeof x?.valuation?.mos === "number" ? x.valuation.mos : null;
        const score = typeof x?.scorecard?.total === "number" ? x.scorecard.total : null;
        return { ...x, _mos: mos, _score: score };
      })
      .sort((a, b) => {
        const vr = vRank(a.verdict) - vRank(b.verdict);
        if (vr !== 0) return vr;
        const mosA = a._mos ?? -999;
        const mosB = b._mos ?? -999;
        if (mosB !== mosA) return mosB - mosA;
        const scA = a._score ?? -999;
        const scB = b._score ?? -999;
        return scB - scA;
      });
  }, [daily]);

  return (
    <Card title="Daily Watchlist (US)" subtitle="Snapshot hasil batch screening. Bisa auto-update harian via GitHub Actions atau run manual di sini.">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
          disabled={loading}
          onClick={onReload}
        >
          {loading ? "Loading..." : "Reload snapshot"}
        </button>
        <button
          className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
          disabled={running}
          onClick={onRunNow}
        >
          {running ? "Running batch..." : "Run watchlist now"}
        </button>
        <div className="text-xs text-zinc-500">
          {daily?.runAt ? `runAt: ${daily.runAt}` : ""}
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-zinc-500">
              <th className="py-2 pr-3">Verdict</th>
              <th className="py-2 pr-3">Ticker</th>
              <th className="py-2 pr-3">MOS</th>
              <th className="py-2 pr-3">Score</th>
              <th className="py-2 pr-3">Price</th>
              <th className="py-2 pr-3">Quick reasons</th>
              <th className="py-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="py-3 text-zinc-600" colSpan={7}>
                  Belum ada data watchlist. Klik <b>Run watchlist now</b> atau setup GitHub Actions untuk update otomatis.
                </td>
              </tr>
            ) : null}

            {items.map((x) => {
              const v = x.verdict;
              const tone = v === "BUY" ? "green" : v === "HOLD" ? "yellow" : v === "AVOID" ? "red" : "zinc";
              const mos = typeof x._mos === "number" ? `${(x._mos * 100).toFixed(1)}%` : "-";
              const score = typeof x._score === "number" ? x._score : "-";
              const price = typeof x?.price?.close === "number" ? x.price.close.toFixed(2) : "-";
              const reasons: string[] = [];
              if (x?.scorecard?.quality?.reasons?.[0]) reasons.push(`Q: ${x.scorecard.quality.reasons[0]}`);
              if (x?.scorecard?.value?.reasons?.[0]) reasons.push(`V: ${x.scorecard.value.reasons[0]}`);
              if (x?.scorecard?.financial?.reasons?.[0]) reasons.push(`F: ${x.scorecard.financial.reasons[0]}`);
              return (
                <tr key={x.ticker} className="border-b align-top">
                  <td className="py-3 pr-3">
                    <Badge tone={tone as any}>{v}</Badge>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="font-medium">{x.ticker}</div>
                    <div className="text-xs text-zinc-500">{x.company}</div>
                  </td>
                  <td className="py-3 pr-3 font-medium">{mos}</td>
                  <td className="py-3 pr-3">{score}</td>
                  <td className="py-3 pr-3">{price}</td>
                  <td className="py-3 pr-3 text-zinc-700">{reasons.slice(0, 3).join(" ")}</td>
                  <td className="py-3 pr-0 text-right">
                    <button
                      className="rounded-xl border bg-white px-3 py-2 text-xs hover:bg-zinc-50"
                      onClick={() => onPick(x.ticker)}
                    >
                      Analyze
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-zinc-500">
        Note: tombol "Run watchlist now" jalan di serverless → bisa lebih lambat jika tickers banyak. Untuk harian, lebih stabil pakai GitHub Actions.
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card title="MVP sesuai visi (awam, cepat, explainable)">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-700">
        <li>Otomatis tarik data terstruktur (SEC XBRL) + harga pasar.</li>
        <li>Hitung valuasi & MOS, lalu scoring dengan alasan per kategori.</li>
        <li>Kalau data janggal, verdict ditahan agar tidak overconfident.</li>
      </ol>
      <div className="mt-3 text-xs text-zinc-500">Disclaimer: edukasi, bukan rekomendasi investasi.</div>
    </Card>
  );
}
