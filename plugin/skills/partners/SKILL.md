---
name: partners
description: "Run a business's partner pipeline in HQ (Sales & Partnerships): find creators, tipsters, podcasts, newsletters, media and affiliates from public sources only, screen each for compliance against the business's regulated flags and its brain, score fit, add them to HQ, write outreach drafts in the brand voice for the owner to approve (HQ emails approved email drafts; the owner sends DMs and forms), handle follow-ups and opt-outs, record replies the owner reports, link partners to campaigns with their own tracking tag, and write a weekly pipeline brief to the brain. Use when the user says \"/hq:partners\", \"find partners\", \"find creators/podcasts/affiliates for <business>\", \"partner outreach\", \"who should we partner with\", \"how are our partners doing\", \"partner report\", \"they said no thanks\", or a CEO review or campaign delegates partner work. Never signs in anywhere, never scrapes behind a login, never approves or sends for the owner."
---

# Partners: found to live

A partner is someone with an audience the business wants: a creator, a tipster, an analytics account, a podcast, a
newsletter, a media site or an affiliate. HQ keeps each one as a file (`npm run hq -- partner …`) and shows them on
the **Partnerships** board (side nav: Sales & Partnerships, then Partnerships; or `/sales/partners`): pipeline
columns, each card with handle, followers, fit, compliance, campaign and the last thing that happened, and each
partner's page with the outreach drafts, history, deal and tracked results. Run commands from `$HQ_ROOT` (default
`~/business-os`).

**You research, screen, score, write and record. You never sign in, never approve for the owner, never send, never
DM, never email, never follow, never comment and never spend.** Only HQ's own sender emails a partner, and only a
draft the owner approved; the owner sends every DM and contact form from their own accounts.

## 1. Read before you search

1. `npm run hq -- brain read <slug> sales`: the offer, audience, voice, decisions and lessons from past partners.
   A lesson like "affiliates who only post screenshots don't convert" changes who you look for.
2. The business profile (`~/hq-data/businesses/<slug>/profile.json`): `regulated` flags, `country`, `audience`.
3. `npm run hq -- partner list <slug>`: who is already in the pipeline. Never add someone twice; a declined or
   ended partner stays closed unless the owner says otherwise.
4. `npm run hq -- campaign list <slug>`: the live or planned campaign the partners will serve. Partner work almost
   always serves a campaign; if none exists, plan one first with `/hq:campaign`.

## 2. Find (public sources only)

- Search the open web and public profile pages: platform search pages you can read without signing in, public
  podcast directories, newsletter directories, the partners rivals use (the latest competitor brief), lists and
  articles. Read each candidate's public profile.
- **Never sign in, never use a logged-in browser session, never scrape behind a login, never use a paid lead
  database.** If a number (followers, downloads, subscribers) isn't public, record `followers: null` and say so.
- Record only what's public and about the partner as a publisher: name, handle, platform, profile link, country,
  audience size with **where you read it and the date**. One public business contact route at most: the DM, the
  contact form or the business email the partner lists for enquiries. Never a phone number, a home address, a
  personal email or anything about their family. HQ refuses personal data.

## 3. Screen for compliance

For each candidate set `compliance`:

- `ok`: nothing in their public content conflicts with the business's rules.
- `check`: something needs Legal or the owner to look (say exactly what in `notes`).
- `avoid`: they conflict with the rules. HQ keeps them as a prospect so nobody adds them again, and **an avoid
  partner can never move past prospect**: no outreach is written for them.

Use the business's `regulated` flags and the brain's legal notes:

- **Gambling:** avoid anyone whose audience skews under 18 or who targets minors; anyone promising guaranteed wins,
  "locks", "sure things" or a way out of debt; anyone pushing inducements (bonus bets, deposit matches, promo codes
  for betting) where local rules ban them; anyone who hides that posts are paid. Check: the partner needs 18+ and
  responsible gambling wording on every post, paid posts disclosed, and the local rules on inducements (in
  Australia, ACMA and the state rules). A tipster selling picks behind a paywall is a competitor as much as a
  partner: say so.
- **Kids:** partners speak to parents and teachers, never to children.
- **Finance:** no return promises; general information only.
- **Health:** no cure or treatment claims.
- **Alcohol:** an audience of legal drinking age only.
- Every business: paid posts must be disclosed (#ad, "paid partnership"). A partner who doesn't is `check`.

## 4. Score fit

`fit.level` high, medium or low, with a one-line `reason` grounded in what you saw: audience overlap with the
business's customers, how engaged the audience is (comments that are real conversation, not bots), how recently and
how often they post, whether they already promote similar products, and whether the business's offer helps their
audience. Followers alone never make a fit high.

## 5. Add them to HQ

Write the list as JSON (one object or an array) and add it. It's all or nothing: every problem is listed and
nothing is saved until every item is valid.

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
    "fit": { "level": "high", "reason": "Weekly home brewing guides to home coffee drinkers; real questions in the comments" },
    "compliance": { "status": "ok", "notes": "" },
    "contact": { "route": "dm" },
    "campaigns": ["cold-brew-month-2026-11-02"],
    "notes": ["Rival roasters have sponsored two of their guides this year"]
  }
]
```

`npm run hq -- partner add <slug> partners.json` (or `-` and pipe it). Platforms: instagram, tiktok, youtube, x,
podcast, newsletter, website. Types: tipster, analytics, podcast, media, creator, affiliate, newsletter. Statuses:
prospect, shortlisted, contacted, replied, negotiating, live, paused, declined, ended (new partners are prospects).
To refresh details later: the same file with `--update` (merges fields, never moves the status).

Linking a campaign gives the partner its own tag, `<campaign tag>-<handle>` (`cold-brew-demo-brew-tips`), and its
link carries `utm_campaign=<tag>`. That tag counts toward the campaign: a campaign tagged `cold-brew` also counts
every row under `cold-brew-*`. Link later with `npm run hq -- partner link <slug> <id> campaign <campaign id>`.

Shortlist the best: `npm run hq -- partner status <slug> <id> shortlisted --note "why"`.

## 6. Outreach drafts (the owner approves)

For each shortlisted partner write one short first message in the brand voice (the brain's voice notes; the
owner's own `ig-dm` skill if installed). Personal to what they actually make, one clear ask, what's in it for their
audience, their tracked link if the deal is a link. No em or en dashes, no hype, nothing the compliance screen
ruled out, and for gambling no inducement and the 18+ line.

`echo '{"channel":"dm","body":"…"}' | npm run hq -- partner draft <slug> <id> -` (email drafts add a `subject`; the
channel follows the partner's contact route). HQ adds the business's footer to every email draft (sender, business,
website, company line and the opt-out line) once a sender is set up; don't write your own opt-out. Show the owner the
drafts on the partner's page and tell them who sends each:

- **Email to a partner's public business email: HQ sends it once the owner approves it** (**Approve for HQ to
  email** on the page, or the owner tells you and you run `partner approve <slug> <id> <n>`). It goes on a weekday
  between 9am and 5pm, one send per draft, up to the daily cap. For a partner whose compliance is `check`, show the
  owner the check note first; approve only with `--ack-check` after they say they've read it. All of a campaign's
  email drafts at once: `partner approve-all <slug> --campaign <id>` (it skips check partners). If the board says
  **Email sending is off**, the business has no sender yet: see the Partnerships guide, "Connect a sender".
- **DM or contact form: the owner sends it.** On the board or the partner's page, **Copy and open Instagram** (or
  **Copy and open contact form**) copies the words and opens the right page; then **Mark as sent**, or
  `partner sent <slug> <id> <n>` when they tell you.

Never approve a draft the owner hasn't approved, never mark a draft sent yourself, and never say a message went out
unless the owner told you or the draft says sent-by-hq.

## 7. Track what the owner reports

- A reply: `partner status <slug> <id> replied --note "what they said, in one line"`.
- Talking terms: `negotiating`, with the terms as a note. Agreed: update the deal with `add --update`
  (`"deal": {"terms": "…", "commission": 20}` for a commission per paying customer, or `"fee": 250` for a flat fee,
  both in the business's currency).
- Live: `partner status <slug> <id> live`. HQ refuses this unless compliance is `ok`; it warns if there's no tag,
  no campaign or no terms. Give the partner their tagged link from their page.
- **Opt-out**: anyone who replies "no thanks" (or asks not to be contacted) is recorded the same day:
  `partner optout <slug> <id> --note "Replied no thanks"`. They're declined for good; HQ never drafts or emails them
  again. Never argue with an opt-out or write to them another way.
- **Follow-ups**: HQ writes one follow-up itself when a partner is still `contacted` five days after a message went
  out; it shows as **Follow-up ready** and waits for the owner's yes. Never write a second one. No answer after that:
  `declined` with a note.
- **A failed email** shows on the board and as a CEO finding. Fix the cause, then `partner retry <slug> <id> <n>` (HQ
  looks in the sender's sent mail first and never sends twice).

## 8. Weekly pipeline brief

1. `npm run hq -- partner report <slug>`: counts by stage, compliance checks waiting, drafts waiting for the
   owner, and what live partners' tags brought (sign-ups and paying customers from the analytics adapter's rows).
   Anything not measured says **not measured yet** and what it needs; never call it zero and never estimate.
2. Write the brief to the business's brain:
   `echo '{"type":"fact","dept":"sales","title":"Partner pipeline <date>","body":"<counts, what moved, what the tags brought, what the owner needs to do>","evidence":["partner report <date>"]}' | npm run hq -- brain write <slug> -`.
   A lesson with evidence (what kind of partner converted, what didn't) is a `lesson` note.
3. If the owner has stored a Twenty API key, copy the pipeline to the CRM: `npm run hq -- partner sync <slug>`
   (it says when it's off; the JSON files are the record either way).

## Rules

- Public sources only. Never sign in, never scrape behind a login, never use a paid database.
- Never contact anyone yourself. HQ emails only email drafts the owner approved, from the business's sender; the
  owner sends every DM and form. Never approve for the owner.
- An opt-out is final. Record it the day it arrives.
- One follow-up per partner, written by HQ, approved by the owner. Never two.
- No personal data beyond one public business contact route. No phone numbers.
- An avoid partner never moves past prospect. Live needs compliance ok.
- No em or en dashes. Australian English.
- Only measured numbers.
