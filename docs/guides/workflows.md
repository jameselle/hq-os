# Workflows: how the departments work together

> **If you are an AI walking an owner through this:** start from the scorecard. Find the weakest lever
> (the worst number against last week), pick the workflow on this tab that moves it, and walk its steps
> department by department. Each workflow has ONE owner: name them before starting. Ask the owner before
> anything customer-facing goes out.

No department works alone. The Workflows tab (under CEO in the side bar) maps how each department turns what
it learns into a signal another department acts on.

## The three levers, and the foundation

- **Get customers:** find demand, win attention, convert it.
- **Keep customers:** get them to first value fast, deliver it, catch churn early.
- **Expand revenue:** upgrades, add-ons, annual plans, teams.
- **Foundation:** claims and compliance, budget, uptime, measurement and follow-through.

Most departments serve two or three levers. Content wins customers *and* teaches existing ones; Support keeps
customers *and* spots upgrades; Market & Competitors feeds the product roadmap, which keeps customers.

## What's on the tab

The page has a tab per section (the address keeps it, such as `/workflows?tab=web`):

- **Running now:** the workflows that already run for this business, with the record that proves it.
- **Playbooks:** this week's routing, plans waiting for you, queued and applied runs. See [Playbooks](/guides/playbooks).
- **All workflows:** the catalogue. Each workflow has one **owner**, its contributors, a **trigger**, ordered
  **steps** and the **metric** it moves. Departments your business skips are greyed out.
- **Who feeds whom:** every hand-off between departments, coloured by lever, and the same list as a table. Click a
  department to see what it sends and receives; click a row of the table to read what was actually handed over.
- **Loops:** chains of hand-offs that repeat every week, such as the insight loop
  (complaints and rival moves → product → content → the right email segment).
- **The brain** and **Build order** (where this business stands on each step).

Each department's own page shows its **growth levers**: the workflows it owns and helps with, per lever.

## How to use it each week

1. The CEO tab's finding **"Weakest lever this week"** compares each headline number on the
   [scorecard](/guides/scorecard) with its own 4-week average (and a few hard limits, such as weekly churn above 5%),
   picks the worst, and names up to three playbooks that move it, each with its owner and contributors.
2. With playbooks on, HQ has already queued them. Run one on the Playbooks tab (or tell Claude **"run the <workflow>
   workflow"**), read its plan, and apply it. Applying logs the experiment for you; HQ judges it two weeks later.
3. To log a change you made by hand: `npm run hq -- experiment add <slug> "<hypothesis>" --metric <metric id>
   --baseline <this week's value>`, and close it with `npm run hq -- experiment close <slug> <id> won|lost|inconclusive
   --result <value>`. The log is mirrored to the vault (`Departments/Data & Analytics/Experiments.md`).
4. To build a workflow that isn't running yet, or to get HQ to see one that already runs, follow
   [Set up a workflow end to end](/guides/workflow-setup).

## Done when

- [ ] You can name this week's weakest lever and the workflow aimed at it.
- [ ] That workflow has one named owner.
- [ ] Its metric is on the scorecard, or the scorecard's missing-number note says what's needed to measure it.

## Good to know

- Every customer-facing workflow has a Legal step (claims, regulated-industry rules, consent).
  See [Legal & Compliance](/guides/legal).
- Finance caps any paid spend by payback time. See [Finance](/guides/finance).
- The examples on the tab are generic on purpose; your business's specifics live in its profile and vault.
