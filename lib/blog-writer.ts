// The daily blog's research-and-write step: gathers the business's inputs into blog/research/<date>/inputs.json,
// then runs Claude Code headless with the blog skill's instructions, allowed only to read, search and fetch the
// web, query Search Console through Composio, and write inside this business's blog/ folder. Claude writes one
// draft and stops; HQ checks and publishes it (lib/blog-store.ts). Server-only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

import { readBundle } from "./brain-store";
import { liveCampaignBriefs } from "./campaign-store";
import { blogDir, hasPublisher, listDrafts, log, publisherList, readBlogConfig } from "./blog-store";
import { getProfile } from "./store";

const SKILL = path.join(process.cwd(), "plugin", "skills", "blog", "SKILL.md");

/** CLAUDE_BIN, else the newest Claude Code bundled with the editor extension, else one on the usual paths. */
export function claudeBin(): string | null {
  if (process.env.CLAUDE_BIN && fs.existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  const ext = path.join(os.homedir(), ".vscode", "extensions");
  const bundled = fs.existsSync(ext)
    ? fs.readdirSync(ext).filter((d) => d.startsWith("anthropic.claude-code-"))
      .map((d) => path.join(ext, d, "resources", "native-binary", "claude")).filter((p) => fs.existsSync(p))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : [];
  return bundled.at(-1) ?? [path.join(os.homedir(), ".local", "bin", "claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"].find((p) => fs.existsSync(p)) ?? null;
}

export async function gatherInputs(slug: string, day: string) {
  const profile = getProfile(slug), config = readBlogConfig(slug);
  if (!profile || !config) throw Error("no blog set up for this business");
  const existing = hasPublisher(slug) ? await publisherList(slug).catch(() => []) : [];
  const drafts = listDrafts(slug).slice(0, 60).map((d) => ({ title: d.meta.title, keyword: d.meta.keyword, status: d.meta.status, date: d.meta.date }));
  let brain = "";
  try { brain = readBundle(slug, "seo", 6000); } catch { /* no brain yet */ }
  return {
    day, business: { name: profile.name, offer: profile.offer, audience: profile.audience, country: profile.country, regulated: profile.regulated, brandVoice: profile.brandVoice ?? "", sites: profile.sites },
    blog: { site: config.site, topics: config.topics ?? [], avoid: config.avoid ?? [], searchConsole: config.searchConsole ?? null },
    competitors: (profile.competitors ?? []).map((c) => ({ name: c.name, site: c.site ?? null, notes: c.notes ?? "" })),
    existingPosts: existing.map((p) => ({ slug: p.slug, title: p.title, url: p.url })),
    recentDrafts: drafts,
    brain,
    campaigns: liveCampaignBriefs(slug, ["blog"]).map(({ linkParams: _, ...c }) => c),
  };
}

export type WriteResult = { ok: boolean; draft?: string; why?: string; costUsd?: number };

/** Research and write today's draft. Never publishes. */
export async function writeDraft(slug: string, day: string, timeoutMs = 25 * 60e3): Promise<WriteResult> {
  const bin = claudeBin();
  if (!bin) return { ok: false, why: "Claude Code isn't installed where HQ can find it (set CLAUDE_BIN)" };
  if (!fs.existsSync(SKILL)) return { ok: false, why: "the blog skill is missing from the plugin folder" };
  const research = path.join(blogDir(slug), "research", day), drafts = path.join(blogDir(slug), "drafts");
  fs.mkdirSync(research, { recursive: true });
  fs.mkdirSync(drafts, { recursive: true });
  fs.writeFileSync(path.join(research, "inputs.json"), JSON.stringify(await gatherInputs(slug, day), null, 2));
  const before = new Set(fs.readdirSync(drafts));
  const prompt = [
    fs.readFileSync(SKILL, "utf8").replace(/^---[\s\S]*?---\n/, ""),
    "",
    "## This run",
    `- Business folder for today: ${research}`,
    `- Read ${path.join(research, "inputs.json")} first.`,
    `- Write your research notes to ${path.join(research, "notes.md")}.`,
    "- `campaigns` in inputs.json are the business's live campaigns that use the blog. If today's post serves one, set `campaign` in the front block to its id. Never add utm tags to links inside the post.",
    `- Write exactly one draft to ${drafts}/${day}-<slug>.md in the draft format above, then stop.`,
  ].join("\n");
  const abs = (p: string) => `/${p}/**`; // Claude Code permission rules take absolute paths with a leading //.
  const tools = ["Read", "Glob", "Grep", "WebSearch", "WebFetch", `Write(${abs(blogDir(slug))})`, `Edit(${abs(blogDir(slug))})`,
    "mcp__claude_ai_Composio__COMPOSIO_SEARCH_TOOLS", "mcp__claude_ai_Composio__COMPOSIO_MULTI_EXECUTE_TOOL", "mcp__claude_ai_Composio__COMPOSIO_GET_TOOL_SCHEMAS"];
  log(slug, { event: "writing", day });
  const out = await new Promise<{ code: number | null; stdout: string }>((resolve) => {
    execFile(bin, ["-p", prompt, "--output-format", "json", "--max-turns", "80", "--allowedTools", ...tools],
      { cwd: research, timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024, env: { ...process.env, HOME: os.homedir() } },
      (err, stdout) => resolve({ code: err ? (typeof (err as NodeJS.ErrnoException).code === "number" ? Number((err as NodeJS.ErrnoException).code) : 1) : 0, stdout: String(stdout ?? "") }));
  });
  let costUsd: number | undefined, isError = out.code !== 0, summary = "";
  try { const j = JSON.parse(out.stdout); costUsd = j.total_cost_usd; isError = isError || j.is_error; summary = String(j.result ?? "").slice(0, 300); } catch { /* not JSON */ }
  const made = fs.readdirSync(drafts).filter((f) => f.endsWith(".md") && !before.has(f));
  if (!made.length) {
    const why = isError ? `the writer stopped: ${summary || "no output"}` : "the writer finished without a draft";
    log(slug, { event: "write-failed", day, why });
    return { ok: false, why, costUsd };
  }
  log(slug, { event: "written", day, draft: made[0] });
  return { ok: true, draft: made[0], costUsd };
}
