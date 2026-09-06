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
