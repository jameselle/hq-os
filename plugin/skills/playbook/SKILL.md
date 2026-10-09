---
name: playbook
description: >
  Run one HQ playbook for a business: read why it started (a signal from another
  department, a schedule, the CEO's routing or an alarm), work through its steps
  department by department, and write the plan and ready-to-use drafts the owner
  approves. Also shows, approves, applies and drops playbook runs. Use when the
  user says "/hq:playbook", "run the <workflow> workflow", "run that playbook",
  "what playbooks are waiting", "apply that run", or a CEO finding routes a
  playbook to a department.
---

# Run a playbook

A playbook is one workflow from the Workflows tab that HQ can start on its own. HQ queues a run when its trigger
fires; this skill does the work of the run. **Nothing in a run reaches a customer.** You write plans and drafts; the
owner applies them, and anything customer-facing still goes out through its own approved route (`/hq:publish`,
`hq lifecycle approve`, the blog and social queues).

## When HQ runs you headless

HQ gives you one run folder and these rules:

1. Read `inputs.json` in the run folder first. **`houseRules` are the owner's standing rules for this business and
   beat everything else**, including a step of the playbook: never propose anything they rule out, not even as an
   option. If a step can't be done within them, say so in that step. It holds the business, the playbook (owner, contributors, ordered
   steps, the number it should move and its current value), **why it started** (the signal notes in full, the CEO's
   routing reason, or the alarm), what the owner's department already knows (its brain), earlier runs of this
   playbook and how they were judged, and experiments that lost (don't repeat them).
2. Work the steps in order. For each step, write what that department does **for this business this week**, with
   the concrete output: the email copy, the post or page draft, the query to run, the screen change spelled out.
   Use the evidence in the inputs; search or fetch the web only to check a fact or a rival's public page.
3. Write `plan.md` in the run folder:
   - `# <playbook title>` then one paragraph: what changes and why now (cite the trigger).
   - `## Steps`: one `### <Department>: <what it does>` per step, each with its output or a link to a draft file.
   - `## Legal check` whenever any step reaches customers: every claim, number, notice and screenshot, and whether
     it can be proved. Gambling, finance and health businesses: responsible-gambling or regulatory notices, and no
     promise of profit or results.
   - `## The owner's call`: the decisions only the owner can make, as a short list.
   - `## How we'll know`: the target number, today's value, and what would count as working in two weeks.
4. Put each ready-to-use draft in its own file in the run folder (`draft-<n>-<what>.md`). Drafts follow the
   business's brand voice. **No em dashes or en dashes in any draft**; HQ refuses the run if it finds one.
5. Write `result.json`:
   ```json
   { "summary": "One paragraph for the owner.",
     "hypothesis": "If we <change>, <number> will <move> because <reason>. (One sentence, under 250 characters.)",
     "ownerActions": ["Approve draft-1 in Email & Lifecycle", "…"],
     "deliverables": [{ "title": "Win-back email", "file": "draft-1-win-back-email.md" }] }
   ```
6. Stop. Don't post, send, publish, deploy, change billing or write anywhere outside the run folder.

Never invent numbers, customers or quotes. If the inputs don't hold what a step needs, say what's missing in that
step and what would measure it.

## When the owner asks in Claude Code

```bash
npm run hq -- playbook show <slug>                     # routing, queued, ready and applied runs
npm run hq -- playbook explain <slug> <workflow-slug>  # trigger, steps, guard rails, target number
npm run hq -- playbook queue <slug> <workflow-slug>    # start one by hand (reason: the owner)
npm run hq -- playbook run <slug> <run-id> [--again]   # do a queued run now; --again redoes a ready one
npm run hq -- playbook apply <slug> <run-id> [--note "…"]   # opens the experiment on its number
npm run hq -- playbook drop <slug> <run-id> [--note "…"]
npm run hq -- playbook mode <slug> off|ask|auto        # ask: HQ queues, the owner says run; auto: HQ runs up to perDay a day
npm run hq -- playbook tick <slug|--all>               # signals, routing, queue, judge experiments (daily in com.hq.scorecard)
```

Read a run's `plan.md` with the owner before applying it. Applying opens an experiment on the playbook's number;
HQ judges it two weeks later and files the lesson in the brain, so the next review knows whether it worked.
