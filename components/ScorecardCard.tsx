// The growth scorecard: this week's lever numbers for the current business, each with its change
// from last week, how far it can be trusted, and a 12-week trend. Reads the private snapshot on
// the server; never shows a number the adapter didn't report.
import { LEVERS } from "@/lib/workflows";
import { scorecardState } from "@/lib/scorecard";
import { formatValue, scorecardRows, sparkline, weekSeries, type MetricId, type ScorecardRow } from "@/lib/scorecard-metrics";
import { PILL } from "@/lib/tone";
import type { Profile } from "@/lib/profile";
import Link from "next/link";

import { RefreshScorecard } from "./ScorecardRefresh";

const QUALITY: Record<ScorecardRow["quality"], string> = {
  exact: "border-bb-border bg-transparent text-bb-dim",
  approx: "border-bb-warn/40 bg-bb-warn/10 text-bb-warn",
  missing: "border-bb-border bg-bb-surface text-bb-muted",
};

function Change({ row, currency }: { row: ScorecardRow; currency: string }) {
  if (row.change === null || row.change === 0) return null;
  const up = row.change > 0;
  const text = row.unit === "rate" ? `${(Math.abs(row.change) * 100).toFixed(1)} pts` : formatValue(row.unit, Math.abs(row.change), currency);
  return <span className="text-[10.5px] font-mono text-bb-dim">{up ? "▲" : "▼"} {text}</span>;
}

export function ScorecardCard({ business }: { business: Profile }) {
  const state = scorecardState(business.slug);
  const snap = state.snapshot;

  if (!snap) {
    return (
      <section className="card p-4 space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Growth scorecard</h2>
          {(state.connected || state.demo) && <RefreshScorecard />}
        </div>
        <p className="text-[12.5px] text-bb-muted max-w-[80ch]">
          {state.currencyChanged
            ? `The kept scorecard is in ${state.currencyChanged}, but this business now reports in ${business.currency}. Update the adapter to report ${business.currency}, then refresh; older weeks in ${state.currencyChanged} stay hidden.`
            : state.connected || state.demo
            ? state.failed
              ? "The last refresh failed, and there is no earlier snapshot to show."
              : "Connected, but not refreshed yet."
            : "HQ can't see this business's growth yet. Add a private read-only adapter in this business's HQ data folder (scorecard-connection.json); see the guides below. No numbers are shown until it reports."}
        </p>
        <p className="text-[12.5px]">
          <Link href="/guides/scorecard-billing" className="text-bb-blue hover:underline">Connect Stripe and the App Store</Link>
          <span className="text-bb-dim"> · </span>
          <Link href="/guides/scorecard" className="text-bb-blue hover:underline">How the scorecard works</Link>
        </p>
      </section>
    );
  }

  const rows = scorecardRows(snap);
  const series = (id: MetricId) => weekSeries(state.history, snap.weeks, id, 12);
  const levers = (Object.keys(LEVERS) as (keyof typeof LEVERS)[]).filter((l) => rows.some((r) => r.lever === l));

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-[15px] font-semibold">Growth scorecard</h2>
          <span className="text-[10.5px] text-bb-dim font-mono">
            {snap.weeks[0].week} · observed {snap.observedAt.slice(0, 16).replace("T", " ")} UTC
          </span>
          {state.demo && <span className={`${PILL} border-bb-violet/40 bg-bb-violet/10 text-bb-violet`}>demo data</span>}
          {state.stale && <span className={`${PILL} border-bb-warn/40 bg-bb-warn/10 text-bb-warn`}>stale</span>}
          {state.failed && <span className={`${PILL} border-bb-danger/40 bg-bb-danger/10 text-bb-danger`}>last refresh failed</span>}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/guides/scorecard-billing" className="text-[11.5px] text-bb-muted hover:text-bb-fg">Connect billing →</Link>
          <RefreshScorecard />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {levers.map((lever) => (
          <div key={lever} className="rounded-lg border border-bb-border/70 p-3 space-y-2.5 min-w-0">
            <div className="eyebrow">{LEVERS[lever].name}</div>
            {rows
              .filter((r) => r.lever === lever)
              .map((r) => {
                const points = sparkline(series(r.id), 64, 16);
                return (
                  <div key={r.id} className="space-y-0.5" title={r.note || undefined}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11.5px] text-bb-muted truncate">{r.label}</span>
                      <span className={`${PILL} ${QUALITY[r.quality]}`}>{r.quality}</span>
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className={`text-[17px] font-semibold tabular-nums ${r.value === null ? "text-bb-dim" : ""}`}>
                          {formatValue(r.unit, r.value, snap.currency)}
                        </span>
                        <Change row={r} currency={snap.currency} />
                      </div>
                      {points && (
                        <svg width="64" height="16" viewBox="-1 -1 66 18" aria-hidden className="shrink-0 text-bb-accent">
                          <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    {r.quality === "missing" && r.note && <p className="text-[10.5px] text-bb-dim leading-snug">{r.note}</p>}
                    {r.breakdown && r.breakdown.length > 0 && r.value !== null && (
                      <p className="text-[10.5px] text-bb-dim leading-snug truncate">
                        {r.breakdown.map((b) => `${b.label} ${formatValue(r.unit, b.value, snap.currency)}`).join(" · ")}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </section>
  );
}
