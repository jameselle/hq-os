"use client";
// Buttons for the SEO page's blog drafts and mode. Every action posts to /api/blog and reloads the page's data.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, RotateCcw, MessageSquare } from "lucide-react";

const btn = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-40";
const plain = `${btn} border-bb-border text-bb-muted hover:bg-bb-surface hover:text-bb-fg`;

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/blog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(j.error ?? "Could not update");
      setMsg(done); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not update"); } finally { setBusy(false); }
  };
  return { busy, msg, act };
}

export function DraftActions({ draft, title, status, blocked, why }: { draft: string; title: string; status: string; blocked: boolean; why: string }) {
  const { busy, msg, act } = useAct();
  const [note, setNote] = useState("");
  const [noting, setNoting] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status !== "approved" && (
          <button type="button" disabled={busy || blocked} title={blocked ? why : undefined} className={`${btn} border-bb-accent/50 bg-bb-accent/15 text-bb-accent hover:bg-bb-accent/25`}
            onClick={() => { if (confirm(`Approve "${title}"? It publishes on the next hourly run.`)) void act({ action: "approve", draft }, "Approved: it publishes on the next run."); }}>
            <Check size={14} /> Approve
          </button>
        )}
        {status === "approved"
          ? <button type="button" disabled={busy} className={plain} onClick={() => void act({ action: "reopen", draft }, "Back to waiting for you.")}><RotateCcw size={14} /> Undo approve</button>
          : <button type="button" disabled={busy} className={`${btn} border-bb-danger/40 text-bb-danger hover:bg-bb-danger/10`}
              onClick={() => { if (confirm(`Reject "${title}"? It will never be published.`)) void act({ action: "reject", draft }, "Rejected."); }}><X size={14} /> Reject</button>}
        <button type="button" disabled={busy} className={plain} onClick={() => setNoting((v) => !v)}><MessageSquare size={14} /> Add a note</button>
      </div>
      {noting && (
        <div className="flex flex-wrap gap-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What should change, or what to write about next time" className="min-w-[16rem] flex-1 rounded-lg border border-bb-border bg-bb-surface px-3 py-2 text-[12.5px]" />
          <button type="button" disabled={busy || !note.trim()} className={plain} onClick={() => void act({ action: "note", draft, text: note }, "Note saved. The next run reads it.").then(() => { setNote(""); setNoting(false); })}>Save note</button>
        </div>
      )}
      {msg && <p className="text-[12px] text-bb-muted">{msg}</p>}
    </div>
  );
}

export function BlogMode({ mode }: { mode: "off" | "draft" | "auto" }) {
  const { busy, msg, act } = useAct();
  const opts: [typeof mode, string][] = [["off", "Off"], ["draft", "Ask me"], ["auto", "Auto"]];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Blog mode" className="inline-flex rounded-lg border border-bb-border p-0.5">
        {opts.map(([m, label]) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={busy || mode === m}
            className={`rounded-md px-3 py-1 text-[12.5px] ${mode === m ? "bg-bb-surface2 text-bb-fg" : "text-bb-muted hover:text-bb-fg"}`}
            onClick={() => { if (m !== "auto" || confirm("Auto publishes every post that passes its checks, once week one is over. Posts that fail a check still wait for you.")) void act({ action: "mode", mode: m }, `Now ${label}.`); }}>{label}</button>
        ))}
      </div>
      {msg && <span className="text-[12px] text-bb-muted">{msg}</span>}
    </div>
  );
}
