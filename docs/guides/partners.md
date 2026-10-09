# Partnerships: from found to live

> **If you are an AI walking an owner through this:** nothing reaches a partner without the owner's yes. You find,
> screen, score and write. HQ itself emails only the email drafts the owner approved (to the business email a partner
> publishes, from the business's own verified sender); the owner sends every DM and contact form and tells HQ when
> they did. Never approve a draft for the owner, never sign in anywhere to research, never ask for a password or key
> in chat, and use the demo business for any example.

Partnerships live in the **Sales & Partnerships** department. Open it from the side nav (Sales & Partnerships, then
**Partnerships** underneath), from the card on the department tab, or go straight to `/sales/partners`
(`/partners` works too). The board has four columns:

| Column | Statuses | Means |
|---|---|---|
| Prospects | prospect, shortlisted | Found and screened; nobody has been contacted |
| In talks | contacted, replied, negotiating | The owner has written to them |
| Live | live, paused | Running, with their own tag on their links |
| Closed | declined, ended | Kept so nobody adds them again |

Each card shows the handle, followers (with where and when they were read on hover), fit, a compliance badge, the
campaign it serves and the last thing that happened, plus **Follow-up ready**, **Email approved**, **Email failed**
or **Opted out** when they apply, and a one-tap send for the newest DM or contact form draft. A partner's page has
the outreach drafts with their buttons, the history, the deal terms and what the partner's tag brought. The workflows **Partner program** and **Podcast
and creator appearances** run from here.

## What a partner is

One JSON file per partner at `~/hq-data/businesses/<slug>/partners/<id>.json` (owner-only), mirrored to the
business's vault as `Departments/Sales & Partnerships/Partners.md`. The id is the platform plus the handle
(`instagram-demo-brew-tips`).

| Field | What goes in it |
|---|---|
| `name`, `handle`, `platform`, `url` | Who they are: the public `@handle` on Instagram, TikTok, YouTube or X, or the show, newsletter or site name; the public profile link (https, no query string). Platforms: instagram, tiktok, youtube, x, podcast, newsletter, website |
| `country`, `type` | Two-letter country code; tipster, analytics, podcast, media, creator, affiliate or newsletter |
| `followers`, `followersSource`, `followersAt` | Public audience size, where it was read and the date. `null` when it isn't public: never a guess |
| `fit` | `level` high, medium or low, and a one-line `reason` |
| `compliance` | `status` ok, check or avoid, with `notes` (required for check and avoid) |
| `contact` | One public business route: `{ "route": "dm" }`, a contact form link, or the business email they list for enquiries. Never a phone number |
| `status` and `history` | The pipeline stage, with a dated entry for every move |
| `campaigns` | The campaign ids it serves |
| `deal` | `terms` in words, plus optional `commission` (per paying customer) and `fee` (flat), both in the business's currency |
| `tracking` | `tag`: the `utm_campaign` value on their links; `link`: a partner link if the business issues one |
| `drafts` | Outreach drafts: channel, subject (email), body, and status draft, approved, sent-by-owner, sent-by-hq (with the provider's message id) or failed (with the error); a follow-up says which draft it follows |
| `doNotContact` | Set when the partner opted out: declined for good, never drafted or emailed again |
| `notes` | Anything worth remembering, dated |

The rules HQ enforces on every write:

- **An avoid partner never moves past prospect.** It can only be declined or ended, and no outreach is written for it.
- **Live needs compliance ok.** HQ also warns when a partner goes live with no tag, no campaign or no terms.
- **Nothing goes out without the owner's yes.** A new draft is always a draft. It becomes "sent-by-owner" only when
  the owner says they sent it (`partner sent`), and "sent-by-hq" only when HQ emailed an approved email draft and the
  provider returned a message id. An import can't mark one sent. DMs and contact forms are never sent by HQ.
- **An opt-out is final.** `partner optout` (or **They opted out** on the partner's page) declines the partner for
  good: no new drafts, no approvals, no sends, no follow-ups, and it can't be reopened.
- **No personal data** beyond one public business contact route. Emails anywhere else, phone numbers, ids and keys
  are refused. No em or en dashes in any text.

## Add partners

Research them with `/hq:partners` (public sources only), or write the list yourself:

```json
[
  {
    "name": "Demo Brew Tips",
    "handle": "@demo.brew.tips",
    "platform": "instagram",
    "url": "https://www.instagram.com/demo.brew.tips/",
    "country": "AU",
    "type": "creator",
    "followers": 48200, "followersSource": "public profile", "followersAt": "2026-11-02",
    "fit": { "level": "high", "reason": "Weekly home brewing guides to home coffee drinkers" },
    "compliance": { "status": "ok", "notes": "" },
    "contact": { "route": "dm" },
    "campaigns": ["cold-brew-month-2026-11-02"]
  },
  {
    "name": "The Demo Coffee Hour",
    "handle": "The Demo Coffee Hour",
    "platform": "podcast",
    "url": "https://podcast.example/demo-coffee-hour",
    "type": "podcast",
    "followers": null,
    "fit": { "level": "medium", "reason": "Interviews small roasters; listeners are home baristas" },
    "compliance": { "status": "ok", "notes": "" },
    "contact": { "route": "form", "detail": "https://podcast.example/contact" }
  }
]
```

```bash
npm run hq -- partner add demo-coffee partners.json      # one partner or a list; all or nothing
npm run hq -- partner add demo-coffee partners.json --update   # merge new details into existing partners
npm run hq -- partner list demo-coffee [--status shortlisted] [--campaign cold-brew-month]
npm run hq -- partner show demo-coffee demo-brew-tips    # a unique part of the id is enough
```

## Move them along

```bash
npm run hq -- partner status demo-coffee demo-brew-tips shortlisted --note "Best fit this week"
echo '{"channel":"dm","body":"Hi, we love your cold brew guides ..."}' | npm run hq -- partner draft demo-coffee demo-brew-tips -
npm run hq -- partner approve demo-coffee demo-brew-tips 1   # the owner likes the wording
npm run hq -- partner sent demo-coffee demo-brew-tips 1      # the owner sent it themselves: moves to contacted
npm run hq -- partner status demo-coffee demo-brew-tips replied --note "Keen, asked for terms"
npm run hq -- partner note demo-coffee demo-brew-tips "Prefers a flat fee for two reels"
npm run hq -- partner status demo-coffee demo-brew-tips live
```

## Sending: who sends what

| Channel | Who sends it | How |
|---|---|---|
| Email, to a business email the partner publishes | HQ, once the owner approves that draft | From the business's own sender, on a weekday between 9am and 5pm business time, up to the daily cap |
| DM | The owner | **Copy and open Instagram** (or TikTok, YouTube, X) copies the words and opens the profile in a new tab; paste, send, then **Mark as sent** |
| Contact form | The owner | **Copy and open contact form** opens the form; paste, send, then **Mark as sent** |

No part of HQ automates a social site or fills in a form.

### Connect a sender (once per business)

HQ sends through a Composio connection in Claude Code, the same way it posts to social accounts: a headless Claude
Code run allowed only the Composio workbench, with every cell checked by a sha256 so a copy that isn't exact refuses
to run. No key is ever stored by HQ.

1. In Claude Code, connect **Resend** (with the business's domain verified in Resend) or **Gmail** (for the address
   the email comes from) through Composio, and note the connection id (`/hq:connections` lists it).
2. Write the sender config and save it with `npm run hq -- partner outreach demo-coffee --set outreach.json`:

```json
{
  "sender": { "via": "composio-resend", "account": "<the Composio connection id>", "from": "Jo from Demo Coffee <jo@coffee.example>", "replyTo": "jo@coffee.example" },
  "dailyCap": 10,
  "companyLine": "Demo Coffee is run by Demo Coffee Pty Ltd, coffee.example"
}
```

It lives at `~/hq-data/businesses/<slug>/partners/outreach.json`. `"via": "composio-gmail"` sends from the
connected Gmail account instead. `"paused": true` stops sending without losing anything.

3. Send yourself a test (only the business's own address is allowed; no partner record is touched):
   `npm run hq -- partner send demo-coffee --test-to jo@coffee.example` (add `--id demo-brew-tips` to see a real
   draft exactly as it would go).

Until a sender is connected, the board says **Email sending is off: connect a sender**, and approved email drafts
wait (or the owner sends them and marks them sent).

### The footer and the opt-out (Spam Act)

Every email HQ sends carries this footer, added when the draft is written (or with `partner footer demo-coffee`
for older drafts), and HQ refuses to send a draft without it:

```text
--
Jo from Demo Coffee
https://coffee.example
Demo Coffee is run by Demo Coffee Pty Ltd, coffee.example

If you'd rather not hear from us, reply 'no thanks' and we won't contact you again.
```

It identifies who is writing, the business, its website and who runs it, and gives a working way to opt out (a
reply, plus a List-Unsubscribe header pointing at the reply address). When a partner replies "no thanks", record it
straight away: `npm run hq -- partner optout demo-coffee demo-brew-tips --note "Replied no thanks"`. Only the
business email a partner publishes for enquiries is ever used.

### Approving

- One draft: **Approve for HQ to email** on the partner's page, or `partner approve demo-coffee demo-brew-tips 1`.
- A partner whose compliance is **check**: the check note shows beside the button; tick that you've read it, then
  approve (`--ack-check` on the command line). Only that draft counts; a bulk approval skips these partners.
- Every email draft of a campaign: pick the campaign on the board, then **Approve all email drafts**, or
  `partner approve-all demo-coffee --campaign cold-brew-month-2026-11-02`. It skips check, avoid and opted-out
  partners, DMs and forms, and drafts without the footer, and says why for each.
- Changed your mind before it went: **Back to draft** (`partner unapprove`).

### When HQ sends, and never twice

```bash
npm run hq -- partner send demo-coffee --dry-run        # what would go now, and why anything is held
npm run hq -- partner send demo-coffee [--id demo-brew-tips]   # send what's approved now
npm run hq -- partner outreach demo-coffee              # the sender, today's count against the cap, open or not
```

The hourly `com.hq.social` run (`partner tick --all`) does the same on its own. Each send is written to the draft
before the provider is called, then the provider's message id, the time and **sent-by-hq** are recorded and the
partner moves to contacted. A failed send is marked **failed** with the error, shown on the board and the partner's
page, and raised as a CEO finding for a day. HQ never resends it by itself: **Retry** (`partner retry demo-coffee
demo-brew-tips 1`) makes HQ look in the sender's sent mail first and record the first email if it went after all.

### Follow-ups: one, never two

When a message went out (sent by HQ or marked sent by the owner) and the partner is still **contacted** five days
later (no reply, no talks, not live, not declined), the hourly run writes **one** short follow-up on the same
channel, pointing back at the first message, with the footer on email. It waits as a draft for the owner's yes and
shows **Follow-up ready** on the card; the Sales & Partnerships tab and the CEO show how many are waiting. A
partner never gets a second follow-up. After that, decline them with a note if they still don't answer.

## Tags and campaigns: how results are counted

Link a partner to a campaign and it gets its own tag, the campaign's tag plus its handle:

```bash
npm run hq -- partner link demo-coffee demo-brew-tips campaign cold-brew-month-2026-11-02
# tag cold-brew-demo-brew-tips; their link: https://coffee.example/?utm_source=instagram&utm_medium=partner&utm_campaign=cold-brew-demo-brew-tips
```

The business's analytics adapter reports sign-ups, paying customers and revenue per `utm_campaign` value
([Analytics](/guides/analytics)). HQ then counts:

- **For the partner:** the rows for its own tag, exactly.
- **For the campaign:** its own tag, every tag under it (`cold-brew-*`, which is how partner tags are made), and the
  tag of any partner linked to it even if it was set by hand. A tag under a longer campaign tag
  (`cold-brew-month-*`) belongs to that campaign instead.

The campaign's page lists its partners, a count by status and what their tags brought. Nothing is ever shown as
zero when it isn't measured: each missing number says what it needs (no adapter, an adapter that doesn't report
tags yet, no row for the tag, or no tag on the partner).

```bash
npm run hq -- partner report demo-coffee   # pipeline counts, checks and drafts waiting, live partners' results
```

## Workflows

- **Partner program** is in part while partners are being found, screened or talked to, and live once at least one
  partner is live with a tracking tag. Once it's live, Sales & Partnerships lights up in the side nav.
- **Podcast and creator appearances** follows the same rule over podcast partners (type or platform podcast).

## Twenty CRM (optional)

The partner files are the record, and everything above works with nothing else. If the business wants the pipeline
in [Twenty](/guides/sales) too, HQ can copy it there one way (HQ to Twenty): a company and a person (the public
handle) per partner, and an opportunity whose stage follows the partner's status (prospect and shortlisted NEW,
contacted SCREENING, replied MEETING, negotiating PROPOSAL, live and paused CUSTOMER; declined and ended keep their
stage and say so in the name). Fit and compliance notes stay in HQ.

1. The owner signs in to Twenty at http://127.0.0.1:3020, opens **Settings, APIs and webhooks**, and creates an API key.
2. They store it in the login Keychain from their own Terminal (it prompts for the key; never paste it in chat):
   `security add-generic-password -a hq -s hq-twenty-api -w`
   (a business with its own Twenty workspace uses `hq-twenty-api-<slug>` instead).
3. `npm run hq -- partner sync demo-coffee --dry-run` shows what would be written; `partner sync demo-coffee` writes it.
   Run it after the weekly brief. Without the Keychain item it says the sync is off and changes nothing.

## Done when

- [ ] The Partnerships board shows the business's partners in the right columns.
- [ ] Every open partner has fit and compliance; anything marked check says what to check.
- [ ] Shortlisted partners have a draft the owner has seen.
- [ ] Email sending says it's on (or the owner chose to send emails themselves), and the owner's test email arrived.
- [ ] Every opt-out is recorded the day it arrives.
- [ ] Live partners are linked to a campaign and have a tag, and the owner has given them their tagged link.
- [ ] `partner report` shows their sign-ups, or says exactly what's missing to measure them.
