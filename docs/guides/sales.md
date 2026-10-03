# Sales & Partnerships: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** finds leads and partners, runs outreach, and keeps the pipeline honest.

**It covers:** lead finding and triage; outreach and follow-up; pipeline and forecast; affiliate and partner deals.

**Owner's time:** about 10 minutes (creating the CRM workspace and first user). The Twenty build itself takes
Claude a while, but needs nothing from the owner. **Cost:** free. Twenty's open source core covers everything HQ
uses; HubSpot's paid hubs are left out on purpose.

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar.
- The nightly backup is set up ([Security guide](/guides/security)), because the CRM's database is copied into it.
- Good to have: a list of competitors from the [Competitors guide](/guides/competitors), since its briefs feed
  sales talking points.

## 1. Tools

The department needs **one** CRM: Twenty or EspoCRM. Start with Twenty.

### Twenty

- **What it's for:** the CRM: partners, leads, companies and the deal pipeline, with an API.
- **Needed or optional:** needed, as one of a group of alternatives (Twenty or EspoCRM). Twenty is the default.
- **Licence or plan:** open core, AGPL-3.0. Its enterprise files are under a commercial licence and HQ doesn't use them.
- **Set it up:**
  1. Run `/hq:add-tool Twenty for sales`. It follows `setup/twenty/README.md` in the HQ repo: Twenty is built from
     source without Docker, on its own Node 24 (downloaded from nodejs.org with its SHASUMS256 checked) beside HQ's
     Node, with one local patch so it listens on 127.0.0.1 only. Its database password and app secret are generated
     straight into the login Keychain (service `hq-twenty`) and never printed.
  2. Register it as services: `npm run hq -- services add-defaults && npm run hq -- services install`. This adds four:
     `com.hq.twenty.postgres` (:5433), `com.hq.twenty.redis` (:6380), `com.hq.twenty` (:3020) and
     `com.hq.twenty.worker`. The first start creates the database and runs its migrations, so give it a minute.
  3. **The owner creates the workspace in the browser.** They open http://127.0.0.1:3020 and create the workspace
     and its first user. Twenty has no default account. They pick the password and keep it in their password
     manager; it is never typed into the chat or saved in a repo.
  4. Telemetry is on upstream; HQ's launcher (`scripts/twenty.sh`) turns it off.
- **How HQ checks it:** port 3020 answering (running), or the built server at
  `~/.local/opt/twenty/src/packages/twenty-server/dist/main.js` (installed), shown on the department tab.

### EspoCRM

- **What it's for:** a lighter self-hosted CRM.
- **Needed or optional:** the alternative to Twenty in the same group. Worth it only if Twenty is too heavy for this
  Mac; one CRM is enough.
- **Licence or plan:** open source, AGPL-3.0.
- **Set it up:** through `/hq:add-tool EspoCRM for sales`, from source (no Docker), bound to 127.0.0.1 and run as a
  `com.hq.*` service. The owner creates the admin account in the browser, as with Twenty.
- **How HQ checks it:** HQ has no live check for EspoCRM yet, so the tab shows it as missing even if it is
  installed. `/hq:add-tool` adds one (its port) when it installs it.

## 2. Accounts and connections

- **The CRM login** belongs to the owner, created in step 3 above. HQ stores no CRM password.
- **Twenty's API:** HQ doesn't hold a Twenty API key today, and the sales skills work from what you paste or export.
  If you later connect one, the owner creates the key inside Twenty and stores it in the Keychain with
  `security add-generic-password -a hq -s hq-<business>-twenty -w` (it prompts in their own Terminal); it is never
  pasted into chat or written to a file.
- No Composio connection is needed for sales. Outreach on social channels goes through the Content department's
  routes (see [Content](/guides/content)).

## 3. Skills to use

- `/small-business:lead-finder`: find leads.
- `/sales:lead-triage`: decide which leads are worth it.
- `/sales:draft-outreach`: write the first message.
- `/small-business:outreach-composer`: build an outreach sequence.
- `/sales:call-prep`: prepare for a call.
- `/sales:handle-objection`: answer an objection.
- `/small-business:proposal-builder`: write a proposal.
- `/sales:pipeline-review`: review the pipeline.
- `/sales:forecast`: forecast what the pipeline will bring in.
- `/hq:dept sales`: plan this department's week from the CEO's latest review.

## 4. Check it's working

- The department tab (http://127.0.0.1:3150/sales) shows Twenty as **running**. From Terminal:
  `curl -s http://127.0.0.1:3150/api/status | jq '.departments[] | select(.slug=="sales") | .tools[] | {name, state}'`
  prints `"state": "running"` for Twenty.
- `npm run hq -- services status` shows all four `com.hq.twenty*` services running, with `:5433 up`, `:6380 up` and
  `:3020 up`.
- The owner signs in at http://127.0.0.1:3020 and adds one test company and one deal to the pipeline, then deletes
  them.
- The CEO tab shows no unresolved findings for this department. There are no sales-specific findings; if
  "expected skills aren't installed" lists a Sales & Partnerships skill, reinstall the plugin it belongs to.

## Done when

- [ ] Twenty (or EspoCRM) shows as running on the department tab.
- [ ] The four `com.hq.twenty*` services are running (for Twenty).
- [ ] The owner has created the workspace and their own login, and can sign in.
- [ ] The pipeline stages match how the business actually sells (the owner has looked at them).
- [ ] All nine sales skills show as ready on the department tab.

## Good to know

- **Nothing is sent without the owner's yes.** The skills draft outreach, proposals and follow-ups; the owner sends
  them, or approves each send.
- **Contacts stay in the CRM.** Lead and customer names, emails and phone numbers never go into HQ profiles,
  reviews, plans or the scorecard. A weekly plan can say "12 leads in Qualified", not who they are.
- **Free tools only.** If a lead-finding source wants a paid plan, say so and use a free one.
- **Upgrading Twenty:** take a backup first (`npm run hq -- backup run`), then follow the upgrade steps in
  `setup/twenty/README.md`. Restarting `com.hq.twenty` runs Twenty's upgrade.
- **Where its data lives:** the database cluster in `~/.local/var/twenty/pg` (cold-copied by the nightly backup) and
  uploaded files in `$HQ_DATA/files/twenty` (inside the backup).
- Never sign up for a lead database, partner platform or affiliate network on the owner's behalf.
