---
name: add-tool
description: >
  Add a tool to an HQ department the right way: verify it's free (open source
  licence checked on GitHub, or a free plan that covers the use), install it
  under ~/.local without Homebrew or Docker, register it as a service if it's a
  server, list it in the department with a live check, test, rebuild, and
  commit. Use when the user says "/hq:add-tool", "install <tool> for <department>",
  "add Umami/Beancount/Listmonk…", or when a CEO or department plan says a tool is missing.
---

# Add a tool

HQ's rule: **free tools only.** Open source first; free proprietary is fine
where it's clearly better; nothing that needs a paid plan for what we'll use it
for. Every tool on a department tab has a live check, so the tab never lies.

The repo is `$HQ_ROOT` (default `~/business-os`). The department list is
`lib/registry.ts`.

## 1. Is it free? (stop here if not)

- **On GitHub:** `gh api repos/<owner>/<repo> --jq '.license.spdx_id'`. If that
  says `NOASSERTION`, read the LICENSE file: `gh api repos/<o>/<r>/license --jq .content | base64 -d | head -40`.
  - OSI licence for the whole repo → `oss("<SPDX>")`
  - OSI core with an `ee/` or enterprise folder → `core("<SPDX>")`, open core
  - source-available but free to self-host (FSL, SSPL, RSAL, Sustainable Use) →
    `free("<name>")`, plus a `freeNote` on what isn't allowed
- **Not on GitHub:** check the vendor's pricing page for a free plan that covers the
  use → `free("Proprietary")`, plus a `freeNote` on the plan's limits.
- Paid only → say so, suggest a free alternative, and stop.

## 2. Install it (this Mac has no Homebrew and no Docker; check `which brew docker`)

In this order of preference:
1. **Single binary** from the project's GitHub release: download, verify the
   published checksum or signature, and put it in `~/.local/opt/<tool>/`, symlinked
   into `~/.local/bin/`.
2. **npm / npx** (`npx <pkg>` needs no install), or **`uv tool install`** for Python CLIs.
3. **Build from source** when the project documents it (`cmake` is available via uv).
4. **Mac app:** download the official `.dmg` and let the user drag it to
   /Applications. Don't script GUI installers.
5. **Web service:** nothing to install; the owner signs up. Never sign up on their behalf.

Never pipe a remote script into a shell without reading it first. Keep data in
`~/.local/var/<tool>/`. Servers must bind to `127.0.0.1`.

## 3. If it's a server, make it a service

Add an entry to `$HQ_DATA/services.json`: `label` `com.hq.<tool>`, `program` as
absolute paths, `keepAlive: true`, and a `port`. Then:

```bash
npm run hq -- services install && npm run hq -- services status
```

## 4. List it

Add it to the right department in `lib/registry.ts`, matching the existing entries:

```ts
{ name: "Umami", what: "One-line job description.", repo: "umami-software/umami",
  licence: oss("MIT"), check: { port: 3001, paths: ["~/.local/opt/umami"] }, url: "http://localhost:3001" },
```

`check` fields: `port` (running), `paths` / `bins` / `apps` (installed), `npx`
(on demand), `web` (free web service). If the CEO rulebook (`lib/ceo.ts`) has a
finding the tool resolves, confirm the rule now clears.

## 5. Prove it

```bash
npm test && npm run build && launchctl kickstart -k gui/$(id -u)/com.hq.web
curl -s http://127.0.0.1:3150/api/status | jq '.departments[] | select(.slug=="<dept>") | .tools[] | {name, state}'
```

The tool must show `running`, `installed`, `on-demand` or `web`, not `missing`.

## 6. Record it

- Commit on the framework repo with a message saying what was added and why. Show the
  user the diff and ask before pushing, unless they already said to.
- If there's a current business, add a short SOP to its vault under
  `Departments/<Label>/SOPs/` saying how the tool is used.

## Rules

- Never open `.env` files. If a tool needs secrets, the owner puts them in the
  tool's own config; you only reference variable names.
- Don't install anything paid, trial-only, or that phones home without saying so.
  Note any telemetry in `warn`, with the opt-out.
