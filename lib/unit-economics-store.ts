// Unit economics for one business from its files: the ledger (with every include) and the growth scorecard's kept
// weeks. Server-only. The arithmetic is lib/unit-economics.ts; this only gathers the inputs and the records that
// prove the workflow runs (the HQ analytics refresh, the saved monthly briefs).
import fs from "node:fs";
import path from "node:path";

import { loadLedger } from "./ledger-spend";
import { scorecardState } from "./scorecard";
import { businessDir, getProfile, ledgerPath } from "./store";
import { monthOfDate, unitEconomics, type OneOff, type ScoreWeek, type UnitEconomics } from "./unit-economics";

/** The scorecard's weeks, oldest first: the kept history merged with the live snapshot's weeks. */
function scoreWeeks(slug: string, now: Date): ScoreWeek[] {
  try {
    const s = scorecardState(slug, now);
    const by = new Map<string, ScoreWeek>();
    for (const h of s.history) by.set(h.week, { week: h.week, metrics: h.metrics });
    // Per number: the live snapshot wins where it has a reading; a kept week fills what it left out.
    for (const w of s.snapshot?.weeks ?? []) {
      const kept = by.get(w.week)?.metrics ?? [];
      const ids = new Set([...kept, ...w.metrics].map((m) => m.id));
      const metrics = [...ids].map((id) => {
        const live = w.metrics.find((m) => m.id === id), old = kept.find((m) => m.id === id);
        return live && live.value !== null ? live : old ?? live!;
      });
      by.set(w.week, { week: w.week, metrics, extraSpend: w.extraSpend });
    }
    return [...by.values()].sort((a, b) => a.week.localeCompare(b.week));
  } catch { return []; }
}

export function loadUnitEconomics(slug: string, now: Date = new Date()): UnitEconomics | null {
  const profile = getProfile(slug);
  if (!profile) return null;
  const ledger = ledgerPath(slug);
  const ledgerText = fs.existsSync(ledger) ? loadLedger(ledger) : "";
  return unitEconomics({ currency: profile.currency, ledgerText, weeks: scoreWeeks(slug, now), now, timezone: profile.timezone, oneOffs: readOneOffs(slug) });
}

/** The owner's one-off costs (finance/one-offs.json): kept in the numbers, not flagged as jumps. */
export function readOneOffs(slug: string): OneOff[] {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(businessDir(slug), "finance", "one-offs.json"), "utf8"));
    return Array.isArray(v) ? v.filter((o) => o && /^\d{4}-\d{2}$/.test(o.month) && typeof o.account === "string" && typeof o.reason === "string") : [];
  } catch { return []; }
}

/** Mark a cost line one-off (re-marking the same month and account updates the reason). */
export function addOneOff(slug: string, o: OneOff): OneOff[] {
  if (!/^\d{4}-\d{2}$/.test(o.month) || !o.account?.trim() || !o.reason?.trim()) throw Error("a one-off needs a month (YYYY-MM), an account and a reason");
  const list = readOneOffs(slug).filter((x) => !(x.month === o.month && x.account.toLowerCase() === o.account.toLowerCase()));
  list.push({ month: o.month, account: o.account.trim(), reason: o.reason.trim().slice(0, 200) });
  const dir = path.join(businessDir(slug), "finance");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "one-offs.json"), JSON.stringify(list, null, 2) + "\n", { mode: 0o600 });
  return list;
}

export const BRIEF_HEADING = "# Unit economics";

/** Saved monthly briefs (finance plans that start with the unit economics heading), newest first, by file time. */
export function unitBriefs(slug: string): { file: string; at: string }[] {
  const dir = path.join(businessDir(slug), "plans", "finance");
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).flatMap((f) => {
      const file = path.join(dir, f);
      try {
        const head = fs.readFileSync(file, "utf8").slice(0, 200);
        return head.startsWith(BRIEF_HEADING) ? [{ file, at: fs.statSync(file).mtime.toISOString() }] : [];
      } catch { return []; }
    }).sort((a, b) => b.at.localeCompare(a.at));
  } catch { return []; }
}

/** When HQ last worked the numbers out: its own analytics snapshot, if it measured the month's costs. */
export function unitComputedAt(slug: string): string | null {
  try {
    const hq = JSON.parse(fs.readFileSync(path.join(businessDir(slug), "analytics-hq.json"), "utf8")) as { observedAt?: string; metrics?: { id: string; value: number | null }[] };
    return hq.metrics?.some((m) => m.id === "monthly_costs" && m.value !== null) ? hq.observedAt ?? null : null;
  } catch { return null; }
}

/** The facts the workflow evidence reads (lib/workflow-evidence.ts). */
export function unitEvidenceFacts(slug: string, now: Date = new Date()) {
  const profile = getProfile(slug);
  if (!profile) return null;
  const u = loadUnitEconomics(slug, now);
  if (!u || !u.months.length) return null;
  return {
    bothMonths: u.bothMonths, latest: u.latest?.month ?? null, thisMonth: monthOfDate(now, profile.timezone || "UTC"),
    computedAt: unitComputedAt(slug), briefAt: unitBriefs(slug)[0]?.at ?? null,
  };
}
