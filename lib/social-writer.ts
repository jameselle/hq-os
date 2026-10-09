// The weekly social plan's writing step: gathers the business's inputs (its channel plan, the week's published blog
// posts, last weeks' drafts and the owner's notes on them) into social/research/<week>/inputs.json, then runs Claude
// Code headless with the social skill's instructions, allowed only to read, search and fetch the web, and write
// inside this business's social/ folder. Claude writes the week's drafts and stops; HQ checks and renders them.
// When the owner has the ig-repurpose, ig-carousel and ig-human skills installed, their text is appended as craft
// guidance (lib/user-skills.ts), below HQ's own format and rules.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

import { listDrafts as listBlogDrafts, readBlogConfig } from "./blog-store";
import { liveCampaignBriefs } from "./campaign-store";
import { claudeBin } from "./blog-writer";
import { NETWORKS, keywordDmTool } from "./social";
import { listSocial, readSocialConfig, socialDir, socialLog } from "./social-store";
import { getProfile, vaultRoot } from "./store";
import { craftGuidance, readUserSkills, stripFrontmatter, type CraftSkill } from "./user-skills";

const SKILL = path.join(process.cwd(), "plugin", "skills", "social", "SKILL.md");

export function channelPlan(slug: string): string {
  const p = getProfile(slug);
  if (!p) return "";
  try { return fs.readFileSync(path.join(vaultRoot(p), "Departments", "Content & Social", "Channel plan.md"), "utf8"); } catch { return ""; }
}

export function gatherSocialInputs(slug: string, week: string, days: string[]) {
  const p = getProfile(slug), c = readSocialConfig(slug);
  if (!p || !c) throw Error("no social plan set up for this business");
  const since = Date.now() - 8 * 864e5;
  const blog = listBlogDrafts(slug).filter((d) => d.meta.status === "published" && d.meta.publishedAt && Date.parse(d.meta.publishedAt) > since)
    .map((d) => ({ title: d.meta.title, url: d.meta.url, keyword: d.meta.keyword, description: d.meta.description, faq: d.meta.faq.slice(0, 4) }));
  const past = listSocial(slug, 6).filter((d) => d.week !== week)
    .map((d) => ({ week: d.week, network: d.network, format: d.format, caption: d.caption.slice(0, 160), status: d.status, notes: (d.notes ?? []).map((n) => n.text) }));
  return {
    week, days,
    business: { name: p.name, offer: p.offer, audience: p.audience, regulated: p.regulated, brandVoice: p.brandVoice ?? "", sites: p.sites },
    networks: c.networks,
    banned: [...(c.banned ?? []), ...(readBlogConfig(slug)?.banned ?? [])],
    channelPlan: channelPlan(slug),
    publishedThisWeek: blog,
    pastWeeks: past,
    campaigns: liveCampaignBriefs(slug, Object.keys(c.networks)),
    // The networks where a comment-to-DM tool answers a keyword, and the tool. A post asks for a comment keyword only
    // on these; HQ's "keyword" check fails any other.
    keywordDms: Object.fromEntries(NETWORKS.flatMap((n) => { const t = keywordDmTool(c, n); return t && c.networks[n] ? [[n, t]] : []; })),
  };
}

// ---------------------------------------------------------------- the owner's own Instagram skills

/** User skills the writer folds in as craft guidance when the owner has them installed (~/.claude/skills/<name>). */
export const CRAFT_SKILLS = ["ig-repurpose", "ig-carousel", "ig-human"] as const;

/** What each skill is for in the weekly run. Only the lines for skills present go in. */
const CRAFT_USE: Record<string, string> = {
  "ig-repurpose": "**ig-repurpose:** for each published blog post in inputs.json (`publishedThisWeek`), extract its claims, numbers, stories, mechanisms, mistakes and quotable lines, and list them with counts in notes.md before you write. One blog post can yield several drafts. Each draft stands completely on its own: the reader never saw the blog post, so never \"as I said in my latest post\" or \"in this week's post\". Never invent an extract the post doesn't contain.",
  "ig-carousel": "**ig-carousel:** use its slide structure, mapped onto HQ's slide `kind`s and within HQ's limits: slide 1 the cover hook (`cover`, 6 words or fewer), slide 2 the stake (`point`: why it matters, readable on its own as a second cover), then one idea per slide (`point`, `stat`, `list` or `compare`), a recap slide (`list`: the whole thing, made to be screenshotted) and one call to action (`cta`, a single ask). HQ's renderer adds the handle, the slide progress and \"Save this\", so leave those out.",
  "ig-human": "**ig-human:** apply its rules to every caption and every slide as you write: no stock slop words or phrases, none of its structural tells (\"it's not just X, it's Y\", reflex triads, one-word rhetorical questions, bait like \"follow for more\"), contractions, varied sentence length, specific numbers and names from the inputs. You can't run its scripts: check each caption by reading it against those rules.",
};

/** The writer's whole prompt: the social skill, this run's files, then any craft guidance. Pure, for tests. */
export function socialPrompt(o: { skill: string; research: string; out: string; craft?: CraftSkill[] }): string {
  return [
    stripFrontmatter(o.skill),
    "", "## This run",
    `- Read ${path.join(o.research, "inputs.json")} first. It holds the channel plan, this week's published posts, last weeks' drafts and the owner's notes.`,
    `- Write your notes to ${path.join(o.research, "notes.md")}.`,
    "- `keywordDms` in inputs.json lists the networks where a comment-to-DM tool answers a keyword. Only there may a post ask people to comment a keyword (and set `keyword`); anywhere else, never: nothing would answer them, so use \"link in bio\" or the plan's other ask.",
    "- `campaigns` in inputs.json are the business's live campaigns. A post that serves one sets `campaign` to its id, and its own-site link ends with that campaign's `linkParams` for the network. Never tag links to other sites.",
    `- Write each post as its own JSON file in ${o.out}/, named <day>-<network>-<n>.json, in the draft format above, then stop.`,
    craftGuidance(o.craft ?? [], {
      wins: "The draft JSON format, HQ's checks, the regulated rules, the never-name list and the channel plan above (slide counts and lengths, hashtags, links, no dashes)",
      use: CRAFT_USE, output: "Write the drafts as JSON in the folder above and stop.",
    }),
  ].join("\n").trimEnd();
}

/** Write this week's drafts. Never posts. */
export async function writeWeek(slug: string, week: string, days: string[], timeoutMs = 25 * 60e3): Promise<{ ok: boolean; made: number; why?: string; costUsd?: number }> {
  const bin = claudeBin();
  if (!bin) return { ok: false, made: 0, why: "Claude Code isn't installed where HQ can find it (set CLAUDE_BIN)" };
  if (!fs.existsSync(SKILL)) return { ok: false, made: 0, why: "the social skill is missing from the plugin folder" };
  const research = path.join(socialDir(slug), "research", week), out = path.join(socialDir(slug), "drafts", week);
  fs.mkdirSync(research, { recursive: true }); fs.mkdirSync(out, { recursive: true });
  const inputs = gatherSocialInputs(slug, week, days);
  if (!inputs.channelPlan) return { ok: false, made: 0, why: "no channel plan in the vault (Departments/Content & Social/Channel plan.md)" };
  fs.writeFileSync(path.join(research, "inputs.json"), JSON.stringify(inputs, null, 2));
  const before = new Set(fs.readdirSync(out));
  const craft = readUserSkills(CRAFT_SKILLS);
  const prompt = socialPrompt({ skill: fs.readFileSync(SKILL, "utf8"), research, out, craft });
  const abs = (p: string) => `/${p}/**`;
  const tools = ["Read", "Glob", "Grep", "WebSearch", "WebFetch", `Write(${abs(socialDir(slug))})`, `Edit(${abs(socialDir(slug))})`];
  socialLog(slug, { event: "writing", week, craft: craft.map((s) => s.name) });
  const res = await new Promise<{ code: number; stdout: string }>((resolve) => {
    execFile(bin, ["-p", prompt, "--output-format", "json", "--max-turns", "80", "--allowedTools", ...tools],
      { cwd: research, timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024, env: { ...process.env, HOME: os.homedir() } },
      (err, stdout) => resolve({ code: err ? 1 : 0, stdout: String(stdout ?? "") }));
  });
  let costUsd: number | undefined, summary = "";
  try { const j = JSON.parse(res.stdout); costUsd = j.total_cost_usd; summary = String(j.result ?? "").slice(0, 300); } catch { /* not JSON */ }
  const made = fs.readdirSync(out).filter((f) => f.endsWith(".json") && !before.has(f)).length;
  socialLog(slug, { event: made ? "written" : "write-failed", week, made, why: made ? undefined : summary || "no drafts" });
  return made ? { ok: true, made, costUsd } : { ok: false, made: 0, why: summary || "the writer finished without drafts", costUsd };
}
