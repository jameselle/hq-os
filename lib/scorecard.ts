// The growth scorecard: lever numbers per business, from a private read-only adapter.
// HQ accepts aggregates only (counts, sums, rates and short labels), rebuilds every snapshot
// field by field, and keeps it with one history file per ISO week in the business's private
// directory. A missing number stays missing; it is never shown as zero. See docs/guides/scorecard.md.
import fs from 'node:fs';
import path from 'node:path';
import {businessDir, getProfile, hqRoot, ledgerPath} from './store';
import {execAdapter, readConnection, writePrivateJson} from './private-adapter';
import {acquisitionWindow, applyCosts, loadLedger, weeksWindow} from './ledger-spend';

export {METRICS} from './scorecard-metrics';
export type {Quality, Unit, MetricId, Row, Metric, Week, ScorecardSnapshot} from './scorecard-metrics';
import {METRICS, type Metric, type MetricId, type Row, type ScorecardSnapshot} from './scorecard-metrics';

export type ScorecardState = {
  connected: boolean; demo: boolean; snapshot: ScorecardSnapshot | null;
  stale: boolean; failed: boolean; failedAt: string | null;
  /** The kept snapshot's currency when it no longer matches the profile's (the snapshot is then hidden). */
  currencyChanged: string | null;
  history: {week: string; metrics: Metric[]}[];
};

export const LIMITS = {weeks: 26, breakdown: 20, extraSpend: 10, text: 200, staleHours: 36};

/** Shapes that mean a person, an account or a secret slipped into a label or note. */
export const PII_PATTERNS: RegExp[] = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/,                                           // email
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,  // uuid
  /\b[0-9a-f]{32,}\b/i,                                                 // long hex
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./,                                // jwt
  /\b[a-z]{2,6}_[A-Za-z0-9]{8,}\b/,                                     // provider ids (cus_…, acct_…, sub_…)
  /https?:\/\/\S*\?/i,                                                  // url with a query string
];
const DIGITS = (s: string) => s.replace(/\D/g, '').length;
/** A long token: 40+ url-safe characters with real digit content (a hyphenated phrase isn't one). */
const looksLikeToken = (s: string) => (s.match(/[A-Za-z0-9+/_=-]{40,}/g) ?? []).some((run) => DIGITS(run) >= 4 && /[A-Za-z]/.test(run));
/** Nine or more digits in one run, once dates, decimals and thousands are set aside. */
const looksLikePhone = (s: string) => {
  const rest = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(/\b\d+\.\d{1,2}\b(?!\.\d)/g, ' ').replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, ' ');
  return (rest.match(/[+(]?\d[\d\s().-]*\d/g) ?? []).some((run) => DIGITS(run) >= 9);
};
export const looksPrivate = (s: string) => PII_PATTERNS.some((r) => r.test(s)) || looksLikeToken(s) || looksLikePhone(s);

const text = (s: unknown): s is string => typeof s === 'string' && s.length <= LIMITS.text && !looksPrivate(s);
const label = (s: unknown) => text(s) && (s as string).trim().length > 0;
const amount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function rowsProblem(r: unknown, max: number, at: string): string | null {
  if (!Array.isArray(r) || r.length > max) return at;
  for (let i = 0; i < r.length; i++) {
    if (!r[i] || !label(r[i].label)) return `${at}[${i}].label`;
    if (!amount(r[i].value)) return `${at}[${i}].value`;
  }
  return null;
}

function metricProblem(m: any, at: string): string | null {
  if (!m || !Object.hasOwn(METRICS, m.id)) return `${at}.id`;
  if (!['exact', 'approx', 'missing'].includes(m.quality)) return `${at}.quality`;
  if (!text(m.note)) return `${at}.note`;
  if (m.quality === 'missing' ? m.value !== null : !amount(m.value)) return `${at}.value`;
  if (m.value !== null && METRICS[m.id as MetricId].unit === 'count' && !Number.isSafeInteger(m.value)) return `${at}.value`;
  return m.breakdown === undefined ? null : rowsProblem(m.breakdown, LIMITS.breakdown, `${at}.breakdown`);
}

/** The first field that keeps a snapshot out, as a path (never its value), or null if it's acceptable. */
export function scorecardProblem(v: unknown, currency: string): string | null {
  const x = v as ScorecardSnapshot;
  if (!x || x.version !== 1) return 'version';
  if (x.currency !== currency) return 'currency';
  if (typeof x.observedAt !== 'string' || !ISO.test(x.observedAt) || !Number.isFinite(Date.parse(x.observedAt))) return 'observedAt';
  if (!Array.isArray(x.weeks) || !x.weeks.length || x.weeks.length > LIMITS.weeks) return 'weeks';
  for (let i = 0; i < x.weeks.length; i++) {
    const w = x.weeks[i], at = `weeks[${i}]`;
    if (!w || !WEEK.test(w.week) || (i > 0 && !(w.week < x.weeks[i - 1].week))) return `${at}.week`;
    if (!Array.isArray(w.metrics)) return `${at}.metrics`;
    for (let j = 0; j < w.metrics.length; j++) { const p = metricProblem(w.metrics[j], `${at}.metrics[${j}]`); if (p) return p; }
    if (new Set(w.metrics.map((m) => m.id)).size !== w.metrics.length) return `${at}.metrics`;
    if (w.extraSpend !== undefined) { const p = rowsProblem(w.extraSpend, LIMITS.extraSpend, `${at}.extraSpend`); if (p) return p; }
  }
  return null;
}
export const validScorecard = (v: unknown, currency: string): v is ScorecardSnapshot => scorecardProblem(v, currency) === null;

const row = ({label, value}: Row): Row => ({label, value});
export function rebuildScorecard(s: ScorecardSnapshot): ScorecardSnapshot {
  return {
    version: 1, observedAt: new Date(s.observedAt).toISOString(), currency: s.currency,
    weeks: s.weeks.map((w) => ({
      week: w.week,
      metrics: w.metrics.map((m) => ({id: m.id, value: m.value, quality: m.quality, note: m.note, ...(m.breakdown ? {breakdown: m.breakdown.map(row)} : {})})),
      ...(w.extraSpend ? {extraSpend: w.extraSpend.map(row)} : {}),
    })),
  };
}

// ---- storage

const CONNECTION = 'scorecard-connection.json';
const files = (slug: string) => {
  const dir = businessDir(slug);
  return {dir, connection: path.join(dir, CONNECTION), snapshot: path.join(dir, 'scorecard-snapshot.json'), state: path.join(dir, 'scorecard-state.json'), history: path.join(dir, 'scorecard')};
};
const readJson = (file: string): unknown => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
export const demoAdapter = () => path.join(hqRoot(), 'templates', 'scorecard', 'demo-adapter.mjs');

export function scorecardState(slug: string, now: Date = new Date()): ScorecardState {
  const profile = getProfile(slug);
  if (!profile) throw Error('Unknown business');
  const f = files(slug);
  const connected = fs.existsSync(f.connection);
  const demo = !connected && Boolean(profile.demo);
  const raw = readJson(f.snapshot);
  const snapshot = validScorecard(raw, profile.currency) ? raw : null;
  const kept = (raw as {currency?: unknown} | null)?.currency;
  const currencyChanged = !snapshot && typeof kept === 'string' && kept !== profile.currency ? kept.slice(0, 8) : null;
  const failedAt = (readJson(f.state) as {failedAt?: string} | null)?.failedAt ?? null;
  const age = snapshot ? now.getTime() - Date.parse(snapshot.observedAt) : Infinity;
  const history = (fs.existsSync(f.history) ? fs.readdirSync(f.history) : [])
    .filter((n) => /^\d{4}-W\d{2}\.json$/.test(n)).sort()
    .map((n) => readJson(path.join(f.history, n)))
    .filter((s): s is ScorecardSnapshot => validScorecard(s, profile.currency))
    .map((s) => ({week: s.weeks[0].week, metrics: s.weeks[0].metrics}));
  return {connected, demo, snapshot, stale: age < 0 || age > LIMITS.staleHours * 3600e3, failed: Boolean(failedAt), failedAt, currencyChanged, history};
}

/** One refresh per business at a time. A lock older than any adapter run (2 min) is left over from a crash. */
function takeLock(file: string): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { fs.closeSync(fs.openSync(file, 'wx', 0o600)); return true; } catch {
      try { if (Date.now() - fs.statSync(file).mtimeMs > 120e3) { fs.rmSync(file, {force: true}); continue; } } catch { continue; }
      return false;
    }
  }
  return false;
}

/** Run the business's adapter (or the synthetic demo one), keep the result and the week's history. */
export async function runScorecard(slug: string, now: Date = new Date()): Promise<ScorecardState> {
  const profile = getProfile(slug);
  if (!profile) throw Error('Unknown business');
  const f = files(slug);
  const input = {action: 'report', weeks: 12, currency: profile.currency};
  const lock = path.join(f.dir, 'scorecard.lock');
  if (!takeLock(lock)) throw Error('A scorecard refresh is already running for this business');
  try {
    const command = fs.existsSync(f.connection) ? readConnection(slug, CONNECTION).command
      : profile.demo ? [process.execPath, demoAdapter()] : null;
    if (!command) throw Error('No scorecard connection');
    const value = await execAdapter(command, input);
    const problem = scorecardProblem(value, profile.currency);
    if (problem) throw Error(`Invalid scorecard snapshot at ${problem}`);
    const ledger = loadLedger(ledgerPath(slug));
    const rebuilt = rebuildScorecard(value as ScorecardSnapshot);
    // The spend window is the 4 weeks ending with the newest reported week, monthly imported totals spread by day.
    const {from, to} = weeksWindow(rebuilt.weeks[0].week);
    const clean = applyCosts(rebuilt, acquisitionWindow(ledger, profile.currency, from, new Date(Math.min(to.getTime(), now.getTime()))));
    writePrivateJson(f.snapshot, clean);
    fs.mkdirSync(f.history, {recursive: true, mode: 0o700});
    writePrivateJson(path.join(f.history, `${clean.weeks[0].week}.json`), clean);
    const weeks = fs.readdirSync(f.history).filter((n) => /^\d{4}-W\d{2}\.json$/.test(n)).sort();
    for (const old of weeks.slice(0, Math.max(0, weeks.length - LIMITS.weeks))) fs.rmSync(path.join(f.history, old));
    fs.rmSync(f.state, {force: true});
  } catch (e) {
    writePrivateJson(f.state, {failedAt: now.toISOString()});
    throw e;
  } finally {
    fs.rmSync(lock, {force: true});
  }
  return scorecardState(slug, now);
}
