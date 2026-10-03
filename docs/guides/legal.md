# Legal & Compliance: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** reviews contracts, tracks the rules that apply, and gets things signed. It
stands in for a legal and compliance officer.

**It covers:** contracts and NDAs; privacy and terms; industry rules from the business profile (gambling,
kids, finance, health …); getting things signed.

**Owner's time:** about 10 minutes, mostly confirming the profile's regulated flags. **Cost:** free.

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar.
- **The profile's `regulated` flags are right.** They drive this department's standing notes (and Ads' and
  Content's). Ask the owner directly: does the business touch gambling, kids, finance, health, alcohol or
  adult content? Fix the profile if the answer differs.

## 1. Tools

The department tab is http://127.0.0.1:3150/legal. Its two tools are alternatives: it needs **one e-signature
tool**, DocuSeal or Documenso, and only once there's something to get signed.

### DocuSeal

- **What it's for:** e-signatures (a DocuSign alternative).
- **Needed or optional:** one of the e-signature group (DocuSeal or Documenso).
- **Licence or plan:** open source, AGPL-3.0.
- **Set it up:** `/hq:add-tool` for DocuSeal. It's a server: install from a checksum-verified release or from
  source (no Docker, no Homebrew), bind it to 127.0.0.1, and run it as a `com.hq.*` service with
  `npm run hq -- services add-defaults && npm run hq -- services install`. The owner creates its admin login
  on first visit and keeps it in their password manager.
- **How HQ checks it:** no live check is defined yet, so the tab shows it as missing even when installed.
  `/hq:add-tool` adds a `port` check to `lib/registry.ts` when it installs it.

### Documenso

- **What it's for:** e-signatures, the alternative option.
- **Needed or optional:** one of the e-signature group. Choose one, not both.
- **Licence or plan:** open source, AGPL-3.0.
- **Set it up:** `/hq:add-tool` for Documenso, the same way: from source, bound to 127.0.0.1, run as a
  `com.hq.*` service. If it needs a database, give it its own, the way Twenty CRM got its own Postgres
  (see [Product & Engineering](/guides/engineering)): HQ doesn't hold the shared Postgres's superuser password.
- **How HQ checks it:** no live check is defined yet (shows missing until `/hq:add-tool` adds one).

A tool bound to 127.0.0.1 can't be reached by the other party, so a signing request can't simply be emailed
as a link. Until the owner decides how signers reach it, the practical route is to prepare the document with
`/legal:signature-request` and have it signed by whatever means the owner already uses.

## 2. Accounts and connections

None. HQ connects to no legal or signing service. Contracts and signed copies stay in the owner's own files or
the business's vault, never in the framework repo.

## 3. Skills to use

- `/legal:review-contract`: review a contract clause by clause.
- `/legal:triage-nda`: triage an NDA: sign, push back, or escalate.
- `/legal:compliance-check`: does this action, feature or campaign break a rule?
- `/legal:legal-risk-assessment`: rate the legal risk.
- `/legal:vendor-check`: check a vendor before signing up.
- `/legal:signature-request`: prepare a document for signature: completeness checklist, signing order.
- `/small-business:contract-review`: a plain-English contract review.
- `/operations:compliance-tracking`: track obligations and their due dates.

There are no `/hq:` skills here. Run `/hq:dept legal` for the department's plan for the week; it must obey the
department's notes.

## 4. Check it's working

- The department tab shows all eight skills as ready, and its notes include
  "Skills are a first pass, not legal advice. Regulated businesses need a real lawyer on call." plus one note
  per regulated flag in the profile (and per country, for some flags).
- This shows the department's notes and state:

  ```bash
  curl -s http://127.0.0.1:3150/api/status | jq '.departments[] | select(.slug=="legal") | {grade, notes, tools: [.tools[] | {name, state}]}'
  ```

- No CEO finding is filed under Legal & Compliance. Two Operations findings can name it:
  - **N departments run on skills alone:** lists Legal & Compliance until an e-signature tool has a live
    check. Expected until there's something to sign; leave it, or mark it done on the CEO tab.
  - **N expected skills aren't installed:** names any missing legal skill; reinstall the plugin it belongs to.

## Done when

- [ ] The owner has confirmed the profile's `regulated` flags, and the tab's notes match them.
- [ ] All eight skills show as ready on the department tab.
- [ ] The owner knows which documents they need (terms, privacy policy, contractor agreement …), and
      `/operations:compliance-tracking` is tracking them.
- [ ] An e-signature tool is installed, or the owner has decided to wait until there's something to sign.
- [ ] `/hq:dept legal` has saved this week's plan.

## Good to know

- The skills are a first pass, not legal advice. A regulated business needs a real lawyer on call.
- Nothing is signed, sent or published on the owner's behalf. Every signature request needs their explicit yes.
- Never sign up for a legal, signing or compliance service for the owner.
- Free tools only, installed from checksum-verified releases or source: never `curl | sh`, no Homebrew, no
  Docker on the Mac. Servers bind to 127.0.0.1.
