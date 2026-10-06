// The weekly competitor brief, the pure half: when a brief is due, the checks a brief and its brain signals must
// pass before HQ saves them, the writer's prompt and tool allowlist, and the CEO finding for a run that failed.
// Client-safe: no node imports. The disk, watcher and Claude side lives in lib/competitor-tick.ts.

import type { Node } from "./workflows";
import type { Finding } from "./types";

/** "YYYY-MM-DD" for a moment, in a timezone. */
function localDate(t: Date, tz: string): string {
  return t.toLocaleDateString("en-CA", { timeZone: tz });
}

/** The Monday that starts `now`'s week (Monday to Sunday), as "YYYY-MM-DD" in the business's timezone. */
export function weekStart(now: Date, tz: string): string {
  const [y, m, d] = localDate(now, tz).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/** A business gets a new brief unless it already has one in the current week, Monday 00:00 to Sunday,
 *  in its own timezone. So a mid-week brief by hand never blocks the next Monday's run. */
export function briefDue(lastBriefAt: string | null | undefined, now: Date = new Date(), tz = "UTC"): boolean {
  if (!lastBriefAt) return true;
  const t = new Date(lastBriefAt);
  if (!Number.isFinite(t.getTime())) return true;
  return localDate(t, tz) < weekStart(now, tz);
}

/** One line of the run log (plans/competitors/runs.jsonl). */
export type BriefRun = {
  at: string;
  ok: boolean;
  /** Why it failed, or what it skipped. */
  why?: string;
  plan?: string;
  changed?: number;
  watched?: number;
  signals?: number;
  costUsd?: number;
};

/** The CEO's finding for a weekly run that failed and hasn't been followed by a brief. */
export function briefRunFinding(lastRun: BriefRun | null | undefined, lastBriefAt: string | null | undefined, slug: string): Finding | null {
  if (!lastRun || lastRun.ok) return null;
  if (lastBriefAt && Date.parse(lastBriefAt) >= Date.parse(lastRun.at)) return null;
  return {
    id: "competitor-brief-failed",
    severity: "attention",
    dept: "competitors",
    title: "The weekly competitor brief failed",
    detail: `${lastRun.at.slice(0, 16).replace("T", " ")} UTC: ${lastRun.why ?? "no reason given"}`,
    action: `Read plans/competitors/runs.jsonl, fix the cause, then run \`npm run hq -- competitors tick ${slug} --force\` (or \`/hq:competitors\` by hand).`,
    since: lastRun.at,
  };
}

// ---------- the checks ----------

/** Em and en dashes out: an en dash between digits becomes a hyphen, any other dash becomes a comma or a hyphen. */
export function fixDashes(text: string): string {
  return text
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/[—–]/g, "-");
}

/** Advice the brief may never give: paid gambling ads, and inducement copy (AU rules). */
const PAID_ADS = /\b(paid (ads?|social|search|campaigns?|placements?)|ad spend|ads? budget|boost(ed|ing)? (a |the |our |this )?posts?|sponsored posts?|(google|meta|facebook|instagram|tiktok|youtube) ads? (campaigns?|spend|budget)|(run|launch|buy|start) (some |more |our own )?(paid )?ads)\b/i;
const INDUCEMENT = /\b(sign[- ]?up bonus(es)?|welcome bonus(es)?|deposit (match|bonus)|refer[- ]a[- ]friend|risk[- ]free|guaranteed|no[- ]lose|can'?t lose|free money|bonus bets? offer)\b/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** The lines under a "## <heading>" up to the next "## ". */
export function section(markdown: string, heading: RegExp): string[] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => /^##\s/.test(l) && heading.test(l));
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

/** The first banned phrase the brief recommends. A sentence doesn't count when it only names the phrase in quotes,
 *  warns against it ("no", "not", "never", "avoid", "don't", "without") or reports what a rival does. */
export function recommended(text: string, banned: RegExp, rivals: readonly string[] = []): string | null {
  const NEGATION = /\b(no|not|never|avoid|without|nor)\b|n't\b/i;
  const RIVAL = new RegExp(`\\b(rivals?|competitors?${rivals.map((r) => `|${r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).join("")})\\b`, "i");
  for (const line of text.split("\n")) {
    for (const sentence of line.replace(/"[^"\n]*"|“[^”\n]*”/g, '""').split(/(?<=[.;!?])\s+/)) {
      const hit = sentence.match(banned);
      const rest = hit ? sentence.replace(hit[0], " ") : "";
      if (hit && !NEGATION.test(rest) && !RIVAL.test(rest)) return hit[0];
    }
  }
  return null;
}

export type BriefCheck = { markdown: string; problems: string[]; fixedDashes: boolean };

/** What a brief must be before HQ saves it. Dashes are fixed; everything else is a problem that stops the save. */
export function checkBrief(raw: string, ctx: { changed: number; rivals?: readonly string[] }): BriefCheck {
  const markdown = fixDashes(raw.trim());
  const problems: string[] = [];
  if (!markdown) return { markdown, problems: ["the brief is empty"], fixedDashes: false };
  if (markdown.length > 15000) problems.push(`the brief is ${markdown.length} characters; keep it under 15000`);
  if (!/^\*\*Headline:\*\*\s*\S/m.test(markdown)) problems.push("no **Headline:** line");
  const changed = section(markdown, /what changed/i);
  if (!changed.length) problems.push('no "## What changed" section');
  const facts = changed.filter((l) => /^\s*-\s+\*\*/.test(l));
  const unlinked = facts.filter((l) => !/https?:\/\//.test(l));
  if (unlinked.length) problems.push(`${unlinked.length} fact(s) under "What changed" have no source link: ${unlinked.map((l) => l.trim().slice(0, 60)).join(" | ")}`);
  if (ctx.changed > 0 && !changed.some((l) => /https?:\/\//.test(l))) problems.push(`${ctx.changed} watched page(s) changed but "What changed" links none of them`);
  const actions = section(markdown, /what it means|who acts/i).join("\n");
  const paid = recommended(actions, PAID_ADS, ctx.rivals);
  if (paid) problems.push(`gives paid-ads advice ("${paid}"): gambling ads are regulated, leave paid ads out`);
  const induce = recommended(actions, INDUCEMENT, ctx.rivals);
  if (induce) problems.push(`recommends inducement copy ("${induce}")`);
  const email = markdown.match(EMAIL);
  if (email) problems.push("contains an email address: never name a person or a customer");
  return { markdown, problems, fixedDashes: markdown !== raw.trim() };
}

/** A signal the writer proposed, before HQ files it in the brain. */
export type SignalDraft = { to: Node[]; title: string; body: string; evidence: string[] };

/** Validate the writer's signals.json. Bad entries are dropped with a reason; dashes are fixed. */
export function parseSignals(raw: unknown, allowedTo: readonly string[], rivals: readonly string[] = []): { signals: SignalDraft[]; dropped: string[] } {
  const signals: SignalDraft[] = [], dropped: string[] = [];
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { signals?: unknown }).signals) ? (raw as { signals: unknown[] }).signals : null;
  if (!list) return { signals, dropped: raw === undefined ? [] : ["signals.json is not a list"] };
  for (const [i, s] of list.slice(0, 12).entries()) {
    const o = (s ?? {}) as Record<string, unknown>;
    const title = fixDashes(String(o.title ?? "").trim()).slice(0, 110);
    const body = fixDashes(String(o.body ?? "").trim());
    const to = (Array.isArray(o.to) ? o.to : [o.to]).map(String).filter(Boolean);
    const evidence = (Array.isArray(o.evidence) ? o.evidence : []).map(String).filter((u) => /^https?:\/\//.test(u));
    const why = !title ? "no title" : !body ? "no body" : !to.length ? "no `to`" : to.some((t) => !allowedTo.includes(t)) ? `competitors doesn't hand signals to ${to.filter((t) => !allowedTo.includes(t)).join(", ")}`
      : !evidence.length ? "no evidence link" : recommended(body, INDUCEMENT, rivals) || recommended(body, PAID_ADS, rivals) ? "paid-ads or inducement advice" : EMAIL.test(`${title} ${body}`) ? "an email address" : null;
    if (why) dropped.push(`signal ${i + 1}${title ? ` ("${title.slice(0, 40)}")` : ""}: ${why}`);
    else signals.push({ to: [...new Set(to)] as Node[], title, body, evidence });
  }
  return { signals, dropped };
}

/** A dated log entry the writer proposed for one competitor's vault note. */
export function parseLogEntries(raw: unknown, names: readonly string[]): { competitor: string; markdown: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    const name = names.find((n) => n.toLowerCase() === String(o.competitor ?? "").trim().toLowerCase());
    const markdown = fixDashes(String(o.markdown ?? "").trim());
    return name && markdown && !EMAIL.test(markdown) ? [{ competitor: name, markdown: markdown.slice(0, 3000) }] : [];
  });
}

/** HQ's own coverage note, appended to every brief: watcher numbers HQ measured, so the writer never has to. */
export function coverageSection(c: { watched: number | null; changed: number; errors: { competitor: string; url: string }[]; content: { competitor: string; platform: string; ok: boolean }[]; date: string }): string {
  const lines = ["## Coverage (measured by HQ)"];
  lines.push(c.watched === null ? "- The page watcher (changedetection.io) wasn't reachable, so page changes weren't checked this week." : `- ${c.watched} rival page(s) watched; ${c.changed} changed in the 7 days to ${c.date}.`);
  if (c.errors.length) lines.push(`- Pages the watcher couldn't fetch: ${c.errors.map((e) => `${e.competitor} (${e.url})`).join(", ")}.`);
  const got = c.content.filter((x) => x.ok), missed = c.content.filter((x) => !x.ok);
  if (got.length) lines.push(`- Recent uploads listed for: ${got.map((x) => `${x.competitor} ${x.platform}`).join(", ")}.`);
  if (missed.length) lines.push(`- Uploads couldn't be listed for: ${missed.map((x) => `${x.competitor} ${x.platform}`).join(", ")}.`);
  lines.push("- Instagram and the ad libraries are checked by hand (they need a login or a browser).");
  return lines.join("\n");
}

// ---------- the writer ----------

export type WriterPaths = { research: string; inputs: string; brief: string; signals: string; log: string; notes: string };

/** Claude Code permission rules: the writer reads anything except credentials, searches and fetches the web, and
 *  writes only in this run's folder under plans/competitors. Edit rules cover the Write tool too. */
export function writerArgs(prompt: string, paths: WriterPaths, maxTurns = 80): string[] {
  const rule = (p: string) => `/${p}/**`; // absolute paths in permission rules take a leading //
  return [
    "-p", prompt,
    "--output-format", "json",
    "--max-turns", String(maxTurns),
    "--tools", "Read,Write,Edit,WebSearch,WebFetch",
    "--allowedTools", "Read", "WebSearch", "WebFetch", `Edit(${rule(paths.research)})`, `Write(${rule(paths.research)})`,
    "--disallowedTools", "Read(//**/.env)", "Read(//**/.env.*)", "Read(//**/*.pem)", "Read(//**/*.key)",
    "--permission-mode", "dontAsk",
    "--strict-mcp-config",
    "--setting-sources", "",
  ];
}

export function writerPrompt(skill: string, paths: WriterPaths, date: string, changed: number): string {
  return [
    skill.replace(/^---[\s\S]*?---\n/, ""),
    "",
    "## This run (the weekly tick: it overrides the steps above where they differ)",
    "",
    "HQ has already synced the watches, asked the watcher to recheck every page, read the week's page changes with",
    "their diffs, listed recent uploads where a public listing works, and read this department's brain. You have no",
    "shell: don't run commands, `npm run hq`, yt-dlp or the brain CLI. Use Read, WebSearch and WebFetch, and write",
    "only these files. HQ checks them, saves the brief as the department's plan, files your signals in the brain,",
    "appends your log entries to the competitor notes and marks the CEO's finding read.",
    "",
    `1. Read ${paths.inputs} first. \`changes\` are the watched pages that changed in the last 7 days, with the text that changed. \`content\` are recent uploads. \`brain\` is what the department already knows. \`lastBrief\` is last week's brief: report only what's new since.`,
    "2. Check what matters with WebFetch or WebSearch: the changed pages themselves, each rival's public blog or socials, and the public ad libraries (Meta Ad Library, Google Ads Transparency Center). Pages that need a login are off limits.",
    `3. Write the brief to ${paths.brief} in the format above (**Headline:**, ## What changed, ## What it means → who acts, ## Watching). Under What changed, every bullet that starts with **Competitor:** carries a source link.`,
    changed > 0
      ? `   ${changed} watched page(s) changed this week: say what changed on each that matters, or that it was cosmetic.`
      : "   No watched page changed this week. If your own checks find nothing new either, write a short brief: the headline says there was no change, What changed has one line saying so, and What it means says no action is needed.",
    `4. Write the department hand-offs to ${paths.signals}: a JSON list, one entry per action worth taking, each {"to": ["<dept>"], "title": "...", "body": "...", "evidence": ["https://..."]}. \`to\` is one or more of: engineering, content, seo, ads, finance, sales, legal, ceo. A comparison-page or "X alternative" opportunity goes to seo and content; a rival price or plan change goes to ceo and finance; a rival claim that may break ad rules goes to legal. Write [] when there's nothing to act on.`,
    `5. Write ${paths.log}: a JSON list of {"competitor": "<name exactly as in inputs.json>", "markdown": "<what's new, with links>"}, only for competitors with something new.`,
    `6. Keep your working notes in ${paths.notes}. Then stop.`,
    "",
    "Rules for everything you write:",
    "- Facts only, each with a source link. No invented numbers: give a number only when a source shows it. Label a guess as a guess.",
    "- The business is in a regulated industry (see `business.regulated`). Never advise paid ads, and never suggest inducement copy: no sign-up bonuses, refer-a-friend, guaranteed or risk-free wording. Reporting that a rival runs an offer is fine when it is a fact with a link; recommending one is not.",
    "- Never name a customer of the business, or any private person. Rivals and their public accounts only.",
    "- No em dashes or en dashes anywhere. Use commas, colons or full stops.",
    "- Don't copy a rival's content or claims; describe the pattern.",
    `- Today is ${date}.`,
  ].join("\n");
}
