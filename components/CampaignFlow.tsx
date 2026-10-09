// Campaigns → How it works: the end-to-end flow from lib/campaign-flow.ts. Server component, no state.
import Link from "next/link";

import { FLOW_COUNTED, FLOW_RHYTHM, FLOW_STATUSES, FLOW_STEPS, WHO_LABEL, type FlowWho } from "@/lib/campaign-flow";
import { PILL } from "@/lib/tone";

const WHO_TONE: Record<FlowWho, string> = {
  you: "border-bb-blue/40 bg-bb-blue/10 text-bb-blue",
  hq: "border-bb-accent/40 bg-bb-accent/10 text-bb-accent",
  claude: "border-bb-violet/40 bg-bb-violet/10 text-bb-violet",
};

function Chain({ items, end }: { items: string[]; end: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[12px]">
      {items.map((s, i) => (
        <span key={s} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="text-bb-dim">→</span>}
          <span className="rounded-md border border-bb-border bg-bb-surface px-2 py-0.5">{s}</span>
        </span>
      ))}
      <span aria-hidden className="text-bb-dim">→</span>
      <span className="rounded-md border border-dashed border-bb-border px-2 py-0.5 text-bb-muted">{end}</span>
    </div>
  );
}

export function CampaignFlow() {
  return (
    <div className="space-y-6 min-w-0">
      <section className="space-y-2">
        <p className="max-w-[78ch] text-[13px] text-bb-muted">
          One campaign, tracked end to end: what happens at each step, who does it, and where to look. Every link carries a tag, so
          every sign-up and paying customer is counted back to the campaign and the partner who brought them.
        </p>
        <div className="flex flex-wrap gap-2" aria-label="Who does each step">
          {(Object.keys(WHO_LABEL) as FlowWho[]).map((w) => <span key={w} className={`${PILL} ${WHO_TONE[w]}`}>{WHO_LABEL[w]}</span>)}
        </div>
      </section>

      <nav aria-label="The eight steps at a glance" className="card overflow-x-auto p-3">
        <ol className="flex min-w-max items-center gap-2 text-[12px]">
          {FLOW_STEPS.map((s, i) => (
            <li key={s.title} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="text-bb-dim">→</span>}
              <a href={`#step-${i + 1}`} className="rounded-full border border-bb-border px-2.5 py-1 hover:border-bb-blue hover:text-bb-blue">
                <span className="font-mono text-bb-dim">{i + 1}</span> {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <ol className="space-y-3">
        {FLOW_STEPS.map((s, i) => (
          <li key={s.title} id={`step-${i + 1}`} className="card grid gap-3 p-4 sm:grid-cols-[2.25rem_1fr] scroll-mt-4">
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-bb-fg text-[14px] font-semibold text-bb-bg">{i + 1}</span>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="mr-auto text-[15px] font-semibold">{s.title}</h3>
                {s.who.map((w) => <span key={w.label} className={`${PILL} ${WHO_TONE[w.who]}`}>{w.label}</span>)}
              </div>
              <ul className="list-disc space-y-1 pl-5 text-[13px]">{s.points.map((p) => <li key={p} className="max-w-[80ch]">{p}</li>)}</ul>
              <dl className="grid gap-x-4 gap-y-1 border-t border-dashed border-bb-border pt-2 text-[12.5px] sm:grid-cols-[max-content_1fr]">
                <dt className="text-bb-dim">Where</dt>
                <dd className="flex flex-wrap gap-x-3 gap-y-1">{s.where.map((w) => w.href
                  ? <Link key={w.label} href={w.href} className="text-bb-blue hover:underline">{w.label}</Link>
                  : <span key={w.label}>{w.label}</span>)}</dd>
                <dt className="text-bb-dim">Done when</dt>
                <dd>{s.done}</dd>
              </dl>
            </div>
          </li>
        ))}
      </ol>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold">How one customer is counted</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {FLOW_COUNTED.map((c, i) => (
            <div key={c.title} className="card space-y-1 p-3">
              <p className="text-[13px] font-semibold"><span className="font-mono text-bb-dim">{i + 1}</span> {c.title}</p>
              <p className="text-[12px] text-bb-muted">{c.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold">Your rhythm</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-[12.5px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-[0.08em] text-bb-dim">
              <th className="px-3 py-2 font-medium">When</th><th className="px-3 py-2 font-medium">HQ does by itself</th><th className="px-3 py-2 font-medium">You do</th>
            </tr></thead>
            <tbody>{FLOW_RHYTHM.map((r) => (
              <tr key={r.when} className="border-t border-bb-border/60 align-top">
                <td className="px-3 py-2 font-semibold whitespace-nowrap">{r.when}</td><td className="px-3 py-2">{r.hq}</td><td className="px-3 py-2">{r.you}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold">Status cheat sheet</h2>
        <div className="card space-y-2 p-4">
          <h3 className="text-[13px] font-semibold">A partner</h3>
          <Chain items={FLOW_STATUSES.partner} end={FLOW_STATUSES.partnerEnd} />
          <p className="text-[12px] text-bb-muted">{FLOW_STATUSES.partnerRule}</p>
          <h3 className="pt-2 text-[13px] font-semibold">A message</h3>
          <Chain items={FLOW_STATUSES.message} end={FLOW_STATUSES.messageEnd} />
          <p className="text-[12px] text-bb-muted">{FLOW_STATUSES.messageRule}</p>
        </div>
        <p className="text-[12px] text-bb-muted">
          The detail behind each step: <Link href="/guides/campaigns" className="text-bb-blue hover:underline">Campaigns guide</Link> ·{" "}
          <Link href="/guides/partners" className="text-bb-blue hover:underline">Partnerships guide</Link>
        </p>
      </section>
    </div>
  );
}
