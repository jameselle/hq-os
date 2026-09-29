import assert from "node:assert/strict";
import { test } from "node:test";

import { competitorFromTitle, competitorNoteHead, recentChanges, shortUrl, watchTag, watchTargets } from "../lib/competitors";
import { profile } from "./helpers";

test("watch targets: explicit pages, else the homepage; duplicates once; content-only competitors watch nothing", () => {
  const p = profile({
    competitors: [
      { name: "A", site: "https://a.example", watch: ["https://a.example/pricing", "https://a.example/pricing"] },
      { name: "B", site: "https://b.example" },
      { name: "C", channels: { youtube: "https://youtube.com/@c" } },
    ],
  });
  assert.deepEqual(watchTargets(p).map((t) => t.url), ["https://a.example/pricing", "https://b.example"]);
  assert.equal(watchTargets(p)[0].title, "A: a.example/pricing");
});

test("tags keep businesses apart; titles map back to competitors", () => {
  assert.equal(watchTag("acme-co"), "hq-acme-co");
  const p = profile({ competitors: [{ name: "Rival" }] });
  assert.equal(competitorFromTitle("Rival: rival.example/x", p), "Rival");
  assert.equal(competitorFromTitle(undefined, p), "unknown");
});

test("recent changes use a rolling window", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const rows = [
    { uuid: "1", competitor: "A", url: "u", lastChanged: "2026-09-29T00:00:00Z", lastChecked: null, error: null },
    { uuid: "2", competitor: "A", url: "v", lastChanged: "2026-09-01T00:00:00Z", lastChecked: null, error: null },
    { uuid: "3", competitor: "A", url: "w", lastChanged: null, lastChecked: null, error: null },
  ];
  assert.deepEqual(recentChanges(rows, 7, now).map((r) => r.uuid), ["1"]);
});

test("the vault note head names channels and watched pages", () => {
  const p = profile();
  const head = competitorNoteHead(p, { name: "Rival", site: "https://rival.example", channels: { tiktok: "@rival" }, watch: ["https://rival.example/p"] });
  assert.match(head, /type: "competitor"/);
  assert.match(head, /\*\*tiktok:\*\* @rival/);
  assert.match(head, /## Log/);
  assert.equal(shortUrl("https://www.rival.example/p/"), "rival.example/p");
});
