---
name: edit
description: >
  Edit raw footage into a finished video automatically: from clips plus a brief
  (or a script), choose and order the takes, cut pauses and fumbles, reframe for
  each platform, caption, add a hook, music and the brand look, then QA and fix
  until it passes, with no hand editing. Use when the user says "/hq:edit",
  "edit these clips", "make a video from this footage", "turn my takes into a
  reel", "cut this into a YouTube video", or a content plan says to edit a video.
---

# Edit

Fully automatic, like `/hq:clip`, but it builds one video from many takes to a brief. The owner
approves only publishing. Run commands from `$HQ_ROOT` (default `~/business-os`).

## 1. Brief and job

- **The brief:** the goal (sell, teach, announce), the audience, the length, the platforms, and
  must-say lines. Fill the gaps from the business profile and the Content department's latest plan.
- `JOB=$(npm run -s studio -- new-job <slug> "<title>")`. Each source gets an id: `a`, `b`, `c` …

## 2. Understand the footage

Transcribe every source:
`npm run -s studio -- transcribe <file> --out "$JOB"`.
- **Several takes of the same line:** use the cleanest (no fumble, no restart, finished sentence).
- **Silent B-roll:** probe it with `ffprobe` and look at a frame to know what it shows.
- **Motion graphics** (titles, stat cards, lower thirds): make them with `/hyperframes:hyperframes`
  as their own MP4, then use them as another source.

## 3. Build the edit

Write `$JOB/spec.json` (the format and all its fields are in the `/hq:clip` skill):
- **Order `segments` for the story:** hook, then the problem, the point or proof, and the payoff or call to action.
  The first segment must open on the hook line.
- `tightenPauses: 0.5` for talking-head footage. `captions: true` unless the owner says otherwise.
- **`formats`:** `vertical` for Reels, TikTok and Shorts; `landscape` for YouTube; `square` for feed posts.
- **`music`:** only a file the owner has licensed (never MusicGen output for monetised posts),
  at `volume` 0.1 to 0.2. It ducks under the voice automatically.
- The business's look comes from `$HQ_DATA/businesses/<slug>/brand.json`: font, colours and
  loudness. Create it the first time if the business has brand colours.

`npm run -s studio -- render "$JOB/spec.json"`

## 4. QA, and fix until it passes

`npm run -s studio -- check <each output> --hook "<hook>"`: every check must pass. Then read the
contact sheet image. Fix framing (`focusX`, `reframe`), order and trims, re-render and re-check.
After 3 failed attempts, report what's wrong rather than hand over a bad cut.

## 5. Hand over

Give the owner the files, the length per format, and the story in one line. Then offer
`/ig-caption` and `/hq:publish`. **Never post from this skill.**

## Rules

- The edit must not change what anyone meant: no stitching sentences into claims they didn't make.
- Never open `.env` files.
