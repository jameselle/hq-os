// One partner: who they are and where (handle, profile, followers with source and date), fit and compliance, the deal,
// the tag on their links and what it brought, the outreach drafts (approve; HQ emails approved email drafts, the owner
// sends DMs and forms with one tap then marks them sent), the opt-out, and the dated history and notes.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { CopyText } from "@/components/Controls";
import { DraftActions, OptOutButton } from "@/components/PartnerControls";
import { footerProblem, hqSendable } from "@/lib/partner-outreach";
import { CompliancePill, FitPill, MeasureValue, PartnerStatusPill, shortDay } from "@/components/PartnerParts";
import { formatAnalytics } from "@/lib/analytics-metrics";
import type { Measure } from "@/lib/campaigns";
import { preferredBusiness } from "@/lib/current";
import { getPartner, outreachConfigOrNull } from "@/lib/partner-store";
import { partnersView } from "@/lib/partner-report";
import { PLATFORM_LABEL, STATUS_LABEL, TYPE_LABEL, followersLabel, partnerLink, partnerOutcome, type Partner } from "@/lib/partners";
import { resolveCurrent } from "@/lib/store";
import { PILL } from "@/lib/tone";

export const dynamic = "force-dynamic";

const DRAFT_TONE: Record<string, string> = {
  draft: "border-bb-border bg-bb-surface text-bb-muted",
  approved: "border-bb-blue/40 bg-bb-blue/10 text-bb-blue",
  "sent-by-owner": "border-bb-accent/40 bg-bb-accent/10 text-bb-accent",
  "sent-by-hq": "border-bb-accent/40 bg-bb-accent/10 text-bb-accent",
  failed: "border-bb-danger/40 bg-bb-danger/10 text-bb-danger",
};
const DRAFT_LABEL: Record<string, string> = { draft: "draft", approved: "approved", "sent-by-owner": "sent by the owner", "sent-by-hq": "emailed by HQ", failed: "failed to send" };

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-2 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-[15px] font-semibold">{title}</h2>{aside}</div>
      {children}
    </section>
  );
}

function Num({ label, m, currency }: { label: string; m: Measure; currency: string }) {
  return (
    <div className="card px-3.5 py-3 min-w-0">
      <div className="text-[9.5px] uppercase tracking-[0.14em] font-mono text-bb-dim">{label}</div>
      <div className="mt-0.5"><MeasureValue m={m} currency={currency} /></div>
      <div className="mt-0.5 text-[10.5px] text-bb-muted line-clamp-3 break-words" title={m.note}>{m.note}</div>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: `${(await params).id} · Partnerships · HQ` };
}

export default async function PartnerPage({ params }: { params: Promise<{ dept: string; id: string }> }) {
  const { dept, id } = await params;
  if (dept !== "sales") notFound();
  const b = resolveCurrent(await preferredBusiness());
  if (!b) notFound();
  let p: Partner;
  try { p = getPartner(b.slug, id); } catch { notFound(); }
  const v = partnersView(b.slug);
  const o = partnerOutcome(p, v.analytics);
  const cur = b.currency;
  const { config: sender, problem: senderProblem } = outreachConfigOrNull(b.slug);
  const senderWhy = (body: string) => senderProblem || (!sender ? "no sender connected yet (see the Partnerships guide)" : footerProblem(body, sender, b));
  const sample = p.tracking.link ?? (p.tracking.tag && b.sites?.[0] ? partnerLink(b.sites[0], p.tracking.tag, p.platform) : null);
  const timeline = [
    ...p.history.map((h) => ({ at: h.at, kind: "status" as const, text: `${STATUS_LABEL[h.status]}${h.note ? `: ${h.note}` : ""}` })),
    ...p.notes.map((n) => ({ at: n.at, kind: "note" as const, text: n.text })),
  ].sort((a, c) => c.at.localeCompare(a.at));

  return (
    <div className="space-y-6 min-w-0">
      <header className="space-y-2">
        <Link href="/sales/partners" className="text-[12px] text-bb-blue hover:underline">← All partners</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold break-words">{p.name}</h1>
            <p className="mt-1 text-[13px] text-bb-muted break-words">
              {PLATFORM_LABEL[p.platform]} {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:text-bb-blue">{p.handle} ↗</a> : p.handle}
              {p.country ? ` · ${p.country}` : ""} · {TYPE_LABEL[p.type]}
            </p>
          </div>
          <span className="flex shrink-0 flex-wrap gap-1.5"><FitPill level={p.fit.level} /><CompliancePill status={p.compliance.status} /><PartnerStatusPill status={p.status} /></span>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Who they are">
          <dl className="card grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 p-4 text-[12.5px] break-words">
            <dt className="text-bb-dim">Followers</dt>
            <dd>{followersLabel(p.audience.followers)}{p.audience.followers !== null && <span className="text-bb-dim"> · {p.audience.source}, {p.audience.at}</span>}</dd>
            <dt className="text-bb-dim">Fit</dt><dd>{p.fit.level}: {p.fit.reason}</dd>
            <dt className="text-bb-dim">Compliance</dt><dd>{p.compliance.status}{p.compliance.notes ? `: ${p.compliance.notes}` : ""}</dd>
            <dt className="text-bb-dim">Contact route</dt>
            <dd>{p.contact ? <>{p.contact.route}{p.contact.detail ? <span className="text-bb-muted"> · {/^https:/.test(p.contact.detail) ? <a href={p.contact.detail} target="_blank" rel="noopener noreferrer" className="hover:text-bb-blue break-all">{p.contact.detail}</a> : p.contact.detail}</span> : null}</> : <span className="text-bb-dim">none recorded</span>}</dd>
            <dt className="text-bb-dim">Campaigns</dt>
            <dd>{p.campaigns.length ? p.campaigns.map((c) => <Link key={c} href={`/campaigns/${c}`} className="mr-2 hover:text-bb-blue">{v.campaigns[c]?.name ?? c}</Link>) : <span className="text-bb-dim">none</span>}</dd>
          </dl>
        </Section>

        <Section title="Deal and tracking">
          <dl className="card grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 p-4 text-[12.5px] break-words">
            <dt className="text-bb-dim">Terms</dt><dd>{p.deal?.terms || <span className="text-bb-dim">none agreed yet</span>}</dd>
            <dt className="text-bb-dim">Commission</dt><dd>{p.deal?.commission !== undefined ? `${formatAnalytics("money", p.deal.commission, cur)} per paying customer` : <span className="text-bb-dim">none</span>}</dd>
            <dt className="text-bb-dim">Fee</dt><dd>{p.deal?.fee !== undefined ? formatAnalytics("money", p.deal.fee, cur) : <span className="text-bb-dim">none</span>}</dd>
            <dt className="text-bb-dim">Tag</dt><dd className="break-words">{p.tracking.tag ? <span className="font-mono text-[12px] break-all">utm_campaign={p.tracking.tag}</span> : <span className="text-bb-warn">none: link it to a campaign to get one</span>}</dd>
            {sample && (<><dt className="text-bb-dim">{p.tracking.link ? "Partner link" : "Their link"}</dt><dd className="flex items-start gap-2 min-w-0"><span className="font-mono text-[11.5px] break-all min-w-0">{sample}</span><CopyText text={sample} /></dd></>)}
          </dl>
          <div className="grid grid-cols-2 gap-2">
            <Num label="Sign-ups" m={o.signups} currency={cur} />
            <Num label="Paying customers" m={o.paying} currency={cur} />
          </div>
        </Section>
      </div>

      <Section title="Outreach drafts" aside={<span className="text-[11.5px] text-bb-dim">{p.contact?.route === "email" ? "Approved emails go out from HQ; DMs and forms you send" : "You send these; HQ emails only approved email drafts"}</span>}>
        {p.doNotContact && <p className="card border-bb-danger/40 px-4 py-3 text-[12.5px] text-bb-danger break-words">Opted out on {shortDay(p.doNotContact.at)}{p.doNotContact.note ? ` (${p.doNotContact.note})` : ""}: never contacted again.</p>}
        {!p.drafts.length ? (
          <p className="card px-4 py-3 text-[12.5px] text-bb-muted break-words">No drafts yet. <span className="font-mono">/hq:partners</span> writes them in the brand voice, or add one with <span className="font-mono">npm run hq -- partner draft {b.slug} {p.id} -</span>.</p>
        ) : (
          <div className="space-y-3">
            {[...p.drafts].reverse().map((d) => (
              <article key={d.n} className="card p-4 space-y-2 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="font-semibold">{d.followUpOf ? `Follow-up ${d.n}` : `Draft ${d.n}`}</span>
                    <span className="text-bb-dim">{d.channel}</span>
                    <span className={`${PILL} ${DRAFT_TONE[d.status]}`}>{DRAFT_LABEL[d.status]}</span>
                    <span className="text-bb-dim tabular-nums">{shortDay(d.sentAt ?? d.approvedAt ?? d.at)}</span>
                  </div>
                  <CopyText text={d.subject ? `${d.subject}\n\n${d.body}` : d.body} label="Copy draft" />
                </div>
                {d.subject && <p className="text-[12.5px] font-medium break-words">{d.subject}</p>}
                <p className="whitespace-pre-wrap text-[12.5px] text-bb-muted break-words">{d.body}</p>
                {d.followUpOf && <p className="text-[11.5px] text-bb-dim">HQ wrote this follow-up to draft {d.followUpOf} because there was no reply in five days. It&apos;s the only one.</p>}
                {d.messageId && <p className="text-[11.5px] text-bb-dim break-all">Emailed {d.sentAt ? shortDay(d.sentAt) : ""} · message {d.messageId}</p>}
                {!p.doNotContact && (
                  <DraftActions partner={p.id} n={d.n} channel={d.channel} status={d.status} text={d.subject ? `${d.subject}\n\n${d.body}` : d.body}
                    openUrl={d.channel === "form" ? (p.contact?.detail && /^https:/.test(p.contact.detail) ? p.contact.detail : null) : p.url}
                    platform={PLATFORM_LABEL[p.platform]} checkNote={p.compliance.status === "check" ? p.compliance.notes : null}
                    hqSends={hqSendable(p, d)} senderWhy={hqSendable(p, d) ? senderWhy(d.body) : ""} error={d.error} />
                )}
              </article>
            ))}
          </div>
        )}
      </Section>

      {(o.signups.value === null || o.paying.value === null) && (
        <Section title="Not measured yet">
          <ul className="card space-y-1.5 border-bb-warn/30 px-4 py-3 text-[12.5px] text-bb-muted break-words">
            {[...new Set([o.signups, o.paying].filter((m) => m.value === null).map((m) => m.note))].map((m) => <li key={m}><span className="text-bb-warn">·</span> {m}</li>)}
          </ul>
        </Section>
      )}

      {!p.doNotContact && p.status !== "ended" && (
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-bb-dim">
          <OptOutButton partner={p.id} name={p.name} />
          <span className="break-words">Use it when they reply &quot;no thanks&quot; or ask not to be contacted.</span>
        </div>
      )}

      <Section title="History and notes" aside={<span className="text-[11.5px] text-bb-dim break-words">move it: <span className="font-mono">npm run hq -- partner status {b.slug} {p.id} &lt;status&gt;</span></span>}>
        <ol className="card divide-y divide-bb-border/60 px-4 py-1">
          {timeline.map((t, i) => (
            <li key={`${t.at}-${i}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 py-2.5 text-[12.5px]">
              <span className="text-bb-dim tabular-nums">{shortDay(t.at)}</span>
              <p className="break-words"><span className={`${PILL} mr-2 ${t.kind === "status" ? "border-bb-teal/40 bg-bb-teal/10 text-bb-teal" : "border-bb-border bg-bb-surface text-bb-muted"}`}>{t.kind}</span>{t.text}</p>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
