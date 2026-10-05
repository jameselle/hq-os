import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { accountFor, financeProblem, moneyByMonth, syncFinance, syncedText, SYNCED, type FinanceSnapshot } from "../lib/finance-sync";
import { acquisitionSpend, loadLedger } from "../lib/ledger-spend";
import { businessDir, initLedger, ledgerPath, scaffoldBusiness } from "../lib/store";
import { profile, tempData } from "./helpers";

const snap = (over: Partial<FinanceSnapshot> = {}): FinanceSnapshot => ({ version: 1, observedAt: "2026-10-05T00:00:00Z", currency: "AUD",
  entries: [
    { date: "2026-09-02", kind: "income", label: "Gold", amount: 75, currency: "AUD" },
    { date: "2026-09-02", kind: "income", label: "Silver weekly", amount: 20, currency: "AUD" },
    { date: "2026-09-10", kind: "refund", label: "Gold", amount: 5, currency: "AUD" },
    { date: "2026-10-01", kind: "advertising", label: "Meta", amount: 30, currency: "AUD" },
  ], ...over });

test("validator: daily totals only, never a person", () => {
  assert.equal(financeProblem(snap(), "AUD"), null);
  assert.equal(financeProblem(snap(), "USD"), "currency");
  assert.equal(financeProblem(snap({ entries: [{ date: "2026-9-2", kind: "income", label: "Gold", amount: 1, currency: "AUD" }] }), "AUD"), "entries[0].date");
  assert.equal(financeProblem(snap({ entries: [{ date: "2026-09-02", kind: "income", label: "cus_" + "ABCdef12345678", amount: 1, currency: "AUD" }] }), "AUD"), "entries[0].label");
  assert.equal(financeProblem(snap({ entries: [{ date: "2026-09-02", kind: "gift" as never, label: "x", amount: 1, currency: "AUD" }] }), "AUD"), "entries[0].kind");
  assert.equal(financeProblem(snap({ entries: [{ date: "2026-09-02", kind: "income", label: "x", amount: -1, currency: "AUD" }] }), "AUD"), "entries[0].amount");
});

test("accounts are sub-accounts, so they never clash with the starter ledger's opens", () => {
  assert.equal(accountFor({ kind: "income", label: "Silver weekly" }), "Income:Sales:Silver-weekly");
  assert.equal(accountFor({ kind: "refund", label: "Gold" }), "Income:Sales:Refunds");
  assert.equal(accountFor({ kind: "advertising", label: "meta ads" }), "Expenses:Advertising:Meta-ads");
  const text = syncedText(snap(), "test");
  assert.match(text, /^2026-09-02 open Income:Sales:Gold$/m);
  assert.match(text, /REWRITTEN ON EVERY SYNC/);
});

test("sync writes, includes once, passes bean-check, and the scorecard and money view read it", async () => {
  tempData();
  const p = profile({ model: "subscription" });
  scaffoldBusiness(p);
  initLedger(p);
  const dir = businessDir(p.slug);
  const adapter = path.join(dir, "fin.mjs");
  fs.writeFileSync(adapter, `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(${JSON.stringify(JSON.stringify(snap()))}));`);
  fs.writeFileSync(path.join(dir, "finance-connection.json"), JSON.stringify({ command: [process.execPath, adapter] }));
  const r = await syncFinance(p.slug);
  assert.equal(r.entries, 4);
  await syncFinance(p.slug); // twice: still one include, file rewritten whole
  const ledger = fs.readFileSync(ledgerPath(p.slug), "utf8");
  assert.equal(ledger.match(new RegExp(`include "${SYNCED}"`, "g"))!.length, 1);
  const text = loadLedger(ledgerPath(p.slug));
  const months = moneyByMonth(text, "AUD");
  assert.deepEqual(months.map((m) => [m.month, m.income, m.refunds, m.costs]), [["2026-09", 95, 5, 0], ["2026-10", 0, 0, 30]]);
  assert.equal(acquisitionSpend(text, "AUD", new Date("2026-09-15"), new Date("2026-10-15")).total, 30, "synced ad spend counts toward cost to win");
});

test("a snapshot that would break the ledger leaves the old one in place", async () => {
  tempData();
  const p = profile({ model: "subscription" });
  scaffoldBusiness(p);
  initLedger(p);
  const dir = businessDir(p.slug);
  fs.writeFileSync(path.join(dir, "finance-connection.json"), JSON.stringify({ command: [process.execPath, "-e", "process.stdout.write(JSON.stringify({version:1,observedAt:'2026-10-05T00:00:00Z',currency:'USD',entries:[]}))"] }));
  await assert.rejects(syncFinance(p.slug), /currency/);
  assert.equal(fs.existsSync(path.join(path.dirname(ledgerPath(p.slug)), SYNCED)), false);
});
