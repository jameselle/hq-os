---
name: campaign
description: "Run a business's marketing campaigns end to end in HQ: plan one from the business's brain, channel plan and competitors, write it to HQ (goal, lever, audience, offer, channels, dates, budget, the tag on every link, the number it is judged by and its target), link the posts, blog posts, emails and experiments that serve it, report it weekly from what HQ measures, and close it with learnings written to the brain. Use when the user says \"/hq:campaign\", \"plan a campaign\", \"run a campaign for <business>\", \"how is the <name> campaign doing\", \"campaign report\", \"close the campaign\", or a CEO review delegates a campaign. Never posts, sends or spends: posts go through the weekly social plan and /hq:publish, spend is the owner's."
---

# Campaign: brief to results

A campaign is a push of a few weeks with one goal and one number to move. HQ keeps each one as a file
(`npm run hq -- campaign …`) and shows it on the **Campaigns** page (side nav, under Lead): what it is, what's
linked, how it's doing against its target, and the results log. Run commands from `$HQ_ROOT` (default
`~/business-os`). You plan, write, link and report. You never post, send, spend or launch anything yourself.

## 1. Read before planning

1. `npm run hq -- brain read <slug> ads` and `npm run hq -- brain read <slug> content`: the business's offer,
   audience, voice, decisions and lessons from past campaigns. Don't repeat a lesson.
2. The channel plan in the vault (`Departments/Content & Social/Channel plan.md`): which networks it uses and how
   often. A campaign uses the plan's slots; it doesn't invent new networks.
3. `npm run hq -- campaign list <slug>`: what's already running. Two live campaigns on the same audience and
   channel compete; say so.
4. The latest competitor brief (`Competitors/` in the vault, or `/hq:competitors`): gaps worth a campaign.
5. `npm run hq -- analytics show <slug>`: which numbers are measured today. Pick a number HQ can read, or say
   what has to be connected first.

## 2. The brief

Write it with the owner in plain words, then as JSON:

```json
{
  "name": "Cold brew month",
  "goal": "Win 60 new subscribers from people who make cold brew at home",
  "lever": "get",
  "audience": "Home coffee drinkers who already make cold brew",
  "offer": "Free cold brew guide, then the first box at half price",
  "channels": ["instagram", "pinterest", "blog", "email"],
  "start": "2026-11-02",
  "end": "2026-11-29",
  "status": "planned",
  "budget": 300,
  "owner": "ads",
  "utm": "cold-brew",
  "metric": "new_signups",
  "target": 60,
  "links": [{ "kind": "experiment", "ref": "4" }],
  "notes": ["Pinterest pins point at the guide, not the shop"]
}
```

- **name** and **goal**: one line each. No em or en dashes anywhere (HQ refuses them). Australian English.
- **lever**: `get`, `keep` or `expand`. **owner**: the department that runs it (`ads`, `content`, `email`, `seo`, `ceo` …).
- **channels**: instagram, tiktok, x, youtube, facebook, linkedin, pinterest, threads, discord, blog, email, ads,
  partners, search, community, pr, events, other.
- **utm**: the `utm_campaign` value on every own-site link (lowercase, digits, `-`, `_`). If the business already
  tags links per network in `utm_source` (`series-ig`, `series-x`), use the prefix with a star: `series-*`.
- **metric**: an analytics id (`npm run hq -- analytics show <slug>` lists them); `new_signups`, `new_paying`,
  `revenue` and `link_clicks` can be split by tag, others (churn, activation) are read business-wide. **target**:
  the number to reach (for "lower is better" numbers, the most it may be).
- **budget** in the business's currency; leave it out for an organic campaign. The owner approves any spend.
- Never personal data: no names, emails, phone numbers or account ids. HQ refuses them.
- **Regulated businesses** (gambling, finance, health, kids): run the offer and every claim past Legal first.
  Gambling: no inducements (no bonus, promo code, sign-up or welcome offer), 18+ and responsible gambling
  wording on every asset. Kids: written for parents and teachers, never to children.

Save it: `npm run hq -- campaign add <slug> brief.json` (or `-` and pipe it). The id is the name in kebab case
plus the start date. Start it when the owner says go: `npm run hq -- campaign status <slug> <id> live`.

## 3. Assets, each tagged

- **Social:** the weekly social plan reads live campaigns and tags its drafts (`campaign` field, links ending in
  `?utm_source=<network>&utm_medium=social&utm_campaign=<utm>`). For drafts that already exist:
  `npm run hq -- campaign link <slug> <id> social <draft id>`.
- **Blog:** the daily blog may serve a live campaign that lists `blog`; or link an existing post:
  `campaign link <slug> <id> blog <post slug>`.
- **Email:** link the lifecycle flow that sends for it: `campaign link <slug> <id> email <flow id>`
  (`npm run hq -- lifecycle show <slug>` lists the flows). Nothing reaches a customer without the owner's yes.
- **Experiments:** `campaign link <slug> <id> experiment <number>` for the test the campaign runs.
- **Posts made elsewhere** (a video series, a partner's post): `campaign link <slug> <id> post <https link>`.
- **Notes:** a vault note that explains it: `campaign link <slug> <id> note "Decisions/<note>.md"`.
- **Spend:** tag every ledger transaction for it with `campaign: "<id>"` (or post to
  `Expenses:Advertising:<Name>`). That's Finance's job; HQ reads it.

## 4. Weekly report

`npm run hq -- campaign report <slug> <id>` prints what HQ measures: items out (posts posted, blog posts live,
posts read back, emails delivered), spend, visits, sign-ups, paying customers, revenue, cost per sign-up, cost per
paying customer, return on spend, and the number against its target. Anything HQ can't read says
**not measured yet** and what it needs. Never fill a gap with an estimate and never call a missing number zero.
Save the week to the results log with `--save`, and add one line on what the numbers mean:
`npm run hq -- campaign note <slug> <id> "Pins brought most of the clicks; the carousel didn't"`.

When sign-ups by tag are missing, the fix is usually the analytics adapter: it should report
`campaigns: [{ utm, visits, signups, paying, revenue }]` (docs/guides/analytics.md). Say so in the report.

## 5. Close it

1. Final report with `--save`, then `npm run hq -- campaign status <slug> <id> done` (sets the end date).
2. Learnings, each with its evidence: `npm run hq -- campaign note <slug> <id> "…" --learning`.
3. Write the lessons to the brain so the next campaign starts from them:
   `echo '{"type":"lesson","dept":"ads","title":"<what worked or didn't>","body":"<the numbers and why>","evidence":["campaign <id> report <date>"]}' | npm run hq -- brain write <slug> -`.
   Lessons stay in the business's vault; the CEO proposes the ones worth moving up to the HQ brain.

## Rules

- No em or en dashes in names, goals, notes or any asset.
- Never post, send, launch or spend: the weekly social plan, `/hq:publish`, the lifecycle approvals and the owner
  do that.
- One goal and one number per campaign. If the owner wants two, make two campaigns.
- Only measured numbers. Business-wide readings are labelled business-wide.
