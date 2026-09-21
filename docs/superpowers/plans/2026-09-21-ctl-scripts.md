# `scripts/ctl` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every mechanical controller/driver operation becomes a verb of `scripts/ctl/ctl`, and a PreToolUse hook makes the verbs the only way a Claude Code session on this machine can perform them.

**Architecture:** One bash dispatcher (`ctl`) sources `lib.sh` and execs `verbs/<verb>.sh`; text-heavy verbs (`anchor`, `check-pr`, `reconcile`) are Python 3 called from their bash wrapper. Verdicts are written as marker files under `<worktree>/.git/ctl/` and the acting verbs (`pr open --require-checked`, `land`) refuse without them. The hook is a Python script with the same stdin/stdout contract as the existing `no-piped-test-runs.py`, installed by `install-hooks.sh`.

**Tech Stack:** bash 3.2+ (macOS default; no associative arrays in bash 3 — use plain arrays or Python), Python 3 (stdlib only), `git`, `gh`, `tmux`, `docker`, `pnpm`, Node 22 from nvm.

**Spec:** `docs/superpowers/specs/2026-09-21-ctl-scripts-design.md`

## Global Constraints

- Node 22 only: `$HOME/.nvm/versions/node/v22.22.2/bin` prepended to `PATH` (override with `GISIK_NODE22_BIN`).
- Primary checkout: `/Users/kiro/my_projects/gisik-nokma` (override with `GISIK_PRIMARY`). Never commit or push to `main`; every verb refuses to act on a branch named `main` except `land`'s fast-forward of the primary checkout.
- Every verb: full output to `${CTL_LOG_DIR:-$HOME/.cache/gisik-ctl}/<verb>-<stamp>.log`, **one summary line last** (`OK <verb> …` / `FAIL <verb> <condition>`), exit 0 only when every named condition held, `--dry-run` runs nothing that mutates.
- Marker files: `<worktree>/.git/ctl/gate-<sha>` and `checked-<sha>`; content `<ISO time> <log path>`.
- The hook's escape hatch is the environment variable `GISIK_CTL_UNLOCK` present in the hook's own environment.
- Never pipe a test run into `head` or `grep -m`; never `pkill -f vitest`; reap orphans at ppid 1 only.
- Commit after every task; subject as given; body ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (or the model that did the work).
- Work on branch `ctl/ctl-scripts` in `/Users/kiro/my_projects/gisik-nokma-ctl` (already cut from `origin/main` `21d734f0`, spec committed at `e60072a9`).

## File structure

```
scripts/ctl/ctl                      dispatcher (Task 2)
scripts/ctl/lib.sh                   shared functions (Task 1)
scripts/ctl/test/lib.test.sh         lib assertions, run by selftest (Task 1)
scripts/ctl/hooks/ctl-scripts-only.py   the hook + --self-test table (Task 3)
scripts/ctl/hooks/install-hooks.sh   register in ~/.claude/settings.json (Task 3)
scripts/ctl/verbs/checks.sh          (Task 4)
scripts/ctl/verbs/gate.sh            (Task 5)
scripts/ctl/verbs/pr-open.sh         (Task 6)
scripts/ctl/verbs/land.sh            (Task 7)
scripts/ctl/verbs/anchor.sh + anchor.py   (Task 8)
scripts/ctl/verbs/check-pr.sh + check-pr.py   (Task 9)
scripts/ctl/verbs/reconcile.py       (Task 10)
scripts/ctl/verbs/lanes.sh           (Task 11)
scripts/ctl/verbs/restart.sh, dispatch.sh   (Task 12)
scripts/ctl/verbs/rebuild.sh         (Task 13)
scripts/ctl/verbs/selftest.sh + package.json check:ctl   (Task 14)
scripts/ctl/README.md + wiring edits (card, plan, briefs)   (Task 15)
first live use: checks → pr open → gate → land, hook installed, refusal demonstrated, anchor 45   (Task 16)
```

---

### Task 1: `lib.sh` — the shared contract

**Files:**
- Create: `scripts/ctl/lib.sh`
- Test: `scripts/ctl/test/lib.test.sh`

**Interfaces (produces):** `ctl_node22`, `ctl_repo [path]` (prints the worktree root; exit 1 if not a git worktree), `ctl_primary`, `ctl_log <verb>` (prints a fresh log path), `ctl_ok <verb> <text>` / `ctl_fail <verb> <text>` (print summary, exit 0 / 1), `ctl_run …` (echo-only under `CTL_DRY_RUN=1`), `ctl_marker_write <root> <kind> <sha> <log>`, `ctl_marker_has <root> <kind> <sha>`, `ctl_parse_common "$@"` (consumes `--repo X` and `--dry-run`, sets `CTL_REPO`, `CTL_DRY_RUN`, leaves the rest in `CTL_ARGS`).

- [ ] **Step 1: Write the failing test**

```bash
#!/usr/bin/env bash
# scripts/ctl/test/lib.test.sh — assertions for lib.sh; run by `ctl selftest`.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/lib.sh"
fails=0
check() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails+1)); fi; }
# node 22
check "node22 on PATH" '[ "$(ctl_node22 >/dev/null; node --version | cut -c1-4)" = "v22." ]'
# repo resolution: a .git DIRECTORY and a .git FILE (worktree)
tmp=$(mktemp -d); ( cd "$tmp" && git init -q . ) ; check "repo: .git dir" '[ "$(ctl_repo "$tmp")" = "$tmp" ]'
wt=$(mktemp -d); rm -rf "$wt"; ( cd "$tmp" && git commit -q --allow-empty -m x && git worktree add -q "$wt" -b t1 ) ; check "repo: .git file (worktree)" '[ "$(ctl_repo "$wt")" = "$wt" ]'
check "repo: not a repo fails" '! ctl_repo /tmp >/dev/null 2>&1'
# markers
check "marker absent" '! ctl_marker_has "$tmp" gate deadbeef'
ctl_marker_write "$tmp" gate deadbeef /tmp/x.log
check "marker present" 'ctl_marker_has "$tmp" gate deadbeef'
check "marker content has time and log" 'grep -q "/tmp/x.log" "$tmp/.git/ctl/gate-deadbeef"'
# dry-run
check "ctl_run echoes under dry-run" '[ "$(CTL_DRY_RUN=1 ctl_run echo hi)" = "DRY: echo hi" ]'
check "ctl_run runs otherwise" '[ "$(CTL_DRY_RUN=0 ctl_run echo hi)" = "hi" ]'
# arg parsing
ctl_parse_common --repo "$tmp" --dry-run a b; check "parse: repo" '[ "$CTL_REPO" = "$tmp" ]'; check "parse: dry" '[ "$CTL_DRY_RUN" = 1 ]'; check "parse: rest" '[ "${CTL_ARGS[*]}" = "a b" ]'
rm -rf "$tmp" "$wt"
[ "$fails" -eq 0 ] && echo "lib.test.sh: ok" || { echo "lib.test.sh: $fails FAILED"; exit 1; }
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash scripts/ctl/test/lib.test.sh`
Expected: `No such file or directory` for `lib.sh` (exit non-zero).

- [ ] **Step 3: Write `lib.sh`**

```bash
#!/usr/bin/env bash
# scripts/ctl/lib.sh — shared contract for every ctl verb. Sourced, never executed.
# Contract: one summary line last; exit 0 only when every named condition held; --dry-run mutates nothing.

ctl_node22() {
  local bin="${GISIK_NODE22_BIN:-$HOME/.nvm/versions/node/v22.22.2/bin}"
  [ -x "$bin/node" ] || { echo "FAIL lib node 22 not found at $bin" >&2; return 1; }
  case ":$PATH:" in *":$bin:"*) ;; *) export PATH="$bin:$PATH";; esac
}

ctl_primary() { echo "${GISIK_PRIMARY:-/Users/kiro/my_projects/gisik-nokma}"; }

# Print the worktree root of PATH (default $PWD). A worktree has `.git` as a FILE; a main checkout as a DIRECTORY.
ctl_repo() {
  local p="${1:-$PWD}" top
  top="$(cd "$p" 2>/dev/null && /usr/bin/git rev-parse --show-toplevel 2>/dev/null)" || { echo "not a git worktree: $p" >&2; return 1; }
  echo "$top"
}

ctl_log_dir() { local d="${CTL_LOG_DIR:-$HOME/.cache/gisik-ctl}"; mkdir -p "$d"; echo "$d"; }
ctl_log() { echo "$(ctl_log_dir)/$1-$(date '+%Y%m%dT%H%M%S')-$$.log"; }

ctl_ok()   { echo "OK $1 $2"; exit 0; }
ctl_fail() { echo "FAIL $1 $2"; exit 1; }

# Run a command, or only print it under CTL_DRY_RUN=1.
ctl_run() { if [ "${CTL_DRY_RUN:-0}" = 1 ]; then echo "DRY: $*"; else "$@"; fi; }

ctl_marker_dir() { local root="$1" gitdir; gitdir="$(cd "$root" && /usr/bin/git rev-parse --git-dir)"; case "$gitdir" in /*) ;; *) gitdir="$root/$gitdir";; esac; mkdir -p "$gitdir/ctl"; echo "$gitdir/ctl"; }
ctl_marker_write() { local root="$1" kind="$2" sha="$3" log="$4"; echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $log" > "$(ctl_marker_dir "$root")/$kind-$sha"; }
ctl_marker_has()   { [ -f "$(ctl_marker_dir "$1")/$2-$3" ]; }

# Consume --repo X and --dry-run from "$@"; the rest lands in CTL_ARGS.
ctl_parse_common() {
  CTL_REPO=""; CTL_DRY_RUN="${CTL_DRY_RUN:-0}"; CTL_ARGS=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --repo) CTL_REPO="$2"; shift 2;;
      --dry-run) CTL_DRY_RUN=1; shift;;
      *) CTL_ARGS+=("$1"); shift;;
    esac
  done
  [ -n "$CTL_REPO" ] || CTL_REPO="$(ctl_repo "$PWD")" || return 1
  export CTL_REPO CTL_DRY_RUN
}
```

Note for the implementer: `ctl_marker_dir` resolves the real git dir, so in a worktree (`.git` file) the marker lands under the main repo's `.git/worktrees/<name>/ctl/`, which is what `ctl_marker_has` reads back — the test asserts round-trip, not the path.

- [ ] **Step 4: Run the test**

Run: `bash scripts/ctl/test/lib.test.sh`
Expected: every line `ok`, last line `lib.test.sh: ok`.

- [ ] **Step 5: Commit**

```bash
git add scripts/ctl/lib.sh scripts/ctl/test/lib.test.sh
git commit -m "ctl: lib.sh — node 22, worktree resolution, log paths, summary lines, marker files, common args (with test)"
```

---

### Task 2: `ctl` — the dispatcher

**Files:**
- Create: `scripts/ctl/ctl`
- Modify: `scripts/ctl/test/lib.test.sh` (add a dispatcher assertion)

**Interfaces (produces):** `scripts/ctl/ctl <verb> [args…]`; `pr open …` maps to `verbs/pr-open.sh`; `help` lists verbs; unknown verb → `FAIL ctl unknown verb <x>` exit 64.

- [ ] **Step 1: Append the failing test to `lib.test.sh`** (before the final summary line)

```bash
check "dispatcher: unknown verb exits 64" '"$HERE/ctl" nosuchverb >/dev/null 2>&1; [ $? -eq 64 ]'
check "dispatcher: help lists land" '"$HERE/ctl" help | grep -q "^  land"'
```

- [ ] **Step 2: Run it to see it fail** — `bash scripts/ctl/test/lib.test.sh` → the two new lines `FAIL`.

- [ ] **Step 3: Write the dispatcher**

```bash
#!/usr/bin/env bash
# scripts/ctl/ctl — the one door for the controller's mechanical work. `ctl help` lists the verbs.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
verb="${1:-help}"; shift || true
case "$verb" in
  pr) sub="${1:-}"; shift || true; verb="pr-$sub";;
esac
case "$verb" in
  help|-h|--help)
    cat <<'EOF'
usage: scripts/ctl/ctl <verb> [--repo <worktree>] [--dry-run] [args]
  checks                          the eight checks + two non-zero controls
  gate <sha>                      forced gate at HEAD=<sha>; writes the gate marker
  pr open <branch> --title T --body FILE [--require-checked]
  land <pr>                       comment gate, merge head-gated, verify, ff primary
  anchor <N> --title T --body FILE
  check-pr <branch> [--plan FILE] mechanical batch-PR verification; writes the checked marker
  reconcile                       ledger vs report headings by membership + plan coverage
  lanes [--watch]                 one line per gisik: window
  restart <window> <worktree> <brief> [--override FILE]
  dispatch <window> <file>        two pastes + proof of delivery
  rebuild                         pull --ff-only in the primary checkout, rebuild the stack, verify
  selftest                        hook table, lib tests, every verb --dry-run
EOF
    exit 0;;
esac
script="$HERE/verbs/$verb.sh"
[ -f "$script" ] || { echo "FAIL ctl unknown verb $verb (see: scripts/ctl/ctl help)"; exit 64; }
exec bash "$script" "$@"
```

- [ ] **Step 4: Make it executable and run the test** — `chmod +x scripts/ctl/ctl; bash scripts/ctl/test/lib.test.sh` → all `ok`.

- [ ] **Step 5: Commit** — `git add scripts/ctl/ctl scripts/ctl/test/lib.test.sh && git commit -m "ctl: the dispatcher"`

---

### Task 3: the hook and its installer

**Files:**
- Create: `scripts/ctl/hooks/ctl-scripts-only.py`
- Create: `scripts/ctl/hooks/install-hooks.sh`

**Interfaces (produces):** `ctl-scripts-only.py` reads PreToolUse JSON on stdin; `--self-test` runs the table and exits non-zero on any mismatch. `install-hooks.sh` copies the hook to `~/.claude/scripts/ctl-scripts-only.py` and registers `{"matcher":"Bash","hooks":[{"type":"command","command":"<abs path>","statusMessage":"ctl: raw forms refused"}]}` in `~/.claude/settings.json` if absent. **Do not run the installer until Task 16.**

- [ ] **Step 1: Write the hook with its self-test table** (the table is the failing test: run `--self-test` first and watch it fail on the empty `decide`)

```python
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
    words = segment.split()
    while words and (ENV_ASSIGNMENT.match(words[0]) or words[0] in ("env", "time", "exec", "command", "sudo")):
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
        if re.match(r"(kill-window|new-window)\b", rest) and re.search(r"-t\s+gisik:[1-9]", rest):
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
```

Implementer notes: (a) the `cwd` key is present in Claude Code's PreToolUse payload; fall back to the process cwd. (b) `is_ctl` accepts any first word ending in `scripts/ctl/ctl` (relative or absolute) — a bare `ctl` on PATH is deliberately NOT accepted, so the allowlist cannot be satisfied by an alias. (c) The table's last case proves the in-command `GISIK_CTL_UNLOCK=1` prefix does not unlock.

- [ ] **Step 2: Run the self-test** — `python3 scripts/ctl/hooks/ctl-scripts-only.py --self-test` → `32 cases, 0 wrong`, exit 0. If any case is wrong, fix `decide`, not the table.

- [ ] **Step 3: Write the installer**

```bash
#!/usr/bin/env bash
# scripts/ctl/hooks/install-hooks.sh — copy the hook to ~/.claude/scripts and register it (idempotent).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
dst="$HOME/.claude/scripts/ctl-scripts-only.py"
python3 "$HERE/ctl-scripts-only.py" --self-test >/dev/null || { echo "FAIL install-hooks self-test red — not installing"; exit 1; }
mkdir -p "$HOME/.claude/scripts"; cp "$HERE/ctl-scripts-only.py" "$dst"; chmod +x "$dst"
python3 - "$dst" <<'PY'
import json, sys, os
dst = sys.argv[1]; p = os.path.expanduser('~/.claude/settings.json')
s = json.load(open(p))
pre = s.setdefault('hooks', {}).setdefault('PreToolUse', [])
if not any(h.get('command') == dst for m in pre for h in m.get('hooks', [])):
    pre.append({"matcher": "Bash", "hooks": [{"type": "command", "command": dst, "statusMessage": "ctl: raw forms refused"}]})
    json.dump(s, open(p, 'w'), indent=2); print("registered", dst)
else:
    print("already registered", dst)
PY
echo "OK install-hooks $dst"
```

- [ ] **Step 4: Verify the installer's dry logic without installing** — `bash -n scripts/ctl/hooks/install-hooks.sh` (syntax only). Do NOT run it yet.

- [ ] **Step 5: Commit** — `git add scripts/ctl/hooks && git commit -m "ctl: the PreToolUse hook (32-case self-test) and its idempotent installer"`

---

### Task 4: `checks`

**Files:** Create `scripts/ctl/verbs/checks.sh`

**Interfaces (produces):** `ctl checks [--repo R] [--dry-run]` → `OK checks 8 checks rc=0, 2 controls non-zero, tree clean` or `FAIL checks <name> rc=<n>`.

- [ ] **Step 1: Write the verb**

```bash
#!/usr/bin/env bash
# ctl checks — the eight repo checks under Node 22, then two controls that MUST fail, each restored and verified clean.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
ctl_node22 || exit 1
cd "$CTL_REPO" || exit 1
log="$(ctl_log checks)"
CHECKS="check:env check:tasks check:runbook check:citations check:help check:migrations"
[ "${CTL_IN_SELFTEST:-0}" = 1 ] || CHECKS="$CHECKS check:ctl"
for c in $CHECKS; do
  if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: pnpm -s $c"; continue; fi
  pnpm -s "$c" >> "$log" 2>&1 || ctl_fail checks "$c rc=$? (log $log)"
done
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: node scripts/check-case-ids.mjs"; else
  node scripts/check-case-ids.mjs >> "$log" 2>&1 || ctl_fail checks "check-case-ids rc=$? (log $log)"; fi
# control 1: a duplicated case id must redden check-case-ids
f=test-cases/06-auth-visibility.md
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: control duplicate-id on $f"; else
  cp "$f" "$log.c1.bak"; printf '\n- **6.83** ❌ CONTROL duplicate id\n' >> "$f"
  node scripts/check-case-ids.mjs >> "$log" 2>&1; rc=$?; cp "$log.c1.bak" "$f"
  [ "$rc" -ne 0 ] || ctl_fail checks "control 1 (duplicate id) returned 0 — the check cannot fail"
  [ -z "$(/usr/bin/git status --porcelain -- "$f")" ] || ctl_fail checks "control 1 left $f dirty"
fi
# control 2: a malformed ledger row must redden check:tasks
g=docs/lanes/task-ledger.tsv
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: control malformed-row on $g"; else
  cp "$g" "$log.c2.bak"; printf 'CONTROL\tmalformed\n' >> "$g"
  pnpm -s check:tasks >> "$log" 2>&1; rc=$?; cp "$log.c2.bak" "$g"
  [ "$rc" -ne 0 ] || ctl_fail checks "control 2 (malformed row) returned 0 — the check cannot fail"
  [ -z "$(/usr/bin/git status --porcelain -- "$g")" ] || ctl_fail checks "control 2 left $g dirty"
fi
[ "$CTL_DRY_RUN" = 1 ] && ctl_ok checks "dry-run"
ctl_ok checks "8 checks rc=0, 2 controls non-zero, tree clean (log $log)"
```

- [ ] **Step 2: Run it for real** — `scripts/ctl/ctl checks --repo /Users/kiro/my_projects/gisik-nokma-ctl` → the `check:ctl` script does not exist yet, so expected: `FAIL checks check:ctl rc=1`. Run with `CTL_IN_SELFTEST=1` → `OK checks …`. (Task 14 adds `check:ctl`.)

- [ ] **Step 3: Commit** — `git add scripts/ctl/verbs/checks.sh && git commit -m "ctl checks: eight checks and two controls that must fail"`

---

### Task 5: `gate`

**Files:** Create `scripts/ctl/verbs/gate.sh`

**Interfaces (produces):** `ctl gate <sha> [--repo R]` → writes marker `gate-<sha>`; `OK gate <sha> Tasks 33/33 …`.

- [ ] **Step 1: Write the verb**

```bash
#!/usr/bin/env bash
# ctl gate <sha> — the forced gate at HEAD=<sha> through the gate-lock reference scripts; writes .git/ctl/gate-<sha> only when green.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
sha="${CTL_ARGS[0]:-}"; [ -n "$sha" ] || ctl_fail gate "usage: ctl gate <sha>"
ctl_node22 || exit 1
cd "$CTL_REPO" || exit 1
head="$(/usr/bin/git rev-parse HEAD)"
case "$head" in "$sha"*) ;; *) ctl_fail gate "HEAD $head is not $sha";; esac
[ -z "$(/usr/bin/git status --porcelain)" ] || ctl_fail gate "tree is dirty"
sha="$head"
work="$(ctl_log_dir)/gate-lock"; mkdir -p "$work"; cp docs/lanes/gate-lock/*.sh "$work/"; chmod +x "$work"/*.sh
log="$(ctl_log gate)"; console="$log.console"
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: GATE_REPO=$CTL_REPO bash $work/gate.sh $log > $console"; ctl_ok gate "dry-run"; fi
GATE_REPO="$CTL_REPO" bash "$work/gate.sh" "$log" > "$console" 2>&1; echo "GATE_WRAPPER_EXIT=$?" >> "$console"
E=$(grep -m1 '^EXIT=' "$console"); T=$(grep -m1 'Tasks:' "$log" | sed 's/^.*Tasks:/Tasks:/'); C=$(grep -m1 'Cached:' "$log" | sed 's/^.*Cached:/Cached:/')
N=$(grep -m1 'NODE=' "$console"); eng=$(grep -c 'Unsupported engine' "$log"); to=$(grep -c 'Hook timed out' "$log")
orph=$(ps -eo pid=,ppid=,comm=,args= | awk '$3 ~ /node$/ && $2 == 1 && index($0, "vitest") > 0 {print $1}' | wc -l | tr -d ' ')
summary="$E · $T · $C · $N · engine=$eng timeouts=$to orphans=$orph"
[ "$E" = "EXIT=0" ] || ctl_fail gate "$summary (log $log)"
echo "$T" | grep -q '33 successful, 33 total' || ctl_fail gate "$summary (log $log)"
echo "$N" | grep -q 'NODE=v22\.' || ctl_fail gate "$summary (log $log)"
[ "$eng" -eq 0 ] || ctl_fail gate "Unsupported engine ×$eng (log $log)"
[ "$to" -eq 0 ] || ctl_fail gate "Hook timed out ×$to — re-gate on a quiet box (log $log)"
[ "$orph" -eq 0 ] || ctl_fail gate "$orph orphaned vitest workers at ppid 1 — reap them, then re-gate"
ctl_marker_write "$CTL_REPO" gate "$sha" "$log"
ctl_ok gate "$sha $summary (log $log)"
```

- [ ] **Step 2: Dry-run** — `scripts/ctl/ctl gate $(git rev-parse HEAD) --dry-run` → `DRY: …` then `OK gate dry-run`. (The live run is Task 16.)

- [ ] **Step 3: Commit** — `git commit -am "ctl gate: forced gate with the six readings and the marker"` (after `git add scripts/ctl/verbs/gate.sh`).

---

### Task 6: `pr open`

**Files:** Create `scripts/ctl/verbs/pr-open.sh`

**Interfaces (produces):** `ctl pr open <branch> --title T --body FILE [--base main] [--require-checked]` → `OK pr-open #<n> head <sha>`.

- [ ] **Step 1: Write the verb**

```bash
#!/usr/bin/env bash
# ctl pr open <branch> --title T --body FILE [--base main] [--require-checked] — push as its own step, verify, open, verify head and body.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
branch="${CTL_ARGS[0]:-}"; title=""; body=""; base="main"; require=0
set -- "${CTL_ARGS[@]:1}"
while [ $# -gt 0 ]; do case "$1" in --title) title="$2"; shift 2;; --body) body="$2"; shift 2;; --base) base="$2"; shift 2;; --require-checked) require=1; shift;; *) ctl_fail pr-open "unknown arg $1";; esac; done
[ -n "$branch" ] && [ -n "$title" ] && [ -f "$body" ] || ctl_fail pr-open "usage: ctl pr open <branch> --title T --body FILE"
[ "$branch" != "main" ] || ctl_fail pr-open "refusing to open a PR from main"
cd "$CTL_REPO" || exit 1
[ "$(/usr/bin/git branch --show-current)" = "$branch" ] || ctl_fail pr-open "checked-out branch is not $branch"
[ -z "$(/usr/bin/git status --porcelain)" ] || ctl_fail pr-open "tree is dirty"
head="$(/usr/bin/git rev-parse HEAD)"
if [ "$require" = 1 ]; then ctl_marker_has "$CTL_REPO" checked "$head" || ctl_fail pr-open "no checked marker for $head — run: ctl check-pr $branch"; fi
ctl_run /usr/bin/git push -u origin "$branch" || ctl_fail pr-open "push rejected"
if [ "$CTL_DRY_RUN" = 1 ]; then ctl_ok pr-open "dry-run"; fi
remote="$(/usr/bin/git ls-remote origin "refs/heads/$branch" | cut -f1)"
[ "$remote" = "$head" ] || ctl_fail pr-open "remote $remote != local $head after push"
gh pr create --base "$base" --head "$branch" --title "$title" --body-file "$body" > "$(ctl_log pr-open)" 2>&1 || ctl_fail pr-open "gh pr create failed"
n="$(gh pr view "$branch" --json number --jq .number)"; h="$(gh pr view "$branch" --json headRefOid --jq .headRefOid)"
[ "$h" = "$head" ] || ctl_fail pr-open "PR #$n head $h != local $head"
first="$(head -1 "$body")"; got="$(gh pr view "$n" --json body --jq .body | head -1)"
[ "$got" = "$first" ] || ctl_fail pr-open "PR #$n body first line differs from $body"
ctl_ok pr-open "#$n head ${head:0:12} base $base"
```

- [ ] **Step 2: Dry-run on this branch** — `scripts/ctl/ctl pr open ctl/ctl-scripts --title t --body docs/superpowers/specs/2026-09-21-ctl-scripts-design.md --dry-run` → `DRY: /usr/bin/git push …`, `OK pr-open dry-run`.

- [ ] **Step 3: Commit** — `git add scripts/ctl/verbs/pr-open.sh && git commit -m "ctl pr open: push as its own step, verify remote, open, verify head and body"`

---

### Task 7: `land`

**Files:** Create `scripts/ctl/verbs/land.sh`

**Interfaces (produces):** `ctl land <pr> [--repo R]` → `OK land #<pr> merge <sha> main <sha> primary ff`.

- [ ] **Step 1: Write the verb**

```bash
#!/usr/bin/env bash
# ctl land <pr> — refuse without the gate marker; comment the gate summary; merge only if the head still equals the gated sha;
# verify by API, reachability, tree identity and a drop check with a control; fast-forward the primary checkout if safe.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
pr="${CTL_ARGS[0]:-}"; [ -n "$pr" ] || ctl_fail land "usage: ctl land <pr>"
cd "$CTL_REPO" || exit 1
read -r head state base < <(gh pr view "$pr" --json headRefOid,state,baseRefName --jq '"\(.headRefOid) \(.state) \(.baseRefName)"') || ctl_fail land "cannot read PR #$pr"
[ "$state" = "OPEN" ] || ctl_fail land "PR #$pr is $state"
[ "$base" = "main" ] || ctl_fail land "PR #$pr base is $base"
ctl_marker_has "$CTL_REPO" gate "$head" || ctl_fail land "no gate marker for $head — run: ctl gate $head"
marker="$(cat "$(ctl_marker_dir "$CTL_REPO")/gate-$head")"; glog="${marker#* }"
E=$(grep -m1 '^EXIT=' "$glog.console"); T=$(grep -m1 'Tasks:' "$glog" | sed 's/^.*Tasks:/Tasks:/'); N=$(grep -m1 'NODE=' "$glog.console")
/usr/bin/git fetch -q origin; old_main="$(/usr/bin/git rev-parse origin/main)"
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: gh pr comment $pr (gate $E $T $N); gh pr merge $pr --merge if head still $head"; ctl_ok land "dry-run"; fi
gh pr comment "$pr" --body "**Forced gate at \`${head:0:12}\`** (\`ctl gate\`): \`$E\` · \`$T\` · \`$N\` — log \`$glog\`. Merging by \`ctl land\` on the checks + this gate." >/dev/null || ctl_fail land "comment failed"
now="$(gh pr view "$pr" --json headRefOid --jq .headRefOid)"
[ "$now" = "$head" ] || ctl_fail land "head moved to $now after the gate at $head — re-gate"
gh pr merge "$pr" --merge > "$(ctl_log land)" 2>&1 || ctl_fail land "gh pr merge failed"
read -r st mc < <(gh pr view "$pr" --json state,mergeCommit --jq '"\(.state) \(.mergeCommit.oid)"')
[ "$st" = "MERGED" ] || ctl_fail land "state after merge is $st"
/usr/bin/git fetch -q origin; new_main="$(/usr/bin/git rev-parse origin/main)"
/usr/bin/git merge-base --is-ancestor "$mc" origin/main || ctl_fail land "merge commit $mc not reachable from origin/main"
[ -z "$(/usr/bin/git diff --stat "$head" origin/main)" ] || ctl_fail land "tree of origin/main differs from the gated head (partition?)"
[ -n "$(/usr/bin/git diff --stat "$old_main" origin/main)" ] || ctl_fail land "drop check control: origin/main did not change"
ff="primary untouched"
P="$(ctl_primary)"
if [ "$(/usr/bin/git -C "$P" branch --show-current)" = "main" ] && [ -z "$(/usr/bin/git -C "$P" status --porcelain)" ] && [ "$(/usr/bin/git -C "$P" rev-list --count origin/main..HEAD)" = 0 ]; then
  /usr/bin/git -C "$P" pull -q --ff-only origin main && ff="primary ff $(/usr/bin/git -C "$P" rev-parse --short=12 HEAD)" || ff="primary ff FAILED"
fi
ctl_ok land "#$pr merge ${mc:0:12} main ${new_main:0:12} $ff"
```

- [ ] **Step 2: Dry-run against a closed PR to see the refusal path** — `scripts/ctl/ctl land 638 --dry-run` → `FAIL land PR #638 is MERGED` (exit 1). That is the expected result: the verb refuses before doing anything.

- [ ] **Step 3: Commit** — `git add scripts/ctl/verbs/land.sh && git commit -m "ctl land: gate marker, head-gated merge, four verifications, primary fast-forward"`

---

### Task 8: `anchor`

**Files:** Create `scripts/ctl/verbs/anchor.sh`, `scripts/ctl/verbs/anchor.py`

**Interfaces (produces):** `ctl anchor <N> --title T --body FILE [--repo R]` → rewrites the card's mechanical rows, rotates cycle N−1, appends cycle N, runs `ctl checks`; `OK anchor cycle N …`.

- [ ] **Step 1: Write `anchor.py`** (all text surgery; takes measurements as arguments so it is testable without git)

```python
#!/usr/bin/env python3
"""anchor.py <state.md> <history.md> <N> <title> <body-file> <main-sha> <last-pr> <open-prs> <ctl-branch> <stack-line> <windows> <stamp>
Rotates the newest cycle to the history file, rewrites the card's mechanical rows, appends cycle N. Pure text; no git."""
import re, sys
state, hist, n, title, bodyf, main_sha, last_pr, open_prs, ctl_branch, stack, windows, stamp = sys.argv[1:13]
t = open(state, encoding='utf-8').read(); h = open(hist, encoding='utf-8').read(); body = open(bodyf, encoding='utf-8').read().rstrip()
m = re.search(r'^## 🔄 .*$', t, re.M)
if not m: sys.exit("FAIL anchor: no cycle section found")
prev = t[m.start():].rstrip()
if prev.endswith('---'): prev = prev[:-3].rstrip()
head = t[:m.start()]
i = h.index('\n---\n') + len('\n---\n')
open(hist, 'w', encoding='utf-8').write(h[:i] + '\n' + prev + '\n\n---\n' + h[i:])
def row(label, value):
    global head
    pat = re.compile(r'^(\| ' + re.escape(label) + r' \| )(.*?)( \| [^|]*\|)$', re.M)
    if not pat.search(head): sys.exit(f"FAIL anchor: card row '{label}' not found")
    head = pat.sub(lambda mm: mm.group(1) + value + mm.group(3), head, count=1)
row('`origin/main`', f'`{main_sha[:8]}` (#{last_pr})')
row('open PRs', f'**{open_prs}**')
row('controller worktree', f'`/Users/kiro/my_projects/gisik-nokma-ctl` — on `{ctl_branch}` | `git -C … status`'.split(' | ')[0])
row('dev stack', stack)
head = re.sub(r'Last rewritten \*\*[^*]+\*\* at `origin/main` \*\*`[0-9a-f]+`\*\* \([^)]*\) by the cycle-\d+ controller, on branch `[^`]+`\.',
              f'Last rewritten **{stamp}** at `origin/main` **`{main_sha[:8]}`** (#{last_pr}) by the cycle-{n} controller, on branch `{ctl_branch}`.', head, count=1)
head = re.sub(r'(\| \*\*REVIEW[^\n]*?\| )([^|]*)( \| `tmux list-windows -t gisik`)', lambda mm: mm.group(1) + mm.group(2) + mm.group(3), head)
cycle = f"## 🔄 {stamp} — **CYCLE {n}: {title}** `main` is **`{main_sha[:8]}`**; windows: {windows}.\n\n{body}\n\n---\n"
open(state, 'w', encoding='utf-8').write(head + cycle)
print(f"anchor.py: cycle {n} written, previous cycle rotated")
```

Implementer note: the `row` helper keeps the third column (the "re-measure with" text) intact; if a label is missing it fails loudly rather than guessing.

- [ ] **Step 2: Write `anchor.sh`**

```bash
#!/usr/bin/env bash
# ctl anchor <N> --title T --body FILE — measure, then let anchor.py do the text; then ctl checks.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
n="${CTL_ARGS[0]:-}"; title=""; body=""
set -- "${CTL_ARGS[@]:1}"
while [ $# -gt 0 ]; do case "$1" in --title) title="$2"; shift 2;; --body) body="$2"; shift 2;; *) ctl_fail anchor "unknown arg $1";; esac; done
[ -n "$n" ] && [ -n "$title" ] && [ -f "$body" ] || ctl_fail anchor "usage: ctl anchor <N> --title T --body FILE"
cd "$CTL_REPO" || exit 1
[ "$(/usr/bin/git branch --show-current)" != "main" ] || ctl_fail anchor "on main — branch first"
/usr/bin/git fetch -q origin
main_sha="$(/usr/bin/git rev-parse origin/main)"
last_pr="$(gh pr list --state merged --limit 1 --json number --jq '.[0].number')"
open_prs="$(gh pr list --state open --json number --jq length)"
ctl_branch="$(/usr/bin/git branch --show-current)"
stack="owner's; built images from the PRIMARY checkout"
for c in gisik-nokma-dev-server-1 gisik-nokma-dev-web-1; do
  img="$(docker inspect --format '{{.Image}}' "$c" 2>/dev/null | cut -c8-19)"; created="$(docker inspect --format '{{.Image}}' "$c" 2>/dev/null | xargs docker inspect --format '{{.Created}}' 2>/dev/null | cut -c1-16)"
  stack="$stack; ${c#gisik-nokma-dev-} image $img created $created"
done
windows="$(tmux list-windows -t gisik -F '#{window_index}:#{window_name}' 2>/dev/null | tr '\n' ' ')"
stamp="$(date '+%Y-%m-%d %H:%M IST')"
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: anchor.py cycle $n main=$main_sha pr=$last_pr open=$open_prs branch=$ctl_branch"; ctl_ok anchor "dry-run"; fi
python3 "$(dirname "$0")/anchor.py" docs/lanes/controller-state.md docs/lanes/controller-state-history.md "$n" "$title" "$body" "$main_sha" "$last_pr" "$open_prs" "$ctl_branch" "$stack" "$windows" "$stamp" || ctl_fail anchor "anchor.py failed"
bash "$(dirname "$0")/checks.sh" --repo "$CTL_REPO" || ctl_fail anchor "checks red after the rewrite"
ctl_ok anchor "cycle $n written at main ${main_sha:0:12}; commit and land it"
```

- [ ] **Step 3: Test `anchor.py` on copies** — copy the two state files to `/tmp/a/`, run `python3 scripts/ctl/verbs/anchor.py /tmp/a/controller-state.md /tmp/a/controller-state-history.md 99 'TEST' <(echo body) 0123456789ab 999 0 ctl/x 'stack line' '0:main' '2026-09-21 19:00 IST'`; expect the print line, `grep -c '^## 🔄' /tmp/a/controller-state.md` → 1 (cycle 99), and the history file's first cycle heading is the previous cycle 44. Delete `/tmp/a`.

- [ ] **Step 4: Commit** — `git add scripts/ctl/verbs/anchor.sh scripts/ctl/verbs/anchor.py && git commit -m "ctl anchor: measured card rows, rotation and the new cycle, then checks"`

---

### Task 9: `check-pr`

**Files:** Create `scripts/ctl/verbs/check-pr.sh`, `scripts/ctl/verbs/check-pr.py`

**Interfaces (produces):** `ctl check-pr <branch> [--plan FILE] [--body FILE]` → writes marker `checked-<sha>`; `OK check-pr <branch> <n> tasks …`.

- [ ] **Step 1: Write `check-pr.py`**

```python
#!/usr/bin/env python3
"""check-pr.py <repo> <plan.md> <progress.md> <body-or-empty> — the mechanical half of the plan's §4. Exits 1 with every failed condition listed."""
import re, subprocess, sys, os
repo, plan, progress, body = sys.argv[1:5]
def git(*a): return subprocess.run(['/usr/bin/git', '-C', repo, *a], capture_output=True, text=True).stdout
ids = set(re.findall(r'^#### (T-[\w./-]+)', open(os.path.join(repo, plan), encoding='utf-8').read(), re.M))
ruling_of = {t: t[2:] for t in ids}  # T-E6-15 -> E6-15 ; T-F3-ux -> F3-ux (commit subjects use the ruling id: F3)
def ruling_id(subject):
    m = re.match(r'([A-Z]+\d*-?\d+)\b', subject); return m.group(1) if m else None
fails = []
files = [f for f in git('diff', '--name-only', 'origin/main...HEAD').split('\n') if f]
subjects = [s for s in git('log', '--format=%s', 'origin/main..HEAD').split('\n') if s]
tasks = []
for s in subjects:
    rid = ruling_id(s)
    if not rid or not any(ruling_of[t].startswith(rid) for t in ids):
        fails.append(f"commit subject does not start with a ruling id in the plan: {s!r}"); continue
    tasks.append(rid)
if not tasks: fails.append("no task commits on this branch")
allowed_free = ('Features.md', 'test-cases/', 'docs/lanes/release-2026-09-22-progress.md')
if files and not any(f.startswith(allowed_free) or f.startswith(('apps/', 'packages/', 'docs/', 'scripts/', '.github/', 'deploy/', 'design-system/')) for f in files):
    fails.append("diff touches nothing a task can claim")
if any(f.startswith(('apps/', 'packages/')) for f in files) and not any(f.startswith(('Features.md', 'test-cases/')) for f in files):
    fails.append("apps/ or packages/ changed but neither Features.md nor test-cases/ did")
prog = open(os.path.join(repo, progress), encoding='utf-8').read() if os.path.exists(os.path.join(repo, progress)) else ''
for rid in tasks:
    if not re.search(r'^\| T-' + re.escape(rid) + r'\S* \| (done|skipped|blocked|needs-owner) \|', prog, re.M):
        fails.append(f"progress file has no line for {rid}")
if body and os.path.exists(body):
    b = open(body, encoding='utf-8').read()
    for lp in re.findall(r'(/[\w./-]+\.log)', b):
        if not os.path.exists(lp): fails.append(f"PR body names a log that does not exist: {lp}"); continue
        tail = ''.join(open(lp, errors='replace').readlines()[-30:])
        if 'Test Files' not in tail or 'passed' not in tail: fails.append(f"log has no green summary in its last 30 lines: {lp}")
else:
    fails.append("no PR body file given (--body FILE) — the reviewer pass needs the log paths")
for f in fails: print("  -", f)
print(f"check-pr.py: {len(tasks)} task commits, {len(files)} files, {len(fails)} failures")
sys.exit(1 if fails else 0)
```

- [ ] **Step 2: Write `check-pr.sh`**

```bash
#!/usr/bin/env bash
# ctl check-pr <branch> [--plan FILE] [--body FILE] — mechanical batch-PR verification; writes .git/ctl/checked-<sha> when green.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
branch="${CTL_ARGS[0]:-}"; plan="docs/lanes/release-2026-09-22-plan.md"; body=""
set -- "${CTL_ARGS[@]:1}"
while [ $# -gt 0 ]; do case "$1" in --plan) plan="$2"; shift 2;; --body) body="$2"; shift 2;; *) ctl_fail check-pr "unknown arg $1";; esac; done
[ -n "$branch" ] || ctl_fail check-pr "usage: ctl check-pr <branch> [--plan FILE] [--body FILE]"
cd "$CTL_REPO" || exit 1
[ "$(/usr/bin/git branch --show-current)" = "$branch" ] || ctl_fail check-pr "checked-out branch is not $branch"
[ -z "$(/usr/bin/git status --porcelain)" ] || ctl_fail check-pr "tree is dirty"
/usr/bin/git fetch -q origin
log="$(ctl_log check-pr)"
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: check-pr.py $CTL_REPO $plan; ctl checks"; ctl_ok check-pr "dry-run"; fi
python3 "$(dirname "$0")/check-pr.py" "$CTL_REPO" "$plan" docs/lanes/release-2026-09-22-progress.md "$body" | tee -a "$log"; rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] || ctl_fail check-pr "conditions failed (log $log)"
bash "$(dirname "$0")/checks.sh" --repo "$CTL_REPO" >> "$log" 2>&1 || ctl_fail check-pr "checks red (log $log)"
sha="$(/usr/bin/git rev-parse HEAD)"; ctl_marker_write "$CTL_REPO" checked "$sha" "$log"
ctl_ok check-pr "$branch ${sha:0:12} checked (log $log)"
```

- [ ] **Step 3: Test the refusal path on this branch** — `scripts/ctl/ctl check-pr ctl/ctl-scripts` → `FAIL check-pr conditions failed` with lines like `commit subject does not start with a ruling id` (this branch's commits are `ctl:` commits, so the refusal is correct and proves the conditions fire).

- [ ] **Step 4: Commit** — `git add scripts/ctl/verbs/check-pr.sh scripts/ctl/verbs/check-pr.py && git commit -m "ctl check-pr: the mechanical half of a batch PR's reviewer pass, with the checked marker"`

---

### Task 10: `reconcile`

**Files:** Create `scripts/ctl/verbs/reconcile.py`, `scripts/ctl/verbs/reconcile.sh`

- [ ] **Step 1: Write `reconcile.py`** (port of the cycle-43 script, plus plan coverage)

```python
#!/usr/bin/env python3
"""reconcile.py <repo> — ledger ids vs report headings by membership (aliases + withdrawn markers), plus plan coverage."""
import csv, re, sys, os
repo = sys.argv[1]; L = lambda p: os.path.join(repo, 'docs/lanes', p)
rows = list(csv.reader(open(L('review-scores.tsv'), newline=''), delimiter='\t'))[1:]
led = {}
for r in rows:
    if r[0].startswith('R'): continue
    led.setdefault(r[1], set()).add(r[0])
rep = {'exec1':'review-ui-exec1.md','exec2':'review-ux-exec2.md','exec3':'review-functionality-exec3.md','exec4':'review-ui-exec4.md','exec5':'review-ux-exec5.md','exec6':'review-functionality-exec6.md'}
pat = re.compile(r'^#{2,4} .*?\b(E[1-6]-\d+|P\d+|I\d+|F\d+|V\d+)\b')
def alias2(i):
    m = re.match(r'E2-(\d+)$', i)
    if m:
        n = int(m.group(1))
        if n <= 9: return f'F{n}'
        if n <= 19: return f'V{n-9}'
    return i
bad = 0
for lane, f in rep.items():
    heads = set()
    text = open(L(f), encoding='utf-8').read()
    for line in text.split('\n'):
        m = pat.match(line)
        if m:
            i = m.group(1)
            if lane == 'exec2': i = alias2(i)
            if lane == 'exec3' and not i.startswith(('E3-', 'F')): continue   # exec 3 cites other lanes' ids in its attack sections
            heads.add(i)
    if lane == 'exec3': heads = {i for i in heads if not re.match(r'E3-[1-8]$', i)}  # its round-1 F1..F8 are cited as E3-1..8 in prose
    if lane == 'exec6': heads |= set(re.findall(r'^### (E6-\d+)', open(L('review-refutations-exec6.md'), encoding='utf-8').read(), re.M))
    ledger = {alias2(i) if lane == 'exec2' else i for i in led.get(lane, set())}
    only_report, only_ledger = sorted(heads - ledger), sorted(ledger - heads)
    print(f"{lane}: headings {len(heads)} ledger {len(ledger)} | report-only {only_report} | ledger-only {only_ledger}")
    bad += len(only_report) + len(only_ledger)
plan = L('release-2026-09-22-plan.md')
if os.path.exists(plan):
    tids = set(re.findall(r'^#### (T-[\w./-]+)', open(plan, encoding='utf-8').read(), re.M))
    valid = {(r[0], r[1]) for r in rows if not r[0].startswith('R') and float(r[4] or 0) > 0}
    def tid(fid, lane):
        if fid.startswith('E'): return f'T-{fid}'
        if fid.startswith('F'): return f'T-{fid}-' + ('ux' if lane == 'exec2' else 'fn')
        return f'T-{fid}'
    missing = sorted(tid(f, l) for f, l in valid if tid(f, l) not in tids)
    print(f"plan coverage: {len(valid)} valid rulings, {len(tids)} tasks, missing {missing}")
    bad += len(missing)
print(f"reconcile.py: {bad} discrepancies")
sys.exit(1 if bad else 0)
```

- [ ] **Step 2: Write `reconcile.sh`**

```bash
#!/usr/bin/env bash
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
[ "$CTL_DRY_RUN" = 1 ] && { echo "DRY: reconcile.py $CTL_REPO"; ctl_ok reconcile "dry-run"; }
log="$(ctl_log reconcile)"
python3 "$(dirname "$0")/reconcile.py" "$CTL_REPO" | tee "$log"; rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] && ctl_ok reconcile "0 discrepancies (log $log)" || ctl_fail reconcile "discrepancies listed (log $log)"
```

- [ ] **Step 3: Run it** — `scripts/ctl/ctl reconcile --repo /Users/kiro/my_projects/gisik-nokma-ctl` → every lane `report-only [] | ledger-only []`, `plan coverage: 231 valid rulings, 231 tasks, missing []`, `OK reconcile`. If exec 3 shows report-only ids, extend the exec-3 filter rather than the ledger.

- [ ] **Step 4: Commit** — `git add scripts/ctl/verbs/reconcile.* && git commit -m "ctl reconcile: ledger vs report headings by membership, plan coverage"`

---

### Task 11: `lanes`

**Files:** Create `scripts/ctl/verbs/lanes.sh`

- [ ] **Step 1: Write the verb**

```bash
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
```

- [ ] **Step 2: Run it** — `scripts/ctl/ctl lanes` → one line for each of windows 0, 2, 4, 6 and `OK lanes 4 windows`.

- [ ] **Step 3: Commit** — `git add scripts/ctl/verbs/lanes.sh && git commit -m "ctl lanes: one line per window, change-only watch"`

---

### Task 12: `restart` and `dispatch`

**Files:** Create `scripts/ctl/verbs/restart.sh`, `scripts/ctl/verbs/dispatch.sh`

- [ ] **Step 1: Write `dispatch.sh`**

```bash
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
```

- [ ] **Step 2: Write `restart.sh`**

```bash
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
```

Implementer note: `exec-claude.sh` prints its chosen backend on stderr as its first line (the controller brief relies on it); if the wording differs from `backend anthropic|deepseek`, read the launcher and match its actual line — do not weaken the check to "any output".

- [ ] **Step 3: Dry-run both** — `scripts/ctl/ctl dispatch 2 docs/lanes/release-2026-09-22-progress.md --dry-run` → `OK dispatch dry-run`; `scripts/ctl/ctl restart 2 /Users/kiro/my_projects/gisik-nokma-exec2 /Users/kiro/my_projects/gisik-nokma-lanes/dispatch-executor-serial.md --dry-run` → `OK restart dry-run` (the exec2 worktree is clean; if it is dirty the verb must say so — that is also a pass).

- [ ] **Step 4: Commit** — `git add scripts/ctl/verbs/restart.sh scripts/ctl/verbs/dispatch.sh && git commit -m "ctl restart and ctl dispatch: relaunch through exec-claude.sh, two-paste delivery with proof"`

---

### Task 13: `rebuild`

**Files:** Create `scripts/ctl/verbs/rebuild.sh`

- [ ] **Step 1: Write the verb**

```bash
#!/usr/bin/env bash
# ctl rebuild — pull --ff-only in the primary checkout, rebuild server+web, verify the running artifact.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || true
P="$(ctl_primary)"; cd "$P" || ctl_fail rebuild "no primary checkout at $P"
[ "$(/usr/bin/git branch --show-current)" = "main" ] || ctl_fail rebuild "primary checkout is not on main"
[ -z "$(/usr/bin/git status --porcelain)" ] || ctl_fail rebuild "primary checkout is dirty"
[ -f .env ] || ctl_fail rebuild "no .env in the primary checkout (sign-in would silently switch off)"
ctl_node22 || exit 1
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: git pull --ff-only origin main; pnpm dev:stack:rebuild; verify"; ctl_ok rebuild "dry-run"; fi
/usr/bin/git pull -q --ff-only origin main || ctl_fail rebuild "pull --ff-only failed"
sha="$(/usr/bin/git rev-parse --short=12 HEAD)"; start="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"; log="$(ctl_log rebuild)"
pnpm dev:stack:rebuild > "$log" 2>&1 || ctl_fail rebuild "dev:stack:rebuild rc=$? (log $log)"
for c in gisik-nokma-dev-server-1 gisik-nokma-dev-web-1; do
  st="$(docker ps --filter "name=$c" --format '{{.Status}}')"; case "$st" in Up*) ;; *) ctl_fail rebuild "$c not Up: '$st'";; esac
  created="$(docker inspect --format '{{.Image}}' "$c" | xargs docker inspect --format '{{.Created}}')"
  [ "$created" \> "$start" ] || ctl_fail rebuild "$c image created $created is not newer than start $start"
done
case "$(docker ps --filter name=gisik-nokma-dev-server-1 --format '{{.Status}}')" in *healthy*) ;; *) ctl_fail rebuild "server not healthy";; esac
sp="$(docker port gisik-nokma-dev-server-1 | head -1 | awk -F: '{print $NF}')"; wp="$(docker port gisik-nokma-dev-web-1 | head -1 | awk -F: '{print $NF}')"
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$sp/healthz")" = 200 ] || ctl_fail rebuild "/healthz on :$sp not 200"
wc="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$wp/")"; case "$wc" in 2*|3*) ;; *) ctl_fail rebuild "web / on :$wp answered $wc";; esac
gid="$(docker exec gisik-nokma-dev-server-1 sh -c 'printf %s "$GOOGLE_CLIENT_ID"' | cut -c1-6)"; [ -n "$gid" ] || ctl_fail rebuild "GOOGLE_CLIENT_ID empty inside the server container"
ctl_ok rebuild "$sha images fresh, server healthy, /healthz 200 on :$sp, web :$wp $wc, sign-in configured (log $log)"
```

- [ ] **Step 2: Dry-run** — `scripts/ctl/ctl rebuild --dry-run` → `DRY: …`, `OK rebuild dry-run`.

- [ ] **Step 3: Commit** — `git add scripts/ctl/verbs/rebuild.sh && git commit -m "ctl rebuild: pull, rebuild, verify the running artifact"`

---

### Task 14: `selftest` and `pnpm check:ctl`

**Files:** Create `scripts/ctl/verbs/selftest.sh`; Modify `package.json` (scripts block, next to `check:migrations`)

- [ ] **Step 1: Write the verb**

```bash
#!/usr/bin/env bash
# ctl selftest — hook table, lib tests, every verb's --dry-run. Wired as `pnpm check:ctl`.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/lib.sh"
export CTL_IN_SELFTEST=1
repo="$(ctl_repo "$PWD")" || exit 1
fails=0
step() { if bash -c "$2" > /dev/null 2>&1; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails+1)); fi; }
step "hook self-test"        "python3 '$HERE/hooks/ctl-scripts-only.py' --self-test"
step "lib tests"             "bash '$HERE/test/lib.test.sh'"
step "checks --dry-run"      "'$HERE/ctl' checks --repo '$repo' --dry-run"
step "gate --dry-run"        "'$HERE/ctl' gate \$(/usr/bin/git -C '$repo' rev-parse HEAD) --repo '$repo' --dry-run || /usr/bin/git -C '$repo' status --porcelain | grep -q ."
step "pr open --dry-run refuses main" "! '$HERE/ctl' pr open main --title t --body '$HERE/README.md' --repo '$repo' --dry-run"
step "land refuses a merged PR" "'$HERE/ctl' land 638 --repo '$repo' --dry-run; [ \$? -eq 1 ]"
step "anchor --dry-run"      "'$HERE/ctl' anchor 0 --title t --body '$HERE/README.md' --repo '$repo' --dry-run"
step "check-pr --dry-run"    "'$HERE/ctl' check-pr \$(/usr/bin/git -C '$repo' branch --show-current) --repo '$repo' --dry-run || /usr/bin/git -C '$repo' status --porcelain | grep -q ."
step "reconcile --dry-run"   "'$HERE/ctl' reconcile --repo '$repo' --dry-run"
step "lanes"                 "'$HERE/ctl' lanes"
step "dispatch --dry-run refuses a missing file" "! '$HERE/ctl' dispatch 2 /nonexistent --dry-run"
step "restart --dry-run refuses window 0" "! '$HERE/ctl' restart 0 '$repo' '$HERE/README.md' --dry-run"
step "rebuild --dry-run"     "'$HERE/ctl' rebuild --dry-run"
[ "$fails" -eq 0 ] && ctl_ok selftest "13 steps" || ctl_fail selftest "$fails steps red"
```

Implementer note: `gate --dry-run` and `check-pr --dry-run` legitimately fail on a dirty tree (they refuse before dry-running), which the `||` clause accepts only when the tree IS dirty; `anchor` with N=0 must only print its DRY line. `lanes` passes when tmux has no session too (it prints `OK lanes 0 windows`).

- [ ] **Step 2: Add the script** to `package.json` after `"check:migrations"`: `"check:ctl": "bash scripts/ctl/ctl selftest",` (keep the JSON valid; `node -e "require('./package.json')"` must succeed).

- [ ] **Step 3: Run** — `pnpm check:ctl` → every step `ok`, `OK selftest 13 steps`. Then `scripts/ctl/ctl checks` (no `CTL_IN_SELFTEST`) → `OK checks 8 checks rc=0 …`.

- [ ] **Step 4: Commit** — `git add scripts/ctl/verbs/selftest.sh package.json && git commit -m "ctl selftest wired as pnpm check:ctl — the eighth check"`

---

### Task 15: README and the wiring

**Files:**
- Create: `scripts/ctl/README.md`
- Modify: `docs/lanes/controller-state.md` (card §4, one line; the merge-bar line)
- Modify: `docs/lanes/release-2026-09-22-plan.md` §0 rule 11, §1 step 2–3, §4 item 6, PR template
- Modify (outside the repo, in place): `/Users/kiro/my_projects/gisik-nokma-lanes/dispatch-controller-serial.md` (append a section), `/Users/kiro/my_projects/gisik-nokma-lanes/dispatch-executor-serial.md` (append a section)

- [ ] **Step 1: Write the README**

```markdown
# scripts/ctl — the controller's mechanical work as verbs (owner's order, 2026-09-21)

`scripts/ctl/ctl <verb>` is the only door for: landing a PR, the forced gate, opening a PR, anchoring the controller state, verifying a batch PR, reconciling the ledger, watching lanes, restarting an executor, delivering a message to a pane, rebuilding the dev stack. A PreToolUse hook (`hooks/ctl-scripts-only.py`) refuses the raw forms in every Claude Code session on this machine; `ctl help` lists the verbs, each prints one summary line last (`OK …` / `FAIL …`), exits 0 only when every named condition held, and takes `--dry-run`.

## The marker chain
`ctl check-pr <branch>` (green) writes `.git/ctl/checked-<sha>`; `ctl pr open --require-checked` refuses without it. `ctl gate <sha>` (green) writes `.git/ctl/gate-<sha>`; `ctl land <pr>` refuses without it and re-reads the PR head at the instant of merging. A marker names one sha; a new commit needs a new run.

## The escape hatch
Set `GISIK_CTL_UNLOCK=1` in the environment of the `claude` process you launch (`GISIK_CTL_UNLOCK=1 claude …`) and the hook stands down for that session. A `GISIK_CTL_UNLOCK=1 gh pr merge` typed inside a session does not unlock (the hook's own environment is unchanged — case 32 of the self-test). Your own terminal runs no hook.

## Fresh machine
1. `bash scripts/ctl/hooks/install-hooks.sh` (runs the self-test first; registers the hook in `~/.claude/settings.json`; idempotent).
2. Node 22 at `~/.nvm/versions/node/v22.22.2` (or `GISIK_NODE22_BIN`), `gh` authenticated, `tmux` session `gisik`, the primary checkout at `/Users/kiro/my_projects/gisik-nokma` (or `GISIK_PRIMARY`).
3. `pnpm check:ctl` green.

## Logs
`~/.cache/gisik-ctl/<verb>-<stamp>.log` (override `CTL_LOG_DIR`). Every summary line names its log.
```

- [ ] **Step 2: Card §4** — add one bullet at the end of `## §4 STANDING RULES THAT SURVIVE EVERY CYCLE` in `docs/lanes/controller-state.md`:
`- **Mechanical work runs through `scripts/ctl/ctl` — land, gate, pr open, anchor, check-pr, reconcile, lanes, restart, dispatch, rebuild — and the hook refuses the raw forms** (`scripts/ctl/README.md`; owner, 2026-09-21). The merge bar is `ctl checks` (eight checks, two controls) + `ctl gate` + `ctl land`.`
Also replace, in the same file's §4 merge-bar bullet, `seven checks` with `eight checks (`ctl checks`)`.

- [ ] **Step 3: Release plan** — in `docs/lanes/release-2026-09-22-plan.md`: §0 rule 11 becomes `**Before the PR: `scripts/ctl/ctl check-pr <branch> --body /tmp/pr-<batch>.md` must print `OK`; then `scripts/ctl/ctl pr open <branch> --title "<batch id>: <title> (<n> tasks)" --body /tmp/pr-<batch>.md --require-checked`.** The hook refuses `git push`-then-`gh pr create` by hand.`; in §1 step 2 replace the root-checks line with `#    - scripts/ctl/ctl checks   (eight checks + two controls; rc=0)` and step 3's three lines with the two `ctl` commands; in §4 item 6 replace `seven root-check exit codes` with `the `ctl checks` summary line`; in the PR template replace the `Root checks:` line with `ctl checks: <summary line>` and add `ctl check-pr: <summary line>`.

- [ ] **Step 4: Briefs (lanes dir, edit in place)** — append to `dispatch-controller-serial.md`:
```
## ⛔ MECHANICAL WORK RUNS THROUGH `scripts/ctl/ctl` — 2026-09-21, owner's order
Landing (`ctl land`), the gate (`ctl gate`), opening a PR (`ctl pr open`), the anchor (`ctl anchor`), batch-PR verification (`ctl check-pr`), the ledger reconciliation (`ctl reconcile`), lane liveness (`ctl lanes --watch` as the Monitor), executor restart (`ctl restart`), pane delivery (`ctl dispatch`), the stack rebuild (`ctl rebuild`). The PreToolUse hook refuses the raw forms; `scripts/ctl/README.md` is the reference. The loop in this brief is now: executor PR → `ctl gate <head>` → `ctl land <pr>` → `ctl restart …` → `ctl anchor <N> …` → `ctl pr open` → `ctl gate` → `ctl land` → dispatch.
```
and to `dispatch-executor-serial.md`:
```
## ⛔ YOUR PR OPENS THROUGH `scripts/ctl/ctl` — 2026-09-21
Before opening a batch PR: `scripts/ctl/ctl check-pr <branch> --body <pr-body-file>` must print `OK`; then `scripts/ctl/ctl pr open <branch> --title … --body … --require-checked`. The hook refuses `gh pr create` and `git push` + create by hand. You still never merge.
```

- [ ] **Step 5: Verify** — `pnpm check:ctl` green; `scripts/ctl/ctl checks` green (check:citations and check:runbook must still pass with the doc edits); `grep -c 'scripts/ctl/ctl' docs/lanes/release-2026-09-22-plan.md` ≥ 4.

- [ ] **Step 6: Commit** — `git add scripts/ctl/README.md docs/lanes/controller-state.md docs/lanes/release-2026-09-22-plan.md && git commit -m "ctl: README and the wiring — card §4, the release plan's §0/§1/§4, the briefs name the verbs"` (the lanes-dir briefs are outside the repo; note their edit in the commit body).

---

### Task 16: first live use and the hook

**Files:** none new (this task exercises the verbs on this branch's own PR and installs the hook)

- [ ] **Step 1:** `scripts/ctl/ctl checks --repo /Users/kiro/my_projects/gisik-nokma-ctl` → `OK checks …`.
- [ ] **Step 2:** write `/tmp/pr-ctl-scripts.md` (title line first: `## scripts/ctl — the controller's mechanical work as verbs, enforced by a hook`; body: the verb list, `pnpm check:ctl` result, the escape hatch, the line *"Hook NOT yet installed at PR time; installed after merge (Task 16 step 6)"*, the attribution line) and run `scripts/ctl/ctl pr open ctl/ctl-scripts --title "scripts/ctl: the controller's mechanical work as verbs, enforced by a PreToolUse hook" --body /tmp/pr-ctl-scripts.md` → `OK pr-open #<n> …`.
- [ ] **Step 3:** `scripts/ctl/ctl gate $(git rev-parse HEAD)` → `OK gate … Tasks: 33 successful, 33 total …` (about 2–3 minutes; run it in the background and read the summary line).
- [ ] **Step 4:** `scripts/ctl/ctl land <n>` → `OK land #<n> merge … primary ff …`. Read the PR's comment: the gate summary is there.
- [ ] **Step 5:** `scripts/ctl/ctl lanes` → four lines; `scripts/ctl/ctl reconcile` → `OK reconcile 0 discrepancies`.
- [ ] **Step 6: Install the hook** — `bash scripts/ctl/hooks/install-hooks.sh` → `registered …`, `OK install-hooks`. Then demonstrate the refusal from this session: run `gh pr merge 1` — expected: the Bash tool is denied with the reason naming `ctl land <pr>`. Record the refusal text in the cycle-45 body.
- [ ] **Step 7: Anchor cycle 45 through the verb** — write `/tmp/cycle45.md` (what landed, the refusal demonstrated, the merge bar is now eight checks + gate + land, nothing scheduled), cut `ctl/cycle45-ctl-live` from `origin/main`, `scripts/ctl/ctl anchor 45 --title "scripts/ctl is live; the hook refuses the raw forms; nothing scheduled" --body /tmp/cycle45.md` → `OK anchor …`; commit; `ctl pr open`; `ctl gate`; `ctl land`. Every step of this anchor must succeed through the verbs with the hook installed — that is the acceptance test of the whole plan.

---

## Self-review against the spec

- §2 layout: Tasks 1–15 create every listed file; `test/lib.test.sh` added under `scripts/ctl/test/` (spec lists no test dir; this is the addition).
- §3 verbs: `checks` T4, `gate` T5, `pr open` T6, `land` T7, `anchor` T8, `check-pr` T9, `reconcile` T10, `lanes` T11, `restart`/`dispatch` T12, `rebuild` T13, `selftest` T14. Each prints one summary line last, exits per the contract, supports `--dry-run`.
- §4 hook: T3, 32-case table incl. the in-command unlock case; installer idempotent; not installed until T16 step 6.
- §5 marker chain: `check-pr`→`pr open --require-checked` (T6/T9), `gate`→`land` (T5/T7).
- §6 wiring: T15 (card, plan, briefs, `check:ctl` in the bar).
- §7 testing: `check:ctl` (T14); first live use in order (T16); refusal demonstrated (T16 step 6).
- §8 error handling: every refusal is a named `FAIL`; `land` and `restart` re-read state before acting.
- Type consistency: `ctl_marker_write/has` signatures identical in T1, T5, T7, T9; `CTL_ARGS` array usage identical across verbs; marker kinds `gate` and `checked` only.
- Bash 3.2: no `declare -A`, no `${var,,}`; `read -r a b c < <(…)` is bash 3 compatible.
