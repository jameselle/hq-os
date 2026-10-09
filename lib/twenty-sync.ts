// Optional one-way sync of a business's partners to Twenty, the Sales & Partnerships CRM (http://127.0.0.1:3020):
// a company and a person (the public handle only) per partner, and one opportunity whose stage follows the partner's
// status. It runs only when the owner has created a Twenty API key and stored it in the login Keychain:
//
//   security add-generic-password -a hq -s hq-twenty-api -w
//
// (or `hq-twenty-api-<slug>` for a business with its own workspace). Without it nothing is sent anywhere and HQ works
// from the partner files, which stay the record. The key is read at run time and never printed or written down. Only
// public partner details go to Twenty: name, handle, profile link (for X and websites), status and the agreed fee.
import { execFileSync, spawnSync } from "node:child_process";

import type { Partner, PartnerStatus } from "./partners";

export const TWENTY_URL = "http://127.0.0.1:3020";
export const TWENTY_KEYCHAIN = "hq-twenty-api";
const ACCOUNT = "hq";

/** Twenty's default opportunity stages. Declined and ended keep the stage they reached and say so in the name. */
export const TWENTY_STAGE: Record<PartnerStatus, string | null> = {
  prospect: "NEW", shortlisted: "NEW", contacted: "SCREENING", replied: "MEETING", negotiating: "PROPOSAL",
  live: "CUSTOMER", paused: "CUSTOMER", declined: null, ended: null,
};

/** The Keychain service holding the key for a business, if one exists (the per-business one first). Never reads it. */
export function twentyKeyService(slug: string): string | null {
  for (const s of [`${TWENTY_KEYCHAIN}-${slug}`, TWENTY_KEYCHAIN]) {
    const r = spawnSync("/usr/bin/security", ["find-generic-password", "-a", ACCOUNT, "-s", s], { stdio: "ignore" });
    if (r.status === 0) return s;
  }
  return null;
}

/** The key itself, for the request headers only. Never printed. */
function readKey(service: string): string {
  return execFileSync("/usr/bin/security", ["find-generic-password", "-a", ACCOUNT, "-s", service, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

export type TwentyCall = { method: "POST" | "PATCH"; path: string; body: Record<string, unknown> };

/** The records a partner becomes in Twenty. Pure. */
export function twentyRecords(p: Partner, business: { name: string; currency: string }) {
  const closed = p.status === "declined" || p.status === "ended";
  const company: Record<string, unknown> = { name: p.name };
  if (p.url && (p.platform === "website" || p.platform === "newsletter")) company.domainName = { primaryLinkUrl: p.url };
  if (p.url && p.platform === "x") company.xLink = { primaryLinkUrl: p.url };
  const person: Record<string, unknown> = { name: { firstName: p.handle.slice(0, 100), lastName: "" } };
  const opportunity: Record<string, unknown> = { name: `${p.name} partnership, ${business.name}${closed ? ` (${p.status})` : ""}`.slice(0, 200) };
  const stage = TWENTY_STAGE[p.status];
  if (stage) opportunity.stage = stage;
  if (p.deal?.fee !== undefined) opportunity.amount = { amountMicros: Math.round(p.deal.fee * 1e6), currencyCode: business.currency };
  return { company, person, opportunity };
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
export type SyncDeps = { fetch: Fetch; key: string; base?: string; now?: Date };
export type SyncResult = { partner: string; created: string[]; updated: string[]; error?: string; ids?: NonNullable<Partner["crm"]>["twenty"] };

/** The id in a Twenty REST response ({ data: { createCompany: { id } } } and friends). */
function idOf(x: unknown): string | null {
  const data = (x as { data?: Record<string, { id?: unknown }> })?.data;
  if (!data || typeof data !== "object") return null;
  for (const v of Object.values(data)) if (v && typeof v === "object" && typeof v.id === "string") return v.id;
  return null;
}

/** Sync one partner: create what's missing, update what exists. Returns the ids to keep. */
export async function syncPartner(p: Partner, business: { name: string; currency: string }, deps: SyncDeps): Promise<SyncResult> {
  const base = deps.base ?? TWENTY_URL;
  const headers = { Authorization: `Bearer ${deps.key}`, "Content-Type": "application/json", Accept: "application/json" };
  const call = async (method: "POST" | "PATCH", path: string, body: Record<string, unknown>) => {
    const r = await deps.fetch(`${base}/rest/${path}`, { method, headers, body: JSON.stringify(body) });
    if (!r.ok) throw Error(`${method} /rest/${path.split("/")[0]} answered ${r.status}`);
    return r.json();
  };
  const rec = twentyRecords(p, business);
  const ids = { ...(p.crm?.twenty ?? {}) } as NonNullable<NonNullable<Partner["crm"]>["twenty"]>;
  const out: SyncResult = { partner: p.id, created: [], updated: [] };
  try {
    const upsert = async (kind: "companies" | "people" | "opportunities", key: "companyId" | "personId" | "opportunityId", body: Record<string, unknown>) => {
      if (ids[key]) {
        try { await call("PATCH", `${kind}/${ids[key]}`, body); out.updated.push(kind); return; } catch (e) { if (!/answered 404/.test((e as Error).message)) throw e; }
      }
      const id = idOf(await call("POST", kind, body));
      if (!id) throw Error(`Twenty didn't return an id for the new ${kind} record`);
      ids[key] = id; out.created.push(kind);
    };
    await upsert("companies", "companyId", rec.company);
    await upsert("people", "personId", { ...rec.person, companyId: ids.companyId });
    await upsert("opportunities", "opportunityId", { ...rec.opportunity, companyId: ids.companyId, pointOfContactId: ids.personId });
  } catch (e) { out.error = (e as Error).message; }
  out.ids = { ...ids, syncedAt: (deps.now ?? new Date()).toISOString() };
  return out;
}

/** Sync every partner of a business. `deps` is for tests; by default the key comes from the Keychain and the requests
 *  go to the local Twenty. Returns null when the sync is off (no Keychain item). */
export async function syncTwenty(
  slug: string,
  partners: Partner[],
  business: { name: string; currency: string },
  save: (id: string, ids: NonNullable<Partner["crm"]>["twenty"]) => void,
  deps?: SyncDeps,
): Promise<SyncResult[] | null> {
  let d = deps;
  if (!d) {
    const service = twentyKeyService(slug);
    if (!service) return null;
    d = { key: readKey(service), fetch: (url, init) => fetch(url, init) as never };
  }
  const results: SyncResult[] = [];
  for (const p of partners) {
    const r = await syncPartner(p, business, d);
    if (r.ids && (r.created.length || r.updated.length)) save(p.id, r.ids);
    results.push(r);
  }
  return results;
}
