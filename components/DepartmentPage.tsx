// One department. Same bones as every HQ page: title + blurb with actions on
// the right, a row of stat tiles, a check strip, then the sections.

import { AnalyticsBoard } from "@/components/AnalyticsBoard";
import { ScorecardCard } from "@/components/ScorecardCard";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";

import { AutoRefresh, CopyCommand, RecheckButton } from "@/components/Controls";
import { Rich } from "@/components/Rich";
import { Tile } from "@/components/Tile";
import { SEVERITY_RANK } from "@/lib/ceo";
import { preferredBusiness } from "@/lib/current";
import { latestPlan, listPosts } from "@/lib/store";
import type { ChannelState } from "@/lib/publishing";

const CHANNEL_TONE: Record<ChannelState, string> = {
  connected: "border-bb-accent/40 bg-bb-accent/10 text-bb-accent",
  "not-connected": "border-bb-warn/40 bg-bb-warn/10 text-bb-warn",
  "via-postiz": "border-bb-blue/40 bg-bb-blue/10 text-bb-blue",
  manual: "border-bb-border bg-bb-surface text-bb-muted",
  unknown: "border-bb-border bg-bb-surface text-bb-muted",
};
import { getStatus } from "@/lib/status";
import { GRADE_LABEL, GRADE_TONE, LICENCE_TONE, PILL, SEVERITY_TONE, TOOL_LABEL, TOOL_TONE } from "@/lib/tone";

const th = "text-left pb-2 pr-5 last:pr-0 text-[9.5px] uppercase tracking-[0.14em] font-mono text-bb-dim font-normal";
const td = "py-2 pr-5 last:pr-0 border-t border-bb-border/60 text-[12.5px] align-top";

export default async function DepartmentPage({ params, embedded=false }: { params: { dept: string }; embedded?:boolean }) {
  const report = await getStatus(await preferredBusiness());
  const d = report.departments.find((x) => x.slug === params.dept);
  if (!d) notFound();
  const business = report.business;
  const plan = business ? latestPlan(business.slug, d.slug) : null;
  const showPublishing = d.slug === "content" && business;
  const posts = showPublishing ? listPosts(business.slug, 8) : [];
  const snap = report.host.connections;
  const showIntel = d.slug === "competitors" && business;
  const intelRows = report.host.intel.rows ?? [];
  const since = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "never");

  const findings = report.findings
    .filter((f) => f.dept === d.slug)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const running = d.tools.filter((t) => t.state === "running");
  const firstSkill = d.skills.find((s) => s.ready);

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={30} />

      {!embedded && <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow mb-1">
            {d.role}
            {business && <span className="text-bb-dim"> · {business.name}</span>}
          </div>
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            {d.label}
            <span className={`${PILL} ${GRADE_TONE[d.grade]}`}>{GRADE_LABEL[d.grade]}</span>
          </h1>
          <p className="text-bb-muted text-[13px] mt-1 max-w-[72ch]">{d.mission}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {running
            .filter((t) => t.url)
            .map((t) => (
              <a
                key={t.name}
                href={t.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-bb-border px-3 py-1.5 text-[12px] text-bb-muted hover:text-bb-fg hover:bg-bb-surface"
              >
                Open {t.name} ↗
              </a>
            ))}
          <Link
            href="/ceo"
            className="rounded-lg border border-bb-border px-3 py-1.5 text-[12px] text-bb-muted hover:text-bb-fg hover:bg-bb-surface"
          >
            CEO →
          </Link>
        </div>
      </div>}

      {!d.active && business && (
        <section className="card p-3 border-bb-warn/40 text-[12.5px] text-bb-warn">
          {business.name} skips this department (profile → departments.skip). It&apos;s shown here for reference only.
        </section>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Readiness" value={`${d.readiness}%`} hint="half skills, half tools" />
        <Tile
          label="Needs covered"
          value={`${d.needsMet}/${d.needs}`}
          hint={`${d.toolsLive} of ${d.tools.length} tools available · ${running.length} running`}
          tone={d.needsMet < d.needs ? "warn" : undefined}
        />
        <Tile
          label="Skills ready"
          value={`${d.skillsReady}/${d.skills.length}`}
          hint={d.skillsReady === d.skills.length ? "all installed" : `${d.skills.length - d.skillsReady} missing`}
          tone={d.skillsReady < d.skills.length ? "warn" : undefined}
        />
        <Tile
          label="Needs attention"
          value={String(findings.filter((f) => f.severity !== "info").length)}
          hint={findings.length ? "see below" : "nothing flagged"}
          tone={findings.some((f) => f.severity === "critical") ? "danger" : undefined}
        />
      </div>

      <section className="card p-3">
        <div className="flex flex-wrap gap-2">
          <RecheckButton />
          <Link
            href={`/guides/${d.slug}`}
            className="rounded-lg border border-bb-border px-3 py-1.5 text-left hover:bg-bb-surface"
          >
            <span className="block text-[12px] text-bb-fg/90">Set this up</span>
            <span className="block text-[9.5px] text-bb-dim">step-by-step guide</span>
          </Link>
          <CopyCommand command={`/hq:setup set up the ${d.label} department`} label="Walk me through it" blurb="/hq:setup in Claude Code" />
          {firstSkill && (
            <CopyCommand command={`/${firstSkill.id}`} label="Copy a starter skill" blurb={`/${firstSkill.id}`} />
          )}
          {business && (
            <CopyCommand command={`/hq:dept ${d.slug}`} label="Plan this week" blurb={`/hq:dept ${d.slug}`} />
          )}
          <CopyCommand command="/hq:ceo" label="Ask the CEO" blurb="/hq:ceo in Claude Code" />
        </div>
      </section>

      {findings.length > 0 && (
        <section className="card p-4 space-y-2.5">
          <h2 className="text-[15px] font-semibold">From the CEO</h2>
          {findings.map((f) => (
            <div key={f.id} className="rounded-lg border border-bb-border bg-bb-surface2/40 px-3 py-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`${PILL} ${SEVERITY_TONE[f.severity]}`}>{f.severity}</span>
                <span className="text-[13px] font-medium">{f.title}</span>
              </div>
              <p className="text-[12px] text-bb-muted mt-1"><Rich text={f.detail} /></p>
              <p className="text-[12px] mt-1">
                <span className="text-bb-dim font-mono text-[10.5px] uppercase tracking-[0.1em] mr-1.5">Next</span>
                <Rich text={f.action} />
              </p>
            </div>
          ))}
        </section>
      )}

      {d.slug === "data" && business && <ScorecardCard business={business} />}

      {d.slug === "data" && business && !embedded && <AnalyticsBoard business={business} />}

      {showPublishing && (
        <section className="card p-4 min-w-0">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-[15px] font-semibold">
              Publishing <span className="text-bb-muted font-normal">({report.publishing.length} channels)</span>
            </h2>
            <span className="text-[10.5px] text-bb-dim font-mono">
              {snap ? `connections checked ${snap.checkedAt.slice(0, 16).replace("T", " ")}` : "no connection snapshot: run /hq:connections"}
            </span>
          </div>
          <p className="text-[11.5px] text-bb-muted mt-1 max-w-[90ch]">
            Composio posts through already-approved apps; WoopSocial handles TikTok (audited, so posts can be public);
            Postiz covers bot-token channels. <code className="font-mono text-bb-fg/80">/hq:publish</code> posts, asks
            before anything goes public, and reads each post back.
          </p>
          {report.publishing.length === 0 ? (
            <p className="text-[12px] text-bb-muted mt-3">This business&apos;s profile lists no channels.</p>
          ) : (
            <div className="mt-3 overflow-x-auto"><table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Channel</th>
                  <th className={th}>Handle</th>
                  <th className={th}>Route</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {report.publishing.map((c) => (
                  <tr key={c.platform}>
                    <td className={`${td} font-medium whitespace-nowrap`}>{c.label}</td>
                    <td className={`${td} font-mono text-[11.5px] text-bb-muted`}>{c.handle}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <span className="font-mono text-[11.5px]">{c.via}</span>
                      {c.toolkit && <span className="block text-[10px] text-bb-dim font-mono">{c.toolkit}</span>}
                    </td>
                    <td className={td}>
                      <span className={`${PILL} ${CHANNEL_TONE[c.state]}`}>{c.state.replace("-", " ")}</span>
                      <span className="block text-[11px] text-bb-muted mt-0.5">{c.detail}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          {posts.length > 0 && (
            <div className="mt-4 border-t border-bb-border/60 pt-3">
              <div className="text-[9.5px] uppercase tracking-[0.14em] font-mono text-bb-dim mb-1.5">Recent posts</div>
              {posts.map((x) => (
                <div key={`${x.at}-${x.platform}`} className="flex gap-3 text-[11.5px] py-0.5">
                  <span className="font-mono text-bb-dim w-32 shrink-0">{x.at.slice(0, 16).replace("T", " ")}</span>
                  <span className="w-20 shrink-0">{x.platform}</span>
                  <span className="w-20 shrink-0 text-bb-muted">{x.status}</span>
                  {x.url ? (
                    <a href={x.url} target="_blank" rel="noreferrer" className="text-bb-blue hover:underline truncate">
                      {x.url}
                    </a>
                  ) : (
                    <span className="text-bb-dim">-</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {showIntel && (
        <section className="card p-4 min-w-0">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-[15px] font-semibold">
              Competitors <span className="text-bb-muted font-normal">({business.competitors?.length ?? 0})</span>
            </h2>
            <span className="text-[10.5px] text-bb-dim font-mono">
              {report.host.intel.watcherUp ? `watcher up · ${intelRows.length} page(s) watched` : "watcher down"}
            </span>
          </div>
          <p className="text-[11.5px] text-bb-muted mt-1 max-w-[90ch]">
            Public sources only. changedetection.io checks each watched page on a schedule;{" "}
            <code className="font-mono text-bb-fg/80">/hq:competitors</code> turns what changed (plus their content and
            ads) into a weekly brief with actions for the other departments.
          </p>
          {!business.competitors?.length ? (
            <p className="text-[12px] text-bb-muted mt-3">
              No competitors in the profile yet. Run <code className="font-mono text-bb-fg/80">/hq:competitors setup</code>.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto"><table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Competitor</th>
                  <th className={th}>Channels</th>
                  <th className={th}>Watched pages</th>
                  <th className={th}>Last change</th>
                </tr>
              </thead>
              <tbody>
                {business.competitors.map((c) => {
                  const rows = intelRows.filter((r) => r.competitor === c.name);
                  const last = rows.map((r) => r.lastChanged).filter(Boolean).sort().pop() ?? null;
                  return (
                    <tr key={c.name}>
                      <td className={`${td} whitespace-nowrap`}>
                        <span className="font-medium">{c.name}</span>
                        {c.site && (
                          <a href={c.site} target="_blank" rel="noreferrer" className="block text-[10.5px] text-bb-blue hover:underline">
                            {c.site.replace(/^https?:\/\/(www\.)?/, "")} ↗
                          </a>
                        )}
                      </td>
                      <td className={`${td} text-[11.5px] text-bb-muted`}>
                        {Object.entries(c.channels ?? {}).map(([k, v]) => (
                          <span key={k} className="block">
                            <span className="font-mono text-bb-dim">{k}</span> {v.replace(/^https?:\/\/(www\.)?/, "")}
                          </span>
                        ))}
                        {!Object.keys(c.channels ?? {}).length && <span className="text-bb-dim">-</span>}
                      </td>
                      <td className={`${td} text-[11.5px]`}>
                        {rows.length === 0 ? (
                          <span className="text-bb-dim">{c.watch?.length || c.site ? "not synced yet" : "content only"}</span>
                        ) : (
                          rows.map((r) => (
                            <span key={r.uuid} className="block">
                              <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1.5 ${r.error ? "bg-bb-danger" : "bg-bb-accent"}`} />
                              {r.url.replace(/^https?:\/\/(www\.)?/, "")}
                              {r.error && <span className="text-bb-danger"> · {r.error}</span>}
                            </span>
                          ))
                        )}
                      </td>
                      <td className={`${td} font-mono text-[11px] text-bb-muted whitespace-nowrap`}>{rows.length ? since(last) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <section className="card p-4 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">
              Tools <span className="text-bb-muted font-normal">({d.tools.length})</span>
            </h2>
            <span className="text-[10.5px] text-bb-dim font-mono">teal open source · indigo open core · pink free proprietary · green built in HQ</span>
          </div>
          <div className="mt-3 overflow-x-auto"><table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Tool</th>
                <th className={th}>What it does</th>
                <th className={th}>Licence</th>
                <th className={th}>On this Mac</th>
              </tr>
            </thead>
            <tbody>
              {d.tools.map((t) => (
                <tr key={t.name}>
                  <td className={`${td} whitespace-nowrap`}>
                    <a
                      href={t.repo.startsWith("https://") ? t.repo : `https://github.com/${t.repo}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:text-bb-blue"
                    >
                      {t.name}
                    </a>
                    {t.url && t.state === "running" && (
                      <a href={t.url} target="_blank" rel="noreferrer" className="block text-[10.5px] text-bb-blue hover:underline">
                        {t.url.replace("http://", "")} ↗
                      </a>
                    )}
                  </td>
                  <td className={`${td} text-bb-muted`}>
                    {t.what}
                    {(t.group || t.optional) && (
                      <span className="block text-[10px] font-mono text-bb-dim mt-0.5">
                        {t.group ? `one of: ${t.group}` : ""}
                        {t.optional ? "optional · add when needed" : ""}
                      </span>
                    )}
                    {t.warn && <span className="block text-[11px] text-bb-warn mt-0.5">⚠ {t.warn}</span>}
                    {t.freeNote && <span className="block text-[11px] text-bb-pink/80 mt-0.5">{t.freeNote}</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <span className={`${PILL} ${LICENCE_TONE[t.licence.kind]}`}>{t.licence.spdx}</span>
                    {t.licence.kind === "open-core" && (
                      <span className="block text-[9.5px] text-bb-dim font-mono mt-1">open core</span>
                    )}
                    {t.licence.kind === "own" && (
                      <span className="block text-[9.5px] text-bb-accent/80 font-mono mt-1">built in HQ</span>
                    )}
                    {t.licence.kind === "free" && (
                      <span className="block text-[9.5px] text-bb-pink/80 font-mono mt-1">free, not open source</span>
                    )}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <span className={`${PILL} ${TOOL_TONE[t.state]}`}>{TOOL_LABEL[t.state]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>

        <div className="space-y-4">
          <section className="card p-4 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-semibold">This week&apos;s plan</h2>
              {plan && <span className="text-[10.5px] text-bb-dim font-mono">{plan.at.slice(0, 10)}</span>}
            </div>
            {plan ? (
              <div className="prose-brief text-[12.5px] text-bb-fg/85 mt-2">
                <ReactMarkdown>{plan.markdown}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-[12px] text-bb-muted mt-2">
                {business ? (
                  <>
                    No plan yet. <code className="font-mono text-bb-fg/80">/hq:dept {d.slug}</code> writes one here and in
                    the vault.
                  </>
                ) : (
                  "Plans are per business: connect one first."
                )}
              </p>
            )}
          </section>

          <section className="card p-4 min-w-0">
            <h2 className="text-[15px] font-semibold">The job</h2>
            <ul className="mt-2 space-y-1.5">
              {d.covers.map((c) => (
                <li key={c} className="flex gap-2 text-[12.5px] text-bb-muted">
                  <span className="text-bb-blue">›</span>
                  {c}
                </li>
              ))}
            </ul>
            {d.notes && d.notes.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {d.notes.map((n) => (
                  <p key={n} className="rounded-lg border border-bb-border bg-bb-surface2/40 px-3 py-2 text-[11.5px] text-bb-muted">
                    {n}
                  </p>
                ))}
              </div>
            )}
          </section>

          <section className="card p-4 min-w-0">
            <h2 className="text-[15px] font-semibold">
              Claude skills <span className="text-bb-muted font-normal">({d.skillsReady}/{d.skills.length})</span>
            </h2>
            <p className="text-[11px] text-bb-dim mt-0.5">Type the command in Claude Code.</p>
            <div className="mt-3 space-y-1.5">
              {d.skills.map((s) => (
                <div key={s.id} className="flex items-start gap-2.5 rounded-lg border border-bb-border bg-bb-surface2/40 px-3 py-2">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${s.ready ? "bg-bb-accent" : "bg-bb-danger"}`}
                    title={s.ready ? "installed" : "not installed"}
                  />
                  <span className="min-w-0">
                    <span className="block font-mono text-[11.5px] text-bb-fg/90 break-all">/{s.id}</span>
                    <span className="block text-[11px] text-bb-muted">
                      {s.what}
                      {!s.ready && <span className="text-bb-danger"> · not installed</span>}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
