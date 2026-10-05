#!/usr/bin/env node
// HQ's demo scorecard adapter. Every number here is INVENTED: it exists so a fresh install shows a
// working scorecard without anyone's data, and so the adapter contract has a runnable example.
// Reads {"action":"report","weeks":12,"currency":"AUD","now"?:ISO} on stdin, prints one snapshot.
// A real adapter has the same shape but reads the business's own systems (see docs/guides/scorecard.md).

const input = JSON.parse((await new Promise((resolve) => {
  let s = '';
  process.stdin.on('data', (d) => (s += d)).on('end', () => resolve(s || '{}'));
})));
const now = input.now ? new Date(input.now) : new Date();
const count = Math.min(Math.max(Number(input.weeks) || 12, 1), 26);
const currency = typeof input.currency === 'string' ? input.currency : 'AUD';

/** ISO 8601 week of a date, e.g. 2026-W40. */
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - yearStart) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}
/** Deterministic noise from a week label, so the same week always shows the same numbers. */
function noise(label, salt) {
  let h = 2166136261;
  for (const c of label + salt) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}
const round = (n, dp = 0) => Math.round(n * 10 ** dp) / 10 ** dp;
const DEMO = 'Demo data';

const weeks = [];
for (let i = 0; i < count; i++) {
  const week = isoWeek(new Date(now.getTime() - i * 7 * 86400000));
  const age = count - 1 - i;                 // 0 = oldest week shown
  const n = (salt) => noise(week, salt);
  const paying = round(180 + age * 6 + n('p') * 8);
  const newPaying = round(10 + n('np') * 8);
  const metrics = [
    {id: 'new_signups', value: round(70 + n('s') * 40), quality: 'exact', note: DEMO},
    {id: 'new_paying', value: newPaying, quality: 'exact', note: DEMO,
      breakdown: [{label: 'Search', value: round(newPaying * 0.4)}, {label: 'Social', value: round(newPaying * 0.35)}, {label: 'Unknown', value: newPaying - round(newPaying * 0.4) - round(newPaying * 0.35)}]},
    {id: 'new_mrr', value: round(newPaying * 24.5, 2), quality: 'approx', note: 'Demo data: list prices, discounts not priced in'},
    {id: 'activation_rate', value: round(0.42 + n('a') * 0.12, 3), quality: 'exact', note: DEMO},
    {id: 'paying_churn_rate', value: round(0.03 + n('c') * 0.03, 3), quality: 'approx', note: 'Demo data: one tier only reports cancellations',
      breakdown: [{label: 'Top tier', value: round(0.02 + n('c1') * 0.02, 3)}, {label: 'Base tier', value: round(0.04 + n('c2') * 0.03, 3)}]},
    {id: 'failed_payments', value: round(2 + n('f') * 5), quality: 'exact', note: DEMO},
    age < 3 ? {id: 'payment_recovery_rate', value: null, quality: 'missing', note: 'Demo: needs three weeks of payment history'}
      : {id: 'payment_recovery_rate', value: round(0.55 + n('r') * 0.2, 3), quality: 'exact', note: DEMO},
    {id: 'set_to_cancel', value: round(3 + n('sc') * 6), quality: 'exact', note: DEMO, breakdown: [{label: 'Top tier', value: round(1 + n('sc1') * 2)}, {label: 'Base tier', value: round(2 + n('sc2') * 3)}]},
    {id: 'weekly_active_rate', value: Math.round((0.55 + n('wa') * 0.2) * 1e4) / 1e4, quality: 'exact', note: DEMO},
    {id: 'upgrades', value: round(1 + n('u') * 4), quality: 'exact', note: DEMO, breakdown: [{label: 'Base to top', value: round(1 + n('u') * 3)}]},
    {id: 'downgrades', value: round(n('d') * 2), quality: 'exact', note: DEMO},
    age < 4 ? {id: 'nrr', value: null, quality: 'missing', note: 'Demo: needs four weeks of history'}
      : {id: 'nrr', value: round(0.96 + n('nrr') * 0.08, 3), quality: 'exact', note: DEMO},
    {id: 'mrr', value: round(paying * 23.8, 2), quality: 'approx', note: 'Demo data: list prices, discounts not priced in'},
    {id: 'paying_customers', value: paying, quality: 'exact', note: DEMO,
      breakdown: [{label: 'Top tier', value: round(paying * 0.2)}, {label: 'Base tier', value: paying - round(paying * 0.2)}]},
    {id: 'records_mismatch', value: 0, quality: 'exact', note: 'Demo data: billing and records agree'},
    {id: 'known_source_share', value: round(0.7 + n('k') * 0.1, 3), quality: 'approx', note: 'Demo data'},
  ];
  weeks.push({week, metrics, extraSpend: [{label: 'Demo ad spend', value: round(400 + n('x') * 300, 2)}]});
}

console.log(JSON.stringify({version: 1, observedAt: now.toISOString(), currency, weeks}));
