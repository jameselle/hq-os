import { test } from "node:test";
import assert from "node:assert/strict";

import {
  appleSummary,
  cardWeekMetrics,
  monthly,
  normaliseSubscription,
  recordsMismatch,
  weekBounds,
} from "../templates/scorecard/billing-sources.mjs";

const T = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const price = (amount: number, interval: string, count = 1) => ({ unit_amount: amount * 100, currency: "aud", recurring: { interval, interval_count: count }, product: "prod_gold" });
const sub = (o: Record<string, unknown>) => ({
  id: "sub_x", status: "active", created: T("2026-08-01T00:00:00Z"), trial_end: null, ended_at: null, canceled_at: null,
  cancel_at_period_end: false, cancel_at: null, discounts: [],
  items: { data: [{ quantity: 1, price: price(75, "month"), current_period_end: T("2026-10-20T00:00:00Z") }] }, ...o,
});
const tierOf = (productId: string) => (productId === "prod_gold" ? "Gold" : productId === "prod_silver" ? "Silver" : null);

test("weekBounds turns an ISO week into its local Monday-to-Monday instants", () => {
  const w = weekBounds("2026-W40", "Australia/Sydney");
  assert.equal(new Date(w.start).toISOString(), "2026-09-27T14:00:00.000Z"); // Mon 28 Sep 00:00 AEST
  assert.equal(new Date(w.end).toISOString(), "2026-10-04T13:00:00.000Z"); // DST starts Sun 4 Oct, so Mon 5 Oct 00:00 is AEDT (+11)
  assert.equal(weekBounds("2026-W41", "Australia/Sydney").start, Date.parse("2026-10-04T13:00:00Z"));
});

test("monthly normalises weekly, yearly and multi-month prices", () => {
  assert.equal(monthly(19, "week", 1), 19 * 52 / 12);
  assert.equal(monthly(799, "year", 1), 799 / 12);
  assert.equal(monthly(150, "month", 3), 50);
});

test("normaliseSubscription keeps only the business's products and applies discounts", () => {
  assert.equal(normaliseSubscription(sub({ items: { data: [{ quantity: 1, price: { ...price(99, "month"), product: "prod_other" } }] } }), tierOf), null);
  const s = normaliseSubscription(sub({ discounts: [{ coupon: { percent_off: 20, duration: "forever" } }] }), tierOf)!;
  assert.equal(s.tier, "Gold");
  assert.equal(s.monthly, 60);
  assert.equal(s.discounted, true);
  const amountOff = normaliseSubscription(sub({ discounts: [{ coupon: { amount_off: 1500, currency: "aud", duration: "repeating" } }] }), tierOf)!;
  assert.equal(amountOff.monthly, 60);
  const trial = normaliseSubscription(sub({ status: "trialing", trial_end: T("2026-10-10T00:00:00Z") }), tierOf)!;
  assert.equal(trial.payingFrom, T("2026-10-10T00:00:00Z"));
});

test("card week metrics: churn, failures and recoveries from Stripe's own history", () => {
  const tz = "Australia/Sydney";
  const w = weekBounds("2026-W39", tz); // Mon 21 Sep -> Mon 28 Sep
  const subs = [
    sub({ id: "a" }),
    sub({ id: "b", status: "canceled", ended_at: Math.floor(w.start / 1000) + 86400 }), // churned in W39
    sub({ id: "c", items: { data: [{ quantity: 1, price: { ...price(20, "month"), product: "prod_silver" } }] } }),
    sub({ id: "d", status: "canceled", created: T("2026-09-15T00:00:00Z"), trial_end: T("2026-09-29T00:00:00Z"), ended_at: T("2026-09-24T00:00:00Z") }), // trial never paid
  ].map((s) => normaliseSubscription(s, tierOf)!);
  const invoices = [
    { subscription: "a", status: "paid", attempt_count: 2, attempted: true, status_transitions: { finalized_at: Math.floor(w.start / 1000) - 13 * 86400, paid_at: Math.floor(w.start / 1000) - 10 * 86400 } }, // failed W37, recovered in 3 days
    { subscription: "c", status: "open", attempt_count: 3, attempted: true, status_transitions: { finalized_at: Math.floor(w.start / 1000) + 3600, paid_at: null } }, // failed in W39, not recovered
    { subscription: "a", status: "paid", attempt_count: 1, attempted: true, status_transitions: { finalized_at: Math.floor(w.start / 1000) + 7200, paid_at: Math.floor(w.start / 1000) + 7300 } }, // fine
  ];
  const m = cardWeekMetrics(subs, invoices, w);
  assert.equal(m.churn.base, 3);
  assert.equal(m.churn.lost, 1);
  assert.deepEqual(m.churn.byTier, [{ label: "Gold", value: 0.5 }, { label: "Silver", value: 0 }]);
  assert.equal(m.failed, 1);
  assert.deepEqual(m.recovery, { cohort: 1, recovered: 1 });
});

test("appleSummary reads the App Store subscription report by tier, with a monthly value", () => {
  const head = ["Subscription Name", "Standard Subscription Duration", "Customer Price", "Customer Currency", "Active Standard Price Subscriptions", "Active Free Trial Introductory Offer Subscriptions", "Billing Retry", "Grace Period"];
  const rows = [
    ["Gold Monthly", "1 Month", "75.00", "AUD", "2", "0", "0", "0"],
    ["Silver Weekly", "7 Days", "5.00", "AUD", "1", "1", "1", "0"],
    ["Gold Monthly", "1 Month", "75.00", "AUD", "1", "0", "0", "0"],
  ];
  const a = appleSummary(head, rows, (name: string) => (/gold/i.test(name) ? "Gold" : /silver/i.test(name) ? "Silver" : null));
  assert.deepEqual(a.byTier, { Gold: 3, Silver: 1 });
  assert.equal(a.trials, 1);
  assert.equal(a.retry, 1);
  assert.ok(Math.abs(a.monthly - (3 * 75 + 5 * 52 / 12)) < 1e-9);
});

test("recordsMismatch counts members on whom billing and the records disagree, per tier", () => {
  assert.deepEqual(recordsMismatch({ Gold: 22, Silver: 5 }, { Gold: 21, Silver: 6 }), {
    value: 2,
    breakdown: [{ label: "Gold: billing 22, records 21", value: 1 }, { label: "Silver: billing 5, records 6", value: 1 }],
  });
  assert.deepEqual(recordsMismatch({ Gold: 2 }, { Gold: 2 }), { value: 0, breakdown: [] });
});

test("applyBilling overrides billing numbers, flags a records mismatch, and passes HQ's validator", async () => {
  const { applyBilling } = await import("../templates/scorecard/billing-sources.mjs");
  const { scorecardProblem } = await import("../lib/scorecard");
  const base = {
    version: 1, observedAt: "2026-10-03T00:00:00.000Z", currency: "AUD",
    weeks: [
      { week: "2026-W40", metrics: [{ id: "paying_customers", value: 2, quality: "exact", note: "", breakdown: [{ label: "Gold", value: 2 }] }, { id: "new_signups", value: 5, quality: "exact", note: "" }] },
      { week: "2026-W39", metrics: [] },
    ],
  };
  const subs = [
    sub({ id: "a", cancel_at_period_end: true }),
    sub({ id: "b", status: "trialing", trial_end: T("2026-10-20T00:00:00Z"), cancel_at_period_end: true }),
  ].map((s) => normaliseSubscription(s, tierOf)!);
  const out = applyBilling(base, {
    stripe: { subs, invoices: [] },
    apple: { day: "2026-10-01", byTier: { Gold: 2 }, trials: 0, retry: 0, grace: 0, monthly: 150 },
    records: { Gold: 2 },
    timeZone: "Australia/Sydney",
    now: Date.parse("2026-10-03T00:00:00Z"),
  });
  assert.equal(scorecardProblem(out, "AUD"), null);
  const get = (id: string) => out.weeks[0].metrics.find((m: { id: string }) => m.id === id);
  assert.equal(get("paying_customers").value, 3);
  assert.match(get("paying_customers").note, /1 more on a free trial/);
  assert.equal(get("mrr").value, 225);
  assert.equal(get("set_to_cancel").value, 1);
  assert.match(get("set_to_cancel").note, /1 trials too/);
  assert.equal(get("records_mismatch").value, 1);
  assert.deepEqual(get("records_mismatch").breakdown, [{ label: "Gold: billing 3, records 2", value: 1 }]);
  assert.equal(get("new_signups").value, 5, "untouched metrics survive");
  assert.equal(out.weeks[1].metrics.find((m: { id: string }) => m.id === "paying_churn_rate").quality, "exact");
  assert.equal(base.weeks[0].metrics.length, 2, "input not mutated");
});

test("billing adapter: runs the business's records command, and builds weeks itself when there is none", async () => {
  const { execFileSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { scorecardProblem } = await import("../lib/scorecard");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-billing-"));
  const adapter = path.resolve(__dirname, "../templates/scorecard/billing-adapter.mjs");
  const base = { version: 1, observedAt: "2026-10-03T00:00:00.000Z", currency: "AUD", weeks: [{ week: "2026-W40", metrics: [{ id: "new_signups", value: 4, quality: "exact", note: "" }] }] };
  fs.writeFileSync(path.join(dir, "records.mjs"), `process.stdin.resume();process.stdin.on('end',()=>console.log(${JSON.stringify(JSON.stringify(base))}))`);
  const run = (config: object) => {
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config));
    return JSON.parse(execFileSync(process.execPath, [adapter, path.join(dir, "config.json")], { input: JSON.stringify({ action: "report", weeks: 3, currency: "AUD", now: "2026-10-03T00:00:00.000Z" }), encoding: "utf8" }));
  };
  const withRecords = run({ timeZone: "Australia/Sydney", records: { command: [process.execPath, path.join(dir, "records.mjs")] } });
  assert.deepEqual(withRecords, base);
  const alone = run({ timeZone: "Australia/Sydney", currency: "AUD" });
  assert.equal(scorecardProblem(alone, "AUD"), null);
  assert.deepEqual(alone.weeks.map((w: { week: string }) => w.week), ["2026-W39", "2026-W38", "2026-W37"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("discounts: newer Stripe shape (source.coupon), and a discount that has ended stops counting", () => {
  const now = Math.floor(Date.now() / 1000);
  const live = normaliseSubscription(sub({ discounts: [{ end: now + 86400, source: { type: "coupon", coupon: { percent_off: 50, duration: "repeating" } } }] }), tierOf)!;
  assert.equal(live.monthly, 37.5);
  assert.equal(live.discountsKnown, true);
  const ended = normaliseSubscription(sub({ discounts: [{ end: now - 86400, source: { type: "coupon", coupon: { percent_off: 50 } } }] }), tierOf)!;
  assert.equal(ended.monthly, 75);
  const unexpanded = normaliseSubscription(sub({ discounts: [{ end: null, source: { type: "coupon", coupon: "coupon_id" } }] }), tierOf)!;
  assert.equal(unexpanded.discountsKnown, false);
});

test("billing adapter: listed test subscriptions are ignored entirely", async () => {
  const { stripeKeep } = await import("../templates/scorecard/billing-sources.mjs");
  const keep = stripeKeep({ ignore: ["sub_test"] });
  assert.equal(keep({ id: "sub_test" }), false);
  assert.equal(keep({ id: "sub_real" }), true);
  assert.equal(stripeKeep({})({ id: "sub_any" }), true);
});

test("a Stripe-only business: billing numbers are exact, notes don't mention the App Store, new customers come from Stripe", async () => {
  const { applyBilling, cardWeekMetrics } = await import("../templates/scorecard/billing-sources.mjs");
  const w = weekBounds("2026-W39", "Australia/Sydney");
  const subs = [
    sub({ id: "old" }),
    sub({ id: "new1", created: Math.floor(w.start / 1000) + 3600 }),
    sub({ id: "trialNew", status: "trialing", created: Math.floor(w.start / 1000) + 7200, trial_end: Math.floor(w.end / 1000) + 86400 }), // pays next week
  ].map((s) => normaliseSubscription(s, tierOf)!);
  const m = cardWeekMetrics(subs, [], w);
  assert.equal(m.newPaying, 1);
  assert.equal(m.newMonthly, 75);
  const base = { version: 1, observedAt: "2026-10-03T00:00:00.000Z", currency: "AUD", weeks: [{ week: "2026-W39", metrics: [] }] };
  const out = applyBilling(base, { stripe: { subs, invoices: [] }, apple: null, missing: [], records: null, timeZone: "Australia/Sydney", now: Date.parse("2026-10-03T00:00:00Z") });
  const get = (id: string) => out.weeks[0].metrics.find((x: { id: string }) => x.id === id);
  assert.equal(get("paying_customers").quality, "exact");
  assert.equal(get("mrr").quality, "exact");
  assert.doesNotMatch(get("mrr").note, /App Store/);
  assert.equal(get("new_paying").value, 1);
  assert.equal(get("new_paying").quality, "exact");
  assert.equal(get("new_mrr").value, 75);
  const failed = applyBilling(base, { stripe: { subs, invoices: [] }, apple: null, missing: ["app store"], records: null, timeZone: "Australia/Sydney", now: Date.parse("2026-10-03T00:00:00Z") });
  const fget = (id: string) => failed.weeks[0].metrics.find((x: { id: string }) => x.id === id);
  assert.equal(fget("paying_customers").quality, "approx");
  assert.match(fget("paying_customers").note, /app store unavailable/i);
  const withRecords = applyBilling({ ...base, weeks: [{ week: "2026-W39", metrics: [{ id: "new_paying", value: 9, quality: "approx", note: "records" }] }] },
    { stripe: { subs, invoices: [] }, apple: null, missing: [], records: null, timeZone: "Australia/Sydney" });
  assert.equal(withRecords.weeks[0].metrics.find((x: { id: string }) => x.id === "new_paying").value, 9, "the business's own records are not overridden");
});
