# Customer lifecycle

The emails and messages a business sends on its own when a customer does something, or stops: getting started, a check-in when a member goes quiet, one email after an abandoned checkout. HQ never sends them itself. Each business keeps its own engine; HQ reads it through a private adapter, shows what it did, and passes the owner's decisions back (approve, test, mode, pause).

## Where things are

| You want to | Go to |
|---|---|
| See what needs you, across every flow | `/lifecycle`, the lifecycle centre. "Needs you" lists drafts (and when they expire), week-one decisions and problems. |
| Read a flow's email, approve it, send yourself a test | The flow's workflow page, `/workflows/<slug>`, under "The message". The only place to approve and test. |
| Switch a flow off, to draft or to auto | The same page, in the week-one review. The only place to change a mode. |
| Stop everything at once | "Pause all" on the lifecycle centre. "Start again" brings every flow back in draft, never straight to auto. |
| Customer stages, the brand's email templates, per-account rows | The Email & Lifecycle department, `/email`. |
| Do any of it from a terminal or a Claude session | `npm run hq -- lifecycle …` (below) or `/hq:lifecycle`. |

Every flow page answers three questions at the top: **is it working**, **what's waiting for you** (drafts, and when the first expires), and **what next**. Under them sits the **week-one review**: what went out, how it landed, the outcome against the holdout, and a recommendation (switch to auto, keep in draft, or turn off) with its reason.

## The words

- **Draft**: each batch waits for the owner's yes. **Auto**: goes out on its own. **Off**: nothing is planned or sent. **Always on**: the flow has no draft step (for example personal alerts, or a business whose engine sends without asking); pausing is the only way to stop it.
- **Holdout**: a random share of the people who qualify (20% by default) get nothing, so the gap between the two groups is what the message did.
- **Lift**: emailed minus held out, in percentage points. 30% against 20% is +10 pts.
- **Too few to call**: either group has fewer than 20 people, so a gap is noise.
- **Outcome window**: we count an outcome if the person did it within this long of qualifying. The page says the day the first reading lands ("First reading Mon 12 Oct").
- **Not a fair test**: a flow with no holdout compares people it messaged with people it didn't, who differ in more than the message. Read it as a hint.
- **Delivered**: the receiving mail server accepted it. **No receipt yet**: sent, receipt not back (they arrive within about 30 minutes). **Bounced**, **marked as spam**, **unsubscribed**: that person never gets another email from the flow.
- **Live** / **in part** on the Workflows tab: live means proven running (its own messages delivered, or its checks passed, recently); in part means some steps run and the rest aren't built yet.

## The week-one review

A flow's week one starts the day its first message is sent and lasts 7 days. Until then, and during it, the recommendation is to keep it in draft. After it:

1. A spam complaint, or 2 or more unsubscribes above 5% of those delivered: **turn off** (fix the wording or the audience first).
2. Fewer than 5 sent: **keep in draft another week**.
3. 2 or more bounces above 5% of at least 10 sent: **keep in draft** and check the next batch lands.
4. A gap against the holdout that is big enough to call and negative: **turn off**.
5. Otherwise: **switch to auto**. The holdout keeps measuring after the switch.

Nothing switches by itself. The owner says yes, then a person or a Claude session changes the mode.

## From a terminal

```bash
npm run hq -- lifecycle show <slug> [flow]          # reads fresh: needs you, then each flow's three answers
npm run hq -- lifecycle explain <slug> <flow>       # plain-text summary: who, mode, numbers with periods, week one, recommendation
npm run hq -- lifecycle approve <slug> <message>    # dry run: who is waiting, when it expires, the exact command to send
npm run hq -- lifecycle approve <slug> <message> --yes --before <ISO from the dry run>
npm run hq -- lifecycle test <slug> <message>       # one [Test] copy to the owner only
npm run hq -- lifecycle mode <slug> <flow> off|draft|auto   # auto needs --yes
```

A flow can be named by its flow id, one of its message ids, or the slug of the workflow it serves. Reading (`show`, `explain`) never changes anything. `approve` sends only drafts planned before `--before`, the snapshot time the owner looked at, so anything planned since waits for the next look.

## Naming

One scheme for every business, so a page, the CLI and a Claude session mean the same thing by an id:

| Thing | Rule | Examples |
|---|---|---|
| Flow id | lower-case words joined by hyphens | `onboarding`, `churn`, `checkout`, `habit-alerts` |
| Message id | the flow id, or the flow id + `-` + a step | `onboarding-d0`, `churn-quiet`, `checkout-recovery` |
| `serves` | the exact title of a workflow on the Workflows tab | `Abandoned checkout recovery` |
| Page | `/workflows/<slug of the title>` | `/workflows/abandoned-checkout-recovery` |

Common flows use common ids: abandoned checkout is flow `checkout` with message `checkout-recovery`; getting started is flow `onboarding`. `hq lifecycle show` lists every naming problem it finds. If a business's engine uses other ids, the adapter renames them on the way out (and back on the way in); the engine doesn't have to change.

## Write an adapter for a new business

Start from `templates/lifecycle/lifecycle-template.mjs`: it runs as is on invented data and keeps the whole contract. Copy it to `$HQ_DATA/businesses/<slug>/lifecycle-adapter.mjs`, never into this repository, and replace `loadStore`, `saveStore` and `render` with reads and writes against the business's own engine. Then point HQ at it:

```json
{"command":["/absolute/path/to/node","/absolute/path/to/lifecycle-adapter.mjs"]}
```

saved as `$HQ_DATA/businesses/<slug>/lifecycle-connection.json`. Add `"readOnly": true` for an adapter that only reports; HQ then hides every button and refuses writes server-side.

**Input.** One JSON object on stdin, at most 2 KB:

| `action` | Fields | What the adapter does |
|---|---|---|
| `report` | | Nothing. Returns the snapshot. |
| `approve` | `workflow` = message id, `before` = ISO time | Approves that message's drafts planned up to `before`. |
| `test` | `workflow` = message id | Queues one copy for the owner only, marked [Test]. Never counted as a send. |
| `mode` | `workflow` = flow id, `mode` = `off`, `draft` or `auto` | Switches the flow. |
| `pause` / `resume` | | Every flow off / back to draft. Resume never jumps to auto. |

**Output.** One version-1 snapshot (`LifecycleSnapshot` in `lib/lifecycle.ts`) on stdout, after any action. On failure, exit 1 with one line on stderr naming the step, never a credential or a provider's response body. The parts that matter most:

- `observedAt`: when the source was read, not when the adapter ran.
- `supports`: the write actions the adapter accepts, for example `["pause","resume"]`. HQ hides the others and refuses them before running the adapter. Leave it out only if the adapter accepts them all.
- `workflows`: one entry per message (the controls): `id`, `label`, `serves`, `sent30d`, `lastSentAt`, `drafts`, and `expiresAt` (when the oldest waiting draft expires unsent; this is what "expires Tue 6 Oct, 4:12 pm" reads).
- `flows`: one entry per flow, as the lifecycle centre shows it:
  - `id`, `label`, `serves`, `channel`, `trigger` (who qualifies, in plain words), `mode` (leave out for always on), `holdoutPct`
  - `since`: the day (business time zone) its counts start. Without it HQ uses the first day anyone qualified.
  - `daily`: per day, `entered` (qualified), `sent`, `skipped` (or expired)
  - `delivery`: rows labelled `sent`, `delivered`, `bounced`, `complained`, `unsubscribed`, `clicked`, `failed`. Leave out a row you don't measure (an always-0 `opened` reads as a reading).
  - `skips`: why people were skipped, in plain words
  - `outcomes`: `label`, `window` ("7 days"), `emailed {n, hit}`, `holdout {n, hit}` counting only people who have reached the window
  - `messages`: the real rendered email per message id (shown in a sandboxed frame)
  - `replies`: a count only if the adapter can read the inbox; leave it out otherwise and HQ says it can't see replies.

Only aggregates and pseudonymous references. No email addresses, names, phone numbers or provider ids; HQ rebuilds the snapshot from allowed fields and stores it owner-only. Never put a credential in the command; read it at run time from the Keychain or the business's own secret store, and never print it.

**Tests.** `tests/lifecycle-contract.test.ts` runs the template through HQ's own runner and checks the naming, `supports`, approve-what-you-saw and that tests don't count. Run the same checks against a new adapter on a copy of its data before connecting it.

## Workflow checks

Some workflows send nothing (search pages, measurement), so they prove themselves with checks. A checks adapter answers pass or fail per check from public pages or HQ's own files:

```json
{"version":1,"observedAt":"<ISO>","workflows":[{"title":"<workflow title>","checks":[{"label":"…","ok":true,"detail":"…"}]}]}
```

Start from `templates/lifecycle/workflow-checks-template.mjs` (page contains, or a pattern counted at least N times, from a `checks.json`). Connect it with `$HQ_DATA/businesses/<slug>/workflow-checks-connection.json` (`readOnly: true`); `npm run hq -- workflows check <slug>` runs it, and the daily scorecard refresh runs it after the scorecard. A workflow is live only when every check passed in the last 8 days; a check that never ran is not a pass.

## Rules that keep this safe

- Nothing new reaches a customer without the owner's yes: new flows ship in draft, auto needs an explicit yes, and the CLI's approve is a dry run until `--yes --before`.
- Drafts expire (typically 36 hours to 3 days past due) so stale news never goes out late. Approve before the expiry the page shows, or let them go.
- Owner tests go to the owner only and never count.
- Approve only from a fresh read: the page refuses a read over 5 minutes old, and the CLI reads fresh before every command.
- Reported acceptance by an email provider is not delivery; only a receipt is.
- Enrolment is not a send. Prove a flow from its last send, not from how many people it has enrolled.
