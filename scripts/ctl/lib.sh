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

# Disk hygiene after a dev-stack rebuild (owner standing rule, 2026-10-01). A rebuild leaves the previous image
# and the build cache behind; the Docker VM disk filled (2026-10-01) and the test Postgres began refusing
# connections, failing a whole gate. So every rebuild ends by pruning the BUILD CACHE and UNUSED images older
# than 24 h -- `-a` widens "unused" from dangling to every image no container uses, `until=24h` spares anything
# built today. These two commands are the ONLY prunes ctl may run: never `docker volume prune`, never
# `docker system prune`, never `--volumes` -- the dev Postgres, MinIO and the test Postgres live in volumes
# (test-cases 13.1590-13.1595 police this).
ctl_prune_build_cache() { ctl_run docker builder prune -f; }
ctl_prune_old_images()  { ctl_run docker image prune -a -f --filter until=24h; }
# Both run even when the first fails; non-zero if either did.
ctl_prune() { local rc=0; ctl_prune_build_cache || rc=1; ctl_prune_old_images || rc=1; return $rc; }

# One line: image and build-cache size (reclaimable) plus how full the Docker VM disk is (read through the
# test Postgres container, whose data dir sits on it -- the disk that filled). Each part degrades to "n/a".
ctl_disk_line() {
  local df img cache use
  df="$(docker system df --format '{{.Type}}|{{.Size}}|{{.Reclaimable}}' 2>/dev/null)"
  img="$(printf '%s\n' "$df" | awk -F'|' '$1=="Images"{printf "%s (reclaimable %s)", $2, $3}')"
  cache="$(printf '%s\n' "$df" | awk -F'|' '$1=="Build Cache"{printf "%s (reclaimable %s)", $2, $3}')"
  use="$(docker exec gisik-nokma-postgres-1 df -P /var/lib/postgresql/data 2>/dev/null | awk 'NR==2{print $5}')"
  echo "disk: images ${img:-n/a}, build cache ${cache:-n/a}, Docker VM disk ${use:-n/a} used"
}

ctl_marker_dir() { local root="$1" gitdir; gitdir="$(cd "$root" && /usr/bin/git rev-parse --git-dir)"; case "$gitdir" in /*) ;; *) gitdir="$root/$gitdir";; esac; mkdir -p "$gitdir/ctl"; echo "$gitdir/ctl"; }
ctl_marker_write() { local root="$1" kind="$2" sha="$3" log="$4"; echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $log" > "$(ctl_marker_dir "$root")/$kind-$sha"; }
ctl_marker_has()   { [ -f "$(ctl_marker_dir "$1")/$2-$3" ]; }

# --- the integration ref (owner, 2026-09-29: ctl land/gate/check-pr must serve a release branch, not only main) ---
# `--base <branch>` names the branch a verb measures against: origin/<base> for the ancestry, tree and diff checks and,
# for land, the PR's base. Default main. ONLY main or release/<name> is a base — never a task branch, never a path trick.
# A merge to main deploys to production, so main stays the default and its guards are the strict ones they always were;
# a release base is the same machinery pointed at a different ref, and its markers are a different KIND so a gate or a
# check run against one base can never admit a landing or a PR against another.
ctl_base_valid() {
  local b="$1" seg='[A-Za-z0-9_][A-Za-z0-9._-]*'
  [ "$b" = main ] && return 0
  [[ "$b" =~ ^release/$seg(/$seg)*$ ]] || return 1
  case "$b" in *..*|*.|*.lock|*.lock/*) return 1;; esac
}
# ctl_take_base VERB VALUE...: set CTL_BASE from the value that followed --base, or fail VERB.
ctl_take_base() {
  local verb="$1"; shift
  [ $# -ge 1 ] && [ -n "$1" ] || ctl_fail "$verb" "--base needs a value (main or release/<name>)"
  ctl_base_valid "$1" || ctl_fail "$verb" "--base $1 is not an integration branch — main or release/<name> only"
  CTL_BASE="$1"
}
# The marker kind for KIND against BASE: main keeps the bare kind the chain always used (gate-<sha>, checked-<sha>); a
# release base is `KIND.release+<name>` ('/' becomes '+', which ctl_base_valid never lets through, so it is injective).
ctl_marker_kind() { local kind="$1" base="${2:-main}"; if [ "$base" = main ]; then echo "$kind"; else echo "$kind.${base//\//+}"; fi; }

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
# (ESC[2m … ESC[0m). Only non-dim text after ❯ is real input. The prompt suggestion may run to the end of the line
# with NO closing reset (measured 2026-10-02 on gisik:1: `^[[2mRead the WHOLE file …` and nothing after): a dim span
# ends at its reset or at the end of the line.

# Press Enter once as a real keypress, leaving copy mode first when the pane is in it. TARGET is e.g. gisik:2.
ctl_press_enter() {
  local target="$1" mode
  mode="$(tmux display-message -p -t "$target" '#{pane_in_mode}' 2>/dev/null)"
  if [ "$mode" = 1 ]; then tmux send-keys -t "$target" -X cancel || return 1; fi
  tmux send-keys -t "$target" Enter
}

# Print the REAL (non-dim) text in the input box of TARGET; empty when the box holds only ghost/hint text. The box is the ❯ line above
# the status line, never the background-agent panel's selected row below the footer — boxtext.py, shared with `ctl seats` (13.1820).
ctl_box_text() { tmux capture-pane -e -p -t "$1" 2>/dev/null | python3 "$(dirname "${BASH_SOURCE[0]}")/boxtext.py"; }

# True when the box shows the queued-messages hint (the lane is mid-turn; a submission was queued behind it).
ctl_box_queued() { tmux capture-pane -e -p -t "$1" 2>/dev/null | grep -q 'Press up to edit queued messages'; }

# Submit the box of TARGET: press Enter, wait, re-read the REAL text; repeat while text remains, at most N (default 3)
# times. Prints the number of presses it took; exit 1 when real text is still there after N presses.
ctl_submit() {
  local target="$1" max="${2:-3}" try=1
  while :; do
    ctl_press_enter "$target" || return 1
    sleep "${CTL_SUBMIT_WAIT_SECS:-2}"  # test seam (P51): live pastes keep the default; lowering it in a live env loses keystrokes
    [ -z "$(ctl_box_text "$target")" ] && { echo "$try"; return 0; }
    [ "$try" -lt "$max" ] || return 1
    try=$((try+1))
  done
}

# The transcript ABOVE the last ❯ prompt line of TARGET, plain text (last 300 lines of scrollback).
ctl_pane_above() { tmux capture-pane -p -S -300 -t "$1" 2>/dev/null | awk '/❯/{last=NR} {l[NR]=$0} END{for(i=1;i<last;i++)print l[i]}'; }
# Spinner lines are the one thing a pane shows only while a turn runs: "✳ Imagining… (6s · ↓ 107 tokens)".
ctl_count_spinners() { grep -cE '… \(([0-9]+m )?[0-9]+s' || true; }

# Positive proof that a submission was delivered to TARGET. BEFORE is the transcript-above-the-prompt captured BEFORE
# the paste (ctl_pane_above > file); NEEDLE is the file's LAST non-empty line, cut to 30 chars — Claude Code collapses a
# long paste to "[Pasted text #N +M lines]" placeholders in the box and echoes the message's TAIL above the prompt
# (measured 2026-09-21: a 60-line paste's first line never appeared, lines 11–59 did). Prints which proof held:
#   idle lane: the box holds no real text, the needle count above the prompt rose, and a spinner is present now that
#              was absent before (spinner lines: 0 before, 1 after, measured);
#   busy lane: the box holds no real text and shows the dim queued-messages hint.
# Polls for up to 20 s (CTL_PROOF_TRIES); exit 1 with nothing printed when neither proof holds — old scrollback satisfies
# nothing here. CTL_DEBUG=1 prints each poll's readings to stderr.
ctl_delivered() {
  local target="$1" needle="$2" before="$3" i above n0 s0
  n0="$(grep -cF -- "$needle" "$before" || true)"; s0="$(ctl_count_spinners < "$before")"
  for i in $(seq 1 "${CTL_PROOF_TRIES:-20}"); do
    if [ -z "$(ctl_box_text "$target")" ]; then
      above="$(ctl_pane_above "$target")"
      [ -n "${CTL_DEBUG:-}" ] && echo "ctl_delivered t+$i: needle $(printf '%s\n' "$above" | grep -cF -- "$needle" || true)>$n0? spinners $(printf '%s\n' "$above" | ctl_count_spinners)>$s0? queued=$(ctl_box_queued "$target" && echo y || echo n)" >&2
      if [ "$(printf '%s\n' "$above" | grep -cF -- "$needle" || true)" -gt "$n0" ] && [ "$(printf '%s\n' "$above" | ctl_count_spinners)" -gt "$s0" ]; then
        echo "echoed above the prompt, new turn running"; return 0
      fi
      if ctl_box_queued "$target"; then echo "queued behind the lane's running turn"; return 0; fi
    fi
    sleep "${CTL_PROOF_POLL_SECS:-1}"  # test seam (P51): live pastes keep the default; lowering it in a live env loses keystrokes
  done
  return 1
}

# --- the postman's pane checks (postman design §6, 2026-10-03). An ALLOWLIST for "safe to type": anything not proven
# to be an idle Claude Code prompt is refused, because a pointer line pasted into a shell would be EXECUTED and a
# pasted Enter on a permission menu picks option 1.
# True when the pane's foreground command is a Claude Code session: the measured version string (2.1.288), claude, node.
ctl_cmd_is_claude() { local re="${CTL_POSTMAN_CMD_RE:-^([0-9]+\.[0-9]+\.[0-9]+|claude|node)\$}"; [[ "$1" =~ $re ]]; }

# ctl_pane_state TARGET — exactly one token: no-window | not-claude | copy-mode | menu | ours | text | busy | ok.
#   ours = the box holds our own unsubmitted pointer ("[postman #…"); text = any other real text (never cleared);
#   menu = no prompt on screen, or the last ❯ line is a numbered option ("❯ 1. Yes"); busy = a running spinner or the queued hint.
ctl_pane_state() {
  local t="$1" cmd mode cap last box
  cmd="$(tmux display-message -p -t "$t" '#{pane_current_command}' 2>/dev/null)" || { echo no-window; return 0; }
  [ -n "$cmd" ] || { echo no-window; return 0; }
  ctl_cmd_is_claude "$cmd" || { echo not-claude; return 0; }
  mode="$(tmux display-message -p -t "$t" '#{pane_in_mode}' 2>/dev/null)"
  [ "$mode" = 1 ] && { echo copy-mode; return 0; }
  cap="$(tmux capture-pane -p -t "$t" 2>/dev/null)"
  last="$(printf '%s\n' "$cap" | grep '❯' | tail -1)"
  [ -n "$last" ] || { echo menu; return 0; }
  printf '%s' "$last" | grep -qE '❯[[:space:]]*[0-9]+\.' && { echo menu; return 0; }
  box="$(ctl_box_text "$t")"
  if [ -n "$box" ]; then case "$box" in "[postman #"*) echo ours;; *) echo text;; esac; return 0; fi
  if ctl_box_queued "$t" || [ "$(ctl_pane_above "$t" | tail -8 | ctl_count_spinners)" -gt 0 ]; then echo busy; else echo ok; fi
}

# ctl_pane_deliver_line TARGET LINE — paste ONE line (no trailing newline: a single-line paste submits on the first Enter),
# submit, and read the proof. Prints echoed | queued | unproven | unsubmitted | failed.
ctl_pane_deliver_line() {
  local t="$1" line="$2" f snap b proof
  f="$(mktemp)"; snap="$f.before"; printf '%s' "$line" > "$f"; ctl_pane_above "$t" > "$snap"
  b="ctlpm$$"
  if ! { tmux load-buffer -b "$b" "$f" && tmux paste-buffer -b "$b" -d -t "$t"; }; then rm -f "$f" "$snap"; echo failed; return 1; fi
  sleep "${CTL_PASTE_SETTLE_SECS:-1}"  # test seam (P51): live pastes keep the default; lowering it in a live env loses keystrokes
  if ! ctl_submit "$t" >/dev/null; then rm -f "$f" "$snap"; echo unsubmitted; return 1; fi
  if proof="$(ctl_delivered "$t" "$(printf '%s' "$line" | cut -c1-30)" "$snap")"; then case "$proof" in queued*) echo queued;; *) echo echoed;; esac; else echo unproven; fi
  rm -f "$f" "$snap"
}

# ctl_pane_submit_pending TARGET — Enter presses only (our own earlier paste is still in the box). Prints submitted | unsubmitted.
ctl_pane_submit_pending() { if ctl_submit "$1" >/dev/null; then echo submitted; else echo unsubmitted; return 1; fi; }
