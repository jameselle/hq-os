// Rival moves for Email & Lifecycle: a watched competitor page that changed in the last 7 days becomes a card in
// "Needs you" ("tell your at-risk customers first?") until the owner marks it seen. The watches are the business's
// competitor list (/hq:competitors); this only reads changedetection.io. Server-only.
import { competitorRows } from "./status";
import { getProfile } from "./store";
import { WATCHER_URL } from "./competitors";
import { readSeen } from "./rivals-seen";

export { markRivalSeen } from "./rivals-seen";

export type RivalChange = { uuid: string; competitor: string; url: string; lastChanged: string; diffUrl: string };
const DAY = 864e5;

/** Unseen changes on watched rival pages in the last `days` days, newest first. Empty when the watcher is off. */
export async function rivalChanges(slug: string, now = Date.now(), days = 7): Promise<RivalChange[]> {
  const profile = getProfile(slug);
  if (!profile) return [];
  const { rows } = await competitorRows(profile).catch(() => ({ rows: null }));
  const seen = readSeen(slug);
  return (rows ?? []).filter((r): r is typeof r & { lastChanged: string } => Boolean(r.lastChanged) && now - Date.parse(r.lastChanged!) < days * DAY && !(seen[r.uuid] && seen[r.uuid] >= r.lastChanged!))
    .map((r) => ({ uuid: r.uuid, competitor: r.competitor, url: r.url, lastChanged: r.lastChanged, diffUrl: `${WATCHER_URL}/diff/${r.uuid}` }))
    .sort((a, b) => b.lastChanged.localeCompare(a.lastChanged));
}
