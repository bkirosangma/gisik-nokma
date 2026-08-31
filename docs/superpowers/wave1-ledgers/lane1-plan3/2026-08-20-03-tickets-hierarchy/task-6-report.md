# Task 6 report — hierarchy checks for `ticket.reparented`, the workflow-rebind checks, and the built-in rank lock

Branch `exec/03-tickets-hierarchy`, three commits on top of `4de901c`:

- **`144de0d`** — *"A reparent grafts an existing ticket, so the two refusals the create path was corrected for matter more here — and the brief carried both defects verbatim"* — all code, tests, fixtures, the count-gate bump and the catalogue.
- **`fb77315`** — *"Case 5.40 stated six order cases where seven exist, and credited the create path with the wrong one of them"* — catalogue-prose accuracy only, no code. Kept as a separate commit rather than an amend so the mutation evidence below keeps citing the tree it was actually run against.
- **`97ece79`** — *"Ruling P13: the third borrowed refusal in this plan…"* — the controller's ruling on Finding 3, applied. See **Appendix: ruling P13** at the end.

The catalogue (`Features.md` §5, `test-cases/05-tickets-hierarchy.md`) landed in `144de0d` alongside the code it describes, per the same-change-set rule; `fb77315` only corrects wording inside an entry that was already there.

---

## What was built

| File | What |
|---|---|
| `packages/rule-engine/src/checks/hierarchy.ts` | `checkTicketReparented` appended, plus `MAX_ANCESTOR_HOPS` |
| `packages/rule-engine/src/checks/workflow-rebind.ts` | **new** — `checkTicketWorkflowRebound` |
| `packages/rule-engine/src/checks/ticket-type.ts` | **new** — `checkTicketTypeDefined` (the built-in rank lock) |
| `packages/rule-engine/src/checks/refusals.ts` | three copy builders: `reboundSameWorkflowRefusal`, `reboundUnknownStateRefusal`, `builtinRankRefusal` |
| `packages/rule-engine/src/checks/test-support.ts` | `createdIn` and `OTHER_WS` hoisted out of `test/hierarchy.test.ts` |
| `packages/rule-engine/src/evaluate.ts` | three new dispatch cases |
| `packages/rule-engine/test/reparent.test.ts` | **new** — 24 `it` blocks |
| `packages/rule-engine/test/workflow-rebind.test.ts` | **new** — 11 `it` blocks |
| `packages/rule-engine/test/ticket-type.test.ts` | **new** — 7 `it` blocks |
| `packages/rule-engine/test/hierarchy.test.ts` | +1 `it` block (rider 1), imports switched to the hoisted helper — 25 total |
| `packages/rule-engine/fixtures/type-defined-refuses-builtin-rerank.json` | **new** |
| `packages/rule-engine/fixtures/type-defined-accepts-builtin-rebrand.json` | **new** |
| `packages/rule-engine/test/fixtures.test.ts` | count gate 62 → 64 |
| `Features.md` §5 | three new bullets |
| `test-cases/05-tickets-hierarchy.md` | 5.40, 5.41, 5.42 |

**Check order shipped for `checkTicketReparented`** (docstring pins it, seven tests falsify it):

kind guard → payload `safeParse` → unknown ticket → the ticket's own unknown type → (to project root) deepest-rank rule → self-parent cycle → unknown parent *(a foreign-workspace parent is one of these)* → cycle by ancestry walk → cross-project → parent's type unknown → rank → parent-terminal.

---

## Deviations, each with its authorising row

| # | Brief said | Shipped | Authority |
|---|---|---|---|
| D1 | `import { … } from './shared'` | `./refusals.js` + `./context-helpers.js` | **C-22**, **A7** |
| D2 | `import type { EngineContext, EngineVerdict } from '../types'` | `import type { Accept, EngineContext, Refusal } from '../engine.js'` | **A7**, Verified facts |
| D3 | `EventEnvelope`, `getTicketTypeDef`, `DEEPEST_RANK`, `deepestRankParentRefusal`, `rankRefusal` used unimported | all imported; `DEEPEST_RANK` from `@gisik-nokma/domain`, never restated | **C-22**, task self-consistency items 1 & 3 |
| D4 | `packages/rule-engine/src/checks/reparent.test.ts` | `packages/rule-engine/test/reparent.test.ts` (and the two new suites likewise) | **A1** — vitest collects only `test/**/*.test.ts` |
| D5 | `if (!parentType) return refuse('ticket.unknown-type')` | `refuse('hierarchy.parent-type-unknown')` | **Ruling P11 / Addendum 9** |
| D6 | `if (!newParent) return refuse('hierarchy.unknown-parent')` — no workspace guard | `if (!newParent \|\| newParent.workspaceId !== env.workspaceId)` , **before** the cross-project check | **Ruling P12 / Addendum 9** |
| D7 | `Expected: PASS (8 tests)` / `(10 tests)` | 24 blocks in `reparent.test.ts` | **Addendum 3 / 3a** — literal count wins, never delete |
| D8 | rank test `reparent(B, C)` in `chainCtx` | `reparent(B, D)` against a fresh context where D is B's **sibling** | see *Findings* §1 — the brief's staging is a cycle, not a rank violation |
| D9 | `ticketReparentedPayload.parse(...)`, no kind guard | `safeParse` → `malformed-payload` refusal, plus an `env.entity.kind` guard, on all three checks | **A19** and the pattern Task 5 shipped at `hierarchy.ts:48-71` |
| D10 | no tests for `workflow-rebind.ts` or `ticket-type.ts` | both have their own suite | binding conventions: every planted check mutation-proven, "add the test or delete the branch" |
| D11 | brief inlines the two rebound reason strings and the rank-lock string | three builders in `refusals.ts`, copy byte-identical | **C-27** (Tasks 5/6/7 each extend `refusals.ts`); Task 5's shipped pattern |
| D12 | (silent) | three `evaluateEvent` dispatch assertions added | see *Findings* §2 |

`type.builtin-rank`'s external citation at case **5.36** is untouched — Task 14 still owns 5.4–5.36, and nothing here writes into that range.

---

## Fixture stageability — the finding you asked for

**Both fixtures ARE stageable today. They are shipped.**

The reasoning, verified against shipped code rather than assumed:

- `packages/rule-engine/test/fixtures.test.ts:19` is `evaluateEvent(completeCandidate(fx), buildInMemoryContext(fx))` — only the **candidate** faces the engine.
- `applyPriorEvent` (`harness.ts:221-320`) handles **priors only** and throws on any type outside its five-type dialect, which does not include `ticket-type.defined`.
- Both fixtures have `"priorEvents": []` and a `ticket-type.defined` **candidate**, so `applyPriorEvent` is never called.
- `checkTicketTypeDefined` reads nothing from `ctx` (`_ctx` is unused by design — the seeds are constants and last-definition-wins means the type's own history says nothing about whether this definition is allowed), so the harness's deliberate `getTicketTypeDef` **throw** (Addendum 5) is never reached either.

**What is NOT stageable, and was correctly left to Task 8:** any `ticket.reparented` or `ticket.workflow_rebound` fixture whose ticket must exist. Its `ticket.created` prior *is* in the harness dialect, but the harness hardcodes `typeId: 'task'` (`harness.ts:238`) and `getTicketTypeDef` throws, so a reparent candidate that gets past `ticket.unknown` dies at the type lookup with a harness error rather than a verdict. (A reparent fixture for a *nonexistent* ticket would stage — it refuses `ticket.unknown` before any type lookup — but that is a fixture proving the least interesting branch, and it would move the count arithmetic other lanes are merging against. The dispatch wiring it would have covered is covered by unit tests instead; see *Findings* §2.)

### Fixture-count arithmetic (ruling 6)

- Counted from the directory at commit time: **62 before, 64 after**. Delta **+2**, stated in the commit message.
- Note for the controller's running total: ruling 6 tracks `61 → 63 after T6`. The base moved to **62** before this task (Task 5 shipped one fixture), so the correct running total is **62 → 64 after T6**.
- The plan's Step 4c prose names *three* acceptance scenarios for "a companion case" (built-in re-branded at its own rank, **and** a custom type re-ranked). Only two fixtures ship, keeping the tracked delta at 2; the custom-type-re-ranked acceptance is covered by `test/ticket-type.test.ts` instead, and it is mutation-constrained there (M14).

### Both fixtures are mutation-constrained (Addendum 2)

Neither merely agrees with the implementation:

- `type-defined-refuses-builtin-rerank.json` reds under **M13** (lock deleted → `expected refusal [type.builtin-rank], got acceptance`), **M15** (lock keyed on icon → same), and **M19** (rule id renamed → `expected rule "type.builtin-rank", got "type.builtin-rank-locked"`). The last is the Addendum-2 item-2 proof: it fails for the *named* rule, not merely "some refusal".
- `type-defined-accepts-builtin-rebrand.json` reds under **M14** (seed looked up as `[0]`) and **M15** (lock widened to icon) — `expected acceptance, got refusal [type.builtin-rank]`. It constrains the lock to *rank only*, which is the whole reason it exists.

Both failures land in `assertFixtureOutcome` on the fixture's own expected outcome, never at load or parse.

---

## Mutation proof

19 mutations, each applied to **production code only**, each run against the committed baseline `144de0d`, each restored with `git checkout -- packages/rule-engine/src` and verified with `git diff --stat` reporting **empty** (never a shell `diff`). Command in every case:

```
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
pnpm --filter @gisik-nokma/rule-engine exec vitest run <test file(s)>
```

| # | Mutation | Reds | Fails at |
|---|---|---|---|
| M1 | ancestor cycle walk disabled | 4 | `reparent.test.ts:126, 337, 417, 430` |
| M2 | reparent: parent-type guard hoisted above cross-project | 1 | `reparent.test.ts:474` |
| M2b | **create**: same hoist (rider 1's gap) | 1 | `hierarchy.test.ts:451` |
| M3 | reparent: `workspaceId` fold dropped from `unknown-parent` | 2 | `reparent.test.ts:217, 448` |
| M4 | parent-terminal verb pair `'move'` → `'add'` | 1 | `reparent.test.ts:369` |
| M5 | `ticket.stateCategory !== 'terminal'` dropped (over-refusal) | 1 | `reparent.test.ts:390` |
| M6 | the brief's P11 defect restored (`parent-type-unknown` → `ticket.unknown-type`) | 1 | `reparent.test.ts:245` |
| M7 | reparent deepest-rank `>=` relaxed to `>` | 1 | `reparent.test.ts:177` |
| M8 | `MAX_ANCESTOR_HOPS` 1000 → 3 | 1 | `reparent.test.ts:337` |
| M9 | rebind: same-workflow refusal deleted | 3 | `workflow-rebind.test.ts:95, 176, 193` |
| M10 | rebind: target resolved at version 1 instead of latest | 1 | `workflow-rebind.test.ts:74` |
| M11 | rebind: unknown-state check deleted | 1 | `workflow-rebind.test.ts:119` |
| M12 | rebind: `ticket.unknown` ordered after the target lookup | 1 | `workflow-rebind.test.ts:164` |
| M13 | rank lock deleted entirely | 3 (incl. 1 fixture) | `ticket-type.test.ts:27, 42`; `fixtures.test.ts:20` |
| M14 | seed looked up as `BUILTIN_TICKET_TYPE_SEEDS[0]` | 6 (incl. 2 fixtures) | `ticket-type.test.ts:27, 48, 86, 99`; `fixtures.test.ts:20` ×2 |
| M15 | lock widened from rank to icon | 5 (incl. 2 fixtures) | `ticket-type.test.ts:27, 62, 86`; `fixtures.test.ts:20` ×2 |
| M16 | `case 'ticket.reparented'` removed from dispatch | 1 | `reparent.test.ts:525` |
| M17 | `case 'ticket.workflow_rebound'` removed | 1 | `workflow-rebind.test.ts:193` |
| M18 | `case 'ticket-type.defined'` removed | 1 | `fixtures.test.ts:20` |
| M19 | `type.builtin-rank` rule id renamed | 1 | `fixtures.test.ts:20` |

Representative failing output, at the assertion (M2 — the reparent order pin):

```
 FAIL  test/reparent.test.ts > checkTicketReparented — which refusal names the event
       when two are available > a cross-project parent outranks an unreadable parent TYPE
AssertionError: expected { refused: true, …(2) } to deeply equal { refused: true, …(2) }
-   "reason": "The parent is in a different project. Pick a parent from the same project.",
+   "reason": "The parent ticket's type is not defined in this workspace, so there is no way
              to tell whether this ticket belongs under it. Pick a different parent.",
-   "rule": "hierarchy.cross-project",
+   "rule": "hierarchy.parent-type-unknown",
 ❯ test/reparent.test.ts:474:66
```

and M2b, which is rider 1 — the gap Task 5 left, closed:

```
 FAIL  test/hierarchy.test.ts > checkTicketCreated — which refusal names the event
       when two are available > a cross-project parent outranks an unreadable parent TYPE
-   "rule": "hierarchy.cross-project",
+   "rule": "hierarchy.parent-type-unknown",
 ❯ test/hierarchy.test.ts:451:82
```

**No mutation was found that the suite could not detect**, so nothing is reported as unfalsifiable. Restoration after every one: `git diff --stat -- packages/rule-engine/src` printed nothing, and the final `git status --porcelain` is empty.

**One mutation deliberately not attempted:** deleting the `MAX_ANCESTOR_HOPS` throw outright. It would hang the suite forever rather than fail, which is precisely the property the ceiling exists to provide; M8 (lowering the constant) falsifies the same code at the same assertion without that cost.

---

## Riders discharged

1. **Order-pin gap (Addendum 9a).** Closed by one hand-built context in `hierarchy.test.ts` — a parent whose type is missing **and** whose `projectId` differs — asserting `hierarchy.cross-project` wins. Proven by **M2b**. The reparent side gets the identical pin (M2), because the same hoist passed there for the same reason. The `parent-type` ↔ `rank` pair was not chased: the rank check reads `parentType`, so it is unstageable by construction.
2. **`createdIn` hoisted** from `test/hierarchy.test.ts:27` into `src/checks/test-support.ts`, with `OTHER_WS` alongside it — both suites need the identical constant, and two copies is how two suites start describing different tenancy. `hierarchy.test.ts` now imports both; its now-unused `EventEnvelope` type import was dropped.
3. **`type.builtin-rank` / case 5.36.** Not renumbered, not reused, not written by this task — 5.36 stays Task 14's slot and its external citation (coordination doc line 303) is intact. The seed lookup is `BUILTIN_TICKET_TYPE_SEEDS.find(s => s.id === def.id)` comparing `def.rank !== seed.rank`, and nothing reads `workflowId` or `fields` off a seed (**A18**).

**Coordination doc:** no edit was needed, and this was checked rather than assumed. Both claims-on-later-plans this task makes are **already recorded**: the rebound's admin gating at line 211 (*"`ticket.workflow_rebound` joined `ADMIN_ONLY_TYPES`"*), and the built-in rank lock with its case-5.36 citation at line 303. No new ruling was taken that a later plan depends on.

---

## Findings

### 1. The brief's rank test stages a cycle, not a rank violation — and it fails

`task-6-brief.md`'s Step 1 asserts `reparent(B, C)` refuses `hierarchy.rank`. In its own `chainCtx`, **C is B's child** (`created(C, 'task', B)`), so that move puts B inside its own sub-tree and the check correctly names the loop. Transcribed verbatim, the test fails:

```
-   "rule": "hierarchy.rank",
+   "rule": "hierarchy.cycle",
```

This is itself evidence for the doctrine the brief states two paragraphs earlier ("a loop is named as a loop even when rank is also violated") — the brief's own example contradicted its own ordering claim. Restaged against a fresh context where `D` is B's **sibling** under the same epic: `"Story" cannot go under "Task"`, no loop available.

### 2. Nothing tested the dispatch — deleting a `case` passed the whole suite

Every check test called its function directly. Before this task, removing `case 'ticket.reparented'` (or `ticket.workflow_rebound`) from `evaluate.ts` left a perfect, fully mutation-proven, **unreachable** check, and `evaluateEvent`'s pass-through default accepted every reparent and every same-workflow rebind. Three assertions now enter at `evaluateEvent` (M16/M17/M18 red them). Worth carrying to Task 7, which appends the same way.

### 3. `ticket.workflow-undefined` on the rebound path is a P11-class residual — flagged, then RULED (P13) and fixed

`checkTicketWorkflowRebound` refuses an undefined **target** workflow with `ticket.workflow-undefined`, whose canonical reason is:

> This ticket type's workflow has not been defined yet, so the ticket would have no status.

On this path the subject is wrong. The undefined workflow is the one the **payload names** (`toWorkflowId`), not the ticket **type's** binding — which may be perfectly well defined — so the sentence sends the actor to inspect a binding that was never the problem. That is structurally the same defect ruling P11 overruled for the parent's-type guard.

**Shipped as the brief and the plan specify, deliberately**, because three authorities settle it against changing: the plan's canonical refusal table (`2026-08-20-03-tickets-hierarchy.md:77`) lists this rule with this reason; the plan body uses it at this exact site (`:2221`); and Task 14's case **5.34** catalogues this rule id for this branch. Minting a new id would invent copy outside the canonical table and break a cross-task citation. Addendum 9 enumerated exactly two P11/P12 defects in this brief; this is a third, and it needs a controller ruling rather than an implementer's judgement.

**Suggested remedy if ruled on:** a `ticket.rebound-workflow-undefined` id with a reason naming the target — the same shape `hierarchy.parent-type-unknown` took. Task 14 would need 5.34 amended in the same change.

> **Ruled: P13, fix it** (controller, 2026-08-28). Applied in `97ece79` as `ticket.rebound-unknown-workflow`. My citation objection was **wrong and I should have checked it**: 5.34 is referenced only inside Plan 3's own document (`2026-08-20-03-tickets-hierarchy.md:5046`); the externally-cited ids are 5.27/5.30 (Plan 5) and 5.36 (coordination doc). The number stays and the description changes. Full write-up in the appendix.

### 4. The hop ceiling throws rather than refusing — recorded because it bends Task 5's doctrine

Task 5's `safeParse` comment states the rule: *"`evaluateEvent`'s frozen signature is `Promise<Accept | Refusal>` — a throw is neither."* `MAX_ANCESTOR_HOPS` throws anyway, and the brief specifies it. Shipped with the distinction written into the code: a malformed payload is the **actor's claim** and is refusable in the actor's language; an unterminating parent chain is the **store's state** — a cycle already standing in the tree, which this check is what prevents — so there is no true sentence to tell the actor, and `hierarchy.cycle` would name a loop that is not the one they proposed. Same doctrine as the reducer's throws (`ticket-state.ts:83-87`). Server-side this surfaces as a 500 on a broken ledger, which is the honest answer. Recorded so it is not rediscovered as an inconsistency.

### 5. P11's other half is *not* over-applied

`checkTicketReparented` still refuses `ticket.unknown-type` when it is the **moved ticket's own** type that is missing — there the sentence is exactly true and names the actor's real remedy. P11 rewrites only the **parent**-type lookup. Both halves are pinned by their own tests (`refuses when the PARENT exists but its type does not`, and `refuses ticket.unknown-type when it is the MOVED ticket's own type that is missing`), and **M6** proves they cannot be swapped unnoticed.

### 6. Rider ⚠️-3 (Task 4's review) was already discharged by Task 5

`SpyCounts` in `test/engine.test.ts:44-88` already carries `ticketTypeDef` in both `counts()` and `calls()`. Verified by reading, not assumed. No action.

### 7. Addendum 9a's own-entity sibling of P12 stays untouched

`getTicketState(ctx, env.entity.id)` in both checks has no workspace predicate. The rider ruled it non-blocking (ingest's G2 door answers `entity-workspace-mismatch` first; Plan 10's replica is workspace-scoped by construction), and it is recorded there so it is not rediscovered. Nothing was added, per that ruling.

---

## Verification

```
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
pnpm turbo run build test typecheck        # from the repo root
```

```
@gisik-nokma/domain:test:       Tests  175 passed (175)
@gisik-nokma/rule-engine:test:  Tests  210 passed (210)
@gisik-nokma/ui:test:           Tests  31 passed (31)
@gisik-nokma/app-core:test:     Tests  5 passed (5)
@gisik-nokma/server:test:       Tests  93 passed (93)
 Tasks:    15 successful, 15 total
```

**15/15 tasks green, 514 tests** (baseline on this branch was 469; +45 — 24 reparent, 11 workflow-rebind, 7 ticket-type, 1 hierarchy, 2 fixtures).

Literal `it`-block counts, per file (Addendum 3/3a — the brief's stated 8 and 10 are both below the literal, and nothing was deleted to meet them):

| File | `it` blocks |
|---|---|
| `test/reparent.test.ts` | 24 |
| `test/workflow-rebind.test.ts` | 11 |
| `test/ticket-type.test.ts` | 7 |
| `test/hierarchy.test.ts` | 25 (was 24) |

`packages/rule-engine/fixtures/*.json` → **64**. Working tree clean (`git status --porcelain` empty).

---

## Not verified

- **The server path.** All three checks are exercised only through `buildMemoryContext` and hand-built `EngineContext` literals. `apps/server/src/engine-context.ts` still answers `null` for `'ticket'` and throws nothing useful for type defs until **Task 12**, so no end-to-end ingest proof exists for any of them. `getTicketTypeDef`'s server implementation is Task 12's, and P12's `workspaceId` fold depends on Task 12's `rowToTicketState` populating `workspaceId` — Addendum 9 already flags that as a total-outage trap; this task adds a second consumer of that field.
- **Fixture coverage of reparent and rebind.** None ships, for the stageability reason above. When Task 8 extends `applyPriorEvent` with `ticket-type.defined` and `ticket.reparented` and gives the harness a `ticketTypes` map, the reparent cycle fixture the plan names (`reparent-cycle-after-rank-redefinition.json`) and the parent-terminal pair (`reparent-live-under-terminal-parent.json`, `reparent-terminal-under-terminal-parent.json`) all become writable. Task 14's cases 5.9, 5.21 and 5.22 cite those filenames.
- **`ticket.rebound-same-workflow` against real transition rules.** The refusal's justification is that the event would otherwise bypass `restrict-to`, `require-comment`, `require-evidence`, `require-field` and `require-different-user`. That is argued, not demonstrated — demonstrating it needs a fixture staging a guarded transition and a rebind that reaches its destination anyway, which is Task 8's territory (case 5.35 describes exactly that planted defect).
- **Finding 3 is now RESOLVED** — see the appendix below.

---

## Appendix: ruling P13, applied (`97ece79`)

**The ruling.** `checkTicketWorkflowRebound` must not refuse an undefined **target** workflow with `ticket.workflow-undefined`. The id is not wrong — it is exactly right on `ticket.created`, where a ticket has no workflow except the one its type names — but its *application* to the rebound path inherits a sentence whose subject is the ticket type's binding, which on a migration may be perfectly well defined and is beside the point. Same shape as P11 (`ticket.unknown-type` pointed at a *parent's* type) and P12 (a foreign workspace answered with a sentence about *projects*). Third instance in one plan.

**What shipped**

| File | Change |
|---|---|
| `packages/rule-engine/src/checks/refusals.ts` | `reboundUnknownWorkflowRefusal(workflowId)` minted, joining `reboundSameWorkflowRefusal` and `reboundUnknownStateRefusal`; its doc comment records what it replaced and why, as `hierarchy.parent-type-unknown`'s does |
| `packages/rule-engine/src/checks/workflow-rebind.ts` | `refuse('ticket.rebound-unknown-workflow', reboundUnknownWorkflowRefusal(p.toWorkflowId))`; the order docstring now says each step names its own subject |
| `packages/rule-engine/test/workflow-rebind.test.ts` | rewritten assertion, literals only |
| `test-cases/05-tickets-hierarchy.md` | **5.43** added (that file's own rule: refusals no plan document anticipated continue from the next free id), naming 5.34 as where Task 14 folds it |
| `docs/superpowers/plans/2026-08-20-03-tickets-hierarchy.md:5046` | **case 5.34's description corrected, number unchanged** |
| `Features.md` §5 | the workflow-migration bullet now names the refusal and its subject |
| `docs/superpowers/plans/2026-08-20-00-series-coordination.md` | new section recording P13, the three-instance pattern, and the two other findings — **in the same commit as the code** |

**The copy** (canonical-table voice; subject is the target workflow; both remedies available to the admin who alone may emit the event):

> The workflow "wf-ghost" is not defined in this workspace, so there is nowhere to move this ticket to. Pick a workflow that has been published, or publish that one first.

**Why 5.34 keeps its number.** Checked rather than assumed, which is the part worth carrying: 5.34 is cited only at `2026-08-20-03-tickets-hierarchy.md:5046`. The externally-cited ids are **5.27** and **5.30** (`2026-08-20-05-api-realtime-search.md:6158`) and **5.36** (coordination doc line 303). The never-renumber rule protects three ids in that section, not all of them. `test-cases/` records the behaviour at 5.43 rather than claiming a reserved id early — that file holds no 5.34 today, and its own scope note reserves 5.4–5.36 for Task 14 — with an explicit instruction that Task 14 fold 5.43 into the corrected 5.34 rather than catalogue both.

**The test now asserts the premise, not only the verdict.** The same context that refuses the migration resolves the ticket's own type binding (`task` → `wf-basic`), so a second assertion in the same block shows the migration onto a *defined* workflow accepted. That makes the old sentence demonstrably false *of the world it was told in*, rather than merely imprecise — which is the difference between a copy preference and a defect.

**Mutation proof** (baseline `97ece79`; command `pnpm --filter @gisik-nokma/rule-engine exec vitest run test/workflow-rebind.test.ts`; restorations by `git checkout -- packages/rule-engine/src` with `git diff --stat` empty, never a shell `diff`):

| # | Mutation | Reds | Fails at |
|---|---|---|---|
| M20 | the pre-P13 defect restored verbatim (`refuse('ticket.workflow-undefined')`) | 1 | `workflow-rebind.test.ts:113` |
| M21 | undefined-target check deleted (`return ACCEPT`) | 1 | `workflow-rebind.test.ts:113` |
| M12′ | (re-run) `ticket.unknown` ordered after the target lookup | 1 | `workflow-rebind.test.ts:178` |

M20's output — the proof that the assertion pins the *subject*, not merely "some refusal":

```
 FAIL  test/workflow-rebind.test.ts > checkTicketWorkflowRebound > planted defect: a rebound
       onto a workflow nobody defined names THAT workflow, not the type's binding
AssertionError: expected { refused: true, …(2) } to deeply equal { refused: true, …(2) }
-   "reason": "The workflow \"wf-ghost\" is not defined in this workspace, so there is nowhere
              to move this ticket to. Pick a workflow that has been published, or publish that
              one first.",
+   "reason": "This ticket type's workflow has not been defined yet, so the ticket would have
              no status.",
-   "rule": "ticket.rebound-unknown-workflow",
+   "rule": "ticket.workflow-undefined",
 ❯ test/workflow-rebind.test.ts:113:87
```

**Gate re-run after the fix:** 15/15 tasks green, **514 tests** (175 domain / 210 rule-engine / 31 ui / 5 app-core / 93 server). Fixture directory unchanged at **64**; the count gate was not touched, because no fixture was added.

**What P13 does not change.** `ticket.workflow-undefined` keeps its canonical reason and its correct site — `checkTicketCreated`, where the ticket type's binding really is the subject — and `test/hierarchy.test.ts` still asserts it there as a literal. Nothing outside Plan 3 moves.
