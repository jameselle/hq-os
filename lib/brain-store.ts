// The brain on disk: the HQ brain ($HQ_DATA/brain) and each business's vault. Server-only.
// Reads typed folders plus the legacy ones (CEO/Decisions, Departments/<Label>/SOPs) so nothing has to
// move; writes typed notes; promotes a business note to the HQ brain only if it names no business.

import fs from "node:fs";
import path from "node:path";

import {
  NOTE_TYPES, PROMOTABLE, TYPE_INFO, access, formatNote, noteFileName, noteMeta, parseNote, reads,
  type NoteMeta, type NoteType, type Scope,
} from "./brain";
import { DEPARTMENTS } from "./registry";
import { getProfile, hqData, listBusinesses, vaultRoot } from "./store";
import { NODES, type Node } from "./workflows";

export const hqBrainRoot = () => path.join(hqData(), "brain");

export type BrainNote = { scope: Scope; rel: string; file: string; meta: NoteMeta; body: string; mtime: number };

const today = () => new Date().toISOString().slice(0, 10);
/** The department whose folder this is (store.ts names folders with this same rule). */
const deptBySafeLabel = (label: string): Node | null =>
  DEPARTMENTS.find((d) => d.label.replace(/[\\/:*?"<>|]/g, "-") === label)?.slug ?? null;
const isIndex = (rel: string) => {
  const parts = rel.split("/");
  return parts.length >= 2 && parts[parts.length - 1] === `${parts[parts.length - 2]}.md`;
};

function mdFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? mdFiles(path.join(dir, e.name)) : e.name.endsWith(".md") ? [path.join(dir, e.name)] : [],
    );
  } catch { return []; }
}

function load(scope: Scope, root: string, file: string, fallback: { type: NoteType; dept: Node }): BrainNote | null {
  const rel = path.relative(root, file).split(path.sep).join("/");
  if (isIndex(rel)) return null;
  try {
    const text = fs.readFileSync(file, "utf8");
    const { fields, body } = parseNote(text);
    const meta = noteMeta(fields, { ...fallback, title: path.basename(file, ".md").replace(/^\d{4}-\d{2}-\d{2} /, "") });
    return { scope, rel, file, meta, body, mtime: fs.statSync(file).mtimeMs };
  } catch { return null; }
}

/** Every note in one brain: the typed folders, then the legacy decision and SOP folders. */
export function listNotes(scope: Scope, root: string): BrainNote[] {
  const out: BrainNote[] = [];
  for (const t of NOTE_TYPES) for (const f of mdFiles(path.join(root, TYPE_INFO[t].folder))) {
    const n = load(scope, root, f, { type: t, dept: "ceo" });
    if (n) out.push(n);
  }
  for (const f of mdFiles(path.join(root, "CEO", "Decisions"))) {
    const n = load(scope, root, f, { type: "decision", dept: "ceo" });
    if (n) out.push(n);
  }
  const depts = path.join(root, "Departments");
  for (const label of fs.existsSync(depts) ? fs.readdirSync(depts) : []) {
    const dept = deptBySafeLabel(label);
    if (!dept) continue;
    for (const f of mdFiles(path.join(depts, label, "SOPs"))) {
      const n = load(scope, root, f, { type: "playbook", dept });
      if (n) out.push(n);
    }
  }
  return out;
}

function businessRoot(slug: string): string {
  const p = getProfile(slug);
  if (!p) throw new Error(`no such business: ${slug}`);
  return vaultRoot(p);
}

/** Both brains' notes for a business (HQ brain first in the array; callers sort). An HQ note promoted
 *  from this business is left out: its original, with the business's specifics, is already here. */
export function allNotes(slug: string): BrainNote[] {
  const own = listNotes("business", businessRoot(slug));
  const promoted = new Set(own.map((n) => n.meta.promotedTo).filter(Boolean));
  return [...listNotes("hq", hqBrainRoot()).filter((n) => !promoted.has(n.rel)), ...own];
}

/** Names and slugs of every real (non-demo) business: none of them may appear in the HQ brain. */
export function privateNames(): string[] {
  return listBusinesses().profiles.filter((p) => !p.demo).flatMap((p) => [p.name, p.slug]).filter((s) => s.length >= 3);
}
export function namesIn(text: string, names = privateNames()): string[] {
  const low = text.toLowerCase();
  return [...new Set(names.filter((n) => low.includes(n.toLowerCase())))];
}

// ---------- init ----------

const INDEX_BODY = (t: NoteType, hq: boolean) =>
  `# ${TYPE_INFO[t].label}\n\n${TYPE_INFO[t].blurb}\n\n` +
  (hq ? "This is the **HQ brain**: true for every business. Never a business's name, customers, numbers or accounts.\n\n" : "") +
  "Write with `npm run hq -- brain write`, or by hand: the folder sets the type. Departments read these with `npm run hq -- brain read <slug> <dept>`.\n";

function ensureFolders(root: string, hq: boolean): string[] {
  const made: string[] = [];
  for (const t of NOTE_TYPES) {
    const dir = path.join(root, TYPE_INFO[t].folder);
    const idx = path.join(dir, `${TYPE_INFO[t].folder}.md`);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(idx)) { fs.writeFileSync(idx, INDEX_BODY(t, hq)); made.push(idx); }
  }
  return made;
}

/** Create the HQ brain and add the typed folders to every business vault. Safe to run again. */
export function initBrain(): { hq: string; made: string[] } {
  const root = hqBrainRoot();
  const made = ensureFolders(root, true);
  const start = path.join(root, "Start Here.md");
  if (!fs.existsSync(start)) {
    fs.writeFileSync(start, "# HQ brain\n\nWhat's true for every business: playbooks, lessons that held up, decisions about how we work, tool notes.\n\n" +
      "Each business has its own vault for its facts, customers and numbers. A lesson moves up here only when the CEO proposes it and the owner says yes (`hq brain promote`), rewritten so it names no business.\n\n" +
      NOTE_TYPES.map((t) => `- [[${TYPE_INFO[t].folder}/${TYPE_INFO[t].folder}|${TYPE_INFO[t].label}]]: ${TYPE_INFO[t].blurb}`).join("\n") + "\n");
    made.push(start);
  }
  fs.mkdirSync(path.join(root, ".obsidian"), { recursive: true });
  for (const p of listBusinesses().profiles) made.push(...ensureFolders(vaultRoot(p), false));
  return { hq: root, made };
}

// ---------- read ----------

const ORDER: NoteType[] = ["decision", "fact", "lesson", "playbook", "signal"];
const SIGNAL_DAYS = 30;

/** The notes a department reads, in reading order: decisions, facts (own first), lessons (business
 *  first), playbooks, recent signals to it. Replaced notes are skipped. */
export function readingList(slug: string, dept: Node, now = Date.now()): BrainNote[] {
  if (!NODES.includes(dept)) throw new Error(`no such department: ${dept}`);
  const notes = allNotes(slug).filter((n) => n.meta.status === "active" && reads(dept, n.meta))
    .filter((n) => n.meta.type !== "signal" || now - n.mtime <= SIGNAL_DAYS * 864e5);
  const rank = (n: BrainNote) => [ORDER.indexOf(n.meta.type), n.meta.dept === dept ? 0 : 1, n.scope === "business" ? 0 : 1, -n.mtime];
  return notes.sort((a, b) => {
    const x = rank(a), y = rank(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  });
}

/** The reading bundle as text, trimmed to a character budget; titles left out are listed. */
export function readBundle(slug: string, dept: Node, chars = 12000): string {
  const list = readingList(slug, dept);
  const out: string[] = [`# Brain for ${dept === "ceo" ? "CEO" : DEPARTMENTS.find((d) => d.slug === dept)?.label} (${list.length} notes)\n`];
  let used = out[0].length;
  const skipped: string[] = [];
  for (const n of list) {
    const body = n.body.trim().length > 1500 ? `${n.body.trim().slice(0, 1500)}…` : n.body.trim();
    const block = `## ${TYPE_INFO[n.meta.type].label.replace(/s$/, "")} · ${n.meta.title}\n_${n.scope === "hq" ? "HQ brain" : "business"} · ${n.rel}${n.meta.evidence.length ? ` · evidence: ${n.meta.evidence.join(", ")}` : ""}_\n\n${body}\n`;
    if (used + block.length > chars) { skipped.push(`${n.meta.title} (${n.rel})`); continue; }
    out.push(block); used += block.length;
  }
  if (skipped.length) out.push(`\nAlso in the brain, not shown (over ${chars} characters):\n${skipped.map((s) => `- ${s}`).join("\n")}\n`);
  return out.join("\n");
}

// ---------- write ----------

export type NoteInput = { type: NoteType; dept: Node; title: string; body: string; evidence?: string[]; to?: Node[]; status?: "active" | "replaced"; promoted?: boolean };

function check(input: NoteInput) {
  if (!NOTE_TYPES.includes(input.type)) throw new Error(`type must be one of ${NOTE_TYPES.join(", ")}`);
  if (!NODES.includes(input.dept)) throw new Error(`no such department: ${input.dept}`);
  if (!input.title?.trim() || input.title.length > 120) throw new Error("title is required (at most 120 characters)");
  if (!input.body?.trim()) throw new Error("body is required");
  const w = access(input.dept).writes[input.type];
  if (w === false) throw new Error(`${input.dept} doesn't write ${input.type}s`);
  if (input.type === "signal") {
    const to = input.to ?? [];
    if (!to.length) throw new Error("a signal needs `to`: the departments it's for");
    const allowed = w === "all" ? NODES : w;
    const bad = to.filter((t) => !allowed.includes(t));
    if (bad.length) throw new Error(`${input.dept} doesn't hand signals to ${bad.join(", ")} (see the Workflows web)`);
  }
}

/** File a note in a brain. Facts, decisions and playbooks are named by title and updated in place;
 *  lessons and signals are dated. The HQ brain refuses text that names a business. */
export function writeNote(scope: Scope, slug: string | null, input: NoteInput): string {
  check(input);
  const root = scope === "hq" ? hqBrainRoot() : businessRoot(slug ?? "");
  if (scope === "hq") {
    const hits = namesIn(`${input.title}\n${input.body}\n${(input.evidence ?? []).join("\n")}`);
    if (hits.length) throw new Error(`the HQ brain is shared by every business: remove ${hits.map((h) => `"${h}"`).join(", ")} first`);
  }
  const info = TYPE_INFO[input.type];
  const dir = path.join(root, info.folder);
  fs.mkdirSync(dir, { recursive: true });
  const name = info.dated ? `${today()} ${noteFileName(input.title)}` : noteFileName(input.title);
  const file = path.join(dir, `${name}.md`);
  let created = today();
  if (fs.existsSync(file)) {
    if (info.dated) throw new Error(`already written today: ${path.relative(root, file)}`);
    created = noteMeta(parseNote(fs.readFileSync(file, "utf8")).fields, { type: input.type, dept: input.dept, title: input.title }).created ?? created;
  }
  const meta: NoteMeta = { type: input.type, dept: input.dept, title: input.title.trim(), status: input.status ?? "active", created, updated: today(), evidence: input.evidence ?? [], to: input.to ?? [] };
  const business = scope === "business" ? getProfile(slug!)?.name : undefined;
  const text = formatNote(meta, input.body, business ? { business } : input.promoted ? { promoted: today() } : {});
  if (scope === "hq") {
    const hits = namesIn(text);
    if (hits.length) throw new Error(`the HQ brain is shared by every business: the note would name ${hits.map((h) => `"${h}"`).join(", ")}`);
  }
  fs.writeFileSync(file, text);
  return file;
}

/** Copy a business lesson, playbook or decision up to the HQ brain, optionally rewritten. The business
 *  note links up to the copy; the copy names no business, path or post. Refuses if it would. */
export function promote(slug: string, rel: string, over: { title?: string; body?: string } = {}): string {
  const root = businessRoot(slug);
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) throw new Error(`no such note in ${slug}'s vault: ${rel}`);
  const note = listNotes("business", root).find((n) => n.file === file);
  if (!note) throw new Error(`${rel} isn't a brain note (Decisions, Lessons, Playbooks, or a legacy decision or SOP)`);
  if (!PROMOTABLE.includes(note.meta.type)) throw new Error(`${note.meta.type}s stay in their business: only ${PROMOTABLE.join(", ")} move up`);
  if (note.meta.promotedTo) throw new Error(`already promoted: ${note.meta.promotedTo}`);
  const title = over.title ?? note.meta.title;
  const body = over.body ?? note.body;
  const hits = namesIn(`${title}\n${body}`);
  if (hits.length) throw new Error(`rewrite it without ${hits.map((h) => `"${h}"`).join(", ")} first (--title and --body)`);
  // The HQ copy says it was promoted, never from where: a business's name, path or post links stay in
  // its own vault, which links up to the copy (promoted_to).
  const hq = writeNote("hq", null, { type: note.meta.type, dept: note.meta.dept, title, body, promoted: true });
  const hqRel = path.relative(hqBrainRoot(), hq).split(path.sep).join("/");
  const orig = fs.readFileSync(file, "utf8");
  const parsed = parseNote(orig);
  const meta = { ...note.meta, promotedTo: hqRel, updated: today() };
  fs.writeFileSync(file, formatNote(meta, parsed.body, typeof parsed.fields.business === "string" ? { business: parsed.fields.business } : {}));
  return hq;
}

// ---------- the visual ----------

export type BrainStats = {
  counts: Record<Scope, Record<NoteType, number>>;
  perDept: Record<string, { reads: number; owns: number; top: { scope: Scope; type: NoteType; title: string }[] }>;
  recent: { scope: Scope; type: NoteType; dept: Node; title: string; day: string }[];
  candidates: number;
  hqExists: boolean;
};

export function brainStats(slug: string): BrainStats {
  const zero = () => Object.fromEntries(NOTE_TYPES.map((t) => [t, 0])) as Record<NoteType, number>;
  const counts: BrainStats["counts"] = { hq: zero(), business: zero() };
  let notes: BrainNote[] = [];
  try { notes = allNotes(slug); } catch { /* unknown business */ }
  // Counts show what each brain holds, including HQ copies of this business's own promoted notes
  // (allNotes leaves those out of reading so nothing is read twice).
  let business: BrainNote[] = [];
  try { business = listNotes("business", businessRoot(slug)); } catch { /* unknown business */ }
  for (const n of [...listNotes("hq", hqBrainRoot()), ...business]) if (n.meta.status === "active") counts[n.scope][n.meta.type]++;
  const perDept: BrainStats["perDept"] = {};
  for (const d of NODES) {
    const mine = notes.filter((n) => n.meta.status === "active" && reads(d, n.meta)).sort((a, b) => b.mtime - a.mtime);
    perDept[d] = {
      reads: mine.length,
      owns: notes.filter((n) => n.meta.dept === d).length,
      top: mine.slice(0, 3).map((n) => ({ scope: n.scope, type: n.meta.type, title: n.meta.title })),
    };
  }
  const recent = [...notes].sort((a, b) => b.mtime - a.mtime).slice(0, 8)
    .map((n) => ({ scope: n.scope, type: n.meta.type, dept: n.meta.dept, title: n.meta.title, day: new Date(n.mtime).toISOString().slice(0, 10) }));
  const candidates = notes.filter((n) => n.scope === "business" && n.meta.type === "lesson" && n.meta.status === "active" && n.meta.evidence.length && !n.meta.promotedTo).length;
  return { counts, perDept, recent, candidates, hqExists: fs.existsSync(hqBrainRoot()) };
}

/** Promotion candidates: active business lessons with evidence, not yet promoted. */
export function candidates(slug: string): BrainNote[] {
  return listNotes("business", businessRoot(slug))
    .filter((n) => n.meta.type === "lesson" && n.meta.status === "active" && n.meta.evidence.length && !n.meta.promotedTo)
    .sort((a, b) => b.mtime - a.mtime);
}
