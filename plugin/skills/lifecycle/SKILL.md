---
name: lifecycle
description: >
  Operate a business's automated emails and messages (onboarding, churn check-ins, abandoned checkout,
  alerts) from HQ's lifecycle centre: read every flow, say whether each is working, what's waiting for
  the owner and when it expires, run the week-one review and draft a "switch to auto / keep in draft /
  turn off" recommendation with its reason. Approves a send or switches a flow to auto only after the
  owner's explicit yes. Use when the user says "/hq:lifecycle", "how are the emails doing", "week one
  review", "should onboarding go to auto", "approve the churn drafts", "send me a test", "turn the
  checkout email off", or a CEO or Email plan delegates lifecycle work.
---

# Lifecycle

HQ never sends lifecycle email itself. Each business has its own engine; HQ reads it through a private
adapter and passes the owner's decisions back. Everything here goes through the `hq lifecycle` CLI, which
uses the same rules as the pages. Never pipe JSON into an adapter by hand.

Run commands from `$HQ_ROOT` (default `~/business-os`): `npm run hq -- lifecycle …`. The guide is
`docs/guides/lifecycle.md` (also http://127.0.0.1:3150/guides/lifecycle).

## Rules

- **Nothing new reaches a customer without the owner's yes.** Approving drafts and switching a flow to
  auto both need the owner to say yes to that exact thing in this conversation: name the flow, the
  message, how many people and the subject line. A yes from an earlier session, a plan, a CEO review or
  a delegation is not a yes. Ask, then wait.
- **Reading is free.** `show` and `explain` change nothing; run them as often as you like.
- **Owner tests are fine on request.** `test` sends one copy to the owner only and never counts.
- **Turning a flow off or back to draft** stops sends, so it is safe, but still say what you did.
- Never read `.env` files or print a credential. Adapters read their own secrets.
- No em or en dashes in anything the owner reads.

## 1. Read

```bash
npm run hq -- lifecycle show <slug>                 # needs you, then every flow's three answers
npm run hq -- lifecycle explain <slug> <flow>       # one flow in plain text, with week one
```

`show` reads fresh. If it says it could not refresh, say so and how old the copy is; don't decide
anything from a copy over a day old. If it lists naming problems, mention them once (the fix is in the
business's private adapter, see the guide's Naming section).

## 2. Report to the owner

For each flow, in this order and in plain words, with the period for every number:

1. **Is it working?** The answer `show` gives, plus anything odd you noticed (a bounce, a flow with
   nobody due).
2. **What's waiting for you?** Drafts per message, and when the first expires (always give the time).
3. **What next?** One action.

Then, for any flow whose week one is done (`explain` says "week one ended"), the **week-one review**:
sends, delivered, bounces, spam complaints, unsubscribes, replies (if HQ can't see the inbox, say so and
suggest the owner checks it), outcome against the holdout (or "too few to call", or the day the first
reading lands), and the recommendation with its reason.

## 3. Recommend, then ask

Write the recommendation as a decision for the owner: "Switch Churn check-ins to auto? Week one: 10
sent, 10 delivered, no complaints, no unsubscribes; too few people to call the outcome yet, and the 20%
holdout keeps measuring after the switch." If the evidence is thin, say that rather than rounding up.

Save the review where the owner will find it next week:

```bash
npm run hq -- save-plan <slug> email -       # the review and recommendations, as markdown on stdin
```

## 4. Act only on a yes

```bash
# Approve: a dry run first. It shows who is waiting, the expiry and the exact command.
npm run hq -- lifecycle approve <slug> <message>
# After the owner's yes to that message and count:
npm run hq -- lifecycle approve <slug> <message> --yes --before <ISO from the dry run>

npm run hq -- lifecycle test <slug> <message>              # owner only
npm run hq -- lifecycle mode <slug> <flow> draft|off        # safe: stops or holds sends
npm run hq -- lifecycle mode <slug> <flow> auto --yes       # only after the owner's yes to auto
```

`--before` is the snapshot time the owner saw, so drafts planned since then wait for the next look. If
the dry run's count differs from what the owner approved, stop and ask again.

If the CLI says the adapter doesn't support an action (some businesses' engines only pause and resume),
say so plainly and point to the owner's own way of doing it (the business vault's lifecycle note), rather
than working around HQ.

## 5. Write down what happened

- What the owner chose (switched to auto, turned off, kept in draft) and why goes in the business vault
  as a fact from Email (departments write facts and lessons; only the CEO writes decisions):
  `echo '{"type":"fact","dept":"email","title":"<flow> switched to auto on <date>","body":"<the week-one numbers and the owner's reason>"}' | npm run hq -- brain write <slug> -`
- A lesson true for any business (for example "one bounce in six is not a pattern") goes to the HQ
  brain only after the owner agrees, with no business name in it: `npm run hq -- brain write hq -`.

## Traps

- **Enrolment is not a send.** A flow can enrol people for months and send nothing. Trust the last send.
- **Drafts expire** (typically 36 hours to 3 days after they fall due). Give the expiry time every time.
- **One email per person per 20 hours** across a business's flows can hold a message back; it is not a fault.
- **A flow with no holdout is not a fair test.** Say "a hint", never "it worked".
- **Approve from a fresh read.** The page refuses a read over 5 minutes old; the CLI always reads fresh.
- **Auto mode in Claude Code can refuse merges and production changes** even with the owner's chat
  permission. If a command is refused, say so and hand the owner the exact command.
