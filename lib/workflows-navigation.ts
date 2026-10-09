// The Workflows page's tabs, one per section, picked by `?tab=`. Anything unknown falls back to
// "running" so a stale or hand-typed link still lands somewhere sensible.

export const WORKFLOW_TABS = ["running", "playbooks", "all", "web", "loops", "brain", "build"] as const;
export type WorkflowTab = (typeof WORKFLOW_TABS)[number];

export const WORKFLOW_TAB_LABELS: Record<WorkflowTab, string> = {
  running: "Running now",
  playbooks: "Playbooks",
  all: "All workflows",
  web: "Who feeds whom",
  loops: "Loops",
  brain: "The brain",
  build: "Build order",
};

export function workflowsTab(value: unknown): WorkflowTab {
  return WORKFLOW_TABS.includes(value as WorkflowTab) ? (value as WorkflowTab) : "running";
}

/** A link to one tab, optionally with the catalogue filtered to a department. */
export function workflowsTabUrl(tab: WorkflowTab, dept?: string): string {
  const q = new URLSearchParams({ tab });
  if (dept) q.set("dept", dept);
  return `/workflows?${q.toString()}`;
}
