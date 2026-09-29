---
name: backup
description: >
  Back up everything HQ holds (every business profile, CEO review, department
  plan and Obsidian vault) with encrypted, deduplicated restic snapshots, set up
  restic and the backup destination if needed, schedule it nightly, and prove it
  with a restore test. Use when the user says "/hq:backup", "back up HQ", "is
  everything backed up", "set up backups", "change the backup destination", or a
  CEO finding says backups are missing or stale.
---

# Backup

What's covered: `$HQ_DATA` (default `~/hq-data`: profiles, reviews, plans,
services config, and the vaults that live inside HQ), plus any external vault a
business profile points at. What's covered elsewhere: the framework code is on
GitHub, and tool installs are reproducible with `/hq:add-tool`. What's not
covered: tools' own databases (e.g. Postiz's Postgres). Say so if asked.

Run commands from `$HQ_ROOT` (default `~/business-os`).

## 1. Where things stand

```bash
npm run hq -- doctor
```

Read the backup lines: restic installed, repository configured, off-disk, last
snapshot, last restore test.

## 2. Install restic (if missing)

No Homebrew here. Use the official release, and verify the checksum:

```bash
V=$(gh api repos/restic/restic/releases/latest --jq .tag_name | sed 's/^v//')
mkdir -p ~/.local/opt/restic && cd ~/.local/opt/restic
curl -sSLO "https://github.com/restic/restic/releases/download/v$V/restic_${V}_darwin_arm64.bz2"
curl -sSL "https://github.com/restic/restic/releases/download/v$V/SHA256SUMS" | grep "restic_${V}_darwin_arm64.bz2" | shasum -a 256 -c -
bunzip2 -f "restic_${V}_darwin_arm64.bz2" && chmod +x "restic_${V}_darwin_arm64"
ln -sf ~/.local/opt/restic/restic_${V}_darwin_arm64 ~/.local/bin/restic && restic version
```

## 3. Destination (first time, or when changing it)

```bash
npm run hq -- backup init                       # default: iCloud Drive/HQ Backups/restic
npm run hq -- backup init /Volumes/<Drive>/hq-restic   # an external drive
```

- The default iCloud Drive folder syncs off the Mac, so it counts as a real backup.
  A path in the home folder does not: the CEO keeps flagging it as critical.
- `init` generates a random password straight into the login Keychain (service
  `hq-restic`) and never prints it. **Tell the owner to copy it into their password
  manager** (`security find-generic-password -s hq-restic -w` in their own
  Terminal). Without it, the backup can't be opened on another Mac. Don't read it yourself.
- If iCloud's "Optimise Mac Storage" is on, restic may have to download evicted
  files during restore. The weekly restore test catches problems.

## 4. Back up and prove it

```bash
npm run hq -- backup run
npm run hq -- backup restore-test
```

`restore-test` restores the latest snapshot into a temp folder and compares
every file byte for byte with the live copy. Report its PASS or FAIL line verbatim.

## 5. Schedule it

The `com.hq.backup` service runs `backup run` nightly at 02:30 and a restore test
every Sunday. Install or refresh it with `npm run hq -- services install`, and check
it with `npm run hq -- services status`.

## Rules

- Never print, log or paste the restic password. Never open `.env` files.
- Never delete snapshots except through the built-in retention (14 daily, 8 weekly, 12 monthly).
- Never restore over live data. That's `/hq:restore`, into a new folder.
