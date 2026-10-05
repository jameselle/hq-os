"use client";
// The Email & Lifecycle page's decisions: one card per batch of drafts (read the email, approve, reject, send a test,
// leave a note), one per flow with a problem or a finished week one (switch its mode, leave a note), and a compact mode
// switch for every flow. Every write POSTs to /api/lifecycle and re-renders; notes stay in HQ.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, MessageSquarePlus, Send, X } from "lucide-react";

import type { DraftBatch, FlowIssue } from "@/lib/lifecycle-inbox";
import type { RivalChange } from "@/lib/rivals";
import type { LifecycleNote } from "@/lib/lifecycle-notes";

type Act = { action: string; [k: string]: unknown };

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState("");
  const running = useRef(false);
  async function act(body: Act, ok = "") {
    if (running.current) return false;
    running.current = true; setBusy(true); setError(""); setDone("");
    try {
      const r = await fetch("/api/lifecycle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(v.error || "That didn't work");
      setDone(ok); router.refresh(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "That didn't work"); return false; }
    finally { setBusy(false); running.current = false; }
  }
  return { busy, error, done, act };
}

const btn = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-40";
const plain = `${btn} border-bb-border text-bb-muted hover:bg-bb-surface hover:text-bb-fg`;
const when = (iso: string, tz?: string) => new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz });

/** Numbers older than 5 minutes can't be approved from; read them again once, quietly, when the page opens. */
export function RefreshIfStale({ stale, connected }: { stale: boolean; connected: boolean }) {
  const { act } = useAct();
  const tried = useRef(false);
  useEffect(() => { if (stale && connected && !tried.current) { tried.current = true; void act({ action: "report" }); } }, [stale, connected]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Notes({ notes, flow, message }: { notes: LifecycleNote[]; flow: string; message: string | null }) {
  const { busy, error, act } = useAct();
  const [open, setOpen] = useState(false), [text, setText] = useState("");
  const mine = notes.filter((n) => n.flow === flow && (message === null || n.message === null || n.message === message));
  const live = mine.filter((n) => !n.done);
  return (
    <div className="space-y-2">
      {live.length > 0 && (
        <ul className="space-y-1.5">
          {live.map((n) => (
            <li key={n.id} className="flex items-start gap-2 rounded-lg border border-bb-blue/30 bg-bb-blue/5 px-3 py-2 text-[12.5px]">
              <span className="min-w-0 flex-1 whitespace-pre-wrap">{n.text} <span className="text-[11px] text-bb-dim">· {n.at.slice(0, 10)}</span></span>
              <button type="button" disabled={busy} onClick={() => act({ action: "note-done", id: n.id })} className="shrink-0 text-[11.5px] text-bb-muted hover:text-bb-accent" title="Mark this note done">Done</button>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await act({ action: "note", flow, message, text }, "Note saved.")) { setText(""); setOpen(false); } }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} autoFocus placeholder="What should change? e.g. make the subject shorter, don't send to trial members"
            className="w-full rounded-lg border border-bb-border bg-bb-surface2/60 px-3 py-2 text-[12.5px] text-bb-fg placeholder:text-bb-dim focus:border-bb-blue/60 focus:outline-none" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy || !text.trim()} className={plain}>Save note</button>
            <button type="button" onClick={() => { setOpen(false); setText(""); }} className="text-[12px] text-bb-dim hover:text-bb-fg">Cancel</button>
            <span className="text-[11px] text-bb-dim">Notes go to the Email department&apos;s to-do list in the vault. Nothing is sent.</span>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={plain}><MessageSquarePlus size={14} /> Add a note</button>
      )}
      {error && <p role="status" className="text-[11.5px] text-bb-warn">{error}</p>}
    </div>
  );
}

/** One batch of drafts: what it is, who it goes to, the email itself, and yes / no / test / note. */
export function DraftCard({ d, notes, observedAt, stale, locked, why, can, tz }: {
  d: DraftBatch; notes: LifecycleNote[]; observedAt: string | null; stale: boolean; locked: boolean; why: string;
  can: { approve: boolean; reject: boolean; test: boolean }; tz?: string;
}) {
  const { busy, error, done, act } = useAct();
  const [show, setShow] = useState(false);
  const blocked = locked || busy || stale || !observedAt;
  const reason = why || (stale ? "Refreshing the numbers first: approve what you can see now" : "");
  const people = `${d.count} ${d.count === 1 ? "person" : "people"}`;
  return (
    <article className="card space-y-3 border-bb-warn/50 p-4 min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11.5px] text-bb-muted">{d.flowLabel}</div>
          <h3 className="text-[15px] font-semibold">{d.subject ?? d.messageLabel}</h3>
          <p className="text-[12.5px] text-bb-muted">{d.messageLabel} · waiting to go to <span className="text-bb-fg">{people}</span></p>
        </div>
        {d.expiresAt && <span className="rounded-full border border-bb-warn/40 bg-bb-warn/10 px-2.5 py-1 text-[11.5px] text-bb-warn">Expires {when(d.expiresAt, tz)}</span>}
      </header>
      {d.preview && <p className="rounded-lg bg-bb-surface2/50 px-3 py-2 text-[12.5px] text-bb-muted">{d.preview}</p>}
      {d.html && (
        <div>
          <button type="button" onClick={() => setShow(!show)} aria-expanded={show} className="inline-flex items-center gap-1 text-[12.5px] text-bb-blue hover:underline">
            <ChevronDown size={14} className={show ? "rotate-180 transition-transform" : "transition-transform"} /> {show ? "Hide the email" : "Read the email"}
          </button>
          {show && (
            <div className="mt-2 flex justify-center rounded-lg border border-bb-border bg-[#0b1020] p-2 sm:p-4">
              <iframe title={`${d.messageLabel}: ${d.subject ?? ""}`} sandbox="" srcDoc={d.html} referrerPolicy="no-referrer" className="block w-full max-w-[640px] rounded-md bg-white" style={{ height: 560 }} />
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {can.approve && (
          <button type="button" disabled={blocked} title={reason} className={`${btn} border-bb-accent/50 bg-bb-accent/15 text-bb-accent hover:bg-bb-accent/25`}
            onClick={() => { if (confirm(`Send "${d.subject ?? d.messageLabel}" to the ${people} waiting? This is the exact email shown here.`)) void act({ action: "approve", workflow: d.messageId, before: observedAt }, `Approved. It goes to ${people} on the sender's next run.`); }}>
            <Check size={14} /> Approve and send to {people}
          </button>
        )}
        {can.reject && (
          <button type="button" disabled={blocked} title={reason} className={`${btn} border-bb-danger/40 text-bb-danger hover:bg-bb-danger/10`}
            onClick={() => { if (confirm(`Don't send "${d.subject ?? d.messageLabel}" to these ${people}? They won't get it, ever. New people who qualify later still come here for your yes.`)) void act({ action: "reject", workflow: d.messageId, before: observedAt }, "Rejected. Nobody in this batch gets it."); }}>
            <X size={14} /> Reject
          </button>
        )}
        {can.test && (
          <button type="button" disabled={locked || busy} title={why} className={plain}
            onClick={() => { if (confirm("Send a copy to you only, marked [Test]? No customer gets it.")) void act({ action: "test", workflow: d.messageId }, "Test sent to you."); }}>
            <Send size={14} /> Send me a test
          </button>
        )}
      </div>
      {(error || done || reason) && <p role="status" className={`text-[12px] ${error ? "text-bb-warn" : done ? "text-bb-accent" : "text-bb-dim"}`}>{error || done || reason}</p>}
      {!can.reject && can.approve && <p className="text-[11.5px] text-bb-dim">This business can&apos;t reject from HQ yet: drafts you don&apos;t approve expire and are never sent.</p>}
      <Notes notes={notes} flow={d.flowId} message={d.messageId} />
    </article>
  );
}

const MODES = [
  { id: "off", label: "Off", hint: "nothing is planned or sent" },
  { id: "draft", label: "Ask me", hint: "each batch waits for your yes" },
  { id: "auto", label: "Auto", hint: "goes out on its own" },
] as const;
const ON: Record<string, string> = { off: "bg-bb-surface2 text-bb-fg", draft: "bg-bb-warn/15 text-bb-warn", auto: "bg-bb-accent/15 text-bb-accent" };

/** Off / ask me / auto, small enough for a list row. Flows with no draft step say so instead. */
export function ModeChoice({ flowId, label, mode, locked, why, recommended }: { flowId: string; label: string; mode: "off" | "draft" | "auto" | null; locked: boolean; why: string; recommended?: string | null }) {
  const { busy, error, done, act } = useAct();
  if (mode === null) return <span className="text-[11.5px] text-bb-dim" title="This flow has no draft step">Always on</span>;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span role="group" aria-label={`Mode for ${label}`} className="inline-flex overflow-hidden rounded-lg border border-bb-border">
        {MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={mode === m.id} disabled={locked || busy} title={why || `${m.label}: ${m.hint}${recommended === m.id ? " (recommended)" : ""}`}
            onClick={() => {
              if (m.id === mode) return;
              if (m.id === "auto" && !confirm(`Let "${label}" send on its own, without asking you first?`)) return;
              if (m.id === "off" && !confirm(`Turn "${label}" off? Nothing more is planned or sent.`)) return;
              void act({ action: "mode", workflow: flowId, mode: m.id }, m.id === "draft" ? "Now asks you first." : m.id === "auto" ? "Now sends on its own." : "Off.");
            }}
            className={`border-l border-bb-border px-2.5 py-1 text-[11.5px] first:border-l-0 disabled:cursor-not-allowed ${mode === m.id ? ON[m.id] : "text-bb-muted hover:text-bb-fg disabled:opacity-50"} ${recommended === m.id && mode !== m.id ? "underline decoration-dotted underline-offset-2" : ""}`}>
            {m.label}
          </button>
        ))}
      </span>
      {(error || done) && <span role="status" className={`text-[11px] ${error ? "text-bb-warn" : "text-bb-accent"}`}>{error || done}</span>}
    </span>
  );
}

/** A flow with a problem, or whose first week is done: what HQ sees, what it recommends, the mode, and a note. */
export function IssueCard({ x, notes, locked, why, canMode }: { x: FlowIssue; notes: LifecycleNote[]; locked: boolean; why: string; canMode: boolean }) {
  const rec = x.recommendation && x.recommendation.choice !== "keep" ? x.recommendation.choice : null;
  return (
    <article className={`card space-y-3 p-4 min-w-0 ${x.tone === "bad" ? "border-bb-danger/50" : "border-bb-warn/50"}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11.5px] text-bb-muted">{x.kind === "week-one" ? "Week one is done" : "Something looks wrong"}</div>
          <h3 className="text-[15px] font-semibold">{x.flowLabel}</h3>
        </div>
        {canMode && <ModeChoice flowId={x.flowId} label={x.flowLabel} mode={x.mode} locked={locked} why={why} recommended={rec} />}
      </header>
      <p className="text-[12.5px]">{x.text}</p>
      {x.recommendation && <p className="text-[12.5px] text-bb-muted"><span className="text-bb-fg">HQ suggests: {x.recommendation.label.toLowerCase()}.</span> {x.recommendation.reason}</p>}
      <Notes notes={notes} flow={x.flowId} message={null} />
    </article>
  );
}

/** A watched rival page changed: look at what changed, decide whether at-risk customers hear from you first, note it. */
export function RivalCard({ r, notes, tz }: { r: RivalChange; notes: LifecycleNote[]; tz?: string }) {
  const { busy, error, act } = useAct();
  return (
    <article className="card space-y-3 border-bb-violet/50 p-4 min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11.5px] text-bb-muted">A rival moved</div>
          <h3 className="text-[15px] font-semibold">{r.competitor} changed {r.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</h3>
          <p className="text-[12.5px] text-bb-muted">Seen {when(r.lastChanged, tz)}. If it&apos;s a price cut, a new feature or an offer, tell your at-risk customers what you have first.</p>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <a href={r.diffUrl} target="_blank" rel="noreferrer" className={plain}>See what changed</a>
        <button type="button" disabled={busy} onClick={() => act({ action: "rival-seen", uuid: r.uuid, lastChanged: r.lastChanged })} className={plain}><Check size={14} /> Seen, nothing to do</button>
      </div>
      {error && <p role="status" className="text-[12px] text-bb-warn">{error}</p>}
      <Notes notes={notes} flow="rivals" message={r.uuid} />
    </article>
  );
}
