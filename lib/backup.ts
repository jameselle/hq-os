// Getting a live service's data into the nightly backup safely. restic copies files as they
// are, so a database written mid-backup can land torn. Before restic runs, each service with
// a `backup` spec is staged into $HQ_DATA/service-data/<label>/, which restic then includes:
//   sqlite — a consistent copy via sqlite3 .backup (works while the service runs)
//   cold   — the service is stopped, its folder APFS-cloned, and the service started again
// launchd and process calls are injected so the order of operations is unit-tested.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { hqData } from "./store";

// What the nightly backup leaves out, shared by `backup run` (as restic --exclude patterns) and the
// restore test (which must not expect those files back). Studio renders are rebuilt from their job;
// node_modules (e.g. a Hypit video project's) is reinstalled from its package.json.
const EXCLUDE_GLOBS = ["*.tmp", ".DS_Store", "node_modules", "*/studio/**/*.mp4", "*/studio/**/*.aiff", "*/studio/**/*.wav"];

export function resticExcludeArgs(data: string): string[] {
  return [...EXCLUDE_GLOBS, path.join(data, "logs")].flatMap((g) => ["--exclude", g]);
}

export function excludedFromBackup(file: string, data: string): boolean {
  const name = path.basename(file);
  if (name.endsWith(".tmp") || name === ".DS_Store") return true;
  if (file.startsWith(path.join(data, "logs") + path.sep)) return true;
  if (file.split(path.sep).includes("node_modules")) return true;
  return /\/studio\//.test(file) && /\.(mp4|aiff|wav)$/.test(name);
}

export type ServiceBackup =
  /** A live SQLite database file. Skipped until the file exists (the tool isn't set up yet). */
  | { sqlite: string }
  /** A folder that is only consistent while the service is stopped. `lock` must be gone after
   *  the stop (e.g. Postgres's postmaster.pid) or the copy is refused. `fastStop` runs right
   *  after launchd is told to unload, for services whose SIGTERM waits on clients. */
  | { cold: string; lock?: string; fastStop?: string[] };

export type StageOps = {
  isLoaded(label: string): boolean;
  /** Ask launchd to unload; returns before the process has exited. */
  unload(label: string): void;
  /** Wait for launchd to let go; false if it is still loaded. */
  waitUnloaded(label: string): boolean;
  start(label: string): void;
  run(cmd: string[]): { ok: boolean; err?: string };
};

export type StageResult = { label: string; ok: boolean; skipped?: boolean; detail: string };

export const stagedDir = (label: string) => path.join(hqData(), "service-data", label);

export function realRun(cmd: string[]): { ok: boolean; err?: string } {
  const r = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8" });
  return r.status === 0 ? { ok: true } : { ok: false, err: (r.stderr || r.error?.message || `exit ${r.status}`).trim().split("\n").pop() };
}

function stageSqlite(label: string, file: string, ops: StageOps): StageResult {
  if (!fs.existsSync(file)) return { label, ok: true, skipped: true, detail: `${file} doesn't exist yet (not set up)` };
  const dest = path.join(stagedDir(label), path.basename(file));
  if (dest.includes("'")) return { label, ok: false, detail: `can't quote ${dest} for sqlite3` };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp`;
  fs.rmSync(tmp, { force: true });
  const r = ops.run(["/usr/bin/sqlite3", file, `.backup '${tmp}'`]);
  if (!r.ok) {
    fs.rmSync(tmp, { force: true });
    return { label, ok: false, detail: `sqlite3 .backup failed: ${r.err}` };
  }
  fs.renameSync(tmp, dest);
  return { label, ok: true, detail: `copied ${path.basename(file)} with sqlite3 .backup` };
}

function stageCold(label: string, spec: { cold: string; lock?: string; fastStop?: string[] }, ops: StageOps): StageResult {
  const src = spec.cold;
  if (!fs.existsSync(src)) return { label, ok: true, skipped: true, detail: `${src} doesn't exist yet` };
  const dest = stagedDir(label);
  const next = `${dest}.new`;
  const wasLoaded = ops.isLoaded(label);
  const started = Date.now();
  try {
    if (wasLoaded) {
      ops.unload(label);
      if (spec.fastStop) ops.run(spec.fastStop);
      if (!ops.waitUnloaded(label)) return { label, ok: false, detail: `${label} is still running after the stop; not copied` };
    }
    if (spec.lock && fs.existsSync(path.join(src, spec.lock))) {
      return { label, ok: false, detail: `${spec.lock} is still there after the stop (not a clean shutdown); not copied` };
    }
    fs.rmSync(next, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(next), { recursive: true });
    const r = ops.run(["/bin/cp", "-Rc", src, next]); // -c: APFS clone, instant and no extra space
    if (!r.ok) {
      fs.rmSync(next, { recursive: true, force: true });
      return { label, ok: false, detail: `copy failed: ${r.err}; kept the last good copy` };
    }
  } finally {
    if (wasLoaded) ops.start(label);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(next, dest);
  return { label, ok: true, detail: `cold copy of ${src} (${wasLoaded ? `service down ${((Date.now() - started) / 1000).toFixed(1)} s` : "service was stopped"})` };
}

/** Stage every service that has a backup spec. Never throws for one service's failure. */
export function stageServiceData(services: { label: string; backup?: ServiceBackup }[], ops: StageOps): StageResult[] {
  const out: StageResult[] = [];
  for (const s of services) {
    if (!s.backup) continue;
    try {
      out.push("sqlite" in s.backup ? stageSqlite(s.label, s.backup.sqlite, ops) : stageCold(s.label, s.backup, ops));
    } catch (e) {
      out.push({ label: s.label, ok: false, detail: (e as Error).message });
    }
  }
  return out;
}
