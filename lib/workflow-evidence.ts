// Which workflows actually run for a business, and the proof. Server-only: it reads the business's own
// records under $HQ_DATA (posts, Studio jobs, CEO reviews, plans, scorecard history, lifecycle). The rules
// are generic and every one needs a record on disk: a workflow nobody can prove runs stays unmarked.
// Titles must match lib/workflows.ts (tests/workflow-evidence.test.ts checks).

import fs from "node:fs";
import path from "node:path";

import { listDrafts as listBlogDrafts } from "./blog-store";
import { listSocial } from "./social-store";
import { campaignReports } from "./campaign-report";
import { listPartners } from "./partner-store";
import { isAppearance } from "./partners";

import { lifecycleState } from "./lifecycle";
import { OPS_REVIEW_DAYS, opsRecords, type OpsDoc } from "./ops-records";
import { workflowChecksState, type WorkflowCheck } from "./workflow-checks";
import { scorecardState } from "./scorecard";
import { businessDir, getProfile, listReviews, type PublishedPost } from "./store";
import { addMonths, monthName } from "./unit-economics";
import { unitEvidenceFacts } from "./unit-economics-store";
import { loadEvidence, type LoadRun, type LoadTestConfig } from "./load-test";
import { listLoadRuns, readLoadConfig } from "./load-test-store";

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
  lifecycle: {
    connected: boolean; readOnly: boolean; observedAt: string | null; enabled: number; stages: number;
    /** Per automated message: which workflow it serves and what it actually delivered. */
    workflows?: { label: string; enabled: boolean; serves?: string; sent30d?: number; lastSentAt?: string | null; drafts?: number }[];
  } | null;
  /** The weekly social plan (lib/social-store.ts): posts out, and drafts written. */
  social?: { posted: number; lastPosted?: string; drafts: number; lastDraft?: string } | null;
  /** The daily blog (lib/blog-store.ts): posts read back live, and drafts written. */
  blog?: { published: number; lastPublished?: string; drafts: number; lastDraft?: string } | null;
  /** Campaigns (lib/campaigns.ts): status, and how many linked items went out (posts posted, blog posts live,
   *  read-back posts, emails delivered). */
  campaigns?: { name: string; status: string; out: number; updatedAt?: string }[] | null;
  /** Unit economics (lib/unit-economics.ts): closed months with both income and costs, the newest month with costs,
   *  the current month, and when HQ last worked the numbers out (analytics refresh) or saved the monthly brief. */
  unitEconomics?: { bothMonths: number; latest: string | null; thisMonth: string; computedAt: string | null; briefAt: string | null } | null;
  /** Partners (lib/partners.ts): each one's status, whether its links carry a tracking tag, and whether it's a podcast
   *  appearance. Counts only reach the proof text, never names. */
  partners?: { status: string; tagged: boolean; appearance: boolean; updatedAt?: string }[] | null;
  /** Operations' records in the vault (lib/ops-records.ts): runbooks, and the newest vendor review and risk register
   *  saved within the last 90 days (ISO times, null when none is current). */
  ops?: { runbooks: number; lastRunbook?: string; vendorReview: OpsDoc | null; riskRegister: OpsDoc | null } | null;
  /** Load tests (lib/load-test.ts): the business's target and cadence, and every recorded run, judged at `now`. */
  loadTest?: { config: LoadTestConfig; runs: LoadRun[]; now: string } | null;
  /** Pass/fail checks from the business's workflow-checks adapter (lib/workflow-checks.ts). */
  checks?: { observedAt: string; stale: boolean; workflows: { title: string; checks: WorkflowCheck[] }[] } | null;
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
    const declared = (lc.workflows ?? []).filter((w) => w.serves);
    // A message is proof only once it has really been delivered: switched on, drafted or tested isn't running.
    for (const title of new Set(declared.map((w) => w.serves!))) {
      const mine = declared.filter((w) => w.serves === title);
      const sent = mine.reduce((n, w) => n + (w.sent30d ?? 0), 0);
      const drafts = mine.reduce((n, w) => n + (w.drafts ?? 0), 0);
      const names = list(mine.map((w) => w.label));
      if (sent) {
        const proof = [`${plural(sent, "message")} delivered in the last 30 days by ${list(mine.filter((w) => (w.sent30d ?? 0) > 0).map((w) => w.label))}`, watched];
        if (drafts) proof.push(`${plural(drafts, "draft")} waiting for the owner's yes`);
        out[title] = { state: "live", proof, last: latest(mine.map((w) => w.lastSentAt ?? undefined)) ?? lc.observedAt };
      } else {
        const proof = [`Built: ${names}`, drafts ? `${plural(drafts, "draft")} waiting for the owner's yes; nothing delivered yet` : mine.some((w) => w.enabled) ? "Switched on; nothing delivered in the last 30 days" : "Not switched on yet"];
        out[title] = { state: "partial", proof, last: lc.observedAt };
      }
    }
    // Lifecycle data with no per-message delivery record is watching, not running.
    const why = lc.readOnly ? "Read-only: HQ watches, nothing is sent from here"
      : declared.length ? "Watched only: no message serves this workflow yet" : "No delivery record per workflow yet";
    const watchOnly: Evidence = { state: "partial", proof: [watched, why], last: lc.observedAt };
    for (const title of ["Onboarding to first value", "Churn early warning"]) out[title] ??= watchOnly;
  }

  const so = f.social;
  if (so?.posted) out["Weekly social plan from the channel plan"] = { state: "live", proof: [`${plural(so.posted, "planned post")} out, each with its link`], last: so.lastPosted };
  else if (so?.drafts) out["Weekly social plan from the channel plan"] = { state: "partial", proof: [`${plural(so.drafts, "post")} drafted from the channel plan`, "None has gone out yet"], last: so.lastDraft };

  const b = f.blog;
  if (b?.published) {
    out["Daily blog from search demand"] = { state: "live", proof: [`${plural(b.published, "post")} researched, checked and read back live`], last: b.lastPublished };
  } else if (b?.drafts) {
    out["Daily blog from search demand"] = { state: "partial", proof: [`${plural(b.drafts, "draft")} researched and written`, "None has gone live yet"], last: b.lastDraft };
  }

  const cs = f.campaigns ?? [];
  const running = cs.filter((c) => c.status === "live" && c.out > 0);
  const CAMPAIGN = "Campaign from brief to results";
  if (running.length) {
    const items = running.reduce((n, c) => n + c.out, 0);
    const proof = [`${plural(running.length, "campaign")} live with work out: ${list(running.map((c) => c.name))}`, `${plural(items, "linked item")} out (posts, blog posts, emails)`];
    const waiting = cs.filter((c) => c.status === "planned" || (c.status === "live" && !c.out)).length;
    if (waiting) proof.push(`${plural(waiting, "more campaign")} planned or waiting on its first item`);
    out[CAMPAIGN] = { state: "live", proof, last: latest(running.map((c) => c.updatedAt)) };
  } else if (cs.some((c) => ["live", "planned", "paused"].includes(c.status))) {
    const live = cs.filter((c) => c.status === "live"), planned = cs.filter((c) => c.status === "planned");
    out[CAMPAIGN] = { state: "partial", proof: [
      live.length ? `${plural(live.length, "campaign")} live: ${list(live.map((c) => c.name))}` : `${plural(planned.length, "campaign")} planned: ${list(planned.map((c) => c.name))}`,
      "Nothing linked to a live campaign has gone out yet",
    ], last: latest(cs.map((c) => c.updatedAt)) };
  }

  // Partners: live once a partner is live with a tracking tag (its sign-ups can be counted); in part while partners are
  // being found, screened or talked to. Podcast appearances are the same rule over podcast partners.
  const ps = f.partners ?? [];
  const STAGE_WORDS: [string, string, string][] = [["prospect", "prospect", "prospects"], ["shortlisted", "shortlisted", "shortlisted"], ["contacted", "contacted", "contacted"], ["replied", "replied", "replied"], ["negotiating", "negotiating", "negotiating"], ["live", "live without a tag", "live without a tag"], ["paused", "paused", "paused"]];
  const partnerEvidence = (title: string, xs: typeof ps, what: string) => {
    const tagged = xs.filter((p) => p.status === "live" && p.tagged);
    const open = xs.filter((p) => !["declined", "ended"].includes(p.status) && !(p.status === "live" && p.tagged));
    const stages = STAGE_WORDS.map(([s, one, many]) => { const n = open.filter((p) => p.status === s).length; return n ? `${n} ${n === 1 ? one : many}` : ""; }).filter(Boolean);
    const last = latest(xs.map((p) => p.updatedAt));
    if (tagged.length) {
      const proof = [`${plural(tagged.length, what)} live with a tracking tag on ${tagged.length === 1 ? "its" : "their"} links`];
      if (stages.length) proof.push(`More in the pipeline: ${list(stages)}`);
      out[title] = { state: "live", proof, last };
    } else if (open.length) {
      out[title] = { state: "partial", proof: [`${plural(open.length, what)} in the pipeline: ${list(stages)}`, `No ${what} is live with a tracking tag yet`], last };
    }
  };
  partnerEvidence("Partner program", ps, "partner");
  partnerEvidence("Podcast and creator appearances", ps.filter((p) => p.appearance), "podcast");

  // Unit economics: live with 3 or more months of income and costs, costs no older than the month before last, and the
  // numbers worked out this month (the daily analytics refresh, or a saved brief).
  const ue = f.unitEconomics;
  if (ue) {
    const UE = "Unit economics check";
    const thisMonth = (t: string | null) => Boolean(t && t.slice(0, 7) === ue.thisMonth);
    const ran = [ue.computedAt, ue.briefAt].filter(thisMonth).sort().at(-1);
    const fresh = Boolean(ue.latest && ue.latest >= addMonths(ue.thisMonth, -2));
    const have = [
      ue.bothMonths ? `${plural(ue.bothMonths, "month")} of income and costs in the ledger${ue.latest ? `, costs to ${monthName(ue.latest)}` : ""}` : "",
      thisMonth(ue.computedAt) ? `Numbers worked out ${ue.computedAt!.slice(0, 10)} by the analytics refresh` : "",
      thisMonth(ue.briefAt) ? `Monthly brief saved ${ue.briefAt!.slice(0, 10)}` : "",
    ].filter(Boolean);
    if (ue.bothMonths >= 3 && fresh && ran) out[UE] = { state: "live", proof: have, last: ran };
    else {
      const not = [
        ue.bothMonths < 3 ? `Not yet: ${3 - ue.bothMonths} more ${ue.bothMonths === 2 ? "month" : "months"} with both income and costs (needs 3)` : "",
        !fresh ? `Not yet: costs stop at ${ue.latest ? monthName(ue.latest) : "no closed month"}; import last month's` : "",
        !ran ? "Not yet: not worked out this month (npm run hq -- analytics refresh, or finance unit-economics --save)" : "",
      ].filter(Boolean);
      out[UE] = { state: "partial", proof: [...have, ...not], last: latest([ue.computedAt ?? undefined, ue.briefAt ?? undefined]) };
    }
  }

  // Runbooks, vendors and risks: live with at least one runbook in the vault plus a vendor review and a risk register
  // saved in the last 90 days; in part while any of the three is missing or out of date.
  const ops = f.ops;
  if (ops && (ops.runbooks || ops.vendorReview || ops.riskRegister)) {
    const have = [
      ops.runbooks ? `${plural(ops.runbooks, "runbook")} in the business's vault` : "",
      ops.vendorReview ? `Vendor review saved ${ops.vendorReview.day}` : "",
      ops.riskRegister ? `Risk register saved ${ops.riskRegister.day}` : "",
    ].filter(Boolean);
    const not = [
      ops.runbooks ? "" : "Not yet: no runbook (a playbook titled \"Runbook: ...\") in the vault",
      ops.vendorReview ? "" : `Not yet: no vendor review in the last ${OPS_REVIEW_DAYS} days`,
      ops.riskRegister ? "" : `Not yet: no risk register in the last ${OPS_REVIEW_DAYS} days`,
    ].filter(Boolean);
    out["Runbooks, vendors and risks"] = {
      state: not.length ? "partial" : "live",
      proof: [...have, ...not],
      last: latest([ops.lastRunbook, ops.vendorReview?.at, ops.riskRegister?.at]),
    };
  }

  // Load tests: live when the newest recorded run meets the target and is within the cadence.
  if (f.loadTest) out["Load test before growth"] = loadEvidence(f.loadTest.config, f.loadTest.runs, new Date(f.loadTest.now));

  // Checks prove workflows that send nothing (pages, measurement). Live only when every check passed recently.
  const ck = f.checks;
  if (ck) {
    for (const w of ck.workflows) {
      if (out[w.title]?.state === "live") continue;
      const failed = w.checks.filter((c) => !c.ok);
      const line = (c: WorkflowCheck) => (c.detail ? `${c.label}: ${c.detail}` : c.label);
      out[w.title] = ck.stale
        ? { state: "partial", proof: [...w.checks.filter((c) => c.ok).map(line), `Checks last ran ${ck.observedAt.slice(0, 10)}, over 8 days ago`], last: ck.observedAt }
        : failed.length
          ? { state: "partial", proof: [...w.checks.filter((c) => c.ok).map(line), ...failed.map((c) => `Not yet: ${line(c)}`)], last: ck.observedAt }
          : { state: "live", proof: w.checks.map(line), last: ck.observedAt };
    }
  }
  return out;
}

function campaignFacts(slug: string): EvidenceFacts["campaigns"] {
  try {
    const rs = campaignReports(slug, { readings: false });
    return rs.length ? rs.map((r) => ({ name: r.campaign.name, status: r.campaign.status, out: r.out, updatedAt: r.campaign.updatedAt })) : null;
  } catch { return null; }
}

function partnerFacts(slug: string): EvidenceFacts["partners"] {
  try {
    const ps = listPartners(slug);
    return ps.length ? ps.map((p) => ({ status: p.status, tagged: Boolean(p.tracking.tag), appearance: isAppearance(p), updatedAt: p.updatedAt })) : null;
  } catch { return null; }
}

function readPosts(slug: string): PublishedPost[] {
  try {
    return fs.readFileSync(path.join(businessDir(slug), "published.jsonl"), "utf8").split("\n").filter(Boolean).flatMap((l) => {
      try { return [JSON.parse(l) as PublishedPost]; } catch { return []; }
    });
  } catch { return []; }
}

function socialFacts(slug: string): EvidenceFacts["social"] {
  try {
    const all = listSocial(slug, 26);
    if (!all.length) return null;
    const out = all.filter((d) => d.status === "posted");
    return { posted: out.length, lastPosted: out.map((d) => d.postedAt).filter(Boolean).sort().at(-1), drafts: all.length, lastDraft: all.map((d) => d.day).sort().at(-1) };
  } catch { return null; }
}

function blogFacts(slug: string): EvidenceFacts["blog"] {
  try {
    const all = listBlogDrafts(slug);
    if (!all.length) return null;
    const pub = all.filter((d) => d.meta.status === "published");
    return { published: pub.length, lastPublished: pub.map((d) => d.meta.publishedAt).filter(Boolean).sort().at(-1), drafts: all.length, lastDraft: all.map((d) => d.meta.date).sort().at(-1) };
  } catch { return null; }
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
export function workflowEvidence(slug: string, now: Date = new Date()): { demo: boolean; evidence: Record<string, Evidence> } {
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
        workflows: l.snapshot.workflows.map(({ label, enabled, serves, sent30d, lastSentAt, drafts }) => ({ label, enabled, serves, sent30d, lastSentAt, drafts })),
      };
    }
  } catch { /* no lifecycle */ }
  let checks: EvidenceFacts["checks"] = null;
  try {
    const c = workflowChecksState(slug);
    if (c.snapshot) checks = { observedAt: c.snapshot.observedAt, stale: c.stale, workflows: c.snapshot.workflows };
  } catch { /* no checks */ }
  const facts: EvidenceFacts = {
    demo: Boolean(profile.demo),
    sites: profile.sites ?? [],
    posts: readPosts(slug),
    studioJobs: studioJobs(slug),
    reviews: { count: reviews.length, last: reviews[0]?.at },
    plans: plansCount(slug),
    scorecardWeeks,
    lifecycle,
    checks,
    blog: blogFacts(slug),
    social: socialFacts(slug),
    campaigns: campaignFacts(slug),
    partners: partnerFacts(slug),
    unitEconomics: (() => { try { return unitEvidenceFacts(slug, now); } catch { return null; } })(),
    ops: (() => { try { return opsRecords(slug, now); } catch { return null; } })(),
    loadTest: (() => { try { const config = readLoadConfig(slug); return config ? { config, runs: listLoadRuns(slug), now: now.toISOString() } : null; } catch { return null; } })(),
  };
  return { demo: facts.demo, evidence: evidenceFrom(facts) };
}
