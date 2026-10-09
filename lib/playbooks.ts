// Playbooks: each workflow in lib/workflows.ts as something HQ can start on its own. A playbook adds what the
// catalogue only says in words: what triggers it (a signal from another department, a schedule, the CEO's routing,
// an alarm), whether an HQ job already runs it, the guard-rail steps it must carry (Legal for anything
// customer-facing), its target number, and how a run's result is judged afterwards. Pure and client-safe; runs on
// disk live in lib/playbook-store.ts and the headless writer in lib/playbook-runner.ts.
// Spec: docs/guides/playbooks.md.

import { ANALYTICS, WORKFLOW_ANALYTICS, type AnalyticsId } from "./analytics-metrics";
import type { SignalFeedItem } from "./brain";
import { WORKFLOWS, workflowSlug, type Lever, type Node, type Step, type Workflow } from "./workflows";

export type Period = "week" | "month" | "quarter";
export type Trigger =
  /** A new signal note from one of these departments, addressed to the owner or a step's department. `match` narrows it by words in the title or body. */
  | { kind: "signal"; from: Node[]; match?: RegExp }
  | { kind: "schedule"; every: Period }
  /** The CEO's routing picks it when its lever is the weakest this week. */
  | { kind: "route" }
  /** One of its fault numbers (an analytics alarm) reads above zero. */
  | { kind: "alarm" }
  /** An HQ job already runs it; the playbook runner never starts it. */
  | { kind: "engine"; job: string }
  /** It needs the owner (on camera, a booking, a pricing decision); HQ never starts it alone. */
  | { kind: "owner" }
  /** It runs inside other playbooks as a required step, not on its own. */
  | { kind: "guard" };

const sig = (from: Node[], match?: RegExp): Trigger => ({ kind: "signal", from, match });
const every = (p: Period): Trigger => ({ kind: "schedule", every: p });
const ROUTE: Trigger = { kind: "route" }, ALARM: Trigger = { kind: "alarm" }, OWNER: Trigger = { kind: "owner" }, GUARD: Trigger = { kind: "guard" };
const engine = (job: string): Trigger => ({ kind: "engine", job });

/** What starts each workflow. Every workflow has an entry (tests/playbooks.test.ts). Routing also reaches any
 *  workflow whose lever is weakest, unless it is owner-only, an engine or a guard. */
export const TRIGGERS: Record<string, Trigger[]> = {
  "Competitor gap becomes comparison content": [sig(["competitors"], /price|cheaper|outage|down\b|weak|complain|gap|alternative|raised|comparison/i)],
  "Search demand becomes pages at scale": [sig(["seo"], /pattern|pages|search|volume/i), every("month")],
  "Self post": [OWNER],
  "Clip engine": [OWNER],
  "Walkthrough videos in the owner's voice": [sig(["engineering"], /page|screen|board|launch|new\b|redesign/i)],
  "Comment-keyword funnel": [engine("social")],
  "Partner program": [every("week")],
  "Customer proof": [sig(["support"], /happy|thank|love|great|won\b|result|testimonial|review/i)],
  "Free tool as a lead magnet": [sig(["seo"], /tool|calculator|converter|checker/i)],
  "Launch week": [sig(["engineering"], /launch|new market|new product|beta|ready to ship/i)],
  "Paid ads with a payback cap": [sig(["content"])],
  "Community invites": [every("month")],
  "Original data for press and AI answers": [every("month")],
  "Weekly social plan from the channel plan": [engine("social")],
  "Daily blog from search demand": [engine("blog")],
  "Campaign from brief to results": [OWNER],
  "Trial that didn't convert": [engine("lifecycle")],
  "Abandoned checkout recovery": [engine("lifecycle")],
  "Pricing page experiment": [ROUTE],
  "New market or category": [sig(["competitors", "seo", "support"], /new (market|category|league|sport|country)|demand for|not covered|don't cover|expand(s|ed)? into/i)],
  "Podcast and creator appearances": [OWNER],
  "Referral program": [ROUTE],
  "Onboarding to first value": [ROUTE],
  "Churn early warning": [ROUTE, sig(["data", "support"], /churn|cancel|at risk|at-risk|usage drop|quiet/i)],
  "Voice of the customer to roadmap": [sig(["support"])],
  "Competitor move to product response": [sig(["competitors"], /launch|feature|price|market|added|released|bundles|plan/i)],
  "Data freshness and uptime": [ALARM, sig(["operations"], /uptime|stale|down\b|outage|incident/i)],
  "Failed payment recovery": [engine("lifecycle")],
  "Cancel flow with saves": [ROUTE],
  "Win-back when the reason is fixed": [sig(["engineering"], /fix|fixed|cancel reason/i)],
  "Daily habit": [engine("lifecycle")],
  "Honest track record": [every("week")],
  "Customer academy": [sig(["support"], /question|how do|asked|confus/i)],
  "Off-season plan": [every("month")],
  "Release quality gate": [every("week")],
  "Load test before growth": [every("month")],
  "Top customer care": [every("month")],
  "Exit survey to competitive intel": [sig(["support", "data"], /rival|competitor|switch/i)],
  "Account security and trust": [ALARM, sig(["support", "operations"], /suspicious|login|breach|takeover|hack|security/i)],
  "Usage limit to upgrade": [ROUTE],
  "Tier design": [every("quarter")],
  "Monthly to annual": [OWNER],
  "Add-ons": [sig(["support"], /add-on|addon|extra|api\b/i)],
  "Teams and B2B": [sig(["support"], /seat|team|api\b|business account|shar(e|ing) (a )?login/i)],
  "Support conversation to upgrade": [sig(["support"], /upgrade|tier|plan|gold|premium/i)],
  "Price increase without churn": [OWNER],
  "Cross-sell across your businesses": [OWNER],
  "Premium content products": [every("quarter")],
  "Weekly growth review": [OWNER],
  "Unit economics check": [every("month")],
  "Measurement plumbing": [sig(["engineering"], /track|event|analytics|source|attribution/i)],
  "Claims and compliance review": [GUARD],
  "Brand system": [OWNER],
  "Capacity and hiring": [every("month")],
  "Experiment log": [engine("playbooks")],
  "Knowledge base and decisions": [engine("brain")],
  "Runbooks, vendors and risks": [every("month")],
};

/** Departments whose work reaches customers. A playbook with any of their steps must pass Legal before it ships. */
export const CUSTOMER_FACING: Node[] = ["content", "email", "ads", "design", "sales", "seo", "support"];
const LEGAL_STEP: Step = ["legal", "Checks every customer-facing claim, notice and screenshot before anything ships"];

export type Playbook = {
  slug: string; title: string; owner: Node; levers: Lever[]; contributors: Node[];
  triggers: Trigger[]; steps: Step[]; customerFacing: boolean; addedGuard: boolean;
  metric: AnalyticsId | null; metricText: string;
  /** HQ starts it itself (signal, schedule, route or alarm), as opposed to an engine, the owner, or a guard. */
  runnable: boolean;
};

export function playbookFor(w: Workflow): Playbook {
  const triggers = TRIGGERS[w.title] ?? [OWNER];
  const customerFacing = w.steps.some(([d]) => CUSTOMER_FACING.includes(d));
  const hasLegal = w.steps.some(([d]) => d === "legal");
  const addedGuard = customerFacing && !hasLegal;
  // Legal goes in before the first step that ships something to customers, and at the end at the latest.
  const steps = addedGuard ? [...w.steps.slice(0, -1), LEGAL_STEP, ...w.steps.slice(-1)] : w.steps;
  const metric = (WORKFLOW_ANALYTICS[w.title]?.[0] as AnalyticsId | undefined) ?? null;
  return {
    slug: workflowSlug(w.title), title: w.title, owner: w.owner, levers: w.levers,
    contributors: [...new Set(steps.map(([d]) => d).filter((d) => d !== w.owner))],
    triggers, steps, customerFacing, addedGuard, metric, metricText: w.metric,
    runnable: triggers.some((t) => t.kind === "signal" || t.kind === "schedule" || t.kind === "route" || t.kind === "alarm"),
  };
}

export const PLAYBOOKS: Playbook[] = WORKFLOWS.map(playbookFor);
export const playbookBySlug = (slug: string) => PLAYBOOKS.find((p) => p.slug === slug) ?? null;
export const playbookByTitle = (title: string) => PLAYBOOKS.find((p) => p.title === title) ?? null;

export function triggerLabel(t: Trigger): string {
  switch (t.kind) {
    case "signal": return `a signal from ${t.from.join(", ")}${t.match ? " about it" : ""}`;
    case "schedule": return `every ${t.every}`;
    case "route": return "the CEO's routing";
    case "alarm": return "an alarm number above zero";
    case "engine": return `runs in HQ's ${t.job} job`;
    case "owner": return "the owner starts it";
    case "guard": return "a step inside other playbooks";
  }
}

// ---------------------------------------------------------------- what's due

export type Reason =
  | { kind: "signal"; rels: string[]; titles: string[] }
  | { kind: "schedule"; every: Period }
  | { kind: "route"; why: string }
  | { kind: "alarm"; metric: string; value: number }
  | { kind: "owner" };

export type DueInput = {
  /** Signal notes newer than the last tick (any order). */
  newSignals: SignalFeedItem[];
  /** The newest run of each playbook (any status), by slug, as ISO times. */
  lastRun: Record<string, string>;
  /** Slugs the CEO's routing picked this week, with why. */
  routed: { slug: string; why: string }[];
  /** Alarm numbers reading above zero, with the workflow that owns each. */
  alarms: { workflow: string; metric: string; value: number }[];
  /** Workflow titles this business never runs automatically. */
  skip: string[];
  now: Date;
};

const DAY = 864e5;
/** How long after a run the same playbook can be started again, per trigger. */
export const COOLDOWN_DAYS: Record<"signal" | "route" | "alarm" | Period, number> = { signal: 7, route: 14, alarm: 3, week: 6, month: 27, quarter: 85 };

const signalMatches = (t: Extract<Trigger, { kind: "signal" }>, p: Playbook, s: SignalFeedItem) =>
  s.status === "active" && t.from.includes(s.from) && s.to.some((to) => to === p.owner || p.contributors.includes(to)) &&
  (!t.match || t.match.test(`${s.title}\n${s.body}`));

/** Which playbooks should start now, and why. One reason per playbook (the first that applies), cooldowns honoured. */
export function duePlaybooks(input: DueInput): { playbook: Playbook; reason: Reason }[] {
  const out: { playbook: Playbook; reason: Reason }[] = [];
  const since = (slug: string) => (input.lastRun[slug] ? (input.now.getTime() - Date.parse(input.lastRun[slug])) / DAY : Infinity);
  for (const p of PLAYBOOKS) {
    if (!p.runnable || input.skip.includes(p.title)) continue;
    const age = since(p.slug);
    // The CEO's routing reaches any runnable playbook, whatever its own triggers, and its reason comes first.
    const r = input.routed.find((x) => x.slug === p.slug);
    let reason: Reason | null = r && age >= COOLDOWN_DAYS.route ? { kind: "route", why: r.why } : null;
    for (const t of p.triggers) {
      if (reason) break;
      if (t.kind === "signal" && age >= COOLDOWN_DAYS.signal) {
        const hits = input.newSignals.filter((s) => signalMatches(t, p, s));
        if (hits.length) reason = { kind: "signal", rels: hits.map((s) => s.rel), titles: hits.map((s) => s.title) };
      } else if (t.kind === "schedule" && age >= COOLDOWN_DAYS[t.every]) reason = { kind: "schedule", every: t.every };
      else if (t.kind === "alarm" && age >= COOLDOWN_DAYS.alarm) {
        const a = input.alarms.find((x) => x.workflow === p.title);
        if (a) reason = { kind: "alarm", metric: a.metric, value: a.value };
      }
    }
    if (reason) out.push({ playbook: p, reason });
  }
  return out;
}

// ---------------------------------------------------------------- learning

export type Verdict = "won" | "lost" | "inconclusive";
/** A move this big against the baseline, in the number's good direction, wins; the same against it loses. */
export const VERDICT_MOVE = 0.1;
/** Days after a run is applied before its experiment is judged. */
export const REVIEW_AFTER_DAYS = 14;
/** How long a lost playbook is kept out of routing. */
export const LOST_REST_DAYS = 56;

export function judge(metric: AnalyticsId, baseline: number | null, result: number | null): { verdict: Verdict; why: string } {
  const def = ANALYTICS[metric];
  if (baseline === null || result === null) return { verdict: "inconclusive", why: `${def.label} wasn't measured ${baseline === null ? "before" : "after"}` };
  if (baseline === 0) {
    if (result === 0) return { verdict: "inconclusive", why: `${def.label} stayed at 0` };
    const good = (result > 0) === (def.better === "up");
    return { verdict: good ? "won" : "lost", why: `${def.label} went from 0 to ${result}` };
  }
  const move = (result - baseline) / Math.abs(baseline);
  const good = def.better === "up" ? move : -move;
  const pct = `${move > 0 ? "+" : ""}${(move * 100).toFixed(0)}%`;
  if (good >= VERDICT_MOVE) return { verdict: "won", why: `${def.label} moved ${pct} (${baseline} → ${result}), the right way` };
  if (good <= -VERDICT_MOVE) return { verdict: "lost", why: `${def.label} moved ${pct} (${baseline} → ${result}), the wrong way` };
  return { verdict: "inconclusive", why: `${def.label} moved ${pct} (${baseline} → ${result}), within ±${VERDICT_MOVE * 100}%` };
}
