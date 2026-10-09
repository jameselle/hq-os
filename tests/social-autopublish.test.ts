// Automatic posting, the rest of the way: a business's own attempt limit, only approved posts going out, checks run
// again at the moment of posting, never another business's account, a lock two runs can't share, failed posts as a
// CEO finding, and the daily Instagram numbers the analytics adapter reads. Demo business only.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import { tempData, profile, facts, depts } from "./helpers";
import { checkSocial, validateSocialConfig, type SocialConfig, type SocialDraft } from "../lib/social";
import { attemptsAllowed, dueNow, MAX_ATTEMPTS, type CellResult } from "../lib/social-publish";
import { insightsCell, summariseInsights } from "../lib/social-insights";
import { buildFindings } from "../lib/ceo";

const TZ = "Australia/Sydney";
// 2026-10-14 10:00 in Sydney (UTC+11).
const later = new Date("2026-10-13T23:00:00Z");
const ctx = { regulated: [] as never[], sites: ["https://coffee.example"] };
const post = (o: Partial<SocialDraft> = {}): SocialDraft => {
  const d: SocialDraft = {
    id: "2026-10-14-instagram-1", network: "instagram", format: "carousel", day: "2026-10-14",
    caption: "Cold brew keeps for a week. Here is how to make it right.", hashtags: ["coldbrew"],
    slides: [{ title: "Cold brew at home", body: "Coarse grind, 12 hours." }, { title: "Save this", body: "Link in bio." }],
    media: ["social/media/2026-W42/a-1.png", "social/media/2026-W42/a-2.png"], why: "From the blog", status: "approved", ...o,
  };
  return { ...d, checks: o.checks ?? checkSocial(d, ctx) };
};
const cfg: SocialConfig = { mode: "auto", networks: { instagram: { posting: "hq" } }, approveUntil: "2026-10-01T00:00:00Z", postHour: 9 };

// ---------------------------------------------------------------- the attempt limit

test("a business can stop at two attempts; the limit is checked and never unbounded", () => {
  assert.equal(attemptsAllowed(cfg), MAX_ATTEMPTS);
  const two = { ...cfg, maxAttempts: 2 };
  assert.equal(attemptsAllowed(two), 2);
  const at = (mins: number) => ({ at: new Date(later.getTime() - mins * 60e3).toISOString(), run: `r${mins}`, result: "error" as const });
  assert.match(dueNow(two, post({ attempts: [at(60)] }), later, TZ).why, /retry 2 of 2/);
  assert.deepEqual(dueNow(two, post({ attempts: [at(120), at(60)] }), later, TZ), { due: false, why: "tried 2 times" });
  for (const bad of [0, 6, 1.5, -1]) assert.throws(() => validateSocialConfig({ ...cfg, maxAttempts: bad }), /maxAttempts/);
  assert.equal(validateSocialConfig({ ...cfg, maxAttempts: 2 }).maxAttempts, 2);
});

// ---------------------------------------------------------------- the publisher on a temp HQ_DATA

function saveProfile(p: ReturnType<typeof profile>) {
  const dir = path.join(process.env.HQ_DATA!, "businesses", p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "profile.json"), JSON.stringify(p));
}
const coffee = (over: Partial<ReturnType<typeof profile>> = {}) => profile({ slug: "demo-coffee", name: "Demo Coffee", sites: ["https://coffee.example"], channels: { instagram: { handle: "@democoffee", via: "composio", account: "instagram_demo" } } as never, ...over });

async function setup(o: { draft?: Partial<SocialDraft>; config?: Partial<SocialConfig> } = {}) {
  tempData();
  const { writeSocialConfig, socialDir } = await import("../lib/social-store");
  saveProfile(coffee());
  writeSocialConfig("demo-coffee", { ...cfg, ...o.config });
  const week = path.join(socialDir("demo-coffee"), "drafts", "2026-W42"), mediaDir = path.join(socialDir("demo-coffee"), "media", "2026-W42");
  fs.mkdirSync(week, { recursive: true }); fs.mkdirSync(mediaDir, { recursive: true });
  for (const f of ["a-1.png", "a-2.png"]) fs.writeFileSync(path.join(mediaDir, f), "png");
  const d = post(o.draft);
  fs.writeFileSync(path.join(week, `${d.id}.json`), JSON.stringify(d));
  return d.id;
}

type Calls = { workbench: number; put: number };
function fakeDeps(script: (n: number, cells: string[], run: string) => CellResult[], calls: Calls, now = later) {
  return {
    now: () => now,
    toJpeg: async (_s: string, dest: string) => { fs.writeFileSync(dest, "jpg"); },
    put: async () => { calls.put++; },
    sha: async () => crypto.createHash("sha256").update("jpg").digest("hex"),
    workbench: async (cells: string[], run: string) => {
      calls.workbench++;
      if (cells[0].includes("presigned_url")) return { results: [{ run, status: "slots", slots: [1, 2].map((i) => ({ upload: `https://up/${i}`, download: `https://down/${i}` })) }] };
      return { results: script(calls.workbench, cells, run) };
    },
  };
}
const logLines = async () => {
  const { socialDir } = await import("../lib/social-store");
  return fs.readFileSync(path.join(socialDir("demo-coffee"), "log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
};

test("publisher: with maxAttempts 2 a post that fails twice is failed, logged, and not tried a third time", async () => {
  const id = await setup({ config: { maxAttempts: 2 } });
  const { publishDue } = await import("../lib/social-publisher");
  const { findSocial } = await import("../lib/social-store");
  const calls = { workbench: 0, put: 0 };
  const err = (_n: number, _c: string[], run: string): CellResult[] => [{ run, status: "error", stage: "container", error: "media could not be fetched" }];
  assert.equal((await publishDue("demo-coffee", fakeDeps(err, calls)))[0].status, "retry");
  assert.equal((await publishDue("demo-coffee", fakeDeps(err, calls, new Date(later.getTime() + 3600e3))))[0].status, "failed");
  const d = findSocial("demo-coffee", id);
  assert.equal(d.status, "failed");
  assert.equal(d.attempts?.length, 2);
  const before = calls.workbench;
  assert.deepEqual(await publishDue("demo-coffee", fakeDeps(err, calls, new Date(later.getTime() + 5 * 3600e3))), []);
  assert.equal(calls.workbench, before, "never retried on its own");
  assert.ok((await logLines()).some((l) => l.event === "publish-failed" && l.id === id));
});

test("publisher: in auto mode after week one a draft is approved by auto before it goes, and that is on record", async () => {
  const id = await setup({ draft: { status: "draft" } });
  const { publishDue } = await import("../lib/social-publisher");
  const { findSocial } = await import("../lib/social-store");
  const calls = { workbench: 0, put: 0 };
  let statusAtPost = "";
  const ok = (_n: number, _c: string[], run: string): CellResult[] => { statusAtPost = findSocial("demo-coffee", id).status; return [{ run, status: "posted", id: "777", url: "https://www.instagram.com/p/new/" }]; };
  const out = await publishDue("demo-coffee", fakeDeps(ok, calls));
  assert.equal(out[0].status, "posted");
  assert.equal(statusAtPost, "approved", "only an approved post reaches the platform");
  assert.ok((await logLines()).some((l) => l.event === "approved" && l.by === "auto" && l.id === id));
  assert.equal(findSocial("demo-coffee", id).status, "posted");
});

test("publisher: week one never posts a draft, and a draft is never posted even when asked for by id", async () => {
  const id = await setup({ draft: { status: "draft" }, config: { approveUntil: "2026-10-20T00:00:00Z" } });
  const { publishDue, publishOne, offlineDeps } = await import("../lib/social-publisher");
  const calls = { workbench: 0, put: 0 };
  assert.deepEqual(await publishDue("demo-coffee", fakeDeps(() => [], calls)), []);
  const one = await publishOne("demo-coffee", id, offlineDeps(later));
  assert.equal(one.status, "skipped");
  assert.match(one.detail, /only approved posts go out/);
  assert.equal(calls.workbench, 0);
});

test("publisher: checks run again at the moment of posting; a dash or a never-name added since is held, with no attempt", async () => {
  // The draft's stored checks passed, then its caption was edited to carry an em dash.
  const id = await setup({ draft: { caption: "Cold brew keeps for a week — here is how.", checks: checkSocial(post(), ctx) } });
  const { publishDue } = await import("../lib/social-publisher");
  const { findSocial, writeSocialConfig } = await import("../lib/social-store");
  const calls = { workbench: 0, put: 0 };
  const out = await publishDue("demo-coffee", fakeDeps(() => [], calls));
  assert.equal(out[0].status, "skipped");
  assert.match(out[0].detail, /a check fails now: no em or en dashes/);
  assert.equal(calls.workbench, 0, "nothing left the Mac");
  const d = findSocial("demo-coffee", id);
  assert.equal(d.attempts, undefined, "a held post uses up no attempt");
  assert.match(d.error ?? "", /dashes/);
  assert.ok((await logLines()).some((l) => l.event === "publish-held"));

  const id2 = await setup();
  writeSocialConfig("demo-coffee", { ...cfg, banned: ["Rival Roasters"] });
  const { saveSocial } = await import("../lib/social-store");
  const d2 = findSocial("demo-coffee", id2);
  saveSocial("demo-coffee", { ...d2, caption: "Better than Rival Roasters, and cheaper." });
  const out2 = await publishDue("demo-coffee", fakeDeps(() => [], calls));
  assert.match(out2[0].detail, /no banned claims, inducements or names/);
  assert.equal(calls.workbench, 0);
});

test("publisher: never posts to an account another business has pinned too", async () => {
  await setup();
  saveProfile(profile({ slug: "demo-bakery", name: "Demo Bakery", channels: { instagram: { handle: "@demobakery", via: "composio", account: "instagram_demo" } } as never }));
  const { publishDue } = await import("../lib/social-publisher");
  const calls = { workbench: 0, put: 0 };
  const out = await publishDue("demo-coffee", fakeDeps(() => [], calls));
  assert.equal(out[0].status, "skipped");
  assert.match(out[0].detail, /also pinned by another business \(demo-bakery\)/);
  assert.equal(calls.workbench, 0);
});

test("publisher: the dry run shows the account, the media and that the checks pass, and changes nothing", async () => {
  const id = await setup({ draft: { status: "draft" } });
  const { publishDue, offlineDeps } = await import("../lib/social-publisher");
  const { findSocial } = await import("../lib/social-store");
  const before = JSON.stringify(findSocial("demo-coffee", id));
  const out = await publishDue("demo-coffee", offlineDeps(later), { dryRun: true });
  assert.equal(out[0].status, "dry-run");
  assert.match(out[0].detail, /auto mode approves it, then would post now \(due\); via instagram_demo \(@democoffee\): 2 images, caption \d+ characters; checks pass/);
  assert.equal(JSON.stringify(findSocial("demo-coffee", id)), before);
});

// ---------------------------------------------------------------- the lock

test("the run lock: one holder at a time, a dead run's lock is cleared, and release only frees your own", async () => {
  tempData();
  saveProfile(coffee());
  const { acquireSocialLock, socialRunLock, LOCK_STALE_MIN } = await import("../lib/social-publisher");
  const a = acquireSocialLock("demo-coffee");
  assert.ok(a);
  assert.equal(acquireSocialLock("demo-coffee"), null, "an overlapping run gets nothing");
  a!.touch();
  a!.release();
  const b = acquireSocialLock("demo-coffee");
  assert.ok(b, "free again after release");
  a!.release();
  assert.ok(fs.existsSync(socialRunLock("demo-coffee")), "an old holder's release leaves the new holder's lock alone");
  const old = new Date(Date.now() - (LOCK_STALE_MIN + 5) * 60e3);
  fs.utimesSync(socialRunLock("demo-coffee"), old, old);
  const c = acquireSocialLock("demo-coffee");
  assert.ok(c, "a lock nobody touched for too long belonged to a run that died");
  b!.release();
  assert.ok(fs.existsSync(socialRunLock("demo-coffee")), "the dead run's release can't free the new lock");
  c!.release();
  assert.ok(!fs.existsSync(socialRunLock("demo-coffee")));
});

// ---------------------------------------------------------------- the finding

test("a failed post is a CEO finding with the way out, and only for the business's own posts", () => {
  const p = profile({ slug: "demo-coffee", name: "Demo Coffee" });
  const failed = [{ id: "2026-10-14-instagram-1", network: "instagram", format: "carousel", day: "2026-10-14", error: "container: media could not be fetched", attempts: 2 }];
  const out = buildFindings(depts(), facts({ social: { failed } }), p);
  const f = out.find((x) => x.id === "social-post-failed-2026-10-14-instagram-1");
  assert.ok(f);
  assert.equal(f!.severity, "attention");
  assert.equal(f!.dept, "content");
  assert.match(f!.detail, /failed 2 times and HQ stopped trying: container: media could not be fetched/);
  assert.match(f!.action, /social approve demo-coffee 2026-10-14-instagram-1/);
  assert.ok(!buildFindings(depts(), facts({ social: { failed } }), null).some((x) => x.id.startsWith("social-post-failed")));
  assert.ok(!buildFindings(depts(), facts({ social: { failed: [] } }), p).some((x) => x.id.startsWith("social-post-failed")));
});

// ---------------------------------------------------------------- Instagram's numbers

const NOW = Date.parse("2026-10-14T00:00:00Z");
const raw = {
  status: "insights", username: "democoffee", followers: 1200, following: 30, media_count: 80,
  new_followers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => ({ end: new Date(NOW - (10 - i) * 864e5 - 3600e3).toISOString().replace(".000Z", "+0000"), value: i % 3 })),
  weeks: [0, 1, 2, 3].map((k) => ({ since: NOW / 1000 - (k + 1) * 604800, until: NOW / 1000 - k * 604800, views: 1000 - k, reach: 400, website_clicks: 6 - k, profile_views: 50 })),
  posts: [
    { id: "p1", at: "2026-10-13T20:00:00+0000", type: "FEED", views: 10, reach: 8, follows: 1 }, // under a day old: still climbing
    { id: "p2", at: "2026-10-11T08:00:00+0000", type: "REELS", views: 300, reach: 200 },
    { id: "p3", at: "2026-10-09T08:00:00+0000", type: "FEED", views: 100, reach: 90, follows: 2 },
    { id: "p4", at: "2026-09-20T08:00:00+0000", type: "REELS", views: 500, reach: 300 },
  ],
  errors: [],
};

test("insights: followers, follows per post, views per post and link clicks from one read", () => {
  const f = summariseInsights(raw, { account: "instagram_demo", handle: "democoffee", at: new Date(NOW) });
  const s = f.summary;
  assert.equal(s.followers, 1200);
  // Days ending in the last 7 days: values i = 4..10 → i % 3 = 1,2,0,1,2,0,1 = 7.
  assert.equal(s.follows7, 7);
  assert.equal(s.posts7, 3, "p1, p2 and p3 went out in the last 7 days");
  assert.equal(s.followsPerPost7, 2.33);
  assert.equal(s.viewsPerPost, 300, "average of p2, p3 and p4; p1 is under a day old");
  assert.equal(s.viewsPosts, 3);
  assert.equal(s.linkClicks7, 6);
  assert.equal(f.newFollowers.length, 10);
  assert.ok(!JSON.stringify(f).includes("caption") && !JSON.stringify(f).includes("permalink"), "no captions or links kept");
  const none = summariseInsights({ status: "insights", followers: 5, posts: [], weeks: [], new_followers: [] }, { account: "a", handle: "h", at: new Date(NOW) });
  assert.equal(none.summary.followsPerPost7, null, "no posts: no per-post number, never a zero");
  assert.equal(none.summary.viewsPerPost, null);
  assert.equal(none.summary.linkClicks7, null);
});

const PY = `
import sys,json,types
cells=json.load(open(sys.argv[1])); sc=json.load(open(sys.argv[2]))
calls=[]
req=types.ModuleType("requests"); req.get=lambda *a,**k:None; req.post=lambda *a,**k:None
sys.modules["requests"]=req
def run_composio_tool(slug,args,print_schema_for_tool=True,account=None):
  calls.append({"slug":slug,"account":account})
  return {"data":sc.get(slug,{})},""
for c in cells:
  exec(c,{"run_composio_tool":run_composio_tool,"upload_local_file":lambda *p:({},"")})
print("CALLS "+json.dumps(calls))
`;
const hasPython = spawnSync("python3", ["--version"]).status === 0;
function runCell(cell: string, responses: object) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-ins-"));
  fs.writeFileSync(path.join(dir, "h.py"), PY);
  fs.writeFileSync(path.join(dir, "cells.json"), JSON.stringify([cell]));
  fs.writeFileSync(path.join(dir, "sc.json"), JSON.stringify(responses));
  const out = execFileSync("python3", ["-W", "ignore", path.join(dir, "h.py"), path.join(dir, "cells.json"), path.join(dir, "sc.json")], { encoding: "utf8", env: { ...process.env, HQ_SOCIAL_STATE: path.join(dir, "state") } });
  return {
    results: out.split("\n").filter((l) => l.startsWith("HQ_RESULT ")).map((l) => JSON.parse(l.slice(10))) as CellResult[],
    calls: JSON.parse(out.split("\n").find((l) => l.startsWith("CALLS "))!.slice(6)) as { slug: string; account: string }[],
  };
}
const fake = {
  INSTAGRAM_GET_USER_INFO: { user_id: "1784", username: "democoffee", followers_count: 1200, follows_count: 30, media_count: 80 },
  INSTAGRAM_GET_USER_INSIGHTS: { data: [{ name: "follower_count", values: [{ end_time: "2026-10-13T07:00:00+0000", value: 3 }] }, { name: "views", total_value: { value: 900 } }, { name: "website_clicks", total_value: { value: 4 } }] },
  INSTAGRAM_GET_IG_USER_MEDIA: { data: [{ id: "11", timestamp: "2026-10-10T08:00:00+0000", media_type: "CAROUSEL_ALBUM", media_product_type: "FEED" }] },
  INSTAGRAM_GET_IG_MEDIA_INSIGHTS: { data: [{ name: "views", values: [{ value: 120 }] }, { name: "reach", values: [{ value: 90 }] }] },
};
const cell = (o: Partial<Parameters<typeof insightsCell>[0]> = {}) => insightsCell({ run: "i1", account: "instagram_demo", handle: "democoffee", now: NOW / 1000, ...o });

test("insights cell: read-only tools on the pinned account, after checking whose account it is", { skip: !hasPython && "python3 not installed" }, () => {
  const { results, calls } = runCell(cell(), fake);
  const r = results.at(-1)!;
  assert.equal(r.status, "insights");
  assert.equal(r.followers, 1200);
  assert.equal((r.posts as { views: number }[])[0].views, 120);
  assert.equal((r.weeks as unknown[]).length, 4);
  assert.ok(calls.every((c) => /^INSTAGRAM_GET_/.test(c.slug)), "only GET tools");
  assert.ok(calls.every((c) => c.account === "instagram_demo"), "every call names the pinned account");
  assert.equal(calls[0].slug, "INSTAGRAM_GET_USER_INFO", "whose account it is comes first");
  const wrong = runCell(cell(), { ...fake, INSTAGRAM_GET_USER_INFO: { username: "someoneelse" } });
  assert.match(String(wrong.results.at(-1)?.error), /wrong account/);
  assert.equal(wrong.calls.length, 1);
  const bad = runCell(cell().replace('\\"democoffee\\"', '\\"democoffe\\"'), fake);
  assert.match(String(bad.results.at(-1)?.error), /integrity/);
  assert.equal(bad.calls.length, 0);
});

test("insights: the read is kept for the adapter, with a followers line per read; a dry run or no pinned account calls nothing", async () => {
  await setup();
  const { refreshInsights, readInsights, insightsDue, offlineDeps } = await import("../lib/social-publisher");
  const { socialDir } = await import("../lib/social-store");
  const calls = { workbench: 0, put: 0 };
  const dry = await refreshInsights("demo-coffee", offlineDeps(new Date(NOW)), { dryRun: true });
  assert.equal(dry.status, "dry-run");
  assert.match(dry.detail, /instagram_demo \(@democoffee\).*read-only/);
  assert.equal(insightsDue("demo-coffee", new Date(NOW)), true);
  const r = await refreshInsights("demo-coffee", fakeDeps((_n, _c, run) => [{ ...raw, run } as CellResult], calls, new Date(NOW)));
  assert.equal(r.status, "read");
  assert.equal(readInsights("demo-coffee")?.summary.followers, 1200);
  assert.equal(insightsDue("demo-coffee", new Date(NOW + 3600e3)), false, "read once a day");
  assert.equal(insightsDue("demo-coffee", new Date(NOW + 21 * 3600e3)), true);
  const hist = fs.readFileSync(path.join(socialDir("demo-coffee"), "insights-history.jsonl"), "utf8").trim().split("\n");
  assert.equal(JSON.parse(hist[0]).followers, 1200);
  const failed = await refreshInsights("demo-coffee", fakeDeps((_n, _c, run) => [{ run, status: "error", stage: "insights", error: "wrong account: x" }], calls, new Date(NOW + 864e5)));
  assert.equal(failed.status, "failed");
  assert.equal(readInsights("demo-coffee")?.at, new Date(NOW).toISOString(), "a failed read keeps the last good one");
  saveProfile(coffee({ channels: { instagram: "@democoffee" } }));
  const before = calls.workbench;
  assert.match((await refreshInsights("demo-coffee", fakeDeps(() => [], calls))).detail, /no Instagram account pinned/);
  assert.equal(calls.workbench, before);
});

test("drafts written ahead for later weeks don't push this week's posts out of the publish queue", async () => {
  const id = await setup();
  const { socialDir } = await import("../lib/social-store");
  const { publishQueue } = await import("../lib/social-publisher");
  for (const w of ["2026-W43", "2026-W44"]) {
    const dir = path.join(socialDir("demo-coffee"), "drafts", w);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${w}-instagram-1.json`), JSON.stringify(post({ id: `${w}-instagram-1`, day: w === "2026-W43" ? "2026-10-21" : "2026-10-28" })));
  }
  const q = publishQueue("demo-coffee", later);
  const mine = q.find((x) => x.d.id === id);
  assert.ok(mine, "this week's post is still in the queue");
  assert.equal(mine!.due, true);
  assert.ok(!q.some((x) => x.d.week === "2026-W44"), "weeks after this one aren't read");
});
