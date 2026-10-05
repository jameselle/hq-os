---
name: publish
description: >
  Publish a finished post (video, image, carousel or text) to one or more of a
  business's channels through each channel's route (Composio, WoopSocial or
  Postiz): dry-run first, get the owner's explicit approval, post, read the post
  back to prove it is live, and log it to HQ and the business's vault. Use when the
  user says "/hq:publish", "post this", "publish to Instagram/TikTok/YouTube",
  "put this reel out", or a department plan's step is to publish.
---

# Publish

> **Hard rule: no em dashes (—) or en dashes (–) in any caption, title or description.** Before a caption
> is shown to the owner or posted, run `printf '%s' "<caption>" | npm run hq -- caption-check -` (or pass a
> file). It exits 1 and names the problem when one is found: rewrite with a comma, colon or full stop and
> check again. Never post a caption that hasn't passed.

Posting is **public and hard to undo**. This skill never posts without the owner's explicit
yes for *this* post, and never calls a post "done" until it has read it back from the platform.

Run commands from `$HQ_ROOT` (default `~/business-os`).

## 1. What, where, how

- **Business:** the one named, or the current one. **Channels:** the ones named, or ask
  (show `npm run hq -- publishing <slug>`).
- For each channel, the route and its exact tool sequence and traps come from `lib/publishing.ts`
  (also printed by `npm run hq -- publishing <slug>`). **Read that channel's traps before you start.**
- If a channel's state isn't `connected` (or `via-postiz` with Postiz up), stop for that channel
  and point at `/hq:connections`.
- **Media:** through the Composio connector, media must be a **public URL** the platform can
  fetch. Proven: a GitHub release asset in a public repo; prove the URL with the platform's dry
  run, not just curl. If the file is local and there's no public host, say so and ask how to host it.
  ⚠️ **Hard rule: nothing public carries any company's data.** A public host keeps a file only until
  its posts are live (step 6 deletes it). Before uploading, look at the video: any screen of HQ, an admin
  page or another internal tool must show the demo business only, never real numbers, customers or ids.
- **Cover:** if `<video>.cover.jpg` sits beside the video (made by `npm run studio -- cover`), use it:
  Instagram Reels take `cover_url` (host it like the video), TikTok via WoopSocial takes `cover`
  (upload it to the media library too). YouTube Shorts can't take one by API. Show it in the ask.
- **Caption:** per platform limits (X weighted 280, LinkedIn ~3,000). Run `/ig-human` on text
  headed for social. Respect the profile's brand voice and the Content department's notes
  (regulated industries!). Label AI-generated video where the platform supports it.

## 2. Dry run (every channel, before asking)

- **Instagram:** `INSTAGRAM_POST_IG_USER_MEDIA` creates a **container only**. It proves Meta can
  fetch the media. Don't publish yet; containers expire in ~24 h.
- **TikTok via WoopSocial:** `WOOP_SOCIAL_UPLOAD_MEDIA`, then `WOOP_SOCIAL_VALIDATE_POST` (must return `is_valid`).
- **YouTube:** check the file's format and size, and prepare the resumable upload (see the traps).
  There's no platform dry run. From a Claude session the Composio workbench's `proxy_execute`
  returns no response headers (no resumable session URI): `YOUTUBE_MULTIPART_UPLOAD_VIDEO` with an
  `upload_local_file` s3key works (proved 2026-10-01: processed, fileSize byte-exact). Read
  `processingDetails` + `fileDetails.fileSize` back a minute later; `YOUTUBE_UPLOAD_VIDEO` loses the media.
- **Others:** validate length and media type locally.

## 3. Ask

Show the owner, per channel: account, caption, media, and whether it's now or scheduled.
Include any dry-run warnings. **Wait for an explicit yes.** "Looks good" for one channel isn't
a yes for the others.

## 4. Post and prove it

Run the route's publish call, then read back:
- **Instagram:** `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH` with the container id, then
  `INSTAGRAM_GET_IG_MEDIA` for the permalink.
- **TikTok:** `WOOP_SOCIAL_PUBLISH_POST_NOW`, then `WOOP_SOCIAL_GET_POST` until `external_post_url`
  exists. **Never** infer which video a post became from time or caption.
- **YouTube:** resumable upload through the Composio proxy, then video details:
  `processingStatus` must be `succeeded`. A vanished video was deleted: report it as FAILED.
- **X:** after a timeout, look the post up before retrying. Retrying blindly double-posts.
- Treat any nested error as a failure, even when the tool says `successful: true`.

## 5. Log it

One entry per channel, whether it succeeded or failed:

```bash
echo '{"platform":"instagram","via":"composio","account":"instagram_abc-def","status":"published",
  "url":"<permalink read back>","postId":"<id>","caption":"…","media":"<url>"}' | npm run hq -- log-post <slug> -
```

`status` is `published`, `scheduled` or `failed`. A `published` entry is refused without a
url or id read back from the platform. It appears on the Content tab and as a note in the vault.

## 6. Take the public copy down

Once every channel that uses a file is `published` with a read-back url or id (or `failed` for good),
delete that file from the public host: for a GitHub release asset,
`gh api -X DELETE repos/<owner>/<repo>/releases/assets/<asset id>` (ids from
`gh api repos/<owner>/<repo>/releases --jq '.[].assets[] | "\(.id) \(.name)"'`), then check the old URL
returns 404. Platforms keep their own copy; the public one is only for fetching. Keep the original on the
Mac (the Studio job folder). For a scheduled cloud task, include this as its last step.

## Scheduling for later

- **The Mac is on:** the owner or a scheduled Claude task runs `/hq:publish` at the time.
- **Unattended:** a cloud scheduled task (`/schedule`) with the Composio connector and
  **public** media URLs. The Mac isn't needed, and this pattern is already proven in production.
- **Postiz channels:** use Postiz's own calendar.

## The brain (before and after)

- **Before:** `npm run hq -- brain read <slug> content`. Follow its decisions and playbooks and use its
  facts (offer, audience, voice, channels); don't relearn its lessons.
- **After:** write what this run taught, with evidence, via `npm run hq -- brain write <slug> -`:
  a **lesson** when a route or platform behaved unexpectedly (a refusal, a quota, a cover it ignored), and keep the **fact** for each channel's handle and route current.
  Lessons stay in the business vault; the CEO proposes the ones worth moving up to the HQ brain.

## Rules

- No post without an explicit yes for that post. No retries that could double-post.
- Never open `.env` files, and never handle keys.
- Report failures verbatim. Never mark a failed or unverified post as published.
