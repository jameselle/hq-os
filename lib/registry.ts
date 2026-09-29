// The company, one department per tab, shared by every business. Rule for every entry:
// the tool is FREE for what we use it for. Open source first (licences checked
// against GitHub), free proprietary where it's the better tool, labelled as
// such. Plus Claude skills installed on this Mac. Nothing that needs a paid plan. Whether each tool
// and skill is actually present is checked live in lib/status.ts, so this file
// says what a department SHOULD have, and the page shows what it DOES have.

import type { Department, Licence } from "./types";

const oss = (spdx: string): Licence => ({ spdx, kind: "oss" });
const core = (spdx: string): Licence => ({ spdx, kind: "open-core" });
const free = (spdx: string): Licence => ({ spdx, kind: "free" });
const own = (what: string): Licence => ({ spdx: what, kind: "own" });

export const DEPARTMENTS: Department[] = [
  {
    slug: "operations",
    label: "Operations",
    glyph: "◈",
    role: "Chief of staff / Ops lead",
    mission: "Turns plans into weekly work, keeps processes written down, and runs the review rhythm.",
    covers: ["Planning and priorities", "Runbooks and process docs", "Weekly status and reviews", "Vendor and risk checks"],
    tools: [
      {
        name: "Obsidian",
        what: "The company brain: decisions, SOPs, session notes and CEO reviews as plain Markdown files.",
        repo: "https://obsidian.md",
        licence: free("Proprietary"),
        check: { apps: ["Obsidian"] },
        freeNote: "Low lock-in: the vault is plain Markdown folders any editor, git or restic can read. Sync is paid; git is free.",
      },
      { name: "Plane", what: "Projects, issues, cycles and roadmaps (Jira/Linear alternative).", repo: "makeplane/plane", licence: oss("AGPL-3.0"), check: {} },
      { name: "AppFlowy", what: "Docs, wikis and task boards (Notion alternative), desktop app.", repo: "AppFlowy-IO/AppFlowy", licence: oss("AGPL-3.0"), check: { apps: ["AppFlowy"] } },
      { name: "Docmost", what: "Team wiki and documentation (Confluence alternative).", repo: "docmost/docmost", licence: oss("AGPL-3.0"), check: {} },
      { name: "Vikunja", what: "Lightweight to-do lists and kanban.", repo: "go-vikunja/vikunja", licence: oss("AGPL-3.0"), check: {} },
      { name: "Composio", what: "Connects Claude to 500+ apps (Gmail, Sheets, Notion, socials…) for cross-app automations.", repo: "ComposioHQ/composio", licence: free("Hobby plan"), check: { web: true, composio: "instagram" }, freeNote: "Free Hobby plan: 100,000 tool calls a month." },
      { name: "n8n", what: "Workflow automation with hundreds of integrations, self-hosted.", repo: "n8n-io/n8n", licence: free("Sustainable Use"), check: { npx: true }, freeNote: "Free to self-host for your own business; can't be resold as a service." },
      { name: "Activepieces", what: "No-code automations between apps (Zapier alternative).", repo: "activepieces/activepieces", licence: core("MIT"), check: {} },
    ],
    skills: [
      { id: "hq:ceo", what: "CEO review: decisions, the week, delegations" },
      { id: "hq:dept", what: "One department's plan for the week" },
      { id: "hq:new-business", what: "Connect a business to HQ" },
      { id: "hq:add-tool", what: "Add a free tool to a department, properly" },
      { id: "operations:status-report", what: "Weekly status report from what happened" },
      { id: "operations:runbook", what: "Write a step-by-step runbook" },
      { id: "operations:process-doc", what: "Document a process" },
      { id: "operations:process-optimization", what: "Find waste in a process" },
      { id: "operations:risk-assessment", what: "Rate risks and mitigations" },
      { id: "operations:vendor-review", what: "Assess a vendor" },
      { id: "productivity:task-management", what: "Keep the task list honest" },
      { id: "small-business:monday-brief", what: "Start-of-week brief" },
      { id: "small-business:business-pulse", what: "Health check across the business" },
      { id: "session-wrap-up", what: "Commit work and write the session up" },
    ],
  },
  {
    slug: "content",
    label: "Content & Social",
    glyph: "▶",
    role: "Content & social media marketer",
    mission: "Makes the videos and posts, schedules them everywhere, and learns what worked.",
    covers: ["Short-form video (reels, TikTok, Shorts)", "Captions, carousels, stories", "Scheduling and posting", "Post-mortems on what performed"],
    tools: [
      {
        name: "Composio",
        what: "HQ's publishing layer: posts to Instagram, YouTube, Pinterest, Facebook, LinkedIn and X through already-approved apps, no developer apps of your own.",
        repo: "ComposioHQ/composio",
        licence: free("Hobby plan"),
        check: { web: true, composio: "instagram" },
        url: "https://platform.composio.dev",
        freeNote: "Free Hobby plan: 100,000 tool calls a month, unlimited connected accounts. The SDK is MIT. Accounts are connected with /hq:connections.",
      },
      {
        name: "WoopSocial",
        what: "TikTok publishing: an audited TikTok partner, so posts can be public. Reached through Composio's woop_social toolkit.",
        repo: "https://www.woopsocial.com",
        licence: free("Free plan"),
        check: { web: true, composio: "woop_social" },
        freeNote: "Free plan: 2 social accounts, unlimited posts (X uses credits), API access. Not connected yet, by choice.",
      },
      { name: "Postiz", what: "Scheduling calendar, and the route for Discord, Telegram, Reddit, Bluesky and Mastodon (bot tokens, no platform review).", repo: "gitroomhq/postiz-app", licence: oss("AGPL-3.0"), check: { port: 4200, paths: ["~/postiz-app"] }, url: "http://localhost:4200", warn: "Instagram needs your own Meta app (INSTAGRAM_APP_ID) before it can connect." },
      { name: "HyperFrames", what: "Writes video as HTML and renders MP4s; Claude drives it.", repo: "heygen-com/hyperframes", licence: oss("Apache-2.0"), check: { paths: ["~/.claude/plugins/cache/hyperframes", "~/hyperframes"] } },
      { name: "FFmpeg", what: "Cuts, converts and encodes any video or audio.", repo: "FFmpeg/FFmpeg", licence: oss("LGPL-2.1-or-later"), check: { bins: ["ffmpeg"] } },
      { name: "whisper.cpp", what: "Local transcription for captions.", repo: "ggml-org/whisper.cpp", licence: oss("MIT"), check: { paths: ["~/.cache/hyperframes/whisper/whisper.cpp/build/bin/whisper-cli"] } },
      { name: "Kokoro TTS", what: "Local voiceover (text to speech).", repo: "thewh1teagle/kokoro-onnx", licence: oss("MIT"), check: { paths: ["~/.local/venvs/hyperframes/lib/python3.12/site-packages/kokoro_onnx"] } },
      { name: "MusicGen", what: "Local background music from a text prompt.", repo: "facebookresearch/audiocraft", licence: oss("MIT"), check: { paths: ["~/.local/venvs/hyperframes/lib/python3.12/site-packages/transformers"] }, warn: "Code is MIT but the model weights are CC BY-NC 4.0: not for videos you make money from." },
      { name: "ManyChat", what: "Comment-to-DM and keyword auto-replies that turn post engagement into leads.", repo: "https://manychat.com", licence: free("Free plan"), check: { web: true }, url: "https://app.manychat.com", freeNote: "Free plan: 25 active contacts a month, 3 keyword triggers. Listed in full under Support & Community." },
      {
        name: "HQ Studio",
        what: "Fully automatic clipping and editing: transcribe, pick moments, cut pauses, reframe, caption, hook, music, level, QA. Driven by /hq:clip and /hq:edit.",
        repo: "jameselle/hq-os",
        licence: own("HQ"),
        check: { paths: ["~/.cache/hyperframes/whisper/models/ggml-small.en.bin"], bins: [] },
        freeNote: "Built on FFmpeg + whisper.cpp (+ HyperFrames for motion graphics). No hand editing: the owner only approves publishing.",
      },
      { name: "DaVinci Resolve", what: "Pro-grade editing, colour and audio (free edition).", repo: "https://www.blackmagicdesign.com/products/davinciresolve", licence: free("Proprietary"), check: { apps: ["DaVinci Resolve"] }, freeNote: "Free edition covers social video; Studio is paid." },
      { name: "Meta Business Suite", what: "Native scheduling and inbox for Instagram and Facebook.", repo: "https://business.facebook.com", licence: free("Proprietary"), check: { web: true } },
      { name: "OBS Studio", what: "Screen and camera recording.", repo: "obsproject/obs-studio", licence: oss("GPL-2.0"), check: { apps: ["OBS"] } },
      { name: "Kdenlive", what: "Full timeline video editor.", repo: "KDE/kdenlive", licence: oss("GPL-3.0"), check: { apps: ["kdenlive", "Kdenlive"] } },
      { name: "OpenCut", what: "CapCut-style editor, being rewritten with an MCP server and headless mode for agents (not shipped yet).", repo: "OpenCut-app/OpenCut", licence: oss("MIT"), check: {}, warn: "Watch the rewrite (issue #811): when headless/MCP ships it can become another HQ Studio renderer." },
    ],
    skills: [
      { id: "hyperframes:hyperframes", what: "Make any video: routes to the right workflow" },
      { id: "hyperframes:product-launch-video", what: "Promo video from a website" },
      { id: "hyperframes:embedded-captions", what: "Captions on a talking-head video" },
      { id: "hyperframes:music-to-video", what: "Beat-synced reel from a track" },
      { id: "hq:clip", what: "Long video → short captioned clips, automatically, QA'd" },
      { id: "hq:edit", what: "Raw footage + brief → finished video, automatically, QA'd" },
      { id: "hq:publish", what: "Post to any channel by its route, with approval and read-back" },
      { id: "hq:connections", what: "See and connect the accounts HQ can post to" },
      { id: "postiz:postiz", what: "Schedule and post through Postiz" },
      { id: "ig-plan", what: "Plan the week on Instagram" },
      { id: "ig-reel", what: "Hook, script and beat sheet for a reel" },
      { id: "ig-caption", what: "Caption, hashtags and the first line" },
      { id: "ig-carousel", what: "Carousel copy and slide files" },
      { id: "ig-story", what: "Story sequence and stickers" },
      { id: "ig-repurpose", what: "Turn one long asset into a week of posts" },
      { id: "ig-viral", what: "Find what's working in the niche" },
      { id: "ig-audit", what: "What worked, what to stop" },
      { id: "ig-human", what: "Strip the AI tells from a draft" },
      { id: "video-teardown", what: "Study a competitor's video" },
      { id: "marketing:content-creation", what: "Channel-ready marketing content" },
    ],
  },
  {
    slug: "seo",
    label: "SEO & GEO",
    glyph: "⌖",
    role: "SEO / GEO specialist",
    mission: "Gets the sites found in Google and cited by AI answer engines (ChatGPT, Perplexity, Google AI).",
    covers: ["Technical and on-page SEO", "Keywords and content briefs", "Search Console and indexing", "AI visibility (GEO)", "Regression tracking"],
    tools: [
      { name: "Lighthouse", what: "Performance, SEO and accessibility scores per page.", repo: "GoogleChrome/lighthouse", licence: oss("Apache-2.0"), check: { npx: true } },
      { name: "Unlighthouse", what: "Lighthouse across a whole site in one run.", repo: "harlan-zw/unlighthouse", licence: oss("MIT"), check: { npx: true } },
      { name: "Google Search Console", what: "Real queries, clicks, positions and indexing from Google; connected through Composio.", repo: "https://search.google.com/search-console", licence: free("Proprietary"), check: { web: true, composio: "google_search_console" } },
      { name: "Bing Webmaster Tools", what: "Bing indexing and IndexNow; ChatGPT search leans on Bing, so it matters for GEO.", repo: "https://www.bing.com/webmasters", licence: free("Proprietary"), check: { web: true } },
      { name: "SerpBear", what: "Self-hosted keyword rank tracker.", repo: "towfiqi/serpbear", licence: oss("MIT"), check: {} },
    ],
    skills: [
      { id: "seo-analysis", what: "Full audit from Search Console data" },
      { id: "seo-drift", what: "Baseline and catch SEO regressions" },
      { id: "programmatic-seo", what: "League/market pages at scale, safely" },
      { id: "searchfit-seo:seo-audit", what: "Site-wide SEO audit" },
      { id: "searchfit-seo:technical-seo", what: "Crawl, index and speed issues" },
      { id: "searchfit-seo:on-page-seo", what: "Titles, headings, content" },
      { id: "searchfit-seo:keyword-clustering", what: "Group keywords into pages" },
      { id: "searchfit-seo:content-brief", what: "Brief for a new page" },
      { id: "searchfit-seo:schema-markup", what: "Structured data" },
      { id: "searchfit-seo:internal-linking", what: "Link structure" },
      { id: "searchfit-seo:ai-visibility", what: "Show up in AI answers (GEO)" },
      { id: "small-business:seo-ai-visibility", what: "GEO check for a small business" },
    ],
    notes: ["Live Search Console data needs Google's gcloud CLI and your Google sign-in."],
  },
  {
    slug: "ads",
    label: "Paid Ads & Growth",
    glyph: "↗",
    role: "Performance marketer",
    mission: "Plans paid campaigns, runs experiments, and reports what each dollar returned.",
    covers: ["Campaign plans and budgets", "Ad copy and creative briefs", "A/B tests and landing pages", "Performance reporting"],
    tools: [
      { name: "Meta Ad Library", what: "Every ad any page is running, for competitor research.", repo: "https://www.facebook.com/ads/library", licence: free("Proprietary"), check: { web: true } },
      { name: "Google Ads Transparency Center", what: "Competitors' Google ads.", repo: "https://adstransparency.google.com", licence: free("Proprietary"), check: { web: true } },
      { name: "GrowthBook", what: "Feature flags and A/B experiments.", repo: "growthbook/growthbook", licence: core("MIT"), check: {} },
      { name: "claude-ads", what: "Audit-and-plan skill pack for 12 ad platforms (researched, not installed).", repo: "AgriciDaniel/claude-ads", licence: oss("MIT"), check: { paths: ["~/.claude/skills/ads"] }, warn: "Installs 25 agents globally and pins some to Sonnet. Doesn't handle regulated-industry ad approval." },
    ],
    skills: [
      { id: "small-business:ad-manager", what: "Run and review ad campaigns" },
      { id: "marketing:campaign-plan", what: "Campaign plan and budget" },
      { id: "marketing:performance-report", what: "What the spend returned" },
      { id: "marketing:competitive-brief", what: "What competitors are running" },
      { id: "small-business:growth-pulse", what: "Growth check-in" },
      { id: "small-business:marketing-monday", what: "Weekly marketing plan" },
    ],
  },
  {
    slug: "competitors",
    label: "Market & Competitors",
    glyph: "◭",
    role: "Market & competitive-intelligence analyst",
    mission: "Watches every competitor from public sources and turns what changed into moves for the other departments.",
    covers: ["Competitor list and profiles", "Their pages, prices and offers (change watching)", "Their content and ads: what's working", "A weekly brief with actions for Content, SEO, Ads and Sales"],
    tools: [
      { name: "changedetection.io", what: "Watches competitors' pricing, offer and landing pages and records every change.", repo: "dgtlmoon/changedetection.io", licence: oss("Apache-2.0"), check: { port: 5010, bins: ["changedetection.io"] }, url: "http://localhost:5010" },
      { name: "yt-dlp", what: "Reads public video lists and stats (YouTube; TikTok via its curl-cffi extra) and downloads videos for teardowns.", repo: "yt-dlp/yt-dlp", licence: oss("Unlicense"), check: { bins: ["yt-dlp"] }, warn: "Instagram profiles need a login, so they aren't read. Install with: uv tool install \"yt-dlp[default,curl-cffi]\"." },
      { name: "Meta Ad Library", what: "Every ad a competitor's Facebook/Instagram page is running.", repo: "https://www.facebook.com/ads/library", licence: free("Proprietary"), check: { web: true } },
      { name: "Google Ads Transparency Center", what: "Competitors' Google and YouTube ads.", repo: "https://adstransparency.google.com", licence: free("Proprietary"), check: { web: true } },
      { name: "Wayback Machine", what: "What a competitor's pages looked like before (history before we started watching).", repo: "https://web.archive.org", licence: free("Free service"), check: { web: true } },
      { name: "SerpBear", what: "Track your rankings against competitors' for the same keywords.", repo: "towfiqi/serpbear", licence: oss("MIT"), check: {} },
    ],
    skills: [
      { id: "hq:competitors", what: "Weekly sweep: changes, content, ads → brief + actions" },
      { id: "ig-viral", what: "What's working in the niche right now" },
      { id: "video-teardown", what: "Pull a competitor's video apart" },
      { id: "sales:competitive-intelligence", what: "Battlecards: how to win against each" },
      { id: "marketing:competitive-brief", what: "Positioning and messaging gaps" },
      { id: "product-management:competitive-brief", what: "Feature and pricing comparison" },
    ],
  },
  {
    slug: "email",
    label: "Email & Lifecycle",
    glyph: "✉",
    role: "Email / lifecycle marketer",
    mission: "Owns the newsletter, onboarding and win-back emails, and the lists behind them.",
    covers: ["Newsletters", "Onboarding and nurture sequences", "Win-back and re-activation", "List hygiene"],
    tools: [
      { name: "Listmonk", what: "Newsletters and mailing lists, one binary (Mailchimp alternative).", repo: "knadh/listmonk", licence: oss("AGPL-3.0"), check: { port: 9000, paths: ["~/.local/opt/listmonk/listmonk"] }, url: "http://localhost:9000", warn: "Sending needs an SMTP account (a free tier such as Resend's), and public sign-up forms need Listmonk hosted online." },
      { name: "Mautic", what: "Marketing automation: journeys, segments, scoring.", repo: "mautic/mautic", licence: oss("GPL-3.0"), check: {} },
    ],
    skills: [
      { id: "marketing:email-sequence", what: "Write an email sequence" },
      { id: "small-business:reactivate", what: "Win back lapsed customers" },
      { id: "small-business:inbox-manager", what: "Triage the inbox" },
      { id: "small-business:crm-autopilot", what: "Keep contacts and follow-ups moving" },
    ],
  },
  {
    slug: "design",
    label: "Design & Brand",
    glyph: "◐",
    role: "Designer / brand lead",
    mission: "Keeps the brand consistent and makes the graphics, UI and thumbnails.",
    covers: ["Brand kit and style", "UI and product design", "Graphics and thumbnails", "Accessibility"],
    tools: [
      { name: "Figma (Starter)", what: "Design and prototyping, free plan.", repo: "https://www.figma.com", licence: free("Proprietary"), check: { apps: ["Figma"], web: true }, freeNote: "Starter plan limits projects and pages." },
      { name: "Canva (Free)", what: "Quick social graphics from templates.", repo: "https://www.canva.com", licence: free("Proprietary"), check: { web: true }, freeNote: "Brand kit and many templates need Pro." },
      { name: "Penpot", what: "Design and prototyping (Figma alternative).", repo: "penpot/penpot", licence: oss("MPL-2.0"), check: {} },
      { name: "Inkscape", what: "Vector graphics and logos (Illustrator alternative).", repo: "inkscape/inkscape", licence: oss("GPL-3.0"), check: { apps: ["Inkscape"] } },
      { name: "GIMP", what: "Photo editing (Photoshop alternative).", repo: "GNOME/gimp", licence: oss("GPL-3.0"), check: { apps: ["GIMP", "GIMP-2.10", "GIMP 3"] } },
    ],
    skills: [
      { id: "design:design-critique", what: "Structured feedback on a design" },
      { id: "design:design-system", what: "Audit or extend the design system" },
      { id: "design:accessibility-review", what: "WCAG check" },
      { id: "design:ux-copy", what: "Buttons, errors, empty states" },
      { id: "design:design-handoff", what: "Specs for engineering" },
      { id: "small-business:brand-style", what: "Brand style guide" },
      { id: "marketing:brand-review", what: "Is this on-brand?" },
    ],
  },
  {
    slug: "sales",
    label: "Sales & Partnerships",
    glyph: "◎",
    role: "Sales / partnerships lead",
    mission: "Finds leads and partners, runs outreach, and keeps the pipeline honest.",
    covers: ["Lead finding and triage", "Outreach and follow-up", "Pipeline and forecast", "Affiliate and partner deals"],
    tools: [
      { name: "Twenty", what: "Modern CRM (Salesforce/HubSpot alternative).", repo: "twentyhq/twenty", licence: core("AGPL-3.0"), check: {} },
      { name: "EspoCRM", what: "Lighter self-hosted CRM.", repo: "espocrm/espocrm", licence: oss("AGPL-3.0"), check: {} },
    ],
    skills: [
      { id: "small-business:lead-finder", what: "Find leads" },
      { id: "sales:lead-triage", what: "Which leads are worth it" },
      { id: "sales:draft-outreach", what: "First message" },
      { id: "small-business:outreach-composer", what: "Outreach sequences" },
      { id: "sales:call-prep", what: "Prep for a call" },
      { id: "sales:handle-objection", what: "Answer an objection" },
      { id: "small-business:proposal-builder", what: "Write a proposal" },
      { id: "sales:pipeline-review", what: "Pipeline review" },
      { id: "sales:forecast", what: "Forecast" },
    ],
  },
  {
    slug: "support",
    label: "Support & Community",
    glyph: "↩",
    role: "Customer support & community manager",
    mission: "Answers customers fast, writes the help docs, and runs the community.",
    covers: ["Help desk and live chat", "FAQs and help articles", "Community (Discord/forum)", "Reviews and reputation"],
    tools: [
      {
        name: "ManyChat",
        what: "Automatic replies on socials: comment-to-DM, keyword replies and DM flows on Instagram, Facebook Messenger and TikTok (beta).",
        repo: "https://manychat.com",
        licence: free("Free plan"),
        check: { web: true },
        url: "https://app.manychat.com",
        freeNote:
          "Free plan (pricing since 2 Mar 2026): 25 active contacts a month, 1,000 contacts total, 3 custom keyword triggers, 1 user. Not a Composio toolkit: connect accounts inside ManyChat (it's a Meta partner, so no developer app of your own).",
        warn: "Use one DM-automation tool per Instagram account: two tools answering the same inbox fight over replies.",
      },
      { name: "Chatwoot", what: "Shared inbox and live chat (Intercom alternative).", repo: "chatwoot/chatwoot", licence: core("MIT"), check: {} },
      { name: "Zammad", what: "Ticketing help desk (Zendesk alternative).", repo: "zammad/zammad", licence: oss("AGPL-3.0"), check: {} },
      { name: "Discord", what: "Community server, announcements and bots.", repo: "https://discord.com", licence: free("Proprietary"), check: { apps: ["Discord"], web: true } },
      { name: "Discourse", what: "Community forum.", repo: "discourse/discourse", licence: oss("GPL-2.0"), check: {} },
    ],
    skills: [
      { id: "ig-reply", what: "Draft replies to comments worth answering" },
      { id: "ig-dm", what: "DM scripts: keyword delivery, first message, follow-ups" },
      { id: "customer-support:ticket-triage", what: "Sort and route tickets" },
      { id: "customer-support:draft-response", what: "Draft a reply" },
      { id: "customer-support:kb-article", what: "Write a help article" },
      { id: "customer-support:customer-escalation", what: "Handle an escalation" },
      { id: "customer-support:customer-research", what: "What customers are saying" },
      { id: "small-business:ticket-deflector", what: "Answer before a ticket exists" },
      { id: "small-business:review-reputation", what: "Reviews and responses" },
    ],
  },
  {
    slug: "engineering",
    label: "Product & Engineering",
    glyph: "⌘",
    role: "Engineering lead / product manager",
    mission: "Builds and ships the product, keeps it up, and decides what's next.",
    covers: ["Specs and roadmap", "Build, review, test, deploy", "Uptime and incidents", "Infrastructure"],
    tools: [
      { name: "Git + Git LFS", what: "Version control, large files.", repo: "git-lfs/git-lfs", licence: oss("MIT"), check: { bins: ["git-lfs"] } },
      { name: "PostgreSQL", what: "Database (runs Postiz locally).", repo: "postgres/postgres", licence: oss("PostgreSQL"), check: { port: 5432, paths: ["~/.local/opt/pg17/package/native/bin/postgres"] } },
      { name: "Redis 7.4", what: "Cache and queues under Postiz.", repo: "redis/redis", licence: free("RSALv2 / SSPL"), check: { port: 6379, paths: ["~/.local/opt/redis/bin/redis-server"] }, freeNote: "Source-available, free to self-host. Valkey (BSD) is the drop-in open-source fork if ever needed." },
      { name: "Temporal", what: "Durable background jobs (runs Postiz's scheduler).", repo: "temporalio/temporal", licence: oss("MIT"), check: { port: 7233, paths: ["~/.local/opt/temporal/temporal"] }, url: "http://localhost:8233" },
      { name: "Playwright", what: "Browser automation and end-to-end tests.", repo: "microsoft/playwright", licence: oss("Apache-2.0"), check: { npx: true } },
      { name: "Uptime Kuma", what: "Uptime monitoring and alerts for every site the business runs.", repo: "louislam/uptime-kuma", licence: oss("MIT"), check: { port: 3001, paths: ["~/.local/opt/uptime-kuma/server/server.js"] }, url: "http://localhost:3001" },
      { name: "Sentry (self-hosted)", what: "Error tracking with stack traces.", repo: "getsentry/sentry", licence: free("FSL-1.1"), check: {}, freeNote: "Free to self-host; heavy (needs Docker, ~16 GB RAM)." },
      { name: "Grafana", what: "Dashboards over metrics and logs.", repo: "grafana/grafana", licence: oss("AGPL-3.0"), check: {} },
      { name: "Prometheus", what: "Metrics collection.", repo: "prometheus/prometheus", licence: oss("Apache-2.0"), check: {} },
      { name: "camofox-browser", what: "Anti-detect browser server for agents (researched, not installed).", repo: "jo-inc/camofox-browser", licence: oss("MIT"), check: {}, warn: "Crash reports go to public GitHub issues by default; binds to all interfaces without a key." },
    ],
    skills: [
      { id: "hq:services", what: "Start, stop and fix HQ's services" },
      { id: "product-management:write-spec", what: "Write a spec" },
      { id: "product-management:roadmap-update", what: "Update the roadmap" },
      { id: "product-management:sprint-planning", what: "Plan a sprint" },
      { id: "engineering:code-review", what: "Review a change" },
      { id: "engineering:debug", what: "Debug a problem" },
      { id: "engineering:testing-strategy", what: "What to test" },
      { id: "engineering:deploy-checklist", what: "Before you ship" },
      { id: "engineering:incident-response", what: "When it breaks" },
      { id: "engineering:tech-debt", what: "What to pay down" },
      { id: "superpowers:systematic-debugging", what: "Root-cause before fixing" },
      { id: "superpowers:test-driven-development", what: "Test first" },
      { id: "anthropic-skills:hot-tier-mismap-audit", what: "Audit odds-board mapping bugs" },
    ],
  },
  {
    slug: "data",
    label: "Data & Analytics",
    glyph: "▦",
    role: "Data analyst",
    mission: "Measures everything, builds the dashboards, and answers 'is it working?'.",
    covers: ["Web and product analytics", "Dashboards", "Ad-hoc analysis and SQL", "Tracking plans"],
    tools: [
      { name: "Looker Studio", what: "Free dashboards over Google Sheets, GA4 and Search Console.", repo: "https://lookerstudio.google.com", licence: free("Proprietary"), check: { web: true } },
      { name: "Umami", what: "Privacy-friendly web analytics (Google Analytics alternative).", repo: "umami-software/umami", licence: oss("MIT"), check: {} },
      { name: "Plausible CE", what: "Simple web analytics, self-hosted.", repo: "plausible/analytics", licence: oss("AGPL-3.0"), check: {} },
      { name: "PostHog", what: "Product analytics, session replay, funnels.", repo: "PostHog/posthog", licence: core("MIT"), check: {} },
      { name: "Metabase", what: "Dashboards and questions over your database.", repo: "metabase/metabase", licence: core("AGPL-3.0"), check: {} },
      { name: "Apache Superset", what: "Heavier BI and charting.", repo: "apache/superset", licence: oss("Apache-2.0"), check: {} },
      { name: "DuckDB", what: "Fast local SQL over CSV and Parquet files.", repo: "duckdb/duckdb", licence: oss("MIT"), check: { bins: ["duckdb"] } },
    ],
    skills: [
      { id: "data:analyze", what: "Answer a question with data" },
      { id: "data:build-dashboard", what: "Build a dashboard" },
      { id: "data:write-query", what: "Write SQL" },
      { id: "data:explore-data", what: "Explore a dataset" },
      { id: "data:statistical-analysis", what: "Is the difference real?" },
      { id: "data:validate-data", what: "Check the numbers" },
      { id: "product-tracking-skills:product-tracking-design-tracking-plan", what: "Tracking plan" },
      { id: "product-management:metrics-review", what: "Metrics review" },
      { id: "board-timing", what: "How long a pick stayed on the board" },
    ],
  },
  {
    slug: "finance",
    label: "Finance",
    glyph: "$",
    role: "Bookkeeper / finance lead",
    mission: "Keeps the books, chases invoices, watches cash, and gets BAS/GST and tax done.",
    covers: ["Bookkeeping and reconciliation", "Invoices and bills", "Cash flow", "Month-end, BAS/GST, tax"],
    tools: [
      { name: "ERPNext", what: "Full accounting, invoicing and inventory (Xero alternative).", repo: "frappe/erpnext", licence: oss("GPL-3.0"), check: {} },
      { name: "GnuCash", what: "Double-entry desktop accounting.", repo: "Gnucash/gnucash", licence: oss("GPL-2.0-or-later"), check: { apps: ["Gnucash", "GnuCash"] } },
      { name: "Beancount + Fava", what: "Plain-text accounting with a web UI; Claude can read and write it. One ledger per business.", repo: "beancount/fava", licence: oss("MIT"), check: { port: 5055, bins: ["fava", "bean-check"] }, url: "http://localhost:5055" },
      { name: "Firefly III", what: "Money tracking and budgets.", repo: "firefly-iii/firefly-iii", licence: oss("AGPL-3.0"), check: {} },
    ],
    skills: [
      { id: "small-business:cash-flow-snapshot", what: "Where the cash stands" },
      { id: "small-business:invoice-chase", what: "Chase unpaid invoices" },
      { id: "small-business:pay-the-bills", what: "What to pay and when" },
      { id: "small-business:close-month", what: "Close the month" },
      { id: "small-business:tax-prep", what: "Get ready for tax" },
      { id: "finance:reconciliation", what: "Reconcile accounts" },
      { id: "finance:journal-entry", what: "Journal entries" },
      { id: "finance:financial-statements", what: "P&L, balance sheet" },
      { id: "finance:variance-analysis", what: "Why numbers moved" },
    ],
  },
  {
    slug: "legal",
    label: "Legal & Compliance",
    glyph: "§",
    role: "Legal & compliance officer",
    mission: "Reviews contracts, tracks the rules that apply, and gets things signed.",
    covers: ["Contracts and NDAs", "Privacy and terms", "Industry rules from the business profile (gambling, kids, finance, health …)", "Getting things signed"],
    tools: [
      { name: "DocuSeal", what: "E-signatures (DocuSign alternative).", repo: "docusealco/docuseal", licence: oss("AGPL-3.0"), check: {} },
      { name: "Documenso", what: "E-signatures, alternative option.", repo: "documenso/documenso", licence: oss("AGPL-3.0"), check: {} },
    ],
    skills: [
      { id: "legal:review-contract", what: "Review a contract" },
      { id: "legal:triage-nda", what: "Triage an NDA" },
      { id: "legal:compliance-check", what: "Does this break a rule?" },
      { id: "legal:legal-risk-assessment", what: "Rate the legal risk" },
      { id: "legal:vendor-check", what: "Check a vendor" },
      { id: "legal:signature-request", what: "Send for signature" },
      { id: "small-business:contract-review", what: "Plain-English contract review" },
      { id: "operations:compliance-tracking", what: "Track obligations" },
    ],
    notes: ["Skills are a first pass, not legal advice. Regulated businesses need a real lawyer on call."],
  },
  {
    slug: "people",
    label: "People & HR",
    glyph: "☺",
    role: "People / HR lead",
    mission: "Hires, onboards and pays people and contractors properly.",
    covers: ["Job posts and screening", "Onboarding", "Payroll, super, STP", "Capacity planning"],
    tools: [
      { name: "Frappe HR", what: "HR and payroll (runs with ERPNext).", repo: "frappe/hrms", licence: oss("GPL-3.0"), check: {} },
    ],
    skills: [
      { id: "small-business:job-post-builder", what: "Write a job post" },
      { id: "small-business:hiring-screener", what: "Screen applicants" },
      { id: "small-business:payroll-prep", what: "Get payroll ready" },
      { id: "small-business:plan-payroll", what: "Plan payroll costs" },
      { id: "operations:capacity-plan", what: "Who has room for what" },
    ],
  },
  {
    slug: "security",
    label: "IT & Security",
    glyph: "⛨",
    role: "IT & security lead",
    mission: "Makes sure nothing is lost and nothing leaks: backups, passwords, sync.",
    covers: ["Backups", "Passwords and 2FA", "File sync between Macs", "Secrets hygiene"],
    tools: [
      { name: "restic", what: "Encrypted, deduplicated backups to disk or cloud.", repo: "restic/restic", licence: oss("BSD-2-Clause"), check: { bins: ["restic"] } },
      { name: "Kopia", what: "Backups with a desktop UI and scheduling.", repo: "kopia/kopia", licence: oss("Apache-2.0"), check: { bins: ["kopia"], apps: ["KopiaUI"] } },
      { name: "Vaultwarden", what: "Self-hosted password manager (Bitwarden-compatible).", repo: "dani-garcia/vaultwarden", licence: oss("AGPL-3.0"), check: {} },
      { name: "Syncthing", what: "Sync folders between Macs, device to device, no cloud in between.", repo: "syncthing/syncthing", licence: oss("MPL-2.0"), check: { port: 8384, bins: ["syncthing"], apps: ["Syncthing"] }, url: "http://localhost:8384", warn: "Pair devices in its web UI; only folders you share are synced." },
    ],
    skills: [
      { id: "hq:backup", what: "Encrypted nightly backups, proven by restore tests" },
      { id: "hq:restore", what: "Recover files, roll back, or rebuild on a new Mac" },
      { id: "operations:risk-assessment", what: "What could go wrong" },
      { id: "engineering:incident-response", what: "When something leaks or breaks" },
      { id: "session-wrap-up", what: "Get every repo committed and pushed" },
    ],
  },
];

/** Left out because what we'd use them for needs a paid plan. */
export const EXCLUDED = [
  { name: "Xero, MYOB, QuickBooks", reason: "accounting is subscription-only; ERPNext or Beancount instead" },
  { name: "Klaviyo, Mailchimp paid tiers", reason: "free tiers cap contacts and sends; Listmonk instead" },
  { name: "Ahrefs, Semrush", reason: "paid; Search Console + Bing + SerpBear instead" },
  { name: "HubSpot paid hubs", reason: "the useful parts are paid; Twenty instead" },
  { name: "Intercom, Zendesk", reason: "paid per seat; Chatwoot or Zammad instead" },
  { name: "Obsidian Sync", reason: "paid; the vault syncs with git instead" },
]

/** Alternatives share a group (a department needs one of them); optional tools
 *  are shown but never count against readiness. A key can be "dept:Tool" when the
 *  same tool plays different roles in different departments. Kept here so the department
 *  lists above stay readable. */
const GROUPS: Record<string, string> = {
  // operations
  Obsidian: "notes", AppFlowy: "notes", Docmost: "notes",
  Plane: "projects", Vikunja: "projects",
  "operations:Composio": "automation", n8n: "automation", Activepieces: "automation",
  // content
  "HQ Studio": "editor", "DaVinci Resolve": "editor", Kdenlive: "editor", OpenCut: "editor",
  // seo
  Lighthouse: "audits", Unlighthouse: "audits",
  // ads
  "Meta Ad Library": "ad-research", "Google Ads Transparency Center": "ad-research",
  // competitors: the ad libraries are one need there too; SerpBear stays optional
  // email
  Listmonk: "email", Mautic: "email",
  // design
  "Figma (Starter)": "design", Penpot: "design",
  // sales
  Twenty: "crm", EspoCRM: "crm",
  // support
  Chatwoot: "helpdesk", Zammad: "helpdesk",
  Discord: "community", Discourse: "community",
  // data
  Umami: "web-analytics", "Plausible CE": "web-analytics", PostHog: "web-analytics",
  "Looker Studio": "dashboards", Metabase: "dashboards", "Apache Superset": "dashboards",
  // finance
  "Beancount + Fava": "books", ERPNext: "books", GnuCash: "books",
  // legal
  DocuSeal: "e-signature", Documenso: "e-signature",
  // security
  restic: "backups", Kopia: "backups",
};

const OPTIONAL = new Set([
  "camofox-browser", // researched, not for production scraping
  "claude-ads", // when there's ad spend to audit
  "GrowthBook", // when there's traffic to test on
  "SerpBear", // Search Console already reports positions
  "Sentry (self-hosted)", "Grafana", "Prometheus", // when there's a fleet to watch
  "Firefly III", // personal budgeting, not company books
  "Vaultwarden", // passwords live in the Passwords app
]);

for (const d of DEPARTMENTS) {
  for (const t of d.tools) {
    const group = GROUPS[`${d.slug}:${t.name}`] ?? GROUPS[t.name];
    if (group) t.group = group;
    if (OPTIONAL.has(t.name)) t.optional = true;
  }
}

export function findDepartment(slug: string): Department | undefined {
  return DEPARTMENTS.find((d) => d.slug === slug);
}
