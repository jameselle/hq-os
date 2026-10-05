// The analytics board on the Data & Analytics tab: every chart the owner needs for one business. Each workflow is
// judged by one or more numbers (lib/analytics-metrics.ts); this draws every number that is measured, lever by lever,
// says what each unmeasured one needs, and ends with which workflows have a number at all. Data: lib/analytics.ts.
import Link from "next/link";

import { AnalyticsRefresh } from "@/components/AnalyticsRefresh";
import { Card, Change } from "@/components/AnalyticsCard";
import { analyticsBoard, type Board, type BoardMetric } from "@/lib/analytics";
import { formatAnalytics, isRecurring, WORKFLOW_ANALYTICS, type AnalyticsId } from "@/lib/analytics-metrics";
import { timeLabel } from "@/lib/lifecycle-status";
import type { Profile } from "@/lib/profile";
import { LEVERS, WORKFLOWS, workflowSlug, type Lever } from "@/lib/workflows";


const LEVER_TEXT: Record<Lever, string> = { get: "text-bb-teal", keep: "text-bb-blue", expand: "text-bb-violet", base: "text-bb-muted" };
const ORDER: Lever[] = ["get", "keep", "expand", "base"];

/** The headline row: the numbers an owner checks first, by business model. */
const HEADLINE_RECURRING: AnalyticsId[] = ["mrr", "paying_customers", "new_signups", "activation_rate", "paying_churn_rate", "weekly_active_rate"];
const HEADLINE_OTHER: AnalyticsId[] = ["revenue", "sales", "followers", "views_per_post", "posts_published", "link_clicks"];

function Headline({ board }: { board: Board }) {
  const by = new Map(board.metrics.map((m) => [m.id, m]));
  // The model's headline numbers that apply here, topped up with other measured Get and Keep numbers.
  const first = (isRecurring(board.business.model) ? HEADLINE_RECURRING : HEADLINE_OTHER).filter((id) => by.get(id)!.status !== "na");
  const extra = board.metrics.filter((m) => m.status === "measured" && !first.includes(m.id) && (m.def.lever === "get" || m.def.lever === "keep")).map((m) => m.id);
  const ids = [...first, ...extra].slice(0, 6);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {ids.map((id) => {
        const x = by.get(id)!;
        const measured = x.status === "measured";
        return (
          <a key={id} href={measured ? `#m-${id}` : `#todo-${x.def.lever}`} className="card block p-3 hover:border-bb-blue/40">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">{x.def.label}</div>
            <div className={`mt-1 text-[20px] font-semibold tabular-nums ${measured ? "" : "text-bb-dim"}`}>{measured ? formatAnalytics(x.def.unit, x.value, board.business.currency) : "—"}</div>
            <div className="mt-0.5">{measured ? <Change x={x} currency={board.business.currency} /> : <span className="text-[10.5px] text-bb-dim">not measured</span>}</div>
          </a>
        );
      })}
    </div>
  );
}

function LeverSection({ lever, board }: { lever: Lever; board: Board }) {
  const mine = board.metrics.filter((m) => m.def.lever === lever);
  const measured = mine.filter((m) => m.status === "measured");
  const todo = mine.filter((m) => m.status === "missing");
  if (!measured.length && !todo.length) return null;
  return (
    <section aria-labelledby={`lever-${lever}`} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-bb-border pb-2">
        <h3 id={`lever-${lever}`} className={`text-[16px] font-semibold ${LEVER_TEXT[lever]}`}>{LEVERS[lever].name}</h3>
        <span className="font-mono text-[10.5px] text-bb-dim">{measured.length} measured · {todo.length} not yet</span>
      </div>
      {measured.length ? (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {measured.map((x) => <div key={x.id} id={`m-${x.id}`} className="min-w-0 scroll-mt-4"><Card x={x} currency={board.business.currency} /></div>)}
        </div>
      ) : <p className="text-[12.5px] text-bb-muted">Nothing on this lever is measured yet.</p>}
      {todo.length > 0 && (
        <details id={`todo-${lever}`} className="card px-4 py-2.5 scroll-mt-4">
          <summary className="cursor-pointer text-[12.5px] text-bb-muted hover:text-bb-fg">{todo.length} not measured yet, and what each needs</summary>
          <ul className="mt-2 divide-y divide-bb-border/60">
            {todo.map((x) => (
              <li key={x.id} className="grid gap-1 py-2 md:grid-cols-[14rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-3">
                <span className="text-[12.5px] font-medium">{x.def.label}</span>
                <span className="text-[11.5px] text-bb-muted">{x.def.needs}</span>
                <span className="text-[11px] text-bb-dim">{x.note}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function WorkflowCoverage({ board }: { board: Board }) {
  const by = new Map(board.metrics.map((m) => [m.id, m]));
  const dot = (s: BoardMetric["status"]) => s === "measured" ? "●" : s === "na" ? "–" : "○";
  const tone = (s: BoardMetric["status"]) => s === "measured" ? "border-bb-accent/30 text-bb-fg" : s === "na" ? "border-bb-border text-bb-dim line-through" : "border-bb-border text-bb-muted";
  return (
    <section aria-labelledby="wf-h" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-bb-border pb-2">
        <h3 id="wf-h" className="text-[16px] font-semibold">Every workflow and its numbers</h3>
        <span className="font-mono text-[10.5px] text-bb-dim">{board.coverage.workflowsMeasured} of {board.coverage.workflows} workflows have a measured number</span>
      </div>
      <div className="card divide-y divide-bb-border/60 px-4 py-1">
        {ORDER.map((lever) => WORKFLOWS.filter((w) => w.levers[0] === lever).map((w) => {
          const ids = WORKFLOW_ANALYTICS[w.title] ?? [];
          return (
            <div key={w.title} className="grid gap-1.5 py-2 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-3">
              <div className="flex items-baseline gap-2">
                <span aria-hidden className={`text-[10px] ${LEVER_TEXT[lever]}`}>■</span>
                <Link href={`/workflows/${workflowSlug(w.title)}`} className="text-[12.5px] hover:text-bb-blue">{w.title}</Link>
              </div>
              <ul className="flex flex-wrap gap-1">
                {ids.map((id) => {
                  const x = by.get(id)!;
                  return (
                    <li key={id}>
                      <a href={x.status === "measured" ? `#m-${id}` : `#todo-${x.def.lever}`} title={x.status === "measured" ? formatAnalytics(x.def.unit, x.value, board.business.currency) : x.note}
                        className={`inline-block rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] ${tone(x.status)}`}>
                        <span aria-hidden className={x.status === "measured" ? "text-bb-accent" : ""}>{dot(x.status)} </span>{x.def.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        }))}
      </div>
      <p className="text-[11px] text-bb-dim"><span className="text-bb-accent">●</span> measured · ○ not measured yet · – doesn't apply to this business</p>
    </section>
  );
}

export function AnalyticsBoard({ business }: { business: Profile }) {
  const board = analyticsBoard(business.slug);
  const na = board.metrics.filter((m) => m.status === "na");
  const pct = board.coverage.applicable ? Math.round((board.coverage.measured / board.coverage.applicable) * 100) : 0;
  return (
    <section id="analytics" aria-labelledby="analytics-h" className="space-y-7 min-w-0 scroll-mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="eyebrow">Analytics · {board.business.name}{board.business.demo && " · demo data"}</div>
          <h2 id="analytics-h" className="text-xl font-semibold">Every number, every workflow</h2>
          <p className="max-w-[80ch] text-[12.5px] text-bb-muted">
            {board.coverage.measured} of {board.coverage.applicable} numbers measured ({pct}%) · {board.coverage.workflowsMeasured} of {board.coverage.workflows} workflows have one
            {board.observedAt && <> · read {timeLabel(board.observedAt, business.timezone)}</>}
            {board.stale && <span className="text-bb-warn"> · over a day old</span>}
            {board.failed && <span className="text-bb-danger"> · the last adapter run failed, so the previous readings are shown</span>}
          </p>
        </div>
        <AnalyticsRefresh />
      </div>

      {/* The growth scorecard above already shows the headline numbers when it reports. */}
      {!board.metrics.some((m) => m.from === "scorecard" && m.status === "measured") && <Headline board={board} />}

      {ORDER.map((l) => <LeverSection key={l} lever={l} board={board} />)}

      <WorkflowCoverage board={board} />

      {na.length > 0 && (
        <details className="card px-4 py-2.5">
          <summary className="cursor-pointer text-[12.5px] text-bb-muted hover:text-bb-fg">{na.length} {na.length === 1 ? "number doesn't" : "numbers don't"} apply to {board.business.name}</summary>
          <ul className="mt-2 flex flex-wrap gap-1">
            {na.map((x) => <li key={x.id} title={x.note} className="rounded-md border border-bb-border px-1.5 py-0.5 font-mono text-[10.5px] text-bb-dim">{x.def.label}</li>)}
          </ul>
        </details>
      )}
      <p className="text-[11px] text-bb-dim">
        Sources: the scorecard's weekly history, HQ's own records, and {board.connected ? "this business's analytics adapter" : "an analytics adapter once one is connected"}. Refreshed daily at 06:00 with the scorecard. <Link href="/guides/analytics" className="hover:text-bb-fg">How it works</Link>
      </p>
    </section>
  );
}
