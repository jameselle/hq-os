// Campaigns: every marketing campaign of the current business, what it is and how it's doing. Live first, each with
// its dates, channels, the number it's judged by against its target, what went out, spend and cost per sign-up.
// Numbers come only from what HQ holds (lib/campaign-report.ts); anything unmeasured says so, never zero.
import Link from "next/link";

import { CampaignFlow } from "@/components/CampaignFlow";
import { Channels, LEVER_LABEL, LEVER_TONE, MeasureValue, PrimaryLine, StatusPill, dates } from "@/components/CampaignParts";
import { Tile } from "@/components/Tile";
import { readCampaigns } from "@/lib/campaign-store";
import { campaignReports } from "@/lib/campaign-report";
import { formatAnalytics } from "@/lib/analytics-metrics";
import { preferredBusiness } from "@/lib/current";
import { resolveCurrent } from "@/lib/store";
import { PILL } from "@/lib/tone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns · HQ" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === "how" ? "how" : "list";
  const p = resolveCurrent(await preferredBusiness());
  const reports = p ? campaignReports(p.slug) : [];
  const invalid = p ? readCampaigns(p.slug).invalid : [];
  const count = (s: string) => reports.filter((r) => r.campaign.status === s).length;
  const open = reports.filter((r) => r.campaign.status === "live");
  const spent = reports.filter((r) => r.spend.value !== null);
  const totalSpend = spent.reduce((n, r) => n + (r.spend.value as number), 0);
  const unmeasured = reports.filter((r) => r.campaign.status !== "planned" && r.primary.value === null).length;

  return (
    <div className="space-y-5 min-w-0">
      <header>
        <div className="eyebrow mb-1">Lead</div>
        <h1 className="text-2xl font-semibold">Campaigns{p && <span className="text-bb-muted font-normal text-[17px]"> · {p.name}</span>}</h1>
        <p className="mt-1 max-w-[78ch] text-[13px] text-bb-muted">
          Every marketing campaign: what it&apos;s for, who it&apos;s aimed at, the tag on its links and the number it&apos;s judged by.
          Performance comes from what HQ already holds: tagged posts, blog posts and emails, spend tagged in the ledger, and sign-ups
          the analytics adapter reports per tag. Anything not measured yet says what it needs.
        </p>
      </header>

      <nav aria-label="Campaign views" className="flex gap-1 overflow-x-auto border-b border-bb-border pb-px">
        {(["list", "how"] as const).map((t) => (
          <Link key={t} href={t === "list" ? "/campaigns" : "/campaigns?tab=how"} aria-current={tab === t ? "page" : undefined}
            className={`shrink-0 px-4 py-3 text-sm border-b-2 ${tab === t ? "border-bb-teal text-bb-fg" : "border-transparent text-bb-muted hover:text-bb-fg"}`}>
            {t === "list" ? "Campaigns" : "How it works"}
          </Link>
        ))}
      </nav>

      {tab === "how" ? <CampaignFlow /> : !p ? <p className="card px-4 py-3 text-[12.5px] text-bb-muted">Choose a business.</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Live" value={String(count("live"))} hint={`${count("planned")} planned · ${count("paused")} paused · ${count("done")} done`} />
            <Tile label="Items out" value={String(open.reduce((n, r) => n + r.out, 0))} hint="posts, blog posts and emails of live campaigns" />
            <Tile label="Spend tagged" value={spent.length ? formatAnalytics("money", totalSpend, p.currency) : "none yet"} hint={spent.length ? `across ${spent.length} campaign${spent.length === 1 ? "" : "s"}, from the ledger` : "tag spend in the ledger with campaign metadata"} />
            <Tile label="Not measured" value={String(unmeasured)} hint="started campaigns whose number HQ can't read yet" tone={unmeasured ? "warn" : undefined} />
          </div>

          {invalid.length > 0 && (
            <div className="card border-bb-warn/40 px-4 py-3 text-[12.5px] text-bb-warn">
              {invalid.map((x) => <p key={x.file}>{x.file} isn&apos;t shown: {x.problems.join("; ")}</p>)}
            </div>
          )}

          {!reports.length ? (
            <section className="card space-y-2 p-4">
              <h2 className="text-[15px] font-semibold">No campaigns yet</h2>
              <p className="max-w-[80ch] text-[12.5px] text-bb-muted">
                Plan one with <span className="font-mono">/hq:campaign</span> in Claude Code, or write the brief as JSON and add it with{" "}
                <span className="font-mono">npm run hq -- campaign add {p.slug} brief.json</span>.{" "}
                <Link href="/guides/campaigns" className="text-bb-blue hover:underline">How campaigns work</Link>
              </p>
            </section>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {reports.map((r) => {
                const c = r.campaign;
                return (
                  <article key={c.id} className="card space-y-3 p-4 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="text-[15px] font-semibold leading-snug"><Link href={`/campaigns/${c.id}`} className="hover:text-bb-blue">{c.name}</Link></h2>
                        <p className="mt-0.5 text-[12px] text-bb-dim">{dates(r)}{r.day !== null && c.status === "live" ? ` · day ${r.day + 1}` : ""}</p>
                      </div>
                      <span className="flex shrink-0 gap-1.5"><span className={`${PILL} ${LEVER_TONE[c.lever]}`}>{LEVER_LABEL[c.lever]}</span><StatusPill status={c.status} /></span>
                    </div>
                    <p className="text-[12.5px] text-bb-muted">{c.goal}</p>
                    <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-bb-dim"><Channels channels={c.channels} /><span className="font-mono">tag {c.utm}</span></div>
                    <PrimaryLine r={r} currency={p.currency} />
                    <dl className="grid grid-cols-3 gap-2 border-t border-bb-border/60 pt-3 text-[11.5px]">
                      <div><dt className="text-bb-dim">Items out</dt><dd className="text-[13px] font-semibold tabular-nums">{r.out}</dd></div>
                      <div><dt className="text-bb-dim">Spend</dt><dd><MeasureValue m={r.spend} currency={p.currency} small /></dd></div>
                      <div><dt className="text-bb-dim">Cost per sign-up</dt><dd><MeasureValue m={r.costPerSignup} currency={p.currency} small /></dd></div>
                    </dl>
                    <Link href={`/campaigns/${c.id}`} className="inline-block text-[12px] text-bb-blue hover:underline">What it is, what&apos;s linked and the results →</Link>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
