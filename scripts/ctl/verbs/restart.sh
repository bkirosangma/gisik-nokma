#!/usr/bin/env bash
# ctl restart <window> <worktree> <brief> [--override FILE] [--model M] [--effort E] — kill, relaunch through exec-claude.sh (the one-line launch command
# is pasted into the fresh shell, then submitted with a real Enter keypress via ctl_press_enter, 2026-09-21), verify the pane
# pid changed and the backend line. --model / --effort (owner 2026-10-04: a lane runs at the rung its task needs, TIERS-model-effort.md)
# are appended to the launch line as `--model M --effort E`, which are claude's own flags (`claude --help`: "--effort <level> ... (low,
# medium, high, xhigh, max)", "--model <model>"); exec-claude.sh lets a caller's value win over its own opus / high defaults. Both are
# optional: without them the pasted line is byte-identical to before. A bad value FAILS here, in the arg loop, before the supersede marker
# is written and before the window is killed (a kill followed by a refusal would leave the seat dead).
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || true
win="${CTL_ARGS[0]:-}"; wt="${CTL_ARGS[1]:-}"; brief="${CTL_ARGS[2]:-}"; override=""; model=""; effort=""
# `shift 2` with one word left fails WITHOUT shifting, so every value-taking arm checks `$# -ge 2` first (a trailing flag would loop forever).
set -- "${CTL_ARGS[@]:3}"; while [ $# -gt 0 ]; do case "$1" in
  --override) [ $# -ge 2 ] || ctl_fail restart "--override needs a file"; override="$2"; shift 2;;
  --model) [ $# -ge 2 ] || ctl_fail restart "--model needs a value (an alias such as sonnet or opus, or a full model name)"
    [[ "$2" =~ ^[a-z0-9][a-z0-9.-]*$ ]] || ctl_fail restart "--model '$2' is not a model alias or name (lowercase letters, digits, . and - only)"; model="$2"; shift 2;;
  --effort) [ $# -ge 2 ] || ctl_fail restart "--effort needs a value (low, medium, high, xhigh, max)"
    case "$2" in low|medium|high|xhigh|max) effort="$2";; *) ctl_fail restart "--effort '$2' is not one of low, medium, high, xhigh, max";; esac; shift 2;;
  *) ctl_fail restart "unknown arg $1";; esac; done
[ -n "$win" ] && [ -d "$wt" ] && [ -f "$brief" ] || ctl_fail restart "usage: ctl restart <window> <worktree> <brief> [--override FILE] [--model M] [--effort E]"
[ "$win" != 0 ] || ctl_fail restart "window 0 is the controller"
[ -z "$(/usr/bin/git -C "$wt" status --porcelain)" ] || ctl_fail restart "worktree $wt is dirty — take a handoff first"
launcher="/Users/kiro/my_projects/gisik-nokma-lanes/exec-claude.sh"; [ -x "$launcher" ] || ctl_fail restart "no $launcher"
# Keep the window's existing NAME: the postman addresses a seat by it (a window named `reviewerB` stays `reviewerB`; the old
# `exec$win` rename orphaned messages addressed to the seat). CTL_TMUX_SESSION is a seam for this ONE read-only lookup (tests);
# the kill/new-window below stay on the live session (and refuse the seam, see the guard under the dry-run exit).
# (list-windows, not display-message: a missing index makes display-message answer with the ACTIVE window's name.)
name="$(tmux list-windows -t "${CTL_TMUX_SESSION:-gisik}" -F '#{window_index} #{window_name}' 2>/dev/null | awk -v w="$win" '$1==w{sub(/^[0-9]+ /,""); print}')"; [ -n "$name" ] || name="exec$win"
prompt="$(cat "$brief")"; [ -n "$override" ] && prompt="$prompt

$(cat "$override")"
pf="$(ctl_log restart).prompt"; printf '%s' "$prompt" > "$pf"
# The ONE launch line: the dry-run prints it and the live path pastes it, so the line a test reads is the line that runs.
cmd="$launcher --permission-mode bypassPermissions${model:+ --model $model}${effort:+ --effort $effort} \"\$(cat $pf)\""
# A fresh session never saw the messages still open for this seat: the postman cancels those posted before now (restart first, then post).
# The marker call sits ABOVE the dry-run exit (passing --dry-run through) so the dry path proves it and the name it uses.
pm=(bash "$(cd "$(dirname "$0")/.." && pwd)/ctl" postman restarted "$name"); [ "$CTL_DRY_RUN" = 1 ] && pm+=(--dry-run)
if pm_out="$("${pm[@]}" 2>&1)"; then [ "$CTL_DRY_RUN" != 1 ] || printf '%s\n' "$pm_out" | grep '^DRY'
else echo "WARN restart: postman marker not written for '$name' — its open messages will jam the head of the queue until acked: $(printf '%s' "$pm_out" | tail -1)"; fi
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: tmux kill-window -t gisik:$win; tmux new-window -t gisik:$win -n $name -c $wt; sleep 3; paste: $cmd; send-keys Enter"; ctl_ok restart "dry-run"; fi
# CTL_TMUX_SESSION is a TEST seam for the name lookup above; the kill/new-window below hardcode gisik:N, so a live restart refuses it
# (a dry-run exit that is removed or skipped must still stop here, before the first write).
[ -z "${CTL_TMUX_SESSION:-}" ] || [ "$CTL_TMUX_SESSION" = gisik ] || ctl_fail restart "CTL_TMUX_SESSION=$CTL_TMUX_SESSION is a test seam: a live restart refuses it"
old_pid="$(tmux list-panes -t "gisik:$win" -F '#{pane_pid}' 2>/dev/null | head -1)"
tmux kill-window -t "gisik:$win" 2>/dev/null
tmux new-window -t "gisik:$win" -n "$name" -c "$wt" || ctl_fail restart "new-window failed"
# A paste into a freshly created window races the terminal's own query reply (measured 2026-09-21 18:40: the
# launch line arrived as `reqbash …`, command not found). Let the shell settle before the first paste.
sleep 3
new_pid="$(tmux list-panes -t "gisik:$win" -F '#{pane_pid}' | head -1)"
[ -n "$new_pid" ] && [ "$new_pid" != "$old_pid" ] || ctl_fail restart "pane pid did not change (before=${old_pid:-none} after=${new_pid:-none}) — the window was not relaunched"
lb="ctlr$$"; printf '%s' "$cmd" | tmux load-buffer -b "$lb" - && tmux paste-buffer -b "$lb" -d -t "gisik:$win"; sleep 1
ctl_press_enter "gisik:$win" || ctl_fail restart "Enter keypress failed"
for i in $(seq 1 30); do sleep 1; pane="$(tmux capture-pane -p -S -40 -t "gisik:$win")"; if printf '%s' "$pane" | grep -qE 'backend (anthropic|deepseek)'; then break; fi; done
printf '%s' "$pane" | grep -qE 'backend (anthropic|deepseek)' || ctl_fail restart "no backend line in gisik:$win after 30 s"
backend="$(printf '%s' "$pane" | grep -oE 'backend (anthropic|deepseek)' | head -1)"
ctl_ok restart "gisik:$win relaunched in $wt ($backend; pane pid ${old_pid:-none} → $new_pid)"
