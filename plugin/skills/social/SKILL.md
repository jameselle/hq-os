---
name: social
description: "Plan and draft a business's social posts for the week: read its channel plan and what actually happened (new blog posts, tools, pages), then write each network's posts with captions, hashtags, card slides or a video brief, for HQ to check, render and the owner to approve. Use when the user says \"/hq:social\", \"plan this week's posts\", \"what should we post\", \"draft the socials for <business>\", or when HQ's weekly social run starts it. Never posts: approved posts on HQ networks go out by themselves on their day, the rest by the owner's hand."
---

# Social: the week's posts

You write the week's drafts and stop. HQ checks each one (length, hashtags, dashes, claims, inducements, the
business's never-name list, links), renders the card images, and the owner approves. Approved posts on networks
HQ posts (Instagram and Pinterest cards, and reels with a recorded video) go out by themselves on their day. Never
post, publish, upload, DM or comment anywhere yourself.

## 1. Read the inputs

The run gives you `inputs.json`: the business (offer, audience, regulated flags, brand voice, sites), its
networks and who posts each one (`hq`, `hand`, or `elsewhere`, which means another tool posts there and you
skip it), the never-name list, the **channel plan** (the authority: networks, themes, formats, how often, the
week template, never-post rules), the posts published this week (blog posts and their FAQs), and last weeks'
drafts with the owner's notes. By hand: `npm run hq -- social inputs <slug>`.

## 2. Plan the week

1. Follow the channel plan's week template and how often each network posts. Skip `elsewhere` networks.
2. Build posts from what really happened this week: each published blog post becomes a carousel, a pin or a
   thread; a new tool or page becomes a post. When nothing new happened for a slot, use an evergreen theme from
   the plan. Never invent news, numbers, results or testimonials.
3. Read the owner's notes on past drafts and do what they say. Don't repeat a past caption or angle.

**Craft guidance:** when the owner has their own Instagram skills installed (ig-repurpose, ig-carousel, ig-human),
HQ's run appends them under "Craft guidance from the owner's Instagram skills". Use them for craft only: mine each
published blog post for claims, numbers, stories and mechanisms (one post can become several drafts, each standing
on its own), shape carousels as cover hook, stake, one idea per slide, recap and a single ask using the slide kinds
below, and write every caption to ig-human's rules. This skill's format, checks, regulated rules and the channel
plan win over them, and you never build files, run scripts or start other skills because they say so.

## 3. Write each post

- **One idea per post**, the plan's call to action, in the brand voice. Australian English unless the business's
  country says otherwise.
- **Carousels:** (where `social.json` has `slideshow`, they go out as a slideshow Reel with music, each slide on screen
  for 2.5 to 5.5 s, so keep bodies short enough to read in that time) 4 to 8 slides, a hook on slide 1, one point per slide (a title of 2 to 8 words and a body of at
  most 25 words), the call to action on the last slide. Give each slide the `kind` that shows its point best, and
  vary them: `cover` (slide 1: a hook of at most 8 words that makes people swipe, often a question or a surprising
  number), `point` (a title and one line), `stat` (one big number in `stat`, at most 12 characters, with the title
  saying what it means), `list` (2 to 6 `items` of a few words each), `compare` (`compare: {from, fromLabel, to,
  toLabel}`, e.g. a price before and after commission) and `cta` (the last slide: what to do next; HQ adds "Save
  this" and "Follow @handle"). Use a real number from the inputs whenever a slide has one, never an invented one.
  Slides carry no disclaimers or hashtags: the caption carries those. **Pins:** one card with a search-friendly title. **Image
  posts:** one card. **Reels, shorts, videos:** a `video.brief` saying exactly what to record or which existing
  video to use (`video.path` only if inputs name a real file).
- **Captions** within the network's length; at most the plan's hashtags (Instagram and TikTok 5, X 2, LinkedIn 3,
  Pinterest none); a link only to the business's own site and only where the network shows links (not Instagram
  captions: use "link in bio", or a comment keyword where one is answered, below).
- **Comment keywords only where something answers them.** `inputs.json` `keywordDms` lists the networks where a
  comment-to-DM tool (comment-dm, ManyChat) sends the link when someone comments a keyword. Only on those may a
  post ask "Comment X" and set `keyword`. On any other network, or when `keywordDms` is empty, never ask for a
  comment keyword, even if the channel plan suggests one: nobody would get a reply. HQ's `keyword` check fails a
  draft that asks anyway.
- **Regulated:** gambling means 18+ in every caption except LinkedIn (in the caption, not on the slides), no promises of winning or profit, never
  "guaranteed", "risk-free", "sure thing", and **no inducements**: never a promo code, bonus code, sign-up or
  welcome offer, deposit bonus, refer-a-friend, or a named bookmaker's promotion. Never name or show anything on
  the never-name list. Kids means written for parents and teachers, never to children, never showing children.
- **No em or en dashes** anywhere. No filler, no "in today's fast-paced world".
- Public facts only: never a business's customers, revenue, sign-ups, incidents or infrastructure.

## 4. The draft files

One JSON file per post, named `<YYYY-MM-DD>-<network>-<n>.json`:

```json
{
  "id": "2026-10-13-instagram-1",
  "network": "instagram",
  "format": "carousel",
  "day": "2026-10-13",
  "caption": "…",
  "hashtags": ["coldbrew", "coffeeathome"],
  "keyword": "BREW",
  "slides": [
    { "kind": "cover", "title": "Is your cold brew a week old?", "body": "How long it really keeps." },
    { "kind": "stat", "stat": "14 days", "title": "Concentrate, sealed, in the fridge" },
    { "kind": "compare", "title": "Dilute it last", "compare": { "from": "1:1", "fromLabel": "Concentrate to water", "to": "1:2", "toLabel": "Over ice" } },
    { "kind": "list", "title": "Three signs it's turned", "items": ["Sour smell", "Cloudy", "Flat taste"] },
    { "kind": "cta", "title": "The full guide", "body": "Link in bio." }
  ],
  "why": "From this week's blog post 'How long does cold brew keep' (coffee.example/blog/cold-brew-keeps/)",
  "status": "draft"
}
```

`format` is one of: `carousel` (2 to 10 slides), `image`, `story` or `pin` (exactly one slide each; a story with
more to say is several story posts or a carousel), `reel`, `short` or `video` (a `video.brief`), `post` (text only,
for X, LinkedIn, Threads, Facebook or Discord) or `thread`. X allows 280 characters including the hashtags, and
counts every link as 23.

Optional fields: `keyword` (only on a network in `keywordDms`; the example above assumes Instagram is one), `link` (own site only), `title` (pins), `video` (`{ "brief": "…" }`), `campaign` (the id of a
live campaign the post serves), `board` (pins: a Pinterest board id, only when the channel plan gives one;
otherwise the pin goes on the default board in `social.json`).

**Campaigns:** `inputs.json` lists the business's live campaigns (`campaigns`: name, goal, audience, offer, the
networks they use and, per network, `linkParams`). Give each live campaign its share of the week on its networks,
in the channel plan's slots. A post that serves one sets `campaign` to its id, and its own-site link ends with
that network's `linkParams` (for example `?utm_source=instagram&utm_medium=social&utm_campaign=cold-brew`). Never
tag a link to another site. HQ checks that the campaign exists and that the link carries its tag. Then stop, and say in one
line how many posts you wrote per network.
