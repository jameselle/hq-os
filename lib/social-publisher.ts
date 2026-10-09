// Automatic posting: puts out the posts HQ posts itself (networks with posting "hq") on their day, reads each one
// back and records its link. The pure rules and the workbench code are in lib/social-publish.ts (read its header
// for why the Composio workbench and how images travel). The calls that leave the Mac go through PublishDeps, so
// tests and --dry-run swap them out. Server-only.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

import { claudeBin } from "./blog-writer";
import { captionProblems, type ChannelSpec } from "./publishing";
import { altText, attemptsAllowed, buildPayload, dueNow, fullCaption, instagramCells, newRun, pinterestCells, resultsFromStream, slotsCell, workbenchPrompt, type CellResult } from "./social-publish";
import { INSIGHTS_EVERY_H, insightsCell, summariseInsights, type InsightsFile } from "./social-insights";
import { asSlideshow, checkSocial, weekOf, type SocialConfig } from "./social";
import { findSocial, listSocial, markPosted, mediaPath, readSocialConfig, saveSocial, setSocialStatus, socialContext, socialDir, socialLog, type SocialFile } from "./social-store";
import { businessDir, getProfile, listBusinesses, logPost } from "./store";

export type WorkbenchRun = { results: CellResult[]; costUsd?: number; why?: string };
export type PublishDeps = {
  /** Runs the cells in the Composio workbench and returns their HQ_RESULT lines. */
  workbench(cells: string[], run: string): Promise<WorkbenchRun>;
  /** Uploads a local file to a presigned slot. */
  put(url: string, file: string, mimetype: string): Promise<void>;
  /** sha256 of what a URL serves. */
  sha(url: string): Promise<string>;
  /** Converts a PNG card to JPEG (Instagram takes JPEG only). */
  toJpeg(src: string, dest: string): Promise<void>;
  now(): Date;
};

export type PublishMode = "publish" | "container" | "check";
export type PublishOutcome = { id: string; network: string; format: string; status: "posted" | "found" | "failed" | "retry" | "container" | "checked" | "dry-run" | "skipped"; detail: string; url?: string };

// ---------------------------------------------------------------- the real calls

/** Claude Code headless, allowed one tool: the Composio workbench. Its stream is parsed here and not kept, since
 *  the slot cell's output holds short-lived upload links. */
export async function headlessWorkbench(cells: string[], run: string, timeoutMs = 12 * 60e3, role?: string): Promise<WorkbenchRun> {
  const bin = claudeBin();
  if (!bin) return { results: [], why: "Claude Code isn't installed where HQ can find it (set CLAUDE_BIN)" };
  const cwd = path.join(os.tmpdir(), "hq-social-run");
  fs.mkdirSync(cwd, { recursive: true });
  const args = ["-p", workbenchPrompt(cells, role), "--output-format", "stream-json", "--verbose", "--max-turns", String(cells.length * 2 + 6),
    "--model", process.env.HQ_SOCIAL_MODEL || "sonnet", "--allowedTools", "mcp__claude_ai_Composio__COMPOSIO_REMOTE_WORKBENCH"];
  const out = await new Promise<{ code: number; stdout: string }>((resolve) => {
    execFile(bin, args, { cwd, timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, HOME: os.homedir() } },
      (err, stdout) => resolve({ code: err ? 1 : 0, stdout: String(stdout ?? "") }));
  });
  let costUsd: number | undefined, summary = "";
  for (const line of out.stdout.split("\n")) {
    try { const j = JSON.parse(line); if (j.type === "result") { costUsd = j.total_cost_usd; summary = String(j.result ?? "").slice(0, 200); } } catch { /* not JSON */ }
  }
  const results = resultsFromStream(out.stdout, run);
  return { results, costUsd, why: results.length ? undefined : `the ${role ? "workbench" : "posting"} run returned nothing${summary ? `: ${summary}` : out.code ? " (it stopped or timed out)" : ""}` };
}

async function put(url: string, file: string, mimetype: string) {
  const r = await fetch(url, { method: "PUT", body: fs.readFileSync(file), headers: { "Content-Type": mimetype } });
  if (!r.ok) throw Error(`upload refused (${r.status})`);
}
async function sha(url: string) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw Error(`media link returned ${r.status}`);
  return crypto.createHash("sha256").update(Buffer.from(await r.arrayBuffer())).digest("hex");
}
async function toJpeg(src: string, dest: string) {
  const run = (bin: string, args: string[]) => new Promise<boolean>((res) => execFile(bin, args, { timeout: 60e3 }, (e) => res(!e && fs.existsSync(dest))));
  if (fs.existsSync("/usr/bin/sips") && await run("/usr/bin/sips", ["-s", "format", "jpeg", "-s", "formatOptions", "92", src, "--out", dest])) return;
  if (await run("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-q:v", "2", dest])) return;
  throw Error("couldn't convert the cards to JPEG (needs sips on macOS, or ffmpeg)");
}

export const realDeps: PublishDeps = { workbench: headlessWorkbench, put, sha, toJpeg, now: () => new Date() };

/** Stand-ins that never leave the Mac: --dry-run uses them, and they throw if anything tries to call out. */
export const offlineDeps = (now = new Date()): PublishDeps => {
  const no = async (): Promise<never> => { throw Error("dry run: no external calls"); };
  return { workbench: no, put: no, sha: no, toJpeg: no, now: () => now };
};

// ---------------------------------------------------------------- one post

const sha256File = (f: string) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

/** The Composio account a network posts through: pinned in the profile's channels, never guessed (Composio's
 *  default account for a toolkit is whichever was connected last). */
export function postingAccount(channels: Record<string, ChannelSpec> | undefined, network: string): { account?: string; handle?: string } {
  const spec = channels?.[network];
  if (!spec) return {};
  if (typeof spec === "string") return { handle: spec };
  return { account: spec.account, handle: spec.handle };
}

/** `format` is what the post goes out as: a carousel set up as a slideshow goes out as a reel. */
export type Plan = { d: SocialFile; c: SocialConfig; account: string; handle?: string; board?: string; format: string; files: { abs: string; mimetype: string }[] };

function plan(slug: string, id: string): Plan | string {
  const p = getProfile(slug), c = readSocialConfig(slug);
  if (!p || !c) return "no social plan set up for this business";
  const d = findSocial(slug, id);
  const { account, handle } = postingAccount(p.channels as Record<string, ChannelSpec>, d.network);
  if (!account) return `no ${d.network} account pinned: add "account" (the Composio connection id) to channels.${d.network} in the business profile`;
  const h = (handle ?? c.networks[d.network]?.handle ?? "").replace(/^@/, "");
  if (d.network === "instagram" && !h) return "no Instagram handle in the profile to check the account against";
  const board = d.network === "pinterest" ? d.board ?? c.networks.pinterest?.board : undefined;
  if (d.network === "pinterest" && !board) return `no Pinterest board: set networks.pinterest.board (a board id) in social.json, or "board" on the post`;
  let files: Plan["files"];
  if (asSlideshow(c, d)) {
    // Never falls back to a silent carousel: the owner asked for music on these.
    const v = d.reel?.path ? mediaPath(slug, d.reel.path, ".mp4") : null;
    if (!v) return `the slideshow Reel isn't made yet${d.error?.startsWith("slideshow") ? ` (${d.error})` : " (social check makes it from the slides, with music)"}`;
    files = [{ abs: v, mimetype: "video/mp4" }];
  } else if (d.format === "reel") {
    const v = d.video?.path ? path.resolve(businessDir(slug), d.video.path) : "";
    if (!v || !fs.existsSync(v) || !/\.(mp4|mov)$/i.test(v)) return "the reel's video file isn't there";
    files = [{ abs: v, mimetype: /\.mov$/i.test(v) ? "video/quicktime" : "video/mp4" }];
  } else {
    const abs = (d.media ?? []).map((m) => mediaPath(slug, m));
    if (!abs.length || abs.some((x) => !x)) return "the post's cards aren't rendered (run social check)";
    files = abs.map((x) => ({ abs: x!, mimetype: "image/jpeg" }));
  }
  return { d, c, account, handle: h || undefined, board, format: asSlideshow(c, d) ? "reel" : d.format, files };
}

/** Why this post may not go out right now, checked afresh just before any call: only approved posts, every check
 *  passing on the text as it is now (the caption-check's dashes, the regulated and never-name rules), and an account
 *  no other business has pinned. "" when it may go. */
export function prePostProblem(slug: string, pl: Plan, mode: PublishMode): string {
  const d = pl.d;
  if (mode === "publish" && d.status !== "approved") return `only approved posts go out (this one is ${d.status})`;
  const { ctx } = socialContext(slug);
  const failing = checkSocial(d, { ...ctx, posting: pl.c.networks[d.network]?.posting }).filter((x) => !x.ok);
  if (failing.length) return `a check fails now: ${failing.map((x) => `${x.label.toLowerCase()} (${x.detail})`).join("; ")}`;
  const dashes = [...captionProblems(fullCaption(d)), ...captionProblems(d.title ?? "")];
  if (dashes.length) return `caption-check: ${dashes.join("; ")}`;
  const other = listBusinesses().profiles.find((p) => p.slug !== slug && postingAccount(p.channels as Record<string, ChannelSpec>, d.network).account === pl.account);
  if (other) return `account ${pl.account} is also pinned by another business (${other.slug}); HQ never posts one business's post to an account another business claims`;
  return "";
}

function describe(pl: Plan): string {
  const d = pl.d, cap = fullCaption(d);
  return `${pl.account}${pl.handle ? ` (@${pl.handle})` : ""}${pl.board ? `, board ${pl.board}` : ""}: ${pl.format !== d.format && d.reel ? `slideshow Reel (${d.reel.seconds} s, music: ${d.reel.track})` : `${pl.files.length} ${d.format === "reel" ? "video" : pl.files.length === 1 ? "image" : "images"}`}, caption ${cap.length} characters${d.link && d.network === "pinterest" ? `, link ${d.link}` : ""}`;
}

/** Puts one post out (or, with mode container/check, proves it could). Records the attempt before any call. */
export async function publishOne(slug: string, id: string, deps: PublishDeps, mode: PublishMode = "publish"): Promise<PublishOutcome> {
  const pl = plan(slug, id);
  const base = (d: { id: string; network: string; format: string }) => ({ id: d.id, network: d.network, format: d.format });
  if (typeof pl === "string") {
    const d = findSocial(slug, id);
    if (mode === "publish" && d.error !== pl) { d.error = pl; saveSocial(slug, d); socialLog(slug, { event: "publish-blocked", id: d.id, why: pl }); }
    return { ...base(d), status: "skipped", detail: pl };
  }
  const gate = prePostProblem(slug, pl, mode);
  if (gate) {
    const d = pl.d;
    if (mode === "publish" && d.error !== gate) { d.error = gate; saveSocial(slug, d); socialLog(slug, { event: "publish-held", id: d.id, why: gate }); }
    return { ...base(d), status: "skipped", detail: gate };
  }
  const d = pl.d, run = newRun(), now = deps.now();
  if (mode === "publish") {
    if (d.status === "posted") return { ...base(d), status: "skipped", detail: "already posted" };
    d.attempts = [...(d.attempts ?? []), { at: now.toISOString(), run }];
    saveSocial(slug, d);
    socialLog(slug, { event: "publish-attempt", id: d.id, run, attempt: d.attempts.length });
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hq-social-"));
  let res: CellResult | undefined, why = "";
  try {
    // 1. Local files: JPEG cards (or the video), each with its sha256.
    const media: { url: string; name: string; mimetype: string; sha256: string; file: string }[] = [];
    for (const [i, f] of pl.files.entries()) {
      const ext = f.mimetype === "image/jpeg" ? ".jpg" : path.extname(f.abs);
      const file = path.join(tmp, `${d.id}-${i + 1}${ext}`);
      if (f.mimetype === "image/jpeg") await deps.toJpeg(f.abs, file); else fs.copyFileSync(f.abs, file);
      media.push({ url: "", name: path.basename(file), mimetype: f.mimetype, sha256: sha256File(file), file });
    }
    // 2. Upload slots in Composio's file store, upload, and prove each link serves the same bytes.
    if (mode !== "check" || d.network === "pinterest") {
      const slots = await deps.workbench([slotsCell(run, media.length)], run);
      const s = slots.results.find((r) => r.status === "slots") as { slots?: { upload: string; download: string }[] } | undefined;
      if (!s?.slots || s.slots.length !== media.length) throw Error(slots.results.find((r) => r.status === "error")?.error as string ?? slots.why ?? "no upload slots");
      for (const [i, m] of media.entries()) {
        await deps.put(s.slots[i].upload, m.file, m.mimetype);
        if ((await deps.sha(s.slots[i].download)) !== m.sha256) throw Error(`media ${i + 1} didn't upload intact`);
        m.url = s.slots[i].download;
      }
    }
    // 3. The post itself: look first, then make it.
    const payload = buildPayload({
      run, network: d.network as "instagram" | "pinterest", format: pl.format, account: pl.account, handle: pl.handle,
      caption: fullCaption(d), title: d.title, link: d.link, alt: altText(d, 500), board: pl.board,
      media: media.map(({ file: _f, ...m }) => m), mode, day: d.day, retry: (d.attempts?.length ?? 0) > 1,
    });
    const cells = d.network === "pinterest" ? pinterestCells(payload) : instagramCells(payload);
    const out = await deps.workbench(cells, run);
    res = out.results.at(-1);
    if (!res) why = out.why ?? "the posting run returned nothing";
  } catch (e) {
    why = String((e as Error).message ?? e).slice(0, 400);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // 4. Record what happened.
  const fresh = findSocial(slug, id);
  const attempt = fresh.attempts?.find((a) => a.run === run);
  const url = typeof res?.url === "string" && /^https:\/\//.test(res.url) ? res.url : "";
  if (res && (res.status === "posted" || res.status === "found") && url) {
    if (attempt) { attempt.result = res.status; saveSocial(slug, fresh); }
    if (mode !== "publish") return { ...base(d), status: "found", detail: `already on the account: ${url}`, url };
    markPosted(slug, id, url, { postId: String(res.id ?? ""), by: "hq" });
    try {
      logPost(slug, { at: deps.now().toISOString(), platform: d.network, via: "composio", account: pl.account, url, postId: String(res.id ?? ""), caption: fullCaption(d), status: "published", note: res.status === "found" ? "Found already live on the account; HQ recorded it instead of posting again." : `Posted by HQ on its day (${d.id})${pl.format !== d.format && d.reel ? `, as a slideshow Reel with ${d.reel.track}` : ""}.` });
    } catch { /* the post is live and recorded on the draft; the log is secondary */ }
    return { ...base(d), status: res.status, detail: url, url };
  }
  if (mode !== "publish") {
    if (res?.status === "container") return { ...base(d), status: "container", detail: `container ${res.container} made, not published (it expires unpublished in about a day)` };
    if (res?.status === "checked") return { ...base(d), status: "checked", detail: `account and media checked${res.board ? `, board "${res.board}"` : ""}` };
    return { ...base(d), status: "failed", detail: res?.status === "error" ? `${res.stage}: ${res.error}` : why || `unexpected result ${res?.status}` };
  }
  const posted = res?.status === "posted" && !url;
  const msg = posted ? `posted (media ${res!.id}) but its link didn't read back yet; HQ looks it up next time`
    : res?.status === "publishing" ? "the run stopped while publishing; HQ looks for it on the account before trying again"
    : res?.status === "error" ? `${res.stage}: ${res.error}` : why || `unexpected result ${res?.status}`;
  if (attempt) { attempt.result = "error"; attempt.error = msg; }
  if (posted) fresh.postId = String(res!.id);
  fresh.error = msg;
  const out = (fresh.attempts?.length ?? 0) >= attemptsAllowed(pl.c) ? "failed" : "retry";
  if (out === "failed") fresh.status = "failed";
  saveSocial(slug, fresh);
  socialLog(slug, { event: out === "failed" ? "publish-failed" : "publish-retry", id: d.id, run, error: msg });
  return { ...base(d), status: out, detail: msg };
}

// ---------------------------------------------------------------- the day's posts

/** Every post on an "hq" network in this week and last week, with whether it's due and why. Weeks are picked by
 *  date, not by folder count: drafts written ahead for later weeks (a campaign's) must not push this week out. */
export function publishQueue(slug: string, now: Date, opts: { id?: string } = {}) {
  const p = getProfile(slug), c = readSocialConfig(slug);
  if (!p || !c) return [];
  const all = listSocial(slug, 26), current = weekOf(now, p.timezone);
  const weeks = [...new Set(all.map((d) => d.week))].filter((w) => w <= current).sort().reverse().slice(0, 2);
  return all.filter((d) => weeks.includes(d.week))
    .filter((d) => c.networks[d.network]?.posting === "hq" && (!opts.id || d.id === opts.id || d.file === opts.id))
    .map((d) => {
      const due = dueNow(opts.id ? { ...c, postHour: 0 } : c, d, now, p.timezone);
      return { d, ...due };
    });
}

export const MAX_PER_RUN = 4;

/** Puts out what's due, at most MAX_PER_RUN posts a run (the rest go at the next hourly run). A dry run lists what
 *  would go out and makes no external call. beforeEach runs before each post (the tick keeps its lock fresh). */
export async function publishDue(slug: string, deps: PublishDeps, opts: { dryRun?: boolean; id?: string; mode?: PublishMode; beforeEach?: () => void } = {}): Promise<PublishOutcome[]> {
  const out: PublishOutcome[] = [];
  let made = 0;
  for (const q of publishQueue(slug, deps.now(), opts)) {
    const base = { id: q.d.id, network: q.d.network, format: q.d.format };
    if (opts.dryRun) {
      if (q.why.startsWith("by hand") || ["done", "off", "rejected"].includes(q.why)) { out.push({ ...base, status: "skipped", detail: q.why }); continue; }
      const pl = plan(slug, q.d.id);
      // The dry run judges the post as it would be once auto mode approved it, so the checks it shows are the real ones.
      const gate = typeof pl === "string" ? "" : prePostProblem(slug, { ...pl, d: { ...pl.d, status: "approved" } }, "publish");
      const how = typeof pl === "string" ? `can't post: ${pl}` : gate ? `held: ${gate}` : `via ${describe(pl)}; checks pass`;
      const auto = q.d.status === "draft" && q.due ? "auto mode approves it, then " : "";
      out.push({ ...base, status: q.due && typeof pl !== "string" && !gate ? "dry-run" : "skipped", detail: `${q.due ? `${auto}would post now (${q.why})` : `not now (${q.why})`}; ${how}` });
      continue;
    }
    if (!q.due && !(opts.mode && opts.mode !== "publish" && opts.id)) { if (opts.id) out.push({ ...base, status: "skipped", detail: q.why }); continue; }
    if (made >= MAX_PER_RUN) { out.push({ ...base, status: "skipped", detail: "due, and goes at the next run" }); continue; }
    opts.beforeEach?.();
    made++;
    // Only approved posts ever go out. In auto mode after week one a post that passes its checks is due without the
    // owner's yes: record that approval (by auto) first, so the draft says who let it go.
    if ((opts.mode ?? "publish") === "publish" && q.d.status === "draft") setSocialStatus(slug, q.d.id, "approved", "auto");
    out.push(await publishOne(slug, q.d.id, deps, opts.mode ?? "publish"));
  }
  return out;
}

export const socialRunLock = (slug: string) => path.join(socialDir(slug), "run.lock");

/** Minutes a lock nobody has touched is taken to belong to a run that died. Long runs touch it before each post. */
export const LOCK_STALE_MIN = 45;
export type SocialLock = { release(): void; touch(): void };

/** One social run per business at a time (the hourly tick, a hand-run publish, an insights read). Created with O_EXCL,
 *  so two runs that start together can't both get it; a lock untouched for LOCK_STALE_MIN is cleared. Release only
 *  removes the lock this run holds. */
export function acquireSocialLock(slug: string): SocialLock | null {
  const lock = socialRunLock(slug);
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const token = `${process.pid} ${crypto.randomBytes(6).toString("hex")}`;
  for (let i = 0; i < 2; i++) {
    try {
      const fd = fs.openSync(lock, "wx", 0o600);
      fs.writeSync(fd, `${token}\n`); fs.closeSync(fd);
      const mine = () => { try { return fs.readFileSync(lock, "utf8").startsWith(token); } catch { return false; } };
      return {
        release: () => { if (mine()) fs.rmSync(lock, { force: true }); },
        touch: () => { if (mine()) { const t = new Date(); try { fs.utimesSync(lock, t, t); } catch { /* gone */ } } },
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      let age: number;
      try { age = Date.now() - fs.statSync(lock).mtimeMs; } catch { continue; }
      if (age < LOCK_STALE_MIN * 60e3) return null;
      const aside = `${lock}.stale-${token.replace(" ", "-")}`;
      try { fs.renameSync(lock, aside); fs.rmSync(aside, { force: true }); } catch { /* another run cleared it */ }
    }
  }
  return null;
}

// ---------------------------------------------------------------- Instagram's own numbers (daily)

export const insightsFile = (slug: string) => path.join(socialDir(slug), "insights.json");

export function readInsights(slug: string): InsightsFile | null {
  try { return JSON.parse(fs.readFileSync(insightsFile(slug), "utf8")) as InsightsFile; } catch { return null; }
}

/** Whether the tick should read the numbers again (none yet, or the last read is INSIGHTS_EVERY_H old). */
export function insightsDue(slug: string, now: Date): boolean {
  const i = readInsights(slug);
  return !i || now.getTime() - Date.parse(i.at) >= INSIGHTS_EVERY_H * 3600e3;
}

export type InsightsOutcome = { status: "read" | "skipped" | "failed" | "dry-run"; detail: string; file?: InsightsFile };

/** Reads the pinned Instagram account's followers, 7-day windows and per-post views through the workbench (read-only
 *  tools only), and keeps them in social/insights.json for the analytics adapter. A failed read leaves the last file. */
export async function refreshInsights(slug: string, deps: PublishDeps, opts: { dryRun?: boolean } = {}): Promise<InsightsOutcome> {
  const p = getProfile(slug), c = readSocialConfig(slug);
  if (!p) return { status: "skipped", detail: "no such business" };
  const { account, handle } = postingAccount(p.channels as Record<string, ChannelSpec>, "instagram");
  const h = (handle ?? c?.networks.instagram?.handle ?? "").replace(/^@/, "");
  if (!account || !h) return { status: "skipped", detail: "no Instagram account pinned in the profile (channels.instagram.account and handle)" };
  const other = listBusinesses().profiles.find((x) => x.slug !== slug && postingAccount(x.channels as Record<string, ChannelSpec>, "instagram").account === account);
  if (other) return { status: "skipped", detail: `account ${account} is also pinned by another business (${other.slug})` };
  const now = deps.now(), run = newRun();
  const cell = insightsCell({ run, account, handle: h, now: Math.floor(now.getTime() / 1000) });
  if (opts.dryRun) return { status: "dry-run", detail: `would read ${account} (@${h}): profile, 4 weekly windows, new followers per day and each post's views over 28 days; read-only tools only (${cell.length} characters of workbench code)` };
  const res = (await deps.workbench([cell], run)).results.at(-1);
  if (!res || res.status !== "insights") {
    const why = res?.status === "error" ? `${res.stage}: ${res.error}` : "the insights run returned nothing";
    socialLog(slug, { event: "insights-failed", why: String(why).slice(0, 300) });
    return { status: "failed", detail: String(why) };
  }
  const file = summariseInsights(res, { account, handle: h, at: now });
  fs.mkdirSync(socialDir(slug), { recursive: true });
  const tmp = `${insightsFile(slug)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, insightsFile(slug));
  fs.appendFileSync(path.join(socialDir(slug), "insights-history.jsonl"), JSON.stringify({ at: file.at, network: "instagram", followers: file.followers, follows7: file.summary.follows7, linkClicks7: file.summary.linkClicks7 }) + "\n");
  socialLog(slug, { event: "insights", followers: file.followers, posts: file.posts.length, errors: file.errors.length });
  const s = file.summary;
  return { status: "read", file, detail: `${s.followers ?? "?"} followers; ${s.follows7 ?? "?"} new in 7 days over ${s.posts7} posts; ${s.viewsPerPost ?? "?"} views per post (${s.viewsPosts} posts); ${s.linkClicks7 ?? "?"} link taps in 7 days${file.errors.length ? `; ${file.errors.length} reads failed: ${file.errors.join("; ")}` : ""}` };
}
