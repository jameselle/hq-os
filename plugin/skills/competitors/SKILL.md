---
name: competitors
description: >
  Run the Market & Competitors department for a business: set up its competitor
  list, then sweep them weekly from public sources (page and price changes
  caught by changedetection.io, their latest content and what's performing,
  the ads they're running) and write a brief of what changed and what each
  department should do about it. Use when the user says "/hq:competitors",
  "competitor research", "what are competitors doing", "check the competition",
  "competitor analysis", "who are my competitors", or a CEO finding says
  competitor pages changed or a brief is due.
---

# Competitors

**Public sources only:** their websites, public social profiles, and the public ad libraries.
Never sign in as anyone, never scrape behind a login, and never contact a competitor.
Run commands from `$HQ_ROOT` (default `~/business-os`). The watcher is changedetection.io
on 127.0.0.1:5010. Its API token lives in the Keychain, and the CLI reads it for you; never print it.

## Setup (`/hq:competitors setup`, or when the profile lists none)

1. From the profile (offer, audience, country, sites), research **3 to 6 real competitors**:
   - **direct:** same offer, same audience
   - **substitutes:** a different offer for the same need
   - **content rivals:** accounts that win the audience's attention
2. For each: `name`, `site`, public `channels` (handles or URLs you've verified exist), and `watch`: 1 to 3
   **specific** public pages whose changes matter (pricing, offer or subscription pages, the main landing page).
   Find them from the site's own links; don't guess paths. Check each URL returns 200.
3. Show the owner the list and why each competitor is on it. **Wait for a yes.** Then add it to
   `$HQ_DATA/businesses/<slug>/profile.json` under `"competitors"` and validate with `npm run hq -- list`.
4. `npm run hq -- competitors sync <slug>` creates the watches and a vault note per competitor.

## Weekly sweep (the default)

1. **Page changes:** `npm run hq -- competitors changes <slug> --days 7`. This lists every watched page, and
   for changed ones the text that changed. Read the diffs. Price moves, new offers, new products or
   shipping changes matter; a rotating banner doesn't. Pages marked ERROR are blocking automated
   visitors: note it and, if it matters, suggest another public page to watch.
2. **Content: what each competitor posted and what's performing.** Compare each post with that account's own
   typical level (the `/ig-viral` logic), and use `/video-teardown` on one standout if it's worth studying.
   - **YouTube** (reliable):
     `yt-dlp --flat-playlist --extractor-args "youtubetab:approximate_date" -I 1:10 --print "%(upload_date)s | %(view_count)s views | %(id)s | %(title)s" "<channel>/videos"`.
     Flat listings give approximate dates; for an exact date or a description, run
     `yt-dlp --skip-download --print "%(upload_date)s | %(view_count)s | %(description)s" <video URL>`.
   - **TikTok** (works for most public accounts; yt-dlp needs its `curl-cffi` extra, which is installed):
     `yt-dlp --flat-playlist -I 1:10 --print "%(upload_date)s | %(view_count)s views | %(like_count)s likes | %(id)s | %(title).80s" "https://www.tiktok.com/@<handle>"`.
     If that fails with "Unable to extract secondary user ID" (accounts with embedding disabled):
     1. Find any one public video of theirs (web search `tiktok.com/@<handle>/video`).
     2. `yt-dlp --skip-download --print "%(channel_id)s" <that video URL>`.
     3. Add it to that competitor's `channels` as `"tiktok_id"`. This is the only profile edit a sweep may make.
     4. From then on, list with `"tiktokuser:<tiktok_id>"`.
   - **Instagram** (not automated): reading other accounts needs a login, which is off-limits, or Meta's
     Business Discovery API through a *Facebook-login* Instagram connection, which HQ doesn't have. Check
     their public profile and recent reels through web search and the Meta Ad Library links, and say plainly
     in the brief that Instagram coverage is manual.
3. **Ads:** Meta Ad Library (`https://www.facebook.com/ads/library/?q=<name>&country=<CC>`) and the Google Ads
   Transparency Center. Use browser tools if you have them; otherwise put the direct links in the brief.
4. **Log** one dated entry per competitor, with only what's new:
   `echo "<markdown>" | npm run hq -- competitors log <slug> "<Competitor>" -`
5. **Brief:** save it as the department's weekly plan: `npm run hq -- save-plan <slug> competitors <file>`

```markdown
**Headline:** the one competitive fact that matters most this week.

## What changed
- **Competitor:** what, where (link), since when.

## What it means → who acts
- **Content:** … → `/hq:dept content` or `/ig-reel` …
- **SEO:** … · **Ads:** … · **Sales:** … (only the departments with something to do)

## Watching
- slower trends, blocked pages, gaps in coverage
```

Then tell the owner the headline and the actions.

## The brain (before and after)

- **Before:** `npm run hq -- brain read <slug> competitors`. Follow its decisions and playbooks and use its
  facts (offer, audience, voice, channels); don't relearn its lessons.
- **After:** write what this run taught, with evidence, via `npm run hq -- brain write <slug> -`:
  each rival move worth acting on as a **signal** to the department that acts (the Workflows web decides which), and a **lesson** when a pattern repeats across rivals.
  Lessons stay in the business vault; the CEO proposes the ones worth moving up to the HQ brain.

## Rules

- Stick to facts from sources, with a link for each. Label a guess as a guess.
- Don't copy a competitor's content or claims. Learn the pattern, then make your own.
- Keep to regulated-industry notes: don't recommend matching a claim the business isn't allowed to make.
- Never open `.env` files, and never print the watcher token.
