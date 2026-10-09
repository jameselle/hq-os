// Routing by lever: which growth lever is weakest this week, and which workflow moves it. Reads a business's
// scorecard weeks (newest first), compares each headline number with its own trailing 4-week average (and a few
// hard limits), and picks the worst. The CEO turns the answer into one finding for the workflow's owner.
// Client-safe: no node imports.
import { formatValue, METRICS, type MetricId } from "./scorecard-metrics";
import { WORKFLOW_ANALYTICS } from "./analytics-metrics";
import { LOST_REST_DAYS, PLAYBOOKS } from "./playbooks";
import { WORKFLOWS, type Lever } from "./workflows";

type Direction = "falls" | "rises"; // which way is bad
export type Route = { metric: MetricId; bad: Direction; workflow: string; limit?: number };

/** Headline numbers the CEO routes on, the direction that's bad, and the workflow that moves each. */
export const ROUTES: Route[] = [
  { metric: "activation_rate", bad: "falls", workflow: "Onboarding to first value" },
  { metric: "paying_churn_rate", bad: "rises", workflow: "Churn early warning", limit: 0.05 },
  { metric: "payment_recovery_rate", bad: "falls", workflow: "Failed payment recovery" },
  { metric: "failed_payments", bad: "rises", workflow: "Failed payment recovery" },
  { metric: "new_paying", bad: "falls", workflow: "Trial that didn't convert" },
  { metric: "new_signups", bad: "falls", workflow: "Customer proof" },
  { metric: "nrr", bad: "falls", workflow: "Usage limit to upgrade", limit: 1 },
  { metric: "upgrades", bad: "falls", workflow: "Usage limit to upgrade" },
];

const THRESHOLD = 0.15; // a 15% move against the trailing average before it counts
const MIN_COUNT_BASELINE = 5; // counts this small are noise

export type Weakest = {
  lever: Lever; metric: MetricId; label: string; unit: string; value: number; baseline: number;
  workflow: string; owner: string; why: string;
};
type Week = { week: string; metrics: { id: string; value: number | null }[] };

export function weakestLever(weeks: Week[], currency = "USD"): Weakest | null {
  let best: (Weakest & { score: number }) | null = null;
  for (const r of ROUTES) {
    const series = weeks.map((w) => w.metrics.find((m) => m.id === r.metric)?.value ?? null);
    const value = series[0];
    if (value === null || value === undefined) continue;
    const past = series.slice(1, 5).filter((v): v is number => v !== null);
    const { unit, label, lever } = METRICS[r.metric];
    const baseline = past.length >= 2 ? past.reduce((a, v) => a + v, 0) / past.length : NaN;
    let score = 0, why = "";
    if (Number.isFinite(baseline) && baseline > 0 && !(unit === "count" && baseline < MIN_COUNT_BASELINE)) {
      const move = r.bad === "falls" ? (baseline - value) / baseline : (value - baseline) / baseline;
      if (move >= THRESHOLD) { score = move; why = `${r.bad === "falls" ? "down" : "up"} from ${formatValue(unit, baseline, currency)} (4-week average)`; }
    }
    if (r.limit !== undefined && (r.bad === "rises" ? value > r.limit : value < r.limit)) {
      const over = Math.abs(value - r.limit) / r.limit + THRESHOLD;
      if (over > score) { score = over; why = `${r.bad === "rises" ? "above" : "below"} the ${formatValue(unit, r.limit, currency)} line`; }
    }
    if (score > 0 && (!best || score > best.score)) {
      const owner = WORKFLOWS.find((w) => w.title === r.workflow)?.owner ?? "data";
      best = { lever, metric: r.metric, label, unit, value, baseline: Number.isFinite(baseline) ? baseline : value, workflow: r.workflow, owner, why, score };
    }
  }
  if (!best) return null;
  const { score: _score, ...weakest } = best;
  return weakest;
}

// ---------------------------------------------------------------- routing to playbooks

export type Pick = { workflow: string; slug: string; owner: string; contributors: string[]; why: string; score: number };
/** A number's reading this week: enough of a board metric (lib/analytics.ts) to see which way it moved. */
export type Reading = { id: string; status: string; change: number | null; better: "up" | "down"; workflows: string[] };
/** Enough of an experiment (lib/experiments.ts) to keep lost and in-flight playbooks out. */
export type Tried = { workflow?: string; status: string; endedAt: string | null };

/** The playbooks the weekly review hands out for the weakest lever: the workflow its route names first, then those
 *  that share its number, then those whose own numbers moved the wrong way this week. A playbook that lost an
 *  experiment in the last LOST_REST_DAYS, or has one running, is left out so nobody reruns a failed test. */
export function routePlaybooks(
  weakest: Weakest | null,
  o: { readings?: Reading[]; tried?: Tried[]; skip?: string[]; now?: Date; limit?: number } = {},
): Pick[] {
  if (!weakest) return [];
  const now = o.now ?? new Date(), readings = o.readings ?? [], tried = o.tried ?? [];
  const resting = new Set(tried.filter((t) => t.workflow && (t.status === "running" ||
    (t.status === "lost" && t.endedAt && now.getTime() - Date.parse(t.endedAt) < LOST_REST_DAYS * 864e5))).map((t) => t.workflow as string));
  const scored: Pick[] = [];
  for (const p of PLAYBOOKS) {
    if (!p.runnable || !p.levers.includes(weakest.lever) || resting.has(p.title) || o.skip?.includes(p.title)) continue;
    let score = 0;
    const why: string[] = [];
    if (p.title === weakest.workflow) { score += 100; why.push(`its route for ${weakest.label.toLowerCase()}`); }
    if ((WORKFLOW_ANALYTICS[p.title] ?? []).includes(weakest.metric as never)) { score += 50; if (p.title !== weakest.workflow) why.push(`moves ${weakest.label.toLowerCase()}`); }
    const worse = readings.filter((r) => r.status === "measured" && r.change !== null && r.change !== 0 && r.workflows.includes(p.title) &&
      (r.better === "up" ? r.change < 0 : r.change > 0));
    if (worse.length) { score += 20 * worse.length; why.push(`${worse.length === 1 ? "one" : worse.length} of its numbers moved the wrong way this week`); }
    if (score) scored.push({ workflow: p.title, slug: p.slug, owner: p.owner, contributors: p.contributors, why: why.join("; "), score });
  }
  return scored.sort((a, b) => b.score - a.score || a.workflow.localeCompare(b.workflow)).slice(0, o.limit ?? 3);
}
