// hq: the command line behind the HQ skills. Run from the repo root:
//
//   npm run hq -- <command> [args]
//
// Businesses   new-business <profile.json> · list · use <slug> · remove-business <slug> --yes
// Writing      save-review <slug> <file.md|-> · save-plan <slug> <dept> <file.md|-> · done <slug|-> <finding-id> [--undo]
// Backups      backup init [repository] · backup run · backup restore-test · backup snapshots · backup restore <id|latest> <new-folder>
// Services     services init · services add-defaults · services install · services status · services start · services stop · services uninstall
// Publishing   connections save <file.json|-> · connections show · publishing <slug> · log-post <slug> <post.json|->
// Scripts      script-check <script.txt|-> [--slug <business>] [--keyword WORD] [--target <posted seconds>] [--wpm N]
// Competitors  competitors sync <slug> · competitors changes <slug> [--days N] [--json] · competitors log <slug> <name> <file|-> · competitors recheck <slug>
// Brain        brain init · brain read <slug> <dept> [--chars N] · brain write <slug|hq> <note.json|-> · brain promote <slug> <note> [--title T] [--body file] · brain show <slug>
// Tools        support refresh <slug|--all> · support show|digest <slug> · finance init <slug> · finance sync <slug|--all> · finance show <slug> · scorecard refresh <slug|--all> · scorecard show <slug> · scorecard check-billing <slug> · analytics refresh <slug|--all> · analytics show <slug> [--missing] [--dept <dept>] · workflows check <slug|--all>
// Lifecycle    lifecycle show <slug> [flow] [--cached] · lifecycle explain <slug> <flow> · lifecycle approve|reject <slug> <message> [--yes --before <ISO>] · lifecycle notes <slug> [--all]
//              lifecycle test <slug> <message> · lifecycle mode <slug> <flow> off|draft|auto [--yes]
// Blog         blog setup <slug> --site <url> [--hour 6] [--sc-account A --sc-site S] · blog inputs|write|check|show|publish <slug> [--dry-run] · blog approve|reject|reopen <slug> <draft> · blog note <slug> <draft> "…" · blog mode <slug> off|draft|auto · blog tick <slug|--all>
// Experiments  experiment add <slug> "<hypothesis>" --metric <id> [--baseline N] · experiment close <slug> <id> won|lost|inconclusive [--result N] [--note "…"] · experiment list <slug>
// Health       doctor
//
// Never reads .env files. Secrets it creates (the restic password) go straight
// into the login Keychain and are never printed.

import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { keptTakeFiles, TELEPROMPTER_APP, TELEPROMPTER_TAKES } from "../lib/studio/teleprompter";
import { excludedFromBackup, realRun, resticExcludeArgs, stageServiceData, type ServiceBackup, type StageOps } from "../lib/backup";
import { backupIsExternal } from "../lib/ceo";
import { brainStats, candidates, hqBrainRoot, initBrain, promote, readBundle, writeNote, type NoteInput } from "../lib/brain-store";
import { NOTE_TYPES, TYPE_INFO } from "../lib/brain";
import { runScorecard, scorecardState } from "../lib/scorecard";
import { analyticsBoard, isoWeek, lastWeeks, runAnalytics } from "../lib/analytics";
import { financeConnected, moneyByMonth, syncFinance } from "../lib/finance-sync";
import { digestWritten, runSupport, supportConnected, supportDigest, supportState, writeSupportDigest } from "../lib/support";
import { loadLedger } from "../lib/ledger-spend";
import { listNotes as listLifecycleNotes } from "../lib/lifecycle-notes";
import { decide, decisionText, type BlogConfig } from "../lib/blog";
import { addNote as addBlogNote, checkDrafts, draftToday, listDrafts, log as blogLog, publishReady, readBlogConfig, setStatus as setBlogStatus, writeBlogConfig, blogDir } from "../lib/blog-store";
import { gatherInputs, writeDraft } from "../lib/blog-writer";
import { fetchCompetitorChanges, fetchOpenFindings } from "../lib/analytics-findings";
import { WORKFLOW_ANALYTICS, formatAnalytics } from "../lib/analytics-metrics";
import { runWorkflowChecks, workflowChecksState } from "../lib/workflow-checks";
import { lifecycleState, runLifecycle, supports, type LifecycleFlow, type LifecycleSnapshot, type WriteAction } from "../lib/lifecycle";
import { flowOfMessage, flowPage, namingProblems } from "../lib/lifecycle-names";
import { explainFlow, flowStatus, lifecycleStatus, timeLabel } from "../lib/lifecycle-status";
import { workflowSlug, workflowsFor } from "../lib/workflows";
import { addExperiment, closeExperiment, experimentsMarkdown, listExperiments, type Verdict } from "../lib/experiments";
import { formatValue, scorecardRows } from "../lib/scorecard-metrics";
import { validateProfile } from "../lib/profile";
import { PLATFORMS, captionProblems, channelStatuses, resolveRoute } from "../lib/publishing";
import { checkScript, formatReport } from "../lib/script-check";
import { mergeBrand } from "../lib/studio/brand";
import { privateNames } from "../lib/brain-store";
import { WATCHER_KEYCHAIN, WATCHER_URL, competitorFromTitle, competitorNoteHead, recentChanges, shortUrl, watchTag, watchTargets, type WatchRow } from "../lib/competitors";
import {
  businessDir,
  getProfile,
  hqData,
  initLedger,
  ledgerPath,
  stamp,
  hqRoot,
  listBusinesses,
  listPosts,
  logPost,
  readConfig,
  readConnections,
  saveConnections,
  removeBusiness,
  saveReview,
  savePlan,
  scaffoldBusiness,
  setDone,
  vaultRoot,
  writeConfig,
} from "../lib/store";

const HOME = os.homedir();
const LOCAL_BIN = path.join(HOME, ".local", "bin");
const PATH_ENV = [LOCAL_BIN, "/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":");

function die(msg: string): never {
  console.error(`hq: ${msg}`);
  process.exit(1);
}

function readInput(arg: string | undefined): string {
  if (!arg) die("missing input file (use - for stdin)");
  return arg === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(arg, "utf8");
}

function which(bin: string): string | null {
  for (const dir of [...(process.env.PATH ?? "").split(":"), LOCAL_BIN]) {
    const p = path.join(dir, bin);
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: "127.0.0.1", port });
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(400);
    s.once("connect", () => done(true));
    s.once("timeout", () => done(false));
    s.once("error", () => done(false));
  });
}

// ---------------------------------------------------------------- businesses

function cmdNewBusiness(file: string | undefined) {
  const raw = JSON.parse(readInput(file)) as Record<string, unknown>;
  raw.createdAt ??= new Date().toISOString();
  raw.vault ??= { path: "vault" };
  raw.sites ??= [];
  raw.channels ??= {};
  raw.regulated ??= [];
  const res = validateProfile(raw);
  if (!res.ok) die(`profile is invalid:\n  - ${res.errors.join("\n  - ")}`);
  const { dir, vault } = scaffoldBusiness(res.profile);
  console.log(`created ${res.profile.name} (${res.profile.slug})`);
  // Fava serves every ledger it found at start: restart it so the new books show up.
  if (loaded("com.hq.fava")) spawnSync("/bin/launchctl", ["kickstart", "-k", `gui/${uid()}/com.hq.fava`], { stdio: "ignore" });
  console.log(`  data:  ${dir}`);
  console.log(`  vault: ${vault}  (open this folder as a vault in Obsidian)`);
}

function cmdList() {
  const { profiles, invalid } = listBusinesses();
  const current = readConfig().current;
  if (!profiles.length && !invalid.length) return console.log("no businesses yet — run /hq:new-business");
  for (const p of profiles) console.log(`${p.slug === current ? "*" : " "} ${p.slug.padEnd(24)} ${p.name}${p.demo ? " (demo)" : ""}`);
  for (const b of invalid) console.log(`! ${b.slug.padEnd(24)} INVALID: ${b.errors.join("; ")}`);
}

function cmdUse(slug: string | undefined) {
  if (!slug || !getProfile(slug)) die(`no such business: ${slug ?? "(none given)"}`);
  writeConfig({ ...readConfig(), current: slug });
  console.log(`default business is now ${slug} (the site's switcher can still pick another per browser)`);
}

function cmdRemove(slug: string | undefined, yes: boolean) {
  const p = slug ? getProfile(slug) : null;
  if (!p) die(`no such business: ${slug ?? "(none given)"}`);
  if (!yes) die(`this deletes ${businessDir(p.slug)}; re-run with --yes to confirm`);
  removeBusiness(p.slug);
  console.log(`removed ${p.slug}${path.isAbsolute(p.vault.path) ? " (its external vault was left alone)" : ""}`);
}

// ---------------------------------------------------------------- backups (restic)

const KEYCHAIN_SERVICE = "hq-restic";
const DEFAULT_REPO = path.join(HOME, "Library", "Mobile Documents", "com~apple~CloudDocs", "HQ Backups", "restic");

function restic(): string {
  return which("restic") ?? die("restic is not installed (see /hq:backup for the install steps)");
}

function resticEnv(repository: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: PATH_ENV,
    RESTIC_REPOSITORY: repository,
    RESTIC_PASSWORD_COMMAND: `/usr/bin/security find-generic-password -a ${os.userInfo().username} -s ${KEYCHAIN_SERVICE} -w`,
  };
}

function keychainHasPassword(): boolean {
  return (
    spawnSync("/usr/bin/security", ["find-generic-password", "-a", os.userInfo().username, "-s", KEYCHAIN_SERVICE], {
      stdio: "ignore",
    }).status === 0
  );
}

/** What gets backed up: all of $HQ_DATA plus any external vault a business points at. */
function backupPaths(): string[] {
  const paths = new Set([hqData()]);
  for (const p of listBusinesses().profiles) if (path.isAbsolute(p.vault.path)) paths.add(p.vault.path);
  // The teleprompter's scripts are git-ignored in its public repo, and its takes live outside HQ_DATA:
  // back up the scripts and only the takes the owner kept (choices.json), never the discards.
  paths.add(path.join(TELEPROMPTER_APP, "scripts"));
  for (const f of keptTakeFiles()) paths.add(f);
  return [...paths].filter((p) => fs.existsSync(p));
}

function cmdBackupInit(repoArg?: string) {
  const repository = repoArg ?? DEFAULT_REPO;
  const bin = restic();
  if (!keychainHasPassword()) {
    const password = crypto.randomBytes(32).toString("base64url");
    execFileSync("/usr/bin/security", ["add-generic-password", "-a", os.userInfo().username, "-s", KEYCHAIN_SERVICE, "-l", "HQ restic backup", "-w", password], {
      stdio: "ignore",
    });
    console.log(`generated a backup password and stored it in the login Keychain (service "${KEYCHAIN_SERVICE}"); it is not shown here`);
  }
  if (!repository.includes(":")) fs.mkdirSync(path.dirname(repository), { recursive: true });
  const exists = spawnSync(bin, ["cat", "config"], { env: resticEnv(repository), stdio: "ignore" }).status === 0;
  if (!exists) {
    const r = spawnSync(bin, ["init"], { env: resticEnv(repository), encoding: "utf8" });
    if (r.status !== 0) die(`restic init failed:\n${r.stderr}`);
    console.log(`initialised encrypted repository at ${repository}`);
  } else console.log(`repository already exists at ${repository}`);
  const cfg = readConfig();
  writeConfig({ ...cfg, backup: { ...cfg.backup, repository, passwordCommand: `security find-generic-password -s ${KEYCHAIN_SERVICE} -w` } });
  if (!backupIsExternal(repository)) console.log("warning: this repository is on this Mac's own disk — it is not a real backup");
}

function cmdBackupRun() {
  const cfg = readConfig();
  const repository = cfg.backup?.repository ?? die("no backup configured — run: npm run hq -- backup init");
  // Live databases first: copied somewhere consistent under $HQ_DATA/service-data, which restic then takes.
  const staging = stageServiceData(readServices(), liveStageOps);
  for (const r of staging) console.log(`${r.ok ? (r.skipped ? "-" : "✓") : "✗"} stage ${r.label}: ${r.detail}`);
  writeConfig({ ...readConfig(), backup: { ...readConfig().backup!, lastStaging: { at: new Date().toISOString(), results: staging } } });
  const paths = backupPaths();
  // Recorded BEFORE restic starts: a file changed while the backup runs may or may not be
  // in the snapshot, so the restore test must treat anything newer than this as "edited since".
  const startedAt = new Date().toISOString();
  const r = spawnSync(
    restic(),
    ["backup", "--json", "--tag", "hq", ...resticExcludeArgs(hqData()), ...paths],
    { env: resticEnv(repository), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.status !== 0) die(`restic backup failed:\n${r.stderr}`);
  const summary = r.stdout
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { message_type: string; snapshot_id?: string; total_files_processed?: number; data_added?: number })
    .find((m) => m.message_type === "summary");
  if (!summary?.snapshot_id) die("restic finished without a snapshot id");
  // Keep 14 daily, 8 weekly, 12 monthly snapshots; restic only drops unreferenced data on prune.
  spawnSync(restic(), ["forget", "--tag", "hq", "--keep-daily", "14", "--keep-weekly", "8", "--keep-monthly", "12", "--prune"], {
    env: resticEnv(repository),
    stdio: "ignore",
  });
  writeConfig({ ...readConfig(), backup: { ...readConfig().backup!, lastSnapshot: { id: summary.snapshot_id, at: startedAt } } });
  console.log(
    `snapshot ${summary.snapshot_id.slice(0, 8)}: ${summary.total_files_processed} files, ${Math.round((summary.data_added ?? 0) / 1024)} KiB new, paths: ${paths.filter((p) => !p.startsWith(TELEPROMPTER_TAKES)).join(", ")}${paths.some((p) => p.startsWith(TELEPROMPTER_TAKES)) ? ` + ${paths.filter((p) => p.startsWith(TELEPROMPTER_TAKES) && p.endsWith(".mp4")).length} kept teleprompter takes` : ""}`,
  );
}

function sha256(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function walk(dir: string, out: string[] = []): string[] {
  if (fs.statSync(dir).isFile()) {
    if (!excludedFromBackup(dir, hqData())) out.push(dir); // a single file named in backupPaths
    return out;
  }
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && !excludedFromBackup(p, hqData())) out.push(p);
  }
  return out;
}

/** Restore the latest snapshot into a temp folder and compare every file's hash with the live copy. */
function cmdBackupRestoreTest() {
  const cfg = readConfig();
  const repository = cfg.backup?.repository ?? die("no backup configured — run: npm run hq -- backup init");
  const snap = cfg.backup?.lastSnapshot?.id ?? die("no snapshot yet — run: npm run hq -- backup run");
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "hq-restore-"));
  const r = spawnSync(restic(), ["restore", snap, "--target", target], { env: resticEnv(repository), encoding: "utf8" });
  let ok = r.status === 0;
  let detail = ok ? "" : `restic restore failed: ${r.stderr.trim().split("\n").pop()}`;
  if (ok) {
    let checked = 0;
    const mismatched: string[] = [];
    const changedSince: string[] = [];
    const snapAt = Date.parse(cfg.backup!.lastSnapshot!.at);
    for (const root of backupPaths()) {
      for (const live of walk(root)) {
        const restored = path.join(target, live);
        if (fs.statSync(live).mtimeMs > snapAt) {
          changedSince.push(live); // edited after the snapshot: a difference is expected
          continue;
        }
        checked++;
        if (!fs.existsSync(restored) || sha256(restored) !== sha256(live)) mismatched.push(live);
      }
    }
    ok = mismatched.length === 0 && checked > 0;
    detail = ok
      ? `restored snapshot ${snap.slice(0, 8)} and matched ${checked} files byte for byte${changedSince.length ? ` (${changedSince.length} edited since, skipped)` : ""}`
      : `${mismatched.length} of ${checked} files differ or are missing, e.g. ${mismatched.slice(0, 3).join(", ")}`;
  }
  fs.rmSync(target, { recursive: true, force: true });
  writeConfig({ ...readConfig(), backup: { ...cfg.backup!, lastRestoreTest: { ok, at: new Date().toISOString(), detail } } });
  console.log(`${ok ? "PASS" : "FAIL"}: ${detail}`);
  if (!ok) process.exit(1);
}

/** Restore a snapshot into a NEW folder. Never restores over live data. */
function cmdBackupRestore(snapshot: string | undefined, target: string | undefined) {
  const repository = readConfig().backup?.repository ?? die("no backup configured");
  if (!snapshot || !target) die("usage: backup restore <snapshot-id|latest> <new-folder>");
  const dest = path.resolve(target);
  if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) die(`${dest} is not empty; restore into a new folder`);
  const r = spawnSync(restic(), ["restore", snapshot, "--target", dest], { env: resticEnv(repository), stdio: "inherit" });
  if (r.status !== 0) die("restore failed");
  console.log(`restored into ${dest}; files keep their original absolute paths under it (e.g. ${path.join(dest, hqData())})`);
}

function cmdBackupSnapshots() {
  const repository = readConfig().backup?.repository ?? die("no backup configured");
  spawnSync(restic(), ["snapshots", "--tag", "hq"], { env: resticEnv(repository), stdio: "inherit" });
}

// ---------------------------------------------------------------- services (launchd)

type Service = {
  label: string;
  description: string;
  program: string[];
  cwd?: string;
  /** Extra environment variables (never secrets: tools read those from their own config). */
  env?: Record<string, string>;
  keepAlive: boolean;
  /** launchd StartCalendarInterval, for jobs rather than daemons. */
  schedule?: { Hour?: number; Minute?: number; Weekday?: number };
  port?: number;
  /** How the nightly backup captures this service's live data (lib/backup.ts). */
  backup?: ServiceBackup;
};

const servicesFile = () => path.join(hqData(), "services.json");
const agentsDir = path.join(HOME, "Library", "LaunchAgents");
const plistPath = (label: string) => path.join(agentsDir, `${label}.plist`);
const logsDir = () => path.join(hqData(), "logs");
const uid = () => String(os.userInfo().uid);

function readServices(): Service[] {
  try {
    return (JSON.parse(fs.readFileSync(servicesFile(), "utf8")) as { services: Service[] }).services;
  } catch {
    return die(`no ${servicesFile()} — run: npm run hq -- services init`);
  }
}

/** Default services for this Mac: HQ itself, its nightly backup, and each tool that's installed. */
function defaultServices(): Service[] {
  const node = path.join(LOCAL_BIN, "npm");
  const opt = (...p: string[]) => path.join(HOME, ".local", "opt", ...p);
  const vardir = (...p: string[]) => path.join(HOME, ".local", "var", ...p);
  const services: Service[] = [
    { label: "com.hq.web", description: "HQ site on 127.0.0.1:3150", program: [node, "start"], cwd: hqRoot(), keepAlive: true, port: 3150 },
    { label: "com.hq.review", description: "Studio review page on 127.0.0.1:8794: watch renders, note what looks wrong", program: [node, "run", "studio", "--", "review"], cwd: hqRoot(), keepAlive: true, port: 8794 },
    {
      label: "com.hq.backup",
      description: "Nightly restic backup of HQ data, weekly restore test",
      program: ["/bin/sh", "-c", `${node} run hq -- backup run && if [ "$(date +%u)" = "7" ]; then ${node} run hq -- backup restore-test; fi`],
      cwd: hqRoot(),
      keepAlive: false,
      schedule: { Hour: 2, Minute: 30 },
    },
    {
      label: "com.hq.scorecard",
      description: "Daily finance sync, scorecard, analytics and support refresh for every business",
      program: ["/bin/sh", "-c", `${node} run hq -- finance sync --all; ${node} run hq -- scorecard refresh --all; ${node} run hq -- analytics refresh --all; ${node} run hq -- support refresh --all`],
      cwd: hqRoot(),
      keepAlive: false,
      schedule: { Hour: 6, Minute: 0 },
    },
    {
      label: "com.hq.blog",
      description: "Hourly: each business's daily blog post (research, write, check), then publish what the owner or the rules allow",
      program: [node, "run", "hq", "--", "blog", "tick", "--all"],
      cwd: hqRoot(),
      keepAlive: false,
      schedule: { Minute: 20 },
    },
  ];
  const postiz = path.join(HOME, "postiz-app");
  const pg = opt("pg17", "package", "native", "bin", "postgres");
  if (fs.existsSync(postiz) && fs.existsSync(pg)) {
    const data = vardir("postiz");
    services.push(
      {
        label: "com.hq.postiz.postgres",
        description: "Postgres for Postiz (and Listmonk)",
        program: [pg, "-D", path.join(data, "pg"), "-p", "5432", "-k", "/tmp"],
        keepAlive: true,
        port: 5432,
        // launchd's SIGTERM is Postgres's "smart" shutdown, which waits on Postiz's pooled
        // connections until launchd SIGKILLs it; pg_ctl's fast mode shuts down cleanly in ~1 s.
        backup: { cold: path.join(data, "pg"), lock: "postmaster.pid", fastStop: [path.join(path.dirname(pg), "pg_ctl"), "stop", "-D", path.join(data, "pg"), "-m", "fast", "-w", "-t", "30"] },
      },
      {
        label: "com.hq.postiz.redis",
        description: "Redis for Postiz",
        program: [opt("redis", "bin", "redis-server"), "--port", "6379", "--bind", "127.0.0.1", "--dir", data, "--daemonize", "no"],
        keepAlive: true,
        port: 6379,
      },
      {
        label: "com.hq.postiz.temporal",
        description: "Temporal dev server for Postiz (UI :8233)",
        program: [opt("temporal", "temporal"), "server", "start-dev", "--db-filename", path.join(data, "temporal.db"), "--port", "7233", "--ui-port", "8233", "--log-level", "warn"],
        keepAlive: true,
        port: 7233,
      },
      {
        label: "com.hq.postiz.app",
        description: "Postiz backend, frontend and orchestrator (dev mode)",
        program: [path.join(LOCAL_BIN, "pnpm"), "run", "--filter", "./apps/orchestrator", "--filter", "./apps/backend", "--filter", "./apps/frontend", "--parallel", "dev"],
        cwd: postiz,
        keepAlive: true,
        port: 4200,
      },
    );
  }
  if (which("fava")) {
    services.push({ label: "com.hq.fava", description: "Fava: every business's books on 127.0.0.1:5055", program: [path.join(hqRoot(), "scripts", "fava.sh")], keepAlive: true, port: 5055 });
  }
  if (fs.existsSync(opt("listmonk", "listmonk")) && fs.existsSync(vardir("listmonk", "config.toml"))) {
    services.push({
      label: "com.hq.listmonk",
      description: "Listmonk newsletters on 127.0.0.1:9000 (database on the Postiz Postgres)",
      program: [opt("listmonk", "listmonk"), "--config", vardir("listmonk", "config.toml")],
      cwd: vardir("listmonk"),
      keepAlive: true,
      port: 9000,
    });
  }
  if (fs.existsSync(opt("uptime-kuma", "server", "server.js"))) {
    services.push({
      label: "com.hq.uptime-kuma",
      description: "Uptime Kuma monitoring on 127.0.0.1:3001",
      program: [path.join(LOCAL_BIN, "node"), "server/server.js"],
      cwd: opt("uptime-kuma"),
      env: { UPTIME_KUMA_HOST: "127.0.0.1", UPTIME_KUMA_PORT: "3001", DATA_DIR: vardir("uptime-kuma") + "/" },
      keepAlive: true,
      port: 3001,
      backup: { sqlite: vardir("uptime-kuma", "kuma.db") },
    });
  }
  // Twenty CRM: its own Postgres and Redis (Postiz's Postgres needs a superuser password HQ doesn't
  // hold, and Twenty flushes its Redis on start). Secrets are read from the Keychain by twenty.sh.
  if (fs.existsSync(opt("twenty", "src", "packages", "twenty-server", "dist", "main.js")) && fs.existsSync(vardir("twenty", "pg"))) {
    const pgBin = opt("pg17", "package", "native", "bin");
    const pgData = vardir("twenty", "pg");
    const twenty = path.join(hqRoot(), "scripts", "twenty.sh");
    services.push(
      {
        label: "com.hq.twenty.postgres",
        description: "Postgres for Twenty CRM on 127.0.0.1:5433",
        program: [path.join(pgBin, "postgres"), "-D", pgData, "-p", "5433", "-k", "/tmp", "-c", "listen_addresses=127.0.0.1"],
        keepAlive: true,
        port: 5433,
        backup: { cold: pgData, lock: "postmaster.pid", fastStop: [path.join(pgBin, "pg_ctl"), "stop", "-D", pgData, "-m", "fast", "-w", "-t", "30"] },
      },
      {
        label: "com.hq.twenty.redis",
        description: "Redis for Twenty CRM on 127.0.0.1:6380",
        program: [opt("redis", "bin", "redis-server"), "--port", "6380", "--bind", "127.0.0.1", "--dir", vardir("twenty", "redis"), "--daemonize", "no"],
        keepAlive: true,
        port: 6380,
      },
      { label: "com.hq.twenty", description: "Twenty CRM on 127.0.0.1:3020 (pipeline for Sales & Partnerships)", program: [twenty, "server"], cwd: hqRoot(), keepAlive: true, port: 3020 },
      { label: "com.hq.twenty.worker", description: "Twenty CRM background worker", program: [twenty, "worker"], cwd: hqRoot(), keepAlive: true },
    );
  }
  // VoiceStudio: its backend runs here so the desktop app attaches to it and its MCP (/mcp/) is always up.
  // Built from source (the upstream Mac release is unsigned); binds 127.0.0.1 by default.
  if (fs.existsSync(opt("voicestudio", "src", ".venv", "bin", "python"))) {
    services.push({
      label: "com.hq.voicestudio",
      description: "VoiceStudio backend + MCP on 127.0.0.1:3900 (the app attaches to it)",
      program: [opt("voicestudio", "src", ".venv", "bin", "python"), "main.py"],
      cwd: opt("voicestudio", "src", "backend"),
      env: {
        OMNIVOICE_PORT: "3900",
        // Renders go to disk, not into the agent's context; the base path is the MCP's file boundary.
        OMNIVOICE_MCP_OUTPUT_MODE: "files",
        OMNIVOICE_MCP_BASE_PATH: path.join(hqData(), "voicestudio"),
      },
      keepAlive: true,
      port: 3900,
      backup: { cold: path.join(HOME, "Library", "Application Support", "OmniVoice") },
    });
  }
  if (which("changedetection.io") && fs.existsSync(vardir("changedetection", "changedetection.json"))) {
    services.push({
      label: "com.hq.changedetection",
      description: "changedetection.io: competitor page watcher on 127.0.0.1:5010 (API token in Keychain)",
      program: [path.join(LOCAL_BIN, "changedetection.io"), "-h", "127.0.0.1", "-p", "5010", "-d", vardir("changedetection"), "-l", "WARNING"],
      cwd: vardir("changedetection"),
      keepAlive: true,
      port: 5010,
    });
  }
  if (which("syncthing")) {
    services.push({
      label: "com.hq.syncthing",
      description: "Syncthing (web UI 127.0.0.1:8384; syncs only folders you share)",
      program: [path.join(LOCAL_BIN, "syncthing"), "serve", "--no-browser", "--gui-address=127.0.0.1:8384", `--home=${vardir("syncthing")}`],
      keepAlive: true,
      port: 8384,
    });
  }
  return services;
}

function cmdServicesInit() {
  if (fs.existsSync(servicesFile())) die(`${servicesFile()} already exists; use: services add-defaults`);
  const services = defaultServices();
  fs.mkdirSync(hqData(), { recursive: true });
  fs.writeFileSync(servicesFile(), JSON.stringify({ services }, null, 2) + "\n");
  console.log(`wrote ${servicesFile()} with ${services.length} services: ${services.map((x) => x.label).join(", ")}`);
}

/** Add default services that aren't in services.json yet (e.g. a tool installed since init), and give
 *  existing ones a default `backup` spec they lack. Never changes a field that is already set. */
function cmdServicesAddDefaults() {
  const current = readServices();
  const defaults = new Map(defaultServices().map((x) => [x.label, x]));
  const filled: string[] = [];
  for (const s of current) {
    const d = defaults.get(s.label);
    if (d?.backup && !s.backup) {
      s.backup = d.backup;
      filled.push(s.label);
    }
  }
  const have = new Set(current.map((x) => x.label));
  const added = [...defaults.values()].filter((x) => !have.has(x.label));
  if (!added.length && !filled.length) return console.log("services.json already has every default service");
  fs.writeFileSync(servicesFile(), JSON.stringify({ services: [...current, ...added] }, null, 2) + "\n");
  if (filled.length) console.log(`backup spec added to: ${filled.join(", ")}`);
  if (added.length) console.log(`added: ${added.map((x) => x.label).join(", ")} — now run: services install`);
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function plist(s: Service): string {
  const log = path.join(logsDir(), `${s.label}.log`);
  const args = s.program.map((a) => `    <string>${xml(a)}</string>`).join("\n");
  const schedule = s.schedule
    ? `  <key>StartCalendarInterval</key>\n  <dict>\n${Object.entries(s.schedule)
        .map(([k, v]) => `    <key>${k}</key><integer>${v}</integer>`)
        .join("\n")}\n  </dict>\n`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Generated by hq (${xml(s.description)}). Edit $HQ_DATA/services.json, then: npm run hq -- services install -->
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(s.label)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
${s.cwd ? `  <key>WorkingDirectory</key><string>${xml(s.cwd)}</string>\n` : ""}  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xml(PATH_ENV)}</string>
    <key>HOME</key><string>${xml(HOME)}</string>
    <key>HQ_DATA</key><string>${xml(hqData())}</string>
${Object.entries(s.env ?? {})
  .map(([k, v]) => `    <key>${xml(k)}</key><string>${xml(v)}</string>`)
  .join("\n")}
  </dict>
  <key>RunAtLoad</key><${s.keepAlive}/>
  <key>KeepAlive</key><${s.keepAlive}/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>ProcessType</key><string>${s.keepAlive ? "Standard" : "Background"}</string>
${schedule}  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict>
</plist>
`;
}

const loaded = (label: string) => spawnSync("/bin/launchctl", ["print", `gui/${uid()}/${label}`], { stdio: "ignore" }).status === 0;

function bootstrap(label: string) {
  if (loaded(label)) return;
  const r = spawnSync("/bin/launchctl", ["bootstrap", `gui/${uid()}`, plistPath(label)], { encoding: "utf8" });
  if (r.status !== 0) die(`launchctl bootstrap ${label} failed: ${r.stderr.trim()}`);
}

/** Unload and WAIT until launchd has let go. bootout returns before teardown finishes;
 *  bootstrapping during teardown is silently skipped and leaves the service stopped. */
function bootout(label: string) {
  if (!loaded(label)) return;
  spawnSync("/bin/launchctl", ["bootout", `gui/${uid()}/${label}`], { stdio: "ignore" });
  for (let i = 0; i < 100 && loaded(label); i++) spawnSync("/bin/sleep", ["0.1"]);
  if (loaded(label)) die(`${label} is still loaded 10 s after bootout`);
}

const liveStageOps: StageOps = {
  isLoaded: loaded,
  unload: (label) => void spawnSync("/bin/launchctl", ["bootout", `gui/${uid()}/${label}`], { stdio: "ignore" }),
  waitUnloaded: (label) => {
    for (let i = 0; i < 300 && loaded(label); i++) spawnSync("/bin/sleep", ["0.1"]);
    return !loaded(label);
  },
  start: bootstrap,
  run: realRun,
};

function cmdServicesInstall() {
  const services = readServices();
  fs.mkdirSync(logsDir(), { recursive: true }); // launchd fails with EX_CONFIG if it can't open the log file
  fs.mkdirSync(agentsDir, { recursive: true });
  for (const s of services) {
    const text = plist(s);
    const lint = spawnSync("/usr/bin/plutil", ["-lint", "-"], { input: text, encoding: "utf8" });
    if (lint.status !== 0) die(`generated plist for ${s.label} is invalid: ${lint.stdout}${lint.stderr}`);
    const changed = !fs.existsSync(plistPath(s.label)) || fs.readFileSync(plistPath(s.label), "utf8") !== text;
    if (changed) {
      bootout(s.label);
      fs.writeFileSync(plistPath(s.label), text);
    }
    bootstrap(s.label);
    if (!loaded(s.label)) die(`${s.label} did not load; see: launchctl print gui/${uid()}/${s.label}`);
    console.log(`${changed ? "installed" : "unchanged"}  ${s.label}`);
  }
}

async function cmdServicesStatus() {
  for (const s of readServices()) {
    let state = "not installed";
    let pid = "";
    if (fs.existsSync(plistPath(s.label))) {
      const r = spawnSync("/bin/launchctl", ["print", `gui/${uid()}/${s.label}`], { encoding: "utf8" });
      if (r.status !== 0) state = "installed, not loaded";
      else {
        state = /state = ([\w ]+?)\n/.exec(r.stdout)?.[1] ?? "loaded";
        pid = /pid = (\d+)/.exec(r.stdout)?.[1] ?? "";
        const exit = /last exit code = (.+)/.exec(r.stdout)?.[1];
        if (state !== "running" && exit && !exit.includes("never")) state += ` (last exit ${exit.trim()})`;
      }
    }
    const port = s.port ? ((await portOpen(s.port)) ? ` · :${s.port} up` : ` · :${s.port} DOWN`) : "";
    console.log(`${s.label.padEnd(26)} ${state}${pid ? ` pid ${pid}` : ""}${port}`);
  }
}

function cmdServicesStart() {
  for (const s of readServices()) {
    if (!fs.existsSync(plistPath(s.label))) die(`${s.label} isn't installed — run: npm run hq -- services install`);
    bootstrap(s.label);
    if (s.keepAlive) spawnSync("/bin/launchctl", ["kickstart", `gui/${uid()}/${s.label}`], { stdio: "ignore" });
  }
  console.log("started");
}

function cmdServicesStop() {
  for (const s of readServices()) bootout(s.label);
  console.log("stopped (they start again at next login, or with: npm run hq -- services start)");
}

function cmdServicesUninstall() {
  for (const s of readServices()) {
    bootout(s.label);
    fs.rmSync(plistPath(s.label), { force: true });
    console.log(`removed ${s.label}`);
  }
}

// ---------------------------------------------------------------- publishing

function cmdConnectionsShow() {
  const snap = readConnections();
  if (!snap) return console.log("no snapshot yet — run /hq:connections in Claude Code");
  console.log(`checked ${snap.checkedAt} (${snap.source})`);
  for (const [tk, v] of Object.entries(snap.toolkits)) {
    const acc = v.accounts.map((a) => `${a.name ?? a.alias ?? a.id} [${a.id}] ${a.status}`).join(", ");
    console.log(`  ${tk.padEnd(24)} ${v.status.padEnd(10)} ${acc || "-"}`);
  }
}

async function cmdPublishing(slug: string | undefined) {
  const p = (slug ? getProfile(slug) : null) ?? die(`no such business: ${slug ?? "(none given)"}`);
  const rows = channelStatuses(p.channels, readConnections(), await portOpen(4200));
  if (!rows.length) return console.log(`${p.name} lists no channels`);
  for (const r of rows) {
    const route = resolveRoute(r.platform, p.channels[r.platform]);
    console.log(`${r.label.padEnd(10)} ${r.handle.padEnd(22)} via ${r.via.padEnd(10)} ${r.state.padEnd(13)} ${r.detail}`);
    if (route.tools?.length) console.log(`${" ".repeat(11)}tools: ${route.tools.join(" → ")}`);
  }
  const unknown = Object.keys(p.channels).filter((c) => !PLATFORMS[c]);
  if (unknown.length) console.log(`(no built-in route for: ${unknown.join(", ")} — they're posted by hand)`);
}

// ---------------------------------------------------------------- competitors (changedetection.io)

/** The watcher's API token, from the login Keychain. Held in memory only; never printed. */
function watcherToken(): string {
  const r = spawnSync("/usr/bin/security", ["find-generic-password", "-s", WATCHER_KEYCHAIN, "-w"], { encoding: "utf8" });
  if (r.status !== 0) die("no changedetection.io token in the Keychain (see /hq:competitors setup)");
  return r.stdout.trim();
}

async function watcher<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  if (!(await portOpen(5010))) die("changedetection.io isn't running on 127.0.0.1:5010 — npm run hq -- services start");
  const res = await fetch(`${WATCHER_URL}${pathname}`, { ...init, headers: { "x-api-key": watcherToken(), "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) die(`changedetection.io ${res.status} on ${pathname}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

type ApiWatch = { url: string; title: string; last_changed: number; last_checked: number; last_error: string | false | null };

async function watchRows(slug: string): Promise<WatchRow[]> {
  const profile = getProfile(slug);
  const list = await watcher<Record<string, ApiWatch>>(`/api/v1/watch?tag=${encodeURIComponent(watchTag(slug))}`);
  return Object.entries(list).map(([uuid, w]) => ({
    uuid,
    competitor: competitorFromTitle(w.title, profile),
    url: w.url,
    lastChanged: w.last_changed ? new Date(w.last_changed * 1000).toISOString() : null,
    lastChecked: w.last_checked ? new Date(w.last_checked * 1000).toISOString() : null,
    error: w.last_error || null,
  }));
}

const competitorNotePath = (slug: string, name: string) => {
  const p = getProfile(slug)!;
  return path.join(vaultRoot(p), "Competitors", `${name.replace(/[\\/:*?"<>|]/g, "-")}.md`);
};

async function cmdCompetitorsSync(slug: string | undefined) {
  const p = (slug ? getProfile(slug) : null) ?? die(`no such business: ${slug ?? "(none)"}`);
  if (!p.competitors?.length) return console.log(`${p.name} lists no competitors yet — add them to profile.json (see /hq:competitors)`);
  const existing = await watchRows(p.slug);
  const have = new Set(existing.map((r) => r.url));
  let added = 0;
  for (const t of watchTargets(p)) {
    if (have.has(t.url)) continue;
    await watcher("/api/v1/watch", { method: "POST", body: JSON.stringify({ url: t.url, title: t.title, tag: watchTag(p.slug) }) });
    added++;
    console.log(`watching ${t.title}`);
  }
  // Vault: one note per competitor (the head is written once; sweeps append to its log).
  for (const c of p.competitors) {
    const file = competitorNotePath(p.slug, c.name);
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, competitorNoteHead(p, c));
      console.log(`note    ${file}`);
    }
  }
  const stale = existing.filter((r) => !watchTargets(p).some((t) => t.url === r.url));
  console.log(`${added} new watch(es), ${existing.length} already watched${stale.length ? `; not in the profile any more (left alone): ${stale.map((r) => r.url).join(", ")}` : ""}`);
}

async function cmdCompetitorsChanges(slug: string | undefined, days: number, asJson: boolean) {
  const p = (slug ? getProfile(slug) : null) ?? die(`no such business: ${slug ?? "(none)"}`);
  const rows = await watchRows(p.slug);
  const recent = recentChanges(rows, days);
  const out: (WatchRow & { diff?: string })[] = [];
  for (const r of recent) {
    // Two most recent snapshots -> the text that changed.
    const hist = await watcher<Record<string, string>>(`/api/v1/watch/${r.uuid}/history`);
    const ts = Object.keys(hist).sort();
    let diff: string | undefined;
    if (ts.length >= 2) {
      const d = await watcher<string>(`/api/v1/watch/${r.uuid}/difference/${ts.at(-2)}/${ts.at(-1)}?format=text&changesOnly=true&no_markup=true`);
      diff = typeof d === "string" ? d.trim().slice(0, 3000) : JSON.stringify(d).slice(0, 3000);
    }
    out.push({ ...r, diff });
  }
  if (asJson) return console.log(JSON.stringify({ business: p.slug, days, watched: rows.length, changed: out, errors: rows.filter((r) => r.error) }, null, 2));
  console.log(`${p.name}: ${rows.length} page(s) watched, ${out.length} changed in the last ${days} day(s)`);
  for (const r of rows) {
    const mark = out.some((o) => o.uuid === r.uuid) ? "CHANGED" : r.error ? "ERROR  " : "same   ";
    console.log(`  ${mark} ${r.competitor.padEnd(18)} ${shortUrl(r.url).padEnd(40)} checked ${r.lastChecked?.slice(0, 16) ?? "never"}${r.error ? ` — ${r.error}` : ""}`);
  }
  for (const o of out) if (o.diff) console.log(`\n--- ${o.competitor}: ${shortUrl(o.url)} (${o.lastChanged?.slice(0, 16)})\n${o.diff.split("\n").slice(0, 25).join("\n")}`);
}

async function cmdCompetitorsRecheck(slug: string | undefined) {
  const p = (slug ? getProfile(slug) : null) ?? die(`no such business: ${slug ?? "(none)"}`);
  const rows = await watchRows(p.slug);
  for (const r of rows) await watcher(`/api/v1/watch/${r.uuid}?recheck=1`);
  console.log(`queued a recheck of ${rows.length} page(s); results land within a minute or two`);
}

function cmdCompetitorsLog(slug: string | undefined, name: string | undefined, input: string | undefined) {
  const p = (slug ? getProfile(slug) : null) ?? die(`no such business: ${slug ?? "(none)"}`);
  const c = p.competitors?.find((x) => x.name.toLowerCase() === (name ?? "").toLowerCase()) ?? die(`${p.name} has no competitor named "${name}"`);
  const file = competitorNotePath(p.slug, c.name);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, competitorNoteHead(p, c));
  }
  const { date } = stamp(p);
  fs.appendFileSync(file, `\n### ${date}\n${readInput(input).trim()}\n`);
  console.log(`logged to ${file}`);
}

// ---------------------------------------------------------------- doctor

async function cmdDoctor() {
  const line = (ok: boolean, what: string, hint = "") => console.log(`${ok ? "✓" : "✗"} ${what}${!ok && hint ? `  → ${hint}` : ""}`);
  line(Boolean(which("node")), "node on PATH");
  line(fs.existsSync(path.join(hqRoot(), "node_modules")), "dependencies installed", "npm install");
  line(fs.existsSync(path.join(hqRoot(), ".next", "BUILD_ID")), "site built", "npm run build");
  line(await portOpen(3150), "site answering on 127.0.0.1:3150", "npm run hq -- services start");
  const { profiles, invalid } = listBusinesses();
  line(invalid.length === 0, `${profiles.length} business profile(s) valid`, invalid.map((b) => b.slug).join(", "));
  for (const p of profiles) line(fs.existsSync(vaultRoot(p)), `vault for ${p.slug} exists`, vaultRoot(p));
  const b = readConfig().backup;
  line(Boolean(which("restic")), "restic installed", "see /hq:backup");
  line(Boolean(b?.repository), "backup repository configured", "npm run hq -- backup init");
  line(backupIsExternal(b?.repository), "backup repository is off this Mac's disk", b?.repository ?? "");
  line(Boolean(b?.lastSnapshot), `last snapshot ${b?.lastSnapshot?.at ?? "never"}`, "npm run hq -- backup run");
  line(b?.lastRestoreTest?.ok === true, `last restore test ${b?.lastRestoreTest ? `${b.lastRestoreTest.ok ? "passed" : "FAILED"} ${b.lastRestoreTest.at}` : "never"}`, "npm run hq -- backup restore-test");
  line(fs.existsSync(servicesFile()), "services.json present", "npm run hq -- services init");
  const staged = b?.lastStaging?.results ?? [];
  if (staged.length) {
    const bad = staged.filter((r) => !r.ok);
    line(!bad.length, `service data staged for backup: ${staged.filter((r) => r.ok && !r.skipped).map((r) => r.label).join(", ") || "none yet"}`, bad.map((r) => `${r.label}: ${r.detail}`).join("; "));
  }
}

// ---------------------------------------------------------------- lifecycle

/** Flows named by a flow id, a message id, or the slug of the workflow they serve. */
function pickFlows(snap: LifecycleSnapshot, name: string): LifecycleFlow[] {
  const flows = snap.flows ?? [];
  const byId = flows.filter((f) => f.id === name);
  if (byId.length) return byId;
  const owner = flowOfMessage(name, flows.map((f) => f.id)) ?? flows.find((f) => f.messages.some((m) => m.id === name))?.id;
  if (owner) return flows.filter((f) => f.id === owner);
  return flows.filter((f) => f.serves && workflowSlug(f.serves) === name);
}

async function cmdLifecycle(args: string[]) {
  const opt = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const pos = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--before");
  const [sub, slugArg, name, modeArg] = pos;
  const usage = "lifecycle: show <slug> [flow] [--cached] | explain <slug> <flow> | approve <slug> <message> [--yes --before <ISO>] | reject <slug> <message> [--yes --before <ISO>] | test <slug> <message> | mode <slug> <flow> off|draft|auto [--yes] | notes <slug> [--all]";
  if (!sub || !["show", "explain", "approve", "reject", "test", "mode", "notes"].includes(sub)) return die(usage);
  const p = getProfile(slugArg ?? "") ?? die(`no such business: ${slugArg ?? "(none)"}\n${usage}`);
  const tz = p.timezone;
  const hq = (rest: string) => `npm run hq -- lifecycle ${rest}`;
  if (sub === "notes") {
    // The owner's notes from Email & Lifecycle: open ones are work for the Email department.
    const all = listLifecycleNotes(p.slug), show = args.includes("--all") ? all : all.filter((x) => !x.done);
    if (!show.length) return console.log(`${p.name}: no ${args.includes("--all") ? "" : "open "}notes.`);
    for (const x of show) console.log(`${x.done ? "done" : "open"}  ${x.at.slice(0, 10)}  ${x.flow}${x.message ? ` / ${x.message}` : ""}: ${x.text.replace(/\n+/g, " ")}`);
    return;
  }

  // Read it fresh unless asked not to: a report never changes anything.
  let state = lifecycleState(p.slug);
  if (!state.connected) return die(`${p.name}: no lifecycle connection (${path.join(businessDir(p.slug), "lifecycle-connection.json")}); see docs/guides/lifecycle.md`);
  let note = "";
  if (!args.includes("--cached")) {
    try { state = await runLifecycle(p.slug, "report"); }
    catch (e) { note = `Could not refresh (${e instanceof Error ? e.message : e}); showing the copy from ${state.snapshot?.observedAt ? timeLabel(state.snapshot.observedAt, tz) : "never"}.`; }
  }
  const snap = state.snapshot ?? die(`${p.name}: no lifecycle snapshot yet${note ? ". " + note : ""}`);
  const opts = { now: Date.now(), tz, stale: state.stale, failed: snap.collectionFailed, observedAt: snap.observedAt, canApprove: supports(snap, "approve") };
  const need = (action: WriteAction) => {
    if (state.readOnly) die(`${p.name}: the lifecycle connection is read-only; HQ can only watch.`);
    if (!supports(snap, action)) die(`${p.name}: its lifecycle adapter does not support ${action}. It accepts: ${(snap.supports ?? []).join(", ") || "nothing"}.`);
  };
  const flowsNamed = (n?: string) => {
    if (!n) return die(`name a flow: ${(snap.flows ?? []).map((f) => f.id).join(", ") || "none reported"}`);
    const fs2 = pickFlows(snap, n);
    return fs2.length ? fs2 : die(`${p.name} has no flow, message or workflow called "${n}". Flows: ${(snap.flows ?? []).map((f) => f.id).join(", ")}`);
  };
  const message = (n?: string) => {
    if (!n) return die(`name a message: ${snap.workflows.map((w) => w.id).join(", ")}`);
    const w = snap.workflows.find((x) => x.id === n);
    if (w) return w;
    const f = pickFlows(snap, n);
    return die(f.length ? `"${n}" is a flow; name one of its messages: ${snap.workflows.filter((x) => f.some((y) => flowOfMessage(x.id, [y.id]) || y.messages.some((m) => m.id === x.id))).map((x) => x.id).join(", ")}` : `${p.name} has no message called "${n}". Messages: ${snap.workflows.map((x) => x.id).join(", ")}`);
  };

  if (sub === "show") {
    const st = lifecycleStatus(snap, opts);
    console.log(`${p.name} lifecycle · read ${snap.observedAt ? timeLabel(snap.observedAt, tz) : "never"}${state.stale ? " (STALE)" : ""}${snap.paused ? " · PAUSED" : ""}${snap.collectionFailed ? " · COLLECTION FAILED" : ""}`);
    console.log(`Writes it accepts: ${state.readOnly ? "none (read-only)" : (snap.supports ?? ["pause", "resume", "approve", "test", "mode"]).join(", ")}`);
    if (note) console.log(note);
    const problems = namingProblems(snap);
    if (problems.length) console.log(`Naming problems (docs/guides/lifecycle.md):\n${problems.map((x) => "  " + x).join("\n")}`);
    console.log(st.needs.length ? `\nNeeds you:\n${st.needs.map((x) => "  " + x.text).join("\n")}` : "\nNeeds you: nothing.");
    const chosen = name ? flowsNamed(name).map((f) => f.id) : null;
    for (const s of st.flows.filter((x) => !chosen || chosen.includes(x.id))) {
      console.log(`\n${s.label} [${s.id}] · ${s.modeWords}${s.serves ? ` · ${flowPage(s.serves) ?? s.serves}` : ""}`);
      console.log(`  Working? ${s.working.headline}. ${s.working.detail ?? ""}`.trimEnd());
      console.log(`  Waiting? ${s.waiting.headline}. ${s.waiting.detail ?? ""}`.trimEnd());
      console.log(`  Next?    ${s.next.headline}. ${s.next.detail ?? ""}`.trimEnd());
      if (chosen) for (const w of snap.workflows.filter((x) => flowOfMessage(x.id, [s.id]) || (snap.flows ?? []).find((f) => f.id === s.id)?.messages.some((m) => m.id === x.id)))
        console.log(`  message ${w.id}: "${w.preview?.subject ?? w.label}" · ${w.sent30d ?? 0} sent in 30 days · ${w.drafts ?? 0} waiting${w.expiresAt ? `, first expiry ${timeLabel(w.expiresAt, tz)}` : ""}`);
    }
    if (!st.flows.length) console.log("\nNo flows reported. The adapter's snapshot has no `flows` list.");
    return;
  }
  if (sub === "explain") {
    for (const f of flowsNamed(name)) console.log(explainFlow(f, snap.workflows, { ...opts, business: p.name }) + "\n");
    return;
  }
  if (sub === "approve") {
    need("approve");
    const w = message(name);
    const subject = w.preview?.subject ?? w.label;
    if (!w.drafts) return console.log(`Nothing waiting for ${w.id} ("${subject}").`);
    const before = opt("--before");
    if (!args.includes("--yes")) {
      console.log(`${w.drafts} ${w.drafts === 1 ? "person is" : "people are"} waiting for "${subject}" (${w.id}).${w.expiresAt ? ` Unapproved, the first expires ${timeLabel(w.expiresAt, tz)}.` : ""}`);
      console.log(`Read it first: the email is on ${flowPage(w.serves) ? `http://127.0.0.1:3150${flowPage(w.serves)}` : "Email & Lifecycle (http://127.0.0.1:3150/email)"}, or ${hq(`explain ${p.slug} ${w.id}`)}.`);
      console.log(`Nothing was sent. To send exactly these ${w.drafts} after the owner's yes:\n  ${hq(`approve ${p.slug} ${w.id} --yes --before ${snap.observedAt}`)}`);
      return;
    }
    if (!before || !Number.isFinite(Date.parse(before))) return die(`--yes needs --before <the snapshot time you approved from>, so drafts planned since then wait. This snapshot: --before ${snap.observedAt}`);
    const after = await runLifecycle(p.slug, "approve", { workflow: w.id, before });
    const left = after.snapshot?.workflows.find((x) => x.id === w.id)?.drafts ?? 0;
    return console.log(`Approved "${subject}" (${w.id}) for drafts planned up to ${timeLabel(before, tz)}. Still waiting: ${left}. The business's sender sends approved messages on its next run.`);
  }
  if (sub === "reject") {
    need("reject");
    const w = message(name);
    const subject = w.preview?.subject ?? w.label;
    if (!w.drafts) return console.log(`Nothing waiting for ${w.id} ("${subject}").`);
    const before = opt("--before");
    if (!args.includes("--yes")) {
      console.log(`${w.drafts} ${w.drafts === 1 ? "person is" : "people are"} waiting for "${subject}" (${w.id}). Rejecting means none of them ever gets it.`);
      console.log(`Nothing changed. To reject exactly these ${w.drafts} after the owner's no:\n  ${hq(`reject ${p.slug} ${w.id} --yes --before ${snap.observedAt}`)}`);
      return;
    }
    if (!before || !Number.isFinite(Date.parse(before))) return die(`--yes needs --before <the snapshot time you rejected from>, so drafts planned since then wait. This snapshot: --before ${snap.observedAt}`);
    const after = await runLifecycle(p.slug, "reject", { workflow: w.id, before });
    const left = after.snapshot?.workflows.find((x) => x.id === w.id)?.drafts ?? 0;
    const gone = Math.max(0, (w.drafts ?? 0) - left);
    return console.log(gone ? `Rejected ${gone} of "${subject}" (${w.id}), planned up to ${timeLabel(before, tz)}: never sent ("owner said no"). Still waiting: ${left}.`
      : `Nothing was planned up to ${timeLabel(before, tz)}, so nothing was rejected. Still waiting: ${left}.`);
  }
  if (sub === "test") {
    need("test");
    const w = message(name);
    if (snap.flows?.length && !snap.flows.some((f) => f.messages.some((m) => m.id === w.id))) return die(`${w.id} has no single message to test (each one is built from the person's own settings).`);
    await runLifecycle(p.slug, "test", { workflow: w.id });
    return console.log(`Queued a [Test] copy of "${w.preview?.subject ?? w.label}" (${w.id}) for the owner only. No customer gets it.`);
  }
  // mode
  need("mode");
  const [f] = flowsNamed(name);
  if (!["off", "draft", "auto"].includes(modeArg ?? "")) return die(`mode is off, draft or auto. ${f.label} is ${f.mode ?? "always on (no mode switch)"} now.`);
  if (!f.mode) return die(`${f.label} has no mode switch: it sends on its own. Use pause on the lifecycle centre to stop it.`);
  if (modeArg === "auto" && !args.includes("--yes")) {
    const s = flowStatus(f, snap.workflows, opts);
    return console.log(`Not changed. Switching "${f.label}" to auto means its messages go out without anyone's yes.\nWeek-one recommendation: ${s.week.recommendation.label}. ${s.week.recommendation.reason}\nWith the owner's yes:\n  ${hq(`mode ${p.slug} ${f.id} auto --yes`)}`);
  }
  const after = await runLifecycle(p.slug, "mode", { workflow: f.id, mode: modeArg });
  return console.log(`${f.label} is now ${after.snapshot?.flows?.find((x) => x.id === f.id)?.mode ?? modeArg}.`);
}


// ---------------------------------------------------------------- blog

const sydneyLike = (tz: string, d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: tz });
const hourIn = (tz: string, d = new Date()) => Number(new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(d));

async function blogTick(slug: string) {
  const p = getProfile(slug), c = readBlogConfig(slug);
  if (!p || !c || c.mode === "off") return;
  const lock = path.join(blogDir(slug), "run.lock");
  if (fs.existsSync(lock) && Date.now() - fs.statSync(lock).mtimeMs < 45 * 60e3) return console.log(`${slug}: a run is already going`);
  fs.writeFileSync(lock, String(process.pid));
  try {
    const day = sydneyLike(p.timezone);
    if (hourIn(p.timezone) >= (c.hour ?? 6) && !draftToday(slug, p.timezone)) {
      const r = await writeDraft(slug, day);
      console.log(`${slug}: ${r.ok ? `wrote ${r.draft}` : `no draft: ${r.why}`}${r.costUsd !== undefined ? ` (US$${r.costUsd.toFixed(2)})` : ""}`);
    }
    const checked = await checkDrafts(slug);
    for (const d of checked) console.log(`${slug}: checked ${d.file}: ${(d.meta.checks ?? []).filter((x) => !x.ok).length} failing`);
    const res = await publishReady(slug);
    if (res.published.length || res.failed.length) console.log(`${slug}: published ${res.published.length}, failed ${res.failed.length}, waiting ${res.waiting.length}`);
  } catch (e) {
    blogLog(slug, { event: "tick-failed", why: String((e as Error).message).slice(0, 200) });
    console.error(`${slug}: ${(e as Error).message}`);
  } finally { fs.rmSync(lock, { force: true }); }
}

async function cmdBlog(pos: string[], args: string[], flag: (f: string) => boolean) {
  const sub = pos[0];
  const valueOf = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  if (sub === "tick") {
    const slugs = flag("--all") ? listBusinesses().profiles.map((p) => p.slug).filter((s) => readBlogConfig(s)) : [pos[1] ?? die("blog tick <slug|--all>")];
    for (const s of slugs) await blogTick(s);
    return;
  }
  const p = getProfile(pos[1] ?? "") ?? die(`no such business: ${pos[1]}`);
  const c = readBlogConfig(p.slug);
  switch (sub) {
    case "setup": {
      const site = valueOf("--site") ?? c?.site ?? p.sites[0] ?? die("blog setup <slug> --site https://…");
      const start = new Date();
      const cfg: BlogConfig = { ...(c ?? {}), mode: c?.mode ?? "auto", site, hour: Number(valueOf("--hour") ?? c?.hour ?? 6),
        approveUntil: c?.approveUntil ?? new Date(start.getTime() + 7 * 864e5).toISOString() };
      if (valueOf("--sc-account") && valueOf("--sc-site")) cfg.searchConsole = { account: valueOf("--sc-account")!, site: valueOf("--sc-site")! };
      writeBlogConfig(p.slug, cfg);
      return console.log(`blog set up for ${p.name}: ${cfg.site}, mode ${cfg.mode}, every post waits for you until ${cfg.approveUntil!.slice(0, 10)}, daily from ${cfg.hour}:00 ${p.timezone}`);
    }
    case "inputs":
      return console.log(JSON.stringify(await gatherInputs(p.slug, sydneyLike(p.timezone)), null, 2));
    case "write": {
      const r = await writeDraft(p.slug, sydneyLike(p.timezone));
      if (!r.ok) return die(`no draft: ${r.why}`);
      await checkDrafts(p.slug, r.draft);
      return console.log(`wrote ${r.draft}`);
    }
    case "check": {
      const done = await checkDrafts(p.slug, pos[2]);
      for (const d of done) console.log(`${d.file}\n${(d.meta.checks ?? []).map((x) => `  ${x.ok ? "ok " : "NO "} ${x.label}: ${x.detail}`).join("\n")}`);
      return;
    }
    case "show": {
      if (!c) return console.log(`${p.name} has no blog yet: npm run hq -- blog setup ${p.slug} --site https://…`);
      console.log(`${p.name} · ${c.site} · mode ${c.mode}${c.approveUntil ? ` · week one until ${c.approveUntil.slice(0, 10)}` : ""}`);
      for (const d of listDrafts(p.slug).slice(0, 20)) console.log(`${d.file.padEnd(48)} ${d.meta.status.padEnd(9)} ${decisionText(c, d.meta, new Date())}`);
      return;
    }
    case "approve": case "reject": case "reopen": {
      const d = setBlogStatus(p.slug, pos[2] ?? die(`blog ${sub} <slug> <draft>`), sub === "approve" ? "approved" : sub === "reject" ? "rejected" : "draft");
      return console.log(`${d.file}: ${d.meta.status}${c ? `. ${decisionText(c, d.meta, new Date())}` : ""}`);
    }
    case "note": {
      const d = addBlogNote(p.slug, pos[2] ?? die("blog note <slug> <draft> \"…\""), pos[3] ?? die("missing note text"));
      return console.log(`noted on ${d.file}`);
    }
    case "publish": {
      const r = await publishReady(p.slug, new Date(), { dryRun: flag("--dry-run") });
      return console.log(`published ${r.published.length}, waiting ${r.waiting.length}, failed ${r.failed.length}${flag("--dry-run") ? " (dry run: nothing left the Mac)" : ""}`);
    }
    case "mode": {
      if (!c) return die("set it up first: blog setup");
      const mode = pos[2] as BlogConfig["mode"];
      if (!["off", "draft", "auto"].includes(mode)) return die("blog mode <slug> off|draft|auto");
      writeBlogConfig(p.slug, { ...c, mode });
      return console.log(`${p.name}'s blog is now ${mode}`);
    }
    default:
      return die("blog: setup | inputs | write | check | show | approve | reject | reopen | note | publish | mode | tick");
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const flag = (f: string) => args.includes(f);
  const pos = args.filter((a) => !a.startsWith("--"));
  switch (cmd) {
    case "new-business":
      return cmdNewBusiness(pos[0]);
    case "list":
      return cmdList();
    case "use":
      return cmdUse(pos[0]);
    case "remove-business":
      return cmdRemove(pos[0], flag("--yes"));
    case "save-review": {
      const p = getProfile(pos[0] ?? "") ?? die(`no such business: ${pos[0]}`);
      const { file, note } = saveReview(p.slug, readInput(pos[1]));
      return console.log(`saved review\n  ${file}\n  ${note}`);
    }
    case "save-plan": {
      const p = getProfile(pos[0] ?? "") ?? die(`no such business: ${pos[0]}`);
      const { file, note } = savePlan(p.slug, pos[1] ?? die("missing department slug"), readInput(pos[2]));
      return console.log(`saved plan\n  ${file}\n  ${note}`);
    }
    case "done":
      setDone(pos[0] === "-" ? null : (pos[0] ?? null), pos[1] ?? die("missing finding id"), !flag("--undo"));
      return console.log(`${flag("--undo") ? "reopened" : "marked done"}: ${pos[1]}`);
    case "backup":
      switch (pos[0]) {
        case "init":
          return cmdBackupInit(pos[1]);
        case "run":
          return cmdBackupRun();
        case "restore-test":
          return cmdBackupRestoreTest();
        case "snapshots":
          return cmdBackupSnapshots();
        case "restore":
          return cmdBackupRestore(pos[1], pos[2]);
        default:
          return die("backup: init [repository] | run | restore-test | snapshots | restore <id|latest> <new-folder>");
      }
    case "services":
      switch (pos[0]) {
        case "init":
          return cmdServicesInit();
        case "add-defaults":
          return cmdServicesAddDefaults();
        case "install":
          return cmdServicesInstall();
        case "status":
          return cmdServicesStatus();
        case "start":
          return cmdServicesStart();
        case "stop":
          return cmdServicesStop();
        case "uninstall":
          return cmdServicesUninstall();
        default:
          return die("services: init | add-defaults | install | status | start | stop | uninstall");
      }
    case "connections":
      if (pos[0] === "save") {
        const snap = saveConnections(JSON.parse(readInput(pos[1])));
        return console.log(`saved connection snapshot: ${Object.keys(snap.toolkits).length} toolkits, checked ${snap.checkedAt}`);
      }
      if (pos[0] === "show" || !pos[0]) return cmdConnectionsShow();
      return die("connections: save <file.json|-> | show");
    case "caption-check": {
      // Hard rule: no em or en dashes in a caption. Exits 1 (and names the problem) when one is found.
      const text = readInput(pos[0]);
      const problems = captionProblems(text);
      if (problems.length) return die(`caption refused: ${problems.join("; ")}`);
      return console.log("caption ok: no em or en dashes");
    }
    case "script-check": {
      // Does a teleprompter script make sense to a stranger, and does it fit? Exits 1 on a problem.
      const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
      const slug = flag("--slug");
      const p = slug ? getProfile(slug) ?? die(`no such business: ${slug}`) : null;
      let speed = 1;
      if (p) {
        const f = path.join(businessDir(p.slug), "brand.json");
        speed = mergeBrand(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null).speed;
      }
      const own = p ? [p.name, p.slug].map((x) => x.toLowerCase()) : [];
      const report = checkScript(readInput(pos[0]), {
        speed,
        wpm: flag("--wpm") ? Number(flag("--wpm")) : undefined,
        targetSeconds: flag("--target") ? Number(flag("--target")) : undefined,
        keyword: flag("--keyword"),
        names: privateNames().filter((n) => !own.includes(n.toLowerCase())),
      });
      console.log(formatReport(report));
      if (report.problems.length) process.exit(1);
      return;
    }
    case "publishing":
      return cmdPublishing(pos[0]);
    case "log-post": {
      const p = getProfile(pos[0] ?? "") ?? die(`no such business: ${pos[0]}`);
      const post = JSON.parse(readInput(pos[1]));
      const { note } = logPost(p.slug, post);
      return console.log(`logged ${post.status} ${post.platform} post\n  ${note}`);
    }
    case "posts": {
      const p = getProfile(pos[0] ?? "") ?? die(`no such business: ${pos[0]}`);
      for (const x of listPosts(p.slug)) console.log(`${x.at.slice(0, 16)} ${x.platform.padEnd(10)} ${x.via.padEnd(10)} ${x.status.padEnd(9)} ${x.url ?? x.postId ?? ""}`);
      return;
    }
    case "competitors": {
      const daysArg = args.indexOf("--days");
      const days = daysArg >= 0 ? Number(args[daysArg + 1]) : 7;
      const p2 = pos.filter((x) => x !== String(days));
      switch (p2[0]) {
        case "sync":
          return cmdCompetitorsSync(p2[1]);
        case "changes":
          return cmdCompetitorsChanges(p2[1], days, flag("--json"));
        case "recheck":
          return cmdCompetitorsRecheck(p2[1]);
        case "log":
          return cmdCompetitorsLog(p2[1], p2[2], p2[3]);
        default:
          return die("competitors: sync <slug> | changes <slug> [--days N] [--json] | recheck <slug> | log <slug> <name> <file|->");
      }
    }
    case "support": {
      const usage = "support: refresh <slug|--all> | show <slug> | digest <slug>";
      if (pos[0] === "refresh") {
        const slugs = flag("--all") ? listBusinesses().profiles.filter((p) => supportConnected(p.slug)).map((p) => p.slug) : [pos[1] ?? die(usage)];
        let failed = 0;
        for (const slug of slugs) {
          try {
            const s = await runSupport(slug);
            const week = isoWeek(Date.now(), getProfile(slug)?.timezone || "UTC");
            const digest = digestWritten(slug, week) ? "digest already sent this week" : `digest sent: ${path.basename(writeSupportDigest(slug, s, week))}`;
            console.log(`ok ${slug} ${s.waiting.length} waiting, ${Object.values(s.themes).reduce((a, b) => a + b, 0)} conversations in 90 days · ${digest}`);
          } catch (e) { failed++; console.log(`failed ${slug}: ${e instanceof Error ? e.message : e}`); }
        }
        if (failed) process.exit(1);
        return;
      }
      if (pos[0] === "show" || pos[0] === "digest") {
        const p = getProfile(pos[1] ?? "") ?? die(`no such business: ${pos[1]}`);
        const st = supportState(p.slug);
        if (!st.snapshot) return die(`${p.slug}: no support snapshot${st.connected ? `; run: support refresh ${p.slug}` : " (no support connection)"}`);
        const s = st.snapshot, week = isoWeek(Date.now(), p.timezone || "UTC");
        if (pos[0] === "digest") return console.log(digestWritten(p.slug, week) ? `Already sent this week (Support themes ${week}).` : `Sent: ${writeSupportDigest(p.slug, s, week)}`);
        console.log(`${p.name} · support read ${s.observedAt}${st.stale ? " · STALE" : ""}`);
        console.log(`Waiting for a reply: ${s.waiting.length}${s.answerAt ? ` (answer at ${s.answerAt})` : ""}`);
        for (const w of s.waiting) console.log(`  ${w.ref}  ${w.theme} · ${w.channel}${w.openedFrom ? `, from ${w.openedFrom}` : ""} · last ${w.lastAt.slice(0, 10)}`);
        console.log(supportDigest(p.slug, s, week).body);
        return;
      }
      return die(usage);
    }
    case "finance": {
      if (pos[0] === "sync") {
        const slugs = flag("--all") ? listBusinesses().profiles.filter((p) => financeConnected(p.slug)).map((p) => p.slug) : [pos[1] ?? die("finance sync <slug> | --all")];
        let failed = 0;
        for (const slug of slugs) {
          try {
            const r = await syncFinance(slug);
            console.log(`ok ${slug} ${r.entries} daily totals, ${r.from ?? "-"} to ${r.to ?? "-"} ${JSON.stringify(r.byKind)}`);
          } catch (e) { failed++; console.log(`failed ${slug}: ${e instanceof Error ? e.message : e}`); }
        }
        if (failed) process.exit(1);
        if (loaded("com.hq.fava")) spawnSync("/bin/launchctl", ["kickstart", "-k", `gui/${uid()}/com.hq.fava`], { stdio: "ignore" });
        return;
      }
      if (pos[0] === "show") {
        const p = getProfile(pos[1] ?? "") ?? die(`no such business: ${pos[1]}`);
        const months = moneyByMonth(loadLedger(ledgerPath(p.slug)), p.currency).slice(-6);
        if (!months.length) return console.log(`${p.name}: the ledger has no income or costs yet${financeConnected(p.slug) ? "; run: finance sync " + p.slug : " (no finance connection)"}`);
        const f = (n: number) => formatValue("money", n, p.currency);
        console.log(`${p.name} · money in and out by month (${p.currency})`);
        for (const m of months) console.log(`${m.month}  in ${f(m.income - m.refunds).padStart(10)}  out ${f(m.costs).padStart(10)}  margin ${f(m.income - m.refunds - m.costs).padStart(10)}${Object.keys(m.byCost).length ? "  " + Object.entries(m.byCost).map(([k, v]) => `${k} ${f(v)}`).join(", ") : ""}`);
        return;
      }
      if (pos[0] !== "init") return die("finance: init <slug> | sync <slug|--all> | show <slug>");
      const p = getProfile(pos[1] ?? "") ?? die(`no such business: ${pos[1]}`);
      const file = initLedger(p);
      const check = which("bean-check") ? spawnSync("bean-check", [file], { encoding: "utf8" }) : null;
      console.log(`ledger: ${file}${check ? (check.status === 0 ? " (bean-check: OK)" : `\n${check.stderr}${check.stdout}`) : ""}`);
      if (loaded("com.hq.fava")) spawnSync("/bin/launchctl", ["kickstart", "-k", `gui/${uid()}/com.hq.fava`], { stdio: "ignore" });
      return;
    }
    case "lifecycle":
      return cmdLifecycle(args);
    case "workflows": {
      if (pos[0] !== "check") return die("workflows check <slug> | --all");
      const slugs = flag("--all")
        ? listBusinesses().profiles.filter((p) => workflowChecksState(p.slug).connected).map((p) => p.slug)
        : [pos[1] ?? die("workflows check <slug> | --all")];
      let failed = 0;
      for (const slug of slugs) {
        try {
          const c = await runWorkflowChecks(slug);
          for (const w of c.snapshot?.workflows ?? []) for (const k of w.checks) console.log(`${slug} · ${w.title} · ${k.ok ? "pass" : "FAIL"} · ${k.label}${k.detail ? ": " + k.detail : ""}`);
        } catch (e) { failed++; console.log(`failed ${slug}: ${e instanceof Error ? e.message : e}`); }
      }
      if (failed) process.exit(1);
      return;
    }
    case "analytics": {
      if (pos[0] === "refresh") {
        const slugs = flag("--all") ? listBusinesses().profiles.map((p) => p.slug) : [pos[1] ?? die("analytics refresh <slug> | --all")];
        let failed = 0;
        for (const slug of slugs) {
          try {
            const r = await runAnalytics(slug, new Date(), {
              openFindings: await fetchOpenFindings(slug),
              competitors: await fetchCompetitorChanges(slug, lastWeeks(12, Date.now(), getProfile(slug)?.timezone || "UTC"), getProfile(slug)?.timezone || "UTC", isoWeek),
            });
            const b = analyticsBoard(slug);
            console.log(`ok ${slug} ${b.coverage.measured}/${b.coverage.applicable} numbers, ${b.coverage.workflowsMeasured}/${b.coverage.workflows} workflows${r.demo ? " (demo)" : r.connected ? "" : " (no adapter)"}${r.adapterError ? ` · ADAPTER FAILED: ${r.adapterError}` : ""}`);
            if (r.adapterError) failed++;
          } catch (e) { failed++; console.log(`failed ${slug}: ${e instanceof Error ? e.message : e}`); }
        }
        if (failed) process.exit(1);
        return;
      }
      if (pos[0] === "show") {
        const p = getProfile(pos[1] ?? "") ?? die(`no such business: ${pos[1]}`);
        const b = analyticsBoard(p.slug);
        console.log(`${p.name} · ${b.coverage.measured}/${b.coverage.applicable} numbers measured · ${b.coverage.workflowsMeasured}/${b.coverage.workflows} workflows · read ${b.observedAt ?? "never"}${b.failed ? " · LAST ADAPTER RUN FAILED" : ""}`);
        const status = flag("--missing") ? "missing" : "measured";
        // --dept <slug>: only the numbers of workflows that department owns or has a step in.
        const di = args.indexOf("--dept"), dept = di >= 0 ? args[di + 1] : null;
        const mine = dept ? new Set(workflowsFor(dept).flatMap((w) => WORKFLOW_ANALYTICS[w.title] ?? [])) : null;
        if (dept) console.log(`numbers of the ${workflowsFor(dept).length} workflows ${dept} owns or works on`);
        for (const m of b.metrics.filter((x) => x.status === status && (!mine || mine.has(x.id))))
          console.log(`${m.def.lever.padEnd(7)} ${m.def.label.padEnd(40)} ${formatAnalytics(m.def.unit, m.value, p.currency).padStart(12)}  ${(m.from ?? "").padEnd(9)} ${m.note.slice(0, 90)}`);
        return;
      }
      return die("analytics: refresh <slug|--all> | show <slug> [--missing] [--dept <dept>]");
    }
    case "scorecard": {
      if (pos[0] === "refresh") {
        const slugs = flag("--all")
          ? listBusinesses().profiles.filter((p) => p.demo || scorecardState(p.slug).connected).map((p) => p.slug)
          : [pos[1] ?? die("scorecard refresh <slug> | --all")];
        let failed = 0;
        for (const slug of slugs) {
          try {
            const s = await runScorecard(slug);
            console.log(`ok ${slug} ${s.snapshot?.weeks[0].week}${s.demo ? " (demo)" : ""}`);
            // Workflow checks may read the fresh scorecard, so they run right after it (the daily job covers both).
            if (workflowChecksState(slug).connected) {
              try { const c = await runWorkflowChecks(slug); console.log(`checks ${slug} ${c.snapshot?.workflows.length ?? 0} workflows`); }
              catch (e) { console.log(`checks failed ${slug}: ${e instanceof Error ? e.message : e}`); }
            }
          } catch (e) {
            failed++;
            console.log(`failed ${slug}: ${e instanceof Error ? e.message : e}`);
          }
        }
        if (failed) process.exit(1);
        return;
      }
      if (pos[0] === "show") {
        const p = getProfile(pos[1] ?? "") ?? die(`no such business: ${pos[1]}`);
        const s = scorecardState(p.slug);
        if (!s.snapshot) return die(`${p.slug}: no scorecard yet${s.connected || s.demo ? "; run: scorecard refresh " + p.slug : " (no connection)"}`);
        console.log(`${p.name} · ${s.snapshot.weeks[0].week} · observed ${s.snapshot.observedAt}${s.stale ? " · STALE" : ""}${s.failed ? " · LAST RUN FAILED" : ""}${s.demo ? " · demo" : ""}`);
        for (const r of scorecardRows(s.snapshot))
          console.log(`${r.lever.padEnd(7)} ${r.label.padEnd(32)} ${formatValue(r.unit, r.value, s.snapshot.currency).padStart(12)}  ${r.quality}${r.note && r.quality !== "exact" ? "  " + r.note : ""}`);
        return;
      }
      if (pos[0] === "check-billing") {
        const p = getProfile(pos[1] ?? "") ?? die(`no such business: ${pos[1]}`);
        const file = path.join(hqData(), "businesses", p.slug, "scorecard-billing.json");
        if (!fs.existsSync(file)) return die(`${p.slug}: no ${file} (see /guides/scorecard-billing)`);
        const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
        const billing = await import("../templates/scorecard/billing-sources.mjs");
        const tierIn = (map: Record<string, string[]>) => (v: string) => Object.entries(map ?? {}).find(([, ids]) => ([] as string[]).concat(ids).includes(v))?.[0] ?? null;
        const tierByWord = (map: Record<string, string>) => (n: string) => Object.entries(map ?? {}).find(([, w]) => String(n).toLowerCase().includes(String(w).toLowerCase()))?.[0] ?? null;
        let failed = 0;
        if (cfg.stripe) {
          try {
            const s = await billing.fetchStripe({ keychainService: cfg.stripe.keychain, tierOf: tierIn(cfg.stripe.tiers), sinceMs: Date.now() - 30 * 86400e3, ignore: cfg.stripe.ignore });
            const now = billing.cardNow(s.subs);
            console.log(`stripe     ok  ${s.subs.length} subscriptions on your products, ${s.invoices.length} invoices in 30 days; paying ${JSON.stringify(now.byTier)}, trials ${now.trials}, set to cancel ${JSON.stringify(now.cancelling)}${now.discountsKnown ? "" : " (discounts unreadable)"}`);
          } catch (e) { failed++; console.log(`stripe     FAILED  ${e instanceof Error ? e.message : e}`); }
        } else console.log("stripe     not configured");
        if (cfg.appStore) {
          try {
            const a = await billing.fetchApple({ keychainService: cfg.appStore.keychain, keyId: cfg.appStore.keyId, issuerId: cfg.appStore.issuerId, vendorNumber: cfg.appStore.vendorNumber, tierOf: tierByWord(cfg.appStore.tiers) });
            console.log(`app store  ok  report ${a.day}: paying ${JSON.stringify(a.byTier)}, trials ${a.trials}, billing retry ${a.retry}, grace ${a.grace}`);
          } catch (e) { failed++; console.log(`app store  FAILED  ${e instanceof Error ? e.message : e}`); }
        } else console.log("app store  not configured");
        if (failed) process.exit(1);
        return;
      }
      return die("scorecard: refresh <slug|--all> | show <slug> | check-billing <slug>");
    }
    case "brain": {
      const sub = pos[0];
      const opt = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
      if (sub === "init") {
        const r = initBrain();
        return console.log(`HQ brain: ${r.hq}\n${r.made.length ? r.made.map((m) => `  made ${m}`).join("\n") : "  nothing to do: every brain already has its folders"}`);
      }
      if (sub === "read") {
        const p = getProfile(pos[1] ?? "") ?? die(`no such business: ${pos[1]}`);
        return console.log(readBundle(p.slug, pos[2] ?? die("missing department slug (or ceo)"), Number(opt("--chars") ?? 12000)));
      }
      if (sub === "write") {
        const scope = pos[1] === "hq" ? "hq" : "business";
        const slug = scope === "hq" ? null : (getProfile(pos[1] ?? "") ?? die(`no such business: ${pos[1]}`)).slug;
        const file = writeNote(scope, slug, JSON.parse(readInput(pos[2])) as NoteInput);
        return console.log(`wrote ${file}`);
      }
      if (sub === "promote") {
        const p = getProfile(pos[1] ?? "") ?? die(`no such business: ${pos[1]}`);
        const body = opt("--body");
        const file = promote(p.slug, pos[2] ?? die("missing note path (relative to the vault)"), { title: opt("--title"), body: body ? fs.readFileSync(body, "utf8") : undefined });
        return console.log(`promoted to the HQ brain: ${file}`);
      }
      if (sub === "show") {
        const p = getProfile(pos[1] ?? "") ?? die(`no such business: ${pos[1]}`);
        const s = brainStats(p.slug);
        console.log(`${"".padEnd(11)}${"HQ brain".padStart(9)}${p.name.slice(0, 18).padStart(20)}`);
        for (const t of NOTE_TYPES) console.log(`${TYPE_INFO[t].label.padEnd(11)}${String(s.counts.hq[t]).padStart(9)}${String(s.counts.business[t]).padStart(20)}`);
        if (!s.hqExists) console.log(`\nno HQ brain yet at ${hqBrainRoot()}: npm run hq -- brain init`);
        const c = candidates(p.slug);
        console.log(`\npromotion candidates (lessons with evidence): ${c.length}`);
        for (const n of c) console.log(`  ${n.rel}  [${n.meta.dept}] ${n.meta.title}`);
        return;
      }
      return die("brain: init | read <slug> <dept> | write <slug|hq> <note.json|-> | promote <slug> <note> | show <slug>");
    }
    case "experiment": {
      const p = getProfile(pos[1] ?? "") ?? die(`no such business: ${pos[1]}`);
      const valueOf = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
      const num = (v?: string) => (v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : die(`not a number: ${v}`));
      if (pos[0] === "add") {
        const e = addExperiment(p.slug, { hypothesis: pos[2] ?? "", metric: (valueOf("--metric") ?? "") as never, baseline: num(valueOf("--baseline")) });
        console.log(`experiment ${e.id} started: ${e.hypothesis} (${e.metric}, ${e.lever})`);
      } else if (pos[0] === "close") {
        const verdict = pos[3] as Verdict;
        if (!["won", "lost", "inconclusive"].includes(verdict)) return die("experiment close <slug> <id> won|lost|inconclusive [--result N] [--note \"…\"]");
        const e = closeExperiment(p.slug, Number(pos[2]), { verdict, result: num(valueOf("--result")), note: valueOf("--note") });
        console.log(`experiment ${e.id}: ${e.status}`);
      } else if (pos[0] === "list") {
        for (const e of listExperiments(p.slug)) console.log(`${String(e.id).padStart(3)}  ${e.status.padEnd(12)} ${e.metric.padEnd(22)} ${e.hypothesis}`);
        return;
      } else return die("experiment: add | close | list");
      const vdir = path.join(vaultRoot(p), "Departments", "Data & Analytics");
      fs.mkdirSync(vdir, { recursive: true });
      fs.writeFileSync(path.join(vdir, "Experiments.md"), experimentsMarkdown(listExperiments(p.slug)));
      return;
    }
    case "blog":
      return cmdBlog(pos, args, flag);
    case "doctor":
      return cmdDoctor();
    default: {
      const lines = fs.readFileSync(new URL(import.meta.url), "utf8").split("\n");
      const head = lines.slice(0, lines.findIndex((l) => l.startsWith("// Health")) + 1).join("\n");
      console.log(head.replace(/^\/\/ ?/gm, ""));
      if (cmd && cmd !== "help") process.exit(1);
    }
  }
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
