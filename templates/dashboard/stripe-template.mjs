#!/usr/bin/env node
// Dashboard connector for any business that bills subscriptions through Stripe (docs/guides/dashboard.md).
//
//   node stripe-template.mjs <config.json>
//
// The config is the business's own file: a dashboard-stripe.json, or the scorecard's scorecard-billing.json (its
// "stripe" block is read), so a business that set up the scorecard needs nothing new:
//   {"keychain": "hq-<slug>-stripe", "tiers": {"Pro": ["prod_..."], "Plus": ["prod_..."]}, "ignore": ["sub_..."]}
// `tiers` names your plans by Stripe product; subscriptions on other products are left out (one Stripe account can
// bill several businesses). The key is a restricted key with Read on Subscriptions, Invoices, Prices and Products,
// typed into the Keychain by the owner and read here at run time, never printed. Customers can't be read with it, so
// each person's email and name come from their subscription's latest invoice.
//
// Shows: members by plan (with trials), monthly recurring revenue, new subscriptions and cancellations by day, recent
// upgrades, pending cancellations and cancelled customers. Read-only: Stripe has no place for contact status or notes.
// Node stdlib only. stdin {"action": "report"}.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { keychain, monthly } from '../scorecard/billing-sources.mjs';

const DAY = 86_400_000;
const LIVE = new Set(['active', 'trialing', 'past_due']);
const iso = (sec) => (typeof sec === 'number' && Number.isFinite(sec) ? new Date(sec * 1000).toISOString() : null);
const day = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);
const item = (s) => s.items?.data?.[0] ?? null;
const productOf = (s) => { const p = item(s)?.price?.product; return typeof p === 'string' ? p : p?.id ?? ''; };
const customerOf = (s) => (typeof s.customer === 'string' ? s.customer : s.customer?.id) || '';
const invoiceOf = (s) => (s.latest_invoice && typeof s.latest_invoice === 'object' ? s.latest_invoice : null);
const period = (i) => ({ day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' })[i] ?? (i || 'unknown');
const periodEnd = (s) => s.current_period_end ?? item(s)?.current_period_end;

/** The config's Stripe settings, from a dashboard-stripe.json or a scorecard-billing.json. */
export function readConfig(raw) {
  const c = raw?.stripe && typeof raw.stripe === 'object' ? raw.stripe : raw;
  if (!c || typeof c.keychain !== 'string' || !c.keychain) throw Error('config needs "keychain": the Keychain service holding the restricted key');
  if (!c.tiers || typeof c.tiers !== 'object' || !Object.keys(c.tiers).length) throw Error('config needs "tiers": {"Plan name": ["prod_..."]}');
  return { keychain: c.keychain, tiers: c.tiers, ignore: c.ignore ?? [], timeZone: raw.timeZone ?? c.timeZone ?? 'UTC' };
}

const counts = (dates) => {
  const m = new Map();
  for (const d of dates) m.set(d, (m.get(d) ?? 0) + 1);
  return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
};

/** The dashboard snapshot from raw Stripe subscriptions (each with `latest_invoice` expanded). Pure. */
export function buildSnapshot(subscriptions, { tiers, ignore = [], now = Date.now() }) {
  const tierOf = {};
  for (const [name, ids] of Object.entries(tiers)) for (const id of [].concat(ids)) tierOf[id] = name;
  const skip = new Set(ignore);
  const subs = subscriptions.filter((s) => tierOf[productOf(s)] && !skip.has(s.id));

  // Who's who: the newest invoice per customer carries their email and name.
  const person = new Map();
  for (const s of subs) {
    const inv = invoiceOf(s), c = customerOf(s);
    if (!c || !inv?.customer_email) continue;
    const prev = person.get(c);
    if (!prev || (inv.created ?? 0) > prev.at) person.set(c, { email: inv.customer_email, name: inv.customer_name || null, at: inv.created ?? 0 });
  }
  const who = (s) => person.get(customerOf(s)) ?? { email: null, name: null };

  // Members by plan: one per customer, their highest plan in the order the config lists them.
  const order = Object.keys(tiers);
  const best = new Map();
  for (const s of subs.filter((x) => LIVE.has(x.status))) {
    const c = customerOf(s) || s.id, t = tierOf[productOf(s)];
    const cur = best.get(c);
    if (!cur || order.indexOf(t) < order.indexOf(cur.tier)) best.set(c, { tier: t, trial: s.status === 'trialing' });
  }
  const plans = order.map((t) => {
    const members = [...best.values()].filter((b) => b.tier === t);
    const trials = members.filter((b) => b.trial).length;
    return { id: t.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label: t, count: members.length, paid: true, hint: trials ? `${trials} on a free trial` : `Active ${t} subscriptions` };
  });

  const paying = subs.filter((s) => s.status === 'active' || s.status === 'past_due');
  const currencies = [...new Set(paying.map((s) => item(s)?.price?.currency).filter(Boolean))];
  const mrr = paying.reduce((t, s) => {
    const p = item(s)?.price;
    return t + monthly(((p?.unit_amount ?? 0) * (item(s)?.quantity ?? 1)) / 100, p?.recurring?.interval, p?.recurring?.interval_count);
  }, 0);
  const pendingSubs = subs.filter((s) => LIVE.has(s.status) && (s.cancel_at_period_end || s.cancel_at));
  const since = subs.length ? day(Math.min(...subs.map((s) => s.created))) : new Date(now).toISOString().slice(0, 10);

  const recentUpgrades = subs.filter((s) => s.created * 1000 >= now - 30 * DAY).sort((a, b) => b.created - a.created).map((s) => ({
    key: s.id, name: who(s).name, email: who(s).email, plan: tierOf[productOf(s)], billingPeriod: period(item(s)?.price?.recurring?.interval), startedAt: iso(s.created),
  }));

  const pending = pendingSubs.map((s) => {
    const p = item(s)?.price;
    return {
      key: s.id, name: who(s).name, email: who(s).email, phone: null, plan: tierOf[productOf(s)], billingPeriod: period(p?.recurring?.interval), status: s.status,
      expiresAt: iso(s.cancel_at) ?? iso(periodEnd(s)) ?? new Date(now).toISOString(), memberSince: iso(s.created),
      amount: p?.unit_amount ? p.unit_amount / 100 : 0, currency: p?.currency ?? 'usd', affiliateCode: null,
      cancelFeedback: s.cancellation_details?.feedback ?? null, cancelReason: s.cancellation_details?.comment ?? null, source: 'card', contact: 'not_contacted', template: null,
    };
  }).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

  // Cancelled customers: their newest cancelled subscription, when they have nothing live now. The 500 newest.
  const live = new Set(subs.filter((s) => LIVE.has(s.status)).map(customerOf));
  const seen = new Set();
  const churned = [];
  for (const s of subs.filter((x) => x.status === 'canceled').sort((a, b) => (b.canceled_at ?? b.ended_at ?? 0) - (a.canceled_at ?? a.ended_at ?? 0))) {
    const c = customerOf(s);
    if (!c || live.has(c) || seen.has(c)) continue;
    seen.add(c);
    churned.push({
      key: s.id, name: who(s).name, email: who(s).email, churnedAt: iso(s.canceled_at ?? s.ended_at ?? s.created), plan: tierOf[productOf(s)], previousProduct: tierOf[productOf(s)],
      cancelFeedback: s.cancellation_details?.feedback ?? null, cancelReason: s.cancellation_details?.comment ?? null, source: 'card', contact: 'not_contacted', template: null,
    });
    if (churned.length >= 500) break;
  }

  return {
    observedAt: new Date(now).toISOString(),
    plans,
    groups: [{ id: 'billing', title: 'Billing', note: 'From Stripe, your plans only.', tiles: [
      { label: 'Monthly recurring revenue', value: currencies.length <= 1 ? Math.round(mrr * 100) / 100 : null, format: 'money', currency: currencies[0], hint: currencies.length > 1 ? `Mixed currencies (${currencies.join(', ')})` : 'List price of paying subscriptions, per month' },
      { label: 'Paying', value: paying.length, hint: `${subs.filter((s) => s.status === 'past_due').length} with a failed payment` },
      { label: 'On a free trial', value: subs.filter((s) => s.status === 'trialing').length },
      { label: 'Set to cancel', value: pendingSubs.length, hint: 'Still active until their period ends', ...(pendingSubs.length ? { tone: 'warn' } : {}) },
    ] }],
    charts: [
      { id: 'new-subscriptions', title: 'New subscriptions', subtitle: 'Started, trials included', kind: 'bars', since, points: counts(subs.map((s) => day(s.created))) },
      { id: 'cancellations', title: 'Cancellations', subtitle: 'Subscriptions that ended', kind: 'bars', since, points: counts(subs.filter((s) => s.status === 'canceled' && (s.canceled_at ?? s.ended_at)).map((s) => day(s.canceled_at ?? s.ended_at))) },
    ],
    recentUpgrades,
    pending,
    churned,
    templates: {},
    can: { contact: false, notes: false },
  };
}

async function stripeAll(key, path) {
  const out = [];
  let after = null;
  for (let i = 0; i < 500; i++) {
    const r = await fetch(`https://api.stripe.com/v1/${path}&limit=100${after ? `&starting_after=${after}` : ''}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000) });
    const j = await r.json();
    if (!r.ok) throw Error(r.status === 401 || r.status === 403 ? `Stripe refused the key (${r.status}): it needs Read on Subscriptions and Invoices` : `Stripe answered ${r.status}`);
    out.push(...j.data);
    if (!j.has_more || !j.data.length) return out;
    after = j.data.at(-1).id;
  }
  return out;
}

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: stripe-template.mjs <config.json>'); process.exit(2); }
  const input = JSON.parse((await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => r(s)); })) || '{}');
  if ((input.action ?? 'report') !== 'report') { console.error('The Stripe dashboard is read-only'); process.exit(2); }
  const cfg = readConfig(JSON.parse(readFileSync(file, 'utf8')));
  let key;
  try { key = keychain(cfg.keychain); } catch { console.error(`No Keychain item "${cfg.keychain}"; add it with: security add-generic-password -a hq -s ${cfg.keychain} -w`); process.exit(1); }
  const subs = await stripeAll(key, 'subscriptions?status=all&expand[]=data.latest_invoice');
  process.stdout.write(JSON.stringify(buildSnapshot(subs, cfg)) + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
