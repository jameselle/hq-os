import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { evidenceFrom, workflowEvidence, type EvidenceFacts } from "../lib/workflow-evidence";
import { WORKFLOWS } from "../lib/workflows";
import { profile, tempData } from "./helpers";

const none: EvidenceFacts = { demo: false, sites: [], posts: [], studioJobs: { count: 0 }, reviews: { count: 0 }, plans: 0, scorecardWeeks: [], lifecycle: null };
const post = (over: Record<string, unknown> = {}) => ({ at: "2026-10-01T00:00:00.000Z", platform: "instagram", via: "composio", status: "published" as const, url: "https://example.com/p/1", caption: "Comment SAVE and I'll send it", ...over });
const everything: EvidenceFacts = {
  ...none, sites: ["https://tools.example/"], posts: [post()], studioJobs: { count: 2 }, reviews: { count: 3, last: "2026-10-02T00:00:00.000Z" }, plans: 1,
  scorecardWeeks: ["2026-W39"], lifecycle: { connected: true, readOnly: false, observedAt: "2026-10-02T00:00:00.000Z", enabled: 2, stages: 4 },
};

test("every workflow the evidence can mark exists in the catalogue", () => {
  const titles = new Set(WORKFLOWS.map((w) => w.title));
  for (const t of Object.keys(evidenceFrom(everything))) assert.ok(titles.has(t), `unknown workflow title: ${t}`);
  assert.equal(Object.keys(evidenceFrom(everything)).length, 7);
});

test("no records means nothing is marked", () => {
  assert.deepEqual(evidenceFrom(none), {});
});

test("only read-back published posts count, and a keyword ask is only part of its funnel", () => {
  const e = evidenceFrom({ ...none, posts: [post(), post({ status: "scheduled", url: undefined }), post({ status: "failed" }), post({ platform: "tiktok", caption: "Link in bio" })] });
  assert.equal(e["Self post"].state, "live");
  assert.match(e["Self post"].proof[0], /^2 posts published on Instagram and TikTok$/);
  assert.equal(e["Comment-keyword funnel"].state, "partial");
  assert.match(e["Comment-keyword funnel"].proof[0], /1 post asks for a comment keyword \(SAVE\)/);
  assert.equal(e["Free tool as a lead magnet"], undefined, "no site, no lead-magnet claim");
});

test("a lowercase 'comment' in passing is not a keyword ask", () => {
  const e = evidenceFrom({ ...none, posts: [post({ caption: "comment below what you think" })] });
  assert.equal(e["Comment-keyword funnel"], undefined);
});

test("lifecycle: watching is partial; a switch that's on is not proof without deliveries", () => {
  const ro = evidenceFrom({ ...none, lifecycle: { ...everything.lifecycle!, readOnly: true } });
  assert.equal(ro["Onboarding to first value"].state, "partial");
  assert.equal(ro["Churn early warning"].state, "partial");
  // Enabled messages with no per-workflow delivery record used to read as live. They aren't.
  const on = evidenceFrom(everything);
  assert.equal(on["Onboarding to first value"].state, "partial");
  assert.match(on["Onboarding to first value"].proof[1], /No delivery record per workflow yet/);
});

test("lifecycle: a workflow is live only when its own messages were delivered", () => {
  const lifecycle = (workflows: NonNullable<EvidenceFacts["lifecycle"]>["workflows"]) => ({ ...everything.lifecycle!, workflows });
  const drafted = evidenceFrom({ ...none, lifecycle: lifecycle([
    { label: "Day 0", enabled: true, serves: "Onboarding to first value", sent30d: 0, drafts: 4 },
  ]) });
  assert.equal(drafted["Onboarding to first value"].state, "partial");
  assert.match(drafted["Onboarding to first value"].proof[1], /4 drafts waiting for the owner's yes; nothing delivered yet/);
  assert.equal(drafted["Churn early warning"].state, "partial", "churn has no messages of its own, so it stays watch-only");

  const sent = evidenceFrom({ ...none, lifecycle: lifecycle([
    { label: "Day 0", enabled: true, serves: "Onboarding to first value", sent30d: 3, lastSentAt: "2026-10-05T01:00:00.000Z", drafts: 1 },
    { label: "Day 1", enabled: true, serves: "Onboarding to first value", sent30d: 2, lastSentAt: "2026-10-06T01:00:00.000Z" },
    { label: "Check-in", enabled: true, serves: "Churn early warning", sent30d: 0 },
  ]) });
  const o = sent["Onboarding to first value"];
  assert.equal(o.state, "live");
  assert.equal(o.proof[0], "5 messages delivered in the last 30 days by Day 0 and Day 1");
  assert.match(o.proof[2], /1 draft waiting/);
  assert.equal(o.last, "2026-10-06T01:00:00.000Z");
  assert.equal(sent["Churn early warning"].state, "partial");
  assert.equal(sent["Churn early warning"].proof[1], "Switched on; nothing delivered in the last 30 days");
});

test("a scorecard nobody reviewed is only partly a weekly review", () => {
  assert.equal(evidenceFrom({ ...none, scorecardWeeks: ["2026-W39"] })["Weekly growth review"].state, "partial");
  assert.equal(evidenceFrom(everything)["Weekly growth review"].state, "live");
});

test("workflowEvidence reads the business's own records from HQ_DATA", () => {
  const data = tempData();
  const p = profile();
  const dir = path.join(data, "businesses", p.slug);
  fs.mkdirSync(path.join(dir, "reviews"), { recursive: true });
  fs.writeFileSync(path.join(dir, "profile.json"), JSON.stringify(p));
  fs.writeFileSync(path.join(dir, "published.jsonl"), JSON.stringify(post()) + "\nnot json\n");
  fs.writeFileSync(path.join(dir, "reviews", "2026-10-02-0900.md"), "# Review\n");
  fs.mkdirSync(path.join(dir, "studio", "job-a"), { recursive: true });
  fs.writeFileSync(path.join(dir, "studio", "job-a", "a-vertical.mp4"), "");
  fs.mkdirSync(path.join(dir, "studio", "job-b"), { recursive: true });
  fs.writeFileSync(path.join(dir, "studio", "job-b", "master.mp4"), "");

  const { evidence } = workflowEvidence(p.slug);
  assert.equal(evidence["Self post"].state, "live");
  assert.deepEqual(evidence["Self post"].proof, ["1 post published on Instagram", "1 video edited in HQ Studio"]);
  assert.equal(evidence["Knowledge base and decisions"].proof[0], "1 CEO review saved to the business's vault");
  assert.equal(evidence["Free tool as a lead magnet"].state, "partial");
  assert.equal(evidence["Free tool as a lead magnet"].proof[0], "A free tool behind the keyword, listed on acme.example");
  assert.deepEqual(workflowEvidence("no-such-business"), { demo: false, evidence: {} });
});

test("every workflow metricId is a scorecard metric", async () => {
  const { METRICS } = await import("../lib/scorecard-metrics");
  for (const w of WORKFLOWS) if (w.metricId) assert.ok(w.metricId in METRICS, `${w.title}: ${w.metricId}`);
});

test("lifecycle: a workflow no message serves says so, instead of claiming missing delivery records", () => {
  const e = evidenceFrom({ ...none, lifecycle: { ...everything.lifecycle!, workflows: [{ label: "Day 0", enabled: true, serves: "Onboarding to first value", sent30d: 2 }] } });
  assert.equal(e["Churn early warning"].state, "partial");
  assert.equal(e["Churn early warning"].proof[1], "Watched only: no message serves this workflow yet");
});
