// The scorecard's metric catalogue, snapshot types and display formatting. Client-safe: no node
// imports, so the CLI, the API and the CEO card all format numbers the same way.
import {LEVERS, type Lever} from './workflows';

export type Quality = 'exact' | 'approx' | 'missing';
export type Unit = 'count' | 'rate' | 'money' | 'months';

export const METRICS = {
  new_signups: {lever: 'get', label: 'New signups', unit: 'count'},
  new_paying: {lever: 'get', label: 'New paying customers', unit: 'count'},
  new_mrr: {lever: 'get', label: 'New MRR', unit: 'money'},
  activation_rate: {lever: 'keep', label: 'Activation in week 1', unit: 'rate'},
  paying_churn_rate: {lever: 'keep', label: 'Paying churn', unit: 'rate'},
  failed_payments: {lever: 'keep', label: 'Failed payments', unit: 'count'},
  payment_recovery_rate: {lever: 'keep', label: 'Payments recovered', unit: 'rate'},
  set_to_cancel: {lever: 'keep', label: 'Set to cancel', unit: 'count'},
  weekly_active_rate: {lever: 'keep', label: 'Weekly active customers', unit: 'rate'},
  upgrades: {lever: 'expand', label: 'Upgrades', unit: 'count'},
  downgrades: {lever: 'expand', label: 'Downgrades', unit: 'count'},
  nrr: {lever: 'expand', label: 'Net revenue retention', unit: 'rate'},
  mrr: {lever: 'base', label: 'MRR', unit: 'money'},
  paying_customers: {lever: 'base', label: 'Paying customers', unit: 'count'},
  cost_to_win: {lever: 'base', label: 'Cost to win a customer', unit: 'money'},
  payback_months: {lever: 'base', label: 'Payback', unit: 'months'},
  known_source_share: {lever: 'base', label: 'Customers with a known source', unit: 'rate'},
  records_mismatch: {lever: 'base', label: 'Billing vs our records', unit: 'count'},
} as const satisfies Record<string, {lever: Lever; label: string; unit: Unit}>;
export type MetricId = keyof typeof METRICS;

export type Row = {label: string; value: number};
export type Metric = {id: MetricId; value: number | null; quality: Quality; note: string; breakdown?: Row[]};
export type Week = {week: string; metrics: Metric[]; extraSpend?: Row[]};
export type ScorecardSnapshot = {version: 1; observedAt: string; currency: string; weeks: Week[]};

const LEVER_ORDER = Object.keys(LEVERS) as Lever[];
const IDS = Object.keys(METRICS) as MetricId[];

export function formatValue(unit: Unit, value: number | null, currency: string): string {
  if (value === null) return '—';
  if (unit === 'rate') return `${(value * 100).toFixed(1)}%`;
  if (unit === 'months') return `${value.toFixed(1)} mo`;
  if (unit === 'money') {
    const dp = Math.abs(value) >= 100 ? 0 : 2;
    return new Intl.NumberFormat('en-AU', {style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: dp, maximumFractionDigits: dp}).format(value);
  }
  return new Intl.NumberFormat('en-AU', {maximumFractionDigits: 0}).format(value);
}

export type ScorecardRow = Metric & {lever: Lever; label: string; unit: Unit; change: number | null};

/** This week's metrics (every catalogue metric, absent ones as missing, unless `complete` is false), lever by lever in catalogue order, with the change from the week before. */
export function scorecardRows(s: ScorecardSnapshot, complete = true): ScorecardRow[] {
  const [now, before] = s.weeks;
  const prev = (id: MetricId) => before?.metrics.find((m) => m.id === id)?.value ?? null;
  const reported = new Set(now.metrics.map((m) => m.id));
  const absent: Metric[] = complete ? IDS.filter((id) => !reported.has(id)).map((id) => ({id, value: null, quality: 'missing', note: 'Not reported by the adapter'})) : [];
  return [...now.metrics, ...absent]
    .map((m) => ({...m, ...METRICS[m.id], change: m.value !== null && prev(m.id) !== null ? Math.round((m.value - prev(m.id)!) * 1000) / 1000 : null}))
    .sort((a, b) => LEVER_ORDER.indexOf(a.lever) - LEVER_ORDER.indexOf(b.lever) || IDS.indexOf(a.id) - IDS.indexOf(b.id));
}

/** SVG polyline points for a week series; missing weeks are skipped, a flat series sits mid-box. */
export function sparkline(values: (number | null)[], width: number, height: number): string {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return '';
  const ys = pts.map(([, v]) => v), min = Math.min(...ys), max = Math.max(...ys);
  const r = (n: number) => String(Math.round(n * 10) / 10);
  const x = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * width : 0);
  const y = (v: number) => (max === min ? height / 2 : height - ((v - min) / (max - min)) * height);
  return pts.map(([i, v]) => `${r(x(i))},${r(y(v))}`).join(' ');
}

/** One metric's values, oldest first: HQ's kept weekly history plus the adapter's own weeks (which win). */
export function weekSeries(history: {week: string; metrics: Metric[]}[], weeks: {week: string; metrics: Metric[]}[], id: MetricId, last: number): (number | null)[] {
  const byWeek = new Map<string, number | null>();
  for (const w of [...history, ...weeks]) byWeek.set(w.week, w.metrics.find((m) => m.id === id)?.value ?? null);
  return [...byWeek.keys()].sort().slice(-last).map((k) => byWeek.get(k)!);
}
