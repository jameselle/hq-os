import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

test("hq help lists every command group, through to Health", () => {
  const root = path.resolve(__dirname, "..");
  const out = spawnSync(process.execPath, ["--import", "tsx", "scripts/hq.ts", "help"], { cwd: root, encoding: "utf8" }).stdout;
  for (const group of ["Businesses", "Backups", "Services", "Competitors", "Tools", "Experiments", "Health"]) assert.match(out, new RegExp(`^${group}\\b`, "m"), group);
  assert.match(out, /experiment add <slug>/);
  assert.match(out, /doctor/);
});
