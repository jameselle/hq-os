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

- **The web:** every hand-off between departments, coloured by lever. Click a department to see what it sends
  and receives.
- **Loops:** chains of hand-offs that repeat every week, such as the insight loop
  (complaints and rival moves → product → content → the right email segment).
- **The workflow catalogue:** each workflow has one **owner**, its contributors, a **trigger**, ordered
  **steps** and the **metric** it moves. Departments your business skips are greyed out.

## How to use it each week

1. The CEO tab does the first step for you: the finding **"Weakest lever this week"** compares each headline number
   on the [scorecard](/guides/scorecard) with its own 4-week average (and a few hard limits, such as weekly churn above
   5%), picks the worst, and names the workflow that moves it and that workflow's owner.
2. Tell Claude: **"run the <workflow> workflow"**. It names the owner, then works each step with the
   department's tools and skills, asking you before anything customer-facing ships.
3. Log what you're trying, so next week's review can see it worked or not:
   `npm run hq -- experiment add <slug> "<hypothesis>" --metric <metric id> --baseline <this week's value>`.
   Close it when you know: `npm run hq -- experiment close <slug> <id> won|lost|inconclusive --result <value>`.
   The log is mirrored to the business's vault (`Departments/Data & Analytics/Experiments.md`).
4. To build a workflow that isn't running yet, or to get HQ to see one that already runs, follow
   [Set up a workflow end to end](/guides/workflow-setup).
5. Next week, check the metric on the scorecard. A routed lever that recovers drops off the CEO tab by itself.

## Done when

- [ ] You can name this week's weakest lever and the workflow aimed at it.
- [ ] That workflow has one named owner.
- [ ] Its metric is on the scorecard, or the scorecard's missing-number note says what's needed to measure it.

## Good to know

- Every customer-facing workflow has a Legal step (claims, regulated-industry rules, consent).
  See [Legal & Compliance](/guides/legal).
- Finance caps any paid spend by payback time. See [Finance](/guides/finance).
- The examples on the tab are generic on purpose; your business's specifics live in its profile and vault.
