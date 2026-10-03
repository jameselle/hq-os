---
name: setup
description: >
  Walk an owner through setting up HQ end to end, or one part of it: install HQ, add a business, back it up,
  then each department in order, using the guide for every step and checking what's already done first. Use
  when the user says "/hq:setup", "set up HQ", "help me get started", "I'm new to HQ", "add my business and
  set it up", "set up the <department> department", "connect Stripe/the App Store/my database", "what's left to
  set up", or after /hq:new-business finishes.
---

# Setup

Every part of HQ has a guide in `docs/guides/`, readable in HQ at http://127.0.0.1:3150/guides. Each one is
written for this: an AI walking an owner through it, top to bottom, checking each step before the next.
`lib/guides.ts` lists them (one per department, plus start-here, the CEO, workflows, the scorecard and its
connections). Run commands from `$HQ_ROOT` (default `~/business-os`).

## Rules

- **Check before asking.** Read the state first; never ask the owner something HQ can tell you.
- **Ask only for what only they can do:** install an app, create or sign in to an account, choose, approve a
  cost, approve anything that goes out.
- **Never ask for a password, key or token in chat.** Secrets go into the macOS Keychain with the guide's
  `security add-generic-password ... -w` command, typed by the owner. Read keys only inside scripts, never print them.
- **Free tools only**, installed with `/hq:add-tool`. Never sign up for a service on the owner's behalf.
- **One step at a time.** Confirm each step worked (the guide's check) before the next. Finish every guide on its
  "Done when" checklist and tick what's done.
- **Production changes need a yes** (database migrations, deploys, anything customers see).

## 1. Where are we?

```bash
npm run hq -- doctor            # install, site, backups, services
npm run hq -- list              # businesses
curl -s http://127.0.0.1:3150/api/status   # departments, readiness, tools, findings for the current business
```

- If HQ isn't installed or `doctor` fails: follow `docs/guides/start-here.md` section 1.
- If there's no business, or the owner wants another: run `/hq:new-business`, then come back here.
- If backups aren't set up (doctor or a red CEO finding says so): `/hq:backup` first, before anything else.

## 2. Pick what's next

If the owner named a department or connection, do that guide. Otherwise go in the order of
`docs/guides/start-here.md` section 4, skipping departments the business profile skips, and start with the first
one that isn't done. A department is done when its tab shows **equipped** and its guide's "Done when" is ticked.
Tell the owner the plan in one line ("Next: Finance, about 10 minutes, then Data").

## 3. Walk the guide

Open the guide (`docs/guides/<slug>.md`) and follow it section by section:

1. **Before you start**: confirm each item, or do the guide it links first.
2. **Tools**: for each needed tool not yet live, use `/hq:add-tool`, or the owner's sign-up for a web service.
   Group alternatives need just one; optional tools wait until the guide says they're worth it.
3. **Accounts and connections**: the owner connects; HQ records ids and statuses only.
4. **Skills**: run the one-time ones the guide names (for example `/hq:competitors setup`).
5. **Check it's working**: run every check in the guide and show the owner the result.
6. **Done when**: tick each item, or note what's left and why.

## 4. Record progress

After each guide, save a short note to the business's vault so a later session picks up where this one stopped:

```bash
printf '%s\n' "# Setup: <guide title>" "" "Done <date>: <what's set up>" "Left: <anything not done, and why>" \
  | npm run hq -- save-plan <slug> <department> -
```

Then go back to step 2. When every department the business runs is done, run `/hq:ceo` for a first full review
and show the owner the CEO tab.
