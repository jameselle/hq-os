import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { tempData } from "./helpers";
import { excludedFromBackup, realRun, resticExcludeArgs, stageServiceData, type StageOps } from "../lib/backup";

/** Fake launchd: records every call, and "stops" a service by deleting its lock file. */
function fakeOps(over: Partial<StageOps> & { loaded?: boolean; lock?: string } = {}) {
  const calls: string[] = [];
  let loaded = over.loaded ?? true;
  const ops: StageOps = {
    isLoaded: () => loaded,
    unload: (label) => {
      calls.push(`unload ${label}`);
    },
    waitUnloaded: (label) => {
      calls.push(`wait ${label}`);
      loaded = false;
      if (over.lock) fs.rmSync(over.lock, { force: true });
      return true;
    },
    start: (label) => {
      calls.push(`start ${label}`);
      loaded = true;
    },
    run: (cmd) => {
      calls.push(`run ${path.basename(cmd[0])}`);
      return (over.run ?? realRun)(cmd);
    },
    ...Object.fromEntries(Object.entries(over).filter(([k]) => !["loaded", "lock", "run"].includes(k))),
  };
  return { ops, calls };
}

function liveDir(data: string) {
  const src = path.join(data, "live", "pg");
  fs.mkdirSync(path.join(src, "base"), { recursive: true });
  fs.writeFileSync(path.join(src, "PG_VERSION"), "17\n");
  fs.writeFileSync(path.join(src, "base", "1"), "rows");
  fs.writeFileSync(path.join(src, "postmaster.pid"), "123\n");
  return src;
}

test("cold copy: unload, fast stop, wait, copy, start — in that order", () => {
  const data = tempData();
  const src = liveDir(data);
  const { ops, calls } = fakeOps({ lock: path.join(src, "postmaster.pid") });
  const [r] = stageServiceData([{ label: "com.hq.pg", backup: { cold: src, lock: "postmaster.pid", fastStop: ["/bin/echo", "fast"] } }], ops);
  assert.equal(r.ok, true, r.detail);
  assert.deepEqual(calls, ["unload com.hq.pg", "run echo", "wait com.hq.pg", "run cp", "start com.hq.pg"]);
  const staged = path.join(data, "service-data", "com.hq.pg");
  assert.equal(fs.readFileSync(path.join(staged, "base", "1"), "utf8"), "rows");
  assert.ok(!fs.existsSync(path.join(staged, "postmaster.pid")));
});

test("cold copy of a stopped service copies without touching launchd", () => {
  const data = tempData();
  const src = liveDir(data);
  fs.rmSync(path.join(src, "postmaster.pid"));
  const { ops, calls } = fakeOps({ loaded: false });
  const [r] = stageServiceData([{ label: "com.hq.pg", backup: { cold: src, lock: "postmaster.pid" } }], ops);
  assert.equal(r.ok, true, r.detail);
  assert.deepEqual(calls, ["run cp"]);
});

test("cold copy refuses when the lock file survives the stop, and still restarts the service", () => {
  const data = tempData();
  const src = liveDir(data);
  const { ops, calls } = fakeOps(); // no lock removal: the stop was not clean
  const [r] = stageServiceData([{ label: "com.hq.pg", backup: { cold: src, lock: "postmaster.pid" } }], ops);
  assert.equal(r.ok, false);
  assert.match(r.detail, /postmaster\.pid/);
  assert.ok(!calls.includes("run cp"), "no copy of an unclean data dir");
  assert.equal(calls.at(-1), "start com.hq.pg");
  assert.ok(!fs.existsSync(path.join(data, "service-data", "com.hq.pg")));
});

test("cold copy restarts the service even when the copy fails, and keeps the last good copy", () => {
  const data = tempData();
  const src = liveDir(data);
  const staged = path.join(data, "service-data", "com.hq.pg");
  fs.mkdirSync(staged, { recursive: true });
  fs.writeFileSync(path.join(staged, "PG_VERSION"), "last good\n");
  const { ops, calls } = fakeOps({
    lock: path.join(src, "postmaster.pid"),
    run: (cmd) => (path.basename(cmd[0]) === "cp" ? { ok: false, err: "disk full" } : realRun(cmd)),
  });
  const [r] = stageServiceData([{ label: "com.hq.pg", backup: { cold: src, lock: "postmaster.pid" } }], ops);
  assert.equal(r.ok, false);
  assert.match(r.detail, /disk full/);
  assert.equal(calls.at(-1), "start com.hq.pg");
  assert.equal(fs.readFileSync(path.join(staged, "PG_VERSION"), "utf8"), "last good\n");
});

test("cold copy reports a service that will not unload, and does not copy", () => {
  const data = tempData();
  const src = liveDir(data);
  const { ops, calls } = fakeOps({ waitUnloaded: () => false });
  const [r] = stageServiceData([{ label: "com.hq.pg", backup: { cold: src } }], ops);
  assert.equal(r.ok, false);
  assert.match(r.detail, /still running/);
  assert.ok(!calls.includes("run cp"));
  assert.equal(calls.at(-1), "start com.hq.pg");
});

test("sqlite: a consistent copy is readable; a missing database is skipped, not an error", () => {
  const data = tempData();
  const db = path.join(data, "kuma", "kuma.db");
  fs.mkdirSync(path.dirname(db), { recursive: true });
  spawnSync("/usr/bin/sqlite3", [db, "pragma journal_mode=wal; create table m(name text); insert into m values ('site');"]);
  const { ops } = fakeOps();
  const results = stageServiceData(
    [
      { label: "com.hq.kuma", backup: { sqlite: db } },
      { label: "com.hq.other", backup: { sqlite: path.join(data, "nope", "x.db") } },
      { label: "com.hq.web" },
    ],
    ops,
  );
  assert.equal(results.length, 2, "services without a backup spec are ignored");
  assert.equal(results[0].ok, true, results[0].detail);
  const copy = path.join(data, "service-data", "com.hq.kuma", "kuma.db");
  assert.equal(spawnSync("/usr/bin/sqlite3", [copy, "select name from m"], { encoding: "utf8" }).stdout.trim(), "site");
  assert.equal(results[1].ok, true);
  assert.equal(results[1].skipped, true);
});

test("the restore test skips exactly what the backup excludes", () => {
  const data = "/Users/x/hq-data";
  for (const f of [
    "/Users/x/hq-data/businesses/a/studio/2026-09-30-x/source.mp4",
    "/Users/x/hq-data/businesses/a/studio/2026-09-30-x/clips/1/out.mp4",
    "/Users/x/hq-data/businesses/a/studio/2026-09-30-x/talk.aiff",
    "/Users/x/hq-data/businesses/a/studio/2026-09-30-x/voice.wav",
    "/Users/x/hq-data/notes.tmp",
    "/Users/x/hq-data/.DS_Store",
    "/Users/x/hq-data/logs/com.hq.web.log",
    "/Users/x/hq-data/businesses/a/hypit/node_modules/@hypit/hypit/package.json",
    "/Users/x/hq-data/businesses/a/hypit/packages/scene/node_modules/tsx/dist/cli.mjs",
  ])
    assert.equal(excludedFromBackup(f, data), true, f);
  for (const f of [
    "/Users/x/hq-data/businesses/a/studio/2026-09-30-x/job.json",
    "/Users/x/hq-data/businesses/a/studio/2026-09-30-x/captions.ass",
    "/Users/x/hq-data/businesses/a/vault/Clips/source.mp4",
    "/Users/x/hq-data/service-data/com.hq.postiz.postgres/base/1",
  ])
    assert.equal(excludedFromBackup(f, data), false, f);
  // every exclude is passed to restic
  const args = resticExcludeArgs(data);
  assert.ok(args.includes("*/studio/**/*.mp4") && args.includes(path.join(data, "logs")) && args.includes("node_modules"));
});
