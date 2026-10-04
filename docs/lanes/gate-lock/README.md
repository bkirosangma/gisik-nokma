# Gate lock v3.3 — the reference implementation

Controller ruling 2026-09-06. Lane E maintains this; the other four lanes and the
controller copy it. **These files are a REFERENCE COPY, not repo tooling** —
nothing in the build, the gate or CI invokes them. Each lane runs its own copy
from its own scratchpad, because the paths inside are per-worktree.

`locked-test.sh <logfile> <command...>` — takes the machine-wide gate lock, waits
for peer worker pools to drain, selects Node 22, cds to the repo root, sweeps
orphaned test databases, runs the command, and reports the numbers a PR body
needs. `GATE_MODE=fresh|cached gate.sh <logfile>` is a thin wrapper that runs the gate
through it (fresh = the full forced gate, the default; cached = see "Gate modes" below). `sweep-test-dbs.sh` drops idle orphaned `gisik_test_*` databases.

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

## Gate modes, the turbo cache, and measured timings (`task/gate-speedup`, owner 2026-10-02)

`gate.sh` takes `GATE_MODE=fresh|cached` (unset = `fresh`; anything else refuses, exit 2). `ctl gate` picks it from `--base`
and states the mode that RAN in its OK line, read from the console (`… EXIT=0 · mode=cached · Tasks: 46 successful, 46 total ·
Cached: 26 cached, 46 total …`); a `gate.sh` that ran a different mode than asked fails the verb.

| kind | command | turbo flags | when |
|---|---|---|---|
| main-kind | `ctl gate <sha>` / `--base main` | `--force --concurrency=1` | before a merge to `main` — the fresh net under everything cached |
| release-kind | `ctl gate <sha> --base release/<x>` | `--concurrency=1`, cache ON | a task landing into a release branch |

**The cache is only as sound as `turbo.json`'s `inputs`.** `scripts/ctl/test/gate-cache.test.sh` (a `ctl selftest` step) proves a
changed cross-package reader changes the task hash (`ui#test` after an `apps/web/src` edit; `mobile#test` after a
`packages/editor` CSS edit; and one row for every other declared non-dependency input, cases 13.1712–13.1715, each shown red when its
`turbo.json` entry is removed) and that an unrelated file does not; `ctl gate` itself fails any run that is not 46/46 (13.1716, 13.1840–13.1849, 13.2020–13.2025); `--real` shows it through turbo's own cache (warm → HIT → change →
MISS), run 2026-10-02: `warm=miss rerun=hit unrelated-change=hit reader-change=miss` for both. The audit found, and `turbo.json`
now declares: ui (client source roots + `apps/*/test`, `packages/*/test`, the `package.json` globs), app-core (the help suite walks
`apps/**` and `packages/**`, minus build output — the `!` negations are mandatory: a glob input walks the DISK and ignores
`.gitignore`, and without them 3431 build outputs were hashed — plus `docs/manual.md`, `docs/faq.md`, `scripts/help-content.mjs`),
server (`.env.example`, `deploy/**`, compose files, Dockerfiles, `reference/**`, `apps/web/e2e-stack/**` and `apps/web/next.config.ts` —
read by `e2e-teardown.test.ts` and `security-middleware.test.ts`, though `web` is not a dependency of `server`), editor (app-core views,
server attachments, mobile editor, and `packages/ui/test/helpers/**` — `colour-scan.ts` and `css-rules.ts`, imported by four editor tests), mobile (`packages/editor` webview bundle) and `tsconfig.base.json` as a global dependency. **Stale-build root cause:**
`mobile#test` reads the editor's built webview bundle but nothing built it first; `build:webview` is now a task and `mobile#test`
depends on it. The first real gate with that ordering failed `mobile#test` — the checked-in `editor-html.generated.ts` WAS stale
against the release (a domain change reaches the bundle) — and was regenerated.

**The cache is a shared worktree cache** (`/Users/kiro/my_projects/gisik-nokma/.turbo/cache`; every worktree reads and writes it).
Local only — no remote cache.

**Cost of soundness:** a change anywhere under `apps/` or `packages/` re-runs `app-core#test` (the help walker) and, for a client
source file, `ui#test`; a server edit still re-runs `ui`, `app-core`, `server` and `web` tests (measured below).

### Measured (2026-10-02, this machine, local runs; `ctl gate` OK lines, wall = the verb, turbo = turbo's own `Time:`)

| run | mode | cached | wall | turbo | result |
|---|---|---|---|---|---|
| unchanged tree, 2nd gate | cached (c=2) | 34/34 | 66 s | 0.1 s | green — wall is the lock + peer-pool drain floor |
| CSS-only (`apps/web/app/globals.css`) | cached (c=2) | 30/34 | 93 s | 87 s | green |
| server-only (`apps/server/src/index.ts`) | cached (c=2) | 31/34 | 232 s | 166 s | green |
| mixed (server + web `.tsx` + editor CSS) | cached (c=2) | 28/34 | 64 s | 58 s | green, **invalid**: its server edit was byte-identical to the previous run's and hit that cache |
| mixed, new bytes (×2) | cached (c=2) | 19/34 | 574 s / 201 s | — / 3m12 | **red** both times: 5 s vitest timeouts in app-core's jsdom tests |
| server-only | cached (c=1) | 26/34 | 371 s | 5m04 | green, 4 foreign vitest workers at start |
| mixed | cached (c=1) | 19/34 | 335 s | 4m29 | green |
| CSS-only | cached (c=1) | 2/34 | 417 s | 6m36 | green — a release delta (domain) rode in, so nearly everything missed |
| CSS-only | cached (c=1) | 29/34 | 491 s | 3m04 | **red**: two web tests timed out at 5.9 s / 5.2 s; load average 200 on 10 cores |
| CSS-only, new merge | cached (c=1) | 26/34 | 335 s | 4m29 | green |
| any tree | **main-kind fresh** | 0/34 | **274 s** | — | green (quiet box); baseline was 3.5–4.2 min |

Read this table for what it is: **the saving is real and proportional to the hit count, but the box is shared and wall times are
dominated by load.** The quiet-box c=2 runs (87–166 s) show the potential; the c=1 runs ran at load average 30–200 and mostly
measured the neighbours. The first release-kind gate after a release delta re-runs everything the delta touches.

**Why `cached` is `--concurrency=1`, not 2 (the brief asked for 2).** At 2, both miss-heavy runs failed with 5 s vitest timeouts
that pass in <1 s alone (7.4 s and 5.3 s); two vitest pools at once oversubscribe a 10-core / 16 GB box. At 1, 1 of 5 runs hit the same
class of timeout, at load 200 — a property of the load, not the mode. 1 is the conservative setting (the standing protocol of
2026-09-06); flipping it is one line in `gate.sh` and the `13.1700` arm.

**Residual limits.** (1) `token-discipline.test.ts`'s `ESCAPE` regex (a test that reaches outside its package) was not extended; the
fresh main-kind gate is the net. (2) The first gate after a release delta, or after `turbo.json` changes, is mostly misses.
(3) A vitest 5 s timeout under load is a flake, not a regression: re-run the gate before suspecting the diff.
