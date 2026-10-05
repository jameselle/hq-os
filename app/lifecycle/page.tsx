// The lifecycle centre: every automated flow for the current business on one page. It leads with what
// needs the owner (drafts and when they expire, week-one decisions, problems), then each flow's three
// answers: is it working, what's waiting, what next. Approving, testing and switching modes happen on
// each flow's workflow page; pausing everything happens here. Old ?preview= links go to the previews.
import Link from "next/link";
import { redirect } from "next/navigation";

import { LifecycleRefresh, PauseAll } from "@/components/LifecycleControls";
import { StatusCard } from "@/components/LifecycleStatus";
import { Tile } from "@/components/Tile";
import { preferredBusiness } from "@/lib/current";
import { legacyLifecycleUrl } from "@/lib/email-navigation";
import { guideBySlug } from "@/lib/guides";
import { lifecycleState, supports } from "@/lib/lifecycle";
import { flowPage } from "@/lib/lifecycle-names";
import { HINTS, dayLabel, lifecycleStatus, timeLabel, type FlowStatus } from "@/lib/lifecycle-status";
import { resolveCurrent } from "@/lib/store";
import { PILL } from "@/lib/tone";
import { sentLast30 } from "@/lib/workflow-detail";

export const dynamic = "force-dynamic";

const n = (x: number) => x.toLocaleString("en-AU");
const plural = (x: number, one: string, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;

function Numbers({ s }: { s: FlowStatus }) {
  const f = s.facts, since = f.since ? dayLabel(f.since) : "the start";
  if (!f.sent && !f.all.sent) return <p className="border-t border-bb-border/70 pt-2.5 text-[12px] text-bb-muted">Nothing sent yet. Counting since {since}.</p>;
  const bits = [
    `${plural(f.all.sent, f.noun)} sent since ${since}`,
    f.receipts && f.sent ? `${n(f.delivered)} delivered${f.noReceipt ? `, ${n(f.noReceipt)} awaiting a receipt` : ""}` : "",
    f.bounced || f.complained ? `${n(f.bounced)} bounced, ${n(f.complained)} marked as spam` : "",
    f.unsubscribed ? `${n(f.unsubscribed)} unsubscribed` : "",
  ].filter(Boolean);
  return <p className="border-t border-bb-border/70 pt-2.5 text-[12px] text-bb-muted">{bits.join(" · ")}.</p>;
}

export default async function LifecyclePage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  if (preview) redirect(legacyLifecycleUrl(preview));
  const business = resolveCurrent(await preferredBusiness());
  const state = business ? (() => { try { return lifecycleState(business.slug); } catch { return null; } })() : null;
  const snap = state?.snapshot ?? null;
  const tz = business?.timezone;
  const now = Date.now();
  const { flows, needs, upcoming } = lifecycleStatus(snap, { now, tz, stale: state?.stale, failed: snap?.collectionFailed, observedAt: snap?.observedAt ?? null, canApprove: supports(snap, "approve") });
  const guide = guideBySlug("lifecycle");
  const email = flows.filter((s) => s.channel === "email");
  const other = flows.filter((s) => s.channel !== "email");
  const sum = (xs: FlowStatus[], k: (s: FlowStatus) => number) => xs.reduce((t, s) => t + k(s), 0);
  const sent30 = sum(email, (s) => sentLast30((snap?.flows ?? []).find((f) => f.id === s.id)!));
  const sentAll = sum(email, (s) => s.facts.sent), delivered = sum(email, (s) => s.facts.delivered), noReceipt = sum(email, (s) => s.facts.noReceipt);
  const drafts = sum(flows, (s) => s.facts.draftTotal);
  const firstSince = email.map((s) => s.facts.since).filter((d): d is string => Boolean(d)).sort()[0];
  const sinceText = firstSince ? `since ${dayLabel(firstSince)}` : "so far";
  const canPause = Boolean(state?.connected && !state.readOnly && snap && supports(snap, snap.paused ? "resume" : "pause"));

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">Email · Lifecycle</div>
          <h1 className="text-2xl font-semibold">
            Lifecycle centre
            {business && <span className="text-bb-muted font-normal text-[17px]"> · {business.name}</span>}
          </h1>
          <p className="mt-1 max-w-[75ch] text-[13px] text-bb-muted">
            The emails and messages that go out on their own when a customer does something (or stops). What needs you comes first; open a flow to read its email, approve it, send yourself a test or change its mode.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <LifecycleRefresh disabled={!state?.connected} />
          {snap && <PauseAll paused={snap.paused} locked={!canPause || Boolean(state?.stale)} why={!state?.connected ? "No lifecycle connection" : state?.readOnly ? "Read-only connection" : !canPause ? "This business's adapter can't pause" : state?.stale ? "Refresh first" : ""} />}
        </div>
      </div>

      {state && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-[12px] text-bb-muted">
          {!state.connected ? <span className={`${PILL} border-bb-border bg-bb-surface text-bb-muted`}>not connected</span>
            : state.readOnly ? <span className={`${PILL} border-bb-blue/40 bg-bb-blue/10 text-bb-blue`}>read only</span>
            : <span className={`${PILL} border-bb-accent/40 bg-bb-accent/10 text-bb-accent`}>connected</span>}
          {snap && state.stale && <span className={`${PILL} border-bb-warn/40 bg-bb-warn/10 text-bb-warn`}>stale</span>}
          {snap?.paused && <span className={`${PILL} border-bb-warn/40 bg-bb-warn/10 text-bb-warn`}>everything paused</span>}
          {snap?.collectionFailed && <span className={`${PILL} border-bb-danger/40 bg-bb-danger/10 text-bb-danger`}>collection failed</span>}
          <span>{snap?.observedAt ? `Numbers read ${timeLabel(snap.observedAt, tz)}${state.stale ? ". That's over 5 minutes ago: refresh before deciding anything." : "."}` : "No numbers read yet."}</span>
        </p>
      )}

      {flows.length ? (
        <>
          <section aria-labelledby="needs-h" className={`card space-y-2 p-4 ${needs.length ? "border-bb-warn/50" : ""}`}>
            <h2 id="needs-h" className="text-[15px] font-semibold">{needs.length ? `Needs you (${needs.length})` : "Nothing needs you right now"}</h2>
            {needs.length ? (
              <ul className="space-y-1.5">
                {needs.map((x) => {
                  const href = flowPage(x.serves);
                  return (
                    <li key={x.id} className="flex gap-2 text-[12.5px]">
                      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${x.tone === "bad" ? "bg-bb-danger" : "bg-bb-warn"}`} />
                      <span>{x.text} {href && <Link href={`${href}#status-h`} className="text-bb-blue hover:underline">Open</Link>}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[12.5px] text-bb-muted">
                No drafts waiting and nothing wrong.{" "}
                {upcoming.length ? `Next decision: week one of ${upcoming[0].label} ends ${dayLabel(upcoming[0].on)}${upcoming.length > 1 ? ` (${upcoming.slice(1).map((u) => `${u.label} ${dayLabel(u.on)}`).join(", ")})` : ""}.` : "Check back next week."}
              </p>
            )}
          </section>

          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <Tile label="Emails sent" value={n(sent30)} hint={`last 30 days, ${plural(email.length, "email flow")}; owner tests not counted`} />
            <Tile label="Delivered" value={sentAll ? `${n(delivered)} of ${n(sentAll)}` : "none sent yet"} hint={`${sinceText}${noReceipt ? `; ${n(noReceipt)} awaiting a receipt` : ""}`} />
            <Tile label="Bounced or spam" value={n(sum(email, (s) => s.facts.bounced + s.facts.complained))} hint={`${sinceText}; those addresses get nothing more`} tone={sum(email, (s) => s.facts.complained) ? "danger" : undefined} />
            <Tile label="Unsubscribed" value={n(sum(email, (s) => s.facts.unsubscribed))} hint={`${sinceText}, all email flows`} />
            <Tile label="Waiting for you" value={drafts ? plural(drafts, "draft") : "nothing"} hint={drafts ? "see Needs you above" : "no drafts waiting"} tone={drafts ? "warn" : undefined} />
            {other.length ? <Tile label={`${other[0].channel} messages`} value={n(sum(other, (s) => sentLast30((snap?.flows ?? []).find((f) => f.id === s.id)!)))} hint={`last 30 days, ${plural(other.length, "flow")}; no receipts`} />
              : <Tile label="Flows" value={n(flows.length)} hint={(["auto", "draft", "off", null] as const).map((m) => [m, flows.filter((s) => s.mode === m).length] as const).filter(([, k]) => k).map(([m, k]) => `${k} ${m === null ? "always on" : m === "off" ? "off" : m === "auto" ? "on auto" : "in draft"}`).join(", ")} />}
          </div>
          <p className="text-[11px] text-bb-dim">{HINTS.delivered} {HINTS.bounced}</p>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {flows.map((s) => {
              const href = flowPage(s.serves);
              return (
                <StatusCard key={s.id} s={s} href={href}>
                  <Numbers s={s} />
                  {href ? <Link href={href} className="text-[12px] text-bb-blue hover:underline">{s.channel === "email" ? "Open: the email, week one and outcomes" : "Open: who gets it, week one and outcomes"}</Link>
                    : <span className="text-[12px] text-bb-dim">{s.serves ? `Serves "${s.serves}", which isn't a workflow HQ knows.` : "Not linked to a workflow, so it has no page of its own."}</span>}
                </StatusCard>
              );
            })}
          </div>
        </>
      ) : (
        <section className="card space-y-2 p-4">
          <h2 className="text-[15px] font-semibold">{!business ? "Choose a business" : !state?.connected ? "No lifecycle connection" : "No flows reported yet"}</h2>
          <p className="max-w-[80ch] text-[12.5px] text-bb-muted">
            {!business ? "Pick a business in the switcher above to see its automated flows."
              : !state?.connected
                ? `HQ can't see ${business.name}'s automated messages yet. Add a private adapter in this business's HQ data folder (lifecycle-connection.json) that reports each flow: who qualifies, what was sent and delivered, why people were skipped, and outcomes against a holdout. The template adapter is a working starting point.`
                : `The connection works, but its snapshot has no flows list${snap?.observedAt ? ` (read ${timeLabel(snap.observedAt, tz)})` : ""}. Report flows from the adapter to see each one here.`}
          </p>
          {guide && <p className="text-[12.5px]"><Link href={`/guides/${guide.slug}`} className="text-bb-blue hover:underline">How to connect lifecycle</Link></p>}
        </section>
      )}
    </div>
  );
}
