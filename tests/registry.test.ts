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
  const files = ["lib", "app", "components", "scripts", "plugin", "templates", "tests", "docs", "e2e"].flatMap((d) => walk(path.join(root, d)));
  files.push(path.join(root, "README.md"), path.join(root, "CLAUDE.md"));
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, "utf8"), re, path.relative(root, f));
  assert.ok(EXCLUDED.length > 0);
});

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx|mjs|js|md|json)$/.test(e.name) ? [path.join(dir, e.name)] : [],
  );
}

test("no private scorecard files are tracked", async () => {
  const { execFileSync } = await import("node:child_process");
  const { privateScorecardLeaks } = await import("./helpers");
  const root = path.resolve(__dirname, "..");
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const entries = tracked.map((file) => {
    const full = path.join(root, file);
    const text = fs.existsSync(full) && fs.statSync(full).size < 2_000_000 && /\.(m?[jt]sx?|cjs|json|md|sh|py|sql|ya?ml|toml|txt|html|css)$/.test(file) ? fs.readFileSync(full, "utf8") : "";
    return { file, text };
  });
  assert.deepEqual(privateScorecardLeaks(entries), []);
});

test("the private-file guard catches adapters by content as well as by name", async () => {
  const { privateScorecardLeaks } = await import("./helpers");
  // Built at run time so this file never holds a real-looking endpoint or key itself.
  const jwt = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJyb2xlIjoiYW5vbiIsInJlZiI6Inh5eiJ9", "abcdefghijklmnopqrstuvwxyz012345"].join(".");
  const rpc = "https://abcdefghijklmnopqrst." + "supabase.co/rest/v1/" + "rpc/report";
  const stripe = ["rk", "live", "51Habcdefghijk"].join("_");
  const leaks = privateScorecardLeaks([
    { file: "scripts/acme-report.ts", text: `await fetch('${rpc}')` },
    { file: "lib/thing.ts", text: `const key = '${jwt}'` },
    { file: "scripts/pay.mjs", text: `const k = '${stripe}'` },
    { file: "lib/x-adapter.ts", text: "export {}" },
    { file: "lib/private-adapter.ts", text: "export {}" },
    { file: "tests/records-adapter.test.ts", text: "export {}" },
    { file: "tests/leaky.test.ts", text: `const k = '${stripe}'` },
    { file: "data/scorecard/2026-W40.json", text: "{}" },
    { file: "templates/scorecard/demo-adapter.mjs", text: "export {}" },
    { file: "tests/scorecard.test.ts", text: "'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc'" },
    { file: "docs/guides/scorecard.md", text: "scorecard-connection.json is never tracked" },
  ]);
  assert.deepEqual(leaks.sort(), ["data/scorecard/2026-W40.json", "lib/thing.ts", "lib/x-adapter.ts", "scripts/acme-report.ts", "scripts/pay.mjs", "tests/leaky.test.ts"]);
});

test("every Redis HQ starts binds to 127.0.0.1", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "..", "scripts/hq.ts"), "utf8");
  const redis = src.split("\n").filter((l) => l.includes('"redis-server"'));
  assert.ok(redis.length >= 2);
  for (const line of redis) assert.match(line, /"--bind", "127\.0\.0\.1"/, line.trim());
});
