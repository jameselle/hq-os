// Gathers what the partner pages and `hq partner report` need for one business: its partners, the analytics adapter's
// rows keyed by tag, and the campaigns the partners serve. Server-side.
import { analyticsState } from "./analytics";
import { listCampaigns } from "./campaign-store";
import type { Campaign } from "./campaigns";
import { readPartners } from "./partner-store";
import { OPEN_STATUSES, PARTNER_STATUSES, pipelineReport, tagOutcome, type Partner, type PartnerAnalytics, type PartnerStatus, type PipelineReport } from "./partners";

const safe = <T>(f: () => T, fallback: T): T => { try { return f(); } catch { return fallback; } };

/** The analytics adapter as partner results read it: connected (or the demo), and its rows keyed by tag. */
export function partnerAnalytics(slug: string, now = new Date()): PartnerAnalytics {
  const an = safe(() => analyticsState(slug, now), null);
  return { connected: Boolean(an?.connected || an?.demo), observedAt: an?.snapshot?.observedAt ?? null, campaigns: an?.snapshot?.campaigns ?? null };
}

export type PartnersView = { partners: Partner[]; invalid: { file: string; problems: string[] }[]; analytics: PartnerAnalytics; report: PipelineReport; campaigns: Record<string, Campaign> };

export function partnersView(slug: string, now = new Date()): PartnersView {
  const { partners, invalid } = readPartners(slug);
  const analytics = partnerAnalytics(slug, now);
  const campaigns = Object.fromEntries(safe(() => listCampaigns(slug), [] as Campaign[]).map((c) => [c.id, c]));
  return { partners, invalid, analytics, report: pipelineReport(partners, analytics), campaigns };
}

/** The partners serving one campaign: counts by status, and what their tags brought together. */
export function campaignPartners(slug: string, campaignId: string, now = new Date()) {
  const partners = safe(() => readPartners(slug).partners, [] as Partner[]).filter((p) => p.campaigns.includes(campaignId));
  const counts = Object.fromEntries(PARTNER_STATUSES.map((s) => [s, partners.filter((p) => p.status === s).length])) as Record<PartnerStatus, number>;
  const tagged = partners.filter((p) => p.tracking.tag && (p.status === "live" || p.status === "paused" || p.status === "ended"));
  const outcome = tagOutcome(tagged.map((p) => p.tracking.tag as string), partnerAnalytics(slug, now), tagged.length ? "these partners" : "a live partner of this campaign (none yet)");
  return { partners, counts, open: partners.filter((p) => OPEN_STATUSES.includes(p.status)).length, tagged: tagged.length, outcome };
}
