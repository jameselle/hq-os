import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildInbox } from "../lib/lifecycle-inbox";
import { addNote, listNotes, setNoteDone } from "../lib/lifecycle-notes";
import { flowStatus } from "../lib/lifecycle-status";
import type { LifecycleFlow, LifecycleSnapshot } from "../lib/lifecycle";
import { businessDir, scaffoldBusiness, vaultRoot } from "../lib/store";
import { profile, tempData } from "./helpers";

const flow = (id: string, over: Partial<LifecycleFlow> = {}): LifecycleFlow => ({
  id, label: `${id} flow`, serves: "Churn early warning", mode: "draft", channel: "email", trigger: "t",
  daily: [], delivery: [{ label: "sent", count: 20 }, { label: "delivered", count: 20 }], skips: [], outcomes: [],
  messages: [{ id: `${id}-a`, label: "A", subject: `${id} subject`, html: `<p>${id}</p>` }], ...over,
});
const snap = (flows: LifecycleFlow[], workflows: LifecycleSnapshot["workflows"]): LifecycleSnapshot => ({
  version: 1, observedAt: new Date().toISOString(), paused: false, collectionFailed: false, stages: [], delivery: [], history: [], accounts: [], flows, workflows,
});

test("the inbox puts draft batches first, soonest expiry first, with each one's own email", () => {
  const s = snap([flow("onboarding"), flow("churn")], [
    { id: "onboarding-a", label: "Day 0", delayHours: 1, enabled: true, audience: "x", drafts: 3, expiresAt: "2026-10-08T00:00:00Z", preview: { subject: "Later", text: "t" } },
    { id: "churn-a", label: "Check-in", delayHours: 1, enabled: true, audience: "x", drafts: 2, expiresAt: "2026-10-06T00:00:00Z" },
    { id: "churn-b", label: "Nothing waiting", delayHours: 1, enabled: true, audience: "x", drafts: 0 },
  ]);
  const statuses = s.flows!.map((f) => flowStatus(f, s.workflows, { now: Date.now(), tz: "UTC", observedAt: s.observedAt }));
  const inbox = buildInbox(s, statuses);
  assert.deepEqual(inbox.drafts.map((d) => [d.messageId, d.count]), [["churn-a", 2], ["onboarding-a", 3]]);
  assert.equal(inbox.drafts[0].flowId, "churn");
  assert.equal(inbox.drafts[0].subject, "churn subject", "falls back to the rendered message's subject");
  assert.equal(inbox.drafts[0].html, "<p>churn</p>");
  assert.equal(inbox.drafts[1].subject, "Later", "the adapter's preview wins");
  assert.equal(inbox.issues.length, 0, "a flow with drafts is a card already");
  assert.deepEqual(inbox.flows.map((f) => f.id), ["onboarding", "churn"]);
});

test("a flow whose emails are hurting becomes an issue card with HQ's suggestion", () => {
  const today = new Date().toISOString().slice(0, 10);
  const bad = flow("habit", { mode: "auto", daily: [{ day: today, entered: 59, sent: 59, skipped: 0 }], delivery: [{ label: "sent", count: 59 }, { label: "delivered", count: 59 }, { label: "unsubscribed", count: 3 }] });
  const s = snap([bad], [{ id: "habit-a", label: "Notes", delayHours: 1, enabled: true, audience: "x", drafts: 0 }]);
  const inbox = buildInbox(s, s.flows!.map((f) => flowStatus(f, s.workflows, { now: Date.now(), tz: "UTC", observedAt: s.observedAt })));
  assert.equal(inbox.issues.length, 1);
  assert.equal(inbox.issues[0].kind, "problem");
  assert.match(inbox.issues[0].text, /unsubscribed/);
});

test("notes: saved owner-only, mirrored to the vault, marked done; bad input refused", () => {
  tempData();
  const p = profile({ model: "subscription" });
  scaffoldBusiness(p);
  const note = addNote(p.slug, { flow: "onboarding", message: "onboarding-d0", text: "Make the subject shorter" }, new Date("2026-10-05T00:00:00Z"));
  assert.equal(listNotes(p.slug).length, 1);
  const file = path.join(businessDir(p.slug), "lifecycle-notes.json");
  assert.equal((fs.statSync(file).mode & 0o777).toString(8), "600");
  const vault = path.join(vaultRoot(p), "Departments", "Email & Lifecycle", "Owner notes.md");
  assert.match(fs.readFileSync(vault, "utf8"), /- \[ \] \*\*onboarding \/ onboarding-d0\*\* \(2026-10-05\): Make the subject shorter/);
  setNoteDone(p.slug, note.id, true);
  assert.ok(listNotes(p.slug)[0].done);
  assert.match(fs.readFileSync(vault, "utf8"), /## Done\n\n- \[x\]/);
  assert.throws(() => addNote(p.slug, { flow: "onboarding", text: "  " }), /Write something/);
  assert.throws(() => addNote(p.slug, { flow: "../etc", text: "x" }), /Unknown flow/);
  assert.throws(() => addNote(p.slug, { flow: "onboarding", text: "x".repeat(1001) }), /under 1000/);
  assert.throws(() => setNoteDone(p.slug, "nope", true), /No such note/);
});
