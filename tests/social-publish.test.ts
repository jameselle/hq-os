import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import { tempData, profile } from "./helpers";
import { checkSocial, decideSocial, type SocialConfig, type SocialDraft } from "../lib/social";
import { buildPayload, dueNow, instagramCells, pinterestCells, resultsFromStream, MAX_ATTEMPTS, type CellResult } from "../lib/social-publish";

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
const cfg: SocialConfig = { mode: "auto", networks: { instagram: { posting: "hq" }, pinterest: { posting: "hq", board: "123" }, x: { posting: "hand" } }, approveUntil: "2026-10-13T00:00:00Z", postHour: 9 };
const TZ = "Australia/Sydney";
// 2026-10-14 08:00 and 10:00 in Sydney (UTC+11).
const early = new Date("2026-10-13T21:00:00Z"), later = new Date("2026-10-13T23:00:00Z");

test("a post is due on its day from the posting hour, and not before", () => {
  assert.equal(dueNow(cfg, post({ day: "2026-10-15" }), later, TZ).due, false);
  assert.match(dueNow(cfg, post(), early, TZ).why, /from 9:00/);
  assert.equal(dueNow(cfg, post(), later, TZ).due, true);
  assert.equal(dueNow(cfg, post({ day: "2026-10-13" }), early, TZ).due, true, "yesterday's post goes out at once");
  assert.match(dueNow(cfg, post({ day: "2026-10-10" }), later, TZ).why, /days late/);
});

test("only approved (or auto after week one) posts on HQ networks in formats HQ can post are due", () => {
  assert.equal(dueNow(cfg, post({ status: "draft" }), new Date("2026-10-12T23:00:00Z"), TZ).due, false, "week one waits for a yes");
  assert.equal(dueNow(cfg, post({ status: "draft" }), later, TZ).due, true, "after week one, auto posts drafts");
  assert.equal(dueNow(cfg, post({ network: "x", format: "post", slides: undefined, media: undefined }), later, TZ).due, false);
  const reel = post({ format: "reel", slides: undefined, media: undefined, video: { brief: "Show the pour" } });
  assert.equal(decideSocial(cfg, reel, later), "hand");
  assert.match(dueNow(cfg, reel, later, TZ).why, /by hand: it needs a video/);
  assert.equal(dueNow(cfg, post({ status: "posted", url: "https://www.instagram.com/p/x/" }), later, TZ).due, false);
});

test("retries wait between attempts and stop after the last one", () => {
  const at = (mins: number) => ({ at: new Date(later.getTime() - mins * 60e3).toISOString(), run: `r${mins}`, result: "error" as const });
  assert.match(dueNow(cfg, post({ attempts: [at(10)] }), later, TZ).why, /retrying later/);
  assert.match(dueNow(cfg, post({ attempts: [at(60)] }), later, TZ).why, /retry 2 of 3/);
  assert.match(dueNow(cfg, post({ attempts: [at(180), at(120), at(60)] }), later, TZ).why, /tried 3 times/);
  assert.equal(decideSocial(cfg, post({ status: "failed" }), later), "failed");
});

test("only the workbench's own output counts, never the model's words, and only for this run", () => {
  const tool = (stdout: string) => JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: [{ type: "text", text: JSON.stringify({ data: { stdout } }) }] }] } });
  const said = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: 'HQ_RESULT {"run":"abc","status":"posted","url":"https://fake"}' }] } });
  const stream = [said, tool('x\nHQ_RESULT {"run":"abc","status":"staged"}\n'), tool('HQ_RESULT {"run":"zzz","status":"posted"}'), tool('HQ_RESULT {"run":"abc","status":"posted","id":"1","url":"https://www.instagram.com/p/x/"}')].join("\n");
  assert.deepEqual(resultsFromStream(stream, "abc").map((r) => r.status), ["staged", "posted"]);
});

// ---------------------------------------------------------------- the cells, run against a fake Composio

const PY = `
import sys,json,types,hashlib
cells=json.load(open(sys.argv[1])); sc=json.load(open(sys.argv[2]))
calls=[]
class R:
  def __init__(s,b): s.content=b
req=types.ModuleType("requests"); req.get=lambda u,**k:R(sc["bytes"][u].encode()); req.post=lambda *a,**k:None
sys.modules["requests"]=req
def run_composio_tool(slug,args,print_schema_for_tool=True,account=None):
  calls.append({"slug":slug,"account":account,"args":{k:v for k,v in args.items() if k!="media_source"}})
  return {"data":sc["responses"].get(slug,{"id":"9"})},""
def upload_local_file(*p): return {"s3key":"k/"+p[0].split("/")[-1]},""
for c in cells:
  g={"run_composio_tool":run_composio_tool,"upload_local_file":upload_local_file}
  exec(c,g)
print("CALLS "+json.dumps(calls))
`;

function runCells(cells: string[], scenario: object): { results: CellResult[]; calls: { slug: string; account: string; args: Record<string, unknown> }[] } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-cells-"));
  fs.writeFileSync(path.join(dir, "h.py"), PY);
  fs.writeFileSync(path.join(dir, "cells.json"), JSON.stringify(cells));
  fs.writeFileSync(path.join(dir, "sc.json"), JSON.stringify(scenario));
  const out = execFileSync("python3", ["-W", "ignore", path.join(dir, "h.py"), path.join(dir, "cells.json"), path.join(dir, "sc.json")], { encoding: "utf8", env: { ...process.env, HQ_SOCIAL_STATE: path.join(dir, "state") } });
  const results = out.split("\n").filter((l) => l.startsWith("HQ_RESULT ")).map((l) => JSON.parse(l.slice(10)));
  const calls = JSON.parse(out.split("\n").find((l) => l.startsWith("CALLS "))!.slice(6));
  return { results, calls };
}
const hasPython = spawnSync("python3", ["--version"]).status === 0;
const img = "card-bytes";
const media = [1, 2].map((i) => ({ url: `https://files.example/${i}`, name: `a-${i}.jpg`, mimetype: "image/jpeg", sha256: crypto.createHash("sha256").update(img).digest("hex") }));
const bytes = Object.fromEntries(media.map((m) => [m.url, img]));
const payload = (o: Partial<Parameters<typeof buildPayload>[0]> = {}) => buildPayload({ run: "r1", network: "instagram", format: "carousel", account: "instagram_demo", handle: "democoffee", caption: "Cold brew keeps for a week.\n\n#coldbrew", media, mode: "publish", day: "2026-10-14", ...o });
const me = { INSTAGRAM_GET_USER_INFO: { user_id: "1784", username: "democoffee" } };

test("Instagram: a post already on the account is recorded, never posted again", { skip: !hasPython && "python3 not installed" }, () => {
  const live = { data: [{ id: "555", caption: "Cold brew keeps for a week.\n\n#coldbrew", timestamp: "2026-10-13T23:05:00+0000", permalink: "https://www.instagram.com/p/abc/" }] };
  const { results, calls } = runCells(instagramCells(payload({ retry: true })), { bytes, responses: { ...me, INSTAGRAM_GET_IG_USER_MEDIA: live } });
  assert.equal(results.at(-1)?.status, "found");
  assert.equal(results.at(-1)?.url, "https://www.instagram.com/p/abc/");
  assert.ok(!calls.some((c) => /POST_IG_USER_MEDIA|CAROUSEL|PUBLISH/.test(c.slug)), "made or published nothing");
  assert.ok(calls.every((c) => c.account === "instagram_demo"), "every call names the account");
});

test("Instagram: a new carousel is staged, made and published, then read back", { skip: !hasPython && "python3 not installed" }, () => {
  const { results, calls } = runCells(instagramCells(payload()), { bytes, responses: { ...me, INSTAGRAM_GET_IG_USER_MEDIA: { data: [] }, INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH: { id: "777" }, INSTAGRAM_GET_IG_MEDIA: { id: "777", permalink: "https://www.instagram.com/p/new/" } } });
  assert.deepEqual(results.map((r) => r.status), ["staged", "container", "publishing", "posted"]);
  assert.equal(results.at(-1)?.url, "https://www.instagram.com/p/new/");
  assert.equal(calls.filter((c) => c.slug === "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH").length, 1);
  assert.equal(calls.filter((c) => c.slug === "INSTAGRAM_POST_IG_USER_MEDIA").length, 2, "one child per card");
  assert.ok(calls.findIndex((c) => c.slug === "INSTAGRAM_GET_IG_USER_MEDIA") < calls.findIndex((c) => c.slug === "INSTAGRAM_POST_IG_USER_MEDIA"), "looks before it makes anything");
});

test("Instagram: the container dry check never publishes, and a wrong account or a bad copy stops everything", { skip: !hasPython && "python3 not installed" }, () => {
  const base = { bytes, responses: { ...me, INSTAGRAM_GET_IG_USER_MEDIA: { data: [] } } };
  const dry = runCells(instagramCells(payload({ mode: "container" })), base);
  assert.equal(dry.results.at(-1)?.status, "container");
  assert.ok(!dry.calls.some((c) => c.slug === "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH"));
  const wrong = runCells(instagramCells(payload()), { ...base, responses: { ...base.responses, INSTAGRAM_GET_USER_INFO: { user_id: "1", username: "someoneelse" } } });
  assert.match(String(wrong.results.at(-1)?.error), /wrong account/);
  assert.equal(wrong.calls.length, 1);
  const cells = instagramCells(payload()).map((c) => c.replace("Cold brew keeps", "Cold brew lasts"));
  const bad = runCells(cells, base);
  assert.match(String(bad.results.at(-1)?.error), /integrity/);
  assert.equal(bad.calls.length, 0);
  const good = instagramCells(payload());
  const lastBad = runCells([good[0], good[1], good[2].replace("Cold brew keeps", "Cold brew lasts")], base);
  assert.match(String(lastBad.results.at(-1)?.error), /integrity/);
  assert.ok(!lastBad.calls.some((c) => c.slug === "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH"), "a bad copy of the publish cell publishes nothing");
});

test("Pinterest: looks on the board by title first, then pins and reads it back", { skip: !hasPython && "python3 not installed" }, () => {
  const p = buildPayload({ run: "p1", network: "pinterest", format: "pin", account: "pinterest_demo", board: "123", title: "Cold brew at home", caption: "How to make it.", link: "https://coffee.example/cold-brew", media: media.slice(0, 1), mode: "publish", day: "2026-10-14" });
  const board = { PINTEREST_GET_BOARD: { id: "123", name: "Coffee" } };
  const found = runCells(pinterestCells(p), { bytes, responses: { ...board, PINTEREST_LIST_PINS: { items: [{ id: "42", title: "Cold brew at home", created_at: "2026-10-13T23:00:00" }] } } });
  assert.equal(found.results.at(-1)?.status, "found");
  assert.ok(!found.calls.some((c) => c.slug === "PINTEREST_CREATE_PIN"));
  const made = runCells(pinterestCells(p), { bytes, responses: { ...board, PINTEREST_LIST_PINS: { items: [] }, PINTEREST_CREATE_PIN: { id: "43" }, PINTEREST_GET_PIN: { id: "43" } } });
  assert.equal(made.results.at(-1)?.url, "https://www.pinterest.com/pin/43/");
  assert.equal(made.calls.filter((c) => c.slug === "PINTEREST_CREATE_PIN").length, 1);
});

// ---------------------------------------------------------------- the publisher, end to end on a temp HQ_DATA

function saveProfile(p: ReturnType<typeof profile>) {
  const dir = path.join(process.env.HQ_DATA!, "businesses", p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "profile.json"), JSON.stringify(p));
}

async function setup() {
  tempData();
  const { writeSocialConfig, socialDir } = await import("../lib/social-store");
  const p = profile({ slug: "demo-coffee", name: "Demo Coffee", sites: ["https://coffee.example"], channels: { instagram: { handle: "@democoffee", via: "composio", account: "instagram_demo" } } as never });
  saveProfile(p);
  writeSocialConfig("demo-coffee", { ...cfg, approveUntil: "2026-10-01T00:00:00Z" });
  const week = path.join(socialDir("demo-coffee"), "drafts", "2026-W42"), mediaDir = path.join(socialDir("demo-coffee"), "media", "2026-W42");
  fs.mkdirSync(week, { recursive: true }); fs.mkdirSync(mediaDir, { recursive: true });
  for (const f of ["a-1.png", "a-2.png"]) fs.writeFileSync(path.join(mediaDir, f), "png");
  const d = post();
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

test("publisher: the attempt is on disk before any call, and a found post is never posted again", async () => {
  const id = await setup();
  const { publishDue } = await import("../lib/social-publisher");
  const { findSocial, listSocial } = await import("../lib/social-store");
  const calls = { workbench: 0, put: 0 };
  let seen = 0;
  const deps = fakeDeps((_n, _c, run) => { seen = findSocial("demo-coffee", id).attempts?.length ?? 0; return [{ run, status: "found", id: "555", url: "https://www.instagram.com/p/abc/" }]; }, calls);
  const out = await publishDue("demo-coffee", deps);
  assert.equal(seen, 1, "the attempt was written before the post call");
  assert.equal(out[0].status, "found");
  const d = findSocial("demo-coffee", id);
  assert.equal(d.status, "posted");
  assert.equal(d.url, "https://www.instagram.com/p/abc/");
  const before = calls.workbench;
  assert.deepEqual(await publishDue("demo-coffee", deps), []);
  assert.equal(calls.workbench, before, "nothing runs for a posted post");
  assert.equal(listSocial("demo-coffee").length, 1);
});

test("publisher: errors retry later, then fail for the owner; approving again starts over", async () => {
  const id = await setup();
  const { publishDue } = await import("../lib/social-publisher");
  const { findSocial, setSocialStatus } = await import("../lib/social-store");
  const calls = { workbench: 0, put: 0 };
  const err = (_n: number, _c: string[], run: string): CellResult[] => [{ run, status: "error", stage: "container", error: "media could not be fetched" }];
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const out = await publishDue("demo-coffee", fakeDeps(err, calls, new Date(later.getTime() + i * 3600e3)));
    assert.equal(out[0].status, i < MAX_ATTEMPTS - 1 ? "retry" : "failed");
  }
  const d = findSocial("demo-coffee", id);
  assert.equal(d.status, "failed");
  assert.match(d.error ?? "", /media could not be fetched/);
  assert.equal(decideSocial(cfg, d, later), "failed");
  assert.deepEqual(await publishDue("demo-coffee", fakeDeps(err, calls, new Date(later.getTime() + 5 * 3600e3))), []);
  setSocialStatus("demo-coffee", id, "approved");
  assert.equal(findSocial("demo-coffee", id).attempts, undefined);
});

test("publisher: --dry-run makes no external calls and changes nothing", async () => {
  const id = await setup();
  const { publishDue, offlineDeps } = await import("../lib/social-publisher");
  const { findSocial } = await import("../lib/social-store");
  const before = JSON.stringify(findSocial("demo-coffee", id));
  const out = await publishDue("demo-coffee", offlineDeps(later), { dryRun: true });
  assert.equal(out[0].status, "dry-run");
  assert.match(out[0].detail, /would post now \(due\); via instagram_demo \(@democoffee\): 2 images/);
  assert.equal(JSON.stringify(findSocial("demo-coffee", id)), before);
});

test("publisher: no pinned account means no post", async () => {
  const id = await setup();
  saveProfile(profile({ slug: "demo-coffee", name: "Demo Coffee", channels: { instagram: "@democoffee" } }));
  const { publishDue } = await import("../lib/social-publisher");
  const calls = { workbench: 0, put: 0 };
  const out = await publishDue("demo-coffee", fakeDeps(() => [], calls));
  assert.equal(out[0].id, id);
  assert.match(out[0].detail, /no instagram account pinned/);
  assert.equal(calls.workbench, 0);
});

test("the automatic posting guide uses the demo business and no real account shapes", () => {
  const doc = fs.readFileSync(path.resolve(__dirname, "..", "docs", "guides", "social.md"), "utf8");
  const at = doc.search(/^## (\d+\. )?Automatic posting$/m);
  assert.ok(at > 0, "the guide has an Automatic posting section");
  const auto = doc.slice(at);
  assert.match(auto, /Demo Coffee|demo-coffee/);
  assert.doesNotMatch(auto, /\b(instagram|pinterest)_[a-z]+-[a-z]+\b/, "no real Composio connection ids");
  assert.doesNotMatch(auto, /\b\d{15,}\b/, "no real board or account ids");
});
