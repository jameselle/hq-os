import { test } from "node:test";
import assert from "node:assert/strict";

import { FLOW_COUNTED, FLOW_RHYTHM, FLOW_STATUSES, FLOW_STEPS } from "../lib/campaign-flow";

test("the campaign flow has eight complete steps, each with who, where and done-when", () => {
  assert.equal(FLOW_STEPS.length, 8);
  for (const s of FLOW_STEPS) {
    assert.ok(s.who.length && s.points.length && s.where.length && s.done, s.title);
    for (const w of s.where) if (w.href) assert.match(w.href, /^\/[a-z/]*$/, `${s.title}: ${w.href}`);
  }
});

test("the flow copy has no em or en dashes", () => {
  const text = JSON.stringify({ FLOW_STEPS, FLOW_COUNTED, FLOW_RHYTHM, FLOW_STATUSES });
  assert.doesNotMatch(text, /[–—]/);
});
