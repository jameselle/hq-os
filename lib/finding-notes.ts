// Notes on the CEO's attention and critical findings (a cost that jumped, burn, a broken job …), like the notes on
// the owner's decisions: the owner writes on the CEO tab, Claude reads and answers from the CLI, each writer changes
// only their own. Keyed by finding id per business, at $HQ_DATA/businesses/<slug>/finding-notes.json (0600), and
// mirrored to the vault's CEO/Notes on findings.md. Notes outlive the finding: when it clears, they stay as history.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { NOTES_MAX, noteProblem, type DecisionNote } from "./owner-decisions-findings";
import { businessDir, getProfile, vaultRoot } from "./store";

export type FindingNotes = Record<string, { title?: string; notes: DecisionNote[] }>;
/** Severities that carry a notes thread on the CEO tab. (Decisions use the owner-decision notes.) */
export const NOTE_SEVERITIES = ["critical", "attention"] as const;

const file = (slug: string) => {
  if (!getProfile(slug)) throw Error("Unknown business");
  return path.join(businessDir(slug), "finding-notes.json");
};

export function readFindingNotes(slug: string): FindingNotes {
  try { return JSON.parse(fs.readFileSync(file(slug), "utf8")); } catch (e) { if ((e as Error).message === "Unknown business") throw e; return {}; }
}

function save(slug: string, all: FindingNotes) {
  const f = file(slug), tmp = `${f}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, f);
  const p = getProfile(slug);
  if (!p) return;
  try {
    const dir = path.join(vaultRoot(p), "CEO");
    fs.mkdirSync(dir, { recursive: true });
    const by = (n: DecisionNote) => `${n.by === "owner" ? "You" : "Claude"}, ${n.at.slice(0, 10)}${n.editedAt ? " (edited)" : ""}`;
    fs.writeFileSync(path.join(dir, "Notes on findings.md"), [
      "# Notes on findings", "", "Notes on the CEO tab's urgent and needs-fixing findings. Written by HQ; add notes on the CEO tab.", "",
      ...Object.entries(all).filter(([, v]) => v.notes.length).flatMap(([id, v]) => [
        `## ${v.title ?? id}`, "", `\`${id}\``, "", ...v.notes.map((n) => `- ${by(n)}: ${n.text.replace(/\n+/g, " ")}`), ""]),
    ].join("\n"));
  } catch { /* the vault is optional */ }
}

const FINDING_ID = /^[a-z0-9][a-z0-9-]{0,120}$/;

/** Add a note to a finding. `title` is kept so the note still reads once the finding has cleared. */
export function addFindingNote(slug: string, id: string, text: string, by: DecisionNote["by"], title?: string, now = new Date()): DecisionNote {
  if (!FINDING_ID.test(id)) throw Error(`not a finding id: ${id}`);
  const bad = noteProblem(text);
  if (bad) throw Error(bad);
  const all = readFindingNotes(slug);
  const entry = all[id] ?? { notes: [] };
  if (entry.notes.length >= NOTES_MAX) throw Error(`finding ${id} has ${NOTES_MAX} notes already`);
  const n: DecisionNote = { at: now.toISOString(), by, text: text.trim() };
  all[id] = { title: title?.slice(0, 200) ?? entry.title, notes: [...entry.notes, n] };
  save(slug, all);
  return n;
}

/** Edit or delete note number `n` (1-based) on a finding; only its writer may. */
export function changeFindingNote(slug: string, id: string, n: number, by: DecisionNote["by"], text: string | null, now = new Date()): void {
  const all = readFindingNotes(slug);
  const note = Number.isInteger(n) ? all[id]?.notes[n - 1] : undefined;
  if (!note) throw Error(`finding ${id} has no note ${n}`);
  if (note.by !== by) throw Error(`note ${n} is ${note.by === "owner" ? "the owner's" : "Claude's"}; only its writer can change it`);
  if (text === null) all[id].notes.splice(n - 1, 1);
  else {
    const bad = noteProblem(text);
    if (bad) throw Error(bad);
    Object.assign(note, { text: text.trim(), editedAt: now.toISOString() });
  }
  if (!all[id].notes.length) delete all[id];
  save(slug, all);
}
