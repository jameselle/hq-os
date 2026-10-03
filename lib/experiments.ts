// The experiment log: every change made to move a lever, with its hypothesis, the metric it should move, the
// baseline when it started and the result. Kept per business in $HQ_DATA (0600) and mirrored to the business's
// vault, so the weekly review can see what was tried and avoid repeating it. Server-only.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { METRICS, type MetricId } from "./scorecard-metrics";
import { businessDir, getProfile } from "./store";

export type Verdict = "won" | "lost" | "inconclusive";
export type Experiment = {
  id: number; hypothesis: string; metric: MetricId; lever: string; baseline: number | null;
  startedAt: string; status: "running" | Verdict; result: number | null; endedAt: string | null; note: string;
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

export function addExperiment(slug: string, x: { hypothesis: string; metric: MetricId; baseline?: number | null }, now = new Date()): Experiment {
  if (!Object.hasOwn(METRICS, x.metric)) throw Error(`unknown metric ${x.metric}: use one of ${Object.keys(METRICS).join(", ")}`);
  if (!x.hypothesis?.trim()) throw Error("a hypothesis is required");
  const xs = listExperiments(slug);
  const e: Experiment = {
    id: (xs.at(-1)?.id ?? 0) + 1, hypothesis: x.hypothesis.trim().slice(0, 300), metric: x.metric, lever: METRICS[x.metric].lever,
    baseline: x.baseline ?? null, startedAt: now.toISOString(), status: "running", result: null, endedAt: null, note: "",
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
  const row = (e: Experiment) => `| ${e.id} | ${e.startedAt.slice(0, 10)} | ${e.lever} | ${METRICS[e.metric].label} | ${e.hypothesis.replace(/\|/g, "/")} | ${e.baseline ?? "—"} | ${e.result ?? "—"} | ${e.status} | ${e.note.replace(/\|/g, "/")} |`;
  return ["# Experiments", "", "Every change made to move a lever. Written by `npm run hq -- experiment`.", "",
    "| # | Started | Lever | Metric | Hypothesis | Baseline | Result | Status | Note |", "|---|---|---|---|---|---|---|---|---|",
    ...xs.map(row), ""].join("\n");
}
