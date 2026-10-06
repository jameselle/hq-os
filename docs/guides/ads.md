# Paid Ads & Growth: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** plans paid campaigns, runs experiments, and reports what each dollar returned.

**It covers:** campaign plans and budgets; ad copy and creative briefs; A/B tests and landing pages; performance
reporting.

**Owner's time:** about 10 to 15 minutes to set up. **Cost:** the tools are free. Ad spend itself is the owner's
money: HQ never commits any without the owner approving the budget.

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar.
- [Finance](/guides/finance) has a ledger: cost to win and payback come from spend posted to
  `Expenses:Advertising` (and `Expenses:Commissions`) in the business's Beancount ledger.
- [Data & Analytics](/guides/data) has an analytics tool collecting traffic, or there's nothing to judge a
  campaign by.
- [Content & Social](/guides/content) has organic posts with numbers: the usual first campaign boosts what
  already worked.
- Regulated industries: read the department's notes on the tab first. Gambling, alcohol, adult and children's
  products face platform-level ad restrictions.

## 1. Tools

Installs go through `/hq:add-tool`: free tools only, from a checksum-verified release or source, never
`curl | sh`, no Homebrew, no Docker on the Mac. Web services: the owner uses them in their own browser; Claude
never signs up on their behalf.

### Meta Ad Library

- **What it's for:** every ad any Facebook or Instagram page is running, for competitor research and creative ideas.
- **Needed or optional:** one of a group with the Google Ads Transparency Center: one is enough, and both are free.
- **Licence or plan:** free (proprietary), no account needed to search.
- **Set it up:** nothing to install. Search at https://www.facebook.com/ads/library (filter by country and
  "All ads").
- **How HQ checks it:** a free web service, always shown as **web**.

### Google Ads Transparency Center

- **What it's for:** competitors' Google ads (search, display and YouTube).
- **Needed or optional:** one of a group with the Meta Ad Library.
- **Licence or plan:** free (proprietary), no account needed.
- **Set it up:** nothing to install. Search by advertiser at https://adstransparency.google.com.
- **How HQ checks it:** a free web service, always shown as **web**.

### GrowthBook

- **What it's for:** feature flags and A/B experiments on the site or app.
- **Needed or optional:** optional, worth it once there's enough traffic for a test to reach a result.
- **Licence or plan:** open core: the MIT-licensed core is free to self-host; use only the free parts.
- **Set it up:** `/hq:add-tool GrowthBook for ads`. It's a server: it must bind to 127.0.0.1 and run as an HQ
  launchd service (`npm run hq -- services add-defaults && npm run hq -- services install`, check with
  `npm run hq -- services status`). Turn its telemetry off in its settings if it offers it. Experiments then
  need the GrowthBook SDK added to the site, which is [Product & Engineering](/guides/engineering)'s job.
- **How HQ checks it:** shows **installed** once it's in `~/.local/opt/growthbook` (where `/hq:add-tool` puts it);
  `/hq:add-tool` also adds its port so the tab can show it **running**. Until then it shows **missing**, which,
  being optional, never counts against readiness.

### claude-ads

- **What it's for:** an audit-and-plan skill pack covering 12 ad platforms. Researched, not installed by default.
- **Needed or optional:** optional, for when there's real ad spend to audit.
- **Licence or plan:** open source, MIT.
- **Set it up:** only with the owner's yes, through `/hq:add-tool claude-ads for ads`. It installs 25 agents
  globally and pins some of them to a specific model, so read what it adds before installing. It doesn't handle
  regulated-industry ad approval.
- **How HQ checks it:** `~/.claude/skills/ads` present (**installed**).

## 2. Accounts and connections

None that HQ connects. The ad platforms themselves (Meta Ads Manager, Google Ads and so on) are the owner's own
accounts, signed into in their own browser. HQ doesn't hold their logins or keys, and Claude never creates an
ad account for the owner.

What HQ needs instead is the **spend**: post it to `Expenses:Advertising` in the business's ledger
([Finance](/guides/finance)) so the scorecard can work out cost to win and payback. Tag each campaign's spend with
the metadata `campaign: "<campaign id>"` so the Campaigns page shows its cost per sign-up.

## 3. Skills to use

- `/marketing:campaign-plan`: a campaign plan and budget. Start here for any campaign.
- `/marketing:competitive-brief`: what competitors are running (pairs with the two ad libraries).
- `/small-business:ad-manager`: run and review ad campaigns.
- `/marketing:performance-report`: what the spend returned.
- `/small-business:growth-pulse`: a growth check-in.
- `/small-business:marketing-monday`: the weekly marketing plan.

- `/hq:campaign`: plan a campaign from the business's brain, channel plan and competitors, write it to HQ (goal,
  audience, offer, channels, dates, budget, the tag on every link, the number to move), link the posts, blog posts
  and emails that serve it, report it weekly and close it with learnings. Every campaign shows on the
  **Campaigns** page under Lead in the side nav. See [Campaigns](/guides/campaigns).

`/hq:dept ads` plans the department's week, and `/hq:competitors` (in [Market & Competitors](/guides/competitors))
feeds it rivals' ads every week.

## 4. Check it's working

- The department tab shows Meta Ad Library and Google Ads Transparency Center as **web**. Or from the terminal:
  `curl -s http://127.0.0.1:3150/api/status | jq '.departments[] | select(.slug=="ads") | .tools[] | {name, state}'`.
- A Meta Ad Library search for a known competitor shows their active ads.
- After the first campaign's spend is in the ledger, the scorecard on the Data tab shows cost to win instead of
  "can't be measured yet".
- The CEO tab shows no unresolved findings for this department. The CEO has no ads-specific findings today; the
  related ones to clear first are **"No analytics tool is running"** (Data) and **"No accounting system"** (Finance).

## Done when

- [ ] The owner knows where the two ad libraries are and has looked up the main competitors in each.
- [ ] Ad spend has a home in the ledger (`Expenses:Advertising`), or the owner has decided not to run paid ads yet.
- [ ] A campaign plan from `/marketing:campaign-plan` or `/hq:campaign` exists with a budget cap the owner approved,
      and it's on the Campaigns page.
- [ ] GrowthBook and claude-ads are either installed with the owner's yes or consciously left for later.
- [ ] The department tab shows **equipped**.

## Good to know

- **No spend without the owner's yes.** Claude plans and drafts; the owner sets budgets and launches campaigns in
  their own ad accounts.
- A common rule of thumb in HQ's workflows: cap spend where payback runs over 12 months, and boost proven organic
  winners before making new creative.
- Ad copy follows the same rule as captions: no em or en dashes (`npm run hq -- caption-check`).
- Regulated industries need platform approval (for example gambling and alcohol), and many platforms won't run
  personalised ads to children. Check [Legal & Compliance](/guides/legal) before the first campaign.
- The ad libraries are public research only: never sign in as anyone else or scrape behind a login.
