// The owner's notes on automated emails: "make this shorter", "don't send to trial users", "rewrite the subject".
// Kept per business in $HQ_DATA (0600) and mirrored to the business vault (Departments/Email & Lifecycle/Owner notes.md),
// so the Email department and /hq:lifecycle pick them up and act on them. Server-only.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { businessDir, getProfile, vaultRoot } from "./store";

export type LifecycleNote = { id: string; at: string; flow: string; message: string | null; text: string; done: string | null };

const LIMIT = { text: 1000, notes: 500 };
const file = (slug: string) => {
  if (!getProfile(slug)) throw Error("Unknown business");
  return path.join(businessDir(slug), "lifecycle-notes.json");
};
const ID = /^[a-z0-9][a-z0-9-]{0,60}$/;

export function listNotes(slug: string): LifecycleNote[] {
  try { return JSON.parse(fs.readFileSync(file(slug), "utf8")); } catch (e) { if ((e as Error).message === "Unknown business") throw e; return []; }
}

function save(slug: string, notes: LifecycleNote[]) {
  const f = file(slug), tmp = `${f}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(notes, null, 1) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, f);
  mirror(slug, notes);
}

/** The vault copy: open notes first, newest first; done ones below. */
function mirror(slug: string, notes: LifecycleNote[]) {
  const profile = getProfile(slug);
  if (!profile) return;
  try {
    const dir = path.join(vaultRoot(profile), "Departments", "Email & Lifecycle");
    fs.mkdirSync(dir, { recursive: true });
    const line = (n: LifecycleNote) => `- ${n.done ? "[x]" : "[ ]"} **${n.flow}${n.message ? ` / ${n.message}` : ""}** (${n.at.slice(0, 10)}): ${n.text.replace(/\n+/g, " ")}`;
    const open = notes.filter((n) => !n.done).reverse(), done = notes.filter((n) => n.done).reverse();
    fs.writeFileSync(path.join(dir, "Owner notes.md"), [
      "# Owner notes on automated emails", "",
      "Written from HQ's Email & Lifecycle page. An open note is work for the Email department: change the email or the flow, then mark it done in HQ.", "",
      "## Open", "", ...(open.length ? open.map(line) : ["None."]), "",
      "## Done", "", ...(done.length ? done.map(line) : ["None."]), "",
    ].join("\n"));
  } catch { /* the vault is optional; HQ's copy is the record */ }
}

export function addNote(slug: string, x: { flow: string; message?: string | null; text: string }, now = new Date()): LifecycleNote {
  const text = String(x.text ?? "").trim();
  if (!text) throw Error("Write something first");
  if (text.length > LIMIT.text) throw Error(`Keep a note under ${LIMIT.text} characters`);
  if (!ID.test(x.flow)) throw Error("Unknown flow");
  if (x.message != null && !ID.test(x.message)) throw Error("Unknown message");
  const notes = listNotes(slug);
  const note: LifecycleNote = { id: randomUUID(), at: now.toISOString(), flow: x.flow, message: x.message ?? null, text, done: null };
  save(slug, [...notes, note].slice(-LIMIT.notes));
  return note;
}

export function setNoteDone(slug: string, id: string, done: boolean, now = new Date()): LifecycleNote {
  const notes = listNotes(slug);
  const n = notes.find((x) => x.id === id);
  if (!n) throw Error("No such note");
  n.done = done ? now.toISOString() : null;
  save(slug, notes);
  return n;
}
