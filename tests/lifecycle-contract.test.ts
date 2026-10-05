import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { lifecycleState, runLifecycle, supports, validLifecycle } from "../lib/lifecycle";
import { flowOfMessage, flowPage, namingProblems } from "../lib/lifecycle-names";
import { flowStatus } from "../lib/lifecycle-status";
import { validChecks } from "../lib/workflow-checks";

const ADAPTER = path.resolve("templates/lifecycle/lifecycle-template.mjs");
const CHECKS = path.resolve("templates/lifecycle/workflow-checks-template.mjs");

function withBusiness(fn: (dir: string, biz: string) => Promise<void>) {
  return async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-lifecycle-contract-")), old = process.env.HQ_DATA;
    process.env.HQ_DATA = dir;
    const biz = path.join(dir, "businesses", "first");
    fs.mkdirSync(biz, { recursive: true });
    fs.writeFileSync(path.join(biz, "profile.json"), JSON.stringify({ slug: "first", name: "first", country: "AU", currency: "AUD", timezone: "Australia/Sydney", offer: "Example", audience: "Example", model: "services", sites: [], channels: {}, regulated: [], vault: { path: "vault" }, createdAt: "2026-01-01" }));
    try { await fn(dir, biz); } finally { if (old === undefined) delete process.env.HQ_DATA; else process.env.HQ_DATA = old; fs.rmSync(dir, { recursive: true, force: true }); }
  };
}

test("naming: flow ids, message ids and workflow titles follow one scheme", () => {
  assert.equal(flowOfMessage("onboarding-day-0", ["onboarding", "checkout"]), "onboarding");
  assert.equal(flowOfMessage("checkout", ["onboarding", "checkout"]), "checkout");
  assert.equal(flowOfMessage("habit-alerts", ["habit-invite", "habit-alerts"]), "habit-alerts");
  assert.equal(flowOfMessage("quickstart", ["onboarding"]), null);
  assert.equal(flowPage("Churn early warning"), "/workflows/churn-early-warning");
  assert.equal(flowPage("Not a workflow"), null);
  const flow = (id: string, msgs: string[], serves = "Churn early warning") => ({ id, label: id, serves, channel: "email" as const, trigger: "t", daily: [], delivery: [], skips: [], outcomes: [], messages: msgs.map((m) => ({ id: m, label: m, subject: m, html: "" })) });
  assert.deepEqual(namingProblems({ flows: [flow("churn", ["churn-quiet"])], workflows: [] }), []);
  const bad = namingProblems({ flows: [flow("checkout_recovery", ["checkout_recovery"]), flow("onboarding", ["quickstart"], "Onboarding")], workflows: [] });
  assert.ok(bad.some((p) => /flow "checkout_recovery": use lower-case words joined by hyphens, like "checkout-recovery"/.test(p)));
  assert.ok(bad.some((p) => /message "quickstart" sits in flow "onboarding" but its id must be "onboarding" or start with "onboarding-"/.test(p)));
  assert.ok(bad.some((p) => /serves "Onboarding", which is not a workflow title/.test(p)));
});

test("the template adapter keeps the whole contract, through HQ's own runner", withBusiness(async (dir, biz) => {
  const state = path.join(dir, "template-state.json");
  fs.writeFileSync(path.join(biz, "lifecycle-connection.json"), JSON.stringify({ command: [process.execPath, ADAPTER, state] }));
  const first = await runLifecycle("first", "report");
  const snap = first.snapshot!;
  assert.ok(validLifecycle(snap));
  assert.deepEqual(namingProblems(snap), [], "the template is the reference for the naming contract");
  assert.deepEqual(snap.supports, ["pause", "resume", "approve", "reject", "test", "mode"]);
  assert.ok(snap.flows!.every((f) => f.since && f.messages.length && f.messages.every((m) => m.html.includes("Unsubscribe"))));
  assert.doesNotMatch(JSON.stringify(snap), /@|[–—]/, "no email addresses and no em or en dashes");
  const withDrafts = snap.workflows.find((w) => (w.drafts ?? 0) > 0)!;
  assert.ok(withDrafts, "the synthetic data has drafts to approve");
  assert.ok(withDrafts.expiresAt && Date.parse(withDrafts.expiresAt) > Date.now(), "waiting drafts say when they expire");
  // Approve exactly what was seen.
  const after = await runLifecycle("first", "approve", { workflow: withDrafts.id, before: snap.observedAt! });
  assert.equal(after.snapshot!.workflows.find((w) => w.id === withDrafts.id)!.drafts, 0);
  // Mode, test, pause and resume.
  assert.equal((await runLifecycle("first", "mode", { workflow: "checkout", mode: "auto" })).snapshot!.flows!.find((f) => f.id === "checkout")!.mode, "auto");
  const sentBefore = (await runLifecycle("first", "report")).snapshot!.flows!.find((f) => f.id === "checkout")!.delivery.find((d) => d.label === "sent")!.count;
  const tested = await runLifecycle("first", "test", { workflow: "checkout" });
  assert.equal(tested.snapshot!.flows!.find((f) => f.id === "checkout")!.delivery.find((d) => d.label === "sent")!.count, sentBefore, "owner tests never count as sends");
  assert.equal((await runLifecycle("first", "pause")).snapshot!.paused, true);
  assert.ok((await runLifecycle("first", "resume")).snapshot!.flows!.every((f) => f.mode === "draft"), "resume never jumps to auto");
  // A bad request fails without touching the snapshot.
  await assert.rejects(runLifecycle("first", "mode", { workflow: "nope", mode: "auto" }));
  assert.ok(lifecycleState("first").snapshot!.flows!.every((f) => f.mode === "draft"));
  // And the status reads in plain words.
  const s = flowStatus(snap.flows![0], snap.workflows, { now: Date.now(), tz: "UTC" });
  assert.ok(s.working.headline && s.waiting.headline && s.next.headline);
}));

test("reject: the drafts the owner saw are never sent, and the skip list says why", withBusiness(async (dir, biz) => {
  fs.writeFileSync(path.join(biz, "lifecycle-connection.json"), JSON.stringify({ command: [process.execPath, ADAPTER, path.join(dir, "state.json")] }));
  const snap = (await runLifecycle("first", "report")).snapshot!;
  const w = snap.workflows.find((x) => (x.drafts ?? 0) > 0)!;
  const flow = snap.flows!.find((f) => f.messages.some((m) => m.id === w.id))!;
  const sent = (s: typeof snap) => s.flows!.find((f) => f.id === flow.id)!.delivery.find((d) => d.label === "sent")!.count;
  await assert.rejects(runLifecycle("first", "reject", { workflow: w.id }), /Reject what you saw/);
  const after = (await runLifecycle("first", "reject", { workflow: w.id, before: snap.observedAt! })).snapshot!;
  assert.equal(after.workflows.find((x) => x.id === w.id)!.drafts, 0);
  assert.equal(sent(after), sent(snap), "rejecting sends nothing");
  assert.ok(after.flows!.find((f) => f.id === flow.id)!.skips.some((r) => r.label === "owner said no" && r.count === w.drafts));
}));

test("supports: reject must be listed; older adapters that list nothing don't get it", () => {
  assert.equal(supports(null, "reject"), false);
  assert.equal(supports({ supports: undefined }, "reject"), false);
  assert.equal(supports({ supports: ["approve", "reject"] }, "reject"), true);
  assert.equal(supports(null, "approve"), true);
});

test("supports: HQ refuses a write the adapter doesn't accept, before running it", withBusiness(async (_dir, biz) => {
  const echo = `let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>console.log(JSON.stringify({version:1,observedAt:new Date().toISOString(),paused:false,collectionFailed:false,stages:[],delivery:[],history:[],accounts:[],workflows:[{id:'w',label:'W',delayHours:0,enabled:true,audience:i}],supports:['pause','resume']})))`;
  fs.writeFileSync(path.join(biz, "lifecycle-connection.json"), JSON.stringify({ command: [process.execPath, "-e", echo] }));
  assert.equal(supports(null, "approve"), true, "no snapshot yet: older adapters accept everything");
  await runLifecycle("first", "report");
  assert.equal(supports(lifecycleState("first").snapshot, "approve"), false);
  await assert.rejects(runLifecycle("first", "approve", { workflow: "w", before: new Date().toISOString() }), /does not support approve/);
  await assert.rejects(runLifecycle("first", "test", { workflow: "w" }), /does not support test/);
  assert.ok(await runLifecycle("first", "pause"));
  assert.equal(validLifecycle({ ...lifecycleState("first").snapshot!, supports: ["launch"] }), false);
}));

test("the workflow-checks template answers pass or fail per check, in HQ's shape", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/pricing/") res.end("<h2>Frequently asked</h2>");
    else if (req.url === "/sitemap.xml") res.end("/guides/a/ /guides/b/ /guides/c/");
    else { res.statusCode = 404; res.end(); }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-checks-"));
  try {
    const cfg = path.join(dir, "checks.json");
    fs.writeFileSync(cfg, JSON.stringify({ site: `http://127.0.0.1:${port}`, workflows: [{ title: "Search demand becomes pages at scale", checks: [
      { label: "Pricing answers questions", path: "/pricing/", contains: ["Frequently asked"] },
      { label: "Sitemap lists guides", path: "/sitemap.xml", count: "/guides/[a-z]+/", atLeast: 5 },
      { label: "Missing page", path: "/gone/", contains: ["x"] },
    ] }] }));
    // Async: a sync child would block this process's own test server.
    const { execFile } = await import("node:child_process");
    const out = JSON.parse(await new Promise<string>((ok, no) => execFile(process.execPath, [CHECKS, cfg], { encoding: "utf8" }, (e, so) => (e ? no(e) : ok(so)))));
    assert.ok(validChecks(out));
    assert.deepEqual(out.workflows[0].checks.map((c: { ok: boolean }) => c.ok), [true, false, false]);
    assert.equal(out.workflows[0].checks[1].detail, "3 found, need 5");
    assert.equal(out.workflows[0].checks[2].detail, "/gone/ did not load");
  } finally { server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
