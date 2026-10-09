import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { allNotes } from "../lib/brain-store";
import { digestWritten, rebuildSupport, runSupport, supportDigest, supportProblem, supportState, writeSupportDigest, type SupportSnapshot } from "../lib/support";
import { businessDir, scaffoldBusiness } from "../lib/store";
import { profile, tempData } from "./helpers";

const snap = (over: Partial<SupportSnapshot> = {}): SupportSnapshot => ({
  version: 1, observedAt: "2026-10-05T00:00:00Z", answerAt: "https://example.com/admin/support", channels: ["In-app chat"],
  waiting: [{ ref: "s-1a2b3c4d", channel: "chat", theme: "Billing and payments", openedFrom: "/app/settings", openedAt: "2026-10-04T00:00:00Z", lastAt: "2026-10-04T01:00:00Z", unread: 1 }],
  themes: { "Feature request": 4, "Bug or broken": 2, Other: 3 }, stuck: { "Account and sign-in": 2 },
  weekly: [{ week: "2026-W40", opened: 5, answered: 4, medianReplyHours: 2.5 }, { week: "2026-W41", opened: 1, answered: 0, medianReplyHours: null }],
  ratings: { up: 3, down: 1 }, ...over,
});

test("validator: references, themes, counts and timings only", () => {
  assert.equal(supportProblem(snap()), null);
  assert.equal(supportProblem(snap({ waiting: [{ ...snap().waiting[0], ref: "someone@example.com" }] })), "waiting[0].ref");
  assert.equal(supportProblem(snap({ waiting: [{ ...snap().waiting[0], theme: "call +61 400 000 000" }] })), "waiting[0].label");
  assert.equal(supportProblem(snap({ themes: { "a@b.co": 1 } })), "themes");
  assert.equal(supportProblem(snap({ answerAt: "https://x.io/admin?user=1" })), "answerAt");
  const r = rebuildSupport({ ...snap(), extra: 1 } as SupportSnapshot & { extra: number });
  assert.equal("extra" in r, false);
});

test("the digest names themes and where new customers get stuck, for Email, Data and Product", () => {
  const d = supportDigest("x", snap(), "2026-W41");
  assert.equal(d.title, "Support themes 2026-W41");
  assert.match(d.body, /Feature request 4, Bug or broken 2 \(plus 3 the rules couldn't place\)/);
  assert.match(d.body, /New customers .* Account and sign-in 2\. Email: look at the onboarding emails/);
  assert.match(d.body, /1 waiting for a reply now/);
});

test("refresh stores the snapshot owner-only and the digest goes to the brain once a week", async () => {
  tempData();
  const p = profile({ model: "subscription" });
  scaffoldBusiness(p);
  const dir = businessDir(p.slug);
  const adapter = path.join(dir, "support.mjs");
  fs.writeFileSync(adapter, `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(${JSON.stringify(JSON.stringify(snap()))}));`);
  fs.writeFileSync(path.join(dir, "support-connection.json"), JSON.stringify({ command: [process.execPath, adapter] }));
  const s = await runSupport(p.slug);
  assert.equal((fs.statSync(path.join(dir, "support-snapshot.json")).mode & 0o777).toString(8), "600");
  assert.equal(supportState(p.slug).snapshot!.waiting.length, 1);
  assert.equal(digestWritten(p.slug, "2026-W41"), false);
  writeSupportDigest(p.slug, s, "2026-W41");
  assert.equal(digestWritten(p.slug, "2026-W41"), true);
  const note = allNotes(p.slug).find((n) => n.meta.title === "Support themes 2026-W41")!;
  assert.equal(note.meta.type, "signal");
  assert.deepEqual(note.meta.to, ["email", "data", "engineering"]);
});

test("rival changes: marking one seen is validated and stored owner-only", async () => {
  const { markRivalSeen } = await import("../lib/rivals-seen");
  tempData();
  const p = profile();
  scaffoldBusiness(p);
  assert.throws(() => markRivalSeen(p.slug, "../x", "2026-10-05T00:00:00Z"), /Unknown change/);
  markRivalSeen(p.slug, "0b8f6c2e-1a2b-4c3d-8e9f-0123456789ab", "2026-10-05T00:00:00Z");
  const f = path.join(businessDir(p.slug), "rival-seen.json");
  assert.equal((fs.statSync(f).mode & 0o777).toString(8), "600");
  assert.equal(JSON.parse(fs.readFileSync(f, "utf8"))["0b8f6c2e-1a2b-4c3d-8e9f-0123456789ab"], "2026-10-05T00:00:00Z");
});

test("several sources merge into one board; a failing source is named in blind, not fatal", async () => {
  const { mergeSupport } = await import("../lib/support");
  const mail: SupportSnapshot = { version: 1, observedAt: "2026-10-05T06:00:00Z", answerAt: "https://mail.example.com/#search/support", channels: ["Support email"], blind: ["Personal addresses"],
    waiting: [{ ref: "e-0a1b2c3d", channel: "Email", theme: "Billing and payments", openedFrom: "a new email", openedAt: "2026-10-03T00:00:00Z", lastAt: "2026-10-03T00:00:00Z", unread: 1 }],
    themes: { "Billing and payments": 2, Other: 1 }, weekly: [{ week: "2026-W40", opened: 3, answered: 1, medianReplyHours: 10 }] };
  const m = mergeSupport([snap(), mail]);
  assert.equal(supportProblem(m), null);
  assert.equal(m.answerAt, "https://example.com/admin/support");
  assert.deepEqual(m.channels, ["In-app chat", "Support email"]);
  assert.deepEqual(m.waiting.map((w) => [w.ref, w.answerAt]), [["e-0a1b2c3d", "https://mail.example.com/#search/support"], ["s-1a2b3c4d", undefined]]);
  assert.deepEqual(m.themes, { "Feature request": 4, "Bug or broken": 2, Other: 4, "Billing and payments": 2 });
  assert.deepEqual(m.weekly[0], { week: "2026-W40", opened: 8, answered: 5, medianReplyHours: 4 });
  assert.equal(m.observedAt, "2026-10-05T00:00:00Z");

  tempData();
  const p = profile({ model: "subscription" });
  scaffoldBusiness(p);
  const dir = businessDir(p.slug);
  const ok = path.join(dir, "a.mjs"), bad = path.join(dir, "b.mjs");
  fs.writeFileSync(ok, `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(${JSON.stringify(JSON.stringify(mail))}));`);
  fs.writeFileSync(bad, `process.exit(1)`);
  fs.writeFileSync(path.join(dir, "support-connection.json"), JSON.stringify({ commands: [[process.execPath, ok], [process.execPath, bad]] }));
  const s = await runSupport(p.slug);
  assert.equal(s.waiting.length, 1);
  assert.ok(s.blind!.some((b) => /support source 2 \(b\.mjs\) couldn't be read/.test(b)));
  fs.writeFileSync(path.join(dir, "support-connection.json"), JSON.stringify({ commands: [[process.execPath, bad], [process.execPath, bad]] }));
  await assert.rejects(runSupport(p.slug), /Every support source failed/);
  fs.writeFileSync(path.join(dir, "support-connection.json"), JSON.stringify({ commands: [[process.execPath, bad]] }));
  await assert.rejects(runSupport(p.slug), /Private adapter failed/);
  fs.writeFileSync(path.join(dir, "support-connection.json"), JSON.stringify({ commands: [] }));
  await assert.rejects(runSupport(p.slug), /Invalid support connection/);
});

test("a waiting row's own link is validated like answerAt", () => {
  assert.equal(supportProblem(snap({ waiting: [{ ...snap().waiting[0], answerAt: "https://x.io/a?id=1" }] })), "waiting[0].answerAt");
  assert.equal(rebuildSupport(snap({ waiting: [{ ...snap().waiting[0], answerAt: "https://x.io/a" }] })).waiting[0].answerAt, "https://x.io/a");
});
