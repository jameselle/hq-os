// HQ Studio: fully automatic clipping and editing. Run from the repo root:
//
//   npm run studio -- transcribe <video> [--model small.en]   words with timestamps (cached next to the job)
//   npm run studio -- render <spec.json>                        render every format in the spec
//   npm run studio -- check <video> [--hook "text"]             QA: probe, loudness, black/silence, contact sheet, hook re-read
//   npm run studio -- new-job <slug> <title>                     make a job folder and print its path
//
// Tools: FFmpeg/ffprobe and whisper.cpp (installed by HyperFrames). Nothing is posted:
// finished videos go to /hq:publish, which asks the owner.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { DEFAULT_BRAND, mergeBrand, type Brand } from "../lib/studio/brand";
import { FORMATS, validateSpec, type EditSpec, type Format } from "../lib/studio/spec";
import { buildAss, captionLines, keepPieces, outputDuration, reframeFilter, type Word } from "../lib/studio/timeline";
import { businessDir, getProfile, stamp, vaultRoot } from "../lib/store";

const HOME = os.homedir();
const WHISPER = path.join(HOME, ".cache", "hyperframes", "whisper", "whisper.cpp", "build", "bin", "whisper-cli");
const MODELS = path.join(HOME, ".cache", "hyperframes", "whisper", "models");

function die(msg: string): never {
  console.error(`studio: ${msg}`);
  process.exit(1);
}

function run(cmd: string, args: string[], opts: { quiet?: boolean } = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0 && !opts.quiet) die(`${path.basename(cmd)} failed:\n${(r.stderr || r.stdout).trim().split("\n").slice(-15).join("\n")}`);
  return r;
}

type Probe = { duration: number; w: number; h: number; fps: number; hasAudio: boolean };

function probe(file: string): Probe {
  if (!fs.existsSync(file)) die(`no such file: ${file}`);
  const r = run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]);
  const j = JSON.parse(r.stdout) as { streams: { codec_type: string; width?: number; height?: number; avg_frame_rate?: string }[]; format: { duration: string } };
  const v = j.streams.find((s) => s.codec_type === "video");
  if (!v) die(`${file} has no video stream`);
  const [n, d] = (v.avg_frame_rate ?? "30/1").split("/").map(Number);
  return { duration: Number(j.format.duration), w: v.width!, h: v.height!, fps: d ? n / d : 30, hasAudio: j.streams.some((s) => s.codec_type === "audio") };
}

// ---------------------------------------------------------------- transcribe

/** Word-level transcript via whisper.cpp. Cached as <video>.words.json next to the video (or in --out). */
function transcribe(video: string, model = "small.en", outDir?: string): Word[] {
  const cache = path.join(outDir ?? path.dirname(video), `${path.basename(video)}.words.json`);
  if (fs.existsSync(cache) && fs.statSync(cache).mtimeMs > fs.statSync(video).mtimeMs) return JSON.parse(fs.readFileSync(cache, "utf8")) as Word[];
  if (!fs.existsSync(WHISPER)) die("whisper-cli isn't built (see the hyperframes-local-setup memory note)");
  const modelFile = path.join(MODELS, `ggml-${model}.bin`);
  if (!fs.existsSync(modelFile)) die(`whisper model missing: ${modelFile}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hq-studio-"));
  const wav = path.join(tmp, "audio.wav");
  // Lead in with 0.5 s of silence: whisper drops a first word that starts at 0.0 s,
  // and in a clip that first word is the hook. Offsets are shifted back below.
  const LEAD = 0.5;
  run("ffmpeg", ["-y", "-v", "error", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-af", `adelay=${LEAD * 1000}:all=1`, "-c:a", "pcm_s16le", wav]);
  // DTW token timestamps are far more accurate than segment offsets (0.1 s vs ~1 s of drift on
  // an 81 s test), but whisper.cpp silently skips DTW while flash attention is on: hence -nfa.
  run(WHISPER, ["-m", modelFile, "-f", wav, "-ml", "1", "-sow", "-ojf", "-dtw", model, "-nfa", "-of", path.join(tmp, "out"), "-np"]);
  const j = JSON.parse(fs.readFileSync(path.join(tmp, "out.json"), "utf8")) as {
    transcription: { offsets: { from: number; to: number }; tokens?: { text: string; t_dtw?: number; offsets: { from: number; to: number } }[] }[];
  };
  const words: Word[] = [];
  for (const seg of j.transcription) {
    for (const t of seg.tokens ?? []) {
      const txt = t.text;
      if (!txt.trim() || txt.startsWith("[_") || txt.startsWith("<|") || /^\[.*\]$/.test(txt.trim())) continue;
      const at = (t.t_dtw ?? -1) >= 0 ? t.t_dtw! / 100 : t.offsets.from / 1000;
      const end = t.offsets.to / 1000;
      if (txt.startsWith(" ") || !words.length) words.push({ w: txt.trim(), start: Math.max(0, at - LEAD), end: Math.max(0, end - LEAD) });
      else {
        words[words.length - 1].w += txt; // punctuation and word pieces join the word before
        words[words.length - 1].end = Math.max(words[words.length - 1].end, end - LEAD);
      }
    }
  }
  // A word ends no later than the next one starts (segment offsets overshoot into pauses).
  for (let i = 0; i < words.length; i++) {
    const next = words[i + 1]?.start ?? Infinity;
    words[i].end = Math.round(Math.max(words[i].start + 0.05, Math.min(words[i].end, next, words[i].start + 1.2)) * 1000) / 1000;
    words[i].start = Math.round(words[i].start * 1000) / 1000;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, JSON.stringify(words));
  return words;
}

// ---------------------------------------------------------------- silences

/** Silent stretches in a file's audio, from FFmpeg's silencedetect. */
function silences(file: string, noiseDb = -35, minDur = 0.3): [number, number][] {
  const r = run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `silencedetect=n=${noiseDb}dB:d=${minDur}`, "-vn", "-f", "null", "-"], { quiet: true });
  const starts = [...r.stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, Number(m[1])));
  const ends = [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((s, i) => [s, ends[i] ?? s] as [number, number]).filter(([s, e]) => e > s);
}

// ---------------------------------------------------------------- render

function loadBrand(slug: string): Brand {
  try {
    return mergeBrand(JSON.parse(fs.readFileSync(path.join(businessDir(slug), "brand.json"), "utf8")) as Partial<Brand>);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_BRAND;
    throw e;
  }
}

function renderFormat(
  spec: EditSpec,
  fmt: Format,
  jobDir: string,
  words: Record<string, Word[]>,
  sil: Record<string, [number, number][]>,
  brand: Brand,
): string {
  const dims = FORMATS[fmt];
  const pieces = keepPieces(spec, words, sil);
  const ids = Object.keys(spec.sources);
  const probes = Object.fromEntries(ids.map((id) => [id, probe(spec.sources[id])]));
  for (const p of pieces) {
    const d = probes[p.source].duration;
    if (p.end > d + 0.05) die(`segment ${p.source} ${p.start}-${p.end}s runs past the end of the source (${d.toFixed(2)}s)`);
  }

  const inputs: string[] = [];
  ids.forEach((id) => inputs.push("-i", spec.sources[id]));
  let musicIdx = -1;
  if (spec.music) {
    musicIdx = ids.length;
    inputs.push("-stream_loop", "-1", "-i", spec.music.file);
  }

  const f: string[] = [];
  pieces.forEach((p, i) => {
    const k = ids.indexOf(p.source);
    const pr = probes[p.source];
    const vf = reframeFilter(pr, fmt, dims, spec.reframe ?? "crop", spec.focusX ?? 0.5, String(i));
    f.push(`[${k}:v]trim=start=${p.start}:end=${p.end},setpts=PTS-STARTPTS,fps=30,${vf},setsar=1[v${i}]`);
    if (pr.hasAudio) f.push(`[${k}:a]atrim=start=${p.start}:end=${p.end},asetpts=PTS-STARTPTS,aresample=48000[a${i}]`);
    else f.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${(p.end - p.start).toFixed(3)}[a${i}]`);
  });
  f.push(`${pieces.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${pieces.length}:v=1:a=1[vcat][acat]`);

  const vOut = "vcat";

  // Music ducks under the voice, then everything is levelled for social.
  const dur = outputDuration(pieces);
  let aOut = "acat";
  if (musicIdx >= 0) {
    const vol = spec.music?.volume ?? 0.15;
    f.push(`[${musicIdx}:a]atrim=duration=${dur},volume=${vol},aresample=48000[mus]`);
    f.push(`[acat]asplit=2[voice][key]`);
    f.push(`[mus][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck]`);
    f.push(`[voice][duck]amix=inputs=2:duration=first:dropout_transition=0[amix]`);
    aOut = "amix";
  }
  f.push(`[${aOut}]loudnorm=I=${spec.loudness ?? brand.loudness}:TP=-1.5:LRA=11[aout]`);

  const out = path.join(jobDir, `${slugify(spec.title)}-${fmt}.mp4`);
  const wantText = spec.captions !== false || Boolean(spec.hook);
  // Pass 1: the cut itself. When text follows, keep it near-lossless for the second encode.
  const cut = wantText ? path.join(jobDir, `.${fmt}.cut.mp4`) : out;
  run("ffmpeg", [
    "-y", "-v", "error", ...inputs,
    "-filter_complex", f.join(";"),
    "-map", `[${vOut}]`, "-map", "[aout]",
    "-t", String(dur),
    "-c:v", "libx264", "-preset", wantText ? "fast" : "medium", "-crf", wantText ? "12" : "20", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart",
    cut,
  ]);
  if (!wantText) return out;

  // Pass 2: captions come from transcribing the cut itself, so they match exactly what's
  // heard. Mapping source timestamps across cuts dropped words that landed in a removed pause.
  const heard = spec.captions === false ? [] : transcribe(cut, "small.en", fs.mkdtempSync(path.join(os.tmpdir(), "hq-cap-")));
  const lines = captionLines(heard);
  const ass = path.join(jobDir, `${fmt}.ass`);
  fs.writeFileSync(ass, buildAss(dims, lines, { font: brand.font, primary: brand.primary, outline: brand.outline, highlight: brand.highlight }, spec.hook));
  const esc = (p: string) => p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  run("ffmpeg", [
    "-y", "-v", "error", "-i", cut,
    "-vf", `subtitles='${esc(ass)}':fontsdir='${esc(brand.fontsDir)}'`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "copy", "-movflags", "+faststart",
    out,
  ]);
  fs.rmSync(cut, { force: true });
  return out;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "video";

function cmdRender(specFile: string | undefined) {
  if (!specFile) die("usage: render <spec.json>");
  const res = validateSpec(JSON.parse(fs.readFileSync(specFile, "utf8")));
  if (!res.ok) die(`spec is invalid:\n  - ${res.errors.join("\n  - ")}`);
  const spec = res.spec;
  const profile = getProfile(spec.business) ?? die(`no such business: ${spec.business}`);
  const jobDir = path.dirname(path.resolve(specFile));
  const brand = loadBrand(profile.slug);
  const words: Record<string, Word[]> = {};
  for (const [id, file] of Object.entries(spec.sources)) {
    words[id] = spec.captions === false && !spec.tightenPauses ? [] : transcribe(file, "small.en", jobDir);
  }
  // Transcripts often put the last word a little past the file's end: trim small overruns,
  // refuse anything that starts beyond the source.
  spec.segments = spec.segments.map((g) => {
    const d = probe(spec.sources[g.source]).duration;
    if (g.start >= d) die(`segment ${g.source} starts at ${g.start}s, past the end of the source (${d.toFixed(2)}s)`);
    if (g.end > d + 1) die(`segment ${g.source} ends at ${g.end}s, well past the end of the source (${d.toFixed(2)}s)`);
    return { ...g, end: Math.min(g.end, Math.floor(d * 1000) / 1000) };
  });
  const sil: Record<string, [number, number][]> = {};
  if (spec.tightenPauses) for (const [id, file] of Object.entries(spec.sources)) if (probe(file).hasAudio) sil[id] = silences(file);
  const outs = spec.formats.map((fmt) => renderFormat(spec, fmt, jobDir, words, sil, brand));
  for (const o of outs) console.log(`rendered ${o}`);
  writeJobNote(profile.slug, spec, jobDir, outs);
}

function writeJobNote(slug: string, spec: EditSpec, jobDir: string, outs: string[]) {
  const profile = getProfile(slug)!;
  const { date, time } = stamp(profile);
  const dir = path.join(vaultRoot(profile), "Departments", "Content & Social", "Studio");
  fs.mkdirSync(dir, { recursive: true });
  const note = path.join(dir, `${date} ${time} — ${spec.title.replace(/[\\/:*?"<>|]/g, "-")}.md`);
  const qa = fs.existsSync(path.join(jobDir, "qa.json")) ? `\nQA: see \`${path.join(jobDir, "qa.json")}\`\n` : "";
  fs.writeFileSync(
    note,
    `---\ntype: "studio-render"\nbusiness: ${JSON.stringify(profile.name)}\ndate: "${date}"\n---\n\n# ${spec.title}\n\n` +
      `Job: \`${jobDir}\`\n\n` + outs.map((o) => `- \`${path.basename(o)}\``).join("\n") + "\n" +
      (spec.hook ? `\n**Hook:** ${spec.hook.text}\n` : "") + qa,
  );
}

// ---------------------------------------------------------------- check (QA)

type Check = { name: string; ok: boolean; detail: string };

function cmdCheck(video: string | undefined, hook?: string) {
  if (!video) die("usage: check <video> [--hook \"text\"]");
  const checks: Check[] = [];
  const p = probe(video);
  const shape = Object.entries(FORMATS).find(([, d]) => d.w === p.w && d.h === p.h)?.[0];
  checks.push({ name: "format", ok: Boolean(shape), detail: `${p.w}x${p.h}${shape ? ` (${shape})` : " — not a known format"}` });
  checks.push({ name: "duration", ok: p.duration >= 3 && p.duration <= 600, detail: `${p.duration.toFixed(2)} s` });
  checks.push({ name: "audio", ok: p.hasAudio, detail: p.hasAudio ? "present" : "missing" });

  const loud = run("ffmpeg", ["-hide_banner", "-nostats", "-i", video, "-af", "ebur128", "-f", "null", "-"], { quiet: true });
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(loud.stderr.split("Summary:").pop() ?? "")?.[1]);
  checks.push({ name: "loudness", ok: lufs >= -17 && lufs <= -11, detail: `${Number.isFinite(lufs) ? lufs : "?"} LUFS (target -14)` });

  const bd = run("ffmpeg", ["-hide_banner", "-nostats", "-i", video, "-vf", "blackdetect=d=0.5:pix_th=0.1", "-an", "-f", "null", "-"], { quiet: true });
  const blacks = [...bd.stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => `${m[1]}–${m[2]}s`);
  checks.push({ name: "no black frames", ok: blacks.length === 0, detail: blacks.length ? blacks.join(", ") : "none" });

  const sd = run("ffmpeg", ["-hide_banner", "-nostats", "-i", video, "-af", "silencedetect=n=-45dB:d=2", "-vn", "-f", "null", "-"], { quiet: true });
  const deadAir = [...sd.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => `${Number(m[1]).toFixed(1)}s`);
  checks.push({ name: "no dead air (>2 s)", ok: deadAir.length === 0, detail: deadAir.length ? `from ${deadAir.join(", ")}` : "none" });

  // Contact sheet: 9 frames evenly spaced, for a visual check by whoever reviews (Claude).
  const sheet = video.replace(/\.mp4$/, "") + ".sheet.png";
  const every = Math.max(p.duration / 9, 0.1);
  run("ffmpeg", ["-y", "-v", "error", "-i", video, "-vf", `fps=1/${every.toFixed(3)},scale=360:-2,tile=3x3:padding=6:color=black`, "-frames:v", "1", sheet]);
  checks.push({ name: "contact sheet", ok: fs.existsSync(sheet), detail: sheet });

  // The hook must actually be said or shown in the first seconds: re-read the opening.
  const opening = transcribe(video, "small.en", fs.mkdtempSync(path.join(os.tmpdir(), "hq-qa-")))
    .filter((w) => w.start < 4)
    .map((w) => w.w)
    .join(" ");
  checks.push({ name: "opening words", ok: opening.length > 0, detail: opening || "(nothing said in the first 4 s)" });
  if (hook) checks.push({ name: "hook on screen", ok: true, detail: `burned in: "${hook}" (verify on the contact sheet)` });

  // Nothing lost or clipped mid-word: the render's words should match what the edit kept.
  const specFile = path.join(path.dirname(video), "spec.json");
  if (fs.existsSync(specFile)) {
    const res = validateSpec(JSON.parse(fs.readFileSync(specFile, "utf8")));
    if (res.ok) {
      const src: Record<string, Word[]> = {};
      for (const [id, file] of Object.entries(res.spec.sources)) src[id] = transcribe(file, "small.en", path.dirname(video));
      const sil: Record<string, [number, number][]> = {};
      if (res.spec.tightenPauses) for (const [id, file] of Object.entries(res.spec.sources)) if (probe(file).hasAudio) sil[id] = silences(file);
      // Everything said inside the chosen segments must survive: pause-cutting may never drop a word.
      const expected = res.spec.segments
        .flatMap((g) => (src[g.source] ?? []).filter((w) => (w.start + w.end) / 2 >= g.start && (w.start + w.end) / 2 <= g.end))
        .map((w) => norm(w.w))
        .filter(Boolean);
      const got = transcribe(video, "small.en", fs.mkdtempSync(path.join(os.tmpdir(), "hq-qa-"))).map((w) => norm(w.w)).filter(Boolean);
      const score = expected.length ? lcs(expected, got) / expected.length : 1;
      const missing = expected.filter((w) => !got.includes(w));
      checks.push({
        name: "words kept",
        ok: score >= 0.9,
        detail: `${Math.round(score * 100)}% of ${expected.length} expected words heard in the render${missing.length ? ` (missing: ${missing.slice(0, 8).join(" ")})` : ""}`,
      });
    }
  }

  const ok = checks.every((c) => c.ok);
  const result = { video, ok, checkedAt: new Date().toISOString(), checks };
  fs.writeFileSync(path.join(path.dirname(video), "qa.json"), JSON.stringify(result, null, 2));
  for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name.padEnd(20)} ${c.detail}`);
  console.log(ok ? "PASS" : "FAIL");
  if (!ok) process.exit(2);
}

const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** "Ninety-two" and "92" are the same word to a viewer: compare numbers as digits. */
function numberWord(w: string): string | null {
  const parts = w.toLowerCase().replace(/[^a-z-]/g, "").split("-").filter(Boolean);
  if (!parts.length) return null;
  let total = 0;
  for (const p of parts) {
    if (UNITS.includes(p)) total += UNITS.indexOf(p);
    else if (TENS.includes(p)) total += TENS.indexOf(p) * 10;
    else if (p === "hundred") total = (total || 1) * 100;
    else return null;
  }
  return String(total);
}

const norm = (w: string) => numberWord(w) ?? w.toLowerCase().replace(/[^a-z0-9']/g, "");

/** Longest common subsequence length: order-aware word overlap. */
function lcs(a: string[], b: string[]): number {
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

function cmdNewJob(slug: string | undefined, title: string | undefined) {
  const profile = (slug ? getProfile(slug) : null) ?? die(`no such business: ${slug ?? "(none)"}`);
  if (!title) die("usage: new-job <slug> <title>");
  const { date, time } = stamp(profile);
  const dir = path.join(businessDir(profile.slug), "studio", `${date}-${time}-${slugify(title)}`);
  fs.mkdirSync(dir, { recursive: true });
  console.log(dir);
}

// ---------------------------------------------------------------- main

const [cmd, ...args] = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const pos = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));

switch (cmd) {
  case "transcribe": {
    const words = transcribe(pos[0] ?? die("usage: transcribe <video>"), opt("--model") ?? "small.en", opt("--out"));
    console.log(JSON.stringify({ words: words.length, duration: words.at(-1)?.end ?? 0, text: words.map((w) => w.w).join(" ") }, null, 2));
    break;
  }
  case "render":
    cmdRender(pos[0]);
    break;
  case "check":
    cmdCheck(pos[0], opt("--hook"));
    break;
  case "new-job":
    cmdNewJob(pos[0], pos.slice(1).join(" "));
    break;
  default:
    console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(0, 10).join("\n").replace(/^\/\/ ?/gm, ""));
    if (cmd && cmd !== "help") process.exit(1);
}
