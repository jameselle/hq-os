// HQ's partner outreach runs: emails the drafts the owner approved (lib/partner-outreach.ts has the rules), writes the
// one follow-up when a partner hasn't answered in five days, and sends the owner a test. The provider call goes
// through SendDeps, so tests and --dry-run swap it out; the real one is a headless Claude Code run allowed only the
// Composio workbench (lib/social-publisher.ts headlessWorkbench), with the cell from lib/partner-email.ts. Server-only.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { emailCell, unsubscribeHeaders, type EmailPayload } from "./partner-email";
import {
  capOf, followUpDraft, followUpDue, hqSendable, parseAddress, partnerEmail, sendProblem, sentToday, windowProblem, withFooter, type OutreachConfig,
} from "./partner-outreach";
import { addDraft, finishAttempt, listPartners, outreachLog, partnersDir, readOutreachConfig, startAttempt } from "./partner-store";
import type { CellResult } from "./social-publish";
import { headlessWorkbench } from "./social-publisher";
import { getProfile } from "./store";

export type SendDeps = {
  /** Runs the cell in the Composio workbench and returns its HQ_RESULT lines. */
  workbench(cells: string[], run: string): Promise<{ results: CellResult[]; why?: string; costUsd?: number }>;
  now(): Date;
};

export const realSendDeps: SendDeps = {
  workbench: (cells, run) => headlessWorkbench(cells, run, 8 * 60e3, "email helper"),
  now: () => new Date(),
};
/** For --dry-run: anything that tries to call out throws. */
export const offlineSendDeps = (now = new Date()): SendDeps => ({ workbench: async () => { throw Error("dry run: no external calls"); }, now: () => now });

export type SendOutcome = { partner: string; n: number; status: "sent" | "found" | "failed" | "skipped" | "dry-run" | "held"; detail: string; messageId?: string };

const newRun = () => crypto.randomBytes(6).toString("hex");

function biz(slug: string) {
  const p = getProfile(slug);
  if (!p) throw Error(`no such business: ${slug}`);
  return p;
}

/** Why the business can't send at all right now (no sender, paused, outside the window, cap reached), or "". */
export function runProblem(slug: string, cfg: OutreachConfig | null, now: Date): string {
  const b = biz(slug);
  if (!cfg) return "no sender connected: add partners/outreach.json naming a verified sender (see the Partnerships guide)";
  if (cfg.paused) return "sending is paused in partners/outreach.json";
  const w = windowProblem(now, b.timezone);
  if (w) return w;
  const n = sentToday(listPartners(slug), now, b.timezone);
  if (n >= capOf(cfg)) return `today's cap is reached (${n} of ${capOf(cfg)})`;
  return "";
}

/** Every approved email draft HQ could send, with why each one may not go now. */
export function sendQueue(slug: string, opts: { id?: string } = {}): { partner: string; n: number; why: string }[] {
  const b = biz(slug);
  let cfg: OutreachConfig | null = null, cfgErr = "";
  try { cfg = readOutreachConfig(slug); } catch (e) { cfgErr = (e as Error).message; }
  const out: { partner: string; n: number; why: string }[] = [];
  for (const p of listPartners(slug)) {
    if (opts.id && p.id !== opts.id) continue;
    for (const d of p.drafts) {
      if (!hqSendable(p, d) || !(d.status === "approved" || d.status === "failed")) continue;
      out.push({ partner: p.id, n: d.n, why: cfgErr || sendProblem(p, d, cfg, b) });
    }
  }
  return out;
}

function payload(slug: string, cfg: OutreachConfig, o: { run: string; to: string; subject: string; text: string; since: number; retry: boolean; mode?: "send" | "check" }): EmailPayload {
  const replyTo = cfg.sender.replyTo ?? parseAddress(cfg.sender.from)!.email;
  return {
    run: o.run, via: cfg.sender.via, account: cfg.sender.account, from: cfg.sender.from, replyTo,
    to: o.to, subject: o.subject, text: o.text, headers: unsubscribeHeaders(replyTo), since: o.since, mode: o.mode ?? "send", retry: o.retry,
  };
}

/** Emails one approved draft. Every rule is checked again just before the call, the attempt is written first, and the
 *  result (the provider's message id, or the error) is recorded on the draft. */
export async function sendOne(slug: string, partnerId: string, n: number, deps: SendDeps): Promise<SendOutcome> {
  const b = biz(slug), now = deps.now();
  const cfg = readOutreachConfig(slug);
  const p = listPartners(slug).find((x) => x.id === partnerId);
  const d = p?.drafts.find((x) => x.n === n);
  if (!p || !d) return { partner: partnerId, n, status: "skipped", detail: "no such draft" };
  const why = sendProblem(p, d, cfg, b) || runProblem(slug, cfg, now);
  if (why) return { partner: p.id, n, status: "held", detail: why };
  const to = partnerEmail(p)!;
  const retry = Boolean(d.attempts?.length);
  const since = Math.floor(Date.parse(d.attempts?.[0]?.at ?? now.toISOString()) / 1000) - 120;
  const run = newRun();
  startAttempt(slug, p.id, n, run, now);
  outreachLog(slug, { event: "send-attempt", partner: p.id, n, run, retry }, now);
  let res: CellResult | undefined, err = "";
  try {
    const out = await deps.workbench([emailCell(payload(slug, cfg!, { run, to, subject: d.subject!, text: d.body, since, retry }))], run);
    res = out.results.at(-1);
    if (!res) err = out.why ?? "the email run returned nothing";
  } catch (e) { err = String((e as Error).message ?? e).slice(0, 400); }
  const at = deps.now();
  if (res && (res.status === "sent" || res.status === "found") && typeof res.id === "string" && res.id) {
    finishAttempt(slug, p.id, n, run, { result: res.status, messageId: res.id }, at);
    outreachLog(slug, { event: res.status === "sent" ? "sent" : "found-already-sent", partner: p.id, n, run, messageId: res.id }, at);
    return { partner: p.id, n, status: res.status, detail: res.status === "sent" ? `sent, message ${res.id}` : `already sent earlier (message ${res.id}); recorded, not sent again`, messageId: res.id };
  }
  const msg = res?.status === "error" ? String(res.error ?? "error")
    : res?.status === "sending" ? "the run stopped while sending: it may have gone. HQ looks in the sent mail before any retry"
    : err || `unexpected result ${res?.status}`;
  finishAttempt(slug, p.id, n, run, { result: "error", error: msg }, at);
  outreachLog(slug, { event: "send-failed", partner: p.id, n, run, error: msg.slice(0, 300) }, at);
  return { partner: p.id, n, status: "failed", detail: msg };
}

/** Sends what's approved, within the window and the daily cap. A dry run says what would go and calls nothing. */
export async function sendDue(slug: string, deps: SendDeps, opts: { dryRun?: boolean; id?: string; beforeEach?: () => void } = {}): Promise<SendOutcome[]> {
  const b = biz(slug);
  const out: SendOutcome[] = [];
  let cfg: OutreachConfig | null = null;
  try { cfg = readOutreachConfig(slug); } catch (e) { return [{ partner: "-", n: 0, status: "held", detail: (e as Error).message }]; }
  const queue = sendQueue(slug, opts);
  const now = deps.now();
  const general = runProblem(slug, cfg, now);
  let left = cfg ? capOf(cfg) - sentToday(listPartners(slug), now, b.timezone) : 0;
  for (const q of queue) {
    if (q.why) { out.push({ partner: q.partner, n: q.n, status: "held", detail: q.why }); continue; }
    if (general) { out.push({ partner: q.partner, n: q.n, status: "held", detail: general }); continue; }
    if (left <= 0) { out.push({ partner: q.partner, n: q.n, status: "held", detail: `today's cap of ${capOf(cfg!)} is reached; it goes on the next weekday run` }); continue; }
    if (opts.dryRun) {
      const p = listPartners(slug).find((x) => x.id === q.partner)!;
      const d = p.drafts.find((x) => x.n === q.n)!;
      out.push({ partner: q.partner, n: q.n, status: "dry-run", detail: `would email ${partnerEmail(p)} from ${cfg!.sender.from} via ${cfg!.sender.via}: "${d.subject}" (${d.body.length} characters, footer and opt-out present)` });
      left--;
      continue;
    }
    opts.beforeEach?.();
    const r = await sendOne(slug, q.partner, q.n, deps);
    out.push(r);
    if (r.status !== "held" && r.status !== "skipped") left--;
  }
  return out;
}

/** Writes the one follow-up for every partner who hasn't answered FOLLOW_UP_DAYS after a message went out. Idempotent:
 *  a partner who has a follow-up (of any status) never gets another. */
export function writeFollowUps(slug: string, now = new Date()): { partner: string; n: number }[] {
  const b = biz(slug);
  let cfg: OutreachConfig | null = null;
  try { cfg = readOutreachConfig(slug); } catch { cfg = null; }
  const made: { partner: string; n: number }[] = [];
  for (const p of listPartners(slug)) {
    const first = followUpDue(p, now);
    if (!first) continue;
    const f = followUpDraft(p, first, b, cfg);
    try {
      const y = addDraft(slug, p.id, f, now);
      const n = y.drafts.at(-1)!.n;
      made.push({ partner: p.id, n });
      outreachLog(slug, { event: "follow-up-written", partner: p.id, n, of: first.n }, now);
    } catch (e) { outreachLog(slug, { event: "follow-up-skipped", partner: p.id, why: (e as Error).message.slice(0, 200) }, now); }
  }
  return made;
}

/** The owner's own test: the email exactly as HQ would send it (a draft's words with --id, or a short sample), to
 *  the sender's own address only. Never touches a partner record. */
export async function sendTest(slug: string, to: string, deps: SendDeps, opts: { id?: string; n?: number; dryRun?: boolean } = {}): Promise<SendOutcome> {
  const b = biz(slug);
  const cfg = readOutreachConfig(slug);
  if (!cfg) return { partner: "test", n: 0, status: "held", detail: "no sender connected (partners/outreach.json)" };
  const own = [parseAddress(cfg.sender.from)?.email, cfg.sender.replyTo ? parseAddress(cfg.sender.replyTo)?.email : undefined].filter(Boolean).map((x) => x!.toLowerCase());
  if (!own.includes(to.trim().toLowerCase())) return { partner: "test", n: 0, status: "held", detail: `a test goes only to the business's own address (${own.join(" or ")}), never to a partner` };
  let subject = `[HQ test] Partner outreach from ${b.name}`, text = withFooter(`Hi,\n\nThis is a test of partner outreach from HQ. Partners get the approved draft's words with this footer.\n\nCheers`, cfg, b);
  if (opts.id) {
    const p = listPartners(slug).find((x) => x.id === opts.id || x.id.endsWith(`-${opts.id}`));
    const d = p?.drafts.filter((x) => x.channel === "email" && (opts.n === undefined || x.n === opts.n)).at(-1);
    if (!d) return { partner: "test", n: 0, status: "held", detail: `no email draft ${opts.n ?? ""} for ${opts.id}` };
    subject = `[HQ test] ${d.subject ?? subject}`; text = withFooter(d.body, cfg, b);
  }
  const run = newRun(), now = deps.now();
  if (opts.dryRun) return { partner: "test", n: 0, status: "dry-run", detail: `would email ${to} from ${cfg.sender.from}: "${subject}"\n\n${text}` };
  const out = await deps.workbench([emailCell(payload(slug, cfg, { run, to: to.trim(), subject, text, since: Math.floor(now.getTime() / 1000) - 120, retry: false }))], run);
  const res = out.results.at(-1);
  const ok = res && res.status === "sent" && typeof res.id === "string" && res.id;
  outreachLog(slug, { event: ok ? "test-sent" : "test-failed", run, ...(ok ? { messageId: res!.id } : { error: String(res?.error ?? out.why ?? "nothing came back").slice(0, 300) }) }, deps.now());
  return ok ? { partner: "test", n: 0, status: "sent", detail: `test sent to ${to}, message ${res!.id}`, messageId: String(res!.id) }
    : { partner: "test", n: 0, status: "failed", detail: String(res?.status === "error" ? res.error : out.why ?? `unexpected result ${res?.status}`) };
}

// ---------------------------------------------------------------- one run at a time

export const LOCK_STALE_MIN = 30;

/** One outreach run per business at a time (O_EXCL; a lock untouched for LOCK_STALE_MIN belongs to a dead run). */
export function acquireOutreachLock(slug: string): { release(): void; touch(): void } | null {
  const lock = path.join(partnersDir(slug), "send.lock");
  fs.mkdirSync(path.dirname(lock), { recursive: true, mode: 0o700 });
  const token = `${process.pid} ${crypto.randomBytes(6).toString("hex")}`;
  for (let i = 0; i < 2; i++) {
    try {
      const fd = fs.openSync(lock, "wx", 0o600);
      fs.writeSync(fd, `${token}\n`); fs.closeSync(fd);
      const mine = () => { try { return fs.readFileSync(lock, "utf8").startsWith(token); } catch { return false; } };
      return {
        release: () => { if (mine()) fs.rmSync(lock, { force: true }); },
        touch: () => { if (mine()) { const t = new Date(); try { fs.utimesSync(lock, t, t); } catch { /* gone */ } } },
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      let age: number;
      try { age = Date.now() - fs.statSync(lock).mtimeMs; } catch { continue; }
      if (age < LOCK_STALE_MIN * 60e3) return null;
      try { fs.rmSync(lock, { force: true }); } catch { /* another run cleared it */ }
    }
  }
  return null;
}

/** The hourly tick for one business: follow-ups first (they wait for the owner), then the approved emails. */
export async function partnerTick(slug: string, deps: SendDeps): Promise<string[]> {
  const lines: string[] = [];
  const lock = acquireOutreachLock(slug);
  if (!lock) return ["an outreach run is already going"];
  try {
    for (const f of writeFollowUps(slug, deps.now())) lines.push(`follow-up draft ${f.n} written for ${f.partner}; it waits for the owner's yes`);
    for (const o of await sendDue(slug, deps, { beforeEach: lock.touch })) if (o.status !== "held") lines.push(`${o.partner} draft ${o.n}: ${o.status}. ${o.detail}`);
  } finally { lock.release(); }
  return lines;
}

/** Businesses with a partners folder. */
export function outreachBusinesses(slugs: string[]): string[] {
  return slugs.filter((s) => fs.existsSync(partnersDir(s)));
}
