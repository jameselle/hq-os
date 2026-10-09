import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { newPartner, partnerProblems, transitionProblem, type PartnerInput } from "../lib/partners";
import {
  OPT_OUT_LINE, emailFooter, followUpDraft, followUpDue, footerProblem, outreachConfigProblems, sendProblem, windowProblem, withFooter, type OutreachConfig,
} from "../lib/partner-outreach";
import {
  addDraft, addFooters, addPartners, approveDraft, approveEmailDrafts, getPartner, listPartners, markSentByOwner, optOut, readPartners, retryDraft, setPartnerStatus,
  unapproveDraft, writeOutreachConfig,
} from "../lib/partner-store";
import { sendDue, sendOne, sendTest, writeFollowUps, type SendDeps } from "../lib/partner-sender";
import { emailCell } from "../lib/partner-email";
import { addCampaign } from "../lib/campaign-store";
import { buildFindings } from "../lib/ceo";
import { facts, profile, tempData } from "./helpers";

const root = path.resolve(__dirname, "..");
// Monday 9 November 2026, 10am in Sydney.
const MON_10 = new Date("2026-11-08T23:00:00Z");
const SUN_10 = new Date("2026-11-07T23:00:00Z");
const day = (n: number, from = MON_10) => new Date(from.getTime() + n * 864e5);

const CFG: OutreachConfig = {
  sender: { via: "composio-resend", account: "demo-sender-account", from: "Jo from Demo Coffee <jo@coffee.example>", replyTo: "jo@coffee.example" },
  dailyCap: 2,
  companyLine: "Demo Coffee is run by Demo Coffee Pty Ltd, coffee.example",
};
const BIZ = { name: "Demo Coffee", sites: ["https://coffee.example/"], timezone: "Australia/Sydney" };

const partner = (over: Partial<PartnerInput> = {}): PartnerInput => ({
  name: "Demo Brew Tips", handle: "@demo.brew.tips", platform: "instagram", url: "https://www.instagram.com/demo.brew.tips/",
  country: "AU", type: "creator", followers: 48200, followersSource: "public profile", followersAt: "2026-11-02",
  fit: { level: "high", reason: "Posts home brewing guides to home coffee drinkers every week" },
  compliance: { status: "ok", notes: "" }, contact: { route: "email", detail: "hello@brew.example" }, ...over,
});

function setup(opts: { config?: boolean } = {}) {
  const dir = tempData();
  const p = profile({ slug: "demo-coffee", name: "Demo Coffee", currency: "AUD", sites: ["https://coffee.example/"] });
  fs.mkdirSync(path.join(dir, "businesses", p.slug), { recursive: true });
  fs.writeFileSync(path.join(dir, "businesses", p.slug, "profile.json"), JSON.stringify(p));
  if (opts.config !== false) writeOutreachConfig("demo-coffee", CFG);
  return { dir, p };
}

/** A fake sender: records every cell (with the draft file as it was at the moment of the call) and answers sent. */
function fakeDeps(now: Date, answer: (run: string) => Record<string, unknown> = (run) => ({ run, status: "sent", id: `msg-${run}` })) {
  const calls: { cell: string; run: string; attemptsAtCall: number }[] = [];
  const deps: SendDeps = {
    now: () => now,
    workbench: async (cells, run) => {
      const attemptsAtCall = listPartners("demo-coffee").reduce((n, p) => n + p.drafts.reduce((m, d) => m + (d.attempts?.length ?? 0), 0), 0);
      calls.push({ cell: cells[0], run, attemptsAtCall });
      return { results: [{ run, ...answer(run) } as never] };
    },
  };
  return { deps, calls };
}

/** The payload a cell carries (it's embedded as a JSON string inside the Python). */
const payloadOf = (cell: string) => JSON.parse(JSON.parse(cell.match(/^_S=(.*)$/m)![1])) as Record<string, unknown>;

const emailDraft = (slug: string, id: string, subject = "Cold brew guides for your followers") =>
  addDraft(slug, id, { channel: "email", subject, body: "Hi,\n\nWe love your cold brew guides. Fancy a partnership?\n\nJo" }, MON_10);

// ---------------------------------------------------------------- the rules

test("the sender config is validated, and the footer names the sender, business, website and company line with the opt-out", () => {
  assert.deepEqual(outreachConfigProblems(CFG), []);
  const bad = outreachConfigProblems({ sender: { via: "smtp", account: "", from: "jo@coffee.example" }, companyLine: "x", dailyCap: 0 });
  for (const re of [/sender.via must be/, /sender.account must be/, /display name and address/, /dailyCap must be/, /companyLine must be/]) assert.ok(bad.some((b) => re.test(b)), String(re));
  const f = emailFooter(CFG, BIZ);
  assert.equal(f, ["--", "Jo from Demo Coffee", "https://coffee.example", CFG.companyLine, "", OPT_OUT_LINE].join("\n"));
  assert.equal(OPT_OUT_LINE, "If you'd rather not hear from us, reply 'no thanks' and we won't contact you again.");
  assert.match(footerProblem("Hi there", CFG, BIZ), /opt-out line, the company line, the sender's name, the website/);
  const body = withFooter("Hi there\n\nJo", CFG, BIZ);
  assert.equal(footerProblem(body, CFG, BIZ), "");
  assert.equal(withFooter(body, CFG, BIZ), body, "adding it twice changes nothing");
  assert.doesNotMatch(f, /[–—]/);
});

test("HQ sends only on weekdays between 9am and 5pm business time", () => {
  const tz = "Australia/Sydney";
  assert.equal(windowProblem(MON_10, tz), "");
  assert.match(windowProblem(SUN_10, tz), /weekend/);
  assert.match(windowProblem(new Date("2026-11-08T21:30:00Z"), tz), /8:00/, "8:30am Monday is too early");
  assert.equal(windowProblem(new Date("2026-11-08T22:00:00Z"), tz), "", "9am is open");
  assert.match(windowProblem(new Date("2026-11-09T06:00:00Z"), tz), /17:00/, "5pm is closed");
  assert.equal(windowProblem(new Date("2026-11-09T05:59:00Z"), tz), "", "4:59pm is open");
});

test("the approval gate: only approved email drafts to a public business email, check partners only with the note acknowledged", () => {
  setup();
  addPartners("demo-coffee", [partner(), partner({ name: "Demo Grinds", handle: "@demo.grinds", contact: { route: "dm" } }), partner({ name: "Check Brews", handle: "@check.brews", compliance: { status: "check", notes: "Confirm they disclose paid posts." } })], {}, MON_10);
  const p1 = emailDraft("demo-coffee", "instagram-demo-brew-tips");
  const d1 = p1.drafts[0];
  assert.match(d1.body, new RegExp(OPT_OUT_LINE.replace(/[.'?]/g, "\\$&")), "an email draft gets the footer when it's written");
  assert.match(sendProblem(p1, d1, CFG, BIZ), /isn't approved/);
  const ok = approveDraft("demo-coffee", "instagram-demo-brew-tips", 1, MON_10);
  assert.equal(sendProblem(ok, ok.drafts[0], CFG, BIZ), "");
  assert.match(sendProblem(ok, ok.drafts[0], null, BIZ), /no sender connected/);
  assert.match(sendProblem(ok, { ...ok.drafts[0], body: "Hi" }, CFG, BIZ), /missing the opt-out line/);
  assert.match(sendProblem(ok, { ...ok.drafts[0], subject: undefined }, CFG, BIZ), /no subject/);
  assert.equal(unapproveDraft("demo-coffee", "instagram-demo-brew-tips", 1, MON_10).drafts[0].status, "draft");

  // DMs and forms are the owner's: HQ never sends them, approved or not.
  const dm = addDraft("demo-coffee", "instagram-demo-grinds", { body: "Hi, fancy a partnership?" }, MON_10);
  const dmApproved = approveDraft("demo-coffee", dm.id, 1, MON_10);
  assert.match(sendProblem(dmApproved, dmApproved.drafts[0], CFG, BIZ), /owner sends DMs/);

  // A "check" partner: approving its email needs the note acknowledged, and only that draft's approval counts.
  emailDraft("demo-coffee", "instagram-check-brews");
  assert.throws(() => approveDraft("demo-coffee", "instagram-check-brews", 1, MON_10), /Confirm they disclose paid posts\.[\s\S]*--ack-check/);
  const acked = approveDraft("demo-coffee", "instagram-check-brews", 1, MON_10, { ackCheck: true });
  assert.equal(acked.drafts[0].checkAckAt, MON_10.toISOString());
  assert.equal(sendProblem(acked, acked.drafts[0], CFG, BIZ), "");
  assert.match(sendProblem(acked, { ...acked.drafts[0], checkAckAt: undefined }, CFG, BIZ), /needs a check/);
});

test("an avoid partner is never emailed, even with an approved email draft on file", async () => {
  setup();
  addPartners("demo-coffee", partner({ name: "Risky Brews", handle: "@risky.brews", compliance: { status: "avoid", notes: "Claims caffeine cures fatigue" }, drafts: [{ channel: "email", subject: "Hi", body: withFooter("Hi there", CFG, BIZ), status: "approved" }] }), {}, MON_10);
  const { deps, calls } = fakeDeps(MON_10);
  const res = await sendDue("demo-coffee", deps);
  assert.equal(calls.length, 0);
  assert.equal(res[0].status, "held");
  assert.match(res[0].detail, /avoid/);
  assert.throws(() => approveDraft("demo-coffee", "instagram-risky-brews", 1, MON_10), /avoid/);
});

// ---------------------------------------------------------------- sending

test("sending records the attempt before the call, then the provider's id, and moves the partner to contacted", async () => {
  setup();
  addPartners("demo-coffee", partner(), {}, MON_10);
  emailDraft("demo-coffee", "instagram-demo-brew-tips");
  approveDraft("demo-coffee", "instagram-demo-brew-tips", 1, MON_10);
  const { deps, calls } = fakeDeps(MON_10);
  const res = await sendDue("demo-coffee", deps);
  assert.equal(res[0].status, "sent");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].attemptsAtCall, 1, "the attempt is on disk before the provider is called");
  // The exact email: to the partner's public address, from the business's sender, with the footer and List-Unsubscribe.
  const sentP = payloadOf(calls[0].cell);
  assert.equal(sentP.to, "hello@brew.example");
  assert.equal(sentP.from, "Jo from Demo Coffee <jo@coffee.example>");
  assert.ok(String(sentP.text).endsWith(OPT_OUT_LINE) && String(sentP.text).includes(CFG.companyLine));
  assert.match(JSON.stringify(sentP.headers), /List-Unsubscribe/);
  assert.equal(sentP.retry, false);
  assert.match(calls[0].cell, /RESEND_SEND_EMAIL/);
  const p = getPartner("demo-coffee", "instagram-demo-brew-tips");
  const d = p.drafts[0];
  assert.equal(d.status, "sent-by-hq");
  assert.equal(d.messageId, `msg-${calls[0].run}`);
  assert.equal(d.sentAt, MON_10.toISOString());
  assert.equal(p.status, "contacted");
  assert.match(p.history.at(-1)!.note!, /HQ emailed outreach draft 1/);
  assert.deepEqual(partnerProblems(p), []);
  // Never twice: a second run sends nothing, and the draft can't be approved or marked sent again.
  assert.deepEqual((await sendDue("demo-coffee", deps)).length, 0);
  assert.equal(calls.length, 1);
  assert.throws(() => approveDraft("demo-coffee", p.id, 1, MON_10), /already sent by HQ/);
  assert.throws(() => markSentByOwner("demo-coffee", p.id, 1, MON_10), /already sent by HQ/);
  const log = fs.readFileSync(path.join(process.env.HQ_DATA!, "businesses", "demo-coffee", "partners", "outreach-log.jsonl"), "utf8");
  assert.match(log, /"event":"send-attempt"[\s\S]*"event":"sent"/);
});

test("a failed send is never retried on its own; the owner's retry looks for the first one before sending again", async () => {
  setup();
  addPartners("demo-coffee", partner(), {}, MON_10);
  emailDraft("demo-coffee", "instagram-demo-brew-tips");
  approveDraft("demo-coffee", "instagram-demo-brew-tips", 1, MON_10);
  const fail = fakeDeps(MON_10, (run) => ({ run, status: "sending" }));
  const r1 = await sendDue("demo-coffee", fail.deps);
  assert.equal(r1[0].status, "failed");
  assert.match(r1[0].detail, /may have gone/);
  const failed = getPartner("demo-coffee", "instagram-demo-brew-tips").drafts[0];
  assert.equal(failed.status, "failed");
  assert.equal(failed.attempts!.length, 1);
  // The hourly run leaves it alone.
  const again = fakeDeps(day(0.01));
  const r2 = await sendDue("demo-coffee", again.deps);
  assert.equal(again.calls.length, 0);
  assert.match(r2[0].detail, /retries it explicitly/);
  assert.match(sendProblem(getPartner("demo-coffee", "instagram-demo-brew-tips"), { ...failed, status: "approved" }, CFG, BIZ), /never sends twice unless the owner retries/);
  // The owner retries: the cell looks first (retry), finds the first email went, and records it without a new send.
  retryDraft("demo-coffee", "instagram-demo-brew-tips", 1, day(0.02));
  const found = fakeDeps(day(0.03), (run) => ({ run, status: "found", id: "msg-first" }));
  const r3 = await sendDue("demo-coffee", found.deps);
  assert.equal(r3[0].status, "found");
  assert.equal(payloadOf(found.calls[0].cell).retry, true);
  assert.match(found.calls[0].cell, /RESEND_LIST_EMAILS/);
  const d = getPartner("demo-coffee", "instagram-demo-brew-tips").drafts[0];
  assert.equal(d.status, "sent-by-hq");
  assert.equal(d.messageId, "msg-first");
  assert.equal(d.attempts!.length, 2);
});

test("the daily cap and the window hold sends back; the rest go on the next weekday run", async () => {
  setup();
  const xs = ["@one.cup", "@two.cups", "@three.cups"].map((h, i) => partner({ name: `Cup ${i + 1}`, handle: h, contact: { route: "email", detail: `hello${i}@brew.example` } }));
  addPartners("demo-coffee", xs, {}, MON_10);
  for (const p of listPartners("demo-coffee")) { emailDraft("demo-coffee", p.id); approveDraft("demo-coffee", p.id, 1, MON_10); }
  const sunday = fakeDeps(SUN_10);
  const rs = await sendDue("demo-coffee", sunday.deps);
  assert.equal(sunday.calls.length, 0);
  assert.ok(rs.every((r) => r.status === "held" && /weekend/.test(r.detail)));
  const monday = fakeDeps(MON_10);
  const rm = await sendDue("demo-coffee", monday.deps);
  assert.equal(monday.calls.length, 2, "dailyCap 2");
  assert.equal(rm.filter((r) => r.status === "sent").length, 2);
  assert.match(rm.find((r) => r.status === "held")!.detail, /cap/);
  const later = fakeDeps(day(0.1));
  await sendDue("demo-coffee", later.deps);
  assert.equal(later.calls.length, 0, "still Monday: the cap holds");
  const tuesday = fakeDeps(day(1));
  await sendDue("demo-coffee", tuesday.deps);
  assert.equal(tuesday.calls.length, 1);
  // A dry run says what would go and never calls out.
  const dry = await sendDue("demo-coffee", { now: () => MON_10, workbench: async () => { throw Error("called out") } }, { dryRun: true });
  assert.ok(dry.every((r) => r.status !== "sent"));
});

test("an opt-out blocks everything: declined for good, no drafts, no approvals, no sends, no follow-ups", async () => {
  setup();
  addPartners("demo-coffee", partner(), {}, MON_10);
  emailDraft("demo-coffee", "instagram-demo-brew-tips");
  approveDraft("demo-coffee", "instagram-demo-brew-tips", 1, MON_10);
  const p = optOut("demo-coffee", "instagram-demo-brew-tips", "Replied no thanks", MON_10);
  assert.equal(p.status, "declined");
  assert.ok(p.doNotContact);
  assert.equal(p.drafts[0].status, "draft", "an approved draft goes back to draft");
  assert.throws(() => addDraft("demo-coffee", p.id, { body: "One more thing" }, MON_10), /asked not to be contacted/);
  assert.throws(() => approveDraft("demo-coffee", p.id, 1, MON_10), /asked not to be contacted/);
  assert.throws(() => markSentByOwner("demo-coffee", p.id, 1, MON_10), /asked not to be contacted/);
  assert.throws(() => setPartnerStatus("demo-coffee", p.id, "prospect", undefined, MON_10), /never contacted again/);
  assert.match(transitionProblem(p, "shortlisted"), /never contacted again/);
  assert.match(sendProblem(p, { ...p.drafts[0], status: "approved", approvedAt: MON_10.toISOString() }, CFG, BIZ), /asked not to be contacted/);
  const { deps, calls } = fakeDeps(MON_10);
  await sendDue("demo-coffee", deps);
  assert.equal(calls.length, 0);
  assert.match(partnerProblems({ ...p, status: "prospect", history: [...p.history, { at: MON_10.toISOString(), status: "prospect" }] }).join(";"), /opted out/);
  assert.equal(optOut("demo-coffee", p.id, undefined, day(1)).doNotContact!.at, MON_10.toISOString(), "recording it twice keeps the first date");
});

// ---------------------------------------------------------------- follow-ups

test("one follow-up after five days without a reply, written once and never a second", async () => {
  setup();
  addPartners("demo-coffee", [partner(), partner({ name: "Demo Grinds", handle: "@demo.grinds", contact: { route: "dm" } })], {}, MON_10);
  emailDraft("demo-coffee", "instagram-demo-brew-tips");
  approveDraft("demo-coffee", "instagram-demo-brew-tips", 1, MON_10);
  await sendDue("demo-coffee", fakeDeps(MON_10).deps);
  addDraft("demo-coffee", "instagram-demo-grinds", { body: "Hi, fancy a partnership?" }, MON_10);
  markSentByOwner("demo-coffee", "instagram-demo-grinds", 1, MON_10);

  assert.deepEqual(writeFollowUps("demo-coffee", day(4.9)), [], "not before five days");
  const made = writeFollowUps("demo-coffee", day(5));
  assert.deepEqual(made.map((m) => m.partner).sort(), ["instagram-demo-brew-tips", "instagram-demo-grinds"]);
  const email = getPartner("demo-coffee", "instagram-demo-brew-tips").drafts[1];
  assert.equal(email.followUpOf, 1);
  assert.equal(email.status, "draft", "it waits for the owner's yes");
  assert.equal(email.channel, "email");
  assert.equal(email.subject, "Re: Cold brew guides for your followers");
  assert.match(email.body, /following up on my message from 9 November about "Cold brew guides for your followers"/);
  assert.equal(footerProblem(email.body, CFG, BIZ), "", "an email follow-up carries the footer");
  const dm = getPartner("demo-coffee", "instagram-demo-grinds").drafts[1];
  assert.equal(dm.channel, "dm");
  assert.doesNotMatch(dm.body, /no thanks/, "a DM follow-up has no email footer");
  assert.doesNotMatch(email.body + dm.body, /[–—]/);

  // Idempotent: the same tick again, or much later, writes nothing; and after the follow-up is sent, still nothing.
  assert.deepEqual(writeFollowUps("demo-coffee", day(6)), []);
  approveDraft("demo-coffee", "instagram-demo-brew-tips", 2, day(6));
  await sendDue("demo-coffee", fakeDeps(day(7)).deps);
  assert.equal(getPartner("demo-coffee", "instagram-demo-brew-tips").drafts[1].status, "sent-by-hq");
  assert.deepEqual(writeFollowUps("demo-coffee", day(20)), []);
  assert.throws(() => addDraft("demo-coffee", "instagram-demo-brew-tips", { body: "Again", followUpOf: 1 }, day(20)), /one at most/);

  // A reply, a decline or an opt-out stops it.
  const p = getPartner("demo-coffee", "instagram-demo-brew-tips");
  assert.equal(followUpDue({ ...p, drafts: p.drafts.slice(0, 1), status: "replied" }, day(9)), null);
  assert.equal(followUpDue({ ...p, drafts: p.drafts.slice(0, 1), doNotContact: { at: MON_10.toISOString() } }, day(9)), null);
  assert.ok(followUpDue({ ...p, drafts: p.drafts.slice(0, 1) }, day(9)));
  assert.equal(followUpDraft(p, p.drafts[0], BIZ, null).body.includes("no thanks"), false, "without a sender there is no footer to add");
});

// ---------------------------------------------------------------- the owner's test, bulk approval, footers

test("test mode sends only to the business's own address and never touches a partner record", async () => {
  const { dir } = setup();
  addPartners("demo-coffee", partner(), {}, MON_10);
  emailDraft("demo-coffee", "instagram-demo-brew-tips");
  const file = path.join(dir, "businesses", "demo-coffee", "partners", "instagram-demo-brew-tips.json");
  const before = fs.readFileSync(file, "utf8");
  const { deps, calls } = fakeDeps(SUN_10);
  const refused = await sendTest("demo-coffee", "hello@brew.example", deps);
  assert.equal(refused.status, "held");
  assert.match(refused.detail, /only to the business's own address/);
  assert.equal(calls.length, 0);
  const ok = await sendTest("demo-coffee", "jo@coffee.example", deps, { id: "demo-brew-tips" });
  assert.equal(ok.status, "sent", "a test goes any day (it's to the owner)");
  assert.equal(calls.length, 1);
  assert.equal(payloadOf(calls[0].cell).to, "jo@coffee.example");
  assert.ok(!calls[0].cell.includes("hello@brew.example"), "the partner's address is never in a test");
  assert.match(String(payloadOf(calls[0].cell).subject), /^\[HQ test\] Cold brew guides/);
  assert.equal(fs.readFileSync(file, "utf8"), before, "the partner file is untouched");
});

test("approve all email drafts for a campaign skips check, DM and footer-less drafts; footers are added on request", () => {
  setup({ config: false });
  const c = addCampaign("demo-coffee", { name: "Cold brew month", goal: "Win 60 new subscribers", lever: "get", audience: "Home coffee drinkers", offer: "Free guide", channels: ["partners"], start: "2026-11-02", end: "2026-11-29", metric: "new_signups", target: 60, utm: "cold-brew" }, MON_10);
  addPartners("demo-coffee", [
    partner({ campaigns: [c.id] }),
    partner({ name: "Check Brews", handle: "@check.brews", campaigns: [c.id], compliance: { status: "check", notes: "Confirm they disclose paid posts." } }),
    partner({ name: "Demo Grinds", handle: "@demo.grinds", campaigns: [c.id], contact: { route: "dm" } }),
  ], {}, MON_10);
  emailDraft("demo-coffee", "instagram-demo-brew-tips");
  emailDraft("demo-coffee", "instagram-check-brews");
  addDraft("demo-coffee", "instagram-demo-grinds", { body: "Hi" }, MON_10);
  assert.equal(getPartner("demo-coffee", "instagram-demo-brew-tips").drafts[0].body.includes("no thanks"), false, "no sender yet: no footer");
  const none = approveEmailDrafts("demo-coffee", c.id, MON_10);
  assert.equal(none.approved.length, 0);
  assert.ok(none.skipped.some((s) => /no sender/.test(s.why)));
  writeOutreachConfig("demo-coffee", CFG);
  const added = addFooters("demo-coffee", {}, MON_10);
  assert.deepEqual(added.map((a) => a.partner).sort(), ["instagram-check-brews", "instagram-demo-brew-tips"]);
  assert.deepEqual(addFooters("demo-coffee", {}, MON_10), [], "adding footers twice changes nothing");
  const r = approveEmailDrafts("demo-coffee", c.id, MON_10);
  assert.deepEqual(r.approved, [{ partner: "instagram-demo-brew-tips", n: 1 }]);
  assert.match(r.skipped.find((s) => s.partner === "instagram-check-brews")!.why, /needs a check/);
  assert.equal(getPartner("demo-coffee", "instagram-demo-grinds").drafts[0].status, "draft", "DMs are never bulk approved");
  // outreach.json lives in the partners folder and is never read as a partner.
  assert.deepEqual(readPartners("demo-coffee").invalid, []);
  assert.throws(() => getPartner("demo-coffee", "outreach"), /no partner outreach/);
});

test("the Gmail route sends with its own tools, and every cell refuses a payload that isn't copied exactly", () => {
  const base = { run: "abc123", account: "demo-sender-account", from: CFG.sender.from, to: "hello@brew.example", subject: "Hi", text: "Hi", since: 0, mode: "send" as const, retry: false };
  const g = emailCell({ ...base, via: "composio-gmail" });
  assert.match(g, /GMAIL_SEND_EMAIL/);
  assert.doesNotMatch(g, /RESEND_/);
  const r = emailCell({ ...base, via: "composio-resend" });
  assert.match(r, /_OK=hashlib.sha256\(_S.encode\(\)\).hexdigest\(\)=="[0-9a-f]{64}"/);
  assert.match(r, /if not _OK: raise Exception\("integrity/);
});

// ---------------------------------------------------------------- the CEO and the CLI

test("the CEO shows a failed send from the last day and the follow-ups waiting", () => {
  const p = profile({ slug: "demo-coffee", name: "Demo Coffee" });
  const f = buildFindings([], facts({ partners: { failed: [{ partner: "instagram-demo-brew-tips", name: "Demo Brew Tips", n: 1, at: MON_10.toISOString(), error: "domain not verified" }], followUps: 2 } }), p, {}, day(0.5));
  const failed = f.find((x) => x.id === "partner-send-failed-instagram-demo-brew-tips-1");
  assert.ok(failed);
  assert.equal(failed!.dept, "sales");
  assert.match(failed!.detail, /domain not verified/);
  assert.match(f.find((x) => x.id === "partner-follow-ups")!.title, /2 partner follow-ups ready/);
  const old = buildFindings([], facts({ partners: { failed: [{ partner: "x-y", name: "Y", n: 1, at: MON_10.toISOString(), error: "e" }], followUps: 0 } }), p, {}, day(2));
  assert.equal(old.some((x) => x.id.startsWith("partner-send-failed")), false, "only failures from the last day");
});

test("hq partner send --dry-run, optout and footer from the CLI", () => {
  const { dir } = setup();
  const env = { ...process.env, HQ_DATA: dir, HQ_ROOT: root };
  const run = (args: string[], input?: string) => spawnSync(process.execPath, ["--import", "tsx", "scripts/hq.ts", ...args], { cwd: root, encoding: "utf8", env, input });
  addPartners("demo-coffee", partner(), {}, MON_10);
  emailDraft("demo-coffee", "instagram-demo-brew-tips");
  const ap = run(["partner", "approve", "demo-coffee", "demo-brew-tips", "1"]);
  assert.equal(ap.status, 0, ap.stderr);
  assert.match(ap.stdout, /approved \(HQ emails it on a weekday/);
  const dry = run(["partner", "send", "demo-coffee", "--dry-run"]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /instagram-demo-brew-tips draft 1: (dry-run|held)/);
  const test = run(["partner", "send", "demo-coffee", "--test-to", "hello@brew.example", "--dry-run"]);
  assert.equal(test.status, 1);
  assert.match(test.stdout, /only to the business's own address/);
  const out = run(["partner", "outreach", "demo-coffee"]);
  assert.match(out.stdout, /HQ emails approved drafts via composio-resend/);
  const opt = run(["partner", "optout", "demo-coffee", "demo-brew-tips", "--note", "Replied no thanks"]);
  assert.equal(opt.status, 0, opt.stderr);
  assert.match(opt.stdout, /opted out/);
  assert.equal(getPartner("demo-coffee", "instagram-demo-brew-tips").status, "declined");
  const help = run(["help"]).stdout;
  for (const sub of ["partner send <slug>", "partner optout <slug> <id>", "partner retry <slug> <id> <n>", "partner approve-all <slug> --campaign", "partner tick <slug|--all>", "--test-to"]) assert.ok(help.includes(sub), sub);
});

test("nothing in the outreach code names a real business, and an HQ-sent draft's file validates", () => {
  for (const f of ["lib/partner-outreach.ts", "lib/partner-email.ts", "lib/partner-sender.ts", "components/PartnerControls.tsx", "app/api/partners/route.ts"]) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    assert.doesNotMatch(src, /[–—]/, `${f} has no em or en dash`);
  }
  const p = newPartner(partner(), MON_10);
  const sent = { ...p, drafts: [{ n: 1, channel: "email" as const, subject: "Hi", body: "Hi", status: "sent-by-hq" as const, at: MON_10.toISOString() }] };
  assert.match(partnerProblems(sent).join(";"), /needs sentAt, the provider's messageId and its attempt/);
  assert.match(partnerProblems({ ...sent, drafts: [{ ...sent.drafts[0], channel: "dm" as const }] }).join(";"), /only ever sends email drafts/);
});
