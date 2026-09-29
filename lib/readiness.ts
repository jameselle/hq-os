// How ready a department is. A "need" is one ungrouped core tool, or one group
// of alternatives (any member satisfies it). Optional tools never count.
// Pure and client-safe, so it's unit-tested.

import type { ToolState } from "./types";

type T = { name: string; group?: string; optional?: boolean; state: ToolState };

export function toolNeeds(tools: T[]): { needs: number; needsMet: number } {
  const met = new Map<string, boolean>();
  for (const t of tools) {
    if (t.optional) continue;
    const key = t.group ? `group:${t.group}` : `tool:${t.name}`;
    met.set(key, (met.get(key) ?? false) || t.state !== "missing");
  }
  return { needs: met.size, needsMet: [...met.values()].filter(Boolean).length };
}

/** Skills are the staff, tools are their desks: half each. */
export function readinessScore(skillsReady: number, skillsTotal: number, needsMet: number, needs: number): number {
  const skillRatio = skillsTotal ? skillsReady / skillsTotal : 1;
  const toolRatio = needs ? needsMet / needs : 1;
  return Math.round(100 * (0.5 * skillRatio + 0.5 * toolRatio));
}
