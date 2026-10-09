// Which departments are built out for a business: each one needs evidence on disk that it actually works for that
// business (a connected engine, a brand kit, posts read back from a platform, rivals watched, ledger entries), not just
// tools installed. The side nav lights these up and dims the rest. Server-only.
import fs from "node:fs";
import path from "node:path";

import { analyticsState } from "./analytics";
import { loadLedger } from "./ledger-spend";
import { readBrand } from "./brand";
import { lifecycleState } from "./lifecycle";
import { scorecardState } from "./scorecard";
import { businessDir, getProfile, ledgerPath } from "./store";
import { supportState } from "./support";
import { readPartners } from "./partner-store";
import { workflowEvidence } from "./workflow-evidence";
import { WORKFLOWS } from "./workflows";

const safe = <T>(f: () => T, fallback: T): T => { try { return f(); } catch { return fallback; } };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Department slug → why it counts as built out, for the departments that are. */
export function builtDepartments(slug: string): Record<string, string> {
  const profile = getProfile(slug);
  if (!profile) return {};
  const out: Record<string, string> = {};

  const life = safe(() => lifecycleState(slug), null);
  const flows = life?.connected ? life.snapshot?.flows?.length ?? 0 : 0;
  if (flows) out.email = `${plural(flows, "automated flow")} connected`;

  if (safe(() => readBrand(slug), null)) out.design = "Brand kit and email designs";

  const sc = safe(() => scorecardState(slug), null), an = safe(() => analyticsState(slug), null);
  if (sc?.connected || an?.connected || (profile.demo && (sc?.snapshot || an?.snapshot))) out.data = [sc?.connected || profile.demo ? "growth scorecard" : "", an?.connected || profile.demo ? "analytics" : ""].filter(Boolean).join(" and ").replace(/^./, (c) => c.toUpperCase()) + " connected";

  const posts = safe(() => fs.readFileSync(path.join(businessDir(slug), "published.jsonl"), "utf8").split("\n").filter((l) => /"status":"published"/.test(l)).length, 0);
  if (posts) out.content = `${plural(posts, "post")} published from HQ`;

  const watched = (profile.competitors ?? []).filter((c) => (c.watch ?? []).length).length;
  if (watched) out.competitors = `${plural(watched, "rival")} watched`;

  // The whole ledger, with its includes (the finance sync writes synced.beancount).
  const entries = safe(() => (loadLedger(ledgerPath(slug)).match(/^\d{4}-\d{2}-\d{2}\s+(\*|!|txn)\s/gm) ?? []).length, 0);
  if (entries) out.finance = `${plural(entries, "ledger entry", "ledger entries")}`;

  const support = safe(() => supportState(slug), null);
  if (support?.snapshot) out.support = `${plural(support.snapshot.waiting.length, "conversation")} waiting; themes and reply times read daily`;

  // Any department that owns a workflow proven live for this business (the same proof as the Workflows page), so a
  // department built later lights up without a rule of its own here. Partial workflows don't count.
  const evidence = safe(() => workflowEvidence(slug).evidence, {} as ReturnType<typeof workflowEvidence>["evidence"]);
  const live: Record<string, string[]> = {};
  for (const w of WORKFLOWS) if (w.owner !== "ceo" && evidence[w.title]?.state === "live") (live[w.owner] ??= []).push(w.title);
  for (const [dept, titles] of Object.entries(live)) out[dept] ??= `${plural(titles.length, "workflow")} live: ${titles.join(", ")}`;

  // Sales & Partnerships is set up once its pipeline is in use: partners shortlisted or further along (never an avoid
  // one) with outreach ready to send or already sent. A live partner workflow, when there is one, gives the stronger reason above.
  const pipeline = safe(() => readPartners(slug).partners, []);
  const partners = pipeline.filter((x) => x.compliance.status !== "avoid");
  const worked = partners.filter((x) => x.status !== "prospect" && x.status !== "declined" && x.status !== "ended");
  const drafts = worked.reduce((n, x) => n + x.drafts.length, 0);
  const contacted = worked.filter((x) => x.drafts.some((d) => d.status === "sent-by-owner" || d.status === "sent-by-hq") || !["prospect", "shortlisted"].includes(x.status)).length;
  if (worked.length && (drafts || contacted)) {
    out.sales ??= `${plural(pipeline.length, "partner")} in the pipeline, ${worked.length} shortlisted or further` + (contacted ? `, ${contacted} contacted` : `, ${plural(drafts, "outreach draft")} ready`);
  }

  return out;
}
