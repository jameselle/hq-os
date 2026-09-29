import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { tempData, profile } from "./helpers";
import {
  initLedger,
  ledgerPath,
  listPosts,
  logPost,
  readConnections,
  saveConnections,
  doneFindings,
  latestPlan,
  listBusinesses,
  listReviews,
  readConfig,
  readReview,
  removeBusiness,
  resolveCurrent,
  saveReview,
  savePlan,
  scaffoldBusiness,
  setDone,
  stamp,
  vaultRoot,
} from "../lib/store";

test("scaffolding builds the folder, the vault and department notes, and sets the default", () => {
  const data = tempData();
  const { dir, vault } = scaffoldBusiness(profile({ departments: { skip: ["people"] } }));
  assert.ok(fs.existsSync(path.join(dir, "profile.json")));
  assert.ok(fs.existsSync(path.join(vault, "Start Here.md")));
  assert.match(fs.readFileSync(path.join(vault, "Start Here.md"), "utf8"), /# Acme Co/);
  assert.ok(fs.existsSync(path.join(vault, "Templates", "Decision.md")));
  // Obsidian's own template variables survive scaffolding
  assert.match(fs.readFileSync(path.join(vault, "Templates", "Decision.md"), "utf8"), /\{\{date\}\}/);
  assert.ok(fs.existsSync(path.join(vault, "Departments", "Content & Social", "Content & Social.md")));
  assert.ok(!fs.existsSync(path.join(vault, "Departments", "People & HR")), "skipped department gets no folder");
  assert.equal(readConfig().current, "acme-co");
  assert.equal(listBusinesses().profiles.length, 1);
  assert.ok(data);
});

test("scaffolding refuses duplicates and invalid profiles", () => {
  tempData();
  scaffoldBusiness(profile());
  assert.throws(() => scaffoldBusiness(profile()), /already exists/);
  assert.throws(() => scaffoldBusiness(profile({ slug: "Nope" })), /invalid profile/);
});

test("an existing (absolute) vault gets an HQ/ subfolder and is never deleted", () => {
  const data = tempData();
  const external = path.join(data, "my-existing-vault");
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, "Mine.md"), "keep me");
  scaffoldBusiness(profile({ vault: { path: external } }));
  assert.equal(vaultRoot(profile({ vault: { path: external } })), path.join(external, "HQ"));
  assert.ok(fs.existsSync(path.join(external, "HQ", "Start Here.md")));
  removeBusiness("acme-co");
  assert.equal(fs.readFileSync(path.join(external, "Mine.md"), "utf8"), "keep me");
});

test("reviews are saved twice (HQ history + vault note) and read newest first", () => {
  tempData();
  scaffoldBusiness(profile());
  const a = saveReview("acme-co", "**Headline:** first", new Date("2026-09-29T01:00:00Z"));
  const b = saveReview("acme-co", "**Headline:** second", new Date("2026-09-29T02:00:00Z"));
  assert.ok(fs.existsSync(a.note) && fs.existsSync(b.note));
  assert.match(fs.readFileSync(b.note, "utf8"), /^---\ntype: "ceo-review"/);
  assert.equal(listReviews("acme-co").length, 2);
  assert.match(readReview("acme-co")!.markdown, /second/);
  assert.match(readReview("acme-co", listReviews("acme-co")[1].file)!.markdown, /first/);
  assert.equal(readReview("acme-co", "../../etc/passwd"), null, "unknown file names are ignored");
});

test("filenames use the business's timezone", () => {
  // 2026-09-29 15:30 UTC is 2026-09-30 01:30 in Sydney
  assert.deepEqual(stamp(profile(), new Date("2026-09-29T15:30:00Z")), { date: "2026-09-30", time: "0130" });
});

test("plans land per department and unknown departments are refused", () => {
  tempData();
  scaffoldBusiness(profile());
  const { note } = savePlan("acme-co", "seo", "**Goal:** baseline");
  assert.match(note, /Departments\/SEO & GEO\/Plans\//);
  assert.match(latestPlan("acme-co", "seo")!.markdown, /baseline/);
  assert.throws(() => savePlan("acme-co", "marketing", "x"), /no such department/);
});

test("done: business findings are per business, machine findings are shared", () => {
  tempData();
  scaffoldBusiness(profile());
  scaffoldBusiness(profile({ slug: "beta-co", name: "Beta Co" }));
  setDone("acme-co", "connect-channels", true);
  setDone("acme-co", "hf-telemetry", true);
  assert.ok(doneFindings("acme-co")["connect-channels"]);
  assert.ok(!doneFindings("beta-co")["connect-channels"]);
  assert.ok(doneFindings("beta-co")["hf-telemetry"], "machine-wide finding applies to every business");
  setDone("acme-co", "connect-channels", false);
  assert.ok(!doneFindings("acme-co")["connect-channels"]);
  assert.throws(() => setDone("acme-co", "../x", true), /bad finding id/);
});

test("resolveCurrent prefers an explicit choice, then config, then the first", () => {
  tempData();
  scaffoldBusiness(profile());
  scaffoldBusiness(profile({ slug: "beta-co", name: "Beta Co" }));
  assert.equal(resolveCurrent("beta-co")?.slug, "beta-co");
  assert.equal(resolveCurrent("nope")?.slug, "acme-co");
  assert.equal(resolveCurrent(null)?.slug, "acme-co");
});

test("an invalid profile on disk is reported, not crashed on", () => {
  const data = tempData();
  fs.mkdirSync(path.join(data, "businesses", "broken"), { recursive: true });
  fs.writeFileSync(path.join(data, "businesses", "broken", "profile.json"), '{"slug":"broken"}');
  const { profiles, invalid } = listBusinesses();
  assert.equal(profiles.length, 0);
  assert.equal(invalid[0].slug, "broken");
});

test("connection snapshots round-trip and refuse secrets", () => {
  tempData();
  assert.equal(readConnections(), null);
  saveConnections({ checkedAt: new Date().toISOString(), toolkits: { youtube: { status: "active", accounts: [{ id: "youtube_x", status: "ACTIVE" }] } } });
  assert.equal(readConnections()?.toolkits.youtube.accounts[0].id, "youtube_x");
  assert.throws(() => saveConnections({ checkedAt: new Date().toISOString(), toolkits: { x: { status: "active", accounts: [{ id: "a", status: "ACTIVE", token: "t" }] } } }), /credentials/);
});

test("published posts are logged newest first, with a vault note; a 'published' post needs proof", () => {
  tempData();
  scaffoldBusiness(profile());
  const { note } = logPost("acme-co", { at: "2026-09-29T01:00:00Z", platform: "instagram", via: "composio", status: "published", url: "https://instagram.com/p/abc", caption: "Hello" });
  logPost("acme-co", { at: "2026-09-29T02:00:00Z", platform: "tiktok", via: "woopsocial", status: "scheduled" });
  assert.match(fs.readFileSync(note, "utf8"), /\*\*Live:\*\* https:\/\/instagram.com\/p\/abc/);
  assert.match(note, /Content & Social\/Published\//);
  assert.equal(listPosts("acme-co")[0].platform, "tiktok");
  assert.throws(() => logPost("acme-co", { at: "", platform: "x", via: "composio", status: "published" }), /read back/);
});

test("every new business gets a ledger in its own currency, and it's never overwritten", () => {
  tempData();
  scaffoldBusiness(profile({ currency: "NZD" }));
  const file = ledgerPath("acme-co");
  const text = fs.readFileSync(file, "utf8");
  assert.match(text, /option "operating_currency" "NZD"/);
  assert.match(text, /2026-09-29 open Assets:Bank:Operating NZD/);
  fs.appendFileSync(file, "\n; my own entry\n");
  initLedger(profile({ currency: "NZD" }));
  assert.match(fs.readFileSync(file, "utf8"), /my own entry/);
});
