import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  campaignId, campaignProblems, campaignReport, measuredNumbers, newCampaign, outcomeRows,
  type Campaign, type CampaignFacts, type CampaignInput,
} from "../lib/campaigns";
import { addCampaign, addCampaignResult, getCampaign, linkCampaign, listCampaigns, liveCampaignBriefs, noteCampaign, readCampaigns, setCampaignStatus, unlinkCampaign } from "../lib/campaign-store";
import { campaignSpend } from "../lib/ledger-spend";
import { linkHasTag, socialLinkParams, tagLink, tagMatches } from "../lib/utm";
import { analyticsProblem, hqMetrics, rebuildAnalytics, type AnalyticsSnapshot } from "../lib/analytics";
import { checkSocial, type SocialDraft } from "../lib/social";
import { evidenceFrom, type EvidenceFacts } from "../lib/workflow-evidence";
import { WORKFLOWS } from "../lib/workflows";
import { ANALYTICS, WORKFLOW_ANALYTICS } from "../lib/analytics-metrics";
import { profile, tempData } from "./helpers";

const brief = (over: Partial<CampaignInput> = {}): CampaignInput => ({
  name: "Cold brew month", goal: "Win 60 new subscribers from home cold brew drinkers", lever: "get",
  audience: "Home coffee drinkers who make cold brew", offer: "Free cold brew guide, then half price on the first box",
  channels: ["instagram", "pinterest", "blog"], start: "2026-11-02", end: "2026-11-29", metric: "new_signups", target: 60,
  utm: "cold-brew", ...over,
});
const NOW = new Date("2026-11-09T00:00:00Z");

function setup() {
  const dir = tempData();
  const p = profile({ slug: "demo-coffee", name: "Demo Coffee", currency: "AUD" });
  fs.mkdirSync(path.join(dir, "businesses", p.slug), { recursive: true });
  fs.writeFileSync(path.join(dir, "businesses", p.slug, "profile.json"), JSON.stringify(p));
  return { dir, p };
}

const facts = (over: Partial<CampaignFacts> = {}): CampaignFacts => ({
  now: NOW.getTime(), currency: "AUD", social: [], blog: [], readBack: {}, lifecycle: null, experiments: [], ledger: null,
  analytics: { connected: false, observedAt: null, campaigns: null }, readings: {}, vaultNotes: [], ...over,
});

// ---------------------------------------------------------------- the model

test("a campaign's id is its name in kebab case plus the start date, and the tag defaults from the name", () => {
  assert.equal(campaignId("Cold brew month!", "2026-11-02"), "cold-brew-month-2026-11-02");
  const c = newCampaign(brief({ utm: undefined }), NOW);
  assert.equal(c.id, "cold-brew-month-2026-11-02");
  assert.equal(c.utm, "cold-brew-month");
  assert.equal(c.status, "planned");
  assert.equal(c.owner, "ads");
  assert.equal(newCampaign(brief({ lever: "keep", name: "Quiet member check-ins" }), NOW).owner, "email");
  assert.deepEqual(campaignProblems(c), []);
});

test("the validator names every problem and how to fix it", () => {
  const bad = () => newCampaign(brief({ name: "Cold brew — month", channels: ["instagram", "fax" as never], metric: "nope" as never, end: "2026-10-01", utm: "Cold Brew" }), NOW);
  assert.throws(bad, (e: Error) => {
    for (const re of [/name has an em or en dash/, /unknown channel "fax"/, /metric must be an analytics id/, /end must be a date .* on or after start/, /utm must be lowercase/]) assert.match(e.message, re);
    return true;
  });
  assert.throws(() => newCampaign(brief({ audience: "Members like jo@example.com" }), NOW), /personal data/);
  assert.throws(() => newCampaign(brief({ goal: "Two\nlines" }), NOW), /goal must be one line/);
  assert.throws(() => newCampaign(brief({ lever: "base" as never }), NOW), /lever must be get, keep or expand/);
  assert.throws(() => newCampaign(brief({ links: [{ kind: "post", ref: "not a link" }] }), NOW), /https link/);
  assert.throws(() => newCampaign(brief({ start: "2026-02-30" }), NOW), /start must be a date/);
  assert.throws(() => newCampaign(brief({ budget: -5 }), NOW), /budget/);
  assert.doesNotThrow(() => newCampaign(brief({ utm: "series-*" }), NOW));
});

// ---------------------------------------------------------------- tags

test("tags match exactly, or by prefix for series-style tags, in utm_campaign or utm_source", () => {
  assert.ok(tagMatches("cold-brew", "cold-brew"));
  assert.ok(!tagMatches("cold-brew-2", "cold-brew"));
  assert.ok(tagMatches("series-ig", "series-*"));
  assert.ok(linkHasTag("https://coffee.example/guide/?utm_source=instagram&utm_medium=social&utm_campaign=cold-brew", "cold-brew"));
  assert.ok(linkHasTag("https://coffee.example/?utm_source=series-x", "series-*"));
  assert.ok(!linkHasTag("https://coffee.example/", "cold-brew"));
  assert.ok(!linkHasTag("not a url", "cold-brew"));
  assert.equal(socialLinkParams("cold-brew", "pinterest"), "utm_source=pinterest&utm_medium=social&utm_campaign=cold-brew");
  assert.equal(socialLinkParams("series-*", "instagram"), "utm_source=series-ig&utm_medium=social");
  assert.equal(tagLink("https://coffee.example/guide/?utm_source=old&ref=1", "cold-brew", "x"), "https://coffee.example/guide/?ref=1&utm_source=x&utm_medium=social&utm_campaign=cold-brew");
});

// ---------------------------------------------------------------- spend

test("campaign spend comes from tagged transactions, tagged postings or a campaign sub-account, and nothing else", () => {
  const ledger = [
    "2026-11-03 * \"Meta\" \"Boost\"",
    "  campaign: \"cold-brew-month-2026-11-02\"",
    "  Expenses:Advertising        120.00 AUD",
    "  Assets:Bank                -120.00 AUD",
    "",
    "2026-11-04 * \"Split\"",
    "  Expenses:Advertising         40.00 AUD",
    "    campaign: \"cold-brew-month-2026-11-02\"",
    "  Expenses:Advertising         99.00 AUD",
    "  Assets:Bank                -139.00 AUD",
    "",
    "2026-11-05 * \"Pins\"",
    "  Expenses:Advertising:Cold-Brew-Month   25.50 AUD",
    "  Assets:Bank",
    "",
    "2026-11-06 * \"Other campaign\"",
    "  campaign: \"tea-week-2026-11-01\"",
    "  Expenses:Advertising         70.00 AUD",
    "  Assets:Bank",
    "",
    "2026-11-07 * \"Tagged but not spend\"",
    "  campaign: \"cold-brew-month-2026-11-02\"",
    "  Expenses:Software            10.00 AUD",
    "  Assets:Bank",
  ].join("\n");
  assert.deepEqual(campaignSpend(ledger, "AUD", "cold-brew-month-2026-11-02"), { total: 185.5, postings: 3 });
  assert.deepEqual(campaignSpend(ledger, "AUD", "tea-week-2026-11-01"), { total: 70, postings: 1 });
  assert.deepEqual(campaignSpend(ledger, "AUD", "nothing-2026-01-01"), { total: 0, postings: 0 });
});

// ---------------------------------------------------------------- performance

test("with nothing connected, every outcome says what it needs and nothing reads zero", () => {
  const c = newCampaign(brief(), NOW);
  const r = campaignReport(c, facts());
  assert.equal(r.out, 0);
  for (const m of [r.spend, r.visits, r.signups, r.paying, r.revenue, r.costPerSignup, r.costPerPaying, r.roi]) assert.equal(m.value, null);
  assert.equal(r.primary.value, null);
  assert.match(r.spend.note, /No ledger/);
  assert.match(r.signups.note, /No analytics adapter connected/);
  assert.ok(r.missing.some((m) => m.startsWith(`${ANALYTICS.new_signups.label} (the campaign's number)`)), r.missing.join("\n"));
  assert.ok(r.missing.some((m) => /^Visits, sign-ups, paying customers and revenue by campaign: No analytics adapter/.test(m)));
  assert.deepEqual(measuredNumbers(r), [{ label: "Items out", value: 0 }]);
});

test("items out count only what really went out, and drafts join by tag, campaign field or link", () => {
  const c = newCampaign(brief({ links: [{ kind: "social", ref: "2026-11-03-x-1" }, { kind: "blog", ref: "cold-brew-ratio" }, { kind: "post", ref: "https://www.instagram.com/p/AAA/" }, { kind: "post", ref: "https://www.instagram.com/p/BBB/" }, { kind: "email", ref: "welcome" }, { kind: "experiment", ref: "4" }, { kind: "note", ref: "Decisions/Cold brew month.md" }] }), NOW);
  const r = campaignReport(c, facts({
    social: [
      { id: "2026-11-03-instagram-1", network: "instagram", format: "carousel", day: "2026-11-03", status: "posted", url: "https://www.instagram.com/p/X/", campaign: c.id },
      { id: "2026-11-03-pinterest-1", network: "pinterest", format: "pin", day: "2026-11-03", status: "approved", link: "https://coffee.example/guide/?utm_source=pinterest&utm_medium=social&utm_campaign=cold-brew" },
      { id: "2026-11-03-x-1", network: "x", format: "post", day: "2026-11-03", status: "draft" },
      { id: "2026-11-04-x-1", network: "x", format: "post", day: "2026-11-04", status: "posted", url: "https://x.com/s/1" },
    ],
    blog: [{ slug: "cold-brew-ratio", title: "Cold brew ratio", status: "published", url: "https://coffee.example/blog/cold-brew-ratio/", date: "2026-11-03" }],
    readBack: { "https://www.instagram.com/p/AAA/": { platform: "instagram", at: "2026-11-04T00:00:00Z" } },
    lifecycle: { observedAt: "2026-11-08T00:00:00Z", workflows: [], flows: [{ id: "welcome", label: "Welcome guide", messages: ["welcome-1"], outcomes: [{ label: "Subscribed", window: "14 days", emailed: { n: 40, hit: 6 } }], daily: [{ day: "2026-11-01", sent: 9 }, { day: "2026-11-03", sent: 12 }, { day: "2026-11-05", sent: 8 }] }] },
    experiments: [{ id: 4, hypothesis: "Half price beats a free guide", metric: "new_signups", status: "running", baseline: null, result: null, startedAt: "2026-11-02T00:00:00Z" }],
    vaultNotes: ["Decisions/Cold brew month.md"],
  }));
  assert.deepEqual(r.social.map((s) => s.id), ["2026-11-03-instagram-1", "2026-11-03-pinterest-1", "2026-11-03-x-1"]);
  assert.equal(r.emails[0].sent, 20, "sends before the start don't count");
  assert.equal(r.emails[0].outcomes[0], "Subscribed (14 days): 6 of 40");
  assert.deepEqual(r.posts.map((p) => p.readBack), [true, false]);
  assert.equal(r.experiments[0].hypothesis, "Half price beats a free guide");
  assert.equal(r.notes[0].found, true);
  assert.equal(r.out, 4, "1 posted social post + 1 live blog post + 1 read-back post + 1 email flow that delivered");
});

test("adapter rows by tag give sign-ups, cost per sign-up, cost per paying customer, return and progress", () => {
  const c = newCampaign(brief(), NOW);
  const ledger = `2026-11-03 * "Boost"\n  campaign: "${c.id}"\n  Expenses:Advertising  300.00 AUD\n  Assets:Bank\n`;
  const r = campaignReport(c, facts({ ledger, analytics: { connected: true, observedAt: "2026-11-08T00:00:00Z", campaigns: [{ utm: "cold-brew", visits: 900, signups: 30, paying: 12, revenue: 480, period: "since 2026-11-02" }, { utm: "tea-week", signups: 4 }] } }));
  assert.equal(r.spend.value, 300);
  assert.equal(r.signups.value, 30);
  assert.equal(r.costPerSignup.value, 10);
  assert.equal(r.costPerPaying.value, 25);
  assert.equal(r.roi.value, 0.6);
  assert.equal(r.primary.scope, "campaign");
  assert.equal(r.primary.value, 30);
  assert.equal(r.primary.progress, 0.5);
  assert.equal(r.primary.met, false);
  assert.deepEqual(r.missing, []);
  assert.ok(measuredNumbers(r).some((n) => n.label === "Cost per sign-up" && n.value === 10));
});

test("a prefix tag sums every tag under it; a field nobody reports stays missing", () => {
  const c = newCampaign(brief({ utm: "series-*", name: "Series sign-ups" }), NOW);
  const rows = [{ utm: "series-ig", signups: 5 }, { utm: "series-x", signups: 2, visits: 40 }, { utm: "other", signups: 9 }];
  assert.equal(outcomeRows(c, rows).length, 2);
  const r = campaignReport(c, facts({ analytics: { connected: true, observedAt: null, campaigns: rows } }));
  assert.equal(r.signups.value, 7);
  assert.equal(r.visits.value, 40);
  assert.equal(r.paying.value, null);
  assert.match(r.paying.note, /has no paying customers/);
  assert.match(r.costPerSignup.note, /spend tagged in the ledger/);
});

test("an adapter that reports no campaigns is told so; numbers a tag can't split are business-wide and labelled", () => {
  const c = newCampaign(brief({ lever: "keep", metric: "paying_churn_rate", target: 0.06, name: "Quiet member check-ins" }), NOW);
  const r = campaignReport(c, facts({ analytics: { connected: true, observedAt: null, campaigns: null }, readings: { paying_churn_rate: { value: 0.089, status: "measured", note: "Paying members who stopped, last 4 weeks" } } }));
  assert.equal(r.primary.scope, "business");
  assert.equal(r.primary.value, 0.089);
  assert.equal(r.primary.met, false);
  assert.equal(r.primary.progress, null, "lower is better: no share-of-target bar");
  assert.match(r.primary.note, /Business-wide/);
  assert.match(r.signups.note, /doesn't report campaigns yet/);
  const s = campaignReport(newCampaign(brief(), NOW), facts({ analytics: { connected: true, observedAt: null, campaigns: null }, readings: { new_signups: { value: 93, status: "measured", note: "Last 4 weeks" } } }));
  assert.equal(s.primary.value, null, "a splittable number is never filled from the business-wide one");
  assert.match(s.primary.note, /Business-wide, all sources: 93/);
});

// ---------------------------------------------------------------- the store

test("campaigns are stored per business, owner-only, validated on every write and mirrored to the vault", () => {
  const { dir } = setup();
  const c = addCampaign("demo-coffee", brief(), NOW);
  const file = path.join(dir, "businesses", "demo-coffee", "campaigns", `${c.id}.json`);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.throws(() => addCampaign("demo-coffee", brief(), NOW), /already exists/);
  assert.throws(() => addCampaign("nobody", brief(), NOW), /no such business/);

  assert.equal(getCampaign("demo-coffee", "cold-brew").id, c.id, "a unique prefix is enough");
  assert.throws(() => getCampaign("demo-coffee", "../profile"), /no campaign/);
  setCampaignStatus("demo-coffee", c.id, "live", NOW);
  linkCampaign("demo-coffee", c.id, "experiment", "4", NOW);
  linkCampaign("demo-coffee", c.id, "experiment", "4", NOW);
  assert.equal(getCampaign("demo-coffee", c.id).links.length, 1, "linking twice is a no-op");
  assert.throws(() => linkCampaign("demo-coffee", c.id, "post", "http://insecure.example/p", NOW), /https link/);
  unlinkCampaign("demo-coffee", c.id, "experiment", "4", NOW);
  assert.throws(() => unlinkCampaign("demo-coffee", c.id, "experiment", "4", NOW), /isn't linked/);
  noteCampaign("demo-coffee", c.id, "Pins brought most clicks", { learning: true }, NOW);
  assert.throws(() => noteCampaign("demo-coffee", c.id, "Pins – most clicks", {}, NOW), /dash/);
  addCampaignResult("demo-coffee", c.id, { text: "Week one: 4 items out", numbers: [{ label: "Items out", value: 4 }] }, NOW);
  const done = setCampaignStatus("demo-coffee", c.id, "done", NOW);
  assert.equal(done.end, "2026-11-29", "an end date already set is kept");

  const saved = getCampaign("demo-coffee", c.id);
  assert.equal(saved.status, "done");
  assert.equal(saved.results.length, 1);
  assert.equal(saved.notes[0].learning, true);
  const md = fs.readFileSync(path.join(dir, "businesses", "demo-coffee", "vault", "Departments", "Paid Ads & Growth", "Campaigns.md"), "utf8");
  assert.match(md, /Cold brew month \| Done/);
  assert.match(md, /## Learnings[\s\S]*Pins brought most clicks/);

  fs.writeFileSync(path.join(dir, "businesses", "demo-coffee", "campaigns", "broken.json"), "{\"name\":\"x\"}");
  const { campaigns, invalid } = readCampaigns("demo-coffee");
  assert.equal(campaigns.length, 1);
  assert.equal(invalid[0].file, "broken.json");
});

test("the writers see live campaigns only, with each network's link parameters", () => {
  setup();
  const live = addCampaign("demo-coffee", brief(), NOW);
  setCampaignStatus("demo-coffee", live.id, "live", NOW);
  addCampaign("demo-coffee", brief({ name: "Tea week", utm: "tea-week" }), NOW);
  const social = liveCampaignBriefs("demo-coffee", ["instagram", "x"]);
  assert.equal(social.length, 1);
  assert.deepEqual(social[0].channels, ["instagram"]);
  assert.equal(social[0].linkParams.instagram, "utm_source=instagram&utm_medium=social&utm_campaign=cold-brew");
  assert.equal(liveCampaignBriefs("demo-coffee", ["blog"]).length, 1);
  assert.equal(liveCampaignBriefs("demo-coffee", ["tiktok"]).length, 0);
});

test("HQ counts its campaigns on the analytics board, and the campaign workflow has numbers", () => {
  setup();
  const none = hqMetrics("demo-coffee", NOW.getTime()).find((m) => m.id === "campaigns_live")!;
  assert.equal(none.value, null);
  const c = addCampaign("demo-coffee", brief(), NOW);
  setCampaignStatus("demo-coffee", c.id, "live", NOW);
  addCampaign("demo-coffee", brief({ name: "Tea week" }), NOW);
  const m = hqMetrics("demo-coffee", NOW.getTime()).find((x) => x.id === "campaigns_live")!;
  assert.equal(m.value, 1);
  assert.deepEqual(m.breakdown, [{ label: "live", value: 1 }, { label: "planned", value: 1 }]);
  const w = WORKFLOWS.find((x) => x.title === "Campaign from brief to results")!;
  assert.equal(w.metricId, "new_signups");
  assert.ok(WORKFLOW_ANALYTICS[w.title].includes("campaigns_live"));
});

// ---------------------------------------------------------------- the adapter contract

test("adapters may report outcomes per campaign tag: counts and money only, rebuilt field by field", () => {
  const snap = (campaigns: unknown) => ({ version: 1, observedAt: "2026-11-08T00:00:00Z", currency: "AUD", metrics: [], campaigns }) as unknown as AnalyticsSnapshot;
  assert.equal(analyticsProblem(snap([{ utm: "Cold-Brew", signups: 3, revenue: 120.5, period: "since 2026-11-02" }]), "AUD"), null);
  assert.equal(analyticsProblem(snap(undefined), "AUD"), null);
  assert.equal(analyticsProblem(snap([{ utm: "coffee-week-*", signups: 2 }]), "AUD"), null, "a prefix tag, as the campaign itself may have");
  assert.equal(analyticsProblem(snap([{ utm: "*" }]), "AUD"), "campaigns[0].utm");
  assert.equal(analyticsProblem(snap([{ signups: 3 }]), "AUD"), "campaigns[0].utm");
  assert.equal(analyticsProblem(snap([{ utm: "jo@example.com" }]), "AUD"), "campaigns[0].utm");
  assert.equal(analyticsProblem(snap([{ utm: "cold-brew", signups: -1 }]), "AUD"), "campaigns[0].signups");
  assert.equal(analyticsProblem(snap([{ utm: "cold-brew", visits: "9" }]), "AUD"), "campaigns[0].visits");
  assert.equal(analyticsProblem(snap("nope"), "AUD"), "campaigns");
  const rebuilt = rebuildAnalytics({ ...snap([{ utm: "Cold-Brew", signups: 3, email: "x", id: "cold-brew-month-2026-11-02" }]) });
  assert.deepEqual(rebuilt.campaigns, [{ utm: "cold-brew", id: "cold-brew-month-2026-11-02", signups: 3 }]);
});

// ---------------------------------------------------------------- checks and evidence

test("a social post that names a campaign must name an open one, and its own-site link must carry the tag", () => {
  const d: SocialDraft = { id: "2026-11-03-pinterest-1", network: "pinterest", format: "pin", day: "2026-11-03", caption: "How long cold brew keeps", hashtags: [], title: "Cold brew guide", slides: [{ title: "Cold brew keeps 14 days" }], why: "guide", status: "draft", campaign: "cold-brew-month-2026-11-02", link: "https://acme.example/guide/" };
  const ctx = { regulated: [], sites: ["https://acme.example"], campaigns: { "cold-brew-month-2026-11-02": "cold-brew" } };
  const tag = checkSocial(d, ctx).find((x) => x.id === "campaign-tag")!;
  assert.equal(tag.ok, false);
  assert.match(tag.detail, /utm_campaign=cold-brew/);
  assert.equal(checkSocial({ ...d, link: "https://acme.example/guide/?utm_source=pinterest&utm_medium=social&utm_campaign=cold-brew" }, ctx).find((x) => x.id === "campaign-tag")!.ok, true);
  assert.equal(checkSocial({ ...d, campaign: "gone" }, ctx).find((x) => x.id === "campaign")!.ok, false);
  assert.equal(checkSocial({ ...d, campaign: undefined }, ctx).some((x) => x.id.startsWith("campaign")), false);
});

test("the campaign workflow is live once a live campaign has work out, and in part while planned", () => {
  const none: EvidenceFacts = { demo: false, sites: [], posts: [], studioJobs: { count: 0 }, reviews: { count: 0 }, plans: 0, scorecardWeeks: [], lifecycle: null };
  const T = "Campaign from brief to results";
  assert.equal(evidenceFrom({ ...none, campaigns: [{ name: "Cold brew month", status: "planned", out: 0 }] })[T].state, "partial");
  const waiting = evidenceFrom({ ...none, campaigns: [{ name: "Cold brew month", status: "live", out: 0 }] })[T];
  assert.equal(waiting.state, "partial");
  assert.match(waiting.proof[1], /Nothing linked to a live campaign has gone out yet/);
  const live = evidenceFrom({ ...none, campaigns: [{ name: "Cold brew month", status: "live", out: 3, updatedAt: "2026-11-08T00:00:00Z" }, { name: "Tea week", status: "planned", out: 0 }] })[T];
  assert.equal(live.state, "live");
  assert.match(live.proof[0], /1 campaign live with work out: Cold brew month/);
  assert.match(live.proof[2], /1 more campaign planned/);
  assert.equal(evidenceFrom({ ...none, campaigns: [{ name: "Old", status: "done", out: 9 }] })[T], undefined);
});

test("hq help lists the campaign commands", () => {
  const root = path.resolve(__dirname, "..");
  const out = spawnSync(process.execPath, ["--import", "tsx", "scripts/hq.ts", "help"], { cwd: root, encoding: "utf8" }).stdout;
  assert.match(out, /^Campaigns\b/m);
  for (const sub of ["campaign add <slug>", "campaign report <slug> <id>", "campaign link <slug> <id> social|blog|email|experiment", "campaign note <slug> <id>"]) assert.ok(out.includes(sub), sub);
});

test("a campaign file is plain JSON with no field HQ doesn't know", () => {
  const c: Campaign = newCampaign(brief({ notes: ["Kick off with the guide"], links: [{ kind: "blog", ref: "cold-brew-ratio" }] }), NOW);
  assert.deepEqual(Object.keys(c).sort(), ["audience", "budget", "channels", "createdAt", "end", "goal", "id", "lever", "links", "metric", "name", "notes", "offer", "owner", "results", "start", "status", "target", "updatedAt", "utm", "version"].filter((k) => k !== "budget").sort());
});
