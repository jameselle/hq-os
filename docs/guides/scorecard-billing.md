# Connect Stripe and the App Store to the scorecard

Your scorecard gets more accurate when it reads your billing systems directly. Card payments come from
**Stripe**; iPhone and iPad subscriptions come from **App Store Connect**. With either one connected,
the scorecard shows:

- **paying customers** and **MRR** as billed (card discounts included), today
- **set to cancel**: paying members who have scheduled a cancellation
- **card churn, failed payments and recoveries**, week by week, from Stripe's own history
- **billing vs our records**: members on whom your billing and your own membership records disagree.
  Anything above 0 becomes a CEO finding, because that member may have lost access they paid for.

HQ only ever **reads**. Both keys below are read-only, they stay in your Mac's Keychain, and HQ keeps
only totals (counts, sums, tier names), never names or emails. Allow about 10 minutes.

## 1. Stripe: a read-only restricted key

1. In the Stripe Dashboard, switch to the **right account** (each business should have its own) and turn
   **live mode** on.
2. Go to **Developers → API keys → Create restricted key**.
3. Skip the templates ("One-off payments", "Recurring subscriptions and billing" and so on): they grant
   write access. Choose your own permissions instead:

   - **Subscriptions: Read**
   - **Invoices: Read**
   - **Prices: Read**
   - **Products: Read**
   - everything else: **None**

4. Name it `HQ scorecard (read-only)`, create it, and copy the key (it starts `rk_live_`).
5. In Terminal, run this and paste the key when asked (pick your own item name; `hq-<business>-stripe` is the convention):

   ```bash
   security add-generic-password -a hq -s hq-<business>-stripe -w
   ```

   The key goes straight into the Keychain. It is never written to a file or shown again.

6. Note the **product IDs** for each tier you sell (Products → open a product → its ID starts `prod_`).
   A tier can have several products, for example a monthly one and a weekly one.

**If Stripe later says a permission is missing**, its error names the permission and gives a link to edit
the key. Editing permissions keeps the same key, so the Keychain needs no change.

## 2. App Store: a Sales-role App Store Connect API key

1. In App Store Connect, go to **Users and Access → Integrations → App Store Connect API → Team Keys → +**.
2. Name it `HQ scorecard (reports)` and choose the **Sales** role (it can read reports and change nothing).
3. **Download the `.p8` file.** Apple only lets you download it once.
4. Store it in the Keychain (use your file's real name):

   ```bash
   security add-generic-password -a hq -s hq-<business>-appstore -w "$(base64 -i ~/Downloads/AuthKey_XXXXXXXXXX.p8)"
   ```

   Then delete the downloaded file.
5. Write down three IDs. None of them is secret:
   - **Key ID**: shown next to the key in the Team Keys list (10 characters).
   - **Issuer ID**: shown above the keys list (a long ID with dashes).
   - **Vendor number**: in **Payments and Financial Reports** (or Sales and Trends), top left (8 digits).

Apple publishes subscription reports 1 to 2 days behind, so App Store numbers lag by a day or two.

## 3. Tell HQ about them

Create `scorecard-billing.json` in the business's HQ data folder (`~/hq-data/businesses/<slug>/`):

```json
{
  "timeZone": "Australia/Sydney",
  "currency": "AUD",
  "stripe": {
    "keychain": "hq-<business>-stripe",
    "tiers": { "Gold": ["prod_AAA", "prod_BBB"], "Silver": ["prod_CCC"] }
  },
  "appStore": {
    "keychain": "hq-<business>-appstore",
    "keyId": "XXXXXXXXXX",
    "issuerId": "00000000-0000-0000-0000-000000000000",
    "vendorNumber": "12345678",
    "tiers": { "Gold": "gold", "Silver": "silver" }
  }
}
```

- Leave out `stripe` or `appStore` if you only use one.
- App Store `tiers` match a word in the subscription's name (for example "Gold Monthly" is Gold).
- If the business already has its own adapter (signups, activation, its membership records), add
  `"records": { "command": ["/path/to/node", "/path/to/its-adapter.mjs"] }`. Billing numbers are layered on top,
  and its paying-customer breakdown by tier is what "billing vs our records" checks.

Then point the scorecard at the ready-made adapter (`scorecard-connection.json` in the same folder):

```json
{ "command": ["/Users/you/.local/bin/node", "/Users/you/business-os/templates/scorecard/billing-adapter.mjs",
              "/Users/you/hq-data/businesses/<slug>/scorecard-billing.json"], "readOnly": true }
```

## 4. Check it

```bash
npm run hq -- scorecard check-billing <slug>   # which sources answer, with counts only
npm run hq -- scorecard refresh <slug>
npm run hq -- scorecard show <slug>
```

`check-billing` names any source that fails and why: a missing permission, a missing Keychain item, a wrong ID.
The card on the CEO tab updates on the next refresh, and the scorecard refreshes itself every morning at 06:00.

## Good to know

- **Two businesses can share one Stripe account.** Each business's `tiers` lists only its own products, so each
  scorecard counts only its own customers. List every product a business sells, or those customers go uncounted.
- **Test purchases:** add their subscription IDs to `"ignore": ["sub_…"]` under `stripe`, so a test that was
  bought and cancelled doesn't count as a new customer or as churn.
- **Trials are not paying customers.** They're counted separately in the note under paying customers.
- **A mismatch is a real-world problem, not a scorecard bug.** It usually means a billing webhook missed an event,
  or one billing system overwrote a member who pays through the other. Fix the member's record first, then the cause.
- **Revoking access:** delete the key in Stripe or App Store Connect, then
  `security delete-generic-password -s hq-<business>-stripe` (or `-appstore`).
