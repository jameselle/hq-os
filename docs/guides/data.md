# Data & Analytics: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** measures everything, builds the dashboards, and answers "is it working?". It also
owns the **growth scorecard**, the numbers the CEO's weekly review starts from.

**It covers:** web and product analytics; dashboards; ad-hoc analysis and SQL; tracking plans.

**Owner's time:** about 30 minutes for the tools, plus about 10 minutes for each billing source (Stripe, the App
Store) and whatever connecting your own records takes. **Cost:** free. Every tool is open source or a free web
service, and the billing keys are free to create.

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar.
- For **cost to win** on the scorecard, the business's books are set up and ad spend is posted to them (see
  [Finance](/guides/finance)).
- The business's public site, if it has one, is in its profile (`sites`), so analytics knows what to measure.

## 1. Tools

The department needs one **web-analytics** tool (Umami, Plausible CE or PostHog), one **dashboard** tool
(Looker Studio, Metabase or Apache Superset), and DuckDB. Start with Umami, Looker Studio and DuckDB.

A self-hosted Umami runs on this Mac, which a public site can't reach. For a live site, Umami Cloud's free Hobby
tier is the simplest collector: make the account, add the website, put its script tag on every page (and allow
`cloud.umami.is` in `script-src` and `gateway.umami.is` in `connect-src` if the site has a CSP), then record it in
the business's profile so HQ counts it:

```json
"analytics": { "provider": "umami-cloud", "id": "<website id from the script tag>", "sites": ["https://example.com/"] }
```

The website id is public (it's in the page source). An API key for reading the numbers back is a secret: keep it in
the Keychain, never in the profile.

### Looker Studio

- **What it's for:** free dashboards over Google Sheets, GA4 and Search Console.
- **Needed or optional:** one of the dashboards group (Looker Studio, Metabase or Apache Superset). The default.
- **Licence or plan:** free, proprietary (Google).
- **Set it up:** the owner signs in at https://lookerstudio.google.com with their own Google account. Never create
  an account for them. Search Console data comes from the [SEO department](/guides/seo).
- **How HQ checks it:** a free web service, shown on the department tab as "web".

### Umami

- **What it's for:** privacy-friendly web analytics (a Google Analytics alternative).
- **Needed or optional:** one of the web-analytics group (Umami, Plausible CE or PostHog). The CEO recommends Umami
  as the lightest.
- **Licence or plan:** open source, MIT.
- **Set it up:** through `/hq:add-tool Umami for data`, from a release or source (no Docker, no Homebrew), run as a
  `com.hq.*` service. **Decide with the owner where it runs first:** an analytics server only counts visitors whose
  browsers can reach it, and HQ's services bind to 127.0.0.1. Then add Umami's tracking script to each site in the
  profile; changing a live site is the owner's call.
- **How HQ checks it:** shows **installed** once it's in `~/.local/opt/umami` (where `/hq:add-tool` puts it);
  `/hq:add-tool` also adds its port so the tab can show it **running**. Either state clears the CEO's "No
  analytics tool is running" finding. Pick a free port: 3001 is already Uptime Kuma's.

### Plausible CE

- **What it's for:** simple, self-hosted web analytics.
- **Needed or optional:** an alternative to Umami in the web-analytics group; one is enough.
- **Licence or plan:** open source, AGPL-3.0 (the self-hosted Community Edition; Plausible's cloud is paid).
- **Set it up:** through `/hq:add-tool`, same rules and the same "where does it run" question as Umami.
- **How HQ checks it:** shows **installed** once it's in `~/.local/opt/plausible` (where `/hq:add-tool` puts it);
  `/hq:add-tool` also adds its port so the tab can show it **running**.

### PostHog

- **What it's for:** product analytics, session replay and funnels.
- **Needed or optional:** an alternative in the web-analytics group. Worth it for an app where you need funnels and
  in-product events, not just page views.
- **Licence or plan:** open core, MIT.
- **Set it up:** through `/hq:add-tool`. It is heavy to self-host; check the owner wants it first.
- **How HQ checks it:** shows **installed** once it's in `~/.local/opt/posthog` (where `/hq:add-tool` puts it);
  `/hq:add-tool` also adds its port so the tab can show it **running**.

### Metabase

- **What it's for:** dashboards and questions over your own database.
- **Needed or optional:** an alternative in the dashboards group, for when the numbers live in a database rather
  than Sheets.
- **Licence or plan:** open core, AGPL-3.0.
- **Set it up:** through `/hq:add-tool`, bound to 127.0.0.1, as a `com.hq.*` service. Give it a **read-only**
  database user; the owner creates it and enters the password in Metabase themselves.
- **How HQ checks it:** shows **installed** once it's in `~/.local/opt/metabase` (where `/hq:add-tool` puts it);
  `/hq:add-tool` also adds its port so the tab can show it **running**.

### Apache Superset

- **What it's for:** heavier BI and charting.
- **Needed or optional:** an alternative in the dashboards group; only when Metabase isn't enough.
- **Licence or plan:** open source, Apache-2.0.
- **Set it up:** through `/hq:add-tool`, same rules as Metabase.
- **How HQ checks it:** shows **installed** once it's in `~/.local/opt/superset` (where `/hq:add-tool` puts it);
  `/hq:add-tool` also adds its port so the tab can show it **running**.

### DuckDB

- **What it's for:** fast local SQL over CSV and Parquet files, for ad-hoc analysis of exports.
- **Needed or optional:** needed (it is in no group).
- **Licence or plan:** open source, MIT.
- **Set it up:** `/hq:add-tool DuckDB for data` downloads the release binary from GitHub, checks its checksum, puts
  it in `~/.local/opt/duckdb/` and links it into `~/.local/bin/duckdb`.
- **How HQ checks it:** the `duckdb` command on PATH (installed). `duckdb --version` prints a version.

## 2. Accounts and connections

### The analytics board

Under the scorecard, the Data tab draws every number the workflows are judged by: a headline row, then each lever's
charts (weekly trends, weekly counts and splits), what each unmeasured number needs, and every workflow with its
numbers. It reads the scorecard's history, HQ's own records and a private read-only analytics adapter per business;
`npm run hq -- analytics show <slug> [--missing] [--dept <dept>]` prints the same. Setting it up: [Analytics: every
number, every workflow](/guides/analytics).

### The growth scorecard

The scorecard is a card on the CEO and Data tabs, one per business: this week's numbers for the three growth levers
(**Get customers**, **Keep customers**, **Expand revenue**) plus the **Foundation**, each with its change from last
week, a 12-week trend and how far it can be trusted (exact, approximate or missing). The CEO's weekly review starts
from the weakest lever, so a business without a scorecard gets the finding "HQ can't see this business's growth".

It reads a private, **read-only** adapter for the business, configured in
`$HQ_DATA/businesses/<slug>/scorecard-connection.json` (never in the repo). The adapter reports **totals only**.
Run `/hq:scorecard` and it walks through these steps.

1. **Connect billing** (subscription businesses): follow [Connect Stripe and the App Store](/guides/scorecard-billing).
   The owner creates a Stripe **restricted key** with Read on Subscriptions, Invoices, Prices and Products only
   (never a full secret key), and/or an App Store Connect key with the **Sales** role. They store each one in the
   Keychain from their own Terminal with `security add-generic-password -a hq -s hq-<business>-stripe -w` (or
   `-appstore`), so it never appears in chat. Claude then writes `scorecard-billing.json` (the Keychain item names,
   which product is which tier, and the App Store's Key ID, Issuer ID and Vendor number, none of them secret) and
   points `scorecard-connection.json` at HQ's ready-made billing adapter.
2. **Connect your own records** (signups, activation, membership history): follow
   [Connect your own records](/guides/scorecard-records). It reads the business's own Postgres or Supabase through a
   totals-only function. With billing connected too, it goes under `records` in `scorecard-billing.json`, so billing
   is layered on top of it.
3. **Not a subscription business, or another source?** Write your own read-only adapter to the contract in
   [How the growth scorecard works](/guides/scorecard).
4. **Test the keys:** `npm run hq -- scorecard check-billing <slug>`. Every configured source must say `ok` with
   counts only, for example `stripe     ok  42 subscriptions on your products, ...`. A `FAILED` line names the
   cause: a missing permission, a missing Keychain item or a wrong ID.
5. **Refresh:** `npm run hq -- scorecard refresh <slug>` prints `ok <slug> <week>`, such as `ok acme-co 2026-W40`.
   The Refresh button on the card does the same.
6. **Read it:** `npm run hq -- scorecard show <slug>` prints one line per number: the lever, its label, the value
   and `exact`, `approx` or `missing`, with the reason for anything not exact. The owner compares paying customers
   with what they see in Stripe and App Store Connect before calling it done.
7. **Keep it fresh:** `npm run hq -- services add-defaults && npm run hq -- services install` installs
   `com.hq.scorecard`, which refreshes every connected business daily at 06:00. Numbers older than 36 hours count
   as out of date.

### Billing vs our records

**Billing vs our records** is the count of paying members on whom the payment provider or app store and the
business's own membership records disagree. It needs both billing and your own records connected. Above 0, a real
member's access is probably wrong: paying but locked out, or not paying but still in. The card's breakdown shows
which tier and the two counts. Fix each member's record (a production change, so only with the owner's yes), then
check the billing webhooks for the cause.

### Other connections

Search Console comes through the SEO department (`/hq:connections connect google_search_console`).

## 3. Skills to use

- `/hq:scorecard`: connect Stripe and the App Store to the scorecard, and explain any number on it.
- `/data:analyze`: answer a question with data.
- `/data:build-dashboard`: build a dashboard.
- `/data:write-query`: write SQL (DuckDB, Metabase or your database).
- `/data:explore-data`: explore a new dataset.
- `/data:statistical-analysis`: check whether a difference is real.
- `/data:validate-data`: check the numbers before they're shared.
- `/product-tracking-skills:product-tracking-design-tracking-plan`: write a tracking plan (which events, which
  properties).
- `/product-management:metrics-review`: review the product's metrics.
- `/board-timing`: how long a pick stayed on the board. A personal skill for one kind of business; skip it if it
  doesn't apply.
- `/hq:dept data`: plan this department's week from the CEO's latest review.

## 4. Check it's working

- The department tab (http://127.0.0.1:3150/data) shows DuckDB installed, Looker Studio as web, and your analytics
  tool running or installed. From Terminal:
  `curl -s http://127.0.0.1:3150/api/status | jq '.departments[] | select(.slug=="data") | .tools[] | {name, state}'`.
- `npm run hq -- scorecard show <slug>` prints this week's numbers with no `STALE` or `LAST RUN FAILED` in its first
  line.
- `npm run hq -- services status` lists `com.hq.scorecard`. It's a daily job, so `not running` between runs is
  normal; `(last exit 0)` means the last run worked.
- The CEO tab's findings for Data, and how each clears:

| Finding | What it means | How it clears |
|---|---|---|
| HQ can't see this business's growth (`scorecard-none`) | No scorecard adapter | Connect one (section 2), then `scorecard refresh <slug>` |
| The scorecard has never been refreshed / is out of date / The last scorecard refresh failed (`scorecard-stale`) | No report yet, nothing fresh for 36 hours, or the adapter errored | `npm run hq -- scorecard refresh <slug>`, read its error, and check `com.hq.scorecard` is installed |
| The scorecard's currency no longer matches the profile (`scorecard-stale`) | The profile's currency changed | Make the adapter report the profile's currency, then refresh |
| N paying members disagree between billing and our records (`scorecard-records-mismatch`) | Billing vs our records is above 0 | Fix each member's record, then the webhook cause; clears on the next refresh |
| N Get customers / Keep customers / Expand revenue / Foundation numbers can't be measured yet (`scorecard-missing-get`, `-keep`, `-expand`, `-base`) | Those numbers are missing | Each note names its fix: history building up, an event the product doesn't record yet, or ad spend posted to the ledger (cost to win) |
| No analytics tool is running (`no-analytics`) | No web-analytics tool is live | Install Umami (or Plausible CE or PostHog) with `/hq:add-tool`, which puts it in `~/.local/opt/` where HQ checks |

## Done when

- [ ] One web-analytics tool is installed and counting visits on the business's site, and shows as live on the tab.
- [ ] DuckDB is installed (`duckdb --version` works).
- [ ] A dashboard tool is set up (Looker Studio signed in, or Metabase or Apache Superset running).
- [ ] The scorecard is connected: `npm run hq -- scorecard check-billing <slug>` says `ok` for every configured
      source (if billing is used), and `scorecard show <slug>` prints fresh numbers.
- [ ] `com.hq.scorecard` is installed, so the scorecard refreshes daily.
- [ ] Billing vs our records reads 0, or each mismatch has an owner-approved fix underway.
- [ ] The CEO tab shows no `scorecard-*` or `no-analytics` finding the owner hasn't chosen to leave.

## Good to know

- **Aggregates only.** Customer personal data never goes into the scorecard, HQ profiles or reviews. HQ rejects a
  snapshot whose labels or notes look like an email, a phone number, a provider id (`cus_...`), a UUID or a token,
  and a breakdown is a split of a total (by tier, channel or referrer), never a list of customers.
- **Read-only keys only.** HQ only ever reads billing and records. Revoke a key by deleting it in Stripe or App Store
  Connect, then `security delete-generic-password -s hq-<business>-stripe`.
- **Trials are never paying customers;** they're counted in the note under paying customers.
- **A missing number is never a zero.** It shows as missing with the reason, and becomes a CEO finding.
- **App Store numbers lag a day or two,** because Apple publishes its reports late.
- **Don't "Mark done" a scorecard finding to make it go away.** It hides that finding for the business until it's
  reopened (`npm run hq -- done <slug> <finding-id> --undo`); fix the cause instead.
- A demo business shows invented numbers from HQ's demo adapter; that's expected.
