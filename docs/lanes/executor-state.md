# Serial executor — live state

**This file is the restart surface.** A controller that kills and relaunches the executor from its
brief recovers only what is written here. Refreshed at every task boundary.

> **Warning about shas in narrative prose.** Every sha cited in any *narrative* document in this
> repo — including the dispatch brief, the Chain B handoff, and the coordination doc's own
> sections — is a fact about the moment it was written, not about now. This branch has been
> rebased; the pre-rebase shas that appear in the brief (`a7388ae`) and in
> `docs/plan-3-chain-b-handoff.md` (`11f1fb3`) are **orphaned by the rebase**. Anchors in the
> table below were verified with `git branch --contains` (empty output = orphaned), not with
> `git cat-file`, which passes on reflog-only commits.

## Live anchors — verified at the sha named, 2026-08-31

| Anchor | Value | How verified |
|---|---|---|
| Branch | `exec/03-tickets-hierarchy` | `git rev-parse --abbrev-ref HEAD` |
| HEAD | `c6b4e59` | reachable (`git branch -a --contains`) |
| Merge-base with `origin/main` | `308ee6e` — i.e. HEAD is a direct descendant | `git rev-list --left-right --count origin/main...HEAD` → `0 23` |
| Ahead / behind | **23 ahead, 0 behind** | same command |
| Remote | `origin/exec/03-tickets-hierarchy` = `c6b4e59` | pushed |
| Tree state | **clean** | `git status --porcelain` empty; verified byte-identical to the pinned baseline after the review fan-out |
| Pre-rebase HEAD | `a7388ae` — **orphaned, do not cite** | superseded by the rebase |

### Rebase verification (why this rebase is trusted)

`git range-diff 5f3a034..a7388ae origin/main..HEAD` reported **all 21 commits `=`** — content
identical, no hunk dropped or altered. This branch had previously eaten a bad rebase hunk
(`d349d41`, "A rebase kept both sides of an import hunk"), so the range-diff is not ceremony.

The coordination doc was the one file both sides changed. Post-rebase it is **3461 lines** =
3248 (main) + 213 (branch), and carries **both** sides: main's `## Serial execution` at line 835,
and the branch's `## Ruling P13` (3273), `## Ruling P14` (3341) and
`## A mutation that crosses a package boundary is inert…` (3399).

## Gate composition — recounted at `c6b4e59`

**Status: GREEN** after the P16 fix (below). It was RED on the bare rebase — not a flake, and not
present before it: a semantic collision the textual merge could not see.

| Measure | Value at this sha | How counted |
|---|---|---|
| Gate exit code | **0** | `pnpm turbo run build test typecheck --force`, redirected to a file — **not** piped. A piped gate reports the pipe's status; the first run of this gate returned "exit 0" from `tail` while turbo had failed. |
| Turbo tasks | **18 successful of 18**, 0 cached | same run |
| Tests | **815** = domain 263 + rule-engine 278 + server 143 + app-core 92 + ui 31 + sync-client 8 | summed from the six per-package lines in the same run |
| Fixtures on disk | **84** | `ls packages/rule-engine/fixtures/*.json \| wc -l` — counted from the directory, not from a tracker |
| Fixture gate assertion | 84 (`test/fixtures.test.ts:14`) | matches the directory |
| Fixtures on `origin/main` | 67 | `git ls-tree -r origin/main --name-only …` |

On the bare rebase, before the fix: 10 of 18 tasks, failing `@gisik-nokma/app-core#build` with
`src/precheck.ts(137,3): error TS2741`. The `ERR_IPC_CHANNEL_CLOSED` in that log was teardown cascade
from the build failure, **not** a test failure — server tests run alone passed 143/0.

**Fixture arithmetic reconciled.** The coordination doc says 67 → 84; the Chain B handoff says
70 → 84. Both are true and neither is an error: `origin/main` holds 67, earlier Chain A tasks added
3 (→70), and T8 added 14 (→84). Recounted from the directory at this sha.

## Where I am in the serial sequence

**Phase 0, step 1 of 16** — `exec/03-tickets-hierarchy` (Plan 3 Chain A, T3–T8). Rebase done, gate
green, T8 re-reviewed, PR OPEN and awaiting the controller. Nothing is in flight.

Remaining order is the coordination doc's `## Serial execution` section (line 835), which is the
authority. The dispatch brief is a copy of it and is advisory where they differ.

## Resolved this task (kept because the next reader needs the reasoning, not just the outcome)

**The app-core collision, and the canary it trips.** The rebase is textually clean and semantically
broken, in the way the coordination doc predicted for Phase 0 ("the collisions appear only once one
lands and the others rebase").

1. The branch's ruling P3 made `getTicketTypeDef` a **required** fourth `EngineContext` method.
2. `main` independently landed `packages/app-core/src/precheck.ts` (Plan 6a T6, `3fb22d3`), whose
   exported `contextFromCache` builds a **three**-method context. That is the build error.
3. `ClientStateCache` holds **no** ticket-type definitions, and every `getTicketTypeDef → null`
   path in the engine **refuses** (`ticket.unknown-type`, `hierarchy.parent-type-unknown`). So the
   obvious one-line fix — `async () => null` — would make the client manufacture a **false refusal
   out of absence**, the mirror of the invariant `precheck.ts` exists to hold.
4. **The larger half.** `precheck.test.ts` (~line 465) carries a deliberate `CANARY` that drives
   `contextFromCache` with `ticket.created` / `ticket.reparented` and asserts `{ refused: false }`.
   Its docblock says Plan 3 landing hierarchy checks must "break app-core loudly", and instructs
   that when it fires, `precheckParentTerminal` must route through the engine. **Plan 3 Chain A is
   that landing.** The canary is not collateral damage; it is doing its job, and its premise is now
   false. It must be replaced by an assertion of the new true property — not deleted, not loosened.

**RESOLVED — ruling P16**, recorded in the coordination doc in the same change set. A read-only
fan-out (4 opus lenses → 3 `fable` refuters → opus synthesis; 8 agents, ~1M tokens, 0 errors)
decided it. All three refuters returned `needs-amendment`, and the amendment mattered:

- **The method THROWS.** The codebase's own taxonomy (four existing implementations) already
  encodes the rule — `null` only where "this workspace has no such type" is TRUE of that store's
  world; a throw where the store does not exist. All three refuters attacked the throw specifically
  and it survived: no live client path reaches it, because `precheckEvent` routes only
  `ticket.transitioned` to the engine and `getTicketTypeDef` is reached only from the hierarchy and
  field checks.
- **The half the build error did NOT reveal, and the lenses initially got wrong:**
  `precheckParentTerminal`'s three `passed` exits had to become `not-evaluated`. Coordination §12
  claim 2 **pre-ruled this exact moment** — *"The moment Plan 3 lands rank, cycle, deepest-rank and
  cross-project checks as engine cases, that `passed` violates the scope sentence above."* Two lenses
  wanted to scope it out; every refuter called that fatal, and the code agrees more sharply than the
  claim did: `hierarchy.ts:84` resolves the ticket's own type *ahead of the no-parent branch*, so the
  unconditional `passed` for a parentless create was **false**, not merely unproven.
- **The canary is superseded in place** — not deleted, not greened — and re-aimed at the next drift,
  pinned so it goes red in both directions. Its firing mechanism is recorded honestly: it tripped at
  the type door, **not** on the arrival of a rule as its author expected.
- **Verified by mutation, not by reasoning.** Reverting the throw to `null` turns the successor red
  at its own site with `rule: "ticket.unknown-type"` — the false-refusal-out-of-absence. Restored and
  confirmed by `git diff`, never by shell `diff`.
- **Two stale claims repaired** that no lens caught until the refuters swept: `Features.md`'s canary
  sentence and gate count, and `packages/rule-engine/test/fields.test.ts`'s comment asserting the
  fixture harness "THROWS by design" — falsified by **this branch's own T8**.
- **Deferred with named owners** (not fixed here): the cache ticket-type store (Plan 6a), its
  producer (Plan 6 T7), routing `precheckParentTerminal` through the engine (Plan 6 T7, blocked on
  both), Plan 10's replica inheriting the same deferral, and server T12. §12 claim 1 stays OPEN.
- **The interim gap this PR opens, stated rather than buried:** until that routing lands, creates and
  reparents lose their accept preview entirely — only the parent-terminal refusal survives. A real
  regression on the surface `app-core` exists to provide, in the safe direction (defer to the
  server), and the controller should see it before merging.

## Open rulings / items for the controller

- **The brief's "complete and reviewed clean at `a7388ae`" is contradicted by the repo's own
  document.** `docs/plan-3-chain-b-handoff.md` states T8's task review **had not returned** when the
  lane wound down, and records a **contamination window** (26s, 13:24:42–13:25:08 on 2026-08-31)
  during which a sibling controller checked this worktree out to another branch while T8's reviewer
  was running. Its instruction: *"Whoever resumes should re-verify T8's file-based findings rather
  than treating that review as clean — or simply re-run it."* Per the brief's own precedence rule
  (the document wins), **T8 takes a scoped re-review before this PR is auto-merge-eligible**, run
  against the rebased tree so it reviews what actually merges.
- **The whole-branch review fan-out has not run** for Plan 3 and is not planned at this step: it
  attaches to the *plan's* PR eligibility, and Plan 3 still has Chain B (T9–T14) outstanding.
  Recorded so the controller does not read this PR as carrying one.
- **Auto-merge eligibility is the controller's call**, on the facts above. This PR is offered as a
  review ledger, not as a "reviewed clean" claim.

## Method notes earned this session (cheap to re-learn, expensive to rediscover)

- **A piped gate reports the pipe's exit code.** `pnpm turbo … | tail` returned exit 0 while
  `Tasks: 10 successful, 18 total / Failed: app-core#build`. The harness reported "exit code 0" and
  it was true of `tail`. Read the summary line; never trust the status of a pipeline.
- **cwd persists between Bash calls.** A `cd apps/server` for a read left every later relative path
  resolving in the wrong directory — the brief's "never run a state-changing git command in a shell
  whose cwd was set for a read", met in its read-only form first. Use `git -C` / absolute paths.
- **An unquoted `--include=*.ts` was eaten by zsh** and the sweep returned "no matches found" rather
  than an error. Re-run quoted, with a positive control from the same run.

## Task 8's re-review — done, and it found things

Run because `docs/plan-3-chain-b-handoff.md` says T8's first review never returned and was
contaminated, while the dispatch brief called Chain A "reviewed clean". The document wins. Three
lenses → `fable` refuters; six findings, one refuted, five upheld.

- **Fixed:** `reparent-legal-grandchild-up.json` claimed its ancestor walk "actually walks" while
  moving a grandchild under the ROOT grandparent — one iteration. Two mutations that the note
  describes as its target both left the suite green. Restaged four deep so the move lands under a
  non-root; both mutations now die naming this fixture. Count unchanged at 84.
- **Recorded, owner Plan 3 T14:** `hierarchy.rank` and `hierarchy.deepest-rank-parent-required` are
  pinned end-to-end only on the CREATED path; and eleven refusal ids lack an end-to-end fixture where
  commit `646939c` named four.
- **Recorded, owner workspace/Plan 11:** no test cites a catalogue case id, so a ✅ outlives the test.
- **The executor's own error, recorded because it will recur otherwise:** the review dispatch told
  agents read-only *and* how to restore what they mutated — concurrent mutation on a shared tree,
  which the standing rule forbids. A lens caught it and filed it BLOCKING, correctly. Nothing was
  corrupted (anchor guards, same-run positive controls, md5 restores, and the tree verified identical
  to baseline afterwards), and the certifying gate predates the fan-out — but the next mutating
  fan-out gets a worktree per agent. **"Read-only" in a prompt is not read-only if the same prompt
  explains how to restore.**

## Next up

Phase 0 step 2: `exec/06a-client-core` at `30e3db4` — T9 + STATE file only, **unreviewed**, needs a
full review before its PR. T6 already merged as `3fb22d3`. Note the brief and the coordination doc
differ here (the doc says merge at `8209397`); the brief is the later fact and T6 is demonstrably on
`main`. Then step 3: `exec/07-editor-client`, whose T4 scoped re-review was never dispatched.
