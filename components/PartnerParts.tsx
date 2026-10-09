// Pieces shared by the Partnerships board, a partner's page, the Sales & Partnerships tab and a campaign's page.
// Server components, no state.
import Link from "next/link";

import { MeasureValue } from "@/components/CampaignParts";
import { DraftActions } from "@/components/PartnerControls";
import type { Campaign } from "@/lib/campaigns";
import { PLATFORM_LABEL, STATUS_LABEL, followersLabel, isSent, lastAction, type ComplianceState, type FitLevel, type Partner, type PartnerStatus } from "@/lib/partners";
import { PILL } from "@/lib/tone";

const GREEN = "border-bb-accent/40 bg-bb-accent/10 text-bb-accent";
const BLUE = "border-bb-blue/40 bg-bb-blue/10 text-bb-blue";
const AMBER = "border-bb-warn/40 bg-bb-warn/10 text-bb-warn";
const RED = "border-bb-danger/40 bg-bb-danger/10 text-bb-danger";
const VIOLET = "border-bb-violet/40 bg-bb-violet/10 text-bb-violet";
const SLATE = "border-bb-border bg-bb-surface text-bb-muted";

export const PARTNER_STATUS_TONE: Record<PartnerStatus, string> = {
  prospect: SLATE, shortlisted: BLUE, contacted: VIOLET, replied: VIOLET, negotiating: VIOLET, live: GREEN, paused: AMBER, declined: SLATE, ended: SLATE,
};
const FIT_TONE: Record<FitLevel, string> = { high: GREEN, medium: BLUE, low: SLATE };
const COMPLIANCE_TONE: Record<ComplianceState, string> = { ok: GREEN, check: AMBER, avoid: RED };
const COMPLIANCE_LABEL: Record<ComplianceState, string> = { ok: "compliance ok", check: "check compliance", avoid: "avoid" };

export const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });

export function PartnerStatusPill({ status }: { status: PartnerStatus }) {
  return <span className={`${PILL} ${PARTNER_STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}
export function FitPill({ level }: { level: FitLevel }) {
  return <span className={`${PILL} ${FIT_TONE[level]}`}>fit {level}</span>;
}
export function CompliancePill({ status, notes }: { status: ComplianceState; notes?: string }) {
  return <span className={`${PILL} ${COMPLIANCE_TONE[status]}`} title={notes || undefined}>{COMPLIANCE_LABEL[status]}</span>;
}

/** One partner on the board: handle, followers, fit, compliance, campaign and the last thing that happened, a
 *  "Follow-up ready" or "Email failed" flag, and the one-tap send for its newest DM or contact form draft. */
export function PartnerCard({ p, campaigns }: { p: Partner; campaigns: Record<string, Campaign> }) {
  const last = lastAction(p);
  const followUp = !p.doNotContact && p.drafts.some((d) => d.followUpOf && d.status === "draft");
  const failed = p.drafts.some((d) => d.status === "failed");
  const approvedEmail = p.drafts.some((d) => d.channel === "email" && d.status === "approved");
  const quick = p.doNotContact ? undefined : [...p.drafts].reverse().find((d) => (d.channel === "dm" || d.channel === "form") && !isSent(d));
  return (
    <article className="rounded-lg border border-bb-border bg-bb-surface2/40 p-3 space-y-2 min-w-0">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold leading-snug break-words"><Link href={`/sales/partners/${p.id}`} className="hover:text-bb-blue">{p.name}</Link></h3>
          <p className="text-[11.5px] text-bb-dim break-words">{PLATFORM_LABEL[p.platform]} {p.handle}</p>
        </div>
        <PartnerStatusPill status={p.status} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FitPill level={p.fit.level} />
        <CompliancePill status={p.compliance.status} notes={p.compliance.notes} />
        {followUp && <Link href={`/sales/partners/${p.id}`} className={`${PILL} ${AMBER}`}>Follow-up ready</Link>}
        {failed && <Link href={`/sales/partners/${p.id}`} className={`${PILL} ${RED}`}>Email failed</Link>}
        {approvedEmail && <span className={`${PILL} ${BLUE}`}>Email approved</span>}
        {p.doNotContact && <span className={`${PILL} ${RED}`}>Opted out</span>}
      </div>
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11.5px]">
        <dt className="text-bb-dim">Followers</dt>
        <dd className="tabular-nums" title={p.audience.followers !== null ? `${p.audience.source}, ${p.audience.at}` : undefined}>{followersLabel(p.audience.followers)}</dd>
        <dt className="text-bb-dim">Campaign</dt>
        <dd className="min-w-0 truncate">{p.campaigns.length ? p.campaigns.map((id) => <Link key={id} href={`/campaigns/${id}`} className="mr-1.5 hover:text-bb-blue">{campaigns[id]?.name ?? id}</Link>) : <span className="text-bb-dim">none</span>}</dd>
        <dt className="text-bb-dim">Last</dt>
        <dd className="min-w-0 text-bb-muted"><span className="tabular-nums">{shortDay(last.at)}</span> · {last.text}</dd>
      </dl>
      {quick && (
        <DraftActions compact partner={p.id} n={quick.n} channel={quick.channel} status={quick.status} text={quick.body}
          openUrl={quick.channel === "form" ? (p.contact?.detail && /^https:/.test(p.contact.detail) ? p.contact.detail : null) : p.url}
          platform={PLATFORM_LABEL[p.platform]} hqSends={false} senderWhy="" />
      )}
    </article>
  );
}

/** Counts by status and what partner tags brought, for a campaign's page and the department tab. */
export function PartnerCounts({ counts }: { counts: Record<PartnerStatus, number> }) {
  const xs = (Object.keys(counts) as PartnerStatus[]).filter((s) => counts[s]);
  if (!xs.length) return <span className="text-[12px] text-bb-dim">none yet</span>;
  return <span className="flex flex-wrap gap-1.5">{xs.map((s) => <span key={s} className={`${PILL} ${PARTNER_STATUS_TONE[s]}`}>{STATUS_LABEL[s]} {counts[s]}</span>)}</span>;
}

export { MeasureValue };
