"use client";
// Buttons for the week's social posts and the comment-reply queue on the Content & Social page. Every action posts
// to /api/social.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, RotateCcw, MessageSquare, Copy, Link as LinkIcon } from "lucide-react";

const btn = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-40";
const plain = `${btn} border-bb-border text-bb-muted hover:bg-bb-surface hover:text-bb-fg`;

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(j.error ?? "Could not update");
      setMsg(done); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not update"); } finally { setBusy(false); }
  };
  return { busy, msg, act, setMsg };
}

export function PostActions({ id, status, blocked, why, hand, caption }: { id: string; status: string; blocked: boolean; why: string; hand: boolean; caption: string }) {
  const { busy, msg, act, setMsg } = useAct();
  const [note, setNote] = useState(""), [noting, setNoting] = useState(false);
  const [url, setUrl] = useState(""), [posting, setPosting] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "approved"
          ? <button type="button" disabled={busy} className={plain} onClick={() => void act({ action: "reopen", id }, "Back to waiting for you.")}><RotateCcw size={14} /> Undo approve</button>
          : <>
            <button type="button" disabled={busy || blocked} title={blocked ? why : undefined} className={`${btn} border-bb-accent/50 bg-bb-accent/15 text-bb-accent hover:bg-bb-accent/25`}
              onClick={() => void act({ action: "approve", id }, hand ? "Approved: post it by hand on its day, then add the link." : status === "failed" ? "Approved again: HQ tries to post it at its next run." : "Approved: HQ posts it on its day.")}><Check size={14} /> {status === "failed" ? "Approve again" : "Approve"}</button>
            <button type="button" disabled={busy} className={`${btn} border-bb-danger/40 text-bb-danger hover:bg-bb-danger/10`}
              onClick={() => { if (confirm("Reject this post? It won't go out.")) void act({ action: "reject", id }, "Rejected."); }}><X size={14} /> Reject</button>
          </>}
        <button type="button" className={plain} onClick={() => { void navigator.clipboard.writeText(caption).then(() => setMsg("Caption copied.")); }}><Copy size={14} /> Copy caption</button>
        <button type="button" disabled={busy} className={plain} onClick={() => setNoting((v) => !v)}><MessageSquare size={14} /> Add a note</button>
        {(status === "approved" || status === "failed") && <button type="button" disabled={busy} className={plain} onClick={() => setPosting((v) => !v)}><LinkIcon size={14} /> I posted it</button>}
      </div>
      {noting && <div className="flex flex-wrap gap-2">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What to change, or what to post about next week" className="min-w-[16rem] flex-1 rounded-lg border border-bb-border bg-bb-surface px-3 py-2 text-[12.5px]" />
        <button type="button" disabled={busy || !note.trim()} className={plain} onClick={() => void act({ action: "note", id, text: note }, "Note saved. Next week's drafts read it.").then(() => { setNote(""); setNoting(false); })}>Save note</button>
      </div>}
      {posting && <div className="flex flex-wrap gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… link to the live post" className="min-w-[16rem] flex-1 rounded-lg border border-bb-border bg-bb-surface px-3 py-1.5 text-[12.5px]" />
        <button type="button" disabled={busy || !/^https:\/\//.test(url)} className={plain} onClick={() => void act({ action: "posted", id, url }, "Recorded as posted.").then(() => setPosting(false))}>Save</button>
      </div>}
      {msg && <p className="text-[12px] text-bb-muted">{msg}</p>}
    </div>
  );
}

/** One drafted comment reply: edit the wording if needed, then approve (HQ posts it at its next hourly run) or reject. */
export function ReplyActions({ id, reply, status, max }: { id: string; reply: string; status: string; max: number }) {
  const { busy, msg, act } = useAct();
  const [text, setText] = useState(reply);
  const dash = /[–—]/.test(text), long = text.trim().length > max;
  return (
    <div className="space-y-2">
      <textarea aria-label="Reply" value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(6, Math.max(2, Math.ceil(text.length / 70)))}
        className="w-full rounded-lg border border-bb-border bg-bb-surface px-3 py-2 text-[12.5px]" />
      {(dash || long) && <p className="text-[12px] text-bb-warn">{dash ? "Take out the em or en dash. " : ""}{long ? `At most ${max} characters.` : ""}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !text.trim() || dash || long} className={`${btn} border-bb-accent/50 bg-bb-accent/15 text-bb-accent hover:bg-bb-accent/25`}
          onClick={() => void act({ action: "reply-approve", id, text }, "Approved: HQ replies at its next hourly run.")}><Check size={14} /> {status === "failed" ? "Approve again" : text.trim() !== reply.trim() ? "Approve edited reply" : "Approve"}</button>
        <button type="button" disabled={busy} className={`${btn} border-bb-danger/40 text-bb-danger hover:bg-bb-danger/10`}
          onClick={() => void act({ action: "reply-reject", id }, "Rejected: no reply.")}><X size={14} /> Reject</button>
      </div>
      {msg && <p className="text-[12px] text-bb-muted">{msg}</p>}
    </div>
  );
}

export function SocialMode({ mode }: { mode: "off" | "draft" | "auto" }) {
  const { busy, msg, act } = useAct();
  const opts: [typeof mode, string][] = [["off", "Off"], ["draft", "Ask me"], ["auto", "Auto"]];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Social mode" className="inline-flex rounded-lg border border-bb-border p-0.5">
        {opts.map(([m, label]) => <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={busy || mode === m}
          className={`rounded-md px-3 py-1 text-[12.5px] ${mode === m ? "bg-bb-surface2 text-bb-fg" : "text-bb-muted hover:text-bb-fg"}`}
          onClick={() => void act({ action: "mode", mode: m }, `Now ${label}.`)}>{label}</button>)}
      </div>
      {msg && <span className="text-[12px] text-bb-muted">{msg}</span>}
    </div>
  );
}
