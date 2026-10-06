// The monthly costs refresh: for each business with `finance/costs-connection.json`, fetch the last 12 months of the
// accounting system's profit and loss report and re-import it (lib/finance-costs.ts). Xero is reached through the
// owner's claude.ai Composio connector, which only a Claude session can use (HQ holds no Composio key and never
// reads .env files), so this uses the same route as automatic posting (lib/social-publish.ts): HQ writes one Python
// cell, a headless Claude Code run allowed only COMPOSIO_REMOTE_WORKBENCH passes it on unchanged (a sha256 of the
// payload refuses an inexact copy), and HQ reads the report from the cell's printed result in the run's tool output,
// never from the model's words. The cell only calls read tools (XERO_GET_ORGANISATION for the base currency,
// XERO_GET_PROFIT_LOSS_REPORT), on the pinned Composio account and Xero organisation, and prints only the currency
// and the report's rows: never the organisation's address, tax number or contact details.
// Server-only. Guide: docs/guides/finance.md, "Connect your accounting system".
import fs from "node:fs";
import path from "node:path";

import { importCosts, parseXeroReport, type CostsSummary } from "./finance-costs";
import { HEAD, embed, newRun, type CellResult } from "./social-publish";
import { getProfile, ledgerPath } from "./store";

export const CONNECTION = "costs-connection.json";
const STATE = "costs-refresh.json";
/** The refresh runs once a month, from this day of the month on, so the month just gone has time to be reconciled. */
export const REFRESH_DAY = 3;
/** Months fetched each time (Xero takes the chosen month plus up to 11 earlier ones). */
export const REFRESH_MONTHS = 12;

export type CostsConnection = { source: "xero"; composioAccount: string; tenantId: string; share?: number; since?: string; currency?: string };
export type RefreshState = { lastAttempt?: string; lastOk?: string; ok?: boolean; why?: string; from?: string; to?: string };
export type WorkbenchRun = { results: CellResult[]; costUsd?: number; why?: string };
export type RefreshDeps = { workbench(cells: string[], run: string): Promise<WorkbenchRun>; now(): Date };
export type RefreshOutcome = { slug: string; status: "imported" | "not-due" | "failed" | "dry-run"; detail: string; summary?: CostsSummary };

const financeDir = (slug: string) => path.dirname(ledgerPath(slug));

/** The first field that keeps a costs connection out, or null. Ids only: nothing in it is a secret. */
export function connectionProblem(v: unknown): string | null {
  const c = v as CostsConnection;
  if (!c || c.source !== "xero") return "source";
  if (typeof c.composioAccount !== "string" || !/^[A-Za-z0-9_-]{3,80}$/.test(c.composioAccount)) return "composioAccount";
  if (typeof c.tenantId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.tenantId)) return "tenantId";
  if (c.share !== undefined && !(typeof c.share === "number" && c.share > 0 && c.share <= 1)) return "share";
  if (c.since !== undefined && !(typeof c.since === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(c.since))) return "since";
  if (c.currency !== undefined && !(typeof c.currency === "string" && /^[A-Z]{3}$/.test(c.currency))) return "currency";
  return null;
}

export const costsConnected = (slug: string) => fs.existsSync(path.join(financeDir(slug), CONNECTION));

export function readCostsConnection(slug: string): CostsConnection {
  const file = path.join(financeDir(slug), CONNECTION);
  if (!fs.existsSync(file)) throw Error(`no ${CONNECTION} in the business's finance folder`);
  const c = JSON.parse(fs.readFileSync(file, "utf8"));
  const problem = connectionProblem(c);
  if (problem) throw Error(`Invalid ${CONNECTION} at ${problem}`);
  return c;
}

export function readRefreshState(slug: string): RefreshState {
  try { return JSON.parse(fs.readFileSync(path.join(financeDir(slug), STATE), "utf8")); } catch { return {}; }
}
function writeRefreshState(slug: string, s: RefreshState) {
  fs.writeFileSync(path.join(financeDir(slug), STATE), JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
}

/** Today in the business's timezone as YYYY-MM-DD. */
const localDay = (now: Date, timezone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** The report window: the last complete month and the 11 before it. Xero's multi-period report is anchored on one
 *  month (fromDate..toDate) and adds `periods` earlier months. */
export function refreshWindow(now: Date, timezone: string): { from: string; to: string; periods: number } {
  const [y, m] = localDay(now, timezone).split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const from = prev.toISOString().slice(0, 10);
  const to = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { from, to, periods: REFRESH_MONTHS - 1 };
}

/** Due once a month: never refreshed, or the last good refresh was in an earlier month and today is on or after
 *  REFRESH_DAY. A failure waits 20 hours before the next try (the job runs daily). */
export function refreshDue(s: RefreshState, now: Date, timezone: string): boolean {
  if (s.ok === false && s.lastAttempt && now.getTime() - Date.parse(s.lastAttempt) < 20 * 3600e3) return false;
  if (!s.lastOk) return true;
  const today = localDay(now, timezone), last = localDay(new Date(s.lastOk), timezone);
  return last.slice(0, 7) < today.slice(0, 7) && Number(today.slice(8, 10)) >= REFRESH_DAY;
}

export type CostsPayload = { run: string; account: string; tenant: string; from: string; to: string; periods: number };

/** The workbench cell: read-only Xero calls on the pinned account and organisation; prints the base currency and the
 *  report's rows (labels and values only) as one HQ_RESULT line. Nothing is written to the workbench's files. */
export function xeroCostsCell(p: CostsPayload): string {
  const { lit, sha } = embed(p);
  return `${HEAD(lit, sha, p.run)}
def out(**k):
  k["run"]=P["run"]; print("HQ_RESULT "+json.dumps(k,separators=(",",":")))
def slim(rows):
  return [{"RowType":x.get("RowType"),"Title":x.get("Title") or "","Cells":[{"Value":c.get("Value","")} for c in (x.get("Cells") or []) if isinstance(c,dict)],"Rows":slim(x.get("Rows"))} for x in (rows or []) if isinstance(x,dict)]
try:
  if not _OK: raise Exception("integrity: the payload was not copied exactly")
  org=call("XERO_GET_ORGANISATION",{"tenant_id":P["tenant"]})
  cur=dig(org,"BaseCurrency")
  rep=call("XERO_GET_PROFIT_LOSS_REPORT",{"tenant_id":P["tenant"],"fromDate":P["from"],"toDate":P["to"],"periods":P["periods"],"timeframe":"MONTH","standardLayout":True})
  reps=dig(rep,"Reports")
  if not isinstance(reps,list) or not reps or not isinstance(reps[0],dict): raise Exception("the response had no report")
  out(status="report",currency=cur,rows=slim(reps[0].get("Rows")))
except Exception as e:
  out(status="error",stage="report",error=str(e)[:400])
`;
}

/** Fetch and import one business's costs, if due (or forced). Every attempt is recorded in finance/costs-refresh.json. */
export async function refreshCosts(slug: string, deps: RefreshDeps, o: { force?: boolean; dryRun?: boolean } = {}): Promise<RefreshOutcome> {
  const profile = getProfile(slug);
  if (!profile) throw Error("Unknown business");
  const c = readCostsConnection(slug);
  const now = deps.now(), state = readRefreshState(slug);
  if (!o.force && !o.dryRun && !refreshDue(state, now, profile.timezone)) return { slug, status: "not-due", detail: `last refreshed ${state.lastOk ?? "never"}${state.ok === false ? `; last try failed: ${state.why}` : ""}` };
  const w = refreshWindow(now, profile.timezone);
  const run = newRun();
  const cell = xeroCostsCell({ run, account: c.composioAccount, tenant: c.tenantId, ...w });
  if (o.dryRun) return { slug, status: "dry-run", detail: `would read Xero's profit and loss by month, ${REFRESH_MONTHS} months to ${w.to}, through Composio account ${c.composioAccount}, share ${c.share ?? 1}${c.since ? `, from ${c.since}` : ""}` };
  const fail = (why: string): RefreshOutcome => {
    writeRefreshState(slug, { ...state, lastAttempt: now.toISOString(), ok: false, why: why.slice(0, 300), from: w.from, to: w.to });
    return { slug, status: "failed", detail: why };
  };
  let res: CellResult | undefined;
  try {
    const out = await deps.workbench([cell], run);
    res = out.results.at(-1);
    if (!res) return fail(out.why ?? "the run returned nothing");
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  if (res.status !== "report") return fail(`Xero: ${String(res.error ?? res.status)}`);
  const currency = typeof res.currency === "string" ? res.currency : "";
  if (!/^[A-Z]{3}$/.test(currency)) return fail("Xero didn't say the organisation's base currency");
  if (c.currency && c.currency !== currency) return fail(`Xero's base currency is ${currency}, but ${CONNECTION} says ${c.currency}`);
  try {
    const months = parseXeroReport({ Rows: res.rows });
    const summary = importCosts(slug, { version: 1, source: "xero", currency, months }, { share: c.share, since: c.since }, undefined, now);
    writeRefreshState(slug, { lastAttempt: now.toISOString(), lastOk: now.toISOString(), ok: true, from: w.from, to: w.to });
    return { slug, status: "imported", detail: `${summary.months.length} months with costs, ${summary.from ?? "-"} to ${summary.to ?? "-"}`, summary };
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
}

/** The real calls: Claude Code headless, allowed only the Composio workbench (loaded lazily: it pulls in posting). */
export const realRefreshDeps: RefreshDeps = {
  workbench: async (cells, run) => (await import("./social-publisher")).headlessWorkbench(cells, run, 8 * 60e3, "accounting reader"),
  now: () => new Date(),
};
