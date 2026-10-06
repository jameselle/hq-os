import assert from "node:assert/strict";
import { test } from "node:test";

import { channelStatuses, resolveRoute, withPosting, validateSnapshot, PLATFORMS } from "../lib/publishing";
import { validateProfile } from "../lib/profile";
import { profile } from "./helpers";

test("defaults: Instagram/YouTube/Pinterest via Composio, TikTok via WoopSocial, Discord via Postiz, unknown is manual", () => {
  assert.equal(resolveRoute("instagram", "@a").via, "composio");
  assert.equal(resolveRoute("youtube", "@a").via, "composio");
  assert.equal(resolveRoute("pinterest", "@a").via, "composio");
  assert.equal(resolveRoute("tiktok", "@a").via, "woopsocial");
  assert.equal(resolveRoute("discord", "x").via, "postiz");
  assert.equal(resolveRoute("myspace", "x").via, "manual");
});

test("a profile's `via` overrides the default route", () => {
  assert.equal(resolveRoute("tiktok", { handle: "@a", via: "composio" }).toolkit, "tiktok");
  assert.equal(resolveRoute("instagram", { handle: "@a", via: "postiz" }).via, "postiz");
});

test("every Composio route names a toolkit, and the known traps are recorded", () => {
  for (const [name, p] of Object.entries(PLATFORMS)) {
    for (const r of p.routes) if (r.via === "composio" || r.via === "woopsocial") assert.ok(r.toolkit, `${name}/${r.via}`);
  }
  assert.ok(PLATFORMS.youtube.routes[0].traps!.some((t) => t.includes("resumable")));
  assert.ok(PLATFORMS.tiktok.routes[0].traps!.some((t) => t.includes("external_post_id")));
});

test("snapshots that look like they carry credentials are refused", () => {
  const good = { checkedAt: new Date().toISOString(), source: "t", toolkits: { instagram: { status: "active", accounts: [{ id: "instagram_x", status: "ACTIVE" }] } } };
  assert.equal(validateSnapshot(good).ok, true);
  const bad = { ...good, toolkits: { instagram: { status: "active", accounts: [{ id: "x", status: "ACTIVE", access_token: "abc" }] } } };
  assert.equal(validateSnapshot(bad).ok, false);
  assert.equal(validateSnapshot({ toolkits: {} }).ok, false);
});

test("channel statuses: connected, not connected, postiz and manual", () => {
  const snap = { checkedAt: new Date().toISOString(), source: "t", toolkits: { instagram: { status: "active", accounts: [{ id: "instagram_x", name: "acme", status: "ACTIVE" }] } } };
  const s = channelStatuses({ instagram: "@acme", tiktok: "@acme", discord: "x", myspace: "y" }, snap, true);
  const by = Object.fromEntries(s.map((c) => [c.platform, c.state]));
  assert.deepEqual(by, { instagram: "connected", tiktok: "not-connected", discord: "via-postiz", myspace: "manual" });
});

test("profiles accept channel objects and reject bad routes", () => {
  assert.equal(validateProfile(profile({ channels: { instagram: { handle: "@a", via: "composio", account: "instagram_x" } } })).ok, true);
  assert.equal(validateProfile(profile({ channels: { instagram: { handle: "@a", via: "carrier-pigeon" as never } } })).ok, false);
  assert.equal(validateProfile(profile({ channels: { instagram: { via: "composio" } as never } })).ok, false);
});

test("an account only counts when it's pinned or its name matches the handle, never another business's", () => {
  const snap = { checkedAt: new Date().toISOString(), source: "t", toolkits: { instagram: { status: "active", accounts: [{ id: "instagram_a", name: "otherbiz", status: "ACTIVE" }, { id: "instagram_b", name: "acme", status: "ACTIVE" }] } } };
  assert.equal(channelStatuses({ instagram: "@acme" }, snap, true)[0].state, "connected");
  const other = channelStatuses({ instagram: "@newbiz" }, snap, true)[0];
  assert.equal(other.state, "not-connected");
  assert.match(other.detail, /connected: otherbiz, acme/);
  assert.equal(channelStatuses({ instagram: { handle: "@anything", account: "instagram_a" } }, snap, true)[0].state, "connected");
  assert.equal(channelStatuses({ instagram: "https://instagram.com/acme/" }, snap, true)[0].state, "connected");
});

test("captions never carry an em dash or an en dash (hard rule)", async () => {
  const { captionProblems } = await import("../lib/publishing");
  assert.deepEqual(captionProblems("Comment CLIP and I'll send you the tools. Day 2 drops tomorrow."), []);
  assert.equal(captionProblems("Two tools — both free").length, 1);
  assert.equal(captionProblems("2–3 days").length, 1);
  assert.match(captionProblems("a—b–c")[0], /em dash/);
  assert.equal(captionProblems("a—b–c").length, 2);
  assert.deepEqual(captionProblems("hyphen-ated is fine"), []);
});

test("the social plan's hand and elsewhere networks are posted by hand, not routed", () => {
  const ch = withPosting({ discord: "https://discord.gg/x", x: { handle: "@a", via: "woopsocial" }, instagram: "@a" }, { discord: "hand", x: "elsewhere", instagram: "hq" });
  assert.equal(resolveRoute("discord", ch.discord).via, "manual");
  assert.equal(resolveRoute("x", ch.x).via, "manual");
  assert.equal(resolveRoute("instagram", ch.instagram).via, "composio");
});
