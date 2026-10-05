// One automated flow on a workflow's page: who enters (before), the message itself with its approve
// and test buttons, and what happened after (delivery, skips, outcomes against the holdout).
// Server component; the buttons and the preview width toggle are the client pieces.
import { DailyBars, Funnel, PairedBars } from "@/components/charts";
import { MessageActions } from "@/components/LifecycleControls";
import { Hint, ModePill } from "@/components/LifecycleStatus";
import { MessagePreview } from "@/components/MessagePreview";
import type { LifecycleFlow, LifecycleWorkflow } from "@/lib/lifecycle";
import { HINTS, dayLabel, type FlowStatus } from "@/lib/lifecycle-status";
import { PILL } from "@/lib/tone";
import { controlsFor, funnel, outcomeRows, recentDays } from "@/lib/workflow-detail";

const n = (x: number) => x.toLocaleString("en-AU");
const DELIVERY_HINT: Record<string, string> = {
  delivered: HINTS.delivered, bounced: HINTS.bounced, complained: HINTS.complained, unsubscribed: HINTS.unsubscribed, clicked: HINTS.clicked,
  opened: "Opened, where the email client reports it. Many don't, so this undercounts.",
  failed: "The sender refused it before it left. Never retried automatically.",
};

function FlowHead({ flow }: { flow: LifecycleFlow }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="text-[14px] font-semibold">{flow.label}</h3>
      <ModePill mode={flow.mode} />
      <span className={`${PILL} border-bb-border bg-bb-surface text-bb-muted`}>{flow.channel}</span>
    </div>
  );
}

export function FlowBefore({ flow, s }: { flow: LifecycleFlow; s: FlowStatus }) {
  // From the first day anything happened, so a new flow isn't two bars at the end of 60 empty days.
  const all = recentDays(flow, 60);
  const first = all.findIndex((d) => d.entered || d.sent || d.skipped);
  const days = first < 0 ? all.slice(-14) : all.slice(Math.max(0, Math.min(first, all.length - 14)));
  const f = s.facts;
  return (
    <article className="card space-y-3 p-4 min-w-0">
      <FlowHead flow={flow} />
      <p className="text-[12.5px]"><span className="text-bb-muted">Who qualifies: </span>{flow.trigger}</p>
      {f.all.entered + f.all.sent ? (
        <p className="text-[12.5px] text-bb-muted">
          Since {dayLabel(s.facts.since ?? days[0].day)}: <span className="font-semibold text-bb-fg tabular-nums">{n(f.all.entered)}</span> qualified,{" "}
          <span className="font-semibold text-bb-fg tabular-nums">{n(f.all.sent)}</span> sent, <span className="font-semibold text-bb-fg tabular-nums">{n(f.all.skipped)}</span> skipped
          {flow.holdoutPct ? <>, about <span className="font-semibold text-bb-fg tabular-nums">{n(f.all.heldOut)}</span> held out</> : null}
          {f.draftTotal ? <>, <span className="font-semibold text-bb-warn tabular-nums">{n(f.draftTotal)}</span> waiting for you</> : null}.
          {" "}Sent and qualified can land on different days: a draft is sent the day it's approved.
        </p>
      ) : <p className="text-[12.5px] text-bb-muted">Nobody has qualified yet, so there is nothing to chart. The bars fill from the first person who does.</p>}
      {flow.holdoutPct ? <Hint>{`Held out: ${flow.holdoutPct}% of the people who qualify. ${HINTS.holdout}`}</Hint> : <Hint>No holdout on this flow. Its comparisons are with people who weren&apos;t messaged.</Hint>}
      <DailyBars days={days} title={`${flow.label}: qualified, sent and skipped per day`} />
    </article>
  );
}

export function FlowMessage({ flow, workflows, connected, readOnly, observedAt, stale, can, tz }: {
  flow: LifecycleFlow; workflows: LifecycleWorkflow[]; connected: boolean; readOnly: boolean; observedAt: string | null; stale: boolean;
  can: { approve: boolean; test: boolean }; tz?: string;
}) {
  return (
    <article id={`message-${flow.id}`} className="card space-y-4 p-4 min-w-0 scroll-mt-20">
      <FlowHead flow={flow} />
      <MessageActions controls={controlsFor(flow, workflows)} connected={connected} readOnly={readOnly} observedAt={observedAt} stale={stale} can={can} tz={tz} testable={flow.messages.map((m) => m.id)} />
      {flow.messages.length ? <MessagePreview messages={flow.messages} flowLabel={flow.label} />
        : <p className="text-[12.5px] text-bb-muted">{flow.channel === "email" ? "The connection reports no rendered email for this flow." : `Each ${flow.channel} message is built from the person's own settings, so there is no single message to show.`}</p>}
    </article>
  );
}

export function FlowAfter({ flow, s }: { flow: LifecycleFlow; s: FlowStatus }) {
  const groups = outcomeRows(flow);
  const reads = s.week.outcomes;
  const scale = Math.max(0.05, ...groups.flatMap((g) => g.rows.flatMap((r) => [r.emailed.rate ?? 0, r.holdout?.rate ?? 0])));
  const skipTotal = flow.skips.reduce((t, r) => t + r.count, 0);
  const rows = funnel(flow).filter((r) => r.label.toLowerCase() !== "waiting for approval" && !(r.label.toLowerCase() === "opened" && r.count === 0));
  const since = s.facts.since ? `since ${dayLabel(s.facts.since)}` : "since the flow started";
  const other = flow.holdoutPct ? "Held out" : "Not messaged";
  return (
    <article className="card space-y-4 p-4 min-w-0">
      <FlowHead flow={flow} />
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <div className="eyebrow">Delivery, {since}</div>
          {s.facts.sent ? <Funnel rows={rows} title={`${flow.label} delivery`} /> : <p className="text-[12.5px] text-bb-muted">Nothing sent yet, so nothing to deliver.</p>}
          {s.facts.noReceipt > 0 && <Hint>{`${n(s.facts.noReceipt)} sent with no receipt yet. ${HINTS.noReceipt}`}</Hint>}
          <ul className="space-y-0.5">{rows.filter(() => s.facts.sent > 0).filter((r) => DELIVERY_HINT[r.label.toLowerCase()]).map((r) => <li key={r.label}><Hint><span className="text-bb-muted capitalize">{r.label}:</span> {DELIVERY_HINT[r.label.toLowerCase()]}</Hint></li>)}</ul>
        </div>
        <div className="space-y-2">
          <div className="eyebrow">Skipped, and why, {since}</div>
          {skipTotal ? <Funnel rows={flow.skips.map((r) => ({ ...r, share: r.count / skipTotal }))} title={`${flow.label} skips`} color="#F59E0B" />
            : <p className="text-[12.5px] text-bb-muted">Nobody skipped. A person is skipped when they no longer qualify by send time, or a draft expired.</p>}
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <div className="eyebrow">Outcomes</div>
          <p className="text-[12px] text-bb-muted">The share of each group that did it within the window. {flow.holdoutPct ? "The held-out group got nothing, so the gap is what the message did." : "Nobody was held out, so the comparison is with people who weren't messaged: a hint, not proof."}</p>
          <Hint>{HINTS.window} {HINTS.lift} {HINTS.tooFew}</Hint>
        </div>
        {groups.length ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {groups.map((g) => (
              <div key={g.window} className="rounded-lg border border-bb-border/70 p-3 space-y-2 min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-bb-dim">Within {g.window}</div>
                {g.rows.map((r, i) => {
                  const read = reads.find((x) => x.label === r.label && x.window === g.window);
                  return (
                    <div key={`${r.label}-${i}`} className="space-y-1">
                      {r.emailed.n ? <PairedBars rows={[r]} scale={scale} names={["Messaged", other]} /> : <div className="text-[12.5px] font-medium">{r.label}</div>}
                      {read && <p className="text-[11.5px] text-bb-muted">{read.text}</p>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : <p className="text-[12.5px] text-bb-muted">This flow reports no outcome to compare.</p>}
      </div>
    </article>
  );
}
