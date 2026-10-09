// The brain: what every department reads before it works and writes after. Pure and client-safe:
// the note types, their folders, the map of who reads and writes what (derived from the Workflows
// web, so the two can't disagree) and the note header. Disk access lives in lib/brain-store.ts.
// Spec: docs/superpowers/specs/2026-10-03-hq-brain-design.md.

import { EDGES, NODES, type Node } from "./workflows";

export const NOTE_TYPES = ["decision", "fact", "lesson", "playbook", "signal"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const TYPE_INFO: Record<NoteType, { folder: string; label: string; blurb: string; dated: boolean }> = {
  decision: { folder: "Decisions", label: "Decisions", blurb: "A rule someone decided, and why.", dated: false },
  fact: { folder: "Facts", label: "Facts", blurb: "What's true now: offer, prices, audience, voice, channels.", dated: false },
  lesson: { folder: "Lessons", label: "Lessons", blurb: "Something learned, with its evidence.", dated: true },
  playbook: { folder: "Playbooks", label: "Playbooks", blurb: "How to do a job, step by step.", dated: false },
  signal: { folder: "Signals", label: "Signals", blurb: "A dated hand-off from one department to another.", dated: true },
};

/** Types that can move up to the HQ brain. Facts and signals belong to one business. */
export const PROMOTABLE: NoteType[] = ["lesson", "playbook", "decision"];

export type Scope = "hq" | "business";

export type NoteMeta = {
  type: NoteType;
  dept: Node;
  title: string;
  status: "active" | "replaced";
  created?: string;
  updated?: string;
  evidence: string[];
  to: Node[];
  promotedTo?: string;
};

export type Access = { reads: Record<NoteType, "all" | Node[]>; writes: Record<NoteType, "all" | Node[] | false>; signalsTo: Node[] };

/** Departments whose signals reach this one (edges pointing at it). */
export const sendersTo = (n: Node): Node[] => [...new Set(EDGES.filter((e) => e.to === n).map((e) => e.from))];
/** Departments this one hands signals to. */
export const receiversFrom = (n: Node): Node[] => [...new Set(EDGES.filter((e) => e.from === n).map((e) => e.to))];

/** Who reads and writes what. Lessons: your own and those of the departments that feed you. */
export function access(n: Node): Access {
  if (n === "ceo") {
    return {
      reads: { decision: "all", fact: "all", lesson: "all", playbook: "all", signal: "all" },
      writes: { decision: ["ceo"], fact: false, lesson: ["ceo"], playbook: false, signal: "all" },
      signalsTo: NODES.filter((x) => x !== "ceo"),
    };
  }
  return {
    reads: { decision: "all", fact: "all", lesson: [n, ...sendersTo(n).filter((x) => x !== n)], playbook: [n], signal: [n] },
    writes: { decision: false, fact: [n], lesson: [n], playbook: [n], signal: receiversFrom(n) },
    signalsTo: receiversFrom(n),
  };
}

/** Does department `n` read a note of this type owned by `dept` and (for signals) sent to `to`? */
export function reads(n: Node, meta: Pick<NoteMeta, "type" | "dept" | "to">): boolean {
  const r = access(n).reads[meta.type];
  if (r === "all") return true;
  if (meta.type === "signal") return meta.to.includes(n);
  return r.includes(meta.dept);
}

// ---------- the note header ----------

const unquote = (v: string): unknown => {
  const t = v.trim();
  if (!t) return "";
  try { return JSON.parse(t); } catch { return t.replace(/^['"]|['"]$/g, ""); }
};

/** Parse YAML-ish frontmatter: `key: value` (JSON or bare) and block lists (`- item`). */
export function parseNote(text: string): { fields: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { fields: {}, body: text };
  const fields: Record<string, unknown> = {};
  let listKey: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) { (fields[listKey] as unknown[]).push(unquote(item[1])); continue; }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    if (kv[2].trim() === "") { fields[kv[1]] = []; listKey = kv[1]; } else { fields[kv[1]] = unquote(kv[2]); listKey = null; }
  }
  return { fields, body: text.slice(m[0].length) };
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);

/** Meta for a note, falling back to what its folder says (hand-written notes have no header). */
export function noteMeta(fields: Record<string, unknown>, fallback: { type: NoteType; dept: Node; title: string }): NoteMeta {
  const type = NOTE_TYPES.includes(fields.type as NoteType) ? (fields.type as NoteType) : fallback.type;
  const dept = typeof fields.dept === "string" && fields.dept ? fields.dept : fallback.dept;
  return {
    type, dept,
    title: typeof fields.title === "string" && fields.title ? fields.title : fallback.title,
    status: fields.status === "replaced" ? "replaced" : "active",
    created: typeof fields.created === "string" ? fields.created : undefined,
    updated: typeof fields.updated === "string" ? fields.updated : undefined,
    evidence: strList(fields.evidence),
    to: strList(fields.to),
    promotedTo: typeof fields.promoted_to === "string" ? fields.promoted_to : undefined,
  };
}

/** The header HQ writes: every value JSON-encoded (valid YAML), lists inline. */
export function formatNote(meta: NoteMeta, body: string, extra: Record<string, string> = {}): string {
  const f: Record<string, unknown> = { type: meta.type, dept: meta.dept, title: meta.title, status: meta.status, created: meta.created, updated: meta.updated };
  if (meta.evidence.length) f.evidence = meta.evidence;
  if (meta.to.length) f.to = meta.to;
  if (meta.promotedTo) f.promoted_to = meta.promotedTo;
  Object.assign(f, extra);
  const head = Object.entries(f).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n");
  return `---\n${head}\n---\n\n${body.trim()}\n`;
}

/** A file name from a title: no path separators or characters Obsidian can't link. */
export const noteFileName = (title: string) => title.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

/** A signal note as the Workflows hand-offs table shows it: who found it, for whom, and what. */
export type SignalFeedItem = {
  rel: string;
  from: Node;
  to: Node[];
  title: string;
  created?: string;
  status: "active" | "replaced";
  evidence: string[];
  body: string;
};

/** Signal notes one department handed another (a row of the hand-offs table), in the feed's order. */
export const signalsFor = (feed: SignalFeedItem[], from: Node, to: Node): SignalFeedItem[] =>
  feed.filter((s) => s.from === from && s.to.includes(to));

/** How many notes sit behind each hand-off, keyed `from>to`. A note sent to three departments counts once for each. */
export function signalCounts(feed: SignalFeedItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of feed) for (const t of new Set(s.to)) out[`${s.from}>${t}`] = (out[`${s.from}>${t}`] ?? 0) + 1;
  return out;
}
