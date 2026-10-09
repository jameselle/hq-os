import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { configProblem, loadEvidence, loadTestDue, reportProblem, toRun, type LoadReport, type LoadTestConfig } from "../lib/load-test";
import { listLoadRuns, readLoadConfig, recordLoadRun, writeLoadConfig } from "../lib/load-test-store";
import { buildFindings } from "../lib/ceo";
import { workflowEvidence } from "../lib/workflow-evidence";
import { hqMetrics } from "../lib/analytics";
import { WORKFLOWS } from "../lib/workflows";
import { WORKFLOW_ANALYTICS } from "../lib/analytics-metrics";
import { depts, facts, profile, tempData } from "./helpers";

const cfg: LoadTestConfig = { version: 1, targetUsers: 50, cadenceDays: 30, primary: "catalogue" };
const step = (users: number, pass: boolean, p95: number, fails: string[] = []) => ({ users, pass, rps: users / 6, fails, endpoints: { catalogue: { p95 }, search: { p95: p95 * 2 } } });
const now = new Date("2026-10-08T00:00:00Z");

test("the most customers that passed counts only steps below the first failure", () => {
  const run = toRun({ meta: { startedAt: 1791331200, commit: "a1b2c3d4" }, steps: [step(100, true, 300), step(10, true, 120), step(50, false, 2400, ["memory available fell to 310 MB"]), step(25, true, 180)] }, cfg, { now });
  assert.deepEqual(run.steps.map((s) => s.users), [10, 25, 50, 100]);
  assert.equal(run.maxPassing, 25);
  assert.deepEqual(run.firstFail, { users: 50, reason: "memory available fell to 310 MB" });
  assert.equal(run.steps[0].p95Ms, 120, "the primary endpoint is the headline");
  assert.equal(run.commit, "a1b2c3d4");
  assert.equal(run.at, "2026-10-07T00:00:00.000Z");
  const slowest = toRun({ steps: [step(10, true, 120)] }, { targetUsers: 50 }, { now });
  assert.equal(slowest.steps[0].p95Ms, 240, "without a primary, the slowest endpoint");
  assert.equal(slowest.at, now.toISOString());
});

test("reasons that identify a host, a person or a key are dropped, and a bad commit is ignored", () => {
  const run = toRun({ meta: { commit: "not a sha" }, steps: [step(10, false, 3000, [
    "upstream 10.0.0.5 refused", "mail ops@example.com", "see https://grafana.example/d/x", "key so_live_abc leaked", "event loop backed up",
  ])] }, cfg, { now, label: "before launch" });
  assert.deepEqual(run.steps[0].reasons, ["event loop backed up"]);
  assert.equal(run.commit, null);
  assert.equal(run.label, "before launch");
  assert.equal(run.maxPassing, null);
});

test("reports and configs are validated, and commands can't carry credentials", () => {
  assert.match(reportProblem({ steps: [] }) ?? "", /steps/);
  assert.match(reportProblem({ steps: [{ users: 0, pass: true }] }) ?? "", /users/);
  assert.match(reportProblem({ steps: [{ users: 10, pass: "yes" }] }) ?? "", /pass/);
  assert.equal(reportProblem({ steps: [{ users: 10, pass: true }] }), null);
  assert.equal(configProblem(cfg), null);
  assert.match(configProblem({ ...cfg, targetUsers: 0 }) ?? "", /targetUsers/);
  assert.match(configProblem({ ...cfg, commands: { run: "source .env && run.sh" } }) ?? "", /credentials/);
  assert.match(configProblem({ ...cfg, commands: { deploy: "x" } as never }) ?? "", /unknown command/);
});

test("a test is due when never run, short of the target, or past its cadence", () => {
  assert.equal(loadTestDue(cfg, [], now).due, true);
  const short = toRun({ meta: { startedAt: "2026-10-07T00:00:00Z" }, steps: [step(10, true, 100), step(50, false, 2500, ["catalogue p95 2500 ms"])] }, cfg, { now });
  const d = loadTestDue(cfg, [short], now);
  assert.equal(d.due, true);
  assert.match(d.why, /passed 10 customers at once, short of the 50 target; it failed at 50: catalogue p95 2500 ms/);
  assert.equal(d.since, short.at);
  const good = toRun({ meta: { startedAt: "2026-10-01T00:00:00Z" }, steps: [step(50, true, 400), step(100, false, 2500)] }, cfg, { now });
  assert.equal(loadTestDue(cfg, [short, good], now).due, true, "the newest run decides");
  assert.equal(loadTestDue(cfg, [good], now).due, false);
  const later = new Date("2026-11-05T00:00:00Z");
  const old = loadTestDue(cfg, [good], later);
  assert.equal(old.due, true);
  assert.equal(old.since, "2026-10-31T00:00:00.000Z");
  assert.equal(loadEvidence(cfg, [good], now).state, "live");
  assert.equal(loadEvidence(cfg, [good], later).state, "partial");
  assert.equal(loadEvidence(cfg, [short], now).state, "partial");
  assert.equal(loadEvidence(cfg, [], now).state, "partial");
});

test("recording a run keeps a private summary, mirrors the vault and feeds evidence and analytics", () => {
  const dir = tempData();
  const p = profile({ slug: "acme-co" });
  fs.mkdirSync(path.join(dir, "businesses", p.slug), { recursive: true });
  fs.writeFileSync(path.join(dir, "businesses", p.slug, "profile.json"), JSON.stringify(p));
  assert.throws(() => recordLoadRun("acme-co", "/nonexistent"), /no load test set up/);
  writeLoadConfig("acme-co", { ...cfg, commands: { run: "bash load/run.sh" } });
  assert.equal(readLoadConfig("acme-co")?.targetUsers, 50);
  const run = path.join(dir, "run-1"); fs.mkdirSync(run);
  fs.writeFileSync(path.join(run, "report.json"), JSON.stringify({ meta: { startedAt: Math.floor(Date.now() / 1000) - 3600 }, steps: [step(10, true, 100), step(50, true, 900), step(100, false, 2600, ["catalogue p95 2600 ms"])] }));
  const r = recordLoadRun("acme-co", run, { label: "launch check" });
  recordLoadRun("acme-co", path.join(run, "report.json"));
  assert.equal(listLoadRuns("acme-co").length, 1, "the same run recorded twice is kept once");
  assert.equal(r.maxPassing, 50);
  assert.equal(fs.statSync(path.join(dir, "businesses", "acme-co", "loadtest", "runs.json")).mode & 0o777, 0o600);
  const ev = workflowEvidence("acme-co").evidence["Load test before growth"];
  assert.equal(ev?.state, "live");
  const m = hqMetrics("acme-co").find((x) => x.id === "load_test_users");
  assert.equal(m?.value, 50);
});

test("the CEO files a due load test under Product & Engineering, and stays quiet otherwise", () => {
  const p = profile();
  const due = buildFindings(depts(), facts({ loadTest: { due: true, why: "No load test recorded yet; the target is 50 customers at once", target: 50 } }), p);
  const f = due.find((x) => x.id === "load-test-due");
  assert.equal(f?.dept, "engineering");
  assert.match(f?.title ?? "", /50 customers at once/);
  assert.match(f?.action ?? "", /\/hq:load-test/);
  assert.equal(buildFindings(depts(), facts({ loadTest: { due: false, why: "ok", target: 50 } }), p).some((x) => x.id === "load-test-due"), false);
  assert.equal(buildFindings(depts(), facts(), p).some((x) => x.id === "load-test-due"), false);
});

test("the workflow is in the catalogue, owned by engineering, and judged by load_test_users", () => {
  const w = WORKFLOWS.find((x) => x.title === "Load test before growth");
  assert.equal(w?.owner, "engineering");
  assert.deepEqual(WORKFLOW_ANALYTICS["Load test before growth"], ["load_test_users"]);
});

test("the template's report.json is the contract hq loadtest record reads", async () => {
  const tpl = await import("../templates/loadtest/report.mjs");
  const row = (t: number, metric: string, value: number, name: string, status = "200") => ({ metric_name: metric, timestamp: String(t), metric_value: String(value), name, status });
  const k6Rows = [row(0, "http_reqs", 1, "catalogue")];
  for (let t = 10; t < 110; t++) k6Rows.push(row(t, "http_reqs", 1, "catalogue"), row(t, "http_req_duration", 150, "catalogue"));
  for (let t = 120; t < 220; t++) k6Rows.push(row(t, "http_reqs", 1, "catalogue", t % 5 ? "200" : "503"), row(t, "http_req_duration", 2500, "catalogue"));
  const steps = tpl.summarise({ meta: { steps: "10,50", ramp: "10s", hold: "100s" }, k6Rows, primary: "catalogue" });
  const run = toRun({ meta: { startedAt: 1791331200 }, steps: steps as unknown as LoadReport["steps"] }, cfg, { now });
  assert.equal(run.maxPassing, 10);
  assert.equal(run.firstFail?.users, 50);
  assert.match(run.firstFail?.reason ?? "", /catalogue p95 2500 ms/);
  assert.equal(run.steps[0].p95Ms, 150);
});
