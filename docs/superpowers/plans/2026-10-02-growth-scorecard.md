# Growth Scorecard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every business gets a weekly lever scorecard (Get / Keep / Expand / Foundation) from a private read-only adapter, shown on the CEO and Data tabs, with missing numbers raised as CEO findings.

**Architecture:** A private command per business (owner-configured in `$HQ_DATA`) prints a version-1 snapshot; HQ validates it as aggregates-only, rebuilds it field by field, adds ledger-derived cost metrics, and stores it (0600) with one history file per ISO week. The lifecycle adapter runner is extracted into a shared module both features use. A synthetic demo adapter ships so a fresh install works without anyone's data.

**Tech Stack:** TypeScript, Next.js app router, node:test via tsx, launchd services from `services.json`, beancount ledger text.

**Spec:** `docs/superpowers/specs/2026-10-02-growth-scorecard-design.md`

## Global Constraints

- The framework never names a real business: no business names, home paths or account ids in any tracked file (release leak scan + `tests/registry.test.ts`).
- Adapters, connections, snapshots and history live only under `$HQ_DATA/businesses/<slug>/`; files written 0600.
- Adapter run: stdin `{"action":"report","weeks":12}`, 45 s timeout, 2 MB output cap; command array from `scorecard-connection.json`, never from a request.
- Snapshot: `version: 1`, `weeks` ≤ 26 newest first, `breakdown` ≤ 20 rows, `extraSpend` ≤ 10 rows, strings ≤ 200 chars, currency must equal the profile's.
- Stale after 36 h; history pruned beyond 26 weeks; service `com.hq.scorecard` daily at 06:00.
- Spend accounts: `Expenses:Advertising` and `Expenses:Commissions`, including sub-accounts; 4-week window.
- UI uses `bb` tokens, `.card`, `.eyebrow`, `PILL` from `lib/tone.ts`. Every service binds 127.0.0.1. Mutating API calls pass `localLifecycleOrigin`.

## Review Focus

- An adapter that hangs, exits non-zero or prints junk keeps the previous snapshot and marks the state failed (Task 2 test `failed run keeps previous snapshot`).
- The same ISO week twice, or weeks out of order, is rejected (Task 2 test `rejects duplicate or unordered weeks`).
- A ledger with malformed lines, other currencies or postings outside the window does not crash and does not count them (Task 3 test `ignores malformed and foreign-currency postings`).
- A metric with `quality: "missing"` and a non-null value, or `exact` with a null value, is rejected (Task 2 validator test).
- A slug like `../x` never resolves to a path (Task 2 test reuses `getProfile` guard).

---

### Task 1: Shared private-adapter runner

**Files:**
- Create: `lib/private-adapter.ts`
- Modify: `lib/lifecycle.ts` (runLifecycle uses it)
- Test: `tests/lifecycle.test.ts` (unchanged, must pass)

**Interfaces:**
- Produces: `runPrivateAdapter(slug: string, connectionFile: string, input: object): Promise<{ config: { command: string[]; readOnly?: boolean }; output: unknown }>` — reads `$HQ_DATA/businesses/<slug>/<connectionFile>`, validates the command array, runs it with the constraints above, parses stdout JSON. Throws `Error('Invalid private connection')` / `Error('Private adapter failed')`.
- Produces: `writePrivateJson(file: string, value: unknown): void` — atomic tmp+rename, mode 0600.

- [ ] Step 1: Move the exec/parse/write code out of `runLifecycle` into the two functions; lifecycle keeps its read-only check before calling.
- [ ] Step 2: `npm test -- --test-name-pattern lifecycle` → all lifecycle tests PASS unchanged.
- [ ] Step 3: Commit `refactor: shared private adapter runner`.

### Task 2: Scorecard snapshot, validation and storage

**Files:**
- Create: `lib/scorecard.ts`
- Test: `tests/scorecard.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: types `Lever`, `Quality`, `MetricId`, `Metric`, `Week`, `ScorecardSnapshot` exactly as in the spec; `METRICS: Record<MetricId, { lever: "get"|"keep"|"expand"|"base"; label: string; unit: "count"|"rate"|"money"|"months" }>` (15 ids from the spec table, `base` for Foundation, matching `lib/workflows.ts` `Lever`); `validScorecard(v: unknown, currency: string): v is ScorecardSnapshot`; `rebuildScorecard(v: ScorecardSnapshot): ScorecardSnapshot`; `scorecardState(slug: string, now?: Date): ScorecardState` where `ScorecardState = { connected: boolean; demo: boolean; snapshot: ScorecardSnapshot | null; stale: boolean; failed: boolean; failedAt: string | null; history: { week: string; metrics: Metric[] }[] }`; `runScorecard(slug: string, now?: Date): Promise<ScorecardState>`.

- [ ] Step 1: Tests:
  - `accepts a well-formed snapshot` (2 weeks, one metric of each quality).
  - `rejects personal-data shapes`: notes/labels containing `a@b.co`, `+61 400 000 000`, a UUID, a 40-char hex, a JWT `eyJ…`, `https://x.io/?u=1` → each `false`.
  - `rejects unknown metric ids, wrong currency, quality/value mismatch, oversize arrays` (27 weeks, 21 breakdown rows, 11 extraSpend rows).
  - `rejects duplicate or unordered weeks`.
  - `rebuild drops extra fields` (an `email` field on a metric does not survive `JSON.stringify(rebuildScorecard(x))`).
  - `run writes 0600 snapshot and one history file per ISO week` (temp HQ_DATA, adapter = `process.execPath -e` printing a snapshot; file `scorecard/<weeks[0].week>.json` exists; mode `0o600`).
  - `history prunes beyond 26 weeks` (pre-seed 27 files, run, expect 26).
  - `failed run keeps previous snapshot` (good run, then adapter `process.exit(3)` → `failed: true`, snapshot unchanged, `failedAt` set).
  - `stale after 36 hours` (observedAt 37 h before `now`).
  - `unknown or traversal slug throws` (`scorecardState('../x')`).
- [ ] Step 2: `npm test` → new tests FAIL (module missing).
- [ ] Step 3: Implement. PII regexes live in one exported `PII_PATTERNS` array. Failure state lives in `scorecard-state.json` (`{failedAt}`), cleared on success. A demo business with no connection runs `templates/scorecard/demo-adapter.mjs` (Task 4) and reports `demo: true`.
- [ ] Step 4: `npm test` → PASS. Commit `feat: scorecard snapshots, validation and weekly history`.

### Task 3: Acquisition spend from the ledger

**Files:**
- Create: `lib/ledger-spend.ts`
- Modify: `lib/scorecard.ts` (`runScorecard` applies costs before writing)
- Test: `tests/ledger-spend.test.ts`

**Interfaces:**
- Produces: `acquisitionSpend(ledgerText: string, currency: string, from: Date, to: Date): { total: number; postings: number }` and `applyCosts(s: ScorecardSnapshot, ledgerSpend: number): ScorecardSnapshot` — for `weeks[0]`: spend = ledger + sum(`extraSpend`) over the 4 newest weeks' `extraSpend`; new = sum of `new_paying` over the 4 newest weeks; sets `cost_to_win` = spend/new and `payback_months` = cost_to_win ÷ (sum `new_mrr` ÷ new), quality `approx` if any input is approx, `missing` with note "No acquisition spend recorded" when spend is 0, or "No new paying customers in 4 weeks" when new is 0. An adapter-supplied `cost_to_win` that is not `missing` is left as is.

- [ ] Step 1: Tests `sums advertising and commission sub-accounts in window`, `ignores malformed and foreign-currency postings`, `missing when no spend`, `adapter value wins`, `payback uses new_mrr per new customer` (spend 1000, 10 new, new_mrr 250 → cost 100, payback 4).
- [ ] Step 2: FAIL → implement (parse dated transactions `YYYY-MM-DD * …` then indented `Account  amount CUR` postings; only positive amounts on matching accounts) → PASS.
- [ ] Step 3: Commit `feat: cost to win and payback from the ledger`.

### Task 4: Synthetic demo adapter and the private-file guard

**Files:**
- Create: `templates/scorecard/demo-adapter.mjs`
- Modify: `tests/registry.test.ts` (guard)
- Test: `tests/scorecard.test.ts` (`demo adapter output validates`)

**Interfaces:**
- Produces: an executable script; stdin as above; prints a deterministic snapshot (seeded by week number, no `Math.random`) covering all 15 metrics across 12 weeks, with `nrr` and `payment_recovery_rate` `missing` in the oldest weeks to exercise the UI, currency read from `process.env.HQ_CURRENCY` (default `AUD`), notes saying "Demo data".

- [ ] Step 1: Tests `demo adapter output validates` (spawn it, `validScorecard` true, same output twice) and `no private scorecard files are tracked` (`git ls-files` has no `scorecard-connection.json`, `scorecard-snapshot.json`, `scorecard-state.json`, `scorecard/*-W*.json`, and no `*adapter*.mjs` outside `templates/scorecard/`).
- [ ] Step 2: FAIL → write the adapter → PASS. Commit `feat: synthetic demo scorecard`.

### Task 5: CLI and scheduled refresh

**Files:**
- Modify: `scripts/hq.ts` (`scorecard refresh [<slug>|--all]`, `scorecard show <slug>`; header comment; `defaultServices()` adds `com.hq.scorecard`: program `[npm, "run", "hq", "--", "scorecard", "refresh", "--all"]`, `keepAlive: false`, `schedule: { Hour: 6, Minute: 0 }`)

- [ ] Step 1: `refresh --all` runs every business that has a connection or is demo; prints one line per business (`ok <slug> <week>` / `failed <slug>`), exit 1 if any failed. `show` prints lever, label, value, quality per metric for `weeks[0]`.
- [ ] Step 2: Verify: `HQ_DATA=$(mktemp -d)`-style run is covered by Task 2 tests; here run `npm run hq -- scorecard refresh demo-coffee && npm run hq -- scorecard show demo-coffee` → `ok demo-coffee 20xx-Wnn` and 15 rows.
- [ ] Step 3: Commit `feat: hq scorecard CLI and daily service`.

### Task 6: API and the Scorecard card

**Files:**
- Create: `app/api/scorecard/route.ts`, `components/ScorecardCard.tsx`
- Modify: `app/ceo/page.tsx` (card above the findings), `components/DepartmentPage.tsx` (card when `d.slug === "data"` and a business is selected)

**Interfaces:**
- Consumes: `scorecardState`, `runScorecard`, `METRICS`, `LEVERS` from `lib/workflows.ts`.
- Produces: `GET /api/scorecard` → `{ business, ...ScorecardState }`; `POST` `{action:"refresh"}` → same, 403 without local same-origin, 503 `Connection unavailable. Previous snapshot is kept.` on failure.

- [ ] Step 1: Card: four columns in `LEVERS` order; per metric value (money in profile currency, rates as %, months 1 dp), change vs previous week, quality pill (`exact` plain, `approx` amber with note as `title`, `missing` grey with note shown), inline SVG sparkline of the last 12 history values; header shows observed time, `stale`/`failed`/`demo` pills and a refresh button; no connection and not demo → empty state pointing at `docs/SCORECARD.md`, no numbers.
- [ ] Step 2: `npm run typecheck && npm run build` → success; load `http://127.0.0.1:3150/ceo` on the demo business after Task 8's restart and see the card.
- [ ] Step 3: Commit `feat: scorecard card on CEO and Data tabs`.

### Task 7: CEO findings

**Files:**
- Modify: `lib/types.ts` (`HostFacts.scorecard: { connected: boolean; demo: boolean; stale: boolean; failed: boolean; missing: { lever: string; label: string; note: string }[] } | null`), `lib/status.ts` (fill it for the current business), `lib/ceo.ts`
- Test: `tests/ceo.test.ts`

- [ ] Step 1: Tests: `scorecard-none` (decision, dept `data`) when not connected and not demo; `scorecard-stale` (attention) when stale or failed; one `scorecard-missing-<lever>` (info) per lever with missing metrics, detail listing each label and note; no scorecard findings when `profile` is null.
- [ ] Step 2: FAIL → implement → PASS. Update `tests/helpers.ts` facts fixture with `scorecard: null`. Commit `feat: CEO findings from the scorecard`.

### Task 8: Docs, merge, deploy

**Files:**
- Create: `docs/SCORECARD.md` (adapter contract: connection file, stdin, snapshot shape, metric catalogue, privacy rules, demo adapter)
- Modify: `CLAUDE.md` (Layout line for `lib/scorecard.ts`, `lib/private-adapter.ts`, `lib/ledger-spend.ts`)

- [ ] Step 1: `npm test && npm run typecheck && npm run build` → all pass.
- [ ] Step 2: Leak check: `npm run release -- --dry-run` → `0 leaks`.
- [ ] Step 3: Rebase on origin/main, merge to main, push; in `~/business-os`: pull, build, `npm run hq -- services add-defaults && npm run hq -- services install`, `launchctl kickstart -k gui/$(id -u)/com.hq.web`; `npm run hq -- services status` shows `com.hq.scorecard`.
- [ ] Step 4: Commit `docs: scorecard adapter contract`.
