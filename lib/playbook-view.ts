// What the Playbooks tab draws for one business, read from disk and made serialisable for the client panel
// (components/PlaybooksPanel.tsx): runs with their plans, drafts and experiments; the routing with department names;
// every playbook with what starts it. Server-only.
import fs from "node:fs";
import path from "node:path";

import { ANALYTICS, formatAnalytics } from "./analytics-metrics";
import { listExperiments } from "./experiments";
import { PLAYBOOKS, triggerLabel, type Reason } from "./playbooks";
import { listRuns, readConfig, readRouting, runDir } from "./playbook-store";
import { DEPARTMENTS } from "./registry";
import { getProfile } from "./store";
import type { PanelPlaybook, PanelRouting, PanelRun } from "@/components/PlaybooksPanel";

const label = (n: string) => (n === "ceo" ? "CEO" : DEPARTMENTS.find((d) => d.slug === n)?.label ?? n);

export function reasonText(r: Reason): string {
  switch (r.kind) {
    case "signal": return `Started by ${r.titles.length === 1 ? `a signal: "${r.titles[0].slice(0, 90)}"` : `${r.titles.length} signals`}`;
    case "schedule": return `Its ${r.every}ly turn`;
    case "route": return `Routed by the CEO: ${r.why}`;
    case "alarm": return `Alarm: ${r.metric} read ${r.value}`;
    case "owner": return "Started by you";
  }
}

export function playbookView(slug: string) {
  const p = getProfile(slug);
  if (!p) throw Error("Unknown business");
  const cfg = readConfig(slug);
  const exps = listExperiments(slug);
  const read = (f: string) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };
  const runs: PanelRun[] = listRuns(slug).map((r) => {
    const dir = runDir(slug, r.id);
    let titles: Record<string, string> = {};
    try { titles = Object.fromEntries((JSON.parse(read(path.join(dir, "result.json")) ?? "{}").deliverables ?? []).map((d: { file: string; title: string }) => [d.file, d.title])); } catch { titles = {}; }
    const drafts = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^draft-.*\.md$/.test(f)).sort().map((f) => ({ file: f, title: titles[f] ?? f.replace(/^draft-\d+-|\.md$/g, "").replace(/-/g, " "), text: (read(path.join(dir, f)) ?? "").slice(0, 20000) })) : [];
    const e = r.experiment ? exps.find((x) => x.id === r.experiment) : undefined;
    const fmt = (v: number | null) => (e ? formatAnalytics(ANALYTICS[e.metric].unit, v, p.currency) : "");
    return {
      ...r, ownerLabel: label(r.owner), reasonText: reasonText(r.reason),
      plan: ["ready", "applied", "failed", "dropped"].includes(r.status) ? read(path.join(dir, "plan.md"))?.slice(0, 60000) ?? null : null,
      drafts,
      exp: e ? { id: e.id, status: e.status, metricLabel: ANALYTICS[e.metric].label, baseline: fmt(e.baseline), result: fmt(e.result), reviewAt: e.reviewAt ?? null, note: e.note } : null,
    };
  });
  const rt = readRouting(slug);
  const routing: PanelRouting = rt ? { ...rt, picks: rt.picks.map((x) => ({ ...x, ownerLabel: label(x.owner), contributorLabels: x.contributors.map(label) })) } : null;
  const catalogue: PanelPlaybook[] = PLAYBOOKS.map((b) => ({
    slug: b.slug, title: b.title, ownerLabel: label(b.owner), levers: b.levers, starts: b.triggers.map(triggerLabel).join("; "),
    runnable: b.runnable, customerFacing: b.customerFacing, addedGuard: b.addedGuard, skipped: cfg.skip.includes(b.title),
  }));
  return { mode: cfg.mode, perDay: cfg.perDay, routing, runs, catalogue };
}
