# Design: `scripts/ctl` — the controller's mechanical work as scripts, enforced by a hook

Date: 2026-09-21 · Owner's order: *"script up everything scriptable, and wire it up so that these are always run with the scripts and never with the llms."* Decisions taken in the brainstorm: **hard enforcement with an owner-only escape hatch**; **repo-owned** under `scripts/ctl/`.

## 1. Purpose

Every repetitive controller and driver operation that today costs a model turn — landing a PR, anchoring the controller state, verifying a batch PR, reconciling the ledger, watching lanes, restarting an executor, delivering a message to a pane, rebuilding the dev stack — becomes a verb of one dispatcher, `scripts/ctl/ctl`. A PreToolUse hook refuses the raw forms of those operations in every Claude Code session on this machine, so a model can only perform them through the verbs. What stays with the model: judging, writing briefs and rulings, deciding what to dispatch, and the narrative paragraph of each anchor.

## 2. Layout

```
scripts/ctl/
  ctl                       # dispatcher: `ctl <verb> [args]`; `ctl help`
  lib.sh                    # shared: node 22 PATH, repo/worktree resolution, log paths, one-line summary, marker files
  verbs/
    checks.sh  gate.sh  pr-open.sh  land.sh  anchor.sh  check-pr.sh
    reconcile.py  lanes.sh  restart.sh  dispatch.sh  rebuild.sh  selftest.sh
  hooks/
    ctl-scripts-only.py     # the PreToolUse/Bash hook (source of truth)
    install-hooks.sh        # copies the hook to ~/.claude/scripts/ and registers it in ~/.claude/settings.json (idempotent)
  README.md                 # what each verb does, the marker-file chain, the escape hatch, a fresh-machine install
```

`package.json` gains `"check:ctl": "bash scripts/ctl/ctl selftest"`, the eighth check in the merge bar. Marker files live under `<worktree>/.git/ctl/` (never committed): `gate-<sha>` and `checked-<sha>`, each holding the ISO time and the log path that produced it.

## 3. Verbs — interface, behaviour, exit code

Common contract: every verb resolves the worktree from `--repo <path>` or `$PWD` (a git worktree root, `.git` file or directory), selects Node 22 (`$HOME/.nvm/versions/node/v22.22.2/bin`, overridable by `GISIK_NODE22_BIN`), writes its full output to `<scratch>/ctl/<verb>-<stamp>.log`, prints **one summary line last** (`OK <verb> …` or `FAIL <verb> <first failed condition>`), exits 0 only when every condition it names held, and supports `--dry-run` (prints the commands it would run, runs nothing that mutates).

| verb | does | fails when |
|---|---|---|
| `checks [--repo]` | runs `check:env check:tasks check:runbook check:citations check:help check:migrations check:ctl` and `node scripts/check-case-ids.mjs`; then two **controls** (a duplicated case id → `check-case-ids` must exit non-zero; a malformed ledger row → `check:tasks` must exit non-zero), each restored from a copy and verified clean by `git status --porcelain` on that file | any check ≠ 0; a control that returns 0; a restore that leaves the file dirty |
| `gate <sha> [--repo]` | refuses if `HEAD ≠ sha` or the tree is dirty; runs `docs/lanes/gate-lock/gate.sh` from a scratch copy with `GATE_REPO`; reads `EXIT=0`, `Tasks: 33 successful, 33 total`, `Cached: 0 cached`, `NODE=v22.`, `Unsupported engine` = 0, `Hook timed out` = 0, orphaned vitest workers at ppid 1 = 0; writes `.git/ctl/gate-<sha>` | any of those; on `Hook timed out` > 0 it says "re-gate on a quiet box" |
| `pr open <branch> --title <t> --body <file> [--base main]` | refuses `main`; `git push -u origin <branch>` as its own step; verifies `git ls-remote` = local HEAD; refuses to open when `.git/ctl/checked-<sha>` is required (`--require-checked`) and absent; `gh pr create`; verifies `headRefOid` = HEAD and reads the body back (first line equal) | push rejected; remote ≠ local; head mismatch; body mismatch |
| `land <pr> [--repo]` | reads the PR head; refuses without `.git/ctl/gate-<head>`; comments the gate summary line on the PR; `gh pr merge --merge` **only if** `headRefOid` still equals the gated sha at the instant of merging (re-read); verifies `state=MERGED`, `mergeCommit` is an ancestor of `origin/main`, `git diff --stat <head> origin/main` empty, `git diff --stat <old origin/main> origin/main` non-empty (the drop check's control); fast-forwards the primary checkout when it is on `main`, clean and not ahead | any of those; a moved head |
| `anchor <N> --title <t> --body <file> [--repo]` | in `docs/lanes/controller-state.md`: moves cycle N−1 (the newest `## 🔄` section) to the top of `controller-state-history.md`; rewrites the card's mechanical rows from measurements (`origin/main` sha + last merged PR number, open-PR count, controller worktree branch, dev-stack image shas and created times, `tmux list-windows -t gisik`, the "Last rewritten" stamp); appends `## 🔄 <date> — CYCLE N: <title>` + the body file; runs `ctl checks` | a row it cannot find; checks red |
| `check-pr <branch> [--repo] [--plan docs/lanes/release-2026-09-22-plan.md]` | the mechanical half of the release plan's §4: (1) every file in `git diff --name-only origin/main...HEAD` is under a path some commit subject's task id can claim, or is `Features.md`, `test-cases/`, the progress file; (2) every commit subject starts with a ruling id that exists in the plan; (3) the progress file has one line per task id in the commit list; (4) if `apps/` or `packages/` changed, `Features.md` or `test-cases/` changed too; (5) `ctl checks`; (6) for each task the PR body names a log path whose last 30 lines contain `Test Files` and `passed`; writes `.git/ctl/checked-<sha>` | any of those, each named |
| `reconcile [--repo]` | ledger vs reports by membership: finding-id headings per report (aliases E2-1…19 → F/V, `WITHDRAWN`-in-heading kept as a finding unless the section says the finding itself is withdrawn) vs `review-scores.tsv` ids per lane; plus the plan's coverage assertion (every valid ruling in exactly one task) | any id in one and not the other, listed |
| `lanes [--watch]` | one line per `gisik:` window: index, name, last `❯` line (stranded text quoted), `Ctx NN%`, `API Error`/`402`/`Insufficient` seen, branch and last push age from `git ls-remote` + `git log -1 --format=%ci`; `--watch` prints only on change, every 60 s, forever | never (a reporting verb) |
| `restart <window> <worktree> <brief> [--override <file>]` | refuses if the worktree is dirty; `tmux kill-window`, `tmux new-window -n <name> -c <worktree>`, launches `gisik-nokma-lanes/exec-claude.sh --permission-mode bypassPermissions "$(cat brief)[ + blank + override]"`; waits ≤ 30 s for the pane's first stderr line naming the backend and the status line | dirty worktree; no backend line |
| `dispatch <window> <file>` | the two pastes (`load-buffer`/`paste-buffer` text, 1 s, `\r`); then proves delivery: the last `❯` line is empty and the file's first 40 chars appear in the transcript above it | either proof missing |
| `rebuild` | in the primary checkout: refuses if dirty or not on `main`; `git pull --ff-only`; `pnpm dev:stack:rebuild` to a log; verifies both containers `Up`, server `(healthy)`, image `Created` newer than the start time, `/healthz` 200 on the server port, `/` on the web port answers 2xx/3xx, `GOOGLE_CLIENT_ID` non-empty inside the server container | any of those |
| `selftest` | the hook's table (below) via `ctl-scripts-only.py --self-test`; each verb's `--dry-run` against the current repo; `lib.sh` unit checks (worktree resolution on a `.git` file and a `.git` dir; node 22 found). Sets `CTL_IN_SELFTEST=1` so `checks --dry-run` skips `check:ctl` — no recursion | any |

## 4. The hook — `ctl-scripts-only.py`

Same contract as `no-piped-test-runs.py`: reads the PreToolUse JSON on stdin, exits 0 with `{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":…}}` to refuse, exits 0 silently to allow, never breaks the shell on a parse error. Heredoc bodies and prose lines (`echo`, `printf`, `git commit`) are ignored, as in the existing hook.

**Allowed unconditionally:** any command segment whose first word resolves to `scripts/ctl/ctl` (relative or absolute) — the verbs are the only door.

**Refused (with the verb to use instead):**

| raw form | verb |
|---|---|
| `gh pr merge …` | `ctl land <pr>` |
| `gh pr create …` | `ctl pr open <branch> …` |
| `gh pr comment … ` whose text contains `Forced gate` | `ctl land` (it comments) |
| `tmux kill-window -t gisik:N` / `tmux new-window -t gisik…` for N ≥ 1 | `ctl restart …` |
| `tmux send-keys -t gisik…` | `ctl dispatch …` |
| `docker compose … up|down|restart …` and `pnpm dev:stack:rebuild` | `ctl rebuild` |
| `git pull`, `git merge`, `git reset --hard` when `$PWD` or a `-C` path is the primary checkout | `ctl land` fast-forwards it; anything else is the owner's |
| `gate.sh`, `locked-test.sh` invoked directly | `ctl gate <sha>` |
| `pnpm test` / `pnpm turbo run test` at a repo root (the whole graph) | `ctl gate <sha>`; a lane runs one package's suite |

**Escape hatch:** when `GISIK_CTL_UNLOCK` is present in the hook's **own** environment, the hook allows everything and prints nothing. Only a session launched with that variable set has it (`GISIK_CTL_UNLOCK=1 claude …` from the owner's shell); a model prefixing a command with `GISIK_CTL_UNLOCK=1` changes the child's environment, not the hook's. The controller's and executors' launchers never set it. The owner's own terminal runs no hook.

**Self-test:** a table of ≥ 24 commands with the expected decision, run by `--self-test`; it is what `ctl selftest` and `pnpm check:ctl` execute, so a hook change that breaks the table reddens the merge bar.

## 5. Gating chain

`ctl check-pr` (green) → marker → `ctl pr open --require-checked` will open. `ctl gate` (green) → marker → `ctl land` will merge. A marker names one sha; a new commit needs a new run. The marker is the check's verdict written where the act must read it — the act cannot proceed on a printed warning.

## 6. Wiring

1. `~/.claude/settings.json` gains the hook entry (by `install-hooks.sh`; idempotent; the README records the manual steps for a fresh machine, as the piped-`head` hook's README does).
2. `gisik-nokma-lanes/dispatch-controller-serial.md` (the live override) gets a section *"MECHANICAL WORK RUNS THROUGH `scripts/ctl/ctl` — the hook refuses the raw forms"* naming the verbs; the card §4 gains one line; the executor brief and the release plan's §0/§1/§4 replace their raw `gh pr create` / `git push` / check lists with `ctl check-pr` + `ctl pr open --require-checked`.
3. `pnpm check:ctl` is added to every place the seven checks are enumerated (the card's merge-bar line, the plan's §1 and §4, the PR template).
4. The controller-state card's dev-stack and lane rows are thereafter written by `ctl anchor`, not by hand.

## 7. Testing

- `pnpm check:ctl` (= `ctl selftest`): hook table, every verb `--dry-run`, `lib.sh` checks. Runs in the merge bar.
- First live use, in order, on this branch's own PR: `ctl checks` → `ctl pr open` → `ctl gate` → `ctl land`. Then `ctl anchor 45` for the cycle that records the landing, `ctl lanes`, `ctl rebuild --dry-run`, `ctl restart --dry-run`, `ctl dispatch --dry-run`.
- The hook is installed only after `selftest` is green, and its first real refusal is demonstrated in the session (a deliberate `gh pr merge 1` attempt, refused) and recorded in the anchor.

## 8. Error handling

A verb never guesses: a missing marker, a moved head, a dirty tree, a control that did not fail, a pane without a backend line, a container without a health line — each is a named `FAIL` and a non-zero exit, and the log path is in the summary line. No verb retries a mutation. `land` and `restart` are the only verbs that change shared state, and both re-read the state they gate on immediately before acting.

## 9. Out of scope

Judging, brief writing, the content of the release plan, dispatch decisions, the gate scripts themselves (the reference copy under `docs/lanes/gate-lock/` is reused, not rewritten), and the idle nudger and limit resumer (existing launchd jobs).
