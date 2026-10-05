import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { analyticsAlarms, analyticsBoard, analyticsProblem, isoWeek, lastWeeks, rebuildAnalytics, runAnalytics, weeklyCounts, type AnalyticsSnapshot, type BoardMetric } from "../lib/analytics";
import { ANALYTICS, ANALYTICS_IDS, RECURRING_ONLY, WORKFLOW_ANALYTICS, formatAnalytics } from "../lib/analytics-metrics";
import { countOpen } from "../lib/analytics-findings";
import { METRICS } from "../lib/scorecard-metrics";
import { businessDir, scaffoldBusiness } from "../lib/store";
import { WORKFLOWS } from "../lib/workflows";
import { profile, tempData } from "./helpers";

const snap = (over: Partial<AnalyticsSnapshot> = {}): AnalyticsSnapshot => ({
  version: 1, observedAt: "2026-10-05T00:00:00.000Z", currency: "AUD",
  metrics: [
    { id: "followers", value: 1570, quality: "exact", note: "Instagram", weeks: [{ week: "2026-W40", value: 1480 }, { week: "2026-W41", value: 1570 }] },
    { id: "support_tickets", value: 12, quality: "approx", note: "", breakdown: [{ label: "Billing", value: 7 }, { label: "Data", value: 5 }], period: "last 4 weeks" },
    { id: "save_rate", value: null, quality: "missing", note: "No cancel flow yet" },
  ],
  ...over,
});

test("every workflow is judged by at least one catalogue number, and every number serves a workflow", () => {
  const titles = new Set(WORKFLOWS.map((w) => w.title));
  for (const w of WORKFLOWS) assert.ok((WORKFLOW_ANALYTICS[w.title] ?? []).length > 0, `${w.title} has no number`);
  for (const t of Object.keys(WORKFLOW_ANALYTICS)) assert.ok(titles.has(t), `unknown workflow ${t}`);
  const used = new Set(Object.values(WORKFLOW_ANALYTICS).flat());
  for (const id of ANALYTICS_IDS) assert.ok(used.has(id), `${id} serves no workflow`);
  for (const ids of Object.values(WORKFLOW_ANALYTICS)) for (const id of ids) assert.ok(Object.hasOwn(ANALYTICS, id), id);
  for (const id of RECURRING_ONLY) assert.ok(Object.hasOwn(ANALYTICS, id), id);
});

test("a workflow's scorecard number is among its analytics, and every scorecard metric is in the catalogue", () => {
  for (const w of WORKFLOWS) if (w.metricId) assert.ok(WORKFLOW_ANALYTICS[w.title].includes(w.metricId as never), `${w.title}: ${w.metricId}`);
  for (const id of Object.keys(METRICS)) assert.equal((ANALYTICS as Record<string, { source: string }>)[id]?.source, "scorecard", id);
});

test("validator accepts a good snapshot and names the first bad field, never its value", () => {
  assert.equal(analyticsProblem(snap(), "AUD"), null);
  assert.equal(analyticsProblem(snap(), "USD"), "currency");
  assert.equal(analyticsProblem({ ...snap(), version: 2 }, "AUD"), "version");
  const unknown = snap(); (unknown.metrics[0] as { id: string }).id = "emails";
  assert.equal(analyticsProblem(unknown, "AUD"), "metrics[0].id");
  const mismatch = snap(); mismatch.metrics[2].value = 0;
  assert.equal(analyticsProblem(mismatch, "AUD"), "metrics[2].value");
  const dupWeek = snap(); dupWeek.metrics[0].weeks = [{ week: "2026-W40", value: 1 }, { week: "2026-W40", value: 2 }];
  assert.equal(analyticsProblem(dupWeek, "AUD"), "metrics[0].weeks[1].week");
  const dupId = snap(); dupId.metrics.push({ ...dupId.metrics[0] });
  assert.equal(analyticsProblem(dupId, "AUD"), "metrics");
  const negative = snap(); negative.metrics[1].breakdown![0].value = -1;
  assert.equal(analyticsProblem(negative, "AUD"), "metrics[1].breakdown[0].value");
});

test("validator refuses personal-data shapes in notes, periods and labels", () => {
  for (const bad of ["mail a@b.co", "call +61 400 000 000", "cus_" + "ABCdef12345678", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc", "see https://x.io/?u=1"]) {
    const n = snap(); n.metrics[0].note = bad;
    assert.notEqual(analyticsProblem(n, "AUD"), null, `note: ${bad}`);
    const l = snap(); l.metrics[1].breakdown![0].label = bad;
    assert.notEqual(analyticsProblem(l, "AUD"), null, `label: ${bad}`);
  }
});

test("rebuild drops unknown fields", () => {
  const s = snap() as AnalyticsSnapshot & { secret?: string };
  s.secret = "x"; (s.metrics[0] as { extra?: number }).extra = 1;
  const r = rebuildAnalytics(s);
  assert.equal("secret" in r, false);
  assert.equal("extra" in r.metrics[0], false);
});

test("ISO weeks follow the business's time zone", () => {
  assert.equal(isoWeek(Date.parse("2026-10-04T15:00:00Z"), "Australia/Sydney"), "2026-W41"); // Monday morning in Sydney
  assert.equal(isoWeek(Date.parse("2026-10-04T15:00:00Z"), "UTC"), "2026-W40");
  assert.equal(isoWeek(Date.parse("2027-01-01T12:00:00Z"), "UTC"), "2026-W53");
  const weeks = lastWeeks(12, Date.parse("2026-10-05T00:00:00Z"), "UTC");
  assert.equal(weeks.length, 12);
  assert.equal(weeks.at(-1), "2026-W41");
  const counts = weeklyCounts(["2026-10-05T01:00:00Z", "2026-09-30T01:00:00Z", "2025-01-01T00:00:00Z"], 4, Date.parse("2026-10-05T02:00:00Z"));
  assert.deepEqual(counts.map((p) => p.value), [0, 0, 1, 1]);
});

test("formats every unit", () => {
  assert.equal(formatAnalytics("rate", 0.1234, "AUD"), "12.3%");
  assert.equal(formatAnalytics("ratio", 3.456, "AUD"), "3.46x");
  assert.equal(formatAnalytics("minutes", 150, "AUD"), "2.5 h");
  assert.equal(formatAnalytics("days", 2.44, "AUD"), "2.4 d");
  assert.equal(formatAnalytics("count", null, "AUD"), "—");
});

test("open findings leave info notes out and split by severity", () => {
  const r = countOpen([{ severity: "critical" }, { severity: "info" }, { severity: "decision" }, { severity: "decision" }]);
  assert.equal(r.total, 3);
  assert.deepEqual(r.bySeverity, [{ label: "critical", value: 1 }, { label: "decision", value: 2 }]);
});

test("the demo adapter reports a valid, invented reading for every adapter number", () => {
  const out = JSON.parse(execFileSync(process.execPath, [path.resolve(__dirname, "..", "templates", "analytics", "demo-adapter.mjs")], { input: JSON.stringify({ action: "report", weeks: 12, currency: "AUD", now: "2026-10-05T00:00:00Z" }), encoding: "utf8" }));
  assert.equal(analyticsProblem(out, "AUD"), null);
  const reported = new Set(out.metrics.map((m: { id: string }) => m.id));
  for (const id of ANALYTICS_IDS) if (ANALYTICS[id].source === "adapter") assert.ok(reported.has(id), `demo misses ${id}`);
});

test("the board merges sources: adapter wins, HQ counts its own posts, recurring-only numbers don't apply to a shop", async () => {
  tempData();
  const p = profile({ model: "ecommerce" });
  scaffoldBusiness(p);
  const dir = businessDir(p.slug);
  const now = new Date("2026-10-05T03:00:00Z");
  fs.writeFileSync(path.join(dir, "published.jsonl"), [
    { at: "2026-10-04T23:00:00Z", platform: "instagram", via: "composio", status: "published", url: "https://example.com/p/1", caption: "Comment BOOK for the link" },
    { at: "2026-09-20T01:00:00Z", platform: "tiktok", via: "woopsocial", status: "published", postId: "1" },
    { at: "2026-10-01T01:00:00Z", platform: "tiktok", via: "woopsocial", status: "failed" },
  ].map((x) => JSON.stringify(x)).join("\n") + "\n");
  const adapter = path.join(dir, "adapter.mjs");
  fs.writeFileSync(adapter, `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(${JSON.stringify(JSON.stringify(snap({ observedAt: now.toISOString() })))}));`);
  fs.writeFileSync(path.join(dir, "analytics-connection.json"), JSON.stringify({ command: [process.execPath, adapter], readOnly: true }));

  const r = await runAnalytics(p.slug, now, { openFindings: { total: 2, bySeverity: [{ label: "attention", value: 2 }] }, competitors: { weeks: [{ week: "2026-W41", value: 3 }], byCompetitor: [{ label: "Rival", value: 3 }], watches: 2 } });
  assert.equal(r.adapterError, null);
  const b = analyticsBoard(p.slug, now);
  const by = Object.fromEntries(b.metrics.map((m) => [m.id, m]));
  assert.equal(by.followers.status, "measured");
  assert.equal(by.followers.from, "adapter");
  assert.equal(by.followers.change, 90);
  assert.equal(by.posts_published.value, 1, "one published post in the last 7 days; the failed one doesn't count");
  assert.equal(by.posts_published.points.reduce((n, p) => n + (p.value ?? 0), 0), 2);
  assert.equal(by.keyword_posts.value, 1);
  assert.equal(by.open_findings.value, 2, "refresh-only numbers come from the saved copy");
  assert.equal(by.competitor_changes.value, 3);
  assert.equal(by.competitor_changes.from, "hq");
  assert.equal(by.mrr.status, "na");
  assert.equal(by.save_rate.status, "missing");
  assert.equal(by.save_rate.note, "No cancel flow yet");
  assert.ok(b.coverage.measured >= 4);
  assert.ok(fs.existsSync(path.join(dir, "analytics", "2026-W41.json")), "this week's readings are kept");
  assert.equal((fs.statSync(path.join(dir, "analytics-snapshot.json")).mode & 0o777).toString(8), "600");
});

test("a failing adapter keeps the previous snapshot and still saves HQ's own numbers", async () => {
  tempData();
  const p = profile({ model: "subscription" });
  scaffoldBusiness(p);
  const dir = businessDir(p.slug);
  fs.writeFileSync(path.join(dir, "analytics-connection.json"), JSON.stringify({ command: [process.execPath, "-e", "process.exit(3)"] }));
  const r = await runAnalytics(p.slug, new Date("2026-10-05T03:00:00Z"));
  assert.equal(r.adapterError, "Private adapter failed");
  assert.equal(r.failed, true);
  assert.ok(r.hq);
  const b = analyticsBoard(p.slug, new Date("2026-10-05T03:00:00Z"));
  assert.equal(b.metrics.find((m) => m.id === "mrr")!.status, "missing", "recurring numbers are gaps, not n/a, for a subscription");
});

test("no private analytics file is tracked in git", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" }).split("\n");
  const bad = tracked.filter((f) => /analytics-(connection|snapshot|state|hq)\.json$|(^|\/)analytics\/\d{4}-W\d{2}\.json$/.test(f));
  assert.deepEqual(bad, []);
});

test("ad spend comes from the ledger when it has advertising entries, and stays unmeasured when it has none", async () => {
  tempData();
  const p = profile({ model: "subscription" });
  scaffoldBusiness(p);
  const now = new Date("2026-10-05T03:00:00Z");
  let b = analyticsBoard(p.slug, now);
  assert.equal(b.metrics.find((m) => m.id === "ad_spend")!.status, "missing");
  const ledger = path.join(businessDir(p.slug), "finance", "ledger.beancount");
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.appendFileSync(ledger, '\n2026-10-01 * "Boosted post"\n  Expenses:Advertising  40.00 AUD\n  Assets:Bank\n\n2026-09-20 * "Creator code"\n  Expenses:Commissions  10.00 AUD\n  Assets:Bank\n');
  b = analyticsBoard(p.slug, now);
  const ad = b.metrics.find((m) => m.id === "ad_spend")!;
  assert.equal(ad.status, "measured");
  assert.equal(ad.value, 50);
  assert.equal(ad.points.reduce((n, x) => n + (x.value ?? 0), 0), 50);
});

test("alarm numbers are counts where down is better, and only a measured reading above zero raises one", () => {
  for (const id of ANALYTICS_IDS) {
    const def = ANALYTICS[id] as { alarm?: string; unit: string; better: string };
    if (def.alarm) { assert.equal(def.unit, "count", id); assert.equal(def.better, "down", id); }
  }
  const m = (value: number | null, status: BoardMetric["status"] = "measured"): BoardMetric => ({ id: "keyword_dm_misses", def: ANALYTICS.keyword_dm_misses, status, value, quality: "exact", note: "Replies left unanswered", points: [], breakdown: [], period: null, change: null, from: "adapter", workflows: ["Comment-keyword funnel"] });
  const got = analyticsAlarms([m(2), { ...m(5), id: "keyword_dms", def: ANALYTICS.keyword_dms }]);
  assert.deepEqual(got.map((a) => [a.id, a.value, a.workflow, a.owner]), [["keyword_dm_misses", 2, "Comment-keyword funnel", "email"]]);
  assert.deepEqual(analyticsAlarms([m(0), m(null, "missing")]), []);
});
