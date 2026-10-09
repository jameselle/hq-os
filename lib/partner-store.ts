// Partners on disk: $HQ_DATA/businesses/<slug>/partners/<id>.json, one file per partner (0600), mirrored to the
// business's vault as Departments/Sales & Partnerships/Partners.md so the CEO review and the brain can read them.
// Every write is validated (lib/partners.ts). Shared by the site and the CLI. Nothing here sends anything: a draft
// is marked sent-by-owner only when the owner says they sent it, and HQ's own email sender (lib/partner-sender.ts)
// records its attempts and results through startAttempt / finishAttempt. partners/outreach.json is the business's
// sender config (lib/partner-outreach.ts), never a partner.
import fs from "node:fs";
import path from "node:path";

import { getCampaign } from "./campaign-store";
import {
  PLATFORM_LABEL, STATUS_LABEL, TYPE_LABEL, followersLabel, newPartner, partnerProblems, partnerTag, sortPartners, transitionProblem, transitionWarnings,
  isSent, type DraftChannel, type OutreachDraft, type Partner, type PartnerInput, type PartnerStatus,
} from "./partners";
import { footerProblem, outreachConfigProblems, withFooter, type OutreachConfig } from "./partner-outreach";
import { DEPARTMENTS } from "./registry";
import { businessDir, getProfile, vaultRoot } from "./store";

export const partnersDir = (slug: string) => path.join(businessDir(slug), "partners");
const SAFE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Files in the partners folder that aren't partners. */
const NOT_PARTNERS = new Set(["outreach.json"]);
const fileOf = (slug: string, id: string) => {
  if (!SAFE_ID.test(id) || NOT_PARTNERS.has(`${id}.json`)) throw Error(`no partner ${id}`);
  return path.join(partnersDir(slug), `${id}.json`);
};
const needBusiness = (slug: string) => { const p = getProfile(slug); if (!p) throw Error(`no such business: ${slug}`); return p; };

export type InvalidPartner = { file: string; problems: string[] };

/** Every partner of a business in pipeline order. Files that don't validate are returned apart, never shown. */
export function readPartners(slug: string): { partners: Partner[]; invalid: InvalidPartner[] } {
  const dir = partnersDir(slug);
  if (!fs.existsSync(dir)) return { partners: [], invalid: [] };
  const partners: Partner[] = [], invalid: InvalidPartner[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !NOT_PARTNERS.has(f)).sort()) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Partner;
      const problems = partnerProblems(p);
      if (problems.length) invalid.push({ file, problems }); else partners.push(p);
    } catch (e) { invalid.push({ file, problems: [`unreadable: ${(e as Error).message.slice(0, 120)}`] }); }
  }
  return { partners: sortPartners(partners), invalid };
}
export const listPartners = (slug: string): Partner[] => readPartners(slug).partners;

export function getPartner(slug: string, id: string): Partner {
  if (!SAFE_ID.test(id)) throw Error(`no partner ${id}`);
  const f = NOT_PARTNERS.has(`${id}.json`) ? "" : fileOf(slug, id);
  if (!f || !fs.existsSync(f)) {
    // A unique part of the id is enough on the command line ("demo-brew-tips" or "instagram-demo").
    const all = listPartners(slug);
    const exact = all.filter((p) => p.id.startsWith(id) || p.id.endsWith(`-${id}`));
    const hits = exact.length ? exact : all.filter((p) => p.id.includes(id));
    if (hits.length === 1) return hits[0];
    throw Error(hits.length ? `${id} matches ${hits.length} partners: ${hits.map((p) => p.id).join(", ")}` : `no partner ${id} for ${slug}`);
  }
  return JSON.parse(fs.readFileSync(f, "utf8")) as Partner;
}

function write(slug: string, p: Partner) {
  const problems = partnerProblems(p);
  if (problems.length) throw Error(`the partner isn't valid:\n  - ${problems.join("\n  - ")}`);
  fs.mkdirSync(partnersDir(slug), { recursive: true, mode: 0o700 });
  const f = fileOf(slug, p.id), tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(p, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, f);
}
function save(slug: string, p: Partner) { write(slug, p); mirrorToVault(slug); }

const touch = (p: Partner, now: Date) => { p.updatedAt = now.toISOString(); return p; };

/** Campaign ids must name a campaign of this business; the default tracking tag comes from the first one. */
function withCampaigns(slug: string, p: Partner): Partner {
  const known = p.campaigns.map((id) => getCampaign(slug, id));
  p.campaigns = known.map((c) => c.id);
  if (!p.tracking.tag && known.length) p.tracking.tag = partnerTag(known[0].utm, p.handle);
  return p;
}

export type AddResult = { added: Partner[]; updated: Partner[] };

/** Add one partner or a list of them (research imports). Everything is checked first; nothing is written unless every
 *  item is valid. With `update`, a partner that already exists has the given fields merged in (status moves still go
 *  through `setPartnerStatus`). */
export function addPartners(slug: string, input: PartnerInput | PartnerInput[], opts: { update?: boolean } = {}, now = new Date()): AddResult {
  needBusiness(slug);
  const items = Array.isArray(input) ? input : [input];
  if (!items.length) throw Error("nothing to add: give one partner or a list");
  const problems: string[] = [];
  const ready: { p: Partner; existed: boolean }[] = [];
  const seen = new Set<string>();
  items.forEach((item, i) => {
    const label = `#${i + 1}${item && typeof item === "object" && typeof item.name === "string" ? ` (${item.name})` : ""}`;
    try {
      const fresh = withCampaigns(slug, newPartner(item, now));
      if (seen.has(fresh.id)) throw Error(`${fresh.id} is in the list twice`);
      seen.add(fresh.id);
      const exists = fs.existsSync(fileOf(slug, fresh.id));
      if (!exists) { ready.push({ p: fresh, existed: false }); return; }
      if (!opts.update) throw Error(`${fresh.id} already exists (use --update to merge new fields into it)`);
      const old = getPartner(slug, fresh.id);
      if (item.status && item.status !== old.status) throw Error(`${fresh.id} is ${old.status}: change status with npm run hq -- partner status, not an import`);
      const merged: Partner = {
        ...old,
        name: fresh.name, handle: fresh.handle, type: fresh.type,
        url: item.url !== undefined ? fresh.url : old.url,
        country: item.country !== undefined ? fresh.country : old.country,
        audience: item.audience !== undefined || item.followers !== undefined ? fresh.audience : old.audience,
        fit: fresh.fit, compliance: fresh.compliance,
        contact: item.contact !== undefined ? fresh.contact : old.contact,
        campaigns: [...new Set([...old.campaigns, ...fresh.campaigns])],
        deal: item.deal !== undefined ? fresh.deal : old.deal,
        tracking: { tag: item.tracking?.tag !== undefined ? fresh.tracking.tag : old.tracking.tag ?? fresh.tracking.tag, link: item.tracking?.link !== undefined ? fresh.tracking.link : old.tracking.link },
        drafts: [...old.drafts, ...fresh.drafts.map((d, k) => ({ ...d, n: old.drafts.length + k + 1 }))],
        notes: [...old.notes, ...fresh.notes],
      };
      if (!merged.tracking.tag && merged.campaigns.length) withCampaigns(slug, merged);
      const bad = partnerProblems(touch(merged, now));
      if (bad.length) throw Error(bad.join("; "));
      ready.push({ p: merged, existed: true });
    } catch (e) {
      problems.push(`${label}: ${(e as Error).message.replace(/^the partner isn't valid:\n\s*- /, "").replace(/\n\s*- /g, "; ")}`);
    }
  });
  if (problems.length) throw Error(`nothing was saved; fix ${problems.length === 1 ? "this" : `these ${problems.length}`}:\n  - ${problems.join("\n  - ")}`);
  for (const { p } of ready) write(slug, p);
  mirrorToVault(slug);
  return { added: ready.filter((x) => !x.existed).map((x) => x.p), updated: ready.filter((x) => x.existed).map((x) => x.p) };
}

/** Move a partner along the pipeline, with a dated history entry. Refuses what the rules refuse (lib/partners.ts). */
export function setPartnerStatus(slug: string, id: string, status: PartnerStatus, note?: string, now = new Date()): { partner: Partner; warnings: string[] } {
  const p = getPartner(slug, id);
  const why = transitionProblem(p, status);
  if (why) throw Error(why);
  const warnings = transitionWarnings(p, status);
  p.status = status;
  p.history.push({ at: now.toISOString(), status, ...(note?.trim() ? { note: note.trim() } : {}) });
  save(slug, touch(p, now));
  return { partner: p, warnings };
}

/** Link a partner to a campaign (and give it the campaign's partner tag if it has none), or unlink it. */
export function linkPartnerCampaign(slug: string, id: string, campaignId: string, opts: { remove?: boolean } = {}, now = new Date()): Partner {
  const p = getPartner(slug, id);
  const c = getCampaign(slug, campaignId);
  if (opts.remove) {
    if (!p.campaigns.includes(c.id)) throw Error(`${p.id} isn't linked to ${c.id}`);
    p.campaigns = p.campaigns.filter((x) => x !== c.id);
  } else {
    if (p.campaigns.includes(c.id)) return p;
    p.campaigns.push(c.id);
    if (!p.tracking.tag) p.tracking.tag = partnerTag(c.utm, p.handle);
  }
  save(slug, touch(p, now));
  return p;
}

export function notePartner(slug: string, id: string, text: string, now = new Date()): Partner {
  const p = getPartner(slug, id);
  p.notes.push({ at: now.toISOString(), text: text.trim() });
  save(slug, touch(p, now));
  return p;
}

// ---------------------------------------------------------------- the sender config

export const outreachFile = (slug: string) => path.join(partnersDir(slug), "outreach.json");

/** The business's sender config, or null when there is none (HQ then never sends). Throws when it's there but wrong. */
export function readOutreachConfig(slug: string): OutreachConfig | null {
  const f = outreachFile(slug);
  if (!fs.existsSync(f)) return null;
  const c = JSON.parse(fs.readFileSync(f, "utf8")) as OutreachConfig;
  const problems = outreachConfigProblems(c);
  if (problems.length) throw Error(`partners/outreach.json isn't valid:\n  - ${problems.join("\n  - ")}`);
  return c;
}
/** The config, or null when it's missing or invalid (for pages that only show the state). */
export function outreachConfigOrNull(slug: string): { config: OutreachConfig | null; problem: string } {
  try { return { config: readOutreachConfig(slug), problem: "" }; } catch (e) { return { config: null, problem: (e as Error).message }; }
}
export function writeOutreachConfig(slug: string, c: OutreachConfig): OutreachConfig {
  needBusiness(slug);
  const problems = outreachConfigProblems(c);
  if (problems.length) throw Error(`the sender config isn't valid:\n  - ${problems.join("\n  - ")}`);
  fs.mkdirSync(partnersDir(slug), { recursive: true, mode: 0o700 });
  const f = outreachFile(slug), tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, f);
  return c;
}

/** One line per outreach event (sends, follow-ups, opt-outs, test sends) in partners/outreach-log.jsonl. */
export function outreachLog(slug: string, event: Record<string, unknown>, now = new Date()) {
  try {
    fs.mkdirSync(partnersDir(slug), { recursive: true, mode: 0o700 });
    fs.appendFileSync(path.join(partnersDir(slug), "outreach-log.jsonl"), JSON.stringify({ at: now.toISOString(), ...event }) + "\n", { mode: 0o600 });
  } catch { /* the draft is the record; the log is secondary */ }
}

const findDraft = (p: Partner, n: number): OutreachDraft => {
  const d = p.drafts.find((x) => x.n === n);
  if (!d) throw Error(`${p.id} has no draft ${n}`);
  return d;
};
const business = (slug: string) => { const b = needBusiness(slug); return { name: b.name, sites: b.sites }; };

/** Add an outreach draft. Always starts as a draft. An email draft gets the business's footer (the sender, the
 *  business, its website, the company line and the opt-out) when a sender is set up. Never for an avoid partner or
 *  one who opted out. */
export function addDraft(slug: string, id: string, d: { channel?: DraftChannel; subject?: string; body: string; status?: string; followUpOf?: number }, now = new Date()): Partner {
  if (d.status && d.status !== "draft") throw Error("a new outreach draft is always a draft: the owner approves it, then sends it (or HQ emails it once approved)");
  const p = getPartner(slug, id);
  if (p.doNotContact) throw Error(`${p.name} asked not to be contacted: no outreach is ever written for them again`);
  if (p.compliance.status === "avoid") throw Error(`${p.name}'s compliance is avoid: no outreach is written for an avoid partner`);
  if (d.followUpOf !== undefined && p.drafts.some((x) => x.followUpOf)) throw Error(`${p.name} already has a follow-up: HQ writes one at most`);
  const channel = d.channel ?? (p.contact?.route === "email" ? "email" : p.contact?.route === "form" ? "form" : "dm");
  const n = Math.max(0, ...p.drafts.map((x) => x.n)) + 1;
  let body = (d.body ?? "").trim();
  const cfg = channel === "email" ? outreachConfigOrNull(slug).config : null;
  if (cfg) body = withFooter(body, cfg, business(slug));
  p.drafts.push({ n, channel, ...(d.subject?.trim() ? { subject: d.subject.trim() } : {}), body, status: "draft", at: now.toISOString(), ...(d.followUpOf ? { followUpOf: d.followUpOf } : {}) });
  save(slug, touch(p, now));
  return p;
}

/** Add the business's email footer to every unsent email draft that lacks it (an approved one goes back to draft,
 *  since its words changed). Returns the drafts it changed. */
export function addFooters(slug: string, opts: { id?: string } = {}, now = new Date()): { partner: string; n: number; reopened: boolean }[] {
  const cfg = readOutreachConfig(slug);
  if (!cfg) throw Error("no sender set up (partners/outreach.json): the footer names the sender and the company line");
  const biz = business(slug), out: { partner: string; n: number; reopened: boolean }[] = [];
  for (const p of opts.id ? [getPartner(slug, opts.id)] : listPartners(slug)) {
    let changed = false;
    for (const d of p.drafts) {
      if (d.channel !== "email" || isSent(d) || d.attempts?.length || !footerProblem(d.body, cfg, biz)) continue;
      d.body = withFooter(d.body, cfg, biz);
      const reopened = d.status === "approved";
      if (reopened) { d.status = "draft"; delete d.approvedAt; delete d.checkAckAt; }
      out.push({ partner: p.id, n: d.n, reopened });
      changed = true;
    }
    if (changed) save(slug, touch(p, now));
  }
  return out;
}

/** The owner approved a draft's wording. For a partner whose compliance is "check", an email draft (which HQ then
 *  sends) is approved only with ackCheck: the owner read the check note. Approving an email draft is what lets HQ
 *  send it, on a weekday between 9am and 5pm. */
export function approveDraft(slug: string, id: string, n: number, now = new Date(), opts: { ackCheck?: boolean } = {}): Partner {
  const p = getPartner(slug, id);
  const d = findDraft(p, n);
  if (d.status === "sent-by-owner") throw Error(`draft ${n} was already sent by the owner`);
  if (d.status === "sent-by-hq") throw Error(`draft ${n} was already sent by HQ`);
  if (d.attempts?.length) throw Error(`draft ${n} was already tried (${d.status}): retry it with npm run hq -- partner retry`);
  if (p.doNotContact) throw Error(`${p.name} asked not to be contacted`);
  if (p.compliance.status === "avoid") throw Error(`${p.name}'s compliance is avoid: nothing is approved for an avoid partner`);
  if (p.compliance.status === "check" && d.channel === "email" && !opts.ackCheck) throw Error(`${p.name}'s compliance needs a check: ${p.compliance.notes} Approve it only once you've read that (--ack-check, or tick the box beside Approve)`);
  d.status = "approved"; d.approvedAt = now.toISOString();
  if (p.compliance.status === "check" && opts.ackCheck) d.checkAckAt = now.toISOString(); else delete d.checkAckAt;
  save(slug, touch(p, now));
  return p;
}

/** Back to draft (the owner changed their mind), while HQ hasn't tried to send it. */
export function unapproveDraft(slug: string, id: string, n: number, now = new Date()): Partner {
  const p = getPartner(slug, id);
  const d = findDraft(p, n);
  if (d.status !== "approved" || d.attempts?.length) throw Error(`draft ${n} is ${d.status}${d.attempts?.length ? " and was already tried" : ""}: only an approved draft HQ hasn't tried can go back to draft`);
  d.status = "draft"; delete d.approvedAt; delete d.checkAckAt;
  save(slug, touch(p, now));
  return p;
}

export type BulkApproval = { approved: { partner: string; n: number }[]; skipped: { partner: string; n: number; why: string }[] };

/** "Approve all email drafts" for a campaign: every unsent, untried email draft to its partners. A partner whose
 *  compliance is "check" is skipped (its note must be read per draft), as are avoid, opted-out, closed partners and
 *  drafts without the footer. */
export function approveEmailDrafts(slug: string, campaignId: string, now = new Date()): BulkApproval {
  const c = getCampaign(slug, campaignId);
  const cfg = outreachConfigOrNull(slug).config, biz = business(slug);
  const out: BulkApproval = { approved: [], skipped: [] };
  for (const p of listPartners(slug).filter((x) => x.campaigns.includes(c.id))) {
    let changed = false;
    for (const d of p.drafts.filter((x) => x.channel === "email" && x.status === "draft" && !x.attempts?.length)) {
      const why = p.doNotContact ? "asked not to be contacted" : p.compliance.status === "avoid" ? "compliance is avoid"
        : p.compliance.status === "check" ? "compliance needs a check: approve it on its own page after reading the note"
        : p.status === "declined" || p.status === "ended" ? `partner is ${p.status}`
        : !cfg ? "no sender set up yet" : footerProblem(d.body, cfg, biz) || (!d.subject?.trim() ? "no subject" : "");
      if (why) { out.skipped.push({ partner: p.id, n: d.n, why }); continue; }
      d.status = "approved"; d.approvedAt = now.toISOString();
      out.approved.push({ partner: p.id, n: d.n });
      changed = true;
    }
    if (changed) save(slug, touch(p, now));
  }
  return out;
}

/** HQ is about to send: the attempt is written first, so a crash in the middle never leads to a second send. */
export function startAttempt(slug: string, id: string, n: number, run: string, now = new Date()): Partner {
  const p = getPartner(slug, id);
  const d = findDraft(p, n);
  d.attempts = [...(d.attempts ?? []), { at: now.toISOString(), run }];
  save(slug, touch(p, now));
  return p;
}

/** What the provider said. Sent (or found already sent): the provider's id, sentAt, and the partner moves to
 *  contacted. Anything else: failed with the error, never retried without the owner. */
export function finishAttempt(slug: string, id: string, n: number, run: string, r: { result: "sent" | "found" | "error"; messageId?: string; error?: string }, now = new Date()): Partner {
  const p = getPartner(slug, id);
  const d = findDraft(p, n);
  const a = d.attempts?.find((x) => x.run === run);
  if (!a) throw Error(`draft ${n} has no attempt ${run}`);
  a.result = r.result;
  if (r.result !== "error" && r.messageId) {
    a.error = undefined;
    d.status = "sent-by-hq"; d.sentAt = now.toISOString(); d.messageId = r.messageId; delete d.error; delete d.retryAt;
    if (p.status === "prospect" || p.status === "shortlisted") {
      p.status = "contacted";
      p.history.push({ at: now.toISOString(), status: "contacted", note: `HQ emailed outreach draft ${n}${d.followUpOf ? ` (follow-up to draft ${d.followUpOf})` : ""}` });
    }
  } else {
    const msg = (r.error ?? "no message id came back").replace(/[\u2013\u2014]/g, "-").slice(0, 500);
    a.error = msg;
    d.status = "failed"; d.error = msg;
  }
  save(slug, touch(p, now));
  return p;
}

/** The owner asks HQ to try a failed draft again. HQ looks for the first one in the sender's sent mail before it
 *  sends, and records that one instead if it went after all. */
export function retryDraft(slug: string, id: string, n: number, now = new Date()): Partner {
  const p = getPartner(slug, id);
  const d = findDraft(p, n);
  if (d.status !== "failed") throw Error(`draft ${n} is ${d.status}: only a failed draft is retried`);
  if (p.doNotContact) throw Error(`${p.name} asked not to be contacted`);
  d.status = "approved"; d.retryAt = now.toISOString();
  save(slug, touch(p, now));
  return p;
}

/** The partner said "no thanks" (or anything like it): never contacted again. Declined, flagged, and every unsent
 *  draft stays unsent for good. */
export function optOut(slug: string, id: string, note?: string, now = new Date()): Partner {
  const p = getPartner(slug, id);
  if (p.doNotContact) return p;
  p.doNotContact = { at: now.toISOString(), ...(note?.trim() ? { note: note.trim() } : {}) };
  if (p.status !== "declined" && p.status !== "ended") {
    p.status = "declined";
    p.history.push({ at: now.toISOString(), status: "declined", note: `Opted out: never contact again${note?.trim() ? ` (${note.trim()})` : ""}` });
  }
  for (const d of p.drafts) if (d.status === "approved") { d.status = "draft"; delete d.approvedAt; delete d.checkAckAt; }
  save(slug, touch(p, now));
  outreachLog(slug, { event: "opt-out", partner: p.id }, now);
  return p;
}

/** The owner says they sent a draft themselves. A prospect or shortlisted partner moves to contacted. */
export function markSentByOwner(slug: string, id: string, n: number, now = new Date()): Partner {
  const p = getPartner(slug, id);
  const d = findDraft(p, n);
  if (d.status === "sent-by-owner") return p;
  if (d.status === "sent-by-hq") throw Error(`draft ${n} was already sent by HQ`);
  if (p.doNotContact) throw Error(`${p.name} asked not to be contacted`);
  if (p.compliance.status === "avoid") throw Error(`${p.name}'s compliance is avoid: it can't be contacted`);
  d.status = "sent-by-owner"; d.sentAt = now.toISOString();
  if (p.status === "prospect" || p.status === "shortlisted") {
    p.status = "contacted";
    p.history.push({ at: now.toISOString(), status: "contacted", note: `Owner sent outreach draft ${n} by ${d.channel}` });
  }
  save(slug, touch(p, now));
  return p;
}

/** Record CRM ids after a sync, without touching anything else. */
export function setCrmIds(slug: string, id: string, twenty: NonNullable<Partner["crm"]>["twenty"]): Partner {
  const p = getPartner(slug, id);
  p.crm = { ...(p.crm ?? {}), twenty };
  write(slug, p);
  return p;
}

// ---------------------------------------------------------------- the vault mirror

const pipe = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");

export function partnersMarkdown(xs: Partner[]): string {
  const counts = Object.entries(STATUS_LABEL).map(([s, l]) => [l, xs.filter((p) => p.status === s).length] as const).filter(([, n]) => n);
  const row = (p: Partner) => `| ${pipe(p.name)} | ${PLATFORM_LABEL[p.platform]} ${pipe(p.handle)} | ${TYPE_LABEL[p.type]} | ${followersLabel(p.audience.followers)} | ${STATUS_LABEL[p.status]} | ${p.fit.level} | ${p.compliance.status} | ${p.campaigns.join(", ") || "none"} | ${p.tracking.tag ? `\`${p.tracking.tag}\`` : "none"} |`;
  return [
    "# Partners", "", "Every partner in the pipeline: who they are, where they stand, the campaign they serve and the tag on their links. Written by `npm run hq -- partner`; results are on HQ's Partnerships page (Sales & Partnerships). The owner sends every DM and form; HQ emails only drafts the owner approved, and never anyone who opted out.", "",
    counts.length ? counts.map(([l, n]) => `${l} ${n}`).join(" · ") : "No partners yet.", "",
    "| Partner | Where | Type | Followers | Status | Fit | Compliance | Campaigns | Tag |", "|---|---|---|---|---|---|---|---|---|",
    ...xs.map(row), "",
  ].join("\n");
}

function mirrorToVault(slug: string) {
  const p = getProfile(slug);
  if (!p) return;
  try {
    const label = DEPARTMENTS.find((d) => d.slug === "sales")?.label ?? "Sales & Partnerships";
    const dir = path.join(vaultRoot(p), "Departments", label);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "Partners.md"), partnersMarkdown(listPartners(slug)));
  } catch { /* the vault is a mirror; the partner file is the record */ }
}
