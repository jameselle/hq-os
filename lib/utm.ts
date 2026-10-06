// Campaign tags on links. A campaign's tag is a utm_campaign value ("spring-sale"), or a prefix ending in "*"
// ("series-*") for a campaign whose links already carry one tag per network in utm_source ("series-ig",
// "series-x"). Pure and client-safe: the social checks, the writers and the campaign report all use it.

/** A tag: lowercase letters, digits, - and _, at most 60 characters, optionally ending in * (a prefix). */
export const UTM_TAG = /^[a-z0-9][a-z0-9_-]{0,59}\*?$/;

/** Short network codes for prefix tags, so "series-*" becomes series-ig on Instagram. */
export const NETWORK_SHORT: Record<string, string> = {
  instagram: "ig", tiktok: "tt", youtube: "yt", x: "x", facebook: "fb", linkedin: "li", pinterest: "pin",
  threads: "th", discord: "dc", blog: "site", email: "email",
};

/** Does one tag value fall under a campaign's tag (exact, or by prefix when the tag ends in *)? */
export function tagMatches(value: string | null | undefined, tag: string): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return tag.endsWith("*") ? v.startsWith(tag.slice(0, -1)) : v === tag;
}

/** Does a link carry the campaign's tag, in utm_campaign or (for prefix tags and series-style links) utm_source? */
export function linkHasTag(url: string | null | undefined, tag: string): boolean {
  if (!url || !tag) return false;
  let q: URLSearchParams;
  try { q = new URL(url).searchParams; } catch { return false; }
  return tagMatches(q.get("utm_campaign"), tag) || tagMatches(q.get("utm_source"), tag);
}

/** The query string a social post's own-site link should carry for a campaign on one network. */
export function socialLinkParams(tag: string, network: string): string {
  if (tag.endsWith("*")) return `utm_source=${tag.slice(0, -1)}${NETWORK_SHORT[network] ?? network}&utm_medium=social`;
  return `utm_source=${network}&utm_medium=social&utm_campaign=${tag}`;
}

/** A link with the campaign's parameters added (existing utm_* parameters are replaced). Bad URLs come back as given. */
export function tagLink(url: string, tag: string, network: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
    for (const [k, v] of new URLSearchParams(socialLinkParams(tag, network))) u.searchParams.set(k, v);
    return u.toString();
  } catch { return url; }
}
