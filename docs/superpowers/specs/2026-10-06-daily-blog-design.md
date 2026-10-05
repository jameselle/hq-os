# Daily blog and the SEO & GEO page: design

2026-10-06. Asked for: "set up the SEO and GEO page end to end and create the workflow for blog posts that
automatically does research, competitor research etc and then writes and posts the blogs daily for each
company". Owner's answers: drafts wait for the owner's yes in week one, then publish on their own when every
check passes (a failed check always waits); it runs for the businesses that have a website.

## What it does, once a day per business

1. **Research** (Claude, headless, the `/hq:blog` skill): Search Console queries where the site shows but ranks
   poorly or gets few clicks, what watched competitors changed or published, the posts the site already has (so
   nothing repeats), and the business's own public facts. Picks ONE topic with search demand that fits the offer.
2. **Write**: one post in the brand voice, with every claim and number linked to a public source, internal links
   to the site's own pages, a meta description, an FAQ block and a single call to action. Writes the draft file and
   stops: Claude never publishes.
3. **Check** (HQ code, deterministic; a post publishes only when all pass):
   length 700 to 2,500 words · title 20 to 65 characters · description 70 to 160 · at least 3 sources and every
   source link loads · at least 2 internal links · no em or en dashes · no banned words for the business's regulated
   flags (for gambling: no "guaranteed", "risk-free", "sure thing", "lock", and the 18+ responsible-gambling line
   present) · not too close to an existing post (word 5-gram overlap under 30%) · the target keyword in the title
   or first paragraph.
4. **Decide**: mode `off` | `draft` (every post waits) | `auto` (passing posts publish; failures wait). Setup
   starts in `auto` with `approveUntil` = start + 7 days: until then every post waits for the owner (week one).
5. **Publish** through the business's private publisher adapter, then **read it back** (HTTP 200 and the title on
   the page) before it counts. Ping IndexNow (Bing, which ChatGPT search leans on) when the business has a key.
6. **Measure**: posts published (HQ), search clicks and organic sign-ups (the analytics adapter).

## Pieces

| Piece | Kind | What |
|---|---|---|
| `lib/blog.ts` | pure | config and draft types, frontmatter parse, the checks, the mode decision |
| `lib/blog-store.ts` | server | `$HQ_DATA/businesses/<slug>/blog/`: `blog.json`, `drafts/`, `published/`, `rejected/`, `log.jsonl` |
| `scripts/hq.ts` `blog …` | CLI | `run`, `show`, `approve`, `reject`, `note`, `publish`, `mode`, `check` |
| `plugin/skills/blog` | skill | research and write one draft; never publish |
| `app/seo` | page | SEO & GEO: what needs you (drafts), the pipeline, published posts, search numbers, GEO checks |
| `com.hq.blog` | service | daily: `hq blog run --all` then publish what's approved or allowed |
| `templates/blog/` | template | a folder publisher (for trying it) and the publisher contract |
| `docs/guides/blog.md` | guide | set it up for any business |

## Publisher adapter contract (private, per business)

`$HQ_DATA/businesses/<slug>/blog-connection.json` → `{"command": [...]}`, run with `lib/private-adapter.ts`.
stdin, one JSON object:

- `{"action":"list"}` → `{"posts":[{"slug","title","url","publishedAt"}]}`: what the site already has.
- `{"action":"publish","post":{slug,title,description,markdown,keyword,sources,faq,date}}` →
  `{"url","publishedAt"}`. The adapter owns the site's specifics (a repo commit and deploy, a CMS API, a DB row).

The adapter never gets credentials from HQ; it reads its own.

## The headless run

`hq blog run` finds the Claude Code binary (`CLAUDE_BIN`, else the newest bundled with the editor extension),
runs it with `-p`, the skill's instructions, a working folder of research inputs, and tools limited to reading,
web search and fetch, and writing inside that business's `blog/drafts/`. It needs the owner's Claude sign-in (a
launchd job has it when HOME and USER are set). If the run fails, the day is logged as failed and the CEO shows it.

## Rules carried over

Nothing public carries company data: posts use public facts only, with sources. The framework names no business.
Free tools only. Regulated flags change the checks.
