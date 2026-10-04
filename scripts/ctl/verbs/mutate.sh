#!/usr/bin/env bash
# ctl mutate [--repo <worktree>] [--base <ref>] [--dry-run] [--json] — Stryker plus the custom classes (numeric ×10/÷10, ceil/floor/round,
# `as T` casts stripped) on a branch's CHANGED non-test lines, one slot-run per file (owner-approved 2026-10-04, process finding P20).
# The logic is mutate.py's; this wrapper owns the worktree's safety: mutate.py backs up every file before writing it and lists it in
# $CTL_MUTATE_TMP/manifest, and the trap below restores from there on EVERY exit (success, failure, SIGINT, SIGTERM), removes the Stryker
# temp dirs it named, deletes the temp dir, and then checks that `git status` is byte-identical to the start (a difference is exit 2).
# Exit: 0 no survivor, 1 survivors (triage expected), 2 tool failure.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/lib.sh"
repo_arg=""; pass=()
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) [ $# -ge 2 ] || { echo "FAIL mutate --repo needs a value"; exit 2; }; repo_arg="$2"; shift 2;;
    --base) [ $# -ge 2 ] && [ -n "$2" ] || { echo "FAIL mutate --base needs a value"; exit 2; }; pass+=(--base "$2"); shift 2;;
    --dry-run|--json) pass+=("$1"); shift;;
    *) echo "FAIL mutate unknown arg $1 — usage: ctl mutate [--repo <worktree>] [--base <ref>] [--dry-run] [--json]"; exit 2;;
  esac
done
repo="$(ctl_repo "${repo_arg:-$PWD}")" || { echo "FAIL mutate not a git worktree: ${repo_arg:-$PWD}"; exit 2; }
ctl_node22 || exit 2
status_of() { /usr/bin/git -C "$repo" status --porcelain=v1 --untracked-files=all 2>&1; }
before="$(status_of)"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/ctl-mutate.XXXXXX")" || { echo "FAIL mutate no temp dir"; exit 2; }
child=""
restore() {
  local kind a b
  if [ -f "$tmp/manifest" ]; then
    while IFS=$'\t' read -r kind a b; do
      case "$kind" in
        restore) [ -f "$b" ] && ! cmp -s "$b" "$a" && cp -p "$b" "$a";;
        rmdir) case "$(basename "$a")" in .stryker-tmp-ctlmutate-*) rm -rf "$a";; esac;;
        rmsetup) for f in "$a"/stryker-setup-*.js; do [ -f "$f" ] && case ",$b," in *",$(basename "$f"),"*) ;; *) rm -f "$f";; esac; done;;
      esac
    done < "$tmp/manifest"
  fi
  rm -rf "$tmp"
}
finish() {
  local rc="$1"
  restore
  if [ "$(status_of)" != "$before" ]; then
    echo "FAIL mutate the worktree's git status changed during the run — inspect $repo by hand:"
    diff <(printf '%s\n' "$before") <(status_of) | sed 's/^/  /'
    exit 2
  fi
  exit "$rc"
}
abort() {
  local sig="$1"
  if [ -n "$child" ]; then
    kill -TERM -- "-$child" 2>/dev/null
    local n=0; while [ "$n" -lt 60 ] && kill -0 "$child" 2>/dev/null; do sleep 0.25; n=$((n+1)); done
    kill -KILL -- "-$child" 2>/dev/null
  fi
  echo "FAIL mutate terminated by signal $sig — worktree restored"
  finish $((128 + sig))
}
trap 'abort 2' INT
trap 'abort 15' TERM
# mutate.py runs as a background job in its OWN process group (set -m) with `wait`, so a signal reaches this trap at once and the whole
# group (mutate.py, run-tests, Stryker and its workers) can be stopped before the files are put back.
set -m
CTL_MUTATE_TMP="$tmp" python3 "$HERE/verbs/mutate.py" --repo "$repo" ${pass[@]+"${pass[@]}"} < /dev/null &
child=$!
wait "$child"; rc=$?
child=""
finish "$rc"
