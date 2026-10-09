# Set up a workflow end to end

> **If you are an AI walking an owner through this:** don't build everything at once. Pick at most three
> workflows per business, each aimed at the weakest number on the scorecard, and finish one before starting
> the next. Anything a customer sees ships in **draft** ("Ask me"), with a holdout, and the owner approves the
> first batch. Before building, credit the workflows that already run (step 2): owners usually have more than
> HQ can see. Never read `.env` files; adapters return totals, never people.

The [Workflows tab](/guides/workflows) lists 57 workflows. A workflow counts as **running** only when HQ has
proof that it delivered something. This guide covers how to build a workflow for your own business and how to
prove it runs, with recipes for the workflows that most subscription businesses need first.

## How HQ knows a workflow runs

HQ accepts two kinds of proof, and reads one set of numbers to judge the result.

| Proof | For workflows that… | Where it comes from |
|---|---|---|
| **Messages delivered** | send emails or messages (onboarding, trial, annual offer) | Your [lifecycle adapter](/guides/lifecycle). Each message names the workflow it `serves`; it's live once one has been delivered in the last 30 days. |
| **Checks passed** | send nothing (pages, product features, measurement) | Your workflow-checks adapter. Each check passes or fails; the workflow is live when every check passed in the last 8 days. |
| **Numbers** (the result) | every workflow | Your [analytics adapter](/guides/analytics). Each workflow page lists the numbers it's judged by. |

Log every new workflow as an experiment against one of those numbers, so the weekly review can tell whether
it worked: `npm run hq -- experiment add <slug> "<hypothesis>" --metric <id> --baseline <value>`.

## Before you start

- A [scorecard](/guides/scorecard) and an [analytics adapter](/guides/analytics) are connected, so you can see
  the number you're trying to move before you change anything.
- For email workflows, your own email engine is connected through a [lifecycle adapter](/guides/lifecycle).
  HQ never sends email itself.
- [Legal & Compliance](/guides/legal) has read the profile's regulated flags. They change what a save offer, a
  comparison page or a price display may say.

## The steps, for any workflow

1. **Pick by lever.** The CEO names the weakest lever each week. Choose the workflow that moves it, and name its one owner.
2. **Credit what already runs** (next section). It's often a quarter of the catalogue.
3. **Build the smallest version that delivers**: one email, one page or one product change. Leave the rest for later.
4. **Ship it in draft, with a holdout.** Email flows hold 20% back so the outcome can be compared. Pages and
   product features go behind a switch, off until the owner says yes.
5. **Prove it.** Give each email a `serves`, or add checks for anything that sends nothing.
6. **Measure it.** Report the workflow's numbers from your analytics adapter (ids below), as totals only.
7. **Log the experiment**, and read it again at the week-one review.

## Credit what already runs

Most businesses run some of these without HQ knowing. Write one check for each, using the template in step 5.

| Workflow | What usually already exists | A check that proves it |
|---|---|---|
| Honest track record | Results or proof shown on the landing page | The page shows the record, and it includes this month |
| Data freshness and uptime | A health check or uptime monitor | `uptime_rate` at least 0.99; `stale_minutes` below 60 |
| Community invites | A public Discord, forum or group | The site links the invite; `community_members` measured |
| Walkthrough videos in the owner's voice | "How it works" videos on product pages | `walkthrough_coverage` at least 0.5 |
| Release quality gate | Tests that run before a release | The test hook exists on the main branch; `customer_bugs` measured |
| Free tool as a lead magnet | A free plan, calculator or trial key | The signup page offers it; `tool_users` measured |
| Experiment log, Measurement plumbing | HQ's own experiment log and adapters | Experiments have baselines; snapshots under 2 days old |

## Recipes

### Trial that didn't convert (get)

- **Who:** two groups. Free sign-ups who never started a trial within 4 to 10 days, and trials that ended without paying.
- **Build:** one email per group. The first invites them to start the trial and names one thing it adds to what
  they've already used. The second says what they'd keep and how to restart. Skip anyone who has started
  paying since.
- **Numbers:** `trial_to_paid_rate`, `new_paying`. The outcome to compare with the holdout: trial started within 7 days, and paid within 14.
- **Watch for:** if trials convert well but few start, the trial is hard to find. Fix where it's offered before
  writing more email.

### Cancel flow with saves (keep)

- **Who:** anyone who starts to cancel.
- **Build:** ask the reason in one tap, then offer ONE save that fits it. Too expensive: offer a yearly price or a
  cheaper tier. Not using it: offer the cheaper tier. Missing a feature: ask which one and send it to Support.
  Record each attempt and its outcome (cancelled, saved to yearly, saved to a lower tier).
- **Legal:** "No thanks, cancel" stays visible, and finishes the cancel in one more tap. Never hide it, delay it or pre-tick anything.
- **Numbers:** `save_rate`, `cancel_reasons`, `set_to_cancel`, `paying_churn_rate`.
- **Prove it:** a check that the cancel attempts are counted (`save_rate` measured).

### Exit survey to competitive intel (keep)

- **Build:** when the reason is "switched to another service", ask which one with chips for the rivals on your
  [competitor list](/guides/competitors), plus "another one".
- **Numbers:** `churn_to_rival`, split by rival. Share counts only, never the free-text answers.
- **Then:** a rival that keeps appearing goes to Market & Competitors, and the "Competitor gap becomes
  comparison content" workflow can answer it.

### Monthly to annual (expand)

- **Who:** active monthly payers in month two or three who used the product in the last 14 days, and aren't cancelling.
- **Build:** one email with their real saving per month for their own plan, plus a link that opens billing with
  yearly already selected. Explain proration in one line.
- **Numbers:** `annual_share`. The outcome: switched to yearly within 14 days.

### Pricing page experiment and tier design (get, expand)

- **Build:** a new tier behind a switch that's off by default. While it's off, the site, checkout and limits must
  behave exactly as before, and a test should prove it. When it's on, every place that enforces limits enforces
  the new tier too. The owner sets the price, creates it in the payment provider, then flips the switch.
- **Before you flip it:** list rivals' public prices from your competitor watch. Legal checks how prices are
  displayed (currency, tax, billing period).
- **Numbers:** `visitor_to_paid_rate`, `new_paying`, `new_mrr`, `arpu`, `mrr_by_tier`. Add the new product
  to your scorecard's billing tiers, or its customers won't be counted.

### Competitor gap becomes comparison content (get)

- **Build:** one page per rival ("you vs them") built from their public pages. Every fact links its source with an
  "as of" date, and a test fails when a fact has no source. Say who each option suits, and avoid "best" or any
  claim you can't link.
- **Measure:** tag the signup link (for example `utm_source=compare`), and have your analytics adapter count
  sign-ups that landed on a compare page.
- **Numbers:** `comparison_signups`, `competitor_changes`. Refresh the facts when Market & Competitors reports a change.

### Free tool as a lead magnet, and the comment-keyword funnel (get)

- **Build:** a small free tool that works on its own (a calculator, a script, an AI tool) and ends with one step
  into the product, such as a free key or a trial. Give it away with a comment keyword: the post asks for the
  keyword, the DM sends the link, and the link carries a source tag (for example `utm_source=<series>-ig`).
- **Numbers:** `tool_users`, `tool_signup_rate`, `keyword_dms`, `dm_to_email_rate`, `email_to_trial_rate`.
- **Prove it:** the keyword posts and the DMs are already counted by HQ. Add a check that tagged sign-ups are being counted.

### Load test before growth (keep)

- **Build:** `npm run hq -- loadtest setup <slug> --target <customers at once> --cadence 30`, then a harness in the
  business's own repo from `templates/loadtest/` (the simulated customers, a disposable staging copy, a sampler and
  the report). `/hq:load-test` walks all of it and asks before creating anything that costs money.
- **Numbers:** `load_test_users`.
- **Prove it:** nothing to add. `npm run hq -- loadtest record <slug> <run folder>` keeps each run; the workflow is
  live while the newest run meets the target and is within the cadence, in part otherwise. A CEO finding opens when
  a test is due. See [Load testing](/guides/load-test).

### Runbooks, vendors and risks (foundation)

- **Build:** a runbook for each thing that breaks (site down, stale data, a payment problem, a bad deploy), written
  as an Operations playbook whose title starts with "Runbook" (`npm run hq -- brain write <slug> -`); then a vendor
  review and a risk register saved as Operations documents:
  `npm run hq -- save-plan <slug> operations <file> --title "vendor review"` and `--title "risk register"`.
- **Numbers:** `runbooks`.
- **Prove it:** nothing to add. HQ reads the vault: live with at least one runbook plus a vendor review and a risk
  register saved in the last 90 days, in part while any of the three is missing or out of date.

## Done when

- [ ] Each workflow you started has one owner, ships in draft or behind a switch, and has an experiment logged against a number.
- [ ] Every workflow that already ran is credited with a check.
- [ ] The workflow's page shows its proof and its numbers, and nothing reads "not measured" without a reason.

## Good to know

- Three at a time per business keeps every result readable. Ten at once, and nobody can tell which one moved the number.
- A check that never ran is not a pass, and an email that was only drafted or tested isn't proof.
- Adapters return totals, rates and counts by category. Free-text answers, names, emails and ids stay in your own systems.
