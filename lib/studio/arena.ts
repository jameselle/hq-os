// Cover testing with YouTube CTR Arena (MIT, installed at ~/.local/opt/youtube-ctr-arena with HQ's local
// patches from setup/ctr-arena). The arena drops each cover option into a simulated feed of the niche's own
// covers, lets 100 synthetic viewers scan it, and reports which option draws the clicks and which pixels cost
// it. It is a proxy for ranking options before posting, not a CTR forecast.
//
// A business's pool lives in $HQ_DATA/businesses/<slug>/covers/:
//   reference-arsenal/lib/<id>.jpg      niche covers (other creators' thumbnails: local analysis only, never posted)
//   reference-arsenal/lib/_titles.jsonl their titles, for the arena's title tags
//   reference-arsenal/_index.json       id, title, channel, views (what arena-calibrate reads)
//   reference-arsenal/_calibration.json which pixel traits this niche's outliers have more of
//   decoys-real -> reference-arsenal/lib, decoy-manifest-real.json   the tagged comparison pool
//   sources.json                        the accounts the pool came from
//   tests/<stamp>/                      one folder per cover test

export type Platform = "youtube" | "tiktok";
export type PoolSource = { account: string; platform: Platform; url: string };
export type PoolEntry = { id: string; title: string; channel: string; platform: Platform; views: number; thumb: string };

/** Arena tile size (WxH, same pixel count as upstream's 96x54) for each cover shape. */
export const SHAPES: Record<string, string> = { "9x16": "54x96", "3x4": "63x84", "16x9": "96x54" };

/** The account behind a video or profile URL, when the URL itself names it. A YouTube Shorts or watch URL
 *  doesn't, so it returns null and the caller asks yt-dlp for the channel. */
export function sourceOf(url: string, account?: string): PoolSource | null {
  const tt = /^https?:\/\/(?:www\.)?tiktok\.com\/@([\w.-]+)/i.exec(url);
  if (tt) return { account: account ?? tt[1], platform: "tiktok", url: `https://www.tiktok.com/@${tt[1]}` };
  const yt = /^https?:\/\/(?:www\.)?youtube\.com\/(@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+)/i.exec(url);
  if (yt) return { account: account ?? yt[1].replace(/^@/, ""), platform: "youtube", url: `https://www.youtube.com/${yt[1]}/shorts` };
  return null;
}

type Thumb = { id?: string; url?: string; width?: number | null; height?: number | null };
type ListingEntry = { id?: string; title?: string | null; view_count?: number | null; thumbnails?: Thumb[] };

/** The cover a viewer sees in the feed: YouTube's largest portrait thumbnail (a Short's `oar` frame), or
 *  TikTok's `cover`. */
export function pickThumb(entry: ListingEntry, platform: Platform): string | null {
  const thumbs = entry.thumbnails ?? [];
  if (platform === "tiktok") return (thumbs.find((t) => t.id === "cover") ?? thumbs.find((t) => t.id === "originCover"))?.url ?? null;
  const portrait = thumbs.filter((t) => t.url && t.width && t.height && t.height > t.width);
  portrait.sort((a, b) => b.height! * b.width! - a.height! * a.width!);
  return portrait[0]?.url ?? null;
}

/** Pool rows from one `yt-dlp --flat-playlist -J` listing: entries with views and a cover. */
export function poolEntries(listing: { entries?: ListingEntry[] }, source: PoolSource): PoolEntry[] {
  const out: PoolEntry[] = [];
  for (const e of listing.entries ?? []) {
    const thumb = pickThumb(e, source.platform);
    if (!e.id || !thumb || !(Number(e.view_count) > 0)) continue;
    out.push({ id: `${source.platform === "tiktok" ? "tt" : "yt"}-${e.id}`, title: (e.title ?? "").trim(), channel: source.account, platform: source.platform, views: Number(e.view_count), thumb });
  }
  return out;
}

/** arena-calibrate's _index.json rows. */
export const indexRows = (pool: PoolEntry[]) => pool.map((p) => ({ id: p.id, title: p.title, channel: p.channel, handle: p.channel, niche: p.platform, views: p.views }));

/** build-real-decoy-manifest's _titles.jsonl (one JSON object per line). */
export const titlesJsonl = (rows: { id: string; title: string; niche?: string }[]) => rows.map((r) => JSON.stringify({ id: r.id, title: r.title, niche: r.niche ?? "" })).join("\n") + "\n";

/** A safe, unique candidate id from a file name. */
export function candidateIds(files: string[]): string[] {
  const seen = new Map<string, number>();
  return files.map((f) => {
    const base = f.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "cover";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}

type Ranked = { id: string; clickShare: number; frontPageCTR: number; winRateVsComparison: number; meanRank: number };
export type ArenaResult = { ranking: Ranked[]; attribution: Record<string, Record<string, number>> };

/** One line per option, best first, with the traits that help and hurt it most. Ids lose the manifest's
 *  `realdecoy-` prefix. */
export function formatRanking(r: ArenaResult): string[] {
  const name = (id: string) => id.replace(/^realdecoy-/, "");
  return r.ranking.map((x, i) => {
    const a = Object.entries(r.attribution[x.id] ?? {}).filter(([, v]) => v !== 0);
    const helps = [...a].sort((p, q) => q[1] - p[1]).filter(([, v]) => v > 0).slice(0, 2).map(([k]) => k);
    const hurts = [...a].sort((p, q) => p[1] - q[1]).filter(([, v]) => v < 0).slice(0, 2).map(([k]) => k);
    return `${i + 1}. ${name(x.id)}  click share ${(x.clickShare * 100).toFixed(1)}% · beats ${(x.winRateVsComparison * 100).toFixed(0)}% of the niche · mean rank ${x.meanRank}` +
      (helps.length || hurts.length ? `\n     helps: ${helps.join(", ") || "none"} · hurts: ${hurts.join(", ") || "none"}` : "");
  });
}
