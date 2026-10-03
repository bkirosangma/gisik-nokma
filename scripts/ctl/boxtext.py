#!/usr/bin/env python3
"""The input box of a Claude Code pane — ONE reading, shared by lib.sh ctl_box_text and verbs/seats.py (case 13.1820).

The box is the last ❯ line ABOVE the status line, preferring the one whose next line is a rule of ─ (it sits between the two
rules). A ❯ BELOW the status line is never the box: the background-agent panel opens under the footer and puts ❯ on its selected
row. With no status line (a bare shell, a fixture) the last ❯ in the pane is the box.

  boxtext.py   reads `tmux capture-pane -e -p` on stdin, prints the REAL (non-dim) text after the box's ❯ (empty for a ghost)
"""
import re, sys

ANSI = re.compile(r"\x1b\[[0-9;]*m")
DIM = re.compile(r"\x1b\[2m.*?(?:\x1b\[0m|\x1b\[22m|$)", re.S)     # a dim span ends at its reset or at the line's end: dim text is not input
RULE = re.compile(r"─{3,}")


def plain_of(line):
    return ANSI.sub("", line).replace(" ", " ").rstrip()


def status_index(plain):
    """The last line that looks like the Claude Code status line (`… | … | Ctx N% | …`), else None."""
    return next((i for i in range(len(plain) - 1, -1, -1) if re.search(r"Ctx \d+%", plain[i]) and "|" in plain[i]), None)


def box_index(plain, status):
    """Index of the box's ❯ line in the ANSI-stripped lines, or None when the pane has no ❯ line."""
    limit = len(plain) if status is None else status
    cands = [i for i in range(limit) if "❯" in plain[i]]
    for i in reversed(cands):
        if i + 1 < len(plain) and RULE.fullmatch(plain[i + 1].strip()): return i
    return cands[-1] if cands else None


def box_text(lines, idx):
    """The REAL (non-dim) text after the ❯ on lines[idx]."""
    if idx is None: return ""
    return ANSI.sub("", DIM.sub("", lines[idx].split("❯", 1)[1])).strip()


if __name__ == "__main__":
    lines = sys.stdin.read().split("\n")
    plain = [plain_of(l) for l in lines]
    print(box_text(lines, box_index(plain, status_index(plain))))
