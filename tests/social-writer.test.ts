// The weekly writer's prompt with and without the owner's own Instagram skills (ig-repurpose, ig-carousel,
// ig-human): present, they're appended under HQ's rules; absent, the prompt is exactly HQ's own. The run itself is
// a fake Claude Code binary that records the prompt it was given, so no model is called. Demo business only.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { tempData, profile } from "./helpers";
import { CRAFT_SKILLS, socialPrompt } from "../lib/social-writer";
import { CRAFT_CAP, readUserSkills, stripFrontmatter } from "../lib/user-skills";

const SKILL = "---\nname: social\ndescription: test\n---\n\n# Social: the week's posts\n\nWrite the drafts.";
const skillFile = (name: string, body: string) => `---\nname: ${name}\ndescription: >-\n  A test skill.\n---\n\n# ${name}\n\n${body}\n`;

function fakeHome(names: string[], body = (n: string) => `How ${n} works.`): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "hq-home-"));
  for (const n of names) {
    fs.mkdirSync(path.join(home, ".claude", "skills", n), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "skills", n, "SKILL.md"), skillFile(n, body(n)));
  }
  return home;
}

test("frontmatter comes off, the body stays", () => {
  assert.equal(stripFrontmatter(skillFile("ig-human", "Rules.")), "# ig-human\n\nRules.");
  assert.equal(stripFrontmatter("# No frontmatter\n\nText"), "# No frontmatter\n\nText");
});

test("skills absent: the prompt is HQ's own, unchanged", () => {
  const home = fakeHome([]);
  const craft = readUserSkills(CRAFT_SKILLS, home);
  assert.deepEqual(craft, []);
  const p = socialPrompt({ skill: SKILL, research: "/r", out: "/o", craft });
  assert.equal(p, socialPrompt({ skill: SKILL, research: "/r", out: "/o" }));
  assert.doesNotMatch(p, /Craft guidance|ig-repurpose|ig-carousel|ig-human/);
  assert.match(p, /^# Social: the week's posts/);
  assert.match(p, /Read \/r\/inputs\.json first/);
  assert.match(p, /JSON file in \/o\//);
});

test("skills present: appended after HQ's run instructions, under a header that says HQ wins", () => {
  const home = fakeHome([...CRAFT_SKILLS, "ig-reel"]);
  const craft = readUserSkills(CRAFT_SKILLS, home);
  assert.deepEqual(craft.map((s) => s.name), ["ig-repurpose", "ig-carousel", "ig-human"]);
  const p = socialPrompt({ skill: SKILL, research: "/r", out: "/o", craft });
  const at = p.indexOf("## Craft guidance from the owner's Instagram skills");
  assert.ok(at > p.indexOf("## This run"), "guidance comes after HQ's own instructions");
  const g = p.slice(at);
  assert.match(g, /HQ wins\.\*\* The draft JSON format, HQ's checks, the regulated rules, the never-name list and the channel plan/);
  assert.match(g, /No HTML, PNG or PDF files, nothing written to ~\/\.claude\/instagram/);
  assert.match(g, /no scripts, and no other skills/);
  assert.match(g, /One blog post can yield several drafts/);
  assert.match(g, /never "as I said in my latest post"/);
  assert.match(g, /cover hook \(`cover`.*stake.*recap slide.*one call to action \(`cta`/s);
  assert.match(g, /ig-human:\*\* apply its rules to every caption/);
  for (const n of CRAFT_SKILLS) assert.match(g, new RegExp(`### ${n}\\n\\n# ${n}\\n\\nHow ${n} works\\.`));
  assert.doesNotMatch(g, /name: ig-|description:/, "frontmatter stripped");
  assert.doesNotMatch(g, /ig-reel works/, "only the named skills are read");
});

test("only the skills that are installed get a line, and a long skill is capped", () => {
  const home = fakeHome(["ig-human"], () => "x".repeat(CRAFT_CAP * 2));
  const craft = readUserSkills(CRAFT_SKILLS, home);
  assert.deepEqual(craft.map((s) => s.name), ["ig-human"]);
  assert.ok(craft[0].body.length < CRAFT_CAP + 100);
  assert.match(craft[0].body, /cut here: the rest of ig-human is left out/);
  const p = socialPrompt({ skill: SKILL, research: "/r", out: "/o", craft });
  assert.match(p, /ig-human:\*\*/);
  assert.doesNotMatch(p, /ig-repurpose:\*\*|ig-carousel:\*\*/);
});

// ---------------------------------------------------------------- the run, with a fake Claude Code

async function runWeek(skills: string[]) {
  const data = tempData();
  const home = fakeHome(skills);
  const p = profile({ slug: "demo-coffee", name: "Demo Coffee", sites: ["https://coffee.example"] });
  const dir = path.join(data, "businesses", p.slug);
  fs.mkdirSync(path.join(dir, p.vault.path, "Departments", "Content & Social"), { recursive: true });
  fs.writeFileSync(path.join(dir, "profile.json"), JSON.stringify(p));
  fs.writeFileSync(path.join(dir, p.vault.path, "Departments", "Content & Social", "Channel plan.md"), "# Channel plan\n\nInstagram: carousels on Tuesday.");
  const { writeSocialConfig, socialDir } = await import("../lib/social-store");
  writeSocialConfig(p.slug, { mode: "draft", networks: { instagram: { posting: "hand" } } });
  // The fake records the prompt it was given and writes no drafts.
  const bin = path.join(data, "fake-claude.sh"), seen = path.join(data, "prompt.txt");
  fs.writeFileSync(bin, `#!/bin/sh\nprintf '%s' "$2" > "${seen}"\necho '{"result":"no drafts","total_cost_usd":0}'\n`, { mode: 0o755 });
  const env = { CLAUDE_BIN: process.env.CLAUDE_BIN, HOME: process.env.HOME };
  process.env.CLAUDE_BIN = bin; process.env.HOME = home;
  try {
    const { writeWeek } = await import("../lib/social-writer");
    const r = await writeWeek(p.slug, "2026-W42", ["2026-10-13"], 30e3);
    const log = fs.readFileSync(path.join(socialDir(p.slug), "log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    return { r, prompt: fs.readFileSync(seen, "utf8"), writing: log.find((e) => e.event === "writing") };
  } finally {
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

test("writeWeek passes the skills to Claude and logs which it used", async () => {
  const { r, prompt, writing } = await runWeek([...CRAFT_SKILLS]);
  assert.equal(r.ok, false, "the fake writes no drafts");
  assert.match(prompt, /## Craft guidance from the owner's Instagram skills/);
  assert.match(prompt, /### ig-carousel/);
  assert.deepEqual(writing.craft, ["ig-repurpose", "ig-carousel", "ig-human"]);
});

test("writeWeek without the skills: no guidance in the prompt, an empty list in the log", async () => {
  const { prompt, writing } = await runWeek([]);
  assert.match(prompt, /## This run/);
  assert.doesNotMatch(prompt, /## Craft guidance from the owner's Instagram skills|### ig-/);
  assert.deepEqual(writing.craft, []);
});
