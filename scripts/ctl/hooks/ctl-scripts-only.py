#!/usr/bin/env python3
"""PreToolUse/Bash guard: the controller's mechanical operations run through scripts/ctl/ctl, never by hand.

Owner's order, 2026-09-21: "script up everything scriptable, and wire it up so that these are always run
with the scripts and never with the llms." Same contract as no-piped-test-runs.py: JSON on stdin; to refuse,
print {"hookSpecificOutput": {...,"permissionDecision":"deny",...}} and exit 0; to allow, print nothing.

Escape hatch: when GISIK_CTL_UNLOCK is set in THIS process's environment the hook allows everything.
Only a session launched with it set has it; `GISIK_CTL_UNLOCK=1 gh pr merge` typed by a model sets the
child's environment, not this hook's.
"""
import json, os, re, sys

PRIMARY = os.environ.get("GISIK_PRIMARY", "/Users/kiro/my_projects/gisik-nokma")
HEREDOC_START = re.compile(r"<<-?\s*[\"\']?([A-Za-z_][A-Za-z0-9_]*)[\"\']?")
TEXT_EMITTERS = ("echo", "printf", "cat")
SEGMENT_SEP = re.compile(r"&&|\|\||;|\|")
ENV_ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
SHELL_KEYWORDS = ("do", "then", "else", "elif", "if", "while", "until", "!", "{", "(", "time")
# A lane target is any gisik: window except the literal controller 0 — `gisik:$w`, `gisik:"$w"` and `gisik:${w}` included.
LANE_TARGET = re.compile(r"-t\s+[\"']?gisik:(?!0(?![0-9$]))")


def strip_heredoc_bodies(command):
    kept, pending = [], None
    for line in command.splitlines():
        if pending is not None:
            if line.strip() == pending:
                pending = None
            continue
        kept.append(line)
        found = HEREDOC_START.findall(line)
        if found:
            pending = found[-1]
    return kept


def words_of(segment):
    # Env assignments and wrapper words (incl. an interpreter: `bash /tmp/gate/gate.sh`) precede the real command.
    # Shell keywords too: `for w in 2 3; do tmux kill-window -t gisik:$w; done` splits on `;` into a segment that starts
    # with `do`, which read as prose and let the kill through (planner, 2026-09-28).
    words = segment.split()
    while words and (ENV_ASSIGNMENT.match(words[0]) or words[0] in ("env", "time", "exec", "command", "sudo", "bash", "sh", "zsh")
                     or words[0] in SHELL_KEYWORDS):
        words.pop(0)
    return words


def is_prose(words):
    if not words:
        return True
    first = words[0].rsplit("/", 1)[-1]
    if first in TEXT_EMITTERS:
        return True
    return first == "git" and len(words) > 1 and words[1] == "commit"


def is_ctl(words):
    return bool(words) and (words[0].endswith("scripts/ctl/ctl") or words[0] == "ctl" and False)


def decide(segment, cwd):
    """Return None to allow, or the verb to use instead (a refusal)."""
    w = words_of(segment)
    if is_prose(w) or is_ctl(w):
        return None
    first = w[0].rsplit("/", 1)[-1]
    rest = " ".join(w[1:])
    if first == "gh":
        if re.match(r"pr\s+merge\b", rest):
            return "ctl land <pr>"
        if re.match(r"pr\s+create\b", rest):
            return "ctl pr open <branch> --title T --body FILE"
        if re.match(r"pr\s+comment\b", rest) and "Forced gate" in segment:
            return "ctl land <pr> (it comments the gate)"
        return None
    if first == "tmux":
        if re.match(r"kill-window\b", rest) and LANE_TARGET.search(rest):
            return "ctl close <window> (idle lane) or ctl restart <window> <worktree> <brief>"
        if re.match(r"new-window\b", rest) and LANE_TARGET.search(rest):
            return "ctl restart <window> <worktree> <brief>"
        if re.match(r"send-keys\b", rest) and "gisik" in rest:
            return "ctl dispatch <window> <file>"
        return None
    if first == "docker" and re.match(r"compose\b", rest) and re.search(r"\b(up|down|restart)\b", rest):
        return "ctl rebuild (up/down/restart are the owner's)"
    if first == "pnpm":
        if re.match(r"(dev:stack:rebuild)\b", rest):
            return "ctl rebuild"
        if re.match(r"(test|turbo\s+run\s+test)\b", rest) and not re.search(r"--filter", rest):
            return "ctl gate <sha> (a lane runs ONE package's suite: cd <pkg> && pnpm exec vitest run --no-file-parallelism)"
        return None
    if first in ("gate.sh", "locked-test.sh") or re.search(r"/(gate|locked-test)\.sh\b", w[0]):
        return "ctl gate <sha>"
    if first == "git":
        target = cwd
        m = re.match(r"-C\s+(\S+)", rest)
        if m:
            target = m.group(1)
            rest = rest[m.end():].strip()
        if os.path.realpath(target) == os.path.realpath(PRIMARY) and re.match(r"(pull|merge|reset\s+--hard|checkout\s+-B)\b", rest):
            return "ctl land <pr> (it fast-forwards the primary checkout); anything else there is the owner's"
        return None
    return None


def offending(command, cwd):
    for line in strip_heredoc_bodies(command):
        for seg in SEGMENT_SEP.split(line):
            verb = decide(seg.strip(), cwd)
            if verb:
                return seg.strip(), verb
    return None


TABLE = [  # (command, cwd, refused?)
    ("gh pr merge 634 --merge", "/tmp", True),
    ("gh pr create --base main --title x --body-file b", "/tmp", True),
    ("gh pr view 634 --json state", "/tmp", False),
    ("gh pr comment 634 --body 'Forced gate at abc: EXIT=0'", "/tmp", True),
    ("gh pr comment 634 --body 'thanks'", "/tmp", False),
    ("scripts/ctl/ctl land 634", "/tmp", False),
    ("/Users/kiro/my_projects/gisik-nokma-ctl/scripts/ctl/ctl pr open b --title t --body f", "/tmp", False),
    ("cd /x && bash scripts/ctl/ctl gate abc", "/tmp", False),
    ("tmux kill-window -t gisik:1", "/tmp", True),
    ("tmux new-window -t gisik:3 -n exec3 -c /x", "/tmp", True),
    ("tmux kill-window -t gisik:0", "/tmp", False),
    ("for w in 2 3 4; do tmux kill-window -t gisik:$w; done", "/tmp", True),
    ("tmux kill-window -t gisik:$w", "/tmp", True),
    ("tmux kill-window -t \"gisik:${w}\"", "/tmp", True),
    ("tmux kill-window -t gisik:12", "/tmp", True),
    ("tmux kill-window -t gisik:07", "/tmp", True),
    ("if true; then tmux new-window -t gisik:5 -n x; fi", "/tmp", True),
    ("while read w; do tmux send-keys -t gisik:$w Enter; done < f", "/tmp", True),
    ("scripts/ctl/ctl close 3", "/tmp", False),
    ("tmux send-keys -t gisik:2 Enter", "/tmp", True),
    ("tmux capture-pane -p -t gisik:2", "/tmp", False),
    ("tmux load-buffer -b x f && tmux paste-buffer -b x -d -t gisik:2", "/tmp", False),
    ("docker compose -f docker-compose.dev.yml up -d --build server web", "/tmp", True),
    ("docker compose down", "/tmp", True),
    ("docker compose build server", "/tmp", False),
    ("docker ps", "/tmp", False),
    ("pnpm dev:stack:rebuild", "/tmp", True),
    ("pnpm test", "/x", True),
    ("pnpm turbo run test", "/x", True),
    ("pnpm exec vitest run --no-file-parallelism", "/x/apps/web", False),
    ("pnpm turbo run test --filter=@gisik-nokma/ui", "/x", False),
    ("bash /tmp/gate/gate.sh /tmp/g.log", "/tmp", True),
    ("git pull --ff-only origin main", PRIMARY, True),
    ("git -C " + PRIMARY + " pull --ff-only", "/tmp", True),
    ("git pull --ff-only origin main", "/Users/kiro/my_projects/gisik-nokma-ctl", False),
    ("git -C " + PRIMARY + " status --porcelain", "/tmp", False),
    ("git commit -m 'gh pr merge is refused now'", "/tmp", False),
    ("echo gh pr merge 1", "/tmp", False),
    ("cat <<'EOF' > f\ngh pr merge 1\nEOF", "/tmp", False),
    ("GISIK_CTL_UNLOCK=1 gh pr merge 1", "/tmp", True),
]


def self_test():
    bad = 0
    for cmd, cwd, refused in TABLE:
        got = offending(cmd, cwd) is not None
        mark = "ok  " if got == refused else "FAIL"
        if got != refused:
            bad += 1
        print(f"{mark} refused={got!s:5} expected={refused!s:5}  {cmd!r}")
    print(f"ctl-scripts-only self-test: {len(TABLE)} cases, {bad} wrong")
    return 1 if bad else 0


def main():
    if "--self-test" in sys.argv:
        return self_test()
    if os.environ.get("GISIK_CTL_UNLOCK"):
        return 0
    try:
        payload = json.load(sys.stdin)
        command = (payload.get("tool_input") or {}).get("command") or ""
        cwd = payload.get("cwd") or os.getcwd()
    except Exception:
        return 0
    hit = offending(command, cwd)
    if not hit:
        return 0
    seg, verb = hit
    json.dump({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
               "permissionDecisionReason": (
                   "Blocked: this operation runs through scripts/ctl/ctl, never by hand (owner, 2026-09-21).\n\n"
                   f"    {seg}\n\nUse instead:\n    {verb}\n\n"
                   "scripts/ctl/README.md explains the verbs and the marker chain. The owner's escape hatch is "
                   "GISIK_CTL_UNLOCK in the session's launch environment — not something a session can set for itself.")}},
              sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
