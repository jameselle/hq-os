// Partnerships (Sales & Partnerships): every partner of the current business on a board by pipeline stage, each with
// its handle, followers, fit, compliance, campaign and last action, plus what live partners' tags brought. HQ never
// contacts anyone: outreach drafts wait here for the owner to send. Numbers come only from the analytics adapter's rows
// keyed by each partner's tag; anything unmeasured says so.
import Link from "next/link";
import { notFound } from "next/navigation";

import { ApproveAllEmail } from "@/components/PartnerControls";
import { MeasureValue, PartnerCard } from "@/components/PartnerParts";
import { Tile } from "@/components/Tile";
import { preferredBusiness } from "@/lib/current";
import { capOf, sentToday } from "@/lib/partner-outreach";
import { partnersView } from "@/lib/partner-report";
import { outreachConfigOrNull } from "@/lib/partner-store";
import { STAGES } from "@/lib/partners";
import { resolveCurrent } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partnerships · HQ" };

export default async function PartnersPage({ params, searchParams }: { params: Promise<{ dept: string }>; searchParams: Promise<{ campaign?: string }> }) {
  if ((await params).dept !== "sales") notFound();
  const { campaign } = await searchParams;
  const p = resolveCurrent(await preferredBusiness());
  const v = p ? partnersView(p.slug) : null;
  const shown = v ? v.partners.filter((x) => !campaign || x.campaigns.includes(campaign)) : [];
  const usedCampaigns = v ? [...new Set(v.partners.flatMap((x) => x.campaigns))] : [];
  const r = v?.report;
  const sender = p ? outreachConfigOrNull(p.slug) : null;
  const cfg = sender?.config ?? null;
  const campaignEmail = v && campaign ? v.partners.filter((x) => x.campaigns.includes(campaign) && !x.doNotContact && x.compliance.status === "ok" && x.contact?.route === "email")
    .reduce((n, x) => n + x.drafts.filter((d) => d.channel === "email" && d.status === "draft" && !d.attempts?.length).length, 0) : 0;
  const failed = v ? v.partners.flatMap((x) => x.drafts.filter((d) => d.status === "failed").map((d) => ({ x, d }))) : [];

  return (
    <div className="space-y-5 min-w-0">
      <header className="space-y-2">
        <Link href="/sales" className="text-[12px] text-bb-blue hover:underline">← Sales &amp; Partnerships</Link>
        <div>
          <div className="eyebrow mb-1">Sales &amp; Partnerships</div>
          <h1 className="text-2xl font-semibold">Partnerships{p && <span className="text-bb-muted font-normal text-[17px]"> · {p.name}</span>}</h1>
          <p className="mt-1 max-w-[78ch] text-[13px] text-bb-muted">
            Creators, tipsters, podcasts, newsletters and affiliates, from found to live. Each one is screened for compliance and fit
            before anyone is contacted. HQ writes the drafts; you approve them. Approved emails to a partner&apos;s public business address
            go out from HQ on weekdays between 9am and 5pm; DMs and contact forms you send with one tap. Anyone who hasn&apos;t answered in
            five days gets one follow-up for your yes, never a second. A live partner&apos;s links carry their own tag, so the sign-ups they
            bring count toward their campaign.
          </p>
        </div>
      </header>

      {!p || !v || !r ? <p className="card px-4 py-3 text-[12.5px] text-bb-muted">Choose a business.</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="In the pipeline" value={String(r.open)} hint={`${r.counts.prospect + r.counts.shortlisted} prospects · ${r.counts.contacted + r.counts.replied + r.counts.negotiating} in talks`} />
            <Tile label="Live and tagged" value={String(r.liveTagged)} hint={`${r.counts.live} live · ${r.counts.paused} paused`} />
            <div className="card px-3.5 py-3 min-w-0">
              <div className="text-[9.5px] uppercase tracking-[0.14em] font-mono text-bb-dim">Partner sign-ups</div>
              <div className="mt-0.5"><MeasureValue m={r.totals.signups} currency={p.currency} /></div>
              <div className="mt-0.5 text-[10.5px] text-bb-muted line-clamp-3" title={r.totals.signups.note}>{r.totals.signups.note}</div>
            </div>
            <Tile label="Needs a check" value={String(r.needsCheck)} hint={`compliance to clear · ${r.waiting} ${r.waiting === 1 ? "draft" : "drafts"} not sent · ${r.followUps} ${r.followUps === 1 ? "follow-up" : "follow-ups"} ready`} tone={r.needsCheck || r.followUps ? "warn" : undefined} />
          </div>

          <section className="card px-4 py-3 text-[12.5px] break-words space-y-1" aria-label="Email sending">
            {sender?.problem ? <p className="text-bb-warn">Email sending is off: {sender.problem}</p>
              : !cfg ? <p className="text-bb-muted"><span className="font-semibold text-bb-fg">Email sending is off: connect a sender.</span> HQ emails approved drafts only once a verified sender is set up for {p.name} (Resend with the business&apos;s domain verified, or Gmail, through Composio). Until then, approve and send emails yourself. <Link href="/guides/partners" className="text-bb-blue hover:underline">How to connect one</Link></p>
              : <p className="text-bb-muted"><span className="font-semibold text-bb-fg">Email sending is on{cfg.paused ? " but paused" : ""}</span> from {cfg.sender.from} · {sentToday(v.partners, new Date(), p.timezone)} of {capOf(cfg)} sent today · weekdays 9am to 5pm, one send per draft, every email with the opt-out line.</p>}
            {failed.length > 0 && <p className="text-bb-danger">{failed.length} email {failed.length === 1 ? "draft" : "drafts"} failed: {failed.map(({ x, d }) => <Link key={`${x.id}-${d.n}`} href={`/sales/partners/${x.id}`} className="mr-2 underline">{x.name} ({d.n})</Link>)}</p>}
            {campaign && cfg && <div className="pt-1"><ApproveAllEmail campaign={campaign} name={v.campaigns[campaign]?.name ?? campaign} count={campaignEmail} /></div>}
          </section>

          {v.invalid.length > 0 && (
            <div className="card border-bb-warn/40 px-4 py-3 text-[12.5px] text-bb-warn break-words">
              {v.invalid.map((x) => <p key={x.file}>{x.file} isn&apos;t shown: {x.problems.join("; ")}</p>)}
            </div>
          )}

          {usedCampaigns.length > 0 && (
            <nav className="flex flex-wrap items-center gap-1.5 text-[12px]" aria-label="Filter by campaign">
              <span className="text-bb-dim mr-1">Campaign</span>
              <Link href="/sales/partners" className={`rounded-md border px-2 py-0.5 ${!campaign ? "border-bb-blue/40 bg-bb-blue/10 text-bb-blue" : "border-bb-border text-bb-muted hover:text-bb-fg"}`}>All</Link>
              {usedCampaigns.map((id) => (
                <Link key={id} href={`/sales/partners?campaign=${encodeURIComponent(id)}`} className={`rounded-md border px-2 py-0.5 ${campaign === id ? "border-bb-blue/40 bg-bb-blue/10 text-bb-blue" : "border-bb-border text-bb-muted hover:text-bb-fg"}`}>{v.campaigns[id]?.name ?? id}</Link>
              ))}
            </nav>
          )}

          {!v.partners.length ? (
            <section className="card space-y-2 p-4">
              <h2 className="text-[15px] font-semibold">No partners yet</h2>
              <p className="max-w-[80ch] text-[12.5px] text-bb-muted">
                Find and screen them with <span className="font-mono">/hq:partners</span> in Claude Code, or write them as JSON and add them with{" "}
                <span className="font-mono break-all">npm run hq -- partner add {p.slug} partners.json</span>.{" "}
                <Link href="/guides/partners" className="text-bb-blue hover:underline">How partnerships work</Link>
              </p>
            </section>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {STAGES.map((st) => {
                const xs = shown.filter((x) => st.statuses.includes(x.status));
                return (
                  <section key={st.key} className="card p-3 space-y-2.5 min-w-0" aria-label={st.label}>
                    <div>
                      <h2 className="text-[13.5px] font-semibold">{st.label} <span className="font-normal text-bb-dim">{xs.length}</span></h2>
                      <p className="text-[10.5px] text-bb-dim">{st.blurb}</p>
                    </div>
                    {xs.length ? xs.map((x) => <PartnerCard key={x.id} p={x} campaigns={v.campaigns} />) : <p className="text-[12px] text-bb-dim">None.</p>}
                  </section>
                );
              })}
            </div>
          )}

          {r.missing.length > 0 && v.partners.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-[15px] font-semibold">Not measured yet</h2>
              <ul className="card space-y-1.5 border-bb-warn/30 px-4 py-3 text-[12.5px] text-bb-muted break-words">
                {r.missing.map((m) => <li key={m}><span className="text-bb-warn">·</span> {m}</li>)}
              </ul>
            </section>
          )}

          <p className="text-[11.5px] text-bb-dim break-words">
            Pipeline brief: <span className="font-mono">npm run hq -- partner report {p.slug}</span> · optional CRM copy:{" "}
            <span className="font-mono">npm run hq -- partner sync {p.slug}</span> (Twenty, once its API key is in the Keychain)
          </p>
        </>
      )}
    </div>
  );
}
