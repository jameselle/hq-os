// Load testing (the "Load test before growth" workflow, owned by Product & Engineering): how many customers at once
// the product serves and still passes, measured on a disposable copy of production, never production itself.
//
// HQ never runs a load test on its own: it costs money (servers) and needs the owner's yes. A business's own harness
// (template: templates/loadtest/) produces a report; `hq loadtest record` reads it, keeps a plain summary per run and
// judges it against the business's target. This module is pure: the config and report contracts, the summary, when
// the next test is due, the workflow's evidence and the vault note.

export type LoadTestConfig = {
  version: 1;
  /** Customers at once the business plans for (the next launch, the growth plan's peak). */
  targetUsers: number;
  /** Re-test this often, even when nothing big is planned. */
  cadenceDays: number;
  /** The endpoint or page whose p95 is the headline (e.g. "events"); default: the slowest one in each step. */
  primary?: string;
  /** Where the harness lives and how it runs. Shown to the skill; HQ never executes them by itself. */
  repo?: string;
  commands?: { provision?: string; run?: string; teardown?: string };
  /** Where the harness writes its run folders (each with a report.json). */
  runsDir?: string;
  /** What the staging copy is, in one line (size, region, data), for the report. */
  staging?: string;
};

/** One step of a stepped test, as the harness reports it (templates/loadtest/README.md). */
export type ReportStep = { users: number; pass: boolean; rps?: number; fails?: string[]; endpoints?: Record<string, { p95?: number | null }> };
export type LoadReport = { meta?: { startedAt?: number | string; commit?: string; steps?: string; hold?: string }; steps: ReportStep[] };

export type RunStep = { users: number; pass: boolean; rps: number | null; p95Ms: number | null; reasons: string[] };
export type LoadRun = {
  id: string; at: string; commit: string | null; label: string | null;
  steps: RunStep[];
  /** The most users that passed, counting only steps below the first failure. */
  maxPassing: number | null;
  firstFail: { users: number; reason: string } | null;
  target: number;
};

export const LOAD_LIMITS = { steps: 20, reasons: 4, reason: 200, label: 80, runs: 100 };

/** Plain, short text with nothing that identifies a host or a person: no emails, URLs, IPs or long hex. */
export function plainText(s: unknown, max: number): s is string {
  return typeof s === "string" && s.trim().length > 0 && s.length <= max
    && !/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(s) && !/https?:\/\//i.test(s)
    && !/\b\d{1,3}(\.\d{1,3}){3}\b/.test(s) && !/\b[0-9a-f]{24,}\b/i.test(s) && !/(sk|so|rk|pk)_(live|test)_/i.test(s);
}

export function configProblem(v: unknown): string | null {
  const c = v as LoadTestConfig;
  if (!c || typeof c !== "object") return "not an object";
  if (c.version !== 1) return "version must be 1";
  if (!Number.isInteger(c.targetUsers) || c.targetUsers < 1 || c.targetUsers > 1_000_000) return "targetUsers must be a whole number above 0";
  if (!Number.isInteger(c.cadenceDays) || c.cadenceDays < 1 || c.cadenceDays > 365) return "cadenceDays must be 1-365";
  if (c.primary !== undefined && !/^[a-z0-9_:-]{1,40}$/i.test(c.primary)) return "primary must be an endpoint name";
  for (const k of ["repo", "runsDir", "staging"] as const) if (c[k] !== undefined && (typeof c[k] !== "string" || c[k]!.length > 300)) return `${k} must be a short string`;
  if (c.commands !== undefined) {
    if (typeof c.commands !== "object") return "commands must be an object";
    for (const [k, cmd] of Object.entries(c.commands)) {
      if (!["provision", "run", "teardown"].includes(k)) return `unknown command ${k}`;
      if (typeof cmd !== "string" || cmd.length > 300) return `commands.${k} must be a short string`;
      if (/\.env\b|password|token=|secret/i.test(cmd)) return `commands.${k} must not carry or read credentials`;
    }
  }
  return null;
}

export function reportProblem(v: unknown): string | null {
  const r = v as LoadReport;
  if (!r || typeof r !== "object" || !Array.isArray(r.steps)) return "steps must be a list";
  if (!r.steps.length || r.steps.length > LOAD_LIMITS.steps) return `steps must hold 1-${LOAD_LIMITS.steps} steps`;
  for (const [i, s] of r.steps.entries()) {
    if (!Number.isInteger(s?.users) || s.users < 1) return `steps[${i}].users must be a whole number above 0`;
    if (typeof s.pass !== "boolean") return `steps[${i}].pass must be true or false`;
    if (s.rps !== undefined && s.rps !== null && !Number.isFinite(s.rps)) return `steps[${i}].rps must be a number`;
    if (s.fails !== undefined && !Array.isArray(s.fails)) return `steps[${i}].fails must be a list`;
  }
  return null;
}

const p95Of = (s: ReportStep, primary?: string): number | null => {
  const eps = s.endpoints ?? {};
  if (primary) { const v = eps[primary]?.p95; return Number.isFinite(v) ? Math.round(v!) : null; }
  const all = Object.values(eps).map((e) => e?.p95).filter((x): x is number => Number.isFinite(x));
  return all.length ? Math.round(Math.max(...all)) : null;
};

/** The harness's report → the summary HQ keeps. Reasons that could identify a host or a person are dropped. */
export function toRun(r: LoadReport, cfg: Pick<LoadTestConfig, "targetUsers" | "primary">, opts: { now: Date; label?: string | null }): LoadRun {
  const problem = reportProblem(r);
  if (problem) throw Error(`report: ${problem}`);
  const steps = [...r.steps].sort((a, b) => a.users - b.users).map((s): RunStep => ({
    users: s.users, pass: s.pass, rps: Number.isFinite(s.rps) ? Math.round(s.rps! * 100) / 100 : null, p95Ms: p95Of(s, cfg.primary),
    reasons: (s.fails ?? []).filter((x) => plainText(x, LOAD_LIMITS.reason)).slice(0, LOAD_LIMITS.reasons),
  }));
  const failIdx = steps.findIndex((s) => !s.pass);
  const passing = (failIdx < 0 ? steps : steps.slice(0, failIdx)).filter((s) => s.pass);
  const started = r.meta?.startedAt;
  const at = typeof started === "number" ? new Date(started * (started < 1e12 ? 1000 : 1)) : typeof started === "string" && Number.isFinite(Date.parse(started)) ? new Date(started) : opts.now;
  const commit = typeof r.meta?.commit === "string" && /^[0-9a-f]{6,40}$/i.test(r.meta.commit) ? r.meta.commit.slice(0, 12) : null;
  const label = opts.label && plainText(opts.label, LOAD_LIMITS.label) ? opts.label.trim() : null;
  const fail = failIdx < 0 ? null : steps[failIdx];
  return {
    id: at.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"), at: at.toISOString(), commit, label, steps,
    maxPassing: passing.length ? passing.at(-1)!.users : null,
    firstFail: fail ? { users: fail.users, reason: fail.reasons[0] ?? "failed its pass criteria" } : null,
    target: cfg.targetUsers,
  };
}

const DAY = 86_400_000;
const daysSince = (iso: string, now: Date) => Math.floor((now.getTime() - Date.parse(iso)) / DAY);
export const meetsTarget = (run: LoadRun) => run.maxPassing !== null && run.maxPassing >= run.target;

/** Is a test due? Never run, older than the cadence, or the newest run fell short of the target. */
export function loadTestDue(cfg: LoadTestConfig, runs: LoadRun[], now: Date): { due: boolean; why: string; since?: string } {
  const last = newest(runs);
  if (!last) return { due: true, why: `No load test recorded yet; the target is ${cfg.targetUsers} customers at once` };
  const age = daysSince(last.at, now);
  if (last.maxPassing === null || last.maxPassing < cfg.targetUsers) {
    return { due: true, since: last.at, why: last.maxPassing === null
      ? `The last load test (${last.at.slice(0, 10)}) failed at its first step, ${last.firstFail?.users ?? "?"} customers: ${last.firstFail?.reason ?? "see the report"}`
      : `The last load test (${last.at.slice(0, 10)}) passed ${last.maxPassing} customers at once, short of the ${cfg.targetUsers} target; it failed at ${last.firstFail?.users ?? "?"}: ${last.firstFail?.reason ?? "see the report"}` };
  }
  if (age > cfg.cadenceDays) return { due: true, since: new Date(Date.parse(last.at) + cfg.cadenceDays * DAY).toISOString(), why: `The last load test was ${age} days ago (re-test every ${cfg.cadenceDays})` };
  return { due: false, why: `Passed ${last.maxPassing} customers at once on ${last.at.slice(0, 10)} (target ${cfg.targetUsers}); next by ${new Date(Date.parse(last.at) + cfg.cadenceDays * DAY).toISOString().slice(0, 10)}` };
}

export const newest = (runs: LoadRun[]): LoadRun | null => [...runs].sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;

/** Workflow evidence: live when the newest run is within the cadence and meets the target. */
export function loadEvidence(cfg: LoadTestConfig, runs: LoadRun[], now: Date): { state: "live" | "partial"; proof: string[]; last?: string } {
  const last = newest(runs);
  const setup = `Load test set up: target ${cfg.targetUsers} customers at once, every ${cfg.cadenceDays} days`;
  if (!last) return { state: "partial", proof: [setup, "Not yet: no load test recorded (npm run hq -- loadtest record)"] };
  const age = daysSince(last.at, now);
  const head = `Latest run ${last.at.slice(0, 10)}: ${last.maxPassing ?? 0} customers at once passed${last.firstFail ? `, failed at ${last.firstFail.users}` : ""}`;
  const not = [
    meetsTarget(last) ? "" : `Not yet: short of the ${cfg.targetUsers} target`,
    age > cfg.cadenceDays ? `Not yet: ${age} days old, re-test every ${cfg.cadenceDays}` : "",
  ].filter(Boolean);
  return { state: not.length ? "partial" : "live", proof: [setup, head, ...not], last: last.at };
}

export function loadMarkdown(cfg: LoadTestConfig, runs: LoadRun[], now: Date): string {
  const due = loadTestDue(cfg, runs, now);
  const L = ["# Load tests", "", "How many customers at once the product serves and still passes, measured on a disposable copy of production.", "",
    `Target: **${cfg.targetUsers}** customers at once. Re-test every ${cfg.cadenceDays} days.${cfg.staging ? ` Staging: ${cfg.staging}.` : ""}`, "",
    `Status: ${due.due ? "**due**. " : ""}${due.why}.`, ""];
  if (cfg.repo || cfg.commands) {
    L.push("## How to run it", "");
    if (cfg.repo) L.push(`- Harness: \`${cfg.repo}\``);
    for (const k of ["provision", "run", "teardown"] as const) if (cfg.commands?.[k]) L.push(`- ${k[0].toUpperCase()}${k.slice(1)}: \`${cfg.commands[k]}\``);
    L.push("- Or ask Claude: `/hq:load-test`", "");
  }
  L.push("## Runs", "", "| When | Commit | Passed at once | First failure | Steps |", "|---|---|---|---|---|");
  for (const r of [...runs].sort((a, b) => b.at.localeCompare(a.at))) {
    const steps = r.steps.map((s) => `${s.users} ${s.pass ? "pass" : "FAIL"}${s.p95Ms !== null ? ` (p95 ${s.p95Ms} ms)` : ""}`).join(", ");
    L.push(`| ${r.at.slice(0, 16).replace("T", " ")}${r.label ? ` ${r.label}` : ""} | ${r.commit ?? ""} | ${r.maxPassing ?? 0} | ${r.firstFail ? `${r.firstFail.users}: ${r.firstFail.reason}` : "none"} | ${steps} |`);
  }
  if (!runs.length) L.push("| none yet | | | | |");
  return L.join("\n") + "\n";
}
