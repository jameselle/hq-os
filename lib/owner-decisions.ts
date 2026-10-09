// The owner's open decisions for a business, in one list: calls only the owner can make (approvals, money,
// sign-ins, yes or no on something customer-facing) that a review, a department or a Claude session raised.
// Kept at $HQ_DATA/businesses/<slug>/owner-decisions.json (0600) and shown on the CEO tab as "decision" findings,
// alongside the ones HQ's own rules raise (weakest lever, playbook plans ready …). Due within two days turns a
// decision into "attention". Deciding one records the answer and files a decision note in the business's brain.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { writeNote } from "./brain-store";
import { businessDir, getProfile, vaultRoot } from "./store";
import { DECISION_LIMIT as LIMIT, NOTES_MAX, decisionId, decisionProblem, noteProblem, type DecisionInput, type DecisionNote, type OwnerDecision } from "./owner-decisions-findings";


export { awaitingReply, decisionFindings, decisionId, decisionProblem, type DecisionInput, type DecisionNote, type OwnerDecision } from "./owner-decisions-findings";

// ---------------------------------------------------------------- store

const file = (slug: string) => {
  if (!getProfile(slug)) throw Error("Unknown business");
  return path.join(businessDir(slug), "owner-decisions.json");
};

export function listDecisions(slug: string): OwnerDecision[] {
  try { return JSON.parse(fs.readFileSync(file(slug), "utf8")); } catch (e) { if ((e as Error).message === "Unknown business") throw e; return []; }
}

function save(slug: string, xs: OwnerDecision[]) {
  const f = file(slug), tmp = `${f}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(xs, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, f);
  mirror(slug, xs);
}

/** The list, with its notes, as a note in the business's vault (CEO/Open decisions.md), so it reads in Obsidian too. */
function mirror(slug: string, xs: OwnerDecision[]) {
  const p = getProfile(slug);
  if (!p) return;
  const by = (n: DecisionNote) => `${n.by === "owner" ? "You" : "Claude"}, ${n.at.slice(0, 10)}${n.editedAt ? " (edited)" : ""}`;
  const block = (d: OwnerDecision) => [
    `## ${d.title}`, "",
    `${d.status === "open" ? `Open${d.due ? `, due ${d.due}` : ""}` : `${d.status === "decided" ? "Decided" : "Dropped"} ${d.decidedAt?.slice(0, 10) ?? ""}${d.answer ? `: ${d.answer}` : ""}`} · ${d.dept} · \`${d.id}\``, "",
    d.why, "", `**How:** ${d.how}`, ...(d.recommend ? ["", `**Recommended:** ${d.recommend}`] : []),
    ...(d.notes?.length ? ["", "**Notes**", "", ...d.notes.map((n) => `- ${by(n)}: ${n.text.replace(/\n+/g, " ")}`)] : []), "",
  ];
  const open = xs.filter((d) => d.status === "open"), closed = xs.filter((d) => d.status !== "open").slice(-20).reverse();
  try {
    const dir = path.join(vaultRoot(p), "CEO");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "Open decisions.md"), [
      "# Open decisions", "", "Every call that's yours, with notes. Written by HQ (`npm run hq -- decision …`); add notes on the CEO tab.", "",
      ...open.flatMap(block), ...(closed.length ? ["# Recently closed", "", ...closed.flatMap(block)] : []),
    ].join("\n"));
  } catch { /* the vault is optional; the list itself is saved */ }
}

/** Add decisions; one already open with the same id is updated in place (so re-adding is safe). */
export function addDecisions(slug: string, inputs: DecisionInput[], now = new Date()): OwnerDecision[] {
  for (const x of inputs) { const bad = decisionProblem(x); if (bad) throw Error(`"${x?.title ?? "?"}": ${bad}`); }
  const xs = listDecisions(slug);
  const added: OwnerDecision[] = [];
  for (const x of inputs) {
    const id = x.id ?? decisionId(x.title);
    const fields = { title: x.title.trim(), why: x.why.trim(), how: x.how.trim(), dept: x.dept, recommend: x.recommend?.trim(), due: x.due, source: x.source?.trim() };
    const open = xs.find((d) => d.id === id && d.status === "open");
    if (open) { Object.assign(open, fields); added.push(open); continue; }
    if (xs.some((d) => d.id === id)) throw Error(`a decision "${id}" was already made or dropped; give the new one its own id`);
    const d: OwnerDecision = { id, ...fields, createdAt: now.toISOString(), status: "open" };
    xs.push(d);
    added.push(d);
  }
  save(slug, xs);
  return added;
}

function close(slug: string, id: string, status: "decided" | "dropped", answer: string | undefined, now: Date): OwnerDecision {
  const xs = listDecisions(slug);
  const d = xs.find((x) => x.id === id);
  if (!d) throw Error(`no decision ${id}`);
  if (d.status !== "open") throw Error(`decision ${id} is already ${d.status}`);
  Object.assign(d, { status, decidedAt: now.toISOString(), answer: answer?.trim().slice(0, LIMIT.text) || undefined });
  save(slug, xs);
  return d;
}

/** The owner made the call: record it, and file it as a decision in the brain so the next review knows. */
export function decide(slug: string, id: string, answer: string, now = new Date()): OwnerDecision {
  if (!answer?.trim()) throw Error("say what was decided (--answer)");
  const d = close(slug, id, "decided", answer, now);
  try {
    writeNote("business", slug, { type: "decision", dept: "ceo", title: d.title.slice(0, 110), body: `${answer.trim()}\n\nWhy it was the owner's call: ${d.why}`, evidence: [`owner decision ${d.id}`] });
  } catch { /* a note with this title exists already; the decision itself is recorded */ }
  return d;
}

/** Add a note to a decision (open or closed): the owner's from the CEO tab, Claude's from the CLI. */
export function addDecisionNote(slug: string, id: string, text: string, by: DecisionNote["by"], now = new Date()): DecisionNote {
  const bad = noteProblem(text);
  if (bad) throw Error(bad);
  const xs = listDecisions(slug);
  const d = xs.find((x) => x.id === id);
  if (!d) throw Error(`no decision ${id}`);
  if ((d.notes?.length ?? 0) >= NOTES_MAX) throw Error(`decision ${id} has ${NOTES_MAX} notes already`);
  const n: DecisionNote = { at: now.toISOString(), by, text: text.trim() };
  d.notes = [...(d.notes ?? []), n];
  save(slug, xs);
  return n;
}

/** Edit or delete note number `n` (1-based). The owner can change only their own notes; Claude only its own. */
export function changeDecisionNote(slug: string, id: string, n: number, by: DecisionNote["by"], text: string | null, now = new Date()): void {
  const xs = listDecisions(slug);
  const d = xs.find((x) => x.id === id);
  if (!d) throw Error(`no decision ${id}`);
  const note = Number.isInteger(n) ? d.notes?.[n - 1] : undefined;
  if (!note) throw Error(`decision ${id} has no note ${n}`);
  if (note.by !== by) throw Error(`note ${n} is ${note.by === "owner" ? "the owner's" : "Claude's"}; only its writer can change it`);
  if (text === null) d.notes!.splice(n - 1, 1);
  else {
    const bad = noteProblem(text);
    if (bad) throw Error(bad);
    Object.assign(note, { text: text.trim(), editedAt: now.toISOString() });
  }
  save(slug, xs);
}

export const dropDecision = (slug: string, id: string, note?: string, now = new Date()) => close(slug, id, "dropped", note, now);
