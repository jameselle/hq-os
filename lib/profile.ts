// A business profile: the one file that makes HQ about a particular business.
// The framework (departments, tools, rules, skills) stays generic; everything
// specific to a business lives here, in $HQ_DATA/businesses/<slug>/profile.json.
// Client-safe: no node imports.

import { ROUTES, type ChannelSpec } from "./publishing";
import { DEPARTMENTS } from "./registry";

export const REGULATED_FLAGS = ["gambling", "kids", "finance", "health", "alcohol", "adult"] as const;
export type RegulatedFlag = (typeof REGULATED_FLAGS)[number];

export const BUSINESS_MODELS = ["subscription", "ecommerce", "services", "media", "marketplace", "saas", "other"] as const;

/** A competitor the business watches. Public sources only. */
export type Competitor = {
  name: string;
  site?: string; // homepage
  /** Platform -> public handle or URL, e.g. { youtube: "https://www.youtube.com/@x" }. */
  channels?: Record<string, string>;
  /** Public pages to watch for changes (pricing, offers, landing pages). */
  watch?: string[];
  notes?: string;
};

export type Profile = {
  slug: string; // lowercase-kebab, also the folder name
  name: string;
  tagline?: string;
  /** A sandbox business for trying HQ out; safe to delete. */
  demo?: boolean;
  country: string; // ISO 3166-1 alpha-2, e.g. "AU"
  currency: string; // ISO 4217, e.g. "AUD"
  timezone: string; // IANA, e.g. "Australia/Sydney"
  offer: string; // what it sells
  audience: string; // who buys
  model: (typeof BUSINESS_MODELS)[number];
  sites: string[];
  /** Platform -> handle, or { handle, via, account } to pick the posting route and the
   *  connected account, e.g. { instagram: { handle: "@acme", via: "composio", account: "instagram_abc-def" } }. */
  channels: Record<string, ChannelSpec>;
  brandVoice?: string;
  regulated: RegulatedFlag[];
  departments?: {
    /** Department slugs this business doesn't run. */
    skip?: string[];
    /** Extra standing notes per department slug. */
    notes?: Record<string, string[]>;
  };
  /** Who the business competes with; the Market & Competitors department watches them. */
  competitors?: Competitor[];
  /** Obsidian vault: relative to the business folder, or an absolute path to an existing vault. */
  vault: { path: string };
  createdAt: string; // ISO date
};

export type ValidationResult = { ok: true; profile: Profile } | { ok: false; errors: string[] };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Hand-rolled on purpose (no schema dependency): every rule is readable here. */
export function validateProfile(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, errors: ["profile must be a JSON object"] };
  const p = raw as Record<string, unknown>;

  if (!isStr(p.slug) || !SLUG.test(p.slug)) errors.push("slug: lowercase letters, digits and single hyphens, e.g. \"acme-co\"");
  if (!isStr(p.name)) errors.push("name: required");
  if (!isStr(p.country) || !/^[A-Z]{2}$/.test(p.country)) errors.push("country: two-letter ISO code, e.g. \"AU\"");
  if (!isStr(p.currency) || !/^[A-Z]{3}$/.test(p.currency)) errors.push("currency: three-letter ISO code, e.g. \"AUD\"");
  if (!isStr(p.timezone) || !p.timezone.includes("/")) errors.push("timezone: IANA name, e.g. \"Australia/Sydney\"");
  if (!isStr(p.offer)) errors.push("offer: what the business sells");
  if (!isStr(p.audience)) errors.push("audience: who buys");
  if (!BUSINESS_MODELS.includes(p.model as never)) errors.push(`model: one of ${BUSINESS_MODELS.join(", ")}`);
  if (!Array.isArray(p.sites) || !p.sites.every((s) => isStr(s) && /^https?:\/\//.test(s))) errors.push("sites: list of http(s) URLs (may be empty)");
  if (typeof p.channels !== "object" || p.channels === null || Array.isArray(p.channels)) {
    errors.push("channels: object of platform -> handle, or { handle, via, account } (may be empty)");
  } else {
    for (const [name, spec] of Object.entries(p.channels as Record<string, unknown>)) {
      if (typeof spec === "string") continue;
      const o = spec as { handle?: unknown; via?: unknown; account?: unknown } | null;
      if (!o || typeof o !== "object" || !isStr(o.handle)) errors.push(`channels.${name}: a handle string, or an object with a handle`);
      else {
        if (o.via !== undefined && !ROUTES.includes(o.via as never)) errors.push(`channels.${name}.via: one of ${ROUTES.join(", ")}`);
        if (o.account !== undefined && !isStr(o.account)) errors.push(`channels.${name}.account: connection id or alias`);
      }
    }
  }
  if (!Array.isArray(p.regulated) || !p.regulated.every((f) => REGULATED_FLAGS.includes(f as never)))
    errors.push(`regulated: list drawn from ${REGULATED_FLAGS.join(", ")} (may be empty)`);
  if (typeof p.vault !== "object" || p.vault === null || !isStr((p.vault as { path?: unknown }).path)) errors.push("vault.path: required");
  if (!isStr(p.createdAt) || Number.isNaN(Date.parse(p.createdAt))) errors.push("createdAt: ISO date");

  if (p.competitors !== undefined) {
    if (!Array.isArray(p.competitors)) errors.push("competitors: a list");
    else {
      const names = new Set<string>();
      (p.competitors as unknown[]).forEach((c, i) => {
        const o = c as Competitor;
        if (!o || typeof o !== "object" || !isStr(o.name)) return errors.push(`competitors[${i}].name: required`);
        if (names.has(o.name.toLowerCase())) errors.push(`competitors[${i}].name: "${o.name}" is listed twice`);
        names.add(o.name.toLowerCase());
        if (o.site !== undefined && !(isStr(o.site) && /^https?:\/\//.test(o.site))) errors.push(`competitors[${i}].site: http(s) URL`);
        if (o.watch !== undefined && !(Array.isArray(o.watch) && o.watch.every((u) => isStr(u) && /^https?:\/\//.test(u))))
          errors.push(`competitors[${i}].watch: list of http(s) URLs`);
        if (o.channels !== undefined && (typeof o.channels !== "object" || o.channels === null || !Object.values(o.channels).every((v) => typeof v === "string")))
          errors.push(`competitors[${i}].channels: platform -> handle/URL`);
      });
    }
  }

  const slugs = new Set(DEPARTMENTS.map((d) => d.slug));
  const depts = p.departments as Profile["departments"] | undefined;
  if (depts !== undefined) {
    if (typeof depts !== "object" || depts === null) errors.push("departments: object");
    else {
      for (const s of depts.skip ?? []) if (!slugs.has(s)) errors.push(`departments.skip: unknown department "${s}"`);
      for (const s of Object.keys(depts.notes ?? {})) if (!slugs.has(s)) errors.push(`departments.notes: unknown department "${s}"`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, profile: raw as Profile };
}

/** Departments this business runs, in registry order. */
export function activeDepartments(profile: Profile | null): string[] {
  const skip = new Set(profile?.departments?.skip ?? []);
  return DEPARTMENTS.map((d) => d.slug).filter((s) => !skip.has(s));
}
