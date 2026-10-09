// Support: what's waiting for a reply, what customers ask about, and how fast they hear back, from a private read-only
// support adapter per business ($HQ_DATA/businesses/<slug>/support-connection.json). No message text, names, emails or
// ids: private references, themes, counts and timings (validated like the scorecard). A weekly digest sends the themes
// as brain signals to the departments Support feeds: Email (where new customers get stuck), Data (themes and ratings)
// and Product & Engineering (requests and bugs). Server-only. Contract: docs/guides/support-desk.md.
import fs from "node:fs";
import path from "node:path";

import { allNotes, writeNote } from "./brain-store";
import { execAdapter, writePrivateJson } from "./private-adapter";
import { looksPrivate } from "./scorecard";
import { businessDir, getProfile } from "./store";

export type SupportWaiting = { ref: string; channel: string; theme: string; openedFrom: string; openedAt: string; lastAt: string; unread: number;
  /** Where to answer this one, when its source differs from the snapshot's answerAt (a mailbox search, say). */
  answerAt?: string };
export type SupportWeek = { week: string; opened: number; answered: number; medianReplyHours: number | null };
export type SupportSnapshot = {
  version: 1; observedAt: string;
  /** Where the owner answers (the business's own admin page). */
  answerAt?: string;
  channels?: string[];
  /** What HQ can't see, said plainly. */
  blind?: string[];
  waiting: SupportWaiting[];
  themes: Record<string, number>;
  /** Themes among customers who wrote within 14 days of signing up: where new customers get stuck. */
  stuck?: Record<string, number>;
  weekly: SupportWeek[];
  ratings?: { up: number; down: number };
};

const short = (s: unknown, max = 80): s is string => typeof s === "string" && s.length <= max && !looksPrivate(s);
const iso = (s: unknown) => typeof s === "string" && Number.isFinite(Date.parse(s));
const count = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0;
const link = (s: unknown) => typeof s === "string" && /^https?:\/\/[^?\s]+$/.test(s) && s.length <= 300;
const counts = (o: unknown) => o !== null && typeof o === "object" && !Array.isArray(o) && Object.keys(o as object).length <= 30 && Object.entries(o as Record<string, unknown>).every(([k, v]) => short(k, 60) && count(v));

export function supportProblem(v: unknown): string | null {
  const x = v as SupportSnapshot;
  if (!x || x.version !== 1) return "version";
  if (!iso(x.observedAt)) return "observedAt";
  if (x.answerAt !== undefined && !link(x.answerAt)) return "answerAt";
  for (const k of ["channels", "blind"] as const) if (x[k] !== undefined && !(Array.isArray(x[k]) && x[k]!.length <= 10 && x[k]!.every((s) => short(s, 200)))) return k;
  if (!Array.isArray(x.waiting) || x.waiting.length > 500) return "waiting";
  for (let i = 0; i < x.waiting.length; i++) {
    const w = x.waiting[i], at = `waiting[${i}]`;
    if (!w || typeof w.ref !== "string" || !/^[a-z]{1,4}-[0-9a-f]{6,12}$/.test(w.ref)) return `${at}.ref`;
    if (!short(w.channel, 40) || !short(w.theme, 60) || !short(w.openedFrom, 80)) return `${at}.label`;
    if (!iso(w.openedAt) || !iso(w.lastAt) || !count(w.unread)) return `${at}.time`;
    if (w.answerAt !== undefined && !link(w.answerAt)) return `${at}.answerAt`;
  }
  if (!counts(x.themes)) return "themes";
  if (x.stuck !== undefined && !counts(x.stuck)) return "stuck";
  if (!Array.isArray(x.weekly) || x.weekly.length > 26 || !x.weekly.every((w) => /^\d{4}-W\d{2}$/.test(w.week) && count(w.opened) && count(w.answered) && (w.medianReplyHours === null || (typeof w.medianReplyHours === "number" && w.medianReplyHours >= 0)))) return "weekly";
  if (x.ratings !== undefined && !(count(x.ratings.up) && count(x.ratings.down))) return "ratings";
  return null;
}

/** Rebuilt field by field: extra fields never reach disk. */
export function rebuildSupport(x: SupportSnapshot): SupportSnapshot {
  return {
    version: 1, observedAt: new Date(x.observedAt).toISOString(),
    ...(x.answerAt ? { answerAt: x.answerAt } : {}), ...(x.channels ? { channels: [...x.channels] } : {}), ...(x.blind ? { blind: [...x.blind] } : {}),
    waiting: x.waiting.map(({ ref, channel, theme, openedFrom, openedAt, lastAt, unread, answerAt }) => ({ ref, channel, theme, openedFrom, openedAt, lastAt, unread, ...(answerAt ? { answerAt } : {}) })),
    themes: { ...x.themes }, ...(x.stuck ? { stuck: { ...x.stuck } } : {}),
    weekly: x.weekly.map(({ week, opened, answered, medianReplyHours }) => ({ week, opened, answered, medianReplyHours })),
    ...(x.ratings ? { ratings: { up: x.ratings.up, down: x.ratings.down } } : {}),
  };
}

const sum = (a: Record<string, number> = {}, b: Record<string, number> = {}) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = (o[k] ?? 0) + v; return o; };

/** Several sources (the business's own database, a support mailbox …) as one snapshot. Each part was validated.
 *  A part's own answerAt moves onto its waiting rows when it isn't the first part's, so every row keeps its link.
 *  A week's median reply time across parts is the answered-weighted mean of the parts' medians (an estimate). */
export function mergeSupport(parts: SupportSnapshot[]): SupportSnapshot {
  if (parts.length === 1) return parts[0];
  const [first] = parts;
  const weeks = new Map<string, { opened: number; answered: number; hours: number; weight: number }>();
  for (const p of parts) for (const w of p.weekly) {
    const m = weeks.get(w.week) ?? { opened: 0, answered: 0, hours: 0, weight: 0 };
    m.opened += w.opened; m.answered += w.answered;
    if (w.medianReplyHours !== null && w.answered > 0) { m.hours += w.medianReplyHours * w.answered; m.weight += w.answered; }
    weeks.set(w.week, m);
  }
  const uniq = (xs: string[]) => [...new Set(xs)].slice(0, 10);
  const ratings = parts.filter((p) => p.ratings);
  const stuck = parts.filter((p) => p.stuck);
  return {
    version: 1, observedAt: parts.map((p) => p.observedAt).sort()[0],
    ...(first.answerAt ? { answerAt: first.answerAt } : {}),
    channels: uniq(parts.flatMap((p) => p.channels ?? [])), blind: uniq(parts.flatMap((p) => p.blind ?? [])),
    waiting: parts.flatMap((p, i) => p.waiting.map((w) => (i > 0 && !w.answerAt && p.answerAt && p.answerAt !== first.answerAt ? { ...w, answerAt: p.answerAt } : w)))
      .sort((a, b) => a.lastAt.localeCompare(b.lastAt)).slice(0, 500),
    themes: parts.reduce((o, p) => sum(o, p.themes), {} as Record<string, number>),
    ...(stuck.length ? { stuck: stuck.reduce((o, p) => sum(o, p.stuck), {} as Record<string, number>) } : {}),
    weekly: [...weeks].sort(([a], [b]) => a.localeCompare(b)).slice(-26)
      .map(([week, m]) => ({ week, opened: m.opened, answered: m.answered, medianReplyHours: m.weight ? Math.round((m.hours / m.weight) * 10) / 10 : null })),
    ...(ratings.length ? { ratings: { up: ratings.reduce((n, p) => n + p.ratings!.up, 0), down: ratings.reduce((n, p) => n + p.ratings!.down, 0) } } : {}),
  };
}

const CONNECTION = "support-connection.json";
const file = (slug: string) => path.join(businessDir(slug), "support-snapshot.json");
export const supportConnected = (slug: string) => fs.existsSync(path.join(businessDir(slug), CONNECTION));

/** `{"command": [...]}` for one source, or `{"commands": [[...], [...]]}` for several (merged). */
export function supportCommands(slug: string): string[][] {
  const config = JSON.parse(fs.readFileSync(path.join(businessDir(slug), CONNECTION), "utf8"));
  const ok = (c: unknown): c is string[] => Array.isArray(c) && c.length > 0 && c.every((s) => typeof s === "string");
  const list: unknown[] = Array.isArray(config.commands) ? config.commands : [config.command];
  if (!list.length || list.length > 5 || !list.every(ok)) throw Error("Invalid support connection");
  return list as string[][];
}

export function supportState(slug: string): { connected: boolean; snapshot: SupportSnapshot | null; stale: boolean } {
  if (!getProfile(slug)) throw Error("Unknown business");
  let snapshot: SupportSnapshot | null = null;
  try { const v = JSON.parse(fs.readFileSync(file(slug), "utf8")); if (!supportProblem(v)) snapshot = v; } catch { /* none yet */ }
  return { connected: supportConnected(slug), snapshot, stale: !snapshot || Date.now() - Date.parse(snapshot.observedAt) > 36 * 3600e3 };
}

/** Runs every source. One that fails or is invalid is left out and named in `blind`; all failing is an error. */
export async function runSupport(slug: string): Promise<SupportSnapshot> {
  if (!getProfile(slug)) throw Error("Unknown business");
  const commands = supportCommands(slug);
  const parts: SupportSnapshot[] = [], failed: string[] = [];
  for (const [i, command] of commands.entries()) {
    try {
      const value = await execAdapter(command, { action: "report" }, 60000);
      const problem = supportProblem(value);
      if (problem) throw Error(`Invalid support snapshot at ${problem}`);
      parts.push(rebuildSupport(value as SupportSnapshot));
    } catch (e) { if (commands.length === 1) throw e; failed.push(`support source ${i + 1} (${path.basename(command.at(-1) ?? "")}) couldn't be read this time`); }
  }
  if (!parts.length) throw Error("Every support source failed");
  const merged = mergeSupport(parts);
  const clean = rebuildSupport({ ...merged, blind: [...failed, ...(merged.blind ?? [])].slice(0, 10) });
  const problem = supportProblem(clean);
  if (problem) throw Error(`Invalid merged support snapshot at ${problem}`);
  writePrivateJson(file(slug), clean);
  return clean;
}

const top = (o: Record<string, number> = {}, n = 5) => Object.entries(o).filter(([k]) => k !== "Other").sort((a, b) => b[1] - a[1]).slice(0, n);

/** This week's support digest as one brain signal from Support to Email, Data and Product & Engineering.
 *  Once per ISO week (the brain refuses a second dated note with the same title the same day). */
export function supportDigest(slug: string, s: SupportSnapshot, week: string): { title: string; body: string } {
  const themes = top(s.themes), stuck = top(s.stuck);
  const recent = s.weekly.slice(-4);
  const opened = recent.reduce((n, w) => n + w.opened, 0), answered = recent.reduce((n, w) => n + w.answered, 0);
  const lines = [
    `What customers asked about in the last 90 days, by theme: ${themes.length ? themes.map(([k, v]) => `${k} ${v}`).join(", ") : "nothing yet"}${s.themes.Other ? ` (plus ${s.themes.Other} the rules couldn't place)` : ""}.`,
    stuck.length ? `New customers (writing within 14 days of signing up) asked about: ${stuck.map(([k, v]) => `${k} ${v}`).join(", ")}. Email: look at the onboarding emails for these.` : "",
    `Last 4 weeks: ${opened} conversations opened, ${answered} answered.${s.waiting.length ? ` ${s.waiting.length} waiting for a reply now.` : ""}`,
    s.ratings ? `Ratings (90 days): ${s.ratings.up} up, ${s.ratings.down} down.` : "",
    themes.some(([k]) => k === "Feature request" || k === "Bug or broken") ? "Product & Engineering: feature requests and bugs are in the themes above; open the conversations in the admin to read them." : "",
  ].filter(Boolean);
  return { title: `Support themes ${week}`, body: lines.join("\n\n") };
}

/** Whether this week's digest is already in the brain (one per ISO week, whichever day it was written). */
export function digestWritten(slug: string, week: string): boolean {
  try { return allNotes(slug).some((n) => n.meta.type === "signal" && n.meta.title === `Support themes ${week}`); } catch { return false; }
}

export function writeSupportDigest(slug: string, s: SupportSnapshot, week: string): string {
  const d = supportDigest(slug, s, week);
  return writeNote("business", slug, { type: "signal", dept: "support", title: d.title, body: d.body, to: ["email", "data", "engineering"], evidence: ["support adapter snapshot " + s.observedAt.slice(0, 10)] });
}
