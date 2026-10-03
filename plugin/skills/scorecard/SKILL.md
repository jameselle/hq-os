---
name: scorecard
description: >
  Connect a business's growth scorecard to its billing and check it: walk the owner through a
  read-only Stripe restricted key and an App Store Connect (Sales role) key, write the business's
  scorecard-billing.json, point the scorecard at the ready-made billing adapter, then verify and
  refresh. Also explains any number on the scorecard. Use when the user says "/hq:scorecard",
  "connect Stripe", "connect the App Store", "connect billing to HQ", "why does the scorecard say X",
  "billing vs our records", or a CEO finding says HQ can't see the business's growth.
---

# Scorecard

The scorecard is the CEO's weekly view of the levers (Get, Keep, Expand, Foundation). It reads a
private, read-only adapter per business. For subscription businesses HQ ships a ready-made one,
`templates/scorecard/billing-adapter.mjs`, which reads Stripe and the App Store.

The step-by-step guides the owner follows are `docs/guides/scorecard-billing.md` (Stripe and the App Store) and
`docs/guides/scorecard-records.md` (their own database: signups, activation, membership history). It is also readable in HQ at
http://127.0.0.1:3150/guides/scorecard-billing, so send them there. Run commands from `$HQ_ROOT`
(default `~/business-os`).

## Rules

- **The owner creates every key.** Never ask them to paste a key into the chat. They store it with the
  `security add-generic-password ... -w` command from the guide, which prompts in their own Terminal.
- **Read-only only.** Stripe: a restricted key with Read on Subscriptions, Invoices, Prices and Products,
  and nothing else. Never accept a full secret key (`sk_live_…`); if one is offered, explain why not.
  App Store: a team key with the Sales role.
- **Never print a secret.** Read keys only inside a script via `security find-generic-password -s <item> -w`,
  and never echo them. `npm run hq -- scorecard check-billing <slug>` is the way to test them.
- **Business files stay in `$HQ_DATA`.** `scorecard-billing.json` and `scorecard-connection.json` live in
  `$HQ_DATA/businesses/<slug>/`, never in the repo.

## Connect billing

1. Ask which they use: Stripe, the App Store, or both. Send them to the guide's sections 1 and 2.
2. Stripe tiers: with the key in place, list their products (read-only) and ask which tier each belongs
   to. Use product IDs (`prod_…`); one tier can have several products. **If two businesses share one
   Stripe account**, list only this business's products, and recommend separate accounts.
3. App Store: ask for the Key ID, Issuer ID and Vendor number (not secret), and which word in each
   subscription name marks its tier.
4. Write `scorecard-billing.json` (format in the guide, section 3). If the business already has its own
   adapter, put it under `records.command` so billing is layered on top of it.
5. Point `scorecard-connection.json` at `templates/scorecard/billing-adapter.mjs` with the config path, keeping
   any existing records adapter as `records`, not replacing it.
6. Check: `npm run hq -- scorecard check-billing <slug>`. Every configured source must say `ok`. A
   `FAILED` line names the cause: a missing permission (Stripe's message names it and links the key's edit page),
   a missing Keychain item, or a wrong ID.
7. Refresh and show: `npm run hq -- scorecard refresh <slug>` then `npm run hq -- scorecard show <slug>`.
   Compare paying customers with what the owner sees in Stripe and App Store Connect before calling it done.

## Explain a number

Read `npm run hq -- scorecard show <slug>`. Each line says whether it's exact, approximate (and why) or
missing (and what would fix it). Two need care:

- **Billing vs our records above 0** means a real member's access is probably wrong: paying but locked out,
  or not paying but still in. Point to the breakdown (which tier, billing count vs records count), then
  help find the member in the business's own records. Changing a production record needs the owner's yes.
- **Trials** are never paying customers. They're counted in the paying-customers note.
