#!/usr/bin/env bash
# scripts/ctl/test/gate-cache.test.sh — does a cached (release-kind) gate MISS when a cross-package reader's input changes?
#
#   gate-cache.test.sh          fast: turbo's task HASH, from `turbo run … --dry=json`, before and after a change (selftest step)
#   gate-cache.test.sh --real   slow: a real warm run → HIT control → change → real MISS, in an APFS clone of the tree (opt-in)
#
# A cached gate replays a task's green log when its hash is unchanged, so the hash IS the cache key: a changed hash is a
# miss, an unchanged hash is a hit. The fast mode compares hashes; --real shows the same through turbo's own cache and is
# the evidence the fast mode stands in for (run it after editing turbo.json's `inputs`).
#
# Cases (13.1705-13.1709, 13.1712-13.1715 and 13.1718-13.1719, test-cases/13-deploy-and-ops.md). The shape is the #270 stale-cache incident: a test in one
# package reads a file in ANOTHER, and the cache key never saw it.
#   ui#test     reads every client source file (the colour scan) — change an apps/web/src file → MISS; a docs file → HIT
#   mobile#test reads the editor webview bundle — change a packages/editor CSS file → MISS; a docs file → HIT
#   mobile#test is ordered after editor#build:webview (the stale-build root cause), asserted from the task graph
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/lib.sh"
MODE="${1:-fast}"
repo="$(ctl_repo "$PWD")" || exit 1
ctl_node22 >/dev/null
TURBO="$repo/node_modules/.bin/turbo"
[ -x "$TURBO" ] || { echo "FAIL gate-cache: $TURBO missing — pnpm install first"; exit 1; }
UI=@gisik-nokma/ui; MOBILE=@gisik-nokma/mobile; APPCORE=@gisik-nokma/app-core; SERVER=@gisik-nokma/server; EDITOR=@gisik-nokma/editor
WCB=@gisik-nokma/workflow-canvas-browser
fails=0
. "$HERE/test/harness.sh"   # check NAME CODE, and the CTL_TEST_ONLY case filter

# A copy of the tree as it is NOW (tracked files, uncommitted edits included), committed, so turbo hashes it as a repo.
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
if [ "$MODE" = --real ]; then
  # --real needs node_modules and built dist: clone the whole tree (APFS copy-on-write, seconds). The cache is private to
  # the clone so the run neither reads nor pollutes the shared worktree cache.
  rm -rf "$work"; cp -cR "$repo" "$work" || { echo "FAIL gate-cache: cp -cR failed"; exit 1; }
  export TURBO_CACHE_DIR="$work/.turbo-test-cache"
else
  ( cd "$repo" && /usr/bin/git ls-files -z --cached --others --exclude-standard | rsync -a --from0 --files-from=- ./ "$work/" ) 2>/dev/null
fi
cd "$work" || exit 1
rm -rf .git; /usr/bin/git init -q . && /usr/bin/git add -A && /usr/bin/git -c user.name=t -c user.email=t@t commit -q -m copy

dry() { "$TURBO" run "${2:-test}" --filter="$1" --dry=json 2>/dev/null; }
# field <pkg> <taskId> <hash|status|deps> — the task run is the taskId's own (`<pkg>#typecheck` dries `typecheck`)
field() {
  dry "$1" "${2##*#}" | python3 -c '
import json,sys
d=json.load(sys.stdin); t=[x for x in d["tasks"] if x["taskId"]==sys.argv[1]][0]
print({"hash":t["hash"],"status":t["cache"]["status"],"deps":" ".join(t["dependencies"])}[sys.argv[2]])' "$2" "$3"
}
touch_file() { printf '\n/* gate-cache probe */\n' >> "$1"; }
reset() { /usr/bin/git checkout -q -- . ; }

web_file=$(/usr/bin/git ls-files apps/web/src | grep -E '\.tsx$' | sed -n 1p)
css_file=$(/usr/bin/git ls-files packages/editor/src | grep -E '\.css$' | sed -n 1p)
ctl_file=docs/lanes/gate-lock/README.md   # read by neither suite: the HIT control
[ -n "$web_file" ] && [ -n "$css_file" ] && [ -f "$ctl_file" ] || { echo "FAIL gate-cache: probe files missing ($web_file / $css_file / $ctl_file)"; exit 1; }

check "13.1707 mobile#test depends on editor#build:webview (the stale-build root cause)" 'field "$MOBILE" "$MOBILE#test" deps | grep -q "@gisik-nokma/editor#build:webview"'
# 13.1719: the package's own `#typecheck` entry keeps the generic `dependsOn: ["^build"]`. Emptied, the hash stops folding in the
# builds of app-core, domain and ui, so a type change there replays the harness's typecheck green; the hash rows below cannot see it.
check "13.1719 $WCB#typecheck depends on app-core, domain and ui #build (the generic typecheck's ^build, kept)" 'tc_deps=$(field "$WCB" "$WCB#typecheck" deps); for tc_pkg in app-core domain ui; do printf "%s\n" $tc_deps | grep -qx "@gisik-nokma/$tc_pkg#build" || tc_deps=MISSING; done; [ "$tc_deps" != MISSING ]'

if [ "$MODE" != --real ]; then
  # THE TABLE: id | task's package | probe file | what it stands for | HIT control (a file the task does not read) | task
  # (optional, default `test`). Every row asserts the control leaves the hash alone and the probe changes it. A row exists
  # for each input turbo.json declares that is NOT a dependency of the task (13.1712-13.1715, 13.1718-13.1719): remove the
  # entry and its row goes red
  # (shown 2026-10-02 by deleting each entry in turn). The server rows use CLAUDE.md as the control because server#test
  # reads docs/** — the README control would be a read file there. 13.1719 also probes the package's OWN harness: an entry
  # whose inputs name only the foreign file (`$TURBO_DEFAULT$` dropped) stops re-checking the harness itself.
  desktop_file=$(/usr/bin/git ls-files apps/desktop/src | sed -n 1p)
  pkgs_file=$(/usr/bin/git ls-files packages/mcp-server/src | sed -n 1p)
  ref_file=$(/usr/bin/git ls-files reference | sed -n 1p)
  views_file=$(/usr/bin/git ls-files packages/app-core/src/views | sed -n 1p)
  rows=(
    "13.1705|$UI|$web_file|an apps/web/src file, policed by the ui colour scan|$ctl_file"
    "13.1706|$MOBILE|$css_file|packages/editor CSS, which reaches mobile through the webview bundle|$ctl_file"
    "13.1712|$UI|tsconfig.base.json|tsconfig.base.json, a globalDependency of every task|$ctl_file"
    "13.1713|$APPCORE|docs/manual.md|docs/manual.md, which the help suite reads|$ctl_file"
    "13.1713|$APPCORE|$desktop_file|an apps/desktop/src file, under only the broad apps/** entry|$ctl_file"
    "13.1713|$APPCORE|$pkgs_file|a packages/mcp-server/src file, under only the broad packages/** entry|$ctl_file"
    "13.1714|$SERVER|$ref_file|a reference/ file, which the seed suites read|CLAUDE.md"
    "13.1714|$SERVER|.env.example|.env.example, which config.test.ts reads|CLAUDE.md"
    "13.1714|$SERVER|apps/web/e2e-stack/helpers/teardown.ts|the e2e teardown helper e2e-teardown.test.ts imports|CLAUDE.md"
    "13.1714|$SERVER|apps/web/next.config.ts|next.config.ts, which security-middleware.test.ts reads|CLAUDE.md"
    "13.1715|$EDITOR|$views_file|a packages/app-core/src/views file the editor tests read as text|$ctl_file"
    "13.1715|$EDITOR|packages/ui/test/helpers/css-rules.ts|the ui css-rules helper four editor tests import|$ctl_file"
    "13.1718|$WCB|apps/web/app/globals.css|apps/web globals.css, which the sheet-errors harness imports|$ctl_file"
    "13.1718|$WCB|apps/web/src/shell-refusal.tsx|the ShellRefusal component the sheet-errors harness renders|$ctl_file"
    "13.1719|$WCB|apps/web/src/shell-refusal.tsx|the ShellRefusal component tsc follows from the harness|$ctl_file|typecheck"
    "13.1719|$WCB|packages/workflow-canvas-browser/harness/sheet-errors.tsx|the package's own harness, still an input beside the foreign file|$ctl_file|typecheck"
  )
  for t in "${rows[@]}"; do
    IFS='|' read -r id pkg file what ctl task <<<"$t"
    task=${task:-test}
    [ -f "$file" ] && [ -f "$ctl" ] || { echo "  FAIL $id probe or control file missing ($file / $ctl)"; fails=$((fails+1)); continue; }
    h0=$(field "$pkg" "$pkg#$task" hash)
    touch_file "$ctl";  h1=$(field "$pkg" "$pkg#$task" hash); reset
    touch_file "$file"; h2=$(field "$pkg" "$pkg#$task" hash); reset
    h3=$(field "$pkg" "$pkg#$task" hash)
    check "$id $pkg#$task: CONTROL — a file it does not read ($ctl) leaves the hash alone (a HIT)" '[ -n "$h0" ] && [ "$h0" = "$h1" ]'
    check "$id $pkg#$task: changing $what ($file) changes the hash (a MISS)" '[ -n "$h2" ] && [ "$h0" != "$h2" ]'
    check "$id $pkg#$task: CONTROL — reverting $file restores the hash" '[ "$h0" = "$h3" ]'
  done
else
  # Real cache. A cache hit prints `cache hit` for the task; a miss prints `cache miss`.
  runtest() { "$TURBO" run test --filter="$1" --concurrency=2 --output-logs=hash-only 2>&1; }
  status() { printf '%s' "$1" | grep -E "^$2:test: cache (hit|miss|bypass)" | sed -E 's/.*cache (hit|miss|bypass).*/\1/' | sed -n 1p; }
  for t in "$UI|$web_file|13.1708" "$MOBILE|$css_file|13.1709"; do
    IFS='|' read -r pkg file id <<<"$t"
    o=$(runtest "$pkg"); s0=$(status "$o" "$pkg")        # warm: whatever it was, the cache now holds it
    o=$(runtest "$pkg"); s1=$(status "$o" "$pkg")
    touch_file "$ctl_file"; o=$(runtest "$pkg"); s2=$(status "$o" "$pkg"); reset
    touch_file "$file";     o=$(runtest "$pkg"); s3=$(status "$o" "$pkg"); reset
    echo "  $pkg#test cache: warm=$s0 rerun=$s1 unrelated-change=$s2 reader-change=$s3"
    check "$id $pkg#test --real: CONTROL — unchanged tree is a HIT" '[ "$s1" = hit ]'
    check "$id $pkg#test --real: CONTROL — a file it does not read is still a HIT" '[ "$s2" = hit ]'
    check "$id $pkg#test --real: changing $file is a MISS" '[ "$s3" = miss ]'
  done
fi
ctl_test_only_end gate-cache.test.sh
[ "$fails" -eq 0 ] && { echo "gate-cache.test.sh ($MODE): all ok"; exit 0; } || { echo "gate-cache.test.sh ($MODE): $fails FAILED"; exit 1; }
