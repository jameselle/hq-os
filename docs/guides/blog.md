# Daily blog: researched posts every day

> **If you are an AI walking an owner through this:** set it up in week-one mode (every post waits for the
> owner for 7 days), connect the publisher last, and try a dry run before anything goes live. Never read `.env`
> files; publishers read their own credentials. The owner approves posts on the SEO & GEO tab.

Every day HQ researches one topic with real search demand, writes a sourced post in the business's voice, checks
it, and publishes it when the owner allows, then reads it back on the live site before it counts.

## How it works

1. **Research** (Claude, with the `/hq:blog` skill): the searches the site shows for but ranks poorly on (Search
   Console), what competitors publish, the posts the site already has, and the business's brain notes.
2. **Write**: one draft in `$HQ_DATA/businesses/<slug>/blog/drafts/`, with sources, internal links and an FAQ.
3. **Check** (HQ, every draft): 700 to 2,500 words; title and description lengths; at least 3 sources and every
   source link loads; at least 2 links to the site; no em or en dashes; only the allowed markdown; no banned claims
   for the business's regulated flags (gambling also needs the 18+ responsible gambling line); not a near copy of
   an earlier post; the keyword in the title or first paragraph.
4. **Decide**: **Off**, **Ask me** (every post waits) or **Auto** (posts that pass publish on their own). Setup
   starts in Auto with week one: until then every post waits for you. A post that fails a check always waits.
5. **Publish** through the business's own publisher, then **read back**: HQ only counts a post once the live page
   shows its title.
6. **Measure**: posts published, search clicks and organic sign-ups, on the SEO & GEO and Data & Analytics tabs.

## Before you start

- The business has a site, and a way to add a page to it: a CMS or database table, a static site you can build
  and deploy from the Mac, or a repo with a content folder.
- Claude Code is signed in on this Mac (the daily run uses it headless). HQ finds the copy bundled with the editor
  extension, or set `CLAUDE_BIN`.
- Recommended: [SEO & GEO](/guides/seo) is set up, with Search Console connected through Composio, so the research
  has real search data. Without it the research uses competitors and web search only.

## 1. Set it up

```bash
npm run hq -- blog setup <slug> --site https://example.com [--hour 6] [--sc-account <alias> --sc-site https://example.com/]
```

That writes `$HQ_DATA/businesses/<slug>/blog/blog.json`: the site, the hour the daily run starts (business
timezone), the Search Console account alias and property, and week one (7 days from today). Add `topics` (what to
favour) and `avoid` (never write about) to it if you like.

## 2. Connect a publisher

The publisher is a small private program in the business's data folder that knows how to put a page on its site.
The contract (list and publish, the post fields, the markdown it renders) is in `templates/blog/README.md`.

- **Try it first** with `templates/blog/folder-publisher.mjs`, which writes HTML files into a folder.
- **A real site**: write one for its CMS, database or static build. Give it a `dryRun` that builds without
  publishing.

Connect it: `$HQ_DATA/businesses/<slug>/blog-connection.json` → `{"command": ["/path/to/node", "/path/to/blog-publisher.mjs"]}`.

## 3. Run it

- `npm run hq -- services install` adds **com.hq.blog**, which runs every hour: it writes the day's post once the
  set hour has passed, checks drafts, and publishes what's allowed.
- By hand: `npm run hq -- blog write <slug>` (research and write now), `blog check <slug>`, `blog show <slug>`,
  `blog publish <slug> --dry-run` (the publisher builds without publishing).

## 4. Check it's working

- The SEO & GEO tab shows the day's draft with its checks, why the topic was picked, and the post itself.
- `npm run hq -- blog show <slug>` lists drafts with where each one is.
- After a post goes live, the Workflows tab marks **Daily blog from search demand** as live.

## Done when

- [ ] `blog.json` exists with the right site and week one.
- [ ] A dry run publishes nothing and builds the post.
- [ ] The first real draft appeared on the SEO & GEO tab, and you approved or rejected it.
- [ ] After week one, a post went live on its own and HQ read it back.

## Good to know

- Posts use public facts only, each with a source. Nothing internal to the business goes in a post.
- Search engines reward posts that answer a real search better than what's there. The checks stop repeats and
  thin posts, but your yes in week one is what sets the standard: reject freely, and leave notes on what to change.
- A publisher that deploys a whole site can take minutes; HQ gives a publish 20 minutes and retries the read-back
  hourly for a day.
