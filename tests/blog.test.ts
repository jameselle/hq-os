import { test } from "node:test";
import assert from "node:assert/strict";

import { checkDraft, decide, decisionText, formatDraft, overlap, parseDraft, validateConfig, type BlogConfig, type BlogDraft, type CheckContext } from "../lib/blog";

const SITE = "https://coffee.example";
const para = (i: number) => `Paragraph ${i} explains how a cold brew concentrate keeps for a week in the fridge, why the grind matters for extraction, and what changes when you switch beans between roasts number ${i}.`;
function good(): BlogDraft {
  const body = [
    "How to make cold brew coffee at home starts with coarse beans and patience.",
    "## What you need",
    ...Array.from({ length: 30 }, (_, i) => para(i)),
    `Read our [brewing guide](${SITE}/guides/brewing/) and pick a [roast](${SITE}/roasts/).`,
    "## Sources",
    "Every figure above links its source.",
  ].join("\n\n");
  return {
    meta: {
      slug: "cold-brew-at-home", title: "How to make cold brew coffee at home", keyword: "cold brew coffee",
      description: "A simple guide to cold brew coffee at home: the grind, the ratio, how long to steep and how long it keeps.",
      sources: [1, 2, 3].map((n) => ({ title: `Source ${n}`, url: `https://source${n}.example/a` })), faq: [], date: "2026-10-06", status: "draft",
    },
    markdown: body,
  };
}
const ctx = (over: Partial<CheckContext> = {}): CheckContext => ({
  site: SITE, regulated: [], existingSlugs: [], existingTexts: [],
  sourceStatus: { "https://source1.example/a": 200, "https://source2.example/a": 200, "https://source3.example/a": 301 }, ...over,
});
const failed = (d: BlogDraft, c = ctx()) => checkDraft(d, c).filter((x) => !x.ok).map((x) => x.id);

test("a draft round-trips through its file format", () => {
  const d = good();
  const back = parseDraft(formatDraft(d));
  assert.deepEqual(back.meta, d.meta);
  assert.equal(back.markdown.trim(), d.markdown.trim());
  assert.throws(() => parseDraft("no front block"), /front block/);
  assert.throws(() => parseDraft('---\n{"slug":"x"}\n---\nbody'), /missing title/);
});

test("a well made post passes every check", () => {
  assert.deepEqual(failed(good()), []);
});

test("each rule fails on its own, and says why", () => {
  const d = good();
  d.meta.title = "Too short";
  d.meta.description = "Short.";
  d.markdown = d.markdown.replace("coarse beans", "coarse beans — always") + "\n\n<div>html</div>\n";
  d.meta.sources = d.meta.sources.slice(0, 2);
  const ids = failed(d);
  for (const id of ["title", "description", "dashes", "format", "sources"]) assert.ok(ids.includes(id), id);
  const checks = checkDraft(d, ctx());
  assert.match(checks.find((c) => c.id === "title")!.detail, /9 characters/);
});

test("source links must load, and unchecked ones don't pass", () => {
  assert.ok(failed(good(), ctx({ sourceStatus: { "https://source1.example/a": 404, "https://source2.example/a": 200, "https://source3.example/a": 200 } })).includes("source-links"));
  assert.ok(failed(good(), ctx({ sourceStatus: {} })).includes("source-links"));
});

test("internal links count only the business's own site, and slugs can't repeat", () => {
  assert.ok(failed(good(), ctx({ site: "https://other.example" })).includes("internal-links"));
  assert.ok(failed(good(), ctx({ existingSlugs: ["cold-brew-at-home"] })).includes("slug"));
});

test("regulated businesses get banned words and their required line", () => {
  const d = good();
  d.markdown += "\n\nThis method is guaranteed to work.\n";
  const ids = failed(d, ctx({ regulated: ["gambling"] }));
  assert.ok(ids.includes("claims"));
  assert.ok(ids.includes("required-gambling"));
  d.markdown = d.markdown.replace("guaranteed to work", "simple") + "\n\n18+. Odds change. Please gamble responsibly.\n";
  assert.deepEqual(failed(d, ctx({ regulated: ["gambling"] })), []);
});

test("a near copy of an existing post is caught", () => {
  const d = good();
  assert.ok(overlap(d.markdown, d.markdown) > 0.9);
  assert.ok(failed(d, ctx({ existingTexts: [d.markdown] })).includes("unique"));
  assert.ok(overlap(d.markdown, "an entirely different text about tea leaves and kettles") < 0.05);
});

test("week one waits, auto publishes passing posts, and a failed check always waits", () => {
  const meta = { ...good().meta, checks: checkDraft(good(), ctx()) };
  const cfg: BlogConfig = { mode: "auto", site: SITE, approveUntil: "2026-10-13T00:00:00Z" };
  assert.equal(decide(cfg, meta, new Date("2026-10-07T00:00:00Z")), "wait");
  assert.match(decisionText(cfg, meta, new Date("2026-10-07T00:00:00Z")), /Week one/);
  assert.equal(decide(cfg, meta, new Date("2026-10-14T00:00:00Z")), "publish");
  assert.equal(decide(cfg, { ...meta, status: "approved" }, new Date("2026-10-07T00:00:00Z")), "publish");
  assert.equal(decide({ ...cfg, mode: "draft" }, meta, new Date("2026-10-20T00:00:00Z")), "wait");
  const bad = { ...meta, checks: [...meta.checks, { id: "x", label: "X", ok: false, detail: "" }] };
  assert.equal(decide(cfg, { ...bad, status: "approved" }, new Date("2026-10-20T00:00:00Z")), "blocked");
  assert.equal(decide({ ...cfg, mode: "off" }, meta, new Date()), "off");
  assert.equal(decide(cfg, { ...meta, status: "published" }, new Date()), "done");
});

test("the config is validated", () => {
  assert.equal(validateConfig({ mode: "auto", site: SITE }).mode, "auto");
  assert.throws(() => validateConfig({ mode: "sometimes", site: SITE }), /mode/);
  assert.throws(() => validateConfig({ mode: "off", site: "http://x" }), /https/);
});
