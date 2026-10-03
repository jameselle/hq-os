import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { GUIDES, guideBySlug, guideForDepartment } from "../lib/guides";
import { DEPARTMENTS } from "../lib/registry";
import { nameRegex, privateNames } from "./helpers";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("every guide is a real doc with a heading, under a URL-safe slug", () => {
  for (const g of GUIDES) {
    assert.match(g.slug, /^[a-z0-9-]+$/);
    assert.ok(fs.existsSync(path.join(root, g.file)), g.file);
    assert.match(read(g.file), /^# /m, g.file);
  }
  assert.equal(new Set(GUIDES.map((g) => g.slug)).size, GUIDES.length);
});

test("every doc in docs/guides is listed, so nothing is written and never shown", () => {
  const listed = new Set(GUIDES.map((g) => g.file));
  for (const f of fs.readdirSync(path.join(root, "docs/guides")).filter((f) => f.endsWith(".md") && !f.startsWith("_")))
    assert.ok(listed.has(`docs/guides/${f}`), `docs/guides/${f} is not in lib/guides.ts`);
});

test("only listed docs resolve", () => {
  assert.equal(guideBySlug("scorecard-billing")?.file, "docs/guides/scorecard-billing.md");
  assert.equal(guideBySlug("../../package.json"), null);
  assert.equal(guideBySlug("nope"), null);
});

test("there is a start-here guide and every department has its own guide", () => {
  assert.equal(guideBySlug("start-here")?.kind, "start");
  for (const d of DEPARTMENTS) assert.ok(guideForDepartment(d.slug), `no guide for department ${d.slug}`);
});

test("each department guide names every tool and HQ skill the department lists, and has the walk-through sections", () => {
  for (const d of DEPARTMENTS) {
    const g = guideForDepartment(d.slug)!;
    const text = read(g.file);
    const lower = text.toLowerCase();
    for (const t of d.tools) assert.ok(lower.includes(t.name.toLowerCase()), `${g.file}: missing tool ${t.name}`);
    for (const s of d.skills.filter((s) => s.id.startsWith("hq:"))) assert.ok(text.includes(`/${s.id}`), `${g.file}: missing skill /${s.id}`);
    for (const h of ["## Before you start", "## 1. Tools", "## 3. Skills to use", "## 4. Check it's working", "## Done when"]) assert.ok(text.includes(h), `${g.file}: missing "${h}"`);
    assert.match(text, /If you are an AI walking an owner through this/, `${g.file}: missing the AI note`);
  }
});

test("links between guides point at guides that exist", () => {
  for (const g of GUIDES)
    for (const [, slug] of read(g.file).matchAll(/\]\(\/guides\/([a-z0-9-]+)\)/g)) assert.ok(guideBySlug(slug), `${g.file} links to missing /guides/${slug}`);
});

test("guides never name a real business", (t) => {
  const re = nameRegex(privateNames());
  if (!re) return t.skip("no private names on this machine");
  for (const g of GUIDES) assert.doesNotMatch(read(g.file), re, g.file);
});
