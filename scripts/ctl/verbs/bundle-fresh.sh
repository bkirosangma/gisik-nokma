#!/usr/bin/env bash
# ctl bundle-fresh [--repo R] [--base B] [--fix] [--dry-run] — is the mobile editor bundle (apps/mobile/src/editor/editor-html.generated.ts) fresh
# against a FRESH build of what it is built from? Planner P50 (2026-10-05): a stale bundle cost a FIX round-trip at least five times (pg-t6, ux-t6,
# hk-3, smoothness-batch-6, SL3), because `generate-editor-html.mjs --check` and 18.227 pass against a STALE `dist-webview` and only red after a
# fresh `build:webview`. So this verb never trusts the dist on disk: it builds, then checks, all in ONE `ctl run-tests` slot.
# - The trigger set (what a branch can change that the bundle is built from): `build:webview` (packages/editor/package.json:44) bundles
#   packages/editor/src/webview (vite.webview.config.ts:11, root) and imports @gisik-nokma/domain, the editor's ONLY workspace dependency
#   (packages/editor/package.json:49; domain has none of its own), through its built dist (turbo.json:63-64: `build:webview` dependsOn `^build`).
#   pnpm-lock.yaml pins the tiptap/prosemirror/react versions it inlines (packages/editor/package.json:48-72) and vite itself, and a react or
#   tiptap bump made from ANOTHER package's package.json changes the bundle without touching packages/editor. The checked-in generated file and
#   its generator are the other side of the comparison, so a diff that touches them triggers too (a tip merge resolving the generated file).
#   OUT of scope (a change there alone is SKIP): the root build config — tsconfig.base.json (which the editor's and domain's tsconfig.json
#   extend), turbo.json, the root package.json and pnpm-workspace.yaml (their overrides reach the bundle through pnpm-lock.yaml, which triggers) —
#   and the Node toolchain.
# - TRIGGER is the ONE list: it is printed (`trigger set: …`) and compiled into TRIGGER_RE, so the set shown is the set that decides (13.2338).
# - `git diff --no-renames --name-only origin/<B>...HEAD` (BOTH sides of a rename, so a file moved out of packages/domain counts) touches none
#   of it → `SKIP (no domain/editor change)`, exit 0, no slot, no pnpm.
# - Otherwise, in one slot: `pnpm build` of the editor and its workspace deps, `build:webview` (after deleting the old index.html, so a build that
#   writes nothing can never leave an old bundle to be checked), then `--check`; its `ok` / `STALE` LINE decides, never its rc alone (`--check`
#   exits 0 on `no-bundle`). `--fix` regenerates the file in that same slot, re-checks, then commits ONLY that file.
# Exit: 0 fresh / SKIP / regenerated, 1 STALE, 2 tool failure (a build failed, `--check` said neither ok nor STALE, an uncommitted or untracked
# file under packages/domain or packages/editor, an uncommitted generated file or generator — in BOTH modes, before the SKIP — or a missing
# origin/<B>), 64 usage, 75 no slot within CTL_SEM_MAX_WAIT (nothing was run).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/lib.sh"
GEN=apps/mobile/src/editor/editor-html.generated.ts
GENERATOR=apps/mobile/scripts/generate-editor-html.mjs
# An entry ending in / is a directory prefix, any other an exact path; dots are escaped and each exact path is anchored at both ends.
TRIGGER="packages/domain/ packages/editor/ $GEN $GENERATOR pnpm-lock.yaml"
TRIGGER_RE=
for t in $TRIGGER; do e="${t//./\\.}"; case "$t" in */) ;; *) e="$e\$";; esac; TRIGGER_RE="${TRIGGER_RE:+$TRIGGER_RE|}$e"; done
TRIGGER_RE="^($TRIGGER_RE)"
MSG='regen: mobile editor bundle (ctl bundle-fresh)'
usage() { echo "FAIL bundle-fresh $1 — usage: ctl bundle-fresh [--repo R] [--base B] [--fix] [--dry-run]"; exit 64; }
tool() { echo "FAIL bundle-fresh $1"; exit 2; }
ctl_parse_common "$@" || exit 64
base=main; fix=0
set -- ${CTL_ARGS[@]+"${CTL_ARGS[@]}"}
while [ $# -gt 0 ]; do
  case "$1" in
    --base) [ $# -ge 2 ] || usage "--base needs a value"; base="$2"; shift 2;;
    --fix) fix=1; shift;;
    *) usage "unknown arg $1";;
  esac
done
ctl_base_valid "$base" || usage "--base $base is not main or release/<name>"
g() { /usr/bin/git -C "$CTL_REPO" "$@"; }
g rev-parse --verify -q "refs/remotes/origin/$base^{commit}" >/dev/null || tool "origin/$base not found in $CTL_REPO (git fetch first)"
echo "trigger set: $TRIGGER"
# The bundle is built from the WORKING tree and `--check` reads the WORKING-tree generated file: a verdict on uncommitted edits to either side is
# not a verdict on the tip (a hand-regenerated, uncommitted $GEN says fresh while HEAD still holds the stale bundle), and --fix would commit a
# bundle no commit can rebuild. Refused in --fix mode too: a dirty $GEN there is a hand edit or an interrupted --fix, never this run's output.
dirty="$(g status --porcelain --untracked-files=all -- packages/domain packages/editor "$GEN" "$GENERATOR")"
[ -z "$dirty" ] || tool "uncommitted changes under packages/domain, packages/editor, $GEN or $GENERATOR — commit them, or discard them (git checkout -- <path>), first: $(printf '%s' "$dirty" | head -3 | tr '\n' ' ')"
changed="$(g diff --no-renames --name-only "refs/remotes/origin/$base...HEAD")" || tool "git diff origin/$base...HEAD failed (no merge base?)"
hits="$(printf '%s\n' "$changed" | grep -cE "$TRIGGER_RE")"
[ "$hits" -gt 0 ] || ctl_ok bundle-fresh "SKIP (no domain/editor change) vs origin/$base"
echo "$hits changed file(s) vs origin/$base in the trigger set, e.g. $(printf '%s\n' "$changed" | grep -E "$TRIGGER_RE" | head -1)"
mode=check; [ "$fix" = 1 ] && mode=fix
# The slot's body. Exit 0 = `--check: ok`, 3 = `--check: STALE`, 2 = anything else (a build failed, no bundle, an unparsable check).
# shellcheck disable=SC2016
INNER='set -u
pnpm --fail-if-no-match --filter "@gisik-nokma/editor..." run build || { echo "bundle-fresh: build of @gisik-nokma/editor and its workspace deps FAILED"; exit 2; }
rm -f packages/editor/dist-webview/index.html
pnpm --fail-if-no-match --filter @gisik-nokma/editor run build:webview || { echo "bundle-fresh: build:webview FAILED"; exit 2; }
[ -s packages/editor/dist-webview/index.html ] || { echo "bundle-fresh: build:webview wrote no packages/editor/dist-webview/index.html"; exit 2; }
if [ "$1" = fix ]; then node apps/mobile/scripts/generate-editor-html.mjs || { echo "bundle-fresh: regenerate FAILED"; exit 2; }; fi
out="$(node apps/mobile/scripts/generate-editor-html.mjs --check 2>&1)"; rc=$?
printf "%s\n" "$out"
case "$rc:$out" in
  0:*"generate-editor-html --check: ok "*) exit 0;;
  1:*"generate-editor-html --check: STALE "*) exit 3;;
esac
echo "bundle-fresh: --check said neither ok nor STALE (rc=$rc)"; exit 2'
if [ "$CTL_DRY_RUN" = 1 ]; then
  echo "DRY: ctl run-tests --repo $CTL_REPO --label bundle-fresh -- bash -c <build editor+deps; build:webview; $([ "$mode" = fix ] && echo 'regenerate; ')--check> bundle-fresh $mode"
  [ "$mode" = fix ] && echo "DRY: git commit -m '$MSG' -- $GEN"
  ctl_ok bundle-fresh "dry-run"
fi
rt="$("$HERE/ctl" run-tests --repo "$CTL_REPO" --label bundle-fresh -- bash -c "$INNER" bundle-fresh "$mode")"; rc=$?
printf '%s\n' "$rt"
# The slot body's own verdict lines are in the run-tests log, which the summary does not quote: repeat them here.
log="$(printf '%s\n' "$rt" | sed -n 's/^log: //p' | tail -1)"
[ -n "$log" ] && [ -f "$log" ] && grep -E '^(bundle-fresh: |generate-editor-html --check: )' "$log"
case "$rc" in
  0) ;;
  3) echo "FAIL bundle-fresh STALE mobile bundle: run ctl bundle-fresh --fix"; exit 1;;
  75) echo "FAIL bundle-fresh no slot — nothing was run"; exit 75;;
  *) tool "the build or --check failed (rc=$rc) — read the run-tests log above";;
esac
[ "$fix" = 1 ] || ctl_ok bundle-fresh "fresh: $GEN matches a fresh build:webview"
if g diff --quiet HEAD -- "$GEN"; then ctl_ok bundle-fresh "fresh, nothing to commit"; fi
before="$(g rev-parse HEAD)"
g commit -q -m "$MSG" -- "$GEN" || tool "git commit of $GEN failed"
sha="$(g rev-parse HEAD)"
[ "$(g rev-parse HEAD~1)" = "$before" ] && [ "$(g diff-tree --no-commit-id --name-only -r HEAD)" = "$GEN" ] || tool "commit $sha is not exactly one commit touching only $GEN"
echo "regen commit: $sha"
ctl_ok bundle-fresh "regenerated $sha ($GEN only; push it)"
