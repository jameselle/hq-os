// The weekly social plan's pure parts: the per-business config, a post draft, each network's limits, the checks a
// post must pass, and what happens to it (HQ posts it, the owner posts it by hand, or another tool posts there).
// No I/O: lib/social-store.ts reads and writes. The claims rules are the blog's (lib/blog.ts), so a business's
// regulated flags and never-name list mean the same thing everywhere it publishes.
import { BANNED, type BlogCheck } from "./blog";
import type { RegulatedFlag } from "./profile";
import { linkHasTag, socialLinkParams } from "./utm";

export const NETWORKS = ["instagram", "tiktok", "x", "linkedin", "pinterest", "youtube", "facebook", "threads", "discord"] as const;
export type Network = (typeof NETWORKS)[number];
export const FORMATS = ["carousel", "reel", "image", "story", "pin", "post", "thread", "short", "video"] as const;
export type Format = (typeof FORMATS)[number];

/** Who puts a network's posts out: HQ (by itself, on the post's day), the owner by hand, or another tool (HQ only plans). */
export type Posting = "hq" | "hand" | "elsewhere";

/** $HQ_DATA/businesses/<slug>/social/social.json */
export type SocialConfig = {
  mode: "off" | "draft" | "auto";
  /** Until this date every post waits for the owner (week one). */
  approveUntil?: string;
  /** ISO weekday the week's drafts are written (1 = Monday) and the local hour. */
  weekday?: number;
  hour?: number;
  networks: Partial<Record<Network, { posting: Posting; perWeek?: number; handle?: string; board?: string }>>;
  /** The local hour HQ posts a day's posts from (9 when unset). */
  postHour?: number;
  /** How many times HQ tries to post one post before it marks it failed for the owner (1 to 5; 3 when unset). */
  maxAttempts?: number;
  /** Names a post must never contain (operators the business may not promote). */
  banned?: string[];
  /** Card fonts (free Google Fonts family names), e.g. { heading: "Fredoka", body: "Inter" }. Inter by default. */
  fonts?: { heading?: string; body?: string };
  /** Opt-in comment replies (lib/social-replies.ts): HQ drafts replies to new comments; only approved ones post. */
  replies?: { instagram?: InstagramReplies };
};

/** Where the Instagram token lives and which comments to leave alone. The token is read from the login Keychain at
 *  run time (`security find-generic-password -s <service> -a <keychain> -w`) and never logged or stored. */
export type InstagramReplies = {
  /** The Keychain account holding an Instagram API (Instagram Login) token for the business's account. */
  keychain: string;
  /** The Keychain service; "comment-dm" when unset, so the comment-to-DM bot's token serves both. */
  service?: string;
  /** Comments containing one of these words belong to the comment-to-DM bot and are never queued. */
  skipKeywords?: string[];
  /** Comments older than this many days are left (1 to 30; 7 when unset). */
  days?: number;
};

/** How a slide is laid out. cover: the hook; point: a title and a line; stat: one big number; list: 2 to 6 short
 *  items; compare: one value becoming another; cta: the closing ask. Leave it out for cover on slide 1, point after. */
export const SLIDE_KINDS = ["cover", "point", "stat", "list", "compare", "cta"] as const;
export type SlideKind = (typeof SLIDE_KINDS)[number];
export type Slide = {
  title: string;
  body?: string;
  kind?: SlideKind;
  /** stat: the number itself, e.g. "118%". */
  stat?: string;
  /** list: the items, each a few words. */
  items?: string[];
  /** compare: e.g. { from: "2.12", fromLabel: "Shown", to: "2.05", toLabel: "After 6% commission" }. */
  compare?: { from: string; to: string; fromLabel?: string; toLabel?: string };
};
export type SocialStatus = "draft" | "approved" | "rejected" | "posted" | "failed";

export type SocialDraft = {
  id: string;
  network: Network;
  format: Format;
  /** The day it should go out (YYYY-MM-DD, business timezone). */
  day: string;
  caption: string;
  hashtags: string[];
  /** One link, where the network allows it in the post. */
  link?: string;
  /** The comment keyword, if the post asks for one. */
  keyword?: string;
  /** For pins: the pin title (Pinterest shows it separately). */
  title?: string;
  /** Cards HQ renders (carousels, pins, image posts, stories). */
  slides?: Slide[];
  /** Video posts: a path to an existing video, or what the owner should record. */
  video?: { path?: string; brief?: string };
  /** What it's built from and why this week: the blog post, tool or page behind it. */
  why: string;
  /** The id of the campaign this post serves (lib/campaigns.ts); its own-site link then carries the campaign's tag. */
  campaign?: string;
  status: SocialStatus;
  checks?: BlogCheck[];
  checkedAt?: string;
  media?: string[];
  notes?: { at: string; text: string }[];
  url?: string;
  postedAt?: string;
  error?: string;
  /** Pinterest: the board id this pin goes on (the plan's default board when unset). */
  board?: string;
  /** The platform's id for the live post, read back after HQ posted it. */
  postId?: string;
  /** Every time HQ tried to post it. Written BEFORE any call to the platform, so a retry knows to look first. */
  attempts?: PublishAttempt[];
};

export type PublishAttempt = { at: string; run: string; result?: "posted" | "found" | "error"; error?: string };

/** Caption length, hashtag count and whether the post needs cards, per network. */
export const LIMITS: Record<Network, { caption: number; hashtags: number }> = {
  instagram: { caption: 2200, hashtags: 5 },
  tiktok: { caption: 2200, hashtags: 5 },
  x: { caption: 280, hashtags: 2 },
  linkedin: { caption: 3000, hashtags: 3 },
  pinterest: { caption: 500, hashtags: 0 },
  youtube: { caption: 5000, hashtags: 3 },
  facebook: { caption: 5000, hashtags: 3 },
  threads: { caption: 500, hashtags: 1 },
  discord: { caption: 2000, hashtags: 0 },
};
export const CARD_FORMATS: Format[] = ["carousel", "image", "story", "pin"];
export const VIDEO_FORMATS: Format[] = ["reel", "short", "video"];

/** Card size in pixels per format (Instagram 4:5, pins 2:3, stories 9:16, link images 1.91:1). */
export const CARD_SIZE: Record<string, { w: number; h: number }> = {
  carousel: { w: 1080, h: 1350 }, pin: { w: 1000, h: 1500 }, story: { w: 1080, h: 1920 }, image: { w: 1200, h: 675 },
};

const DASH = /[–—]/;
const URL_RE = /https?:\/\/\S+/g;
/** Characters a network counts. X shortens every link to 23 characters, whatever its length. */
export function countedLength(network: Network, text: string): number {
  return network === "x" ? text.replace(URL_RE, "x".repeat(23)).length : text.length;
}
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

const wordCount = (t?: string) => (t ?? "").trim().split(/\s+/).filter(Boolean).length;

/** Why a slide won't read at a glance on a phone, or "" when it will. Exported for tests. */
export function slideProblem(sl: Slide): string {
  if (sl.kind && !(SLIDE_KINDS as readonly string[]).includes(sl.kind)) return `unknown kind "${sl.kind}"`;
  if (!sl.title?.trim()) return "no title";
  if (sl.title.length > 70) return `title is ${sl.title.length} characters (at most 70)`;
  if (wordCount(sl.body) > 40) return `body is ${wordCount(sl.body)} words (at most 40)`;
  if (sl.kind === "stat" && !(sl.stat && sl.stat.length <= 12)) return "a stat slide needs a stat of at most 12 characters";
  if (sl.kind === "list" && !(sl.items && sl.items.length >= 2 && sl.items.length <= 6 && sl.items.every((x) => wordCount(x) <= 14)))
    return "a list slide needs 2 to 6 items of at most 14 words";
  if (sl.kind === "compare" && !(sl.compare?.from && sl.compare.to && sl.compare.from.length <= 14 && sl.compare.to.length <= 14))
    return "a compare slide needs a from and a to of at most 14 characters";
  return "";
}

/** `campaigns`: the business's campaigns that aren't done, id → tag, so a post that names one is checked against it. */
export type SocialContext = { regulated: RegulatedFlag[]; banned?: string[]; sites: string[]; posting?: Posting; campaigns?: Record<string, string> };

/** Every check a post must pass before it can go out. Each one says why it failed. */
export function checkSocial(d: SocialDraft, ctx: SocialContext): BlogCheck[] {
  const out: BlogCheck[] = [];
  const add = (id: string, label: string, ok: boolean, detail: string) => out.push({ id, label, ok, detail });
  const lim = LIMITS[d.network];
  const text = [d.caption, d.title ?? "", ...(d.slides ?? []).flatMap((s) => [s.title, s.body ?? "", s.stat ?? "", ...(s.items ?? []), s.compare?.from ?? "", s.compare?.to ?? "", s.compare?.fromLabel ?? "", s.compare?.toLabel ?? ""])].join("\n");
  const full = `${d.caption}${d.hashtags.length ? `\n\n${d.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` : ""}`;

  add("network", "A network HQ knows", (NETWORKS as readonly string[]).includes(d.network), d.network);
  add("format", "A format HQ knows", (FORMATS as readonly string[]).includes(d.format), d.format);
  const counted = countedLength(d.network, full);
  add("caption", `Caption fits ${d.network} (${lim.caption} characters)`, d.caption.trim().length > 0 && counted <= lim.caption, `${counted} characters${d.network === "x" && counted !== full.length ? " (links count as 23)" : ""}`);
  add("hashtags", `At most ${lim.hashtags} hashtags`, d.hashtags.length <= lim.hashtags, `${d.hashtags.length} hashtags`);
  add("dashes", "No em or en dashes", !DASH.test(text) && !DASH.test(d.hashtags.join(" ")), DASH.test(text) ? "found a long dash" : "none");
  if (CARD_FORMATS.includes(d.format)) {
    const n = d.slides?.length ?? 0, max = d.format === "carousel" ? 10 : 1;
    add("cards", d.format === "carousel" ? "2 to 10 slides" : "One card", d.format === "carousel" ? n >= 2 && n <= max : n === 1, `${n} slides`);
    const bad = (d.slides ?? []).map((sl, i) => [i + 1, slideProblem(sl)] as const).filter(([, why]) => why);
    add("slides", "Every slide reads at a glance", bad.length === 0, bad.length ? bad.map(([i, why]) => `slide ${i}: ${why}`).join("; ") : "all short");
  }
  if (VIDEO_FORMATS.includes(d.format)) add("video", "A video, or a brief for the owner to record", Boolean(d.video?.path || d.video?.brief), d.video?.path ? "video ready" : d.video?.brief ? "needs recording" : "no video");
  if (d.network === "pinterest") add("pin-title", "Pin title up to 100 characters", Boolean(d.title) && (d.title?.length ?? 0) <= 100, `${d.title?.length ?? 0} characters`);
  const own = ctx.sites.map(hostOf).filter(Boolean);
  if (d.link) add("link", "The link goes to the business's own site", own.includes(hostOf(d.link)), hostOf(d.link) || "not a URL");
  if (d.campaign) {
    const tag = ctx.campaigns?.[d.campaign];
    add("campaign", "A campaign HQ knows", Boolean(tag), tag ? d.campaign : `no open campaign ${d.campaign}`);
    if (tag && d.link && own.includes(hostOf(d.link)))
      add("campaign-tag", "The link carries the campaign's tag", linkHasTag(d.link, tag), linkHasTag(d.link, tag) ? tag : `add ?${socialLinkParams(tag, d.network)}`);
  }
  const banned = [...ctx.regulated.flatMap((f) => BANNED[f] ?? []), ...(ctx.banned ?? [])]
    .filter((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(text));
  add("claims", "No banned claims, inducements or names for this business", banned.length === 0, banned.length ? `uses ${[...new Set(banned)].map((w) => `"${w}"`).join(", ")}` : "none");
  if (ctx.regulated.includes("gambling") && d.network !== "linkedin") add("age", "Carries 18+", /18\+/.test(text), /18\+/.test(text) ? "present" : "missing");
  return out;
}

export type SocialDecision = "publish" | "hand" | "wait" | "blocked" | "off" | "done" | "failed";

/** The networks and formats HQ posts by itself. Anything else on an "hq" network goes to the owner by hand. */
export const AUTO_POST: Partial<Record<Network, Format[]>> = {
  instagram: ["carousel", "image", "story", "reel"],
  pinterest: ["pin"],
};

/** Why HQ can't post this one by itself (so the owner posts it by hand), or "" when it can. */
export function autoPostProblem(d: SocialDraft): string {
  const formats = AUTO_POST[d.network];
  if (!formats) return `HQ doesn't post to ${d.network} by itself yet`;
  if (!formats.includes(d.format)) return `HQ doesn't post ${d.network} ${d.format}s by itself yet`;
  if (VIDEO_FORMATS.includes(d.format)) return d.video?.path ? "" : "it needs a video, and none is recorded yet";
  // Cards are rendered by the same hourly run before it posts; the publisher refuses a post whose cards are missing.
  return "";
}

/** What to do with a post now. A failed check always waits; week one always waits for the owner; a post HQ
 *  couldn't put out stays failed until the owner approves it again. */
export function decideSocial(c: SocialConfig, d: SocialDraft, now: Date): SocialDecision {
  if (d.status === "posted" || d.status === "rejected") return "done";
  if (c.mode === "off") return "off";
  const posting = c.networks[d.network]?.posting ?? "hand";
  if (posting === "elsewhere") return "done";
  if (!d.checks?.length || d.checks.some((x) => !x.ok)) return "blocked";
  if (d.status === "failed") return "failed";
  const weekOne = c.approveUntil ? now < new Date(c.approveUntil) : false;
  const allowed = d.status === "approved" || (c.mode === "auto" && !weekOne);
  if (!allowed) return "wait";
  return posting === "hq" && !autoPostProblem(d) ? "publish" : "hand";
}

export function socialDecisionText(c: SocialConfig, d: SocialDraft, now: Date): string {
  switch (decideSocial(c, d, now)) {
    case "done": return d.status === "posted" ? `Posted${d.url ? `: ${d.url}` : ""}.` : d.status === "rejected" ? "Rejected." : "Another tool posts on this network; HQ only plans it.";
    case "off": return "Social is off for this business.";
    case "blocked": return d.checks?.length ? `Waiting: ${d.checks.filter((x) => !x.ok).map((x) => x.label.toLowerCase()).join("; ")}.` : "Waiting for its checks.";
    case "publish": return d.attempts?.length && d.error ? `HQ tried to post it and will try again: ${d.error}` : `Ready: HQ posts it on ${d.day} from ${c.postHour ?? 9}:00.`;
    case "hand": {
      const why = (c.networks[d.network]?.posting ?? "hand") === "hq" ? autoPostProblem(d) : "";
      return `Ready for you to post by hand on ${d.day}${why ? ` (${why})` : ""}: copy the caption and save the images, then mark it posted.`;
    }
    case "failed": return `HQ couldn't post it${d.error ? `: ${d.error}` : "."} Approve it again to retry, or post it by hand and add the link.`;
    case "wait": return c.approveUntil && now < new Date(c.approveUntil) ? "Week one: waiting for your yes." : "Waiting for your yes.";
  }
}

export function validateSocialConfig(x: unknown): SocialConfig {
  const c = (x ?? {}) as SocialConfig;
  if (!["off", "draft", "auto"].includes(c.mode)) throw Error("social.json: mode must be off, draft or auto");
  if (!c.networks || typeof c.networks !== "object") throw Error("social.json: networks is required");
  for (const [n, v] of Object.entries(c.networks)) {
    if (!(NETWORKS as readonly string[]).includes(n)) throw Error(`social.json: unknown network ${n}`);
    if (!["hq", "hand", "elsewhere"].includes(v?.posting as string)) throw Error(`social.json: ${n}.posting must be hq, hand or elsewhere`);
  }
  if (c.maxAttempts !== undefined && !(Number.isInteger(c.maxAttempts) && c.maxAttempts >= 1 && c.maxAttempts <= 5)) throw Error("social.json: maxAttempts must be a whole number from 1 to 5");
  const ig = c.replies?.instagram;
  if (c.replies !== undefined && (typeof c.replies !== "object" || c.replies === null)) throw Error("social.json: replies must be an object");
  if (ig !== undefined) {
    // Names only: these go to `security` as arguments, so nothing that could be read as an option or a path.
    const name = /^[A-Za-z0-9][\w.@:-]{0,99}$/;
    if (typeof ig?.keychain !== "string" || !name.test(ig.keychain)) throw Error("social.json: replies.instagram.keychain must be the Keychain account name holding the token");
    if (ig.service !== undefined && !(typeof ig.service === "string" && name.test(ig.service))) throw Error("social.json: replies.instagram.service must be a Keychain service name");
    if (ig.skipKeywords !== undefined && !(Array.isArray(ig.skipKeywords) && ig.skipKeywords.every((k) => typeof k === "string" && k.trim() && k.length <= 40))) throw Error("social.json: replies.instagram.skipKeywords must be a list of words");
    if (ig.days !== undefined && !(Number.isInteger(ig.days) && ig.days >= 1 && ig.days <= 30)) throw Error("social.json: replies.instagram.days must be a whole number from 1 to 30");
  }
  return c;
}

/** ISO week label (YYYY-Www) for a date in a timezone. */
export function weekOf(d: Date, tz: string): string {
  const day = new Date(d.toLocaleDateString("en-CA", { timeZone: tz }) + "T00:00:00Z");
  const dow = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - dow + 3);
  const first = new Date(Date.UTC(day.getUTCFullYear(), 0, 4));
  const wk = 1 + Math.round(((day.getTime() - first.getTime()) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${day.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}
