# Email & Lifecycle: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** owns the newsletter, onboarding and win-back emails, and the lists behind them.

**It covers:** newsletters; onboarding and nurture sequences; win-back and re-activation; list hygiene.

**Owner's time:** about 30 minutes (most of it signing up for a sending account and creating the Listmonk admin).
**Cost:** free. Listmonk is open source. Sending needs an SMTP account on a free tier (such as Resend's); free tiers
cap how much you can send, so check the provider's limits before a large send. Nothing paid: Klaviyo and Mailchimp's
paid tiers are left out on purpose.

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar.
- Listmonk keeps its data in the Postgres that HQ runs for Postiz (`com.hq.postiz.postgres`, port 5432). Set up
  Postiz first in the [Content guide](/guides/content), or check it's up: `npm run hq -- services status` shows
  `com.hq.postiz.postgres ... :5432 up`.
- Optional: a brand kit, so the **Email Previews** view uses the business's logo, colours and fonts
  (see [Brand kits](/guides/brand-kits)).

## 1. Tools

The department needs **one** email tool: Listmonk or Mautic. Start with Listmonk.

### Listmonk

- **What it's for:** newsletters and mailing lists in one small program (a Mailchimp alternative).
- **Needed or optional:** needed, as one of a group of alternatives (Listmonk or Mautic). Listmonk is the default.
- **Licence or plan:** open source, AGPL-3.0.
- **Set it up:**
  1. Run `/hq:add-tool Listmonk for email`. It downloads the release binary from the project's GitHub releases,
     checks the published checksum, and puts it at `~/.local/opt/listmonk/listmonk` (never `curl | sh`, no Homebrew,
     no Docker). Its config goes in `~/.local/var/listmonk/config.toml`, listening on `127.0.0.1:9000`, with its
     database on the Postiz Postgres.
  2. Register it as a service: `npm run hq -- services add-defaults && npm run hq -- services install`. This adds
     `com.hq.listmonk`, which only appears once both the binary and `config.toml` exist.
  3. The owner opens http://localhost:9000 and creates the admin account on the first visit. They choose the
     password and keep it in their password manager; it never goes in the chat.
  4. Sending: the owner signs up for a free SMTP account themselves (never sign up on their behalf), then types its
     SMTP details into Listmonk's own settings page. The SMTP password lives in Listmonk, not in chat, a repo or
     `services.json`.
- **How HQ checks it:** port 9000 answering (running), or the binary at `~/.local/opt/listmonk/listmonk`
  (installed), shown on the department tab.

### Mautic

- **What it's for:** marketing automation: multi-step journeys, segments and lead scoring.
- **Needed or optional:** the alternative to Listmonk in the same group. Only worth it when you need journeys and
  scoring that Listmonk's lists and campaigns can't do; one email tool is enough.
- **Licence or plan:** open source, GPL-3.0.
- **Set it up:** through `/hq:add-tool Mautic for email`, from source (no Docker on the Mac), bound to 127.0.0.1 and
  run as a `com.hq.*` service. It's a heavier web app with its own database, so check the owner wants it first.
- **How HQ checks it:** shows **installed** once it's in `~/.local/opt/mautic` (where `/hq:add-tool` puts it);
  `/hq:add-tool` also adds its port so the tab can show it **running**.

## 2. Accounts and connections

- **A sending (SMTP) account.** The owner creates it and enters its details in Listmonk. HQ stores nothing about it.
- **The lifecycle connection (optional).** The Email & Lifecycle tab's Overview, Workflows, Delivery and Accounts
  views read a private, per-business lifecycle adapter: activation stages, delivery, send attempts and pause
  controls. It is configured in `$HQ_DATA/businesses/<slug>/lifecycle-connection.json`, never in the repo. For an
  adapter that only reports totals, set `"readOnly": true`, and HQ turns the send and pause controls off. How to
  write one: [Customer lifecycle](/guides/lifecycle). Without it those views show no numbers rather than made-up ones.
- No Composio connection is needed for email.

## 3. Skills to use

- `/marketing:email-sequence`: write an email sequence (onboarding, nurture, launch).
- `/small-business:reactivate`: win back lapsed customers.
- `/small-business:inbox-manager`: triage the inbox.
- `/small-business:crm-autopilot`: keep contacts and follow-ups moving.
- `/hq:lifecycle`: read every automated email flow, report week one and recommend switch to auto, keep in draft or turn off. It never approves a send or switches to auto without your yes. The flows themselves live on the lifecycle centre, `/lifecycle` ([Customer lifecycle](/guides/lifecycle)).
- `/hq:dept email`: plan this department's week from the CEO's latest review.

## 4. Check it's working

- The department tab (http://127.0.0.1:3150/email?tab=tools) shows Listmonk as **running**. From Terminal:
  `curl -s http://127.0.0.1:3150/api/status | jq '.departments[] | select(.slug=="email") | .tools[] | {name, state}'`
  prints `"state": "running"` for Listmonk.
- `npm run hq -- services status` prints `com.hq.listmonk ... running pid <n> · :9000 up`.
- In Listmonk, send a test of a campaign to the owner's own address only, after they say yes, and they confirm it
  arrived.
- If a lifecycle adapter is connected, the tab's Overview shows the business's activation and delivery numbers with
  a recent "observed" time, not a stale warning.
- The CEO tab shows no unresolved findings for this department. There are no email-specific findings; if
  "expected skills aren't installed" lists an Email & Lifecycle skill, reinstall the plugin it belongs to.

## Done when

- [ ] Listmonk (or Mautic) shows as running on the department tab.
- [ ] `com.hq.listmonk` is running and `:9000 up` in `npm run hq -- services status`.
- [ ] The owner has a Listmonk admin login of their own and a working SMTP account entered in Listmonk.
- [ ] A test email reached the owner's own inbox.
- [ ] The lifecycle connection is set up, or the owner has chosen to leave it for later.
- [ ] All four email skills show as ready on the department tab.

## Good to know

- **Nothing is sent without the owner's explicit yes.** Draft, preview and test freely; a campaign to real
  subscribers goes out only when the owner approves that send.
- **Only email people who opted in.** Import lists only of people who agreed to hear from the business, and keep the
  unsubscribe link. The [Legal guide](/guides/legal) covers the rules for your country.
- **Public sign-up forms need Listmonk online.** On this Mac it listens on 127.0.0.1 only, so a form on your public
  website can't reach it. Grow the list by importing opted-in contacts, or host Listmonk where the site can reach it
  (a decision for the owner).
- **Subscriber data stays in Listmonk.** Names and emails never go into HQ profiles, reviews, plans or the scorecard;
  HQ works with totals only.
- **Backups:** the nightly backup stops the Postgres that holds Postiz and Listmonk for about a second and copies it
  (`npm run hq -- backup run` prints a `stage` line for it).
- Use one sending account per business, so one business's complaints can't hurt another's deliverability.
