import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { mergeBrand } from "../lib/studio/brand";
import { validateSpec, type EditSpec } from "../lib/studio/spec";
import { assColour, buildAss, captionLines, keepPieces, outputDuration, outputWords, reframeFilter, type Word } from "../lib/studio/timeline";
import { profile, tempData } from "./helpers";
import { scaffoldBusiness } from "../lib/store";

const spec = (over: Partial<EditSpec> = {}): EditSpec => ({
  business: "acme-co",
  title: "T",
  sources: { a: "/tmp/a.mp4" },
  segments: [{ source: "a", start: 0, end: 10 }],
  formats: ["vertical"],
  ...over,
});
const W = (w: string, start: number, end: number): Word => ({ w, start, end });

test("spec validation names every problem", () => {
  assert.equal(validateSpec(spec()).ok, true);
  const r = validateSpec({ ...spec(), sources: { a: "relative.mp4" }, segments: [{ source: "b", start: 5, end: 2 }], formats: ["cinema"] });
  assert.equal(r.ok, false);
  if (!r.ok) for (const k of ["sources.a", "segments[0].source", "segments[0]", "formats"]) assert.ok(r.errors.some((e) => e.startsWith(k)), k);
});

test("pauses are cut from real silence, with air kept either side", () => {
  const pieces = keepPieces(spec({ tightenPauses: 0.5 }), {}, { a: [[3, 5], [7, 7.3]] });
  // 3..5 is cut (keeps 0.15 s each side); 7..7.3 is shorter than 0.5 so it stays
  assert.deepEqual(pieces.map((p) => [p.start, p.end]), [[0, 3.15], [4.85, 10]]);
  assert.equal(outputDuration(pieces), 8.3);
});

test("without silence data, word gaps decide", () => {
  const words = { a: [W("one", 0, 1), W("two", 3, 4)] };
  assert.equal(keepPieces(spec({ tightenPauses: 0.5 }), words).length, 2);
  assert.equal(keepPieces(spec({ tightenPauses: 0 }), words).length, 1);
});

test("words are re-timed onto the output clock; a word stretched over a cut pause survives", () => {
  const pieces = keepPieces(spec({ tightenPauses: 0.5 }), {}, { a: [[3, 5]] });
  const words = { a: [W("hot.", 2.5, 4.9), W("Here", 5.0, 5.3)] }; // whisper stretched "hot." across the pause
  const out = outputWords(pieces, words);
  assert.deepEqual(out.map((w) => w.w), ["hot.", "Here"]);
  assert.ok(out[1].start < 3.6, "second word moved up by the cut");
});

test("captions: at most 3 words, break on sentence ends, hold until the next line", () => {
  const lines = captionLines([W("Most", 0, 0.2), W("people", 0.2, 0.5), W("brew", 0.5, 0.7), W("coffee.", 0.7, 1), W("Fix", 1.1, 1.3)]);
  assert.deepEqual(lines.map((l) => l.text), ["Most people brew", "coffee.", "Fix"]);
  assert.equal(lines[0].end, lines[1].start);
});

test("ASS output: colours, hook, escaped text", () => {
  assert.equal(assColour("#FFD60A"), "&H000AD6FF");
  const ass = buildAss({ w: 1080, h: 1920 }, [{ text: "a {b}", start: 0, end: 1 }], { font: "Arial Black", primary: "#FFFFFF", outline: "#000000", highlight: "#FFD60A" }, { text: "HOOK", seconds: 2 });
  assert.match(ass, /PlayResY: 1920/);
  assert.match(ass, /Dialogue: 1,0:00:00\.00,0:00:02\.00,Hook,,0,0,0,,HOOK/);
  assert.match(ass, /,Caption,,0,0,0,,A \(B\)/);
});

test("reframe: crop keeps the focus inside the frame; same shape just scales", () => {
  assert.equal(reframeFilter({ w: 1920, h: 1080 }, "landscape", { w: 1920, h: 1080 }, "crop"), "scale=1920:1080");
  const f = reframeFilter({ w: 1920, h: 1080 }, "vertical", { w: 1080, h: 1920 }, "crop", 0.5);
  assert.equal(f, "scale=3414:1920,crop=1080:1920:1167:0");
  assert.match(reframeFilter({ w: 1920, h: 1080 }, "vertical", { w: 1080, h: 1920 }, "crop", 1), /crop=1080:1920:2334:0/);
  assert.match(reframeFilter({ w: 1920, h: 1080 }, "vertical", { w: 1080, h: 1920 }, "fit-blur", 0.5, "7"), /\[bg7\].*boxblur/);
});

test("brand: defaults fill gaps, bad colours are refused", () => {
  assert.equal(mergeBrand({ highlight: "#00FF00" }).font, "Arial Black");
  assert.throws(() => mergeBrand({ primary: "white" }), /primary/);
});

// ---- end to end: only where the real tools exist ----
const has = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
const whisper = path.join(os.homedir(), ".cache", "hyperframes", "whisper", "whisper.cpp", "build", "bin", "whisper-cli");
const e2eReady = has("ffmpeg", ["-version"]) && has("/usr/bin/say", ["-v", "?"]) && fs.existsSync(whisper);

test("end to end: speech with pauses -> captioned vertical clip that passes QA", { skip: !e2eReady && "needs ffmpeg, say and whisper-cli", timeout: 240_000 }, () => {
  tempData();
  scaffoldBusiness(profile());
  const job = spawnSync("npx", ["tsx", "scripts/studio.ts", "new-job", "acme-co", "e2e"], { encoding: "utf8", env: process.env }).stdout.trim();
  const aiff = path.join(job, "talk.aiff");
  spawnSync("/usr/bin/say", ["-v", "Samantha", "-o", aiff, "Brew it cooler. [[slnc 2000]] Ninety two degrees is the sweet spot."]);
  const src = path.join(job, "source.mp4");
  spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30", "-i", aiff, "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", src]);
  fs.writeFileSync(path.join(job, "spec.json"), JSON.stringify(spec({ sources: { a: src }, segments: [{ source: "a", start: 0, end: 5.5 }], tightenPauses: 0.6, captions: true, hook: { text: "TOO HOT?" } })));
  const r = spawnSync("npx", ["tsx", "scripts/studio.ts", "render", path.join(job, "spec.json")], { encoding: "utf8", env: process.env });
  assert.equal(r.status, 0, r.stderr);
  const out = path.join(job, "t-vertical.mp4");
  const qa = spawnSync("npx", ["tsx", "scripts/studio.ts", "check", out], { encoding: "utf8", env: process.env });
  assert.equal(qa.status, 0, qa.stdout + qa.stderr);
  assert.match(qa.stdout, /words kept\s+100%/);
});
