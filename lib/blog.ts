// The daily blog's pure parts: the per-business config, the draft file format, the checks a post must pass
// before it can be published, and the decision to publish or wait. No I/O here: lib/blog-store.ts reads and
// writes, the CLI and the SEO page call both. Spec: docs/superpowers/specs/2026-10-06-daily-blog-design.md.
import type { RegulatedFlag } from "./profile";

export type BlogMode = "off" | "draft" | "auto";

/** $HQ_DATA/businesses/<slug>/blog/blog.json */
export type BlogConfig = {
  mode: BlogMode;
  /** Until this ISO date every post waits for the owner, whatever the mode (week one). */
  approveUntil?: string;
  /** The site posts live on; internal links are links to this host. */
  site: string;
  /** Local hour (business timezone) the daily run starts. */
  hour?: number;
  /** What the business wants its blog to cover, in the owner's words. Optional. */
  topics?: string[];
  /** Searches or subjects never to write about. */
  avoid?: string[];
  /** Names or phrases this business's posts must never contain (for example operators it may not promote). */
  banned?: string[];
  /** The Composio Search Console account alias and the exact property, for the research step. */
  searchConsole?: { account: string; site: string };
};

export type BlogStatus = "draft" | "approved" | "rejected" | "published" | "failed";

export type BlogSource = { title: string; url: string };
export type BlogFaq = { q: string; a: string };

export type BlogDraftMeta = {
  slug: string;
  title: string;
  description: string;
  keyword: string;
  category?: string;
  sources: BlogSource[];
  faq: BlogFaq[];
  date: string;
  status: BlogStatus;
  /** Why this topic: the research note the writer left (search demand, competitor gap). */
  why?: string;
  /** The id of the campaign this post serves (lib/campaigns.ts), if any. */
  campaign?: string;
  checks?: BlogCheck[];
  checkedAt?: string;
  notes?: { at: string; text: string }[];
  url?: string;
  publishedAt?: string;
  error?: string;
};

export type BlogDraft = { meta: BlogDraftMeta; markdown: string };
export type BlogCheck = { id: string; label: string; ok: boolean; detail: string };

const FENCE = "---";

/** A draft file: a JSON front block between --- lines, then the markdown body. */
export function parseDraft(text: string): BlogDraft {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== FENCE) throw Error("draft has no front block");
  const end = lines.indexOf(FENCE, 1);
  if (end < 0) throw Error("draft front block is not closed");
  const meta = JSON.parse(lines.slice(1, end).join("\n")) as BlogDraftMeta;
  for (const k of ["slug", "title", "description", "keyword", "date"] as const) {
    if (typeof meta[k] !== "string" || !meta[k].trim()) throw Error(`draft is missing ${k}`);
  }
  meta.sources = Array.isArray(meta.sources) ? meta.sources : [];
  meta.faq = Array.isArray(meta.faq) ? meta.faq : [];
  meta.status = meta.status ?? "draft";
  return { meta, markdown: lines.slice(end + 1).join("\n").trim() + "\n" };
}

export function formatDraft(d: BlogDraft): string {
  return `${FENCE}\n${JSON.stringify(d.meta, null, 2)}\n${FENCE}\n\n${d.markdown.trim()}\n`;
}

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DASH = /[–—]/;

/** Words a post must never use, by the business's regulated flags. Matched case-insensitively as whole phrases. */
export const BANNED: Partial<Record<RegulatedFlag, string[]>> = {
  // Claims, plus inducements to gamble or to open a betting account (NSW makes publishing one an offence for anyone,
  // third parties included): promotional calls, not explanations of how bonus bets work.
  gambling: ["guaranteed", "risk-free", "risk free", "sure thing", "can't lose", "cannot lose", "free money", "lock of the",
    "promo code", "bonus code", "sign-up offer", "sign up offer", "signup offer", "welcome offer", "welcome bonus",
    "deposit bonus", "deposit match", "refer a friend", "first bet offer", "bet and get", "claim your bonus", "join now and"],
  finance: ["guaranteed returns", "risk-free", "risk free", "can't lose"],
  health: ["cure", "cures", "guaranteed results", "miracle"],
  alcohol: ["drink more"],
};

/** A line every post must carry, by regulated flag. */
export const REQUIRED_LINES: Partial<Record<RegulatedFlag, { label: string; test: RegExp }>> = {
  gambling: { label: "the 18+ responsible gambling line", test: /18\+[\s\S]{0,200}gambl(e|ing) responsibly|gambl(e|ing) responsibly[\s\S]{0,200}18\+/i },
};

export function words(md: string): string[] {
  return md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_|`-]/g, " ")
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
}

export function links(md: string): string[] {
  return [...md.matchAll(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
}

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** Share of this post's 5-word runs that also appear in another text: 0 is all new, 1 is a copy. */
export function overlap(a: string, b: string, n = 5): number {
  const grams = (ws: string[]) => { const s = new Set<string>(); for (let i = 0; i + n <= ws.length; i++) s.add(ws.slice(i, i + n).join(" ")); return s; };
  const ga = grams(words(a)), gb = grams(words(b));
  if (!ga.size) return 0;
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit++;
  return hit / ga.size;
}

export type CheckContext = {
  site: string;
  regulated: RegulatedFlag[];
  /** Slugs already on the site (from the publisher's list). */
  existingSlugs: string[];
  /** Bodies of the site's own recent posts HQ knows about, to catch repeats. */
  existingTexts: string[];
  /** The business's own never-name list (blog.json banned). */
  banned?: string[];
  /** HTTP status of each source url, from a fetch HQ made; missing means not checked. */
  sourceStatus: Record<string, number>;
};

/** Every check a post must pass before it can be published. Each one says why it failed. */
export function checkDraft(d: BlogDraft, ctx: CheckContext): BlogCheck[] {
  const { meta, markdown } = d;
  const out: BlogCheck[] = [];
  const add = (id: string, label: string, ok: boolean, detail: string) => out.push({ id, label, ok, detail });
  const wc = words(markdown).length;
  const allText = [meta.title, meta.description, markdown, ...meta.faq.flatMap((f) => [f.q, f.a]), ...meta.sources.map((s) => s.title)].join("\n");
  const site = hostOf(ctx.site);

  add("slug", "Slug is new and well formed", SLUG.test(meta.slug) && meta.slug.length <= 80 && !ctx.existingSlugs.includes(meta.slug),
    !SLUG.test(meta.slug) ? `"${meta.slug}" isn't lowercase words joined by hyphens` : ctx.existingSlugs.includes(meta.slug) ? "the site already has this slug" : meta.slug);
  add("title", "Title 20 to 65 characters", meta.title.length >= 20 && meta.title.length <= 65, `${meta.title.length} characters`);
  add("description", "Description 70 to 160 characters", meta.description.length >= 70 && meta.description.length <= 160, `${meta.description.length} characters`);
  add("length", "700 to 2,500 words", wc >= 700 && wc <= 2500, `${wc} words`);
  const firstPara = markdown.split(/\n\s*\n/).find((p) => p.trim() && !p.trim().startsWith("#")) ?? "";
  // Every meaningful word of the keyword, in any order ("remove bookmaker margin" matches "remove the bookmaker margin").
  const STOP = new Set(["a", "an", "the", "of", "to", "for", "in", "on", "and", "or", "how", "what", "is", "are", "with", "your"]);
  const kwWords = words(meta.keyword).filter((w) => !STOP.has(w));
  const has = (t: string) => { const ws = new Set(words(t)); return kwWords.length > 0 && kwWords.every((w) => ws.has(w) || ws.has(w.replace(/s$/, "")) || ws.has(`${w}s`)); };
  add("keyword", "Keyword in the title or first paragraph", has(meta.title) || has(firstPara), `"${meta.keyword}"`);

  const subset = [/<[a-z!/][^>]*>/i.test(markdown) && "HTML", /!\[/.test(markdown) && "an image", /```/.test(markdown) && "a code block", /^#\s/m.test(markdown) && "an H1"].filter(Boolean);
  add("format", "Only the allowed markdown", subset.length === 0, subset.length ? `has ${subset.join(", ")}` : "ok");
  add("dashes", "No em or en dashes", !DASH.test(allText), DASH.test(allText) ? "found a long dash" : "none");

  const srcs = meta.sources.filter((s) => /^https?:\/\//.test(s.url));
  add("sources", "At least 3 public sources", srcs.length >= 3, `${srcs.length} sources`);
  const unchecked = srcs.filter((s) => ctx.sourceStatus[s.url] === undefined);
  const broken = srcs.filter((s) => ctx.sourceStatus[s.url] !== undefined && !(ctx.sourceStatus[s.url] >= 200 && ctx.sourceStatus[s.url] < 400));
  add("source-links", "Every source link loads", srcs.length > 0 && !unchecked.length && !broken.length,
    broken.length ? `${broken.length} broken: ${broken.map((s) => s.url).slice(0, 3).join(", ")}` : unchecked.length ? `${unchecked.length} not checked yet` : "all load");
  const internal = links(markdown).filter((u) => site && hostOf(u) === site);
  add("internal-links", "At least 2 links to the site's own pages", internal.length >= 2, `${internal.length} internal links`);

  const banned = [...ctx.regulated.flatMap((f) => BANNED[f] ?? []), ...(ctx.banned ?? [])].filter((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(allText));
  add("claims", "No banned claims for this business", banned.length === 0, banned.length ? `uses ${[...new Set(banned)].map((w) => `"${w}"`).join(", ")}` : "none");
  for (const f of ctx.regulated) {
    const req = REQUIRED_LINES[f];
    if (req) add(`required-${f}`, `Carries ${req.label}`, req.test.test(markdown), req.test.test(markdown) ? "present" : "missing");
  }

  const worst = ctx.existingTexts.reduce((m, t) => Math.max(m, overlap(markdown, t)), 0);
  add("unique", "Not a repeat of an existing post", worst < 0.3, `${Math.round(worst * 100)}% overlap with the closest post`);
  return out;
}

export type Decision = "publish" | "wait" | "blocked" | "off" | "done";

/** What to do with a draft now. A failed check always waits; week one always waits; approved or auto publishes. */
export function decide(config: BlogConfig, meta: BlogDraftMeta, now: Date): Decision {
  if (meta.status === "published" || meta.status === "rejected") return "done";
  if (config.mode === "off") return "off";
  if (!meta.checks?.length || meta.checks.some((c) => !c.ok)) return "blocked";
  if (meta.status === "approved") return "publish";
  const weekOne = config.approveUntil ? now < new Date(config.approveUntil) : false;
  if (config.mode === "auto" && !weekOne) return "publish";
  return "wait";
}

/** Plain words for the owner: why a draft is where it is. */
export function decisionText(config: BlogConfig, meta: BlogDraftMeta, now: Date): string {
  switch (decide(config, meta, now)) {
    case "done": return meta.status === "published" ? `Published${meta.url ? ` at ${meta.url}` : ""}.` : "Rejected: it won't be published.";
    case "off": return "The blog is off for this business.";
    case "blocked": return meta.checks?.length ? `Waiting: ${meta.checks.filter((c) => !c.ok).map((c) => c.label.toLowerCase()).join("; ")}.` : "Waiting for its checks to run.";
    case "publish": return "Ready: it publishes on the next run.";
    case "wait": return config.approveUntil && now < new Date(config.approveUntil)
      ? `Week one: waiting for your yes (posts publish on their own from ${config.approveUntil.slice(0, 10)}).`
      : "Waiting for your yes.";
  }
}

export function validateConfig(c: unknown): BlogConfig {
  const x = (c ?? {}) as BlogConfig;
  if (!["off", "draft", "auto"].includes(x.mode)) throw Error("blog.json: mode must be off, draft or auto");
  if (typeof x.site !== "string" || !/^https:\/\//.test(x.site)) throw Error("blog.json: site must be an https URL");
  if (x.approveUntil !== undefined && Number.isNaN(Date.parse(x.approveUntil))) throw Error("blog.json: approveUntil must be a date");
  if (x.hour !== undefined && !(Number.isInteger(x.hour) && x.hour >= 0 && x.hour <= 23)) throw Error("blog.json: hour must be 0 to 23");
  return x;
}
