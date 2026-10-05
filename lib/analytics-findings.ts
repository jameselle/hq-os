// The CEO's open findings for one business, counted for the "Open CEO findings" number (Capacity and hiring).
// The CLI reads them from the running site's /api/status (lib/status.ts is server-only); the API route counts them directly.
import type { ARow } from "./analytics";
import type { Finding } from "./types";

const ORDER = ["critical", "attention", "decision"] as const;

/** Findings that are waiting on someone (info notes are left out), split by severity. */
export function countOpen(findings: Pick<Finding, "severity">[]): { total: number; bySeverity: ARow[] } {
  const open = findings.filter((f) => f.severity !== "info");
  return { total: open.length, bySeverity: ORDER.map((sev) => ({ label: sev, value: open.filter((f) => f.severity === sev).length })).filter((r) => r.value > 0) };
}

/** From the local HQ site. Null when it isn't running or answers for another business. */
export async function fetchOpenFindings(slug: string, base = "http://127.0.0.1:3150"): Promise<{ total: number; bySeverity: ARow[] } | null> {
  try {
    const r = await fetch(`${base}/api/status?business=${encodeURIComponent(slug)}`, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) return null;
    const s = await r.json() as { business?: { slug?: string } | null; findings?: Finding[] };
    return s.business?.slug === slug && Array.isArray(s.findings) ? countOpen(s.findings) : null;
  } catch { return null; }
}

/** Competitor page changes per ISO week, from changedetection.io's history of every watch tagged for the business
 *  (hq-<slug>). The API token is read from Keychain in-process. Null when the watcher isn't running or has no watches. */
export async function fetchCompetitorChanges(slug: string, weeks: string[], tz: string, isoWeek: (t: number, tz: string) => string): Promise<{ weeks: { week: string; value: number }[]; byCompetitor: ARow[]; watches: number } | null> {
  try {
    const { execFileSync } = await import("node:child_process");
    const { WATCHER_KEYCHAIN, WATCHER_URL, watchTag } = await import("./competitors");
    const key = execFileSync("/usr/bin/security", ["find-generic-password", "-s", WATCHER_KEYCHAIN, "-w"], { encoding: "utf8" }).trim();
    const get = async <T>(p: string): Promise<T> => {
      const r = await fetch(`${WATCHER_URL}${p}`, { headers: { "x-api-key": key }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw Error(`watcher ${r.status}`);
      return r.json() as Promise<T>;
    };
    const list = await get<Record<string, { title?: string }>>(`/api/v1/watch?tag=${encodeURIComponent(watchTag(slug))}`);
    const ids = Object.keys(list);
    if (!ids.length) return null;
    const by = new Map(weeks.map((w) => [w, 0]));
    const per = new Map<string, number>();
    const recent = new Set(weeks.slice(-4));
    for (const id of ids) {
      const hist = await get<Record<string, string>>(`/api/v1/watch/${id}/history`);
      // The first snapshot is the baseline, not a change.
      const times = Object.keys(hist).map(Number).filter(Number.isFinite).sort((a, b) => a - b).slice(1);
      const who = (list[id].title ?? "").split(":")[0].trim() || "Unnamed watch";
      for (const t of times) {
        const w = isoWeek(t * 1000, tz);
        if (by.has(w)) by.set(w, by.get(w)! + 1);
        if (recent.has(w)) per.set(who, (per.get(who) ?? 0) + 1);
      }
    }
    return { weeks: weeks.map((week) => ({ week, value: by.get(week)! })), byCompetitor: [...per].map(([label, value]) => ({ label: label.slice(0, 80), value })), watches: ids.length };
  } catch { return null; }
}
