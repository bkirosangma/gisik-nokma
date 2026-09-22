#!/bin/sh
# The server image's entrypoint: apply migrations, then exec the command (the
# server, or the backup worker — both images are this one).
#
# GO-LIVE DAY, 2026-09-22: the first production boot died here with
# `SELF_SIGNED_CERT_IN_CHAIN`. App Platform binds `DATABASE_URL` from the managed
# cluster WITH `?sslmode=require`, which `pg` 8 treats as verify-full, and the
# managed CA is not in this image's trust store. The app's own pool already
# handles that through `DATABASE_CA_CERT` (`src/db.ts`); the migrator, a plain
# `node-pg-migrate` invocation, never did. So: when a CA is bound, write it to a
# file and hand the migrator a connection string that names it — `sslrootcert`
# is read from disk by `pg-connection-string` — through its OWN env var, so the
# app's `DATABASE_URL` is untouched. Without a CA (the dev stack, plain TCP) the
# migrator gets `DATABASE_URL` exactly as before. Case 13.1283.
set -e
if [ -n "${DATABASE_CA_CERT:-}" ]; then
  printf '%s' "$DATABASE_CA_CERT" > /tmp/db-ca.pem
  base="${DATABASE_URL%%\?*}"
  export MIGRATE_DATABASE_URL="${base}?sslmode=verify-full&sslrootcert=/tmp/db-ca.pem"
  echo 'gisik-nokma: migrating over verified TLS (DATABASE_CA_CERT bound)'
else
  export MIGRATE_DATABASE_URL="$DATABASE_URL"
fi
echo 'gisik-nokma: applying migrations...'
node node_modules/node-pg-migrate/bin/node-pg-migrate.js up --migrations-dir migrations -d MIGRATE_DATABASE_URL
echo 'gisik-nokma: migrations current.'
exec "$@"
