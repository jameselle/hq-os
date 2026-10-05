import assert from "node:assert/strict";
import { test } from "node:test";

import type { LifecycleFlow, LifecycleSnapshot, LifecycleWorkflow } from "../lib/lifecycle";
import { validFlow } from "../lib/lifecycle";
import {
  controlsFor, countOf, dayTotals, flowSummary, flowsFor, funnel, headlineOutcome, lift, metricHistory, outcomeRows, pct, pts,
  recentDays, sentLast30, summaryTotals, windowDays,
} from "../lib/workflow-detail";
import { WORKFLOWS, workflowBySlug, workflowSlug } from "../lib/workflows";

const days = (n: number, start = "2026-08-01"): LifecycleFlow["daily"] =>
  Array.from({ length: n }, (_, i) => ({ day: new Date(Date.parse(start) + i * 86400e3).toISOString().slice(0, 10), entered: 10, sent: 8, skipped: 2 }));

const flow = (over: Partial<LifecycleFlow> = {}): LifecycleFlow => ({
  id: "nudge", label: "Second-day nudge", serves: "Onboarding to first value", mode: "draft", holdoutPct: 10, channel: "email",
  trigger: "Signed up yesterday and has not finished setup.",
  daily: days(40),
  delivery: [{ label: "sent", count: 200 }, { label: "delivered", count: 190 }, { label: "opened", count: 95 }, { label: "clicked", count: 30 },
    { label: "bounced", count: 6 }, { label: "complained", count: 1 }, { label: "unsubscribed", count: 3 }],
  skips: [{ label: "already active", count: 40 }],
  outcomes: [
    { label: "Finished setup", window: "7 days", emailed: { n: 180, hit: 72 }, holdout: { n: 20, hit: 5 } },
    { label: "Finished setup", window: "1 day", emailed: { n: 180, hit: 36 }, holdout: { n: 20, hit: 2 } },
    { label: "Came back", window: "30 days", emailed: { n: 300, hit: 120 }, holdout: null },
  ],
  messages: [{ id: "nudge-1", label: "Nudge", subject: "One step left", html: "<p>Hi</p>" }],
  ...over,
});

const control = (over: Partial<LifecycleWorkflow> = {}): LifecycleWorkflow => ({ id: "nudge-1", label: "Nudge", delayHours: 24, enabled: true, audience: "New sign-ups", drafts: 4, ...over });

const snap = (flows: LifecycleFlow[]): LifecycleSnapshot => ({ version: 1, observedAt: null, paused: false, collectionFailed: false, stages: [], delivery: [], history: [], workflows: [], accounts: [], flows });

test("workflowSlug: kebab case, unique per workflow, and reversible", () => {
  assert.equal(workflowSlug("Onboarding to first value"), "onboarding-to-first-value");
  assert.equal(workflowSlug("Win-back when the reason is fixed"), "win-back-when-the-reason-is-fixed");
  assert.equal(workflowSlug("  Teams and B2B! "), "teams-and-b2b");
  const slugs = WORKFLOWS.map((w) => workflowSlug(w.title));
  assert.equal(new Set(slugs).size, slugs.length);
  for (const w of WORKFLOWS) assert.equal(workflowBySlug(workflowSlug(w.title)), w);
  assert.equal(workflowBySlug("no-such-workflow"), null);
});

test("the fixture is a valid flow", () => assert.ok(validFlow(flow())));

test("flowsFor: only flows serving that title, none without a snapshot", () => {
  const other = flow({ id: "other", serves: "Daily habit" });
  assert.deepEqual(flowsFor("Onboarding to first value", snap([flow(), other])).map((f) => f.id), ["nudge"]);
  assert.deepEqual(flowsFor("Daily habit", snap([flow({ serves: undefined })])), []);
  assert.deepEqual(flowsFor("Daily habit", null), []);
});

test("recentDays sorts oldest first and keeps the newest; totals add up", () => {
  const shuffled = flow({ daily: [...days(70)].reverse() });
  const recent = recentDays(shuffled, 60);
  assert.equal(recent.length, 60);
  assert.equal(recent[0].day, "2026-08-11");
  assert.equal(recent.at(-1)!.day, "2026-10-09");
  assert.deepEqual(dayTotals(recent), { entered: 600, sent: 480, skipped: 120 });
  assert.deepEqual(dayTotals([]), { entered: 0, sent: 0, skipped: 0 });
});

test("sentLast30 counts the 30 days ending on the newest day", () => {
  assert.equal(sentLast30(flow()), 30 * 8);
  assert.equal(sentLast30(flow({ daily: days(5) })), 40);
  assert.equal(sentLast30(flow({ daily: [] })), 0);
});

test("funnel: each row as a share of sent; without a sent row the largest is the base", () => {
  const f = funnel(flow());
  assert.equal(f[0].share, 1);
  assert.equal(f[1].share, 0.95);
  assert.equal(f.find((r) => r.label === "clicked")!.share, 0.15);
  assert.deepEqual(funnel(flow({ delivery: [{ label: "Delivered", count: 50 }, { label: "Opened", count: 25 }] })).map((r) => r.share), [1, 0.5]);
  assert.deepEqual(funnel(flow({ delivery: [{ label: "sent", count: 0 }] })).map((r) => r.share), [null]);
  assert.equal(countOf([{ label: " Sent ", count: 3 }], "sent"), 3);
});

test("lift: percentage points, null without a holdout, too few to call under 20", () => {
  assert.deepEqual(lift({ n: 180, hit: 72 }, { n: 20, hit: 5 }), { pts: 15, enough: true });
  assert.deepEqual(lift({ n: 100, hit: 30 }, { n: 19, hit: 1 }), { pts: 24.7, enough: false });
  assert.deepEqual(lift({ n: 10, hit: 3 }, { n: 100, hit: 30 }), { pts: 0, enough: false });
  assert.equal(lift({ n: 100, hit: 30 }, null), null);
  assert.equal(lift({ n: 100, hit: 30 }, undefined), null);
  assert.equal(lift({ n: 0, hit: 0 }, { n: 50, hit: 5 }), null);
  assert.deepEqual(lift({ n: 50, hit: 5 }, { n: 50, hit: 10 }), { pts: -10, enough: true });
});

test("outcomeRows groups by window, shortest first, holdout optional", () => {
  const g = outcomeRows(flow());
  assert.deepEqual(g.map((x) => x.window), ["1 day", "7 days", "30 days"]);
  assert.equal(g[0].rows[0].emailed.rate, 0.2);
  assert.equal(g[0].rows[0].holdout!.rate, 0.1);
  assert.equal(g[2].rows[0].holdout, null);
  assert.equal(g[2].rows[0].lift, null);
  const odd = outcomeRows(flow({ outcomes: [
    { label: "a", window: "next renewal", emailed: { n: 1, hit: 0 } },
    { label: "b", window: "2 weeks", emailed: { n: 1, hit: 1 } },
    { label: "c", window: "48 hours", emailed: { n: 0, hit: 0 } },
  ] }));
  assert.deepEqual(odd.map((x) => x.window), ["48 hours", "2 weeks", "next renewal"]);
  assert.equal(odd[0].rows[0].emailed.rate, null);
  assert.equal(windowDays("1 day"), 1);
  assert.equal(windowDays("30 days"), 30);
  assert.equal(windowDays("whenever"), null);
});

test("headlineOutcome: the largest emailed group, first on a tie", () => {
  assert.equal(headlineOutcome(flow())!.label, "Came back");
  const tie = flow({ outcomes: [{ label: "x", window: "1 day", emailed: { n: 5, hit: 1 } }, { label: "y", window: "7 days", emailed: { n: 5, hit: 2 } }] });
  assert.equal(headlineOutcome(tie)!.label, "x");
  assert.equal(headlineOutcome(flow({ outcomes: [] })), null);
});

test("controlsFor matches message ids and the flow's own id", () => {
  const ws = [control(), control({ id: "nudge", drafts: 1 }), control({ id: "unrelated", drafts: 9 })];
  assert.deepEqual(controlsFor(flow(), ws).map((w) => w.id), ["nudge-1", "nudge"]);
  assert.deepEqual(controlsFor(flow(), undefined), []);
});

test("flowSummary and summaryTotals: what a lifecycle card shows", () => {
  const s = flowSummary(flow(), [control(), control({ id: "unrelated", drafts: 9 })]);
  assert.equal(s.sent30, 240);
  assert.equal(s.deliveredShare, 0.95);
  assert.equal(s.clicked, 30);
  assert.equal(s.unsubscribed, 3);
  assert.equal(s.bouncedOrComplained, 7);
  assert.equal(s.drafts, 4);
  assert.equal(s.mode, "draft");
  assert.equal(s.headline!.label, "Came back");
  const bare = flowSummary(flow({ id: "b", mode: undefined, delivery: [{ label: "sent", count: 10 }], outcomes: [], messages: [] }));
  assert.equal(bare.deliveredShare, null);
  assert.equal(bare.mode, null);
  assert.equal(bare.drafts, 0);
  assert.equal(bare.headline, null);
  const t = summaryTotals([s, bare]);
  assert.equal(t.flows, 2);
  assert.equal(t.sent30, 480);
  assert.equal(t.drafts, 4);
  assert.equal(t.deliveredShare, 0.95); // only flows that report delivered count
  assert.equal(summaryTotals([]).deliveredShare, null);
});

test("metricHistory merges kept weeks with the snapshot's, oldest first, newest kept", () => {
  const m = (value: number | null) => [{ id: "activation_rate" as const, value, quality: "exact" as const, note: "" }];
  const history = [{ week: "2026-W38", metrics: m(0.3) }, { week: "2026-W39", metrics: m(0.31) }];
  const weeks = [{ week: "2026-W40", metrics: m(0.35) }, { week: "2026-W39", metrics: m(0.32) }];
  assert.deepEqual(metricHistory(history, weeks, "activation_rate"), [{ week: "2026-W38", value: 0.3 }, { week: "2026-W39", value: 0.32 }, { week: "2026-W40", value: 0.35 }]);
  assert.deepEqual(metricHistory(history, weeks, "activation_rate", 2).map((x) => x.week), ["2026-W39", "2026-W40"]);
  assert.deepEqual(metricHistory(history, [], "mrr").map((x) => x.value), [null, null]);
});

test("pct and pts format plainly", () => {
  assert.equal(pct(0.4123), "41.2%");
  assert.equal(pct(null), "n/a");
  assert.equal(pts({ pts: 3.44, enough: true }), "+3.4 pts");
  assert.equal(pts({ pts: -1, enough: true }), "-1.0 pts");
  assert.equal(pts({ pts: 0, enough: false }), "0.0 pts");
});
