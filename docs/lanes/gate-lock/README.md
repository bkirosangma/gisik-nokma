# Gate lock v3.1 — the reference implementation

Controller ruling 2026-09-06. Lane E maintains this; the other four lanes and the
controller copy it. **These files are a REFERENCE COPY, not repo tooling** —
nothing in the build, the gate or CI invokes them. Each lane runs its own copy
from its own scratchpad, because the paths inside are per-worktree.

`locked-test.sh <logfile> <command...>` — takes the machine-wide gate lock, waits
for peer worker pools to drain, selects Node 22, cds to the repo root, sweeps
orphaned test databases, runs the command, and reports the numbers a PR body
needs. `gate.sh <logfile>` is a thin wrapper that runs the full forced gate
through it. `sweep-test-dbs.sh` drops idle orphaned `gisik_test_*` databases.

## Why v3, in one paragraph

v2 took a **directory** with `mkdir` and wrote its pid inside as a second step,
leaving a window where the lock was held but unattributed — and its reclaim
treated an empty pid file as a dead holder. A peer whose script takes the
directory and writes no pid file is indistinguishable from a corpse, so v2
deleted a **live** holder's lock. Lane D observed exactly that. v3 creates and
fills the lock in one `set -o noclobber` redirect, so the window does not exist.

**The lesson is not "write a pid file". It is that a lock protocol shared by
scripts that differ is not one protocol.**

## Four corrections that came from measuring, not reasoning

Each was found by watching the check fire against a real process, and three of
them were invisible to inspection:

1. **Count processes, not lines.** `pgrep -fl … | grep -vc` counts LINES, and a
   Claude session's argv carries its whole multi-line brief — `pgrep -fl
   'gisik-gate.lock' | wc -l` returns **371** where `pgrep -f` returns **1**. With
   a line count the idle check can never reach zero and an orphaned lock wedges
   every lane forever.
2. **Exclude the parent**, not just self: the tool shell that launched
   `bash gate.sh` carries that string in its own argv.
3. **`gate[^/]*\.sh`, not `gate\.sh`.** The controller's own gate is `gate19.sh`,
   and `gate.sh` as a regex wants exactly one character between "gate" and "sh",
   so it matches neither that nor any other per-lane name.
4. **Match a path TOKEN in argv, not the whole line.** Matching `$0` made the
   matcher match its own caller, because the awk program contains both script
   names. And the script path is field **4** (`bash /path/gate19.sh`), not 3 —
   a first attempt read 0 against two live gate-shaped processes.

Controls for (4), run together: with a real gate process **and** a shell that
merely mentions both names, `peers = 1`; with nothing running, `peers = 0`.

## MEASURED DEFECT IN THIS VERSION, found 2026-09-06 — `peer_gates` counts its own subshell

**Reproduced, bounded, and NOT fixed here, because the fix is unverified. Read the
whole entry before acting on it.**

`peer_gates()` is invoked as `pg=$(peer_gates)`. The `$( )` forks a subshell that
inherits the script's argv, and the script's own path — `.../locked-test.sh` — is a
token in that argv, so the subshell matches the very pattern the matcher uses.
`$$` excludes the script and `$PPID` excludes its launcher, but the subshell is
neither. **On a completely idle machine the matcher therefore returns 1, never 0.**

Measured, not reasoned about. A script invoked as `.../locked-test-probe.sh`,
containing nothing but this function and an echo, printed `peer_gates via $( ) = 1`
on an idle box. The same awk run WITHOUT a command substitution — piped straight
in the caller's own shell — enumerated **zero** matching processes at the same
instant. That difference is the whole bug.

**Blast radius is small but it is exactly the wrong place.** `pg` is read only at
lines 119-125, the empty-lock RECLAIM path: reclaim an abandoned lock only if the
machine is observably idle. Since `pg >= 1` always, **that path can never fire, so
an abandoned empty lock wedges every lane forever** — which is the failure v3's
reclaim was written to prevent. The normal acquire path does not consult it, so a
gate taken against a free lock (the common case) is unaffected. Lane E ran its
seam-1 gate under v3.1 with the lock free, knowingly.

**Candidate fix, NEGATIVE CONTROL PASSES, POSITIVE CONTROL NEVER FIRED — do not
adopt on this note's say-so.** Exclude our own process GROUP rather than our pid,
since a `$( )` subshell shares the script's pgid while a peer lane's gate has its
own:

```
ps -eo pid=,pgid=,comm=,args= | awk -v mypgid=$(ps -o pgid= -p $$ | tr -d ' ') '
  { c = $3; sub(/.*\//, "", c); hit = 0
    for (i = 4; i <= NF; i++)
      if ($i ~ /(^|\/)(gate[^\/]*|locked-test[^\/]*)\.sh$/) hit = 1 }
  (c == "bash" || c == "sh" || c == "zsh") && hit && $2 != mypgid { n++ }
  END { print n + 0 }'
```

It returns 0 on an idle machine, which is the improvement. **It also returned 0
against a peer this session tried to stage**, because a `&` background job in a
non-interactive shell stays in its parent's process group and was excluded along
with the subshell. A real peer lane runs in a different session and would not be,
but that was not demonstrated. So the fix is a hypothesis with half a control, and
this file's own rule applies to it: *a zero from a matcher never watched to fire is
not a measurement.* Whoever adopts it must first stage a peer in a genuinely
separate process group and watch the count reach 1.

**The recurring shape, for whoever writes v3.3:** this is correction #4 again — "a
shell whose command line merely mentions a gate" — reappearing one level down, in
the subshell rather than the caller. Every fix so far has narrowed WHICH processes
match; none has addressed the fact that the matcher runs inside a process that
matches. Owner: Lane E (maintains this reference), escalated to the controller
because all five lanes and the controller copy these files.
