---
name: connections
description: >
  See and manage the accounts HQ can post through: refresh HQ's snapshot of
  Composio connections (Instagram, YouTube, Pinterest, Facebook, LinkedIn, X,
  TikTok, WoopSocial, Search Console …) and the accounting system a business's
  costs come from (Xero, read-only), or connect a new account when the owner asks.
  Use when the user says "/hq:connections", "what accounts are connected",
  "connect TikTok/Facebook/LinkedIn", "connect Xero", "refresh connections", or a
  CEO finding says a channel isn't connected or connection status is unknown.
---

# Connections

HQ posts through **Composio**: its already-approved apps mean no developer apps of your
own. **WoopSocial** (TikTok, audited) is itself a Composio toolkit (`woop_social`).
**Postiz** covers bot-token channels (Discord, Telegram …) and has its own connections
at localhost:4200.

HQ never holds a Composio key. It only knows what this skill saves: a **snapshot**
of connection ids, aliases, names and statuses, in `$HQ_DATA/connections.json`.

Run commands from `$HQ_ROOT` (default `~/business-os`).

## Refresh the snapshot (default)

1. List every publishing-relevant toolkit with the Composio connector's
   `COMPOSIO_MANAGE_CONNECTIONS`, `action: "list"`. That call has no side effects. Toolkits:
   `instagram, youtube, pinterest, facebook, linkedin, twitter, tiktok, woop_social, google_search_console`,
   plus any toolkit a business profile's channel names.
2. Build this JSON, keeping **only** these fields. Never copy tokens, keys, emails or any other
   user_info. The save command refuses anything that looks like a credential.
   ```json
   { "checkedAt": "<now, ISO>", "source": "composio-mcp",
     "toolkits": { "instagram": { "status": "active",
       "accounts": [ { "id": "instagram_abc-def", "alias": "acme", "name": "acmeco", "status": "ACTIVE" } ] } } }
   ```
   `name` is the platform username or channel title. A toolkit with no accounts gets
   `"accounts": []` and its reported status.
3. `npm run hq -- connections save /tmp/hq-connections.json`, then
   `npm run hq -- connections show`.
4. For the current business, `npm run hq -- publishing <slug>` shows each channel's route and state.
   Report the channels that aren't connected.

## Connect an account (only when the owner asks)

- **Composio toolkit** (instagram, facebook, linkedin, twitter, youtube, pinterest …):
  `COMPOSIO_MANAGE_CONNECTIONS` with `action: "add"` and an alias like the business slug.
  Show the returned link as a clickable markdown link and say it **expires in 10 minutes**.
  When they reply, list again, confirm `ACTIVE`, and refresh the snapshot.
- **WoopSocial (TikTok):** the owner creates a free WoopSocial account and connects TikTok
  there. Then they add WoopSocial's API key to the `woop_social` toolkit in Composio themselves.
  **Never** ask for the key in chat. Then refresh.
- **Xero (read-only, for a business's running costs):** Composio has no ready-made Xero sign-in, so the
  owner first registers their own free Xero web app (developer.xero.com/app/manage; redirect URI
  `https://backend.composio.dev/api/v1/auth-apps/add`, or the one Composio's Xero setup page shows) and pastes its
  Client ID and secret into Composio's Xero auth setup themselves, with read-only scopes
  (`offline_access accounting.reports.read accounting.transactions.read accounting.settings.read accounting.contacts.read`).
  **Never** ask for the secret in chat. Then `add` the `xero` toolkit as above, and once it's `ACTIVE`, run
  `XERO_GET_CONNECTIONS` to find the organisation's tenant id and write
  `$HQ_DATA/businesses/<slug>/finance/costs-connection.json` (`{"source":"xero","composioAccount":"<id>","tenantId":"<id>","share":1}`),
  then `npm run hq -- finance costs refresh <slug> --force`. Full steps: the Finance guide, "Connect your accounting
  system". The same bring-your-own-app steps apply to other toolkits without managed sign-in (MYOB, QuickBooks).
- **Postiz channels:** the owner connects them in Postiz (localhost:4200). Nothing to snapshot.
- **ManyChat (auto-replies):** not a Composio toolkit. The owner connects Instagram, Facebook
  or TikTok inside ManyChat (app.manychat.com); ManyChat is a Meta partner, so there's no
  developer app. Keep one DM-automation tool per Instagram account. Nothing to snapshot.
- Pin a specific account to a business by adding it to the profile's channel:
  `"instagram": { "handle": "@acme", "via": "composio", "account": "instagram_abc-def" }`.

## Traps

- **Two Composio projects.** The claude.ai connector and any app using its own
  `COMPOSIO_API_KEY` can be different projects, with different accounts and id formats
  (`instagram_abc-def` here versus `ca_…` in the SDK). A connection shown here proves nothing
  about another app's project, and the reverse is also true.
- A toolkit showing status `initiated` with no accounts just means nothing is connected.
- Never remove a connection unless the owner explicitly asks. Other projects may depend on it.

## Rules

- Never open `.env` files, and never ask for, print or store keys or tokens.
- Connecting an account is the owner's decision. Refreshing the snapshot is always fine.
