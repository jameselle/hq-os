# SEO & GEO: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** gets the sites found in Google and cited by AI answer engines (ChatGPT,
Perplexity, Google AI).

**It covers:** technical and on-page SEO; keywords and content briefs; Search Console and indexing; AI
visibility (GEO); regression tracking.

**Owner's time:** about 20 to 30 minutes, mostly proving to Google and Bing that the owner controls the site.
**Cost:** free. Ahrefs and Semrush are left out because they're paid; Search Console, Bing Webmaster Tools and
SerpBear cover the same ground for free.

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar.
- The business profile lists its sites (`"sites": ["https://acme.example"]`). The audits run against these.
- The owner can change the site's DNS or upload a file to it: Google and Bing need one or the other to verify
  ownership.
- Composio is set up for Search Console's connection (see [Content & Social](/guides/content), section 1).
- Useful alongside: [Data & Analytics](/guides/data) for traffic numbers (the CEO flags "No analytics tool is
  running" until one is), and [Market & Competitors](/guides/competitors) for who you rank against.

## 1. Tools

Installs go through `/hq:add-tool`: free tools only, from a checksum-verified release or source, never
`curl | sh`, no Homebrew, no Docker on the Mac. Web services: the owner signs up; Claude never signs up on
their behalf.

### Google Search Console

- **What it's for:** real queries, clicks, positions and indexing from Google. `seo-analysis` and `seo-drift`
  read it; without it they fall back to crawl-only audits.
- **Needed or optional:** needed.
- **Licence or plan:** free (proprietary).
- **Set it up:**
  1. The owner signs in at https://search.google.com/search-console and adds the site, preferably as a
     **Domain** property verified with a DNS TXT record (it covers every subdomain and http/https).
  2. The owner submits the sitemap (usually `/sitemap.xml`) under **Sitemaps**.
  3. Connect it for HQ, one of two ways:
     - **Through Composio (simplest):** `/hq:connections connect google_search_console`. Claude shows a Composio
       sign-in link (valid 10 minutes); the owner signs in with the Google account that owns the property.
       Claude then refreshes the snapshot.
     - **Through Google's gcloud CLI:** `/hq:add-tool gcloud for seo` (Google's official, checksum-verified
       archive into `~/.local/opt`), then the owner runs `gcloud auth login` themselves. Turn its usage
       reporting off: `gcloud config set disable_usage_reporting true`.
- **How HQ checks it:** a free web service; it shows **connected** once the snapshot has an active
  `google_search_console` account.

### Bing Webmaster Tools

- **What it's for:** Bing indexing and IndexNow. ChatGPT search leans on Bing, so it matters for GEO.
- **Needed or optional:** needed.
- **Licence or plan:** free (proprietary).
- **Set it up:** the owner signs in at https://www.bing.com/webmasters and adds the site. The quickest way is
  **Import from Google Search Console**, which carries the verification and sitemaps over. Otherwise verify with
  a DNS record or file, and submit the sitemap.
- **How HQ checks it:** a free web service (HQ can't see whether the site is verified, so confirm it in Bing).

### Lighthouse or Unlighthouse

- **What it's for:** **Lighthouse** scores one page for performance, SEO and accessibility. **Unlighthouse** runs
  Lighthouse across a whole site in one go.
- **Needed or optional:** one of a group: one is enough. Both need nothing installed beyond Node.
- **Licence or plan:** Lighthouse: Apache-2.0. Unlighthouse: MIT.
- **Set it up:** nothing to install; they run on demand with npx. Lighthouse drives Google Chrome, so Chrome must
  be on the Mac. Try one:
  `npx lighthouse https://acme.example --only-categories=performance,seo,accessibility --output html --output-path ./lighthouse.html`
  or, for the whole site, `npx unlighthouse --site https://acme.example`.
- **How HQ checks it:** `npx` on the PATH, shown as **on-demand**.

### SerpBear

- **What it's for:** a self-hosted keyword rank tracker.
- **Needed or optional:** optional. Search Console already reports positions; add SerpBear when you want daily
  rank history for a fixed keyword list, or to track against competitors.
- **Licence or plan:** open source, MIT.
- **Set it up:** `/hq:add-tool SerpBear for seo`. It's a server, so it must bind to 127.0.0.1 and run as an HQ
  launchd service (`npm run hq -- services install`, then `npm run hq -- services status`). It fetches rankings
  through a search-results scraping provider: pick one with a free plan that covers your keyword count, and the
  owner enters that provider's key in SerpBear's own settings, never in chat. If none fits for free, skip it.
- **How HQ checks it:** shows **installed** once it's in `~/.local/opt/serpbear` (where `/hq:add-tool` puts it);
  `/hq:add-tool` also adds its port so the tab can show it **running**. Until then it shows **missing**, which,
  being optional, never counts against readiness.

## 2. Accounts and connections

- **Google Search Console** through Composio (`/hq:connections connect google_search_console`) or through
  the gcloud CLI with the owner's own Google sign-in. HQ's snapshot (`$HQ_DATA/connections.json`) stores only the
  connection's id, alias, name and status, never a key or token.
- **Bing Webmaster Tools**: the owner's own Microsoft or Google sign-in at bing.com/webmasters. Nothing is
  stored in HQ.
- Check: `npm run hq -- connections show` lists `google_search_console` with an `ACTIVE` account.

## 3. Skills to use

- `/seo-analysis`: a full audit from Search Console data. The starting point.
- `/seo-drift`: take a baseline, then catch SEO regressions after each site change.
- `/programmatic-seo`: plan or audit many pages built from a template (for example "[service] in [city]"),
  without thin or doorway pages.
- `/searchfit-seo:seo-audit`: a site-wide SEO audit.
- `/searchfit-seo:technical-seo`: crawl, index and speed issues.
- `/searchfit-seo:on-page-seo`: titles, headings and content on a page.
- `/searchfit-seo:keyword-clustering`: group keywords into pages.
- `/searchfit-seo:content-brief`: a brief for a new page (hand it to [Content & Social](/guides/content)).
- `/searchfit-seo:schema-markup`: structured data.
- `/searchfit-seo:internal-linking`: the site's link structure.
- `/searchfit-seo:ai-visibility`: show up in AI answers (GEO).
- `/small-business:seo-ai-visibility`: a GEO check sized for a small business.

- `/hq:blog`: research and write one post: Search Console gaps, what competitors publish, the posts the site
  already has. HQ's daily blog runs it on its own every day; run it by hand to try a topic. Set the daily blog up
  with [Daily blog](/guides/blog).

`/hq:dept seo` plans the department's week. The SEO & GEO tab leads with the blog drafts waiting for you, then the
published posts, the search numbers and whether search and AI engines can read each site.

## 4. Check it's working

- The department tab shows Google Search Console as **connected**, Bing Webmaster Tools as **web**, and
  Lighthouse and Unlighthouse as **on-demand**. Or from the terminal:
  `curl -s http://127.0.0.1:3150/api/status | jq '.departments[] | select(.slug=="seo") | .tools[] | {name, state}'`.
- `npx lighthouse <your site> --only-categories=seo --output json --quiet | jq '.categories.seo.score'` prints a
  number between 0 and 1.
- `/seo-analysis` on the site reports real queries and clicks from Search Console, not a crawl-only audit.
- Search Console's **Pages** report and Bing's **Sitemaps** page both show the sitemap read without errors
  (the owner checks in each site; it can take a day or two after first submitting).
- The CEO tab shows no unresolved SEO findings. The one you may see:
  - **"No live Search Console data"**: clears once Search Console is connected through Composio
    (`/hq:connections connect google_search_console`), or once the gcloud CLI is installed and signed in.

## Done when

- [ ] The site is verified in Google Search Console and its sitemap is submitted.
- [ ] Search Console is connected through Composio or gcloud, and the CEO's "No live Search Console data" is gone.
- [ ] The site is in Bing Webmaster Tools with its sitemap.
- [ ] A Lighthouse or Unlighthouse run has scored the main pages.
- [ ] `/seo-drift` has a baseline for the site.
- [ ] `/seo-analysis` has run once and its top fixes are in the department's plan (`/hq:dept seo`).

## Good to know

- Free tools only: no paid rank trackers or keyword databases. If a skill suggests one, use Search Console,
  Bing and SerpBear instead.
- Verification happens in the owner's own accounts. Claude never signs up for Google or Bing on their behalf.
- Search Console data lags by two to three days, and a new site shows little for the first few weeks.
- Programmatic pages at scale can earn a manual action if they're thin or near-duplicates: run
  `/programmatic-seo` before generating them, and keep low-value pages `noindex`.
- If gcloud is the route, its usage reporting is off (`gcloud config set disable_usage_reporting true`).
- Regulated industries: check the department notes on the tab before writing claims into titles or schema.
