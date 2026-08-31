# Task 3 report — TicketState and the pure reducer

Branch `exec/03-tickets-hierarchy`, worktree `lane1-plan3`, base `f363b2f`.

**Commits**

| SHA | What |
|---|---|
| `67a8650` | `packages/domain/src/ticket-state.ts`, `packages/domain/src/workflow-helpers.ts`, `packages/domain/test/ticket-state.test.ts`, `packages/domain/src/index.ts` |
| `deb90ca` | Ruling P2: `packages/rule-engine/src/transition.ts`, `packages/rule-engine/fixtures/transition-refuses-a-stranded-ticket.json`, `docs/superpowers/plans/2026-08-20-00-series-coordination.md` (§1 discharge, same commit as the code) |

---

## What was built

### `packages/domain/src/workflow-helpers.ts`

`stateCategoryOf(def, stateId): StateCategory | undefined`. No equivalent shipped
anywhere (checked: the only category reads in `packages/domain/src`,
`packages/rule-engine/src` and `apps/server/src` are inline `.category`
comparisons in `validate-workflow.ts`, `transition.ts` and the fixture harness),
so it is new rather than a re-export. It is the ONE derivation of a ticket's
denormalized `stateCategory`: creation, transition, rebind and the
refresh-on-publish fold all go through it rather than reaching into `def.states`
themselves. It returns `undefined` rather than throwing because the four callers
mean four different things by a missing state, and each says so in its own
sentence.

### `packages/domain/src/ticket-state.ts`

- `TicketStateDeps` — `getTicketType(typeId)` and `getWorkflow(workflowId)`, the
  latter documented as a **pure by-id lookup** per Ruling P1, with the reason
  spelled out at the type (a rebind asks for a workflow the ticket is not on yet,
  so a loader that pre-selects "the ticket's workflow" resolves null and throws
  on the very event the migration exists for).
- `TICKET_EVENT_TYPES` — the ten types registered against `entityKind: 'ticket'`.
  `ticket-type.defined` is deliberately excluded and a test pins both facts.
- `applyTicketEvent(state, env, deps)` — the fold, throwing on replay-integrity
  breaks.
- `foldTicketToWorkflowVersion(state, target, getVersion)` — refresh-on-publish,
  over `foldStateIdForward`, with the hole/unmapped-drop distinction preserved
  and the transition log deliberately untouched.

No zod schema is declared in this file and no `as` / `as unknown as` cast appears
anywhere in the three new files (verified by grep). Every payload schema is the
shipped one.

### `packages/domain/test/ticket-state.test.ts`

23 tests, under `test/` (A1/BA-7), importing `../src/*.js` relatively.

---

## Deviations from the brief, each with its authority

| # | Brief said | Shipped | Authority |
|---|---|---|---|
| D1 | Test at `packages/domain/src/ticket-state.test.ts`, run as `vitest run src/…` | `packages/domain/test/ticket-state.test.ts`, imports `../src/ticket-state.js` | **A1 / BA-7** — all three vitest configs collect only `test/**/*.test.ts` |
| D2 | Transition-log entry `{ toStateId, actorId, seq, workflowVersion }`; test asserts that shape with `toEqual` | Entry is `{ toStateId, actorId, seq, workflowId, workflowVersion }`; four tests assert the five-field shape | **O-log-entry-workflowid / C-02**, `entity-state.ts:38` + doc comment `:14-23`. `entity-state.ts` was NOT edited. |
| D3 | `ticketTransitionedPayload` from `'./events/ticket-events'`, field `toStateId` | `ticketTransitionedPayloadSchema` from `'./workflow.js'`, field `to` | **A10 / BA-9 / O-transitioned-payload**, `workflow.ts:137-145`, and the controller's addendum. `ticket.workflow_rebound` keeps its genuine `toStateId` (`events/ticket-events.ts:97-100`); the log entry keeps its genuine `toStateId`. Three spellings, three layers, none unified. |
| D4 | `ticketWorkflowReboundPayload` used but never imported | Imported from `'./events/ticket-events.js'` | **BA-9** |
| D5 | `import { foldStateIdForward } from '@gisik-nokma/domain'` | `from './workflow.js'` | **A9 / BA-9** — the package root resolves to `dist/`; a source file self-importing it is a build-order cycle |
| D6 | `getVersion: (version) => WorkflowDef \| undefined`; test's `noIntermediates = () => undefined` | `=> WorkflowDef \| null`; `noIntermediates = () => null` | **A9**, verified fact: `foldStateIdForward`'s `intermediate` returns `null` |
| D7 | `WF2_DROPS_DOING` and the stranding fixture cast `as unknown as WorkflowDef` | Typed `PublishedWorkflowDef`, no casts | **A9**, verified fact: `stateMapping` lives on `PublishedWorkflowDef`, `hasStateMapping` is the shipped guard |
| D8 | `TicketState` written out inline "echoed for reference" | Imported from `'./entity-state.js'`; every field filled including `kind: 'ticket'` and `workspaceId: env.workspaceId` | **A17** |
| D9 | Step 6: "PASS (14 tests)" | 23 tests, recounted from what is written | Brief self-consistency item 2 (its own file had 13 `it` blocks) |
| D10 | Ruling 2's conservative option: DECLINE the `FoldedState` surface change and record the decline | Took the drop-the-version-clause option and recorded the resolution | **Controller Ruling P2**, which supersedes the conflict table's conservative default |
| D11 | Fold's hole error also read "cannot be folded forward" | Reads "cannot be walked forward"; only the unmapped-drop error says "folded forward" | Mine, to keep the two faults distinguishable at the assertion (the pre-check exists precisely because they are different faults) |

### Additions beyond the brief (all justified, none speculative)

- **`seq: 7` / `seq: 5` / `seq: 2` / `seq: 3` instead of `makeEnvelope`'s default
  `1`.** With the default, a reducer that hardcoded `seq: 1` would pass — a check
  that cannot fail. Mutation M2 proves it now can. C-02 makes `seq` load-bearing
  (RDU sorts by it under R2).
- **A distinct actor on the transition envelope** (`user-anselma`, vs the
  creator's `user-kiro`), so the entry is proven to record the mover rather than
  the creator.
- **Rebind branch tests — three of them.** The brief's test file has NO
  `ticket.workflow_rebound` coverage at all, leaving an entire reducer branch and
  the whole of Ruling P1 unproven. Added: the happy path (workflow, version,
  state, category move; **no** log entry appended); the P1 proof (a deps that
  serves only the ticket's own workflow refuses with a sentence that names
  `wf-support`, which is only reachable if the reducer asked for
  `payload.toWorkflowId`); and a rebind onto a state the target lacks.
- **A transition applied under a newer version than the ticket's.** The reducer's
  longest comment claims the entry's `workflowVersion` is `wf.version` and *not*
  the pre-spread `state.workflowVersion`. In every brief test those two coincide,
  so the claim was asserted by nothing. Mutation M3 now fails only because of this
  test.
- **A three-version fold** (`doing --v2--> review --v3--> todo`) — the series' first,
  which Plan 2 consequences §1 predicted would be where the stranded-copy defect
  becomes directly observable, and which proves the intermediate resolver is
  consulted rather than guessed at.
- **A hole-in-the-chain test**, distinguishing the two faults the pre-check exists
  to separate.
- **A `default:` branch test** (a non-ticket event type throws).
- **A `TICKET_EVENT_TYPES` test** against `domainRegistry`, pinning that every
  listed type is registered with `entityKind: 'ticket'` and that
  `ticket-type.defined` is not one of them.
- **`toBe` (identity) rather than `toEqual` for the three no-op paths** — duplicate
  collaborator add, `comment.added`, `attachment.added`. Stronger, and
  mutation-proven (M6, M9).
- **`messageOf()` helper.** Vitest's `toThrow('…')` is a *substring* match, which
  would let a truncated or reworded message certify itself. Every rejection test
  captures the error and asserts `err.message` with `toBe` against a **literal
  string** — never a constant — and the helper throws if nothing threw at all.

---

## Ruling P2 — what changed and what did not

`packages/rule-engine/src/transition.ts:65`, before:

> `Ticket ${ticket.id} sits in state "${resolved.unmappedStateId}" of workflow version ${ticket.workflowVersion}, which no longer exists in version ${latest.version} and no state mapping covers it.`

after:

> `Ticket ${ticket.id} sits in state "${resolved.unmappedStateId}", which no longer exists in version ${latest.version} and no state mapping covers it.`

with a comment at the site explaining why the clause went, citing
`workflow.ts:99-101`, so a later tidy-up cannot restore it without reading the
reason. `fixtures/transition-refuses-a-stranded-ticket.json`'s `expected.reason`
matches character-for-character.

- **Fixture COUNT unchanged at 61.** `ls packages/rule-engine/fixtures/*.json | wc -l` → 61;
  `fixtures.test.ts:14` still reads `toHaveLength(61)` and was not touched.
- **No engine test asserted the old string.** `grep -rn "sits in state"` over
  `packages/rule-engine/{test,src,fixtures}` and `apps/` found exactly two hits:
  the source and the fixture, both changed. `engine.test.ts` asserts the rule *id*
  (`stranded-state`), which is untouched.
- **No `Features.md` / `test-cases` edit needed.** Case **4.20**
  (`test-cases/04-workflow-engine.md:35`) describes the behaviour ("refuses as
  stranded rather than guessing") and does not quote the copy, so it stays
  accurate. `Features.md` contains no occurrence of "stranded" or "no state
  mapping". Checked, not skipped.
- **Plan 2's canonical copy table** (`docs/superpowers/plans/2026-08-20-02-workflow-engine.md:164`)
  still carries the old string and was deliberately **left unedited** — plan text
  is never the authority for shipped behaviour, and a landed plan document records
  what was decided then. The coordination-doc resolution says so explicitly so a
  reader of that table finds the supersession.
- **The coordination-doc discharge landed in the SAME commit** (`deb90ca`),
  appended to "Plan 2 execution consequences" §1 in the document's house style,
  with the original analysis intact above it. It records: the option taken and
  why, that the `FoldedState` break-version surface change **stays available** with
  the trigger that should reopen it, that folding back to the origin version
  remains forbidden, and that the same wording discipline now applies to
  `foldTicketToWorkflowVersion`'s own stranding error.

---

## Mutation proof

Nineteen mutations. Every one failed **at its own assertion**, not at setup.
Every restoration was verified with `git diff --quiet -- <file>` (exit status),
**never** a shell `diff` — the coordination doc records a false "identical" from a
proxied `diff` in this repo. Working tree is clean at the end (`git status --short`
prints nothing).

Harness (per mutation): apply with `perl -0pi -e`, abort if `git diff --quiet`
shows it did not apply, run
`pnpm --filter <pkg> exec vitest run <test path>`, then `git checkout -- <file>`
and re-check `git diff --quiet`.

| # | Mutation | Test that failed, and how |
|---|---|---|
| M1 | Drop `workflowId` from the transition log entry | 4 tests × `toEqual` on `transitions`: `[ … …(3) ]` vs `…(4)` |
| M2 | `seq: env.seq` → `seq: 1` | same 4 tests, `toEqual` on `transitions` |
| M3 | Entry stamped `state.workflowVersion` (pre-fold) instead of `wf.version` | only "a transition applied under a newer version stamps THAT version" — the test added for exactly this |
| M4 | `workspaceId: env.workspaceId` → `''` | creation `toEqual` |
| M5 | Rebind asks `deps.getWorkflow(state.workflowId)` (**Ruling P1**) | 3 tests; the P1 test at `toBe` — `'…workflow "wf-basic"…'` vs `'…workflow "wf-support"…'` |
| M6 | Rebind appends a log entry | rebind test, `toEqual` on `transitions` (2 entries vs 1) |
| M7 | `field_set` keeps the previous claimant | clearing test, `toEqual` on the claim |
| M8 | Collaborator add stops deduplicating | `['user-anselma','user-anselma']` vs `['user-anselma']` |
| M9 | `comment.added`/`attachment.added` return `{...state}` | identity assertion, `Object.is` |
| M10 | Fold early return `>=` → `>` | no-op test, `toBe` identity |
| M11 | Fold drops the hole pre-check | hole test at `toBe` — it got the *unmapped-drop* message, which is the exact confusion the pre-check prevents |
| M12 | Fold ignores `getVersion` (passes `() => null`) | three-version test throws instead of folding |
| M13 | Fold leaves `stateCategory` stale | 3 fold tests, `toMatchObject` |
| M14 | `stateCategoryOf` returns a hardcoded `'open'` | 4 tests: category assertions and the rebind-unknown-state throw stops throwing |
| M15 | Never-created guard message reworded | `toBe` on the full literal message |
| M16 | `default:` branch returns `state` instead of throwing | `messageOf` — "expected the call to throw, and it returned instead" |
| M17 | **Ruling P2** reverted — the false version clause restored | `packages/rule-engine/test/fixtures.test.ts`: `transition-refuses-a-stranded-ticket` → "reason mismatch" (61 passed, 1 failed of 62) |
| M18 | `TICKET_EVENT_TYPES` gains `'ticket-type.defined'` | registry test — `expected 'ticket-type' to be 'ticket'` |
| M19 | Creation tolerates a type bound to an unpublished workflow | `toBe` on the full literal message |

**Checks I could NOT falsify by mutation, and why that is acceptable:**
`kind: 'ticket'` on creation is guarded by the type system — `TicketState.kind` is
the literal `'ticket'`, so any other value is a compile error rather than a test
failure. It is still asserted by the creation `toEqual`. Reported rather than
shipped silently.

---

## Verification

```
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
pnpm turbo run build test typecheck        # from the repo root
```

```
@gisik-nokma/domain:test:       Tests  175 passed (175)      (13 files; ticket-state.test.ts = 23)
@gisik-nokma/rule-engine:test:  Tests  115 passed (115)      (4 files; fixtures.test.ts = 62 = 61 fixtures + the count gate)
@gisik-nokma/server:test:       Tests   93 passed  (93)      (14 files)
 Tasks:    9 successful, 9 total
```

No direct `npx vitest` was used for the gate; the filtered `pnpm --filter … exec
vitest run` calls were the red/green inner loop and the mutation harness only.

---

## Notes, concerns and things a later task should know

1. **A second accepted `ticket.created` silently resets the fold.** The reducer
   handles `ticket.created` before the never-created guard, unconditionally, so a
   duplicate creation event overwrites head state — losing the transition log,
   collaborators and every field claim. This follows the brief. Nothing in shipped
   code refuses a duplicate `ticket.created` today (`evaluate.ts`'s switch has no
   `ticket.created` case yet; Task 5 adds `checkTicketCreated`). **Task 5 should
   make refusing a create-for-an-existing-ticket explicit**, because the reducer is
   contracted to fold only accepted events and will not defend itself.
2. **Ruling P1 is now a written contract, not an inference.** `TicketStateDeps`'s
   doc comment states that `getWorkflow` is a pure by-id lookup and that every
   loader must serve any id asked for. **Task 10's `loadDeps` must read
   `toWorkflowId` off the rebound payload and `current.workflowId` otherwise**
   (C-07). The test "the rebind asks its deps for the workflow the PAYLOAD names"
   fails loudly if a later change reintroduces caller-side pre-selection.
3. **`Features.md` and `test-cases/` were deliberately not touched.**
   `test-cases/05-tickets-hierarchy.md:5` reserves ids **5.4–5.36 verbatim for Plan
   3's Task 14** and forbids anything else claiming them; `Features.md:49` scopes §5
   to the keystone. Task 14 catalogues `applyTicketEvent` /
   `foldTicketToWorkflowVersion` as cases 5.30–5.31 (C-09). Ruling P2's copy change
   needs no catalogue edit either (case 4.20 does not quote the copy). Checked
   against the workspace's same-change-set convention and found to be an explicit,
   documented deferral rather than drift.
4. **`transitions` ordering is the appender's responsibility, and this reducer
   appends in fold order.** Under R2, RDU sorts a copy by `seq` at the point of use,
   so ordering here is no longer load-bearing — but `seq` correctness is, and that
   is what M2 pins.
5. **`foldTicketToWorkflowVersion`'s `target` is typed `WorkflowDef`, not
   `PublishedWorkflowDef`.** `foldStateIdForward` narrows with `hasStateMapping`
   internally, so a `PublishedWorkflowDef` argument keeps its `stateMapping` at
   runtime without any cast at the boundary. Callers in Tasks 4 and 10 can pass
   either.
6. **`applyTicketEvent` does not parse `comment.added` / `attachment.added`
   payloads** — it returns head state untouched without validating. That is correct
   (the door already validated them via `parseEvent`), but it means a malformed
   comment body would fold silently in a fixture context that bypasses the door.
   Noted, not changed.
7. **The evidence-existence gate is Plan 7's, unconditionally.** The comment on the
   `comment.added`/`attachment.added` branch now cites **pre-flight ruling 5
   (2026-08-28)** by name rather than leaving Plan 2's "whichever lands second"
   clause reading live — closing the partial gap the conflict table recorded under
   `O-evidence-ownership`.
