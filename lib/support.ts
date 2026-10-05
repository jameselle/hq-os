// Support: what's waiting for a reply, what customers ask about, and how fast they hear back, from a private read-only
// support adapter per business ($HQ_DATA/businesses/<slug>/support-connection.json). No message text, names, emails or
// ids: private references, themes, counts and timings (validated like the scorecard). A weekly digest sends the themes
// as brain signals to the departments Support feeds: Email (where new customers get stuck), Data (themes and ratings)
// and Product & Engineering (requests and bugs). Server-only. Contract: docs/guides/support-desk.md.
import fs from "node:fs";
import path from "node:path";

import { allNotes, writeNote } from "./brain-store";
import { execAdapter, readConnection, writePrivateJson } from "./private-adapter";
import { looksPrivate } from "./scorecard";
import { businessDir, getProfile } from "./store";

export type SupportWaiting = { ref: string; channel: string; theme: string; openedFrom: string; openedAt: string; lastAt: string; unread: number };
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
const counts = (o: unknown) => o !== null && typeof o === "object" && !Array.isArray(o) && Object.keys(o as object).length <= 30 && Object.entries(o as Record<string, unknown>).every(([k, v]) => short(k, 60) && count(v));

export function supportProblem(v: unknown): string | null {
  const x = v as SupportSnapshot;
  if (!x || x.version !== 1) return "version";
  if (!iso(x.observedAt)) return "observedAt";
  if (x.answerAt !== undefined && !(typeof x.answerAt === "string" && /^https?:\/\/[^?\s]+$/.test(x.answerAt))) return "answerAt";
  for (const k of ["channels", "blind"] as const) if (x[k] !== undefined && !(Array.isArray(x[k]) && x[k]!.length <= 10 && x[k]!.every((s) => short(s, 200)))) return k;
  if (!Array.isArray(x.waiting) || x.waiting.length > 500) return "waiting";
  for (let i = 0; i < x.waiting.length; i++) {
    const w = x.waiting[i], at = `waiting[${i}]`;
    if (!w || typeof w.ref !== "string" || !/^[a-z]{1,4}-[0-9a-f]{6,12}$/.test(w.ref)) return `${at}.ref`;
    if (!short(w.channel, 40) || !short(w.theme, 60) || !short(w.openedFrom, 80)) return `${at}.label`;
    if (!iso(w.openedAt) || !iso(w.lastAt) || !count(w.unread)) return `${at}.time`;
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
    waiting: x.waiting.map(({ ref, channel, theme, openedFrom, openedAt, lastAt, unread }) => ({ ref, channel, theme, openedFrom, openedAt, lastAt, unread })),
    themes: { ...x.themes }, ...(x.stuck ? { stuck: { ...x.stuck } } : {}),
    weekly: x.weekly.map(({ week, opened, answered, medianReplyHours }) => ({ week, opened, answered, medianReplyHours })),
    ...(x.ratings ? { ratings: { up: x.ratings.up, down: x.ratings.down } } : {}),
  };
}

const CONNECTION = "support-connection.json";
const file = (slug: string) => path.join(businessDir(slug), "support-snapshot.json");
export const supportConnected = (slug: string) => fs.existsSync(path.join(businessDir(slug), CONNECTION));

export function supportState(slug: string): { connected: boolean; snapshot: SupportSnapshot | null; stale: boolean } {
  if (!getProfile(slug)) throw Error("Unknown business");
  let snapshot: SupportSnapshot | null = null;
  try { const v = JSON.parse(fs.readFileSync(file(slug), "utf8")); if (!supportProblem(v)) snapshot = v; } catch { /* none yet */ }
  return { connected: supportConnected(slug), snapshot, stale: !snapshot || Date.now() - Date.parse(snapshot.observedAt) > 36 * 3600e3 };
}

export async function runSupport(slug: string): Promise<SupportSnapshot> {
  if (!getProfile(slug)) throw Error("Unknown business");
  const { command } = readConnection(slug, CONNECTION);
  const value = await execAdapter(command, { action: "report" }, 60000);
  const problem = supportProblem(value);
  if (problem) throw Error(`Invalid support snapshot at ${problem}`);
  const clean = rebuildSupport(value as SupportSnapshot);
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
