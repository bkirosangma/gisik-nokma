# Workflow Engine & Rule Vocabulary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pass-through rule engine with the real workflow engine — workflow definitions as validated data, the five-rule closed vocabulary, workflow versioning with state mappings, the parent-terminal invariant, and a planted-defect fixture suite that client and server builds both run.

**Architecture:** `packages/domain` gains the workflow vocabulary (zod schemas + pure structural validation, I/O-free so the later builder UI calls the same function) and the one pure forward state-id walk, `foldStateIdForward` — in domain rather than in the engine because the engine, Plan 3's ticket projection and Plan 10's offline replica all fold across versions and must fold identically. `packages/rule-engine` gains the real `evaluateEvent`: a dispatcher that handles `ticket.transitioned` (workflow resolution, transition legality, the parent-terminal invariant, transition rules in order — first refusal wins) and `workflow.defined` (structural validation + versioning + stranding refusals), passing every other event type through. Every refusal path is proven against a planted defect in a JSON fixture before it is trusted; the fixture suite is exported so later server-side plans run the identical fixtures. `apps/server` gains the `proj_workflows` projection backing `EngineContext.getWorkflowDef`, recording each version's publish position so a definition can be resolved as of a point in the ledger and not only as of now.

**Tech Stack:** TypeScript strict on Node 22 LTS, pnpm 9 workspaces + Turborepo, zod for schemas, Vitest for tests, Postgres 16 via `pg` + node-pg-migrate for the projection.

**Spec:** `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md` — this plan implements the **engine half of §4** (workflow engine and rule vocabulary; the builder UI is a later plan) plus honesty-contract **invariants 2 and 6** (refusals over intentions; every refusal proven against planted defects) and the engine side of **invariant 3** (parents cannot outrun children).

**Plan series:** This is **Plan 2 of 11**. It consumes Plan 1's interfaces — `packages/domain`'s `EventEnvelope`, event-type registry, and pure `parseEvent`; `packages/rule-engine`'s frozen `evaluateEvent` signature with `Accept`/`Refusal`/`EngineContext`; `apps/server`'s ingest pipeline (which already calls `evaluateEvent(env, ctx)` on every event), projection registry (`registerProjection({name, apply, reset})`, tables prefixed `proj_`), and the verify-projections rebuild-and-diff CLI. It produces the engine, the shared fixture suite, and the workflow vocabulary that Plans 3–11 (ticket events, sync, clients, builder UI) depend on by name.

## Global Constraints

Copied verbatim from the binding engineering contract shared by all plan-writers:

- MONOREPO: pnpm workspaces + Turborepo, TypeScript strict, Node 22 LTS, pnpm 9. TESTING: Vitest. IDS: ULID via `ulidx`.
- EVENT ENVELOPE (exact, from packages/domain):

```ts
type EventEnvelope = {
  id: string; workspaceId: string;
  entity: { kind: 'workspace'|'project'|'ticket'|'workflow'|'ticket-type'|'membership'; id: string };
  type: string; version: number; payload: unknown;
  actorId: string; origin: 'web'|'mobile'|'desktop'|'server';
  clientTime: string; serverTime: string; seq: number;
}
```

- RULE ENGINE INTERFACE (exact — this plan implements the function body, the signature is frozen):

```ts
type Refusal = { refused: true; rule: string; reason: string }  // reason: plain language, names the rule
type Accept  = { refused: false }
type EngineContext = {
  getEntityState(kind: EventEnvelope['entity']['kind'], id: string): Promise<EntityState | null>;
  getChildrenStates(ticketId: string): Promise<TicketState[]>;
  getWorkflowDef(workflowId: string, version?: number): Promise<WorkflowDef | null>;
}
declare function evaluateEvent(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal>
```

- WORKFLOW DEFINITION (exact, goes in packages/domain — later plans and the builder UI depend on these names):

```ts
type StateCategory = 'open'|'active'|'terminal'
type WorkflowDef = {
  id: string; version: number; name: string; initialStateId: string;
  states: { id: string; name: string; category: StateCategory }[];
  transitions: { from: string | '*'; to: string; rules: Rule[] }[];
}
type Rule =
  | { kind: 'restrict-to'; assignee?: boolean; roles?: string[]; userIds?: string[] }
  | { kind: 'require-comment' }
  | { kind: 'require-evidence' }
  | { kind: 'require-field'; field: string }
  | { kind: 'require-different-user'; thanActorOf: { to: string } }
```

- INVARIANTS ABOVE ALL WORKFLOWS (implemented here, not authorable away): the parent terminal-transition refusal (a `ticket.transitioned` into a terminal-category state is refused while any child ticket is non-terminal — children via ctx.getChildrenStates); provenance is structural (events carry actor/times already).
- Constraints carried from the base (spec, verbatim): `reference/` stays frozen; corrections happen upstream and are re-snapshotted with a new commit reference. `Features.md` and `test-cases/` stay in sync with reality in the same change set. Checks are proven against planted defects before they are trusted. Commits are prose that says what was found and why it matters. One PR per change, branched off `main`, merged only with explicit approval.
- Workspace coding standards (`/Users/kiro/my_projects/CODING_STANDARDS.md`): `snake_case` for database tables and columns; intent-revealing identifiers; testing pyramid; validate at every boundary.

### Cross-plan coordination assumptions

Plan 1 is being written in parallel; where its exact spellings are not in the binding contract, this plan assumes the following and the executor adapts **only the named surface** (never the behavior) if Plan 1 chose differently:

- **Package names:** `@gisik-nokma/domain` and `@gisik-nokma/rule-engine`, settled per the coordination doc (§1).
- **ESM style:** NodeNext module resolution with explicit `.js` suffixes on relative imports. If Plan 1 chose bundler resolution, drop the suffixes.
- **Registry API:** event types register via a call in `packages/domain/src/event-types.ts` of the shape `registerEventType({ type, version, payloadSchema })`. Adapt the one registration call site to Plan 1's actual shape; the type string `workflow.defined` and the schema are binding.
- **Rule-engine internals:** Plan 1 exports `Accept`, `Refusal`, `EngineContext` from `packages/rule-engine` (assumed internal path `src/types.ts`) and the pass-through `evaluateEvent` from `src/index.ts`. Locate with `grep -rn "evaluateEvent" packages/rule-engine/src` before Task 5.
- **Projection registry:** `registerProjection({ name, apply, reset })` where `apply(env: EventEnvelope, db)` and `reset(db)` receive a `pg`-style handle with `query(text, values)`. Locate with `grep -rn "registerProjection" apps/server/src` before Task 12.
- **Server ctx:** Plan 1's `EngineContext` construction for ingest lives somewhere under `apps/server/src` (assumed `src/engine-context.ts`); locate with `grep -rn "getWorkflowDef" apps/server/src`. In this plan only `getWorkflowDef` gets a real implementation; `getEntityState`/`getChildrenStates` stay Plan 1's stubs (`null`/`[]`) until Plan 3 delivers ticket projections. Consequence, stated so nobody "fixes" it: on the live server a `ticket.transitioned` would refuse as `unknown-ticket` — which cannot actually occur before Plan 3, because `ticket.transitioned` is not a registered event type until Plan 3, so ingest refuses it earlier as an unknown type.
- **zod:** code below uses only API surface shared by zod v3 and v4 (`z.object`, `z.enum`, `z.discriminatedUnion`, two-argument `z.record`, `safeParse`, `.default()`, `.optional()`). Whichever major Plan 1 pinned works unchanged.
- **Vitest configs:** if a package lacks a `test` script or vitest config, the task that first tests it adds them (exact content given in Task 1, Step 1).

## File Structure

```
packages/domain/
  src/workflow.ts              # NEW — StateCategory/WorkflowState/Rule/Transition/WorkflowDef schemas,
                               #        WorkflowDefinedPayload (def + optional stateMapping), PublishedWorkflowDef,
                               #        hasStateMapping guard, TicketTransitionedPayload schema,
                               #        foldStateIdForward/FoldedState — the PURE version walk, in domain because
                               #        the engine, the server projection and the offline replica all need it
  src/entity-state.ts          # NEW — TicketState, MembershipState, OtherEntityState, EntityState, WorkspaceRole, membershipId
  src/validate-workflow.ts     # NEW — Issue, validateWorkflowDef (pure, I/O-free; the builder UI calls this same function),
                               #        plus the exported label() helper the advisory tier shares
  src/advise-workflow.ts       # NEW — Advisory, adviseWorkflowDef (the warning tier; the rule engine NEVER calls it)
  src/event-types.ts           # MODIFY (Plan 1's) — register 'workflow.defined' v1
  src/index.ts                 # MODIFY (Plan 1's) — re-export the new modules
  test/workflow-schema.test.ts # NEW
  test/entity-state.test.ts    # NEW
  test/validate-workflow.test.ts # NEW
  test/advise-workflow.test.ts # NEW

packages/rule-engine/
  src/evaluate.ts              # NEW/REPLACE — the real evaluateEvent dispatcher
  src/refusal-rules.ts         # NEW — REFUSAL_RULES canonical rule-name constants
  src/workflow-defined.ts      # NEW — structural + versioning + stranding refusals
  src/transition.ts            # NEW — ticket.transitioned evaluation (built up across Tasks 6-8)
  src/version-map.ts           # NEW — resolveStateIdForward (fetches intermediates through ctx, then delegates the
                               #        walk to domain's foldStateIdForward) + resolveCurrentStateId
  src/rules/types.ts           # NEW — TransitionRuleInput, RuleEvaluator
  src/rules/index.ts           # NEW — evaluateTransitionRules (ordered, first refusal wins, exhaustive switch)
  src/rules/require-comment.ts # NEW
  src/rules/require-evidence.ts# NEW
  src/rules/require-field.ts   # NEW
  src/rules/restrict-to.ts     # NEW
  src/rules/require-different-user.ts # NEW
  src/fixtures/harness.ts      # NEW — fixtureSchema, loadFixtures, completeEnvelope/completeCandidate,
                               #        buildInMemoryContext, assertFixtureOutcome (framework-free)
  fixtures/*.json              # NEW — 59 planted-defect fixtures (inventory in tasks below)
  src/index.ts                 # MODIFY (Plan 1's) — export engine + fixture harness
  test/harness.test.ts         # NEW
  test/fixtures.test.ts        # NEW — the runner: iterates every fixture

apps/server/
  migrations/<timestamp>_proj-workflows.ts  # NEW — proj_workflows table
  src/projections/workflows.ts              # NEW — workflowsProjection + getWorkflowDefFromProjection
  src/engine-context.ts                     # MODIFY (Plan 1's, locate by grep) — wire real getWorkflowDef
  test/proj-workflows.test.ts               # NEW — integration (TEST_DATABASE_URL-gated)

Features.md                    # MODIFY — new section for this subsystem (same change set)
test-cases/04-workflow-engine.md # NEW — scenario catalogue mirroring the Features.md section
```

## Open questions

Flagged, never silently resolved. None blocks execution — each names the decision taken and why.

1. **Registry API shape** — the binding contract does not spell Plan 1's `registerEventType` signature. Taken: assumed `registerEventType({ type, version, payloadSchema })`; only the call site adapts.
2. **Package names / import specifiers** — settled: the packages are `@gisik-nokma/domain` / `@gisik-nokma/rule-engine`, per the coordination doc (§1).
3. **`EntityState`/`TicketState` ownership** — the frozen `EngineContext` references these types but the contract does not define them. Taken: this plan defines them in `packages/domain` (Task 2) with exactly the fields the engine reads; if Plan 1 created placeholder definitions, this plan's shapes replace them and Plan 3's ticket projection must maintain every field (notably `stateCategory` and the `transitions` log).
4. **Membership entity-id convention** — `restrict-to` role checks need the actor's membership via `getEntityState('membership', id)`. Taken: `membershipId(workspaceId, userId) = "${workspaceId}:${userId}"`, exported from domain; the later auth/membership plan must adopt or renegotiate it.
5. **`registerProjection` handle types** — `apply`/`reset` assumed to receive a `pg`-style `query(text, values)` handle; adapt the two method signatures in Task 12 to Plan 1's actual types.
6. **"In-flight detection via ctx" vs the frozen `EngineContext`** — **SETTLED by the owner on 2026-08-26 (coordination doc, "Owner decisions (2026-08-26)"); this is permanent semantics, not a stopgap.** The assignment asks that a version that would strand *in-flight* tickets be refused, detecting in-flight via ctx. The rule is instead: publishing version N+1 that drops states version N has is refused unless `stateMapping` covers **every** dropped state, occupied or not. That rule is permanent and is not to be relaxed. The load-bearing reason is not a limitation of this plan's context — it is the shared-fixture promise. The rule engine runs identically on client and server, proven by one shared fixture suite (Task 4), and client replicas are visibility-scoped (spec §5, §6). A user who cannot see three tickets sitting in the dropped state computes occupancy 0 while the server computes 3; making publish legality depend on occupancy would make the two engines disagree **by construction** — precisely what the shared-fixture promise exists to prevent. Occupancy is therefore a **builder courtesy, never an engine input**: Plan 8's `GET /v1/workspaces/:workspaceId/workflows/:workflowId/state-occupancy` prefills the mapping dialog's counts and degrades honestly when that read fails. Supporting context, no longer the reason: the frozen ctx cannot enumerate tickets by state, and occupancy smuggled through `getEntityState('workflow', id)` was considered and rejected — in this plan the server ctx returns `null` for entity lookups until Plan 3, so occupancy-based detection would false-accept every mapping-less publish. Consequence for copy: neither the refusal nor any dialog may claim in-flight tickets it has not counted, so the `workflow-state-mapping` reason names the real reason instead. A real occupancy *count*, where one is actually computed, stays accurate and stays.
7. **`stateMapping` and the frozen `WorkflowDef`** — the frozen type has no `stateMapping` field. Taken: the mapping travels in the `workflow.defined` **payload** (`WorkflowDefinedPayload = WorkflowDef & { stateMapping?: Record<string, string> }`, exported as `PublishedWorkflowDef`); `getWorkflowDef` returns the stored payload, which structurally satisfies `WorkflowDef`; the engine narrows via the `hasStateMapping` type guard — no casts, no change to the frozen type.
8. **Fixture schema deviates from the assignment's singular shape** — `{name, workflowDef, priorEvents, candidateEvent, expected}` became `workflowDefs` (array) plus a `memberships` field. Reasons: the stranded-ticket defense needs **two** planted published versions at once, and role fixtures need memberships — but membership events belong to a later plan's vocabulary, and `priorEvents` must stay restricted to events a real server can eventually ingest, or the "same fixtures on the server" promise breaks.
9. **Integration-test DB convention** — `TEST_DATABASE_URL`-gated (`describe.skip` when unset, with a loud console warning); if Plan 1 established a different convention (docker-compose, per-test schema), follow Plan 1's.
10. **`require-different-user` vacuous acceptance** — **SETTLED by the owner on 2026-08-26 (coordination doc); three parts, all landed in this plan.** Creation is not a transition, so a rule that watches a move nobody can have made finds no prior performer and accepts vacuously — a creator could self-approve. The gap splits three ways and each half is now closed:
    - **Dead rule → publish-time refusal.** An RDU rule naming a state that no transition in this version enters is a structural error: `validateWorkflowDef` emits `rdu-unenterable-state` (Task 3) and the engine refuses the publish as `workflow-structure`. Given the existing `unreachable-state` and `terminal-no-inbound` checks this reduces, in a workflow that otherwise validates, to the initial state with nothing looping back — the exact self-approval hole this question named, caught at publish rather than tolerated at runtime.
    - **Bypassable rule → advisory.** A rule whose guarded transition is reachable from `initialStateId` **without** ever entering the watched state is real but not structural: the workflow works, and on one path the rule finds nobody to differ from. That is a warning, `rdu-bypassable`, and it lives in the separate `adviseWorkflowDef` tier (Task 3) precisely because a warning placed in `validateWorkflowDef`'s array would silently become a refusal.
    - **Cross-version disarming → per-entry `workflowVersion`.** Log entries used to store a raw `toStateId` and no version while RDU compared them against a state id in the *latest* definition, so a version that dropped and remapped a state left historical entries unmatchable: RDU found no prior performer and one person made both moves. Versioning quietly disarmed four-eyes. Each log entry now carries `workflowVersion` (Task 2) and the evaluator resolves a candidate entry's id forward through the version chain before comparing (Task 11).

    **Scope note this plan must not overclaim:** the advisory characterises reachable vacuous acceptance **within a single workflow version only**. The remap case above is the counterexample across versions — which is exactly why the per-entry version exists, and why the advisory is not, and must not be presented as, a complete account of when four-eyes can be satisfied by one person.

## Canonical refusal copy

Every refusal `rule` string and `reason` template, in one place. The rule modules below contain these strings literally, and every fixture's `expected.reason` must match them **character for character** — a mismatch is a bug in one of the two. `${…}` marks interpolation; everything else is fixed copy.

**Engine-level rules** (`rule` → reason template):

| `rule` | reason template |
|---|---|
| `malformed-payload` | `This workflow.defined event does not point at a workflow; it points at a ${env.entity.kind}.` / `This workflow.defined event's payload is malformed: ${zodIssues}` / `This workflow.defined event points at workflow ${env.entity.id}, but its payload defines workflow ${payload.id}.` / `This ticket.transitioned event does not point at a ticket; it points at a ${env.entity.kind}.` / `This ticket.transitioned event's payload is malformed: ${zodIssues}` |
| `workflow-structure` | `This workflow definition cannot be published: ${issue messages joined with ' '}` |
| `workflow-version` | `The first published version of a workflow must be version 1; this definition claims version ${v}.` / `Workflow "${name}" is at version ${latest}; the next published version must be ${latest + 1}, not ${v}.` |
| `workflow-state-mapping` | `Version ${v} drops state(s) ${"ids each quoted, comma-joined"} that version ${prev} has; publishing cannot see which tickets sit in which state, so every dropped state needs a stateMapping entry.` / `The stateMapping remaps "${oldId}", but that state still exists in version ${v}; only dropped states may be remapped.` / `The stateMapping sends "${oldId}" to "${target}", but "${target}" is not a state in version ${v}.` |
| `unknown-ticket` | `This event moves ticket ${id}, but no such ticket is known.` |
| `unknown-workflow` | `Ticket ${ticketId} uses workflow ${workflowId}, but no published definition of that workflow is known.` |
| `stranded-state` | `Ticket ${ticketId} sits in state "${stateId}" of workflow version ${ticketVersion}, which no longer exists in version ${latestVersion} and no state mapping covers it.` |
| `unknown-state` | `The workflow "${defName}" has no state "${to}".` |
| `illegal-transition` | `The workflow "${defName}" does not allow moving from "${fromName}" to "${toName}".` |
| `parent-terminal-with-open-children` | `This ticket cannot enter "${toName}" while ${n} of its child tickets ${n === 1 ? 'is' : 'are'} still open.` |

**Vocabulary rules** (`rule` = the rule's `kind`):

| `rule` | reason template |
|---|---|
| `restrict-to` | `Only ${allowed parts joined with ', or '} may make this move, and ${actorId} is not among them.` — parts: `the ticket's assignee` / `anyone with the role ${roles joined with ' or '}` / `the named people ${userIds joined with ', '}`. Planted-empty defense: `This move is guarded by a restrict-to rule that names nobody, so nobody may make it.` |
| `require-comment` | `This move must carry a comment explaining it, and none was provided.` |
| `require-evidence` | `This move must carry an attachment as evidence, and none was provided.` |
| `require-field` | `This move needs the field "${field}" to be set first, and it is not.` |
| `require-different-user` | `This step needs a second person: ${priorActorId} already performed the move to "${to}" on this ticket.` |

**Structural issue messages** (`validateWorkflowDef`; `code` → message template). The `code`s beyond the assignment's five (`no-states`, `duplicate-transition`, `unknown-initial-state`, `empty-restrict-to`, `rdu-unknown-state`, `rdu-unenterable-state`) are additions, each with a one-line justification in Task 3; `unknown-initial-state` implements the coordination doc's contract amendment (§3) and `rdu-unenterable-state` the owner decision of 2026-08-26.

| `code` | message template |
|---|---|
| `no-states` | `This workflow has no states at all.` |
| `duplicate-state-id` | `Two states share the id "${id}"; state ids must be unique.` |
| `no-terminal-state` | `This workflow has no terminal state, so no ticket could ever finish.` |
| `unknown-transition-state` | `The transition from "${from}" to "${to}" refers to "${ref}", which is not a state in this workflow.` (raw ids — names may not resolve) |
| `duplicate-transition` | `There are two transitions from ${label(from)} to ${label(to)}; keep at most one transition per direction between a pair of states.` |
| `unknown-initial-state` | `This workflow's initial state is "${initialStateId}", but no state with that id exists.` |
| `unreachable-state` | `State "${name}" cannot be reached from the starting state "${startName}".` |
| `terminal-no-inbound` | `Terminal state "${name}" has no transition leading into it, so no ticket could ever reach it.` |
| `empty-restrict-to` | `A restrict-to rule on the transition from ${label(from)} to ${label(to)} names nobody: it must allow the assignee, at least one role, or at least one named person.` |
| `rdu-unknown-state` | `A require-different-user rule on the transition from ${label(from)} to ${label(to)} refers to a move to "${target}", but no state with that id exists.` |
| `rdu-unenterable-state` | `A require-different-user rule on the transition from ${label(from)} to ${label(to)} refers to a move to "${targetName}", but nothing in this version enters that state, so the rule can never require a second person.` |

The helper is `label(def: WorkflowDef, ref: string)`, exported from `validate-workflow.ts` because the advisory tier shares it; the tables above write `label(from)` as shorthand for readability, not as its signature. It renders `"${state name}"` for a known state id, `any state` (no quotes) for `'*'`, and `"${ref}"` for an unknown id.

Two deliberate differences between those last two rows, which an executor must not "harmonise": `rdu-unknown-state` interpolates the **raw id** (`${target}`) because the state does not exist and no name resolves, while `rdu-unenterable-state` interpolates the state's **name** (`${targetName}`) because the state does exist. And `rdu-unenterable-state` says "nothing in **this version** enters that state" rather than "nothing ever" — across workflow versions a legacy ticket can carry an older entry into that state forward, so an unqualified claim would overclaim.

**Advisory messages** (`adviseWorkflowDef`; `code` → message template). These are **warnings, not refusals** — they are returned by a separate function the rule engine never calls, and no refusal reason ever contains them (Task 3).

| `code` | message template |
|---|---|
| `rdu-bypassable` | `A require-different-user rule on the transition from ${label(from)} to ${label(to)} watches the move to "${targetName}", but this move can be reached without ever entering "${targetName}"; on that path one person can make it alone.` |

**A distinction the executor must hold:** the envelope's `version` field is the **event-schema version** (always `1` in this plan); the **workflow version** lives only in the payload (`payload.version`). Fixtures below default envelope `version` to 1 while payloads carry 1, 2, or 3.

---

### Task 1: Workflow vocabulary schemas in `packages/domain`

The rule vocabulary is closed and versioned — no user code, so refusals stay provable (spec §4). This task turns the frozen contract types into zod schemas, adds the two payload schemas the engine parses, and registers `workflow.defined` in Plan 1's event-type registry.

**Files:**
- Create: `packages/domain/src/workflow.ts`
- Modify: `packages/domain/src/event-types.ts` (Plan 1's registry — one registration call)
- Modify: `packages/domain/src/index.ts` (re-exports)
- Test: `packages/domain/test/workflow-schema.test.ts`

**Interfaces:**
- Consumes: nothing beyond zod and Plan 1's registry call shape (coordination assumption above).
- Produces (Plans 3–11 and the builder UI depend on these exact names): `stateCategorySchema`/`StateCategory`, `workflowStateSchema`/`WorkflowState`, `ruleSchema`/`Rule`, `transitionSchema`/`Transition`, `workflowDefSchema`/`WorkflowDef`, `stateMappingSchema`, `workflowDefinedPayloadSchema`/`WorkflowDefinedPayload`, `PublishedWorkflowDef` (= `WorkflowDefinedPayload`), `hasStateMapping(def)`, `ticketTransitionedPayloadSchema`/`TicketTransitionedPayload`, `foldStateIdForward(stateId, fromVersion, latest, intermediate)`/`FoldedState`; event type `workflow.defined` v1 registered with `workflowDefinedPayloadSchema`.

**`foldStateIdForward` lives in domain, not in the rule engine, and that placement is load-bearing.** Three consumers need the same walk: this plan's engine (`resolveStateIdForward`, Task 6, and `require-different-user`, Task 11), Plan 3's `proj_tickets` (which folds every affected row forward when a new version is published — the refresh-on-publish decision of 2026-08-26), and Plan 10's offline replica (which builds its read model from domain reducers and never from the server's pg projections, so it must fold locally or keep stale categories forever). `@gisik-nokma/domain` is the only package all three depend on — rule-engine depends on domain, not the reverse — so this is the one home that does not force a second copy. The function is **pure**: it takes the definitions it needs rather than fetching them, which is exactly what lets the async ctx-driven caller in the engine and the two synchronous callers with their definitions already in hand share one implementation.

- [ ] **Step 1: Ensure the domain package can run Vitest**

Check `packages/domain/package.json` for a `test` script. If Plan 1 already added one, skip this step. Otherwise add to `package.json` `"scripts"`: `"test": "vitest run"`, add `vitest` to `devDependencies` (workspace-consistent version), and create `packages/domain/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

Then run `pnpm install`.

- [ ] **Step 2: Write the failing schema tests**

Create `packages/domain/test/workflow-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  foldStateIdForward,
  ruleSchema,
  ticketTransitionedPayloadSchema,
  workflowDefSchema,
  workflowDefinedPayloadSchema,
} from '../src/workflow.js';

const validDef = {
  id: 'wf_basic',
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'done', rules: [{ kind: 'require-comment' }] },
  ],
};

describe('workflowDefSchema', () => {
  it('accepts a well-formed definition', () => {
    expect(workflowDefSchema.safeParse(validDef).success).toBe(true);
  });

  it('refuses a state with an invented category', () => {
    const bad = { ...validDef, states: [{ id: 's', name: 'S', category: 'paused' }] };
    expect(workflowDefSchema.safeParse(bad).success).toBe(false);
  });

  it('refuses a version below 1', () => {
    expect(workflowDefSchema.safeParse({ ...validDef, version: 0 }).success).toBe(false);
  });
});

describe('ruleSchema', () => {
  it('accepts each member of the closed vocabulary', () => {
    const rules = [
      { kind: 'restrict-to', assignee: true, roles: ['admin'], userIds: ['user_a'] },
      { kind: 'require-comment' },
      { kind: 'require-evidence' },
      { kind: 'require-field', field: 'due_date' },
      { kind: 'require-different-user', thanActorOf: { to: 'review' } },
    ];
    for (const rule of rules) {
      expect(ruleSchema.safeParse(rule).success).toBe(true);
    }
  });

  it('refuses a kind outside the vocabulary — the vocabulary is closed', () => {
    expect(ruleSchema.safeParse({ kind: 'run-webhook', url: 'https://x' }).success).toBe(false);
  });

  it('refuses require-field without a field name', () => {
    expect(ruleSchema.safeParse({ kind: 'require-field' }).success).toBe(false);
  });
});

describe('workflowDefinedPayloadSchema', () => {
  it('accepts a definition with a stateMapping', () => {
    const payload = { ...validDef, version: 2, stateMapping: { doing: 'todo' } };
    expect(workflowDefinedPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('accepts a definition without a stateMapping', () => {
    expect(workflowDefinedPayloadSchema.safeParse(validDef).success).toBe(true);
  });
});

describe('ticketTransitionedPayloadSchema', () => {
  it('requires the target state', () => {
    expect(ticketTransitionedPayloadSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a move with comment and evidence', () => {
    const payload = { to: 'done', comment: { text: 'Shipped.' }, evidenceAttachmentId: 'att_1' };
    expect(ticketTransitionedPayloadSchema.safeParse(payload).success).toBe(true);
  });
});

describe('foldStateIdForward — the one version walk', () => {
  const v1 = workflowDefSchema.parse(validDef);
  const v2 = workflowDefinedPayloadSchema.parse({
    ...validDef,
    version: 2,
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [{ from: 'todo', to: 'done', rules: [] }],
    stateMapping: { doing: 'todo' },
  });
  const v3 = workflowDefinedPayloadSchema.parse({
    ...validDef,
    version: 3,
    states: [
      { id: 'queued', name: 'Queued', category: 'open' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [{ from: 'queued', to: 'done', rules: [] }],
    stateMapping: { todo: 'queued' },
  });
  const chain = new Map([
    [1, v1],
    [2, v2],
  ]);
  const intermediate = (version: number): typeof v1 | null => chain.get(version) ?? null;

  it('leaves a state the later versions still have exactly where it is', () => {
    expect(foldStateIdForward('done', 1, v2, intermediate)).toEqual({ ok: true, stateId: 'done' });
  });

  it('follows one mapping', () => {
    expect(foldStateIdForward('doing', 1, v2, intermediate)).toEqual({ ok: true, stateId: 'todo' });
  });

  it('follows mappings through every intermediate version, not just the last', () => {
    // doing → todo (v2) → queued (v3): the intermediate hop is where a walk
    // that only consulted the newest definition would silently lose the ticket.
    expect(foldStateIdForward('doing', 1, v3, intermediate)).toEqual({ ok: true, stateId: 'queued' });
  });

  it('reports the id at the point the chain broke, not the one it started from', () => {
    const orphan = workflowDefinedPayloadSchema.parse({
      ...validDef,
      version: 3,
      states: [{ id: 'done', name: 'Done', category: 'terminal' }],
      transitions: [],
    });
    expect(foldStateIdForward('doing', 1, orphan, intermediate)).toEqual({
      ok: false,
      unmappedStateId: 'todo',
    });
  });

  it('a state the latest version no longer has is unmapped even with no versions to walk', () => {
    const dropped = workflowDefSchema.parse({
      ...validDef,
      states: [{ id: 'done', name: 'Done', category: 'terminal' }],
      transitions: [],
    });
    expect(foldStateIdForward('todo', 1, dropped, intermediate)).toEqual({
      ok: false,
      unmappedStateId: 'todo',
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter ./packages/domain test`
Expected: FAIL — cannot resolve `../src/workflow.js`.

- [ ] **Step 4: Implement the schemas**

Create `packages/domain/src/workflow.ts`:

```ts
import { z } from 'zod';

export const stateCategorySchema = z.enum(['open', 'active', 'terminal']);
export type StateCategory = z.infer<typeof stateCategorySchema>;

export const workflowStateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: stateCategorySchema,
  // Amendment 9 (coordination doc): additive flag the attention strip's
  // "blocked" bucket reads — templates set it on their Blocked states, the
  // builder exposes it as a checkbox; category stays one of the three.
  blocked: z.boolean().optional(),
});
export type WorkflowState = z.infer<typeof workflowStateSchema>;

export const ruleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('restrict-to'),
    assignee: z.boolean().optional(),
    roles: z.array(z.string()).optional(),
    userIds: z.array(z.string()).optional(),
  }),
  z.object({ kind: z.literal('require-comment') }),
  z.object({ kind: z.literal('require-evidence') }),
  z.object({ kind: z.literal('require-field'), field: z.string().min(1) }),
  z.object({
    kind: z.literal('require-different-user'),
    thanActorOf: z.object({ to: z.string().min(1) }),
  }),
]);
export type Rule = z.infer<typeof ruleSchema>;

export const transitionSchema = z.object({
  from: z.string().min(1), // a state id, or '*' for "from any state"
  to: z.string().min(1),
  rules: z.array(ruleSchema),
});
export type Transition = z.infer<typeof transitionSchema>;

export const workflowDefSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1),
  name: z.string().min(1),
  initialStateId: z.string().min(1),
  states: z.array(workflowStateSchema),
  transitions: z.array(transitionSchema),
});
export type WorkflowDef = z.infer<typeof workflowDefSchema>;

export const stateMappingSchema = z.record(z.string(), z.string());

/**
 * The payload of a `workflow.defined` event: the full definition, plus — when
 * this version drops states an earlier version had — a mapping from each
 * dropped state id to its replacement in this version. Publishing cannot see
 * which tickets sit in which state, so the mapping is required for every
 * dropped state whether or not anything is standing in it.
 */
export const workflowDefinedPayloadSchema = workflowDefSchema.extend({
  stateMapping: stateMappingSchema.optional(),
});
export type WorkflowDefinedPayload = z.infer<typeof workflowDefinedPayloadSchema>;

/** A published definition as stored and served: structurally a WorkflowDef, possibly carrying its stateMapping. */
export type PublishedWorkflowDef = WorkflowDefinedPayload;

/** Narrow a WorkflowDef to one that carries a stateMapping — no casts at call sites. */
export function hasStateMapping(
  def: WorkflowDef,
): def is WorkflowDef & { stateMapping: Record<string, string> } {
  const candidate = def as WorkflowDef & { stateMapping?: unknown };
  return typeof candidate.stateMapping === 'object' && candidate.stateMapping !== null;
}

export type FoldedState = { ok: true; stateId: string } | { ok: false; unmappedStateId: string };

/**
 * Walk ONE state id forward from the version whose vocabulary it is written in
 * to `latest`, following each intermediate version's stateMapping. Pure: it
 * asks for definitions through `intermediate` rather than fetching them, so
 * the async ctx-driven caller in the rule engine and the synchronous callers
 * that already hold every version share one implementation.
 *
 * `intermediate(version)` is consulted only for versions strictly between
 * `fromVersion` and `latest.version`; `latest` answers for its own version and
 * for the final containment check (which is what catches a ticket already at
 * the latest version whose state id the definition no longer has). A version
 * the caller cannot supply returns `null` and the walk stops there.
 *
 * On failure it reports the id at the point the chain broke, not the id it
 * started from — that is the id a refusal must name.
 *
 * THE ONE VERSION WALK. Every caller in the monorepo goes through this
 * function: the engine's resolveStateIdForward and require-different-user
 * (`@gisik-nokma/rule-engine`), the server's proj_tickets refresh-on-publish
 * (Plan 3), and the offline replica's fold on workflow.defined (Plan 10).
 * A second walk is a second set of rounding errors, and the two engines are
 * only interchangeable while they round identically.
 */
export function foldStateIdForward(
  stateId: string,
  fromVersion: number,
  latest: WorkflowDef,
  intermediate: (version: number) => WorkflowDef | null,
): FoldedState {
  let current = stateId;
  for (let version = fromVersion + 1; version <= latest.version; version += 1) {
    const def = version === latest.version ? latest : intermediate(version);
    if (def === null) return { ok: false, unmappedStateId: current };
    if (def.states.some((state) => state.id === current)) continue;
    const mapped = hasStateMapping(def) ? def.stateMapping[current] : undefined;
    if (mapped === undefined) return { ok: false, unmappedStateId: current };
    current = mapped;
  }
  if (!latest.states.some((state) => state.id === current)) {
    return { ok: false, unmappedStateId: current };
  }
  return { ok: true, stateId: current };
}

/**
 * The payload of a `ticket.transitioned` event. The current state is NOT part
 * of the payload: the engine evaluates against the authoritative current
 * state, so a stale client claim refuses as an illegal transition rather than
 * silently landing. The event type itself is registered by Plan 3; the schema
 * lives here because the engine parses it.
 */
export const ticketTransitionedPayloadSchema = z.object({
  to: z.string().min(1),
  comment: z.object({ text: z.string() }).optional(),
  evidenceAttachmentId: z.string().optional(),
  // Owner decision (2026-08-20, coordination doc): provenance for a parent
  // reopened because it acquired live work — the engine treats cause as opaque
  // (no rule reads it); boards render "reopened — live work added" from it.
  cause: z.object({ kind: z.literal('reopened-for-child'), childTicketId: z.string() }).optional(),
});
export type TicketTransitionedPayload = z.infer<typeof ticketTransitionedPayloadSchema>;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter ./packages/domain test`
Expected: PASS.

- [ ] **Step 6: Register `workflow.defined` and re-export the module**

In `packages/domain/src/event-types.ts` (Plan 1's registry), add alongside the existing registrations — adapting the call shape to Plan 1's actual API, keeping the type string and schema exactly:

```ts
import { workflowDefinedPayloadSchema } from './workflow.js';

registerEventType({ type: 'workflow.defined', version: 1, payloadSchema: workflowDefinedPayloadSchema });
```

In `packages/domain/src/index.ts`, add:

```ts
export * from './workflow.js';
```

- [ ] **Step 7: Prove the registration through `parseEvent`**

Append to `packages/domain/test/workflow-schema.test.ts` (adapt the import and the success assertion to Plan 1's actual `parseEvent` result shape — the behavior asserted is binding: a `workflow.defined` envelope parses, an unregistered type refuses):

```ts
import { parseEvent } from '../src/index.js';

describe('workflow.defined registration', () => {
  const envelope = {
    id: '01J5ZX2N9GQ4Y8R1T0V7WBKM3E',
    workspaceId: 'ws_1',
    entity: { kind: 'workflow', id: 'wf_basic' },
    type: 'workflow.defined',
    version: 1,
    payload: validDef,
    actorId: 'user_a',
    origin: 'server',
    clientTime: '2026-08-20T00:00:00.000Z',
    serverTime: '2026-08-20T00:00:00.000Z',
    seq: 1,
  };

  it('parseEvent accepts a workflow.defined envelope', () => {
    expect(() => parseEvent(envelope)).not.toThrow();
  });
});
```

Run: `pnpm --filter ./packages/domain test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src/workflow.ts packages/domain/src/event-types.ts packages/domain/src/index.ts packages/domain/test/workflow-schema.test.ts packages/domain/vitest.config.ts packages/domain/package.json pnpm-lock.yaml
git commit -m "Workflow vocabulary as data: closed rule set, versioned definitions, and the two payloads the engine will parse

The vocabulary is a zod discriminated union, so an invented rule kind is
refused at the schema — no user code means refusals stay provable. The
stateMapping travels in the workflow.defined payload rather than the frozen
WorkflowDef type, which later plans depend on verbatim."
```

---

### Task 2: Entity-state shapes the engine reads

The frozen `EngineContext` returns `EntityState`/`TicketState` but the contract does not define them (Open question 3). This task defines them with exactly the fields the engine reads — the binding contract for Plan 3's ticket projection. It REPLACES Plan 1's provisional stub file `packages/domain/src/provisional.ts` (which, with Task 1's workflow schemas, carried byte-compatible stand-ins so Plan 1 could build alone): delete the stub and its `export * from './provisional.js'` index line in this same commit — the one-task window in which `workflow.ts` and the stub both export `StateCategory`/`WorkflowState`/`WorkflowDef` is harmless because nothing typechecks the domain package between Task 1 Step 6 and this commit.

**Files:**
- Create: `packages/domain/src/entity-state.ts`
- Delete: `packages/domain/src/provisional.ts` (Plan 1's PROVISIONAL stubs — this task is the authoritative definition site)
- Modify: `packages/domain/src/index.ts` (re-export; drop the provisional re-export)
- Test: `packages/domain/test/entity-state.test.ts`

**Interfaces:**
- Consumes: `StateCategory` from Task 1.
- Produces: `FieldClaim` (`{value, actorId, clientTime, serverTime}` — per-field provenance), `TicketState` (discriminant `kind: 'ticket'`; the merged cross-plan shape per the coordination doc §4: fields `id`, `workspaceId`, `projectId`, `typeId`, `parentId`, `workflowId`, `workflowVersion`, `stateId`, `stateCategory`, `assigneeId`, `collaboratorIds`, `fields: Record<string, FieldClaim>`, and the transition log `transitions: { toStateId; actorId; seq; workflowId; workflowVersion }[]`), `MembershipState` (`kind: 'membership'`; `id`, `workspaceId`, `userId`, `role`), `OtherEntityState`, `EntityState` (the union), `WorkspaceRole`, `membershipId(workspaceId, userId): string`. Plan 3's ticket projection must maintain every `TicketState` field, notably `stateCategory` (denormalized so the parent-terminal check needs no per-child workflow lookup) and the append-only `transitions` log (what `require-different-user` reads).

**A log entry's `workflowId` and `workflowVersion`** together name the vocabulary that entry's `toStateId` is written in — the ticket's workflow and version at the moment the transition was applied, after any forward fold. Both are pinned by the coordination doc's decision 4 (as amended twice on 2026-08-26) and neither is optional:

- Without **`workflowVersion`**, a version that drops and remaps a state leaves every historical entry unmatchable against the latest definition's state ids, and `require-different-user` silently finds no prior performer — four-eyes disarmed by a rename (Open question 10, part three; the evaluator's forward walk is Task 11).
- Without **`workflowId`**, the same walk is applied to entries that were never written in this workflow's vocabulary at all. A ticket pins the workflow it was created under and an explicit migration (`ticket.workflow_rebound`, Plan 3) moves it; an entry recorded under the outgoing workflow, walked forward through the incoming workflow's version chain, is meaningless. It either fails to match (the rule finds nobody and one person makes both moves) or matches the wrong move — a state id that merely happens to be spelled the same in two unrelated graphs — and refuses the wrong person. Either way the hole closed by `workflowVersion` reopens through a different door. Task 11's evaluator therefore filters on `workflowId` **before** walking anything forward.

- [ ] **Step 1: Write the failing test**

Create `packages/domain/test/entity-state.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';
import { membershipId, type EntityState, type MembershipState, type TicketState } from '../src/entity-state.js';

describe('membershipId', () => {
  it('is the workspace and user joined with a colon — the cross-plan convention', () => {
    expect(membershipId('ws_1', 'user_a')).toBe('ws_1:user_a');
  });
});

describe('entity state shapes', () => {
  it('a ticket state narrows from the union by its kind', () => {
    const ticket: TicketState = {
      kind: 'ticket',
      id: 't1',
      workspaceId: 'ws_1',
      projectId: 'prj_1',
      typeId: 'task',
      parentId: null,
      workflowId: 'wf_basic',
      workflowVersion: 1,
      stateId: 'todo',
      stateCategory: 'open',
      assigneeId: null,
      collaboratorIds: [],
      fields: {},
      transitions: [],
    };
    const entity: EntityState = ticket;
    if (entity.kind === 'ticket') {
      expectTypeOf(entity).toEqualTypeOf<TicketState>();
    }
    expect(entity.kind).toBe('ticket');
  });

  it('a membership carries the workspace role', () => {
    const membership: MembershipState = {
      kind: 'membership',
      id: 'ws_1:user_a',
      workspaceId: 'ws_1',
      userId: 'user_a',
      role: 'member',
    };
    expect(membership.role).toBe('member');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter ./packages/domain test`
Expected: FAIL — cannot resolve `../src/entity-state.js`.

- [ ] **Step 3: Implement the shapes**

Create `packages/domain/src/entity-state.ts`:

```ts
import type { StateCategory } from './workflow.js';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';

/** A field's current value plus its provenance — who claimed it, and both clocks. */
export type FieldClaim = { value: unknown; actorId: string; clientTime: string; serverTime: string };

/**
 * The projected current state of a ticket, as the rule engine reads it —
 * the merged cross-plan shape (coordination doc §4): Plan 3's domain fields
 * plus this plan's transition log. Plan 3's reducer and projection maintain
 * every field. `stateCategory` is denormalized from the ticket's workflow so
 * the parent-terminal invariant needs no per-child workflow lookup.
 * `transitions` is the append-only log of every ticket.transitioned applied
 * to this ticket, oldest first — what require-different-user reads. An
 * entry's workflowId + workflowVersion name the vocabulary that entry's
 * toStateId is written in (the ticket's workflow and version when the
 * transition was applied, after any forward fold). Four-eyes skips entries
 * from a different workflow and resolves the rest forward before comparing,
 * so neither a dropped-and-remapped state nor a workflow migration can
 * disarm the rule. Entries are never rewritten: a fold moves the ticket's
 * current state, never the history that got it there.
 */
export type TicketState = {
  kind: 'ticket';
  id: string;
  workspaceId: string;
  projectId: string;
  typeId: string;
  parentId: string | null;
  workflowId: string;
  workflowVersion: number;
  stateId: string;
  stateCategory: StateCategory;
  assigneeId: string | null;
  collaboratorIds: string[];
  fields: Record<string, FieldClaim>;
  transitions: { toStateId: string; actorId: string; seq: number; workflowId: string; workflowVersion: number }[];
};

export type MembershipState = {
  kind: 'membership';
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
};

/** Entity kinds this plan does not read; later plans refine them into real shapes. */
export type OtherEntityState = {
  kind: 'workspace' | 'project' | 'workflow' | 'ticket-type';
  id: string;
};

export type EntityState = TicketState | MembershipState | OtherEntityState;

/** The entity id of a user's membership in a workspace — the cross-plan convention (Open question 4). */
export function membershipId(workspaceId: string, userId: string): string {
  return `${workspaceId}:${userId}`;
}
```

In `packages/domain/src/index.ts`, add:

```ts
export * from './entity-state.js';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter ./packages/domain test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/entity-state.ts packages/domain/src/provisional.ts packages/domain/src/index.ts packages/domain/test/entity-state.test.ts
git commit -m "Entity-state shapes the engine reads, pinned in domain

The frozen EngineContext references TicketState without defining it; these
shapes are the contract Plan 3's projections must maintain — stateCategory
denormalized for the parent-terminal check, the transitions log for
four-eyes with each entry stamped with the workflow version its state id is
written in, and the workspace:user membership-id convention."
```

---

### Task 3: Pure structural validation — `validateWorkflowDef`, and the advisory tier

The builder refuses to publish a workflow with no terminal state, an unreachable state, or an unenterable terminal state (spec §4). This function is the single source of that judgment: pure and I/O-free, because the later builder UI calls this same function for live validation while the engine calls it at ingest. This task also adds the **advisory tier** — a second, separate function for problems that are real but not fatal (Steps 7–8).

Beyond the assignment's five checks (no terminal state, unreachable state, terminal with no inbound, duplicate state ids, transition referencing unknown states), five additions, each preventing a silent lie: `no-states` (an empty draft should say so rather than crash reachability), `duplicate-transition` (two transitions over the same edge make it ambiguous which rules run — rules that look enforced but aren't), `empty-restrict-to` (a restriction that names nobody can never be satisfied), `rdu-unknown-state` (a four-eyes rule watching a nonexistent transition can never fire), `rdu-unenterable-state` (a four-eyes rule watching a state that exists but that nothing in this version enters can never require a second person — same class as `terminal-no-inbound`: a declared thing that structurally cannot function).

`rdu-unenterable-state` reduces to a narrow case in practice, and that narrowness is the point. A non-initial state with no inbound transition already fails `unreachable-state`, and a terminal one already fails `terminal-no-inbound` — so in a workflow that otherwise validates, this fires for the **initial state with nothing looping back to it**: the self-approval hole Open question 10 named, now caught at publish instead of tolerated at runtime. Two details are load-bearing. It is checked **only when the watched state is a known state id** — when the id is unknown, `rdu-unknown-state` fires and `rdu-unenterable-state` must not also fire, because one authoring mistake must produce one message. And a transition with `from: '*'` still has a concrete `to`, so it counts as entering that state like any other transition.

**Files:**
- Create: `packages/domain/src/validate-workflow.ts`
- Create: `packages/domain/src/advise-workflow.ts` (Step 7)
- Modify: `packages/domain/src/index.ts` (re-export both)
- Test: `packages/domain/test/validate-workflow.test.ts`
- Test: `packages/domain/test/advise-workflow.test.ts` (Step 7)

**Interfaces:**
- Consumes: `WorkflowDef`, `Rule` from Task 1.
- Produces: `validateWorkflowDef(def: WorkflowDef): Issue[]` and `Issue = { code: string; message: string }`. Issue order is deterministic: no-states short-circuits; then duplicate-state-id, no-terminal-state, unknown-transition-state, duplicate-transition, unknown-initial-state (reachability is skipped when it fires — there is no start to walk from), unreachable-state, terminal-no-inbound, then rule-level checks — each in definition order. Codes: `no-states`, `duplicate-state-id`, `no-terminal-state`, `unknown-transition-state`, `duplicate-transition`, `unknown-initial-state`, `unreachable-state`, `terminal-no-inbound`, `empty-restrict-to`, `rdu-unknown-state`, `rdu-unenterable-state`. All issues are collected (the builder shows them all); the engine joins the messages into one refusal. Also produces the `label(def, ref)` helper as a named export, because the advisory tier renders the same state references and two copies of that formatting is how the two tiers' copy starts drifting.
- Also produces (Step 7): `adviseWorkflowDef(def: WorkflowDef): Advisory[]` and `Advisory = { code: string; message: string }`, from `packages/domain/src/advise-workflow.ts`. Its one code is `rdu-bypassable`.

**Where `rdu-unenterable-state` slots into the issue order:** immediately **after** `rdu-unknown-state`, both in this Produces block and in the implementation's rule-level loop. Insertion there is safe for consumers: Plan 8 anchors issues to builder elements per `code`, not by global index, so adding a code does not shift what any existing issue anchors to.

Semantics pinned here, tested below: the **starting state is the state named by `initialStateId`** (the coordination doc's contract amendment §3 — position in the list is never semantic); a `'*'` transition's target is reachable (the starting state matches `'*'`); an exact `from` transition and a `'*'` transition to the same target are **not** duplicates (the engine prefers the exact one); a self-loop does not count as a way into a terminal state; a `'*'` inbound counts only when the workflow has more than one state.

- [ ] **Step 1: Write the failing tests for identity checks (duplicates, no terminal, unknown refs, duplicate edges)**

Create `packages/domain/test/validate-workflow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { WorkflowDef } from '../src/workflow.js';
import { validateWorkflowDef } from '../src/validate-workflow.js';

function def(partial: Partial<WorkflowDef>): WorkflowDef {
  return {
    id: 'wf_test',
    version: 1,
    name: 'Test',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [
      { from: 'todo', to: 'doing', rules: [] },
      { from: 'doing', to: 'done', rules: [] },
    ],
    ...partial,
  };
}

function codes(d: WorkflowDef): string[] {
  return validateWorkflowDef(d).map((issue) => issue.code);
}

describe('validateWorkflowDef — identity checks', () => {
  it('a clean definition has no issues', () => {
    expect(validateWorkflowDef(def({}))).toEqual([]);
  });

  it('an empty definition reports no-states and nothing else', () => {
    expect(validateWorkflowDef(def({ states: [], transitions: [] }))).toEqual([
      { code: 'no-states', message: 'This workflow has no states at all.' },
    ]);
  });

  it('duplicate state ids are reported once per duplicated id', () => {
    const d = def({
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
        { id: 'done', name: 'Done again', category: 'terminal' },
      ],
      transitions: [{ from: 'todo', to: 'done', rules: [] }],
    });
    expect(validateWorkflowDef(d)).toEqual([
      { code: 'duplicate-state-id', message: 'Two states share the id "done"; state ids must be unique.' },
    ]);
  });

  it('a workflow with no terminal state could never finish', () => {
    const d = def({
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'doing', name: 'Doing', category: 'active' },
      ],
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'todo', rules: [] },
      ],
    });
    expect(validateWorkflowDef(d)).toEqual([
      { code: 'no-terminal-state', message: 'This workflow has no terminal state, so no ticket could ever finish.' },
    ]);
  });

  it('a transition to a state that does not exist is reported with the raw ids', () => {
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [] },
        { from: 'doing', to: 'blessed', rules: [] },
      ],
    });
    expect(validateWorkflowDef(d)).toEqual([
      {
        code: 'unknown-transition-state',
        message: 'The transition from "doing" to "blessed" refers to "blessed", which is not a state in this workflow.',
      },
    ]);
  });

  it('two transitions over the same edge are ambiguous about which rules run', () => {
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [] },
        { from: 'doing', to: 'done', rules: [{ kind: 'require-comment' }] },
      ],
    });
    expect(validateWorkflowDef(d)).toEqual([
      {
        code: 'duplicate-transition',
        message: 'There are two transitions from "Doing" to "Done"; keep at most one transition per direction between a pair of states.',
      },
    ]);
  });

  it('an exact edge and a from-any edge to the same target are NOT duplicates', () => {
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [] },
        { from: '*', to: 'done', rules: [] },
      ],
    });
    expect(codes(d)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter ./packages/domain test`
Expected: FAIL — cannot resolve `../src/validate-workflow.js`.

- [ ] **Step 3: Implement the identity checks**

Create `packages/domain/src/validate-workflow.ts` (reachability and rule-level checks arrive in Steps 5 and 7 — the function below already returns `issues` from a single pass structure they extend):

```ts
import type { WorkflowDef } from './workflow.js';

export type Issue = { code: string; message: string };

/**
 * Pure structural validation of a workflow definition. No I/O — the builder
 * UI calls this same function for live validation; the engine calls it before
 * accepting a workflow.defined event. All issues are collected so the builder
 * can show every problem at once; order is deterministic (documented in the
 * plan) because the engine joins messages into a single refusal reason.
 */
export function validateWorkflowDef(def: WorkflowDef): Issue[] {
  if (def.states.length === 0) {
    return [{ code: 'no-states', message: 'This workflow has no states at all.' }];
  }

  const issues: Issue[] = [];
  const stateIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const state of def.states) {
    if (stateIds.has(state.id)) duplicateIds.add(state.id);
    stateIds.add(state.id);
  }
  for (const id of duplicateIds) {
    issues.push({
      code: 'duplicate-state-id',
      message: `Two states share the id "${id}"; state ids must be unique.`,
    });
  }

  if (!def.states.some((state) => state.category === 'terminal')) {
    issues.push({
      code: 'no-terminal-state',
      message: 'This workflow has no terminal state, so no ticket could ever finish.',
    });
  }

  for (const transition of def.transitions) {
    for (const ref of [transition.from, transition.to]) {
      if (ref !== '*' && !stateIds.has(ref)) {
        issues.push({
          code: 'unknown-transition-state',
          message: `The transition from "${transition.from}" to "${transition.to}" refers to "${ref}", which is not a state in this workflow.`,
        });
      }
    }
  }

  const seenEdges = new Set<string>();
  const duplicateEdges = new Set<string>();
  for (const transition of def.transitions) {
    const key = JSON.stringify([transition.from, transition.to]);
    if (seenEdges.has(key)) duplicateEdges.add(key);
    else seenEdges.add(key);
  }
  for (const key of duplicateEdges) {
    const [from, to] = JSON.parse(key) as [string, string];
    issues.push({
      code: 'duplicate-transition',
      message: `There are two transitions from ${label(def, from)} to ${label(def, to)}; keep at most one transition per direction between a pair of states.`,
    });
  }

  return issues;
}

/**
 * How a state reference is rendered in a message: its quoted name when the id
 * is known, the unquoted words `any state` for the wildcard, and the quoted
 * raw id when nothing resolves. Exported because the advisory tier (Step 7)
 * renders the same references and must render them identically.
 */
export function label(def: WorkflowDef, ref: string): string {
  if (ref === '*') return 'any state';
  const state = def.states.find((s) => s.id === ref);
  return state === undefined ? `"${ref}"` : `"${state.name}"`;
}
```

In `packages/domain/src/index.ts`, add:

```ts
export * from './validate-workflow.js';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter ./packages/domain test`
Expected: PASS.

- [ ] **Step 5: Write the failing reachability tests, then implement**

Append to `packages/domain/test/validate-workflow.test.ts`:

```ts
describe('validateWorkflowDef — reachability', () => {
  it('a state no transition can reach is dead weight on the board', () => {
    const d = def({
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'limbo', name: 'Limbo', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [{ from: 'todo', to: 'done', rules: [] }],
    });
    expect(validateWorkflowDef(d)).toEqual([
      { code: 'unreachable-state', message: 'State "Limbo" cannot be reached from the starting state "To do".' },
    ]);
  });

  it('a from-any transition makes its target reachable', () => {
    const d = def({
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'blocked', name: 'Blocked', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        { from: 'todo', to: 'done', rules: [] },
        { from: '*', to: 'blocked', rules: [] },
        { from: 'blocked', to: 'todo', rules: [] },
      ],
    });
    expect(codes(d)).toEqual([]);
  });

  it('a terminal state nothing leads into can never be entered', () => {
    const d = def({
      initialStateId: 'done',
      states: [
        { id: 'done', name: 'Done', category: 'terminal' },
        { id: 'todo', name: 'To do', category: 'open' },
      ],
      transitions: [{ from: 'done', to: 'todo', rules: [] }],
    });
    expect(validateWorkflowDef(d)).toEqual([
      {
        code: 'terminal-no-inbound',
        message: 'Terminal state "Done" has no transition leading into it, so no ticket could ever reach it.',
      },
    ]);
  });

  it('a self-loop is not a way into a terminal state', () => {
    const d = def({
      initialStateId: 'done',
      states: [{ id: 'done', name: 'Done', category: 'terminal' }],
      transitions: [{ from: 'done', to: 'done', rules: [] }],
    });
    expect(codes(d)).toEqual(['terminal-no-inbound']);
  });
});
```

Then extend `validateWorkflowDef` — insert before the final `return issues;` in `packages/domain/src/validate-workflow.ts`:

```ts
  // Reachability from the starting state — the state named by initialStateId
  // (the contract amendment: position in the list is never semantic). The
  // starting state matches '*', so every '*' target is reachable outright.
  // An initialStateId naming no state is its own issue, and reachability is
  // skipped — there is no start to walk from.
  const start = def.states.find((state) => state.id === def.initialStateId);
  if (start === undefined) {
    issues.push({
      code: 'unknown-initial-state',
      message: `This workflow's initial state is "${def.initialStateId}", but no state with that id exists.`,
    });
  } else {
    const reachable = new Set<string>([start.id]);
    for (const transition of def.transitions) {
      if (transition.from === '*' && stateIds.has(transition.to)) reachable.add(transition.to);
    }
    let grew = true;
    while (grew) {
      grew = false;
      for (const transition of def.transitions) {
        if (
          transition.from !== '*' &&
          reachable.has(transition.from) &&
          stateIds.has(transition.to) &&
          !reachable.has(transition.to)
        ) {
          reachable.add(transition.to);
          grew = true;
        }
      }
    }
    for (const state of def.states) {
      if (!reachable.has(state.id)) {
        issues.push({
          code: 'unreachable-state',
          message: `State "${state.name}" cannot be reached from the starting state "${start.name}".`,
        });
      }
    }
  }

  // An unenterable terminal state: nothing leads into it. A self-loop does not
  // count; a '*' inbound counts only when there is some other state to come from.
  for (const state of def.states) {
    if (state.category !== 'terminal') continue;
    const hasInbound = def.transitions.some(
      (transition) =>
        transition.to === state.id &&
        (transition.from === '*' ? def.states.length > 1 : transition.from !== state.id),
    );
    if (!hasInbound) {
      issues.push({
        code: 'terminal-no-inbound',
        message: `Terminal state "${state.name}" has no transition leading into it, so no ticket could ever reach it.`,
      });
    }
  }
```

Run: `pnpm --filter ./packages/domain test`
Expected: PASS.

- [ ] **Step 6: Write the failing rule-level tests, then implement**

Append to `packages/domain/test/validate-workflow.test.ts`:

```ts
describe('validateWorkflowDef — rule-level checks', () => {
  it('a restrict-to that names nobody can never be satisfied', () => {
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [{ kind: 'restrict-to' }] },
      ],
    });
    expect(validateWorkflowDef(d)).toEqual([
      {
        code: 'empty-restrict-to',
        message:
          'A restrict-to rule on the transition from "Doing" to "Done" names nobody: it must allow the assignee, at least one role, or at least one named person.',
      },
    ]);
  });

  it('a four-eyes rule watching a nonexistent transition can never fire', () => {
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'reviewed' } }] },
      ],
    });
    expect(validateWorkflowDef(d)).toEqual([
      {
        code: 'rdu-unknown-state',
        message:
          'A require-different-user rule on the transition from "Doing" to "Done" refers to a move to "reviewed", but no state with that id exists.',
      },
    ]);
  });

  it('a four-eyes rule watching a state nothing enters can never require a second person', () => {
    // The narrow case that survives the reachability checks: the rule watches
    // the INITIAL state, which every ticket starts in and nothing loops back
    // to. Nobody ever performs a move into it, so the rule is dead on arrival.
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'todo' } }] },
      ],
    });
    expect(validateWorkflowDef(d)).toEqual([
      {
        code: 'rdu-unenterable-state',
        message:
          'A require-different-user rule on the transition from "Doing" to "Done" refers to a move to "To do", but nothing in this version enters that state, so the rule can never require a second person.',
      },
    ]);
  });

  it('a four-eyes rule is silent when some transition does enter the watched state', () => {
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'doing' } }] },
      ],
    });
    expect(codes(d)).toEqual([]);
  });

  it('a from-any transition counts as entering its target', () => {
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: '*', to: 'todo', rules: [] },
        { from: 'doing', to: 'done', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'todo' } }] },
      ],
    });
    expect(codes(d)).toEqual([]);
  });

  it('an unknown watched state reports only rdu-unknown-state, never both codes', () => {
    // One authoring mistake, one message: enterability is checked only for
    // states that exist, so the two rdu codes can never fire for one rule.
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'reviewed' } }] },
      ],
    });
    expect(codes(d)).toEqual(['rdu-unknown-state']);
  });
});
```

Then insert before the final `return issues;` in `validateWorkflowDef` (after the terminal-no-inbound block):

```ts
  for (const transition of def.transitions) {
    for (const rule of transition.rules) {
      if (rule.kind === 'restrict-to') {
        const namesAnyone =
          rule.assignee === true ||
          (rule.roles !== undefined && rule.roles.length > 0) ||
          (rule.userIds !== undefined && rule.userIds.length > 0);
        if (!namesAnyone) {
          issues.push({
            code: 'empty-restrict-to',
            message: `A restrict-to rule on the transition from ${label(def, transition.from)} to ${label(def, transition.to)} names nobody: it must allow the assignee, at least one role, or at least one named person.`,
          });
        }
      }
      if (rule.kind === 'require-different-user') {
        const target = rule.thanActorOf.to;
        if (!stateIds.has(target)) {
          issues.push({
            code: 'rdu-unknown-state',
            message: `A require-different-user rule on the transition from ${label(def, transition.from)} to ${label(def, transition.to)} refers to a move to "${target}", but no state with that id exists.`,
          });
        } else if (!def.transitions.some((candidate) => candidate.to === target)) {
          // Enterability is checked ONLY for states that exist: an unknown id
          // already reported above must not also report here — one authoring
          // mistake, one message. A from:'*' transition still has a concrete
          // `to`, so it counts as entering that state like any other.
          // "nothing in this version" is deliberate: a legacy ticket can carry
          // an older version's entry into this state forward, so an
          // unqualified "nothing ever" would overclaim. The target exists
          // here, so its NAME resolves — unlike rdu-unknown-state above, which
          // must print the raw id because no name exists to print.
          const targetName = def.states.find((state) => state.id === target)?.name ?? target;
          issues.push({
            code: 'rdu-unenterable-state',
            message: `A require-different-user rule on the transition from ${label(def, transition.from)} to ${label(def, transition.to)} refers to a move to "${targetName}", but nothing in this version enters that state, so the rule can never require a second person.`,
          });
        }
      }
    }
  }
```

Run: `pnpm --filter ./packages/domain test`
Expected: PASS.

- [ ] **Step 7: Write the failing advisory tests, then implement the advisory tier**

**Why this is a second function and not a second issue code.** A warning must never enter `validateWorkflowDef`'s return array. Three independent consumers make that array mean "publish is refused": Plan 8 gates the publish button on it being empty; every Plan 8 template asserts it validates clean; and this plan's engine (Task 5) joins **every** message it returns into one `workflow-structure` refusal. A warning dropped into that array would therefore not be a warning — it would silently be a refusal, and a template that ships with a bypassable four-eyes rule would become unpublishable. So the warning tier is a separate function, in a separate file, that **the rule engine never calls**.

`Advisory` is structurally identical to `Issue`, so under TypeScript's structural typing a distinct type name protects nothing — passing advisories where issues are expected compiles. The guarantee is therefore proven the way this plan proves everything else: by a planted defect. Task 5 Step 3 adds `workflow-defined-accepts-a-def-the-advisory-warns-about.json`, in which the engine **accepts** a `workflow.defined` whose def trips `rdu-bypassable` and nothing else. That fixture exists for exactly one purpose: to fail loudly the day someone folds the advisory tier into the refusal tier.

`adviseWorkflowDef` assumes a def that **validates clean** — the builder runs it alongside a successful `validateWorkflowDef`, and its suppression rules below lean on the error tier having already spoken. Its behavior on a wrecked def is not specified beyond "returns something without throwing"; do not spec it further.

Create `packages/domain/test/advise-workflow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { WorkflowDef } from '../src/workflow.js';
import { adviseWorkflowDef } from '../src/advise-workflow.js';
import { validateWorkflowDef } from '../src/validate-workflow.js';

/** Draft → Review → Approved, four-eyes on the approval. The canonical shape. */
function reviewDef(partial: Partial<WorkflowDef> = {}): WorkflowDef {
  return {
    id: 'wf_review',
    version: 1,
    name: 'Review',
    initialStateId: 'draft',
    states: [
      { id: 'draft', name: 'Draft', category: 'open' },
      { id: 'review', name: 'In review', category: 'active' },
      { id: 'approved', name: 'Approved', category: 'terminal' },
    ],
    transitions: [
      { from: 'draft', to: 'review', rules: [] },
      { from: 'review', to: 'draft', rules: [] },
      { from: 'review', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
    ],
    ...partial,
  };
}

function codes(d: WorkflowDef): string[] {
  return adviseWorkflowDef(d).map((advisory) => advisory.code);
}

describe('adviseWorkflowDef', () => {
  it('is silent on canonical four-eyes: the approval is only reachable through review', () => {
    expect(adviseWorkflowDef(reviewDef())).toEqual([]);
  });

  it('warns when a fast-track edge reaches the guarded move without entering the watched state', () => {
    const d = reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [] },
        { from: 'review', to: 'draft', rules: [] },
        { from: 'review', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
        { from: 'draft', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
      ],
    });
    expect(validateWorkflowDef(d)).toEqual([]);
    expect(adviseWorkflowDef(d)).toEqual([
      {
        code: 'rdu-bypassable',
        message:
          'A require-different-user rule on the transition from "Draft" to "Approved" watches the move to "In review", but this move can be reached without ever entering "In review"; on that path one person can make it alone.',
      },
    ]);
  });

  it('always warns on a from-any transition — a wildcard move is performable from the very start', () => {
    const d = reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [] },
        { from: 'review', to: 'draft', rules: [] },
        { from: 'review', to: 'approved', rules: [] },
        { from: '*', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
      ],
    });
    expect(adviseWorkflowDef(d)).toEqual([
      {
        code: 'rdu-bypassable',
        message:
          'A require-different-user rule on the transition from any state to "Approved" watches the move to "In review", but this move can be reached without ever entering "In review"; on that path one person can make it alone.',
      },
    ]);
  });

  it('warns when the guarded transition is itself an entry into the watched state and its from is still reachable', () => {
    const d = reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
        { from: 'review', to: 'approved', rules: [] },
        { from: 'approved', to: 'review', rules: [] },
      ],
    });
    expect(codes(d)).toEqual(['rdu-bypassable']);
  });

  it('says nothing when rdu-unknown-state or rdu-unenterable-state already spoke', () => {
    const unknown = reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [] },
        { from: 'review', to: 'draft', rules: [] },
        { from: 'review', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'ghost' } }] },
      ],
    });
    expect(codes(unknown)).toEqual([]);

    // Nothing loops back to draft, so validateWorkflowDef already reported
    // rdu-unenterable-state for this rule; the advisory must stay quiet.
    const unenterable = reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [] },
        { from: 'review', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'draft' } }] },
      ],
    });
    expect(validateWorkflowDef(unenterable).map((issue) => issue.code)).toEqual(['rdu-unenterable-state']);
    expect(codes(unenterable)).toEqual([]);
  });
});
```

Run: `pnpm --filter ./packages/domain test`
Expected: FAIL — cannot resolve `../src/advise-workflow.js`.

Create `packages/domain/src/advise-workflow.ts`:

```ts
import { label } from './validate-workflow.js';
import type { WorkflowDef } from './workflow.js';

/**
 * A warning: real, but not fatal. Structurally identical to Issue on purpose —
 * the separation that matters is which FUNCTION returns it, not which type,
 * because structural typing makes a distinct name worthless as a guard.
 */
export type Advisory = { code: string; message: string };

/**
 * Advisory checks over a workflow definition. Assumes a def that already
 * validates clean. The rule engine NEVER calls this: everything
 * validateWorkflowDef returns becomes a refusal, so a warning placed there
 * would silently become one too.
 *
 * Scope, stated so nobody reads more into it: this characterises reachable
 * vacuous acceptance WITHIN A SINGLE WORKFLOW VERSION. Across versions a
 * dropped-and-remapped state is the counterexample, which is why transition
 * log entries carry their workflowVersion and four-eyes resolves them forward.
 */
export function adviseWorkflowDef(def: WorkflowDef): Advisory[] {
  const advisories: Advisory[] = [];
  const stateIds = new Set(def.states.map((state) => state.id));

  for (const transition of def.transitions) {
    for (const rule of transition.rules) {
      if (rule.kind !== 'require-different-user') continue;
      const target = rule.thanActorOf.to;
      // Suppression, so one authoring mistake yields one message: both of
      // these already produced an ERROR in validateWorkflowDef.
      if (!stateIds.has(target)) continue; // rdu-unknown-state fired
      if (!def.transitions.some((candidate) => candidate.to === target)) continue; // rdu-unenterable-state fired

      // States reachable from the start WITHOUT ever entering the watched
      // state: walk the graph with every edge into `target` removed. Same
      // wildcard semantics the reachability walk pins — a from:'*' edge is
      // traversable from any state already in the set, and a '*' → target
      // edge is excluded like any other because its `to` is the target.
      const reachableWithoutTarget = new Set<string>([def.initialStateId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const candidate of def.transitions) {
          if (candidate.to === target) continue;
          if (!stateIds.has(candidate.to) || reachableWithoutTarget.has(candidate.to)) continue;
          // A from:'*' edge is traversable from any state already in the set,
          // and the set always holds at least the initial state.
          const traversable = candidate.from === '*' || reachableWithoutTarget.has(candidate.from);
          if (traversable) {
            reachableWithoutTarget.add(candidate.to);
            grew = true;
          }
        }
      }

      const bypassable =
        transition.from === '*' || reachableWithoutTarget.has(transition.from);
      if (!bypassable) continue;

      const targetName = def.states.find((state) => state.id === target)?.name ?? target;
      advisories.push({
        code: 'rdu-bypassable',
        message: `A require-different-user rule on the transition from ${label(def, transition.from)} to ${label(def, transition.to)} watches the move to "${targetName}", but this move can be reached without ever entering "${targetName}"; on that path one person can make it alone.`,
      });
    }
  }

  return advisories;
}
```

In `packages/domain/src/index.ts`, add:

```ts
export * from './advise-workflow.js';
```

Run: `pnpm --filter ./packages/domain test`
Expected: PASS.

- [ ] **Step 8: Check the implementation against the worked cases**

Read the four cases below against the code just written; each is a test above, and together they pin what the walk must and must not conclude.

- **Canonical four-eyes** — Draft → Review → Approved, the RDU on `Review → Approved` watching `review`: **silent**. Excluding the edges into `review` leaves `{draft}`, and the guarded transition's `from` is `review`, which is not in that set. There is no way to stand at Review without having entered it.
- **A fast-track edge** `Draft → Approved` carrying the same rule watching `review`: **fires**. `draft` is reachable without entering `review` — it is where every ticket starts — so one person can draft and approve.
- **An RDU rule on a `from: '*'` transition: always fires**, and this is a **true positive, not a false one**. A wildcard move is performable from the initial state, before anyone has entered anything, so there is always a path on which the rule finds nobody to differ from. Do not "fix" this as an over-report.
- **A guarded transition that is itself an entry into the watched state** (a rework loop where the same edge both enters `T` and carries the rule — e.g. `Draft → Review` watching `review`): **fires** whenever its `from` is still reachable without entering `T`. The walk excludes the guarded edge itself, and that is correct: the question is whether a *prior* entry into `T` exists, and on the first submission there is none.

- [ ] **Step 9: Commit**

```bash
git add packages/domain/src/validate-workflow.ts packages/domain/src/advise-workflow.ts packages/domain/src/index.ts packages/domain/test/validate-workflow.test.ts packages/domain/test/advise-workflow.test.ts
git commit -m "Structural validation for workflow definitions, pure so the builder shares it

Eleven checks, each preventing a board that lies: workflows that cannot
finish, states that cannot be reached or entered, ambiguous duplicate
edges, and rules that can never fire or never be satisfied — including a
four-eyes rule watching a state nothing in this version enters, which is a
declared guard that structurally cannot function. Reachability starts from
the declared initialStateId and treats from-any targets as reachable.

Warnings live in a separate adviseWorkflowDef, not in the issue array:
everything that array holds becomes a refusal, so a warning placed there
would silently become one. Its first code names a four-eyes rule whose
guarded move is reachable without ever entering the watched state — real,
but not a reason to refuse the publish."
```

---

### Task 4: Fixture schema, in-memory harness, and the runner

The planted-defect suite is the spine of this plan: every refusal path gets a JSON fixture proving it fires, plus an accepting twin proving the happy path. Fixtures are data, not code, so later plans run the SAME files against the server build — the spec's "client and server can never quietly disagree" (§7, honesty invariant 2). This task builds the fixture contract and the in-memory `EngineContext`; the fixtures themselves land task-by-task with the code they prove.

`priorEvents` is restricted to `ticket.created` / `ticket.transitioned` / `ticket.workflow_rebound` / `ticket.assigned` / `ticket.field_set` — event types a real server will ingest once Plan 3 registers them — so the server-side harness can eventually replay them for real. (`ticket.workflow_rebound` is the explicit workflow migration of the coordination doc's 2026-08-26 decision; the harness folds it because four-eyes must be provable across one, and a fixture that needed a harness override to exist would be proving something the server can never reproduce.) Workflow definitions and memberships are planted directly (`workflowDefs`, `memberships` fields) because publishing goes through the very validation some fixtures must bypass, and membership events belong to a later plan's vocabulary (Open question 8).

**Files:**
- Create: `packages/rule-engine/src/fixtures/harness.ts`
- Create: `packages/rule-engine/fixtures/pass-through-accepts-unhandled-event-types.json`
- Modify: `packages/rule-engine/src/index.ts` (export the harness)
- Test: `packages/rule-engine/test/harness.test.ts`
- Test: `packages/rule-engine/test/fixtures.test.ts` (the runner — permanent)

**Interfaces:**
- Consumes: `EventEnvelope`, `EntityState`, `TicketState`, `PublishedWorkflowDef`, `membershipId`, `stateCategorySchema`, `workflowDefinedPayloadSchema` from `@gisik-nokma/domain`; `Accept`, `Refusal`, `EngineContext` from Plan 1's `packages/rule-engine/src/types.ts`; Plan 1's pass-through `evaluateEvent` (which the first fixture already passes against).
- Produces (later server-side plans import these): `fixtureSchema`/`Fixture`, `PartialEnvelope`, `loadFixtures(): Fixture[]`, `completeEnvelope(partial, seq): EventEnvelope`, `completeCandidate(fx): EventEnvelope`, `buildInMemoryContext(fx): EngineContext`, `assertFixtureOutcome(result, fx): void` (framework-free — throws plain `Error`, so any runner can use it). Envelope defaults: `workspaceId 'ws_1'`, `actorId 'user_a'`, `origin 'server'`, both times `'2026-08-20T00:00:00.000Z'`, envelope `version 1`, `id 'fx_evt_<seq>'`, `seq` = position (candidate = priorEvents.length + 1).

- [ ] **Step 1: Ensure the rule-engine package can run Vitest**

As Task 1 Step 1, but for `packages/rule-engine`: if Plan 1 did not add a `test` script, add `"test": "vitest run"`, the `vitest` devDependency, and `packages/rule-engine/vitest.config.ts` with the same content as Task 1 Step 1. Run `pnpm install`.

- [ ] **Step 2: Write the failing harness tests**

Create `packages/rule-engine/test/harness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  assertFixtureOutcome,
  buildInMemoryContext,
  completeCandidate,
  fixtureSchema,
  type Fixture,
} from '../src/fixtures/harness.js';

const wfBasic = {
  id: 'wf_basic',
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' as const },
    { id: 'doing', name: 'Doing', category: 'active' as const },
    { id: 'done', name: 'Done', category: 'terminal' as const },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'done', rules: [] },
    { from: 'done', to: 'doing', rules: [] },
  ],
};

function fixture(partial: Partial<Fixture>): Fixture {
  return fixtureSchema.parse({
    name: 'test fixture',
    workflowDefs: [wfBasic],
    memberships: [],
    priorEvents: [],
    candidateEvent: {
      type: 'ticket.transitioned',
      entity: { kind: 'ticket', id: 't1' },
      actorId: 'user_a',
      payload: { to: 'doing' },
    },
    expected: { refused: false },
    ...partial,
  });
}

describe('buildInMemoryContext', () => {
  it('folds prior events into ticket state: created, transitioned, assigned, field_set', async () => {
    const fx = fixture({
      priorEvents: [
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { workflowId: 'wf_basic' } },
        { type: 'ticket.transitioned', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_b', payload: { to: 'doing' } },
        { type: 'ticket.assigned', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { assigneeId: 'user_b' } },
        { type: 'ticket.field_set', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { field: 'due_date', value: '2026-09-01' } },
      ],
    });
    const ctx = buildInMemoryContext(fx);
    const ticket = await ctx.getEntityState('ticket', 't1');
    if (ticket === null || ticket.kind !== 'ticket') throw new Error('expected a ticket');
    expect(ticket.stateId).toBe('doing');
    expect(ticket.stateCategory).toBe('active');
    expect(ticket.assigneeId).toBe('user_b');
    expect(ticket.fields).toEqual({
      due_date: {
        value: '2026-09-01',
        actorId: 'user_a',
        clientTime: '2026-08-20T00:00:00.000Z',
        serverTime: '2026-08-20T00:00:00.000Z',
      },
    });
    expect(ticket.transitions).toEqual([
      { toStateId: 'doing', actorId: 'user_b', seq: 2, workflowId: 'wf_basic', workflowVersion: 1 },
    ]);
  });

  it("a created ticket starts in its workflow's initialStateId", async () => {
    const fx = fixture({
      priorEvents: [
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { workflowId: 'wf_basic' } },
      ],
    });
    const ticket = await buildInMemoryContext(fx).getEntityState('ticket', 't1');
    if (ticket === null || ticket.kind !== 'ticket') throw new Error('expected a ticket');
    expect(ticket.stateId).toBe(wfBasic.initialStateId);
    expect(ticket.stateCategory).toBe('open');
  });

  it('children are found by parentId', async () => {
    const fx = fixture({
      priorEvents: [
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { workflowId: 'wf_basic' } },
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't2' }, actorId: 'user_a', payload: { workflowId: 'wf_basic', parentId: 't1' } },
      ],
    });
    const children = await buildInMemoryContext(fx).getChildrenStates('t1');
    expect(children.map((child) => child.id)).toEqual(['t2']);
  });

  it('memberships resolve by the ws_1:user convention', async () => {
    const fx = fixture({ memberships: [{ userId: 'user_a', role: 'admin' }] });
    const membership = await buildInMemoryContext(fx).getEntityState('membership', 'ws_1:user_a');
    if (membership === null || membership.kind !== 'membership') throw new Error('expected a membership');
    expect(membership.role).toBe('admin');
  });

  it('getWorkflowDef returns the latest version by default and exact versions on request', async () => {
    const v2 = { ...wfBasic, version: 2, name: 'Basic v2' };
    const fx = fixture({ workflowDefs: [wfBasic, v2] });
    const ctx = buildInMemoryContext(fx);
    expect((await ctx.getWorkflowDef('wf_basic'))?.version).toBe(2);
    expect((await ctx.getWorkflowDef('wf_basic', 1))?.name).toBe('Basic');
    expect(await ctx.getWorkflowDef('wf_ghost')).toBeNull();
  });

  it('a prior event of any other type is a fixture-authoring error', () => {
    const fx = fixture({
      priorEvents: [{ type: 'comment.added', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: {} }],
    });
    expect(() => buildInMemoryContext(fx)).toThrow(/prior events may only be/);
  });
});

describe('completeCandidate', () => {
  it('fills deterministic defaults', () => {
    const env = completeCandidate(fixture({}));
    expect(env).toEqual({
      id: 'fx_evt_1',
      workspaceId: 'ws_1',
      entity: { kind: 'ticket', id: 't1' },
      type: 'ticket.transitioned',
      version: 1,
      payload: { to: 'doing' },
      actorId: 'user_a',
      origin: 'server',
      clientTime: '2026-08-20T00:00:00.000Z',
      serverTime: '2026-08-20T00:00:00.000Z',
      seq: 1,
    });
  });
});

describe('assertFixtureOutcome', () => {
  it('accepts what was expected and names what was not', () => {
    const accepting = fixture({});
    expect(() => assertFixtureOutcome({ refused: false }, accepting)).not.toThrow();
    expect(() =>
      assertFixtureOutcome({ refused: true, rule: 'require-comment', reason: 'x' }, accepting),
    ).toThrow(/expected acceptance/);

    const refusing = fixture({
      expected: { refused: true, rule: 'require-comment', reason: 'This move must carry a comment explaining it, and none was provided.' },
    });
    expect(() =>
      assertFixtureOutcome(
        { refused: true, rule: 'require-comment', reason: 'This move must carry a comment explaining it, and none was provided.' },
        refusing,
      ),
    ).not.toThrow();
    expect(() => assertFixtureOutcome({ refused: false }, refusing)).toThrow(/expected refusal/);
    expect(() =>
      assertFixtureOutcome({ refused: true, rule: 'require-comment', reason: 'wrong words' }, refusing),
    ).toThrow(/reason mismatch/);

    const prefix = fixture({
      expected: { refused: true, rule: 'malformed-payload', reasonStartsWith: 'This ticket.transitioned event' },
    });
    expect(() =>
      assertFixtureOutcome({ refused: true, rule: 'malformed-payload', reason: 'This ticket.transitioned event is broken' }, prefix),
    ).not.toThrow();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: FAIL — cannot resolve `../src/fixtures/harness.js`.

- [ ] **Step 4: Implement the harness**

Create `packages/rule-engine/src/fixtures/harness.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  membershipId,
  stateCategorySchema,
  workflowDefinedPayloadSchema,
  type EntityState,
  type EventEnvelope,
  type PublishedWorkflowDef,
  type TicketState,
} from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../types.js';

const entityKindSchema = z.enum(['workspace', 'project', 'ticket', 'workflow', 'ticket-type', 'membership']);

const partialEnvelopeSchema = z.object({
  id: z.string().optional(),
  workspaceId: z.string().optional(),
  entity: z.object({ kind: entityKindSchema, id: z.string() }),
  type: z.string(),
  version: z.number().int().optional(),
  payload: z.unknown(),
  actorId: z.string().optional(),
  origin: z.enum(['web', 'mobile', 'desktop', 'server']).optional(),
  clientTime: z.string().optional(),
  serverTime: z.string().optional(),
  seq: z.number().int().optional(),
});
export type PartialEnvelope = z.infer<typeof partialEnvelopeSchema>;

export const fixtureSchema = z.object({
  name: z.string().min(1),
  workflowDefs: z.array(workflowDefinedPayloadSchema).default([]),
  memberships: z
    .array(z.object({ userId: z.string(), role: z.enum(['owner', 'admin', 'member', 'guest']) }))
    .default([]),
  priorEvents: z.array(partialEnvelopeSchema).default([]),
  candidateEvent: partialEnvelopeSchema,
  expected: z.union([
    z.object({ refused: z.literal(false) }),
    z.object({ refused: z.literal(true), rule: z.string(), reason: z.string() }),
    z.object({ refused: z.literal(true), rule: z.string(), reasonStartsWith: z.string() }),
    // Rule-only: the fixture asserts WHICH rule refused, and leaves the wording
    // to the plan that owns the rule. Plans 3 and 9 ship such fixtures against
    // rules defined here — without this branch their fixtures fail to load, and
    // copying a reason string into a foreign plan is how two copies of one
    // sentence start drifting.
    z.object({ refused: z.literal(true), rule: z.string() }),
  ]),
});
export type Fixture = z.infer<typeof fixtureSchema>;

const FIXTURE_TIME = '2026-08-20T00:00:00.000Z';

export function completeEnvelope(partial: PartialEnvelope, seq: number): EventEnvelope {
  return {
    id: partial.id ?? `fx_evt_${seq}`,
    workspaceId: partial.workspaceId ?? 'ws_1',
    entity: partial.entity,
    type: partial.type,
    version: partial.version ?? 1,
    payload: partial.payload,
    actorId: partial.actorId ?? 'user_a',
    origin: partial.origin ?? 'server',
    clientTime: partial.clientTime ?? FIXTURE_TIME,
    serverTime: partial.serverTime ?? FIXTURE_TIME,
    seq: partial.seq ?? seq,
  };
}

export function completeCandidate(fx: Fixture): EventEnvelope {
  return completeEnvelope(fx.candidateEvent, fx.priorEvents.length + 1);
}

/** Load and validate every fixture JSON. A malformed fixture throws — the planted-defect discipline applies to the fixtures themselves. */
export function loadFixtures(): Fixture[] {
  const dir = fileURLToPath(new URL('../../fixtures/', import.meta.url));
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort();
  return files.map((file) => {
    const raw: unknown = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    const parsed = fixtureSchema.safeParse(raw);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      throw new Error(`fixture ${file} is malformed: ${detail}`);
    }
    return parsed.data;
  });
}

// --- In-memory EngineContext -------------------------------------------------

const ticketCreatedFixturePayloadSchema = z.object({
  workflowId: z.string(),
  workflowVersion: z.number().int().optional(),
  parentId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  // Harness-only overrides for planting states the ledger could not produce:
  stateId: z.string().optional(),
  stateCategory: stateCategorySchema.optional(),
});
const ticketTransitionedFixturePayloadSchema = z.object({ to: z.string() });
// Plan 3 owns ticket.workflow_rebound; the harness folds it because
// require-different-user must be provable across a migration, and this plan's
// fixtures may only contain events a real server can ingest.
const ticketWorkflowReboundFixturePayloadSchema = z.object({
  toWorkflowId: z.string(),
  toStateId: z.string(),
});
const ticketAssignedFixturePayloadSchema = z.object({ assigneeId: z.string().nullable() });
const ticketFieldSetFixturePayloadSchema = z.object({ field: z.string(), value: z.unknown() });

export function buildInMemoryContext(fx: Fixture): EngineContext {
  const defs = new Map<string, PublishedWorkflowDef>();
  for (const def of fx.workflowDefs) defs.set(`${def.id}@${def.version}`, def);
  const latestOf = (workflowId: string): PublishedWorkflowDef | null => {
    let latest: PublishedWorkflowDef | null = null;
    for (const def of fx.workflowDefs) {
      if (def.id === workflowId && (latest === null || def.version > latest.version)) latest = def;
    }
    return latest;
  };

  const tickets = new Map<string, TicketState>();
  fx.priorEvents.forEach((partial, index) => {
    applyPriorEvent(tickets, defs, latestOf, completeEnvelope(partial, index + 1));
  });

  const memberships = new Map<string, EntityState>();
  for (const member of fx.memberships) {
    const id = membershipId('ws_1', member.userId);
    memberships.set(id, { kind: 'membership', id, workspaceId: 'ws_1', userId: member.userId, role: member.role });
  }

  return {
    async getEntityState(kind, id) {
      if (kind === 'ticket') return tickets.get(id) ?? null;
      if (kind === 'membership') return memberships.get(id) ?? null;
      return null;
    },
    async getChildrenStates(ticketId) {
      return [...tickets.values()].filter((ticket) => ticket.parentId === ticketId);
    },
    async getWorkflowDef(workflowId, version) {
      if (version !== undefined) return defs.get(`${workflowId}@${version}`) ?? null;
      return latestOf(workflowId);
    },
  };
}

function applyPriorEvent(
  tickets: Map<string, TicketState>,
  defs: Map<string, PublishedWorkflowDef>,
  latestOf: (workflowId: string) => PublishedWorkflowDef | null,
  env: EventEnvelope,
): void {
  switch (env.type) {
    case 'ticket.created': {
      const payload = ticketCreatedFixturePayloadSchema.parse(env.payload);
      const version = payload.workflowVersion ?? latestOf(payload.workflowId)?.version ?? 1;
      const def = defs.get(`${payload.workflowId}@${version}`);
      const initial = def === undefined ? undefined : def.states.find((s) => s.id === def.initialStateId);
      const stateId = payload.stateId ?? initial?.id;
      const stateCategory = payload.stateCategory ?? def?.states.find((s) => s.id === stateId)?.category;
      if (stateId === undefined || stateCategory === undefined) {
        throw new Error(
          `fixture prior event creates ticket ${env.entity.id} but its state cannot be resolved; give the payload explicit stateId and stateCategory`,
        );
      }
      tickets.set(env.entity.id, {
        kind: 'ticket',
        id: env.entity.id,
        workspaceId: env.workspaceId,
        projectId: 'prj_1', // harness default — no rule in this plan reads it
        typeId: 'task', // harness default — no rule in this plan reads it
        parentId: payload.parentId ?? null,
        workflowId: payload.workflowId,
        workflowVersion: version,
        stateId,
        stateCategory,
        assigneeId: payload.assigneeId ?? null,
        collaboratorIds: [],
        fields: {},
        transitions: [],
      });
      return;
    }
    case 'ticket.transitioned': {
      const payload = ticketTransitionedFixturePayloadSchema.parse(env.payload);
      const ticket = mustTicket(tickets, env);
      const def = defs.get(`${ticket.workflowId}@${ticket.workflowVersion}`);
      const state = def?.states.find((s) => s.id === payload.to);
      if (state === undefined) {
        throw new Error(`fixture prior event moves ticket ${ticket.id} to unknown state "${payload.to}"`);
      }
      ticket.stateId = state.id;
      ticket.stateCategory = state.category;
      // The entry records the workflow AND version whose vocabulary its
      // toStateId is written in — the ticket's own pair at the moment the
      // move was applied. Both are read back by require-different-user.
      ticket.transitions.push({
        toStateId: state.id,
        actorId: env.actorId,
        seq: env.seq,
        workflowId: ticket.workflowId,
        workflowVersion: ticket.workflowVersion,
      });
      return;
    }
    case 'ticket.workflow_rebound': {
      // The explicit migration between two unrelated workflows (Plan 3 owns
      // the event; the harness folds it because four-eyes must be provable
      // across one). It moves the ticket's pinned workflow, version and state
      // and appends NO log entry — a migration is not a transition, and the
      // entries already in the log keep the vocabulary they were written in.
      const payload = ticketWorkflowReboundFixturePayloadSchema.parse(env.payload);
      const ticket = mustTicket(tickets, env);
      const target = latestOf(payload.toWorkflowId);
      if (target === null) {
        throw new Error(
          `fixture prior event rebinds ticket ${ticket.id} to workflow "${payload.toWorkflowId}", which the fixture never defines`,
        );
      }
      const state = target.states.find((s) => s.id === payload.toStateId);
      if (state === undefined) {
        throw new Error(
          `fixture prior event rebinds ticket ${ticket.id} to unknown state "${payload.toStateId}" of workflow "${payload.toWorkflowId}"`,
        );
      }
      ticket.workflowId = target.id;
      ticket.workflowVersion = target.version;
      ticket.stateId = state.id;
      ticket.stateCategory = state.category;
      return;
    }
    case 'ticket.assigned': {
      const payload = ticketAssignedFixturePayloadSchema.parse(env.payload);
      mustTicket(tickets, env).assigneeId = payload.assigneeId;
      return;
    }
    case 'ticket.field_set': {
      const payload = ticketFieldSetFixturePayloadSchema.parse(env.payload);
      mustTicket(tickets, env).fields[payload.field] = {
        value: payload.value ?? null,
        actorId: env.actorId,
        clientTime: env.clientTime,
        serverTime: env.serverTime,
      };
      return;
    }
    default:
      throw new Error(
        `fixture prior events may only be ticket.created/ticket.transitioned/ticket.workflow_rebound/ticket.assigned/ticket.field_set; got ${env.type}`,
      );
  }
}

function mustTicket(tickets: Map<string, TicketState>, env: EventEnvelope): TicketState {
  const ticket = tickets.get(env.entity.id);
  if (ticket === undefined) throw new Error(`fixture prior event touches unknown ticket ${env.entity.id}`);
  return ticket;
}

// --- Outcome assertion (framework-free, so any runner can use it) -----------

export function assertFixtureOutcome(result: Accept | Refusal, fx: Fixture): void {
  if (!fx.expected.refused) {
    if (result.refused) {
      throw new Error(`fixture "${fx.name}": expected acceptance, got refusal [${result.rule}] ${result.reason}`);
    }
    return;
  }
  if (!result.refused) {
    throw new Error(`fixture "${fx.name}": expected refusal [${fx.expected.rule}], got acceptance`);
  }
  if (result.rule !== fx.expected.rule) {
    throw new Error(
      `fixture "${fx.name}": expected rule "${fx.expected.rule}", got "${result.rule}" (${result.reason})`,
    );
  }
  if ('reason' in fx.expected) {
    if (result.reason !== fx.expected.reason) {
      throw new Error(
        `fixture "${fx.name}": reason mismatch:\n  expected: ${fx.expected.reason}\n  got:      ${result.reason}`,
      );
    }
  } else if ('reasonStartsWith' in fx.expected) {
    if (!result.reason.startsWith(fx.expected.reasonStartsWith)) {
      throw new Error(
        `fixture "${fx.name}": reason does not start with: ${fx.expected.reasonStartsWith}\n  got: ${result.reason}`,
      );
    }
  }
  // Rule-only fixtures stop here: the rule id was asserted above, and the
  // wording belongs to whichever plan defines that rule.
}
```

In `packages/rule-engine/src/index.ts`, add:

```ts
export * from './fixtures/harness.js';
```

- [ ] **Step 5: Run the harness tests to verify they pass**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: PASS (harness tests; no fixture runner yet).

- [ ] **Step 6: Write the permanent fixture runner and the first fixture**

Create `packages/rule-engine/test/fixtures.test.ts` — this file never changes again; every later task only adds JSON files:

```ts
import { describe, expect, it } from 'vitest';
import { evaluateEvent } from '../src/index.js';
import { assertFixtureOutcome, buildInMemoryContext, completeCandidate, loadFixtures } from '../src/fixtures/harness.js';

const fixtures = loadFixtures();

describe('planted-defect fixtures', () => {
  it('the suite is not empty', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const fx of fixtures) {
    it(fx.name, async () => {
      const result = await evaluateEvent(completeCandidate(fx), buildInMemoryContext(fx));
      assertFixtureOutcome(result, fx);
    });
  }
});
```

Create `packages/rule-engine/fixtures/pass-through-accepts-unhandled-event-types.json` — proves the engine leaves the rest of the vocabulary alone in this plan (and passes even against Plan 1's pass-through):

```json
{
  "name": "an event type the engine does not handle passes through untouched",
  "workflowDefs": [],
  "memberships": [],
  "priorEvents": [],
  "candidateEvent": {
    "type": "comment.added",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": { "text": "just a comment" }
  },
  "expected": { "refused": false }
}
```

- [ ] **Step 7: Run the suite to verify it passes**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: PASS — the pass-through fixture accepts against Plan 1's pass-through engine.

- [ ] **Step 8: Commit**

```bash
git add packages/rule-engine/src/fixtures/harness.ts packages/rule-engine/src/index.ts packages/rule-engine/fixtures/pass-through-accepts-unhandled-event-types.json packages/rule-engine/test/harness.test.ts packages/rule-engine/test/fixtures.test.ts packages/rule-engine/vitest.config.ts packages/rule-engine/package.json pnpm-lock.yaml
git commit -m "Planted-defect fixture harness: refusals will be proven as data, not asserted as prose

Fixtures are JSON so the same files run against client and server builds —
the two can never quietly disagree. Prior events stay within the ingestible
vocabulary; defs and memberships are planted directly because some fixtures
must bypass the very validation they prove. The outcome assertion is
framework-free and compares refusal reasons character for character."
```

---

### Task 5: The dispatcher and the `workflow.defined` path

Replace Plan 1's pass-through `evaluateEvent` with the real dispatcher and implement the `workflow.defined` refusals: structural (via `validateWorkflowDef`), versioning (versions are consecutive), and stranding (every dropped state must be mapped, occupied or not — Open question 6 records why that is settled, permanent semantics rather than a temporary margin).

The engine calls `validateWorkflowDef` and **never** calls `adviseWorkflowDef`. That is not an omission to be tidied up later: everything the issue array holds is joined into one refusal here, so an advisory routed through it becomes a refusal. Step 3 plants a fixture that fails the day someone changes this.

**Files:**
- Create: `packages/rule-engine/src/refusal-rules.ts`
- Create: `packages/rule-engine/src/evaluate.ts`
- Create: `packages/rule-engine/src/workflow-defined.ts`
- Modify: `packages/rule-engine/src/index.ts` (export `evaluateEvent` from the new module; delete Plan 1's pass-through body — locate it first with `grep -rn "evaluateEvent" packages/rule-engine/src`)
- Create: 20 fixture files under `packages/rule-engine/fixtures/` (listed in Steps 1–3)

**Interfaces:**
- Consumes: `validateWorkflowDef`, `workflowDefinedPayloadSchema` from `@gisik-nokma/domain` (Tasks 1, 3); `Accept`, `Refusal`, `EngineContext`, `EventEnvelope` types; harness (Task 4).
- Produces: the real `evaluateEvent(env, ctx)` (frozen signature, exported from the package index — ingest keeps calling it unchanged); `REFUSAL_RULES` — the canonical rule-name constants every later plan and client uses: `malformed-payload`, `unknown-ticket`, `unknown-workflow`, `unknown-state`, `illegal-transition`, `stranded-state`, `parent-terminal-with-open-children`, `workflow-structure`, `workflow-version`, `workflow-state-mapping`, `restrict-to`, `require-comment`, `require-evidence`, `require-field`, `require-different-user`; `evaluateWorkflowDefined(env, ctx)`.

- [ ] **Step 1: Write the failing fixtures — structural refusals**

Each planted definition is built to fire **exactly one** structural issue, so the expected reason is the wrapper plus that one message. Create these files under `packages/rule-engine/fixtures/`:

`workflow-defined-refuses-no-terminal-state.json`:

```json
{
  "name": "a workflow with no terminal state cannot be published",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_new" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_new", "version": 1, "name": "Endless", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "todo", "rules": [] }
      ]
    }
  },
  "expected": {
    "refused": true,
    "rule": "workflow-structure",
    "reason": "This workflow definition cannot be published: This workflow has no terminal state, so no ticket could ever finish."
  }
}
```

`workflow-defined-refuses-duplicate-state-ids.json`:

```json
{
  "name": "duplicate state ids cannot be published",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_new" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_new", "version": 1, "name": "Doubled", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "done", "name": "Done", "category": "terminal" },
        { "id": "done", "name": "Done again", "category": "terminal" }
      ],
      "transitions": [ { "from": "todo", "to": "done", "rules": [] } ]
    }
  },
  "expected": {
    "refused": true,
    "rule": "workflow-structure",
    "reason": "This workflow definition cannot be published: Two states share the id \"done\"; state ids must be unique."
  }
}
```

`workflow-defined-refuses-unknown-transition-state.json`:

```json
{
  "name": "a transition pointing at a state that does not exist cannot be published",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_new" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_new", "version": 1, "name": "Dangling", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [] },
        { "from": "doing", "to": "blessed", "rules": [] }
      ]
    }
  },
  "expected": {
    "refused": true,
    "rule": "workflow-structure",
    "reason": "This workflow definition cannot be published: The transition from \"doing\" to \"blessed\" refers to \"blessed\", which is not a state in this workflow."
  }
}
```

`workflow-defined-refuses-unreachable-state.json`:

```json
{
  "name": "an unreachable state cannot be published",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_new" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_new", "version": 1, "name": "Stray", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "limbo", "name": "Limbo", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [ { "from": "todo", "to": "done", "rules": [] } ]
    }
  },
  "expected": {
    "refused": true,
    "rule": "workflow-structure",
    "reason": "This workflow definition cannot be published: State \"Limbo\" cannot be reached from the starting state \"To do\"."
  }
}
```

`workflow-defined-refuses-unenterable-terminal-state.json`:

```json
{
  "name": "a terminal state nothing leads into cannot be published",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_new" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_new", "version": 1, "name": "Locked door", "initialStateId": "done",
      "states": [
        { "id": "done", "name": "Done", "category": "terminal" },
        { "id": "todo", "name": "To do", "category": "open" }
      ],
      "transitions": [ { "from": "done", "to": "todo", "rules": [] } ]
    }
  },
  "expected": {
    "refused": true,
    "rule": "workflow-structure",
    "reason": "This workflow definition cannot be published: Terminal state \"Done\" has no transition leading into it, so no ticket could ever reach it."
  }
}
```

`workflow-defined-refuses-empty-restrict-to.json`:

```json
{
  "name": "a restrict-to that names nobody cannot be published",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_new" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_new", "version": 1, "name": "Nobody", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [ { "kind": "restrict-to" } ] },
        { "from": "done", "to": "doing", "rules": [] }
      ]
    }
  },
  "expected": {
    "refused": true,
    "rule": "workflow-structure",
    "reason": "This workflow definition cannot be published: A restrict-to rule on the transition from \"Doing\" to \"Done\" names nobody: it must allow the assignee, at least one role, or at least one named person."
  }
}
```

`workflow-defined-refuses-rdu-unknown-state.json`:

```json
{
  "name": "a four-eyes rule watching a nonexistent transition cannot be published",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_new" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_new", "version": 1, "name": "Blind reviewer", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [ { "kind": "require-different-user", "thanActorOf": { "to": "reviewed" } } ] },
        { "from": "done", "to": "doing", "rules": [] }
      ]
    }
  },
  "expected": {
    "refused": true,
    "rule": "workflow-structure",
    "reason": "This workflow definition cannot be published: A require-different-user rule on the transition from \"Doing\" to \"Done\" refers to a move to \"reviewed\", but no state with that id exists."
  }
}
```

`workflow-defined-refuses-duplicate-transition.json`:

```json
{
  "name": "two transitions over the same edge cannot be published",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_new" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_new", "version": 1, "name": "Doubled edge", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [] },
        { "from": "doing", "to": "done", "rules": [ { "kind": "require-comment" } ] }
      ]
    }
  },
  "expected": {
    "refused": true,
    "rule": "workflow-structure",
    "reason": "This workflow definition cannot be published: There are two transitions from \"Doing\" to \"Done\"; keep at most one transition per direction between a pair of states."
  }
}
```

- [ ] **Step 2: Write the failing fixtures — envelope hygiene and versioning**

`workflow-defined-refuses-malformed-payload.json` (zod wording varies by zod major, so this one uses `reasonStartsWith`):

```json
{
  "name": "a workflow.defined payload that does not parse is refused",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_new" },
    "actorId": "user_admin",
    "payload": { "id": "wf_new" }
  },
  "expected": {
    "refused": true,
    "rule": "malformed-payload",
    "reasonStartsWith": "This workflow.defined event's payload is malformed:"
  }
}
```

`workflow-defined-refuses-wrong-entity-kind.json`:

```json
{
  "name": "a workflow.defined event pointing at a non-workflow entity is refused",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "ticket", "id": "wf_new" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_new", "version": 1, "name": "Misfiled", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [ { "from": "todo", "to": "done", "rules": [] } ]
    }
  },
  "expected": {
    "refused": true,
    "rule": "malformed-payload",
    "reason": "This workflow.defined event does not point at a workflow; it points at a ticket."
  }
}
```

`workflow-defined-refuses-entity-id-mismatch.json`:

```json
{
  "name": "a payload defining a different workflow than the envelope names is refused",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_other" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_new", "version": 1, "name": "Shifty", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [ { "from": "todo", "to": "done", "rules": [] } ]
    }
  },
  "expected": {
    "refused": true,
    "rule": "malformed-payload",
    "reason": "This workflow.defined event points at workflow wf_other, but its payload defines workflow wf_new."
  }
}
```

`workflow-defined-accepts-a-clean-first-version.json`:

```json
{
  "name": "a clean first version publishes",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_basic" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_basic", "version": 1, "name": "Basic", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [] },
        { "from": "done", "to": "doing", "rules": [] }
      ]
    }
  },
  "expected": { "refused": false }
}
```

`workflow-defined-refuses-a-first-version-other-than-1.json`:

```json
{
  "name": "a brand-new workflow must start at version 1",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_new" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_new", "version": 2, "name": "Jumped in", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [ { "from": "todo", "to": "done", "rules": [] } ]
    }
  },
  "expected": {
    "refused": true,
    "rule": "workflow-version",
    "reason": "The first published version of a workflow must be version 1; this definition claims version 2."
  }
}
```

`workflow-defined-refuses-a-version-jump.json` — the planted store below (`workflowDefs`) reuses the "Basic" v1 definition exactly as in `workflow-defined-accepts-a-clean-first-version.json`'s payload; the candidate republishes it as version 3:

```json
{
  "name": "versions are consecutive: 1 then 3 is refused",
  "workflowDefs": [
    {
      "id": "wf_basic", "version": 1, "name": "Basic", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [] },
        { "from": "done", "to": "doing", "rules": [] }
      ]
    }
  ],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_basic" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_basic", "version": 3, "name": "Basic", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [] },
        { "from": "done", "to": "doing", "rules": [] }
      ]
    }
  },
  "expected": {
    "refused": true,
    "rule": "workflow-version",
    "reason": "Workflow \"Basic\" is at version 1; the next published version must be 2, not 3."
  }
}
```

- [ ] **Step 3: Write the failing fixtures — stranding, then the advisory-tier boundary**

All four stranding fixtures plant the same "Basic" v1 in `workflowDefs` (identical JSON to the one in `workflow-defined-refuses-a-version-jump.json` — copy that `workflowDefs` array verbatim into each). Only the candidate differs.

`workflow-defined-refuses-dropped-state-without-mapping.json`:

```json
{
  "name": "dropping a state without mapping it is refused",
  "workflowDefs": [
    {
      "id": "wf_basic", "version": 1, "name": "Basic", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [] },
        { "from": "done", "to": "doing", "rules": [] }
      ]
    }
  ],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_basic" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_basic", "version": 2, "name": "Basic", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [ { "from": "todo", "to": "done", "rules": [] } ]
    }
  },
  "expected": {
    "refused": true,
    "rule": "workflow-state-mapping",
    "reason": "Version 2 drops state(s) \"doing\" that version 1 has; publishing cannot see which tickets sit in which state, so every dropped state needs a stateMapping entry."
  }
}
```

`workflow-defined-refuses-mapping-to-unknown-state.json` — `"name"`: `"a stateMapping pointing at a state the new version lacks is refused"`; same `workflowDefs`; candidate payload identical to the previous fixture's **plus** `"stateMapping": { "doing": "review" }`; expected:

```json
  "expected": {
    "refused": true,
    "rule": "workflow-state-mapping",
    "reason": "The stateMapping sends \"doing\" to \"review\", but \"review\" is not a state in version 2."
  }
```

`workflow-defined-refuses-mapping-for-surviving-state.json` — `"name"`: `"a stateMapping for a state that still exists is refused"`; same `workflowDefs`; the candidate keeps **all three** states (payload identical to the v1 definition but with `"version": 2`) and adds `"stateMapping": { "todo": "done" }`; expected:

```json
  "expected": {
    "refused": true,
    "rule": "workflow-state-mapping",
    "reason": "The stateMapping remaps \"todo\", but that state still exists in version 2; only dropped states may be remapped."
  }
```

`workflow-defined-accepts-v2-with-complete-mapping.json` — `"name"`: `"a v2 that maps every dropped state publishes"`; same `workflowDefs`; candidate payload identical to `workflow-defined-refuses-dropped-state-without-mapping.json`'s **plus** `"stateMapping": { "doing": "todo" }`; expected:

```json
  "expected": { "refused": false }
```

`workflow-defined-accepts-a-rename-only-v2.json` — same `workflowDefs`; candidate keeps all state **ids** and renames display names (state ids are identity; a display rename strands nothing and needs no mapping):

```json
{
  "name": "renaming display names without touching ids needs no mapping",
  "workflowDefs": [
    {
      "id": "wf_basic", "version": 1, "name": "Basic", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [] },
        { "from": "done", "to": "doing", "rules": [] }
      ]
    }
  ],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_basic" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_basic", "version": 2, "name": "Basic", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "Queued", "category": "open" },
        { "id": "doing", "name": "In hand", "category": "active" },
        { "id": "done", "name": "Finished", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [] },
        { "from": "done", "to": "doing", "rules": [] }
      ]
    }
  },
  "expected": { "refused": false }
}
```

`workflow-defined-accepts-a-def-the-advisory-warns-about.json` — **this fixture exists to prove the advisory tier cannot become a refusal.** Its definition trips `rdu-bypassable` and nothing else: `validateWorkflowDef` returns an empty array, `adviseWorkflowDef` returns one advisory, and the engine — which never calls the latter — must accept. The day someone folds warnings into the issue array, this fixture fails, loudly, with a refusal that names the rule that did it:

```json
{
  "name": "a definition the advisory tier warns about still publishes — warnings are not refusals",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "workflow.defined",
    "entity": { "kind": "workflow", "id": "wf_fast" },
    "actorId": "user_admin",
    "payload": {
      "id": "wf_fast", "version": 1, "name": "Fast track", "initialStateId": "draft",
      "states": [
        { "id": "draft", "name": "Draft", "category": "open" },
        { "id": "review", "name": "In review", "category": "active" },
        { "id": "approved", "name": "Approved", "category": "terminal" }
      ],
      "transitions": [
        { "from": "draft", "to": "review", "rules": [] },
        { "from": "review", "to": "draft", "rules": [] },
        { "from": "review", "to": "approved", "rules": [ { "kind": "require-different-user", "thanActorOf": { "to": "review" } } ] },
        { "from": "draft", "to": "approved", "rules": [ { "kind": "require-different-user", "thanActorOf": { "to": "review" } } ] }
      ]
    }
  },
  "expected": { "refused": false }
}
```

- [ ] **Step 4: Run the suite to verify the new fixtures fail**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: FAIL — every `workflow-defined-refuses-*` fixture reports "expected refusal … got acceptance" (the engine is still Plan 1's pass-through). The accepting fixtures pass vacuously; that is fine — their job is to keep passing once the refusals exist.

- [ ] **Step 5: Implement the rule-name constants, the workflow.defined path, and the dispatcher**

Create `packages/rule-engine/src/refusal-rules.ts`:

```ts
/**
 * The canonical refusal rule names. Refusal.rule is a plain string in the
 * frozen interface; these constants keep every producer and consumer spelling
 * them identically. The five vocabulary entries deliberately equal the Rule
 * kind that fired.
 */
export const REFUSAL_RULES = {
  malformedPayload: 'malformed-payload',
  unknownTicket: 'unknown-ticket',
  unknownWorkflow: 'unknown-workflow',
  unknownState: 'unknown-state',
  illegalTransition: 'illegal-transition',
  strandedState: 'stranded-state',
  parentTerminal: 'parent-terminal-with-open-children',
  workflowStructure: 'workflow-structure',
  workflowVersion: 'workflow-version',
  workflowStateMapping: 'workflow-state-mapping',
  restrictTo: 'restrict-to',
  requireComment: 'require-comment',
  requireEvidence: 'require-evidence',
  requireField: 'require-field',
  requireDifferentUser: 'require-different-user',
} as const;
```

Create `packages/rule-engine/src/workflow-defined.ts`:

```ts
import { validateWorkflowDef, workflowDefinedPayloadSchema, type EventEnvelope } from '@gisik-nokma/domain';
import { REFUSAL_RULES } from './refusal-rules.js';
import type { Accept, EngineContext, Refusal } from './types.js';

export async function evaluateWorkflowDefined(
  env: EventEnvelope,
  ctx: EngineContext,
): Promise<Accept | Refusal> {
  if (env.entity.kind !== 'workflow') {
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This workflow.defined event does not point at a workflow; it points at a ${env.entity.kind}.`,
    };
  }

  const parsed = workflowDefinedPayloadSchema.safeParse(env.payload);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.message).join('; ');
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This workflow.defined event's payload is malformed: ${detail}`,
    };
  }
  const payload = parsed.data;

  if (payload.id !== env.entity.id) {
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This workflow.defined event points at workflow ${env.entity.id}, but its payload defines workflow ${payload.id}.`,
    };
  }

  const issues = validateWorkflowDef(payload);
  if (issues.length > 0) {
    return {
      refused: true,
      rule: REFUSAL_RULES.workflowStructure,
      reason: `This workflow definition cannot be published: ${issues.map((issue) => issue.message).join(' ')}`,
    };
  }

  const latest = await ctx.getWorkflowDef(payload.id);
  if (latest === null) {
    if (payload.version !== 1) {
      return {
        refused: true,
        rule: REFUSAL_RULES.workflowVersion,
        reason: `The first published version of a workflow must be version 1; this definition claims version ${payload.version}.`,
      };
    }
    return { refused: false };
  }

  if (payload.version !== latest.version + 1) {
    return {
      refused: true,
      rule: REFUSAL_RULES.workflowVersion,
      reason: `Workflow "${latest.name}" is at version ${latest.version}; the next published version must be ${latest.version + 1}, not ${payload.version}.`,
    };
  }

  // Stranding: every state the new version drops must be mapped somewhere that
  // exists in the new version — occupied or not. This is permanent semantics,
  // not a stopgap (Open question 6, settled by the owner). Making publish
  // legality depend on occupancy would make the client and server engines
  // disagree by construction: replicas are visibility-scoped, so a user who
  // cannot see the tickets in the dropped state computes a different
  // occupancy than the server does, and one shared fixture suite could no
  // longer bind both. Occupancy is a builder courtesy, never an engine input.
  const newStateIds = new Set(payload.states.map((state) => state.id));
  const dropped = latest.states.filter((state) => !newStateIds.has(state.id)).map((state) => state.id);
  const mapping = payload.stateMapping ?? {};

  const unmapped = dropped.filter((id) => mapping[id] === undefined);
  if (unmapped.length > 0) {
    const list = unmapped.map((id) => `"${id}"`).join(', ');
    return {
      refused: true,
      rule: REFUSAL_RULES.workflowStateMapping,
      reason: `Version ${payload.version} drops state(s) ${list} that version ${latest.version} has; publishing cannot see which tickets sit in which state, so every dropped state needs a stateMapping entry.`,
    };
  }

  for (const [oldId, target] of Object.entries(mapping)) {
    if (!dropped.includes(oldId)) {
      return {
        refused: true,
        rule: REFUSAL_RULES.workflowStateMapping,
        reason: `The stateMapping remaps "${oldId}", but that state still exists in version ${payload.version}; only dropped states may be remapped.`,
      };
    }
    if (!newStateIds.has(target)) {
      return {
        refused: true,
        rule: REFUSAL_RULES.workflowStateMapping,
        reason: `The stateMapping sends "${oldId}" to "${target}", but "${target}" is not a state in version ${payload.version}.`,
      };
    }
  }

  return { refused: false };
}
```

Create `packages/rule-engine/src/evaluate.ts`:

```ts
import type { EventEnvelope } from '@gisik-nokma/domain';
import { evaluateWorkflowDefined } from './workflow-defined.js';
import type { Accept, EngineContext, Refusal } from './types.js';

/**
 * The rule engine. Envelope-level checks (shape, unknown event type, ULID,
 * sequencing) belong to ingest (Plan 1) and are NOT repeated here. This plan
 * handles workflow.defined and (from Task 6) ticket.transitioned; every other
 * event type passes through — later plans add their own cases.
 */
export async function evaluateEvent(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  switch (env.type) {
    case 'workflow.defined':
      return evaluateWorkflowDefined(env, ctx);
    default:
      return { refused: false };
  }
}
```

In `packages/rule-engine/src/index.ts`: delete Plan 1's pass-through `evaluateEvent` implementation (or its re-export, wherever `grep -rn "evaluateEvent" packages/rule-engine/src` found it) and export the real one plus the constants:

```ts
export { evaluateEvent } from './evaluate.js';
export { REFUSAL_RULES } from './refusal-rules.js';
export { evaluateWorkflowDefined } from './workflow-defined.js';
```

- [ ] **Step 6: Run the suite to verify everything passes**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: PASS — all 20 new fixtures plus the pass-through fixture and the harness tests.

- [ ] **Step 7: Commit**

```bash
git add packages/rule-engine/src/refusal-rules.ts packages/rule-engine/src/workflow-defined.ts packages/rule-engine/src/evaluate.ts packages/rule-engine/src/index.ts packages/rule-engine/fixtures/
git commit -m "The engine's first real refusals: workflow definitions are validated, versioned, and may not strand

Structural defects refuse with every issue named in plain language; versions
must be consecutive; any dropped state must be mapped into the new version
before publish, occupied or not. That last rule is permanent: publish
legality that depended on occupancy would split the client and server
engines, because replicas only see the tickets their viewer may see, and
one shared fixture suite could no longer bind both. The refusal therefore
says what publishing actually knows instead of asserting tickets nobody
counted. Twenty planted defects prove each path — including one that
publishes cleanly while the advisory tier warns about it, so warnings can
never quietly become refusals."
```

---

### Task 6: `ticket.transitioned` — resolution and legality

The transition path's skeleton: parse the claim, find the ticket, resolve its workflow definition and version (walking stateMappings forward when the ticket last moved under an older version), and check the move is an edge the workflow declares — exact `from` preferred over `'*'`. The invariant and the rule vocabulary arrive in Tasks 7–11; until then a legal move accepts.

**Files:**
- Create: `packages/rule-engine/src/version-map.ts`
- Create: `packages/rule-engine/src/transition.ts`
- Modify: `packages/rule-engine/src/evaluate.ts` (add the `ticket.transitioned` case)
- Modify: `packages/rule-engine/src/index.ts` (export)
- Create: 10 fixture files (Steps 1–2)

**Interfaces:**
- Consumes: `ticketTransitionedPayloadSchema`, `TicketState`, `foldStateIdForward`, `FoldedState` from `@gisik-nokma/domain` (Task 1 — the pure walk); `REFUSAL_RULES` (Task 5); harness (Task 4).
- Produces: `evaluateTicketTransitioned(env, ctx)`; `resolveStateIdForward(workflowId, stateId, fromVersion, latest, ctx): Promise<ResolvedState>` — the engine's **only** entry to the version walk (Task 11's `require-different-user` is its other caller); it fetches the intermediate definitions through `ctx` and then delegates the walk itself to domain's `foldStateIdForward`, so the engine, Plan 3's projection and Plan 10's replica are provably running one implementation. `resolveCurrentStateId(ticket, latest, ctx): Promise<ResolvedState>` is a thin wrapper over it, and `ResolvedState` is re-exported from domain's `FoldedState` (`{ ok: true; stateId: string } | { ok: false; unmappedStateId: string }`) — one result type, not two structurally identical ones.

- [ ] **Step 1: Write the failing fixtures — hygiene and existence**

All transition fixtures that need a workflow plant the same "Basic" v1 (`workflowDefs` array exactly as in `workflow-defined-refuses-a-version-jump.json`). Create under `packages/rule-engine/fixtures/`:

`transition-refuses-wrong-entity-kind.json`:

```json
{
  "name": "a ticket.transitioned event pointing at a non-ticket entity is refused",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "ticket.transitioned",
    "entity": { "kind": "project", "id": "p1" },
    "actorId": "user_a",
    "payload": { "to": "doing" }
  },
  "expected": {
    "refused": true,
    "rule": "malformed-payload",
    "reason": "This ticket.transitioned event does not point at a ticket; it points at a project."
  }
}
```

`transition-refuses-malformed-payload.json`:

```json
{
  "name": "a ticket.transitioned payload without a target state is refused",
  "workflowDefs": [
    {
      "id": "wf_basic", "version": 1, "name": "Basic", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [] },
        { "from": "done", "to": "doing", "rules": [] }
      ]
    }
  ],
  "priorEvents": [
    { "type": "ticket.created", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "workflowId": "wf_basic" } }
  ],
  "candidateEvent": {
    "type": "ticket.transitioned",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": {}
  },
  "expected": {
    "refused": true,
    "rule": "malformed-payload",
    "reasonStartsWith": "This ticket.transitioned event's payload is malformed:"
  }
}
```

`transition-refuses-unknown-ticket.json`:

```json
{
  "name": "a move on a ticket nobody created is refused",
  "workflowDefs": [],
  "candidateEvent": {
    "type": "ticket.transitioned",
    "entity": { "kind": "ticket", "id": "t404" },
    "actorId": "user_a",
    "payload": { "to": "doing" }
  },
  "expected": {
    "refused": true,
    "rule": "unknown-ticket",
    "reason": "This event moves ticket t404, but no such ticket is known."
  }
}
```

`transition-refuses-unknown-workflow.json` (the ticket is planted with explicit state because its workflow has no published definition to resolve one from):

```json
{
  "name": "a ticket whose workflow was never published cannot be checked, so the move is refused",
  "workflowDefs": [],
  "priorEvents": [
    { "type": "ticket.created", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "workflowId": "wf_ghost", "stateId": "todo", "stateCategory": "open" } }
  ],
  "candidateEvent": {
    "type": "ticket.transitioned",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": { "to": "doing" }
  },
  "expected": {
    "refused": true,
    "rule": "unknown-workflow",
    "reason": "Ticket t1 uses workflow wf_ghost, but no published definition of that workflow is known."
  }
}
```

- [ ] **Step 2: Write the failing fixtures — legality and version mapping**

`transition-refuses-unknown-target-state.json` — `"name"`: `"a move to a state the workflow does not have is refused"`; `workflowDefs` = the "Basic" v1 array (verbatim as in `transition-refuses-malformed-payload.json`); `priorEvents` creates `t1` in `wf_basic` (same single `ticket.created` as above); candidate:

```json
  "candidateEvent": {
    "type": "ticket.transitioned",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": { "to": "archived" }
  },
  "expected": {
    "refused": true,
    "rule": "unknown-state",
    "reason": "The workflow \"Basic\" has no state \"archived\"."
  }
```

`transition-refuses-an-edge-the-workflow-lacks.json` — `"name"`: `"a move along an edge the workflow does not declare is refused"`; same `workflowDefs` and `priorEvents` (t1 sits in `todo`; Basic has no `todo`→`done` edge); candidate payload `{ "to": "done" }`; expected:

```json
  "expected": {
    "refused": true,
    "rule": "illegal-transition",
    "reason": "The workflow \"Basic\" does not allow moving from \"To do\" to \"Done\"."
  }
```

`transition-accepts-a-declared-edge.json` — `"name"`: `"a move along a declared edge is accepted"`; same `workflowDefs` and `priorEvents`; candidate payload `{ "to": "doing" }`; expected `{ "refused": false }`.

`transition-accepts-a-from-any-edge.json`:

```json
{
  "name": "a from-any edge is usable from every state",
  "workflowDefs": [
    {
      "id": "wf_star", "version": 1, "name": "Star", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "blocked", "name": "Blocked", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [] },
        { "from": "*", "to": "blocked", "rules": [] },
        { "from": "blocked", "to": "doing", "rules": [] }
      ]
    }
  ],
  "priorEvents": [
    { "type": "ticket.created", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "workflowId": "wf_star" } },
    { "type": "ticket.transitioned", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "to": "doing" } }
  ],
  "candidateEvent": {
    "type": "ticket.transitioned",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": { "to": "blocked" }
  },
  "expected": { "refused": false }
}
```

`transition-refuses-a-stranded-ticket.json` — the defensive path. The store plants v1 **and** a v2 with no mapping (a pair the publish path would have refused — that is the planted defect); the ticket last moved under v1 into `doing`, which v2 lacks:

```json
{
  "name": "a ticket in a state the current version dropped without a mapping is refused, not guessed about",
  "workflowDefs": [
    {
      "id": "wf_basic", "version": 1, "name": "Basic", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [] },
        { "from": "done", "to": "doing", "rules": [] }
      ]
    },
    {
      "id": "wf_basic", "version": 2, "name": "Basic", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [ { "from": "todo", "to": "done", "rules": [] } ]
    }
  ],
  "priorEvents": [
    { "type": "ticket.created", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "workflowId": "wf_basic", "workflowVersion": 1 } },
    { "type": "ticket.transitioned", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "to": "doing" } }
  ],
  "candidateEvent": {
    "type": "ticket.transitioned",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": { "to": "done" }
  },
  "expected": {
    "refused": true,
    "rule": "stranded-state",
    "reason": "Ticket t1 sits in state \"doing\" of workflow version 1, which no longer exists in version 2 and no state mapping covers it."
  }
}
```

`transition-accepts-across-versions-via-mapping.json` — same shape, but v2 carries the mapping, so the ticket's `doing` resolves to `todo` and `todo`→`done` is legal:

```json
{
  "name": "a ticket from an older version follows the state mapping and moves legally",
  "workflowDefs": [
    {
      "id": "wf_basic", "version": 1, "name": "Basic", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [] },
        { "from": "done", "to": "doing", "rules": [] }
      ]
    },
    {
      "id": "wf_basic", "version": 2, "name": "Basic", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [ { "from": "todo", "to": "done", "rules": [] } ],
      "stateMapping": { "doing": "todo" }
    }
  ],
  "priorEvents": [
    { "type": "ticket.created", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "workflowId": "wf_basic", "workflowVersion": 1 } },
    { "type": "ticket.transitioned", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "to": "doing" } }
  ],
  "candidateEvent": {
    "type": "ticket.transitioned",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": { "to": "done" }
  },
  "expected": { "refused": false }
}
```

- [ ] **Step 3: Run the suite to verify the new fixtures fail**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: FAIL — every `transition-*` refusal fixture reports "expected refusal … got acceptance" (the dispatcher still passes `ticket.transitioned` through).

- [ ] **Step 4: Implement version mapping and the transition path**

Create `packages/rule-engine/src/version-map.ts`:

```ts
import { foldStateIdForward, type FoldedState, type TicketState, type WorkflowDef } from '@gisik-nokma/domain';
import type { EngineContext } from './types.js';

/**
 * The engine's name for domain's FoldedState. It is an alias, not a copy:
 * every consumer (Task 11 here, Plan 3's projection, Plan 10's replica) reads
 * the same `ok` / `stateId` / `unmappedStateId` shape from one declaration.
 */
export type ResolvedState = FoldedState;

/**
 * Walk ONE state id forward from the version whose vocabulary it is written in
 * to the latest version, following each intermediate version's stateMapping.
 *
 * The WALK itself lives in `@gisik-nokma/domain` (`foldStateIdForward`) —
 * three consumers need it and domain is the only package all three depend on.
 * What lives here is the part that cannot: fetching the intermediate
 * definitions through the async, I/O-backed EngineContext. Everything past the
 * fetch is the shared pure function, so the engine cannot drift from the
 * server projection or the offline replica.
 *
 * Two callers in this package need it and they must not each grow their own:
 * resolveCurrentStateId below (a ticket's current state) and
 * require-different-user (each transition-log entry's recorded state, Task
 * 11). A second walk is a second set of rounding errors.
 *
 * Intermediates are fetched before the walk rather than lazily inside it. The
 * outcome is identical — the fold stops at the first version it cannot resolve,
 * with `current` computed from exactly the versions before it — and the only
 * difference is a few extra reads on a store where publishing's mandatory
 * stateMapping has already been violated. Correctness first, and that path is
 * a corrupted or planted store, not a live one.
 */
export async function resolveStateIdForward(
  workflowId: string,
  stateId: string,
  fromVersion: number,
  latest: WorkflowDef,
  ctx: EngineContext,
): Promise<ResolvedState> {
  const intermediates = new Map<number, WorkflowDef>();
  for (let version = fromVersion + 1; version < latest.version; version += 1) {
    const def = await ctx.getWorkflowDef(workflowId, version);
    if (def !== null) intermediates.set(version, def);
  }
  return foldStateIdForward(stateId, fromVersion, latest, (version) => intermediates.get(version) ?? null);
}

/**
 * Resolve a ticket's current state id against the latest workflow version,
 * walking each intermediate version's stateMapping forward. Exported because
 * the transition path and four-eyes both need it; Plan 3's ticket projection
 * and Plan 10's replica reach the same walk through domain's
 * foldStateIdForward directly, because they hold their definitions already and
 * have no EngineContext to fetch through. Publishing refuses unmapped drops,
 * so ok:false only occurs on planted or corrupted stores — and then the honest
 * answer is a refusal, not a guess.
 */
export async function resolveCurrentStateId(
  ticket: TicketState,
  latest: WorkflowDef,
  ctx: EngineContext,
): Promise<ResolvedState> {
  return resolveStateIdForward(ticket.workflowId, ticket.stateId, ticket.workflowVersion, latest, ctx);
}
```

Create `packages/rule-engine/src/transition.ts` (the two `// TASK 7` / `// TASK 8` markers are where those tasks insert their blocks — the file is complete and correct without them until then):

```ts
import { ticketTransitionedPayloadSchema, type EventEnvelope } from '@gisik-nokma/domain';
import { REFUSAL_RULES } from './refusal-rules.js';
import { resolveCurrentStateId } from './version-map.js';
import type { Accept, EngineContext, Refusal } from './types.js';

export async function evaluateTicketTransitioned(
  env: EventEnvelope,
  ctx: EngineContext,
): Promise<Accept | Refusal> {
  if (env.entity.kind !== 'ticket') {
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This ticket.transitioned event does not point at a ticket; it points at a ${env.entity.kind}.`,
    };
  }

  const parsed = ticketTransitionedPayloadSchema.safeParse(env.payload);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.message).join('; ');
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This ticket.transitioned event's payload is malformed: ${detail}`,
    };
  }
  const payload = parsed.data;

  const entity = await ctx.getEntityState('ticket', env.entity.id);
  if (entity === null || entity.kind !== 'ticket') {
    return {
      refused: true,
      rule: REFUSAL_RULES.unknownTicket,
      reason: `This event moves ticket ${env.entity.id}, but no such ticket is known.`,
    };
  }
  const ticket = entity;

  const latest = await ctx.getWorkflowDef(ticket.workflowId);
  if (latest === null) {
    return {
      refused: true,
      rule: REFUSAL_RULES.unknownWorkflow,
      reason: `Ticket ${ticket.id} uses workflow ${ticket.workflowId}, but no published definition of that workflow is known.`,
    };
  }

  const resolved = await resolveCurrentStateId(ticket, latest, ctx);
  if (!resolved.ok) {
    return {
      refused: true,
      rule: REFUSAL_RULES.strandedState,
      reason: `Ticket ${ticket.id} sits in state "${resolved.unmappedStateId}" of workflow version ${ticket.workflowVersion}, which no longer exists in version ${latest.version} and no state mapping covers it.`,
    };
  }

  const toState = latest.states.find((state) => state.id === payload.to);
  if (toState === undefined) {
    return {
      refused: true,
      rule: REFUSAL_RULES.unknownState,
      reason: `The workflow "${latest.name}" has no state "${payload.to}".`,
    };
  }

  const fromName = latest.states.find((state) => state.id === resolved.stateId)?.name ?? resolved.stateId;
  const transition =
    latest.transitions.find((t) => t.from === resolved.stateId && t.to === payload.to) ??
    latest.transitions.find((t) => t.from === '*' && t.to === payload.to);
  if (transition === undefined) {
    return {
      refused: true,
      rule: REFUSAL_RULES.illegalTransition,
      reason: `The workflow "${latest.name}" does not allow moving from "${fromName}" to "${toState.name}".`,
    };
  }

  // TASK 7 inserts the parent-terminal invariant here.

  // TASK 8 replaces this acceptance with the transition-rule evaluation.
  return { refused: false };
}
```

In `packages/rule-engine/src/evaluate.ts`, add the case above `default`:

```ts
    case 'ticket.transitioned':
      return evaluateTicketTransitioned(env, ctx);
```

with the import:

```ts
import { evaluateTicketTransitioned } from './transition.js';
```

In `packages/rule-engine/src/index.ts`, add:

```ts
export { evaluateTicketTransitioned } from './transition.js';
export { resolveCurrentStateId, resolveStateIdForward } from './version-map.js';
export type { ResolvedState } from './version-map.js';
```

- [ ] **Step 5: Run the suite to verify everything passes**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: PASS — all 10 new fixtures, all earlier fixtures, harness tests.

- [ ] **Step 6: Commit**

```bash
git add packages/rule-engine/src/version-map.ts packages/rule-engine/src/transition.ts packages/rule-engine/src/evaluate.ts packages/rule-engine/src/index.ts packages/rule-engine/fixtures/
git commit -m "Transitions are evaluated against authoritative state, and tickets follow state mappings across versions

The payload claims only the target; the current state is the projection's,
so a stale client claim refuses as an illegal move instead of landing
quietly. A ticket last moved under an older version walks each mapping
forward; if no mapping covers it, the engine refuses rather than guesses —
proven by planting the version pair publishing would itself have refused."
```

---

### Task 7: The parent-terminal invariant

Spec invariant 3: parents cannot outrun children. This sits **above** all workflows — it runs before any authored rule and no workflow definition can switch it off. Children come from `ctx.getChildrenStates`; "open" means non-terminal category.

**Files:**
- Modify: `packages/rule-engine/src/transition.ts` (replace the `// TASK 7` marker)
- Create: 3 fixture files (Step 1)

**Interfaces:**
- Consumes: `evaluateTicketTransitioned` internals (Task 6); `TicketState.stateCategory` (Task 2 — denormalized precisely so this check needs no per-child workflow lookup).
- Produces: the `parent-terminal-with-open-children` refusal, active for every terminal-bound transition from now on.

- [ ] **Step 1: Write the failing fixtures**

All three plant "Basic" v1 (the `workflowDefs` array verbatim as in `transition-refuses-malformed-payload.json`).

`invariant-refuses-terminal-parent-with-open-child.json`:

```json
{
  "name": "a parent cannot finish while a child is still open",
  "workflowDefs": [
    {
      "id": "wf_basic", "version": 1, "name": "Basic", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [] },
        { "from": "done", "to": "doing", "rules": [] }
      ]
    }
  ],
  "priorEvents": [
    { "type": "ticket.created", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "workflowId": "wf_basic" } },
    { "type": "ticket.transitioned", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "to": "doing" } },
    { "type": "ticket.created", "entity": { "kind": "ticket", "id": "t2" }, "actorId": "user_a", "payload": { "workflowId": "wf_basic", "parentId": "t1" } }
  ],
  "candidateEvent": {
    "type": "ticket.transitioned",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": { "to": "done" }
  },
  "expected": {
    "refused": true,
    "rule": "parent-terminal-with-open-children",
    "reason": "This ticket cannot enter \"Done\" while 1 of its child tickets is still open."
  }
}
```

`invariant-refuses-terminal-parent-with-active-child.json` — `"name"`: `"a parent cannot finish while a child is active"`; identical except the child also moves to `doing` first (append to `priorEvents`):

```json
    { "type": "ticket.transitioned", "entity": { "kind": "ticket", "id": "t2" }, "actorId": "user_a", "payload": { "to": "doing" } }
```

Expected (verbatim — "open" means any non-terminal category, active included):

```json
  "expected": {
    "refused": true,
    "rule": "parent-terminal-with-open-children",
    "reason": "This ticket cannot enter \"Done\" while 1 of its child tickets is still open."
  }
```

`invariant-accepts-terminal-parent-when-children-are-terminal.json` — `"name"`: `"a parent may finish once every child is terminal"`; identical to the active-child fixture plus one more prior event finishing the child:

```json
    { "type": "ticket.transitioned", "entity": { "kind": "ticket", "id": "t2" }, "actorId": "user_a", "payload": { "to": "done" } }
```

Expected: `{ "refused": false }`.

- [ ] **Step 2: Run the suite to verify the two refusal fixtures fail**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: FAIL — both `invariant-refuses-*` fixtures report "expected refusal … got acceptance".

- [ ] **Step 3: Implement the invariant**

In `packages/rule-engine/src/transition.ts`, replace the line `// TASK 7 inserts the parent-terminal invariant here.` with:

```ts
  // Invariant above all workflows (spec invariant 3): parents cannot outrun
  // children. Runs before any authored rule; no definition can switch it off.
  if (toState.category === 'terminal') {
    const children = await ctx.getChildrenStates(ticket.id);
    const openCount = children.filter((child) => child.stateCategory !== 'terminal').length;
    if (openCount > 0) {
      return {
        refused: true,
        rule: REFUSAL_RULES.parentTerminal,
        reason: `This ticket cannot enter "${toState.name}" while ${openCount} of its child tickets ${openCount === 1 ? 'is' : 'are'} still open.`,
      };
    }
  }
```

- [ ] **Step 4: Run the suite to verify everything passes**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rule-engine/src/transition.ts packages/rule-engine/fixtures/
git commit -m "Parents cannot outrun children, and no workflow author can say otherwise

The terminal-transition refusal runs before any authored rule and reads the
denormalized child categories, so it costs one children lookup. Open means
non-terminal: an active child blocks exactly like an untouched one, and the
accepting twin proves the door opens once every child is truly finished."
```

---

### Task 8: Rule plumbing and `require-comment`

Transition rules run **in definition order; the first refusal wins** (spec §4). This task builds the evaluator plumbing — an exhaustive switch over the closed vocabulary, so adding a sixth kind without an evaluator is a compile error — and lands the first rule. The other four kinds throw `not implemented yet` until their tasks replace the throw with the real call; the final task greps to prove none survived.

**Files:**
- Create: `packages/rule-engine/src/rules/types.ts`
- Create: `packages/rule-engine/src/rules/index.ts`
- Create: `packages/rule-engine/src/rules/require-comment.ts`
- Modify: `packages/rule-engine/src/transition.ts` (replace the `// TASK 8` marker)
- Modify: `packages/rule-engine/src/index.ts` (export)
- Create: 3 fixture files (Step 1)

**Interfaces:**
- Consumes: `Rule`, `TicketState`, `TicketTransitionedPayload`, `WorkflowDef`, `WorkflowState`, `EventEnvelope` from `@gisik-nokma/domain`; `evaluateTicketTransitioned` (Task 6); `REFUSAL_RULES` (Task 5).
- Produces: `TransitionRuleInput = { env, ctx, ticket, def, toState, fromStateId, payload }`, `RuleEvaluator<R extends Rule>`, `evaluateTransitionRules(rules: Rule[], input: TransitionRuleInput): Promise<Accept | Refusal>` — Tasks 9–11 plug their evaluators into its switch; later client plans call it for instant local feedback.

- [ ] **Step 1: Write the failing fixtures**

All rule fixtures use a "Guarded" workflow — "Basic" with rules on the `doing`→`done` edge — and the same two prior events putting `t1` in `doing`.

`rule-require-comment-refuses-a-bare-move.json`:

```json
{
  "name": "a move guarded by require-comment refuses without a comment",
  "workflowDefs": [
    {
      "id": "wf_rules", "version": 1, "name": "Guarded", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "todo", "to": "doing", "rules": [] },
        { "from": "doing", "to": "done", "rules": [ { "kind": "require-comment" } ] },
        { "from": "done", "to": "doing", "rules": [] }
      ]
    }
  ],
  "priorEvents": [
    { "type": "ticket.created", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "workflowId": "wf_rules" } },
    { "type": "ticket.transitioned", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "to": "doing" } }
  ],
  "candidateEvent": {
    "type": "ticket.transitioned",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": { "to": "done" }
  },
  "expected": {
    "refused": true,
    "rule": "require-comment",
    "reason": "This move must carry a comment explaining it, and none was provided."
  }
}
```

`rule-require-comment-refuses-a-blank-comment.json` — `"name"`: `"a whitespace-only comment does not satisfy require-comment"`; identical except the candidate payload is `{ "to": "done", "comment": { "text": "   " } }`. Expected (verbatim — whitespace is not an explanation):

```json
  "expected": {
    "refused": true,
    "rule": "require-comment",
    "reason": "This move must carry a comment explaining it, and none was provided."
  }
```

`rule-require-comment-accepts-a-commented-move.json` — `"name"`: `"a real comment satisfies require-comment"`; identical except the candidate payload is `{ "to": "done", "comment": { "text": "Shipped and verified." } }`. Expected: `{ "refused": false }`.

- [ ] **Step 2: Run the suite to verify the two refusal fixtures fail**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: FAIL — both `rule-require-comment-refuses-*` fixtures report "expected refusal … got acceptance".

- [ ] **Step 3: Implement the plumbing and the rule**

Create `packages/rule-engine/src/rules/types.ts`:

```ts
import type {
  EventEnvelope,
  Rule,
  TicketState,
  TicketTransitionedPayload,
  WorkflowDef,
  WorkflowState,
} from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../types.js';

/** Everything a transition rule may read. fromStateId is the resolved (post version-mapping) current state. */
export type TransitionRuleInput = {
  env: EventEnvelope;
  ctx: EngineContext;
  ticket: TicketState;
  def: WorkflowDef;
  toState: WorkflowState;
  fromStateId: string;
  payload: TicketTransitionedPayload;
};

export type RuleEvaluator<R extends Rule = Rule> = (
  rule: R,
  input: TransitionRuleInput,
) => Promise<Accept | Refusal>;
```

Create `packages/rule-engine/src/rules/require-comment.ts`:

```ts
import type { Rule } from '@gisik-nokma/domain';
import { REFUSAL_RULES } from '../refusal-rules.js';
import type { RuleEvaluator } from './types.js';

export const evaluateRequireComment: RuleEvaluator<Extract<Rule, { kind: 'require-comment' }>> = async (
  _rule,
  input,
) => {
  const text = input.payload.comment?.text ?? '';
  if (text.trim().length > 0) return { refused: false };
  return {
    refused: true,
    rule: REFUSAL_RULES.requireComment,
    reason: 'This move must carry a comment explaining it, and none was provided.',
  };
};
```

Create `packages/rule-engine/src/rules/index.ts`:

```ts
import type { Rule } from '@gisik-nokma/domain';
import { evaluateRequireComment } from './require-comment.js';
import type { Accept, Refusal } from '../types.js';
import type { TransitionRuleInput } from './types.js';

/**
 * Run a transition's rules in definition order; the first refusal wins.
 * The switch is exhaustive over the closed vocabulary — a sixth kind without
 * an evaluator is a compile error, not a silently unenforced rule.
 */
export async function evaluateTransitionRules(
  rules: Rule[],
  input: TransitionRuleInput,
): Promise<Accept | Refusal> {
  for (const rule of rules) {
    const result = await evaluateOneRule(rule, input);
    if (result.refused) return result;
  }
  return { refused: false };
}

async function evaluateOneRule(rule: Rule, input: TransitionRuleInput): Promise<Accept | Refusal> {
  switch (rule.kind) {
    case 'require-comment':
      return evaluateRequireComment(rule, input);
    case 'restrict-to':
      throw new Error('rule kind "restrict-to" is not implemented yet');
    case 'require-evidence':
      throw new Error('rule kind "require-evidence" is not implemented yet');
    case 'require-field':
      throw new Error('rule kind "require-field" is not implemented yet');
    case 'require-different-user':
      throw new Error('rule kind "require-different-user" is not implemented yet');
  }
}
```

In `packages/rule-engine/src/transition.ts`, add the import:

```ts
import { evaluateTransitionRules } from './rules/index.js';
```

and replace the two lines

```ts
  // TASK 8 replaces this acceptance with the transition-rule evaluation.
  return { refused: false };
```

with:

```ts
  return evaluateTransitionRules(transition.rules, {
    env,
    ctx,
    ticket,
    def: latest,
    toState,
    fromStateId: resolved.stateId,
    payload,
  });
```

In `packages/rule-engine/src/index.ts`, add:

```ts
export { evaluateTransitionRules } from './rules/index.js';
export type { RuleEvaluator, TransitionRuleInput } from './rules/types.js';
```

- [ ] **Step 4: Run the suite to verify everything passes**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rule-engine/src/rules/ packages/rule-engine/src/transition.ts packages/rule-engine/src/index.ts packages/rule-engine/fixtures/
git commit -m "Transition rules run in authored order and the first refusal wins; require-comment lands first

The evaluator switch is exhaustive over the closed vocabulary, so a new rule
kind without an evaluator refuses to compile instead of silently passing.
A whitespace comment is not an explanation and refuses like an absent one."
```

---

### Task 9: `require-evidence`, `require-field`, and the ordering proof

Two more rules, plus the two fixtures that prove ordering is real: the same pair of violated rules in both orders must produce different first refusals.

**Files:**
- Create: `packages/rule-engine/src/rules/require-evidence.ts`
- Create: `packages/rule-engine/src/rules/require-field.ts`
- Modify: `packages/rule-engine/src/rules/index.ts` (replace the two throws)
- Create: 6 fixture files (Step 1)

**Interfaces:**
- Consumes: `RuleEvaluator`, `TransitionRuleInput` (Task 8); `REFUSAL_RULES` (Task 5).
- Produces: `evaluateRequireEvidence`, `evaluateRequireField` wired into `evaluateTransitionRules`. `require-evidence` is satisfied by a non-blank `payload.evidenceAttachmentId` (spec §2: an attachment on a transition carrying the rule serves as its evidence; Plan 3's attachment events give the id real backing). `require-field` reads the **ticket's** fields — the field must be set before the move (spec §4), not smuggled in with it.

- [ ] **Step 1: Write the failing fixtures**

Each reuses the exact structure of `rule-require-comment-refuses-a-bare-move.json` — same `workflowDefs` def (id `wf_rules`, name "Guarded"), same two `priorEvents`, same candidate — changing **only** the `rules` array on the `doing`→`done` transition, the candidate payload where stated, and `name`/`expected`:

`rule-require-evidence-refuses-without-attachment.json` — `"name"`: `"a move guarded by require-evidence refuses without an attachment"`; rules: `[ { "kind": "require-evidence" } ]`; candidate payload `{ "to": "done" }`; expected:

```json
  "expected": {
    "refused": true,
    "rule": "require-evidence",
    "reason": "This move must carry an attachment as evidence, and none was provided."
  }
```

`rule-require-evidence-accepts-with-attachment.json` — `"name"`: `"an attachment on the move satisfies require-evidence"`; same rules; candidate payload `{ "to": "done", "evidenceAttachmentId": "att_1" }`; expected `{ "refused": false }`.

`rule-require-field-refuses-unset-field.json` — `"name"`: `"a move guarded by require-field refuses while the field is unset"`; rules: `[ { "kind": "require-field", "field": "due_date" } ]`; candidate payload `{ "to": "done" }`; expected:

```json
  "expected": {
    "refused": true,
    "rule": "require-field",
    "reason": "This move needs the field \"due_date\" to be set first, and it is not."
  }
```

`rule-require-field-accepts-set-field.json` — `"name"`: `"a field set before the move satisfies require-field"`; same rules; `priorEvents` gains a third event after the move to `doing`:

```json
    { "type": "ticket.field_set", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "field": "due_date", "value": "2026-09-01" } }
```

candidate payload `{ "to": "done" }`; expected `{ "refused": false }`.

`rules-first-refusal-wins.json` — `"name"`: `"two violated rules refuse with the first one authored"`; rules: `[ { "kind": "require-comment" }, { "kind": "require-evidence" } ]`; candidate payload `{ "to": "done" }` (violates both); expected:

```json
  "expected": {
    "refused": true,
    "rule": "require-comment",
    "reason": "This move must carry a comment explaining it, and none was provided."
  }
```

`rules-order-comes-from-the-definition.json` — `"name"`: `"flipping the authored order flips which refusal fires"`; rules: `[ { "kind": "require-evidence" }, { "kind": "require-comment" } ]`; candidate payload `{ "to": "done" }` (violates both); expected:

```json
  "expected": {
    "refused": true,
    "rule": "require-evidence",
    "reason": "This move must carry an attachment as evidence, and none was provided."
  }
```

- [ ] **Step 2: Run the suite to verify the new refusal fixtures fail**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: FAIL — the two `rule-require-evidence-*` fixtures and `rules-order-comes-from-the-definition` error with `rule kind "require-evidence" is not implemented yet`; the two `rule-require-field-*` fixtures error with `rule kind "require-field" is not implemented yet` (loud throws, never a quiet pass). Note: `rules-first-refusal-wins` **already passes** at this red step — require-comment is implemented and refuses first, so the loop never reaches the unimplemented rule. That early pass is itself first-refusal-wins working; do not "fix" it.

- [ ] **Step 3: Implement the two rules**

Create `packages/rule-engine/src/rules/require-evidence.ts`:

```ts
import type { Rule } from '@gisik-nokma/domain';
import { REFUSAL_RULES } from '../refusal-rules.js';
import type { RuleEvaluator } from './types.js';

export const evaluateRequireEvidence: RuleEvaluator<Extract<Rule, { kind: 'require-evidence' }>> = async (
  _rule,
  input,
) => {
  const attachmentId = input.payload.evidenceAttachmentId ?? '';
  if (attachmentId.trim().length > 0) return { refused: false };
  return {
    refused: true,
    rule: REFUSAL_RULES.requireEvidence,
    reason: 'This move must carry an attachment as evidence, and none was provided.',
  };
};
```

Create `packages/rule-engine/src/rules/require-field.ts`:

```ts
import type { Rule } from '@gisik-nokma/domain';
import { REFUSAL_RULES } from '../refusal-rules.js';
import type { RuleEvaluator } from './types.js';

export const evaluateRequireField: RuleEvaluator<Extract<Rule, { kind: 'require-field' }>> = async (
  rule,
  input,
) => {
  const value = input.ticket.fields[rule.field]?.value;
  const isSet =
    value !== undefined && value !== null && !(typeof value === 'string' && value.trim().length === 0);
  if (isSet) return { refused: false };
  return {
    refused: true,
    rule: REFUSAL_RULES.requireField,
    reason: `This move needs the field "${rule.field}" to be set first, and it is not.`,
  };
};
```

In `packages/rule-engine/src/rules/index.ts`, add the imports:

```ts
import { evaluateRequireEvidence } from './require-evidence.js';
import { evaluateRequireField } from './require-field.js';
```

and replace

```ts
    case 'require-evidence':
      throw new Error('rule kind "require-evidence" is not implemented yet');
    case 'require-field':
      throw new Error('rule kind "require-field" is not implemented yet');
```

with:

```ts
    case 'require-evidence':
      return evaluateRequireEvidence(rule, input);
    case 'require-field':
      return evaluateRequireField(rule, input);
```

- [ ] **Step 4: Run the suite to verify everything passes**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: PASS — including both ordering fixtures: same violated pair, opposite orders, different first refusals.

- [ ] **Step 5: Commit**

```bash
git add packages/rule-engine/src/rules/require-evidence.ts packages/rule-engine/src/rules/require-field.ts packages/rule-engine/src/rules/index.ts packages/rule-engine/fixtures/
git commit -m "Evidence and required fields refuse honestly, and rule order is proven, not assumed

require-evidence wants an attachment on the move itself; require-field wants
the field set before the move, not smuggled in with it. The ordering pair —
identical violations, opposite authored orders, different first refusals —
proves the engine reads order from the definition."
```

---

### Task 10: `restrict-to`

Who may make the move: the assignee, holders of named roles, or named people — OR-combined, so satisfying any one criterion is enough. Roles resolve through the actor's workspace membership (`getEntityState('membership', membershipId(workspaceId, actorId))`). The refusal names everyone who *would* have been allowed.

**Files:**
- Create: `packages/rule-engine/src/rules/restrict-to.ts`
- Modify: `packages/rule-engine/src/rules/index.ts` (replace the throw)
- Create: 10 fixture files (Step 1)

**Interfaces:**
- Consumes: `membershipId`, `MembershipState` (via kind narrowing) from `@gisik-nokma/domain`; `RuleEvaluator`, `TransitionRuleInput` (Task 8).
- Produces: `evaluateRestrictTo` wired into `evaluateTransitionRules`.

- [ ] **Step 1: Write the failing fixtures**

Each reuses the exact structure of `rule-require-comment-refuses-a-bare-move.json` (same `wf_rules` "Guarded" def, same two `priorEvents`, candidate payload `{ "to": "done" }`), changing only what is stated: the `rules` array on `doing`→`done`, the `ticket.created` payload's `assigneeId` where stated, `memberships`, the candidate's `actorId`, and `name`/`expected`.

`rule-restrict-to-refuses-non-assignee.json` — `"name"`: `"only the assignee may move, and someone else tried"`; rules: `[ { "kind": "restrict-to", "assignee": true } ]`; `ticket.created` payload: `{ "workflowId": "wf_rules", "assigneeId": "user_b" }`; candidate `actorId` `"user_a"`; expected:

```json
  "expected": {
    "refused": true,
    "rule": "restrict-to",
    "reason": "Only the ticket's assignee may make this move, and user_a is not among them."
  }
```

`rule-restrict-to-accepts-the-assignee.json` — `"name"`: `"the assignee may make the restricted move"`; same, candidate `actorId` `"user_b"`; expected `{ "refused": false }`.

`rule-restrict-to-refuses-missing-role.json` — `"name"`: `"a role restriction refuses an actor without the role"`; rules: `[ { "kind": "restrict-to", "roles": ["admin"] } ]`; memberships: `[ { "userId": "user_a", "role": "member" } ]`; candidate `actorId` `"user_a"`; expected:

```json
  "expected": {
    "refused": true,
    "rule": "restrict-to",
    "reason": "Only anyone with the role admin may make this move, and user_a is not among them."
  }
```

`rule-restrict-to-accepts-the-role.json` — `"name"`: `"a role restriction admits a holder of the role"`; same, memberships: `[ { "userId": "user_a", "role": "admin" } ]`; expected `{ "refused": false }`.

`rule-restrict-to-refuses-without-membership.json` — `"name"`: `"a role restriction refuses an actor with no membership at all"`; same rules, memberships `[]` (no membership found means no role held); expected (verbatim):

```json
  "expected": {
    "refused": true,
    "rule": "restrict-to",
    "reason": "Only anyone with the role admin may make this move, and user_a is not among them."
  }
```

`rule-restrict-to-refuses-unlisted-user.json` — `"name"`: `"a named-people restriction refuses an unlisted actor"`; rules: `[ { "kind": "restrict-to", "userIds": ["user_b", "user_c"] } ]`; candidate `actorId` `"user_a"`; expected:

```json
  "expected": {
    "refused": true,
    "rule": "restrict-to",
    "reason": "Only the named people user_b, user_c may make this move, and user_a is not among them."
  }
```

`rule-restrict-to-accepts-a-listed-user.json` — `"name"`: `"a named-people restriction admits a listed actor"`; same, candidate `actorId` `"user_b"`; expected `{ "refused": false }`.

`rule-restrict-to-accepts-any-one-criterion.json` — `"name"`: `"criteria OR-combine: an admin who is not the assignee may still move"`; rules: `[ { "kind": "restrict-to", "assignee": true, "roles": ["admin"] } ]`; `ticket.created` payload assigneeId `"user_b"`; memberships: `[ { "userId": "user_a", "role": "admin" } ]`; candidate `actorId` `"user_a"` (not the assignee, but an admin — OR semantics); expected `{ "refused": false }`.

`rule-restrict-to-refuses-when-no-criterion-matches.json` — `"name"`: `"when no criterion matches, the refusal names everyone who was allowed"`; same rules and assigneeId; memberships: `[ { "userId": "user_a", "role": "member" } ]`; candidate `actorId` `"user_a"`; expected:

```json
  "expected": {
    "refused": true,
    "rule": "restrict-to",
    "reason": "Only the ticket's assignee, or anyone with the role admin may make this move, and user_a is not among them."
  }
```

`rule-restrict-to-refuses-when-planted-empty.json` — `"name"`: `"a planted empty restriction refuses everyone honestly"`; rules: `[ { "kind": "restrict-to" } ]` (publishing refuses this def — `empty-restrict-to` — so it is planted directly in `workflowDefs`, bypassing publish: the defensive runtime path must also be proven); candidate `actorId` `"user_a"`; expected:

```json
  "expected": {
    "refused": true,
    "rule": "restrict-to",
    "reason": "This move is guarded by a restrict-to rule that names nobody, so nobody may make it."
  }
```

- [ ] **Step 2: Run the suite to verify the new fixtures fail**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: FAIL — every restrict-to fixture errors with `rule kind "restrict-to" is not implemented yet`.

- [ ] **Step 3: Implement the rule**

Create `packages/rule-engine/src/rules/restrict-to.ts`:

```ts
import { membershipId, type Rule } from '@gisik-nokma/domain';
import { REFUSAL_RULES } from '../refusal-rules.js';
import type { RuleEvaluator } from './types.js';

/**
 * Criteria are OR-combined: satisfying any one is enough. The refusal names
 * everyone who would have been allowed. A rule that names nobody cannot be
 * published (empty-restrict-to), but a planted or legacy definition still
 * gets an honest refusal rather than a crash or a silent pass.
 */
export const evaluateRestrictTo: RuleEvaluator<Extract<Rule, { kind: 'restrict-to' }>> = async (
  rule,
  input,
) => {
  const { env, ctx, ticket } = input;
  const allowed: string[] = [];

  if (rule.assignee === true) {
    allowed.push("the ticket's assignee");
    if (ticket.assigneeId !== null && ticket.assigneeId === env.actorId) return { refused: false };
  }

  if (rule.roles !== undefined && rule.roles.length > 0) {
    allowed.push(`anyone with the role ${rule.roles.join(' or ')}`);
    const membership = await ctx.getEntityState('membership', membershipId(env.workspaceId, env.actorId));
    if (membership !== null && membership.kind === 'membership' && rule.roles.includes(membership.role)) {
      return { refused: false };
    }
  }

  if (rule.userIds !== undefined && rule.userIds.length > 0) {
    allowed.push(`the named people ${rule.userIds.join(', ')}`);
    if (rule.userIds.includes(env.actorId)) return { refused: false };
  }

  if (allowed.length === 0) {
    return {
      refused: true,
      rule: REFUSAL_RULES.restrictTo,
      reason: 'This move is guarded by a restrict-to rule that names nobody, so nobody may make it.',
    };
  }

  return {
    refused: true,
    rule: REFUSAL_RULES.restrictTo,
    reason: `Only ${allowed.join(', or ')} may make this move, and ${env.actorId} is not among them.`,
  };
};
```

In `packages/rule-engine/src/rules/index.ts`, add the import:

```ts
import { evaluateRestrictTo } from './restrict-to.js';
```

and replace

```ts
    case 'restrict-to':
      throw new Error('rule kind "restrict-to" is not implemented yet');
```

with:

```ts
    case 'restrict-to':
      return evaluateRestrictTo(rule, input);
```

- [ ] **Step 4: Run the suite to verify everything passes**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rule-engine/src/rules/restrict-to.ts packages/rule-engine/src/rules/index.ts packages/rule-engine/fixtures/
git commit -m "restrict-to: who may move is authored, checked against membership, and refused by name

Criteria OR-combine — assignee, role holders, named people — and the
refusal lists everyone who would have been allowed. Roles resolve through
the workspace:user membership convention. A planted empty restriction
refuses everyone honestly instead of crashing or waving the move through."
```

---

### Task 11: `require-different-user`

Four-eyes: the actor must differ from whoever **last** performed the named earlier transition — the approval pairs with the submission it approves, so only the latest performer counts. If nobody ever performed the named transition, the rule accepts vacuously (creation is not a transition).

**Vacuous acceptance is now bounded on both sides** (Open question 10, settled). A rule watching a state *nothing enters* can no longer be published at all — `validateWorkflowDef` refuses it as `rdu-unenterable-state` (Task 3). A rule whose guarded move is reachable without entering the watched state still accepts vacuously on that path, and the builder warns about it as `rdu-bypassable`; the workflow is structurally sound, so the engine publishes it and this task's fixtures record the semantics honestly rather than pretending otherwise.

**And versioning may not disarm it.** Each transition-log entry carries the workflow version its `toStateId` is written in (Task 2). The evaluator resolves each candidate entry **forward** through the same `stateMapping` chain the ticket's own state walks, and compares the *result* to `rule.thanActorOf.to`. Without that, a version that dropped and remapped the watched state left every historical entry unmatchable: the rule found no prior performer, one person made both moves, and four-eyes was disarmed by a rename on a workflow the advisory correctly calls clean. This is the counterexample the advisory does **not** cover — it characterises vacuous acceptance within a single version only.

**And neither may a migration.** A ticket pins the workflow it was created under; an explicit `ticket.workflow_rebound` (Plan 3) moves it to a different workflow, and `stateMapping` cannot help there — it is keyed inside one workflow's version chain, and across two graphs there is no chain. So the evaluator considers **only entries whose `workflowId` is the ticket's current one**, and filters before it walks. Walking a foreign entry through this workflow's versions produces one of two wrong answers: no match (the rule finds nobody, and the same person makes both moves — the hole reopened through a different door), or a match on a state id that two unrelated workflows merely happen to spell the same way, which refuses a person who has done nothing. Only the second is observable — an entry the walk *cannot* resolve is skipped either way — so the sixth fixture below plants exactly that one: the same-id collision, which is also the case a reader is least likely to see coming.

**Files:**
- Create: `packages/rule-engine/src/rules/require-different-user.ts`
- Modify: `packages/rule-engine/src/rules/index.ts` (replace the last throw)
- Create: 6 fixture files (Step 1)

**Interfaces:**
- Consumes: `TicketState.transitions` (the append-only log with its per-entry `workflowId` and `workflowVersion`, Task 2); `resolveStateIdForward` from `./version-map.js` (Task 6 — reused, never re-implemented, and itself delegating to domain's `foldStateIdForward`); `RuleEvaluator`, `TransitionRuleInput` (Task 8; `input.def` is the latest definition and `input.ctx` fetches the intermediates).
- Produces: `evaluateRequireDifferentUser` wired into `evaluateTransitionRules` — completing the vocabulary; after this task no `not implemented yet` throw remains.

- [ ] **Step 1: Write the failing fixtures**

Three use a "Review" workflow; a fourth uses the bypassable "Fast track" definition, the fifth a two-version pair and the sixth a migration between two workflows. Base fixture, `rule-rdu-refuses-the-same-person.json`:

```json
{
  "name": "four-eyes: the submitter cannot approve their own submission",
  "workflowDefs": [
    {
      "id": "wf_review", "version": 1, "name": "Review", "initialStateId": "draft",
      "states": [
        { "id": "draft", "name": "Draft", "category": "open" },
        { "id": "review", "name": "In review", "category": "active" },
        { "id": "approved", "name": "Approved", "category": "terminal" }
      ],
      "transitions": [
        { "from": "draft", "to": "review", "rules": [] },
        { "from": "review", "to": "draft", "rules": [] },
        { "from": "review", "to": "approved", "rules": [ { "kind": "require-different-user", "thanActorOf": { "to": "review" } } ] }
      ]
    }
  ],
  "priorEvents": [
    { "type": "ticket.created", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "workflowId": "wf_review" } },
    { "type": "ticket.transitioned", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "to": "review" } }
  ],
  "candidateEvent": {
    "type": "ticket.transitioned",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": { "to": "approved" }
  },
  "expected": {
    "refused": true,
    "rule": "require-different-user",
    "reason": "This step needs a second person: user_a already performed the move to \"review\" on this ticket."
  }
}
```

`rule-rdu-accepts-a-second-person.json` — `"name"`: `"four-eyes: a second person may approve"`; identical except the candidate `actorId` is `"user_b"`; expected `{ "refused": false }`.

`rule-rdu-accepts-vacuously-on-a-bypassable-workflow.json` — this replaces an earlier fixture that asserted vacuous acceptance with nobody having performed the earlier move. **Why that one could not survive as written:** it planted a ticket directly in review with an empty transitions log, because in a sound single-version workflow reaching the guarded move *requires* having entered the watched state — the vacuous path is unreachable through any legal event sequence, and the old fixture had to stage a state the ledger cannot produce. This plan's fixture format restricts `priorEvents` to events a real server can ingest (Task 4), so a fixture that needs a harness override to exist is proving something the server can never reproduce.

Rebuilt on a definition that is genuinely bypassable — a fast-track `Draft → Approved` edge carrying the same four-eyes rule — the vacuous path is reachable by ordinary events, and no override is needed. **This is exactly the shape `adviseWorkflowDef` warns about with `rdu-bypassable`** (Task 3): the builder tells the author "on that path one person can make it alone", and this fixture is the behaviour the warning is warning about. Note the def is the same one Task 5's `workflow-defined-accepts-a-def-the-advisory-warns-about.json` publishes — advisories do not gate publish, so this workflow really can exist.

```json
{
  "name": "four-eyes accepts vacuously on a workflow whose guarded move can be reached without the watched one",
  "workflowDefs": [
    {
      "id": "wf_fast", "version": 1, "name": "Fast track", "initialStateId": "draft",
      "states": [
        { "id": "draft", "name": "Draft", "category": "open" },
        { "id": "review", "name": "In review", "category": "active" },
        { "id": "approved", "name": "Approved", "category": "terminal" }
      ],
      "transitions": [
        { "from": "draft", "to": "review", "rules": [] },
        { "from": "review", "to": "draft", "rules": [] },
        { "from": "review", "to": "approved", "rules": [ { "kind": "require-different-user", "thanActorOf": { "to": "review" } } ] },
        { "from": "draft", "to": "approved", "rules": [ { "kind": "require-different-user", "thanActorOf": { "to": "review" } } ] }
      ]
    }
  ],
  "priorEvents": [
    { "type": "ticket.created", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "workflowId": "wf_fast" } }
  ],
  "candidateEvent": {
    "type": "ticket.transitioned",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": { "to": "approved" }
  },
  "expected": { "refused": false }
}
```

`rule-rdu-counts-only-the-latest-performer.json` — `"name"`: `"four-eyes counts only the latest performer of the earlier move"`; the base fixture's `workflowDefs` (the "Review" workflow, not the fast-track one above); the ticket bounces: user_a submits, pulls back, then user_b submits; user_a may now approve because the standing submission is user_b's:

```json
  "priorEvents": [
    { "type": "ticket.created", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "workflowId": "wf_review" } },
    { "type": "ticket.transitioned", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "to": "review" } },
    { "type": "ticket.transitioned", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "to": "draft" } },
    { "type": "ticket.transitioned", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_b", "payload": { "to": "review" } }
  ],
```

candidate: `actorId` `"user_a"`, payload `{ "to": "approved" }`; expected `{ "refused": false }`.

`rule-rdu-refuses-across-a-remap.json` — the fifth fixture, and the one that proves versioning cannot disarm four-eyes. Version 1 has `review`; version 2 drops it and maps it to `checking`. A ticket entered `review` under v1, so its log entry reads `"review"` with `workflowVersion: 1`, while the rule in v2 watches `checking`. Comparing the raw entry to the rule's target finds nothing and accepts — one person makes both moves. Resolving the entry forward through the mapping finds `checking`, matches, and refuses. **Before this change this fixture was vacuously accepted; it must now refuse.**

```json
{
  "name": "four-eyes survives a state being dropped and remapped in a later version",
  "workflowDefs": [
    {
      "id": "wf_review", "version": 1, "name": "Review", "initialStateId": "draft",
      "states": [
        { "id": "draft", "name": "Draft", "category": "open" },
        { "id": "review", "name": "In review", "category": "active" },
        { "id": "approved", "name": "Approved", "category": "terminal" }
      ],
      "transitions": [
        { "from": "draft", "to": "review", "rules": [] },
        { "from": "review", "to": "draft", "rules": [] },
        { "from": "review", "to": "approved", "rules": [ { "kind": "require-different-user", "thanActorOf": { "to": "review" } } ] }
      ]
    },
    {
      "id": "wf_review", "version": 2, "name": "Review", "initialStateId": "draft",
      "stateMapping": { "review": "checking" },
      "states": [
        { "id": "draft", "name": "Draft", "category": "open" },
        { "id": "checking", "name": "Being checked", "category": "active" },
        { "id": "approved", "name": "Approved", "category": "terminal" }
      ],
      "transitions": [
        { "from": "draft", "to": "checking", "rules": [] },
        { "from": "checking", "to": "draft", "rules": [] },
        { "from": "checking", "to": "approved", "rules": [ { "kind": "require-different-user", "thanActorOf": { "to": "checking" } } ] }
      ]
    }
  ],
  "priorEvents": [
    { "type": "ticket.created", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "workflowId": "wf_review", "workflowVersion": 1 } },
    { "type": "ticket.transitioned", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "to": "review" } }
  ],
  "candidateEvent": {
    "type": "ticket.transitioned",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": { "to": "approved" }
  },
  "expected": {
    "refused": true,
    "rule": "require-different-user",
    "reason": "This step needs a second person: user_a already performed the move to \"checking\" on this ticket."
  }
}
```

The reason names `checking`, not `review`: the rule's own `thanActorOf.to` is the vocabulary the user is reading in the current definition, and naming the retired id would be accurate about the past and useless in the present.

`rule-rdu-ignores-an-entry-from-a-workflow-the-ticket-has-left.json` — the sixth fixture, and the one that proves a **migration** cannot make the rule answer for a workflow the ticket no longer uses. Two unrelated workflows both happen to spell a state `review`: `wf_intake`'s means "waiting on the requester", `wf_review`'s means "submitted for approval". A ticket is created under `wf_intake`, user_a moves it to `wf_intake`'s `review`, and an admin then migrates it to `wf_review` with `ticket.workflow_rebound`, landing it in `wf_review`'s `review`. Nobody has performed `wf_review`'s move to `review` — the ticket arrived there by migration, which is an attributed claim of its own and not a transition — so four-eyes has nobody to differ from and accepts. **Without the `workflowId` filter the leftover `wf_intake` entry matches on the shared spelling and refuses user_a for a move they never made**, so this fixture must accept and does not before the change.

```json
{
  "name": "four-eyes ignores a log entry recorded under a workflow the ticket has since been migrated off",
  "workflowDefs": [
    {
      "id": "wf_intake", "version": 1, "name": "Intake", "initialStateId": "new",
      "states": [
        { "id": "new", "name": "New", "category": "open" },
        { "id": "review", "name": "With the requester", "category": "active" }
      ],
      "transitions": [
        { "from": "new", "to": "review", "rules": [] },
        { "from": "review", "to": "new", "rules": [] }
      ]
    },
    {
      "id": "wf_review", "version": 1, "name": "Review", "initialStateId": "draft",
      "states": [
        { "id": "draft", "name": "Draft", "category": "open" },
        { "id": "review", "name": "In review", "category": "active" },
        { "id": "approved", "name": "Approved", "category": "terminal" }
      ],
      "transitions": [
        { "from": "draft", "to": "review", "rules": [] },
        { "from": "review", "to": "draft", "rules": [] },
        { "from": "review", "to": "approved", "rules": [ { "kind": "require-different-user", "thanActorOf": { "to": "review" } } ] }
      ]
    }
  ],
  "priorEvents": [
    { "type": "ticket.created", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "workflowId": "wf_intake" } },
    { "type": "ticket.transitioned", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_a", "payload": { "to": "review" } },
    { "type": "ticket.workflow_rebound", "entity": { "kind": "ticket", "id": "t1" }, "actorId": "user_admin", "payload": { "toWorkflowId": "wf_review", "toStateId": "review" } }
  ],
  "candidateEvent": {
    "type": "ticket.transitioned",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": { "to": "approved" }
  },
  "expected": { "refused": false }
}
```

Note what the fixture does **not** assert: that four-eyes is satisfied. It is vacuous here, and honestly so — the migration is the event that put the ticket in `review`, and it is attributed to `user_admin` in the ledger for anyone reading the history. Making a migration count as a performance of the target transition was considered and declined: a `ticket.workflow_rebound` is authored in bulk against a whole type (coordination doc, 2026-08-26), so counting it would let one admin's housekeeping stand in as the first pair of eyes on every ticket it touched.

- [ ] **Step 2: Run the suite to verify the fixtures fail**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: FAIL — all six error with `rule kind "require-different-user" is not implemented yet`.

- [ ] **Step 3: Implement the rule**

Create `packages/rule-engine/src/rules/require-different-user.ts`:

```ts
import type { Rule } from '@gisik-nokma/domain';
import { REFUSAL_RULES } from '../refusal-rules.js';
import { resolveStateIdForward } from '../version-map.js';
import type { RuleEvaluator } from './types.js';

/**
 * Four-eyes: the actor must differ from whoever LAST performed the named
 * earlier transition — the approval pairs with the submission it approves.
 *
 * Each log entry's toStateId is written in the vocabulary of the WORKFLOW and
 * VERSION recorded beside it, while the rule names a state in the ticket's
 * current workflow at its LATEST definition. Two guards follow, in this order:
 *
 *  1. Entries from a different workflow are skipped outright. A ticket pins
 *     the workflow it was created under and only an explicit migration
 *     (ticket.workflow_rebound) moves it; stateMapping is keyed inside one
 *     workflow's version chain, so across two graphs there is nothing to walk.
 *     Walking a foreign entry anyway either finds nothing (the rule finds
 *     nobody and one person makes both moves) or matches a state id the two
 *     workflows merely spell alike, refusing someone who did nothing.
 *  2. Surviving entries are walked forward through the same stateMapping chain
 *     the ticket's own state walks (one shared helper, never a second walk)
 *     and the RESULT is compared to the rule's target. Without this, a version
 *     that dropped and remapped the watched state would leave every historical
 *     entry unmatchable, the rule would find nobody, and one person could make
 *     both moves — versioning disarming four-eyes silently.
 *
 * Nobody ever performed the move → vacuously satisfied (creation is not a
 * transition, and neither is a migration). Publishing now refuses a rule
 * watching a state nothing enters, and the builder warns when the guarded move
 * is reachable without the watched one, so what remains here is a semantics the
 * author was told about.
 */
export const evaluateRequireDifferentUser: RuleEvaluator<
  Extract<Rule, { kind: 'require-different-user' }>
> = async (rule, input) => {
  const target = rule.thanActorOf.to;

  let prior: { actorId: string } | undefined;
  for (const entry of input.ticket.transitions) {
    // Guard 1: this entry belongs to a workflow the ticket has left. Its state
    // ids are another graph's vocabulary; there is no chain to walk them along.
    if (entry.workflowId !== input.ticket.workflowId) continue;
    const resolved = await resolveStateIdForward(
      input.ticket.workflowId,
      entry.toStateId,
      entry.workflowVersion,
      input.def,
      input.ctx,
    );
    // An entry that cannot be resolved forward is skipped, and that is not a
    // silent disarm: publishing refuses unmapped drops, so an unresolvable
    // entry only exists in a planted or corrupted store — and in such a store
    // the ticket's own state resolution refuses first, as stranded-state,
    // before any rule runs.
    if (!resolved.ok) continue;
    // Iterating oldest-first and overwriting leaves the LAST match standing.
    if (resolved.stateId === target) prior = entry;
  }

  if (prior === undefined || prior.actorId !== input.env.actorId) return { refused: false };
  return {
    refused: true,
    rule: REFUSAL_RULES.requireDifferentUser,
    reason: `This step needs a second person: ${prior.actorId} already performed the move to "${target}" on this ticket.`,
  };
};
```

In `packages/rule-engine/src/rules/index.ts`, add the import:

```ts
import { evaluateRequireDifferentUser } from './require-different-user.js';
```

and replace

```ts
    case 'require-different-user':
      throw new Error('rule kind "require-different-user" is not implemented yet');
```

with:

```ts
    case 'require-different-user':
      return evaluateRequireDifferentUser(rule, input);
```

- [ ] **Step 4: Run the suite and prove no throw survived**

Run: `pnpm --filter ./packages/rule-engine test`
Expected: PASS.

Run: `grep -rn "not implemented yet" packages/rule-engine/src || echo "clean"`
Expected: `clean` — the vocabulary is complete.

- [ ] **Step 5: Commit**

```bash
git add packages/rule-engine/src/rules/require-different-user.ts packages/rule-engine/src/rules/index.ts packages/rule-engine/fixtures/
git commit -m "Four-eyes closes the vocabulary, and neither a rename nor a migration can disarm it

Only the latest performer of the named transition counts — an approval
pairs with the submission standing before it, so an old withdrawn
submission does not lock its author out.

Log entries are written in the vocabulary of the workflow and version they
were made under. Entries from a workflow the ticket has since been migrated
off are skipped, and the rest are walked forward through the same state
mappings the ticket's own state follows before they are compared. Without
the walk, a version that dropped and remapped the watched state left every
historical entry unmatchable: the rule found nobody, one person made both
moves, and the workflow still looked structurally clean. Without the filter,
an entry from an unrelated workflow matched on a state id the two graphs
merely spell alike and refused someone who had done nothing. Proven by
planting exactly that version pair and exactly that migration.

With nobody to differ from the rule still accepts vacuously — but the
workflow it can happen on is one publishing allows and the builder warns
about, not a hole nobody mentioned. No unimplemented rule kind remains."
```

---

### Task 12: The `proj_workflows` projection and the server's `getWorkflowDef`

Workflow definitions are events; the engine needs them queryable — current and every historical version (the version walk in `resolveCurrentStateId` fetches intermediates). This task adds the projection table, registers it with Plan 1's projection registry, and gives the server's `EngineContext.getWorkflowDef` its real implementation. `apply` is idempotent (`ON CONFLICT DO NOTHING` on the `(workflow_id, version)` key), so Plan 1's rebuild-and-diff verifier can replay the ledger into it deterministically.

**Each row also records the ledger position at which its version was published**, and the reader can be asked as of a position. This is the coordination doc's decision of 2026-08-26 ("A new workflow version refreshes the tickets it re-categorises", corollary), and it fixes a defect that is live today rather than adding a convenience:

- `getWorkflowDefFromProjection(db, workflowId)` is contracted as "the latest version". Plan 3's `proj_tickets` calls it with no version and treats the answer as *the definition in force at the event it is applying*. Those are the same thing only while the projection is live. Plan 1's verifier rebuilds **projection-outer** (`for (const projection of projections) { reset; for (const event of ledger) apply }`), so `proj_workflows` is fully built to the newest version before `proj_tickets` replays its first event.
- Two consequences, both true today. Replaying a `ticket.transitioned` whose `toStateId` a later version dropped **throws** — the reducer looks the id up in the definition directly and the mandatory `stateMapping` does not save it, because that mapping is consulted by the engine's `resolveCurrentStateId`, not by the reducer. So any version that drops a state makes `proj_tickets` unrebuildable, breaking the spec §3 promise that projections rebuild deterministically from scratch. And even with nothing dropped, re-derivation stamps the newest `workflow_version` where the live row holds the version in force at the time, so the verifier reports drift after *any* republish.
- The position is `workspace_seq`, the workspace stream cursor (coordination §18), taken from the `workflow.defined` event's own envelope. It is available to `apply` because Plan 1's `Projection.apply` receives a `LedgerEvent` — the stored envelope plus its assigned stream position — rather than the bare domain `EventEnvelope`. `workspace_seq` is `UNIQUE(workspace_id, workspace_seq)` in the ledger and is a **stored property of the event**, not an artefact of when a projection happened to see it, so reading it does not weaken `apply`'s determinism rule.

The reader gains one more way to be asked, alongside "latest" and "this exact version": **as of a position**, meaning the greatest version whose publish position is at or before it. That is what Plan 3's projection passes the current event's `workspaceSeq`, so `proj_tickets` becomes a pure function of the ledger prefix and live and re-derived converge.

**Files:**
- Create: `apps/server/migrations/<timestamp>_proj-workflows.ts` (timestamp prefix per Plan 1's convention in `apps/server/migrations/` — match the extension Plan 1 uses)
- Create: `apps/server/src/projections/workflows.ts`
- Modify: the module where Plan 1 registers projections (locate: `grep -rn "registerProjection" apps/server/src`) — one registration call
- Modify: Plan 1's `EngineContext` construction (locate: `grep -rn "getWorkflowDef" apps/server/src`) — replace the stub `getWorkflowDef`
- Test: `apps/server/test/proj-workflows.test.ts`

**Interfaces:**
- Consumes: Plan 1's `registerProjection({ name, apply, reset })` and migration runner; `workflowDefinedPayloadSchema`, `PublishedWorkflowDef`, `EventEnvelope` from `@gisik-nokma/domain`.
- Produces: table `proj_workflows` (`workspace_id`, `workflow_id`, `version`, `name`, `definition` jsonb, `defined_by`, `defined_at`, **`published_workspace_seq` bigint NOT NULL** — the `workspace_seq` of the `workflow.defined` event that published this version; PK `(workflow_id, version)`); `workflowsProjection` (name `proj_workflows`, `tables: ['proj_workflows']`, matching coordination §8's registration order); and the reader

  ```ts
  export type WorkflowDefSelector = number | { asOfWorkspaceSeq: number };

  export function getWorkflowDefFromProjection(
    db: Queryable,
    workflowId: string,
    select?: WorkflowDefSelector,
  ): Promise<PublishedWorkflowDef | null>;
  ```

  Three ways to ask, one function, and the existing two are unchanged: **omit** `select` for the newest published version; pass a **number** for that exact version (every existing caller keeps working — Plan 5 passes one in `getWorkflowDefFromProjection(deps.pool, workflowId, version)`); pass **`{ asOfWorkspaceSeq: n }`** for the greatest version whose `published_workspace_seq <= n`, i.e. the definition in force at that ledger position, or `null` when the workflow had not been published yet at `n`. A union rather than a fourth positional parameter, because "version 3" and "as of position 3" are two different questions and a call site must not be able to blur them.

  The stored `definition` is the full `workflow.defined` payload, stateMapping included, so the engine's version walk sees mappings.

- [ ] **Step 1: Ensure the server package can run Vitest**

As Task 1 Step 1, but for `apps/server` (skip if Plan 1 already set it up). Run `pnpm install`.

- [ ] **Step 2: Write the failing integration test**

Create `apps/server/test/proj-workflows.test.ts`. It is gated on `TEST_DATABASE_URL` (Open question 9): unset, it skips loudly; set, it runs against a real Postgres 16 with migrations applied (`pnpm --filter ./apps/server migrate up` first — adapt to Plan 1's migration script name).

```ts
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { LedgerEvent } from '../src/ledger/event-store.js';
import { getWorkflowDefFromProjection, workflowsProjection } from '../src/projections/workflows.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDb = databaseUrl === undefined ? describe.skip : describe;
if (databaseUrl === undefined) {
  console.warn('TEST_DATABASE_URL is not set — skipping proj_workflows integration tests');
}

const basicStates = [
  { id: 'todo', name: 'To do', category: 'open' },
  { id: 'doing', name: 'Doing', category: 'active' },
  { id: 'done', name: 'Done', category: 'terminal' },
];
const basicTransitions = [
  { from: 'todo', to: 'doing', rules: [] },
  { from: 'doing', to: 'done', rules: [] },
  { from: 'done', to: 'doing', rules: [] },
];

/**
 * `seq` is the per-entity counter; `workspaceSeq` is the workspace stream
 * position (coordination §18) and is what the projection records as the
 * publish position. They are given different values deliberately: the two
 * counters coincide only when the entity IS the workspace, and a test that
 * let them coincide here would pass even if the code stored the wrong one.
 */
function workflowDefined(version: number, name: string, seq: number, workspaceSeq: number): LedgerEvent {
  return {
    id: `evt_wf_${version}`,
    workspaceId: 'ws_1',
    entity: { kind: 'workflow', id: 'wf_basic' },
    type: 'workflow.defined',
    version: 1,
    payload: { id: 'wf_basic', version, name, initialStateId: 'todo', states: basicStates, transitions: basicTransitions },
    actorId: 'user_admin',
    origin: 'server',
    clientTime: '2026-08-20T00:00:00.000Z',
    serverTime: '2026-08-20T00:00:00.000Z',
    seq,
    workspaceSeq,
  };
}

describeDb('proj_workflows', () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeEach(async () => {
    await workflowsProjection.reset(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('serves the latest version by default and historical versions on request', async () => {
    await workflowsProjection.apply(workflowDefined(1, 'Basic', 1, 10), pool);
    await workflowsProjection.apply(workflowDefined(2, 'Basic v2', 2, 40), pool);
    expect((await getWorkflowDefFromProjection(pool, 'wf_basic'))?.version).toBe(2);
    expect((await getWorkflowDefFromProjection(pool, 'wf_basic', 1))?.name).toBe('Basic');
    expect(await getWorkflowDefFromProjection(pool, 'wf_ghost')).toBeNull();
  });

  it('answers as of a ledger position — the version in force there, not the newest', async () => {
    await workflowsProjection.apply(workflowDefined(1, 'Basic', 1, 10), pool);
    await workflowsProjection.apply(workflowDefined(2, 'Basic v2', 2, 40), pool);
    // Position 25 sits between the two publishes: v1 was in force there. A
    // projection replaying an event stamped 25 must see v1, however many
    // versions the table has grown by the time the replay runs — this is the
    // whole reason the column exists.
    expect((await getWorkflowDefFromProjection(pool, 'wf_basic', { asOfWorkspaceSeq: 25 }))?.version).toBe(1);
    // On the publish position itself the new version is already in force: the
    // definition and the event that carries it are one and the same fact.
    expect((await getWorkflowDefFromProjection(pool, 'wf_basic', { asOfWorkspaceSeq: 40 }))?.version).toBe(2);
    expect((await getWorkflowDefFromProjection(pool, 'wf_basic', { asOfWorkspaceSeq: 999 }))?.version).toBe(2);
    // Before the workflow existed there is no honest answer but "none".
    expect(await getWorkflowDefFromProjection(pool, 'wf_basic', { asOfWorkspaceSeq: 9 })).toBeNull();
  });

  it('ignores events that are not workflow.defined', async () => {
    const other: LedgerEvent = {
      ...workflowDefined(1, 'Basic', 1, 10),
      type: 'comment.added',
      entity: { kind: 'ticket', id: 't1' },
      payload: { text: 'hi' },
    };
    await workflowsProjection.apply(other, pool);
    expect(await getWorkflowDefFromProjection(pool, 'wf_basic')).toBeNull();
  });

  it('replaying the same event is a no-op — rebuilds are deterministic', async () => {
    await workflowsProjection.apply(workflowDefined(1, 'Basic', 1, 10), pool);
    await workflowsProjection.apply(workflowDefined(1, 'Basic', 1, 10), pool);
    const { rows } = await pool.query('SELECT count(*)::int AS count FROM proj_workflows');
    expect(rows[0].count).toBe(1);
  });

  it('reset then re-apply reproduces identical rows', async () => {
    await workflowsProjection.apply(workflowDefined(1, 'Basic', 1, 10), pool);
    await workflowsProjection.apply(workflowDefined(2, 'Basic v2', 2, 40), pool);
    const before = (await pool.query('SELECT * FROM proj_workflows ORDER BY workflow_id, version')).rows;
    await workflowsProjection.reset(pool);
    await workflowsProjection.apply(workflowDefined(1, 'Basic', 1, 10), pool);
    await workflowsProjection.apply(workflowDefined(2, 'Basic v2', 2, 40), pool);
    const after = (await pool.query('SELECT * FROM proj_workflows ORDER BY workflow_id, version')).rows;
    expect(after).toEqual(before);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/gisik_test pnpm --filter ./apps/server test` (create the database first with `createdb gisik_test` if needed; without the variable the suite skips, which is not a verification)
Expected: FAIL — cannot resolve `../src/projections/workflows.js`.

- [ ] **Step 4: Write the migration and the projection**

Create the migration (name it with Plan 1's timestamp convention, e.g. `apps/server/migrations/1755660000000_proj-workflows.ts`):

```ts
import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('proj_workflows', {
    workspace_id: { type: 'text', notNull: true },
    workflow_id: { type: 'text', notNull: true },
    version: { type: 'integer', notNull: true },
    name: { type: 'text', notNull: true },
    definition: { type: 'jsonb', notNull: true },
    defined_by: { type: 'text', notNull: true },
    defined_at: { type: 'timestamptz', notNull: true },
    // The workspace stream position of the workflow.defined event that
    // published this version (coordination §18). It is what makes an as-of
    // lookup possible, and with it proj_tickets is a pure function of the
    // ledger prefix rather than of whatever proj_workflows happens to hold now.
    published_workspace_seq: { type: 'bigint', notNull: true },
  });
  pgm.addConstraint('proj_workflows', 'proj_workflows_pkey', {
    primaryKey: ['workflow_id', 'version'],
  });
  pgm.createIndex('proj_workflows', ['workspace_id']);
  // The as-of lookup's access path: newest publish at or before a position.
  pgm.createIndex('proj_workflows', ['workflow_id', 'published_workspace_seq']);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('proj_workflows');
}
```

Run the migration: `pnpm --filter ./apps/server migrate up` (adapt to Plan 1's script name).

Create `apps/server/src/projections/workflows.ts` (if Plan 1 exports a DB-handle type for projections, import and use it in place of the local `Queryable`):

```ts
import { workflowDefinedPayloadSchema, type PublishedWorkflowDef } from '@gisik-nokma/domain';
import type { LedgerEvent } from '../ledger/event-store.js';

type Queryable = {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
};

/**
 * Projects workflow.defined events into proj_workflows — every published
 * version, queryable individually, because the engine's version walk needs
 * intermediates and their stateMappings. Idempotent on (workflow_id, version)
 * so ledger replays and the rebuild-and-diff verifier are deterministic.
 *
 * Each row records published_workspace_seq: the stream position of the event
 * that published it. It comes off the LedgerEvent apply receives, so it is the
 * stored position of that event and not a fact about when this projection ran
 * — replay reproduces it exactly, which is what keeps apply deterministic.
 */
export const workflowsProjection = {
  name: 'proj_workflows',
  tables: ['proj_workflows'] as const,

  async apply(env: LedgerEvent, db: Queryable): Promise<void> {
    if (env.type !== 'workflow.defined') return;
    const payload = workflowDefinedPayloadSchema.parse(env.payload);
    await db.query(
      `INSERT INTO proj_workflows
         (workspace_id, workflow_id, version, name, definition, defined_by, defined_at, published_workspace_seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (workflow_id, version) DO NOTHING`,
      [
        env.workspaceId,
        payload.id,
        payload.version,
        payload.name,
        JSON.stringify(payload),
        env.actorId,
        env.serverTime,
        env.workspaceSeq,
      ],
    );
  },

  async reset(db: Queryable): Promise<void> {
    await db.query('TRUNCATE proj_workflows');
  },
};

/**
 * How to name the version you want.
 *
 *   omitted                  the newest published version
 *   3                        exactly version 3
 *   { asOfWorkspaceSeq: 3 }  whatever was in force at stream position 3
 *
 * The last is not a nicety. A projection replaying the ledger must resolve the
 * definition as of the event it is applying, never as of now: the verifier
 * rebuilds projection-outer, so proj_workflows is already at the newest
 * version before proj_tickets replays its first event. Asking "latest" there
 * gives a re-derivation that disagrees with the live row after any republish,
 * and throws outright once a version has dropped a state.
 *
 * A union rather than a fourth parameter, because "version 3" and "as of
 * position 3" are different questions and a call site must not be able to
 * blur them.
 */
export type WorkflowDefSelector = number | { asOfWorkspaceSeq: number };

export async function getWorkflowDefFromProjection(
  db: Queryable,
  workflowId: string,
  select?: WorkflowDefSelector,
): Promise<PublishedWorkflowDef | null> {
  const result =
    select === undefined
      ? await db.query(
          'SELECT definition FROM proj_workflows WHERE workflow_id = $1 ORDER BY version DESC LIMIT 1',
          [workflowId],
        )
      : typeof select === 'number'
        ? await db.query('SELECT definition FROM proj_workflows WHERE workflow_id = $1 AND version = $2', [
            workflowId,
            select,
          ])
        : await db.query(
            `SELECT definition FROM proj_workflows
             WHERE workflow_id = $1 AND published_workspace_seq <= $2
             ORDER BY version DESC LIMIT 1`,
            [workflowId, select.asOfWorkspaceSeq],
          );
  if (result.rows.length === 0) return null;
  return workflowDefinedPayloadSchema.parse(result.rows[0].definition);
}
```

Ordering note for the as-of query: it orders by `version`, not by `published_workspace_seq`. The two agree — publishing refuses a version that is not exactly one past the latest, so versions of one workflow are appended in ascending order and their publish positions ascend with them — and ordering by the version is the one that stays correct if that ever stops being true, because "the greatest version at or before this point" is the question actually being asked.

- [ ] **Step 5: Run the test to verify it passes**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/gisik_test pnpm --filter ./apps/server test`
Expected: PASS.

- [ ] **Step 6: Register the projection and wire the server context**

In the module where Plan 1 registers projections (found in the Files grep), add:

```ts
import { workflowsProjection } from './projections/workflows.js';

registerProjection(workflowsProjection);
```

(Adjust the relative import path to that module's location.)

In Plan 1's `EngineContext` construction, replace the stub `getWorkflowDef` with (where `db` is the pipeline's `pg` handle in scope there):

```ts
    getWorkflowDef: (workflowId, version) => getWorkflowDefFromProjection(db, workflowId, version),
```

adding the import:

```ts
import { getWorkflowDefFromProjection } from './projections/workflows.js';
```

`getEntityState` and `getChildrenStates` stay Plan 1's stubs until Plan 3 (see Cross-plan coordination assumptions).

- [ ] **Step 7: Verify the whole server package and the projection verifier**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/gisik_test pnpm --filter ./apps/server test`
Expected: PASS.

Run Plan 1's verify-projections CLI against the test database (its own documented invocation) — expected: no drift reported for `proj_workflows`. (The verifier creates one shadow table per name in the projection's `tables`, so a projection without that field is invisible to it — which is why `workflowsProjection` declares `tables: ['proj_workflows']` and takes its name from coordination §8's registration order rather than a bare `workflows`.)

- [ ] **Step 8: Commit**

```bash
git add apps/server/migrations/ apps/server/src/projections/workflows.ts apps/server/src apps/server/test/proj-workflows.test.ts apps/server/vitest.config.ts apps/server/package.json pnpm-lock.yaml
git commit -m "proj_workflows: every published version queryable, as of any point in the ledger

The stored definition is the full payload, stateMapping included, because
the engine's version walk needs intermediates. Idempotent on the version
key so replays and the rebuild-and-diff verifier stay deterministic —
proven by applying twice and by rebuilding to identical rows.

Each row also records the stream position it was published at, and the
reader can be asked as of a position. A projection replaying the ledger
must resolve the definition in force at the event it is applying, not the
newest one: the verifier rebuilds projection-outer, so this table is
already at the newest version before the ticket projection replays its
first event. Asking 'latest' there re-derives rows that disagree with live
after any republish, and throws outright once a version has dropped a
state. And the server context stops stubbing getWorkflowDef."
```

---

### Task 13: `Features.md`, `test-cases/`, and final verification

The workspace convention: `Features.md` and `test-cases/` move in the same change set as the work — this plan is one branch and one PR, and this task closes it out with the catalogue updates and a full verification pass.

**Files:**
- Modify: `Features.md`
- Create: `test-cases/04-workflow-engine.md`

**Interfaces:**
- Consumes: everything Tasks 1–12 delivered.
- Produces: the catalogue entries Plans 3–11 extend.

- [ ] **Step 1: Run the full verification pass**

```bash
pnpm --filter ./packages/domain --filter ./packages/rule-engine test
TEST_DATABASE_URL=postgres://localhost:5432/gisik_test pnpm --filter ./apps/server test
grep -rn "not implemented yet" packages/rule-engine/src || echo "clean"
pnpm --filter ./packages/domain --filter ./packages/rule-engine --filter ./apps/server exec tsc --noEmit
ls packages/rule-engine/fixtures/*.json | wc -l
```

Also prove the advisory tier never reached the engine:

```bash
grep -rn "adviseWorkflowDef" packages/rule-engine/src && echo "FAIL — the engine must never call the advisory tier" || echo "clean"
```

Expected: all tests pass; both greps print `clean`; `tsc` is silent; the fixture count is **58**. Do not proceed while any of these fails.

- [ ] **Step 2: Add the Features.md section**

Plan 1 will have added its own sections by execution time. Append the section below after the last existing section, numbering it with the next free number (the numbering is settled: this subsystem is Features.md §4 with bucket `test-cases/04-workflow-engine.md`, per the coordination doc §2):

```markdown
## 4. Workflow engine & rule vocabulary

- ⚙️ **Workflow vocabulary** — workflow definitions as data: states with open/active/terminal categories, transitions (including from-any), and the closed five-rule vocabulary (restrict-to, require-comment, require-evidence, require-field, require-different-user) as zod schemas; `workflow.defined` payloads carry the full definition plus an optional stateMapping. Also the one forward state-id walk, `foldStateIdForward` — pure, and in domain because the engine, the server's ticket projection and the offline replica must all fold identically. `packages/domain/src/workflow.ts`
- ⚙️ **Structural validation** — `validateWorkflowDef`, pure and I/O-free so the future builder UI shares it: eleven plain-language checks covering workflows that cannot finish, states that cannot be reached or entered, duplicate ids/edges, and rules that can never fire or be satisfied — including `rdu-unenterable-state`, a four-eyes rule watching a state nothing in this version enters. `packages/domain/src/validate-workflow.ts`
- ⚙️ **Advisory tier** — `adviseWorkflowDef`, a separate function returning warnings the builder shows without blocking publish; the rule engine never calls it, because everything `validateWorkflowDef` returns becomes a refusal. Its one code, `rdu-bypassable`, names a four-eyes rule whose guarded move is reachable without ever entering the watched state. `packages/domain/src/advise-workflow.ts`
- ⚙️ **Rule engine** — the real `evaluateEvent`: `ticket.transitioned` checked against authoritative state (transition legality, version walks across stateMappings, the parent-terminal-with-open-children invariant that no author can switch off, transition rules in order with first-refusal-wins); `workflow.defined` checked for structure, consecutive versioning, and stranding. `require-different-user` skips transition-log entries belonging to a workflow the ticket has been migrated off and resolves the rest forward through the version chain before comparing, so neither dropping and remapping a state nor a workflow migration can disarm four-eyes. Every refusal names its rule and reasons in plain language. `packages/rule-engine/src/`
- ⚙️ **Planted-defect fixture suite** — 59 JSON fixtures, one per refusal path plus accepting twins, run by an in-memory harness and exported so server and client builds prove the same refusals against the same defects. `packages/rule-engine/fixtures/`
- ⚙️ **Workflow projection** — `proj_workflows` keeps every published version queryable (the engine's version walk needs intermediates and their mappings) and backs the server's `getWorkflowDef`; each row records the ledger position it was published at, so a definition can be asked for as of a point in the ledger rather than only as of now; idempotent apply, deterministic rebuild. `apps/server/src/projections/workflows.ts`
```

- [ ] **Step 3: Create the test-cases bucket**

Create `test-cases/04-workflow-engine.md` (the `04`/`4.` numbering is settled per the coordination doc §2):

```markdown
# 4. Workflow engine & rule vocabulary

Status markers: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` consciously out of scope (with reason)

Fixture names refer to `packages/rule-engine/fixtures/`; unit tests to `packages/domain/test/` and `apps/server/test/`.

## Structural validation

- 4.1 ✅ A definition with no states reports exactly `no-states`. — validate-workflow.test.ts
- 4.2 ✅ Duplicate state ids are refused at publish. — workflow-defined-refuses-duplicate-state-ids
- 4.3 ✅ A workflow with no terminal state is refused at publish. — workflow-defined-refuses-no-terminal-state
- 4.4 ✅ A transition referencing an unknown state is refused at publish. — workflow-defined-refuses-unknown-transition-state
- 4.5 ✅ Two transitions over the same edge are refused; an exact edge plus a from-any edge to the same target is not a duplicate. — workflow-defined-refuses-duplicate-transition, validate-workflow.test.ts
- 4.6 ✅ An unreachable state is refused at publish; from-any targets count as reachable. — workflow-defined-refuses-unreachable-state, validate-workflow.test.ts
- 4.7 ✅ A terminal state with no way in is refused; a self-loop is not a way in. — workflow-defined-refuses-unenterable-terminal-state, validate-workflow.test.ts
- 4.8 ✅ A restrict-to naming nobody is refused at publish. — workflow-defined-refuses-empty-restrict-to
- 4.9 ✅ A require-different-user watching a nonexistent transition is refused at publish. — workflow-defined-refuses-rdu-unknown-state

## Versioning and stranding

- 4.10 ✅ A brand-new workflow must publish as version 1. — workflow-defined-refuses-a-first-version-other-than-1
- 4.11 ✅ Versions are consecutive; jumps are refused. — workflow-defined-refuses-a-version-jump
- 4.12 ✅ Dropping a state without a stateMapping entry is refused. — workflow-defined-refuses-dropped-state-without-mapping
- 4.13 ✅ A stateMapping target must exist in the new version. — workflow-defined-refuses-mapping-to-unknown-state
- 4.14 ✅ Only dropped states may be remapped. — workflow-defined-refuses-mapping-for-surviving-state
- 4.15 ✅ A complete mapping publishes; a display-name-only rename needs no mapping. — workflow-defined-accepts-v2-with-complete-mapping, workflow-defined-accepts-a-rename-only-v2
- 4.16 ✅ Envelope hygiene: wrong entity kind, entity/payload id mismatch, and unparseable payloads refuse. — workflow-defined-refuses-wrong-entity-kind, workflow-defined-refuses-entity-id-mismatch, workflow-defined-refuses-malformed-payload

## Transitions

- 4.17 ✅ A move on an unknown ticket, an unpublished workflow, or to an unknown state refuses with the missing thing named. — transition-refuses-unknown-ticket, transition-refuses-unknown-workflow, transition-refuses-unknown-target-state
- 4.18 ✅ A move along an edge the workflow lacks refuses naming both states; declared edges accept. — transition-refuses-an-edge-the-workflow-lacks, transition-accepts-a-declared-edge
- 4.19 ✅ A from-any edge is usable from every state. — transition-accepts-a-from-any-edge
- 4.20 ✅ A ticket from an older version follows stateMappings forward; with no covering mapping it refuses as stranded rather than guessing. — transition-accepts-across-versions-via-mapping, transition-refuses-a-stranded-ticket
- 4.21 ✅ Transition envelope hygiene: wrong entity kind and unparseable payloads refuse. — transition-refuses-wrong-entity-kind, transition-refuses-malformed-payload
- 4.22 ✅ Event types the engine does not handle pass through untouched. — pass-through-accepts-unhandled-event-types

## The invariant above all workflows

- 4.23 ✅ A parent cannot enter a terminal state while any child is non-terminal — open or active alike; it may once every child is terminal. — invariant-refuses-terminal-parent-with-open-child, invariant-refuses-terminal-parent-with-active-child, invariant-accepts-terminal-parent-when-children-are-terminal

## The rule vocabulary

- 4.24 ✅ require-comment refuses bare and whitespace-only comments; a real comment passes. — rule-require-comment-*
- 4.25 ✅ require-evidence refuses without an attachment id; with one it passes. — rule-require-evidence-*
- 4.26 ✅ require-field wants the field set before the move, not with it. — rule-require-field-*
- 4.27 ✅ restrict-to: assignee, roles (via membership), and named people OR-combine; missing membership refuses; a planted empty restriction refuses everyone. — rule-restrict-to-* (10 fixtures)
- 4.28 ✅ require-different-user: the last performer of the named move cannot act; a second person can; vacuous acceptance when nobody performed it; only the latest performer counts. — rule-rdu-* (6 fixtures)
- 4.29 ✅ Rules run in authored order and the first refusal wins — proven with the same violated pair in both orders. — rules-first-refusal-wins, rules-order-comes-from-the-definition

## Workflow projection

- 4.30 ✅ proj_workflows serves the latest version by default and historical versions on request; ignores foreign events; replay is idempotent; reset-and-reapply reproduces identical rows. — proj-workflows.test.ts (integration, TEST_DATABASE_URL)

## Four-eyes across versions, and the advisory tier

- 4.31 ✅ A require-different-user rule watching a state that exists but that nothing in this version enters is refused at publish. — validate-workflow.test.ts (`rdu-unenterable-state`)
- 4.32 ✅ An unknown watched state reports only `rdu-unknown-state`; the two four-eyes codes never both fire for one rule. — validate-workflow.test.ts
- 4.33 ✅ `adviseWorkflowDef` is silent on canonical four-eyes and warns (`rdu-bypassable`) when the guarded move is reachable without entering the watched state, on a from-any transition, and when the guarded edge is itself the entry into the watched state. — advise-workflow.test.ts
- 4.34 ✅ Advisories never gate publish: a definition that trips only `rdu-bypassable` is accepted by the engine. — workflow-defined-accepts-a-def-the-advisory-warns-about, advise-workflow.test.ts
- 4.35 ✅ Four-eyes survives a state being dropped and remapped in a later version: a log entry written under the old vocabulary is resolved forward before comparison, so the same person cannot make both moves. — rule-rdu-refuses-across-a-remap
- 4.36 🚫 Vacuous acceptance across versions is not characterised by the advisory — it is closed by the per-entry `workflowVersion` instead (case 4.35). The advisory deliberately scopes to a single workflow version.
- 4.37 ✅ A transition-log entry recorded under a workflow the ticket has since been migrated off is ignored, even when both workflows spell the watched state the same way — four-eyes answers only for the workflow the ticket is on. — rule-rdu-ignores-an-entry-from-a-workflow-the-ticket-has-left
- 4.38 ✅ The version walk lives once, in `@gisik-nokma/domain`: it follows mappings through every intermediate version, reports the id at the point the chain broke, and refuses a state the latest definition no longer has. — workflow-schema.test.ts (`foldStateIdForward`)
- 4.39 ✅ `getWorkflowDefFromProjection` answers as of a ledger position: the version in force at that `workspace_seq`, not the newest one — v1 before v2 was published, v2 after. — proj-workflows.test.ts (integration, TEST_DATABASE_URL)
```

- [ ] **Step 4: Cross-check against reality, then commit**

Re-read the section just written and confirm every bullet describes something that exists in the code as landed (the Features.md rule: no silent drift, promote nothing unverified). Then:

```bash
git add Features.md test-cases/04-workflow-engine.md
git commit -m "Catalogue the workflow engine: features and test scenarios move with the work

Same change set as the code, per the workspace convention. Thirty-nine
scenario entries, all but one landing already-covered because every one
names the planted-defect fixture or test that proves it — the catalogue
records reality, not intent. The exception is marked out of scope with its
reason: vacuous four-eyes across versions is closed by the per-entry
workflow version, not by the advisory, and the catalogue says so rather
than implying the warning covers more than it does."
```

---

## Self-review (performed on the finished plan)

**1. Spec coverage — §4 engine half plus invariants 2, 3, 6:**

- Definitions are data (states with categories, transitions incl. from-any, rules on transitions) → Task 1. At least one terminal state; no unreachable state; no unenterable terminal state → Task 3 (+ engine wiring Task 5). ✓
- Closed, versioned rule vocabulary; no user code → Task 1 (discriminated union), Task 8 (exhaustive switch); the five rules → Tasks 8–11, each refusing with its reason named (invariant 2's "reason named in the user's language"). ✓
- Invariants above all workflows, not authorable away → Task 7 runs before authored rules inside the engine; nothing in a definition can disable it (invariant 3). Provenance, the other named invariant, is structural — envelope fields delivered by Plan 1 — so there is deliberately no task for it here. ✓
- Workflow changes are events (`workflow.defined` v1, v2, …); new versions apply to all tickets of the type; removals/renames demand a state mapping and refuse to strand → Tasks 5–6 (publish-side refusals + evaluation-side version walk). Every dropped state must be mapped, occupied or not; the owner settled that as permanent semantics on 2026-08-26 (Open question 6) — occupancy-dependent publish legality would split the client and server engines, so occupancy is a builder courtesy and never an engine input. ✓
- Eleven structural issue codes, one advisory code: `no-states`, `duplicate-state-id`, `no-terminal-state`, `unknown-transition-state`, `duplicate-transition`, `unknown-initial-state`, `unreachable-state`, `terminal-no-inbound`, `empty-restrict-to`, `rdu-unknown-state`, `rdu-unenterable-state` from `validateWorkflowDef` (Task 3), and `rdu-bypassable` from the separate `adviseWorkflowDef` — which the rule engine never calls, proven by a fixture in which the engine accepts a def that trips only the advisory (Task 5). ✓
- Four-eyes is not disarmed by versioning: transition-log entries carry the workflow version their state id is written in (Task 2) and `require-different-user` resolves each entry forward through the shared version walk before comparing (Task 11), proven by planting a drop-and-remap pair. The advisory characterises reachable vacuous acceptance **within a single workflow version only**; the cross-version case is closed by the per-entry version, not by the warning (Open question 10). ✓
- Invariant 6 / testing discipline: every refusal proven against a planted defect before trusted; one shared fixture suite for client and server → Task 4 (harness, exported), fixtures in every task, 59 total. ✓
- Builder UI, template gallery: later plan (explicitly out of this plan's scope); `validateWorkflowDef` and `adviseWorkflowDef` kept pure for it. ✓

**2. Placeholder scan:** no "TBD"/"TODO"/"add validation"/"similar to Task N". Fixtures that reuse an earlier fixture's structure name the exact source file and list every differing field with verbatim values, including full expected reasons. The `not implemented yet` throws are staged code with exact replacement edits in Tasks 9–11 and a grep gate in Tasks 11 and 13. ✓

**3. Type consistency:** `evaluateEvent(env, ctx)` matches the frozen signature; `Refusal.rule` strings come from `REFUSAL_RULES` in Task 5 and every fixture's `expected.rule` uses one of its 15 values; every fixture `expected.reason` was diffed against the Canonical refusal copy tables and the literal strings in Tasks 3, 5–11; `TransitionRuleInput` fields (`env, ctx, ticket, def, toState, fromStateId, payload`) match between Task 8's type, Task 8's call site in `transition.ts`, and Tasks 9–11's evaluators; `resolveCurrentStateId`'s `ResolvedState` is an alias of domain's `FoldedState` and is consumed with `resolved.ok`/`resolved.stateId`/`resolved.unmappedStateId` in Task 6 and Task 11 exactly as defined, and both callers go through the one `resolveStateIdForward`, which itself delegates to domain's `foldStateIdForward` (Task 1) rather than growing a second version walk; `Advisory` is deliberately structurally identical to `Issue` and the separation is enforced by a fixture, not by the type (Tasks 3 and 5); the transition-log entry shape `{ toStateId; actorId; seq; workflowId; workflowVersion }` matches between Task 2's type, Task 4's harness push and its assertion, and Task 11's evaluator (which reads both new fields, `workflowId` as a filter and `workflowVersion` as the walk's origin); `workflowsProjection.apply(env: LedgerEvent, db)`/`reset(db)` match Task 12's tests, and its `name`/`tables` are `proj_workflows` per coordination §8; `getWorkflowDefFromProjection`'s third parameter is `WorkflowDefSelector = number | { asOfWorkspaceSeq: number }`, which leaves Plan 5's two existing call sites (one omitting it, one passing a version number) unchanged; `membershipId('ws_1', 'user_a') === 'ws_1:user_a'` is asserted in Task 2 and relied on by Task 4's harness and Task 10's fixtures. ✓



