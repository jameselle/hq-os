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
