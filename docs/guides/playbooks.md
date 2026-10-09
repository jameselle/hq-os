# Playbooks: workflows HQ starts on its own

> **If you are an AI walking an owner through this:** turn playbooks on in **ask** mode first
> (`npm run hq -- playbook mode <slug> ask`), run one tick, and read the queue together. Run one playbook, read its
> plan with the owner, and only apply it on their word. Never put a business on **auto** without the owner saying so.
> If the business has a rule a playbook would break (a pricing promise, a regulator's rule), add that workflow to its
> skip list before anything runs.

A playbook is a workflow from the Workflows tab that HQ can start without being asked. Each one has:

- **A trigger:** a signal from another department about it, a schedule (weekly, monthly, quarterly), the CEO's
  routing when its lever is the weakest, or an alarm number above zero. Some never start alone: the ones that need
  you (on camera, a pricing decision) and the ones an HQ job already runs (social, blog, lifecycle email).
- **One owner and its contributors**, from the workflow's steps.
- **Guard rails:** anything that reaches customers carries a Legal check. Where the workflow didn't list one, HQ
  adds it before the step that ships.
- **A target number** from the analytics board, so the result can be judged.

Every playbook and what starts it is listed at the bottom of the **Playbooks** tab on the Workflows page.

## How a week goes

1. **Signals.** Every day after the scorecard refresh, HQ files the week's automatic hand-offs: Data & Analytics to
   the CEO (the scorecard), Email (at-risk customers), Product (the funnel), Finance, Paid Ads and Content; Content to
   Paid Ads (organic posts worth boosting); Product & Engineering to Content and Support (what shipped). Market &
   Competitors and Support write theirs from their own weekly runs. Each title carries the week, so nothing doubles.
2. **Routing.** HQ finds the weakest lever on the scorecard and picks up to three playbooks that move it: the one its
   route names, then those that share its number, then those whose own numbers moved the wrong way. Each pick names
   its owner and contributors. A playbook that lost an experiment in the last 8 weeks, or is being tested now, is left
   out. The CEO tab's "Weakest lever this week" finding lists the picks.
3. **Queue.** Every playbook whose trigger fired is queued, at most once per cooldown (a week for signals, two for
   routing, its period for schedules).
4. **Run.** In **ask** mode you press *Run now*; in **auto** mode HQ runs up to its daily limit. A run is Claude Code,
   headless, with the `/hq:playbook` skill: it reads why the playbook started, the owner department's brain and
   earlier runs, works each step, and writes a plan (`plan.md`) and ready-to-use drafts. It can read only its run
   folder and the vault, and write only in its run folder: it never sends, posts, publishes or deploys. HQ checks the
   plan's sections, the Legal check, and that no draft has a dash, then marks it **plan ready**.
5. **Apply or drop.** Read the plan on the Playbooks tab. *Apply* means you're putting it into action (customer-facing
   drafts still go out through their own approval: `/hq:publish`, Email & Lifecycle, the blog and social queues).
   Applying opens an experiment on the playbook's number, from today's reading.
6. **Judge.** Two weeks later HQ reads the number again: a 10% move the right way is **won**, the wrong way **lost**,
   anything smaller **inconclusive**. The verdict closes the experiment, becomes a lesson in the brain, and shows on
   the CEO tab. A lost playbook rests for 8 weeks.

## Commands

```bash
npm run hq -- playbook mode <slug> off|ask|auto [--per-day N]
npm run hq -- playbook skip <slug> "<workflow title>" [--remove]   # never automatically, for this business
npm run hq -- playbook rule <slug> "<house rule>" [--remove]       # every run must follow it
npm run hq -- playbook tick <slug|--all> [--dry-run]               # what the daily job does
npm run hq -- playbook show <slug>
npm run hq -- playbook explain <slug> <workflow-slug>
npm run hq -- playbook queue <slug> <workflow-slug>                # start one by hand
npm run hq -- playbook run <slug> <run-id> [--again]                # --again redoes a ready run (new house rules)
npm run hq -- playbook plan <slug> <run-id>
npm run hq -- playbook apply <slug> <run-id> [--note "…"]
npm run hq -- playbook drop <slug> <run-id> [--note "…"]
npm run hq -- signals write <slug|--all> [--dry-run]
```

Runs live in `$HQ_DATA/businesses/<slug>/playbooks/runs/<id>/`. Ready plans and drafts are copied to the owner
department's folder in the vault (`Departments/<department>/Playbook runs/`), and the run list to
`Departments/Operations/Playbook runs.md`.

## What shipped: the engineering adapter

Product & Engineering's weekly signal comes from a private, read-only adapter, like the scorecard's. Put
`engineering-connection.json` in the business's data folder:

```json
{ "command": ["/path/to/node", "/path/to/engineering-adapter.mjs"], "readOnly": true }
```

HQ sends `{ "since": "<ISO>", "until": "<ISO>" }` on stdin. The adapter prints
`{ "shipped": [{ "title": "…", "url": "https://…", "at": "<ISO>", "area": "Web" }] }`: merged changes in that window,
at most 200, titles up to 200 characters, https links only. A typical adapter lists merged pull requests with the
GitHub CLI. It must not print secrets or customer data.

## Done when

- [ ] The business's mode is set (`ask` to start), anything it must never run is on its skip list, and anything a
      run must never propose is a house rule.
- [ ] `playbook tick` shows signals filed, the weakest lever and its picks.
- [ ] One run has a plan ready, and you've read it.
- [ ] One applied run has an experiment with a review date.

## Good to know

- Each run costs a few dollars of Claude Code at most. Auto mode's daily limit (`--per-day`, default 2) caps it.
- A failed run keeps its files and says why; *Run again* starts clean.
- Off still writes signals, routing and verdicts; it only stops queueing. A business that has never had a mode set is
  left out of the daily tick entirely.
