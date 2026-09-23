# Provisioning (DigitalOcean, BLR1) — run once

**Nothing in this directory has been applied to a live app.** `app.yaml` is a
written spec; this file documents the steps that spec assumes will have been
run by hand before `doctl apps create` and after it. Applying any of it to a
real DigitalOcean account is explicitly out of scope for the task that wrote
this file (owner instruction, 2026-09-06) — only the file, the credential
obligation below, and this documentation are in scope.

Provider and domain were signed off 2026-08-20: DigitalOcean App Platform +
Managed PostgreSQL + Spaces, all BLR1, serving `pm.artsourced.in` /
`pm-api.artsourced.in`.

1. `doctl auth init` with the team token.
2. Spaces, region **SGP1** — ⚠ **not BLR1, corrected on go-live day 2026-09-22:** the
   account's full-access Spaces key was refused `CreateBucket` in BLR1 (`AccessDenied`,
   twice, twenty seconds apart) and accepted in SGP1 in the same minute with the same key,
   so BLR1 Spaces is closed to this account and the two buckets live in Singapore; App
   Platform and the database stay in BLR1. Create buckets `gisik-nokma-attachments` and
   `gisik-nokma-backups` (both private) and a Spaces key pair — done with `doctl spaces
   keys create gisik-nokma-app --grants 'bucket=;permission=fullaccess'` and `aws s3api
   create-bucket --endpoint-url https://sgp1.digitaloceanspaces.com`. Spaces
   **Standard Storage is available in BLR1**; **Cold Storage is not** —
   backups stay on Standard, which matches the design (nightly dumps and
   weekly ledger exports are read back during the monthly restore drill, so
   a cold tier optimised for never-reading would be the wrong shape).
   **Version rule for that drill, and for a real disaster:** the `pg_restore`
   the operator runs must be **at least as new as the `pg_dump` that produced
   the archive, and no newer than the target server's major version** — a
   reader older than the archive format refuses outright, and a `pg_restore`
   newer than the server sends settings the server rejects (measured
   2026-09-06: `pg_restore` 18.4 opens every restore with `SET
   transaction_timeout = 0`, a PG17+ parameter, so a 16 server answers
   `unrecognized configuration parameter` and the restore exits non-zero even
   though every row landed). On DO managed Postgres the server major is DO's
   choice and the client is whatever the operator's laptop carries, so this is
   an operational rule, not a theoretical one. **No automated test in this
   repo covers either direction** — CI pins a matched pair
   (`pgvector/pgvector:pg16` beside `postgresql-client-16`) precisely so it never
   exercises the skew; `scripts/restore.sh`'s usage text repeats the rule.
3. Nothing to substitute in `app.yaml` beyond the SECRET values below — the
   hosts and the two `BUILD_TIME` envs on `web` (`SERVER_ORIGIN`,
   `NEXT_PUBLIC_SERVER_URL`) are already the real production values.
4. `doctl apps create --spec deploy/do/app.yaml` — then paste every
   `type: SECRET` value in the dashboard (they are never committed):
   `BETTER_AUTH_SECRET`, `SMTP_URL`, `ALERT_WEBHOOK_URL`,
   `OBJECT_STORE_S3_ACCESS_KEY_ID`, `OBJECT_STORE_S3_SECRET_ACCESS_KEY` (on
   both `server` and the `backup` worker — see the note in `app.yaml` about
   the two possibly needing to diverge once Task 11 lands).
5. DNS, in the existing `artsourced.in` zone: two sibling CNAMEs, `pm` and
   `pm-api`, both pointing at the app's default hostname. Each is one label
   deep — siblings, not a nested name — so there is no apex/ALIAS record, no
   wildcard, and the zone's existing records are untouched. TLS issues
   automatically for both once DNS resolves.
6. **Set the timezone on the database itself** (owner decision 2026-08-20:
   time is Asia/Kolkata) — substituting the managed cluster's real database
   name:

       psql "$DATABASE_URL" -c "ALTER DATABASE <db> SET timezone TO 'Asia/Kolkata'"

   This is a provisioning step, not an app concern — see "Why the database,
   not just the pool" below. Then prove it, on a connection that asks for
   nothing:

       DATABASE_URL='<the managed url>' pnpm check:db-tz

   It must print `database timezone: Asia/Kolkata` and exit 0. If it exits 1,
   the `ALTER` did not take (or ran against the wrong database) — fix it
   before the first seed, because every subsequent ad-hoc query reads the
   wrong clock. (Falsifiability of this exact check was verified against a
   throwaway database forced to `UTC` before this file was written — see the
   PR that added it for the transcript.)
7. Uptime: create a check on `https://pm-api.artsourced.in/healthz` from the
   nearest probe region, alerting the owner's email.
8. First deploy runs migrations on boot (the entrypoint). Then, from a
   checkout with `DATABASE_URL` pointed at the managed DB: sign in once in
   the product, run the seed scripts per the runbook — they have LANDED
   (`seed:cc` and `seed:dev`, `apps/server/src/seed/cli-seed-*.ts`); this
   read "once Task 11 lands them".

## Three things this file does NOT fully resolve, left for whoever picks them up

- **`DEPLOY_SHA` is deliberately absent from `app.yaml`, not set to a
  placeholder.** `apps/server/src/config.ts` reads it as
  `z.string().min(1).default('dev')` — it has LANDED; this read "forthcoming on
  Lane E's branch, confirmed against their working tree, uncommitted as of this
  writing" — and
  `/healthz` will serve it verbatim on both its 200 and 503 branches so an
  operator can tell which commit answered during an incident — the reason
  Ruling P33 exists. App Platform does not populate a commit sha into a
  static spec on its own, and an explicit `dev` here would read as a
  deliberate production value rather than the unwired gap it is; an absent
  key falls through to the same runtime default, honestly. Closing the
  actual gap needs a CI step — run after `deploy_on_push` fires, in
  `.github/workflows/ci.yml` (Task 14) — that patches this key to the pushed
  sha and calls `doctl apps update <app-id> --spec deploy/do/app.yaml`. That
  step is itself a live-deploy action and is NOT built here, the same
  scope boundary that keeps this whole directory unapplied.
- **Whether the backup worker's S3 credentials are its own or shared with
  the app.** `.env.example` documents only `BACKUP_S3_BUCKET` (a bucket
  name) for the backup daemon, no separate credential pair. `app.yaml`'s
  `backup` worker currently reuses `OBJECT_STORE_S3_ACCESS_KEY_ID` /
  `OBJECT_STORE_S3_SECRET_ACCESS_KEY` as its working assumption. Task 11
  settles this; update `app.yaml` there if it decides otherwise.
- **`${db.DATABASE_URL}`'s `sslmode` query parameter is DigitalOcean's to set,
  not this file's.** Managed Postgres connection strings from DO end
  `?sslmode=require`. Under the installed `pg@8.23.0`, `require` is treated
  as an alias for `verify-full` (the certificate IS checked) — but `pg`'s own
  connection warning says this is a v8-only compatibility shim: `pg` v9 and
  `pg-connection-string` v3 adopt standard libpq semantics, where `require`
  only encrypts and stops verifying the server certificate. That change
  would be silent — no error, no failing test, just a downgrade a log
  warning nobody reads would be the only sign of. `DATABASE_CA_CERT` is the
  reason this matters: managed Postgres presents a CA the system trust store
  doesn't carry, so verify-full needs that PEM as its trust anchor.
  **`DATABASE_CA_CERT` is discarded whenever `DATABASE_URL` carries an `ssl*`
  query parameter — a DO-issued `?sslmode=require` URL among them — because
  `pg`'s `Object.assign({}, config, parse(connectionString))` lets the URL's
  parsed `ssl` value silently replace the caller's `ssl: { ca }` wholesale.
  No error, no failing test, just an unverified connection.** Lane E's T1
  (`withoutSslParameters` in `apps/server/src/db.ts`) strips those six
  parameters from the connection string before building the pool whenever a
  CA is configured, so the caller's `ssl: { ca }` reaches the driver intact
  instead. **That has LANDED**, so a `DATABASE_CA_CERT` set here takes effect:
  this read *"until that lands on `main`, a `DATABASE_CA_CERT` set here has no
  effect"*, which stopped being true when `withoutSslParameters` landed.

## Why the database, not just the pool

`apps/server/src/db.ts`'s `createPool` already sets the session timezone from
the application side, via `options: '-c timezone=Asia/Kolkata'` as a Postgres
startup parameter. That is correct and it stays. It is also **not sufficient
as the only mechanism**, for three reasons:

1. **It covers app connections only.** Every `psql` session an operator
   opens, every one-off `doctl`/console query, every future tool that
   connects with its own client — none of them go through `createPool`, so
   none of them get the zone. Those are exactly the sessions where a
   misread timestamp does damage quietly, during an incident.
2. **Connection poolers can drop startup options.** A managed pooler in
   transaction mode does not necessarily forward per-connection startup
   parameters to the backend it hands you. The `options` string can be
   silently ignored — no error, no warning, just UTC.
3. **A test that only proves the pool's own mechanism cannot prove the
   database's own default.** Any test built on a per-test database that a
   helper has already `ALTER`ed reads IST whether or not the pool's
   `options` startup parameter was honoured — it cannot fail, and an
   unfalsifiable check is not evidence. Deployment must not rest on one.

`scripts/check-db-timezone.mjs` connects with a bare client that sets **no**
startup options and runs no `SET TIME ZONE`, so the only thing that can make
it print `Asia/Kolkata` is the database's own default. It can fail, which is
the entire point of having it — proven above against a throwaway database
forced to `UTC`.

## The projection verifier's database privileges — RECORDED DECISION (Plan 11 Task 16)

The coordination doc requires this directory to carry **either** a DDL-capable credential for the
projection verifier **or** an explicit recorded decision that it runs only against restore scratch
databases. Until now it carried neither, which is why this section exists rather than a credential.

**Decision: `verify:projections` runs ONLY against restore scratch databases, never against production.
`deploy/do/` therefore carries no DDL-capable credential, and none should be added.**

Reasons, in order of weight:

1. **It needs DDL on whatever database it verifies, and a scratch copy is the only safe place to grant
   that.** `verifyProjections` creates a `verify_shadow` schema and a `LIKE public.<t> INCLUDING ALL` copy
   of every *declared* projection table, rebuilding into it under `search_path = verify_shadow, public`.
   That is `CREATE SCHEMA` + `CREATE TABLE` per run — a standing DDL grant on production for one monthly
   procedure.

   **An earlier draft of this section had the reason backwards and it is worth stating plainly:** the
   verifier does NOT rewrite live projections. Its docblock says "Live tables are never written" and three
   cases assert it by execution (5.55, 6.117, 7.63).

   **The hazard the grant would expose is real, and sharper than the false one.** The shadow trick holds
   only while every registered projection declares its table: one missing from `tables` gets no shadow
   copy, so its unqualified `TRUNCATE` resolves through `search_path` to `public` and truncates the LIVE
   table. On a scratch database that costs a scratch database; on production it costs a projection.
2. **A DDL credential in the deploy spec is a standing privilege for one monthly procedure.** The restore
   drill already yields a scratch database with full rights by construction, so the privilege exists
   exactly when needed and never otherwise.
3. **The scratch database is the honest place to verify a backup.** Verifying production says production
   is consistent; verifying the restored copy says the *backup* is restorable and consistent — the
   question a drill actually asks.

**What it costs, recorded so it can be revisited rather than rediscovered:** production projection drift
is not detected continuously. It surfaces at the next monthly drill against the most recent dump, so the
exposure window is up to a month and drift introduced after the last dump is invisible until the
following one. If that becomes unacceptable, the answer is a read-only continuous checker that compares
without rebuilding — **not** a DDL credential here.

*(This file is Lane C's, from Plan 11 Task 15; Lane C is finished with it. The obligation this discharges
travels with the file, which is why the decision is recorded here as well as in `docs/runbook.md`.)*
