// Operations' own records for one business, read from its vault: runbooks (playbooks titled "Runbook: …")
// and the newest vendor review and risk register (Operations plans saved with
// `save-plan <slug> operations <file> --title "vendor review"` or `--title "risk register"`). Server-only.
// Feeds the "Runbooks, vendors and risks" workflow evidence and the analytics refresh.
import fs from "node:fs";
import path from "node:path";

import { listNotes } from "./brain-store";
import { getProfile, vaultRoot } from "./store";

/** A playbook is a runbook when its title starts with the word "Runbook". */
export const RUNBOOK = /^runbook\b/i;
/** A vendor review or risk register older than this no longer counts as current. */
export const OPS_REVIEW_DAYS = 90;

export type OpsRecords = {
  runbooks: number;
  /** ISO time of the newest runbook. */
  lastRunbook?: string;
  /** The newest vendor review / risk register within OPS_REVIEW_DAYS (its date as the vault names it, in the
   *  business's own timezone, and the file's ISO time), else null. */
  vendorReview: OpsDoc | null;
  riskRegister: OpsDoc | null;
};

export type OpsDoc = { day: string; at: string };

const PLAN = /^(\d{4}-\d{2}-\d{2}) .*\.md$/;

/** The newest Operations plan whose file name contains `words`, if saved within the window. */
function newestPlan(dir: string, words: RegExp, now: number): OpsDoc | null {
  let best: OpsDoc | null = null;
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const m = PLAN.exec(f);
    if (!m || !words.test(f)) continue;
    const day = Date.parse(`${m[1]}T00:00:00Z`);
    if (!Number.isFinite(day) || now - day > OPS_REVIEW_DAYS * 86400e3) continue;
    const at = new Date(fs.statSync(path.join(dir, f)).mtimeMs).toISOString();
    if (!best || at > best.at) best = { day: m[1], at };
  }
  return best;
}

/** Unknown business, or nothing on record → null. */
export function opsRecords(slug: string, now: Date = new Date()): OpsRecords | null {
  const profile = getProfile(slug);
  if (!profile) return null;
  const root = vaultRoot(profile);
  let runbooks: { mtime: number }[] = [];
  try {
    runbooks = listNotes("business", root).filter((n) => n.meta.type === "playbook" && n.meta.status === "active" && RUNBOOK.test(n.meta.title));
  } catch { /* no vault yet */ }
  const plans = path.join(root, "Departments", "Operations", "Plans");
  const vendorReview = newestPlan(plans, /vendor review/i, now.getTime());
  const riskRegister = newestPlan(plans, /risk register/i, now.getTime());
  if (!runbooks.length && !vendorReview && !riskRegister) return null;
  const last = runbooks.length ? new Date(Math.max(...runbooks.map((n) => n.mtime))).toISOString() : undefined;
  return { runbooks: runbooks.length, lastRunbook: last, vendorReview, riskRegister };
}
