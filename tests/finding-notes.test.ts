import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { buildFindings } from "../lib/ceo";
import { addFindingNote, changeFindingNote, readFindingNotes } from "../lib/finding-notes";
import { getProfile, scaffoldBusiness, vaultRoot } from "../lib/store";
import { depts, facts, profile, tempData } from "./helpers";

const NOW = new Date("2026-10-07T03:00:00Z");

test("notes on findings: by id, each writer edits only their own, kept with the finding's title, mirrored to the vault", () => {
  tempData();
  const p = profile();
  scaffoldBusiness(p);
  const id = "cost-jump-expenses-operating-office-equipment";
  assert.throws(() => addFindingNote(p.slug, "Not An Id", "x", "owner"), /not a finding id/);
  assert.throws(() => addFindingNote(p.slug, id, "", "owner"), /needs some text/);
  addFindingNote(p.slug, id, "That's the new monitor, a one-off.", "owner", "Office Equipment cost $990 in Sep 2026", NOW);
  addFindingNote(p.slug, id, "Noted: I'll mark it one-off in the costs adjustments.", "claude", undefined, NOW);
  const all = readFindingNotes(p.slug);
  assert.equal(all[id].title, "Office Equipment cost $990 in Sep 2026", "the title stays for when the finding clears");
  assert.equal(all[id].notes.length, 2);
  assert.throws(() => changeFindingNote(p.slug, id, 2, "owner", "mine"), /only its writer/);
  changeFindingNote(p.slug, id, 1, "owner", "One-off: a monitor.", NOW);
  assert.ok(readFindingNotes(p.slug)[id].notes[0].editedAt);
  const md = fs.readFileSync(path.join(vaultRoot(getProfile(p.slug)!), "CEO", "Notes on findings.md"), "utf8");
  assert.match(md, /## Office Equipment cost \$990 in Sep 2026/);
  assert.match(md, /- You, 2026-10-07 \(edited\): One-off: a monitor\./);
  changeFindingNote(p.slug, id, 2, "claude", null);
  changeFindingNote(p.slug, id, 1, "owner", null);
  assert.deepEqual(readFindingNotes(p.slug), {}, "no notes left: the entry goes");
  assert.equal((fs.statSync(path.join(process.env.HQ_DATA!, "businesses", p.slug, "finding-notes.json")).mode & 0o777), 0o600);
});

test("a finding whose latest note is the owner's says it's waiting for Claude's reply", () => {
  const p = profile();
  const base = buildFindings(depts(), facts(), p, {}, NOW);
  const target = base.find((f) => f.severity === "critical" || f.severity === "attention")!;
  assert.ok(target, "the fixture raises at least one attention finding");
  const withNote = (by: "owner" | "claude") => buildFindings(depts(), facts({ findingNotes: { [target.id]: { notes: [{ at: NOW.toISOString(), by, text: "x" }] } } }), p, {}, NOW).find((f) => f.id === target.id)!;
  assert.match(withNote("owner").detail, /waiting for Claude's reply\.$/);
  assert.doesNotMatch(withNote("claude").detail, /waiting/);
});
