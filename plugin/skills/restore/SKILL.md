---
name: restore
description: >
  Restore HQ data from its restic backup: run a restore test, recover a deleted
  or damaged file, roll a business back to an earlier snapshot, or rebuild HQ on
  a new Mac from GitHub plus the backup. Use when the user says "/hq:restore",
  "restore HQ", "I deleted a note", "get last week's version back", "move HQ to
  a new Mac", or a restore test failed.
---

# Restore

Run commands from `$HQ_ROOT` (default `~/business-os`). **Always restore into a
new folder, then copy back only what's needed.** Never restore on top of live data.

## Test (default when no other goal is given)

```bash
npm run hq -- backup restore-test
```

It restores the latest snapshot to a temp folder and compares every file byte for
byte. Report the PASS/FAIL line verbatim. On FAIL, show which files differ and
run `npm run hq -- backup run`, then test again.

## Recover files or roll back

```bash
npm run hq -- backup snapshots                      # pick an id and date
npm run hq -- backup restore <id|latest> ~/hq-restore-$(date +%Y%m%d-%H%M)
```

Files keep their original absolute paths under the target (e.g.
`~/hq-restore-…/Users/<you>/hq-data/businesses/<slug>/…`). Show the owner what differs
(`diff -rq <restored-path> <live-path>`), and copy back only what they confirm. Before
overwriting a live file, keep a copy of the current one next to it with a
`.before-restore` suffix.

## Rebuild HQ on a new Mac

1. Framework: `gh repo clone jameselle/hq-os ~/business-os && cd ~/business-os && npm install && npm run build`.
2. Plugin: `claude plugin marketplace add jameselle/hq-os && claude plugin install hq@hq`.
3. restic: install it (see `/hq:backup` step 2).
4. Password: the owner adds it to the Keychain themselves, from their password
   manager: `security add-generic-password -a "$USER" -s hq-restic -l "HQ restic backup" -w`
   (it prompts; never type it into chat).
5. Point at the repository: `npm run hq -- backup init <same repository>`. It detects
   the existing repository and won't re-initialise it.
6. Restore: `npm run hq -- backup restore latest ~/hq-restore`, then move
   `~/hq-restore/<old home>/hq-data` to `~/hq-data`. Paths from the old Mac's home
   folder may differ; check external vault paths in each `profile.json`.
7. Services: `npm run hq -- services init && npm run hq -- services install`, then `npm run hq -- doctor`.

## Rules

- Never print the restic password or open `.env` files.
- Never run `restic forget`, `prune` or `init` against an existing repository by hand.
