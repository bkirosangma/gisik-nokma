#!/usr/bin/env bash
# ctl dispatch <window> <file> — two pastes (text, pause, CR) and proof of delivery. Never send-keys.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || true
win="${CTL_ARGS[0]:-}"; file="${CTL_ARGS[1]:-}"
[ -n "$win" ] && [ -f "$file" ] || ctl_fail dispatch "usage: ctl dispatch <window> <file>"
tmux has-session -t gisik 2>/dev/null || ctl_fail dispatch "no gisik session"
tmux list-windows -t gisik -F '#{window_index}' | grep -qx "$win" || ctl_fail dispatch "no window gisik:$win"
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: paste $file into gisik:$win then CR"; ctl_ok dispatch "dry-run"; fi
b="ctl$$"
tmux load-buffer -b "$b" "$file" && tmux paste-buffer -b "$b" -d -t "gisik:$win" || ctl_fail dispatch "text paste failed"
sleep 1
printf '\r' | tmux load-buffer -b "${b}cr" - && tmux paste-buffer -b "${b}cr" -d -t "gisik:$win" || ctl_fail dispatch "CR paste failed"
sleep 3
pane="$(tmux capture-pane -p -S -80 -t "gisik:$win")"
last="$(printf '%s\n' "$pane" | grep '❯' | tail -1 | sed 's/^ *❯ *//')"
[ -z "$last" ] || ctl_fail dispatch "input box still holds text: '${last:0:60}' — not submitted"
needle="$(head -c 40 "$file" | tr -d '\n')"
printf '%s' "$pane" | grep -qF "${needle:0:30}" || ctl_fail dispatch "text not found in the transcript above the prompt"
ctl_ok dispatch "gisik:$win received $(wc -c < "$file" | tr -d ' ') bytes; input box empty"
