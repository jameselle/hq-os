# People & HR: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** hires, onboards and pays people and contractors properly. It stands in for a
people or HR lead.

**It covers:** job posts and screening, onboarding, payroll, super and STP (Single Touch Payroll reporting),
capacity planning.

**Owner's time:** about 10 minutes to set up; the skills do the rest when there's a hire or a pay run.
**Cost:** free.

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar.
- **Decide whether this business needs People at all.** A solo business with no staff or contractors can skip
  it: add `people` to `departments.skip` in the profile, and HQ stops showing and planning it.
- Books first (see [Finance](/guides/finance)): payroll costs land in the accounts, and Frappe HR runs on
  ERPNext, which is a Finance tool.

## 1. Tools

The department tab is http://127.0.0.1:3150/people. It lists one tool, and it's only worth installing once
there's a payroll to run.

### Frappe HR

- **What it's for:** HR and payroll. It runs on top of ERPNext.
- **Needed or optional:** listed as needed, but until there are employees on payroll the skills below cover
  the work from pasted text and files. Install it only if Finance runs ERPNext, or the business is about to
  employ people.
- **Licence or plan:** open source, GPL-3.0.
- **Set it up:** `/hq:add-tool` for Frappe HR, alongside ERPNext. It's a server: install from source (no Docker,
  no Homebrew), bind it to 127.0.0.1, and run it as a `com.hq.*` service with
  `npm run hq -- services add-defaults && npm run hq -- services install`. If there's no way to run it without
  Docker on this Mac, stop and tell the owner rather than working around the rule.
- **How HQ checks it:** no live check is defined yet, so the tab shows it as missing even when installed.
  `/hq:add-tool` adds a `port` check to `lib/registry.ts` when it installs it.

## 2. Accounts and connections

None in HQ. Payroll filing (STP), super and tax accounts belong to the owner and are signed into by them, on
the government or provider site, never by Claude. HQ stores no employee records: anything personal stays in
the payroll tool or the owner's own files, not in the vault or a repo.

## 3. Skills to use

- `/small-business:job-post-builder`: write a job post.
- `/small-business:hiring-screener`: screen applicants against the post.
- `/small-business:payroll-prep`: get a pay run ready for the owner to check and pay.
- `/small-business:plan-payroll`: plan payroll costs before a hire.
- `/operations:capacity-plan`: who has room for what.

There are no `/hq:` skills here. Run `/hq:dept people` for the department's plan for the week.

## 4. Check it's working

- The department tab shows all five skills as ready. If any are missing, the CEO tab's **N expected skills
  aren't installed** finding names them; reinstall the plugin they belong to.
- Until Frappe HR has a live check, the tab grades People as skills-only and the CEO's **N departments run on
  skills alone** finding lists it. That's expected for a business without a payroll; leave it, or mark it done
  on the CEO tab.
- This shows the department's state:

  ```bash
  curl -s http://127.0.0.1:3150/api/status | jq '.departments[] | select(.slug=="people") | {active, grade, skills: [.skills[] | {id, ready}]}'
  ```

  `active` is `false` if the profile skips People.
- `/hq:dept people` saves a plan: the newest file in `$HQ_DATA/businesses/<slug>/plans/people/`.

## Done when

- [ ] The owner has decided: People is active, or `people` is in the profile's `departments.skip`.
- [ ] If active, all five skills show as ready on the department tab.
- [ ] If there's a payroll, Frappe HR is installed with ERPNext and running as a `com.hq.*` service.
- [ ] `/hq:dept people` has saved this week's plan (if active).

## Good to know

- Payroll, super and STP rules are country-specific (they're Australian terms). The skills give a first pass;
  the owner or their accountant checks every pay run.
- Nothing is paid, filed or sent (offers, rejections, pay runs) without the owner's explicit yes.
- Keep applicants' and employees' personal data out of chat transcripts, the vault and any repo.
- Free tools only, installed from checksum-verified releases or source: never `curl | sh`, no Homebrew, no
  Docker on the Mac. Servers bind to 127.0.0.1.
