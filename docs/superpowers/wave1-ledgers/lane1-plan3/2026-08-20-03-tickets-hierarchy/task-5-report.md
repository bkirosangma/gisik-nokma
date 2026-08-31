# Task 5 report — hierarchy checks for `ticket.created`

**Branch:** `exec/03-tickets-hierarchy` · **Base:** `7e9854f` · **Commit:** `6c159df`
**Commits:** `6c159df` (the checks) and `3d616e1` (the check-order tests).
**Gate:** `pnpm turbo run build test typecheck --force` — **15/15 tasks green**.
Suites: domain 175, ui 31, rule-engine 161, app-core 5, server 93 — **465 passing, 0 failing**.

---

## 1. What shipped

| File | Status | What it holds |
|---|---|---|
| `packages/rule-engine/src/checks/refusals.ts` | new | `REFUSALS`, `refuse`, `ACCEPT`, `rankRefusal`, `deepestRankParentRefusal`, `parentTerminalRefusal`, `fieldKindRefusal` |
| `packages/rule-engine/src/checks/context-helpers.ts` | new | `getTicketState` (narrowing), `getTicketTypeDef` (over the fourth `EngineContext` method) |
| `packages/rule-engine/src/checks/test-support.ts` | new | `WS`, `PROJECT`, `PROJECT_B`, `WF`, `EPIC`, `STORY`, `TASK`, `SUBTASK`, `typeDefined`, `created` |
| `packages/rule-engine/src/checks/hierarchy.ts` | new | `checkTicketCreated` |
| `packages/rule-engine/src/evaluate.ts` | modified | `case 'ticket.created'` appended; `default: return { refused: false }` kept |
| `packages/rule-engine/test/hierarchy.test.ts` | new | **20 `it` blocks** in two describes: 16 on the individual refusals, 4 on the check ORDER |
| `packages/rule-engine/test/engine.test.ts` | modified | `SpyCounts` totality (rider) + one dispatch/ledger test |
| `apps/server/test/engine-context.test.ts` | modified | the server-side consequence of wiring the case (§5) |

**Module layout is exactly C-22's pin.** Nothing is in a module named `shared`. `DEEPEST_RANK` is
imported from `@gisik-nokma/domain` (`ticket-types.ts:70`) and never restated — a comment at the
call site says why a second `4` written down here would be a second chance for the floor to move on
one side only. Task 6 should read this layout as the contract and rewrite its `./shared` imports to
`./refusals.js` and `./context-helpers.js` (A7's closing clause).

### Check order as shipped

```
kind guard → payload parse → already exists → unknown type → workflow undefined
  → (root) deepest-rank rule
  → unknown parent → cross-project → parent's type → rank → parent-terminal
```

The brief's pinned relative order (`unknown type → workflow undefined → (root: deepest-rank) →
unknown parent → cross-project → rank → parent-terminal`) is preserved intact. Three checks are
added ahead of it (§3) and one — the parent's-type guard, which the brief's own Step 5 code contains
— is named in the docstring because it was previously undocumented and untested.

---

## 2. Deviations, each with the row that authorised it

| # | Deviation | Authority |
|---|---|---|
| D1 | Test lives at `packages/rule-engine/test/hierarchy.test.ts`, not `src/checks/hierarchy.test.ts`; imports are relative with the ESM `.js` suffix | **A1 / BA-7.** `packages/rule-engine/vitest.config.ts:5` collects only `test/**/*.test.ts`; the brief's explicit-path command would have hidden that the file never runs under `pnpm turbo run test` |
| D2 | No `EngineVerdict` anywhere. `refuse` returns `Refusal`, `ACCEPT` is `Accept`, both imported from `'../engine.js'` | **A7.** `EngineVerdict` and `src/engine-context.ts` do not exist; `engine.ts:3-11` is the home of `Accept`/`Refusal`/`Verdict`/`EngineContext` |
| D3 | `getTicketTypeDef` wraps `ctx.getTicketTypeDef(typeId)`, not `ctx.getEntityState('ticket-type', id)` | **A8 / BA-4 / ruling P3 / Addendum 6.** `'ticket-type'` is `OtherEntityState` — `{ kind, id }` — so the brief's wrapper cannot serve a rank |
| D4 | Step 7b's prior event is `payload: { to: 'done' }`, not `{ toStateId: 'done' }` | **A10 + Addendum 1**, and O-transitioned-payload names "T5 Step 7b (305)" by line. Transcribed literally, `applyTicketEvent` throws a `ZodError` in `buildMemoryContext` at *setup* and the test never reaches its own assertion |
| D5 | `checkTicketCreated` carries its own `env.entity.kind` guard | **A19**, dispatch instruction, precedent `transition.ts:11-28` |
| D6 | **`safeParse`, not the brief's `parse`** | Argued in §3.2. Authority is A19's two-layer precedent plus the frozen `Promise<Accept \| Refusal>` signature (`engine.ts` trailing comment) — *not* brief text. Disclosed as a deviation |
| D7 | **A new refusal, `ticket.already-exists`**, asked first | Task 3's review rider, routed into this dispatch. Argued in §3.1 |
| D8 | 20 `it` blocks, not the brief's stated 8/9/11 | **Addendum 3 / 3a.** Resolved by literal block count in the file written; no test deleted to reach a stated number. The brief's own self-consistency row already had it as "stated 10, actual 9 (really 8)" |
| D9 | `REFUSALS`' header and `checkTicketCreated`'s docstring both carry a Plan 4 cross-reference for the project-existence refusal | **O-project-existence** (owner decision 2026-08-26). No project check is implemented |
| D10 | `WF` in `test-support.ts` is typed `PublishedWorkflowDef`, not the brief's `WorkflowDef` | `buildMemoryContext(seedWorkflows: readonly PublishedWorkflowDef[], …)` (`memory-context.ts`), matching the shipped convention at `test/memory-context.test.ts:18`. The two are mutually assignable with no `stateMapping`, so Tasks 6/7 lose nothing |
| D11 | `apps/server/test/engine-context.test.ts` edited | §5. Not optional: the 15/15 gate fails without it |

**Not deviated from, deliberately:** the fixture harness's `getTicketTypeDef` still throws
(Addendum 5 — a `null` there is the silent legitimate-looking-but-wrong refusal). No fixtures were
added; `fixtures.test.ts`'s count gate is untouched at **62**. Every unit test runs against
`buildMemoryContext`, never the harness.

---

## 3. The three checks the brief did not ask for

### 3.1 `ticket.already-exists` — the duplicate-create rider, and the argument for its id and copy

**The defect.** `applyTicketEvent` handles `ticket.created` unconditionally
(`packages/domain/src/ticket-state.ts:95` — `if (env.type === 'ticket.created') { … return { … } }`,
never consulting the `state` parameter it was handed). That is what Task 3's brief specified and it
is right for a reducer: a projection replaying a ledger that already refused this event should not
carry a second opinion about it. But it means a **second accepted `ticket.created` for a ticket that
exists does not error and does not merge — it resets the fold**, discarding `stateId`,
`stateCategory`, `workflowVersion`, `assigneeId`, `collaboratorIds`, every `FieldClaim` and the
entire `transitions` log, which is the evidence `require-different-user` walks. Nothing shipped
refused it, and the reset leaves no trace: the ledger keeps both creates, the head state remembers
only the second.

**Rule id: `ticket.already-exists`.** Three candidates were weighed against the plan's own naming
style (`ticket.unknown-type`, `ticket.unknown`, `ticket.workflow-undefined`,
`ticket.rebound-same-workflow`, `hierarchy.*`, `field.*`, `type.builtin-rank`):

- `hierarchy.duplicate-create` — **rejected.** The namespace is by *subject*, not by which check
  raises it. This says nothing about the shape of the tree; it would be the only `hierarchy.*` id
  that is not about a parent/child relationship, and `checkTicketReparented` (Task 6) will never
  raise it.
- `ticket.duplicate-create` — **rejected.** Every other `ticket.*` id names a *state of the world*
  (`unknown`, `unknown-type`, `workflow-undefined`), not an act. "Duplicate create" names the actor's
  mistake; the vocabulary elsewhere names the fact that makes it one.
- **`ticket.already-exists` — chosen.** It is the exact mirror of the shipped `ticket.unknown`
  ("This ticket does not exist in this workspace."), in the same namespace, stating the same kind of
  fact from the other side. A reader who knows one knows this one.

**Reason: `'This ticket already exists. Creating it again would erase everything recorded on it —
open the existing ticket instead.'`** Written to the table's voice: a fact sentence, then the remedy,
the shape of `hierarchy.cross-project` ("The parent is in a different project. Pick a parent from the
same project.") and `field.title-required`. It names the **consequence** rather than the mechanism
because "that id is taken" tells a person nothing about what they nearly lost — and what they nearly
lost is the whole history of the ticket. "Open the existing ticket instead" is the only remedy there
is: creation is not retryable against an id that exists, and the actor's real intent was almost
certainly to look at what is already there.

**Position: first, ahead of `ticket.unknown-type`.** It is the only question about the event's *own
target* rather than about what its payload points at. A create for a ticket that exists is refused
whatever its type or parent would have been — so answering "your type is undefined" sends the actor
to fix the one thing that was never the problem. Pinned by its own order test (§4, M4), which fails
when the check is merely *moved* while every other test stays green.

**What the reducer is NOT asked to do.** The reducer stays unconditional. The alternative — making
`applyTicketEvent` throw on a duplicate create — would put the door in a projection replaying an
already-judged ledger, which is exactly the split of responsibility `ticket-state.ts`'s own header
argues against. The door belongs in the engine, and this is it.

### 3.2 `safeParse` instead of `parse`

The brief's Step 5 opens `const p = ticketCreatedPayload.parse(env.payload);`. A `parse` **throws**,
and a throw out of `checkTicketCreated` is a throw out of `evaluateEvent`, whose signature Plan 1
froze as `Promise<Accept | Refusal>` — a rejected promise is neither. The callers that reach this
check with nothing in front of it are precisely the ones the kind guard exists for: the fixture
suite and Plan 10's offline replica enter at `evaluateEvent` and never pass `parseEvent`'s door. On
the server the registered schema (`vocabulary.ts:74-78`) has already accepted the payload, so the
branch is unreachable there; everywhere else it is the difference between a refusal and a crash.

Mirrors `transition.ts:30-38` exactly, down to the sentence shape, and **mints no new rule id** —
it reuses Plan 2's `REFUSAL_RULES.malformedPayload`. Proven by M2: reverting to `parse` makes the
test fail with a raw `ZodError` escaping the check.

### 3.3 The parent's-type guard got a test

`if (!parentType) return refuse('ticket.unknown-type');` is in the brief's own Step 5 code and had
no test. `buildMemoryContext` cannot stage it — the reducer refuses to create a ticket of an
undefined type at all, and type definitions are never deleted — so it is pinned against a
hand-built `EngineContext` that holds the contradiction the reducer cannot. This follows the lane's
standing resolution of Task 7's self-consistency item 3: *add the test or delete the branch*. It
cannot be deleted (the rank comparison needs `parentType`), so it is tested. Falsifiable: M13.

---

## 4. Mutation proof — 25 mutations, every one falsifiable at its own assertion

Method: apply one mutation to production code, run the suite, confirm the **named** test fails at
**its own `expect`** (never at setup or import), restore with `git checkout --`, confirm
`git diff` for that file is **empty**. Restorations were verified with `git diff` and `git status`
only — **no shell `diff` was used anywhere in this task** (O-rtk-diff: an RTK-proxied `diff` has
reported "identical" for files that differed in this repo).

| # | Mutation | Test that went red | Failure at its assertion |
|---|---|---|---|
| M1 | delete the `env.entity.kind` guard | `a ticket.created that does not point at a ticket` | `expected { refused: false } to deeply equal { refused: true, …(2) }` @ `hierarchy.test.ts:195` |
| M2 | `safeParse` → `parse` | `a malformed payload REFUSES rather than throwing out of the engine` | `ZodError` thrown out of the check @ `hierarchy.test.ts:208` |
| M3 | delete the already-exists check | `creating a ticket that already exists…` **and** the order test | `{ refused: false }` @ `:226`; wrong rule @ `:238` |
| M4 | move already-exists **after** the type lookup (order only) | `says the ticket already exists before it says anything about the type` | wrong reason @ `:238` — the duplicate test itself stayed green, which is the point |
| M5 | unknown type → accept | `a type nobody defined` | `{ refused: false }` @ `:94` |
| M6 | undefined workflow → accept | `a type whose workflow is not defined…` | `{ refused: false }` @ `:103` |
| M7 | `rank >= DEEPEST_RANK` → `===` | `a CUSTOM type at the deepest rank…` | `{ refused: false }` @ `:166` — the rank-7 `Micro step` assertion, the standing guard for `>=` |
| M8 | delete the deepest-rank rule | `a sub-task without a parent` **and** the custom-type test | `{ refused: false }` @ `:65` and `:156` |
| M9 | missing parent → accept | `a parent that does not exist` | `{ refused: false }` @ `:86` |
| M10 | delete the cross-project check | `a parent from another project` | `{ refused: false }` @ `:78` |
| M11 | `type.rank <= parentType.rank` → `<` | `equal rank cannot nest either` | `{ refused: false }` @ `:57` |
| M12 | delete the rank check | `an epic under a story` **and** `equal rank…` | `{ refused: false }` @ `:48` and `:57` |
| M13 | parent's-type guard → accept | `refuses when the PARENT exists but its type does not` | `{ refused: false }` @ `:279` |
| M14 | delete the parent-terminal refusal | `creating live work under a finished parent` | `{ refused: false }` @ `:133` |
| M15 | name the state **id** instead of its **name** | same test | reason mismatch @ `:133` |
| M16 | fall back to the ticket id instead of its title | same test | reason mismatch @ `:133` |
| M17 | one word of the reopen remedy (`choose` → `pick`) | same test | reason mismatch @ `:133` |
| M18 | drop `getTicketTypeDef` from `counts()` again | `routes ticket.created to the hierarchy check, and the call ledger counts the type lookup` | `{ entityState: 1, …(3) }` mismatch @ `engine.test.ts:289` |
| M19 | `evaluate.ts` stops routing `ticket.created` | same dispatch test | `{ refused: false }` — the pass-through default |
| M20 | the final `return ACCEPT` refuses | **both accepting twins** | `{ refused: true } ≠ { refused: false }` @ `:43`, `:175` |
| M21 | the root `return ACCEPT` refuses | `accepts a task under a story, and a task at project root` | @ `:44` |

### 4b. The order property, which the first pass left unconstrained

Found on review before declaring done, and it is the exact failure mode Addendum 2 names — a suite
that **agrees with** the implementation without **constraining** it. `checkTicketCreated`'s docstring
pins a check order, and every one of the 16 tests above stages exactly ONE available refusal: the
cross-project parent has a legal rank, the rank cases sit in one project under an open parent, the
terminal-parent case is rank-legal, the workflow-undefined case uses a rank-3 type. **A check that
answered them in any order at all would have passed the whole suite** — so the shipped order was
documented and pinned by nothing.

Four tests now stage TWO simultaneous defects each and assert which refusal names the event, and
four reordering mutations prove them. Each mutation reorders and changes nothing else, so **only the
order test goes red — the other 19 stay green**, which is what shows these tests pin the order rather
than merely the presence of a refusal.

| # | Mutation | Order test that went red | What it pins |
|---|---|---|---|
| M22 | deepest-rank rule hoisted **above** the workflow lookup | `an undefined workflow outranks the deepest-rank rule` @ `:306` | workflow-undefined ≺ deepest-rank |
| M23 | unknown-parent hoisted **above** the workflow lookup | `an undefined workflow outranks an unknown parent` @ `:315` | workflow-undefined ≺ unknown-parent |
| M24 | parent-terminal moved **above** the rank check | `a rank violation outranks a finished parent` @ `:355` | rank ≺ parent-terminal |
| M25 | rank check moved **above** cross-project | `a cross-project parent outranks a rank violation` @ `:331` | cross-project ≺ rank |

Two adjacencies are ordered by construction and need no test: `unknown-type ≺ workflow-undefined`
(with no type there is no `workflowId` to look up) and `unknown-parent ≺ cross-project` (a parent
that does not exist has no project). `already-exists ≺ unknown-type` is M4.

**No check was found unfalsifiable.** M15–M17 exist because the copy *is* the deliverable: the tests
assert the fully-interpolated literal, never `REFUSALS[…]` or a call to a builder, so a typo in a
constant cannot certify itself. M20/M21 exist because a suite of refusals can pass by refusing
everything; the accepting twins are what stops that, and they had to be shown to constrain something.

**Staged-TDD evidence (the brief's own steps), all captured live:**

- Step 3 — `FAIL: Failed to load url ../src/checks/hierarchy.js` (module absent).
- Step 7 — `PASS (8 tests)`.
- Step 7b — `FAIL … expected { refused: false } to deeply equal { refused: true, …(2) }` @ `:131`.
- Step 7c — `PASS (9 tests)`.
- Step 7d — `FAIL` on the refusal test (`{ refused: false }` for `Checklist item`); the accepting
  twin already green, exactly as the brief predicted.
- Step 7e — `PASS (11 tests)`.
- Riders — kind guard + malformed payload: `2 failed | 11 passed` before, `13 passed` after.
  Duplicate create + order: `2 failed | 13 passed` before (`{ refused: false }` and
  `ticket.unknown-type` respectively), `15 passed` after.

---

## 5. A consequence the pre-flight table did not price: `ticket.created` is un-ingestible on the server until Task 12

A19 checked the dispatch addition against the **fixtures** ("no shipped fixture flips" — verified
again here: no fixture has a `ticket.created` candidate, 40 `ticket.transitioned` / 21
`workflow.defined` / 1 `comment.added`). It did not check the **server tests**, and one flips.

`apps/server/test/engine-context.test.ts`'s `beforeAll` ingested `[roleGatedWorkflow, ticketCreated]`
and asserted `['committed', 'committed']`. With the case wired, the server's `getTicketTypeDef`
answers `null` — its stub, by design (Addendum 5: null, not a throw, because a throw would 500 a
live ingest) — so the create is refused `ticket.unknown-type`.

**This is the seam working, not breaking.** `apps/server/src/engine-context.ts`'s own comment on
that method already promised it: *"the engine's hierarchy checks then refuse with 'no such ticket
type is known', which is TRUE of this server today."* Before this task the event fell through the
engine's `default` arm and committed unjudged; nothing consumed it, because `proj_tickets` does not
exist yet either. Nothing real regresses — but it is a fact the lane must carry.

The test now says so out loud (`['committed', 'refused']` plus the full refusal object) and plants
the ticket head row its first assertion needs. **The planted row is load-bearing**: that assertion's
falsifiability argument is "against the `as unknown as EntityState` body this file was written to
kill, a ticket **with** a head row comes back looking like a `TicketState` whose `workflowId` is
undefined" — and with no head row at all, the *buggy* body also returns null, so the test would have
gone on passing against the very defect it exists to catch. The test's title now says "a ticket that
HAS a head row".

**Routed to Task 12** (in the file, in the commit message, and here): once `getTicketTypeDef` reads
`proj_ticket_types`, a workspace that has defined `task` commits this create, the planted head row
goes away, and the expectation returns to `['committed','committed']`. It joins the two shipped
assertions A12/BA-3 already assigns that task. **Tasks 10 and 13 must also expect this** — any
server test that ingests a `ticket.created` through `ingestBatch` before Task 12 lands will be
refused `ticket.unknown-type`.

---

## 6. Riders discharged

- **Task 3's review — duplicate create.** Done; §3.1.
- **Task 4's review ⚠️-3 — `SpyCounts` totality.** `test/engine.test.ts`'s spy for
  `getTicketTypeDef` is now a named `vi.fn`, counted in `counts()` and summed in `calls()`; the two
  whole-object `toEqual` assertions at the stranding tests gained `ticketTypeDef: 0`; the comment
  that said "no rule reads a type definition yet" is rewritten to say this task is the first caller
  and that a spy which is not summed is a spy that has been switched off. One new test
  (`routes ticket.created to the hierarchy check, and the call ledger counts the type lookup`) makes
  the totality falsifiable — without it, dropping the key back out breaks nothing (M18/M19).
- **O-project-existence.** Cross-reference carried in two places (`REFUSALS`' header and
  `checkTicketCreated`'s docstring), naming Plan 4 and the 2026-08-26 owner decision. No project
  check implemented.

---

## 7. For Task 14 / the controller — things I did not do

1. **`ticket.already-exists` is a new user-visible refusal absent from the §5 catalogue.** This is
   the exact gap C-21 flagged for Task 4b's refusal, recurring. It needs a `Features.md` §5 line
   (the "Hierarchy sanity refusals" bullet is the natural home, or a new one) and a test-case id.
   **I did not touch `Features.md` or `test-cases/05-tickets-hierarchy.md`**, because ids 5.4–5.36
   are reserved verbatim for Task 14 and 5.27/5.30/5.36 are cross-plan citations. Task 14 must add
   it at 5.37 or later — **never by renumbering**.
2. **The `malformed-payload` guards on `ticket.created`** (wrong entity kind, malformed payload) are
   likewise uncatalogued. Lower stakes: the rule id is Plan 2's and already catalogued in §4.
3. **The server-side consequence in §5** deserves a line wherever the lane records cross-task
   obligations, so Tasks 10 and 13 do not each rediscover it in a red test.
4. **Tasks 6 and 7 will each append to `refusals.ts` and to `evaluate.ts`'s switch** (C-27). The
   switch cases are disjoint on `env.type`, so resolution is mechanical; `refusals.ts` appends at
   the end of the map and the end of the file.

## 8. What I could not verify

- **Nothing was left unproven in this task's own scope**, but only after a second pass: the first
  16 tests proved every individual refusal and left the check ORDER unpinned (§4b). That gap is the
  one worth carrying forward — a suite of single-defect cases cannot test an ordering, and this
  plan's checks are ordered on purpose. Tasks 6 and 7 inherit the same shape (`checkTicketReparented`
  has a longer order still, with the cycle walk in it) and should stage two-defect cases from the
  start rather than discovering the hole at the end. All 25 mutations went red at their own
  assertions; no check "agrees without constraining".
- **The parent-terminal refusal's server-side behaviour is untested end to end**, and cannot be
  until Task 12 (`getEntityState('ticket')` returns null today, so the parent never resolves). Task
  8 owns the fixtures; Task 12 owns the Postgres proof. The unit tests here run against
  `buildMemoryContext`, which is the reducer-backed context, so they cannot disagree with the
  server's fold — but they say nothing about the server's *reads*.
- **`checkTicketReparented`'s half of `parentTerminalRefusal`** (`move: 'move'`) is shipped but
  uncalled and untested — Task 6 owns it. It is exercised only through the `'add'` branch here. If
  Task 6 does not land, that branch is dead code with no test; flagging rather than deleting,
  because C-22 pins it as Task 6's contract.

---

# Fix round 1 — six review items, all addressed

**Commit:** `4de901c` (one commit: code, tests, catalogue and the coordination-doc routing together, per item 7's same-commit requirement).
**Gate:** `pnpm turbo run build test typecheck --force` — **15/15 tasks green**.
Suites: domain 175, ui 31, rule-engine **165**, app-core 5, server 93 = **469 passing, 0 failing**.
`test/hierarchy.test.ts`: **24 `it` blocks** (was 20). Fixture count gate untouched at **62**.

## Item 1 — RULING P11: `hierarchy.parent-type-unknown`

`hierarchy.ts:104-105` refused a missing PARENT type with `refuse('ticket.unknown-type')` →
*"This ticket's type is not defined in this workspace."* — false on the only path that can reach
it, because the ticket's own type resolved twenty lines earlier or control never arrives. The test
asserted that sentence as a literal, so **the suite certified the misleading copy as correct**. The
ruling is right and I did not re-litigate it; I had applied exactly this doctrine to
`already-exists` (`hierarchy.ts:15-19`) and not here, which is the worse kind of miss.

Minted in `refusals.ts`, sitting immediately after `hierarchy.unknown-parent`:

```
'hierarchy.parent-type-unknown':
  "The parent ticket's type is not defined in this workspace, so there is no way to tell whether
   this ticket belongs under it. Pick a different parent."
```

Voice check against the canonical table: fact, then remedy — the shape of `hierarchy.cross-project`
and `field.title-required`. **The subject is the parent**, because the parent is what is unreadable.
The middle clause is the honest consequence (the rank comparison is impossible, so the hierarchy
question cannot be answered at all), and the remedy is the only one the actor can act on **alone**:
they cannot define somebody else's ticket type, but they can choose a different parent. The
constant's doc comment records what it replaced and why, so nobody restores the borrowed sentence
for looking tidier.

`test/hierarchy.test.ts:298` now asserts the new rule and the literal reason, and that test's own
docstring records that it used to certify false copy.

## Item 2 — RULING P11b: the docstring carries the whole chain

`hierarchy.ts:8-25` never mentioned the parent's-type guard; `parentType` existed only in code. The
docstring now renders the order as a block, with the guard in its real position and the new
workspace clause named:

```
already exists → unknown type → workflow undefined
  → (root) deepest-rank rule
  → unknown parent (a parent in another WORKSPACE is one of these)
  → cross-project → parent's type unknown → rank → parent-terminal
```

Two paragraphs were added: why parent-terminal is last (its remedy is an *offer*, so placing it
earlier offers a reopen that does not work), and the doctrine itself — *every refusal in the chain
must be true on the path that reaches it, not merely true of something* — with `parent-type-unknown`
named as the case that was violating it.

## Item 3 — RULING P12: a cross-workspace parent, refused honestly and without the leak

Verified at source before implementing: `apps/server/migrations/1787847393435_proj-entity-heads.sql:11`
is `PRIMARY KEY (entity_kind, entity_id)` — **global, not per-tenant** — and `getTicketState`
(`context-helpers.ts:15-18`) is an id lookup with no workspace predicate. So a foreign parent
**resolves**, fell past `if (!parent)`, and was refused `hierarchy.cross-project` → *"The parent is
in a different project."* False twice (it is a different **workspace**, and its project is
unreachable either way), and it confirms to the actor that the ticket id exists somewhere they
cannot see. The ingest door's `ENTITY_WORKSPACE_MISMATCH_RULE` does not cover this: it guards the
event's **own** entity, never the parent its payload names.

```ts
if (!parent || parent.workspaceId !== env.workspaceId) return refuse('hierarchy.unknown-parent');
```

Written as **one statement**, deliberately: the two ways of not existing here get literally the same
answer, and structuring it as one guard is what stops a later reader from "improving" the foreign
case into something more specific. From this workspace's point of view "does not exist here" is not
a euphemism — it is the whole truth available.

Two covering tests. A pure one (foreign workspace, **same** project id, so only this guard can fire)
and an order one (foreign workspace **and** foreign project, so both refusals are available and the
test constrains which wins).

## Item 4 — M-2: `parentTerminalRefusal`'s `'move'` branch is now falsifiable

Kept, per C-22 — it is Task 6's import contract. But it is *copy*, which this plan calls a
deliverable, and I had applied "add the test or delete the branch" to the parent's-type guard and
not to this. Both verb pairs are now asserted as literals in a small `describe` of their own, so the
two **cannot be swapped unnoticed** — proven by M31, which swaps them and turns three tests red.

## Item 5 — M-3: Task 12's revert instruction is now mechanical

`apps/server/test/engine-context.test.ts` now numbers four steps that move together, and marks the
planted head row with the step that deletes it:

1. **ADD a `ticket-type.defined` event for `task` to the batch, ahead of the create** — without one,
   `proj_ticket_types` has no row to serve and the create is still refused for the same reason. *A
   context that can read the table is not the same thing as a table with the type in it.*
2. the expectation becomes `['committed', 'committed', 'committed']`;
3. **delete the refusal-object assertion** (the item the previous note omitted);
4. **delete the planted ticket head row** — the create writes it.

## Item 6 — M-4 + M-7: catalogue, and the off-by-one

**5.37 was already taken** by the keystone's engine-context case, and `test-cases/05-tickets-hierarchy.md`'s
own scope note says new cases continue from **5.38**. So the two new refusals are **5.38** and
**5.39**, and the scope note is updated to say the next free id is 5.40. **Nothing renumbered**;
5.4–5.36 untouched, 5.27/5.30/5.36 untouched. The note now also says explicitly that Task 14's list
already covers Task 5's *brief-mandated* refusals (5.7–5.11, 5.21, 5.23, 5.24), so only the refusals
this task **minted** are catalogued here — that is what keeps the two catalogues from double-claiming.

`Features.md` §5 gains a `✅ Hierarchy sanity refusals on creation` bullet naming the ordered chain,
both minted refusals with the reason each exists, and the Plan 4 cross-reference so the precondition
list does not read complete.

**Off-by-one fixed in all three places** — the `ticket.created` branch opens at
`packages/domain/src/ticket-state.ts:94` (verified: `grep -n` returns exactly line 94), not `:95`.
Corrected at `hierarchy.ts`, `refusals.ts` and `test/hierarchy.test.ts`.

## Item 7 — the Plan 10 claim, routed in the same commit

Added to `docs/superpowers/plans/2026-08-20-00-series-coordination.md` §7 ("Riders — smaller claims
on later plans, recorded so they are not rediscovered"), which is where this class already lives —
**not** to the gitignored ledger, per the item's own reasoning.

The claim states: `checkTicketCreated` is non-idempotent under re-evaluation; that is correct under
the engine's contract (an event already in the history is not a candidate); ingest is safe (it
evaluates once, before insert) and the fixture harness is safe (only `candidateEvent` faces the
engine); and **Plan 10's replica is the one caller that could re-judge**, named twice in this check's
own justifications as entering at `evaluateEvent` with no door in front of it. If it ever re-runs the
engine over **synced** events rather than only pending local ones, every re-judged `ticket.created`
is refused and *it will read as a hierarchy defect rather than a replay defect*. Plan 10 either
judges only pending local events or records why re-judging is safe. The generalisation is stated too:
the same shape applies to any later check that asks "does this already exist", and this is the first
in the series.

## Mutation proof — six more, total now 31

Same method and same discipline: break it, watch the **named** test fail at **its own `expect`**,
restore with `git checkout --`, confirm `git diff` for that file is **empty**. **No shell `diff`
anywhere in this round either.**

| # | Mutation | Test that went red | Failure at its assertion |
|---|---|---|---|
| M26 | parent's-type guard reverts to the borrowed `ticket.unknown-type` | `refuses when the PARENT exists but its type does not` | wrong rule + reason @ `:298` |
| M27 | parent's-type guard accepts instead of refusing | same test | `{ refused: false }` @ `:298` |
| M28 | cross-workspace clause dropped from the unknown-parent guard | `a parent in another workspace does not exist as far as this one is concerned` **and** the order test | `{ refused: false }` @ `:319`; `hierarchy.cross-project` — **the leak, reproduced** — @ `:413` |
| M29 | the comparison made vacuous (`parent.workspaceId !== parent.workspaceId`) | same two | same two failures |
| M30 | the parent-type reason's subject changed from the parent to the ticket | `refuses when the PARENT exists but its type does not` | reason mismatch @ `:298` |
| M31 | `parentTerminalRefusal`'s two verb pairs swapped | **three** tests: the `'move'` literal, the `'add'` literal, and the end-to-end terminal refusal | `Object.is` mismatch @ `:431` and `:437`; reason mismatch @ `:146` |

**Honest note on M29:** it is not fully independent of M28 — a self-comparison is always false, so it
exercises the same clause from the other side rather than a different property. It is recorded
because it was run, not because it adds coverage. The clause's own falsifiability rests on M28.

**M28 is the one worth reading.** With the workspace clause removed, the order test does not merely
go red — it comes back with `hierarchy.cross-project` and *"The parent is in a different project.
Pick a parent from the same project."*, which is the exact false sentence and the exact confirmation
of a foreign ticket id that ruling P12 exists to remove. The test reproduces the leak rather than
just noticing an absence.

## Not addressed, as instructed

**M-5** (the `already-exists` reason naming a consequence its own existence prevents) and **M-6**
(kind-guard vs payload-parse ordering, inherited from `transition.ts`) were left alone per the
round's explicit instruction.

## Concerns carried forward from this round

1. **`hierarchy.parent-type-unknown` and the cross-workspace behaviour are new cross-plan surface.**
   Task 6's `checkTicketReparented` has the same two guards on its own path (a parent's type it must
   read for the rank comparison, and a `newParentId` that can name a foreign ticket). Its brief will
   say `ticket.unknown-type` and will have no workspace guard at all. **Both rulings apply to it**,
   and the cross-workspace hole is arguably worse there — a reparent can move an existing ticket
   under a foreign parent, where a create only fails to make a new one.
2. **Task 12's `rowToTicketState` MUST populate `workspaceId`, or EVERY parented create refuses on
   the server.** The cross-workspace guard reads `TicketState.workspaceId`, which the memory context
   fills from the reducer. If the server's row mapper omits it, `undefined !== env.workspaceId` is
   *always* true — so every `ticket.created` naming any parent is refused `hierarchy.unknown-parent`.
   That is a total outage of parented creation that reads like a data problem, not a mapping bug.
   A17 already mandates the `workspace_id` column and requires `rowToTicketState` to repopulate what
   no DB column carries; this adds a second field to that list and a much louder consequence for
   missing it. Task 12 meets `engine-context.test.ts` first, so the routing is already in its path.
3. Items 1–3 of the first report's §7 still stand unchanged: the ingest consequence for Tasks 10/12/13,
   and Task 14's catalogue reconciliation against what 5.38/5.39 now occupy.
