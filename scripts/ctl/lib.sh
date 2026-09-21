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

# --- pane delivery (measured 2026-09-21 on gisik:4, a Claude Code pane, pane_in_mode=0) ---
# Text goes in by load-buffer/paste-buffer (that path also reaches a pane in copy mode, 2026-09-08). Submission:
#   - a SINGLE-line paste submits on the first Enter (or a pasted "\r");
#   - a MULTI-line paste (every brief) ABSORBS the first Enter/CR, with or without a trailing newline and whatever
#     the pause (1 s, 3 s); the SECOND Enter submits. A pasted "\r" never counted for more than one.
#   - a pane in copy mode swallows send-keys (2026-09-08): leave copy mode first.
# The box shows dim text that is not input: the prompt suggestion and "Press up to edit queued messages"
# (ESC[2m … ESC[0m). Only non-dim text after ❯ is real input.

# Press Enter once as a real keypress, leaving copy mode first when the pane is in it. TARGET is e.g. gisik:2.
ctl_press_enter() {
  local target="$1" mode
  mode="$(tmux display-message -p -t "$target" '#{pane_in_mode}' 2>/dev/null)"
  if [ "$mode" = 1 ]; then tmux send-keys -t "$target" -X cancel || return 1; fi
  tmux send-keys -t "$target" Enter
}

# Print the REAL (non-dim) text on the last ❯ prompt line of TARGET; empty when the box holds only ghost/hint text.
ctl_box_text() {
  tmux capture-pane -e -p -t "$1" 2>/dev/null | python3 -c '
import re, sys
lines = sys.stdin.read().split("\n")
idx = max((i for i, l in enumerate(lines) if "\u276f" in l), default=None)
if idx is None: sys.exit(0)
after = lines[idx].split("\u276f", 1)[1]
after = re.sub(r"\x1b\[2m.*?(?:\x1b\[0m|\x1b\[22m)", "", after, flags=re.S)   # dim spans are not input
print(re.sub(r"\x1b\[[0-9;]*m", "", after).strip())'
}

# True when the box shows the queued-messages hint (the lane is mid-turn; a submission was queued behind it).
ctl_box_queued() { tmux capture-pane -e -p -t "$1" 2>/dev/null | grep -q 'Press up to edit queued messages'; }

# Submit the box of TARGET: press Enter, wait, re-read the REAL text; repeat while text remains, at most N (default 3)
# times. Prints the number of presses it took; exit 1 when real text is still there after N presses.
ctl_submit() {
  local target="$1" max="${2:-3}" try=1
  while :; do
    ctl_press_enter "$target" || return 1
    sleep 2
    [ -z "$(ctl_box_text "$target")" ] && { echo "$try"; return 0; }
    [ "$try" -lt "$max" ] || return 1
    try=$((try+1))
  done
}
