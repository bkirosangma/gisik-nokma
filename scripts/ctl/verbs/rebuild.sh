#!/usr/bin/env bash
# ctl rebuild — pull --ff-only in the primary checkout, rebuild server+web, verify the running artifact.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || true
P="$(ctl_primary)"; cd "$P" || ctl_fail rebuild "no primary checkout at $P"
# THE STACK'S SOURCE IS THE PRIMARY CHECKOUT'S CURRENT BRANCH (owner, 2026-09-23: "on the next rebuild
# launch the dev stack from the release branch so that I can verify"). There is no bind mount and the images
# bake SERVER_ORIGIN/NEXT_PUBLIC_SERVER_URL as build args, so the served app is a snapshot of the tree built
# here -- Features.md, "The dev stack serves BUILT images". A merge to `main` now deploys to production, so
# work integrates on `release/<date>` (CLAUDE.md, first rule) and a stack pinned to `main` would serve code
# nobody is working on -- this repo's recorded stale-serving class, arrived at from the other direction.
#   The 2026-09-19 instruction ("run the servers from the main folder instead of the executor's branch") is
# NOT loosened here: it named this FOLDER -- the only checkout holding `.env` and the baked build args, and
# a worktree compose silently resolves those to "" with sign-in OFF -- not the `main` BRANCH. The folder is
# still fixed; only which branch it stands on has moved.
#   A task branch stays refused. An image is a snapshot of a tree, nothing inside the container names which
# tree, and a stack quietly built from someone's feature branch is unfalsifiable from the outside.
branch="$(/usr/bin/git branch --show-current)"
case "$branch" in
  main|release/*) ;;
  '') ctl_fail rebuild "primary checkout is on a detached HEAD — the stack is built from main or release/* only";;
  *)  ctl_fail rebuild "primary checkout is on '$branch' — the stack is built from main or release/* only, never a task branch";;
esac
[ -z "$(/usr/bin/git status --porcelain)" ] || ctl_fail rebuild "primary checkout is dirty"
[ -f .env ] || ctl_fail rebuild "no .env in the primary checkout (sign-in would silently switch off)"
ctl_node22 || exit 1
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: git pull --ff-only origin $branch; pnpm dev:stack:rebuild; verify"; ctl_ok rebuild "dry-run on $branch"; fi
/usr/bin/git pull -q --ff-only origin "$branch" || ctl_fail rebuild "pull --ff-only origin $branch failed"
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
# The branch and sha below are read from git HEAD at BUILD TIME, not witnessed inside the container: no sha
# is baked into the image, so nothing running can be asked which tree it came from. What is actually proven
# is (a) HEAD was $branch $sha when the build started and (b) each image's .Created is newer than that start
# -- together enough to exclude the stale-serving case, not enough to identify the tree from the outside.
# Baking the sha as a build arg would close that, and is not done here.
ctl_ok rebuild "$branch $sha images fresh, server healthy, /healthz 200 on :$sp, web :$wp $wc, sign-in configured (log $log)"
