// Live checks against this Mac. Server-only: fs, net and child_process.
// Read-only by design: it looks for files, binaries and listening ports, and
// never opens .env files (the one file it reads is ~/.zshrc, for one flag).

import "server-only";

import { execFileSync } from "node:child_process";
import { launchdRunning } from "./launchd";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { backupIsExternal, buildFindings } from "./ceo";
import { activeDepartments } from "./profile";
import { readinessScore, toolNeeds } from "./readiness";
import { departmentNotes } from "./regulations";
import { DEPARTMENTS, EXCLUDED } from "./registry";
import { WATCHER_KEYCHAIN, WATCHER_PORT, WATCHER_URL, competitorFromTitle, watchTag, type WatchRow } from "./competitors";
import type { Profile } from "./profile";
import { channelStatuses, type ConnectionsSnapshot } from "./publishing";
import { scorecardState } from "./scorecard";
import { scorecardRows } from "./scorecard-metrics";
import { doneFindings, latestPlan, listBusinesses, readConfig, readConnections, resolveCurrent } from "./store";
import type { DeptStatus, HostFacts, StatusReport, ToolCheck, ToolState } from "./types";

const HOME = os.homedir();
const expand = (p: string) => (p.startsWith("~/") ? path.join(HOME, p.slice(2)) : p);

function dirs(p: string): string[] {
  try {
    return fs
      .readdirSync(p, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function pluginName(pluginDir: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(pluginDir, ".claude-plugin", "plugin.json"), "utf8");
    return (JSON.parse(raw) as { name?: string }).name ?? null;
  } catch {
    return null;
  }
}

function addPluginSkills(index: Set<string>, pluginDir: string) {
  const name = pluginName(pluginDir);
  if (!name) return;
  const skillsDir = path.join(pluginDir, "skills");
  for (const s of dirs(skillsDir)) {
    if (fs.existsSync(path.join(skillsDir, s, "SKILL.md"))) index.add(`${name}:${s}`);
  }
}

/** Every skill Claude Code can load on this Mac, keyed the way it is invoked. */
export function skillIndex(): Set<string> {
  const index = new Set<string>();

  // Personal skills: ~/.claude/skills/<name>/SKILL.md
  const personal = path.join(HOME, ".claude", "skills");
  for (const d of dirs(personal)) {
    if (fs.existsSync(path.join(personal, d, "SKILL.md"))) index.add(d);
  }

  // claude.ai-synced skills: ~/.claude/skills/synced/<bucket>/<name>/SKILL.md
  const synced = path.join(personal, "synced");
  for (const bucket of dirs(synced)) {
    for (const d of dirs(path.join(synced, bucket))) {
      if (fs.existsSync(path.join(synced, bucket, d, "SKILL.md"))) {
        index.add(d);
        index.add(`anthropic-skills:${d}`);
      }
    }
  }

  // claude.ai-synced plugins: ~/.claude/plugins/synced/<bucket>/<plugin>/
  const syncedPlugins = path.join(HOME, ".claude", "plugins", "synced");
  for (const bucket of dirs(syncedPlugins)) {
    for (const p of dirs(path.join(syncedPlugins, bucket))) {
      addPluginSkills(index, path.join(syncedPlugins, bucket, p));
    }
  }

  // Marketplace plugins: ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/
  const cache = path.join(HOME, ".claude", "plugins", "cache");
  for (const market of dirs(cache)) {
    for (const plugin of dirs(path.join(cache, market))) {
      for (const version of dirs(path.join(cache, market, plugin))) {
        addPluginSkills(index, path.join(cache, market, plugin, version));
      }
    }
  }

  return index;
}

const SEARCH_PATH = [
  ...(process.env.PATH ?? "").split(":"),
  path.join(HOME, ".local", "bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
].filter(Boolean);

export function hasBin(name: string): boolean {
  return SEARCH_PATH.some((dir) => {
    try {
      fs.accessSync(path.join(dir, name), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

export function hasPath(p: string): boolean {
  return fs.existsSync(expand(p));
}

function hasApp(name: string): boolean {
  return [path.join("/Applications", `${name}.app`), path.join(HOME, "Applications", `${name}.app`)].some((p) =>
    fs.existsSync(p),
  );
}

export function portOpen(port: number, timeoutMs = 350): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function launchdJobRunning(label: string): boolean {
  try {
    const uid = typeof process.getuid === "function" ? process.getuid() : 501;
    return launchdRunning(execFileSync("/bin/launchctl", ["print", `gui/${uid}/${label}`], { encoding: "utf8", timeout: 3000 }));
  } catch {
    return false;
  }
}

function composioActive(snapshot: ConnectionsSnapshot | null, toolkit: string): boolean {
  return Boolean(snapshot?.toolkits[toolkit]?.accounts.some((a) => a.status.toLowerCase() === "active"));
}

async function toolState(check: ToolCheck, snapshot: ConnectionsSnapshot | null): Promise<ToolState> {
  if (check.port !== undefined && (await portOpen(check.port))) return "running";
  if (check.launchd && launchdJobRunning(check.launchd)) return "running";
  if (check.composio && composioActive(snapshot, check.composio)) return "connected";
  if (check.paths?.some(hasPath)) return "installed";
  if (check.bins?.some(hasBin)) return "installed";
  if (check.apps?.some(hasApp)) return "installed";
  if (check.npx && hasBin("npx")) return "on-demand";
  if (check.web) return "web";
  return "missing";
}



function timeMachineConfigured(): boolean {
  try {
    const out = execFileSync("/usr/bin/tmutil", ["destinationinfo"], { encoding: "utf8", timeout: 4000 });
    return !/No destinations configured/i.test(out) && out.trim().length > 0;
  } catch {
    return false;
  }
}

function zshrcHas(flag: string): boolean {
  try {
    return fs
      .readFileSync(path.join(HOME, ".zshrc"), "utf8")
      .split("\n")
      .some((l) => !l.trim().startsWith("#") && l.includes(flag));
  } catch {
    return false;
  }
}

/** The business's competitor watches, read from changedetection.io with the Keychain token (kept in memory). */
async function competitorRows(profile: Profile | null): Promise<{ up: boolean; rows: WatchRow[] | null }> {
  if (!(await portOpen(WATCHER_PORT))) return { up: false, rows: null };
  if (!profile) return { up: true, rows: [] };
  try {
    const token = execFileSync("/usr/bin/security", ["find-generic-password", "-s", WATCHER_KEYCHAIN, "-w"], { encoding: "utf8", timeout: 3000 }).trim();
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const res = await fetch(`${WATCHER_URL}/api/v1/watch?tag=${encodeURIComponent(watchTag(profile.slug))}`, { headers: { "x-api-key": token }, signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return { up: true, rows: null };
    const list = (await res.json()) as Record<string, { url: string; title: string; last_changed: number; last_checked: number; last_error: string | false | null }>;
    return {
      up: true,
      rows: Object.entries(list).map(([uuid, w]) => ({
        uuid,
        competitor: competitorFromTitle(w.title, profile),
        url: w.url,
        lastChanged: w.last_changed ? new Date(w.last_changed * 1000).toISOString() : null,
        lastChecked: w.last_checked ? new Date(w.last_checked * 1000).toISOString() : null,
        error: w.last_error || null,
      })),
    };
  } catch {
    return { up: true, rows: null };
  }
}

function scorecardFacts(slug: string): HostFacts["scorecard"] {
  try {
    const s = scorecardState(slug);
    const missing = s.snapshot ? scorecardRows(s.snapshot).filter((m) => m.quality === "missing").map((m) => ({ lever: m.lever, label: m.label, note: m.note })) : [];
    return { connected: s.connected, demo: s.demo, stale: s.stale, failed: s.failed, hasSnapshot: Boolean(s.snapshot), currencyChanged: s.currencyChanged,
      mismatch: s.snapshot?.weeks[0].metrics.find((m) => m.id === "records_mismatch")?.value ?? null, missing };
  } catch {
    return null;
  }
}

async function hostFacts(profile: Profile | null): Promise<HostFacts> {
  const intel = await competitorRows(profile);
  const backup = readConfig().backup;
  return {
    timeMachine: timeMachineConfigured(),
    telemetryOptOut: zshrcHas("HYPERFRAMES_NO_TELEMETRY") || zshrcHas("DO_NOT_TRACK"),
    gcloud: hasBin("gcloud"),
    postizUp: await portOpen(4200),
    postizInstalled: hasPath("~/postiz-app"),
    connections: readConnections(),
    scorecard: profile ? scorecardFacts(profile.slug) : null,
    intel: { watcherUp: intel.up, rows: intel.rows, lastBriefAt: profile ? (latestPlan(profile.slug, "competitors")?.at ?? null) : null },
    backup: {
      repository: backup?.repository,
      lastSnapshotAt: backup?.lastSnapshot?.at,
      restoreTestOk: backup?.lastRestoreTest?.ok,
      stagingFailed: backup?.lastStaging?.results.filter((r) => !r.ok).map((r) => `${r.label}: ${r.detail}`),
    },
  };
}

function grade(d: { toolsLive: number; readiness: number }): DeptStatus["grade"] {
  if (d.toolsLive === 0) return "skills-only";
  return d.readiness >= 60 ? "equipped" : "thin";
}

/** Everything HQ knows, for one business (the preferred slug, else the current one). */
export async function getStatus(preferred?: string | null): Promise<StatusReport> {
  const skills = skillIndex();
  const { profiles, invalid } = listBusinesses();
  const business = resolveCurrent(preferred);
  const facts = await hostFacts(business);
  const active = new Set(activeDepartments(business));

  const departments: DeptStatus[] = await Promise.all(
    DEPARTMENTS.map(async (d) => {
      const tools = await Promise.all(d.tools.map(async (t) => ({ ...t, state: await toolState(t.check, facts.connections) })));
      const skillStatus = d.skills.map((s) => ({ ...s, ready: skills.has(s.id) }));
      const toolsLive = tools.filter((t) => t.state !== "missing").length;
      const skillsReady = skillStatus.filter((s) => s.ready).length;
      const { needs, needsMet } = toolNeeds(tools);
      const readiness = readinessScore(skillsReady, skillStatus.length, needsMet, needs);
      const notes = [...(d.notes ?? []), ...departmentNotes(business, d.slug)];
      return {
        ...d,
        notes,
        active: active.has(d.slug),
        tools,
        skills: skillStatus,
        toolsLive,
        needs,
        needsMet,
        skillsReady,
        readiness,
        grade: grade({ toolsLive, readiness }),
      };
    }),
  );

  const running = departments.filter((d) => d.active);
  const all = running.flatMap((d) => d.tools);
  // A tool listed in two departments counts once.
  const uniq = <T extends { repo: string }>(xs: T[]) => [...new Map(xs.map((x) => [x.repo, x])).values()];
  const allSkills = [...new Map(running.flatMap((d) => d.skills).map((s) => [s.id, s])).values()];

  return {
    generatedAt: new Date().toISOString(),
    business,
    businesses: profiles.map((p) => ({ slug: p.slug, name: p.name, demo: Boolean(p.demo) })),
    invalidBusinesses: invalid,
    departments,
    publishing: business ? channelStatuses(business.channels, facts.connections, facts.postizUp) : [],
    findings: buildFindings(running, facts, business, doneFindings(business?.slug ?? null)),
    totals: {
      departments: running.length,
      equipped: running.filter((d) => d.grade === "equipped").length,
      toolsRunning: uniq(all.filter((t) => t.state === "running")).length,
      toolsLive: uniq(all.filter((t) => t.state !== "missing")).length,
      toolsTotal: uniq(all).length,
      skillsReady: allSkills.filter((s) => s.ready).length,
      skillsTotal: allSkills.length,
    },
    excluded: EXCLUDED,
    host: {
      ...facts,
      backupOffMachine: backupIsExternal(facts.backup.repository),
      lastRestoreTest: readConfig().backup?.lastRestoreTest,
    },
  };
}
