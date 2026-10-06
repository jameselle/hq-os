# Market & Competitors: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** watches every competitor from public sources and turns what changed into moves
for the other departments.

**It covers:** the competitor list and profiles; their pages, prices and offers (change watching); their content
and ads, and what's working; a weekly brief with actions for Content, SEO, Ads and Sales.

**Owner's time:** about 20 minutes: confirming the competitor list and putting one API token in the Keychain.
After that, reading a weekly brief. **Cost:** free. Every source is public.

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar.
- The business profile has its offer, audience, country and sites filled in: `/hq:competitors setup` researches
  competitors from them.
- `uv` is available for Python command-line tools (`which uv`). HQ installs Python tools with `uv tool install`.

## 1. Tools

Installs go through `/hq:add-tool`: free tools only, from a checksum-verified release, a package index or
source, never `curl | sh`, no Homebrew, no Docker on the Mac. Servers bind to 127.0.0.1 and run as launchd
services.

### changedetection.io

- **What it's for:** watches competitors' pricing, offer and landing pages, and records every change.
  `npm run hq -- competitors changes` reads its history to show the text that changed.
- **Needed or optional:** needed.
- **Licence or plan:** open source, Apache-2.0.
- **Set it up:**
  1. `/hq:add-tool changedetection.io for competitors` installs it as a Python CLI (`uv tool install changedetection.io`),
     so `changedetection.io` is on the PATH in `~/.local/bin`.
  2. Its data lives in `~/.local/var/changedetection`. HQ only adds the service once that folder holds a
     `changedetection.json`, which the first run creates. Run it once by hand to create it:
     `mkdir -p ~/.local/var/changedetection && changedetection.io -h 127.0.0.1 -p 5010 -d ~/.local/var/changedetection`,
     then stop it with Ctrl-C.
  3. `npm run hq -- services add-defaults && npm run hq -- services install`. This adds and starts
     `com.hq.changedetection` on 127.0.0.1:5010.
  4. The owner opens http://localhost:5010, goes to **Settings**, then **API**, and copies the API key. They store
     it in the login Keychain themselves (the command prompts for it, so it never appears on screen or in chat):
     `security add-generic-password -a "$USER" -s hq-changedetection -w`
     HQ's CLI reads it from there and never prints it.
- **How HQ checks it:** port 5010 answering (**running**), or the `changedetection.io` command on the PATH
  (**installed**).

### yt-dlp

- **What it's for:** reads public video lists and stats (YouTube; TikTok through its curl-cffi extra), and
  downloads videos for teardowns and for `/hq:style` measurements.
- **Needed or optional:** needed.
- **Licence or plan:** open source, Unlicense (public domain).
- **Set it up:** `/hq:add-tool yt-dlp for competitors`, which runs
  `uv tool install "yt-dlp[default,curl-cffi]"`. Instagram profiles need a login, so yt-dlp doesn't read them.
- **How HQ checks it:** `yt-dlp` on the PATH (**installed**).

### Meta Ad Library

- **What it's for:** every ad a competitor's Facebook or Instagram page is running.
- **Needed or optional:** one of a group with the Google Ads Transparency Center: one is enough, though the weekly sweep checks both (free, no account needed).
- **Licence or plan:** free (proprietary).
- **Set it up:** nothing to install. The sweep builds links like
  `https://www.facebook.com/ads/library/?q=<name>&country=<CC>`.
- **How HQ checks it:** a free web service, always shown as **web**.

### Google Ads Transparency Center

- **What it's for:** competitors' Google and YouTube ads.
- **Needed or optional:** one of a group with the Meta Ad Library.
- **Licence or plan:** free (proprietary).
- **Set it up:** nothing to install. Search by advertiser at https://adstransparency.google.com.
- **How HQ checks it:** a free web service, always shown as **web**.

### Wayback Machine

- **What it's for:** what a competitor's pages looked like before HQ started watching them.
- **Needed or optional:** needed for history; nothing to set up.
- **Licence or plan:** free service.
- **Set it up:** nothing to install. Look up any page at https://web.archive.org.
- **How HQ checks it:** a free web service, always shown as **web**.

### SerpBear

- **What it's for:** tracks your rankings against competitors' for the same keywords.
- **Needed or optional:** optional. Search Console already reports your own positions; SerpBear adds a daily
  history for a fixed keyword list. It's the same tool as in [SEO & GEO](/guides/seo): install it once.
- **Licence or plan:** open source, MIT.
- **Set it up:** see [SEO & GEO](/guides/seo). `/hq:add-tool SerpBear for seo`, bound to 127.0.0.1 and run as an
  HQ service.
- **How HQ checks it:** shows **installed** once it's in `~/.local/opt/serpbear` (where `/hq:add-tool` puts it);
  `/hq:add-tool` also adds its port so the tab can show it **running**. Until then it shows **missing**, which,
  being optional, never counts against readiness.

## 2. Accounts and connections

None. Everything this department reads is public: competitors' websites, public social profiles, and the public
ad libraries. Never sign in as anyone, never scrape behind a login, and never contact a competitor.

The only secret is changedetection.io's own API token, kept in the login Keychain under the service name
`hq-changedetection` (step 4 above). Each business's watches carry the tag `hq-<slug>`, so businesses never see
each other's.

## 3. Skills to use

- `/hq:competitors setup`: researches 3 to 6 real competitors (direct, substitutes, content rivals) from the
  profile, with 1 to 3 specific public pages each to watch (pricing, offer, main landing page). It shows the owner
  the list and why each is on it, and waits for a yes before adding them to the profile. Then
  `npm run hq -- competitors sync <slug>` creates the watches and a vault note per competitor.
- `/hq:competitors`: the weekly sweep. Page changes, what each competitor posted and what's performing, the ads
  they're running, a dated log entry per competitor, and a brief saved as the department's weekly plan with actions
  for Content, SEO, Ads and Sales.
- `/ig-viral`: what's working in the niche right now (Instagram, read at human pace).
- `/video-teardown`: pull a standout competitor video apart to see how it's built.
- `/sales:competitive-intelligence`: battlecards on how to win against each competitor.
- `/marketing:competitive-brief`: positioning and messaging gaps.
- `/product-management:competitive-brief`: a feature and pricing comparison.

The CLI behind the skill (run from `~/business-os`):

| Command | What it does |
|---|---|
| `npm run hq -- competitors sync <slug>` | creates a watch per page in the profile, and a vault note per competitor |
| `npm run hq -- competitors changes <slug> --days 7` | every watched page, marked CHANGED, ERROR or same, with the changed text |
| `npm run hq -- competitors recheck <slug>` | asks the watcher to re-check every page now |
| `npm run hq -- competitors log <slug> "<Competitor>" -` | appends a dated entry (from stdin) to that competitor's vault note |
| `npm run hq -- competitors tick <slug\|--all> [--force]` | the weekly brief with no owner step (below) |

### The weekly brief, automatic

`npm run hq -- services install` adds **com.hq.competitors**, which runs `competitors tick --all` every Monday at
07:00. For each business with competitors and no brief yet this week (Monday to Sunday, in the business's timezone) it syncs the watches, rechecks every
page, reads the week's changes and the rivals' recent YouTube and TikTok uploads, then runs Claude Code headless
with this skill. The writer may only read, search and fetch the web, and write in that week's folder
(`plans/competitors/research/<date>/`): no shell, no MCP servers, no settings files, nothing it would have to ask
about. HQ checks the brief (a headline, a source link on every fact, no paid-ads advice, no inducement copy, no
email addresses, dashes fixed), saves it as the department's plan and in the vault's `Competitors/Briefs/`, files
each department hand-off as a brain signal, appends the competitor log entries and marks the "pages changed"
finding read. With nothing new it writes a short no-change brief. Every run goes in
`plans/competitors/runs.jsonl`; a failed one shows on the CEO tab as **"The weekly competitor brief failed"**.

## 4. Check it's working

- The department tab shows changedetection.io as **running** and yt-dlp as **installed**. Or from the terminal:
  `curl -s http://127.0.0.1:3150/api/status | jq '.departments[] | select(.slug=="competitors") | .tools[] | {name, state}'`.
- `npm run hq -- services status` shows `com.hq.changedetection` with port 5010 answering.
- `npm run hq -- competitors changes <slug>` prints `<Business>: N page(s) watched, ...` with one line per page.
  It fails with "no changedetection.io token in the Keychain" if step 4 was skipped.
- `yt-dlp --flat-playlist -I 1:3 --print "%(title)s" "https://www.youtube.com/@<a competitor's channel>/videos"`
  prints three titles.
- The CEO tab shows no unresolved Market & Competitors findings. The ones you may see, and how each clears:
  - **"List Acme Co's competitors"**: run `/hq:competitors setup` and confirm the list.
  - **"The competitor watcher isn't running"**: `npm run hq -- services start`, then `services status`.
  - **"N competitor page(s) aren't being watched yet"**: `npm run hq -- competitors sync <slug>`.
  - **"N competitor page(s) changed this week"**: read them in `/hq:competitors`. It stays up while a change is
    under 7 days old, by design.
  - **"N competitor page(s) can't be fetched"**: the site blocks automated visitors. Swap in another public page
    in the profile's `watch` list and sync again, or check it by hand in the sweep.
  - **"No competitor brief this week"**: run `/hq:competitors`; saving the brief clears it.
  - **"The weekly competitor brief failed"**: the detail says why (also in `plans/competitors/runs.jsonl`). Fix it,
    then `npm run hq -- competitors tick <slug> --force`. The next brief clears it.

## Done when

- [ ] The profile lists 3 to 6 competitors the owner confirmed, each with a site, public channels and watched pages.
- [ ] `com.hq.changedetection` is running on 127.0.0.1:5010, and its token is in the Keychain as `hq-changedetection`.
- [ ] `npm run hq -- competitors sync <slug>` reports every page watched, and each competitor has a vault note.
- [ ] `yt-dlp` is installed with its curl-cffi extra.
- [ ] The first `/hq:competitors` sweep has saved a brief as this week's plan.
- [ ] `npm run hq -- services status` lists `com.hq.competitors` (weekly, Monday 07:00).
- [ ] The CEO tab has no open findings for this department except a "changed this week" you've read.

## Good to know

- **Public sources only.** No logins, no scraping behind a login, no contacting competitors, no bulk scraping.
- Instagram coverage is manual: reading other accounts needs a login, which is off-limits. The brief says so.
- If a TikTok listing fails with "Unable to extract secondary user ID", the sweep can add that competitor's
  `tiktok_id` to the profile. It's the only profile edit a sweep may make.
- Learn the pattern, never copy a competitor's content or claims. Stick to facts with a link each, and label a
  guess as a guess.
- Regulated industries: never recommend matching a claim the business isn't allowed to make.
- Don't mark "changed this week" as done with `npm run hq -- done`: a finding marked done stays hidden, so later
  changes would no longer show.
- Video downloads for study go in the business's research folder and are deleted once the teardown is written.
