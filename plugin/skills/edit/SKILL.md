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
- **Footage from the teleprompter** (a script folder with `choices.json`): use
  `npm run -s studio -- from-teleprompter <slug> <script-folder> ["<title>"]` instead. It makes the job with
  the owner's kept takes already joined in script order (`master.mp4`, plus `sections.json` with each section's start), so
  the owner's take choices are respected. Its refusals (a section with no kept take) go back to the owner.

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
- The business's look comes from `$HQ_DATA/businesses/<slug>/brand.json`: font, colours,
  loudness and `speed` (how fast its videos post, e.g. `1.25`; a spec's own `speed` wins, so leave it
  out of the spec to inherit). Create it the first time if the business has brand colours or a speed.
- **The finishing pass, also from `brand.json`:** `voice` (`"clean"`, the default: rumble cut, less boxiness,
  presence, softer esses and gentle compression before levelling; `"plain"`: levelling only), `punch: true`
  (punch-ins on face-only lines, numbers and keywords first, never under the hook or a cutaway, at least 2 s
  apart) and `sfx: true` (a synthesised whoosh just before each cutaway, an impact on full-frame cards, about
  5 dB under the voice). `punch` and `sfx` are off unless the business turns them on. Say in the hand-off which
  of them ran: a render with cutaways over every face line gets no punch-ins, and that is correct.
- **Cutaway traps:** one cutaway per sentence (a second one in the same sentence fails "couldn't find X after
  the previous cutaway"); anchor `from`/`to` on single stored words, and a token in the job's `words.json`
  must never contain a space; start each segment at speech onset (silencedetect) minus 0.08 s, because the
  transcriber dates first words late and a later start clips them.

`npm run -s studio -- render "$JOB/spec.json"`

## 4. QA, and fix until it passes

`npm run -s studio -- check <each output> --hook "<hook>"`: every check must pass. Then read the
contact sheet image. Fix framing (`focusX`, `reframe`), order and trims, re-render and re-check.
After 3 failed attempts, report what's wrong rather than hand over a bad cut.

## 5. Hand over

Give the owner the files, the length per format, and the story in one line. Then offer
`/ig-caption` and `/hq:publish`. **Never post from this skill.**

## Review notes: fix what the owner saw

The owner watches renders on the review page (`npm run studio -- review`, http://127.0.0.1:8794;
HQ runs it as the `com.hq.review` service) and presses N wherever something looks wrong. When they
say "fix my review notes on <video>":

1. `npm run studio -- notes <video>` (or a job folder): each open note's id, time, text, the caption
   on screen then, and the paths of the frame stills. **Read every frame** with the Read tool before changing
   anything: the stills are what they saw. A note can cover a span (`0:20.0–0:26.0`): it has stills from
   its start, middle and end, and every caption shown across it.
2. Map each note to the spec: the caption line at that time says which words are on screen; a cutaway
   covers `from`→`to` words; a cut sits between `segments`. Notes marked "earlier cut" were written on
   an older render, so find the moment by its caption text, not its time.
3. Fix the spec (cut points, cutaway files and anchors, hook, framing) and the cause, not just the
   symptom: a misheard word is fixed in the job's `<source>.words.json`, which captions defer to.
   If a note asks for something the footage can't give, say so instead of faking it.
4. Re-render, `check`, and look at the contact sheet as usual.
5. `npm run studio -- notes-fixed <video> <note-id> "<what changed>"` for each note you fixed. Leave a
   note open when you didn't fix it, and tell the owner why.

**Covers.** Every post gets a cover: `npm run studio -- cover <video> --day "Day 2" --title "My own ManyChat"`
writes `<video>.cover.jpg` from the clean source frame (the planner's chosen cover, `--at`, or a third in), with
the day and a 2 to 4 word title inside the 3:4 grid crop and above the face. Look at it before it's used.
/hq:publish passes it as the cover (Instagram `cover_url`, WoopSocial TikTok `cover`); YouTube Shorts pick theirs in the app.
With two or more options, `npm run studio -- cover-test <slug> <option…> --title "…"` ranks them against the niche's
covers (YouTube CTR Arena; `cover-pool <slug>` builds the pool once). It's advice for the owner's pick, not a gate.

**Cuts and speed.** On the same page the owner can mark parts to delete (the cuts lane, or I/O then X) and
an export speed, then press **Apply edits**, which re-renders through Studio and checks it. When they ask you
to apply them instead: `npm run studio -- apply-edits <video>` (the spec is backed up as
`spec.before-edits-<time>.json`; a cutaway left mostly inside a cut is dropped, and the command names it).
A render made before this existed has no `<format>.map.json`: render it once, then edits can apply.

## The brain (before and after)

- **Before:** `npm run hq -- brain read <slug> content`. Follow its decisions and playbooks and use its
  facts (offer, audience, voice, channels); don't relearn its lessons.
- **After:** write what this run taught, with evidence, via `npm run hq -- brain write <slug> -`:
  a **lesson** for each edit choice that measurably helped or hurt retention, and a **playbook** update when the process changed.
  Lessons stay in the business vault; the CEO proposes the ones worth moving up to the HQ brain.

## Rules

- The edit must not change what anyone meant: no stitching sentences into claims they didn't make.
- Never open `.env` files.
