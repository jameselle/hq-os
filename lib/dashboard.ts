// The Dashboard: one page with a subscription business's day-to-day numbers and the people to reach out to.
// A private adapter per business ($HQ_DATA/businesses/<slug>/dashboard-connection.json) reports a snapshot:
// members by plan, sign-ups and upgrades by day, recent upgrades, cancelled customers to win back, pending
// cancellations, account-security counts and billing customers with no account. Unlike the scorecard, the
// snapshot names people (it exists so the owner can contact them), so HQ holds it in memory only and never
// writes it to disk. Pure and client-safe: no node imports.

export const CONTACT_STATUSES = ["not_contacted", "contacted", "follow_up"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export const CONTACT_LABEL: Record<ContactStatus, string> = {
  not_contacted: "Not contacted",
  contacted: "Contacted",
  follow_up: "Follow up",
};

/** Stripe's standard cancellation feedback values, as words. */
export const FEEDBACK_LABEL: Record<string, string> = {
  too_expensive: "Too expensive",
  missing_features: "Missing features",
  switched_service: "Switched service",
  unused: "Not using it",
  customer_service: "Customer service",
  too_complex: "Too complex",
  low_quality: "Low quality",
  other: "Other",
};

export type DashboardPlan = { id: string; label: string; count: number; hint?: string; paid: boolean };
export type DayCount = { date: string; count: number };
export type DashboardTemplate = { label: string; subject: string; body: string };
export type Source = "card" | "apple" | "google";

export type RecentUpgrade = {
  key: string;
  name: string | null;
  email: string | null;
  plan: string;
  billingPeriod: string | null;
  startedAt: string;
};

export type ChurnedCustomer = {
  key: string;
  name: string | null;
  email: string | null;
  churnedAt: string;
  plan: string | null;
  previousProduct: string | null;
  cancelFeedback: string | null;
  cancelReason: string | null;
  source: Source;
  contact: ContactStatus;
  template: string | null;
};

export type PendingCancellation = {
  key: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  plan: string;
  billingPeriod: string;
  status: string;
  expiresAt: string;
  memberSince: string | null;
  amount: number;
  currency: string;
  affiliateCode: string | null;
  cancelFeedback: string | null;
  cancelReason: string | null;
  source: Source;
  contact: ContactStatus;
  template: string | null;
};

export type OrphanedCustomer = {
  key: string;
  name: string | null;
  email: string | null;
  status: string;
  plan: string;
  amount: number;
  interval: string;
  created: string | null;
  link: string | null;
};

/** A headline number. `null` means the source didn't answer this time (shown as "–", never as 0). */
export type DashboardTile = {
  label: string;
  value: number | null;
  format?: "count" | "money" | "percent" | "decimal";
  currency?: string;
  hint?: string;
  tone?: "danger" | "warn";
};
export type DashboardGroup = { id: string; title: string; note?: string; tiles: DashboardTile[] };
/** A count per day, drawn by day, week or month (weeks and months add the days up). */
export type DashboardChart = { id: string; title: string; subtitle?: string; kind: "area" | "bars"; since: string; points: DayCount[] };
/** One row of a generic list: a person, a post, a lead. `tags[0]` becomes the list's filter tabs. */
export type DashboardListRow = {
  key: string;
  title: string;
  subtitle?: string | null;
  email?: string | null;
  at?: string | null;
  value?: string | null;
  tags?: string[];
  link?: string | null;
};
export type DashboardList = { id: string; title: string; subtitle?: string; rows: DashboardListRow[] };

/** Every section but observedAt and can is optional: a business reports what it has. A subscription business fills
 *  the member sections; a media or shop business fills groups, charts and lists. */
export type DashboardSnapshot = {
  observedAt: string;
  /** Members by plan, best plan per person. */
  plans?: DashboardPlan[];
  totalUsers?: number;
  signups?: { today: number; week: number; month: number };
  /** Daily counts from `since` (YYYY-MM-DD), oldest first. */
  daily?: { since: string; signups: DayCount[]; upgrades: DayCount[] };
  recentUpgrades?: RecentUpgrade[];
  churned?: ChurnedCustomer[];
  pending?: PendingCancellation[];
  security?: { suspended: number; flagged: number; rateLimited24h: number } | null;
  orphaned?: OrphanedCustomer[] | null;
  groups?: DashboardGroup[];
  charts?: DashboardChart[];
  lists?: DashboardList[];
  templates?: Record<string, DashboardTemplate>;
  /** What part failed to load, by section id, so the rest still shows. */
  errors?: Record<string, string>;
  /** What the owner can do from HQ. */
  can: { contact: boolean; notes: boolean };
};

export type DashboardNote = { id: string; note: string; createdAt: string };

const str = (v: unknown): v is string => typeof v === "string";
const optStr = (v: unknown) => v === null || v === undefined || str(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const count = (v: unknown): v is number => num(v) && v >= 0 && Number.isInteger(v);
const iso = (v: unknown) => str(v) && Number.isFinite(Date.parse(v));
const day = (v: unknown) => str(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);
const source = (v: unknown) => v === "card" || v === "apple" || v === "google";
const contact = (v: unknown) => (CONTACT_STATUSES as readonly unknown[]).includes(v);

/** Values that must never ride in a snapshot: live keys, tokens, JWTs. Names, emails and phones are allowed. */
const SECRET = /\b(sk|rk)_(live|test)_[A-Za-z0-9]{8,}|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.|\bwhsec_[A-Za-z0-9]{8,}/;

function rowErrors(rows: unknown, path: string, check: (r: Record<string, unknown>) => string | null): string[] {
  if (!Array.isArray(rows)) return [`${path} must be a list`];
  const out: string[] = [];
  const keys = new Set<string>();
  rows.forEach((r, i) => {
    if (!r || typeof r !== "object") { out.push(`${path}[${i}] must be an object`); return; }
    const row = r as Record<string, unknown>;
    if (!str(row.key) || !row.key) out.push(`${path}[${i}].key is required`);
    else if (keys.has(row.key)) out.push(`${path}[${i}].key is repeated`);
    else keys.add(row.key);
    const e = check(row);
    if (e) out.push(`${path}[${i}].${e}`);
  });
  return out;
}

const has = (x: Record<string, unknown>, k: string) => x[k] !== undefined;
const httpsOrNull = (v: unknown) => v === null || v === undefined || (str(v) && /^https:\/\//.test(v));

/** Problems with a snapshot, by field path (never the value). Empty when it's valid. */
export function dashboardProblems(s: unknown): string[] {
  if (!s || typeof s !== "object") return ["snapshot must be an object"];
  const x = s as Record<string, unknown>;
  const out: string[] = [];
  if (SECRET.test(JSON.stringify(s))) out.push("snapshot holds something shaped like a key or token");
  if (!iso(x.observedAt)) out.push("observedAt must be a date");
  if (has(x, "plans")) {
    if (!Array.isArray(x.plans)) out.push("plans must be a list");
    else x.plans.forEach((p, i) => {
      const r = p as Record<string, unknown>;
      if (!r || !str(r.id) || !str(r.label) || !count(r.count) || typeof r.paid !== "boolean") out.push(`plans[${i}] needs id, label, count and paid`);
    });
  }
  if (has(x, "totalUsers") && !count(x.totalUsers)) out.push("totalUsers must be a count");
  if (has(x, "signups")) {
    const su = x.signups as Record<string, unknown> | null;
    if (!su || !count(su.today) || !count(su.week) || !count(su.month)) out.push("signups needs today, week and month");
  }
  const days = (list: unknown) => Array.isArray(list) && list.every((p) => p && day((p as DayCount).date) && count((p as DayCount).count));
  if (has(x, "daily")) {
    const d = x.daily as Record<string, unknown> | null;
    if (!d || !day(d.since)) out.push("daily.since must be a day");
    for (const k of ["signups", "upgrades"] as const) if (!days(d?.[k])) out.push(`daily.${k} must be a list of {date, count}`);
  }
  if (has(x, "recentUpgrades")) out.push(...rowErrors(x.recentUpgrades, "recentUpgrades", (r) =>
    !optStr(r.name) || !optStr(r.email) ? "name and email must be text or null"
    : !str(r.plan) ? "plan is required"
    : !iso(r.startedAt) ? "startedAt must be a date"
    : !optStr(r.billingPeriod) ? "billingPeriod must be text or null" : null));
  if (has(x, "churned")) out.push(...rowErrors(x.churned, "churned", (r) =>
    !optStr(r.name) || !optStr(r.email) ? "name and email must be text or null"
    : !iso(r.churnedAt) ? "churnedAt must be a date"
    : !source(r.source) ? "source must be card, apple or google"
    : !contact(r.contact) ? "contact is not a known status"
    : !optStr(r.plan) || !optStr(r.previousProduct) || !optStr(r.cancelFeedback) || !optStr(r.cancelReason) || !optStr(r.template) ? "text fields must be text or null" : null));
  if (has(x, "pending")) out.push(...rowErrors(x.pending, "pending", (r) =>
    !optStr(r.name) || !optStr(r.email) || !optStr(r.phone) ? "name, email and phone must be text or null"
    : !str(r.plan) || !str(r.billingPeriod) || !str(r.status) || !str(r.currency) ? "plan, billingPeriod, status and currency are required"
    : !iso(r.expiresAt) ? "expiresAt must be a date"
    : !(r.memberSince === null || iso(r.memberSince)) ? "memberSince must be a date or null"
    : !num(r.amount) || r.amount < 0 ? "amount must be a number"
    : !source(r.source) ? "source must be card, apple or google"
    : !contact(r.contact) ? "contact is not a known status"
    : !optStr(r.affiliateCode) || !optStr(r.cancelFeedback) || !optStr(r.cancelReason) || !optStr(r.template) ? "text fields must be text or null" : null));
  if (has(x, "orphaned") && x.orphaned !== null) out.push(...rowErrors(x.orphaned, "orphaned", (r) =>
    !optStr(r.name) || !optStr(r.email) ? "name and email must be text or null"
    : !str(r.status) || !str(r.plan) || !str(r.interval) ? "status, plan and interval are required"
    : !num(r.amount) ? "amount must be a number"
    : !(r.created === null || iso(r.created)) ? "created must be a date or null"
    : !(r.link === null || (str(r.link) && /^https:\/\//.test(r.link))) ? "link must be an https address or null" : null));
  if (has(x, "security") && x.security !== null) {
    const sec = x.security as Record<string, unknown>;
    if (!sec || !count(sec.suspended) || !count(sec.flagged) || !count(sec.rateLimited24h)) out.push("security needs suspended, flagged and rateLimited24h, or null");
  }
  const ids = new Set<string>();
  const idOk = (v: unknown, path: string) => {
    if (!str(v) || !v) { out.push(`${path}.id is required`); return; }
    if (ids.has(v)) out.push(`${path}.id is repeated`);
    ids.add(v);
  };
  if (has(x, "groups")) {
    if (!Array.isArray(x.groups)) out.push("groups must be a list");
    else x.groups.forEach((g, i) => {
      const r = g as Record<string, unknown>;
      idOk(r?.id, `groups[${i}]`);
      if (!str(r?.title) || !Array.isArray(r?.tiles)) { out.push(`groups[${i}] needs a title and tiles`); return; }
      (r.tiles as Record<string, unknown>[]).forEach((t, j) => {
        if (!t || !str(t.label) || !(t.value === null || num(t.value))) out.push(`groups[${i}].tiles[${j}] needs a label and a number or null`);
        else if (t.format !== undefined && !["count", "money", "percent", "decimal"].includes(t.format as string)) out.push(`groups[${i}].tiles[${j}].format is not known`);
        else if (!optStr(t.hint) || !optStr(t.currency)) out.push(`groups[${i}].tiles[${j}] hint and currency must be text`);
      });
    });
  }
  if (has(x, "charts")) {
    if (!Array.isArray(x.charts)) out.push("charts must be a list");
    else x.charts.forEach((c, i) => {
      const r = c as Record<string, unknown>;
      idOk(r?.id, `charts[${i}]`);
      if (!str(r?.title) || !day(r?.since) || !(r?.kind === "area" || r?.kind === "bars") || !days(r?.points)) out.push(`charts[${i}] needs a title, since, kind and points`);
    });
  }
  if (has(x, "lists")) {
    if (!Array.isArray(x.lists)) out.push("lists must be a list");
    else x.lists.forEach((l, i) => {
      const r = l as Record<string, unknown>;
      idOk(r?.id, `lists[${i}]`);
      if (!str(r?.title)) out.push(`lists[${i}] needs a title`);
      out.push(...rowErrors(r?.rows, `lists[${i}].rows`, (row) =>
        !str(row.title) ? "title is required"
        : !optStr(row.subtitle) || !optStr(row.email) || !optStr(row.value) ? "text fields must be text or null"
        : !(row.at === null || row.at === undefined || iso(row.at)) ? "at must be a date or null"
        : !(row.tags === undefined || (Array.isArray(row.tags) && row.tags.every(str))) ? "tags must be a list of text"
        : !httpsOrNull(row.link) ? "link must be an https address or null" : null));
    });
  }
  if (has(x, "templates")) {
    const t = x.templates as Record<string, unknown> | null;
    if (!t || typeof t !== "object" || Array.isArray(t)) out.push("templates must be an object");
    else for (const [id, v] of Object.entries(t)) {
      const r = v as Record<string, unknown>;
      if (!r || !str(r.label) || !str(r.subject) || !str(r.body)) out.push(`templates.${id} needs label, subject and body`);
    }
  }
  if (has(x, "errors")) {
    const e = x.errors as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || Array.isArray(e) || !Object.values(e).every(str)) out.push("errors must map a section to a message");
  }
  const can = x.can as Record<string, unknown> | undefined;
  if (!can || typeof can.contact !== "boolean" || typeof can.notes !== "boolean") out.push("can needs contact and notes");
  return out;
}

/** A tile's value in words: "–" when unknown. */
export function tileText(t: DashboardTile): string {
  if (t.value === null) return "–";
  switch (t.format) {
    case "money": return `${t.currency ? `${t.currency.toUpperCase()} ` : ""}$${t.value.toLocaleString("en-AU", { maximumFractionDigits: 2, minimumFractionDigits: t.value % 1 ? 2 : 0 })}`;
    case "percent": return `${(t.value * 100).toFixed(1)}%`;
    case "decimal": return t.value.toLocaleString("en-AU", { maximumFractionDigits: 2 });
    default: return Math.round(t.value).toLocaleString("en-AU");
  }
}

export type Granularity = "daily" | "weekly" | "monthly";

/** Daily counts rolled up by ISO week (Monday start) or calendar month. Days stay as they are. */
export function rollUp(days: DayCount[], g: Granularity): DayCount[] {
  if (g === "daily") return days;
  const buckets = new Map<string, number>();
  for (const d of days) {
    const [y, m, dd] = d.date.split("-").map(Number);
    let key: string;
    if (g === "weekly") {
      const t = new Date(Date.UTC(y, m - 1, dd));
      t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
      key = t.toISOString().slice(0, 10);
    } else key = d.date.slice(0, 7);
    buckets.set(key, (buckets.get(key) ?? 0) + d.count);
  }
  return [...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([date, c]) => ({ date, count: c }));
}

/** Every day from the first to `until`, with 0 on days that had none, so the chart's spacing is true. */
export function fillDays(days: DayCount[], since: string, until: string): DayCount[] {
  const have = new Map(days.map((d) => [d.date, d.count]));
  const out: DayCount[] = [];
  const t = new Date(`${since}T00:00:00Z`), end = new Date(`${until}T00:00:00Z`);
  for (let i = 0; t <= end && i < 4000; i++, t.setUTCDate(t.getUTCDate() + 1)) {
    const k = t.toISOString().slice(0, 10);
    out.push({ date: k, count: have.get(k) ?? 0 });
  }
  return out;
}

/** The sum of the days on or after `from` (YYYY-MM-DD). */
export function sumSince(days: DayCount[], from: string): number {
  return days.reduce((t, d) => (d.date >= from ? t + d.count : t), 0);
}

/** A template with the person's first name in it. */
export function personalise(t: DashboardTemplate, name: string | null): { subject: string; body: string } {
  const first = name?.trim().split(/\s+/)[0] || "there";
  return { subject: t.subject.replace(/\{\{first_name\}\}/g, first), body: t.body.replace(/\{\{first_name\}\}/g, first) };
}

/** A paid plan id for filtering: the plan's own id when it matches one of the snapshot's paid plans, else "other". */
export function planOf(plan: string | null, plans: DashboardPlan[]): string {
  const p = (plan ?? "").toLowerCase();
  return plans.find((x) => x.paid && p.includes(x.id.toLowerCase()))?.id ?? "other";
}

/** Counts per value of `pick`, plus "all". */
export function countBy<T>(rows: T[], pick: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = { all: rows.length };
  for (const r of rows) { const k = pick(r); out[k] = (out[k] ?? 0) + 1; }
  return out;
}
