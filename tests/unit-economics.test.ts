// Unit economics with an invented business, Demo Coffee (a coffee subscription club). Every number here is made up.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { analyticsBoard, analyticsProblem, runAnalytics } from "../lib/analytics";
import { buildFindings } from "../lib/ceo";
import { businessDir, ledgerPath, scaffoldBusiness } from "../lib/store";
import {
  booksByMonth, unitAnalytics, unitBrief, unitEconomics, weekThursday, weeksOfMonth, JUMP_MIN, type ScoreWeek, type UnitEconomics,
} from "../lib/unit-economics";
import { evidenceFrom, workflowEvidence, type EvidenceFacts } from "../lib/workflow-evidence";
import { depts, facts, profile, tempData } from "./helpers";

const NOW = new Date("2026-10-06T02:00:00Z");

type Month = { month: string; income: number; lines: Record<string, number> };
const BASE = { "Operating:Beans": 3000, "Operating:Roastery-Rent": 1000, "Advertising:Social-Ads": 300, "Partnerships:Cafe-Partners": 100, "Fees:Payments": 60, "Operating:Packaging": 200 };
const MONTHS: Month[] = [
  { month: "2026-06", income: 2000, lines: BASE },
  { month: "2026-07", income: 2000, lines: BASE },
  { month: "2026-08", income: 2000, lines: BASE },
  { month: "2026-09", income: 2400, lines: { ...BASE, "Fees:Payments": 72, "Operating:Packaging": 900 } },
  { month: "2026-10", income: 150, lines: {} }, // the month in progress: left out
];

function ledger(months: Month[]): string {
  const out = ['option "operating_currency" "AUD"', ""];
  for (const m of months) {
    out.push(`${m.month}-15 * "Club sales" #synced`, `  Income:Sales:Club  -${m.income.toFixed(2)} AUD`, "  Assets:Clearing:Synced", "");
    for (const [acct, amt] of Object.entries(m.lines)) out.push(`${m.month}-28 * "Costs"`, `  Expenses:${acct}  ${amt.toFixed(2)} AUD`, "  Liabilities:Imported:Demo", "");
  }
  out.push('2026-09-20 * "Refund"', "  Income:Sales:Refunds  0.00 AUD", "  Assets:Clearing:Synced", "");
  return out.join("\n");
}

const week = (w: string, v: Record<string, number | null>): ScoreWeek => ({ week: w, metrics: Object.entries(v).map(([id, value]) => ({ id, value })) });
const SEP_WEEKS = (over: Partial<Record<string, Record<string, number | null>>> = {}) => [
  week("2026-W36", { new_paying: 3, paying_churn_rate: 0.02, ...over["2026-W36"] }),
  week("2026-W37", { new_paying: 2, paying_churn_rate: 0.02, ...over["2026-W37"] }),
  week("2026-W38", { new_paying: 4, paying_churn_rate: 0.02, ...over["2026-W38"] }),
  week("2026-W39", { new_paying: 1, paying_churn_rate: 0.02, paying_customers: 80, mrr: 2400, ...over["2026-W39"] }),
];
const ue = (months = MONTHS, weeks = SEP_WEEKS()) => unitEconomics({ currency: "AUD", ledgerText: ledger(months), weeks, now: NOW, timezone: "Australia/Sydney" });
const near = (a: number | null, b: number, eps = 0.01) => assert.ok(a !== null && Math.abs(a - b) <= eps, `${a} is not ${b}`);

test("weeks belong to the month their Thursday falls in", () => {
  assert.deepEqual(weeksOfMonth("2026-09"), ["2026-W36", "2026-W37", "2026-W38", "2026-W39"]);
  assert.deepEqual(weeksOfMonth("2026-10"), ["2026-W40", "2026-W41", "2026-W42", "2026-W43", "2026-W44"]);
  assert.equal(weekThursday("2026-W39"), "2026-09-24");
  assert.equal(weekThursday("2026-W01"), "2026-01-01");
});

test("the ledger splits into revenue, acquisition, direct and every cost line per month", () => {
  const b = booksByMonth(ledger(MONTHS), "AUD").find((m) => m.month === "2026-09")!;
  assert.equal(b.revenue, 2400);
  assert.equal(b.costs, 5372);
  assert.equal(b.acquisition, 400, "advertising and partnerships");
  assert.equal(b.direct, 72, "payment fees");
  assert.equal(b.lines["Expenses:Operating:Packaging"], 900);
});

test("Demo Coffee's numbers for its last closed month", () => {
  const u = ue();
  assert.equal(u.latest!.month, "2026-09", "the month in progress is left out");
  assert.equal(u.bothMonths, 4);
  const v = u.latest!.values;
  assert.equal(v.revenue, 2400);
  assert.equal(v.costs, 5372);
  assert.equal(v.acquisition, 400);
  assert.equal(v.operating, 4972);
  assert.equal(v.burn, 2972);
  near(v.netMargin, (2400 - 5372) / 2400, 0.0001);
  near(v.grossMargin, 0.97, 0.0001);
  assert.equal(v.paying, 80);
  assert.equal(v.newPaying, 10);
  const churn = 1 - Math.pow(0.98, 30 / 7);
  near(v.churn, churn, 0.0001);
  near(v.arpu, 30);
  near(v.costPerCustomer, 67.15);
  near(v.lifetime, 1 / churn, 0.1);
  near(v.ltv, 30 * 0.97 / churn, 0.5);
  near(v.cac, 40);
  near(v.ltvToCac, 30 * 0.97 / churn / 40, 0.02);
  near(v.payback, 40 / (30 * 0.97), 0.1);
  assert.equal(v.breakEven, Math.ceil(5372 / 30));
  assert.deepEqual(u.prior!.months, ["2026-06", "2026-07", "2026-08"]);
  assert.equal(u.prior!.values.costs, 4660);
  assert.equal(u.prior!.values.paying, null, "no paying-customer count kept before September");
  assert.equal(u.topLines[0].label, "Beans");
  assert.equal(u.topLines.find((l) => l.label === "Packaging")!.change, 700);
});

test("what isn't measured stays missing with the reason, never zero", () => {
  const none = ue(MONTHS, []);
  const v = none.latest!.values;
  for (const f of ["paying", "arpu", "costPerCustomer", "ltv", "cac", "ltvToCac", "payback", "breakEven", "churn", "lifetime"] as const) assert.equal(v[f], null, f);
  assert.equal(v.revenue, 2400, "the ledger's numbers still stand");
  assert.match(none.latest!.missing.arpu!, /No paying-customer count/);
  assert.match(none.latest!.missing.churn!, /0 of 4 weeks/);

  const gap = ue(MONTHS, SEP_WEEKS({ "2026-W37": { new_paying: null } }));
  assert.equal(gap.latest!.values.cac, null, "a month with a week of new customers unknown has no cost to win");
  assert.match(gap.latest!.missing.cac!, /known for 3 of 4 weeks/);

  const noFees = ue(MONTHS.map((m) => ({ ...m, lines: Object.fromEntries(Object.entries(m.lines).filter(([k]) => k !== "Fees:Payments")) })));
  assert.equal(noFees.latest!.values.grossMargin, null);
  assert.match(noFees.latest!.missing.grossMargin!, /No cost of sales or payment fees/);
  assert.ok(noFees.latest!.basis.some((b) => /use revenue, not gross profit/.test(b)));

  const empty = unitEconomics({ currency: "AUD", ledgerText: "", weeks: [], now: NOW });
  assert.equal(empty.latest, null);
  assert.ok(unitAnalytics(empty).every((m) => m.value === null && m.quality === "missing"));
});

test("a cost line jumps only when it is over 50% up AND over the floor", () => {
  const u = ue();
  assert.deepEqual(u.jumps.map((j) => j.label), ["Packaging"], "900 against an average of 200");
  assert.equal(u.jumps[0].average, 200);
  assert.equal(u.jumps[0].floor, JUMP_MIN, "5% of 4,660 is under the minimum");
  // 60% up but only 120 more: under the floor.
  const small = ue(MONTHS.map((m) => m.month === "2026-09" ? { ...m, lines: { ...BASE, "Operating:Packaging": 320 } } : m));
  assert.deepEqual(small.jumps, []);
  // 400 more but only 13% up: not a jump either.
  const steady = ue(MONTHS.map((m) => m.month === "2026-09" ? { ...m, lines: { ...BASE, "Operating:Beans": 3400 } } : m));
  assert.deepEqual(steady.jumps, []);
  // A new line over the floor is a jump; with fewer than 3 months before there's nothing to compare.
  const fresh = ue(MONTHS.map((m) => m.month === "2026-09" ? { ...m, lines: { ...BASE, "Operating:Espresso-Machine": 1800 } } : m));
  assert.deepEqual(fresh.jumps.map((j) => j.label), ["Espresso Machine"]);
  assert.deepEqual(ue(MONTHS.slice(2)).jumps, []);
});

test("burn well above revenue for 3 months running is flagged with break-even customers", () => {
  const heavy = MONTHS.map((m) => ({ ...m, lines: { ...m.lines, ...(m.month < "2026-10" ? { "Operating:Wages": 4000 } : {}) } }));
  const u = ue(heavy);
  assert.ok(u.burnStreak);
  assert.deepEqual(u.burnStreak!.months.map((m) => m.month), ["2026-07", "2026-08", "2026-09"]);
  assert.equal(u.burnStreak!.breakEven, Math.ceil(9372 / 30));
  assert.equal(ue().burnStreak, null, "burn under twice revenue isn't flagged");
});

test("the CEO raises the jump and the burn, and a done finding reopens on a newer month", () => {
  const heavy = ue(MONTHS.map((m) => ({ ...m, lines: { ...m.lines, ...(m.month < "2026-10" ? { "Operating:Wages": 4000 } : {}) } })));
  const fin = { synced: true, income90: 4550, costs90: 18000, currency: "AUD", unit: { latest: heavy.latest!.month, jumps: heavy.jumps, burn: heavy.burnStreak } };
  const p = profile({ name: "Demo Coffee", slug: "demo-coffee", model: "subscription" });
  const fs1 = buildFindings(depts(), facts({ finance: fin }), p, {}, NOW);
  const jump = fs1.find((f) => f.id === "cost-jump-expenses-operating-packaging")!;
  assert.equal(jump.severity, "attention");
  assert.equal(jump.dept, "finance");
  assert.match(jump.title, /^Packaging cost \$900 in Sep 2026, up from an average of \$200/);
  assert.match(jump.detail, /350% higher, \$700 more/);
  const burn = fs1.find((f) => f.id === "unit-economics-burn")!;
  assert.match(burn.detail, /needs 313 paying customers \(80 now\)/);
  assert.equal(burn.since, "2026-10-01T00:00:00.000Z");
  for (const f of [jump, burn]) assert.doesNotMatch(`${f.title} ${f.detail} ${f.action}`, /[–—]/);
  // Marked done on 6 October: hidden. October's costs arrive (latest moves on): back.
  const done = { [jump.id]: "2026-10-06T03:00:00.000Z", [burn.id]: "2026-10-06T03:00:00.000Z" };
  assert.equal(buildFindings(depts(), facts({ finance: fin }), p, done, NOW).some((f) => f.id === jump.id || f.id === burn.id), false);
  const next = buildFindings(depts(), facts({ finance: { ...fin, unit: { ...fin.unit, latest: "2026-10" } } }), p, done, NOW);
  assert.ok(next.some((f) => f.id === jump.id) && next.some((f) => f.id === burn.id));
});

test("the analytics numbers pass HQ's validator and the brief reads plainly", () => {
  const u: UnitEconomics = ue();
  const metrics = unitAnalytics(u).map(({ id, value, quality, note, period, breakdown }) => ({ id, value, quality, note, ...(period ? { period } : {}), ...(breakdown ? { breakdown } : {}) }));
  assert.equal(analyticsProblem({ version: 1, observedAt: NOW.toISOString(), currency: "AUD", metrics }, "AUD"), null);
  assert.equal(metrics.find((m) => m.id === "break_even_customers")!.value, 180);
  assert.equal(metrics.find((m) => m.id === "monthly_costs")!.breakdown![0].label, "Beans");
  const partial = unitAnalytics(ue(MONTHS, [week("2026-W33", { paying_churn_rate: 0.02 }), week("2026-W34", { paying_churn_rate: 0.02 }), ...SEP_WEEKS()]));
  assert.match(partial.find((m) => m.id === "customer_lifetime")!.note, /averaged [\d.]+ months \(1 of 3 months\)$/, "an average over fewer months says so");
  const md = unitBrief(u, { business: "Demo Coffee", today: "2026-10-06" });
  assert.match(md, /^# Unit economics: Sep 2026/);
  assert.match(md, /break-even needs 180 paying customers \(80 in Sep 2026\)/);
  assert.match(md, /Packaging cost \$900/);
  assert.match(md, /\| Packaging \| \$900 \| \$200 \| \+\$700 \(\+350%\) \|/);
  assert.doesNotMatch(md, /[–—]/, "no em or en dashes");
});

const none: EvidenceFacts = { demo: false, sites: [], posts: [], studioJobs: { count: 0 }, reviews: { count: 0 }, plans: 0, scorecardWeeks: [], lifecycle: null };
const UE = "Unit economics check";
test("evidence: live with 3 months of income and costs, fresh costs and numbers worked out this month", () => {
  const facts = { bothMonths: 4, latest: "2026-09", thisMonth: "2026-10", computedAt: "2026-10-06T02:00:00.000Z", briefAt: null };
  const live = evidenceFrom({ ...none, unitEconomics: facts })[UE];
  assert.equal(live.state, "live");
  assert.match(live.proof[0], /4 months of income and costs in the ledger, costs to Sep 2026/);
  const two = evidenceFrom({ ...none, unitEconomics: { ...facts, bothMonths: 2 } })[UE];
  assert.equal(two.state, "partial");
  assert.ok(two.proof.some((p) => /1 more month with both income and costs \(needs 3\)/.test(p)));
  const stale = evidenceFrom({ ...none, unitEconomics: { ...facts, latest: "2026-07" } })[UE];
  assert.equal(stale.state, "partial");
  assert.ok(stale.proof.some((p) => /costs stop at Jul 2026/.test(p)));
  const old = evidenceFrom({ ...none, unitEconomics: { ...facts, computedAt: "2026-09-30T02:00:00.000Z" } })[UE];
  assert.equal(old.state, "partial");
  assert.ok(old.proof.some((p) => /not worked out this month/.test(p)));
  assert.equal(evidenceFrom({ ...none, unitEconomics: { ...facts, computedAt: null, briefAt: "2026-10-02T00:00:00.000Z" } })[UE].state, "live", "a saved brief counts");
  assert.equal(evidenceFrom(none)[UE], undefined, "no books, no claim");
});

test("end to end: a refresh works the numbers out, the board shows them and the workflow reads live", async () => {
  tempData();
  const p = profile({ name: "Demo Coffee", slug: "demo-coffee", model: "subscription" });
  scaffoldBusiness(p);
  fs.mkdirSync(path.dirname(ledgerPath(p.slug)), { recursive: true });
  fs.writeFileSync(ledgerPath(p.slug), ledger(MONTHS));
  const weeks = [...SEP_WEEKS()].reverse().map((w) => ({ week: w.week, metrics: w.metrics.map((m) => ({ ...m, quality: "exact", note: "" })) }));
  fs.writeFileSync(path.join(businessDir(p.slug), "scorecard-snapshot.json"), JSON.stringify({ version: 1, observedAt: NOW.toISOString(), currency: "AUD", weeks }));
  assert.equal(workflowEvidence(p.slug, NOW).evidence[UE].state, "partial", "not worked out yet");
  await runAnalytics(p.slug, NOW);
  const ev = workflowEvidence(p.slug, NOW).evidence[UE];
  assert.equal(ev.state, "live");
  const by = Object.fromEntries(analyticsBoard(p.slug, NOW).metrics.map((m) => [m.id, m]));
  assert.equal(by.monthly_costs.value, 5372);
  assert.equal(by.burn.value, 2972);
  assert.equal(by.cost_to_win.value, 40, "the scorecard doesn't measure it here, so HQ's reading shows");
  assert.equal(by.cost_to_win.from, "hq");
  assert.equal(by.break_even_customers.value, 180);
});
