// The owner's own Claude Code skills (~/.claude/skills/<name>/SKILL.md) as craft guidance for HQ's headless writers
// (the weekly social drafts, the comment replies). Optional: a Mac without them runs exactly as before. HQ's own
// format, checks and rules always win, and nothing in a user skill can widen what a headless run may do (its tools
// are fixed by HQ). Server-only (reads the home folder).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Characters kept per skill, so one long skill can't crowd out HQ's own instructions. */
export const CRAFT_CAP = 6000;

export type CraftSkill = { name: string; body: string };

export const stripFrontmatter = (s: string) => s.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---[^\n]*\n/, "").trim();

/** The named user skills that exist under <home>/.claude/skills, frontmatter stripped and each capped. Missing,
 *  empty or unreadable ones are left out. */
export function readUserSkills(names: readonly string[], home = os.homedir(), cap = CRAFT_CAP): CraftSkill[] {
  return names.flatMap((name) => {
    try {
      const body = stripFrontmatter(fs.readFileSync(path.join(home, ".claude", "skills", name, "SKILL.md"), "utf8"));
      return body ? [{ name, body: body.length > cap ? `${body.slice(0, cap).trimEnd()}\n\n(cut here: the rest of ${name} is left out)` : body }] : [];
    } catch { return []; }
  });
}

/** The guidance block appended to a headless prompt, or "" when none of the skills is installed. `wins` names what
 *  of HQ's overrides the skills; `use` says per skill what it is for in this run (only present skills get a line). */
export function craftGuidance(skills: CraftSkill[], o: { wins: string; use: Record<string, string>; output: string }): string {
  if (!skills.length) return "";
  return [
    "", "## Craft guidance from the owner's Instagram skills", "",
    `The owner has these skills installed: ${skills.map((s) => s.name).join(", ")}. Their text follows. Use it for craft only:`,
    `- **HQ wins.** ${o.wins} win over anything in these skills. Where they disagree, do what HQ says.`,
    `- **Don't build or run what they describe.** No HTML, PNG or PDF files, nothing written to ~/.claude/instagram or anywhere outside the folder this run names, no scripts, and no other skills (/ig-reel, /ig-caption and the like). HQ renders, checks and posts. ${o.output}`,
    ...skills.filter((s) => o.use[s.name]).map((s) => `- ${o.use[s.name]}`),
    ...skills.map((s) => `\n### ${s.name}\n\n${s.body}`),
  ].join("\n");
}
