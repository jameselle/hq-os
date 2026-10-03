# Getting started: install HQ and add a business

> **If you are an AI walking an owner through this:** run `/hq:setup`. It follows this guide, checks what's
> already done before asking anything, and then walks the departments in the order below. Ask the owner only
> for what only they can do (install an app, sign in, choose, approve). Never ask for a password, key or
> token in chat.

HQ runs a business from one local console: a tab per department, a CEO that ranks what needs you, and an
Obsidian vault per business for its memory. Everything runs on your Mac and every tool is free.

**The fastest way to set it up:** open Claude Code and say **"set up HQ"** (or run `/hq:setup`). Claude
checks what's already done and walks you through the rest, one step at a time. This page is the same
walk-through, written out.

## 1. Install HQ (about 15 minutes, once per Mac)

You need: a Mac, [Claude Code](https://claude.com/claude-code), the GitHub CLI (`gh`, signed in), and
Node.js 22 (the official installer from nodejs.org). HQ uses no Homebrew and no Docker.

```bash
gh repo clone jameselle/hq-os ~/business-os && cd ~/business-os
npm install && npm run build
claude plugin marketplace add jameselle/hq-os && claude plugin install hq@hq
npm run hq -- services init && npm run hq -- services install   # HQ starts at login from now on
npm run hq -- doctor
```

Open http://127.0.0.1:3150. `doctor` lists anything still missing, each with the command that fixes it.

## 2. Add your business (about 10 minutes)

In Claude Code run **`/hq:new-business`**. Give it your website if you have one: it drafts the answers so
you only confirm. It asks for your offer, audience, business model, country, channels (handles only, never
passwords), whether you're in a regulated area (gambling, kids, finance, health, alcohol, adult), and which
departments to skip. It then creates the business profile, an Obsidian vault, and runs a first CEO review.

Adding a second or third business is the same command. Each gets its own profile, vault and scorecard, and
the top bar switches between them.

## 3. Back it up before anything else (about 5 minutes)

Run **`/hq:backup`**. It sets up encrypted nightly backups (restic) to iCloud Drive or a drive you choose,
with a weekly restore test. Copy the backup password into your password manager when it asks: without it,
the backup can't be opened. Details: [IT & Security](/guides/security).

## 4. Set up the departments, in this order

Do them in order; each takes 5 to 30 minutes. Skip any department your business doesn't run. Tell Claude
**"set up the <department> department"** for any of them, or follow its guide.

1. [IT & Security](/guides/security): backups, passwords, file sync.
2. [Operations](/guides/operations): notes, projects and automations.
3. [Finance](/guides/finance): the ledger HQ reads for cost to win.
4. [Data & Analytics](/guides/data): the growth scorecard, including
   [Stripe and the App Store](/guides/scorecard-billing) and [your own records](/guides/scorecard-records).
5. The departments that win customers: [Content & Social](/guides/content), [SEO & GEO](/guides/seo),
   [Paid Ads & Growth](/guides/ads), [Market & Competitors](/guides/competitors), [Design & Brand](/guides/design).
6. The departments that keep them: [Email & Lifecycle](/guides/email), [Support & Community](/guides/support),
   [Sales & Partnerships](/guides/sales), [Product & Engineering](/guides/engineering).
7. As you grow: [Legal & Compliance](/guides/legal), [People & HR](/guides/people).

## 5. Run the business from the CEO tab

- Open the **CEO** tab daily. Red is urgent, amber needs fixing, blue is a call only you can make.
  See [The CEO tab](/guides/ceo).
- Each week run **`/hq:ceo`** for a review, and `/hq:ceo plan the week` for a plan.
- The **Workflows** tab shows how departments hand work to each other. See [Workflows](/guides/workflows).

## Done when

- [ ] `npm run hq -- doctor` shows no failures.
- [ ] Your business is in HQ's top bar and has a vault.
- [ ] `/hq:backup` reports a snapshot and a passed restore test, and the password is in your password manager.
- [ ] Each department you run shows **equipped** on its tab, or you've chosen what to leave for later.
- [ ] The CEO tab shows no red findings.

## Good to know

- **Free tools only.** Every tool HQ suggests is open source or has a free plan that covers the use.
  New tools go through `/hq:add-tool`, which checks the licence and installs from a verified release.
- **Your data stays yours.** Business data lives in `~/hq-data` (backed up, never in a repository).
  Keys and passwords live in your Mac's Keychain, typed by you. HQ keeps ids, statuses and totals, never
  customer details.
- **Nothing goes out without your yes.** HQ drafts posts, emails and replies; you approve each one.
- **A demo first?** Ask `/hq:new-business` for a demo business to try HQ with invented data.
