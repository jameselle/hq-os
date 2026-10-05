# Growth scorecard

The CEO tab (and the Data tab) shows one card per business: this week's numbers for the three growth levers plus
the foundation, each with its change from last week, a 12-week trend and how far it can be trusted. The CEO's weekly
review starts from the weakest lever, so a business without a scorecard gets a `scorecard-none` finding.

Design: `docs/superpowers/specs/2026-10-02-growth-scorecard-design.md`. Code: `lib/scorecard.ts` (validation,
storage), `lib/scorecard-metrics.ts` (catalogue, formatting), `lib/ledger-spend.ts` (cost to win),
`lib/private-adapter.ts` (the runner shared with lifecycle).

## Connecting a business

Write a private, read-only adapter and point the business's connection at it. Both live in the business's own folder
under `$HQ_DATA`, never in this repository:

```
$HQ_DATA/businesses/<slug>/scorecard-connection.json   {"command": ["/abs/path/node", "/abs/path/adapter.mjs"], "readOnly": true}
```

Then `npm run hq -- scorecard refresh <slug>` and `npm run hq -- scorecard show <slug>`. Only one refresh runs per
business at a time (`scorecard.lock`; a lock older than 2 minutes is treated as left over from a crash). If the
profile's currency changes, the kept scorecard is hidden and the card and the CEO say why until the adapter reports
the new currency. The `com.hq.scorecard`
service refreshes every connected business daily at 06:00 (`npm run hq -- services add-defaults && npm run hq -- services install`).

A demo business with no connection runs `templates/scorecard/demo-adapter.mjs`, whose numbers are invented.

## The adapter contract

- **Input** (stdin): `{"action":"report","weeks":12,"currency":"AUD"}`.
- **Output** (stdout): one JSON snapshot. 45 s timeout, 2 MB cap.
- **Credentials:** the adapter fetches its own secret at run time (for example `security find-generic-password -s <name> -w`).
  Never put a secret in the command array.
- **Read-only:** an adapter reads; it never changes the business's systems.

```ts
{
  version: 1,
  observedAt: string,      // when the source was read, ISO 8601
  currency: string,        // must equal the profile's currency
  weeks: [{                // newest first, unique ISO weeks ("2026-W40"), at most 26
    week: string,
    metrics: [{ id, value: number | null, quality: "exact" | "approx" | "missing", note: string,
                breakdown?: [{ label, value }] }],      // at most 20 rows
    extraSpend?: [{ label, value }],                     // acquisition spend the ledger doesn't hold, at most 10 rows
  }],
}
```

- `value` is `null` exactly when `quality` is `missing`.
- `note` says why a number is approximate, or what would make a missing one measurable. A missing number becomes a CEO
  finding, never a zero.
- Counts are non-negative integers. Rates run from 0 to 1 (net revenue retention can exceed 1). Money is per month, in the snapshot's currency.

### Metric ids

| Lever | Ids |
|---|---|
| Get customers | `new_signups`, `new_paying`, `new_mrr` |
| Keep customers | `activation_rate`, `paying_churn_rate`, `failed_payments`, `payment_recovery_rate`, `set_to_cancel`, `weekly_active_rate` |
| Expand revenue | `upgrades`, `downgrades`, `nrr` |
| Foundation | `mrr`, `paying_customers`, `cost_to_win`, `payback_months`, `known_source_share`, `records_mismatch` |

`set_to_cancel` counts paying members who have scheduled a cancellation. `weekly_active_rate` is the share of paying customers who used the product during the week (the Daily habit workflow's number). `records_mismatch` counts paying members on
whom the payment provider or app store and the business's own membership records disagree. Any value above 0
raises a CEO finding, because a mismatched member may have lost access they paid for. The exact meaning of the rest
is in the design doc. Report only what you measure. Anything you leave out shows as `missing`
("Not reported by the adapter") and becomes a CEO finding, so prefer marking it `missing` with the real reason.

**Labels are categories, never people or accounts:** a tier, a channel, a referrer host. A breakdown is a split of a
total, not a list of customers.

**Cost to win and payback** come from HQ, not the adapter, unless the adapter reports them itself. HQ uses:
- spend posted to `Expenses:Advertising` and `Expenses:Commissions` (and their sub-accounts) in the business's ledger
  over the last 4 weeks, plus the adapter's `extraSpend`
- divided by the new paying customers reported for those 4 weeks

The ledger reader follows `include "…"` files, converts foreign-currency postings that carry a price
(`@`, `@@` or `{cost}`), reads `1,000.00` amounts and `txn` headers, and subtracts refunds (never below zero). A foreign-
currency posting with no price is skipped. With no advertising spend in the ledger, the note says that only the
adapter's extra spend was counted.

## Privacy

- **Aggregates only.** HQ rejects a snapshot if any label or note looks like an email address, a phone number (nine or
  more digits in a run, once dates, decimals and thousands are set aside), a provider id such as `cus_…`, a UUID, a long
  hex or base64 token, a JWT, or a URL with a query string. `observedAt` must be a plain ISO 8601 timestamp. A refresh
  that fails validation names the failing field (`weeks[0].metrics[3].note`), never its value.
- **Rebuilt before saving.** Every snapshot is rebuilt field by field, so extra fields never reach disk. Snapshots and
  weekly history files are written owner-only (0600).
- **Nothing private in git.** A test fails if a connection, snapshot, state file, week file or adapter is tracked
  anywhere except `templates/scorecard/`, or if any tracked file holds a Supabase RPC endpoint, a Stripe secret or
  restricted key, or an embedded API token.
- **Local reads only.** The scorecard and lifecycle APIs answer only requests addressed to `127.0.0.1` or `localhost`. The release leak scan refuses any connected business's name.
