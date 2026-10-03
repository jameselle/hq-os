// Shared fixtures. Every test that touches disk gets its own temp HQ_DATA.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Profile } from "../lib/profile";
import type { DeptStatus, HostFacts } from "../lib/types";
import { DEPARTMENTS } from "../lib/registry";

export function tempData(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-test-"));
  process.env.HQ_DATA = dir;
  process.env.HQ_ROOT = path.resolve(__dirname, "..");
  return dir;
}

export function profile(over: Partial<Profile> = {}): Profile {
  return {
    slug: "acme-co",
    name: "Acme Co",
    country: "AU",
    currency: "AUD",
    timezone: "Australia/Sydney",
    offer: "Hand-made widgets",
    audience: "Hobbyists",
    model: "ecommerce",
    sites: ["https://acme.example"],
    channels: { instagram: "@acme" },
    regulated: [],
    vault: { path: "vault" },
    createdAt: "2026-09-29T00:00:00.000Z",
    ...over,
  };
}

export function facts(over: Partial<HostFacts> = {}): HostFacts {
  return {
    timeMachine: false,
    telemetryOptOut: true,
    gcloud: true,
    postizUp: true,
    postizInstalled: true,
    backup: {},
    connections: null,
    intel: { watcherUp: true, rows: [], lastBriefAt: null },
    scorecard: null,
    ...over,
  };
}

/** Department statuses with every tool missing and every skill ready, unless overridden. */
export function depts(live: Record<string, string[]> = {}): DeptStatus[] {
  return DEPARTMENTS.map((d) => {
    const tools = d.tools.map((t) => ({ ...t, state: (live[d.slug]?.includes(t.name) ? "installed" : "missing") as "installed" | "missing" }));
    const toolsLive = tools.filter((t) => t.state !== "missing").length;
    return {
      ...d,
      active: true,
      tools,
      skills: d.skills.map((s) => ({ ...s, ready: true })),
      toolsLive,
      needs: tools.length,
      needsMet: toolsLive,
      skillsReady: d.skills.length,
      readiness: 50,
      grade: toolsLive ? "thin" : "skills-only",
    };
  });
}

/** Names the framework must never contain: the local, git-ignored .private-names
 *  list plus every non-demo business connected on this Mac. Read-only. */
export function privateNames(): string[] {
  const names = new Set<string>();
  try {
    for (const line of fs.readFileSync(path.resolve(__dirname, "..", ".private-names"), "utf8").split("\n")) {
      const n = line.trim();
      if (n && !n.startsWith("#")) names.add(n);
    }
  } catch {
    /* no list on this machine */
  }
  const data = path.join(os.homedir(), "hq-data", "businesses");
  try {
    for (const slug of fs.readdirSync(data)) {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(data, slug, "profile.json"), "utf8")) as { name?: string; demo?: boolean };
        if (p.name && !p.demo) names.add(p.name);
      } catch {
        /* skip unreadable */
      }
    }
  } catch {
    /* no businesses yet */
  }
  return [...names];
}

export function nameRegex(names: string[]): RegExp | null {
  if (!names.length) return null;
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"));
  return new RegExp(esc.join("|"), "i");
}

/** Tracked files that look like a business's private scorecard plumbing: its connection, snapshots or
 *  adapter (by name), or a live endpoint or key an adapter would hold (by content). The demo adapter and the framework's own runner are exempt, and test files may be named after what they test. */
export function privateScorecardLeaks(entries: { file: string; text: string }[]): string[] {
  const NAME = [/(^|\/)scorecard-(connection|snapshot|state)\.json$/, /(^|\/)scorecard\/\d{4}-W\d{2}\.json$/, /adapter[^/]*\.(m?[jt]s|cjs|sh|py)$/];
  const CONTENT = [/\/rest\/v1\/rpc\//, /[a-z0-9]{20}\.supabase\.co/, /\b(sk|rk)_(live|test)_[A-Za-z0-9]{8,}/, /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/];
  return entries
    .filter(({ file }) => !file.startsWith("templates/scorecard/") && file !== "lib/private-adapter.ts")
    .filter(({ file, text }) => (!file.startsWith("tests/") && NAME.some((r) => r.test(file))) || CONTENT.some((r) => r.test(text)))
    .map(({ file }) => file);
}
