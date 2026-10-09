"use client";

// The Workflows tab: how the departments feed each other (the web), the loops those hand-offs
// form, and every cross-department workflow, filterable by lever and department. The page picks
// which section shows (`tab`); this draws that one. Data lives in lib/workflows.ts.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { Drawer } from "@/components/Drawer";
import { GuideMarkdown } from "@/components/GuideMarkdown";
import { signalCounts, signalsFor, type SignalFeedItem } from "@/lib/brain";
import { DEPARTMENTS } from "@/lib/registry";
import { PILL } from "@/lib/tone";
import type { BuildStep } from "@/lib/build-order";
import type { Evidence } from "@/lib/workflow-evidence";
import { EDGES, LEVERS, LOOPS, NODES, WORKFLOWS, busiest, workflowSlug, type Edge, type Lever, type Node } from "@/lib/workflows";
import { workflowsTabUrl, type WorkflowTab } from "@/lib/workflows-navigation";

const LEVER_KEYS = Object.keys(LEVERS) as Lever[];
const LEVER_HEX: Record<Lever, string> = { get: "#2DD4BF", keep: "#5AB0F0", expand: "#A78BFA", base: "#8b94ab" };
const LEVER_TONE: Record<Lever, string> = {
  get: "border-bb-teal/40 bg-bb-teal/10 text-bb-teal",
  keep: "border-bb-blue/40 bg-bb-blue/10 text-bb-blue",
  expand: "border-bb-violet/40 bg-bb-violet/10 text-bb-violet",
  base: "border-bb-border bg-bb-surface text-bb-muted",
};
const LEVER_DOT: Record<Lever, string> = { get: "bg-bb-teal", keep: "bg-bb-blue", expand: "bg-bb-violet", base: "bg-bb-muted" };

const DEPT = Object.fromEntries(DEPARTMENTS.map((d) => [d.slug, d]));
const label = (n: Node) => (n === "ceo" ? "CEO" : DEPT[n]?.label ?? n);
const role = (n: Node) => (n === "ceo" ? "Reads the scorecard, picks the weakest lever, assigns an owner and contributors." : DEPT[n]?.mission ?? "");
const href = (n: Node) => (n === "ceo" ? "/ceo" : `/${n}`);

const LeverPill = ({ l }: { l: Lever }) => <span className={`${PILL} ${LEVER_TONE[l]}`}>{LEVERS[l].short}</span>;
const EVIDENCE_TONE = { live: "border-bb-accent/40 bg-bb-accent/10 text-bb-accent", partial: "border-bb-warn/40 bg-bb-warn/10 text-bb-warn" };
const EvidencePill = ({ e }: { e: Evidence }) => <span title={e.state === "live" ? "Proven running end to end" : "Some steps run and are proven; the rest are still to build"} className={`${PILL} ${EVIDENCE_TONE[e.state]}`}>{e.state === "live" ? "live" : "in part"}</span>;
const day = (iso?: string) => (iso ? iso.slice(0, 10) : null);
const BUILD_TONE: Record<BuildStep["state"], string> = { done: "border-bb-accent/40 bg-bb-accent/10 text-bb-accent", partial: "border-bb-warn/40 bg-bb-warn/10 text-bb-warn", todo: "border-bb-border bg-bb-surface2 text-bb-muted" };

/** What runs for this business and the record behind it: the proof lines, then when it last ran. */
function Proof({ e }: { e: Evidence }) {
  return (
    <ul className="space-y-0.5 text-[12px]">
      {e.proof.map((p) => (
        <li key={p} className="flex gap-1.5"><span className={e.state === "live" ? "text-bb-accent" : "text-bb-warn"} aria-hidden>●</span>{p}</li>
      ))}
      {e.last && <li className="font-mono text-[10.5px] text-bb-dim">last {day(e.last)}</li>}
    </ul>
  );
}

function LeverChips({ value, onChange, label: aria }: { value: Lever | "all"; onChange: (v: Lever | "all") => void; label: string }) {
  const opts: (Lever | "all")[] = ["all", ...LEVER_KEYS];
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={aria}>
      {opts.map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors ${
            value === k ? "border-bb-blue/50 bg-bb-blue/15 text-bb-fg" : "border-bb-border text-bb-muted hover:text-bb-fg hover:border-bb-dim"
          }`}
        >
          {k !== "all" && <span className={`h-2 w-2 rounded-full ${LEVER_DOT[k]}`} />}
          {k === "all" ? "All levers" : LEVERS[k].name}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- the web
const C = 450, R = 330, NR = 13;
const RING = NODES.filter((n) => n !== "ceo");
const POS: Record<string, { x: number; y: number; a: number }> = { ceo: { x: C, y: C, a: 0 } };
RING.forEach((n, i) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / RING.length;
  POS[n] = { x: C + R * Math.cos(a), y: C + R * Math.sin(a), a };
});

function edgePath(x: Edge): string {
  const a = POS[x.from], b = POS[x.to];
  let cx: number, cy: number;
  if (x.from === "ceo" || x.to === "ceo") {
    cx = (a.x + b.x) / 2; cy = (a.y + b.y) / 2;
  } else {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    cx = mx + (C - mx) * 0.55; cy = my + (C - my) * 0.55;
    if (EDGES.some((y) => y.from === x.to && y.to === x.from)) {
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      cx += (-dy / len) * 22; cy += (dx / len) * 22;
    }
  }
  const pull = (p: { x: number; y: number }, r: number) => {
    const d = Math.hypot(cx - p.x, cy - p.y) || 1;
    return { x: p.x + ((cx - p.x) / d) * r, y: p.y + ((cy - p.y) / d) * r };
  };
  const s = pull(a, x.from === "ceo" ? 34 : NR + 2);
  const t = pull(b, x.to === "ceo" ? 36 : NR + 4);
  return `M${s.x.toFixed(1)},${s.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${t.x.toFixed(1)},${t.y.toFixed(1)}`;
}

function Web({ lever, selected, onSelect, active }: { lever: Lever | "all"; selected: Node | null; onSelect: (n: Node | null) => void; active: string[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; e: Edge } | null>(null);
  const visible = (x: Edge) => lever === "all" || x.levers.includes(lever);
  const linked = (n: Node) =>
    !selected || n === selected || EDGES.some((x) => visible(x) && ((x.from === selected && x.to === n) || (x.to === selected && x.from === n)));

  return (
    <div className="card relative p-2" onMouseLeave={() => setTip(null)}>
      <svg viewBox="-150 -20 1200 940" className="block h-auto w-full" role="img" aria-label="Network of HQ departments and the signals between them">
        <defs>
          {LEVER_KEYS.map((l) => (
            <marker key={l} id={`ar-${l}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={LEVER_HEX[l]} />
            </marker>
          ))}
        </defs>
        <g>
          {EDGES.map((x, i) => {
            if (!visible(x)) return null;
            const main = lever !== "all" && x.levers.includes(lever) ? lever : x.levers[0];
            const touches = !!selected && (x.from === selected || x.to === selected);
            const d = edgePath(x);
            return (
              <g key={i}>
                <path
                  d={d}
                  fill="none"
                  stroke={LEVER_HEX[main]}
                  strokeWidth={touches ? 2.2 : 1.4}
                  strokeDasharray={selected && x.to === selected ? "5 4" : undefined}
                  markerEnd={`url(#ar-${main})`}
                  opacity={!selected ? 0.45 : touches ? 1 : 0.06}
                />
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={10}
                  className="cursor-pointer"
                  onMouseMove={(ev) => {
                    const r = (ev.currentTarget.ownerSVGElement?.parentElement as HTMLElement).getBoundingClientRect();
                    setTip({ x: ev.clientX - r.left, y: ev.clientY - r.top, e: x });
                  }}
                  onClick={() => onSelect(x.from)}
                />
              </g>
            );
          })}
        </g>
        <g>
          {RING.map((n) => {
            const p = POS[n];
            const cos = Math.cos(p.a);
            const anchor = Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end";
            const lx = C + (R + 26) * Math.cos(p.a), ly = C + (R + 26) * Math.sin(p.a);
            const skipped = !active.includes(n);
            const pick = () => onSelect(selected === n ? null : n);
            return (
              <g
                key={n}
                tabIndex={0}
                role="button"
                aria-label={label(n)}
                aria-pressed={selected === n}
                className="cursor-pointer outline-none focus-visible:[&>circle]:stroke-bb-blue"
                opacity={linked(n) ? 1 : 0.3}
                onClick={pick}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } }}
              >
                <circle cx={p.x} cy={p.y} r={NR} fill={selected === n ? "#5AB0F0" : "#0e1424"} stroke={skipped ? "#586079" : "#E9EEF8"} strokeWidth={1.5} strokeDasharray={skipped ? "3 3" : undefined} />
                <text x={lx} y={ly + 4} textAnchor={anchor} fontSize={16} fill={skipped ? "#586079" : "#E9EEF8"}>
                  {label(n)}
                </text>
              </g>
            );
          })}
          <g
            tabIndex={0}
            role="button"
            aria-label="CEO"
            aria-pressed={selected === "ceo"}
            className="cursor-pointer outline-none"
            onClick={() => onSelect(selected === "ceo" ? null : "ceo")}
            onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelect(selected === "ceo" ? null : "ceo"); } }}
          >
            <circle cx={C} cy={C} r={32} fill={selected === "ceo" ? "#5AB0F0" : "#161f33"} stroke="#5AB0F0" strokeWidth={1.5} />
            <text x={C} y={C + 5} textAnchor="middle" fontSize={15} fontWeight={700} fill="#E9EEF8">CEO</text>
          </g>
        </g>
      </svg>
      {tip && (
        <div
          className="pointer-events-none absolute z-10 max-w-[260px] rounded-lg border border-bb-border bg-bb-surface2 px-2.5 py-1.5 text-[11.5px] leading-snug shadow-glow"
          style={{ left: Math.max(6, tip.x + 12), top: tip.y + 12 }}
        >
          <div className="font-semibold">{label(tip.e.from)} → {label(tip.e.to)}</div>
          <div className="text-bb-muted">{tip.e.signal}</div>
        </div>
      )}
    </div>
  );
}

function Panel({ selected, lever, active, onShowWorkflows }: { selected: Node | null; lever: Lever | "all"; active: string[]; onShowWorkflows: (n: Node) => void }) {
  const visible = (x: Edge) => lever === "all" || x.levers.includes(lever);
  if (!selected) {
    return (
      <div className="card space-y-3 p-4">
        <h2 className="text-[15px] font-semibold">Pick a department</h2>
        <p className="text-[12.5px] text-bb-muted">
          Click a circle, or Tab to it and press Enter. Arrows show which way a signal flows; hover a line to read it. Dashed circles are departments this business skips.
        </p>
        <div className="space-y-1.5">
          {LEVER_KEYS.map((l) => (
            <div key={l} className="flex items-start gap-2 text-[12px]">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${LEVER_DOT[l]}`} />
              <span><span className="font-semibold">{LEVERS[l].name}.</span> <span className="text-bb-muted">{LEVERS[l].blurb}</span></span>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-bb-muted">
          Busiest connectors: {busiest().map((b) => `${label(b.node)} (${b.count})`).join(", ")}. If any of these is weak, every lever suffers.
        </p>
      </div>
    );
  }
  const out = EDGES.filter((x) => x.from === selected && visible(x));
  const inn = EDGES.filter((x) => x.to === selected && visible(x));
  const owned = WORKFLOWS.filter((w) => w.owner === selected).length;
  const helps = WORKFLOWS.filter((w) => w.owner !== selected && w.steps.some(([d]) => d === selected)).length;
  const row = (x: Edge, who: Node) => (
    <li key={`${x.from}-${x.to}-${x.signal}`} className="grid grid-cols-[auto_1fr] gap-x-2 text-[12.5px]">
      <span className="whitespace-nowrap font-mono text-[10.5px] text-bb-dim pt-0.5">{label(who)}</span>
      <span>{x.signal} <span className="inline-flex gap-1 align-middle">{x.levers.map((l) => <LeverPill key={l} l={l} />)}</span></span>
    </li>
  );
  return (
    <div className="card space-y-4 p-4">
      <div>
        <div className="eyebrow mb-1">{selected === "ceo" ? "Lead" : "Department"}</div>
        <h2 className="text-lg font-semibold">
          <Link href={href(selected)} className="hover:text-bb-blue">{label(selected)} →</Link>
        </h2>
        <p className="text-[12.5px] text-bb-muted">{role(selected)}</p>
        {selected !== "ceo" && !active.includes(selected) && <p className="mt-1 text-[12px] text-bb-warn">This business skips this department, so its hand-offs fall to others.</p>}
      </div>
      <div>
        <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">Sends ({out.length})</div>
        <ul className="space-y-1.5">{out.length ? out.map((x) => row(x, x.to)) : <li className="text-[12px] text-bb-dim">Nothing under this lever.</li>}</ul>
      </div>
      <div>
        <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">Receives ({inn.length})</div>
        <ul className="space-y-1.5">{inn.length ? inn.map((x) => row(x, x.from)) : <li className="text-[12px] text-bb-dim">Nothing under this lever.</li>}</ul>
      </div>
      <button type="button" onClick={() => onShowWorkflows(selected)} className="text-[12.5px] text-bb-blue hover:underline">
        Owns {owned} workflow{owned === 1 ? "" : "s"}, helps with {helps} more. Show them ↓
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- signal drawer
/** What the sender actually found for one hand-off: its signal notes from the business's vault,
 *  newest first. Slides in from the right; Escape, the backdrop or ✕ closes it. */
function SignalDrawer({ edge, feed, businessName, demo, onClose }: { edge: Edge; feed: SignalFeedItem[]; businessName: string | null; demo: boolean; onClose: () => void }) {
  const found = signalsFor(feed, edge.from, edge.to);
  const elsewhere = found.length ? [] : feed.filter((s) => s.from === edge.from).slice(0, 5);
  const from = label(edge.from), to = label(edge.to);

  return (
    <Drawer
      labelId="sig-drawer-h"
      onClose={onClose}
      eyebrow={`Signal${demo ? " · demo data" : ""}`}
      title={<><Link href={href(edge.from)} className="hover:text-bb-blue">{from}</Link> → <Link href={href(edge.to)} className="hover:text-bb-blue">{to}</Link></>}
      head={<>
        <p className="mt-1 text-[12.5px] text-bb-muted">{edge.signal}</p>
        <div className="mt-2 flex flex-wrap gap-1">{edge.levers.map((l) => <LeverPill key={l} l={l} />)}</div>
      </>}
    >
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">What {from} found ({found.length})</div>
      {found.length ? found.map((s) => (
        <article key={s.rel} className={`card space-y-2 p-3.5 ${s.status === "replaced" ? "opacity-60" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[13.5px] font-semibold leading-snug">{s.title}</h3>
            <span className="shrink-0 font-mono text-[10.5px] text-bb-dim">{s.created}</span>
          </div>
          {s.status === "replaced" && <span className={`${PILL} border-bb-border bg-bb-surface2 text-bb-muted`}>replaced</span>}
          {s.to.length > 1 && <div className="text-[11.5px] text-bb-muted">Also sent to {s.to.filter((t) => t !== edge.to).map(label).join(", ")}</div>}
          {s.body && <div className="prose-brief text-[12.5px]"><GuideMarkdown markdown={s.body} /></div>}
          {s.evidence.length > 0 && (
            <div className="text-[12px]">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">Evidence</div>
              <ul className="list-disc space-y-0.5 pl-4 marker:text-bb-dim">{s.evidence.map((e) => <li key={e} className="break-words">{e}</li>)}</ul>
            </div>
          )}
          <div className="truncate font-mono text-[10.5px] text-bb-dim" title={s.rel}>{s.rel}</div>
        </article>
      )) : (
        <p className="card px-3.5 py-3 text-[12.5px] text-bb-muted">
          Nothing on file yet{businessName ? ` for ${businessName}` : ""}. When {from} hands {to} something, it writes a signal note to the vault (<span className="font-mono">hq brain write</span>) and it shows up here.
        </p>
      )}
      {elsewhere.length > 0 && (
        <div className="space-y-1.5 pt-2">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">Other signals {from} sent</div>
          <ul className="space-y-1.5">
            {elsewhere.map((s) => (
              <li key={s.rel} className="text-[12.5px]">
                <span className="font-semibold">{s.title}</span>
                <span className="text-bb-muted"> → {s.to.map(label).join(", ")}</span>
                <span className="font-mono text-[10.5px] text-bb-dim"> · {s.created}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------- page
const STORE = "hq.workflows.filters";

export function WorkflowsWeb({ tab, dept, active, businessName, evidence = {}, demo = false, feed = [], build = [], brain = null }: { tab: WorkflowTab; dept?: string; active: string[]; businessName: string | null; evidence?: Record<string, Evidence>; demo?: boolean; feed?: SignalFeedItem[]; build?: BuildStep[]; brain?: ReactNode }) {
  const router = useRouter();
  const [openEdge, setOpenEdge] = useState<Edge | null>(null);
  const closeDrawer = useCallback(() => setOpenEdge(null), []);
  const counts = useMemo(() => signalCounts(feed), [feed]);
  const [lever, setLever] = useState<Lever | "all">("all");
  const [selected, setSelected] = useState<Node | null>(null);
  const [wfLever, setWfLever] = useState<Lever | "all">("all");
  const [wfDept, setWfDept] = useState<string>("all");
  const [q, setQ] = useState("");
  const [onlyRunning, setOnlyRunning] = useState(false);

  useEffect(() => {
    try {
      const s = JSON.parse(window.localStorage.getItem(STORE) ?? "{}");
      if (s.wfLever) setWfLever(s.wfLever);
      if (s.wfDept && !dept) setWfDept(s.wfDept);
    } catch {
      // Storage unavailable: start unfiltered.
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // A `?dept=` link (the web panel's "Show them") wins over the remembered filter.
  useEffect(() => {
    if (dept) { setWfDept(dept); setWfLever("all"); setQ(""); }
  }, [dept]);
  useEffect(() => {
    try { window.localStorage.setItem(STORE, JSON.stringify({ wfLever, wfDept })); } catch { /* fine */ }
  }, [wfLever, wfDept]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return WORKFLOWS.map((w, i) => ({ ...w, n: i + 1 })).filter(
      (w) =>
        (!onlyRunning || Boolean(evidence[w.title])) &&
        (wfLever === "all" || w.levers.includes(wfLever)) &&
        (wfDept === "all" || w.owner === wfDept || w.steps.some(([d]) => d === wfDept)) &&
        (!needle || [w.title, w.trigger, w.metric, w.example, ...w.steps.map(([d, s]) => `${label(d)} ${s}`)].join(" ").toLowerCase().includes(needle)),
    );
  }, [wfLever, wfDept, q, onlyRunning, evidence]);

  const signals = EDGES.filter((x) => (lever === "all" || x.levers.includes(lever)) && (!selected || x.from === selected || x.to === selected));

  const showWorkflows = (n: Node) => {
    setWfDept(n); setWfLever("all"); setQ("");
    router.push(workflowsTabUrl("all", n));
  };

  const th = "text-left pb-2 pr-5 last:pr-0 text-[9.5px] uppercase tracking-[0.14em] font-mono text-bb-dim font-normal";
  const td = "py-2 pr-5 last:pr-0 border-t border-bb-border/60 text-[12.5px] align-top";

  const running = WORKFLOWS.map((w, i) => ({ ...w, n: i + 1, e: evidence[w.title] }))
    .filter((w) => w.e)
    .sort((a, b) => (a.e!.state === b.e!.state ? a.n - b.n : a.e!.state === "live" ? -1 : 1));

  return (
    <div className="space-y-8">
      {/* what runs now */}
      {tab === "running" && <section aria-labelledby="run-h" className="space-y-3">
        <div>
          <div className="eyebrow mb-1">Running now</div>
          <h2 id="run-h" className="text-[15px] font-semibold">
            What already runs{businessName ? ` for ${businessName}` : ""}
            {demo && <span className="font-normal text-bb-muted"> · demo data</span>}
          </h2>
          <p className="text-[12.5px] text-bb-muted max-w-[70ch]">
            Only workflows with a record on disk: published posts read back from the platform, edited videos, saved CEO reviews, scorecard weeks, lifecycle checks. <span className="text-bb-accent">Live</span> runs end to end; <span className="text-bb-warn">in part</span> says what's still to build.
          </p>
        </div>
        {running.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {running.map((w) => (
              <article key={w.title} className="card space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[14px] font-semibold"><Link href={`/workflows/${workflowSlug(w.title)}`} className="hover:text-bb-blue">{w.title}</Link></h3>
                  <span className="flex items-center gap-1.5"><EvidencePill e={w.e!} /><span className="font-mono text-[10.5px] text-bb-dim">W{String(w.n).padStart(2, "0")}</span></span>
                </div>
                <div className="text-[12px] text-bb-muted">Owner <Link href={href(w.owner)} className="font-semibold text-bb-fg hover:text-bb-blue">{label(w.owner)}</Link> · moves {w.metric.toLowerCase()}</div>
                <Proof e={w.e!} />
              </article>
            ))}
          </div>
        ) : (
          <p className="card px-4 py-3 text-[12.5px] text-bb-muted">Nothing runs yet{businessName ? ` for ${businessName}` : ""}. Publish a post with <span className="font-mono">/hq:publish</span>, or ask the CEO for a review with <span className="font-mono">/hq:ceo</span>, and it shows up here. <Link href={workflowsTabUrl("all")} className="text-bb-blue hover:underline">See every workflow to build →</Link></p>
        )}
      </section>}

      {tab === "brain" && (brain ?? <p className="card px-4 py-3 text-[12.5px] text-bb-muted">Pick a business in the top bar to see its brain.</p>)}

      {/* the web */}
      {tab === "web" && <section aria-labelledby="web-h" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow mb-1">The web</div>
            <h2 id="web-h" className="text-[15px] font-semibold">Who feeds whom</h2>
            <p className="text-[12.5px] text-bb-muted max-w-[70ch]">
              Each line is a signal one department hands to another{businessName ? ` in ${businessName}` : ""}. The CEO sits in the middle: it reads the scorecard and gives the weakest lever to whoever has the biggest fix.
            </p>
          </div>
          <LeverChips value={lever} onChange={setLever} label="Filter hand-offs by lever" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] items-start">
          <Web lever={lever} selected={selected} onSelect={setSelected} active={active} />
          <Panel selected={selected} lever={lever} active={active} onShowWorkflows={showWorkflows} />
        </div>
      </section>}

      {/* loops */}
      {tab === "loops" && <section aria-labelledby="loops-h" className="space-y-3">
        <div>
          <div className="eyebrow mb-1">The loops</div>
          <h2 id="loops-h" className="text-[15px] font-semibold">Six loops that run the business</h2>
          <p className="text-[12.5px] text-bb-muted max-w-[70ch]">Workflows are single runs. Loops are what happens when they repeat and feed each other; run weekly, the business keeps improving without anyone deciding to.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {LOOPS.map((l) => (
            <article key={l.title} className="card space-y-2.5 p-4">
              <div className="flex flex-wrap gap-1">{l.levers.map((x) => <LeverPill key={x} l={x} />)}</div>
              <h3 className="text-[14px] font-semibold">{l.title}</h3>
              <p className="text-[12.5px] text-bb-muted">{l.blurb}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {l.steps.map(([d, s], i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-bb-dim" aria-hidden>→</span>}
                    <span className="rounded-md border border-bb-border bg-bb-surface2 px-2 py-0.5 text-[11.5px]">
                      <span className="font-semibold">{label(d)}</span> <span className="text-bb-muted">{s}</span>
                    </span>
                  </span>
                ))}
                <span className="text-bb-dim" aria-hidden>↺</span>
              </div>
              <p className="border-t border-dashed border-bb-border pt-2 text-[12px]">{l.closes}</p>
            </article>
          ))}
        </div>
      </section>}

      {/* workflows */}
      {tab === "all" && <section id="workflow-list" aria-labelledby="wf-h" className="space-y-3 scroll-mt-4">
        <div>
          <div className="eyebrow mb-1">The workflows</div>
          <h2 id="wf-h" className="text-[15px] font-semibold">Every workflow to build</h2>
          <p className="text-[12.5px] text-bb-muted max-w-[70ch]">One owner who is accountable, contributors, a trigger, ordered steps, and the number it should move. The ones already running carry their proof.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <LeverChips value={wfLever} onChange={setWfLever} label="Filter workflows by lever" />
          <select
            id="wf-dept"
            aria-label="Filter workflows by department"
            value={wfDept}
            onChange={(ev) => setWfDept(ev.target.value)}
            className="rounded-lg border border-bb-border bg-bb-surface px-2.5 py-1.5 text-[12.5px] text-bb-fg"
          >
            <option value="all">All departments</option>
            {NODES.map((n) => <option key={n} value={n}>{label(n)}</option>)}
          </select>
          <input
            id="wf-search"
            type="search"
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            placeholder="Search workflows"
            aria-label="Search workflows"
            className="min-w-0 flex-1 basis-56 rounded-lg border border-bb-border bg-bb-surface px-2.5 py-1.5 text-[12.5px] text-bb-fg placeholder:text-bb-dim"
          />
          <label className="flex items-center gap-1.5 text-[12.5px] text-bb-muted">
            <input type="checkbox" checked={onlyRunning} onChange={(ev) => setOnlyRunning(ev.target.checked)} className="accent-[#2DD4BF]" />
            Running now
          </label>
          <span className="font-mono text-[11px] text-bb-dim tabular-nums">{list.length} of {WORKFLOWS.length}</span>
        </div>
        {list.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((w) => {
              const helpers = [...new Set(w.steps.map(([d]) => d).filter((d) => d !== w.owner))];
              return (
                <article key={w.title} className="card space-y-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[14px] font-semibold"><Link href={`/workflows/${workflowSlug(w.title)}`} className="hover:text-bb-blue">{w.title}</Link></h3>
                    <span className="flex items-center gap-1.5">{evidence[w.title] && <EvidencePill e={evidence[w.title]} />}<span className="font-mono text-[10.5px] text-bb-dim">W{String(w.n).padStart(2, "0")}</span></span>
                  </div>
                  <div className="flex flex-wrap gap-1">{w.levers.map((l) => <LeverPill key={l} l={l} />)}</div>
                  {evidence[w.title] && <Proof e={evidence[w.title]} />}
                  <div className="text-[12.5px]">
                    <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">Owner</div>
                    <Link href={href(w.owner)} className="font-semibold hover:text-bb-blue">{label(w.owner)}</Link>
                    <span className="text-bb-muted"> · with {helpers.map(label).join(", ")}</span>
                  </div>
                  <div className="text-[12.5px]">
                    <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">Trigger</div>
                    {w.trigger}
                  </div>
                  <div className="text-[12.5px]">
                    <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">Steps</div>
                    <ol className="list-decimal space-y-0.5 pl-5 marker:text-bb-dim">
                      {w.steps.map(([d, s], i) => (
                        <li key={i}><span className={`font-semibold ${d !== "ceo" && !active.includes(d) ? "text-bb-dim line-through" : ""}`}>{label(d)}:</span> {s}</li>
                      ))}
                    </ol>
                  </div>
                  <div className="text-[12.5px]">
                    <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">Moves</div>
                    {w.metric}
                  </div>
                  <p className="border-l-2 border-bb-border pl-2.5 text-[12px] text-bb-muted">{w.example}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="text-[12.5px] text-bb-muted">No workflows match. Clear the search or pick another lever.</p>
        )}
      </section>}

      {/* signals: the web as a list, under it on the same tab */}
      {tab === "web" && <section aria-labelledby="sig-h" className="space-y-3">
        <div>
          <div className="eyebrow mb-1">The signals</div>
          <h2 id="sig-h" className="text-[15px] font-semibold">Every hand-off, as a list</h2>
          <p className="text-[12.5px] text-bb-muted max-w-[70ch]">The same connections as the web. The lever filter and the department picked in the web apply here too. Click a row to read what was actually handed over.</p>
        </div>
        <div className="card overflow-x-auto px-4 py-3">
          <table className="w-full min-w-[640px]">
            <thead><tr><th className={th}>From</th><th className={th}>To</th><th className={th}>Signal</th><th className={th}>Lever</th><th className={`${th} text-right`}>Found</th></tr></thead>
            <tbody>
              {signals.map((x, i) => {
                const n = counts[`${x.from}>${x.to}`] ?? 0;
                const open = openEdge === x;
                return (
                <tr
                  key={i}
                  tabIndex={0}
                  aria-label={`${label(x.from)} to ${label(x.to)}: ${n} signal note${n === 1 ? "" : "s"}. Open`}
                  onClick={() => setOpenEdge(x)}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setOpenEdge(x); } }}
                  className={`cursor-pointer outline-none transition-colors hover:bg-bb-surface2 focus-visible:bg-bb-surface2 ${open ? "bg-bb-blue/10" : ""}`}
                >
                  <td className={td}>{label(x.from)}</td>
                  <td className={td}>{label(x.to)}</td>
                  <td className={td}>{x.signal}</td>
                  <td className={td}><span className="flex flex-wrap gap-1">{x.levers.map((l) => <LeverPill key={l} l={l} />)}</span></td>
                  <td className={`${td} text-right font-mono tabular-nums ${n ? "text-bb-teal" : "text-bb-dim"}`}>{n || "·"} <span aria-hidden className="text-bb-dim">›</span></td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {openEdge && <SignalDrawer edge={openEdge} feed={feed} businessName={businessName} demo={demo} onClose={closeDrawer} />}
      </section>}

      {/* build order */}
      {tab === "build" && <section aria-labelledby="build-h" className="space-y-3">
        <div>
          <div className="eyebrow mb-1">Turning this into HQ</div>
          <h2 id="build-h" className="text-[15px] font-semibold">Build order</h2>
          <p className="text-[12.5px] text-bb-muted max-w-[70ch]">The CEO can't route work by lever until it can see the numbers, and playbooks can't trigger until departments write signals. Each step says where {businessName ?? "the current business"} stands, from its own records.</p>
        </div>
        <ol className="grid gap-2">
          {build.map((b, i) => (
            <li key={b.title} className="card flex gap-3 px-4 py-3">
              <span className="w-5 shrink-0 font-semibold text-bb-teal tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 space-y-1 text-[12.5px]">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{b.title}</span>
                  <span className={`${PILL} ${BUILD_TONE[b.state]}`}>{b.state === "done" ? "done" : b.state === "partial" ? "in part" : "not yet"}</span>
                </span>
                <span className="block text-bb-muted">{b.what}</span>
                <span className="block">{businessName ? <span className="text-bb-dim">{businessName}: </span> : null}{b.evidence}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>}
    </div>
  );
}
