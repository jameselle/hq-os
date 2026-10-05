"use client";
// The lifecycle buttons. Each lives in exactly one place: refresh and pause on the lifecycle centre,
// the mode switch in a flow's week-one review, approve and test beside the email they send. Every one
// POSTs to /api/lifecycle (same-origin, the business comes from the cookie) and then re-renders.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Pause, Play, RefreshCw } from "lucide-react";

import type { LifecycleFlow, LifecycleWorkflow } from "@/lib/lifecycle";

type Body = { action: "report" | "approve" | "test" | "mode" | "pause" | "resume"; workflow?: string; before?: string; mode?: string };

function useLifecycleAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState("");
  const running = useRef(false);
  async function act(body: Body, ok = "") {
    if (running.current) return;
    running.current = true; setBusy(true); setError(""); setDone("");
    try {
      const r = await fetch("/api/lifecycle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(v.error || "Request failed");
      setDone(ok);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setBusy(false); running.current = false;
    }
  }
  return { busy, error, done, act };
}

const btn = "rounded-lg border border-bb-border px-3 py-1.5 text-[12px] text-bb-muted hover:bg-bb-surface hover:text-bb-fg disabled:cursor-not-allowed disabled:opacity-40";
const Status = ({ text, warn }: { text: string; warn?: boolean }) => text ? <p role="status" className={`text-[11.5px] ${warn ? "text-bb-warn" : "text-bb-muted"}`}>{text}</p> : null;

/** Ask the connected service for a fresh snapshot. Reading never changes anything. */
export function LifecycleRefresh({ disabled = false }: { disabled?: boolean }) {
  const { busy, error, act } = useLifecycleAction();
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={disabled || busy} onClick={() => act({ action: "report" })} className={`${btn} inline-flex items-center gap-1.5`} title={disabled ? "No lifecycle connection" : "Read the numbers again from the business's engine"}>
        <RefreshCw size={13} className={busy ? "animate-spin" : ""} /> {busy ? "Refreshing" : "Refresh"}
      </button>
      {error && <span role="status" className="text-[11.5px] text-bb-warn">{error}</span>}
    </span>
  );
}

/** Stop every optional message for this business at once, or start them again in draft. */
export function PauseAll({ paused, locked, why }: { paused: boolean; locked: boolean; why: string }) {
  const { busy, error, done, act } = useLifecycleAction();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" disabled={locked || busy} title={why} className={`${btn} inline-flex items-center gap-1.5`}
        onClick={() => {
          if (paused ? confirm("Start every flow again in draft? Nothing goes out until you approve it (flows with no draft step start sending on their own).") : confirm("Pause every optional message for this business? Receipts and sign-in emails still send.")) void act({ action: paused ? "resume" : "pause" }, paused ? "Started again in draft." : "Paused.");
        }}>
        {paused ? <Play size={13} /> : <Pause size={13} />} {paused ? "Start again" : "Pause all"}
      </button>
      <Status text={error || done || why} warn={Boolean(error)} />
    </span>
  );
}

const MODES: { id: NonNullable<LifecycleFlow["mode"]>; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "nothing is planned or sent" },
  { id: "draft", label: "Draft", hint: "each batch waits for your yes" },
  { id: "auto", label: "Auto", hint: "goes out on its own" },
];
const MODE_ON: Record<string, string> = { off: "bg-bb-surface2 text-bb-fg", draft: "bg-bb-warn/15 text-bb-warn", auto: "bg-bb-accent/15 text-bb-accent" };

/** Off / draft / auto for one flow, with what each means written out. */
export function ModeSwitch({ flow, recommendation, locked, why }: { flow: Pick<LifecycleFlow, "id" | "label" | "mode">; recommendation?: string; locked: boolean; why: string }) {
  const { busy, error, done, act } = useLifecycleAction();
  function setMode(mode: string) {
    if (mode === flow.mode) return;
    if (mode === "auto" && !confirm(`Switch "${flow.label}" to auto? Its messages will go out without waiting for your yes.${recommendation ? `\n\nWeek-one recommendation: ${recommendation}.` : ""}`)) return;
    if (mode === "off" && !confirm(`Turn "${flow.label}" off? Nothing more is planned or sent until you turn it back on.`)) return;
    void act({ action: "mode", workflow: flow.id, mode }, `Now ${mode}.`);
  }
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">Mode</span>
        <div role="group" aria-label={`Mode for ${flow.label}`} className="inline-flex overflow-hidden rounded-lg border border-bb-border">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={flow.mode === m.id} disabled={locked || busy} title={why || m.hint} onClick={() => setMode(m.id)}
              className={`px-3 py-1.5 text-[12px] border-l border-bb-border first:border-l-0 disabled:cursor-not-allowed ${flow.mode === m.id ? MODE_ON[m.id] : "text-bb-muted hover:text-bb-fg disabled:opacity-50"}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-bb-dim">{MODES.map((m) => `${m.label}: ${m.hint}`).join(" · ")}</p>
      <Status text={error || done || why} warn={Boolean(error)} />
    </div>
  );
}

/** Approve and test for each message in a flow, next to the email itself. */
export function MessageActions({ controls, connected, readOnly, observedAt, stale, can, tz, testable }: {
  controls: LifecycleWorkflow[]; connected: boolean; readOnly: boolean; observedAt: string | null; stale: boolean;
  can: { approve: boolean; test: boolean }; tz?: string;
  /** Message ids with a rendered message: only those can be sent to the owner as a test. */
  testable: string[];
}) {
  const { busy, error, done, act } = useLifecycleAction();
  const locked = !connected || readOnly || busy;
  const why = !connected ? "No lifecycle connection" : readOnly ? "Read-only connection: HQ can only watch" : "";
  const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz });
  if (!controls.length) return null;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {controls.map((w) => (
          <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-bb-border/70 px-3 py-2">
            <div className="min-w-0 text-[12.5px]">
              <span className="font-medium">{w.label}</span>
              <span className="text-bb-muted"> · {w.sent30d ? `${w.sent30d} sent in the last 30 days${w.lastSentAt ? `, last ${when(w.lastSentAt)}` : ""}` : "none sent in the last 30 days"}</span>
              {!!w.drafts && <span className="block text-bb-warn">{w.drafts} waiting for your yes{w.expiresAt ? `; unapproved, the first expires ${when(w.expiresAt)}` : ""}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {!!w.drafts && can.approve && (
                <button type="button" disabled={locked || stale || !observedAt} title={why || (stale ? "Refresh first: approve what you can see now" : "")} className={btn}
                  onClick={() => {
                    if (!confirm(`Send "${w.preview?.subject ?? w.label}" to the ${w.drafts} people waiting? This is the exact email shown here.`)) return;
                    void act({ action: "approve", workflow: w.id, before: observedAt! }, `Approved ${w.drafts}. They go out on the sender's next run.`);
                  }}>Approve {w.drafts}</button>
              )}
              {can.test && testable.includes(w.id) && (
                <button type="button" disabled={locked} title={why} className={btn}
                  onClick={() => { if (confirm("Send a copy to the owner only, marked [Test]? No customer gets it.")) void act({ action: "test", workflow: w.id }, "Test queued for the owner."); }}>
                  Send me a test
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Status text={error || done || why || (stale && controls.some((w) => w.drafts) ? "These numbers are stale. Refresh before approving." : "") || (!can.test ? "This business's adapter can't send owner tests from HQ." : "")} warn={Boolean(error)} />
    </div>
  );
}
