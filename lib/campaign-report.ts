// Gathers what HQ already holds about one business (social and blog drafts, read-back posts, lifecycle sends,
// experiments, the ledger, the analytics adapter's per-campaign rows and the business-wide board) once, then works
// out every campaign's performance with lib/campaigns.ts. Server-side: the site's Campaigns page, the CLI's
// `campaign report` and the workflow evidence all use it.
import fs from "node:fs";
import path from "node:path";

import { analyticsBoard, analyticsState } from "./analytics";
import { listDrafts as listBlogDrafts } from "./blog-store";
import { listCampaigns, vaultHasNote } from "./campaign-store";
import { campaignReport, type Campaign, type CampaignFacts, type CampaignReport } from "./campaigns";
import { listExperiments } from "./experiments";
import { loadLedger } from "./ledger-spend";
import { lifecycleState } from "./lifecycle";
import { listSocial } from "./social-store";
import { businessDir, getProfile, ledgerPath, listBusinesses, type PublishedPost } from "./store";

const safe = <T>(f: () => T, fallback: T): T => { try { return f(); } catch { return fallback; } };

/** Posts read back from a platform, across every business on this Mac (a series can sell another business). */
function readBackPosts(): CampaignFacts["readBack"] {
  const out: CampaignFacts["readBack"] = {};
  for (const p of listBusinesses().profiles) {
    const lines = safe(() => fs.readFileSync(path.join(businessDir(p.slug), "published.jsonl"), "utf8").split("\n"), [] as string[]);
    for (const l of lines) {
      if (!l.trim()) continue;
      const x = safe(() => JSON.parse(l) as PublishedPost, null);
      if (x?.status === "published" && x.url) out[x.url] = { platform: x.platform, at: x.at };
    }
  }
  return out;
}

/** The facts for one business. `readings: false` skips the analytics board (the workflow evidence needs no numbers). */
export function campaignFacts(slug: string, opts: { readings?: boolean; campaigns?: Campaign[] } = {}, now = new Date()): CampaignFacts {
  const profile = getProfile(slug);
  if (!profile) throw Error(`no such business: ${slug}`);
  const social = safe(() => {
    const all = listSocial(slug, 52);
    return fs.existsSync(path.join(businessDir(slug), "social")) ? all.map((d) => ({ id: d.id, network: d.network, format: d.format, day: d.day, status: d.status, url: d.url, postedAt: d.postedAt, link: d.link, campaign: d.campaign })) : null;
  }, null);
  const blog = safe(() => fs.existsSync(path.join(businessDir(slug), "blog"))
    ? listBlogDrafts(slug).map((d) => ({ slug: d.meta.slug, title: d.meta.title, status: d.meta.status, url: d.meta.url, publishedAt: d.meta.publishedAt, date: d.meta.date, campaign: d.meta.campaign }))
    : null, null);
  const lc = safe(() => lifecycleState(slug), null);
  const lifecycle: CampaignFacts["lifecycle"] = lc?.connected && lc.snapshot ? {
    observedAt: lc.snapshot.observedAt,
    flows: (lc.snapshot.flows ?? []).map((f) => ({ id: f.id, label: f.label, messages: f.messages.map((m) => m.id), daily: f.daily.map(({ day, sent }) => ({ day, sent })), outcomes: f.outcomes.map(({ label, window, emailed }) => ({ label, window, emailed })) })),
    workflows: lc.snapshot.workflows.map(({ id, label, sent30d }) => ({ id, label, sent30d })),
  } : null;
  const ledgerText = safe(() => (fs.existsSync(ledgerPath(slug)) ? loadLedger(ledgerPath(slug)) : null), null);
  const an = safe(() => analyticsState(slug, now), null);
  const readings: CampaignFacts["readings"] = {};
  if (opts.readings !== false) {
    for (const m of safe(() => analyticsBoard(slug, now).metrics, [])) readings[m.id] = { value: m.value, status: m.status, note: m.note };
  }
  const campaigns = opts.campaigns ?? listCampaigns(slug);
  const noteRefs = [...new Set(campaigns.flatMap((c) => c.links.filter((l) => l.kind === "note").map((l) => l.ref)))];
  return {
    now: now.getTime(), currency: profile.currency, social, blog, readBack: readBackPosts(), lifecycle,
    experiments: safe(() => listExperiments(slug), []).map(({ id, hypothesis, metric, status, baseline, result, startedAt }) => ({ id, hypothesis, metric, status, baseline, result, startedAt })),
    ledger: ledgerText,
    analytics: { connected: Boolean(an?.connected || an?.demo), observedAt: an?.snapshot?.observedAt ?? null, campaigns: an?.snapshot?.campaigns ?? null },
    readings,
    vaultNotes: noteRefs.filter((r) => vaultHasNote(slug, r)),
  };
}

/** Every campaign's report for a business, live first. */
export function campaignReports(slug: string, opts: { readings?: boolean } = {}, now = new Date()): CampaignReport[] {
  const campaigns = listCampaigns(slug);
  if (!campaigns.length) return [];
  const facts = campaignFacts(slug, { ...opts, campaigns }, now);
  return campaigns.map((c) => campaignReport(c, facts));
}
