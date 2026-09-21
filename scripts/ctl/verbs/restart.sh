#!/usr/bin/env bash
# ctl restart <window> <worktree> <brief> [--override FILE] — kill, relaunch through exec-claude.sh, verify the backend line.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || true
win="${CTL_ARGS[0]:-}"; wt="${CTL_ARGS[1]:-}"; brief="${CTL_ARGS[2]:-}"; override=""
set -- "${CTL_ARGS[@]:3}"; while [ $# -gt 0 ]; do case "$1" in --override) override="$2"; shift 2;; *) ctl_fail restart "unknown arg $1";; esac; done
[ -n "$win" ] && [ -d "$wt" ] && [ -f "$brief" ] || ctl_fail restart "usage: ctl restart <window> <worktree> <brief> [--override FILE]"
[ "$win" != 0 ] || ctl_fail restart "window 0 is the controller"
[ -z "$(/usr/bin/git -C "$wt" status --porcelain)" ] || ctl_fail restart "worktree $wt is dirty — take a handoff first"
launcher="/Users/kiro/my_projects/gisik-nokma-lanes/exec-claude.sh"; [ -x "$launcher" ] || ctl_fail restart "no $launcher"
name="exec$win"
prompt="$(cat "$brief")"; [ -n "$override" ] && prompt="$prompt

$(cat "$override")"
pf="$(ctl_log restart).prompt"; printf '%s' "$prompt" > "$pf"
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: tmux kill-window -t gisik:$win; tmux new-window -t gisik:$win -n $name -c $wt; $launcher --permission-mode bypassPermissions \"\$(cat $pf)\""; ctl_ok restart "dry-run"; fi
tmux kill-window -t "gisik:$win" 2>/dev/null
tmux new-window -t "gisik:$win" -n "$name" -c "$wt" || ctl_fail restart "new-window failed"
cmd="$launcher --permission-mode bypassPermissions \"\$(cat $pf)\""
lb="ctlr$$"; printf '%s' "$cmd" | tmux load-buffer -b "$lb" - && tmux paste-buffer -b "$lb" -d -t "gisik:$win"; sleep 1
printf '\r' | tmux load-buffer -b "${lb}cr" - && tmux paste-buffer -b "${lb}cr" -d -t "gisik:$win"
for i in $(seq 1 30); do sleep 1; pane="$(tmux capture-pane -p -S -40 -t "gisik:$win")"; if printf '%s' "$pane" | grep -qE 'backend (anthropic|deepseek)'; then break; fi; done
printf '%s' "$pane" | grep -qE 'backend (anthropic|deepseek)' || ctl_fail restart "no backend line in gisik:$win after 30 s"
backend="$(printf '%s' "$pane" | grep -oE 'backend (anthropic|deepseek)' | head -1)"
ctl_ok restart "gisik:$win relaunched in $wt ($backend)"
