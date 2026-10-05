---
name: blog
description: "Research and write today's blog post for a business: read its Search Console gaps, what its competitors publish, and the posts it already has, pick one topic with real search demand, and write one sourced, on-brand draft for HQ to check and publish. Use when the user says \"/hq:blog\", \"write today's blog post\", \"blog post for <business>\", or when HQ's daily blog run starts it. Never publishes: HQ checks the draft and the owner (or the rules) decide."
---

# Blog: one researched post a day

You write ONE draft and stop. HQ checks it (sources load, length, links, banned claims, no repeats) and
publishes it only when the owner allows. Never publish, post, deploy or commit anything yourself.

## 1. Read the inputs

The run gives you a folder with `inputs.json`: the business (offer, audience, country, regulated flags, brand
voice, sites), the blog's site, topics to favour and avoid, its Search Console account, its competitors, the
posts it already has, recent drafts, and the business's brain notes for SEO. When run by hand, get the same with
`npm run hq -- blog inputs <slug>`.

## 2. Research (write notes as you go to `notes.md` in the run folder)

1. **Search demand.** If `searchConsole` is set, query it through Composio
   (`GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_QUERY`, the account alias and site exactly as given, last 28 days,
   dimensions `query` then `page`). Look for queries with impressions where the site ranks 8 to 40 or has a low
   click rate: those are what to write about. Skip branded searches.
2. **Competitors.** For each competitor with a site, fetch its blog or sitemap and note what they cover that this
   business doesn't, and what's outdated or thin. Learn the gap; never copy their words or structure.
3. **What people ask.** Web search the candidate topic: the questions in "People also ask", forums, and the
   top-ranking pages. Note what they all miss.
4. **Pick ONE topic** that has demand, fits the offer and the audience, isn't in `existingPosts` or
   `recentDrafts`, and isn't in `avoid`. Prefer one where the business has something real to add (its own public
   data, a tool, a worked example). Write in `notes.md` why this topic, with the evidence (queries and numbers).

## 3. Write

- **Reader first.** Answer the search in the first paragraph, plainly, then go deeper. Use the business's brand
  voice. Australian English unless the business's country says otherwise.
- **700 to 2,500 words**, `##` and `###` headings, short paragraphs, lists and tables where they help.
- **Every claim and number links a public source**, and the draft lists at least 3 sources. Use only public facts.
  Never use anything internal to a business (customers, revenue, sign-ups, incidents, infrastructure), even its
  own: if it isn't on a public page, it doesn't go in.
- **At least 2 links to the business's own pages** (its tools, guides or pricing), where they genuinely help.
- **One call to action** at the end that fits the post.
- **An FAQ** of 3 to 6 real questions with short answers (they become FAQ schema).
- **Regulated flags:** gambling means 18+, no promises of profit, never "guaranteed", "risk-free", "sure thing" or
  "can't lose", and end the body with a line containing "18+" and "gamble responsibly". Health: no cure or
  results claims. Finance: no promised returns. Kids: written for parents and teachers, never to children.
- **Markdown subset only:** headings, paragraphs, `-` and `1.` lists, `**bold**`, `*italic*`, `[text](https://…)`
  links, `> ` quotes, pipe tables. No HTML, images, code blocks or H1 (the page renders the title).
- **No em or en dashes** anywhere: use commas, colons or full stops.
- No filler, no "in today's fast-paced world", no "in conclusion".

## 4. The draft file

Write `<drafts folder>/<YYYY-MM-DD>-<slug>.md`: a JSON block between `---` lines, then the body.

```
---
{
  "slug": "lowercase-words-joined-by-hyphens",
  "title": "20 to 65 characters, the keyword near the start",
  "description": "70 to 160 characters: what the reader gets",
  "keyword": "the main search this targets",
  "category": "a short category name",
  "sources": [{"title": "Publisher: page title", "url": "https://…"}],
  "faq": [{"q": "…", "a": "…"}],
  "date": "YYYY-MM-DD",
  "status": "draft",
  "why": "one or two sentences: the search demand or competitor gap behind this topic"
}
---

First paragraph answers the search…
```

Then stop. Say in one line which topic you chose and why.

## The brain

After a by-hand run, write what you learnt with evidence (a topic that has demand, a competitor pattern) via
`npm run hq -- brain write <slug> -` as a signal or lesson for SEO and Content.
