// The daily blog on disk and on the network: $HQ_DATA/businesses/<slug>/blog/ holds blog.json, drafts/,
// log.jsonl and research/<date>/. Checks drafts (fetching every source link), publishes through the business's
// private publisher adapter (blog-connection.json) and reads each post back before it counts. Server-only.
import fs from "node:fs";
import path from "node:path";

import { checkDraft, decide, formatDraft, parseDraft, validateConfig, type BlogConfig, type BlogDraft, type BlogDraftMeta } from "./blog";
import { execAdapter, readConnection } from "./private-adapter";
import { businessDir, getProfile } from "./store";

export const blogDir = (slug: string) => path.join(businessDir(slug), "blog");
const draftsDir = (slug: string) => path.join(blogDir(slug), "drafts");
const configFile = (slug: string) => path.join(blogDir(slug), "blog.json");
const PUBLISH_TIMEOUT_MS = 20 * 60e3;

export function readBlogConfig(slug: string): BlogConfig | null {
  try { return validateConfig(JSON.parse(fs.readFileSync(configFile(slug), "utf8"))); } catch { return null; }
}
export function writeBlogConfig(slug: string, c: BlogConfig) {
  fs.mkdirSync(blogDir(slug), { recursive: true });
  fs.writeFileSync(configFile(slug), JSON.stringify(validateConfig(c), null, 2) + "\n", { mode: 0o600 });
}
export const hasPublisher = (slug: string) => fs.existsSync(path.join(businessDir(slug), "blog-connection.json"));

export type DraftFile = BlogDraft & { file: string };

export function listDrafts(slug: string): DraftFile[] {
  const dir = draftsDir(slug);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().reverse().flatMap((f) => {
    try { return [{ ...parseDraft(fs.readFileSync(path.join(dir, f), "utf8")), file: f }]; } catch { return []; }
  });
}
export function findDraft(slug: string, id: string): DraftFile {
  const d = listDrafts(slug).find((x) => x.file === id || x.file === `${id}.md` || x.meta.slug === id);
  if (!d) throw Error(`no draft ${id}`);
  return d;
}
function saveDraft(slug: string, d: DraftFile) {
  fs.mkdirSync(draftsDir(slug), { recursive: true });
  const f = path.join(draftsDir(slug), d.file), tmp = `${f}.tmp`;
  fs.writeFileSync(tmp, formatDraft(d), { mode: 0o600 });
  fs.renameSync(tmp, f);
}
export function log(slug: string, event: Record<string, unknown>) {
  fs.mkdirSync(blogDir(slug), { recursive: true });
  fs.appendFileSync(path.join(blogDir(slug), "log.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n");
}
export function readLog(slug: string, limit = 200): Record<string, unknown>[] {
  try {
    return fs.readFileSync(path.join(blogDir(slug), "log.jsonl"), "utf8").trim().split("\n").filter(Boolean).slice(-limit).map((l) => JSON.parse(l));
  } catch { return []; }
}

// ---------------------------------------------------------------- owner actions

export function setStatus(slug: string, id: string, status: "approved" | "rejected" | "draft") {
  const d = findDraft(slug, id);
  if (d.meta.status === "published") throw Error("already published");
  d.meta.status = status;
  saveDraft(slug, d);
  log(slug, { event: status === "approved" ? "approved" : status === "rejected" ? "rejected" : "reopened", draft: d.file });
  return d;
}
export function addNote(slug: string, id: string, text: string) {
  const d = findDraft(slug, id);
  const note = text.trim().slice(0, 2000);
  if (!note) throw Error("empty note");
  d.meta.notes = [...(d.meta.notes ?? []), { at: new Date().toISOString(), text: note }];
  saveDraft(slug, d);
  log(slug, { event: "note", draft: d.file });
  return d;
}

// ---------------------------------------------------------------- publisher adapter

type Listed = { slug: string; title: string; url: string; publishedAt?: string };
export async function publisherList(slug: string): Promise<Listed[]> {
  const out = (await execAdapter(readConnection(slug, "blog-connection.json").command, { action: "list" }, 120e3)) as { posts?: Listed[] };
  return Array.isArray(out?.posts) ? out.posts : [];
}

// ---------------------------------------------------------------- checks

async function statusOf(url: string): Promise<number> {
  const go = async (method: string) => (await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0 (HQ source check)" } })).status;
  try { const s = await go("HEAD"); return s === 405 || s === 403 ? await go("GET") : s; } catch { try { return await go("GET"); } catch { return 0; } }
}

/** Run every check on drafts that aren't published or rejected. */
export async function checkDrafts(slug: string, only?: string): Promise<DraftFile[]> {
  const profile = getProfile(slug), config = readBlogConfig(slug);
  if (!profile || !config) throw Error("no blog set up for this business");
  const listed = hasPublisher(slug) ? await publisherList(slug).catch(() => [] as Listed[]) : [];
  const all = listDrafts(slug);
  const mine = all.filter((d) => d.meta.status === "published");
  const todo = all.filter((d) => ["draft", "approved", "failed"].includes(d.meta.status) && (!only || d.file === only || d.meta.slug === only));
  for (const d of todo) {
    const sourceStatus: Record<string, number> = {};
    for (const s of d.meta.sources) if (/^https?:\/\//.test(s.url)) sourceStatus[s.url] = await statusOf(s.url);
    d.meta.checks = checkDraft(d, {
      site: config.site, regulated: profile.regulated,
      existingSlugs: listed.map((p) => p.slug).filter((s) => s !== d.meta.slug || d.meta.status !== "published"),
      existingTexts: mine.filter((m) => m.file !== d.file).map((m) => m.markdown),
      sourceStatus,
    });
    d.meta.checkedAt = new Date().toISOString();
    saveDraft(slug, d);
    log(slug, { event: "checked", draft: d.file, failed: d.meta.checks.filter((c) => !c.ok).map((c) => c.id) });
  }
  return todo;
}

// ---------------------------------------------------------------- publish + read back

const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
async function readBack(url: string, title: string): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "user-agent": "Mozilla/5.0 (HQ read-back)" } });
    return r.ok && unescape(await r.text()).toLowerCase().includes(title.toLowerCase());
  } catch { return false; }
}

const postOf = (d: DraftFile) => ({ slug: d.meta.slug, title: d.meta.title, description: d.meta.description, markdown: d.markdown, keyword: d.meta.keyword, category: d.meta.category, sources: d.meta.sources, faq: d.meta.faq, date: d.meta.date });

/** Publish every draft the rules allow; read back any that were published but not yet seen live. */
export async function publishReady(slug: string, now = new Date(), opts: { dryRun?: boolean } = {}): Promise<{ published: string[]; waiting: string[]; failed: string[] }> {
  const config = readBlogConfig(slug);
  if (!config) throw Error("no blog set up for this business");
  const res = { published: [] as string[], waiting: [] as string[], failed: [] as string[] };
  for (const d of listDrafts(slug)) {
    // Sent earlier, not yet seen live (a build or a cache): try the read-back again, for up to a day.
    if (d.meta.url && d.meta.status === "approved" && d.meta.publishedAt) {
      if (await readBack(d.meta.url, d.meta.title)) {
        d.meta.status = "published"; saveDraft(slug, d); log(slug, { event: "published", draft: d.file, url: d.meta.url }); res.published.push(d.file);
      } else if (now.getTime() - Date.parse(d.meta.publishedAt) > 864e5) {
        d.meta.status = "failed"; d.meta.error = "sent to the site but never seen live in a day"; saveDraft(slug, d); log(slug, { event: "failed", draft: d.file, why: "read-back" }); res.failed.push(d.file);
      } else res.waiting.push(d.file);
      continue;
    }
    const what = decide(config, d.meta, now);
    if (what === "wait" || what === "blocked") { res.waiting.push(d.file); continue; }
    if (what !== "publish") continue;
    if (!hasPublisher(slug)) { res.waiting.push(d.file); continue; }
    try {
      const out = (await execAdapter(readConnection(slug, "blog-connection.json").command, { action: "publish", post: postOf(d), ...(opts.dryRun ? { dryRun: true } : {}) }, PUBLISH_TIMEOUT_MS)) as { url?: string; publishedAt?: string };
      if (!out?.url) throw Error("the publisher returned no url");
      if (opts.dryRun) { log(slug, { event: "dry-run", draft: d.file, url: out.url }); continue; }
      d.meta.url = out.url; d.meta.publishedAt = out.publishedAt ?? new Date().toISOString(); d.meta.status = "approved"; delete d.meta.error;
      saveDraft(slug, d);
      log(slug, { event: "sent", draft: d.file, url: out.url });
      if (await readBack(out.url, d.meta.title)) {
        d.meta.status = "published"; saveDraft(slug, d); log(slug, { event: "published", draft: d.file, url: out.url }); res.published.push(d.file);
      } else res.waiting.push(d.file);
    } catch (e) {
      d.meta.status = "failed"; d.meta.error = String((e as Error).message).slice(0, 200); saveDraft(slug, d);
      log(slug, { event: "failed", draft: d.file, why: d.meta.error }); res.failed.push(d.file);
    }
  }
  return res;
}

/** The draft written today (business timezone), if any. */
export function draftToday(slug: string, tz: string, now = new Date()): DraftFile | null {
  const day = now.toLocaleDateString("en-CA", { timeZone: tz });
  return listDrafts(slug).find((d) => d.file.startsWith(day)) ?? null;
}

export function publishedPosts(slug: string): BlogDraftMeta[] {
  return listDrafts(slug).filter((d) => d.meta.status === "published").map((d) => d.meta);
}
