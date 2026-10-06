// Pieces shared by the Campaigns list and a campaign's page. Server components, no state.
import { formatAnalytics } from "@/lib/analytics-metrics";
import { CHANNEL_LABEL, STATUS_LABEL, type CampaignReport, type CampaignStatus, type Measure } from "@/lib/campaigns";
import { PILL } from "@/lib/tone";

export const STATUS_TONE: Record<CampaignStatus, string> = {
  live: "border-bb-accent/40 bg-bb-accent/10 text-bb-accent",
  planned: "border-bb-blue/40 bg-bb-blue/10 text-bb-blue",
  paused: "border-bb-warn/40 bg-bb-warn/10 text-bb-warn",
  done: "border-bb-border bg-bb-surface text-bb-muted",
};
export const LEVER_TONE: Record<string, string> = {
  get: "border-bb-teal/40 bg-bb-teal/10 text-bb-teal", keep: "border-bb-blue/40 bg-bb-blue/10 text-bb-blue",
  expand: "border-bb-violet/40 bg-bb-violet/10 text-bb-violet",
};
export const LEVER_LABEL: Record<string, string> = { get: "Get customers", keep: "Keep customers", expand: "Expand revenue" };

export const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const dates = (r: CampaignReport) => `${day(r.campaign.start)}${r.campaign.end ? ` to ${day(r.campaign.end)}` : " onwards"}`;

export function StatusPill({ status }: { status: CampaignStatus }) {
  return <span className={`${PILL} ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function Channels({ channels }: { channels: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {channels.map((c) => <span key={c} className="rounded-md border border-bb-border bg-bb-surface2/50 px-1.5 py-0.5 text-[11px] text-bb-muted">{CHANNEL_LABEL[c] ?? c}</span>)}
    </span>
  );
}

/** A number, or "not measured yet" with what it needs on hover and underneath. */
export function MeasureValue({ m, currency, small }: { m: Measure; currency: string; small?: boolean }) {
  if (m.value === null) return <span className={`${small ? "text-[12px]" : "text-[13px]"} text-bb-dim`} title={m.note}>not measured yet</span>;
  return <span className={`${small ? "text-[13px]" : "text-[20px]"} font-semibold tabular-nums`} title={m.note}>{formatAnalytics(m.unit, m.value, currency)}</span>;
}

/** The campaign's number against its target, with a bar when a share of it can be shown. */
export function PrimaryLine({ r, currency }: { r: CampaignReport; currency: string }) {
  const p = r.primary;
  const val = p.value === null ? null : formatAnalytics(p.unit, p.value, currency);
  const tgt = p.target === null ? null : formatAnalytics(p.unit, p.target, currency);
  const pct = p.progress === null ? null : Math.min(100, Math.round(p.progress * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
        <span className="text-bb-muted">{p.label}{p.better === "down" ? " (lower is better)" : ""}</span>
        <span>
          {val === null ? <span className="text-bb-dim">not measured yet</span> : <span className="font-semibold tabular-nums">{val}</span>}
          {p.scope === "business" && <span className="text-bb-dim"> business-wide</span>}
          {tgt !== null && <span className="text-bb-dim"> · target {p.better === "down" ? "at most " : ""}{tgt}</span>}
        </span>
      </div>
      {pct !== null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-bb-surface2" role="img" aria-label={`${pct}% of target`}>
          <div className={`h-full rounded-full ${pct >= 100 ? "bg-bb-accent" : "bg-bb-blue"}`} style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
      ) : p.met !== null ? (
        <p className={`text-[11.5px] ${p.met ? "text-bb-accent" : "text-bb-warn"}`}>{p.met ? "Target met" : "Not at target yet"}</p>
      ) : null}
    </div>
  );
}
