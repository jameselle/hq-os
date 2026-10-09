import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import type { SignalFeedItem } from "../lib/brain";
import { initBrain, signalFeed, writeNote } from "../lib/brain-store";
import { listExperiments } from "../lib/experiments";
import { routePlaybooks, type Weakest } from "../lib/levers";
import { COOLDOWN_DAYS, PLAYBOOKS, TRIGGERS, duePlaybooks, judge, playbookByTitle } from "../lib/playbooks";
import { checkRun, executeRun, runArgs } from "../lib/playbook-runner";
import { applyRun, dropRun, getRun, listRuns, queueRun, readConfig, reviewExperiments, writeConfig } from "../lib/playbook-store";
import { contentDrafts, dataDrafts, engineeringDrafts, shippedProblem } from "../lib/signal-writers";
import { getProfile, scaffoldBusiness, vaultRoot } from "../lib/store";
import { WORKFLOWS } from "../lib/workflows";
import { profile, tempData } from "./helpers";

const NOW = new Date("2026-10-07T00:00:00Z");
const note = (o: Partial<SignalFeedItem>): SignalFeedItem => ({ rel: "Signals/x.md", from: "competitors", to: ["content"], title: "t", created: "2026-10-06", status: "active", evidence: [], body: "", ...o });
const due = (o: Partial<Parameters<typeof duePlaybooks>[0]> = {}) => duePlaybooks({ newSignals: [], lastRun: {}, routed: [], alarms: [], skip: [], now: NOW, ...o });

test("every workflow has a trigger, and every trigger names a real workflow", () => {
  const titles = WORKFLOWS.map((w) => w.title);
  for (const t of titles) assert.ok(TRIGGERS[t]?.length, `no trigger for ${t}`);
  for (const t of Object.keys(TRIGGERS)) assert.ok(titles.includes(t), `trigger for unknown workflow ${t}`);
  assert.equal(PLAYBOOKS.length, WORKFLOWS.length);
});

test("anything that reaches customers carries a Legal step; owner-only playbooks never run alone", () => {
  for (const p of PLAYBOOKS) if (p.customerFacing) assert.ok(p.steps.some(([d]) => d === "legal"), `${p.title} reaches customers without Legal`);
  const added = PLAYBOOKS.find((p) => p.addedGuard)!;
  assert.ok(added, "at least one playbook gets Legal added by HQ");
  assert.equal(added.steps.length, WORKFLOWS.find((w) => w.title === added.title)!.steps.length + 1);
  for (const t of ["Monthly to annual", "Price increase without churn", "Self post"]) assert.equal(playbookByTitle(t)!.runnable, false, t);
  assert.ok(!PLAYBOOKS.some((p) => p.triggers.some((t) => t.kind === "engine") && p.runnable), "an engine playbook is never also queued");
});

test("signals start the playbooks they're about, once per cooldown, never for skipped ones", () => {
  const price = note({ rel: "a", title: "Rival raised its price 20%", to: ["content", "seo"] });
  const hits = due({ newSignals: [price] }).map((d) => d.playbook.title);
  assert.ok(hits.includes("Competitor gap becomes comparison content"));
  assert.ok(!hits.includes("Customer proof"), "a competitor signal doesn't start a support playbook");
  const slug = playbookByTitle("Competitor gap becomes comparison content")!.slug;
  assert.ok(!due({ newSignals: [price], lastRun: { [slug]: "2026-10-04T00:00:00Z" } }).some((d) => d.playbook.slug === slug), "inside the cooldown");
  assert.ok(!due({ newSignals: [price], skip: ["Competitor gap becomes comparison content"] }).some((d) => d.playbook.slug === slug));
  assert.ok(!due({ newSignals: [{ ...price, status: "replaced" }] }).some((d) => d.playbook.slug === slug), "replaced notes don't count");
  assert.ok(!due({ newSignals: [{ ...price, to: ["finance"] }] }).some((d) => d.playbook.slug === slug), "addressed to nobody in the playbook");
});

test("schedules fall due after their period; routing and alarms reach runnable playbooks", () => {
  const monthly = playbookByTitle("Unit economics check")!;
  assert.ok(due().some((d) => d.playbook.slug === monthly.slug && d.reason.kind === "schedule"), "never run: due");
  const recent = new Date(NOW.getTime() - (COOLDOWN_DAYS.month - 1) * 864e5).toISOString();
  assert.ok(!due({ lastRun: { [monthly.slug]: recent } }).some((d) => d.playbook.slug === monthly.slug));
  const churn = playbookByTitle("Churn early warning")!;
  const r = due({ routed: [{ slug: churn.slug, why: "its route" }] }).find((d) => d.playbook.slug === churn.slug);
  assert.deepEqual(r?.reason, { kind: "route", why: "its route" });
  const both = due({ routed: [{ slug: churn.slug, why: "its route" }], newSignals: [note({ from: "data", to: ["email"], title: "At-risk customers", body: "churn up" })] }).find((d) => d.playbook.slug === churn.slug);
  assert.equal(both?.reason.kind, "route", "routing's reason wins over a signal's");
  assert.ok(!due({ newSignals: [note({ from: "competitors", to: ["engineering"], title: "Rival ran a sports promo" })] }).some((d) => d.playbook.title === "New market or category"), "mentioning a sport isn't a new market");
  assert.ok(!due({ routed: [{ slug: playbookByTitle("Monthly to annual")!.slug, why: "x" }] }).some((d) => d.playbook.title === "Monthly to annual"), "routing never starts an owner-only playbook");
  const up = due({ alarms: [{ workflow: "Data freshness and uptime", metric: "incidents", value: 2 }] }).find((d) => d.playbook.title === "Data freshness and uptime");
  assert.equal(up?.reason.kind, "alarm");
});

test("routing hands out up to three playbooks for the weakest lever and rests ones that lost", () => {
  const weakest: Weakest = { lever: "keep", metric: "paying_churn_rate", label: "Paying churn", unit: "rate", value: 0.11, baseline: 0.08, workflow: "Churn early warning", owner: "email", why: "above the line" };
  const picks = routePlaybooks(weakest, { now: NOW });
  assert.equal(picks[0].workflow, "Churn early warning");
  assert.ok(picks[0].contributors.length > 0 && !picks[0].contributors.includes(picks[0].owner));
  assert.ok(picks.length <= 3 && picks.every((p) => playbookByTitle(p.workflow)!.levers.includes("keep")));
  assert.ok(picks.some((p) => p.workflow === "Cancel flow with saves"), "shares the churn number");
  const rested = routePlaybooks(weakest, { now: NOW, tried: [{ workflow: "Churn early warning", status: "lost", endedAt: "2026-09-20T00:00:00Z" }] });
  assert.ok(!rested.some((p) => p.workflow === "Churn early warning"), "lost 17 days ago: resting");
  const later = routePlaybooks(weakest, { now: NOW, tried: [{ workflow: "Churn early warning", status: "lost", endedAt: "2026-06-01T00:00:00Z" }] });
  assert.equal(later[0].workflow, "Churn early warning", "rest is over");
  assert.ok(!routePlaybooks(weakest, { now: NOW, tried: [{ workflow: "Churn early warning", status: "running", endedAt: null }] }).some((p) => p.workflow === "Churn early warning"), "already being tried");
  assert.deepEqual(routePlaybooks(null), []);
});

test("verdicts follow each number's good direction", () => {
  assert.equal(judge("paying_churn_rate", 0.1, 0.08).verdict, "won", "churn down is good");
  assert.equal(judge("paying_churn_rate", 0.1, 0.12).verdict, "lost");
  assert.equal(judge("new_signups", 30, 31).verdict, "inconclusive");
  assert.equal(judge("new_signups", 30, null).verdict, "inconclusive");
  assert.equal(judge("new_signups", 0, 4).verdict, "won");
});

test("automatic signals are drafted only from measured numbers, with honest wording", () => {
  const m = (id: string, value: number | null, change: number | null = null, better: "up" | "down" = "up", unit = "count") =>
    ({ id, value, change, status: value === null ? "missing" : "measured", def: { label: id, unit, better } }) as never;
  const drafts = dataDrafts({ week: "2026-W41", currency: "AUD", observedAt: null, missing: 2,
    metrics: [m("new_signups", 30, -5), m("paying_churn_rate", 0.11, 0.02, "down", "rate"), m("cost_to_win", null)],
    weakest: { label: "Paying churn", why: "above the line", workflow: "Churn early warning" } });
  const ceo = drafts.find((d) => d.to.includes("ceo"))!;
  assert.equal(ceo.title, "Weekly growth scorecard 2026-W41");
  assert.match(ceo.body, /new_signups: 30 \(-5 on last week, the wrong way\)/);
  assert.match(ceo.body, /\+2\.0 pts on last week, the wrong way/);
  assert.match(ceo.body, /Weakest lever: Paying churn/);
  assert.ok(!drafts.some((d) => d.to.includes("ads")), "cost to win isn't measured, so no Paid Ads signal");

  const posts = [{ id: "1", at: "2026-10-05T00:00:00Z", type: "REELS", views: 900, url: "https://x/1", caption: "Hook line\nmore" }, { id: "2", at: "2026-10-05T00:00:00Z", type: "FEED", views: 100 }];
  const c = contentDrafts({ week: "2026-W41", posts, viewsPerPost: 400, handle: "acme", now: NOW });
  assert.equal(c.length, 1);
  assert.match(c[0].body, /900 views \(https:\/\/x\/1\)\. Opens: "Hook line"/);
  assert.ok(!c[0].body.includes("100 views"));
  assert.deepEqual(contentDrafts({ week: "w", posts, viewsPerPost: null, handle: "a", now: NOW }), []);

  assert.equal(shippedProblem({ shipped: [{ title: "x", at: "2026-10-01T00:00:00Z", url: "http://insecure" }] }), "urls must be https");
  assert.equal(shippedProblem({ nope: 1 }), "expected { shipped: [...] }");
  assert.equal(shippedProblem({ shipped: [{ title: "Faster board", at: "2026-10-01T00:00:00Z", area: "Web" }] }), null);
  const e = engineeringDrafts({ week: "2026-W41", shipped: [{ title: "Faster board", at: "2026-10-02T00:00:00Z", area: "Web" }, { title: "Fix login", at: "2026-10-03T00:00:00Z", area: "App" }] });
  assert.deepEqual(e[0].to, ["content", "support"]);
  assert.match(e[0].body, /\*\*App\*\* \(1\)\n- Fix login/);
  assert.deepEqual(engineeringDrafts({ week: "w", shipped: [] }), []);
});

test("HQ's checks on a run: sections, Legal for customer-facing work, result, no dashes in drafts", () => {
  const plan = "# P\n\n## Steps\n\n## Legal check\n\n## The owner's call\n\n## How we'll know\n";
  const result = { summary: "s", hypothesis: "h", ownerActions: ["a"], deliverables: [{ title: "Email", file: "draft-1-email.md" }] };
  assert.deepEqual(checkRun({ plan, result, customerFacing: true, drafts: { "draft-1-email.md": "Hi, there" } }).problems, []);
  assert.match(checkRun({ plan: plan.replace("## Legal check\n", ""), result, customerFacing: true, drafts: { "draft-1-email.md": "x" } }).problems.join(), /Legal check/);
  assert.match(checkRun({ plan, result, customerFacing: false, drafts: { "draft-1-email.md": "a — b" } }).problems.join(), /dash/);
  assert.match(checkRun({ plan, result, customerFacing: false, drafts: {} }).problems.join(), /isn't in the run folder/);
  assert.match(checkRun({ plan: null, result: null, customerFacing: false, drafts: {} }).problems.join(), /no plan\.md.*no result\.json/);
  const long = checkRun({ plan, result: { ...result, hypothesis: "word ".repeat(100) }, customerFacing: true, drafts: { "draft-1-email.md": "x" } }).result!;
  assert.ok(long.hypothesis.length <= 300 && long.hypothesis.endsWith("word…"), "cut at a word, with an ellipsis");
});

test("the headless run can't use the owner's settings, the shell, or read outside its folders", () => {
  const a = runArgs("p", "/d/run", "/d/vault", "/d/skill");
  assert.deepEqual(a.slice(a.indexOf("--setting-sources"), a.indexOf("--setting-sources") + 2), ["--setting-sources", "project"]);
  assert.ok(a.includes("--strict-mcp-config"));
  assert.ok(a.slice(a.indexOf("--disallowedTools")).includes("Bash") && a.slice(a.indexOf("--disallowedTools")).includes("Grep"));
  const allowed = a.slice(a.indexOf("--allowedTools") + 1, a.indexOf("--disallowedTools"));
  assert.ok(!allowed.includes("Read") && !allowed.includes("Write") && !allowed.includes("Bash"), "no unscoped read, write or shell");
  assert.ok(allowed.filter((t) => t.startsWith("Write(")).every((t) => t === "Write(//d/run/**)"));
});

test("a run end to end: queue, do it headless, apply (opens an experiment), judge two weeks later, lesson filed", async () => {
  tempData();
  const p = profile({ model: "subscription" });
  scaffoldBusiness(p);
  initBrain();
  assert.equal(readConfig(p.slug).mode, "off", "off until the owner opts in");
  writeConfig(p.slug, { mode: "ask", skip: ["Monthly to annual"] });
  assert.throws(() => writeConfig(p.slug, { mode: "loud" as never }), /off, ask or auto/);
  writeConfig(p.slug, { rules: ["Never suggest switching to yearly billing."] });
  assert.throws(() => writeConfig(p.slug, { rules: [""] }), /rules must be/);

  const churn = playbookByTitle("Churn early warning")!;
  const run = queueRun(p.slug, churn, { kind: "route", why: "its route for paying churn" }, NOW)!;
  assert.equal(run.status, "queued");
  assert.equal(queueRun(p.slug, churn, { kind: "owner" }, NOW), null, "one run per playbook per day");

  // A fake writer that does what the skill says.
  const writer = async (_bin: string, args: string[], cwd: string) => {
    assert.ok(args.includes("--strict-mcp-config"));
    const inputs = JSON.parse(fs.readFileSync(path.join(cwd, "inputs.json"), "utf8"));
    assert.equal(inputs.playbook.title, "Churn early warning");
    assert.deepEqual(inputs.houseRules, ["Never suggest switching to yearly billing."], "house rules reach every run");
    fs.writeFileSync(path.join(cwd, "plan.md"), "# Churn early warning\n\n## Steps\n\n## Legal check\n\n## The owner's call\n\n## How we'll know\n");
    fs.writeFileSync(path.join(cwd, "draft-1-email.md"), "We miss you, here's what changed.");
    fs.writeFileSync(path.join(cwd, "result.json"), JSON.stringify({ summary: "Email members whose usage dropped.", hypothesis: "If we email quiet members, churn falls.", ownerActions: ["Approve draft-1"], deliverables: [{ title: "Email", file: "draft-1-email.md" }] }));
    return { code: 0, stdout: JSON.stringify({ total_cost_usd: 0.42, is_error: false, result: "done" }) };
  };
  const ready = await executeRun(p.slug, run.id, { claude: "/bin/true", runWriter: writer, now: () => NOW });
  assert.equal(ready.status, "ready", ready.why);
  assert.equal(ready.costUsd, 0.42);
  const vaultPlan = path.join(vaultRoot(getProfile(p.slug)!), "Departments", "Email & Lifecycle", "Playbook runs", run.id, "plan.md");
  assert.ok(fs.existsSync(vaultPlan), "plan mirrored to the owner's department in the vault");

  await assert.rejects(() => executeRun(p.slug, run.id, { claude: "/bin/true", runWriter: writer, now: () => NOW }), /--again/);
  const redone = await executeRun(p.slug, run.id, { claude: "/bin/true", runWriter: writer, now: () => NOW, again: true });
  assert.equal(redone.status, "ready", "a ready run can be redone with again");
  assert.throws(() => dropRun(p.slug, "nope"), /no run/);
  const applied = applyRun(p.slug, run.id, { now: NOW, baseline: 0.11 });
  assert.equal(applied.status, "applied");
  const x = listExperiments(p.slug).find((e) => e.id === applied.experiment)!;
  assert.equal(x.workflow, "Churn early warning");
  assert.equal(x.metric, "paying_churn_rate");
  assert.equal(x.baseline, 0.11);
  assert.throws(() => dropRun(p.slug, run.id), /can't be dropped/);

  assert.deepEqual(reviewExperiments(p.slug, new Date(NOW.getTime() + 5 * 864e5), () => 0.08), [], "not due yet");
  const [closed] = reviewExperiments(p.slug, new Date(NOW.getTime() + 15 * 864e5), () => 0.08);
  assert.equal(closed.status, "won");
  assert.equal(getRun(p.slug, run.id).verdict, "won");
  const lessons = fs.readdirSync(path.join(vaultRoot(getProfile(p.slug)!), "Lessons"));
  assert.ok(lessons.some((f) => f.includes("Churn early warning")), "lesson filed in the brain");

  // A failed check keeps the files and says why.
  const second = queueRun(p.slug, playbookByTitle("Customer proof")!, { kind: "owner" }, NOW)!;
  const sloppy = async (_b: string, _a: string[], cwd: string) => { fs.writeFileSync(path.join(cwd, "plan.md"), "# x\n## Steps\n"); return { code: 0, stdout: "{}" }; };
  const failed = await executeRun(p.slug, second.id, { claude: "/bin/true", runWriter: sloppy, now: () => NOW });
  assert.equal(failed.status, "failed");
  assert.match(failed.why!, /Legal check/);
  assert.equal(listRuns(p.slug).length, 2);

  // The signal feed reaches the playbooks through the tick's due check.
  writeNote("business", p.slug, { type: "signal", dept: "support", to: ["content"], title: "A member loved the new board", body: "Great result this week.", evidence: [] });
  const fresh = signalFeed(p.slug);
  assert.ok(duePlaybooks({ newSignals: fresh, lastRun: {}, routed: [], alarms: [], skip: [], now: NOW }).some((d) => d.playbook.title === "Customer proof"));
});

test("the tick: off queues nothing but still routes; ask queues up to the backlog; --all skips businesses never set up", async () => {
  tempData();
  const p = profile({ slug: "tick-co", name: "Tick Co" });
  scaffoldBusiness(p);
  scaffoldBusiness(profile({ slug: "untouched-co", name: "Untouched Co" }));
  initBrain();
  const { playbookTick, tickAll } = await import("../lib/playbook-tick");
  const { readRouting } = await import("../lib/playbook-store");
  writeConfig(p.slug, { mode: "off" });
  const off = await playbookTick(p.slug, { now: NOW });
  assert.equal(off.error, undefined);
  assert.deepEqual(off.queued, []);
  assert.ok(readRouting(p.slug), "routing is saved even when off");
  writeConfig(p.slug, { mode: "ask", backlog: 3 });
  const ask = await playbookTick(p.slug, { now: NOW });
  assert.equal(ask.queued.length, 3, "schedules are all due on day one, but the backlog caps the queue");
  assert.ok(listRuns(p.slug).every((r) => r.status === "queued"), "ask mode never runs anything itself");
  const again = await playbookTick(p.slug, { now: NOW });
  assert.deepEqual(again.queued, [], "the backlog is full");
  const { saveRun } = await import("../lib/playbook-store");
  const [first] = listRuns(p.slug);
  saveRun(p.slug, { ...first, status: "running" });
  assert.deepEqual((await playbookTick(p.slug, { now: NOW })).queued, [], "a run being done still counts toward the backlog");
  assert.deepEqual((await tickAll("all", { now: NOW, dryRun: true })).map((t) => t.slug), [p.slug]);
});
