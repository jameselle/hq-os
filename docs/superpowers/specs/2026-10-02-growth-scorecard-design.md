# Growth scorecard — design

**Status:** draft for the owner's review · **Date:** 2026-10-02 · **Build step 1** on the Workflows tab
(scorecard → lever tags → signal files → playbooks → CEO routing → experiment log).

## Why

HQ routes growth work by lever (Get / Keep / Expand, plus Foundation) and the CEO is meant to start each week from the
weakest lever's number. Today HQ can't see a single growth number, so the CEO ranks setup findings, not growth. The
scorecard gives every business one weekly page of lever numbers, each labelled with how much it can be trusted, so the
later build steps have something to route on.

## Goals

1. One scorecard per business, refreshed daily and read weekly, on the CEO tab.
2. A fixed catalogue of metrics per lever, so every business is measured the same way and the CEO can compare weeks.
3. Every number says whether it is **exact**, **approximate** (with the reason) or **missing** (with what would
   fix it). A missing number is a finding, never a zero.
4. **Nothing private ever ships.** The framework holds no business's numbers, queries, adapters or keys, and the
   shared product works out of the box on synthetic demo data.

## Non-goals (later build steps)

- Picking the weakest lever and routing work (step 5). The scorecard only stores what that needs.
- Per-department signal files, playbooks and the experiment log.
- Targets and alerts. Week-on-week change is enough until routing exists.
- Any write path. Adapters are read-only; there is no pause/resume or send control.

## Shape

The scorecard follows the lifecycle pattern (`lib/lifecycle.ts`, `docs/CUSTOMER_LIFECYCLE.md`): a private,
owner-configured command produces a snapshot; HQ validates it, rebuilds it from allowed fields only, and stores it
with owner-only permissions in the business's private directory.

```
$HQ_DATA/businesses/<slug>/
  scorecard-connection.json   {"command": ["/abs/path/adapter"], "readOnly": true}   (owner-written, never in git)
  scorecard-snapshot.json     latest validated snapshot (0600)
  scorecard/2026-W40.json     the last snapshot of each ISO week, kept for history (0600)
```

- The adapter receives `{"action":"report","weeks":12}` on stdin and prints one JSON snapshot on stdout.
  45 s timeout, 2 MB output cap, same as lifecycle.
- The command is set by the owner on disk, never from a browser request. Credentials never go in its arguments; an
  adapter fetches its own secret (for example from the login Keychain) at run time.
- `lib/private-adapter.ts` (new) holds the run-validate-rebuild-write logic both lifecycle and scorecard use; lifecycle
  moves onto it unchanged in behaviour (its tests must still pass untouched).

## Snapshot (version 1)

```ts
type Quality = "exact" | "approx" | "missing";
type Metric = {
  id: MetricId;                 // from the catalogue below; unknown ids are rejected
  value: number | null;         // null only when quality is "missing"
  quality: Quality;
  note: string;                 // ≤ 200 chars: why approximate, or what would fix "missing"
  breakdown?: { label: string; value: number }[];   // ≤ 20 rows, e.g. by tier or by channel
};
type Week = {
  week: string;                 // ISO week, e.g. 2026-W40
  metrics: Metric[];
  extraSpend?: { label: string; value: number }[];  // ≤ 10 rows: acquisition spend the ledger doesn't hold (e.g. commissions)
};
type ScorecardSnapshot = {
  version: 1;
  observedAt: string;           // when the SOURCE was read, not when HQ ran
  currency: string;             // ISO 4217, must match the profile
  weeks: Week[];                // newest first, ≤ 26
};
```

**Validation is the privacy line.** The validator accepts aggregates only:

- numbers must be finite; counts must be non-negative integers
- every string (note, breakdown label) is ≤ 200 chars and is rejected if it looks like an email address, a phone
  number, a UUID, a long hex or base64 token, a JWT or a URL with a query string
- no arrays of people or accounts exist in the type, so an adapter cannot smuggle rows through
- the snapshot is rebuilt field by field before it is written, so extra fields never reach disk

## Metric catalogue

Each metric belongs to one lever. Rates are 0–1. Money is in the snapshot's currency, per month.

| Lever | id | Meaning |
|---|---|---|
| Get | `new_signups` | Accounts created in the week |
| Get | `new_paying` | Customers who started paying in the week (breakdown: channel) |
| Get | `new_mrr` | Monthly recurring revenue those new customers added |
| Keep | `activation_rate` | Share of the cohort that signed up 7–14 days ago and reached the business's first-value event within 7 days |
| Keep | `paying_churn_rate` | Share of customers paying at the week's start who stopped during it (breakdown: tier) |
| Keep | `failed_payments` | Paying customers who entered a failed-payment state in the week |
| Keep | `payment_recovery_rate` | Share of failed payments from 14–21 days ago that were paying again within 14 days |
| Expand | `upgrades` | Customers who moved to a higher tier or longer billing period (breakdown: from→to) |
| Expand | `downgrades` | The reverse |
| Expand | `nrr` | Net revenue retention: MRR now from customers who were paying 4 weeks ago ÷ their MRR then |
| Foundation | `mrr` | Recurring revenue now, normalised to a month (weekly × 52/12, yearly ÷ 12) |
| Foundation | `paying_customers` | Paying now (breakdown: tier) |
| Foundation | `cost_to_win` | Acquisition spend in the last 4 weeks ÷ new paying customers in those weeks |
| Foundation | `payback_months` | `cost_to_win` ÷ average `new_mrr` per new customer |
| Foundation | `known_source_share` | Share of new paying customers with a known channel |

For a non-subscription business the same ids carry the shop meaning recorded in the lever decision ("Keep" = repeat
purchase, "Expand" = basket size); that mapping is out of scope until a shop is connected.

**Spend comes from the ledger, not the adapter.** HQ computes `cost_to_win` and `payback_months` itself: acquisition
spend = postings in the 4-week window to the business's `Expenses:Advertising` account and its sub-accounts (plus
`Expenses:Commissions` if it exists) in `$HQ_DATA/businesses/<slug>/finance/ledger.beancount`. An empty or missing
ledger, with no `extraSpend` either, makes both metrics `missing`, with the note "No acquisition spend recorded". Spend
the ledger doesn't hold (for example affiliate commissions paid out by the product itself) comes in as the week's
`extraSpend` and is added to the ledger's figure.

## Refresh

- Service `com.hq.scorecard`: scheduled daily at 06:00 local through `services.json` (`schedule`, like
  `com.hq.backup`), running `npm run hq -- scorecard refresh --all`.
- CLI: `hq scorecard refresh [<slug>|--all]`, `hq scorecard show <slug>` (prints the table).
- Site: `GET /api/scorecard` (current business) and `POST /api/scorecard` with `{action:"refresh"}`, guarded by the
  same local same-origin check as lifecycle.
- A failed run keeps the previous snapshot and marks it failed; a snapshot older than 36 hours is shown as stale.
  The last snapshot written in each ISO week is copied to `scorecard/<week>.json`. Weeks older than 26 are pruned.

## Display

A **Scorecard** card at the top of the CEO tab, and the same card on the Data department tab:

- four columns (Get, Keep, Expand, Foundation), each metric with this week's value, the change from last week and a
  quality pill (`exact` plain, `approx` amber with the note on hover, `missing` grey with the fix)
- a 12-week sparkline per metric from the history files
- header: observed time, stale or failed state, refresh button
- no business configured: an empty state that explains the adapter and links this doc; never invented numbers

Uses the HQ design system (`bb` tokens, `.card`, `.eyebrow`, pills from `lib/tone.ts`).

## CEO findings (minimal hook)

`buildFindings` gains three rules, all owned by the Data department:

1. No scorecard connection → `decision`: "HQ can't see this business's growth", with the action to write an adapter.
2. Snapshot stale or failed → `attention`.
3. Each `missing` metric → one `info` finding grouped per lever, carrying the adapter's note as the fix.

Routing by the weakest lever stays in step 5.

## Keeping private data out of the shared product

1. **Nothing business-specific is in git.** Adapters, connections, snapshots and history live under `$HQ_DATA`,
   outside the repository. A new test fails if any tracked file is named `scorecard-connection.json` or
   `scorecard-snapshot.json`, matches `scorecard/*-W*.json`, or is an adapter outside `templates/scorecard/`.
2. **The release leak scan stays the gate.** It already refuses to publish any home path, the git email, any name in
   `.private-names` or any connected business's name. The scorecard adds no exception to it.
3. **The demo is synthetic.** `templates/scorecard/demo-adapter.mjs` produces deterministic invented numbers for the demo
   business, so a fresh install shows a working scorecard without anyone's data. The demo adapter's output is a
   test fixture.
4. **Screenshots come only from the throwaway demo instance** (existing release rule). The live console must never
   be captured for the README.
5. **The adapter returns aggregates only** (see Validation). Business data stays in the business's own systems; HQ
   receives counts and sums.

## Testing

- `tests/scorecard.test.ts`: the validator accepts the demo snapshot; rejects each PII shape, unknown metric ids,
  wrong currency, value/quality mismatches, oversize arrays and extra fields (dropped on rebuild); weekly history
  rotation and pruning; stale and failed states; ledger spend over a synthetic beancount file.
- `tests/lifecycle.test.ts` passes unchanged after the shared adapter runner is extracted.
- The guard tests from "Keeping private data out" above.
- `tests/ceo.test.ts`: the three new findings.
- Each business adapter is verified against its source by hand before it is trusted: every `exact` headline is
  reconciled once against an independent figure from the source system, and the reconciliation is written to that
  business's vault.

## Rollout

1. Framework: snapshot type, validator, shared runner, ledger spend, CLI, API, CEO card, demo adapter, tests.
2. First business adapter (private, in its `$HQ_DATA` folder), with its own source-side spec kept with the business.
3. `com.hq.scorecard` service, a week of daily runs, then the owner reviews the first weekly card.
