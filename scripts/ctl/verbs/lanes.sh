#!/usr/bin/env bash
# ctl lanes [--watch] — one line per gisik: window; --watch prints on change only, every 60 s.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
watch=0; for a in "$@"; do [ "$a" = "--watch" ] && watch=1; done
snapshot() {
  tmux list-windows -t gisik -F '#{window_index} #{window_name}' 2>/dev/null | while read -r idx name; do
    pane="$(tmux capture-pane -p -S -60 -t "gisik:$idx" 2>/dev/null)"
    prompt="$(printf '%s\n' "$pane" | grep '❯' | tail -1 | sed 's/^ *❯ *//' | cut -c1-70)"
    ctx="$(printf '%s\n' "$pane" | grep -o 'Ctx [0-9]*%' | tail -1)"
    err="$(printf '%s\n' "$pane" | grep -oE 'API Error[^|]{0,40}|402|Insufficient Balance' | tail -1)"
    br="$(/usr/bin/git -C "/Users/kiro/my_projects/gisik-nokma-$name" branch --show-current 2>/dev/null)"
    age=""; if [ -n "$br" ]; then ts="$(/usr/bin/git -C "/Users/kiro/my_projects/gisik-nokma-$name" log -1 --format=%ct "origin/$br" 2>/dev/null)"; [ -n "$ts" ] && age="pushed $(( ( $(date +%s) - ts ) / 60 ))m ago"; fi
    printf 'gisik:%s %-6s %-9s %-14s stranded=[%s] err=[%s] %s\n' "$idx" "$name" "${ctx:-ctx?}" "${br:-no-worktree}" "$prompt" "$err" "$age"
  done
}
if [ "$watch" = 0 ]; then snapshot; echo "OK lanes $(tmux list-windows -t gisik 2>/dev/null | wc -l | tr -d ' ') windows"; exit 0; fi
prev=""; while true; do cur="$(snapshot)"; if [ "$cur" != "$prev" ]; then echo "--- $(date '+%H:%M:%S')"; echo "$cur"; prev="$cur"; fi; sleep 60; done
