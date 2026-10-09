# Weekly social plan: every network, every week

> **If you are an AI walking an owner through this:** write the channel plan first (it's the authority), set
> the plan up in week-one mode, and decide per network who posts: HQ, the owner by hand, or another tool. Never
> post anything yourself without the owner's yes; approved posts on HQ networks go out by themselves on their day
> (see "Automatic posting" below).

Each week HQ drafts every network's posts from the business's **channel plan** and from what actually happened
(new blog posts, tools, pages), renders the card images in the brand colours, checks every post, and puts them
on the Content & Social tab for the owner. Approved posts go out through HQ or by the owner's hand.

## 1. Write the channel plan

A note in the business's vault: `Departments/Content & Social/Channel plan.md`. For each network: why it's in,
3 or 4 content themes, formats, how often, the call to action, which asset feeds it, and the number that judges
it. Then a week template (day by day) and the never-post rules. Base it on what comparable accounts actually
post: `/hq:competitors` and the content skills help.

## 2. Set it up

```bash
npm run hq -- social setup <slug> --networks instagram:hq,pinterest:hq,x:hand,tiktok:hand [--weekday 1 --hour 7]
```

- `hq`: HQ posts it by itself on its day once approved (see "Automatic posting"; the account must be connected
  and pinned, see `/hq:connections`).
- `hand`: HQ drafts it with the copy and images ready; you post it and paste the link ("I posted it").
- `elsewhere`: another tool posts there; HQ leaves it out of the plan.

It writes `$HQ_DATA/businesses/<slug>/social/social.json`, in Auto with week one: every post waits for you for
7 days. Add `banned` (names a post must never contain) if the business needs it; the blog's list applies too.

**Campaigns:** the writer reads the business's live campaigns. A post that serves one carries its id (`campaign`)
and its own-site link ends with the campaign's tag (`?utm_source=instagram&utm_medium=social&utm_campaign=cold-brew`);
the checks make sure it does. See [Campaigns](/guides/campaigns).

## 3. Each week

- **com.hq.social** (hourly) writes the week's drafts on the planning day with the `/hq:social` skill, then checks
  them and renders their cards. By hand: `npm run hq -- social write <slug>`.
- **Your own Instagram skills:** if `~/.claude/skills/ig-repurpose`, `ig-carousel` or `ig-human` are installed, the
  writer adds them as craft guidance: each blog post mined for several standalone posts, carousels built as cover,
  stake, one idea per slide, recap and one ask, and captions written to ig-human's rules. HQ's format, checks and
  channel plan still win, and the social log's `writing` line names the skills it used. Without them nothing changes.
- **The checks:** caption length per network, hashtag count, no em or en dashes, slide counts, a video or a brief
  for video formats, links only to the business's own site, no banned claims, inducements or never-name entries,
  18+ on every post for gambling businesses (except LinkedIn), and a comment keyword ("Comment BREW", or a
  `keyword` field) only on a network where a comment-to-DM tool answers it.
- **Comment keywords need a tool that answers them.** A post that says "Comment BREW and we'll DM you" with nothing
  listening leaves people waiting, so the writer only asks for a keyword where `social.json` says a tool answers:

  ```json
  "keywordDms": { "tool": "comment-dm", "networks": ["instagram"] }
  ```

  `networks` is Instagram when left out. Instagram comment replies with `skipKeywords` (section 5) count too, since
  those words already belong to a bot. Without either, the writer uses "link in bio", the `keyword` check fails any
  draft that asks anyway, and the analytics board shows the comment-keyword numbers as not applicable.
- **Approve** on the Content & Social tab. Leave notes: next week's drafts read them.
- **Post:** HQ networks go out by themselves on their day; hand networks: copy the caption, save the images,
  post, then "I posted it" with the link.

## 4. Automatic posting

Once a post on an `hq` network is approved (or, in Auto after week one, has passed its checks), **com.hq.social**
puts it out on its day from `postHour` (local time, 9 when unset), reads it back from the platform and records the
live link on the post. No Claude session is needed; the Mac only has to be awake.

**What HQ posts by itself:** Instagram carousels (2 to 10 cards), single images and stories, Instagram reels that
have a recorded video (`video.path`), and Pinterest pins. Everything else on an `hq` network (a reel still waiting
to be recorded, a format HQ doesn't post) shows as a hand post with the reason.

**Carousels with music (optional).** Instagram's API can't put music on a carousel: Meta's Audio API attaches sound to
Reels only, and the Composio tool can't send it. To have a business's carousels heard, set them to go out as a
slideshow Reel instead:

```json
"slideshow": { "networks": ["instagram"], "music": "music" }
```

and put royalty-free tracks in `social/music/` with a `tracks.json` listing each one's `file`, `title`, `artist`,
`licence`, `source` and `start` (the second its full beat comes in, so a quiet intro never opens the post). Every
licence must allow commercial use on social media with no credit needed (Mixkit's Stock Music Free License does;
Mixkit's Restricted licence doesn't). HQ never fetches music by itself.

When the drafts are checked, HQ renders each carousel's slides as 9:16 frames (no swipe cues, text clear of
Instagram's caption and buttons), holds each long enough to read (2.5 to 5.5 s), cross-fades them over a track
(the same post keeps its track; the last few slideshows' tracks are passed over), levels it to -14 LUFS and keeps it
next to the cards (`<id>-reel.mp4`). Content & Social plays it with the track's name. On its day it goes out as a
Reel shared to the feed. A slideshow carousel whose video isn't made is held with the reason: it never goes out as a
silent carousel.

**Set it up (Demo Coffee as the example):**

1. Connect the accounts in the Composio connector (`/hq:connections`), then pin each one in the business profile,
   so HQ never posts through whichever account Composio picks by default:

   ```json
   "channels": {
     "instagram": { "handle": "@democoffee", "via": "composio", "account": "<instagram connection id>" },
     "pinterest": { "handle": "democoffee", "via": "composio", "account": "<pinterest connection id>" }
   }
   ```

   The connection ids are the ones `/hq:connections` lists. HQ also checks the Instagram username is the handle
   before it makes anything, and stops if it isn't.
2. For Pinterest, pick the default board (its id from Composio's list of boards) in `social.json`:
   `"pinterest": { "posting": "hq", "board": "<board id>" }`. A pin can name its own `"board"`.
3. Optional: `"postHour": 11` in `social.json` to post later in the day.
4. See what would go out, without any call leaving the Mac:

   ```bash
   npm run hq -- social publish demo-coffee --dry-run
   ```

5. Prove one Instagram post end to end without publishing it: `--container` makes the post's container on the
   account and stops (Instagram drops unpublished containers after about a day):

   ```bash
   npm run hq -- social publish demo-coffee --id 2026-10-14-instagram-1 --container
   ```

6. Make sure com.hq.social is installed: `npm run hq -- services install` (it runs hourly at :40).

**How it works:** HQ converts the cards to JPEG, asks the Composio workbench for upload slots in Composio's own
file store, uploads the files from the Mac and checks each one downloads byte for byte. Then a short Claude Code
run (headless, allowed only the workbench tool) passes HQ's own code to the workbench, which looks for the post on
the account, makes it, publishes it and reads the link back. Every piece of that code checks a fingerprint of the
post, so a copy that isn't exact refuses to run. Nothing goes on a website or a public file host.

**Never twice:** HQ writes each attempt on the post before calling the platform, and every attempt starts by
looking for the post on the account (the same caption on Instagram, the same title on the pin's board, since a few
days before its day). If it's there, because an earlier run got cut off or you posted it by hand, HQ records that
link instead of posting again.

**Only approved posts, checked again at the moment of posting:** a post goes out only with status `approved`. In
Auto after week one, a post that passes its checks is approved by auto mode first, and the log says so
(`"by": "auto"`). Right before any call HQ runs every check again on the text as it is then (no em or en dashes,
the regulated and never-name rules, the caption-check), and refuses an account another business has also pinned.
A post that fails any of that is held with the reason and uses up no attempt.

**When it fails:** HQ tries again at the next hourly runs, up to 3 times (`"maxAttempts": 2` in `social.json` stops
sooner; 1 to 5). After that the post shows as failed on the Content & Social tab with the reason, and as a CEO
finding; it is never retried on its own. Approve it again to retry, or post it by hand and add the link. A post
more than 2 days past its day is left for you. `npm run hq -- social publish demo-coffee` runs it by hand.

**One run at a time:** the hourly tick, a hand-run `social publish` and `social insights` share `social/run.lock`,
created so that two runs starting together can't both hold it. A lock nobody touched for 45 minutes belonged to a
run that died and is cleared.

**The account's numbers:** once a day the tick also reads the pinned Instagram account (read-only tools, after the
same username check): followers, new followers per day, views, reach and website-link taps over the last four
7-day windows, and each post's views from the last 28 days. They're kept in `social/insights.json` (numbers and
post ids only, no captions) with a followers line per read in `social/insights-history.jsonl`, for the business's
analytics adapter to report followers, follows per post, views per post and link clicks. By hand:

```bash
npm run hq -- social insights demo-coffee --dry-run   # what it would read, no call
npm run hq -- social insights demo-coffee
```

## 5. Comment replies (optional, owner approves each one)

Once a business opts in, the hourly tick reads new comments on its Instagram account's 10 most recent posts,
has Claude Code (headless, allowed only to write one file in this run's folder) sort them the way the ig-reply
skill does (keyword, lead, substance, question, support, noise) and draft a reply to the ones worth answering, and
puts the drafts under **Comment replies** on the Content & Social tab. Questions worth a reel of their own show as
reel ideas. **Nothing posts until you approve it.** Approve (edit the wording first if you like) or reject each one;
approved replies go up as public replies at the next hourly run.

**Opt in (Demo Coffee as the example):** add a `replies` block to `social.json`:

```json
"replies": {
  "instagram": { "keychain": "<Keychain account holding the token>", "skipKeywords": ["BREW"] }
}
```

- `keychain`: the login Keychain account that holds an Instagram API token (Instagram Login) for the business's
  account. The service is `comment-dm` unless you set `"service"`, so the comment-to-DM bot's token serves both. HQ
  reads it at run time with `security find-generic-password` and never logs or stores it.
- `skipKeywords`: the words your comment-to-DM bot answers. Comments containing one are left to the bot.
- `days` (optional, 1 to 30, 7 when unset): older comments are left alone.

Replies run whatever the weekly plan's `mode` is. An account whose posts come from somewhere else (for example a
founder series made with `/hq:self-post`) can keep `"mode": "off"` and list its networks as `"elsewhere"`: HQ then
writes no week and posts nothing, and only the reply queue runs. Remove the `replies` block to stop it.

HQ never queues the account's own comments, comments the account already answered, or a comment twice. The queue
is `social/replies/queue.json`. When your own `ig-reply` and `ig-human` skills are installed (`~/.claude/skills/`),
the drafter uses them as craft guidance under HQ's rules; without them it uses HQ's own triage.

**Never twice:** before each reply HQ looks under the comment for one from the account (an earlier run, or you by
hand) and records it instead of posting. It writes each attempt to the queue and reads it back before the call,
and stops after `maxAttempts` (3 when unset), showing the reason on the tab.

**By hand:**

```bash
npm run hq -- social replies demo-coffee --fetch --dry-run    # what would be queued (reads only, writes nothing)
npm run hq -- social replies demo-coffee --fetch               # queue new comments
npm run hq -- social replies demo-coffee --draft               # triage and draft them
npm run hq -- social replies demo-coffee                       # list the queue
npm run hq -- social replies demo-coffee --approve <comment id> [--text "your wording"]
npm run hq -- social replies demo-coffee --reject <comment id>
npm run hq -- social replies demo-coffee --post --dry-run     # what would post, no call made
```

## 6. Check it's working

- The Content & Social tab shows the week's posts with cards, captions and checks.
- `npm run hq -- social show <slug>` lists them with where each one is.
- Once a post is marked posted, the Workflows tab marks **Weekly social plan from the channel plan** live, and
  the Data tab counts it in **Social posts published**.

## Done when

- [ ] The channel plan is in the vault.
- [ ] `social.json` lists each network and who posts it.
- [ ] The first week's drafts appeared with their cards, and you approved or rejected each.
- [ ] One post went out and has its link recorded.
- [ ] For automatic posting: the accounts are pinned in the profile, `social publish <slug> --dry-run` names them,
  and the first HQ post shows "Posted by HQ" with its link.
- [ ] For comment replies: `social replies <slug> --fetch --dry-run` lists real comments, and the first approved
  reply shows as posted.

## Good to know

- Posts use public facts only. Nothing internal to a business goes in a post.
- Rendered cards live in `social/media/<week>/`; they're private until a post goes out.
- Cards are laid out by each slide's `kind` (cover, point, stat, list, compare, cta) in the brand kit's colours, with
  the network handle and a progress bar. Fonts are free Google Fonts, set per business in `social.json`:
  `"fonts": { "heading": "Fredoka", "body": "Inter" }` (Inter when unset; the system font when offline). Slides
  carry no disclaimers: a regulated business's required line goes in the caption, where the checks look for it.
