# Runbook — Gisik Nokma

The ledger is the source of truth; projections are derived and rebuildable. Every procedure below leans
on that: restores are verified by rebuild-and-diff, never by eyeballing.

> **Every command named in this file is checked by `scripts/check-runbook-commands.mjs`, which runs in
> CI.** A runbook is prose, and prose cannot fail — so the one thing that *can* be made falsifiable is
> checked: every `pnpm … run <script>` and every repo-relative script path named below must actually
> resolve. It does not prove a procedure is correct. It proves the procedure is not calling something
> that does not exist, which is how two of the commands in this file's first draft were wrong.

## Deploy (routine)

Merge to `main` with approval → App Platform builds and deploys (`deploy_on_push`). Migrations run on
container boot (entrypoint) before the server listens. Watch `doctl apps logs <app-id> server --follow`;
confirm `GET /healthz` reports the new deploy sha.

## Deploy (first time)

See `deploy/do/README.md`. DigitalOcean App Platform + Managed PostgreSQL + Spaces, all BLR1, serving
`pm.artsourced.in` with the API at `pm-api.artsourced.in` — two sibling single-label CNAMEs (`pm`,
`pm-api`) in the `artsourced.in` zone, not a nested name.

**`WEB_ORIGIN` is an auth setting as well as a CORS one.** It is appended to better-auth's
`trustedOrigins`, which otherwise holds only `BETTER_AUTH_URL`'s origin — the API host, which no browser
ever sends. In this deployment the two are different hosts, so getting it wrong answers every
cookie-carrying POST from the web app with `403 {"code":"INVALID_ORIGIN"}` and renders "Invalid origin"
on the sign-in page. It is normalised at assembly and a wildcard is refused outright.

## Time — read this before reading any timestamp

Owner decision, 2026-08-20: **time is Asia/Kolkata**, everywhere, in v1. Three separate settings hold
that up, and they are not redundant:

- **`TZ=Asia/Kolkata`** on the server and backup-worker processes (`deploy/do/app.yaml`) — so log lines
  and anything the Node runtime formats read the same clock the product's screens do.
- **`ALTER DATABASE <db> SET timezone TO 'Asia/Kolkata'`** on the managed database at provisioning. This
  is why **an ad-hoc `psql` session prints IST — by design, not by accident.** The app pool also asks for
  the zone as a startup parameter, but that covers app connections only: your `psql`, a console query,
  and any pooler that quietly drops startup options all bypass it.
- **`pnpm check:db-tz`** — connects with a bare client that sets nothing and asserts `SHOW TimeZone` is
  `Asia/Kolkata`. Run it after provisioning, after any database restore, and after any managed-database
  maintenance that could reset defaults. **It is the only timezone check in the repo that can fail:** the
  suite's own `SHOW TimeZone` test runs against a database its helper already `ALTER`ed, so it passes
  either way and proves nothing about a deployment.

**Both ledger clocks are absolute instants.** `client_time` and `server_time` are `timestamptz`, so they
sort and compare with no cast, and one moment stated at `+05:30` and at `Z` is one moment. Changing a
session's timezone changes only how an instant is *printed*, never what was stored. The two columns
disagreeing is skew, which the product reports rather than hides.

`BACKUP_TIME_UTC` / `LEDGER_EXPORT_TIME_UTC` stay in UTC on purpose and are unaffected by `TZ` (the
scheduler reads only UTC accessors).

## Rotate secrets

- `BETTER_AUTH_SECRET`, `SMTP_URL`, `ALERT_WEBHOOK_URL`, the object-store keys: update the SECRET env in
  the App Platform dashboard (or `doctl apps update --spec`), redeploy. **Auth secret rotation
  invalidates sessions — announce first.**
- Database password: rotate in the managed-DB control panel; the injected `${db.DATABASE_URL}` follows
  automatically on redeploy.
- Spaces keys: create the new pair, update SECRETs, verify a `--once` backup succeeds, **then** revoke
  the old pair.

## Backups

Nightly `pg_dump` (21:00 UTC = 02:30 IST) and weekly Sunday ledger export (22:00 UTC), both to the
backups bucket in BLR1, both alerting the webhook on failure. Manual run:

    pnpm --filter @gisik-nokma/server run ops:backup-once

The managed database's own daily backups are a second string, not the plan.

## Orphaned uploads (monthly, with the restore drill)

An upload whose `attachment.added` never landed leaves an object and a row no view can reach and no
ledger event names. Harmless to honesty, unbounded in storage.

    pnpm --filter @gisik-nokma/server run sweep:orphans

**The script is `sweep:orphans`.** (An earlier draft of this runbook called it `ops:sweep-orphans`, which
has never existed — one of the two defects that motivated the command check at the top of this file.)

It deletes attachment rows and their objects that are **older than 30 days** and **referenced by no
`attachment.added` in the ledger** — both conditions in one query, and the ledger is never touched. That
constraint is the whole design: the sweep may only ever delete what the ledger has never heard of, so
nothing a claim points at can vanish. Run with `--dry-run` first and expect single digits; a large count
means clients are failing between upload and ingest, which is an incident, not a cleanup.

## Restore drill (monthly, and after any schema change)

1. `pnpm --filter @gisik-nokma/server run ops:fetch-backup -- pg/<latest>.dump /tmp/drill.dump`
2. `createdb -h <host> gisik_drill_$(date +%Y%m%d)` (any scratch name containing `drill`)
3. `scripts/restore.sh /tmp/drill.dump '<scratch database url>'`
4. `DATABASE_URL='<scratch url>' pnpm --filter @gisik-nokma/server run verify:projections`
   — the drill passes only on the clean line and exit 0.
5. Drop the scratch database. Record the drill — date, dump key, verdict — as a ticket in the Gisik Nokma
   workspace; the product keeps its own operational memory, which is the point of it.

> **Step 4 used to be impossible.** `verify:projections` opened with `loadConfig(process.env)`, which
> validates the whole server configuration and so demanded `BETTER_AUTH_URL`, a 32-character
> `BETTER_AUTH_SECRET` and `WEB_ORIGIN` — none of which it reads. The exact invocation above answered
> `ConfigError: invalid server configuration — check: BETTER_AUTH_URL, BETTER_AUTH_SECRET, WEB_ORIGIN`.
> It now reads `DATABASE_URL` directly, matching the seed CLIs and `sweep-notifications`. A drill nobody
> can run is not a recovery procedure, and demanding three auth secrets to read a scratch database invites
> an operator to invent production-shaped values while holding a restored copy of production.

**After a real restore into a real database** (not a drill): re-run
`ALTER DATABASE <db> SET timezone TO 'Asia/Kolkata'`, then `pnpm check:db-tz`. A `createdb` produces a
database with the cluster's default zone, and `pg_restore` restores objects, not the database-level
settings attached to the old database. Skipping this leaves a recovered system whose operator queries
silently read UTC — the stored instants are unharmed, but every person reading them is off by 5:30.

## The projection verifier's database privileges — RECORDED DECISION

The coordination doc requires `deploy/do/` to carry **either** a DDL-capable credential for the projection
verifier **or** an explicit recorded decision that it runs only against restore scratch databases. Neither
existed. **The decision, recorded here and in `deploy/do/README.md`:**

**`verify:projections` runs ONLY against restore scratch databases, never against production, and
`deploy/do/` therefore carries no DDL-capable credential.**

The reasons, in order of weight:

1. **The verifier's job is to detect drift, and drift is detected by rebuilding projections and diffing.**
   A rebuild against production would rewrite the very rows being judged — the check would destroy its own
   evidence and could not distinguish "projections were correct" from "projections have just been made
   correct".
2. **A DDL-capable credential in the deploy spec is a standing privilege that exists for one monthly
   procedure.** The restore drill already produces a scratch database with full rights by construction —
   whoever runs `createdb` owns it — so the privilege is available exactly when it is needed and at no
   other time.
3. **The scratch database is the honest place to verify a backup anyway.** Verifying production tells you
   production is consistent; verifying the restored copy tells you the *backup* is restorable and
   consistent, which is the question a drill is asked.

**What this decision costs, stated so it can be revisited:** production projection drift is not detected
continuously. It is detected at the next monthly drill, against the most recent dump — so the exposure
window is up to a month, and drift introduced after the last dump is invisible until the following one.
If that becomes unacceptable, the answer is a read-only continuous checker that compares without
rebuilding, **not** a DDL credential in the deploy spec.

## Seeding production

People are never invented: the owner signs in once first. Then, from a checkout with `DATABASE_URL`
pointed at production:

    pnpm --filter @gisik-nokma/server run seed:cc -- --owner-email <email> --allow-missing-guest

Re-run with `--accountant-email` once the accountant has signed in — the seed is idempotent; the second
run adds only the guest surface.

`seed:dev` the same way. **It must be run from a repo checkout, not from the container**: it reads
`docs/superpowers/plans/`, and that directory is not in the server image (`reference/` is, which is why
`seed:cc` runs in-container and `seed:dev` cannot).

## Incident basics

- **Is it up?** `curl https://pm-api.artsourced.in/healthz` — the deploy sha tells you what is running.
- **Logs:** `doctl apps logs <app-id> server --follow` (JSON lines; `err` carries stacks). 5xx bursts also
  hit the alert webhook.
- **429 storms:** a client in a retry loop — raise `RATE_LIMIT_*` only with a reason; the values are
  load-bearing on the auth endpoints.
- **Sign-in refused with "Invalid origin":** `WEB_ORIGIN` does not match the origin the browser is served
  from. See *Deploy (first time)*.
- **Database down:** App Platform restarts the server on health failure; managed PG failover is the
  provider's job. **After ANY restore: the drill procedure, no exceptions — an unverified restore is not
  a recovery.**
- **Refusal spikes** (`refused` results): not an incident — that is the product working. Look for a client
  bug only if the same actor repeats the same refusal rapidly.
