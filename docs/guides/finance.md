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
are best done with the bank statements to hand). **Cost:** free. Every tool here is open source; Xero, MYOB and
QuickBooks are left out on purpose (subscription-only).

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

- **None to connect.** HQ never holds bank logins or accounting passwords; transactions come from statements or
  exports the owner downloads.
- **What the scorecard reads from the books:** the growth scorecard's **cost to win** and **payback** come from this
  ledger. HQ adds up spend posted to `Expenses:Advertising` and `Expenses:Commissions` (and their sub-accounts, such
  as `Expenses:Advertising:Search`) over the last 4 weeks, plus any extra spend the scorecard adapter reports, and
  divides it by the new paying customers in those 4 weeks. Payback is cost to win divided by the new monthly revenue
  per new customer. So **post every ad bill and every affiliate or partner commission to those accounts**, or the
  scorecard shows cost to win as missing ("No acquisition spend recorded"). See [Data](/guides/data) and
  [How the growth scorecard works](/guides/scorecard).

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
