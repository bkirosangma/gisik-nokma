#!/usr/bin/env bash
# scripts/ctl/lib.sh — shared contract for every ctl verb. Sourced, never executed.
# Contract: one summary line last; exit 0 only when every named condition held; --dry-run mutates nothing.

ctl_node22() {
  local bin="${GISIK_NODE22_BIN:-$HOME/.nvm/versions/node/v22.22.2/bin}"
  [ -x "$bin/node" ] || { echo "FAIL lib node 22 not found at $bin" >&2; return 1; }
  case ":$PATH:" in *":$bin:"*) ;; *) export PATH="$bin:$PATH";; esac
}

ctl_primary() { echo "${GISIK_PRIMARY:-/Users/kiro/my_projects/gisik-nokma}"; }

# Print the worktree root of PATH (default $PWD). A worktree has `.git` as a FILE; a main checkout as a DIRECTORY.
ctl_repo() {
  local p="${1:-$PWD}" top
  top="$(cd "$p" 2>/dev/null && /usr/bin/git rev-parse --show-toplevel 2>/dev/null)" || { echo "not a git worktree: $p" >&2; return 1; }
  echo "$top"
}

ctl_log_dir() { local d="${CTL_LOG_DIR:-$HOME/.cache/gisik-ctl}"; mkdir -p "$d"; echo "$d"; }
ctl_log() { echo "$(ctl_log_dir)/$1-$(date '+%Y%m%dT%H%M%S')-$$.log"; }

ctl_ok()   { echo "OK $1 $2"; exit 0; }
ctl_fail() { echo "FAIL $1 $2"; exit 1; }

# Run a command, or only print it under CTL_DRY_RUN=1.
ctl_run() { if [ "${CTL_DRY_RUN:-0}" = 1 ]; then echo "DRY: $*"; else "$@"; fi; }

ctl_marker_dir() { local root="$1" gitdir; gitdir="$(cd "$root" && /usr/bin/git rev-parse --git-dir)"; case "$gitdir" in /*) ;; *) gitdir="$root/$gitdir";; esac; mkdir -p "$gitdir/ctl"; echo "$gitdir/ctl"; }
ctl_marker_write() { local root="$1" kind="$2" sha="$3" log="$4"; echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $log" > "$(ctl_marker_dir "$root")/$kind-$sha"; }
ctl_marker_has()   { [ -f "$(ctl_marker_dir "$1")/$2-$3" ]; }

# Consume --repo X and --dry-run from "$@"; the rest lands in CTL_ARGS.
ctl_parse_common() {
  CTL_REPO=""; CTL_DRY_RUN="${CTL_DRY_RUN:-0}"; CTL_ARGS=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --repo) CTL_REPO="$2"; shift 2;;
      --dry-run) CTL_DRY_RUN=1; shift;;
      *) CTL_ARGS+=("$1"); shift;;
    esac
  done
  [ -n "$CTL_REPO" ] || CTL_REPO="$(ctl_repo "$PWD")" || return 1
  export CTL_REPO CTL_DRY_RUN
}
