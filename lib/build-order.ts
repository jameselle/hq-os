// The Workflows tab's build order, with where the current business stands on each step, read from its own records:
// done, in part, or not yet, and the evidence behind it. Server-only.
import { listExperiments } from "./experiments";
import { signalFeed } from "./brain-store";
import { listRuns, readConfig, readRouting } from "./playbook-store";
import { DEPARTMENTS } from "./registry";
import { scorecardState } from "./scorecard";
import { deptLevers } from "./workflows";

export type BuildState = "done" | "partial" | "todo";
export type BuildStep = { title: string; what: string; state: BuildState; evidence: string };

/** The five departments the build order starts signals with. */
export const FIRST_SIGNALLERS = ["competitors", "support", "data", "engineering", "content"];
const label = (n: string) => (n === "ceo" ? "CEO" : DEPARTMENTS.find((d) => d.slug === n)?.label ?? n);

export function buildOrder(slug: string | null, now = new Date()): BuildStep[] {
  const safe = <T>(f: () => T, fallback: T): T => { try { return f(); } catch { return fallback; } };
  const sc = slug ? safe(() => scorecardState(slug, now), null) : null;
  const feed = slug ? safe(() => signalFeed(slug, 0), []) : [];
  const cfg = slug ? safe(() => readConfig(slug), null) : null;
  const runs = slug ? safe(() => listRuns(slug), []) : [];
  const routing = slug ? safe(() => readRouting(slug), null) : null;
  const exps = slug ? safe(() => listExperiments(slug), []).filter((e) => e.run) : [];
  const recent = (iso?: string, days = 14) => Boolean(iso) && now.getTime() - Date.parse(iso!) < days * 864e5;

  const weeks = sc?.snapshot ? new Set([...sc.history.map((h) => h.week), ...sc.snapshot.weeks.map((w) => w.week)]).size : 0;
  const leverDepts = DEPARTMENTS.filter((d) => deptLevers(d.slug).length).length;
  const sent = new Set(feed.filter((s) => recent(s.created)).map((s) => s.from));
  const missingSenders = FIRST_SIGNALLERS.filter((d) => !sent.has(d));
  const finished = runs.filter((r) => ["ready", "applied"].includes(r.status)).length;
  const judged = exps.filter((e) => e.status !== "running");

  return [
    {
      title: "Growth scorecard per business",
      what: "A read-only data source in each profile (subscriptions or store receipts, product usage, web analytics). Metrics per lever: new customers and MRR by channel; churn, failed-payment recovery and activation; upgrades and net revenue retention; cost to win and payback.",
      state: !sc?.connected && !sc?.demo ? "todo" : sc.snapshot && !sc.stale && !sc.failed ? "done" : "partial",
      evidence: !sc ? "No business picked." : !sc.connected && !sc.demo ? "No scorecard adapter connected." : sc.snapshot ? `Reports ${weeks} weeks, read ${sc.snapshot.observedAt.slice(0, 10)}${sc.stale ? ", but it's stale" : ""}${sc.failed ? ", and the last refresh failed" : ""}.` : "Connected but hasn't reported yet.",
    },
    {
      title: "Lever tags in the registry",
      what: "Every department declares the levers it owns or contributes to, so each tab shows its work on Get, Keep and Expand.",
      state: leverDepts === DEPARTMENTS.length ? "done" : "partial",
      evidence: `${leverDepts} of ${DEPARTMENTS.length} departments show their levers on their own page, taken from the workflows they own or help with.`,
    },
    {
      title: "Signals",
      what: "Departments write dated signal files with evidence links under the business's folder. Start with the five that already produce output: Market & Competitors, Support, Data, Product and Content.",
      state: !slug || !sent.size ? "todo" : missingSenders.length ? "partial" : "done",
      evidence: !slug ? "No business picked." : `${sent.size ? `In the last 14 days: ${[...sent].map(label).join(", ")}.` : "No signals in the last 14 days."}${missingSenders.length ? ` Not yet: ${missingSenders.map(label).join(", ")}.` : ""}`,
    },
    {
      title: "Playbooks",
      what: "Each workflow becomes a playbook: trigger (a signal or a schedule), owner, ordered steps (department + skill), required guard-rail steps (Legal for anything customer-facing), output and target metric.",
      state: !cfg || cfg.mode === "off" ? (runs.length ? "partial" : "todo") : finished ? "done" : "partial",
      evidence: !cfg ? "No business picked." : `Mode ${cfg.mode === "ask" ? "ask me" : cfg.mode}. ${runs.length} run${runs.length === 1 ? "" : "s"} so far, ${finished} with a plan ready or applied.`,
    },
    {
      title: "CEO routing",
      what: "The weekly review starts from the weakest lever, picks the playbooks that move it, and names one owner plus contributors for each.",
      state: !routing ? "todo" : recent(routing.at, 8) ? "done" : "partial",
      evidence: !routing ? "Not routed yet: it runs with the daily playbook tick." : `${routing.week}: ${routing.weakest ? `${routing.weakest.label.toLowerCase()} is weakest; ${routing.picks.length} playbook${routing.picks.length === 1 ? "" : "s"} picked, each with an owner and contributors` : "no weak lever"}${recent(routing.at, 8) ? "" : ". Older than a week"}.`,
    },
    {
      title: "Learning",
      what: "Every playbook run logs its result in the experiment log and the vault, so the next review knows what worked and nobody reruns a failed test.",
      state: judged.length ? "done" : exps.length ? "partial" : "todo",
      evidence: judged.length ? `${judged.length} playbook experiment${judged.length === 1 ? "" : "s"} judged (${judged.map((e) => e.status).join(", ")}); lessons are in the brain.`
        : exps.length ? `${exps.length} applied run${exps.length === 1 ? "" : "s"} being measured; the first verdict is due ${exps.map((e) => e.reviewAt ?? "").sort()[0]?.slice(0, 10) || "soon"}.` : "No applied playbook runs yet, so nothing to judge.",
    },
  ];
}
