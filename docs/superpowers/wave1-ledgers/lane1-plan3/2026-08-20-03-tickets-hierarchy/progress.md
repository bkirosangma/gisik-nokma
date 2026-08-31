# SDD ledger — plan: docs/superpowers/plans/2026-08-20-03-tickets-hierarchy.md

## ⚠️ SHA VALIDITY — read before trusting ANY commit hash below this line

**This branch has been rebased four times. Every per-task commit range recorded further down this file
is DEAD.** Tested, not assumed: of 32 shas cited in this ledger, **17 are orphaned** — unreachable from
both `HEAD` and `origin/main`.

**They are the dangerous kind of dead: they still resolve.** `git cat-file -e` passes and `git show`
succeeds, returning **pre-rebase content**. A resumer checking one would be silently handed a stale tree
rather than an error. Do not `git show` a sha from below this line. Use the table here.

**Live anchors (verified at write time):** merge-base with `origin/main` = `5f3a034` · `HEAD` = `11f1fb3`
· 19 commits ahead · tree clean · gate 18/18 · fixtures 84 counted, 84 asserted.

| Task | Live commits (oldest → newest) |
|---|---|
| T3 reducer + fold | `f321f94`, `4e295aa` (ruling P2) |
| T4 memory context + ruling P3 | `9edc4ab` |
| T4b RDU fail-closed (rulings R1/R2) | `7aecb5a` |
| T5 create-path checks | `be74f8c`, `13f8277`, `66bd698` (fix round: P11/P12) |
| T6 reparent + rebind + rank lock | `65c43ab`, `9ad6d9b`, `1850d9e` (ruling P13) |
| T7 field checks + `z.unknown()` close | `ab7c22a` |
| T7b batched corrections + ruling P15 | `488e0ec`, `0b80b2f`, `133da20` (fix round) |
| rebase integration fixes | `d349d41`, `d4b0b7f` (ruling P16) |
| T8 harness audit + 14 fixtures | `0bd2b03`, `d1a776f`, `11f1fb3` |

**Regenerate this table after every rebase.** The command is
`git log --reverse --oneline origin/main..HEAD`, run with a clean tree and no operation in flight.
A ledger's shas are facts about a history that rebasing rewrites — the prose survives, the hashes do not.

## COLD START — read this first if you are a reloaded session

**Recovery set (three files, in this order):** this ledger · `preflight-conflict-table.md` (BINDING over
every task brief; 10 addenda) · `task-8-riders.md`. Task briefs are `task-N-brief.md`. **Never read the
plan document whole** (~5,000 lines).

**Where the lane is right now.** Branch `exec/03-tickets-hierarchy` at `11f1fb3`, **19 commits ahead of
`origin/main`**, tree clean, gate **18/18 green**, fixture directory **84** and the gate asserts the same.

**Done and reviewed clean:** T3 · T4 · T4b · T5 (+1 fix round) · T6 (+P13) · T7 · T7b (+1 fix round) · T8.
**Chain A is closed.** T8's review is the only thing outstanding before Chain A's PR.
**Remaining:** Chain B — T9, T10, T11, T12, T13 (needs Postgres on 54329, container up) — then T14.

**Next three actions, in order:** (1) T8 review clears → (2) **Chain A PR alone**, not batched with Chain B
(a sibling lane's Plan 10 T4 will touch `contests.test.ts`, which this lane edited; being first is the cheap
way past it) → (3) dispatch T9.

**Non-negotiables a reloaded session must not lose:**
- **Floor list:** T10 and T12 = implementer opus-high AND reviewer explicit `model: fable`. T3 and the RDU
  decision already ran that way.
- **Tier audit before every dispatch** (owner directive): **T13 → sonnet medium**, **T14 → sonnet low–medium**.
  Projections (T9, T11) stay opus — the table names them core semantics.
- **Ruling P14 is BLOCKING on T12** and goes live in T12's own commit; Addendum 9's `rowToTicketState`
  `workspaceId` trap converges on the same commit. Read Addendum 10 before dispatching T12.
- **Count, never compute.** Preconditions: tree clean AND no rebase/merge in flight, then count the directory.
  Three stale absolutes have been caught in this lane, all supplied by me.
- **The final whole-branch review is MANDATORY** (fan-out 2 of 2): four lenses — three at opus `max`, the
  mocked-contract lens at `fable` — plus adversarial refuters at `fable`, **one worktree per mutating agent**.
  It owes a hit-rate report on the outside-the-file lens (see the COMMITMENT section below), recorded in the
  coordination doc, including a null result.
- **Rulings live in `docs/superpowers/plans/2026-08-20-00-series-coordination.md`, in the same commit as the
  code.** This ledger is gitignored; that is how Plans 1 and 2 each lost their rulings.

Lane 1 controller (Opus 5). Branch exec/03-tickets-hierarchy. Tasks 3–14; Tasks 1–2 + §9 rider landed on main as the keystone (b0fda11, 3aec0a0, bd9e022, f363b2f).
Baseline verified green at f363b2f: 9/9 turbo tasks.

## Standing notes (recorded pre-flight, survive compaction)

- **Merge collision — `apps/server/src/projections/index.ts`.** Pre-ruling #6 (coordination doc, parallel-waves section): coordination §8's order is the single source (`proj_entity_heads`, `proj_workflows`, `proj_ticket_types`, `proj_projects`, `proj_tickets`, `proj_rollups`, `proj_memberships`, `proj_visibility`). Plan 4's lane inserts `proj_projects` BEFORE `proj_tickets`. The pin on `main` today omits it. **Whichever lane merges second updates the array to the full §8 order** and updates `apps/server/test/projection-order.test.ts` to match.
- **Merge collision — fixture exact count.** `packages/rule-engine/test/fixtures.test.ts` asserts **61** today. Lane 4 also adds fixtures. Resolution is arithmetic: every colliding branch states its delta, the merger sums them. Our delta must be stated in the Task 8 commit message.
- **Fixture constraints (Plan 2 consequences §6).** Import the harness from `@gisik-nokma/rule-engine/fixtures`, NOT the package root. Fixtures live FLAT in `packages/rule-engine/fixtures/` (the scan is non-recursive; a nested fixture is silently skipped). Fixture candidates stay in workspace `ws_1` (memberships are keyed to `ws_1` unconditionally). Bump the count in the SAME commit as the fixtures.
- **Mutation restorations are verified with `git diff` or by reading the file — NEVER a shell `diff`.** The RTK proxy returned a false "identical" during Plan 1's Task 10 mutation sweep.
- **`asOfWorkspaceSeq` same-stream precondition.** Positions from different workspace streams are not comparable — a wrong version, not an empty result. `proj_tickets` is the intended caller and must pass a position from the same workspace stream as the workflow it asks about.

## Pre-flight rulings (made before the first dispatch)

- **Ruling R1 (RDU fail-closed).** `require-different-user.ts:56`'s `if (!resolved.ok) continue;` becomes fail-CLOSED: an unresolvable candidate log entry refuses the transition rather than being skipped. — Why: the autonomous execution protocol's ruling #3 names the conservative option (fail-closed / refuse / narrower scope) as the default for questions the plans do not answer, and Plan 2 consequences §3 states the current fail-open is reachable "only through corruption", which is exactly the condition under which a security control should fail closed. Plan 3's refresh-on-publish is what makes ticket-version and entry-version divergence routine, so the comment's precondition genuinely dies here. — Cost if wrong: a legitimate four-eyes transition is refused on a store nobody has noticed is corrupt; the user sees a named refusal rather than a silent bypass, and the owner can overrule post-hoc into diagnostics-only. The reverse error (staying fail-open) silently disarms a security control with no diagnostic anywhere.
- **Ruling R1a (the comment is rewritten in the same change).** Non-negotiable per the charter and Plan 2 consequences §3: "Whichever is chosen, that comment gets rewritten in the same change." The current comment asserts a precondition Plan 3 itself removes.
- **Ruling R2 (transition log ordered by `seq` at the point of use).** RDU sorts candidate entries by `seq` rather than trusting `TicketState.transitions` array order. — Why: Plan 2 consequences §4 states the preference outright ("the second is preferable"), and it makes a field the whole monorepo currently ignores earn its place. A guarantee living in one projection's implementation detail is the same durability problem the consequences sections exist to name. — Cost if wrong: a redundant sort on a list that was already ordered; measured against the failure it prevents (the wrong person's id compared against the wrong actor, refusing legitimate moves and accepting self-approvals, with a green suite and no test that would catch it) this is free.
- **Ruling R3 (where R1/R2 land).** A dedicated task **T4b**, dispatched after Task 4 and before Task 5 — Task 4's in-memory EngineContext is what the unit tests need, and settling RDU semantics before Task 8 means the fixture author writes against final behaviour. Floor-list treatment: implementer opus-high, reviewer `fable`. — Cost if wrong: a task boundary in the wrong place; no semantic consequence.
- **Ruling R4 (routing is part of the change, not a follow-up).** R1/R2's coordination-doc edits land in the SAME commit as the RDU code, discharging Plan 2 consequences §3 and §4 in the document itself. — Why: routing-at-plan-end failed in Plans 1 and 2 for the same reason both times — the ledger is gitignored. — Cost if wrong: none; a documented decision is never worse than an undocumented one.

## Pre-flight scan complete (ultracode fan-out 1 of 2 — MANDATORY, discharged)

15 agents, 0 errors, 0 empty results, 1.24M subagent tokens: 12 task extractors (sonnet/low) →
repo-verified adaptation map + coordination-obligation lens (opus/high, parallel) → synthesis
(opus/high). Conflict table at `.superpowers/sdd/2026-08-20-03-tickets-hierarchy/preflight-conflict-table.md`
— **BINDING over the task briefs**; 19 adaptations, 9 broken assumptions, 26 verified facts,
30 coordination obligations, 46 cross-task conflict rows, 12 per-task self-consistency rows.

The single most dangerous finding: **BA-7** — five tasks place tests at `packages/*/src/*.test.ts`,
but all three vitest configs collect only `test/**/*.test.ts`. The briefs' own explicit-path commands
override `include`, so an implementer sees green locally while `turbo run test` never runs the file.
Five tasks' entire falsifiability apparatus would have silently vanished from CI.

## Rulings on the scan (all made before the first dispatch)

- **Ruling P1 (C-07 — `TicketStateDeps.getWorkflow` stays a pure by-id lookup).** T3's reducer calls `deps.getWorkflow(p.toWorkflowId)` on a rebound; T10's `loadDeps` must serve ANY id asked for (reading `toWorkflowId` off the rebound payload, `current.workflowId` otherwise). — Why: the reducer is the only place that knows which id an event needs; pushing that knowledge into the caller duplicates the event switch in two files that must never disagree. — Cost if wrong: T10's `loadDeps` does one more lookup than strictly needed.
- **Ruling P2 (O-foldedstate-version — TAKE the narrow fix, do not defer).** The stranded-state refusal at `transition.ts:65` names `resolved.unmappedStateId` (the id where the chain BROKE) against `ticket.workflowVersion` (the ticket's ORIGIN version) — a state and a version that never coexisted whenever the chain is longer than two. Plan 3 takes the **drop-the-version-clause** option the coordination doc sanctions: `Ticket ${id} sits in state "${unmappedStateId}", which no longer exists in version ${latest.version} and no state mapping covers it.` Lands in **T3** with the coordination-doc discharge in the same commit; the stranded fixture's expected reason moves with it. — Why: I declined the synthesis agent's recommendation to defer. Plan 3 is not merely "the next plan to touch the fold" — it is the plan that **arms** the latent inaccuracy, because refresh-on-publish is what makes ticket-version and break-version diverge routinely (today every stranded fixture is two-version, where they coincide, which is why the suite is silent). A plan that arms a false statement should not defer fixing it, and this is the cheap option: one message, one fixture, no `FoldedState` type-surface change and no cross-plan churn. Folding the id backwards remains forbidden. — Cost if wrong: users lose a version number that was wrong anyway; the id and the current version still name the problem. The `FoldedState` break-version surface change stays available if a later plan wants the fuller sentence.
- **Ruling P3 (BA-4 — widen `EngineContext` additively).** Add `getTicketTypeDef(typeId): Promise<TicketTypeDef | null>` to `packages/rule-engine/src/engine.ts`, implemented in the memory context (T4), the fixture harness (T8) and `apps/server/src/engine-context.ts` (T12). Rejected: promoting `'ticket-type'` out of `OtherEntityState`. — Why: `'ticket-type'` is `{kind,id}` and every hierarchy rank check is otherwise unimplementable. The additive method leaves the shipped union and the four identity-only kinds untouched and cannot regress any existing `getEntityState` reader; promoting the kind rewrites a domain union three lanes are reading concurrently. Must be ruled before **T4**, the first implementation. — Cost if wrong: a fourth method on a three-method interface, implemented three times.
- **Ruling P4 (O-reset-lock-contract — TRUNCATE).** All three new projections reset with `TRUNCATE`, matching both shipped projections. — Why: the entity↔workspace tenancy door's safety argument rests on `reset()` taking ACCESS EXCLUSIVE so a rebuild cannot interleave with an ingest and expose an empty table as "not yet bound" (Plan 2 consequences §5). Nothing in these three tables needs identity or FK preservation. DELETE would make Plan 3 the owner of re-deriving that contract — unpriced work. — Cost if wrong: none identified; TRUNCATE is what ships today.
- **Ruling P5 (O-fixture-ws1 — omit `workspaceId` from fixtures).** New fixtures omit `workspaceId` entirely and let `completeEnvelope` default it to `ws_1`, as all 61 shipped fixtures do. Overrides T8's exactStrings, which hardcode a ULID. — Why: the harness keys memberships to `ws_1` UNCONDITIONALLY while only DEFAULTING the envelope's workspaceId, so an override yields a null membership and a restrict-to refusal that reads entirely legitimate (`harness.ts:168-183` warns about exactly this). Harmless only until a Plan 3 fixture carries a restrict-to rule. — Cost if wrong: fixtures share one workspace id, which is what the harness was built for.
- **Ruling P6 (O-fixture-count — per-commit arithmetic).** Each task bumps `fixtures.test.ts`'s exact count by **its own delta, in its own commit**, computing the absolute number from the directory at that moment and stating the delta in the commit message. No task writes a number it did not count. Cross-lane merges with Plan 4's lane resolve by summing deltas (pre-ruling 6). — Why: Plan 3's delta spans three tasks (T4b 0-or-1, T6 +2, T8 +13) and the dispatch order is T4b→T6→T8, not the order the plan text assumes. An absolute number written from the plan is wrong the moment another lane lands a fixture. — Cost if wrong: one extra count step per fixture commit.
- **Ruling P7 (BA-5 — add `pool: Pool` to `AppDeps`).** T13 adds a `pool: Pool` field alongside the existing `db: HealthDb`, rather than retyping `db`. — Why: `AppDeps.db` is a one-argument healthcheck shim that cannot carry parameters; retyping it touches every `buildApp` call site and the healthcheck tests that depend on its narrowness. Adding a field is additive at the call sites. — Cost if wrong: two db-ish fields on `AppDeps` until Plan 4 consolidates them.
- **Ruling P8 (A16 — keep the `field` / `fieldId` split).** Candidate `ticket.field_set` payloads use `fieldId` (the domain schema); harness PRIOR-event payloads keep `field`. A comment at `harness.ts:155` records that the two spellings are deliberate. — Why: renaming the harness key touches shipped fixtures and `test/harness.test.ts` for cosmetic uniformity — scope Plan 3 was not given. — Cost if wrong: one comment explaining an asymmetry, instead of one rename.

### Adopted from the adaptation map without further ruling (BINDING, cited in every dispatch)

- **A10 / O-transitioned-payload** — `ticket.transitioned`'s payload field is `to` (schema `ticketTransitionedPayloadSchema` in `workflow.ts`, NOT `events/ticket-events.ts`); `comment` is `{ text }`. The transition LOG ENTRY separately and correctly spells `toStateId`. **Both are right; never unify them, never "correct" the shipped schema.** `ticket.workflow_rebound`'s payload genuinely IS `{ toWorkflowId, toStateId }` — the one place `toStateId` is right in a payload.
- **O-log-entry-workflowid** — entries are `{ toStateId, actorId, seq, workflowId, workflowVersion }`. The briefs omit `workflowId` and two tests assert the truncated shape with `toEqual`. **Fix direction is pinned: correct the briefs, NEVER `entity-state.ts`** — deleting the field silently reopens the migration hole the 2026-08-26 decision closed, and T4b's guard 1 reads it.
- **A1 / BA-7** — every new test goes under the package's `test/` directory, importing the code under test relatively with the ESM `.js` suffix. A `.test.ts` under `src/` is never collected.
- **C-24** — `hierarchy.parent-terminal` (T5: adding/moving live work UNDER a terminal parent) and `parent-terminal-with-open-children` (Plan 2, shipped: a transition INTO terminal with open children) are **two different rules with adjacent meanings**. Both exist; neither is renamed to the other.
- **C-42** — `proj_rollups.open_children` counts `state_category = 'open'` only, while the invariant counts `!== 'terminal'` (open + active). **Nothing may read `open_children` as "the invariant's open children"**; `getChildrenStates` stays a direct `proj_tickets` query and is never reimplemented on rollups.
- **C-21** — T4b carries its own `Features.md` / `test-cases` entry for the new fail-closed refusal, per R4's same-change-set discipline.

## Execution log

- **Dispatch order** (serial — one implementer at a time; both chains share one worktree index, and SDD forbids parallel implementers): T3 → T4 → **T4b** → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13 → T14.
- **Floor list** (implementer opus-high AND reviewer explicit `model: fable`): **T3, T4b, T10, T12**. T8 is opus-high implementer (fixture authoring / planted-defect design).
- **Fixture count tracker** (Ruling P6 — each task recomputes from the directory at its own commit): starts at **61**. Expected deltas: T4b +0 or +1 (conditional), T6 +2, T8 +13.
- Task 3 dispatched (opus, high). BASE = `f363b2f`.
- **Cross-lane exchange (cross-lane controller, during T3).** Two pointers received; both already covered. (1) FoldedState/stranded-state — independently caught by the pre-flight obligation lens as `O-foldedstate-version` and TAKEN as ruling P2 (the peer confirms the drop-the-version-clause option is one of §1's two sanctioned shapes). (2) The compile net: importing the SHIPPED `ticketTransitionedPayloadSchema` is what turns `p.toStateId` into an unmissable compile error, whereas re-declaring a plan-local zod schema to match the brief's non-existent `ticketTransitionedPayload` name **also compiles and removes the net**. My dispatch said where to import from but not why it was load-bearing; addendum sent to the running T3 implementer with three prohibitions (no local schema for a registered event, no cast to make a shape fit, a surviving compile error is a finding not an obstacle). A sibling lane has that exact failure in flight — two casts removed the compiler, tests assert the wrong shape, ships green.
- **Coordination-doc merge sequencing.** Peer's PR #15 (`watch/wave1-cross-lane-obligations`) appends a "Wave 1 cross-lane watch" section; lane 1 appends to Plan 2 consequences §1 (T3), then §3 and §4 (T4b). Different sections — clean merge likely; whichever lands second takes the rebase. Lane 1 does NOT batch its discharges: same-change-set routing is the discipline that failed twice in Plans 1 and 2.
- **A10 sharpened (Addendum 1 in the conflict table).** `ticket.transitioned` carries TWO independent divergences: field `to` AND `comment: { text }`. Fixing only the field name still gets refused, with a different error arriving later — when the first fix looks like it worked. Binding on T8/T10/T11, which BUILD payloads.
- **`main` moved to `2e9f405`** (lane 4's app-core/ui scaffold, PR #16) while T3 was running. **Do not rebase under a running implementer** — rebase after T3 commits, then re-run the full gate before dispatching T4. Two new packages (`packages/ui`, `packages/app-core`) join `turbo run test`, so the baseline task count changes; that is expected, not drift.
- **Coordination-doc collisions: the peer controller takes the rebase every time, unasked** (their ruling — lane 1 is on the critical path, they are not). Lane 1 keeps landing discharges as it makes them.
- **Addendum 2 (conflict table) — transcribed fixtures get mutated too.** Lane 3 found four surviving mutants in Plan 7's pinned fixture text, one a discriminator deletable with every case still green. A fixture that AGREES with the implementation is not one that CONSTRAINS it, and pre-written plan-text fixtures are the least-interrogated kind. Binding on T6 and T8.
- **Peer corrections received; neither changes lane 1.** Their revised T3 import remedy (relative `./workflow.js`, not `@gisik-nokma/domain`) is what adaptations A9/BA-9 already said and what the T3 dispatch instructed — the implementer did exactly that, verified in the diff. Their "ships green" retraction concerns lane 4's Plan 6, not this lane.
- **T3 complete and under `fable` review.** Commits `67a8650`, `deb90ca` (BASE `f363b2f`). Gate 9/9 green; domain 175 / rule-engine 115 / server 93. Fixture count untouched at 61 and matches the directory; no `.test.ts` under any `src/`; no casts in the new domain files.

### Task 3: complete (commits 67a8650..deb90ca, review clean)

`fable` review: **Spec ✅ · Task quality Approved · all findings Minor.** Floor-list questions
answered directly: every `TicketState` field maintained on every branch (creation enumerates all
fourteen; every other branch spreads `...state`, so a dropped field is a compile error against the
optional-free type); the monotone fold guard is present at `ticket-state.ts:282` and tested in BOTH
the "at" and "past" directions with `toBe` identity — the strongest shape available for a guard that
reads as dead code on the live path; provenance preserved through one `claim()` constructor; no
tautological test found (the `messageOf` helper defeats vitest substring matching and throws when
nothing throws; every rejection asserted as a complete literal string; no-op paths use `toBe`).
P2's three parts verified independently, including that the coordination-doc §1 discharge is in
commit `deb90ca` itself via `git show --stat` rather than on the report's word.

**Task 3: minor (deferred): M1 — the clearing test's clock assertions are vacuous.** `makeEnvelope`'s
default clocks are identical for the set- and clear-envelopes (`test/ticket-state.test.ts:246-272`),
so only `actorId` discriminates. NOT a coverage hole — set and clear share one code path and the main
field_set test proves both clocks with distinct values. One-line fix: distinct explicit clocks on the
clearing envelope. **Final review triages.**

**Task 3: minor (deferred): M3 — a second unfalsifiable check, undisclosed.** The fold's
`stateCategoryOf` throw (`ticket-state.ts:317-321`) is provably unreachable: `foldStateIdForward`'s
containment check guarantees `resolved.stateId ∈ target.states` when `ok:true`. Same
acceptable-defensive-throw class as the disclosed `kind: 'ticket'`; the report named only one.
Report-completeness nit, not a code defect.

**Task 3: minor (deferred): M4 — report accuracy.** The report's "no `as` cast (verified by grep)"
is overdrawn: `test/ticket-state.test.ts:505` has `(TICKET_EVENT_TYPES as readonly string[])`, a safe
WIDENING upcast. The code honours the prohibition (no shape-forcing casts); the report's verification
sentence does not.

**Task 3: minor (deferred): M5 — optional hardening.** `foldTicketToWorkflowVersion` never checks
`target.id === state.workflowId`; a caller passing a foreign workflow's def folds silently into an
inconsistent state. Intended callers select rows by workflow id. One defensive line + one test if
wanted.

**Task 3: minor (deferred): M2 — residual imprecision in the RETAINED stranded-state clause.** On a
corrupted store the break-point id can be re-introduced in the latest version, making "no longer
exists in version N" false; and `resolveStateIdForward` silently drops an unfetchable intermediate,
so a HOLE reads as "no state mapping covers it". Unreachable through validated publishes. Ruling P2
sanctioned the shipped wording — raised per the standing instruction to flag mandated behaviour
anyway. Nothing for T3 to do.

**M6 (observation, not actionable):** `TICKET_EVENT_TYPES` completeness is pinned one-directionally
(length 10, every listed type proven `'ticket'`-kind). The reverse — every `'ticket'`-kind
registration is listed — is not writable today because the registry exposes only `get`
(`registry.ts:21`). The "eleven" in Features.md counts `ticket-type.defined`, whose kind is
`'ticket-type'`. Both numbers are right about different sets.

### Cross-task routing from Task 3's review (controller-resolved — carry into the named dispatches)

- **→ T5:** a duplicate `ticket.created` silently RESETS the fold (`ticket-state.ts:95` handles
  creation unconditionally, brief-mandated). Nothing shipped refuses a duplicate create.
  `checkTicketCreated` must refuse create-for-an-existing-ticket explicitly.
- **→ T7:** a value-less `ticket.field_set` folds as an explicit clearing claim —
  `ticketFieldSetPayload.value` is `z.unknown()`, so a payload OMITTING `value` parses and
  `p.value ?? null` records a null claim nobody quite made. Whether the door refuses an absent value
  is T7's decision. Conservative default if T7 has no better argument: refuse, since inventing a
  clearing claim violates invariant 4.
- **→ T10:** (a) ruling P1's other half is unenforced until T10 — `loadDeps` must read `toWorkflowId`
  off the rebound payload and `current.workflowId` otherwise (C-07), now pinned by a T3 test that
  fails on caller-side pre-selection; (b) `TICKET_EVENT_TYPES` shipped as an as-const tuple, so
  T10's `.includes(event.type)` filter needs the same `as readonly string[]` widening (M4).
- **→ T8:** C-06 stands — T8's fixtures do NOT traverse this reducer, and the divergence risk is
  mitigated only by A15's mirroring. Combine with Addendum 2: mutate the transcribed fixtures.
- **Rebased onto `362ff68`** (peer PRs #16 scaffold + #15 cross-lane watch, both in). Clean — no conflict on the coordination doc; T3's Plan 2 §1 discharge survived intact (verified in `git show --stat`). Required `pnpm install --frozen-lockfile` for the two new scaffold packages, which have no `node_modules` in this worktree. **Gate re-run on the new base: 15/15 tasks green** (was 9/9; `ui` and `app-core` add five). Fixture count 61, matching the directory.
- Task 4 dispatched (opus, high — core semantics: an EngineContext implementation). BASE = `cf4bbc7`.
- **Task 4 implemented** (commit `1417a4d`): `memory-context.ts` + 19 tests (brief said 6 — literal count, per the count rule), ruling P3's fourth `EngineContext` method added and all four implementations filled. Gate 15/15; rule-engine 115 → 134; `fixtures.test.ts` untouched at `toHaveLength(61)`. 19 mutations, every test killed by at least one, restorations verified with `git diff --quiet`.
- **Addendum 5 written** — corrects C-12 (T4's context DOES fold reparents; the harness does not), pins the deliberate harness throw for T5–T7, routes the `workflowDefSchema`-strips-`stateMapping` trap to T10/T11, and flags the "latest = highest version" parity question for T10's reviewer.

### Task 4: complete (commit 1417a4d, review clean)

Review: **Spec ✅ · quality approved · 0 Critical, 0 Important, 4 Minor, 5 ⚠️.** The two contexts
were verified semantically identical where it matters — `getChildrenStates` verbatim, and
`getWorkflowDef`'s "latest" now agreeing **three ways** (memory = harness `latestOf` = server's
`ORDER BY version DESC LIMIT 1`). Refresh-on-publish present and tested at the case that matters
(a re-categorising v2 changing what `getChildrenStates` hands the parent-terminal invariant). The
`getTicketTypeDef` asymmetry (harness throws, server returns null) judged right in both places.
19 mutations, 19 tests, each killed by at least one; no tautological test found.

**Ruling P9 (from ⚠️/M-1 — `getEntityState` parity on identity-only kinds).** The memory context
answers `null` for `'workflow'` while the server returns `{ kind, id }`; the fixture harness also
answers null, so the two IN-MEMORY contexts agree and the server is the odd one out. **Deferred to
T12, which must align all three implementations in one change set.** — Why: the divergence is
unreachable today (the engine's only `getEntityState` call sites are `transition.ts:41` for
`'ticket'` and `rules/restrict-to.ts:25` for `'membership'`), full parity is structurally impossible
for `'workspace'`/`'project'` from a `(seedWorkflows, events)` signature, and fixing it now would
make the memory context diverge from the harness — trading one seam for another. T12 is the first
moment all three are visible in one change. **Its dispatch carries this, and the test at
`memory-context.test.ts:211` gains a comment naming it as a known seam rather than asserting the
divergent answer as if it were correct.** — Cost if wrong: a fixture suite could prove a refusal the
server would not make, for a kind no rule reads today; the trigger is any new rule reading
`getEntityState` for a non-ticket, non-membership kind.

**Task 4: minor (deferred): M-2** — ruling P1 (`deps.getWorkflow` is a pure by-id lookup) is a doc
comment here with no test behind it; no `memory-context.test.ts` case carries a
`ticket.workflow_rebound`. Acceptable because **Task 3 pins the contract where it lives** (a domain
test that fails on caller-side pre-selection) and T10 enforces the server half (C-07). One rebound in
priors would close it here too.

**Task 4: minor (deferred): M-3** — one extra line at the maps test would directly guard
`stateMapping` survival, rather than relying solely on the end-to-end fold assertion. Existing cover
is falsifiable (M4); this is a cheaper second guard.

**Task 4: minor (deferred): M-4** — two tests assert `@gisik-nokma/domain` error strings verbatim, so
a Task 3 wording change breaks rule-engine tests. Known coupling, deliberate (`toThrow` substring
matching is self-certifying), not worth changing.

**Task 4: minor (deferred): M-1** — see Ruling P9 above.

**Addendum 6 written** — supersedes `task-12-brief.md:92/136/151`, which instruct ruling P3's
REJECTED alternative verbatim (growing a full `TicketTypeDef` out of `getEntityState('ticket-type')`,
via a shape-forcing `as { rank: number }` cast). Task 4 fixed the shipped comment, but a T12
implementer reads the brief. Riders routed to T5 (⚠️-3 spy counts), T7 (⚠️-4 unknown-type coverage
must be a unit test, not a fixture), T8 (⚠️-2 `workflow.defined` in the harness needs the fold with
it), T14 (⚠️-5 catalogue both the subsystem and the contract change). T10's parity question
discharged early — no action.

- Task 4b dispatched (opus, high — FLOOR LIST; reviewer `fable`). BASE = `1417a4d`.
- **Task 4b implemented** (commit `7e9854f`): R1 fail-closed + R1a comment rewrite + R2 `seq` sort on a copy, in one commit with the fixture, the count bump, the Plan 2 §3/§4 discharge, `Features.md` and `test-cases/`. Gate 15/15; rule-engine 140. **Fixture count tracker: 61 → 62 (delta +1)** — verified: gate says 62, directory holds 62. `test-cases/05-tickets-hierarchy.md` untouched (verified empty diff), so the 5.4–5.36 reservation and the externally-cited 5.27/5.30/5.36 are intact; new cases landed as **4.52/4.53 in `test-cases/04-workflow-engine.md`**, which is where four-eyes is already catalogued.
- **Claim to verify in review (implementer's concern 2):** the coordination doc's own §3 analysis is **wrong**. §3 says that while ticket-version and entry-version coincide, "any break the entry hits, the ticket hits first." The implementer reports this is false even at equal versions, because the ticket walks only the id it currently sits in — so a version dropping some OTHER state unmapped strands an entry while the ticket resolves cleanly. If true, the fail-open hole was reachable EARLIER than the doc claimed, and it is what made the end-to-end fixture expressible at all. Routed to the `fable` reviewer for independent verification rather than accepted.
- Task 4b reviewer dispatched (`model: fable`, FLOOR LIST). BASE = `1417a4d`.

### Task 4b: complete (commit 7e9854f, review clean)

`fable` review: **Spec ✅ · approved · 0 Critical, 0 Important, 2 Minor.**

**The §3 correction is VERIFIED RIGHT, with a precision refinement the reviewer worked out from
shipped code rather than from the report.** A fold breaks in two distinct ways
(`packages/domain/src/workflow.ts:109-128`): `intermediate(version) === null`, which is
**id-independent**, and the currently-carried id dropped without a `stateMapping` entry, which is
**per-id**. At equal versions both walks traverse the same version range but carry different ids, so
a version that keeps the ticket's id while dropping the ENTRY's id unmapped strands the entry and not
the ticket. §3's "any break the entry hits, the ticket hits first" is a universal claim and one
counterexample falsifies it. **Refinement:** the missing-intermediate shape is id-independent and DOES
strand both at equal versions, so §3's claim survives for that shape — the counterexample is
specifically the unmapped-drop-of-another-state shape. The shipped wording is careful on exactly this
point (the code comment says "only nearly true"; the discharge is phrased existentially), so
**no false claim entered the series authority.**

Also verified: the refusal copy is character-identical **six ways** (brief template, brief interpolated
example, source template, unit-test literal, fixture `expected.reason`, and the discharge's quote),
compared programmatically rather than by eye. The `seq` test genuinely fails pre-change (array
`[seq 9, seq 2]`, later-seq placed earlier — and no fixture COULD pin this, because the harness
assigns `seq` sequentially). Fail-closed refuses on the FIRST unresolvable entry, with M5 the exact
paper-over mutant that pins it. The fixture **constrains** rather than agrees: under both fail-open
mutants it goes red at its own expected outcome. Catalogue verified by grep — 4.1–4.53 each appear
exactly once, previous max was 4.51, and `05-tickets-hierarchy.md` is not in the commit at all. The
coordination-doc hunk is **insertions only** — no `-` lines — so §3's and §4's original analysis
stands byte-for-byte.

**Task 4b: minor (deferred): the mutation ledger's M2/M3 counts are misrecorded** in the report
(`task-4b-report.md:134-135` claims both files ran every time; M2/M3 show the 5-unit counts). Evidence
itself intact — failures at their own assertions, and the fixture is insensitive to M2/M3 by
construction. Report-accuracy nit.

**Task 4b: minor (routed to T8, not a fix round): the fixture's `notes` cites `(unmapped-drop)`,
a name that greps to nothing.** The real refusal is `workflow-state-mapping`
(`workflow-defined.ts:88-90`). Prose meaning is right, but in a series where spellings are law a
greppable-looking name that resolves to nothing should be corrected or rephrased as plain prose.
**T8 works in that same directory — it fixes this line as a one-line rider rather than costing a
dedicated fix round.**

**CHARTER CLAIMS: 2 of 4 discharged.** ✅ RDU fail-open decided (fail-closed, comment rewritten).
✅ Transition-log order (sorts by `seq` at the point of use). Remaining: `proj_tickets` maintains
every `TicketState` field + `asOfWorkspaceSeq` same-stream (T10); the parent-terminal invariant
becoming real (T10/T12).

- Task 5 dispatched (opus, high — core semantics: engine checks). BASE = `7e9854f`.
- **Task 5 implemented** (commits `6c159df`, `3d616e1`), status DONE_WITH_CONCERNS. C-22 layout shipped exactly (`refusals.ts` / `context-helpers.ts` / `test-support.ts` / `hierarchy.ts`; verified nothing named `shared`); `DEEPEST_RANK` imported not restated; O-project-existence cross-reference to Plan 4 in both the `REFUSALS` header and the docstring. Gate 15/15 (465 tests); rule-engine 115 → 161. 20 `it` blocks, **25 mutations**, each red at its own assertion, restorations via `git diff` only. Fixture gate untouched at 62 and matching the directory; `Features.md`/`test-cases/` untouched.
- **CONCERN 1 — ROUTED, behavioural: `ticket.created` is now refused at ingest until Task 12.** A19 verified the new dispatch case flips no FIXTURE (true) but not the SERVER tests — one flips. The server's `getTicketTypeDef` stub answers null, so the engine refuses `ticket.unknown-type`, exactly as `createEngineContext`'s own comment promised. The implementer updated `apps/server/test/engine-context.test.ts` to state this and **planted the ticket head row its first assertion needs** — without a head row that assertion passes against the very cast it exists to kill. The revert instruction for Task 12 is carried in the file. **→ T10 and T13 must know this BEFORE writing any test that ingests a ticket; → T12 owns the revert.**
- **CONCERN 2 — ROUTED to T14: `ticket.already-exists` needs cataloguing at 5.37+, never by renumbering.** New user-visible refusal from the duplicate-create rider. Same gap C-21 flagged for T4b. Note the split: T4b's four-eyes cases landed in §4 (Plan 2's rule); this one is a Plan 3 refusal, so §5 at 5.37+, past the 5.4–5.36 reservation.
- **CONCERN 3 — noted: `parentTerminalRefusal`'s `'move'` branch is shipped-but-uncalled until T6.** Correctly flagged rather than deleted — C-22 pins it as T6's contract. Reviewer to confirm it is dead code with a named, imminent caller rather than speculative generality.
- Task 5 reviewer dispatched (opus, high). BASE = `7e9854f`.

### Task 5 review: Spec ✅ · approved · 1 Important, 6 Minor, 4 ⚠️ — fix round 1 opened

Reviewer verified independently rather than trusting the report: ran the file (20/20), the package
(161/161), confirmed all 25 mutation line numbers land on real `expect`s in the shipped file, parsed
all 62 fixtures, and checked the duplicate-create defect at source. It also caught a **false claim in
the report** (see P11b).

**Ruling P11 — I-1(a): the parent's-type guard must stop lying. FIX, though the brief mandates it.**
`hierarchy.ts:104-105` refuses a missing PARENT type with `refuse('ticket.unknown-type')`, whose copy
is "This ticket's type is not defined in this workspace." — but the ticket's own type resolved
successfully eleven lines earlier. **The actor is sent to define a type that is already defined**, and
`test/hierarchy.test.ts:279-283` asserts that sentence as a literal, so the suite currently
**certifies the misleading copy as correct**. — Why I overrule the brief: this is the coordination
doc's own stated principle, verbatim (line 204) — *"a refusal that happens to fire for the wrong
reason is not coverage. It leaves the real gap open on every path where the coincidence does not
hold, and it tells the user something false on the paths where it does."* It is also spec invariant 2
("the reason named in the user's language") and the task's OWN doctrine at `hierarchy.ts:17-19`,
applied to `already-exists` and not applied here. The spec is the binding authority over the plan.
**Mint `hierarchy.parent-type-unknown`** beside `hierarchy.unknown-parent`, canonical style, asserted
as a literal. — Cost if wrong: one more id in a vocabulary this plan owns and is chartered to
deliver; the alternative is shipping a knowingly-false message in a product whose founding premise is
that the board cannot lie.

**Ruling P11b — I-1(b): the docstring omits the guard entirely.** The report claims the parent's-type
guard is "named in the docstring"; it is not — `parentType` appears in code only. This is the one
place a reviewer checks the order. One-line fix, and the report's claim is corrected.

**Ruling P12 — M-1: a cross-workspace parent must refuse as `hierarchy.unknown-parent`.** `getTicketState`
does an id lookup with **no workspace predicate**, and `proj_entity_heads`' PK is
`(entity_kind, entity_id)` — global, not per workspace. So a parent in another workspace RESOLVES and
is then refused as `hierarchy.cross-project` ("The parent is in a different project"), which is false
and **quietly confirms that a ticket id exists somewhere the actor cannot see**. Same "wrong reason"
class as I-1, one line, and `TicketState.workspaceId` is already in hand at `hierarchy.ts:100`. — Cost
if wrong: a cross-workspace parent reads as absent rather than as forbidden, which is the correct
answer from this workspace's point of view and the one that leaks nothing.

**Also in the round:** M-2 (the `'move'` branch ships with zero assertions — one-line string test
before Task 6 imports it), M-3 (the Task 12 revert instruction is short by two items; make it
mechanical, not inferential), M-4 (catalogue both new refusals at **5.37+**, matching Task 4b's
same-change-set precedent and never renumbering), M-7 (citation off by one: the branch opens at
`ticket-state.ts:94`).

**Deferred, not in the round:** M-5 (the `already-exists` reason names a consequence its own existence
prevents — defensible, the canonical table has one such clause), M-6 (kind-guard vs payload-parse
ordering unpinned — inherited from `transition.ts`, not introduced here).

**Cross-plan obligation to route (reviewer's forward note):** `checkTicketCreated` is now
**non-idempotent under re-evaluation** — any consumer re-running `evaluateEvent` over an
already-committed `ticket.created` against a context that has folded it gets `ticket.already-exists`.
Correct under the engine's contract, and the fixture harness is unaffected (only the candidate faces
the engine). But **Plan 10's replica is named twice in this task's own justifications**, and if it
ever re-judges synced events rather than only pending local ones, this is where it breaks first.
Goes in the coordination doc in the same commit as the fix.
- **Task 5: fix round 1/5 (7 addressed, 0 open; commits `3d616e1`..`4de901c`).** Scoped re-review:
  **all seven ADDRESSED, no new breakage, no weakening.** Verified rather than accepted: the docstring
  chain traced line-by-line against the control flow (`:82,:85,:88,:108,:124,:125,:132,:133,:141`) and
  found to agree exactly; M28 hand-traced and confirmed to *reproduce the leak* rather than notice an
  absence; the catalogue file changed by 4 lines with 5.27/5.30/5.36 absent from it entirely and still
  reserved; the only changed assertion is same-strength, different content; blocks 20 → 24 with zero
  deletions.
- **Task 5: complete (commits `6c159df`..`4de901c`, review clean).**
- Task 6 dispatched (opus, high — core semantics: engine checks). BASE = `4de901c`.
- **Task 6 implemented** (commits `144de0d`, `fb77315`). Gate 15/15, **514 tests** (was 469). Fixtures **62 → 64** (delta +2, both stageable as candidate-position `ticket-type.defined`). 19 mutations, each red at its own assertion, restorations via `git diff --stat` empty. Rulings P11 and P12 applied to the reparent path; the order-pin gap Task 5 left is closed; `createdIn` hoisted.
- **Ruling P6 arithmetic corrected.** The tracker said `61 → 63 after T6`, which assumed T4b added no fixture. T4b added one. True running total: **62 → 64 after T6**. The per-commit rule (count the directory yourself) is exactly what caught this — an absolute number written from the plan would have been wrong.

**Ruling P13 — the third P11-class defect, raised by the implementer as a ruling request rather than
decided unilaterally. FIX.** `checkTicketWorkflowRebound` refuses an undefined **target** workflow
with `ticket.workflow-undefined` — *"This ticket type's workflow has not been defined yet, so the
ticket would have no status."* On that path the undefined workflow is the payload's `toWorkflowId`,
while **the ticket type's own binding may be perfectly well defined** — so the actor is told something
false and sent to inspect a thing that is not broken. Identical in shape to P11 (`ticket.unknown-type`
borrowed for the parent's type) and to P12 (`hierarchy.cross-project` borrowed for a foreign
workspace). — Why I overrule three pinning authorities: the id `ticket.workflow-undefined` is **correct
where the type's binding is the subject** (`ticket.created`); what is wrong is its *application* to the
rebound path — exactly as the canonical table's `ticket.unknown-type` was correct until Task 5's brief
pointed it at a parent. The spec is the binding authority over the plan (invariant 2; coordination doc
line 204: *"a refusal that happens to fire for the wrong reason is not coverage"*). — **The citation
objection dissolves on inspection:** case 5.34 is referenced only inside Plan 3's own document
(`2026-08-20-03-tickets-hierarchy.md:5046`), NOT externally. The externally-cited ids are 5.27 and 5.30
(Plan 5, `05-api-realtime-search.md:6158`) and 5.36 (coordination doc line 303). **Keep the number
5.34, change its description** — nothing outside Plan 3 moves. — Cost if wrong: a third id in a family
that already has two (`ticket.rebound-unknown-state`, `ticket.rebound-same-workflow`), in a vocabulary
this plan is chartered to deliver.

- **→ T7 (from Task 6 concern 4): nothing was testing the DISPATCH.** Deleting a `case` from
  `evaluate.ts` left a perfect, fully mutation-proven, **unreachable** check plus a pass-through accept
  for every reparent and every same-workflow rebind. Every other check is called directly by its tests,
  so the wiring was the one thing no mutation touched. T7 appends to the same switch — it adds
  `evaluateEvent`-level assertions for its own case.
- **→ T8 (from Task 6 concern 5): reparent/rebind fixtures deferred here on stageability.** Candidate-position
  `ticket-type.defined` stages today (no priors, `ctx` unread); anything needing a resolvable ticket does
  not — the harness hardcodes `typeId: 'task'` and `getTicketTypeDef` throws. The plan-named files for
  cases 5.9/5.21/5.22 become writable once T8 extends `applyPriorEvent`.
- **Ruling P13 applied** (commit `97ece79`): `ticket.rebound-unknown-workflow` minted and wired; case 5.34's DESCRIPTION corrected in place (number unchanged); coordination doc records P13 and the three-instance pattern in the same commit. Gate 15/15, 514 tests, fixture directory unchanged at 64. Three mutations — M20 restores the pre-P13 defect verbatim (reds on rule AND reason), M21 deletes the check, M12′ re-pins the order.
- **Implementer's self-correction, worth keeping:** it had treated a catalogue number as immovable without checking whether it was actually cited. **The never-renumber rule protects 5.27/5.30/5.36 — not all thirty-three ids.** Recorded in the coordination doc as the transferable half of P13.
- **→ T14 (blocking): FOLD, do not duplicate.** `test-cases/05-tickets-hierarchy.md` records the new refusal at **5.43** because that file holds no 5.34 today (its scope note reserves 5.4–5.36 for T14). **T14 must merge 5.43 into the corrected 5.34.** If it catalogues both, the same behaviour ships under two ids.
- Task 6 reviewer dispatched (opus, high). BASE = `4de901c`.

### Task 6: complete (commits 144de0d..97ece79, review clean)

Review: **Spec ✅ · approved · 1 Important (latent, ruled as P14 and routed to T12), 5 Minor, 1 ⚠️.**
The reviewer **reproduced five mutations itself** rather than reading the report — deleting the
`ticket-type.defined` dispatch case, hoisting the parent-type guard on BOTH the reparent and create
paths, restoring the pre-P13 defect, and keying the built-in lock on icon — and all five matched the
reported counts and lines exactly. Verified clean: C-24's two distinct parent-terminal rules, A18's
seed shape, C-04's rebound payload keeping `toStateId`, every assertion a literal (none routed through
`REFUSALS[...]`), C-12/Addendum 5's prior-event constraint, and P11's other half mutation-separated so
`ticket.unknown-type` and `hierarchy.parent-type-unknown` cannot be swapped unnoticed.

**Ruling P14 recorded (Addendum 10) — BLOCKING on T12, not on this merge.**

**Task 6: minor (deferred): F2** — the P13 test asserts a *neighbour* of the premise (that a different
workflow is accepted) rather than the premise itself (that the ticket type's own binding resolves). The
claim is **true and true by construction** — `buildMemoryContext`'s reducer throws on a `ticket.created`
whose type's workflow is undefined — so nothing false entered the record; it is under-evidenced, not
wrong. One line closes it. **→ routed to T7 as a rider.**
**Task 6: minor (deferred): F3** — "three `evaluateEvent` assertions" is really two plus two fixtures;
`ticket-type.test.ts` has no `evaluateEvent` entry and its dispatch coverage rests on the fixtures. The
catalogue at 5.42 states this accurately; the report and **coordination doc line 1110** do not. A future
task relocating those fixtures would silently reopen the very gap this task was credited with finding.
**→ routed to T7 as a rider** (reword the doc line, or add the third describe).
**Task 6: minor (deferred): F4** — the hop-ceiling docstring claims a certainty it has only practically
(`rank` has no maximum, so a legal chain deeper than 1000 is constructible in principle).
**Task 6: minor (deferred): F5** — Addendum 9a's stale comment at `refusals.ts:62-63` is still stale;
T6 touched the file but not those lines.
**Task 6: minor (deferred): F6** — `hierarchy.test.ts:432` hardcodes the workspace ULID where `WS` is
exported from `test-support.ts`. If `WS` moves, that test silently becomes a foreign-workspace case and
reds for P12's reason rather than the order it exists to pin — the same two-copies argument the task
used to justify hoisting `createdIn`.

**⚠️ F7 → T14, sizing information it must be dispatched with:** the plan's canonical refusal table
(`2026-08-20-03-tickets-hierarchy.md:70-80`) is now **six shipped ids behind**, not one —
`ticket.already-exists`, `hierarchy.parent-type-unknown`, `ticket.rebound-same-workflow`,
`ticket.rebound-unknown-state`, `ticket.rebound-unknown-workflow`, `type.builtin-rank`. The section is
headed "exact strings — a deliverable of this plan", so T14's reconciliation is six ids wide, plus the
5.43→5.34 fold.

- Task 7 dispatched (opus, high — core semantics: engine checks). BASE = `97ece79`.
- **Rebased onto `dd9c221`** (lane 2's PR #22 — `envelope.ts` settled). **One conflict**, on the coordination doc: lane 2's "Plan 4 execution consequences" section against my P13 section, both appended at the end. Resolved by **keeping both in merge order** per pre-ruling 6 — verified no markers remain and both headings are present. Gate re-run: **15/15 green**; fixture gate 64 matching the directory. Verified the new door at source rather than on the peer's word: kind-sensitive entity ids at `envelope.ts:96` (`entity.kind === 'membership' ? MEMBERSHIP_ID_REGEX : ULID_REGEX`), payload presence at `:124` (`.refine((value) => value !== undefined, 'is required — an event with no payload is not a claim')`).
- **Method note adopted from lane 2 (second independent confirmation this session): `grep -r` over a directory is unreliable under the rtk proxy** — a silent empty result is indistinguishable from a true negative, which makes it the wrong instrument for "does this claim have a referent anywhere". Use `find … | xargs grep` with explicit file enumeration. Binding on T8's harness-versus-domain pass, which is a series of NEGATIVE claims. (My own Addendum 8 comparison was done by reading line ranges directly, not by grep, so it stands; the `z.unknown()` sweep's error was radius, not tool.)
- **Rule adopted: for every sentence asserting that something happens, is inherited, or now fails — run it; if you cannot run it, do not assert it.** Lane 2 had four false prose claims on one branch, the fourth introduced *by the fix for the third*.
- Task 7 dispatched (opus, high). BASE = `5f80986`.

### Weekly-pool stall (2026-08-28 → 2026-08-31), no gate thinned

Task 7's first dispatch died on the account's weekly limit before doing any work — the agent's whole
output was "I'll start by reading the required documents in order." Working tree verified clean, no
commits, no partial edits: nothing to recover.

Handled per the coordination doc's model/effort policy — *"Budget pressure is never grounds to thin a
gate. When the weekly pool nears its cap, the sanctioned response is to DEFER work … never to skip a
review, drop a refuter, or de-escalate below a class floor."* The lane **deferred** across the reset
and resumes at full depth: T7 re-dispatched opus-high with the identical brief, and the floor list
(T10, T12 implementer opus-high + reviewer `fable`) is untouched.

- **Rebased onto `2bc2e13`** while resuming. That commit is **documentation only** (560 insertions,
  coordination doc alone) — a sibling lane's `z.unknown()` sweep write-up, not a code fix — so all
  three sites in Addendum 7a remain open and still belong to T7 (`ticket-events.ts:33`) and T8
  (`harness.ts:32`, `:155`). **Verified by reading the shipped files, not inferred from the commit
  message.** Second conflict on the coordination doc, same shape as the last, resolved the same way:
  both sections kept in merge order, markers verified gone, both headings present.
- Gate after rebase: **15/15 tasks green**.
- Task 7 re-dispatched (opus, high). BASE = `d3751c8`.

### Task 7: complete (commit 2624e1a, review clean)

Review: **Spec ✅ · approved · 0 Critical, 0 Important, 4 Minor.** The reviewer **reproduced M1
itself**: under bare `z.unknown()` the ABSENT case fails at its own assertion (`:156`), the
present-but-undefined case fails at `:164`, and **both acceptances stay green** — the correct
signature, proving the two accepts are pinned independently rather than falling out of the fix. It
also verified every P14 citation against shipped files, including checking **all three** selector
branches of `projections/workflows.ts` for a tenancy filter (none has one, as the record claims), and
confirmed the inherited `:76-78` → `:74-76` correction is right. Addendum 10 corrected in place.

**Ruling P15 — refuse a whitespace-only title at CREATION, matching the edit door.** `' '` is legal at
creation (`ticketCreatedPayload.title` is `z.string().min(1)`, no trim) and refused as a later change
via `field.title-required`. So "the title that cannot vanish" is an **edit-time rule, not an
invariant**: the create door admits precisely the state the edit door forbids. — Why: lane 2 shipped
exactly this treatment for `workspace.created`/`project.created` names days ago, and **refuses rather
than trims**, on the reasoning that rewriting `'  Corner  '` to `'Corner'` puts words in the actor's
mouth. Plan 3 matching that keeps one answer across the series rather than two. — Cost if wrong: a
whitespace title is refused at the door instead of entering the ledger and being unfixable by the
edit path that forbids it.

**Endorsed, not changed:** the reviewer confirmed `'   '` correctly earns `field.type-mismatch`
(`"Title" needs text.`) rather than `field.title-required`, whose sentence — "Change the title instead
of clearing it" — is true of an actor who sent `null` and false of one who typed spaces. That is the
read-the-reason-aloud test this plan has now applied five times.

**Task 7: minor → routed to T7b: the coalesce is now DEAD and cited in the present tense.**
`ticket-state.ts:201`'s `p.value ?? null` is unreachable (the `parse` above it throws first, and
`null ?? null` is identity), but three shipped comments still describe it as live —
`ticket-events.ts:36-38`, `fields.test.ts:232-241`, `test-cases/05-tickets-hierarchy.md:18`. The
implementer dropped the identical coalesce in `checks/fields.ts:112` for the reason that "keeping it
would state the defect as the design"; that argument applies verbatim to the site left standing.

**Task 7: minor → routed to T7b: a refusal reason with no subject.** `checks/fields.ts:104` joins
zod issue messages and drops the path, so the literal-asserted copy reads *"This ticket.field_set
event's payload is malformed: is required — a field claim with no value would record a clearing
nobody made"* — a sentence with no noun. `parse-event.ts:91-95` renders the same issue correctly by
interpolating the path. **Pre-existing A19 pattern**, byte-identical at `hierarchy.ts:65` and
`workflow-rebind.ts:54`; Task 7 is merely the first to route a path-dependent refine message through
it. Fix belongs across all three.

**Task 7: minor (closed by the reviewer, no action): the sweep's stated scope was one file narrower
than its claim** — `xargs grep` over `*.ts` excluded a `.json` fixture that does contain a
`ticket.field_set`. The reviewer checked it: that event is a PRIOR, uses the harness's `field`
spelling and carries an explicit value, so the conclusion stands.
**Task 7: minor (self-disclosed, noted): M3–M17 restorations verified by end state** rather than
per-mutation read-back. Committed tree confirmed clean and mutant-free.

**→ T14 (from the reviewer, declined as a finding):** the whitespace-title decision is plan-anticipated
`field.type-mismatch` copy, so it likely belongs folded into case **5.12**'s text rather than a new mint.

- Task 7b dispatched (opus, high — batched copy/schema corrections). BASE = `2624e1a`.
- **Task 7b implemented** (commits `2278e2a`, `9fe41aa`). Gate 15/15; domain 238, rule-engine 229, server 102. Fixture gate untouched at 64.
- **My brief undercounted the subject-less-message defect by more than half: I named three sites; shipped code has SEVEN.** The implementer found `checks/hierarchy.ts:65` AND `:203`, `checks/fields.ts`, `checks/ticket-type.ts`, `checks/workflow-rebind.ts`, plus **Plan 2's `transition.ts` and `workflow-defined.ts`** — and its argument for widening is the right one: those last two are *the templates a future check copies from*, so fixing three would have left the defect exactly where it propagates. All seven now route through one `malformedPayloadDetail` in `refusal-rules.ts` (the module all seven already imported — zero new import edges). Verified myself: seven files reference the helper and no raw `issues.map(...).join` survives except a comment explaining the old pattern, the harness's own already-path-carrying construction, and `workflow-defined.ts:47`'s *different* message over `validateWorkflowDef` issues rather than a `ZodError`.
- **It also pinned two Plan 2 sites that had NO literal assertion at all** — one for the dot join on a nested path (`comment.text`), one for the empty-path omission. Neither was pinned anywhere before.
- **Case-id arithmetic corrected again, in the same direction as before.** I said the next free id was 5.45; Task 7 had already minted 5.44–5.47, and the file's own scope note says continue from 5.48. The implementer followed the literal file per Addendum 3 rather than my number. **This is the second time the count-from-the-artifact rule has caught a stale absolute I supplied** — the tracker is a convenience, the file is the authority.
- **It fixed ten displaced `file:line` citations**, including `refusal-rules.ts:14` → `:16`, which had drifted onto `illegalTransition` while still claiming to name the parent-terminal rule id. A second enumerated sweep over every touched file came back empty.
- **Deliberately NOT fixed, correctly:** the harness's identical `payload.value ?? null` (`harness.ts:308`) is still *reachable*, because the harness's own prior-event schema is bare `z.unknown()`. Addendum 7a assigns that pair to T8, and dropping the coalesce without the schema fix would write `undefined` into fixture state — strictly worse.
- **→ T8: one residual gap.** P15 is proven at the schema, through `parseEvent`, and via `checkTicketCreated`'s `safeParse`, but has **no server-side end-to-end proof**, and `parseEvent`'s exact blank-title message was verified by a probe rather than pinned by an assertion. T8 owns those fixtures.
- Task 7b reviewer dispatched (opus, high). BASE = `2624e1a`.
- **Fixture-count arithmetic, verified at source (peer flagged; their figure was also short).** `origin/main` at `b0ef5f5` asserts **67** and holds **67** files (61 + lane 4's six). This lane asserts **64** and holds **64**. My true delta over main's base, computed by name-diffing the two directories rather than from any tracker: **exactly 3** — `rule-rdu-refuses-a-history-it-cannot-read.json` (T4b), `type-defined-accepts-builtin-rebrand.json` and `type-defined-refuses-builtin-rerank.json` (T6). **Post-rebase the gate is 67 + 3 = 70**, and after T8's thirteen it is **83** — not the 80 the peer computed, which counted main's 67 plus T8's 13 and missed the three this lane has already shipped. Neither of us should write an absolute from memory: **Ruling P6 stands — T8 counts the directory at its own commit time.**
- **Rebase deliberately HELD** until Task 7b's review clears. The reviewer is actively reading repo files to verify `file:line` claims; rebasing under it would shift the very line numbers it is checking. Same rule that kept me from rebasing under a running implementer.
- **Adopted from the coordination doc's new fan-out sizing section (`b0ef5f5`): a mutating fan-out needs ONE WORKTREE PER AGENT, never a shared one.** Thirteen concurrent mutation-testers on one worktree nearly produced a false security finding in a sibling lane's review. **Binding on this lane's final whole-branch review**, whose refuters mutate.

### Task 7b review: Spec ✅ (all three items) · approved · 3 Minor — fix round 1 opened

Reviewer verified the seven-site consolidation independently: `git grep` for payload-refusal parse
sites yields **exactly seven**, all now routing through `malformedPayloadDetail`; there is no eighth,
and the four non-sites are correctly excluded. It also strengthened the implementer's own argument —
**the "template" claim is literally true in-repo**: five separate files cite `transition.ts` as the
precedent to copy from (`checks/hierarchy.ts:41`, `evaluate.ts:17`, `checks/context-helpers.ts:13`,
`test/hierarchy.test.ts:184`, `test/reparent.test.ts:279`). Fixing my three and leaving the file
everything else names as the pattern would have left the defect where it propagates.

Byte-identity through `malformed:` confirmed to hold **by construction, not luck** — both
`reasonStartsWith` fixtures stop at the colon and the path clause lands inside `detail`.
`workflow-defined.ts:47` verified correctly left alone **at the type**: `validateWorkflowDef` returns
`Issue[]` (`{code, message}`, no path), not a `ZodError` — and that join already has its own witness.
P15's mutation specificity holds **by construction** independent of the reported run: dropping the
refine leaves `.min(1)`, so `''` stays red and only the whitespace case flips.

**Ruling P16 — I ratify the cross-plan widening, and it gets told to the cross-lane controller.**
Task 7b edited two **Plan 2** files its brief did not name (`transition.ts`, `workflow-defined.ts`).
Nothing forbade it — the only pure-consumer restriction on this lane is Addendum 4 (`envelope.ts`) —
and the outcome is strictly better, with both shipped fixtures still holding byte-for-byte. But it is
**user-visible refusal copy in another plan's files, changed on a shared branch without a prior
ruling**, so it is ratified explicitly here rather than left implicit, and the cross-lane controller is
notified. — Cost if wrong: a sibling lane transcribing Plan 2's copy meets a message shape its plan
text does not show; the notification is what makes that discoverable rather than surprising.

**Reviewer finding in the implementer's favour (recorded, no action):** the disclosed `parseEvent`
blank-title gap is **narrower than disclosed**. An assertion does not belong here — the sibling lane
pins nothing at the door for its own blank-name rule, this file's convention asserts the *code* not the
message, and the construction is already pinned at `test/parse-event.test.ts:61`. The probed string is
**derivable** from `parse-event.ts:91,95` plus P15's refine, not merely observed.

- **M1 → fix round:** a repointed citation names `fieldId` and points at `ticket-events.ts:91`, which is
  `value: z`. `fieldId` is `:90`, the schema declaration `:89`. **The same defect class the task existed
  to fix, introduced by the fix itself**, in a lane that treats `file:line` as load-bearing.
- **M2 → PROMOTED into the fix round:** `malformedPayloadDetail`'s `.join('; ')` separator is
  unwitnessed — all seven literal assertions are single-issue, and a one-element join is identical for
  any separator. Promoting because the reviewer found an explicit in-file precedent **two lines below
  the new code** (`test/engine.test.ts:409-417`) that pins the analogous separator for the structural
  refusal and says so in as many words. New code, a precedent in arm's reach, no witness — that is the
  falsifiability line this lane holds everywhere else.
- **M3 → fix round (trivia):** a double blank line at `test/engine.test.ts:407-408`, and case 5.50 says
  "the three places that described the fold as live" where the task re-tensed **four** plus a fifth
  dangling reference — my stale count, carried into the catalogue.

**Ruling P16 — EVIDENCE CORRECTED (the conclusion stands; the reason I gave was wrong).**
I wrote that "five separate files cite `transition.ts` as the precedent to copy from", implying a
standing property of the repo. Enumerated per-tree rather than on the branch alone:

- **On `origin/main`, exactly ONE file cites `transition.ts`** — `packages/rule-engine/test/engine.test.ts`.
- **On this branch, SIX do** (one more than I said): `src/evaluate.ts`, `src/checks/hierarchy.ts`,
  `src/checks/context-helpers.ts`, `test/hierarchy.test.ts`, `test/engine.test.ts`, `test/reparent.test.ts`.
- **Four of those files do not exist on main at all**, and a fifth citation (`evaluate.ts`) was added by
  this lane to a file that does. So **five of the six citations are lane 1's own, added since Plan 2
  merged.**

**That is a stronger argument than the one I made, not a weaker one.** "A future check would copy this
template" is a prediction, and invites the reply *"then fix it when one does."* What the enumeration
actually shows is that **the copying already happened, five times, inside one lane, in weeks** — the
template thesis is a **measurement, not a forecast**. P16's conclusion is unchanged and better
supported; only its stated reason needed repair, and a wrong reason in a durable record is worse than
none.

Method note on how the error survived: I swept **only my own branch** and reported a repo-wide property.
The cross-lane controller swept only `main`, got 1 against my 5, and would have called P16 overstated —
its positive control is what made it ask which tree the citing files live in. **Two agents, two
single-tree sweeps, one claim about "the repo".** The rule this adds to the count-from-the-artifact
family: **when a claim is about the repo rather than a branch, name the tree you swept and sweep the
others.**

**Collision cleared for P16 by the cross-lane controller**, verified by file-by-file enumeration with
positive controls: lanes 2, 3 and 4 each show **zero** files changed against `origin/main` for both
Plan 2 paths, and the only sites carrying both `detail` and a malformed-payload string are the two
source files plus `fixtures/harness.ts` — an identical set in all four trees. **No sibling holds an
independent assertion on that copy**, so the change breaks nothing.

### Task 7b: fix round 1/5 (4 addressed, 0 open) → complete (commits 2624e1a..c94b103, review clean)

Scoped re-review: **M1, M2, M3a, M3b all ADDRESSED; no new breakage; nothing weakened.** The
re-reviewer **reproduced the M2 mutation itself** rather than judging the transcript —
`.join('; ')` → `.join(', ')` produced exactly one failure at `engine.test.ts:428`, the assertion's own
line, with 229 pre-existing tests still green, which independently confirms none of the other six call
sites pin the separator. It checked **all twelve** `file:line` citations rather than the four I asked
for, including the three previously waved through, and verified the "nothing cites a line in this
round's files" claim tree-wide. It also traced M1's birth with `git log -S` to the exact commit and
showed the two same-filename citations that were collapsed into one repair row — corroborating the
mechanism rather than accepting it.

One refinement worth keeping: the mutation run needed **no build**, because rule-engine tests import
`../src/` directly; the build was only needed for the implementer's separate direct-observation probe.
The conclusion held either way, but the reason given was one step off.

**→ T8 (rider, not a fix round): a false capability claim in the fix diff.**
`packages/rule-engine/test/engine.test.ts:412-413` says `ticketCreatedPayload` "is the one payload here
that **can** fire two independent issues from one candidate." False as a capability claim —
`ticketWorkflowReboundPayload`, `ticketFieldSetPayload` and `workflowDefinedPayload` can each fire two.
True as *"the one this suite does fire two from"*, which is the report's own phrasing. **One-word
repair: `can fire` → `fires`.** The pin itself is sound and nothing depends on the sentence, so this
does not extend the loop — but it is the M1 genus recurring inside the fix for M1, and this lane does
not silently keep false sentences. T8 takes it as a one-liner, same treatment as the
`(unmapped-drop)` fixture note.

**Deferred, recorded (no action):** the citation re-sweep's file set excludes `.superpowers/`, where
`progress.md` does cite line numbers — harmless this round (both edited files took 1-for-1
replacements) but worth naming before a round that inserts lines into a cited test file. And the new
assertion pins zod's own message literal, so a zod minor bump could redden it — a pre-existing
convention (`engine.test.ts:403` already does this), not introduced here.

### Rebase onto `53fee20` — five conflicts, one automation defect, one real integration consequence

Tree clean, no operation in flight, **gate 18/18 green** (was 15 — main gained packages). Branch is 16
commits ahead. **Fixture count VERIFIED BY COUNTING at every step, never computed:** 67 (main) → 68 at
Task 4b → 70 at Task 6. Adopted mid-rebase from the peer's PR #29: **naming the commit is not
sufficient — the tree must be clean and no operation in flight.** I was mid-rebase when that arrived,
so any count I took then would have come from a half-applied tree; the preconditions are now checked
explicitly before each count.

**Two conflicts needed judgement, not keep-both:** `Features.md` and `fixtures.test.ts`, where lane 4's
contest work and this lane's fixtures both moved the same number. Resolved by **summing deltas** per
pre-ruling 6 and then counting the directory to confirm — 68 and 70 both matched.

**One automation defect, recorded rather than amended away.** I scripted keep-both after the third
identical conflict and it produced a duplicate import (TS2300): a later Plan 3 commit had already
widened `import { checkTicketCreated }` to also bring `checkTicketReparented`, so keeping both sides
kept the narrower one twice. **Keep-both is correct for hunks that ADD disjoint things and wrong for
hunks where one side SUPERSEDES the other** — an import list is the second kind often enough to
deserve reading rather than scripting. Committed as `32a6072` with that lesson in the message.

**One real integration consequence of my own ruling — and it is the interesting one.** Ruling P3 made
`getTicketTypeDef` a **required** method on `EngineContext`. "Required" means every context literal in
the monorepo is incomplete until updated, and two of them are **Plan 10's contest tests**, which merged
while this lane ran. Both now carry it, throwing rather than answering null — matching that file's own
stance ("a wiring bug, not a refusal") and the harness's, where null would make a rank check refuse for
a reason that reads entirely legitimate.

**The second literal's comment had to move with it**, and that is the part worth keeping: it explained
that omitting the optional `getContest` left *"this three-method literal directly assignable"* — the
**arity was load-bearing in that sentence**, and a fourth required method makes it false. **A true
comment made false by somebody else's change** is now the fifth instance of that class on this branch,
and it does not get an exemption for living in a file this plan does not own. Committed as `2b3a51a`;
P16-class, so the cross-lane controller is notified.

**Owner ruling absorbed (Fable narrowed, #27/#28) — affects the FINAL review, not the task loop.**
Three of the four whole-branch review lenses move to **opus at `max`**; **adversarial refuters and the
mocked-contract lens stay `fable`**, the latter now its own row. **Floor-list task reviewers unchanged**
— for this lane that is T3, T10, T12 and the RDU decision, of which T3 and the RDU decision are already
done at `fable`. Explicitly NOT a licence to tier down at discretion: one row narrowed, class floors
hold, escalation still runs upward, deferral remains the response to budget pressure. The peer argued
against and was overruled; its argument is recorded in the doc as overruled, so it is weighed rather
than rediscovered. **Worktree-per-agent for the refuters is unaffected — a refuter mutates at any tier.**
- **Cross-lane edit to `contests.test.ts` CLEARED** by the cross-lane controller — lanes 2, 3 and 4 all show zero changes against `origin/main` for that path, committed and working-tree, with a **positive control** on the same query returning this lane's own four changed fixture files. The zeros are real zeros, not a silent-empty result.
- **Count independently verified at this tree:** holds 70, asserts 70, `main-unique = 0` (so the rebase is fully applied), and the three unique files are exactly the ones named. 67 → 68 → 70 reconciles at every step. **First count in this whole exchange that needed no correction** — because it was the first taken with the preconditions checked.
- **Scheduling consequence worth acting on: Plan 10 T4 (lane 4) is the §11 closer and WILL touch `contests.test.ts`.** No conflict today because lane 4 has nothing pending there. **If Chain A's PR lands before lane 4 starts T4, the ordering is clean and lane 4 rebases onto this change; if T4 starts first, two lanes edit one test file for unrelated reasons.** That is an argument for landing Chain A promptly rather than batching it with Chain B.

### Final-review lens to add (from the peer's observation, and it is right)

Five instances on this branch of **a true comment falsified by a change elsewhere** — the harness's
memberships note, the `PLAN 3 TASK 12` seam comment, `refusal-rules.ts`'s post-P12 stale line, Task 6's
"three assertions", and `contests.test.ts`'s three-method arity. The peer's read: *"the count is
starting to look like a category rather than a run of bad luck."* Agreed, and it generalises — every
one was a sentence that was **true when written**, made false by a change its author never saw, and in
four of five cases the falsifying change was in a different file.

**So the final whole-branch review gets an explicit lens for it**, rather than hoping a
correctness-shaped lens trips over it: *find every comment, doc-string and catalogue line whose claim
depends on something outside the file it lives in, and check whether that thing still holds.* This is a
different search from "is the code right" — the code is right in all five instances, which is exactly
why nothing caught them. It pairs with the citation-sweep obligation already recorded (twelve
`file:line` citations hanging off three files).

### The batching rule gets a clause — and it exonerates the Chain A/B split rather than excusing it

The cross-lane controller raised the tension I had only half-noticed: splitting Chain A and Chain B
means two whole-branch reviews, neither of which sees A↔B interaction — and the batching rule merged
this morning says exactly that a lens reading two branches separately cannot see between them. The
fold is in Chain A; the projections that call it are in Chain B. That is real interaction.

**The resolution is a distinction the rule did not draw, and it is right:**

> **Batching earns its keep when branches are CONCURRENT and none is on `main`. It earns much less when
> they land SEQUENTIALLY, because the later review reads the earlier as merged context.**

Lane 4's branches were concurrent — accumulated slices, none merged — so a per-branch review genuinely
never saw the pair. **This lane's chains are sequential:** by the time Chain B is reviewed, Chain A is
on `main`, so Chain B's whole-branch review reads the fold **as part of the base it checks against** —
a different vantage and arguably a better one, because it is the state the product will actually be in.

So the Chain A/B split loses far less coverage than the rule as written implies, and the
`contests.test.ts` overlap argument stands unopposed. **Land Chain A alone as soon as Task 8 clears.**

### COMMITMENT — report the outside-the-file lens's hit rate, including a negative

The cross-lane controller has asked for the hit rate before the lens becomes standing, and explicitly
wants the **negative result** if it finds nothing rather than a quiet drop. That is the right bar and I
agreed to it.

**Where this gets recorded matters more than that I agreed.** A commitment living only in this ledger
is gitignored, and that is precisely the failure Plans 1 and 2 each hit. So: **the final whole-branch
review's outcome carries the lens's hit rate into
`docs/superpowers/plans/2026-08-20-00-series-coordination.md`, in the fix wave's own commit** —
whichever way it comes out, with the five known instances named as the sample it was built from. A lens
that finds two more on a branch this size is worth making standing; one that finds none is worth
knowing, and a null result reported is worth more than a rule adopted on five anecdotes.
- **Session-limit stall (second), reset and resumed at full depth.** Task 8's reviewer died before doing any work (output was one line). Nothing to recover; tree verified clean. Per policy: **defer, never thin** — re-dispatched at the same tier.
- **Rebased onto `5f3a034` — CLEAN, no conflicts** (main's six new commits are lane 2's auth work and touch nothing this lane owns; main's fixture count is unchanged at 67). Gate **18/18 green**. Counted with preconditions checked: directory **84**, assertion **84**. Branch 19 commits ahead.
- **Rebased BEFORE the review deliberately**, so the reviewer judges the state that will actually merge rather than a state the rebase would invalidate — and so Chain A's PR is ready the moment the review clears. Review package regenerated at the new SHAs (`d4b0b7f..11f1fb3`).

### Three owner-directed economy changes — audited, adopted, one caveat

**1. Sonnet rows enforced. Audit of this lane, honestly:**

| Dispatch | Row | Tier used | Verdict |
|---|---|---|---|
| 12 pre-flight task extractors | "extractors, grep verifiers, pure search" → sonnet low | **sonnet low** | ✅ compliant |
| T3, T5, T6, T7 | "engine checks, reducers, folds" → opus high | opus high | ✅ correct row |
| T4, T4b, T8 | core semantics / fixture authoring → opus high | opus high | ✅ correct row |
| T7b | batched copy+schema corrections | opus high | **arguable** — sonnet medium was defensible; the schema refine and refusal-copy judgement pulled it up, but I did not audit before sending |
| **T9, T11** | "projections" is named in the core-semantics row | opus high | correct row |
| **T10, T12** | floor list | opus high + `fable` reviewer | non-negotiable |
| **T13** | route body is transcription; only the `AppDeps` widening is judgement (ruling P7, already decided) | **→ sonnet medium** | **switching** |
| **T14** | "Features.md/test-cases catalogue tasks" is an explicit sonnet row | **→ sonnet low–medium** | **switching** |

Two remaining dispatches move down. The rest sit on rows the table names as opus — this lane is
mostly core semantics, which is *why* its sonnet share is low, but T7b shows I was not auditing before
sending, and T13/T14 would have gone out at opus by default. **Every remaining dispatch gets a row
check before it is sent.**

**2. Context reduction — adopted with one caveat I must state rather than silently fail.** I cannot
`/clear` myself; that is a user action, and no tool available to me does it. What I control: keeping
tool output lean, not re-reading files already read, and **making the ledger sufficient to reconstruct
the lane from cold** — which is what it is for ("the ledger is your recovery map"; controllers without
one have re-dispatched entire completed task sequences). Verified sufficient: it carries every ruling
P1–P16 with cost-if-wrong, every task's commits and review outcome, the deferred-minor roll-up, the
cross-task routings, and pointers to the conflict table and riders file. **If this session is cleared,
`progress.md` + `preflight-conflict-table.md` + `task-8-riders.md` are the recovery set.**

**3. Cross-lane messages are short pointers from here.** Mine have been long. Adopted.

**Correction owed to the peer:** its parting figure "count don't compute — 83" is stale. T8 shipped
**fourteen** fixtures, not the brief's thirteen, so the count is **84** — counted at a clean tree with
no operation in flight, and matching the gate.

### Worktree contaminated mid-review by a sibling controller (2026-08-31) — handling

The cross-lane controller `cd`'d into this worktree to verify a finding and then ran
`git checkout watch/orphaned-shas-resolve` from the same shell. **This worktree sat on another branch
while Task 8's reviewer was running.** Reflog pins the window exactly: checkout out at
`13:24:42`, restored at `13:25:08` — **26 seconds**, not the ~2 minutes reported.

**State verified after restoration, by me, not on their word:** branch `exec/03-tickets-hierarchy`,
HEAD `11f1fb3`, 19 ahead, tree clean, fixtures 84 counted / 84 asserted. Nothing uncommitted was lost —
the tree was clean at the moment of the swap.

**A transient ` M packages/rule-engine/src/checks/hierarchy.ts` I caught mid-check was NOT damage** — it
was Task 8's reviewer mutating the cycle guard to test falsifiability and restoring it seconds later.
Worth recording because it nearly read as contamination: **during an active mutation review, "tree
clean" is a racing check.** Its result depends on when in the reviewer's cycle it lands.

**Disposition of the review — repair the input, do not re-run the gate.** The reviewer's visible
activity after `13:25:26` is against the correct tree (it mutated `hierarchy.ts`, saw 84 passed + 1
failed of 85, restored, saw 85 passed — figures that only exist on this branch; `main` has 67
fixtures and none of the `checks/` modules). What I cannot establish is what it read **during** the
26-second window, and a review that may have read another tree is not evidence.

So: **let it finish** (killing it mid-mutation risks leaving a mutated file), then **send it a targeted
re-verification** naming the exact window and asking it to re-confirm its file-based findings. Same
reviewer, same tier, contaminated input repaired — **not** a thinned gate, and far cheaper than
re-running a 200KB opus review whose reasoning is mostly sound.

**Method note for the final review, which uses one worktree per mutating agent:** this incident is the
single-controller version of the hazard that rule was written for. It adds a case neither rule covered
— **the mutation came from OUTSIDE the fan-out entirely**, from a peer with filesystem access to a lane
it does not own. Worktree isolation between my own agents would not have prevented it.

- **`origin/main` moved again (behind 1).** Rebase after the review clears, not during — the reviewer
  is reading files.
