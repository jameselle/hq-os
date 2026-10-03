import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { acquisitionSpend, applyCosts, loadLedger } from "../lib/ledger-spend";
import type { Metric, ScorecardSnapshot } from "../lib/scorecard";

const LEDGER = `
option "operating_currency" "AUD"
2026-09-01 open Expenses:Advertising
2026-09-10 * "Ads" "Search ads"
  Expenses:Advertising:Search   400.00 AUD
  Liabilities:CreditCard
2026-09-20 * "Creator" "Commission"
  Expenses:Commissions   100 AUD
  Assets:Bank:Operating
2026-09-21 * "Hosting"
  Expenses:Hosting   999.00 AUD
  Assets:Bank:Operating
2026-08-01 * "Too old"
  Expenses:Advertising   5000.00 AUD
  Assets:Bank:Operating
`;
const FROM = new Date("2026-09-04T00:00:00Z");
const TO = new Date("2026-10-02T00:00:00Z");

test("sums advertising and commission sub-accounts in window", () => {
  assert.deepEqual(acquisitionSpend(LEDGER, "AUD", FROM, TO), { total: 500, postings: 2 });
});

test("ignores malformed and foreign-currency postings", () => {
  const messy = LEDGER + `
2026-09-22 * "Foreign"
  Expenses:Advertising   70.00 USD
  Assets:Bank:Operating
2026-09-23 * broken line without a posting amount
  Expenses:Advertising   lots AUD
not-a-date * "x"
  Expenses:Advertising   50 AUD
2026-09-24 * "Refund"
  Expenses:Advertising   -30.00 AUD
  Assets:Bank:Operating
`;
  // A refund lowers spend (it was ignored before 2026-10-02, which overstated cost to win).
  assert.deepEqual(acquisitionSpend(messy, "AUD", FROM, TO), { total: 470, postings: 3 });
  assert.deepEqual(acquisitionSpend("", "AUD", FROM, TO), { total: 0, postings: 0 });
});

const m = (id: Metric["id"], value: number | null, quality: Metric["quality"] = "exact"): Metric => ({ id, value, quality, note: "" });
const snap = (weeks: { metrics: Metric[]; extraSpend?: { label: string; value: number }[] }[]): ScorecardSnapshot => ({
  version: 1,
  observedAt: "2026-10-02T00:00:00.000Z",
  currency: "AUD",
  weeks: weeks.map((w, i) => ({ week: `2026-W${40 - i}`, ...w })),
});
const get = (s: ScorecardSnapshot, id: Metric["id"]) => s.weeks[0].metrics.find((x) => x.id === id)!;

test("payback uses new_mrr per new customer", () => {
  const s = applyCosts(snap([3, 3, 2, 2].map((n) => ({ metrics: [m("new_paying", n), m("new_mrr", n * 25)] }))), 1000);
  assert.equal(get(s, "cost_to_win").value, 100);
  assert.equal(get(s, "cost_to_win").quality, "exact");
  assert.equal(get(s, "payback_months").value, 4);
});

test("extra spend adds to the ledger and approx inputs make approx costs", () => {
  const s = applyCosts(snap([{ metrics: [m("new_paying", 10, "approx"), m("new_mrr", 250)], extraSpend: [{ label: "Commissions", value: 200 }] }]), 800);
  assert.equal(get(s, "cost_to_win").value, 100);
  assert.equal(get(s, "cost_to_win").quality, "approx");
});

test("missing when no spend", () => {
  const s = applyCosts(snap([{ metrics: [m("new_paying", 10), m("new_mrr", 250)] }]), 0);
  assert.equal(get(s, "cost_to_win").quality, "missing");
  assert.equal(get(s, "cost_to_win").value, null);
  assert.equal(get(s, "cost_to_win").note, "No acquisition spend recorded");
  assert.equal(get(s, "payback_months").quality, "missing");
  const none = applyCosts(snap([{ metrics: [m("new_paying", 0), m("new_mrr", 0)] }]), 500);
  assert.equal(get(none, "cost_to_win").note, "No new paying customers in 4 weeks");
});

test("adapter value wins", () => {
  const s = applyCosts(snap([{ metrics: [m("new_paying", 10), m("new_mrr", 250), m("cost_to_win", 42, "approx"), m("payback_months", 2, "approx")] }]), 1000);
  assert.equal(get(s, "cost_to_win").value, 42);
  assert.equal(get(s, "payback_months").value, 2);
});

test("only the four newest weeks count", () => {
  const weeks = Array.from({ length: 6 }, () => ({ metrics: [m("new_paying", 5), m("new_mrr", 50)] }));
  assert.equal(get(applyCosts(snap(weeks), 2000), "cost_to_win").value, 100);
});

test("fewer than four reported weeks makes cost to win approximate", () => {
  const s = applyCosts(snap([{ metrics: [m("new_paying", 10), m("new_mrr", 250)] }]), 1000);
  assert.equal(get(s, "cost_to_win").quality, "approx");
  assert.match(get(s, "cost_to_win").note, /1 of 4 weeks/);
});

test("cost to win says when the ledger holds no ad spend and only extra spend counted", () => {
  const weeks = [4, 3, 2, 1].map((n, i) => ({ metrics: [m("new_paying", n), m("new_mrr", n * 20)], ...(i === 0 ? { extraSpend: [{ label: "Affiliate commissions", value: 50 }] } : {}) }));
  const cost = get(applyCosts(snap(weeks), 0), "cost_to_win");
  assert.equal(cost.value, 5);
  assert.equal(cost.quality, "approx");
  assert.match(cost.note, /Only Affiliate commissions recorded/);
  assert.match(cost.note, /no advertising spend in the ledger/);
});

test("converts priced postings, reads comma amounts and txn headers", () => {
  const ledger = `
2026-09-10 txn "Ads abroad"
  Expenses:Advertising:Meta   100.00 USD @ 1.50 AUD
  Liabilities:CreditCard
2026-09-11 * "Ads total price"
  Expenses:Advertising   100 USD @@ 152.30 AUD
  Liabilities:CreditCard
2026-09-12 * "Ads at cost"
  Expenses:Advertising   10 USD {1.5 AUD}
  Liabilities:CreditCard
2026-09-13 * "Big month"
  Expenses:Advertising   1,000.00 AUD
  Liabilities:CreditCard
2026-09-14 * "No price, wrong currency"
  Expenses:Advertising   70 USD
  Liabilities:CreditCard
`;
  assert.deepEqual(acquisitionSpend(ledger, "AUD", FROM, TO), { total: 150 + 152.3 + 15 + 1000, postings: 4 });
});

test("refunds never take spend below zero", () => {
  const ledger = '2026-09-10 * "Refund"\n  Expenses:Advertising   -80 AUD\n  Assets:Bank\n';
  assert.deepEqual(acquisitionSpend(ledger, "AUD", FROM, TO), { total: 0, postings: 1 });
});

test("loadLedger inlines includes relative to the file, once each", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-ledger-"));
  fs.mkdirSync(path.join(dir, "years"));
  fs.writeFileSync(path.join(dir, "ledger.beancount"), 'include "years/2026.beancount"\ninclude "missing.beancount"\n');
  fs.writeFileSync(path.join(dir, "years", "2026.beancount"), '2026-09-10 * "Ads"\n  Expenses:Advertising   40 AUD\n  Assets:Bank\ninclude "../ledger.beancount"\n');
  const text = loadLedger(path.join(dir, "ledger.beancount"));
  assert.deepEqual(acquisitionSpend(text, "AUD", FROM, TO), { total: 40, postings: 1 });
  assert.equal(loadLedger(path.join(dir, "nope.beancount")), "");
});
