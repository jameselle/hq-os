import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { addExperiment, closeExperiment, listExperiments, experimentsMarkdown } from "../lib/experiments";
import { profile, tempData } from "./helpers";

function setup() {
  const dir = tempData();
  const p = profile({ slug: "acme-co" });
  fs.mkdirSync(path.join(dir, "businesses", p.slug), { recursive: true });
  fs.writeFileSync(path.join(dir, "businesses", p.slug, "profile.json"), JSON.stringify(p));
  return { dir, p };
}

test("an experiment records its hypothesis, metric and the baseline, then its result", () => {
  const { dir } = setup();
  const e = addExperiment("acme-co", { hypothesis: "A first-week checklist lifts activation", metric: "activation_rate", baseline: 0.306 }, new Date("2026-10-03T00:00:00Z"));
  assert.equal(e.id, 1);
  assert.equal(e.lever, "keep");
  assert.equal(e.status, "running");
  const closed = closeExperiment("acme-co", 1, { result: 0.41, verdict: "won", note: "checklist shipped 10-05" }, new Date("2026-10-17T00:00:00Z"));
  assert.equal(closed.status, "won");
  assert.equal(listExperiments("acme-co").length, 1);
  assert.equal(fs.statSync(path.join(dir, "businesses", "acme-co", "experiments.json")).mode & 0o777, 0o600);
  const md = experimentsMarkdown(listExperiments("acme-co"));
  assert.match(md, /A first-week checklist lifts activation/);
  assert.match(md, /won/);
});

test("unknown metrics, empty hypotheses and missing experiments are refused", () => {
  setup();
  assert.throws(() => addExperiment("acme-co", { hypothesis: "x", metric: "nope" as never }), /metric/);
  assert.throws(() => addExperiment("acme-co", { hypothesis: "  ", metric: "mrr" }), /hypothesis/);
  assert.throws(() => closeExperiment("acme-co", 9, { verdict: "lost" }), /no experiment 9/);
  assert.throws(() => listExperiments("../acme-co"));
});
