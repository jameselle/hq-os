#!/usr/bin/env node
// The demo business's analytics adapter: INVENTED numbers for every adapter metric, so the Analytics page can be
// seen in full without connecting a real business. Deterministic (seeded by metric id and week), so screenshots
// are repeatable. Never use it for a real business. Contract: docs/guides/analytics.md.
const input = JSON.parse(await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => r(s || '{}')); }));
const now = input.now ? Date.parse(input.now) : Date.now();
const count = Math.min(Math.max(Number(input.weeks) || 12, 1), 26);
const currency = input.currency || 'AUD';

const isoWeek = (t) => {
  const d = new Date(t); const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  return `${dt.getUTCFullYear()}-W${String(Math.ceil(((dt - Date.UTC(dt.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7)).padStart(2, '0')}`;
};
const weeks = Array.from({ length: count }, (_, k) => isoWeek(now - (count - 1 - k) * 7 * 864e5));
// A small seeded wobble: the same id and week always give the same number.
const seed = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
const series = (id, base, { trend = 0, wobble = 0.12, int = false, dp = 3 } = {}) => weeks.map((week, i) => {
  const v = base * (1 + trend * (i - count + 1) / count) * (1 + (seed(id + week) - 0.5) * 2 * wobble);
  return { week, value: int ? Math.max(0, Math.round(v)) : Math.round(v * 10 ** dp) / 10 ** dp };
});
const metric = (id, opts) => {
  const { base, note = 'Demo data', breakdown, period, quality = 'exact', ...rest } = opts;
  const w = base === undefined ? undefined : series(id, base, rest);
  const value = opts.value ?? (w ? w.at(-1).value : null);
  return { id, value, quality, note, ...(w ? { weeks: w } : {}), ...(breakdown ? { breakdown, period: period ?? 'last 4 weeks' } : {}) };
};

const metrics = [
  // Get customers
  metric('comparison_signups', { base: 9, trend: 0.4, int: true }),
  metric('organic_signups', { base: 31, trend: 0.25, int: true }),
  metric('search_clicks', { base: 1840, trend: 0.3, int: true }),
  metric('signups_by_source', { value: 356, breakdown: [{ label: 'Search', value: 124 }, { label: 'Instagram', value: 88 }, { label: 'Direct', value: 61 }, { label: 'Partner codes', value: 39 }, { label: 'Referrals', value: 26 }, { label: 'Newsletter', value: 18 }] }),
  metric('followers', { base: 8420, trend: 0.18, wobble: 0.01, int: true }),
  metric('follows_per_post', { base: 14.2, trend: 0.2, dp: 1 }),
  metric('views_per_post', { base: 3150, trend: 0.15, int: true }),
  metric('link_clicks', { base: 212, trend: 0.2, int: true }),
  metric('walkthrough_coverage', { base: 0.62, trend: 0.3, wobble: 0.02 }),
  metric('walkthrough_plays', { base: 140, trend: 0.2, int: true }),
  metric('keyword_dms', { base: 96, trend: 0.3, int: true }),
  metric('dm_to_email_rate', { base: 0.34, wobble: 0.08 }),
  metric('email_to_trial_rate', { base: 0.18, wobble: 0.1 }),
  metric('partner_customers', { base: 23, trend: 0.3, wobble: 0.03, int: true }),
  metric('partner_d90_retention', { base: 0.71, wobble: 0.04 }),
  metric('landing_conversion_rate', { base: 0.041, wobble: 0.1, dp: 4 }),
  metric('tool_users', { base: 610, trend: 0.25, int: true }),
  metric('tool_signup_rate', { base: 0.052, wobble: 0.1, dp: 4 }),
  metric('feature_adoption', { value: 0.64, breakdown: [{ label: 'Roast picker', value: 0.81 }, { label: 'Skip a month', value: 0.37 }, { label: 'Brew guides', value: 0.52 }, { label: 'Gift boxes', value: 0.09 }], period: 'last 4 weeks, share of active customers' }),
  metric('ad_spend', { base: 450, wobble: 0.15, dp: 0 }),
  metric('community_members', { base: 1290, trend: 0.12, wobble: 0.01, int: true }),
  metric('community_paying', { base: 0.21, wobble: 0.03 }),
  metric('referral_signups', { base: 7, trend: 0.3, int: true }),
  metric('trial_to_paid_rate', { base: 0.43, wobble: 0.08 }),
  metric('checkouts_started', { base: 58, trend: 0.1, int: true }),
  metric('checkout_completion_rate', { base: 0.62, wobble: 0.06 }),
  metric('visitor_to_paid_rate', { base: 0.019, wobble: 0.1, dp: 4 }),
  metric('signups_by_market', { value: 356, breakdown: [{ label: 'Espresso', value: 141 }, { label: 'Filter', value: 118 }, { label: 'Decaf', value: 47 }, { label: 'Cold brew', value: 50 }] }),
  metric('promo_redemptions', { value: 41, breakdown: [{ label: 'PODCAST10', value: 17 }, { label: 'BREWCLUB', value: 12 }, { label: 'FIRSTBOX', value: 9 }, { label: 'GIFT20', value: 3 }] }),
  metric('referral_customers', { base: 15, trend: 0.3, wobble: 0.03, int: true }),
  metric('sales', { base: 287, trend: 0.08, int: true }),
  metric('revenue', { base: 6890, trend: 0.08, dp: 0 }),
  // Keep customers
  metric('time_to_activation', { base: 2.4, trend: -0.2, dp: 1 }),
  metric('at_risk_customers', { base: 19, trend: -0.1, int: true }),
  metric('helped_churn_gap', { base: 0.041, wobble: 0.2 }),
  metric('support_tickets', { value: 74, breakdown: [{ label: 'Delivery timing', value: 23 }, { label: 'Change roast', value: 17 }, { label: 'Billing', value: 13 }, { label: 'Damaged box', value: 9 }, { label: 'Pause or skip', value: 8 }, { label: 'Other', value: 4 }] }),
  metric('requests_closed', { base: 5, int: true, wobble: 0.4 }),
  metric('churn_to_rival', { value: 9, breakdown: [{ label: 'Rival roaster A', value: 5 }, { label: 'Supermarket beans', value: 3 }, { label: 'Rival roaster B', value: 1 }] }),
  metric('competitor_changes', { base: 4, int: true, wobble: 0.5 }),
  metric('incidents', { base: 1, int: true, wobble: 0.9 }),
  metric('stale_minutes', { base: 35, int: true, wobble: 0.8 }),
  metric('uptime_rate', { base: 0.997, wobble: 0.002, dp: 4 }),
  metric('save_rate', { base: 0.27, wobble: 0.12 }),
  metric('cancel_reasons', { value: 31, breakdown: [{ label: 'Too much coffee', value: 11 }, { label: 'Price', value: 8 }, { label: 'Moving', value: 4 }, { label: 'Went to a rival', value: 5 }, { label: 'Other', value: 3 }] }),
  metric('reactivated', { base: 6, int: true, wobble: 0.4 }),
  metric('bad_week_churn', { base: 0.052, wobble: 0.15 }),
  metric('track_record', { base: 1.04, wobble: 0.05, dp: 2 }),
  metric('academy_activation', { base: 0.66, wobble: 0.05 }),
  metric('offseason_churn', { value: 0.047, breakdown: [{ label: 'Summer months', value: 0.068 }, { label: 'Autumn months', value: 0.044 }, { label: 'Winter months', value: 0.031 }, { label: 'Spring months', value: 0.045 }], period: 'last 12 months, monthly churn' }),
  metric('releases', { base: 6, int: true, wobble: 0.4 }),
  metric('customer_bugs', { base: 1, int: true, wobble: 0.9 }),
  metric('top_customer_retention', { base: 0.92, wobble: 0.02 }),
  metric('account_incidents', { base: 0, int: true, wobble: 0 }),
  // Expand revenue
  metric('upgrade_prompt_rate', { base: 0.08, wobble: 0.15 }),
  metric('arpu', { base: 23.8, wobble: 0.02, dp: 2 }),
  metric('mrr_by_tier', { value: 5926.2, breakdown: [{ label: 'Classic box', value: 3290 }, { label: 'Roaster’s choice', value: 2140 }, { label: 'Office box', value: 496.2 }], period: 'now' }),
  metric('annual_share', { base: 0.18, trend: 0.2, wobble: 0.02 }),
  metric('addon_attach_rate', { base: 0.11, wobble: 0.06 }),
  metric('b2b_mrr', { base: 496, trend: 0.3, wobble: 0.02, dp: 0 }),
  metric('support_upgrades', { base: 3, int: true, wobble: 0.5 }),
  metric('price_change_net', { value: 312, note: 'Demo data: since the last price change, 8 weeks ago' }),
  metric('cross_sell_customers', { value: 0, quality: 'na', note: 'Demo data: one business only' }),
  metric('content_product_sales', { base: 12, int: true, wobble: 0.4 }),
  // Foundation
  metric('ltv', { base: 506, wobble: 0.04, dp: 0 }),
  metric('ltv_to_cac', { base: 12.4, wobble: 0.08, dp: 1 }),
  metric('complaints', { base: 0, int: true, wobble: 0 }),
].map((x) => (x.quality === 'na' ? { ...x, value: null } : x));

process.stdout.write(JSON.stringify({ version: 1, observedAt: new Date(now).toISOString(), currency, metrics }) + '\n');
