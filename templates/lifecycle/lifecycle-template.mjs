#!/usr/bin/env node
// HQ's template lifecycle adapter. Every person and number here is INVENTED: it is the runnable
// example of the contract in docs/guides/lifecycle.md, and the starting point for a real adapter.
// Copy it to $HQ_DATA/businesses/<slug>/lifecycle-adapter.mjs, then replace the three marked
// functions (loadStore, saveStore, render) with reads and writes against the business's own engine.
//
// stdin: one JSON object, at most 2 KB
//   {"action":"report"}                                   aggregates only: no emails, names or ids
//   {"action":"approve","workflow":"<message id>","before":"<ISO>"}   drafts of that message planned up to `before`
//   {"action":"reject","workflow":"<message id>","before":"<ISO>"}    the same drafts, never sent (reason "owner said no")
//   {"action":"test","workflow":"<message id>"}           one copy to the owner only, marked [Test]
//   {"action":"mode","workflow":"<flow id>","mode":"off|draft|auto"}
//   {"action":"pause"} / {"action":"resume"}              every flow off / back to draft (never straight to auto)
// stdout: one version-1 snapshot (lib/lifecycle.ts LifecycleSnapshot). Failures: exit 1, one line on
// stderr naming the step, never a credential or a provider's response body.
//
// Naming contract: flow ids are lower-case words joined by hyphens; a message id is its flow id or
// the flow id + "-" + a step; `serves` is a workflow title from HQ's catalogue.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY = 86400e3;
const HOUR = 3600e3;

/** The flows this business runs. A real adapter usually keeps this list in code too. */
export const FLOWS = [
  {
    id: 'onboarding', label: 'Getting-started emails', serves: 'Onboarding to first value', channel: 'email', holdoutPct: 20,
    trigger: 'A new signup who has not used the product yet (day 0 and day 2)',
    messages: [
      { id: 'onboarding-day-0', label: 'Day 0: first step', subject: 'Your account is ready', delayHours: 1, expiresHours: 36 },
      { id: 'onboarding-day-2', label: 'Day 2: a worked example', subject: 'One example, start to finish', delayHours: 48, expiresHours: 36 },
    ],
    outcomes: [{ label: 'Used the product', window: '7 days' }],
  },
  {
    id: 'checkout', label: 'Abandoned checkout', serves: 'Abandoned checkout recovery', channel: 'email', holdoutPct: 20,
    trigger: 'Someone who started a checkout and has no paid plan 3 hours later (one email ever)',
    messages: [{ id: 'checkout', label: 'Abandoned checkout', subject: 'Did something stop your checkout?', delayHours: 3, expiresHours: 72 }],
    outcomes: [{ label: 'Bought a plan', window: '1 day' }, { label: 'Bought a plan', window: '7 days' }],
  },
  {
    id: 'trial', label: 'Trial invite', serves: "Trial that didn't convert", channel: 'email', holdoutPct: 20,
    trigger: 'A free signup 4 to 10 days in who never started a trial, and a trial that ended unpaid (one email each)',
    messages: [
      { id: 'trial-invite', label: 'Invite to the free trial', subject: 'Try the full plan free for 7 days', delayHours: 96, expiresHours: 72 },
      { id: 'trial-ended', label: 'Trial ended unpaid', subject: 'Your trial ended. Here is what you keep', delayHours: 24, expiresHours: 72 },
    ],
    outcomes: [{ label: 'Started a trial', window: '7 days' }, { label: 'Paid', window: '14 days' }],
  },
  {
    id: 'annual', label: 'Yearly offer', serves: 'Monthly to annual', channel: 'email', holdoutPct: 20,
    trigger: 'An active monthly payer in month two or three who used the product in the last 14 days (one email ever)',
    messages: [{ id: 'annual', label: 'Switch to yearly', subject: 'Pay yearly and save on every month', delayHours: 0, expiresHours: 72 }],
    outcomes: [{ label: 'Switched to yearly', window: '14 days' }],
  },
];

// ---------------------------------------------------------------- replace these three

/** The business's lifecycle records. Here: a JSON file of synthetic people, made on first run. */
export function loadStore(file, now) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  return seed(now);
}
export function saveStore(file, store) { if (file) fs.writeFileSync(file, JSON.stringify(store, null, 1)); }
/** The exact email a customer would get, rendered by the same code that sends it. */
export function render(message) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<!doctype html><html><body style="font-family:system-ui;background:#f4f5f7;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:8px;padding:24px">`
    + `<h1 style="font-size:20px">${esc(message.subject)}</h1><p>Hi Sam,</p><p>This is the template adapter's example of "${esc(message.label)}". A real adapter renders the business's own email here.</p>`
    + `<p style="font-size:12px;color:#666"><a href="#">Unsubscribe</a></p></div></body></html>`;
}

// ---------------------------------------------------------------- synthetic data

/** Deterministic: the same `now` always seeds the same people. */
function seed(now) {
  const rows = [];
  let h = 7;
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) + 3266489909 >>> 0) % 1000) / 1000;
  const start = now - 9 * DAY;
  for (let i = 0; i < 40; i++) {
    const flow = FLOWS[i % 4 === 3 ? 1 : 0];
    const at = start + rand() * 9 * DAY;
    const holdout = rand() < flow.holdoutPct / 100;
    for (const m of flow.messages) {
      const due = at + m.delayHours * HOUR;
      if (due > now) continue;
      const row = { person: `p${i}`, flow: flow.id, message: m.id, enteredAt: new Date(at).toISOString(), dueAt: new Date(due).toISOString(), holdout, test: false };
      if (holdout) row.status = 'held-out';
      else if (now - due < 20 * HOUR) row.status = 'draft';
      else if (rand() < 0.08) { row.status = 'skipped'; row.reason = 'already used the product'; }
      else { row.status = 'sent'; row.sentAt = new Date(due + 2 * HOUR).toISOString(); row.delivery = rand() < 0.05 ? 'bounced' : rand() < 0.2 ? 'clicked' : 'delivered'; }
      row.outcome = rand() < (holdout ? 0.25 : 0.35);
      rows.push(row);
      if (row.status !== 'sent') break;
    }
  }
  // The trial and yearly flows are seeded after the first two, so the people above stay exactly the same.
  for (let i = 0; i < 16; i++) {
    const flow = FLOWS[i % 2 ? 3 : 2];
    const m = flow.messages[0];
    const due = start + rand() * 9 * DAY;
    const holdout = rand() < flow.holdoutPct / 100;
    const row = { person: `q${i}`, flow: flow.id, message: m.id, enteredAt: new Date(due).toISOString(), dueAt: new Date(due).toISOString(), holdout, test: false };
    if (holdout) row.status = 'held-out';
    else if (now - due < 20 * HOUR) row.status = 'draft';
    else { row.status = 'sent'; row.sentAt = new Date(due + 2 * HOUR).toISOString(); row.delivery = rand() < 0.2 ? 'clicked' : 'delivered'; }
    row.outcome = rand() < (holdout ? 0.1 : 0.22);
    rows.push(row);
  }
  return { owner: 'owner', modes: { onboarding: 'draft', checkout: 'draft', trial: 'draft', annual: 'draft' }, startsOn: new Date(start).toISOString().slice(0, 10), rows, unsubscribes: { onboarding: 1, checkout: 0, trial: 0, annual: 0 } };
}

// ---------------------------------------------------------------- the contract

const dayOf = (iso, tz) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });

/** Drafts nobody approved in time never go out late. */
function expire(store, now) {
  for (const r of store.rows) {
    const m = FLOWS.flatMap((f) => f.messages).find((x) => x.id === r.message);
    if (r.status === 'draft' && m && Date.parse(r.dueAt) + m.expiresHours * HOUR < now) { r.status = 'expired'; r.reason = 'not approved in time'; }
  }
}

export function report(store, now, tz = 'UTC') {
  expire(store, now);
  const rows = store.rows.filter((r) => !r.test);
  const today = dayOf(new Date(now).toISOString(), tz);
  const days = Array.from({ length: 60 }, (_, i) => dayOf(new Date(now - (59 - i) * DAY).toISOString(), tz));
  const flows = FLOWS.map((f) => {
    const mine = rows.filter((r) => r.flow === f.id);
    const sent = mine.filter((r) => r.status === 'sent');
    const delivery = (d) => sent.filter((r) => r.delivery === d).length;
    const skips = {};
    for (const r of mine.filter((x) => x.status === 'skipped' || x.status === 'expired')) skips[r.reason] = (skips[r.reason] ?? 0) + 1;
    const people = (group) => [...new Map(mine.filter((r) => r.holdout === group).map((r) => [r.person, r])).values()];
    return {
      id: f.id, label: f.label, serves: f.serves, mode: store.modes[f.id] ?? 'off', holdoutPct: f.holdoutPct, channel: f.channel, trigger: f.trigger,
      since: store.startsOn,
      daily: days.filter((d) => d <= today).map((day) => ({
        day,
        entered: new Set(mine.filter((r) => dayOf(r.enteredAt, tz) === day).map((r) => r.person)).size,
        sent: sent.filter((r) => dayOf(r.sentAt, tz) === day).length,
        skipped: mine.filter((r) => (r.status === 'skipped' || r.status === 'expired') && dayOf(r.dueAt, tz) === day).length,
      })),
      delivery: [
        { label: 'sent', count: sent.length },
        { label: 'delivered', count: delivery('delivered') + delivery('clicked') },
        { label: 'clicked', count: delivery('clicked') },
        { label: 'bounced', count: delivery('bounced') },
        { label: 'complained', count: delivery('complained') },
        { label: 'unsubscribed', count: store.unsubscribes[f.id] ?? 0 },
      ],
      skips: Object.entries(skips).map(([label, count]) => ({ label, count })),
      outcomes: f.outcomes.map((o) => {
        const w = parseInt(o.window, 10) * DAY;
        const matured = (g) => people(g).filter((r) => Date.parse(r.enteredAt) + w <= now);
        return { label: o.label, window: o.window, emailed: { n: matured(false).length, hit: matured(false).filter((r) => r.outcome).length }, holdout: { n: matured(true).length, hit: matured(true).filter((r) => r.outcome).length } };
      }),
      messages: f.messages.map((m) => ({ id: m.id, label: m.label, subject: m.subject, html: render(m) })),
    };
  });
  const workflows = FLOWS.flatMap((f) => f.messages.map((m) => {
    const mine = rows.filter((r) => r.message === m.id), sent = mine.filter((r) => r.status === 'sent' && Date.parse(r.sentAt) > now - 30 * DAY);
    const drafts = mine.filter((r) => r.status === 'draft');
    const oldest = drafts.map((r) => r.dueAt).sort()[0];
    return {
      id: m.id, label: m.label, delayHours: m.delayHours, enabled: (store.modes[f.id] ?? 'off') !== 'off', audience: f.trigger, serves: f.serves,
      sent30d: sent.length, lastSentAt: sent.map((r) => r.sentAt).sort().at(-1) ?? null, drafts: drafts.length,
      expiresAt: oldest ? new Date(Date.parse(oldest) + m.expiresHours * HOUR).toISOString() : null,
      preview: { subject: m.subject, text: `Hi Sam, this is the "${m.label}" example.` },
    };
  }));
  return {
    version: 1, observedAt: new Date(now).toISOString(), paused: Object.values(store.modes).every((m) => m === 'off'), collectionFailed: false,
    stages: [{ label: 'Signed up in the last 30 days', count: new Set(rows.filter((r) => r.flow === 'onboarding').map((r) => r.person)).size }],
    delivery: [], history: [], accounts: [],
    workflows, flows,
    supports: ['pause', 'resume', 'approve', 'reject', 'test', 'mode'],
  };
}

/** Apply one action to the store; throws a short reason on a bad request. */
export function apply(store, req, now) {
  const message = FLOWS.flatMap((f) => f.messages.map((m) => ({ ...m, flow: f.id }))).find((m) => m.id === req.workflow);
  switch (req.action) {
    case 'report': return;
    case 'approve': {
      if (!message || !Number.isFinite(Date.parse(req.before))) throw Error('bad approve');
      // Only what the owner saw: drafts planned before the snapshot they approved from.
      for (const r of store.rows) if (r.message === message.id && r.status === 'draft' && Date.parse(r.dueAt) <= Date.parse(req.before)) { r.status = 'approved'; r.approvedAt = new Date(now).toISOString(); }
      return;
    }
    case 'reject': {
      if (!message || !Number.isFinite(Date.parse(req.before))) throw Error('bad reject');
      // The owner said no: those drafts are never sent, and the skip list says why.
      for (const r of store.rows) if (r.message === message.id && r.status === 'draft' && Date.parse(r.dueAt) <= Date.parse(req.before)) { r.status = 'skipped'; r.reason = 'owner said no'; }
      return;
    }
    case 'test':
      if (!message) throw Error('bad test');
      store.rows.push({ person: store.owner, flow: message.flow, message: message.id, test: true, status: 'sent', enteredAt: new Date(now).toISOString(), dueAt: new Date(now).toISOString(), sentAt: new Date(now).toISOString(), delivery: 'delivered' });
      return;
    case 'mode':
      if (!FLOWS.some((f) => f.id === req.workflow) || !['off', 'draft', 'auto'].includes(req.mode)) throw Error('bad mode');
      store.modes[req.workflow] = req.mode;
      return;
    case 'pause': case 'resume':
      for (const f of FLOWS) store.modes[f.id] = req.action === 'pause' ? 'off' : 'draft';
      return;
    default: throw Error('unknown action');
  }
}

// ---------------------------------------------------------------- run as a command

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    let input = '';
    for await (const chunk of process.stdin) { input += chunk; if (input.length > 2048) throw Error('input too long'); }
    const req = input ? JSON.parse(input) : { action: 'report' };
    const now = Date.now();
    // A real adapter has its own store; the template keeps synthetic state next to this file, or where argv says.
    const file = process.argv[2] ?? null;
    const store = loadStore(file, now);
    apply(store, req, now);
    const out = report(store, now, process.env.TZ || 'UTC');
    saveStore(file, store);
    process.stdout.write(JSON.stringify(out) + '\n');
  } catch (e) {
    console.error('lifecycle template adapter failed:', String(e?.message ?? e).slice(0, 120));
    process.exitCode = 1;
  }
}
