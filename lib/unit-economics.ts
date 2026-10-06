// Unit economics per month, for any business: revenue and costs from its ledger (income synced from billing, costs
// imported from the accounting system or written by hand), paying customers, MRR, churn and new paying customers from
// its growth scorecard. Only what is measured is reported: a number without its inputs stays null with the reason,
// never zero. Feeds the Finance tab, the analytics board (lib/analytics.ts), the workflow evidence for "Unit economics
// check", the CEO's findings and the monthly brief (`npm run hq -- finance unit-economics <slug>`).
// Client-safe: no node imports. The reading from disk is lib/unit-economics-store.ts. Guide: docs/guides/finance.md.
import type { AnalyticsId } from "./analytics-metrics";
import { formatValue } from "./scorecard-metrics";

// ---------------------------------------------------------------- the ledger, by month and by cost line

/** One calendar month of the ledger. Costs are split three ways: acquisition (Advertising, Partnerships and
 *  Commissions), direct (payment fees and cost of sales, for gross margin) and the rest, operating. */
export type MonthBooks = {
  month: string; revenue: number; costs: number; acquisition: number; direct: number;
  /** Every expense account posted to this month, full name to amount. */
  lines: Record<string, number>;
};

const ACQUISITION = /^Expenses:(Advertising|Partnerships|Commissions)(:|$)/;
const DIRECT = /^Expenses:(Fees:Payments|Cost-?of-?(Sales|Goods)[A-Za-z-]*|COGS)(:|$)|^Expenses:[A-Za-z-]+:(Cost-of-Sales|Cost-of-Goods-Sold|COGS|Merchant-Fees|Payment-Fees)$/i;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Revenue (income less refunds), costs and every expense account, per calendar month, in the ledger's currency. */
export function booksByMonth(ledgerText: string, currency: string): MonthBooks[] {
  const months = new Map<string, MonthBooks>();
  let date: string | null = null;
  for (const line of ledgerText.split("\n")) {
    const t = /^(\d{4}-\d{2})-\d{2}\s+(\*|!|txn)\s/.exec(line);
    if (t) { date = t[1]; continue; }
    if (!/^\s/.test(line)) { date = null; continue; }
    const p = /^\s+((?:Income|Expenses):[A-Za-z0-9:-]+)\s+(-?[\d,]+(?:\.\d+)?)\s+([A-Z]{3})/.exec(line);
    if (!date || !p || p[3] !== currency) continue;
    const amt = Number(p[2].replace(/,/g, ""));
    const m = months.get(date) ?? { month: date, revenue: 0, costs: 0, acquisition: 0, direct: 0, lines: {} };
    if (p[1].startsWith("Income")) m.revenue -= amt; // income is a credit; a refund is a debit to income
    else {
      m.costs += amt;
      m.lines[p[1]] = (m.lines[p[1]] ?? 0) + amt;
      if (ACQUISITION.test(p[1])) m.acquisition += amt;
      else if (DIRECT.test(p[1])) m.direct += amt;
    }
    months.set(date, m);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({
    ...m, revenue: r2(m.revenue), costs: r2(m.costs), acquisition: r2(m.acquisition), direct: r2(m.direct),
    lines: Object.fromEntries(Object.entries(m.lines).map(([k, v]) => [k, r2(v)]).filter(([, v]) => v !== 0)),
  }));
}

/** "Expenses:Operating:Sports-Data-Feeds" reads "Sports Data Feeds". */
export const lineLabel = (account: string) => (account.split(":").at(-1) ?? account).replace(/-/g, " ");

// ---------------------------------------------------------------- months and weeks

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09" reads "Sep 2026". */
export const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const daysIn = (month: string) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
/** The calendar month a moment falls in, in the business's time zone. */
export const monthOfDate = (t: Date, tz = "UTC") => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(t).slice(0, 7);

/** The Thursday of an ISO week, which decides the month a scorecard week belongs to. */
export function weekThursday(week: string): string {
  const [y, w] = week.split("-W").map(Number);
  const jan4 = Date.UTC(y, 0, 4), dow = new Date(jan4).getUTCDay() || 7;
  return new Date(jan4 - (dow - 1) * 864e5 + ((w - 1) * 7 + 3) * 864e5).toISOString().slice(0, 10);
}
/** The ISO weeks whose Thursday falls in the month. */
export function weeksOfMonth(month: string): string[] {
  const out: string[] = [];
  const [y, m] = month.split("-").map(Number);
  for (let d = 1; d <= daysIn(month); d++) {
    const t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCDay() !== 4) continue;
    const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const mon1 = jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 864e5;
    out.push(`${t.getUTCFullYear()}-W${String(Math.floor((t.getTime() - mon1) / (7 * 864e5)) + 1).padStart(2, "0")}`);
  }
  return out;
}

// ---------------------------------------------------------------- the scorecard's weeks

/** A scorecard week as kept (lib/scorecard.ts): weekly readings, plus spend the adapter reports outside the ledger. */
export type ScoreWeek = { week: string; metrics: { id: string; value: number | null }[]; extraSpend?: { label: string; value: number }[] };

type MonthCustomers = {
  paying: number | null; mrr: number | null; newPaying: number | null; churn: number | null; extraSpend: number;
  why: { paying?: string; newPaying?: string; churn?: string };
  late?: string;
};

function customersFor(month: string, weeks: Map<string, ScoreWeek>, latest: boolean): MonthCustomers {
  const mine = weeksOfMonth(month);
  const val = (w: string, id: string) => weeks.get(w)?.metrics.find((x) => x.id === id)?.value ?? null;
  const lastKnown = (id: string) => [...mine].reverse().map((w) => val(w, id)).find((v) => v !== null) ?? null;
  let paying = lastKnown("paying_customers"), mrr = lastKnown("mrr"), late: string | undefined;
  if (latest && paying === null) {
    // The month just closed: a reading from the first weeks after it is the nearest there is.
    const after = [...weeks.keys()].sort().filter((w) => weekThursday(w) > `${month}-31` && weekThursday(w) <= `${addMonths(month, 1)}-14`);
    const w = after.find((x) => val(x, "paying_customers") !== null);
    if (w) { paying = val(w, "paying_customers"); mrr = mrr ?? val(w, "mrr"); late = w; }
  }
  const np = mine.map((w) => val(w, "new_paying"));
  const known = np.filter((v): v is number => v !== null);
  const ch = mine.map((w) => val(w, "paying_churn_rate")).filter((v): v is number => v !== null && v >= 0 && v < 1);
  // Weekly churn compounds to the month: 1 - (product of weekly retention), scaled to the month's length.
  const churn = ch.length >= 2 ? 1 - Math.pow(ch.reduce((p, w) => p * (1 - w), 1), daysIn(month) / 7 / ch.length) : null;
  const extraSpend = mine.reduce((n, w) => n + (weeks.get(w)?.extraSpend ?? []).reduce((a, r) => a + r.value, 0), 0);
  return {
    paying, mrr, late, extraSpend,
    newPaying: known.length === mine.length && mine.length ? known.reduce((a, b) => a + b, 0) : null,
    churn: churn === null ? null : Math.round(churn * 10000) / 10000,
    why: {
      paying: paying === null ? "No paying-customer count kept for this month" : undefined,
      newPaying: known.length === mine.length ? undefined : `New paying customers known for ${known.length} of ${mine.length} weeks`,
      churn: churn === null ? `Weekly churn known for ${ch.length} of ${mine.length} weeks (needs 2)` : undefined,
    },
  };
}

// ---------------------------------------------------------------- the numbers

export const FIELDS = ["revenue", "costs", "operating", "acquisition", "grossMargin", "netMargin", "burn", "paying", "newPaying", "churn",
  "arpu", "costPerCustomer", "lifetime", "ltv", "cac", "ltvToCac", "payback", "breakEven"] as const;
export type Field = (typeof FIELDS)[number];

export const FIELD_LABEL: Record<Field, string> = {
  revenue: "Revenue", costs: "Total costs", operating: "Operating costs", acquisition: "Acquisition spend", grossMargin: "Gross margin",
  netMargin: "Net margin", burn: "Burn (net loss)", paying: "Paying customers", newPaying: "New paying customers", churn: "Monthly churn",
  arpu: "Revenue per paying customer", costPerCustomer: "Cost per paying customer", lifetime: "Customer lifetime", ltv: "Lifetime value",
  cac: "Cost to win a customer", ltvToCac: "Lifetime value to cost to win", payback: "Payback", breakEven: "Break-even paying customers",
};
type Kind = "money" | "rate" | "months" | "count" | "ratio";
export const FIELD_KIND: Record<Field, Kind> = {
  revenue: "money", costs: "money", operating: "money", acquisition: "money", grossMargin: "rate", netMargin: "rate", burn: "money",
  paying: "count", newPaying: "count", churn: "rate", arpu: "money", costPerCustomer: "money", lifetime: "months", ltv: "money",
  cac: "money", ltvToCac: "ratio", payback: "months", breakEven: "count",
};

export type MonthEconomics = {
  month: string;
  values: Record<Field, number | null>;
  /** Why a number is missing, per field. */
  missing: Partial<Record<Field, string>>;
  /** How some numbers were worked out (e.g. "Revenue per customer is MRR over paying customers"). */
  basis: string[];
};

export type CostLine = { account: string; label: string; amount: number; previous: number | null; change: number | null; changeShare: number | null };
export type CostJump = { account: string; label: string; month: string; amount: number; average: number; floor: number };
export type BurnStreak = { months: { month: string; revenue: number; costs: number; burn: number }[]; breakEven: number | null; arpu: number | null; paying: number | null };

export type UnitEconomics = {
  currency: string;
  /** Closed months with costs or revenue in the ledger, oldest first (the month in progress is left out). */
  months: MonthEconomics[];
  /** The newest closed month with costs recorded; null when the ledger has none. */
  latest: MonthEconomics | null;
  /** The average of each number over the up to 3 months before the latest, and which months that was. */
  prior: { months: string[]; values: Record<Field, number | null>; counts: Record<Field, number> } | null;
  /** Closed months that hold both income and costs. */
  bothMonths: number;
  topLines: CostLine[];
  jumps: CostJump[];
  burnStreak: BurnStreak | null;
  /** Numbers that can't be measured for the latest month, with the reason, for the brief and the page. */
  gaps: { field: Field; why: string }[];
};

/** A cost line counts as a jump when it is more than 50% above its average over the 3 months before AND higher by
 *  more than the floor: the bigger of JUMP_MIN and 5% of the average month's total costs. */
export const JUMP_SHARE = 0.5, JUMP_MIN = 250, JUMP_TOTAL_SHARE = 0.05;
/** Burn "well above" revenue: the net loss is at least this many times the month's revenue, 3 months running. */
export const BURN_MULTIPLE = 2;

const div = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b);
const round = (n: number | null, dp = 2) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10 ** dp) / 10 ** dp);

export type UnitInput = { currency: string; ledgerText: string; weeks: ScoreWeek[]; now: Date; timezone?: string };

export function unitEconomics(i: UnitInput): UnitEconomics {
  const current = monthOfDate(i.now, i.timezone || "UTC");
  const books = booksByMonth(i.ledgerText, i.currency).filter((m) => m.month < current && (m.costs !== 0 || m.revenue !== 0));
  const weeks = new Map(i.weeks.map((w) => [w.week, w]));
  // Spend a scorecard adapter reports outside the ledger (in-product affiliate commissions) counts only when no
  // accounting import holds partner payouts; otherwise the same money would be counted twice.
  const partnersInLedger = books.some((m) => Object.keys(m.lines).some((a) => a.startsWith("Expenses:Partnerships")));
  const lastCost = [...books].reverse().find((m) => m.costs > 0)?.month ?? null;

  const months: MonthEconomics[] = books.map((b) => {
    const c = customersFor(b.month, weeks, b.month === lastCost);
    const missing: MonthEconomics["missing"] = {};
    const basis: string[] = [];
    const acquisition = r2(b.acquisition + (partnersInLedger ? 0 : c.extraSpend));
    if (!partnersInLedger && c.extraSpend) basis.push("Acquisition spend includes commissions the scorecard reports");
    const grossMargin = b.direct > 0 && b.revenue > 0 ? (b.revenue - b.direct) / b.revenue : null;
    if (grossMargin === null) missing.grossMargin = b.revenue > 0 ? "No cost of sales or payment fees in the ledger" : "No revenue this month";
    const arpu = c.paying ? (c.mrr !== null ? c.mrr / c.paying : b.revenue / c.paying) : null;
    if (arpu !== null) basis.push(c.mrr !== null ? "Revenue per customer is MRR over paying customers" : "Revenue per customer is the month's revenue over paying customers");
    if (c.late) basis.push(`Paying customers read in ${c.late}, just after the month`);
    const marginShare = grossMargin ?? 1;
    if (grossMargin === null) basis.push("Lifetime value and payback use revenue, not gross profit (no cost of sales recorded)");
    const lifetime = c.churn !== null && c.churn > 0 ? 1 / c.churn : null;
    const ltv = arpu !== null && lifetime !== null ? arpu * marginShare * lifetime : null;
    const cac = c.newPaying && acquisition > 0 ? acquisition / c.newPaying : null;
    const values: Record<Field, number | null> = {
      revenue: b.revenue, costs: b.costs, operating: r2(b.costs - acquisition), acquisition,
      grossMargin: round(grossMargin, 4), netMargin: b.revenue > 0 ? round((b.revenue - b.costs) / b.revenue, 4) : null,
      burn: r2(Math.max(0, b.costs - b.revenue)),
      paying: c.paying, newPaying: c.newPaying, churn: c.churn,
      arpu: round(arpu), costPerCustomer: round(div(b.costs, c.paying)), lifetime: round(lifetime, 1), ltv: round(ltv),
      cac: round(cac), ltvToCac: round(div(ltv, cac)), payback: round(div(cac, arpu === null ? null : arpu * marginShare), 1),
      breakEven: arpu && b.costs > 0 ? Math.ceil(b.costs / arpu) : null, // costs already hold the direct costs
    };
    if (b.revenue <= 0) missing.netMargin = "No revenue this month";
    if (c.why.paying) for (const f of ["paying", "arpu", "costPerCustomer", "breakEven"] as Field[]) missing[f] = c.why.paying;
    if (c.why.churn) for (const f of ["churn", "lifetime"] as Field[]) missing[f] = c.why.churn;
    else if (lifetime === null) missing.lifetime = "No churn measured, so lifetime has no end yet";
    if (ltv === null) missing.ltv = missing.arpu ?? missing.lifetime ?? "Needs revenue per customer and churn";
    if (c.why.newPaying) missing.newPaying = c.why.newPaying;
    if (cac === null) missing.cac = acquisition <= 0 ? "No acquisition spend recorded this month" : c.why.newPaying ?? "No new paying customers this month";
    if (values.ltvToCac === null) missing.ltvToCac = missing.ltv ?? missing.cac ?? "Needs lifetime value and cost to win";
    if (values.payback === null) missing.payback = missing.cac ?? missing.arpu ?? "Needs cost to win and revenue per customer";
    if (values.breakEven === null && !missing.breakEven) missing.breakEven = missing.arpu ?? "Needs revenue per customer";
    return { month: b.month, values, missing, basis };
  });

  const latest = lastCost ? months.find((m) => m.month === lastCost)! : null;
  let prior: UnitEconomics["prior"] = null;
  if (latest) {
    const want = [1, 2, 3].map((k) => addMonths(latest.month, -k));
    const ms = months.filter((m) => want.includes(m.month));
    if (ms.length) {
      const known = (f: Field) => ms.map((m) => m.values[f]).filter((v): v is number => v !== null);
      const values = Object.fromEntries(FIELDS.map((f) => {
        const xs = known(f);
        return [f, xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length, FIELD_KIND[f] === "rate" ? 4 : 2) : null];
      })) as Record<Field, number | null>;
      prior = { months: ms.map((m) => m.month), values, counts: Object.fromEntries(FIELDS.map((f) => [f, known(f).length])) as Record<Field, number> };
    }
  }

  const byMonth = new Map(books.map((b) => [b.month, b]));
  const topLines: CostLine[] = [];
  const jumps: CostJump[] = [];
  if (latest) {
    const now = byMonth.get(latest.month)!, before = byMonth.get(addMonths(latest.month, -1));
    for (const [account, amount] of Object.entries(now.lines).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      const previous = before ? before.lines[account] ?? 0 : null;
      topLines.push({ account, label: lineLabel(account), amount, previous, change: previous === null ? null : r2(amount - previous), changeShare: previous ? round((amount - previous) / previous, 4) : null });
    }
    const three = [1, 2, 3].map((k) => byMonth.get(addMonths(latest.month, -k)));
    if (three.every((m) => m && m.costs > 0)) {
      const avgTotal = three.reduce((n, m) => n + m!.costs, 0) / 3;
      const floor = Math.max(JUMP_MIN, JUMP_TOTAL_SHARE * avgTotal);
      for (const [account, amount] of Object.entries(now.lines)) {
        const average = three.reduce((n, m) => n + (m!.lines[account] ?? 0), 0) / 3;
        if (amount > (1 + JUMP_SHARE) * average && amount - average > floor) jumps.push({ account, label: lineLabel(account), month: latest.month, amount, average: r2(average), floor: r2(floor) });
      }
      jumps.sort((a, b) => (b.amount - b.average) - (a.amount - a.average));
    }
  }

  let burnStreak: BurnStreak | null = null;
  if (latest) {
    const run = [2, 1, 0].map((k) => months.find((m) => m.month === addMonths(latest.month, -k)));
    if (run.every((m) => m && (m.values.revenue ?? 0) > 0 && (m.values.burn ?? 0) >= BURN_MULTIPLE * (m.values.revenue ?? 0))) {
      burnStreak = {
        months: run.map((m) => ({ month: m!.month, revenue: m!.values.revenue!, costs: m!.values.costs!, burn: m!.values.burn! })),
        breakEven: latest.values.breakEven, arpu: latest.values.arpu, paying: latest.values.paying,
      };
    }
  }

  return {
    currency: i.currency, months, latest, prior,
    bothMonths: books.filter((b) => b.revenue > 0 && b.costs > 0).length,
    topLines, jumps, burnStreak,
    gaps: latest ? FIELDS.filter((f) => latest.values[f] === null).map((f) => ({ field: f, why: latest.missing[f] ?? "Not measured" })) : [],
  };
}

// ---------------------------------------------------------------- reading the numbers

export function formatField(f: Field, v: number | null, currency: string): string {
  if (v === null) return "not measured";
  const k = FIELD_KIND[f];
  if (k === "money") return formatValue("money", v, currency);
  if (k === "rate") return `${(v * 100).toFixed(1)}%`;
  if (k === "months") return `${v.toFixed(1)} months`;
  if (k === "ratio") return `${v.toFixed(2)}x`;
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: k === "count" && f === "newPaying" ? 0 : 1 }).format(v);
}

/** "3 months before (Jun to Aug 2026)", or the one or two months there were. */
export function priorLabel(months: string[]): string {
  if (!months.length) return "";
  const s = [...months].sort();
  return s.length === 1 ? monthName(s[0]) : `${monthName(s[0]).slice(0, 3)} to ${monthName(s.at(-1)!)}`;
}

/** An average over fewer months than the window says which: "$71 (1 of 3 months)". */
export function priorCell(p: NonNullable<UnitEconomics["prior"]>, f: Field, currency: string): string {
  const v = formatField(f, p.values[f], currency);
  return p.values[f] !== null && p.counts[f] < p.months.length ? `${v} (${p.counts[f]} of ${p.months.length} months)` : v;
}

/** The fields shown in the brief and on the page, in reading order. */
export const SHOWN: Field[] = ["revenue", "costs", "operating", "acquisition", "netMargin", "grossMargin", "burn", "paying", "newPaying", "churn", "arpu",
  "costPerCustomer", "lifetime", "ltv", "cac", "ltvToCac", "payback", "breakEven"];

/** A cost line's change for people: "+$172 (+20%)", "+$984 (over 10x)", "+$900 (new)". */
export function changeLabel(l: CostLine, currency: string): string {
  if (l.change === null) return "";
  const amt = `${l.change >= 0 ? "+" : "-"}${formatValue("money", Math.abs(l.change), currency)}`;
  if (l.previous === 0) return `${amt} (new)`;
  if (l.changeShare === null) return amt;
  return l.changeShare >= 9 ? `${amt} (over 10x)` : `${amt} (${l.changeShare >= 0 ? "+" : ""}${Math.round(l.changeShare * 100)}%)`;
}

/** Plain-language findings for the CEO, shared by the brief and lib/ceo.ts. */
export function jumpText(j: CostJump, currency: string) {
  const f = (n: number) => formatValue("money", n, currency);
  return {
    title: `${j.label} cost ${f(j.amount)} in ${monthName(j.month)}, up from an average of ${f(j.average)}`,
    detail: `${j.account} was ${f(j.amount)} in ${monthName(j.month)} against ${f(j.average)} a month over the 3 months before: ${j.average > 0 ? `${Math.round((j.amount / j.average - 1) * 100)}% higher` : "new this month"}, ${f(j.amount - j.average)} more.`,
  };
}

export function burnText(b: BurnStreak, currency: string) {
  const f = (n: number) => formatValue("money", n, currency);
  const names = b.months.map((m) => monthName(m.month).slice(0, 3));
  const list = `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return {
    title: `Costs were at least ${BURN_MULTIPLE + 1}x revenue for 3 months running`,
    detail: `Net loss ${b.months.map((m) => f(m.burn)).join(", ")} against revenue of ${b.months.map((m) => f(m.revenue)).join(", ")} (${list}). `
      + (b.breakEven !== null && b.arpu !== null
        ? `At ${f(b.arpu)} a paying customer a month, covering ${f(b.months.at(-1)!.costs)} of costs needs ${b.breakEven} paying customers${b.paying !== null ? ` (${b.paying} now)` : ""}.`
        : "Break-even customers can't be worked out yet: revenue per paying customer isn't measured."),
  };
}

/** The monthly brief, as markdown for the finance department's plans (and its vault copy). */
export function unitBrief(u: UnitEconomics, o: { business: string; today: string }): string {
  const cur = u.currency;
  if (!u.latest) return `# Unit economics\n\n${o.business}: the ledger has no closed month with costs yet, so there is nothing to work out. Import costs (Finance guide, "Connect your accounting system") or add them to ledger.beancount.\n`;
  const L = u.latest, P = u.prior;
  const head = P ? `| | ${monthName(L.month)} | Average, ${priorLabel(P.months)} |\n|---|---|---|` : `| | ${monthName(L.month)} |\n|---|---|`;
  const rows = SHOWN.map((f) => `| ${FIELD_LABEL[f]} | ${formatField(f, L.values[f], cur)} |${P ? ` ${priorCell(P, f, cur)} |` : ""}`);
  const money = (n: number) => formatValue("money", n, cur);
  const out = [
    `# Unit economics: ${monthName(L.month)}`, "",
    `${o.business}, worked out ${o.today} from the ledger (${cur}: every cost and income recorded there) and the growth scorecard. ${u.bothMonths} months hold both income and costs.`, "",
    head, ...rows, "",
    "## Break-even",
    L.values.breakEven !== null
      ? `At ${money(L.values.arpu!)} a paying customer a month and ${money(L.values.costs!)} of costs, break-even needs ${L.values.breakEven} paying customers${L.values.paying !== null ? ` (${L.values.paying} in ${monthName(L.month)})` : ""}.`
      : `Not measurable yet: ${L.missing.breakEven ?? "needs revenue per paying customer"}.`,
    "",
    "## Biggest cost lines",
    "| Line | " + monthName(L.month) + " | Month before | Change |", "|---|---|---|---|",
    ...u.topLines.map((l) => `| ${l.label} | ${money(l.amount)} | ${l.previous === null ? "not recorded" : money(l.previous)} | ${changeLabel(l, cur)} |`),
    "",
  ];
  const findings = [...u.jumps.map((j) => jumpText(j, cur)), ...(u.burnStreak ? [burnText(u.burnStreak, cur)] : [])];
  out.push("## Findings", ...(findings.length ? findings.map((x) => `- **${x.title}.** ${x.detail}`) : ["- No cost line jumped and burn isn't well above revenue."]), "");
  if (u.gaps.length) out.push("## Not measurable yet", ...u.gaps.map((g) => `- ${FIELD_LABEL[g.field]}: ${g.why}.`), "");
  if (L.basis.length) out.push("## How it's worked out", ...[...new Set(L.basis)].map((b) => `- ${b}.`), `- Acquisition spend is Advertising, Partnerships and Commissions in the ledger; cost to win divides it by new paying customers in the month's weeks.`, `- A cost line is flagged when it is more than 50% above its 3-month average and higher by more than ${money(JUMP_MIN)} or 5% of average monthly costs, whichever is bigger.`, "");
  out.push("## Next (Unit economics check)",
    `- Finance: set the payback limit (rule of thumb: lifetime value at least 3x cost to win, payback within 12 months).`,
    `- Ads: hold or cut budgets that pay back slower than the limit.`,
    `- Sales: check partner commissions against what a customer is worth.`,
    `- Finance: set discount limits so revenue per customer stays above break-even.`, "");
  return out.join("\n");
}

// ---------------------------------------------------------------- as analytics numbers (lib/analytics.ts)

export type UnitMetric = { id: AnalyticsId; value: number | null; quality: "exact" | "approx" | "missing"; note: string; period?: string; breakdown?: { label: string; value: number }[] };

/** The latest month's numbers for the analytics board, each with a short note (under 200 characters) saying what it
 *  is or why it's missing. Revenue, costs, spend, margins and burn are exact sums; the rest are estimates. */
export function unitAnalytics(u: UnitEconomics | null): UnitMetric[] {
  const ids: [AnalyticsId, Field][] = [
    ["monthly_revenue", "revenue"], ["monthly_costs", "costs"], ["acquisition_spend", "acquisition"], ["gross_margin", "grossMargin"],
    ["net_margin", "netMargin"], ["burn", "burn"], ["cost_per_customer", "costPerCustomer"], ["customer_lifetime", "lifetime"],
    ["break_even_customers", "breakEven"], ["arpu", "arpu"], ["ltv", "ltv"], ["ltv_to_cac", "ltvToCac"], ["cost_to_win", "cac"], ["payback_months", "payback"],
  ];
  const EXACT: Field[] = ["revenue", "costs", "acquisition", "grossMargin", "netMargin", "burn"];
  const L = u?.latest;
  if (!u || !L) return ids.map(([id]) => ({ id, value: null, quality: "missing", note: "No closed month with costs in the ledger yet" }));
  const period = monthName(L.month);
  const avg = (f: Field) => (u.prior && u.prior.values[f] !== null ? `; ${priorLabel(u.prior.months)} averaged ${priorCell(u.prior, f, u.currency)}` : "");
  const what: Partial<Record<Field, string>> = {
    revenue: "Income less refunds in the ledger", costs: "Every cost in the ledger", acquisition: "Advertising, Partnerships and Commissions in the ledger",
    grossMargin: "Revenue less payment fees and cost of sales", netMargin: "Revenue less every cost, over revenue", burn: "Costs less revenue (0 when revenue covers costs)",
    costPerCustomer: "Costs over paying customers", lifetime: "1 / monthly churn (weekly churn compounded)", breakEven: "Costs over revenue per paying customer",
    arpu: L.basis.some((b) => b.startsWith("Revenue per customer is MRR")) ? "MRR over paying customers" : "Revenue over paying customers",
    ltv: "Revenue per customer times lifetime", ltvToCac: "Lifetime value over cost to win", cac: "Acquisition spend over new paying customers", payback: "Cost to win over revenue per customer",
  };
  return ids.map(([id, f]) => {
    const v = L.values[f];
    if (v === null) return { id, value: null, quality: "missing" as const, note: `${period}: ${L.missing[f] ?? "not measured"}`.slice(0, 200) };
    const m: UnitMetric = { id, value: v, quality: EXACT.includes(f) ? "exact" : "approx", note: `${period}. ${what[f]}${avg(f)}`.slice(0, 200), period };
    if (f === "costs") m.breakdown = u.topLines.map((l) => ({ label: l.label.slice(0, 80), value: l.amount })).filter((r) => r.value > 0);
    return m;
  });
}
