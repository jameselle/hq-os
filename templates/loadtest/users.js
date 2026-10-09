// HQ load-test template: simulate N customers at once, by plan, and step N up (default 10 -> 25 -> 50 -> 100).
// Copy into the business's own repo and edit the PLANS block below; nothing else should need to change.
//
//   k6 run -e BASE_URL=https://<staging private IP> -e KEYS_FILE=keys.json -e INSECURE=1 \
//          -e SUMMARY_FILE=k6-summary.json --out csv=k6.csv.gz users.js
//
// Every simulated customer gets ITS OWN key from its plan's pool (KEYS_FILE = {"<pool>": ["key", ...], ...}), so
// per-customer rate limits behave as they do for real customers: a 429 here is a 429 a customer would have seen.
// Env: BASE_URL, KEYS_FILE, STEPS ("10,25,50,100"), RAMP ("1m"), HOLD ("10m"), THINK (1 = realistic pacing,
//      0.25 = four times as eager), INSECURE ("1" for a self-signed staging certificate), KEY_HEADER ("x-api-key").
import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";
import { SharedArray } from "k6/data";
import { Counter, Trend } from "k6/metrics";
import { WebSocket } from "k6/websockets";
import { setTimeout as later } from "k6/timers";

// ============================== EDIT THIS: who the customers are ==============================
// share: fraction of N on this plan. pace: seconds between visits (randomised +-40%, times THINK).
// requests: one visit; each runs with probability `p` (default 1). `name` groups the timings in the report;
// keep the business's main endpoint's name the same as the HQ config's --primary.
const PLANS = [
  { scenario: "free", pool: "free", share: 0.6, pace: 60, requests: [
    { name: "catalogue", path: "/api/items?limit=10" },
    { name: "item", path: "/api/items/1", p: 0.2 },
  ] },
  { scenario: "paid", pool: "paid", share: 0.3, pace: 30, requests: [
    { name: "catalogue", path: "/api/items?limit=25" },
    { name: "search", path: "/api/search?q=popular", p: 0.3 },
  ] },
  { scenario: "top", pool: "top", share: 0.1, pace: 15, requests: [
    { name: "catalogue", path: "/api/items?limit=50" },
    { name: "export", path: "/api/export", p: 0.1 },
  ] },
];
// A plan that holds a live WebSocket (null for none): one stream per simulated customer, reconnecting every 5-10 min.
const STREAM = { scenario: "top_stream", pool: "top", share: 0.1, path: "/api/stream" };
// Anonymous site visitors on top of the customers (share of N), reading these pages. [] for none.
const SITE = { share: 0.2, pace: 20, pages: ["/", "/pricing/", "/docs/"] };
// ===============================================================================================

const BASE = (__ENV.BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const STEPS = (__ENV.STEPS || "10,25,50,100").split(",").map(Number);
const RAMP = __ENV.RAMP || "1m";
const HOLD = __ENV.HOLD || "10m";
const THINK = Number(__ENV.THINK || 1);
const KEY_HEADER = __ENV.KEY_HEADER || "x-api-key";

const POOLS = [...new Set([...PLANS.map((p) => p.pool), ...(STREAM ? [STREAM.pool] : [])])];
const keys = new SharedArray("keys", () => { const k = JSON.parse(open(__ENV.KEYS_FILE || "keys.json")); return POOLS.map((p) => k[p] || []); });
const count = (n, share) => Math.max(1, Math.round(n * share));
const stages = (share) => [...STEPS.flatMap((n) => [{ duration: RAMP, target: count(n, share) }, { duration: HOLD, target: count(n, share) }]), { duration: "30s", target: 0 }];
const scenario = (fn, share, env = {}) => ({ executor: "ramping-vus", exec: fn, startVUs: 0, stages: stages(share), gracefulRampDown: "30s", gracefulStop: "45s", env });

const scenarios = {};
for (const [i, p] of PLANS.entries()) scenarios[p.scenario] = scenario("customer", p.share, { PLAN: String(i) });
if (STREAM) scenarios[STREAM.scenario] = scenario("stream", STREAM.share);
if (SITE.pages.length) scenarios.site = scenario("site", SITE.share);

export const options = {
  insecureSkipTLSVerify: __ENV.INSECURE === "1",
  scenarios,
  thresholds: { http_req_failed: ["rate<0.01"], server_errors: ["count<1"] },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const serverErrors = new Counter("server_errors");
const rateLimited = new Counter("rate_limited");
const streamBytes = new Trend("stream_msg_bytes");
const streamMessages = new Counter("stream_messages");
const streamErrors = new Counter("stream_errors");

function keyFor(pool) {
  const list = keys[POOLS.indexOf(pool)];
  const i = exec.vu.idInTest - 1;   // unique across every scenario, so no two simulated customers share a key
  if (i >= list.length) exec.test.abort(`key pool "${pool}" has ${list.length} keys; this run needs ${i + 1}. Mint more.`);
  return list[i];
}
const think = (s) => sleep(Math.max(0.5, s * THINK * (0.6 + Math.random() * 0.8)));

export function customer() {
  const plan = PLANS[Number(__ENV.PLAN)];
  const key = keyFor(plan.pool);
  for (const r of plan.requests) {
    if (Math.random() >= (r.p ?? 1)) continue;
    const res = http.get(`${BASE}${r.path}`, { headers: { [KEY_HEADER]: key }, tags: { name: r.name }, timeout: "60s" });
    if (res.status >= 500 || res.status === 0) serverErrors.add(1, { name: r.name });
    if (res.status === 429) rateLimited.add(1, { name: r.name });
    check(res, { [`${r.name} 200`]: (x) => x.status === 200 });
  }
  think(plan.pace);
}

export function stream() {
  const key = keyFor(STREAM.pool);
  const ws = new WebSocket(`${BASE.replace(/^http/, "ws")}${STREAM.path}`, null, { headers: { [KEY_HEADER]: key } });
  ws.onmessage = (e) => { streamMessages.add(1); streamBytes.add(typeof e.data === "string" ? e.data.length : 0); };
  ws.onerror = () => streamErrors.add(1);
  ws.onopen = () => later(() => ws.close(), (5 + Math.random() * 5) * 60_000);
}

export function site() {
  const page = SITE.pages[Math.floor(Math.random() * SITE.pages.length)];
  const res = http.get(`${BASE}${page}`, { tags: { name: "site" }, timeout: "30s" });
  if (res.status >= 500 || res.status === 0) serverErrors.add(1, { name: "site" });
  check(res, { "site 200": (x) => x.status === 200 });
  think(SITE.pace);
}

export function handleSummary(summary) {
  return { [__ENV.SUMMARY_FILE || "k6-summary.json"]: JSON.stringify(summary, null, 2), stdout: `\nsteps ${STEPS.join(" -> ")}, hold ${HOLD}\n` };
}
