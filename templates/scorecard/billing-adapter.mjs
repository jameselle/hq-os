#!/usr/bin/env node
// A ready-made scorecard adapter for subscription businesses that bill through Stripe and/or the
// App Store. Point a business's scorecard-connection.json at it with the path of its private config:
//
//   {"command": ["/abs/node", "/abs/hq/templates/scorecard/billing-adapter.mjs", "/abs/hq-data/businesses/<slug>/scorecard-billing.json"], "readOnly": true}
//
// The config (kept in the business's HQ data folder, never in a repo):
//   timeZone      the business's zone; weeks run Monday to Monday there
//   currency      ISO code (used when there is no records command)
//   records       optional {command: [...]} – the business's own adapter (signups, activation, its membership
//                 records). Its paying_customers breakdown by tier is checked against billing.
//   stripe        optional {keychain, tiers: {"<tier>": ["prod_…", …]}, ignore?: ["sub_…"]} – restricted key in that
//                 Keychain item; `ignore` lists test subscriptions to leave out
//   appStore      optional {keychain, keyId, issuerId, vendorNumber, tiers: {"<tier>": "<word in the subscription name>"}}
//
// A source that can't be reached is skipped (its numbers stay as the records command reported them)
// and named on stderr. Setup, step by step: docs/guides/scorecard-billing.md.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { applyBilling, fetchApple, fetchStripe, weekBounds } from './billing-sources.mjs';

const input = JSON.parse(await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => r(s || '{}')); }));
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const now = input.now ? Date.parse(input.now) : Date.now();
const count = Math.min(Math.max(Number(input.weeks) || 12, 1), 26);
const timeZone = config.timeZone || 'UTC';

/** ISO week label of the local date at instant t. */
function isoWeekAt(t) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return `${date.getUTCFullYear()}-W${String(Math.ceil(((date - yearStart) / 86400e3 + 1) / 7)).padStart(2, '0')}`;
}

function skeleton() {
  const thisWeek = weekBounds(isoWeekAt(now), timeZone);
  const weeks = [];
  for (let k = 1; k <= count; k++) weeks.push({ week: isoWeekAt(thisWeek.start - (k - 1) * 7 * 86400e3 - 3600e3), metrics: [] });
  return { version: 1, observedAt: new Date(now).toISOString(), currency: config.currency || input.currency || 'USD', weeks };
}

const base = config.records?.command
  ? JSON.parse(execFileSync(config.records.command[0], config.records.command.slice(1), { input: JSON.stringify(input), encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 }))
  : skeleton();

const oldest = weekBounds(base.weeks.at(-1).week, timeZone).start;
const tierIn = (map) => (value) => Object.entries(map ?? {}).find(([, ids]) => [].concat(ids).includes(value))?.[0] ?? null;
const tierByWord = (map) => (name) => Object.entries(map ?? {}).find(([, word]) => String(name).toLowerCase().includes(String(word).toLowerCase()))?.[0] ?? null;

const attempt = async (name, fn) => { try { return await fn(); } catch (e) { process.stderr.write(`${name} skipped: ${e.message}\n`); return null; } };
const stripe = config.stripe && await attempt('stripe', () => fetchStripe({ keychainService: config.stripe.keychain, tierOf: tierIn(config.stripe.tiers), sinceMs: oldest - 21 * 86400e3, ignore: config.stripe.ignore }));
const apple = config.appStore && await attempt('app store', () => fetchApple({ keychainService: config.appStore.keychain, keyId: config.appStore.keyId, issuerId: config.appStore.issuerId, vendorNumber: config.appStore.vendorNumber, tierOf: tierByWord(config.appStore.tiers) }));
const paying = base.weeks[0].metrics.find((m) => m.id === 'paying_customers');
const records = paying?.breakdown ? Object.fromEntries(paying.breakdown.map((r) => [r.label, r.value])) : null;

const missing = [config.stripe && !stripe && 'Stripe', config.appStore && !apple && 'App Store'].filter(Boolean);
process.stdout.write(JSON.stringify(stripe || apple ? applyBilling(base, { stripe, apple, records, timeZone, now, missing }) : base) + '\n');
