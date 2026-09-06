#!/usr/bin/env bash
# Restore a pg_dump custom-format backup. The freshness gate is the
# acceptance test: a restore is not done until verify-projections is clean.
set -euo pipefail

usage() {
  echo "usage: scripts/restore.sh <dump-file> <target-database-url> [--force-live]" >&2
  echo "  fetch a dump first:  pnpm --filter @gisik-nokma/server run ops:fetch-backup -- pg/<stamp>.dump /tmp/restore.dump" >&2
  echo "  version rule: run a pg_restore at least as new as the pg_dump that produced the archive, and NO NEWER than the target server's major version." >&2
  echo "  (an archive whose format version the reader does not understand is refused outright; and a pg_restore newer than the server emits settings the server rejects — pg_restore 18 sends 'SET transaction_timeout = 0', a PG17+ parameter, so restoring into a 16 server exits non-zero even though the data landed. Neither direction is covered by any automated test in this repo — measured by hand, 2026-09-06.)" >&2
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

pg_restore --no-owner --no-privileges --dbname "$TARGET_URL" "$DUMP_FILE"
echo "restored '$DUMP_FILE' into '$DB_NAME'."
echo "now prove it — the restore is not done until this is clean:"
echo "  DATABASE_URL='$TARGET_URL' pnpm --filter @gisik-nokma/server run verify:projections"
