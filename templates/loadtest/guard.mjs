// HQ load-test template: refuse to touch anything that isn't a disposable copy.
// Import it first in every harness script that writes (minting keys, the background-job stand-in):
//   import { assertDisposable } from "./guard.mjs"; await assertDisposable();
// Two independent checks, both required:
//   1. a staging marker file exists (STAGING_MARKER, default /etc/loadtest-staging), written when the copy is built;
//   2. FOREIGN_ACCOUNTS_SQL returns 0: the database holds no account or key the harness didn't create. Production has
//      real customers, so even a marker made there by mistake can't get past this.
// Requires the `pg` package; swap the client for the business's database if it isn't Postgres.
import { existsSync } from "node:fs";

export const LOAD_EMAIL_PATTERN = "loadtest+%@example.invalid";

export async function assertDisposable(env = process.env) {
  const marker = env.STAGING_MARKER || "/etc/loadtest-staging";
  if (!existsSync(marker)) throw new Error(`refusing: no staging marker at ${marker}. This only runs on a disposable copy.`);
  if (!env.DATABASE_URL) throw new Error("refusing: DATABASE_URL is required");
  const sql = env.FOREIGN_ACCOUNTS_SQL || `SELECT count(*)::int AS n FROM api_keys WHERE email NOT LIKE '${LOAD_EMAIL_PATTERN}'`;
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(sql);
    const n = Number(Object.values(rows[0] ?? { n: 1 })[0]);
    if (n !== 0) throw new Error(`refusing: the database holds ${n} account(s) the harness did not create. This looks like a real database.`);
  } finally { await client.end(); }
}
