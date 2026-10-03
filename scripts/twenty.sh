#!/bin/sh
# Twenty CRM for HQ on 127.0.0.1:3020, with its own Postgres (:5433) and Redis (:6380).
# Secrets come from the login Keychain (service hq-twenty, accounts db and app-secret) at
# launch; nothing secret is written to disk or printed. Built from source in
# ~/.local/opt/twenty/src (branch hq/local-patches), run with Node 24 side by side.
#   twenty.sh server   what the official image's entrypoint does, then the API + web app
#   twenty.sh worker   the background job worker
#   twenty.sh command <args>   a Twenty CLI command (e.g. upgrade)
set -e
SRV="$HOME/.local/opt/twenty/src/packages/twenty-server"
PATH="$HOME/.local/opt/node24/bin:$PATH"
export PATH
secret() { /usr/bin/security find-generic-password -s hq-twenty -a "$1" -w; }

PG_DATABASE_URL="postgres://twenty:$(secret db)@127.0.0.1:5433/twenty"
APP_SECRET="$(secret app-secret)"
export PG_DATABASE_URL APP_SECRET
export REDIS_URL=redis://127.0.0.1:6380
export NODE_ENV=production NODE_PORT=3020 SERVER_URL=http://127.0.0.1:3020
export STORAGE_TYPE=local STORAGE_LOCAL_PATH="${HQ_DATA:-$HOME/hq-data}/files/twenty"
# No phone-home: telemetry off (sign-up events to twenty-telemetry.com); enterprise checks only run with a key.
export TELEMETRY_ENABLED=false IS_BILLING_ENABLED=false SIGN_IN_PREFILLED=false
cd "$SRV"

case "$1" in
  server)
    # The image checks for the "core" schema with psql; this Mac has no psql, so use the pg driver.
    # Creates the database on first run. Exit 0: schema present, 1: empty database.
    set +e
    node -e '
      const { Client } = require("pg");
      (async () => {
        const url = new URL(process.env.PG_DATABASE_URL);
        const admin = new Client({ connectionString: (url.pathname = "/postgres", url.toString()) });
        await admin.connect();
        const db = await admin.query("select 1 from pg_database where datname = $1", ["twenty"]);
        if (!db.rowCount) await admin.query("create database twenty");
        await admin.end();
        const c = new Client({ connectionString: process.env.PG_DATABASE_URL });
        await c.connect();
        const r = await c.query("select exists (select 1 from information_schema.schemata where schema_name = $1) as e", ["core"]);
        await c.end();
        process.exit(r.rows[0].e ? 0 : 1);
      })().catch((e) => { console.error(e.message); process.exit(2); });
    '
    state=$?
    set -e
    if [ "$state" = 1 ]; then
      echo "empty database: setting up"
      node dist/database/scripts/setup-db.js
      node dist/command/command run-instance-commands --force --include-slow
    elif [ "$state" != 0 ]; then
      echo "can't reach Twenty's database on 127.0.0.1:5433; is com.hq.twenty.postgres running?" >&2
      exit 1
    fi
    node dist/command/command cache:flush || echo "warning: cache flush failed"
    node dist/command/command upgrade || echo "warning: upgrade finished with errors"
    node dist/command/command cache:flush || echo "warning: cache flush failed"
    node dist/command/command cron:register:all || echo "warning: couldn't register background jobs"
    exec node dist/main
    ;;
  worker) exec node dist/queue-worker/queue-worker ;;
  command) shift; exec node dist/command/command "$@" ;;
  *) echo "usage: twenty.sh server | worker | command <args>" >&2; exit 64 ;;
esac
