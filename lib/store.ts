// Business data on disk. Shared by the site (server side) and the `hq` CLI, so
// it deliberately does not import "server-only".
//
// Layout (HQ_DATA defaults to ~/hq-data, outside the framework repo so the code
// can be shared and the data backed up or handed over per business):
//
//   $HQ_DATA/config.json                      current business, backup settings
//   $HQ_DATA/services.json                    this Mac's launchd services (see scripts/hq.ts)
//   $HQ_DATA/businesses/<slug>/profile.json   the business profile
//   $HQ_DATA/businesses/<slug>/state.json     findings marked done
//   $HQ_DATA/businesses/<slug>/reviews/       CEO reviews, one file per run
//   $HQ_DATA/businesses/<slug>/plans/<dept>/  department plans, one file per run
//   $HQ_DATA/businesses/<slug>/vault/         the business's Obsidian vault

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { validateProfile, activeDepartments, type Profile } from "./profile";
import { validateSnapshot, type ConnectionsSnapshot } from "./publishing";
import { DEPARTMENTS } from "./registry";

export const hqData = () => process.env.HQ_DATA || path.join(os.homedir(), "hq-data");
export const hqRoot = () => process.env.HQ_ROOT || process.cwd();

const businessesDir = () => path.join(hqData(), "businesses");
export const businessDir = (slug: string) => path.join(businessesDir(), slug);

// ---------- config ----------

export type BackupConfig = {
  repository: string; // restic repository spec
  passwordCommand: string; // e.g. security find-generic-password -s hq-restic -w
  lastSnapshot?: { id: string; at: string };
  lastRestoreTest?: { ok: boolean; at: string; detail: string };
  /** Services whose live data the last backup run staged (lib/backup.ts). */
  lastStaging?: { at: string; results: { label: string; ok: boolean; skipped?: boolean; detail: string }[] };
};

/** `done`: machine-wide findings marked done (business ones live in each business's state.json). */
export type HqConfig = { current?: string; backup?: BackupConfig; done?: Record<string, string> };

export function readConfig(): HqConfig {
  try {
    return JSON.parse(fs.readFileSync(path.join(hqData(), "config.json"), "utf8")) as HqConfig;
  } catch {
    return {};
  }
}

export function writeConfig(cfg: HqConfig) {
  fs.mkdirSync(hqData(), { recursive: true });
  writeJsonAtomic(path.join(hqData(), "config.json"), cfg);
}

function writeJsonAtomic(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

// ---------- businesses ----------

export type InvalidBusiness = { slug: string; errors: string[] };

export function listBusinesses(): { profiles: Profile[]; invalid: InvalidBusiness[] } {
  const profiles: Profile[] = [];
  const invalid: InvalidBusiness[] = [];
  let slugs: string[] = [];
  try {
    slugs = fs.readdirSync(businessesDir(), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return { profiles, invalid };
  }
  for (const slug of slugs.sort()) {
    try {
      const res = validateProfile(JSON.parse(fs.readFileSync(path.join(businessDir(slug), "profile.json"), "utf8")));
      if (res.ok) profiles.push(res.profile);
      else invalid.push({ slug, errors: res.errors });
    } catch (e) {
      invalid.push({ slug, errors: [e instanceof Error ? e.message : "unreadable profile.json"] });
    }
  }
  return { profiles, invalid };
}

export function getProfile(slug: string): Profile | null {
  return listBusinesses().profiles.find((p) => p.slug === slug) ?? null;
}

/** The business to show: an explicit choice if it exists, else config.current, else the first. */
export function resolveCurrent(preferred?: string | null): Profile | null {
  const { profiles } = listBusinesses();
  return (
    profiles.find((p) => p.slug === preferred) ??
    profiles.find((p) => p.slug === readConfig().current) ??
    profiles[0] ??
    null
  );
}

// ---------- vault ----------

/** Where HQ writes inside the vault. An existing vault gets an `HQ/` folder so nothing of its own is touched. */
export function vaultRoot(profile: Profile): string {
  const p = profile.vault.path;
  return path.isAbsolute(p) ? path.join(p, "HQ") : path.join(businessDir(profile.slug), p);
}

const deptLabel = (slug: string) => DEPARTMENTS.find((d) => d.slug === slug)?.label ?? slug;
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-");

// ---------- time ----------

/** "YYYY-MM-DD" and "HHmm" in the business's own timezone. */
export function stamp(profile: Profile, at: Date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: profile.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}${parts.minute}` };
}

// ---------- reviews ----------

const REVIEW_FILE = /^\d{4}-\d{2}-\d{2}-\d{4}\.md$/;

function frontmatter(fields: Record<string, string>) {
  return `---\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n")}\n---\n\n`;
}

export function saveReview(slug: string, markdown: string, at: Date = new Date()) {
  const profile = getProfile(slug);
  if (!profile) throw new Error(`no such business: ${slug}`);
  const { date, time } = stamp(profile, at);
  const dir = path.join(businessDir(slug), "reviews");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${date}-${time}.md`);
  fs.writeFileSync(file, markdown.trim() + "\n");

  const vdir = path.join(vaultRoot(profile), "CEO", "Reviews");
  fs.mkdirSync(vdir, { recursive: true });
  const note = path.join(vdir, `${date} ${time} — CEO review.md`);
  fs.writeFileSync(
    note,
    frontmatter({ type: "ceo-review", business: profile.name, date, created: at.toISOString() }) + markdown.trim() + "\n",
  );
  return { file, note };
}

export function listReviews(slug: string): { file: string; at: string }[] {
  const dir = path.join(businessDir(slug), "reviews");
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => REVIEW_FILE.test(f))
      .sort()
      .reverse()
      .map((f) => ({ file: f, at: fs.statSync(path.join(dir, f)).mtime.toISOString() }));
  } catch {
    return [];
  }
}

export function readReview(slug: string, file?: string): { file: string; markdown: string; at: string } | null {
  const reviews = listReviews(slug);
  const pick = file ? reviews.find((r) => r.file === file) : reviews[0];
  if (!pick) return null;
  return { ...pick, markdown: fs.readFileSync(path.join(businessDir(slug), "reviews", pick.file), "utf8") };
}

// ---------- department plans ----------

export function savePlan(slug: string, dept: string, markdown: string, at: Date = new Date()) {
  const profile = getProfile(slug);
  if (!profile) throw new Error(`no such business: ${slug}`);
  if (!DEPARTMENTS.some((d) => d.slug === dept)) throw new Error(`no such department: ${dept}`);
  const { date, time } = stamp(profile, at);
  const dir = path.join(businessDir(slug), "plans", dept);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${date}-${time}.md`);
  fs.writeFileSync(file, markdown.trim() + "\n");

  const label = safeName(deptLabel(dept));
  const vdir = path.join(vaultRoot(profile), "Departments", label, "Plans");
  fs.mkdirSync(vdir, { recursive: true });
  const note = path.join(vdir, `${date} — ${label} plan.md`);
  fs.writeFileSync(
    note,
    frontmatter({ type: "department-plan", business: profile.name, department: deptLabel(dept), date }) + markdown.trim() + "\n",
  );
  return { file, note };
}

export function latestPlan(slug: string, dept: string): { markdown: string; at: string } | null {
  const dir = path.join(businessDir(slug), "plans", dept);
  try {
    const f = fs.readdirSync(dir).filter((x) => REVIEW_FILE.test(x)).sort().pop();
    if (!f) return null;
    return { markdown: fs.readFileSync(path.join(dir, f), "utf8"), at: fs.statSync(path.join(dir, f)).mtime.toISOString() };
  } catch {
    return null;
  }
}

// ---------- findings marked done ----------

type State = { done: Record<string, string> };

function readState(slug: string): State {
  try {
    return JSON.parse(fs.readFileSync(path.join(businessDir(slug), "state.json"), "utf8")) as State;
  } catch {
    return { done: {} };
  }
}

/** Findings marked done: machine-wide ones plus, if given, the business's own. */
export function doneFindings(slug: string | null): Record<string, string> {
  return { ...(readConfig().done ?? {}), ...(slug ? readState(slug).done : {}) };
}

/** Findings that are about the Mac, not a business: marked done once for all businesses. */
export const MACHINE_FINDINGS = new Set(["hf-telemetry", "musicgen-nc", "backup-password", "skills-only"]);

export function setDone(slug: string | null, id: string, done: boolean) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("bad finding id");
  if (MACHINE_FINDINGS.has(id) || !slug) {
    const cfg = readConfig();
    const d = { ...(cfg.done ?? {}) };
    if (done) d[id] = new Date().toISOString();
    else delete d[id];
    writeConfig({ ...cfg, done: d });
    return;
  }
  if (!getProfile(slug)) throw new Error(`no such business: ${slug}`);
  const s = readState(slug);
  if (done) s.done[id] = new Date().toISOString();
  else delete s.done[id];
  writeJsonAtomic(path.join(businessDir(slug), "state.json"), s);
}

// ---------- connections (a snapshot /hq:connections saves; never holds secrets) ----------

export function readConnections(): ConnectionsSnapshot | null {
  try {
    const res = validateSnapshot(JSON.parse(fs.readFileSync(path.join(hqData(), "connections.json"), "utf8")));
    return res.ok ? res.snapshot : null;
  } catch {
    return null;
  }
}

export function saveConnections(raw: unknown): ConnectionsSnapshot {
  const res = validateSnapshot(raw);
  if (!res.ok) throw new Error(res.error);
  fs.mkdirSync(hqData(), { recursive: true });
  writeJsonAtomic(path.join(hqData(), "connections.json"), res.snapshot);
  return res.snapshot;
}

// ---------- published posts ----------

export type PublishedPost = {
  at: string; // ISO
  platform: string;
  via: string;
  account?: string;
  url?: string; // the live post, as read back from the platform
  postId?: string;
  caption?: string;
  media?: string;
  status: "published" | "scheduled" | "failed";
  note?: string;
};

/** Append one post to the business's log and write a vault note for it. */
export function logPost(slug: string, post: PublishedPost) {
  const profile = getProfile(slug);
  if (!profile) throw new Error(`no such business: ${slug}`);
  if (!post.platform || !post.via || !post.status) throw new Error("platform, via and status are required");
  if (post.status === "published" && !post.url && !post.postId) throw new Error("a published post needs the url or id read back from the platform");
  const at = post.at || new Date().toISOString();
  const entry = { ...post, at };
  fs.appendFileSync(path.join(businessDir(slug), "published.jsonl"), JSON.stringify(entry) + "\n");

  const { date, time } = stamp(profile, new Date(at));
  const dir = path.join(vaultRoot(profile), "Departments", safeName(deptLabel("content")), "Published");
  fs.mkdirSync(dir, { recursive: true });
  const note = path.join(dir, `${date} ${time} — ${safeName(post.platform)}.md`);
  fs.writeFileSync(
    note,
    frontmatter({ type: "published-post", business: profile.name, platform: post.platform, via: post.via, status: post.status, date }) +
      `${post.url ? `**Live:** ${post.url}\n\n` : ""}${post.caption ? `> ${post.caption.replace(/\n/g, "\n> ")}\n\n` : ""}` +
      `${post.media ? `Media: \`${post.media}\`\n` : ""}${post.note ? `\n${post.note}\n` : ""}`,
  );
  return { note };
}

export function listPosts(slug: string, limit = 20): PublishedPost[] {
  try {
    return fs
      .readFileSync(path.join(businessDir(slug), "published.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as PublishedPost)
      .reverse()
      .slice(0, limit);
  } catch {
    return [];
  }
}

// ---------- scaffolding ----------

function copyDir(src: string, dest: string, vars: Record<string, string>) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d, vars);
    else if (!fs.existsSync(d)) {
      const text = fs.readFileSync(s, "utf8");
      fs.writeFileSync(d, text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m));
    }
  }
}

/** The business's Beancount ledger: $HQ_DATA/businesses/<slug>/finance/ledger.beancount. */
export const ledgerPath = (slug: string) => path.join(businessDir(slug), "finance", "ledger.beancount");

/** A starter chart of accounts in the business's currency. Never overwrites. Returns the path. */
export function initLedger(profile: Profile): string {
  const file = ledgerPath(profile.slug);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = profile.createdAt.slice(0, 10);
  const c = profile.currency;
  const accounts = [
    ["Assets:Bank:Operating", c],
    ["Assets:Receivables", c],
    ["Liabilities:CreditCard", c],
    ["Liabilities:SalesTax", c], // GST / VAT collected
    ["Equity:Opening-Balances", ""],
    ["Income:Sales", c],
    ["Expenses:Advertising", c],
    ["Expenses:Commissions", c], // affiliate and partner commissions: the scorecard counts these as acquisition spend
    ["Expenses:Contractors", c],
    ["Expenses:Fees:Bank", c],
    ["Expenses:Hosting", c],
    ["Expenses:Software", c],
  ];
  fs.writeFileSync(
    file,
    `; ${profile.name}: company books in Beancount (plain text). View them in Fava: http://localhost:5055\n` +
      `; One transaction per money movement. Claude can read and append; check with \`bean-check\`.\n\n` +
      `option "title" "${profile.name.replace(/"/g, "'")}"\n` +
      `option "operating_currency" "${c}"\n\n` +
      accounts.map(([a, cur]) => `${d} open ${a}${cur ? ` ${cur}` : ""}`).join("\n") +
      "\n",
  );
  return file;
}

/** Create a business's folder and vault. Never overwrites an existing file. */
export function scaffoldBusiness(profile: Profile) {
  const res = validateProfile(profile);
  if (!res.ok) throw new Error(`invalid profile:\n- ${res.errors.join("\n- ")}`);
  const dir = businessDir(profile.slug);
  if (fs.existsSync(path.join(dir, "profile.json"))) throw new Error(`business already exists: ${profile.slug}`);
  fs.mkdirSync(dir, { recursive: true });
  writeJsonAtomic(path.join(dir, "profile.json"), profile);
  writeJsonAtomic(path.join(dir, "state.json"), { done: {} });

  const root = vaultRoot(profile);
  const vars = {
    business: profile.name,
    offer: profile.offer,
    audience: profile.audience,
    created: profile.createdAt.slice(0, 10),
  };
  copyDir(path.join(hqRoot(), "templates", "vault"), root, vars);

  for (const slug of activeDepartments(profile)) {
    const d = DEPARTMENTS.find((x) => x.slug === slug)!;
    const ddir = path.join(root, "Departments", safeName(d.label));
    fs.mkdirSync(path.join(ddir, "Plans"), { recursive: true });
    fs.mkdirSync(path.join(ddir, "SOPs"), { recursive: true });
    const readme = path.join(ddir, `${safeName(d.label)}.md`);
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(
        readme,
        frontmatter({ type: "department", business: profile.name, department: d.label }) +
          `# ${d.label}\n\n**Stands in for:** ${d.role}\n\n${d.mission}\n\n## Covers\n${d.covers.map((c) => `- ${c}`).join("\n")}\n\n` +
          `## Plans\nWeekly plans from \`/hq:dept ${d.slug}\` land in [[${safeName(d.label)}/Plans|Plans]].\n\n## SOPs\nHow this department does things, one note per process, in \`SOPs/\`.\n`,
      );
    }
  }

  initLedger(profile);

  const cfg = readConfig();
  if (!cfg.current) writeConfig({ ...cfg, current: profile.slug });
  return { dir, vault: root };
}

export function removeBusiness(slug: string) {
  const profile = getProfile(slug);
  if (!profile) throw new Error(`no such business: ${slug}`);
  // Only the HQ folder goes; an external vault is never deleted.
  fs.rmSync(businessDir(slug), { recursive: true, force: true });
  const cfg = readConfig();
  if (cfg.current === slug) writeConfig({ ...cfg, current: undefined });
}
