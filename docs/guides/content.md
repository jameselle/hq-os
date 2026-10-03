# Content & Social: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** makes the videos and posts, schedules them everywhere, and learns what worked.

**It covers:** short-form video (reels, TikTok, Shorts); captions, carousels, stories; scheduling and posting;
post-mortems on what performed.

**Owner's time:** about 60 to 90 minutes, spread over a few sittings (most of it is signing in to accounts and
recording a voice sample). **Cost:** free. Composio's Hobby plan gives 100,000 tool calls a month; WoopSocial's
free plan covers 2 social accounts with unlimited posts (X uses credits); ManyChat's free plan covers 25 active
contacts a month and 3 keyword triggers. Nothing here needs a paid plan.

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar.
- The business profile lists its channels as handles (for example `"instagram": "@acmeco"`). If it doesn't,
  add them first: publishing only works for channels the profile names.
- Backups are running ([IT & Security](/guides/security)): this department makes large files and a voice
  profile you don't want to lose.
- Optional but useful first: [Design & Brand](/guides/design) for colours and fonts, and
  [Market & Competitors](/guides/competitors) for the accounts `/hq:style` studies.

## 1. Tools

Content has the most tools of any department. They fall into five jobs: **posting** (Composio, WoopSocial,
Postiz), **making video** (HyperFrames, HQ Studio, FFmpeg, whisper.cpp, Teleprompter), **voice and music**
(VoiceStudio, VoxCPM2, Kokoro TTS, MusicGen), **auto-replies** (ManyChat or comment-dm), and **optional
editors and recorders**. Set them up in the order below.

Every install goes through `/hq:add-tool`: free tools only, from a checksum-verified or notarised release or
from source, never `curl | sh`, no Homebrew, no Docker on the Mac. Servers bind to 127.0.0.1 and run as
launchd services: after installing one, run `npm run hq -- services add-defaults && npm run hq -- services install`,
then check with `npm run hq -- services status`.

### Composio

- **What it's for:** HQ's publishing layer. It posts to Instagram, YouTube, Pinterest, Facebook, LinkedIn and X
  through apps that are already approved, so the owner never builds a developer app of their own.
- **Needed or optional:** needed if the business posts to any of those platforms.
- **Licence or plan:** free Hobby plan (100,000 tool calls a month, unlimited connected accounts). The SDK is MIT.
- **Set it up:** the owner signs up at https://platform.composio.dev themselves (never sign up on their behalf)
  and adds the Composio connector to Claude. Then run `/hq:connections` to connect each channel (see section 2).
- **How HQ checks it:** a free web service. It shows **connected** once the connection snapshot has an active
  Instagram account, otherwise **web**.

### WoopSocial

- **What it's for:** TikTok publishing. It's an audited TikTok partner, so posts can be public (TikTok's own API
  keeps unaudited apps to private posts). HQ reaches it through Composio's `woop_social` toolkit.
- **Needed or optional:** needed if the business posts to TikTok.
- **Licence or plan:** free plan: 2 social accounts, unlimited posts (X uses credits), API access.
- **Set it up:** the owner creates a free WoopSocial account at https://www.woopsocial.com and connects the
  TikTok account inside WoopSocial. Then they paste WoopSocial's API key into the `woop_social` form in Composio
  themselves. Never ask for the key in chat. Then run `/hq:connections` to refresh.
- **How HQ checks it:** a free web service; **connected** once the snapshot has an active `woop_social` account.

### Postiz

- **What it's for:** a self-hosted scheduling calendar, and the route for Discord, Telegram, Reddit, Bluesky,
  Mastodon and Threads (bot tokens, no platform review).
- **Needed or optional:** needed only if the business posts to one of those channels, or wants a calendar view.
- **Licence or plan:** open source, AGPL-3.0.
- **Set it up:** `/hq:add-tool Postiz for content`. It lives in `~/postiz-app` with its own Postgres, Redis and
  Temporal under `~/.local/opt`. Once installed, `services add-defaults` adds four services
  (`com.hq.postiz.postgres`, `com.hq.postiz.redis`, `com.hq.postiz.temporal`, `com.hq.postiz.app`); then
  `services install`. Open http://localhost:4200 and the owner creates the first user and connects each channel
  there. Instagram and Threads in Postiz need the owner's own Meta app, so use Composio for Instagram instead.
- **How HQ checks it:** port 4200 answering (**running**), or `~/postiz-app` present (**installed**).

### HyperFrames

- **What it's for:** writes video as HTML and renders MP4s; Claude drives it. HQ Studio uses it for animated
  cards, titles and motion graphics. Its local setup also brings the whisper.cpp build and the Python venv that
  Kokoro TTS and MusicGen live in.
- **Needed or optional:** needed.
- **Licence or plan:** open source, Apache-2.0.
- **Set it up:** `/hq:add-tool HyperFrames for content` (the Claude plugin plus its local checkout in
  `~/hyperframes`). Then turn its telemetry off: add `export HYPERFRAMES_NO_TELEMETRY=1` to `~/.zshrc`.
- **How HQ checks it:** the plugin in `~/.claude/plugins/cache/hyperframes` or `~/hyperframes` (**installed**).

### HQ Studio, FFmpeg and whisper.cpp

- **What it's for:** **HQ Studio** is HQ's own fully automatic clipping and editing engine: transcribe, pick
  moments, cut pauses, reframe, caption, hook, cutaways, music, level to -14 LUFS, QA, and post covers. Its review
  page (http://127.0.0.1:8794) is where the owner watches each edit, presses N to leave a note Claude then fixes,
  marks cuts and an export speed, and plans the Instagram, TikTok and YouTube grids (trial reels kept apart).
  **FFmpeg** cuts, converts and encodes; **whisper.cpp** transcribes locally for word-timed captions. Studio
  needs both.
- **Needed or optional:** HQ Studio is the default editor (one of a group with DaVinci Resolve, Kdenlive and
  OpenCut: one is enough). FFmpeg and whisper.cpp are needed.
- **Licence or plan:** HQ Studio is part of HQ. FFmpeg is LGPL-2.1-or-later; whisper.cpp is MIT.
- **Set it up:** HQ Studio comes with HQ (`npm run studio -- <command>`). Its review page is the `com.hq.review`
  service, which `services init` already includes. Check `which ffmpeg ffprobe` prints two paths; if not,
  `/hq:add-tool FFmpeg for content`. Studio expects whisper-cli at
  `~/.cache/hyperframes/whisper/whisper.cpp/build/bin/whisper-cli` and the model at
  `~/.cache/hyperframes/whisper/models/ggml-small.en.bin`; if `npm run studio -- transcribe` says
  "whisper-cli isn't built" or "whisper model missing", run `/hq:add-tool whisper.cpp for content`.
- **How HQ checks it:** HQ Studio: port 8794 (**running**) or the whisper model file (**installed**). FFmpeg:
  `ffmpeg` on the PATH. whisper.cpp: the whisper-cli binary above.

### Teleprompter

- **What it's for:** an iPhone teleprompter. The owner reads the script to the phone camera, records section by
  section and retakes any bit; takes save to the Mac (`~/Movies/Teleprompter/`) and are checked.
  `npm run studio -- from-teleprompter` turns the kept takes into a Studio job.
- **Needed or optional:** needed for `/hq:self-post` and `/hq:walkthrough`; optional otherwise.
- **Licence or plan:** open source, MIT.
- **Set it up:** `/hq:add-tool Teleprompter for content` (installs to `~/teleprompter`). It isn't a background
  service: start it with `Start Teleprompter.command` (or `cd ~/teleprompter && python3 serve.py`) when
  recording, and stop it afterwards. Its Studio is http://localhost:8792; the phone joins over home Wi-Fi on
  port 8791 with HTTPS and a secret link.
- **How HQ checks it:** port 8792 (**running**) or `~/teleprompter/serve.py` (**installed**).

### VoiceStudio and VoxCPM2

- **What it's for:** **VoiceStudio** is a local voice studio: clone a voice, design one from a description,
  voiceovers, dubbing, transcription. Claude drives it through its MCP. **VoxCPM2** is the voice model to use
  for business: it clones the owner's voice from about 16 seconds of a clean take plus its transcript, keeps
  the accent, and voices narrated videos for free.
- **Needed or optional:** needed for `/hq:walkthrough` and any narrated video; optional otherwise.
- **Licence or plan:** VoiceStudio is AGPL-3.0; VoxCPM2 is Apache-2.0. **VoiceStudio's stock default engine,
  OmniVoice, is non-commercial**: switch the default to VoxCPM2 and never use OmniVoice for the business.
- **Set it up:** `/hq:add-tool VoiceStudio for content`. It's built from source into `~/.local/opt/voicestudio`
  because the upstream Mac release is unsigned, so decline its in-app update prompts and rebuild instead. Then
  `services add-defaults && services install` adds `com.hq.voicestudio` on 127.0.0.1:3900. Install VoxCPM2 and
  make it the default by following `/hq:walkthrough` step 2 (`POST /engines/sidecar/voxcpm2/install`, then
  `POST /engines/select`). It's about 10 GB, and the first line it speaks downloads the weights (about 7 minutes).
  The owner records a voice reference once and listens to the clone before it's used. Clone only voices you have
  permission for.
- **How HQ checks it:** VoiceStudio: port 3900 (**running**) or the VoiceStudio app (**installed**). VoxCPM2:
  its venv under `~/Library/Application Support/OmniVoice/engines/voxcpm2/` (**installed**).

### Kokoro TTS and MusicGen

- **What it's for:** **Kokoro TTS** is a local stock voiceover (text to speech) when the owner's own voice
  isn't wanted. **MusicGen** makes local background music from a text prompt.
- **Needed or optional:** listed as needed; both come with the HyperFrames Python venv.
- **Licence or plan:** Kokoro (kokoro-onnx) is MIT. MusicGen's code is MIT but **its model weights are
  CC BY-NC 4.0: never use MusicGen music in a video that earns money.** Use music the owner has licensed.
- **Set it up:** installed with HyperFrames into `~/.local/venvs/hyperframes`. If missing, `/hq:add-tool`.
- **How HQ checks it:** the package folders in `~/.local/venvs/hyperframes/lib/python3.12/site-packages/`
  (`kokoro_onnx` for Kokoro, `transformers` for MusicGen).

### ManyChat or comment-dm

- **What it's for:** auto-replies that turn engagement into leads. **ManyChat** does comment-to-DM and keyword
  replies as a hosted Meta partner. **comment-dm** is HQ's own version: someone comments a keyword on an Instagram
  post, it replies to the comment, DMs a button, checks they follow, and sends the link. Each post gets its own
  keyword. It polls every 15 seconds on this Mac, and its Meta app token is also what posts Instagram trial reels.
- **Needed or optional:** one of a group: one is enough. **Never run both on the same Instagram account.**
- **Licence or plan:** ManyChat: free plan (25 active contacts a month, 3 keyword triggers). comment-dm: MIT,
  free and unlimited, using the owner's own Meta app on Standard Access (no App Review for your own account).
- **Set it up:** ManyChat: the owner signs up at https://app.manychat.com and connects Instagram, Facebook or
  TikTok inside ManyChat. comment-dm: `/hq:add-tool comment-dm for content` (installs to `~/comment-dm`). The
  owner creates their own Meta app and enters its token themselves, never in chat. comment-dm runs as its own
  launchd job, `com.commentdm.run`, not an HQ service. Both use the platforms' official APIs: never automate
  Instagram or TikTok DMs through a browser.
- **How HQ checks it:** ManyChat: a free web service. comment-dm: the `com.commentdm.run` job running, or
  `~/comment-dm/commentdm/flow.py` present.

### Hypit

- **What it's for:** rebuilds a video's format (captions, B-roll, graphics, timing) as an editable workflow for
  Claude, then makes variants. Renders through HyperFrames.
- **Needed or optional:** listed as needed; worth it once the business wants several variants of a format that works.
- **Licence or plan:** modified Apache-2.0. Free to run yourself for your own business, including commercial
  work, and the output is yours. Hosting it for others or selling or bundling it isn't allowed.
- **Set it up:** `/hq:add-tool Hypit for content` (the `hypit` CLI and its Claude skill). Keep projects on its
  local profile (media, HyperFrames, OpenCV, WhisperX): generated faces, voices and footage go through **paid**
  providers, so ask the owner before any cost. Clone a format's structure, never someone else's footage or script.
- **How HQ checks it:** `hypit` on the PATH, or `~/.claude/skills/hypit` (**installed**).

### Meta Business Suite

- **What it's for:** Meta's native scheduling and inbox for Instagram and Facebook.
- **Needed or optional:** listed as needed; the owner uses it by hand to read and answer the inbox.
- **Licence or plan:** free (proprietary).
- **Set it up:** the owner signs in at https://business.facebook.com with the account that owns the Page and the
  Instagram account. Nothing to install.
- **How HQ checks it:** a free web service.

### DaVinci Resolve, Kdenlive and OpenCut

- **What it's for:** hand editors, for the rare edit HQ Studio can't do. **DaVinci Resolve** is pro-grade editing,
  colour and audio; **Kdenlive** is a full timeline editor; **OpenCut** is a CapCut-style editor being rewritten
  with an MCP server and headless mode for agents.
- **Needed or optional:** one of the editor group with HQ Studio, so none is needed when HQ Studio is installed.
  OpenCut's rewrite hasn't shipped: don't install it yet.
- **Licence or plan:** DaVinci Resolve: free edition (Studio is paid). Kdenlive: GPL-3.0. OpenCut: MIT.
- **Set it up:** `/hq:add-tool`. Mac apps come as the official notarised download, which the owner drags to
  Applications.
- **How HQ checks it:** the DaVinci Resolve or Kdenlive app (**installed**). OpenCut has no check yet, so it
  always shows **missing**; that doesn't count against readiness while HQ Studio is installed.

### OBS Studio or Recordly

- **What it's for:** recording. **OBS Studio** records the screen and camera. **Recordly** records product demos
  with auto-zoom, cursor polish, a webcam bubble and styled frames.
- **Needed or optional:** one of a group: one is enough.
- **Licence or plan:** OBS Studio: GPL-2.0. Recordly: AGPL-3.0 (changes you ship must stay open; videos you make
  carry no obligation).
- **Set it up:** `/hq:add-tool`. Recordly is built from source in `~/recordly` and installed to `~/Applications`;
  launching it from Claude's shell needs `env -u ELECTRON_RUN_AS_NODE`. Both need Screen Recording (and Microphone
  or Camera if used) in System Settings; the owner grants it. Recordly is ad-hoc signed, so macOS may ask again
  after each rebuild.
- **How HQ checks it:** the OBS app, or the Recordly app or `~/recordly` (**installed**).

## 2. Accounts and connections

Each channel in the business profile posts through a **route**. The default depends on the platform, and the
profile can override it with `"via"`:

| Platform | Default route | How it's connected |
|---|---|---|
| Instagram, YouTube, Pinterest, Facebook, LinkedIn, X | Composio | `/hq:connections connect <toolkit>` gives a Composio sign-in link, valid 10 minutes |
| TikTok | WoopSocial (Composio's `woop_social` toolkit) | connect TikTok inside WoopSocial, then the owner adds the WoopSocial API key in Composio |
| Discord, Telegram, Reddit, Bluesky, Mastodon, Threads | Postiz | inside Postiz at http://localhost:4200 (bot tokens) |
| anything else | manual | posted by hand |

1. Run `/hq:connections`. It lists Composio's connections (no side effects) and saves a snapshot to
   `$HQ_DATA/connections.json` with ids, aliases, names and statuses only. The save refuses anything that looks
   like a credential.
2. For each channel that isn't connected, the owner says which to connect, and Claude runs
   `/hq:connections connect <toolkit>`. The owner opens the link and signs in; Claude never signs in for them.
3. A channel only counts as connected when the connected account's name matches the profile's handle, or the
   profile pins it: `"instagram": { "handle": "@acmeco", "via": "composio", "account": "instagram_abc-def" }`.
   HQ never assumes another business's account is this one's.
4. Check: `npm run hq -- publishing <slug>` prints each channel's route, state and tool sequence.

Auto-replies connect separately: ManyChat inside ManyChat, comment-dm through its own Meta app. Neither goes in the
snapshot. HQ never stores keys or tokens: they stay in Composio, WoopSocial, Postiz or the owner's Keychain.

## 3. Skills to use

**Making video**

- `/hq:style`: finds the short videos winning in the niche, measures them (cuts per 10 s, pace, first word, hook)
  and tears the best apart, then writes `style.json` pace targets and a style guide in the vault. Run it first,
  and monthly.
- `/hq:self-post`: the owner's own talking-to-camera post, end to end: script, teleprompter, Claude edits with
  every skill, review, cover, caption, post.
- `/hq:clip`: a long video (podcast, interview, talk) into 3 to 5 short vertical captioned clips, QA'd. Never posts.
- `/hq:edit`: raw footage plus a brief into a finished video for each platform, QA'd. Never posts.
- `/hq:walkthrough`: "how it works" videos of the business's own app or site, in the owner's cloned voice, free
  and local.
- `/hyperframes:hyperframes`: make any video; routes to the right HyperFrames workflow.
- `/hyperframes:product-launch-video`: a promo video from a website.
- `/hyperframes:embedded-captions`: captions on a talking-head video.
- `/hyperframes:music-to-video`: a beat-synced reel from a track.
- `/hypit`: clone a video format and make variants.
- `/video-teardown`: pull a competitor's video apart to study how it's built.

**Writing and planning**

- `/ig-plan`: plan the week on Instagram.
- `/ig-reel`: hook options, spoken script and beat sheet for a reel.
- `/ig-caption`: the caption, the first line, the ask and three hashtags.
- `/ig-carousel`: carousel copy and slide files.
- `/ig-story`: a story sequence and stickers.
- `/ig-repurpose`: one long asset into a week of posts.
- `/ig-viral`: what's working in the niche right now.
- `/ig-human`: strip the AI tells (and dashes) from a draft. Run it on every caption and script.
- `/marketing:content-creation`: channel-ready marketing content.

**Posting and learning**

- `/hq:connections`: see and connect the accounts HQ can post to.
- `/hq:publish`: post to any channel by its route. It dry-runs every channel first, asks the owner, posts, reads
  the post back from the platform, and logs it.
- `/postiz:postiz`: schedule and post through Postiz.
- `/ig-audit`: once posts have numbers, what worked and what to stop.

## 4. Check it's working

- The department tab shows Composio and WoopSocial as **connected**, HyperFrames, FFmpeg, whisper.cpp,
  Teleprompter, VoxCPM2, Kokoro TTS and MusicGen as **installed**, and HQ Studio and VoiceStudio as **running**.
  Or check from the terminal:
  `curl -s http://127.0.0.1:3150/api/status | jq '.departments[] | select(.slug=="content") | .tools[] | {name, state}'`.
- `npm run hq -- services status` shows `com.hq.review` (port 8794) and, if installed, `com.hq.voicestudio`
  (3900) and the four `com.hq.postiz.*` services, each with its port answering.
- `npm run hq -- publishing <slug>` shows every channel as `connected` (or `via-postiz` with Postiz up, or `manual`).
- A test caption passes: `printf '%s' "Fresh beans, every week." | npm run hq -- caption-check -` prints
  `caption ok: no em or en dashes`. A caption with an em dash is refused.
- A test clip renders and passes QA: run `/hq:clip` on a short video, and `npm run studio -- check` passes every
  check. It doesn't post.
- The CEO tab shows no unresolved Content findings. The ones you may see, and how each clears:
  - **"HQ doesn't know which accounts are connected"**: run `/hq:connections`.
  - **"Connect Instagram for Acme Co (composio)"** (one per channel): connect it as in section 2, then
    `/hq:connections`.
  - **"The connection snapshot is over a week old"**: run `/hq:connections` again.
  - **"Postiz isn't running"**: `npm run hq -- services start`, or `/hq:services` to find which piece is down.
  - **"HyperFrames still reports usage to HeyGen"**: add `export HYPERFRAMES_NO_TELEMETRY=1` to `~/.zshrc`.
  - **"MusicGen music is non-commercial"**: a standing reminder. Once the owner has read it,
    `npm run hq -- done - musicgen-nc` clears it.

## Done when

- [ ] Every channel in the profile shows `connected`, `via-postiz` or `manual` in `npm run hq -- publishing <slug>`.
- [ ] The connection snapshot is less than a week old.
- [ ] HyperFrames, FFmpeg and whisper.cpp are installed and HyperFrames telemetry is off.
- [ ] `com.hq.review` is running and the review page opens at http://127.0.0.1:8794.
- [ ] A test clip from `/hq:clip` passes `npm run studio -- check`.
- [ ] `caption-check` passes a clean caption and refuses one with an em dash.
- [ ] If the business narrates videos: VoiceStudio runs with VoxCPM2 as its default and the owner has approved
      the cloned voice by ear.
- [ ] One auto-reply tool (ManyChat or comment-dm) per Instagram account, or a decision not to use one.
- [ ] `/hq:style` has written the business's style guide and `style.json`.
- [ ] The department tab shows **equipped**, and the CEO tab has no open Content findings you haven't chosen to leave.

## Good to know

- **Nothing is posted without the owner's explicit yes for that post.** `/hq:clip`, `/hq:edit` and the studio
  never post. `/hq:publish` dry-runs every channel, shows the owner the account, caption, media and timing, waits
  for a yes (a yes for one channel isn't a yes for the others), then reads the post back. A post is only logged
  as `published` with a url or id read back from the platform.
- **No em or en dashes in any caption, title, hook or cover.** `npm run hq -- caption-check` enforces it; rewrite
  with a comma, colon or full stop.
- Media posted through the Composio connector must be a **public URL** the platform can fetch. If the file is only
  local, ask the owner how to host it.
- Never automate Instagram or TikTok DMs or posting through a browser. Use the official routes above.
- The Teleprompter is the one HQ tool that isn't 127.0.0.1-only (the phone joins over Wi-Fi). Stop it when
  recording is done, and never paste its Studio URL anywhere: it carries the prompter key.
- comment-dm and the review page only work while the Mac is awake. Give each post its own comment-dm keyword
  campaign; a keyword never answers on another post.
- Non-commercial models: VoiceStudio's OmniVoice engine and MusicGen's weights are not for business use. VoxCPM2,
  Kokoro and licensed music are fine.
- A local voice model can slur a word: transcribe the result and compare it with the script before publishing.
  Use a raw take for the voice reference, never a sped-up edit or one with music, and never commit or upload it.
- Hypit's generated faces, voices and footage use paid providers: only with the owner's approval of the cost.
- Before a screenshot or screen recording goes into a video, look at it for other people's or other businesses'
  names, emails or connected accounts.
- Regulated industries: follow the Content department's notes on the tab before writing a claim.
