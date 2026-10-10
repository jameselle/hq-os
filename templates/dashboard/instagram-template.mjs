#!/usr/bin/env node
// Dashboard connector for an Instagram professional account (docs/guides/dashboard.md).
//
//   node instagram-template.mjs <config.json>
//
// Config (the business's own file, dashboard-instagram.json):
//   {"keychain": "hq-<slug>-instagram", "account": "access-token", "cache": "<hq-data>/businesses/<slug>/dashboard-instagram-cache.json"}
// The token is an Instagram API with Instagram Login access token (instagram_business_basic and
// instagram_business_manage_insights), typed into the Keychain by the owner and read here at run time, never printed.
// `account` is the Keychain item's account name, if it has one.
//
// Instagram allows about 200 Graph calls an hour per account, and the dashboard refreshes every minute, so reads are
// cached in `cache`: the account and posts for 10 minutes, views for an hour. The cache holds public post stats only,
// never a person. Shows followers (with the 7-day change once a week of readings exists), posts, views, likes and
// comments over 30 days (Instagram's own media_count leaves reels out, so posts are counted here), posts and views by day, and the top posts. Read-only. Node stdlib only.
import { execFileSync } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DAY = 86_400_000;
const API = 'https://graph.instagram.com/v25.0';
export const TTL = { account: 10 * 60_000, media: 10 * 60_000, views: 60 * 60_000 };

const day = (t) => new Date(t).toISOString().slice(0, 10);
const counts = (rows, value = () => 1) => {
  const m = new Map();
  for (const r of rows) { const k = day(Date.parse(r.at)); m.set(k, (m.get(k) ?? 0) + value(r)); }
  return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
};
const n = (v) => v.toLocaleString('en-AU');

/** The dashboard snapshot from cached Instagram reads. Pure. */
export function buildSnapshot(cache, { now = Date.now(), errors = {} } = {}) {
  const media = cache.media?.rows ?? [];
  const views = cache.views?.byId ?? {};
  const within = (r, d) => Date.parse(r.at) >= now - d * DAY;
  const m30 = media.filter((r) => within(r, 30)), m7 = media.filter((r) => within(r, 7));
  const sum = (rows, f) => rows.reduce((t, r) => t + f(r), 0);
  const hist = cache.followerHistory ?? [];
  const weekAgo = [...hist].reverse().find((h) => Date.parse(h.date) <= now - 7 * DAY);
  const followers = cache.account?.followers ?? null;
  const read = (t) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'never');
  const since = media.length ? day(Math.min(...media.map((r) => Date.parse(r.at)))) : day(now);
  return {
    observedAt: new Date(now).toISOString(),
    groups: [
      { id: 'audience', title: 'Audience', note: `Instagram, read ${read(cache.account?.at)}.`, tiles: [
        { label: 'Followers', value: followers, hint: weekAgo && followers !== null ? `${followers - weekAgo.followers >= 0 ? '+' : ''}${followers - weekAgo.followers} in 7 days` : 'Change shows after a week of readings' },
        { label: 'Posts, 7 days', value: m7.length },
        { label: 'Posts, 30 days', value: m30.length },
      ] },
      { id: 'reach', title: 'Last 30 days', note: `Views read ${read(cache.views?.at)} (hourly, to stay inside Instagram's rate limit).`, tiles: [
        { label: 'Views', value: m30.length ? sum(m30, (r) => views[r.id] ?? 0) : null },
        { label: 'Views per post', value: m30.length ? Math.round(sum(m30, (r) => views[r.id] ?? 0) / m30.length) : null },
        { label: 'Likes', value: m30.length ? sum(m30, (r) => r.likes) : null },
        { label: 'Comments', value: m30.length ? sum(m30, (r) => r.comments) : null },
      ] },
    ],
    charts: [
      { id: 'posts', title: 'Posts', subtitle: 'Published per day', kind: 'bars', since, points: counts(media) },
      { id: 'views', title: 'Views', subtitle: 'By the day the post went up', kind: 'area', since, points: counts(media, (r) => views[r.id] ?? 0) },
    ],
    lists: [{ id: 'top', title: 'Top posts, last 30 days', subtitle: 'By views.',
      rows: [...m30].sort((a, b) => (views[b.id] ?? 0) - (views[a.id] ?? 0)).slice(0, 25).map((r) => ({
        key: r.id, title: r.title || '(no caption)', at: new Date(Date.parse(r.at)).toISOString(), tags: [r.type === 'REELS' ? 'Reel' : r.type ? r.type[0] + r.type.slice(1).toLowerCase() : 'Post'],
        value: views[r.id] != null ? `${n(views[r.id])} views` : null, subtitle: `${n(r.likes)} likes · ${n(r.comments)} comments`,
        link: /^https:\/\//.test(r.link ?? '') ? r.link : null })) }],
    ...(Object.keys(errors).length ? { errors } : {}),
    can: { contact: false, notes: false },
  };
}

/** Refresh whatever part of the cache is older than its TTL. `ig(path, params)` is the Graph reader. */
export async function refresh(cache, ig, now = Date.now()) {
  const fresh = (k) => cache[k] && now - cache[k].at < TTL[k];
  if (!fresh('account')) {
    const a = await ig('me', { fields: 'followers_count,media_count' });
    cache.account = { at: now, followers: a.followers_count ?? null, media: a.media_count ?? null };
    const h = (cache.followerHistory ??= []);
    if (Number.isFinite(a.followers_count) && h.at(-1)?.date !== day(now)) h.push({ date: day(now), followers: a.followers_count });
    cache.followerHistory = h.slice(-400);
  }
  if (!fresh('media')) {
    const rows = [];
    let page = await ig('me/media', { fields: 'id,caption,permalink,timestamp,like_count,comments_count,media_product_type', limit: 50 });
    for (let i = 0; i < 6 && page; i++) {
      for (const m of page.data ?? []) rows.push({ id: m.id, title: String(m.caption ?? '').split('\n')[0].slice(0, 120), link: m.permalink ?? null, at: m.timestamp, likes: m.like_count ?? 0, comments: m.comments_count ?? 0, type: m.media_product_type ?? null });
      if (!page.paging?.next || Date.parse(rows.at(-1)?.at ?? '') < now - 45 * DAY) break;
      page = await ig(page.paging.next);
    }
    cache.media = { at: now, rows };
  }
  if (!fresh('views')) {
    const byId = { ...(cache.views?.byId ?? {}) };
    const recent = (cache.media?.rows ?? []).filter((m) => Date.parse(m.at) >= now - 30 * DAY);
    for (let i = 0; i < recent.length; i += 5) {
      await Promise.all(recent.slice(i, i + 5).map(async (m) => {
        try {
          const j = await ig(`${m.id}/insights`, { metric: 'views' });
          const v = j.data?.[0]?.values?.[0]?.value ?? j.data?.[0]?.total_value?.value;
          if (Number.isFinite(v)) byId[m.id] = v;
        } catch { /* keep the last reading */ }
      }));
    }
    cache.views = { at: now, byId };
  }
  return cache;
}

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: instagram-template.mjs <config.json>'); process.exit(2); }
  const input = JSON.parse((await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => r(s)); })) || '{}');
  if ((input.action ?? 'report') !== 'report') { console.error('The Instagram dashboard is read-only'); process.exit(2); }
  const cfg = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof cfg.keychain !== 'string' || !cfg.keychain) { console.error('config needs "keychain": the Keychain service holding the token'); process.exit(2); }
  let cache = {};
  if (cfg.cache) try { cache = JSON.parse(readFileSync(cfg.cache, 'utf8')); } catch { /* first run */ }
  const errors = {};
  let token = null;
  try { token = execFileSync('/usr/bin/security', ['find-generic-password', '-s', cfg.keychain, ...(cfg.account ? ['-a', cfg.account] : []), '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { errors.instagram = `No Keychain item "${cfg.keychain}"; add it with: security add-generic-password -a ${cfg.account || 'hq'} -s ${cfg.keychain} -w`; }
  if (token) try {
    const ig = async (path, params = {}) => {
      const u = new URL(path.startsWith('https://') ? path : `${API}/${path}`);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
      u.searchParams.set('access_token', token);
      const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
      const j = await r.json();
      if (!r.ok || j.error) throw Error(`Instagram answered ${r.status}${j.error?.code ? ` (code ${j.error.code})` : ''}`);
      return j;
    };
    await refresh(cache, ig);
    if (cfg.cache) { const tmp = `${cfg.cache}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(cache), { mode: 0o600 }); renameSync(tmp, cfg.cache); }
  } catch (e) {
    errors.instagram = `${e instanceof Error ? e.message : 'Instagram could not be read'}; showing the last reading`;
  }
  process.stdout.write(JSON.stringify(buildSnapshot(cache, { errors })) + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
