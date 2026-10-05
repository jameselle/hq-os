// Pure data shaping for a workflow's detail page and the lifecycle centre: which automated flows
// serve a workflow, what went out, what happened after, and whether the difference against the
// holdout is big enough to call. Client-safe: types only from lib/lifecycle, no node imports.
import type { FlowCount, LifecycleFlow, LifecycleSnapshot, LifecycleWorkflow } from "./lifecycle";
import type { Metric, MetricId } from "./scorecard-metrics";

/** Below this many people in either group a difference is noise, so the page says "too few to call". */
export const MIN_CALL = 20;

const DAY = 86400e3;
const key = (s: string) => s.trim().toLowerCase();

/** The flows that deliver for one workflow title, in snapshot order. */
export function flowsFor(title: string, snapshot: LifecycleSnapshot | null | undefined): LifecycleFlow[] {
  return (snapshot?.flows ?? []).filter((f) => f.serves === title);
}

/** A flow's days, oldest first, the newest `last` of them. */
export function recentDays(flow: LifecycleFlow, last = 60): LifecycleFlow["daily"] {
  return [...flow.daily].sort((a, b) => a.day.localeCompare(b.day)).slice(-last);
}

/** Sums of entered, sent and skipped over the given days. */
export function dayTotals(days: LifecycleFlow["daily"]) {
  return days.reduce((t, d) => ({ entered: t.entered + d.entered, sent: t.sent + d.sent, skipped: t.skipped + d.skipped }), { entered: 0, sent: 0, skipped: 0 });
}

/** Messages sent in the 30 days ending on the flow's newest day. */
export function sentLast30(flow: LifecycleFlow): number {
  if (!flow.daily.length) return 0;
  const newest = Math.max(...flow.daily.map((d) => Date.parse(d.day)));
  return flow.daily.filter((d) => newest - Date.parse(d.day) < 30 * DAY).reduce((n, d) => n + d.sent, 0);
}

/** A labelled count, matched without regard to case or spaces; 0 when absent. */
export const countOf = (rows: FlowCount[], label: string) => rows.find((r) => key(r.label) === key(label))?.count ?? 0;
const has = (rows: FlowCount[], label: string) => rows.some((r) => key(r.label) === key(label));

export type FunnelRow = { label: string; count: number; /** share of sent, 0..1, or null with nothing sent */ share: number | null };

/** The delivery rows as a funnel, each as a share of what was sent (the "sent" row, else the largest). */
export function funnel(flow: LifecycleFlow): FunnelRow[] {
  const base = has(flow.delivery, "sent") ? countOf(flow.delivery, "sent") : Math.max(0, ...flow.delivery.map((r) => r.count));
  return flow.delivery.map(({ label, count }) => ({ label, count, share: base > 0 ? count / base : null }));
}

export type Rate = { n: number; hit: number; /** hit/n, 0..1 */ rate: number | null };
const rate = (p: { n: number; hit: number }): Rate => ({ n: p.n, hit: p.hit, rate: p.n > 0 ? p.hit / p.n : null });

export type Lift = { /** emailed minus holdout, in percentage points, one decimal */ pts: number; /** false when either group has fewer than MIN_CALL people */ enough: boolean };

/** The difference between the emailed group and the holdout, in percentage points. Null without a holdout or with an empty group. */
export function lift(emailed: { n: number; hit: number } | null | undefined, holdout: { n: number; hit: number } | null | undefined): Lift | null {
  if (!emailed || !holdout || emailed.n <= 0 || holdout.n <= 0) return null;
  const pts = Math.round((emailed.hit / emailed.n - holdout.hit / holdout.n) * 1000) / 10;
  return { pts: Object.is(pts, -0) ? 0 : pts, enough: emailed.n >= MIN_CALL && holdout.n >= MIN_CALL };
}

/** "1 day" → 1, "7 days" → 7, "30 days" → 30, "2 weeks" → 14; unknown → null. */
export function windowDays(window: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(hour|day|week|month)s?\s*$/i.exec(window);
  if (!m) return null;
  const n = Number(m[1]), unit = m[2].toLowerCase();
  return unit === "hour" ? n / 24 : unit === "week" ? n * 7 : unit === "month" ? n * 30 : n;
}

export type OutcomeRow = { label: string; window: string; emailed: Rate; holdout: Rate | null; lift: Lift | null };
export type OutcomeGroup = { window: string; rows: OutcomeRow[] };

/** Outcomes grouped by window, shortest window first (unknown windows after, in the order they came). */
export function outcomeRows(flow: LifecycleFlow): OutcomeGroup[] {
  const groups: OutcomeGroup[] = [];
  for (const o of flow.outcomes) {
    const row: OutcomeRow = { label: o.label, window: o.window, emailed: rate(o.emailed), holdout: o.holdout ? rate(o.holdout) : null, lift: lift(o.emailed, o.holdout) };
    const g = groups.find((x) => x.window === o.window);
    if (g) g.rows.push(row); else groups.push({ window: o.window, rows: [row] });
  }
  const order = (w: string) => windowDays(w) ?? Infinity;
  return groups.map((g, i) => ({ g, i })).sort((a, b) => order(a.g.window) - order(b.g.window) || a.i - b.i).map(({ g }) => g);
}

/** The outcome with the most emailed people (the first of any tie): the one number a card leads with. */
export function headlineOutcome(flow: LifecycleFlow): OutcomeRow | null {
  let best: LifecycleFlow["outcomes"][number] | null = null;
  for (const o of flow.outcomes) if (!best || o.emailed.n > best.emailed.n) best = o;
  return best ? { label: best.label, window: best.window, emailed: rate(best.emailed), holdout: best.holdout ? rate(best.holdout) : null, lift: lift(best.emailed, best.holdout) } : null;
}

/** The per-message controls (snapshot.workflows) that belong to a flow: one per message id, or the flow's own id. */
export function controlsFor(flow: LifecycleFlow, workflows: LifecycleWorkflow[] = []): LifecycleWorkflow[] {
  const ids = new Set([flow.id, ...flow.messages.map((m) => m.id)]);
  return workflows.filter((w) => ids.has(w.id));
}

export type FlowSummary = {
  id: string; label: string; serves?: string; channel: LifecycleFlow["channel"]; mode: NonNullable<LifecycleFlow["mode"]> | null;
  sent30: number; sent: number; delivered: number; deliveredShare: number | null;
  clicked: number; unsubscribed: number; bouncedOrComplained: number; drafts: number;
  headline: OutcomeRow | null;
};

/** One flow's card on the lifecycle centre. Delivery counts are the flow's own (its reporting window). */
export function flowSummary(flow: LifecycleFlow, workflows: LifecycleWorkflow[] = []): FlowSummary {
  const sent = countOf(flow.delivery, "sent"), delivered = countOf(flow.delivery, "delivered");
  return {
    id: flow.id, label: flow.label, ...(flow.serves !== undefined ? { serves: flow.serves } : {}), channel: flow.channel, mode: flow.mode ?? null,
    sent30: sentLast30(flow), sent, delivered,
    deliveredShare: sent > 0 && has(flow.delivery, "delivered") ? delivered / sent : null,
    clicked: countOf(flow.delivery, "clicked"), unsubscribed: countOf(flow.delivery, "unsubscribed"),
    bouncedOrComplained: countOf(flow.delivery, "bounced") + countOf(flow.delivery, "complained"),
    drafts: controlsFor(flow, workflows).reduce((n, w) => n + (w.drafts ?? 0), 0),
    headline: headlineOutcome(flow),
  };
}

/** Totals across every flow card, for the centre's header row. */
export function summaryTotals(xs: FlowSummary[]) {
  const sum = (f: (x: FlowSummary) => number) => xs.reduce((n, x) => n + f(x), 0);
  const sent = sum((x) => x.sent), withDelivered = xs.filter((x) => x.deliveredShare !== null);
  const sentWithDelivered = withDelivered.reduce((n, x) => n + x.sent, 0);
  return {
    flows: xs.length, live: xs.filter((x) => x.mode === "auto").length,
    sent30: sum((x) => x.sent30), sent, clicked: sum((x) => x.clicked), unsubscribed: sum((x) => x.unsubscribed),
    bouncedOrComplained: sum((x) => x.bouncedOrComplained), drafts: sum((x) => x.drafts),
    deliveredShare: sentWithDelivered > 0 ? withDelivered.reduce((n, x) => n + x.delivered, 0) / sentWithDelivered : null,
  };
}

/** A metric's weekly values, oldest first: kept history plus the snapshot's own weeks (which win), the newest `last`. */
export function metricHistory(history: { week: string; metrics: Metric[] }[], weeks: { week: string; metrics: Metric[] }[], id: MetricId, last = 26): { week: string; value: number | null }[] {
  const byWeek = new Map<string, number | null>();
  for (const w of [...history, ...weeks]) byWeek.set(w.week, w.metrics.find((m) => m.id === id)?.value ?? null);
  return [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-last).map(([week, value]) => ({ week, value }));
}

/** 0.4123 → "41.2%"; null → "n/a". */
export const pct = (share: number | null, dp = 1) => (share === null ? "n/a" : `${(share * 100).toFixed(dp)}%`);

/** "+3.4 pts", "-1.0 pts", "0.0 pts": plain ASCII signs. */
export const pts = (l: Lift) => `${l.pts > 0 ? "+" : ""}${l.pts.toFixed(1)} pts`;
