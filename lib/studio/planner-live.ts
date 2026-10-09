// The Studio planner's live view: what is actually on a business's connected accounts, with each post's views now.
// The business's analytics adapter lists the posts (snapshot `posts`, see lib/analytics.ts); this matches each one to
// the render it came from through HQ's own log (published.jsonl: the post's id or link, and the media it was made from),
// so the planner can show the real post on the plan's own video. A plan whose id is a business slug gets this view.

import fs from "node:fs";
import path from "node:path";

import { ALIMITS, analyticsState, runAnalytics, type AnalyticsPost } from "../analytics";
import { businessDir, getProfile, type PublishedPost } from "../store";
import { listVideos } from "./review";

export type LivePost = AnalyticsPost & { v?: string };
export type LiveFeed = { updatedAt: string | null; stale: boolean; posts: LivePost[]; followers?: Partial<Record<AnalyticsPost["platform"], number>>; note?: string };

const stem = (file: string) => path.basename(file.split("?")[0]).replace(/\.mp4$/i, "").replace(/-(vertical|landscape|square)$/i, "").toLowerCase();
/** The keys a post can be known by: its id and the last part of its link (the reel code, video id or short id). */
const keys = (id: string | undefined, url: string | undefined) => {
  const out: string[] = [];
  if (id) out.push(id);
  if (url) { try { const seg = new URL(url).pathname.split("/").filter(Boolean).pop(); if (seg) out.push(seg); } catch { /* not a link */ } }
  return out;
};

function published(slug: string): PublishedPost[] {
  try {
    return fs.readFileSync(path.join(businessDir(slug), "published.jsonl"), "utf8").split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l) as PublishedPost; } catch { return null; } })
      .filter((p): p is PublishedPost => Boolean(p && p.status === "published"));
  } catch {
    return [];
  }
}

/** The live view for plan `planId` (a business slug) under the review root `root` (the businesses folder), or null
 *  when the plan isn't a business. Posts newest first; `v` is the render each came from, when HQ logged it. */
export function liveFeed(root: string, planId: string, now: Date = new Date()): LiveFeed | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(planId) || !getProfile(planId)) return null;
  const state = analyticsState(planId, now);
  const updatedAt = state.snapshot?.observedAt ?? null;
  const stale = !updatedAt || now.getTime() - Date.parse(updatedAt) > ALIMITS.staleHours * 3600e3;
  const posts = state.snapshot?.posts;
  if (!posts?.length) {
    return { updatedAt, stale, posts: [], note: "This business's analytics adapter doesn't list its posts yet, so there are no live views to show." };
  }

  const media = new Map<string, string>();
  for (const p of published(planId)) if (p.media) for (const k of keys(p.postId, p.url)) media.set(k, stem(p.media));
  const renders = new Map<string, { v: string; t: number }[]>();
  for (const v of listVideos(root)) {
    if (!v.v.startsWith(planId + "/")) continue;
    const k = stem(v.v);
    renders.set(k, [...(renders.get(k) ?? []), { v: v.v, t: Date.parse(v.mtime) }]);
  }
  const renderFor = (p: AnalyticsPost) => {
    const name = keys(p.id, p.url).map((k) => media.get(k)).find(Boolean);
    const found = name ? renders.get(name) : undefined;
    if (!found?.length) return undefined;
    // The newest render made before the post went up (a later re-render isn't what was posted), else the newest.
    const posted = Date.parse(p.at);
    const before = found.filter((r) => r.t <= posted).sort((a, b) => b.t - a.t);
    return (before[0] ?? [...found].sort((a, b) => b.t - a.t)[0]).v;
  };
  const out = [...posts].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).map((p) => {
    const v = renderFor(p);
    return v ? { ...p, v } : { ...p };
  });
  // Followers per account, from the adapter's followers number split by platform (labels like "Instagram").
  const followers: Partial<Record<AnalyticsPost["platform"], number>> = {};
  const names: Record<string, AnalyticsPost["platform"]> = { instagram: "instagram", tiktok: "tiktok", youtube: "youtube", x: "x", facebook: "facebook", linkedin: "linkedin" };
  for (const r of state.snapshot?.metrics.find((m) => m.id === "followers")?.breakdown ?? []) {
    const k = names[r.label.trim().toLowerCase()];
    if (k) followers[k] = r.value;
  }
  return { updatedAt, stale, posts: out, ...(Object.keys(followers).length ? { followers } : {}) };
}

/** Re-read the accounts now (the business's whole analytics refresh), then the live view. */
export async function refreshLive(root: string, planId: string): Promise<LiveFeed | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(planId) || !getProfile(planId)) return null;
  const r = await runAnalytics(planId);
  if (r.adapterError) throw new Error(`the accounts couldn't be read: ${r.adapterError}`);
  return liveFeed(root, planId);
}
