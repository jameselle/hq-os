// Routing by lever: which growth lever is weakest this week, and which workflow moves it. Reads a business's
// scorecard weeks (newest first), compares each headline number with its own trailing 4-week average (and a few
// hard limits), and picks the worst. The CEO turns the answer into one finding for the workflow's owner.
// Client-safe: no node imports.
import { formatValue, METRICS, type MetricId } from "./scorecard-metrics";
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
