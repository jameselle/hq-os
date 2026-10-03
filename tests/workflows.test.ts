import assert from "node:assert/strict";
import { test } from "node:test";

import { DEPARTMENTS } from "../lib/registry";
import { EDGES, LEVERS, LOOPS, NODES, WORKFLOWS, edgesFor, workflowsFor } from "../lib/workflows";

const SLUGS = new Set([...DEPARTMENTS.map((d) => d.slug), "ceo"]);
const LEVER_KEYS = new Set(Object.keys(LEVERS));

test("every node, hand-off, loop step and workflow step names a real HQ department", () => {
  for (const n of NODES) assert.ok(SLUGS.has(n), `node ${n}`);
  for (const e of EDGES) {
    assert.ok(SLUGS.has(e.from), `edge from ${e.from}`);
    assert.ok(SLUGS.has(e.to), `edge to ${e.to}`);
    assert.notEqual(e.from, e.to, `self-edge on ${e.from}`);
  }
  for (const l of LOOPS) for (const [d] of l.steps) assert.ok(SLUGS.has(d), `loop ${l.title}: ${d}`);
  for (const w of WORKFLOWS) {
    assert.ok(SLUGS.has(w.owner), `${w.title}: owner ${w.owner}`);
    for (const [d] of w.steps) assert.ok(SLUGS.has(d), `${w.title}: step ${d}`);
  }
});

test("every department in the registry is on the web and in at least one workflow", () => {
  for (const d of DEPARTMENTS) {
    assert.ok(NODES.includes(d.slug), `${d.slug} missing from the web`);
    assert.ok(edgesFor(d.slug).length > 0, `${d.slug} has no hand-offs`);
    assert.ok(workflowsFor(d.slug).length > 0, `${d.slug} is in no workflow`);
  }
});

test("levers are known, titles are unique, and every workflow is runnable", () => {
  const titles = new Set<string>();
  for (const w of WORKFLOWS) {
    assert.ok(!titles.has(w.title), `duplicate workflow: ${w.title}`);
    titles.add(w.title);
    assert.ok(w.levers.length > 0 && w.levers.every((l) => LEVER_KEYS.has(l)), `${w.title}: levers`);
    assert.ok(w.steps.length >= 3, `${w.title}: needs at least 3 steps`);
    assert.ok(w.trigger && w.metric && w.example, `${w.title}: trigger, metric and example`);
  }
  for (const e of EDGES) assert.ok(e.levers.length > 0 && e.levers.every((l) => LEVER_KEYS.has(l)), `${e.from}->${e.to}: levers`);
  const pairs = EDGES.map((e) => `${e.from}>${e.to}>${e.signal}`);
  assert.equal(new Set(pairs).size, pairs.length, "duplicate hand-off");
});

test("each lever has workflows, and each lever has one owning loop", () => {
  for (const l of ["get", "keep", "expand", "base"] as const) {
    assert.ok(WORKFLOWS.some((w) => w.levers.includes(l)), `no workflow for ${l}`);
    assert.ok(LOOPS.some((x) => x.levers.includes(l)), `no loop for ${l}`);
  }
});

test("a department's workflows include the ones it owns and the ones it helps", () => {
  const owned = WORKFLOWS.filter((w) => w.owner === "competitors");
  const helped = WORKFLOWS.filter((w) => w.owner !== "competitors" && w.steps.some(([d]) => d === "competitors"));
  assert.equal(workflowsFor("competitors").length, owned.length + helped.length);
});
