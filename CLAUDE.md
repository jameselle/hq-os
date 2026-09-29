# HQ

A local console (Next.js, http://127.0.0.1:3150) plus a Claude Code plugin (`hq`) for running any
business: one tab per department, a CEO that reviews and delegates, and an Obsidian vault per
business. This repo is the **framework**. It never contains a real business's data.

## Layout

- `lib/registry.ts` — the 14 departments: role, mission, tools (with licence and live check), skills.
- `lib/ceo.ts` — the CEO's rulebook: live facts + profile → ranked findings. Pure; unit-tested.
- `lib/profile.ts` — the business profile type and validator. `lib/regulations.ts` — regulated flags → department notes.
- `lib/store.ts` — business data on disk (`$HQ_DATA`, default `~/hq-data`), shared by the site and the CLI.
- `lib/publishing.ts` — platform → route (composio / woopsocial / postiz / manual), the known traps per route, and channel status from the connection snapshot.
- `lib/status.ts` — live checks (skills on disk, bins, apps, ports). Server-only.
- `scripts/hq.ts` — the CLI (`npm run hq -- help`): businesses, reviews, plans, backups (restic), services (launchd), doctor.
- `plugin/` — the Claude Code plugin: skills `ceo`, `dept`, `new-business`, `add-tool`, `backup`, `restore`, `services`, `connections`, `publish`.
  `.claude-plugin/marketplace.json` makes this repo its own marketplace.
- `templates/vault/` — the Obsidian vault every new business gets.
- `tests/` — `npm test` (node:test via tsx). Tests that touch disk use a temp `HQ_DATA`.

## Rules

- **Free tools only.** Open source first (licence checked with the GitHub API; `oss`, `open-core`), free
  proprietary where it's clearly better (`free`, with a `freeNote`). Nothing that needs a paid plan.
  New tools go through the `add-tool` skill.
- **The framework never names a real business.** Business specifics live in profiles under `$HQ_DATA`.
  `tests/registry.test.ts` fails if a real business name appears in `lib/` or `scripts/`.
- **Never read `.env` files** or anything holding credentials. The restic password lives in the login
  Keychain (service `hq-restic`) and is never printed.
- Every service binds to 127.0.0.1.
- UI style is the HQ design system (`bb` Tailwind tokens, `.card`, `.eyebrow`, pills in `lib/tone.ts`). Match it.

- **Publishing never guesses.** A channel is connected only if pinned or name-matched; a post is `published` only with a url or id read back from the platform; nothing is posted without the owner's yes.
- The connection snapshot (`$HQ_DATA/connections.json`) holds ids, aliases, names and statuses only; `validateSnapshot` refuses anything credential-shaped.

## Working on it

```bash
npm test && npm run typecheck && npm run build
launchctl kickstart -k gui/$(id -u)/com.hq.web   # the site runs as a launchd service
npm run hq -- doctor
```

Changing a skill: edit `plugin/skills/<name>/SKILL.md`, keep `evals/evals.json` in step, then
`claude plugin marketplace update hq` on each machine.
