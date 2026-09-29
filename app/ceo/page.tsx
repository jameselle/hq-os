// The CEO: reads every department, ranks what needs doing, and lays it out.
// Live facts and standing rules come from lib/ceo.ts on every load; the
// written reviews are what /hq:ceo saved for the current business.

import Link from "next/link";
import ReactMarkdown from "react-markdown";

import { AutoRefresh, CopyCommand, DoneButton, RecheckButton } from "@/components/Controls";
import { Rich } from "@/components/Rich";
import { Tile } from "@/components/Tile";
import { preferredBusiness } from "@/lib/current";
import { getStatus } from "@/lib/status";
import { listReviews, readReview } from "@/lib/store";
import { GRADE_LABEL, GRADE_TONE, PILL, SEVERITY_TONE, readinessBar } from "@/lib/tone";

export const dynamic = "force-dynamic";

const th = "text-left pb-2 pr-5 last:pr-0 text-[9.5px] uppercase tracking-[0.14em] font-mono text-bb-dim font-normal";
const td = "py-2 pr-5 last:pr-0 border-t border-bb-border/60 text-[12.5px] align-middle";

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

const reviewLabel = (file: string) => file.replace(/^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})\.md$/, "$1 $2:$3");

export default async function CeoPage({ searchParams }: { searchParams: { review?: string } }) {
  const report = await getStatus(preferredBusiness());
  const { totals, findings, business } = report;
  const departments = report.departments.filter((d) => d.active);
  const reviews = business ? listReviews(business.slug) : [];
  const review = business ? readReview(business.slug, searchParams.review) : null;

  const critical = findings.filter((f) => f.severity === "critical");
  const decisions = findings.filter((f) => f.severity === "decision");
  const deptLabel = (slug: string) => report.departments.find((d) => d.slug === slug)?.label ?? slug;
  const topIssue = (slug: string) => findings.find((f) => f.dept === slug && f.severity !== "info");
  const byReadiness = [...departments].sort((a, b) => a.readiness - b.readiness);

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={30} />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow mb-1">Runs everything</div>
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            CEO
            {business && (
              <span className="text-bb-muted font-normal text-[17px]">
                · {business.name}
                {business.demo && <span className={`${PILL} border-bb-violet/40 bg-bb-violet/10 text-bb-violet ml-2 align-middle`}>demo</span>}
              </span>
            )}
          </h1>
          <p className="text-bb-muted text-[13px] mt-1 max-w-[76ch]">
            {business
              ? `${business.offer} for ${business.audience}. `
              : "No business connected yet. The kit below is ready; connect a business to get plans and reviews for it. "}
            Red is urgent, amber needs fixing, blue is a call only you can make.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href={`/${byReadiness[0]?.slug ?? "operations"}`}
            className="rounded-lg border border-bb-border px-3 py-1.5 text-[12px] text-bb-muted hover:text-bb-fg hover:bg-bb-surface"
          >
            Weakest department →
          </Link>
        </div>
      </div>

      {report.invalidBusinesses.length > 0 && (
        <section className="card p-3 border-bb-danger/40">
          {report.invalidBusinesses.map((b) => (
            <p key={b.slug} className="text-[12px] text-bb-danger">
              <span className="font-mono">{b.slug}/profile.json</span> is invalid: {b.errors.join("; ")}
            </p>
          ))}
        </section>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile
          label="Critical"
          value={String(critical.length)}
          hint={critical.length ? critical[0].title.toLowerCase() : "nothing on fire"}
          tone={critical.length ? "danger" : undefined}
        />
        <Tile
          label="For you to decide"
          value={String(decisions.length)}
          hint={decisions.length ? "calls only you can make" : "no open decisions"}
          tone={decisions.length ? "warn" : undefined}
        />
        <Tile
          label="Departments equipped"
          value={`${totals.equipped}/${totals.departments}`}
          hint={`${totals.departments - totals.equipped} running thin or on skills alone`}
        />
        <Tile label="Tools running" value={String(totals.toolsRunning)} hint="services up right now" />
        <Tile label="Tools available" value={`${totals.toolsLive}/${totals.toolsTotal}`} hint="installed, via npx, or a free web service" />
        <Tile
          label="Skills ready"
          value={`${totals.skillsReady}/${totals.skillsTotal}`}
          hint={totals.skillsReady === totals.skillsTotal ? "every expected skill installed" : "some missing"}
          tone={totals.skillsReady < totals.skillsTotal ? "warn" : undefined}
        />
      </div>

      <section className="card p-3">
        <div className="flex flex-wrap gap-2">
          <RecheckButton />
          {business ? (
            <>
              <CopyCommand command="/hq:ceo" label="Ask the CEO for a review" blurb="/hq:ceo in Claude Code" />
              <CopyCommand command="/hq:ceo plan the week" label="Ask for a weekly plan" blurb="/hq:ceo plan the week" />
            </>
          ) : null}
          <CopyCommand command="/hq:new-business" label="Connect a business" blurb="/hq:new-business" />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <section className="card p-4 space-y-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">
              What needs you <span className="text-bb-muted font-normal">({findings.length})</span>
            </h2>
            <span className="text-[10.5px] text-bb-dim font-mono">checked {ago(report.generatedAt)}</span>
          </div>
          {findings.length === 0 ? (
            <p className="text-[12.5px] text-bb-muted">Nothing flagged.</p>
          ) : (
            findings.map((f, i) => (
              <div key={f.id} className="rounded-lg border border-bb-border bg-bb-surface2/40 px-3 py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10.5px] text-bb-dim tabular-nums w-4">{i + 1}</span>
                  <span className={`${PILL} ${SEVERITY_TONE[f.severity]}`}>{f.severity}</span>
                  <Link href={`/${f.dept}`} className="text-[10.5px] font-mono text-bb-blue hover:underline">
                    {deptLabel(f.dept)}
                  </Link>
                  {(f.severity === "decision" || f.severity === "info") && f.id !== "no-business" && (
                    <DoneButton business={business?.slug ?? null} id={f.id} />
                  )}
                </div>
                <div className="text-[13px] font-medium mt-1.5">{f.title}</div>
                <p className="text-[12px] text-bb-muted mt-0.5">
                  <Rich text={f.detail} />
                </p>
                <p className="text-[12px] mt-1">
                  <span className="text-bb-dim font-mono text-[10.5px] uppercase tracking-[0.1em] mr-1.5">Next</span>
                  <Rich text={f.action} />
                </p>
              </div>
            ))
          )}
        </section>

        <section className="card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">
              {review && searchParams.review ? `CEO review · ${reviewLabel(review.file)}` : "Latest CEO review"}
            </h2>
            {review && <span className="text-[10.5px] text-bb-dim font-mono">written {ago(review.at)}</span>}
          </div>
          {review ? (
            <div className="prose-brief text-[12.5px] text-bb-fg/85 mt-2">
              <ReactMarkdown>{review.markdown}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-[12.5px] text-bb-muted mt-2">
              {business ? (
                <>
                  No review yet for {business.name}. Run <code className="font-mono text-bb-fg/80">/hq:ceo</code> in Claude
                  Code: it reads this page&apos;s data, decides the priorities, and saves its review here and in the
                  business&apos;s Obsidian vault.
                </>
              ) : (
                <>
                  Connect a business first with <code className="font-mono text-bb-fg/80">/hq:new-business</code>. Each
                  business gets its own reviews, plans and Obsidian vault.
                </>
              )}
            </p>
          )}
          {reviews.length > 1 && (
            <div className="mt-4 border-t border-bb-border/60 pt-3">
              <div className="text-[9.5px] uppercase tracking-[0.14em] font-mono text-bb-dim mb-1.5">Earlier reviews</div>
              <div className="flex flex-wrap gap-1.5">
                {reviews.map((r) => (
                  <Link
                    key={r.file}
                    href={`/ceo?review=${r.file}`}
                    className={`rounded-md border px-2 py-0.5 text-[10.5px] font-mono ${
                      review?.file === r.file ? "border-bb-blue/40 text-bb-blue" : "border-bb-border text-bb-muted hover:text-bb-fg"
                    }`}
                  >
                    {reviewLabel(r.file)}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="card p-4">
        <h2 className="text-[15px] font-semibold">
          Department scorecard <span className="text-bb-muted font-normal">(weakest first)</span>
        </h2>
        <table className="w-full border-collapse mt-3">
          <thead>
            <tr>
              <th className={th}>Department</th>
              <th className={th}>Stands in for</th>
              <th className={th}>Readiness</th>
              <th className={th}>Needs</th>
              <th className={th}>Skills</th>
              <th className={th}>Top issue</th>
            </tr>
          </thead>
          <tbody>
            {byReadiness.map((d) => {
              const issue = topIssue(d.slug);
              return (
                <tr key={d.slug}>
                  <td className={`${td} whitespace-nowrap`}>
                    <Link href={`/${d.slug}`} className="flex items-center gap-2 hover:text-bb-blue">
                      <span className="w-3.5 text-center text-bb-dim">{d.glyph}</span>
                      <span className="font-medium">{d.label}</span>
                    </Link>
                  </td>
                  <td className={`${td} text-bb-muted`}>{d.role}</td>
                  <td className={`${td} min-w-[150px]`}>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded-full bg-bb-surface2 overflow-hidden">
                        <div className={`h-full ${readinessBar(d.readiness)}`} style={{ width: `${d.readiness}%` }} />
                      </div>
                      <span className="tabular-nums text-[11.5px] w-9">{d.readiness}%</span>
                      <span className={`${PILL} ${GRADE_TONE[d.grade]}`}>{GRADE_LABEL[d.grade]}</span>
                    </div>
                  </td>
                  <td className={`${td} tabular-nums ${d.needsMet < d.needs ? "text-bb-warn" : "text-bb-muted"}`}>
                    {d.needsMet}/{d.needs}
                  </td>
                  <td className={`${td} tabular-nums text-bb-muted`}>
                    {d.skillsReady}/{d.skills.length}
                  </td>
                  <td className={td}>
                    {issue ? (
                      <span className="flex items-center gap-2">
                        <span
                          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                            issue.severity === "critical" ? "bg-bb-danger" : issue.severity === "decision" ? "bg-bb-blue" : "bg-bb-warn"
                          }`}
                        />
                        <span className="text-[12px]">{issue.title}</span>
                      </span>
                    ) : (
                      <span className="text-bb-dim">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <details className="card p-4">
        <summary className="cursor-pointer select-none text-[15px] font-semibold">
          Left out on purpose <span className="text-bb-muted font-normal">({report.excluded.length})</span>
        </summary>
        <p className="text-[12px] text-bb-muted mt-2 max-w-[80ch]">
          The rule is free tools only: open source where there&apos;s a good option, free proprietary where that&apos;s
          better. These need a paid plan for what we&apos;d use them for, so no department relies on them.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 mt-3">
          {report.excluded.map((x) => (
            <div key={x.name} className="rounded-lg border border-bb-border bg-bb-surface2/40 px-3 py-2 text-[12px]">
              <span className="font-medium">{x.name}</span>
              <span className="block text-bb-muted text-[11px]">{x.reason}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
