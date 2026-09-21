#!/usr/bin/env bash
# ctl rebuild — pull --ff-only in the primary checkout, rebuild server+web, verify the running artifact.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || true
P="$(ctl_primary)"; cd "$P" || ctl_fail rebuild "no primary checkout at $P"
[ "$(/usr/bin/git branch --show-current)" = "main" ] || ctl_fail rebuild "primary checkout is not on main"
[ -z "$(/usr/bin/git status --porcelain)" ] || ctl_fail rebuild "primary checkout is dirty"
[ -f .env ] || ctl_fail rebuild "no .env in the primary checkout (sign-in would silently switch off)"
ctl_node22 || exit 1
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: git pull --ff-only origin main; pnpm dev:stack:rebuild; verify"; ctl_ok rebuild "dry-run"; fi
/usr/bin/git pull -q --ff-only origin main || ctl_fail rebuild "pull --ff-only failed"
sha="$(/usr/bin/git rev-parse --short=12 HEAD)"; start="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"; log="$(ctl_log rebuild)"
pnpm dev:stack:rebuild > "$log" 2>&1 || ctl_fail rebuild "dev:stack:rebuild rc=$? (log $log)"
for c in gisik-nokma-dev-server-1 gisik-nokma-dev-web-1; do
  st="$(docker ps --filter "name=$c" --format '{{.Status}}')"; case "$st" in Up*) ;; *) ctl_fail rebuild "$c not Up: '$st'";; esac
  created="$(docker inspect --format '{{.Image}}' "$c" | xargs docker inspect --format '{{.Created}}')"
  [ "$created" \> "$start" ] || ctl_fail rebuild "$c image created $created is not newer than start $start"
done
case "$(docker ps --filter name=gisik-nokma-dev-server-1 --format '{{.Status}}')" in *healthy*) ;; *) ctl_fail rebuild "server not healthy";; esac
sp="$(docker port gisik-nokma-dev-server-1 | head -1 | awk -F: '{print $NF}')"; wp="$(docker port gisik-nokma-dev-web-1 | head -1 | awk -F: '{print $NF}')"
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$sp/healthz")" = 200 ] || ctl_fail rebuild "/healthz on :$sp not 200"
wc="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$wp/")"; case "$wc" in 2*|3*) ;; *) ctl_fail rebuild "web / on :$wp answered $wc";; esac
gid="$(docker exec gisik-nokma-dev-server-1 sh -c 'printf %s "$GOOGLE_CLIENT_ID"' | cut -c1-6)"; [ -n "$gid" ] || ctl_fail rebuild "GOOGLE_CLIENT_ID empty inside the server container"
ctl_ok rebuild "$sha images fresh, server healthy, /healthz 200 on :$sp, web :$wp $wc, sign-in configured (log $log)"
