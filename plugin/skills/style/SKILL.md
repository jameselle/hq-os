---
name: style
description: >
  Find the short videos that are winning in the business's niche right now,
  measure how they're made (cuts per 10 s, first cut, speaking pace, how fast the
  first word lands, the hook line) and tear the best apart (hook, structure,
  animation and caption style), then write the business a style guide and
  style targets that its scripts, topics and edits follow. Use when the user
  says "/hq:style", "what's working in my niche", "find successful clips",
  "style our videos after what works", "copy the format of the winners",
  "research before we script", or before a new series or when posts stop landing.
---

# Style: learn from the niche's winners, then make ours like them

The output is two files the other skills read:
- `$HQ_DATA/businesses/<slug>/style.json`: **targets** (medians of the winners): cuts per 10 s, first cut,
  median shot, words per minute, first word, length. `npm run studio -- check` reports every render
  against them (⚠ when far off; advisory, never a fail).
- `Departments/Content & Social/Style guide.md` in the business vault: **topics that win, hook formulas,
  script structure, edit and animation style, and what we won't copy**, every claim linked to its clips.

`/hq:self-post` reads both before scripting (step 1) and editing (step 4); `/ig-reel` takes the topic and
hook rows. Run HQ commands from `$HQ_ROOT` (default `~/business-os`).

## 1. Which accounts

Start from what's already known:
- the profile's `competitors[].channels` (from `/hq:competitors setup`), especially the **content rivals**;
- `~/.claude/instagram/swipe.md` from `/ig-viral`, if it's recent;
- otherwise search the niche: `yt-dlp --flat-playlist -I 1:20 --print "%(id)s|%(view_count)s|%(channel)s|%(duration)s|%(title).70s" "ytsearch20:<niche terms> shorts"`,
  and TikTok/YouTube handles named in those results.

Aim for the `/ig-viral` mix: **4 direct** (same niche, slightly ahead), **4 adjacent** (same audience,
different niche: formats travel), **2 to 4 outsized** (for format only, never for topics). Show the owner the
list and why each is on it; wait for a yes. Topics come **only** from direct accounts: that's what "within the
niche" means.

## 2. Find the winners

A winner is a clip that beat **its own account's** typical views, not a big account's normal day.

- **TikTok:** `yt-dlp --flat-playlist -I 1:30 --print "%(id)s|%(upload_date)s|%(view_count)s|%(duration)s|%(title).70s" "https://www.tiktok.com/@<handle>"`
- **YouTube Shorts:** the same against `https://www.youtube.com/@<handle>/shorts`.
- **Instagram:** `/ig-viral` (reading at human pace; never log in or scrape). Its rows feed topics and hooks;
  measure a reel only if yt-dlp can fetch it publicly.

For each account, take the median views of its last ~30 posts; a clip's **outlier** score is views ÷ that
median. Keep clips at **3x or more**, from the last 90 days, under 3 minutes. Pick **8 to 12**, from at least
3 accounts, so one creator's habits don't become the target.

## 3. Measure them

```bash
D=$HQ_DATA/businesses/<slug>/research/style-$(date +%F)
npm run -s studio -- measure "<clip url>" --outlier <x> --dir "$D"     # one per clip
```

It downloads the first 3 minutes (study copy), and writes `<clip>.measure.json`: cuts and their times, cuts per
10 s, first cut, median and longest shot, words per minute, first word, share of time speaking, the hook line,
loudness. Then:

```bash
npm run -s studio -- style <slug> "$D"/*.measure.json --niche "<the niche in a few words>"
```

That writes `style.json` (medians, plus every source attributed). Also measure 2 or 3 of OUR recent posts the
same way, for the comparison in the guide.

## 4. Tear the best apart

Run `/video-teardown` on the top 3 to 5 (highest outlier, direct niche first), and read each contact sheet.
For every one, note:
- **Topic and angle:** the promise, in one line. Why this audience cares.
- **Hook:** what is said AND shown in the first 2 s (quote it); the `/ig-reel` formula it fits.
- **Structure:** beats with timings (hook, problem, proof, payoff, ask), where the first cut lands, how it ends.
- **Animation and edit:** what's on screen besides the face (screen recordings, cards, zooms, b-roll, memes),
  how often it changes, text style (font weight, size, colour, boxes, position), caption style (word pop,
  lines, highlight colour), transitions, sound (music, SFX on cuts), speed.
- **Packaging:** cover/first frame, on-screen title, caption formula, the ask.

## 5. Write the style guide

`Departments/Content & Social/Style guide.md` in the business vault, with frontmatter (`type: guide`,
`updated:`, a summary that stands alone):

1. **Pace targets:** the `style.json` numbers next to our own posts' numbers, and what to change.
2. **Topics that win here:** ranked by outlier score, each linked to its clips, plus 5 to 10 topics for us in the
   same vein. Ours, not theirs.
3. **Hook formulas** that won, with an example each, in our voice.
4. **Script structure:** the beat sheet with seconds, for a 30 to 60 s post.
5. **Edit and animation style**, mapped onto our tools: which HyperFrames card types (countdown, slam, keycap,
   split vs full frame), cutaway cadence, caption style. Propose the `brand.json` changes (caption colours, hook
   style, speed) and **ask the owner** before changing the business's look.
6. **What we won't copy:** anything that's someone's signature (their catchphrase, their character, their
   footage, their music), anything off-brand or misleading.
7. **Sources:** account, link, views, outlier, date.

## 6. Use it, then refresh it

- The next `/hq:self-post` scripts from section 2 and 3, edits toward section 4 and 5, and `studio check` shows
  ⚠ where a render is off the targets. Fix what matters, not every number.
- Delete the study copies once the teardowns are written: `rm "$D"/*.mp4` (keep the `.measure.json` files,
  teardown notes and contact sheets).
- Refresh monthly, or when `/ig-audit` says posts have stopped landing.

## The brain (before and after)

- **Before:** `npm run hq -- brain read <slug> content`. Follow its decisions and playbooks and use its
  facts (offer, audience, voice, channels); don't relearn its lessons.
- **After:** write what this run taught, with evidence, via `npm run hq -- brain write <slug> -`:
  the niche's style targets as a **fact** (pace, length, first cut), each winning format as a **lesson** with its source, and a **signal** to `competitors` with the accounts to keep watching.
  Lessons stay in the business vault; the CEO proposes the ones worth moving up to the HQ brain.

## Rules

- Copy the **formula**, never the footage, script, voice, music or a creator's signature.
- Reading public pages at human pace only: never log in, never ask for credentials, never bulk-scrape.
- Topics only from the niche's direct accounts; outsized accounts teach format only.
- Attribute every row to the account and clip it came from.
- Targets are medians of 8 or more clips from 3 or more accounts, or they're labelled "thin" in the guide.
