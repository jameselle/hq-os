# Campaigns: brief to results

> **If you are an AI walking an owner through this:** plan the campaign with `/hq:campaign`, agree the brief with
> the owner before saving it, and leave it as `planned` until they say go. Never post, send or spend anything
> yourself. Report only what HQ measures; anything else is "not measured yet".

A campaign is a push of a few weeks with one goal and one number to move: a season, a launch, an offer, a gap a
competitor left. HQ keeps each campaign as a file and shows every one on the **Campaigns** page (side nav, under
Lead, next to CEO): what it is, the work linked to it, how it's doing against its target, and a dated log of
results and learnings. The workflow behind it is **Campaign from brief to results** on the Workflows tab.

The examples use the invented demo business, Demo Coffee.

## How it works

1. **Brief.** One goal, the lever (get, keep or expand customers), the audience, the offer or hook, the channels,
   dates, a budget if any, the department that runs it, the tag every link carries and the number it's judged by,
   with a target.
2. **Legal** checks the offer and claims first when the business is regulated.
3. **Assets** come from the weekly social plan and the daily blog, which read live campaigns and tag their drafts.
   Emails go through a lifecycle flow. Each is linked to the campaign.
4. **Launch** when the owner says go: the status becomes `live`.
5. **Weekly report** from what HQ measures, saved to the results log.
6. **Close** with learnings, written to the business's brain so the next campaign starts from them.

## 1. Write the brief

`/hq:campaign` plans it from the business's brain, channel plan and competitor brief. By hand, write the JSON:

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
  "budget": 300,
  "owner": "ads",
  "utm": "cold-brew",
  "metric": "new_signups",
  "target": 60
}
```

```bash
npm run hq -- campaign add demo-coffee brief.json
npm run hq -- campaign status demo-coffee cold-brew-month-2026-11-02 live
```

- The id is the name in kebab case plus the start date (`cold-brew-month-2026-11-02`); a unique start of it is
  enough on the command line.
- **utm** is the `utm_campaign` value on every link to your own site. If your links already carry one tag per
  network in `utm_source` (`series-ig`, `series-x`), give the prefix with a star: `series-*`.
- **metric** is any analytics id (`npm run hq -- analytics show demo-coffee` lists them). `new_signups`,
  `new_paying`, `revenue` and `link_clicks` can be split by tag; other numbers (churn, activation) are shown
  business-wide and labelled so.
- HQ refuses em and en dashes, and anything that looks like personal data (emails, phone numbers, ids, keys).
- Optional at the start: `links` and `notes` (see below). `status` defaults to `planned`.

## 2. Link the work

```bash
npm run hq -- campaign link demo-coffee cold-brew-month social 2026-11-03-instagram-1
npm run hq -- campaign link demo-coffee cold-brew-month blog cold-brew-ratio
npm run hq -- campaign link demo-coffee cold-brew-month email welcome-guide
npm run hq -- campaign link demo-coffee cold-brew-month experiment 4
npm run hq -- campaign link demo-coffee cold-brew-month post https://www.instagram.com/p/EXAMPLE/
npm run hq -- campaign link demo-coffee cold-brew-month note "Decisions/Cold brew month.md"
```

- **social**: a weekly social plan draft. Drafts tagged with the campaign (`"campaign": "<id>"`) or whose link
  carries its tag count without linking.
- **blog**: a daily blog post's slug, or a draft tagged with the campaign.
- **email**: a lifecycle flow id (sends since the start are counted), or a message id.
- **experiment**: the experiment's number from `hq experiment`.
- **post**: the link of a live post made outside the weekly plan; it counts as out once HQ's publish log read it back.
- **note**: a note in the business's vault.

Remove a link with `--remove`.

## 3. Tag the spend

Finance tags each transaction in the ledger with the campaign id, or posts it to a sub-account named for it:

```beancount
2026-11-05 * "Meta" "Cold brew month boost"
  campaign: "cold-brew-month-2026-11-02"
  Expenses:Advertising        120.00 AUD
  Assets:Bank:Everyday
```

`Expenses:Advertising:Cold-Brew-Month` works too.

## 4. Report it every week

```bash
npm run hq -- campaign report demo-coffee cold-brew-month --save
```

What each number comes from:

| Number | From | When it's missing |
|---|---|---|
| Items out | social drafts posted, blog posts live, posts read back, emails delivered | never: HQ counts its own records |
| Spend | ledger postings tagged with the campaign | no ledger, or nothing tagged |
| Visits, sign-ups, paying, revenue | the analytics adapter's `campaigns` rows for the tag | no adapter, or it doesn't report campaigns ([Analytics](/guides/analytics)) |
| Cost per sign-up, cost per paying customer | spend over sign-ups or paying customers | either half is missing |
| Return on spend | revenue less spend, over spend | either half is missing |
| The campaign's number vs target | the tagged figure, or the business-wide reading for numbers a tag can't split | the number isn't measured for the business |

A number HQ can't read says **not measured yet** and what it needs. It is never shown as zero. `--save` adds the
week's measured numbers to the results log; add what they mean with
`npm run hq -- campaign note demo-coffee cold-brew-month "Pins brought most of the clicks"`.

## 5. Close it

```bash
npm run hq -- campaign report demo-coffee cold-brew-month --save
npm run hq -- campaign status demo-coffee cold-brew-month done
npm run hq -- campaign note demo-coffee cold-brew-month "Half price first box beat the free guide 3 to 1" --learning
```

Then write the lessons to the brain (`npm run hq -- brain write demo-coffee -`). `/hq:campaign` does all three.

## Check it's working

- The Campaigns page (http://127.0.0.1:3150/campaigns) lists the campaign with its status, dates, channels and
  number against target; its own page shows the linked work and the results log.
- The Workflows tab marks **Campaign from brief to results** live once a live campaign has a linked item out, and
  in part while campaigns are only planned.
- The Data & Analytics tab shows **Campaigns live**.

## Good to know

- Campaign files live in `$HQ_DATA/businesses/<slug>/campaigns/<id>.json` (owner-only), mirrored to the vault as
  `Departments/Paid Ads & Growth/Campaigns.md`.
- One goal and one number per campaign. Two goals are two campaigns.
- Regulated businesses: the same rules as every post. Gambling: no inducements, 18+ and responsible gambling
  wording. Children's products: written for parents and teachers.
