import assert from "node:assert/strict";
import { test } from "node:test";

import { readinessScore, toolNeeds } from "../lib/readiness";
import { DEPARTMENTS } from "../lib/registry";

test("one member of a group satisfies the whole group", () => {
  const r = toolNeeds([
    { name: "Twenty", group: "crm", state: "missing" },
    { name: "EspoCRM", group: "crm", state: "installed" },
  ]);
  assert.deepEqual(r, { needs: 1, needsMet: 1 });
});

test("optional tools never count, present or not", () => {
  assert.deepEqual(toolNeeds([{ name: "Sentry", optional: true, state: "missing" }]), { needs: 0, needsMet: 0 });
  assert.deepEqual(toolNeeds([{ name: "A", state: "missing" }, { name: "B", optional: true, state: "running" }]), { needs: 1, needsMet: 0 });
});

test("readiness: skills and tool needs weigh half each; no needs means tools don't drag it down", () => {
  assert.equal(readinessScore(10, 10, 1, 2), 75);
  assert.equal(readinessScore(5, 10, 0, 0), 75);
  assert.equal(readinessScore(0, 0, 0, 0), 100);
});

test("every group has at least two members and every optional flag lands on a real tool", () => {
  const byGroup = new Map<string, number>();
  for (const d of DEPARTMENTS) for (const t of d.tools) if (t.group) byGroup.set(`${d.slug}/${t.group}`, (byGroup.get(`${d.slug}/${t.group}`) ?? 0) + 1);
  for (const [g, n] of byGroup) assert.ok(n >= 2, `group ${g} has only ${n} member: not an alternative`);
  const optional = DEPARTMENTS.flatMap((d) => d.tools.filter((t) => t.optional).map((t) => t.name));
  for (const name of ["camofox-browser", "claude-ads", "GrowthBook", "SerpBear", "Grafana", "Vaultwarden"]) assert.ok(optional.includes(name), `${name} should be optional`);
});
