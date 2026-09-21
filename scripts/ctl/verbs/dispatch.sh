#!/usr/bin/env bash
# ctl dispatch <window> <file> — paste the text (load-buffer/paste-buffer), then submit with real Enter keypresses until the
# box holds no real text (a multi-line paste absorbs the first Enter — measured 2026-09-21 on gisik:4, with and without a
# trailing newline, 1 s or 3 s pause; the second submits; a pasted "\r" never counted for more than one), leaving copy
# mode first. Proof of delivery reads only NON-DIM text: the prompt suggestion and "Press up to edit queued messages"
# are dim ghost text, not input. Delivered = box empty AND (the text is echoed above the prompt with a running turn, OR
# the lane was mid-turn and the queued-messages hint shows).
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || true
win="${CTL_ARGS[0]:-}"; file="${CTL_ARGS[1]:-}"
[ -n "$win" ] && [ -f "$file" ] || ctl_fail dispatch "usage: ctl dispatch <window> <file>"
tmux has-session -t gisik 2>/dev/null || ctl_fail dispatch "no gisik session"
tmux list-windows -t gisik -F '#{window_index}' | grep -qx "$win" || ctl_fail dispatch "no window gisik:$win"
t="gisik:$win"
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: paste $file into $t, then send-keys Enter until the box is empty (max 3; -X cancel first if in copy mode)"; ctl_ok dispatch "dry-run"; fi
before="$(ctl_box_text "$t")"
[ -z "$before" ] || ctl_fail dispatch "input box already holds real text: '${before:0:60}' — clear it first"
b="ctl$$"
tmux load-buffer -b "$b" "$file" && tmux paste-buffer -b "$b" -d -t "$t" || ctl_fail dispatch "text paste failed"
sleep 1
presses="$(ctl_submit "$t")" || ctl_fail dispatch "input box still holds text after 3 Enters: '$(ctl_box_text "$t" | cut -c1-60)' — not submitted"
needle="$(head -1 "$file" | cut -c1-40)"
proof=""
for i in 1 2 3 4 5 6 7 8 9 10; do
  pane="$(tmux capture-pane -p -S -80 -t "$t")"
  above="$(printf '%s\n' "$pane" | awk '/❯/{last=NR} {l[NR]=$0} END{for(i=1;i<last;i++)print l[i]}')"
  if printf '%s\n' "$above" | grep -qF "${needle:0:30}" && printf '%s\n' "$above" | grep -qE '… \(([0-9]+m )?[0-9]+s|⏺'; then proof="echoed above the prompt, turn running"; break; fi
  if ctl_box_queued "$t"; then proof="queued behind the lane's running turn"; break; fi
  sleep 1
done
[ -n "$proof" ] || ctl_fail dispatch "box emptied but no proof of delivery in 10 s: text not echoed above the prompt and no queued-messages hint"
ctl_ok dispatch "$t received $(wc -c < "$file" | tr -d ' ') bytes (Enter ×$presses; $proof)"
