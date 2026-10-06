// Campaigns on disk: $HQ_DATA/businesses/<slug>/campaigns/<id>.json, one file per campaign (0600), mirrored to the
// business's vault as Departments/Paid Ads & Growth/Campaigns.md so the CEO review and the brain can read them.
// Every write is validated (lib/campaigns.ts). Shared by the site and the CLI; reads nothing but campaign files.
import fs from "node:fs";
import path from "node:path";

import { ANALYTICS } from "./analytics-metrics";
import {
  CHANNEL_LABEL, LINK_KINDS, STATUS_LABEL, campaignProblems, newCampaign, sortCampaigns,
  type Campaign, type CampaignInput, type CampaignResult, type CampaignStatus, type LinkKind,
} from "./campaigns";
import { DEPARTMENTS } from "./registry";
import { socialLinkParams } from "./utm";
import { businessDir, getProfile, vaultRoot } from "./store";

export const campaignsDir = (slug: string) => path.join(businessDir(slug), "campaigns");
const SAFE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const fileOf = (slug: string, id: string) => {
  if (!SAFE_ID.test(id)) throw Error(`no campaign ${id}`);
  return path.join(campaignsDir(slug), `${id}.json`);
};
const needBusiness = (slug: string) => { const p = getProfile(slug); if (!p) throw Error(`no such business: ${slug}`); return p; };

export type InvalidCampaign = { file: string; problems: string[] };

/** Every campaign of a business, live first. Files that don't validate are returned apart, never shown as campaigns. */
export function readCampaigns(slug: string): { campaigns: Campaign[]; invalid: InvalidCampaign[] } {
  const dir = campaignsDir(slug);
  if (!fs.existsSync(dir)) return { campaigns: [], invalid: [] };
  const campaigns: Campaign[] = [], invalid: InvalidCampaign[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Campaign;
      const problems = campaignProblems(c);
      if (problems.length) invalid.push({ file, problems }); else campaigns.push(c);
    } catch (e) { invalid.push({ file, problems: [`unreadable: ${(e as Error).message.slice(0, 120)}`] }); }
  }
  return { campaigns: sortCampaigns(campaigns), invalid };
}
export const listCampaigns = (slug: string): Campaign[] => readCampaigns(slug).campaigns;

export function getCampaign(slug: string, id: string): Campaign {
  const f = fileOf(slug, id);
  if (!fs.existsSync(f)) {
    // A unique prefix is enough on the command line ("spring-carnival" for "spring-carnival-odds-2026-10-06").
    const hits = listCampaigns(slug).filter((c) => c.id.startsWith(id));
    if (hits.length === 1) return hits[0];
    throw Error(hits.length ? `${id} matches ${hits.length} campaigns: ${hits.map((c) => c.id).join(", ")}` : `no campaign ${id} for ${slug}`);
  }
  return JSON.parse(fs.readFileSync(f, "utf8")) as Campaign;
}

function save(slug: string, c: Campaign) {
  const problems = campaignProblems(c);
  if (problems.length) throw Error(`the campaign isn't valid:\n  - ${problems.join("\n  - ")}`);
  fs.mkdirSync(campaignsDir(slug), { recursive: true, mode: 0o700 });
  const f = fileOf(slug, c.id), tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, f);
  mirrorToVault(slug);
}

const touch = (c: Campaign, now: Date) => { c.updatedAt = now.toISOString(); return c; };

export function addCampaign(slug: string, input: CampaignInput, now = new Date()): Campaign {
  needBusiness(slug);
  const c = newCampaign(input, now);
  if (fs.existsSync(fileOf(slug, c.id))) throw Error(`campaign ${c.id} already exists (change the name or start date)`);
  save(slug, c);
  return c;
}

export function setCampaignStatus(slug: string, id: string, status: CampaignStatus, now = new Date()): Campaign {
  if (!(Object.keys(STATUS_LABEL) as string[]).includes(status)) throw Error("status must be planned, live, paused or done");
  const c = getCampaign(slug, id);
  c.status = status;
  if (status === "done" && !c.end) c.end = now.toISOString().slice(0, 10) < c.start ? c.start : now.toISOString().slice(0, 10);
  save(slug, touch(c, now));
  return c;
}

export function linkCampaign(slug: string, id: string, kind: LinkKind, ref: string, now = new Date()): Campaign {
  if (!(LINK_KINDS as readonly string[]).includes(kind)) throw Error(`link kind must be one of ${LINK_KINDS.join(", ")}`);
  const c = getCampaign(slug, id), r = ref.trim();
  if (c.links.some((l) => l.kind === kind && l.ref === r)) return c;
  c.links.push({ kind, ref: r, at: now.toISOString() });
  save(slug, touch(c, now));
  return c;
}

export function unlinkCampaign(slug: string, id: string, kind: LinkKind, ref: string, now = new Date()): Campaign {
  const c = getCampaign(slug, id);
  const before = c.links.length;
  c.links = c.links.filter((l) => !(l.kind === kind && l.ref === ref.trim()));
  if (c.links.length === before) throw Error(`${kind} ${ref} isn't linked to ${c.id}`);
  save(slug, touch(c, now));
  return c;
}

export function noteCampaign(slug: string, id: string, text: string, opts: { learning?: boolean } = {}, now = new Date()): Campaign {
  const c = getCampaign(slug, id);
  c.notes.push({ at: now.toISOString(), text: text.trim(), ...(opts.learning ? { learning: true } : {}) });
  save(slug, touch(c, now));
  return c;
}

export function addCampaignResult(slug: string, id: string, r: Omit<CampaignResult, "at">, now = new Date()): Campaign {
  const c = getCampaign(slug, id);
  c.results.push({ at: now.toISOString(), text: r.text.trim(), ...(r.numbers?.length ? { numbers: r.numbers } : {}) });
  save(slug, touch(c, now));
  return c;
}

/** The live campaigns that use any of these channels, as the social and blog writers read them: what each is, and for
 *  each network the query string its own-site links carry. */
export function liveCampaignBriefs(slug: string, channels: string[]) {
  return listCampaigns(slug).filter((c) => c.status === "live" && c.channels.some((ch) => channels.includes(ch))).map((c) => {
    const mine = c.channels.filter((ch) => channels.includes(ch));
    return {
      id: c.id, name: c.name, goal: c.goal, audience: c.audience, offer: c.offer, channels: mine, ...(c.end ? { end: c.end } : {}), utm: c.utm,
      linkParams: Object.fromEntries(mine.filter((ch) => ch !== "blog").map((n) => [n, socialLinkParams(c.utm, n)])),
    };
  });
}

// ---------------------------------------------------------------- the vault mirror

const pipe = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");

export function campaignsMarkdown(xs: Campaign[]): string {
  const row = (c: Campaign) => `| ${pipe(c.name)} | ${STATUS_LABEL[c.status]} | ${c.start}${c.end ? ` to ${c.end}` : ""} | ${c.lever} | ${c.channels.map((x) => CHANNEL_LABEL[x] ?? x).join(", ")} | ${ANALYTICS[c.metric]?.label ?? c.metric}${c.target !== undefined ? `, target ${c.target}` : ""} | \`${c.utm}\` | ${pipe(c.goal)} |`;
  const learnings = xs.flatMap((c) => c.notes.filter((n) => n.learning).map((n) => `- **${pipe(c.name)}** (${n.at.slice(0, 10)}): ${n.text}`));
  return [
    "# Campaigns", "", "Every marketing campaign: what it is, the tag on its links and the number it's judged by. Written by `npm run hq -- campaign`; performance is on HQ's Campaigns page.", "",
    "| Campaign | Status | Dates | Lever | Channels | Judged by | Tag | Goal |", "|---|---|---|---|---|---|---|---|",
    ...xs.map(row), "",
    ...(learnings.length ? ["## Learnings", "", ...learnings, ""] : []),
  ].join("\n");
}

function mirrorToVault(slug: string) {
  const p = getProfile(slug);
  if (!p) return;
  try {
    const label = DEPARTMENTS.find((d) => d.slug === "ads")?.label ?? "Paid Ads & Growth";
    const dir = path.join(vaultRoot(p), "Departments", label);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "Campaigns.md"), campaignsMarkdown(listCampaigns(slug)));
  } catch { /* the vault is a mirror; the campaign file is the record */ }
}

/** Does a note ref name a file inside the business's vault (with or without .md)? Never looks outside it. */
export function vaultHasNote(slug: string, ref: string): boolean {
  const p = getProfile(slug);
  if (!p) return false;
  const root = path.resolve(vaultRoot(p));
  for (const cand of [ref, `${ref}.md`]) {
    const abs = path.resolve(root, cand);
    if (abs.startsWith(root + path.sep) && fs.existsSync(abs) && fs.statSync(abs).isFile()) return true;
  }
  return false;
}
