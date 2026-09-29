// Timeline maths for HQ Studio: words from the transcript, pauses to cut,
// where each kept piece lands in the output, and captions on the output's own
// clock. Pure functions, unit-tested. Client-safe: no node imports.

import type { EditSpec, Format } from "./spec";

export type Word = { w: string; start: number; end: number }; // seconds, source timeline
export type Piece = { source: string; start: number; end: number; outStart: number };

/** Split each segment at pauses longer than `maxPause`, keeping a little air either side.
 *  Pauses come from the audio's own silence (FFmpeg silencedetect) when available: whisper
 *  stretches word end times across silence, so word gaps under-report pauses. */
export function keepPieces(spec: EditSpec, words: Record<string, Word[]>, silences: Record<string, [number, number][]> = {}): Piece[] {
  const maxPause = spec.tightenPauses ?? 0;
  const pad = 0.15; // seconds of air kept either side of a cut
  const out: Piece[] = [];
  let t = 0;
  for (const seg of spec.segments) {
    // Gaps to remove inside this segment, as [start, end] on the source clock.
    let gaps: [number, number][] = [];
    if (maxPause > 0) {
      const sil = silences[seg.source];
      if (sil) gaps = sil.filter(([a, b]) => b - a > maxPause);
      else {
        const ws = (words[seg.source] ?? []).filter((w) => w.end > seg.start && w.start < seg.end);
        for (let i = 1; i < ws.length; i++) if (ws[i].start - ws[i - 1].end > maxPause) gaps.push([ws[i - 1].end, ws[i].start]);
      }
    }
    const ranges: [number, number][] = [];
    let a = seg.start;
    for (const [gs, ge] of gaps.sort((x, y) => x[0] - y[0])) {
      const cutFrom = Math.max(seg.start, gs + pad);
      const cutTo = Math.min(seg.end, ge - pad);
      if (cutTo <= cutFrom || cutFrom <= a) continue;
      ranges.push([a, cutFrom]);
      a = cutTo;
    }
    ranges.push([a, seg.end]);
    for (const [s0, e0] of ranges) {
      if (e0 - s0 < 0.05) continue;
      out.push({ source: seg.source, start: round(s0), end: round(e0), outStart: round(t) });
      t += e0 - s0;
    }
  }
  return out;
}

export const outputDuration = (pieces: Piece[]) =>
  pieces.length ? round(pieces.at(-1)!.outStart + (pieces.at(-1)!.end - pieces.at(-1)!.start)) : 0;

/** Words that survive the cut, re-timed onto the output clock. */
export function outputWords(pieces: Piece[], words: Record<string, Word[]>): Word[] {
  const out: Word[] = [];
  for (const p of pieces) {
    for (const w of words[p.source] ?? []) {
      // whisper can stretch a word across the pause after it: judge it by its first 0.8 s
      const mid = (w.start + Math.min(w.end, w.start + 0.8)) / 2;
      if (mid < p.start || mid > p.end) continue;
      out.push({
        w: w.w,
        start: round(p.outStart + Math.max(0, w.start - p.start)),
        end: round(p.outStart + Math.min(p.end, w.end) - p.start),
      });
    }
  }
  return out;
}

/** Group words into short caption lines: at most `maxWords`, broken at sentence ends and long gaps. */
export function captionLines(words: Word[], maxWords = 3, maxGap = 0.6): { text: string; start: number; end: number }[] {
  const lines: { text: string; start: number; end: number }[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    lines.push({ text: cur.map((w) => w.w).join(" "), start: cur[0].start, end: cur.at(-1)!.end });
    cur = [];
  };
  for (const w of words) {
    if (cur.length && (cur.length >= maxWords || w.start - cur.at(-1)!.end > maxGap)) flush();
    cur.push(w);
    if (/[.!?]$/.test(w.w)) flush();
  }
  flush();
  // No flicker: hold each line until the next one starts (or up to 0.4 s after its last word).
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1]?.start ?? Infinity;
    lines[i].end = round(Math.min(next, lines[i].end + 0.4));
  }
  return lines;
}

export type CaptionStyle = { font: string; primary: string; outline: string; highlight: string };

const assTime = (t: number) => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};

/** "#RRGGBB" -> ASS "&H00BBGGRR". */
export const assColour = (hex: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`bad colour ${hex}`);
  return `&H00${m[3]}${m[2]}${m[1]}`.toUpperCase();
};

const escapeAss = (t: string) => t.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, "\\N");

/** An ASS subtitle file: bold word-group captions in the lower third, and the hook up top. */
export function buildAss(
  format: { w: number; h: number },
  lines: { text: string; start: number; end: number }[],
  style: CaptionStyle,
  hook?: { text: string; seconds?: number },
): string {
  const { w, h } = format;
  const size = Math.round(Math.min(w, h) * 0.075);
  const hookSize = Math.round(Math.min(w, h) * 0.068);
  const marginV = Math.round(h * (h > w ? 0.28 : 0.12));
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${style.font},${size},${assColour(style.primary)},${assColour(style.highlight)},${assColour(style.outline)},&H80000000,-1,0,0,0,100,100,0,0,1,${Math.round(size / 9)},2,2,${Math.round(w * 0.08)},${Math.round(w * 0.08)},${marginV},1
Style: Hook,${style.font},${hookSize},${assColour(style.outline)},${assColour(style.outline)},${assColour(style.highlight)},${assColour(style.highlight)},-1,0,0,0,100,100,0,0,3,${Math.round(hookSize / 4)},0,8,${Math.round(w * 0.07)},${Math.round(w * 0.07)},${Math.round(h * 0.1)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = lines.map((l) => `Dialogue: 0,${assTime(l.start)},${assTime(l.end)},Caption,,0,0,0,,${escapeAss(l.text.toUpperCase())}`);
  if (hook) events.unshift(`Dialogue: 1,${assTime(0)},${assTime(hook.seconds ?? 3)},Hook,,0,0,0,,${escapeAss(hook.text)}`);
  return header + events.join("\n") + "\n";
}

/** The ffmpeg video filter that fits a source into the format. */
export function reframeFilter(
  src: { w: number; h: number },
  fmt: Format,
  dims: { w: number; h: number },
  mode: "crop" | "fit-blur",
  focusX = 0.5,
  tag = "", // keeps filter labels unique when several pieces are reframed in one graph
): string {
  const { w, h } = dims;
  const srcAspect = src.w / src.h;
  const dstAspect = w / h;
  if (Math.abs(srcAspect - dstAspect) < 0.01) return `scale=${w}:${h}`;
  if (mode === "crop") {
    if (srcAspect > dstAspect) {
      // too wide: scale to height, crop width around focusX
      const sw = Math.round((src.w * h) / src.h / 2) * 2;
      const x = Math.max(0, Math.min(sw - w, Math.round(sw * focusX - w / 2)));
      return `scale=${sw}:${h},crop=${w}:${h}:${x}:0`;
    }
    const sh = Math.round((src.h * w) / src.w / 2) * 2;
    return `scale=${w}:${sh},crop=${w}:${h}:0:${Math.round((sh - h) / 2)}`;
  }
  // fit-blur: blurred, filled background with the whole frame fitted on top
  void fmt;
  return `split=2[bg${tag}][fg${tag}];[bg${tag}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=40:5,eq=brightness=-0.08[bgb${tag}];[fg${tag}]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgs${tag}];[bgb${tag}][fgs${tag}]overlay=(W-w)/2:(H-h)/2`;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
