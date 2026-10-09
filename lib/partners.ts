// Partners: the creators, tipsters, podcasts, newsletters, media and affiliates a business works with to win customers,
// and the pipeline each one moves through (prospect → shortlisted → contacted → replied → negotiating → live → paused,
// or declined / ended), with dated history, the campaigns each one serves, deal terms, the tag on its links, the
// outreach drafts the owner sends, and notes. Pure: the model, the validator, the status rules, the tags and the
// measured results. lib/partner-store.ts reads and writes the files; lib/partner-report.ts gathers the facts.
//
// Rules the model enforces:
// - Nothing reaches a partner without the owner's yes. A draft is "sent-by-owner" only when the owner says they sent
//   it (`hq partner sent`), never on import. HQ itself sends only an EMAIL draft the owner approved, to the business
//   email the partner lists, from the business's own sender (lib/partner-outreach.ts has the gate, lib/partner-sender.ts
//   the send): then it is "sent-by-hq" with the provider's message id, or "failed" with the error. DMs and contact
//   forms are always sent by the owner.
// - A partner who opts out ("no thanks") is doNotContact: declined for good, never drafted or emailed again.
// - A partner whose compliance is "avoid" can never move past prospect (it may only be declined or ended).
// - A partner goes live only with compliance "ok".
// - No personal data beyond public business contact routes: the partner's public handle, profile link and one public
//   business contact route (a DM, a contact form or a business email the partner lists for enquiries).
// - No em or en dashes in any text.
import { formatAnalytics, type AUnit } from "./analytics-metrics";
import type { CampaignOutcome, Measure } from "./campaigns";

export const PARTNER_PLATFORMS = ["instagram", "tiktok", "youtube", "x", "podcast", "newsletter", "website"] as const;
export type PartnerPlatform = (typeof PARTNER_PLATFORMS)[number];
export const PARTNER_TYPES = ["tipster", "analytics", "podcast", "media", "creator", "affiliate", "newsletter"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];
export const PARTNER_STATUSES = ["prospect", "shortlisted", "contacted", "replied", "negotiating", "live", "paused", "declined", "ended"] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];
export const FIT_LEVELS = ["high", "medium", "low"] as const;
export type FitLevel = (typeof FIT_LEVELS)[number];
export const COMPLIANCE_STATES = ["ok", "check", "avoid"] as const;
export type ComplianceState = (typeof COMPLIANCE_STATES)[number];
export const CONTACT_ROUTES = ["dm", "email", "form", "agent", "other"] as const;
export type ContactRoute = (typeof CONTACT_ROUTES)[number];
export const DRAFT_CHANNELS = ["dm", "email", "form", "comment", "other"] as const;
export type DraftChannel = (typeof DRAFT_CHANNELS)[number];
/** "sent-by-owner" is set only by the owner's own word (`hq partner sent`). "sent-by-hq" and "failed" are set only by
 *  HQ's email sender, for an approved email draft (lib/partner-sender.ts). */
export const DRAFT_STATUSES = ["draft", "approved", "sent-by-owner", "sent-by-hq", "failed"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/** Columns on the Partnerships board, each a group of statuses. */
export const STAGES: { key: string; label: string; blurb: string; statuses: PartnerStatus[] }[] = [
  { key: "find", label: "Prospects", blurb: "Found and screened, not contacted", statuses: ["prospect", "shortlisted"] },
  { key: "talk", label: "In talks", blurb: "Contacted by the owner", statuses: ["contacted", "replied", "negotiating"] },
  { key: "live", label: "Live", blurb: "Running, with a tracked link", statuses: ["live", "paused"] },
  { key: "closed", label: "Closed", blurb: "Declined or ended", statuses: ["declined", "ended"] },
];
/** Statuses still in play (not declined or ended). */
export const OPEN_STATUSES: PartnerStatus[] = ["prospect", "shortlisted", "contacted", "replied", "negotiating", "live", "paused"];
/** Statuses past prospect that an "avoid" partner may never reach. */
const PAST_PROSPECT: PartnerStatus[] = ["shortlisted", "contacted", "replied", "negotiating", "live", "paused"];

export const STATUS_LABEL: Record<PartnerStatus, string> = {
  prospect: "Prospect", shortlisted: "Shortlisted", contacted: "Contacted", replied: "Replied", negotiating: "Negotiating",
  live: "Live", paused: "Paused", declined: "Declined", ended: "Ended",
};
export const PLATFORM_LABEL: Record<PartnerPlatform, string> = {
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", x: "X", podcast: "Podcast", newsletter: "Newsletter", website: "Website",
};
export const TYPE_LABEL: Record<PartnerType, string> = {
  tipster: "Tipster", analytics: "Analytics", podcast: "Podcast", media: "Media", creator: "Creator", affiliate: "Affiliate", newsletter: "Newsletter",
};
const SOCIAL = new Set<PartnerPlatform>(["instagram", "tiktok", "youtube", "x"]);

export type PartnerHistory = { at: string; status: PartnerStatus; note?: string };
/** One try at sending an email draft, written before the provider is called (so a crash never leads to a resend). */
export type SendAttempt = { at: string; run: string; result?: "sent" | "found" | "error"; error?: string };
export type OutreachDraft = {
  n: number; channel: DraftChannel; subject?: string; body: string; status: DraftStatus; at: string; approvedAt?: string; sentAt?: string;
  /** A follow-up to draft n (HQ writes at most one per partner). */
  followUpOf?: number;
  /** When the owner approved this draft having read the partner's compliance check note (needed for a "check" partner). */
  checkAckAt?: string;
  /** HQ's email sends: every attempt, the provider's message id once sent, the last error. */
  attempts?: SendAttempt[];
  messageId?: string;
  error?: string;
  /** The owner asked HQ to try a failed draft again (only after HQ looks for the first one on the provider). */
  retryAt?: string;
};
export type PartnerNote = { at: string; text: string };

export type Partner = {
  version: 1;
  /** The platform plus the handle in kebab case: instagram-demo-brew-tips. */
  id: string;
  name: string;
  /** The public handle (@name) on a social platform, or the show, newsletter or site name. */
  handle: string;
  platform: PartnerPlatform;
  /** The public profile, show or site (https, no query string). */
  url: string | null;
  /** ISO 3166 country code, when known. */
  country: string | null;
  type: PartnerType;
  /** Public audience size, where it was read and when. null followers: not known. */
  audience: { followers: number | null; source: string; at: string | null };
  fit: { level: FitLevel; reason: string };
  compliance: { status: ComplianceState; notes: string };
  /** One public business contact route. detail: a contact page (https) or a business email the partner lists. */
  contact: { route: ContactRoute; detail?: string } | null;
  status: PartnerStatus;
  history: PartnerHistory[];
  /** Campaign ids this partner serves. */
  campaigns: string[];
  /** Terms in words, plus optional numbers in the business's currency: commission per paying customer, flat fee. */
  deal: { terms: string; commission?: number; fee?: number } | null;
  /** tag: the utm_campaign value on the partner's links (default `<campaign tag>-<handle>`). link: the partner link. */
  tracking: { tag: string | null; link: string | null };
  drafts: OutreachDraft[];
  notes: PartnerNote[];
  /** Ids of the matching records in an optional CRM (lib/twenty-sync.ts). */
  crm?: { twenty?: { companyId?: string; personId?: string; opportunityId?: string; syncedAt: string } };
  /** The partner asked not to be contacted (the owner recorded it). Declined for good: no drafts, no sends. */
  doNotContact?: { at: string; note?: string };
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------- text checks

const DASH = /[–—]/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** A partner tag: a utm_campaign value (no prefix star). */
export const PARTNER_TAG = /^[a-z0-9][a-z0-9_-]{0,59}$/;
const validDay = (s: unknown): s is string => typeof s === "string" && DAY.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const validTime = (s: unknown): s is string => typeof s === "string" && Number.isFinite(Date.parse(s));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[A-Za-z]{2,}/;
const SECRET = [
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, // uuid
  /\b[0-9a-f]{32,}\b/i,                                                // long hex
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./,                               // jwt
  /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}/,                          // live keys
];
const DIGITS = (s: string) => s.replace(/\D/g, "").length;
/** Nine or more digits in one run (a phone number), once dates, decimals, money and thousands are set aside. */
const hasPhone = (s: string) => {
  const rest = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ").replace(/\b\d+\.\d{1,2}\b(?!\.\d)/g, " ").replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, " ");
  return (rest.match(/[+(]?\d[\d\s().-]*\d/g) ?? []).some((run) => DIGITS(run) >= 9);
};
const stripUrls = (s: string) => s.replace(/https?:\/\/\S+/g, " ");
/** Why text holds personal data (an email, a phone number, an id or a key), or "". Links are fine (they're public). */
export function personalData(s: string, opts: { emailOk?: boolean } = {}): string {
  const t = stripUrls(s);
  if (!opts.emailOk && EMAIL.test(t)) return "an email address";
  if (hasPhone(t)) return "a phone number";
  if (SECRET.some((r) => r.test(t))) return "an id or a key";
  return "";
}

function prose(field: string, v: unknown, max: number, opts: { required?: boolean; oneLine?: boolean } = {}): string {
  if (v === undefined || v === null || v === "") return opts.required ? `${field} is required` : "";
  if (typeof v !== "string") return `${field} must be text`;
  if (opts.required && !v.trim()) return `${field} is required`;
  if (v.length > max) return `${field} is ${v.length} characters (at most ${max})`;
  if (opts.oneLine && /\n/.test(v)) return `${field} must be one line`;
  if (DASH.test(v)) return `${field} has an em or en dash: use a comma, a colon or "to"`;
  const pd = personalData(v);
  if (pd) return `${field} looks like it holds ${pd}: partners hold no personal data beyond a public business contact route (contact.detail)`;
  return "";
}

const httpsUrl = (v: unknown, max = 300) => typeof v === "string" && v.length <= max && /^https:\/\/[^\s/?#]+\.[^\s/?#]+[^\s]*$/.test(v);

// ---------------------------------------------------------------- ids and tags

const kebab = (s: string, max: number) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");
/** The handle as a slug: "@Demo.Brew_Tips" → "demo-brew-tips". */
export const handleSlug = (handle: string) => kebab(handle.replace(/^@/, ""), 40) || "partner";
/** A partner's id: its platform plus its handle in kebab case. */
export const partnerId = (platform: string, handle: string) => `${platform}-${handleSlug(handle)}`;
/** The default tag on a partner's links for a campaign: the campaign's tag plus the handle, so it counts toward the
 *  campaign by prefix (`cold-brew` → `cold-brew-demo-brew-tips`). A prefix tag (`series-*`) drops its star. */
export function partnerTag(campaignUtm: string, handle: string): string {
  const base = campaignUtm.replace(/\*$/, "").replace(/[-_]+$/, "");
  const room = 59 - base.length;
  const h = handleSlug(handle).slice(0, Math.max(4, room)).replace(/-+$/, "");
  return `${base}-${h}`.slice(0, 60).replace(/-+$/, "");
}
/** A partner's own-site link with its tag: utm_source the platform, utm_medium partner, utm_campaign the tag. */
export function partnerLink(url: string, tag: string, platform: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
    u.searchParams.set("utm_source", platform);
    u.searchParams.set("utm_medium", "partner");
    u.searchParams.set("utm_campaign", tag);
    return u.toString();
  } catch { return url; }
}

// ---------------------------------------------------------------- the validator

function handleProblem(platform: unknown, handle: unknown): string {
  if (typeof handle !== "string" || !handle.trim()) return "handle is required: the public @handle, or the show, newsletter or site name";
  if (SOCIAL.has(platform as PartnerPlatform)) {
    if (!/^@[A-Za-z0-9._]{1,60}$/.test(handle)) return `handle on ${platform} must be the public @handle (letters, digits, . and _), e.g. @demo.brew.tips`;
    return "";
  }
  return prose("handle", handle, 100, { oneLine: true });
}

function draftProblems(d: OutreachDraft, i: number): string[] {
  const at = `drafts[${i}]`;
  const out: string[] = [];
  if (!d || typeof d !== "object") return [`${at} must be an object`];
  if (!Number.isInteger(d.n) || d.n < 1) out.push(`${at}.n must be a whole number from 1`);
  if (!(DRAFT_CHANNELS as readonly string[]).includes(d.channel)) out.push(`${at}.channel must be one of ${DRAFT_CHANNELS.join(", ")}`);
  if (d.subject !== undefined) { const p = prose(`${at}.subject`, d.subject, 150, { oneLine: true }); if (p) out.push(p); }
  if (typeof d.body !== "string" || !d.body.trim()) out.push(`${at}.body is required`);
  else {
    if (d.body.length > 3000) out.push(`${at}.body is ${d.body.length} characters (at most 3000)`);
    if (DASH.test(d.body)) out.push(`${at}.body has an em or en dash: use a comma, a colon or "to"`);
    const pd = personalData(d.body);
    if (pd) out.push(`${at}.body looks like it holds ${pd}: the owner adds their own contact details when they send it`);
  }
  if (!(DRAFT_STATUSES as readonly string[]).includes(d.status)) out.push(`${at}.status must be draft, approved or sent-by-owner, or (for an approved email HQ sent) sent-by-hq or failed`);
  if (!validTime(d.at)) out.push(`${at}.at is not a date`);
  if (d.status === "sent-by-owner" && !validTime(d.sentAt)) out.push(`${at}: a draft the owner sent needs sentAt`);
  if (d.status === "sent-by-hq") {
    if (d.channel !== "email") out.push(`${at}: HQ only ever sends email drafts`);
    if (!validTime(d.sentAt) || typeof d.messageId !== "string" || !d.messageId || !d.attempts?.length) out.push(`${at}: a draft HQ sent needs sentAt, the provider's messageId and its attempt`);
  }
  if (d.status === "failed" && (!d.attempts?.length || typeof d.error !== "string")) out.push(`${at}: a failed draft needs its attempt and error`);
  if ((d.status === "sent-by-hq" || d.status === "failed") && !validTime(d.approvedAt)) out.push(`${at}: HQ sends only drafts the owner approved (approvedAt)`);
  if (d.followUpOf !== undefined && !(Number.isInteger(d.followUpOf) && d.followUpOf >= 1)) out.push(`${at}.followUpOf must be a draft number`);
  for (const k of ["checkAckAt", "retryAt"] as const) if (d[k] !== undefined && !validTime(d[k])) out.push(`${at}.${k} is not a date`);
  if (d.attempts !== undefined) {
    if (!Array.isArray(d.attempts) || d.attempts.some((a) => !a || !validTime(a.at) || typeof a.run !== "string")) out.push(`${at}.attempts must each have at and run`);
  }
  if (d.error !== undefined) { if (typeof d.error !== "string" || d.error.length > 600) out.push(`${at}.error must be text (at most 600)`); }
  if (d.messageId !== undefined && !(typeof d.messageId === "string" && /^[\w.@<>:-]{1,200}$/.test(d.messageId))) out.push(`${at}.messageId must be the provider's id`);
  return out;
}

/** Every problem with a partner, each a sentence that says how to fix it. Empty when it's valid. */
export function partnerProblems(x: unknown): string[] {
  const p = (x ?? {}) as Partial<Partner>;
  const out: string[] = [];
  const add = (s: string) => { if (s) out.push(s); };
  if (p.version !== 1) out.push("version must be 1");
  if (typeof p.id !== "string" || !ID.test(p.id) || p.id.length > 80) out.push("id must be kebab case: the platform plus the handle (instagram-demo-brew-tips)");
  add(prose("name", p.name, 100, { required: true, oneLine: true }));
  if (!(PARTNER_PLATFORMS as readonly string[]).includes(p.platform as string)) out.push(`platform must be one of ${PARTNER_PLATFORMS.join(", ")}`);
  add(handleProblem(p.platform, p.handle));
  if (p.url !== null && !(httpsUrl(p.url) && !/[?#]/.test(p.url as string))) out.push("url must be the public profile, show or site as an https link with no query string (or null)");
  if (p.country !== null && !(typeof p.country === "string" && /^[A-Z]{2}$/.test(p.country))) out.push("country must be a two-letter country code such as AU or US (or null)");
  if (!(PARTNER_TYPES as readonly string[]).includes(p.type as string)) out.push(`type must be one of ${PARTNER_TYPES.join(", ")}`);

  const a = p.audience;
  if (!a || typeof a !== "object") out.push("audience must be { followers, source, at }");
  else {
    if (a.followers !== null && !(isNum(a.followers) && a.followers >= 0 && Number.isInteger(a.followers))) out.push("audience.followers must be a whole number, or null when not known");
    if (a.followers !== null) {
      add(prose("audience.source", a.source, 120, { required: true, oneLine: true }));
      if (!validDay(a.at)) out.push("audience.at must be the date the followers were read (YYYY-MM-DD)");
    } else {
      add(prose("audience.source", a.source, 120, { oneLine: true }));
      if (a.at !== null && a.at !== undefined && !validDay(a.at)) out.push("audience.at must be a date (YYYY-MM-DD) or null");
    }
  }

  if (!p.fit || !(FIT_LEVELS as readonly string[]).includes(p.fit.level)) out.push("fit.level must be high, medium or low");
  add(prose("fit.reason", p.fit?.reason, 300, { required: true }));

  const c = p.compliance;
  if (!c || !(COMPLIANCE_STATES as readonly string[]).includes(c.status)) out.push("compliance.status must be ok, check or avoid");
  add(prose("compliance.notes", c?.notes, 500, { required: c?.status === "check" || c?.status === "avoid" }));

  if (p.contact !== null && p.contact !== undefined) {
    if (!(CONTACT_ROUTES as readonly string[]).includes(p.contact.route)) out.push(`contact.route must be one of ${CONTACT_ROUTES.join(", ")}`);
    const d = p.contact.detail;
    if (d !== undefined) {
      const ok = typeof d === "string" && d.length <= 200 && !DASH.test(d) && (httpsUrl(d, 200) || /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(d) || (!personalData(d) && !/\d{6,}/.test(d)));
      if (!ok) out.push("contact.detail must be a public contact page (https) or the business email the partner lists for enquiries, never a phone number");
    }
  } else if (p.contact === undefined) out.push("contact must be { route, detail? } or null");

  if (!(PARTNER_STATUSES as readonly string[]).includes(p.status as string)) out.push(`status must be one of ${PARTNER_STATUSES.join(", ")}`);
  if (c?.status === "avoid" && PAST_PROSPECT.includes(p.status as PartnerStatus)) out.push(`compliance is avoid, so the partner can't be ${p.status}: an avoid partner never moves past prospect (decline or end it)`);
  if (p.status === "live" && c && c.status !== "ok") out.push("a live partner needs compliance ok: pause it, or clear the compliance check first");
  if (p.doNotContact !== undefined) {
    if (!p.doNotContact || !validTime(p.doNotContact.at)) out.push("doNotContact must be { at, note? }");
    else if (p.doNotContact.note !== undefined) add(prose("doNotContact.note", p.doNotContact.note, 300));
    if (p.status !== "declined" && p.status !== "ended") out.push("a partner who opted out (doNotContact) stays declined or ended");
  }

  if (!Array.isArray(p.history) || !p.history.length) out.push("history must list at least the first status");
  else {
    p.history.forEach((h, i) => {
      if (!h || !(PARTNER_STATUSES as readonly string[]).includes(h.status) || !validTime(h.at)) out.push(`history[${i}] needs a status and a date`);
      if (h?.note !== undefined) add(prose(`history[${i}].note`, h.note, 500));
    });
    if (p.history.at(-1)?.status !== p.status) out.push("the last history entry must be the current status");
  }

  if (!Array.isArray(p.campaigns) || p.campaigns.some((id) => typeof id !== "string" || !ID.test(id) || id.length > 60)) out.push("campaigns must be a list of campaign ids");
  else if (new Set(p.campaigns).size !== p.campaigns.length) out.push("campaigns lists a campaign twice");

  if (p.deal !== null && p.deal !== undefined) {
    add(prose("deal.terms", p.deal.terms, 1000));
    for (const k of ["commission", "fee"] as const) if (p.deal[k] !== undefined && !(isNum(p.deal[k]) && (p.deal[k] as number) >= 0)) out.push(`deal.${k} must be a number, 0 or more, in the business's currency`);
  } else if (p.deal === undefined) out.push("deal must be { terms, commission?, fee? } or null");

  const t = p.tracking;
  if (!t || typeof t !== "object") out.push("tracking must be { tag, link }");
  else {
    if (t.tag !== null && !(typeof t.tag === "string" && PARTNER_TAG.test(t.tag))) out.push("tracking.tag must be lowercase letters, digits, - or _ (at most 60), e.g. cold-brew-demo-brew-tips");
    if (t.link !== null && !httpsUrl(t.link, 500)) out.push("tracking.link must be an https link (or null)");
  }

  if (!Array.isArray(p.drafts)) out.push("drafts must be a list");
  else {
    p.drafts.forEach((d, i) => out.push(...draftProblems(d, i)));
    if (new Set(p.drafts.map((d) => d?.n)).size !== p.drafts.length) out.push("drafts: each draft needs its own number n");
  }
  if (!Array.isArray(p.notes)) out.push("notes must be a list");
  else p.notes.forEach((n, i) => { add(prose(`notes[${i}]`, n?.text, 2000, { required: true })); if (!validTime(n?.at)) out.push(`notes[${i}].at is not a date`); });

  if (p.crm !== undefined) {
    const tw = p.crm?.twenty;
    const idOk = (v: unknown) => v === undefined || (typeof v === "string" && /^[\w-]{1,64}$/.test(v));
    if (!p.crm || typeof p.crm !== "object" || (tw !== undefined && (!idOk(tw.companyId) || !idOk(tw.personId) || !idOk(tw.opportunityId) || !validTime(tw.syncedAt)))) out.push("crm holds only CRM record ids and when they were synced");
  }
  if (!validTime(p.createdAt) || !validTime(p.updatedAt)) out.push("createdAt and updatedAt must be dates");
  return out;
}

// ---------------------------------------------------------------- input

/** What `hq partner add` accepts for one partner. id and tracking are derived when left out; status starts at
 *  prospect. `followers`, `followersSource` and `followersAt` are a flat shorthand for `audience`. */
export type PartnerInput = {
  id?: string; name: string; handle: string; platform: PartnerPlatform; url?: string | null; country?: string | null; type: PartnerType;
  audience?: { followers: number | null; source?: string; at?: string | null };
  followers?: number | null; followersSource?: string; followersAt?: string;
  fit: { level: FitLevel; reason: string };
  compliance: { status: ComplianceState; notes?: string };
  contact?: { route: ContactRoute; detail?: string } | null;
  status?: PartnerStatus; campaigns?: string[];
  deal?: { terms?: string; commission?: number; fee?: number } | null;
  tracking?: { tag?: string | null; link?: string | null };
  drafts?: { channel: DraftChannel; subject?: string; body: string; status?: DraftStatus }[];
  notes?: (string | { text: string })[];
};
const INPUT_KEYS = new Set(["id", "name", "handle", "platform", "url", "country", "type", "audience", "followers", "followersSource", "followersAt", "fit", "compliance", "contact", "status", "campaigns", "deal", "tracking", "drafts", "notes"]);

/** Drop the query string and fragment from a public profile link (share links carry tracking junk). */
const cleanUrl = (u: unknown) => {
  if (typeof u !== "string" || !u.trim()) return u === undefined || u === "" ? null : u;
  try { const x = new URL(u.trim()); x.search = ""; x.hash = ""; return x.toString(); } catch { return u; }
};
const normHandle = (platform: unknown, h: unknown) => {
  if (typeof h !== "string") return h;
  const t = h.trim();
  return SOCIAL.has(platform as PartnerPlatform) && t && !t.startsWith("@") ? `@${t}` : t;
};

/** A new partner from the owner's (or the research's) input, validated. Throws with every problem listed. Drafts
 *  always start as drafts: HQ never records a send it didn't see the owner make. */
export function newPartner(input: PartnerInput, now = new Date()): Partner {
  const at = now.toISOString();
  const i = (input ?? {}) as PartnerInput;
  const unknown = Object.keys(i).filter((k) => !INPUT_KEYS.has(k));
  if (unknown.length) throw Error(`the partner isn't valid:\n  - unknown field${unknown.length > 1 ? "s" : ""} ${unknown.join(", ")} (known: ${[...INPUT_KEYS].join(", ")})`);
  const sent = (i.drafts ?? []).filter((d) => d?.status && d.status !== "draft" && d.status !== "approved");
  if (sent.length) throw Error("the partner isn't valid:\n  - drafts can't be added as sent: HQ never sends on import, and a draft is marked sent only when the owner says so (npm run hq -- partner sent <slug> <id> <n>) or HQ's sender records it");
  const handle = normHandle(i.platform, i.handle) as string;
  const status = i.status ?? "prospect";
  const aud = i.audience ?? { followers: i.followers ?? null, source: i.followersSource, at: i.followersAt };
  const p: Partner = {
    version: 1,
    id: i.id ?? (typeof i.platform === "string" && typeof handle === "string" ? partnerId(i.platform, handle) : ""),
    name: typeof i.name === "string" ? i.name.trim() : i.name,
    handle, platform: i.platform,
    url: cleanUrl(i.url) as string | null,
    country: typeof i.country === "string" ? i.country.trim().toUpperCase() : i.country ?? null,
    type: i.type,
    audience: { followers: aud?.followers ?? null, source: typeof aud?.source === "string" ? aud.source.trim() : "", at: aud?.at ?? null },
    fit: { level: i.fit?.level, reason: typeof i.fit?.reason === "string" ? i.fit.reason.trim() : i.fit?.reason },
    compliance: { status: i.compliance?.status, notes: typeof i.compliance?.notes === "string" ? i.compliance.notes.trim() : i.compliance?.notes ?? "" },
    contact: i.contact ? { route: i.contact.route, ...(i.contact.detail ? { detail: i.contact.detail.trim() } : {}) } : null,
    status,
    history: [{ at, status, note: status === "prospect" ? "Added" : "Added (imported at this stage)" }],
    campaigns: [...(i.campaigns ?? [])],
    deal: i.deal ? { terms: (i.deal.terms ?? "").trim(), ...(i.deal.commission !== undefined ? { commission: i.deal.commission } : {}), ...(i.deal.fee !== undefined ? { fee: i.deal.fee } : {}) } : null,
    tracking: { tag: i.tracking?.tag ?? null, link: i.tracking?.link ?? null },
    drafts: (i.drafts ?? []).map((d, k) => ({ n: k + 1, channel: d?.channel, ...(d?.subject ? { subject: d.subject.trim() } : {}), body: typeof d?.body === "string" ? d.body.trim() : d?.body, status: d?.status === "approved" ? "approved" : "draft", at, ...(d?.status === "approved" ? { approvedAt: at } : {}) })),
    notes: (i.notes ?? []).map((n) => ({ at, text: (typeof n === "string" ? n : n?.text ?? "").trim() })),
    createdAt: at, updatedAt: at,
  };
  const problems = partnerProblems(p);
  if (problems.length) throw Error(`the partner isn't valid:\n  - ${problems.join("\n  - ")}`);
  return p;
}

// ---------------------------------------------------------------- status rules

/** Why a partner can't move to a status, or "" when it can. */
export function transitionProblem(p: Partner, to: PartnerStatus): string {
  if (!(PARTNER_STATUSES as readonly string[]).includes(to)) return `status must be one of ${PARTNER_STATUSES.join(", ")}`;
  if (p.status === to) return `${p.name} is already ${to}`;
  if (p.doNotContact && to !== "declined" && to !== "ended") return `${p.name} asked not to be contacted (${p.doNotContact.at.slice(0, 10)}): they stay declined and are never contacted again`;
  if (p.compliance.status === "avoid" && PAST_PROSPECT.includes(to)) return `${p.name}'s compliance is avoid (${p.compliance.notes}): an avoid partner can never move past prospect. Decline it, or record a fresh compliance check first`;
  if (to === "live" && p.compliance.status !== "ok") return `${p.name}'s compliance is ${p.compliance.status}: clear the check with Legal (compliance ok) before going live`;
  if ((p.status === "declined" || p.status === "ended") && !["prospect", "shortlisted"].includes(to)) return `${p.name} is ${p.status}: reopen it as a prospect or shortlisted first`;
  return "";
}

/** Warnings worth saying when a partner moves (not errors). */
export function transitionWarnings(p: Partner, to: PartnerStatus): string[] {
  const out: string[] = [];
  if (to === "live" && !p.tracking.tag) out.push("no tracking tag: its sign-ups can't be measured (link it to a campaign, or set tracking.tag)");
  if (to === "live" && !p.campaigns.length) out.push("not linked to a campaign: its results won't count toward one");
  if (to === "live" && !p.deal?.terms) out.push("no deal terms recorded");
  return out;
}

/** The latest thing that happened to a partner, for the board: a status move, a draft or a note. */
export function lastAction(p: Partner): { at: string; text: string } {
  const xs: { at: string; text: string }[] = [
    ...p.history.map((h) => ({ at: h.at, text: h.note && h.note !== "Added" ? `${STATUS_LABEL[h.status]}: ${h.note}` : STATUS_LABEL[h.status] })),
    ...p.drafts.map((d) => d.status === "sent-by-owner" ? { at: d.sentAt ?? d.at, text: `Owner sent draft ${d.n}` }
      : d.status === "sent-by-hq" ? { at: d.sentAt ?? d.at, text: `HQ emailed draft ${d.n}` }
      : d.status === "failed" ? { at: d.attempts?.at(-1)?.at ?? d.at, text: `Draft ${d.n} failed to send` }
      : d.status === "approved" ? { at: d.approvedAt ?? d.at, text: `Draft ${d.n} approved` }
      : { at: d.at, text: d.followUpOf ? `Follow-up ${d.n} written` : `Draft ${d.n} written` }),
    ...p.notes.map((n) => ({ at: n.at, text: `Note: ${n.text.slice(0, 80)}` })),
  ];
  return xs.sort((a, b) => a.at.localeCompare(b.at)).at(-1) ?? { at: p.createdAt, text: "Added" };
}

/** Order for lists: by status in pipeline order, then fit, then name. */
export function sortPartners(xs: Partner[]): Partner[] {
  const fit: Record<FitLevel, number> = { high: 0, medium: 1, low: 2 };
  return [...xs].sort((a, b) => PARTNER_STATUSES.indexOf(a.status) - PARTNER_STATUSES.indexOf(b.status) || fit[a.fit.level] - fit[b.fit.level] || a.name.localeCompare(b.name));
}

/** "12.3k", "1.2m", or "not known". */
export function followersLabel(n: number | null): string {
  if (n === null) return "not known";
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}m`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "")}k`;
  return n.toLocaleString("en-AU");
}

/** A draft that reached the partner (the owner sent it, or HQ emailed it). */
export const isSent = (d: { status: DraftStatus }) => d.status === "sent-by-owner" || d.status === "sent-by-hq";

// ---------------------------------------------------------------- results

/** The analytics adapter, as the partner results read it (lib/analytics.ts; rows keyed by utm_campaign). */
export type PartnerAnalytics = { connected: boolean; observedAt: string | null; campaigns: CampaignOutcome[] | null };
export type PartnerOutcome = { tag: string | null; visits: Measure; signups: Measure; paying: Measure; revenue: Measure };

const miss = (unit: AUnit, note: string): Measure => ({ value: null, unit, note });
const r2 = (n: number) => Math.round(n * 100) / 100;

/** What a set of partner tags brought, from the adapter's rows: exact tag matches only. Never zero-filled. */
export function tagOutcome(tags: string[], a: PartnerAnalytics, what = "this partner"): Omit<PartnerOutcome, "tag"> {
  const want = new Set(tags.map((t) => t.toLowerCase()));
  const measure = (field: "visits" | "signups" | "paying" | "revenue", unit: AUnit, label: string): Measure => {
    if (!want.size) return miss(unit, `No tracking tag on ${what}, so nothing can be counted (link it to a campaign or set tracking.tag)`);
    if (!a.connected) return miss(unit, "No analytics adapter connected, so results by tag can't be read");
    if (!a.campaigns) return miss(unit, "The analytics adapter doesn't report tags yet (add campaigns rows keyed by utm_campaign)");
    const rows = a.campaigns.filter((r) => want.has(r.utm.toLowerCase()));
    if (!rows.length) return miss(unit, `The analytics adapter reports no row for ${want.size === 1 ? `the tag ${[...want][0]}` : `these ${want.size} tags`}`);
    const reporting = rows.filter((r) => typeof r[field] === "number");
    if (!reporting.length) return miss(unit, `The adapter's ${rows.length === 1 ? "row has" : "rows have"} no ${label}`);
    const period = rows.find((r) => r.period)?.period;
    return { value: r2(reporting.reduce((n, r) => n + (r[field] as number), 0)), unit, note: `${reporting.length === 1 ? `Tag ${reporting[0].utm}` : `${reporting.length} partner tags`}${period ? `, ${period}` : ""}` };
  };
  return { visits: measure("visits", "count", "visits"), signups: measure("signups", "count", "sign-ups"), paying: measure("paying", "count", "paying customers"), revenue: measure("revenue", "money", "revenue") };
}

export const partnerOutcome = (p: Partner, a: PartnerAnalytics): PartnerOutcome => ({ tag: p.tracking.tag, ...tagOutcome(p.tracking.tag ? [p.tracking.tag] : [], a) });

export type PipelineReport = {
  total: number;
  counts: Record<PartnerStatus, number>;
  open: number;
  /** Live with a tracking tag: the ones whose results can be measured. */
  liveTagged: number;
  needsCheck: number;
  avoid: number;
  live: { partner: Partner; outcome: PartnerOutcome }[];
  /** Sign-ups and paying customers from every live or paused partner's tag together. */
  totals: { signups: Measure; paying: Measure; revenue: Measure };
  /** Drafts written, approved or failed, not yet sent (by the owner or by HQ). */
  waiting: number;
  /** Follow-up drafts HQ wrote that wait for the owner's yes. */
  followUps: number;
  /** Email drafts HQ tried to send and couldn't. */
  failed: number;
  missing: string[];
};

/** The pipeline: counts by status, live partners and what their tags brought, and what isn't measured yet. */
export function pipelineReport(partners: Partner[], a: PartnerAnalytics): PipelineReport {
  const counts = Object.fromEntries(PARTNER_STATUSES.map((s) => [s, 0])) as Record<PartnerStatus, number>;
  for (const p of partners) counts[p.status]++;
  const running = partners.filter((p) => p.status === "live" || p.status === "paused");
  const live = running.map((partner) => ({ partner, outcome: partnerOutcome(partner, a) }));
  const tags = running.map((p) => p.tracking.tag).filter((t): t is string => Boolean(t));
  const t = tagOutcome(tags, a, running.length ? "any live partner" : "a live partner (none is live yet)");
  const missing: string[] = [];
  if (!running.length) missing.push("Partner sign-ups: no partner is live yet");
  else {
    if (t.signups.value === null) missing.push(`Partner sign-ups: ${t.signups.note}`);
    if (t.paying.value === null && t.paying.note !== t.signups.note) missing.push(`Partner paying customers: ${t.paying.note}`);
    const untagged = running.filter((p) => !p.tracking.tag);
    if (untagged.length) missing.push(`${untagged.length} live ${untagged.length === 1 ? "partner has" : "partners have"} no tracking tag: ${untagged.map((p) => p.name).join(", ")}`);
  }
  return {
    total: partners.length, counts,
    open: partners.filter((p) => OPEN_STATUSES.includes(p.status)).length,
    liveTagged: partners.filter((p) => p.status === "live" && p.tracking.tag).length,
    needsCheck: partners.filter((p) => OPEN_STATUSES.includes(p.status) && p.compliance.status === "check").length,
    avoid: partners.filter((p) => p.compliance.status === "avoid").length,
    live, totals: { signups: t.signups, paying: t.paying, revenue: t.revenue },
    waiting: partners.filter((p) => OPEN_STATUSES.includes(p.status)).reduce((n, p) => n + p.drafts.filter((d) => !isSent(d)).length, 0),
    followUps: partners.filter((p) => OPEN_STATUSES.includes(p.status)).reduce((n, p) => n + p.drafts.filter((d) => d.followUpOf && d.status === "draft").length, 0),
    failed: partners.reduce((n, p) => n + p.drafts.filter((d) => d.status === "failed").length, 0),
    missing,
  };
}

/** A measure for printing: the number, or "not measured yet" and why. */
export const measureText = (m: Measure, currency: string) => (m.value === null ? `not measured yet: ${m.note}` : `${formatAnalytics(m.unit, m.value, currency)} (${m.note})`);

// ---------------------------------------------------------------- workflow evidence

/** Partners whose show is a podcast count toward "Podcast and creator appearances". */
export const isAppearance = (p: { type: string; platform: string }) => p.type === "podcast" || p.platform === "podcast";
