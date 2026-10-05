import { test } from "node:test";
import assert from "node:assert/strict";

import type { LifecycleFlow, LifecycleWorkflow } from "../lib/lifecycle";
import { addDays, dayLabel, explainFlow, flowStatus, lifecycleStatus, readOutcome, timeLabel } from "../lib/lifecycle-status";

const TZ = "Australia/Sydney";
// 2026-10-05 10:00 in Sydney.
const NOW = Date.parse("2026-10-04T23:00:00Z");
const days = (rows: [string, number, number, number][]) => rows.map(([day, entered, sent, skipped]) => ({ day, entered, sent, skipped }));

const churn: LifecycleFlow = {
  id: "churn", label: "Churn check-ins", serves: "Churn early warning", mode: "draft", holdoutPct: 20, channel: "email",
  trigger: "A paying member quiet for 10 days", since: "2026-10-04",
  daily: days([["2026-10-03", 0, 0, 0], ["2026-10-04", 23, 0, 2], ["2026-10-05", 0, 14, 0]]),
  delivery: [{ label: "sent", count: 14 }, { label: "delivered", count: 12 }, { label: "bounced", count: 0 }, { label: "complained", count: 0 }, { label: "unsubscribed", count: 0 }],
  skips: [{ label: "no longer paying", count: 2 }],
  outcomes: [{ label: "Came back", window: "7 days", emailed: { n: 0, hit: 0 }, holdout: { n: 0, hit: 0 } }],
  messages: [{ id: "churn-quiet", label: "Gone quiet", subject: "Quick question", html: "<p>x</p>" }],
};
const ctl = (over: Partial<LifecycleWorkflow> = {}): LifecycleWorkflow => ({ id: "churn-quiet", label: "Gone quiet", delayHours: 0, enabled: true, audience: "x", serves: "Churn early warning", sent30d: 10, drafts: 0, preview: { subject: "Quick question", text: "t" }, ...over });

test("dates read as a person says them", () => {
  assert.equal(addDays("2026-10-05", 7), "2026-10-12");
  assert.equal(dayLabel("2026-10-12"), "Mon 12 Oct");
  assert.equal(timeLabel("2026-10-06T05:12:00Z", TZ), "Tue 6 Oct, 4:12 pm");
});

test("working in week one: says how many went out and when to come back", () => {
  const s = flowStatus(churn, [ctl()], { now: NOW, tz: TZ, observedAt: new Date(NOW).toISOString() });
  assert.equal(s.working.tone, "good");
  assert.match(s.working.detail!, /14 emails sent in the last 7 days\. 12 of 14 delivered since Sun 4 Oct, 2 awaiting a receipt/);
  assert.equal(s.waiting.headline, "Nothing waiting");
  assert.equal(s.next.headline, "Nothing until Mon 12 Oct");
  assert.equal(s.week.endsOn, "2026-10-12");
  assert.equal(s.week.recommendation.choice, "draft");
  assert.equal(s.facts.all.heldOut, 7, "23 qualified, 14 sent, 2 skipped: 7 held out");
});

test("drafts: what's waiting names the message, the count and when it expires", () => {
  const s = flowStatus(churn, [ctl({ drafts: 4, expiresAt: "2026-10-06T05:12:00Z" })], { now: NOW, tz: TZ });
  assert.equal(s.waiting.headline, "4 drafts waiting for your yes");
  assert.equal(s.waiting.detail, "Gone quiet: 4, expires Tue 6 Oct, 4:12 pm");
  assert.match(s.next.detail!, /not approved by Tue 6 Oct, 4:12 pm expires/);
  const all = lifecycleStatus({ flows: [churn], workflows: [ctl({ drafts: 4, expiresAt: "2026-10-06T05:12:00Z" })] } as never, { now: NOW, tz: TZ });
  assert.equal(all.needs.length, 1);
});

test("week one done and clean: switch to auto, with the reason", () => {
  const later = Date.parse("2026-10-12T23:00:00Z");
  const s = flowStatus(churn, [ctl()], { now: later, tz: TZ });
  assert.equal(s.week.ready, true);
  assert.equal(s.week.recommendation.choice, "auto");
  assert.match(s.week.recommendation.reason, /Clean week one: 14 sent, 12 delivered, no spam complaints, 0 unsubscribed\. The outcome is still too few to call\. The 20% holdout keeps measuring/);
  assert.match(s.next.headline, /^Week one is done: switch to auto/);
});

test("week one: a complaint or many unsubscribes says turn off; bounces say keep in draft; few sends say wait", () => {
  const later = Date.parse("2026-10-12T23:00:00Z");
  const withRows = (rows: [string, number][]) => ({ ...churn, delivery: [{ label: "sent", count: 10 }, ...rows.map(([label, count]) => ({ label, count }))] });
  assert.equal(flowStatus(withRows([["delivered", 10], ["complained", 1]]), [ctl()], { now: later, tz: TZ }).week.recommendation.choice, "off");
  assert.equal(flowStatus(withRows([["delivered", 10], ["unsubscribed", 2]]), [ctl()], { now: later, tz: TZ }).week.recommendation.choice, "off");
  assert.equal(flowStatus(withRows([["delivered", 8], ["bounced", 2]]), [ctl()], { now: later, tz: TZ }).week.recommendation.label, "Keep in draft");
  const few = { ...churn, delivery: [{ label: "sent", count: 2 }, { label: "delivered", count: 2 }], daily: days([["2026-10-05", 2, 2, 0]]) };
  assert.equal(flowStatus(few, [ctl()], { now: later, tz: TZ }).week.recommendation.label, "Keep in draft another week");
});

test("a fair gap that hurts says turn off; an always-on flow is never told to switch to auto", () => {
  const later = Date.parse("2026-10-12T23:00:00Z");
  const worse = { ...churn, outcomes: [{ label: "Came back", window: "7 days", emailed: { n: 40, hit: 8 }, holdout: { n: 25, hit: 10 } }] };
  const s = flowStatus(worse, [ctl()], { now: later, tz: TZ });
  assert.equal(s.week.recommendation.choice, "off");
  assert.match(s.week.recommendation.reason, /-20\.0 pts/);
  const always = { ...churn, mode: undefined, holdoutPct: undefined };
  const a = flowStatus(always, [ctl()], { now: later, tz: TZ });
  assert.equal(a.week.recommendation.choice, "keep");
  assert.equal(a.modeWords, "Always on: no draft step");
});

test("outcomes never print a bare 0 or n/a: they say when the first reading lands", () => {
  const f = { firstSent: "2026-10-05", firstEntered: "2026-10-04" };
  assert.equal(readOutcome(churn, churn.outcomes[0], f).text, "No one messaged has reached 7 days yet. First reading Mon 12 Oct.");
  const some = { label: "Came back", window: "7 days", emailed: { n: 8, hit: 3 }, holdout: { n: 0, hit: 0 } };
  assert.match(readOutcome(churn, some, f).text, /No one held out has reached 7 days yet/);
  const small = { ...some, holdout: { n: 3, hit: 1 } };
  assert.match(readOutcome(churn, small, f).text, /Too few to call: each group needs 20/);
  const unfair = { ...churn, holdoutPct: undefined };
  assert.match(readOutcome(unfair, small, f).text, /not messaged\. Not a fair test/);
});

test("quiet and not-started flows say why they are empty", () => {
  const quiet = { ...churn, daily: days([["2026-09-01", 3, 3, 0]]) };
  assert.equal(flowStatus(quiet, [ctl()], { now: NOW, tz: TZ }).working.headline, "Yes, and quiet this week");
  const fresh = { ...churn, daily: [], delivery: [{ label: "sent", count: 0 }] };
  const s = flowStatus(fresh, [ctl()], { now: NOW, tz: TZ });
  assert.equal(s.working.headline, "Not started");
  assert.match(s.working.detail!, /Who qualifies: a paying member quiet for 10 days/);
  assert.match(s.week.period, /Nothing has been sent yet/);
});

test("a day-old or failed read never claims anything; a few minutes old only blocks approving", () => {
  const s = flowStatus(churn, [ctl()], { now: NOW, tz: TZ, stale: true, observedAt: "2026-10-03T00:00:00Z" });
  assert.equal(s.working.headline, "Can't tell right now");
  assert.equal(s.next.headline, "Refresh, then look again");
  assert.equal(flowStatus(churn, [ctl()], { now: NOW, tz: TZ, failed: true, observedAt: new Date(NOW).toISOString() }).working.detail, "The last read failed. Refresh to try again.");
  const recent = flowStatus(churn, [ctl({ drafts: 2 })], { now: NOW, tz: TZ, stale: true, observedAt: new Date(NOW - 20 * 60e3).toISOString() });
  assert.notEqual(recent.working.headline, "Can't tell right now");
  assert.equal(recent.next.headline, "Refresh, then approve");
});

test("explain: plain text, no em or en dashes, every number with its period", () => {
  const text = explainFlow(churn, [ctl()], { now: NOW, tz: TZ, business: "Example" });
  assert.doesNotMatch(text, /[–—]/);
  assert.match(text, /Is it working\? Yes\./);
  assert.match(text, /What's waiting\? Nothing waiting\./);
  assert.match(text, /Qualified since Sun 4 Oct: 23 \(14 sent, 2 skipped, about 7 held out\)/);
  assert.match(text, /Replies: HQ can't see the inbox/);
  assert.match(text, /Recommendation: Keep in draft until Mon 12 Oct/);
});

test("one bounce is not a problem; a few people not sent is not an alarm", () => {
  const one = { ...churn, delivery: [{ label: "sent", count: 6 }, { label: "delivered", count: 5 }, { label: "bounced", count: 1 }] };
  assert.equal(flowStatus(one, [ctl()], { now: NOW, tz: TZ }).working.headline, "Yes");
  const waiting = { ...churn, holdoutPct: undefined, mode: undefined, daily: days([["2026-10-01", 1, 0, 0]]), delivery: [{ label: "sent", count: 0 }] };
  const s = flowStatus(waiting, [ctl()], { now: NOW, tz: TZ });
  assert.equal(s.working.headline, "Nobody due yet");
  assert.match(s.working.detail!, /aren't due yet or aren't eligible; the engine reports no reason/);
  assert.equal(lifecycleStatus({ flows: [waiting], workflows: [] } as never, { now: NOW, tz: TZ }).needs.length, 0);
});

test("a flow that has sent nothing: no zero rows, and no first-reading date in the past", () => {
  const none = { ...churn, mode: undefined, holdoutPct: undefined, daily: days([["2026-09-25", 1, 0, 0]]), delivery: [{ label: "sent", count: 0 }, { label: "delivered", count: 0 }] };
  const s = flowStatus(none, [ctl()], { now: NOW, tz: TZ });
  assert.deepEqual(s.week.rows, []);
  assert.equal(s.week.outcomes[0].readsOn, null);
  assert.match(s.week.outcomes[0].text, /lands 7 days after the first message/);
});
