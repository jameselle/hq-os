import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(__dirname, "..");

test("hq lifecycle: show, explain, approve (dry run, then exactly what was seen), test, mode", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-lifecycle-cli-"));
  try {
    const biz = path.join(dir, "businesses", "demo");
    fs.mkdirSync(biz, { recursive: true });
    fs.writeFileSync(path.join(biz, "profile.json"), JSON.stringify({ slug: "demo", name: "Demo Co", country: "AU", currency: "AUD", timezone: "Australia/Sydney", offer: "Example", audience: "Example", model: "services", sites: [], channels: {}, regulated: [], vault: { path: "vault" }, createdAt: "2026-01-01" }));
    fs.writeFileSync(path.join(biz, "lifecycle-connection.json"), JSON.stringify({ command: [process.execPath, path.join(root, "templates/lifecycle/lifecycle-template.mjs"), path.join(dir, "state.json")] }));
    const hq = (...a: string[]) => {
      const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/hq.ts", "lifecycle", ...a], { cwd: root, encoding: "utf8", env: { ...process.env, HQ_DATA: dir } });
      return { out: r.stdout + r.stderr, code: r.status };
    };
    const show = hq("show", "demo");
    assert.equal(show.code, 0, show.out);
    assert.match(show.out, /Needs you:\n {2}Getting-started emails: \d+ drafts? waiting for your yes, first expiry/);
    assert.match(show.out, /Working\? .+\n {2}Waiting\? .+\n {2}Next\? {4}.+/);
    assert.doesNotMatch(show.out, /[–—]|n\/a/);
    assert.match(hq("explain", "demo", "abandoned-checkout-recovery").out, /^Abandoned checkout \(Demo Co\)\nFlow id: checkout\./, "a workflow slug finds its flow");

    const dry = hq("approve", "demo", "onboarding-day-0");
    assert.match(dry.out, /Nothing was sent\. To send exactly these \d+ after the owner's yes:\n {2}npm run hq -- lifecycle approve demo onboarding-day-0 --yes --before (\S+)/);
    const before = /--before (\S+)/.exec(dry.out)![1];
    assert.match(hq("approve", "demo", "onboarding-day-0", "--yes").out, /--yes needs --before/);
    assert.match(hq("approve", "demo", "onboarding-day-0", "--yes", "--before", before).out, /Approved "Your account is ready" \(onboarding-day-0\).+Still waiting: 0\./);
    assert.match(hq("approve", "demo", "onboarding").out, /"onboarding" is a flow; name one of its messages: onboarding-day-0, onboarding-day-2/);

    assert.match(hq("test", "demo", "checkout").out, /for the owner only\. No customer gets it\./);
    assert.match(hq("mode", "demo", "checkout", "auto").out, /^Not changed\./);
    assert.match(hq("mode", "demo", "checkout", "auto", "--yes").out, /Abandoned checkout is now auto\./);
    assert.match(hq("mode", "demo", "checkout", "off").out, /is now off\./);
    assert.equal(hq("show", "nobody").code, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
