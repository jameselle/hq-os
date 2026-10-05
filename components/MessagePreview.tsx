"use client";
// The real rendered message, shown in a fully sandboxed frame (no scripts, no same-origin), at
// desktop (640px) or phone (390px) width. More than one message gets a picker.
import { useState } from "react";

type Message = { id: string; label: string; subject: string; html: string };
const WIDTH = { desktop: 640, phone: 390 } as const;

export function MessagePreview({ messages, flowLabel }: { messages: Message[]; flowLabel: string }) {
  const [view, setView] = useState<keyof typeof WIDTH>("desktop");
  const [pick, setPick] = useState(0);
  const m = messages[Math.min(pick, messages.length - 1)];
  if (!m) return null;
  const tab = (on: boolean) => `px-3 py-1.5 text-[12px] border-l border-bb-border first:border-l-0 ${on ? "bg-bb-surface2 text-bb-fg" : "text-bb-muted hover:text-bb-fg"}`;
  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {messages.length > 1 ? (
          <div role="group" aria-label={`Messages in ${flowLabel}`} className="flex flex-wrap gap-1.5">
            {messages.map((x, i) => (
              <button key={x.id} type="button" aria-pressed={i === pick} onClick={() => setPick(i)}
                className={`rounded-full border px-2.5 py-1 text-[11.5px] ${i === pick ? "border-bb-teal/50 bg-bb-teal/10 text-bb-teal" : "border-bb-border text-bb-muted hover:text-bb-fg"}`}>
                {i + 1}. {x.label}
              </button>
            ))}
          </div>
        ) : <span className="text-[12px] text-bb-muted">{m.label}</span>}
        <div role="group" aria-label="Preview width" className="inline-flex shrink-0 overflow-hidden rounded-lg border border-bb-border">
          <button type="button" aria-pressed={view === "desktop"} onClick={() => setView("desktop")} className={tab(view === "desktop")}>Desktop</button>
          <button type="button" aria-pressed={view === "phone"} onClick={() => setView("phone")} className={tab(view === "phone")}>Phone</button>
        </div>
      </div>
      <div className="rounded-lg border border-bb-border bg-bb-surface2/60 p-3">
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-bb-dim">Subject</div>
        <div className="text-[13.5px] font-medium break-words">{m.subject}</div>
      </div>
      <div className="-mx-3 flex justify-center border-y border-bb-border bg-[#0b1020] sm:mx-0 sm:rounded-lg sm:border sm:p-4">
        <iframe key={`${m.id}-${view}`} title={`${m.label}: ${m.subject}`} sandbox="" srcDoc={m.html} referrerPolicy="no-referrer"
          className="block max-w-full bg-white sm:rounded-md" style={{ width: WIDTH[view], height: view === "phone" ? 680 : 620 }} />
      </div>
    </div>
  );
}
