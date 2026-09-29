import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { DEPARTMENTS, EXCLUDED } from "../lib/registry";
import { nameRegex, privateNames } from "./helpers";

test("department slugs are unique and URL-safe", () => {
  const slugs = DEPARTMENTS.map((d) => d.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of slugs) assert.match(s, /^[a-z]+$/);
  assert.ok(!slugs.includes("ceo") && !slugs.includes("api"), "would clash with a route");
});

test("every tool has a licence kind, a repo or URL, and a note when it isn't open source", () => {
  for (const d of DEPARTMENTS) {
    for (const t of d.tools) {
      assert.ok(["oss", "open-core", "free", "own"].includes(t.licence.kind), `${t.name}: licence kind`);
      assert.ok(/^[\w.-]+\/[\w.-]+$/.test(t.repo) || t.repo.startsWith("https://"), `${t.name}: repo`);
    }
  }
});

test("skill ids look like invocations", () => {
  for (const d of DEPARTMENTS) for (const s of d.skills) assert.match(s.id, /^[a-z0-9-]+(:[a-z0-9-]+)?$/, s.id);
});

test("the framework never names a real business", (t) => {
  const re = nameRegex(privateNames());
  if (!re) return t.skip("no .private-names and no connected businesses on this machine");
  const root = path.resolve(__dirname, "..");
  const files = ["lib", "app", "components", "scripts", "plugin", "templates"].flatMap((d) => walk(path.join(root, d)));
  files.push(path.join(root, "README.md"), path.join(root, "CLAUDE.md"));
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, "utf8"), re, path.relative(root, f));
  assert.ok(EXCLUDED.length > 0);
});

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx|md|json)$/.test(e.name) ? [path.join(dir, e.name)] : [],
  );
}
