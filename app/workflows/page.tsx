// Workflows: how the departments work together to get customers, keep them and grow what
// they pay. The web, the loops and the workflow catalogue come from lib/workflows.ts; the
// current business only decides which departments show as skipped.

import { Tile } from "@/components/Tile";
import { WorkflowsWeb } from "@/components/WorkflowsWeb";
import { preferredBusiness } from "@/lib/current";
import { activeDepartments } from "@/lib/profile";
import { DEPARTMENTS } from "@/lib/registry";
import { workflowEvidence } from "@/lib/workflow-evidence";
import { resolveCurrent } from "@/lib/store";
import { EDGES, LOOPS, WORKFLOWS } from "@/lib/workflows";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const business = resolveCurrent(await preferredBusiness());
  const active = activeDepartments(business);
  const count = (l: "get" | "keep" | "expand") => WORKFLOWS.filter((w) => w.levers.includes(l)).length;
  const { demo, evidence } = business ? workflowEvidence(business.slug) : { demo: false, evidence: {} };
  const live = Object.values(evidence).filter((e) => e.state === "live").length;
  const partial = Object.values(evidence).length - live;

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

      <WorkflowsWeb active={active} businessName={business?.name ?? null} evidence={evidence} demo={demo} />
    </div>
  );
}
