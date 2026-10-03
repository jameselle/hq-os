import { test } from "node:test";
import assert from "node:assert/strict";

import { ROUTES, weakestLever } from "../lib/levers";
import { WORKFLOWS } from "../lib/workflows";

type M = { id: string; value: number | null; quality: "exact" | "approx" | "missing"; note: string };
const m = (id: string, value: number | null): M => ({ id, value, quality: value === null ? "missing" : "exact", note: "" });
const weeks = (rows: Record<string, (number | null)[]>) => {
  const n = Math.max(...Object.values(rows).map((r) => r.length));
  return Array.from({ length: n }, (_, i) => ({ week: `2026-W${String(40 - i).padStart(2, "0")}`, metrics: Object.entries(rows).map(([id, v]) => m(id, v[i] ?? null)) }));
};

test("every route points at a real workflow, owned by a real department", () => {
  for (const r of ROUTES) {
    const w = WORKFLOWS.find((x) => x.title === r.workflow);
    assert.ok(w, `no workflow "${r.workflow}"`);
  }
});

test("a falling activation rate makes Keep the weakest lever and routes to onboarding", () => {
  // newest first: 30.6% now, against a trailing average of ~46%
  const w = weakestLever(weeks({ activation_rate: [0.306, 0.4, 0.444, 0.457, 0.538], new_paying: [2, 2, 2, 2, 2], nrr: [1.02, 1.01, 1.0, 1.0, 1.0] }));
  assert.equal(w?.lever, "keep");
  assert.equal(w?.metric, "activation_rate");
  assert.equal(w?.workflow, "Onboarding to first value");
  assert.equal(w?.owner, "engineering");
  assert.ok(w!.baseline > 0.45 && w!.baseline < 0.47);
});

test("weekly paying churn over the limit wins even without history", () => {
  const w = weakestLever(weeks({ paying_churn_rate: [0.12], activation_rate: [0.5] }));
  assert.equal(w?.metric, "paying_churn_rate");
  assert.equal(w?.workflow, "Churn early warning");
});

test("small wobbles and missing numbers route nowhere", () => {
  assert.equal(weakestLever(weeks({ activation_rate: [0.44, 0.45, 0.46, 0.45, 0.44], new_paying: [3, 3, 3, 3, 3] })), null);
  assert.equal(weakestLever(weeks({ activation_rate: [null, 0.4, 0.4, 0.4, 0.4] })), null);
  assert.equal(weakestLever([]), null);
});
