import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { runWorkflowChecks, validChecks, workflowChecksState } from "../lib/workflow-checks";
import { evidenceFrom, type EvidenceFacts } from "../lib/workflow-evidence";
import { profile, tempData } from "./helpers";

const T = "Search demand becomes pages at scale";
const base = { version: 1, observedAt: new Date().toISOString(), workflows: [{ title: T, checks: [{ label: "Sitemap lists 40 guide pages", ok: true }] }] };

test("validation: known titles only, plain text only", () => {
  assert.equal(validChecks(base), true);
  assert.equal(validChecks({ ...base, workflows: [{ title: "Not a workflow", checks: [{ label: "x", ok: true }] }] }), false);
  assert.equal(validChecks({ ...base, workflows: [{ title: T, checks: [] }] }), false, "a workflow with no checks proves nothing");
  assert.equal(validChecks({ ...base, workflows: [{ title: T, checks: [{ label: "sent to someone@example.com", ok: true }] }] }), false);
  assert.equal(validChecks({ ...base, workflows: [{ title: T, checks: [{ label: "page", ok: true, detail: "https://x.example/p?token=1" }] }] }), false);
  assert.equal(validChecks({ ...base, workflows: [{ title: T, checks: [{ label: "x", ok: "yes" }] }] }), false);
});

test("run: the adapter's answer is validated and rebuilt, extras dropped", async () => {
  const data = tempData(); const p = profile(); const dir = path.join(data, "businesses", p.slug);
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "profile.json"), JSON.stringify(p));
  const answer = { ...base, secret: "must-not-persist", workflows: [{ title: T, extra: 1, checks: [{ label: "Sample page answers the key question", ok: false, detail: "not deployed", raw: "drop" }] }] };
  fs.writeFileSync(path.join(dir, "workflow-checks-connection.json"), JSON.stringify({ command: [process.execPath, "-e", `process.stdin.resume();process.stdin.on('end',()=>console.log(${JSON.stringify(JSON.stringify(answer))}))`] }));
  const s = await runWorkflowChecks(p.slug);
  assert.equal(s.connected, true);
  assert.equal(s.stale, false);
  const saved = fs.readFileSync(path.join(dir, "workflow-checks.json"), "utf8");
  assert.ok(!saved.includes("must-not-persist") && !saved.includes("drop") && !saved.includes("extra"));
  assert.deepEqual(workflowChecksState(p.slug).snapshot!.workflows[0].checks, [{ label: "Sample page answers the key question", ok: false, detail: "not deployed" }]);
});

const none: EvidenceFacts = { demo: false, sites: [], posts: [], studioJobs: { count: 0 }, reviews: { count: 0 }, plans: 0, scorecardWeeks: [], lifecycle: null };

test("evidence: live only when every check passed recently", () => {
  const ok = evidenceFrom({ ...none, checks: { observedAt: "2026-10-04T00:00:00.000Z", stale: false, workflows: [{ title: T, checks: [{ label: "Pages live", ok: true }, { label: "Signups measured", ok: true, detail: "organic 2" }] }] } });
  assert.equal(ok[T].state, "live");
  assert.deepEqual(ok[T].proof, ["Pages live", "Signups measured: organic 2"]);

  const part = evidenceFrom({ ...none, checks: { observedAt: "2026-10-04T00:00:00.000Z", stale: false, workflows: [{ title: T, checks: [{ label: "Pages live", ok: true }, { label: "Signups measured", ok: false, detail: "attribution not deployed" }] }] } });
  assert.equal(part[T].state, "partial");
  assert.equal(part[T].proof[1], "Not yet: Signups measured: attribution not deployed");

  const stale = evidenceFrom({ ...none, checks: { observedAt: "2026-09-01T00:00:00.000Z", stale: true, workflows: [{ title: T, checks: [{ label: "Pages live", ok: true }] }] } });
  assert.equal(stale[T].state, "partial");
  assert.match(stale[T].proof.at(-1)!, /over 8 days ago/);
});

test("evidence: checks never downgrade a workflow lifecycle deliveries already prove", () => {
  const lifecycle = { connected: true, readOnly: false, observedAt: "2026-10-04T00:00:00.000Z", enabled: 1, stages: 1,
    workflows: [{ label: "Alerts", enabled: true, serves: "Daily habit", sent30d: 5, lastSentAt: "2026-10-03T00:00:00.000Z" }] };
  const e = evidenceFrom({ ...none, lifecycle, checks: { observedAt: "2026-10-04T00:00:00.000Z", stale: false, workflows: [{ title: "Daily habit", checks: [{ label: "x", ok: false }] }] } });
  assert.equal(e["Daily habit"].state, "live");
});
