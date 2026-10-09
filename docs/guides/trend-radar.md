# Trend Radar

For the step-by-step research workflow, start with the [Trend Radar playbook](/guides/trend-radar-playbook). This page explains collection, signal rules and limits in detail.

Open **Market & Competitors → Trend Radar**. Choose a business, edit its niches, save, and press **Scan now**. The first scan shows recent posts, shared phrases and hashtags. Use the platform filter to inspect YouTube, Instagram or TikTok separately. Open a topic for original YouTube links and saved view-count observations. Use **Discovered posts** for individual videos and **Signal history** for past classifications.

## Collection

The existing free `yt-dlp` tool discovers up to 24 recent YouTube videos per niche. For Instagram and TikTok, add up to twelve public creator handles per niche under Manage niches. HQ discovers their latest posts and rechecks saved posts every 15 minutes. Instagram reads anonymous public profile and Reel embeds. TikTok uses public profile listings and video hydration data, with an existing yt-dlp metadata reader as fallback when the page is incomplete. No login, cookies, API keys or paid service are needed. Public pages can still be unavailable; coverage is limited to the configured creators. Public video pages provide exact displayed view counters and publication dates without authentication or downloads. Source counters can lag. New-post discovery and repeated observations target every 15 minutes. The page polls saved results every 30 seconds and never waits on external services to render.

`npm run trends -- acme-co` enables and scans a business. `npm run trends -- --all` scans enabled businesses. Data stays outside the framework, under `HQ_DATA/businesses/<slug>/trends/`. Saving niches enables background collection; other businesses are not scanned. Use the HQ service configuration's `com.hq.trends` entry with `intervalSeconds: 900`, then install services through the existing HQ CLI. The computer must be awake and the service loaded. To disable collection for a business, remove its `trends/niches.json`; saved observations remain.

Niches are search-based categories, not a trained semantic classifier. A video can belong to several niches. Instagram and TikTok posts inherit the niche assigned to their creator, so choose relevant creators. Platform-qualified identities and separate trend groups prevent cross-platform counts from being combined. Repeated two-word phrases and hashtags across distinct channel IDs create topic candidates. Inspect the evidence because shared wording can be incidental. This version does not identify audio, visually identical formats or creator-relative outliers. Only video/Reel posts exposing view counters are included; photos, carousels, private posts and hidden counters are excluded. Likes are never substituted for views. Profile embeds may expose only a small recent window.

## Reading the signals

- **Watching:** evidence is insufficient; high lifetime views alone are not virality.
- **Emerging:** at least three creators with positive growth, measurements for at least 70% of the topic's posts, and aggregate growth of 1,000 views/hour.
- **Breaking out:** the emerging criteria plus at least three comparable histories covering 70% of the topic and 1.5× acceleration.
- **Established:** current positive growth and a prior positive observation at least 24 hours ago.
- **Fading:** prior positive evidence and over 40% slowing across comparable measurements (previous rate at least 1,000/hour).
- **Stale:** fewer than 70% of the topic's posts were observed in the last 30 minutes. Missing readings are never treated as a decline.

These are transparent initial heuristics, not validated predictions. View velocity uses real elapsed time; acceleration compares the same posts across consecutive intervals. Counters that decrease are treated as unavailable. Repeated clicks cannot manufacture growth: samples less than 12 minutes apart are ignored. No history exists before the first observation.

## Limits and recovery

At most eight niches and 240 videos (80 per platform) are checked per scan, with bounded concurrency and an eight-minute work deadline. Each source shows its current health and failed reads. Existing posts are checked for 14 days, oldest reading first; observations and topic history remain for 30 days. Search is sampled coverage and may miss trends. At capacity, up to 60 slots are reserved for newly discovered posts and remaining slots go to the oldest readings. Coverage falls if the tracked pool outgrows the cap; stale topics are labelled explicitly. Read coverage and timestamps before acting.

A source failure preserves prior data and is shown under scan health. A lock prevents overlapping scans; locks older than ten minutes can be recovered. An inaccessible or corrupt saved state fails visibly rather than being silently replaced. If discovery fails, check that `yt-dlp` is available on the service PATH and the public source remains accessible. The `Scan now` button retries; successful scans have a one-minute cooldown.

Configure at least three creators per platform in a niche to make Emerging and Breaking out signals possible. With fewer creators, posts and shared-topic candidates still work, but cannot meet the three-creator growth threshold. Removing a creator excludes their saved posts from active results and polling while retaining historical evidence.

## Choose watched accounts

Open **Watch accounts** or the **Watched accounts** tab. Choose a niche and Instagram or TikTok, then paste a handle or the account’s profile link. Add or remove accounts and click **Save watchlist**. The next scheduled scan discovers changed watchlists immediately; **Scan now** runs it on demand. Saving never follows an account on the platform. Existing history is retained when an account is removed, but removed niche memberships no longer appear in results.

**Alcoholic beverages** is a default niche (cocktails, beer, wine and spirits). Existing configurations can add it from **Manage niches → + Alcoholic beverages**. Choose its Instagram and TikTok accounts using the same watchlist controls; no accounts are selected automatically.

## Small-account breakouts

The separate **Small-account breakouts** tab highlights individual Instagram/TikTok videos reaching far beyond the creator’s current following. Defaults: at most 50,000 followers, at least 100,000 views, and at least 10 views per follower. Change any threshold in the tab. Results rank by views per follower and include the original video, follower count, audience timestamp and caption phrases worth investigating. One video can qualify here; shared-topic growth stages still require multiple creators.

Follower counts come from anonymous public profile JSON, refreshed during discovery, and are kept with their timestamp in `state.json` `creators`. A failed profile refresh retains the previous evidence but excludes it from breakout qualification. Missing, zero, invalid, private or more-than-24-hour-old follower counts cannot qualify; view readings must be at most 30 minutes old. Identity and platform must match. The audience may have grown after the video: this is a ratio against followers measured now, not followers at publication, unique audience reach, proof of organic distribution, or proof of a platform-wide trend. Only watched accounts are covered. YouTube is not included in this follower-based section.

Additional niche presets: **Betting influencers**, **Betting / EV & odds screen tools**, and **Odds API companies**. Add them from Manage niches, then choose their Instagram/TikTok accounts in Watch accounts. Up to 12 niches are supported; the existing scan time and per-platform observation limits remain in place.

## Find competitors from a seed account

Open **Find competitors**, paste an Instagram/TikTok profile URL or handle, select its platform and the destination niche, and optionally describe the competitor focus or region. Click **Find competitors**. HQ researches the seed’s offering and audience, finds up to eight potential competitors on that same platform, and saves the results for the selected business. Discovery takes a few minutes and continues if you switch tabs; recent runs are retained. An interrupted run becomes retryable after six minutes.

Review each match’s reason, source link and public-profile check. Select the desired accounts and click **Watch selected** to add them to the niche. Existing accounts are kept and duplicates excluded; twelve accounts per niche/platform is the limit. Then use **Scan now** or wait for scheduled collection. Suggestions do not imply platform-verified ownership; a public follower check confirms the profile was readable, not that the account is an official competitor. Search-only results remain explicitly marked if profile reads fail. Missing results are never filled with invented accounts.

This uses the installed Codex CLI (Apache-2.0) and saved sign-in, subject to the account’s existing web-search access and usage limits. No additional API key is configured. HQ runs it with user configuration excluded, no connected apps or shell, read-only permissions, ephemeral sessions and structured JSON output. Only the public seed and user-entered category/focus are sent for research. Override the binary path with `HQ_CODEX_BIN` if needed. Runtime errors are visible; saved successful results remain available.

Use **Find more accounts** on a saved search to extend it. Previous suggestions and watched handles are excluded. Research checks a broader shortlist and includes international direct competitors and labelled adjacent brands/creators. Scan time and per-platform post caps remain bounded, so large watchlists may need multiple scans.

## Automatic competitor discovery

In **Find competitors**, choose a seed account, platform, niche and focus, then use **Automatic competitor discovery**. The saved-business button fills its account, offering, audience and country into the editable fields. Set daily or weekly frequency and choose suggestions only or automatic watching. Enable once per business/niche/platform; it remains active when the browser is closed. Pause and resume from the same panel. Enabling this shares the displayed public seed and focus with the installed research runtime under its existing allowance.

The existing `npm run trends -- --all` collector checks due schedules. At most one business is researched per tick to bound work; overdue schedules run when the Mac and collector resume. Attempts, errors, next due time and results persist per business. Automatic watching requires a direct-competitor reason, a social link extracted from an official competitor website, a readable profile, and space under the 12-account cap. Adjacent brands, creators and unverified accounts stay reviewable. Pausing during research prevents automatic adoption. Failed research retains previous watchlists and retries at the configured cadence.

Research also returns official competitor websites. HQ reads bounded public HTTPS HTML and extracts actual Instagram/TikTok links, checking public DNS addresses at every redirect. It never guesses handles or logs into a profile. Historical suggestions and watched accounts are excluded from repeated searches.

## Top competitor posts

**Top competitor posts** ranks measured Instagram/TikTok posts from watched accounts by total views, views per current follower, or measured views gained per hour. Filter by niche/platform, account and publication window (7 or 30 days), or show only the best post per account. Each row links to the original post and shows publication and measurement times. Ratios exclude unavailable/stale/zero audiences and stale views; growth needs repeated readings. Most-views rankings retain older readings with a visible freshness label. Views are not unique viewers, engagement or conversions, and cross-platform counters differ.

Public social posts from the last 30 days can enter the sample when a profile exposes them. This does not promise a complete 30-day archive: embeds may expose only a few recent posts. Scans still have an 80-post limit per platform and an eight-minute deadline. The same scheduled collector keeps measurements and rankings current.

Daily account research is the default for new automatic-discovery setups; weekly remains available. Post collection runs before due account research so research does not delay that tick’s view-count refresh. New accounts added by research enter collection on a subsequent tick.

## Personalised feed discoveries

The **Feed discoveries** tab can collect a bounded session from your own Instagram Reels/Explore or TikTok For You feed in Chrome. Download the extension from that tab, unzip it, then use Chrome's `chrome://extensions` → Developer mode → Load unpacked. Select the unzipped directory and keep it in place. The extension source is in `extensions/hq-feed-collector`.

Create a session in HQ for the current business, choose the research niche, 2/5/10 minutes and 10/25/50/100 posts. Open the feed, click the extension, choose the waiting session and press Start. The extension connects automatically; there is no code to copy. Waiting sessions expire after ten minutes. If several businesses have waiting sessions, choose the intended business and niche in the extension. After updating an unpacked extension, reload it once in chrome://extensions. On TikTok the collector opens Cinema mode to read real post permalinks, then uses Next video. Keep the feed tab visible; collection pauses when hidden and stops at either limit, on navigation, after repeated unreadable/stuck cards, or when stopped from HQ, the popup or overlay. This is a user-started browser session, not unattended access to a platform API. Different site layouts, non-English controls, login walls and challenges can interrupt it; no challenge bypass is attempted.

Only rendered post links, creator handles, captions and visible counters go to the local HQ bridge on port 3150. No cookies, passwords, messages or browser history are collected. The extension uses activeTab and scripting for the tab you start on, session storage for a short-lived token and loopback host access. It has no persistent social-site permissions. HQ stores only hashed pairing secrets/tokens, isolated per business in private `trends/feed.json`, capped at 50 sessions and 2,000 posts. Stop is checked on the next heartbeat (normally six seconds).

Feed discoveries are deduplicated and shown separately. The research niche is the selected folder, not an inferred relevance verdict; personalised recommendations do not prove global virality. Visible likes/comments are never treated as views. **Check public views** verifies up to ten due posts; the scheduled collector also checks ten per business every cycle, rotating oldest checks first. Results without readable public counters remain marked unavailable. **Watch this creator** adds a readable handle to that niche's existing watched accounts; normal radar scans then discover and measure their public posts. No follows, likes, comments or posts are performed.

Instagram starts from the **Open Instagram Explore** link in HQ. Explore grid tiles can enter as links only; public checks enrich missing creator handles and captions when readable. In-feed reel navigation stays within a session; full page reloads stop it.
