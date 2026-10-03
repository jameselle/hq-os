import assert from "node:assert/strict";
import { test } from "node:test";

import { compareToStyle, hookLine, median, paceStats, parseCuts, styleFrom, validStyle, type Measure, type Word } from "../lib/studio/style";

const words = (spec: [string, number][]): Word[] => spec.map(([w, start]) => ({ w, start, end: start + 0.3 }));

test("parseCuts reads showinfo times, sorts them and merges flashes closer than the gap", () => {
  const stderr = ["[Parsed_showinfo_2] n:0 pts:900 pts_time:3.0 duration:1", "junk", "pts_time:1.5 ", "pts_time:1.6", "pts_time:7.25"].join("\n");
  assert.deepEqual(parseCuts(stderr), [1.5, 3, 7.25]);
  assert.deepEqual(parseCuts(""), []);
});

test("hookLine stops at the first sentence end, or 4 s in", () => {
  assert.equal(hookLine(words([["I", 0.2], ["don't", 0.4], ["edit.", 0.8], ["Claude", 1.2]])), "I don't edit.");
  assert.equal(hookLine(words([["no", 0], ["stop", 2], ["here", 3.9], ["later", 4.5]])), "no stop here");
  assert.equal(hookLine([]), "");
});

test("paceStats: cuts per 10 s, shots, pace and first word", () => {
  const w = words(Array.from({ length: 30 }, (_, i) => [`w${i}`, 0.5 + i * 0.6] as [string, number]));
  const s = paceStats(20, [0, 2, 5, 9, 20], w);
  assert.equal(s.cutsPer10s, 1.5); // 0 and 20 are the clip's edges, not cuts
  assert.equal(s.firstCut, 2);
  assert.equal(s.medianShot, 3.5); // shots 2, 3, 4, 11
  assert.equal(s.longestShot, 11);
  assert.equal(s.wpm, 90);
  assert.equal(s.firstWord, 0.5);
  assert.equal(s.speaking, 0.45);
  assert.equal(paceStats(10, [], []).firstCut, null);
  assert.equal(paceStats(10, [], []).medianShot, 10);
});

const m = (over: Partial<Measure>): Measure => ({
  source: "u", duration: 30, cuts: [], cutsPer10s: 2, firstCut: 1, medianShot: 3, longestShot: 6, wpm: 180, firstWord: 0.2, speaking: 0.8, hookLine: "h", lufs: -14, ...over,
});

test("styleFrom takes medians and never writes NaN when no clip had a number", () => {
  const s = styleFrom("acme-co", [m({ cutsPer10s: 1, wpm: 150 }), m({ cutsPer10s: 3, wpm: 210 }), m({ cutsPer10s: 2, wpm: 190 })], "AI tools", new Date("2026-10-02T00:00:00Z"));
  assert.equal(s.targets.cutsPer10s, 2);
  assert.equal(s.targets.wpm, 190);
  assert.equal(s.sources.length, 3);
  assert.equal(s.niche, "AI tools");
  assert.ok(validStyle(JSON.parse(JSON.stringify(s))));
  const none = styleFrom("acme-co", [m({ firstCut: null, firstWord: null })]);
  assert.equal(none.targets.firstCut, 30);
  assert.equal(none.targets.firstWord, 0);
  assert.ok(validStyle(JSON.parse(JSON.stringify(none))));
  assert.throws(() => styleFrom("acme-co", []));
  assert.equal(median([3, 1, 2, NaN]), 2);
});

test("compareToStyle flags what is far off, and late-only for first cut and first word", () => {
  const t = { cutsPer10s: 2, firstCut: 1, medianShot: 3, wpm: 180, firstWord: 0.3, duration: 30 };
  const close = compareToStyle({ cutsPer10s: 2.2, firstCut: 0.5, wpm: 170, firstWord: 0.1 }, t);
  assert.ok(close.every((c) => !c.off));
  const far = compareToStyle({ cutsPer10s: 0.7, firstCut: 4, wpm: 100, firstWord: 1.5 }, t);
  assert.deepEqual(far.map((c) => c.off), [true, true, true, true]);
  assert.match(far[0].line, /cuts 0\.7\/10 s vs 2/);
  assert.equal(compareToStyle({ cutsPer10s: 2, firstCut: null, wpm: 180, firstWord: null }, t).length, 2);
});

test("validStyle refuses a file without its targets", () => {
  assert.equal(validStyle({ slug: "x", targets: { cutsPer10s: 1 }, sources: [] }), false);
  assert.equal(validStyle(null), false);
});
