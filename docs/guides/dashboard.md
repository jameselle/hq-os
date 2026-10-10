# Dashboard: connect your data

The Dashboard (side nav, under CEO) is one page with your business's day-to-day numbers and the people worth
reaching out to, read live from your own systems every minute.

- **A subscription business** sees members by plan, revenue, new subscriptions and cancellations by day, recent
  upgrades, customers who cancelled (to win back) and customers who are about to (still paying until their period ends).
- **A media or creator business** sees followers, posts, views, likes and comments by day, and its top posts.
- **Your own database** can add anything else: sign-ups, usage, accounts at risk, leads, security counts. If you can
  write a little code (or ask Claude to), it can show your contact status and notes too.

Allow about 10 minutes for Stripe or Instagram. Ask Claude to walk you through it: `/hq:setup dashboard`.

## Before you start

- HQ is installed and your business is added (`npm run hq -- list` shows it). If not, see [Start here](start-here.md).
- You know which source you want to connect. You can only connect one per business; if you need several, see
  "Write your own" below, which can combine them.

## Privacy: what HQ keeps

The Dashboard is the one page in HQ that names people, because its job is helping you contact them. So:

- **Customer details are never saved.** HQ holds what it read in memory for one minute, then reads again. Nothing about
  a person is written to disk or to your backups.
- **HQ only reads**, with read-only keys that stay in your Mac's Keychain. You type them in; HQ never shows them.
- **Only this Mac can open it.** HQ runs on 127.0.0.1.
- **Never share a screenshot** of a real business's Dashboard. Use the demo business for anything public.

## 1. Pick your connector

| You have | Use | What you get |
| --- | --- | --- |
| Stripe subscriptions | **Stripe** | plans, revenue, trials, set to cancel, new and cancelled by day, recent upgrades, pending cancellations, cancelled customers with their email |
| An Instagram professional account | **Instagram** | followers and their 7-day change, posts, views, likes and comments, top posts |
| Your own database or app | **Write your own** | anything in the contract below, including contact status and notes |
| Nothing yet, just looking | **Demo** | invented data, every section, contact status and notes that work |

## 2a. Stripe

1. **Make a read-only key.** In the Stripe Dashboard, switch to the right account with **live mode** on, then
   **Developers → API keys → Create restricted key**. Skip the templates (they grant write access) and set:
   **Subscriptions: Read**, **Invoices: Read**, **Prices: Read**, **Products: Read**, everything else **None**.
   Name it `HQ dashboard (read-only)` and copy the key (it starts `rk_live_`).

   If you already connected Stripe to the scorecard ([Scorecard billing](scorecard-billing.md)), skip this step: the
   Dashboard uses the same key and settings.
2. **Connect:**

   ```bash
   npm run hq -- dashboard connect <business> stripe
   ```

   It writes `dashboard-stripe.json` in your business's HQ data folder (or uses the scorecard's billing settings if
   they exist) and prints the Keychain command for the next step.
3. **Store the key** (paste it when asked; it is never written to a file or shown again):

   ```bash
   security add-generic-password -a hq -s hq-<business>-stripe -w
   ```

4. **Name your plans.** Open `$HQ_DATA/businesses/<business>/dashboard-stripe.json` (`~/hq-data` unless you moved it)
   and list each plan's Stripe product ids (Products → open a product → its id starts `prod_`). A plan can have several
   products, for example monthly and yearly. List your highest plan first; someone on two plans counts once, on the
   higher one.

   ```json
   {"keychain": "hq-<business>-stripe", "tiers": {"Pro": ["prod_..."], "Starter": ["prod_..."]}, "ignore": []}
   ```

   Subscriptions on other products are left out, so one Stripe account can serve several businesses. Put test
   subscriptions you want hidden in `ignore` (their `sub_` ids).

Good to know: Stripe's restricted key can't read customers, so each person's email and name come from their latest
invoice. Stripe has nowhere to keep a contact status or note, so this connector is read-only.

## 2b. Instagram

1. **Get a token.** You need an Instagram professional (Business or Creator) account and a Meta app with the
   **Instagram API with Instagram Login**, permissions `instagram_business_basic` and
   `instagram_business_manage_insights`. Generate a long-lived token for your account in the app's dashboard (Meta's
   guide: developers.facebook.com/docs/instagram-platform). It lasts 60 days; refresh it before then.
2. **Connect:**

   ```bash
   npm run hq -- dashboard connect <business> instagram
   ```

3. **Store the token:**

   ```bash
   security add-generic-password -a hq -s hq-<business>-instagram -w
   ```

   If your token already lives in the Keychain under another name (another tool may use it), point
   `dashboard-instagram.json` at it instead: `{"keychain": "<service>", "account": "<account>", "cache": "…"}`.

Good to know: Instagram allows about 200 calls an hour, and the Dashboard refreshes every minute, so the connector
keeps a small cache (account and posts for 10 minutes, views for an hour) in `dashboard-instagram-cache.json`. The
cache holds public post numbers only, never a person. Each section says when it was read.

## 2c. Write your own

Write a small script that prints your numbers as JSON, then point HQ at it. It can read anything you can reach: your
database, your app's API, a spreadsheet, several sources at once. Ask Claude: "write a dashboard connector for
<business> that reads <source>, using docs/guides/dashboard.md". Start from a template:

- `templates/dashboard/dashboard-template.mjs`: every section, with contact status and notes (invented data)
- `templates/dashboard/stripe-template.mjs` and `instagram-template.mjs`: real connectors to copy from

Keep it in your business's HQ data folder (never in HQ itself), then add
`$HQ_DATA/businesses/<business>/dashboard-connection.json`:

```json
{"command": ["node", "/path/to/your-connector.mjs"], "readOnly": true}
```

Set `"readOnly": false` only when your connector saves contact status and notes in your own records.

Rules for a connector:

- **Load keys at run time**, from the Keychain (`security find-generic-password -s <service> -w`) or your app's own
  settings file. Never put a key in the command, the config or the output; HQ refuses output that looks like a key or
  token.
- **Report what you have.** Every section is optional. If one part fails, report the rest and say what failed in
  `errors`, rather than failing the whole thing.
- **Unknown is `null`, never 0.**
- **Keep it fast.** HQ waits up to 90 seconds, but the page feels slow past about 15. Cache slow or rate-limited
  sources yourself (public numbers only).

### The contract

HQ runs the command, writes one JSON object to its stdin and reads one JSON value from its stdout.

| stdin | stdout |
| --- | --- |
| `{"action": "report"}` | the snapshot below |
| `{"action": "notes", "key", "kind"}` | `[{id, note, createdAt}]`, newest first |
| `{"action": "add-note", "key", "kind", "note"}` | `{"ok": true}` |
| `{"action": "set-contact", "key", "kind", "status"}` | `{"ok": true}` |

`kind` is `churned` or `pending`, the list the row came from. `status` is `not_contacted`, `contacted` or `follow_up`.
HQ only sends a key that was in the snapshot it's holding.

The snapshot (`lib/dashboard.ts`, `DashboardSnapshot`). Only `observedAt` and `can` are required:

```text
observedAt      ISO time of the read
can             {contact, notes}   what the owner can change from HQ
plans           [{id, label, count, paid, hint?}]   members by plan
totalUsers      every account
signups         {today, week, month}
daily           {since: YYYY-MM-DD, signups: [{date, count}], upgrades: [{date, count}]}
recentUpgrades  [{key, name, email, plan, billingPeriod, startedAt}]
churned         [{key, name, email, churnedAt, plan, previousProduct, cancelFeedback, cancelReason, source, contact, template}]
pending         [{key, name, email, phone, plan, billingPeriod, status, expiresAt, memberSince, amount, currency,
                  affiliateCode, cancelFeedback, cancelReason, source, contact, template}]
security        {suspended, flagged, rateLimited24h} or null
orphaned        [{key, name, email, status, plan, amount, interval, created, link}] or null   paying, but no account
groups          [{id, title, note?, tiles: [{label, value (number or null), format? count|money|percent|decimal, currency?, hint?, tone?}]}]
charts          [{id, title, subtitle?, kind: area|bars, since: YYYY-MM-DD, points: [{date, count}]}]   counts per day
lists           [{id, title, subtitle?, rows: [{key, title, subtitle?, email?, at?, value?, tags?, link?}]}]   tags[0] becomes the tabs
templates       {id: {label, subject, body}}   ready emails; bodies may use {{first_name}}
errors          {section: message} when one part failed
```

`source` is `card`, `apple` or `google`. A row's `template` names one of `templates`. Plans with `paid: true` become the
plan filters, matched against each row's `plan` or `previousProduct`. Section ids are unique across groups, charts and
lists. Charts add days up into weeks and months, so report counts per day.

## 2d. Demo

```bash
npm run hq -- dashboard connect <business> demo
```

Invented people and numbers, every section, and contact status and notes that really save (in
`dashboard-demo.json`). Good for trying it out and for screenshots.

## 3. Check it's working

```bash
npm run hq -- dashboard check <business>
```

It reads your source once and prints what each section holds, as counts only (it never prints a name or an email),
how long the read took, any problems with the shape, and any part that failed. Then open
http://127.0.0.1:3150/dashboard with the business chosen in the switcher.

| You see | It means |
| --- | --- |
| `No Keychain item "…"` | step 3 of your connector: store the key under exactly that name |
| `Stripe refused the key (401 or 403)` | the key is wrong, or missing a Read permission; edit the key in Stripe (the Keychain needs no change) |
| `Instagram answered 400 (code 190)` | the token expired; make a new one and store it again |
| Plans all 0 | `tiers` doesn't list your product ids |
| `FAILED Private adapter failed` | your own connector exited with an error: run its command by hand to see it |
| `N problems` | your connector's output doesn't match the contract; the first few are printed |

## Done when

- [ ] `dashboard check` prints `0 problems` and no WARNING lines.
- [ ] The Dashboard page shows your numbers, and the numbers match your source (spot-check one).
- [ ] The key is in the Keychain only, not in any file.

## Good to know

- To switch connector, run `dashboard connect` again with `--force`.
- The page refreshes every minute while it's open. HQ reads at most once a minute per business, one read at a time.
- If the Dashboard disagrees with another dashboard you use, check how each counts "this month" and whether either
  stops at a row limit (many admin pages read only the first 100 or 1,000 rows).
