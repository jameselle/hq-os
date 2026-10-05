// The three answers every flow gives at the top of its page and on its card (is it working, what's
// waiting for you, what next), and the week-one review with its recommendation. Server component;
// the mode switch inside the review is the client piece.
import Link from "next/link";
import type { ReactNode } from "react";

import { ModeSwitch } from "@/components/LifecycleControls";
import { HINTS, type Answer, type FlowStatus, type Tone } from "@/lib/lifecycle-status";
import { PILL } from "@/lib/tone";

const DOT: Record<Tone, string> = { good: "bg-bb-accent", warn: "bg-bb-warn", bad: "bg-bb-danger", idle: "bg-bb-dim" };
const TEXT: Record<Tone, string> = { good: "text-bb-accent", warn: "text-bb-warn", bad: "text-bb-danger", idle: "text-bb-muted" };

/** A word and its meaning, inline: no hover, so it reads on a phone too. */
export function Hint({ children }: { children: ReactNode }) {
  return <span className="block text-[11px] leading-snug text-bb-dim">{children}</span>;
}

export const MODE_TONE: Record<string, string> = {
  off: "border-bb-border bg-bb-surface text-bb-muted",
  draft: "border-bb-warn/40 bg-bb-warn/10 text-bb-warn",
  auto: "border-bb-accent/40 bg-bb-accent/10 text-bb-accent",
  always: "border-bb-blue/40 bg-bb-blue/10 text-bb-blue",
};
const MODE_HINT = { off: HINTS.off, draft: HINTS.draft, auto: HINTS.auto, always: HINTS.alwaysOn } as const;
export function ModePill({ mode, withHint = false }: { mode?: string | null; withHint?: boolean }) {
  const k = (mode ?? "always") as keyof typeof MODE_HINT;
  const pill = <span className={`${PILL} ${MODE_TONE[k] ?? MODE_TONE.off}`} title={MODE_HINT[k]}>{mode ?? "always on"}</span>;
  return withHint ? <span className="inline-flex flex-col items-start gap-0.5">{pill}<Hint>{MODE_HINT[k]}</Hint></span> : pill;
}

function Row({ q, a }: { q: string; a: Answer }) {
  return (
    <div className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
      <dt className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim sm:pt-[3px]">{q}</dt>
      <dd className="min-w-0 text-[12.5px]">
        <span className="inline-flex items-center gap-1.5 font-semibold"><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[a.tone]}`} /><span className={a.tone === "idle" ? "" : TEXT[a.tone]}>{a.headline}</span></span>
        {a.detail && <span className="block text-bb-muted">{a.detail}</span>}
      </dd>
    </div>
  );
}

/** The three questions, answered. */
export function ThreeAnswers({ s }: { s: Pick<FlowStatus, "working" | "waiting" | "next"> }) {
  return (
    <dl className="space-y-2.5">
      <Row q="Is it working?" a={s.working} />
      <Row q="Waiting for you" a={s.waiting} />
      <Row q="What next" a={s.next} />
    </dl>
  );
}

/** One flow's status card: name, mode in words, the three answers. */
export function StatusCard({ s, href, children }: { s: FlowStatus; href?: string | null; children?: ReactNode }) {
  return (
    <article className="card space-y-3 p-4 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold">{href ? <Link href={href} className="hover:text-bb-blue">{s.label}</Link> : s.label}</h3>
          <div className="text-[11.5px] text-bb-muted">{s.modeWords} · {s.channel}</div>
        </div>
        <ModePill mode={s.mode} />
      </div>
      <ThreeAnswers s={s} />
      {children}
    </article>
  );
}

const CHOICE: Record<FlowStatus["week"]["recommendation"]["choice"], string> = {
  auto: "border-bb-accent/40 bg-bb-accent/10 text-bb-accent",
  draft: "border-bb-warn/40 bg-bb-warn/10 text-bb-warn",
  off: "border-bb-danger/40 bg-bb-danger/10 text-bb-danger",
  keep: "border-bb-border bg-bb-surface text-bb-muted",
};

/** Week one: what went out, how it landed, the outcome against the holdout, and the call. */
export function WeekOneCard({ s, holdoutPct, controls }: { s: FlowStatus; holdoutPct?: number; controls: { connected: boolean; readOnly: boolean; canMode: boolean } }) {
  const w = s.week;
  return (
    <article className="card space-y-4 p-4 min-w-0" aria-label={`Week one review: ${s.label}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="eyebrow mb-1">Week one review</div>
          <h3 className="text-[14px] font-semibold">{s.label}</h3>
          <p className="max-w-[80ch] text-[12px] text-bb-muted">{w.period}</p>
        </div>
        <span className={`${PILL} ${w.ready ? "border-bb-accent/40 bg-bb-accent/10 text-bb-accent" : "border-bb-border bg-bb-surface text-bb-muted"}`}>{w.ready ? "ready to decide" : w.startsOn ? "in progress" : "not started"}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <dl className="space-y-2">
          {!w.rows.length && <p className="text-[12.5px] text-bb-muted">Nothing sent yet, so there is nothing to review. The numbers appear here from the first {s.facts.noun} sent.</p>}
          {w.rows.map((r) => (
            <div key={r.label} className="grid gap-x-3 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
              <dt className="text-[12px] text-bb-muted">{r.label}</dt>
              <dd className={`text-[12.5px] tabular-nums ${r.tone ? TEXT[r.tone] : ""}`}>{r.value}{r.hint && <Hint>{r.hint}</Hint>}</dd>
            </div>
          ))}
        </dl>
        <div className="space-y-2">
          <div className="text-[12px] text-bb-muted">
            Outcome {holdoutPct ? <>vs the holdout<Hint>{`Holdout: ${holdoutPct}% of the people who qualify. ${HINTS.holdout}`}</Hint></> : <>vs people not messaged<Hint>{HINTS.notFair}</Hint></>}
          </div>
          {w.outcomes.length ? (
            <ul className="space-y-1.5">
              {w.outcomes.map((o, i) => (
                <li key={i} className="text-[12.5px]">
                  <span className="font-medium">{o.label}</span> <span className="text-bb-dim">within {o.window}</span>
                  <span className="block text-bb-muted">{o.text}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[12.5px] text-bb-muted">This flow reports no outcome to compare.</p>}
          <Hint>{HINTS.window} {HINTS.lift} {HINTS.tooFew}</Hint>
        </div>
      </div>
      <div className="rounded-lg border border-bb-border/70 bg-bb-surface2/40 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">Recommendation</span>
          <span className={`${PILL} ${CHOICE[w.recommendation.choice]}`}>{w.recommendation.label}</span>
        </div>
        <p className="text-[12.5px]">{w.recommendation.reason}</p>
        {s.mode && (
          <ModeSwitch flow={{ id: s.id, label: s.label, mode: s.mode }} recommendation={w.recommendation.label}
            locked={!controls.connected || controls.readOnly || !controls.canMode}
            why={!controls.connected ? "No lifecycle connection" : controls.readOnly ? "Read-only connection" : !controls.canMode ? "This business's adapter can't switch modes" : ""} />
        )}
      </div>
    </article>
  );
}
