// Shared shapes. Client-safe on purpose: no fs, no node imports.

/** How to tell whether a tool is present on this Mac. Every field is optional;
 *  the first thing that answers wins: a listening port means running, then any
 *  path, binary or app on disk means installed, then npx means on demand. */
export type ToolCheck = {
  port?: number;
  paths?: string[]; // "~" is expanded
  bins?: string[]; // looked up on PATH plus ~/.local/bin
  apps?: string[]; // /Applications/<name>.app
  npx?: boolean; // runs with `npx <pkg>`, nothing to install
  web?: boolean; // a free web service: nothing on this Mac to check
  composio?: string; // Composio toolkit slug: "connected" when the snapshot shows an active account
};

export type Licence = {
  spdx: string; // as GitHub reports it, or read from the LICENSE file
  /** "oss" = OSI licence for the whole repo; "open-core" = OSI core with an
   *  enterprise folder under a commercial licence (the core is what we use);
   *  "free" = proprietary or source-available, but free for what we use it for. */
  kind: "oss" | "open-core" | "free" | "own";
};

export type Tool = {
  name: string;
  what: string;
  repo: string; // owner/name on GitHub, or a full https:// URL for non-GitHub tools
  licence: Licence;
  check: ToolCheck;
  /** A local UI worth linking to when the tool is running. */
  url?: string;
  /** Something the operator must know before relying on it. */
  warn?: string;
  /** Plan limits or lock-in worth knowing for a "free" tool. */
  freeNote?: string;
  /** Alternatives share a group: the department needs ONE of them, not all. */
  group?: string;
  /** Nice-to-have or "when you scale": shown, but never counted against readiness. */
  optional?: boolean;
};

export type Skill = {
  /** Invocation id: "plugin:skill" for plugin skills, bare name for personal ones. */
  id: string;
  what: string;
};

export type Department = {
  slug: string;
  label: string;
  glyph: string;
  role: string; // the job title this tab stands in for
  mission: string;
  covers: string[];
  tools: Tool[];
  skills: Skill[];
  /** Standing gaps no live check can see (access, accounts, decisions). */
  notes?: string[];
};

export type ToolState = "running" | "installed" | "connected" | "on-demand" | "web" | "missing";

export type ToolStatus = Tool & { state: ToolState };
export type SkillStatus = Skill & { ready: boolean };

export type DeptStatus = Omit<Department, "tools" | "skills"> & {
  /** False when the current business's profile skips this department. */
  active: boolean;
  tools: ToolStatus[];
  skills: SkillStatus[];
  toolsLive: number; // running + installed + connected + on-demand + web
  /** Needs the department has: each group counts once, optional tools not at all. */
  needs: number;
  needsMet: number;
  skillsReady: number;
  readiness: number; // 0-100
  grade: "equipped" | "skills-only" | "thin";
};

export type Severity = "critical" | "attention" | "decision" | "info";

export type Finding = {
  id: string;
  severity: Severity;
  dept: string; // slug
  title: string;
  detail: string;
  action: string;
};

export type BusinessSummary = { slug: string; name: string; demo: boolean };

export type StatusReport = {
  generatedAt: string;
  /** The business these findings and notes are for; null until one is connected. */
  business: import("./profile").Profile | null;
  businesses: BusinessSummary[];
  invalidBusinesses: { slug: string; errors: string[] }[];
  departments: DeptStatus[];
  findings: Finding[];
  totals: {
    departments: number;
    equipped: number;
    toolsRunning: number;
    toolsLive: number;
    toolsTotal: number;
    skillsReady: number;
    skillsTotal: number;
  };
  excluded: { name: string; reason: string }[];
  /** The current business's channels and how each will be posted to. */
  publishing: import("./publishing").ChannelStatus[];
  /** Machine facts the CEO can cite instead of guessing (e.g. when the last backup ran). */
  host: HostFacts & { backupOffMachine: boolean; lastRestoreTest?: { ok: boolean; at: string; detail: string } };
};

/** Facts the CEO's rules need that no department tool check covers. */
export type HostFacts = {
  timeMachine: boolean;
  telemetryOptOut: boolean;
  gcloud: boolean;
  postizUp: boolean;
  postizInstalled: boolean;
  backup: { repository?: string; lastSnapshotAt?: string; restoreTestOk?: boolean };
  /** The current business's competitor watching (null rows = watcher unreachable). */
  intel: { watcherUp: boolean; rows: import("./competitors").WatchRow[] | null; lastBriefAt: string | null };
  /** Latest /hq:connections snapshot (ids, aliases, statuses only), or null if never taken. */
  connections: import("./publishing").ConnectionsSnapshot | null;
};
