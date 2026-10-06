// Instagram's own numbers for a business's account, read daily so the analytics adapter can report followers,
// views per post, follows per post and link clicks. Pure: the workbench cell and the summary. lib/social-publisher.ts
// runs the cell (the same headless, sha256-guarded Composio workbench route posting uses; see lib/social-publish.ts)
// and writes social/insights.json plus one followers line per read to social/insights-history.jsonl.
// Read-only: the cell only calls INSTAGRAM_GET_* tools, on the pinned account, after checking its username.
import { HEAD, embed } from "./social-publish";

export type InsightsPayload = { run: string; account: string; handle: string; /** Unix seconds the windows end at. */ now: number };

/** Days of per-post and per-day history read each time (Meta keeps follower_count for 30 days). */
export const INSIGHTS_DAYS = 28;
/** A read older than this is redone by the hourly tick. */
export const INSIGHTS_EVERY_H = 20;

export function insightsCell(p: InsightsPayload): string {
  const { lit, sha } = embed(p);
  return `${HEAD(lit, sha, p.run)}
try:
  if not _OK: raise Exception("integrity: the payload was not copied exactly")
  me=call("INSTAGRAM_GET_USER_INFO",{"ig_user_id":"me","fields":"user_id,username,followers_count,follows_count,media_count"})
  if norm(dig(me,"username"))!=norm(P["handle"]): raise Exception("wrong account: "+str(dig(me,"username")))
  now=int(P["now"]); D=86400; errs=[]
  res={"status":"insights","username":dig(me,"username"),"followers":dig(me,"followers_count"),"following":dig(me,"follows_count"),"media_count":dig(me,"media_count")}
  nf=[]
  try:
    for m in items(call("INSTAGRAM_GET_USER_INSIGHTS",{"metric":["follower_count"],"period":"day","since":now-${INSIGHTS_DAYS}*D,"until":now})):
      for v in (m.get("values") or []): nf.append({"end":v.get("end_time"),"value":v.get("value")})
  except Exception as e: errs.append("follower_count: "+str(e)[:200])
  res["new_followers"]=nf
  wk=[]
  for k in range(4):
    w={"since":now-(k+1)*7*D,"until":now-k*7*D}
    try:
      for m in items(call("INSTAGRAM_GET_USER_INSIGHTS",{"metric":["views","reach","website_clicks","profile_views"],"period":"day","metric_type":"total_value","since":w["since"],"until":w["until"]})):
        w[m.get("name")]=(m.get("total_value") or {}).get("value")
    except Exception as e: errs.append("week "+str(k)+": "+str(e)[:200])
    wk.append(w)
  res["weeks"]=wk
  media=items(call("INSTAGRAM_GET_IG_USER_MEDIA",{"ig_user_id":"me","limit":100,"since":now-${INSIGHTS_DAYS}*D,"fields":"id,timestamp,media_type,media_product_type"}))
  def one(it):
    o={"id":str(it.get("id")),"at":it.get("timestamp"),"type":it.get("media_product_type") or it.get("media_type")}
    try:
      for m in items(call("INSTAGRAM_GET_IG_MEDIA_INSIGHTS",{"ig_media_id":o["id"],"metric":["views","reach"]})):
        o[m.get("name")]=((m.get("values") or [{}])[0]).get("value")
    except Exception as e: o["error"]=str(e)[:160]
    if o["type"]!="REELS":
      try:
        for m in items(call("INSTAGRAM_GET_IG_MEDIA_INSIGHTS",{"ig_media_id":o["id"],"metric":["follows"]})):
          o["follows"]=((m.get("values") or [{}])[0]).get("value")
      except Exception: pass
    return o
  with ThreadPoolExecutor(5) as ex: res["posts"]=list(ex.map(one,media[:60]))
  res["errors"]=errs
  out(**res)
except Exception as e:
  out(status="error",stage="insights",error=str(e)[:500])
`;
}

export type InsightsWeek = { since: string; until: string; views: number | null; reach: number | null; websiteClicks: number | null; profileViews: number | null };
export type InsightsPost = { id: string; at: string; type: string; views: number | null; reach: number | null; follows?: number | null };
export type InsightsFile = {
  at: string;
  network: "instagram";
  account: string;
  handle: string;
  followers: number | null;
  following: number | null;
  mediaCount: number | null;
  /** New followers per day (Meta's follower_count), oldest first. */
  newFollowers: { day: string; value: number }[];
  /** Rolling 7-day windows ending at the read, newest first. */
  weeks: InsightsWeek[];
  posts: InsightsPost[];
  summary: InsightsSummary;
  errors: string[];
};
export type InsightsSummary = {
  followers: number | null;
  /** New followers in the last 7 days, and the posts published in them. */
  follows7: number | null;
  posts7: number;
  followsPerPost7: number | null;
  /** Average views of posts 1 to 28 days old (younger ones are still climbing). */
  viewsPerPost: number | null;
  viewsPosts: number;
  /** Taps on the profile's website link, last 7 days. */
  linkClicks7: number | null;
  profileViews7: number | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const DAY = 864e5;
const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

/** The cell's raw result as the file HQ keeps. Aggregates and post ids only: no captions, links or tokens. */
export function summariseInsights(raw: Record<string, unknown>, o: { account: string; handle: string; at: Date }): InsightsFile {
  const now = o.at.getTime();
  const newFollowers = ((raw.new_followers as { end?: string; value?: unknown }[]) ?? [])
    .filter((v) => v.end && num(v.value) !== null)
    // Meta stamps each day's count at the end of that day (07:00 UTC for an account in UTC-7): the day it covers is the one before.
    .map((v) => ({ day: new Date(Date.parse(v.end!) - DAY).toISOString().slice(0, 10), value: num(v.value)!, t: Date.parse(v.end!) }))
    .sort((a, b) => a.t - b.t);
  const weeks: InsightsWeek[] = ((raw.weeks as Record<string, unknown>[]) ?? []).map((w) => ({
    since: new Date(Number(w.since) * 1000).toISOString(), until: new Date(Number(w.until) * 1000).toISOString(),
    views: num(w.views), reach: num(w.reach), websiteClicks: num(w.website_clicks), profileViews: num(w.profile_views),
  }));
  const posts: InsightsPost[] = ((raw.posts as Record<string, unknown>[]) ?? []).filter((p) => p.id && p.at).map((p) => ({
    id: String(p.id), at: new Date(Date.parse(String(p.at).replace("+0000", "Z"))).toISOString(), type: String(p.type ?? ""),
    views: num(p.views), reach: num(p.reach), ...(p.follows !== undefined ? { follows: num(p.follows) } : {}),
  }));
  const in7 = (t: number) => now - t < 7 * DAY && t <= now;
  const recentDays = newFollowers.filter((v) => in7(v.t));
  const follows7 = recentDays.length ? recentDays.reduce((a, v) => a + v.value, 0) : null;
  const posts7 = posts.filter((p) => in7(Date.parse(p.at))).length;
  const matured = posts.filter((p) => { const age = now - Date.parse(p.at); return age >= DAY && age <= 28 * DAY && p.views !== null; });
  const summary: InsightsSummary = {
    followers: num(raw.followers),
    follows7, posts7,
    followsPerPost7: follows7 !== null && posts7 > 0 ? round(follows7 / posts7) : null,
    viewsPerPost: matured.length ? Math.round(matured.reduce((a, p) => a + (p.views ?? 0), 0) / matured.length) : null,
    viewsPosts: matured.length,
    linkClicks7: weeks[0]?.websiteClicks ?? null,
    profileViews7: weeks[0]?.profileViews ?? null,
  };
  return {
    at: o.at.toISOString(), network: "instagram", account: o.account, handle: o.handle,
    followers: num(raw.followers), following: num(raw.following), mediaCount: num(raw.media_count),
    newFollowers: newFollowers.map(({ day, value }) => ({ day, value })), weeks, posts, summary,
    errors: ((raw.errors as unknown[]) ?? []).map((e) => String(e).slice(0, 200)),
  };
}
