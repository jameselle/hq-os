// Finance sync: a private, read-only finance adapter per business reports DAILY TOTALS (income by product, refunds,
// fees, spend) and HQ writes them into the business's ledger as `finance/synced.beancount`, included once from
// `ledger.beancount`. The synced file is rewritten whole on every run (no duplicates; hand-written entries in the
// ledger are never touched), checked with bean-check, and rolled back if the check fails. From the ledger, HQ's
// scorecard works out cost to win, analytics reads ad spend, and the Finance tab shows money in and out.
// Server-only. Contract: docs/guides/finance-sync.md.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { execAdapter, readConnection } from "./private-adapter";
import { looksPrivate } from "./scorecard";
import { businessDir, getProfile, ledgerPath } from "./store";

export type FinanceKind = "income" | "refund" | "fee" | "advertising" | "commission" | "software" | "hosting" | "contractor";
export type FinanceEntry = { date: string; kind: FinanceKind; label: string; amount: number; currency: string };
export type FinanceSnapshot = { version: 1; observedAt: string; currency: string; notes?: string[]; entries: FinanceEntry[] };

const KINDS: FinanceKind[] = ["income", "refund", "fee", "advertising", "commission", "software", "hosting", "contractor"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const SYNCED = "synced.beancount";

/** The first field that keeps a snapshot out (a path, never its value), or null. */
export function financeProblem(v: unknown, currency: string): string | null {
  const x = v as FinanceSnapshot;
  if (!x || x.version !== 1) return "version";
  if (x.currency !== currency) return "currency";
  if (typeof x.observedAt !== "string" || !Number.isFinite(Date.parse(x.observedAt))) return "observedAt";
  if (x.notes !== undefined && (!Array.isArray(x.notes) || x.notes.length > 10 || x.notes.some((n) => typeof n !== "string" || n.length > 200 || looksPrivate(n)))) return "notes";
  if (!Array.isArray(x.entries) || x.entries.length > 20000) return "entries";
  for (let i = 0; i < x.entries.length; i++) {
    const e = x.entries[i], at = `entries[${i}]`;
    if (!e || !DATE.test(e.date) || !Number.isFinite(Date.parse(`${e.date}T00:00:00Z`))) return `${at}.date`;
    if (!KINDS.includes(e.kind)) return `${at}.kind`;
    if (typeof e.label !== "string" || !e.label.trim() || e.label.length > 60 || looksPrivate(e.label)) return `${at}.label`;
    if (typeof e.amount !== "number" || !Number.isFinite(e.amount) || e.amount < 0 || e.amount > 1e9) return `${at}.amount`;
    if (typeof e.currency !== "string" || !/^[A-Z]{3}$/.test(e.currency)) return `${at}.currency`;
  }
  return null;
}

/** A label as one beancount account segment: "Gold monthly" -> "Gold-monthly". */
const segment = (label: string) => {
  const s = label.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "Other";
  return /^[A-Z]/.test(s) ? s : `X-${s}`.replace(/^X-([a-z])/, (_, c: string) => c.toUpperCase());
};
/** Where each kind lands. Sub-accounts only, so they never clash with the starter ledger's own opens. */
export function accountFor(e: Pick<FinanceEntry, "kind" | "label">): string {
  switch (e.kind) {
    case "income": return `Income:Sales:${segment(e.label)}`;
    case "refund": return `Income:Sales:Refunds`;
    case "fee": return `Expenses:Fees:Payments`;
    case "advertising": return `Expenses:Advertising:${segment(e.label)}`;
    case "commission": return `Expenses:Commissions:${segment(e.label)}`;
    case "software": return `Expenses:Software:${segment(e.label)}`;
    case "hosting": return `Expenses:Hosting:${segment(e.label)}`;
    case "contractor": return `Expenses:Contractors:${segment(e.label)}`;
  }
}
const CLEARING = "Assets:Clearing:Synced";
const money = (n: number) => n.toFixed(2);
const quote = (s: string) => `"${s.replace(/["\\]/g, "")}"`;

/** The synced file's text: opens for every account it uses (on its first date), then one transaction per entry. */
export function syncedText(s: FinanceSnapshot, source: string): string {
  const entries = [...s.entries].filter((e) => e.amount > 0).sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
  const first = new Map<string, string>();
  const use = (acct: string, date: string) => { if (!first.has(acct) || first.get(acct)! > date) first.set(acct, date); };
  for (const e of entries) { use(accountFor(e), e.date); use(CLEARING, e.date); }
  const out = [
    `; Written by HQ's finance sync from ${source}. Daily totals only, no customers. REWRITTEN ON EVERY SYNC: don't edit;`,
    `; put your own entries in ledger.beancount. Last synced ${s.observedAt}.`,
    ...(s.notes ?? []).map((n) => `; Note: ${n}`), "",
    ...[...first.entries()].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([acct, date]) => `${date} open ${acct}`), "",
  ];
  for (const e of entries) {
    const acct = accountFor(e);
    const income = e.kind === "income";
    const refund = e.kind === "refund";
    out.push(`${e.date} * ${quote(e.kind === "income" ? `${e.label} sales` : refund ? `${e.label} refunds` : e.label)} #synced`);
    // Income is a credit (negative) to the income account; refunds give it back; costs are debits.
    out.push(`  ${acct.padEnd(46)} ${money(income ? -e.amount : e.amount).padStart(12)} ${e.currency}`);
    out.push(`  ${CLEARING.padEnd(46)} ${money(income ? e.amount : -e.amount).padStart(12)} ${e.currency}`, "");
  }
  return out.join("\n");
}

/** Make sure the ledger includes the synced file, once. */
function ensureInclude(ledger: string) {
  const text = fs.existsSync(ledger) ? fs.readFileSync(ledger, "utf8") : "";
  if (new RegExp(`^include\\s+"${SYNCED.replace(".", "\\.")}"`, "m").test(text)) return;
  fs.appendFileSync(ledger, `\n; Daily totals from the business's billing, written by HQ's finance sync (npm run hq -- finance sync <slug>).\ninclude "${SYNCED}"\n`);
}

function beanCheck(ledger: string): string | null {
  for (const bin of [path.join(process.env.HOME ?? "", ".local", "bin", "bean-check"), "bean-check"]) {
    try { execFileSync(bin, [ledger], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }); return null; }
    catch (e) {
      const err = e as { code?: string; stdout?: string; stderr?: string };
      if (err.code === "ENOENT") continue;
      return String(err.stderr || err.stdout || "bean-check failed").split("\n").filter(Boolean).slice(0, 3).join(" / ").slice(0, 300);
    }
  }
  return null; // no bean-check on this Mac: nothing to check with
}

export type SyncResult = { entries: number; from: string | null; to: string | null; notes: string[]; byKind: Record<string, number> };
const CONNECTION = "finance-connection.json";
export const financeConnected = (slug: string) => fs.existsSync(path.join(businessDir(slug), CONNECTION));

/** Run the adapter and rewrite the synced file. A rejected snapshot or a failed check leaves the old file in place. */
export async function syncFinance(slug: string): Promise<SyncResult> {
  const profile = getProfile(slug);
  if (!profile) throw Error("Unknown business");
  const { command } = readConnection(slug, CONNECTION);
  const value = await execAdapter(command, { action: "report", currency: profile.currency, timezone: profile.timezone }, 180000);
  const problem = financeProblem(value, profile.currency);
  if (problem) throw Error(`Invalid finance snapshot at ${problem}`);
  const s = value as FinanceSnapshot;
  const ledger = ledgerPath(slug), dir = path.dirname(ledger), synced = path.join(dir, SYNCED);
  fs.mkdirSync(dir, { recursive: true });
  const before = fs.existsSync(synced) ? fs.readFileSync(synced, "utf8") : null;
  const ledgerBefore = fs.existsSync(ledger) ? fs.readFileSync(ledger, "utf8") : null;
  fs.writeFileSync(synced, syncedText(s, "the business's billing"), { mode: 0o600 });
  ensureInclude(ledger);
  const bad = beanCheck(ledger);
  if (bad) {
    if (before === null) fs.rmSync(synced, { force: true }); else fs.writeFileSync(synced, before);
    if (ledgerBefore !== null) fs.writeFileSync(ledger, ledgerBefore);
    throw Error(`The ledger didn't check out, so nothing changed: ${bad}`);
  }
  const dates = s.entries.map((e) => e.date).sort();
  const byKind: Record<string, number> = {};
  for (const e of s.entries) byKind[e.kind] = Math.round(((byKind[e.kind] ?? 0) + e.amount) * 100) / 100;
  return { entries: s.entries.length, from: dates[0] ?? null, to: dates.at(-1) ?? null, notes: s.notes ?? [], byKind };
}

// ---------------------------------------------------------------- reading the ledger back: money in and out

export type MoneyMonth = { month: string; income: number; refunds: number; costs: number; byCost: Record<string, number> };

/** Income, refunds and costs per calendar month, in the ledger's currency, from every posting in the ledger
 *  (hand-written and synced). Income accounts are credits, so their sign is flipped. */
export function moneyByMonth(ledgerText: string, currency: string): MoneyMonth[] {
  const months = new Map<string, MoneyMonth>();
  let date: string | null = null;
  for (const line of ledgerText.split("\n")) {
    const t = /^(\d{4}-\d{2})-\d{2}\s+(\*|!|txn)\s/.exec(line);
    if (t) { date = t[1]; continue; }
    if (!/^\s/.test(line)) { date = null; continue; }
    const p = /^\s+((?:Income|Expenses):[A-Za-z0-9:-]+)\s+(-?[\d,]+(?:\.\d+)?)\s+([A-Z]{3})/.exec(line);
    if (!date || !p || p[3] !== currency) continue;
    const amt = Number(p[2].replace(/,/g, ""));
    const m = months.get(date) ?? { month: date, income: 0, refunds: 0, costs: 0, byCost: {} };
    if (p[1] === "Income:Sales:Refunds") m.refunds += amt;
    else if (p[1].startsWith("Income")) m.income += -amt;
    else { m.costs += amt; const k = p[1].split(":")[1]; m.byCost[k] = (m.byCost[k] ?? 0) + amt; }
    months.set(date, m);
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, income: r(m.income), refunds: r(m.refunds), costs: r(m.costs), byCost: Object.fromEntries(Object.entries(m.byCost).map(([k, v]) => [k, r(v)])) }));
}
