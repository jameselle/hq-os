---
name: clip
description: >
  Turn a long video (podcast, interview, livestream, talk, webinar) into short
  vertical clips automatically: transcribe it, pick the moments that stand alone
  with a strong hook, cut, reframe to 9:16, caption, add the hook title, level
  the audio, then QA every clip and fix what fails, all with no hand editing.
  Use when the user says "/hq:clip", "clip this", "make shorts/reels/TikToks from
  this video", "find the best moments", "cut this podcast into clips".
---

# Clip

Everything here is automatic. The owner never edits by hand; they only approve
publishing (`/hq:publish` asks them). Run commands from `$HQ_ROOT` (default `~/business-os`).

## 1. Set up the job

```bash
JOB=$(npm run -s studio -- new-job <slug> "<source title>")
```

**Recorded on the teleprompter?** (a script folder under `~/Movies/Teleprompter/` with a `choices.json`)
Don't join the takes by hand. One command makes the job and its source:

```bash
npm run -s studio -- from-teleprompter <slug> ~/Movies/Teleprompter/<script-folder> ["<title>"]
```

It joins the kept take of every section, in script order, into `$JOB/master.mp4` (1080x1920, 30 fps), and
writes `sections.json` with where each section starts, which is useful for chapters and for clipping by section.
It refuses when a section has no kept take or a kept take is missing, and warns when a take failed the
teleprompter's own check. Relay those to the owner rather than working around them. Then continue with
`master.mp4` as the source.

Otherwise, copy or link the source video into `$JOB` (or use its absolute path). Business = the one named,
or the current one. Read the business profile's `brandVoice`, `audience` and the Content
department's `notes` (regulated industries!) from `http://127.0.0.1:3150/api/status?business=<slug>`.

## 2. Transcribe

```bash
npm run -s studio -- transcribe "$SOURCE" --out "$JOB"
```

It writes `$JOB/<file>.words.json`: every word with its start and end, in seconds. Read the
**whole** transcript before choosing anything.

## 3. Pick the clips (the craft)

Pick **3 to 5** unless asked otherwise. Each clip must:
- **Stand alone.** Someone scrolling with no context understands it. No "as I said", "that" or
  "he" pointing at something outside the clip.
- **Hook in the first 2 seconds.** A claim, a number, a surprise, a question or a contrarian line.
  If the best line comes mid-thought, start the clip there; a strong opening beats chronology.
- **End on a payoff.** A complete thought, punchline or answer. Never mid-sentence.
- **Last 20 to 60 seconds** (15 to 90 is the hard limit).
- **Fit the audience and brand voice,** and break no regulation note.
- **Not repeat another clip.**

For each clip, write the hook line for on-screen text: 2 to 6 words, uppercase, the promise of the clip.
Snap `start` to 0.1 s before the first word, and `end` to 0.3 s after the last.
Word times come from whisper's DTW alignment and are accurate to about 0.1 s. Trust them, and
trust `tightenPauses` to remove pauses: don't hand-place cuts. Captions are made from the rendered
audio itself, so they always match what's said.

## 4. Render each clip

Write `$JOB/<n>/spec.json`, one folder per clip so QA can find its spec:

```json
{ "business": "<slug>", "title": "<clip title>",
  "sources": { "a": "<absolute source path>" },
  "segments": [ { "source": "a", "start": 812.4, "end": 851.9 } ],
  "formats": ["vertical"], "reframe": "crop", "focusX": 0.5,
  "tightenPauses": 0.6, "captions": true,
  "hook": { "text": "YOUR HOOK HERE", "seconds": 2.5 } }
```

A clip can have several segments: stitch the setup to the payoff and drop a digression in between.
Add `"square"` or `"landscape"` to `formats` if the owner wants them.

**Hook:** `"highlight"` colours part of the hook (`"hook": { "text": "THIS RUNS MY WHOLE BUSINESS",
"highlight": "whole business" }`). The brand's `hook` style is `text` (big outlined words that pop in,
the default) or `box`. Captions pop word by word unless the brand sets `"captions": "none"`.

**Screen footage over the voice (cutaways).** When the speaker talks about something that can be
shown (a dashboard, a tool, a repo, a result), show it. Each cutaway covers the caption lines from
the words in `from` to the words in `to`, matched against what the finished cut says, so write them
the way the transcript spells them. On a vertical video the footage fills the top half, the face
moves to the bottom half (`faceY`: 0..1, where the face sits), and the captions move to the seam.

```json
"faceY": 0.5,
"cutaways": [
  { "file": "/abs/hq-home.png", "from": "I call it HQ", "to": "department of the business.",
    "pan": { "from": [472, 80, 1152], "to": [1240, 80, 1152] } },
  { "file": "/abs/screen-recording.mp4", "from": "Every tool", "to": "covers the job." }
]
```

- **Change of shot between takes** (another framing, room or light): cover the join with a full-screen
  cutaway, `"full": true`, e.g. a short title card running from the last word before the join to the first
  line after it. Captions stay in their usual place, so keep the card's content above the bottom third.
- Images: capture pages at 2x (Playwright, `deviceScaleFactor: 2`) and `pan` across them
  ([x, y, width] in image pixels, same width both ends). A video is scaled to fill the panel.
- **Look at every capture before using it.** Pages can show connected accounts, emails or other
  businesses' names. Pan only across regions you have read, and say what you kept out.
- Keep the hook and the punchline on the face; a cutaway on every line loses the person.
- If `render` stops with "couldn't find", it prints what the cut says: copy the words from there.

```bash
npm run -s studio -- render "$JOB/<n>/spec.json"
```

## 5. QA, and fix until it passes

```bash
npm run -s studio -- check "$JOB/<n>/<title>-vertical.mp4" --hook "YOUR HOOK HERE"
```

Every check must pass: format, duration, audio, no rotation tag, loudness (−14 LUFS), no black frames, no
dead air, opening words, and words kept of at least 90%. Then **look at the contact sheet PNG it
names** (read the image):
- **Faces or the subject cut off?** Change `focusX` (0 is left, 1 is right), or use `"reframe": "fit-blur"`.
- **Captions covering something important,** or the hook unreadable? Shorten the hook, or change the segment.
- **Opening words aren't the hook?** Move `start`.

Re-render and re-check. After 3 failed attempts on one clip, drop it and say why.

## 6. Hand over

For each clip, give the owner the file, the hook, its length, and a one-line reason it'll work.
Each render also writes a note to the vault under `Content & Social/Studio/`. Offer `/ig-caption`
for captions, then `/hq:publish` to post: that step asks the owner. **Never post from this skill.**

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

**Cuts and speed.** On the same page the owner can mark parts to delete (the cuts lane, or I/O then X) and
an export speed, then press **Apply edits**, which re-renders through Studio and checks it. When they ask you
to apply them instead: `npm run studio -- apply-edits <video>` (the spec is backed up as
`spec.before-edits-<time>.json`; a cutaway left mostly inside a cut is dropped, and the command names it).
A render made before this existed has no `<format>.map.json`: render it once, then edits can apply.

## Rules

- Never use MusicGen output for music in monetised posts (the weights are non-commercial).
  Only add music the owner has licensed.
- Don't invent claims the speaker didn't make. The hook text must be true to the clip.
- Never open `.env` files.
