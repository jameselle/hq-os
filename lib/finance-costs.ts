// Running costs from the business's accounting system: a monthly profit and loss report (first: Xero, read through
// the owner's Composio connector) becomes `finance/costs-<source>.beancount`, included once from `ledger.beancount`.
// Like the finance sync's file it is rewritten whole on every import (nothing is posted twice, hand-written entries are
// never touched), checked with bean-check, and rolled back if the check fails. Only expense lines are imported:
// income already comes from billing (lib/finance-sync.ts), so the report's income, totals and summary rows are ignored.
// Server-only (the writer touches files). Guide: docs/guides/finance.md, "Connect your accounting system".
import fs from "node:fs";
import path from "node:path";

import { beanCheck, moneyByMonth, segment } from "./finance-sync";
import { loadLedger } from "./ledger-spend";
import { looksPrivate } from "./scorecard";
import { getProfile, ledgerPath } from "./store";

export type CostLine = { account: string; section: string; amount: number };
export type CostMonth = { month: string; lines: CostLine[] };
/** The generic input any accounting system can be turned into (`--from json`). */
export type CostImport = { version: 1; source: string; currency: string; months: CostMonth[] };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// ---------------------------------------------------------------- reading a Xero profit and loss report

/** "30 Sep 26", "Sep 2026", "30 September 2026" or "2026-09-30" as "2026-09"; null if it isn't a date. */
export function monthOf(header: string): string | null {
  const t = header.trim();
  const iso = /^(\d{4})-(\d{2})(-\d{2})?$/.exec(t);
  if (iso) return MONTH.test(`${iso[1]}-${iso[2]}`) ? `${iso[1]}-${iso[2]}` : null;
  const m = /^(?:\d{1,2}\s+)?([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  const i = MONTHS.indexOf(m[1].toLowerCase());
  if (i < 0) return null;
  const y = m[2].length === 2 ? `20${m[2]}` : m[2];
  return `${y}-${String(i + 1).padStart(2, "0")}`;
}

/** A report cell as a number: "1,234.50", "-12.00" and "(12.00)" all parse; blanks are 0; anything else is NaN. */
function amountOf(v: unknown): number {
  const s = String(v ?? "").trim().replace(/,/g, "");
  if (!s) return 0;
  const neg = /^\((.*)\)$/.exec(s);
  return neg ? -Number(neg[1]) : Number(s);
}

type XRow = { RowType?: string; Title?: string; Cells?: { Value?: unknown }[]; Rows?: XRow[] };

/** The report inside whatever wraps it: the raw Composio tool response, `{ Reports: [...] }`, or the report itself. */
function findReport(v: unknown, depth = 0): { Rows: XRow[] } | null {
  if (!v || typeof v !== "object" || depth > 6) return null;
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.Reports) && o.Reports[0] && typeof o.Reports[0] === "object") return findReport(o.Reports[0], depth + 1);
  if (Array.isArray(o.Rows) && (o.Rows as XRow[]).some((r) => r?.RowType === "Header")) return { Rows: o.Rows as XRow[] };
  for (const k of ["data", "response", "result", "results"]) {
    const inner = Array.isArray(o[k]) ? (o[k] as unknown[])[0] : o[k];
    const r = findReport(inner, depth + 1);
    if (r) return r;
  }
  return null;
}

/** A section holds costs when its title says so ("Less Cost of Sales", "Less Operating Expenses", "Less Other
 *  Expenses"). Income sections and the untitled ones that hold Gross Profit and Net Profit don't. */
const costSection = (title: string) => /cost of sales|cost of goods|expense/i.test(title) && !/income|revenue/i.test(title);
const sectionName = (title: string) => title.replace(/^\s*less\s+/i, "").trim();

/** A Xero profit and loss report (multi-period, by month) as one entry per month, oldest first: expense lines only,
 *  zero lines dropped. Throws when the report has no month columns. */
export function parseXeroReport(raw: unknown): CostMonth[] {
  const report = findReport(raw);
  if (!report) throw Error("That isn't a Xero profit and loss report (no Reports[0].Rows with a header row)");
  const header = report.Rows.find((r) => r.RowType === "Header");
  const cols = (header?.Cells ?? []).slice(1).map((c) => monthOf(String(c?.Value ?? "")));
  if (!cols.length || cols.some((c) => !c)) throw Error("The report's columns aren't months: fetch it with timeframe MONTH");
  if (new Set(cols).size !== cols.length) throw Error("The report has the same month twice: fetch it with timeframe MONTH");
  const months = new Map<string, Map<string, CostLine>>(cols.map((m) => [m!, new Map()]));
  const walk = (rows: XRow[], section: string | null) => {
    for (const r of rows ?? []) {
      if (r.RowType === "Section") { walk(r.Rows ?? [], costSection(r.Title ?? "") ? sectionName(r.Title ?? "") : null); continue; }
      if (r.RowType !== "Row" || !section) continue; // SummaryRow is a total
      const cells = r.Cells ?? [];
      const account = String(cells[0]?.Value ?? "").trim();
      if (!account || /^total\b/i.test(account)) continue;
      cols.forEach((m, i) => {
        const amount = amountOf(cells[i + 1]?.Value);
        if (!Number.isFinite(amount)) throw Error(`"${account}" has a value that isn't a number`);
        if (!amount) return;
        const lines = months.get(m!)!;
        const prev = lines.get(account);
        lines.set(account, { account, section, amount: cents((prev?.amount ?? 0) + amount) });
      });
    }
  };
  walk(report.Rows, null);
  return [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, lines]) => ({ month, lines: [...lines.values()] }));
}

// ---------------------------------------------------------------- the generic input

/** The first field that keeps a generic costs file out (a path, never its value), or null. */
export function costsProblem(v: unknown): string | null {
  const x = v as CostImport;
  if (!x || x.version !== 1) return "version";
  if (typeof x.source !== "string" || !/^[a-z0-9][a-z0-9-]{0,30}$/.test(x.source)) return "source";
  if (typeof x.currency !== "string" || !/^[A-Z]{3}$/.test(x.currency)) return "currency";
  if (!Array.isArray(x.months) || x.months.length > 120) return "months";
  const seen = new Set<string>();
  for (let i = 0; i < x.months.length; i++) {
    const m = x.months[i], at = `months[${i}]`;
    if (!m || typeof m.month !== "string" || !MONTH.test(m.month) || seen.has(m.month)) return `${at}.month`;
    seen.add(m.month);
    if (!Array.isArray(m.lines) || m.lines.length > 500) return `${at}.lines`;
    for (let j = 0; j < m.lines.length; j++) {
      const l = m.lines[j], lat = `${at}.lines[${j}]`;
      if (!l || typeof l.account !== "string" || !l.account.trim() || l.account.length > 80) return `${lat}.account`;
      if (l.section !== undefined && (typeof l.section !== "string" || l.section.length > 80)) return `${lat}.section`;
      if (typeof l.amount !== "number" || !Number.isFinite(l.amount) || Math.abs(l.amount) > 1e9) return `${lat}.amount`;
    }
  }
  return null;
}

/** A line's account name or section that looks like a person, an email or an id: kept out of the ledger. */
export function privateLine(months: CostMonth[]): string | null {
  for (const m of months) for (const l of m.lines) if (looksPrivate(l.account) || looksPrivate(l.section ?? "")) return `${m.month}: an account name looks like a person or an id`;
  return null;
}

// ---------------------------------------------------------------- where each cost lands

export type CostCategory = "Advertising" | "Partnerships" | "Operating";

/** The category an accounting system's account name falls in. Affiliates and partners go to Partnerships, never
 *  Commissions: the growth scorecard already counts the commissions the product pays its affiliates as acquisition
 *  spend, so posting the accounting system's affiliate line to Expenses:Commissions would count them twice in cost
 *  to win. Advertising is counted (Expenses:Advertising); everything else (hosting, data, software, wages) is Operating. */
export function costCategory(account: string): CostCategory {
  if (/affiliat|partner|referr|commission|introduc/i.test(account)) return "Partnerships";
  if (/advertis|marketing|promotion|\bads?\b|sponsor/i.test(account)) return "Advertising";
  return "Operating";
}

export const costAccount = (account: string) => `Expenses:${costCategory(account)}:${segment(account)}`;
export const balancingAccount = (source: string) => `Liabilities:Imported:${segment(source.charAt(0).toUpperCase() + source.slice(1))}`;
export const costsFile = (source: string) => `costs-${source}.beancount`;

const cents = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => n.toFixed(2);
const quote = (s: string) => `"${s.replace(/["\\]/g, "")}"`;
const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

/** An amount to take out of an imported account's month before it lands (a cost that belongs to another business,
 *  or a charge being refunded), with the reason, which is written into the costs file. Kept per business in
 *  `finance/costs-adjustments.json` so every import, the monthly refresh included, applies it. */
export type CostAdjustment = { month: string; account: string; amount: number; reason: string };
export type ImportOptions = { share?: number; since?: string; adjustments?: CostAdjustment[] };

/** Take each adjustment out of its month and account (company amounts, so before any share). An adjustment that
 *  matches no line, or is bigger than the line, stops the import rather than guessing. */
export function applyAdjustments(months: CostMonth[], adjustments: CostAdjustment[] = []): CostMonth[] {
  const out = months.map((m) => ({ month: m.month, lines: m.lines.map((l) => ({ ...l })) }));
  for (const a of adjustments) {
    if (!MONTH.test(a.month) || !a.account || !(a.amount > 0) || !a.reason?.trim()) throw Error(`adjustment needs month (YYYY-MM), account, a positive amount and a reason: ${JSON.stringify(a)}`);
    const line = out.find((m) => m.month === a.month)?.lines.find((l) => l.account.toLowerCase() === a.account.toLowerCase());
    if (!line) continue; // that month isn't in this import (outside the window): nothing to take out
    if (a.amount > line.amount + 0.005) throw Error(`adjustment of ${a.amount} is more than ${a.account} in ${a.month} (${line.amount})`);
    line.amount = cents(line.amount - a.amount);
  }
  return out.map((m) => ({ ...m, lines: m.lines.filter((l) => l.amount !== 0) }));
}

/** The months to import: from `since` on, each amount times `share` (a business's part of a shared company's costs),
 *  rounded to the cent, zero lines dropped. */
export function applyOptions(months: CostMonth[], o: ImportOptions = {}): CostMonth[] {
  const share = o.share ?? 1;
  if (!(share > 0 && share <= 1)) throw Error("share must be more than 0 and at most 1");
  if (o.since !== undefined && !MONTH.test(o.since)) throw Error("since must be a month, YYYY-MM");
  return applyAdjustments(months, o.adjustments).filter((m) => !o.since || m.month >= o.since)
    .map((m) => ({ month: m.month, lines: m.lines.map((l) => ({ ...l, amount: cents(l.amount * share) })).filter((l) => l.amount !== 0) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Label of a source for people: "xero" -> "Xero". */
export const sourceLabel = (source: string) => source === "json" ? "your accounting system" : source.charAt(0).toUpperCase() + source.slice(1);

/** The costs file's text: opens dated the first imported month (for every account not already open in the ledger by
 *  then), then one transaction per account per month on the month's last day, balanced against the import's own
 *  liability account. `opened` is every account the rest of the ledger already opens, with its date. */
export function costsText(imp: CostImport, o: ImportOptions & { observedAt: string; opened?: Map<string, string> }): string {
  const months = applyOptions(imp.months, o);
  const label = sourceLabel(imp.source), bal = balancingAccount(imp.source);
  const first = months.find((m) => m.lines.length)?.month;
  const used = new Set<string>([bal]);
  for (const m of months) for (const l of m.lines) used.add(costAccount(l.account));
  const openOn = first ? `${first}-01` : null;
  const opens: string[] = [];
  for (const acct of [...used].sort()) {
    const had = o.opened?.get(acct);
    if (had && openOn && had > openOn) throw Error(`${acct} is already opened in the ledger on ${had}, after the first imported month (${first}): move that open to ${openOn} or earlier, or import with --since ${had.slice(0, 7)}`);
    if (!had && openOn) opens.push(`${openOn} open ${acct} ${imp.currency}`);
  }
  const out = [
    `; Written by HQ from ${label}'s profit and loss report: monthly cost totals per account, no payees.`,
    `; REWRITTEN ON EVERY IMPORT: don't edit; put your own entries in ledger.beancount. Imported ${o.observedAt}.`,
    ...(o.share !== undefined && o.share !== 1 ? [`; This business's share of the company's costs: ${o.share}.`] : []),
    ...(o.since ? [`; From ${o.since} on.`] : []),
    ...(o.adjustments ?? []).filter((a) => imp.months.some((m) => m.month === a.month)).map((a) => `; Taken out of ${a.account} in ${a.month}: ${money(a.amount)} ${imp.currency} (${a.reason.replace(/\s+/g, " ")}).`),
    "", ...opens, "",
  ];
  for (const m of months) {
    for (const l of [...m.lines].sort((a, b) => costAccount(a.account).localeCompare(costAccount(b.account)))) {
      out.push(`${lastDay(m.month)} * ${quote(label)} ${quote(`Costs from ${label}: ${l.account}`)} #imported`);
      out.push(`  ${costAccount(l.account).padEnd(50)} ${money(l.amount).padStart(12)} ${imp.currency}`);
      out.push(`  ${bal.padEnd(50)} ${money(-l.amount).padStart(12)} ${imp.currency}`, "");
    }
  }
  return out.join("\n");
}

/** Every `open` in a ledger's text (includes inlined), first date per account. */
export function openedAccounts(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = /^(\d{4}-\d{2}-\d{2})\s+open\s+([A-Z][A-Za-z0-9:-]*)/.exec(line);
    if (m && (!out.has(m[2]) || out.get(m[2])! > m[1])) out.set(m[2], m[1]);
  }
  return out;
}

function ensureInclude(ledger: string, file: string, source: string) {
  const text = fs.existsSync(ledger) ? fs.readFileSync(ledger, "utf8") : "";
  if (new RegExp(`^include\\s+"${file.replace(/[.]/g, "\\.")}"`, "m").test(text)) return;
  fs.appendFileSync(ledger, `\n; Monthly running costs from ${sourceLabel(source)}, written by HQ (npm run hq -- finance import-costs <slug> …).\ninclude "${file}"\n`);
}

export type CostsSummary = { file: string; months: { month: string; total: number; byCategory: Record<string, number> }[]; totals: Record<string, number>; total: number; from: string | null; to: string | null };

/** Totals per month and category from a costs file's text. */
export function summariseCosts(text: string, currency: string, file = ""): CostsSummary {
  const months = moneyByMonth(text, currency).filter((m) => m.costs !== 0)
    .map((m) => ({ month: m.month, total: m.costs, byCategory: m.byCost }));
  const totals: Record<string, number> = {};
  for (const m of months) for (const [k, v] of Object.entries(m.byCategory)) totals[k] = cents((totals[k] ?? 0) + v);
  return { file, months, totals, total: cents(months.reduce((n, m) => n + m.total, 0)), from: months[0]?.month ?? null, to: months.at(-1)?.month ?? null };
}

/** Write the costs file for a business, include it once, bean-check, and roll back if the check fails. The ledger's
 *  currency must be the report's: HQ never guesses an exchange rate. */
/** The business's standing adjustments (finance/costs-adjustments.json), or none. */
export function readAdjustments(financeDir: string): CostAdjustment[] {
  const f = path.join(financeDir, "costs-adjustments.json");
  if (!fs.existsSync(f)) return [];
  const v = JSON.parse(fs.readFileSync(f, "utf8"));
  if (!Array.isArray(v)) throw Error("costs-adjustments.json must be a list");
  return v as CostAdjustment[];
}

export function importCosts(slug: string, imp: CostImport, o: ImportOptions = {}, check: (ledger: string) => string | null = beanCheck, now = new Date()): CostsSummary {
  const profile = getProfile(slug);
  if (!profile) throw Error("Unknown business");
  const problem = costsProblem(imp);
  if (problem) throw Error(`Invalid costs at ${problem}`);
  if (imp.currency !== profile.currency) throw Error(`${sourceLabel(imp.source)} reports in ${imp.currency} but ${profile.name}'s ledger is in ${profile.currency}. HQ doesn't convert currencies, so nothing was imported. Import into a business whose ledger is in ${imp.currency}.`);
  const priv = privateLine(imp.months);
  if (priv) throw Error(`Nothing imported: ${priv}`);
  const ledger = ledgerPath(slug), dir = path.dirname(ledger), name = costsFile(imp.source), file = path.join(dir, name);
  if (!fs.existsSync(ledger)) throw Error(`${profile.name} has no ledger yet: run npm run hq -- finance init ${slug}`);
  // Opens elsewhere in the ledger, reading everything except this import's own file.
  const opened = openedAccounts(loadLedger(ledger, new Set([path.resolve(file)])));
  const adjustments = o.adjustments ?? readAdjustments(dir);
  const text = costsText(imp, { ...o, adjustments, observedAt: now.toISOString(), opened });
  const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const ledgerBefore = fs.readFileSync(ledger, "utf8");
  fs.writeFileSync(file, text, { mode: 0o600 });
  ensureInclude(ledger, name, imp.source);
  const bad = check(ledger);
  if (bad) {
    if (before === null) fs.rmSync(file, { force: true }); else fs.writeFileSync(file, before);
    fs.writeFileSync(ledger, ledgerBefore);
    throw Error(`The ledger didn't check out, so nothing changed: ${bad}`);
  }
  return summariseCosts(text, imp.currency, file);
}

/** Read an import from a file's JSON: a Xero report (needs the currency, which the report doesn't carry) or the
 *  generic shape. `from` forces one; otherwise it's worked out from the shape. */
export function toImport(raw: unknown, from: "xero" | "json" | undefined, currency: string | undefined): CostImport {
  const isGeneric = Boolean(raw && typeof raw === "object" && Array.isArray((raw as CostImport).months));
  const kind = from ?? (isGeneric ? "json" : "xero");
  if (kind === "json") {
    const x = raw as CostImport;
    const problem = costsProblem(x);
    if (problem) throw Error(`Invalid costs file at ${problem}`);
    return { ...x, months: x.months.map((m) => ({ month: m.month, lines: m.lines.map((l) => ({ account: l.account.trim(), section: l.section ?? "", amount: l.amount })) })) };
  }
  if (!currency || !/^[A-Z]{3}$/.test(currency)) throw Error("Xero's report doesn't say its currency: pass --currency with your Xero organisation's base currency (or set \"currency\" in finance/costs-connection.json)");
  return { version: 1, source: "xero", currency, months: parseXeroReport(raw) };
}

// ---------------------------------------------------------------- what's imported

/** Every costs file in a business's finance folder, summarised. */
export function importedCosts(slug: string, currency: string): (CostsSummary & { source: string; updated: string })[] {
  const dir = path.dirname(ledgerPath(slug));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^costs-[a-z0-9-]+\.beancount$/.test(f)).sort().map((f) => {
    const file = path.join(dir, f);
    return { ...summariseCosts(fs.readFileSync(file, "utf8"), currency, file), source: f.replace(/^costs-|\.beancount$/g, ""), updated: fs.statSync(file).mtime.toISOString() };
  });
}
