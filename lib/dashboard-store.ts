// Runs a business's dashboard adapter and keeps its snapshot in this process's memory only. The snapshot names
// customers, so nothing here writes to disk: no snapshot file, no history, nothing for the backup to pick up.
// Contact status and notes go back through the adapter to the business's own records, addressed by a row's
// key from the snapshot HQ is holding, so a request can't write about anyone the dashboard didn't show.
import fs from 'node:fs';
import path from 'node:path';
import {businessDir} from './store';
import {execAdapter, readConnection} from './private-adapter';
import {CONTACT_STATUSES, dashboardProblems, type ContactStatus, type DashboardNote, type DashboardSnapshot} from './dashboard';

export const DASHBOARD_CONNECTION = 'dashboard-connection.json';
/** How long a snapshot is served before the adapter runs again. */
export const DASHBOARD_TTL_MS = 60_000;
const TIMEOUT_MS = 90_000;
const MAX_BUFFER = 16 * 1024 * 1024;

type Held = {at: number; snapshot: DashboardSnapshot};
const held = new Map<string, Held>();
const running = new Map<string, Promise<DashboardSnapshot>>();

export function dashboardConnected(slug: string): boolean {
  return fs.existsSync(path.join(businessDir(slug), DASHBOARD_CONNECTION));
}

function command(slug: string) {
  const config = readConnection(slug, DASHBOARD_CONNECTION);
  return {command: config.command, readOnly: config.readOnly !== false};
}

async function run(slug: string): Promise<DashboardSnapshot> {
  const {command: cmd, readOnly} = command(slug);
  const out = await execAdapter(cmd, {action: 'report'}, TIMEOUT_MS, MAX_BUFFER);
  const problems = dashboardProblems(out);
  if (problems.length) throw Error(`Dashboard adapter sent a snapshot HQ can't use: ${problems.slice(0, 3).join('; ')}`);
  const snapshot = out as DashboardSnapshot;
  // A read-only connection can't change anything, whatever the adapter says it supports.
  if (readOnly) snapshot.can = {contact: false, notes: false};
  held.set(slug, {at: Date.now(), snapshot});
  return snapshot;
}

/** The business's snapshot: the one held if it's fresh enough, else a new read (one at a time per business). */
export async function getDashboard(slug: string, opts: {force?: boolean; now?: number} = {}): Promise<{snapshot: DashboardSnapshot; heldFor: number}> {
  const now = opts.now ?? Date.now();
  const h = held.get(slug);
  if (h && !opts.force && now - h.at < DASHBOARD_TTL_MS) return {snapshot: h.snapshot, heldFor: now - h.at};
  let p = running.get(slug);
  if (!p) {
    p = run(slug).finally(() => running.delete(slug));
    running.set(slug, p);
  }
  return {snapshot: await p, heldFor: 0};
}

/** The snapshot held for a business, if it's fresh, without running the adapter. */
export function peekDashboard(slug: string, now = Date.now()): {snapshot: DashboardSnapshot; heldFor: number} | null {
  const h = held.get(slug);
  return h && now - h.at < DASHBOARD_TTL_MS ? {snapshot: h.snapshot, heldFor: now - h.at} : null;
}

/** Forget what's held (tests, and after switching connection). */
export function forgetDashboard(slug?: string) {
  if (slug) held.delete(slug); else held.clear();
}

type Row = {key: string; kind: 'churned' | 'pending'};

function findRow(slug: string, key: string): Row {
  const s = held.get(slug)?.snapshot;
  if (!s) throw Error('Load the dashboard first');
  if ((s.churned ?? []).some((r) => r.key === key)) return {key, kind: 'churned'};
  if ((s.pending ?? []).some((r) => r.key === key)) return {key, kind: 'pending'};
  throw Error('That customer is not on the dashboard any more. Refresh and try again.');
}

async function act(slug: string, input: object) {
  const {command: cmd} = command(slug);
  return execAdapter(cmd, input, 30_000);
}

export async function dashboardNotes(slug: string, key: string): Promise<DashboardNote[]> {
  const row = findRow(slug, key);
  if (!held.get(slug)!.snapshot.can.notes) throw Error("This business's dashboard has no notes");
  const out = await act(slug, {action: 'notes', ...row});
  if (!Array.isArray(out) || !out.every((n) => n && typeof n.id === 'string' && typeof n.note === 'string' && Number.isFinite(Date.parse(n.createdAt))))
    throw Error('Dashboard adapter sent notes HQ cannot read');
  return out as DashboardNote[];
}

export const MAX_NOTE = 2000;

export async function addDashboardNote(slug: string, key: string, note: string) {
  const row = findRow(slug, key);
  const text = note.trim();
  if (!text) throw Error('Write a note first');
  if (text.length > MAX_NOTE) throw Error(`Keep a note under ${MAX_NOTE} characters`);
  const s = held.get(slug)!.snapshot;
  if (!s.can.notes) throw Error("This business's dashboard has no notes");
  await act(slug, {action: 'add-note', ...row, note: text});
}

export async function setDashboardContact(slug: string, key: string, status: string) {
  const row = findRow(slug, key);
  if (!(CONTACT_STATUSES as readonly string[]).includes(status)) throw Error('Unknown contact status');
  const s = held.get(slug)!.snapshot;
  if (!s.can.contact) throw Error("This business's dashboard is read-only from HQ");
  await act(slug, {action: 'set-contact', ...row, status});
  // Show the change at once without rereading everything.
  for (const r of [...(s.churned ?? []), ...(s.pending ?? [])]) if (r.key === key) r.contact = status as ContactStatus;
}
