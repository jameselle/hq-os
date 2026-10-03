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
- `lib/backup.ts` — staging live service data (sqlite copy / cold copy) before restic, and the backup's exclude list.
- `lib/studio/teleprompter.ts` — the iPhone teleprompter's kept takes as Studio input (`studio from-teleprompter`) and in the backup.
- `lib/studio/review.ts` + `review-page.ts` — the review page (`studio review`, service `com.hq.review` on :8794): timed notes with frame stills beside each render (`<video>.review.json`). Its Planner view previews the Instagram/TikTok/YouTube Shorts grids from `.review-planner.json` in the review folder (order, pins, covers, dates). Node stdlib only, shared as-is with the clipper (`lib/review*.ts`): change both.
- `lib/workflows.ts` + `app/workflows` — the Workflows tab under CEO: the hand-offs between departments (the web), the loops and the cross-department workflow catalogue for getting, keeping and expanding customers. Data only; `tests/workflows.test.ts` keeps every slug real. `lib/workflow-evidence.ts` (server-only) marks which workflows actually run for the current business, live or in part, from its own records (read-back posts, Studio renders, CEO reviews, plans, scorecard weeks, lifecycle checks); a workflow with no record stays unmarked.
- `lib/brain.ts` (pure: note types, folders, who reads and writes what, derived from the Workflows web) + `lib/brain-store.ts` (server: the HQ brain at `$HQ_DATA/brain` and each business vault; read bundle, write, promote with a business-name guard, counts) + `components/BrainMap.tsx` ("The brain" on the Workflows tab). CLI `hq brain …`; guide `docs/guides/brain.md`; spec `docs/superpowers/specs/2026-10-03-hq-brain-design.md`.
- `lib/scorecard.ts` + `scorecard-metrics.ts` + `ledger-spend.ts` — the growth scorecard (CEO and Data tabs): a private read-only adapter per business (`$HQ_DATA/businesses/<slug>/scorecard-connection.json`) reports aggregates only; HQ validates, rebuilds, keeps weekly history and adds cost to win from the ledger. `lib/private-adapter.ts` runs it (shared with lifecycle). Contract: `docs/guides/scorecard.md`. Billing (Stripe + App Store): `templates/scorecard/billing-sources.mjs` + `billing-adapter.mjs` (`docs/guides/scorecard-billing.md`); own records: `records-postgres.sql` + `records-adapter.mjs` (`docs/guides/scorecard-records.md`).
- `lib/guides.ts` + `app/guides` + `docs/guides/` — the setup guides, readable inside HQ (/guides) and walked by `/hq:setup`: start-here, one per department (generated from the registry; `tests/guides.test.ts` fails if a department has no guide or its guide misses a tool or `hq:` skill), pages and connections. Template: `docs/guides/_template.md`. Only listed docs can be opened.
- `lib/status.ts` — live checks (skills on disk, bins, apps, ports). Server-only.
- `scripts/hq.ts` — the CLI (`npm run hq -- help`): businesses, reviews, plans, backups (restic), services (launchd), doctor.
- `plugin/` — the Claude Code plugin: skills `setup`, `ceo`, `dept`, `new-business`, `add-tool`, `backup`, `restore`, `services`, `connections`, `publish`, `scorecard` (and the content skills).
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
