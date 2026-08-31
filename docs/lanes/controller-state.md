# Cross-lane controller — live state

**This file is the controller's restart surface.** A controller relaunched from
`gisik-nokma-lanes/dispatch-main-controller.md` recovers only what is written here. Refreshed at every
decision boundary.

> **Shas in narrative prose below are facts about when they were written.** Verify anchors with
> `git branch --contains` — empty output means orphaned. `git cat-file` passes on reflog-only commits and
> will lie. This file lives on `main` deliberately: an earlier handoff was tracked, pushed, and stranded on
> a branch that had already merged, so a restart read a copy 70 lines out of date. **Once the branch
> carrying a handoff merges, the next update branches off `main`.**

## Anchors — verified 2026-08-31, at `c93c910`

| what | value |
|---|---|
| `main` | `c93c910` — PR #43 (Plan 6a T9) squash-merged |
| last forced gate | `c93c910` — 18/18, 0 cached, **853 tests**, `TURBO_EXIT=0` |
| gate composition | domain 263 · rule-engine 278 · server 143 · app-core **130** · ui 31 · sync-client 8 |
| **gate ran under** | **node v22.22.2** — see the Node section below before you trust any gate |
| collision surfaces | fixtures **84/84** · projections **2** (`proj_entity_heads`, `proj_workflows`) |
| open PRs | none at time of writing — **re-measure** |

**Re-measure everything above on resume.** Recount at the sha you report; do not carry a composition
forward — five of six package counts staying right is what makes the sixth invisible. `app-core` went
92 → 130 at this merge, which is the kind of move a carried-forward composition hides.

## THE ENVIRONMENT IS NOT THE DECLARED ONE — read before running a gate

Found 2026-08-31 by a post-merge gate that came back RED and was **not** a code defect.

- `package.json` declares `"engines": { "node": ">=22.0.0 <23" }`. CI (`.github/workflows/ci.yml:62`)
  uses `node-version: 22`. **This machine's default `node` is v24.11.1** — outside the declared range.
- There is **no `.nvmrc` and no `.node-version`**, so nothing pins a local shell to 22. The drift is
  silent and permanent until someone adds one. *(Recorded as a pending item below; the controller does
  not implement.)*
- `better-sqlite3@11.10.0` is a **native** module. Its binding matches whichever Node last rebuilt it —
  ABI **127** = Node 22, ABI **137** = Node 24. Under the wrong one, `@gisik-nokma/sync-client#test`
  fails 4/8 with `NODE_MODULE_VERSION` and **looks exactly like main being red.** It is not.
- Fix: `nvm use 22 && pnpm rebuild better-sqlite3`, then gate. **The main worktree's binding is currently
  built for ABI 127 (Node 22)** — correct, and it means a gate run there under Node 24 will now false-red.
- Each worktree has its own `node_modules`, so lanes are isolated — which is the hazard: **two sessions
  can certify the same code under different Node majors and both report green.** A gate result is not
  evidence unless it names its Node.

This is the same class as the TZ finding one level up. The coordination doc says *"the environment is a
fixture, and no test on `main` varies it."* It is worse than that: the environment is not even the
**declared** fixture, and nothing in the repo makes it be.

## Role and authority

Controller of a **two-session serial topology**: this session plus one executor. The wave schedule is
superseded (see the coordination doc's serial-execution section).

- **The controller merges the executor's work and NEVER its own.** Its own doc PRs go to the owner. This
  is the check the two-session split exists to provide.
- Auto-merge is re-granted: a PR that passed its machinery **and** an independent CI run green merges
  without a per-PR ask. `gh pr checks <n>` — **pending is not green.** Prefer
  `gh api repos/<o>/<r>/commits/<head-sha>/check-runs` — it names the conclusion at the exact sha.
- The controller does **not** implement plan tasks, and does not re-review the executor's work.
- **Restart the executor at task boundaries.** This is a kill-and-relaunch from its brief, NOT a `/clear`,
  which is user-typed and cannot be issued to another session.

## The executor

- Session `gisik-nokma-exec-*`, tmux `gisik:exec`, worktree `/Users/kiro/my_projects/gisik-nokma-exec`.
- Brief: `gisik-nokma-lanes/dispatch-executor-serial.md` — **self-sufficient by design**; policy lives
  there, position lives in `docs/lanes/executor-state.md`.
- Relaunch: `tmux kill-window -t gisik:exec` then `tmux new-window -t gisik -n exec -c <worktree>` and
  `claude --model opus --permission-mode bypassPermissions "$(cat <brief>)"`.
- **Before restarting: the executor's handoff must be current on `main` and its anchors reachable.**
  Restarting against a stale handoff destroys what the restart was meant to preserve.
- Note `exec/06a-client-core` is checked out in `gisik-nokma-lanes/lane4-periphery`, not in the exec
  worktree. A branch checked out in another worktree cannot be deleted or checked out from here.

## Position in the serial sequence

**Phase 0 step 1 CLOSED** — Chain A merged (`6b2fc76`).
**Phase 0 step 2 CLOSED** — `exec/06a-client-core` merged as `c93c910` (PR #43). T9 reviewed, F1–F4 fixed,
scoped re-review run, its one "Critical" refuted with four experiments and the refutation independently
assessed before merge.

> **Reconciled, because it would otherwise fire deterministically:** the coordination doc's step-2 line
> *"at `8209397`, not at the branch tip"* is **SUPERSEDED**. It was written when T9 was unreviewed. T9 is
> now reviewed and its fixes applied, and the branch merged at its tip. Do not re-read that line as live.

**Step 3 is next: `exec/07-editor-client`.** Recon already paid for, do not pay again:
- **21 behind `origin/main`** — the brief's "13+ behind" is stale and understates it.
- `git merge-tree` reports **TWO** conflicts, not one: the coordination doc **and
  `packages/domain/src/index.ts`. The second is code.**
- Its **T4 scoped re-review was never dispatched**, so every surface says complete except the gate.
  Review first, then merge.

Full sequence in the coordination doc's `## Serial execution` section, which is the authority.

## Standing owner rulings currently in force

- **Fable is not dispatched, for any role.** Sonnet default, opus by exception, hard cap **6 subagents per
  task**, one fan-out per plan, judgment fan-outs withdrawn. Cost ledger of what this trade has already
  cost is in the ruling — **add to it, do not re-argue it.** Note fable was the **premium** tier the
  ruling replaced with opus as "the ceiling" — not the cheap one. A controller got this backwards once.
- **CSRF ruling**: Plan 4 T5 owes HTTP-Origin on cookie-authenticated routes, `sameSite` set explicitly,
  and a sentence naming that the cookie assertion forbids a `Domain` attribute.
- **Plan 10 T4 is lifted to Phase 1** — the §11 envelope-origin closer. `fc904f4` closed only the client
  door.
- **Ruling P17** (new, this merge): `useLiveQuery(source, workspaceId, queryKey, load, debounceMs)` is a
  **breaking** signature change binding Plan 6 T10–T13 and Plan 10. Its unstated invariant — *the key must
  name every input `load` closes over* — is enforced by nothing.
  **P17's own "eight call sites" was wrong — there are NINE**, corrected in place by PR #45. The
  controller's dispatch said four. Both counts were wrong and the five neither named (5514, 6390, 6391,
  6395, 6396) sit in Tasks 11–13 — the only tasks not yet written, i.e. the ones that will be transcribed
  from that text. **A count asserted in two places can be wrong in both; recount from the file.**

## Traps that cost a round each if rediscovered

1. **Two "origin checks".** HTTP `Origin` header (CSRF) vs the event-envelope `origin` provenance enum.
   They meet in Plan 4 T5. Always say **envelope-origin** or **HTTP-Origin**.
2. **`docs/plan-3-chain-b-handoff.md` is read BEFORE Plan 3 Task 12, not during** — two tenancy hazards
   converge there, one a total outage presenting as a data problem.
3. **Clock tests: varying `TZ` is necessary and NOT sufficient.** Under vitest's `threads` pool,
   `process.env.TZ = zone` **does not move the clock** — a worker thread gets no process-level
   reconfiguration. T9's three zone tests were 32/32 green while the zone never moved. **A test that
   varies an ambient setting must also assert that varying it does something.** Binds Plan 9's Calendar
   and Timeline. Recorded as a ruling in the coordination doc at this merge.
4. **The integration checkpoint no longer fires** — replacement trigger is the Phase 2/3 boundary.
5. **A pre-ruling covers *who*, not *what*.** Reading "a pre-ruling covers this" and skipping the thought
   is the trap.
6. **A native-module false red.** See the Node section above. `sync-client` failing 4/8 is an ABI
   mismatch, not a defect.

## Method rules this role keeps breaking

Every one below was violated by a controller that had just written it. **Assume you are the next.**

- Never run a state-changing git command in a shell whose cwd was set for a read — use `git -C`. Violated;
  it swapped a live lane's worktree for 26 seconds and contaminated a running review.
- **A gate's exit code is the LAST command's exit code.** The known form is the pipe (`| tail` reports
  `tail`'s status). It was re-hit 2026-08-31 in a new costume: a trailing `echo` made the harness report
  **"exit code 0"** for a gate whose summary said `Tasks: 11 successful, 18 total / Failed:
  sync-client#test`. **Read the `Tasks:` line. It is the only honest signal.** Write the exit code INTO
  the log (`echo "TURBO_EXIT=$?" >> log`), never after a pipe.
- A rule does not reliably fire on its author. **The executor caught three controller errors on its first
  day**, each in an artifact the controller had just written *and verified*.
- Over-caution has a price here. Blocking a restart on a documentation merge spends session carriage —
  66% of all spend — to protect against a risk already closed.
- **A pointer from a correct document to a stale one does not drift; it reverses, deterministically.**
- **Verify a count by enumerating and marking, with the marker string counted as a control** so a zero
  cannot come from a sweep that matched nothing. Method from the executor, after the controller and
  Ruling P17 asserted two different wrong counts for the same thing.
- An artifact's author is the worst-placed party to report its contents. *(Corollary earned this merge:
  verifying an author's claims is cheap and it worked — every claim in the PR #43 handoff held, including
  four shas my naive `--contains` sweep called orphaned that the file itself labelled "do not cite".
  **A sweep that cannot tell "cited as live" from "marked dead" produces false defects.**)*

## The watch monitor — do NOT re-arm it blindly

A persistent monitor runs on `origin/main`, the open-PR set, and tmux pane membership. **It survives
`/clear`** — it is a shell child of the session process, and `/clear` ends the context, not the session.
Confirmed by observation 2026-08-31: it fired the `60bc7ca` event into a freshly cleared context.

**Check before re-arming: `pgrep -fl prev_main`.** Re-arming a live monitor gives you two and duplicate
events on every merge. It emits only on change — long silence means nothing changed, not that it died.
Currently alive as **PID 78292**.

It costs **zero tokens** — a shell loop that wakes the session only on a real event. **If it is genuinely
gone**, re-arm change-triggered on a 180s poll against `git ls-remote origin main`, `gh pr list --state
open`, and `tmux list-panes -s -t gisik`.

Note its wording is one-directional: a pane being ADDED also reports "a lane may have exited."

## Pending owner decisions

1. **The executor's advisor is running on Fable.** Its status line reads `advisor: fable`. The ruling says
   *"Fable is not dispatched"* and names three **dispatch** roles; `advisor:` is harness session config the
   executor never chose (the relaunch command passes no advisor flag, and there is no `advisor` key in
   `settings.json` or the environment). **Scope question for the owner, not the controller** — trap #5 is
   deciding a ruling's scope yourself. Not blocking; killing a productive mid-task session over an
   ambiguity is the over-caution the ruling exists to prevent.
2. **No `.nvmrc` / `.node-version` exists** while `engines` demands `>=22 <23` and the machine defaults to
   24. A one-line file closes it permanently. Needs an owner to assign it — the controller does not
   implement, and it is not in any plan.

## Controller context discipline

Measured 2026-08-31: this role ran **655 requests at 404K average context, rising 165K → 609K per request
across the session** — worse than any session it was policing. **The controller is the most expensive
session in the topology and should restart itself at decision boundaries on the same terms it imposes on
the executor.** Its restart is owner-issued (`/clear`) or owner-relaunched; this file is what makes that
free rather than destructive.
