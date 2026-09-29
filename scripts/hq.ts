// hq: the command line behind the HQ skills. Run from the repo root:
//
//   npm run hq -- <command> [args]
//
// Businesses   new-business <profile.json> · list · use <slug> · remove-business <slug> --yes
// Writing      save-review <slug> <file.md|-> · save-plan <slug> <dept> <file.md|-> · done <slug|-> <finding-id> [--undo]
// Backups      backup init [repository] · backup run · backup restore-test · backup snapshots · backup restore <id|latest> <new-folder>
// Services     services init · services add-defaults · services install · services status · services start · services stop · services uninstall
// Publishing   connections save <file.json|-> · connections show · publishing <slug> · log-post <slug> <post.json|->
// Competitors  competitors sync <slug> · competitors changes <slug> [--days N] [--json] · competitors log <slug> <name> <file|-> · competitors recheck <slug>
// Tools        finance init <slug>
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

import { backupIsExternal } from "../lib/ceo";
import { validateProfile } from "../lib/profile";
import { PLATFORMS, channelStatuses, resolveRoute } from "../lib/publishing";
import { WATCHER_KEYCHAIN, WATCHER_URL, competitorFromTitle, competitorNoteHead, recentChanges, shortUrl, watchTag, watchTargets, type WatchRow } from "../lib/competitors";
import {
  businessDir,
  getProfile,
  hqData,
  initLedger,
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
  const paths = backupPaths();
  // Recorded BEFORE restic starts: a file changed while the backup runs may or may not be
  // in the snapshot, so the restore test must treat anything newer than this as "edited since".
  const startedAt = new Date().toISOString();
  const r = spawnSync(
    restic(),
    ["backup", "--json", "--tag", "hq", "--exclude", "*.tmp", "--exclude", ".DS_Store", "--exclude", "*/studio/*.mp4", "--exclude", "*/studio/*/*.mp4", "--exclude", "*/studio/*/*/*.mp4", "--exclude", "*/studio/**/*.aiff", "--exclude", "*/studio/**/*.wav", "--exclude", path.join(hqData(), "logs"), ...paths],
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
  writeConfig({ ...readConfig(), backup: { ...cfg.backup!, lastSnapshot: { id: summary.snapshot_id, at: startedAt } } });
  console.log(
    `snapshot ${summary.snapshot_id.slice(0, 8)}: ${summary.total_files_processed} files, ${Math.round((summary.data_added ?? 0) / 1024)} KiB new, paths: ${paths.join(", ")}`,
  );
}

function sha256(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (p !== path.join(hqData(), "logs")) walk(p, out);
    } else if (e.isFile() && !e.name.endsWith(".tmp") && e.name !== ".DS_Store") out.push(p);
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
    {
      label: "com.hq.backup",
      description: "Nightly restic backup of HQ data, weekly restore test",
      program: ["/bin/sh", "-c", `${node} run hq -- backup run && if [ "$(date +%u)" = "7" ]; then ${node} run hq -- backup restore-test; fi`],
      cwd: hqRoot(),
      keepAlive: false,
      schedule: { Hour: 2, Minute: 30 },
    },
  ];
  const postiz = path.join(HOME, "postiz-app");
  const pg = opt("pg17", "package", "native", "bin", "postgres");
  if (fs.existsSync(postiz) && fs.existsSync(pg)) {
    const data = vardir("postiz");
    services.push(
      { label: "com.hq.postiz.postgres", description: "Postgres for Postiz (and Listmonk)", program: [pg, "-D", path.join(data, "pg"), "-p", "5432", "-k", "/tmp"], keepAlive: true, port: 5432 },
      {
        label: "com.hq.postiz.redis",
        description: "Redis for Postiz",
        program: [opt("redis", "bin", "redis-server"), "--port", "6379", "--dir", data, "--daemonize", "no"],
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

/** Add default services that aren't in services.json yet (e.g. a tool installed since init). Never edits existing ones. */
function cmdServicesAddDefaults() {
  const current = readServices();
  const have = new Set(current.map((x) => x.label));
  const added = defaultServices().filter((x) => !have.has(x.label));
  if (!added.length) return console.log("services.json already has every default service");
  fs.writeFileSync(servicesFile(), JSON.stringify({ services: [...current, ...added] }, null, 2) + "\n");
  console.log(`added: ${added.map((x) => x.label).join(", ")} — now run: services install`);
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
    case "finance": {
      if (pos[0] !== "init") return die("finance: init <slug>");
      const p = getProfile(pos[1] ?? "") ?? die(`no such business: ${pos[1]}`);
      const file = initLedger(p);
      const check = which("bean-check") ? spawnSync("bean-check", [file], { encoding: "utf8" }) : null;
      console.log(`ledger: ${file}${check ? (check.status === 0 ? " (bean-check: OK)" : `\n${check.stderr}${check.stdout}`) : ""}`);
      if (loaded("com.hq.fava")) spawnSync("/bin/launchctl", ["kickstart", "-k", `gui/${uid()}/com.hq.fava`], { stdio: "ignore" });
      return;
    }
    case "doctor":
      return cmdDoctor();
    default: {
      const head = fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(0, 12).join("\n");
      console.log(head.replace(/^\/\/ ?/gm, ""));
      if (cmd && cmd !== "help") process.exit(1);
    }
  }
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
