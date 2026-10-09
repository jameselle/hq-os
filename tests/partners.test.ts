import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  newPartner, partnerId, partnerLink, partnerOutcome, partnerProblems, partnerTag, pipelineReport, transitionProblem,
  type Partner, type PartnerInput,
} from "../lib/partners";
import {
  addDraft, addPartners, approveDraft, getPartner, linkPartnerCampaign, listPartners, markSentByOwner, notePartner, readPartners, setPartnerStatus,
} from "../lib/partner-store";
import { addCampaign, setCampaignStatus } from "../lib/campaign-store";
import { campaignFacts } from "../lib/campaign-report";
import { campaignReport, newCampaign, outcomeRows, type CampaignInput } from "../lib/campaigns";
import { evidenceFrom, workflowEvidence, type EvidenceFacts } from "../lib/workflow-evidence";
import { syncPartner, twentyRecords } from "../lib/twenty-sync";
import { profile, tempData } from "./helpers";

const NOW = new Date("2026-11-09T00:00:00Z");
const root = path.resolve(__dirname, "..");

const partner = (over: Partial<PartnerInput> = {}): PartnerInput => ({
  name: "Demo Brew Tips", handle: "@demo.brew.tips", platform: "instagram", url: "https://www.instagram.com/demo.brew.tips/?igsh=abc123",
  country: "AU", type: "creator", followers: 48200, followersSource: "public profile", followersAt: "2026-11-02",
  fit: { level: "high", reason: "Posts home brewing guides to home coffee drinkers every week" },
  compliance: { status: "ok", notes: "" }, contact: { route: "dm" }, ...over,
});
const brief = (over: Partial<CampaignInput> = {}): CampaignInput => ({
  name: "Cold brew month", goal: "Win 60 new subscribers from home cold brew drinkers", lever: "get",
  audience: "Home coffee drinkers who make cold brew", offer: "Free cold brew guide, then half price on the first box",
  channels: ["instagram", "partners"], start: "2026-11-02", end: "2026-11-29", metric: "new_signups", target: 60, utm: "cold-brew", ...over,
});

function setup() {
  const dir = tempData();
  const p = profile({ slug: "demo-coffee", name: "Demo Coffee", currency: "AUD", sites: ["https://coffee.example"] });
  fs.mkdirSync(path.join(dir, "businesses", p.slug), { recursive: true });
  fs.writeFileSync(path.join(dir, "businesses", p.slug, "profile.json"), JSON.stringify(p));
  return { dir, p };
}

// ---------------------------------------------------------------- the model

test("a partner's id is its platform plus its handle; links lose their share junk; drafts start as drafts", () => {
  const p = newPartner(partner(), NOW);
  assert.equal(p.id, "instagram-demo-brew-tips");
  assert.equal(partnerId("podcast", "The Demo Coffee Hour"), "podcast-the-demo-coffee-hour");
  assert.equal(p.url, "https://www.instagram.com/demo.brew.tips/");
  assert.equal(p.status, "prospect");
  assert.deepEqual(p.audience, { followers: 48200, source: "public profile", at: "2026-11-02" });
  assert.equal(p.history.length, 1);
  assert.equal(newPartner(partner({ handle: "demo.brew.tips" }), NOW).handle, "@demo.brew.tips", "a social handle gets its @");
  assert.deepEqual(partnerProblems(p), []);
});

test("the validator names every problem and how to fix it", () => {
  assert.throws(() => newPartner(partner({ name: "Demo — Brew", platform: "fax" as never, type: "spy" as never, country: "Australia", fit: { level: "great" as never, reason: "" } }), NOW), (e: Error) => {
    for (const re of [/name has an em or en dash/, /platform must be one of/, /type must be one of/, /country must be a two-letter/, /fit.level must be high, medium or low/, /fit.reason is required/]) assert.match(e.message, re);
    return true;
  });
  assert.throws(() => newPartner(partner({ followers: 1200, followersSource: undefined, followersAt: undefined }), NOW), /audience.source is required[\s\S]*audience.at must be the date/);
  assert.throws(() => newPartner(partner({ fit: { level: "high", reason: "Reach them on 0412 345 678" } }), NOW), /phone number/);
  assert.throws(() => newPartner(partner({ fit: { level: "high", reason: "Email jo@example.com" } }), NOW), /email address/);
  assert.throws(() => newPartner(partner({ compliance: { status: "check" } }), NOW), /compliance.notes is required/);
  assert.throws(() => newPartner(partner({ handle: "@demo brew" }), NOW), /public @handle/);
  assert.throws(() => newPartner(partner({ url: "http://insecure.example/x" }), NOW), /url must be/);
  assert.throws(() => newPartner(partner({ deal: { terms: "Fee", fee: -1 } }), NOW), /deal.fee must be a number/);
  assert.throws(() => newPartner(partner({ tracking: { tag: "Cold Brew" } }), NOW), /tracking.tag must be lowercase/);
  assert.throws(() => newPartner({ ...partner(), why: "extra" } as never, NOW), /unknown field why/);
  assert.throws(() => newPartner(partner({ contact: { route: "other", detail: "+61 412 345 678" } }), NOW), /never a phone number/);
  // A public business contact route is the one place an email may be kept.
  assert.doesNotThrow(() => newPartner(partner({ contact: { route: "email", detail: "hello@brew.example" } }), NOW));
  assert.doesNotThrow(() => newPartner(partner({ platform: "podcast", type: "podcast", handle: "The Demo Coffee Hour", url: "https://podcast.example/show", followers: null }), NOW));
  // An underscore handle isn't mistaken for a provider id.
  assert.doesNotThrow(() => newPartner(partner({ handle: "@brew_tipsters2026" }), NOW));
});

test("status rules: an avoid partner never moves past prospect, and live needs compliance ok", () => {
  const avoid = newPartner(partner({ compliance: { status: "avoid", notes: "Posts to under 18s" } }), NOW);
  for (const s of ["shortlisted", "contacted", "replied", "negotiating", "live", "paused"] as const) assert.match(transitionProblem(avoid, s), /never move past prospect/, s);
  assert.equal(transitionProblem(avoid, "declined"), "");
  assert.throws(() => newPartner(partner({ compliance: { status: "avoid", notes: "Posts to under 18s" }, status: "contacted" }), NOW), /avoid partner never moves past prospect/);
  const check = newPartner(partner({ compliance: { status: "check", notes: "Confirm they carry the 18+ wording" }, status: "negotiating" }), NOW);
  assert.match(transitionProblem(check, "live"), /before going live/);
  assert.equal(transitionProblem(check, "replied"), "");
  const ok = newPartner(partner(), NOW);
  assert.match(transitionProblem(ok, "prospect"), /already prospect/);
  const declined = { ...ok, status: "declined" } as Partner;
  assert.match(transitionProblem(declined, "live"), /reopen it/);
  assert.equal(transitionProblem(declined, "prospect"), "");
});

test("outreach drafts are never marked sent by HQ: imports refuse it and new drafts start as drafts", () => {
  setup();
  assert.throws(() => newPartner(partner({ drafts: [{ channel: "dm", body: "Hi there", status: "sent-by-owner" }] }), NOW), /HQ never sends/);
  assert.throws(() => newPartner(partner({ drafts: [{ channel: "dm", body: "Hi there", status: "sent" as never }] }), NOW), /HQ never sends/);
  assert.match(partnerProblems({ ...newPartner(partner(), NOW), drafts: [{ n: 1, channel: "dm", body: "Hi", status: "sent", at: NOW.toISOString() }] }).join(";"), /draft, approved or sent-by-owner/);
  assert.match(partnerProblems({ ...newPartner(partner(), NOW), drafts: [{ n: 1, channel: "dm", body: "Hi", status: "sent-by-owner", at: NOW.toISOString() }] }).join(";"), /needs sentAt/);

  addPartners("demo-coffee", partner(), {}, NOW);
  assert.throws(() => addDraft("demo-coffee", "instagram-demo-brew-tips", { body: "Hi", status: "sent-by-owner" }, NOW), /always a draft/);
  assert.throws(() => addDraft("demo-coffee", "instagram-demo-brew-tips", { body: "Love your guides — want to team up?" }, NOW), /em or en dash/);
  assert.throws(() => addDraft("demo-coffee", "instagram-demo-brew-tips", { body: "Call me on 0412 345 678" }, NOW), /phone number/);
  const withLink = addDraft("demo-coffee", "instagram-demo-brew-tips", { body: "Here's the guide: https://coffee.example/guide?utm_campaign=cold-brew-demo-brew-tips" }, NOW);
  assert.equal(withLink.drafts[0].status, "draft", "a tagged link in a draft is fine");
  assert.equal(withLink.drafts[0].channel, "dm", "the channel follows the contact route");
  assert.equal(approveDraft("demo-coffee", "demo-brew-tips", 1, NOW).drafts[0].status, "approved");
  const sent = markSentByOwner("demo-coffee", "instagram-demo-brew-tips", 1, NOW);
  assert.equal(sent.drafts[0].status, "sent-by-owner");
  assert.equal(sent.drafts[0].sentAt, NOW.toISOString());
  assert.equal(sent.status, "contacted", "a prospect the owner wrote to is contacted");
  assert.match(sent.history.at(-1)!.note!, /Owner sent outreach draft 1/);

  addPartners("demo-coffee", partner({ handle: "@risky.brews", name: "Risky Brews", compliance: { status: "avoid", notes: "Claims caffeine cures fatigue" } }), {}, NOW);
  assert.throws(() => addDraft("demo-coffee", "instagram-risky-brews", { body: "Hi" }, NOW), /no outreach is written for an avoid partner/);
  // No code path in the partner modules sends a message: they never import a mailer, a DM route or the publisher.
  for (const f of ["lib/partners.ts", "lib/partner-store.ts", "lib/partner-report.ts"]) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    assert.doesNotMatch(src, /from "\.\/(publishing|social-publish|social-publisher|social-replies-store|lifecycle)"/, f);
  }
});

// ---------------------------------------------------------------- the store

test("partners are stored per business, owner-only, validated, moved with dated history and mirrored to the vault", () => {
  const { dir } = setup();
  const c = addCampaign("demo-coffee", brief(), NOW);
  const r = addPartners("demo-coffee", partner({ campaigns: [c.id] }), {}, NOW);
  const p = r.added[0];
  const file = path.join(dir, "businesses", "demo-coffee", "partners", `${p.id}.json`);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(p.tracking.tag, "cold-brew-demo-brew-tips", "linking a campaign gives the partner its tag");
  assert.throws(() => addPartners("demo-coffee", partner(), {}, NOW), /already exists/);
  assert.throws(() => addPartners("nobody", partner(), {}, NOW), /no such business/);
  assert.throws(() => addPartners("demo-coffee", partner({ handle: "@other.one", campaigns: ["nope"] }), {}, NOW), /no campaign nope/);
  assert.throws(() => getPartner("demo-coffee", "../profile"), /no partner/);

  const moved = setPartnerStatus("demo-coffee", p.id, "shortlisted", "Best fit of the week", NOW);
  assert.equal(moved.partner.history.at(-1)!.note, "Best fit of the week");
  assert.throws(() => setPartnerStatus("demo-coffee", p.id, "shortlisted", undefined, NOW), /already shortlisted/);
  const live = setPartnerStatus("demo-coffee", p.id, "live", undefined, NOW);
  assert.ok(live.warnings.some((w) => /no deal terms/.test(w)));
  notePartner("demo-coffee", p.id, "Asked for a guide to share", NOW);
  assert.throws(() => notePartner("demo-coffee", p.id, "Guide – shared", NOW), /dash/);

  const up = addPartners("demo-coffee", partner({ deal: { terms: "Commission per paying customer for 3 months", commission: 20 }, notes: ["Agreed on a call"] }), { update: true }, NOW);
  assert.equal(up.updated.length, 1);
  const merged = getPartner("demo-coffee", p.id);
  assert.equal(merged.status, "live", "an update never moves the status");
  assert.equal(merged.deal?.commission, 20);
  assert.equal(merged.tracking.tag, "cold-brew-demo-brew-tips", "the tag survives an update");
  assert.equal(merged.notes.length, 2);
  assert.throws(() => addPartners("demo-coffee", partner({ status: "paused" }), { update: true }, NOW), /change status with/);
  assert.throws(() => addPartners("demo-coffee", partner({ compliance: { status: "check", notes: "Recheck" } }), { update: true }, NOW), /live partner needs compliance ok/);

  linkPartnerCampaign("demo-coffee", p.id, c.id, { remove: true }, NOW);
  assert.deepEqual(getPartner("demo-coffee", p.id).campaigns, []);
  const md = fs.readFileSync(path.join(dir, "businesses", "demo-coffee", "vault", "Departments", "Sales & Partnerships", "Partners.md"), "utf8");
  assert.match(md, /Demo Brew Tips \| Instagram @demo.brew.tips \| Creator \| 48.2k \| Live/);

  fs.writeFileSync(path.join(dir, "businesses", "demo-coffee", "partners", "broken.json"), "{\"name\":\"x\"}");
  const { partners, invalid } = readPartners("demo-coffee");
  assert.equal(partners.length, 1);
  assert.equal(invalid[0].file, "broken.json");
});

test("an import of a list is all or nothing, and every bad item is named", () => {
  setup();
  const list = [partner(), partner({ name: "Second", handle: "@second.cup" }), partner({ name: "Bad — one", handle: "@bad.one" })];
  assert.throws(() => addPartners("demo-coffee", list, {}, NOW), (e: Error) => /nothing was saved/.test(e.message) && /#3 \(Bad — one\): name has an em or en dash/.test(e.message));
  assert.equal(listPartners("demo-coffee").length, 0);
  assert.throws(() => addPartners("demo-coffee", [partner(), partner()], {}, NOW), /in the list twice/);
  const r = addPartners("demo-coffee", list.slice(0, 2), {}, NOW);
  assert.equal(r.added.length, 2);
});

test("hq partner add imports an array from stdin, and the CLI moves and reports partners", () => {
  const { dir } = setup();
  const env = { ...process.env, HQ_DATA: dir, HQ_ROOT: root };
  const run = (args: string[], input?: string) => spawnSync(process.execPath, ["--import", "tsx", "scripts/hq.ts", ...args], { cwd: root, encoding: "utf8", env, input });
  const add = run(["partner", "add", "demo-coffee", "-"], JSON.stringify([partner(), partner({ name: "The Demo Coffee Hour", handle: "The Demo Coffee Hour", platform: "podcast", type: "podcast", url: "https://podcast.example/show", followers: null, followersSource: undefined, followersAt: undefined })]));
  assert.equal(add.status, 0, add.stderr);
  assert.match(add.stdout, /2 added, 0 updated for Demo Coffee/);
  const bad = run(["partner", "add", "demo-coffee", "-"], JSON.stringify({ ...partner({ handle: "@x.y" }), name: "" }));
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /nothing was saved[\s\S]*name is required/);
  const st = run(["partner", "status", "demo-coffee", "demo-brew-tips", "shortlisted", "--note", "Top pick"]);
  assert.equal(st.status, 0, st.stderr);
  assert.match(st.stdout, /Demo Brew Tips: Shortlisted/);
  const list = run(["partner", "list", "demo-coffee", "--status", "shortlisted"]);
  assert.match(list.stdout, /Shortlisted\s+instagram-demo-brew-tips/);
  assert.doesNotMatch(list.stdout, /podcast-the-demo-coffee-hour/);
  const draft = run(["partner", "draft", "demo-coffee", "demo-brew-tips", "-"], "Hi, we love your cold brew guides. Fancy a partnership?");
  assert.equal(draft.status, 0, draft.stderr);
  assert.match(draft.stdout, /draft 1 saved \(dm\)\. The owner sends it/);
  const broken = run(["partner", "draft", "demo-coffee", "demo-brew-tips", "-"], '{"channel":"dm","body":"Hi\nthere"}');
  assert.equal(broken.status, 1, "an object with a raw line break isn't JSON, and isn't saved as the message");
  assert.match(broken.stderr, /looks like JSON but isn't valid/);
  const json = run(["partner", "draft", "demo-coffee", "demo-brew-tips", "-"], JSON.stringify({ channel: "email", subject: "Cold brew guides", body: "Hi,\n\nFancy a partnership?" }));
  assert.match(json.stdout, /draft 2 saved \(email\)/);
  const rep = run(["partner", "report", "demo-coffee"]);
  assert.match(rep.stdout, /partner pipeline \(2 in all, 2 open\)/);
  assert.match(rep.stdout, /sign-ups\s+not measured yet: No tracking tag on a live partner \(none is live yet\)/);
  const sync = run(["partner", "sync", "demo-coffee", "--dry-run"]);
  assert.match(sync.stdout, /dry run: 2 partners[\s\S]*opportunity stage NEW \(create\)/);
  const help = run(["help"]).stdout;
  assert.match(help, /^Partners\b/m);
  for (const sub of ["partner add <slug> <file.json|->", "partner status <slug> <id> <status>", "partner link <slug> <id> campaign", "partner sent <slug> <id> <n>", "partner report <slug>", "partner sync <slug>"]) assert.ok(help.includes(sub), sub);
});

// ---------------------------------------------------------------- tags and attribution

test("a partner's tag is the campaign's tag plus its handle, and its link carries it", () => {
  assert.equal(partnerTag("cold-brew", "@demo.brew.tips"), "cold-brew-demo-brew-tips");
  assert.equal(partnerTag("series-*", "@demo.brew.tips"), "series-demo-brew-tips");
  assert.ok(partnerTag("a".repeat(58), "@demo.brew.tips").length <= 60);
  assert.equal(partnerLink("https://coffee.example/guide/?utm_source=x", "cold-brew-demo-brew-tips", "instagram"), "https://coffee.example/guide/?utm_source=instagram&utm_medium=partner&utm_campaign=cold-brew-demo-brew-tips");
});

test("partner tags count toward their campaign by prefix, unless a longer campaign tag owns them", () => {
  const c = newCampaign(brief(), NOW);
  const rows = [
    { utm: "cold-brew", signups: 10 }, { utm: "cold-brew-demo-brew-tips", signups: 4, paying: 2 },
    { utm: "cold-brew-month-x", signups: 9 }, { utm: "cold-brewing", signups: 7 }, { utm: "custom-partner-link", signups: 3 },
  ];
  const mine = outcomeRows(c, rows, { campaignTags: ["cold-brew", "cold-brew-month"], partnerTags: ["custom-partner-link"] }).map((r) => r.utm);
  assert.deepEqual(mine, ["cold-brew", "cold-brew-demo-brew-tips", "custom-partner-link"]);
  assert.deepEqual(outcomeRows(newCampaign(brief({ name: "Month", utm: "cold-brew-month" }), NOW), rows, { campaignTags: ["cold-brew", "cold-brew-month"] }).map((r) => r.utm), ["cold-brew-month-x"]);
  const r = campaignReport(c, {
    now: NOW.getTime(), currency: "AUD", social: [], blog: [], readBack: {}, lifecycle: null, experiments: [], ledger: null, readings: {}, vaultNotes: [],
    analytics: { connected: true, observedAt: null, campaigns: rows }, partnerTags: { [c.id]: ["custom-partner-link"] }, campaignTags: ["cold-brew", "cold-brew-month"],
  });
  assert.equal(r.signups.value, 17);
});

test("a campaign's report counts its partners' sign-ups end to end, and a partner's own results are by its tag only", () => {
  const { dir } = setup();
  const c = addCampaign("demo-coffee", brief(), NOW);
  setCampaignStatus("demo-coffee", c.id, "live", NOW);
  addPartners("demo-coffee", partner({ campaigns: [c.id], tracking: { tag: "brewtips-special" } }), {}, NOW);
  fs.writeFileSync(path.join(dir, "businesses", "demo-coffee", "analytics-connection.json"), JSON.stringify({ command: ["/usr/bin/true"] }));
  fs.writeFileSync(path.join(dir, "businesses", "demo-coffee", "analytics-snapshot.json"), JSON.stringify({ version: 1, observedAt: NOW.toISOString(), currency: "AUD", metrics: [], campaigns: [{ utm: "cold-brew", signups: 5 }, { utm: "brewtips-special", signups: 3, paying: 1 }] }));
  const facts = campaignFacts("demo-coffee", { readings: false }, NOW);
  assert.deepEqual(facts.partnerTags, { [c.id]: ["brewtips-special"] });
  const rep = campaignReport(c, facts);
  assert.equal(rep.signups.value, 8, "the partner's custom tag counts toward its campaign");
  const p = getPartner("demo-coffee", "demo-brew-tips");
  const o = partnerOutcome(p, { connected: true, observedAt: null, campaigns: facts.analytics.campaigns });
  assert.equal(o.signups.value, 3);
  assert.equal(o.paying.value, 1);
});

test("partner results are never zero-filled: each missing number says what it needs", () => {
  const p = newPartner(partner({ tracking: { tag: "cold-brew-demo-brew-tips" } }), NOW);
  assert.match(partnerOutcome(p, { connected: false, observedAt: null, campaigns: null }).signups.note, /No analytics adapter connected/);
  assert.match(partnerOutcome(p, { connected: true, observedAt: null, campaigns: null }).signups.note, /doesn't report tags yet/);
  assert.match(partnerOutcome(p, { connected: true, observedAt: null, campaigns: [{ utm: "other", signups: 2 }] }).signups.note, /no row for the tag cold-brew-demo-brew-tips/);
  assert.match(partnerOutcome({ ...p, tracking: { tag: null, link: null } }, { connected: true, observedAt: null, campaigns: [] }).signups.note, /No tracking tag/);
  const live = { ...p, status: "live" as const };
  const r = pipelineReport([live, newPartner(partner({ handle: "@second.cup", name: "Second Cup" }), NOW)], { connected: true, observedAt: null, campaigns: [{ utm: "cold-brew-demo-brew-tips", signups: 6 }] });
  assert.equal(r.totals.signups.value, 6);
  assert.equal(r.totals.paying.value, null);
  assert.equal(r.liveTagged, 1);
  assert.equal(r.open, 2);
  assert.ok(r.missing.some((m) => /paying customers: The adapter's row has no paying customers/.test(m)));
});

// ---------------------------------------------------------------- workflow evidence

test("Partner program is in part while partners are found or contacted, and live once one is live with a tag", () => {
  const none: EvidenceFacts = { demo: false, sites: [], posts: [], studioJobs: { count: 0 }, reviews: { count: 0 }, plans: 0, scorecardWeeks: [], lifecycle: null };
  const T = "Partner program", A = "Podcast and creator appearances";
  const x = (status: string, tagged = false, appearance = false) => ({ status, tagged, appearance, updatedAt: "2026-11-08T00:00:00Z" });
  assert.deepEqual(evidenceFrom({ ...none, partners: [] }), {});
  const part = evidenceFrom({ ...none, partners: [x("prospect"), x("prospect"), x("contacted")] });
  assert.equal(part[T].state, "partial");
  assert.match(part[T].proof[0], /^3 partners in the pipeline: 2 prospects and 1 contacted$/);
  assert.match(part[T].proof[1], /No partner is live with a tracking tag yet/);
  assert.equal(part[A], undefined);
  assert.equal(evidenceFrom({ ...none, partners: [x("live", false)] })[T].state, "partial", "live without a tag can't be measured");
  const live = evidenceFrom({ ...none, partners: [x("live", true), x("shortlisted"), x("declined"), x("contacted", false, true)] });
  assert.equal(live[T].state, "live");
  assert.match(live[T].proof[0], /1 partner live with a tracking tag/);
  assert.match(live[T].proof[1], /1 shortlisted and 1 contacted/);
  assert.equal(live[A].state, "partial");
  assert.equal(evidenceFrom({ ...none, partners: [x("live", true, true)] })[A].state, "live");
  assert.equal(evidenceFrom({ ...none, partners: [x("declined"), x("ended", true)] })[T], undefined);
});

test("workflowEvidence reads the partner files, so Sales & Partnerships lights up with a live tagged partner", async () => {
  setup();
  const c = addCampaign("demo-coffee", brief(), NOW);
  addPartners("demo-coffee", partner(), {}, NOW);
  assert.equal(workflowEvidence("demo-coffee").evidence["Partner program"].state, "partial");
  linkPartnerCampaign("demo-coffee", "instagram-demo-brew-tips", c.id, {}, NOW);
  setPartnerStatus("demo-coffee", "instagram-demo-brew-tips", "live", undefined, NOW);
  assert.equal(workflowEvidence("demo-coffee").evidence["Partner program"].state, "live");
  const { builtDepartments } = await import("../lib/built");
  assert.match(builtDepartments("demo-coffee").sales ?? "", /Partner program/);
});

// ---------------------------------------------------------------- Twenty

test("the Twenty sync creates a company, a person and an opportunity, then updates them; nothing else leaves", async () => {
  const p = newPartner(partner({ status: "negotiating", deal: { terms: "Flat fee for two posts", fee: 250 } }), NOW);
  const rec = twentyRecords(p, { name: "Demo Coffee", currency: "AUD" });
  assert.deepEqual(rec.opportunity, { name: "Demo Brew Tips partnership, Demo Coffee", stage: "PROPOSAL", amount: { amountMicros: 250000000, currencyCode: "AUD" } });
  assert.equal(rec.company.domainName, undefined, "an Instagram profile isn't a company domain");
  const calls: { method: string; url: string; body: Record<string, unknown>; auth: string }[] = [];
  let n = 0;
  const fetch = async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
    calls.push({ method: init.method, url, body: JSON.parse(init.body), auth: init.headers.Authorization });
    const kind = url.split("/rest/")[1].split("/")[0];
    return { ok: true, status: 200, json: async () => ({ data: { [`create${kind}`]: { id: `id-${++n}` } } }) };
  };
  const first = await syncPartner(p, { name: "Demo Coffee", currency: "AUD" }, { fetch, key: "test-key", base: "http://127.0.0.1:3020", now: NOW });
  assert.equal(first.error, undefined);
  assert.deepEqual(first.created, ["companies", "people", "opportunities"]);
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), ["POST http://127.0.0.1:3020/rest/companies", "POST http://127.0.0.1:3020/rest/people", "POST http://127.0.0.1:3020/rest/opportunities"]);
  assert.equal(calls[2].body.companyId, "id-1");
  assert.equal(calls[2].body.pointOfContactId, "id-2");
  assert.ok(calls.every((c) => c.auth === "Bearer test-key"));
  assert.ok(!JSON.stringify(calls.map((c) => c.body)).includes("fit"), "fit and compliance notes stay in HQ");
  calls.length = 0;
  const second = await syncPartner({ ...p, crm: { twenty: first.ids } }, { name: "Demo Coffee", currency: "AUD" }, { fetch, key: "test-key", now: NOW });
  assert.deepEqual(second.updated, ["companies", "people", "opportunities"]);
  assert.ok(calls.every((c) => c.method === "PATCH"));
  const failing = await syncPartner(p, { name: "Demo Coffee", currency: "AUD" }, { fetch: async () => ({ ok: false, status: 401, json: async () => ({}) }), key: "bad" });
  assert.match(failing.error ?? "", /answered 401/);
});
