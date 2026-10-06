# Finance sync: the ledger fills itself from billing

Each business's books are a plain-text Beancount ledger (`$HQ_DATA/businesses/<slug>/finance/ledger.beancount`, viewed in
Fava). The finance sync keeps billing in it without anyone typing: a private, read-only **finance adapter** reports
**daily totals** (income by product, refunds, fees, spend), and HQ writes them to `finance/synced.beancount`, included
once from the ledger. Code: `lib/finance-sync.ts`; template adapter: `templates/finance/stripe-finance-adapter.mjs`.

- The synced file is **rewritten whole** on every sync, so nothing is ever posted twice, and your own entries in
  `ledger.beancount` are never touched. Every sync runs `bean-check`; if the ledger wouldn't check out, the old file stays.
- It runs daily at 06:00, before the scorecard (`com.hq.scorecard`), so cost to win and payback read fresh books.
  By hand: `npm run hq -- finance sync <slug|--all>`, then `npm run hq -- finance show <slug>`.
- Costs come from the accounting system, not billing: a business on Xero imports its monthly costs read-only into
  `finance/costs-xero.beancount` ([Finance guide](/guides/finance), "Connect your accounting system").
- The Finance tab shows **money in and out**: income after refunds by month, costs over the last 3 months by account,
  and margin. With income but no costs, it says so, and the CEO raises "The books have income but no costs".

## What it feeds

| Department | What it gets |
|---|---|
| Data & Analytics | Ad spend and commissions in the ledger make **cost to win** and **payback** measurable; with lifetime value, HQ works out **lifetime value to cost to win** |
| CEO | Income against recorded costs, and a finding when costs are missing |
| Email & Lifecycle | (with the business's own engine) failed payments to recover |

## Connecting a business

```
$HQ_DATA/businesses/<slug>/finance-connection.json   {"command": ["/abs/node", "/abs/adapter.mjs", "<its args>"], "readOnly": true}
```

For Stripe, point it at the template with the business's scorecard billing config (the same restricted key and the
product-to-tier map, so a shared Stripe account is split by product):

```
{"command": ["/abs/node", "/abs/business-os/templates/finance/stripe-finance-adapter.mjs", "/abs/hq-data/businesses/<slug>/scorecard-billing.json"], "readOnly": true}
```

That key reads Subscriptions, Invoices, Prices and Products, so income comes from **paid invoices** and refunds from
**credit notes**. Stripe's own fees and plain card refunds need the Charges or Balance permission; they're left out and
the synced file says so.

## The adapter contract

Input on stdin: `{"action":"report","currency":"AUD","timezone":"Australia/Sydney"}`. Output, one JSON object:

```ts
{ version: 1, observedAt: string, currency: string,     // currency must equal the profile's
  notes?: string[],                                     // up to 10, written as comments in the synced file
  entries: [{ date: "YYYY-MM-DD", kind: "income" | "refund" | "fee" | "advertising" | "commission" | "software" | "hosting" | "contractor",
              label: string,                            // a product, tier or vendor; never a person (checked)
              amount: number, currency: string }] }     // positive amounts; daily totals
```

Accounts used (all sub-accounts, so they never clash with the starter ledger): income `Income:Sales:<Label>`, refunds
`Income:Sales:Refunds`, fees `Expenses:Fees:Payments`, spend `Expenses:<Advertising|Commissions|Software|Hosting|Contractors>:<Label>`,
balanced against `Assets:Clearing:Synced`. Don't sync commissions the scorecard already counts as extra spend.
