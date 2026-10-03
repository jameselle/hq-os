// A video's style in numbers, and a business's style targets taken from the clips that win in its
// niche. `npm run studio -- measure` fills a Measure from FFmpeg (scene cuts, loudness) and whisper
// (words); `npm run studio -- style` turns several into $HQ_DATA/businesses/<slug>/style.json, which
// `/hq:self-post` scripts and edits toward and `studio check` reports against. Pure: no node imports.

export type Word = { w: string; start: number; end: number };

export type Measure = {
  /** Where it came from: a URL, a file, and who posted it. */
  source: string;
  account?: string;
  views?: number;
  /** How far it beat its own account's typical views (views ÷ the account's median). */
  outlier?: number;
  duration: number;
  /** Seconds at which the picture changes shot (scene cuts, cutaways, cards). */
  cuts: number[];
  cutsPer10s: number;
  firstCut: number | null;
  /** Median and longest time on one shot, in seconds. */
  medianShot: number;
  longestShot: number;
  /** Speaking pace and how soon the first word lands. */
  wpm: number;
  firstWord: number | null;
  /** Share of the running time with someone speaking (0 to 1). */
  speaking: number;
  /** The opening line: everything said before the first sentence ends, or the first 4 s. */
  hookLine: string;
  lufs: number | null;
};

export type StyleTargets = {
  cutsPer10s: number;
  firstCut: number;
  medianShot: number;
  wpm: number;
  firstWord: number;
  duration: number;
};

export type Style = {
  slug: string;
  niche?: string;
  updatedAt: string;
  /** Medians across the winning clips. */
  targets: StyleTargets;
  /** Every clip the targets came from, attributed. */
  sources: Pick<Measure, "source" | "account" | "views" | "outlier" | "duration" | "cutsPer10s" | "wpm" | "firstWord" | "hookLine">[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export const median = (xs: number[]): number => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** Cut times from FFmpeg `select='gt(scene,T)',showinfo` stderr. Cuts closer than `minGap` merge (a flash or a
 *  fade reads as one change). */
export function parseCuts(stderr: string, minGap = 0.25): number[] {
  const times = [...stderr.matchAll(/pts_time:\s*([\d.]+)/g)].map((m) => Number(m[1])).filter(Number.isFinite).sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of times) if (!out.length || t - out[out.length - 1] >= minGap) out.push(r2(t));
  return out;
}

/** The opening line: words up to the first sentence end, capped at 4 s in. */
export function hookLine(words: Word[]): string {
  const out: string[] = [];
  for (const w of words) {
    if (w.start > 4) break;
    out.push(w.w);
    if (/[.!?]["')\]]?$/.test(w.w)) break;
  }
  return out.join(" ").trim();
}

/** Pace and shot statistics for one clip. */
export function paceStats(duration: number, cuts: number[], words: Word[]): Pick<Measure, "cutsPer10s" | "firstCut" | "medianShot" | "longestShot" | "wpm" | "firstWord" | "speaking" | "hookLine"> {
  const inside = cuts.filter((c) => c > 0.05 && c < duration - 0.05);
  const bounds = [0, ...inside, duration];
  const shots = bounds.slice(1).map((b, i) => b - bounds[i]).filter((s) => s > 0);
  const spoken = words.reduce((a, w) => a + Math.max(0, w.end - w.start), 0);
  return {
    cutsPer10s: duration > 0 ? r2((inside.length / duration) * 10) : 0,
    firstCut: inside.length ? inside[0] : null,
    medianShot: r2(median(shots) || duration),
    longestShot: r2(Math.max(0, ...shots)),
    wpm: duration > 0 ? Math.round((words.length / duration) * 60) : 0,
    firstWord: words.length ? r2(words[0].start) : null,
    speaking: duration > 0 ? r2(Math.min(1, spoken / duration)) : 0,
    hookLine: hookLine(words),
  };
}

/** A business's targets: the median of each number across the winning clips. */
export function styleFrom(slug: string, measures: Measure[], niche?: string, now = new Date()): Style {
  if (!measures.length) throw new Error("style: no measured clips");
  /* A number no clip had (no cuts at all, nothing said) falls back rather than writing NaN. */
  const med = (f: (m: Measure) => number | null, fallback: number) => {
    const v = median(measures.map((m) => f(m) ?? NaN));
    return r2(Number.isFinite(v) ? v : fallback);
  };
  const duration = med((m) => m.duration, 0);
  return {
    slug,
    niche,
    updatedAt: now.toISOString(),
    targets: {
      cutsPer10s: med((m) => m.cutsPer10s, 0),
      firstCut: med((m) => m.firstCut, duration),
      medianShot: med((m) => m.medianShot, duration),
      wpm: med((m) => m.wpm, 0),
      firstWord: med((m) => m.firstWord, 0),
      duration,
    },
    sources: measures.map(({ source, account, views, outlier, duration, cutsPer10s, wpm, firstWord, hookLine }) => ({ source, account, views, outlier, duration, cutsPer10s, wpm, firstWord, hookLine })),
  };
}

/** How a clip compares with the targets, one line per number. `off` lines are more than `tolerance`
 *  (a fraction) away; seconds-to-something targets are only "off" when we're SLOWER. */
export function compareToStyle(m: Pick<Measure, "cutsPer10s" | "firstCut" | "wpm" | "firstWord">, t: StyleTargets, tolerance = 0.35): { line: string; off: boolean }[] {
  const rel = (a: number, b: number) => (b ? (a - b) / b : 0);
  const out: { line: string; off: boolean }[] = [];
  const cr = rel(m.cutsPer10s, t.cutsPer10s);
  out.push({ line: `cuts ${m.cutsPer10s}/10 s vs ${t.cutsPer10s} in the niche's winners`, off: Math.abs(cr) > tolerance });
  const wr = rel(m.wpm, t.wpm);
  out.push({ line: `pace ${m.wpm} wpm vs ${t.wpm}`, off: Math.abs(wr) > tolerance });
  if (m.firstCut !== null) out.push({ line: `first cut at ${m.firstCut} s vs ${t.firstCut} s`, off: m.firstCut > t.firstCut * (1 + tolerance) + 0.3 });
  if (m.firstWord !== null) out.push({ line: `first word at ${m.firstWord} s vs ${t.firstWord} s`, off: m.firstWord > t.firstWord + 0.5 });
  return out;
}

/** Shape-check a style.json read from disk. */
export function validStyle(x: unknown): x is Style {
  const s = x as Style;
  const t = s?.targets;
  return Boolean(s && typeof s.slug === "string" && t && ["cutsPer10s", "firstCut", "medianShot", "wpm", "firstWord", "duration"].every((k) => typeof (t as Record<string, unknown>)[k] === "number") && Array.isArray(s.sources));
}
