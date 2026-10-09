// The weekly social plan on disk: $HQ_DATA/businesses/<slug>/social/ holds social.json, drafts/<week>/<id>.json,
// media/<week>/ (rendered cards), research/<week>/ and log.jsonl. Checks drafts, renders their cards, and records
// the owner's actions (approve, reject, note, "I posted it"). HQ's own posting is lib/social-publisher.ts. Server-only.
import fs from "node:fs";
import path from "node:path";

import { readBlogConfig } from "./blog-store";
import { listCampaigns } from "./campaign-store";
import { NETWORKS, asSlideshow, checkSocial, keywordDmTool, validateSocialConfig, type SocialConfig, type SocialContext, type SocialDraft } from "./social";
import { renderCards } from "./social-cards";
import { renderSlideshow } from "./social-slideshow";
import { businessDir, getProfile } from "./store";

export const socialDir = (slug: string) => path.join(businessDir(slug), "social");
const cfgFile = (slug: string) => path.join(socialDir(slug), "social.json");
const draftsDir = (slug: string) => path.join(socialDir(slug), "drafts");

export function readSocialConfig(slug: string): SocialConfig | null {
  try { return validateSocialConfig(JSON.parse(fs.readFileSync(cfgFile(slug), "utf8"))); } catch { return null; }
}
export function writeSocialConfig(slug: string, c: SocialConfig) {
  fs.mkdirSync(socialDir(slug), { recursive: true });
  fs.writeFileSync(cfgFile(slug), JSON.stringify(validateSocialConfig(c), null, 2) + "\n", { mode: 0o600 });
}

export type SocialFile = SocialDraft & { week: string; file: string };

/** Drafts of the most recent weeks, newest week first, then by day. */
export function listSocial(slug: string, weeks = 4): SocialFile[] {
  const dir = draftsDir(slug);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((w) => /^\d{4}-W\d{2}$/.test(w)).sort().reverse().slice(0, weeks).flatMap((week) =>
    fs.readdirSync(path.join(dir, week)).filter((f) => f.endsWith(".json")).flatMap((file) => {
      try { return [{ ...(JSON.parse(fs.readFileSync(path.join(dir, week, file), "utf8")) as SocialDraft), week, file }]; } catch { return []; }
    }).sort((a, b) => a.day.localeCompare(b.day) || a.network.localeCompare(b.network)));
}
export function findSocial(slug: string, id: string): SocialFile {
  const d = listSocial(slug, 12).find((x) => x.id === id || x.file === id);
  if (!d) throw Error(`no social draft ${id}`);
  return d;
}
export function saveSocial(slug: string, d: SocialFile) {
  const { week, file, ...draft } = d;
  const f = path.join(draftsDir(slug), week, file), tmp = `${f}.tmp`;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(draft, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, f);
}
export function socialLog(slug: string, e: Record<string, unknown>) {
  fs.mkdirSync(socialDir(slug), { recursive: true });
  fs.appendFileSync(path.join(socialDir(slug), "log.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n");
}

/** `by: "auto"` records that auto mode (after week one) approved it, not the owner. */
export function setSocialStatus(slug: string, id: string, status: "approved" | "rejected" | "draft", by: "owner" | "auto" = "owner") {
  const d = findSocial(slug, id);
  if (d.status === "posted") throw Error("already posted");
  // Approving a post HQ couldn't put out starts its attempts again.
  if (status === "approved" && d.status === "failed") { delete d.attempts; delete d.error; }
  d.status = status; saveSocial(slug, d); socialLog(slug, { event: status, id: d.id, ...(by === "auto" ? { by } : {}) });
  return d;
}
export function addSocialNote(slug: string, id: string, text: string) {
  const d = findSocial(slug, id), t = text.trim().slice(0, 2000);
  if (!t) throw Error("empty note");
  d.notes = [...(d.notes ?? []), { at: new Date().toISOString(), text: t }]; saveSocial(slug, d); socialLog(slug, { event: "note", id: d.id });
  return d;
}
/** The owner, /hq:publish or HQ itself posted it: record where, once the url looks like the network's own. */
export function markPosted(slug: string, id: string, url: string, extra: { postId?: string; by?: "hq" | "owner" } = {}) {
  const d = findSocial(slug, id);
  if (!/^https:\/\/\S+$/.test(url)) throw Error("give the post's https link");
  d.status = "posted"; d.url = url; d.postedAt = new Date().toISOString(); delete d.error;
  if (extra.postId) d.postId = extra.postId;
  saveSocial(slug, d);
  socialLog(slug, { event: "posted", id: d.id, url, by: extra.by ?? "owner" });
  return d;
}

/** What a business's posts are checked against: its regulated flags, never-name list, own sites and open campaigns. */
export function socialContext(slug: string): { ctx: Omit<SocialContext, "posting">; config: SocialConfig } {
  const p = getProfile(slug), c = readSocialConfig(slug);
  if (!p || !c) throw Error("no social plan set up for this business");
  const banned = [...(c.banned ?? []), ...(readBlogConfig(slug)?.banned ?? [])];
  const campaigns = Object.fromEntries(listCampaigns(slug).filter((x) => x.status !== "done").map((x) => [x.id, x.utm]));
  const keywordDms = NETWORKS.filter((n) => keywordDmTool(c, n));
  return { ctx: { regulated: p.regulated, banned, sites: p.sites ?? [], campaigns, keywordDms }, config: c };
}

/** Check every open draft, and render the cards of those that need them. */
export async function checkSocialDrafts(slug: string, opts: { render?: boolean } = { render: true }): Promise<SocialFile[]> {
  const { ctx, config: c } = socialContext(slug);
  const open = listSocial(slug).filter((d) => ["draft", "approved", "failed"].includes(d.status));
  for (const d of open) {
    d.checks = checkSocial(d, { ...ctx, posting: c.networks[d.network]?.posting });
    d.checkedAt = new Date().toISOString();
    if (opts.render && d.slides?.length && !(d.media?.length)) {
      try { d.media = await renderCards(slug, d.week, d); } catch (e) { d.error = `cards didn't render: ${String((e as Error).message).slice(0, 120)}`; }
    }
    // A carousel that goes out as a slideshow Reel: make its video with music once (the publisher refuses it without one).
    if (opts.render && asSlideshow(c, d) && d.slides?.length && !(d.reel && mediaPath(slug, d.reel.path, ".mp4"))) {
      const recent = listSocial(slug, 2).filter((x) => x.id !== d.id && x.reel).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 4).map((x) => x.reel!.trackFile);
      try {
        d.reel = await renderSlideshow(slug, d, c, recent);
        if (d.error?.startsWith("slideshow didn't render")) delete d.error;
        socialLog(slug, { event: "slideshow", id: d.id, track: d.reel.track, seconds: d.reel.seconds });
      } catch (e) { d.error = `slideshow didn't render: ${String((e as Error).message).slice(0, 200)}`; }
    }
    saveSocial(slug, d);
  }
  socialLog(slug, { event: "checked", count: open.length, failing: open.filter((d) => d.checks?.some((x) => !x.ok)).length });
  return open;
}

/** A rendered card's (or, with ".mp4", a slideshow Reel's) absolute path, only if it is inside this business's social
 *  media folder. */
export function mediaPath(slug: string, rel: string, ext: ".png" | ".mp4" = ".png"): string | null {
  const base = path.join(socialDir(slug), "media");
  const abs = path.resolve(businessDir(slug), rel);
  return abs.startsWith(base + path.sep) && abs.endsWith(ext) && fs.existsSync(abs) ? abs : null;
}
