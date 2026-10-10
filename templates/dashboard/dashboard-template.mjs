#!/usr/bin/env node
// Demo dashboard adapter: invented members for the demo business, so the Dashboard can be tried end to end.
// Every name, email and number here is made up. A real adapter reads the business's own records and billing
// and prints the same shape (docs/guides/dashboard.md).
//
// Usage in $HQ_DATA/businesses/<slug>/dashboard-connection.json:
//   {"command": ["node", "<hq>/templates/dashboard/dashboard-template.mjs", "<hq-data>/businesses/<slug>/dashboard-demo.json"], "readOnly": false}
// The optional path keeps the demo's contact statuses and notes between runs (invented data only).
//
// stdin {action}:
//   report                         the snapshot
//   notes      {key, kind}         a customer's notes, newest first
//   add-note   {key, kind, note}   add a note
//   set-contact {key, kind, status}
import { readFileSync, writeFileSync } from 'node:fs';

const statePath = process.argv[2] || null;
const input = JSON.parse((await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => r(s)); })) || '{}');

const load = () => { try { return JSON.parse(readFileSync(statePath, 'utf8')); } catch { return { contact: {}, notes: {} }; } };
const save = (s) => { if (statePath) writeFileSync(statePath, JSON.stringify(s), { mode: 0o600 }); };
const state = statePath ? load() : { contact: {}, notes: {} };

const DAY = 86_400_000;
const now = Date.now();
const at = (daysAgo, hour = 10) => new Date(Math.floor((now - daysAgo * DAY) / DAY) * DAY + hour * 3_600_000).toISOString();
const dayOf = (iso) => iso.slice(0, 10);

// A steady little business: about six sign-ups a day with a weekly rhythm, about one upgrade every other day.
const since = dayOf(at(120));
const signups = [], upgrades = [];
for (let d = 120; d >= 0; d--) {
  const date = dayOf(at(d));
  const wave = Math.round(5 + 3 * Math.sin(d / 3.5) + (d % 7 === 0 ? 4 : 0));
  if (wave > 0) signups.push({ date, count: wave });
  if ((d * 7) % 5 < 2) upgrades.push({ date, count: 1 + (d % 11 === 0 ? 1 : 0) });
}

const people = [
  ['Maya Lin', 'maya.lin'], ['Tom Okafor', 'tom.okafor'], ['Priya Shah', 'priya.shah'], ['Leo Brandt', 'leo.brandt'],
  ['Ana Costa', 'ana.costa'], ['Sam Reyes', 'sam.reyes'], ['Noor Haddad', 'noor.haddad'], ['Ella Fisher', 'ella.fisher'],
  ['Kai Moana', 'kai.moana'], ['Ruth Adler', 'ruth.adler'],
].map(([name, user]) => ({ name, email: `${user}@example.com` }));

const contact = (key) => state.contact[key] ?? 'not_contacted';

const churned = [
  { key: 'churned-1', ...people[0], churnedAt: at(2), plan: 'pro', previousProduct: 'Pro', cancelFeedback: 'too_expensive', cancelReason: 'Money is tight this month', source: 'card', template: 'winback' },
  { key: 'churned-2', ...people[1], churnedAt: at(6), plan: 'plus', previousProduct: 'Plus', cancelFeedback: 'unused', cancelReason: null, source: 'card', template: 'winback' },
  { key: 'churned-3', ...people[2], churnedAt: at(9), plan: 'pro', previousProduct: 'App Store Pro monthly', cancelFeedback: null, cancelReason: null, source: 'apple', template: 'winback' },
  { key: 'churned-4', ...people[3], churnedAt: at(15), plan: 'plus', previousProduct: 'Google Play Plus monthly', cancelFeedback: null, cancelReason: null, source: 'google', template: 'winback' },
].map((r) => ({ ...r, contact: contact(r.key) }));

const pending = [
  { key: 'pending-1', ...people[4], phone: '+61 400 000 001', plan: 'Pro', billingPeriod: 'monthly', status: 'active', expiresAt: at(-4), memberSince: at(200), amount: 39, currency: 'aud', affiliateCode: 'COFFEEPAL', cancelFeedback: 'missing_features', cancelReason: 'Wanted oat milk subscriptions', source: 'card', template: 'missing_features' },
  { key: 'pending-2', ...people[5], phone: null, plan: 'Plus', billingPeriod: 'weekly', status: 'trialing', expiresAt: at(-1), memberSince: at(5), amount: 9, currency: 'aud', affiliateCode: null, cancelFeedback: null, cancelReason: null, source: 'card', template: 'default' },
  { key: 'pending-3', ...people[6], phone: null, plan: 'Pro', billingPeriod: 'monthly', status: 'past_due', expiresAt: at(1), memberSince: at(90), amount: 0, currency: 'aud', affiliateCode: null, cancelFeedback: null, cancelReason: 'App Store renewal overdue, in the billing retry grace period', source: 'apple', template: 'default' },
].map((r) => ({ ...r, contact: contact(r.key) }));

const recentUpgrades = [
  { key: 'up-1', ...people[7], plan: 'Pro', billingPeriod: 'monthly', startedAt: at(0, 8) },
  { key: 'up-2', ...people[8], plan: 'Plus', billingPeriod: 'weekly', startedAt: at(3) },
  { key: 'up-3', ...people[9], plan: 'Pro', billingPeriod: 'yearly', startedAt: at(11) },
];

const templates = {
  winback: { label: 'Win-back', subject: 'We kept your seat warm', body: 'Hi {{first_name}},\n\nWe noticed you moved to the free plan. A lot has changed since: new single-origin beans every week and free delivery over $30.\n\nCome back for a month on us? Just reply to this email.\n\nThe Demo Coffee team' },
  missing_features: { label: 'Feature follow-up', subject: 'You asked, we listened', body: 'Hi {{first_name}},\n\nThanks for telling us what was missing. We are working on it now and would love to show you before your plan ends.\n\nThe Demo Coffee team' },
  default: { label: 'Check-in', subject: 'Before you go', body: 'Hi {{first_name}},\n\nSorry to see you cancel. Is there anything we could have done better? A one-line reply helps a lot.\n\nThe Demo Coffee team' },
};

function report() {
  const sum = (from) => signups.filter((d) => d.date >= from).reduce((t, d) => t + d.count, 0);
  return {
    observedAt: new Date(now).toISOString(),
    plans: [
      { id: 'pro', label: 'Pro', count: 41, paid: true },
      { id: 'plus', label: 'Plus', count: 27, paid: true },
      { id: 'free', label: 'Free', count: 612, paid: false },
    ],
    totalUsers: 680,
    signups: { today: signups.at(-1)?.date === dayOf(at(0)) ? signups.at(-1).count : 0, week: sum(dayOf(at(6))), month: sum(dayOf(at(29))) },
    daily: { since, signups, upgrades },
    recentUpgrades,
    churned,
    pending,
    security: { suspended: 0, flagged: 1, rateLimited24h: 3 },
    orphaned: [{ key: 'orphan-1', name: 'Jo Example', email: 'jo@example.com', status: 'active', plan: 'Pro', amount: 39, interval: 'month', created: at(40), link: null }],
    templates,
    can: { contact: true, notes: true },
  };
}

const known = new Set([...churned, ...pending].map((r) => r.key));
const need = () => { if (!known.has(input.key)) { console.error('unknown customer'); process.exit(2); } };

let out;
switch (input.action ?? 'report') {
  case 'report': out = report(); break;
  case 'notes': need(); out = (state.notes[input.key] ?? []).slice().reverse(); break;
  case 'add-note': {
    need();
    const list = (state.notes[input.key] ??= []);
    list.push({ id: `n${Date.now()}${list.length}`, note: String(input.note).slice(0, 2000), createdAt: new Date().toISOString() });
    save(state); out = { ok: true }; break;
  }
  case 'set-contact': {
    need();
    if (!['not_contacted', 'contacted', 'follow_up'].includes(input.status)) { console.error('unknown status'); process.exit(2); }
    state.contact[input.key] = input.status; save(state); out = { ok: true }; break;
  }
  default: console.error('unknown action'); process.exit(2);
}
process.stdout.write(JSON.stringify(out) + '\n');
