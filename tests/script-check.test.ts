import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { checkScript, splitSentences, syllables } from "../lib/script-check";

const INSIDER = `## 1 · Hook
Last video, 4 of my 51 workflows ran.
Today, every one has a number.

## 2 · The emails
One page shows every flow and its holdout, with the churn and MRR it moves this week.
`;

const PLAIN = `## 1 · Hook
Do you know which of your emails actually sell coffee?
I didn't. So I built a page that tells me.

## 2 · Show it
Every morning it puts one number next to each thing I do to grow.
Comment BEANS and I'll send it to you.
`;

test("insider words are named with a plain swap, once each", () => {
  const r = checkScript(INSIDER);
  const terms = r.jargon.map((j) => j.term);
  for (const t of ["workflows", "flow", "holdout", "churn", "mrr"]) assert.ok(terms.includes(t), t);
  assert.equal(new Set(terms).size, terms.length);
  assert.ok(r.advice.some((a) => /"holdout" means nothing to a stranger/.test(a)));
  assert.ok(r.advice.some((a) => /never says 'you'/.test(a)));
});

test("a plain, viewer-first script passes with no insider words", () => {
  const r = checkScript(PLAIN, { keyword: "BEANS" });
  assert.deepEqual(r.jargon, []);
  assert.deepEqual(r.problems, []);
  assert.equal(r.hook, "Do you know which of your emails actually sell coffee?");
  assert.deepEqual(r.sections, ["1 · Hook", "2 · Show it"]);
  assert.ok(r.grade < 8, `grade ${r.grade}`);
});

test("length uses the speaking pace and the posting speed", () => {
  const words = Array.from({ length: 175 }, () => "word").join(" ") + ".";
  const r = checkScript(`## 1\n${words}`, { wpm: 175, speed: 1.25, targetSeconds: 30 });
  assert.equal(r.spokenSeconds, 60);
  assert.equal(r.postedSeconds, 48);
  assert.ok(r.problems.some((p) => /48 s posted vs a 30 s target/.test(p)));
});

test("problems: dashes, a business name, a missing keyword, a long hook, a run-on sentence", () => {
  const long = "This is the opening line that keeps on going for far too many words before it ever gets to the point.";
  const runOn = Array.from({ length: 22 }, (_, i) => `w${i}`).join(" ") + ".";
  const r = checkScript(`## 1\n${long}\nIt runs Acme Roasters — and more.\n${runOn}`, { keyword: "BEANS", names: ["Acme Roasters"] });
  const all = r.problems.join(" | ");
  assert.match(all, /em or en dash/);
  assert.match(all, /names a business: Acme Roasters/);
  assert.match(all, /never says the keyword BEANS/);
  assert.match(all, /first sentence is 2\d words/);
  assert.match(all, /22-word sentence, split it/);
});

test("sentence split and syllables behave on spoken text", () => {
  assert.deepEqual(splitSentences('It said "not measured yet." Then I fixed it! Did it work?'), ['It said "not measured yet."', "Then I fixed it!", "Did it work?"]);
  assert.equal(syllables("coffee"), 2);
  assert.equal(syllables("automatically"), 6);
  assert.equal(syllables("the"), 1);
});

test("hq script-check prints PASS for a plain script and exits 1 on a problem", () => {
  const root = path.resolve(__dirname, "..");
  const ok = spawnSync(process.execPath, ["--import", "tsx", "scripts/hq.ts", "script-check", "-", "--keyword", "BEANS"], { cwd: root, input: PLAIN, encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /PASS/);
  const bad = spawnSync(process.execPath, ["--import", "tsx", "scripts/hq.ts", "script-check", "-", "--keyword", "TEA"], { cwd: root, input: PLAIN, encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /never says the keyword TEA/);
});
