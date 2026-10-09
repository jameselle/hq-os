import { test } from "node:test";
import assert from "node:assert/strict";

import { answerLink, automated, buildQuery, snapshotFrom, themeOf } from "../templates/support/gmail.mjs";
import { supportProblem } from "../lib/support";

const H = 3600e3, now = Date.parse("2026-10-06T00:00:00Z");
type Msg = { from: string; to?: string; subject?: string; snippet?: string; at: number; labels?: string[]; extra?: Record<string, string>; id?: string };
const msg = (m: Msg) => ({
  internalDate: String(m.at), labelIds: m.labels ?? ["INBOX"], snippet: m.snippet ?? "",
  payload: { headers: [
    { name: "From", value: m.from }, { name: "To", value: m.to ?? "support@example.com" }, { name: "Subject", value: m.subject ?? "Hello" },
    { name: "Message-ID", value: m.id ?? `<${m.at}.${m.from}>` }, ...Object.entries(m.extra ?? {}).map(([name, value]) => ({ name, value })),
  ] },
});
const thread = (id: string, msgs: Msg[], mailbox = "owner@example.com") => ({ mailbox, thread: { id, messages: msgs.map(msg) } });
const cfg = { addresses: ["support@example.com"], mailboxes: ["owner@example.com"], ownAddresses: ["hello@example.com"] };

test("a conversation answered in 2 hours, one still waiting, and mail no person wrote left out", () => {
  const s = snapshotFrom([
    thread("t1", [
      { from: "Pat <pat@customer.test>", subject: "Refund please", snippet: "I was charged twice", at: now - 50 * H },
      { from: "support@example.com", to: "pat@customer.test", at: now - 48 * H, labels: ["SENT"] },
    ]),
    thread("t2", [
      { from: "hello@example.com", to: "sam@customer.test", subject: "Make your first request", at: now - 30 * H, labels: ["SENT"] },
      { from: "sam@customer.test", subject: "Re: Make your first request", snippet: "my api key returns nothing", at: now - 5 * H },
    ]),
    thread("t3", [{ from: "news@vendor.test", subject: "Our October update", at: now - 3 * H, extra: { "List-Unsubscribe": "<mailto:x@vendor.test>" } }]),
    thread("t4", [{ from: "no-reply@payments.test", subject: "Payout sent", at: now - 2 * H }]),
    thread("t5", [{ from: "friend@personal.test", to: "owner@example.com", subject: "Lunch?", at: now - H }]),
  ], cfg, now);
  assert.equal(supportProblem(s), null);
  assert.deepEqual(s.themes, { "Cancel or refund": 1, "Account and sign-in": 1 });
  assert.equal(s.waiting.length, 1);
  assert.equal(s.waiting[0].openedFrom, "a reply to one of our emails");
  assert.equal(s.waiting[0].unread, 1);
  assert.match(s.waiting[0].ref, /^e-[0-9a-f]{8}$/);
  assert.deepEqual(s.weekly.map((w) => [w.week, w.opened, w.answered, w.medianReplyHours]), [["2026-W40", 1, 1, 2], ["2026-W41", 1, 0, null]]);
});

test("nothing personal leaves: no subjects, snippets, addresses or thread ids in the snapshot", () => {
  const s = snapshotFrom([thread("18c0ffee", [{ from: "pat@customer.test", subject: "Secret subject", snippet: "secret body", at: now - H }])], cfg, now);
  const out = JSON.stringify({ ...s, answerAt: undefined });
  for (const bad of ["Secret", "secret", "pat@", "customer.test", "18c0ffee"]) assert.equal(out.includes(bad), false, bad);
});

test("the same conversation in two mailboxes counts once; rows from the second mailbox link to it", () => {
  const m: Msg = { from: "pat@customer.test", subject: "Where is the NFL data?", at: now - 3 * H, id: "<abc@customer.test>" };
  const two = { ...cfg, mailboxes: ["owner@example.com", "help@example.com"] };
  const s = snapshotFrom([thread("a", [m]), thread("b", [m], "help@example.com")], two, now);
  assert.equal(s.waiting.length, 1);
  assert.equal(snapshotFrom([thread("b", [m], "help@example.com")], two, now).waiting[0].answerAt, answerLink("help@example.com", ["support@example.com"]));
});

test("spam, trash and drafts don't count; a mailbox not signed in is named in blind, without its address", () => {
  const s = snapshotFrom([thread("s", [{ from: "x@spam.test", at: now - H, labels: ["SPAM"] }])], { ...cfg, missing: ["other@example.com"] }, now);
  assert.equal(s.waiting.length, 0);
  assert.ok(s.blind!.some((b) => /1 configured mailbox isn’t signed in/.test(b)));
  assert.equal(JSON.stringify(s.blind).includes("other@"), false);
  assert.equal(supportProblem(s), null);
});

test("themes, automated senders, the query and the answer link", () => {
  assert.equal(themeOf("Please cancel my subscription"), "Cancel or refund");
  assert.equal(themeOf("Card declined on checkout"), "Billing and payments");
  assert.equal(themeOf("Can't log in"), "Account and sign-in");
  assert.equal(themeOf("Getting a 500 error"), "Bug or broken");
  assert.equal(themeOf("Do you have AFL player props?"), "Odds or data");
  assert.equal(themeOf("Could you add tennis?"), "Feature request");
  assert.equal(themeOf("Partnership idea"), "Partnership or press");
  assert.equal(themeOf("hi there"), "Other");
  assert.equal(automated(msg({ from: "Mailer-Daemon@x.test", at: 0 })), true);
  assert.equal(automated(msg({ from: "pat@x.test", at: 0, extra: { "Auto-Submitted": "auto-replied" } })), true);
  assert.equal(automated(msg({ from: "pat@x.test", at: 0 })), false);
  assert.match(buildQuery(["support@example.com"]), /^newer_than:90d -in:chats \{to:support@example\.com cc:/);
  assert.doesNotMatch(answerLink("owner@example.com", ["support@example.com"]), /\?/);
});

test("a contact form the site relays to the support address (Reply-To the customer) counts, and the reply answers it", () => {
  const form: Msg = { from: "Site <hello@example.com>", to: "support@example.com", subject: "Website contact: partner", snippet: "We'd like to partner", at: now - 10 * H, extra: { "Reply-To": "pat@customer.test" } };
  const s = snapshotFrom([thread("f", [form, { from: "support@example.com", to: "pat@customer.test", at: now - 4 * H, labels: ["SENT"] }])], cfg, now);
  assert.deepEqual(s.themes, { "Partnership or press": 1 });
  assert.equal(s.waiting.length, 0);
  assert.deepEqual(s.weekly.at(-1), { week: "2026-W41", opened: 1, answered: 1, medianReplyHours: 6 });
  const w = snapshotFrom([thread("g", [form])], cfg, now).waiting[0];
  assert.equal(w.openedFrom, "the website contact form");
  // The business's own lifecycle email to a customer (no Reply-To to a customer, not to the support address) is not a conversation.
  assert.equal(snapshotFrom([thread("h", [{ from: "hello@example.com", to: "sam@customer.test", at: now - H }])], cfg, now).waiting.length, 0);
});

test("ownDomains: any sender at the business's domain is the business, so its relayed form still counts", () => {
  const form: Msg = { from: "Demo Shop <mailer@example.com>", to: "support@example.com", subject: "Website contact: billing", snippet: "invoice question", at: now - 2 * H, extra: { "Reply-To": "pat@customer.test" } };
  const without = snapshotFrom([thread("f", [form])], { addresses: ["support@example.com"], mailboxes: ["owner@example.com"] }, now);
  assert.equal(without.waiting[0].openedFrom, "a new email");
  const withDomain = snapshotFrom([thread("f", [form])], { addresses: ["support@example.com"], mailboxes: ["owner@example.com"], ownDomains: ["example.com"] }, now);
  assert.equal(withDomain.waiting[0].openedFrom, "the website contact form");
  assert.deepEqual(withDomain.themes, { "Billing and payments": 1 });
});
