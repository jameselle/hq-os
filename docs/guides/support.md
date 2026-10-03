# Support & Community: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** answers customers fast, writes the help docs, and runs the community.

**It covers:** help desk and live chat; FAQs and help articles; community (Discord or a forum); reviews and
reputation.

**Owner's time:** about 30 to 45 minutes (an auto-reply tool, a community space, and later a help desk).
**Cost:** free. ManyChat's free plan covers 25 active contacts a month, 1,000 contacts in total, 3 custom keyword
triggers and 1 user. comment-dm is free and unlimited. Everything else here is open source or free.
Intercom and Zendesk are left out on purpose (paid per seat).

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar.
- The business's social accounts are listed in its profile and connected for posting (see [Content](/guides/content)
  and `/hq:connections`). Auto-replies answer comments on those accounts.

## 1. Tools

The department needs one tool from each of three groups: a **DM-automation** tool (ManyChat or comment-dm), a
**help desk** (Chatwoot or Zammad) and a **community** space (Discord or Discourse). Start with the DM tool and the
community; add the help desk when email and chat volume needs it.

### ManyChat

- **What it's for:** automatic replies on socials: comment-to-DM, keyword replies and DM flows on Instagram,
  Facebook Messenger and TikTok (beta).
- **Needed or optional:** one of the DM-automation group (ManyChat or comment-dm). Pick ManyChat for the quickest
  start or for Facebook and TikTok.
- **Licence or plan:** free plan of a proprietary web service: 25 active contacts a month, 1,000 contacts total,
  3 custom keyword triggers, 1 user (pricing since 2 March 2026).
- **Set it up:** the owner signs up at https://app.manychat.com themselves (never sign up on their behalf) and
  connects Instagram, Facebook or TikTok **inside ManyChat**. It's a Meta partner, so no developer app of your own
  is needed. It is not a Composio toolkit, so there is nothing for `/hq:connections` to snapshot.
- **How HQ checks it:** a free web service, shown on the department tab as "web".

### comment-dm

- **What it's for:** your own ManyChat for Instagram, on this Mac: someone comments a keyword on a post, it replies to
  the comment, DMs them a button, checks they follow you and sends the link. Each post gets its own keyword and
  reply. It polls every 15 seconds.
- **Needed or optional:** the other member of the DM-automation group. Pick it for Instagram with no contact limits,
  or when you'll post trial reels (its Meta app token can post them; Composio can't).
- **Licence or plan:** open source, MIT. Free and unlimited: it uses the owner's own Meta app on Standard Access, so
  no App Review is needed for an account they own.
- **Set it up:** follow the project's own `docs/SETUP.md` (the repo is linked from its name on the department tab).
  In short: the owner makes the Instagram account a Creator or Business account, publishes a privacy policy, and
  creates their own Meta app (Claude never creates it for them). Then, in the owner's own Terminal:
  `python3 -m commentdm setup` prompts for the token and puts it in the Keychain, never in a file or the chat.
  The keyword, messages and links go in its `config.json`. `run` is a dry run by default; test with
  `python3 -m commentdm run --live` and a second account on the allowlist, then install the background service
  with `./install-service.sh`.
- **How HQ checks it:** the launchd job `com.commentdm.run` running, or `~/comment-dm/commentdm/flow.py` present
  (installed), shown on the department tab.

### Chatwoot

- **What it's for:** a shared inbox and live chat (an Intercom alternative).
- **Needed or optional:** one of the help-desk group (Chatwoot or Zammad). Pick Chatwoot for chat plus email in one
  inbox.
- **Licence or plan:** open core, MIT.
- **Set it up:** through `/hq:add-tool Chatwoot for support`, from source (no Docker, no Homebrew), bound to
  127.0.0.1 and run as a `com.hq.*` service. A chat widget on your public site needs the server reachable from the
  internet, which a 127.0.0.1 service isn't, so decide with the owner where it runs before installing.
- **How HQ checks it:** no live check yet, so the tab shows it as missing even if installed. `/hq:add-tool` adds
  one (its port) when it installs it.

### Zammad

- **What it's for:** a ticketing help desk (a Zendesk alternative).
- **Needed or optional:** the alternative to Chatwoot. Pick it when support is mostly email tickets with
  assignments and SLAs.
- **Licence or plan:** open source, AGPL-3.0.
- **Set it up:** through `/hq:add-tool Zammad for support`, from source, bound to 127.0.0.1, as a `com.hq.*` service.
- **How HQ checks it:** no live check yet; `/hq:add-tool` adds one when it installs it.

### Discord

- **What it's for:** a community server, announcements and bots.
- **Needed or optional:** one of the community group (Discord or Discourse). Discord is the quick default.
- **Licence or plan:** free, proprietary.
- **Set it up:** the owner creates the account and the server themselves and installs the Mac app from the official
  download (dragged to /Applications). Posting announcements to Discord goes through Postiz with a bot token the
  owner adds inside Postiz (see [Content](/guides/content)).
- **How HQ checks it:** the Discord app installed, otherwise shown as a free web service.

### Discourse

- **What it's for:** a community forum.
- **Needed or optional:** the alternative to Discord, for a searchable public forum that doubles as a help centre.
- **Licence or plan:** open source, GPL-2.0.
- **Set it up:** a forum has to be online to be useful, so it is hosted outside this Mac; agree where with the owner
  first. Never sign up for hosting on their behalf.
- **How HQ checks it:** no live check yet; add one with `/hq:add-tool` once it exists.

## 2. Accounts and connections

- **ManyChat:** Instagram, Facebook or TikTok connected inside ManyChat by the owner. HQ stores nothing.
- **comment-dm:** the owner's own Meta app; its token is in the Keychain, put there by `python3 -m commentdm setup`.
- **Discord:** the owner's server; a bot token, if used, is entered inside Postiz, never in chat.
- **Posting accounts** (Instagram, Facebook and the rest) are the Content department's: `/hq:connections` saves a
  snapshot of ids and statuses only, never keys.

## 3. Skills to use

- `/ig-reply`: draft replies to the comments worth answering.
- `/ig-dm`: DM scripts: the keyword delivery, the first message, follow-ups.
- `/customer-support:ticket-triage`: sort and route tickets.
- `/customer-support:draft-response`: draft a reply to a customer.
- `/customer-support:kb-article`: write a help article.
- `/customer-support:customer-escalation`: handle an escalation.
- `/customer-support:customer-research`: sum up what customers are saying.
- `/small-business:ticket-deflector`: answer the common questions before a ticket exists.
- `/small-business:review-reputation`: track reviews and draft responses.
- `/hq:dept support`: plan this department's week from the CEO's latest review.

## 4. Check it's working

- The department tab (http://127.0.0.1:3150/support) shows the DM tool, the help desk and the community tool as
  running, installed or web. From Terminal:
  `curl -s http://127.0.0.1:3150/api/status | jq '.departments[] | select(.slug=="support") | .tools[] | {name, state}'`.
- **ManyChat:** the owner comments the keyword on a test post from a second account and gets the DM.
- **comment-dm:** `launchctl print gui/$(id -u)/com.commentdm.run` shows `state = running`, and a test comment from
  an allowlisted account gets the reply and the DM.
- **Discord:** the owner can see the server and post in it.
- The CEO tab shows no unresolved findings for this department. There are no support-specific findings; if
  "expected skills aren't installed" lists a Support & Community skill, reinstall the plugin (or personal skill) it
  belongs to.

## Done when

- [ ] One DM-automation tool (ManyChat or comment-dm) answers a test comment on the business's own account.
- [ ] One community space (Discord or Discourse) exists and the owner can post in it.
- [ ] A help desk is installed, or the owner has chosen to wait until volume needs it.
- [ ] Every support skill shows as ready on the department tab.

## Good to know

- **One DM-automation tool per Instagram account.** ManyChat and comment-dm on the same account fight over replies.
- **comment-dm only answers while the Mac is awake and online.**
- **Nothing is sent without the owner's yes.** Skills draft replies, DMs and articles; the owner approves what goes
  out. An auto-reply flow goes live only after the owner has seen its messages and said yes.
- **Customer details stay in the support tools.** Names, handles, emails and ticket contents never go into HQ
  profiles, reviews, plans or the scorecard; a weekly plan can say "14 open tickets, 3 about refunds".
- **Free tools only:** if ManyChat's free limits are outgrown, switch to comment-dm rather than a paid plan.
