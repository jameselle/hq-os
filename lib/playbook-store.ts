// Playbook runs on disk: $HQ_DATA/businesses/<slug>/playbooks/
//   config.json      mode (off | ask | auto), workflows this business never runs automatically, runs per day in auto
//   state.json       signal notes already seen, so each one triggers at most once
//   routing.json     this week's weakest lever and the playbooks the CEO's routing picked (read by the CEO and the page)
//   runs/<id>/       run.json (the record), inputs.json and plan.md (written by the headless run, lib/playbook-runner.ts)
// A run goes queued → running → ready (or failed); the owner then applies it (which opens an experiment on its
// target number) or drops it. Applied runs are judged REVIEW_AFTER_DAYS later from the same number, and the verdict
// is filed as a lesson in the business's brain. Nothing here reaches a customer. Server-only.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { analyticsBoard } from "./analytics";
import { ANALYTICS, type AnalyticsId } from "./analytics-metrics";
import { writeNote } from "./brain-store";
import { closeExperiment, experimentsMarkdown, listExperiments, addExperiment, type Experiment } from "./experiments";
import { REVIEW_AFTER_DAYS, judge, playbookBySlug, type Playbook, type Reason } from "./playbooks";
import type { Pick } from "./levers";
import { businessDir, deptVaultDir, getProfile } from "./store";

export type Mode = "off" | "ask" | "auto";
/** `rules`: the business's house rules, handed to every run, which must follow them (a brand or pricing promise,
 *  a regulator's line). `skip`: workflows HQ never starts automatically for this business. */
/** `backlog`: at most this many runs are open (queued, running or ready) before HQ queues more. */
export type PlaybookConfig = { mode: Mode; skip: string[]; perDay: number; rules: string[]; backlog: number };
export const DEFAULT_CONFIG: PlaybookConfig = { mode: "off", skip: [], perDay: 2, rules: [], backlog: 6 };

export type RunStatus = "queued" | "running" | "ready" | "failed" | "applied" | "dropped";
export type Run = {
  id: string; slug: string; workflow: string; owner: string; contributors: string[];
  status: RunStatus; reason: Reason; createdAt: string;
  startedAt?: string; finishedAt?: string; costUsd?: number; why?: string;
  /** From the run's result.json: one paragraph, the change it proposes, and what the owner has to do. */
  summary?: string; hypothesis?: string; ownerActions?: string[];
  metric?: AnalyticsId | null; baseline?: number | null;
  appliedAt?: string; experiment?: number; droppedAt?: string; note?: string;
  verdict?: "won" | "lost" | "inconclusive"; verdictWhy?: string;
};
export type Routing = { at: string; week: string; weakest: { lever: string; label: string; why: string; workflow: string; metric: string } | null; picks: Pick[] };

export const playbooksDir = (slug: string) => path.join(businessDir(slug), "playbooks");
export const runDir = (slug: string, id: string) => path.join(playbooksDir(slug), "runs", id);

function need(slug: string) { if (!getProfile(slug)) throw Error("Unknown business"); }
const readJson = <T>(f: string): T | null => { try { return JSON.parse(fs.readFileSync(f, "utf8")) as T; } catch { return null; } };
function writeJson(f: string, v: unknown) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, f);
}

// ---------------------------------------------------------------- config and state

export function configProblem(v: unknown): string | null {
  const c = v as Partial<PlaybookConfig>;
  if (!c || typeof c !== "object") return "config must be an object";
  if (c.mode !== undefined && !["off", "ask", "auto"].includes(c.mode)) return "mode must be off, ask or auto";
  if (c.skip !== undefined && (!Array.isArray(c.skip) || !c.skip.every((x) => typeof x === "string"))) return "skip must be a list of workflow titles";
  if (c.perDay !== undefined && (!Number.isInteger(c.perDay) || c.perDay < 0 || c.perDay > 10)) return "perDay must be a whole number from 0 to 10";
  if (c.backlog !== undefined && (!Number.isInteger(c.backlog) || c.backlog < 1 || c.backlog > 30)) return "backlog must be a whole number from 1 to 30";
  if (c.rules !== undefined && (!Array.isArray(c.rules) || c.rules.length > 20 || !c.rules.every((x) => typeof x === "string" && x.trim() && x.length <= 300))) return "rules must be up to 20 sentences of at most 300 characters";
  return null;
}

export function readConfig(slug: string): PlaybookConfig {
  need(slug);
  const c = readJson<Partial<PlaybookConfig>>(path.join(playbooksDir(slug), "config.json"));
  return c && !configProblem(c) ? { ...DEFAULT_CONFIG, ...c } : { ...DEFAULT_CONFIG };
}
export function writeConfig(slug: string, c: Partial<PlaybookConfig>): PlaybookConfig {
  need(slug);
  const bad = configProblem(c);
  if (bad) throw Error(bad);
  const next = { ...readConfig(slug), ...c };
  writeJson(path.join(playbooksDir(slug), "config.json"), next);
  return next;
}

type State = { seen: string[]; lastTick?: string };
export const readState = (slug: string): State => readJson<State>(path.join(playbooksDir(slug), "state.json")) ?? { seen: [] };
export const writeState = (slug: string, s: State) => writeJson(path.join(playbooksDir(slug), "state.json"), { ...s, seen: s.seen.slice(-3000) });

export const readRouting = (slug: string): Routing | null => readJson<Routing>(path.join(playbooksDir(slug), "routing.json"));
export const writeRouting = (slug: string, r: Routing) => writeJson(path.join(playbooksDir(slug), "routing.json"), r);

// ---------------------------------------------------------------- runs

export function listRuns(slug: string): Run[] {
  need(slug);
  const dir = path.join(playbooksDir(slug), "runs");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((id) => readJson<Run>(path.join(dir, id, "run.json"))).filter((r): r is Run => Boolean(r))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function getRun(slug: string, id: string): Run {
  need(slug);
  if (!/^[\w-]+$/.test(id)) throw Error(`no run ${id}`);
  const r = readJson<Run>(path.join(runDir(slug, id), "run.json"));
  if (!r) throw Error(`no run ${id}`);
  return r;
}
export function saveRun(slug: string, r: Run): Run { writeJson(path.join(runDir(slug, r.id), "run.json"), r); return r; }
export function readPlan(slug: string, id: string): string | null {
  try { return fs.readFileSync(path.join(runDir(slug, getRun(slug, id).id), "plan.md"), "utf8"); } catch { return null; }
}

/** The newest run per playbook slug (any status), for cooldowns. */
export function lastRunBySlug(runs: Run[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of runs) { const s = playbookSlugOf(r); if (s && (!out[s] || r.createdAt > out[s])) out[s] = r.createdAt; }
  return out;
}
const playbookSlugOf = (r: Run) => r.id.replace(/^\d{4}-\d{2}-\d{2}-/, "");

export function queueRun(slug: string, p: Playbook, reason: Reason, now = new Date()): Run | null {
  const id = `${now.toISOString().slice(0, 10)}-${p.slug}`;
  if (fs.existsSync(path.join(runDir(slug, id), "run.json"))) return null;
  return saveRun(slug, { id, slug, workflow: p.title, owner: p.owner, contributors: p.contributors, status: "queued", reason, createdAt: now.toISOString(), metric: p.metric });
}

/** The current value of a number on the business's analytics board, or null when it isn't measured. */
export function currentValue(slug: string, metric: AnalyticsId, now = new Date()): number | null {
  try { const m = analyticsBoard(slug, now).metrics.find((x) => x.id === metric); return m && m.status === "measured" ? m.value : null; } catch { return null; }
}

function mirrorExperiments(slug: string) {
  const p = getProfile(slug);
  if (!p) return;
  const dir = deptVaultDir(p, "data");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "Experiments.md"), experimentsMarkdown(listExperiments(slug)));
}

/** The owner applied a ready run: open its experiment on the target number, from today's reading. */
export function applyRun(slug: string, id: string, o: { note?: string; now?: Date; baseline?: number | null } = {}): Run {
  const now = o.now ?? new Date();
  const r = getRun(slug, id);
  if (r.status !== "ready") throw Error(`run ${id} is ${r.status}; only a ready run can be applied`);
  const metric = r.metric ?? playbookBySlug(playbookSlugOf(r))?.metric ?? null;
  let experiment: Experiment | null = null;
  if (metric) {
    const baseline = o.baseline !== undefined ? o.baseline : currentValue(slug, metric, now);
    experiment = addExperiment(slug, {
      hypothesis: (r.hypothesis || `${r.workflow} moves ${ANALYTICS[metric].label.toLowerCase()}`).slice(0, 300), metric, baseline,
      workflow: r.workflow, run: r.id, reviewAt: new Date(now.getTime() + REVIEW_AFTER_DAYS * 864e5).toISOString(),
    }, now);
    mirrorExperiments(slug);
    r.baseline = baseline;
  }
  return saveRun(slug, { ...r, status: "applied", appliedAt: now.toISOString(), experiment: experiment?.id, note: o.note?.slice(0, 300) ?? r.note });
}

export function dropRun(slug: string, id: string, note?: string, now = new Date()): Run {
  const r = getRun(slug, id);
  if (r.status === "applied" || r.status === "running") throw Error(`run ${id} is ${r.status} and can't be dropped`);
  return saveRun(slug, { ...r, status: "dropped", droppedAt: now.toISOString(), note: note?.slice(0, 300) ?? r.note });
}

/** Judge every playbook experiment whose review date has passed, close it, and file the lesson. */
export function reviewExperiments(slug: string, now = new Date(), read: (m: AnalyticsId) => number | null = (m) => currentValue(slug, m, now)): Experiment[] {
  const closed: Experiment[] = [];
  for (const e of listExperiments(slug)) {
    if (e.status !== "running" || !e.run || !e.reviewAt || Date.parse(e.reviewAt) > now.getTime()) continue;
    const result = read(e.metric);
    const { verdict, why } = judge(e.metric, e.baseline, result);
    closed.push(closeExperiment(slug, e.id, { verdict, result, note: `Judged by HQ: ${why}` }, now));
    try {
      const r = getRun(slug, e.run);
      saveRun(slug, { ...r, verdict, verdictWhy: why });
      writeNote("business", slug, {
        type: "lesson", dept: r.owner, title: `${e.workflow}: ${verdict} (${now.toISOString().slice(0, 10)})`,
        body: [`Tried: ${e.hypothesis}`, "", `Result: ${why}.`, "",
          verdict === "won" ? "Keep doing it; consider turning the plan into a standing playbook." : verdict === "lost" ? `Don't rerun it unchanged; HQ's routing rests this playbook for 8 weeks.` : "Not enough of a move to tell. Try a bigger change or a longer run before repeating."].join("\n"),
        evidence: [`experiment ${e.id}`, `playbook run ${e.run}`],
      });
    } catch { /* the run or the brain is gone; the experiment still closes */ }
  }
  if (closed.length) mirrorExperiments(slug);
  return closed;
}

/** The run list as a vault note, so the owner sees it in Obsidian too. */
export function mirrorRuns(slug: string) {
  const p = getProfile(slug);
  if (!p) return;
  const runs = listRuns(slug);
  const dir = deptVaultDir(p, "operations");
  fs.mkdirSync(dir, { recursive: true });
  const row = (r: Run) => `| ${r.createdAt.slice(0, 10)} | ${r.workflow} | ${r.owner} | ${r.status}${r.verdict ? ` (${r.verdict})` : ""} | ${(r.summary ?? r.why ?? "").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 160)} |`;
  fs.writeFileSync(path.join(dir, "Playbook runs.md"), ["# Playbook runs", "", "Every playbook HQ started for this business. Written by `npm run hq -- playbook tick`.", "",
    "| Started | Playbook | Owner | Status | Summary |", "|---|---|---|---|---|", ...runs.map(row), ""].join("\n"));
}
