---
name: script
description: >
  Write a talking-to-camera script that a stranger understands and keeps watching: a stranger brief first,
  a viewer-first structure, plain words (every insider word swapped or explained), three angles, then a
  cold-reader test by a fresh agent that knows nothing, and `hq script-check` before recording. Use when the
  user says "/hq:script", "write me a script", "script today's video", "make this script clearer / more
  engaging", "people won't know what I'm talking about", or before /hq:self-post records.
---

# Script: written for a stranger, checked by one

The viewer has never heard of you, your business or your tool, and decides in about 2 seconds. A script fails
when it assumes they watched yesterday's video, uses words only the owner knows, or lists features instead of
showing one thing working. This skill writes for that stranger and then proves a stranger understood it.

## 0. Read first

- `npm run -s hq -- brain read <slug> content`: lessons on hooks (trust trial data over any hook score).
- The style guide and the niche winners' transcripts, if `/hq:style` has run:
  `$HQ_DATA/businesses/<slug>/research/style-*/teardowns/*/transcript.txt`. Copy their moves, not their words:
  they open on the viewer's situation, explain every unfamiliar term in the same breath ("For those who don't
  know, X is..."), compare to something everyday ("it's what you'd give a new employee"), and narrate the
  screen step by step ("Start by... Next... And lastly...").
- The brief for this video (a handoff, the feature, what may be shown).

## 1. The stranger brief (before any line)

Write four sentences and show them to the owner with the script:

1. **Who's watching:** someone who has never seen this channel.
2. **Their problem, in their words:** what they struggle with that this video fixes.
3. **What they get by watching to the end:** one concrete takeaway or the free thing.
4. **The one idea:** a sentence a 12-year-old could repeat. If it needs "and", it is two videos.

## 2. Structure (about 45 to 55 s spoken; check the business's pace targets)

| # | Section | What it does |
|---|---|---|
| 1 | Hook | The viewer's problem as a question, or a surprising result in the first person. 14 words or fewer, concrete. Not a command ("Stop..."), not insider context ("Last video..."). The series line ("Day N of ...") follows it. |
| 2 | What it is | One plain sentence, plus an everyday comparison. |
| 3 | Show it | Narrate what is on screen, 2 or 3 steps in order, present tense. Every line should match a shot. |
| 4 | The proof | One true, specific moment ("it caught a dashboard that had stopped four days ago"). Never a result from demo data. |
| 5 | Why you care | What it does for the viewer, said to "you". |
| 6 | Ask | Free, the keyword, follow, and a one-line tease of the next video. |

## 3. Plain words

- Swap every insider word, or explain it in the same breath. `hq script-check` lists them with a plain swap
  ("holdout" → "a group that gets nothing, so you can compare").
- Name examples, not categories: "a welcome email when someone signs up", not "lifecycle flows".
- One idea per sentence, 14 words or fewer. Say "you" at least twice.
- Numbers only when the viewer can picture what they count ("51 jobs my business does on repeat", not "51 workflows").

## 4. Three angles, then pick by the cold reader

Write three full drafts with different openings: **problem question** ("Do you know which...?"), **surprising
result** ("I found out only 4 of..."), **show me** ("Watch this. I open..."). Do not pick by taste.

## 5. Cold-reader test (required)

Dispatch a fresh subagent per draft (Agent tool, no other context) with only the script text and this brief:

> You're scrolling Instagram Reels and this person starts talking. You've never heard of them or anything they've
> built. Read the script as if you're hearing it. Answer: (1) In one sentence, what is this video about? (2) What
> would you get from watching to the end? (3) Quote every line or word you didn't understand. (4) At which line
> would you swipe away, and why? (5) From 1 to 10, how well could you explain it to a friend?

**Pass:** the one-sentence answer matches the stranger brief's one idea, zero confusing lines, no swipe before
section 4, and a 7 or more. Revise the weak lines and re-test, at most three rounds. Show the owner the cold
reader's answers next to the script.

## 6. Mechanical check

```bash
npm run -s hq -- script-check <script.txt> --slug <slug> --keyword <WORD> --target <posted seconds>
```

It must say PASS (no dashes, no other business named, keyword present, hook 14 words or fewer, no 21+ word
sentence, length within 20% of target). Clear its advice or explain each insider word on purpose.
`hookscore` (ig-reel) is a tiebreak only.

## 7. Rules

- A public video carries no company data: no business names, handles, domains, customers or real numbers. Film and
  name only the invented demo business, and never present its invented results as real.
- No em or en dashes in hooks, captions or titles.
- Say only what the product really does; no revenue or conversion claims.

## 8. Save and open it

- Save to `~/teleprompter/scripts/<n>-<slug>.txt` with `## N · Name` sections, one take per section.
- **Always open it in the teleprompter right away:** if `http://localhost:8792/` doesn't answer, start
  `cd ~/teleprompter && python3 serve.py` in the background, then `open "http://localhost:8792/#script=<file name>"`.
  The owner reloads the phone to see it.
- Show the owner the stranger brief, the hooks, the main script and the cold reader's answers before writing the
  trial script. Trial hooks are full opening lines; each stand-alone clip must pass the cold reader on its own.
