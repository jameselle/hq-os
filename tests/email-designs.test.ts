import { test } from "node:test";
import assert from "node:assert/strict";

import { emailDesigns, htmlText } from "../lib/email-designs";
import type { BrandKit } from "../lib/brand";
import type { LifecycleFlow, LifecycleSnapshot } from "../lib/lifecycle";

const kit = (emails: Partial<BrandKit["emails"][number]>[]): BrandKit => ({ version: 1, updatedAt: "2026-10-01", status: "draft", guide: "", colors: [], assets: [],
  emails: emails.map((e, i) => ({ id: `k${i}`, label: `Kit ${i}`, subject: "s", sender: "x", trigger: "t", status: "proposal", text: "t", source: "kit", ...e })) });
const flow = (id: string, msgs: [string, string][], over: Partial<LifecycleFlow> = {}): LifecycleFlow => ({ id, label: `${id} flow`, mode: "draft", channel: "email", trigger: `${id} trigger`,
  daily: [], delivery: [], skips: [], outcomes: [], messages: msgs.map(([mid, subject]) => ({ id: mid, label: mid, subject, html: `<p>${subject}</p><p>Hi &amp; bye</p>` })), ...over });
const snap = (flows: LifecycleFlow[]): LifecycleSnapshot => ({ version: 1, observedAt: "2026-10-05T00:00:00Z", paused: false, collectionFailed: false, stages: [], delivery: [], history: [], accounts: [], workflows: [], flows });

test("every email a flow sends is a design, first, with its live HTML; kit designs a flow already sends are dropped", () => {
  const out = emailDesigns(kit([{ subject: "Welcome to Acme" }, { subject: "Make your FIRST request!" }]), snap([
    flow("onboarding", [["onboarding-d0", "Make your first request"], ["onboarding-d1", "Day one"]]),
    flow("alerts", [["alerts", "Ping"]], { channel: "discord" }),
  ]))!;
  assert.deepEqual(out.emails.map((e) => e.id), ["flow-onboarding-d0", "flow-onboarding-d1", "k0"]);
  assert.equal(out.emails[0].html, "<p>Make your first request</p><p>Hi &amp; bye</p>");
  assert.equal(out.emails[0].status, "Live: each batch asks you first");
  assert.equal(out.emails[0].trigger, "onboarding trigger");
  assert.equal(out.emails[2].label, "Brand kit: Kit 0");
  assert.equal(htmlText(out.emails[0].html!), "Make your first request\n\nHi & bye");
});

test("flows with no brand kit still get a designs list; neither gives nothing", () => {
  assert.equal(emailDesigns(null, snap([flow("checkout", [["checkout", "Did something stop you?"]])]))!.emails.length, 1);
  assert.equal(emailDesigns(null, null), null);
  assert.equal(emailDesigns(kit([{}]), null)!.emails.length, 1);
});
