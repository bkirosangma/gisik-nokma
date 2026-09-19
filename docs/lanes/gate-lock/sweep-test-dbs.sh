#!/bin/bash
# Drop IDLE orphaned `gisik_test_*` databases.
#
# ## Why this runs at the START of a gate, not the end
#
# `createTestDatabase` drops its database in `drop()`, called from `afterAll`.
# A killed run, a crashed worker, a jetsam kill, or a Postgres panic never
# reaches `afterAll` — so the cleanup that exists is exactly the cleanup that
# does not run on the occasions that produce the mess. 39 of these had
# accumulated by 2026-09-06, and they were part of the disk exhaustion that put
# the shared Postgres into a PANIC loop and took every lane's gate down.
#
# The end of a run is the wrong place for a cleanup whose whole purpose is to
# recover from runs that ended badly.
#
# ## The one rule: NEVER drop a database with a live connection
#
# Five lanes share this cluster. A `gisik_test_*` database with an active
# backend belongs to a peer's RUNNING suite, and dropping it turns their green
# run red with an error that looks like a code defect. So the selection is
# "orphaned AND idle", and `datallowconn`/`pg_stat_activity` is what tells them
# apart — not the name, and not the age.
set -u

# ## `--self-test` — the property this script got wrong, asserted rather than remembered
#
# Every other check in this repo carries its own self-test for the same reason
# (`check-case-ids: self-test passed …`, `check-migration-order: self-test passed (6 planted defects
# caught)`): **a check that cannot be seen to fail is a check nobody can trust.** This script had
# none, and that is how it swept nothing for days while printing a comfortable line.
#
# The assertion is exactly the one the defect violated: **a port that nothing publishes must FAIL,
# not skip** — because "skipping (not a failure)" was indistinguishable from a clean sweep.
if [ "${1:-}" = "--self-test" ]; then
  if SWEEP_PG_PORT=59999 bash "$0" >/dev/null 2>&1; then
    echo "sweep: SELF-TEST FAILED — exited 0 for a port nothing publishes; a skip that reads as success is the defect." >&2
    exit 1
  fi
  echo "sweep: self-test passed (a port nothing publishes FAILS, exit 1, rather than skipping)"
  exit 0
fi

# ## The container is DISCOVERED, never named
#
# ⚠ This script named `gisik-nokma-exec-postgres-1` and **that is not the container this suite
# uses.** `docker ps -a` shows it `Exited (255)`, hours stale, while the real one —
# `gisik-nokma-postgres-1` — was up the whole time on `:54329`. `docker exec` against a stopped
# container fails, so `pg_isready` failed, so the script printed the comfortable line below and
# **exited 0 having swept nothing**, reading exactly like a clean sweep. Measured 2026-09-20.
#
# **The name was never the property.** What this sweep must talk to is the Postgres the SUITE talks
# to, and the suite addresses it by its PUBLISHED PORT — `54329`, which is what `.env.example` and
# every lane's `DATABASE_URL` carry. So the port is what is matched, and a future rename cannot
# silently disable this again.
#
# ⚠ **The DEV stack's Postgres is up at the same time, on `54330`, and is deliberately NOT swept** —
# those are a human's databases, not orphaned test ones. Matching the port rather than a name pattern
# is what tells them apart; a pattern like `gisik-nokma*-postgres-1` would match both.
PG_PORT="${SWEEP_PG_PORT:-54329}"

CONTAINERS=$(docker ps --filter "publish=$PG_PORT" --format '{{.Names}}' 2>/dev/null)
COUNT=$(printf '%s' "$CONTAINERS" | grep -c .)

# ## A skip that reads as success IS the defect, so this now FAILS LOUDLY
#
# It used to `exit 0` with "skipping (not a failure)" whenever it could not reach Postgres — which
# made a WRONG CONTAINER, a STOPPED one and a genuinely absent one print the same comfortable line
# while the sweep did nothing. Exit 0 is what made the defect invisible for days.
#
# Failing loudly is safe here and that is measured, not assumed: `locked-test.sh:209` runs this as
# `bash sweep-test-dbs.sh || echo "sweep failed — continuing, …"`, so a non-zero exit is **loud and
# NON-FATAL** — the gate carries on, but a sweep that did not happen can no longer be read as a
# sweep that found nothing. (No `mapfile`: macOS ships bash 3.2.)
if [ "$COUNT" -eq 0 ]; then
  echo "sweep: FATAL — no RUNNING container publishes port $PG_PORT, so this sweep would drop NOTHING while looking clean." >&2
  echo "sweep:       the suite's Postgres is whichever publishes $PG_PORT; if it is down, that is a real condition to see." >&2
  exit 1
fi
if [ "$COUNT" -gt 1 ]; then
  echo "sweep: FATAL — $COUNT containers publish port $PG_PORT ($(printf '%s' "$CONTAINERS" | tr '\n' ' ')); refusing to guess which holds gisik_test_*." >&2
  exit 1
fi
CONTAINER="$CONTAINERS"
PSQL="docker exec $CONTAINER psql -U gisik -d postgres -tAc"

if ! docker exec "$CONTAINER" pg_isready -U gisik >/dev/null 2>&1; then
  echo "sweep: FATAL — container '$CONTAINER' publishes port $PG_PORT but is not accepting connections." >&2
  exit 1
fi
echo "sweep: targeting '$CONTAINER' (the container publishing $PG_PORT)"

total=$($PSQL "select count(*) from pg_database where datname like 'gisik\_test%'" | tr -d '\r')
echo "sweep: $total gisik_test_* databases present"

# Idle == zero backends attached. Computed in ONE query so the set cannot drift
# between "list" and "check" the way two round trips would allow.
idle=$($PSQL "
  select d.datname
  from pg_database d
  where d.datname like 'gisik\_test%'
    and not exists (
      select 1 from pg_stat_activity a where a.datname = d.datname
    )
  order by d.datname" | tr -d '\r')

busy=$($PSQL "
  select count(distinct a.datname)
  from pg_stat_activity a
  where a.datname like 'gisik\_test%'" | tr -d '\r')

if [ -n "$busy" ] && [ "$busy" -gt 0 ]; then
  echo "sweep: $busy database(s) have live connections — a PEER'S RUN. Leaving them alone."
fi

if [ -z "$idle" ]; then
  echo "sweep: nothing idle to drop"
  exit 0
fi

n=0
while IFS= read -r db; do
  [ -z "$db" ] && continue
  if $PSQL "drop database if exists \"$db\"" >/dev/null 2>&1; then
    n=$((n + 1))
  else
    echo "sweep: could not drop $db (probably acquired a connection since the query) — left in place"
  fi
done <<< "$idle"

after=$($PSQL "select count(*) from pg_database where datname like 'gisik\_test%'" | tr -d '\r')
echo "sweep: dropped $n, $after remain (of $total)"
