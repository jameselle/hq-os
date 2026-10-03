# IT & Security: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** makes sure nothing is lost and nothing leaks: backups, passwords, sync. It stands
in for an IT and security lead.

**It covers:** backups, passwords and 2FA, file sync between Macs, secrets hygiene, pentesting your own apps.

**Owner's time:** about 30 minutes, most of it the first backup. **Cost:** free (the backup lives in iCloud
Drive, so it uses iCloud storage you already have; Strix, if ever used, drives a paid LLM).

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar.
- Nothing else. Do this department first: the CEO ranks a missing backup as critical, above everything else.

## 1. Tools

The department tab is http://127.0.0.1:3150/security. It needs **one backup tool** (restic or Kopia) and
**Syncthing**. Vaultwarden and Strix are optional and never count against readiness.

### restic

- **What it's for:** encrypted, deduplicated backups to disk or cloud. HQ's own backup commands use it.
- **Needed or optional:** needed. It shares the "backups" group with Kopia, but only restic is wired into
  `npm run hq -- backup`, `/hq:backup`, `/hq:restore`, the nightly service and the CEO's backup findings. Choose restic.
- **Licence or plan:** open source, BSD-2-Clause.
- **Set it up:**
  1. Run `/hq:backup`. If restic is missing it downloads the official release from GitHub, checks it against
     the published `SHA256SUMS`, and links it into `~/.local/bin/restic`. Check with `restic version`.
  2. `npm run hq -- backup init`. The default repository is `iCloud Drive/HQ Backups/restic`, which syncs off
     the Mac. For an external drive: `npm run hq -- backup init /Volumes/<Drive>/hq-restic`. A folder on the
     Mac's own disk is not a backup and stays flagged as critical.
  3. `init` puts a random password straight into the login Keychain (service `hq-restic`) and never prints it.
     **The owner** copies it into their password manager by running, in their own Terminal,
     `security find-generic-password -s hq-restic -w`. Claude never reads or prints it.
  4. `npm run hq -- backup run`, then `npm run hq -- backup restore-test`. The test restores the latest
     snapshot to a temp folder and compares every file byte for byte; it must print `PASS`.
  5. Schedule it: `npm run hq -- services add-defaults && npm run hq -- services install`. The `com.hq.backup`
     service runs `backup run` nightly at 02:30 and a restore test every Sunday.
- **How HQ checks it:** `restic` on PATH. Shows "installed".

### Kopia

- **What it's for:** backups with a desktop UI and scheduling.
- **Needed or optional:** the alternative to restic in the backups group. Installing Kopia alone turns the
  department's backup need green, but HQ's data still has no backup, and the CEO keeps saying so. Only add it
  for backing up things outside HQ.
- **Licence or plan:** open source, Apache-2.0.
- **Set it up:** `/hq:add-tool` for Kopia: the CLI from a checksum-verified GitHub release, or the notarised
  KopiaUI app dragged to /Applications by the owner.
- **How HQ checks it:** `kopia` on PATH, or the KopiaUI app. Shows "installed".

### Syncthing

- **What it's for:** syncs folders between Macs, device to device, with no cloud in between.
- **Needed or optional:** needed (for an owner with one Mac, it can wait, but it still counts on the tab).
- **Licence or plan:** open source, MPL-2.0.
- **Set it up:**
  1. `/hq:add-tool` for Syncthing: the release binary verified against its checksum, linked into
     `~/.local/bin/syncthing`.
  2. `npm run hq -- services add-defaults && npm run hq -- services install`. That adds `com.hq.syncthing`,
     with its web UI on 127.0.0.1:8384 and its config in `~/.local/var/syncthing`.
  3. The owner opens http://localhost:8384, declines anonymous usage reporting when asked, sets a username and
     password for the web UI (kept in their password manager), and pairs the other Mac.
  4. Share only the folders that should be on both Macs, for example a business's vault.
- **How HQ checks it:** port 8384 answering ("running"), else the binary or app ("installed").

### Vaultwarden

- **What it's for:** a self-hosted password manager (Bitwarden-compatible).
- **Needed or optional:** optional. Passwords and 2FA codes live in the macOS Passwords app, which is free and
  already on the Mac. Consider Vaultwarden only for sharing passwords across a team.
- **Licence or plan:** open source, AGPL-3.0.
- **Set it up:** if wanted, `/hq:add-tool` for Vaultwarden, bound to 127.0.0.1 as a `com.hq.*` service.
- **How HQ checks it:** no live check is defined yet (shows missing; it's optional, so it doesn't count).

### Strix

- **What it's for:** AI pentesting agents that attack your own app or site and prove each hole with a working exploit.
- **Needed or optional:** optional. It needs Docker for its scan sandbox, and HQ doesn't run Docker on the Mac,
  so the CLI can be installed but can't scan here.
- **Licence or plan:** open source, Apache-2.0. The CLI is free; the LLM it drives (`STRIX_LLM` +
  `LLM_API_KEY`) is paid, so using it is a cost the owner must approve. Strix Cloud and Enterprise are paid
  extras HQ doesn't use.
- **Set it up:** `/hq:add-tool` installs the CLI into `~/.local/opt/strix`. Its telemetry is on by default:
  always run it with `STRIX_TELEMETRY=0`. The LLM key goes in the Keychain, typed by the owner, and is read at
  run time, never written to a file. Only scan targets the owner owns, and cap spend with `--max-budget`.
- **How HQ checks it:** `strix` on PATH or `~/.local/opt/strix`. Shows "installed".

## 2. Accounts and connections

- **iCloud Drive** holds the default backup repository. The owner is already signed in to iCloud; nothing to connect.
- **The backup password** is in the login Keychain (`hq-restic`). The owner keeps a copy in their password
  manager, off this Mac. Without it, the backup can't be opened anywhere else.
- No other accounts. Syncthing pairs devices directly.

## 3. Skills to use

- `/hq:backup`: set up restic and the destination, back up now, prove it with a restore test, schedule it nightly.
- `/hq:restore`: run a restore test, recover a deleted file, roll back, or rebuild HQ on a new Mac. Always
  restores into a new folder, never over live data.
- `/operations:risk-assessment`: what could go wrong, rated, with mitigations.
- `/engineering:incident-response`: when something leaks or breaks.
- `/session-wrap-up`: get every repo committed and pushed at the end of a session.

## 4. Check it's working

- The department tab shows restic as installed and Syncthing as running.
- `npm run hq -- doctor` prints ✓ on every backup line: restic installed, backup repository configured,
  backup repository is off this Mac's disk, last snapshot (a date), last restore test passed.
- `npm run hq -- services status` lists `com.hq.backup` (a scheduled job, so `not running` between runs is
  fine; `not installed` is not) and `com.hq.syncthing` as `running` with `:8384 up`.
- `npm run hq -- backup snapshots` lists at least one snapshot tagged `hq`.
- CEO findings filed under IT & Security, and how each clears:
  - **HQ's data has no backup** / **HQ's backup is on this Mac's own disk** (critical): `npm run hq -- backup init`
    with an off-Mac destination, then `/hq:backup`.
  - **Last backup is more than two days old:** `/hq:backup`, then check `com.hq.backup` with
    `npm run hq -- services status`.
  - **Save the backup password somewhere off this Mac:** the owner copies it into their password manager
    (step 3 above), then presses **Mark done** on the CEO tab. It stays until marked done.
  - **The last restore test failed** (critical): `/hq:restore` in test mode, fix what it reports, test again.
  - **A service's data didn't make it into the last backup:** `npm run hq -- backup run` and read the `stage`
    lines; `npm run hq -- services status` shows whether the service came back.

## Done when

- [ ] `npm run hq -- doctor` shows ✓ for restic, repository, off this Mac's disk, last snapshot and restore test.
- [ ] `com.hq.backup` is installed (`npm run hq -- services status`).
- [ ] The owner has the `hq-restic` password in their password manager, and the finding is marked done.
- [ ] Syncthing's web UI answers on 127.0.0.1:8384 with a login set, or the owner has decided one Mac is enough for now.
- [ ] The owner's passwords and 2FA codes are in the Passwords app (or Vaultwarden).
- [ ] The CEO tab shows no IT & Security findings.

## Good to know

- Secrets hygiene, the rules every department follows: secrets go in the login Keychain, typed by the owner
  (`security add-generic-password -a "$USER" -s <name> -w`, which prompts), never pasted into chat, never in a
  repo, never in `services.json` or a plist. Claude never opens `.env` files.
- Never delete snapshots by hand, and never run `restic forget`, `prune` or `init` against an existing
  repository. Retention (14 daily, 8 weekly, 12 monthly) is built in.
- If iCloud's "Optimise Mac Storage" is on, a restore may have to download files first. The weekly restore
  test catches problems.
- Studio renders (`*.mp4`, `*.aiff`, `*.wav` under `studio/`) are left out of the backup on purpose. Tool
  databases are staged into the backup only when their service has a `backup` spec.
- Every service binds to 127.0.0.1. Turn telemetry off wherever a tool has it.
- Free tools only, installed from checksum-verified or notarised releases or source: never `curl | sh`, no
  Homebrew, no Docker on the Mac.
