# Customer lifecycle

`/lifecycle` is a business-neutral view: activation and delivery bars, daily send attempts, workflow states, pseudonymous account rows and global pause/resume. It loads the selected business only. An unconfigured business shows no fabricated counts. The page refreshes the connected service every minute while open; email processing belongs to the remote service, not this browser.

## Private adapter

Store `lifecycle-connection.json` under `$HQ_DATA/businesses/<slug>/`, never in this repository:

```json
{"command":["/absolute/path/to/private-adapter"]}
```

The executable receives one JSON object on stdin with `action` equal to `report`, `pause` or `resume`. Return a version-1 snapshot matching `LifecycleSnapshot` in `lib/lifecycle.ts`. Commands are administrator-configured, never supplied by browser requests. Do not put credentials in command arguments. Only pseudonymous account references and aggregates should be returned. Snapshot files stay in the private business directory with owner-only permissions.

`observedAt` must be the source's observation time, not the adapter's current time. Stale or failed collections are visible and pause/resume is disabled for stale data. Reported provider acceptance is not delivery. Delivery callbacks must be verified by the service. Unconfigured flows are disabled, not ready to send.

The framework ships no connected business, provider credential, campaign content or customer data. Test fixtures use synthetic data. Different businesses may implement different opt-in and workflow policies behind the same snapshot interface.

For aggregate-only adapters set `readOnly: true` alongside `command` in the private connection. HQ disables send controls and rejects pause/resume server-side. Report empty delivery/history arrays when not observed; never equate campaign enrollment with a delivered message or marketing consent with activation.
