# Analytics: every number, every workflow

The Data & Analytics tab (`/data`) holds every chart an owner needs for the current business, under the growth
scorecard.
Each workflow on the Workflows tab is judged by one or more numbers; this page draws every one that is measured,
lever by lever, says what each unmeasured one needs, and ends with a table of every workflow and its numbers.

Code: `lib/analytics-metrics.ts` (the catalogue: label, unit, chart, which way is better, source, the question it
answers, what it needs, and `WORKFLOW_ANALYTICS`, the numbers each workflow is judged by), `lib/analytics.ts`
(validation, HQ's own measurements, storage, the board), `lib/analytics-findings.ts` (CEO findings and competitor
changes, counted at refresh), `components/AnalyticsBoard.tsx` (drawn on the Data & Analytics tab; old `/analytics` links
redirect there). Tests: `tests/analytics.test.ts` fails if a workflow has no number or a
number serves no workflow.

## Where the numbers come from

1. **The scorecard.** Its headline numbers (MRR, churn, activation, …) keep their ids and their weekly history.
2. **HQ's own records**, measured for every business with nothing to connect: posts read back from the platforms,
   posts with a comment keyword, Studio renders, automated messages sent per flow, CEO reviews, experiments, notes in
   the business's brain, how complete the brand kit is, workflow checks passing, open CEO findings, changes the
   competitor watcher saw (`hq-<slug>` watches) and advertising and commission spend in the ledger.
3. **A private analytics adapter** per business for everything else (sources, funnels, cancel reasons, uptime,
   followers, …). It lives in the business's folder under `$HQ_DATA`, never in this repository.

An adapter's reading wins for any number it actually measures; then the scorecard; then HQ's own records. A number
nobody measures shows as "not measured yet" with what it needs, never as zero. Numbers that only mean something
with recurring billing (MRR, churn, trials, …) read "doesn't apply" for other business models unless an adapter
reports them anyway.

## Refreshing

`npm run hq -- analytics refresh <slug|--all>` re-measures HQ's own numbers, runs the adapter and keeps this
week's reading of every number in `$HQ_DATA/businesses/<slug>/analytics/<ISO week>.json` (52 weeks), so a source
that can only say "now" still builds a trend. The daily `com.hq.scorecard` job runs it at 06:00 right after the
scorecard (reinstall services after upgrading: `npm run hq -- services install`). The board's Refresh button does
the same for the business you're looking at. `npm run hq -- analytics show <slug> [--missing]` prints the board.

A demo business with no connection runs `templates/analytics/demo-adapter.mjs`, whose numbers are invented.

## Connecting a business

```
$HQ_DATA/businesses/<slug>/analytics-connection.json   {"command": ["/abs/path/node", "/abs/path/adapter.mjs"], "readOnly": true}
```

- **Input** (stdin): `{"action":"report","weeks":12,"currency":"AUD","timezone":"Australia/Sydney","now":"<ISO>","campaigns":[{"id":"cold-brew-month-2026-11-02","utm":"cold-brew","start":"2026-11-02"}]}`.
  `campaigns` lists the business's campaigns that have started (live, paused or done), so the adapter can count per tag since each start.
- **Output** (stdout): one JSON snapshot. 240 s timeout, 2 MB cap. A failed run keeps the previous snapshot; HQ's
  own numbers are still saved.
- **Credentials** are fetched by the adapter at run time (Keychain), never put in the command array.
- **Read-only.** An adapter reads; it never changes the business's systems.

```ts
{
  version: 1,
  observedAt: string,        // ISO 8601
  currency: string,          // must equal the profile's currency
  metrics: [{
    id: string,              // a catalogue id (below)
    value: number | null,    // the current reading; null exactly when quality is missing or na
    quality: "exact" | "approx" | "missing" | "na",
    note: string,            // what it counts, or why it's missing / doesn't apply (≤ 200 chars)
    weeks?: [{ week: "2026-W41", value: number | null }],   // up to 26, any order, unique weeks
    breakdown?: [{ label: string, value: number }],         // up to 20 rows, values ≥ 0
    period?: string,         // what the breakdown covers ("last 4 weeks")
  }],
}
```

Rates run from 0 to 1, money is in the snapshot's currency, ratios are plain numbers (2.4 shows as "2.40x").

### Campaigns (optional)

An adapter that can split visits and sign-ups by the campaign tag on the link (`utm_campaign`, stored with each
sign-up's first touch) reports them as `campaigns`, one row per tag, beside `metrics`:

```ts
campaigns?: [{
  utm: string,         // the tag as it arrived ("cold-brew"); series-style tags in utm_source ("series-ig") work too
  id?: string,         // the HQ campaign id, when the adapter matched it from the input
  visits?: number,     // visits that arrived with the tag
  signups?: number,    // sign-ups whose first touch carried it
  paying?: number,     // of those, how many pay
  revenue?: number,    // what they paid, in the snapshot's currency
  period?: string,     // what the counts cover ("since 2026-11-02")
}]                     // up to 100 rows; counts and money only
```

Leave a field out when it isn't measured; never send 0 for "don't know". The Campaigns page works out cost per
sign-up, cost per paying customer and return on spend from these and the spend tagged in the ledger
([Campaigns](/guides/campaigns)).

### Posts (optional)

An adapter that can read the business's connected accounts reports every post that is up now as `posts`, newest
first. Studio's planner shows them in its "Live now" view (a plan named after the business): the real profile
grids, trial reels and each post's views, matched to the render it came from through HQ's own `published.jsonl`.

```ts
posts?: [{
  platform: "instagram" | "tiktok" | "youtube" | "x" | "facebook" | "linkedin",
  id: string,          // the platform's id for the post
  url: string,         // https, on the platform's own site only
  at: string,          // when it went up (ISO)
  views: number | null,// views now; null when the platform gave none (never 0 for "don't know")
  trial?: boolean,     // an Instagram trial reel (shown to non-followers, off the grid)
  thumb?: string,      // https, on the platform's image hosts only (cdninstagram, fbcdn, tiktokcdn, ytimg, twimg, licdn)
}]                     // up to 500
```

Read the accounts themselves, not HQ's log, so posts made by hand show and deleted ones drop out. Nothing else
about a post (captions, comments, people) belongs here. The planner re-reads the accounts when its numbers are
more than 6 hours old, and its Refresh button runs the whole refresh on demand.

### Metric ids

| Lever | Ids |
|---|---|
| Get customers | `new_signups`, `new_paying`, `new_mrr`, `posts_published`, `keyword_posts`, `videos_edited`, `comparison_signups`, `organic_signups`, `search_clicks`, `signups_by_source`, `followers`, `follows_per_post`, `views_per_post`, `link_clicks`, `keyword_dms`, `keyword_dm_delivery_rate`, `keyword_dms_waiting`, `keyword_dm_misses`, `dm_to_email_rate`, `email_to_trial_rate`, `partner_customers`, `partner_d90_retention`, `landing_conversion_rate`, `tool_users`, `tool_signup_rate`, `feature_adoption`, `ad_spend`, `community_members`, `community_paying`, `referral_signups`, `trial_to_paid_rate`, `checkouts_started`, `checkout_completion_rate`, `visitor_to_paid_rate`, `signups_by_market`, `promo_redemptions`, `referral_customers`, `sales` |
| Keep customers | `activation_rate`, `paying_churn_rate`, `failed_payments`, `payment_recovery_rate`, `set_to_cancel`, `weekly_active_rate`, `lifecycle_sent`, `walkthrough_coverage`, `walkthrough_plays`, `time_to_activation`, `at_risk_customers`, `helped_churn_gap`, `support_tickets`, `requests_closed`, `churn_to_rival`, `competitor_changes`, `incidents`, `stale_minutes`, `uptime_rate`, `save_rate`, `cancel_reasons`, `reactivated`, `bad_week_churn`, `track_record`, `academy_activation`, `offseason_churn`, `paused_instead`, `releases`, `customer_bugs`, `top_customer_retention`, `account_incidents` |
| Expand revenue | `upgrades`, `downgrades`, `nrr`, `upgrade_prompt_rate`, `arpu`, `mrr_by_tier`, `annual_share`, `addon_attach_rate`, `b2b_mrr`, `support_upgrades`, `price_change_net`, `cross_sell_customers`, `content_product_sales` |
| Foundation | `mrr`, `paying_customers`, `cost_to_win`, `payback_months`, `known_source_share`, `records_mismatch`, `ceo_reviews`, `experiments_run`, `vault_notes`, `open_findings`, `brand_kit_coverage`, `workflow_checks_passing`, `revenue`, `ltv`, `ltv_to_cac`, `complaints` |

The catalogue holds each id's question and what it needs; the Data & Analytics tab shows both.

A few numbers are **alarms**: faults that should read zero, such as `keyword_dm_misses` (someone asked for the link and got nothing back). Any reading above zero becomes a CEO finding for the workflow's owner, with the fix as its action.

## Privacy

The same rules as the scorecard: aggregates only. HQ rejects a snapshot if a note, period or breakdown label looks
like an email address, phone number, provider id (`cus_…`, or any `word_longtoken`), UUID, long hex or base64
token, JWT, or a URL with a query, and names the failing field, never its value. Write labels as plain words
("Cancel scheduled", not `cancel_scheduled`). Snapshots are rebuilt field by field and written owner-only (0600). A
test fails if any analytics connection, snapshot or kept week is tracked in git. Aggregate in the source where you
can: run the counting next to the data and send only counts across the network.
