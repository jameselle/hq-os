// Market & Competitors: which public pages to watch for a business, how its
// watches are tagged in changedetection.io, and what counts as a recent change.
// Pure and client-safe; the HTTP side lives in scripts/hq.ts and lib/status.ts.

import type { Competitor, Profile } from "./profile";

export const WATCHER_PORT = 5010;
export const WATCHER_URL = `http://127.0.0.1:${WATCHER_PORT}`;
export const WATCHER_KEYCHAIN = "hq-changedetection";

/** Each business's watches carry this tag, so businesses never see each other's. */
export const watchTag = (slug: string) => `hq-${slug}`;

export type WatchTarget = { competitor: string; url: string; title: string };

/** The pages to watch: each competitor's explicit `watch` list, or its homepage if it has none. */
export function watchTargets(profile: Profile): WatchTarget[] {
  const out: WatchTarget[] = [];
  const seen = new Set<string>();
  for (const c of profile.competitors ?? []) {
    const urls = c.watch?.length ? c.watch : c.site ? [c.site] : [];
    for (const url of urls) {
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ competitor: c.name, url, title: `${c.name}: ${shortUrl(url)}` });
    }
  }
  return out;
}

export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, "") + u.pathname).replace(/\/$/, "");
  } catch {
    return url;
  }
}

/** A watch as HQ reports it (from changedetection.io's API). */
export type WatchRow = {
  uuid: string;
  competitor: string;
  url: string;
  lastChanged: string | null; // ISO; null = never changed since first check
  lastChecked: string | null;
  error: string | null;
};

const DAY = 24 * 60 * 60 * 1000;

export function recentChanges(rows: WatchRow[], days = 7, now = new Date()): WatchRow[] {
  return rows.filter((r) => r.lastChanged && now.getTime() - Date.parse(r.lastChanged) <= days * DAY);
}

/** Which competitor a watch belongs to, from its title ("Name: host/path"). */
export function competitorFromTitle(title: string | undefined, profile: Profile | null): string {
  const name = (title ?? "").split(":")[0].trim();
  return profile?.competitors?.find((c) => c.name === name)?.name ?? (name || "unknown");
}

/** The head of a competitor's vault note; HQ appends dated sweep entries below it. */
export function competitorNoteHead(profile: Profile, c: Competitor): string {
  const ch = Object.entries(c.channels ?? {}).map(([k, v]) => `- **${k}:** ${v}`);
  return (
    `---\ntype: "competitor"\nbusiness: ${JSON.stringify(profile.name)}\ncompetitor: ${JSON.stringify(c.name)}\n---\n\n` +
    `# ${c.name}\n\n` +
    (c.site ? `**Site:** ${c.site}\n\n` : "") +
    (ch.length ? `## Channels\n${ch.join("\n")}\n\n` : "") +
    (c.watch?.length ? `## Watched pages\n${c.watch.map((u) => `- ${u}`).join("\n")}\n\n` : "") +
    (c.notes ? `## Notes\n${c.notes}\n\n` : "") +
    `## Log\nDated entries from \`/hq:competitors\` sweeps, newest last.\n`
  );
}
