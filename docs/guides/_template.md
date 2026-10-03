# <Department label>: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** <the registry mission, in a sentence or two>.

**It covers:** <the registry "covers" list>.

**Owner's time:** about <N> minutes. **Cost:** free (<any free-plan limits worth knowing>).

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar.
- <anything this department needs from another one first, linked to that guide>

## 1. Tools

<One short subsection per tool in this department's registry entry, in priority order.>

### <Tool name>

- **What it's for:** <the registry "what" line, in plain words>.
- **Needed or optional:** <needed / one of a group of alternatives (name them) / optional, and when it's worth it>.
- **Licence or plan:** <open source licence, or free plan and its limits>.
- **Set it up:** <exact steps. Installs go through `/hq:add-tool` (free tools only, from a checksum-verified release
  or source, never `curl | sh`). Web services: the owner signs up; never sign up on their behalf.>
- **How HQ checks it:** <port / installed app / command on PATH / free web service>, shown on the department tab.

## 2. Accounts and connections

<Accounts this department posts to or reads from, how they're connected (for example `/hq:connections`),
and what HQ stores (ids and statuses only, never keys). Write "None" if there are none.>

## 3. Skills to use

<Every skill in this department's registry entry, one line each: the command, what it does, when to use it.>

## 4. Check it's working

- The department tab shows <tools> as running or installed.
- <A concrete check: a command and what it should print, or a page and what it should show.>
- The CEO tab shows no unresolved findings for this department, or only ones you've chosen to leave.

## Done when

- [ ] <Specific, checkable outcomes, one per line.>

## Good to know

- <Traps, limits, privacy rules, and what never to do without the owner's yes.>
