import { test } from "node:test";
import assert from "node:assert/strict";

import { splitBlocks } from "../lib/markdown-blocks";

test("splits pipe tables out of markdown, keeps the rest as text, and ignores pipes inside code fences", () => {
  const md = [
    "# Title", "", "Intro.", "",
    "| A | B `x` |", "|---|---|", "| 1 | two words |", "| `a|b` | 3 |", "",
    "- [ ] todo", "- [x] done", "",
    "```bash", "echo a | grep a", "```",
  ].join("\n");
  const blocks = splitBlocks(md);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].kind, "text");
  assert.match((blocks[0] as { text: string }).text, /Intro\./);
  const t = blocks[1] as { kind: "table"; head: string[]; rows: string[][] };
  assert.equal(t.kind, "table");
  assert.deepEqual(t.head, ["A", "B `x`"]);
  assert.deepEqual(t.rows, [["1", "two words"], ["`a|b`", "3"]]);
  const rest = (blocks[2] as { text: string }).text;
  assert.match(rest, /- ☐ todo/);
  assert.match(rest, /- ☑ done/);
  assert.match(rest, /echo a \| grep a/);
});

test("a line of pipes without a separator row stays text", () => {
  assert.deepEqual(splitBlocks("| not | a table |\nnext"), [{ kind: "text", text: "| not | a table |\nnext" }]);
});
