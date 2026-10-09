import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { WORKFLOW_ANALYTICS } from "../lib/analytics-metrics";
import { hqMetrics } from "../lib/analytics";
import { writeNote } from "../lib/brain-store";
import { opsRecords } from "../lib/ops-records";
import { savePlan, scaffoldBusiness, vaultRoot } from "../lib/store";
import { evidenceFrom, workflowEvidence, type EvidenceFacts } from "../lib/workflow-evidence";
import { WORKFLOWS } from "../lib/workflows";
import { profile, tempData } from "./helpers";

const TITLE = "Runbooks, vendors and risks";
const none: EvidenceFacts = { demo: false, sites: [], posts: [], studioJobs: { count: 0 }, reviews: { count: 0 }, plans: 0, scorecardWeeks: [], lifecycle: null };

test("the workflow is in the catalogue, owned by operations, with a number", () => {
  const w = WORKFLOWS.find((x) => x.title === TITLE);
  assert.ok(w);
  assert.equal(w.owner, "operations");
  assert.deepEqual(WORKFLOW_ANALYTICS[TITLE], ["runbooks"]);
});

test("evidence: nothing on record leaves it unmarked; all three make it live; a gap is named", () => {
  assert.equal(evidenceFrom({ ...none, ops: null })[TITLE], undefined);
  assert.equal(evidenceFrom({ ...none, ops: { runbooks: 0, vendorReview: null, riskRegister: null } })[TITLE], undefined);

  const live = evidenceFrom({ ...none, ops: { runbooks: 4, lastRunbook: "2026-10-06T14:00:00.000Z", vendorReview: { day: "2026-10-07", at: "2026-10-06T15:00:00.000Z" }, riskRegister: { day: "2026-10-07", at: "2026-10-06T16:00:00.000Z" } } })[TITLE];
  assert.equal(live.state, "live");
  assert.deepEqual(live.proof, ["4 runbooks in the business's vault", "Vendor review saved 2026-10-07", "Risk register saved 2026-10-07"]);
  assert.equal(live.last, "2026-10-06T16:00:00.000Z", "the newest file time");

  const part = evidenceFrom({ ...none, ops: { runbooks: 1, vendorReview: null, riskRegister: { day: "2026-10-07", at: "2026-10-06T16:00:00.000Z" } } })[TITLE];
  assert.equal(part.state, "partial");
  assert.ok(part.proof.includes("1 runbook in the business's vault"));
  assert.ok(part.proof.includes("Not yet: no vendor review in the last 90 days"));
});

test("opsRecords reads runbook playbooks and titled Operations plans from the vault", () => {
  tempData();
  const p = profile();
  scaffoldBusiness(p);
  assert.equal(opsRecords(p.slug), null, "an empty vault has nothing on record");
  assert.equal(opsRecords("no-such-business"), null);

  writeNote("business", p.slug, { type: "playbook", dept: "operations", title: "Runbook: site is down", body: "1. Check the status page." });
  writeNote("business", p.slug, { type: "playbook", dept: "operations", title: "Weekly rhythm", body: "Monday: review." });
  const now = new Date("2026-10-06T16:00:00Z"); // 03:00 on 7 Oct in Sydney
  savePlan(p.slug, "operations", "# Vendor review\n", now, "vendor review");
  savePlan(p.slug, "operations", "# Risk register\n", new Date("2026-06-01T00:00:00Z"), "risk register");

  const r = opsRecords(p.slug, now)!;
  assert.equal(r.runbooks, 1, "only playbooks titled Runbook count");
  assert.equal(r.vendorReview?.day, "2026-10-07", "the vault note's own (business-local) date, not the UTC one");
  assert.equal(r.riskRegister, null, "a risk register over 90 days old is not current");

  const e = workflowEvidence(p.slug, now).evidence[TITLE];
  assert.equal(e.state, "partial");
  assert.ok(e.proof.includes("Not yet: no risk register in the last 90 days"));

  const metric = hqMetrics(p.slug, now.getTime()).find((m) => m.id === "runbooks")!;
  assert.equal(metric.value, 1);
  assert.match(metric.note, /risk register none in 90 days/);
  assert.ok(metric.note.length <= 200);
});

test("save-plan --title keeps same-day documents apart in the vault", () => {
  const data = tempData();
  const p = profile();
  scaffoldBusiness(p);
  const root = path.resolve(__dirname, "..");
  const run = (...a: string[]) => spawnSync(process.execPath, ["--import", "tsx", path.join(root, "scripts", "hq.ts"), ...a], { cwd: root, encoding: "utf8", env: { ...process.env, HQ_DATA: data } });
  const file = path.join(data, "doc.md");
  fs.writeFileSync(file, "# Risk register\n");
  const a = run("save-plan", p.slug, "operations", "--title", "risk register", file);
  assert.equal(a.status, 0, a.stderr);
  fs.writeFileSync(file, "# Vendor review\n");
  const b = run("save-plan", p.slug, "operations", file, "--title", "vendor review");
  assert.equal(b.status, 0, b.stderr);
  const plans = fs.readdirSync(path.join(vaultRoot(p), "Departments", "Operations", "Plans"));
  assert.ok(plans.some((f) => / Operations risk register\.md$/.test(f)), plans.join(", "));
  assert.ok(plans.some((f) => / Operations vendor review\.md$/.test(f)), plans.join(", "));
  assert.notEqual(run("save-plan", p.slug, "operations", file, "--title").status, 0, "--title with no words is refused");
});
