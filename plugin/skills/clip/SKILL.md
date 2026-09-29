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

Copy or link the source video into `$JOB` (or use its absolute path). Business = the one named,
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

```bash
npm run -s studio -- render "$JOB/<n>/spec.json"
```

## 5. QA, and fix until it passes

```bash
npm run -s studio -- check "$JOB/<n>/<title>-vertical.mp4" --hook "YOUR HOOK HERE"
```

Every check must pass: format, duration, audio, loudness (−14 LUFS), no black frames, no
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

## Rules

- Never use MusicGen output for music in monetised posts (the weights are non-commercial).
  Only add music the owner has licensed.
- Don't invent claims the speaker didn't make. The hook text must be true to the clip.
- Never open `.env` files.
