import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { builtDepartments } from "../lib/built";
import { businessDir, ledgerPath, scaffoldBusiness } from "../lib/store";
import { profile, tempData } from "./helpers";

test("a department is built out only with evidence for that business", () => {
  tempData();
  const p = profile({ competitors: [{ name: "Rival", site: "https://rival.example", watch: ["https://rival.example/pricing"] }, { name: "Instagram only" }] });
  scaffoldBusiness(p);
  const before = builtDepartments(p.slug);
  assert.equal(before.content, undefined);
  assert.equal(before.finance, undefined);
  assert.equal(before.email, undefined);
  assert.equal(before.competitors, "1 rival watched", "only rivals with pages to watch count");
  fs.writeFileSync(path.join(businessDir(p.slug), "published.jsonl"), JSON.stringify({ at: "2026-10-05T00:00:00Z", platform: "instagram", via: "composio", status: "published", url: "https://example.com/p/1" }) + "\n" + JSON.stringify({ at: "2026-10-05T00:00:00Z", platform: "x", via: "woopsocial", status: "failed" }) + "\n");
  fs.appendFileSync(ledgerPath(p.slug), '\n2026-10-01 * "Ad"\n  Expenses:Advertising  10.00 AUD\n  Assets:Bank\n');
  const after = builtDepartments(p.slug);
  assert.equal(after.content, "1 post published from HQ", "failed posts don't count");
  assert.equal(after.finance, "1 ledger entry");
  assert.deepEqual(builtDepartments("nobody"), {});
});

test("a department that owns a live workflow is built out, a partial one isn't", () => {
  tempData();
  const p = profile({});
  scaffoldBusiness(p);
  const dir = path.join(businessDir(p.slug), "blog", "drafts");
  fs.mkdirSync(dir, { recursive: true });
  assert.equal(builtDepartments(p.slug).seo, undefined);
  fs.writeFileSync(path.join(dir, "2026-10-06-demo.md"), `---\n${JSON.stringify({ title: "Demo post", slug: "demo", description: "A demo.", keyword: "demo", date: "2026-10-06", status: "published", url: "https://demo.example/blog/demo/", publishedAt: "2026-10-06T00:00:00Z" })}\n---\nBody.\n`);
  assert.match(builtDepartments(p.slug).seo ?? "", /^1 workflow live: Daily blog from search demand$/);
});

test("Sales & Partnerships is built out once shortlisted partners have outreach ready; avoid-only or empty stays dimmed", async () => {
  tempData();
  const p = profile({});
  scaffoldBusiness(p);
  const { addPartners } = await import("../lib/partner-store");
  assert.equal(builtDepartments(p.slug).sales, undefined, "no partners");
  const base = { platform: "instagram", url: "https://www.instagram.com/demo.brew.tips/", country: "AU", type: "creator", followers: null,
    fit: { level: "high", reason: "Home brewing guides" }, contact: { route: "dm" } };
  addPartners(p.slug, [{ ...base, name: "Avoided", handle: "@demo.avoid", url: "https://www.instagram.com/demo.avoid/", compliance: { status: "avoid", notes: "Fake engagement" } }] as never);
  assert.equal(builtDepartments(p.slug).sales, undefined, "avoid partners don't count");
  addPartners(p.slug, [{ ...base, name: "Demo Brew Tips", handle: "@demo.brew.tips", compliance: { status: "ok", notes: "" }, status: "shortlisted",
    drafts: [{ channel: "dm", body: "Hi, would you like to partner on our cold brew month?" }] }] as never);
  assert.match(builtDepartments(p.slug).sales ?? "", /2 partners in the pipeline, 1 shortlisted or further, 1 outreach draft ready/);
});
