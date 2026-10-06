// The CEO's standing rules: turn live facts into a ranked list of what needs
// doing, each with the concrete next step. A pure function of its inputs, so
// the page, the API, the tests and the /hq:ceo skill all see the same list.
// Nothing here names a particular business: business specifics come from the
// profile. Client-safe: no node imports.

import type { Profile } from "./profile";
import { recentChanges, shortUrl, watchTargets } from "./competitors";
import { briefRunFinding } from "./competitor-brief";
import { channelStatuses } from "./publishing";
import { LEVERS, type Lever } from "./workflows";
import { formatValue } from "./scorecard-metrics";
import { addMonths, burnText, jumpText } from "./unit-economics";
import type { DeptStatus, Finding, HostFacts, Severity } from "./types";

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, attention: 1, decision: 2, info: 3 };

const OFFSITE = /^(s3|b2|sftp|rest|azure|gs|rclone|swift):/;

const ICLOUD = "/Library/Mobile Documents/com~apple~CloudDocs/";

/** A restic repository only counts as a backup if it isn't only on this Mac's disk:
 *  a cloud backend, an external drive, or iCloud Drive (which syncs off the Mac). */
export function backupIsExternal(repository: string | undefined): boolean {
  if (!repository) return false;
  return OFFSITE.test(repository) || repository.startsWith("/Volumes/") || repository.includes(ICLOUD);
}

const DAY = 24 * 60 * 60 * 1000;

export function buildFindings(
  depts: DeptStatus[],
  f: HostFacts,
  profile: Profile | null,
  done: Record<string, string> = {},
  now: Date = new Date(),
): Finding[] {
  const out: Finding[] = [];
  const dept = (slug: string) => depts.find((d) => d.slug === slug);
  const live = (slug: string) => dept(slug)?.toolsLive ?? 0;

  // ---- The business itself ----
  if (!profile) {
    out.push({
      id: "no-business",
      severity: "decision",
      dept: "operations",
      title: "No business connected yet",
      detail: "HQ is ready but empty. Everything below is about this Mac; connect a business to get plans and reviews for it.",
      action: "Run `/hq:new-business` in Claude Code. It asks a few questions, then builds the profile and an Obsidian vault.",
    });
  }

  // ---- Backups: nothing else matters if the Mac dies tonight ----
  const external = backupIsExternal(f.backup.repository);
  const age = f.backup.lastSnapshotAt ? now.getTime() - Date.parse(f.backup.lastSnapshotAt) : Infinity;
  if (!f.timeMachine && !external) {
    out.push({
      id: "no-backups",
      severity: "critical",
      dept: "security",
      title: f.backup.repository ? "HQ's backup is on this Mac's own disk" : "HQ's data has no backup",
      detail: f.backup.repository
        ? `restic works (repository ${f.backup.repository}), but a backup on the same disk dies with the disk.`
        : "No restic repository for $HQ_DATA (profiles, reviews, plans, vaults), and no Time Machine. Other projects' own backup scripts don't cover it.",
      action: "Run `npm run hq -- backup init` (defaults to an encrypted repository in iCloud Drive), then `/hq:backup`.",
    });
  } else if (external && age > 2 * DAY) {
    out.push({
      id: "backup-stale",
      severity: "attention",
      dept: "security",
      title: "Last backup is more than two days old",
      detail: `Last snapshot: ${f.backup.lastSnapshotAt ?? "never"}.`,
      action: "Run `/hq:backup`, and check the backup service with `npm run hq -- services status`.",
    });
  }
  if (f.backup.repository) {
    out.push({
      id: "backup-password",
      severity: "decision",
      dept: "security",
      title: "Save the backup password somewhere off this Mac",
      detail: "The restic password lives only in this Mac's login Keychain. If the Mac dies, the backup can't be opened without it.",
      action: "Run `security find-generic-password -s hq-restic -w` in Terminal, store the output in your password manager, then mark this done.",
    });
  }
  if (f.backup.repository && f.backup.restoreTestOk === false) {
    out.push({
      id: "restore-failed",
      severity: "critical",
      dept: "security",
      title: "The last restore test failed",
      detail: "A backup you can't restore is not a backup.",
      action: "Run `/hq:restore` in test mode and fix what it reports.",
    });
  }

  if (f.backup.stagingFailed?.length) {
    out.push({
      id: "service-data-not-staged",
      severity: "attention",
      dept: "security",
      title: "A service's data didn't make it into the last backup",
      detail: `Before each backup, live databases are copied somewhere consistent. This failed for: ${f.backup.stagingFailed.join("; ")}. The last good copy is still backed up.`,
      action: "Run `npm run hq -- backup run` and read the staging lines; `npm run hq -- services status` shows whether the service came back.",
    });
  }

  // ---- Machine services ----
  // Only a problem when this business posts something through Postiz; HQ's own route is Composio.
  const usesPostiz = profile ? channelStatuses(profile.channels, f.connections, f.postizUp).some((c) => c.via === "postiz") : false;
  if (f.postizInstalled && !f.postizUp && usesPostiz) {
    out.push({
      id: "postiz-down",
      severity: "attention",
      dept: "content",
      title: "Postiz isn't running",
      detail: "A channel of this business posts through Postiz, and nothing scheduled there goes out while it's down.",
      action: "Run `npm run hq -- services start`, or `/hq:services` to see which piece is down.",
    });
  }

  // ---- Channels: how each of the business's platforms will be posted to ----
  if (profile) {
    const channels = channelStatuses(profile.channels, f.connections, f.postizUp);
    if (channels.some((c) => c.state === "unknown")) {
      out.push({
        id: "connections-unknown",
        severity: "attention",
        dept: "content",
        title: "HQ doesn't know which accounts are connected",
        detail: "There's no connection snapshot yet, so channel status can't be shown.",
        action: "Run `/hq:connections` in Claude Code. It reads Composio's connection list (no keys) and saves it for HQ.",
      });
    }
    for (const c of channels) {
      if (c.state !== "not-connected" && !(c.state === "via-postiz" && !f.postizUp)) continue;
      const how =
        c.via === "woopsocial"
          ? "Create a free WoopSocial account and connect the account there, then add WoopSocial's API key to the `woop_social` toolkit in Composio yourself (never paste it into chat). Then run `/hq:connections`."
          : c.via === "composio"
            ? `Run \`/hq:connections connect ${c.toolkit}\`: it gives you a Composio sign-in link (valid 10 minutes). Then the snapshot updates.`
            : "Start Postiz (`/hq:services`) and connect the channel inside Postiz.";
      out.push({
        id: `connect-${c.platform}`,
        severity: "decision",
        dept: "content",
        title: `Connect ${c.label} for ${profile.name} (${c.via})`,
        detail: `${c.handle}: ${c.detail}.`,
        action: how,
      });
    }
  }
  if (f.connections && Date.now() - Date.parse(f.connections.checkedAt) > 7 * DAY) {
    out.push({
      id: "connections-stale",
      severity: "info",
      dept: "content",
      title: "The connection snapshot is over a week old",
      detail: `Last checked ${f.connections.checkedAt.slice(0, 10)}. Connections can expire or be revoked.`,
      action: "Run `/hq:connections` to refresh it.",
    });
  }

  // ---- Market & Competitors ----
  const intelActive = depts.some((d) => d.slug === "competitors");
  if (profile && intelActive) {
    const comps = profile.competitors ?? [];
    const targets = watchTargets(profile);
    const rows = f.intel.rows;
    if (!comps.length) {
      out.push({
        id: "no-competitors",
        severity: "decision",
        dept: "competitors",
        title: `List ${profile.name}'s competitors`,
        detail: "Nothing is watched until the profile names who the business competes with.",
        action: "Run `/hq:competitors setup`: it proposes competitors from public research for you to confirm.",
      });
    } else if (targets.length && !f.intel.watcherUp) {
      out.push({
        id: "watcher-down",
        severity: "attention",
        dept: "competitors",
        title: "The competitor watcher isn't running",
        detail: `${targets.length} competitor page(s) aren't being checked.`,
        action: "Run `npm run hq -- services start` (changedetection.io on :5010).",
      });
    } else if (rows) {
      const missing = targets.filter((t) => !rows.some((r) => r.url === t.url));
      if (missing.length) {
        out.push({
          id: "competitors-unsynced",
          severity: "attention",
          dept: "competitors",
          title: `${missing.length} competitor page(s) aren't being watched yet`,
          detail: missing.map((m) => m.title).join(", "),
          action: `Run \`npm run hq -- competitors sync ${profile.slug}\`.`,
        });
      }
      const changed = recentChanges(rows, 7, now);
      if (changed.length) {
        out.push({
          id: "competitors-changed",
          severity: "attention",
          dept: "competitors",
          title: `${changed.length} competitor page(s) changed this week`,
          since: changed.map((c) => c.lastChanged!).sort().at(-1),
          detail: changed.map((c) => `${c.competitor}: ${shortUrl(c.url)}`).join(", "),
          action: "Run `/hq:competitors` to read the changes and brief what they mean for Content, SEO, Ads and Sales.",
        });
      }
      const failing = rows.filter((r) => r.error);
      if (failing.length) {
        out.push({
          id: "competitors-unreachable",
          severity: "info",
          dept: "competitors",
          title: `${failing.length} competitor page(s) can't be fetched`,
          detail: failing.map((r) => `${shortUrl(r.url)}: ${r.error}`).join("; "),
          action: "Some sites block automated visitors. Watch a different public page, or check it by hand in the weekly sweep.",
        });
      }
    }
    if (comps.length && (!f.intel.lastBriefAt || now.getTime() - Date.parse(f.intel.lastBriefAt) > 7 * DAY)) {
      out.push({
        id: "competitor-brief-due",
        severity: "info",
        dept: "competitors",
        title: "No competitor brief this week",
        detail: f.intel.lastBriefAt ? `Last brief ${f.intel.lastBriefAt.slice(0, 10)}.` : "No brief yet.",
        action: "Run `/hq:competitors`: a sweep of changes, content and ads, saved as the department's weekly brief.",
      });
    }
    const runFailed = comps.length ? briefRunFinding(f.intel.lastRun, f.intel.lastBriefAt, profile.slug) : null;
    if (runFailed) out.push(runFailed);
  }

  // ---- Owner decisions about the machine ----
  if (!f.telemetryOptOut) {
    out.push({
      id: "hf-telemetry",
      severity: "decision",
      dept: "content",
      title: "HyperFrames still reports usage to HeyGen",
      detail: "The CLI sends render details to PostHog unless opted out. Recommendation: turn it off.",
      action: "Add `export HYPERFRAMES_NO_TELEMETRY=1` to ~/.zshrc.",
    });
  }

  // ---- Gaps in the kit ----
  const gscViaComposio = Boolean(
    f.connections?.toolkits.google_search_console?.accounts.some((a) => a.status.toLowerCase() === "active"),
  );
  if (!f.gcloud && !gscViaComposio) {
    out.push({
      id: "no-gcloud",
      severity: "attention",
      dept: "seo",
      title: "No live Search Console data",
      detail: "The seo-analysis and seo-drift skills fall back to crawl-only audits without Google's gcloud CLI.",
      action: "Connect Search Console in Composio (`/hq:connections connect google_search_console`), or install the gcloud CLI and sign in.",
    });
  }

  // Dashboards don't count: something has to collect the traffic.
  const collectors = ["Umami", "Plausible CE", "PostHog"];
  // A hosted collector recorded in the profile (Umami Cloud, Plausible's hosted plan …) counts too.
  if (!profile?.analytics && !dept("data")?.tools.some((t) => collectors.includes(t.name) && t.state !== "missing")) {
    out.push({
      id: "no-analytics",
      severity: "attention",
      dept: "data",
      title: "No analytics tool is running",
      detail: "Growth, SEO and ads can't be judged without traffic numbers.",
      action: profile?.sites.length
        ? `Self-host Umami (MIT, lightest), or use Umami Cloud's free tier, and add its script to ${profile.sites[0]}; then record it in the profile as "analytics": {"provider": "umami-cloud", "id": "<website id>"}.`
        : "Self-host Umami (MIT, lightest), or use Umami Cloud's free tier, and add its script to each site; then record it in the profile's \"analytics\".",
    });
  }

  if (live("finance") === 0) {
    out.push({
      id: "no-books",
      severity: "attention",
      dept: "finance",
      title: "No accounting system",
      detail: "The finance skills work best reading real books.",
      action: "Start with Beancount + Fava (plain text, Claude can read it); move to ERPNext if you need invoicing and payroll.",
    });
  }

  out.push({
    id: "musicgen-nc",
    severity: "info",
    dept: "content",
    title: "MusicGen music is non-commercial",
    detail: "The model weights are CC BY-NC 4.0. Fine for drafts, not for videos that earn money.",
    action: "Use licensed or public-domain music for anything monetised.",
  });

  const skillsOnly = depts.filter((d) => d.grade === "skills-only").map((d) => d.label);
  if (skillsOnly.length > 0) {
    out.push({
      id: "skills-only",
      severity: "info",
      dept: "operations",
      title: `${skillsOnly.length} departments run on skills alone`,
      detail: `${skillsOnly.join(", ")}: the skills work from pasted text or files, with no tool behind them.`,
      action: "Add tools with `/hq:add-tool` in priority order: backups, analytics, accounting, then CRM and help desk as volume grows.",
    });
  }

  // ---- Finance: income syncs from billing; costs must be recorded too, or every margin reads too high ----
  const fin = f.finance;
  if (profile && fin && fin.income90 > 0 && fin.costs90 === 0) {
    out.push({
      id: "finance-costs-missing",
      severity: "attention",
      dept: "finance",
      title: "The books have income but no costs",
      detail: `${fin.synced ? "Income syncs from billing every day" : "The ledger has income"}, but no costs are recorded for the last 90 days, so margin, cost to win and payback all read better than they are.`,
      action: `If the business already keeps its books in Xero, connect it read-only and import the monthly costs (Finance guide, "Connect your accounting system"). Otherwise add the running costs (hosting, software, ads, contractors) to its ledger, or ask \`/hq:dept finance\` to set them up as monthly entries. The Finance tab shows money in and out.`,
    });
  }
  if (profile && fin?.costs?.connected && fin.costs.failed) {
    out.push({
      id: "finance-costs-refresh-failed",
      severity: "attention",
      dept: "finance",
      title: "The monthly costs import failed",
      detail: `HQ couldn't refresh the running costs from the accounting system${fin.costs.why ? `: ${fin.costs.why}` : "."} ${fin.costs.lastOk ? `The costs in the ledger are from ${fin.costs.lastOk.slice(0, 10)}.` : "No costs have been imported yet."}`,
      action: `Run \`npm run hq -- finance costs refresh ${profile.slug} --force\` and read its error. If the connection lapsed, reconnect it with \`/hq:connections connect xero\`; the daily \`com.hq.finance\` job tries again the next day.`,
    });
  }

  // ---- Unit economics: a cost line that jumped, and burn well above revenue (lib/unit-economics.ts) ----
  // Each reopens when a newer month is worked out: `since` is the start of the month after the one it reads.
  const unit = profile ? fin?.unit : null;
  if (profile && unit) {
    const since = `${addMonths(unit.latest, 1)}-01T00:00:00.000Z`;
    for (const j of unit.jumps) {
      const t = jumpText(j, fin!.currency);
      out.push({
        id: `cost-jump-${j.account.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
        severity: "attention",
        dept: "finance",
        title: t.title,
        since,
        detail: t.detail,
        action: `Check what's behind it in Fava (localhost:5055) or the accounting system: a one-off, a price rise, or a cost that belongs to another business (take that out with finance/costs-adjustments.json). \`npm run hq -- finance unit-economics ${profile.slug}\` shows every line.`,
      });
    }
    if (unit.burn) {
      const t = burnText(unit.burn, fin!.currency);
      out.push({
        id: "unit-economics-burn",
        severity: "attention",
        dept: "finance",
        title: t.title,
        since,
        detail: t.detail,
        action: `Run the Unit economics check workflow: \`npm run hq -- finance unit-economics ${profile.slug} --save\`, then decide which costs to cut and the payback limit for acquisition spend.`,
      });
    }
  }

  // ---- Weekly social plan: a post HQ gave up on is the owner's to fix (it is never retried on its own) ----
  for (const p of profile ? f.social?.failed ?? [] : []) {
    out.push({
      id: `social-post-failed-${p.id}`,
      severity: "attention",
      dept: "content",
      title: `HQ couldn't post ${p.day}'s ${p.network} ${p.format}`,
      detail: `It failed ${p.attempts} time${p.attempts === 1 ? "" : "s"} and HQ stopped trying${p.error ? `: ${p.error}` : "."} Nothing went out twice: every attempt looked for the post on the account first.`,
      action: `Fix the cause, then \`npm run hq -- social approve ${profile!.slug} ${p.id}\` to let HQ try again (attempts start over), or post it by hand and \`npm run hq -- social posted ${profile!.slug} ${p.id} <link>\`. Content & Social shows the error.`,
    });
  }

  // ---- Analytics: the numbers each workflow is judged by (lib/analytics.ts) ----
  const an = f.analytics;
  if (profile && an) {
    const share = `${an.measured} of ${an.applicable} numbers and ${an.workflowsMeasured} of ${an.workflows} workflows are measured`;
    if (an.connected && (an.failed || an.stale)) {
      out.push({
        id: "analytics-stale",
        severity: "attention",
        dept: "data",
        title: an.failed ? "The last analytics refresh failed" : "The analytics are out of date",
        detail: `${an.failed ? "The analytics adapter errored or reported something HQ rejected, so the Data & Analytics tab shows its previous readings." : "No fresh adapter readings for more than 36 hours."} ${share}.`,
        action: `Run \`npm run hq -- analytics refresh ${profile.slug}\` and read its error; the daily \`com.hq.scorecard\` job runs it after the scorecard.`,
      });
    } else if (!an.connected && !an.demo) {
      out.push({
        id: "analytics-none",
        severity: "info",
        dept: "data",
        title: "Most workflow numbers are invisible",
        detail: `There is no analytics adapter, so only the scorecard and HQ's own records are measured: ${share}.`,
        action: `Write a private read-only adapter and point analytics-connection.json at it (docs/guides/analytics.md), then \`npm run hq -- analytics refresh ${profile.slug}\`. \`npm run hq -- analytics show ${profile.slug} --missing\` lists what each number needs.`,
      });
    }
    for (const a of an.alarms ?? []) {
      out.push({
        id: `analytics-alarm-${a.id}`,
        severity: "attention",
        dept: a.owner,
        title: `${a.label}: ${a.value}`,
        detail: `${a.note}. It should read zero; it's one of the numbers ${a.workflow ? `the ${a.workflow} workflow` : "a workflow"} is judged by.`,
        action: a.action,
      });
    }
  }

  // ---- Growth scorecard: the CEO routes by lever, so it needs the lever numbers ----
  const card = f.scorecard;
  if (profile && card) {
    if (!card.connected && !card.demo) {
      out.push({
        id: "scorecard-none",
        severity: "decision",
        dept: "data",
        title: "HQ can't see this business's growth",
        detail: "There is no scorecard adapter, so new customers, churn and upgrades are invisible and the weekly review can't pick the weakest lever.",
        action: `Write a private read-only adapter in this business's HQ data folder and point scorecard-connection.json at it (docs/guides/scorecard.md), then run \`npm run hq -- scorecard refresh ${profile.slug}\`.`,
      });
    } else if (card.stale || card.failed) {
      out.push({
        id: "scorecard-stale",
        severity: "attention",
        dept: "data",
        title: card.currencyChanged ? "The scorecard's currency no longer matches the profile" : card.failed ? "The last scorecard refresh failed" : card.hasSnapshot === false ? "The scorecard has never been refreshed" : "The scorecard is out of date",
        detail: card.currencyChanged
          ? `The kept scorecard is in ${card.currencyChanged} but the profile now says ${profile.currency}, so it is hidden. Update the adapter to report ${profile.currency}.`
          : card.failed
          ? card.hasSnapshot === false ? "The adapter errored or reported something HQ rejected, and there is no earlier snapshot to show." : "The adapter errored or reported something HQ rejected; the card still shows the previous snapshot."
          : card.hasSnapshot === false ? "The adapter is connected but hasn't reported yet, so this week's review has no lever numbers." : "No fresh numbers for more than 36 hours, so this week's review would read old figures.",
        action: `Run \`npm run hq -- scorecard refresh ${profile.slug}\` and read its error; check that \`com.hq.scorecard\` is installed with \`npm run hq -- services status\`.`,
      });
    }
    if (card.weakest) {
      const w = card.weakest;
      const owner = depts.find((d) => d.slug === w.owner)?.label ?? w.owner;
      out.push({
        id: "weakest-lever",
        severity: "decision",
        dept: w.owner,
        title: `Weakest lever this week: ${LEVERS[w.lever as Lever]?.name ?? w.lever}, ${w.label.toLowerCase()} ${formatValue(w.unit as "rate", w.value, profile.currency)}`,
        detail: `${w.label} is ${w.why}. The workflow that moves it is "${w.workflow}", owned by ${owner}.`,
        action: `Tell Claude "run the ${w.workflow} workflow" (Workflows tab). Log what you try with \`npm run hq -- experiment add ${profile.slug} "<hypothesis>" --metric ${w.metric}\`, and check the number next week.`,
      });
    }
    if (card.mismatch && card.mismatch > 0) {
      out.push({
        id: "scorecard-records-mismatch",
        severity: "attention",
        dept: "data",
        title: `${card.mismatch} paying member${card.mismatch === 1 ? "" : "s"} disagree between billing and our records`,
        detail: "The payment provider or app store says one thing and the membership records say another. A member recorded wrongly may have lost access they paid for, or kept access they didn't.",
        action: "Read the Billing vs our records breakdown on the scorecard, fix each member's record, then check the billing webhooks for the cause.",
      });
    }
    const byLever = new Map<string, { label: string; note: string }[]>();
    for (const m of card.missing) byLever.set(m.lever, [...(byLever.get(m.lever) ?? []), m]);
    for (const [lever, ms] of byLever) {
      out.push({
        id: `scorecard-missing-${lever}`,
        severity: "info",
        dept: "data",
        title: `${ms.length} ${LEVERS[lever as Lever]?.name ?? lever} number${ms.length === 1 ? "" : "s"} can't be measured yet`,
        detail: ms.map((m) => `${m.label}: ${m.note || "no source"}`).join(" · "),
        action: "Each fix is named above. Most need history to build up, an event the product doesn't record yet, or spend entered in the ledger.",
      });
    }
  }

  const missingSkills = depts.flatMap((d) => d.skills.filter((s) => !s.ready).map((s) => `${s.id} (${d.label})`));
  if (missingSkills.length > 0) {
    out.push({
      id: "missing-skills",
      severity: "attention",
      dept: "operations",
      title: `${missingSkills.length} expected skills aren't installed`,
      detail: missingSkills.join(", "),
      action: "Reinstall the plugin they belong to, or remove them from lib/registry.ts.",
    });
  }

  return out
    // Done hides a finding until evidence newer than the moment it was marked done arrives.
    .filter((x) => !done[x.id] || (x.since !== undefined && Date.parse(x.since) > Date.parse(done[x.id])))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
