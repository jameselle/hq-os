import assert from "node:assert/strict";
import { test } from "node:test";

import { departmentNotes } from "../lib/regulations";
import { profile } from "./helpers";

test("an unregulated business gets no notes", () => {
  assert.deepEqual(departmentNotes(profile(), "ads"), []);
  assert.deepEqual(departmentNotes(null, "ads"), []);
});

test("gambling adds generic and Australian notes to ads and legal", () => {
  const p = profile({ regulated: ["gambling"] });
  assert.ok(departmentNotes(p, "ads").some((n) => n.includes("certified")));
  assert.ok(departmentNotes(p, "legal").some((n) => n.includes("Interactive Gambling Act")));
});

test("country-specific notes only apply in that country", () => {
  const us = profile({ regulated: ["gambling"], country: "US" });
  assert.ok(!departmentNotes(us, "legal").some((n) => n.includes("Australia")));
});

test("profile notes are appended after regulation notes", () => {
  const p = profile({ regulated: ["kids"], departments: { notes: { content: ["Film on Tuesdays"] } } });
  const notes = departmentNotes(p, "content");
  assert.equal(notes.at(-1), "Film on Tuesdays");
  assert.ok(notes.some((n) => n.includes("made for kids")));
});
