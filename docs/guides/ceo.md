# The CEO tab and weekly reviews

> **If you are an AI walking an owner through this:** read the live findings first
> (`curl -s http://127.0.0.1:3150/api/status`), then take them in order: red, amber, then blue. For each one,
> do the step the finding names, or open the guide for its department. Ask the owner only for decisions and
> for things only they can do. Never ask for a secret in chat.

The CEO tab is where you start every day. It reads every department, ranks what needs doing, and keeps the
latest written review beside it.

## What's on the page

- **Growth scorecard** (top): this week's numbers for getting, keeping and expanding customers. See
  [the scorecard](/guides/scorecard).
- **Tiles:** red findings, decisions only you can make, departments equipped, tools running, tools available
  and skills ready.
- **What needs you:** every finding, ranked, each with its department and the concrete next step.
- **Latest CEO review:** the last review `/hq:ceo` wrote, with older ones listed.

## What the colours mean

| Colour | Severity | Means |
|---|---|---|
| Red | critical | Something can be lost or is broken now (for example no backup off this Mac). |
| Amber | attention | Needs fixing soon (a stale backup, a service down, billing and records disagreeing). |
| Blue | decision | Only you can make this call (connect a business, choose a tool, set up an account). |
| Grey | info | Worth knowing, nothing to do yet (a number the scorecard can't measure until history builds). |

## The findings you're most likely to see

| Finding | Department | How it clears |
|---|---|---|
| No business connected yet | Operations | `/hq:new-business` ([Getting started](/guides/start-here)) |
| HQ's data has no backup, or the backup is stale | IT & Security | `/hq:backup` ([IT & Security](/guides/security)) |
| Copy the backup password off this Mac | IT & Security | Save it in your password manager, then mark it done |
| A restore test failed | IT & Security | `/hq:backup`, then `/hq:restore` if needed |
| Channel not connected, or connections unknown or stale | Content & Social | `/hq:connections` ([Content & Social](/guides/content)) |
| No competitors, competitor pages changed, brief due | Market & Competitors | `/hq:competitors` ([Market & Competitors](/guides/competitors)) |
| No analytics tool running | Data & Analytics | Set up web analytics ([Data & Analytics](/guides/data)) |
| No books | Finance | `npm run hq -- finance init <slug>` ([Finance](/guides/finance)) |
| HQ can't see this business's growth | Data & Analytics | Connect the scorecard ([Data & Analytics](/guides/data)) |
| The scorecard is out of date, or its last refresh failed | Data & Analytics | `npm run hq -- scorecard refresh <slug>` and read the error |
| N paying members disagree between billing and our records | Data & Analytics | Fix each member's record, then the webhook that caused it |
| N numbers can't be measured yet | Data & Analytics | Each line names its fix: more history, a missing event, or ad spend in the ledger |
| A department is running on skills alone | that department | Add its tools with `/hq:add-tool` (see the department's guide) |
| Expected skills aren't installed | Operations | `claude plugin marketplace update hq`, then reinstall the plugin |

**Done** on a finding hides it for that business once you've dealt with it, or decided to leave it. A finding
that comes back means its check is failing again.

## Weekly reviews

- **`/hq:ceo`** writes a review: what changed, what needs you, and up to five decisions. It's saved to the
  business's vault and shown on this tab.
- **`/hq:ceo plan the week`** turns the review into a plan, with one owner per action.
- **`/hq:dept <department>`** plans one department's week.

## Done when

- [ ] No red findings.
- [ ] Every amber finding has an owner or a date.
- [ ] A review from `/hq:ceo` is on the tab and less than a week old.

## Good to know

- Findings are recomputed every time the page loads, from live checks, so the page doesn't go stale.
- The CEO never acts on its own: it ranks, explains and plans. You, or Claude with your yes, do the work.
