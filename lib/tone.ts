// One tone vocabulary for every surface, so a state has one colour everywhere.
// Client-safe: no node imports.

import type { DeptStatus, Severity, ToolState } from "./types";

/** The shared pill shape; combine with a tone below. */
export const PILL =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em]";

const GREEN = "border-bb-accent/40 bg-bb-accent/10 text-bb-accent";
const BLUE = "border-bb-blue/40 bg-bb-blue/10 text-bb-blue";
const AMBER = "border-bb-warn/40 bg-bb-warn/10 text-bb-warn";
const RED = "border-bb-danger/40 bg-bb-danger/10 text-bb-danger";
const VIOLET = "border-bb-violet/40 bg-bb-violet/10 text-bb-violet";
const SLATE = "border-bb-border bg-bb-surface text-bb-muted";

export const TOOL_TONE: Record<ToolState, string> = {
  running: GREEN,
  installed: BLUE,
  connected: GREEN,
  "on-demand": VIOLET,
  web: "border-bb-indigo/40 bg-bb-indigo/10 text-bb-indigo",
  missing: SLATE,
};

export const TOOL_LABEL: Record<ToolState, string> = {
  running: "running",
  installed: "installed",
  connected: "connected",
  "on-demand": "via npx",
  web: "web service",
  missing: "not installed",
};

/** Comment-reply triage buckets (lib/social-replies.ts). */
export const BUCKET_TONE: Record<string, string> = {
  KEYWORD: VIOLET,
  LEAD: GREEN,
  SUBSTANCE: BLUE,
  QUESTION: AMBER,
  SUPPORT: SLATE,
  NOISE: SLATE,
};

export const SEVERITY_TONE: Record<Severity, string> = {
  critical: RED,
  attention: AMBER,
  decision: BLUE,
  info: SLATE,
};

export const GRADE_TONE: Record<DeptStatus["grade"], string> = {
  equipped: GREEN,
  thin: AMBER,
  "skills-only": SLATE,
};

export const GRADE_LABEL: Record<DeptStatus["grade"], string> = {
  equipped: "equipped",
  thin: "thin",
  "skills-only": "skills only",
};

export const LICENCE_TONE = {
  oss: "border-bb-teal/35 bg-bb-teal/5 text-bb-teal",
  "open-core": "border-bb-indigo/35 bg-bb-indigo/5 text-bb-indigo",
  free: "border-bb-pink/35 bg-bb-pink/5 text-bb-pink",
  own: "border-bb-accent/35 bg-bb-accent/5 text-bb-accent",
} as const;

export function readinessBar(pct: number): string {
  if (pct >= 60) return "bg-bb-accent";
  if (pct >= 40) return "bg-bb-warn";
  return "bg-bb-danger";
}
