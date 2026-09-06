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

CONTAINER=gisik-nokma-exec-postgres-1
PSQL="docker exec $CONTAINER psql -U gisik -d postgres -tAc"

if ! docker exec "$CONTAINER" pg_isready -U gisik >/dev/null 2>&1; then
  echo "sweep: Postgres is not accepting connections — skipping (not a failure)"
  exit 0
fi

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
