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
- Object-store keys: create the new pair, update the SECRETs, redeploy, **then** verify against the
  DEPLOYED environment before revoking anything:

      doctl apps logs <app-id> backup-worker --follow      # watch the next scheduled run succeed

  or force one inside the running container, which is the only place the rotated SECRETs exist:

      node dist/ops/backup-daemon-main.js --once

  **Do not verify by running `ops:backup-once` from a checkout.** That exercises your LOCAL
  `OBJECT_STORE_S3_*`, not the rotated App Platform secrets, so it can pass while the deployed worker is
  broken — and the next instruction revokes the working pair on the strength of it. Revoke the old pair
  only after a run that used the new keys **in the deployment**.

### `APPLE_CLIENT_SECRET` — the one credential that expires on its own

Sign in with Apple's `client_secret` is not a string Apple issues; it is a JWT this repo signs, and
Apple caps its lifetime at **six months**. Nothing warns you: the day it expires, Apple sign-in starts
answering an error at the token endpoint that says nothing about lifetime, and every other credential
in this product keeps working. **Put the expiry date in a calendar when you mint it.**

Mint a fresh one from the four key-material variables (`APPLE_TEAM_ID`, `APPLE_KEY_ID`,
`APPLE_CLIENT_ID` — the Services ID, not the App ID — and `APPLE_PRIVATE_KEY`, the `.p8` contents):

      node scripts/mint-apple-client-secret.mjs

It prints the JWT on stdout and everything else on stderr, so it pipes into a secret store cleanly. It
**self-tests before every mint**, because two ways of getting this wrong are accepted by every local
check and refused only by Apple: an ECDSA signature in DER rather than the JOSE `r||s` pair (Node's
default, and a valid signature that is not a valid JWS), and a lifetime past Apple's ceiling. The
self-test asserts the signature is 64 bytes AND that a 365-day request is refused — verifying the
signature alone would pass for DER.

Rotation is safe and needs no announcement: a client secret is presented per token exchange, so a new
one takes effect on the next sign-in and no session is invalidated. Set the new value, redeploy, then
sign in with Apple once against the DEPLOYMENT before discarding the old value — the same rule as the
object-store keys, and for the same reason. **The `.p8` key itself is NOT rotated by this**; Apple
lets you download it exactly once, and if it is lost you create a new key in the developer portal and
mint against that.

## Backups

Nightly `pg_dump` (21:00 UTC = 02:30 IST) and weekly Sunday ledger export (22:00 UTC), both to the
backups bucket in BLR1, both alerting the webhook on failure. Manual run:

    pnpm --filter @gisik-nokma/server run ops:backup-once

The managed database's own daily backups are a second string, not the plan.

## Orphaned uploads (monthly, with the restore drill)

An upload whose object reached the store but whose row and ledger event never landed leaves **bytes** no
view can reach and no claim names. Harmless to honesty, unbounded in storage.

    pnpm --filter @gisik-nokma/server run sweep:orphans

**The script is `sweep:orphans`.** (An earlier draft of this runbook called it `ops:sweep-orphans`, which
has never existed — one of the two ghosts that motivated the command check at the top of this file.)

**What it deletes, stated exactly, because a wrong delete here is unrecoverable.** It lists OBJECTS from
the store and deletes an object only when it is **older than 30 days** *and* **named by nothing** — where
"named by nothing" means **neither** an `attachments` row **nor** an `attachment.added` event references
it. Both signals, joined by OR, in two queries per object with the age compared in JS; not one query, and
not the ledger event alone.

**That union is load-bearing and must not be "simplified" to the ledger event.** `sweep-orphans.ts`'s own
docblock says why: the web client does not currently post `attachment.added` at all, so treating the
ledger event as the only survival signal would flag essentially every live attachment in this product as
an orphan. An earlier draft of this section described exactly that one-signal rule — if you are here to
make the code match the runbook, the runbook was wrong, not the code.

**It does not delete `attachments` rows.** There is no `DELETE FROM attachments` anywhere in
`apps/server/src`. Orphaned rows — a row whose object never arrived — therefore accumulate and are not
swept by this tool. That is a known gap, not an oversight of this runbook.

Run with `--dry-run` first and expect single digits; a large count means clients are failing between
upload and ingest, which is an incident, not a cleanup.

## Restore drill (monthly, and after any schema change)

0. Export the object-store credentials the fetch needs — `OBJECT_STORE_S3_*` and the backups bucket
   (`ops:fetch-backup` prints exactly which when they are missing). Against DO managed Postgres, the
   `createdb` and connection strings below also need `-U <user> -p 25060` and TLS.
1. `pnpm --filter @gisik-nokma/server run ops:fetch-backup -- pg/<latest>.dump /tmp/drill.dump`
2. `createdb -h <host> gisik_drill_$(date +%Y%m%d)` (any scratch name containing `drill`)
3. `scripts/restore.sh /tmp/drill.dump '<scratch database url>'` — the script refuses any target whose
   name does not contain `scratch`, `restore` or `drill`
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

1. **It needs DDL on the database it verifies, and the only safe place to grant that is a scratch copy.**
   `verifyProjections` creates a `verify_shadow` schema, makes a `LIKE public.<t> INCLUDING ALL` copy of
   every *declared* projection table, and rebuilds into it under `search_path = verify_shadow, public`.
   That is a `CREATE SCHEMA` + `CREATE TABLE` per run — a standing DDL grant on production, for one
   monthly procedure, so that a tool can build and drop scratch tables next to live data.

   **NOTE, because an earlier draft of this section got it backwards:** the verifier does **not** rewrite
   live projections. Its own docblock says "Live tables are never written", and three cases assert it by
   execution (5.55, 6.117, 7.63). The reason to keep it off production is the DDL grant and the hazard
   below — *not* that a run would clobber the rows it judges.

   **The hazard that grant would expose is real and sharper than the false one.** The shadow trick is safe
   only while every registered projection *declares* its table: a projection missing from `tables` gets no
   shadow copy, so its unqualified `TRUNCATE` resolves through `search_path` to **`public`** and truncates
   the live table. Cases 5.55 and 7.63 both name that trap. On a scratch database that is a lost scratch
   database; on production it is a lost projection.
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

People are never invented: the owner signs in once first. Then, **from a repo checkout** with
`DATABASE_URL` pointed at production:

    pnpm --filter @gisik-nokma/server run seed:cc -- --owner-email <email> --allow-missing-guest

Re-run with `--accountant-email` once the accountant has signed in — the seed is idempotent; the second
run adds only the guest surface.

`seed:dev` the same way, but **without** `--allow-missing-guest`, which it does not accept:

    pnpm --filter @gisik-nokma/server run seed:dev -- --owner-email <email>

**Both seeds must run from a checkout. Neither can run inside the production container**, and an earlier
draft of this section said the opposite about `seed:cc` — measured in the wrong environment, which is
worth stating because the mistake is easy to repeat:

- The runtime image has **no `reference/`, no `src/`, no `tsx` and no `pnpm`** — verified against the
  image itself, `docker run --rm --entrypoint sh <image> -c 'ls /app'`: `dist`, `migrations`,
  `node_modules`, `package.json` and config, nothing else. `Dockerfile` deletes `/out/src`, and `tsx` is a
  devDependency pruned by `pnpm deploy --prod`.
- `seed:cc` reads `reference/convenience-corner-tracker/board.data.js` at runtime and `seed:dev` reads
  `docs/superpowers/plans/`; `docs` is in `.dockerignore`.
- **Why it looked otherwise:** `docker-compose.dev.yml` bind-mounts `./reference:/app/reference:ro`, so
  `reference/` *is* present in the DEV container — via a host mount App Platform has no equivalent of.
  Checking inside a running dev container answers a different question than checking the image.

## Dev stack — hot-reload mode

The dev `server` normally runs the image built by `apps/server/Dockerfile`, which bakes `dist` at
build time. **Hot mode replaces that with the branch's SOURCE**: the container bind-mounts the source
directories and restarts itself on save, so what is live on the API origin is what is in the checkout
— no rebuild, no `restart`, no waiting.

**Since 2026-09-18 the `web` is hot too**, so there are two of these: `server` on the API origin (:3000)
and `web` on :3001, the one a browser talks to. Both serve the checkout you ran the command from. The
`web` half has its own section below, because its watcher is a different one and behaves differently.

    pnpm dev:stack

That is the whole command. It composes `docker-compose.dev.yml` with `docker-compose.hot.yml`, and
**run it from the checkout whose code should be live** — the mounts resolve relative to the directory
of the **first `-f` file**, which for `pnpm dev:stack` is the checkout you run it from, so that
worktree is the worktree the container serves. `docker-compose.dev.yml` itself is untouched by hot
mode: the production image path and the compose contract suite read exactly what they read before.

**`.env` must exist in that checkout** — copy it from wherever the owner keeps it. It is gitignored
(`.gitignore:11`) and per-checkout by design, so a fresh worktree has none.

What `--env-file .env` actually buys is worth stating precisely, because the intuitive reading is
wrong and was measured wrong here. Compose **auto-loads `.env` from the project directory** even
without the flag, so omitting `--env-file` does **not** empty `${GOOGLE_CLIENT_ID:-}` — measured:
`docker compose -f docker-compose.dev.yml -f docker-compose.hot.yml config` with no `--env-file`
renders `GOOGLE_CLIENT_ID` at its full 72 characters, while `env | grep -c GOOGLE_CLIENT_ID` in the
shell returns 0, so the value can only have come from `.env`. The flag's real value is that it turns a
**missing** `.env` from a silent empty substitution into a hard stop (`Couldn't find env file`,
exit 1). The dangerous shape is therefore not "no flag" but **no `.env` in the project directory** —
which is what the flag converts into a stop instead of a server that comes up looking healthy with
**Google sign-in OFF**, as happened once on 2026-09-09.

To point at a checkout other than the one you are standing in, the `-f` path must be **absolute** —
a relative one resolves against your shell's cwd and picks up the wrong tree:

    docker compose --env-file /Users/kiro/my_projects/gisik-nokma/.env \
      -f /Users/kiro/my_projects/gisik-nokma/docker-compose.dev.yml \
      -f /Users/kiro/my_projects/gisik-nokma/docker-compose.hot.yml up -d server web

**Rebuild rule — the one case that needs `--build`.** The image carries the installed dependencies and
the workspace packages' `dist`; hot mode refreshes source, not the lockfile. So:

- source edits — **nothing to do**, the watchers pick them up;
- **a NEW MIGRATION — `docker compose … restart server`.** `apps/server/migrations` is bind-mounted,
  but nothing *watches* it: migrations run once, in the container command's first step, at start. A
  developer who adds one and follows "source edits — nothing to do" gets the file present and
  unapplied, on a database the server then queries as though it were current;
- `pnpm-lock.yaml` or any `package.json` changed — re-run `pnpm dev:stack` **with `--build`**;
- **`apps/web`'s TypeScript config changed — also `--build`.** It is deliberately NOT bind-mounted (Next
  rewrites that file; see the web section), so the container keeps the image's copy and a host edit is
  invisible;
- **`apps/web/next.config.ts` changed — `docker compose … restart web`**, not a rebuild: it IS mounted, but
  Next reads it when the dev server starts;
- a NEW workspace package added — also needs a line in the `dev` stage's manifest `COPY` block in
  **both** `apps/server/Dockerfile` and `apps/web/Dockerfile`. The install at the end of those stages runs
  after `COPY . .`, so the importer is present by then; it is the earlier fetch step whose cache key the
  manifest list sets, and a package missing from it surfaces as an offline-store miss.

**One save shape is missed silently — and on THIS watcher it is not merely missed, it kills the watch.**
A **rename-over** save — write a temp file, then `mv` it onto the path — delivers **no inotify event into
the container at all**, so the watcher never fires and the edit never lands. An in-place write (truncate and
write the same inode) is delivered normally. Timestamped `fs.watch` on one file: in-place → one event at
3887 ms; rename-over → **zero events**. In-place reloads measured: a `apps/server/src` edit in
**1.62 s**, a `packages/*/src` edit in **3.92 s** (via `dist`).

**RE-MEASURED 2026-09-18 (Step 1b) — the shape mattered more than it looked, and the fix is in this file.**

- **The assistant's own Edit tool writes by rename-over.** Host inode changes on every edit — measured three
  times across two files (`204060486 → 204060616 → 204060679`, `204014631 → 204061084`). So the shape this
  paragraph calls an occasional "atomic save" is what EVERY server-source edit by the assistant produces.
- **The watch did not survive it.** After one such write to `src/index.ts`, neither a true in-place write
  (host inode preserved, measured) nor a `touch` produced a `[tsx]` line in 15–20 s. The **positive control**
  that makes those two a negative rather than an unread log: after `docker compose … restart server`, the
  SAME in-place write produced `[tsx] change in ./src/index.ts Restarting...` in **0.5 s**. In between, the
  live API kept serving stale code while `/healthz` answered 200 and the file on the mount was correct —
  the 2026-09-09 shape, reachable with no rebuild involved.
- **The first door was measured and is CLOSED.** `node --watch --import tsx src/index.ts` — Node's watch mode
  watches each loaded module's parent directory rather than the inode, so it should be indifferent to the
  save shape — did not restart on a host rename-over, a host in-place write, **or a write made inside the
  container**. A container-local write crosses no mount at all, so that is the watcher not seeing its own
  entry point, not virtiofs losing events.
- **What is enabled instead: `CHOKIDAR_USEPOLLING=true` with `CHOKIDAR_INTERVAL=1000`** on the `server`
  service. Witnessed in ONE container, not restarted between the halves: an Edit-tool write (rename-over,
  inode verified changed) restarted it in **1.6 s** and its marker was served; a true in-place write AFTER
  that restarted it again in **1.6 s**, so the watch survived the rename; and a `packages/domain/src` edit
  reached `dist` and restarted the server, **2.6 s** end to end. Cost, settled `docker stats` in the same
  session with the variable overridden back to empty: **CPU 6.05–6.47 % with polling on versus 2.39–3.73 %
  off**, memory ~1.24 GiB versus ~1.22 GiB.

Polling was not enabled on the evidence as it stood — it is justified only when events provably do not cross
the Docker Desktop mount, and they do, partially. What changed is narrower and worse: the events that fail to
cross are exactly the ones the assistant's editor produces, and on this watcher the first failure is
permanent. The meter reading above is the price, taken rather than estimated.

**What is deliberately not mounted.** Two things, and mounting either breaks the container rather than
merely stale-ing it. `node_modules`: the host's are macOS-native and the container's are Linux, so
`tsx` loses `@esbuild/linux-*` and the server stops booting. `dist`: the watchers write it *inside* the
container, and a host `tsc --watch` writes the host's copy — sharing the path puts two writers on it.

**Verify the container is the hot one, and separately that the process is on current code.** These are
two different questions and one command cannot answer both:

    docker exec gisik-nokma-dev-server-1 grep -c closed_at /repo/apps/server/src/read/ticket-cards.ts

This reads the file **through the bind mount**, so it reports the host's content whatever the running
process holds. It proves the container is the `dev` stage with the mount live — in the runtime image
the path does not exist and `grep` exits 2 — and it does **not** prove the server reloaded. Do not
read it as "the branch is live": after a rename-over save (below) it prints the same number while the
process serves old code, which is precisely the 2026-09-09 stale-server shape in its new clothes. The
control `collaborator_ids`, in the same file, makes the measurement valid rather than void.

For the process itself, read the reload:

    docker logs --since 5m gisik-nokma-dev-server-1 2>&1 | grep '\[tsx\]'

No `[tsx] change in …` line after your edit means the watcher did not see the change — the failure
13.651 measures, and the one that is silent rather than slow.

**Watchers still alive — an operator check, because nothing inside the container will tell you.** A
dead package watcher is invisible from outside: the container stays up, `/healthz` keeps answering,
and `docker ps` still says healthy while package edits quietly stop reaching `dist`. This was not left
to a guard, because the guard was written, shipped, and **measured not to fire** — see the note in
`docker-compose.hot.yml`. So check it by hand:

    docker exec gisik-nokma-dev-server-1 sh -c 'ps -o args= | grep -c "[t]ypescript/bin/tsc"'

**Seven** is correct — one per workspace package. Fewer means a watcher died; restart the container.

**The brackets are load-bearing, and the version of this check before 2026-09-18 omitted them.** Measured on
a container with all seven alive: the unbracketed form prints **9**, and unbracketed `tsconfig.json --watch`
prints **11** — because the `sh -c` command line and the `grep` process both contain the pattern and match
THEMSELVES. That is a check whose stated value cannot be reached as written: an operator who counted
correctly would read a false alarm. Bracket the first character and the self-matches disappear —
`[t]ypescript/bin/tsc` → **7**, `[t]sconfig.json --watch` → **9** (the second number is why the paragraph above
tells you to count the first pattern: the near-miss also matches the recursive parent process).

### The `web` half — :3001, and where it differs from the server

`pnpm dev:stack` brings up **both** containers: `web` on the host's **:3001** and `server` on **:3000**. The
browser talks to :3001, and the `web` container proxies `/v1/*` and `/api/auth/*` to `server:3000` over the
compose network. Both serve the source of the checkout the command ran from.

**Taking :3001 over.** The `web` container binds the host's 3001, so whatever already holds it must go first,
and the order that keeps the owner's view alive longest is: build the image, then stop theirs, then
`up -d web`. Identify the listener before stopping it — it is `node` (`ps -o ucomm=`), titled `next-server`,
and its parent's argv is `next dev -p 3001`:

    lsof -nP -iTCP:3001 -sTCP:LISTEN
    ps -o ucomm= -p <pid>
    ps -o args= -p <ppid>

Measured 2026-09-18: cold image build **68 s**; `up -d web` → first answer **40 s** (307, the sign-in
redirect); kill → first answer **107 s**.

**Verify it — and the second command is the one that matters.** These ask different questions:

    curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/    # 307: the app is serving
    curl -s localhost:3001/v1/auth/methods                      # {"google":true,...}: the proxy reached the hot server

With `SERVER_ORIGIN` unset or wrong the proxied path returns **500 after a 30-second hang** while everything
else looks healthy — the app serves, the containers are Up, only /v1/* fails.

**For whether an EDIT landed, read the compile line, not the curl:**

    docker logs --since 5m gisik-nokma-dev-web-1 2>&1 | grep 'Compiled'

**A first version of this paragraph said `docker logs` WITHOUT `--since` under-reports. That was WRONG, and
the way it was wrong is worth keeping.** The reading behind it — 6 lines bare against 9 compile lines with
`--since 30m` — compared a **summarised** read against a pass-through one: this machine's Bash hook routes
commands through `rtk`, which can replace a bare `docker logs` result with its own summary. The tell was in
the output and went unread — a trailing `[warn] 0 warnings (0 unique)` / `[info] 0 info messages`, which is
rtk's footer, not the container's stdout. Re-run as a control, bare and `rtk proxy` agree exactly (**658
lines each**), so docker's default is the complete log and `--since` only narrows it. **If a log read looks
suspiciously short, suspect a summariser** — the footer is the evidence, and the container did not write it.

**Both save shapes reach Next's watcher, unlike the server's — and the in-place half was measured late.**
A true in-place write (host inode preserved, verified) compiled in **2.6 s**; a **rename-over** (`mv` a
modified copy onto the path) compiled in **1.6 s**. An earlier version of this paragraph attributed
"1.2 s / 1.5 s / 1.5 s" to in-place edits. **They were not in-place**: every write to that page in that pass
was either the assistant's Edit tool or an `mv`, and both change the inode — which is what the paragraph
above says the tool does. The numbers were right and the LABEL was wrong, and a reader would have taken it as
licence not to care about save shape on the web. The shape that matters is the one the `server`'s tsx watcher
permanently loses; Next's watcher takes it. One outlier was measured at **59.4 s**: it landed, but a
30-second wait reads it as lost, so wait for the compile line rather than a stopwatch. Polling stays OFF here.

**Package watchers.** The `web` container runs its own seven `tsc -p tsconfig.json --watch` processes — each
container writes its OWN `dist`, because two writers on one path is the failure, not two readers on one source.
Same operator check, same count, and the brackets are load-bearing (see the `server` paragraph above — the
unbracketed form counts its own command line):

    docker exec gisik-nokma-dev-web-1 sh -c 'ps -o args= | grep -c "[t]ypescript/bin/tsc"'   # 7

**Those watchers can silently stop delivering, and a `touch` does not revive them.** Measured 2026-09-18:
an in-place revert of a token in `packages/ui/src` was never compiled — 80 s later the container's
`packages/ui/dist/tokens.js` still held the replaced value and the SERVED page still showed it, with all seven
watchers alive, while the same edit an hour earlier had compiled in 6.7 s. A `touch` on the source changed
nothing. **The reliable recovery is `docker compose … restart web`** (307 again in 10 s, palette correct on
the first poll). This is the server's failure class on a different watcher — which is why the check for a
package edit is the content of `dist`, not the fact that you saved:

    docker exec gisik-nokma-dev-web-1 grep -c '<the new value>' /repo/packages/ui/dist/tokens.js

**Not mounted, and each for a reason.** `.next` (the dev compile cache — it must be the container's own;
`.dockerignore` already keeps the host's out of the image), `tsconfig.json` (Next REWRITES this file, adding
`next-env.d.ts` to `include`, so a read-write bind would let the container edit the host's tracked file), and
`package.json` (a dependency change is a lockfile change). `apps/web/next.config.ts` IS mounted, but Next reads
it when the dev server starts — so an edit to it needs `docker compose … restart web`, not a rebuild.

## MCP server

The assistant-facing door. It runs on the PERSON'S machine, not on ours — there is nothing to deploy —
so everything here is either a build, a database statement, or an answer to "why can't they sign in".
Full instructions for the person live in `packages/mcp-server/README.md`.

**Build** (from a checkout):

    pnpm --filter @gisik-nokma/mcp-server run build

**Configure.** The client config points `node` at the built `dist/main.js` and sets `GISIK_SERVER_URL`
to the **API** origin — `http://localhost:3000` in the dev stack, `https://pm-api.artsourced.in` in
production. Not the web origin. `GISIK_MCP_TOKEN_PATH` overrides the `~/.gisik-nokma/mcp-token` cache.

**Authorize.** Nothing happens at startup: the transport connects first and the device flow runs on the
first tool call, so a person who has not signed in sees a tool that waits, not a server that failed.
The instruction goes to the process's **stderr**, which most clients write to a log file. The code is
typed at `WEB_ORIGIN + /mcp/authorize`, so if that page 404s the server's `WEB_ORIGIN` is wrong — the
same setting behind *Sign-in refused with "Invalid origin"* below.

**Revoke.** People do it themselves at `WEB_ORIGIN + /mcp/tokens` — *Connected assistants* — which is
`DELETE /v1/me/mcp-tokens/:id`, scoped to the caller. Effective on that assistant's next call. From the
database, for one person's every connection:

    DELETE FROM mcp_tokens WHERE user_id = '<user id>'; `mcp_tokens.last_used` says whether the token is still being used; it is an
observation and no code path reads it to authorise anything. `mcp_tokens` has no `expires_at` on
purpose — see the header of `apps/server/migrations/1788600000000_mcp-device-auth.sql`.

**Never list `mcp_tokens` or `mcp_device_codes` in a projection's `tables` array.** They are not
projections and not rebuildable. `reset()` empties what that array names, and a rebuild that emptied
`mcp_tokens` would sign every MCP client out with no way to put them back — the ledger does not hold
these rows and cannot replay them.

**"The assistant says it is not signed in."** Expected once, on a revoked or expired-by-deletion token:
the server answers 401, the client clears its cache and starts a fresh device flow. Twice in a row is
not — the client surfaces the second 401 rather than looping, so look at `require-session` and whether
`mcp_tokens` has the row at all.

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
