import assert from "node:assert/strict";
import { test } from "node:test";

import { launchdRunning } from "../lib/launchd";

test("a launchd job counts as running only when launchctl says so", () => {
  assert.equal(launchdRunning("gui/501/com.example.job = {\n\tactive count = 1\n\tstate = running\n\tpid = 123\n}"), true);
  assert.equal(launchdRunning("gui/501/com.example.job = {\n\tstate = not running\n\tlast exit code = 1\n}"), false);
  assert.equal(launchdRunning(""), false, "launchctl prints nothing for a job it doesn't know");
});
