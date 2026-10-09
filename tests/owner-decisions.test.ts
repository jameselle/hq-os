import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { buildFindings } from "../lib/ceo";
import { initBrain } from "../lib/brain-store";
import { addDecisionNote, addDecisions, awaitingReply, changeDecisionNote, decide, decisionFindings, decisionProblem, dropDecision, listDecisions } from "../lib/owner-decisions";
import { getProfile, scaffoldBusiness, vaultRoot } from "../lib/store";
import { depts, facts, profile, tempData } from "./helpers";

const NOW = new Date("2026-10-07T03:00:00Z");
const base = { title: "Approve the off-season emails", why: "Four drafts expire.", how: "Email & Lifecycle, Needs you.", dept: "email" };

test("a decision needs a title, why, how and department; due is a date", () => {
  assert.equal(decisionProblem(base), null);
  assert.match(decisionProblem({ ...base, how: "" })!, /how is required/);
  assert.match(decisionProblem({ ...base, due: "16 Oct" })!, /YYYY-MM-DD/);
  assert.match(decisionProblem({ ...base, id: "Bad Id" })!, /lowercase/);
});

test("open decisions read as CEO findings: due soon or overdue is attention, the rest decision", () => {
  const mk = (over: object) => ({ ...base, id: "x", createdAt: NOW.toISOString(), status: "open" as const, ...over });
  const [soon, later, none, past] = decisionFindings([mk({ id: "a", due: "2026-10-08" }), mk({ id: "b", due: "2026-10-16", recommend: "Approve all four." }), mk({ id: "c" }), mk({ id: "d", due: "2026-10-01" })], NOW);
  assert.equal(soon.severity, "attention");
  assert.match(soon.title, /^By Thu 8 Oct: /);
  assert.equal(later.severity, "decision");
  assert.match(later.detail, /Recommended: Approve all four\./);
  assert.equal(none.title, base.title);
  assert.match(past.title, /^Overdue since /);
  assert.equal(soon.id, "owner-a");
  assert.deepEqual(decisionFindings([mk({ status: "decided" })], NOW), []);
});

test("stored per business: re-adding updates, deciding files the answer in the brain, dropping closes it; the CEO shows only open ones", () => {
  tempData();
  const p = profile();
  scaffoldBusiness(p);
  initBrain();
  const [d] = addDecisions(p.slug, [base], NOW);
  assert.equal(d.id, "approve-the-off-season-emails");
  addDecisions(p.slug, [{ ...base, due: "2026-10-16" }], NOW);
  assert.equal(listDecisions(p.slug).length, 1, "same id: updated, not duplicated");
  assert.equal(listDecisions(p.slug)[0].due, "2026-10-16");
  assert.equal((fs.statSync(path.join(process.env.HQ_DATA!, "businesses", p.slug, "owner-decisions.json")).mode & 0o777), 0o600);

  const ceo = () => buildFindings(depts(), facts({ ownerDecisions: listDecisions(p.slug) }), p, {}, NOW).filter((f) => f.id.startsWith("owner-"));
  assert.equal(ceo().length, 1);
  assert.throws(() => decide(p.slug, d.id, ""), /--answer/);
  decide(p.slug, d.id, "Approved all four.", NOW);
  assert.deepEqual(ceo(), []);
  assert.ok(fs.readdirSync(path.join(vaultRoot(getProfile(p.slug)!), "Decisions")).some((f) => f.includes("Approve the off-season emails")));
  assert.throws(() => addDecisions(p.slug, [base], NOW), /already made or dropped/);

  addDecisions(p.slug, [{ ...base, id: "kuma", title: "Pick an alert channel" }], NOW);
  dropDecision(p.slug, "kuma", "Not needed", NOW);
  assert.equal(listDecisions(p.slug).find((x) => x.id === "kuma")!.status, "dropped");
  assert.throws(() => decide(p.slug, "kuma", "x"), /already dropped/);
});

test("notes: the owner's and Claude's, each editable only by its writer; kept through an update; mirrored to the vault", () => {
  tempData();
  const p = profile();
  scaffoldBusiness(p);
  initBrain();
  const [d] = addDecisions(p.slug, [base], NOW);
  assert.throws(() => addDecisionNote(p.slug, d.id, "  ", "owner"), /needs some text/);
  assert.throws(() => addDecisionNote(p.slug, "nope", "x", "owner"), /no decision/);
  addDecisionNote(p.slug, d.id, "Leaning yes, but check the copy first.", "owner", NOW);
  let cur = listDecisions(p.slug)[0];
  assert.ok(awaitingReply(cur), "the owner wrote last");
  assert.match(decisionFindings([cur], NOW)[0].detail, /waiting for Claude's reply/);

  addDecisionNote(p.slug, d.id, "Copy checked: no offers, unsubscribe link present.", "claude", NOW);
  cur = listDecisions(p.slug)[0];
  assert.ok(!awaitingReply(cur));
  assert.doesNotMatch(decisionFindings([cur], NOW)[0].detail, /waiting/);

  assert.throws(() => changeDecisionNote(p.slug, d.id, 2, "owner", "mine now"), /only its writer/);
  changeDecisionNote(p.slug, d.id, 1, "owner", "Yes, approve them.", NOW);
  assert.equal(listDecisions(p.slug)[0].notes![0].text, "Yes, approve them.");
  assert.ok(listDecisions(p.slug)[0].notes![0].editedAt);
  assert.throws(() => changeDecisionNote(p.slug, d.id, 9, "owner", "x"), /no note 9/);

  addDecisions(p.slug, [{ ...base, recommend: "Approve." }], NOW);
  assert.equal(listDecisions(p.slug)[0].notes!.length, 2, "re-adding updates the fields, not the notes");

  const md = fs.readFileSync(path.join(vaultRoot(getProfile(p.slug)!), "CEO", "Open decisions.md"), "utf8");
  assert.match(md, /## Approve the off-season emails/);
  assert.match(md, /- You, 2026-10-07 \(edited\): Yes, approve them\./);
  assert.match(md, /- Claude, 2026-10-07: Copy checked/);

  changeDecisionNote(p.slug, d.id, 2, "claude", null);
  assert.equal(listDecisions(p.slug)[0].notes!.length, 1);
  decide(p.slug, d.id, "Approved.", NOW);
  addDecisionNote(p.slug, d.id, "Sent fine.", "claude", NOW);
  assert.equal(listDecisions(p.slug)[0].notes!.length, 2, "a closed decision can still take notes");
});
