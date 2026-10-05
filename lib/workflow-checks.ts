// Workflow checks: proof for workflows that aren't lifecycle messages (search pages, measurement, content…).
// A business's private adapter ($HQ_DATA/businesses/<slug>/workflow-checks-connection.json) looks at live facts
// (a page is served, a sitemap lists N pages, a scorecard number exists) and answers pass/fail per check. HQ
// validates and rebuilds the answer, and the Workflows tab marks a workflow live only when every one of its
// checks passed within the last 8 days. A check that never ran is not a pass.
import fs from 'node:fs';
import path from 'node:path';
import { businessDir, getProfile } from './store';
import { execAdapter, readConnection, writePrivateJson } from './private-adapter';
import { WORKFLOWS } from './workflows';

export type WorkflowCheck = { label: string; ok: boolean; detail?: string };
export type WorkflowChecks = { version: 1; observedAt: string; workflows: { title: string; checks: WorkflowCheck[] }[] };

export const CHECKS_FILE = 'workflow-checks.json';
export const CHECKS_CONNECTION = 'workflow-checks-connection.json';
export const CHECKS_MAX_AGE_MS = 8 * 86400000;

const TITLES = new Set(WORKFLOWS.map((w) => w.title));
/** Short, plain text: no email addresses, no URLs carrying a query string. */
const plain = (s: unknown, max: number) => typeof s === 'string' && s.trim().length > 0 && s.length <= max
  && !/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(s) && !/https?:\/\/\S*\?/.test(s);

export function validChecks(v: unknown): v is WorkflowChecks {
  const x = v as WorkflowChecks;
  return Boolean(x && x.version === 1 && typeof x.observedAt === 'string' && Number.isFinite(Date.parse(x.observedAt))
    && Array.isArray(x.workflows) && x.workflows.length <= 60
    && x.workflows.every((w) => TITLES.has(w.title) && Array.isArray(w.checks) && w.checks.length >= 1 && w.checks.length <= 12
      && w.checks.every((c) => plain(c.label, 120) && typeof c.ok === 'boolean' && (c.detail === undefined || plain(c.detail, 200)))));
}

export function workflowChecksState(slug: string, now = Date.now()) {
  if (!getProfile(slug)) throw Error('Unknown business');
  const dir = businessDir(slug);
  const connected = fs.existsSync(path.join(dir, CHECKS_CONNECTION));
  let snapshot: WorkflowChecks | null = null;
  try { const raw = JSON.parse(fs.readFileSync(path.join(dir, CHECKS_FILE), 'utf8')); if (validChecks(raw)) snapshot = raw; } catch { /* none yet */ }
  const age = snapshot ? now - Date.parse(snapshot.observedAt) : Infinity;
  return { connected, snapshot, stale: age < 0 || age > CHECKS_MAX_AGE_MS };
}

export async function runWorkflowChecks(slug: string) {
  const config = readConnection(slug, CHECKS_CONNECTION);
  const value = await execAdapter(config.command, { action: 'check' });
  if (!validChecks(value)) throw Error('Invalid workflow checks');
  // Rebuild from allowed fields only.
  const clean: WorkflowChecks = {
    version: 1, observedAt: value.observedAt,
    workflows: value.workflows.map((w) => ({ title: w.title, checks: w.checks.map((c) => ({ label: c.label, ok: c.ok, ...(c.detail ? { detail: c.detail } : {}) })) })),
  };
  writePrivateJson(path.join(businessDir(slug), CHECKS_FILE), clean);
  return workflowChecksState(slug);
}
