"use client";

// The notes under one of the owner's decisions, or under an attention or critical finding (kind "finding"), on the
// CEO tab: the thread (the owner's and Claude's), a box to add one, and edit or delete on the owner's own. Claude
// reads and answers them with `hq decision show|note` or `hq finding show|note`.
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DecisionNote } from "@/lib/owner-decisions-findings";

const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function DecisionNotes({ id, notes, kind = "decision", title }: { id: string; notes: DecisionNote[]; kind?: "decision" | "finding"; title?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (body: Record<string, unknown>, done: () => void) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, kind, ...(title ? { title } : {}), ...body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(j.error ?? "Could not save the note");
      done();
      router.refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const btn = "rounded-md border border-bb-border px-2 py-0.5 text-[10.5px] text-bb-muted hover:text-bb-fg hover:bg-bb-surface disabled:opacity-40";
  return (
    <div className="mt-2 space-y-1.5 border-t border-dashed border-bb-border pt-2">
      {notes.map((n, i) => (
        <div key={`${n.at}-${i}`} className={`rounded-md px-2.5 py-1.5 text-[12px] ${n.by === "owner" ? "bg-bb-blue/10" : "bg-bb-surface"}`}>
          <div className="flex items-center gap-2 font-mono text-[10px] text-bb-dim">
            <span className={n.by === "owner" ? "text-bb-blue" : "text-bb-teal"}>{n.by === "owner" ? "You" : "Claude"}</span>
            <span>{when(n.at)}{n.editedAt ? " · edited" : ""}</span>
            {n.by === "owner" && editing !== i && (
              <span className="ml-auto flex gap-1">
                <button type="button" className={btn} disabled={busy} onClick={() => { setEditing(i); setEditText(n.text); }}>Edit</button>
                <button type="button" className={btn} disabled={busy} onClick={() => window.confirm("Delete this note?") && send({ action: "delete", n: i + 1 }, () => {})}>Delete</button>
              </span>
            )}
          </div>
          {editing === i ? (
            <div className="mt-1 space-y-1">
              <textarea aria-label="Edit note" value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} maxLength={1000}
                className="w-full rounded-md border border-bb-border bg-bb-surface px-2 py-1 text-[12px] text-bb-fg" />
              <div className="flex gap-1.5">
                <button type="button" className={btn} disabled={busy || !editText.trim()} onClick={() => send({ action: "edit", n: i + 1, text: editText }, () => setEditing(null))}>Save</button>
                <button type="button" className={btn} disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap text-bb-fg/90">{n.text}</p>
          )}
        </div>
      ))}
      {open ? (
        <div className="space-y-1">
          <textarea aria-label="Add a note" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} autoFocus
            placeholder="Your thinking, a question, or what you've decided so far. Claude reads these."
            className="w-full rounded-md border border-bb-border bg-bb-surface px-2 py-1 text-[12px] text-bb-fg placeholder:text-bb-dim" />
          <div className="flex gap-1.5">
            <button type="button" className={btn} disabled={busy || !text.trim()} onClick={() => send({ action: "note", text }, () => { setText(""); setOpen(false); })}>{busy ? "Saving…" : "Save note"}</button>
            <button type="button" className={btn} disabled={busy} onClick={() => { setOpen(false); setText(""); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className={btn} onClick={() => setOpen(true)}>{notes.length ? "Add a note" : "Add a note for Claude"}</button>
      )}
      {error && <p role="alert" className="text-[11.5px] text-bb-danger">{error}</p>}
    </div>
  );
}
