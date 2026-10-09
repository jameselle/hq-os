// One campaign: what it is (goal, audience, offer, channels, dates, budget, tag), how it's doing against its target,
// everything linked to it (posts, blog posts, emails, experiments, notes) and the dated results and learnings.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Channels, LEVER_LABEL, LEVER_TONE, MeasureValue, PrimaryLine, StatusPill, dates, day } from "@/components/CampaignParts";
import { formatAnalytics } from "@/lib/analytics-metrics";
import { getCampaign } from "@/lib/campaign-store";
import { campaignFacts } from "@/lib/campaign-report";
import { CHANNEL_LABEL, campaignReport, type Measure } from "@/lib/campaigns";
import { PartnerCounts, PartnerStatusPill } from "@/components/PartnerParts";
import { campaignPartners } from "@/lib/partner-report";
import { preferredBusiness } from "@/lib/current";
import { DEPARTMENTS } from "@/lib/registry";
import { resolveCurrent } from "@/lib/store";
import { PILL } from "@/lib/tone";

export const dynamic = "force-dynamic";

const deptLabel = (s: string) => (s === "ceo" ? "CEO" : DEPARTMENTS.find((d) => d.slug === s)?.label ?? s);
const STATUS_TONE: Record<string, string> = {
  posted: "text-bb-accent", published: "text-bb-accent", approved: "text-bb-blue", draft: "text-bb-muted",
  rejected: "text-bb-dim", failed: "text-bb-danger", "not found": "text-bb-warn",
};

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
      <div className="mt-0.5 text-[10.5px] text-bb-muted line-clamp-3" title={m.note}>{m.note}</div>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: `${(await params).id} · Campaigns · HQ` };
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = resolveCurrent(await preferredBusiness());
  if (!p) notFound();
  let c;
  try { c = getCampaign(p.slug, id); } catch { notFound(); }
  const r = campaignReport(c, campaignFacts(p.slug, { campaigns: [c] }));
  const cur = p.currency;
  const timeline = [
    ...c.results.map((x) => ({ at: x.at, kind: "result" as const, text: x.text, numbers: x.numbers ?? [] })),
    ...c.notes.map((x) => ({ at: x.at, kind: x.learning ? ("learning" as const) : ("note" as const), text: x.text, numbers: [] as { label: string; value: number }[] })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const cp = campaignPartners(p.slug, c.id);
  const linked = r.social.length + r.blog.length + r.posts.length + r.emails.length + r.experiments.length + r.notes.length;

  return (
    <div className="space-y-6 min-w-0">
      <header className="space-y-2">
        <Link href="/campaigns" className="text-[12px] text-bb-blue hover:underline">← All campaigns</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{c.name}</h1>
            <p className="mt-1 max-w-[80ch] text-[13px] text-bb-muted">{c.goal}</p>
          </div>
          <span className="flex shrink-0 gap-1.5"><span className={`${PILL} ${LEVER_TONE[c.lever]}`}>{LEVER_LABEL[c.lever]}</span><StatusPill status={c.status} /></span>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Section title="What it is">
          <dl className="card grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 p-4 text-[12.5px]">
            <dt className="text-bb-dim">Dates</dt><dd>{dates(r)}{r.day !== null && c.status === "live" ? ` · day ${r.day + 1}` : ""}</dd>
            <dt className="text-bb-dim">Audience</dt><dd>{c.audience}</dd>
            <dt className="text-bb-dim">Offer or hook</dt><dd>{c.offer}</dd>
            <dt className="text-bb-dim">Channels</dt><dd><Channels channels={c.channels} /></dd>
            <dt className="text-bb-dim">Runs it</dt><dd>{c.owner === "ceo" ? <Link href="/ceo" className="hover:text-bb-blue">CEO</Link> : <Link href={`/${c.owner}`} className="hover:text-bb-blue">{deptLabel(c.owner)}</Link>}</dd>
            <dt className="text-bb-dim">Budget</dt><dd>{c.budget === undefined ? <span className="text-bb-dim">none set</span> : formatAnalytics("money", c.budget, cur)}</dd>
            <dt className="text-bb-dim">Link tag</dt><dd className="font-mono text-[12px]">{c.utm.endsWith("*") ? `utm_source starting ${c.utm.slice(0, -1)}` : `utm_campaign=${c.utm}`}</dd>
            <dt className="text-bb-dim">Judged by</dt><dd>{r.primary.label}{r.primary.target !== null ? `, target ${r.primary.better === "down" ? "at most " : ""}${formatAnalytics(r.primary.unit, r.primary.target, cur)}` : ", no target set"}</dd>
          </dl>
        </Section>

        <Section title="How it's doing">
          <div className="card space-y-2 p-4">
            <PrimaryLine r={r} currency={cur} />
            <p className="text-[11.5px] text-bb-dim">{r.primary.note}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="card px-3.5 py-3"><div className="text-[9.5px] uppercase tracking-[0.14em] font-mono text-bb-dim">Items out</div><div className="mt-0.5 text-[20px] font-semibold tabular-nums">{r.out}</div><div className="mt-0.5 text-[10.5px] text-bb-muted">of {linked} linked or tagged</div></div>
            <Num label="Spend" m={r.spend} currency={cur} />
            <Num label="Sign-ups" m={r.signups} currency={cur} />
            <Num label="Cost per sign-up" m={r.costPerSignup} currency={cur} />
            <Num label="Paying customers" m={r.paying} currency={cur} />
            <Num label="Return on spend" m={r.roi} currency={cur} />
          </div>
        </Section>
      </div>

      {r.missing.length > 0 && (
        <Section title="Not measured yet">
          <ul className="card space-y-1.5 border-bb-warn/30 px-4 py-3 text-[12.5px] text-bb-muted">
            {r.missing.map((m) => <li key={m}><span className="text-bb-warn">·</span> {m}</li>)}
          </ul>
        </Section>
      )}

      <Section title="Linked work" aside={<span className="text-[11.5px] text-bb-dim">add with <span className="font-mono">npm run hq -- campaign link {p.slug} {c.id} &lt;kind&gt; &lt;ref&gt;</span></span>}>
        {!linked ? <p className="card px-4 py-3 text-[12.5px] text-bb-muted">Nothing linked yet. Tag social drafts and blog posts with the campaign, or link emails, experiments and live posts.</p> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {r.social.length > 0 && (
              <div className="card p-4 min-w-0">
                <h3 className="mb-2 text-[13px] font-semibold">Social posts <span className="font-normal text-bb-dim">({r.social.filter((s) => s.status === "posted").length} of {r.social.length} posted)</span></h3>
                <ul className="divide-y divide-bb-border/60 text-[12.5px]">
                  {r.social.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                      <span className="min-w-0 truncate">{s.day ? `${day(s.day)} · ` : ""}{CHANNEL_LABEL[s.network] ?? s.network}{s.format ? ` ${s.format}` : ""} <span className="font-mono text-[11px] text-bb-dim">{s.id}</span></span>
                      {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className={`${STATUS_TONE[s.status] ?? ""} hover:underline`}>{s.status}</a> : <Link href="/content" className={STATUS_TONE[s.status] ?? ""}>{s.status}</Link>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(r.blog.length > 0 || r.posts.length > 0) && (
              <div className="card space-y-3 p-4 min-w-0">
                {r.blog.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-[13px] font-semibold">Blog posts</h3>
                    <ul className="divide-y divide-bb-border/60 text-[12.5px]">
                      {r.blog.map((b) => <li key={b.slug} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5"><span className="min-w-0">{b.title}</span>{b.url ? <a href={b.url} target="_blank" rel="noopener noreferrer" className={`${STATUS_TONE[b.status] ?? ""} hover:underline`}>{b.status}</a> : <Link href="/seo" className={STATUS_TONE[b.status] ?? ""}>{b.status}</Link>}</li>)}
                    </ul>
                  </div>
                )}
                {r.posts.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-[13px] font-semibold">Live posts</h3>
                    <ul className="divide-y divide-bb-border/60 text-[12.5px]">
                      {r.posts.map((x) => <li key={x.url} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5"><a href={x.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate hover:text-bb-blue">{x.url.replace(/^https:\/\/(www\.)?/, "")}</a><span className={x.readBack ? "text-bb-accent" : "text-bb-warn"}>{x.readBack ? `read back${x.platform ? `, ${CHANNEL_LABEL[x.platform] ?? x.platform}` : ""}` : "not in HQ's publish log"}</span></li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {(r.emails.length > 0 || r.experiments.length > 0 || r.notes.length > 0) && (
              <div className="card space-y-3 p-4 min-w-0">
                {r.emails.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-[13px] font-semibold">Emails and messages</h3>
                    <ul className="space-y-2 text-[12.5px]">
                      {r.emails.map((e) => (
                        <li key={e.ref}>
                          <div className="flex flex-wrap items-baseline justify-between gap-2"><Link href="/email" className="hover:text-bb-blue">{e.label ?? e.ref}</Link><span className={e.sent ? "text-bb-accent" : "text-bb-dim"}>{e.sent === null ? "sends unknown" : `${e.sent} sent`}</span></div>
                          <p className="text-[11.5px] text-bb-dim">{e.note}</p>
                          {e.outcomes.map((o) => <p key={o} className="text-[11.5px] text-bb-muted">{o}</p>)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.experiments.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-[13px] font-semibold">Experiments</h3>
                    <ul className="space-y-2 text-[12.5px]">
                      {r.experiments.map((e) => <li key={e.id}><span className="font-mono text-bb-dim">#{e.id}</span> {e.hypothesis ?? "not in the experiment log"}{e.status && <span className="text-bb-muted"> · {e.status}{e.baseline !== null ? ` · baseline ${e.baseline}` : ""}{e.result !== null ? ` · result ${e.result}` : ""}</span>}</li>)}
                    </ul>
                  </div>
                )}
                {r.notes.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-[13px] font-semibold">Vault notes</h3>
                    <ul className="space-y-1 text-[12.5px]">
                      {r.notes.map((n) => <li key={n.ref} className="flex flex-wrap items-baseline justify-between gap-2"><span className="min-w-0">{n.ref.replace(/\.md$/, "")}</span><span className={n.found ? "text-bb-accent" : "text-bb-warn"}>{n.found ? "in the vault" : "not found"}</span></li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Partners" aside={<span className="text-[11.5px] text-bb-dim break-words">link one: <span className="font-mono">npm run hq -- partner link {p.slug} &lt;partner&gt; campaign {c.id}</span></span>}>
        {!cp.partners.length ? (
          <p className="card px-4 py-3 text-[12.5px] text-bb-muted">No partners serve this campaign yet. <Link href="/sales/partners" className="text-bb-blue hover:underline">Partnerships</Link></p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="card p-4 space-y-3 min-w-0">
              <PartnerCounts counts={cp.counts} />
              <ul className="divide-y divide-bb-border/60 text-[12.5px]">
                {cp.partners.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                    <span className="min-w-0 break-words"><Link href={`/sales/partners/${x.id}`} className="hover:text-bb-blue">{x.name}</Link> <span className="text-bb-dim">{x.handle}</span>{x.tracking.tag && <span className="font-mono text-[11px] text-bb-dim"> {x.tracking.tag}</span>}</span>
                    <PartnerStatusPill status={x.status} />
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-2 content-start">
              <Num label="Partner sign-ups" m={cp.outcome.signups} currency={cur} />
              <Num label="Partner paying" m={cp.outcome.paying} currency={cur} />
              <p className="col-span-2 text-[11.5px] text-bb-dim">From {cp.tagged} tagged {cp.tagged === 1 ? "partner" : "partners"}; their tags also count in the campaign&apos;s own numbers above.</p>
            </div>
          </div>
        )}
      </Section>

      <Section title="Results and learnings" aside={<span className="text-[11.5px] text-bb-dim">weekly: <span className="font-mono">npm run hq -- campaign report {p.slug} {c.id} --save</span></span>}>
        {!timeline.length ? <p className="card px-4 py-3 text-[12.5px] text-bb-muted">No results or notes yet. The weekly report saves what was measured; learnings are written when it closes.</p> : (
          <ol className="card divide-y divide-bb-border/60 px-4 py-1">
            {timeline.map((t, i) => (
              <li key={`${t.at}-${i}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2.5 text-[12.5px]">
                <span className="text-bb-dim tabular-nums">{day(t.at.slice(0, 10))}</span>
                <div className="space-y-1">
                  <p><span className={`${PILL} mr-2 ${t.kind === "learning" ? "border-bb-violet/40 bg-bb-violet/10 text-bb-violet" : t.kind === "result" ? "border-bb-teal/40 bg-bb-teal/10 text-bb-teal" : "border-bb-border bg-bb-surface text-bb-muted"}`}>{t.kind}</span>{t.text}</p>
                  {t.numbers.length > 0 && <p className="text-[11.5px] text-bb-muted">{t.numbers.map((n) => `${n.label} ${n.value}`).join(" · ")}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
