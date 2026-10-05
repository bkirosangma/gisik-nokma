#!/usr/bin/env bash
# scripts/ctl/test/bundle-fresh.test.sh — ctl bundle-fresh (cases 13.2330–13.2343, test-cases/13-deploy-and-ops.md). Run by `ctl selftest`.
# A scratch repo + bare origin holding the REAL apps/mobile/scripts/generate-editor-html.mjs (its paths are script-relative), so `--check` is the
# real one; `pnpm` is a PATH stub whose `build:webview` writes the bundle html this case chose, and `pnpm` and `node` both record, at call time,
# whether a slot of the PRIVATE semaphore (CTL_SEM_DIR) is held. The memory/swap probes are the run-tests suite's stubs; nothing live is read.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"; CTL="$HERE/ctl"; fails=0
. "$HERE/test/harness.sh"   # check NAME CODE, and the CTL_TEST_ONLY case filter
. "$HERE/lib.sh"; . "$HERE/sem.sh"   # ctl_sem_lstart: a planted holder must read as live
T="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$T"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
ctl_node22 || exit 1; NODE_BIN="$(dirname "$(command -v node)")"
st="$T/state"; FB="$T/bin"; mkdir -p "$st" "$FB"
export CTL_SEM_DIR="$T/sem" CTL_LOG_DIR="$T/logs" FX_STATE="$st" REAL_NODE="$NODE_BIN/node"   # NEVER the machine's real semaphore
unset CTL_TEST_SLOTS CTL_SEM_MAX_WAIT CTL_SEM_GATE_SLOTS CTL_SEM_POLL_SECS CTL_SEM_SAMPLE_SECS CTL_SEM_SWAP_TTL CTL_SEM_CLOCK_FILE CTL_DRY_RUN
cat > "$FB/memory_pressure" <<'STUB'
#!/bin/sh
echo "System-wide memory free percentage: 60%"
STUB
cat > "$FB/sysctl" <<'STUB'
#!/bin/sh
[ "$*" = "-n kern.memorystatus_vm_pressure_level" ] && { echo 1; exit 0; }
exit 1
STUB
cat > "$FB/vm_stat" <<'STUB'
#!/bin/sh
echo "Mach Virtual Memory Statistics: (page size of 16384 bytes)"
echo "Swapins:                          0."
STUB
# slot=1 when a holder file of the private semaphore exists at the instant of the call
cat > "$FB/pnpm" <<'STUB'
#!/bin/sh
s=0; for h in "$CTL_SEM_DIR"/slot-*/holder; do [ -f "$h" ] && s=1; done
echo "slot=$s|$*" >> "$FX_STATE/pnpm.log"
case " $* " in
  *" run build:webview "*) [ -f "$FX_STATE/webview-empty" ] && exit 0; mkdir -p packages/editor/dist-webview; cat "$FX_STATE/html" > packages/editor/dist-webview/index.html;;
  *" run build "*) [ -f "$FX_STATE/build-fail" ] && exit 1;;
esac
exit 0
STUB
cat > "$FB/node" <<'STUB'
#!/bin/sh
s=0; for h in "$CTL_SEM_DIR"/slot-*/holder; do [ -f "$h" ] && s=1; done
echo "slot=$s|$*" >> "$FX_STATE/node.log"
exec "$REAL_NODE" "$@"
STUB
chmod +x "$FB"/*
W="$T/w"; G="/usr/bin/git -C $W"
/usr/bin/git init -q --bare "$T/o.git"; /usr/bin/git init -q -b main "$W"; $G remote add origin "$T/o.git"
mkdir -p "$W/packages/domain/src" "$W/packages/editor/src" "$W/packages/editorial" "$W/apps/mobile/scripts" "$W/apps/mobile/src/editor" "$W/other"
cp "$HERE/../../apps/mobile/scripts/generate-editor-html.mjs" "$W/apps/mobile/scripts/"
echo 'dist-webview/' > "$W/.gitignore"
for f in packages/domain/src/a.ts packages/editor/src/b.ts packages/editorial/x.ts other/readme.txt other/staged.txt; do echo base > "$W/$f"; done
echo '<html>A</html>' > "$st/html"; mkdir -p "$W/packages/editor/dist-webview"; cp "$st/html" "$W/packages/editor/dist-webview/index.html"
"$REAL_NODE" "$W/apps/mobile/scripts/generate-editor-html.mjs" >/dev/null; rm -rf "$W/packages/editor/dist-webview"   # the baked file = bundle "A"
$G add -A; $G commit -q -m base; $G push -q origin main main:refs/heads/release/kg; $G fetch -q origin
br() { $G checkout -q -f -B "$1" origin/release/kg; $G clean -fdq; shift; for f in "$@"; do echo "change $RANDOM" >> "$W/$f"; $G add "$f"; done; $G commit -q -m change; }   # br <name> <files…>: one commit on a fresh branch off release/kg
reset() { rm -rf "$CTL_SEM_DIR" "$CTL_LOG_DIR" "$st"/*.log "$st/webview-empty" "$st/build-fail" "$W/packages/editor/dist-webview"; mkdir -p "$CTL_SEM_DIR" "$CTL_LOG_DIR"; echo "$(date +%s) ok" > "$CTL_SEM_DIR/swap.verdict"; echo "${1:-<html>A</html>}" > "$st/html"; }   # reset [html]: an empty machine; build:webview will write html (default = the baked bundle, i.e. fresh)
bf() { ( cd "$W" && PATH="$FB:$NODE_BIN:$PATH" "$CTL" bundle-fresh --repo "$W" "$@" 2>&1 ); }
last() { printf '%s\n' "$1" | tail -1; }
calls() { cat "$st/$1.log" 2>/dev/null; }
inslot() { [ -s "$st/$1.log" ] && ! grep -q '^slot=0' "$st/$1.log"; }   # every recorded call of $1 ran while a slot was held
noslot() { [ ! -e "$st/pnpm.log" ] && [ ! -e "$st/node.log" ] && [ ! -e "$CTL_SEM_DIR/waits.tsv" ] && [ -z "$(ls "$CTL_LOG_DIR")" ]; }
PN_BUILD='|--fail-if-no-match --filter @gisik-nokma/editor... run build'; PN_WEB='|--fail-if-no-match --filter @gisik-nokma/editor run build:webview'
GEN=apps/mobile/src/editor/editor-html.generated.ts

check "13.2330 bundle-fresh: a diff touching neither packages/domain nor packages/editor — only other/ and the near-name packages/editorial/ — is exactly \`OK bundle-fresh SKIP (no domain/editor change) vs origin/release/kg\`, exit 0, with ZERO pnpm or node calls, no slot (no waits.tsv row) and no run-tests log; CONTROL in the same check: a packages/domain diff does call pnpm" \
  'reset; br skip other/readme.txt packages/editorial/x.ts; o="$(bf --base release/kg)" && [ "$(last "$o")" = "OK bundle-fresh SKIP (no domain/editor change) vs origin/release/kg" ] && noslot && reset && br dom packages/domain/src/a.ts && bf --base release/kg >/dev/null && [ -s "$st/pnpm.log" ]'
check "13.2331 bundle-fresh: a packages/domain-only diff whose fresh build:webview differs from the checked-in bundle is STALE: exit EXACTLY 1, last line exactly \`FAIL bundle-fresh STALE mobile bundle: run ctl bundle-fresh --fix\`; both builds ran, in order, with --fail-if-no-match and the real filter names, and they and the --check ran INSIDE a slot; no commit, tree clean" \
  'reset "<html>B</html>"; br dom packages/domain/src/a.ts; h="$(/usr/bin/git -C "$W" rev-parse HEAD)"; o="$(bf --base release/kg)"; rc=$?; [ "$rc" = 1 ] && [ "$(last "$o")" = "FAIL bundle-fresh STALE mobile bundle: run ctl bundle-fresh --fix" ] && [ "$(calls pnpm)" = "slot=1$PN_BUILD
slot=1$PN_WEB" ] && inslot node && grep -q "generate-editor-html.mjs --check" "$st/node.log" && [ "$(/usr/bin/git -C "$W" rev-parse HEAD)" = "$h" ] && [ -z "$(/usr/bin/git -C "$W" status --porcelain)" ]'
check "13.2332 bundle-fresh: a packages/editor-only diff whose fresh build matches the checked-in bundle is fresh: exit 0, last line \`OK bundle-fresh fresh: $GEN matches a fresh build:webview\`, every pnpm and node call inside a slot; CONTROL in the same check: the same branch with a differing build is exit 1" \
  'reset; br ed packages/editor/src/b.ts; o="$(bf --base release/kg)" && [ "$(last "$o")" = "OK bundle-fresh fresh: $GEN matches a fresh build:webview" ] && inslot pnpm && inslot node && reset "<html>C</html>" && { bf --base release/kg >/dev/null; [ $? = 1 ]; }'
check "13.2333 bundle-fresh --fix on a STALE branch: exit 0, ONE new commit whose subject is exactly \`regen: mobile editor bundle (ctl bundle-fresh)\` and whose only path is $GEN, its sha40 printed (\`regen commit: <HEAD>\`); the decoys — a STAGED change, an unstaged change and an untracked file outside the trigger set — are still staged / modified / untracked; a plain run afterwards is fresh" \
  'reset "<html>D</html>"; br fix packages/domain/src/a.ts; h="$(/usr/bin/git -C "$W" rev-parse HEAD)"; echo s >> "$W/other/staged.txt"; /usr/bin/git -C "$W" add other/staged.txt; echo m >> "$W/other/readme.txt"; echo u > "$W/other/untracked.txt"; o="$(bf --base release/kg --fix)" && n="$(/usr/bin/git -C "$W" rev-parse HEAD)" && [ "$(/usr/bin/git -C "$W" rev-parse HEAD~1)" = "$h" ] && [ "$(/usr/bin/git -C "$W" log -1 --format=%s)" = "regen: mobile editor bundle (ctl bundle-fresh)" ] && [ "$(/usr/bin/git -C "$W" diff-tree --no-commit-id --name-only -r HEAD)" = "$GEN" ] && printf "%s\n" "$o" | grep -qxF "regen commit: $n" && [ "$(last "$o")" = "OK bundle-fresh regenerated $n ($GEN only; push it)" ] && [ "$(/usr/bin/git -C "$W" status --porcelain | LC_ALL=C sort | tr "\n" ";")" = " M other/readme.txt;?? other/untracked.txt;M  other/staged.txt;" ] && /usr/bin/git -C "$W" show HEAD:$GEN | grep -qF "<html>D</html>" && reset "<html>D</html>" && o2="$(bf --base release/kg)" && [ "$(last "$o2")" = "OK bundle-fresh fresh: $GEN matches a fresh build:webview" ]'
check "13.2334 bundle-fresh --fix on a branch already fresh: exit 0, \`OK bundle-fresh fresh, nothing to commit\`, HEAD unchanged" \
  'reset; br fixfresh packages/editor/src/b.ts; h="$(/usr/bin/git -C "$W" rev-parse HEAD)"; o="$(bf --base release/kg --fix)" && [ "$(last "$o")" = "OK bundle-fresh fresh, nothing to commit" ] && [ "$(/usr/bin/git -C "$W" rev-parse HEAD)" = "$h" ]'
check "13.2335 bundle-fresh never reads an OLD bundle: a build:webview that writes nothing (exit 0) while an old dist-webview/index.html MATCHING the checked-in file sits on disk is a tool failure — exit 2, no STALE line, never OK; CONTROL in the same check: the same old file with a build that rewrites it is OK" \
  'reset; br old packages/editor/src/b.ts; mkdir -p "$W/packages/editor/dist-webview"; echo "<html>A</html>" > "$W/packages/editor/dist-webview/index.html"; : > "$st/webview-empty"; o="$(bf --base release/kg)"; rc=$?; [ "$rc" = 2 ] && ! printf "%s" "$o" | grep -q STALE && [ "$(last "$o")" = "FAIL bundle-fresh the build or --check failed (rc=2) — read the run-tests log above" ] && printf "%s" "$o" | grep -q "build:webview wrote no packages/editor/dist-webview/index.html" && reset && mkdir -p "$W/packages/editor/dist-webview" && echo "<html>A</html>" > "$W/packages/editor/dist-webview/index.html" && bf --base release/kg >/dev/null'
check "13.2336 bundle-fresh: a failed build is a tool failure, never STALE — exit 2, no STALE line, build:webview never ran" \
  'reset "<html>E</html>"; br bfail packages/domain/src/a.ts; : > "$st/build-fail"; o="$(bf --base release/kg)"; rc=$?; [ "$rc" = 2 ] && ! printf "%s" "$o" | grep -q "STALE mobile bundle" && ! grep -q "build:webview" "$st/pnpm.log"'
check "13.2337 bundle-fresh refusals, each before any pnpm call or slot: uncommitted (untracked) file under packages/domain → exit 2 naming it; --base feat/x → 64; an unknown arg → 64; origin/release/nope missing → 2; CONTROL in the same check: the clean tree runs" \
  'reset; br dirty packages/domain/src/a.ts; echo n > "$W/packages/domain/src/new.ts"; { o="$(bf --base release/kg)"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "uncommitted changes under packages/domain or packages/editor .*packages/domain/src/new.ts" && rm "$W/packages/domain/src/new.ts" && { bf --base feat/x >/dev/null; [ $? = 64 ]; } && { bf --base release/kg --nope >/dev/null; [ $? = 64 ]; } && { bf --base release/nope >/dev/null; [ $? = 2 ]; } && noslot && bf --base release/kg >/dev/null'
check "13.2339 bundle-fresh: a --check that CRASHES (rc 1, a stack trace, no STALE line — the generated path is a directory) is a tool failure: exit 2, never the STALE line; CONTROL in the same check: the real file restored, the same branch is fresh" \
  'reset; br crash packages/editor/src/b.ts; rm "$W/$GEN"; mkdir "$W/$GEN"; o="$(bf --base release/kg)"; rc=$?; [ "$rc" = 2 ] && ! printf "%s" "$o" | grep -q "STALE mobile bundle" && printf "%s" "$o" | grep -qF "bundle-fresh: --check said neither ok nor STALE (rc=1)" && rmdir "$W/$GEN" && /usr/bin/git -C "$W" checkout -q -- "$GEN" && bf --base release/kg >/dev/null'
check "13.2340 bundle-fresh with no --base measures against origin/main: \`OK bundle-fresh SKIP (no domain/editor change) vs origin/main\`" \
  'reset; br nobase other/readme.txt; o="$(bf)" && [ "$(last "$o")" = "OK bundle-fresh SKIP (no domain/editor change) vs origin/main" ] && noslot'
check "13.2341 bundle-fresh reads the branch's OWN diff (origin/<B>...HEAD, from the merge base): the base moved on with a packages/domain commit the branch lacks and the branch touched only other/ → SKIP, no slot; CONTROL in the same check: the same branch with a domain commit of its own runs" \
  'reset; $G checkout -q -f -B moved origin/release/kg && echo m >> "$W/packages/domain/src/a.ts" && $G commit -qam moved && $G push -q origin moved:refs/heads/release/moved && $G fetch -q origin && br onlyother other/readme.txt && o="$(bf --base release/moved)" && [ "$(last "$o")" = "OK bundle-fresh SKIP (no domain/editor change) vs origin/release/moved" ] && noslot && echo x >> "$W/packages/editor/src/b.ts" && $G commit -qam own && bf --base release/moved >/dev/null && [ -s "$st/pnpm.log" ]'
check "13.2342 bundle-fresh: the bundle's own side triggers too — a diff touching only $GEN, and one touching only apps/mobile/scripts/generate-editor-html.mjs, each runs the build in a slot (a tip merge that resolved the generated file is a staleness risk)" \
  'reset; br genonly "$GEN"; { o="$(bf --base release/kg)"; [ $? = 1 ]; } && inslot pnpm && reset && br scriptonly apps/mobile/scripts/generate-editor-html.mjs && { bf --base release/kg >/dev/null; true; } && inslot pnpm'
check "13.2343 bundle-fresh with no slot free within CTL_SEM_MAX_WAIT: exit 75, \`FAIL bundle-fresh no slot — nothing was run\`, and pnpm never ran; CONTROL in the same check: the slot released, the same branch runs" \
  'reset; br noslot packages/editor/src/b.ts; echo 1 > "$CTL_SEM_DIR/slots"; sleep 600 >/dev/null 2>&1 & sp=$!; mkdir -p "$CTL_SEM_DIR/slot-1"; printf "%s|%s|planted|0\n" "$sp" "$(ctl_sem_lstart "$sp")" > "$CTL_SEM_DIR/slot-1/holder"; o="$(CTL_SEM_MAX_WAIT=2 bf --base release/kg)"; rc=$?; kill "$sp"; wait "$sp" 2>/dev/null; rm -rf "$CTL_SEM_DIR/slot-1"; [ "$rc" = 75 ] && [ "$(last "$o")" = "FAIL bundle-fresh no slot — nothing was run" ] && [ ! -e "$st/pnpm.log" ] && bf --base release/kg >/dev/null && inslot pnpm'
# The trigger set is copied into the verb by hand; this pins it against the REAL repo: every workspace package @gisik-nokma/editor depends on,
# transitively, must be in it (a new editor dependency would be bundled without triggering the check).
closure() { "$REAL_NODE" -e '
const fs=require("fs"),p=require("path"),root=process.argv[1];const dirs={};
for(const top of ["packages","apps"]){for(const d of fs.readdirSync(p.join(root,top))){const f=p.join(root,top,d,"package.json");if(fs.existsSync(f))dirs[JSON.parse(fs.readFileSync(f)).name]=top+"/"+d+"/";}}
const seen=new Set();const walk=n=>{if(seen.has(n))return;seen.add(n);const j=JSON.parse(fs.readFileSync(p.join(root,dirs[n],"package.json")));for(const [k,v] of Object.entries({...j.dependencies,...j.peerDependencies})){if(String(v).startsWith("workspace:"))walk(k);}};
walk("@gisik-nokma/editor");console.log([...seen].map(n=>dirs[n]).sort().join(" "));' "$1"; }
check "13.2338 bundle-fresh: the trigger set it prints covers @gisik-nokma/editor and every workspace package it depends on transitively, read from the REAL repo's package.json files (today packages/domain/ packages/editor/), and the real generator reads its bundle from packages/editor; CONTROL in the same check: the closure is non-trivial (2+ packages)" \
  'R="$(cd "$HERE/../.." && pwd)"; set -f; c="$(closure "$R")"; ts="$(cd "$R" && "$CTL" bundle-fresh --repo "$R" --dry-run 2>&1 | sed -n "s/^trigger set: //p")"; ok=1; for d in $c; do case " $ts " in *" $d "*) ;; *) ok=0;; esac; done; set +f; [ "$ok" = 1 ] && [ "$(printf "%s\n" $c | wc -l | tr -d " ")" -ge 2 ] && grep -q "packages/editor/dist-webview/index.html" "$R/apps/mobile/scripts/generate-editor-html.mjs"'
ctl_test_only_end bundle-fresh.test.sh
[ "$fails" -eq 0 ] && { echo "bundle-fresh tests: all ok"; exit 0; } || { echo "bundle-fresh tests: $fails FAILED"; exit 1; }
