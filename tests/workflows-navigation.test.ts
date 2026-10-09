import { test } from "node:test";
import assert from "node:assert/strict";

import { WORKFLOW_TABS, WORKFLOW_TAB_LABELS, workflowsTab, workflowsTabUrl } from "../lib/workflows-navigation";

test("every workflows tab has a label and round-trips", () => {
  for (const tab of WORKFLOW_TABS) {
    assert.equal(workflowsTab(tab), tab);
    assert.ok(WORKFLOW_TAB_LABELS[tab]);
  }
});

test("unknown workflows tabs fall back to running now", () => {
  for (const value of [undefined, null, "", "missing", "../web", ["all"]]) assert.equal(workflowsTab(value), "running");
});

test("workflows tab links encode the department filter", () => {
  assert.equal(workflowsTabUrl("all"), "/workflows?tab=all");
  assert.equal(workflowsTabUrl("all", "content"), "/workflows?tab=all&dept=content");
  assert.equal(workflowsTabUrl("all", "a&tab=web"), "/workflows?tab=all&dept=a%26tab%3Dweb");
});
