// Cost to win and payback, from the business's own beancount ledger: spend posted to
// Expenses:Advertising and Expenses:Commissions (and their sub-accounts), plus any spend the
// adapter reports that the ledger doesn't hold. Server-side (loadLedger reads files).
import fs from 'node:fs';
import path from 'node:path';
import type {Metric, ScorecardSnapshot} from './scorecard';

const SPEND = /^Expenses:(Advertising|Commissions)(:|$)/;
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

const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** One campaign's spend, all dates: Expenses:Advertising / Expenses:Commissions postings in a transaction tagged with
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

/** Fill cost_to_win and payback_months on the newest week, unless the adapter already measured them. */
export function applyCosts(s: ScorecardSnapshot, ledgerSpend: number): ScorecardSnapshot {
  const [latest] = s.weeks;
  const own = latest.metrics.find((x) => x.id === 'cost_to_win');
  if (own && own.quality !== 'missing') return s;

  const window = s.weeks.slice(0, WINDOW_WEEKS);
  const pick = (id: Metric['id']) => window.map((w) => w.metrics.find((x) => x.id === id)).filter((x): x is Metric => Boolean(x && x.value !== null));
  const paying = pick('new_paying'), mrr = pick('new_mrr');
  const spend = ledgerSpend + window.flatMap((w) => w.extraSpend ?? []).reduce((a, r) => a + r.value, 0);
  const newCount = paying.reduce((a, x) => a + (x.value ?? 0), 0);
  const newMrr = mrr.reduce((a, x) => a + (x.value ?? 0), 0);
  const quality = [...paying, ...mrr].some((x) => x.quality !== 'exact') ? 'approx' : 'exact';

  let cost: Metric, payback: Metric;
  if (!paying.length) [cost, payback] = [missing('cost_to_win', 'New paying customers unknown'), missing('payback_months', 'New paying customers unknown')];
  else if (spend <= 0) [cost, payback] = [missing('cost_to_win', 'No acquisition spend recorded'), missing('payback_months', 'No acquisition spend recorded')];
  else if (newCount <= 0) [cost, payback] = [missing('cost_to_win', 'No new paying customers in 4 weeks'), missing('payback_months', 'No new paying customers in 4 weeks')];
  else {
    const perCustomer = spend / newCount;
    const partial = paying.length < WINDOW_WEEKS;
    const extraOnly = ledgerSpend <= 0;
    const extraLabels = [...new Set(window.flatMap((w) => w.extraSpend ?? []).map((r) => r.label))].join(', ');
    const q = partial || extraOnly ? 'approx' : quality;
    const note = [
      extraOnly ? `Only ${extraLabels} recorded; no advertising spend in the ledger` : '',
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
