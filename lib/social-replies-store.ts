// Comment replies on disk and on Instagram, for businesses that opt in (social.json `replies.instagram`). Hourly from
// the social tick: post the replies the owner approved, fetch new comments on the account's recent posts, and have
// Claude Code headless triage and draft replies for the owner (ig-reply and ig-human as craft guidance when
// installed), allowed only to write one file in this run's folder under social/replies/. The queue is
// social/replies/queue.json. Nothing posts without the owner's yes; each attempt is written and read back before the
// call, and every attempt looks for the account's own reply first, so a reply never goes up twice. The token is read
// from the login Keychain at run time and never logged or stored. Server-only.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";

import { claudeBin } from "./blog-writer";
import { attemptsAllowed } from "./social-publish";
import { BANNED } from "./blog";
import {
  applyDrafts, DEFAULT_SERVICE, DRAFT_PER_RUN, dueReplies, GRAPH_API, MEDIA_LIMIT, COMMENT_LIMIT, mergeQueue, newComments, noSkips, parseDrafts,
  replyProblems, replyPrompt, repliesConfig, type IgComment, type IgMedia, type ReplyContext, type ReplyItem,
} from "./social-replies";
import type { InstagramReplies } from "./social";
import { readSocialConfig, socialContext, socialDir, socialLog } from "./social-store";
import { getProfile } from "./store";
import { craftGuidance, readUserSkills } from "./user-skills";

export const repliesDir = (slug: string) => path.join(socialDir(slug), "replies");
export const queueFile = (slug: string) => path.join(repliesDir(slug), "queue.json");

// ---------------------------------------------------------------- the queue

export function readQueue(slug: string): ReplyItem[] {
  try { const q = JSON.parse(fs.readFileSync(queueFile(slug), "utf8")); return Array.isArray(q) ? q as ReplyItem[] : []; } catch { return []; }
}
function writeQueue(slug: string, q: ReplyItem[]) {
  fs.mkdirSync(repliesDir(slug), { recursive: true });
  const f = queueFile(slug), tmp = `${f}.${process.pid}.${crypto.randomBytes(3).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(q, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, f);
}
/** Read fresh, change one item, write: the page and the hourly run both change the queue, so never hold a copy. */
export function updateReply(slug: string, id: string, fn: (it: ReplyItem) => void): ReplyItem {
  const q = readQueue(slug), it = q.find((x) => x.id === id);
  if (!it) throw Error(`no comment ${id} in the reply queue`);
  fn(it); writeQueue(slug, q);
  return it;
}

function replyContext(slug: string): ReplyContext {
  const { ctx } = socialContext(slug);
  return { regulated: ctx.regulated, banned: ctx.banned, sites: ctx.sites };
}

/** The owner's yes, optionally with their own wording. The text is checked now and again just before it posts. */
export function approveReply(slug: string, id: string, text?: string): ReplyItem {
  const ctx = replyContext(slug);
  return updateReply(slug, id, (it) => {
    if (it.status === "posted") throw Error("already posted");
    if (!["draft", "skipped", "failed", "approved"].includes(it.status)) throw Error(`can't approve a ${it.status} reply`);
    const t = (text ?? it.reply ?? "").trim();
    const bad = replyProblems(t, ctx);
    if (bad.length) throw Error(`the reply can't post: ${bad.join("; ")}`);
    if (it.status === "failed") { delete it.attempts; delete it.error; }
    it.reply = t; it.status = "approved"; it.approvedAt = new Date().toISOString();
    socialLog(slug, { event: "reply-approved", id, edited: t !== (it.drafted ?? "") });
  });
}
export function rejectReply(slug: string, id: string): ReplyItem {
  return updateReply(slug, id, (it) => {
    if (it.status === "posted") throw Error("already posted");
    it.status = "rejected"; socialLog(slug, { event: "reply-rejected", id });
  });
}

// ---------------------------------------------------------------- Instagram

export class GraphError extends Error {
  constructor(public status: number, public code: number | undefined, message: string) { super(message); }
  /** Meta's app or account request limit: back off until the next run. */
  get rateLimited() { return [4, 17, 32, 613].includes(this.code ?? -1) || /request limit/i.test(this.message); }
}

export type ReplyGraph = {
  me(): Promise<{ username: string }>;
  media(limit: number): Promise<IgMedia[]>;
  comments(mediaId: string): Promise<IgComment[]>;
  /** The replies under one comment (to look for the account's own before posting). */
  replies(commentId: string): Promise<IgComment[]>;
  reply(commentId: string, message: string): Promise<{ id: string }>;
};

/** The token from the login Keychain (as the comment-to-DM bot stores it), or null. Never printed. */
export function keychainToken(service: string, account: string): string | null {
  try {
    const t = execFileSync("security", ["find-generic-password", "-s", service, "-a", account, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15e3 }).trim();
    return t || null;
  } catch { return null; }
}

/** A thin client: one documented call per method. The token rides in the query string (as graph.instagram.com
 *  documents), so no URL ever goes into an error or a log, and any echo of the token is masked. */
export function graphClient(token: string, fetchImpl: typeof fetch = fetch): ReplyGraph {
  const call = async (method: "GET" | "POST", p: string, params: Record<string, string>) => {
    const url = `${GRAPH_API}/${p}?${new URLSearchParams({ ...params, access_token: token })}`;
    let r: Response;
    try { r = await fetchImpl(url, { method, signal: AbortSignal.timeout(30e3) }); }
    catch (e) { throw new GraphError(0, undefined, `couldn't reach Instagram (${String((e as Error).name ?? "error")})`); }
    const j = await r.json().catch(() => ({})) as { error?: { message?: string; code?: number } } & Record<string, unknown>;
    if (!r.ok || j.error) throw new GraphError(r.status, j.error?.code, `Instagram ${r.status}: ${String(j.error?.message ?? "error").split(token).join("***").slice(0, 300)}`);
    return j;
  };
  return {
    me: async () => ({ username: String((await call("GET", "me", { fields: "user_id,username" })).username ?? "") }),
    media: async (limit) => ((await call("GET", "me/media", { fields: "id,permalink,caption,timestamp,comments_count", limit: String(limit) })).data ?? []) as IgMedia[],
    comments: async (id) => ((await call("GET", `${encodeURIComponent(id)}/comments`, { fields: "id,text,username,timestamp,from,replies{id,username,text,timestamp}", limit: String(COMMENT_LIMIT) })).data ?? []) as IgComment[],
    replies: async (id) => ((await call("GET", `${encodeURIComponent(id)}/replies`, { fields: "id,username,text,timestamp", limit: "50" })).data ?? []) as IgComment[],
    reply: async (id, message) => ({ id: String((await call("POST", `${encodeURIComponent(id)}/replies`, { message })).id ?? "") }),
  };
}

export type DraftRun = { ok: boolean; why?: string; costUsd?: number };
export type ReplyDeps = {
  /** The account's client; throws when there's no token. */
  graph(cfg: InstagramReplies): Promise<ReplyGraph>;
  /** One headless Claude Code run with exactly these tools, in this folder. */
  draft(prompt: string, cwd: string, tools: string[]): Promise<DraftRun>;
  now(): Date;
  /** A gentle gap between Instagram calls. */
  pause(ms: number): Promise<void>;
};

async function headlessDraft(prompt: string, cwd: string, tools: string[], timeoutMs = 10 * 60e3): Promise<DraftRun> {
  const bin = claudeBin();
  if (!bin) return { ok: false, why: "Claude Code isn't installed where HQ can find it (set CLAUDE_BIN)" };
  const out = await new Promise<{ code: number; stdout: string }>((resolve) => {
    execFile(bin, ["-p", prompt, "--output-format", "json", "--max-turns", "12", "--allowedTools", ...tools],
      { cwd, timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024, env: { ...process.env, HOME: os.homedir() } },
      (err, stdout) => resolve({ code: err ? 1 : 0, stdout: String(stdout ?? "") }));
  });
  let costUsd: number | undefined, summary = "";
  try { const j = JSON.parse(out.stdout); costUsd = j.total_cost_usd; summary = String(j.result ?? "").slice(0, 200); } catch { /* not JSON */ }
  return { ok: out.code === 0, why: out.code ? `the drafting run stopped${summary ? `: ${summary}` : ""}` : undefined, costUsd };
}

export const realReplyDeps: ReplyDeps = {
  graph: async (cfg) => {
    const service = cfg.service ?? DEFAULT_SERVICE, token = keychainToken(service, cfg.keychain);
    if (!token) throw Error(`no Instagram token in the Keychain (service "${service}", account "${cfg.keychain}")`);
    return graphClient(token);
  },
  draft: (prompt, cwd, tools) => headlessDraft(prompt, cwd, tools),
  now: () => new Date(),
  pause: (ms) => new Promise((r) => setTimeout(r, ms)),
};

// ---------------------------------------------------------------- fetch

export type FetchOutcome = { status: "fetched" | "dry-run" | "skipped" | "failed"; detail: string; added: number; items?: ReplyItem[] };

/** New comments on the account's recent posts into the queue. A dry run reads (GET only) and writes nothing. */
export async function fetchComments(slug: string, deps: ReplyDeps, opts: { dryRun?: boolean } = {}): Promise<FetchOutcome> {
  const cfg = repliesConfig(readSocialConfig(slug));
  if (!cfg) return { status: "skipped", detail: "comment replies aren't switched on for this business (social.json replies.instagram)", added: 0 };
  const now = deps.now(), skipped = noSkips(), fresh: ReplyItem[] = [];
  let note = "";
  try {
    const g = await deps.graph(cfg);
    const own = (await g.me()).username;
    if (!own) throw Error("Instagram didn't say whose account the token is for");
    const queued = new Set(readQueue(slug).map((x) => x.id)), handled: { id: string; reply: IgComment }[] = [];
    for (const m of await g.media(MEDIA_LIMIT)) {
      if (m.comments_count === 0) continue;
      await deps.pause(300);
      let comments: IgComment[];
      try { comments = await g.comments(m.id); } catch (e) {
        if (e instanceof GraphError && e.rateLimited) { note = "; Instagram's request limit hit, the rest waits for the next run"; break; }
        throw e;
      }
      fresh.push(...newComments(m, comments, { own, queued, skipKeywords: cfg.skipKeywords, days: cfg.days, now }, skipped));
      // A queued comment the account has since answered (by hand, or another tool) needs nothing more from HQ.
      for (const c of comments) if (queued.has(c.id)) { const r = (c.replies?.data ?? []).find((x) => (x.username ?? x.from?.username ?? "").toLowerCase() === own.toLowerCase()); if (r) handled.push({ id: c.id, reply: r }); }
    }
    const why = `left ${skipped.own} own, ${skipped.replied} already answered, ${skipped.queued} already queued, ${skipped.keyword} keyword, ${skipped.old} older, ${skipped.empty} empty${note}`;
    if (opts.dryRun) return { status: "dry-run", detail: `would queue ${fresh.length} comments (@${own}); ${why}`, added: fresh.length, items: fresh };
    const q = readQueue(slug);
    let answered = 0;
    for (const h of handled) {
      const it = q.find((x) => x.id === h.id);
      if (it && ["new", "draft", "skipped", "approved", "failed"].includes(it.status)) {
        it.status = "posted"; it.postedBy = "account"; it.replyId = h.reply.id; it.postedAt = h.reply.timestamp ?? now.toISOString(); answered++;
      }
    }
    const { queue, added } = mergeQueue(q, fresh);
    if (added || answered) writeQueue(slug, queue);
    socialLog(slug, { event: "replies-fetched", added, answeredElsewhere: answered, skipped });
    return { status: "fetched", detail: `${added} new comments queued${answered ? `, ${answered} already answered on the account` : ""}; ${why}`, added };
  } catch (e) {
    const why = String((e as Error).message ?? e).slice(0, 300);
    if (!opts.dryRun) socialLog(slug, { event: "replies-fetch-failed", why });
    return { status: "failed", detail: why, added: 0 };
  }
}

// ---------------------------------------------------------------- draft

/** User skills the drafter folds in when installed. */
export const REPLY_SKILLS = ["ig-reply", "ig-human"] as const;
const REPLY_USE: Record<string, string> = {
  "ig-reply": "**ig-reply:** use its triage and its craft for each bucket. Its buckets are HQ's buckets. Ignore its output block and its gate: HQ's queue is the gate, and the owner approves each reply on the Content & Social page. Never hand anything to /ig-reel: set `reelIdea` instead.",
  "ig-human": "**ig-human:** apply its rules to every reply as you write (no stock slop words or phrases, none of its structural tells, contractions, plain words). You can't run its scripts: check each reply by reading it.",
};

export type DraftOutcome = { status: "drafted" | "skipped" | "failed"; detail: string; drafted: number; craft?: string[]; costUsd?: number };

/** Triage and draft the queue's new comments in one headless run. Never posts. */
export async function draftReplies(slug: string, deps: ReplyDeps): Promise<DraftOutcome> {
  const p = getProfile(slug), cfg = repliesConfig(readSocialConfig(slug));
  if (!p || !cfg) return { status: "skipped", detail: "comment replies aren't switched on for this business", drafted: 0 };
  const items = readQueue(slug).filter((x) => x.status === "new").slice(0, DRAFT_PER_RUN);
  if (!items.length) return { status: "skipped", detail: "no new comments to draft", drafted: 0 };
  const now = deps.now(), stamp = now.toISOString().replace(/[:.]/g, "-");
  const run = path.join(repliesDir(slug), "research", stamp), out = path.join(run, "drafts.json");
  fs.mkdirSync(run, { recursive: true });
  const ctx = replyContext(slug);
  const neverUse = [...new Set([...ctx.regulated.flatMap((f) => BANNED[f] ?? []), ...(ctx.banned ?? [])])];
  const business = { name: p.name, offer: p.offer, audience: p.audience, country: p.country, brandVoice: p.brandVoice ?? "", sites: p.sites ?? [] };
  fs.writeFileSync(path.join(run, "inputs.json"), JSON.stringify({ business, neverUse, comments: items }, null, 2), { mode: 0o600 });
  const craft = readUserSkills(REPLY_SKILLS);
  const prompt = replyPrompt({ business, neverUse, regulated: ctx.regulated, items, out, craft: craftGuidance(craft, {
    wins: "The output format, the rules above, the regulated rules and the never-use list", use: REPLY_USE, output: `Write ${out} and stop.`,
  }) });
  const abs = (x: string) => `/${x}/**`; // Claude Code permission rules take absolute paths with a leading //.
  const tools = [`Read(${abs(run)})`, `Write(${abs(run)})`, `Edit(${abs(run)})`];
  socialLog(slug, { event: "replies-drafting", comments: items.length, craft: craft.map((s) => s.name) });
  const res = await deps.draft(prompt, run, tools);
  let results: ReturnType<typeof parseDrafts> = [];
  try { results = parseDrafts(JSON.parse(fs.readFileSync(out, "utf8"))); } catch { /* no file, or not JSON */ }
  // Only the comments this run was given, and only replies to them, land on the queue.
  const tried = new Set(items.map((x) => x.id));
  const r = applyDrafts(readQueue(slug), results.filter((x) => tried.has(x.id)), tried, deps.now());
  writeQueue(slug, r.queue);
  socialLog(slug, { event: results.length ? "replies-drafted" : "replies-draft-failed", drafted: r.drafted, skipped: r.skipped, failed: r.failed, craft: craft.map((s) => s.name), why: results.length ? undefined : res.why ?? "no drafts written" });
  if (!results.length) return { status: "failed", detail: res.why ?? "the drafting run wrote no drafts", drafted: 0, craft: craft.map((s) => s.name), costUsd: res.costUsd };
  return { status: "drafted", detail: `${r.drafted} replies for you to approve, ${r.skipped} need none${r.failed ? `, ${r.failed} gave up` : ""}`, drafted: r.drafted, craft: craft.map((s) => s.name), costUsd: res.costUsd };
}

// ---------------------------------------------------------------- post

export type PostOutcome = { id: string; status: "posted" | "found" | "held" | "retry" | "failed" | "dry-run" | "stopped"; detail: string };

/** Posts the replies the owner approved. Each one: checks again, looks for the account's own reply under the comment
 *  (found: recorded, never posted again), writes the attempt and reads it back, then makes the one call. A dry run
 *  makes no call at all. */
export async function postReplies(slug: string, deps: ReplyDeps, opts: { dryRun?: boolean; beforeEach?: () => void } = {}): Promise<PostOutcome[]> {
  const c = readSocialConfig(slug), cfg = repliesConfig(c);
  if (!c || !cfg) return [];
  const max = attemptsAllowed(c), ctx = replyContext(slug);
  const { due, spent } = dueReplies(readQueue(slug), max);
  const out: PostOutcome[] = [];
  for (const s of spent) {
    updateReply(slug, s.id, (it) => { it.status = "failed"; it.error = it.error ?? `tried ${max} times`; });
    out.push({ id: s.id, status: "failed", detail: `tried ${max} times: ${s.error ?? "no reason recorded"}` });
  }
  if (!due.length) return out;
  if (opts.dryRun) {
    for (const d of due) { const bad = replyProblems(d.reply, ctx); out.push({ id: d.id, status: bad.length ? "held" : "dry-run", detail: bad.length ? bad.join("; ") : `would reply to @${d.username}: ${d.reply}` }); }
    return out;
  }
  let g: ReplyGraph, own: string;
  try { g = await deps.graph(cfg); own = (await g.me()).username.toLowerCase(); if (!own) throw Error("Instagram didn't say whose account the token is for"); }
  catch (e) { return [...out, { id: "-", status: "stopped", detail: String((e as Error).message).slice(0, 300) }]; }
  for (const [i, d] of due.entries()) {
    opts.beforeEach?.();
    if (i) await deps.pause(1500);
    const bad = replyProblems(d.reply, ctx);
    if (bad.length) { updateReply(slug, d.id, (it) => { it.error = `held: ${bad.join("; ")}`; }); out.push({ id: d.id, status: "held", detail: bad.join("; ") }); continue; }
    // 1. Look first: an earlier run cut off after posting, or the owner answered by hand.
    let mine: IgComment | undefined;
    try { mine = (await g.replies(d.id)).find((r) => (r.username ?? r.from?.username ?? "").toLowerCase() === own); }
    catch (e) {
      const why = String((e as Error).message).slice(0, 300);
      updateReply(slug, d.id, (it) => { it.error = `couldn't look before replying: ${why}`; });
      out.push({ id: d.id, status: "retry", detail: `couldn't look before replying, no reply sent: ${why}` });
      if (e instanceof GraphError && e.rateLimited) break;
      continue;
    }
    if (mine) {
      updateReply(slug, d.id, (it) => {
        it.status = "posted"; it.replyId = mine!.id; it.postedAt = mine!.timestamp ?? deps.now().toISOString(); delete it.error;
        const last = it.attempts?.at(-1);
        if (last && !last.result) last.result = "found";
        it.postedBy = last ? "hq" : "account";
      });
      socialLog(slug, { event: "reply-found", id: d.id });
      out.push({ id: d.id, status: "found", detail: "the account had already replied; recorded, not posted again" });
      continue;
    }
    // 2. The attempt goes on disk, and is read back, before the call.
    const run = crypto.randomBytes(6).toString("hex");
    updateReply(slug, d.id, (it) => { it.attempts = [...(it.attempts ?? []), { at: deps.now().toISOString(), run }]; });
    const back = readQueue(slug).find((x) => x.id === d.id);
    if (back?.status !== "approved" || !back.attempts?.some((a) => a.run === run)) { out.push({ id: d.id, status: "held", detail: "the attempt didn't read back from disk (or the owner changed it); not posting" }); continue; }
    socialLog(slug, { event: "reply-attempt", id: d.id, run, attempt: back.attempts.length });
    // 3. The one call. The text posted is the one read back with the attempt.
    try {
      const r = await g.reply(d.id, back.reply!.trim());
      if (!r.id) throw new GraphError(200, undefined, "Instagram didn't return the reply's id");
      updateReply(slug, d.id, (it) => { it.status = "posted"; it.postedBy = "hq"; it.replyId = r.id; it.postedAt = deps.now().toISOString(); delete it.error; const a = it.attempts?.find((x) => x.run === run); if (a) a.result = "posted"; });
      socialLog(slug, { event: "reply-posted", id: d.id, replyId: r.id });
      out.push({ id: d.id, status: "posted", detail: `replied to @${d.username} (${r.id})` });
    } catch (e) {
      const why = String((e as Error).message).slice(0, 300);
      const it = updateReply(slug, d.id, (x) => { const a = x.attempts?.find((y) => y.run === run); if (a) { a.result = "error"; a.error = why; } x.error = why; if ((x.attempts?.length ?? 0) >= max) x.status = "failed"; });
      socialLog(slug, { event: it.status === "failed" ? "reply-failed" : "reply-retry", id: d.id, why });
      out.push({ id: d.id, status: it.status === "failed" ? "failed" : "retry", detail: why });
      if (e instanceof GraphError && e.rateLimited) break;
    }
  }
  return out;
}

/** The hourly step for one business: approved replies out first (the owner already said yes), then new comments in,
 *  then drafts. Each step's failure is logged and the others still run. One line per step for the tick's output. */
export async function replyTick(slug: string, deps: ReplyDeps, opts: { beforeEach?: () => void } = {}): Promise<string[]> {
  if (!repliesConfig(readSocialConfig(slug))) return [];
  const lines: string[] = [];
  const step = async (name: string, fn: () => Promise<string | null>) => {
    opts.beforeEach?.();
    try { const l = await fn(); if (l) lines.push(l); }
    catch (e) { const why = String((e as Error).message).slice(0, 200); socialLog(slug, { event: "replies-tick-failed", step: name, why }); lines.push(`${name} failed: ${why}`); }
  };
  await step("post", async () => { const r = await postReplies(slug, deps, opts); return r.length ? r.map((x) => `reply ${x.id}: ${x.status}. ${x.detail}`).join("\n") : null; });
  await step("fetch", async () => { const r = await fetchComments(slug, deps); return `comments ${r.status}: ${r.detail}`; });
  await step("draft", async () => { const r = await draftReplies(slug, deps); return r.status === "skipped" ? null : `drafts ${r.status}: ${r.detail}`; });
  return lines;
}
