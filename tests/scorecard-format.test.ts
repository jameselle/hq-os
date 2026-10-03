import { test } from "node:test";
import assert from "node:assert/strict";

import { formatValue, scorecardRows } from "../lib/scorecard-metrics";
import type { ScorecardSnapshot } from "../lib/scorecard";

test("formats each unit, and missing as a dash", () => {
  assert.match(formatValue("money", 2400.5, "AUD"), /2,401/);
  assert.match(formatValue("money", 12.5, "AUD"), /12\.50/);
  assert.equal(formatValue("rate", 0.4234, "AUD"), "42.3%");
  assert.equal(formatValue("count", 1234, "AUD"), "1,234");
  assert.equal(formatValue("months", 4, "AUD"), "4.0 mo");
  assert.equal(formatValue("count", null, "AUD"), "—");
});

test("rows run lever by lever in catalogue order, with change from last week", () => {
  const s: ScorecardSnapshot = {
    version: 1, observedAt: "2026-10-02T00:00:00Z", currency: "AUD",
    weeks: [
      { week: "2026-W40", metrics: [{ id: "mrr", value: 110, quality: "exact", note: "" }, { id: "new_signups", value: 5, quality: "exact", note: "" }, { id: "nrr", value: null, quality: "missing", note: "Needs history" }] },
      { week: "2026-W39", metrics: [{ id: "mrr", value: 100, quality: "exact", note: "" }] },
    ],
  };
  const rows = scorecardRows(s, false);
  assert.deepEqual(rows.map((r) => r.id), ["new_signups", "nrr", "mrr"]);
  assert.deepEqual(rows.map((r) => r.lever), ["get", "expand", "base"]);
  assert.equal(rows[2].change, 10);
  assert.equal(rows[0].change, null);
  assert.equal(rows[1].note, "Needs history");
});

test("sparkline points span the box, skip missing weeks, and need two values", async () => {
  const { sparkline } = await import("../lib/scorecard-metrics");
  assert.equal(sparkline([5], 60, 16), "");
  assert.equal(sparkline([null, null], 60, 16), "");
  assert.equal(sparkline([0, 10], 60, 16), "0,16 60,0");
  assert.equal(sparkline([2, null, 2], 60, 16), "0,8 60,8");
});

test("week series merges kept history with the snapshot's own weeks, snapshot winning", async () => {
  const { weekSeries } = await import("../lib/scorecard-metrics");
  const w = (week: string, v: number | null) => ({ week, metrics: v === null ? [] : [{ id: "mrr" as const, value: v, quality: "exact" as const, note: "" }] });
  const history = [w("2026-W36", 1), w("2026-W37", 2), w("2026-W40", 9)];
  const snapWeeks = [w("2026-W40", 4), w("2026-W39", 3), w("2026-W38", null)];
  assert.deepEqual(weekSeries(history, snapWeeks, "mrr", 12), [1, 2, null, 3, 4]);
  assert.deepEqual(weekSeries(history, snapWeeks, "mrr", 2), [3, 4]);
});

test("catalogue metrics the adapter left out show as missing", async () => {
  const s: ScorecardSnapshot = { version: 1, observedAt: "2026-10-02T00:00:00Z", currency: "AUD", weeks: [{ week: "2026-W40", metrics: [{ id: "mrr", value: 1, quality: "exact", note: "" }] }] };
  const rows = scorecardRows(s);
  assert.equal(rows.length, 17);
  const absent = rows.find((r) => r.id === "new_signups")!;
  assert.equal(absent.quality, "missing");
  assert.equal(absent.note, "Not reported by the adapter");
});

test("catalogue has set-to-cancel (Keep) and billing-vs-records (Foundation)", async () => {
  const { METRICS } = await import("../lib/scorecard-metrics");
  assert.deepEqual(METRICS.set_to_cancel, { lever: "keep", label: "Set to cancel", unit: "count" });
  assert.deepEqual(METRICS.records_mismatch, { lever: "base", label: "Billing vs our records", unit: "count" });
});
