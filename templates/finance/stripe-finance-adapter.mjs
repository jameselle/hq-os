#!/usr/bin/env node
// HQ's Stripe finance adapter (read-only): daily income per product tier from paid Stripe invoices, and refunds issued
// as credit notes, for the business's own products on a (possibly shared) Stripe account. Daily totals only: no
// customer, invoice or subscription ids leave this script. Usage:
//   stripe-finance-adapter.mjs <billing.json>      (the scorecard billing config: stripe.keychain, stripe.tiers, stripe.ignore)
// The key is a restricted key with Read on Subscriptions, Invoices, Prices and Products, read from the login Keychain
// in-process and never printed. Stripe's own fees and plain card refunds need the Charges or Balance permission, which
// that key doesn't have, so they are not reported (the snapshot's notes say so). Contract: docs/guides/finance-sync.md.
import { readFileSync } from 'node:fs';
import { keychain } from '../scorecard/billing-sources.mjs';

const input = JSON.parse(await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => r(s || '{}')); }));
const cfg = JSON.parse(readFileSync(process.argv[2], 'utf8')).stripe;
const tz = input.timezone || 'UTC';
const currency = String(input.currency || 'USD').toUpperCase();
const key = keychain(cfg.keychain);

async function list(path, params = '') {
  const out = []; let after = null;
  do {
    const r = await fetch(`https://api.stripe.com/v1/${path}?limit=100${params}${after ? `&starting_after=${after}` : ''}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000) });
    const j = await r.json();
    if (!r.ok) throw Error(`stripe ${path}: ${r.status}`);
    out.push(...j.data); after = j.has_more ? j.data.at(-1).id : null;
  } while (after);
  return out;
}
const tierOf = (() => { const m = new Map(); for (const [t, ps] of Object.entries(cfg.tiers ?? {})) for (const p of [].concat(ps)) m.set(p, t); return (p) => m.get(p) ?? null; })();
const prodOf = (price) => (typeof price?.product === 'string' ? price.product : price?.product?.id);
const skip = new Set(cfg.ignore ?? []);
const day = (sec) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(sec * 1000));

try {
  const subs = (await list('subscriptions', '&status=all')).filter((s) => !skip.has(s.id));
  const tierOfSub = new Map(subs.map((s) => [s.id, tierOf(prodOf(s.items?.data?.[0]?.price))]).filter(([, t]) => t));
  const oldest = Math.min(...subs.filter((s) => tierOfSub.has(s.id)).map((s) => s.created), Date.now() / 1000);
  const invoices = await list('invoices', `&status=paid&created[gte]=${Math.floor(oldest) - 86400}`);
  const sums = new Map();
  const add = (date, kind, label, amount, cur) => { const k = `${date}|${kind}|${label}|${cur}`; sums.set(k, (sums.get(k) ?? 0) + amount); };
  let otherCurrency = 0;
  for (const inv of invoices) {
    const sub = inv.subscription ?? inv.parent?.subscription_details?.subscription ?? null;
    const tier = sub ? tierOfSub.get(typeof sub === 'string' ? sub : sub.id) : null;
    if (!tier) continue;
    const cur = String(inv.currency).toUpperCase();
    if (cur !== currency) { otherCurrency++; continue; }
    const paid = inv.status_transitions?.paid_at ?? inv.created;
    if (inv.amount_paid > 0) add(day(paid), 'income', tier, inv.amount_paid / 100, cur);
    if (inv.post_payment_credit_notes_amount > 0) add(day(paid), 'refund', tier, inv.post_payment_credit_notes_amount / 100, cur);
  }
  const entries = [...sums].map(([k, amount]) => { const [date, kind, label, cur] = k.split('|'); return { date, kind, label, amount: Math.round(amount * 100) / 100, currency: cur }; });
  const notes = [
    'Income is paid Stripe invoices for this business\'s products, by the day they were paid.',
    'Refunds are credit notes, dated on the invoice\'s paid day. Plain card refunds and Stripe\'s fees need more key permissions and are not included.',
    ...(otherCurrency ? [`${otherCurrency} paid invoices in another currency were left out.`] : []),
  ];
  process.stdout.write(JSON.stringify({ version: 1, observedAt: new Date().toISOString(), currency, notes, entries }) + '\n');
} catch (e) {
  console.error('stripe finance adapter failed:', String(e?.message ?? e).slice(0, 120));
  process.exitCode = 1;
}
