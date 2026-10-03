# Product & Engineering: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** builds and ships the product, keeps it up, and decides what's next. It stands in
for an engineering lead and product manager.

**It covers:** specs and roadmap; build, review, test, deploy; uptime and incidents; infrastructure.

**Owner's time:** about 45 minutes, mostly approving installs and macOS permissions. **Cost:** free (Lume's
macOS VM images take about 30 GB of disk each).

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar.
- Backups are set up (see [IT & Security](/guides/security)), so service databases are staged into the nightly backup.
- PostgreSQL, Redis and Temporal arrive with Postiz. If Content is set up (see [Content](/guides/content)),
  they're already running; HQ only creates their services once Postiz is installed.

## 1. Tools

The department tab is http://127.0.0.1:3150/engineering. Seven tools are needed: Git + Git LFS, PostgreSQL,
Redis 7.4, Temporal, Playwright, Cua Driver and Uptime Kuma. Lume, Sentry (self-hosted), Grafana, Prometheus
and camofox-browser are optional and never count against readiness. Every server here binds to 127.0.0.1.

### Git + Git LFS

- **What it's for:** version control, plus large files kept out of the repository's history.
- **Needed or optional:** needed.
- **Licence or plan:** open source, MIT (Git LFS).
- **Set it up:** Git comes with Apple's Command Line Tools (`xcode-select --install`, approved by the owner).
  `/hq:add-tool` for Git LFS: the release from GitHub, checked against its published checksums, linked into
  `~/.local/bin/git-lfs`. Then `git lfs install` once.
- **How HQ checks it:** `git-lfs` on PATH. Shows "installed".

### PostgreSQL

- **What it's for:** databases. Postiz and Listmonk share one on :5432; Twenty CRM has its own on :5433. Both
  are cold-copied into the nightly backup.
- **Needed or optional:** needed.
- **Licence or plan:** open source, PostgreSQL licence.
- **Set it up:** installed with Postiz (see [Content](/guides/content)) under `~/.local/opt/pg17/`, data in
  `~/.local/var/postiz/pg`. Then `npm run hq -- services add-defaults && npm run hq -- services install` adds
  `com.hq.postiz.postgres` on :5432 (and `com.hq.twenty.postgres` on :5433 once Twenty is installed for Sales).
- **How HQ checks it:** port 5432 answering ("running"), else the binary at
  `~/.local/opt/pg17/package/native/bin/postgres` ("installed").

### Redis 7.4

- **What it's for:** cache and queues. Postiz uses :6379; Twenty has its own on :6380.
- **Needed or optional:** needed.
- **Licence or plan:** RSALv2 / SSPL: source-available and free to self-host. Valkey (BSD) is the drop-in
  open-source fork if it's ever needed.
- **Set it up:** installed with Postiz into `~/.local/opt/redis/`. `services add-defaults` + `services install`
  adds `com.hq.postiz.redis` (and `com.hq.twenty.redis` with Twenty).
- **How HQ checks it:** port 6379 answering ("running"), else `~/.local/opt/redis/bin/redis-server` ("installed").

### Temporal

- **What it's for:** durable background jobs. It runs Postiz's scheduler.
- **Needed or optional:** needed.
- **Licence or plan:** open source, MIT.
- **Set it up:** installed with Postiz into `~/.local/opt/temporal/`. `services add-defaults` + `services install`
  adds `com.hq.postiz.temporal` (server :7233, UI http://localhost:8233).
- **How HQ checks it:** port 7233 answering ("running"), else `~/.local/opt/temporal/temporal` ("installed").

### Playwright

- **What it's for:** browser automation and end-to-end tests.
- **Needed or optional:** needed.
- **Licence or plan:** open source, Apache-2.0.
- **Set it up:** nothing to install; it runs with `npx playwright`. Download a browser once with
  `npx playwright install chromium`.
- **How HQ checks it:** `npx` on PATH. Shows "on-demand".

### Cua Driver

- **What it's for:** lets Claude operate native Mac apps and browsers in the background (no mouse or focus
  stolen) through its MCP server: setup chores in apps with no API, and checking HQ's own screens as rendered.
- **Needed or optional:** needed.
- **Licence or plan:** open source, MIT.
- **Set it up:** `/hq:add-tool` for Cua Driver: the notarised release from GitHub, checked against its checksum,
  never via `curl | sh`, on the stable channel. Turn telemetry and update checks off. The owner grants it
  Accessibility and Screen Recording in System Settings → Privacy & Security, then it's registered as an MCP
  server for Claude Code.
- **How HQ checks it:** `cua-driver` on PATH, or `/Applications/CuaDriver.app`. Shows "installed".

### Lume

- **What it's for:** disposable macOS and Linux VMs on Apple Silicon: try untrusted apps, take product
  screenshots from a clean demo, rehearse a fresh install.
- **Needed or optional:** optional. Install it when there's something to sandbox.
- **Licence or plan:** open source, MIT. A macOS VM image is about 30 GB; Apple's licence allows two macOS VMs per Mac.
- **Set it up:** `/hq:add-tool` for Lume, from the same project's checksum-verified release.
- **How HQ checks it:** `lume` on PATH. Shows "installed".

### Uptime Kuma

- **What it's for:** uptime monitoring and alerts for every site the business runs.
- **Needed or optional:** needed.
- **Licence or plan:** open source, MIT.
- **Set it up:**
  1. `/hq:add-tool` for Uptime Kuma, from source into `~/.local/opt/uptime-kuma/`.
  2. `npm run hq -- services add-defaults && npm run hq -- services install` adds `com.hq.uptime-kuma` on
     127.0.0.1:3001, data in `~/.local/var/uptime-kuma/`. Its SQLite database is copied into the nightly backup.
  3. The owner opens http://localhost:3001 and creates the admin login (kept in their password manager).
  4. Add one monitor per site in the business profile's `sites`. Alerts are the owner's choice of channel.
- **How HQ checks it:** port 3001 answering ("running"), else `~/.local/opt/uptime-kuma/server/server.js` ("installed").

### Sentry (self-hosted)

- **What it's for:** error tracking with stack traces.
- **Needed or optional:** optional, for when there's a fleet to watch. Self-hosting needs Docker and about
  16 GB of RAM, and HQ runs no Docker on the Mac, so leave it unless it runs on another machine.
- **Licence or plan:** FSL-1.1, free to self-host.
- **Set it up:** not on this Mac.
- **How HQ checks it:** the folder `~/.local/opt/sentry` (**installed**). It isn't set up on this Mac, so it shows
  **missing**; it's optional, so that doesn't count.

### Grafana

- **What it's for:** dashboards over metrics and logs.
- **Needed or optional:** optional, with Prometheus, for when there's a fleet to watch.
- **Licence or plan:** open source, AGPL-3.0.
- **Set it up:** if wanted, `/hq:add-tool` for Grafana, bound to 127.0.0.1 as a `com.hq.*` service.
- **How HQ checks it:** shows **installed** once the `grafana` command is on PATH or it's in `~/.local/opt/grafana`
  (where `/hq:add-tool` puts it); `/hq:add-tool` also adds its port so the tab can show it **running**. Until then
  it shows **missing**; it's optional, so that doesn't count.

### Prometheus

- **What it's for:** metrics collection.
- **Needed or optional:** optional, with Grafana.
- **Licence or plan:** open source, Apache-2.0.
- **Set it up:** if wanted, `/hq:add-tool` for Prometheus (a single release binary), bound to 127.0.0.1.
- **How HQ checks it:** shows **installed** once the `prometheus` command is on PATH or it's in
  `~/.local/opt/prometheus` (where `/hq:add-tool` puts it); `/hq:add-tool` also adds its port so the tab can show
  it **running**. Until then it shows **missing**; it's optional, so that doesn't count.

### camofox-browser

- **What it's for:** an anti-detect browser server for agents. Researched, not installed.
- **Needed or optional:** optional, and not for production scraping.
- **Licence or plan:** open source, MIT.
- **Set it up:** don't, without the owner's yes. Its crash reports go to public GitHub issues by default, and
  it binds to all interfaces without a key, which breaks HQ's 127.0.0.1 rule.
- **How HQ checks it:** the folder `~/.local/opt/camofox-browser` (**installed**). Until it's there it shows
  **missing**; it's optional, so that doesn't count.

## 2. Accounts and connections

None. Everything here is local. Logins created inside a tool (Uptime Kuma's admin) stay with the owner, in
their password manager. Database passwords stay in each tool's own config or the Keychain, never in
`services.json` or a plist.

## 3. Skills to use

- `/hq:services`: see what's running, start, stop, install, and fix a service that won't stay up.
- `/product-management:write-spec`: write a spec before building.
- `/product-management:roadmap-update`: update the roadmap.
- `/product-management:sprint-planning`: plan a sprint.
- `/engineering:code-review`: review a change.
- `/engineering:debug`: debug a problem.
- `/engineering:testing-strategy`: decide what to test.
- `/engineering:deploy-checklist`: run through it before you ship.
- `/engineering:incident-response`: when it breaks.
- `/engineering:tech-debt`: decide what to pay down.
- `/superpowers:systematic-debugging`: find the root cause before fixing.
- `/superpowers:test-driven-development`: write the test first.
- `/anthropic-skills:hot-tier-mismap-audit`: audits a price-comparison board's per-source rows for mapping
  bugs. Only relevant if the product has such a board; otherwise ignore it.

## 4. Check it's working

- The department tab shows PostgreSQL, Redis 7.4, Temporal and Uptime Kuma as running; Git + Git LFS and
  Cua Driver as installed; Playwright as on-demand.
- `npm run hq -- services status` shows `com.hq.postiz.postgres` (`:5432 up`), `com.hq.postiz.redis`
  (`:6379 up`), `com.hq.postiz.temporal` (`:7233 up`) and `com.hq.uptime-kuma` (`:3001 up`), all `running`.
- `git lfs version` and `npx playwright --version` print versions.
- http://localhost:3001 shows a green monitor for each site.
- No CEO finding is filed under Product & Engineering. Watch for **Postiz isn't running** (filed under Content):
  it usually means one of these services is down. Clear it with `npm run hq -- services start` or `/hq:services`.
  **A service's data didn't make it into the last backup** (IT & Security) points at a database here; see
  [IT & Security](/guides/security).

## Done when

- [ ] The seven needed tools show anything but missing on the department tab.
- [ ] `npm run hq -- services status` shows every `com.hq.*` service here running with its port up.
- [ ] Uptime Kuma has an admin login and a monitor for every site in the profile.
- [ ] Cua Driver has its permissions, and its telemetry and update checks are off.
- [ ] `/hq:dept engineering` has saved this week's plan.

## Good to know

- A service that won't stay up: `tail -50 $HQ_DATA/logs/<label>.log`, then `/hq:services`. Exit 78 with an
  empty log means launchd couldn't open the log file; run `npm run hq -- services install` again.
- Cua Driver can see and control the whole screen. Anything done on the owner's accounts needs their yes per
  action. Never drive Instagram or TikTok to post or DM.
- Nothing is deployed, posted, sent or paid without the owner's explicit yes.
- Free tools only, installed from checksum-verified or notarised releases or source: never `curl | sh`, no
  Homebrew, no Docker on the Mac. Servers bind to 127.0.0.1 and run as launchd services. Turn telemetry off
  wherever a tool has it.
- `npm run hq -- doctor` is the health check for HQ itself.
