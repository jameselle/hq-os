// Carousels that go out as a slideshow Reel with music (social.json slideshow). Instagram's API can't put music on a
// carousel: Meta's Audio API attaches sound to Reels only, and the Composio tool HQ posts through can't send it. So
// HQ renders the slides as 9:16 frames, holds each long enough to read, cross-fades between them and lays a track
// from the business's own music folder under them, then posts the video as a Reel.
//
// The music folder (social/<music>/) holds the tracks and tracks.json: per track its file, title, artist, licence,
// source and the second its full beat comes in (`start`, so a quiet intro never opens the post). Every track's licence
// must allow commercial use on social media; HQ never fetches music by itself.
//
// The top half is pure (timing, the track pick, the ffmpeg arguments) and unit-tested; renderSlideshow does the I/O.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

import type { Slide, SocialConfig, SocialDraft } from "./social";

export type Track = { file: string; title: string; artist: string; licence: string; source: string; start?: number };

/** tracks.json, checked: every track names its file (inside the folder), title, artist, licence and source. */
export function validateTracks(x: unknown): Track[] {
  const list = (x as { tracks?: unknown })?.tracks;
  if (!Array.isArray(list) || !list.length) throw Error("tracks.json: tracks must be a non-empty list");
  return list.map((t, i) => {
    const r = t as Track;
    if (!r || typeof r.file !== "string" || !/^[\w.-]+\.(mp3|m4a|aac|wav)$/i.test(r.file)) throw Error(`tracks.json: track ${i + 1} needs a file name (mp3, m4a, aac or wav) in the folder`);
    for (const k of ["title", "artist", "licence", "source"] as const) if (typeof r[k] !== "string" || !r[k].trim()) throw Error(`tracks.json: track ${i + 1} (${r.file}) needs ${k}`);
    if (r.start !== undefined && !(typeof r.start === "number" && r.start >= 0 && r.start < 600)) throw Error(`tracks.json: track ${i + 1} (${r.file}) start must be seconds into the track`);
    return r;
  });
}

/** The track for a post: the same post always gets the same track, and tracks used by the other recent slideshows are
 *  passed over while any other is left. */
export function pickTrack(tracks: Track[], id: string, recent: string[] = []): Track {
  const h = parseInt(crypto.createHash("sha256").update(id).digest("hex").slice(0, 8), 16);
  const order = tracks.map((_, i) => tracks[(h + i) % tracks.length]);
  return order.find((t) => !recent.includes(t.file)) ?? order[0];
}

const words = (s?: string) => (s ?? "").split(/\s+/).filter(Boolean).length;

/** Seconds a slide stays up: long enough to read its words (about 4.2 a second, after a second to look), never under
 *  2.5 s or over 5.5 s (a Reel that drags loses people; the viewer can hold a slide). The hook is kept short and the
 *  closing ask gets time to act on. */
export function slideSeconds(s: Slide, index: number, total: number): number {
  const kind = s.kind ?? (index === 0 ? "cover" : "point");
  const n = words(s.title) + words(s.body) + (s.items ?? []).reduce((a, x) => a + words(x), 0) + words(s.stat)
    + (s.compare ? words(`${s.compare.from} ${s.compare.to} ${s.compare.fromLabel ?? ""} ${s.compare.toLabel ?? ""}`) : 0);
  const [lo, hi] = kind === "cover" ? [2.5, 3.5] : kind === "cta" || index === total - 1 ? [3, 4.5] : [2.5, 5.5];
  return Math.round(Math.min(hi, Math.max(lo, 1 + n / 4.2)) * 10) / 10;
}

/** Cross-fade between slides, in seconds. */
export const FADE = 0.35;
/** The video Instagram takes for a Reel: 1080x1920, 30 fps, H.264, AAC at 48 kHz. */
export const REEL = { w: 1080, h: 1920, fps: 30 };

/** ffmpeg's arguments: each frame held for its seconds (plus the fade it overlaps the next by), cross-faded, over the
 *  track from its start, faded in and out and levelled to -14 LUFS. The video lasts exactly the slides' total. */
export function slideshowArgs(o: { frames: { file: string; seconds: number }[]; track: string; start?: number; out: string }): { args: string[]; seconds: number } {
  const n = o.frames.length;
  if (!n) throw Error("no frames");
  const total = Math.round(o.frames.reduce((a, f) => a + f.seconds, 0) * 100) / 100;
  const args = ["-y", "-v", "error"];
  o.frames.forEach((f, i) => args.push("-loop", "1", "-framerate", String(REEL.fps), "-t", String(i < n - 1 ? f.seconds + FADE : f.seconds), "-i", f.file));
  args.push("-stream_loop", "-1", "-ss", String(o.start ?? 0), "-i", o.track);
  const g = o.frames.map((_, i) => `[${i}:v]scale=${REEL.w}:${REEL.h},setsar=1,format=yuv420p,fps=${REEL.fps}[v${i}]`);
  let prev = "v0", at = 0;
  for (let k = 0; k < n - 1; k++) {
    at += o.frames[k].seconds;
    g.push(`[${prev}][v${k + 1}]xfade=transition=fade:duration=${FADE}:offset=${Math.round(at * 100) / 100}[x${k}]`);
    prev = `x${k}`;
  }
  const out = Math.max(0, total - 1.5);
  g.push(`[${n}:a]atrim=0:${total},asetpts=PTS-STARTPTS,afade=t=in:d=0.3,afade=t=out:st=${out}:d=${Math.min(1.5, total)},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`);
  args.push("-filter_complex", g.join(";"), "-map", `[${prev}]`, "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(REEL.fps),
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", "-t", String(total), o.out);
  return { args, seconds: total };
}

// ---------------------------------------------------------------- making the video (I/O)

/** The music folder's tracks, each checked to exist inside the folder. */
export function readTracks(dir: string): Track[] {
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(path.join(dir, "tracks.json"), "utf8")); } catch { throw Error(`no tracks.json in ${path.basename(dir)}: add royalty-free tracks and list them there`); }
  const tracks = validateTracks(raw);
  const missing = tracks.filter((t) => !fs.existsSync(path.join(dir, t.file)));
  if (missing.length) throw Error(`tracks.json lists files that aren't in the folder: ${missing.map((t) => t.file).join(", ")}`);
  return tracks;
}

const run = (bin: string, args: string[]) => new Promise<void>((res, rej) =>
  execFile(bin, args, { timeout: 5 * 60e3, maxBuffer: 8 * 1024 * 1024 }, (e, _o, err) => (e ? rej(Error(String(err || e.message).trim().split("\n").slice(-2).join(" ").slice(0, 300))) : res())));

/** Makes a carousel's slideshow Reel: 9:16 frames from its slides, then the video with music. Returns what goes on the
 *  draft's `reel`. `recent` = track files the other recent slideshows used. */
export async function renderSlideshow(slug: string, d: SocialDraft & { week: string }, c: SocialConfig, recent: string[] = []): Promise<NonNullable<SocialDraft["reel"]>> {
  const { renderCards } = await import("./social-cards");
  const { socialDir } = await import("./social-store");
  const { businessDir } = await import("./store");
  if (!c.slideshow) throw Error("no slideshow set up in social.json");
  if (!d.slides?.length) throw Error("the post has no slides");
  const dir = path.join(socialDir(slug), c.slideshow.music);
  const track = pickTrack(readTracks(dir), d.id, recent);
  const frames = await renderCards(slug, d.week, d, { reel: true });
  const abs = (rel: string) => path.join(businessDir(slug), rel);
  const rel = path.join("social", "media", d.week, `${d.id}-reel.mp4`);
  const tmp = `${abs(rel)}.part.mp4`;
  try {
    const { args, seconds } = slideshowArgs({ frames: frames.map((f, i) => ({ file: abs(f), seconds: slideSeconds(d.slides![i], i, frames.length) })), track: path.join(dir, track.file), start: track.start, out: tmp });
    await run("ffmpeg", args);
    if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 10_000) throw Error("ffmpeg made no video");
    fs.renameSync(tmp, abs(rel));
    return { path: rel, track: `${track.title} by ${track.artist}`, trackFile: track.file, seconds };
  } finally {
    fs.rmSync(tmp, { force: true });
    for (const f of frames) fs.rmSync(abs(f), { force: true });
  }
}
