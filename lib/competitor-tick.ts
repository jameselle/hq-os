// The weekly competitor brief, end to end with no owner step (`hq competitors tick <slug|--all>`, launchd job
// com.hq.competitors, Monday 07:00). For each business with competitors and no brief yet this week (Monday to Sunday, its timezone): sync the
// watches, recheck every page, gather the week's changes with their diffs and the rivals' recent uploads, then run
// Claude Code headless with the /hq:competitors skill, allowed only to read, search and fetch the web, and write in
// this run's folder (plans/competitors/research/<date>/). HQ checks what it wrote, saves the brief as the
// department's plan (so the CEO and `host.intel.lastBriefAt` see it) and in vault/Competitors/Briefs, files the
// department hand-offs as brain signals and appends the competitor log entries. Every run, good or failed, goes
// in plans/competitors/runs.jsonl; a failed one is a CEO finding (lib/competitor-brief.ts briefRunFinding).
// Shared by the CLI and the site. The watcher's API token is read from the Keychain, held in memory, never printed.

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";

import { readBundle, writeNote } from "./brain-store";
import { receiversFrom } from "./brain";
import { claudeBin } from "./blog-writer";
import {
  briefDue, checkBrief, coverageSection, parseLogEntries, parseSignals, writerArgs, writerPrompt,
  type BriefRun, type WriterPaths,
} from "./competitor-brief";
import { WATCHER_KEYCHAIN, WATCHER_PORT, WATCHER_URL, competitorFromTitle, competitorNoteHead, recentChanges, shortUrl, watchTag, watchTargets, type WatchRow } from "./competitors";
import type { Profile } from "./profile";
import { businessDir, getProfile, hqRoot, latestPlan, listBusinesses, savePlan, setDone, stamp, vaultRoot } from "./store";

// ---------- the watcher (changedetection.io), without exiting the process on errors ----------

export type ApiWatch = { url: string; title: string; last_changed: number; last_checked: number; last_error: string | false | null };

export type Watcher = {
  up(): Promise<boolean>;
  list(tag: string): Promise<Record<string, ApiWatch>>;
  create(w: { url: string; title: string; tag: string }): Promise<void>;
  recheck(uuid: string): Promise<void>;
  history(uuid: string): Promise<Record<string, string>>;
  diff(uuid: string, from: string, to: string): Promise<string>;
};

function portOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    const done = (ok: boolean) => { s.destroy(); resolve(ok); };
    s.setTimeout(1500, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

export function liveWatcher(): Watcher {
  let token: string | null = null;
  const key = () => {
    if (token) return token;
    const r = spawnSync("/usr/bin/security", ["find-generic-password", "-s", WATCHER_KEYCHAIN, "-w"], { encoding: "utf8" });
    if (r.status !== 0) throw Error("no changedetection.io token in the Keychain (see /hq:competitors setup)");
    return (token = r.stdout.trim());
  };
  const call = async (pathname: string, init: RequestInit = {}): Promise<string> => {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
    try {
      const res = await fetch(`${WATCHER_URL}${pathname}`, { ...init, signal: ctl.signal, headers: { "x-api-key": key(), "Content-Type": "application/json", ...(init.headers ?? {}) } });
      const text = await res.text();
      if (!res.ok) throw Error(`changedetection.io ${res.status} on ${pathname.split("?")[0]}`);
      return text;
    } finally { clearTimeout(t); }
  };
  const json = async <T>(p: string, init?: RequestInit) => JSON.parse(await call(p, init)) as T;
  return {
    up: () => portOpen(WATCHER_PORT),
    list: (tag) => json(`/api/v1/watch?tag=${encodeURIComponent(tag)}`),
    create: async (w) => { await call("/api/v1/watch", { method: "POST", body: JSON.stringify(w) }); },
    recheck: async (uuid) => { await call(`/api/v1/watch/${uuid}?recheck=1`); },
    history: (uuid) => json(`/api/v1/watch/${uuid}/history`),
    diff: (uuid, from, to) => call(`/api/v1/watch/${uuid}/difference/${from}/${to}?format=text&changesOnly=true&no_markup=true`),
  };
}

const toRows = (list: Record<string, ApiWatch>, profile: Profile): WatchRow[] =>
  Object.entries(list).map(([uuid, w]) => ({
    uuid,
    competitor: competitorFromTitle(w.title, profile),
    url: w.url,
    lastChanged: w.last_changed ? new Date(w.last_changed * 1000).toISOString() : null,
    lastChecked: w.last_checked ? new Date(w.last_checked * 1000).toISOString() : null,
    error: w.last_error || null,
  }));

// ---------- recent uploads (yt-dlp, public listings only) ----------

export type RunCmd = (bin: string, args: string[], timeoutMs: number) => Promise<{ code: number; stdout: string }>;

const execRun: RunCmd = (bin, args, timeoutMs) => new Promise((resolve) => {
  execFile(bin, args, { timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024 }, (err, stdout) =>
    resolve({ code: err ? 1 : 0, stdout: String(stdout ?? "") }));
});

function ytDlp(): string | null {
  return [path.join(os.homedir(), ".local", "bin", "yt-dlp"), "/opt/homebrew/bin/yt-dlp", "/usr/local/bin/yt-dlp"].find((p) => fs.existsSync(p)) ?? null;
}

export type Upload = { competitor: string; platform: string; channel: string; ok: boolean; items: string[] };

/** The last 10 uploads per public YouTube or TikTok channel listed in the profile. Best effort; a miss is reported. */
export async function recentUploads(profile: Profile, run: RunCmd = execRun, bin: string | null = ytDlp()): Promise<Upload[]> {
  const out: Upload[] = [];
  for (const c of profile.competitors ?? []) {
    for (const [platform, channel] of Object.entries(c.channels ?? {})) {
      let target: string | null = null, extra: string[] = [];
      if (platform === "youtube") { target = `${channel.replace(/\/+$/, "")}/videos`; extra = ["--extractor-args", "youtubetab:approximate_date"]; }
      else if (platform === "tiktok") target = c.channels?.tiktok_id ? `tiktokuser:${c.channels.tiktok_id}` : channel;
      if (!target) continue;
      if (!bin) { out.push({ competitor: c.name, platform, channel, ok: false, items: [] }); continue; }
      const r = await run(bin, ["--flat-playlist", ...extra, "-I", "1:10", "--print", "%(upload_date)s | %(view_count)s views | %(webpage_url)s | %(title).90s", target], 90e3);
      const items = r.stdout.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 10);
      out.push({ competitor: c.name, platform, channel, ok: r.code === 0 && items.length > 0, items });
    }
  }
  return out;
}

// ---------- disk ----------

export const competitorsDir = (slug: string) => path.join(businessDir(slug), "plans", "competitors");
const runsFile = (slug: string) => path.join(competitorsDir(slug), "runs.jsonl");

export function logRun(slug: string, run: BriefRun) {
  fs.mkdirSync(competitorsDir(slug), { recursive: true });
  fs.appendFileSync(runsFile(slug), JSON.stringify(run) + "\n");
}

export function readRuns(slug: string): BriefRun[] {
  try {
    return fs.readFileSync(runsFile(slug), "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as BriefRun]; } catch { return []; } });
  } catch { return []; }
}

/** The newest run that did something (a brief or a failure); skips aren't logged. */
export const lastBriefRun = (slug: string): BriefRun | null => readRuns(slug).at(-1) ?? null;

const noteName = (name: string) => name.replace(/[\\/:*?"<>|]/g, "-");
const competitorNote = (p: Profile, name: string) => path.join(vaultRoot(p), "Competitors", `${noteName(name)}.md`);

function appendLog(p: Profile, name: string, markdown: string, date: string) {
  const c = p.competitors?.find((x) => x.name === name);
  if (!c) return;
  const file = competitorNote(p, name);
  if (!fs.existsSync(file)) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, competitorNoteHead(p, c)); }
  fs.appendFileSync(file, `\n### ${date}\n${markdown.trim()}\n`);
}

const readJson = (file: string): unknown => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return undefined; } };

// ---------- one business ----------

export type RunWriter = (bin: string, args: string[], cwd: string, timeoutMs: number) => Promise<{ code: number; stdout: string }>;

const execWriter: RunWriter = (bin, args, cwd, timeoutMs) => new Promise((resolve) => {
  execFile(bin, args, { cwd, timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024, env: { ...process.env, HOME: os.homedir() } },
    (err, stdout) => resolve({ code: err ? 1 : 0, stdout: String(stdout ?? "") }));
});

export type TickDeps = {
  watcher?: Watcher;
  runWriter?: RunWriter;
  runCmd?: RunCmd;
  claude?: string | null;
  ytDlp?: string | null;
  /** How long to give the watcher's rechecks before reading changes. */
  recheckWaitMs?: number;
  writerTimeoutMs?: number;
  now?: () => Date;
  say?: (line: string) => void;
};

export type TickResult = { slug: string; status: "skipped" | "ok" | "failed"; why?: string; plan?: string; brief?: string; signals?: number; costUsd?: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run the weekly brief for one business if it's due (or `force`). Never throws; a failure is logged and returned. */
export async function tickBusiness(slug: string, opts: { force?: boolean } = {}, deps: TickDeps = {}): Promise<TickResult> {
  const now = deps.now ?? (() => new Date());
  const say = deps.say ?? (() => {});
  const p = getProfile(slug);
  if (!p) return { slug, status: "skipped", why: "no such business" };
  if (!p.competitors?.length) return { slug, status: "skipped", why: "lists no competitors" };
  const last = latestPlan(slug, "competitors")?.at ?? null;
  if (!opts.force && !briefDue(last, now(), p.timezone || "UTC")) return { slug, status: "skipped", why: `brief already saved this week (${last?.slice(0, 10)}; weeks run Monday to Sunday in ${p.timezone || "UTC"})` };

  const dir = competitorsDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, "run.lock");
  if (fs.existsSync(lock) && now().getTime() - fs.statSync(lock).mtimeMs < 60 * 60e3) return { slug, status: "skipped", why: "a run is already going" };
  fs.writeFileSync(lock, String(process.pid));

  const { date } = stamp(p, now());
  const research = path.join(dir, "research", date);
  const paths: WriterPaths = {
    research, inputs: path.join(research, "inputs.json"), brief: path.join(research, "brief.md"),
    signals: path.join(research, "signals.json"), log: path.join(research, "log.json"), notes: path.join(research, "notes.md"),
  };
  const fail = (why: string, extra: Partial<BriefRun> = {}): TickResult => {
    logRun(slug, { at: now().toISOString(), ok: false, why: why.slice(0, 300), ...extra });
    return { slug, status: "failed", why };
  };

  try {
    fs.mkdirSync(research, { recursive: true });
    for (const f of [paths.brief, paths.signals, paths.log]) fs.rmSync(f, { force: true }); // a rerun starts clean

    // 1. The watcher: sync, recheck, then the week's changes with their diffs.
    const w = deps.watcher ?? liveWatcher();
    let rows: WatchRow[] | null = null;
    const changes: (WatchRow & { diff?: string })[] = [];
    let watcherNote = "";
    if (await w.up()) {
      try {
        const tag = watchTag(slug);
        const have = new Set(Object.values(await w.list(tag)).map((x) => x.url));
        for (const t of watchTargets(p)) if (!have.has(t.url)) { await w.create({ url: t.url, title: t.title, tag }); say(`${slug}: watching ${t.title}`); }
        for (const c of p.competitors) {
          const file = competitorNote(p, c.name);
          if (!fs.existsSync(file)) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, competitorNoteHead(p, c)); }
        }
        const before = toRows(await w.list(tag), p);
        for (const r of before) await w.recheck(r.uuid);
        say(`${slug}: rechecking ${before.length} page(s)`);
        if (deps.recheckWaitMs ?? 90e3) await sleep(deps.recheckWaitMs ?? 90e3);
        rows = toRows(await w.list(tag), p);
        for (const r of recentChanges(rows, 7, now())) {
          const ts = Object.keys(await w.history(r.uuid)).sort();
          let diff: string | undefined;
          if (ts.length >= 2) diff = (await w.diff(r.uuid, ts.at(-2)!, ts.at(-1)!)).trim().slice(0, 3000);
          changes.push({ ...r, diff });
        }
      } catch (e) {
        rows = null;
        watcherNote = `the watcher answered but couldn't be read: ${(e as Error).message}`;
      }
    } else watcherNote = "the watcher (changedetection.io on 127.0.0.1:5010) isn't running";
    if (watcherNote) say(`${slug}: ${watcherNote}; the brief goes ahead without page changes`);

    // 2. Recent uploads, the brain and last week's brief.
    const uploads = await recentUploads(p, deps.runCmd ?? execRun, deps.ytDlp !== undefined ? deps.ytDlp : ytDlp());
    let brain = "";
    try { brain = readBundle(slug, "competitors", 8000); } catch { /* no brain yet */ }
    const vaultDir = path.join(vaultRoot(p), "Competitors");
    const inputs = {
      date,
      business: { name: p.name, offer: p.offer, audience: p.audience, country: p.country, regulated: p.regulated, sites: p.sites, brandVoice: p.brandVoice ?? "" },
      competitors: p.competitors.map((c) => ({ name: c.name, site: c.site ?? null, channels: c.channels ?? {}, watch: c.watch ?? [], notes: c.notes ?? "", vaultNote: competitorNote(p, c.name) })),
      watcher: rows ? { watched: rows.length, errors: rows.filter((r) => r.error).map((r) => ({ competitor: r.competitor, url: r.url, error: r.error })) } : { watched: null, note: watcherNote },
      changes: changes.map((c) => ({ competitor: c.competitor, url: c.url, page: shortUrl(c.url), changedAt: c.lastChanged, diff: c.diff ?? null })),
      content: uploads,
      brain,
      lastBrief: latestPlan(slug, "competitors")?.markdown ?? null,
      vaultNotes: fs.existsSync(vaultDir) ? fs.readdirSync(vaultDir).filter((f) => f.endsWith(".md")).map((f) => path.join(vaultDir, f)) : [],
    };
    fs.writeFileSync(paths.inputs, JSON.stringify(inputs, null, 2));

    // 3. The writer.
    const bin = deps.claude !== undefined ? deps.claude : claudeBin();
    if (!bin) return fail("Claude Code isn't installed where HQ can find it (set CLAUDE_BIN)", { changed: changes.length, watched: rows?.length });
    const skillFile = path.join(hqRoot(), "plugin", "skills", "competitors", "SKILL.md");
    if (!fs.existsSync(skillFile)) return fail("the competitors skill is missing from the plugin folder");
    const prompt = writerPrompt(fs.readFileSync(skillFile, "utf8"), paths, date, changes.length);
    say(`${slug}: writing the brief (${changes.length} changed page(s), ${uploads.filter((u) => u.ok).length} upload listing(s))`);
    const out = await (deps.runWriter ?? execWriter)(bin, writerArgs(prompt, paths), research, deps.writerTimeoutMs ?? 30 * 60e3);
    let costUsd: number | undefined, summary = "", isError = out.code !== 0;
    try { const j = JSON.parse(out.stdout); costUsd = j.total_cost_usd; isError = isError || Boolean(j.is_error); summary = String(j.result ?? "").slice(0, 200); } catch { /* not JSON */ }
    if (!fs.existsSync(paths.brief)) return fail(isError ? `the writer stopped without a brief: ${summary || "no output"}` : "the writer finished without a brief", { costUsd, changed: changes.length, watched: rows?.length });

    // 4. HQ's checks, then save.
    const checked = checkBrief(fs.readFileSync(paths.brief, "utf8"), { changed: changes.length, rivals: p.competitors.map((c) => c.name) });
    if (checked.problems.length) return fail(`the brief failed HQ's checks (kept at ${paths.brief}): ${checked.problems.join("; ")}`, { costUsd, changed: changes.length, watched: rows?.length });
    const markdown = `${checked.markdown}\n\n${coverageSection({
      watched: rows?.length ?? null, changed: changes.length, date,
      errors: (rows ?? []).filter((r) => r.error).map((r) => ({ competitor: r.competitor, url: shortUrl(r.url) })),
      content: uploads.map((u) => ({ competitor: u.competitor, platform: u.platform, ok: u.ok })),
    })}\n`;
    const saved = savePlan(slug, "competitors", markdown, now());
    const vaultBrief = path.join(vaultDir, "Briefs", `${date} Competitor brief.md`);
    fs.mkdirSync(path.dirname(vaultBrief), { recursive: true });
    fs.writeFileSync(vaultBrief, `---\ntype: "competitor-brief"\nbusiness: ${JSON.stringify(p.name)}\ndate: "${date}"\n---\n\n${markdown}`);

    // 5. The brain: one signal per department hand-off.
    const { signals, dropped } = parseSignals(readJson(paths.signals), receiversFrom("competitors"), p.competitors.map((c) => c.name));
    let filed = 0;
    for (const s of signals) {
      try { writeNote("business", slug, { type: "signal", dept: "competitors", to: s.to, title: s.title, body: s.body, evidence: s.evidence }); filed++; }
      catch (e) { dropped.push(`"${s.title.slice(0, 40)}": ${(e as Error).message}`); }
    }
    for (const d of dropped) say(`${slug}: signal not filed: ${d}`);

    // 6. The competitor notes, and the CEO's "pages changed" finding marked read.
    const entries = parseLogEntries(readJson(paths.log), p.competitors.map((c) => c.name));
    for (const e of entries) appendLog(p, e.competitor, e.markdown, date);
    setDone(slug, "competitors-changed", true);

    logRun(slug, { at: now().toISOString(), ok: true, plan: path.basename(saved.file), changed: changes.length, watched: rows?.length, signals: filed, costUsd,
      ...(dropped.length ? { why: `signals not filed: ${dropped.join("; ").slice(0, 250)}` } : {}) });
    return { slug, status: "ok", plan: saved.file, brief: vaultBrief, signals: filed, costUsd };
  } catch (e) {
    return fail(`the run broke: ${(e as Error).message}`);
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

/** Every business with competitors (or the ones named). */
export async function tick(slugs: string[] | "all", opts: { force?: boolean } = {}, deps: TickDeps = {}): Promise<TickResult[]> {
  const list = slugs === "all" ? listBusinesses().profiles.filter((p) => p.competitors?.length && !p.demo).map((p) => p.slug) : slugs;
  const out: TickResult[] = [];
  for (const s of list) out.push(await tickBusiness(s, opts, deps));
  return out;
}
