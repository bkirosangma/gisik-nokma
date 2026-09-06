#!/usr/bin/env bash
# Restore a pg_dump custom-format backup. The freshness gate is the
# acceptance test: a restore is not done until verify-projections is clean.
set -euo pipefail

usage() {
  echo "usage: scripts/restore.sh <dump-file> <target-database-url> [--force-live]" >&2
  echo "  fetch a dump first:  pnpm --filter @gisik-nokma/server run ops:fetch-backup -- pg/<stamp>.dump /tmp/restore.dump" >&2
  echo "  version rule: run a pg_restore at least as new as the pg_dump that produced the archive, and NO NEWER than the target server's major version." >&2
  echo "  (an archive whose format version the reader does not understand is refused outright; and a pg_restore newer than the server emits settings the server rejects — pg_restore 18 sends 'SET transaction_timeout = 0', a PG17+ parameter, so restoring into a 16 server exits non-zero even though the data landed. Both directions were measured by hand, 2026-09-06; NO automated test performs a cross-version restore. The rule itself is asserted on this path and on the restore path.)" >&2
  exit 2
}

[[ $# -lt 2 ]] && usage
DUMP_FILE="$1"
TARGET_URL="$2"
FORCE="${3:-}"

# The guard runs BEFORE the dump file is checked, deliberately: the first
# question about a restore is "where is this going", and an operator who
# mistyped the target should be told that, not sent looking for a file.
DB_NAME="${TARGET_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"
if [[ ! "$DB_NAME" =~ (scratch|restore|drill) && "$FORCE" != "--force-live" ]]; then
  echo "refusing: target database '$DB_NAME' does not look like a scratch database." >&2
  echo "restore into a scratch database and verify first; pass --force-live only for a real disaster." >&2
  exit 1
fi

[[ -f "$DUMP_FILE" ]] || { echo "no such dump file: $DUMP_FILE" >&2; exit 1; }

# The password reaches libpq through PGPASSWORD and never through argv. Every
# process on this host can read another's arguments (`ps -ef`,
# `/proc/<pid>/cmdline`), and this script is the one an operator runs on the ops
# box, with production credentials, during an incident — the worst moment to
# publish them. `apps/server/src/ops/pg-dump.ts`'s `splitDatabaseUrl` exists for
# exactly this on the daemon side (case 13.31); this is the same split, in bash,
# for the operator-facing half of the pair.
#
# What does NOT match is passed through untouched rather than rejected: a URL
# with no password, and the libpq conninfo form (`host=... dbname=...`) that is
# not a URL at all — the same fail-open-on-parse choice `splitDatabaseUrl`
# makes, for the same reason (refusing here would break a form the tool takes).
if [[ "$TARGET_URL" =~ ^([a-zA-Z][a-zA-Z0-9+.-]*://[^:/@]+):([^@/]*)@(.*)$ ]]; then
  SAFE_URL="${BASH_REMATCH[1]}@${BASH_REMATCH[3]}"
  RAW_PASSWORD="${BASH_REMATCH[2]}"
  # Percent-DECODED before it becomes PGPASSWORD. libpq percent-decodes a URI's
  # password but takes PGPASSWORD literally, so handing over the still-encoded
  # bytes would turn a password containing `@`, `/` or `%` into an authentication
  # failure mid-incident — and `splitDatabaseUrl` decodes too
  # (`decodeURIComponent`), so not decoding here would make the two halves of the
  # pair disagree about the same DSN. Guarded on a literal `%` so the ordinary
  # password is passed through byte-for-byte rather than through `printf %b`,
  # which would also expand backslash escapes.
  if [[ "$RAW_PASSWORD" == *%* ]]; then
    PGPASSWORD="$(printf '%b' "${RAW_PASSWORD//%/\\x}")"
  else
    PGPASSWORD="$RAW_PASSWORD"
  fi
  export PGPASSWORD
else
  SAFE_URL="$TARGET_URL"
fi

# The version rule again, on the path that actually restores. It used to live
# only in `usage()`, which fires solely on a bad invocation — so the operator who
# typed the command CORRECTLY, the one whose restore the skew is about to break,
# was the one who never saw it.
echo "note: pg_restore must be at least as new as the pg_dump that wrote this archive, and NO NEWER than the target server's major version." >&2

pg_restore --no-owner --no-privileges --dbname "$SAFE_URL" "$DUMP_FILE"
echo "restored '$DUMP_FILE' into '$DB_NAME'."
echo "now prove it — the restore is not done until this is clean:"
echo "  DATABASE_URL='$SAFE_URL' pnpm --filter @gisik-nokma/server run verify:projections"
echo "  (that URL carries NO password — this script stripped it rather than print it to your terminal. Re-supply it, or export PGPASSWORD, before running the line above.)"
