// The experiment log: every change made to move a lever, with its hypothesis, the metric it should move, the
// baseline when it started and the result. Any analytics number can be the metric (the scorecard's are among them),
// so a media business can test against views or follows, not only signups and revenue. Kept per business in $HQ_DATA (0600) and mirrored to the business's
// vault, so the weekly review can see what was tried and avoid repeating it. Server-only.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { ANALYTICS, type AnalyticsId } from "./analytics-metrics";
import { businessDir, getProfile } from "./store";

export type Verdict = "won" | "lost" | "inconclusive";
export type Experiment = {
  id: number; hypothesis: string; metric: AnalyticsId; lever: string; baseline: number | null;
  startedAt: string; status: "running" | Verdict; result: number | null; endedAt: string | null; note: string;
  /** Set when a playbook run started it (lib/playbook-store.ts): the workflow, the run's id, and when HQ judges it. */
  workflow?: string; run?: string; reviewAt?: string;
};

const file = (slug: string) => {
  if (!getProfile(slug)) throw Error("Unknown business");
  return path.join(businessDir(slug), "experiments.json");
};
export function listExperiments(slug: string): Experiment[] {
  try { return JSON.parse(fs.readFileSync(file(slug), "utf8")); } catch (e) { if ((e as Error).message === "Unknown business") throw e; return []; }
}
function save(slug: string, xs: Experiment[]) {
  const f = file(slug), tmp = `${f}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(xs, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, f);
}

export function addExperiment(slug: string, x: { hypothesis: string; metric: AnalyticsId; baseline?: number | null; workflow?: string; run?: string; reviewAt?: string }, now = new Date()): Experiment {
  if (!Object.hasOwn(ANALYTICS, x.metric)) throw Error(`unknown metric ${x.metric}: use one of ${Object.keys(ANALYTICS).join(", ")}`);
  if (!x.hypothesis?.trim()) throw Error("a hypothesis is required");
  const xs = listExperiments(slug);
  const e: Experiment = {
    id: (xs.at(-1)?.id ?? 0) + 1, hypothesis: x.hypothesis.trim().slice(0, 300), metric: x.metric, lever: ANALYTICS[x.metric].lever,
    baseline: x.baseline ?? null, startedAt: now.toISOString(), status: "running", result: null, endedAt: null, note: "",
    ...(x.workflow ? { workflow: x.workflow } : {}), ...(x.run ? { run: x.run } : {}), ...(x.reviewAt ? { reviewAt: x.reviewAt } : {}),
  };
  save(slug, [...xs, e]);
  return e;
}

export function closeExperiment(slug: string, id: number, r: { result?: number | null; verdict: Verdict; note?: string }, now = new Date()): Experiment {
  const xs = listExperiments(slug);
  const e = xs.find((x) => x.id === id);
  if (!e) throw Error(`no experiment ${id}`);
  Object.assign(e, { status: r.verdict, result: r.result ?? null, note: (r.note ?? "").slice(0, 300), endedAt: now.toISOString() });
  save(slug, xs);
  return e;
}

export function experimentsMarkdown(xs: Experiment[]): string {
  const row = (e: Experiment) => `| ${e.id} | ${e.startedAt.slice(0, 10)} | ${e.lever} | ${ANALYTICS[e.metric]?.label ?? e.metric} | ${e.hypothesis.replace(/\|/g, "/")} | ${e.baseline ?? "—"} | ${e.result ?? "—"} | ${e.status} | ${e.note.replace(/\|/g, "/")} |`;
  return ["# Experiments", "", "Every change made to move a lever. Written by `npm run hq -- experiment`.", "",
    "| # | Started | Lever | Metric | Hypothesis | Baseline | Result | Status | Note |", "|---|---|---|---|---|---|---|---|---|",
    ...xs.map(row), ""].join("\n");
}
