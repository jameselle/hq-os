// Workflows: how the departments work together to get customers, keep them and grow what
// they pay. The web, the loops and the workflow catalogue come from lib/workflows.ts; the
// current business only decides which departments show as skipped. Each section is its own tab
// (`?tab=`, lib/workflows-navigation.ts); `?dept=` opens the catalogue filtered to one department.

import Link from "next/link";

import { BrainMap } from "@/components/BrainMap";
import { PlaybooksPanel } from "@/components/PlaybooksPanel";
import { Tile } from "@/components/Tile";
import { WorkflowsWeb } from "@/components/WorkflowsWeb";
import { preferredBusiness } from "@/lib/current";
import { activeDepartments } from "@/lib/profile";
import { DEPARTMENTS } from "@/lib/registry";
import { workflowEvidence } from "@/lib/workflow-evidence";
import { brainStats, signalFeed } from "@/lib/brain-store";
import { buildOrder } from "@/lib/build-order";
import { listRuns } from "@/lib/playbook-store";
import { playbookView } from "@/lib/playbook-view";
import { resolveCurrent } from "@/lib/store";
import { EDGES, LOOPS, NODES, WORKFLOWS } from "@/lib/workflows";
import { WORKFLOW_TABS, WORKFLOW_TAB_LABELS, workflowsTab, workflowsTabUrl, type WorkflowTab } from "@/lib/workflows-navigation";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage({ searchParams: query }: { searchParams: Promise<{ tab?: string; dept?: string }> }) {
  const searchParams = await query;
  const tab = workflowsTab(searchParams.tab);
  const dept = (NODES as readonly string[]).includes(searchParams.dept ?? "") ? searchParams.dept : undefined;
  const business = resolveCurrent(await preferredBusiness());
  const active = activeDepartments(business);
  const count = (l: "get" | "keep" | "expand") => WORKFLOWS.filter((w) => w.levers.includes(l)).length;
  const { demo, evidence } = business ? workflowEvidence(business.slug) : { demo: false, evidence: {} };
  const live = Object.values(evidence).filter((e) => e.state === "live").length;
  const partial = Object.values(evidence).length - live;
  let waiting = 0;
  try { waiting = business ? listRuns(business.slug).filter((r) => r.status === "ready" || r.status === "queued").length : 0; } catch { waiting = 0; }
  const badge: Partial<Record<WorkflowTab, number>> = { running: live + partial, all: WORKFLOWS.length, web: EDGES.length, loops: LOOPS.length, ...(waiting ? { playbooks: waiting } : {}) };

  return (
    <div className="space-y-4">
      <div>
        <div className="eyebrow mb-1">Lead</div>
        <h1 className="text-2xl font-semibold">
          Workflows
          {business && <span className="text-bb-muted font-normal text-[17px]"> · {business.name}</span>}
        </h1>
        <p className="mt-1 max-w-[75ch] text-[13px] text-bb-muted">
          No department works alone. Each turns what it learns into a signal another acts on. This is who sends what to whom, the loops
          that matter, and every workflow to build for getting customers, keeping them and growing what they pay.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Running now" value={`${live + partial}/${WORKFLOWS.length}`} hint={`${live} live · ${partial} in part${demo ? " · demo data" : ""}`} />
        <Tile label="Hand-offs" value={String(EDGES.length)} hint="signals between departments" />
        <Tile label="Loops" value={String(LOOPS.length)} hint="that run every week" />
        <Tile label="Workflows" value={String(WORKFLOWS.length)} hint={`get ${count("get")} · keep ${count("keep")} · expand ${count("expand")}`} />
        <Tile label="Departments" value={`${active.length}/${DEPARTMENTS.length}`} hint="active for this business" />
      </div>

      <nav aria-label="Workflows sections" className="flex gap-1 overflow-x-auto border-b border-bb-border pb-px">
        {WORKFLOW_TABS.map((t) => (
          <Link
            key={t}
            href={workflowsTabUrl(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`shrink-0 px-4 py-3 text-sm border-b-2 ${tab === t ? "border-bb-teal text-bb-fg" : "border-transparent text-bb-muted hover:text-bb-fg"}`}
          >
            {WORKFLOW_TAB_LABELS[t]}
            {badge[t] !== undefined && <span className="ml-1.5 font-mono text-[11px] text-bb-dim tabular-nums">{badge[t]}</span>}
          </Link>
        ))}
      </nav>

      {tab === "playbooks" && (business
        ? <PlaybooksPanel businessName={business.name} demo={demo} {...playbookView(business.slug)} />
        : <p className="card px-4 py-3 text-[12.5px] text-bb-muted">Pick a business in the top bar to see its playbooks.</p>)}

      <WorkflowsWeb tab={tab} dept={dept} active={active} businessName={business?.name ?? null} evidence={evidence} demo={demo}
        feed={tab === "web" && business ? signalFeed(business.slug) : []}
        build={tab === "build" ? buildOrder(business?.slug ?? null) : []}
        brain={tab === "brain" && business ? <BrainMap stats={brainStats(business.slug)} businessName={business.name} demo={demo} active={active} /> : null} />
    </div>
  );
}
