// The lifecycle naming contract, checked. One scheme for every business, so a page, the CLI and a
// Claude session all mean the same thing by an id:
//   flow id      lower-case words joined by hyphens: "onboarding", "churn", "checkout", "habit-invite"
//   message id   the flow id, or the flow id + "-" + a step: "onboarding-day-0", "churn-quiet", "checkout"
//   serves       the exact title of a workflow in lib/workflows.ts; its page is /workflows/<slug of title>
// HQ never rejects a snapshot for a name; it lists the problems (CLI `hq lifecycle show`, the guide's tests).
import type { LifecycleSnapshot } from "./lifecycle";
import { WORKFLOWS, workflowSlug } from "./workflows";

export const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const TITLES = new Set(WORKFLOWS.map((w) => w.title));

/** The flow a message id belongs to: the longest flow id that is the message id or its prefix plus "-". */
export function flowOfMessage(messageId: string, flowIds: string[]): string | null {
  return flowIds.filter((f) => messageId === f || messageId.startsWith(f + "-")).sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Where a flow's page lives, or null when it serves no known workflow. */
export const flowPage = (serves?: string) => (serves && TITLES.has(serves) ? `/workflows/${workflowSlug(serves)}` : null);

/** Every way this snapshot breaks the naming contract, in plain words. Empty when it keeps it. */
export function namingProblems(s: Pick<LifecycleSnapshot, "flows" | "workflows">): string[] {
  const out: string[] = [];
  const flows = s.flows ?? [];
  const ids = flows.map((f) => f.id);
  const seen = new Set<string>();
  for (const f of flows) {
    if (!ID.test(f.id)) out.push(`flow "${f.id}": use lower-case words joined by hyphens, like "${f.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}"`);
    if (seen.has(f.id)) out.push(`flow "${f.id}" is listed twice`);
    seen.add(f.id);
    if (f.serves !== undefined && !TITLES.has(f.serves)) out.push(`flow "${f.id}" serves "${f.serves}", which is not a workflow title`);
    for (const m of f.messages) {
      if (!ID.test(m.id)) out.push(`message "${m.id}" in flow "${f.id}": use lower-case words joined by hyphens`);
      else if (flowOfMessage(m.id, ids) !== f.id) out.push(`message "${m.id}" sits in flow "${f.id}" but its id must be "${f.id}" or start with "${f.id}-"`);
    }
  }
  for (const w of s.workflows) {
    if (!ID.test(w.id)) out.push(`message "${w.id}": use lower-case words joined by hyphens`);
    else if (flows.length && w.serves && !flowOfMessage(w.id, ids)) out.push(`message "${w.id}" serves "${w.serves}" but belongs to no flow: start its id with a flow id`);
  }
  return out;
}
