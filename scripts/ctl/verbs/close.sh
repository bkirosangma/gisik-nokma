#!/usr/bin/env bash
# ctl close <window> — close an idle lane's window once its work is safe (owner 2026-09-28: "close down unused lanes.
# dont leave them open."). Refuses the controller (0), the planner window, a missing window, a lane whose Claude turn is
# still running, and a worktree that is dirty, has no upstream, or has commits its upstream does not. The worktree stays
# on disk; `ctl restart` creates the window again when a lane is needed.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || true
win="${CTL_ARGS[0]:-}"
[ -n "$win" ] || ctl_fail close "usage: ctl close <window>"
case "$win" in *[!0-9]*) ctl_fail close "window must be a number, got '$win'";; esac
[ "$win" != 0 ] || ctl_fail close "window 0 is the controller"
name="$(tmux list-windows -t gisik -F '#{window_index} #{window_name}' 2>/dev/null | awk -v w="$win" '$1 == w {print $2}')"
[ -n "$name" ] || ctl_fail close "no window gisik:$win"
[ "$name" != planner ] || ctl_fail close "gisik:$win is the planner"
pane="$(tmux capture-pane -p -S -40 -t "gisik:$win" 2>/dev/null)"
[ "$(printf '%s\n' "$pane" | ctl_count_spinners)" -eq 0 ] || ctl_fail close "gisik:$win has a turn running — wait for it to finish"
wt="$(tmux display-message -p -t "gisik:$win" '#{pane_current_path}')"
# The spinner check alone is not enough: a pane scrolled back ("1 new message ↓") hides a running turn's spinner
# (measured 2026-09-28 on gisik:5 — a working lane read as idle). The session's own transcript is the second witness:
# it must not have been written for GISIK_CLOSE_IDLE_MIN minutes (default 10).
idle_min="${GISIK_CLOSE_IDLE_MIN:-10}"
tdir="$HOME/.claude/projects/$(printf '%s' "$wt" | sed 's/[^A-Za-z0-9]/-/g')"
newest="$(/bin/ls -t "$tdir"/*.jsonl 2>/dev/null | head -1)"
if [ -n "$newest" ]; then
  age_min=$(( ( $(date +%s) - $(stat -f %m "$newest") ) / 60 ))
  [ "$age_min" -ge "$idle_min" ] || ctl_fail close "gisik:$win transcript written ${age_min}m ago (< ${idle_min}m) — the lane may still be working"
fi
if /usr/bin/git -C "$wt" rev-parse --git-dir >/dev/null 2>&1; then
  [ -z "$(/usr/bin/git -C "$wt" status --porcelain)" ] || ctl_fail close "worktree $wt is dirty"
  /usr/bin/git -C "$wt" rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1 || ctl_fail close "worktree $wt has no upstream — push it first"
  ahead="$(/usr/bin/git -C "$wt" rev-list --count '@{u}..HEAD')"
  [ "$ahead" = 0 ] || ctl_fail close "worktree $wt has $ahead unpushed commit(s)"
fi
old_pid="$(tmux list-panes -t "gisik:$win" -F '#{pane_pid}' | head -1)"
ctl_run tmux kill-window -t "gisik:$win"
[ "${CTL_DRY_RUN:-0}" = 1 ] && ctl_ok close "dry-run: would close gisik:$win ($name, $wt)"
tmux list-windows -t gisik -F '#{window_index}' | grep -qx "$win" && ctl_fail close "gisik:$win still exists after kill-window"
ctl_ok close "gisik:$win ($name) closed; pane pid $old_pid gone; worktree $wt clean and pushed, left on disk"
