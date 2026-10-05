import assert from "node:assert/strict";
import { test } from "node:test";

import { SHAPES, candidateIds, formatRanking, indexRows, pickThumb, poolEntries, sourceOf, titlesJsonl } from "../lib/studio/arena";

test("every cover shape keeps its aspect and upstream's pixel count (within 3%), so the clutter and focal scales hold", () => {
  for (const [shape, size] of Object.entries(SHAPES)) {
    const [sw, sh] = shape.split("x").map(Number);
    const [w, h] = size.split("x").map(Number);
    assert.ok(Math.abs(w * h - 96 * 54) / (96 * 54) < 0.03, `${size} pixel count`);
    assert.ok(Math.abs(w / h - sw / sh) < 0.02, `${size} is ${shape}`);
  }
  assert.equal(SHAPES["9x16"], "54x96");
});

test("sourceOf reads the account from TikTok and YouTube channel URLs, and leaves a Short to yt-dlp", () => {
  assert.deepEqual(sourceOf("https://www.tiktok.com/@some.creator/video/123"), { account: "some.creator", platform: "tiktok", url: "https://www.tiktok.com/@some.creator" });
  assert.deepEqual(sourceOf("https://www.youtube.com/@SomeChannel", "Some Channel"), { account: "Some Channel", platform: "youtube", url: "https://www.youtube.com/@SomeChannel/shorts" });
  assert.equal(sourceOf("https://www.youtube.com/channel/UCabc-123")?.url, "https://www.youtube.com/channel/UCabc-123/shorts");
  assert.equal(sourceOf("https://www.youtube.com/shorts/abc123"), null);
  assert.equal(sourceOf("https://example.com/x"), null);
});

test("pickThumb takes a Short's largest portrait frame and TikTok's cover", () => {
  const yt = { thumbnails: [{ url: "land", width: 1280, height: 720 }, { url: "small", width: 405, height: 608 }, { url: "big", width: 405, height: 720 }] };
  assert.equal(pickThumb(yt, "youtube"), "big");
  assert.equal(pickThumb({ thumbnails: [{ url: "land", width: 1280, height: 720 }] }, "youtube"), null);
  const tt = { thumbnails: [{ id: "dynamicCover", url: "d" }, { id: "cover", url: "c" }, { id: "originCover", url: "o" }] };
  assert.equal(pickThumb(tt, "tiktok"), "c");
  assert.equal(pickThumb({ thumbnails: [{ id: "originCover", url: "o" }] }, "tiktok"), "o");
});

test("poolEntries keeps entries with views and a cover, ids prefixed by platform", () => {
  const src = { account: "acct", platform: "tiktok" as const, url: "https://www.tiktok.com/@acct" };
  const entries = [
    { id: "1", title: " A title ", view_count: 500, thumbnails: [{ id: "cover", url: "c1" }] },
    { id: "2", title: "no views", view_count: 0, thumbnails: [{ id: "cover", url: "c2" }] },
    { id: "3", title: "no cover", view_count: 9, thumbnails: [] },
  ];
  const got = poolEntries({ entries }, src);
  assert.deepEqual(got, [{ id: "tt-1", title: "A title", channel: "acct", platform: "tiktok", views: 500, thumb: "c1" }]);
  assert.deepEqual(indexRows(got), [{ id: "tt-1", title: "A title", channel: "acct", handle: "acct", niche: "tiktok", views: 500 }]);
  assert.deepEqual(poolEntries({}, src), []);
});

test("titlesJsonl writes one JSON object per line", () => {
  const out = titlesJsonl([{ id: "a", title: 'say "hi"' }, { id: "b", title: "x", niche: "youtube" }]);
  assert.deepEqual(out.trim().split("\n").map((l) => JSON.parse(l)), [{ id: "a", title: 'say "hi"', niche: "" }, { id: "b", title: "x", niche: "youtube" }]);
});

test("candidateIds are file-safe and unique", () => {
  assert.deepEqual(candidateIds(["/x/Day 4_ The Brain.png", "/y/day-4-cover.jpg", "/z/day-4-cover.png", "/w/!!!.jpg"]), ["Day-4_-The-Brain", "day-4-cover", "day-4-cover-2", "cover"]);
});

test("formatRanking lists best first with what helps and hurts, without the manifest prefix", () => {
  const lines = formatRanking({
    ranking: [{ id: "realdecoy-b", clickShare: 0.123, frontPageCTR: 3, winRateVsComparison: 0.81, meanRank: 2.5 }, { id: "realdecoy-a", clickShare: 0.05, frontPageCTR: 1, winRateVsComparison: 0.2, meanRank: 9 }],
    attribution: { "realdecoy-b": { contrast: 0.01, brightness: -0.02, clutter: 0 }, "realdecoy-a": {} },
  });
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^1\. b {2}click share 12\.3% · beats 81% of the niche · mean rank 2\.5\n {5}helps: contrast · hurts: brightness$/);
  assert.equal(lines[1], "2. a  click share 5.0% · beats 20% of the niche · mean rank 9");
});
