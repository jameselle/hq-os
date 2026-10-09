import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { liveFeed } from "../lib/studio/planner-live";
import { businessDir, hqData, logPost, scaffoldBusiness } from "../lib/store";
import { profile, tempData } from "./helpers";

const render = (rel: string, mtime: string) => {
  const f = path.join(hqData(), "businesses", rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, "x");
  fs.utimesSync(f, new Date(mtime), new Date(mtime));
};

test("the planner's live view: the accounts' real posts with views, each matched to the render it came from", () => {
  tempData();
  const p = profile();
  scaffoldBusiness(p);
  const root = path.join(hqData(), "businesses");
  render(`${p.slug}/studio/2026-10-06-1500-day-7-main/day-7-main-vertical.mp4`, "2026-10-06T04:00:00Z");
  render(`${p.slug}/studio/2026-10-01-0900-day-7-main-old/day-7-main-vertical.mp4`, "2026-10-01T04:00:00Z");
  render(`${p.slug}/studio/2026-10-07-1600-day-8-main/day-8-main-vertical.mp4`, "2026-10-07T05:00:00Z");
  render(`other-biz/studio/x/day-8-main-vertical.mp4`, "2026-10-07T05:00:00Z");
  logPost(p.slug, { platform: "instagram", via: "meta-app", status: "published", url: "https://www.instagram.com/reel/AAA111/", postId: "1801", media: "https://github.com/demo/releases/download/media-day-8/day-8-main.mp4", at: "2026-10-07T08:17:00Z" });
  logPost(p.slug, { platform: "youtube", via: "composio", status: "published", url: "https://youtube.com/shorts/yt7", media: "/tmp/day-7-main.mp4", at: "2026-10-06T05:00:00Z" });
  fs.writeFileSync(path.join(businessDir(p.slug), "analytics-snapshot.json"), JSON.stringify({
    version: 1, observedAt: "2026-10-07T10:00:00.000Z", currency: "AUD",
    metrics: [{ id: "followers", value: 1590, quality: "approx", note: "per account", breakdown: [{ label: "Instagram", value: 1562 }, { label: "TikTok", value: 26 }, { label: "Mastodon", value: 2 }] }],
    posts: [
      { platform: "instagram", id: "1801", url: "https://www.instagram.com/reel/AAA111/", at: "2026-10-07T08:17:41.000Z", views: 312, trial: true },
      { platform: "youtube", id: "yt7", url: "https://www.youtube.com/shorts/yt7", at: "2026-10-06T05:01:00.000Z", views: 1100 },
      { platform: "instagram", id: "1700", url: "https://www.instagram.com/reel/BBB222/", at: "2026-10-01T02:00:00.000Z", views: 90 },
    ],
  }));

  const feed = liveFeed(root, p.slug, new Date("2026-10-07T11:00:00Z"))!;
  assert.equal(feed.updatedAt, "2026-10-07T10:00:00.000Z");
  assert.equal(feed.stale, false);
  assert.deepEqual(feed.posts.map((x) => x.id), ["1801", "yt7", "1700"], "newest first");
  assert.equal(feed.posts[0].v, `${p.slug}/studio/2026-10-07-1600-day-8-main/day-8-main-vertical.mp4`, "matched by the posted media's name, in this business only");
  assert.equal(feed.posts[0].views, 312);
  assert.equal(feed.posts[0].trial, true);
  assert.equal(feed.posts[1].v, `${p.slug}/studio/2026-10-06-1500-day-7-main/day-7-main-vertical.mp4`, "the newest render made before it was posted, matched by the post's id in its url");
  assert.equal(feed.posts[2].v, undefined, "a post HQ didn't log has no render, but still shows with its views");
  assert.deepEqual(feed.followers, { instagram: 1562, tiktok: 26 }, "followers per account from the followers number, known platforms only");

  assert.equal(liveFeed(root, "not-a-business"), null, "a plan that isn't a business has no live view");
  assert.equal(liveFeed(root, p.slug, new Date("2026-10-10T11:00:00Z"))!.stale, true);
});

test("a business whose adapter doesn't list posts gets an empty live view that says why", () => {
  tempData();
  const p = profile();
  scaffoldBusiness(p);
  const feed = liveFeed(path.join(hqData(), "businesses"), p.slug)!;
  assert.deepEqual(feed.posts, []);
  assert.match(feed.note ?? "", /posts/);
});
