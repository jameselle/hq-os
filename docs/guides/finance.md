# Finance: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** keeps the books, chases invoices, watches cash, and gets BAS/GST (or your country's
sales tax) and tax done.

**It covers:** bookkeeping and reconciliation; invoices and bills; cash flow; month-end, BAS/GST and tax.

**Owner's time:** about 20 minutes to start (opening balances and the first month's transactions take longer, and
are best done with the bank statements to hand). **Cost:** free. Every tool here is open source. HQ never requires
Xero, MYOB or QuickBooks (they're subscription-only), but a business that already pays for one can connect it
read-only so its running costs flow into the ledger: see "Connect your accounting system (Xero) for costs" below.

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar. Its profile's
  `currency` is the currency the books are kept in.
- The nightly backup is set up ([Security guide](/guides/security)): the ledger lives in `$HQ_DATA`, which it covers.

## 1. Tools

The department needs **one** set of books: Beancount + Fava, ERPNext or GnuCash. Start with Beancount + Fava: it is
plain text, so Claude can read and write it, and it is what the growth scorecard reads ad spend from.

### Beancount + Fava

- **What it's for:** plain-text, double-entry accounting with a web UI. One ledger per business.
- **Needed or optional:** one of the books group (Beancount + Fava, ERPNext or GnuCash). The default.
- **Licence or plan:** open source (Fava MIT; Beancount GPL-2.0).
- **Set it up:**
  1. Run `/hq:add-tool Beancount + Fava for finance`. It installs both as Python tools with `uv tool install`
     (`beancount`, which gives `bean-check`, and `fava`), linked into `~/.local/bin`. No Homebrew, no Docker.
  2. Register Fava as a service: `npm run hq -- services add-defaults && npm run hq -- services install`. This adds
     `com.hq.fava`, which serves every business's ledger in one Fava on `127.0.0.1:5055`. It only appears once
     `fava` is on PATH.
  3. Create the business's ledger: `npm run hq -- finance init <slug>`. It writes
     `$HQ_DATA/businesses/<slug>/finance/ledger.beancount` if there isn't one (`/hq:new-business` already makes it,
     and `init` never overwrites), runs `bean-check`, prints `ledger: <path> (bean-check: OK)`, and restarts Fava so
     the books appear.
  4. The starter ledger opens these accounts in the profile's currency: `Assets:Bank:Operating`,
     `Assets:Receivables`, `Liabilities:CreditCard`, `Liabilities:SalesTax` (GST or VAT collected),
     `Equity:Opening-Balances`, `Income:Sales`, `Expenses:Advertising`, `Expenses:Commissions`, `Expenses:Contractors`,
     `Expenses:Fees:Bank`, `Expenses:Hosting` and `Expenses:Software`. Add any others the business needs with an `open`
     line. A ledger made before October 2026 has no `Expenses:Commissions`: add `<date> open Expenses:Commissions
     <CURRENCY>` before posting affiliate or partner commissions, or `bean-check` rejects them.
  5. Enter opening balances and transactions with the owner, one transaction per money movement. Claude can draft
     and append them; the owner checks them against the bank.
- **How HQ checks it:** port 5055 answering (running), or `fava` or `bean-check` on PATH (installed), shown on the
  department tab.

### Connect your accounting system (Xero) for costs

Income comes from billing, but costs live in the accounting system. Without them the Finance tab's margin, and the
scorecard's cost to win and payback, all read better than they are (the CEO says "The books have income but no
costs"). If the business already pays for Xero, connect it **read-only** and HQ imports the monthly cost totals per
account into `finance/costs-xero.beancount`. HQ never writes to Xero, and never needs it: a business without one adds
its costs to the ledger by hand.

**What gets imported:** Xero's profit and loss report by month, last 12 months. Only the expense lines (Cost of
Sales and Operating Expenses), one transaction per account per month, dated the month's last day, with no payees.
Income, totals and profit rows are skipped (income already comes from billing). The file is rewritten whole on every
import, checked with `bean-check`, and left as it was if the check fails. Months before the ledger's own start get
their own `open` lines in that file, balanced against `Liabilities:Imported:Xero`, so older months check out too.

**Where each Xero account lands:** by its name first, then by the report section it sits in.

| Xero line | Ledger account | Counts toward |
|---|---|---|
| name contains advertising, marketing, promotion, ads, sponsor (any section) | `Expenses:Advertising:<Account>` | cost to win |
| name contains affiliate, partner, referral, commission (any section) | `Expenses:Partnerships:<Account>` | cost to win |
| any other line under **Less Cost of Sales** (or Cost of Goods Sold) | `Expenses:CostOfSales:<Account>` | gross margin |
| anything else (software, wages, travel, hosting kept under Operating Expenses …) | `Expenses:Operating:<Account>` | operating costs |

Affiliates and partners go to `Expenses:Partnerships`, **not** `Expenses:Commissions`, and count toward cost to win
like advertising. The growth scorecard's adapter may also report the commissions the product pays its affiliates
(`extraSpend`); once the ledger holds `Expenses:Partnerships` postings, the scorecard and unit economics leave those
out, so the same money is never counted twice. Lines in Xero's Cost of Sales section (hosting, stock, packaging) are
the direct cost of serving customers: unit economics takes them off revenue for the **gross margin**. An import made
before 2026-10-07 put them in `Expenses:Operating`; the next refresh (or `npm run hq -- finance costs refresh <slug>
--force`) rewrites the file with the new accounts.

**Set it up (about 15 minutes, once):**

1. **Register your own free Xero app.** Composio has no ready-made Xero sign-in, so you bring your own OAuth app.
   Go to [developer.xero.com/app/manage](https://developer.xero.com/app/manage), sign in with your Xero login, and
   choose **New app**. Pick **Web app**, give it a name (say "Demo Coffee HQ"), set **Company or application URL**
   to your website, and set **Redirect URI** to `https://backend.composio.dev/api/v1/auth-apps/add`. If Composio's
   Xero setup page shows a different redirect URL, use Composio's.
2. **Copy the app's keys.** After you create it, the app's **Configuration** page shows the **Client ID**. Click
   **Generate a secret** for the **Client secret**: it's shown once, so keep the page open for the next step.
3. **Give them to Composio, not to Claude.** In [dashboard.composio.dev](https://dashboard.composio.dev), open the
   apps you can connect, choose **Xero**, and set up its auth with your own app: paste the Client ID and Client
   secret there (never into a chat). Ask for read-only scopes only:
   `offline_access accounting.reports.read accounting.transactions.read accounting.settings.read accounting.contacts.read`.
4. **Connect your organisation.** Run `/hq:connections connect xero` (or follow the sign-in link Claude's Composio
   connector gives you), sign in to Xero and pick the organisation. Then ask Claude to list your Xero connections
   with the `XERO_GET_CONNECTIONS` tool: note the organisation's **tenant id** and the Composio **account id**
   (it looks like `xero_word-word`). Neither is a secret.
5. **Tell HQ which organisation is this business's.** Write
   `$HQ_DATA/businesses/<slug>/finance/costs-connection.json`:
   ```json
   { "source": "xero", "composioAccount": "xero_demo-coffee", "tenantId": "00000000-0000-4000-8000-000000000001", "share": 1, "currency": "AUD" }
   ```
   `currency` is optional and, when set, must be the Xero organisation's base currency. The ledger's currency (the
   profile's `currency`) must be the same: HQ doesn't convert currencies and refuses the import if they differ.
6. **Run the first import:** `npm run hq -- finance costs refresh <slug> --force`. It prints the months, the totals per
   category (Advertising, Partnerships, Operating) and the file it wrote. Check it any time with
   `npm run hq -- finance costs <slug>`; the Finance tab shows the costs and says they came from Xero.

**From a file instead.** With a report you fetched yourself (the raw `XERO_GET_PROFIT_LOSS_REPORT` response, with
`timeframe` `MONTH` and `periods` up to 11) or another system's export turned into HQ's own shape, import it by hand:

```
npm run hq -- finance import-costs <slug> report.json --from xero --currency AUD [--share 0.5] [--since 2026-01]
npm run hq -- finance import-costs <slug> costs.json --from json
```

The generic shape: `{"version": 1, "source": "myob", "currency": "AUD", "months": [{"month": "2026-09", "lines":
[{"account": "Rent", "section": "Operating Expenses", "amount": 500}]}]}` (amounts positive, a credit negative). It
writes `finance/costs-<source>.beancount`.

**The monthly refresh.** The `com.hq.finance` job runs daily at 05:30 and refreshes each business with a
`costs-connection.json` once a month, from the 3rd (so the month just gone has been reconciled). It fetches the last
12 complete months and rewrites the costs file, so late changes in Xero flow through. Your Xero connection lives in
Claude's Composio connector, which only a Claude session can use, so the job runs Claude Code headless, allowed only
the Composio workbench: HQ writes the one read-only cell (Xero's organisation, for the base currency, and the profit
and loss report), the run passes it on unchanged, and HQ reads the report from the tool's output, never from the
model's words. Only the currency and the report's rows come back; never the organisation's address or tax details.
Every attempt is recorded in `finance/costs-refresh.json`; a failed one is retried the next day, and the CEO shows
"The monthly costs import failed" until it works. Install the job with `npm run hq -- services add-defaults && npm
run hq -- services install` (or add `com.hq.finance` to `services.json` by hand).

**One company, several businesses.** When one company's Xero pays for more than one business, give each business its
share: `"share": 0.6` in one business's `costs-connection.json` and `0.4` in the other's (or `--share` on a manual
import). Every line is multiplied by it. Or put all the costs on one business (`"share": 1`) and record in the other's
brain that its costs are carried there. `"since": "2026-01"` (or `--since`) skips earlier months.

**Costs that belong somewhere else.** HQ imports account totals, not suppliers, so take a specific charge out with an
adjustment: a cost another business should carry, or a charge you're getting refunded. List them in
`finance/costs-adjustments.json` in the business's folder:

```json
[{ "month": "2026-09", "account": "Software & Subscriptions", "amount": 1200, "reason": "Annual design tool for another business" }]
```

Every import applies them (the monthly refresh too), before any share, and the costs file says what was taken out and
why. An adjustment bigger than its line stops the import instead of guessing. When a refund arrives in your
accounting system, remove its adjustment so it isn't taken out twice.

**Other accounting systems.** The same "bring your own OAuth app" steps apply to any Composio toolkit without a
ready-made sign-in (MYOB, QuickBooks and others): register a free developer app with the provider, set its redirect
URL to the one Composio's setup page shows, paste the client id and secret into Composio yourself, and connect
with read-only scopes. Until HQ reads that system directly, export its monthly profit and loss into the generic shape
above and import it with `--from json`.

### Unit economics

Once the ledger holds income and costs, HQ works out the business's unit economics for the last closed month (the
month in progress is left out) and compares it with the average of the 3 months before. It is the number behind the
**Unit economics check** workflow, shown under **Unit economics** on this tab, on the Data tab and in a monthly brief.

- **From the ledger:** revenue (income less refunds), total costs, acquisition spend (`Expenses:Advertising`,
  `Expenses:Partnerships` and `Expenses:Commissions`), operating costs (the rest), net margin, burn (costs less
  revenue), gross margin (only when payment fees or cost of sales are recorded) and the top 5 cost lines with their
  change from the month before.
- **From the growth scorecard:** paying customers, MRR, new paying customers (every week of the month must be known)
  and churn (weekly churn compounded to the month, at least 2 weeks known).
- **Worked out from both:** revenue per paying customer (MRR over paying customers), cost per paying customer,
  customer lifetime (1 / monthly churn), lifetime value, cost to win (acquisition spend over new paying customers),
  lifetime value to cost to win, payback months and break-even paying customers (costs over revenue per customer).
- **Nothing is zero-filled.** A number without its inputs reads "not measured" with the reason, for example "No
  cost of sales or payment fees in the ledger". Where the scorecard or the analytics adapter measures a number
  itself (cost to win, lifetime value), its reading wins on the Data tab and HQ's fills the gap.

For Demo Coffee (an invented coffee club): September revenue $2,400, costs $5,372, burn $2,972; 80 paying members on
$2,400 of MRR is $30 each, so break-even needs 180 paying members. 10 new members against $400 of ads and cafe
partners is a cost to win of $40, paid back in about 1.4 months.

**The brief.** `npm run hq -- finance unit-economics <slug>` prints it; add `--save` to keep it as a finance plan
(with a copy in the vault's Finance plans). The workflow reads **live** when the ledger has at least 3 closed months
with both income and costs, the costs reach the month before last or later, and the numbers were worked out this
month (the daily analytics refresh, or a saved brief). Otherwise it reads partial and says what's missing.

**What the CEO flags.** A cost line more than 50% above its average over the 3 months before, and higher by more than
$250 or 5% of the average month's costs (whichever is bigger): "Packaging cost $900 in Sep 2026, up from an average
of $200". And costs at least 3x revenue for 3 months running, with the paying members needed to break even. Mark
either done and it stays hidden until the next month is worked out.

### ERPNext

- **What it's for:** full accounting, invoicing and inventory (a Xero alternative).
- **Needed or optional:** an alternative in the books group. Move to it when the business needs invoicing, inventory
  or payroll that a plain-text ledger can't handle.
- **Licence or plan:** open source, GPL-3.0.
- **Set it up:** through `/hq:add-tool ERPNext for finance`, from source (no Docker), bound to 127.0.0.1 and run as
  a `com.hq.*` service. It's a large install with its own database; check the owner wants it first. The owner
  creates the administrator account in the browser.
- **How HQ checks it:** shows **installed** once it's in `~/.local/opt/erpnext` (where `/hq:add-tool` puts it);
  `/hq:add-tool` also adds its port so the tab can show it **running**.

### GnuCash

- **What it's for:** double-entry desktop accounting.
- **Needed or optional:** an alternative in the books group, for an owner who prefers a desktop app.
- **Licence or plan:** open source, GPL-2.0-or-later.
- **Set it up:** the owner downloads the official `.dmg` from the GnuCash site and drags the app to /Applications
  (Claude doesn't script GUI installers).
- **How HQ checks it:** the GnuCash app in /Applications or ~/Applications (installed). Note that the scorecard
  only reads ad spend from the Beancount ledger, so with GnuCash as the books, cost to win stays missing unless the
  spend is also posted in the Beancount ledger or reported by the scorecard adapter.

### Firefly III

- **What it's for:** money tracking and budgets.
- **Needed or optional:** optional. It's personal budgeting, not company books, so it never counts against the
  department's readiness.
- **Licence or plan:** open source, AGPL-3.0.
- **Set it up:** only if the owner asks, through `/hq:add-tool`, bound to 127.0.0.1.
- **How HQ checks it:** shows **installed** once it's in `~/.local/opt/firefly-iii` (where `/hq:add-tool` puts it);
  `/hq:add-tool` also adds its port so the tab can show it **running**.

## 2. Accounts and connections

- **Nothing you have to connect.** HQ never holds bank logins or accounting passwords; transactions come from
  statements or exports the owner downloads, and income syncs from billing ([Finance sync](/guides/finance-sync)).
- **Optional: your accounting system, for costs.** If the business already keeps its books in Xero, HQ can read its
  profit and loss report every month and post the running costs into the ledger. Set up below.
- **What the scorecard reads from the books:** the growth scorecard's **cost to win** and **payback** come from this
  ledger. HQ adds up spend posted to `Expenses:Advertising`, `Expenses:Partnerships` and `Expenses:Commissions` (and
  their sub-accounts, such as `Expenses:Advertising:Search`) over the 4 weeks ending with the scorecard's newest week,
  plus any extra spend the scorecard adapter reports (left out once the ledger holds partnerships, so it isn't counted
  twice), and divides it by the new paying customers in those 4 weeks. Monthly totals imported from the accounting
  system are **spread evenly over their month's days**, so each 4-week window gets its share; days in a month that
  isn't imported yet are estimated at the last imported month's daily rate (see
  [How the growth scorecard works](/guides/scorecard)). Payback is cost to win divided by the new monthly revenue per
  new customer. So **post every ad bill and every affiliate or partner commission to those accounts**, or the
  scorecard shows cost to win as missing ("No acquisition spend recorded"). See [Data](/guides/data).

  ```
  2026-10-01 * "Ad platform" "Search ads, week 40"
    Expenses:Advertising      120.00 AUD
    Liabilities:CreditCard   -120.00 AUD
  ```

  Refunds subtract. A posting in another currency counts only if it carries a price (`@`, `@@` or `{cost}`);
  without one it is skipped. Files pulled in with `include "..."` are read too.

## 3. Skills to use

- `/small-business:cash-flow-snapshot`: where the cash stands.
- `/small-business:invoice-chase`: chase unpaid invoices.
- `/small-business:pay-the-bills`: what to pay and when.
- `/small-business:close-month`: close the month.
- `/small-business:tax-prep`: get ready for tax (BAS/GST, VAT or sales tax, and the annual return).
- `/finance:reconciliation`: reconcile the ledger against the bank.
- `/finance:journal-entry`: draft journal entries.
- `/finance:financial-statements`: P&L and balance sheet.
- `/finance:variance-analysis`: why the numbers moved.
- `/hq:dept finance`: plan this department's week from the CEO's latest review.

## 4. Check it's working

- The department tab (http://127.0.0.1:3150/finance) shows Beancount + Fava as **running**. From Terminal:
  `curl -s http://127.0.0.1:3150/api/status | jq '.departments[] | select(.slug=="finance") | .tools[] | {name, state}'`.
- `npm run hq -- services status` prints `com.hq.fava ... running pid <n> · :5055 up`.
- `npm run hq -- finance init <slug>` prints `ledger: .../finance/ledger.beancount (bean-check: OK)`. If it prints
  errors instead, fix the lines they name.
- http://localhost:5055 shows the business's books under its own name (the ledger's title).
- After an ad bill is posted, the next `npm run hq -- scorecard refresh <slug>` and `scorecard show <slug>` show a
  cost to win instead of "No acquisition spend recorded" (if new paying customers are reported too).
- The CEO tab has no **No accounting system** (`no-books`) finding. It clears as soon as any books tool (Beancount +
  Fava, ERPNext or GnuCash) is installed or running.

## Done when

- [ ] Beancount + Fava (or ERPNext or GnuCash) shows as live on the department tab, and `no-books` is gone.
- [ ] `com.hq.fava` is running and Fava shows the business's ledger at http://localhost:5055.
- [ ] `npm run hq -- finance init <slug>` reports `bean-check: OK`.
- [ ] Opening balances are entered and the owner has checked them against the bank.
- [ ] `Expenses:Commissions` is opened if the business pays commissions, and ad spend is being posted to
      `Expenses:Advertising`.
- [ ] Every finance skill shows as ready on the department tab.
- [ ] If the business already uses Xero: `finance/costs-connection.json` is written, `npm run hq -- finance costs <slug>`
      lists the imported months, `com.hq.finance` is installed, and the CEO has no "income but no costs" finding.

## Good to know

- **Claude drafts, the owner approves.** Paying a bill, sending an invoice reminder or lodging a tax return happens
  only with the owner's explicit yes, and anything lodged with a tax office is checked by the owner or their
  accountant.
- **Never paste bank or card logins into chat,** and never commit a statement export to a repo; keep exports in the
  business's folder under `$HQ_DATA`.
- **Customer names stay out of HQ's reviews and the scorecard.** The ledger may name a payee where the books need
  it; HQ's reviews, plans and scorecard use totals only.
- **Each business has its own ledger.** Fava shows them all in one place; check the title before entering anything.
- A new business's books appear in Fava after `/hq:new-business` or `finance init`, which restart `com.hq.fava`.
