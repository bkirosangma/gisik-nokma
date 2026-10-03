#!/usr/bin/env bash
# scripts/ctl/test/fakeseat.sh MODE RECORD [PRETEXT] — a stand-in for a Claude Code pane, for postman.test.sh ONLY.
# Every byte that reaches the pane's input is appended to RECORD, so "nothing was typed" is a file-size assertion.
#   idle   a prompt `❯ ` that reads a line; on Enter echoes it above the prompt, shows a spinner line, redraws the prompt
#   mute   a prompt that swallows input silently (no echo, no spinner): a paste into it is never proven
#   busy   a running spinner above the prompt; a submitted line is queued (dim "Press up to edit queued messages")
#   prefill  like idle, but the box starts holding PRETEXT (an unsubmitted paste or someone's draft)
#   menu   a permission menu: `❯ 1. Yes` — a pasted Enter would pick option 1
#   text   a prompt whose box holds PRETEXT and never submits (someone typing)
mode="${1:-idle}"; rec="${2:-/dev/null}"; pre="${3:-}"
case "$mode" in
  idle)
    while true; do printf '❯ '; IFS= read -r line || exit 0; printf '%s\n' "$line" >> "$rec"
      printf '\n● %s\n✳ Working… (3s · ↓ 10 tokens)\n' "$line"; sleep 3; done;;
  prefill)
    while true; do IFS= read -r -e -i "$pre" -p '❯ ' line || exit 0; printf '%s\n' "$line" >> "$rec"
      printf '\n● %s\n✳ Working… (3s · ↓ 10 tokens)\n' "$line"; sleep 3; pre=""; done;;
  busy)
    printf '✳ Working… (125s · ↓ 4000 tokens)\n'
    while true; do printf '❯ '; IFS= read -r line || exit 0; printf '%s\n' "$line" >> "$rec"
      printf '\033[2mPress up to edit queued messages\033[0m\n'; done;;
  mute)
    printf '❯ '; stty -echo -icanon min 1; cat >> "$rec";;
  menu)
    printf 'Do you want to proceed?\n❯ 1. Yes\n  2. No\n'; stty -echo -icanon min 1; cat >> "$rec";;
  text)
    printf '❯ %s' "$pre"; stty -echo -icanon min 1; cat >> "$rec";;
esac
