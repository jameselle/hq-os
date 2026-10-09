"use client";
// Buttons for partner outreach drafts on the Partnerships board and a partner's page. Every action posts to
// /api/partners. DMs and contact forms: one tap copies the words and opens the partner's profile or contact page in a
// new tab, then "Mark as sent". Email drafts to a partner's public business email: approve, and HQ emails it.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, RotateCcw, Send, Ban } from "lucide-react";

const btn = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-40";
const plain = `${btn} border-bb-border text-bb-muted hover:bg-bb-surface hover:text-bb-fg`;
const go = `${btn} border-bb-accent/50 bg-bb-accent/15 text-bb-accent hover:bg-bb-accent/25`;

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (body: Record<string, unknown>, done: string | ((j: Record<string, unknown>) => string)) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/partners", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(j.error ?? "Could not update");
      setMsg(typeof done === "string" ? done : done(j)); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not update"); } finally { setBusy(false); }
  };
  return { busy, msg, act, setMsg };
}

export type DraftActionProps = {
  partner: string;
  n: number;
  channel: string;
  status: string;
  /** The words to copy (subject and body). */
  text: string;
  /** Where the owner sends it: the profile (DM) or the contact page (form). */
  openUrl?: string | null;
  /** "Instagram", "TikTok"… for the DM button. */
  platform: string;
  /** The compliance check note, when the partner's compliance is "check". */
  checkNote?: string | null;
  /** HQ emails this draft once approved (an email to a partner with a public business email). */
  hqSends: boolean;
  /** Why HQ can't email right now (no sender connected), or "". */
  senderWhy: string;
  error?: string;
  compact?: boolean;
};

/** Approve, back to draft, retry, or the one-tap send for a DM or a contact form, then "Mark as sent". */
export function DraftActions(p: DraftActionProps) {
  const { busy, msg, act, setMsg } = useAct();
  const [ack, setAck] = useState(false);
  const [opened, setOpened] = useState(false);
  const sent = p.status === "sent-by-owner" || p.status === "sent-by-hq";
  if (sent) return null;
  const needsAck = Boolean(p.checkNote) && p.hqSends;
  const oneTap = (p.channel === "dm" || p.channel === "form") && p.status !== "failed";
  const ownerSends = !p.hqSends;
  const copy = () => { void navigator.clipboard?.writeText(p.text).catch(() => undefined); };
  const label = p.channel === "form" ? "Copy and open contact form" : `Copy and open ${p.platform}`;

  return (
    <div className="space-y-2 min-w-0">
      {needsAck && p.status === "draft" && (
        <label className="flex items-start gap-2 rounded-lg border border-bb-warn/40 bg-bb-warn/10 px-3 py-2 text-[12px] text-bb-warn">
          <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span className="break-words">Compliance check: {p.checkNote} I&apos;ve read this and this draft is fine to send.</span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {oneTap && (p.openUrl ? (
          <a href={p.openUrl} target="_blank" rel="noopener noreferrer" className={plain} onClick={() => { copy(); setOpened(true); setMsg("Copied. Paste it in the tab that opened, send it, then mark it sent."); }}>
            <ExternalLink size={14} /> {label}
          </a>
        ) : (
          <button type="button" className={plain} onClick={() => { copy(); setOpened(true); setMsg("Copied. Send it, then mark it sent."); }}><Copy size={14} /> Copy</button>
        ))}
        {p.status === "draft" && !p.compact && (
          <button type="button" disabled={busy || (needsAck && !ack)} title={needsAck && !ack ? "Read the compliance check and tick the box first" : undefined} className={go}
            onClick={() => void act({ action: "approve", id: p.partner, n: p.n, ackCheck: needsAck ? ack : undefined }, p.hqSends ? (p.senderWhy ? `Approved. HQ can't email yet: ${p.senderWhy}` : "Approved: HQ emails it on a weekday between 9am and 5pm.") : "Approved. Send it yourself, then mark it sent.")}>
            <Check size={14} /> Approve{p.hqSends ? " for HQ to email" : ""}
          </button>
        )}
        {p.status === "approved" && !p.compact && (
          <button type="button" disabled={busy} className={plain} onClick={() => void act({ action: "unapprove", id: p.partner, n: p.n }, "Back to draft.")}><RotateCcw size={14} /> Back to draft</button>
        )}
        {p.status === "failed" && (
          <button type="button" disabled={busy} className={go} onClick={() => { if (confirm("Try this email again? HQ first looks in the sender's sent mail, and records the first one instead if it went after all.")) void act({ action: "retry", id: p.partner, n: p.n }, "Set to retry: HQ tries at its next run (weekdays, 9am to 5pm)."); }}>
            <RotateCcw size={14} /> Retry
          </button>
        )}
        {(ownerSends && (opened || !oneTap)) && (
          <button type="button" disabled={busy} className={plain} onClick={() => void act({ action: "sent", id: p.partner, n: p.n }, "Marked as sent.")}><Send size={14} /> Mark as sent</button>
        )}
      </div>
      {p.status === "failed" && p.error && <p className="text-[12px] text-bb-danger break-words">Couldn&apos;t send: {p.error}</p>}
      {p.status === "draft" && p.hqSends && p.senderWhy && !p.compact && <p className="text-[11.5px] text-bb-warn break-words">HQ can&apos;t email this yet: {p.senderWhy}</p>}
      {p.status === "approved" && p.hqSends && !p.compact && <p className="text-[11.5px] text-bb-dim break-words">{p.senderWhy ? `Approved, but HQ can't email yet: ${p.senderWhy}` : "Approved: HQ emails it on a weekday between 9am and 5pm (one send, never twice)."}</p>}
      {msg && <p className="text-[12px] text-bb-muted break-words">{msg}</p>}
    </div>
  );
}

/** "They said no thanks": declined for good, never drafted or emailed again. */
export function OptOutButton({ partner, name }: { partner: string; name: string }) {
  const { busy, msg, act } = useAct();
  return (
    <div className="space-y-1">
      <button type="button" disabled={busy} className={`${btn} border-bb-danger/40 text-bb-danger hover:bg-bb-danger/10`}
        onClick={() => { if (confirm(`${name} asked not to be contacted? HQ declines them for good and never drafts or emails them again.`)) void act({ action: "optout", id: partner }, "Recorded: never contacted again."); }}>
        <Ban size={14} /> They opted out
      </button>
      {msg && <p className="text-[12px] text-bb-muted">{msg}</p>}
    </div>
  );
}

/** Approve every email draft for a campaign's partners (compliance checks are approved one by one on each page). */
export function ApproveAllEmail({ campaign, name, count }: { campaign: string; name: string; count: number }) {
  const { busy, msg, act } = useAct();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy || !count} className={go}
        onClick={() => { if (confirm(`Approve ${count} email ${count === 1 ? "draft" : "drafts"} for ${name}? HQ emails each one on a weekday between 9am and 5pm, up to the daily cap. Partners whose compliance needs a check are skipped.`)) void act({ action: "approve-all", campaign }, (j) => { const a = (j.approved as unknown[] | undefined)?.length ?? 0, s = (j.skipped as unknown[] | undefined)?.length ?? 0; return `${a} approved${s ? `, ${s} skipped (see each partner)` : ""}.`; }); }}>
        <Check size={14} /> Approve all email drafts ({count})
      </button>
      {msg && <span className="text-[12px] text-bb-muted">{msg}</span>}
    </div>
  );
}
