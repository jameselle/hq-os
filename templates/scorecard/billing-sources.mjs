// Billing sources for a scorecard adapter: Stripe (card subscriptions) and the App Store
// (subscription reports). Reusable by any business; a business's private adapter passes its own
// config (which products are which tier, Keychain service names, App Store IDs). Read-only:
// Stripe needs a restricted key with Read on Subscriptions, Invoices, Prices and Products; the
// App Store needs an App Store Connect API key with the Sales role. Setup: docs/guides/scorecard-billing.md.
// Everything here returns counts, sums and tier labels only; nothing about a person leaves it.
// Node stdlib only.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const DAY = 86400e3;

// ---------------------------------------------------------------- time

/** Milliseconds the zone is ahead of UTC at instant `t`. */
function zoneOffset(t, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
}
/** The instant of local midnight on a calendar date in a zone. */
function localMidnight(y, m, d, timeZone) {
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - zoneOffset(guess, timeZone);
  return guess - zoneOffset(first, timeZone);
}
/** An ISO week label ("2026-W40") as its local Monday-to-Monday instants (ms). */
export function weekBounds(label, timeZone) {
  const [, y, w] = /^(\d{4})-W(\d{2})$/.exec(label) ?? [];
  if (!y) throw Error(`bad week ${label}`);
  const jan4 = new Date(Date.UTC(+y, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY + (+w - 1) * 7 * DAY);
  const next = new Date(monday.getTime() + 7 * DAY);
  return {
    start: localMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), timeZone),
    end: localMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone),
  };
}

// ---------------------------------------------------------------- money

/** A price per billing period, as a monthly amount. */
export function monthly(amount, interval, count = 1) {
  const perYear = { day: 365, week: 52, month: 12, year: 1 }[interval];
  if (!perYear) return amount;
  return (amount * perYear) / 12 / (count || 1);
}

// ---------------------------------------------------------------- Stripe

const productId = (price) => (typeof price?.product === 'string' ? price.product : price?.product?.id);
/** The subscription an invoice belongs to (older API: invoice.subscription; 2025+: invoice.parent). */
export const invoiceSubscription = (inv) => inv.subscription ?? inv.parent?.subscription_details?.subscription ?? null;

/** A Stripe subscription reduced to what the scorecard needs, or null if it isn't one of the business's products. */
export function normaliseSubscription(s, tierOf) {
  const item = s.items?.data?.[0];
  const tier = item ? tierOf(productId(item.price)) : null;
  if (!tier) return null;
  let perPeriod = ((item.price.unit_amount ?? 0) * (item.quantity ?? 1)) / 100;
  const discounts = [...(Array.isArray(s.discounts) ? s.discounts : []), ...(s.discount ? [s.discount] : [])];
  let discountsKnown = true;
  const nowSec = Date.now() / 1000;
  for (const d of discounts) {
    if (typeof d === 'string') { discountsKnown = false; continue; }
    if (d.end && d.end <= nowSec) continue; // a repeating coupon that has run out
    const c = d.coupon ?? d.source?.coupon;
    if (!c || typeof c === 'string') { discountsKnown = false; continue; }
    if (c.percent_off) perPeriod *= 1 - c.percent_off / 100;
    if (c.amount_off) perPeriod -= c.amount_off / 100;
  }
  perPeriod = Math.max(0, perPeriod);
  return {
    id: s.id, tier, status: s.status, currency: item.price.currency,
    payingFrom: s.trial_end && s.trial_end > s.created ? s.trial_end : s.created,
    endedAt: s.ended_at ?? null,
    cancelScheduled: Boolean(s.cancel_at_period_end || s.cancel_at),
    monthly: monthly(perPeriod, item.price.recurring?.interval, item.price.recurring?.interval_count),
    discounted: discounts.length > 0, discountsKnown,
  };
}

const paying = (s, t) => s.payingFrom * 1000 <= t && (!s.endedAt || s.endedAt * 1000 > t) && !(s.endedAt && s.endedAt <= s.payingFrom);
const firstAttempt = (inv) => (inv.status_transitions?.finalized_at ?? inv.created) * 1000;
const failedInvoice = (inv) => inv.attempt_count > 1 || (inv.attempted && ['open', 'uncollectible'].includes(inv.status));
const byLabel = (a, b) => a.label.localeCompare(b.label);

/** One week of card history: churn (paying at the start who ended in the week), failed payments
 *  (first attempt in the week), and recovery of the failures from 14-7 days before the week. */
export function cardWeekMetrics(subs, invoices, { start, end }) {
  const base = subs.filter((s) => paying(s, start));
  const lostIds = new Set(base.filter((s) => s.endedAt && s.endedAt * 1000 >= start && s.endedAt * 1000 < end).map((s) => s.id));
  const tiers = [...new Set(base.map((s) => s.tier))];
  const byTier = tiers.map((t) => {
    const inTier = base.filter((s) => s.tier === t);
    return { label: t, value: Math.round((inTier.filter((s) => lostIds.has(s.id)).length / inTier.length) * 1e4) / 1e4 };
  }).sort(byLabel);
  const failures = invoices.filter(failedInvoice);
  const cohort = failures.filter((i) => firstAttempt(i) >= start - 14 * DAY && firstAttempt(i) < start - 7 * DAY);
  const fresh = subs.filter((s) => s.payingFrom * 1000 >= start && s.payingFrom * 1000 < end && !(s.endedAt && s.endedAt <= s.payingFrom));
  return {
    newPaying: fresh.length,
    newMonthly: fresh.reduce((a, s) => a + s.monthly, 0),
    churn: { base: base.length, lost: lostIds.size, byTier },
    failed: failures.filter((i) => firstAttempt(i) >= start && firstAttempt(i) < end).length,
    recovery: { cohort: cohort.length, recovered: cohort.filter((i) => i.status === 'paid' && i.status_transitions?.paid_at && i.status_transitions.paid_at * 1000 - firstAttempt(i) <= 14 * DAY).length },
  };
}

/** Members now: paying (past any trial) and on trial, by tier, with monthly value and scheduled cancellations. */
export function cardNow(subs, now = Date.now()) {
  const live = subs.filter((s) => ['active', 'trialing', 'past_due'].includes(s.status));
  const payers = live.filter((s) => s.status !== 'trialing' && paying(s, now));
  const count = (xs) => xs.reduce((a, s) => ((a[s.tier] = (a[s.tier] ?? 0) + 1), a), {});
  return {
    byTier: count(payers), trials: live.filter((s) => s.status === 'trialing').length,
    monthly: payers.reduce((a, s) => a + s.monthly, 0),
    cancelling: count(payers.filter((s) => s.cancelScheduled)),
    trialsCancelling: live.filter((s) => s.status === 'trialing' && s.cancelScheduled).length,
    discountsKnown: payers.every((s) => s.discountsKnown),
  };
}

// ---------------------------------------------------------------- App Store

function durationToInterval(text) {
  const [, n, unit] = /^(\d+)\s+(Day|Week|Month|Year)s?$/i.exec(String(text).trim()) ?? [];
  if (!n) return ['month', 1];
  const u = unit.toLowerCase();
  return u === 'day' && +n % 7 === 0 ? ['week', +n / 7] : [u, +n];
}

/** An App Store SUBSCRIPTION SUMMARY report (header + rows) summed by tier. */
export function appleSummary(head, rows, tierOf) {
  const c = (name) => head.indexOf(name);
  const out = { byTier: {}, trials: 0, retry: 0, grace: 0, monthly: 0 };
  for (const r of rows) {
    const tier = tierOf(r[c('Subscription Name')]);
    if (!tier) continue;
    const active = +r[c('Active Standard Price Subscriptions')] || 0;
    out.byTier[tier] = (out.byTier[tier] ?? 0) + active;
    out.trials += +r[c('Active Free Trial Introductory Offer Subscriptions')] || 0;
    out.retry += +r[c('Billing Retry')] || 0;
    out.grace += +r[c('Grace Period')] || 0;
    const [interval, count] = durationToInterval(r[c('Standard Subscription Duration')]);
    out.monthly += active * monthly(+r[c('Customer Price')] || 0, interval, count);
  }
  return out;
}

// ---------------------------------------------------------------- reconcile

/** Members on whom billing and the business's own records disagree, per tier. */
export function recordsMismatch(billing, records) {
  const tiers = [...new Set([...Object.keys(billing), ...Object.keys(records)])].sort();
  const breakdown = tiers
    .map((t) => ({ t, b: billing[t] ?? 0, r: records[t] ?? 0 }))
    .filter((x) => x.b !== x.r)
    .map((x) => ({ label: `${x.t}: billing ${x.b}, records ${x.r}`, value: Math.abs(x.b - x.r) }));
  return { value: breakdown.reduce((a, x) => a + x.value, 0), breakdown };
}

// ---------------------------------------------------------------- network (read-only)

/** A secret from the macOS login Keychain, never printed. */
export const keychain = (service) => execFileSync('/usr/bin/security', ['find-generic-password', '-s', service, '-w'], { encoding: 'utf8' }).trim();

async function stripeList(key, path, params = '') {
  const out = [];
  let after = null;
  do {
    const r = await fetch(`https://api.stripe.com/v1/${path}?limit=100${params}${after ? `&starting_after=${after}` : ''}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    if (!r.ok) throw Object.assign(Error(`stripe ${path}: ${r.status}`), { status: r.status });
    out.push(...j.data);
    after = j.has_more ? j.data.at(-1).id : null;
  } while (after);
  return out;
}

/** A filter dropping the business's known test subscriptions (config `stripe.ignore`). */
export const stripeKeep = (cfg = {}) => { const skip = new Set(cfg.ignore ?? []); return (s) => !skip.has(s.id); };

/** Card subscriptions (the business's products only, minus `ignore`d test ones) and their invoices since `sinceMs`. */
export async function fetchStripe({ keychainService, tierOf, sinceMs, ignore = [] }) {
  const key = keychain(keychainService);
  // Newer Stripe API versions keep the coupon at discount.source.coupon; expand it, falling back step by step.
  let raw;
  for (const expand of ['&expand[]=data.discounts.source.coupon', '&expand[]=data.discounts', '']) {
    try { raw = await stripeList(key, 'subscriptions', `&status=all${expand}`); break; }
    catch (e) { if ((e.status !== 403 && e.status !== 400) || expand === '') throw e; }
  }
  const subs = raw.filter(stripeKeep({ ignore })).map((s) => normaliseSubscription(s, tierOf)).filter(Boolean);
  const ids = new Set(subs.map((s) => s.id));
  const invoices = (await stripeList(key, 'invoices', `&created[gte]=${Math.floor(sinceMs / 1000)}`)).filter((i) => ids.has(invoiceSubscription(i)));
  return { subs, invoices };
}

function ascToken(pem, keyId, issuerId) {
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64u({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${b64u({ iss: issuerId, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })}`;
  return `${unsigned}.${crypto.sign('sha256', Buffer.from(unsigned), { key: pem, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

/** The latest App Store subscription report (Apple publishes them 1-2 days behind). */
export async function fetchApple({ keychainService, keyId, issuerId, vendorNumber, tierOf }) {
  const raw = keychain(keychainService);
  const pem = raw.includes('BEGIN') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const jwt = ascToken(pem, keyId, issuerId);
  for (let back = 1; back <= 5; back++) {
    const day = new Date(Date.now() - back * DAY).toISOString().slice(0, 10);
    const r = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?filter[frequency]=DAILY&filter[reportType]=SUBSCRIPTION&filter[reportSubType]=SUMMARY&filter[vendorNumber]=${vendorNumber}&filter[reportDate]=${day}&filter[version]=1_4`,
      { headers: { authorization: `Bearer ${jwt}`, accept: 'application/a-gzip' }, signal: AbortSignal.timeout(20000) });
    if (r.status === 404) continue;
    if (!r.ok) throw Error(`app store report: ${r.status}`);
    const lines = zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8').trim().split('\n').map((l) => l.split('\t'));
    return { day, ...appleSummary(lines[0], lines.slice(1), tierOf) };
  }
  throw Error('app store report: none in the last 5 days');
}

// ---------------------------------------------------------------- merge into a snapshot

const metric = (id, value, quality, note, breakdown) => ({ id, value, quality: value === null ? 'missing' : quality, note: String(note ?? '').slice(0, 200), ...(breakdown?.length && value !== null ? { breakdown: breakdown.slice(0, 20) } : {}) });
const put = (week, m) => { week.metrics = [...week.metrics.filter((x) => x.id !== m.id), m]; };
const tierRows = (o) => Object.entries(o).map(([label, value]) => ({ label, value })).sort(byLabel);

/** Override a snapshot's billing numbers with what Stripe and the App Store say.
 *  `records` is the business's own paying count by tier (for the mismatch check). Either source may be null;
 *  `missing` names configured sources that couldn't be read, which makes totals approximate. New customers
 *  come from Stripe only where the business's own records don't already report them. */
export function applyBilling(snapshot, { stripe, apple, records, timeZone, now = Date.now(), missing = /** @type {string[]} */ ([]) }) {
  const out = structuredClone(snapshot);
  if (stripe) {
    for (const week of out.weeks) {
      const m = cardWeekMetrics(stripe.subs, stripe.invoices, weekBounds(week.week, timeZone));
      put(week, metric('paying_churn_rate', m.churn.base ? Math.round((m.churn.lost / m.churn.base) * 1e4) / 1e4 : null, 'exact',
        m.churn.base ? `Card members from Stripe: ${m.churn.lost} of ${m.churn.base} stopped paying${apple ? '; App Store cancellations not included' : ''}` : 'Nobody was paying by card at the start of the week', m.churn.byTier));
      put(week, metric('failed_payments', m.failed, 'exact', `Card payments whose first attempt failed (Stripe invoices)`));
      const has = (id) => week.metrics.some((x) => x.id === id);
      const cardOnly = apple ? 'approx' : 'exact';
      if (!has('new_paying')) put(week, metric('new_paying', m.newPaying, cardOnly, apple ? 'Card only; App Store new subscribers not included' : 'Started paying in the week (Stripe; trials count when they convert)'));
      if (!has('new_mrr')) put(week, metric('new_mrr', Math.round(m.newMonthly * 100) / 100, cardOnly, apple ? 'Card only' : 'Billed prices of the new customers'));
      put(week, metric('payment_recovery_rate', m.recovery.cohort ? Math.round((m.recovery.recovered / m.recovery.cohort) * 1e4) / 1e4 : null, 'exact',
        m.recovery.cohort ? `${m.recovery.recovered} of ${m.recovery.cohort} card failures paid within 14 days` : 'No card payment failures to recover in the cohort week'));
    }
  }
  const [latest] = out.weeks;
  const card = stripe ? cardNow(stripe.subs, now) : null;
  if (card || apple) {
    const billing = {};
    for (const src of [card?.byTier, apple?.byTier]) for (const [t, n] of Object.entries(src ?? {})) billing[t] = (billing[t] ?? 0) + n;
    const total = Object.values(billing).reduce((a, n) => a + n, 0);
    const trials = (card?.trials ?? 0) + (apple?.trials ?? 0);
    const sources = [card && 'Stripe', apple && `the App Store (report ${apple.day})`].filter(Boolean).join(' and ');
    const gaps = missing.length ? `; ${missing.join(' and ')} unavailable` : '';
    put(latest, metric('paying_customers', total, missing.length ? 'approx' : 'exact', `Today, from ${sources}${trials ? `; ${trials} more on a free trial` : ''}${gaps}`, tierRows(billing)));
    const money = (card?.monthly ?? 0) + (apple?.monthly ?? 0);
    put(latest, metric('mrr', Math.round(money * 100) / 100, missing.length || card?.discountsKnown === false ? 'approx' : 'exact',
      `Billed prices${card ? (card.discountsKnown === false ? ' (card discounts unreadable: list prices)' : ', card discounts included') : ''}${apple ? '; App Store at customer price' : ''}${gaps}`));
    if (card) put(latest, metric('set_to_cancel', Object.values(card.cancelling).reduce((a, n) => a + n, 0), 'exact',
      `Card members who scheduled a cancellation${card.trialsCancelling ? `; ${card.trialsCancelling} trials too` : ''}${apple ? '; App Store auto-renew status not included' : ''}`, tierRows(card.cancelling)));
    if (records) {
      const mm = recordsMismatch(billing, records);
      put(latest, metric('records_mismatch', mm.value, 'exact',
        mm.value ? 'Billing and the membership records disagree; members may have the wrong access' : `Billing and the membership records agree${apple ? ' (App Store report is 1-2 days behind)' : ''}`, mm.breakdown));
    }
  }
  return out;
}
