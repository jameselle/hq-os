// The weekly competitor brief: the checks, the writer's narrow allowlist, the failed-run finding, and the tick end
// to end against a fake watcher and a fake writer in a temp HQ_DATA (no network, no Claude, no launchd).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { briefDue, briefRunFinding, weekStart, checkBrief, coverageSection, fixDashes, parseLogEntries, parseSignals, writerArgs, writerPrompt, type WriterPaths } from "../lib/competitor-brief";
import { lastBriefRun, readRuns, tick, tickBusiness, type ApiWatch, type RunWriter, type TickDeps, type Watcher } from "../lib/competitor-tick";
import { receiversFrom } from "../lib/brain";
import { buildFindings } from "../lib/ceo";
import { businessDir, doneFindings, latestPlan, scaffoldBusiness, vaultRoot } from "../lib/store";
import { depts, facts, profile, tempData } from "./helpers";

const NOW = new Date("2026-10-12T07:00:00+11:00");
const DAY = 864e5;

const GOOD = [
  "**Headline:** Rival One raised its top plan price.",
  "",
  "## What changed",
  "- **Rival One:** the pricing page now lists the top plan at a higher price ([pricing](https://rival-one.example/pricing)), seen 2026-10-10.",
  "",
  "## What it means → who acts",
  "- **SEO:** a comparison page on price is now stronger. → `/hq:dept seo`",
  "",
  "## Watching",
  "- Rival Two's homepage blocks automated visitors.",
].join("\n");

test("a brief is due when there's none, or none yet this week", () => {
  const SYD = "Australia/Sydney";
  assert.equal(briefDue(null, NOW, SYD), true);
  assert.equal(briefDue("not a date", NOW, SYD), true);
  assert.equal(weekStart(NOW, SYD), "2026-10-12");
});

test("a brief on Tuesday doesn't block the next Monday's run", () => {
  const SYD = "Australia/Sydney";
  const tuesday = "2026-10-06T05:44:54.190Z"; // 16:44 Tuesday in Sydney
  assert.equal(briefDue(tuesday, new Date("2026-10-12T07:00:00+11:00"), SYD), true);
  assert.equal(briefDue(tuesday, new Date("2026-10-11T23:00:00+11:00"), SYD), false, "same week until Sunday night");
});

test("a brief on Monday blocks a second run that week", () => {
  const SYD = "Australia/Sydney";
  const monday = new Date("2026-10-12T07:05:00+11:00").toISOString();
  assert.equal(briefDue(monday, new Date("2026-10-12T09:00:00+11:00"), SYD), false);
  assert.equal(briefDue(monday, new Date("2026-10-18T23:59:00+11:00"), SYD), false);
  assert.equal(briefDue(monday, new Date("2026-10-19T07:00:00+11:00"), SYD), true);
});

test("the week turns at Monday 00:00 in the business's timezone, not UTC", () => {
  const SYD = "Australia/Sydney";
  // Sunday 23:30 Sydney is Sunday 12:30 UTC; Monday 00:30 Sydney is still Sunday 13:30 UTC.
  const sundayLate = new Date("2026-10-11T23:30:00+11:00").toISOString();
  const mondayEarly = new Date("2026-10-12T00:30:00+11:00").toISOString();
  assert.equal(briefDue(sundayLate, new Date("2026-10-12T00:30:00+11:00"), SYD), true, "Sunday's brief is last week in Sydney");
  assert.equal(briefDue(mondayEarly, new Date("2026-10-12T07:00:00+11:00"), SYD), false, "00:30 Monday counts for this week");
  assert.equal(weekStart(new Date("2026-10-11T13:30:00Z"), SYD), "2026-10-12");
  assert.equal(weekStart(new Date("2026-10-11T13:30:00Z"), "UTC"), "2026-10-05");
  // In UTC the same two briefs fall in the same week, so the timezone is what decides.
  assert.equal(briefDue(sundayLate, new Date(mondayEarly), "UTC"), false);
});

test("dashes come out: ranges become hyphens, asides become commas", () => {
  assert.equal(fixDashes("Plans 10–20 a month — up from last week"), "Plans 10-20 a month, up from last week");
  assert.equal(fixDashes("a—b"), "a-b");
});

test("a well made brief passes, and HQ fixes its dashes rather than failing it", () => {
  const ok = checkBrief(GOOD, { changed: 1 });
  assert.deepEqual(ok.problems, []);
  const dashed = checkBrief(GOOD.replace("raised its top plan price", "raised its price — again"), { changed: 1 });
  assert.deepEqual(dashed.problems, []);
  assert.equal(dashed.fixedDashes, true);
  assert.doesNotMatch(dashed.markdown, /[—–]/);
});

test("a short no-change brief passes", () => {
  const none = "**Headline:** No competitor changes this week.\n\n## What changed\n- No watched page changed in the last 7 days.\n\n## What it means → who acts\n- No action needed.\n\n## Watching\n- Nothing new.";
  assert.deepEqual(checkBrief(none, { changed: 0 }).problems, []);
});

test("each brief rule fails on its own, and says why", () => {
  const problems = (md: string, changed = 1) => checkBrief(md, { changed }).problems.join(" | ");
  assert.match(problems(""), /empty/);
  assert.match(problems(GOOD.replace("**Headline:**", "Headline:")), /Headline/);
  assert.match(problems(GOOD.replace("## What changed", "## Changes")), /What changed/);
  assert.match(problems(GOOD.replace(" ([pricing](https://rival-one.example/pricing))", "")), /no source link/);
  assert.match(problems(GOOD.replace("- **SEO:**", "- **Ads:** run paid ads against their brand terms. - **SEO:**")), /paid-ads/);
  assert.match(problems(GOOD.replace("a comparison page on price is now stronger", "copy their risk-free first month")), /inducement/);
  assert.match(problems(GOOD.replace("## Watching", "## Watching\n- a reply from someone@example.com")), /email/);
});

test("reporting a rival's offer as a fact is allowed; recommending one isn't", () => {
  const fact = GOOD.replace("the pricing page now lists the top plan at a higher price", "the promo page now advertises a refer-a-friend offer");
  assert.deepEqual(checkBrief(fact, { changed: 1 }).problems, []);
});

test("signals: only to departments competitors hands to, each with an evidence link and no inducement advice", () => {
  const allowed = receiversFrom("competitors");
  for (const d of ["seo", "content", "ceo", "finance", "legal"]) assert.ok(allowed.includes(d as never), d);
  const { signals, dropped } = parseSignals([
    { to: ["seo", "content"], title: "Comparison page — on price", body: "Rival One raised its price.", evidence: ["https://rival-one.example/pricing"] },
    { to: ["support"], title: "Wrong dept", body: "x", evidence: ["https://a.example"] },
    { to: ["ceo"], title: "No link", body: "x", evidence: [] },
    { to: ["content"], title: "Bad advice", body: "Offer a sign-up bonus to match.", evidence: ["https://a.example"] },
  ], allowed);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].title, "Comparison page, on price");
  assert.deepEqual(signals[0].to, ["seo", "content"]);
  assert.equal(dropped.length, 3);
  assert.match(dropped.join("\n"), /support/);
  assert.match(dropped.join("\n"), /evidence/);
  assert.match(dropped.join("\n"), /inducement/);
  assert.deepEqual(parseSignals(undefined, allowed), { signals: [], dropped: [] });
  assert.deepEqual(parseSignals({ signals: [] }, allowed), { signals: [], dropped: [] });
});

test("log entries only for listed competitors, names matched without case", () => {
  const out = parseLogEntries([{ competitor: "rival one", markdown: "New price — up." }, { competitor: "Nobody", markdown: "x" }], ["Rival One"]);
  assert.deepEqual(out, [{ competitor: "Rival One", markdown: "New price, up." }]);
});

test("coverage is HQ's own numbers, and says when the watcher was down", () => {
  assert.match(coverageSection({ watched: 6, changed: 2, errors: [], content: [], date: "2026-10-12" }), /6 rival page\(s\) watched; 2 changed/);
  assert.match(coverageSection({ watched: null, changed: 0, errors: [], content: [], date: "2026-10-12" }), /wasn't reachable/);
});

test("the writer gets only read, web and write-in-its-run-folder tools, and can't be asked anything", () => {
  const paths: WriterPaths = { research: "/data/b/plans/competitors/research/2026-10-12", inputs: "/i", brief: "/b", signals: "/s", log: "/l", notes: "/n" };
  const args = writerArgs("PROMPT", paths);
  const after = (flag: string) => args[args.indexOf(flag) + 1];
  assert.equal(after("--tools"), "Read,Write,Edit,WebSearch,WebFetch");
  assert.equal(after("--permission-mode"), "dontAsk");
  assert.ok(args.includes("--strict-mcp-config"));
  assert.ok(args.includes("Edit(//data/b/plans/competitors/research/2026-10-12/**)"));
  assert.ok(!args.some((a) => /^Bash|^Edit\(\/\/data\/b\/\*\*|^Edit\(\/\/\*\*/.test(a)), "no shell, no wider write");
  assert.ok(args.includes("Read(//**/.env)"));
  const prompt = writerPrompt("---\nname: competitors\n---\n# Competitors\nbody", { ...paths, brief: "/x/brief.md" }, "2026-10-12", 0);
  assert.doesNotMatch(prompt, /^name: competitors/m);
  assert.match(prompt, /\/x\/brief\.md/);
  assert.match(prompt, /no change/);
  assert.match(prompt, /inducement/);
  assert.match(prompt, /No em dashes/);
});

test("a failed run is a CEO finding until a brief follows it", () => {
  const failed = { at: "2026-10-12T20:05:00.000Z", ok: false, why: "the writer finished without a brief" };
  const f = briefRunFinding(failed, null, "acme-co");
  assert.equal(f?.id, "competitor-brief-failed");
  assert.equal(f?.since, failed.at);
  assert.match(f!.action, /competitors tick acme-co --force/);
  assert.equal(briefRunFinding(failed, "2026-10-12T21:00:00.000Z", "acme-co"), null);
  assert.equal(briefRunFinding({ ...failed, ok: true }, null, "acme-co"), null);
  assert.equal(briefRunFinding(null, null, "acme-co"), null);

  const p = profile({ competitors: [{ name: "Rival One", site: "https://rival-one.example" }] });
  const ids = buildFindings(depts(), facts({ intel: { watcherUp: true, rows: [], lastBriefAt: null, lastRun: failed } }), p, {}, new Date("2026-10-13T00:00:00Z")).map((x) => x.id);
  assert.ok(ids.includes("competitor-brief-failed"));
  const none = buildFindings(depts(), facts({ intel: { watcherUp: true, rows: [], lastBriefAt: null, lastRun: { ...failed, ok: true } } }), p, {}, new Date("2026-10-13T00:00:00Z")).map((x) => x.id);
  assert.ok(!none.includes("competitor-brief-failed"));
});

// ---------- the tick, end to end ----------

function fakeWatcher(opts: { up?: boolean; changedAgo?: number } = {}) {
  const calls: string[] = [];
  const watches: Record<string, ApiWatch> = {};
  const nowS = Math.floor(Date.now() / 1000);
  const w: Watcher = {
    up: async () => opts.up ?? true,
    list: async () => watches,
    create: async (x) => {
      calls.push(`create ${x.url} ${x.tag}`);
      const changed = x.url.endsWith("/pricing") ? nowS - (opts.changedAgo ?? DAY / 1000) : 0;
      watches[`u${Object.keys(watches).length}`] = { url: x.url, title: x.title, last_changed: changed, last_checked: nowS, last_error: x.url.includes("blocked") ? "403" : null };
    },
    recheck: async (uuid) => { calls.push(`recheck ${uuid}`); },
    history: async () => ({ "100": "a", "200": "b" }),
    diff: async () => "(changed) Top plan A$59 a month",
  };
  return { w, calls };
}

function setup() {
  tempData();
  const p = profile({
    competitors: [
      { name: "Rival One", site: "https://rival-one.example", watch: ["https://rival-one.example/pricing"], channels: { youtube: "https://www.youtube.com/@rivalone" } },
      { name: "Rival Two", site: "https://blocked.example" },
    ],
  });
  scaffoldBusiness(p);
  return p;
}

/** A writer that does what the prompt asks: reads inputs.json, writes the brief, signals and log in its run folder. */
function writer(files: { brief?: string; signals?: unknown; log?: unknown }, seen: { args?: string[]; inputs?: Record<string, unknown> } = {}): RunWriter {
  return async (_bin, args, cwd) => {
    seen.args = args;
    seen.inputs = JSON.parse(fs.readFileSync(path.join(cwd, "inputs.json"), "utf8"));
    if (files.brief !== undefined) fs.writeFileSync(path.join(cwd, "brief.md"), files.brief);
    if (files.signals !== undefined) fs.writeFileSync(path.join(cwd, "signals.json"), JSON.stringify(files.signals));
    if (files.log !== undefined) fs.writeFileSync(path.join(cwd, "log.json"), JSON.stringify(files.log));
    return { code: 0, stdout: JSON.stringify({ result: "done", total_cost_usd: 0.42, is_error: false }) };
  };
}

const deps = (over: TickDeps = {}): TickDeps => ({
  claude: "/bin/claude-fake", ytDlp: "/bin/yt-dlp-fake", recheckWaitMs: 0,
  runCmd: async () => ({ code: 0, stdout: "20261010 | 1200 views | https://www.youtube.com/watch?v=abc | A new video\n" }),
  ...over,
});

test("the tick syncs, rechecks, writes, saves the brief where the CEO reads it, files signals and logs", async () => {
  const p = setup();
  const { w, calls } = fakeWatcher();
  const seen: { args?: string[]; inputs?: Record<string, unknown> } = {};
  const r = await tickBusiness(p.slug, {}, deps({
    watcher: w,
    runWriter: writer({
      brief: GOOD.replace("raised its top plan price", "raised its top plan price — again"),
      signals: [{ to: ["seo", "content"], title: "Comparison page on price", body: "Rival One raised its top plan.", evidence: ["https://rival-one.example/pricing"] }],
      log: [{ competitor: "Rival One", markdown: "Top plan price up ([pricing](https://rival-one.example/pricing))." }],
    }, seen),
  }));
  assert.equal(r.status, "ok", r.why);
  assert.equal(r.signals, 1);
  assert.equal(r.costUsd, 0.42);

  // watcher: both pages created under the business's tag, then rechecked
  assert.ok(calls.includes("create https://rival-one.example/pricing hq-acme-co"));
  assert.ok(calls.includes("create https://blocked.example hq-acme-co"));
  assert.equal(calls.filter((c) => c.startsWith("recheck")).length, 2);

  // the writer saw the change with its diff, the uploads, and ran under the narrow allowlist
  const changes = seen.inputs!.changes as { competitor: string; diff: string }[];
  assert.equal(changes.length, 1);
  assert.equal(changes[0].competitor, "Rival One");
  assert.match(changes[0].diff, /A\$59/);
  assert.equal((seen.inputs!.content as { ok: boolean }[])[0].ok, true);
  assert.equal(seen.args![seen.args!.indexOf("--permission-mode") + 1], "dontAsk");

  // saved as the department's plan: lastBriefAt reads it; no dashes; HQ's coverage appended
  const plan = latestPlan(p.slug, "competitors");
  assert.ok(plan);
  assert.match(plan!.markdown, /\*\*Headline:\*\*/);
  assert.doesNotMatch(plan!.markdown, /[—–]/);
  assert.match(plan!.markdown, /2 rival page\(s\) watched; 1 changed/);
  assert.match(plan!.markdown, /couldn't fetch: Rival Two \(blocked\.example\)/);
  assert.ok(fs.existsSync(r.brief!));
  assert.equal(path.dirname(r.brief!), path.join(vaultRoot(p), "Competitors", "Briefs"));

  // the brain signal, the competitor log entry, the CEO's finding marked read, the run logged
  const signals = fs.readdirSync(path.join(vaultRoot(p), "Signals")).filter((f) => /^\d{4}-\d{2}-\d{2} /.test(f));
  assert.equal(signals.length, 1);
  assert.match(fs.readFileSync(path.join(vaultRoot(p), "Signals", signals[0]), "utf8"), /type: "?signal/);
  assert.match(fs.readFileSync(path.join(vaultRoot(p), "Competitors", "Rival One.md"), "utf8"), /### \d{4}-\d{2}-\d{2}\nTop plan price up/);
  assert.ok(doneFindings(p.slug)["competitors-changed"]);
  const run = lastBriefRun(p.slug)!;
  assert.equal(run.ok, true);
  assert.equal(run.changed, 1);
  assert.equal(run.signals, 1);

  // a second tick the same week does nothing; --force runs again
  const again = await tickBusiness(p.slug, {}, deps({ watcher: w, runWriter: writer({ brief: GOOD }) }));
  assert.equal(again.status, "skipped");
  assert.match(again.why!, /already saved/);
  const forced = await tickBusiness(p.slug, { force: true }, deps({ watcher: fakeWatcher().w, runWriter: writer({ brief: GOOD, signals: [] }) }));
  assert.equal(forced.status, "ok", forced.why);
  assert.equal(readRuns(p.slug).length, 2);
});

test("the tick: a brief saved on Tuesday doesn't stop next Monday's run; Monday's brief stops a second one", async () => {
  const p = setup();
  const first = await tickBusiness(p.slug, {}, deps({ watcher: fakeWatcher().w, runWriter: writer({ brief: GOOD, signals: [] }) }));
  assert.equal(first.status, "ok", first.why);
  const tuesday = new Date("2026-10-06T16:44:00+11:00");
  fs.utimesSync(first.plan!, tuesday, tuesday); // the plan's time is what lastBriefAt reads
  const monday = () => new Date("2026-10-12T07:00:00+11:00");
  const second = await tickBusiness(p.slug, {}, deps({ now: monday, watcher: fakeWatcher().w, runWriter: writer({ brief: GOOD, signals: [] }) }));
  assert.equal(second.status, "ok", second.why);
  const mondayRun = new Date("2026-10-12T07:05:00+11:00");
  fs.utimesSync(second.plan!, mondayRun, mondayRun);
  const third = await tickBusiness(p.slug, {}, deps({ now: () => new Date("2026-10-12T09:00:00+11:00"), watcher: fakeWatcher().w, runWriter: writer({ brief: GOOD }) }));
  assert.equal(third.status, "skipped");
  assert.match(third.why!, /this week.*Australia\/Sydney/);
});

test("a writer that leaves no brief is a failed run, logged, and a CEO finding", async () => {
  const p = setup();
  const r = await tickBusiness(p.slug, {}, deps({ watcher: fakeWatcher().w, runWriter: writer({}) }));
  assert.equal(r.status, "failed");
  assert.match(r.why!, /without a brief/);
  assert.equal(latestPlan(p.slug, "competitors"), null);
  const run = lastBriefRun(p.slug)!;
  assert.equal(run.ok, false);
  assert.equal(briefRunFinding(run, null, p.slug)?.id, "competitor-brief-failed");
  assert.ok(!fs.existsSync(path.join(businessDir(p.slug), "plans", "competitors", "run.lock")), "the lock is released");
});

test("a brief that fails HQ's checks isn't saved, and says why", async () => {
  const p = setup();
  const r = await tickBusiness(p.slug, {}, deps({ watcher: fakeWatcher().w, runWriter: writer({ brief: GOOD.replace("a comparison page on price is now stronger", "launch paid ads on their brand name") }) }));
  assert.equal(r.status, "failed");
  assert.match(r.why!, /paid-ads/);
  assert.equal(latestPlan(p.slug, "competitors"), null);
  assert.equal(lastBriefRun(p.slug)?.ok, false);
});

test("with the watcher down the brief still goes ahead, and says page changes weren't checked", async () => {
  const p = setup();
  const seen: { inputs?: Record<string, unknown> } = {};
  const none = "**Headline:** No competitor changes this week.\n\n## What changed\n- Nothing new found.\n\n## What it means → who acts\n- No action needed.\n\n## Watching\n- The watcher was down.";
  const r = await tickBusiness(p.slug, {}, deps({ watcher: fakeWatcher({ up: false }).w, runWriter: writer({ brief: none }, seen) }));
  assert.equal(r.status, "ok", r.why);
  assert.equal((seen.inputs!.watcher as { watched: null }).watched, null);
  assert.match(latestPlan(p.slug, "competitors")!.markdown, /wasn't reachable/);
});

test("no Claude Code on the Mac is a failed run, not a silent one", async () => {
  const p = setup();
  const r = await tickBusiness(p.slug, {}, deps({ watcher: fakeWatcher().w, claude: null, runWriter: writer({ brief: GOOD }) }));
  assert.equal(r.status, "failed");
  assert.match(r.why!, /Claude Code/);
  assert.equal(lastBriefRun(p.slug)?.ok, false);
});

test("--all skips businesses with no competitors and demo businesses", async () => {
  tempData();
  scaffoldBusiness(profile({ slug: "no-rivals", name: "No Rivals" }));
  scaffoldBusiness(profile({ slug: "demo-co", name: "Demo Co", demo: true, competitors: [{ name: "R", site: "https://r.example" }] }));
  const ran: string[] = [];
  const out = await tick("all", {}, deps({ watcher: fakeWatcher().w, runWriter: async (...a) => { ran.push(a[2]); return { code: 0, stdout: "" }; } }));
  assert.deepEqual(out, []);
  assert.deepEqual(ran, []);
  const named = await tick(["no-rivals"], {}, deps());
  assert.equal(named[0].status, "skipped");
  assert.match(named[0].why!, /no competitors/);
});

test("services init defines the weekly job: Monday 07:00, competitors tick --all, not kept alive", () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "hq-svc-"));
  const root = path.resolve(__dirname, "..");
  const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/hq.ts", "services", "init"], { cwd: root, encoding: "utf8", env: { ...process.env, HQ_DATA: data, HQ_ROOT: root } });
  assert.equal(r.status, 0, r.stderr);
  const svc = (JSON.parse(fs.readFileSync(path.join(data, "services.json"), "utf8")) as { services: { label: string; program: string[]; keepAlive: boolean; schedule?: Record<string, number> }[] }).services
    .find((s) => s.label === "com.hq.competitors");
  assert.ok(svc);
  assert.deepEqual(svc!.schedule, { Weekday: 1, Hour: 7, Minute: 0 });
  assert.deepEqual(svc!.program.slice(1), ["run", "hq", "--", "competitors", "tick", "--all"]);
  assert.equal(svc!.keepAlive, false);
});

test("hq help lists competitors tick", () => {
  const root = path.resolve(__dirname, "..");
  const out = spawnSync(process.execPath, ["--import", "tsx", "scripts/hq.ts", "help"], { cwd: root, encoding: "utf8" }).stdout;
  assert.match(out, /competitors tick <slug\|--all>/);
});

test("a guardrail or a rival report naming a banned phrase isn't advice; a recommendation still is", () => {
  const actions = (line: string) => GOOD.replace("- **SEO:** a comparison page on price is now stronger. → `/hq:dept seo`", line);
  const ok = (line: string) => assert.deepEqual(checkBrief(actions(line), { changed: 1, rivals: ["Rival One"] }).problems, [], line);
  const bad = (line: string) => assert.match(checkBrief(actions(line), { changed: 1, rivals: ["Rival One"] }).problems.join(" "), /inducement|paid-ads/, line);
  ok('- **SEO:** a comparison page; describe tools and prices only, no earnings or "risk-free" wording.');
  ok("- **Legal:** rivals publish sign-up bonus wording. Acme Co should not mirror any of it.");
  ok("- **Legal:** Rival One advertises a refer-a-friend scheme on its pricing page.");
  ok("- **Content:** never promise guaranteed results in the comparison.");
  bad("- **Content:** offer a no-lose first month to win their users.");
  bad("- **Content:** add a refer-a-friend reward to the pricing page.");
  bad("- **Ads:** boost the post with paid social.");
});

test("signals that warn against inducements are filed; ones that recommend them aren't", () => {
  const allowed = receiversFrom("competitors");
  const { signals, dropped } = parseSignals([
    { to: ["legal"], title: "Rival claims to steer clear of", body: "Rival One says risk-free. Don't mirror it.", evidence: ["https://rival-one.example/"] },
    { to: ["content"], title: "Match their offer", body: "Give a sign-up bonus too.", evidence: ["https://rival-one.example/"] },
  ], allowed, ["Rival One"]);
  assert.deepEqual(signals.map((s) => s.title), ["Rival claims to steer clear of"]);
  assert.equal(dropped.length, 1);
});
