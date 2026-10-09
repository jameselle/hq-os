// Load tests on disk: the business's config ($HQ_DATA/businesses/<slug>/loadtest/loadtest.json) and the summary of
// every recorded run (loadtest/runs.json), both 0600, mirrored to the vault as
// Departments/Product & Engineering/Load tests.md. Server-only. The rules live in lib/load-test.ts.
import fs from "node:fs";
import path from "node:path";

import { configProblem, loadMarkdown, LOAD_LIMITS, toRun, type LoadRun, type LoadTestConfig, type LoadReport } from "./load-test";
import { writePrivateJson } from "./private-adapter";
import { DEPARTMENTS } from "./registry";
import { businessDir, getProfile, vaultRoot } from "./store";

const dir = (slug: string) => {
  if (!getProfile(slug)) throw Error("Unknown business");
  return path.join(businessDir(slug), "loadtest");
};

export function readLoadConfig(slug: string): LoadTestConfig | null {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(dir(slug), "loadtest.json"), "utf8"));
    return configProblem(v) ? null : v;
  } catch (e) { if ((e as Error).message === "Unknown business") throw e; return null; }
}

export function writeLoadConfig(slug: string, cfg: LoadTestConfig, now = new Date()): LoadTestConfig {
  const problem = configProblem(cfg);
  if (problem) throw Error(`loadtest.json: ${problem}`);
  fs.mkdirSync(dir(slug), { recursive: true, mode: 0o700 });
  writePrivateJson(path.join(dir(slug), "loadtest.json"), cfg);
  mirror(slug, now);
  return cfg;
}

export function listLoadRuns(slug: string): LoadRun[] {
  try { const v = JSON.parse(fs.readFileSync(path.join(dir(slug), "runs.json"), "utf8")); return Array.isArray(v) ? v : []; }
  catch (e) { if ((e as Error).message === "Unknown business") throw e; return []; }
}

/** Read a harness report (a report.json, or a run folder holding one) and keep its summary. Same run twice: replaced. */
export function recordLoadRun(slug: string, reportPath: string, opts: { label?: string | null; now?: Date } = {}): LoadRun {
  const cfg = readLoadConfig(slug);
  if (!cfg) throw Error(`no load test set up for ${slug}: run \`npm run hq -- loadtest setup ${slug} --target <users>\` first`);
  const file = fs.statSync(reportPath).isDirectory() ? path.join(reportPath, "report.json") : reportPath;
  const report = JSON.parse(fs.readFileSync(file, "utf8")) as LoadReport;
  const now = opts.now ?? new Date();
  const run = toRun(report, cfg, { now, label: opts.label ?? null });
  const runs = [...listLoadRuns(slug).filter((r) => r.id !== run.id), run].sort((a, b) => a.at.localeCompare(b.at)).slice(-LOAD_LIMITS.runs);
  writePrivateJson(path.join(dir(slug), "runs.json"), runs);
  mirror(slug, now);
  return run;
}

function mirror(slug: string, now: Date) {
  const p = getProfile(slug); const cfg = readLoadConfig(slug);
  if (!p || !cfg) return;
  try {
    const label = DEPARTMENTS.find((d) => d.slug === "engineering")?.label ?? "Product & Engineering";
    const vdir = path.join(vaultRoot(p), "Departments", label);
    fs.mkdirSync(vdir, { recursive: true });
    fs.writeFileSync(path.join(vdir, "Load tests.md"), loadMarkdown(cfg, listLoadRuns(slug), now));
  } catch { /* no vault yet: the runs are kept in $HQ_DATA either way */ }
}
