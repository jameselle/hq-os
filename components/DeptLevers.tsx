// "Growth levers" on a department's page: the levers it moves (Get, Keep, Expand, Foundation), from the workflows it
// owns or helps with (lib/workflows.ts deptLevers), with what runs for the current business, what the CEO routed to it
// this week, and its playbook runs waiting for the owner.
import Link from "next/link";

import { listRuns, readRouting } from "@/lib/playbook-store";
import { PILL } from "@/lib/tone";
import { workflowEvidence } from "@/lib/workflow-evidence";
import { LEVERS, deptLevers, workflowSlug, type Lever } from "@/lib/workflows";
import { workflowsTabUrl } from "@/lib/workflows-navigation";

const TONE: Record<Lever, string> = {
  get: "border-bb-teal/40 bg-bb-teal/10 text-bb-teal",
  keep: "border-bb-blue/40 bg-bb-blue/10 text-bb-blue",
  expand: "border-bb-violet/40 bg-bb-violet/10 text-bb-violet",
  base: "border-bb-border bg-bb-surface text-bb-muted",
};

export function DeptLevers({ dept, label, slug }: { dept: string; label: string; slug: string | null }) {
  const levers = deptLevers(dept);
  if (!levers.length) return null;
  let evidence: ReturnType<typeof workflowEvidence>["evidence"] = {};
  let routed: string[] = [];
  let runs: { workflow: string; status: string }[] = [];
  if (slug) {
    try { evidence = workflowEvidence(slug).evidence; } catch { /* no records yet */ }
    try { routed = (readRouting(slug)?.picks ?? []).map((p) => p.workflow); } catch { /* no routing yet */ }
    try { runs = listRuns(slug).filter((r) => r.status === "ready" || r.status === "queued"); } catch { /* no runs yet */ }
  }
  const owned = levers.reduce((n, l) => n + l.owns.length, 0);

  return (
    <section className="card p-4 space-y-3" aria-labelledby="levers-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="levers-h" className="text-[15px] font-semibold">Growth levers</h2>
          <p className="text-[12px] text-bb-muted">What {label} moves: it owns {owned} workflow{owned === 1 ? "" : "s"} and helps with more. Taken from the workflow catalogue, so it can't drift.</p>
        </div>
        <Link href={workflowsTabUrl("all", dept)} className="text-[12px] text-bb-blue hover:underline">All its workflows →</Link>
      </div>
      <div className="grid gap-2.5 md:grid-cols-2">
        {levers.map(({ lever, owns, helps }) => (
          <div key={lever} className="rounded-lg border border-bb-border bg-bb-surface2/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className={`${PILL} ${TONE[lever]}`}>{LEVERS[lever].short}</span>
              <span className="text-[11.5px] text-bb-muted">owns {owns.length} · helps {helps.length}</span>
            </div>
            {owns.length > 0 && (
              <ul className="space-y-1">
                {owns.map((w) => {
                  const e = evidence[w.title], run = runs.find((r) => r.workflow === w.title);
                  return (
                    <li key={w.title} className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                      <Link href={`/workflows/${workflowSlug(w.title)}`} className="font-medium hover:text-bb-blue">{w.title}</Link>
                      {e && <span className={`${PILL} ${e.state === "live" ? "border-bb-accent/40 bg-bb-accent/10 text-bb-accent" : "border-bb-warn/40 bg-bb-warn/10 text-bb-warn"}`}>{e.state === "live" ? "live" : "in part"}</span>}
                      {routed.includes(w.title) && <span className={`${PILL} border-bb-blue/50 bg-bb-blue/15 text-bb-blue`} title="The CEO's routing picked it for this week's weakest lever">routed</span>}
                      {run && <Link href={workflowsTabUrl("playbooks")} className={`${PILL} border-bb-warn/40 bg-bb-warn/10 text-bb-warn hover:underline`}>{run.status === "ready" ? "plan ready" : "queued"}</Link>}
                    </li>
                  );
                })}
              </ul>
            )}
            {helps.length > 0 && (
              <p className="text-[11.5px] text-bb-muted">
                Helps with {helps.map((w, i) => (
                  <span key={w.title}>{i > 0 && ", "}<Link href={`/workflows/${workflowSlug(w.title)}`} className="hover:text-bb-fg">{w.title}</Link>{routed.includes(w.title) && <span className="text-bb-blue"> (routed)</span>}</span>
                ))}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
