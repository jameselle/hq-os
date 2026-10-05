---
name: self-post
description: >
  The owner's own talking-to-camera post, end to end: script it, record it on
  the teleprompter, then Claude edits it with every editing skill (captions,
  hook, cutaways, animated cards, screen recordings, speed, covers, QA), the
  owner reviews it, and it posts to each channel with its own keyword campaign.
  Use when the user says "/hq:self-post", "self post", "make today's video",
  "today's episode", "write me a script and I'll record it", "I've recorded it,
  edit and post it", or starts any day of a founder video series.
---

# Self post: script → teleprompter → Claude edits → post

The owner does three things: reads the script to the camera, reviews the edit, and says yes to posting.
Claude does everything else. Run HQ commands from `$HQ_ROOT` (default `~/business-os`).

First read the business's own SOP for its series: `Departments/Content & Social/SOPs/` in its vault
(e.g. "Daily episode, end to end"). It names the business slug, the speed, the keyword habit and the
channels. Pick up where the owner already is: if takes exist, skip to step 3; if a job exists, skip to step 4.

## The skills, step by step

| Step | Skills and tools |
|---|---|
| 0. Know what wins | `/hq:style` (the niche's winning clips → style guide + `style.json` pace targets) |
| 1. Script | `/hq:script` (stranger brief, three angles, cold-reader test, `hq script-check`), with `/ig-viral` (what's working now), `/ig-reel` (hook options scored) and `/ig-human` (strip AI tells and dashes) |
| 2. Record | Teleprompter (`~/teleprompter`, Studio http://localhost:8792) |
| 3. Job | HQ Studio `from-teleprompter` |
| 4. Edit | `/hq:edit` (cut, order, captions, hook, speed, brand), `hyperframes:hyperframes` (animated cards), Playwright screen recordings, `/hq:clip` (short cuts and hook variants for trial reels) |
| 5. Check | `studio check`, contact sheet |
| 6. Review | HQ Studio review page http://127.0.0.1:8794 (owner's notes → "fix my review notes"), planner |
| 7. Cover | `studio cover`, or the owner's own design made grid-safe; `studio cover-test` ranks the options (YouTube CTR Arena) |
| 8. Caption | `/ig-caption`, `/ig-human`, `npm run hq -- caption-check` |
| 9. Post | `/hq:publish` (feed Reel, trial reels, TikTok, YouTube Shorts), comment-dm campaign per post |
| 10. Learn | `/ig-audit` once posts have numbers; reuse the hooks that won |

## 0. Know what wins

Read the business's **style guide** (`Departments/Content & Social/Style guide.md` in its vault) and
`$HQ_DATA/businesses/<slug>/style.json`. If there's none, or it's older than a month, run `/hq:style` first: it
finds the clips winning in the niche and turns them into topics, hook formulas, a beat sheet, an edit and
animation style, and pace targets.

## 1. Script

- Pick the topic from the style guide's **topics that win here** (in the niche), and the hook from its **hook
  formulas**; follow its beat sheet's timings.
- Find the angle: `/ig-viral` for what is working in the niche now, if the owner has no topic.
- **`/hq:script` writes it, for a stranger:** a four-sentence stranger brief, a viewer-first structure (hook,
  what it is, show it, proof, why you care, ask), plain words, three angles, then a cold-reader test by a fresh
  agent that knows nothing, and `npm run -s hq -- script-check <file> --slug <slug> --keyword <WORD>` must PASS.
  `/ig-reel` supplies scored hook options and the beat sheet. Facts only. **No em or en dashes anywhere.**
- After saving a script, always open it in the teleprompter: `open "http://localhost:8792/#script=<file name>"`.
- Run it through `/ig-human`, then save it to `~/teleprompter/scripts/<n>-<slug>.txt` (or the Studio's Scripts tab).
  Split it into sections with `## N · Heading` lines; each section is recorded as its own take. `{{like this}}`
  marks a blank the owner fills in, and the Studio flags any left.
- Want trial reels? Write a second script: 2 to 3 alternative hooks (each a full opening line) and 1 to 2 short
  standalone clips. Hooks are tested by posting the same body with different openings.
- If the post gives something away, pick the comment **keyword** now (one word, in capitals in the script's ask).

## 2. Record

- Start the teleprompter if it isn't running: `cd ~/teleprompter && python3 serve.py` (it isn't a service, so it
  stops when the session that started it stops). The owner reloads the prompter on the phone to see the new script.
- The owner records each section and keeps one take; takes land in
  `~/Movies/Teleprompter/<script>/<NN-section>/take-NN.mp4`, kept takes in `choices.json`.
- Never paste the Studio URL anywhere: it carries the prompter key.

## 3. Make the job

```bash
npm run -s studio -- from-teleprompter <business-slug> ~/Movies/Teleprompter/<script> "<title>"
```

It joins the kept take of every section in script order into the job's `master.mp4`. Then fix THAT job's
`master.mp4.words.json` (numbers as digits, the keyword in capitals, punctuation so captions break), and keep
`captionText: "source"`. Studio re-transcribes per job, so never fix another job's words file.

## 4. Edit for retention (Claude, every skill)

Follow `/hq:edit` for the cut itself, and the style guide's **edit and animation style** (card types, caption
style, cutaway cadence). Aim for the pace in `style.json`; `studio check` prints each target with ⚠ where the
render is far off. Without a style guide, aim for **something new on screen every 2 to 3 seconds**:

- **Animated cards** with HyperFrames (`hyperframes:hyperframes`): number countdowns, slams, keycaps. Split cards
  (1080x960 over the face) or full frame (1080x1920). The main beat lands by 1.2 s, then holds and drifts.
  Motion polish on every card: moves overshoot and settle (back-out eases), blur in proportion to their speed
  (about half the distance moved per frame, capped), groups enter staggered, and a card the face follows gets a
  small exit shrink (ease in, about 0.2 s) timed to its real slot from the last render's `vertical.map.json`.
  A card that runs short holds its last frame, so never end one on an empty frame unless it is cut to its slot.
- **Editorial overlays:** a highlight sweep (a marker bar wiping behind the key word) on a card's payoff line,
  and a dot-and-label callout over a screen recording (dim the rest, outline the target, dot, leader line,
  label) wherever the line points at something on screen. Only on a part of the recording that holds still.
- **Real screen recordings** of whatever the post is about (Playwright `recordVideo`), cropped to the panel shape
  and sped up 1.5x. Never a static panel of mostly empty UI: make a card instead.
- A **full-frame chapter card** at the "Day N" line, or wherever two takes in different rooms or outfits join.
- Speed comes from the business's `brand.json` (`speed`); a spec's own `speed` wins.
- The finishing pass comes from `brand.json` too: `voice` (`"clean"` by default, `"plain"` to only level),
  `punch` (punch-ins on face-only lines) and `sfx` (whoosh into each cutaway, impact on full-frame cards).
  `/hq:edit` has the rules; report which of them ran.
- ⚠️ Check every screenshot and recording for other people's or other businesses' names before it goes in.
- ⚠️ **Hard rule: nothing public carries any company's data.** Record HQ, admin pages and any internal tool on a
  throwaway demo instance (`HQ_DATA=<empty dir>` with the demo business, e.g. `npx next start -p 3199`), never the
  live console: no real revenue, members, sends, customers, account ids or private repos on screen.
- **Trial-reel variants:** `/hq:clip` or a spec per hook: each hook opening joined to the same body.

## 5. Check

`npm run -s studio -- check <video> --hook "<hook>"` must PASS (including "picture ends with the sound"). Then
read a dense contact sheet and look for joins, framing, sideways takes (iPhone -90 tags) and captions under
cards. Fix, re-render, re-check. After 3 failed attempts, report what is wrong.

## 6. Review

Open it on the review page (http://127.0.0.1:8794). The owner presses N to leave notes on frames. When they
say "fix my review notes": `npm run studio -- notes <video>`, read every still, fix the spec or the job's
words, re-render, check, `notes-fixed`. "Apply my edits" → `npm run studio -- apply-edits <video>`. The
planner previews each channel's grid; trial reels sit apart.

## 7. Cover

`npm run studio -- cover <video> --day "Day N" --title "2 to 4 words"` (the title sits inside the 3:4 grid crop,
above the face; `--at <s>` and `--face <y>` to adjust). If the owner brings their own design, shrink it onto a
blurred copy until nothing is lost in the 3:4 tile.

**When there's more than one option** (the owner's design, its full-bleed 9:16 version, a `studio cover` frame or
two), rank them: `npm run studio -- cover-test <slug> <option…> --title "<the cover's words>"`, adding `--shape 3x4` for
the Instagram grid tile. Make extra frames with ffmpeg into a scratch folder, never as `<video>.cover.jpg`
(/hq:publish uses that file). If the business has no `covers/` pool yet, run `npm run studio -- cover-pool <slug>` first
(about 3 minutes). Show the owner the ranking beside the options, side by side. It's advice, not a gate: it's a
simulated feed, it can't see text the 3:4 crop cuts off (check that by eye), and the owner picks. Save a **signal**
when the arena's pick and the post's real numbers disagree.

## 8. Caption

`/ig-caption` writes the line that survives "… more", the body, the single ask (the keyword), and three hashtags.
`/ig-human` it, then `npm run hq -- caption-check`. The TikTok and YouTube versions drop the keyword ask and say
"link in bio" (YouTube's description carries the links).

## 9. Post

`/hq:publish`: dry run every channel, ask the owner, post, read each post back.
- **Instagram:** a feed Reel, or **trial reels** (non-followers only; they go through the Graph API with the
  comment-dm Meta app token and `trial_params`). Trials never reach followers: a feed post does.
- **Keyword campaign:** each post gets its **own** comment-dm campaign scoped to its media id, created right after
  it publishes; restart comment-dm so it loads. A keyword never answers on another post.
- **TikTok and YouTube Shorts:** the cut without the keyword ask.
- Then: watch comment-dm's log until the first person gets the link, and add anything new to the bio-link site.

## 10. Learn

When the posts have numbers, `/ig-audit` says which hooks and formats worked; feed that into the next script's
hook choice. Record the day in the business's vault (session note).

## The brain (before and after)

- **Before:** `npm run hq -- brain read <slug> content`. Follow its decisions and playbooks and use its
  facts (offer, audience, voice, channels); don't relearn its lessons.
- **After:** write what this run taught, with evidence, via `npm run hq -- brain write <slug> -`:
  a **lesson** per result worth keeping (which hook won and by how much, what the edit changed), and a **signal** to `data` when numbers need watching.
  Lessons stay in the business vault; the CEO proposes the ones worth moving up to the HQ brain.

## Rules

- No em or en dashes in scripts, captions, hooks, titles or covers.
- Never post without the owner's yes. `/hq:publish` asks.
- One keyword campaign per post.
- comment-dm and the review page only work while the Mac is awake.
- Free tools only; music only if the owner licensed it.
