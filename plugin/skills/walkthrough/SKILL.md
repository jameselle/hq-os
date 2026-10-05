---
name: walkthrough
description: >
  Make narrated "How it works" walkthrough videos of the business's own app or
  site, voiced in the owner's own cloned voice, free and local: record the owner
  on the teleprompter, clone the voice with VoxCPM2 in VoiceStudio, find the
  pages that changed or have no video, script them, record the live site with a
  spotlight and pointer, check every line against its script, show the owner,
  then ship. Use when the user says "/hq:walkthrough", "make a how it works
  video", "explainer videos for every page", "redo the walkthroughs", "clone my
  voice for the videos", "record yourself and use your voice".
---

# Walkthrough videos in the owner's voice

The owner reads once to the teleprompter; everything after that is automatic and
costs nothing per line. The owner only does two things: listens to the voice, and
approves the finished videos. Free tools only, all on this Mac.

| Step | Tool | Why this one |
|---|---|---|
| Record the owner | **Teleprompter** (`~/teleprompter`, Studio http://localhost:8792) | Raw takes at native speed, no music: the only clean clone source |
| Clone the voice | **VoiceStudio** (service `com.hq.voicestudio`, :3900) running **VoxCPM2** | Apache-2.0, keeps the accent, ~10 s a line warm. VoiceStudio's stock engine (OmniVoice) is non-commercial: never use it for the business |
| Drive the voice | VoiceStudio **MCP** (`clone_voice`, `generate_speech`, `transcribe`) or its HTTP API (`/profiles`, `/generate`) | |
| Record the site | The business's **walkthrough builder**: Playwright recording the deployed site with an overlay (title card, pointer, spotlight, label chip). Its location is in the business vault SOP | Footage is the real product with live data |
| Check the read | **whisper.cpp** (`~/.cache/hyperframes/whisper/…/whisper-cli`) + **FFmpeg** | A local model can slur a word |
| Install missing tools | `/hq:add-tool` | |

Read the business's own SOP first: `Departments/Content & Social/SOPs/` in its vault
names the builder, the reference clip and the voice profile already in use. Skip
any step that is already done there.

## 1. Record the voice reference (once per owner)

- Prefer takes the owner already made on the teleprompter:
  `~/Movies/Teleprompter/<script>/<NN-section>/take-NN.mp4`, the kept take per
  section in that folder's `choices.json`. Otherwise write a 2 to 3 minute script in
  the owner's normal explainer delivery ("here's what it does…") and have them read it.
- **Never use a posted edit.** Reels are sped up (1.25 to 1.5x) and carry music, and both get cloned.
- Extract and check each take:
  ```bash
  ffmpeg -i take.mp4 -vn -ac 1 -ar 48000 -c:a pcm_s16le take.wav
  ffmpeg -i take.wav -af "astats=measure_overall=Peak_count+Flat_factor" -f null -   # skip takes with real clipping (Peak count > a few, Flat factor > 0)
  ```
- Pick the calmest 15 to 20 s that ends on a sentence boundary (whisper with timestamps:
  `whisper-cli -m <model> -f clip16k.wav -ml 60 -sow`), cut it with a 0.2 s fade, and write
  its EXACT transcript beside it: `ref.wav` + `ref.txt`. Keep both outside every repo.
  They're the owner's biometric voice: never commit them, never upload them anywhere.

## 2. Clone the voice

1. VoxCPM2 installed? `curl -s :3900/engines/tts` → `voxcpm2` `available: true`. If not:
   `curl -X POST :3900/engines/sidecar/voxcpm2/install`, then poll
   `/engines/sidecar/voxcpm2/install/status`. It's a pinned PyPI install into its own venv, about 10 GB.
   The first line it speaks downloads the weights (about 7 minutes). After that it's about 10 s a line.
2. Make it the default: `curl -X POST :3900/engines/select -H 'content-type: application/json' -d '{"family":"tts","backend_id":"voxcpm2"}'`.
3. Save the owner as a profile: `curl -X POST :3900/profiles -F name="<Owner> (VoxCPM2)" -F ref_audio=@ref.wav -F ref_text="$(cat ref.txt)" -F language=en -F seed=<fixed>`.
   MCP `generate_speech` with that `profile_id` then needs no engine.
4. **Let the owner judge by ear.** Voice the same two or three lines with the candidate, open an A/B file
   (`real take → candidate`) and ask. Accent loss is the usual failure, and only a listen catches it.

## 3. Find what needs a video

- **Changed pages:** for each page with a video, list the commits since the video file last changed that
  touch the page or any component it imports (three levels deep). A UI change that alters what the
  narration describes or points at needs a re-record.
- **New pages:** routes with no entry in the builder's registry.
- Ask the owner before re-recording anything they've asked to leave alone.

## 4. Script each page

A page script is JSON: `slug`, `path`, `title`, `subtitle`, `ready` (a locator that means "loaded"), then
`beats`. Each beat has `say` (narration), `focus` (spotlight; an array spotlights the union), `label` (chip),
`do` (clicks/hovers/waits before it), and `after` (actions once its narration ends).

- One idea per beat, plain words, nothing a different live slate would make untrue. Point at
  `tbody tr >> nth=0`, never at a named fixture.
- To arrange the page for the camera (a market, pinned columns), use `"setup"` (clicks before recording) with
  `"readOnly": true`, which refuses the page's server actions so nothing is saved to the shared test
  account. Afterwards, load the page normally and confirm the account's own arrangement is untouched.
- Dry-run (`--dry`) and READ every screenshot. Positional cells shift when a table's columns change.
- ⚠️ Hard rule: nothing public carries any company's data. Walk through the product's public pages as a
  customer sees them, signed in as a test account; never an admin page, another member's data or internal numbers.

## 5. Render

- One page per process, so one failure doesn't stop the batch:
  `for s in …; do <builder> $s || echo "FAILED $s"; done`, in the background.
- Run it with credentials loaded at runtime (`node --env-file=<main checkout>/.env.local …`). Never copy
  or read the env file.
- Lines are cached per engine, so re-rendering after a UI change only voices new or reworded lines.

## 6. Check

- Transcribe every line and compare it with its script. Flag anything under 90% similar, then listen to the
  flags. Most are the transcriber mishearing the accent ("stake" heard as "steak"); re-voice a line only
  if it's really wrong.
- Contact-sheet each video (`ffmpeg -vf "fps=1/12,scale=480:-1,tile=4x2"`) and look: real page, spotlight
  on the right thing, nothing blank.
- Update each page's duration in the builder's registry.

## 7. Show the owner, then ship

- Copy the videos into one numbered folder and open them (`open -a "QuickTime Player" …`). Wait for the
  owner's yes or their edits. Edits re-render free.
- Ship through the business's normal route (a PR to the web repo, checks, merge). After the deploy, fetch
  each video from the live site and compare its bytes with the local file.
- Record it in the business vault: the SOP (voice, builder, what changed) and a session note.

## The brain (before and after)

- **Before:** `npm run hq -- brain read <slug> content`. Follow its decisions and playbooks and use its
  facts (offer, audience, voice, channels); don't relearn its lessons.
- **After:** write what this run taught, with evidence, via `npm run hq -- brain write <slug> -`:
  a **lesson** when a page, voice or render setting needed a fix worth keeping, and a **signal** to `design` or `engineering` for any confusing screen found while recording.
  Lessons stay in the business vault; the CEO proposes the ones worth moving up to the HQ brain.

## Rules

- Clone only a voice the owner has given consent for, and only their own.
- Free and local only: no paid TTS unless the owner says so.
- Never write the saved settings of a shared or test account to make a shot; use `setup` + `readOnly`.
- Never commit the voice reference, and never publish videos before the owner approves them.
