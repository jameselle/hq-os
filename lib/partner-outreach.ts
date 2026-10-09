// Partner outreach that HQ sends itself, the pure rules: the business's sender config (partners/outreach.json), the
// footer every HQ-sent email carries (who is writing, the business, its website, the company line and an opt-out, as
// the Spam Act 2003 asks), the gate a draft must pass before HQ emails it, the weekday office-hours window, the
// daily cap, and the one follow-up. No I/O: lib/partner-sender.ts runs the sends, lib/partner-store.ts keeps the files.
//
// What HQ sends: only an email draft the owner approved, to the business email the partner publishes for enquiries,
// from the business's own verified sender. Never a DM, never a contact form (the owner sends those), never to an avoid
// partner, never to a "check" partner unless the owner approved that very draft after reading the check note, never
// to anyone who opted out, never twice.
import { isSent, type OutreachDraft, type Partner } from "./partners";

export const SENDER_ROUTES = ["composio-resend", "composio-gmail"] as const;
export type SenderRoute = (typeof SENDER_ROUTES)[number];

export type OutreachConfig = {
  /** How HQ sends: a Composio connection (its account id) that can send as `from`. */
  sender: { via: SenderRoute; account: string; from: string; replyTo?: string };
  /** At most this many HQ-sent emails a business-local day (attempts count, failed or not). Default 10. */
  dailyCap?: number;
  /** The company line in the footer: who runs the business and its website. */
  companyLine: string;
  /** The website in the footer (default: the profile's first site). */
  website?: string;
  /** The name follow-ups are signed with (default: the first word of the sender's display name). */
  signOff?: string;
  /** true stops HQ sending (drafts, approvals and follow-ups still work). */
  paused?: boolean;
};

export const DEFAULT_DAILY_CAP = 10;
export const FOLLOW_UP_DAYS = 5;
/** Sends only Monday to Friday, from 9am until 5pm in the business's timezone. */
export const SEND_HOURS = { from: 9, until: 17 } as const;
/** The opt-out line, word for word, on every email HQ sends. */
export const OPT_OUT_LINE = "If you'd rather not hear from us, reply 'no thanks' and we won't contact you again.";

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[A-Za-z]{2,}$/;
const DASH = /[\u2013\u2014]/;

/** "Name <addr@host>" or "addr@host" → its parts, or null. */
export function parseAddress(s: unknown): { name: string; email: string } | null {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^(?:"?([^"<>]*?)"?\s*<([^<>\s]+)>|([^<>\s]+))$/);
  const email = (m?.[2] ?? m?.[3] ?? "").trim();
  return m && EMAIL.test(email) ? { name: (m[1] ?? "").trim(), email } : null;
}

/** Every problem with an outreach.json, each saying how to fix it. Empty when valid. */
export function outreachConfigProblems(x: unknown): string[] {
  const c = (x ?? {}) as Partial<OutreachConfig>;
  const out: string[] = [];
  const s = c.sender;
  if (!s || typeof s !== "object") out.push('sender must be { via, account, from, replyTo? }');
  else {
    if (!(SENDER_ROUTES as readonly string[]).includes(s.via)) out.push(`sender.via must be ${SENDER_ROUTES.join(" or ")}`);
    if (typeof s.account !== "string" || !/^[\w.-]{3,80}$/.test(s.account)) out.push("sender.account must be the Composio connection id that sends (from /hq:connections)");
    const from = parseAddress(s.from);
    if (!from || !from.name) out.push('sender.from must be a display name and address: "Jo from Demo Coffee <jo@coffee.example>"');
    if (s.replyTo !== undefined && !parseAddress(s.replyTo)) out.push("sender.replyTo must be an email address");
  }
  if (c.dailyCap !== undefined && !(Number.isInteger(c.dailyCap) && c.dailyCap >= 1 && c.dailyCap <= 50)) out.push("dailyCap must be a whole number from 1 to 50");
  if (typeof c.companyLine !== "string" || c.companyLine.trim().length < 8 || c.companyLine.length > 200 || /\n/.test(c.companyLine)) out.push('companyLine must be one line naming who runs the business, e.g. "Demo Coffee is run by Demo Coffee Pty Ltd, coffee.example"');
  else if (DASH.test(c.companyLine)) out.push("companyLine has an em or en dash");
  if (c.website !== undefined && !(typeof c.website === "string" && /^https:\/\/\S+$/.test(c.website))) out.push("website must be an https link");
  if (c.signOff !== undefined && !(typeof c.signOff === "string" && c.signOff.trim() && c.signOff.length <= 60 && !DASH.test(c.signOff))) out.push("signOff must be a short name");
  if (c.paused !== undefined && typeof c.paused !== "boolean") out.push("paused must be true or false");
  return out;
}

const siteText = (u: string) => u.replace(/\/+$/, "");

/** The footer on every email HQ sends: who is writing, the business, its website, the company line and the opt-out. */
export function emailFooter(cfg: OutreachConfig, business: { name: string; sites?: string[] }): string {
  const from = parseAddress(cfg.sender.from);
  const site = cfg.website ?? business.sites?.[0];
  return [
    "--",
    from?.name || business.name,
    ...(site ? [siteText(site)] : []),
    cfg.companyLine.trim(),
    "",
    OPT_OUT_LINE,
  ].join("\n");
}

/** Why a body doesn't carry the footer, or "". Every piece must be there as written. */
export function footerProblem(body: string, cfg: OutreachConfig, business: { name: string; sites?: string[] }): string {
  const missing: string[] = [];
  const from = parseAddress(cfg.sender.from);
  const site = cfg.website ?? business.sites?.[0];
  if (!body.includes(OPT_OUT_LINE)) missing.push("the opt-out line");
  if (!body.includes(cfg.companyLine.trim())) missing.push("the company line");
  if (from?.name && !body.includes(from.name)) missing.push("the sender's name");
  if (site && !body.includes(siteText(site))) missing.push("the website");
  return missing.length ? `the email is missing ${missing.join(", ")} from its footer (run npm run hq -- partner footer <slug>)` : "";
}

/** The body with the footer added at the end (unchanged when it's already there). */
export function withFooter(body: string, cfg: OutreachConfig, business: { name: string; sites?: string[] }): string {
  if (!footerProblem(body, cfg, business)) return body;
  // Drop a partial footer (a body that has the opt-out line but not the rest), then add the whole one.
  const clean = body.replace(/\n*--\n[\s\S]*$/, "").trimEnd();
  return `${clean}\n\n${emailFooter(cfg, business)}`;
}

// ---------------------------------------------------------------- when

/** The weekday (1 Monday … 7 Sunday), the hour and the date in a timezone. */
export function localClock(now: Date, tz: string): { day: string; hour: number; weekday: number } {
  const day = now.toLocaleDateString("en-CA", { timeZone: tz });
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: tz }).format(now));
  const wd = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(now);
  return { day, hour, weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd) + 1 };
}

/** Why HQ may not send right now, or "": weekdays only, 9am to 5pm business time. */
export function windowProblem(now: Date, tz: string): string {
  const c = localClock(now, tz);
  if (c.weekday > 5) return `it's the weekend in ${tz}: HQ sends on weekdays only`;
  if (c.hour < SEND_HOURS.from || c.hour >= SEND_HOURS.until) return `it's ${c.hour}:00 in ${tz}: HQ sends between ${SEND_HOURS.from}am and ${SEND_HOURS.until - 12}pm`;
  return "";
}

/** HQ-sent attempts on the business-local day of `now`, across every partner. */
export function sentToday(partners: Partner[], now: Date, tz: string): number {
  const today = localClock(now, tz).day;
  return partners.reduce((n, p) => n + p.drafts.reduce((m, d) => m + (d.attempts ?? []).filter((a) => localClock(new Date(a.at), tz).day === today).length, 0), 0);
}

export const capOf = (cfg: OutreachConfig) => cfg.dailyCap ?? DEFAULT_DAILY_CAP;

// ---------------------------------------------------------------- the gate

/** The partner's public business email, when its contact route is one. */
export function partnerEmail(p: Partner): string | null {
  return p.contact?.route === "email" && p.contact.detail && EMAIL.test(p.contact.detail) ? p.contact.detail : null;
}

/** Whether this draft is one HQ could ever send (an email to a partner with a public business email). */
export const hqSendable = (p: Partner, d: OutreachDraft) => d.channel === "email" && Boolean(partnerEmail(p));

/** Why HQ may not email this draft now (the window and the cap aside), or "". Checked again just before each send. */
export function sendProblem(p: Partner, d: OutreachDraft, cfg: OutreachConfig | null, business: { name: string; sites?: string[] }): string {
  if (d.channel !== "email") return `only email drafts are sent by HQ: the owner sends ${d.channel === "dm" ? "DMs" : d.channel === "form" ? "contact forms" : `${d.channel} messages`}`;
  if (!partnerEmail(p)) return `${p.name} lists no public business email: the owner sends it`;
  if (p.doNotContact) return `${p.name} asked not to be contacted`;
  if (p.compliance.status === "avoid") return `${p.name}'s compliance is avoid: never contacted`;
  if (p.status === "declined" || p.status === "ended") return `${p.name} is ${p.status}`;
  if (isSent(d)) return `draft ${d.n} was already sent`;
  if (d.status !== "approved") return d.status === "failed" ? `draft ${d.n} failed (${d.error ?? "no error kept"}): the owner retries it explicitly` : `draft ${d.n} isn't approved: HQ sends only drafts the owner approved`;
  if (p.compliance.status === "check" && !(d.checkAckAt && d.approvedAt && d.checkAckAt <= d.approvedAt)) return `${p.name}'s compliance needs a check (${p.compliance.notes}): the owner approves this draft after reading the note`;
  const last = d.attempts?.at(-1);
  if (last && !(d.retryAt && d.retryAt > last.at)) return `draft ${d.n} was already tried at ${last.at.slice(0, 16).replace("T", " ")}Z: HQ never sends twice unless the owner retries it`;
  if (!d.subject?.trim()) return `draft ${d.n} has no subject`;
  if (!cfg) return "no sender connected: HQ can't email until outreach.json names a verified sender (see the Partnerships guide)";
  const f = footerProblem(d.body, cfg, business);
  if (f) return f;
  return "";
}

// ---------------------------------------------------------------- the follow-up

/** The first message a follow-up would chase: the latest sent draft that isn't itself a follow-up. */
export function lastFirstMessage(p: Partner): OutreachDraft | null {
  return p.drafts.filter((d) => isSent(d) && !d.followUpOf && d.sentAt).sort((a, b) => (a.sentAt ?? "").localeCompare(b.sentAt ?? "")).at(-1) ?? null;
}

/** Whether HQ should write the follow-up now: a message went out FOLLOW_UP_DAYS or more ago, the partner is still
 *  only contacted, and no follow-up was ever written for them (one at most, ever). */
export function followUpDue(p: Partner, now: Date): OutreachDraft | null {
  if (p.doNotContact || p.compliance.status === "avoid" || p.status !== "contacted") return null;
  if (p.drafts.some((d) => d.followUpOf)) return null;
  const first = lastFirstMessage(p);
  if (!first?.sentAt) return null;
  return now.getTime() - Date.parse(first.sentAt) >= FOLLOW_UP_DAYS * 864e5 ? first : null;
}

const shortDate = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: tz });

/** The follow-up's words: short, polite, pointing back at the first message. Email ones carry the footer. */
export function followUpDraft(p: Partner, first: OutreachDraft, business: { name: string; sites?: string[]; timezone: string }, cfg: OutreachConfig | null): { channel: OutreachDraft["channel"]; subject?: string; body: string; followUpOf: number } {
  const signer = cfg?.signOff ?? (parseAddress(cfg?.sender.from)?.name.split(/\s+/)[0] || `The ${business.name} team`);
  const about = first.subject ? `about "${first.subject}"` : `about working together with ${business.name}`;
  const body = [
    "Hi there,",
    "",
    `Just following up on my message from ${shortDate(first.sentAt ?? first.at, business.timezone)} ${about}. I know things get busy, so no pressure at all. If it's of interest, I'm happy to send more detail or have a quick chat, and if the timing isn't right, no worries.`,
    "",
    "Cheers,",
    signer,
  ].join("\n");
  const subject = first.subject ? (/^re:/i.test(first.subject) ? first.subject : `Re: ${first.subject}`).slice(0, 150) : first.channel === "email" ? `Following up from ${business.name}` : undefined;
  return { channel: first.channel, ...(subject ? { subject } : {}), body: first.channel === "email" && cfg ? withFooter(body, cfg, business) : body, followUpOf: first.n };
}
