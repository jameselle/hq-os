# Load-test harness template

The starting point for the **Load test before growth** workflow (guide: `docs/guides/load-test.md`, skill:
`/hq:load-test`). Copy this folder into the business's own private repo, next to the code it tests, and fill in
the parts only the business knows.

| File | Use as is? | What to change |
|---|---|---|
| `users.js` | Edit the PLANS block | Plans, their share of customers, pacing, the requests one visit makes, the stream and the site pages. |
| `guard.mjs` | Yes | `FOREIGN_ACCOUNTS_SQL` if keys or accounts don't live in an `api_keys` table with an `email` column. |
| `sample-server.sh` | Yes | Run it with `APP_UNIT`, `JOB_UNIT` and `HEALTH_URL` for the copy. |
| `report.mjs` | Edit CRITERIA | The pass bar. `PRIMARY=<endpoint>` names the headline endpoint (same as `loadtest setup --primary`). |

## What the business adds

1. **Provision** (`provision.sh`): create the disposable copy and the load generator, the same size, region and
   software settings as production. Mark the copy (`/etc/loadtest-staging`), firewall it to the generator and the
   owner, and restore production's data **through an allowlist of tables**, so customer rows never land on it.
   Give it no live keys for payments, email, SMS or third parties.
2. **Mint keys** (`mint-keys.mjs`): one key or login per simulated customer, by plan, emails like
   `loadtest+<plan>-<n>@example.invalid`, called after `assertDisposable()`. Raw keys go to a 0600 file on the
   generator only.
3. **Background jobs**: if production runs a refresh or a worker beside the app, run the same thing on the copy on the
   same timer (a stand-in that does similar writes and burns similar CPU is fine), and log one JSON line per run.
4. **Run** (`run.sh`): start the sampler, run k6 on the generator, collect `k6.csv.gz`, `samples.csv`, `jobs.jsonl`
   and a `meta.json`, then `node report.mjs <run folder>`.
5. **Teardown** (`teardown.sh`): delete exactly the copy and the generator (by tag and by name), never anything else.

Then, from HQ: `npm run hq -- loadtest record <slug> <run folder>`.

## Rehearse first

Before paying for servers, run the whole thing locally against synthetic data (a local database, the app, a few
simulated customers for a minute): it proves the scripts, keys, guard and report work. It says nothing about capacity.
