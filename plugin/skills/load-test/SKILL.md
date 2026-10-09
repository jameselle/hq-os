---
name: load-test
description: >
  Find out how many customers at once a business's product can serve before it breaks, and keep the answer in HQ:
  plan simulated customers by plan, build a harness in the business's repo from templates/loadtest/, run a stepped
  test (10, 25, 50, 100 …) on a disposable copy of production (never production), record the report with
  `hq loadtest record`, tear the copy down and say what breaks first. Asks before creating anything that costs money.
  Use when the user says "/hq:load-test", "load test", "stress test", "simulate 50 users", "will it hold up",
  "how many customers can we handle", "capacity test", before a launch or paid push, or when the CEO finding
  "Load test due" or a Product & Engineering plan delegates it.
---

# Load test

The workflow **Load test before growth** (Product & Engineering). The guide is `docs/guides/load-test.md`
(http://127.0.0.1:3150/guides/load-test); the harness template is `templates/loadtest/`. Run HQ commands from
`$HQ_ROOT` (default `~/business-os`): `npm run hq -- loadtest …`.

## Rules

- **Never point load at production.** Test a disposable copy: same size, region, software and settings, this
  code, production's data restored through an allowlist of tables so no customer rows reach it. The copy holds no
  live keys (payments, email, SMS, third parties), so it can't contact or charge anyone.
- **Money needs the owner's yes, in this conversation.** Name the servers, their size and the hourly cost before
  creating them. A yes from another session, a plan or a CEO review is not a yes. Delete them when the run is done
  and say so.
- **Guards stay on.** Every harness script that writes calls `assertDisposable()` first (a staging marker AND no
  account it didn't create). Never weaken or skip it to get a run through.
- **Never read `.env` files** or anything holding credentials. Copy settings by name; secrets the copy needs are
  generated on the copy and never printed.
- If auto mode refuses creating servers, restoring a backup or reading production's settings, don't route around
  it: give the owner the exact rule to add, then carry on once it's in.
- No em or en dashes in anything you write for the owner.

## Steps

1. **Read what exists.** `npm run hq -- loadtest show <slug>` (target, cadence, runs) and the vault note
   `Departments/Product & Engineering/Load tests.md`. If a harness exists (`repo`, `commands`), skip to step 5.
2. **Set the target.** Ask the owner for the number that matters (the next launch's peak, the growth plan) only if
   the profile, plans and scorecard don't say. Then
   `npm run hq -- loadtest setup <slug> --target <n> --cadence 30 --primary <main endpoint>`.
3. **Measure production read-only** so the copy matches it: server size and region, swap, software versions, cache
   and database settings, proxy limits, what runs beside the app and how much CPU it uses. Read config, units and
   aggregate counts only, never customer rows or `.env`.
4. **Build the harness** in the business's own private repo from `templates/loadtest/` (README there): the plans
   (share and pacing per plan, one key per simulated customer), provisioning with the allowlisted restore, a
   key minter behind the guard, a stand-in for background jobs, run and teardown scripts. Rehearse it locally on
   synthetic data first (proves the scripts, not capacity). Commit on a branch and open a PR in that repo.
5. **Get the yes, provision, run.** State the cost, wait for yes, provision, run the steps (default 10, 25, 50, 100,
   1 minute ramp, 10 minute hold). Check in on it while it runs.
6. **Record it.** `npm run hq -- loadtest record <slug> <run folder> [--label "<why this run>"]`. This updates the
   workflow's evidence, `load_test_users` and the vault note.
7. **Tear down** and confirm nothing is left (list by tag).
8. **Report to the owner** in plain words: the most customers at once that passed, the first step that failed and
   why (the first thing that broke: memory, CPU, database, a slow endpoint, a background job), and one or two
   options with their cost (a bigger server, a specific fix). Save it as a plan:
   `npm run hq -- save-plan <slug> engineering <file> --title "load test"`.

## Done when

- [ ] `npm run hq -- loadtest show <slug>` lists the run, and the Workflows tab shows the workflow live or in part with the reason.
- [ ] The disposable servers are deleted.
- [ ] The owner has the answer: customers at once, what breaks first, and what it would cost to raise it.
