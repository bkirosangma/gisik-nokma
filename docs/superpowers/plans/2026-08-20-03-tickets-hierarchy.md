# Tickets, Hierarchy & Rollups Implementation Plan (Plan 3 of 11)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ticket domain — ticket types (built-in and custom), the ticket event vocabulary, hierarchy sanity refusals, the ticket head-state and rollup projections, and the ledger-backed history endpoint — so the rule engine's view of tickets becomes real and provable.

**Architecture:** Everything mutable is a claim in the event ledger; tickets are projections of it. A pure reducer (`applyTicketEvent`) folds ticket events into a `TicketState`, and the same reducer drives both the Postgres projection (`proj_tickets`) and the in-memory context used by the shared fixture suite — so client and server can never quietly disagree about what a ticket is. Hierarchy sanity (rank order, deepest-rank-needs-parent, cycles, cross-project) is enforced as engine refusals with plain-language reasons, each proven against a planted defect.

**Tech Stack:** TypeScript strict, Node 22 LTS, pnpm 9 workspaces + Turborepo, Vitest, Zod, Postgres 16 via `pg`, node-pg-migrate, Fastify 5, ULID via `ulidx`.

**Spec:** `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md` — this plan implements spec §2 (domain model: tickets, types, hierarchy, claims — NOT the WYSIWYG editor or attachment storage, which belong to a later plan) plus honesty-contract invariants 1 (provenance floor), 3 (parents cannot outrun children), and 4 (nothing is invented).

**Position in the series:** This is Plan 3 of 11. It consumes Plan 1 (ingest pipeline, event-type registry + `parseEvent`, projection registry, verify-projections CLI) and Plan 2 (the rule engine for `ticket.transitioned` + `workflow.defined`, `WorkflowDef`/`Rule`/`StateCategory`, `validateWorkflowDef`, the planted-defect fixture format, `proj_workflows` + `getWorkflowDef`). It produces the `TicketState` shape, `proj_tickets`, `proj_rollups`, and the ticket event vocabulary that Plans 4–11 build on. Plan 2 implements the parent-terminal invariant via `ctx.getChildrenStates`; **this plan supplies the data that makes `ctx.getChildrenStates` real** and the end-to-end planted-defect fixtures exercising it.

## Global Constraints

Copied verbatim from the binding engineering contract; every task's requirements implicitly include this section.

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

- RULE ENGINE INTERFACE (exact): `evaluateEvent(env, ctx): Promise<{refused:false} | {refused:true; rule: string; reason: string}>`; `EngineContext = { getEntityState(kind,id), getChildrenStates(ticketId): Promise<TicketState[]>, getWorkflowDef(workflowId, version?) }`.
- StateCategory = 'open'|'active'|'terminal'.
- Plan 1 delivers: packages/domain (EventEnvelope + event-type registry, pure `parseEvent`), apps/server (Fastify 5, Postgres 16 via `pg`, node-pg-migrate) with ingest pipeline calling `evaluateEvent(env, ctx)`, projection registry (`registerProjection({name, apply, reset})`, tables prefixed `proj_`), verify-projections rebuild-and-diff CLI.
- Plan 2 delivers: the real rule engine for `ticket.transitioned` + `workflow.defined`, WorkflowDef/Rule/StateCategory types in packages/domain, `validateWorkflowDef`, planted-defect fixture format in packages/rule-engine/fixtures/ ({name, workflowDefs: WorkflowDef[] (plural — Plan 2's stranding fixtures plant two versions at once), memberships?, priorEvents, candidateEvent, expected}) with harness exports `loadFixtures`/`buildInMemoryContext`/`assertFixtureOutcome`, proj_workflows + getWorkflowDef.
- Spec invariants in force here: **1** "Every visible state traces to the dated, attributed claim that produced it"; **3** "A terminal-state claim on a parent with open children is refused. Derived child progress renders beside every authored parent state"; **4** "Nothing is invented. No estimated dates, no fabricated progress."
- Every refusal is proven against planted defects before it is trusted. Projection determinism is tested by rebuild-and-diff.
- `reference/` is frozen — never edit anything under it. `Features.md` and `test-cases/` move in the same change set as the work. Commits are prose that says what was found and why it matters (this repo's convention overrides conventional-commit prefixes — do not "fix" the commit messages below into `feat:` style).
- Out of this plan's scope (owned by other plans): monorepo scaffold (Plan 1), rule-engine internals for workflow rules (Plan 2), auth/visibility, editor/attachment upload and storage, any UI. `comment.added` bodies are opaque structured-doc JSON here — the editor plan owns their schema. `attachment.added` carries metadata only — storage is a later plan.

## Coordination with Plans 1–2 (assumed identifiers)

Plans 1 and 2 are being written in parallel with this one; the contract fixes their semantics but not every identifier. This table lists every name this plan assumes. **Every task below uses these names verbatim.** If a landed plan chose a different name/signature for the same contracted thing, do ONE mechanical rename across this plan's code at the start of execution — the semantics are fixed and never renegotiated mid-task. This section is the only place that caveat lives; task steps stay concrete against these names.

| Assumed identifier | Assumed shape | Owner |
|---|---|---|
| Package names | `@gisik-nokma/domain` (packages/domain), `@gisik-nokma/rule-engine` (packages/rule-engine), server app in `apps/server` with workspace package name `server` (as in `pnpm --filter server`) | Plan 1 |
| `registerEventType({ type, version, payloadSchema })` | packages/domain event-type registry; `parseEvent(raw: unknown): EventEnvelope` throws on unknown type or payload that fails the registered Zod schema | Plan 1 |
| `EventEnvelope` import path | `packages/domain/src/envelope.ts` | Plan 1 |
| `registerProjection({ name, apply, reset })` | `apply(env: EventEnvelope, db: PoolClient): Promise<void>`, `reset(db: PoolClient): Promise<void>`; per event, projections apply **in registration order** (constraint this plan relies on: `proj_workflows` → `proj_ticket_types` → `proj_tickets` → `proj_rollups`) | Plan 1 |
| `applyEvent(db, env)` / `resetProjections(db)` | ingest's projection fan-out and the rebuild CLI's reset, exported from `apps/server/src/projections/registry.ts` for tests | Plan 1 |
| Ledger table | `events` with snake_case columns `id, workspace_id, entity_kind, entity_id, type, version, payload (jsonb), actor_id, origin, client_time (timestamptz), server_time (timestamptz), seq (bigint)`. **Both clocks are absolute instants** (owner decision 2026-08-20, "time is Asia/Kolkata") — pg hands them back as `Date`, and `rowToEnvelope` re-emits them as ISO 8601 `Z`. A claim submitted as `…+05:30` therefore reads back as the equivalent `…Z`: the instant survives, the label the device attached does not. No reader compares or sorts these columns with a cast. | Plan 1 |
| IST day helpers | `packages/domain/src/ist-day.ts` exports `IST_TIME_ZONE`, `IST_OFFSET_MINUTES`, `IST_DAY_REGEX`, `istDayOf(instant): string` (the `YYYY-MM-DD` IST day an instant falls in) and `istDayBounds(day): { startUtc, endUtc }` (the half-open UTC interval covering one IST day) | Plan 1 |
| `buildServer({ db })` | Fastify app factory, `apps/server/src/server.ts` | Plan 1 |
| `WorkflowDef` | `{ id: string; version: number; name: string; initialStateId: string; states: Array<{ id: string; name: string; category: StateCategory }>; transitions: Array<{ from: string; to: string; rules: Rule[] }> }` — this plan touches only `id`, `version`, `initialStateId`, `states[].{id,category}`; `from: '*'` means from-any. **`initialStateId` is settled** — Plan 2 defines it (coordination doc §3; see Open questions #1) | Plan 2 |
| `EngineVerdict` | the `evaluateEvent` return union, exported from packages/rule-engine (declared in `packages/rule-engine/src/evaluate.ts`) | Plan 2 |
| `EngineContext` type location | `packages/rule-engine/src/engine-context.ts`, re-exported from the package index | Plan 2 |
| verify-projections CLI | invoked as `pnpm --filter server verify-projections`, reading `DATABASE_URL` | Plan 1 |
| `evaluateEvent` dispatch | a switch on `env.type` in `packages/rule-engine/src/evaluate.ts`; unrouted types accepted | Plan 2 |
| `getWorkflowDef(db, workspaceId, workflowId, version?)` | server-side reader over `proj_workflows`, `apps/server/src/projections/workflows.ts`; omitting `version` returns the latest at the current ledger position | Plan 2 |
| Fixture runner | `packages/rule-engine/src/fixtures.test.ts` loads every `packages/rule-engine/fixtures/*.json`, builds an `EngineContext`, evaluates ONLY `candidateEvent`, and deep-equals the verdict against `expected` | Plan 2 |
| Parent-terminal rule id | `parent-terminal-with-open-children` (the rule string Plan 2's refusal names) | Plan 2 |
| Zod | v4 (`"zod": "^4"`); every construct used here is also valid on 3.23+ | Plan 1 |
| Test DB | Postgres 16 reachable at `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/gisik_nokma_test`), reusing Plan 1's dev database setup | Plan 1 |

## Refusal vocabulary (exact strings — a deliverable of this plan)

Rule ids and verbatim plain-language reasons, per invariant 2's "the reason named in the user's language". Implementations, unit tests, and fixtures copy these character-for-character. Tests and fixtures assert the **literal string**, never the constant — a typo'd constant must not be able to certify itself.

| Rule id | Reason (verbatim) |
|---|---|
| `ticket.unknown-type` | This ticket's type is not defined in this workspace. |
| `ticket.unknown` | This ticket does not exist in this workspace. |
| `ticket.workflow-undefined` | This ticket type's workflow has not been defined yet, so the ticket would have no status. |
| `hierarchy.unknown-parent` | The chosen parent ticket does not exist in this workspace. |
| `hierarchy.cross-project` | The parent is in a different project. Pick a parent from the same project. |
| `hierarchy.cycle` | This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself. |
| `field.unknown` | This ticket's type has no such field. Add the field to the ticket type first. |
| `field.title-required` | A ticket always has a title. Change the title instead of clearing it. |

Four templated reasons (the interpolated results are what tests assert):

- `hierarchy.rank` → `"${childTypeName}" cannot go under "${parentTypeName}": a ticket's parent must be a bigger kind of work.` — e.g. `"Epic" cannot go under "Story": a ticket's parent must be a bigger kind of work.`
- `hierarchy.deepest-rank-parent-required` (owner decision 2026-08-20, coordination doc sign-off table) → `"${typeName}" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.` — e.g. `"Sub-task" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.` The reason names the *type*, because the rule keys off the type's rank: the built-in `sub-task` and any custom type defined at that rank or below it all raise it.
- `hierarchy.parent-terminal` (owner decision 2026-08-20, coordination doc) → on `ticket.created`: `"${parentTitle}" is finished (${stateName}). Adding live work reopens it — choose a state to reopen it to, then add this ticket.` · on `ticket.reparented`: `"${parentTitle}" is finished (${stateName}). Moving live work under it reopens it — choose a state to reopen it to, then move this ticket.` — e.g. `"Quarterly filings" is finished (Done). Adding live work reopens it — choose a state to reopen it to, then add this ticket.`
- `field.type-mismatch` → `"${fieldName}" needs ${needsPhrase}.` with `needsPhrase` per field kind: text → `text`; number → `a number`; date → `a date in YYYY-MM-DD form`; select → `one of: ${options.join(', ')}`; person → `a person`; description built-in → `a document`; the two day-claim built-ins `dueDate`/`startDate` → `a day in YYYY-MM-DD form (a note is optional)` (named `"Due date"` and `"Start date"` respectively). E.g. `"Invoice amount" needs a number.`

Precondition refusals (`ticket.unknown-type`, `ticket.unknown`, `ticket.workflow-undefined`, `hierarchy.unknown-parent`) are forced by the checks themselves: rank needs both type defs, cycle needs the ticket to exist, and spec §3's "the ledger accepts only what it can later replay" means a `ticket.created` whose workflow cannot resolve must be refused at the door — otherwise the accepted event is unprojectable.

## Design decisions (made here, argued once)

1. **Built-in types are seed data, not special cases.** `epic(1)/story(2)/task(3)/sub-task(4)` ship as canonical constants in packages/domain, but every workspace materialises them as ordinary `ticket-type.defined` events at workspace creation (owned by the workspace-bootstrap plan) — because built-ins need a per-workspace workflow binding anyway. Resolution is therefore uniform: every type lookup reads event-defined types, and **nothing special-cases built-ins at all** — the parent-required rule keys off the deepest *rank* (decision 9), not off the id `sub-task`.
2. **A ticket's workflow is bound at creation** (`TicketState.workflowId` copied from its type's `workflowId` when the `ticket.created` event applies). Workflow *version* changes apply to all tickets (lookups resolve latest); re-binding a *type* to a different workflow affects new tickets only (Open questions #8).
3. **`ticket.field_set` with `value: null` clears the field — as a claim, provenance retained.** The single exception is `title`: a ticket always has a title (`field.title-required`). Clearing `description`, `dueDate`, `startDate`, or any custom field is legal; an undated item then simply vanishes from the calendar (invariant 4).
4. **Collaborators:** a duplicate `ticket.collaborator_added` deduplicates (state unchanged); removing a non-collaborator is a no-op. Both are accepted events — the claim is honest even when redundant.
5. **Rollups count DIRECT children only.** The spec's "open children" (invariant 3) means **direct non-terminal children** — categories `open` + `active`, i.e. `total_children - terminal_children`. Direct-only checking is sufficient by induction: the invariant holds at every level, so a terminal parent's terminal children already had no open children of their own when they went terminal. Derived progress is never authored — `proj_rollups` is computed, and nothing writes it but the projection.
6. **The cycle check is load-bearing, not redundant.** With strict rank ordering a cycle looks impossible — but `ticket-type.defined` can re-define a type's rank (types are events; last definition wins), after which a rank-legal reparent can close a loop. The planted defect for `hierarchy.cycle` uses exactly that construction.
7. **Check order** is fixed so the most fundamental truth names the refusal: for `ticket.created`: unknown type → workflow undefined → (root: deepest-rank rule) → unknown parent → cross-project → rank → parent-terminal. For `ticket.reparented`: unknown ticket → unknown type → (root: deepest-rank rule) → self/cycle → cross-project → rank → parent-terminal. A loop is named as a loop even when rank is also violated; the remediable contradiction (a finished parent) names the refusal only when the structure itself is sound.
8. **Live work under a terminal parent refuses toward a reopen** (owner decision 2026-08-20 — see the coordination doc's "Owner decision" section): a `ticket.created` naming a terminal-category parent, and a `ticket.reparented` moving a non-terminal ticket under one, refuse as `hierarchy.parent-terminal` with the remedy in the reason — the parent must reopen because it is acquiring live work; clients offer the reopen (the parent's `ticket.transitioned` carrying `cause: { kind: 'reopened-for-child', childTicketId }`) and then re-submit, while a terminal child under a terminal parent stays legal because nothing contradicts.
9. **Parent-required follows the RANK, not the built-in id** (owner decision 2026-08-20, coordination doc sign-off table — this overrules Plan 8's Open question 6). Any ticket whose type sits **at or below** the deepest rank requires a parent: the built-in `sub-task` (rank 4), any custom type an admin defines at rank 4, and any custom type deeper than that. Types at epic/story/task ranks are unaffected — an epic-rank custom type still sits at project root. The check is `type.rank >= DEEPEST_RANK`, where `DEEPEST_RANK = 4` is an exported constant matching the built-in sub-task's rank.
   - **Why a constant and not a max over the defined types.** A computed max would silently change the rule's meaning whenever the type inventory changed: a workspace that had never defined anything below Task would find *Task* suddenly unable to sit at project root, and defining one rank-5 type would release every rank-4 type from the requirement. A refusal that shifts underfoot is exactly what this product refuses to ship.
   - **Why `>=` and not `===`.** The rule's own justification is that the smallest kind of work always belongs to something bigger. A type deeper than sub-task is smaller still, so exempting it would invert the justification and leave an escape hatch — define rank 5 and your tickets float free at project root. `>=` closes that without reintroducing the shifting-meaning problem: the floor stays pinned at 4, and everything at or beneath it is covered.

## File structure

| Path | Responsibility |
|---|---|
| `packages/domain/src/ticket-types.ts` | `CustomFieldDef`, `TicketTypeDef`, Zod schemas, built-in seeds, `SUB_TASK_TYPE_ID`, `DEEPEST_RANK`, `BUILTIN_FIELD_IDS` |
| `packages/domain/src/events/ticket-events.ts` | Zod payload schemas + `registerEventType` calls for all ten event types |
| `packages/domain/src/workflow-helpers.ts` | `stateCategoryOf(def, stateId)` |
| `packages/domain/src/ticket-state.ts` | `FieldClaim`, `TicketState`, `TicketStateDeps`, `TICKET_EVENT_TYPES`, pure `applyTicketEvent` |
| `packages/domain/src/testing.ts` | `makeEnvelope` test builder (exported from the package index) |
| `packages/rule-engine/src/memory-context.ts` | `buildMemoryContext(seedWorkflows, events)` — in-memory `EngineContext` for fixtures and unit tests |
| `packages/rule-engine/src/checks/refusals.ts` | `REFUSALS`, `rankRefusal`, `fieldKindRefusal`, `refuse`, `ACCEPT` |
| `packages/rule-engine/src/checks/context-helpers.ts` | typed `getTicketState` / `getTicketTypeDef` over `ctx.getEntityState` |
| `packages/rule-engine/src/checks/hierarchy.ts` | `checkTicketCreated`, `checkTicketReparented` |
| `packages/rule-engine/src/checks/fields.ts` | `checkTicketFieldSet` |
| `packages/rule-engine/src/checks/test-support.ts` | shared type/event builders for check tests |
| `packages/rule-engine/fixtures/*.json` | thirteen end-to-end planted-defect fixtures (eight refusal scenarios + accepting twins) |
| `apps/server/migrations/1755672000000_proj-ticket-types.js` | `proj_ticket_types` table |
| `apps/server/migrations/1755672100000_proj-tickets.js` | `proj_tickets` table |
| `apps/server/migrations/1755672200000_proj-rollups.js` | `proj_rollups` table |
| `apps/server/src/projections/ticket-types.ts` | `proj_ticket_types` projection + `getTicketTypeFromDb` |
| `apps/server/src/projections/tickets.ts` | `proj_tickets` projection + `getTicketStateFromDb`, `getChildrenStatesFromDb` |
| `apps/server/src/projections/rollups.ts` | `proj_rollups` projection + `getRollup` |
| `apps/server/src/engine-context.ts` | `createEngineContext(db, workspaceId)` — the server's real `EngineContext` |
| `apps/server/src/routes/ticket-history.ts` | `GET /v1/tickets/:id/history` |
| `apps/server/test/helpers/db.ts` | migrated test pool (skip if Plan 1 already ships an equivalent) |

## Execution notes

- Work on a branch off `main` after Plans 1–2 have merged: `git checkout -b 03-tickets-hierarchy`.
- Server integration tests (Tasks 9–13) need Postgres 16 running and `TEST_DATABASE_URL` set (default above). Pure-domain and rule-engine tasks (1–8) need no database.
- Run a single test file: `pnpm --filter @gisik-nokma/domain exec vitest run src/ticket-types.test.ts` (same pattern per package). Full suite: `pnpm turbo run test`.

---

### Task 1: Ticket type model — built-in ladder and custom types as validated data

**Files:**
- Create: `packages/domain/src/ticket-types.ts`
- Test: `packages/domain/src/ticket-types.test.ts`
- Modify: `packages/domain/src/index.ts` (add exports)

**Interfaces:**
- Consumes: nothing from other tasks (Zod only).
- Produces (later tasks import all of these from `@gisik-nokma/domain`):
  - `type CustomFieldDef = { id: string; name: string; type: 'text'|'number'|'date'|'select'|'person'; options?: string[] }`
  - `type TicketTypeDef = { id: string; name: string; icon: string; rank: number; workflowId: string; fields: CustomFieldDef[] }`
  - `customFieldDefSchema`, `ticketTypeDefSchema` (Zod schemas for the above)
  - `BUILTIN_TICKET_TYPE_SEEDS: ReadonlyArray<{ id: string; name: string; icon: string; rank: number }>` — epic(1), story(2), task(3), sub-task(4)
  - `builtinTicketTypeDefs(defaultWorkflowId: string): TicketTypeDef[]`
  - `SUB_TASK_TYPE_ID = 'sub-task'`, `DEEPEST_RANK = 4` (the built-in sub-task's rank; the rank at **or below** which a type's tickets require a parent — design decision 9), `BUILTIN_FIELD_IDS = ['title', 'description', 'dueDate', 'startDate'] as const`
  - `dueDateValueSchema` — `{ date: 'YYYY-MM-DD', note?: string }` — the one day-claim shape, shared by `dueDate` and `startDate` (Plan 9's calendar reads the due claim and its timeline draws a bar only when a ticket carries both).

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/ticket-types.test.ts
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_FIELD_IDS,
  BUILTIN_TICKET_TYPE_SEEDS,
  DEEPEST_RANK,
  SUB_TASK_TYPE_ID,
  builtinTicketTypeDefs,
  customFieldDefSchema,
  dueDateValueSchema,
  ticketTypeDefSchema,
} from './ticket-types';

describe('customFieldDefSchema', () => {
  it('accepts a plain text field', () => {
    expect(customFieldDefSchema.parse({ id: 'notes', name: 'Notes', type: 'text' })).toEqual({
      id: 'notes',
      name: 'Notes',
      type: 'text',
    });
  });

  it('refuses a select field without options — a choice list needs choices', () => {
    expect(() => customFieldDefSchema.parse({ id: 'stage', name: 'Stage', type: 'select' })).toThrow();
  });

  it('refuses options on a non-select field', () => {
    expect(() =>
      customFieldDefSchema.parse({ id: 'notes', name: 'Notes', type: 'text', options: ['a'] }),
    ).toThrow();
  });
});

describe('ticketTypeDefSchema', () => {
  const base = { id: 'invoice', name: 'Invoice', icon: 'receipt', rank: 3, workflowId: 'wf-basic' };

  it('accepts a custom type with typed fields', () => {
    const def = ticketTypeDefSchema.parse({
      ...base,
      fields: [{ id: 'amount', name: 'Invoice amount', type: 'number' }],
    });
    expect(def.rank).toBe(3);
    expect(def.fields).toHaveLength(1);
  });

  it('refuses rank below 1 — rank 1 is the top of the ladder', () => {
    expect(() => ticketTypeDefSchema.parse({ ...base, rank: 0, fields: [] })).toThrow();
  });

  it('refuses duplicate field ids within one type', () => {
    expect(() =>
      ticketTypeDefSchema.parse({
        ...base,
        fields: [
          { id: 'amount', name: 'Amount', type: 'number' },
          { id: 'amount', name: 'Amount again', type: 'text' },
        ],
      }),
    ).toThrow();
  });

  it('refuses a custom field that shadows a built-in field id', () => {
    expect(() =>
      ticketTypeDefSchema.parse({ ...base, fields: [{ id: 'dueDate', name: 'Due', type: 'date' }] }),
    ).toThrow();
  });
});

describe('built-in seeds', () => {
  it('ships the ladder epic(1) story(2) task(3) sub-task(4)', () => {
    expect(BUILTIN_TICKET_TYPE_SEEDS.map((t) => [t.id, t.rank])).toEqual([
      ['epic', 1],
      ['story', 2],
      ['task', 3],
      ['sub-task', 4],
    ]);
    expect(SUB_TASK_TYPE_ID).toBe('sub-task');
    // DEEPEST_RANK is the rank the parent-required rule keys off (design
    // decision 9). It must equal the deepest rank in the shipped ladder — if a
    // future seed goes deeper, this assertion is the thing that says so.
    expect(DEEPEST_RANK).toBe(Math.max(...BUILTIN_TICKET_TYPE_SEEDS.map((t) => t.rank)));
    expect(DEEPEST_RANK).toBe(4);
    expect(BUILTIN_FIELD_IDS).toEqual(['title', 'description', 'dueDate', 'startDate']);
  });

  it('materialises full defs bound to a workspace default workflow', () => {
    const defs = builtinTicketTypeDefs('wf-default');
    expect(defs).toHaveLength(4);
    for (const def of defs) {
      expect(ticketTypeDefSchema.parse(def)).toEqual(def);
      expect(def.workflowId).toBe('wf-default');
      expect(def.fields).toEqual([]);
    }
  });
});

describe('dueDateValueSchema', () => {
  it('accepts a day with an optional note', () => {
    expect(dueDateValueSchema.parse({ date: '2026-08-30' })).toEqual({ date: '2026-08-30' });
    expect(dueDateValueSchema.parse({ date: '2026-08-30', note: 'GST filing' })).toEqual({
      date: '2026-08-30',
      note: 'GST filing',
    });
  });

  it('refuses a timestamp — a due date is a day, not a moment', () => {
    expect(() => dueDateValueSchema.parse({ date: '2026-08-30T10:00:00Z' })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/ticket-types.test.ts`
Expected: FAIL — cannot find module `./ticket-types`.

- [ ] **Step 3: Implement the module**

```ts
// packages/domain/src/ticket-types.ts
import { z } from 'zod';

export const CUSTOM_FIELD_KINDS = ['text', 'number', 'date', 'select', 'person'] as const;
export type CustomFieldKind = (typeof CUSTOM_FIELD_KINDS)[number];

export const BUILTIN_FIELD_IDS = ['title', 'description', 'dueDate', 'startDate'] as const;
export type BuiltinFieldId = (typeof BUILTIN_FIELD_IDS)[number];

export const customFieldDefSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(CUSTOM_FIELD_KINDS),
    options: z.array(z.string().min(1)).min(1).optional(),
  })
  .superRefine((field, ctx) => {
    if (field.type === 'select' && field.options === undefined) {
      ctx.addIssue({ code: 'custom', message: 'a select field needs options' });
    }
    if (field.type !== 'select' && field.options !== undefined) {
      ctx.addIssue({ code: 'custom', message: 'only select fields take options' });
    }
  });
export type CustomFieldDef = z.infer<typeof customFieldDefSchema>;

export const ticketTypeDefSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    icon: z.string().min(1),
    rank: z.number().int().min(1),
    workflowId: z.string().min(1),
    fields: z.array(customFieldDefSchema),
  })
  .superRefine((type, ctx) => {
    const seen = new Set<string>();
    for (const field of type.fields) {
      if (seen.has(field.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate field id "${field.id}"` });
      }
      seen.add(field.id);
      if ((BUILTIN_FIELD_IDS as readonly string[]).includes(field.id)) {
        ctx.addIssue({ code: 'custom', message: `field id "${field.id}" shadows a built-in field` });
      }
    }
  });
export type TicketTypeDef = z.infer<typeof ticketTypeDefSchema>;

export const SUB_TASK_TYPE_ID = 'sub-task';

/**
 * The floor of the hierarchy — the built-in sub-task's rank. A ticket whose
 * TYPE sits at this rank OR BELOW it (`rank >= DEEPEST_RANK`) requires a parent
 * (owner decision 2026-08-20): the requirement follows the rank, so a custom
 * type defined at rank 4 carries it exactly as `sub-task` does, and one defined
 * at rank 7 — smaller work still — carries it a fortiori.
 *
 * Deliberately a constant and NOT a maximum computed over the workspace's
 * defined types: a computed max would silently change the rule's meaning the
 * moment an admin defined a deeper type — a workspace that had defined nothing
 * below Task would suddenly find its tasks unable to sit at project root — and
 * a refusal that shifts underfoot is exactly what this product refuses to ship.
 * A fixed floor plus `>=` gives both properties at once: the meaning never
 * moves, and nothing slips underneath it.
 */
export const DEEPEST_RANK = 4;

export const BUILTIN_TICKET_TYPE_SEEDS = [
  { id: 'epic', name: 'Epic', icon: 'flag', rank: 1 },
  { id: 'story', name: 'Story', icon: 'book', rank: 2 },
  { id: 'task', name: 'Task', icon: 'check', rank: 3 },
  { id: SUB_TASK_TYPE_ID, name: 'Sub-task', icon: 'list', rank: 4 },
] as const;

/**
 * Built-ins are seed data: each workspace materialises them as ordinary
 * `ticket-type.defined` events at creation time (workspace-bootstrap plan),
 * bound to that workspace's default workflow. Type resolution is uniform —
 * every lookup reads event-defined types.
 */
export function builtinTicketTypeDefs(defaultWorkflowId: string): TicketTypeDef[] {
  return BUILTIN_TICKET_TYPE_SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    icon: seed.icon,
    rank: seed.rank,
    workflowId: defaultWorkflowId,
    fields: [],
  }));
}

/**
 * A day claim: { date, note? }, rendered with its author. Both day-shaped
 * built-ins use it — `dueDate` and `startDate` have identical value shapes, so
 * they share one schema rather than growing a second copy to drift from.
 *
 * The day is an INDIAN day (owner decision 2026-08-20, "time is Asia/Kolkata").
 * This plan stores and validates the claim and nothing else — but every
 * consumer that asks "is this overdue?", "is this due today?", "which calendar
 * cell is it?" or "how many days has this been in flight?" answers it with
 * `istDayOf`/`istDayBounds` from `@gisik-nokma/domain`, never with `new Date()`
 * locale math, never with the viewer's device, and never by dividing a
 * millisecond difference by 86_400_000. `IST_DAY_REGEX` is the same day shape
 * this schema pins; the regex is restated inline here only because the schema
 * must stay a self-contained Zod construct.
 */
export const dueDateValueSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a due date is a day in YYYY-MM-DD form'),
  note: z.string().optional(),
});
export type DueDateValue = z.infer<typeof dueDateValueSchema>;
```

- [ ] **Step 4: Export from the package index**

Add to `packages/domain/src/index.ts`:

```ts
export * from './ticket-types';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/ticket-types.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/ticket-types.ts packages/domain/src/ticket-types.test.ts packages/domain/src/index.ts
git commit -m "Ticket types: the built-in ladder as seed data, custom types validated before they exist — a select field cannot ship without its choices, and no custom field may shadow a built-in"
```

### Task 2: The ticket event vocabulary — ten payload schemas in the registry

**Files:**
- Create: `packages/domain/src/events/ticket-events.ts`
- Create: `packages/domain/src/testing.ts`
- Test: `packages/domain/src/events/ticket-events.test.ts`
- Modify: `packages/domain/src/index.ts` (import registrations, export schemas + `makeEnvelope`)

**Interfaces:**
- Consumes: `registerEventType({ type, version, payloadSchema })` and `parseEvent(raw): EventEnvelope` (Plan 1, see Coordination); `ticketTypeDefSchema` (Task 1).
- Produces:
  - Registered event types (all version 1): `ticket-type.defined`, `ticket.created`, `ticket.transitioned`, `ticket.assigned`, `ticket.collaborator_added`, `ticket.collaborator_removed`, `ticket.field_set`, `ticket.reparented`, `comment.added`, `attachment.added`.
  - Exported Zod schemas: `ticketCreatedPayload` (`{typeId, projectId, parentId: string|null, title}`), `ticketTransitionedPayload` (`{toStateId, comment?, evidenceAttachmentId?, cause?}`), `ticketAssignedPayload` (`{assigneeId: string|null}`), `ticketCollaboratorPayload` (`{userId}`), `ticketFieldSetPayload` (`{fieldId, value: unknown}`), `ticketReparentedPayload` (`{newParentId: string|null}`), `commentAddedPayload` (`{body: Record<string, unknown>}`), `attachmentAddedPayload` (`{attachmentId, filename, mime, size}`), `ulidString` (Zod ULID string).
  - `makeEnvelope(partial: Partial<EventEnvelope> & Pick<EventEnvelope, 'type' | 'entity' | 'payload'>): EventEnvelope` — test builder used by every later task's tests.

**Coordination note (stated once):** Plan 2 needed `ticket.transitioned` to exist for its own engine tests and may already have registered it. Keep exactly ONE registration, in this file, with the payload schema below — it is the contracted shape (`toStateId, comment?, evidenceAttachmentId?, cause?`). Delete Plan 2's provisional registration if one exists. The optional `cause` (`{ kind: 'reopened-for-child', childTicketId }`, shape defined by Plan 2's schema per the owner decision of 2026-08-20) is opaque reopen provenance: `proj_tickets`' `transitions` log keeps it out — the log shape `{toStateId, actorId, seq}` is unchanged; cause lives in the event payload, and the history endpoint renders it.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/events/ticket-events.test.ts
import { describe, expect, it } from 'vitest';
import { parseEvent } from '../index';
import { makeEnvelope } from '../testing';

const TICKET = '01J9GTKA000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const PARENT = '01J9GPAR000000000000000000';
const ATTACHMENT = '01J9GATT000000000000000000';

function roundTrips(type: string, entityKind: 'ticket' | 'ticket-type', payload: unknown): void {
  const env = makeEnvelope({ type, entity: { kind: entityKind, id: TICKET }, payload });
  expect(parseEvent(env)).toEqual(env);
}

describe('ticket event vocabulary', () => {
  it('accepts every event in the vocabulary', () => {
    roundTrips('ticket-type.defined', 'ticket-type', {
      id: 'invoice', name: 'Invoice', icon: 'receipt', rank: 3, workflowId: 'wf-basic',
      fields: [{ id: 'amount', name: 'Invoice amount', type: 'number' }],
    });
    roundTrips('ticket.created', 'ticket', { typeId: 'task', projectId: PROJECT, parentId: PARENT, title: 'File the GST return' });
    roundTrips('ticket.created', 'ticket', { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Root task' });
    roundTrips('ticket.transitioned', 'ticket', { toStateId: 'done' });
    roundTrips('ticket.transitioned', 'ticket', { toStateId: 'done', comment: 'filed', evidenceAttachmentId: ATTACHMENT });
    roundTrips('ticket.transitioned', 'ticket', { toStateId: 'todo', cause: { kind: 'reopened-for-child', childTicketId: PARENT } });
    roundTrips('ticket.assigned', 'ticket', { assigneeId: 'user-anselma' });
    roundTrips('ticket.assigned', 'ticket', { assigneeId: null });
    roundTrips('ticket.collaborator_added', 'ticket', { userId: 'user-anselma' });
    roundTrips('ticket.collaborator_removed', 'ticket', { userId: 'user-anselma' });
    roundTrips('ticket.field_set', 'ticket', { fieldId: 'dueDate', value: { date: '2026-08-30', note: 'GST' } });
    roundTrips('ticket.field_set', 'ticket', { fieldId: 'amount', value: null });
    roundTrips('ticket.reparented', 'ticket', { newParentId: PARENT });
    roundTrips('ticket.reparented', 'ticket', { newParentId: null });
    roundTrips('comment.added', 'ticket', { body: { type: 'doc', content: [] } });
    roundTrips('attachment.added', 'ticket', { attachmentId: ATTACHMENT, filename: 'gst-receipt.pdf', mime: 'application/pdf', size: 48211 });
  });

  it('refuses a ticket.created without a title', () => {
    expect(() =>
      parseEvent(makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: TICKET },
        payload: { typeId: 'task', projectId: PROJECT, parentId: null } })),
    ).toThrow();
  });

  it('refuses a parent id that is not a ULID', () => {
    expect(() =>
      parseEvent(makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: TICKET },
        payload: { typeId: 'task', projectId: PROJECT, parentId: 'not-a-ulid', title: 'x' } })),
    ).toThrow();
  });

  it('refuses a comment whose body is not a document object', () => {
    expect(() =>
      parseEvent(makeEnvelope({ type: 'comment.added', entity: { kind: 'ticket', id: TICKET },
        payload: { body: 'plain string' } })),
    ).toThrow();
  });

  it('refuses an attachment with a negative size', () => {
    expect(() =>
      parseEvent(makeEnvelope({ type: 'attachment.added', entity: { kind: 'ticket', id: TICKET },
        payload: { attachmentId: ATTACHMENT, filename: 'x.pdf', mime: 'application/pdf', size: -1 } })),
    ).toThrow();
  });

  it('refuses an unknown event type — the ledger accepts only what it can replay', () => {
    expect(() =>
      parseEvent(makeEnvelope({ type: 'ticket.renamed', entity: { kind: 'ticket', id: TICKET }, payload: {} })),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/events/ticket-events.test.ts`
Expected: FAIL — cannot find module `../testing` (and unknown event types once it can).

- [ ] **Step 3: Implement the test envelope builder**

```ts
// packages/domain/src/testing.ts
import { ulid } from 'ulidx';
import type { EventEnvelope } from './envelope';

/** Test-only envelope builder: valid defaults, override what the test cares about. */
export function makeEnvelope(
  partial: Partial<EventEnvelope> & Pick<EventEnvelope, 'type' | 'entity' | 'payload'>,
): EventEnvelope {
  return {
    id: ulid(),
    workspaceId: '01J9GWS0000000000000000000',
    version: 1,
    actorId: 'user-kiro',
    origin: 'server',
    clientTime: '2026-08-20T09:00:00.000Z',
    serverTime: '2026-08-20T09:00:00.100Z',
    seq: 1,
    ...partial,
  };
}
```

- [ ] **Step 4: Implement the payload schemas and registrations**

```ts
// packages/domain/src/events/ticket-events.ts
import { z } from 'zod';
import { registerEventType } from '../registry';
import { ticketTypeDefSchema } from '../ticket-types';

/** Crockford base32, 26 chars, no I/L/O/U. */
export const ulidString = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'must be a ULID');

export const ticketCreatedPayload = z.object({
  typeId: z.string().min(1),
  projectId: ulidString,
  parentId: ulidString.nullable(),
  title: z.string().min(1),
});

export const ticketTransitionedPayload = z.object({
  toStateId: z.string().min(1),
  comment: z.string().min(1).optional(),
  evidenceAttachmentId: ulidString.optional(),
  // Owner decision (2026-08-20): reopen provenance, kept verbatim in the
  // payload so history can render "reopened — live work added"; no rule reads
  // it, and proj_tickets' transitions log does not carry it.
  cause: z.object({ kind: z.literal('reopened-for-child'), childTicketId: ulidString }).optional(),
});

export const ticketAssignedPayload = z.object({ assigneeId: z.string().min(1).nullable() });

export const ticketCollaboratorPayload = z.object({ userId: z.string().min(1) });

/**
 * Shape-only at the door: {fieldId, value}. Semantics (does the field exist,
 * does the value fit its kind) are the engine's job — see checkTicketFieldSet.
 * value: null is the clearing claim; built-ins title/description/dueDate/startDate ride
 * this same event, and a due date value is always { date, note? } — a claim.
 */
export const ticketFieldSetPayload = z.object({ fieldId: z.string().min(1), value: z.unknown() });

export const ticketReparentedPayload = z.object({ newParentId: ulidString.nullable() });

/** Body is opaque structured-doc JSON — the editor plan owns its schema. */
export const commentAddedPayload = z.object({ body: z.record(z.string(), z.unknown()) });

/** Metadata only — storage/upload is a later plan. */
export const attachmentAddedPayload = z.object({
  attachmentId: ulidString,
  filename: z.string().min(1),
  mime: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/, 'must be a MIME type'),
  size: z.number().int().min(0),
});

registerEventType({ type: 'ticket-type.defined', version: 1, payloadSchema: ticketTypeDefSchema });
registerEventType({ type: 'ticket.created', version: 1, payloadSchema: ticketCreatedPayload });
registerEventType({ type: 'ticket.transitioned', version: 1, payloadSchema: ticketTransitionedPayload });
registerEventType({ type: 'ticket.assigned', version: 1, payloadSchema: ticketAssignedPayload });
registerEventType({ type: 'ticket.collaborator_added', version: 1, payloadSchema: ticketCollaboratorPayload });
registerEventType({ type: 'ticket.collaborator_removed', version: 1, payloadSchema: ticketCollaboratorPayload });
registerEventType({ type: 'ticket.field_set', version: 1, payloadSchema: ticketFieldSetPayload });
registerEventType({ type: 'ticket.reparented', version: 1, payloadSchema: ticketReparentedPayload });
registerEventType({ type: 'comment.added', version: 1, payloadSchema: commentAddedPayload });
registerEventType({ type: 'attachment.added', version: 1, payloadSchema: attachmentAddedPayload });
```

Add to `packages/domain/src/index.ts` (registrations run on package import; schemas and the test builder are exported):

```ts
export * from './events/ticket-events';
export { makeEnvelope } from './testing';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/events/ticket-events.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Run the whole domain suite — Plan 1's and Plan 2's registrations must still be green**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run`
Expected: PASS. If a duplicate `ticket.transitioned` registration from Plan 2 errors here, remove Plan 2's provisional one (see the coordination note above).

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/events/ticket-events.ts packages/domain/src/events/ticket-events.test.ts packages/domain/src/testing.ts packages/domain/src/index.ts
git commit -m "The ticket event vocabulary: ten claim shapes the ledger will accept, everything else refused at the door — field values stay opaque here because their meaning belongs to the rule engine"
```

### Task 3: TicketState and the pure reducer — one fold, shared by server and fixtures

**Files:**
- Create: `packages/domain/src/workflow-helpers.ts`
- Create: `packages/domain/src/ticket-state.ts`
- Test: `packages/domain/src/ticket-state.test.ts`
- Modify: `packages/domain/src/index.ts` (add exports)

**Interfaces:**
- Consumes: `TicketTypeDef` (Task 1); payload schemas (Task 2); `WorkflowDef`, `StateCategory` from Plan 2 (packages/domain); `makeEnvelope` (Task 2).
- Produces (echoed verbatim where consumed — Tasks 4, 10, 12):

```ts
// FieldClaim and TicketState are DEFINED by Plan 2's Task 2 in
// packages/domain/src/entity-state.ts (coordination doc §4) and imported
// here — this plan's reducer produces the type, never redefines it.
// The merged shape, echoed for reference:
type FieldClaim = { value: unknown; actorId: string; clientTime: string; serverTime: string };

type TicketState = {
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
  transitions: { toStateId: string; actorId: string; seq: number }[];
};

export type TicketStateDeps = {
  getTicketType(typeId: string): TicketTypeDef | undefined;
  getWorkflow(workflowId: string): WorkflowDef | undefined;
};

export const TICKET_EVENT_TYPES: readonly string[];
export function applyTicketEvent(state: TicketState | undefined, env: EventEnvelope, deps: TicketStateDeps): TicketState;
export function stateCategoryOf(def: WorkflowDef, stateId: string): StateCategory | undefined;
```

**Design note:** the reducer folds only *accepted* events (projections consume the ledger; fixtures fold `priorEvents`). It therefore **throws** — fails loudly, per the workspace error-handling standard — on states the engine is contracted to refuse at the door (event for a never-created ticket, unknown type, unresolvable workflow): reaching them in replay means ledger integrity is broken, and degrading silently would be a lie. If Plan 2 already ships an equivalent of `stateCategoryOf`, re-export theirs from `workflow-helpers.ts` instead of duplicating.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/ticket-state.test.ts
import { describe, expect, it } from 'vitest';
import type { WorkflowDef } from './index';
import type { TicketState } from './entity-state';
import { applyTicketEvent, stateCategoryOf, type TicketStateDeps } from './ticket-state';
import type { TicketTypeDef } from './ticket-types';
import { makeEnvelope } from './testing';

const PROJECT = '01J9GPRJ000000000000000000';
const TICKET = '01J9GTKA000000000000000000';
const PARENT = '01J9GPAR000000000000000000';

const WF: WorkflowDef = {
  id: 'wf-basic', version: 1, name: 'Basic', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'todo', rules: [] },
    { from: '*', to: 'doing', rules: [] },
    { from: '*', to: 'done', rules: [] },
  ],
};

const TASK_TYPE: TicketTypeDef = { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] };

const deps: TicketStateDeps = {
  getTicketType: (id) => (id === 'task' ? TASK_TYPE : undefined),
  getWorkflow: (id) => (id === 'wf-basic' ? WF : undefined),
};

function createdState(): TicketState {
  return applyTicketEvent(
    undefined,
    makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: TICKET },
      payload: { typeId: 'task', projectId: PROJECT, parentId: PARENT, title: 'File the GST return' },
      actorId: 'user-kiro',
      clientTime: '2026-08-20T09:00:00.000Z',
      serverTime: '2026-08-20T09:00:00.100Z',
    }),
    deps,
  );
}

describe('applyTicketEvent', () => {
  it('creation enters the workflow initial state and records the title as an attributed claim', () => {
    const state = createdState();
    expect(state).toEqual({
      kind: 'ticket',
      id: TICKET, workspaceId: '01J9GWS0000000000000000000', projectId: PROJECT,
      typeId: 'task', parentId: PARENT, workflowId: 'wf-basic', workflowVersion: 1,
      stateId: 'todo', stateCategory: 'open',
      assigneeId: null, collaboratorIds: [],
      transitions: [],
      fields: {
        title: { value: 'File the GST return', actorId: 'user-kiro',
          clientTime: '2026-08-20T09:00:00.000Z', serverTime: '2026-08-20T09:00:00.100Z' },
      },
    });
  });

  it('transition moves state and re-derives the category from the workflow', () => {
    const state = applyTicketEvent(
      createdState(),
      makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: TICKET }, payload: { toStateId: 'done' } }),
      deps,
    );
    expect(state.stateId).toBe('done');
    expect(state.stateCategory).toBe('terminal');
    expect(state.transitions).toEqual([{ toStateId: 'done', actorId: 'user-kiro', seq: 1 }]);
  });

  it('field_set preserves provenance per field — who claimed it, and both times', () => {
    const state = applyTicketEvent(
      createdState(),
      makeEnvelope({
        type: 'ticket.field_set', entity: { kind: 'ticket', id: TICKET },
        payload: { fieldId: 'dueDate', value: { date: '2026-08-30', note: 'GST' } },
        actorId: 'user-anselma', clientTime: '2026-08-21T08:00:00.000Z', serverTime: '2026-08-21T08:00:00.900Z',
      }),
      deps,
    );
    expect(state.fields.dueDate).toEqual({
      value: { date: '2026-08-30', note: 'GST' },
      actorId: 'user-anselma',
      clientTime: '2026-08-21T08:00:00.000Z',
      serverTime: '2026-08-21T08:00:00.900Z',
    });
    expect(state.fields.title.value).toBe('File the GST return');
  });

  it('clearing a field with null keeps the provenance of the clearing claim', () => {
    let state = createdState();
    state = applyTicketEvent(
      state,
      makeEnvelope({ type: 'ticket.field_set', entity: { kind: 'ticket', id: TICKET },
        payload: { fieldId: 'dueDate', value: { date: '2026-08-30' } } }),
      deps,
    );
    state = applyTicketEvent(
      state,
      makeEnvelope({ type: 'ticket.field_set', entity: { kind: 'ticket', id: TICKET },
        payload: { fieldId: 'dueDate', value: null }, actorId: 'user-anselma' }),
      deps,
    );
    expect(state.fields.dueDate.value).toBeNull();
    expect(state.fields.dueDate.actorId).toBe('user-anselma');
  });

  it('assignment and unassignment', () => {
    let state = createdState();
    state = applyTicketEvent(state, makeEnvelope({ type: 'ticket.assigned', entity: { kind: 'ticket', id: TICKET }, payload: { assigneeId: 'user-anselma' } }), deps);
    expect(state.assigneeId).toBe('user-anselma');
    state = applyTicketEvent(state, makeEnvelope({ type: 'ticket.assigned', entity: { kind: 'ticket', id: TICKET }, payload: { assigneeId: null } }), deps);
    expect(state.assigneeId).toBeNull();
  });

  it('collaborators deduplicate on add and no-op on removing a non-member', () => {
    let state = createdState();
    const add = () => makeEnvelope({ type: 'ticket.collaborator_added', entity: { kind: 'ticket', id: TICKET }, payload: { userId: 'user-anselma' } });
    state = applyTicketEvent(state, add(), deps);
    state = applyTicketEvent(state, add(), deps);
    expect(state.collaboratorIds).toEqual(['user-anselma']);
    state = applyTicketEvent(
      state,
      makeEnvelope({ type: 'ticket.collaborator_removed', entity: { kind: 'ticket', id: TICKET }, payload: { userId: 'user-nobody' } }),
      deps,
    );
    expect(state.collaboratorIds).toEqual(['user-anselma']);
  });

  it('reparent moves the pointer; comments and attachments leave head state untouched', () => {
    let state = createdState();
    state = applyTicketEvent(state, makeEnvelope({ type: 'ticket.reparented', entity: { kind: 'ticket', id: TICKET }, payload: { newParentId: null } }), deps);
    expect(state.parentId).toBeNull();
    const before = state;
    state = applyTicketEvent(state, makeEnvelope({ type: 'comment.added', entity: { kind: 'ticket', id: TICKET }, payload: { body: { type: 'doc', content: [] } } }), deps);
    expect(state).toEqual(before);
  });

  it('throws loudly on replay-integrity breaks the engine is contracted to refuse', () => {
    expect(() =>
      applyTicketEvent(undefined, makeEnvelope({ type: 'ticket.assigned', entity: { kind: 'ticket', id: TICKET }, payload: { assigneeId: null } }), deps),
    ).toThrow(/never created/);
    expect(() =>
      applyTicketEvent(undefined, makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: TICKET },
        payload: { typeId: 'ghost', projectId: PROJECT, parentId: null, title: 'x' } }), deps),
    ).toThrow(/unknown ticket type/);
  });
});

describe('stateCategoryOf', () => {
  it('maps a state id to its category, undefined when absent', () => {
    expect(stateCategoryOf(WF, 'doing')).toBe('active');
    expect(stateCategoryOf(WF, 'ghost')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/ticket-state.test.ts`
Expected: FAIL — cannot find module `./ticket-state`.

- [ ] **Step 3: Implement the workflow helper**

```ts
// packages/domain/src/workflow-helpers.ts
import type { StateCategory, WorkflowDef } from './workflow';

export function stateCategoryOf(def: WorkflowDef, stateId: string): StateCategory | undefined {
  return def.states.find((s) => s.id === stateId)?.category;
}
```

- [ ] **Step 4: Implement the reducer**

```ts
// packages/domain/src/ticket-state.ts
import type { EventEnvelope } from './envelope';
// FieldClaim and TicketState are defined by Plan 2's Task 2 in
// entity-state.ts (coordination doc §4): this reducer produces the type, it
// does not redefine it. Deliberately NOT re-exported from this module — the
// package index already exports entity-state, and a second star-export of
// the same names would collide.
import type { FieldClaim, TicketState } from './entity-state';
import {
  ticketAssignedPayload, ticketCollaboratorPayload, ticketCreatedPayload,
  ticketFieldSetPayload, ticketReparentedPayload, ticketTransitionedPayload,
} from './events/ticket-events';
import type { TicketTypeDef } from './ticket-types';
import type { WorkflowDef } from './workflow';
import { stateCategoryOf } from './workflow-helpers';

export type TicketStateDeps = {
  getTicketType(typeId: string): TicketTypeDef | undefined;
  getWorkflow(workflowId: string): WorkflowDef | undefined;
};

export const TICKET_EVENT_TYPES = [
  'ticket.created', 'ticket.transitioned', 'ticket.assigned',
  'ticket.collaborator_added', 'ticket.collaborator_removed',
  'ticket.field_set', 'ticket.reparented',
  'comment.added', 'attachment.added',
] as const;

function claim(value: unknown, env: EventEnvelope): FieldClaim {
  return { value, actorId: env.actorId, clientTime: env.clientTime, serverTime: env.serverTime };
}

/**
 * Pure fold of one ACCEPTED ticket event into head state. Both the
 * proj_tickets projection and the fixture suite's in-memory context use this
 * one function, so client and server cannot quietly disagree. Throws on
 * inputs the engine is contracted to refuse at the door — reaching them here
 * means ledger integrity is broken, and that must fail loudly.
 */
export function applyTicketEvent(
  state: TicketState | undefined,
  env: EventEnvelope,
  deps: TicketStateDeps,
): TicketState {
  if (env.type === 'ticket.created') {
    const p = ticketCreatedPayload.parse(env.payload);
    const type = deps.getTicketType(p.typeId);
    if (!type) {
      throw new Error(`applyTicketEvent: unknown ticket type "${p.typeId}" — the engine must refuse ticket.created before it reaches a projection`);
    }
    const wf = deps.getWorkflow(type.workflowId);
    if (!wf) {
      throw new Error(`applyTicketEvent: workflow "${type.workflowId}" is not defined — the engine must refuse ticket.created before it reaches a projection`);
    }
    const category = stateCategoryOf(wf, wf.initialStateId);
    if (!category) {
      throw new Error(`applyTicketEvent: workflow "${wf.id}" has no state "${wf.initialStateId}"`);
    }
    return {
      kind: 'ticket',
      id: env.entity.id,
      workspaceId: env.workspaceId,
      projectId: p.projectId,
      typeId: p.typeId,
      parentId: p.parentId,
      workflowId: type.workflowId,
      workflowVersion: wf.version,
      stateId: wf.initialStateId,
      stateCategory: category,
      assigneeId: null,
      collaboratorIds: [],
      fields: { title: claim(p.title, env) },
      transitions: [],
    };
  }

  if (!state) {
    throw new Error(`applyTicketEvent: ${env.type} for ticket ${env.entity.id} that was never created`);
  }

  switch (env.type) {
    case 'ticket.transitioned': {
      const p = ticketTransitionedPayload.parse(env.payload);
      const wf = deps.getWorkflow(state.workflowId);
      if (!wf) {
        throw new Error(`applyTicketEvent: workflow "${state.workflowId}" vanished — replay integrity is broken`);
      }
      const category = stateCategoryOf(wf, p.toStateId);
      if (!category) {
        throw new Error(`applyTicketEvent: workflow "${wf.id}" has no state "${p.toStateId}"`);
      }
      return {
        ...state,
        stateId: p.toStateId,
        stateCategory: category,
        workflowVersion: wf.version,
        transitions: [...state.transitions, { toStateId: p.toStateId, actorId: env.actorId, seq: env.seq }],
      };
    }
    case 'ticket.assigned': {
      const p = ticketAssignedPayload.parse(env.payload);
      return { ...state, assigneeId: p.assigneeId };
    }
    case 'ticket.collaborator_added': {
      const p = ticketCollaboratorPayload.parse(env.payload);
      return state.collaboratorIds.includes(p.userId)
        ? state
        : { ...state, collaboratorIds: [...state.collaboratorIds, p.userId] };
    }
    case 'ticket.collaborator_removed': {
      const p = ticketCollaboratorPayload.parse(env.payload);
      return { ...state, collaboratorIds: state.collaboratorIds.filter((id) => id !== p.userId) };
    }
    case 'ticket.field_set': {
      const p = ticketFieldSetPayload.parse(env.payload);
      return { ...state, fields: { ...state.fields, [p.fieldId]: claim(p.value ?? null, env) } };
    }
    case 'ticket.reparented': {
      const p = ticketReparentedPayload.parse(env.payload);
      return { ...state, parentId: p.newParentId };
    }
    case 'comment.added':
    case 'attachment.added':
      return state;
    default:
      throw new Error(`applyTicketEvent: not a ticket event: ${env.type}`);
  }
}
```

- [ ] **Step 5: Export from the package index**

Add to `packages/domain/src/index.ts`:

```ts
export * from './ticket-state';
export * from './workflow-helpers';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/ticket-state.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/ticket-state.ts packages/domain/src/ticket-state.test.ts packages/domain/src/workflow-helpers.ts packages/domain/src/index.ts
git commit -m "One reducer for ticket head state, shared by projection and fixtures — every field carries its claimant and both clocks, and replay-integrity breaks throw instead of degrading into quiet fiction"
```

### Task 4: The in-memory EngineContext — fixtures and unit tests see tickets the way the server does

**Files:**
- Create: `packages/rule-engine/src/memory-context.ts`
- Test: `packages/rule-engine/src/memory-context.test.ts`
- Modify: `packages/rule-engine/src/index.ts` (export `buildMemoryContext`)

**Interfaces:**
- Consumes: `applyTicketEvent`, `TicketState`, `TicketStateDeps`, `TICKET_EVENT_TYPES`, `TicketTypeDef`, `ticketTypeDefSchema`, `makeEnvelope` (Tasks 1–3, `@gisik-nokma/domain`); `WorkflowDef` (Plan 2); `EngineContext` (Plan 2, `@gisik-nokma/rule-engine`).
- Produces:

```ts
export type MemoryContext = EngineContext & {
  tickets: Map<string, TicketState>;
  ticketTypes: Map<string, TicketTypeDef>;
  workflows: Map<string, WorkflowDef>;
};
export function buildMemoryContext(seedWorkflows: WorkflowDef[], events: EventEnvelope[]): MemoryContext;
```

**Semantics (load-bearing):** events passed in are folded **without evaluation** — they are the already-accepted past. Only a candidate event goes through `evaluateEvent`, against the context this builder returns. `getChildrenStates` returns **direct** children only. `ticket-type.defined` folds last-definition-wins (types are events; a later definition replaces the earlier one — this is what makes rank re-definition, and therefore the cycle defect, reachable).

- [ ] **Step 1: Write the failing test**

```ts
// packages/rule-engine/src/memory-context.test.ts
import { describe, expect, it } from 'vitest';
import type { TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from './memory-context';

const PROJECT = '01J9GPRJ000000000000000000';
const PARENT = '01J9GPAR000000000000000000';
const CHILD = '01J9GCHA000000000000000000';
const GRANDCHILD = '01J9GCHB000000000000000000';

const WF: WorkflowDef = {
  id: 'wf-basic', version: 1, name: 'Basic', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'todo', rules: [] },
    { from: '*', to: 'doing', rules: [] },
    { from: '*', to: 'done', rules: [] },
  ],
};

function typeDefined(def: TicketTypeDef) {
  return makeEnvelope({ type: 'ticket-type.defined', entity: { kind: 'ticket-type', id: def.id }, payload: def });
}
function created(id: string, typeId: string, parentId: string | null) {
  return makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id },
    payload: { typeId, projectId: PROJECT, parentId, title: `t-${id.slice(0, 8)}` } });
}

const EPIC: TicketTypeDef = { id: 'epic', name: 'Epic', icon: 'flag', rank: 1, workflowId: 'wf-basic', fields: [] };
const STORY: TicketTypeDef = { id: 'story', name: 'Story', icon: 'book', rank: 2, workflowId: 'wf-basic', fields: [] };
const TASK: TicketTypeDef = { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] };

describe('buildMemoryContext', () => {
  it('folds prior events into ticket states reachable via getEntityState', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(TASK),
      created(CHILD, 'task', null),
      makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: CHILD }, payload: { toStateId: 'doing' } }),
    ]);
    const state = (await ctx.getEntityState('ticket', CHILD)) as { stateId: string; stateCategory: string };
    expect(state.stateId).toBe('doing');
    expect(state.stateCategory).toBe('active');
  });

  it('getChildrenStates returns DIRECT children only — a grandchild is not a child', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(EPIC), typeDefined(STORY), typeDefined(TASK),
      created(PARENT, 'epic', null),
      created(CHILD, 'story', PARENT),
      created(GRANDCHILD, 'task', CHILD),
    ]);
    const children = await ctx.getChildrenStates(PARENT);
    expect(children.map((c) => c.id)).toEqual([CHILD]);
  });

  it('resolves ticket types and workflows, last definition wins', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined({ ...TASK, rank: 3 }),
      typeDefined({ ...TASK, rank: 5 }),
    ]);
    const def = (await ctx.getEntityState('ticket-type', 'task')) as { rank: number };
    expect(def.rank).toBe(5);
    expect(await ctx.getWorkflowDef('wf-basic')).toEqual(WF);
    expect(await ctx.getWorkflowDef('wf-ghost')).toBeNull();
  });

  it('folds workflow.defined events from priorEvents alongside seeds', async () => {
    const wf2: WorkflowDef = { ...WF, id: 'wf-two' };
    const ctx = buildMemoryContext([WF], [
      makeEnvelope({ type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf-two' }, payload: wf2 }),
    ]);
    expect(await ctx.getWorkflowDef('wf-two')).toEqual(wf2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/memory-context.test.ts`
Expected: FAIL — cannot find module `./memory-context`.

- [ ] **Step 3: Implement the builder**

```ts
// packages/rule-engine/src/memory-context.ts
import type { EventEnvelope, TicketState, TicketStateDeps, TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain';
import { TICKET_EVENT_TYPES, applyTicketEvent, ticketTypeDefSchema } from '@gisik-nokma/domain';
import type { EngineContext } from './engine-context';

export type MemoryContext = EngineContext & {
  tickets: Map<string, TicketState>;
  ticketTypes: Map<string, TicketTypeDef>;
  workflows: Map<string, WorkflowDef>;
};

/**
 * Folds already-accepted events into an in-memory EngineContext. No
 * evaluation happens here: these events are the past. Only a candidate event
 * is evaluated, by the caller, against the context this returns.
 */
export function buildMemoryContext(seedWorkflows: WorkflowDef[], events: EventEnvelope[]): MemoryContext {
  const workflows = new Map<string, WorkflowDef>(seedWorkflows.map((wf) => [wf.id, wf]));
  const ticketTypes = new Map<string, TicketTypeDef>();
  const tickets = new Map<string, TicketState>();

  const deps: TicketStateDeps = {
    getTicketType: (id) => ticketTypes.get(id),
    getWorkflow: (id) => workflows.get(id),
  };

  for (const env of events) {
    if (env.type === 'workflow.defined') {
      const def = env.payload as WorkflowDef;
      workflows.set(def.id, def);
    } else if (env.type === 'ticket-type.defined') {
      const def = ticketTypeDefSchema.parse(env.payload);
      ticketTypes.set(def.id, def); // last definition wins — types are events
    } else if ((TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) {
      tickets.set(env.entity.id, applyTicketEvent(tickets.get(env.entity.id), env, deps));
    }
    // Other event kinds (membership, visibility, …) belong to other plans and
    // do not shape ticket state.
  }

  return {
    tickets,
    ticketTypes,
    workflows,
    getEntityState: async (kind, id) => {
      if (kind === 'ticket') return tickets.get(id) ?? null;
      if (kind === 'ticket-type') return ticketTypes.get(id) ?? null;
      return null;
    },
    getChildrenStates: async (ticketId) =>
      [...tickets.values()].filter((t) => t.parentId === ticketId),
    getWorkflowDef: async (workflowId) => workflows.get(workflowId) ?? null,
  };
}
```

Export it — add to `packages/rule-engine/src/index.ts`:

```ts
export { buildMemoryContext, type MemoryContext } from './memory-context';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/memory-context.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/rule-engine/src/memory-context.ts packages/rule-engine/src/memory-context.test.ts packages/rule-engine/src/index.ts
git commit -m "An in-memory EngineContext built by the same reducer the server uses — the fixture suite now sees tickets exactly as production does, direct children only, last type definition winning"
```

### Task 5: Hierarchy checks for ticket.created — rank, the deepest-rank parent rule, cross-project, and the forced preconditions

**Files:**
- Create: `packages/rule-engine/src/checks/refusals.ts`
- Create: `packages/rule-engine/src/checks/context-helpers.ts`
- Create: `packages/rule-engine/src/checks/test-support.ts`
- Create: `packages/rule-engine/src/checks/hierarchy.ts`
- Test: `packages/rule-engine/src/checks/hierarchy.test.ts`
- Modify: `packages/rule-engine/src/evaluate.ts` (add the `ticket.created` case to the dispatch)

**Interfaces:**
- Consumes: `EngineContext`, `EngineVerdict`, `evaluateEvent` dispatch (Plan 2); `buildMemoryContext` (Task 4); `ticketCreatedPayload`, `TicketState`, `TicketTypeDef`, `SUB_TASK_TYPE_ID`, `DEEPEST_RANK`, `makeEnvelope` (`@gisik-nokma/domain`).
- Produces:
  - `checkTicketCreated(env: EventEnvelope, ctx: EngineContext): Promise<EngineVerdict>`
  - `REFUSALS` (const map of the fixed reason strings), `rankRefusal(childTypeName, parentTypeName): string`, `deepestRankParentRefusal(typeName): string`, `parentTerminalRefusal(parentTitle, stateName, move: 'add' | 'move'): string`, `fieldKindRefusal(fieldName, needsPhrase): string`, `refuse(rule, reason): EngineVerdict`, `ACCEPT: EngineVerdict`
  - `getTicketState(ctx, id): Promise<TicketState | null>`, `getTicketTypeDef(ctx, id): Promise<TicketTypeDef | null>` (typed wrappers over `ctx.getEntityState`)
  - test-support builders shared by Tasks 6–7: `WS`, `PROJECT`, `PROJECT_B`, `WF`, `EPIC`, `STORY`, `TASK`, `SUBTASK`, `typeDefined(def)`, `created(id, typeId, parentId, projectId?)`

- [ ] **Step 1: Write the shared test-support module** (infrastructure the failing tests import; no behavior of its own)

```ts
// packages/rule-engine/src/checks/test-support.ts
import type { EventEnvelope, TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';

export const WS = '01J9GWS0000000000000000000';
export const PROJECT = '01J9GPRJ000000000000000000';
export const PROJECT_B = '01J9GPRB000000000000000000';

export const WF: WorkflowDef = {
  id: 'wf-basic', version: 1, name: 'Basic', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'todo', rules: [] },
    { from: '*', to: 'doing', rules: [] },
    { from: '*', to: 'done', rules: [] },
  ],
};

export const EPIC: TicketTypeDef = { id: 'epic', name: 'Epic', icon: 'flag', rank: 1, workflowId: 'wf-basic', fields: [] };
export const STORY: TicketTypeDef = { id: 'story', name: 'Story', icon: 'book', rank: 2, workflowId: 'wf-basic', fields: [] };
export const TASK: TicketTypeDef = { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] };
export const SUBTASK: TicketTypeDef = { id: 'sub-task', name: 'Sub-task', icon: 'list', rank: 4, workflowId: 'wf-basic', fields: [] };

export function typeDefined(def: TicketTypeDef): EventEnvelope {
  return makeEnvelope({ type: 'ticket-type.defined', entity: { kind: 'ticket-type', id: def.id }, payload: def, workspaceId: WS });
}

export function created(id: string, typeId: string, parentId: string | null, projectId: string = PROJECT): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.created', entity: { kind: 'ticket', id }, workspaceId: WS,
    payload: { typeId, projectId, parentId, title: `ticket ${id.slice(4, 8)}` },
  });
}
```

- [ ] **Step 2: Write the failing tests — every refusal is a planted defect with an exact literal reason**

```ts
// packages/rule-engine/src/checks/hierarchy.test.ts
import { describe, expect, it } from 'vitest';
import { buildMemoryContext } from '../memory-context';
import { checkTicketCreated } from './hierarchy';
import { EPIC, PROJECT, PROJECT_B, STORY, SUBTASK, TASK, WF, created, typeDefined } from './test-support';

const PARENT = '01J9GPAR000000000000000000';
const NEW = '01J9GNEW000000000000000000';
const GHOST = '01J9GGHT000000000000000000';

const baseCtx = () =>
  buildMemoryContext([WF], [
    typeDefined(EPIC), typeDefined(STORY), typeDefined(TASK), typeDefined(SUBTASK),
    created(PARENT, 'story', null),
  ]);

describe('checkTicketCreated', () => {
  it('accepts a task under a story, and a task at project root', async () => {
    expect(await checkTicketCreated(created(NEW, 'task', PARENT), baseCtx())).toEqual({ refused: false });
    expect(await checkTicketCreated(created(NEW, 'task', null), baseCtx())).toEqual({ refused: false });
  });

  it('planted defect: an epic under a story — rank must exceed the parent rank', async () => {
    expect(await checkTicketCreated(created(NEW, 'epic', PARENT), baseCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.rank',
      reason: '"Epic" cannot go under "Story": a ticket\'s parent must be a bigger kind of work.',
    });
  });

  it('planted defect: equal rank cannot nest either', async () => {
    const ctx = buildMemoryContext([WF], [typeDefined(STORY), created(PARENT, 'story', null)]);
    expect(await checkTicketCreated(created(NEW, 'story', PARENT), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.rank',
      reason: '"Story" cannot go under "Story": a ticket\'s parent must be a bigger kind of work.',
    });
  });

  it('planted defect: a sub-task without a parent — the deepest rank always belongs to something', async () => {
    expect(await checkTicketCreated(created(NEW, 'sub-task', null), baseCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.deepest-rank-parent-required',
      reason: '"Sub-task" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.',
    });
  });

  it('planted defect: a parent from another project', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(STORY), typeDefined(TASK),
      created(PARENT, 'story', null, PROJECT_B),
    ]);
    expect(await checkTicketCreated(created(NEW, 'task', PARENT, PROJECT), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.cross-project',
      reason: 'The parent is in a different project. Pick a parent from the same project.',
    });
  });

  it('planted defect: a parent that does not exist', async () => {
    expect(await checkTicketCreated(created(NEW, 'task', GHOST), baseCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.unknown-parent',
      reason: 'The chosen parent ticket does not exist in this workspace.',
    });
  });

  it('planted defect: a type nobody defined', async () => {
    expect(await checkTicketCreated(created(NEW, 'ghost-type', PARENT), baseCtx())).toEqual({
      refused: true,
      rule: 'ticket.unknown-type',
      reason: "This ticket's type is not defined in this workspace.",
    });
  });

  it('planted defect: a type whose workflow is not defined — the ledger accepts only what it can replay', async () => {
    const ctx = buildMemoryContext([], [typeDefined(TASK)]); // no workflow seeded
    expect(await checkTicketCreated(created(NEW, 'task', null), ctx)).toEqual({
      refused: true,
      rule: 'ticket.workflow-undefined',
      reason: "This ticket type's workflow has not been defined yet, so the ticket would have no status.",
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/hierarchy.test.ts`
Expected: FAIL — cannot find module `./hierarchy`.

- [ ] **Step 4: Implement the refusal vocabulary and context helpers**

```ts
// packages/rule-engine/src/checks/refusals.ts
import type { EngineVerdict } from '../evaluate';

/**
 * The exact plain-language refusal reasons — a deliverable of Plan 3.
 * Tests and fixtures assert the LITERAL strings, never these constants,
 * so a typo here cannot certify itself.
 */
export const REFUSALS = {
  'ticket.unknown-type': "This ticket's type is not defined in this workspace.",
  'ticket.unknown': 'This ticket does not exist in this workspace.',
  'ticket.workflow-undefined':
    "This ticket type's workflow has not been defined yet, so the ticket would have no status.",
  'hierarchy.unknown-parent': 'The chosen parent ticket does not exist in this workspace.',
  'hierarchy.cross-project': 'The parent is in a different project. Pick a parent from the same project.',
  'hierarchy.cycle':
    'This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself.',
  'field.unknown': "This ticket's type has no such field. Add the field to the ticket type first.",
  'field.title-required': 'A ticket always has a title. Change the title instead of clearing it.',
} as const;

export function rankRefusal(childTypeName: string, parentTypeName: string): string {
  return `"${childTypeName}" cannot go under "${parentTypeName}": a ticket's parent must be a bigger kind of work.`;
}

/**
 * Owner decision (2026-08-20, coordination doc sign-off table): a ticket whose
 * type sits at the deepest rank always belongs to a parent. The reason names
 * the TYPE rather than saying "sub-task", because the built-in sub-task is only
 * the most common type this bites — any custom type at the same rank raises it.
 */
export function deepestRankParentRefusal(typeName: string): string {
  return `"${typeName}" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.`;
}

export function fieldKindRefusal(fieldName: string, needsPhrase: string): string {
  return `"${fieldName}" needs ${needsPhrase}.`;
}

export function refuse(rule: keyof typeof REFUSALS): EngineVerdict;
export function refuse(rule: string, reason: string): EngineVerdict;
export function refuse(rule: string, reason?: string): EngineVerdict {
  return { refused: true, rule, reason: reason ?? REFUSALS[rule as keyof typeof REFUSALS] };
}

export const ACCEPT: EngineVerdict = { refused: false };
```

```ts
// packages/rule-engine/src/checks/context-helpers.ts
import type { TicketState, TicketTypeDef } from '@gisik-nokma/domain';
import type { EngineContext } from '../engine-context';

export async function getTicketState(ctx: EngineContext, id: string): Promise<TicketState | null> {
  return (await ctx.getEntityState('ticket', id)) as TicketState | null;
}

export async function getTicketTypeDef(ctx: EngineContext, id: string): Promise<TicketTypeDef | null> {
  return (await ctx.getEntityState('ticket-type', id)) as TicketTypeDef | null;
}
```

- [ ] **Step 5: Implement checkTicketCreated**

```ts
// packages/rule-engine/src/checks/hierarchy.ts
import type { EventEnvelope } from '@gisik-nokma/domain';
import { SUB_TASK_TYPE_ID, ticketCreatedPayload } from '@gisik-nokma/domain';
import type { EngineContext } from '../engine-context';
import type { EngineVerdict } from '../evaluate';
import { getTicketState, getTicketTypeDef } from './context-helpers';
import { ACCEPT, deepestRankParentRefusal, rankRefusal, refuse } from './refusals';

/**
 * Hierarchy sanity for ticket.created. Check order is deliberate — the most
 * fundamental truth names the refusal: unknown type → workflow undefined →
 * (root: deepest-rank rule) → unknown parent → cross-project → rank →
 * parent-terminal (Step 7c — the remediable contradiction comes last).
 */
export async function checkTicketCreated(env: EventEnvelope, ctx: EngineContext): Promise<EngineVerdict> {
  const p = ticketCreatedPayload.parse(env.payload);

  const type = await getTicketTypeDef(ctx, p.typeId);
  if (!type) return refuse('ticket.unknown-type');

  const workflow = await ctx.getWorkflowDef(type.workflowId);
  if (!workflow) return refuse('ticket.workflow-undefined');

  if (p.parentId === null) {
    // First pass keys off the built-in seed id; Step 7e generalises it to the
    // rank (owner decision 2026-08-20). The rule id and the reason are already
    // the final ones, so no test written here has to churn twice.
    if (type.id === SUB_TASK_TYPE_ID) {
      return refuse('hierarchy.deepest-rank-parent-required', deepestRankParentRefusal(type.name));
    }
    return ACCEPT;
  }

  const parent = await getTicketState(ctx, p.parentId);
  if (!parent) return refuse('hierarchy.unknown-parent');
  if (parent.projectId !== p.projectId) return refuse('hierarchy.cross-project');

  const parentType = await getTicketTypeDef(ctx, parent.typeId);
  if (!parentType) return refuse('ticket.unknown-type');
  if (type.rank <= parentType.rank) {
    return refuse('hierarchy.rank', rankRefusal(type.name, parentType.name));
  }

  return ACCEPT;
}
```

- [ ] **Step 6: Wire the check into the engine dispatch**

In `packages/rule-engine/src/evaluate.ts`, add to the imports and the `switch (env.type)` Plan 2 established:

```ts
import { checkTicketCreated } from './checks/hierarchy';

    case 'ticket.created':
      return checkTicketCreated(env, ctx);
```

- [ ] **Step 7: Run the tests to verify they pass, then the whole rule-engine suite**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/hierarchy.test.ts`
Expected: PASS (8 tests).
Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run`
Expected: PASS — Plan 2's fixtures and tests stay green (its fixtures contain no `ticket.created` candidates; if one now fails, the fixture was relying on unrouted-type acceptance and must gain legal type/parent prior events, which is this check working as designed).

- [ ] **Step 7b: Write the failing terminal-parent test (owner decision 2026-08-20)**

Extend the imports in `packages/rule-engine/src/checks/hierarchy.test.ts` with:

```ts
import { makeEnvelope } from '@gisik-nokma/domain';
```

and append inside the `checkTicketCreated` describe block:

```ts
  it('planted defect: creating live work under a finished parent — the remedy named is the reopen', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(STORY), typeDefined(TASK),
      makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: PARENT },
        payload: { typeId: 'story', projectId: PROJECT, parentId: null, title: 'Quarterly filings' } }),
      makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: PARENT },
        payload: { toStateId: 'done' } }),
    ]);
    expect(await checkTicketCreated(created(NEW, 'task', PARENT), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.parent-terminal',
      reason: '"Quarterly filings" is finished (Done). Adding live work reopens it — choose a state to reopen it to, then add this ticket.',
    });
  });
```

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/hierarchy.test.ts`
Expected: FAIL — the created ticket is accepted (`{ refused: false }`) because the check does not exist yet.

- [ ] **Step 7c: Implement the terminal-parent refusal**

Append to `packages/rule-engine/src/checks/refusals.ts`:

```ts
/**
 * Owner decision (2026-08-20, coordination doc): live work arriving under a
 * finished parent refuses toward the offered reopen — the remedy is in the
 * reason. `move` picks the verb pair: 'add' for ticket.created, 'move' for
 * ticket.reparented.
 */
export function parentTerminalRefusal(parentTitle: string, stateName: string, move: 'add' | 'move'): string {
  const remedy =
    move === 'add'
      ? 'Adding live work reopens it — choose a state to reopen it to, then add this ticket.'
      : 'Moving live work under it reopens it — choose a state to reopen it to, then move this ticket.';
  return `"${parentTitle}" is finished (${stateName}). ${remedy}`;
}
```

In `packages/rule-engine/src/checks/hierarchy.ts`, extend the `./refusals` import with `parentTerminalRefusal`, and insert into `checkTicketCreated`, after the rank check and immediately before the final `return ACCEPT;`:

```ts
  // Owner decision (2026-08-20): a finished parent refuses new live work; the
  // decision keys off the denormalized stateCategory — the def lookup below
  // only names the state for the reason, so it falls back to raw ids rather
  // than blocking the refusal on a missing definition.
  if (parent.stateCategory === 'terminal') {
    const parentDef = await ctx.getWorkflowDef(parent.workflowId, parent.workflowVersion);
    const stateName = parentDef?.states.find((s) => s.id === parent.stateId)?.name ?? parent.stateId;
    const titleClaim = parent.fields['title']?.value;
    const parentTitle = typeof titleClaim === 'string' ? titleClaim : parent.id;
    return refuse('hierarchy.parent-terminal', parentTerminalRefusal(parentTitle, stateName, 'add'));
  }
```

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/hierarchy.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 7d: Write the failing tests — a CUSTOM type at the deepest rank (owner decision 2026-08-20)**

The owner overruled the "built-in `sub-task` only" reading: the parent requirement follows the **rank**, so a workspace that invents a `Checklist item` at rank 4 gets the same refusal, with its own name in the reason — and so does a `Micro step` at rank 7, which is smaller work still and cannot coherently be exempt. The refusals come first, the accepting twin right after — the twin is what stops Step 7e from over-refusing the whole type into uselessness.

Append inside the `checkTicketCreated` describe block in `packages/rule-engine/src/checks/hierarchy.test.ts` (both defs are local to this pair — test-support's shared builders stay the built-in ladder):

```ts
  // Workspace-invented types at and below sub-task's depth. Local to this pair
  // on purpose: the shared builders describe the built-in ladder.
  const CHECKLIST: TicketTypeDef = {
    id: 'checklist-item', name: 'Checklist item', icon: 'list', rank: 4, workflowId: 'wf-basic', fields: [],
  };
  const MICRO_STEP: TicketTypeDef = {
    id: 'micro-step', name: 'Micro step', icon: 'list', rank: 7, workflowId: 'wf-basic', fields: [],
  };
  const checklistCtx = () =>
    buildMemoryContext([WF], [
      typeDefined(STORY), typeDefined(CHECKLIST), typeDefined(MICRO_STEP), created(PARENT, 'story', null),
    ]);

  it('planted defect: a CUSTOM type at the deepest rank, cast at project root — the rule follows the rank, not the id', async () => {
    expect(await checkTicketCreated(created(NEW, 'checklist-item', null), checklistCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.deepest-rank-parent-required',
      reason: '"Checklist item" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.',
    });

    // …and nothing slips underneath the floor: rank 7 is smaller work than a
    // sub-task, so exempting it would invert the rule's own justification.
    // This assertion is the standing guard for the `>=` in Step 7e.
    expect(await checkTicketCreated(created(NEW, 'micro-step', null), checklistCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.deepest-rank-parent-required',
      reason: '"Micro step" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.',
    });
  });

  it('accepts the same custom deepest-rank type once it names a parent', async () => {
    expect(await checkTicketCreated(created(NEW, 'checklist-item', PARENT), checklistCtx())).toEqual({ refused: false });
  });
```

Extend that file's imports with `import type { TicketTypeDef } from '@gisik-nokma/domain';`.

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/hierarchy.test.ts`
Expected: FAIL on the refusal test — both custom types are accepted at project root (`{ refused: false }`) because Step 5's check still asks whether the id is `sub-task`. The accepting twin already passes; it stands guard against over-refusal once Step 7e lands.

- [ ] **Step 7e: Generalise the check from the built-in id to the rank**

In `packages/rule-engine/src/checks/hierarchy.ts`, replace `SUB_TASK_TYPE_ID` in the `@gisik-nokma/domain` import with `DEEPEST_RANK`, and replace the id test inside `checkTicketCreated`'s `p.parentId === null` branch with:

```ts
    // Owner decision (2026-08-20): the parent requirement follows the RANK, not
    // the built-in id — the built-in sub-task and any custom type an admin
    // defines at that rank or below it all carry it.
    //
    // `>=` rather than `===`: the rule's justification is that the smallest
    // kind of work always belongs to something bigger, so a type DEEPER than
    // sub-task is smaller still and cannot coherently be exempt — `===` would
    // leave an escape hatch where defining rank 5 floats your tickets free.
    //
    // DEEPEST_RANK stays a fixed constant rather than a max computed over the
    // workspace's defined types: a computed max would silently change this
    // refusal's meaning as the type inventory changed, and a refusal that
    // shifts underfoot is exactly what this product refuses to ship. Fixed
    // floor plus `>=` gives both — the meaning never moves, and nothing slips
    // underneath it.
    if (type.rank >= DEEPEST_RANK) {
      return refuse('hierarchy.deepest-rank-parent-required', deepestRankParentRefusal(type.name));
    }
```

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/hierarchy.test.ts`
Expected: PASS (11 tests) — the built-in sub-task case still refuses (it is at rank 4), and both custom-type cases now behave.
Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/rule-engine/src/checks/refusals.ts packages/rule-engine/src/checks/context-helpers.ts packages/rule-engine/src/checks/test-support.ts packages/rule-engine/src/checks/hierarchy.ts packages/rule-engine/src/checks/hierarchy.test.ts packages/rule-engine/src/evaluate.ts
git commit -m "Creation now answers for the hierarchy: rank order, the deepest rank always belongs to a parent — the built-in sub-task and any custom type an admin puts beside it alike — no cross-project grafts, and a finished parent refuses new live work until it reopens, every precondition the checks force refusing in the user's language"
```

### Task 6: Hierarchy checks for ticket.reparented — cycles named as loops, plus rank and project again

**Files:**
- Modify: `packages/rule-engine/src/checks/hierarchy.ts` (add `checkTicketReparented`)
- Test: `packages/rule-engine/src/checks/reparent.test.ts`
- Modify: `packages/rule-engine/src/evaluate.ts` (add the `ticket.reparented` case)

**Interfaces:**
- Consumes: everything Task 5 produced; `ticketReparentedPayload` (`@gisik-nokma/domain`).
- Produces: `checkTicketReparented(env: EventEnvelope, ctx: EngineContext): Promise<EngineVerdict>`.

**Why the cycle check is load-bearing:** with strict rank ordering a cycle looks unreachable — but `ticket-type.defined` can re-define a type's rank (last definition wins), after which a rank-legal reparent can close a loop. The planted defect below constructs exactly that. Check order: unknown ticket → unknown type → (to root: deepest-rank rule) → self/cycle → cross-project → rank → parent-terminal (Step 5c) — a loop is named as a loop even when rank is also violated.

**On the deepest-rank rule here:** Task 5 Step 7e already generalised it from the built-in id to `type.rank >= DEEPEST_RANK`, so this task's check ships rank-based from the start — a sub-task, a workspace's own rank-4 type, and anything it defines deeper are all refused when cast loose to project root, each named in its own reason.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/rule-engine/src/checks/reparent.test.ts
import { describe, expect, it } from 'vitest';
import { makeEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../memory-context';
import { checkTicketReparented } from './hierarchy';
import { EPIC, PROJECT_B, STORY, SUBTASK, TASK, WF, WS, created, typeDefined } from './test-support';

const A = '01J9GTKA000000000000000000';
const B = '01J9GTKB000000000000000000';
const C = '01J9GTKC000000000000000000';
const OTHER = '01J9GPAR000000000000000000';
const GHOST = '01J9GGHT000000000000000000';

function reparent(ticketId: string, newParentId: string | null) {
  return makeEnvelope({ type: 'ticket.reparented', entity: { kind: 'ticket', id: ticketId }, workspaceId: WS, payload: { newParentId } });
}

const chainCtx = () =>
  buildMemoryContext([WF], [
    typeDefined(EPIC), typeDefined(STORY), typeDefined(TASK), typeDefined(SUBTASK),
    created(A, 'epic', null),
    created(B, 'story', A),
    created(C, 'task', B),
  ]);

describe('checkTicketReparented', () => {
  it('accepts pulling a grandchild up to its grandparent', async () => {
    expect(await checkTicketReparented(reparent(C, A), chainCtx())).toEqual({ refused: false });
  });

  it('accepts moving a ticket above the deepest rank to project root', async () => {
    expect(await checkTicketReparented(reparent(C, null), chainCtx())).toEqual({ refused: false });
  });

  it('planted defect: a ticket as its own parent', async () => {
    expect(await checkTicketReparented(reparent(A, A), chainCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.cycle',
      reason: 'This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself.',
    });
  });

  it('planted defect: reparenting under a descendant after a rank re-definition made it rank-legal', async () => {
    const phase = { id: 'phase', name: 'Phase', icon: 'flag', rank: 1, workflowId: 'wf-basic', fields: [] };
    const step = { id: 'step', name: 'Step', icon: 'check', rank: 2, workflowId: 'wf-basic', fields: [] };
    const ctx = buildMemoryContext([WF], [
      typeDefined(phase), typeDefined(step),
      created(A, 'phase', null),
      created(B, 'step', A),
      typeDefined({ ...phase, rank: 3 }), // ranks moved under us — rank alone now allows A under B
    ]);
    expect(await checkTicketReparented(reparent(A, B), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.cycle',
      reason: 'This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself.',
    });
  });

  it('planted defect: reparenting into another project', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(STORY), typeDefined(TASK),
      created(OTHER, 'story', null, PROJECT_B),
      created(C, 'task', null),
    ]);
    expect(await checkTicketReparented(reparent(C, OTHER), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.cross-project',
      reason: 'The parent is in a different project. Pick a parent from the same project.',
    });
  });

  it('planted defect: a story moved under a task — rank violated on reparent too', async () => {
    expect(await checkTicketReparented(reparent(B, C), chainCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.rank',
      reason: '"Story" cannot go under "Task": a ticket\'s parent must be a bigger kind of work.',
    });
  });

  it('planted defect: a sub-task cast loose to project root', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(TASK), typeDefined(SUBTASK),
      created(A, 'task', null),
      created(B, 'sub-task', A),
    ]);
    expect(await checkTicketReparented(reparent(B, null), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.deepest-rank-parent-required',
      reason: '"Sub-task" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.',
    });
  });

  it('planted defect: reparenting a ticket that does not exist / onto a parent that does not exist', async () => {
    expect(await checkTicketReparented(reparent(GHOST, A), chainCtx())).toEqual({
      refused: true,
      rule: 'ticket.unknown',
      reason: 'This ticket does not exist in this workspace.',
    });
    expect(await checkTicketReparented(reparent(C, GHOST), chainCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.unknown-parent',
      reason: 'The chosen parent ticket does not exist in this workspace.',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/reparent.test.ts`
Expected: FAIL — `checkTicketReparented` is not exported.

- [ ] **Step 3: Implement checkTicketReparented**

Append to `packages/rule-engine/src/checks/hierarchy.ts` (extend the import from `@gisik-nokma/domain` with `ticketReparentedPayload` and `TicketState`):

```ts
/** Walking more ancestors than this means the ledger itself is broken. */
const MAX_ANCESTOR_HOPS = 1000;

export async function checkTicketReparented(env: EventEnvelope, ctx: EngineContext): Promise<EngineVerdict> {
  const p = ticketReparentedPayload.parse(env.payload);

  const ticket = await getTicketState(ctx, env.entity.id);
  if (!ticket) return refuse('ticket.unknown');

  const type = await getTicketTypeDef(ctx, ticket.typeId);
  if (!type) return refuse('ticket.unknown-type');

  if (p.newParentId === null) {
    // Same rank rule as creation (Task 5 Step 7e): the floor of the hierarchy
    // always belongs to a parent — whichever type sits at it, or beneath it.
    if (type.rank >= DEEPEST_RANK) {
      return refuse('hierarchy.deepest-rank-parent-required', deepestRankParentRefusal(type.name));
    }
    return ACCEPT;
  }

  if (p.newParentId === ticket.id) return refuse('hierarchy.cycle');

  const newParent = await getTicketState(ctx, p.newParentId);
  if (!newParent) return refuse('hierarchy.unknown-parent');

  // Cycle: is the ticket an ancestor of its proposed parent?
  let cursor: TicketState | null = newParent;
  let hops = 0;
  while (cursor !== null) {
    if (cursor.id === ticket.id) return refuse('hierarchy.cycle');
    if (++hops > MAX_ANCESTOR_HOPS) {
      throw new Error(`checkTicketReparented: ancestor chain of ${p.newParentId} exceeds ${MAX_ANCESTOR_HOPS} — ledger integrity is broken`);
    }
    cursor = cursor.parentId === null ? null : await getTicketState(ctx, cursor.parentId);
  }

  if (newParent.projectId !== ticket.projectId) return refuse('hierarchy.cross-project');

  const parentType = await getTicketTypeDef(ctx, newParent.typeId);
  if (!parentType) return refuse('ticket.unknown-type');
  if (type.rank <= parentType.rank) {
    return refuse('hierarchy.rank', rankRefusal(type.name, parentType.name));
  }

  return ACCEPT;
}
```

- [ ] **Step 4: Wire into the dispatch**

In `packages/rule-engine/src/evaluate.ts`, extend the hierarchy import and the switch:

```ts
import { checkTicketCreated, checkTicketReparented } from './checks/hierarchy';

    case 'ticket.reparented':
      return checkTicketReparented(env, ctx);
```

- [ ] **Step 5: Run the tests to verify they pass, then the whole rule-engine suite**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/reparent.test.ts`
Expected: PASS (8 tests).
Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run`
Expected: PASS.

- [ ] **Step 5b: Write the terminal-parent tests — the refusal and its accepting twin (owner decision 2026-08-20)**

Extend the imports in `packages/rule-engine/src/checks/reparent.test.ts` (`PROJECT` from `./test-support` joins the existing names), then append:

```ts
describe('checkTicketReparented under a terminal parent (owner decision 2026-08-20)', () => {
  const donePriors = [
    typeDefined(STORY), typeDefined(TASK),
    makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: A }, workspaceId: WS,
      payload: { typeId: 'story', projectId: PROJECT, parentId: null, title: 'Quarterly filings' } }),
    makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: A }, workspaceId: WS,
      payload: { toStateId: 'done' } }),
    created(C, 'task', null),
  ];

  it('planted defect: moving live work under a finished parent — the remedy named is the reopen', async () => {
    const ctx = buildMemoryContext([WF], donePriors);
    expect(await checkTicketReparented(reparent(C, A), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.parent-terminal',
      reason: '"Quarterly filings" is finished (Done). Moving live work under it reopens it — choose a state to reopen it to, then move this ticket.',
    });
  });

  it('accepts a terminal child moving under a terminal parent — nothing contradicts, nothing reopens', async () => {
    const ctx = buildMemoryContext([WF], [
      ...donePriors,
      makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: C }, workspaceId: WS,
        payload: { toStateId: 'done' } }),
    ]);
    expect(await checkTicketReparented(reparent(C, A), ctx)).toEqual({ refused: false });
  });
});
```

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/reparent.test.ts`
Expected: FAIL on the refusal test (the move is accepted because the check does not exist yet); the accepting twin already passes — it stands guard against over-refusal once Step 5c lands.

- [ ] **Step 5c: Implement the reparent half of the refusal**

In `packages/rule-engine/src/checks/hierarchy.ts` (the `parentTerminalRefusal` helper and the import extension landed in Task 5 Step 7c), insert into `checkTicketReparented`, after the rank check and immediately before the final `return ACCEPT;`:

```ts
  // Owner decision (2026-08-20): only LIVE work under a finished parent
  // contradicts — a terminal child under a terminal parent is legal. Decision
  // keys off denormalized stateCategory; the def lookup only names the state.
  if (newParent.stateCategory === 'terminal' && ticket.stateCategory !== 'terminal') {
    const parentDef = await ctx.getWorkflowDef(newParent.workflowId, newParent.workflowVersion);
    const stateName = parentDef?.states.find((s) => s.id === newParent.stateId)?.name ?? newParent.stateId;
    const titleClaim = newParent.fields['title']?.value;
    const parentTitle = typeof titleClaim === 'string' ? titleClaim : newParent.id;
    return refuse('hierarchy.parent-terminal', parentTerminalRefusal(parentTitle, stateName, 'move'));
  }
```

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/reparent.test.ts`
Expected: PASS (10 tests).
Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rule-engine/src/checks/hierarchy.ts packages/rule-engine/src/checks/reparent.test.ts packages/rule-engine/src/evaluate.ts
git commit -m "Reparenting cannot make loops, cross projects, invert rank, cast the deepest rank loose to project root, or slip live work under a finished parent — and the cycle check earns its keep with a planted defect where a rank re-definition made the loop rank-legal"
```

### Task 7: Field claim checks for ticket.field_set — unknown fields, kind mismatches, and the title that cannot vanish

**Files:**
- Create: `packages/rule-engine/src/checks/fields.ts`
- Test: `packages/rule-engine/src/checks/fields.test.ts`
- Modify: `packages/rule-engine/src/evaluate.ts` (add the `ticket.field_set` case)

**Interfaces:**
- Consumes: Task 5's refusal vocabulary and context helpers; `ticketFieldSetPayload`, `dueDateValueSchema`, `CustomFieldDef` (`@gisik-nokma/domain`); `buildMemoryContext` + test-support (Tasks 4–5).
- Produces: `checkTicketFieldSet(env: EventEnvelope, ctx: EngineContext): Promise<EngineVerdict>`.

**Semantics:** built-in fields `title`, `description`, `dueDate`, `startDate` ride the same event as custom fields. `value: null` clears any field except `title` (`field.title-required`). A due date is `{ date: 'YYYY-MM-DD', note? }` — always a claim; the projection preserves actor and both times (Task 3 already proves that). Custom values must fit their `CustomFieldDef` kind; a `select` value must be one of its options; a `person` value is a non-empty user id string (existence checking belongs to the membership/auth plan).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/rule-engine/src/checks/fields.test.ts
import { describe, expect, it } from 'vitest';
import type { TicketTypeDef } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../memory-context';
import { checkTicketFieldSet } from './fields';
import { WF, WS, created, typeDefined } from './test-support';

const TICKET = '01J9GTKA000000000000000000';
const GHOST = '01J9GGHT000000000000000000';

const INVOICE: TicketTypeDef = {
  id: 'invoice', name: 'Invoice', icon: 'receipt', rank: 3, workflowId: 'wf-basic',
  fields: [
    { id: 'amount', name: 'Invoice amount', type: 'number' },
    { id: 'stage', name: 'Stage', type: 'select', options: ['Draft', 'Sent', 'Paid'] },
    { id: 'counterparty', name: 'Counterparty', type: 'person' },
    { id: 'filed-on', name: 'Filed on', type: 'date' },
  ],
};

const ctx = () => buildMemoryContext([WF], [typeDefined(INVOICE), created(TICKET, 'invoice', null)]);

function fieldSet(fieldId: string, value: unknown, ticketId: string = TICKET) {
  return makeEnvelope({ type: 'ticket.field_set', entity: { kind: 'ticket', id: ticketId }, workspaceId: WS, payload: { fieldId, value } });
}

describe('checkTicketFieldSet', () => {
  it('accepts fitting values for every kind, and null to clear', async () => {
    expect(await checkTicketFieldSet(fieldSet('amount', 1200), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('stage', 'Sent'), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('counterparty', 'user-anselma'), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('filed-on', '2026-08-30'), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('amount', null), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('title', 'Renamed honestly'), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('description', { type: 'doc', content: [] }), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('description', null), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('dueDate', { date: '2026-08-30', note: 'GST' }), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('dueDate', null), ctx())).toEqual({ refused: false });
  });

  it('planted defect: a field the type never declared', async () => {
    expect(await checkTicketFieldSet(fieldSet('invoice-number', 'INV-7'), ctx())).toEqual({
      refused: true,
      rule: 'field.unknown',
      reason: "This ticket's type has no such field. Add the field to the ticket type first.",
    });
  });

  it('planted defect: text where a number belongs', async () => {
    expect(await checkTicketFieldSet(fieldSet('amount', 'twelve'), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Invoice amount" needs a number.',
    });
  });

  it('planted defect: a select value outside its list', async () => {
    expect(await checkTicketFieldSet(fieldSet('stage', 'Lost'), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Stage" needs one of: Draft, Sent, Paid.',
    });
  });

  it('planted defect: a date that is not a day, a person that is not an id', async () => {
    expect(await checkTicketFieldSet(fieldSet('filed-on', '30/08/2026'), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Filed on" needs a date in YYYY-MM-DD form.',
    });
    expect(await checkTicketFieldSet(fieldSet('counterparty', 42), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Counterparty" needs a person.',
    });
  });

  it('planted defect: clearing the title', async () => {
    expect(await checkTicketFieldSet(fieldSet('title', null), ctx())).toEqual({
      refused: true,
      rule: 'field.title-required',
      reason: 'A ticket always has a title. Change the title instead of clearing it.',
    });
  });

  it('planted defect: a non-text title, a non-document description, a timestamp due date', async () => {
    expect(await checkTicketFieldSet(fieldSet('title', 42), ctx())).toEqual({
      refused: true, rule: 'field.type-mismatch', reason: '"Title" needs text.',
    });
    expect(await checkTicketFieldSet(fieldSet('description', 'plain string'), ctx())).toEqual({
      refused: true, rule: 'field.type-mismatch', reason: '"Description" needs a document.',
    });
    expect(await checkTicketFieldSet(fieldSet('dueDate', { date: '2026-08-30T10:00:00Z' }), ctx())).toEqual({
      refused: true, rule: 'field.type-mismatch',
      reason: '"Due date" needs a day in YYYY-MM-DD form (a note is optional).',
    });
  });

  it('planted defect: field_set on a ticket that does not exist', async () => {
    expect(await checkTicketFieldSet(fieldSet('amount', 1200, GHOST), ctx())).toEqual({
      refused: true,
      rule: 'ticket.unknown',
      reason: 'This ticket does not exist in this workspace.',
    });
  });
});
```

- [ ] **Step 1a: Add the `startDate` claim cases to the same file**

`startDate` is a built-in day claim with exactly `dueDate`'s value shape — a claim like any other, made by someone, at a time. Append to the `describe('checkTicketFieldSet', …)` block in `packages/rule-engine/src/checks/fields.test.ts`:

```ts
  it('accepts a start-date claim, with or without a note, and null to clear it', async () => {
    expect(await checkTicketFieldSet(fieldSet('startDate', { date: '2026-09-01' }), ctx())).toEqual({ refused: false });
    expect(
      await checkTicketFieldSet(fieldSet('startDate', { date: '2026-09-01', note: 'after the licence renewal' }), ctx()),
    ).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('startDate', null), ctx())).toEqual({ refused: false });
  });

  it('planted defect: a timestamp start date, and a bare string where the claim belongs', async () => {
    expect(await checkTicketFieldSet(fieldSet('startDate', { date: '2026-09-01T10:00:00Z' }), ctx())).toEqual({
      refused: true, rule: 'field.type-mismatch',
      reason: '"Start date" needs a day in YYYY-MM-DD form (a note is optional).',
    });
    expect(await checkTicketFieldSet(fieldSet('startDate', '2026-09-01'), ctx())).toEqual({
      refused: true, rule: 'field.type-mismatch',
      reason: '"Start date" needs a day in YYYY-MM-DD form (a note is optional).',
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/fields.test.ts`
Expected: FAIL — cannot find module `./fields`.

- [ ] **Step 3: Implement checkTicketFieldSet**

```ts
// packages/rule-engine/src/checks/fields.ts
import type { CustomFieldDef, EventEnvelope } from '@gisik-nokma/domain';
import { dueDateValueSchema, ticketFieldSetPayload } from '@gisik-nokma/domain';
import type { EngineContext } from '../engine-context';
import type { EngineVerdict } from '../evaluate';
import { getTicketState, getTicketTypeDef } from './context-helpers';
import { ACCEPT, fieldKindRefusal, refuse } from './refusals';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function customFieldVerdict(field: CustomFieldDef, value: unknown): EngineVerdict {
  switch (field.type) {
    case 'text':
      return typeof value === 'string'
        ? ACCEPT
        : refuse('field.type-mismatch', fieldKindRefusal(field.name, 'text'));
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? ACCEPT
        : refuse('field.type-mismatch', fieldKindRefusal(field.name, 'a number'));
    case 'date':
      return typeof value === 'string' && DATE_ONLY.test(value)
        ? ACCEPT
        : refuse('field.type-mismatch', fieldKindRefusal(field.name, 'a date in YYYY-MM-DD form'));
    case 'select':
      return typeof value === 'string' && (field.options ?? []).includes(value)
        ? ACCEPT
        : refuse('field.type-mismatch', fieldKindRefusal(field.name, `one of: ${(field.options ?? []).join(', ')}`));
    case 'person':
      return typeof value === 'string' && value.length > 0
        ? ACCEPT
        : refuse('field.type-mismatch', fieldKindRefusal(field.name, 'a person'));
  }
}

/**
 * Semantics for ticket.field_set: does the field exist on this ticket's type,
 * and does the value fit its kind? value: null clears — a claim like any
 * other — except title: a ticket always has a title.
 */
export async function checkTicketFieldSet(env: EventEnvelope, ctx: EngineContext): Promise<EngineVerdict> {
  const p = ticketFieldSetPayload.parse(env.payload);
  const value = p.value ?? null;

  const ticket = await getTicketState(ctx, env.entity.id);
  if (!ticket) return refuse('ticket.unknown');

  if (p.fieldId === 'title') {
    if (value === null) return refuse('field.title-required');
    return typeof value === 'string' && value.trim().length > 0
      ? ACCEPT
      : refuse('field.type-mismatch', fieldKindRefusal('Title', 'text'));
  }

  if (p.fieldId === 'description') {
    if (value === null) return ACCEPT;
    return isPlainObject(value)
      ? ACCEPT
      : refuse('field.type-mismatch', fieldKindRefusal('Description', 'a document'));
  }

  // The two day-claim built-ins share one shape, so they share one branch and
  // one schema — a second copy is a second thing to drift.
  if (p.fieldId === 'dueDate' || p.fieldId === 'startDate') {
    if (value === null) return ACCEPT;
    const fieldName = p.fieldId === 'dueDate' ? 'Due date' : 'Start date';
    return dueDateValueSchema.safeParse(value).success
      ? ACCEPT
      : refuse('field.type-mismatch', fieldKindRefusal(fieldName, 'a day in YYYY-MM-DD form (a note is optional)'));
  }

  const type = await getTicketTypeDef(ctx, ticket.typeId);
  if (!type) return refuse('ticket.unknown-type');

  const field = type.fields.find((f) => f.id === p.fieldId);
  if (!field) return refuse('field.unknown');

  if (value === null) return ACCEPT; // clearing any custom field is a legal claim
  return customFieldVerdict(field, value);
}
```

- [ ] **Step 4: Wire into the dispatch**

In `packages/rule-engine/src/evaluate.ts`:

```ts
import { checkTicketFieldSet } from './checks/fields';

    case 'ticket.field_set':
      return checkTicketFieldSet(env, ctx);
```

- [ ] **Step 5: Run the tests to verify they pass, then the whole rule-engine suite**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/fields.test.ts`
Expected: PASS (10 tests) — including the two `startDate` cases.
Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rule-engine/src/checks/fields.ts packages/rule-engine/src/checks/fields.test.ts packages/rule-engine/src/evaluate.ts
git commit -m "Field claims are checked against what the type declared: unknown fields refused by name, kinds enforced with the reason spelled out, the two day-claim built-ins sharing one shape rather than two that could drift, null clearing everything except the title a ticket cannot live without"
```

### Task 8: End-to-end planted-defect fixtures — the shared suite proves the refusals through the real engine

**Files:**
- Create: `packages/rule-engine/fixtures/parent-terminal-with-open-children.json`
- Create: `packages/rule-engine/fixtures/parent-terminal-all-children-done.json`
- Create: `packages/rule-engine/fixtures/created-rank-violation.json`
- Create: `packages/rule-engine/fixtures/created-rank-legal.json` (doubles as the accepting twin for the deepest-rank refusal — Step 4)
- Create: `packages/rule-engine/fixtures/created-deepest-rank-no-parent.json`
- Create: `packages/rule-engine/fixtures/reparent-cycle-after-rank-redefinition.json`
- Create: `packages/rule-engine/fixtures/reparent-legal-grandchild-up.json`
- Create: `packages/rule-engine/fixtures/field-set-unknown-field.json`
- Create: `packages/rule-engine/fixtures/field-set-kind-mismatch.json`
- Create: `packages/rule-engine/fixtures/field-set-legal.json`
- Create: `packages/rule-engine/fixtures/created-under-terminal-parent.json`
- Create: `packages/rule-engine/fixtures/reparent-live-under-terminal-parent.json`
- Create: `packages/rule-engine/fixtures/reparent-terminal-under-terminal-parent.json`
- Modify: `packages/rule-engine/src/fixtures.test.ts` (Plan 2's runner — context construction and comparison)

**Interfaces:**
- Consumes: Plan 2's fixture format `{name, workflowDefs: WorkflowDef[], memberships?, priorEvents, candidateEvent, expected}` and runner; `buildMemoryContext` (Task 4); `evaluateEvent` with the Task 5–7 routing.
- Produces: thirteen fixtures that run identically in every build that runs the shared suite (spec §7: "One shared fixture suite runs against the rule engine in client and server builds, so the two can never quietly disagree").

**Runner semantics (load-bearing, spell it in the runner's doc comment):** `priorEvents` are folded into the context WITHOUT evaluation — they are the accepted past. ONLY `candidateEvent` goes through `evaluateEvent`. This is why the rank re-definition event inside the cycle fixture is not itself refused, and why these fixtures compose with Plan 2's without re-litigating history.

**Comparison discipline:** the runner asserts `toMatchObject(fixture.expected)`. Every refusal fixture MUST name its `rule`; it also names the literal `reason` whenever this plan owns the string. The two parent-terminal fixtures name only the `rule` (`parent-terminal-with-open-children`, per Coordination) because Plan 2 owns that reason string and already asserts it exactly in its own suite. The `…-under-terminal-parent` trio (Step 6b) is a different rule — `hierarchy.parent-terminal`, whose reason THIS plan owns — so those fixtures name the literal reason too.

- [ ] **Step 1: Extend the fixture runner to build context from prior events**

In `packages/rule-engine/src/fixtures.test.ts`, replace the runner's context construction with `buildMemoryContext`, keeping anything Plan 2's runner layers on for its own rules (e.g. transition history for `require-different-user`) — merge, don't discard:

```ts
import { buildMemoryContext } from './memory-context';

// inside the per-fixture test body:
// priorEvents are the accepted past — folded, never evaluated.
// Only candidateEvent faces the engine.
const ctx = buildMemoryContext(fixture.workflowDefs, fixture.priorEvents);
const verdict = await evaluateEvent(fixture.candidateEvent, ctx);
expect(verdict).toMatchObject(fixture.expected);
```

If any Plan 2 fixture's `priorEvents` transition a ticket that was never created, add the `ticket-type.defined` + `ticket.created` prior events it now needs — after this plan, a ticket cannot transition before it exists anywhere in the system, and the fixtures must describe a world that can happen.

- [ ] **Step 2: Run the existing suite to prove the runner change alone breaks nothing**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/fixtures.test.ts`
Expected: PASS (Plan 2's fixtures only, possibly after the prior-event additions above).

- [ ] **Step 3: Write the two parent-terminal fixtures (invariant 3, end to end)**

`packages/rule-engine/fixtures/parent-terminal-with-open-children.json`:

```json
{
  "name": "parent terminal with an open child is refused",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Quarterly filings" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GCHA000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GPAR000000000000000000", "title": "File GST" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 1 },
    { "id": "01J9GEV5000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GCHB000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GPAR000000000000000000", "title": "File TDS" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1 },
    { "id": "01J9GEV6000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GCHA000000000000000000" },
      "payload": { "toStateId": "done" },
      "actorId": "user-anselma", "origin": "web", "clientTime": "2026-08-20T09:00:05.000Z", "serverTime": "2026-08-20T09:00:05.100Z", "seq": 2 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
    "payload": { "toStateId": "done" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:06.000Z", "serverTime": "2026-08-20T09:00:06.100Z", "seq": 2
  },
  "expected": { "refused": true, "rule": "parent-terminal-with-open-children" }
}
```

`packages/rule-engine/fixtures/parent-terminal-all-children-done.json` — the accepting twin: identical `workflowDefs` and `priorEvents` as above PLUS one more prior event (the second child also finishes), and the same `candidateEvent`, now accepted:

```json
{
  "name": "parent terminal is accepted once every child is terminal",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Quarterly filings" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GCHA000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GPAR000000000000000000", "title": "File GST" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 1 },
    { "id": "01J9GEV5000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GCHB000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GPAR000000000000000000", "title": "File TDS" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1 },
    { "id": "01J9GEV6000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GCHA000000000000000000" },
      "payload": { "toStateId": "done" },
      "actorId": "user-anselma", "origin": "web", "clientTime": "2026-08-20T09:00:05.000Z", "serverTime": "2026-08-20T09:00:05.100Z", "seq": 2 },
    { "id": "01J9GEV7000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GCHB000000000000000000" },
      "payload": { "toStateId": "done" },
      "actorId": "user-anselma", "origin": "web", "clientTime": "2026-08-20T09:00:06.000Z", "serverTime": "2026-08-20T09:00:06.100Z", "seq": 2 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
    "payload": { "toStateId": "done" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:07.000Z", "serverTime": "2026-08-20T09:00:07.100Z", "seq": 2
  },
  "expected": { "refused": false }
}
```

- [ ] **Step 4: Write the rank pair — the violation, and a twin that guards two refusals at once**

`packages/rule-engine/fixtures/created-rank-violation.json`:

```json
{
  "name": "an epic created under a story is refused — rank must exceed the parent",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "epic" },
      "payload": { "id": "epic", "name": "Epic", "icon": "flag", "rank": 1, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Shop compliance" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GNEW000000000000000000" },
    "payload": { "typeId": "epic", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GPAR000000000000000000", "title": "Everything, under one story" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 1
  },
  "expected": {
    "refused": true,
    "rule": "hierarchy.rank",
    "reason": "\"Epic\" cannot go under \"Story\": a ticket's parent must be a bigger kind of work."
  }
}
```

`packages/rule-engine/fixtures/created-rank-legal.json` — the accepting twin. It carries a workspace-invented `Checklist item` at rank 4 and creates one **under** the story, so one candidate guards two refusals from over-firing: `hierarchy.rank` (4 under 2 is legal) and `hierarchy.deepest-rank-parent-required` (the deepest rank is fine once it names a parent — Step 4a is its planted defect). One twin, two guards, no near-duplicate fixture:

```json
{
  "name": "a custom type at the deepest rank, created under a story, is accepted — rank-legal and its parent named",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "checklist-item" },
      "payload": { "id": "checklist-item", "name": "Checklist item", "icon": "list", "rank": 4, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Shop compliance" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GNEW000000000000000000" },
    "payload": { "typeId": "checklist-item", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GPAR000000000000000000", "title": "Photograph the renewed licence" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1
  },
  "expected": { "refused": false }
}
```

- [ ] **Step 4a: Write the deepest-rank planted defect (owner decision 2026-08-20 — the rank, not the id)**

Same world as the twin above, same custom type, one difference: nothing is named as its parent. The refusal has to name **`Checklist item`**, not "sub-task" — that is the whole point of the owner's overrule, and a fixture asserting the literal reason is what makes the copy provable outside the unit tests.

`packages/rule-engine/fixtures/created-deepest-rank-no-parent.json`:

```json
{
  "name": "a custom type at the deepest rank is refused at project root, named as itself",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "checklist-item" },
      "payload": { "id": "checklist-item", "name": "Checklist item", "icon": "list", "rank": 4, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Shop compliance" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GNEW000000000000000000" },
    "payload": { "typeId": "checklist-item", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Photograph the renewed licence" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1
  },
  "expected": {
    "refused": true,
    "rule": "hierarchy.deepest-rank-parent-required",
    "reason": "\"Checklist item\" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of."
  }
}
```

- [ ] **Step 5: Write the cycle pair**

`packages/rule-engine/fixtures/reparent-cycle-after-rank-redefinition.json` — the rank re-definition (types are events, last definition wins) makes the loop rank-legal, so only the cycle check stands between the board and a lie:

```json
{
  "name": "reparenting under a descendant is refused as a loop even when a rank re-definition made it rank-legal",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "phase" },
      "payload": { "id": "phase", "name": "Phase", "icon": "flag", "rank": 1, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "step" },
      "payload": { "id": "step", "name": "Step", "icon": "check", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "typeId": "phase", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Opening the second counter" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKB000000000000000000" },
      "payload": { "typeId": "step", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GTKA000000000000000000", "title": "Order the counter" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 1 },
    { "id": "01J9GEV5000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "phase" },
      "payload": { "id": "phase", "name": "Phase", "icon": "flag", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 2 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.reparented", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
    "payload": { "newParentId": "01J9GTKB000000000000000000" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:05.000Z", "serverTime": "2026-08-20T09:00:05.100Z", "seq": 2
  },
  "expected": {
    "refused": true,
    "rule": "hierarchy.cycle",
    "reason": "This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself."
  }
}
```

`packages/rule-engine/fixtures/reparent-legal-grandchild-up.json` — the accepting twin (a real chain, a legal move):

```json
{
  "name": "pulling a grandchild up under its grandparent is accepted",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "epic" },
      "payload": { "id": "epic", "name": "Epic", "icon": "flag", "rank": 1, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "typeId": "epic", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Opening the second counter" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 1 },
    { "id": "01J9GEV5000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKB000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GTKA000000000000000000", "title": "Fit out the space" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1 },
    { "id": "01J9GEV6000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKC000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GTKB000000000000000000", "title": "Order the counter" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:05.000Z", "serverTime": "2026-08-20T09:00:05.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.reparented", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GTKC000000000000000000" },
    "payload": { "newParentId": "01J9GTKA000000000000000000" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:06.000Z", "serverTime": "2026-08-20T09:00:06.100Z", "seq": 2
  },
  "expected": { "refused": false }
}
```

- [ ] **Step 6: Write the field trio**

`packages/rule-engine/fixtures/field-set-unknown-field.json`:

```json
{
  "name": "setting a field the type never declared is refused",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Pay the supplier" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.field_set", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
    "payload": { "fieldId": "invoice-number", "value": "INV-7" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 2
  },
  "expected": {
    "refused": true,
    "rule": "field.unknown",
    "reason": "This ticket's type has no such field. Add the field to the ticket type first."
  }
}
```

`packages/rule-engine/fixtures/field-set-kind-mismatch.json`:

```json
{
  "name": "text where a number belongs is refused with the field named",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "invoice" },
      "payload": { "id": "invoice", "name": "Invoice", "icon": "receipt", "rank": 3, "workflowId": "wf-basic",
        "fields": [ { "id": "amount", "name": "Invoice amount", "type": "number" } ] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "typeId": "invoice", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Supplier invoice, August" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.field_set", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
    "payload": { "fieldId": "amount", "value": "twelve" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 2
  },
  "expected": {
    "refused": true,
    "rule": "field.type-mismatch",
    "reason": "\"Invoice amount\" needs a number."
  }
}
```

`packages/rule-engine/fixtures/field-set-legal.json` — the accepting twin (same world, a fitting value):

```json
{
  "name": "a number where a number belongs is accepted",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "invoice" },
      "payload": { "id": "invoice", "name": "Invoice", "icon": "receipt", "rank": 3, "workflowId": "wf-basic",
        "fields": [ { "id": "amount", "name": "Invoice amount", "type": "number" } ] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "typeId": "invoice", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Supplier invoice, August" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.field_set", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
    "payload": { "fieldId": "amount", "value": 1200 },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 2
  },
  "expected": { "refused": false }
}
```

- [ ] **Step 6b: Write the terminal-parent trio (owner decision 2026-08-20 — the engine half, end to end)**

`packages/rule-engine/fixtures/created-under-terminal-parent.json`:

```json
{
  "name": "creating live work under a finished parent is refused toward a reopen",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Quarterly filings" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "toStateId": "done" },
      "actorId": "user-anselma", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 2 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GNEW000000000000000000" },
    "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GPAR000000000000000000", "title": "File CGST" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1
  },
  "expected": {
    "refused": true,
    "rule": "hierarchy.parent-terminal",
    "reason": "\"Quarterly filings\" is finished (Done). Adding live work reopens it — choose a state to reopen it to, then add this ticket."
  }
}
```

`packages/rule-engine/fixtures/reparent-live-under-terminal-parent.json` — same `workflowDefs`; the parent finishes, then a live task tries to move under it:

```json
{
  "name": "moving live work under a finished parent is refused toward a reopen",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Quarterly filings" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "toStateId": "done" },
      "actorId": "user-anselma", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 2 },
    { "id": "01J9GEV5000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Renew trade licence" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.reparented", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
    "payload": { "newParentId": "01J9GPAR000000000000000000" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:05.000Z", "serverTime": "2026-08-20T09:00:05.100Z", "seq": 2
  },
  "expected": {
    "refused": true,
    "rule": "hierarchy.parent-terminal",
    "reason": "\"Quarterly filings\" is finished (Done). Moving live work under it reopens it — choose a state to reopen it to, then move this ticket."
  }
}
```

`packages/rule-engine/fixtures/reparent-terminal-under-terminal-parent.json` — the accepting twin: identical `workflowDefs` and `priorEvents` as above PLUS one more prior event (the task also finishes), and the same reparent, now accepted — a terminal child under a terminal parent contradicts nothing:

```json
{
  "name": "a terminal child moving under a terminal parent is accepted",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Quarterly filings" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "toStateId": "done" },
      "actorId": "user-anselma", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 2 },
    { "id": "01J9GEV5000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Renew trade licence" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1 },
    { "id": "01J9GEV6000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "toStateId": "done" },
      "actorId": "user-anselma", "origin": "web", "clientTime": "2026-08-20T09:00:05.000Z", "serverTime": "2026-08-20T09:00:05.100Z", "seq": 2 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.reparented", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
    "payload": { "newParentId": "01J9GPAR000000000000000000" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:06.000Z", "serverTime": "2026-08-20T09:00:06.100Z", "seq": 3
  },
  "expected": { "refused": false }
}
```

- [ ] **Step 7: Run the fixture suite — all thirteen new fixtures plus Plan 2's must pass**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/fixtures.test.ts`
Expected: PASS. If `parent-terminal-with-open-children` fails on the rule name, align `expected.rule` with the id Plan 2 actually published for the parent-terminal invariant (Coordination table) — that is the ONLY permitted edit to `expected`.

- [ ] **Step 8: Commit**

```bash
git add packages/rule-engine/fixtures packages/rule-engine/src/fixtures.test.ts
git commit -m "Thirteen end-to-end fixtures: every hierarchy and field refusal proven against a planted defect through the real engine — including a workspace's own deepest-rank type refused at project root under its own name — with accepting twins so the suite cannot pass by refusing everything"
```

### Task 9: proj_ticket_types — custom types become readable server state

**Files:**
- Create: `apps/server/migrations/1755672000000_proj-ticket-types.js`
- Create: `apps/server/src/projections/ticket-types.ts`
- Create: `apps/server/test/helpers/db.ts` (skip this file only if Plan 1 already ships an equivalent helper; everything else in this task still happens)
- Test: `apps/server/test/proj-ticket-types.test.ts`
- Modify: `apps/server/src/projections/index.ts` (register after `proj_workflows`)

**Interfaces:**
- Consumes: `registerProjection`, `applyEvent`, `resetProjections` (Plan 1); `ticketTypeDefSchema`, `TicketTypeDef`, `makeEnvelope` (`@gisik-nokma/domain`).
- Produces:
  - Table `proj_ticket_types` (snake_case, per workspace, last definition wins)
  - `getTicketTypeFromDb(db: Pool | PoolClient, workspaceId: string, typeId: string): Promise<TicketTypeDef | null>`
  - `ticketTypesProjection` (the registered `{name, apply, reset}`)

- [ ] **Step 1: Write the migration**

```js
// apps/server/migrations/1755672000000_proj-ticket-types.js
exports.up = (pgm) => {
  pgm.createTable('proj_ticket_types', {
    workspace_id: { type: 'text', notNull: true },
    type_id: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    icon: { type: 'text', notNull: true },
    rank: { type: 'integer', notNull: true },
    workflow_id: { type: 'text', notNull: true },
    fields: { type: 'jsonb', notNull: true, default: '[]' },
    defined_by: { type: 'text', notNull: true },
    defined_at: { type: 'timestamptz', notNull: true },
  });
  pgm.addConstraint('proj_ticket_types', 'proj_ticket_types_pk', {
    primaryKey: ['workspace_id', 'type_id'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('proj_ticket_types');
};
```

- [ ] **Step 2: Write the test DB helper** (skip if Plan 1 ships one — then use Plan 1's in every server test below)

```ts
// apps/server/test/helpers/db.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import migrationRunner from 'node-pg-migrate';
import { Pool } from 'pg';

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/gisik_nokma_test';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

/** Migrated pool for integration tests. Callers own pool.end(). */
export async function testPool(): Promise<Pool> {
  await migrationRunner({
    databaseUrl: DATABASE_URL,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => undefined,
  });
  return new Pool({ connectionString: DATABASE_URL });
}

/** Empty ledger + all projections between tests. */
export async function wipe(db: Pool): Promise<void> {
  const { resetProjections } = await import('../../src/projections/index');
  await db.query('DELETE FROM events');
  await resetProjections(db);
}
```

- [ ] **Step 3: Write the failing test**

```ts
// apps/server/test/proj-ticket-types.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { makeEnvelope } from '@gisik-nokma/domain';
import { applyEvent } from '../src/projections/index';
import { getTicketTypeFromDb } from '../src/projections/ticket-types';
import { testPool, wipe } from './helpers/db';

const WS = '01J9GWS0000000000000000000';

const db: Pool = await testPool();
beforeEach(async () => wipe(db));
afterAll(async () => db.end());

function typeDefined(payload: object) {
  return makeEnvelope({
    type: 'ticket-type.defined',
    entity: { kind: 'ticket-type', id: (payload as { id: string }).id },
    workspaceId: WS,
    payload,
  });
}

describe('proj_ticket_types', () => {
  it('a defined type becomes readable, scoped to its workspace', async () => {
    await applyEvent(db, typeDefined({
      id: 'invoice', name: 'Invoice', icon: 'receipt', rank: 3, workflowId: 'wf-basic',
      fields: [{ id: 'amount', name: 'Invoice amount', type: 'number' }],
    }));
    expect(await getTicketTypeFromDb(db, WS, 'invoice')).toEqual({
      id: 'invoice', name: 'Invoice', icon: 'receipt', rank: 3, workflowId: 'wf-basic',
      fields: [{ id: 'amount', name: 'Invoice amount', type: 'number' }],
    });
    expect(await getTicketTypeFromDb(db, '01J9GWSB000000000000000000', 'invoice')).toBeNull();
  });

  it('last definition wins — types are events', async () => {
    await applyEvent(db, typeDefined({ id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] }));
    await applyEvent(db, typeDefined({ id: 'task', name: 'Task', icon: 'check', rank: 5, workflowId: 'wf-basic', fields: [] }));
    expect((await getTicketTypeFromDb(db, WS, 'task'))?.rank).toBe(5);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter server exec vitest run test/proj-ticket-types.test.ts`
Expected: FAIL — cannot find module `../src/projections/ticket-types` (run `pnpm --filter server exec node-pg-migrate up` first if the failure is a missing table instead).

- [ ] **Step 5: Implement the projection**

```ts
// apps/server/src/projections/ticket-types.ts
import type { Pool, PoolClient } from 'pg';
import type { EventEnvelope, TicketTypeDef } from '@gisik-nokma/domain';
import { ticketTypeDefSchema } from '@gisik-nokma/domain';

export const ticketTypesProjection = {
  name: 'proj_ticket_types',

  async apply(env: EventEnvelope, db: PoolClient): Promise<void> {
    if (env.type !== 'ticket-type.defined') return;
    const def = ticketTypeDefSchema.parse(env.payload);
    await db.query(
      `INSERT INTO proj_ticket_types
         (workspace_id, type_id, name, icon, rank, workflow_id, fields, defined_by, defined_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (workspace_id, type_id) DO UPDATE SET
         name = EXCLUDED.name, icon = EXCLUDED.icon, rank = EXCLUDED.rank,
         workflow_id = EXCLUDED.workflow_id, fields = EXCLUDED.fields,
         defined_by = EXCLUDED.defined_by, defined_at = EXCLUDED.defined_at`,
      [env.workspaceId, def.id, def.name, def.icon, def.rank, def.workflowId,
       JSON.stringify(def.fields), env.actorId, env.serverTime],
    );
  },

  async reset(db: PoolClient): Promise<void> {
    await db.query('DELETE FROM proj_ticket_types');
  },
};

export async function getTicketTypeFromDb(
  db: Pool | PoolClient,
  workspaceId: string,
  typeId: string,
): Promise<TicketTypeDef | null> {
  const res = await db.query(
    'SELECT type_id, name, icon, rank, workflow_id, fields FROM proj_ticket_types WHERE workspace_id = $1 AND type_id = $2',
    [workspaceId, typeId],
  );
  if (res.rowCount === 0) return null;
  const row = res.rows[0];
  return {
    id: row.type_id, name: row.name, icon: row.icon, rank: row.rank,
    workflowId: row.workflow_id, fields: row.fields,
  };
}
```

Register it in `apps/server/src/projections/index.ts`, directly AFTER `proj_workflows` (order is apply order):

```ts
import { ticketTypesProjection } from './ticket-types';

registerProjection(ticketTypesProjection);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter server exec vitest run test/proj-ticket-types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/server/migrations/1755672000000_proj-ticket-types.js apps/server/src/projections/ticket-types.ts apps/server/src/projections/index.ts apps/server/test/helpers/db.ts apps/server/test/proj-ticket-types.test.ts
git commit -m "Custom ticket types projected per workspace, last definition winning, with who defined them and when kept alongside — the first table the hierarchy checks will read"
```

### Task 10: proj_tickets — head state per ticket, driven by the shared reducer

**Files:**
- Create: `apps/server/migrations/1755672100000_proj-tickets.js`
- Create: `apps/server/src/projections/tickets.ts`
- Test: `apps/server/test/proj-tickets.test.ts`
- Modify: `apps/server/src/projections/index.ts` (register after `proj_ticket_types`)

**Interfaces:**
- Consumes: `applyTicketEvent`, `TICKET_EVENT_TYPES`, and this exact shape (defined in Plan 2's domain per the coordination doc §4, produced by Task 3's reducer, echoed for the implementer):

```ts
type FieldClaim = { value: unknown; actorId: string; clientTime: string; serverTime: string };
type TicketState = {
  kind: 'ticket';
  id: string; workspaceId: string; projectId: string; typeId: string;
  parentId: string | null; workflowId: string; workflowVersion: number;
  stateId: string; stateCategory: StateCategory;
  assigneeId: string | null; collaboratorIds: string[];
  fields: Record<string, FieldClaim>;
  transitions: { toStateId: string; actorId: string; seq: number }[];
};
```

- Also consumes: `getTicketTypeFromDb` (Task 9), `getWorkflowDef(db, workspaceId, workflowId, version?)` (Plan 2), `applyEvent`/`resetProjections` (Plan 1).
- Produces:
  - Table `proj_tickets`
  - `ticketsProjection` (the registered `{name, apply, reset}`)
  - `getTicketStateFromDb(db, workspaceId, ticketId): Promise<TicketState | null>`
  - `getChildrenStatesFromDb(db, workspaceId, parentId): Promise<TicketState[]>` — DIRECT children only

- [ ] **Step 1: Write the migration**

```js
// apps/server/migrations/1755672100000_proj-tickets.js
exports.up = (pgm) => {
  pgm.createTable('proj_tickets', {
    ticket_id: { type: 'text', primaryKey: true },
    workspace_id: { type: 'text', notNull: true },
    project_id: { type: 'text', notNull: true },
    type_id: { type: 'text', notNull: true },
    parent_id: { type: 'text', notNull: false },
    workflow_id: { type: 'text', notNull: true },
    workflow_version: { type: 'integer', notNull: true },
    state_id: { type: 'text', notNull: true },
    state_category: { type: 'text', notNull: true },
    assignee_id: { type: 'text', notNull: false },
    collaborator_ids: { type: 'jsonb', notNull: true, default: '[]' },
    fields: { type: 'jsonb', notNull: true, default: '{}' },
    transitions: { type: 'jsonb', notNull: true, default: '[]' },
  });
  pgm.addConstraint('proj_tickets', 'proj_tickets_state_category_check', {
    check: "state_category IN ('open', 'active', 'terminal')",
  });
  pgm.createIndex('proj_tickets', ['workspace_id', 'parent_id']);
  pgm.createIndex('proj_tickets', ['workspace_id', 'project_id']);
};

exports.down = (pgm) => {
  pgm.dropTable('proj_tickets');
};
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/server/test/proj-tickets.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { makeEnvelope } from '@gisik-nokma/domain';
import { applyEvent, resetProjections } from '../src/projections/index';
import { getChildrenStatesFromDb, getTicketStateFromDb } from '../src/projections/tickets';
import { testPool, wipe } from './helpers/db';

const WS = '01J9GWS0000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const PARENT = '01J9GPAR000000000000000000';
const CHILD = '01J9GCHA000000000000000000';
const GRANDCHILD = '01J9GCHB000000000000000000';

const WF_DEFINED = makeEnvelope({
  type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf-basic' }, workspaceId: WS,
  payload: {
    id: 'wf-basic', version: 1, name: 'Basic', initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [
      { from: '*', to: 'todo', rules: [] },
      { from: '*', to: 'doing', rules: [] },
      { from: '*', to: 'done', rules: [] },
    ],
  },
});

function typeDefined(id: string, rank: number) {
  return makeEnvelope({ type: 'ticket-type.defined', entity: { kind: 'ticket-type', id }, workspaceId: WS,
    payload: { id, name: id[0].toUpperCase() + id.slice(1), icon: 'check', rank, workflowId: 'wf-basic', fields: [] } });
}
function created(id: string, typeId: string, parentId: string | null, title: string) {
  return makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id }, workspaceId: WS,
    payload: { typeId, projectId: PROJECT, parentId, title } });
}
function ticketEvent(id: string, type: string, payload: object) {
  return makeEnvelope({ type, entity: { kind: 'ticket', id }, workspaceId: WS, payload });
}

const SEED = [
  WF_DEFINED, typeDefined('story', 2), typeDefined('task', 3),
  created(PARENT, 'story', null, 'Quarterly filings'),
  created(CHILD, 'task', PARENT, 'File GST'),
  created(GRANDCHILD, 'task', CHILD, 'Collect challans'),
];

const db: Pool = await testPool();
beforeEach(async () => wipe(db));
afterAll(async () => db.end());

describe('proj_tickets', () => {
  it('creation lands in the workflow initial state with the title as an attributed claim', async () => {
    for (const env of SEED) await applyEvent(db, env);
    const state = await getTicketStateFromDb(db, WS, PARENT);
    expect(state).toMatchObject({
      id: PARENT, workspaceId: WS, projectId: PROJECT, typeId: 'story', parentId: null,
      workflowId: 'wf-basic', stateId: 'todo', stateCategory: 'open',
      assigneeId: null, collaboratorIds: [],
    });
    expect(state?.fields.title).toMatchObject({ value: 'Quarterly filings', actorId: 'user-kiro' });
  });

  it('transition, assignment, collaborators, and field claims update head state with provenance', async () => {
    for (const env of SEED) await applyEvent(db, env);
    await applyEvent(db, ticketEvent(CHILD, 'ticket.transitioned', { toStateId: 'done' }));
    await applyEvent(db, ticketEvent(CHILD, 'ticket.assigned', { assigneeId: 'user-anselma' }));
    await applyEvent(db, ticketEvent(CHILD, 'ticket.collaborator_added', { userId: 'user-kiro' }));
    await applyEvent(db, ticketEvent(CHILD, 'ticket.field_set', { fieldId: 'dueDate', value: { date: '2026-08-30', note: 'GST' } }));
    const state = await getTicketStateFromDb(db, WS, CHILD);
    expect(state).toMatchObject({ stateId: 'done', stateCategory: 'terminal', assigneeId: 'user-anselma', collaboratorIds: ['user-kiro'] });
    expect(state?.fields.dueDate).toMatchObject({ value: { date: '2026-08-30', note: 'GST' }, actorId: 'user-kiro' });
    expect(typeof state?.fields.dueDate.clientTime).toBe('string');
    expect(typeof state?.fields.dueDate.serverTime).toBe('string');
  });

  it('getChildrenStates returns DIRECT children only', async () => {
    for (const env of SEED) await applyEvent(db, env);
    const children = await getChildrenStatesFromDb(db, WS, PARENT);
    expect(children.map((c) => c.id)).toEqual([CHILD]);
  });

  it('rebuild-and-diff: reset and replay produces the identical table', async () => {
    const events = [...SEED,
      ticketEvent(CHILD, 'ticket.transitioned', { toStateId: 'doing' }),
      ticketEvent(GRANDCHILD, 'ticket.reparented', { newParentId: PARENT }),
    ];
    for (const env of events) await applyEvent(db, env);
    const first = (await db.query('SELECT * FROM proj_tickets ORDER BY ticket_id')).rows;
    await resetProjections(db);
    for (const env of events) await applyEvent(db, env);
    const second = (await db.query('SELECT * FROM proj_tickets ORDER BY ticket_id')).rows;
    expect(second).toEqual(first);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter server exec vitest run test/proj-tickets.test.ts`
Expected: FAIL — cannot find module `../src/projections/tickets`.

- [ ] **Step 4: Implement the projection**

```ts
// apps/server/src/projections/tickets.ts
import type { Pool, PoolClient } from 'pg';
import type { EventEnvelope, TicketState, TicketStateDeps } from '@gisik-nokma/domain';
import { TICKET_EVENT_TYPES, applyTicketEvent, ticketCreatedPayload } from '@gisik-nokma/domain';
import { getTicketTypeFromDb } from './ticket-types';
import { getWorkflowDef } from './workflows';

function rowToTicketState(row: Record<string, unknown>): TicketState {
  return {
    kind: 'ticket',
    id: row.ticket_id as string,
    workspaceId: row.workspace_id as string,
    projectId: row.project_id as string,
    typeId: row.type_id as string,
    parentId: row.parent_id as string | null,
    workflowId: row.workflow_id as string,
    workflowVersion: row.workflow_version as number,
    stateId: row.state_id as string,
    stateCategory: row.state_category as TicketState['stateCategory'],
    assigneeId: row.assignee_id as string | null,
    collaboratorIds: row.collaborator_ids as string[],
    fields: row.fields as TicketState['fields'],
    transitions: row.transitions as TicketState['transitions'],
  };
}

export async function getTicketStateFromDb(
  db: Pool | PoolClient,
  workspaceId: string,
  ticketId: string,
): Promise<TicketState | null> {
  const res = await db.query(
    'SELECT * FROM proj_tickets WHERE workspace_id = $1 AND ticket_id = $2',
    [workspaceId, ticketId],
  );
  return res.rowCount === 0 ? null : rowToTicketState(res.rows[0]);
}

/** DIRECT children only — the invariant's "open children" are direct non-terminal children. */
export async function getChildrenStatesFromDb(
  db: Pool | PoolClient,
  workspaceId: string,
  parentId: string,
): Promise<TicketState[]> {
  const res = await db.query(
    'SELECT * FROM proj_tickets WHERE workspace_id = $1 AND parent_id = $2 ORDER BY ticket_id',
    [workspaceId, parentId],
  );
  return res.rows.map(rowToTicketState);
}

/**
 * Pre-fetches the defs the pure reducer may need, then hands it synchronous
 * lookups. The reducer is the same function the fixture suite uses — the
 * projection adds only persistence.
 */
async function loadDeps(db: PoolClient, env: EventEnvelope, current: TicketState | undefined): Promise<TicketStateDeps> {
  let typeId: string | undefined;
  let workflowId: string | undefined;
  if (env.type === 'ticket.created') {
    typeId = ticketCreatedPayload.parse(env.payload).typeId;
  } else if (env.type === 'ticket.transitioned') {
    workflowId = current?.workflowId;
  }
  const type = typeId ? await getTicketTypeFromDb(db, env.workspaceId, typeId) : null;
  const wfId = workflowId ?? type?.workflowId;
  const workflow = wfId ? await getWorkflowDef(db, env.workspaceId, wfId) : null;
  return {
    getTicketType: (id) => (type !== null && id === type.id ? type : undefined),
    getWorkflow: (id) => (workflow !== null && id === workflow.id ? workflow : undefined),
  };
}

export const ticketsProjection = {
  name: 'proj_tickets',

  async apply(env: EventEnvelope, db: PoolClient): Promise<void> {
    if (!(TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) return;
    const current = (await getTicketStateFromDb(db, env.workspaceId, env.entity.id)) ?? undefined;
    const deps = await loadDeps(db, env, current);
    const next = applyTicketEvent(current, env, deps);
    await db.query(
      `INSERT INTO proj_tickets
         (ticket_id, workspace_id, project_id, type_id, parent_id, workflow_id, workflow_version,
          state_id, state_category, assignee_id, collaborator_ids, fields, transitions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (ticket_id) DO UPDATE SET
         project_id = EXCLUDED.project_id, type_id = EXCLUDED.type_id,
         parent_id = EXCLUDED.parent_id, workflow_id = EXCLUDED.workflow_id,
         workflow_version = EXCLUDED.workflow_version,
         state_id = EXCLUDED.state_id, state_category = EXCLUDED.state_category,
         assignee_id = EXCLUDED.assignee_id, collaborator_ids = EXCLUDED.collaborator_ids,
         fields = EXCLUDED.fields, transitions = EXCLUDED.transitions`,
      [next.id, next.workspaceId, next.projectId, next.typeId, next.parentId, next.workflowId, next.workflowVersion,
       next.stateId, next.stateCategory, next.assigneeId,
       JSON.stringify(next.collaboratorIds), JSON.stringify(next.fields), JSON.stringify(next.transitions)],
    );
  },

  async reset(db: PoolClient): Promise<void> {
    await db.query('DELETE FROM proj_tickets');
  },
};
```

Register it in `apps/server/src/projections/index.ts`, directly AFTER `ticketTypesProjection`:

```ts
import { ticketsProjection } from './tickets';

registerProjection(ticketsProjection);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter server exec vitest run test/proj-tickets.test.ts`
Expected: PASS (4 tests) — including rebuild-and-diff, which is the freshness gate for this table.

- [ ] **Step 6: Commit**

```bash
git add apps/server/migrations/1755672100000_proj-tickets.js apps/server/src/projections/tickets.ts apps/server/src/projections/index.ts apps/server/test/proj-tickets.test.ts
git commit -m "Ticket head state is now a real table fed by the same reducer the fixtures run — field claims keep their claimant and both clocks, and reset-plus-replay reproduces it byte for byte"
```

### Task 11: proj_rollups — derived child progress, direct children only, never authored

**Files:**
- Create: `apps/server/migrations/1755672200000_proj-rollups.js`
- Create: `apps/server/src/projections/rollups.ts`
- Test: `apps/server/test/proj-rollups.test.ts`
- Modify: `apps/server/src/projections/index.ts` (register after `proj_tickets` — order is load-bearing)

**Interfaces:**
- Consumes: `proj_tickets` rows (Task 10 — this projection reads them, so it MUST be registered after `ticketsProjection`; on rebuild the registry replays in the same order, keeping it deterministic).
- Produces:
  - Table `proj_rollups`
  - `rollupsProjection` (the registered `{name, apply, reset}`)
  - `type RollupRow = { parentTicketId: string; workspaceId: string; projectId: string; totalChildren: number; openChildren: number; activeChildren: number; terminalChildren: number }`
  - `getRollup(db, workspaceId, parentTicketId): Promise<RollupRow | null>`

**Semantics:** DIRECT children only. Per-category counts plus total; the invariant's "open children" (spec §4: non-terminal) is `totalChildren - terminalChildren`. Direct-only suffices by induction — the parent-terminal refusal holds at every level, so a terminal child's own subtree was already settled when it went terminal. On `ticket.reparented` the projection recomputes every parent in the ticket's project (old and new parent are always in the same project — cross-project reparents are refused) and deletes rows for parents left childless; on `ticket.created`/`ticket.transitioned` it recomputes just the one affected parent. Nothing else ever writes this table: derived progress is never authored.

- [ ] **Step 1: Write the migration**

```js
// apps/server/migrations/1755672200000_proj-rollups.js
exports.up = (pgm) => {
  pgm.createTable('proj_rollups', {
    parent_ticket_id: { type: 'text', primaryKey: true },
    workspace_id: { type: 'text', notNull: true },
    project_id: { type: 'text', notNull: true },
    total_children: { type: 'integer', notNull: true },
    open_children: { type: 'integer', notNull: true },
    active_children: { type: 'integer', notNull: true },
    terminal_children: { type: 'integer', notNull: true },
  });
  pgm.createIndex('proj_rollups', ['workspace_id', 'project_id']);
};

exports.down = (pgm) => {
  pgm.dropTable('proj_rollups');
};
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/server/test/proj-rollups.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { makeEnvelope } from '@gisik-nokma/domain';
import { applyEvent, resetProjections } from '../src/projections/index';
import { getRollup } from '../src/projections/rollups';
import { testPool, wipe } from './helpers/db';

const WS = '01J9GWS0000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const PARENT = '01J9GPAR000000000000000000';
const OTHER = '01J9GTKB000000000000000000';
const C1 = '01J9GCHA000000000000000000';
const C2 = '01J9GCHB000000000000000000';

const WF_DEFINED = makeEnvelope({
  type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf-basic' }, workspaceId: WS,
  payload: {
    id: 'wf-basic', version: 1, name: 'Basic', initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [
      { from: '*', to: 'todo', rules: [] },
      { from: '*', to: 'doing', rules: [] },
      { from: '*', to: 'done', rules: [] },
    ],
  },
});

function typeDefined(id: string, rank: number) {
  return makeEnvelope({ type: 'ticket-type.defined', entity: { kind: 'ticket-type', id }, workspaceId: WS,
    payload: { id, name: id[0].toUpperCase() + id.slice(1), icon: 'check', rank, workflowId: 'wf-basic', fields: [] } });
}
function created(id: string, typeId: string, parentId: string | null, title: string) {
  return makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id }, workspaceId: WS,
    payload: { typeId, projectId: PROJECT, parentId, title } });
}
function ticketEvent(id: string, type: string, payload: object) {
  return makeEnvelope({ type, entity: { kind: 'ticket', id }, workspaceId: WS, payload });
}

const SEED = [
  WF_DEFINED, typeDefined('story', 2), typeDefined('task', 3),
  created(PARENT, 'story', null, 'Quarterly filings'),
  created(OTHER, 'story', null, 'Counter opening'),
  created(C1, 'task', PARENT, 'File GST'),
  created(C2, 'task', PARENT, 'File TDS'),
];

const db: Pool = await testPool();
beforeEach(async () => wipe(db));
afterAll(async () => db.end());

describe('proj_rollups', () => {
  it('counts direct children per category as they are created and transition', async () => {
    for (const env of SEED) await applyEvent(db, env);
    expect(await getRollup(db, WS, PARENT)).toEqual({
      parentTicketId: PARENT, workspaceId: WS, projectId: PROJECT,
      totalChildren: 2, openChildren: 2, activeChildren: 0, terminalChildren: 0,
    });
    await applyEvent(db, ticketEvent(C1, 'ticket.transitioned', { toStateId: 'doing' }));
    await applyEvent(db, ticketEvent(C2, 'ticket.transitioned', { toStateId: 'done' }));
    expect(await getRollup(db, WS, PARENT)).toMatchObject({
      totalChildren: 2, openChildren: 0, activeChildren: 1, terminalChildren: 1,
    });
  });

  it('a childless ticket has no rollup row — absence, not zeros, because nothing is invented', async () => {
    for (const env of SEED) await applyEvent(db, env);
    expect(await getRollup(db, WS, C1)).toBeNull();
  });

  it('reparent moves the counts between parents and removes an emptied parent row', async () => {
    for (const env of SEED) await applyEvent(db, env);
    await applyEvent(db, ticketEvent(C1, 'ticket.reparented', { newParentId: OTHER }));
    expect(await getRollup(db, WS, PARENT)).toMatchObject({ totalChildren: 1 });
    expect(await getRollup(db, WS, OTHER)).toMatchObject({ totalChildren: 1 });
    await applyEvent(db, ticketEvent(C2, 'ticket.reparented', { newParentId: OTHER }));
    expect(await getRollup(db, WS, PARENT)).toBeNull();
    expect(await getRollup(db, WS, OTHER)).toMatchObject({ totalChildren: 2 });
  });

  it('rebuild-and-diff: reset and replay reproduces the rollups exactly', async () => {
    const events = [...SEED,
      ticketEvent(C1, 'ticket.transitioned', { toStateId: 'done' }),
      ticketEvent(C2, 'ticket.reparented', { newParentId: OTHER }),
    ];
    for (const env of events) await applyEvent(db, env);
    const first = (await db.query('SELECT * FROM proj_rollups ORDER BY parent_ticket_id')).rows;
    await resetProjections(db);
    for (const env of events) await applyEvent(db, env);
    const second = (await db.query('SELECT * FROM proj_rollups ORDER BY parent_ticket_id')).rows;
    expect(second).toEqual(first);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter server exec vitest run test/proj-rollups.test.ts`
Expected: FAIL — cannot find module `../src/projections/rollups`.

- [ ] **Step 4: Implement the projection**

```ts
// apps/server/src/projections/rollups.ts
import type { Pool, PoolClient } from 'pg';
import type { EventEnvelope } from '@gisik-nokma/domain';
import { ticketCreatedPayload } from '@gisik-nokma/domain';

export type RollupRow = {
  parentTicketId: string;
  workspaceId: string;
  projectId: string;
  totalChildren: number;
  openChildren: number;
  activeChildren: number;
  terminalChildren: number;
};

export async function getRollup(
  db: Pool | PoolClient,
  workspaceId: string,
  parentTicketId: string,
): Promise<RollupRow | null> {
  const res = await db.query(
    'SELECT * FROM proj_rollups WHERE workspace_id = $1 AND parent_ticket_id = $2',
    [workspaceId, parentTicketId],
  );
  if (res.rowCount === 0) return null;
  const row = res.rows[0];
  return {
    parentTicketId: row.parent_ticket_id, workspaceId: row.workspace_id, projectId: row.project_id,
    totalChildren: row.total_children, openChildren: row.open_children,
    activeChildren: row.active_children, terminalChildren: row.terminal_children,
  };
}

/** Recompute one parent's direct-children counts from proj_tickets; drop the row when childless. */
async function recomputeParent(db: PoolClient, workspaceId: string, parentId: string): Promise<void> {
  await db.query(
    `INSERT INTO proj_rollups
       (parent_ticket_id, workspace_id, project_id, total_children, open_children, active_children, terminal_children)
     SELECT $2, $1, min(project_id), count(*),
            count(*) FILTER (WHERE state_category = 'open'),
            count(*) FILTER (WHERE state_category = 'active'),
            count(*) FILTER (WHERE state_category = 'terminal')
     FROM proj_tickets WHERE workspace_id = $1 AND parent_id = $2
     HAVING count(*) > 0
     ON CONFLICT (parent_ticket_id) DO UPDATE SET
       total_children = EXCLUDED.total_children, open_children = EXCLUDED.open_children,
       active_children = EXCLUDED.active_children, terminal_children = EXCLUDED.terminal_children`,
    [workspaceId, parentId],
  );
  await db.query(
    `DELETE FROM proj_rollups WHERE workspace_id = $1 AND parent_ticket_id = $2
       AND NOT EXISTS (SELECT 1 FROM proj_tickets WHERE workspace_id = $1 AND parent_id = $2)`,
    [workspaceId, parentId],
  );
}

/** Reparent: old and new parent share a project (cross-project is refused), so recompute the whole project's parents. */
async function recomputeProject(db: PoolClient, workspaceId: string, projectId: string): Promise<void> {
  const parents = await db.query(
    `SELECT DISTINCT parent_id FROM proj_tickets
     WHERE workspace_id = $1 AND project_id = $2 AND parent_id IS NOT NULL`,
    [workspaceId, projectId],
  );
  for (const row of parents.rows) {
    await recomputeParent(db, workspaceId, row.parent_id);
  }
  await db.query(
    `DELETE FROM proj_rollups WHERE workspace_id = $1 AND project_id = $2
       AND parent_ticket_id NOT IN (
         SELECT parent_id FROM proj_tickets
         WHERE workspace_id = $1 AND project_id = $2 AND parent_id IS NOT NULL)`,
    [workspaceId, projectId],
  );
}

export const rollupsProjection = {
  name: 'proj_rollups',

  /** Runs AFTER ticketsProjection for the same event — registration order is apply order. */
  async apply(env: EventEnvelope, db: PoolClient): Promise<void> {
    if (env.type === 'ticket.created') {
      const p = ticketCreatedPayload.parse(env.payload);
      if (p.parentId !== null) await recomputeParent(db, env.workspaceId, p.parentId);
      return;
    }
    if (env.type === 'ticket.transitioned') {
      const res = await db.query(
        'SELECT parent_id FROM proj_tickets WHERE workspace_id = $1 AND ticket_id = $2',
        [env.workspaceId, env.entity.id],
      );
      const parentId = res.rows[0]?.parent_id ?? null; // unchanged by a transition
      if (parentId !== null) await recomputeParent(db, env.workspaceId, parentId);
      return;
    }
    if (env.type === 'ticket.reparented') {
      const res = await db.query(
        'SELECT project_id FROM proj_tickets WHERE workspace_id = $1 AND ticket_id = $2',
        [env.workspaceId, env.entity.id],
      );
      if (res.rowCount > 0) await recomputeProject(db, env.workspaceId, res.rows[0].project_id);
    }
  },

  async reset(db: PoolClient): Promise<void> {
    await db.query('DELETE FROM proj_rollups');
  },
};
```

Register it in `apps/server/src/projections/index.ts`, directly AFTER `ticketsProjection` (this order is load-bearing — the rollup reads the ticket table the same event just updated):

```ts
import { rollupsProjection } from './rollups';

registerProjection(rollupsProjection);
```

- [ ] **Step 5: Run the test to verify it passes, then the verify-projections CLI once**

Run: `pnpm --filter server exec vitest run test/proj-rollups.test.ts`
Expected: PASS (4 tests).
Run: `pnpm --filter server verify-projections` (Plan 1's rebuild-and-diff CLI, name per Coordination) with `DATABASE_URL=$TEST_DATABASE_URL`
Expected: reports zero drift for `proj_ticket_types`, `proj_tickets`, and `proj_rollups`.

- [ ] **Step 6: Commit**

```bash
git add apps/server/migrations/1755672200000_proj-rollups.js apps/server/src/projections/rollups.ts apps/server/src/projections/index.ts apps/server/test/proj-rollups.test.ts
git commit -m "Derived child progress as a projection nothing else may write: direct children counted per category, childless parents absent rather than zeroed, reparents recomputed project-wide because the refusals guarantee both parents share one"
```

### Task 12: The server EngineContext — ctx.getChildrenStates becomes real

**Files:**
- Create: `apps/server/src/engine-context.ts` (if Plan 1/2 already created this file with `getWorkflowDef` wiring, merge the ticket lookups into it rather than adding a second factory)
- Test: `apps/server/test/engine-context.test.ts`
- Modify: `apps/server/src/ingest.ts` (only if ingest still constructs a stub context — point it at `createEngineContext`)

**Interfaces:**
- Consumes: `getTicketStateFromDb`, `getChildrenStatesFromDb` (Task 10); `getTicketTypeFromDb` (Task 9); `getWorkflowDef` (Plan 2); `EngineContext` (Plan 2). `TicketState` — exactly the merged cross-plan shape (Plan 2's definition, coordination doc §4):

```ts
type TicketState = {
  kind: 'ticket';
  id: string; workspaceId: string; projectId: string; typeId: string;
  parentId: string | null; workflowId: string; workflowVersion: number;
  stateId: string; stateCategory: StateCategory;
  assigneeId: string | null; collaboratorIds: string[];
  fields: Record<string, FieldClaim>;
  transitions: { toStateId: string; actorId: string; seq: number }[];
};
```

- Produces: `createEngineContext(db: Pool, workspaceId: string): EngineContext` — the context ingest passes to `evaluateEvent`; `getEntityState('ticket', id)` returns a `TicketState`, `getEntityState('ticket-type', id)` returns a `TicketTypeDef`, `getChildrenStates` returns DIRECT children.

- [ ] **Step 1: Write the failing test — the parent-terminal invariant now works against Postgres, end to end**

```ts
// apps/server/test/engine-context.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { makeEnvelope } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createEngineContext } from '../src/engine-context';
import { applyEvent } from '../src/projections/index';
import { testPool, wipe } from './helpers/db';

const WS = '01J9GWS0000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const PARENT = '01J9GPAR000000000000000000';
const C1 = '01J9GCHA000000000000000000';
const C2 = '01J9GCHB000000000000000000';

const WF_DEFINED = makeEnvelope({
  type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf-basic' }, workspaceId: WS,
  payload: {
    id: 'wf-basic', version: 1, name: 'Basic', initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [
      { from: '*', to: 'todo', rules: [] },
      { from: '*', to: 'doing', rules: [] },
      { from: '*', to: 'done', rules: [] },
    ],
  },
});

function typeDefined(id: string, rank: number) {
  return makeEnvelope({ type: 'ticket-type.defined', entity: { kind: 'ticket-type', id }, workspaceId: WS,
    payload: { id, name: id[0].toUpperCase() + id.slice(1), icon: 'check', rank, workflowId: 'wf-basic', fields: [] } });
}
function created(id: string, typeId: string, parentId: string | null, title: string) {
  return makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id }, workspaceId: WS,
    payload: { typeId, projectId: PROJECT, parentId, title } });
}
function transitioned(id: string, toStateId: string) {
  return makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id }, workspaceId: WS, payload: { toStateId } });
}

const db: Pool = await testPool();
beforeEach(async () => wipe(db));
afterAll(async () => db.end());

async function seedFamily(): Promise<void> {
  for (const env of [
    WF_DEFINED, typeDefined('story', 2), typeDefined('task', 3),
    created(PARENT, 'story', null, 'Quarterly filings'),
    created(C1, 'task', PARENT, 'File GST'),
    created(C2, 'task', PARENT, 'File TDS'),
    transitioned(C1, 'done'),
  ]) await applyEvent(db, env);
}

describe('createEngineContext', () => {
  it('serves ticket state, type defs, and DIRECT children from the projections', async () => {
    await seedFamily();
    const ctx = createEngineContext(db, WS);
    const parent = (await ctx.getEntityState('ticket', PARENT)) as { stateCategory: string };
    expect(parent.stateCategory).toBe('open');
    const type = (await ctx.getEntityState('ticket-type', 'task')) as { rank: number };
    expect(type.rank).toBe(3);
    const children = await ctx.getChildrenStates(PARENT);
    expect(children.map((c) => [c.id, c.stateCategory]).sort()).toEqual([[C1, 'terminal'], [C2, 'open']]);
    expect(await ctx.getWorkflowDef('wf-basic')).toMatchObject({ id: 'wf-basic', initialStateId: 'todo' });
  });

  it('invariant 3 end to end against Postgres: parent terminal with an open child is refused, accepted once all are done', async () => {
    await seedFamily();
    const ctx = createEngineContext(db, WS);
    const candidate = transitioned(PARENT, 'done');
    const verdict = await evaluateEvent(candidate, ctx);
    expect(verdict).toMatchObject({ refused: true, rule: 'parent-terminal-with-open-children' });
    await applyEvent(db, transitioned(C2, 'done'));
    expect(await evaluateEvent(candidate, ctx)).toEqual({ refused: false });
  });

  it('hierarchy refusals run against Postgres state too', async () => {
    await seedFamily();
    const ctx = createEngineContext(db, WS);
    const epicUnderStory = makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: '01J9GNEW000000000000000000' }, workspaceId: WS,
      payload: { typeId: 'epic', projectId: PROJECT, parentId: PARENT, title: 'x' } });
    expect(await evaluateEvent(epicUnderStory, ctx)).toMatchObject({ rule: 'ticket.unknown-type' });
    await applyEvent(db, typeDefined('epic', 1));
    expect(await evaluateEvent(epicUnderStory, ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.rank',
      reason: '"Epic" cannot go under "Story": a ticket\'s parent must be a bigger kind of work.',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter server exec vitest run test/engine-context.test.ts`
Expected: FAIL — cannot find module `../src/engine-context`.

- [ ] **Step 3: Implement the context factory**

```ts
// apps/server/src/engine-context.ts
import type { Pool } from 'pg';
import type { EngineContext } from '@gisik-nokma/rule-engine';
import { getTicketTypeFromDb } from './projections/ticket-types';
import { getChildrenStatesFromDb, getTicketStateFromDb } from './projections/tickets';
import { getWorkflowDef } from './projections/workflows';

/**
 * The server's real EngineContext, bound to one workspace. Ingest builds one
 * per incoming event and hands it to evaluateEvent — the same reads the
 * fixture suite's in-memory context implements, now backed by projections.
 * Entity kinds owned by later plans (workspace, project, membership) resolve
 * to null until those plans land.
 */
export function createEngineContext(db: Pool, workspaceId: string): EngineContext {
  return {
    async getEntityState(kind, id) {
      if (kind === 'ticket') return getTicketStateFromDb(db, workspaceId, id);
      if (kind === 'ticket-type') return getTicketTypeFromDb(db, workspaceId, id);
      return null;
    },
    async getChildrenStates(ticketId) {
      return getChildrenStatesFromDb(db, workspaceId, ticketId);
    },
    async getWorkflowDef(workflowId, version) {
      return getWorkflowDef(db, workspaceId, workflowId, version);
    },
  };
}
```

If `apps/server/src/ingest.ts` still builds a stub context (Plan 1 scaffolding), replace that construction with `createEngineContext(db, env.workspaceId)` so every ingested event is evaluated against real state.

- [ ] **Step 4: Run the test to verify it passes, then the full server suite**

Run: `pnpm --filter server exec vitest run test/engine-context.test.ts`
Expected: PASS (3 tests).
Run: `pnpm --filter server exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/engine-context.ts apps/server/test/engine-context.test.ts
git commit -m "The engine's context is now backed by the projections: getChildrenStates is real, and the parent-terminal refusal holds against Postgres exactly as it does in the fixture suite"
```

### Task 13: GET /v1/tickets/:id/history — the read model IS the ledger, filtered

**Files:**
- Create: `apps/server/src/routes/ticket-history.ts`
- Test: `apps/server/test/ticket-history.test.ts`
- Modify: `apps/server/src/server.ts` (register the route)

**Interfaces:**
- Consumes: `buildServer({ db })` (Plan 1); the `events` ledger table (Plan 1, columns per Coordination); `proj_tickets` (Task 10, existence check only).
- Produces:
  - `GET /v1/tickets/:id/history?afterSeq=<n>&limit=<n>` → `200 { ticketId, events: TicketHistoryEvent[] }` | `400` | `404`
  - `type TicketHistoryEvent = { id: string; type: string; version: number; payload: unknown; actorId: string; origin: string; clientTime: string; serverTime: string; seq: number }`
  - `ticketHistoryRoutes(app: FastifyInstance, opts: { db: Pool })` (Fastify plugin function)

**Spec §3:** clients read projections, never raw ledger — "except the history view, which *is* the ledger, filtered." This route is that exception: no re-shaping, no summarising, both clocks returned, ordered by `seq`. Auth/visibility enforcement wraps this route in the auth plan — this task ships the route and serialization only. Errors stay generic (workspace security standard: no internals in responses).

**On the two clocks (owner decision 2026-08-20, "time is Asia/Kolkata"):** `client_time` and `server_time` are both `timestamptz`, so the driver returns `Date` and this route emits ISO 8601 `Z` — the same normalization Plan 1's `rowToEnvelope` performs. The consequence to hold onto: a claim submitted as `2026-08-20T14:30:00+05:30` comes back as `2026-08-20T09:00:00.000Z`. That is not lossy about *when* — it is the same instant — and the pair of facts the spec cares about (the claimed instant beside the received instant) is untouched. No test in this plan asserts a verbatim offset on readback; asserting one would pin a storage format the product deliberately gave up.

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/ticket-history.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { EventEnvelope } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';
import { applyEvent } from '../src/projections/index';
import { buildServer } from '../src/server';
import { testPool, wipe } from './helpers/db';

const WS = '01J9GWS0000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const TICKET = '01J9GTKA000000000000000000';

const db: Pool = await testPool();
const app = await buildServer({ db });
beforeEach(async () => wipe(db));
afterAll(async () => { await app.close(); await db.end(); });

/**
 * Tests write the ledger directly — ingest owns this in production.
 *
 * Both time columns are `timestamptz` (Plan 1 Task 6, owner decision
 * 2026-08-20), so the fixture hands pg an INSTANT — a `Date` — not a text
 * time. Passing the ISO string would work by implicit cast, which is exactly
 * the habit the text-column era left behind and the reason a fixture could
 * quietly disagree with the column it writes.
 */
async function ledgerInsert(env: EventEnvelope): Promise<void> {
  await db.query(
    `INSERT INTO events (id, workspace_id, entity_kind, entity_id, type, version, payload,
                         actor_id, origin, client_time, server_time, seq)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [env.id, env.workspaceId, env.entity.kind, env.entity.id, env.type, env.version,
     JSON.stringify(env.payload), env.actorId, env.origin,
     new Date(env.clientTime), new Date(env.serverTime), env.seq],
  );
  await applyEvent(db, env);
}

async function seedTicket(): Promise<EventEnvelope[]> {
  const wf = makeEnvelope({ type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf-basic' }, workspaceId: WS,
    payload: { id: 'wf-basic', version: 1, name: 'Basic', initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [{ from: '*', to: 'done', rules: [] }, { from: '*', to: 'todo', rules: [] }] } });
  const type = makeEnvelope({ type: 'ticket-type.defined', entity: { kind: 'ticket-type', id: 'task' }, workspaceId: WS,
    payload: { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] } });
  const events = [
    makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: TICKET }, workspaceId: WS, seq: 1,
      payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'File GST' } }),
    makeEnvelope({ type: 'ticket.field_set', entity: { kind: 'ticket', id: TICKET }, workspaceId: WS, seq: 2,
      payload: { fieldId: 'dueDate', value: { date: '2026-08-30' } }, actorId: 'user-anselma' }),
    makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: TICKET }, workspaceId: WS, seq: 3,
      payload: { toStateId: 'done' } }),
  ];
  await applyEvent(db, wf);
  await applyEvent(db, type);
  for (const env of events) await ledgerInsert(env);
  return events;
}

describe('GET /v1/tickets/:id/history', () => {
  it('returns the ticket ledger, filtered and seq-ordered, with both clocks and the actor on every event', async () => {
    const events = await seedTicket();
    const res = await app.inject({ method: 'GET', url: `/v1/tickets/${TICKET}/history` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ticketId: string; events: Array<Record<string, unknown>> };
    expect(body.ticketId).toBe(TICKET);
    expect(body.events.map((e) => e.type)).toEqual(['ticket.created', 'ticket.field_set', 'ticket.transitioned']);
    expect(body.events[1]).toMatchObject({
      id: events[1].id, version: 1, actorId: 'user-anselma', origin: 'server',
      payload: { fieldId: 'dueDate', value: { date: '2026-08-30' } }, seq: 2,
    });
    expect(typeof body.events[1].clientTime).toBe('string');
    expect(typeof body.events[1].serverTime).toBe('string');
  });

  it('a +05:30 claim reads back as the equivalent Z instant — the label was never the fact', async () => {
    await seedTicket();
    // 2026-08-20T14:30:00+05:30 IS 2026-08-20T09:00:00Z. Since Plan 1 stores
    // both clocks as timestamptz (owner decision 2026-08-20), the offset the
    // device typed is not retained; the moment it named is. Assert the Z form
    // — asserting the verbatim '+05:30' string here would be asserting a
    // storage format the product deliberately gave up.
    const claim = makeEnvelope({
      type: 'ticket.field_set', entity: { kind: 'ticket', id: TICKET }, workspaceId: WS, seq: 4,
      payload: { fieldId: 'startDate', value: { date: '2026-09-01' } }, actorId: 'user-anselma',
      clientTime: '2026-08-20T14:30:00.000+05:30',
      serverTime: '2026-08-20T14:30:01.000+05:30',
    });
    await ledgerInsert(claim);

    const res = await app.inject({ method: 'GET', url: `/v1/tickets/${TICKET}/history?afterSeq=3` });
    const body = res.json() as { events: Array<{ clientTime: string; serverTime: string }> };
    expect(body.events).toHaveLength(1);
    expect(body.events[0].clientTime).toBe('2026-08-20T09:00:00.000Z');
    expect(body.events[0].serverTime).toBe('2026-08-20T09:00:01.000Z');
    // …and the two clocks are still two separate facts, one second apart.
    expect(Date.parse(body.events[0].serverTime) - Date.parse(body.events[0].clientTime)).toBe(1000);
  });

  it('pages with afterSeq and limit', async () => {
    await seedTicket();
    const res = await app.inject({ method: 'GET', url: `/v1/tickets/${TICKET}/history?afterSeq=1&limit=1` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { events: Array<{ seq: number }> };
    expect(body.events.map((e) => e.seq)).toEqual([2]);
  });

  it('404 for a ticket that does not exist, 400 for junk paging params — both with generic bodies', async () => {
    await seedTicket();
    const missing = await app.inject({ method: 'GET', url: '/v1/tickets/01J9GGHT000000000000000000/history' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'ticket not found' });
    const junk = await app.inject({ method: 'GET', url: `/v1/tickets/${TICKET}/history?afterSeq=banana` });
    expect(junk.statusCode).toBe(400);
    expect(junk.json()).toEqual({ error: 'afterSeq and limit must be non-negative integers' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter server exec vitest run test/ticket-history.test.ts`
Expected: FAIL — cannot find module `../src/routes/ticket-history` (via `buildServer` once registered) or 404-for-every-route before registration.

- [ ] **Step 3: Implement the route**

```ts
// apps/server/src/routes/ticket-history.ts
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

export type TicketHistoryEvent = {
  id: string;
  type: string;
  version: number;
  payload: unknown;
  actorId: string;
  origin: string;
  clientTime: string;
  serverTime: string;
  seq: number;
};

/** The stored row: both clocks are `timestamptz`, so pg yields `Date`. */
type EventRow = {
  id: string;
  type: string;
  version: number;
  payload: unknown;
  actor_id: string;
  origin: string;
  client_time: Date;
  server_time: Date;
  seq: string | number;
};

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 200;

function parseNonNegativeInt(raw: unknown, fallback: number): number | null {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/**
 * Spec §3: clients read projections, never raw ledger — except the history
 * view, which IS the ledger, filtered. No re-shaping, no summarising: the
 * actor, both clocks, and the payload return exactly as claimed.
 * Auth/visibility enforcement wraps this route in the auth plan.
 */
export async function ticketHistoryRoutes(app: FastifyInstance, opts: { db: Pool }): Promise<void> {
  app.get('/v1/tickets/:id/history', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { afterSeq?: string; limit?: string };

    const afterSeq = parseNonNegativeInt(query.afterSeq, 0);
    const limitRaw = parseNonNegativeInt(query.limit, DEFAULT_LIMIT);
    if (afterSeq === null || limitRaw === null || limitRaw === 0) {
      return reply.code(400).send({ error: 'afterSeq and limit must be non-negative integers' });
    }
    const limit = Math.min(limitRaw, MAX_LIMIT);

    const exists = await opts.db.query('SELECT 1 FROM proj_tickets WHERE ticket_id = $1', [id]);
    if (exists.rowCount === 0) {
      return reply.code(404).send({ error: 'ticket not found' });
    }

    const res = await opts.db.query(
      `SELECT id, type, version, payload, actor_id, origin, client_time, server_time, seq
       FROM events
       WHERE entity_kind = 'ticket' AND entity_id = $1 AND seq > $2
       ORDER BY seq ASC
       LIMIT $3`,
      [id, afterSeq, limit],
    );

    // Both time columns are timestamptz, so pg hands them back as Date. Emit
    // ISO 8601 Z, exactly as Plan 1's `rowToEnvelope` does — one normalization
    // rule for the whole product, so a claim made at +05:30 and the same claim
    // made at Z are indistinguishable on the wire, because they were the same
    // moment. (`String(row.client_time)` would print a locale string here; the
    // conversion is `.toISOString()`, never a cast and never a stringify.)
    const events: TicketHistoryEvent[] = (res.rows as EventRow[]).map((row) => ({
      id: row.id,
      type: row.type,
      version: row.version,
      payload: row.payload,
      actorId: row.actor_id,
      origin: row.origin,
      clientTime: row.client_time.toISOString(),
      serverTime: row.server_time.toISOString(),
      seq: Number(row.seq),
    }));

    return { ticketId: id, events };
  });
}
```

Register it in `apps/server/src/server.ts`, alongside the existing route registrations in `buildServer`:

```ts
import { ticketHistoryRoutes } from './routes/ticket-history';

  await app.register(ticketHistoryRoutes, { db });
```

- [ ] **Step 4: Run the test to verify it passes, then the full server suite**

Run: `pnpm --filter server exec vitest run test/ticket-history.test.ts`
Expected: PASS (4 tests) — including the `+05:30` → `Z` round trip.
Run: `pnpm --filter server exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/ticket-history.ts apps/server/src/server.ts apps/server/test/ticket-history.test.ts
git commit -m "Ticket history is the ledger filtered, not a summary: every claim returns with its actor and both clocks, paged by sequence, and a missing ticket is a plain 404 that explains nothing it should not"
```

### Task 14: Features.md and test-cases/ — the catalogue moves in the same change set

**Files:**
- Modify: `Features.md` (append the new section)
- Create: `test-cases/05-tickets-hierarchy.md`

**Numbering note:** Plans 1 and 2 execute before this plan and are expected to have claimed Features.md sections 3 and 4. If they did not, use the next free section number and mirror it in the test-cases filename and case ids — never renumber anything that exists.

**Interfaces:**
- Consumes: the shipped work of Tasks 1–13.
- Produces: the workspace-mandated catalogue entries; the statuses below are ✅ because the covering tests land in this same change set (same PR), which satisfies the same-change-set rule.

- [ ] **Step 1: Append the feature section to `Features.md`**

```markdown
## 5. Tickets, hierarchy & rollups

- ⚙️ **Ticket type system** — built-in ladder epic(1)/story(2)/task(3)/sub-task(4) as seed data plus custom reusable types defined by `ticket-type.defined` events: name, icon, rank, workflow binding, and typed custom fields (text, number, date, select, person), Zod-validated, last definition wins. `packages/domain/src/ticket-types.ts`
- ⚙️ **Ticket event vocabulary** — `ticket.created`, `ticket.transitioned` (optional `cause` marks a reopen forced by arriving live work; the transitions log keeps it out), `ticket.assigned`, `ticket.collaborator_added/removed`, `ticket.field_set` (built-ins title/description/dueDate/startDate ride it; a due date and a start date are always `{date, note?}` claims), `ticket.reparented`, `comment.added` (opaque doc body), `attachment.added` (metadata only); unknown types refused at ingest. `packages/domain/src/events/ticket-events.ts`
- ⚙️ **Ticket head-state reducer** — one pure fold (`applyTicketEvent`) shared by the server projection and the fixture suite; per-field provenance (actor + both clocks) on every claim. `packages/domain/src/ticket-state.ts`
- ✅ **Hierarchy sanity refusals** — child rank must exceed parent rank, any type at or below the deepest rank requires a parent (the built-in `sub-task`, any custom type an admin defines beside it, and anything deeper — the rule follows the rank, not the id), cycles refused (load-bearing after rank re-definitions), cross-project parents refused, live work under a terminal parent refused toward an offered reopen (owner decision; terminal-under-terminal stays legal); every reason in plain language, every refusal proven against a planted defect. `packages/rule-engine/src/checks/hierarchy.ts`
- ✅ **Field claim refusals** — unknown fields, per-kind mismatches with the field named, title never clearable; `null` clears everything else as an attributed claim. `packages/rule-engine/src/checks/fields.ts`
- ⚙️ **Ticket projections** — `proj_ticket_types` (workspace-scoped type defs), `proj_tickets` (head state backing the engine's `getEntityState`/`getChildrenStates`), `proj_rollups` (direct-children counts per state category; derived progress is never authored); all rebuild-and-diff clean. `apps/server/src/projections/`
- ✅ **Ticket history endpoint** — `GET /v1/tickets/:id/history`: the ledger filtered to one ticket, seq-ordered, actor and both clocks on every event, paged; no summarising. Both clocks are absolute instants serialized as ISO 8601 `Z`, so a claim made at `+05:30` and the same claim made at `Z` read back identically — they were the same moment (owner decision 2026-08-20). `apps/server/src/routes/ticket-history.ts`
- ⚙️ **End-to-end planted-defect fixtures** — parent-terminal (invariant 3), rank, custom-type-at-the-deepest-rank-without-a-parent, cycle-after-rank-redefinition, unknown field, kind mismatch, live-work-under-terminal-parent (create and reparent) — with accepting twins, in Plan 2's shared fixture format. `packages/rule-engine/fixtures/`
```

- [ ] **Step 2: Create the test-cases bucket**

```markdown
# 5. Tickets, hierarchy & rollups — test cases

Mirrors `Features.md` §5. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope (with reason).

- 5.1 ✅ Custom ticket type definitions validated: select needs options, options only on select, duplicate field ids refused, built-in field ids not shadowable, rank ≥ 1. (`ticket-types.test.ts`)
- 5.2 ✅ Built-in ladder ships as seed data with ranks epic 1 / story 2 / task 3 / sub-task 4, materialisable against a workspace default workflow. (`ticket-types.test.ts`)
- 5.3 ✅ Every vocabulary event round-trips `parseEvent`; malformed payloads and unknown event types are refused at the door. (`ticket-events.test.ts`)
- 5.4 ✅ Creation enters the attached workflow's initial state; the title is an attributed claim from the first moment. (`ticket-state.test.ts`, `proj-tickets.test.ts`)
- 5.5 ✅ Every field claim carries actor + client time + server time; `null` clears with the clearing claim's provenance kept. (`ticket-state.test.ts`, `proj-tickets.test.ts`)
- 5.6 ✅ Collaborators deduplicate on add; removing a non-collaborator is a no-op. (`ticket-state.test.ts`)
- 5.7 ✅ Rank violations refused on create and reparent with the exact plain-language reason, equal ranks included. (`hierarchy.test.ts`, `reparent.test.ts`, `created-rank-violation.json`)
- 5.8 ✅ A ticket whose type sits at or below the deepest rank is refused without a parent, at creation and when reparented to root, with its own type name in the reason. (`hierarchy.test.ts`, `reparent.test.ts`)
- 5.9 ✅ Cycles refused: self-parent, and reparenting under a descendant after a rank re-definition made the loop rank-legal. (`reparent.test.ts`, `reparent-cycle-after-rank-redefinition.json`)
- 5.10 ✅ Cross-project parents refused on create and reparent. (`hierarchy.test.ts`, `reparent.test.ts`)
- 5.11 ✅ Forced preconditions refuse plainly: unknown type, unknown parent, unknown ticket, type's workflow undefined. (`hierarchy.test.ts`, `reparent.test.ts`, `fields.test.ts`)
- 5.12 ✅ `field_set` semantics: unknown field refused; per-kind mismatches refused with the field named (text/number/date/select-with-options/person, document description, day-only `dueDate` and `startDate` claims); the title can never be cleared. (`fields.test.ts`, `field-set-*.json`)
- 5.13 ✅ Invariant 3 end to end: a parent's terminal claim with an open direct child is refused; the same claim is accepted once every child is terminal — proven in the fixture suite and again against Postgres. (`parent-terminal-*.json`, `engine-context.test.ts`)
- 5.14 ✅ Every refusal fixture has an accepting twin, so the suite cannot pass by refusing everything. (`fixtures/`)
- 5.15 ✅ `proj_tickets` reproduces byte-identically on reset-and-replay (rebuild-and-diff). (`proj-tickets.test.ts`)
- 5.16 ✅ `proj_ticket_types` is workspace-scoped and last-definition-wins. (`proj-ticket-types.test.ts`)
- 5.17 ✅ `proj_rollups` counts direct children per category; childless parents are absent, not zeroed; reparents move counts and empty rows are removed; rebuild-and-diff clean. (`proj-rollups.test.ts`)
- 5.18 ✅ The server EngineContext serves ticket state, type defs, and direct children from projections — `ctx.getChildrenStates` is real. (`engine-context.test.ts`)
- 5.19 ✅ History endpoint: seq-ordered filtered ledger with actor and both clocks, `afterSeq`/`limit` paging, generic 404/400 bodies. (`ticket-history.test.ts`)
- 5.20 🚫 Fixture parity in client builds — the suite is format-shared and ready, but no client build exists until the client plans land; parity runs are asserted there.
- 5.21 ✅ Live work under a terminal parent is refused toward the offered reopen, on create and on reparent, with the parent's title and state named in the reason. (`hierarchy.test.ts`, `reparent.test.ts`, `created-under-terminal-parent.json`, `reparent-live-under-terminal-parent.json`)
- 5.22 ✅ A terminal child moving under a terminal parent is accepted — nothing contradicts, nothing reopens. (`reparent.test.ts`, `reparent-terminal-under-terminal-parent.json`)
- 5.23 ✅ A CUSTOM type defined at the deepest rank is refused at project root exactly as the built-in `sub-task` is, named as itself in the reason — and so is a custom type defined *below* that rank, because nothing slips underneath the floor. The requirement follows the rank, not the built-in id (owner decision 2026-08-20). (`hierarchy.test.ts`, `created-deepest-rank-no-parent.json`)
- 5.24 ✅ The same custom deepest-rank type is accepted once it names a parent, and a type at a shallower rank still sits at project root untouched — the rank rule does not over-refuse. (`hierarchy.test.ts`, `created-rank-legal.json`)
- 5.25 ✅ A history claim submitted at `+05:30` reads back as the equivalent `…Z` instant, with the two clocks still one second apart — the instant survives the round trip, the device's label does not (owner decision 2026-08-20, "time is Asia/Kolkata"). (`ticket-history.test.ts`)
```

- [ ] **Step 3: Run the full suite one last time**

Run: `pnpm turbo run test`
Expected: PASS across packages/domain, packages/rule-engine, apps/server.

- [ ] **Step 4: Commit**

```bash
git add Features.md test-cases/05-tickets-hierarchy.md
git commit -m "Catalogue the ticket domain in Features.md and test-cases in the same change set as the work: twenty-five scenarios, twenty-four covered by the tests landing with them, one honestly out of scope until client builds exist"
```

---

## Open questions

Ambiguities and cross-plan unknowns, flagged rather than silently resolved. None blocks execution; each names the assumption the plan proceeds on.

1. **`WorkflowDef.initialStateId`.** Settled: Plan 2 defines `initialStateId` on `WorkflowDef`, and its `validateWorkflowDef` refuses an `initialStateId` naming no state (`unknown-initial-state`), per the coordination doc §3 — a ticket cannot exist without a status (spec §2: "A ticket's status is always a state of its attached workflow").
2. **Parent-terminal rule id and reason.** Settled: the rule id is `parent-terminal-with-open-children` — Plan 2's published string (coordination doc §7); the reason string is Plan 2's. The two parent-terminal fixtures assert the rule id only.
3. **`ticket.transitioned` registration overlap.** Plan 2 may have provisionally registered the event type for its own tests; Task 2 keeps exactly one registration with the contracted payload shape.
4. **Parent-required for custom deepest-rank types.** **Settled by the owner (2026-08-20, coordination doc sign-off table), overruling Plan 8's Open question 6:** the requirement follows the **rank**, not the built-in id. Any ticket whose type sits at or below the deepest rank requires a parent — the built-in `sub-task` (rank 4), any custom type an admin defines at rank 4, and anything deeper; epic/story/task-rank types are unaffected, so an epic-rank custom type still sits at project root. Implemented as `type.rank >= DEEPEST_RANK` in both hierarchy checks (Task 5 Steps 7d–7e, Task 6 Step 3), refused as `hierarchy.deepest-rank-parent-required` with the type named in the reason, proven by `created-deepest-rank-no-parent.json` and its twin. Two things pinned so they are not "fixed" later, both argued in design decision 9: (i) `DEEPEST_RANK` is a fixed constant, not a max computed over defined types, so the refusal's meaning never shifts as the type inventory changes; (ii) the comparison is `>=`, not `===`, so nothing slips underneath the floor — a rank-7 type is smaller work than a sub-task and exempting it would invert the rule's own justification. Still open, and not this plan's: whether a type should be able to *declare* "requires a parent" independent of its rank. Nobody has asked for it; the rank answer covers the cases that exist.
5. **Non-terminal child under a terminal parent.** Settled by the owner decision (2026-08-20, coordination doc): refused as `hierarchy.parent-terminal` with the reopen named in the reason as the remedy — clients offer to reopen the parent (its `ticket.transitioned` carrying `cause: { kind: 'reopened-for-child', childTicketId }`) and then re-submit; a terminal child under a terminal parent stays legal. Implemented in Tasks 5–6 and the Task 8 trio (design decision 8).
6. **Project existence.** `ticket.created.projectId` is recorded as-is; validating it against a projects projection belongs to the plan that owns project events.
7. **Who emits the built-in seed events.** `builtinTicketTypeDefs(defaultWorkflowId)` is ready; the workspace-bootstrap plan owns emitting the four `ticket-type.defined` events (and the default workflow binding) at workspace creation.
8. **Re-binding a type to a different workflow.** A ticket's workflow is bound at creation here; a later `ticket-type.defined` pointing at a new workflow affects new tickets only. Migrating in-flight tickets is workflow-change territory (spec §4's state-mapping machinery, Plan 2 and later).
9. **Workflow version changes re-categorising stored state.** `proj_tickets` stores the category computed at apply time; if a `workflow.defined` v2 re-categorises an existing state id, refreshing affected rows belongs to the workflow-change work, not this plan.
10. **Projection registry ordering guarantee.** `proj_rollups` reading `proj_tickets` requires apply-in-registration-order per event (Coordination). If Plan 1's registry does not guarantee order, that guarantee must be added there — the rebuild determinism of rollups depends on it.
