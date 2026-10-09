# Operations: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** turns plans into weekly work, keeps processes written down, and runs the review
rhythm. It stands in for a chief of staff or ops lead.

**It covers:** planning and priorities, runbooks and process docs, weekly status and reviews, vendor and risk checks.

**Owner's time:** about 30 minutes. **Cost:** free (Composio's Hobby plan allows 100,000 tool calls a month;
Obsidian Sync is paid, so the vault is backed up and synced another way).

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar.
- Backups are set up first (see [IT & Security](/guides/security)): the vault Operations writes to is only
  safe once `/hq:backup` covers it.

## 1. Tools

The department tab is http://127.0.0.1:3150/operations. Tools come in three groups of alternatives; the
department needs **one of each**, not all of them:

| Group | Alternatives |
|---|---|
| Notes and docs | Obsidian, AppFlowy, Docmost |
| Projects and tasks | Plane, Vikunja |
| Automation | Composio, n8n, Activepieces |

Recommended: **Obsidian** (already the business's brain), **Composio** (already how HQ posts), and one
projects tool when there's more work than a weekly plan holds.

### Obsidian

- **What it's for:** the company brain. Decisions, SOPs, session notes and CEO reviews as plain Markdown files.
- **Needed or optional:** needed (the "notes" group; AppFlowy or Docmost would also satisfy it, but HQ writes
  reviews and plans into an Obsidian vault either way).
- **Licence or plan:** free proprietary app. Low lock-in: the vault is plain Markdown folders any editor, git or
  restic can read. Obsidian Sync is paid and excluded; use git or Syncthing instead.
- **Set it up:** run `/hq:add-tool` for Obsidian. It's a Mac app, so the owner downloads the official `.dmg` and
  drags it to /Applications (Claude doesn't script GUI installers). Then Obsidian → *Open folder as vault* → the
  vault folder `/hq:new-business` printed.
- **How HQ checks it:** the app is in /Applications or ~/Applications. Shows "installed".

### AppFlowy

- **What it's for:** docs, wikis and task boards (a Notion alternative), as a desktop app.
- **Needed or optional:** an alternative to Obsidian and Docmost in the notes group. Worth it only if the owner
  prefers boards and databases to Markdown files.
- **Licence or plan:** open source, AGPL-3.0.
- **Set it up:** `/hq:add-tool` for AppFlowy: the owner installs the notarised app from the project's GitHub
  releases after Claude checks the published checksum, and drags it to /Applications.
- **How HQ checks it:** the app is in /Applications. Shows "installed".

### Docmost

- **What it's for:** team wiki and documentation (a Confluence alternative).
- **Needed or optional:** an alternative in the notes group, for when several people need a shared wiki.
  Most owners skip it.
- **Licence or plan:** open source, AGPL-3.0.
- **Set it up:** `/hq:add-tool` for Docmost. It's a server: install from a checksum-verified release or from
  source (no Docker, no Homebrew), bind it to 127.0.0.1, and run it as a `com.hq.*` service.
- **How HQ checks it:** shows **installed** once it's in `~/.local/opt/docmost` (where `/hq:add-tool` puts it);
  `/hq:add-tool` also adds its port so the tab can show it **running**.

### Plane

- **What it's for:** projects, issues, cycles and roadmaps (a Jira or Linear alternative).
- **Needed or optional:** one of the projects group (Plane or Vikunja). Plane suits product work with cycles
  and roadmaps.
- **Licence or plan:** open source, AGPL-3.0.
- **Set it up:** `/hq:add-tool` for Plane. Before choosing it, check its install docs for a route without
  Docker; if there isn't one, choose Vikunja instead.
- **How HQ checks it:** shows **installed** once it's in `~/.local/opt/plane` (where `/hq:add-tool` puts it);
  `/hq:add-tool` also adds its port so the tab can show it **running**.

### Vikunja

- **What it's for:** lightweight to-do lists and kanban.
- **Needed or optional:** one of the projects group. The lighter choice for a small business.
- **Licence or plan:** open source, AGPL-3.0.
- **Set it up:** `/hq:add-tool` for Vikunja: release binary verified against its checksum into
  `~/.local/opt/vikunja/`, data in `~/.local/var/vikunja/`, bound to 127.0.0.1, run as a `com.hq.vikunja`
  service.
- **How HQ checks it:** shows **installed** once the `vikunja` command is on PATH or it's in
  `~/.local/opt/vikunja` (where `/hq:add-tool` puts it); `/hq:add-tool` also adds its port so the tab can show it
  **running**. Either one meets the projects group.

### Composio

- **What it's for:** connects Claude to 500+ apps (Gmail, Sheets, Notion, socials) for cross-app automations.
  It's also the route HQ posts through.
- **Needed or optional:** one of the automation group. Recommended, since Content already uses it.
- **Licence or plan:** free Hobby plan, 100,000 tool calls a month.
- **Set it up:** a web service, so nothing to install. The **owner** signs up and adds the Composio connector
  to Claude themselves; never sign up on their behalf. Then run `/hq:connections` to save HQ's snapshot.
- **How HQ checks it:** a free web service. Shows "web", or "connected" once the snapshot has an active
  Instagram account.

### n8n

- **What it's for:** workflow automation with hundreds of integrations, self-hosted.
- **Needed or optional:** an alternative in the automation group, for automations that should run on a
  schedule without Claude.
- **Licence or plan:** Sustainable Use licence: free to self-host for your own business; can't be resold as a service.
- **Set it up:** nothing to install; it runs with `npx n8n`. Bind it to 127.0.0.1 and turn its telemetry off
  in its settings before first use. If it should stay up, add it as a `com.hq.n8n` service via `/hq:add-tool`.
- **How HQ checks it:** `npx` is on PATH. Shows "on-demand".

### Activepieces

- **What it's for:** no-code automations between apps (a Zapier alternative).
- **Needed or optional:** an alternative in the automation group. Pick one automation tool, not several.
- **Licence or plan:** open core, MIT (the core is what HQ uses; the enterprise folder is not).
- **Set it up:** `/hq:add-tool` for Activepieces, from source or a checksum-verified release, no Docker,
  bound to 127.0.0.1.
- **How HQ checks it:** shows **installed** once it's in `~/.local/opt/activepieces` (where `/hq:add-tool` puts
  it); `/hq:add-tool` also adds its port so the tab can show it **running**.

## 2. Accounts and connections

- **Composio:** the owner's own account. `/hq:connections` saves a snapshot to `$HQ_DATA/connections.json`
  holding connection ids, aliases, names and statuses only, never keys. Connecting a new app gives a sign-in
  link that expires in 10 minutes.
- **Obsidian:** no account needed. Don't buy Sync.
- Nothing else. Self-hosted tools keep their logins in their own config, and the owner keeps those passwords
  in their password manager.

## 3. Skills to use

- **`/hq:setup`**: walks you through setting up HQ, a new business, or any one department, using these guides. Say "set up HQ", "set up the Finance department" or "what's left to set up?".
- `/hq:ceo`: the CEO review. Decisions for the owner (at most five), the week's plan and delegations, saved to
  HQ and the vault. Run it weekly.
- `/hq:dept`: one department's plan for the week (`/hq:dept operations`, `/hq:dept seo` …). Use after a CEO
  review delegates work.
- `/hq:new-business`: connect a business to HQ (profile, data folder, vault, first review).
- `/hq:add-tool`: add a free tool to a department properly: licence check, install without Homebrew or
  Docker, service, live check, test.
- `/hq:playbook`: run one playbook (a workflow HQ can start on its own) and read, apply or drop its plan.
  HQ queues them daily from signals, schedules and the CEO's routing; see [Playbooks](/guides/playbooks).
- `/operations:status-report`: a weekly status report from what happened.
- `/operations:runbook`: write a step-by-step runbook.
- `/operations:process-doc`: document a process (save it in the vault under `Departments/Operations/SOPs/`).
- `/operations:process-optimization`: find waste in a process.
- `/operations:risk-assessment`: rate risks and mitigations.
- `/operations:vendor-review`: assess a vendor before signing up, or review the ones you pay for.
- `/productivity:task-management`: keep the task list honest.
- `/small-business:monday-brief`: a start-of-week brief.
- `/small-business:business-pulse`: a health check across the business.
- `/session-wrap-up`: commit work and write the session up at the end of a working session.

### Runbooks, vendors and risks

The workflow of the same name is how HQ knows Operations' own documents exist and are current:

- **Runbooks:** one per thing that breaks, saved as an Operations playbook whose title starts with "Runbook"
  (`npm run hq -- brain write <slug> -` with `{"type":"playbook","dept":"operations","title":"Runbook: site is down",…}`).
- **Vendor review and risk register:** saved as Operations documents with a title, so documents saved on the same
  day don't overwrite each other in the vault:
  `npm run hq -- save-plan <slug> operations <file> --title "vendor review"` (and `--title "risk register"`,
  `--title "status report"`). Save the week's plan last, at least a minute after the others (files in the data
  folder are named by the minute, so two saves in one minute keep only the second): the department tab shows the newest one.
- It reads **live** with at least one runbook and a vendor review and a risk register from the last 90 days.

## 4. Check it's working

- The department tab shows Obsidian as installed, Composio as web or connected, and n8n as on-demand.
- This prints each tool's state (anything but `missing` counts):

  ```bash
  curl -s http://127.0.0.1:3150/api/status | jq '.departments[] | select(.slug=="operations") | {readiness, grade, tools: [.tools[] | {name, state}]}'
  ```

- `/hq:ceo` runs and saves a review: the newest file in `$HQ_DATA/businesses/<slug>/reviews/` is today's, and
  the CEO tab shows it.
- CEO findings filed under Operations, and how each clears:
  - **No business connected yet:** run `/hq:new-business`.
  - **N departments run on skills alone:** add tools with `/hq:add-tool` in priority order (backups, analytics,
    accounting, then CRM and help desk). A department drops off this list as soon as one of its tools shows
    installed, including Legal (DocuSeal or Documenso) and People (Frappe HR) once they're in `~/.local/opt/`.
    To leave a department on skills alone by choice, mark the finding done.
  - **N expected skills aren't installed:** reinstall the plugin the named skills belong to.
- To dismiss a finding you've chosen to leave: **Mark done** on the CEO tab, or
  `npm run hq -- done <slug> <finding-id>` (`--undo` brings it back).

## Done when

- [ ] Obsidian is installed and the business's vault opens in it.
- [ ] Composio shows web or connected, and `/hq:connections` has saved a snapshot.
- [ ] One projects tool is chosen (or the owner has decided the weekly plan is enough for now).
- [ ] `/hq:ceo` has saved a review and the CEO tab shows it.
- [ ] `/hq:dept operations` has saved this week's plan.
- [ ] The CEO tab has no Operations findings left, or only ones the owner chose to leave.

## Good to know

- One tool per group is enough. More tools means more services to keep up, not a better score.
- Every tool has a live check. A self-hosted tool shows installed once it's in `~/.local/opt/<name>`, the folder
  `/hq:add-tool` installs into, so one that works but reads as missing was installed somewhere else: reinstall it
  with `/hq:add-tool`, don't mark anything done.
- Free tools only: open source first, free proprietary where it's clearly better, nothing that needs a paid
  plan. Installs are from checksum-verified or notarised releases or source, never `curl | sh`, no Homebrew,
  no Docker on the Mac. Servers bind to 127.0.0.1 and run as launchd services:
  `npm run hq -- services add-defaults && npm run hq -- services install`, checked with
  `npm run hq -- services status`.
- Secrets go in the login Keychain, typed by the owner
  (`security add-generic-password -a "$USER" -s <name> -w`, which prompts), never in chat or a repo.
- Automations that send, post or pay need the owner's explicit yes before they're switched on.
- `npm run hq -- doctor` is the health check for HQ itself.
