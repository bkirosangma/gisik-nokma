#!/usr/bin/env bash
# ctl seats [--json] [--flag] — one line per tmux window of session gisik: busy/idle, background shells and monitors, the input
# box (empty / text / copy-mode), Ctx %, model and effort (`?` when the status line has no effort segment), the worktree's branch@head with unpushed and dirty counts, and the last
# DONE / CHECKPOINT / "needs fresh session" line with its age. --flag prints only the seats that need action. READ-ONLY:
# `tmux list-windows` and `tmux capture-pane` only, never send-keys; git is read with GIT_OPTIONAL_LOCKS=0 so a lane's own
# git is never blocked. Windows are read in parallel (13 windows well under 2 s); the parsing is verbs/seats.py.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
HERE="$(cd "$(dirname "$0")" && pwd)"
mode=(); dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --json|--flag) mode+=("$1"); shift;;
    --dry-run) dry=1; shift;;
    --repo) shift 2;;
    *) ctl_fail seats "usage: ctl seats [--json] [--flag]";;
  esac
done
if [ "$dry" = 1 ]; then echo "DRY: tmux list-windows -t gisik; tmux capture-pane -e -p -S -1000 per window; git status/rev-list per worktree (read-only)"; ctl_ok seats "dry-run"; fi
tmux has-session -t gisik 2>/dev/null || ctl_fail seats "no gisik session"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
tmux list-windows -t gisik -F "$(printf '#{window_index}\t#{window_name}\t#{pane_in_mode}\t#{pane_current_path}')" > "$tmp/windows" 2>/dev/null
[ -s "$tmp/windows" ] || ctl_fail seats "gisik has no windows"
export GIT_OPTIONAL_LOCKS=0
G=/usr/bin/git
gather() {   # gather IDX NAME MODE PATH — one window's pane and git facts into $tmp
  local idx="$1" name="$2" pmode="$3" path="$4" br="" head="" up="" dirty=""
  tmux capture-pane -e -p -S -1000 -t "gisik:$idx" > "$tmp/$idx.pane" 2>/dev/null
  if [ -n "$path" ] && $G -C "$path" rev-parse --git-dir >/dev/null 2>&1; then
    br="$($G -C "$path" branch --show-current)"; [ -n "$br" ] || br="(detached)"
    head="$($G -C "$path" rev-parse --short HEAD 2>/dev/null)"
    # Unpushed = commits the remote does not have: against origin/<branch> when it exists, else against EVERY origin ref.
    # Never against @{u}: a task branch is cut from the release branch, so its upstream is the release and counts the whole task.
    if $G -C "$path" rev-parse --verify -q "refs/remotes/origin/$br" >/dev/null 2>&1; then up="$($G -C "$path" rev-list --count "origin/$br..HEAD" 2>/dev/null)"
    else up="$($G -C "$path" rev-list --count HEAD --not --remotes=origin 2>/dev/null)"; fi
    dirty="$($G -C "$path" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  fi
  printf 'name=%s\nmode=%s\nwt=%s\nbranch=%s\nhead=%s\nunpushed=%s\ndirty=%s\n' "$name" "$pmode" "$path" "$br" "$head" "$up" "$dirty" > "$tmp/$idx.meta"
}
while IFS=$'\t' read -r idx name pmode path; do
  [ -n "$idx" ] && gather "$idx" "$name" "$pmode" "$path" </dev/null &
done < "$tmp/windows"
wait
python3 "$HERE/seats.py" --dir "$tmp" ${mode[@]+"${mode[@]}"}
exit $?   # not `exec`: the EXIT trap removes $tmp
