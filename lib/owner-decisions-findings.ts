// The owner's open decisions, the pure half: their shape, the checks on a new one, and how they read as CEO
// findings. Disk access lives in lib/owner-decisions.ts. Client-safe.
import type { Finding } from "./types";

/** A note on a decision: the owner's thinking, a question, or Claude's reply or update. */
export type DecisionNote = { at: string; by: "owner" | "claude"; text: string; editedAt?: string };
export const NOTE_MAX = 1000;
export const NOTES_MAX = 100;

export function noteProblem(text: unknown): string | null {
  if (typeof text !== "string" || !text.trim()) return "a note needs some text";
  if (text.length > NOTE_MAX) return `a note is at most ${NOTE_MAX} characters`;
  return null;
}

/** The owner wrote last and nobody has answered: Claude should read and reply. */
export const awaitingReply = (d: Pick<OwnerDecision, "notes">) => d.notes?.at(-1)?.by === "owner";

export type OwnerDecision = {
  id: string;
  title: string;
  /** Why it matters and why it's the owner's call. */
  why: string;
  /** Exactly how to make the call: a page, a command, a sign-in. */
  how: string;
  /** The department it belongs to (a registry slug, or "ceo"). */
  dept: string;
  /** What Claude or the CEO recommends, if anything. */
  recommend?: string;
  /** YYYY-MM-DD: after this the chance is gone (a draft expires, a launch date passes). */
  due?: string;
  source?: string;
  createdAt: string;
  status: "open" | "decided" | "dropped";
  decidedAt?: string;
  answer?: string;
  /** Notes in the order they were written, the owner's and Claude's. */
  notes?: DecisionNote[];
};

export type DecisionInput = Pick<OwnerDecision, "title" | "why" | "how" | "dept"> & Partial<Pick<OwnerDecision, "id" | "recommend" | "due" | "source">>;

export const DECISION_LIMIT = { title: 140, text: 600 };
const LIMIT = DECISION_LIMIT;
export const decisionId = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export function decisionProblem(x: unknown): string | null {
  const d = x as Partial<DecisionInput>;
  if (!d || typeof d !== "object") return "a decision must be an object";
  for (const k of ["title", "why", "how", "dept"] as const) if (typeof d[k] !== "string" || !d[k]!.trim()) return `${k} is required`;
  if (d.title!.length > LIMIT.title) return `title is over ${LIMIT.title} characters`;
  for (const k of ["why", "how", "recommend", "source"] as const) if (d[k] !== undefined && (typeof d[k] !== "string" || d[k]!.length > LIMIT.text)) return `${k} must be text under ${LIMIT.text} characters`;
  if (d.due !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(d.due)) return "due must be YYYY-MM-DD";
  if (d.id !== undefined && !/^[a-z0-9-]{1,60}$/.test(d.id)) return "id must be lowercase letters, digits and dashes";
  return null;
}

// ---------------------------------------------------------------- findings (pure)

const DAY = 864e5;
const dayLabel = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`), f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-AU", { ...o, timeZone: "UTC" });
  return `${f({ weekday: "short" })} ${f({ day: "numeric" })} ${f({ month: "short" })}`; // "Fri 16 Oct"
};

/** Open decisions as CEO findings: due ones first in the title; due within 2 days (or past) is "attention". */
export function decisionFindings(decisions: OwnerDecision[], now = new Date()): Finding[] {
  return decisions.filter((d) => d.status === "open").map((d) => {
    const left = d.due ? (Date.parse(`${d.due}T23:59:59Z`) - now.getTime()) / DAY : Infinity;
    return {
      id: `owner-${d.id}`,
      severity: left <= 2 ? "attention" : "decision",
      dept: d.dept,
      title: `${d.due ? `${left < 0 ? "Overdue since" : "By"} ${dayLabel(d.due)}: ` : ""}${d.title}`,
      detail: `${d.why}${d.recommend ? ` Recommended: ${d.recommend}` : ""}${awaitingReply(d) ? " Your latest note is waiting for Claude's reply." : ""}`,
      action: d.how,
      since: d.createdAt,
    } satisfies Finding;
  });
}
