// Analytics: every number the workflows are judged by, for one business, week by week. Three sources feed it:
// the scorecard's weekly history (its headline numbers), HQ's own records (posts, Studio jobs, reviews,
// experiments, lifecycle sends, the brain, the brand kit, workflow checks, CEO findings) and a private, read-only
// analytics adapter per business for the rest. Like the scorecard, HQ accepts aggregates only, rebuilds every
// snapshot field by field and keeps a value per metric per ISO week, so numbers a source can only report "now"
// still build a trend. A number nobody measures stays missing, never zero. Contract: docs/guides/analytics.md.
import fs from "node:fs";
import path from "node:path";

import { ANALYTICS, ANALYTICS_IDS, RECURRING_ONLY, WORKFLOW_ANALYTICS, isRecurring, type AnalyticsDef, type AnalyticsId } from "./analytics-metrics";
import { brainStats } from "./brain-store";
import { listCampaigns } from "./campaign-store";
import type { CampaignOutcome } from "./campaigns";
import { listDrafts as listBlogDrafts, readBlogConfig } from "./blog-store";
import { listSocial, readSocialConfig } from "./social-store";
import { NETWORKS, keywordDmTool } from "./social";
import { listExperiments } from "./experiments";
import { lifecycleState } from "./lifecycle";
import { OPS_REVIEW_DAYS, opsRecords } from "./ops-records";
import { execAdapter, readConnection, writePrivateJson } from "./private-adapter";
import { looksPrivate, scorecardState } from "./scorecard";
import { acquisitionWindow, loadLedger, spreadNote } from "./ledger-spend";
import { unitAnalytics } from "./unit-economics";
import { loadUnitEconomics } from "./unit-economics-store";
import { businessDir, getProfile, hqRoot, ledgerPath, listReviews, type PublishedPost } from "./store";
import { workflowChecksState } from "./workflow-checks";
import { WORKFLOWS } from "./workflows";
import { newest } from "./load-test";
import { listLoadRuns, readLoadConfig } from "./load-test-store";

export type AQuality = "exact" | "approx" | "missing" | "na";
export type ARow = { label: string; value: number };
export type APoint = { week: string; value: number | null };
/** One metric as an adapter reports it. `value` is the current reading (null exactly when missing or na);
 *  `weeks` its weekly history (any order, unique weeks); `breakdown` a split of the current period. */
export type AnalyticsMetric = { id: AnalyticsId; value: number | null; quality: AQuality; note: string; weeks?: APoint[]; breakdown?: ARow[]; period?: string };
/** One post as it stands on its platform now: the Studio planner's live view (`lib/studio/planner-live.ts`).
 *  `trial`: an Instagram trial reel (shown to non-followers, off the grid). `views` null when the platform gave none. */
export type AnalyticsPost = { platform: PostPlatform; id: string; url: string; at: string; views: number | null; trial?: boolean; thumb?: string };
export type PostPlatform = "instagram" | "tiktok" | "youtube" | "x" | "facebook" | "linkedin";
/** `campaigns` (optional): outcomes per campaign tag (utm_campaign), counts and money only (lib/campaigns.ts).
 *  `posts` (optional): every post on the business's connected accounts, newest first, with its views now. */
export type AnalyticsSnapshot = { version: 1; observedAt: string; currency: string; metrics: AnalyticsMetric[]; campaigns?: CampaignOutcome[]; posts?: AnalyticsPost[] };

export const ALIMITS = { metrics: 150, weeks: 26, breakdown: 20, text: 200, staleHours: 36, campaigns: 100, posts: 500 };

// A post's link must be on its platform's own site and its thumbnail on the platform's image hosts: a snapshot can
// carry no other URL (the privacy check refuses links in text, so posts get these narrower rules instead).
const POST_HOSTS: Record<PostPlatform, RegExp> = {
  instagram: /^(www\.)?instagram\.com$/, tiktok: /^(www\.)?tiktok\.com$/, youtube: /^((www|m)\.)?youtube\.com$|^youtu\.be$/,
  x: /^(www\.)?(x|twitter)\.com$/, facebook: /^(www\.|m\.)?facebook\.com$|^fb\.watch$/, linkedin: /^(www\.)?linkedin\.com$/,
};
const THUMB_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net|tiktokcdn(-[a-z]+)?\.com|ytimg\.com|twimg\.com|licdn\.com)$/;
const httpsOn = (u: unknown, host: RegExp, max: number) => {
  if (typeof u !== "string" || u.length > max) return false;
  try { const x = new URL(u); return x.protocol === "https:" && host.test(x.hostname) && !x.username && !x.password; } catch { return false; }
};

const WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const text = (s: unknown): s is string => typeof s === "string" && s.length <= ALIMITS.text && !looksPrivate(s);
const label = (s: unknown) => text(s) && (s as string).trim().length > 0;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

// ---------------------------------------------------------------- validation

function metricProblem(m: any, at: string): string | null {
  if (!m || !Object.hasOwn(ANALYTICS, m.id)) return `${at}.id`;
  if (!["exact", "approx", "missing", "na"].includes(m.quality)) return `${at}.quality`;
  if (!text(m.note)) return `${at}.note`;
  const empty = m.quality === "missing" || m.quality === "na";
  if (empty ? m.value !== null : !finite(m.value)) return `${at}.value`;
  if (m.period !== undefined && !label(m.period)) return `${at}.period`;
  if (m.weeks !== undefined) {
    if (!Array.isArray(m.weeks) || m.weeks.length > ALIMITS.weeks) return `${at}.weeks`;
    const seen = new Set<string>();
    for (let i = 0; i < m.weeks.length; i++) {
      const p = m.weeks[i];
      if (!p || !WEEK.test(p.week) || seen.has(p.week)) return `${at}.weeks[${i}].week`;
      seen.add(p.week);
      if (p.value !== null && !finite(p.value)) return `${at}.weeks[${i}].value`;
    }
  }
  if (m.breakdown !== undefined) {
    if (!Array.isArray(m.breakdown) || m.breakdown.length > ALIMITS.breakdown) return `${at}.breakdown`;
    for (let i = 0; i < m.breakdown.length; i++) {
      if (!m.breakdown[i] || !label(m.breakdown[i].label)) return `${at}.breakdown[${i}].label`;
      if (!finite(m.breakdown[i].value) || m.breakdown[i].value < 0) return `${at}.breakdown[${i}].value`;
    }
  }
  return null;
}

/** The first field that keeps a snapshot out, as a path (never its value), or null if it's acceptable. */
export function analyticsProblem(v: unknown, currency: string): string | null {
  const x = v as AnalyticsSnapshot;
  if (!x || x.version !== 1) return "version";
  if (x.currency !== currency) return "currency";
  if (typeof x.observedAt !== "string" || !ISO.test(x.observedAt) || !Number.isFinite(Date.parse(x.observedAt))) return "observedAt";
  if (!Array.isArray(x.metrics) || x.metrics.length > ALIMITS.metrics) return "metrics";
  for (let i = 0; i < x.metrics.length; i++) { const p = metricProblem(x.metrics[i], `metrics[${i}]`); if (p) return p; }
  if (new Set(x.metrics.map((m) => m.id)).size !== x.metrics.length) return "metrics";
  if (x.campaigns !== undefined) {
    if (!Array.isArray(x.campaigns) || x.campaigns.length > ALIMITS.campaigns) return "campaigns";
    for (let i = 0; i < x.campaigns.length; i++) { const p = campaignRowProblem(x.campaigns[i], `campaigns[${i}]`); if (p) return p; }
  }
  if (x.posts !== undefined) {
    if (!Array.isArray(x.posts) || x.posts.length > ALIMITS.posts) return "posts";
    for (let i = 0; i < x.posts.length; i++) { const p = postProblem(x.posts[i], `posts[${i}]`); if (p) return p; }
  }
  return null;
}

function postProblem(p: any, at: string): string | null {
  if (!p || typeof p !== "object") return at;
  if (!Object.hasOwn(POST_HOSTS, p.platform)) return `${at}.platform`;
  if (typeof p.id !== "string" || !/^[\w.-]{1,100}$/.test(p.id)) return `${at}.id`;
  if (!httpsOn(p.url, POST_HOSTS[p.platform as PostPlatform], 300)) return `${at}.url`;
  if (typeof p.at !== "string" || !ISO.test(p.at) || !Number.isFinite(Date.parse(p.at))) return `${at}.at`;
  if (p.views !== null && !(finite(p.views) && p.views >= 0)) return `${at}.views`;
  if (p.trial !== undefined && typeof p.trial !== "boolean") return `${at}.trial`;
  if (p.thumb !== undefined && !httpsOn(p.thumb, THUMB_HOSTS, 2000)) return `${at}.thumb`;
  return null;
}

// A campaign row is keyed by its campaign's utm tag, which may be a prefix ending in * (e.g. a series' "1m365-*").
const TAG = /^[A-Za-z0-9][\w.-]{0,79}\*?$/;
function campaignRowProblem(r: any, at: string): string | null {
  if (!r || typeof r !== "object") return at;
  if (typeof r.utm !== "string" || !TAG.test(r.utm) || looksPrivate(r.utm)) return `${at}.utm`;
  if (r.id !== undefined && (typeof r.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id) || r.id.length > 60)) return `${at}.id`;
  for (const k of ["visits", "signups", "paying", "revenue"]) if (r[k] !== undefined && !(finite(r[k]) && r[k] >= 0)) return `${at}.${k}`;
  if (r.period !== undefined && !label(r.period)) return `${at}.period`;
  return null;
}

export function rebuildAnalytics(s: AnalyticsSnapshot): AnalyticsSnapshot {
  return {
    version: 1, observedAt: new Date(s.observedAt).toISOString(), currency: s.currency,
    metrics: s.metrics.map((m) => ({
      id: m.id, value: m.value, quality: m.quality, note: m.note,
      ...(m.period !== undefined ? { period: m.period } : {}),
      ...(m.weeks ? { weeks: m.weeks.map(({ week, value }) => ({ week, value })) } : {}),
      ...(m.breakdown ? { breakdown: m.breakdown.map(({ label, value }) => ({ label, value })) } : {}),
    })),
    ...(s.campaigns ? { campaigns: s.campaigns.map((r) => ({
      utm: r.utm.toLowerCase(), ...(r.id !== undefined ? { id: r.id } : {}),
      ...Object.fromEntries((["visits", "signups", "paying", "revenue"] as const).filter((k) => r[k] !== undefined).map((k) => [k, r[k]])),
      ...(r.period !== undefined ? { period: r.period } : {}),
    })) } : {}),
    ...(s.posts ? { posts: s.posts.map((p) => ({
      platform: p.platform, id: p.id, url: p.url, at: new Date(p.at).toISOString(), views: p.views,
      ...(p.trial !== undefined ? { trial: p.trial } : {}), ...(p.thumb !== undefined ? { thumb: p.thumb } : {}),
    })) } : {}),
  };
}

// ---------------------------------------------------------------- weeks

/** The ISO week ("2026-W41") a moment falls in, in the given time zone. */
export function isoWeek(t: number | Date, tz = "UTC"): string {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t)).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const week = Math.ceil(((dt.getTime() - Date.UTC(dt.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** The last `n` ISO weeks ending with the one `now` falls in, oldest first. */
export function lastWeeks(n: number, now: number, tz = "UTC"): string[] {
  const out: string[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const w = isoWeek(now - k * 7 * 864e5, tz);
    if (out.at(-1) !== w) out.push(w);
  }
  return out;
}

/** Count timestamps per ISO week over the last `n` weeks, oldest first (weeks with none read 0). */
export function weeklyCounts(times: (string | number)[], n: number, now: number, tz = "UTC"): APoint[] {
  const weeks = lastWeeks(n, now, tz), by = new Map(weeks.map((w) => [w, 0]));
  for (const t of times) { const w = isoWeek(typeof t === "number" ? t : Date.parse(t), tz); if (by.has(w)) by.set(w, by.get(w)! + 1); }
  return weeks.map((week) => ({ week, value: by.get(week)! }));
}

// ---------------------------------------------------------------- HQ's own records

/** "Comment REVIEW": the keyword itself is in capitals, so "comment below" isn't one (as workflow-evidence). */
const KEYWORD = /\b[Cc]omment ([A-Z][A-Z0-9]{2,})\b/;
const DAY = 864e5;
const tally = (xs: string[]): ARow[] =>
  [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, ALIMITS.breakdown);
const PLATFORM: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", x: "X", facebook: "Facebook", linkedin: "LinkedIn", pinterest: "Pinterest", threads: "Threads", discord: "Discord", telegram: "Telegram" };

function readPosts(slug: string): PublishedPost[] {
  try {
    return fs.readFileSync(path.join(businessDir(slug), "published.jsonl"), "utf8").split("\n").filter(Boolean).flatMap((l) => {
      try { return [JSON.parse(l) as PublishedPost]; } catch { return []; }
    });
  } catch { return []; }
}

/** Studio jobs with a finished render, dated by their folder name (YYYY-MM-DD-…) or the newest render. */
function studioJobTimes(slug: string): number[] {
  const dir = path.join(businessDir(slug), "studio");
  const out: number[] = [];
  for (const job of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    try {
      const jd = path.join(dir, job);
      const renders = fs.readdirSync(jd).filter((n) => n.endsWith(".mp4") && n !== "master.mp4");
      if (!renders.length) continue;
      const m = /^(\d{4}-\d{2}-\d{2})/.exec(job);
      out.push(m ? Date.parse(`${m[1]}T12:00:00Z`) : Math.max(...renders.map((n) => fs.statSync(path.join(jd, n)).mtimeMs)));
    } catch { /* not a job folder */ }
  }
  return out;
}

/** Active notes in the business's own brain, by type (lib/brain-store). */
function vaultNoteCounts(slug: string): ARow[] {
  try {
    const counts = brainStats(slug).counts.business;
    return Object.entries(counts).map(([t, value]) => ({ label: t[0].toUpperCase() + t.slice(1) + "s", value })).filter((r) => r.value > 0);
  } catch { return []; }
}

/** How much of the brand kit is filled in: guide, palette, a mark, social templates, emails, a video style. */
function brandCoverage(slug: string): { share: number; missing: string[] } | null {
  const dir = businessDir(slug);
  if (!fs.existsSync(dir)) return null;
  let kit: any = null;
  try { kit = JSON.parse(fs.readFileSync(path.join(dir, "brand", "kit.json"), "utf8")); } catch { /* none */ }
  const exists = (f: string) => fs.existsSync(path.join(dir, f));
  const parts: [string, boolean][] = [
    ["a brand guide", Boolean(kit?.guide) || exists("brand/brand-guide.md")],
    ["a colour palette", (kit?.colors?.length ?? 0) >= 3 || exists("brand/tokens.json")],
    ["a logo or mark", (kit?.assets ?? []).some((a: any) => /logo|mark|icon/i.test(`${a.file} ${a.label}`)) || (() => { try { return fs.readdirSync(path.join(dir, "brand")).some((n) => /logo|mark|icon/i.test(n)); } catch { return false; } })()],
    ["social templates", (kit?.assets ?? []).some((a: any) => /social|post|story|cover/i.test(`${a.file} ${a.label}`)) || exists("brand/social-square.svg")],
    ["branded emails", (kit?.emails?.length ?? 0) > 0],
    ["a video style", exists("brand.json") || exists("style.json")],
  ];
  return { share: parts.filter(([, ok]) => ok).length / parts.length, missing: parts.filter(([, ok]) => !ok).map(([what]) => what) };
}

/** How many of the timestamps fall in the 7 days up to `now`: the headline for weekly counts, so a Monday doesn't read 0. */
const last7 = (times: (string | number)[], now: number) => times.filter((t) => { const x = typeof t === "number" ? t : Date.parse(t); return x <= now && now - x < 7 * DAY; }).length;

const m = (id: AnalyticsId, value: number | null, note: string, extra: Partial<AnalyticsMetric> = {}): AnalyticsMetric =>
  ({ id, value, quality: value === null ? "missing" : "exact", note, ...extra });

/** What HQ measures from its own records for one business. `openFindings` comes from the CEO's live findings when known. */
/** Numbers HQ can only measure at refresh time (they need the live site or a local service). */
export type Extras = {
  openFindings?: { total: number; bySeverity: ARow[] } | null;
  competitors?: { weeks: { week: string; value: number }[]; byCompetitor: ARow[]; watches: number } | null;
};

export function hqMetrics(slug: string, now = Date.now(), extras: Extras = {}): AnalyticsMetric[] {
  const { openFindings, competitors } = extras;
  const profile = getProfile(slug);
  if (!profile) throw Error("Unknown business");
  const tz = profile.timezone || "UTC";
  const out: AnalyticsMetric[] = [];
  const recent = (t: string | number) => now - (typeof t === "number" ? t : Date.parse(t)) < 28 * DAY;

  const posts = readPosts(slug).filter((p) => p.status === "published" && (p.url || p.postId));
  const pw = weeklyCounts(posts.map((p) => p.at), 12, now, tz);
  out.push(posts.length
    ? m("posts_published", last7(posts.map((p) => p.at), now), `Last 7 days; ${posts.length} posts read back from the platform in all`, { weeks: pw, breakdown: tally(posts.filter((p) => recent(p.at)).map((p) => PLATFORM[p.platform] ?? p.platform)), period: "last 4 weeks" })
    : m("posts_published", null, "No published posts logged yet (/hq:publish logs them)"));
  const kw = posts.filter((p) => KEYWORD.test(p.caption ?? ""));
  out.push(kw.length
    ? m("keyword_posts", last7(kw.map((p) => p.at), now), `Keywords: ${[...new Set(kw.map((p) => (p.caption ?? "").match(KEYWORD)![1]))].slice(0, 6).join(", ")}`,
      { weeks: weeklyCounts(kw.map((p) => p.at), 12, now, tz), breakdown: tally(kw.filter((p) => recent(p.at)).map((p) => (p.caption ?? "").match(KEYWORD)![1])), period: "last 4 weeks" })
    : (() => {
      // No keyword-DM tool on any network: the business's posts don't ask for keywords, so the number doesn't apply.
      const c = readSocialConfig(slug);
      return c && !NETWORKS.some((n) => keywordDmTool(c, n))
        ? m("keyword_posts", null, "Not applicable: no comment-to-DM tool answers keywords for this business (keywordDms in social.json), so its posts don't ask for one", { quality: "na" })
        : m("keyword_posts", null, "No published post asks for a comment keyword yet");
    })());

  const jobs = studioJobTimes(slug);
  out.push(jobs.length
    ? m("videos_edited", last7(jobs, now), `Last 7 days; ${jobs.length} Studio jobs with a finished render in all`, { weeks: weeklyCounts(jobs, 12, now, tz) })
    : m("videos_edited", null, "No Studio job has a finished render yet"));

  try {
    const flows = lifecycleState(slug).snapshot?.flows ?? [];
    const days = flows.flatMap((f) => f.daily.map((d) => ({ ...d, flow: f.label })));
    if (days.length) {
      const weeks = lastWeeks(12, now, tz), by = new Map(weeks.map((w) => [w, 0]));
      for (const d of days) { const w = isoWeek(Date.parse(`${d.day}T12:00:00Z`), "UTC"); if (by.has(w)) by.set(w, by.get(w)! + d.sent); }
      const split = new Map<string, number>();
      for (const d of days) if (recent(`${d.day}T12:00:00Z`) && d.sent) split.set(d.flow, (split.get(d.flow) ?? 0) + d.sent);
      const sent7 = days.filter((d) => { const t = Date.parse(`${d.day}T12:00:00Z`); return now - t < 7 * DAY && t <= now; }).reduce((n, d) => n + d.sent, 0);
      out.push(m("lifecycle_sent", sent7, `Last 7 days, ${flows.length} automated flows; owner tests excluded`, {
        weeks: weeks.map((week) => ({ week, value: by.get(week)! })), period: "last 4 weeks",
        breakdown: [...split].map(([label, value]) => ({ label: label.slice(0, 80), value })).sort((a, b) => b.value - a.value).slice(0, ALIMITS.breakdown),
      }));
    } else out.push(m("lifecycle_sent", null, "No lifecycle connection with per-flow numbers yet"));
  } catch { out.push(m("lifecycle_sent", null, "The lifecycle snapshot could not be read")); }

  const reviews = listReviews(slug);
  out.push(reviews.length
    ? m("ceo_reviews", last7(reviews.map((r) => r.at), now), `${reviews.length} reviews saved; the latest ${reviews[0].at.slice(0, 10)}`, { weeks: weeklyCounts(reviews.map((r) => r.at), 12, now, tz) })
    : m("ceo_reviews", null, "No CEO review saved yet (/hq:ceo)"));

  const xs = listExperiments(slug);
  out.push(xs.length
    ? m("experiments_run", xs.filter((x) => x.status === "running").length, `${xs.length} logged; the value is how many are running`, { weeks: weeklyCounts(xs.map((x) => x.startedAt), 12, now, tz), breakdown: tally(xs.map((x) => x.status)), period: "all time" })
    : m("experiments_run", null, "No experiment logged yet (hq experiment add)"));

  const notes = vaultNoteCounts(slug);
  out.push(notes.length
    ? m("vault_notes", notes.reduce((n, r) => n + r.value, 0), "Facts, decisions, lessons, playbooks and signals in the business's vault", { breakdown: notes, period: "now" })
    : m("vault_notes", null, "The business's vault has no brain notes yet"));

  let ops: ReturnType<typeof opsRecords> = null;
  try { ops = opsRecords(slug, new Date(now)); } catch { /* no vault */ }
  out.push(ops?.runbooks
    ? m("runbooks", ops.runbooks, `Vendor review ${ops.vendorReview?.day ?? `none in ${OPS_REVIEW_DAYS} days`}; risk register ${ops.riskRegister?.day ?? `none in ${OPS_REVIEW_DAYS} days`}`)
    : m("runbooks", null, "No runbook in the vault yet (a playbook titled \"Runbook: ...\")"));

  try {
    const cfg = readLoadConfig(slug); const last = newest(listLoadRuns(slug));
    out.push(cfg && last
      ? m("load_test_users", last.maxPassing ?? 0, `Latest run ${last.at.slice(0, 10)}${last.firstFail ? `, failed at ${last.firstFail.users}` : ", every step passed"}; target ${cfg.targetUsers}`, { period: "latest run" })
      : m("load_test_users", null, cfg ? "Set up, but no load test recorded yet (npm run hq -- loadtest record)" : "No load test set up (npm run hq -- loadtest setup)"));
  } catch { out.push(m("load_test_users", null, "The load test records could not be read")); }

  if (openFindings) out.push(m("open_findings", openFindings.total, "The CEO's open findings for this business and this Mac", { breakdown: openFindings.bySeverity, period: "now" }));
  else out.push(m("open_findings", null, "Counted at each refresh (npm run hq -- analytics refresh)"));

  const blogPosts = listBlogDrafts(slug).filter((d) => d.meta.status === "published" && d.meta.publishedAt).map((d) => d.meta.publishedAt!);
  out.push(blogPosts.length
    ? m("blog_posts", last7(blogPosts, now), `Last 7 days; ${blogPosts.length} posts read back live in all`, { weeks: weeklyCounts(blogPosts, 12, now, tz) })
    : m("blog_posts", null, readBlogConfig(slug) ? "No post has gone live yet" : "No daily blog yet (npm run hq -- blog setup)"));

  const socialPosted = listSocial(slug, 26).filter((d) => d.status === "posted" && d.postedAt).map((d) => d.postedAt!);
  out.push(socialPosted.length
    ? m("social_posts", last7(socialPosted, now), `Last 7 days; ${socialPosted.length} planned posts out in all`, { weeks: weeklyCounts(socialPosted, 12, now, tz) })
    : m("social_posts", null, readSocialConfig(slug) ? "No planned post has gone out yet" : "No weekly social plan yet (npm run hq -- social setup)"));

  try {
    const cs = listCampaigns(slug);
    const live = cs.filter((c) => c.status === "live");
    out.push(cs.length
      ? m("campaigns_live", live.length, `${cs.length} campaigns in all; the value is how many are live`, { breakdown: tally(cs.map((c) => c.status)), period: "now" })
      : m("campaigns_live", null, "No campaign yet (npm run hq -- campaign add)"));
  } catch { out.push(m("campaigns_live", null, "The campaigns could not be read")); }

  const brand = brandCoverage(slug);
  out.push(brand ? m("brand_kit_coverage", Math.round(brand.share * 1000) / 1000, brand.missing.length ? `Missing ${brand.missing.join(", ")}` : "Guide, palette, mark, social templates, emails and a video style")
    : m("brand_kit_coverage", null, "No brand kit yet"));

  if (competitors) out.push(m("competitor_changes", competitors.weeks.slice(-4).reduce((n, w) => n + w.value, 0), `Changes the watcher saw on ${competitors.watches} rival pages, last 4 weeks`,
    { weeks: competitors.weeks, breakdown: competitors.byCompetitor, period: "last 4 weeks, by rival" }));

  // Acquisition spend from the business's ledger (Expenses:Advertising / Partnerships / Commissions), per week; monthly
  // imported totals are spread over their month's days (lib/ledger-spend.ts acquisitionWindow).
  try {
    const ledger = loadLedger(ledgerPath(slug));
    if (ledger.trim()) {
      const weeks = lastWeeks(12, now, tz), by = new Map(weeks.map((w) => [w, 0]));
      let postings = 0;
      for (let d = 0; d < 7 * 13; d++) {
        const day = new Date(now - d * DAY); const from = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
        const r = acquisitionWindow(ledger, profile.currency, from, new Date(from.getTime() + DAY));
        const w = isoWeek(from.getTime() + 12 * 3600e3, tz);
        const counted = r.postings + r.estimated.length;
        if (counted && by.has(w)) { by.set(w, Math.round((by.get(w)! + r.total) * 100) / 100); postings += counted; }
      }
      if (postings) {
        const r28 = acquisitionWindow(ledger, profile.currency, new Date(now - 28 * DAY), new Date(now + DAY));
        const how = spreadNote(r28);
        out.push(m("ad_spend", r28.total, `Advertising, partnerships and commissions in the ledger, last 4 weeks${how ? `; ${how}` : ""}`.slice(0, 200),
          { ...(how ? { quality: "approx" as const } : {}), weeks: weeks.map((week) => ({ week, value: by.get(week)! })) }));
      }
    }
  } catch { /* no ledger */ }

  // Unit economics for the last closed month, from the ledger and the scorecard (lib/unit-economics.ts).
  try {
    for (const x of unitAnalytics(loadUnitEconomics(slug, new Date(now)))) out.push({ id: x.id, value: x.value, quality: x.quality, note: x.note, ...(x.period ? { period: x.period } : {}), ...(x.breakdown?.length ? { breakdown: x.breakdown } : {}) });
  } catch { out.push(m("monthly_costs", null, "The ledger could not be read")); }

  try {
    const c = workflowChecksState(slug).snapshot;
    const all = c?.workflows.flatMap((w) => w.checks) ?? [];
    out.push(all.length
      ? m("workflow_checks_passing", Math.round((all.filter((k) => k.ok).length / all.length) * 1000) / 1000, `${all.filter((k) => k.ok).length} of ${all.length} checks passed, ${c!.observedAt.slice(0, 10)}`)
      : m("workflow_checks_passing", null, "No workflow-checks connection yet"));
  } catch { out.push(m("workflow_checks_passing", null, "The workflow checks could not be read")); }
  return out;
}

// ---------------------------------------------------------------- storage

const CONNECTION = "analytics-connection.json";
const files = (slug: string) => {
  const dir = businessDir(slug);
  return { dir, connection: path.join(dir, CONNECTION), snapshot: path.join(dir, "analytics-snapshot.json"), hq: path.join(dir, "analytics-hq.json"), state: path.join(dir, "analytics-state.json"), history: path.join(dir, "analytics") };
};
const readJson = (file: string): unknown => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
export const demoAnalyticsAdapter = () => path.join(hqRoot(), "templates", "analytics", "demo-adapter.mjs");

/** One kept week: each metric's reading when the week's last refresh ran. */
export type KeptWeek = { week: string; values: Partial<Record<AnalyticsId, number | null>> };

export type AnalyticsState = {
  connected: boolean; demo: boolean; snapshot: AnalyticsSnapshot | null; hq: AnalyticsSnapshot | null;
  stale: boolean; failed: boolean; failedAt: string | null; history: KeptWeek[];
};

export function analyticsState(slug: string, now: Date = new Date()): AnalyticsState {
  const profile = getProfile(slug);
  if (!profile) throw Error("Unknown business");
  const f = files(slug);
  const connected = fs.existsSync(f.connection);
  const demo = !connected && Boolean(profile.demo);
  const raw = readJson(f.snapshot), hqRaw = readJson(f.hq);
  const snapshot = analyticsProblem(raw, profile.currency) === null ? (raw as AnalyticsSnapshot) : null;
  const hq = analyticsProblem(hqRaw, profile.currency) === null ? (hqRaw as AnalyticsSnapshot) : null;
  const failedAt = (readJson(f.state) as { failedAt?: string } | null)?.failedAt ?? null;
  const age = snapshot ? now.getTime() - Date.parse(snapshot.observedAt) : Infinity;
  const history = (fs.existsSync(f.history) ? fs.readdirSync(f.history) : [])
    .filter((n) => /^\d{4}-W\d{2}\.json$/.test(n)).sort()
    .map((n) => readJson(path.join(f.history, n)) as KeptWeek | null)
    .filter((k): k is KeptWeek => Boolean(k && WEEK.test(k.week) && k.values && typeof k.values === "object"));
  return { connected, demo, snapshot, hq, stale: age < 0 || age > ALIMITS.staleHours * 3600e3, failed: Boolean(failedAt), failedAt, history };
}

function takeLock(file: string): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { fs.closeSync(fs.openSync(file, "wx", 0o600)); return true; } catch {
      try { if (Date.now() - fs.statSync(file).mtimeMs > 120e3) { fs.rmSync(file, { force: true }); continue; } } catch { continue; }
      return false;
    }
  }
  return false;
}

/** Re-measure HQ's own numbers, run the business's adapter (or the demo one), and keep this week's readings.
 *  An adapter failure keeps the previous snapshot and is recorded; HQ's own numbers are saved either way. */
export async function runAnalytics(slug: string, now: Date = new Date(), extras: Extras = {}): Promise<AnalyticsState & { adapterError: string | null }> {
  const profile = getProfile(slug);
  if (!profile) throw Error("Unknown business");
  const f = files(slug);
  const lock = path.join(f.dir, "analytics.lock");
  if (!takeLock(lock)) throw Error("An analytics refresh is already running for this business");
  let adapterError: string | null = null;
  try {
    const hq: AnalyticsSnapshot = { version: 1, observedAt: now.toISOString(), currency: profile.currency, metrics: hqMetrics(slug, now.getTime(), extras) };
    const hqProblem = analyticsProblem(hq, profile.currency);
    if (hqProblem) throw Error(`HQ's own analytics failed validation at ${hqProblem}`);
    writePrivateJson(f.hq, rebuildAnalytics(hq));

    const command = fs.existsSync(f.connection) ? readConnection(slug, CONNECTION).command
      : profile.demo ? [process.execPath, demoAnalyticsAdapter()] : null;
    let adapter: AnalyticsSnapshot | null = null;
    if (command) {
      try {
        // The campaigns that have started, so the adapter can count visits, sign-ups and revenue per tag since each start.
        const campaigns = listCampaigns(slug).filter((c) => c.status !== "planned").map(({ id, utm, start, end }) => ({ id, utm, start, ...(end ? { end } : {}) }));
        const value = await execAdapter(command, { action: "report", weeks: 12, currency: profile.currency, timezone: profile.timezone, now: now.toISOString(), campaigns }, 240000);
        const problem = analyticsProblem(value, profile.currency);
        if (problem) throw Error(`Invalid analytics snapshot at ${problem}`);
        adapter = rebuildAnalytics(value as AnalyticsSnapshot);
        writePrivateJson(f.snapshot, adapter);
        fs.rmSync(f.state, { force: true });
      } catch (e) {
        adapterError = e instanceof Error ? e.message : String(e);
        writePrivateJson(f.state, { failedAt: now.toISOString() });
      }
    }

    // Keep this week's reading of every number, so "now only" sources still build a trend.
    const week = isoWeek(now, profile.timezone || "UTC");
    const values: KeptWeek["values"] = {};
    for (const x of [...hq.metrics, ...(adapter ?? analyticsState(slug, now).snapshot ?? { metrics: [] }).metrics]) values[x.id] = x.value;
    try {
      const sc = scorecardState(slug, now).snapshot;
      for (const x of sc?.weeks[0]?.metrics ?? []) if (!(x.id in values)) values[x.id as AnalyticsId] = x.value;
    } catch { /* no scorecard */ }
    fs.mkdirSync(f.history, { recursive: true, mode: 0o700 });
    writePrivateJson(path.join(f.history, `${week}.json`), { week, values });
    const kept = fs.readdirSync(f.history).filter((n) => /^\d{4}-W\d{2}\.json$/.test(n)).sort();
    for (const old of kept.slice(0, Math.max(0, kept.length - 52))) fs.rmSync(path.join(f.history, old));
  } finally {
    fs.rmSync(lock, { force: true });
  }
  return { ...analyticsState(slug, now), adapterError };
}

// ---------------------------------------------------------------- the board

export type BoardMetric = {
  id: AnalyticsId; def: AnalyticsDef;
  status: "measured" | "missing" | "na";
  value: number | null; quality: AQuality; note: string;
  /** Oldest first, at most 26 weeks. */
  points: APoint[];
  breakdown: ARow[]; period: string | null;
  /** Change from the week before, when both are known. */
  change: number | null;
  from: "scorecard" | "hq" | "adapter" | null;
  workflows: string[];
};
export type Board = {
  business: { slug: string; name: string; currency: string; demo: boolean; model: string };
  observedAt: string | null; stale: boolean; failed: boolean; connected: boolean;
  metrics: BoardMetric[];
  coverage: { measured: number; applicable: number; workflowsMeasured: number; workflows: number };
};

/** Merge weekly points: earlier sources first, later ones win on the same week; oldest first, the newest `last`. */
function mergePoints(last: number, ...sources: APoint[][]): APoint[] {
  const by = new Map<string, number | null>();
  for (const s of sources) for (const p of s) if (p.value !== null || !by.has(p.week)) by.set(p.week, p.value);
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-last).map(([week, value]) => ({ week, value }));
}

/** Everything the dashboard draws for one business, one entry per catalogue metric. */
export function analyticsBoard(slug: string, now: Date = new Date()): Board {
  const profile = getProfile(slug);
  if (!profile) throw Error("Unknown business");
  const s = analyticsState(slug, now);
  let sc: ReturnType<typeof scorecardState> | null = null;
  try { sc = scorecardState(slug, now); } catch { sc = null; }
  // HQ's own numbers are cheap, so the page measures them live; the saved copy is the fallback.
  let hqLive: AnalyticsMetric[] | null = null;
  try { hqLive = hqMetrics(slug, now.getTime()); } catch { hqLive = null; }
  // Live readings win; what only a refresh can measure (findings, competitor changes) comes from the saved copy.
  const hq = new Map((hqLive ?? []).map((x) => [x.id, x]));
  for (const x of s.hq?.metrics ?? []) if (x.value !== null && (hq.get(x.id)?.value ?? null) === null) hq.set(x.id, x);
  const adapter = new Map((s.snapshot?.metrics ?? []).map((x) => [x.id, x]));
  const kept = (id: AnalyticsId): APoint[] => s.history.filter((k) => id in k.values).map((k) => ({ week: k.week, value: k.values[id] ?? null }));
  const titles = WORKFLOWS.map((w) => w.title);
  const recurring = isRecurring(profile.model);

  const metrics: BoardMetric[] = ANALYTICS_IDS.map((id) => {
    const def: AnalyticsDef = ANALYTICS[id];
    const workflows = titles.filter((t) => WORKFLOW_ANALYTICS[t]?.includes(id));
    const base = { id, def, workflows };
    const a = adapter.get(id);
    const fromAdapter = (x: AnalyticsMetric): BoardMetric => {
      const points = mergePoints(26, kept(id), x.weeks ?? []);
      return finish({ ...base, status: x.quality === "na" ? "na" : x.quality === "missing" ? "missing" : "measured", value: x.value, quality: x.quality, note: x.note, points, breakdown: x.breakdown ?? [], period: x.period ?? null, from: "adapter" });
    };
    // An adapter's reading wins for any id it actually measures.
    if (a && (a.quality === "exact" || a.quality === "approx")) return fromAdapter(a);
    if (def.source === "scorecard" && sc?.snapshot) {
      const cur = sc.snapshot.weeks[0].metrics.find((x) => x.id === id);
      if (cur && cur.value !== null) {
        const weeks = [...sc.history, ...sc.snapshot.weeks].map((w) => ({ week: w.week, value: w.metrics.find((x) => x.id === id)?.value ?? null }));
        return finish({ ...base, status: "measured", value: cur.value, quality: cur.quality, note: cur.note, points: mergePoints(26, weeks), breakdown: cur.breakdown ?? [], period: cur.breakdown ? "this week" : null, from: "scorecard" });
      }
      // A number the scorecard can't measure this week falls to HQ's own reading of it, if there is one.
      if (cur && hq.get(id)?.value == null) return finish({ ...base, status: recurring || !RECURRING_ONLY.includes(id) ? "missing" : "na", value: null, quality: "missing", note: cur.note, points: [], breakdown: [], period: null, from: "scorecard" });
    }
    if (hq.get(id)?.value != null) {
      const x = hq.get(id)!;
      return finish({ ...base, status: "measured", value: x.value, quality: x.quality, note: x.note, points: mergePoints(26, kept(id), x.weeks ?? []), breakdown: x.breakdown ?? [], period: x.period ?? null, from: "hq" });
    }
    if (a) return fromAdapter(a);
    const hx = hq.get(id);
    // Not applicable: a subscription-only number on a business that doesn't bill that way, or HQ's own reading says so.
    const na = (!recurring && RECURRING_ONLY.includes(id)) || hx?.quality === "na";
    return finish({ ...base, status: na ? "na" : "missing", value: null, quality: na ? "na" : "missing",
      note: !recurring && RECURRING_ONLY.includes(id) ? `Needs recurring billing; this business is ${profile.model}` : hx?.note ?? (def.source === "adapter" ? (s.connected || s.demo ? "Not reported by the analytics adapter" : "No analytics adapter connected") : "Not reported by the scorecard adapter"),
      points: [], breakdown: [], period: null, from: null });
  });

  // Lifetime value to cost to win: worked out here when nothing reports it but both halves are measured.
  const ratio = metrics.find((x) => x.id === "ltv_to_cac")!, ltvM = metrics.find((x) => x.id === "ltv")!, cac = metrics.find((x) => x.id === "cost_to_win")!;
  if (ratio.status !== "measured" && ltvM.status === "measured" && cac.status === "measured" && (cac.value ?? 0) > 0) {
    Object.assign(ratio, finish({ ...ratio, status: "measured", value: Math.round(((ltvM.value as number) / (cac.value as number)) * 100) / 100, quality: "approx",
      note: `Lifetime value ${ltvM.value} over cost to win ${cac.value}; worked out by HQ from those two numbers`, points: [], breakdown: [], period: null, from: "hq" }));
  }

  const applicable = metrics.filter((x) => x.status !== "na");
  const measuredIds = new Set(metrics.filter((x) => x.status === "measured").map((x) => x.id));
  const naIds = new Set(metrics.filter((x) => x.status === "na").map((x) => x.id));
  const relevant = titles.filter((t) => !(WORKFLOW_ANALYTICS[t] ?? []).every((id) => naIds.has(id)));
  return {
    business: { slug, name: profile.name, currency: profile.currency, demo: Boolean(profile.demo), model: profile.model },
    observedAt: [s.snapshot?.observedAt, s.hq?.observedAt, sc?.snapshot?.observedAt].filter((x): x is string => Boolean(x)).sort().at(-1) ?? null,
    stale: s.stale && (s.connected || s.demo), failed: s.failed, connected: s.connected || s.demo,
    metrics,
    coverage: {
      measured: measuredIds.size, applicable: applicable.length,
      workflowsMeasured: relevant.filter((t) => (WORKFLOW_ANALYTICS[t] ?? []).some((id) => measuredIds.has(id))).length, workflows: relevant.length,
    },
  };
}

export type AnalyticsAlarm = { id: AnalyticsId; label: string; value: number; note: string; workflow: string; owner: string; action: string };

/** Measured alarm numbers (faults that should read zero) that read above zero, each with the workflow that owns it. */
export function analyticsAlarms(metrics: BoardMetric[]): AnalyticsAlarm[] {
  return metrics.filter((m) => m.def.alarm && m.status === "measured" && (m.value ?? 0) > 0).map((m) => {
    const workflow = m.workflows[0] ?? "";
    return { id: m.id, label: m.def.label, value: m.value as number, note: m.note, workflow,
      owner: WORKFLOWS.find((w) => w.title === workflow)?.owner ?? "data", action: m.def.alarm as string };
  });
}

function finish(x: Omit<BoardMetric, "change">): BoardMetric {
  const known = x.points.filter((p) => p.value !== null);
  const [prev, last] = known.slice(-2);
  const change = prev && last && x.value !== null && last.value === x.value ? Math.round(((last.value as number) - (prev.value as number)) * 1000) / 1000 : null;
  return { ...x, change };
}
