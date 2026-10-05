// GEO and crawl basics for a business's site: can search engines and AI answer engines read it? Checks robots.txt
// (no AI crawler or search bot shut out), a sitemap, llms.txt and structured data on the home page. The parsing is
// pure (tested); siteChecks fetches, with a 10-minute memory cache. Server-only for siteChecks.
export const CRAWLERS = ["Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Google-Extended", "Applebot-Extended"];

/** Crawlers that robots.txt shuts out of the whole site (Disallow: / for their group, or for * with no group of their own). */
export function blockedCrawlers(robots: string): string[] {
  const groups: { agents: string[]; rules: string[] }[] = [];
  let cur: { agents: string[]; rules: string[] } | null = null;
  for (const raw of robots.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^(user-agent|disallow|allow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, key, value] = m;
    if (key.toLowerCase() === "user-agent") {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(value.toLowerCase());
    } else if (cur) cur.rules.push(`${key.toLowerCase()}:${value.trim()}`);
  }
  const shutOut = (g: { rules: string[] }) => g.rules.includes("disallow:/") && !g.rules.some((r) => r === "allow:/");
  return CRAWLERS.filter((c) => {
    const own = groups.find((g) => g.agents.includes(c.toLowerCase()));
    if (own) return shutOut(own);
    const star = groups.find((g) => g.agents.includes("*"));
    return star ? shutOut(star) : false;
  });
}

export type GeoCheck = { id: string; label: string; ok: boolean; detail: string };
const cache = new Map<string, { at: number; checks: GeoCheck[] }>();

export async function siteChecks(site: string): Promise<GeoCheck[]> {
  const hit = cache.get(site);
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit.checks;
  const get = async (p: string) => {
    try {
      const r = await fetch(new URL(p, site), { signal: AbortSignal.timeout(8000), headers: { "user-agent": "Mozilla/5.0 (HQ GEO check)" } });
      return { status: r.status, text: r.ok ? await r.text() : "" };
    } catch { return { status: 0, text: "" }; }
  };
  const [robots, sitemap, llms, home] = await Promise.all([get("/robots.txt"), get("/sitemap.xml"), get("/llms.txt"), get("/")]);
  const blocked = robots.status === 200 ? blockedCrawlers(robots.text) : [];
  const urls = (sitemap.text.match(/<loc>/g) ?? []).length;
  const ld = /<script[^>]+application\/ld\+json/i.test(home.text);
  const checks: GeoCheck[] = [
    { id: "robots", label: "Search and AI crawlers can read the site", ok: robots.status === 200 ? blocked.length === 0 : robots.status === 404, detail: robots.status === 200 ? (blocked.length ? `robots.txt shuts out ${blocked.join(", ")}` : "robots.txt lets them all in") : robots.status === 404 ? "no robots.txt (everything allowed)" : "robots.txt didn't load" },
    { id: "sitemap", label: "A sitemap lists the pages", ok: sitemap.status === 200 && urls > 0, detail: sitemap.status === 200 ? `${urls} URLs in sitemap.xml` : "no sitemap.xml" },
    { id: "llms", label: "llms.txt tells AI answer engines what's here", ok: llms.status === 200 && llms.text.trim().length > 0, detail: llms.status === 200 ? "present" : "no llms.txt" },
    { id: "schema", label: "The home page has structured data", ok: ld, detail: ld ? "JSON-LD on the home page" : "no JSON-LD on the home page" },
  ];
  cache.set(site, { at: Date.now(), checks });
  return checks;
}
