# Cross-lane controller — live state

**This file is the controller's restart surface.** A controller relaunched from
`gisik-nokma-lanes/dispatch-main-controller.md` recovers only what is written here. Refreshed at every
decision boundary.

> **Shas in narrative prose below are facts about when they were written.** Verify anchors with
> `git branch --contains` — empty output means orphaned. `git cat-file` passes on reflog-only commits and
> will lie. This file lives on `main` deliberately: an earlier handoff was tracked, pushed, and stranded on
> a branch that had already merged, so a restart read a copy 70 lines out of date. **Once the branch
> carrying a handoff merges, the next update branches off `main`.**

## Anchors — verified 2026-08-31

| what | value |
|---|---|
| `main` | `55ae0a1` |
| last forced gate | `6b2fc76` — 18/18, 0 cached, 0 replays, **815 tests** |
| gate composition | app-core 92 · domain 263 · rule-engine 278 · server 143 · ui 31 · sync-client 8 |
| collision surfaces | fixtures **84/84** · projections **2** (`entityHeads`, `workflows`) |
| open PRs | none at time of writing — **re-measure** |

**Re-measure everything above on resume.** Recount at the sha you report; do not carry a composition
forward — five of six package counts staying right is what makes the sixth invisible.

## Role and authority

Controller of a **two-session serial topology**: this session plus one executor. The wave schedule is
superseded (see the coordination doc's serial-execution section).

- **The controller merges the executor's work and NEVER its own.** Its own doc PRs go to the owner. This
  is the check the two-session split exists to provide.
- Auto-merge is re-granted: a PR that passed its machinery **and** an independent CI run green merges
  without a per-PR ask. `gh pr checks <n>` — **pending is not green.**
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

## Position in the serial sequence

Phase 0 step 1 done — Chain A merged (`6b2fc76`). Step 2 in progress: `exec/06a-client-core`, T9 reviewed
(4 Important, 6 Minor, `docs/lanes/plan-6a-t9-review.md`), fixes not yet applied, and **F4: that branch no
longer merges clean — `6b2fc76` rewrote the `Features.md` bullet T9 inserts beside.** Step 3 is
`exec/07-editor-client`, whose **T4 scoped re-review was never dispatched**, so every surface says complete
except the gate. Full sequence in the coordination doc.

## Standing owner rulings currently in force

- **Fable is not dispatched, for any role.** Sonnet default, opus by exception, hard cap **6 subagents per
  task**, one fan-out per plan, judgment fan-outs withdrawn. Cost ledger of what this trade has already
  cost is in the ruling — **add to it, do not re-argue it.**
- **CSRF ruling**: Plan 4 T5 owes HTTP-Origin on cookie-authenticated routes, `sameSite` set explicitly,
  and a sentence naming that the cookie assertion forbids a `Domain` attribute.
- **Plan 10 T4 is lifted to Phase 1** — the §11 envelope-origin closer. `fc904f4` closed only the client
  door.

## Traps that cost a round each if rediscovered

1. **Two "origin checks".** HTTP `Origin` header (CSRF) vs the event-envelope `origin` provenance enum.
   They meet in Plan 4 T5. Always say **envelope-origin** or **HTTP-Origin**.
2. **`docs/plan-3-chain-b-handoff.md` is read BEFORE Plan 3 Task 12, not during** — two tenancy hazards
   converge there, one a total outage presenting as a data problem.
3. **Zero of 48 test files vary `TZ`; seven are clock-sensitive.** Every day-boundary proof here is
   consistent with the property being false.
4. **The integration checkpoint no longer fires** — replacement trigger is the Phase 2/3 boundary.
5. **A pre-ruling covers *who*, not *what*.** Reading "a pre-ruling covers this" and skipping the thought
   is the trap.

## Method rules this role keeps breaking

Every one below was violated by a controller that had just written it. **Assume you are the next.**

- Never run a state-changing git command in a shell whose cwd was set for a read — use `git -C`. Violated;
  it swapped a live lane's worktree for 26 seconds and contaminated a running review.
- A rule does not reliably fire on its author. **The executor caught three controller errors on its first
  day**, each in an artifact the controller had just written *and verified*.
- Over-caution has a price here. Blocking a restart on a documentation merge spends session carriage —
  66% of all spend — to protect against a risk already closed.
- **A pointer from a correct document to a stale one does not drift; it reverses, deterministically.**
- An artifact's author is the worst-placed party to report its contents.

## Pending owner decisions

- None blocking at time of writing. **Re-measure**: `gh pr list --state open`.

## Controller context discipline

Measured 2026-08-31: this role ran **655 requests at 404K average context, rising 165K → 609K per request
across the session** — worse than any session it was policing. **The controller is the most expensive
session in the topology and should restart itself at decision boundaries on the same terms it imposes on
the executor.** Its restart is owner-issued (`/clear`) or owner-relaunched; this file is what makes that
free rather than destructive.
