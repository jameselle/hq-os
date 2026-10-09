# Load testing: how many customers at once

> **If you are an AI walking an owner through this:** use `/hq:load-test`. Never point load at production: build a
> disposable copy and test that. Creating the copy costs money (a small cloud server for an hour or so), so name the
> cost and get the owner's yes first, and delete it when the run is done. The copy holds no customer data and no live
> keys: it can't email, charge or text anyone. Never read `.env` files.

The workflow **Load test before growth** (Product & Engineering) answers one question before a launch, a paid push
or a new plan: how many customers can use the product at the same time and still get a good answer? It's re-run
every month anyway, because code and data grow.

## How it works

1. **Simulated customers that behave like real ones.** Split them by plan the way the business's customers split
   (for example 60% free, 30% mid plan, 10% top plan), each with **its own key or login**, so per-customer rate limits
   apply as they do in real life. Give each plan the pacing a real customer has: a free user who checks once a
   minute, a paid integration that polls every 15 seconds, a top-plan user holding a live stream. Add a few site
   visitors if the same server serves the website.
2. **A disposable copy of production.** Same server size and region, same software versions and settings (swap, cache
   limits, proxy limits), this code, and production's data **without** customer rows: restore a backup through an
   allowlist of tables. Anything production runs alongside the app (a data refresh, a queue worker) runs on the copy
   too, at the same rhythm and roughly the same CPU, because that's usually what tips it over.
3. **Steps, not one big blast.** For example 10, 25, 50, then 100 customers, each held 10 minutes after a one-minute
   ramp. Only each hold is judged, so the first failing step shows where the limit is.
4. **Watch the server, not only the response times.** Every 5 seconds: CPU (and steal), memory and swap, the app's
   memory, cache memory, database connections and lock waits, and a loopback health check as a proxy for a backed-up
   event loop.
5. **A verdict per step** against the business's pass criteria, for example: main endpoint p95 under 2 s, no server
   errors, under 1% non-200 responses, at least 400 MB of memory free, health check p95 under 1 s, background jobs
   finishing inside their cycle.
6. **Record it in HQ**, then tear the copy down.

## Set it up

```bash
npm run hq -- loadtest setup <slug> --target 50 --cadence 30 --primary <main endpoint> \
  --repo <path to the harness> --provision "<command>" --run "<command>" --teardown "<command>" \
  --staging "1 vCPU / 2 GB, same region as production, catalogue tables only"
```

`--target` is how many customers at once the business plans for: the next launch's peak, or the growth plan's
number. Commands are shown to `/hq:load-test` and in the vault note; HQ never runs them by itself.

## The harness

Start from `templates/loadtest/` and put it in the business's own (private) repo, next to the code it tests:

| File | What it does |
|---|---|
| `users.js` | The k6 script: the plans, their share and pacing, one key per simulated customer, the steps. |
| `guard.mjs` | Refuses to mint keys or write data unless a staging marker exists **and** the database holds no account the harness didn't create. |
| `sample-server.sh` | The 5-second sampler on the copy. |
| `report.mjs` | Turns k6's CSV and the samples into `report.json` + `report.md`, one verdict per step. |

The business adds what only it knows: how to build the copy (a provisioning script for its cloud), the backup
allowlist, and a stand-in for its background jobs. A worked example lives in the harness README.

## The report HQ reads

`report.json` in the run folder:

```json
{
  "meta": { "startedAt": 1791400000, "commit": "a1b2c3d", "steps": "10,25,50,100", "hold": "10m" },
  "steps": [
    { "users": 10, "pass": true, "rps": 1.9, "fails": [], "endpoints": { "catalogue": { "p95": 180 } } },
    { "users": 50, "pass": false, "rps": 8.7, "fails": ["memory available fell to 310 MB"], "endpoints": { "catalogue": { "p95": 2400 } } }
  ]
}
```

`npm run hq -- loadtest record <slug> <run folder> --label "before launch"` keeps a summary: when, the commit, each
step's verdict and headline p95, the most customers that passed (counting only steps below the first failure) and the
first failure's reason. Reasons that look like a host, an address, an email or a key are dropped.

## What HQ does with it

- **Workflows tab:** the workflow is live while the newest run meets the target and is within the cadence, in part
  otherwise, with the reason.
- **Data & Analytics:** `load_test_users`, the most customers at once that passed in the latest run.
- **CEO:** the finding **Load test due** opens when no run is recorded, the newest is older than the cadence, or it
  fell short of the target.
- **Vault:** `Departments/Product & Engineering/Load tests.md` lists every run and how to run the next one.

`npm run hq -- loadtest show <slug>` and `npm run hq -- loadtest due --all` read it from the command line.

## Good to know

- Exempt the load generator from per-IP limits on the copy (every simulated customer shares its one IP; real
  customers don't), and say so in the report.
- A 429 in a run where every customer has its own key means a real customer would have seen one too.
- Run the generator from a second server next to the copy, on the private network, so neither home internet nor the
  generator's own CPU is the bottleneck.
- A run on synthetic data on a laptop proves the scripts work. It says nothing about capacity.
