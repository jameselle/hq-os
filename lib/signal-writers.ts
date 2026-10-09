// The signals departments write on their own, once a week, from records HQ already holds (no model calls):
//   Data & Analytics     → CEO (the week's scorecard), Email (at-risk numbers), Product (the funnel),
//                          Finance (MRR, churn, lifetime value), Paid Ads (cost to win), Content (which posts worked)
//   Content & Social     → Paid Ads (organic winners worth boosting)
//   Product & Engineering → Content, Support (what shipped), from a private read-only adapter
//                          ($HQ_DATA/businesses/<slug>/engineering-connection.json; contract in docs/guides/playbooks.md)
// Market & Competitors and Support already write theirs (lib/competitor-tick.ts, lib/support.ts). Each signal's
// title carries the ISO week, so a rerun in the same week files nothing new. Server-only.
import fs from "node:fs";
import path from "node:path";

import { analyticsBoard, isoWeek, type BoardMetric } from "./analytics";
import { formatAnalytics, type AnalyticsId } from "./analytics-metrics";
import { signalFeed, writeNote } from "./brain-store";
import { weakestLever } from "./levers";
import { execAdapter, readConnection } from "./private-adapter";
import { scorecardState } from "./scorecard";
import { businessDir, getProfile, listPosts } from "./store";
import type { Node } from "./workflows";

export type Draft = { dept: Node; to: Node[]; title: string; body: string; evidence: string[] };
export type WriteOutcome = { title: string; to: Node[]; status: "written" | "exists" | "failed"; why?: string };

// ---------------------------------------------------------------- pure: drafts from readings

type Num = Pick<BoardMetric, "id" | "value" | "change" | "status"> & { def: Pick<BoardMetric["def"], "label" | "unit" | "better"> };

const line = (m: Num, currency: string) => {
  const v = formatAnalytics(m.def.unit, m.value, currency);
  if (m.change === null || m.change === 0) return `- ${m.def.label}: ${v}`;
  const worse = m.def.better === "up" ? m.change < 0 : m.change > 0;
  const delta = m.def.unit === "rate" ? `${m.change > 0 ? "+" : ""}${(m.change * 100).toFixed(1)} pts` : `${m.change > 0 ? "+" : ""}${formatAnalytics(m.def.unit, m.change, currency)}`;
  return `- ${m.def.label}: ${v} (${delta} on last week${worse ? ", the wrong way" : ""})`;
};

/** The numbers among `ids` that are measured, in that order. */
const pick = (metrics: Num[], ids: AnalyticsId[]) => ids.map((id) => metrics.find((m) => m.id === id)).filter((m): m is Num => Boolean(m && m.status === "measured" && m.value !== null));

export type DataInput = { week: string; currency: string; observedAt: string | null; metrics: Num[];
  weakest: { label: string; why: string; workflow: string } | null; missing: number };

/** Data & Analytics' weekly hand-offs. A signal is drafted only when it has at least one measured number. */
export function dataDrafts(x: DataInput): Draft[] {
  const ev = [`HQ analytics board${x.observedAt ? `, read ${x.observedAt.slice(0, 16).replace("T", " ")} UTC` : ""}`];
  const out: Draft[] = [];
  const add = (to: Node[], title: string, ids: AnalyticsId[], lead: string, tail = "") => {
    const ms = pick(x.metrics, ids);
    if (ms.length) out.push({ dept: "data", to, title: `${title} ${x.week}`, body: [lead, "", ...ms.map((m) => line(m, x.currency)), ...(tail ? ["", tail] : [])].join("\n"), evidence: ev });
  };
  add(["ceo"], "Weekly growth scorecard", ["new_signups", "new_paying", "new_mrr", "activation_rate", "paying_churn_rate", "set_to_cancel", "weekly_active_rate", "upgrades", "mrr", "paying_customers", "cost_to_win", "payback_months"],
    "The week's headline numbers, for the weekly review.",
    [x.weakest ? `Weakest lever: ${x.weakest.label}, ${x.weakest.why}. Its route is "${x.weakest.workflow}".` : "No lever is clearly weak this week.",
      x.missing ? `${x.missing} scorecard number${x.missing === 1 ? "" : "s"} can't be measured yet.` : ""].filter(Boolean).join(" "));
  add(["email"], "At-risk customers", ["at_risk_customers", "set_to_cancel", "paying_churn_rate", "weekly_active_rate", "helped_churn_gap"],
    "Who might leave. Use these to aim the churn and win-back flows at the right people.");
  add(["engineering"], "Funnel", ["new_signups", "activation_rate", "time_to_activation", "trial_to_paid_rate", "new_paying", "upgrade_prompt_rate"],
    "Where new people drop off between signing up and paying.");
  add(["finance"], "MRR, churn and lifetime value", ["mrr", "paying_customers", "arpu", "paying_churn_rate", "ltv", "nrr"],
    "Revenue from customers, and how long they stay.");
  add(["ads"], "Cost to win", ["cost_to_win", "payback_months", "ad_spend", "ltv_to_cac"],
    "What a new paying customer costs, and how fast they pay it back. Keep spend under the payback cap.");
  add(["content"], "Which posts worked", ["follows_per_post", "views_per_post", "link_clicks", "followers"],
    "How posts did this week. Sign-ups per post aren't tracked yet, so judge hooks by follows and link clicks.");
  return out;
}

export type PostReading = { id: string; at: string; type: string; views: number | null; follows?: number | null; url?: string; caption?: string };

/** Content's hand-off to Paid Ads: posts from the last 14 days with at least twice the account's usual views. */
export function contentDrafts(x: { week: string; posts: PostReading[]; viewsPerPost: number | null; handle: string; now: Date }): Draft[] {
  if (!x.viewsPerPost) return [];
  const cut = x.now.getTime() - 14 * 864e5;
  const winners = x.posts.filter((p) => Date.parse(p.at) >= cut && (p.views ?? 0) >= 2 * x.viewsPerPost!)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 5);
  if (!winners.length) return [];
  const row = (p: PostReading) => `- ${p.type.toLowerCase()} on ${p.at.slice(0, 10)}: ${p.views} views${p.follows ? `, ${p.follows} follows` : ""}${p.url ? ` (${p.url})` : ` (post ${p.id})`}${p.caption ? `. Opens: "${p.caption.split("\n")[0].slice(0, 90)}"` : ""}`;
  return [{
    dept: "content", to: ["ads"], title: `Organic winners worth boosting ${x.week}`,
    body: [`These posts on @${x.handle} beat the account's usual ${x.viewsPerPost} views per post by two times or more. They've proven themselves organically, so they're the creative to test with budget first.`, "", ...winners.map(row)].join("\n"),
    evidence: [`Instagram insights for @${x.handle}, read by HQ`],
  }];
}

export type Shipped = { title: string; url?: string; at: string; area?: string };

/** What a private engineering adapter may report. Anything else is refused. */
export function shippedProblem(v: unknown): string | null {
  if (!v || typeof v !== "object" || !Array.isArray((v as { shipped?: unknown }).shipped)) return "expected { shipped: [...] }";
  const xs = (v as { shipped: unknown[] }).shipped;
  if (xs.length > 200) return "more than 200 items";
  for (const x of xs) {
    const s = x as Shipped;
    if (!s || typeof s.title !== "string" || !s.title.trim() || s.title.length > 200 || typeof s.at !== "string" || Number.isNaN(Date.parse(s.at))) return "each item needs a title (≤200 chars) and an ISO time";
    if (s.url !== undefined && (typeof s.url !== "string" || !/^https:\/\//.test(s.url))) return "urls must be https";
    if (s.area !== undefined && (typeof s.area !== "string" || s.area.length > 40)) return "area must be a short string";
  }
  return null;
}

/** Product & Engineering's hand-offs: the week's shipped changes to Content (what to tell people) and Support (what changed). */
export function engineeringDrafts(x: { week: string; shipped: Shipped[] }): Draft[] {
  if (!x.shipped.length) return [];
  const byArea = new Map<string, Shipped[]>();
  for (const s of [...x.shipped].sort((a, b) => b.at.localeCompare(a.at))) byArea.set(s.area ?? "Product", [...(byArea.get(s.area ?? "Product") ?? []), s]);
  const list = [...byArea].flatMap(([area, xs]) => [`**${area}** (${xs.length})`, ...xs.slice(0, 15).map((s) => `- ${s.title}${s.url ? ` (${s.url})` : ""}`), ...(xs.length > 15 ? [`- …and ${xs.length - 15} more`] : []), ""]);
  return [{
    dept: "engineering", to: ["content", "support"], title: `What shipped ${x.week}`,
    body: [`${x.shipped.length} change${x.shipped.length === 1 ? "" : "s"} shipped this week. Content: pick what customers will notice and say why it matters. Support: these are the release notes behind any "what changed?" question.`, "", ...list].join("\n").trim(),
    evidence: ["Merged changes reported by the engineering adapter"],
  }];
}

// ---------------------------------------------------------------- server: gather, then file

const readJson = <T>(f: string): T | null => { try { return JSON.parse(fs.readFileSync(f, "utf8")) as T; } catch { return null; } };

async function shippedThisWeek(slug: string, now: Date): Promise<Shipped[] | null> {
  if (!fs.existsSync(path.join(businessDir(slug), "engineering-connection.json"))) return null;
  const c = readConnection(slug, "engineering-connection.json");
  const out = await execAdapter(c.command, { since: new Date(now.getTime() - 7 * 864e5).toISOString(), until: now.toISOString() }, 90000);
  const bad = shippedProblem(out);
  if (bad) throw Error(`engineering adapter: ${bad}`);
  return (out as { shipped: Shipped[] }).shipped;
}

/** Draft and file this week's automatic signals for one business. Never throws; each outcome says what happened. */
export async function writeWeeklySignals(slug: string, now = new Date(), o: { dryRun?: boolean } = {}): Promise<WriteOutcome[]> {
  const p = getProfile(slug);
  if (!p) return [{ title: "", to: [], status: "failed", why: "no such business" }];
  const week = isoWeek(now, p.timezone || "UTC");
  const drafts: Draft[] = [];
  const failed: WriteOutcome[] = [];

  try {
    const b = analyticsBoard(slug, now);
    let weakest: DataInput["weakest"] = null, missing = 0;
    try {
      const s = scorecardState(slug, now);
      const w = s.snapshot ? weakestLever(s.snapshot.weeks, s.snapshot.currency) : null;
      if (w) weakest = { label: w.label, why: w.why, workflow: w.workflow };
      missing = s.snapshot ? s.snapshot.weeks[0].metrics.filter((m) => m.quality === "missing").length : 0;
    } catch { /* no scorecard */ }
    drafts.push(...dataDrafts({ week, currency: p.currency, observedAt: b.observedAt, metrics: b.metrics, weakest, missing }));
  } catch (e) { failed.push({ title: `Data & Analytics signals ${week}`, to: [], status: "failed", why: (e as Error).message }); }

  const insights = readJson<{ handle: string; posts: PostReading[]; summary?: { viewsPerPost?: number | null } }>(path.join(businessDir(slug), "social", "insights.json"));
  if (insights?.posts?.length) {
    const byId = new Map(listPosts(slug, 200).filter((x) => x.postId).map((x) => [String(x.postId), x]));
    const posts = insights.posts.map((x) => ({ ...x, url: byId.get(x.id)?.url, caption: byId.get(x.id)?.caption }));
    drafts.push(...contentDrafts({ week, posts, viewsPerPost: insights.summary?.viewsPerPost ?? null, handle: insights.handle, now }));
  }

  try {
    const shipped = await shippedThisWeek(slug, now);
    if (shipped) drafts.push(...engineeringDrafts({ week, shipped }));
  } catch (e) { failed.push({ title: `What shipped ${week}`, to: ["content", "support"], status: "failed", why: (e as Error).message }); }

  const have = new Set(signalFeed(slug).map((s) => `${s.from}|${s.title}`));
  const out: WriteOutcome[] = [...failed];
  for (const d of drafts) {
    if (have.has(`${d.dept}|${d.title}`)) { out.push({ title: d.title, to: d.to, status: "exists" }); continue; }
    if (o.dryRun) { out.push({ title: d.title, to: d.to, status: "written", why: "dry run: not filed" }); continue; }
    try { writeNote("business", slug, { type: "signal", dept: d.dept, to: d.to, title: d.title, body: d.body, evidence: d.evidence }); out.push({ title: d.title, to: d.to, status: "written" }); }
    catch (e) { out.push({ title: d.title, to: d.to, status: "failed", why: (e as Error).message }); }
  }
  return out;
}
