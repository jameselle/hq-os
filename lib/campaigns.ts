// Marketing campaigns: what each one is (goal, lever, audience, offer, channels, dates, budget, the tag every link
// carries, the number it is judged by and its target), what is linked to it (social posts, blog posts, lifecycle
// emails, experiments, live posts, vault notes), what was learned, and how it performed. Pure: the model, the
// validator and the performance maths. lib/campaign-store.ts reads and writes the files and gathers the facts.
//
// Performance is computed only from what HQ already holds: the business's social drafts and blog drafts tagged with
// the campaign, posts read back from a platform, lifecycle sends, spend tagged in the ledger, and outcomes the
// business's analytics adapter reports per campaign tag. A number nobody measures says what it needs; it is never
// shown as zero.
import { ANALYTICS, formatAnalytics, type AUnit, type AnalyticsId } from "./analytics-metrics";
import { campaignSpend } from "./ledger-spend";
import { DEPARTMENTS } from "./registry";
import { looksPrivate } from "./scorecard";
import { linkHasTag, tagMatches, UTM_TAG } from "./utm";

export const CAMPAIGN_STATUSES = ["planned", "live", "paused", "done"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const CAMPAIGN_LEVERS = ["get", "keep", "expand"] as const;
export type CampaignLever = (typeof CAMPAIGN_LEVERS)[number];
export const CAMPAIGN_CHANNELS = [
  "instagram", "tiktok", "x", "youtube", "facebook", "linkedin", "pinterest", "threads", "discord",
  "blog", "email", "ads", "partners", "search", "community", "pr", "events", "other",
] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];
/** social: a weekly-plan draft id. blog: a blog post slug. email: a lifecycle flow, message or workflow id.
 *  experiment: an experiment number. post: the https link of a live post. note: a note in the business's vault. */
export const LINK_KINDS = ["social", "blog", "email", "experiment", "post", "note"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export type CampaignLink = { kind: LinkKind; ref: string; at: string };
export type CampaignNote = { at: string; text: string; learning?: boolean };
/** One dated entry in the results log: what was measured that day, in words and (when measured) numbers. */
export type CampaignResult = { at: string; text: string; numbers?: { label: string; value: number }[] };

export type Campaign = {
  version: 1;
  id: string;
  name: string;
  /** One line: what the campaign is for. */
  goal: string;
  lever: CampaignLever;
  audience: string;
  /** The offer or hook. */
  offer: string;
  channels: CampaignChannel[];
  /** YYYY-MM-DD. */
  start: string;
  end?: string;
  status: CampaignStatus;
  /** In the business's currency. */
  budget?: number;
  /** The department that runs it (a registry slug, or "ceo"). */
  owner: string;
  /** The utm_campaign value every link carries, or a prefix ending in * (see lib/utm.ts). */
  utm: string;
  /** The analytics number it is judged by, and the target for it. */
  metric: AnalyticsId;
  target?: number;
  links: CampaignLink[];
  notes: CampaignNote[];
  results: CampaignResult[];
  createdAt: string;
  updatedAt: string;
};

export const CHANNEL_LABEL: Record<string, string> = {
  instagram: "Instagram", tiktok: "TikTok", x: "X", youtube: "YouTube", facebook: "Facebook", linkedin: "LinkedIn",
  pinterest: "Pinterest", threads: "Threads", discord: "Discord", blog: "Blog", email: "Email", ads: "Paid ads",
  partners: "Partners", search: "Search", community: "Community", pr: "Press", events: "Events", other: "Other",
};
export const STATUS_LABEL: Record<CampaignStatus, string> = { planned: "Planned", live: "Live", paused: "Paused", done: "Done" };

const DASH = /[–—]/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (s: unknown): s is string => typeof s === "string" && DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const OWNERS = new Set([...DEPARTMENTS.map((d) => d.slug), "ceo"]);

/** The campaign's id: its name in kebab case (at most 40 characters) plus its start date. */
export function campaignId(name: string, start: string): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return `${base || "campaign"}-${start}`;
}
/** A default tag from the name: kebab case, at most 40 characters. */
export const defaultUtm = (name: string) => campaignId(name, "x").replace(/-x$/, "");

/** Why a piece of owner-written text can't be stored, or "" when it can. */
function proseProblem(field: string, v: unknown, max: number, opts: { required?: boolean; oneLine?: boolean } = {}): string {
  if (v === undefined || v === null || v === "") return opts.required ? `${field} is required` : "";
  if (typeof v !== "string") return `${field} must be text`;
  if (opts.required && !v.trim()) return `${field} is required`;
  if (v.length > max) return `${field} is ${v.length} characters (at most ${max})`;
  if (opts.oneLine && /\n/.test(v)) return `${field} must be one line`;
  if (DASH.test(v)) return `${field} has an em or en dash: use a comma, a colon or "to"`;
  if (looksPrivate(v)) return `${field} looks like it holds personal data (an email, a phone number, an id or a key): campaigns never hold personal data`;
  return "";
}

function linkProblem(l: CampaignLink, i: number): string {
  const at = `links[${i}]`;
  if (!l || !(LINK_KINDS as readonly string[]).includes(l.kind)) return `${at}.kind must be one of ${LINK_KINDS.join(", ")}`;
  const ref = typeof l.ref === "string" ? l.ref.trim() : "";
  if (!ref || ref.length > 300) return `${at}.ref is required (at most 300 characters)`;
  if (DASH.test(ref)) return `${at}.ref has an em or en dash`;
  switch (l.kind) {
    case "social": if (!/^[\w.-]{1,80}$/.test(ref)) return `${at}: a social ref is a draft id like 2026-10-13-instagram-1`; break;
    case "blog": if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(ref)) return `${at}: a blog ref is the post's slug`; break;
    case "email": if (!/^[\w.:-]{1,80}$/.test(ref)) return `${at}: an email ref is a lifecycle flow, message or workflow id`; break;
    case "experiment": if (!/^\d{1,6}$/.test(ref)) return `${at}: an experiment ref is its number`; break;
    case "post": if (!/^https:\/\/\S+$/.test(ref)) return `${at}: a post ref is the live post's https link`; break;
    case "note": if (looksPrivate(ref)) return `${at}: the note ref looks like personal data`; break;
  }
  if (l.at !== undefined && !Number.isFinite(Date.parse(l.at))) return `${at}.at is not a date`;
  return "";
}

/** Every problem with a campaign, each a sentence that says how to fix it. Empty when it's valid. */
export function campaignProblems(x: unknown): string[] {
  const c = (x ?? {}) as Partial<Campaign>;
  const out: string[] = [];
  const add = (s: string) => { if (s) out.push(s); };
  add(proseProblem("name", c.name, 80, { required: true, oneLine: true }));
  add(proseProblem("goal", c.goal, 200, { required: true, oneLine: true }));
  add(proseProblem("audience", c.audience, 200, { required: true }));
  add(proseProblem("offer", c.offer, 300, { required: true }));
  if (typeof c.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id) || c.id.length > 60) out.push("id must be kebab case (the name plus the start date)");
  if (!(CAMPAIGN_LEVERS as readonly string[]).includes(c.lever as string)) out.push("lever must be get, keep or expand");
  if (!Array.isArray(c.channels) || !c.channels.length) out.push(`channels: list at least one of ${CAMPAIGN_CHANNELS.join(", ")}`);
  else for (const ch of c.channels) if (!(CAMPAIGN_CHANNELS as readonly string[]).includes(ch)) out.push(`unknown channel "${ch}": use ${CAMPAIGN_CHANNELS.join(", ")}`);
  if (!validDay(c.start)) out.push("start must be a date, YYYY-MM-DD");
  if (c.end !== undefined && c.end !== null && (!validDay(c.end) || (validDay(c.start) && c.end < c.start))) out.push("end must be a date (YYYY-MM-DD) on or after start");
  if (!(CAMPAIGN_STATUSES as readonly string[]).includes(c.status as string)) out.push("status must be planned, live, paused or done");
  if (c.budget !== undefined && c.budget !== null && !(typeof c.budget === "number" && Number.isFinite(c.budget) && c.budget >= 0)) out.push("budget must be a number, 0 or more, in the business's currency");
  if (typeof c.owner !== "string" || !OWNERS.has(c.owner)) out.push(`owner must be a department slug (${[...OWNERS].join(", ")})`);
  if (typeof c.utm !== "string" || !UTM_TAG.test(c.utm)) out.push("utm must be lowercase letters, digits, - or _ (at most 60), optionally ending in * for a prefix");
  if (typeof c.metric !== "string" || !Object.hasOwn(ANALYTICS, c.metric)) out.push(`metric must be an analytics id, e.g. new_signups (npm run hq -- analytics show <slug> lists them)`);
  if (c.target !== undefined && c.target !== null && !(typeof c.target === "number" && Number.isFinite(c.target) && c.target >= 0)) out.push("target must be a number, 0 or more");
  if (!Array.isArray(c.links)) out.push("links must be a list");
  else c.links.forEach((l, i) => add(linkProblem(l, i)));
  if (!Array.isArray(c.notes)) out.push("notes must be a list");
  else c.notes.forEach((n, i) => add(proseProblem(`notes[${i}]`, n?.text, 2000, { required: true })));
  if (!Array.isArray(c.results)) out.push("results must be a list");
  else c.results.forEach((r, i) => {
    add(proseProblem(`results[${i}]`, r?.text, 2000, { required: true }));
    for (const n of r?.numbers ?? []) if (!(typeof n?.value === "number" && Number.isFinite(n.value)) || proseProblem("label", n?.label, 80, { required: true })) out.push(`results[${i}].numbers: each needs a label and a number`);
  });
  return out;
}

/** What `hq campaign add` accepts: the campaign without its bookkeeping. id and utm are derived when left out. */
export type CampaignInput = Omit<Campaign, "version" | "id" | "utm" | "links" | "notes" | "results" | "createdAt" | "updatedAt" | "status" | "owner"> & {
  id?: string; utm?: string; status?: CampaignStatus; owner?: string;
  links?: { kind: LinkKind; ref: string }[]; notes?: (string | { text: string; learning?: boolean })[];
};

/** A new campaign from the owner's input, validated. Throws with every problem listed. */
export function newCampaign(input: CampaignInput, now = new Date()): Campaign {
  const at = now.toISOString();
  const i = (input ?? {}) as CampaignInput;
  const c: Campaign = {
    version: 1,
    id: i.id ?? (typeof i.name === "string" && typeof i.start === "string" ? campaignId(i.name, i.start) : ""),
    name: typeof i.name === "string" ? i.name.trim() : i.name,
    goal: typeof i.goal === "string" ? i.goal.trim() : i.goal,
    lever: i.lever, audience: typeof i.audience === "string" ? i.audience.trim() : i.audience,
    offer: typeof i.offer === "string" ? i.offer.trim() : i.offer,
    channels: i.channels, start: i.start, ...(i.end ? { end: i.end } : {}), status: i.status ?? "planned",
    ...(i.budget !== undefined && i.budget !== null ? { budget: i.budget } : {}),
    owner: i.owner ?? (i.lever === "keep" ? "email" : "ads"),
    utm: i.utm ?? (typeof i.name === "string" ? defaultUtm(i.name) : ""),
    metric: i.metric, ...(i.target !== undefined && i.target !== null ? { target: i.target } : {}),
    links: (i.links ?? []).map((l) => ({ kind: l?.kind, ref: typeof l?.ref === "string" ? l.ref.trim() : l?.ref, at })),
    notes: (i.notes ?? []).map((n) => (typeof n === "string" ? { at, text: n.trim() } : { at, text: (n?.text ?? "").trim(), ...(n?.learning ? { learning: true } : {}) })),
    results: [], createdAt: at, updatedAt: at,
  };
  const problems = campaignProblems(c);
  if (problems.length) throw Error(`the campaign isn't valid:\n  - ${problems.join("\n  - ")}`);
  return c;
}

/** Order for lists: live first, then planned, paused, done; newest start first within each. */
export function sortCampaigns(xs: Campaign[]): Campaign[] {
  const rank: Record<CampaignStatus, number> = { live: 0, planned: 1, paused: 2, done: 3 };
  return [...xs].sort((a, b) => rank[a.status] - rank[b.status] || b.start.localeCompare(a.start) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- performance

/** What the analytics adapter may report per campaign tag (docs/guides/analytics.md): counts and money only. */
export type CampaignOutcome = { id?: string; utm: string; visits?: number; signups?: number; paying?: number; revenue?: number; period?: string };

/** Everything about one business that a campaign's performance is worked out from, gathered once. */
export type CampaignFacts = {
  now: number;
  currency: string;
  /** The weekly social plan's drafts; null when the business has no social plan. */
  social: { id: string; network: string; format: string; day: string; status: string; url?: string; postedAt?: string; link?: string; campaign?: string; caption?: string }[] | null;
  /** The daily blog's drafts; null when the business has no blog. */
  blog: { slug: string; title: string; status: string; url?: string; publishedAt?: string; date: string; campaign?: string }[] | null;
  /** Posts read back from a platform (any business on this Mac), by url. */
  readBack: Record<string, { platform: string; at: string }>;
  /** The lifecycle snapshot's flows and messages; null with no lifecycle connection. */
  lifecycle: {
    observedAt: string | null;
    flows: { id: string; label: string; messages: string[]; daily: { day: string; sent: number }[]; outcomes: { label: string; window: string; emailed: { n: number; hit: number } }[] }[];
    workflows: { id: string; label: string; sent30d?: number }[];
  } | null;
  experiments: { id: number; hypothesis: string; metric: string; status: string; baseline: number | null; result: number | null; startedAt: string }[];
  /** The ledger with its includes; null when the business has none. */
  ledger: string | null;
  /** The analytics adapter: connected or not, and its per-campaign rows (null when it doesn't report any). */
  analytics: { connected: boolean; observedAt: string | null; campaigns: CampaignOutcome[] | null };
  /** Business-wide readings of analytics numbers (the board), for context and for numbers no tag can split. */
  readings: Partial<Record<AnalyticsId, { value: number | null; status: "measured" | "missing" | "na"; note: string }>>;
  /** Vault note refs that exist in the business's vault. */
  vaultNotes: string[];
  /** Tracking tags of the partners linked to each campaign (lib/partners.ts), by campaign id. */
  partnerTags?: Record<string, string[]>;
  /** Every campaign tag the business uses, so a child tag goes to the campaign whose tag is longest. */
  campaignTags?: string[];
};

/** A number in the report: measured, or missing with what it needs. Never zero-filled. */
export type Measure = { value: number | null; unit: AUnit; note: string };

export type CampaignReport = {
  campaign: Campaign;
  /** Days since start (0 on the first day); null before it starts. */
  day: number | null;
  social: { id: string; network: string; format: string; day: string; status: string; url?: string; linked: boolean }[];
  blog: { slug: string; title: string; status: string; url?: string; linked: boolean }[];
  posts: { url: string; platform: string | null; readBack: boolean }[];
  emails: { ref: string; label: string | null; sent: number | null; note: string; outcomes: string[] }[];
  experiments: { id: number; hypothesis: string | null; metric: string | null; status: string | null; baseline: number | null; result: number | null }[];
  notes: { ref: string; found: boolean }[];
  /** Items that actually went out: posted social posts, live blog posts, read-back posts, emails delivered. */
  out: number;
  spend: Measure;
  visits: Measure; signups: Measure; paying: Measure; revenue: Measure;
  costPerSignup: Measure; costPerPaying: Measure; roi: Measure;
  primary: { id: AnalyticsId; label: string; unit: AUnit; better: "up" | "down"; target: number | null; value: number | null; scope: "campaign" | "business" | null; progress: number | null; met: boolean | null; note: string };
  /** "not measured yet" lines: each number that's missing and what it needs. */
  missing: string[];
};

const DAY_MS = 864e5;
const r2 = (n: number) => Math.round(n * 100) / 100;
const miss = (unit: AUnit, note: string): Measure => ({ value: null, unit, note });
const has = (m: Measure) => m.value !== null;

/** The outcome rows that belong to a campaign: by id, by its exact tag, every tag under a prefix tag, the tags of the
 *  partners linked to it, and child tags under its own (`cold-brew-demo-brew-tips` under `cold-brew`, the way partner
 *  tags are made) unless the child belongs to another campaign whose tag is longer. */
export function outcomeRows(c: Campaign, rows: CampaignOutcome[], ctx: { partnerTags?: string[]; campaignTags?: string[] } = {}): CampaignOutcome[] {
  const partner = new Set((ctx.partnerTags ?? []).map((t) => t.toLowerCase()));
  const base = c.utm.endsWith("*") ? null : c.utm;
  const longer = (ctx.campaignTags ?? []).map((t) => t.replace(/\*$/, "")).filter((t) => base && t !== base && t.startsWith(`${base}-`));
  const child = (v: string) => Boolean(base && v.startsWith(`${base}-`) && !longer.some((t) => v === t || v.startsWith(`${t}-`)));
  return rows.filter((r) => {
    const v = (r.utm ?? "").toLowerCase();
    return r.id === c.id || tagMatches(v, c.utm) || partner.has(v) || child(v);
  });
}

/** Campaign field per analytics number, for numbers a campaign tag can split. */
const ATTRIBUTABLE: Partial<Record<AnalyticsId, "signups" | "paying" | "revenue" | "visits">> = {
  new_signups: "signups", new_paying: "paying", revenue: "revenue", link_clicks: "visits",
};

/** How a campaign performed, from the business's facts. Pure. */
export function campaignReport(c: Campaign, f: CampaignFacts): CampaignReport {
  const startMs = Date.parse(`${c.start}T00:00:00Z`);
  const day = f.now >= startMs ? Math.floor((f.now - startMs) / DAY_MS) : null;
  const refs = (k: LinkKind) => c.links.filter((l) => l.kind === k).map((l) => l.ref);
  const missing: string[] = [];

  // Social: drafts tagged with the campaign, linked by id, or whose link carries its tag.
  const socialRefs = new Set(refs("social"));
  const social = (f.social ?? []).filter((d) => d.campaign === c.id || socialRefs.has(d.id) || linkHasTag(d.link, c.utm))
    .map((d) => ({ id: d.id, network: d.network, format: d.format, day: d.day, status: d.status, url: d.url, linked: socialRefs.has(d.id) || d.campaign === c.id }));
  for (const id of socialRefs) if (!social.some((s) => s.id === id)) social.push({ id, network: "", format: "", day: "", status: "not found", url: undefined, linked: true });

  const blogRefs = new Set(refs("blog"));
  const blog = (f.blog ?? []).filter((d) => d.campaign === c.id || blogRefs.has(d.slug))
    .map((d) => ({ slug: d.slug, title: d.title, status: d.status, url: d.url, linked: true }));
  for (const s of blogRefs) if (!blog.some((b) => b.slug === s)) blog.push({ slug: s, title: s, status: "not found", url: undefined, linked: true });

  const posts = refs("post").map((url) => ({ url, platform: f.readBack[url]?.platform ?? null, readBack: Boolean(f.readBack[url]) }));

  const emails = refs("email").map((ref) => {
    if (!f.lifecycle) return { ref, label: null, sent: null, note: "No lifecycle connection, so sends can't be counted", outcomes: [] as string[] };
    const flow = f.lifecycle.flows.find((x) => x.id === ref);
    if (flow) {
      const sent = flow.daily.filter((d) => d.day >= c.start && (!c.end || d.day <= c.end)).reduce((n, d) => n + d.sent, 0);
      const outcomes = flow.outcomes.map((o) => `${o.label} (${o.window}): ${o.emailed.hit} of ${o.emailed.n}`);
      return { ref, label: flow.label, sent, note: `Delivered since ${c.start}`, outcomes };
    }
    const msgFlow = f.lifecycle.flows.find((x) => x.messages.includes(ref));
    const wf = f.lifecycle.workflows.find((w) => w.id === ref);
    if (wf && typeof wf.sent30d === "number") return { ref, label: wf.label, sent: wf.sent30d, note: "Delivered in the last 30 days (per-message sends aren't dated)", outcomes: [] as string[] };
    if (msgFlow) return { ref, label: msgFlow.label, sent: null, note: `Part of the ${msgFlow.label} flow; link the flow id (${msgFlow.id}) to count sends`, outcomes: [] as string[] };
    return { ref, label: null, sent: null, note: "Not in the lifecycle snapshot", outcomes: [] as string[] };
  });

  const experiments = refs("experiment").map((ref) => {
    const e = f.experiments.find((x) => String(x.id) === ref);
    return { id: Number(ref), hypothesis: e?.hypothesis ?? null, metric: e?.metric ?? null, status: e?.status ?? null, baseline: e?.baseline ?? null, result: e?.result ?? null };
  });
  const notes = refs("note").map((ref) => ({ ref, found: f.vaultNotes.includes(ref) }));

  const out = social.filter((s) => s.status === "posted" && s.url).length + blog.filter((b) => b.status === "published").length
    + posts.filter((p) => p.readBack).length + emails.filter((e) => (e.sent ?? 0) > 0).length;

  // Spend: tagged in the ledger.
  let spend: Measure;
  if (f.ledger === null) spend = miss("money", "No ledger for this business (Finance)");
  else {
    const s = campaignSpend(f.ledger, f.currency, c.id);
    spend = s.postings ? { value: s.total, unit: "money", note: `${s.postings} ledger ${s.postings === 1 ? "posting" : "postings"} tagged with the campaign` }
      : miss("money", `No spend tagged in the ledger (campaign: "${c.id}" on the transaction, or Expenses:Advertising:<Name>)`);
  }
  if (!has(spend)) missing.push(`Spend: ${spend.note}`);

  // Outcomes reported per tag by the analytics adapter.
  const rows = f.analytics.campaigns ? outcomeRows(c, f.analytics.campaigns, { partnerTags: f.partnerTags?.[c.id], campaignTags: f.campaignTags }) : [];
  const outcome = (field: "visits" | "signups" | "paying" | "revenue", unit: AUnit, what: string): Measure => {
    if (!f.analytics.connected) return miss(unit, "No analytics adapter connected, so outcomes by campaign tag can't be read");
    if (!f.analytics.campaigns) return miss(unit, `The analytics adapter doesn't report campaigns yet (add campaigns to its output, keyed by utm_campaign)`);
    const reporting = rows.filter((r) => typeof r[field] === "number");
    if (!rows.length) return miss(unit, `The analytics adapter reports no row for the tag ${c.utm}`);
    if (!reporting.length) return miss(unit, `The analytics adapter's row for ${c.utm} has no ${what}`);
    const period = rows.find((r) => r.period)?.period;
    return { value: r2(reporting.reduce((n, r) => n + (r[field] as number), 0)), unit, note: `${reporting.length > 1 ? `${reporting.length} tags under ${c.utm}` : `Tag ${reporting[0].utm}`}${period ? `, ${period}` : ""}` };
  };
  const visits = outcome("visits", "count", "visits");
  const signups = outcome("signups", "count", "sign-ups");
  const paying = outcome("paying", "count", "paying customers");
  const revenue = outcome("revenue", "money", "revenue");
  const sameReason = [visits, signups, paying, revenue].every((m) => !has(m) && m.note === signups.note);
  if (sameReason) missing.push(`Visits, sign-ups, paying customers and revenue by campaign: ${signups.note}`);
  else for (const [what, m] of [["Visits", visits], ["Sign-ups", signups], ["Paying customers", paying], ["Revenue", revenue]] as const) if (!has(m)) missing.push(`${what}: ${m.note}`);

  const per = (num: Measure, den: Measure, what: string): Measure => {
    if (!has(num) || !has(den)) return miss("money", `Needs ${[!has(num) ? "spend tagged in the ledger" : "", !has(den) ? `${what} by campaign tag` : ""].filter(Boolean).join(" and ")}`);
    if ((den.value as number) <= 0) return miss("money", `No ${what} yet to divide the spend by`);
    return { value: r2((num.value as number) / (den.value as number)), unit: "money", note: `Spend over ${what}` };
  };
  const costPerSignup = per(spend, signups, "sign-ups");
  const costPerPaying = per(spend, paying, "paying customers");
  const roi: Measure = !has(spend) || !has(revenue)
    ? miss("ratio", `Needs ${[!has(spend) ? "spend" : "", !has(revenue) ? "revenue by campaign tag" : ""].filter(Boolean).join(" and ")}`)
    : (spend.value as number) <= 0 ? miss("ratio", "No spend, so no return on it to work out")
      : { value: r2(((revenue.value as number) - (spend.value as number)) / (spend.value as number)), unit: "ratio", note: "Revenue less spend, over spend" };

  // The primary number against its target: the campaign's own figure when a tag can split it, else business-wide.
  const def = ANALYTICS[c.metric];
  const field = ATTRIBUTABLE[c.metric];
  let pv: number | null = null, scope: "campaign" | "business" | null = null, pnote: string;
  if (field) {
    const m = { signups, paying, revenue, visits }[field];
    if (has(m)) { pv = m.value; scope = "campaign"; pnote = m.note; }
    else {
      const b = f.readings[c.metric];
      pnote = `By campaign: not measured yet. ${m.note}.${b?.status === "measured" ? ` Business-wide, all sources: ${formatAnalytics(def.unit, b.value, f.currency)}` : b?.note ? ` Business-wide: ${b.note}` : ""}`;
    }
  } else {
    const b = f.readings[c.metric];
    if (b?.status === "measured" && b.value !== null) { pv = b.value; scope = "business"; pnote = `Business-wide; a campaign tag can't split this number. ${b.note}`; }
    else pnote = `Not measured yet: ${b?.note ?? def.needs}`;
  }
  const target = c.target ?? null;
  const better = def.better;
  const met = pv === null || target === null ? null : better === "down" ? pv <= target : pv >= target;
  const progress = pv === null || target === null || better === "down" || target <= 0 ? null : Math.round((pv / target) * 1000) / 1000;
  if (pv === null) missing.unshift(`${def.label} (the campaign's number): ${pnote.replace(/^By campaign: not measured yet\. /, "")}`);

  return {
    campaign: c, day, social, blog, posts, emails, experiments, notes, out,
    spend, visits, signups, paying, revenue, costPerSignup, costPerPaying, roi,
    primary: { id: c.metric, label: def.label, unit: def.unit, better, target, value: pv, scope, progress, met, note: pnote },
    missing: [...new Set(missing)],
  };
}

/** The numbers of a report that were measured, for the dated results log. Never a missing one. */
export function measuredNumbers(r: CampaignReport): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  const add = (label: string, v: number | null) => { if (v !== null) out.push({ label, value: v }); };
  add(`${r.primary.label}${r.primary.scope === "business" ? " (business-wide)" : ""}`, r.primary.value);
  add("Items out", r.out);
  add("Spend", r.spend.value); add("Visits", r.visits.value); add("Sign-ups", r.signups.value);
  add("Paying customers", r.paying.value); add("Revenue", r.revenue.value);
  add("Cost per sign-up", r.costPerSignup.value); add("Cost per paying customer", r.costPerPaying.value); add("Return on spend", r.roi.value);
  return out;
}
