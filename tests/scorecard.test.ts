import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { METRICS, rebuildScorecard, runScorecard, scorecardState, validScorecard, type ScorecardSnapshot } from "../lib/scorecard";
import { profile, tempData } from "./helpers";

const week = (w: string, extra: object = {}) => ({
  week: w,
  metrics: [
    { id: "paying_customers", value: 120, quality: "exact", note: "", breakdown: [{ label: "Top tier", value: 20 }, { label: "Base tier", value: 100 }] },
    { id: "mrr", value: 2400.5, quality: "approx", note: "List prices; discounts not priced in" },
    { id: "nrr", value: null, quality: "missing", note: "Needs four weeks of history" },
  ],
  ...extra,
});
const snap = (over: object = {}): ScorecardSnapshot =>
  ({ version: 1, observedAt: "2026-10-02T00:00:00.000Z", currency: "AUD", weeks: [week("2026-W40"), week("2026-W39")], ...over }) as ScorecardSnapshot;

test("accepts a well-formed snapshot", () => {
  assert.equal(validScorecard(snap(), "AUD"), true);
  assert.equal(Object.keys(METRICS).length, 17);
});

test("rejects personal-data shapes", () => {
  for (const bad of ["mail a@b.co", "call +61 400 000 000", "id 3f2b8c1e-9a4d-4e2f-8b6a-1c2d3e4f5a6b", "tok 0123456789abcdef0123456789abcdef01234567", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc", "see https://x.io/?u=1"]) {
    const s = snap({ weeks: [week("2026-W40", {}), week("2026-W39")] });
    (s.weeks[0].metrics[1] as { note: string }).note = bad;
    assert.equal(validScorecard(s, "AUD"), false, `note: ${bad}`);
    const t = snap();
    t.weeks[0].metrics[0].breakdown![0].label = bad;
    assert.equal(validScorecard(t, "AUD"), false, `label: ${bad}`);
  }
});

test("rejects unknown metric ids, wrong currency, quality/value mismatch, oversize arrays", () => {
  const unknown = snap();
  (unknown.weeks[0].metrics[0] as { id: string }).id = "emails";
  assert.equal(validScorecard(unknown, "AUD"), false);
  assert.equal(validScorecard(snap(), "USD"), false);
  const missingWithValue = snap();
  missingWithValue.weeks[0].metrics[2].value = 1;
  assert.equal(validScorecard(missingWithValue, "AUD"), false);
  const exactNull = snap();
  exactNull.weeks[0].metrics[0].value = null;
  assert.equal(validScorecard(exactNull, "AUD"), false);
  const weeks = Array.from({ length: 27 }, (_, i) => week(`2026-W${String(40 - i).padStart(2, "0")}`));
  assert.equal(validScorecard(snap({ weeks }), "AUD"), false);
  const rows = snap();
  rows.weeks[0].metrics[0].breakdown = Array.from({ length: 21 }, (_, i) => ({ label: `Row ${i}`, value: i }));
  assert.equal(validScorecard(rows, "AUD"), false);
  const spend = snap({ weeks: [week("2026-W40", { extraSpend: Array.from({ length: 11 }, (_, i) => ({ label: `S${i}`, value: 1 })) })] });
  assert.equal(validScorecard(spend, "AUD"), false);
  const negativeCount = snap();
  negativeCount.weeks[0].metrics[0].value = -1;
  assert.equal(validScorecard(negativeCount, "AUD"), false);
});

test("rejects duplicate or unordered weeks", () => {
  assert.equal(validScorecard(snap({ weeks: [week("2026-W40"), week("2026-W40")] }), "AUD"), false);
  assert.equal(validScorecard(snap({ weeks: [week("2026-W39"), week("2026-W40")] }), "AUD"), false);
  assert.equal(validScorecard(snap({ weeks: [week("2026-40")] }), "AUD"), false);
});

test("rebuild drops extra fields", () => {
  const s = snap();
  (s.weeks[0].metrics[0] as Record<string, unknown>).email = "x@y.co";
  (s as Record<string, unknown>).accounts = [{ id: 1 }];
  const out = JSON.stringify(rebuildScorecard(s));
  assert.equal(out.includes("x@y.co"), false);
  assert.equal(out.includes("accounts"), false);
});

// ---- running adapters against a temp HQ_DATA

function setup(over = {}) {
  const dir = tempData();
  const p = profile({ slug: "acme-co", currency: "AUD", ...over });
  const biz = path.join(dir, "businesses", p.slug);
  fs.mkdirSync(biz, { recursive: true });
  fs.writeFileSync(path.join(biz, "profile.json"), JSON.stringify(p));
  return { dir, biz };
}
const printer = (value: unknown) => [process.execPath, "-e", `process.stdin.resume();process.stdin.on('end',()=>console.log(${JSON.stringify(JSON.stringify(value))}))`];
const connect = (biz: string, command: string[]) => fs.writeFileSync(path.join(biz, "scorecard-connection.json"), JSON.stringify({ command, readOnly: true }));
const NOW = new Date("2026-10-02T06:00:00.000Z");

test("run writes 0600 snapshot and one history file per ISO week", async () => {
  const { biz } = setup();
  connect(biz, printer(snap()));
  const state = await runScorecard("acme-co", NOW);
  assert.equal(state.connected, true);
  assert.equal(state.failed, false);
  assert.equal(state.stale, false);
  const file = path.join(biz, "scorecard-snapshot.json");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const hist = path.join(biz, "scorecard", "2026-W40.json");
  assert.equal(fs.existsSync(hist), true);
  assert.equal(fs.statSync(hist).mode & 0o777, 0o600);
  assert.equal(state.history.at(-1)?.week, "2026-W40");
});

test("history prunes beyond 26 weeks", async () => {
  const { biz } = setup();
  fs.mkdirSync(path.join(biz, "scorecard"));
  for (let i = 1; i <= 27; i++) fs.writeFileSync(path.join(biz, "scorecard", `2026-W${String(i).padStart(2, "0")}.json`), JSON.stringify(snap({ weeks: [week(`2026-W${String(i).padStart(2, "0")}`)] })));
  connect(biz, printer(snap()));
  await runScorecard("acme-co", NOW);
  const files = fs.readdirSync(path.join(biz, "scorecard"));
  assert.equal(files.length, 26);
  assert.equal(files.includes("2026-W40.json"), true);
  assert.equal(files.includes("2026-W01.json"), false);
});

test("failed run keeps previous snapshot", async () => {
  const { biz } = setup();
  connect(biz, printer(snap()));
  await runScorecard("acme-co", NOW);
  const before = fs.readFileSync(path.join(biz, "scorecard-snapshot.json"), "utf8");
  connect(biz, [process.execPath, "-e", "process.exit(3)"]);
  await assert.rejects(runScorecard("acme-co", NOW));
  const state = scorecardState("acme-co", NOW);
  assert.equal(state.failed, true);
  assert.ok(state.failedAt);
  assert.equal(fs.readFileSync(path.join(biz, "scorecard-snapshot.json"), "utf8"), before);
  connect(biz, printer({ junk: true }));
  await assert.rejects(runScorecard("acme-co", NOW));
  connect(biz, printer(snap()));
  assert.equal((await runScorecard("acme-co", NOW)).failed, false);
});

test("stale after 36 hours", async () => {
  const { biz } = setup();
  connect(biz, printer(snap({ observedAt: new Date(NOW.getTime() - 37 * 3600e3).toISOString() })));
  assert.equal((await runScorecard("acme-co", NOW)).stale, true);
  assert.equal(scorecardState("acme-co", new Date(NOW.getTime() + 3600e3)).stale, true);
  connect(biz, printer(snap({ observedAt: new Date(NOW.getTime() - 35 * 3600e3).toISOString() })));
  assert.equal((await runScorecard("acme-co", NOW)).stale, false);
});

test("unconnected business has no numbers; unknown or traversal slug throws", () => {
  setup();
  const state = scorecardState("acme-co", NOW);
  assert.equal(state.connected, false);
  assert.equal(state.snapshot, null);
  assert.throws(() => scorecardState("../acme-co"));
  assert.throws(() => scorecardState("nobody"));
});

test("run adds cost to win from the business's ledger", async () => {
  const { biz } = setup();
  fs.mkdirSync(path.join(biz, "finance"));
  fs.writeFileSync(path.join(biz, "finance", "ledger.beancount"), '2026-09-25 * "Ads"\n  Expenses:Advertising   300.00 AUD\n  Assets:Bank\n');
  const s = snap();
  s.weeks[0].metrics.push({ id: "new_paying", value: 3, quality: "exact", note: "" }, { id: "new_mrr", value: 60, quality: "exact", note: "" });
  connect(biz, printer(s));
  const state = await runScorecard("acme-co", NOW);
  const cost = state.snapshot!.weeks[0].metrics.find((x) => x.id === "cost_to_win")!;
  assert.equal(cost.value, 100);
  assert.equal(state.snapshot!.weeks[0].metrics.find((x) => x.id === "payback_months")!.value, 5);
});

test("demo adapter output validates and is deterministic", async () => {
  const { execFileSync } = await import("node:child_process");
  const { demoAdapter } = await import("../lib/scorecard");
  const run = () => execFileSync(process.execPath, [demoAdapter()], { input: JSON.stringify({ action: "report", weeks: 12, currency: "NZD", now: NOW.toISOString() }), encoding: "utf8" });
  const out = JSON.parse(run());
  assert.equal(validScorecard(out, "NZD"), true);
  assert.equal(out.weeks.length, 12);
  assert.equal(out.weeks[0].week, "2026-W40");
  assert.equal(run(), JSON.stringify(out) + "\n");
  const ids = new Set(out.weeks[0].metrics.map((x: { id: string }) => x.id));
  for (const id of Object.keys(METRICS)) if (id !== "cost_to_win" && id !== "payback_months") assert.ok(ids.has(id), id);
  assert.ok(out.weeks[0].extraSpend?.length);
  assert.equal(out.weeks.at(-1).metrics.find((x: { id: string }) => x.id === "nrr").quality, "missing");
});

test("a demo business with no connection runs the demo adapter", async () => {
  setup({ demo: true });
  const state = await runScorecard("acme-co");
  assert.equal(state.demo, true);
  assert.equal(state.connected, false);
  assert.ok(state.snapshot!.weeks[0].metrics.find((x) => x.id === "cost_to_win")!.value! > 0);
});

// ---- final review fixes

test("observedAt must be a plain ISO timestamp and is rebuilt canonical", () => {
  assert.equal(validScorecard(snap({ observedAt: "Fri Oct 02 2026 (Jane Smith jane@x.co, 12 Main St)" }), "AUD"), false);
  assert.equal(validScorecard(snap({ observedAt: "2026-10-02T06:00:00+10:00" }), "AUD"), true);
  assert.equal(rebuildScorecard(snap({ observedAt: "2026-10-02T06:00:00+10:00" })).observedAt, "2026-10-01T20:00:00.000Z");
});

test("unseparated phone numbers and account ids are rejected; decimals, years and dates are not", () => {
  for (const bad of ["0412345678", "call 4155550132", "0412.345.678", "cus_P8b4c2H9xQ", "acct_1Nv9XkL2eYz"]) {
    const s = snap();
    s.weeks[0].metrics[0].breakdown![0].label = bad;
    assert.equal(validScorecard(s, "AUD"), false, bad);
  }
  for (const ok of ["Rates 0.42 - 0.55 (2025)", "Window 12 - 26 (2026-09-30)", "1,264 rows since 2026-09-29", "a-very-long-hyphenated-phrase-that-keeps-going-on"]) {
    const s = snap();
    (s.weeks[0].metrics[1] as { note: string }).note = ok;
    assert.equal(validScorecard(s, "AUD"), true, ok);
  }
});

test("a rejected snapshot names the failing field, never its value", async () => {
  const { scorecardProblem } = await import("../lib/scorecard");
  const s = snap();
  (s.weeks[0].metrics[1] as { note: string }).note = "mail jane@x.co";
  const problem = scorecardProblem(s, "AUD")!;
  assert.equal(problem, "weeks[0].metrics[1].note");
  const { biz } = setup();
  connect(biz, printer(s));
  await assert.rejects(runScorecard("acme-co", NOW), (e: Error) => e.message.includes("weeks[0].metrics[1].note") && !e.message.includes("jane"));
});

test("an adapter that ignores the timeout is killed", async () => {
  const { execAdapter } = await import("../lib/private-adapter");
  const started = Date.now();
  await assert.rejects(execAdapter([process.execPath, "-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], {}, 300));
  assert.ok(Date.now() - started < 5000);
});

test("demo adapter stamps the time it ran", async () => {
  const { execFileSync } = await import("node:child_process");
  const { demoAdapter } = await import("../lib/scorecard");
  const out = JSON.parse(execFileSync(process.execPath, [demoAdapter()], { input: JSON.stringify({ currency: "AUD", now: "2026-10-01T20:00:00.000Z" }), encoding: "utf8" }));
  assert.equal(out.observedAt, "2026-10-01T20:00:00.000Z");
});

test("run reads included ledger files", async () => {
  const { biz } = setup();
  fs.mkdirSync(path.join(biz, "finance"));
  fs.writeFileSync(path.join(biz, "finance", "ledger.beancount"), 'include "ads.beancount"\n');
  fs.writeFileSync(path.join(biz, "finance", "ads.beancount"), '2026-09-25 * "Ads"\n  Expenses:Advertising   300.00 AUD\n  Assets:Bank\n');
  const s = snap();
  s.weeks[0].metrics.push({ id: "new_paying", value: 3, quality: "exact", note: "" }, { id: "new_mrr", value: 60, quality: "exact", note: "" });
  connect(biz, printer(s));
  const cost = (await runScorecard("acme-co", NOW)).snapshot!.weeks[0].metrics.find((x) => x.id === "cost_to_win")!;
  assert.equal(cost.value, 100);
});

test("a currency change is reported, not silently hidden", async () => {
  const { biz } = setup();
  connect(biz, printer(snap()));
  await runScorecard("acme-co", NOW);
  const p = JSON.parse(fs.readFileSync(path.join(biz, "profile.json"), "utf8"));
  fs.writeFileSync(path.join(biz, "profile.json"), JSON.stringify({ ...p, currency: "NZD" }));
  const state = scorecardState("acme-co", NOW);
  assert.equal(state.snapshot, null);
  assert.equal(state.currencyChanged, "AUD");
  await assert.rejects(runScorecard("acme-co", NOW), /currency/);
});

test("two refreshes at once: the second is refused; a stale lock is replaced", async () => {
  const { biz } = setup();
  const slow = [process.execPath, "-e", `process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>console.log(${JSON.stringify(JSON.stringify(snap()))}),400))`];
  connect(biz, slow);
  const [a, b] = await Promise.allSettled([runScorecard("acme-co", NOW), runScorecard("acme-co", NOW)]);
  assert.deepEqual([a.status, b.status].sort(), ["fulfilled", "rejected"]);
  const refused = (a.status === "rejected" ? a : b) as PromiseRejectedResult;
  assert.match(refused.reason.message, /already running/);
  assert.equal(scorecardState("acme-co", NOW).failed, false, "a refused duplicate is not a failure");
  assert.equal(fs.existsSync(path.join(biz, "scorecard.lock")), false, "lock released");
  fs.writeFileSync(path.join(biz, "scorecard.lock"), "");
  const old = new Date(Date.now() - 10 * 60e3);
  fs.utimesSync(path.join(biz, "scorecard.lock"), old, old);
  assert.equal((await runScorecard("acme-co", NOW)).failed, false);
});
