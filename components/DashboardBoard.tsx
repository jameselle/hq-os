"use client";

// The Dashboard board: members by plan, sign-ups and upgrades (tiles and charts by day, week or month), recent
// upgrades, cancelled customers to win back, pending cancellations, account security and billing customers with
// no account. Customer rows carry the contact status, a ready email (copy or open in Mail) and notes, all saved to
// the business's own records through HQ. The snapshot lives in the server's memory and in this page; nothing about
// a customer is stored by HQ.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CountChart, shortDay } from "@/components/charts";
import { Tile } from "@/components/Tile";
import { PILL } from "@/lib/tone";
import {
  CONTACT_LABEL, CONTACT_STATUSES, FEEDBACK_LABEL, countBy, fillDays, personalise, planOf, rollUp, sumSince,
  tileText,
  type ChurnedCustomer, type ContactStatus, type DashboardChart, type DashboardList, type DashboardNote, type DashboardPlan, type DashboardSnapshot,
  type DashboardTemplate, type Granularity, type PendingCancellation, type RecentUpgrade, type Source,
} from "@/lib/dashboard";

/** The snapshot with its lists present (empty when the business doesn't report them), for the parts that list rows. */
type Full = DashboardSnapshot & { plans: DashboardPlan[]; churned: ChurnedCustomer[]; pending: PendingCancellation[]; recentUpgrades: RecentUpgrade[]; templates: Record<string, DashboardTemplate> };
const full = (s: DashboardSnapshot): Full => ({ ...s, plans: s.plans ?? [], churned: s.churned ?? [], pending: s.pending ?? [], recentUpgrades: s.recentUpgrades ?? [], templates: s.templates ?? {} });

type Loaded = { business: string | null; connected: boolean; snapshot: DashboardSnapshot | null; heldFor?: number; error?: string };

const REFRESH_MS = 60_000;
const n = (v: number) => v.toLocaleString("en-AU");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const date = (s: string) => { const d = new Date(s); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const dateTime = (s: string) => new Date(s).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** "3 days", "5 hours", "a minute": the gap between two times, in words. */
function span(ms: number): string {
  const m = Math.round(Math.abs(ms) / 60_000);
  if (m < 2) return "a minute";
  if (m < 60) return `${m} minutes`;
  const h = Math.round(m / 60);
  if (h < 2) return "an hour";
  if (h < 36) return `${h} hours`;
  const d = Math.round(h / 24);
  if (d < 45) return `${d} days`;
  const mo = Math.round(d / 30);
  return mo < 18 ? `${mo} months` : `${Math.round(d / 365)} years`;
}
const ago = (s: string) => `${span(Date.now() - Date.parse(s))} ago`;

const TONE = {
  danger: "border-bb-danger/40 bg-bb-danger/10 text-bb-danger",
  warn: "border-bb-warn/40 bg-bb-warn/10 text-bb-warn",
  blue: "border-bb-blue/40 bg-bb-blue/10 text-bb-blue",
  green: "border-bb-accent/40 bg-bb-accent/10 text-bb-accent",
  violet: "border-bb-violet/40 bg-bb-violet/10 text-bb-violet",
  teal: "border-bb-teal/40 bg-bb-teal/10 text-bb-teal",
  slate: "border-bb-border bg-bb-surface text-bb-muted",
};
const SOURCE: Record<Source, { label: string; tone: string }> = {
  card: { label: "Card", tone: TONE.violet },
  apple: { label: "App Store", tone: TONE.blue },
  google: { label: "Google Play", tone: TONE.green },
};
const CONTACT_TONE: Record<ContactStatus, string> = { not_contacted: TONE.slate, contacted: TONE.green, follow_up: TONE.blue };
const PLAN_TONE = (id: string) => (/gold/i.test(id) ? TONE.warn : /silver/i.test(id) ? TONE.slate : TONE.teal);

function Pill({ tone, children, title }: { tone: string; children: ReactNode; title?: string }) {
  return <span title={title} className={`${PILL} normal-case tracking-normal ${tone}`}>{children}</span>;
}

async function post(body: object) {
  const r = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(data.error || "That did not work");
  return data;
}

/** A row of filter tabs with counts. */
function Tabs({ value, options, counts, onChange, label }: {
  value: string; options: { value: string; label: string }[]; counts: Record<string, number>; onChange: (v: string) => void; label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg border px-2.5 py-1 text-[12px] transition-colors ${
            value === o.value ? "border-bb-blue/30 bg-bb-blue/10 text-bb-fg" : "border-bb-border text-bb-muted hover:text-bb-fg"
          }`}
        >
          {o.label}
          {(counts[o.value] ?? 0) > 0 && <span className="ml-1.5 font-mono text-[10.5px] text-bb-dim">{n(counts[o.value])}</span>}
        </button>
      ))}
    </div>
  );
}

function Section({ title, count, tone, action, children, id }: { title: string; count?: number; tone?: string; action?: ReactNode; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
          {title}
          {count !== undefined && count > 0 && <Pill tone={tone ?? TONE.slate}>{n(count)}</Pill>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Scroll({ children }: { children: ReactNode }) {
  return <div className="max-h-[440px] space-y-2 overflow-y-auto pr-1">{children}</div>;
}

const Empty = ({ children }: { children: ReactNode }) => <p className="py-3 text-center text-[12.5px] text-bb-muted">{children}</p>;

/** The email a row recommends: subject and body with the person's name, Copy, and Open in Mail. */
function EmailPanel({ to, name, template }: { to: string | null; name: string | null; template: { subject: string; body: string } & { label: string } }) {
  const { subject, body } = personalise(template, name);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  const mailto = to ? `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null;
  return (
    <div className="space-y-2 border-t border-bb-border px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px]"><span className="text-bb-muted">Subject: </span><span className="font-medium">{subject}</span></p>
        <div className="flex gap-1.5">
          <button onClick={copy} className="rounded-md border border-bb-border px-2 py-0.5 text-[11.5px] text-bb-muted hover:text-bb-fg">{copied ? "Copied" : "Copy"}</button>
          {mailto && <a href={mailto} className="rounded-md border border-bb-blue/40 bg-bb-blue/15 px-2 py-0.5 text-[11.5px] text-bb-fg hover:bg-bb-blue/25">Open in Mail</a>}
        </div>
      </div>
      <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-bb-surface2 p-3 font-sans text-[12px] leading-relaxed">{body}</pre>
    </div>
  );
}

/** A customer's notes, saved with the business's own records. */
function NotesPanel({ rowKey, canWrite, onCount }: { rowKey: string; canWrite: boolean; onCount: (c: number) => void }) {
  const [notes, setNotes] = useState<DashboardNote[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    post({ action: "notes", key: rowKey })
      .then((d) => { if (live) { setNotes(d.notes); onCount(d.notes.length); } })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [rowKey, onCount]);
  const add = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError("");
    try { const d = await post({ action: "add-note", key: rowKey, note: text.trim() }); setNotes(d.notes); onCount(d.notes.length); setText(""); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 border-t border-bb-border px-3 py-2">
      {notes === null && !error ? <p className="text-[12px] text-bb-muted">Loading notes…</p>
        : notes?.length ? (
          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
            {notes.map((x) => (
              <li key={x.id} className="rounded bg-bb-surface2 p-2 text-[12px]">
                <p className="whitespace-pre-wrap">{x.note}</p>
                <p className="mt-0.5 text-[11px] text-bb-dim">{dateTime(x.createdAt)}</p>
              </li>
            ))}
          </ul>
        ) : !error && <p className="text-[12px] text-bb-muted">No notes yet</p>}
      {error && <p role="alert" className="text-[12px] text-bb-danger">{error}</p>}
      {canWrite && (
        <div className="flex gap-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Add a note…"
            aria-label="Add a note"
            maxLength={2000}
            className="h-8 min-w-0 flex-1 rounded-md border border-bb-border bg-bb-surface2 px-2 text-[12px] outline-none focus:border-bb-blue/50"
          />
          <button onClick={add} disabled={!text.trim() || busy} className="rounded-md border border-bb-border px-3 text-[12px] text-bb-muted hover:text-bb-fg disabled:opacity-40">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

function ContactPicker({ value, rowKey, enabled, onChange }: { value: ContactStatus; rowKey: string; enabled: boolean; onChange: (s: ContactStatus) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = async (s: ContactStatus) => {
    setBusy(true); setError("");
    try { await post({ action: "set-contact", key: rowKey, status: s }); onChange(s); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col items-end gap-0.5">
      <select
        aria-label="Contact status"
        value={value}
        disabled={!enabled || busy}
        onChange={(e) => set(e.target.value as ContactStatus)}
        title={enabled ? "Contact status" : "Read-only connection"}
        className={`rounded-md border bg-bb-surface px-1.5 py-0.5 text-[11.5px] outline-none disabled:opacity-60 ${CONTACT_TONE[value]}`}
      >
        {CONTACT_STATUSES.map((s) => <option key={s} value={s}>{CONTACT_LABEL[s]}</option>)}
      </select>
      {error && <span role="alert" className="text-[11px] text-bb-danger">{error}</span>}
    </div>
  );
}

/** The bar under a customer row: the email toggle and the notes toggle, with their panels. */
function RowActions({ rowKey, email, name, template, emailLabel, canNotes, canWrite }: {
  rowKey: string; email: string | null; name: string | null; template: ({ label: string; subject: string; body: string }) | null; emailLabel: string; canNotes: boolean; canWrite: boolean;
}) {
  const [open, setOpen] = useState<"email" | "notes" | null>(null);
  const [noteCount, setNoteCount] = useState<number | null>(null);
  const onCount = useCallback((c: number) => setNoteCount(c), []);
  const toggle = (k: "email" | "notes") => setOpen((o) => (o === k ? null : k));
  if (!template && !canNotes) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-4 border-t border-bb-border px-3 py-1.5 text-[12px] text-bb-muted">
        {template && (
          <button onClick={() => toggle("email")} aria-expanded={open === "email"} className="flex items-center gap-1.5 hover:text-bb-fg">
            <span aria-hidden>{open === "email" ? "▾" : "▸"}</span>{emailLabel}
            <Pill tone={TONE.blue}>{template.label}</Pill>
          </button>
        )}
        {canNotes && (
          <button onClick={() => toggle("notes")} aria-expanded={open === "notes"} className="flex items-center gap-1.5 hover:text-bb-fg">
            <span aria-hidden>{open === "notes" ? "▾" : "▸"}</span>Notes
            {noteCount ? <span className="font-mono text-[10.5px] text-bb-dim">{noteCount}</span> : null}
          </button>
        )}
      </div>
      {open === "email" && template && <EmailPanel to={email} name={name} template={template} />}
      {open === "notes" && <NotesPanel rowKey={rowKey} canWrite={canWrite} onCount={onCount} />}
    </>
  );
}

const Mail = ({ email }: { email: string | null }) =>
  email ? <a href={`mailto:${email}`} className="block truncate text-[12px] text-bb-muted hover:text-bb-blue">✉ {email}</a> : <span className="text-[12px] text-bb-dim">No email on file</span>;

function ChurnedRow({ c, s, onContact }: { c: ChurnedCustomer; s: Full; onContact: (key: string, v: ContactStatus) => void }) {
  const t = c.template ? s.templates[c.template] ?? null : null;
  const feedback = c.cancelFeedback ? FEEDBACK_LABEL[c.cancelFeedback] ?? c.cancelFeedback.replaceAll("_", " ") : null;
  return (
    <div className="rounded-lg border border-bb-border bg-bb-surface transition-colors hover:bg-bb-surface-hi">
      <div className="flex items-start justify-between gap-3 p-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13.5px] font-medium">{c.name || "No name"}</span>
            <Pill tone={TONE.danger}>Churned</Pill>
            <Pill tone={SOURCE[c.source].tone}>{SOURCE[c.source].label}</Pill>
          </div>
          <Mail email={c.email} />
          <p className="text-[12px] text-bb-muted">Churned {ago(c.churnedAt)}</p>
          {c.previousProduct && <p className="text-[12px] text-bb-muted">Was on <span className="font-medium text-bb-fg">{c.previousProduct}</span></p>}
          {(feedback || c.cancelReason) && (
            <p className="text-[12px] text-bb-muted">
              {feedback && <Pill tone={TONE.warn}>{feedback}</Pill>} {c.cancelReason && <span className="italic">“{c.cancelReason}”</span>}
            </p>
          )}
        </div>
        <ContactPicker value={c.contact} rowKey={c.key} enabled={s.can.contact} onChange={(v) => onContact(c.key, v)} />
      </div>
      <RowActions rowKey={c.key} email={c.email} name={c.name} template={t} emailLabel="Win-back email" canNotes={s.can.notes} canWrite={s.can.notes} />
    </div>
  );
}

function PendingRow({ c, s, onContact }: { c: PendingCancellation; s: Full; onContact: (key: string, v: ContactStatus) => void }) {
  const t = c.template ? s.templates[c.template] ?? null : null;
  const left = Date.parse(c.expiresAt) - Date.now();
  const overdue = left <= 0;
  const feedback = c.cancelFeedback ? FEEDBACK_LABEL[c.cancelFeedback] ?? c.cancelFeedback.replaceAll("_", " ") : null;
  const per = c.billingPeriod === "weekly" ? "wk" : c.billingPeriod === "monthly" ? "mo" : c.billingPeriod === "yearly" ? "yr" : c.billingPeriod;
  return (
    <div className="rounded-lg border border-bb-border bg-bb-surface transition-colors hover:bg-bb-surface-hi">
      <div className="flex items-start justify-between gap-3 p-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13.5px] font-medium">{c.name || "No name"}</span>
            <Pill tone={PLAN_TONE(c.plan)}>{c.plan}</Pill>
            <Pill tone={TONE.slate}>{c.billingPeriod}</Pill>
            {c.source !== "card" && <Pill tone={SOURCE[c.source].tone}>{SOURCE[c.source].label}</Pill>}
            {c.status === "past_due" && <Pill tone={TONE.danger}>Renewal overdue</Pill>}
            {c.status === "trialing" && <Pill tone={TONE.blue}>Trial</Pill>}
            {c.affiliateCode && <Pill tone={TONE.green} title="Affiliate code">⛓ {c.affiliateCode}</Pill>}
          </div>
          <Mail email={c.email} />
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-bb-muted">
            {c.phone && <span>☎ {c.phone}</span>}
            {c.memberSince && <span>Member since {date(c.memberSince)}</span>}
            {c.amount > 0 && <span>{c.currency.toUpperCase()} ${c.amount}/{per}</span>}
          </p>
          {(feedback || c.cancelReason) && (
            <p className="text-[12px] text-bb-muted">
              {feedback && <Pill tone={TONE.warn}>{feedback}</Pill>} {c.cancelReason && <span className="italic">“{c.cancelReason}”</span>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="text-right">
            <p className={`text-[12px] font-medium ${overdue ? "text-bb-danger" : ""}`}>{overdue ? `${span(left)} overdue` : `${span(left)} left`}</p>
            <p className="text-[11.5px] text-bb-muted">{overdue ? "Ended" : "Expires"} {date(c.expiresAt)}</p>
          </div>
          <ContactPicker value={c.contact} rowKey={c.key} enabled={s.can.contact} onChange={(v) => onContact(c.key, v)} />
        </div>
      </div>
      <RowActions rowKey={c.key} email={c.email} name={c.name} template={t} emailLabel="Recommended email" canNotes={s.can.notes} canWrite={s.can.notes} />
    </div>
  );
}

const CONTACT_TABS = [
  { value: "all", label: "All" },
  { value: "not_contacted", label: "Have not contacted" },
  { value: "contacted", label: "Contacted" },
  { value: "follow_up", label: "Follow up" },
];
const SOURCE_TABS = [
  { value: "all", label: "All sources" },
  { value: "card", label: "Card" },
  { value: "apple", label: "App Store" },
  { value: "google", label: "Google Play" },
];

function useFilters<T extends { contact: ContactStatus }>(rows: T[], plan: (r: T) => string, source?: (r: T) => string) {
  const [p, setP] = useState("all");
  const [src, setSrc] = useState("all");
  const [c, setC] = useState("all");
  const byPlan = useMemo(() => (p === "all" ? rows : rows.filter((r) => plan(r) === p)), [rows, p, plan]);
  const bySource = useMemo(() => (!source || src === "all" ? byPlan : byPlan.filter((r) => source(r) === src)), [byPlan, src, source]);
  const shown = useMemo(() => (c === "all" ? bySource : bySource.filter((r) => r.contact === c)), [bySource, c]);
  return {
    plan: { value: p, set: setP, counts: countBy(rows, plan) },
    source: { value: src, set: setSrc, counts: source ? countBy(byPlan, source) : {} },
    contact: { value: c, set: setC, counts: countBy(bySource, (r) => r.contact) },
    shown,
  };
}

function Churned({ s, onContact }: { s: Full; onContact: (key: string, v: ContactStatus) => void }) {
  const paid = s.plans.filter((p) => p.paid);
  const plan = useCallback((r: ChurnedCustomer) => planOf(r.previousProduct ?? r.plan, s.plans), [s.plans]);
  const source = useCallback((r: ChurnedCustomer) => r.source, []);
  const f = useFilters(s.churned, plan, source);
  return (
    <div className="card space-y-3 p-4">
      <div>
        <h3 className="text-[15px] font-semibold">Customers to reach out to</h3>
        <p className="text-[12.5px] text-bb-muted">Used to pay, now on the free plan. Worth a note to win them back.</p>
      </div>
      {s.errors?.churned && <p role="alert" className="text-[12.5px] text-bb-warn">⚠ {s.errors.churned}</p>}
      {s.churned.length ? (
        <>
          <Tabs label="Plan" value={f.plan.value} onChange={f.plan.set} counts={f.plan.counts} options={[{ value: "all", label: "All plans" }, ...paid.map((p) => ({ value: p.id, label: p.label }))]} />
          <Tabs label="Source" value={f.source.value} onChange={f.source.set} counts={f.source.counts} options={SOURCE_TABS} />
          <Tabs label="Contact" value={f.contact.value} onChange={f.contact.set} counts={f.contact.counts} options={CONTACT_TABS} />
          <Scroll>{f.shown.length ? f.shown.map((c) => <ChurnedRow key={c.key} c={c} s={s} onContact={onContact} />) : <Empty>No customers in this group</Empty>}</Scroll>
        </>
      ) : <Empty>No churned customers 🎉</Empty>}
    </div>
  );
}

function Pending({ s, onContact }: { s: Full; onContact: (key: string, v: ContactStatus) => void }) {
  const paid = s.plans.filter((p) => p.paid);
  const plan = useCallback((r: PendingCancellation) => planOf(r.plan, s.plans), [s.plans]);
  const f = useFilters(s.pending, plan);
  return (
    <div className="card space-y-3 p-4">
      <div>
        <h3 className="text-[15px] font-semibold">Still active until the period ends</h3>
        <p className="text-[12.5px] text-bb-muted">Cancelled, but they keep their paid plan until the billing period runs out.</p>
      </div>
      {s.errors?.pending && <p role="alert" className="text-[12.5px] text-bb-warn">⚠ {s.errors.pending}</p>}
      {s.pending.length ? (
        <>
          <Tabs label="Plan" value={f.plan.value} onChange={f.plan.set} counts={f.plan.counts} options={[{ value: "all", label: "All" }, ...paid.map((p) => ({ value: p.id, label: p.label }))]} />
          <Tabs label="Contact" value={f.contact.value} onChange={f.contact.set} counts={f.contact.counts} options={CONTACT_TABS} />
          <Scroll>{f.shown.length ? f.shown.map((c) => <PendingRow key={c.key} c={c} s={s} onContact={onContact} />) : <Empty>No customers in this group</Empty>}</Scroll>
        </>
      ) : !s.errors?.pending && <Empty>No pending cancellations 🎉</Empty>}
    </div>
  );
}

function Upgrades({ s }: { s: Full }) {
  const paid = s.plans.filter((p) => p.paid);
  const [p, setP] = useState("all");
  const counts = countBy(s.recentUpgrades, (u) => planOf(u.plan, s.plans));
  const shown = p === "all" ? s.recentUpgrades : s.recentUpgrades.filter((u) => planOf(u.plan, s.plans) === p);
  return (
    <div className="card space-y-3 p-4">
      <div>
        <h3 className="text-[15px] font-semibold">Moved to a paid plan</h3>
        <p className="text-[12.5px] text-bb-muted">Last 30 days, newest first.</p>
      </div>
      {s.errors?.upgrades && <p role="alert" className="text-[12.5px] text-bb-warn">⚠ {s.errors.upgrades}</p>}
      <Tabs label="Plan" value={p} onChange={setP} counts={counts} options={[{ value: "all", label: "All" }, ...paid.map((x) => ({ value: x.id, label: x.label }))]} />
      <Scroll>
        {shown.length ? shown.map((u) => (
          <div key={u.key} className="flex items-center justify-between rounded-lg border border-bb-border bg-bb-surface p-3">
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-[13.5px] font-medium">{u.email ?? "No email"}</span>
                {u.name && <span className="text-[12px] text-bb-muted">({u.name})</span>}
                <Pill tone={PLAN_TONE(u.plan)}>{u.plan}</Pill>
                {u.billingPeriod && <Pill tone={TONE.slate}>{u.billingPeriod}</Pill>}
              </div>
              <p className="text-[12px] text-bb-muted">{dateTime(u.startedAt)} · {ago(u.startedAt)}</p>
            </div>
          </div>
        )) : <Empty>No upgrades in this range.</Empty>}
      </Scroll>
    </div>
  );
}

function Orphaned({ s, refresh, busy }: { s: Full; refresh: () => void; busy: boolean }) {
  const rows = s.orphaned ?? [];
  return (
    <Section id="dash-orphaned" title="Billing customers with no account" count={rows.length} tone={TONE.danger}
      action={<button onClick={refresh} disabled={busy} className="rounded-lg border border-bb-border px-3 py-1 text-[12px] text-bb-muted hover:text-bb-fg disabled:opacity-50">{busy ? "Refreshing…" : "↻ Refresh"}</button>}>
      <div className="card space-y-3 p-4">
        <p className="text-[12.5px] text-bb-muted">Customers with a subscription whose account no longer exists here.</p>
        {s.errors?.orphaned ? <p role="alert" className="text-[12.5px] text-bb-warn">⚠ {s.errors.orphaned}</p>
          : s.orphaned === null ? <Empty>This business doesn't report billing customers.</Empty>
          : rows.length ? (
            <Scroll>
              {rows.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3 rounded-lg border border-bb-border bg-bb-surface p-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[13.5px] font-medium">{c.email ?? "No email"}</span>
                      {c.name && <span className="text-[12px] text-bb-muted">({c.name})</span>}
                      <Pill tone={c.status === "active" ? TONE.green : TONE.slate}>{c.status}</Pill>
                      <Pill tone={TONE.slate}>{c.plan}</Pill>
                    </div>
                    <p className="text-[12px] text-bb-muted">${c.amount.toFixed(2)}/{c.interval}{c.created && ` · Created ${date(c.created)}`}</p>
                  </div>
                  {c.link && <a href={c.link} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-md border border-bb-border px-2 py-0.5 text-[11.5px] text-bb-muted hover:text-bb-fg">Open ↗</a>}
                </div>
              ))}
            </Scroll>
          ) : <Empty>No orphaned customers 🎉</Empty>}
      </div>
    </Section>
  );
}

/** Every chart the business reports, with one Daily / Weekly / Monthly switch. */
function Charts({ charts }: { charts: DashboardChart[] }) {
  const [g, setG] = useState<Granularity>("daily");
  const today = new Date().toISOString().slice(0, 10);
  const drawn = useMemo(() => charts.map((c) => ({ ...c, points: rollUp(fillDays(c.points, c.since, today), g) })), [charts, g, today]);
  if (!charts.length) return null;
  const label = (d: string) => (g === "monthly" ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}` : shortDay(d));
  const suffix = (c: DashboardChart) => (g === "daily" ? `since ${shortDay(c.since)} ${c.since.slice(0, 4)}` : g === "weekly" ? "by week" : "by month");
  const COLORS = ["#5AB0F0", "#2DD4BF", "#A78BFA", "#F59E0B", "#F472B6", "#22C55E"];
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Tabs label="Chart period" value={g} onChange={(v) => setG(v as Granularity)} counts={{}} options={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {drawn.map((c, i) => (
          <div key={c.id} className="card space-y-2 p-4">
            <div><h3 className="text-[15px] font-semibold">{c.title} <span className="font-normal text-bb-muted">({suffix(c)})</span></h3>{c.subtitle && <p className="text-[12px] text-bb-muted">{c.subtitle}</p>}</div>
            <CountChart points={c.points} title={`${c.title} ${suffix(c)}`} kind={c.kind} color={COLORS[i % COLORS.length]} label={label} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A generic list (people, posts, leads), with tabs from each row's first tag. */
function ListBlock({ list }: { list: DashboardList }) {
  const [tab, setTab] = useState("all");
  const counts = countBy(list.rows, (r) => r.tags?.[0] ?? "other");
  const tabs = Object.keys(counts).filter((k) => k !== "all");
  const shown = tab === "all" ? list.rows : list.rows.filter((r) => (r.tags?.[0] ?? "other") === tab);
  return (
    <Section id={`dash-list-${list.id}`} title={list.title} count={list.rows.length} tone={TONE.blue}>
      <div className="card space-y-3 p-4">
        {list.subtitle && <p className="text-[12.5px] text-bb-muted">{list.subtitle}</p>}
        {tabs.length > 1 && <Tabs label={`${list.title} filter`} value={tab} onChange={setTab} counts={counts} options={[{ value: "all", label: "All" }, ...tabs.map((t) => ({ value: t, label: t }))]} />}
        <Scroll>
          {shown.length ? shown.map((r) => (
            <div key={r.key} className="flex items-start justify-between gap-3 rounded-lg border border-bb-border bg-bb-surface p-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-medium">{r.title}</span>
                  {(r.tags ?? []).map((t) => <Pill key={t} tone={TONE.slate}>{t}</Pill>)}
                </div>
                {r.subtitle && <p className="line-clamp-2 text-[12px] text-bb-muted">{r.subtitle}</p>}
                {r.email && <Mail email={r.email} />}
                {r.at && <p className="text-[12px] text-bb-dim">{dateTime(r.at)} · {ago(r.at)}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {r.value && <span className="font-mono text-[12.5px] tabular-nums">{r.value}</span>}
                {r.link && <a href={r.link} target="_blank" rel="noopener noreferrer" className="rounded-md border border-bb-border px-2 py-0.5 text-[11.5px] text-bb-muted hover:text-bb-fg">Open ↗</a>}
              </div>
            </div>
          )) : <Empty>Nothing here yet.</Empty>}
        </Scroll>
      </div>
    </Section>
  );
}

export function DashboardBoard({ initial }: { initial: Loaded | null }) {
  const [data, setData] = useState<Loaded | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState(() => Date.now() - (initial?.heldFor ?? 0));
  const [, tick] = useState(0);

  const load = useCallback(async (force: boolean) => {
    setBusy(true); setError("");
    try {
      const r = force
        ? await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh" }) })
        : await fetch("/api/dashboard", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || !d.snapshot) { setError(d.error || "The dashboard could not load"); setData((old) => (old?.snapshot ? old : d)); return; }
      setData(d); setLoadedAt(Date.now() - (d.heldFor ?? 0));
    } catch { setError("HQ could not be reached"); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { if (!initial?.snapshot) load(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") load(false); }, REFRESH_MS);
    const clock = setInterval(() => tick((x) => x + 1), 15_000);
    return () => { clearInterval(t); clearInterval(clock); };
  }, [load]);

  const onContact = useCallback((key: string, v: ContactStatus) => {
    setData((d) => {
      if (!d?.snapshot) return d;
      const s = d.snapshot;
      return { ...d, snapshot: { ...s, churned: s.churned?.map((r) => (r.key === key ? { ...r, contact: v } : r)), pending: s.pending?.map((r) => (r.key === key ? { ...r, contact: v } : r)) } };
    });
  }, []);

  const raw = data?.snapshot;
  const charts = useMemo(() => !raw ? [] : [
    ...(raw.daily ? [
      { id: "signups", title: "Sign-ups", subtitle: "New accounts", kind: "area" as const, since: raw.daily.since, points: raw.daily.signups },
      { id: "upgrades", title: "Upgrades", subtitle: "Paid plan starts", kind: "bars" as const, since: raw.daily.since, points: raw.daily.upgrades },
    ] : []),
    ...(raw.charts ?? []),
  ], [raw]);

  if (!raw) {
    return (
      <div className="card space-y-2 p-4">
        <p className="text-[13px]">{busy ? "Loading the dashboard…" : error || "The dashboard could not load."}</p>
        {!busy && <button onClick={() => load(true)} className="rounded-lg border border-bb-border px-3 py-1 text-[12px] text-bb-muted hover:text-bb-fg">Try again</button>}
      </div>
    );
  }
  const s = full(raw);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  // Errors a drawn section shows itself stay there; the rest show at the top.
  const drawn = new Set([raw.pending && "pending", raw.churned && "churned", raw.recentUpgrades && "upgrades", (raw.orphaned !== undefined || raw.errors?.orphaned) && "orphaned", "security"].filter(Boolean));
  const other = Object.entries(raw.errors ?? {}).filter(([k]) => !drawn.has(k));
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-end gap-3 text-[11.5px] text-bb-dim">
        {error && <span role="alert" className="text-bb-warn">⚠ {error}. Showing what was read before.</span>}
        <span>Read {Date.now() - loadedAt < 60_000 ? "just now" : `${span(Date.now() - loadedAt)} ago`} · refreshes every minute</span>
        <button onClick={() => load(true)} disabled={busy} className="rounded-lg border border-bb-border px-3 py-1 text-[12px] text-bb-muted hover:text-bb-fg disabled:opacity-50">{busy ? "Refreshing…" : "↻ Refresh"}</button>
      </div>
      {other.length > 0 && (
        <ul role="alert" className="space-y-1 text-[12.5px] text-bb-warn">{other.map(([k, v]) => <li key={k}>⚠ {v}</li>)}</ul>
      )}

      {(raw.plans || raw.totalUsers !== undefined) && (
        <Section id="dash-plans" title="Members by plan">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {s.plans.map((p) => <Tile key={p.id} label={`${p.label} members`} value={n(p.count)} hint={p.hint ?? (p.paid ? `Active ${p.label.toLowerCase()} plan` : "Free plan")} />)}
            {raw.totalUsers !== undefined && <Tile label="Total users" value={n(raw.totalUsers)} hint="All registered accounts" />}
          </div>
        </Section>
      )}

      {(raw.groups ?? []).map((g) => (
        <Section key={g.id} id={`dash-group-${g.id}`} title={g.title}>
          {g.note && <p className="-mt-1 text-[12px] text-bb-muted">{g.note}</p>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {g.tiles.map((t) => <Tile key={t.label} label={t.label} value={tileText(t)} hint={t.hint} tone={t.tone} />)}
          </div>
        </Section>
      ))}

      {(raw.signups || charts.length > 0) && (
        <Section id="dash-signups" title={raw.signups ? "Sign-ups and upgrades" : "Over time"}>
          {raw.signups && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Sign-ups today" value={n(raw.signups.today)} hint="New accounts today" />
              <Tile label="Sign-ups this week" value={n(raw.signups.week)} hint="Last 7 days" />
              <Tile label="Sign-ups this month" value={n(raw.signups.month)} hint="Last 30 days" />
              {raw.daily && <Tile label="Upgrades this month" value={n(sumSince(raw.daily.upgrades, monthAgo))} hint="Paid plan starts, last 30 days" />}
            </div>
          )}
          <Charts charts={charts} />
        </Section>
      )}

      {raw.recentUpgrades && (
        <Section id="dash-upgrades" title="Recent upgrades" count={s.recentUpgrades.length} tone={TONE.green}>
          <Upgrades s={s} />
        </Section>
      )}

      {raw.churned && (
        <Section id="dash-churned" title="Cancelled or downgraded customers" count={s.churned.length} tone={TONE.danger}>
          <Churned s={s} onContact={onContact} />
        </Section>
      )}

      {raw.pending && (
        <Section id="dash-pending" title="Pending cancellations" count={s.pending.length} tone={TONE.warn}>
          <Pending s={s} onContact={onContact} />
        </Section>
      )}

      {(raw.lists ?? []).map((l) => <ListBlock key={l.id} list={l} />)}

      {(raw.security !== undefined || raw.errors?.security) && (
        <Section id="dash-security" title="Security">
          {raw.errors?.security && <p role="alert" className="text-[12.5px] text-bb-warn">⚠ {raw.errors.security}</p>}
          {raw.security && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Tile label="Suspended accounts" value={n(raw.security.suspended)} hint="Currently suspended" tone={raw.security.suspended > 0 ? "danger" : undefined} />
              <Tile label="Flagged accounts" value={n(raw.security.flagged)} hint="Waiting for review" tone={raw.security.flagged > 0 ? "danger" : undefined} />
              <Tile label="Rate-limit blocks" value={n(raw.security.rateLimited24h)} hint="Last 24 hours" tone={raw.security.rateLimited24h > 10 ? "danger" : undefined} />
            </div>
          )}
        </Section>
      )}

      {(raw.orphaned !== undefined || raw.errors?.orphaned) && <Orphaned s={s} refresh={() => load(true)} busy={busy} />}
    </div>
  );
}
