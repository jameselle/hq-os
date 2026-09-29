---
name: services
description: >
  Manage HQ's background services on this Mac (the HQ site, the nightly backup,
  and self-hosted tools such as Postiz and its database) with launchd: see
  what's running, start, stop, install, uninstall, and fix a service that won't
  stay up. Use when the user says "/hq:services", "is HQ running", "start HQ",
  "Postiz is down", "restart the services", "make it start at login", or a CEO
  finding says a tool isn't running.
---

# Services

HQ's services are launchd agents defined in `$HQ_DATA/services.json` (default
`~/hq-data/services.json`), so they start at login and restart if they crash.
Run commands from `$HQ_ROOT` (default `~/business-os`).

| Command | What it does |
|---|---|
| `npm run hq -- services status` | each service: launchd state, pid, and whether its port answers |
| `npm run hq -- services start` / `stop` | load and kick every service / unload them (they come back at next login) |
| `npm run hq -- services install` | (re)write the plists from services.json and load them; unchanged ones are left alone |
| `npm run hq -- services init` | first time only: write a default services.json for this Mac |
| `npm run hq -- services uninstall` | unload and delete every HQ plist |

One service: `launchctl kickstart -k gui/$(id -u)/<label>` restarts it, and
`launchctl print gui/$(id -u)/<label>` shows its details.

## Adding or changing a service

Edit `$HQ_DATA/services.json`. Each entry has a `label` (`com.hq.<name>`), a
`description`, a `program` (an array of absolute paths and args), an optional `cwd`,
`keepAlive` (true for servers), an optional `schedule` ({Hour, Minute, Weekday}) for jobs,
and an optional `port`. Then run `services install`. New tools come in through `/hq:add-tool`.

## When one won't stay up

1. `npm run hq -- services status`, then read its log: `tail -50 $HQ_DATA/logs/<label>.log`.
2. Common causes:
   - **Exit 78 (EX_CONFIG) with an empty log:** launchd couldn't open the log file.
     `services install` creates `$HQ_DATA/logs`, so run it again.
   - **Port already in use:** `lsof -nP -iTCP:<port> -sTCP:LISTEN` shows it. Stop the
     stray copy (often one started by hand in a terminal) rather than changing the port.
   - **Command not found:** launchd has a minimal PATH. `program` must use absolute
     paths; the generated PATH includes `~/.local/bin`.
   - **A dependency isn't up yet** (for example an app starting before its database):
     `keepAlive` retries every 15 seconds, so wait a minute before digging.
3. Fix the cause, then `launchctl kickstart -k gui/$(id -u)/<label>` and check status again.

## Rules

- Services bind to 127.0.0.1 only.
- Never put secrets in services.json or a plist. Tools read their own config files.
- Don't touch launch agents that aren't `com.hq.*`.
