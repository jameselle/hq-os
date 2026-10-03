import assert from "node:assert/strict";
import { test } from "node:test";

import { backupIsExternal, buildFindings } from "../lib/ceo";
import { depts, facts, nameRegex, privateNames, profile } from "./helpers";

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

test("iCloud Drive, external drives and cloud backends count as off-machine; home folders don't", () => {
  assert.equal(backupIsExternal("/Users/j/Library/Mobile Documents/com~apple~CloudDocs/HQ Backups/restic"), true);
  assert.equal(backupIsExternal("/Volumes/Backup/hq"), true);
  assert.equal(backupIsExternal("s3:s3.amazonaws.com/bucket"), true);
  assert.equal(backupIsExternal("/Users/j/hq-backups"), false);
  assert.equal(backupIsExternal(undefined), false);
});

test("no backup is critical and sorts first", () => {
  const f = buildFindings(depts(), facts(), profile());
  assert.equal(f[0].id, "no-backups");
  assert.equal(f[0].severity, "critical");
});

test("a same-disk backup is still critical, with honest wording", () => {
  const f = buildFindings(depts(), facts({ backup: { repository: "/Users/j/hq-backups" } }), profile());
  const b = f.find((x) => x.id === "no-backups")!;
  assert.match(b.title, /own disk/);
});

test("an external, fresh backup clears the critical finding; a stale one warns", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const fresh = buildFindings(depts(), facts({ backup: { repository: "/Volumes/B/hq", lastSnapshotAt: "2026-09-30T20:00:00Z", restoreTestOk: true } }), profile(), {}, now);
  assert.ok(!ids(fresh).includes("no-backups") && !ids(fresh).includes("backup-stale"));
  const stale = buildFindings(depts(), facts({ backup: { repository: "/Volumes/B/hq", lastSnapshotAt: "2026-09-20T00:00:00Z" } }), profile(), {}, now);
  assert.ok(ids(stale).includes("backup-stale"));
});

test("a service whose data couldn't be staged for the backup is named, and silent when all staged", () => {
  const b = { repository: "/Volumes/B/hq", lastSnapshotAt: new Date().toISOString(), restoreTestOk: true };
  const bad = buildFindings(depts(), facts({ backup: { ...b, stagingFailed: ["com.hq.postiz.postgres: still running after the stop"] } }), profile());
  const x = bad.find((y) => y.id === "service-data-not-staged");
  assert.equal(x?.severity, "attention");
  assert.match(x!.detail, /com\.hq\.postiz\.postgres/);
  const good = buildFindings(depts(), facts({ backup: { ...b, stagingFailed: [] } }), profile());
  assert.ok(!ids(good).includes("service-data-not-staged"));
});

test("a failed restore test is critical", () => {
  const f = buildFindings(depts(), facts({ backup: { repository: "/Volumes/B/hq", lastSnapshotAt: new Date().toISOString(), restoreTestOk: false } }), profile());
  assert.equal(f.find((x) => x.id === "restore-failed")?.severity, "critical");
});

test("with no business, the first decision is to connect one", () => {
  const f = buildFindings(depts(), facts(), null);
  assert.ok(ids(f).includes("no-business"));
  assert.ok(!ids(f).includes("connect-channels"));
});

// Channel findings replaced the single Postiz-era "connect-channels" finding: one decision per
// unconnected channel, with the steps for its route.
const snapshot = (toolkits: Record<string, string[]>) => ({
  checkedAt: new Date().toISOString(),
  source: "test",
  toolkits: Object.fromEntries(
    Object.entries(toolkits).map(([k, ids]) => [k, { status: "active", accounts: ids.map((id) => ({ id, name: "acme", status: "ACTIVE" })) }]),
  ),
});

test("without a connection snapshot, channel status is flagged as unknown", () => {
  const f = buildFindings(depts(), facts(), profile());
  assert.ok(ids(f).includes("connections-unknown"));
  assert.ok(!ids(buildFindings(depts(), facts(), profile({ channels: {} }))).includes("connections-unknown"));
});

test("a channel connected through Composio raises nothing; an unconnected one is a decision", () => {
  const connected = buildFindings(depts(), facts({ connections: snapshot({ instagram: ["instagram_x"] }) }), profile());
  assert.ok(!ids(connected).some((i) => i.startsWith("connect-")));
  const missing = buildFindings(depts(), facts({ connections: snapshot({}) }), profile());
  const f = missing.find((x) => x.id === "connect-instagram")!;
  assert.equal(f.severity, "decision");
  assert.match(f.action, /hq:connections connect instagram/);
});

test("a pinned account must be among the active connections", () => {
  const p = profile({ channels: { instagram: { handle: "@acme", account: "instagram_other" } } });
  const f = buildFindings(depts(), facts({ connections: snapshot({ instagram: ["instagram_x"] }) }), p);
  assert.ok(ids(f).includes("connect-instagram"));
});

test("TikTok defaults to WoopSocial and says how to connect it without pasting keys", () => {
  const f = buildFindings(depts(), facts({ connections: snapshot({}) }), profile({ channels: { tiktok: "@acme" } }));
  const t = f.find((x) => x.id === "connect-tiktok")!;
  assert.match(t.title, /woopsocial/);
  assert.match(t.action, /never paste it into chat/);
});

test("Postiz channels only raise a finding when Postiz is down", () => {
  const p = profile({ channels: { discord: "https://discord.gg/x" } });
  assert.ok(!ids(buildFindings(depts(), facts({ connections: snapshot({}) }), p)).includes("connect-discord"));
  assert.ok(ids(buildFindings(depts(), facts({ connections: snapshot({}), postizUp: false }), p)).includes("connect-discord"));
});

test("Search Console through Composio clears the gcloud finding", () => {
  assert.ok(ids(buildFindings(depts(), facts({ gcloud: false }), profile())).includes("no-gcloud"));
  const f = buildFindings(depts(), facts({ gcloud: false, connections: snapshot({ google_search_console: ["gsc_1"] }) }), profile());
  assert.ok(!ids(f).includes("no-gcloud"));
});

test("dashboards alone don't count as analytics; a collector does", () => {
  assert.ok(ids(buildFindings(depts({ data: ["Looker Studio"] }), facts(), profile())).includes("no-analytics"));
  assert.ok(!ids(buildFindings(depts({ data: ["Umami"] }), facts(), profile())).includes("no-analytics"));
});

test("findings marked done disappear", () => {
  const f = buildFindings(depts(), facts({ telemetryOptOut: false }), profile(), { "hf-telemetry": "2026-09-29" });
  assert.ok(!ids(f).includes("hf-telemetry"));
});

test("findings never name a real business the profile didn't mention", (t) => {
  const re = nameRegex(privateNames());
  if (!re) return t.skip("no private names on this machine");
  const text = JSON.stringify(buildFindings(depts(), facts({ telemetryOptOut: false, postizUp: false, gcloud: false }), profile()));
  assert.doesNotMatch(text, re);
});

test("severity order is critical, attention, decision, info", () => {
  const order = buildFindings(depts(), facts({ postizUp: false, telemetryOptOut: false }), profile()).map((x) => x.severity);
  const rank = { critical: 0, attention: 1, decision: 2, info: 3 } as const;
  assert.deepEqual(order, [...order].sort((a, b) => rank[a] - rank[b]));
});

// ---- Market & Competitors ----
const row = (over: Partial<import("../lib/competitors").WatchRow> = {}) => ({
  uuid: "u1", competitor: "Rival", url: "https://rival.example/pricing", lastChanged: null, lastChecked: new Date().toISOString(), error: null, ...over,
});
const withRival = () => profile({ competitors: [{ name: "Rival", watch: ["https://rival.example/pricing"] }] });

test("no competitors listed is a decision; listing them clears it", () => {
  assert.ok(ids(buildFindings(depts(), facts(), profile())).includes("no-competitors"));
  assert.ok(!ids(buildFindings(depts(), facts({ intel: { watcherUp: true, rows: [row()], lastBriefAt: new Date().toISOString() } }), withRival())).includes("no-competitors"));
});

test("watcher down, pages not yet watched, and changes this week each raise the right finding", () => {
  assert.ok(ids(buildFindings(depts(), facts({ intel: { watcherUp: false, rows: null, lastBriefAt: null } }), withRival())).includes("watcher-down"));
  assert.ok(ids(buildFindings(depts(), facts({ intel: { watcherUp: true, rows: [], lastBriefAt: null } }), withRival())).includes("competitors-unsynced"));
  const changed = buildFindings(depts(), facts({ intel: { watcherUp: true, rows: [row({ lastChanged: new Date().toISOString() })], lastBriefAt: null } }), withRival());
  const f = changed.find((x) => x.id === "competitors-changed")!;
  assert.match(f.detail, /Rival: rival\.example\/pricing/);
});

test("old changes don't count; blocked pages are reported; a fresh brief clears the reminder", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const old = buildFindings(depts(), facts({ intel: { watcherUp: true, rows: [row({ lastChanged: "2026-09-01T00:00:00Z" })], lastBriefAt: "2026-09-30T00:00:00Z" } }), withRival(), {}, now);
  assert.ok(!ids(old).includes("competitors-changed"));
  assert.ok(!ids(old).includes("competitor-brief-due"));
  const blocked = buildFindings(depts(), facts({ intel: { watcherUp: true, rows: [row({ error: "403 Forbidden" })], lastBriefAt: null } }), withRival());
  assert.ok(ids(blocked).includes("competitors-unreachable"));
  assert.ok(ids(blocked).includes("competitor-brief-due"));
});

test("a business that skips the department gets no competitor findings", () => {
  const skipping = depts().filter((d) => d.slug !== "competitors");
  assert.ok(!buildFindings(skipping, facts(), profile()).some((f) => f.dept === "competitors"));
});

const card = (over = {}) => ({ connected: true, demo: false, stale: false, failed: false, hasSnapshot: true, missing: [], ...over });
const scorecardIds = (xs: { id: string }[]) => ids(xs).filter((i) => i.startsWith("scorecard"));

test("a business with no scorecard connection is a decision for Data", () => {
  const f = buildFindings(depts(), facts({ scorecard: card({ connected: false }) }), profile());
  const x = f.find((y) => y.id === "scorecard-none")!;
  assert.equal(x.severity, "decision");
  assert.equal(x.dept, "data");
  assert.deepEqual(scorecardIds(buildFindings(depts(), facts({ scorecard: card({ connected: false, demo: true }) }), profile())), []);
});

test("a stale or failed scorecard needs attention", () => {
  for (const over of [{ stale: true }, { failed: true }]) {
    const x = buildFindings(depts(), facts({ scorecard: card(over) }), profile()).find((y) => y.id === "scorecard-stale")!;
    assert.equal(x.severity, "attention");
    assert.equal(x.dept, "data");
  }
  assert.match(buildFindings(depts(), facts({ scorecard: card({ failed: true }) }), profile()).find((y) => y.id === "scorecard-stale")!.title, /failed/);
});

test("missing scorecard numbers are grouped per lever with their fix", () => {
  const missing = [
    { lever: "keep", label: "Payments recovered", note: "Needs three weeks of history" },
    { lever: "keep", label: "Paying churn", note: "Needs one full week" },
    { lever: "expand", label: "Net revenue retention", note: "Needs four weeks of history" },
  ];
  const f = buildFindings(depts(), facts({ scorecard: card({ missing }) }), profile());
  assert.deepEqual(scorecardIds(f).sort(), ["scorecard-missing-expand", "scorecard-missing-keep"]);
  const keep = f.find((y) => y.id === "scorecard-missing-keep")!;
  assert.equal(keep.severity, "info");
  assert.match(keep.detail, /Payments recovered: Needs three weeks of history/);
  assert.match(keep.detail, /Paying churn: Needs one full week/);
});

test("no scorecard findings without a business or without scorecard facts", () => {
  assert.deepEqual(scorecardIds(buildFindings(depts(), facts({ scorecard: card({ connected: false }) }), null)), []);
  assert.deepEqual(scorecardIds(buildFindings(depts(), facts(), profile())), []);
});

test("scorecard actions name the business, and never-refreshed reads as such", () => {
  const p = profile();
  const none = buildFindings(depts(), facts({ scorecard: card({ connected: false }) }), p).find((y) => y.id === "scorecard-none")!;
  assert.ok(none.action.includes(`scorecard refresh ${p.slug}`));
  assert.ok(!none.action.includes("<slug>"));
  const fresh = buildFindings(depts(), facts({ scorecard: card({ stale: true, hasSnapshot: false }) }), p).find((y) => y.id === "scorecard-stale")!;
  assert.match(fresh.title, /never been refreshed/);
  assert.ok(!/previous snapshot|36 hours/.test(fresh.detail));
});

test("a scorecard hidden by a currency change says why", () => {
  const x = buildFindings(depts(), facts({ scorecard: card({ stale: true, hasSnapshot: false, currencyChanged: "AUD" }) }), profile()).find((y) => y.id === "scorecard-stale")!;
  assert.match(x.title, /currency/);
  assert.match(x.detail, /AUD/);
});

test("billing and our records disagreeing needs attention, with the count", () => {
  const f = buildFindings(depts(), facts({ scorecard: card({ mismatch: 2 }) }), profile());
  const x = f.find((y) => y.id === "scorecard-records-mismatch")!;
  assert.equal(x.severity, "attention");
  assert.equal(x.dept, "data");
  assert.match(x.title, /2 paying members/);
  assert.equal(buildFindings(depts(), facts({ scorecard: card({ mismatch: 0 }) }), profile()).some((y) => y.id === "scorecard-records-mismatch"), false);
});

test("a finding marked done comes back when newer evidence arrives", () => {
  const changedAt = (iso: string) => facts({ intel: { watcherUp: true, rows: [row({ lastChanged: iso })], lastBriefAt: iso } });
  const now = new Date("2026-10-03T00:00:00Z");
  const doneAt = { "competitors-changed": "2026-10-01T12:00:00.000Z" };
  assert.ok(!ids(buildFindings(depts(), changedAt("2026-10-01T06:00:00Z"), withRival(), doneAt, now)).includes("competitors-changed"), "changes before 'done' stay hidden");
  assert.ok(ids(buildFindings(depts(), changedAt("2026-10-02T06:00:00Z"), withRival(), doneAt, now)).includes("competitors-changed"), "a change after 'done' brings it back");
});

test("the weakest lever becomes one finding for the workflow's owner", () => {
  const weakest = { lever: "keep", metric: "activation_rate", label: "Activation in week 1", value: 0.306, baseline: 0.46, unit: "rate", workflow: "Onboarding to first value", owner: "engineering", why: "down from 46.0% (4-week average)" };
  const f = buildFindings(depts(), facts({ scorecard: card({ weakest }) }), profile()).find((y) => y.id === "weakest-lever")!;
  assert.equal(f.dept, "engineering");
  assert.equal(f.severity, "decision");
  assert.match(f.title, /Keep customers/);
  assert.match(f.title, /30\.6%/);
  assert.match(f.action, /Onboarding to first value/);
});
