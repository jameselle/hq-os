import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { dashboardProblems } from "../lib/dashboard";

const ROOT = path.resolve(__dirname, "..");
const DAY = 86400;
const NOW = Date.UTC(2026, 9, 10, 0, 0, 0);
const t = (daysAgo: number) => Math.floor(NOW / 1000) - daysAgo * DAY;

// Invented subscriptions. Products: prod_pro, prod_plus are the business's; prod_other belongs to someone else.
const sub = (id: string, o: Record<string, unknown>) => ({
  id, customer: o.customer, status: o.status ?? "active", created: o.created ?? t(60), cancel_at_period_end: o.cancelAtEnd ?? false,
  cancel_at: o.cancelAt ?? null, canceled_at: o.canceledAt ?? null, ended_at: o.canceledAt ?? null, current_period_end: t(-20),
  cancellation_details: o.feedback ? { feedback: o.feedback, comment: "Too dear right now" } : null,
  items: { data: [{ quantity: 1, price: { product: o.product ?? "prod_pro", unit_amount: o.amount ?? 2000, currency: "aud", recurring: { interval: o.interval ?? "month", interval_count: 1 } } }] },
  latest_invoice: o.email ? { customer_email: o.email, customer_name: o.name ?? null, created: o.created ?? t(60) } : null,
});
const SUBS = [
  sub("sub_a", { customer: "cus_a", email: "ana@example.com", name: "Ana Example" }),
  sub("sub_b", { customer: "cus_b", status: "trialing", product: "prod_plus", email: "ben@example.com", created: t(3) }),
  sub("sub_c", { customer: "cus_c", status: "past_due", email: "cy@example.com", amount: 24000, interval: "year" }),
  sub("sub_d", { customer: "cus_d", cancelAtEnd: true, feedback: "too_expensive", email: "di@example.com" }),
  sub("sub_e", { customer: "cus_e", status: "canceled", canceledAt: t(5), feedback: "unused", email: "ed@example.com" }),
  sub("sub_e_old", { customer: "cus_e", status: "canceled", canceledAt: t(40), email: "ed@example.com" }),
  sub("sub_a_old", { customer: "cus_a", status: "canceled", canceledAt: t(90), email: "ana@example.com" }),
  sub("sub_x", { customer: "cus_x", product: "prod_other", email: "x@example.com" }),
  sub("sub_test", { customer: "cus_t", email: "t@example.com" }),
];

test("the Stripe connector shapes a valid snapshot from the business's own products", async () => {
  const { buildSnapshot } = (await import("../templates/dashboard/stripe-template.mjs")) as any;
  const s = buildSnapshot(SUBS, { tiers: { Pro: ["prod_pro"], Plus: ["prod_plus"] }, ignore: ["sub_test"], now: NOW });
  assert.deepEqual(dashboardProblems(s), []);
  assert.deepEqual(s.plans.map((p: { label: string; count: number }) => [p.label, p.count]), [["Pro", 3], ["Plus", 1]]);
  assert.match(s.plans[1].hint, /1 on a free trial/);
  const tiles = Object.fromEntries(s.groups[0].tiles.map((x: { label: string; value: number }) => [x.label, x.value]));
  assert.equal(tiles["Monthly recurring revenue"], 20 + 20 + 20, "two monthly at $20 plus $240 a year as $20 a month; trials and other products left out");
  assert.equal(tiles["Set to cancel"], 1);
  assert.deepEqual(s.pending.map((r: { key: string }) => r.key), ["sub_d"]);
  assert.equal(s.pending[0].cancelFeedback, "too_expensive");
  assert.deepEqual(s.churned.map((r: { key: string }) => r.key), ["sub_e"], "newest cancel per customer, and never someone still subscribed");
  assert.equal(s.churned[0].email, "ed@example.com");
  assert.deepEqual(s.recentUpgrades.map((r: { key: string }) => r.key), ["sub_b"]);
  assert.ok(!JSON.stringify(s).includes("x@example.com"), "another business's customer is left out");
  assert.ok(!JSON.stringify(s).includes("t@example.com"), "an ignored subscription is left out");
  assert.deepEqual(s.can, { contact: false, notes: false });
});

test("the Stripe connector reads a dashboard config or the scorecard's billing file", async () => {
  const { readConfig } = (await import("../templates/dashboard/stripe-template.mjs")) as any;
  assert.equal(readConfig({ keychain: "k", tiers: { Pro: ["prod_pro"] } }).keychain, "k");
  assert.equal(readConfig({ timeZone: "Australia/Sydney", stripe: { keychain: "k2", tiers: { Pro: ["prod_pro"] } } }).keychain, "k2");
  assert.throws(() => readConfig({ tiers: { Pro: [] } }), /keychain/);
  assert.throws(() => readConfig({ keychain: "k" }), /tiers/);
});

const CACHE = {
  account: { at: NOW - 60_000, followers: 120, media: 30 },
  followerHistory: [{ date: "2026-10-01", followers: 100 }, { date: "2026-10-10", followers: 120 }],
  media: { at: NOW - 60_000, rows: [
    { id: "m1", title: "First reel", link: "https://www.instagram.com/reel/abc/", at: new Date(NOW - 2 * DAY * 1000).toISOString(), likes: 10, comments: 2, type: "REELS" },
    { id: "m2", title: "Second", link: "https://www.instagram.com/p/def/", at: new Date(NOW - 10 * DAY * 1000).toISOString(), likes: 4, comments: 0, type: "FEED" },
    { id: "m3", title: "Old", link: null, at: new Date(NOW - 50 * DAY * 1000).toISOString(), likes: 1, comments: 0, type: "FEED" },
  ] },
  views: { at: NOW - 60_000, byId: { m1: 900, m2: 100, m3: 5 } },
};

test("the Instagram connector shapes followers, 30-day reach and top posts", async () => {
  const { buildSnapshot } = (await import("../templates/dashboard/instagram-template.mjs")) as any;
  const s = buildSnapshot(CACHE, { now: NOW });
  assert.deepEqual(dashboardProblems(s), []);
  const tile = (g: number, label: string) => s.groups[g].tiles.find((x: { label: string }) => x.label === label);
  assert.equal(tile(0, "Followers").value, 120);
  assert.match(tile(0, "Followers").hint, /\+20 in 7 days/);
  assert.equal(tile(1, "Views").value, 1000);
  assert.equal(tile(1, "Views per post").value, 500);
  assert.deepEqual(s.lists[0].rows.map((r: { key: string }) => r.key), ["m1", "m2"]);
  assert.equal(s.lists[0].rows[0].tags[0], "Reel");
  const empty = buildSnapshot({}, { now: NOW, errors: { instagram: "No Keychain item" } });
  assert.deepEqual(dashboardProblems(empty), []);
  assert.equal(empty.groups[0].tiles[0].value, null, "unknown, never 0");
});

test("the Instagram connector only calls Instagram when a cached part is older than its limit", async () => {
  const { refresh, TTL } = (await import("../templates/dashboard/instagram-template.mjs")) as any;
  const calls: string[] = [];
  const ig = async (p: string) => {
    calls.push(p.split("?")[0]);
    if (p === "me") return { followers_count: 5, media_count: 1 };
    if (p === "me/media") return { data: [{ id: "m9", caption: "Hi", permalink: "https://www.instagram.com/p/x/", timestamp: new Date(NOW).toISOString(), like_count: 1, comments_count: 0 }] };
    return { data: [{ values: [{ value: 42 }] }] };
  };
  const cache: Record<string, any> = {};
  await refresh(cache, ig, NOW);
  assert.deepEqual(calls, ["me", "me/media", "m9/insights"]);
  assert.equal(cache.views.byId.m9, 42);
  calls.length = 0;
  await refresh(cache, ig, NOW + 60_000);
  assert.deepEqual(calls, [], "everything fresh: no calls");
  await refresh(cache, ig, NOW + TTL.account + 1);
  assert.deepEqual(calls, ["me", "me/media"], "views wait for their hour");
});

function cli(hqData: string, ...args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "scripts/hq.ts", ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, HQ_DATA: hqData } });
}

test("dashboard connect writes a private connection and check prints counts, never a person", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-dash-cli-"));
  try {
    const biz = path.join(dir, "businesses", "demo-shop");
    fs.mkdirSync(biz, { recursive: true });
    fs.writeFileSync(path.join(biz, "profile.json"), JSON.stringify({ slug: "demo-shop", name: "Demo Shop", demo: true, country: "AU", currency: "AUD", timezone: "Australia/Sydney", offer: "Example", audience: "Example", model: "subscription", sites: [], channels: {}, regulated: [], vault: { path: "vault" }, createdAt: "2026-01-01" }));
    const conn = path.join(biz, "dashboard-connection.json");

    let r = cli(dir, "dashboard", "connect", "demo-shop", "demo");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.statSync(conn).mode & 0o777, 0o600);
    assert.equal(JSON.parse(fs.readFileSync(conn, "utf8")).readOnly, false);

    r = cli(dir, "dashboard", "connect", "demo-shop", "stripe");
    assert.notEqual(r.status, 0, "never replaces a connection without --force");

    r = cli(dir, "dashboard", "check", "demo-shop");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /0 problems/);
    assert.match(r.stdout, /churned\s+4 people/);
    assert.doesNotMatch(r.stdout, /@/, "no email address is ever printed");

    r = cli(dir, "dashboard", "connect", "demo-shop", "stripe", "--force");
    assert.equal(r.status, 0, r.stderr);
    const cfg = JSON.parse(fs.readFileSync(path.join(biz, "dashboard-stripe.json"), "utf8"));
    assert.equal(cfg.keychain, "hq-demo-shop-stripe");
    assert.match(r.stdout, /security add-generic-password -a hq -s hq-demo-shop-stripe -w/);
    assert.equal(JSON.parse(fs.readFileSync(conn, "utf8")).readOnly, true);

    fs.writeFileSync(path.join(biz, "scorecard-billing.json"), JSON.stringify({ stripe: { keychain: "hq-shop-billing", tiers: { Pro: ["prod_pro"] } } }));
    fs.rmSync(path.join(biz, "dashboard-stripe.json"));
    r = cli(dir, "dashboard", "connect", "demo-shop", "stripe", "--force");
    assert.match(r.stdout, /scorecard's Stripe settings/);
    assert.match(fs.readFileSync(conn, "utf8"), /scorecard-billing\.json/);

    r = cli(dir, "dashboard", "connect", "demo-shop", "instagram", "--force");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(fs.readFileSync(path.join(biz, "dashboard-instagram.json"), "utf8")).keychain, "hq-demo-shop-instagram");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
