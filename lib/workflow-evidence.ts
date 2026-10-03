// Which workflows actually run for a business, and the proof. Server-only: it reads the business's own
// records under $HQ_DATA (posts, Studio jobs, CEO reviews, plans, scorecard history, lifecycle). The rules
// are generic and every one needs a record on disk: a workflow nobody can prove runs stays unmarked.
// Titles must match lib/workflows.ts (tests/workflow-evidence.test.ts checks).

import fs from "node:fs";
import path from "node:path";

import { lifecycleState } from "./lifecycle";
import { scorecardState } from "./scorecard";
import { businessDir, getProfile, listReviews, type PublishedPost } from "./store";

export type Evidence = {
  /** live: the workflow runs end to end. partial: some steps run (named in proof), the rest are still to build. */
  state: "live" | "partial";
  proof: string[];
  /** ISO time of the latest record behind it. */
  last?: string;
};

export type EvidenceFacts = {
  demo: boolean;
  sites: string[];
  posts: PublishedPost[];
  studioJobs: { count: number; last?: string };
  reviews: { count: number; last?: string };
  plans: number;
  scorecardWeeks: string[];
  lifecycle: { connected: boolean; readOnly: boolean; observedAt: string | null; enabled: number; stages: number } | null;
};

/** "Comment REVIEW", "comment REVIEW": the keyword itself is in capitals, so "comment below" isn't one. */
const KEYWORD = /\b[Cc]omment ([A-Z][A-Z0-9]{2,})\b/;

const latest = (xs: (string | undefined)[]) => xs.filter((x): x is string => Boolean(x)).sort().at(-1);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const PLATFORM: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", x: "X", facebook: "Facebook", linkedin: "LinkedIn", pinterest: "Pinterest", threads: "Threads", discord: "Discord", telegram: "Telegram" };
const platformName = (p: string) => PLATFORM[p] ?? p;
const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };

/** Pure: the facts about one business → evidence per workflow title. Only titles with proof appear. */
export function evidenceFrom(f: EvidenceFacts): Record<string, Evidence> {
  const out: Record<string, Evidence> = {};
  const published = f.posts.filter((p) => p.status === "published" && (p.url || p.postId));
  const platforms = [...new Set(published.map((p) => p.platform))].sort().map(platformName);
  const lastPost = latest(published.map((p) => p.at));

  if (published.length) {
    const proof = [`${plural(published.length, "post")} published on ${list(platforms)}`];
    if (f.studioJobs.count) proof.push(`${plural(f.studioJobs.count, "video")} edited in HQ Studio`);
    out["Self post"] = { state: "live", proof, last: latest([lastPost, f.studioJobs.last]) };
  }

  const keyworded = published.filter((p) => KEYWORD.test(p.caption ?? ""));
  if (keyworded.length) {
    const words = [...new Set(keyworded.map((p) => (p.caption ?? "").match(KEYWORD)![1]))];
    const last = latest(keyworded.map((p) => p.at));
    out["Comment-keyword funnel"] = {
      state: "partial",
      proof: [`${plural(keyworded.length, "post")} ${keyworded.length === 1 ? "asks" : "ask"} for a comment keyword (${list(words)}) and the link goes out by DM`, "Email capture and the nurture emails aren't built yet"],
      last,
    };
    if (f.sites.length) {
      out["Free tool as a lead magnet"] = {
        state: "partial",
        proof: [`${words.length === 1 ? "A free tool behind the keyword" : `A free tool behind each of ${words.length} keywords`}, listed on ${host(f.sites[0])}`, "No \"email me the result\" offer yet"],
        last,
      };
    }
  }

  if (f.reviews.count) {
    const proof = [`${plural(f.reviews.count, "CEO review")} saved to the business's vault`];
    if (f.plans) proof.push(`${plural(f.plans, "department plan")}`);
    out["Knowledge base and decisions"] = { state: "live", proof, last: f.reviews.last };
  }

  if (f.scorecardWeeks.length) {
    const weeks = `${plural(f.scorecardWeeks.length, "week")} of scorecard history, latest ${f.scorecardWeeks.at(-1)}`;
    out["Weekly growth review"] = f.reviews.count
      ? { state: "live", proof: [weeks, `${plural(f.reviews.count, "CEO review")} pick the weakest lever`], last: f.reviews.last }
      : { state: "partial", proof: [weeks, "No CEO review has read it yet"] };
  }

  const lc = f.lifecycle;
  if (lc?.connected && lc.observedAt) {
    const watched = `${plural(lc.stages, "lifecycle stage")} tracked, last checked ${lc.observedAt.slice(0, 10)}`;
    const ev: Evidence = lc.readOnly || !lc.enabled
      ? { state: "partial", proof: [watched, "Read-only: HQ watches, nothing is sent from here"], last: lc.observedAt }
      : { state: "live", proof: [watched, `${plural(lc.enabled, "lifecycle message")} switched on`], last: lc.observedAt };
    out["Onboarding to first value"] = ev;
    out["Churn early warning"] = ev;
  }
  return out;
}

function readPosts(slug: string): PublishedPost[] {
  try {
    return fs.readFileSync(path.join(businessDir(slug), "published.jsonl"), "utf8").split("\n").filter(Boolean).flatMap((l) => {
      try { return [JSON.parse(l) as PublishedPost]; } catch { return []; }
    });
  } catch { return []; }
}

/** Studio jobs with at least one finished render (any mp4 other than the joined master). */
function studioJobs(slug: string): { count: number; last?: string } {
  const dir = path.join(businessDir(slug), "studio");
  let count = 0; let last: string | undefined;
  for (const job of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const jd = path.join(dir, job);
    try {
      const renders = fs.readdirSync(jd).filter((n) => n.endsWith(".mp4") && n !== "master.mp4");
      if (!renders.length) continue;
      count++;
      const t = new Date(Math.max(...renders.map((n) => fs.statSync(path.join(jd, n)).mtimeMs))).toISOString();
      if (!last || t > last) last = t;
    } catch { /* not a job folder */ }
  }
  return { count, last };
}

/** Department plans, one folder per department (store.savePlan). */
function plansCount(slug: string): number {
  const dir = path.join(businessDir(slug), "plans");
  try {
    return fs.readdirSync(dir).reduce((n, dept) => {
      try { return n + fs.readdirSync(path.join(dir, dept)).filter((f) => f.endsWith(".md")).length; } catch { return n; }
    }, 0);
  } catch { return 0; }
}

/** Read the business's records and return the evidence. Unknown business → no evidence. */
export function workflowEvidence(slug: string): { demo: boolean; evidence: Record<string, Evidence> } {
  const profile = getProfile(slug);
  if (!profile) return { demo: false, evidence: {} };
  const reviews = listReviews(slug);
  let scorecardWeeks: string[] = [];
  try {
    const s = scorecardState(slug);
    if (s.connected) scorecardWeeks = s.history.map((h) => h.week);
  } catch { /* no scorecard */ }
  let lifecycle: EvidenceFacts["lifecycle"] = null;
  try {
    const l = lifecycleState(slug);
    if (l.connected && l.snapshot) {
      lifecycle = {
        connected: true, readOnly: l.readOnly, observedAt: l.snapshot.observedAt,
        enabled: l.snapshot.workflows.filter((w) => w.enabled).length, stages: l.snapshot.stages.length,
      };
    }
  } catch { /* no lifecycle */ }
  const facts: EvidenceFacts = {
    demo: Boolean(profile.demo),
    sites: profile.sites ?? [],
    posts: readPosts(slug),
    studioJobs: studioJobs(slug),
    reviews: { count: reviews.length, last: reviews[0]?.at },
    plans: plansCount(slug),
    scorecardWeeks,
    lifecycle,
  };
  return { demo: facts.demo, evidence: evidenceFrom(facts) };
}
