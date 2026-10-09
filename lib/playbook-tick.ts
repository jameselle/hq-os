// The daily playbook tick for one business (run from com.hq.scorecard after analytics):
//   1. file this week's automatic signals (lib/signal-writers.ts)
//   2. route: the weakest lever and the playbooks that move it (lib/levers.ts), saved for the CEO and the page
//   3. queue every playbook whose trigger fired (new signals, schedules, routing, alarms), cooldowns honoured
//   4. auto mode only: do up to `perDay` queued runs headless (lib/playbook-runner.ts)
//   5. judge applied runs whose two weeks are up, and file each lesson (lib/playbook-store.ts)
// Mode off still writes signals, routing and verdicts; it only stops queueing. `tick --all` covers only businesses
// with playbook settings. Server-only.
import fs from "node:fs";
import path from "node:path";

import { analyticsAlarms, analyticsBoard, isoWeek, type BoardMetric } from "./analytics";
import { signalFeed } from "./brain-store";
import { listExperiments } from "./experiments";
import { routePlaybooks, weakestLever, type Pick } from "./levers";
import { duePlaybooks, type Playbook, type Reason } from "./playbooks";
import { executeRun, type RunWriter } from "./playbook-runner";
import { lastRunBySlug, listRuns, mirrorRuns, playbooksDir, queueRun, readConfig, readState, reviewExperiments, writeRouting, writeState, type Routing, type Run } from "./playbook-store";
import { scorecardState } from "./scorecard";
import { writeWeeklySignals, type WriteOutcome } from "./signal-writers";
import { getProfile, listBusinesses } from "./store";

export type TickResult = {
  slug: string; mode: string; signals: WriteOutcome[]; routing: Routing; queued: { id: string; workflow: string; reason: Reason["kind"] }[];
  ran: { id: string; status: string; why?: string; costUsd?: number }[]; judged: { id: number; workflow?: string; verdict: string }[]; error?: string;
};

/** Signals seen for the first time: anything not in state.seen. On the very first tick, only the last 7 days count. */
function newSignals(slug: string, now: Date) {
  const feed = signalFeed(slug, 1500);
  const st = readState(slug);
  const seen = new Set(st.seen);
  const first = !st.lastTick;
  const cutoff = new Date(now.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  const fresh = feed.filter((s) => !seen.has(s.rel) && (!first || (s.created ?? "") >= cutoff));
  return { fresh, seenAll: [...st.seen, ...feed.filter((s) => !seen.has(s.rel)).map((s) => s.rel)] };
}

export function routingFor(slug: string, now: Date, skip: string[]): Routing {
  const p = getProfile(slug)!;
  let weakest = null as ReturnType<typeof weakestLever>;
  try { const s = scorecardState(slug, now); weakest = s.snapshot ? weakestLever(s.snapshot.weeks, s.snapshot.currency) : null; } catch { weakest = null; }
  let metrics: BoardMetric[] = [];
  try { metrics = analyticsBoard(slug, now).metrics; } catch { metrics = []; }
  const picks: Pick[] = routePlaybooks(weakest, {
    readings: metrics.map((m) => ({ id: m.id, status: m.status, change: m.change, better: m.def.better, workflows: m.workflows })),
    tried: listExperiments(slug).map((e) => ({ workflow: e.workflow, status: e.status, endedAt: e.endedAt })), skip, now,
  });
  return { at: now.toISOString(), week: isoWeek(now, p.timezone || "UTC"),
    weakest: weakest ? { lever: weakest.lever, label: weakest.label, why: weakest.why, workflow: weakest.workflow, metric: weakest.metric } : null, picks };
}

export async function playbookTick(slug: string, o: { now?: Date; dryRun?: boolean; runWriter?: RunWriter; claude?: string | null; say?: (s: string) => void } = {}): Promise<TickResult> {
  const now = o.now ?? new Date(), say = o.say ?? (() => {});
  const cfg = readConfig(slug);
  const res: TickResult = { slug, mode: cfg.mode, signals: [], routing: { at: now.toISOString(), week: "", weakest: null, picks: [] }, queued: [], ran: [], judged: [] };
  try {
    res.signals = await writeWeeklySignals(slug, now, { dryRun: o.dryRun });
    res.routing = routingFor(slug, now, cfg.skip);
    if (!o.dryRun) writeRouting(slug, res.routing);

    const { fresh, seenAll } = newSignals(slug, now);
    let alarms: { workflow: string; metric: string; value: number }[] = [];
    try { alarms = analyticsAlarms(analyticsBoard(slug, now).metrics).map((a) => ({ workflow: a.workflow, metric: a.id, value: a.value })); } catch { alarms = []; }
    const runs = listRuns(slug);
    const due: { playbook: Playbook; reason: Reason }[] = duePlaybooks({
      newSignals: fresh, lastRun: lastRunBySlug(runs), routed: res.routing.picks.map((x) => ({ slug: x.slug, why: x.why })), alarms, skip: cfg.skip, now,
    });
    if (cfg.mode !== "off") {
      // The owner's queue stays short: the most pressing first (routing, alarms, signals, then schedules; the weakest
      // lever's playbooks ahead within each), and only up to the backlog. The rest wait for a later tick.
      const rank = { route: 0, alarm: 1, signal: 2, schedule: 3, owner: 4 } as const;
      const weak = res.routing.weakest?.lever;
      due.sort((a, b) => rank[a.reason.kind] - rank[b.reason.kind] || Number(b.playbook.levers.includes(weak as never)) - Number(a.playbook.levers.includes(weak as never)));
      const waiting = runs.filter((r) => r.status === "queued" || r.status === "running" || r.status === "ready").length;
      due.splice(Math.max(0, cfg.backlog - waiting));
      for (const d of due) {
        if (o.dryRun) { res.queued.push({ id: `(dry run) ${d.playbook.slug}`, workflow: d.playbook.title, reason: d.reason.kind }); continue; }
        const r = queueRun(slug, d.playbook, d.reason, now);
        if (r) { res.queued.push({ id: r.id, workflow: r.workflow, reason: d.reason.kind }); say(`${slug}: queued ${r.workflow} (${d.reason.kind})`); }
      }
    }
    if (!o.dryRun) writeState(slug, { seen: seenAll, lastTick: now.toISOString() });

    if (cfg.mode === "auto" && !o.dryRun) {
      const today = now.toISOString().slice(0, 10);
      const started = listRuns(slug).filter((r) => r.startedAt?.startsWith(today)).length;
      const queue = listRuns(slug).filter((r) => r.status === "queued").reverse(); // oldest first
      for (const r of queue.slice(0, Math.max(0, cfg.perDay - started))) {
        say(`${slug}: running ${r.workflow}`);
        const done: Run = await executeRun(slug, r.id, { runWriter: o.runWriter, claude: o.claude });
        res.ran.push({ id: done.id, status: done.status, why: done.why, costUsd: done.costUsd });
      }
    }

    if (!o.dryRun) res.judged = reviewExperiments(slug, now).map((e) => ({ id: e.id, workflow: e.workflow, verdict: e.status }));
    if (!o.dryRun) mirrorRuns(slug);
  } catch (e) { res.error = (e as Error).message; }
  return res;
}

/** The businesses named, or with "all" every business that has playbook settings (any mode, set with
 *  `playbook mode`). A business that never touched playbooks is left alone: no signals, no routing. */
export async function tickAll(slugs: string[] | "all", o: Parameters<typeof playbookTick>[1] = {}): Promise<TickResult[]> {
  const list = slugs === "all" ? listBusinesses().profiles.map((p) => p.slug).filter((s) => fs.existsSync(path.join(playbooksDir(s), "config.json"))) : slugs;
  const out: TickResult[] = [];
  for (const s of list) out.push(await playbookTick(s, o));
  return out;
}
