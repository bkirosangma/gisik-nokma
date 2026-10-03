#!/usr/bin/env bash
# ctl restart <window> <worktree> <brief> [--override FILE] — kill, relaunch through exec-claude.sh (the one-line launch command
# is pasted into the fresh shell, then submitted with a real Enter keypress via ctl_press_enter, 2026-09-21), verify the pane
# pid changed and the backend line.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || true
win="${CTL_ARGS[0]:-}"; wt="${CTL_ARGS[1]:-}"; brief="${CTL_ARGS[2]:-}"; override=""
set -- "${CTL_ARGS[@]:3}"; while [ $# -gt 0 ]; do case "$1" in --override) override="$2"; shift 2;; *) ctl_fail restart "unknown arg $1";; esac; done
[ -n "$win" ] && [ -d "$wt" ] && [ -f "$brief" ] || ctl_fail restart "usage: ctl restart <window> <worktree> <brief> [--override FILE]"
[ "$win" != 0 ] || ctl_fail restart "window 0 is the controller"
[ -z "$(/usr/bin/git -C "$wt" status --porcelain)" ] || ctl_fail restart "worktree $wt is dirty — take a handoff first"
launcher="/Users/kiro/my_projects/gisik-nokma-lanes/exec-claude.sh"; [ -x "$launcher" ] || ctl_fail restart "no $launcher"
# Keep the window's existing NAME: the postman addresses a seat by it (window 10 is `exec6`, not `exec10`).
name="$(tmux display-message -p -t "gisik:$win" '#{window_name}' 2>/dev/null)"; [ -n "$name" ] || name="exec$win"
prompt="$(cat "$brief")"; [ -n "$override" ] && prompt="$prompt

$(cat "$override")"
pf="$(ctl_log restart).prompt"; printf '%s' "$prompt" > "$pf"
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: ctl postman restarted $name; tmux kill-window -t gisik:$win; tmux new-window -t gisik:$win -n $name -c $wt; sleep 3; paste: $launcher --permission-mode bypassPermissions \"\$(cat $pf)\"; send-keys Enter"; ctl_ok restart "dry-run"; fi
# A fresh session never saw the messages still open for this seat: the postman cancels those posted before now (restart first, then post).
bash "$(cd "$(dirname "$0")/.." && pwd)/ctl" postman restarted "$name" >/dev/null 2>&1 || true
old_pid="$(tmux list-panes -t "gisik:$win" -F '#{pane_pid}' 2>/dev/null | head -1)"
tmux kill-window -t "gisik:$win" 2>/dev/null
tmux new-window -t "gisik:$win" -n "$name" -c "$wt" || ctl_fail restart "new-window failed"
# A paste into a freshly created window races the terminal's own query reply (measured 2026-09-21 18:40: the
# launch line arrived as `reqbash …`, command not found). Let the shell settle before the first paste.
sleep 3
new_pid="$(tmux list-panes -t "gisik:$win" -F '#{pane_pid}' | head -1)"
[ -n "$new_pid" ] && [ "$new_pid" != "$old_pid" ] || ctl_fail restart "pane pid did not change (before=${old_pid:-none} after=${new_pid:-none}) — the window was not relaunched"
cmd="$launcher --permission-mode bypassPermissions \"\$(cat $pf)\""
lb="ctlr$$"; printf '%s' "$cmd" | tmux load-buffer -b "$lb" - && tmux paste-buffer -b "$lb" -d -t "gisik:$win"; sleep 1
ctl_press_enter "gisik:$win" || ctl_fail restart "Enter keypress failed"
for i in $(seq 1 30); do sleep 1; pane="$(tmux capture-pane -p -S -40 -t "gisik:$win")"; if printf '%s' "$pane" | grep -qE 'backend (anthropic|deepseek)'; then break; fi; done
printf '%s' "$pane" | grep -qE 'backend (anthropic|deepseek)' || ctl_fail restart "no backend line in gisik:$win after 30 s"
backend="$(printf '%s' "$pane" | grep -oE 'backend (anthropic|deepseek)' | head -1)"
ctl_ok restart "gisik:$win relaunched in $wt ($backend; pane pid ${old_pid:-none} → $new_pid)"
