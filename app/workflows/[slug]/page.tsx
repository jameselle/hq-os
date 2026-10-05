// One workflow, end to end, for the current business: what it is, the number it moves, who does
// what (with each department's skills and tools), and for automated workflows the flow itself:
// who enters, the real message, and what happened after against the holdout.
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { Line } from "@/components/charts";
import { FlowAfter, FlowBefore, FlowMessage } from "@/components/FlowDetail";
import { LifecycleRefresh } from "@/components/LifecycleControls";
import { Hint, StatusCard, WeekOneCard } from "@/components/LifecycleStatus";
import { preferredBusiness } from "@/lib/current";
import { listExperiments, type Experiment } from "@/lib/experiments";
import { lifecycleState, supports } from "@/lib/lifecycle";
import { HINTS, flowStatus, timeLabel } from "@/lib/lifecycle-status";
import { DEPARTMENTS } from "@/lib/registry";
import { scorecardState } from "@/lib/scorecard";
import { METRICS, formatValue } from "@/lib/scorecard-metrics";
import { skillIndex } from "@/lib/status";
import { resolveCurrent } from "@/lib/store";
import { PILL } from "@/lib/tone";
import { flowsFor, metricHistory } from "@/lib/workflow-detail";
import { workflowEvidence, type Evidence } from "@/lib/workflow-evidence";
import { LEVERS, WORKFLOWS, workflowBySlug, type Node } from "@/lib/workflows";

export const dynamic = "force-dynamic";

const DEPT = Object.fromEntries(DEPARTMENTS.map((d) => [d.slug, d]));
const label = (n: Node) => (n === "ceo" ? "CEO" : DEPT[n]?.label ?? n);
const href = (n: Node) => (n === "ceo" ? "/ceo" : `/${n}`);
const LEVER_TONE: Record<string, string> = {
  get: "border-bb-teal/40 bg-bb-teal/10 text-bb-teal", keep: "border-bb-blue/40 bg-bb-blue/10 text-bb-blue",
  expand: "border-bb-violet/40 bg-bb-violet/10 text-bb-violet", base: "border-bb-border bg-bb-surface text-bb-muted",
};
const EVIDENCE = {
  live: { text: "live", tone: "border-bb-accent/40 bg-bb-accent/10 text-bb-accent", dot: "text-bb-accent" },
  partial: { text: "in part", tone: "border-bb-warn/40 bg-bb-warn/10 text-bb-warn", dot: "text-bb-warn" },
};
const STATUS_TONE: Record<Experiment["status"], string> = {
  running: "border-bb-blue/40 bg-bb-blue/10 text-bb-blue", won: "border-bb-accent/40 bg-bb-accent/10 text-bb-accent",
  lost: "border-bb-danger/40 bg-bb-danger/10 text-bb-danger", inconclusive: "border-bb-border bg-bb-surface text-bb-muted",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const w = workflowBySlug((await params).slug);
  return { title: w ? `${w.title} · HQ` : "HQ" };
}

function Section({ id, kicker, title, children, aside }: { id: string; kicker: string; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">{kicker}</div>
          <h2 id={id} className="text-[15px] font-semibold">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A short list of chips with the rest behind "+N more". */
function Chips({ items, limit, more }: { items: { key: string; text: string; ok?: boolean; hint?: string }[]; limit: number; more: string }) {
  const chip = (x: (typeof items)[number]) => (
    <li key={x.key} title={x.hint} className={`max-w-full break-all rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] ${x.ok === false ? "border-bb-border text-bb-dim" : x.ok ? "border-bb-accent/30 text-bb-fg" : "border-bb-border text-bb-muted"}`}>
      {x.ok !== undefined && <span aria-hidden className={x.ok ? "text-bb-accent" : "text-bb-dim"}>{x.ok ? "● " : "○ "}</span>}{x.text}
    </li>
  );
  if (!items.length) return <span className="text-[11.5px] text-bb-dim">none listed</span>;
  return (
    <div>
      <ul className="flex flex-wrap gap-1">{items.slice(0, limit).map(chip)}</ul>
      {items.length > limit && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] text-bb-muted hover:text-bb-fg">+{items.length - limit} more {more}</summary>
          <ul className="mt-1 flex flex-wrap gap-1">{items.slice(limit).map(chip)}</ul>
        </details>
      )}
    </div>
  );
}

export default async function WorkflowDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const w = workflowBySlug((await params).slug);
  if (!w) notFound();
  const n = WORKFLOWS.indexOf(w) + 1;
  const business = resolveCurrent(await preferredBusiness());
  const evidence: Evidence | undefined = business ? workflowEvidence(business.slug).evidence[w.title] : undefined;

  // The number it moves.
  let metric: { label: string; value: string; quality: string; note: string; week: string; points: { label: string; value: number | null }[]; format: (v: number) => string } | null = null;
  let metricWhy = w.metricId ? "" : "This workflow has no scorecard number yet. It is judged by: " + w.metric.toLowerCase() + ".";
  if (w.metricId && business) {
    try {
      const s = scorecardState(business.slug), snap = s.snapshot;
      const id = w.metricId as keyof typeof METRICS, def = METRICS[id];
      if (!def) metricWhy = "The scorecard has no metric with this id.";
      else if (!snap) metricWhy = `No scorecard snapshot for ${business.name} yet, so there is no ${def.label.toLowerCase()} to show.`;
      else {
        const m = snap.weeks[0].metrics.find((x) => x.id === id);
        const format = (v: number) => formatValue(def.unit, v, snap.currency);
        metric = {
          label: def.label, week: snap.weeks[0].week, quality: m?.quality ?? "missing", note: m?.note ?? "Not reported by the adapter",
          value: m && m.value !== null ? format(m.value) : "not reported",
          points: metricHistory(s.history, snap.weeks, id).map((p) => ({ label: p.week, value: p.value })), format,
        };
      }
    } catch { metricWhy = "The scorecard could not be read."; }
  } else if (w.metricId) metricWhy = "Choose a business to see its number.";

  // The flows that deliver it.
  const life = business ? (() => { try { return lifecycleState(business.slug); } catch { return null; } })() : null;
  const flows = flowsFor(w.title, life?.snapshot);
  const observedAt = life?.snapshot?.observedAt ?? null;
  const tz = business?.timezone;
  const snap = life?.snapshot ?? null;
  const statuses = flows.map((f) => flowStatus(f, snap?.workflows ?? [], { now: Date.now(), tz, stale: life?.stale, failed: snap?.collectionFailed, observedAt, canApprove: supports(snap, "approve") }));
  const can = { approve: supports(snap, "approve"), test: supports(snap, "test"), mode: supports(snap, "mode") };

  // Who does what.
  const ready = skillIndex();
  const seen = new Set<string>();
  const experiments = business && w.metricId ? listExperiments(business.slug).filter((x) => x.metric === w.metricId) : [];

  return (
    <div className="space-y-7 min-w-0">
      <div className="space-y-2">
        <div className="eyebrow">
          <Link href="/workflows" className="hover:text-bb-fg">Workflows</Link> · W{String(n).padStart(2, "0")}
          {business && <span className="text-bb-dim"> · {business.name}</span>}
        </div>
        <h1 className="text-2xl font-semibold">{w.title}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {w.levers.map((l) => <span key={l} className={`${PILL} ${LEVER_TONE[l]}`}>{LEVERS[l].short}</span>)}
          {evidence ? <span className={`${PILL} ${EVIDENCE[evidence.state].tone}`}>{EVIDENCE[evidence.state].text}</span>
            : <span className={`${PILL} border-bb-border bg-bb-surface text-bb-dim`}>not running</span>}
        </div>
        <Hint>
          {w.levers.map((l) => `${LEVERS[l].short}: ${LEVERS[l].name.toLowerCase()} (${LEVERS[l].blurb.toLowerCase().replace(/\.$/, "")}).`).join(" ")}{" "}
          {evidence ? (evidence.state === "live" ? HINTS.live : HINTS.inPart) : "Not running: nothing on disk proves it runs for this business."}
        </Hint>
        <dl className="grid max-w-[90ch] gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim sm:pt-0.5">Owner</dt>
          <dd><Link href={href(w.owner)} className="font-semibold hover:text-bb-blue">{label(w.owner)}</Link></dd>
          <dt className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim sm:pt-0.5">Trigger</dt>
          <dd>{w.trigger}</dd>
          <dt className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim sm:pt-0.5">Example</dt>
          <dd className="text-bb-muted">{w.example}</dd>
        </dl>
        {evidence ? (
          <ul className="space-y-0.5 text-[12px]">
            {evidence.proof.map((p) => <li key={p} className="flex gap-1.5"><span aria-hidden className={EVIDENCE[evidence.state].dot}>●</span>{p}</li>)}
            {evidence.last && <li className="font-mono text-[10.5px] text-bb-dim">last {evidence.last.slice(0, 10)}</li>}
          </ul>
        ) : <p className="text-[12px] text-bb-muted">{business ? `No record on disk shows this running for ${business.name} yet.` : "Choose a business to see whether this runs."}</p>}
      </div>

      {statuses.length > 0 && (
        <Section id="status-h" kicker="Right now" title={statuses.length === 1 ? "Is it working, what's waiting, what next" : `${statuses.length} automated flows: is each working, what's waiting, what next`}
          aside={<LifecycleRefresh disabled={!life?.connected} />}>
          {life?.stale && <p className="text-[12px] text-bb-warn">These numbers were read {observedAt ? timeLabel(observedAt, tz) : "never"}, over 5 minutes ago. Refresh before approving or switching anything.</p>}
          <div className="space-y-3">
            {statuses.map((s, i) => (
              <div key={s.id} className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                <StatusCard s={s}>
                  {s.facts.draftTotal > 0 && <a href={`#message-${s.id}`} className="text-[12px] text-bb-blue hover:underline">Read the email and approve it below</a>}
                </StatusCard>
                <WeekOneCard s={s} holdoutPct={flows[i].holdoutPct} controls={{ connected: Boolean(life?.connected), readOnly: life?.readOnly ?? true, canMode: can.mode }} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section id="metric-h" kicker="The number it moves" title={metric ? metric.label : w.metric}>
        <div className="card p-4">
          {metric ? (
            <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
              <div className="space-y-1">
                <div className="text-[26px] font-semibold tabular-nums">{metric.value}</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`${PILL} ${metric.quality === "approx" ? "border-bb-warn/40 bg-bb-warn/10 text-bb-warn" : "border-bb-border text-bb-dim"}`}>{metric.quality}</span>
                  <span className="font-mono text-[10.5px] text-bb-dim">{metric.week}</span>
                </div>
                {metric.note && <p className="text-[11.5px] text-bb-muted">{metric.note}</p>}
              </div>
              <Line points={metric.points} title={`${metric.label} by week`} format={metric.format} />
            </div>
          ) : <p className="text-[12.5px] text-bb-muted">{metricWhy}</p>}
        </div>
      </Section>

      <Section id="who-h" kicker="Who does what" title={`${w.steps.length} steps, in order`}>
        <ol className="space-y-2">
          {w.steps.map(([d, what], i) => {
            const first = !seen.has(d); seen.add(d);
            const dept = DEPT[d], owner = d === w.owner;
            const skills = dept ? [...dept.skills].map((s) => ({ key: s.id, text: s.id, ok: ready.has(s.id), hint: `${s.what}${ready.has(s.id) ? "" : " (not installed)"}` })).sort((a, b) => Number(b.ok) - Number(a.ok)) : [];
            const tools = dept ? dept.tools.map((t) => ({ key: t.name, text: t.name, hint: t.what })) : [];
            return (
              <li key={i} className={`card grid gap-3 p-3.5 md:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1.3fr)] ${owner ? "border-bb-teal/50" : ""}`}>
                <div className="flex items-start gap-2">
                  <span className="font-mono text-[11px] text-bb-dim tabular-nums pt-0.5">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <Link href={href(d)} className="text-[13px] font-semibold hover:text-bb-blue">{label(d)}</Link>
                    {owner && <div><span className={`${PILL} border-bb-teal/40 bg-bb-teal/10 text-bb-teal mt-1`}>owner</span></div>}
                  </div>
                </div>
                <p className="text-[12.5px]">{what}</p>
                <div className="space-y-1.5 min-w-0">
                  {d === "ceo" ? <p className="text-[11.5px] text-bb-muted">Runs from the CEO tab with <span className="font-mono">/hq:ceo</span>.</p>
                    : !first ? <p className="text-[11.5px] text-bb-dim">Skills and tools listed above.</p>
                    : <>
                        <div className="flex gap-2"><span className="w-10 shrink-0 font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim pt-1">Skills</span><Chips items={skills} limit={5} more="skills" /></div>
                        <div className="flex gap-2"><span className="w-10 shrink-0 font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim pt-1">Tools</span><Chips items={tools} limit={4} more="tools" /></div>
                      </>}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="text-[11px] text-bb-dim"><span className="text-bb-accent">●</span> skill installed on this Mac · <span>○</span> not installed</p>
      </Section>

      {flows.length ? (
        <>
          <Section id="before-h" kicker="Before" title="Who qualifies">
            <div className="space-y-3">{flows.map((f, i) => <FlowBefore key={f.id} flow={f} s={statuses[i]} />)}</div>
          </Section>
          <Section id="message-h" kicker="The message" title={flows.length === 1 ? "What they get" : "What each flow sends"}>
            <div className="space-y-3">
              {flows.map((f) => <FlowMessage key={f.id} flow={f} workflows={snap?.workflows ?? []} connected={Boolean(life?.connected)} readOnly={life?.readOnly ?? true} observedAt={observedAt} stale={life?.stale ?? true} can={can} tz={tz} />)}
            </div>
          </Section>
          <Section id="after-h" kicker="After" title="What happened">
            <div className="space-y-3">{flows.map((f, i) => <FlowAfter key={f.id} flow={f} s={statuses[i]} />)}</div>
          </Section>
        </>
      ) : (
        <Section id="flows-h" kicker="Automation" title="Messages">
          <p className="card px-4 py-3 text-[12.5px] text-bb-muted">
            {business ? `${business.name} sends no automated messages for this workflow yet.` : "Choose a business to see its automated messages."}{" "}
            <Link href="/lifecycle" className="text-bb-blue hover:underline">See every flow</Link>
          </p>
        </Section>
      )}

      <Section id="exp-h" kicker="Experiments" title="What has been tried">
        {!w.metricId ? <p className="card px-4 py-3 text-[12.5px] text-bb-muted">Experiments link to a scorecard number, and this workflow has none yet.</p>
          : experiments.length ? (
            <ul className="card divide-y divide-bb-border/60 px-4 py-1">
              {experiments.map((x) => {
                const unit = METRICS[x.metric]?.unit ?? "count", cur = business?.currency ?? "AUD";
                return (
                  <li key={x.id} className="flex gap-3 py-3">
                    <span className="font-mono text-[11px] text-bb-dim tabular-nums pt-0.5">{x.id}</span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-[12.5px]">{x.hypothesis}</p>
                      {x.note && <p className="text-[11.5px] text-bb-muted">{x.note}</p>}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-bb-muted">
                        <span className={`${PILL} ${STATUS_TONE[x.status]}`}>{x.status}</span>
                        <span>Baseline <span className="text-bb-fg tabular-nums">{x.baseline === null ? "not set" : formatValue(unit, x.baseline, cur)}</span></span>
                        <span>Result <span className="text-bb-fg tabular-nums">{x.result === null ? "pending" : formatValue(unit, x.result, cur)}</span></span>
                        <span className="font-mono text-[10.5px] text-bb-dim">started {x.startedAt.slice(0, 10)}{x.endedAt ? `, ended ${x.endedAt.slice(0, 10)}` : ""}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="card px-4 py-3 text-[12.5px] text-bb-muted">No experiments on {METRICS[w.metricId as keyof typeof METRICS]?.label.toLowerCase() ?? "this number"} yet. Log one with <span className="font-mono">npm run hq -- experiment add</span>.</p>}
      </Section>
    </div>
  );
}
