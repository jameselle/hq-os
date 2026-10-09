"use client";

// The Playbooks tab: this week's routing (the weakest lever and the playbooks picked for it, each with its owner and
// contributors), the runs waiting for the owner, queued and failed runs, applied runs being judged, and every
// playbook with what starts it. Actions go to /api/playbooks; nothing here sends anything to customers.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Drawer } from "@/components/Drawer";
import { GuideMarkdown } from "@/components/GuideMarkdown";
import { PILL } from "@/lib/tone";
import type { Routing, Run } from "@/lib/playbook-store";
import { LEVERS, workflowSlug, type Lever } from "@/lib/workflows";

export type PanelRun = Run & {
  ownerLabel: string; reasonText: string; plan: string | null;
  drafts: { file: string; title: string; text: string }[];
  exp: { id: number; status: string; metricLabel: string; baseline: string; result: string; reviewAt: string | null; note: string } | null;
};
export type PanelPlaybook = { slug: string; title: string; ownerLabel: string; levers: Lever[]; starts: string; runnable: boolean; customerFacing: boolean; addedGuard: boolean; skipped: boolean };
export type PanelRouting = (Omit<Routing, "picks"> & { picks: (Routing["picks"][number] & { ownerLabel: string; contributorLabels: string[] })[] }) | null;

const STATUS_TONE: Record<string, string> = {
  queued: "border-bb-border bg-bb-surface2 text-bb-muted", running: "border-bb-blue/40 bg-bb-blue/10 text-bb-blue",
  ready: "border-bb-warn/40 bg-bb-warn/10 text-bb-warn", failed: "border-bb-danger/40 bg-bb-danger/10 text-bb-danger",
  applied: "border-bb-accent/40 bg-bb-accent/10 text-bb-accent", dropped: "border-bb-border bg-bb-surface text-bb-dim",
  won: "border-bb-accent/40 bg-bb-accent/10 text-bb-accent", lost: "border-bb-danger/40 bg-bb-danger/10 text-bb-danger", inconclusive: "border-bb-border bg-bb-surface2 text-bb-muted",
};
const LEVER_TONE: Record<Lever, string> = { get: "border-bb-teal/40 bg-bb-teal/10 text-bb-teal", keep: "border-bb-blue/40 bg-bb-blue/10 text-bb-blue", expand: "border-bb-violet/40 bg-bb-violet/10 text-bb-violet", base: "border-bb-border bg-bb-surface text-bb-muted" };
const Pill = ({ s }: { s: string }) => <span className={`${PILL} ${STATUS_TONE[s] ?? STATUS_TONE.queued}`}>{s === "ready" ? "plan ready" : s}</span>;
const MODES = [
  { id: "off", label: "Off", blurb: "HQ still writes signals, routes and judges, but queues nothing." },
  { id: "ask", label: "Ask me", blurb: "HQ queues what's due; you press Run. Each run writes a plan and drafts, and sends nothing." },
  { id: "auto", label: "Auto", blurb: "HQ does up to its daily limit of queued runs on its own. Applying stays yours." },
] as const;
const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");
const btn = "rounded-lg border px-3 py-1.5 text-[12px] transition-colors disabled:opacity-50";

export function PlaybooksPanel({ businessName, demo, mode, perDay, routing, runs, catalogue }: {
  businessName: string; demo: boolean; mode: "off" | "ask" | "auto"; perDay: number; routing: PanelRouting; runs: PanelRun[]; catalogue: PanelPlaybook[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string[]>([]);
  const [open, setOpen] = useState<PanelRun | null>(null);
  const close = useCallback(() => setOpen(null), []);

  const act = async (key: string, body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key); setError(null);
    try {
      const r = await fetch("/api/playbooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(j.error ?? "Could not update");
      if (body.action === "run") setStarting((s) => [...s, String(body.id)]);
      router.refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  const by = (s: string) => runs.filter((r) => r.status === s);
  const live = runs.some((r) => r.status === "running") || starting.some((id) => runs.find((r) => r.id === id)?.status === "queued" || runs.find((r) => r.id === id)?.status === "failed");
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [live, router]);
  useEffect(() => { setStarting((s) => s.filter((id) => ["queued", "failed"].includes(runs.find((r) => r.id === id)?.status ?? ""))); }, [runs]);

  const runFor = (title: string) => runs.find((r) => r.workflow === title && ["queued", "running", "ready", "applied"].includes(r.status));
  const RunCard = ({ r }: { r: PanelRun }) => {
    const isStarting = starting.includes(r.id) && (r.status === "queued" || r.status === "failed");
    return (
      <article className="card space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[14px] font-semibold"><Link href={`/workflows/${workflowSlug(r.workflow)}`} className="hover:text-bb-blue">{r.workflow}</Link></h3>
          <span className="flex shrink-0 items-center gap-1.5">{r.verdict ? <Pill s={r.verdict} /> : <Pill s={isStarting ? "running" : r.status} />}</span>
        </div>
        <div className="text-[12px] text-bb-muted">Owner <span className="font-semibold text-bb-fg">{r.ownerLabel}</span> · {r.reasonText} · {day(r.createdAt)}</div>
        {r.summary && <p className="text-[12.5px]">{r.summary}</p>}
        {r.hypothesis && <p className="border-l-2 border-bb-border pl-2.5 text-[12px] text-bb-muted">{r.hypothesis}</p>}
        {r.status === "ready" && r.ownerActions?.length ? (
          <ul className="list-disc space-y-0.5 pl-4 text-[12px] marker:text-bb-dim">{r.ownerActions.map((a) => <li key={a}>{a}</li>)}</ul>
        ) : null}
        {r.status === "failed" && r.why && <p className="text-[12px] text-bb-danger">{r.why}</p>}
        {r.exp && (
          <p className="text-[12px] text-bb-muted">
            Experiment {r.exp.id} on {r.exp.metricLabel.toLowerCase()}: {r.exp.baseline}{r.exp.status === "running" ? ` at the start, judged ${day(r.exp.reviewAt)}` : ` → ${r.exp.result}. ${r.exp.note}`}
          </p>
        )}
        {(r.status === "running" || isStarting) && <p className="text-[12px] text-bb-blue">Working on it: research, the plan and drafts. Usually 5 to 15 minutes; this page updates itself.</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {r.plan && <button type="button" className={`${btn} border-bb-border hover:bg-bb-surface2`} onClick={() => setOpen(r)}>Read the plan{r.drafts.length ? ` and ${r.drafts.length} draft${r.drafts.length === 1 ? "" : "s"}` : ""}</button>}
          {(r.status === "queued" || r.status === "failed") && !isStarting && (
            <button type="button" disabled={busy !== null} className={`${btn} border-bb-blue/50 bg-bb-blue/15 hover:bg-bb-blue/25`} onClick={() => act(`run-${r.id}`, { action: "run", id: r.id })}>{r.status === "failed" ? "Run again" : "Run now"}</button>
          )}
          {r.status === "ready" && (
            <button type="button" disabled={busy !== null} className={`${btn} border-bb-accent/50 bg-bb-accent/15 hover:bg-bb-accent/25`}
              onClick={() => act(`apply-${r.id}`, { action: "apply", id: r.id }, `Apply "${r.workflow}"? This records that you're putting the plan into action and starts an experiment on its number, judged in two weeks. Customer-facing drafts still go out through their own approval.`)}>I'm doing it: apply</button>
          )}
          {["queued", "ready", "failed"].includes(r.status) && !isStarting && (
            <button type="button" disabled={busy !== null} className={`${btn} border-bb-border text-bb-muted hover:text-bb-fg`} onClick={() => act(`drop-${r.id}`, { action: "drop", id: r.id }, `Drop "${r.workflow}"?`)}>Drop</button>
          )}
        </div>
      </article>
    );
  };

  const section = (title: string, xs: PanelRun[], blurb: string, empty?: string) => (xs.length || empty) ? (
    <section className="space-y-2">
      <div>
        <h2 className="text-[15px] font-semibold">{title} <span className="font-mono text-[12px] text-bb-dim">{xs.length}</span></h2>
        <p className="text-[12.5px] text-bb-muted max-w-[75ch]">{blurb}</p>
      </div>
      {xs.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{xs.map((r) => <RunCard key={r.id} r={r} />)}</div> : <p className="card px-4 py-3 text-[12.5px] text-bb-muted">{empty}</p>}
    </section>
  ) : null;

  return (
    <div className="space-y-8">
      {error && <p role="alert" className="card border-bb-danger/40 px-4 py-2.5 text-[12.5px] text-bb-danger">{error}</p>}

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-start">
        <div className="card space-y-2.5 p-4">
          <div className="eyebrow">Playbooks for {businessName}{demo ? " · demo data" : ""}</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Playbook mode">
            {MODES.map((m) => (
              <button key={m.id} type="button" aria-pressed={mode === m.id} disabled={busy !== null}
                onClick={() => mode !== m.id && act(`mode-${m.id}`, { action: "mode", mode: m.id }, m.id === "auto" ? `Let HQ do up to ${perDay} queued runs a day on its own? Each run uses Claude Code (a few dollars at most) and writes plans and drafts only.` : undefined)}
                className={`rounded-full border px-3 py-1 text-[12px] ${mode === m.id ? "border-bb-blue/50 bg-bb-blue/15 text-bb-fg" : "border-bb-border text-bb-muted hover:text-bb-fg"}`}>{m.label}</button>
            ))}
          </div>
          <p className="text-[12px] text-bb-muted">{MODES.find((m) => m.id === mode)?.blurb}{mode === "auto" ? ` Up to ${perDay} a day.` : ""} HQ checks every day after the scorecard refresh.</p>
        </div>

        <div className="card space-y-2.5 p-4">
          <div className="eyebrow">The CEO's routing{routing ? ` · ${routing.week}` : ""}</div>
          {!routing ? <p className="text-[12.5px] text-bb-muted">No routing yet. It runs with the daily tick (<span className="font-mono">hq playbook tick</span>).</p>
            : !routing.weakest ? <p className="text-[12.5px] text-bb-muted">No lever is clearly weak this week, so nothing was routed.</p>
            : (
              <>
                <p className="text-[13px]"><span className={`${PILL} ${LEVER_TONE[routing.weakest.lever as Lever]}`}>{LEVERS[routing.weakest.lever as Lever]?.short}</span> <span className="font-semibold">{routing.weakest.label}</span> <span className="text-bb-muted">is {routing.weakest.why}.</span></p>
                <ol className="space-y-1.5">
                  {routing.picks.map((x, i) => {
                    const r = runFor(x.workflow);
                    return (
                      <li key={x.slug} className="grid grid-cols-[auto_1fr] gap-x-2 text-[12.5px]">
                        <span className="font-semibold text-bb-teal tabular-nums">{i + 1}</span>
                        <span>
                          <Link href={`/workflows/${x.slug}`} className="font-semibold hover:text-bb-blue">{x.workflow}</Link>
                          {r ? <> <Pill s={r.status} /></> : null}
                          <span className="block text-[12px] text-bb-muted">Owner {x.ownerLabel} · with {x.contributorLabels.join(", ")} · {x.why}</span>
                          {!r && <button type="button" disabled={busy !== null} className="mt-1 text-[12px] text-bb-blue hover:underline" onClick={() => act(`queue-${x.slug}`, { action: "queue", playbook: x.slug })}>Queue it now</button>}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
        </div>
      </section>

      {section("Waiting for you", by("ready"), "Each has a plan and ready-to-use drafts. Read it, then apply it (you're putting it into action; HQ starts the experiment) or drop it.", "Nothing waiting. When a run finishes, its plan shows up here.")}
      {section("Working now", by("running"), "Doing the steps headless. These update on their own.")}
      {section("Queued", by("queued"), mode === "auto" ? "HQ runs these itself, up to the daily limit." : "Their triggers fired. Press Run now to have HQ do the work; nothing goes to customers.")}
      {section("Failed", by("failed"), "What went wrong is on each card; its files are kept. Run it again once the reason is fixed.")}
      {section("Applied", by("applied"), "In action. HQ judges each one from its number two weeks after you applied it, and files the lesson in the brain.")}

      <details className="card px-4 py-3">
        <summary className="cursor-pointer text-[14px] font-semibold">Every playbook and what starts it <span className="font-mono text-[12px] text-bb-dim">{catalogue.length}</span></summary>
        <p className="mt-2 text-[12.5px] text-bb-muted max-w-[75ch]">Anything that reaches customers carries a Legal check; where the catalogue didn't list one, HQ adds it. Engines already run inside HQ's own jobs; owner-only ones wait for you; you can queue any of them by hand.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead><tr className="text-left font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">{["Playbook", "Owner", "Starts on", "Guard rail", ""].map((h) => <th key={h} className="pb-2 pr-4 font-normal">{h}</th>)}</tr></thead>
            <tbody>
              {catalogue.map((p) => (
                <tr key={p.slug} className={`border-t border-bb-border/60 align-top ${p.skipped ? "opacity-50" : ""}`}>
                  <td className="py-2 pr-4"><Link href={`/workflows/${p.slug}`} className="font-medium hover:text-bb-blue">{p.title}</Link> <span className="inline-flex gap-1 align-middle">{p.levers.map((l) => <span key={l} className={`${PILL} ${LEVER_TONE[l]}`}>{LEVERS[l].short}</span>)}</span></td>
                  <td className="py-2 pr-4 whitespace-nowrap">{p.ownerLabel}</td>
                  <td className="py-2 pr-4 text-bb-muted">{p.skipped ? "never automatically, for this business" : p.starts}</td>
                  <td className="py-2 pr-4 text-bb-muted">{p.customerFacing ? `Legal${p.addedGuard ? " (added by HQ)" : ""}` : "internal"}</td>
                  <td className="py-2 text-right">{!runFor(p.title) && <button type="button" disabled={busy !== null} className="text-[12px] text-bb-blue hover:underline" onClick={() => act(`queue-${p.slug}`, { action: "queue", playbook: p.slug }, p.skipped ? `${p.title} is set to never run automatically for this business. Queue it anyway?` : undefined)}>Queue</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {by("dropped").length > 0 && (
        <details className="card px-4 py-3">
          <summary className="cursor-pointer text-[13px] text-bb-muted">Dropped ({by("dropped").length})</summary>
          <ul className="mt-2 space-y-1 text-[12.5px] text-bb-muted">{by("dropped").map((r) => <li key={r.id}>{day(r.droppedAt)} · {r.workflow}{r.note ? ` · ${r.note}` : ""}</li>)}</ul>
        </details>
      )}

      {open && (
        <Drawer labelId="plan-drawer-h" onClose={close} eyebrow={`Playbook run · ${open.ownerLabel} · ${day(open.createdAt)}`} title={open.workflow}
          head={<p className="mt-1 text-[12.5px] text-bb-muted">{open.reasonText}</p>}>
          {open.plan && <article className="prose-brief text-[13px]"><GuideMarkdown markdown={open.plan.replace(/^# .*\n/, "")} /></article>}
          {open.drafts.map((d) => (
            <details key={d.file} className="card p-3.5" open={open.drafts.length === 1}>
              <summary className="cursor-pointer text-[13px] font-semibold">{d.title} <span className="font-mono text-[10.5px] font-normal text-bb-dim">{d.file}</span></summary>
              <div className="prose-brief mt-2 text-[12.5px]"><GuideMarkdown markdown={d.text} /></div>
            </details>
          ))}
        </Drawer>
      )}
    </div>
  );
}
