---
name: new-business
description: >
  Connect a business to HQ: interview the owner (or draft from their website),
  build a validated business profile, scaffold the business's data folder and
  Obsidian vault, and run its first CEO review. Use when the user says
  "/hq:new-business", "add a business", "connect <business> to HQ", "set up a
  new company", "onboard <business>", or wants to try HQ with a demo business.
---

# New business

A business profile is the one file that makes the generic HQ framework about
a specific business. Get it right once, and every department, the CEO and the
vault use it.

## 0. Find HQ

The repo is `$HQ_ROOT` (default `~/business-os`). Run `npm run hq -- …` from there.
`npm run hq -- list` shows the businesses that already exist; don't create a duplicate.

## 1. Gather the facts

If the user gives a website, fetch it first and draft the answers, so they
confirm instead of type. Ask the rest in small groups, and use multiple-choice
questions for the fixed lists.

| Field | Notes |
|---|---|
| `name` | display name; `slug` is derived (lowercase-kebab) and confirmed |
| `offer` | what it sells, one line |
| `audience` | who buys, one line |
| `model` | subscription · ecommerce · services · media · marketplace · saas · other |
| `country` / `currency` / `timezone` | ISO codes and IANA name; default AU / AUD / Australia/Sydney |
| `sites` | full URLs (may be empty) |
| `channels` | e.g. `{ "instagram": "@handle", "tiktok": "@handle", "discord": "invite URL" }`. A value can also be `{ "handle": "@h", "via": "composio", "account": "<connection id>" }` to pin the posting route and a connected account; routes default sensibly (see `/hq:connections`) |
| `brandVoice` | a sentence or three, optional |
| `regulated` | any of gambling · kids · finance · health · alcohol · adult. **Ask directly**: this drives legal and ad warnings |
| `competitors` | optional now: 3 to 6 competitors, each with a `name`, `site`, `channels` and `watch` pages. Or leave them out and run `/hq:competitors setup` straight after |
| `departments.skip` | department slugs this business won't run (e.g. `people` for a solo business) |
| `departments.notes` | standing notes per department, optional |
| `vault.path` | `"vault"` (a new vault inside HQ, the default) or the **absolute path of an existing Obsidian vault**, where HQ only writes inside an `HQ/` subfolder |
| `demo` | `true` only for a sandbox the user wants to try HQ with |

Department slugs: operations, content, seo, ads, email, design, sales, support,
engineering, data, finance, legal, people, security.

Never ask for passwords, API keys or tokens. Channel handles and URLs are fine.

## 2. Create it

Show the user the profile JSON and get a yes. Then:

```bash
cat > /tmp/hq-profile.json <<'JSON'
{ …profile… }
JSON
npm run hq -- new-business /tmp/hq-profile.json
```

If it prints validation errors, fix the fields it names and re-run. It never
overwrites an existing business.

## 3. Hand over

1. Tell the user where the vault is (the command prints it) and how to open it:
   Obsidian → *Open folder as vault* → that folder.
2. If they want it as the default: `npm run hq -- use <slug>`. The site's top-bar
   switcher also works per browser.
3. Run the first review with the `/hq:ceo` skill for this business, so the CEO
   tab isn't empty.
4. Remind them: back up with `/hq:backup`, which covers the new business automatically.
5. Run `/hq:connections` so the Content tab shows which of the new business's channels can post already.
6. If there are no competitors in the profile, run `/hq:competitors setup`.

## Rules

- One business per profile; ask before reusing a slug.
- A demo business is labelled `demo: true`; remove one with
  `npm run hq -- remove-business <slug> --yes`, which never deletes an external vault.
- Never open `.env` files or credentials.
