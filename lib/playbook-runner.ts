// Does one playbook run: gathers its inputs into runs/<id>/inputs.json, runs Claude Code headless with the
// /hq:playbook skill (allowed to read only the run folder, the business's vault and the skill, to search and fetch
// the web, and to write only in the run folder), then checks what came back: plan.md with its sections, a Legal
// check when customers are reached, result.json, and drafts with no dashes. A run that passes is "ready" for the
// owner; one that doesn't is "failed" with why, its files kept. Never sends, posts or publishes. Server-only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

import { ANALYTICS } from "./analytics-metrics";
import { claudeBin } from "./blog-writer";
import { readBundle, signalFeed } from "./brain-store";
import { listExperiments } from "./experiments";
import { playbookBySlug, type Playbook } from "./playbooks";
import { currentValue, getRun, listRuns, mirrorRuns, readConfig, readRouting, runDir, saveRun, type Run } from "./playbook-store";
import { getProfile, hqRoot, latestPlan, vaultRoot } from "./store";
import { DEPARTMENTS } from "./registry";

const label = (n: string) => (n === "ceo" ? "CEO" : DEPARTMENTS.find((d) => d.slug === n)?.label ?? n);

export function gatherRunInputs(slug: string, run: Run, p: Playbook, now = new Date()) {
  const b = getProfile(slug);
  if (!b) throw Error("Unknown business");
  const signals = run.reason.kind === "signal" ? signalFeed(slug, 6000).filter((s) => (run.reason as { rels: string[] }).rels.includes(s.rel)) : [];
  let brain = "";
  try { brain = readBundle(slug, p.owner, 9000); } catch { /* no brain yet */ }
  const metric = p.metric ? { id: p.metric, label: ANALYTICS[p.metric].label, better: ANALYTICS[p.metric].better, current: currentValue(slug, p.metric, now) } : null;
  return {
    today: now.toISOString().slice(0, 10),
    houseRules: readConfig(slug).rules,
    business: { name: b.name, offer: b.offer, audience: b.audience, country: b.country, regulated: b.regulated, model: b.model, currency: b.currency, sites: b.sites, brandVoice: b.brandVoice ?? "" },
    playbook: {
      title: p.title, owner: label(p.owner), contributors: p.contributors.map(label), levers: p.levers,
      steps: p.steps.map(([d, s], i) => ({ n: i + 1, department: label(d), does: s })),
      customerFacing: p.customerFacing, legalAddedByHQ: p.addedGuard, target: p.metricText, metric,
    },
    why: run.reason.kind === "signal" ? { kind: "signal", notes: signals.map((s) => ({ from: label(s.from), to: s.to.map(label), title: s.title, date: s.created, body: s.body, evidence: s.evidence })) }
      : run.reason.kind === "route" ? { kind: "the CEO's routing", why: run.reason.why, routing: readRouting(slug) }
      : run.reason,
    ownerBrain: brain,
    ownerLatestPlan: latestPlan(slug, p.owner)?.markdown?.slice(0, 6000) ?? null,
    earlierRuns: listRuns(slug).filter((r) => r.workflow === p.title && r.id !== run.id).slice(0, 5)
      .map((r) => ({ date: r.createdAt.slice(0, 10), status: r.status, summary: r.summary ?? null, verdict: r.verdict ?? null, verdictWhy: r.verdictWhy ?? null })),
    lostExperiments: listExperiments(slug).filter((e) => e.status === "lost").slice(-10).map((e) => ({ hypothesis: e.hypothesis, metric: e.metric, note: e.note })),
    vault: vaultRoot(b),
  };
}

/** Cut at a word, with an ellipsis, so a long sentence never ends mid-word. */
export const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…`);

export type Result = { summary: string; hypothesis: string; ownerActions: string[]; deliverables: { title: string; file: string }[] };

/** HQ's checks on what a run wrote. Pure over the files' text. */
export function checkRun(o: { plan: string | null; result: unknown; customerFacing: boolean; drafts: Record<string, string> }): { problems: string[]; result: Result | null } {
  const problems: string[] = [];
  if (!o.plan?.trim()) problems.push("no plan.md");
  else {
    for (const h of ["## Steps", "## The owner's call", "## How we'll know"]) if (!o.plan.includes(h)) problems.push(`plan.md has no "${h}"`);
    if (o.customerFacing && !/^## Legal check/m.test(o.plan)) problems.push("plan.md has no \"## Legal check\" and this playbook reaches customers");
  }
  const r = o.result as Partial<Result> | null;
  let result: Result | null = null;
  if (!r || typeof r !== "object") problems.push("no result.json");
  else if (typeof r.summary !== "string" || !r.summary.trim() || typeof r.hypothesis !== "string" || !r.hypothesis.trim()) problems.push("result.json needs a summary and a hypothesis");
  else {
    const actions = Array.isArray(r.ownerActions) ? r.ownerActions.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 200)).slice(0, 12) : [];
    const deliverables = Array.isArray(r.deliverables) ? r.deliverables.filter((d) => d && typeof d.title === "string" && typeof d.file === "string" && /^[\w.-]+$/.test(d.file)).slice(0, 20) : [];
    for (const d of deliverables) if (!(d.file in o.drafts)) problems.push(`result.json lists ${d.file}, which isn't in the run folder`);
    result = { summary: cut(r.summary, 1200), hypothesis: cut(r.hypothesis, 300), ownerActions: actions, deliverables };
  }
  for (const [f, text] of Object.entries(o.drafts)) if (/[–—]/.test(text)) problems.push(`${f} has an em or en dash; drafts never do`);
  return { problems, result };
}

/** The headless call: the owner's own settings, hooks and MCP servers are left out (only the run folder's project
 *  settings apply, and it has none), reads are limited to the run folder, the vault and the skill, and writes to the
 *  run folder. No shell, no content search across the disk. */
export function runArgs(prompt: string, dir: string, vault: string, skillDir: string): string[] {
  const abs = (x: string) => `/${x}/**`; // Claude Code permission rules take absolute paths with a leading //.
  return ["-p", prompt, "--output-format", "json", "--max-turns", "60", "--setting-sources", "project", "--strict-mcp-config",
    "--allowedTools", "Glob", "WebSearch", "WebFetch", `Read(${abs(dir)})`, `Read(${abs(vault)})`, `Read(${abs(skillDir)})`, `Write(${abs(dir)})`, `Edit(${abs(dir)})`,
    "--disallowedTools", "Bash", "Grep", "NotebookEdit"];
}

export type RunWriter = (bin: string, args: string[], cwd: string, timeoutMs: number) => Promise<{ code: number; stdout: string }>;
const execWriter: RunWriter = (bin, args, cwd, timeoutMs) => new Promise((resolve) => {
  execFile(bin, args, { cwd, timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024, env: { ...process.env, HOME: os.homedir() } },
    (err, stdout) => resolve({ code: err ? 1 : 0, stdout: String(stdout ?? "") }));
});

/** Do one queued (or failed) run now. Never throws; the run record says what happened. */
/** `again`: redo a ready run from scratch (after the house rules changed, say); its old plan and drafts are replaced. */
export async function executeRun(slug: string, id: string, deps: { claude?: string | null; runWriter?: RunWriter; timeoutMs?: number; now?: () => Date; again?: boolean } = {}): Promise<Run> {
  const now = deps.now ?? (() => new Date());
  const run = getRun(slug, id);
  if (run.status !== "queued" && run.status !== "failed" && !(deps.again && run.status === "ready")) throw Error(`run ${id} is ${run.status}; only a queued or failed run can be done${run.status === "ready" ? " (or a ready one with --again)" : ""}`);
  const p = playbookBySlug(id.replace(/^\d{4}-\d{2}-\d{2}-/, ""));
  // A failure keeps whatever the run had got to (its start time, its cost), read fresh from disk.
  const fail = (why: string, extra: Partial<Run> = {}) => { const r = saveRun(slug, { ...getRun(slug, id), ...extra, status: "failed", why: why.slice(0, 400), finishedAt: now().toISOString() }); mirrorRuns(slug); return r; };
  if (!p) return fail("this playbook no longer exists");
  const bin = deps.claude !== undefined ? deps.claude : claudeBin();
  if (!bin) return fail("Claude Code isn't installed where HQ can find it (set CLAUDE_BIN)");
  const skill = path.join(hqRoot(), "plugin", "skills", "playbook", "SKILL.md");
  if (!fs.existsSync(skill)) return fail("the playbook skill is missing from the plugin folder");

  const dir = runDir(slug, id);
  // One writer per run: a second click or a tick racing the page finds the lock and stops.
  const lock = path.join(dir, "run.lock");
  try { fs.closeSync(fs.openSync(lock, "wx")); }
  catch {
    if (Date.now() - fs.statSync(lock).mtimeMs < 40 * 60e3) throw Error(`run ${id} is already being done`);
    fs.writeFileSync(lock, ""); // a lock older than any run is left over from a crash
  }
  try { return await doRun(slug, id, run, p, bin, skill, dir, deps, now, fail); }
  catch (e) { return fail(`the run broke: ${(e as Error).message}`); }
  finally { fs.rmSync(lock, { force: true }); }
}

async function doRun(slug: string, id: string, run: Run, p: Playbook, bin: string, skill: string, dir: string,
  deps: { runWriter?: RunWriter; timeoutMs?: number }, now: () => Date, fail: (why: string, extra?: Partial<Run>) => Run): Promise<Run> {
  for (const f of fs.readdirSync(dir)) if (f !== "run.json" && f !== "run.lock") fs.rmSync(path.join(dir, f), { recursive: true, force: true }); // a rerun starts clean
  run = saveRun(slug, { ...run, status: "running", startedAt: now().toISOString(), why: undefined, summary: undefined, hypothesis: undefined, ownerActions: undefined });
  const inputs = gatherRunInputs(slug, run, p, now());
  fs.writeFileSync(path.join(dir, "inputs.json"), JSON.stringify(inputs, null, 2), { mode: 0o600 });

  const prompt = [
    fs.readFileSync(skill, "utf8").replace(/^---[\s\S]*?---\n/, ""),
    "", "## This run",
    `- Run folder: ${dir}`,
    `- Read ${path.join(dir, "inputs.json")} first. The business's vault (read-only) is ${inputs.vault}.`,
    `- Write plan.md, result.json and any draft files in the run folder only, then stop.`,
    p.customerFacing ? "- This playbook reaches customers: plan.md must have a \"## Legal check\" section." : "",
  ].filter(Boolean).join("\n");
  const out = await (deps.runWriter ?? execWriter)(bin, runArgs(prompt, dir, inputs.vault, path.dirname(skill)), dir, deps.timeoutMs ?? 25 * 60e3);
  let costUsd: number | undefined, summary = "", isError = out.code !== 0;
  try { const j = JSON.parse(out.stdout); costUsd = j.total_cost_usd; isError = isError || Boolean(j.is_error); summary = String(j.result ?? "").slice(0, 200); } catch { /* not JSON */ }

  const read = (f: string) => { try { return fs.readFileSync(path.join(dir, f), "utf8"); } catch { return null; } };
  let result: unknown = null;
  try { result = JSON.parse(read("result.json") ?? "null"); } catch { result = null; }
  const drafts = Object.fromEntries(fs.readdirSync(dir).filter((f) => /^draft-.*\.md$/.test(f)).map((f) => [f, read(f) ?? ""]));
  const checked = checkRun({ plan: read("plan.md"), result, customerFacing: p.customerFacing, drafts });
  if (checked.problems.length) return fail(`${isError && !read("plan.md") ? `the writer stopped: ${summary || "no output"}. ` : ""}HQ's checks: ${checked.problems.join("; ")}`, { costUsd });

  const r = checked.result!;
  run = saveRun(slug, { ...run, status: "ready", finishedAt: now().toISOString(), costUsd, summary: r.summary, hypothesis: r.hypothesis, ownerActions: r.ownerActions });
  // The plan and drafts also go to the owner's department in the vault.
  const b = getProfile(slug);
  if (b) {
    const vdir = path.join(vaultRoot(b), "Departments", label(p.owner).replace(/[\\/:*?"<>|]/g, "-"), "Playbook runs", id);
    fs.mkdirSync(vdir, { recursive: true });
    fs.writeFileSync(path.join(vdir, "plan.md"), `---\ntype: "playbook-run"\nbusiness: ${JSON.stringify(b.name)}\nworkflow: ${JSON.stringify(p.title)}\nrun: "${id}"\n---\n\n${read("plan.md")}`);
    for (const f of Object.keys(drafts)) fs.copyFileSync(path.join(dir, f), path.join(vdir, f));
  }
  mirrorRuns(slug);
  return run;
}
