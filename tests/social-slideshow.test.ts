// Carousels that go out as a slideshow Reel with music: the config, the timing, the track pick, the video ffmpeg makes,
// the Reel frames, and the publisher posting the video as a reel (never a silent carousel). Demo business only.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { tempData, profile } from "./helpers";
import { asSlideshow, checkSocial, validateSocialConfig, type SocialConfig, type SocialDraft } from "../lib/social";
import { FADE, pickTrack, slideSeconds, slideshowArgs, validateTracks, type Track } from "../lib/social-slideshow";
import { cardHtml } from "../lib/social-cards";
import type { CellResult } from "../lib/social-publish";

const cfg: SocialConfig = { mode: "auto", networks: { instagram: { posting: "hq" } }, approveUntil: "2026-10-01T00:00:00Z", postHour: 9, slideshow: { networks: ["instagram"], music: "music" } };
const track = (file: string, o: Partial<Track> = {}): Track => ({ file, title: `Song ${file}`, artist: "Demo Artist", licence: "Free licence", source: "https://music.example/x", ...o });

// ---------------------------------------------------------------- config and the pure parts

test("slideshow config: Instagram carousels only, a folder inside the social folder", () => {
  assert.equal(validateSocialConfig(cfg).slideshow?.music, "music");
  for (const bad of [{ networks: [], music: "music" }, { networks: ["pinterest"], music: "music" }, { networks: ["instagram"], music: "../music" }, { networks: ["instagram"], music: "/abs" }, { networks: ["instagram"] }])
    assert.throws(() => validateSocialConfig({ ...cfg, slideshow: bad }), /slideshow must be/);
  assert.equal(asSlideshow(cfg, { format: "carousel", network: "instagram" }), true);
  assert.equal(asSlideshow(cfg, { format: "image", network: "instagram" }), false, "only carousels");
  assert.equal(asSlideshow({ ...cfg, slideshow: undefined }, { format: "carousel", network: "instagram" }), false, "off unless set up");
});

test("tracks.json: every track names its file, title, artist, licence and source", () => {
  assert.equal(validateTracks({ tracks: [track("a.mp3", { start: 2.5 })] })[0].start, 2.5);
  assert.throws(() => validateTracks({ tracks: [] }), /non-empty/);
  assert.throws(() => validateTracks({ tracks: [track("../a.mp3")] }), /file name/);
  assert.throws(() => validateTracks({ tracks: [track("a.mp3", { licence: "" })] }), /needs licence/);
  assert.throws(() => validateTracks({ tracks: [track("a.mp3", { start: -1 })] }), /start/);
});

test("track pick: the same post keeps its track, and recent slideshows' tracks are passed over while others are left", () => {
  const ts = ["a.mp3", "b.mp3", "c.mp3"].map((f) => track(f));
  const first = pickTrack(ts, "2026-10-14-instagram-1");
  assert.equal(pickTrack(ts, "2026-10-14-instagram-1").file, first.file);
  const other = pickTrack(ts, "2026-10-14-instagram-1", [first.file]);
  assert.notEqual(other.file, first.file);
  assert.ok(pickTrack(ts, "x", ts.map((t) => t.file)), "all used recently: still picks one");
});

test("slide timing: long enough to read, never under 2.5 s or over 5.5 s, a short hook and time on the ask", () => {
  const long = "word ".repeat(60);
  assert.equal(slideSeconds({ title: "Hi" }, 1, 5), 2.5);
  assert.equal(slideSeconds({ title: "x", body: long }, 1, 5), 5.5);
  assert.ok(slideSeconds({ title: "x", body: long }, 0, 5) <= 3.5, "the hook");
  assert.ok(slideSeconds({ title: "Follow", kind: "cta" }, 4, 5) >= 3, "the ask");
  const twelve = { title: "one two three four five six", body: "seven eight nine ten eleven twelve" };
  assert.equal(slideSeconds(twelve, 2, 5), Math.round((1 + 12 / 4.2) * 10) / 10);
});

test("ffmpeg arguments: each slide held its time, cross-fades at the running total, music from its start, exact length", () => {
  const { args, seconds } = slideshowArgs({ frames: [{ file: "a.png", seconds: 3 }, { file: "b.png", seconds: 4 }, { file: "c.png", seconds: 2.5 }], track: "t.mp3", start: 6.6, out: "o.mp4" });
  assert.equal(seconds, 9.5);
  const g = args[args.indexOf("-filter_complex") + 1];
  assert.match(g, new RegExp(`xfade=transition=fade:duration=${FADE}:offset=3\\[x0\\]`));
  assert.match(g, /offset=7\[x1\]/);
  assert.match(g, /\[3:a\]atrim=0:9\.5,.*loudnorm=I=-14/);
  assert.deepEqual(args.slice(args.indexOf("-ss"), args.indexOf("-ss") + 4), ["-ss", "6.6", "-i", "t.mp3"]);
  assert.equal(args[args.indexOf("-t", args.indexOf("-filter_complex")) + 1], "9.5");
  // Every frame but the last is held for the fade too, so the cross-fade never runs out of picture.
  assert.deepEqual(args.filter((_, i) => args[i - 1] === "-t").slice(0, 3), [String(3 + FADE), String(4 + FADE), "2.5"]);
  assert.ok(args.includes("+faststart") && args.includes("aac") && args.includes("libx264"));
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
test("ffmpeg makes a 9:16 Reel of the slides' length with a music track", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-slideshow-"));
  try {
    for (const [i, c] of ["blue", "white"].entries()) spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `color=c=${c}:s=1080x1920`, "-frames:v", "1", path.join(dir, `f${i}.png`)]);
    spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", path.join(dir, "t.mp3")]);
    const out = path.join(dir, "o.mp4");
    const { args, seconds } = slideshowArgs({ frames: [{ file: path.join(dir, "f0.png"), seconds: 2.5 }, { file: path.join(dir, "f1.png"), seconds: 3 }], track: path.join(dir, "t.mp3"), start: 1, out });
    const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,sample_rate", "-show_entries", "format=duration", "-of", "json", out], { encoding: "utf8" });
    const j = JSON.parse(probe.stdout) as { streams: { codec_type: string; width?: number; height?: number; sample_rate?: string }[]; format: { duration: string } };
    const v = j.streams.find((s) => s.codec_type === "video"), a = j.streams.find((s) => s.codec_type === "audio");
    assert.deepEqual([v?.width, v?.height], [1080, 1920]);
    assert.equal(a?.sample_rate, "48000", "the track is under it (looped past its end)");
    assert.ok(Math.abs(Number(j.format.duration) - seconds) < 0.15, `lasts ${j.format.duration}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Reel frames drop the swipe cues and keep clear of Instagram's caption and buttons", () => {
  const palette = { bg: "#fff", ink: "#111", primary: "#1d4ed8", accent: "#93c5fd" };
  const o = { title: "Cold brew at home", index: 1, total: 3, brand: "Demo Coffee", palette, mark: null, w: 1080, h: 1920 };
  assert.match(cardHtml(o), /Swipe →/);
  const reel = cardHtml({ ...o, reel: true });
  assert.doesNotMatch(reel, /Swipe →|class="arr"/);
  assert.match(reel, /\.card\{[^}]*padding:260px 150px 520px 88px/);
});

// ---------------------------------------------------------------- the publisher

const TZ_NOW = new Date("2026-10-13T23:00:00Z"); // 2026-10-14 10:00 in Sydney
const ctx = { regulated: [] as never[], sites: ["https://coffee.example"] };
const post = (o: Partial<SocialDraft> = {}): SocialDraft => {
  const d: SocialDraft = {
    id: "2026-10-14-instagram-1", network: "instagram", format: "carousel", day: "2026-10-14",
    caption: "Cold brew keeps for a week. Here is how to make it right.", hashtags: ["coldbrew"],
    slides: [{ title: "Cold brew at home", body: "Coarse grind, 12 hours." }, { title: "Save this", body: "Link in bio." }],
    media: ["social/media/2026-W42/a-1.png", "social/media/2026-W42/a-2.png"], why: "From the blog", status: "approved", ...o,
  };
  return { ...d, checks: checkSocial(d, ctx) };
};

async function setup(draft: Partial<SocialDraft> = {}) {
  tempData();
  const { writeSocialConfig, socialDir } = await import("../lib/social-store");
  const p = profile({ slug: "demo-coffee", name: "Demo Coffee", sites: ["https://coffee.example"], channels: { instagram: { handle: "@democoffee", via: "composio", account: "instagram_demo" } } as never });
  const bdir = path.join(process.env.HQ_DATA!, "businesses", p.slug);
  fs.mkdirSync(bdir, { recursive: true });
  fs.writeFileSync(path.join(bdir, "profile.json"), JSON.stringify(p));
  writeSocialConfig("demo-coffee", cfg);
  const week = path.join(socialDir("demo-coffee"), "drafts", "2026-W42"), media = path.join(socialDir("demo-coffee"), "media", "2026-W42");
  fs.mkdirSync(week, { recursive: true }); fs.mkdirSync(media, { recursive: true });
  for (const f of ["a-1.png", "a-2.png"]) fs.writeFileSync(path.join(media, f), "png");
  const d = post(draft);
  fs.writeFileSync(path.join(week, `${d.id}.json`), JSON.stringify(d));
  return { id: d.id, media };
}

test("publisher: a slideshow carousel with no video yet is held, never posted as a silent carousel", async () => {
  const { id } = await setup();
  const { publishOne } = await import("../lib/social-publisher");
  let calls = 0;
  const deps = { now: () => TZ_NOW, toJpeg: async () => {}, put: async () => {}, sha: async () => "", workbench: async () => { calls++; return { results: [] }; } };
  const out = await publishOne("demo-coffee", id, deps);
  assert.equal(out.status, "skipped");
  assert.match(out.detail, /slideshow Reel isn't made yet/);
  assert.equal(calls, 0);
});

test("publisher: a slideshow carousel goes out as a reel carrying its video, and the dry run says so", async () => {
  const reel = { path: "social/media/2026-W42/2026-10-14-instagram-1-reel.mp4", track: "Song a.mp3 by Demo Artist", trackFile: "a.mp3", seconds: 6.5 };
  const { id, media } = await setup({ reel });
  fs.writeFileSync(path.join(media, "2026-10-14-instagram-1-reel.mp4"), "mp4");
  const { publishDue, publishOne, offlineDeps } = await import("../lib/social-publisher");
  const dry = await publishDue("demo-coffee", offlineDeps(TZ_NOW), { dryRun: true });
  assert.match(dry[0].detail, /slideshow Reel \(6\.5 s, music: Song a\.mp3 by Demo Artist\)/);

  const sent: { mimetype: string }[] = [];
  let postCells = "";
  const deps = {
    now: () => TZ_NOW,
    toJpeg: async () => { throw Error("a slideshow sends no JPEG cards"); },
    put: async (_u: string, _f: string, mimetype: string) => { sent.push({ mimetype }); },
    sha: async () => crypto.createHash("sha256").update("mp4").digest("hex"),
    workbench: async (cells: string[], run: string): Promise<{ results: CellResult[] }> => {
      if (cells[0].includes("presigned_url")) return { results: [{ run, status: "slots", slots: [{ upload: "https://up/1", download: "https://down/1" }] }] };
      postCells = cells.join("\n");
      return { results: [{ run, status: "posted", id: "888", url: "https://www.instagram.com/reel/new/" }] };
    },
  };
  const out = await publishOne("demo-coffee", id, deps);
  assert.equal(out.status, "posted");
  assert.deepEqual(sent, [{ mimetype: "video/mp4" }], "one video, no cards");
  assert.match(postCells, /\\"format\\":\\"reel\\"/, "the workbench makes a REELS container");
  const { findSocial } = await import("../lib/social-store");
  assert.equal(findSocial("demo-coffee", id).status, "posted");
});
