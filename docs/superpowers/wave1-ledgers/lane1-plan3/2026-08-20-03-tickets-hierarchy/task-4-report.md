# Task 4 report — the in-memory `EngineContext`, and the fourth context method

Branch `exec/03-tickets-hierarchy`, worktree `lane1-plan3`, base `cf4bbc7` (Task 3 merged).

**Commit**

| SHA | What |
|---|---|
| `1417a4d` | `packages/rule-engine/src/memory-context.ts` (new), `packages/rule-engine/test/memory-context.test.ts` (new), `packages/rule-engine/src/engine.ts`, `packages/rule-engine/src/index.ts`, `packages/rule-engine/src/fixtures/harness.ts`, `packages/rule-engine/test/engine.test.ts`, `packages/rule-engine/test/version-map.test.ts`, `apps/server/src/engine-context.ts` |

---

## What was built

### 1. Ruling P3 — `EngineContext` widened additively (`packages/rule-engine/src/engine.ts`)

A fourth method:

```ts
getTicketTypeDef(typeId: string): Promise<TicketTypeDef | null>;
```

with a doc comment that records *why it is a fourth method and not a fourth answer
from `getEntityState`* (`'ticket-type'` is an `OtherEntityState` — `{ kind, id }` —
`packages/domain/src/entity-state.ts:49-53`), that promoting it into a real
`TicketTypeState` was the **rejected** alternative, that
`getEntityState('ticket-type', id)` keeps answering identity-only **forever**, and
that there are three implementations which must not drift.

### 2. `packages/rule-engine/src/memory-context.ts` (new)

`buildMemoryContext(seedWorkflows, events): MemoryContext` — reducer-backed, folding
every ticket event through the shipped `applyTicketEvent` and every publish through
the shipped `foldTicketToWorkflowVersion`.

Load-bearing properties, each stated at the code:

- **It is a SECOND context.** The module doc comment says so in its first paragraph
  and names all three reasons a merge breaks the suite: 61 fixtures + 30 harness
  tests bind to `buildInMemoryContext`; its prior-event dialect is deliberately not
  the domain schemas (`{ field }` not `{ fieldId }`, non-ULID ids, harness-only
  `stateId`/`stateCategory` overrides); and it carries `fx.memberships`, which a
  `(seedWorkflows, events)` signature cannot receive (**A15 / BA-6 / C-14**).
- **Mirrored semantics, deliberately copied and labelled as mirrored.**
  `getChildrenStates` → direct children only (`harness.ts:191-193`);
  `getWorkflowDef` → exact when a version is given, latest otherwise
  (`harness.ts:194-197`); "latest" is the **highest** version, mirroring
  `latestOf` (`harness.ts:161-167`) (**C-15**).
- **Refresh on publish** (design decision 10) through
  `foldTicketToWorkflowVersion`, only for tickets whose `workflowId` matches the
  published definition, with the intermediate resolver answering **by exact
  version or `null`**.
- **No evaluation.** Prior events are the already-accepted past; only a candidate
  goes through `evaluateEvent`, by the caller, against what this returns.
- `ticket-type.defined` folds **last-definition-wins** (types are events — this is
  what makes rank re-definition, and therefore Task 6's cycle, reachable).
- Event types outside the ticket vocabulary / `workflow.defined` /
  `ticket-type.defined` pass through untouched.

No `as` cast to make a shape fit appears in the module (the only cast is the
brief's own widening upcast `TICKET_EVENT_TYPES as readonly string[]`, which the
conventions explicitly permit). No local zod schema is declared; every schema is
the shipped one.

### 3. Three type-satisfying stubs, so the widening compiles everywhere

`getChildrenStates` is present in exactly four object literals assignable to
`EngineContext` (verified by grep over `packages/*/src`, `packages/*/test`,
`apps/*/src`, `apps/*/test`), so those four are the complete set of sites the
widening touches:

| Site | What I wrote | Why |
|---|---|---|
| `packages/rule-engine/src/fixtures/harness.ts:198` | **throws**, naming Plan 3 Task 8 and `applyPriorEvent` | Null there is the silent-wrong-verdict failure `harness.ts:168-183` warns about in its own voice: a rank check would refuse for a reason that reads entirely legitimate. Nothing calls it today, so no fixture or harness test moves. |
| `apps/server/src/engine-context.ts:96` | **returns null**, naming Task 12 and joining the "none may land without the others" set | Matches its two siblings (`getEntityState('ticket')` → null, `getChildrenStates` → `[]`). A throw on a live server turns an ingest into a 500; null makes the engine refuse with something that is TRUE of this server today. |
| `packages/rule-engine/test/engine.test.ts:68` (`spyContext`) | `vi.fn(async () => null)`, **not** added to `SpyCounts` | No rule reads a type definition yet, so a spy count would pin nothing. |
| `packages/rule-engine/test/version-map.test.ts:59` (`chainContext`) | `vi.fn(async () => null)` | Same. |

### 4. A comment correction the widening made necessary

`apps/server/src/engine-context.ts:59-63` shipped the sentence *"PLAN 3 TASK 12 is
where this grows real bodies: 'ticket' from proj_tickets, **'ticket-type' from
proj_ticket_types**"* — i.e. it pointed Task 12 straight at ruling P3's **rejected**
alternative. Comment-only edit: `'ticket'` keeps its promise, `'ticket-type'` is
removed from the list, and the replacement says explicitly that the union keeps
`'ticket-type'` as identity-only and that the definition arrives through
`getTicketTypeDef`, which Task 12 backs with `proj_ticket_types`. No behaviour and
no test changed.

---

## Deviations from the brief, each with its authority

| # | Brief said | Shipped | Authority |
|---|---|---|---|
| D1 | Test at `packages/rule-engine/src/memory-context.test.ts`, run `vitest run src/…` | `packages/rule-engine/test/memory-context.test.ts`, importing `../src/memory-context.js` | **A1 / BA-7** — all three vitest configs collect only `test/**/*.test.ts` |
| D2 | `import type { EngineContext } from './engine-context'` | `from './engine.js'` | **A7** — there is no `engine-context.ts` in this package |
| D3 | Three-method `EngineContext`; `getEntityState('ticket-type', id)` yields a def with `rank` | Fourth method `getTicketTypeDef`; `getEntityState('ticket-type', id)` answers `{ kind, id }` or null | **Controller ruling P3 / BA-4 / C-11 / C-15**. The brief's third test asserted `(await getEntityState('ticket-type','task')).rank === 5`, which is unimplementable without a cast and would diverge from the server. It became two tests: the identity-only boundary, and `getTicketTypeDef` |
| D4 | `ticket.transitioned` payload `{ toStateId: 'doing' }` (three occurrences) | `{ to: 'doing' }`; the helper's doc comment records that a `comment` would be `{ text }`, not a bare string | **A10 + Addendum 1** — both divergences, or neither |
| D5 | `const def = env.payload as WorkflowDef` | `workflowDefinedPayloadSchema.parse(env.payload)` | Binding conventions (no `as` to make a shape fit) **and** a live defect: `workflowDefSchema` strips `stateMapping`, so every refold across a dropped state throws. Mutation **M4** is the proof |
| D6 | `versionOf` returns `WorkflowDef \| undefined`, passed straight to the fold | Returns `PublishedWorkflowDef \| null` | **A9** verified fact — `foldStateIdForward`'s `intermediate` returns `null`; the brief's code does not compile |
| D7 | `Map<string, WorkflowDef>`, `seedWorkflows: WorkflowDef[]` | `PublishedWorkflowDef` throughout; params `readonly` | **A9** verified fact — `stateMapping` lives on `PublishedWorkflowDef`. A `WorkflowDef[]` argument still type-checks (the extra key is optional), so no later caller breaks, and a seed carrying a `stateMapping` is now expressible without a cast |
| D8 | `workflows` built as `new Map(seeds.map(wf => [wf.id, wf]))`, and `workflows.set(def.id, def)` on every publish | Seeds and publishes both go through one `recordWorkflow`; latest = **highest version** | **A15 / C-15** — the harness's `latestOf` scans for the maximum. The brief's version makes "latest" mean "last published", so an out-of-order publish answers a different question than the harness; and its seed constructor loses the older of two seeds sharing an id |
| D9 | Consumes line omits `foldTicketToWorkflowVersion` and `EventEnvelope` | Both imported and load-bearing | **C-01** — recorded as the contract fix the row asks for |
| D10 | "Expected: PASS (6 tests)" | **19 tests**, counted literally from the file | **Addendum 3** — resolve by literal count, never by deleting tests to match |
| D11 | Step 5 commit adds only three paths | Eight files (the widening plus its four implementation sites, one of them a comment-only correction) | Ruling P3's consequence; the widening cannot land without them and typecheck proves it |

### Additions beyond the brief

- **A no-evaluation test.** The brief calls "folded without evaluation" load-bearing
  and then asserts it nowhere. The test plants a transition into a state guarded by
  `require-comment` with no comment: the engine would refuse it, and the fold keeps
  it. Mutation M11 is a literal simulation of evaluation creeping in.
- **A `stateMapping` refold test** — the only test that catches D5's schema trap.
- **A hole test** — v2 never published, so folding v1 → v3 asks for it by exact
  number and reports a hole. Proves the intermediate resolver is a real lookup.
- **A cross-workflow test** — a publish refreshes only the tickets on that workflow.
- **A reparent test** — proves the whole ticket vocabulary folds, not the
  created/transitioned subset (and see the C-12 note below).
- **A transition-log test with `seq: 7` and a distinct `actorId`.** `makeEnvelope`
  defaults `seq` to 1, so a context that dropped the envelope and rebuilt it would
  pass every log assertion — Task 3's M2 lesson, carried forward. Mutation M13.
- **A membership/workflow-null test**, pinning the second-context boundary.
- **A `messageOf()` helper** — `toThrow('…')` is a substring match, so both throw
  tests assert the whole message with `toBe` against a literal.

---

## Mutation proof

Nineteen mutations, one per planted claim, each applied to production code and each
killing at least one test **at that test's own assertion**. Every restoration was
verified with `git diff --quiet -- <file>` (exit status) — **never** a shell `diff`,
which has returned a false "identical" in this repo. The working tree was clean
against the index after each.

**Harness note (a real methodology trap, recorded because it bit me):**
`memory-context.ts` was **untracked** for the first attempt, so `git diff --quiet`
reported "no change" for a mutation that had in fact applied, and the runner aborted
*before restoring* — leaving the mutant on disk. Fixed by `git add`-ing the new
files first, so the index is the restore baseline; the stray mutant was reversed and
the file re-verified clean and green before the series ran. An untracked file has no
`git diff` baseline: stage before mutating.

| # | Mutation (in `packages/rule-engine/src/memory-context.ts`) | Test(s) that failed, and how |
|---|---|---|
| M1 | `getChildrenStates` returns every ticket (filter dropped) | direct-children: `[PARENT, …(2)]` vs `[CHILD]`; reparent: same |
| M2 | An explicit version is answered with the latest | explicit-version: `'Basic v2'` vs `'Basic'` |
| M3 | Refresh-on-publish loop removed | 4 tests: re-categorise, stateMapping, hole ("expected the call to throw"), cross-workflow |
| M4 | `workflowDefSchema.parse` instead of `workflowDefinedPayloadSchema.parse` | stateMapping test only — `foldTicketToWorkflowVersion: … state "doing" is dropped with no stateMapping entry`. **The trap D5 names; no other test sees it** |
| M5 | `versionOf` answers "latest" rather than the exact version | explicit-version (`'Basic v2'` vs `'Basic'`) and hole (no throw) |
| M6 | Latest = last published (`workflows.set` unconditional) | highest-version test: `1` vs `2` |
| M7 | `ticket-type.defined` first-definition-wins | last-definition-wins: rank 3 vs rank 5 |
| M8 | `getEntityState('ticket-type')` returns the definition — the rejected alternative | identity-only test: `{kind, …(6)}` vs `{kind, id}` |
| M9 | `getTicketTypeDef` always null | last-definition-wins: `null` vs the def |
| M10 | Refresh ignores which workflow a ticket is on | cross-workflow: the support ticket throws `state "new" is dropped with no stateMapping entry` |
| M11 | The context evaluates its priors (a transition with no comment is skipped) | 7 tests, including the no-evaluation test at its own `stateId` assertion |
| M12 | Only `ticket.created` / `ticket.transitioned` fold | reparent: `[CHILD]` vs `[]` |
| M13 | Envelope rebuilt with `seq: 1` before the reducer sees it | transition-log `toEqual` |
| M14 | Every event type is pushed at the reducer | ignores-foreign-types: `applyTicketEvent: membership.granted … never created` |
| M15 | Seeds bypass `recordWorkflow` (registered in `workflows` only) | explicit-version (`undefined` vs `'Basic'`) and the maps test (`[]` vs `[1]`) |
| M16 | A membership is invented instead of declined | second-context boundary: `{kind:'membership', …}` vs null |
| M17 | The reducer's replay-integrity throw is swallowed | never-created test: "expected the call to throw, and it returned instead" |
| M18 | The "latest" lookup answers null | 4 workflow-resolution tests |
| M19 | A published version is folded but never recorded | folds-workflow.defined, explicit-version, highest-version |

**Every one of the 19 tests is killed by at least one mutation** (mapping: 1←M11;
2←M13; 3←M11; 4←M1; 5←M1,M12; 6←M8; 7←M7,M9; 8←M16; 9←M18; 10←M18,M19; 11←M2,M5,M15;
12←M6; 13←M3; 14←M4; 15←M3,M5; 16←M10; 17←M14; 18←M17; 19←M15).

**Two failures land as a throw from the code under test rather than an
`expect(...)` line** (M4 and M10): in both, `buildMemoryContext(...)` **is** the act
under test and the mutant makes the act throw. That is production code breaking, not
setup breaking — the failure names the mutated function and the exact ticket — but it
is disclosed rather than counted as an assertion-site failure.

**Checks I could not falsify by mutation:** none. The two stubs (harness throw,
server null) are not covered by a test — see "Concerns" below; they are scaffolding
for later tasks, not claims of this one.

---

## Verification

```
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
pnpm turbo run build test typecheck        # from the repo root
```

```
@gisik-nokma/domain:test:       Tests  175 passed (175)   (13 files)
@gisik-nokma/rule-engine:test:  Tests  134 passed (134)   (5 files; memory-context.test.ts = 19, was 115 before)
@gisik-nokma/ui:test:           Tests   31 passed  (31)   (3 files)
@gisik-nokma/app-core:test:     Tests    5 passed   (5)   (1 file)
@gisik-nokma/server:test:       Tests   93 passed  (93)   (14 files)
 Tasks:    15 successful, 15 total
```

The dispatch's "15/15 tasks green" is what the gate prints on this base (Task 3's
report says 9/9 because `packages/ui` and `packages/app-core` had not landed then).
`fixtures.test.ts` is unchanged: still 62 tests, still `toHaveLength(61)`, and no
fixture was added. No direct `npx vitest` was used; the filtered
`pnpm --filter @gisik-nokma/rule-engine exec vitest run test/memory-context.test.ts`
calls were the red/green inner loop and the mutation harness only.

Red phase, before the module existed:
`Failed to load url ../src/memory-context.js … Does the file exist?` — 1 file failed,
no tests collected.

---

## Notes, concerns and things a later task should know

1. **The harness's `getTicketTypeDef` THROWS, and that is deliberate.** It is the
   only one of the four sites where null would produce a *silent wrong verdict*
   rather than an honest one, and the harness's own memberships comment
   (`harness.ts:168-183`) is the precedent for calling that out. **Task 8** replaces
   it when it folds `ticket-type.defined` into `applyPriorEvent`; **Tasks 5–7 must
   not "fix" it by returning null** — a fixture that reaches a rank check with no
   type definition is a fixture whose harness needs extending, not a fixture that
   should be judged against a missing type. Neither this stub nor the server's null
   stub has a test: they are seams named in comments, matching the shipped precedent
   that `getChildrenStates`'s `return []` on the server has no dedicated test
   either. Disclosed rather than quietly shipped.
2. **C-12's parenthetical is stale in one clause.** It says "T6 must not
   additionally require `ticket.reparented` replay in priors, which T4's context
   does not fold." **This context does fold `ticket.reparented`** — the dispatch is
   over `TICKET_EVENT_TYPES`, which contains all ten ticket types, and a test pins
   it. A15's "what the harness lacks" list (which does include `ticket.reparented`)
   is about the *harness*, and the row appears to have carried that across. Task 6
   may replay reparents through `buildMemoryContext`; it may **not** through the
   fixture harness until Task 8.
3. **`Features.md` and `test-cases/` deliberately not touched.**
   `test-cases/05-tickets-hierarchy.md:5` reserves ids **5.4–5.36 verbatim for Plan
   3's Task 14** and forbids anything else claiming them; `Features.md` §5 is scoped
   to the keystone. Case **5.37** (the server's `EngineContext`) stays accurate: it
   describes what that context answers for tickets, memberships and identity-only
   kinds, none of which changed. Checked, not skipped — an explicit documented
   deferral, exactly as Task 3 recorded.
4. **`getWorkflow` in the reducer deps serves the LATEST version by id**, which is
   what the harness does and what refresh-on-publish keeps true (a ticket is never
   more than one publish behind). Ruling P1 is honoured: it is a pure by-id lookup,
   so a `ticket.workflow_rebound` naming another workflow resolves.
5. **Degenerate tie-break, recorded because it is a deliberate hair's-breadth
   divergence from the harness.** On two definitions of the *same* workflow *and*
   the same version, this context takes the **last** (`>=`), because its version
   list also replaces on equal version — the exact-version answer and the latest
   answer must agree with each other. The harness's `latestOf` uses strict `>` and
   would keep the first. Unreachable through a real ledger (a re-published identical
   version is refused upstream), and no fixture can express it.
6. **A second `ticket.created` still silently resets a ticket's fold** — Task 3's
   note 1, inherited unchanged here because this context folds accepted events and
   does not defend itself. Task 5's `checkTicketCreated` is where refusing a
   create-for-an-existing-ticket belongs.
7. **`buildMemoryContext` is exported from the package root**
   (`packages/rule-engine/src/index.ts`), unlike the fixture harness, which stays on
   its `/fixtures` subpath because it imports `node:fs` at module top level. This
   module imports nothing from `node:`, so the root export is safe for Plans 6 and 10.
