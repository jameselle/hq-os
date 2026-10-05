// What the Email & Lifecycle page asks of the owner, in the order to deal with it: batches of drafts waiting for a yes
// (soonest expiry first), then flows with a problem or a finished week one, then every flow in one line each.
// Pure and client-safe: built from the lifecycle snapshot and the status rules in lib/lifecycle-status.ts.
import type { LifecycleFlow, LifecycleSnapshot } from "./lifecycle";
import type { FlowStatus, Recommendation, Tone } from "./lifecycle-status";

export type DraftBatch = {
  kind: "drafts";
  key: string; flowId: string; flowLabel: string; serves?: string;
  messageId: string; messageLabel: string; count: number; expiresAt: string | null;
  subject: string | null; preview: string | null;
  /** The rendered email for this message, when the adapter reports one. */
  html: string | null;
};
export type FlowIssue = {
  kind: "problem" | "week-one";
  key: string; flowId: string; flowLabel: string; serves?: string; tone: Tone;
  text: string; mode: FlowStatus["mode"]; recommendation: Recommendation | null;
};
export type FlowLine = {
  id: string; label: string; serves?: string; channel: LifecycleFlow["channel"]; mode: FlowStatus["mode"];
  tone: Tone; headline: string; sentThisWeek: number; waiting: number;
};
export type Inbox = { drafts: DraftBatch[]; issues: FlowIssue[]; flows: FlowLine[] };

/** A preview short enough for two lines: whole words, an ellipsis when cut. */
const clip = (t: string | null, max = 170) => { if (!t) return null; const x = t.replace(/\s+/g, " ").trim(); return x.length <= max ? x : `${x.slice(0, x.lastIndexOf(" ", max)).replace(/[,.;:]$/, "")}…`; };

/** The flow a message belongs to: its own id, or one of its messages' ids. */
function flowOf(flows: LifecycleFlow[], messageId: string): LifecycleFlow | undefined {
  return flows.find((f) => f.id === messageId || f.messages.some((m) => m.id === messageId))
    ?? flows.find((f) => messageId.startsWith(`${f.id}-`));
}

export function buildInbox(snapshot: LifecycleSnapshot | null | undefined, statuses: FlowStatus[]): Inbox {
  const flows = snapshot?.flows ?? [];
  const drafts: DraftBatch[] = (snapshot?.workflows ?? []).filter((w) => (w.drafts ?? 0) > 0).map((w): DraftBatch => {
    const f = flowOf(flows, w.id);
    const m = f?.messages.find((x) => x.id === w.id) ?? (f?.messages.length === 1 ? f.messages[0] : undefined);
    return {
      kind: "drafts", key: `drafts:${w.id}`, flowId: f?.id ?? w.id, flowLabel: f?.label ?? w.label, serves: f?.serves ?? w.serves,
      messageId: w.id, messageLabel: w.label, count: w.drafts ?? 0, expiresAt: w.expiresAt ?? null,
      subject: w.preview?.subject ?? m?.subject ?? null, preview: clip(w.preview?.text ?? null), html: m?.html ?? null,
    };
  }).sort((a, b) => (a.expiresAt ?? "~").localeCompare(b.expiresAt ?? "~"));

  const issues: FlowIssue[] = [];
  for (const s of statuses) {
    if (s.facts.draftTotal) continue; // its drafts are already a card above
    if (s.working.tone === "warn" || s.working.tone === "bad")
      issues.push({ kind: "problem", key: `problem:${s.id}`, flowId: s.id, flowLabel: s.label, serves: s.serves, tone: s.working.tone,
        text: [s.working.headline, s.working.detail].filter(Boolean).join(". ").replace(/\.\./g, "."),
        mode: s.mode, recommendation: s.week.recommendation });
    else if (s.week.ready && s.mode === "draft")
      issues.push({ kind: "week-one", key: `week:${s.id}`, flowId: s.id, flowLabel: s.label, serves: s.serves, tone: "warn",
        text: `Week one is done. ${s.week.recommendation.reason}`, mode: s.mode, recommendation: s.week.recommendation });
  }

  return {
    drafts, issues,
    flows: statuses.map((s) => ({ id: s.id, label: s.label, serves: s.serves, channel: s.channel, mode: s.mode, tone: s.working.tone, headline: s.working.headline, sentThisWeek: s.facts.week.sent, waiting: s.facts.draftTotal })),
  };
}
