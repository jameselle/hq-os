import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { access, formatNote, noteMeta, parseNote, reads, receiversFrom, sendersTo } from "../lib/brain";
import { brainStats, candidates, hqBrainRoot, initBrain, listNotes, promote, readBundle, readingList, writeNote } from "../lib/brain-store";
import { getProfile, scaffoldBusiness, vaultRoot } from "../lib/store";
import { EDGES, NODES } from "../lib/workflows";
import { profile, tempData } from "./helpers";

function setup() {
  tempData();
  const p = profile();
  scaffoldBusiness(p);
  initBrain();
  return { p, vault: vaultRoot(getProfile(p.slug)!) };
}

test("the map is derived from the Workflows web and covers every department", () => {
  for (const n of NODES) {
    const a = access(n);
    assert.ok(a.reads.decision === "all" && a.reads.fact === "all", `${n} reads every decision and fact`);
    if (n === "ceo") continue;
    assert.deepEqual(new Set(a.signalsTo), new Set(EDGES.filter((e) => e.from === n).map((e) => e.to)));
    assert.ok((a.reads.lesson as string[]).includes(n), `${n} reads its own lessons`);
    for (const s of sendersTo(n)) assert.ok((a.reads.lesson as string[]).includes(s), `${n} reads lessons from ${s}, which feeds it`);
  }
  assert.equal(access("ceo").reads.lesson, "all");
  const [from, to] = [EDGES[0].from, EDGES[0].to];
  assert.ok(receiversFrom(from).includes(to));
  assert.ok(reads(to, { type: "signal", dept: from, to: [to] }));
  assert.ok(!reads(to, { type: "signal", dept: from, to: [from === "ceo" ? "content" : "ceo"] }), "a signal is read only by who it's for");
});

test("the header round-trips, and a hand-written note takes its type from the folder", () => {
  const meta = noteMeta({}, { type: "lesson", dept: "content", title: "x" });
  const text = formatNote({ ...meta, title: "Hooks", evidence: ["a.json"], to: [] }, "Body here");
  const back = parseNote(text);
  assert.equal(back.body.trim(), "Body here");
  assert.deepEqual(noteMeta(back.fields, { type: "fact", dept: "ceo", title: "?" }).evidence, ["a.json"]);
  const yaml = parseNote("---\ntype: lesson\ndept: seo\nevidence:\n  - one\n  - \"two\"\n---\nhi");
  assert.deepEqual(yaml.fields.evidence, ["one", "two"]);
  assert.equal(noteMeta(parseNote("no header").fields, { type: "playbook", dept: "data", title: "T" }).type, "playbook");
});

test("init makes the HQ brain and the typed folders, and is safe to run again", () => {
  const { vault } = setup();
  for (const f of ["Facts", "Decisions", "Lessons", "Playbooks", "Signals"]) {
    assert.ok(fs.existsSync(path.join(hqBrainRoot(), f, `${f}.md`)));
    assert.ok(fs.existsSync(path.join(vault, f, `${f}.md`)));
  }
  assert.equal(initBrain().made.length, 0);
  assert.equal(listNotes("business", vault).length, 0, "index notes aren't notes");
});

test("facts update in place and keep created; lessons are dated; signals need a receiver the web allows", () => {
  const { p, vault } = setup();
  const f1 = writeNote("business", p.slug, { type: "fact", dept: "content", title: "Brand voice", body: "Warm." });
  const created = noteMeta(parseNote(fs.readFileSync(f1, "utf8")).fields, { type: "fact", dept: "content", title: "" }).created;
  const f2 = writeNote("business", p.slug, { type: "fact", dept: "content", title: "Brand voice", body: "Warm and blunt." });
  assert.equal(f1, f2);
  assert.match(fs.readFileSync(f2, "utf8"), /Warm and blunt/);
  assert.equal(noteMeta(parseNote(fs.readFileSync(f2, "utf8")).fields, { type: "fact", dept: "content", title: "" }).created, created);
  const l = writeNote("business", p.slug, { type: "lesson", dept: "content", title: "Hooks", body: "First person wins." });
  assert.match(path.basename(l), /^\d{4}-\d{2}-\d{2} Hooks\.md$/);
  assert.throws(() => writeNote("business", p.slug, { type: "lesson", dept: "content", title: "Hooks", body: "again" }), /already written today/);
  const to = receiversFrom("support")[0];
  assert.throws(() => writeNote("business", p.slug, { type: "signal", dept: "support", title: "S", body: "b" }), /needs `to`/);
  assert.throws(() => writeNote("business", p.slug, { type: "signal", dept: "support", title: "S", body: "b", to: ["people"] }), /doesn't hand signals to people/);
  writeNote("business", p.slug, { type: "signal", dept: "support", title: "Stuck users", body: "Three asked.", to: [to] });
  assert.throws(() => writeNote("business", p.slug, { type: "decision", dept: "content", title: "D", body: "b" }), /doesn't write decisions/);
  assert.equal(listNotes("business", vault).length, 3);
});

test("the HQ brain refuses a business's name, and promotion links both ways", () => {
  const { p, vault } = setup();
  assert.throws(() => writeNote("hq", null, { type: "lesson", dept: "content", title: `What ${p.name} learned`, body: "x" }), /remove "Acme Co"/);
  const l = writeNote("business", p.slug, { type: "lesson", dept: "content", title: "Acme Co hooks", body: "At Acme Co, first-person hooks won.", evidence: ["insights.json"] });
  const rel = path.relative(vault, l);
  assert.equal(candidates(p.slug).length, 1);
  assert.throws(() => promote(p.slug, rel), /rewrite it without/);
  const hq = promote(p.slug, rel, { title: "First-person hooks win", body: "First-person result hooks kept more viewers than commands." });
  const hqText = fs.readFileSync(hq, "utf8");
  const hqMeta = parseNote(hqText).fields;
  assert.ok(!hqText.toLowerCase().includes(p.slug) && !hqText.includes(p.name), "the HQ copy never names where it came from");
  assert.equal(hqMeta.evidence, undefined, "evidence links stay in the business vault");
  assert.match(String(hqMeta.promoted), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(String(parseNote(fs.readFileSync(l, "utf8")).fields.promoted_to), /^Lessons\/\d{4}-\d{2}-\d{2} First-person hooks win\.md$/);
  assert.equal(candidates(p.slug).length, 0);
  assert.throws(() => promote(p.slug, rel), /already promoted/);
  const fact = writeNote("business", p.slug, { type: "fact", dept: "content", title: "Prices", body: "$10" });
  assert.throws(() => promote(p.slug, path.relative(vault, fact)), /stay in their business/);
  assert.throws(() => promote(p.slug, "../../profile.json"), /no such note/);
});

test("legacy SOPs and CEO decisions are read, in reading order, within the budget", () => {
  const { p, vault } = setup();
  const sop = path.join(vault, "Departments", "Content & Social", "SOPs");
  fs.mkdirSync(sop, { recursive: true });
  fs.writeFileSync(path.join(sop, "Daily episode.md"), "# Daily episode\nScript, record, edit, post.");
  fs.mkdirSync(path.join(vault, "CEO", "Decisions"), { recursive: true });
  fs.writeFileSync(path.join(vault, "CEO", "Decisions", "One keyword per post.md"), "Each post has its own keyword.");
  writeNote("business", p.slug, { type: "fact", dept: "content", title: "Offer", body: "Widgets." });
  const outsider = NODES.find((n) => n !== "ceo" && n !== "content" && !sendersTo("content").includes(n))!;
  writeNote("business", p.slug, { type: "lesson", dept: outsider, title: "Not for content", body: "x".repeat(50) });
  writeNote("business", p.slug, { type: "lesson", dept: sendersTo("content")[0], title: "From a feeder", body: "Content reads this." });
  writeNote("hq", null, { type: "playbook", dept: "content", title: "Cover in the 3:4 crop", body: "Keep titles inside the crop." });
  writeNote("business", p.slug, { type: "playbook", dept: "data", title: "Old", body: "replaced", status: "replaced" });

  const list = readingList(p.slug, "content").map((n) => `${n.meta.type}:${n.meta.title}:${n.scope}`);
  assert.deepEqual(list, ["decision:One keyword per post:business", "fact:Offer:business", "lesson:From a feeder:business", "playbook:Daily episode:business", "playbook:Cover in the 3:4 crop:hq"]);
  const small = readBundle(p.slug, "content", 300);
  assert.match(small, /Also in the brain, not shown/);
  const stats = brainStats(p.slug);
  assert.equal(stats.counts.hq.playbook, 1);
  assert.equal(stats.counts.business.playbook, 1, "replaced notes aren't counted");
  assert.equal(stats.perDept.content.reads, 5);
  assert.ok(stats.hqExists);
});
