// Cost to win and payback, from the business's own beancount ledger: acquisition spend posted to
// Expenses:Advertising, Expenses:Partnerships and Expenses:Commissions (and their sub-accounts), the same three
// accounts unit economics counts, plus any spend the adapter reports that the ledger doesn't hold. Monthly totals
// imported from an accounting system are spread evenly over their month's days (acquisitionWindow), so a 4-week window
// gets its share of each month instead of all or nothing. Server-side (loadLedger reads files).
import fs from 'node:fs';
import path from 'node:path';
import type {Metric, ScorecardSnapshot} from './scorecard';

const SPEND = /^Expenses:(Advertising|Partnerships|Commissions)(:|$)/;
const WINDOW_WEEKS = 4;
const num = (s: string) => Number(s.replace(/,/g, ''));
const AMOUNT = '(-?[\\d,]+(?:\\.\\d+)?)';
const POSTING = new RegExp(`^\\s+([A-Za-z][\\w:-]*)\\s+${AMOUNT}\\s+([A-Z][A-Z0-9'._-]{0,22})(.*)$`);

/** A posting's value in the ledger's reporting currency, or null if it can't be converted. */
function inCurrency(amount: number, unit: string, rest: string, currency: string): number | null {
  if (unit === currency) return amount;
  const cost = new RegExp(`\\{\\s*${AMOUNT}\\s+${currency}\\s*\\}`).exec(rest);
  if (cost) return amount * num(cost[1]);
  const total = new RegExp(`@@\\s*${AMOUNT}\\s+${currency}\\b`).exec(rest);
  if (total) return Math.sign(amount) * Math.abs(num(total[1]));
  const each = new RegExp(`(?<!@)@\\s*${AMOUNT}\\s+${currency}\\b`).exec(rest);
  if (each) return amount * num(each[1]);
  return null;
}

/** Acquisition spend in [from, to): purchases add, refunds subtract, never below zero. */
export function acquisitionSpend(ledgerText: string, currency: string, from: Date, to: Date) {
  let total = 0, postings = 0, inWindow = false;
  for (const line of ledgerText.split('\n')) {
    const txn = /^(\d{4}-\d{2}-\d{2})\s+(\*|!|txn\b)/.exec(line);
    if (txn) { const at = Date.parse(txn[1] + 'T00:00:00Z'); inWindow = at >= from.getTime() && at < to.getTime(); continue; }
    if (!/^\s/.test(line)) { inWindow = false; continue; }
    const p = POSTING.exec(line);
    if (!inWindow || !p || !SPEND.test(p[1])) continue;
    const value = inCurrency(num(p[2]), p[3], p[4].replace(/;.*$/, ''), currency);
    if (value === null || !Number.isFinite(value) || value === 0) continue;
    total += value;
    postings++;
  }
  return {total: Math.max(0, Math.round(total * 100) / 100), postings};
}

// ---------------------------------------------------------------- monthly totals spread by day

const DAY = 864e5;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m: string) => MONTH_NAMES[Number(m.slice(5, 7)) - 1];
const daysInMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); };
const monthEnd = (m: string) => Date.parse(`${m}-01T00:00:00Z`) + daysInMonth(m) * DAY;
/** Days after the last imported month that are still estimated at its daily rate: the monthly import runs from the
 *  3rd of the next month, so a month that isn't in yet is normal for about five weeks; past this it's a stale import. */
export const ESTIMATE_DAYS = 45;

/** Acquisition spend in a window, with what was spread or estimated (see acquisitionWindow). */
export type WindowSpend = {
  total: number; postings: number;
  /** Months whose imported monthly totals were spread by day into the window, oldest first. */
  spread: string[];
  /** Days after the last imported month, estimated at that month's daily acquisition spend (not imported yet). */
  estimated: {month: string; days: number; basis: string}[];
  /** Days after the last imported month that are too late to estimate (the import is behind): no spend counted. */
  uncovered: {month: string; days: number}[];
  /** The ledger holds Expenses:Partnerships postings (imported affiliate costs), so the adapter's affiliate
   *  commissions (extraSpend) are already in it and aren't added again. */
  partnerships: boolean;
};

/** Acquisition spend in [from, to), day by day. A transaction tagged `#imported` and dated a month's last day is that
 *  month's total from the accounting system (lib/finance-costs.ts): it is spread evenly over the month's days, and
 *  only the days inside the window count. Every other posting counts on its own date, as acquisitionSpend does.
 *  Days after the last imported month, up to ESTIMATE_DAYS past its end, are estimated at that month's daily rate
 *  (the month isn't imported yet); later days count nothing and are listed as uncovered. Refunds subtract; the total
 *  never goes below zero. */
export function acquisitionWindow(ledgerText: string, currency: string, from: Date, to: Date): WindowSpend {
  type T = {date: string; monthly: boolean; values: number[]};
  const txns: T[] = [];
  let cur: T | null = null, partnerships = false;
  for (const line of ledgerText.split('\n')) {
    const h = /^(\d{4}-\d{2}-\d{2})\s+(\*|!|txn\b)(.*)$/.exec(line);
    if (h) {
      const date = h[1], last = Number(date.slice(8, 10)) === daysInMonth(date.slice(0, 7));
      cur = {date, monthly: last && /(^|\s)#imported\b/.test(h[3].replace(/"[^"]*"/g, '')), values: []};
      txns.push(cur);
      continue;
    }
    if (!/^\s/.test(line)) { cur = null; continue; }
    const p = POSTING.exec(line);
    if (!cur || !p || !SPEND.test(p[1])) continue;
    const value = inCurrency(num(p[2]), p[3], p[4].replace(/;.*$/, ''), currency);
    if (value === null || !Number.isFinite(value) || value === 0) continue;
    if (p[1].startsWith('Expenses:Partnerships')) partnerships = true;
    cur.values.push(value);
  }
  const imported = new Map<string, number>(); // month -> acquisition total imported for it (0 when none that month)
  for (const t of txns) if (t.monthly) imported.set(t.date.slice(0, 7), (imported.get(t.date.slice(0, 7)) ?? 0) + t.values.reduce((a, v) => a + v, 0));
  const lastImported = [...imported.keys()].sort().at(-1) ?? null;

  let total = 0, postings = 0;
  const spread = new Set<string>(), estimated = new Map<string, number>(), uncovered = new Map<string, number>();
  for (const t of txns) {
    if (t.monthly || !t.values.length) continue;
    const at = Date.parse(t.date + 'T00:00:00Z');
    if (at >= from.getTime() && at < to.getTime()) { total += t.values.reduce((a, v) => a + v, 0); postings += t.values.length; }
  }
  for (const t of txns) {
    if (!t.monthly || !t.values.length) continue;
    const m = t.date.slice(0, 7), start = Date.parse(`${m}-01T00:00:00Z`);
    const lo = Math.max(start, Math.ceil((from.getTime() - start) / DAY) * DAY + start), hi = Math.min(monthEnd(m), to.getTime());
    const days = hi > lo ? Math.ceil((hi - lo) / DAY) : 0;
    if (!days) continue;
    total += t.values.reduce((a, v) => a + v, 0) * days / daysInMonth(m);
    postings += t.values.length;
    spread.add(m);
  }
  if (lastImported) {
    const end = monthEnd(lastImported), rate = (imported.get(lastImported) ?? 0) / daysInMonth(lastImported);
    // Each whole day in the window after the last imported month.
    for (let d = Math.max(end, Math.ceil((from.getTime() - end) / DAY) * DAY + end); d < to.getTime(); d += DAY) {
      const m = new Date(d).toISOString().slice(0, 7);
      if (d < end + ESTIMATE_DAYS * DAY) { estimated.set(m, (estimated.get(m) ?? 0) + 1); total += rate; }
      else uncovered.set(m, (uncovered.get(m) ?? 0) + 1);
    }
  }
  return {
    total: Math.max(0, Math.round(total * 100) / 100), postings, spread: [...spread].sort(),
    estimated: [...estimated].map(([month, days]) => ({month, days, basis: lastImported!})),
    uncovered: [...uncovered].map(([month, days]) => ({month, days})), partnerships,
  };
}

/** What a window's spend was built from, for a note: "Sep spread by day; 4 days of Oct at Sep's daily rate, not
 *  imported yet". Empty when every posting counted on its own date. */
export function spreadNote(w: WindowSpend): string {
  return [
    w.spread.length ? `${w.spread.map(monthLabel).join(', ')} spend spread by day` : '',
    ...w.estimated.map((e) => `${e.days} days of ${monthLabel(e.month)} at ${monthLabel(e.basis)}'s daily rate, not imported yet`),
    ...w.uncovered.map((u) => `${u.days} days of ${monthLabel(u.month)} not imported, counted as none`),
  ].filter(Boolean).join('; ');
}

/** The four ISO weeks ending with `week` as [Monday 00:00 UTC of the first, Monday after the last). */
export function weeksWindow(week: string, weeks = 4): {from: Date; to: Date} {
  const [y, w] = week.split('-W').map(Number);
  const jan4 = Date.UTC(y, 0, 4), mon1 = jan4 - ((new Date(jan4).getUTCDay() || 7) - 1) * DAY;
  const to = mon1 + w * 7 * DAY;
  return {from: new Date(to - weeks * 7 * DAY), to: new Date(to)};
}

const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** One campaign's spend, all dates: Expenses:Advertising / Partnerships / Commissions postings in a transaction tagged with
 *  the metadata `campaign: "<id>"` (on the transaction, or on the posting itself), or posted to a sub-account named
 *  for the campaign (`Expenses:Advertising:Spring-Sale` for "spring-sale-2026-10-01" or "spring-sale"). */
export function campaignSpend(ledgerText: string, currency: string, id: string) {
  const name = id.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  let total = 0, postings = 0;
  type P = {account: string; value: number | null; tagged: boolean};
  let txn: {tagged: boolean; postings: P[]} | null = null;
  const flush = () => {
    if (!txn) return;
    for (const p of txn.postings) {
      if (!SPEND.test(p.account) || p.value === null || !Number.isFinite(p.value) || p.value === 0) continue;
      const seg = p.account.split(':')[2];
      if (txn.tagged || p.tagged || (seg && [id, name].includes(slugOf(seg)))) { total += p.value; postings++; }
    }
    txn = null;
  };
  for (const line of ledgerText.split('\n')) {
    if (/^(\d{4}-\d{2}-\d{2})\s+(\*|!|txn\b)/.test(line)) { flush(); txn = {tagged: false, postings: []}; continue; }
    if (!/^\s/.test(line)) { flush(); continue; }
    if (!txn) continue;
    const meta = /^\s+campaign:\s*"([^"]*)"/.exec(line);
    if (meta) {
      if (meta[1].trim() === id) { if (txn.postings.length) txn.postings[txn.postings.length - 1].tagged = true; else txn.tagged = true; }
      continue;
    }
    const p = POSTING.exec(line);
    if (p) txn.postings.push({account: p[1], value: inCurrency(num(p[2]), p[3], p[4].replace(/;.*$/, ''), currency), tagged: false});
  }
  flush();
  return {total: Math.max(0, Math.round(total * 100) / 100), postings};
}

/** The ledger's text with `include "…"` files inlined (relative to the including file, each once). */
export function loadLedger(file: string, seen = new Set<string>()): string {
  const abs = path.resolve(file);
  if (seen.has(abs) || seen.size > 50) return '';
  seen.add(abs);
  let text: string;
  try { text = fs.readFileSync(abs, 'utf8'); } catch { return ''; }
  return text.split('\n').map((line) => {
    const inc = /^include\s+"([^"]+)"/.exec(line);
    return inc ? loadLedger(path.resolve(path.dirname(abs), inc[1]), seen) : line;
  }).join('\n');
}

const missing = (id: Metric['id'], note: string): Metric => ({id, value: null, quality: 'missing', note});

/** Fill cost_to_win and payback_months on the newest week, unless the adapter already measured them. `spend` is the
 *  ledger's acquisition spend over the 4 weeks: a plain number, or acquisitionWindow's result, which also says what was
 *  spread or estimated and whether the ledger already holds partnerships (then the adapter's extraSpend, the
 *  product's own affiliate commissions, is left out so it isn't counted twice). */
export function applyCosts(s: ScorecardSnapshot, spend: number | WindowSpend): ScorecardSnapshot {
  const [latest] = s.weeks;
  const own = latest.metrics.find((x) => x.id === 'cost_to_win');
  if (own && own.quality !== 'missing') return s;

  const w = typeof spend === 'number' ? null : spend;
  const ledgerSpend = typeof spend === 'number' ? spend : spend.total;
  const window = s.weeks.slice(0, WINDOW_WEEKS);
  const pick = (id: Metric['id']) => window.map((w) => w.metrics.find((x) => x.id === id)).filter((x): x is Metric => Boolean(x && x.value !== null));
  const paying = pick('new_paying'), mrr = pick('new_mrr');
  const extraRows = w?.partnerships ? [] : window.flatMap((w) => w.extraSpend ?? []);
  const total = ledgerSpend + extraRows.reduce((a, r) => a + r.value, 0);
  const newCount = paying.reduce((a, x) => a + (x.value ?? 0), 0);
  const newMrr = mrr.reduce((a, x) => a + (x.value ?? 0), 0);
  const quality = [...paying, ...mrr].some((x) => x.quality !== 'exact') ? 'approx' : 'exact';

  let cost: Metric, payback: Metric;
  if (!paying.length) [cost, payback] = [missing('cost_to_win', 'New paying customers unknown'), missing('payback_months', 'New paying customers unknown')];
  else if (total <= 0) [cost, payback] = [missing('cost_to_win', 'No acquisition spend recorded'), missing('payback_months', 'No acquisition spend recorded')];
  else if (newCount <= 0) [cost, payback] = [missing('cost_to_win', 'No new paying customers in 4 weeks'), missing('payback_months', 'No new paying customers in 4 weeks')];
  else {
    const perCustomer = total / newCount;
    const partial = paying.length < WINDOW_WEEKS;
    const extraOnly = ledgerSpend <= 0;
    const spreadOrEstimated = Boolean(w && (w.spread.length || w.estimated.length || w.uncovered.length));
    const extraLabels = [...new Set(extraRows.map((r) => r.label))].join(', ');
    const q = partial || extraOnly || spreadOrEstimated ? 'approx' : quality;
    const note = [
      extraOnly ? `Only ${extraLabels} recorded; no advertising spend in the ledger` : '',
      w && !extraOnly ? `${s.currency} ${Math.round(total)} on ${newCount} new paying customers in 4 weeks` : '',
      w ? spreadNote(w) : '',
      partial ? `Spend covers 4 weeks; new customers reported for ${paying.length} of 4 weeks` : '',
    ].filter(Boolean).join('. ').slice(0, 200);
    cost = {id: 'cost_to_win', value: Math.round(perCustomer * 100) / 100, quality: q, note};
    payback = newMrr > 0
      ? {id: 'payback_months', value: Math.round((perCustomer / (newMrr / newCount)) * 10) / 10, quality: q, note}
      : missing('payback_months', 'New MRR unknown');
  }
  const metrics = [...latest.metrics.filter((x) => x.id !== 'cost_to_win' && x.id !== 'payback_months'), cost, payback];
  return {...s, weeks: [{...latest, metrics}, ...s.weeks.slice(1)]};
}
