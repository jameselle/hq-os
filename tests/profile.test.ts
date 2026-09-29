import assert from "node:assert/strict";
import { test } from "node:test";

import { activeDepartments, slugify, validateProfile } from "../lib/profile";
import { DEPARTMENTS } from "../lib/registry";
import { profile } from "./helpers";

test("a complete profile validates", () => {
  const r = validateProfile(profile());
  assert.equal(r.ok, true);
});

test("every broken field is reported, not just the first", () => {
  const r = validateProfile({ ...profile(), slug: "Bad Slug", country: "Australia", currency: "aud", model: "vibes", sites: ["acme.example"] });
  assert.equal(r.ok, false);
  if (!r.ok) {
    for (const field of ["slug", "country", "currency", "model", "sites"]) {
      assert.ok(r.errors.some((e) => e.startsWith(field)), `expected an error for ${field}`);
    }
  }
});

test("unknown regulated flags and departments are rejected", () => {
  const r = validateProfile(profile({ regulated: ["crypto" as never], departments: { skip: ["marketing"] } }));
  assert.equal(r.ok, false);
});

test("non-objects are rejected", () => {
  assert.equal(validateProfile(null).ok, false);
  assert.equal(validateProfile([]).ok, false);
  assert.equal(validateProfile("acme").ok, false);
});

test("slugify makes valid slugs", () => {
  assert.equal(slugify("Blue Harbour!"), "blue-harbour");
  assert.equal(slugify("  Acme  & Co  "), "acme-co");
  assert.equal(validateProfile(profile({ slug: slugify("Café Déjà Vu") })).ok, true);
});

test("skipped departments drop out, order is kept", () => {
  const active = activeDepartments(profile({ departments: { skip: ["people", "sales"] } }));
  assert.ok(!active.includes("people") && !active.includes("sales"));
  assert.equal(active[0], "operations");
  assert.equal(activeDepartments(null).length, DEPARTMENTS.length);
});

test("competitors: named once, sites and watched pages are URLs", () => {
  assert.equal(validateProfile(profile({ competitors: [{ name: "Rival", site: "https://rival.example", watch: ["https://rival.example/pricing"], channels: { youtube: "https://youtube.com/@rival" } }] })).ok, true);
  const r = validateProfile(profile({ competitors: [{ name: "Rival" }, { name: "rival" }, { name: "X", site: "rival.example" }, { name: "Y", watch: ["ftp://x"] }] as never }));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.some((e) => e.includes("listed twice")));
    assert.ok(r.errors.some((e) => e.startsWith("competitors[2].site")));
    assert.ok(r.errors.some((e) => e.startsWith("competitors[3].watch")));
  }
});
