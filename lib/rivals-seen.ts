// Which rival changes the owner has already looked at, per business ($HQ_DATA, 0600). Kept apart from lib/rivals.ts,
// which reads the watcher through server-only code. Server-only.
import fs from "node:fs";
import path from "node:path";

import { businessDir, getProfile } from "./store";

const seenFile = (slug: string) => path.join(businessDir(slug), "rival-seen.json");
export const readSeen = (slug: string): Record<string, string> => { try { return JSON.parse(fs.readFileSync(seenFile(slug), "utf8")); } catch { return {}; } };

/** The owner has looked: hide this change (a newer change to the same page shows again). */
export function markRivalSeen(slug: string, uuid: string, lastChanged: string) {
  if (!getProfile(slug)) throw Error("Unknown business");
  if (!/^[0-9a-f-]{36}$/.test(uuid) || !Number.isFinite(Date.parse(lastChanged))) throw Error("Unknown change");
  const seen = readSeen(slug);
  seen[uuid] = lastChanged;
  fs.writeFileSync(seenFile(slug), JSON.stringify(seen, null, 1) + "\n", { mode: 0o600 });
}
