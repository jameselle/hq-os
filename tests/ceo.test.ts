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
