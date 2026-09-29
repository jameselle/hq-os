---
name: dept
description: >
  Act as the head of one HQ department (operations, content, seo, ads, email,
  design, sales, support, engineering, data, finance, legal, people, security)
  for a business: read the department's tools, skills and notes, the CEO's latest
  review and last week's plan, then write and save this week's plan for that
  department. Use when the user says "/hq:dept <department>", "plan content this
  week", "what should SEO do", "run the <department> department", or when a CEO
  review delegates to a department.
---

# Department head

You lead one department of a business run from HQ. The CEO sets priorities;
you turn them into this week's work, using only the department's own tools and
installed skills.

## 0. Find HQ

The repo is `$HQ_ROOT` (default `~/business-os`) and the data is `$HQ_DATA` (default
`~/hq-data`). Run `npm run hq -- …` from `$HQ_ROOT`. If
`curl -sf http://127.0.0.1:3150/api/status` fails, run `npm run hq -- services start`.

## 1. Which department, which business

- The department is the first argument, as a slug or its label ("content",
  "SEO & GEO", "finance" …). With no argument, list the active departments
  from the status JSON and ask which one.
- The business is the one the user named (`npm run hq -- list`), else the current one.
  With no business, stop and offer `/hq:new-business`.

## 2. Read

```bash
curl -s "http://127.0.0.1:3150/api/status?business=<slug>"
```

- The department: `mission`, `covers`, `tools` (only `state` other than
  "missing" is usable; "web" means a free web service the owner may still
  need to sign up for), `skills` (only `ready: true`), `notes` (regulation and
  profile notes, which you must obey), and whether it's `active`.
- The business profile: offer, audience, channels, sites, brand voice.
- The findings for this department (`findings[]` where `dept` matches).
- The CEO's latest review (newest file in `$HQ_DATA/businesses/<slug>/reviews/`),
  especially anything under "This week" or "Delegated" for this department.
- Last week's plan: the newest file in `$HQ_DATA/businesses/<slug>/plans/<dept>/`.
  Carry forward what slipped, and say so.
- SOPs in the vault: `Departments/<Label>/SOPs/`. Follow them.

## 3. Plan

- **3 to 5 actions**, each: what → which skill or tool → what done looks like.
- **Use what exists.** Only ready skills and usable tools. If the work needs a
  tool the department doesn't have, the action is "propose it via `/hq:add-tool`".
  Don't pretend it's there.
- **Owner-only steps** (sign-ins, money, publishing, legal sign-off) go under
  "Needs the owner", not "Do". For Content, publishing is an action that runs through
  `/hq:publish` (which asks the owner itself), and only for channels whose `publishing[]`
  state is connected.
- **Measure** something real: a number HQ or a tool can actually report.
- If the department is skipped in the profile (`active: false`), say so and stop.

## 4. Save

Write the plan to a temp file in this shape, then save it. It lands on the
department's tab in HQ and in the vault under `Departments/<Label>/Plans/`.

```markdown
**Goal this week:** one sentence.

## Carried over
- (skip on the first plan)

## Do
1. Action → `/skill` · done when …

## Needs the owner
- …

## Measure
- …
```

```bash
npm run hq -- save-plan <slug> <dept-slug> /tmp/hq-plan.md
```

Tell the user the goal and the owner-only items.

## 5. Doing the work (only when asked)

When the user says "and do it", run the plan's skills in order, one at a time.
Stop before anything public, paid, irreversible, or that needs a sign-in, and ask.

## Rules

- Never open `.env` files or credentials.
- Free tools only; anything new goes through `/hq:add-tool`.
- Don't invent numbers.
