# Connect your own records (Postgres or Supabase)

> **If you are an AI walking an owner through this:** you will adapt a SQL template to the owner's own schema,
> test it on a throwaway local copy, and only then ask the owner to approve applying it to production. Read
> their schema with their database tools; never open `.env` files or ask for a database password or key in
> chat. Every number must be reconciled once against a query you run by hand before you call it done.

Billing tells the scorecard who pays (see [Connect Stripe and the App Store](/guides/scorecard-billing)). Your
own database knows the rest: **signups**, **activation** (did new people reach the moment your product pays
off?), and **membership history** (who started, upgraded, churned, and when). This guide connects it, through a
function that returns **totals only**, so no customer detail ever leaves your database.

**Owner's time:** about 30 minutes, mostly approving. **Cost:** free.

## Before you start

- HQ is running and the business is connected ([Getting started](/guides/start-here)).
- Your app keeps users and memberships in **Postgres** (Supabase counts). Other databases follow the same idea
  with your own adapter; the contract is in [How the scorecard works](/guides/scorecard).
- You can apply a database migration the way your app normally does (Supabase CLI, SQL editor, or your
  migration tool).

## 1. Decide what you can measure

Map your tables onto three questions (Claude does this from your schema and confirms with you):

| Question | Typical source |
|---|---|
| Who signed up, and when? | your users table (on Supabase: `auth.users.created_at`) |
| Who is paying, on which tier, right now? | your memberships or subscriptions table |
| What is "first value"? | the action that means a new user got it: first project made, first booking, first item tracked |

Report only what you measure. Anything missing shows as "missing" on the scorecard with the reason, never as a zero.

## 2. Adapt the template

Start from `templates/scorecard/records-postgres.sql`. Every line marked `ADAPT:` needs your table, column,
tier or time-zone names. It creates:

- **`hq_membership_changes`**: a history of every tier or status change, filled by a trigger. Without it, a
  table that keeps one row per user can't tell you churn or upgrades. The trigger is wrapped so a fault in it
  can never block a real membership write. History starts the day you apply it: churn and new paying become
  exact once a full week has passed.
- **`hq_scorecard_tokens`**: the SHA-256 of HQ's token. The token itself stays in your Keychain.
- **`hq_scorecard(token, weeks)`**: the totals-only report, in HQ's format. It refuses any call without a valid token.

## 3. Test it on a throwaway copy first

Before production, Claude runs the adapted SQL against a local scratch Postgres loaded with a few invented rows
(your table shapes, made-up people). It checks each number against what the invented rows should give, checks the
output passes HQ's validator, and checks that a membership update still succeeds if the history step fails. Then it
deliberately breaks one rule (for example counting trials as paying) and confirms a check fails.

## 4. Apply it (your yes needed)

Claude shows you the final SQL and what it changes, then applies it through your normal migration path. Afterwards it
confirms on production that:

- the public role can run **only** `hq_scorecard`, and can't read the history or token tables (row-level security on)
- the trigger exists, and the history was seeded with one row per current membership
- the function answers well inside your database's statement timeout (on Supabase the public role has about 3 seconds,
  so keep every query on an index)

## 5. Make the token

In Terminal (pick the item name; `hq-<business>-records` is the convention):

```bash
TOKEN=$(openssl rand -hex 32)
security add-generic-password -a hq -s hq-<business>-records -w "$TOKEN"
printf %s "$TOKEN" | shasum -a 256 | cut -d' ' -f1   # this hash is what goes in the database
unset TOKEN
```

Then store only the hash:

```sql
insert into public.hq_scorecard_tokens (token_sha256, label) values ('<the hash>', 'HQ on my Mac');
```

To revoke it later: `update public.hq_scorecard_tokens set revoked_at = now();` and delete the Keychain item.

## 6. Point HQ at it

Create `scorecard-records.json` in the business's HQ data folder (`~/hq-data/businesses/<slug>/`):

```json
{ "url": "https://<project>.supabase.co", "publicKey": "<your project's public anon key>",
  "keychain": "hq-<business>-records", "function": "hq_scorecard" }
```

The public anon key is the one your website already ships to every browser; it is not a secret. Never use the
service-role key.

- **Records only:** point `scorecard-connection.json` at it:
  `{"command": ["/Users/you/.local/bin/node", "/Users/you/business-os/templates/scorecard/records-adapter.mjs", "/Users/you/hq-data/businesses/<slug>/scorecard-records.json"], "readOnly": true}`
- **With billing (recommended):** keep the billing adapter as the connection, and add to `scorecard-billing.json`:
  `"records": {"command": ["/Users/you/.local/bin/node", "/Users/you/business-os/templates/scorecard/records-adapter.mjs", "/Users/you/hq-data/businesses/<slug>/scorecard-records.json"]}`.
  Then "Billing vs our records" compares your paying members by tier with Stripe and the App Store every day.

## 7. Check it

```bash
npm run hq -- scorecard refresh <slug>
npm run hq -- scorecard show <slug>
```

Reconcile once, by hand, and write the results in the business's vault: signups for one week, the activation of one
cohort, and paying customers by tier. If billing is connected, "Billing vs our records" should read 0.

## Done when

- [ ] `scorecard refresh` succeeds and `scorecard show` lists signups, activation and paying customers.
- [ ] Each exact number matched a query you ran by hand.
- [ ] The public role can execute only the report function (checked on production).
- [ ] The token is in the Keychain, and only its hash is in the database.
- [ ] With billing connected, "Billing vs our records" is 0, or every mismatch has been explained and fixed.

## Good to know: billing traps worth avoiding

These came from a real business's first reconciliation:

- **One payment system must never overwrite a member who pays through another.** A member whose card failed moved
  to the App Store. When the card provider later cancelled the old card subscription, its webhook found their row
  by the leftover card subscription id and downgraded them, over a paid App Store subscription. Card events
  should only change rows whose source is the card provider.
- **Stale end dates expire paying members.** If card writes never clear an old `expires_at`, a nightly "expire
  lapsed members" job will expire someone the card provider still has paid up. Card rows should follow the card
  provider's status; only store subscriptions need date-based expiry.
- **Trials aren't paying customers.** Count them separately.
- **An empty notification log isn't proof notifications are broken.** If nothing renewed or cancelled, nothing
  was sent. Prove delivery with a sandbox purchase.
- **Report the newest week's paying customers as of today**, so the comparison with billing (which is today) is fair.
