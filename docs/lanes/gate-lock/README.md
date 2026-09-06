# Gate lock v3.3 — the reference implementation

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

## v3.3 — `peer_gates` counted its own subshell. FIXED, and the prescribed fix was wrong

**The defect (v3.2 and earlier).** `peer_gates()` is invoked as `pg=$(peer_gates)`.
The `$( )` forks a subshell that inherits the script's argv, and the script's own
path — `.../locked-test.sh` — is a token in that argv, so the subshell matches the
very pattern the matcher uses. `$$` excludes the script and `$PPID` excludes its
launcher; the subshell is neither. **On an idle machine the matcher returned 1,
never 0.**

**Blast radius, small but exactly the wrong place.** `pg` is read only on the
empty-lock RECLAIM path: reclaim an abandoned lock only if the machine is
observably idle. With `pg >= 1` always, **that path can never fire, so an
abandoned empty lock wedges every lane forever** — the failure v3's reclaim exists
to prevent. The normal acquire path never consults it, so a gate taken against a
free lock (the common case) was unaffected.

**The prescribed fix does not work, and looks like it does.** The instruction
issued to the lanes was `-v fork=$BASHPID` inline in the awk argument list, with
`$1 != fork` in the predicate. Bash expands that argument **in the child it forks
for `awk`**, so `fork` receives AWK's pid — and awk is already excluded, by `comm`.
The subshell stays counted. Written inline it is a no-op that reads as a fix.

**What works: capture `$BASHPID` with a plain assignment first**, executed by the
substitution subshell before any pipeline fork:

```bash
peer_gates() {
  local fork=$BASHPID
  ps -eo pid=,comm=,args= | awk -v self=$$ -v parent=$PPID -v fork="$fork" '
    ...  $1 != self && $1 != parent && $1 != fork { n++ }
```

**Control record, measured on this machine 2026-09-06** with Lane D's live
gate-shaped peer (pid 87594) present throughout, so the true peer count is 1 —
never 0 — and the positive control is a **gate-shaped SLEEPER**, deliberately not a
copy of these scripts, since an instrument that counts copies of itself proves only
that it counts instruments:

| condition | inline `-v fork=$BASHPID` | captured first |
|---|---|---|
| baseline: one live peer gate | 2 | **1** |
| + one gate-shaped sleeper | 3 | **2** |
| sleeper reaped | 2 | **1** |

The inline form is the captured form **plus one, always** — it never excludes
anything real. The captured form tracks the true peer count, and the sleeper moves
it in both directions, which is what makes this a measurement rather than a zero
from a matcher never watched to fire.

*(The v3.2 note here proposed excluding our own process GROUP instead. That
candidate is WITHDRAWN: it returned 0 on an idle machine, but its positive control
never fired — a `&` background job in a non-interactive shell stays in its parent's
process group and was excluded along with the subshell. Superseded by the above,
which is controlled in both directions.)*

**The recurring shape:** this is correction #4 — "a shell whose command line merely
mentions a gate" — one level down. Every earlier fix narrowed WHICH processes match;
none addressed the fact that **the matcher runs inside a process that matches.**

## v3.3 — `REPO` is no longer hard-coded, and a wrong tree now fails loudly

`gate.sh` and `locked-test.sh` both carried
`REPO=/Users/kiro/my_projects/gisik-nokma-lanes/lane5-plan11` — Lane E's worktree.
**These files are copied between lanes**, so a peer that copied the FILE gated Lane
E's tree and read Lane E's `check:env` exit while believing it had measured its own
(Lane B, 2026-09-06). A wrong tree does not error; it returns a well-formed green
about somebody else's work.

Now `REPO="${GATE_REPO:-$PWD}"`, guarded:

```bash
if [ ! -e "$REPO/.git" ]; then
  echo "FATAL: '$REPO' is not the root of a git worktree." >&2
  ...
  exit 3
fi
```

`-e`, not `-d`: in a git **worktree** `.git` is a FILE (`gitdir: …`), not a
directory — verified here (`file -b .git` → `ASCII text`). Controls: from `/tmp`
it prints the FATAL lines and exits 3; with `GATE_REPO` set to a real worktree the
guard passes. A relative form (`$(dirname "$0")/../..`) was rejected — from
`docs/lanes/gate-lock/` it resolves to `docs/`, and it breaks entirely for the
scratchpad copies every lane actually runs.

**Copying these files still requires one decision per lane**: run them from your
worktree root, or export `GATE_REPO`. That is now a loud failure instead of a
silent misattribution.
