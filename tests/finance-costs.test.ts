import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { buildFindings } from "../lib/ceo";
import { applyOptions, applyAdjustments, costsText, costAccount, costCategory, costsFile, costsProblem, importCosts, importedCosts, monthOf, parseXeroReport, toImport, type CostImport } from "../lib/finance-costs";
import { connectionProblem, refreshCosts, refreshDue, refreshWindow, xeroCostsCell, type RefreshDeps } from "../lib/finance-costs-refresh";
import { moneyByMonth } from "../lib/finance-sync";
import { acquisitionSpend, loadLedger } from "../lib/ledger-spend";
import { initLedger, ledgerPath, scaffoldBusiness } from "../lib/store";
import { depts, facts, profile, tempData } from "./helpers";

// An INVENTED business (Demo Coffee), shaped like Xero's multi-period profit and loss report: header dates newest
// first, carrying the toDate's day ("30 Aug 26", "28 Feb 26"), income, cost of sales, an untitled Gross Profit section,
// operating expenses with totals, and Net Profit.
const HEAD = ["30 Sep 26", "30 Aug 26", "30 Jul 26"];
const row = (label: string, values: string[]) => ({ RowType: "Row", Cells: [{ Value: label, Attributes: [{ Id: "account", Value: "x" }] }, ...values.map((Value) => ({ Value }))] });
const total = (label: string, values: string[]) => ({ RowType: "SummaryRow", Cells: [{ Value: label }, ...values.map((Value) => ({ Value }))] });
const demoReport = () => ({
  ReportID: "ProfitAndLoss", ReportTitles: ["Profit & Loss", "Demo Coffee", "1 September 2026 to 30 September 2026"],
  Rows: [
    { RowType: "Header", Cells: [{ Value: "" }, ...HEAD.map((Value) => ({ Value }))] },
    { RowType: "Section", Title: "Income", Rows: [row("Coffee Sales", ["900.00", "800.00", "700.00"]), total("Total Income", ["900.00", "800.00", "700.00"])] },
    { RowType: "Section", Title: "Less Cost of Sales", Rows: [row("Coffee Beans", ["200.00", "150.00", "0.00"]), row("Hosting & Infrastructure", ["40.00", "40.00", "40.00"]), total("Total Cost of Sales", ["240.00", "190.00", "40.00"])] },
    { RowType: "Section", Title: "", Rows: [row("Gross Profit", ["660.00", "610.00", "660.00"])] },
    { RowType: "Section", Title: "Less Operating Expenses", Rows: [
      row("Advertising & Marketing", ["120.00", "0.00", "60.00"]),
      row("Affiliate & Partnerships", ["30.00", "25.00", "0.00"]),
      row("Software & Subscriptions", ["1,050.50", "45.00", "(5.00)"]),
      row("Travel - National", ["0.00", "0.00", "80.00"]),
      total("Total Operating Expenses", ["1200.50", "70.00", "135.00"]),
    ] },
    { RowType: "Section", Title: "", Rows: [row("Net Profit", ["-540.50", "540.00", "525.00"])] },
  ],
});
/** What the Composio tool returns around the report. */
const toolResponse = () => ({ successful: true, data: { ProviderName: "Demo app", Reports: [demoReport()], Status: "OK" } });

const hasBeanCheck = (() => { for (const b of [path.join(os.homedir(), ".local", "bin", "bean-check"), "bean-check"]) { try { execFileSync(b, ["--version"], { stdio: "ignore" }); return true; } catch (e) { if ((e as { code?: string }).code !== "ENOENT") return true; } } return false; })();

function business(currency = "AUD") {
  tempData();
  const p = profile({ slug: "demo-coffee", name: "Demo Coffee", currency, model: "subscription", createdAt: "2026-10-01T00:00:00.000Z" });
  scaffoldBusiness(p);
  initLedger(p);
  return p;
}
const demoImport = (): CostImport => ({ version: 1, source: "xero", currency: "AUD", months: parseXeroReport(toolResponse()) });

test("months: Xero's header dates, ISO and month names", () => {
  assert.equal(monthOf("30 Sep 26"), "2026-09");
  assert.equal(monthOf("28 Feb 26"), "2026-02");
  assert.equal(monthOf("Sep 2026"), "2026-09");
  assert.equal(monthOf("30 September 2026"), "2026-09");
  assert.equal(monthOf("2026-09-30"), "2026-09");
  assert.equal(monthOf("Total"), null);
});

test("parses a Xero report: expense lines only, oldest month first, totals, income and profit rows ignored", () => {
  for (const raw of [toolResponse(), { Reports: [demoReport()] }, demoReport(), { data: { data: { Reports: [demoReport()] } } }]) {
    const months = parseXeroReport(raw);
    assert.deepEqual(months.map((m) => m.month), ["2026-07", "2026-08", "2026-09"]);
    const sep = months[2];
    assert.deepEqual(sep.lines.map((l) => l.account).sort(), ["Advertising & Marketing", "Affiliate & Partnerships", "Coffee Beans", "Hosting & Infrastructure", "Software & Subscriptions"]);
    assert.equal(sep.lines.find((l) => l.account === "Software & Subscriptions")!.amount, 1050.5, "thousands separators");
    assert.equal(sep.lines.find((l) => l.account === "Coffee Beans")!.section, "Cost of Sales");
    assert.equal(months[0].lines.find((l) => l.account === "Software & Subscriptions")!.amount, -5, "a credit in brackets is negative");
    assert.ok(!months.some((m) => m.lines.some((l) => /sales$|profit|total/i.test(l.account) && l.account !== "Coffee Beans")), "no income, totals or profit rows");
    assert.ok(!months[0].lines.some((l) => l.account === "Coffee Beans"), "zero lines dropped");
  }
  assert.throws(() => parseXeroReport({ hello: 1 }), /isn't a Xero profit and loss report/);
  const quarters = demoReport(); quarters.Rows[0].Cells = [{ Value: "" }, { Value: "Q3" }, { Value: "Q2" }, { Value: "Q1" }];
  assert.throws(() => parseXeroReport(quarters), /timeframe MONTH/);
});

test("mapping: advertising counts toward cost to win; affiliates go to Partnerships, never Commissions", () => {
  assert.equal(costAccount("Advertising & Marketing"), "Expenses:Advertising:Advertising-Marketing");
  assert.equal(costAccount("Affiliate & Partnerships"), "Expenses:Partnerships:Affiliate-Partnerships");
  assert.equal(costAccount("Referral fees"), "Expenses:Partnerships:Referral-fees");
  assert.equal(costAccount("Hosting & Infrastructure"), "Expenses:Operating:Hosting-Infrastructure");
  assert.equal(costAccount("Travel - National"), "Expenses:Operating:Travel-National");
  assert.equal(costAccount("Wages and Salaries"), "Expenses:Operating:Wages-and-Salaries");
  assert.equal(costAccount("401k contributions"), "Expenses:Operating:X-401k-contributions", "a valid Beancount component");
  for (const a of ["Affiliate & Partnerships", "Partner commissions", "Referral fees"]) assert.notEqual(costCategory(a), "Advertising");
  assert.ok(!["Affiliate & Partnerships", "Partner commissions"].some((a) => costAccount(a).startsWith("Expenses:Commissions")));
});

test("share and since: a business's part of a shared company's costs, from a month on", () => {
  const months = applyOptions(demoImport().months, { share: 0.5, since: "2026-08" });
  assert.deepEqual(months.map((m) => m.month), ["2026-08", "2026-09"]);
  assert.equal(months[1].lines.find((l) => l.account === "Software & Subscriptions")!.amount, 525.25);
  assert.equal(months[0].lines.find((l) => l.account === "Affiliate & Partnerships")!.amount, 12.5);
  assert.throws(() => applyOptions([], { share: 0 }), /share/);
  assert.throws(() => applyOptions([], { share: 1.5 }), /share/);
  assert.throws(() => applyOptions([], { since: "2026-9" }), /since/);
});

test("generic input: validated; a Xero report needs its currency named", () => {
  const generic = { version: 1, source: "myob", currency: "AUD", months: [{ month: "2026-09", lines: [{ account: "Rent", section: "Operating Expenses", amount: 500 }] }] };
  assert.equal(costsProblem(generic), null);
  assert.equal(costsProblem({ ...generic, currency: "aud" }), "currency");
  assert.equal(costsProblem({ ...generic, months: [{ month: "2026-13", lines: [] }] }), "months[0].month");
  assert.equal(costsProblem({ ...generic, months: [{ month: "2026-09", lines: [{ account: "Rent", amount: "500" }] }] }), "months[0].lines[0].amount");
  assert.equal(toImport(generic, undefined, undefined).source, "myob");
  assert.throws(() => toImport(toolResponse(), undefined, undefined), /--currency/);
  assert.equal(toImport(toolResponse(), "xero", "AUD").months.length, 3);
});

test("refuses a report in another currency than the ledger, and writes nothing", () => {
  const p = business("USD");
  assert.throws(() => importCosts(p.slug, demoImport()), /reports in AUD but Demo Coffee's ledger is in USD.*doesn't convert/);
  assert.equal(fs.existsSync(path.join(path.dirname(ledgerPath(p.slug)), costsFile("xero"))), false);
  assert.doesNotMatch(fs.readFileSync(ledgerPath(p.slug), "utf8"), /costs-xero/);
});

test("writes the costs file whole, includes it once, opens accounts before the ledger's own opens, and the views read it", () => {
  const p = business();
  const now = new Date("2026-10-06T00:00:00Z");
  importCosts(p.slug, demoImport(), {}, undefined, now);
  const s = importCosts(p.slug, demoImport(), {}, undefined, now); // twice: still one include
  const ledger = fs.readFileSync(ledgerPath(p.slug), "utf8");
  assert.equal(ledger.match(/include "costs-xero\.beancount"/g)!.length, 1);
  const text = fs.readFileSync(s.file, "utf8");
  assert.match(text, /^2026-07-01 open Liabilities:Imported:Xero AUD$/m, "balancing account opened at the first imported month");
  assert.match(text, /^2026-07-01 open Expenses:Partnerships:Affiliate-Partnerships AUD$/m);
  assert.match(text, /^2026-09-30 \* "Xero" "Costs from Xero: Advertising & Marketing" #imported$/m, "dated the month's last day");
  assert.match(text, /^2026-08-31 \* /m, "August ends on the 31st whatever Xero's header said");
  assert.doesNotMatch(text, /Expenses:Commissions/);
  assert.equal(s.months.length, 3);
  assert.deepEqual(s.months.map((m) => m.total), [175, 260, 1440.5]);
  assert.deepEqual(s.totals, { Advertising: 180, Operating: 1640.5, Partnerships: 55 });
  // The scorecard counts the imported advertising, not the affiliates (it already counts in-product commissions).
  const all = loadLedger(ledgerPath(p.slug));
  assert.equal(acquisitionSpend(all, "AUD", new Date("2026-09-01"), new Date("2026-10-01")).total, 120);
  assert.deepEqual(moneyByMonth(all, "AUD").find((m) => m.month === "2026-09")!.byCost, { Advertising: 120, Operating: 1290.5, Partnerships: 30 });
  assert.equal(importedCosts(p.slug, "AUD")[0].source, "xero");
  // Rewritten whole: a narrower import leaves nothing of the earlier one behind.
  importCosts(p.slug, demoImport(), { since: "2026-09" }, undefined, now);
  const narrower = fs.readFileSync(s.file, "utf8");
  assert.doesNotMatch(narrower, /^2026-0[78]-/m);
  assert.match(narrower, /^2026-09-01 open Liabilities:Imported:Xero AUD$/m);
  if (hasBeanCheck) assert.doesNotThrow(() => execFileSync(path.join(os.homedir(), ".local", "bin", "bean-check"), [ledgerPath(p.slug)], { stdio: "pipe" }), "bean-check passes for months before the ledger's opens");
});

test("an account the ledger already opens is reused when it's open in time, refused clearly when it isn't", () => {
  const p = business();
  fs.appendFileSync(ledgerPath(p.slug), "\n2026-01-01 open Expenses:Operating:Hosting-Infrastructure AUD\n");
  const s = importCosts(p.slug, demoImport(), {}, () => null);
  assert.doesNotMatch(fs.readFileSync(s.file, "utf8"), /open Expenses:Operating:Hosting-Infrastructure/);
  fs.appendFileSync(ledgerPath(p.slug), "\n2026-10-01 open Expenses:Advertising:Advertising-Marketing AUD\n");
  assert.throws(() => importCosts(p.slug, demoImport(), {}, () => null), /already opened in the ledger on 2026-10-01.*--since 2026-10/);
});

test("a failed bean-check rolls back: the old costs file and the ledger stay as they were", () => {
  const p = business();
  const first = importCosts(p.slug, demoImport(), { since: "2026-09" }, () => null);
  const before = fs.readFileSync(first.file, "utf8"), ledgerBefore = fs.readFileSync(ledgerPath(p.slug), "utf8");
  assert.throws(() => importCosts(p.slug, demoImport(), {}, () => "Invalid posting"), /didn't check out, so nothing changed: Invalid posting/);
  assert.equal(fs.readFileSync(first.file, "utf8"), before);
  assert.equal(fs.readFileSync(ledgerPath(p.slug), "utf8"), ledgerBefore);
  // With no earlier import, a failed check leaves no file and no include.
  const q = business();
  assert.throws(() => importCosts(q.slug, demoImport(), {}, () => "bad"));
  assert.equal(fs.existsSync(path.join(path.dirname(ledgerPath(q.slug)), "costs-xero.beancount")), false);
  assert.doesNotMatch(fs.readFileSync(ledgerPath(q.slug), "utf8"), /costs-xero/);
});

// ---------------------------------------------------------------- the monthly refresh

const conn = { source: "xero", composioAccount: "xero_demo-account", tenantId: "00000000-0000-4000-8000-000000000001", share: 1 };

test("refresh: connection checks, the 12-month window, and once a month", () => {
  assert.equal(connectionProblem(conn), null);
  assert.equal(connectionProblem({ ...conn, tenantId: "nope" }), "tenantId");
  assert.equal(connectionProblem({ ...conn, share: 2 }), "share");
  assert.equal(connectionProblem({ ...conn, source: "myob" }), "source");
  assert.deepEqual(refreshWindow(new Date("2026-10-06T00:00:00Z"), "Australia/Sydney"), { from: "2026-09-01", to: "2026-09-30", periods: 11 });
  assert.deepEqual(refreshWindow(new Date("2026-03-01T01:00:00Z"), "Australia/Sydney"), { from: "2026-02-01", to: "2026-02-28", periods: 11 });
  const tz = "Australia/Sydney";
  assert.equal(refreshDue({}, new Date("2026-10-01T00:00:00Z"), tz), true, "never refreshed");
  assert.equal(refreshDue({ lastOk: "2026-10-04T00:00:00Z", ok: true }, new Date("2026-10-20T00:00:00Z"), tz), false, "done this month");
  assert.equal(refreshDue({ lastOk: "2026-09-04T00:00:00Z", ok: true }, new Date("2026-10-01T22:00:00Z"), tz), false, "before the 3rd");
  assert.equal(refreshDue({ lastOk: "2026-09-04T00:00:00Z", ok: true }, new Date("2026-10-03T00:00:00Z"), tz), true);
  assert.equal(refreshDue({ lastOk: "2026-09-04T00:00:00Z", ok: false, lastAttempt: "2026-10-03T00:00:00Z" }, new Date("2026-10-03T10:00:00Z"), tz), false, "a failure waits a day");
});

test("refresh cell: read-only Xero tools on the pinned account, payload guarded by its sha256", () => {
  const cell = xeroCostsCell({ run: "r1", account: conn.composioAccount, tenant: conn.tenantId, from: "2026-09-01", to: "2026-09-30", periods: 11 });
  const tools = [...new Set(cell.match(/XERO_[A-Z_]+/g))].sort();
  assert.deepEqual(tools, ["XERO_GET_ORGANISATION", "XERO_GET_PROFIT_LOSS_REPORT"]);
  assert.match(cell, /account=P\["account"\]/);
  assert.match(cell, /if not _OK: raise Exception\("integrity/);
  const own = cell.slice(cell.lastIndexOf("def out(**k):"));
  assert.match(own, /^def out\(\*\*k\):\n  k\["run"\]=P\["run"\]; print\("HQ_RESULT "/, "its own out() replaces the posting one");
  assert.doesNotMatch(own, /open\(/, "prints its result, never writes it to the workbench's files");
});

test("refresh: imports what the workbench read, records failures, and the CEO says so", async () => {
  const p = business();
  fs.writeFileSync(path.join(path.dirname(ledgerPath(p.slug)), "costs-connection.json"), JSON.stringify(conn));
  const now = new Date("2026-10-06T00:00:00Z");
  let cells: string[] = [];
  const ok: RefreshDeps = { now: () => now, workbench: async (c, run) => { cells = c; return { results: [{ run, status: "report", currency: "AUD", rows: demoReport().Rows }] }; } };
  const r = await refreshCosts(p.slug, ok);
  assert.equal(r.status, "imported", r.detail);
  assert.equal(cells.length, 1);
  assert.match(cells[0], /2026-09-30/);
  assert.equal(r.summary!.total, 1875.5);
  assert.equal((await refreshCosts(p.slug, ok)).status, "not-due", "once a month");

  const bad: RefreshDeps = { now: () => new Date("2026-11-04T00:00:00Z"), workbench: async (_c, run) => ({ results: [{ run, status: "report", currency: "USD", rows: demoReport().Rows }] }) };
  const f = await refreshCosts(p.slug, bad);
  assert.equal(f.status, "failed");
  assert.match(f.detail, /USD.*AUD/);
  assert.match(fs.readFileSync(path.join(path.dirname(ledgerPath(p.slug)), "costs-xero.beancount"), "utf8"), /^2026-09-30 /m, "the earlier import stays");
  const findings = buildFindings(depts(), facts({ finance: { synced: true, income90: 100, costs90: 50, currency: "AUD", costs: { connected: true, lastOk: now.toISOString(), failed: true, why: f.detail } } }), p);
  assert.ok(findings.some((x) => x.id === "finance-costs-refresh-failed"));
  assert.ok(!findings.some((x) => x.id === "finance-costs-missing"), "costs are in the books");
  const missing = buildFindings(depts(), facts({ finance: { synced: true, income90: 100, costs90: 0, currency: "AUD" } }), p);
  assert.match(missing.find((x) => x.id === "finance-costs-missing")!.action, /Xero/);
});

test("adjustments take a cost out of its month before any share, and say why in the costs file", () => {
  const adj = [{ month: "2026-09", account: "Software & Subscriptions", amount: 50.5, reason: "Annual plan for another business" }];
  const sw = (ms: { month: string; lines: { account: string; amount: number }[] }[]) => ms.find((m) => m.month === "2026-09")!.lines.find((l) => l.account === "Software & Subscriptions")?.amount;
  assert.equal(sw(applyOptions(demoImport().months, { adjustments: adj })), 1000);
  assert.equal(sw(applyOptions(demoImport().months, { adjustments: adj, share: 0.5 })), 500);
  assert.equal(sw(applyAdjustments(demoImport().months, [{ ...adj[0], amount: 1050.5 }])), undefined, "a line taken out entirely disappears");
  assert.throws(() => applyAdjustments(demoImport().months, [{ ...adj[0], amount: 2000 }]), /more than/);
  assert.throws(() => applyAdjustments(demoImport().months, [{ ...adj[0], reason: " " }]), /reason/);
  assert.deepEqual(applyAdjustments(demoImport().months, [{ ...adj[0], month: "2020-01" }]), applyAdjustments(demoImport().months, []), "a month outside the import changes nothing");
  assert.match(costsText(demoImport(), { observedAt: "2026-10-06T00:00:00Z", adjustments: adj }), /; Taken out of Software & Subscriptions in 2026-09: 50\.50 AUD \(Annual plan for another business\)\./);
});
