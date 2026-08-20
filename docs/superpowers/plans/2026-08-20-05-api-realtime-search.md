# API, Realtime & Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The server's read surface: the board and list read APIs, cross-project full-text search, My Work, the computed attention strip, per-user view preferences, and the WebSocket realtime stream — every one of them enforcing session + membership + visibility, and every honesty guarantee proven against a planted defect.

**Architecture:** Plans 1–4 built the ledger, the rule engine, the ticket projections, and the visibility layer. This plan builds what clients actually call: read endpoints that compose `proj_tickets`/`proj_visibility`/`proj_rollups` into typed responses (with the provenance of every visible state carried, never laundered), a `proj_search` tsvector projection fed by a dependency-free ProseMirror-JSON walker, and a WS `/v1/stream` hub whose catch-up **and** live tail are both drains of Plan 4's `visibleEventsFor` — one source of visibility truth, so the catch-up/live race and the purge-on-revocation semantics cannot diverge.

**Tech Stack:** Existing stack from Plan 1 (TypeScript strict, Node 22, Fastify 5, Postgres 16 via `pg`, node-pg-migrate, Vitest, pnpm + Turborepo) plus `@fastify/websocket` (server) and `ws` (test client only). Zod for every request boundary.

**Spec:** `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md` (§3 realtime, §6 enforcement, §7 views/search/attention). **Series authority:** `docs/superpowers/plans/2026-08-20-00-series-coordination.md` — amendments 9 (blocked flag), 12 (`docToPlainText`), 13 (stream protocol), 14 (preferences) are implemented here; where a sibling plan disagrees with the coordination document, the coordination document wins.

**Series position:** Plan 5 of 11. Runs after Plans 1–4; Plans 6–10 consume everything in this plan's Produces blocks.

## Consumed interfaces (exact, from the siblings' Produces blocks)

- **Plan 1 (`@gisik-nokma/domain`, `apps/server`):** `EventEnvelope` (contract shape: `{id, workspaceId, entity: {kind, id}, type, version, payload, actorId, origin, clientTime, serverTime, seq}`), `SubmittedEvent = Omit<EventEnvelope, 'serverTime' | 'seq'>`, `newUlid()`, `domainRegistry`/`EventTypeRegistry` (`register({type, version, payloadSchema})`), `parseEvent`; `insertEvent(client, event: LedgerEvent)` where `LedgerEvent = EventEnvelope & { workspaceSeq: number }` — the `events` table carries a per-workspace `workspace_seq` cursor beside the per-entity `seq` (coordination §18), server-assigned and NOT NULL, so anything writing the ledger directly supplies it; `Projection = {name, tables, apply(event, tx), reset(tx)}` and `buildProjectionRegistry()` in `apps/server/src/projections/index.ts` (registration order is application order); `IngestService = {ingestBatch(rawEvents): Promise<IngestResult[]>, onEventCommitted(listener): () => void}` (`onEventCommitted` fires only after commit, never for invalid/refused); `IngestResult = {status:'committed', eventId, seq, serverTime} | {status:'invalid', eventId|null, code, message} | {status:'refused', eventId, rule, reason}`; `buildApp(deps)`, `POST /v1/events` `{events:[1..100]}` → `{results: IngestResult[]}`.
- **Plan 2:** `StateCategory = 'open'|'active'|'terminal'`, `WorkflowState {id, name, category}` (+ optional `blocked?: boolean`, amendment 9), `WorkflowDef {id, version, name, initialStateId, states, transitions}`, `PublishedWorkflowDef`; `getWorkflowDefFromProjection(db, workflowId, version?): Promise<PublishedWorkflowDef | null>` over table `proj_workflows` (`definition` jsonb, PK `(workflow_id, version)`).
- **Plan 3:** `TicketState` (coordination §4 merged shape: id, workspaceId, projectId, typeId, parentId, workflowId, stateId, stateCategory, assigneeId, collaboratorIds, fields with per-field `FieldClaim {value, actorId, clientTime, serverTime}`, plus the transition log); table `proj_tickets` (columns `ticket_id, workspace_id, project_id, type_id, parent_id, workflow_id, state_id, state_category, assignee_id, collaborator_ids jsonb, fields jsonb`); `proj_rollups`/`getRollup`; ticket event vocabulary (`ticket.created {typeId, projectId, parentId, title}`, `ticket.transitioned {toStateId, comment?, evidenceAttachmentId?, cause?}`, `ticket.assigned {assigneeId}`, `ticket.field_set {fieldId, value}`, `comment.added {body}`, …); `dueDateValueSchema` (`{date: 'YYYY-MM-DD', note?}` — the one day-claim shape, shared by the `dueDate` and `startDate` built-ins); `GET /v1/tickets/:id/history` (owned there, not here).
- **Plan 4:** `type Queryable = Pool | PoolClient`; `makeRequireSession(auth)` (preHandler; 401s without a session; sets `request.currentUserId`), `registerAuthRoutes`, `createAuth`, `signInWithPhone(app, sender, phone)` test helper; `resolveEffectiveRole(db, userId, workspaceId): Promise<EffectiveRole>` with `EffectiveRole {workspaceRole: WorkspaceRole | null, projects: Map<string, {projectAdmin: boolean}>}`; `canSee(db, userId, ticketId): Promise<boolean>`; `visibleEventsFor(db, userId, workspaceId, afterSeq): AsyncIterable<SyncItem>` with `SyncItem = LedgerEvent | PurgeInstruction {kind:'purge', entityId}` (discriminate with `'kind' in item`) — `afterSeq` is the per-workspace `workspace_seq` cursor and every yielded event carries its `workspaceSeq` (coordination §18); `rollupFor(db, viewerId, ticketId): Promise<RollupView | null>` with `RollupView {total, open, active, terminal, restrictedCount}`; table `proj_visibility` (columns `ticket_id, workspace_id, project_id, parent_id, own_mode, own_user_ids, resolved_mode, resolved_user_ids, resolved_from`); table `proj_memberships`; `membershipId(workspaceId, userId)` (coordination decision 5); test helpers `migrateTestDb()`, `testPool()`, `truncateAll(pool)`.

## Global Constraints

- Package scope is `@gisik-nokma/*` (coordination decision 1); TypeScript strict; Node 22; pnpm workspaces + Turborepo (Plan 1's scaffold).
- Database naming is `snake_case`; every projection table is `proj_`-prefixed; projections are deterministic (no clocks, no randomness) and rebuildable, proven by rebuild-and-diff (spec §3).
- New projections register at the END of `buildProjectionRegistry()`: after Plan 4's `proj_visibility` comes `proj_workspace_settings` (Task 4), then `proj_search` (Task 6). Registration order is application order within each event's transaction — pinned so rebuilds replay identically.
- Read functions take a leading `db: Queryable` parameter (DI, per coordination contract amendments and CODING_STANDARDS).
- Every endpoint in this plan enforces session (`makeRequireSession`) + workspace membership (`resolveEffectiveRole`) + per-ticket visibility (the decision table behind `canSee`). Non-members and unknown ids get identical `404 {error:'not_found'}` bodies — invisible and nonexistent are indistinguishable (Plan 4's posture). Errors carry no internals.
- No user-supplied byte ever appears in SQL text — parameters only, proven by planted-defect injection tests (Task 2, Task 9).
- **Time is Asia/Kolkata (owner decision 2026-08-20), and it binds every read in this plan two ways.** *Storage:* the ledger's `client_time` and `server_time` are both native `timestamptz`, so pg hands back `Date` and every reader converts with `.toISOString()`. **No query in this plan casts `client_time`** — a `::timestamptz` cast on that column was a habit of the era when it was text, and that column is gone; a cast on a native `timestamptz` is at best noise and at worst a silent re-parse. Provenance columns on this plan's own projections are `timestamptz` for the same reason. *Day boundaries:* every window, every "overdue"/"due today" judgement, and every day count uses `istDayOf`/`istDayBounds` from `@gisik-nokma/domain` (Plan 1 Task 4a) — half-open `>= startUtc AND < endUtc` for windows, subtraction of `istDayOf` results for counts. Never `new Date()` locale math, never `.toISOString().slice(0, 10)`, never a millisecond difference divided by 86 400 000. An event at 18:31Z is already tomorrow in India, and that is the only calendar this product has.
- Every refusal and every honesty guarantee (invisible-ticket absence, purge-on-revocation, provenance-never-laundered, attention-never-stored) is proven against a planted defect before it is trusted (spec §7, base discipline).
- View preferences are server-owned rows, never ledger events (coordination amendment 14): they arrange truth, they do not claim anything about the work, so recording them as claims would dilute the ledger's meaning.
- `Features.md` §7 and `test-cases/07-api-realtime-search.md` (cases 7.x — this plan claims no other numbers) move in the same change set as the work (Task 16).
- Commits are prose that says what was found and why it matters; one commit per task.
- `reference/` stays frozen; nothing in this plan touches it.

## Cross-plan path assumptions

Plans 1–4 are executed but this plan is written in parallel with their reconciliation. Paths and shapes below are the assumption; the adaptation rule for each is "locate with grep, keep this plan's semantics":

| Assumed | Locate with | Adaptation rule |
|---|---|---|
| `apps/server/src/app.ts` assembly registers routes (`registerAuthRoutes`, `registerTicketRoutes`) | `grep -rn "registerAuthRoutes\|registerTicketRoutes" apps/server/src` | Add this plan's `register*Routes` calls at the same assembly point, passing the same `pool`/`auth` instances |
| `apps/server/test/helpers/db.ts` exports `migrateTestDb`, `testPool`, `truncateAll` (Plan 4) | `grep -rn "truncateAll\|createTestDatabase" apps/server/test` | If Plan 1's `createTestDatabase` is the surviving helper, wrap it: the tests below need "migrated pool + wipe between tests" |
| `insertEvent` at `apps/server/src/ledger/event-store.ts` | `grep -rn "export async function insertEvent" apps/server/src` | Import path only; signature `(client, envelope)` is contract |
| `buildProjectionRegistry()` at `apps/server/src/projections/index.ts`; `Projection` type at `apps/server/src/projections/registry.ts` | `grep -rn "buildProjectionRegistry" apps/server/src` | If Plan 3/4 landed a `registerProjection({name, apply, reset})` shape instead, adapt the projection objects mechanically — `tables`/`reset` semantics stay |
| `proj_visibility.resolved_user_ids` is `jsonb` (array of user ids) | `grep -n "resolved_user_ids" apps/server/migrations/*` | If it landed as `text[]`, replace `@> to_jsonb($n::text)` with `$n = ANY(...)` in Task 5's predicate — the agreement test with `canSee` catches any mismatch |
| `rollupFor` at `apps/server/src/visibility/rollup.ts`; `canSee`/`visibleEventsFor` under `apps/server/src/visibility/`; `resolveEffectiveRole` at `apps/server/src/permissions/effective-role.ts`; `checkRolePermission` at `apps/server/src/permissions/check-permission.ts` | `grep -rn "rollupFor\|visibleEventsFor\|resolveEffectiveRole\|checkRolePermission" apps/server/src` | Import paths only; signatures are contract |
| `makeRequireSession` sets `request.currentUserId` via module augmentation | `grep -rn "currentUserId" apps/server/src` | If no augmentation landed, keep the local cast used in the route code below |
| Route tests authenticate with `signInWithPhone(app, sender, phone)` → bearer token in the `authorization` header | Plan 4's `apps/server/test/routes/tickets-read.test.ts` | Mirror whatever header convention that test uses, for HTTP and for the WS upgrade request alike |
| `WorkflowState.blocked?: boolean` exists on Plan 2's zod (amendment 9, pending mechanical amendment) | `grep -n "blocked" packages/domain/src/workflow.ts` | If the amendment has not landed yet, add `blocked: z.boolean().optional()` to `workflowStateSchema` as the first step of Task 5 — it is additive and owned by that amendment |
| `ingestBatch(rawEvents)` still takes raw envelopes; Plan 4's permission gate resolves the actor from the envelope | `grep -rn "ingestBatch" apps/server/src` | If the pipeline grew a session-user parameter, pass the actor's own id in tests — every test event is performed by a legally-permitted actor |

## File structure

```
packages/domain/src/
├── doc-text.ts                    # NEW — docToPlainText, MentionNodeAttrs (amendment 12)
├── filter-spec.ts                 # NEW — FilterSpec + Grouping zod (cross-plan wire type)
├── read-models.ts                 # NEW — TicketCard, BoardResponse, ListResponse, SearchResponse,
│                                  #        MyWorkResponse, AttentionItem/Response, StateProvenance,
│                                  #        builder reads: Workflow/TicketType/Member/StateOccupancy responses
├── preferences.ts                 # NEW — PreferencesDoc zod (amendment 14)
├── stream-frames.ts               # NEW — subscribe/event/purge/caught-up/error frames (amendment 13)
├── events/workspace-settings.ts   # NEW — workspace.settings_set v1 + defaults + WorkspaceSettings
└── index.ts                       # MODIFIED — export the new modules

apps/server/src/
├── read/sql-params.ts             # NEW — positional-parameter collector (injection-proof composition)
├── read/compile-filter.ts         # NEW — FilterSpec → parameterized SQL clauses
├── read/visible-where.ts          # NEW — the visibility decision table as one SQL predicate
├── read/workflow-defs.ts          # NEW — latest defs batch + blocked-state set
├── read/state-provenance.ts       # NEW — who claimed the current state, both clocks, reopen cause
├── read/ticket-cards.ts           # NEW — proj_tickets rows → TicketCard[] (provenance + rollups)
├── read/membership.ts             # NEW — workspaceOfProject, requireMember
├── projections/workspace-settings.ts  # NEW — proj_workspace_settings
├── projections/search.ts          # NEW — proj_search (tsvector over title/description/comments)
├── projections/index.ts           # MODIFIED — register the two new projections (this order)
├── permissions/check-permission.ts    # MODIFIED — workspace.settings_set requires owner/admin
├── preferences/store.ts           # NEW — get/put user_preferences rows
├── routes/board.ts                # NEW — GET /v1/projects/:projectId/board
├── routes/list.ts                 # NEW — GET /v1/projects/:projectId/tickets
├── routes/builder-reads.ts        # NEW — workflows, ticket-types, members, state-occupancy
├── routes/search.ts               # NEW — GET /v1/search
├── routes/my-work.ts              # NEW — GET /v1/me/work
├── routes/attention.ts            # NEW — GET /v1/workspaces/:workspaceId/attention
├── routes/preferences.ts          # NEW — GET/PUT /v1/me/preferences
├── stream/hub.ts                  # NEW — subscription pump over visibleEventsFor + onEventCommitted
├── stream/routes.ts               # NEW — WS /v1/stream (auth, heartbeat, subscribe protocol)
└── app assembly                   # MODIFIED — @fastify/websocket + new route registrations

apps/server/migrations/
├── <ts>_proj-workspace-settings.js    # NEW
├── <ts>_proj-search.js                # NEW
└── <ts>_user-preferences.js           # NEW

apps/server/test/
├── helpers/apply.ts               # NEW — makeCommitted (honest per-entity seqs) + applyCommitted
├── helpers/read-scenario.ts       # NEW — the shared seeded world every read test uses
├── helpers/stream.ts              # NEW — ws test client
└── (one test file per task, named below)
```

---

### Task 1: `docToPlainText` — the dependency-free document walker

**Files:**
- Create: `packages/domain/src/doc-text.ts`
- Modify: `packages/domain/src/index.ts` (add export)
- Test: `packages/domain/test/doc-text.test.ts`

**Interfaces:**
- Consumes: nothing (pure TypeScript, zero dependencies — that is the point: search and notifications must not drag Tiptap into the server or the domain package).
- Produces (cross-plan API, coordination amendment 12 — Plan 7's editor conforms to this, Plan 9's notifications reuse it):
  - `docToPlainText(doc: unknown): string` — total function: renders ProseMirror JSON to plain text, returns `''` for anything unrenderable, never throws.
  - `type MentionNodeAttrs = { userId: string; label?: string }` — the mention node contract: `{type: 'mention', attrs: {userId, label?}}` renders as `@label`, falling back to `@userId`. Plan 7's editor emits exactly this shape.

- [ ] **Step 1: Write the failing test**

`packages/domain/test/doc-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { docToPlainText } from '../src/doc-text.js';

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (t: string) => ({ type: 'text', text: t });

describe('docToPlainText', () => {
  it('renders paragraphs with a newline between blocks', () => {
    expect(docToPlainText(doc(p(text('File the GST return')), p(text('before Friday'))))).toBe(
      'File the GST return\nbefore Friday',
    );
  });

  it('renders a mention as @label, falling back to @userId', () => {
    expect(
      docToPlainText(
        doc(
          p(
            text('Ask '),
            { type: 'mention', attrs: { userId: 'usr_01', label: 'Kiro' } },
            text(' about the OTP'),
          ),
        ),
      ),
    ).toBe('Ask @Kiro about the OTP');
    expect(docToPlainText(doc(p({ type: 'mention', attrs: { userId: 'usr_01' } })))).toBe('@usr_01');
  });

  it('renders hard breaks as newlines', () => {
    expect(docToPlainText(doc(p(text('line one'), { type: 'hardBreak' }, text('line two'))))).toBe(
      'line one\nline two',
    );
  });

  it('descends into unknown node types rather than dropping their text', () => {
    const exotic = doc({ type: 'calloutOfTheFuture', content: [p(text('still reachable'))] });
    expect(docToPlainText(exotic)).toBe('still reachable');
  });

  it('renders image nodes as nothing — attachments are not text', () => {
    expect(docToPlainText(doc(p(text('before ')), { type: 'image', attrs: { src: 'x' } }, p(text('after'))))).toBe(
      'before\nafter',
    );
  });

  it('is total: junk input renders as the empty string, never throws', () => {
    expect(docToPlainText(null)).toBe('');
    expect(docToPlainText(undefined)).toBe('');
    expect(docToPlainText(42)).toBe('');
    expect(docToPlainText('a bare string')).toBe('');
    expect(docToPlainText({ type: 'doc' })).toBe('');
    expect(docToPlainText({ type: 'doc', content: [{ type: 'text' }] })).toBe('');
    expect(docToPlainText([p(text('an array is not a doc'))])).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/doc-text.test.ts`
Expected: FAIL — cannot resolve `../src/doc-text.js`.

- [ ] **Step 3: Implement the walker**

`packages/domain/src/doc-text.ts`:

```ts
/**
 * Dependency-free plain-text rendering of a ProseMirror JSON document
 * (coordination amendment 12). Used by the proj_search projection and by
 * notifications; Plan 7's editor conforms to the shapes read here — in
 * particular the mention node {type: 'mention', attrs: {userId, label?}}.
 *
 * Total function: any unrenderable input yields '' — a search projection
 * must never crash the ingest transaction over a malformed document.
 */
export type MentionNodeAttrs = { userId: string; label?: string };

const BLOCK_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'code_block',
  'bulletList',
  'bullet_list',
  'orderedList',
  'ordered_list',
  'listItem',
  'list_item',
]);

export function docToPlainText(doc: unknown): string {
  return render(doc).replace(/\n{2,}/g, '\n').trim();
}

function render(node: unknown): string {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return '';
  const candidate = node as { type?: unknown; text?: unknown; attrs?: unknown; content?: unknown };
  if (candidate.type === 'text') {
    return typeof candidate.text === 'string' ? candidate.text : '';
  }
  if (candidate.type === 'mention') {
    const attrs = (
      typeof candidate.attrs === 'object' && candidate.attrs !== null ? candidate.attrs : {}
    ) as { userId?: unknown; label?: unknown };
    const label =
      typeof attrs.label === 'string' && attrs.label.length > 0
        ? attrs.label
        : typeof attrs.userId === 'string'
          ? attrs.userId
          : 'unknown';
    return `@${label}`;
  }
  if (candidate.type === 'hardBreak' || candidate.type === 'hard_break') return '\n';
  const children = Array.isArray(candidate.content) ? candidate.content.map(render).join('') : '';
  const isBlock = typeof candidate.type === 'string' && BLOCK_NODE_TYPES.has(candidate.type);
  return isBlock && children.length > 0 ? `${children}\n` : children;
}
```

In `packages/domain/src/index.ts`, add:

```ts
export * from './doc-text.js';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/doc-text.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @gisik-nokma/domain typecheck`
Expected: clean.

```bash
git add packages/domain/src/doc-text.ts packages/domain/src/index.ts packages/domain/test/doc-text.test.ts
git commit -m "docToPlainText: a dependency-free ProseMirror walker for search and notifications — total on junk, mentions render as @name, and the mention shape is now the contract Plan 7's editor conforms to"
```

---

### Task 2: FilterSpec — the typed filter and its injection-proof compiler

**Files:**
- Create: `packages/domain/src/filter-spec.ts`
- Modify: `packages/domain/src/index.ts` (add export)
- Create: `apps/server/src/read/sql-params.ts`
- Create: `apps/server/src/read/compile-filter.ts`
- Test: `packages/domain/test/filter-spec.test.ts`
- Test: `apps/server/test/read/compile-filter.test.ts`

**Interfaces:**
- Consumes: `stateCategorySchema` from Plan 2 (`@gisik-nokma/domain`).
- Produces (cross-plan API — Plans 6 and 10 carry FilterSpec through the `DataSource`; Task 13's saved filters validate with the same schema):
  - `filterSpecSchema` (zod, `.strict()`) and `type FilterSpec = { assigneeId?, collaboratorId?, typeId?, stateId?, stateCategory?, blocked?, text?, due?: {before?, after?}, fields?: [{fieldId, op: 'eq'|'contains', value}] }` — in `@gisik-nokma/domain`.
  - `GROUPINGS = ['epic','status','assignee','type','flat']`, `groupingSchema`, `type Grouping` — in `@gisik-nokma/domain`.
  - `class SqlParams` — `add(value): string` returns the `$n` placeholder, `toArray(): unknown[]` — in `apps/server`.
  - `compileFilterSpec(spec: FilterSpec, params: SqlParams): {clauses: string[]; needsBlockedCte: boolean}` — clauses reference `proj_tickets` as alias `t`; the `text` term joins FTS via `proj_search`; `blocked` needs the `BLOCKED_STATES_CTE` (exported constant) prepended as a `WITH` clause.
  - `likePattern(value: string): string` — escapes `%`, `_`, `\` and wraps in `%…%`.

- [ ] **Step 1: Write the failing domain schema test**

`packages/domain/test/filter-spec.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { filterSpecSchema, groupingSchema } from '../src/filter-spec.js';

describe('filterSpecSchema', () => {
  it('accepts a composed filter', () => {
    const spec = {
      assigneeId: 'usr_01',
      stateCategory: 'active',
      blocked: true,
      text: 'GST portal',
      due: { before: '2026-08-31', after: '2026-08-01' },
      fields: [{ fieldId: 'amount', op: 'eq', value: '4200' }],
    };
    expect(filterSpecSchema.parse(spec)).toEqual(spec);
  });

  it('accepts the empty filter', () => {
    expect(filterSpecSchema.parse({})).toEqual({});
  });

  it('refuses unknown keys — a typo must not silently match everything', () => {
    expect(() => filterSpecSchema.parse({ asigneeId: 'usr_01' })).toThrow();
  });

  it('refuses bad field ops and malformed due dates', () => {
    expect(() => filterSpecSchema.parse({ fields: [{ fieldId: 'x', op: 'regex', value: '.*' }] })).toThrow();
    expect(() => filterSpecSchema.parse({ due: { before: 'yesterday' } })).toThrow();
  });

  it('bounds list sizes and string lengths', () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => ({ fieldId: `f${i}`, op: 'eq' as const, value: 'v' }));
    expect(() => filterSpecSchema.parse({ fields: tooMany })).toThrow();
    expect(() => filterSpecSchema.parse({ text: 'x'.repeat(501) })).toThrow();
  });
});

describe('groupingSchema', () => {
  it('accepts exactly the five groupings', () => {
    for (const g of ['epic', 'status', 'assignee', 'type', 'flat']) {
      expect(groupingSchema.parse(g)).toBe(g);
    }
    expect(() => groupingSchema.parse('priority')).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/filter-spec.test.ts`
Expected: FAIL — cannot resolve `../src/filter-spec.js`.

- [ ] **Step 3: Implement the domain schema**

`packages/domain/src/filter-spec.ts`:

```ts
import { z } from 'zod';
import { stateCategorySchema } from './workflow.js';

export const GROUPINGS = ['epic', 'status', 'assignee', 'type', 'flat'] as const;
export const groupingSchema = z.enum(GROUPINGS);
export type Grouping = z.infer<typeof groupingSchema>;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const filterFieldClauseSchema = z
  .object({
    fieldId: z.string().min(1).max(200),
    op: z.enum(['eq', 'contains']),
    value: z.string().max(500),
  })
  .strict();

/**
 * The one composable filter shape every list-like read accepts (board's
 * sibling, list, search, saved filters). Compiled to parameterized SQL by
 * the server — never interpolated. `.strict()` everywhere: an unknown key
 * is a refused claim about what to show, not a silent match-all.
 */
export const filterSpecSchema = z
  .object({
    assigneeId: z.string().min(1).optional(),
    collaboratorId: z.string().min(1).optional(),
    typeId: z.string().min(1).optional(),
    stateId: z.string().min(1).optional(),
    stateCategory: stateCategorySchema.optional(),
    blocked: z.boolean().optional(),
    text: z.string().min(1).max(500).optional(),
    due: z
      .object({
        before: z.string().regex(ISO_DAY).optional(),
        after: z.string().regex(ISO_DAY).optional(),
      })
      .strict()
      .optional(),
    fields: z.array(filterFieldClauseSchema).max(10).optional(),
  })
  .strict();
export type FilterSpec = z.infer<typeof filterSpecSchema>;
```

In `packages/domain/src/index.ts`, add:

```ts
export * from './filter-spec.js';
```

- [ ] **Step 4: Run the domain test to verify it passes**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/filter-spec.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing compiler test — the injection planted defect lives here**

`apps/server/test/read/compile-filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BLOCKED_STATES_CTE, compileFilterSpec, likePattern } from '../../src/read/compile-filter.js';
import { SqlParams } from '../../src/read/sql-params.js';

describe('SqlParams', () => {
  it('hands out sequential placeholders and keeps values in order', () => {
    const params = new SqlParams();
    expect(params.add('a')).toBe('$1');
    expect(params.add(2)).toBe('$2');
    expect(params.toArray()).toEqual(['a', 2]);
  });
});

describe('compileFilterSpec', () => {
  it('compiles each clause with parameters only', () => {
    const params = new SqlParams();
    const { clauses, needsBlockedCte } = compileFilterSpec(
      {
        assigneeId: 'usr_01',
        collaboratorId: 'usr_02',
        typeId: 'task',
        stateId: 'doing',
        stateCategory: 'active',
        due: { before: '2026-08-31', after: '2026-08-01' },
      },
      params,
    );
    expect(clauses).toEqual([
      't.assignee_id = $1',
      't.collaborator_ids @> to_jsonb($2::text)',
      't.type_id = $3',
      't.state_id = $4',
      't.state_category = $5',
      "(t.fields -> 'dueDate' -> 'value' ->> 'date') <= $6",
      "(t.fields -> 'dueDate' -> 'value' ->> 'date') >= $7",
    ]);
    expect(params.toArray()).toEqual(['usr_01', 'usr_02', 'task', 'doing', 'active', '2026-08-31', '2026-08-01']);
    expect(needsBlockedCte).toBe(false);
  });

  it('compiles blocked via the blocked-states CTE and reports the need', () => {
    const params = new SqlParams();
    const { clauses, needsBlockedCte } = compileFilterSpec({ blocked: true }, params);
    expect(clauses).toEqual(['(t.workflow_id, t.state_id) IN (SELECT workflow_id, state_id FROM blocked_states)']);
    expect(needsBlockedCte).toBe(true);
    expect(BLOCKED_STATES_CTE).toContain('proj_workflows');
  });

  it('compiles blocked: false as the negation', () => {
    const params = new SqlParams();
    const { clauses } = compileFilterSpec({ blocked: false }, params);
    expect(clauses).toEqual([
      'NOT ((t.workflow_id, t.state_id) IN (SELECT workflow_id, state_id FROM blocked_states))',
    ]);
  });

  it('joins the text term through proj_search FTS', () => {
    const params = new SqlParams();
    const { clauses } = compileFilterSpec({ text: 'GST portal' }, params);
    expect(clauses).toEqual([
      "t.ticket_id IN (SELECT ticket_id FROM proj_search WHERE workspace_id = t.workspace_id AND tsv @@ websearch_to_tsquery('simple', $1))",
    ]);
    expect(params.toArray()).toEqual(['GST portal']);
  });

  it('compiles custom-field eq and contains against the FieldClaim value', () => {
    const params = new SqlParams();
    const { clauses } = compileFilterSpec(
      { fields: [{ fieldId: 'amount', op: 'eq', value: '4200' }, { fieldId: 'notes', op: 'contains', value: '50%_done' }] },
      params,
    );
    expect(clauses).toEqual([
      "t.fields -> $1 ->> 'value' = $2",
      "t.fields -> $3 ->> 'value' ILIKE $4 ESCAPE '\\'",
    ]);
    expect(params.toArray()).toEqual(['amount', '4200', 'notes', '%50\\%\\_done%']);
  });

  it('PLANTED DEFECT: hostile fieldId and text never reach the SQL text — parameters only', () => {
    const hostileField = `dueDate' ->> 'value'; DROP TABLE proj_tickets; --`;
    const hostileText = `'); DELETE FROM events; --`;
    const params = new SqlParams();
    const { clauses } = compileFilterSpec(
      { text: hostileText, fields: [{ fieldId: hostileField, op: 'contains', value: hostileText }] },
      params,
    );
    const sql = clauses.join(' AND ');
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('DELETE FROM');
    // The hostile bytes travel ONLY as parameter values:
    expect(params.toArray()).toContain(hostileText);
    expect(params.toArray().some((v) => typeof v === 'string' && v.includes('DROP TABLE'))).toBe(true);
  });
});

describe('likePattern', () => {
  it('escapes LIKE metacharacters and backslashes', () => {
    expect(likePattern('50%_done\\')).toBe('%50\\%\\_done\\\\%');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/read/compile-filter.test.ts`
Expected: FAIL — cannot resolve the two new modules.

- [ ] **Step 7: Implement SqlParams and the compiler**

`apps/server/src/read/sql-params.ts`:

```ts
/**
 * Collects positional SQL parameters. Every fragment builder in the read
 * layer takes one of these and interpolates ONLY the `$n` placeholders it
 * returns — user bytes never enter SQL text. The injection planted-defect
 * tests (compile-filter.test.ts, list route test) stand guard on this.
 */
export class SqlParams {
  private readonly values: unknown[] = [];

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }

  toArray(): unknown[] {
    return [...this.values];
  }
}
```

`apps/server/src/read/compile-filter.ts`:

```ts
import type { FilterSpec } from '@gisik-nokma/domain';
import type { SqlParams } from './sql-params.js';

/**
 * The latest version of each workflow, exploded to its blocked-flagged
 * states (coordination amendment 9). Prepend as `WITH ${BLOCKED_STATES_CTE}`
 * when a compiled filter reports needsBlockedCte.
 */
export const BLOCKED_STATES_CTE = `blocked_states AS (
  SELECT latest.workflow_id, s ->> 'id' AS state_id
  FROM (
    SELECT DISTINCT ON (workflow_id) workflow_id, definition
    FROM proj_workflows
    ORDER BY workflow_id, version DESC
  ) latest,
  jsonb_array_elements(latest.definition -> 'states') s
  WHERE (s ->> 'blocked')::boolean IS TRUE
)`;

export type CompiledFilter = { clauses: string[]; needsBlockedCte: boolean };

export function likePattern(value: string): string {
  return `%${value.replace(/([\\%_])/g, '\\$1')}%`;
}

/** Compiles a FilterSpec into WHERE clauses over proj_tickets aliased `t`. */
export function compileFilterSpec(spec: FilterSpec, params: SqlParams): CompiledFilter {
  const clauses: string[] = [];
  let needsBlockedCte = false;

  if (spec.assigneeId !== undefined) clauses.push(`t.assignee_id = ${params.add(spec.assigneeId)}`);
  if (spec.collaboratorId !== undefined) {
    clauses.push(`t.collaborator_ids @> to_jsonb(${params.add(spec.collaboratorId)}::text)`);
  }
  if (spec.typeId !== undefined) clauses.push(`t.type_id = ${params.add(spec.typeId)}`);
  if (spec.stateId !== undefined) clauses.push(`t.state_id = ${params.add(spec.stateId)}`);
  if (spec.stateCategory !== undefined) clauses.push(`t.state_category = ${params.add(spec.stateCategory)}`);
  if (spec.blocked !== undefined) {
    needsBlockedCte = true;
    const membership = '(t.workflow_id, t.state_id) IN (SELECT workflow_id, state_id FROM blocked_states)';
    clauses.push(spec.blocked ? membership : `NOT (${membership})`);
  }
  if (spec.text !== undefined) {
    clauses.push(
      `t.ticket_id IN (SELECT ticket_id FROM proj_search WHERE workspace_id = t.workspace_id AND tsv @@ websearch_to_tsquery('simple', ${params.add(spec.text)}))`,
    );
  }
  if (spec.due?.before !== undefined) {
    clauses.push(`(t.fields -> 'dueDate' -> 'value' ->> 'date') <= ${params.add(spec.due.before)}`);
  }
  if (spec.due?.after !== undefined) {
    clauses.push(`(t.fields -> 'dueDate' -> 'value' ->> 'date') >= ${params.add(spec.due.after)}`);
  }
  for (const field of spec.fields ?? []) {
    if (field.op === 'eq') {
      clauses.push(`t.fields -> ${params.add(field.fieldId)} ->> 'value' = ${params.add(field.value)}`);
    } else {
      clauses.push(
        `t.fields -> ${params.add(field.fieldId)} ->> 'value' ILIKE ${params.add(likePattern(field.value))} ESCAPE '\\'`,
      );
    }
  }
  return { clauses, needsBlockedCte };
}
```

- [ ] **Step 8: Run the compiler test to verify it passes**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/read/compile-filter.test.ts`
Expected: PASS, including the planted defect.

- [ ] **Step 9: Typecheck both packages and commit**

Run: `pnpm turbo run typecheck --filter=@gisik-nokma/domain --filter=@gisik-nokma/server`
Expected: clean.

```bash
git add packages/domain/src/filter-spec.ts packages/domain/src/index.ts packages/domain/test/filter-spec.test.ts apps/server/src/read/sql-params.ts apps/server/src/read/compile-filter.ts apps/server/test/read/compile-filter.test.ts
git commit -m "FilterSpec: one strict zod shape for every list-like read, compiled to parameterized SQL — a planted hostile fieldId proves user bytes travel only as parameter values, never as SQL text"
```

---
### Task 3: `workspace.settings_set` — the settings claim and who may make it

**Files:**
- Create: `packages/domain/src/events/workspace-settings.ts`
- Modify: `packages/domain/src/index.ts` (add export)
- Modify: the module where the event vocabulary registers into `domainRegistry` (locate: `grep -rn "registerEventType\|domainRegistry.register" packages/domain/src` — Plans 3 and 4 both appended registrations there; follow their call shape exactly)
- Modify: `apps/server/src/permissions/check-permission.ts` (Plan 4's role gate — one new case)
- Test: `packages/domain/test/events/workspace-settings.test.ts`
- Test: `apps/server/test/permissions/settings-permission.test.ts`

**Interfaces:**
- Consumes: Plan 1's `domainRegistry`/`parseEvent`; Plan 4's `checkRolePermission(env, ctx)` with `PermissionContext {sessionUserId, eff}` and the `Refusal {refused: true, rule, reason}` shape.
- Produces (cross-plan API — the attention strip reads these; a settings screen in Plan 6/8 emits the event):
  - Event type `workspace.settings_set` v1, entity `{kind: 'workspace', id: workspaceId}`, payload `{staleDays?: number, dueSoonDays?: number}` — at least one key required; partial-update semantics (only claimed keys change).
  - `workspaceSettingsSetPayloadSchema`, `type WorkspaceSettingsSetPayload`.
  - `DEFAULT_STALE_DAYS = 7`, `DEFAULT_DUE_SOON_DAYS = 7`.
  - `type WorkspaceSettings = { staleDays: number; dueSoonDays: number; provenance: {actorId: string; clientTime: string; serverTime: string} | null }` (`null` = never claimed, defaults in force).
  - New permission rule case: `workspace.settings_set` requires workspace role `owner` or `admin`; refusal `{refused: true, rule: 'permission.role', reason: 'Only a workspace owner or admin can change workspace settings.'}`.

**Why the payload carries both knobs:** the assignment names `{staleDays}`; the attention strip also needs a workspace-configurable due window (spec §7 "approaching claimed dates"). One settings event with optional keys covers both without a second event type — flagged in Open questions for owner sign-off on the defaults.

- [ ] **Step 1: Write the failing domain test**

`packages/domain/test/events/workspace-settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newUlid, parseEvent } from '../../src/index.js';
import { workspaceSettingsSetPayloadSchema } from '../../src/events/workspace-settings.js';

describe('workspaceSettingsSetPayloadSchema', () => {
  it('accepts either knob alone or both together', () => {
    expect(workspaceSettingsSetPayloadSchema.parse({ staleDays: 3 })).toEqual({ staleDays: 3 });
    expect(workspaceSettingsSetPayloadSchema.parse({ dueSoonDays: 14 })).toEqual({ dueSoonDays: 14 });
    expect(workspaceSettingsSetPayloadSchema.parse({ staleDays: 3, dueSoonDays: 14 })).toEqual({
      staleDays: 3,
      dueSoonDays: 14,
    });
  });

  it('refuses the empty claim — a settings event must set at least one setting', () => {
    expect(() => workspaceSettingsSetPayloadSchema.parse({})).toThrow();
  });

  it('refuses unknown keys, non-integers, and out-of-range values', () => {
    expect(() => workspaceSettingsSetPayloadSchema.parse({ staleDays: 3, velocity: 9 })).toThrow();
    expect(() => workspaceSettingsSetPayloadSchema.parse({ staleDays: 2.5 })).toThrow();
    expect(() => workspaceSettingsSetPayloadSchema.parse({ staleDays: 0 })).toThrow();
    expect(() => workspaceSettingsSetPayloadSchema.parse({ dueSoonDays: -1 })).toThrow();
    expect(() => workspaceSettingsSetPayloadSchema.parse({ staleDays: 366 })).toThrow();
  });
});

describe('workspace.settings_set registration', () => {
  it('round-trips parseEvent as a registered v1 type', () => {
    const workspaceId = newUlid();
    const raw = {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.settings_set',
      version: 1,
      payload: { staleDays: 10 },
      actorId: newUlid(),
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
    };
    const parsed = parseEvent(raw);
    expect(parsed.ok).toBe(true);
  });

  it('refuses a malformed settings payload at the door', () => {
    const workspaceId = newUlid();
    const raw = {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.settings_set',
      version: 1,
      payload: {},
      actorId: newUlid(),
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
    };
    const parsed = parseEvent(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe('invalid-payload');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/events/workspace-settings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the payload module and register the type**

`packages/domain/src/events/workspace-settings.ts`:

```ts
import { z } from 'zod';

export const DEFAULT_STALE_DAYS = 7;
export const DEFAULT_DUE_SOON_DAYS = 7;

/**
 * workspace.settings_set v1 — the attention strip's two knobs, claimed as an
 * attributed event like everything else (a threshold is a claim about what
 * deserves attention). Partial update: only the keys present change.
 */
export const workspaceSettingsSetPayloadSchema = z
  .object({
    staleDays: z.number().int().min(1).max(365).optional(),
    dueSoonDays: z.number().int().min(0).max(365).optional(),
  })
  .strict()
  .refine((payload) => payload.staleDays !== undefined || payload.dueSoonDays !== undefined, {
    message: 'a settings claim must set at least one setting',
  });
export type WorkspaceSettingsSetPayload = z.infer<typeof workspaceSettingsSetPayloadSchema>;

/** What the server answers after applying defaults; provenance null = never claimed. */
export type WorkspaceSettings = {
  staleDays: number;
  dueSoonDays: number;
  provenance: { actorId: string; clientTime: string; serverTime: string } | null;
};
```

In the vocabulary registration module (see Files above), add alongside the existing registrations, following the neighboring call shape exactly:

```ts
import { workspaceSettingsSetPayloadSchema } from './events/workspace-settings.js';

domainRegistry.register({
  type: 'workspace.settings_set',
  version: 1,
  payloadSchema: workspaceSettingsSetPayloadSchema,
});
```

In `packages/domain/src/index.ts`, add:

```ts
export * from './events/workspace-settings.js';
```

- [ ] **Step 4: Run the domain test to verify it passes**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/events/workspace-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing permission planted-defect test**

Per Plan 4's discipline: permission refusals are PRE-engine, so their planted defects are ordinary Vitest tests, not rule-engine fixtures.

`apps/server/test/permissions/settings-permission.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newUlid, type EventEnvelope } from '@gisik-nokma/domain';
import type { EffectiveRole } from '../../src/permissions/effective-role.js';
import { checkRolePermission } from '../../src/permissions/check-permission.js';

function settingsEnvelope(actorId: string): EventEnvelope {
  const workspaceId = newUlid();
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'workspace', id: workspaceId },
    type: 'workspace.settings_set',
    version: 1,
    payload: { staleDays: 3 },
    actorId,
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
    serverTime: '2026-08-20T09:00:01.000Z',
    seq: 2,
  };
}

function roleCtx(workspaceRole: EffectiveRole['workspaceRole']): { sessionUserId: string; eff: EffectiveRole } {
  return { sessionUserId: 'usr_actor', eff: { workspaceRole, projects: new Map() } };
}

describe('workspace.settings_set permission', () => {
  it('allows owners and admins', () => {
    expect(checkRolePermission(settingsEnvelope('usr_actor'), roleCtx('owner'))).toBeNull();
    expect(checkRolePermission(settingsEnvelope('usr_actor'), roleCtx('admin'))).toBeNull();
  });

  it('PLANTED DEFECT: a member claiming the staleness threshold is refused with the rule and reason named', () => {
    expect(checkRolePermission(settingsEnvelope('usr_actor'), roleCtx('member'))).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'Only a workspace owner or admin can change workspace settings.',
    });
  });

  it('refuses guests and non-members identically', () => {
    expect(checkRolePermission(settingsEnvelope('usr_actor'), roleCtx('guest'))).toMatchObject({
      refused: true,
      rule: 'permission.role',
    });
    expect(checkRolePermission(settingsEnvelope('usr_actor'), roleCtx(null))).toMatchObject({
      refused: true,
      rule: 'permission.role',
    });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/permissions/settings-permission.test.ts`
Expected: FAIL — `checkRolePermission` does not yet know `workspace.settings_set` (whatever its default-deny/default-allow posture, the exact refusal object will not match).

- [ ] **Step 7: Extend the role gate**

In `apps/server/src/permissions/check-permission.ts`, inside `checkRolePermission`, add a case alongside the existing per-event-type cases (match the file's existing dispatch style — `if` chain or `switch`):

```ts
if (env.type === 'workspace.settings_set') {
  if (ctx.eff.workspaceRole === 'owner' || ctx.eff.workspaceRole === 'admin') return null;
  return {
    refused: true,
    rule: 'permission.role',
    reason: 'Only a workspace owner or admin can change workspace settings.',
  };
}
```

- [ ] **Step 8: Run the permission test to verify it passes; run Plan 4's permission suite to prove no regression**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/permissions/`
Expected: PASS — the new file and Plan 4's existing `check-role-permission` tests.

- [ ] **Step 9: Commit**

```bash
git add packages/domain/src/events/workspace-settings.ts packages/domain/src/index.ts packages/domain/test/events/workspace-settings.test.ts apps/server/src/permissions/check-permission.ts apps/server/test/permissions/settings-permission.test.ts
git commit -m "workspace.settings_set v1: attention thresholds are attributed claims, refused for anyone below admin — the planted member-actor defect proves the gate names its rule and reason"
```

---

### Task 4: `proj_workspace_settings` — the projection and reader behind the thresholds

**Files:**
- Create: `apps/server/migrations/<timestamp>_proj-workspace-settings.js` (generate with `pnpm --filter @gisik-nokma/server exec node-pg-migrate create proj-workspace-settings --migrations-dir migrations`; match the migration file language Plans 3/4 used)
- Create: `apps/server/src/projections/workspace-settings.ts`
- Modify: `apps/server/src/projections/index.ts` (register after Plan 4's `proj_visibility`)
- Create: `apps/server/test/helpers/apply.ts`
- Test: `apps/server/test/projections/workspace-settings.test.ts`

**Interfaces:**
- Consumes: `Projection`/`buildProjectionRegistry` (Plan 1), `insertEvent` (Plan 1), `workspaceSettingsSetPayloadSchema`, `WorkspaceSettings`, `DEFAULT_STALE_DAYS`, `DEFAULT_DUE_SOON_DAYS` (Task 3), `Queryable` (Plan 4), test db helpers (Plan 4).
- Produces:
  - Table `proj_workspace_settings` (`workspace_id` PK, `stale_days int NULL`, `due_soon_days int NULL`, `set_by`, `set_client_time`, `set_server_time`).
  - `workspaceSettingsProjection: Projection` (name `'proj_workspace_settings'`).
  - `getWorkspaceSettings(db: Queryable, workspaceId: string): Promise<WorkspaceSettings>` — defaults applied, last claim's provenance carried.
  - Test helpers every later task uses: `makeCommitted(partial)` (full `LedgerEvent` with HONEST per-entity seqs — two entities each start at seq 1, exactly like the real ledger — plus the per-workspace `workspaceSeq` stream cursor Plan 1 assigns, coordination §18) and `applyCommitted(pool, envelopes)` (insert into the ledger + apply every registered projection, one transaction per event, exactly like ingest).

- [ ] **Step 1: Write the shared apply helpers**

`apps/server/test/helpers/apply.ts`:

```ts
import type { Pool } from 'pg';
import { newUlid, type EventEnvelope } from '@gisik-nokma/domain';
import { insertEvent, type LedgerEvent } from '../../src/ledger/event-store.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';

const seqs = new Map<string, number>();
const workspaceSeqs = new Map<string, number>();

/** Reset between test suites when exact seq numbers matter. */
export function resetEntitySeqs(): void {
  seqs.clear();
  workspaceSeqs.clear();
}

/**
 * Builds a full committed envelope with an honest PER-ENTITY seq: each
 * entity's sequence starts at 1, exactly as Plan 1's ledger assigns them.
 * (A process-monotonic counter here would mask the workspace-cursor defect
 * named in Open questions — do not "simplify" this back.)
 */
export function makeCommitted(
  partial: Pick<EventEnvelope, 'workspaceId' | 'entity' | 'type' | 'payload' | 'actorId'> &
    Partial<LedgerEvent>,
): LedgerEvent {
  const key = `${partial.entity.kind}:${partial.entity.id}`;
  const seq = partial.seq ?? (seqs.get(key) ?? 0) + 1;
  seqs.set(key, Math.max(seq, seqs.get(key) ?? 0));
  // The workspace stream cursor beside it (Plan 1, coordination §18): one
  // counter per workspace, so the seeded ledger orders exactly as ingest
  // would — and the per-entity seqs above stay honestly restarting at 1.
  const workspaceSeq =
    partial.workspaceSeq ?? (workspaceSeqs.get(partial.workspaceId) ?? 0) + 1;
  workspaceSeqs.set(
    partial.workspaceId,
    Math.max(workspaceSeq, workspaceSeqs.get(partial.workspaceId) ?? 0),
  );
  return {
    id: newUlid(),
    version: 1,
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
    serverTime: '2026-08-20T09:00:01.000Z',
    ...partial,
    seq,
    workspaceSeq,
  };
}

/**
 * Seeds envelopes the way ingest would: into the ledger AND through every
 * registered projection, one transaction per event, registry order.
 */
export async function applyCommitted(pool: Pool, envelopes: LedgerEvent[]): Promise<void> {
  const registry = buildProjectionRegistry();
  const client = await pool.connect();
  try {
    for (const envelope of envelopes) {
      await client.query('BEGIN');
      try {
        await insertEvent(client, envelope);
        for (const projection of registry.all()) {
          await projection.apply(envelope, client);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Write the failing projection test**

`apps/server/test/projections/workspace-settings.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { newUlid, DEFAULT_DUE_SOON_DAYS, DEFAULT_STALE_DAYS } from '@gisik-nokma/domain';
import { getWorkspaceSettings, workspaceSettingsProjection } from '../../src/projections/workspace-settings.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';

let pool: Pool;
beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  resetEntitySeqs();
});

function settingsEvent(workspaceId: string, actorId: string, payload: Record<string, number>, serverTime: string) {
  return makeCommitted({
    workspaceId,
    entity: { kind: 'workspace', id: workspaceId },
    type: 'workspace.settings_set',
    payload,
    actorId,
    serverTime,
    clientTime: serverTime,
  });
}

describe('proj_workspace_settings', () => {
  it('answers defaults with null provenance when nothing was ever claimed', async () => {
    const settings = await getWorkspaceSettings(pool, newUlid());
    expect(settings).toEqual({
      staleDays: DEFAULT_STALE_DAYS,
      dueSoonDays: DEFAULT_DUE_SOON_DAYS,
      provenance: null,
    });
  });

  it('holds the last claim per key, with partial updates leaving the other key alone', async () => {
    const workspaceId = newUlid();
    const alice = newUlid();
    const bala = newUlid();
    await applyCommitted(pool, [
      settingsEvent(workspaceId, alice, { staleDays: 3, dueSoonDays: 10 }, '2026-08-18T08:00:00.000Z'),
      settingsEvent(workspaceId, bala, { staleDays: 5 }, '2026-08-19T08:00:00.000Z'),
    ]);
    const settings = await getWorkspaceSettings(pool, workspaceId);
    expect(settings.staleDays).toBe(5);
    expect(settings.dueSoonDays).toBe(10); // untouched by the partial update
    expect(settings.provenance).toEqual({
      actorId: bala,
      clientTime: '2026-08-19T08:00:00.000Z',
      serverTime: '2026-08-19T08:00:00.000Z',
    });
  });

  it('is registered in the registry after proj_visibility', async () => {
    const names = buildProjectionRegistry()
      .all()
      .map((p) => p.name);
    expect(names).toContain('proj_workspace_settings');
    expect(names.indexOf('proj_workspace_settings')).toBeGreaterThan(names.indexOf('proj_visibility'));
  });

  it('reproduces byte-identically on reset-and-replay (rebuild-and-diff)', async () => {
    const workspaceId = newUlid();
    const actor = newUlid();
    const events = [
      settingsEvent(workspaceId, actor, { dueSoonDays: 2 }, '2026-08-18T08:00:00.000Z'),
      settingsEvent(workspaceId, actor, { staleDays: 9 }, '2026-08-19T08:00:00.000Z'),
    ];
    await applyCommitted(pool, events);
    const before = await pool.query('SELECT * FROM proj_workspace_settings ORDER BY workspace_id');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await workspaceSettingsProjection.reset(client);
      for (const event of events) await workspaceSettingsProjection.apply(event, client);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const after = await pool.query('SELECT * FROM proj_workspace_settings ORDER BY workspace_id');
    expect(after.rows).toEqual(before.rows);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/projections/workspace-settings.test.ts`
Expected: FAIL — module and table missing.

- [ ] **Step 4: Write the migration**

Generate, then fill (adapting to the migration file language Plans 3/4 actually used — JS shown):

```js
// apps/server/migrations/<timestamp>_proj-workspace-settings.js
exports.up = (pgm) => {
  pgm.createTable('proj_workspace_settings', {
    workspace_id: { type: 'text', primaryKey: true },
    stale_days: { type: 'integer', notNull: false },
    due_soon_days: { type: 'integer', notNull: false },
    set_by: { type: 'text', notNull: true },
    // Both provenance clocks are timestamptz — absolute instants (owner
    // decision 2026-08-20, "time is Asia/Kolkata"). `set_client_time` was
    // drafted as text back when the ledger's own `client_time` was text; that
    // storage is gone, and a lone text clock here would be the last place a
    // comparison needed a cast.
    set_client_time: { type: 'timestamptz', notNull: true },
    set_server_time: { type: 'timestamptz', notNull: true },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('proj_workspace_settings');
};
```

- [ ] **Step 5: Implement the projection and reader**

`apps/server/src/projections/workspace-settings.ts`:

```ts
import {
  DEFAULT_DUE_SOON_DAYS,
  DEFAULT_STALE_DAYS,
  workspaceSettingsSetPayloadSchema,
  type WorkspaceSettings,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { Projection } from './registry.js';

export const workspaceSettingsProjection: Projection = {
  name: 'proj_workspace_settings',
  tables: ['proj_workspace_settings'],
  async apply(event, tx) {
    if (event.type !== 'workspace.settings_set') return;
    const payload = workspaceSettingsSetPayloadSchema.parse(event.payload);
    await tx.query(
      `INSERT INTO proj_workspace_settings
         (workspace_id, stale_days, due_soon_days, set_by, set_client_time, set_server_time)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workspace_id) DO UPDATE SET
         stale_days = COALESCE(EXCLUDED.stale_days, proj_workspace_settings.stale_days),
         due_soon_days = COALESCE(EXCLUDED.due_soon_days, proj_workspace_settings.due_soon_days),
         set_by = EXCLUDED.set_by,
         set_client_time = EXCLUDED.set_client_time,
         set_server_time = EXCLUDED.set_server_time`,
      [
        event.workspaceId,
        payload.staleDays ?? null,
        payload.dueSoonDays ?? null,
        event.actorId,
        // Both provenance columns are timestamptz — hand pg instants, not the
        // envelope's ISO strings. An implicit text→timestamptz cast would work
        // and is exactly the habit the text-column era left behind.
        new Date(event.clientTime),
        new Date(event.serverTime),
      ],
    );
  },
  async reset(tx) {
    await tx.query('TRUNCATE proj_workspace_settings');
  },
};

export async function getWorkspaceSettings(db: Queryable, workspaceId: string): Promise<WorkspaceSettings> {
  const { rows } = await db.query(
    `SELECT stale_days, due_soon_days, set_by, set_client_time, set_server_time
     FROM proj_workspace_settings WHERE workspace_id = $1`,
    [workspaceId],
  );
  if (rows.length === 0) {
    return { staleDays: DEFAULT_STALE_DAYS, dueSoonDays: DEFAULT_DUE_SOON_DAYS, provenance: null };
  }
  const row = rows[0] as {
    stale_days: number | null;
    due_soon_days: number | null;
    set_by: string;
    set_client_time: Date;
    set_server_time: Date;
  };
  return {
    staleDays: row.stale_days ?? DEFAULT_STALE_DAYS,
    dueSoonDays: row.due_soon_days ?? DEFAULT_DUE_SOON_DAYS,
    provenance: {
      actorId: row.set_by,
      // Both clocks are timestamptz, so both arrive as Date and both leave as
      // ISO 8601 Z — the same normalization Plan 1's `rowToEnvelope` applies.
      clientTime: row.set_client_time.toISOString(),
      serverTime: row.set_server_time.toISOString(),
    },
  };
}
```

(If Plan 4's `Queryable` lives at a different path than `../db/queryable.js`, import from where `canSee` imports it.)

In `apps/server/src/projections/index.ts`, register at the END of `buildProjectionRegistry()`, after `proj_visibility`:

```ts
import { workspaceSettingsProjection } from './workspace-settings.js';
// inside buildProjectionRegistry(), after the last existing registration:
registry.register(workspaceSettingsProjection);
```

- [ ] **Step 6: Run migrations, then the test, to verify it passes**

Run: `pnpm --filter @gisik-nokma/server migrate` (with the test database env the helpers expect), then `pnpm --filter @gisik-nokma/server exec vitest run test/projections/workspace-settings.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/server/migrations apps/server/src/projections/workspace-settings.ts apps/server/src/projections/index.ts apps/server/test/helpers/apply.ts apps/server/test/projections/workspace-settings.test.ts
git commit -m "proj_workspace_settings: the attention thresholds as a rebuild-clean projection with the last claim's provenance kept — plus the shared apply helpers whose per-entity seqs are honest about how the ledger really numbers events"
```

---

### Task 5: The visibility predicate in SQL — and the scenario every read test shares

**Files:**
- Create: `apps/server/src/read/visible-where.ts`
- Create: `apps/server/src/read/membership.ts`
- Create: `apps/server/test/helpers/read-scenario.ts`
- Test: `apps/server/test/read/visible-where.test.ts`

**Interfaces:**
- Consumes: `EffectiveRole`/`resolveEffectiveRole` and `canSee` (Plan 4), `proj_visibility` and `proj_memberships` (Plan 4), `proj_tickets` (Plan 3), `proj_entity_heads` (Plan 1), `membershipId` (domain, coordination decision 5), `SqlParams` (Task 2), apply helpers (Task 4). If amendment 9's `blocked` flag has not landed on Plan 2's `workflowStateSchema` yet, add `blocked: z.boolean().optional()` to it now (see Cross-plan path assumptions).
- Produces:
  - `visibleTicketsWhere(eff: EffectiveRole, userId: string, params: SqlParams): string` — ONE SQL predicate implementing exactly Plan 4's read decision table; requires the query to join `proj_visibility` as alias `v` on `ticket_id`. Every read endpoint in this plan filters through it.
  - `workspaceOfProject(db: Queryable, projectId: string): Promise<string | null>` and `requireMember(db: Queryable, userId: string, workspaceId: string): Promise<EffectiveRole | null>` (`null` = not a member → route answers 404).
  - `seedReadScenario(pool, users): Promise<ReadScenario>`, `scenarioUsers()`, `SCENARIO_NOW` — the seeded world (one workspace, one project, a workflow with a blocked state, an epic with a child, an explicit-shared ticket, a hidden ticket with a confidential comment and a due date, a guest-shared ticket) that Tasks 6–15 all test against.

**The decision table (copied from Plan 4 — `visibleTicketsWhere` compiles precisely this, and the agreement test proves it):**

| viewer's workspace role | resolved_mode 'workspace' | 'project' | 'explicit' |
|---|---|---|---|
| null (non-member) | no | no | no |
| guest | no | no | only if listed |
| member / admin / owner | yes | only if on the project | only if listed |

- [ ] **Step 1: Write the scenario helper**

`apps/server/test/helpers/read-scenario.ts`:

```ts
import type { Pool } from 'pg';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import type { LedgerEvent } from '../../src/ledger/event-store.js';
import { applyCommitted, makeCommitted } from './apply.js';

/** The frozen "now" every read test computes against. */
export const SCENARIO_NOW = new Date('2026-08-20T12:00:00.000Z');

export type ReadScenarioUsers = { owner: string; member: string; outsider: string; guest: string };

export type ReadScenario = ReadScenarioUsers & {
  workspaceId: string;
  projectId: string;
  workflowId: string;
  epicId: string;
  taskInEpicId: string;
  sharedTaskId: string;
  hiddenTaskId: string;
  guestTaskId: string;
};

export function scenarioUsers(): ReadScenarioUsers {
  return { owner: newUlid(), member: newUlid(), outsider: newUlid(), guest: newUlid() };
}

/**
 * One seeded world:
 * - owner (workspace owner, on the project, project admin)
 * - member (workspace member, on the project)
 * - outsider (workspace member, NOT on the project)
 * - guest (guest scoped to the project)
 * - epic "Registrations drive" (project-mode root) with child task
 *   "File the GST return" (assigned to member, due 2026-08-25, description,
 *   a comment mentioning @Kiro, in 'doing' since 2026-08-01 — stale bait)
 * - "Renew the trade licence" (explicit: owner+member) sitting in the
 *   blocked-flagged 'waiting' state
 * - "Salary review — keep private" (explicit: owner ONLY — the planted
 *   invisible ticket) with a 'zebra-confidential' comment and a due date
 * - "Share the July invoices" (explicit: owner+guest)
 */
export async function seedReadScenario(pool: Pool, users: ReadScenarioUsers): Promise<ReadScenario> {
  const workspaceId = newUlid();
  const projectId = newUlid();
  const workflowId = 'wf-errands';
  const epicId = newUlid();
  const taskInEpicId = newUlid();
  const sharedTaskId = newUlid();
  const hiddenTaskId = newUlid();
  const guestTaskId = newUlid();
  const { owner, member, outsider, guest } = users;
  const ws = { workspaceId, actorId: owner };

  const events: LedgerEvent[] = [
    makeCommitted({ ...ws, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.created', payload: { name: 'Convenience Corner' } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name: 'Registrations' } }),
    makeCommitted({ ...ws, entity: { kind: 'membership', id: membershipId(workspaceId, owner) }, type: 'membership.granted', payload: { userId: owner, role: 'owner', scope: 'workspace' } }),
    makeCommitted({ ...ws, entity: { kind: 'membership', id: membershipId(workspaceId, member) }, type: 'membership.granted', payload: { userId: member, role: 'member', scope: 'workspace' } }),
    makeCommitted({ ...ws, entity: { kind: 'membership', id: membershipId(workspaceId, outsider) }, type: 'membership.granted', payload: { userId: outsider, role: 'member', scope: 'workspace' } }),
    makeCommitted({ ...ws, entity: { kind: 'membership', id: membershipId(workspaceId, guest) }, type: 'membership.granted', payload: { userId: guest, role: 'guest', scope: { projectId } } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: owner, projectAdmin: true } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: member, projectAdmin: false } }),
    makeCommitted({
      ...ws,
      entity: { kind: 'workflow', id: workflowId },
      type: 'workflow.defined',
      payload: {
        id: workflowId,
        version: 1,
        name: 'Errands',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'doing', name: 'Doing', category: 'active' },
          { id: 'waiting', name: 'Waiting on counterparty', category: 'active', blocked: true },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [
          { from: '*', to: 'todo', rules: [] },
          { from: '*', to: 'doing', rules: [] },
          { from: '*', to: 'waiting', rules: [] },
          { from: '*', to: 'done', rules: [] },
        ],
      },
    }),
    makeCommitted({ ...ws, entity: { kind: 'ticket-type', id: 'epic' }, type: 'ticket-type.defined', payload: { id: 'epic', name: 'Epic', icon: 'flag', rank: 1, workflowId, fields: [] } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket-type', id: 'task' }, type: 'ticket-type.defined', payload: { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId, fields: [] } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: epicId }, type: 'ticket.created', payload: { typeId: 'epic', projectId, parentId: null, title: 'Registrations drive' } }),
    makeCommitted({ ...ws, actorId: member, entity: { kind: 'ticket', id: taskInEpicId }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: epicId, title: 'File the GST return' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: sharedTaskId }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title: 'Renew the trade licence' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: sharedTaskId }, type: 'visibility.set', payload: { ticketId: sharedTaskId, mode: 'explicit', userIds: [owner, member] } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: hiddenTaskId }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title: 'Salary review — keep private' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: hiddenTaskId }, type: 'visibility.set', payload: { ticketId: hiddenTaskId, mode: 'explicit', userIds: [owner] } }),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: hiddenTaskId },
      type: 'comment.added',
      payload: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'zebra-confidential detail' }] }] } },
    }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: hiddenTaskId }, type: 'ticket.field_set', payload: { fieldId: 'dueDate', value: { date: '2026-08-21' } } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: guestTaskId }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title: 'Share the July invoices' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: guestTaskId }, type: 'visibility.set', payload: { ticketId: guestTaskId, mode: 'explicit', userIds: [owner, guest] } }),
    makeCommitted({ ...ws, actorId: member, entity: { kind: 'ticket', id: taskInEpicId }, type: 'ticket.assigned', payload: { assigneeId: member } }),
    makeCommitted({
      ...ws,
      actorId: member,
      clientTime: '2026-08-19T18:30:00.000Z',
      entity: { kind: 'ticket', id: taskInEpicId },
      type: 'ticket.field_set',
      payload: { fieldId: 'dueDate', value: { date: '2026-08-25' } },
    }),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: taskInEpicId },
      type: 'ticket.field_set',
      payload: { fieldId: 'description', value: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'GSTR-3B for July, portal keeps timing out' }] }] } },
    }),
    makeCommitted({
      ...ws,
      actorId: member,
      entity: { kind: 'ticket', id: taskInEpicId },
      type: 'comment.added',
      payload: {
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Called the ' },
                { type: 'mention', attrs: { userId: owner, label: 'Kiro' } },
                { type: 'text', text: ' about the OTP hold-up' },
              ],
            },
          ],
        },
      },
    }),
    // taskInEpic entered 'doing' 19 days before SCENARIO_NOW — stale bait for any threshold ≤ 19
    makeCommitted({
      ...ws,
      actorId: member,
      clientTime: '2026-08-01T09:00:00.000Z',
      serverTime: '2026-08-01T09:00:05.000Z',
      entity: { kind: 'ticket', id: taskInEpicId },
      type: 'ticket.transitioned',
      payload: { toStateId: 'doing' },
    }),
    // sharedTask sits in the blocked-flagged 'waiting' state
    makeCommitted({
      ...ws,
      clientTime: '2026-08-19T09:00:00.000Z',
      serverTime: '2026-08-19T09:00:05.000Z',
      entity: { kind: 'ticket', id: sharedTaskId },
      type: 'ticket.transitioned',
      payload: { toStateId: 'waiting' },
    }),
  ];
  await applyCommitted(pool, events);
  return { ...users, workspaceId, projectId, workflowId, epicId, taskInEpicId, sharedTaskId, hiddenTaskId, guestTaskId };
}
```

(If Plan 3's `ticket.transitioned` registration or Plan 4's `visibility.set` payload names differ after reconciliation, adapt the payload keys here — the projections themselves are the oracle: `applyCommitted` crashes loudly on a shape they refuse.)

- [ ] **Step 2: Write the failing agreement test**

`apps/server/test/read/visible-where.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { newUlid } from '@gisik-nokma/domain';
import { canSee } from '../../src/visibility/can-see.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { requireMember, workspaceOfProject } from '../../src/read/membership.js';
import { visibleTicketsWhere } from '../../src/read/visible-where.js';
import { SqlParams } from '../../src/read/sql-params.js';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { scenarioUsers, seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';

let pool: Pool;
let world: ReadScenario;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  resetEntitySeqs();
  world = await seedReadScenario(pool, scenarioUsers());
});

async function sqlVisibleSet(userId: string): Promise<string[]> {
  const eff = await resolveEffectiveRole(pool, userId, world.workspaceId);
  const params = new SqlParams();
  const workspaceClause = `t.workspace_id = ${params.add(world.workspaceId)}`;
  const visibleClause = visibleTicketsWhere(eff, userId, params);
  const { rows } = await pool.query(
    `SELECT t.ticket_id FROM proj_tickets t
     JOIN proj_visibility v ON v.ticket_id = t.ticket_id
     WHERE ${workspaceClause} AND ${visibleClause}
     ORDER BY t.ticket_id`,
    params.toArray(),
  );
  return rows.map((r) => (r as { ticket_id: string }).ticket_id);
}

async function canSeeSet(userId: string): Promise<string[]> {
  const all = [world.epicId, world.taskInEpicId, world.sharedTaskId, world.hiddenTaskId, world.guestTaskId];
  const visible: string[] = [];
  for (const ticketId of all) {
    if (await canSee(pool, userId, ticketId)) visible.push(ticketId);
  }
  return visible.sort();
}

describe('visibleTicketsWhere agrees with canSee — one decision table, two implementations, zero drift', () => {
  it('agrees for every viewer in the matrix', async () => {
    for (const userId of [world.owner, world.member, world.outsider, world.guest, newUlid()]) {
      expect(await sqlVisibleSet(userId)).toEqual(await canSeeSet(userId));
    }
  });

  it('PLANTED DEFECT: the explicit-mode ticket that omits the member never surfaces for them', async () => {
    const memberSet = await sqlVisibleSet(world.member);
    expect(memberSet).not.toContain(world.hiddenTaskId);
    expect(memberSet).not.toContain(world.guestTaskId); // explicit lists are exactly the authored list
    expect(memberSet.sort()).toEqual([world.epicId, world.taskInEpicId, world.sharedTaskId].sort());
  });

  it('a guest sees only what was explicitly shared; an off-project member sees nothing', async () => {
    expect(await sqlVisibleSet(world.guest)).toEqual([world.guestTaskId]);
    expect(await sqlVisibleSet(world.outsider)).toEqual([]);
  });

  it('a non-member compiles to FALSE — not to an empty string that matches everything', async () => {
    const params = new SqlParams();
    expect(visibleTicketsWhere({ workspaceRole: null, projects: new Map() }, newUlid(), params)).toBe('FALSE');
  });
});

describe('membership helpers', () => {
  it('resolves a project to its workspace via proj_entity_heads, null for unknown ids', async () => {
    expect(await workspaceOfProject(pool, world.projectId)).toBe(world.workspaceId);
    expect(await workspaceOfProject(pool, newUlid())).toBeNull();
  });

  it('requireMember answers the effective role for members and null for strangers', async () => {
    expect(await requireMember(pool, world.member, world.workspaceId)).not.toBeNull();
    expect(await requireMember(pool, newUlid(), world.workspaceId)).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/read/visible-where.test.ts`
Expected: FAIL — the two new modules do not exist.

- [ ] **Step 4: Implement the predicate and the membership helpers**

`apps/server/src/read/visible-where.ts`:

```ts
import type { EffectiveRole } from '../permissions/effective-role.js';
import type { SqlParams } from './sql-params.js';

/**
 * Plan 4's read-visibility decision table as ONE SQL predicate, for queries
 * that filter many tickets at once (board, list, search, attention, My
 * Work). Requires `proj_visibility` joined as alias `v` on ticket_id.
 *
 * Semantics are Plan 4's `canSeeResolved` — the agreement test
 * (visible-where.test.ts) proves the two implementations never drift:
 * guests see only explicit-listed tickets; members see workspace-mode,
 * project-mode where they are on the project, and explicit where listed;
 * owners and admins get NO bypass.
 */
export function visibleTicketsWhere(eff: EffectiveRole, userId: string, params: SqlParams): string {
  if (eff.workspaceRole === null) return 'FALSE';
  const explicitClause = `(v.resolved_mode = 'explicit' AND v.resolved_user_ids @> to_jsonb(${params.add(userId)}::text))`;
  if (eff.workspaceRole === 'guest') return explicitClause;
  const projectIds = [...eff.projects.keys()];
  const projectClause =
    projectIds.length === 0
      ? 'FALSE'
      : `(v.resolved_mode = 'project' AND v.project_id = ANY(${params.add(projectIds)}))`;
  return `(v.resolved_mode = 'workspace' OR ${projectClause} OR ${explicitClause})`;
}
```

`apps/server/src/read/membership.ts`:

```ts
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole, type EffectiveRole } from '../permissions/effective-role.js';

/** A project's workspace, from the entity-heads projection; null = unknown project. */
export async function workspaceOfProject(db: Queryable, projectId: string): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT workspace_id FROM proj_entity_heads WHERE entity_kind = 'project' AND entity_id = $1`,
    [projectId],
  );
  return rows.length === 0 ? null : (rows[0] as { workspace_id: string }).workspace_id;
}

/**
 * Membership gate for read routes: null means "answer 404" — a non-member
 * learns nothing, not even that the workspace exists.
 */
export async function requireMember(
  db: Queryable,
  userId: string,
  workspaceId: string,
): Promise<EffectiveRole | null> {
  const eff = await resolveEffectiveRole(db, userId, workspaceId);
  return eff.workspaceRole === null ? null : eff;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/read/visible-where.test.ts`
Expected: PASS. If the `@>` clause fails because `resolved_user_ids` landed as `text[]` rather than jsonb, apply the adaptation named in Cross-plan path assumptions — the agreement test is the oracle.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/read/visible-where.ts apps/server/src/read/membership.ts apps/server/test/helpers/read-scenario.ts apps/server/test/read/visible-where.test.ts
git commit -m "Visibility as one SQL predicate, proven against canSee over a five-viewer matrix so the set-based reads and the per-ticket oracle can never quietly disagree — plus the seeded world with a planted hidden ticket that every read test from here on reuses"
```

---
### Task 6: `proj_search` — the full-text projection

**Files:**
- Create: `apps/server/migrations/<timestamp>_proj-search.js` (generate as in Task 4)
- Create: `apps/server/src/projections/search.ts`
- Modify: `apps/server/src/projections/index.ts` (register after `proj_workspace_settings`)
- Test: `apps/server/test/projections/search.test.ts`

**Interfaces:**
- Consumes: `docToPlainText` (Task 1), `Projection`/registry (Plan 1), the ticket event vocabulary (Plan 3), apply helpers + scenario (Tasks 4–5).
- Produces:
  - Table `proj_search` (`ticket_id` PK, `workspace_id`, `project_id`, `title text`, `description text`, `comments text`, `tsv tsvector` GENERATED — weighted A/B/C over title/description/comments, `'simple'` config — GIN-indexed).
  - `searchProjection: Projection` (name `'proj_search'`) — folds `ticket.created` (title), `ticket.field_set` (`title`, `description` — the latter through `docToPlainText`), `comment.added` (plain text appended, newline-separated). Applied in registry order after `proj_tickets` (it sits at the registry tail). Deterministic: it touches only its own entity's row, so per-entity seq order — the only replay guarantee — fully determines it.
  - FTS config is `'simple'` (no English stemming — the audience writes in more than one language; flagged in Open questions).

- [ ] **Step 1: Write the failing test**

`apps/server/test/projections/search.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { searchProjection } from '../../src/projections/search.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { scenarioUsers, seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';

let pool: Pool;
let world: ReadScenario;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  resetEntitySeqs();
  world = await seedReadScenario(pool, scenarioUsers());
});

async function ftsHits(query: string): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT ticket_id FROM proj_search
     WHERE workspace_id = $1 AND tsv @@ websearch_to_tsquery('simple', $2)
     ORDER BY ticket_id`,
    [world.workspaceId, query],
  );
  return rows.map((r) => (r as { ticket_id: string }).ticket_id);
}

describe('proj_search', () => {
  it('indexes titles from ticket.created', async () => {
    expect(await ftsHits('licence')).toEqual([world.sharedTaskId].sort());
    expect(await ftsHits('GST')).toContain(world.taskInEpicId);
  });

  it('indexes descriptions as plain text via docToPlainText', async () => {
    expect(await ftsHits('timing')).toEqual([world.taskInEpicId]);
  });

  it('indexes comments, mentions included as @name', async () => {
    expect(await ftsHits('hold-up')).toEqual([world.taskInEpicId]);
    expect(await ftsHits('Kiro')).toEqual([world.taskInEpicId]); // the mention label is searchable
  });

  it('keeps every comment: a second comment does not erase the first', async () => {
    const { rows } = await pool.query('SELECT comments FROM proj_search WHERE ticket_id = $1', [world.hiddenTaskId]);
    expect((rows[0] as { comments: string }).comments).toContain('zebra-confidential');
  });

  it('follows a title re-claim (ticket.field_set title)', async () => {
    const { applyCommitted, makeCommitted } = await import('../helpers/apply.js');
    await applyCommitted(pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket', id: world.sharedTaskId },
        type: 'ticket.field_set',
        payload: { fieldId: 'title', value: 'Renew the FSSAI licence' },
      }),
    ]);
    expect(await ftsHits('FSSAI')).toEqual([world.sharedTaskId]);
  });

  it('is registered at the registry tail, after proj_tickets and proj_workspace_settings', async () => {
    const names = buildProjectionRegistry()
      .all()
      .map((p) => p.name);
    expect(names.indexOf('proj_search')).toBeGreaterThan(names.indexOf('proj_tickets'));
    expect(names.indexOf('proj_search')).toBeGreaterThan(names.indexOf('proj_workspace_settings'));
  });

  it('reproduces byte-identically on reset-and-replay (rebuild-and-diff)', async () => {
    const before = await pool.query('SELECT * FROM proj_search ORDER BY ticket_id');
    const { rows: ledger } = await pool.query(
      `SELECT * FROM events ORDER BY entity_kind, entity_id, seq`,
    );
    const { rowToEnvelope } = await import('../../src/ledger/event-store.js');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await searchProjection.reset(client);
      for (const row of ledger) await searchProjection.apply(rowToEnvelope(row), client);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const after = await pool.query('SELECT * FROM proj_search ORDER BY ticket_id');
    expect(after.rows).toEqual(before.rows);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/projections/search.test.ts`
Expected: FAIL — module and table missing.

- [ ] **Step 3: Write the migration**

```js
// apps/server/migrations/<timestamp>_proj-search.js
exports.up = (pgm) => {
  pgm.createTable('proj_search', {
    ticket_id: { type: 'text', primaryKey: true },
    workspace_id: { type: 'text', notNull: true },
    project_id: { type: 'text', notNull: true },
    title: { type: 'text', notNull: true, default: '' },
    description: { type: 'text', notNull: true, default: '' },
    comments: { type: 'text', notNull: true, default: '' },
  });
  pgm.sql(`ALTER TABLE proj_search ADD COLUMN tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(comments, '')), 'C')
  ) STORED`);
  pgm.createIndex('proj_search', 'tsv', { method: 'gin' });
  pgm.createIndex('proj_search', ['workspace_id']);
};

exports.down = (pgm) => {
  pgm.dropTable('proj_search');
};
```

- [ ] **Step 4: Implement the projection**

`apps/server/src/projections/search.ts`:

```ts
import { docToPlainText } from '@gisik-nokma/domain';
import type { Projection } from './registry.js';

/**
 * Full-text search over titles, descriptions, and comments (spec §7),
 * maintained as an ordinary projection. Visibility is enforced at READ
 * time by the /v1/search route — the projection itself stores every
 * ticket's text, like every other projection stores every ticket's state.
 *
 * Determinism: every statement touches only the event's own ticket row,
 * so per-entity seq order (the only replay guarantee) fully determines
 * the outcome; the tsv column is GENERATED from the text columns.
 */
export const searchProjection: Projection = {
  name: 'proj_search',
  tables: ['proj_search'],
  async apply(event, tx) {
    if (event.entity.kind !== 'ticket') return;
    if (event.type === 'ticket.created') {
      const payload = event.payload as { projectId: string; title: string };
      await tx.query(
        `INSERT INTO proj_search (ticket_id, workspace_id, project_id, title)
         VALUES ($1, $2, $3, $4)`,
        [event.entity.id, event.workspaceId, payload.projectId, payload.title],
      );
      return;
    }
    if (event.type === 'ticket.field_set') {
      const payload = event.payload as { fieldId: string; value: unknown };
      if (payload.fieldId === 'title' && typeof payload.value === 'string') {
        await tx.query('UPDATE proj_search SET title = $2 WHERE ticket_id = $1', [
          event.entity.id,
          payload.value,
        ]);
      }
      if (payload.fieldId === 'description') {
        await tx.query('UPDATE proj_search SET description = $2 WHERE ticket_id = $1', [
          event.entity.id,
          docToPlainText(payload.value),
        ]);
      }
      return;
    }
    if (event.type === 'comment.added') {
      const payload = event.payload as { body: unknown };
      const text = docToPlainText(payload.body);
      if (text.length === 0) return;
      await tx.query(
        `UPDATE proj_search
         SET comments = comments || CASE WHEN comments = '' THEN '' ELSE E'\\n' END || $2
         WHERE ticket_id = $1`,
        [event.entity.id, text],
      );
    }
  },
  async reset(tx) {
    await tx.query('TRUNCATE proj_search');
  },
};
```

In `apps/server/src/projections/index.ts`, register after `workspaceSettingsProjection`:

```ts
import { searchProjection } from './search.js';
// inside buildProjectionRegistry(), after workspaceSettingsProjection:
registry.register(searchProjection);
```

- [ ] **Step 5: Run migrations, then the test, to verify it passes**

Run: `pnpm --filter @gisik-nokma/server migrate`, then `pnpm --filter @gisik-nokma/server exec vitest run test/projections/search.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Run the whole projection suite to prove no interference**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/projections/`
Expected: PASS — the new projections change nothing for the existing ones.

- [ ] **Step 7: Commit**

```bash
git add apps/server/migrations apps/server/src/projections/search.ts apps/server/src/projections/index.ts apps/server/test/projections/search.test.ts
git commit -m "proj_search: titles, descriptions and comments as a weighted tsvector projection — descriptions and comments flow through docToPlainText so mentions are searchable by name, and reset-and-replay reproduces it byte for byte"
```

---

### Task 7: Read models — state provenance, workflow defs, and the TicketCard assembler

**Files:**
- Create: `packages/domain/src/read-models.ts`
- Modify: `packages/domain/src/index.ts` (add export)
- Create: `apps/server/src/read/state-provenance.ts`
- Create: `apps/server/src/read/workflow-defs.ts`
- Create: `apps/server/src/read/ticket-cards.ts`
- Test: `apps/server/test/read/ticket-cards.test.ts`

**Interfaces:**
- Consumes: `FieldClaim`, `StateCategory`, `Grouping` (domain); the `events` ledger table (Plan 1); `getWorkflowDefFromProjection`/`PublishedWorkflowDef` (Plan 2); `proj_tickets` columns (Plan 3); `rollupFor`/`RollupView` (Plan 4); scenario helpers (Task 5).
- Produces (cross-plan API — `@gisik-nokma/domain` exports the types; Plans 6/9/10 render these shapes through the `DataSource`):
  - `type TransitionCause = { kind: 'reopened-for-child'; childTicketId: string }` (owner decision: the reopen is never an anonymous flip).
  - `type StateProvenance = { actorId: string; clientTime: string; serverTime: string; cause: TransitionCause | null }`.
  - `type TicketRollup = { totalChildren: number; terminalChildren: number; restrictedCount: number }` — true counts over ALL children; `restrictedCount` is per-viewer, computed at read time (Plan 4's `rollupFor`).
  - `type DueDateClaim = { date: string; note?: string; actorId: string; clientTime: string; serverTime: string }`.
  - `type TicketCard = { ticketId; workspaceId; projectId; typeId; parentId: string | null; workflowId; stateId; stateCategory: StateCategory; assigneeId: string | null; collaboratorIds: string[]; title: string; dueDate: DueDateClaim | null; fields: Record<string, FieldClaim>; stateProvenance: StateProvenance; rollup: TicketRollup | null }` (all id/time fields `string`).
  - Response types the route tasks fill: `BoardColumn {workflowId; workflowName; stateId; name; category: StateCategory; blocked: boolean; cards: TicketCard[]}`, `BoardResponse {projectId; workspaceId; columns: BoardColumn[]}`, `ListGroup {key; label; cards: TicketCard[]}`, `ListResponse {projectId; groupBy: Grouping; groups: ListGroup[]; nextCursor: string | null}`, `SearchHit {card: TicketCard; snippet: string}`, `SearchResponse {workspaceId; query: string; hits: SearchHit[]}`, `MyWorkResponse {workspaceId; groups: {open: TicketCard[]; active: TicketCard[]; terminal: TicketCard[]}}`, `AttentionItem` (union below), `AttentionResponse {workspaceId; generatedAt: string; settings: {staleDays: number; dueSoonDays: number}; items: AttentionItem[]}`.
  - `AttentionItem = {kind:'blocked'; card; stateName: string; reason: string} | {kind:'stale'; card; enteredStateAt: string; daysInFlight: number; thresholdDays: number; reason: string} | {kind:'due-soon'; card; due: DueDateClaim; windowDays: number; reason: string}`. `enteredStateAt` is the absolute instant; `daysInFlight` is the count of **IST** days from that instant's IST day to today's — the two are different facts, and the second is the one a human reads (owner decision 2026-08-20, "time is Asia/Kolkata").
  - Server: `type ProjTicketRow` + `PROJ_TICKET_COLUMNS` (the `SELECT` list, alias `t`); `stateProvenanceFor(db: Queryable, ticketIds: string[]): Promise<Map<string, StateProvenance>>` (batched: latest `ticket.created`/`ticket.transitioned` per ticket from the ledger — both clocks, the actor, and the reopen `cause`); `latestWorkflowDefs(db: Queryable, workflowIds: string[]): Promise<Map<string, PublishedWorkflowDef>>`; `blockedStateKeys(defs: Map<string, PublishedWorkflowDef>): Set<string>` (keys `` `${workflowId}:${stateId}` ``); `assembleTicketCards(db: Queryable, viewerId: string, rows: ProjTicketRow[]): Promise<TicketCard[]>`.

- [ ] **Step 1: Write the domain read-model types**

`packages/domain/src/read-models.ts`:

```ts
import type { FieldClaim } from './ticket-state.js';
import type { StateCategory } from './workflow.js';
import type { Grouping } from './filter-spec.js';

/** Owner decision (coordination doc): a reopen names the child that caused it. */
export type TransitionCause = { kind: 'reopened-for-child'; childTicketId: string };

/**
 * Who claimed the current state, and when — by both clocks. The provenance
 * floor made queryable: every card carries this, so "Done" can always
 * unfold to "marked done by X on date".
 */
export type StateProvenance = {
  actorId: string;
  clientTime: string;
  serverTime: string;
  cause: TransitionCause | null;
};

/** True counts over ALL children; restrictedCount is per-viewer, read-time. */
export type TicketRollup = {
  totalChildren: number;
  terminalChildren: number;
  restrictedCount: number;
};

/** A due date is a claim: the date plus who claimed it and when. */
export type DueDateClaim = {
  date: string;
  note?: string;
  actorId: string;
  clientTime: string;
  serverTime: string;
};

export type TicketCard = {
  ticketId: string;
  workspaceId: string;
  projectId: string;
  typeId: string;
  parentId: string | null;
  workflowId: string;
  stateId: string;
  stateCategory: StateCategory;
  assigneeId: string | null;
  collaboratorIds: string[];
  title: string;
  dueDate: DueDateClaim | null;
  fields: Record<string, FieldClaim>;
  stateProvenance: StateProvenance;
  rollup: TicketRollup | null;
};

export type BoardColumn = {
  workflowId: string;
  workflowName: string;
  stateId: string;
  name: string;
  category: StateCategory;
  blocked: boolean;
  cards: TicketCard[];
};

export type BoardResponse = { projectId: string; workspaceId: string; columns: BoardColumn[] };

export type ListGroup = { key: string; label: string; cards: TicketCard[] };

export type ListResponse = {
  projectId: string;
  groupBy: Grouping;
  groups: ListGroup[];
  nextCursor: string | null;
};

export type SearchHit = { card: TicketCard; snippet: string };

export type SearchResponse = { workspaceId: string; query: string; hits: SearchHit[] };

export type MyWorkResponse = {
  workspaceId: string;
  groups: { open: TicketCard[]; active: TicketCard[]; terminal: TicketCard[] };
};

export type AttentionItem =
  | { kind: 'blocked'; card: TicketCard; stateName: string; reason: string }
  /**
   * `enteredStateAt` is the absolute instant the ticket entered its current
   * state. `daysInFlight` is how many INDIAN days ago that was — computed by
   * subtracting IST days, not by dividing a millisecond difference (owner
   * decision 2026-08-20, "time is Asia/Kolkata"). The two disagree for every
   * instant between 18:30Z and 00:00Z, which is the whole Indian evening.
   */
  | {
      kind: 'stale';
      card: TicketCard;
      enteredStateAt: string;
      daysInFlight: number;
      thresholdDays: number;
      reason: string;
    }
  | { kind: 'due-soon'; card: TicketCard; due: DueDateClaim; windowDays: number; reason: string };

export type AttentionResponse = {
  workspaceId: string;
  generatedAt: string;
  settings: { staleDays: number; dueSoonDays: number };
  items: AttentionItem[];
};
```

(If Plan 3's `FieldClaim` export lives elsewhere than `./ticket-state.js`, fix the import — the name is contract.) In `packages/domain/src/index.ts`, add:

```ts
export * from './read-models.js';
```

- [ ] **Step 2: Write the failing assembler test**

`apps/server/test/read/ticket-cards.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { newUlid } from '@gisik-nokma/domain';
import { fetchTicketRows, assembleTicketCards } from '../../src/read/ticket-cards.js';
import { stateProvenanceFor } from '../../src/read/state-provenance.js';
import { blockedStateKeys, latestWorkflowDefs } from '../../src/read/workflow-defs.js';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { scenarioUsers, seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';

let pool: Pool;
let world: ReadScenario;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  resetEntitySeqs();
  world = await seedReadScenario(pool, scenarioUsers());
});

describe('stateProvenanceFor', () => {
  it('answers the creation claim for a never-transitioned ticket', async () => {
    const map = await stateProvenanceFor(pool, [world.epicId]);
    expect(map.get(world.epicId)).toEqual({
      actorId: world.owner,
      clientTime: '2026-08-20T09:00:00.000Z',
      serverTime: '2026-08-20T09:00:01.000Z',
      cause: null,
    });
  });

  it('PLANTED DEFECT: after two transitions by different actors, the card carries the LAST claim — actor and both clocks', async () => {
    await applyCommitted(pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        clientTime: '2026-08-20T10:00:00.000Z',
        serverTime: '2026-08-20T10:00:02.000Z',
        entity: { kind: 'ticket', id: world.taskInEpicId },
        type: 'ticket.transitioned',
        payload: { toStateId: 'waiting' },
      }),
    ]);
    const map = await stateProvenanceFor(pool, [world.taskInEpicId]);
    expect(map.get(world.taskInEpicId)).toEqual({
      actorId: world.owner, // NOT member, who made the earlier transition
      clientTime: '2026-08-20T10:00:00.000Z',
      serverTime: '2026-08-20T10:00:02.000Z',
      cause: null,
    });
  });

  it('carries the reopen cause so boards can say "reopened — live work added"', async () => {
    await applyCommitted(pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.member,
        entity: { kind: 'ticket', id: world.sharedTaskId },
        type: 'ticket.transitioned',
        payload: { toStateId: 'doing', cause: { kind: 'reopened-for-child', childTicketId: world.taskInEpicId } },
      }),
    ]);
    const map = await stateProvenanceFor(pool, [world.sharedTaskId]);
    expect(map.get(world.sharedTaskId)?.cause).toEqual({
      kind: 'reopened-for-child',
      childTicketId: world.taskInEpicId,
    });
  });

  it('is total over its input: unknown ids are simply absent', async () => {
    const map = await stateProvenanceFor(pool, [newUlid()]);
    expect(map.size).toBe(0);
  });
});

describe('latestWorkflowDefs / blockedStateKeys', () => {
  it('answers the latest def and derives the blocked set from the flag', async () => {
    const defs = await latestWorkflowDefs(pool, [world.workflowId]);
    expect(defs.get(world.workflowId)?.name).toBe('Errands');
    expect(blockedStateKeys(defs)).toEqual(new Set([`${world.workflowId}:waiting`]));
  });
});

describe('assembleTicketCards', () => {
  it('assembles title, due-date claim, provenance, and the viewer-honest rollup', async () => {
    const rows = await fetchTicketRows(pool, [world.epicId, world.taskInEpicId]);
    const cards = await assembleTicketCards(pool, world.member, rows);
    const epic = cards.find((c) => c.ticketId === world.epicId);
    const task = cards.find((c) => c.ticketId === world.taskInEpicId);

    expect(epic?.title).toBe('Registrations drive');
    expect(epic?.rollup).toEqual({ totalChildren: 1, terminalChildren: 0, restrictedCount: 0 });

    expect(task?.title).toBe('File the GST return');
    expect(task?.stateId).toBe('doing');
    expect(task?.assigneeId).toBe(world.member);
    expect(task?.dueDate).toEqual({
      date: '2026-08-25',
      actorId: world.member,
      clientTime: '2026-08-19T18:30:00.000Z',
      serverTime: '2026-08-20T09:00:01.000Z',
    });
    expect(task?.stateProvenance.actorId).toBe(world.member);
    expect(task?.rollup).toBeNull(); // no children — absent, not zeroed
  });

  it('names restriction in the rollup: a hidden child counts, restrictedCount says so', async () => {
    const hiddenChildId = newUlid();
    await applyCommitted(pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket', id: hiddenChildId },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId: world.projectId, parentId: world.epicId, title: 'Quiet sibling' },
      }),
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket', id: hiddenChildId },
        type: 'visibility.set',
        payload: { ticketId: hiddenChildId, mode: 'explicit', userIds: [world.owner] },
      }),
    ]);
    const rows = await fetchTicketRows(pool, [world.epicId]);
    const [epicForMember] = await assembleTicketCards(pool, world.member, rows);
    expect(epicForMember.rollup).toEqual({ totalChildren: 2, terminalChildren: 0, restrictedCount: 1 });
    const [epicForOwner] = await assembleTicketCards(pool, world.owner, rows);
    expect(epicForOwner.rollup).toEqual({ totalChildren: 2, terminalChildren: 0, restrictedCount: 0 });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/read/ticket-cards.test.ts`
Expected: FAIL — the three modules do not exist.

- [ ] **Step 4: Implement state provenance**

`apps/server/src/read/state-provenance.ts`:

```ts
import type { StateProvenance, TransitionCause } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

/**
 * The claim that produced each ticket's CURRENT state: the latest
 * ticket.transitioned, or ticket.created if never transitioned — actor,
 * both clocks, and the reopen cause if the transition carried one.
 * Batched: one DISTINCT ON query over the ledger's (entity, seq) index.
 */
export async function stateProvenanceFor(
  db: Queryable,
  ticketIds: string[],
): Promise<Map<string, StateProvenance>> {
  if (ticketIds.length === 0) return new Map();
  const { rows } = await db.query(
    `SELECT DISTINCT ON (entity_id) entity_id, type, actor_id, client_time, server_time, payload
     FROM events
     WHERE entity_kind = 'ticket'
       AND entity_id = ANY($1)
       AND type IN ('ticket.created', 'ticket.transitioned')
     ORDER BY entity_id, seq DESC`,
    [ticketIds],
  );
  const provenance = new Map<string, StateProvenance>();
  for (const raw of rows) {
    const row = raw as {
      entity_id: string;
      type: string;
      actor_id: string;
      // BOTH clocks are `timestamptz` (Plan 1 Task 6, owner decision
      // 2026-08-20) — the driver yields `Date` for each. `client_time` was
      // typed `string` here from the era when it was a text column; there is
      // no cast on either side of this query any more, in SQL or in TS.
      client_time: Date;
      server_time: Date;
      payload: { cause?: TransitionCause };
    };
    provenance.set(row.entity_id, {
      actorId: row.actor_id,
      clientTime: row.client_time.toISOString(),
      serverTime: row.server_time.toISOString(),
      cause: row.type === 'ticket.transitioned' && row.payload.cause !== undefined ? row.payload.cause : null,
    });
  }
  return provenance;
}
```

- [ ] **Step 5: Implement the workflow-def batch and the assembler**

`apps/server/src/read/workflow-defs.ts`:

```ts
import type { PublishedWorkflowDef } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { getWorkflowDefFromProjection } from '../projections/workflows.js';

/** Latest published def per workflow id; unknown ids are simply absent. */
export async function latestWorkflowDefs(
  db: Queryable,
  workflowIds: string[],
): Promise<Map<string, PublishedWorkflowDef>> {
  const defs = new Map<string, PublishedWorkflowDef>();
  for (const workflowId of [...new Set(workflowIds)].sort()) {
    const def = await getWorkflowDefFromProjection(db, workflowId);
    if (def !== null) defs.set(workflowId, def);
  }
  return defs;
}

/** `${workflowId}:${stateId}` for every blocked-flagged state (amendment 9). */
export function blockedStateKeys(defs: Map<string, PublishedWorkflowDef>): Set<string> {
  const keys = new Set<string>();
  for (const [workflowId, def] of defs) {
    for (const state of def.states) {
      if ((state as { blocked?: boolean }).blocked === true) keys.add(`${workflowId}:${state.id}`);
    }
  }
  return keys;
}
```

`apps/server/src/read/ticket-cards.ts`:

```ts
import type { FieldClaim, TicketCard } from '@gisik-nokma/domain';
import type { StateCategory } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { rollupFor } from '../visibility/rollup.js';
import { stateProvenanceFor } from './state-provenance.js';

/** The snake_case row shape every read query selects (alias t). */
export type ProjTicketRow = {
  ticket_id: string;
  workspace_id: string;
  project_id: string;
  type_id: string;
  parent_id: string | null;
  workflow_id: string;
  state_id: string;
  state_category: StateCategory;
  assignee_id: string | null;
  collaborator_ids: string[];
  fields: Record<string, FieldClaim>;
};

export const PROJ_TICKET_COLUMNS =
  't.ticket_id, t.workspace_id, t.project_id, t.type_id, t.parent_id, ' +
  't.workflow_id, t.state_id, t.state_category, t.assignee_id, t.collaborator_ids, t.fields';

/** Test/route convenience: rows for explicit ids, ticket_id order. */
export async function fetchTicketRows(db: Queryable, ticketIds: string[]): Promise<ProjTicketRow[]> {
  const { rows } = await db.query(
    `SELECT ${PROJ_TICKET_COLUMNS} FROM proj_tickets t WHERE t.ticket_id = ANY($1) ORDER BY t.ticket_id`,
    [ticketIds],
  );
  return rows as ProjTicketRow[];
}

/**
 * proj_tickets rows → TicketCards: title and due-date claims extracted from
 * the FieldClaim map, state provenance batched from the ledger, rollups
 * per-viewer via Plan 4's rollupFor (true counts, restriction named).
 */
export async function assembleTicketCards(
  db: Queryable,
  viewerId: string,
  rows: ProjTicketRow[],
): Promise<TicketCard[]> {
  const provenance = await stateProvenanceFor(db, rows.map((r) => r.ticket_id));
  const cards: TicketCard[] = [];
  for (const row of rows) {
    const prov = provenance.get(row.ticket_id);
    if (prov === undefined) {
      // A projected ticket with no creating event means ledger integrity is
      // broken; inventing anonymous provenance would be a lie. Fail loudly.
      throw new Error(`no provenance for ticket ${row.ticket_id}: proj_tickets and the ledger disagree`);
    }
    const rollupView = await rollupFor(db, viewerId, row.ticket_id);
    const titleClaim = row.fields['title'];
    const dueClaim = row.fields['dueDate'];
    const dueValue = dueClaim?.value as { date?: string; note?: string } | undefined;
    cards.push({
      ticketId: row.ticket_id,
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      typeId: row.type_id,
      parentId: row.parent_id,
      workflowId: row.workflow_id,
      stateId: row.state_id,
      stateCategory: row.state_category,
      assigneeId: row.assignee_id,
      collaboratorIds: row.collaborator_ids,
      title: typeof titleClaim?.value === 'string' ? titleClaim.value : '',
      dueDate:
        dueClaim !== undefined && dueValue?.date !== undefined
          ? {
              date: dueValue.date,
              ...(dueValue.note !== undefined ? { note: dueValue.note } : {}),
              actorId: dueClaim.actorId,
              clientTime: dueClaim.clientTime,
              serverTime: dueClaim.serverTime,
            }
          : null,
      fields: row.fields,
      stateProvenance: prov,
      rollup:
        rollupView === null
          ? null
          : {
              totalChildren: rollupView.total,
              terminalChildren: rollupView.terminal,
              restrictedCount: rollupView.restrictedCount,
            },
    });
  }
  return cards;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/read/ticket-cards.test.ts`
Expected: PASS (7 tests). If Plan 3's `ticket.transitioned` payload schema refuses the `cause` key (the owner-decision amendment not yet applied there), apply that pending amendment first — it is owned by the coordination doc, not this plan.

- [ ] **Step 7: Typecheck and commit**

Run: `pnpm turbo run typecheck --filter=@gisik-nokma/domain --filter=@gisik-nokma/server`
Expected: clean.

```bash
git add packages/domain/src/read-models.ts packages/domain/src/index.ts apps/server/src/read/state-provenance.ts apps/server/src/read/workflow-defs.ts apps/server/src/read/ticket-cards.ts apps/server/test/read/ticket-cards.test.ts
git commit -m "TicketCard and friends: every card carries who claimed its state by both clocks (reopen cause included) and true child counts with restriction named — the planted two-actor defect proves provenance is the last claim, never a blur"
```

---

### Task 8: `GET /v1/projects/:projectId/board`

**Files:**
- Create: `apps/server/src/routes/board.ts`
- Modify: the app assembly (see Cross-plan path assumptions) — add `registerBoardRoutes(app, { pool, auth })`
- Test: `apps/server/test/routes/board.test.ts`

**Interfaces:**
- Consumes: `makeRequireSession`/`Auth`/`signInWithPhone` (Plan 4), `visibleTicketsWhere`/`workspaceOfProject`/`requireMember` (Task 5), `latestWorkflowDefs` (Task 7), `assembleTicketCards`/`PROJ_TICKET_COLUMNS`/`ProjTicketRow` (Task 7), `SqlParams` (Task 2), `BoardResponse` (domain).
- Produces (cross-plan API — Plan 6's online `DataSource.query` calls this):
  - `registerBoardRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void` serving `GET /v1/projects/:projectId/board` → `200 BoardResponse` | `404 {error:'not_found'}` (unknown project, or viewer not a workspace member — indistinguishable).
  - Column semantics: one column per (workflow in use, state of its latest def) — tickets of different workflows are grouped by their own states, side by side; every state of a used workflow appears even when empty; columns ordered by workflowId then def state order; cards by ticket_id. A ticket whose `state_id` is missing from its workflow's latest def (a mid-version-migration straggler Plan 2's state-mapping should make unreachable) gets a fallback column named by its state id with `category` from `proj_tickets` — shown, never hidden.

- [ ] **Step 1: Write the failing route test**

`apps/server/test/routes/board.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { newUlid, type BoardResponse } from '@gisik-nokma/domain';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { scenarioUsers, seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';
import { buildReadTestApp, signInAs } from '../helpers/read-app.js';

let pool: Pool;
let app: FastifyInstance;
let world: ReadScenario;
let tokens: Record<'owner' | 'member' | 'outsider' | 'guest' | 'stranger', string>;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
  app = await buildReadTestApp(pool);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  resetEntitySeqs();
  // Sessions first: membership events must name the REAL session user ids.
  const owner = await signInAs(app, '+911111111101');
  const member = await signInAs(app, '+911111111102');
  const outsider = await signInAs(app, '+911111111103');
  const guest = await signInAs(app, '+911111111104');
  const stranger = await signInAs(app, '+911111111105');
  tokens = {
    owner: owner.token,
    member: member.token,
    outsider: outsider.token,
    guest: guest.token,
    stranger: stranger.token,
  };
  world = await seedReadScenario(pool, {
    owner: owner.userId,
    member: member.userId,
    outsider: outsider.userId,
    guest: guest.userId,
  });
});

async function getBoard(token: string, projectId: string) {
  return app.inject({
    method: 'GET',
    url: `/v1/projects/${projectId}/board`,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('GET /v1/projects/:projectId/board', () => {
  it('groups tickets under their own workflow states, every state a column, blocked flag carried', async () => {
    const response = await getBoard(tokens.member, world.projectId);
    expect(response.statusCode).toBe(200);
    const board = response.json() as BoardResponse;
    expect(board.projectId).toBe(world.projectId);

    const columns = board.columns.map((c) => ({ stateId: c.stateId, name: c.name, category: c.category, blocked: c.blocked }));
    expect(columns).toEqual([
      { stateId: 'todo', name: 'To do', category: 'open', blocked: false },
      { stateId: 'doing', name: 'Doing', category: 'active', blocked: false },
      { stateId: 'waiting', name: 'Waiting on counterparty', category: 'active', blocked: true },
      { stateId: 'done', name: 'Done', category: 'terminal', blocked: false },
    ]);

    const byState = Object.fromEntries(board.columns.map((c) => [c.stateId, c.cards.map((x) => x.ticketId)]));
    expect(byState['todo']).toEqual([world.epicId].sort());
    expect(byState['doing']).toEqual([world.taskInEpicId]);
    expect(byState['waiting']).toEqual([world.sharedTaskId]);
    expect(byState['done']).toEqual([]); // empty state still a column
  });

  it('cards carry provenance and the epic carries its rollup', async () => {
    const board = (await getBoard(tokens.member, world.projectId)).json() as BoardResponse;
    const doing = board.columns.find((c) => c.stateId === 'doing');
    const card = doing?.cards[0];
    expect(card?.stateProvenance).toEqual({
      actorId: world.member,
      clientTime: '2026-08-01T09:00:00.000Z',
      serverTime: '2026-08-01T09:00:05.000Z',
      cause: null,
    });
    const todo = board.columns.find((c) => c.stateId === 'todo');
    expect(todo?.cards[0]?.rollup).toEqual({ totalChildren: 1, terminalChildren: 0, restrictedCount: 0 });
  });

  it('PLANTED DEFECT: the hidden ticket appears nowhere in the member board — not as a card, not as a count, not as an id', async () => {
    const response = await getBoard(tokens.member, world.projectId);
    expect(response.body).not.toContain(world.hiddenTaskId);
    expect(response.body).not.toContain('Salary review');
  });

  it('the owner board does include the hidden ticket — the filter is visibility, not deletion', async () => {
    const response = await getBoard(tokens.owner, world.projectId);
    expect(response.body).toContain(world.hiddenTaskId);
  });

  it('a guest board holds only their shared ticket', async () => {
    const board = (await getBoard(tokens.guest, world.projectId)).json() as BoardResponse;
    const allCards = board.columns.flatMap((c) => c.cards.map((x) => x.ticketId));
    expect(allCards).toEqual([world.guestTaskId]);
  });

  it('an on-workspace but off-project member gets an empty board, not a 404', async () => {
    const response = await getBoard(tokens.outsider, world.projectId);
    expect(response.statusCode).toBe(200);
    expect((response.json() as BoardResponse).columns).toEqual([]);
  });

  it('a stranger and an unknown project id get identical 404s', async () => {
    const stranger = await getBoard(tokens.stranger, world.projectId);
    const unknown = await getBoard(tokens.owner, newUlid());
    expect(stranger.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(stranger.json()).toEqual(unknown.json());
  });

  it('401s without a session', async () => {
    const response = await app.inject({ method: 'GET', url: `/v1/projects/${world.projectId}/board` });
    expect(response.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Write the shared read-app test helper**

`apps/server/test/helpers/read-app.ts` (built once here; every later route test imports it — Task 9 extends it with its route registration as routes land):

```ts
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildApp } from '../../src/app.js';
import { createAuth, type Auth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { registerAuthRoutes } from '../../src/auth/routes.js';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { registerBoardRoutes } from '../../src/routes/board.js';
import { signInWithPhone } from './session.js';

let otpSender: LogOtpSender;
let authInstance: Auth;

/**
 * The full read-side app: real ingest, real auth, and every route this
 * plan ships (later tasks add their register* call here as they land).
 */
export async function buildReadTestApp(pool: Pool): Promise<FastifyInstance> {
  otpSender = new LogOtpSender(() => {});
  authInstance = createAuth({ pool, otpSender, magicLinkSender: new LogMagicLinkSender(() => {}) });
  const ingest = createIngestService({ pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
  const app = buildApp({ db: pool, ingest });
  registerAuthRoutes(app, authInstance);
  registerBoardRoutes(app, { pool, auth: authInstance });
  await app.ready();
  return app;
}

/** Sign a fresh user in and answer their REAL user id plus bearer token. */
export async function signInAs(app: FastifyInstance, phone: string): Promise<{ userId: string; token: string }> {
  const token = await signInWithPhone(app, otpSender, phone);
  const session = await app.inject({
    method: 'GET',
    url: '/api/auth/get-session',
    headers: { authorization: `Bearer ${token}` },
  });
  const body = session.json() as { user: { id: string } };
  return { userId: body.user.id, token };
}
```

(Adapt the `createAuth` deps object and the get-session URL to Plan 4's actual shapes — `grep -rn "createAuth\|get-session" apps/server/src apps/server/test`. The helper's contract is what matters: a real session, its user id, its bearer token.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/board.test.ts`
Expected: FAIL — `registerBoardRoutes` does not exist.

- [ ] **Step 4: Implement the route**

`apps/server/src/routes/board.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { BoardColumn, BoardResponse, PublishedWorkflowDef, TicketCard } from '@gisik-nokma/domain';
import type { Auth } from '../auth/auth.js';
import { makeRequireSession } from '../auth/routes.js';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { SqlParams } from '../read/sql-params.js';
import { requireMember, workspaceOfProject } from '../read/membership.js';
import { visibleTicketsWhere } from '../read/visible-where.js';
import { latestWorkflowDefs } from '../read/workflow-defs.js';
import { assembleTicketCards, PROJ_TICKET_COLUMNS, type ProjTicketRow } from '../read/ticket-cards.js';

function sessionUserId(request: FastifyRequest): string {
  return (request as FastifyRequest & { currentUserId: string }).currentUserId;
}

/** Exported for tests; the route is a thin shell around it. */
export async function readBoard(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  projectId: string,
): Promise<BoardResponse> {
  const params = new SqlParams();
  const { rows } = await db.query(
    `SELECT ${PROJ_TICKET_COLUMNS}
     FROM proj_tickets t
     JOIN proj_visibility v ON v.ticket_id = t.ticket_id
     WHERE t.project_id = ${params.add(projectId)} AND ${visibleTicketsWhere(eff, viewerId, params)}
     ORDER BY t.ticket_id`,
    params.toArray(),
  );
  const ticketRows = rows as ProjTicketRow[];
  const cards = await assembleTicketCards(db, viewerId, ticketRows);
  const defs = await latestWorkflowDefs(db, ticketRows.map((r) => r.workflow_id));

  const columns: BoardColumn[] = [];
  const placed = new Set<string>();
  for (const [workflowId, def] of defs) {
    for (const state of def.states) {
      const columnCards = cards.filter((c) => c.workflowId === workflowId && c.stateId === state.id);
      for (const card of columnCards) placed.add(card.ticketId);
      columns.push({
        workflowId,
        workflowName: def.name,
        stateId: state.id,
        name: state.name,
        category: state.category,
        blocked: (state as { blocked?: boolean }).blocked === true,
        cards: columnCards,
      });
    }
  }
  // Stragglers: a state_id absent from the latest def (Plan 2's state
  // mapping should make this unreachable). Shown under its own column —
  // the board must not hide work it cannot classify.
  appendStragglerColumns(columns, cards, placed, defs);
  return { projectId, workspaceId, columns };
}

function appendStragglerColumns(
  columns: BoardColumn[],
  cards: TicketCard[],
  placed: Set<string>,
  defs: Map<string, PublishedWorkflowDef>,
): void {
  const stragglers = cards.filter((c) => !placed.has(c.ticketId));
  const byColumn = new Map<string, TicketCard[]>();
  for (const card of stragglers) {
    const key = `${card.workflowId}:${card.stateId}`;
    const bucket = byColumn.get(key) ?? [];
    bucket.push(card);
    byColumn.set(key, bucket);
  }
  for (const key of [...byColumn.keys()].sort()) {
    const bucket = byColumn.get(key)!;
    const { workflowId, stateId, stateCategory } = bucket[0];
    columns.push({
      workflowId,
      workflowName: defs.get(workflowId)?.name ?? workflowId,
      stateId,
      name: stateId,
      category: stateCategory,
      blocked: false,
      cards: bucket,
    });
  }
}

export function registerBoardRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void {
  const requireSession = makeRequireSession(deps.auth);
  app.get(
    '/v1/projects/:projectId/board',
    { preHandler: requireSession },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const viewerId = sessionUserId(request);
      const workspaceId = await workspaceOfProject(deps.pool, projectId);
      if (workspaceId === null) return reply.status(404).send({ error: 'not_found' });
      const eff = await requireMember(deps.pool, viewerId, workspaceId);
      if (eff === null) return reply.status(404).send({ error: 'not_found' });
      return readBoard(deps.pool, eff, viewerId, workspaceId, projectId);
    },
  );
}
```

(If `makeRequireSession` is exported from a different module than `../auth/routes.js`, fix the import — grep per Cross-plan path assumptions.)

- [ ] **Step 5: Register in the app assembly**

At the assembly point where Plan 4 registers its routes, add:

```ts
import { registerBoardRoutes } from './routes/board.js';
// alongside registerTicketRoutes(app, { pool, auth }):
registerBoardRoutes(app, { pool, auth });
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/board.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/routes/board.ts apps/server/test/routes/board.test.ts apps/server/test/helpers/read-app.ts apps/server/src/app.ts
git commit -m "Board read API: columns are exactly the attached workflows' states with the blocked flag carried, cards unfold to who claimed the state and when, and the planted hidden ticket proves absence from body bytes, not just from card lists"
```

---
### Task 9: `GET /v1/projects/:projectId/tickets` — the list read

**Files:**
- Create: `apps/server/src/routes/list.ts`
- Modify: the app assembly — add `registerListRoutes(app, { pool, auth })`
- Modify: `apps/server/test/helpers/read-app.ts` (register the route in the test app)
- Test: `apps/server/test/routes/list.test.ts`

**Interfaces:**
- Consumes: `filterSpecSchema`/`groupingSchema`/`Grouping` (Task 2), `compileFilterSpec`/`BLOCKED_STATES_CTE`/`SqlParams` (Task 2), `visibleTicketsWhere`/`workspaceOfProject`/`requireMember` (Task 5), `assembleTicketCards`/`PROJ_TICKET_COLUMNS` (Task 7), `latestWorkflowDefs` (Task 7), `ListResponse` (domain), `BUILTIN_TICKET_TYPE_SEEDS` (domain, Plan 3 — the epic rank is read from the built-in seed, never written as a literal `1`), and table `proj_ticket_types` (Plan 3, for that rank).
- Produces (cross-plan API):
  - `registerListRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void` serving `GET /v1/projects/:projectId/tickets?groupBy=&filter=&parentId=&cursor=&limit=` → `200 ListResponse` | `400 {error:'invalid_filter'|'invalid_grouping'|'invalid_limit'}` | `404 {error:'not_found'}`.
  - `filter` is URL-encoded JSON validated by `filterSpecSchema`; `groupBy` defaults to `flat`; `limit` defaults 50, max 200; keyset pagination by `ticket_id` (`cursor` = last ticket id of the previous page; ULIDs order by creation).
  - **Hierarchy support is children-by-parent-query (pinned):** `parentId=<id>` answers direct children; `parentId=root` answers roots; absent answers the whole project. Children are NOT inlined — clients expand a row by refetching with `parentId`.
  - **Grouping is applied per page (pinned):** pagination walks the flat matched set in ticket_id order; each page's rows are grouped, so a group key may recur on later pages and clients merge by `key`. Group semantics: `flat` → one group `all`; `status` → key `${workflowId}:${stateId}`, label = state name; `assignee` → key = assignee id or `unassigned`; `type` → key = type id; `epic` → key = the nearest ancestor-or-self whose ticket type carries the **epic rank** (label = its title), else `no-epic`. The epic rank is the rank the built-in `epic` seed carries, read from `BUILTIN_TICKET_TYPE_SEEDS` — so a custom type defined at that same rank heads its own group exactly as the built-in does (owner sign-off 2026-08-20; the rank is the concept, `'epic'` is only one id of it). Resolution therefore joins the workspace's `proj_ticket_types` roster rather than matching a type id.

- [ ] **Step 1: Write the failing route test**

`apps/server/test/routes/list.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { newUlid, type FilterSpec, type ListResponse } from '@gisik-nokma/domain';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { scenarioUsers, seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';
import { buildReadTestApp, signInAs } from '../helpers/read-app.js';

let pool: Pool;
let app: FastifyInstance;
let world: ReadScenario;
let memberToken: string;
let ownerToken: string;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
  app = await buildReadTestApp(pool);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  resetEntitySeqs();
  const owner = await signInAs(app, '+911111111101');
  const member = await signInAs(app, '+911111111102');
  const outsider = await signInAs(app, '+911111111103');
  const guest = await signInAs(app, '+911111111104');
  ownerToken = owner.token;
  memberToken = member.token;
  world = await seedReadScenario(pool, {
    owner: owner.userId,
    member: member.userId,
    outsider: outsider.userId,
    guest: guest.userId,
  });
});

async function getList(
  token: string,
  query: { groupBy?: string; filter?: FilterSpec | string; parentId?: string; cursor?: string; limit?: number } = {},
) {
  const parts: string[] = [];
  if (query.groupBy !== undefined) parts.push(`groupBy=${query.groupBy}`);
  if (query.filter !== undefined) {
    const raw = typeof query.filter === 'string' ? query.filter : JSON.stringify(query.filter);
    parts.push(`filter=${encodeURIComponent(raw)}`);
  }
  if (query.parentId !== undefined) parts.push(`parentId=${query.parentId}`);
  if (query.cursor !== undefined) parts.push(`cursor=${query.cursor}`);
  if (query.limit !== undefined) parts.push(`limit=${query.limit}`);
  const suffix = parts.length > 0 ? `?${parts.join('&')}` : '';
  return app.inject({
    method: 'GET',
    url: `/v1/projects/${world.projectId}/tickets${suffix}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function ids(list: ListResponse): string[] {
  return list.groups.flatMap((g) => g.cards.map((c) => c.ticketId));
}

describe('GET /v1/projects/:projectId/tickets', () => {
  it('answers the visible flat list by default', async () => {
    const list = (await getList(memberToken)).json() as ListResponse;
    expect(list.groupBy).toBe('flat');
    expect(list.groups).toHaveLength(1);
    expect(list.groups[0].key).toBe('all');
    expect(ids(list).sort()).toEqual([world.epicId, world.taskInEpicId, world.sharedTaskId].sort());
    expect(list.nextCursor).toBeNull();
  });

  it('composes filters: assignee + state category + due window', async () => {
    const filtered = (
      await getList(memberToken, {
        filter: { assigneeId: world.member, stateCategory: 'active', due: { before: '2026-08-31' } },
      })
    ).json() as ListResponse;
    expect(ids(filtered)).toEqual([world.taskInEpicId]);
  });

  it('filters on the blocked flag through the workflow definition', async () => {
    const blocked = (await getList(memberToken, { filter: { blocked: true } })).json() as ListResponse;
    expect(ids(blocked)).toEqual([world.sharedTaskId]);
  });

  it('joins a text term through FTS', async () => {
    const list = (await getList(memberToken, { filter: { text: 'GST' } })).json() as ListResponse;
    expect(ids(list)).toEqual([world.taskInEpicId]);
  });

  it('filters custom fields eq and contains', async () => {
    await applyCommitted(pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket-type', id: 'invoice' },
        type: 'ticket-type.defined',
        payload: {
          id: 'invoice',
          name: 'Invoice',
          icon: 'receipt',
          rank: 3,
          workflowId: world.workflowId,
          fields: [{ id: 'amount', name: 'Invoice amount', type: 'text' }],
        },
      }),
    ]);
    const invoiceId = newUlid();
    await applyCommitted(pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket', id: invoiceId },
        type: 'ticket.created',
        payload: { typeId: 'invoice', projectId: world.projectId, parentId: null, title: 'July printing invoice' },
      }),
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket', id: invoiceId },
        type: 'ticket.field_set',
        payload: { fieldId: 'amount', value: '4200' },
      }),
    ]);
    const eq = (await getList(memberToken, { filter: { fields: [{ fieldId: 'amount', op: 'eq', value: '4200' }] } })).json() as ListResponse;
    expect(ids(eq)).toEqual([invoiceId]);
    const contains = (await getList(memberToken, { filter: { fields: [{ fieldId: 'amount', op: 'contains', value: '42' }] } })).json() as ListResponse;
    expect(ids(contains)).toEqual([invoiceId]);
  });

  it('groups by epic with the epic heading its own group and a no-epic bucket', async () => {
    const list = (await getList(memberToken, { groupBy: 'epic' })).json() as ListResponse;
    const byKey = Object.fromEntries(list.groups.map((g) => [g.key, g]));
    expect(byKey[world.epicId].label).toBe('Registrations drive');
    expect(byKey[world.epicId].cards.map((c) => c.ticketId).sort()).toEqual([world.epicId, world.taskInEpicId].sort());
    expect(byKey['no-epic'].cards.map((c) => c.ticketId)).toEqual([world.sharedTaskId]);
  });

  it('PLANTED DEFECT: a custom type at the epic rank heads its own group — the rank is the concept, not the id', async () => {
    // A workspace that calls its top rung "Initiative" gets headings, not a
    // "no-epic" pile. Resolving on typeId === 'epic' fails BOTH assertions
    // below; resolving on the rank passes both.
    await applyCommitted(pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket-type', id: 'initiative' },
        type: 'ticket-type.defined',
        payload: {
          id: 'initiative',
          name: 'Initiative',
          icon: 'flag',
          rank: 1, // the same rank the built-in epic carries
          workflowId: world.workflowId,
          fields: [],
        },
      }),
    ]);
    const initiativeId = newUlid();
    const underInitiativeId = newUlid();
    await applyCommitted(pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket', id: initiativeId },
        type: 'ticket.created',
        payload: { typeId: 'initiative', projectId: world.projectId, parentId: null, title: 'Shop-front refresh' },
      }),
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket', id: underInitiativeId },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId: world.projectId, parentId: initiativeId, title: 'Repaint the shutter' },
      }),
    ]);

    const list = (await getList(memberToken, { groupBy: 'epic', limit: 200 })).json() as ListResponse;
    const byKey = Object.fromEntries(list.groups.map((g) => [g.key, g]));
    expect(byKey[initiativeId].label).toBe('Shop-front refresh');
    expect(byKey[initiativeId].cards.map((c) => c.ticketId).sort()).toEqual([initiativeId, underInitiativeId].sort());
    // and the child is NOT swept into the no-epic bucket
    expect(byKey['no-epic']?.cards.map((c) => c.ticketId) ?? []).not.toContain(underInitiativeId);
  });

  it('groups by status, assignee, and type', async () => {
    const status = (await getList(memberToken, { groupBy: 'status' })).json() as ListResponse;
    const statusKeys = status.groups.map((g) => g.key);
    expect(statusKeys).toContain(`${world.workflowId}:doing`);
    expect(status.groups.find((g) => g.key === `${world.workflowId}:doing`)?.label).toBe('Doing');

    const assignee = (await getList(memberToken, { groupBy: 'assignee' })).json() as ListResponse;
    expect(assignee.groups.find((g) => g.key === world.member)?.cards.map((c) => c.ticketId)).toEqual([world.taskInEpicId]);
    expect(assignee.groups.find((g) => g.key === 'unassigned')).toBeDefined();

    const type = (await getList(memberToken, { groupBy: 'type' })).json() as ListResponse;
    expect(type.groups.map((g) => g.key).sort()).toEqual(['epic', 'task']);
  });

  it('answers direct children by parentId and roots by parentId=root', async () => {
    const children = (await getList(memberToken, { parentId: world.epicId })).json() as ListResponse;
    expect(ids(children)).toEqual([world.taskInEpicId]);
    const roots = (await getList(memberToken, { parentId: 'root' })).json() as ListResponse;
    expect(ids(roots).sort()).toEqual([world.epicId, world.sharedTaskId].sort());
  });

  it('paginates by keyset: page two continues where page one stopped, no overlap, no gap', async () => {
    const pageOne = (await getList(memberToken, { limit: 2 })).json() as ListResponse;
    expect(ids(pageOne)).toHaveLength(2);
    expect(pageOne.nextCursor).not.toBeNull();
    const pageTwo = (await getList(memberToken, { limit: 2, cursor: pageOne.nextCursor! })).json() as ListResponse;
    expect(ids(pageTwo)).toHaveLength(1);
    expect(pageTwo.nextCursor).toBeNull();
    expect([...ids(pageOne), ...ids(pageTwo)].sort()).toEqual(
      [world.epicId, world.taskInEpicId, world.sharedTaskId].sort(),
    );
  });

  it('PLANTED DEFECT: the hidden ticket is absent from every grouping and every page', async () => {
    for (const groupBy of ['flat', 'status', 'assignee', 'type', 'epic']) {
      const response = await getList(memberToken, { groupBy });
      expect(response.body).not.toContain(world.hiddenTaskId);
    }
    const owner = await getList(ownerToken);
    expect(owner.body).toContain(world.hiddenTaskId);
  });

  it('PLANTED DEFECT: a hostile filter executes harmlessly — parameters, not SQL', async () => {
    const hostile: FilterSpec = {
      text: `'); DELETE FROM events; --`,
      fields: [{ fieldId: `x'; DROP TABLE proj_tickets; --`, op: 'contains', value: `%' OR '1'='1` }],
    };
    const response = await getList(memberToken, { filter: hostile });
    expect(response.statusCode).toBe(200);
    expect(ids(response.json() as ListResponse)).toEqual([]);
    const intact = await pool.query(`SELECT to_regclass('proj_tickets') AS t, count(*)::int AS events FROM events`);
    expect((intact.rows[0] as { t: string | null }).t).toBe('proj_tickets');
    expect((intact.rows[0] as { events: number }).events).toBeGreaterThan(0);
  });

  it('refuses malformed inputs without echoing internals', async () => {
    expect((await getList(memberToken, { filter: 'not json' })).statusCode).toBe(400);
    expect((await getList(memberToken, { filter: { velocity: 9 } as unknown as FilterSpec })).statusCode).toBe(400);
    expect((await getList(memberToken, { groupBy: 'priority' })).statusCode).toBe(400);
    expect((await getList(memberToken, { limit: 0 })).statusCode).toBe(400);
    expect((await getList(memberToken, { limit: 999 })).statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/list.test.ts`
Expected: FAIL — `registerListRoutes` does not exist (the test app helper will not compile once the import is added; add `registerListRoutes(app, { pool, auth: authInstance });` to `buildReadTestApp` now, mirroring Task 8's line).

- [ ] **Step 3: Implement the route**

`apps/server/src/routes/list.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import {
  BUILTIN_TICKET_TYPE_SEEDS,
  filterSpecSchema,
  groupingSchema,
  type FilterSpec,
  type Grouping,
  type ListGroup,
  type ListResponse,
  type TicketCard,
} from '@gisik-nokma/domain';
import type { Auth } from '../auth/auth.js';
import { makeRequireSession } from '../auth/routes.js';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { BLOCKED_STATES_CTE, compileFilterSpec } from '../read/compile-filter.js';
import { SqlParams } from '../read/sql-params.js';
import { requireMember, workspaceOfProject } from '../read/membership.js';
import { visibleTicketsWhere } from '../read/visible-where.js';
import { latestWorkflowDefs } from '../read/workflow-defs.js';
import { assembleTicketCards, PROJ_TICKET_COLUMNS, type ProjTicketRow } from '../read/ticket-cards.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * The epic rank — read from the built-in seeds, never hardcoded as 1.
 * Grouping by epic resolves the nearest ancestor-or-self whose TYPE carries
 * this rank, so a workspace that renamed its top rung ("Initiative",
 * "Campaign") gets its own headings without asking us for permission
 * (owner sign-off 2026-08-20). Rank is the concept; `'epic'` is one id of it.
 */
const EPIC_RANK = BUILTIN_TICKET_TYPE_SEEDS.find((seed) => seed.id === 'epic')!.rank;

export type ListQuery = {
  spec: FilterSpec;
  groupBy: Grouping;
  parentId?: string;
  cursor?: string;
  limit: number;
};

/** Exported for tests; the route is a thin shell around it. */
export async function readList(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  projectId: string,
  query: ListQuery,
): Promise<ListResponse> {
  const params = new SqlParams();
  const where: string[] = [`t.project_id = ${params.add(projectId)}`];
  where.push(visibleTicketsWhere(eff, viewerId, params));
  const compiled = compileFilterSpec(query.spec, params);
  where.push(...compiled.clauses);
  if (query.parentId === 'root') where.push('t.parent_id IS NULL');
  else if (query.parentId !== undefined) where.push(`t.parent_id = ${params.add(query.parentId)}`);
  if (query.cursor !== undefined) where.push(`t.ticket_id > ${params.add(query.cursor)}`);

  const cte = compiled.needsBlockedCte ? `WITH ${BLOCKED_STATES_CTE} ` : '';
  const { rows } = await db.query(
    `${cte}SELECT ${PROJ_TICKET_COLUMNS}
     FROM proj_tickets t
     JOIN proj_visibility v ON v.ticket_id = t.ticket_id
     WHERE ${where.join(' AND ')}
     ORDER BY t.ticket_id
     LIMIT ${params.add(query.limit + 1)}`,
    params.toArray(),
  );
  const overflow = rows.length > query.limit;
  const pageRows = (rows as ProjTicketRow[]).slice(0, query.limit);
  const cards = await assembleTicketCards(db, viewerId, pageRows);
  const groups = await groupCards(db, workspaceId, cards, pageRows, query.groupBy);
  return {
    projectId,
    groupBy: query.groupBy,
    groups,
    nextCursor: overflow && pageRows.length > 0 ? pageRows[pageRows.length - 1].ticket_id : null,
  };
}

/**
 * Grouping is applied per page (pinned): a group key may recur on later
 * pages; clients merge by key. Grouping arranges truth — it never changes
 * which tickets match.
 */
async function groupCards(
  db: Queryable,
  workspaceId: string,
  cards: TicketCard[],
  rows: ProjTicketRow[],
  groupBy: Grouping,
): Promise<ListGroup[]> {
  if (groupBy === 'flat') return [{ key: 'all', label: 'All tickets', cards }];
  if (groupBy === 'assignee') {
    return bucket(cards, (c) => c.assigneeId ?? 'unassigned', (key) => (key === 'unassigned' ? 'Unassigned' : key));
  }
  if (groupBy === 'type') return bucket(cards, (c) => c.typeId, (key) => key);
  if (groupBy === 'status') {
    const defs = await latestWorkflowDefs(db, rows.map((r) => r.workflow_id));
    return bucket(
      cards,
      (c) => `${c.workflowId}:${c.stateId}`,
      (key) => {
        const [workflowId, stateId] = key.split(':');
        return defs.get(workflowId)?.states.find((s) => s.id === stateId)?.name ?? stateId;
      },
    );
  }
  // epic: nearest ancestor-or-self whose type carries the epic rank — the
  // built-in 'epic' and every custom type defined at the same rank alike
  const epicOf = await epicAncestors(db, workspaceId, cards.map((c) => c.ticketId));
  const epicIds = [...new Set([...epicOf.values()])];
  const titles = await epicTitles(db, epicIds);
  return bucket(
    cards,
    (c) => epicOf.get(c.ticketId) ?? 'no-epic',
    (key) => (key === 'no-epic' ? 'No epic' : (titles.get(key) ?? key)),
  );
}

function bucket(
  cards: TicketCard[],
  keyOf: (card: TicketCard) => string,
  labelOf: (key: string) => string,
): ListGroup[] {
  const buckets = new Map<string, TicketCard[]>();
  for (const card of cards) {
    const key = keyOf(card);
    const existing = buckets.get(key) ?? [];
    existing.push(card);
    buckets.set(key, existing);
  }
  return [...buckets.keys()].sort().map((key) => ({ key, label: labelOf(key), cards: buckets.get(key)! }));
}

/**
 * Nearest ancestor-or-self whose ticket type carries the epic rank. The
 * rank lives on `proj_ticket_types` (workspace-scoped, last definition
 * wins), so the walk asks the type roster rather than matching one id —
 * a workspace's own top-rung type heads its own groups.
 */
async function epicAncestors(db: Queryable, workspaceId: string, ticketIds: string[]): Promise<Map<string, string>> {
  if (ticketIds.length === 0) return new Map();
  const { rows } = await db.query(
    `WITH RECURSIVE ancestry AS (
       SELECT t.ticket_id AS start_id, t.ticket_id, t.parent_id, t.type_id, 0 AS depth
       FROM proj_tickets t WHERE t.ticket_id = ANY($1)
       UNION ALL
       SELECT a.start_id, p.ticket_id, p.parent_id, p.type_id, a.depth + 1
       FROM ancestry a JOIN proj_tickets p ON p.ticket_id = a.parent_id
       WHERE a.depth < 32
     )
     SELECT DISTINCT ON (start_id) start_id, ticket_id AS epic_id
     FROM ancestry
     WHERE type_id IN (
       SELECT type_id FROM proj_ticket_types WHERE workspace_id = $2 AND rank = $3
     )
     ORDER BY start_id, depth`,
    [ticketIds, workspaceId, EPIC_RANK],
  );
  return new Map(rows.map((r) => [(r as { start_id: string }).start_id, (r as { epic_id: string }).epic_id]));
}

async function epicTitles(db: Queryable, epicIds: string[]): Promise<Map<string, string>> {
  if (epicIds.length === 0) return new Map();
  const { rows } = await db.query(
    `SELECT ticket_id, fields -> 'title' ->> 'value' AS title FROM proj_tickets WHERE ticket_id = ANY($1)`,
    [epicIds],
  );
  return new Map(rows.map((r) => [(r as { ticket_id: string }).ticket_id, (r as { title: string | null }).title ?? '']));
}

export function registerListRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void {
  const requireSession = makeRequireSession(deps.auth);
  app.get(
    '/v1/projects/:projectId/tickets',
    { preHandler: requireSession },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const raw = request.query as { groupBy?: string; filter?: string; parentId?: string; cursor?: string; limit?: string };

      const groupByParsed = groupingSchema.safeParse(raw.groupBy ?? 'flat');
      if (!groupByParsed.success) return reply.status(400).send({ error: 'invalid_grouping' });

      let spec: FilterSpec = {};
      if (raw.filter !== undefined) {
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(raw.filter);
        } catch {
          return reply.status(400).send({ error: 'invalid_filter' });
        }
        const specParsed = filterSpecSchema.safeParse(parsedJson);
        if (!specParsed.success) return reply.status(400).send({ error: 'invalid_filter' });
        spec = specParsed.data;
      }

      let limit = DEFAULT_LIMIT;
      if (raw.limit !== undefined) {
        limit = Number(raw.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
          return reply.status(400).send({ error: 'invalid_limit' });
        }
      }

      const viewerId = (request as FastifyRequest & { currentUserId: string }).currentUserId;
      const workspaceId = await workspaceOfProject(deps.pool, projectId);
      if (workspaceId === null) return reply.status(404).send({ error: 'not_found' });
      const eff = await requireMember(deps.pool, viewerId, workspaceId);
      if (eff === null) return reply.status(404).send({ error: 'not_found' });

      return readList(deps.pool, eff, viewerId, workspaceId, projectId, {
        spec,
        groupBy: groupByParsed.data,
        parentId: raw.parentId,
        cursor: raw.cursor,
        limit,
      });
    },
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/list.test.ts`
Expected: PASS (13 tests), the end-to-end injection planted defect and the custom-epic-rank grouping defect included.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/list.ts apps/server/test/routes/list.test.ts apps/server/test/helpers/read-app.ts apps/server/src/app.ts
git commit -m "List read API: composable filters, five groupings with children-by-parent-query pinned, keyset pages that group per page — and the hostile filter executed end-to-end proves the tables outlive the attacker"
```

---

### Task 9b: Builder read surface — workflows, ticket types, members, and state occupancy

Plan 8's workflow builder authors `workflow.defined` and `ticket-type.defined` claims, but it cannot author against definitions it cannot read: it needs the workflow roster to list, one definition to load onto the canvas, the ticket types bound to a workflow, the people a `require-different-user` rule can name, and — before a publish remaps states — how many tickets are actually sitting in each state today. Plan 8 flagged all five as missing from this plan's read surface (its "Read APIs this plan needs"); they land here, beside the other read routes, enforced the same way.

**Files:**
- Create: `apps/server/src/routes/builder-reads.ts`
- Modify: `packages/domain/src/read-models.ts` (add the five response shapes)
- Modify: the app assembly — add `registerBuilderReadRoutes(app, { pool, auth })`
- Modify: `apps/server/test/helpers/read-app.ts` (register the routes in the test app)
- Test: `apps/server/test/routes/builder-reads.test.ts`

**Interfaces:**
- Consumes: `makeRequireSession`/`Auth`/`signInWithPhone` (Plan 4), `requireMember` (Task 5), `latestWorkflowDefs` (Task 7), `getWorkflowDefFromProjection`/`PublishedWorkflowDef` and table `proj_workflows` (Plan 2), `TicketTypeDef` and table `proj_ticket_types` (Plan 3), table `proj_memberships` and better-auth's `"user"` table (Plan 4), `proj_tickets` (Plan 3), `Queryable` (Plan 4), scenario helpers (Task 5).
- Produces (cross-plan API — Plan 8 consumes these through Plan 6's `DataSource.query`):
  - `registerBuilderReadRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void` serving, all session-gated and all answering `404 {error:'not_found'}` when the caller is not a member of the workspace (an unknown workspace and a workspace you are not in are indistinguishable — this plan's reads never 403):
    - `GET /v1/workspaces/:workspaceId/workflows` → `200 WorkflowListResponse` — the latest published definition of every workflow in the workspace, member-visible (guests included: they already receive definition events on the stream, and a guest's shared ticket cannot render its status without one).
    - `GET /v1/workspaces/:workspaceId/workflows/:workflowId?version=` → `200 WorkflowResponse` | `400 {error:'invalid_version'}` | `404 {error:'not_found'}` — latest by default; `version` selects an exact published version (the builder loads an older one to compare before republishing). A version that was never published is a 404, not an empty body.
    - `GET /v1/workspaces/:workspaceId/ticket-types` → `200 TicketTypeListResponse` — every type defined in the workspace, last definition wins (`proj_ticket_types` already holds only the winner).
    - `GET /v1/workspaces/:workspaceId/members` → `200 MemberListResponse` — `{userId, displayName, role}` per member, `proj_memberships` joined to better-auth's `"user"` table for the display name. **Guests are excluded from the listing for non-admin callers**: a guest is a person invited to one shared ticket, not a member of the workspace's roster, and handing every member a directory of them leaks who else the workspace is talking to. Owners and admins — who manage people — see the full list.
    - `GET /v1/workspaces/:workspaceId/workflows/:workflowId/state-occupancy` → `200 StateOccupancyResponse` — how many tickets currently sit in each state of that workflow, **owner/admin only**, because it powers Plan 8's publish mapping dialog ("14 tickets are in Waiting — where do they go?").
  - Domain response shapes: `WorkflowListResponse {workspaceId; workflows: PublishedWorkflowDef[]}`, `WorkflowResponse {workspaceId; workflow: PublishedWorkflowDef}`, `TicketTypeListResponse {workspaceId; ticketTypes: TicketTypeDef[]}`, `WorkspaceMember {userId; displayName; role: WorkspaceRole}`, `MemberListResponse {workspaceId; members: WorkspaceMember[]}`, `StateOccupancyResponse {workspaceId; workflowId; counts: Record<string, number>}`.

**Honesty decisions encoded here (each is a sentence someone would otherwise have to guess):**
- **State occupancy counts every ticket, including ones the caller cannot see.** It is an operational number about the workflow, not a view of the work — the same "true counts" principle as Plan 4's rollups, which show a real total beside a named `restrictedCount`. There is no per-viewer variant to drift out of step: the endpoint is admin-only precisely because the honest number is the whole workspace's.
- **Every state of the latest definition appears in `counts`, zeroes included**, and a `state_id` that no longer exists in the definition appears too (Open questions #8's straggler). A mapping dialog that silently omitted an empty state would invite an author to delete a state that turns out to hold work tomorrow, and one that hid a straggler would strand it.
- **`displayName` is whatever better-auth's `"user"."name"` holds** — the vendor owns identity (Plan 4), and this route neither invents a fallback nor formats a phone number into a name.

- [ ] **Step 1: Write the failing route test**

`apps/server/test/routes/builder-reads.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { newUlid, type MemberListResponse, type StateOccupancyResponse, type TicketTypeListResponse, type WorkflowListResponse, type WorkflowResponse } from '@gisik-nokma/domain';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';
import { buildReadTestApp, signInAs } from '../helpers/read-app.js';

let pool: Pool;
let app: FastifyInstance;
let world: ReadScenario;
let ownerToken: string;
let memberToken: string;
let guestToken: string;
let strangerToken: string;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
  app = await buildReadTestApp(pool);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  resetEntitySeqs();
  const owner = await signInAs(app, '+911111111101');
  const member = await signInAs(app, '+911111111102');
  const outsider = await signInAs(app, '+911111111103');
  const guest = await signInAs(app, '+911111111104');
  const stranger = await signInAs(app, '+911111111105');
  ownerToken = owner.token;
  memberToken = member.token;
  guestToken = guest.token;
  strangerToken = stranger.token;
  world = await seedReadScenario(pool, {
    owner: owner.userId,
    member: member.userId,
    outsider: outsider.userId,
    guest: guest.userId,
  });
});

function get(token: string, path: string) {
  return app.inject({
    method: 'GET',
    url: `/v1/workspaces/${world.workspaceId}${path}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('GET /v1/workspaces/:workspaceId/workflows', () => {
  it('answers the latest definition of every workflow in the workspace', async () => {
    const body = (await get(memberToken, '/workflows')).json() as WorkflowListResponse;
    expect(body.workspaceId).toBe(world.workspaceId);
    expect(body.workflows.map((def) => [def.id, def.version])).toEqual([[world.workflowId, 1]]);
    expect(body.workflows[0].states.map((state) => state.id)).toEqual(['todo', 'doing', 'waiting', 'done']);
    expect(body.workflows[0].initialStateId).toBe('todo');
  });

  it('reaches guests too — a shared ticket cannot render its status without its definition', async () => {
    const body = (await get(guestToken, '/workflows')).json() as WorkflowListResponse;
    expect(body.workflows.map((def) => def.id)).toEqual([world.workflowId]);
  });

  it('a non-member gets the same 404 as an unknown workspace, and no session is a 401', async () => {
    expect((await get(strangerToken, '/workflows')).statusCode).toBe(404);
    const unknown = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${newUlid()}/workflows`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: 'not_found' });
    const anonymous = await app.inject({ method: 'GET', url: `/v1/workspaces/${world.workspaceId}/workflows` });
    expect(anonymous.statusCode).toBe(401);
  });
});

describe('GET /v1/workspaces/:workspaceId/workflows/:workflowId', () => {
  it('answers the latest version by default and an exact version on request', async () => {
    const latest = (await get(memberToken, `/workflows/${world.workflowId}`)).json() as WorkflowResponse;
    expect(latest.workflow.version).toBe(1);
    const pinned = (await get(memberToken, `/workflows/${world.workflowId}?version=1`)).json() as WorkflowResponse;
    expect(pinned.workflow).toEqual(latest.workflow);
  });

  it('refuses a malformed version and 404s a version that was never published', async () => {
    const malformed = await get(memberToken, `/workflows/${world.workflowId}?version=one`);
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({ error: 'invalid_version' });
    expect((await get(memberToken, `/workflows/${world.workflowId}?version=0`)).statusCode).toBe(400);
    expect((await get(memberToken, `/workflows/${world.workflowId}?version=7`)).statusCode).toBe(404);
    expect((await get(memberToken, '/workflows/wf-ghost')).statusCode).toBe(404);
  });
});

describe('GET /v1/workspaces/:workspaceId/ticket-types', () => {
  it('answers every type defined in the workspace', async () => {
    const body = (await get(memberToken, '/ticket-types')).json() as TicketTypeListResponse;
    expect(body.ticketTypes.map((type) => [type.id, type.rank, type.workflowId])).toEqual([
      ['epic', 1, world.workflowId],
      ['task', 3, world.workflowId],
    ]);
    expect(body.ticketTypes[0].name).toBe('Epic');
  });
});

describe('GET /v1/workspaces/:workspaceId/members', () => {
  it('answers userId, displayName and role for the workspace roster', async () => {
    const body = (await get(ownerToken, '/members')).json() as MemberListResponse;
    const byUser = Object.fromEntries(body.members.map((m) => [m.userId, m.role]));
    expect(byUser[world.owner]).toBe('owner');
    expect(byUser[world.member]).toBe('member');
    expect(byUser[world.outsider]).toBe('member');
    // better-auth owns what a fresh phone sign-up puts in "name"; the contract
    // here is that the column travels as displayName, not what it contains.
    expect(body.members.every((m) => typeof m.displayName === 'string')).toBe(true);
  });

  it('PLANTED DEFECT: a plain member never sees the guest — not the row, not the id', async () => {
    const asMember = await get(memberToken, '/members');
    expect(asMember.body).not.toContain(world.guest);
    expect((asMember.json() as MemberListResponse).members.map((m) => m.role)).not.toContain('guest');

    const asOwner = await get(ownerToken, '/members');
    expect(asOwner.body).toContain(world.guest);
    expect((asOwner.json() as MemberListResponse).members.find((m) => m.userId === world.guest)?.role).toBe('guest');
  });

  it('a guest asking for the roster gets the non-guest members and never their own kind', async () => {
    const body = (await get(guestToken, '/members')).json() as MemberListResponse;
    expect(body.members.map((m) => m.role)).not.toContain('guest');
  });
});

describe('GET /v1/workspaces/:workspaceId/workflows/:workflowId/state-occupancy', () => {
  it('counts the tickets sitting in each state, zeroes included', async () => {
    const body = (
      await get(ownerToken, `/workflows/${world.workflowId}/state-occupancy`)
    ).json() as StateOccupancyResponse;
    expect(body.workflowId).toBe(world.workflowId);
    // epic + hidden + guest-shared sit in todo; the GST task moved to doing;
    // the trade licence waits. Done is empty and says so.
    expect(body.counts).toEqual({ todo: 3, doing: 1, waiting: 1, done: 0 });
  });

  it('PLANTED DEFECT: the count is the workspace truth, and only admins may have it', async () => {
    // The hidden ticket the member cannot see is INSIDE the owner's todo count —
    // an occupancy that quietly dropped it would send a publish mapping into
    // production believing three tickets were two.
    const owner = (
      await get(ownerToken, `/workflows/${world.workflowId}/state-occupancy`)
    ).json() as StateOccupancyResponse;
    expect(owner.counts.todo).toBe(3);

    expect((await get(memberToken, `/workflows/${world.workflowId}/state-occupancy`)).statusCode).toBe(404);
    expect((await get(guestToken, `/workflows/${world.workflowId}/state-occupancy`)).statusCode).toBe(404);
    expect((await get(strangerToken, `/workflows/${world.workflowId}/state-occupancy`)).statusCode).toBe(404);
    expect((await get(ownerToken, '/workflows/wf-ghost/state-occupancy')).statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/builder-reads.test.ts`
Expected: FAIL — `registerBuilderReadRoutes` does not exist. Add `registerBuilderReadRoutes(app, { pool, auth: authInstance });` to `buildReadTestApp` now, mirroring Task 8's line.

- [ ] **Step 3: Add the response shapes to the domain read models**

Append to `packages/domain/src/read-models.ts`:

```ts
import type { PublishedWorkflowDef, WorkspaceRole } from './index.js';
import type { TicketTypeDef } from './ticket-types.js';

/** The builder's read surface (Plan 8 consumes these through DataSource.query). */
export type WorkflowListResponse = { workspaceId: string; workflows: PublishedWorkflowDef[] };

export type WorkflowResponse = { workspaceId: string; workflow: PublishedWorkflowDef };

export type TicketTypeListResponse = { workspaceId: string; ticketTypes: TicketTypeDef[] };

export type WorkspaceMember = { userId: string; displayName: string; role: WorkspaceRole };

export type MemberListResponse = { workspaceId: string; members: WorkspaceMember[] };

/**
 * Tickets currently sitting in each state of one workflow. Counts cover the
 * whole workspace, not the caller's view — the route is admin-only for exactly
 * that reason. Every state of the latest definition appears, zeroes included,
 * and so does any state id still occupied but no longer defined.
 */
export type StateOccupancyResponse = {
  workspaceId: string;
  workflowId: string;
  counts: Record<string, number>;
};
```

(Import `PublishedWorkflowDef` and `WorkspaceRole` from wherever Plans 2 and 4 export them — the names are contract, the module paths are not.)

- [ ] **Step 4: Implement the routes**

`apps/server/src/routes/builder-reads.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type {
  MemberListResponse,
  PublishedWorkflowDef,
  StateOccupancyResponse,
  TicketTypeDef,
  TicketTypeListResponse,
  WorkflowListResponse,
  WorkflowResponse,
  WorkspaceMember,
} from '@gisik-nokma/domain';
import type { Auth } from '../auth/auth.js';
import { makeRequireSession } from '../auth/routes.js';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { getWorkflowDefFromProjection } from '../projections/workflows.js';
import { requireMember } from '../read/membership.js';
import { latestWorkflowDefs } from '../read/workflow-defs.js';

/** A published version is a positive integer; anything else is a bad request. */
const versionSchema = z.coerce.number().int().positive();

function sessionUserId(request: FastifyRequest): string {
  return (request as FastifyRequest & { currentUserId: string }).currentUserId;
}

function isWorkspaceAdmin(eff: EffectiveRole): boolean {
  return eff.workspaceRole === 'owner' || eff.workspaceRole === 'admin';
}

/** Every workflow id defined in this workspace, in a stable order. */
async function workflowIdsOf(db: Queryable, workspaceId: string): Promise<string[]> {
  const { rows } = await db.query(
    'SELECT DISTINCT workflow_id FROM proj_workflows WHERE workspace_id = $1 ORDER BY workflow_id',
    [workspaceId],
  );
  return (rows as Array<{ workflow_id: string }>).map((row) => row.workflow_id);
}

export async function readTicketTypes(db: Queryable, workspaceId: string): Promise<TicketTypeDef[]> {
  const { rows } = await db.query(
    `SELECT type_id, name, icon, rank, workflow_id, fields
     FROM proj_ticket_types WHERE workspace_id = $1 ORDER BY rank, type_id`,
    [workspaceId],
  );
  return (rows as Array<{
    type_id: string; name: string; icon: string; rank: number; workflow_id: string; fields: TicketTypeDef['fields'];
  }>).map((row) => ({
    id: row.type_id,
    name: row.name,
    icon: row.icon,
    rank: row.rank,
    workflowId: row.workflow_id,
    fields: row.fields,
  }));
}

/**
 * One role per person: the workspace-scope grant when there is one, otherwise
 * the project-scope grant that attached them (how guests arrive — coordination
 * decision 5). Guests are withheld from non-admin callers: a guest is a person
 * invited to one shared ticket, and the roster is not a directory of them.
 */
export async function readMembers(
  db: Queryable,
  workspaceId: string,
  includeGuests: boolean,
): Promise<WorkspaceMember[]> {
  const { rows } = await db.query(
    `WITH roles AS (
       SELECT DISTINCT ON (m.user_id) m.user_id, m.role
       FROM proj_memberships m
       WHERE m.workspace_id = $1
       ORDER BY m.user_id, (m.scope_kind = 'workspace') DESC, m.project_id
     )
     SELECT r.user_id, u."name" AS display_name, r.role
     FROM roles r
     JOIN "user" u ON u."id" = r.user_id
     WHERE $2::boolean OR r.role <> 'guest'
     ORDER BY r.user_id`,
    [workspaceId, includeGuests],
  );
  return (rows as Array<{ user_id: string; display_name: string; role: WorkspaceMember['role'] }>).map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
  }));
}

/**
 * Occupancy of one workflow's states. Seeded from the definition so empty
 * states report 0 rather than vanishing, then filled from proj_tickets — a
 * ticket parked in a state the definition no longer names still shows up,
 * because stranding it silently is how a publish loses work.
 */
export async function readStateOccupancy(
  db: Queryable,
  workspaceId: string,
  def: PublishedWorkflowDef,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const state of def.states) {
    counts[state.id] = 0;
  }
  const { rows } = await db.query(
    `SELECT state_id, count(*)::int AS occupants
     FROM proj_tickets WHERE workspace_id = $1 AND workflow_id = $2
     GROUP BY state_id`,
    [workspaceId, def.id],
  );
  for (const row of rows as Array<{ state_id: string; occupants: number }>) {
    counts[row.state_id] = row.occupants;
  }
  return counts;
}

export function registerBuilderReadRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void {
  const requireSession = makeRequireSession(deps.auth);

  /** Member-or-404: an unknown workspace and one you are not in read alike. */
  async function memberOr404(request: FastifyRequest, workspaceId: string): Promise<EffectiveRole | null> {
    return requireMember(deps.pool, sessionUserId(request), workspaceId);
  }

  app.get('/v1/workspaces/:workspaceId/workflows', { preHandler: requireSession }, async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const eff = await memberOr404(request, workspaceId);
    if (eff === null) return reply.status(404).send({ error: 'not_found' });
    const defs = await latestWorkflowDefs(deps.pool, await workflowIdsOf(deps.pool, workspaceId));
    const body: WorkflowListResponse = { workspaceId, workflows: [...defs.values()] };
    return body;
  });

  app.get('/v1/workspaces/:workspaceId/workflows/:workflowId', { preHandler: requireSession }, async (request, reply) => {
    const { workspaceId, workflowId } = request.params as { workspaceId: string; workflowId: string };
    const raw = request.query as { version?: string };
    let version: number | undefined;
    if (raw.version !== undefined) {
      const parsed = versionSchema.safeParse(raw.version);
      if (!parsed.success) return reply.status(400).send({ error: 'invalid_version' });
      version = parsed.data;
    }
    const eff = await memberOr404(request, workspaceId);
    if (eff === null) return reply.status(404).send({ error: 'not_found' });
    const workflow = await getWorkflowDefFromProjection(deps.pool, workflowId, version);
    if (workflow === null) return reply.status(404).send({ error: 'not_found' });
    const body: WorkflowResponse = { workspaceId, workflow };
    return body;
  });

  app.get('/v1/workspaces/:workspaceId/ticket-types', { preHandler: requireSession }, async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const eff = await memberOr404(request, workspaceId);
    if (eff === null) return reply.status(404).send({ error: 'not_found' });
    const body: TicketTypeListResponse = {
      workspaceId,
      ticketTypes: await readTicketTypes(deps.pool, workspaceId),
    };
    return body;
  });

  app.get('/v1/workspaces/:workspaceId/members', { preHandler: requireSession }, async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const eff = await memberOr404(request, workspaceId);
    if (eff === null) return reply.status(404).send({ error: 'not_found' });
    const body: MemberListResponse = {
      workspaceId,
      members: await readMembers(deps.pool, workspaceId, isWorkspaceAdmin(eff)),
    };
    return body;
  });

  app.get(
    '/v1/workspaces/:workspaceId/workflows/:workflowId/state-occupancy',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId, workflowId } = request.params as { workspaceId: string; workflowId: string };
      const eff = await memberOr404(request, workspaceId);
      // Not an admin reads exactly like not a member: this endpoint's number
      // is the whole workspace's, so nobody learns it exists by being refused.
      if (eff === null || !isWorkspaceAdmin(eff)) return reply.status(404).send({ error: 'not_found' });
      const def = await getWorkflowDefFromProjection(deps.pool, workflowId);
      if (def === null) return reply.status(404).send({ error: 'not_found' });
      const body: StateOccupancyResponse = {
        workspaceId,
        workflowId,
        counts: await readStateOccupancy(deps.pool, workspaceId, def),
      };
      return body;
    },
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/builder-reads.test.ts`
Expected: PASS (11 tests), including both planted defects — the guest who never appears in a plain member's roster, and the occupancy count that keeps the invisible ticket while refusing the non-admin outright.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/read-models.ts apps/server/src/routes/builder-reads.ts apps/server/test/routes/builder-reads.test.ts apps/server/test/helpers/read-app.ts apps/server/src/app.ts
git commit -m "The builder can finally read what it authors: workflow roster and one definition by version, the ticket types bound to them, the roster of people a rule may name — with guests withheld from everyone but the admins who manage them — and the admin-only state occupancy that tells a publish mapping how much live work it is about to move"
```

---

### Task 10: `GET /v1/search` — cross-project, visibility-filtered

**Files:**
- Create: `apps/server/src/routes/search.ts`
- Modify: the app assembly — add `registerSearchRoutes(app, { pool, auth })`
- Modify: `apps/server/test/helpers/read-app.ts` (register the route)
- Test: `apps/server/test/routes/search.test.ts`

**Interfaces:**
- Consumes: `proj_search` (Task 6), `filterSpecSchema`/`compileFilterSpec`/`BLOCKED_STATES_CTE`/`SqlParams` (Task 2), `visibleTicketsWhere`/`requireMember` (Task 5), `assembleTicketCards`/`PROJ_TICKET_COLUMNS` (Task 7), `SearchResponse` (domain).
- Produces (cross-plan API):
  - `registerSearchRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void` serving `GET /v1/search?workspaceId=&q=&filter=` → `200 SearchResponse` | `400 {error:'invalid_query'|'invalid_filter'}` | `404 {error:'not_found'}` (non-member).
  - `q` (1–500 chars) is THE text term; a `filter` carrying its own `text` key is refused as `invalid_filter` — one text source, no ambiguity. Results are ranked (`ts_rank_cd`, ties by ticket_id), top 50, no pagination (pinned; Open questions). Snippets via `ts_headline` with `**…**` marks.

- [ ] **Step 1: Write the failing route test**

`apps/server/test/routes/search.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { newUlid, type SearchResponse } from '@gisik-nokma/domain';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { scenarioUsers, seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';
import { buildReadTestApp, signInAs } from '../helpers/read-app.js';

let pool: Pool;
let app: FastifyInstance;
let world: ReadScenario;
let tokens: Record<'owner' | 'member' | 'guest', string>;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
  app = await buildReadTestApp(pool);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  resetEntitySeqs();
  const owner = await signInAs(app, '+911111111101');
  const member = await signInAs(app, '+911111111102');
  const outsider = await signInAs(app, '+911111111103');
  const guest = await signInAs(app, '+911111111104');
  tokens = { owner: owner.token, member: member.token, guest: guest.token };
  world = await seedReadScenario(pool, {
    owner: owner.userId,
    member: member.userId,
    outsider: outsider.userId,
    guest: guest.userId,
  });
});

async function search(token: string, q: string, filter?: unknown) {
  const filterPart = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`;
  return app.inject({
    method: 'GET',
    url: `/v1/search?workspaceId=${world.workspaceId}&q=${encodeURIComponent(q)}${filterPart}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('GET /v1/search', () => {
  it('finds by title, description, and comment text — mention labels included', async () => {
    const byTitle = (await search(tokens.member, 'licence')).json() as SearchResponse;
    expect(byTitle.hits.map((h) => h.card.ticketId)).toEqual([world.sharedTaskId]);

    const byDescription = (await search(tokens.member, 'timing')).json() as SearchResponse;
    expect(byDescription.hits.map((h) => h.card.ticketId)).toEqual([world.taskInEpicId]);

    const byComment = (await search(tokens.member, 'Kiro')).json() as SearchResponse;
    expect(byComment.hits.map((h) => h.card.ticketId)).toEqual([world.taskInEpicId]);
  });

  it('marks the match in the snippet', async () => {
    const response = (await search(tokens.member, 'OTP')).json() as SearchResponse;
    expect(response.hits[0].snippet).toContain('**OTP**');
  });

  it('composes q with a FilterSpec', async () => {
    const filtered = (await search(tokens.member, 'the', { stateCategory: 'active', blocked: true })).json() as SearchResponse;
    expect(filtered.hits.map((h) => h.card.ticketId)).toEqual([world.sharedTaskId]);
  });

  it('PLANTED DEFECT: the hidden ticket is unfindable by its confidential comment — no hit, no snippet, no id in the body', async () => {
    const member = await search(tokens.member, 'zebra-confidential');
    expect((member.json() as SearchResponse).hits).toEqual([]);
    expect(member.body).not.toContain(world.hiddenTaskId);

    const owner = await search(tokens.owner, 'zebra-confidential');
    expect((owner.json() as SearchResponse).hits.map((h) => h.card.ticketId)).toEqual([world.hiddenTaskId]);
  });

  it('a guest searches only their shared slice', async () => {
    const guest = (await search(tokens.guest, 'the')).json() as SearchResponse;
    expect(guest.hits.map((h) => h.card.ticketId)).toEqual([world.guestTaskId]);
  });

  it('refuses a filter that smuggles its own text term', async () => {
    expect((await search(tokens.member, 'GST', { text: 'also this' })).statusCode).toBe(400);
  });

  it('refuses an empty q and 404s non-members', async () => {
    expect((await search(tokens.member, '')).statusCode).toBe(400);
    const stranger = await signInAs(app, '+911111111106');
    expect((await search(stranger.token, 'GST')).statusCode).toBe(404);
  });

  it('hostile q is a plain phrase to websearch_to_tsquery, never SQL', async () => {
    const response = await search(tokens.member, `'); DROP TABLE proj_search; --`);
    expect(response.statusCode).toBe(200);
    const intact = await pool.query(`SELECT to_regclass('proj_search') AS t`);
    expect((intact.rows[0] as { t: string | null }).t).toBe('proj_search');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/search.test.ts`
Expected: FAIL — `registerSearchRoutes` does not exist. Add its registration line to `buildReadTestApp` alongside the others.

- [ ] **Step 3: Implement the route**

`apps/server/src/routes/search.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { filterSpecSchema, type FilterSpec, type SearchResponse } from '@gisik-nokma/domain';
import type { Auth } from '../auth/auth.js';
import { makeRequireSession } from '../auth/routes.js';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { BLOCKED_STATES_CTE, compileFilterSpec } from '../read/compile-filter.js';
import { SqlParams } from '../read/sql-params.js';
import { requireMember } from '../read/membership.js';
import { visibleTicketsWhere } from '../read/visible-where.js';
import { assembleTicketCards, PROJ_TICKET_COLUMNS, type ProjTicketRow } from '../read/ticket-cards.js';

const SEARCH_LIMIT = 50;

/** Exported for tests; the route is a thin shell around it. */
export async function readSearch(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  query: string,
  spec: FilterSpec,
): Promise<SearchResponse> {
  const params = new SqlParams();
  const where: string[] = [`t.workspace_id = ${params.add(workspaceId)}`];
  where.push(visibleTicketsWhere(eff, viewerId, params));
  const tsquery = `websearch_to_tsquery('simple', ${params.add(query)})`;
  where.push(`s.tsv @@ ${tsquery}`);
  const compiled = compileFilterSpec(spec, params);
  where.push(...compiled.clauses);

  const cte = compiled.needsBlockedCte ? `WITH ${BLOCKED_STATES_CTE} ` : '';
  const { rows } = await db.query(
    `${cte}SELECT ${PROJ_TICKET_COLUMNS},
       ts_headline('simple', s.title || ' — ' || s.description || ' — ' || s.comments, ${tsquery},
                   'StartSel=**, StopSel=**, MaxWords=18, MinWords=6') AS snippet
     FROM proj_search s
     JOIN proj_tickets t ON t.ticket_id = s.ticket_id
     JOIN proj_visibility v ON v.ticket_id = t.ticket_id
     WHERE ${where.join(' AND ')}
     ORDER BY ts_rank_cd(s.tsv, ${tsquery}) DESC, t.ticket_id
     LIMIT ${params.add(SEARCH_LIMIT)}`,
    params.toArray(),
  );
  const ticketRows = rows as Array<ProjTicketRow & { snippet: string }>;
  const cards = await assembleTicketCards(db, viewerId, ticketRows);
  const cardById = new Map(cards.map((c) => [c.ticketId, c]));
  return {
    workspaceId,
    query,
    hits: ticketRows.map((row) => ({ card: cardById.get(row.ticket_id)!, snippet: row.snippet })),
  };
}

export function registerSearchRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void {
  const requireSession = makeRequireSession(deps.auth);
  app.get('/v1/search', { preHandler: requireSession }, async (request, reply) => {
    const raw = request.query as { workspaceId?: string; q?: string; filter?: string };
    if (raw.workspaceId === undefined || raw.workspaceId.length === 0) {
      return reply.status(400).send({ error: 'invalid_query' });
    }
    if (raw.q === undefined || raw.q.length === 0 || raw.q.length > 500) {
      return reply.status(400).send({ error: 'invalid_query' });
    }
    let spec: FilterSpec = {};
    if (raw.filter !== undefined) {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw.filter);
      } catch {
        return reply.status(400).send({ error: 'invalid_filter' });
      }
      const parsed = filterSpecSchema.safeParse(parsedJson);
      if (!parsed.success) return reply.status(400).send({ error: 'invalid_filter' });
      if (parsed.data.text !== undefined) {
        // q owns the text term; a second one hiding in the filter would make
        // the result set unexplainable.
        return reply.status(400).send({ error: 'invalid_filter' });
      }
      spec = parsed.data;
    }
    const viewerId = (request as FastifyRequest & { currentUserId: string }).currentUserId;
    const eff = await requireMember(deps.pool, viewerId, raw.workspaceId);
    if (eff === null) return reply.status(404).send({ error: 'not_found' });
    return readSearch(deps.pool, eff, viewerId, raw.workspaceId, raw.q, spec);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/search.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/search.ts apps/server/test/routes/search.test.ts apps/server/test/helpers/read-app.ts apps/server/src/app.ts
git commit -m "Search API: ranked cross-project full text over the proj_search projection, visibility-filtered at read time — the planted confidential comment is unfindable by the member and findable by the owner, snippet included"
```

---

### Task 11: `GET /v1/me/work` — My Work

**Files:**
- Create: `apps/server/src/routes/my-work.ts`
- Modify: the app assembly — add `registerMyWorkRoutes(app, { pool, auth })`
- Modify: `apps/server/test/helpers/read-app.ts` (register the route)
- Test: `apps/server/test/routes/my-work.test.ts`

**Interfaces:**
- Consumes: `visibleTicketsWhere`/`requireMember` (Task 5), `assembleTicketCards`/`PROJ_TICKET_COLUMNS` (Task 7), `SqlParams` (Task 2), `MyWorkResponse` (domain).
- Produces (cross-plan API):
  - `registerMyWorkRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void` serving `GET /v1/me/work?workspaceId=` → `200 MyWorkResponse` | `400 {error:'invalid_query'}` | `404 {error:'not_found'}`.
  - Scope is one workspace, all projects in it (pinned; cross-workspace aggregation is a client concern — one call per workspace). Groups are the three state categories; cards in ticket_id order.
  - **Extension point (documented for Plan 10):** the spec's My Work also lists "my claims in transit" and "my contested claims". Claims in transit are client-local (the outbox) and are merged into this view by the replica `DataSource`, never served here. Contested claims become `claim.contested` ledger events in Plan 10 (coordination amendment 16); Plan 10 extends `MyWorkResponse` with an additive `contested` key served from those events. The response shape here deliberately nests under `groups` so both arrive without reshaping.

- [ ] **Step 1: Write the failing route test**

`apps/server/test/routes/my-work.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { type MyWorkResponse } from '@gisik-nokma/domain';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { scenarioUsers, seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';
import { buildReadTestApp, signInAs } from '../helpers/read-app.js';

let pool: Pool;
let app: FastifyInstance;
let world: ReadScenario;
let memberToken: string;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
  app = await buildReadTestApp(pool);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  resetEntitySeqs();
  const owner = await signInAs(app, '+911111111101');
  const member = await signInAs(app, '+911111111102');
  const outsider = await signInAs(app, '+911111111103');
  const guest = await signInAs(app, '+911111111104');
  memberToken = member.token;
  world = await seedReadScenario(pool, {
    owner: owner.userId,
    member: member.userId,
    outsider: outsider.userId,
    guest: guest.userId,
  });
});

async function myWork(token: string, workspaceId: string) {
  return app.inject({
    method: 'GET',
    url: `/v1/me/work?workspaceId=${workspaceId}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('GET /v1/me/work', () => {
  it('answers assigned-to-me grouped by state category', async () => {
    const response = await myWork(memberToken, world.workspaceId);
    expect(response.statusCode).toBe(200);
    const work = response.json() as MyWorkResponse;
    expect(work.groups.active.map((c) => c.ticketId)).toEqual([world.taskInEpicId]);
    expect(work.groups.open).toEqual([]);
    expect(work.groups.terminal).toEqual([]);
  });

  it('moves a card between groups when its category changes', async () => {
    await applyCommitted(pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.member,
        entity: { kind: 'ticket', id: world.taskInEpicId },
        type: 'ticket.transitioned',
        payload: { toStateId: 'done' },
      }),
    ]);
    const work = (await myWork(memberToken, world.workspaceId)).json() as MyWorkResponse;
    expect(work.groups.active).toEqual([]);
    expect(work.groups.terminal.map((c) => c.ticketId)).toEqual([world.taskInEpicId]);
  });

  it('PLANTED DEFECT: assigned-but-invisible never appears — assignment is not visibility', async () => {
    // The owner assigns the member to the ticket the member cannot see
    // (explicit list stays owner-only: lists are exactly the authored list).
    await applyCommitted(pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket', id: world.hiddenTaskId },
        type: 'ticket.assigned',
        payload: { assigneeId: world.member },
      }),
    ]);
    const response = await myWork(memberToken, world.workspaceId);
    expect(response.body).not.toContain(world.hiddenTaskId);
  });

  it('refuses a missing workspaceId and 404s non-members', async () => {
    const noWorkspace = await app.inject({
      method: 'GET',
      url: '/v1/me/work',
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(noWorkspace.statusCode).toBe(400);
    const stranger = await signInAs(app, '+911111111107');
    expect((await myWork(stranger.token, world.workspaceId)).statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/my-work.test.ts`
Expected: FAIL — `registerMyWorkRoutes` does not exist. Add its registration to `buildReadTestApp`.

- [ ] **Step 3: Implement the route**

`apps/server/src/routes/my-work.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { MyWorkResponse, TicketCard } from '@gisik-nokma/domain';
import type { Auth } from '../auth/auth.js';
import { makeRequireSession } from '../auth/routes.js';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { SqlParams } from '../read/sql-params.js';
import { requireMember } from '../read/membership.js';
import { visibleTicketsWhere } from '../read/visible-where.js';
import { assembleTicketCards, PROJ_TICKET_COLUMNS, type ProjTicketRow } from '../read/ticket-cards.js';

/**
 * Assigned-to-me across every project in one workspace, grouped by state
 * category. Visibility applies even to assignment: being named assignee of
 * a ticket you cannot see does not surface it (the planted defect stands
 * guard).
 *
 * EXTENSION POINT (Plan 10): claims in transit are client-local outbox
 * state, merged in by the replica DataSource — never served here.
 * Contested claims become `claim.contested` ledger events (coordination
 * amendment 16); Plan 10 adds an additive `contested` key beside `groups`.
 */
export async function readMyWork(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
): Promise<MyWorkResponse> {
  const params = new SqlParams();
  const { rows } = await db.query(
    `SELECT ${PROJ_TICKET_COLUMNS}
     FROM proj_tickets t
     JOIN proj_visibility v ON v.ticket_id = t.ticket_id
     WHERE t.workspace_id = ${params.add(workspaceId)}
       AND t.assignee_id = ${params.add(viewerId)}
       AND ${visibleTicketsWhere(eff, viewerId, params)}
     ORDER BY t.ticket_id`,
    params.toArray(),
  );
  const cards = await assembleTicketCards(db, viewerId, rows as ProjTicketRow[]);
  const groups: MyWorkResponse['groups'] = { open: [], active: [], terminal: [] };
  for (const card of cards) groups[card.stateCategory].push(card as TicketCard);
  return { workspaceId, groups };
}

export function registerMyWorkRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void {
  const requireSession = makeRequireSession(deps.auth);
  app.get('/v1/me/work', { preHandler: requireSession }, async (request, reply) => {
    const raw = request.query as { workspaceId?: string };
    if (raw.workspaceId === undefined || raw.workspaceId.length === 0) {
      return reply.status(400).send({ error: 'invalid_query' });
    }
    const viewerId = (request as FastifyRequest & { currentUserId: string }).currentUserId;
    const eff = await requireMember(deps.pool, viewerId, raw.workspaceId);
    if (eff === null) return reply.status(404).send({ error: 'not_found' });
    return readMyWork(deps.pool, eff, viewerId, raw.workspaceId);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/my-work.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/my-work.ts apps/server/test/routes/my-work.test.ts apps/server/test/helpers/read-app.ts apps/server/src/app.ts
git commit -m "My Work: assigned-to-me grouped by state category with Plan 10's contested-claims extension point named in the shape — the planted assigned-but-invisible ticket proves assignment grants no visibility"
```

---
### Task 12: `GET /v1/workspaces/:workspaceId/attention` — computed, never stored

**Files:**
- Create: `apps/server/src/routes/attention.ts`
- Modify: the app assembly — add `registerAttentionRoutes(app, { pool, auth })` (production `now` defaults to the real clock)
- Modify: `apps/server/test/helpers/read-app.ts` (register with `now: () => SCENARIO_NOW`)
- Test: `apps/server/test/routes/attention.test.ts`

**Interfaces:**
- Consumes: `getWorkspaceSettings` (Task 4), `visibleTicketsWhere`/`requireMember` (Task 5), `assembleTicketCards`/`PROJ_TICKET_COLUMNS` (Task 7), `latestWorkflowDefs`/`blockedStateKeys` (Task 7), `AttentionResponse`/`AttentionItem` (domain), **`istDayOf`/`istDayBounds` (`@gisik-nokma/domain`, Plan 1 Task 4a)**, apply helpers (Task 4).
- Produces (cross-plan API):
  - `registerAttentionRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth; now?: () => Date }): void` serving `GET /v1/workspaces/:workspaceId/attention` → `200 AttentionResponse` | `404 {error:'not_found'}`.
  - Computed at read time from projections + the injected clock; NOTHING is stored — `generatedAt` names the computation moment. Three buckets, in response order:
    1. `blocked` — visible tickets sitting in a blocked-flagged state (amendment 9), whatever the category. No clock involved.
    2. `stale` — visible tickets in an `active` category state whose state-entry `serverTime` (from `stateProvenanceFor`, already on the card) falls on or before the IST day `staleDays` back from today. The item carries `daysInFlight`, the IST day count.
    3. `due-soon` — visible non-terminal tickets whose due-date claim falls on or before the IST day `dueSoonDays` from today (overdue included); the item carries the full `DueDateClaim` — the claim's provenance, per assignment.
  - **Both windows are INDIAN days** (owner decision 2026-08-20, "time is Asia/Kolkata"). Boundaries come from `istDayBounds(day)` and are compared half-open — `>= startUtc`, `< endUtc` — and day counts subtract `istDayOf` results. Nothing here divides a millisecond difference by 86 400 000 to get a number of days, and nothing slices ten characters off an ISO string to get a date: both answer the UTC question, and the product does not ask it. The 7-day / 7-day defaults are IST days.
  - Every item carries a plain-language `reason`. Contested claims join this strip in Plan 10 (additive item kind), documented in the module header.

- [ ] **Step 1: Write the failing route test**

`apps/server/test/routes/attention.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { istDayOf, type AttentionResponse } from '@gisik-nokma/domain';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { SCENARIO_NOW, scenarioUsers, seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';
import { buildReadTestApp, signInAs } from '../helpers/read-app.js';
// The IST-boundary cases inject their own clock, which the HTTP route reads
// from `deps.now` — fixed at SCENARIO_NOW for the app under test. They call
// the computation directly instead, so one suite can read the same world at
// two instants a millisecond apart.
import { readAttention } from '../../src/routes/attention.js';
import { requireMember } from '../../src/read/membership.js';

let pool: Pool;
let app: FastifyInstance;
let world: ReadScenario;
let memberToken: string;
let ownerToken: string;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
  app = await buildReadTestApp(pool); // read-app registers attention with now: () => SCENARIO_NOW
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  resetEntitySeqs();
  const owner = await signInAs(app, '+911111111101');
  const member = await signInAs(app, '+911111111102');
  const outsider = await signInAs(app, '+911111111103');
  const guest = await signInAs(app, '+911111111104');
  ownerToken = owner.token;
  memberToken = member.token;
  world = await seedReadScenario(pool, {
    owner: owner.userId,
    member: member.userId,
    outsider: outsider.userId,
    guest: guest.userId,
  });
});

async function attention(token: string) {
  return app.inject({
    method: 'GET',
    url: `/v1/workspaces/${world.workspaceId}/attention`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function itemsOf(response: AttentionResponse, kind: string): string[] {
  return response.items.filter((i) => i.kind === kind).map((i) => i.card.ticketId);
}

describe('GET /v1/workspaces/:workspaceId/attention', () => {
  it('computes blocked, stale, and due-soon at read time under the default thresholds', async () => {
    const response = (await attention(memberToken)).json() as AttentionResponse;
    expect(response.generatedAt).toBe(SCENARIO_NOW.toISOString());
    expect(response.settings).toEqual({ staleDays: 7, dueSoonDays: 7 });

    // blocked: sharedTask sits in the blocked-flagged 'waiting' state
    expect(itemsOf(response, 'blocked')).toEqual([world.sharedTaskId]);
    const blocked = response.items.find((i) => i.kind === 'blocked');
    expect(blocked).toMatchObject({ stateName: 'Waiting on counterparty' });
    expect(blocked?.reason).toBe('In "Waiting on counterparty" — a blocked state.');

    // stale: taskInEpic entered 'doing' 19 days ago (sharedTask is active
    // too but entered 'waiting' only yesterday — not stale)
    expect(itemsOf(response, 'stale')).toEqual([world.taskInEpicId]);
    const stale = response.items.find((i) => i.kind === 'stale');
    expect(stale).toMatchObject({
      enteredStateAt: '2026-08-01T09:00:05.000Z',
      // 2026-08-01 IST → 2026-08-20 IST. A count of Indian days, which is
      // what "19 days in flight" means to the person reading the strip.
      daysInFlight: 19,
      thresholdDays: 7,
    });
    expect(stale?.reason).toBe('In an active state since 2026-08-01 — past the 7-day staleness threshold.');

    // due-soon: taskInEpic due 2026-08-25, within 7 days of 2026-08-20;
    // the item carries the CLAIM — who claimed the date, both clocks
    expect(itemsOf(response, 'due-soon')).toEqual([world.taskInEpicId]);
    const due = response.items.find((i) => i.kind === 'due-soon');
    expect(due).toMatchObject({
      windowDays: 7,
      due: {
        date: '2026-08-25',
        actorId: world.member,
        clientTime: '2026-08-19T18:30:00.000Z',
        serverTime: '2026-08-20T09:00:01.000Z',
      },
    });
    expect(due?.reason).toBe('Needed by 2026-08-25 — due within 7 days.');
  });

  it('PLANTED DEFECT: the thresholds come from the settings CLAIM, not from constants', async () => {
    await applyCommitted(pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'workspace', id: world.workspaceId },
        type: 'workspace.settings_set',
        payload: { staleDays: 30, dueSoonDays: 2 },
      }),
    ]);
    const response = (await attention(memberToken)).json() as AttentionResponse;
    expect(response.settings).toEqual({ staleDays: 30, dueSoonDays: 2 });
    expect(itemsOf(response, 'stale')).toEqual([]); // 19 days < 30
    expect(itemsOf(response, 'due-soon')).toEqual([]); // 2026-08-25 > 2026-08-22 horizon
    expect(itemsOf(response, 'blocked')).toEqual([world.sharedTaskId]); // blocked ignores thresholds
  });

  it('includes overdue dates in due-soon — a missed date is not less urgent', async () => {
    await applyCommitted(pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.member,
        entity: { kind: 'ticket', id: world.taskInEpicId },
        type: 'ticket.field_set',
        payload: { fieldId: 'dueDate', value: { date: '2026-08-10' } },
      }),
    ]);
    const response = (await attention(memberToken)).json() as AttentionResponse;
    expect(itemsOf(response, 'due-soon')).toEqual([world.taskInEpicId]);
  });

  it('excludes terminal tickets from due-soon — done work needs no urgency', async () => {
    await applyCommitted(pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.member,
        entity: { kind: 'ticket', id: world.taskInEpicId },
        type: 'ticket.transitioned',
        payload: { toStateId: 'done' },
      }),
    ]);
    const response = (await attention(memberToken)).json() as AttentionResponse;
    expect(itemsOf(response, 'due-soon')).toEqual([]);
    expect(itemsOf(response, 'stale')).toEqual([]); // terminal is not active either
  });

  it('PLANTED DEFECT: the hidden ticket has a due date tomorrow and still never surfaces for the member', async () => {
    const member = await attention(memberToken);
    expect(member.body).not.toContain(world.hiddenTaskId);
    // …while the owner is warned about it:
    const owner = (await attention(ownerToken)).json() as AttentionResponse;
    expect(itemsOf(owner, 'due-soon')).toContain(world.hiddenTaskId);
  });

  it('404s non-members', async () => {
    const stranger = await signInAs(app, '+911111111108');
    expect((await attention(stranger.token)).statusCode).toBe(404);
  });

  it('PLANTED DEFECT: an event at 18:31Z counts as the NEXT Indian day — the window turns over at IST midnight, not UTC midnight', async () => {
    // 2026-08-13T18:30:00.000Z IS 2026-08-14 00:00 IST. One minute past it is
    // already tomorrow in India while the UTC page still reads 2026-08-13 —
    // and SCENARIO_NOW (2026-08-20T12:00Z) is IST day 2026-08-20.
    expect(istDayOf('2026-08-12T18:35:00.000Z')).toBe('2026-08-13'); // 7 IST days back
    expect(istDayOf('2026-08-13T18:31:00.000Z')).toBe('2026-08-14'); // 6 IST days back

    await applyCommitted(pool, [
      // taskInEpic re-enters an active state at 18:35Z on the 12th — 00:05 IST
      // on the 13th, so 7 IST days back: STALE at the 7-day threshold. Naive
      // UTC math labels this '2026-08-12' and calls it 8 days.
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.member,
        entity: { kind: 'ticket', id: world.taskInEpicId },
        type: 'ticket.transitioned',
        payload: { toStateId: 'doing' },
        clientTime: '2026-08-12T18:35:00.000Z',
        serverTime: '2026-08-12T18:35:00.000Z',
      }),
      // sharedTask enters the same active state at 18:31Z on the 13th — 6 IST
      // days back, INSIDE the window, so NOT stale. Naive UTC math reads the
      // date as '2026-08-13', counts 7, and wrongly alarms.
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.member,
        entity: { kind: 'ticket', id: world.sharedTaskId },
        type: 'ticket.transitioned',
        payload: { toStateId: 'doing' },
        clientTime: '2026-08-13T18:31:00.000Z',
        serverTime: '2026-08-13T18:31:00.000Z',
      }),
    ]);

    const response = (await attention(memberToken)).json() as AttentionResponse;
    expect(itemsOf(response, 'stale')).toEqual([world.taskInEpicId]);
    expect(itemsOf(response, 'stale')).not.toContain(world.sharedTaskId);

    const stale = response.items.find((i) => i.kind === 'stale');
    // The label is the IST day too, not the UTC slice of the same instant.
    expect(stale).toMatchObject({ daysInFlight: 7, enteredStateAt: '2026-08-12T18:35:00.000Z' });
    expect(stale?.reason).toBe('In an active state since 2026-08-13 — past the 7-day staleness threshold.');
  });

  it('PLANTED DEFECT: reading the strip at 18:31Z reads it on tomorrow’s Indian date — the due window moves with it', async () => {
    await applyCommitted(pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'workspace', id: world.workspaceId },
        type: 'workspace.settings_set',
        payload: { dueSoonDays: 2 },
      }),
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.member,
        entity: { kind: 'ticket', id: world.taskInEpicId },
        type: 'ticket.field_set',
        payload: { fieldId: 'dueDate', value: { date: '2026-08-23' } },
      }),
    ]);

    const eff = await requireMember(pool, world.member, world.workspaceId);
    expect(eff).not.toBeNull();
    const read = (at: string) =>
      readAttention(pool, eff!, world.member, world.workspaceId, new Date(at));

    // 18:29:59.999Z — still 2026-08-20 in India, horizon 2026-08-22, so a
    // claim due 2026-08-23 is outside the window.
    const justBefore = await read('2026-08-20T18:29:59.999Z');
    expect(itemsOf(justBefore, 'due-soon')).toEqual([]);

    // One millisecond later it is 2026-08-21 in India, horizon 2026-08-23,
    // and the same claim is inside. Both instants sit on the SAME UTC day, so
    // UTC-based math cannot tell these two reads apart at all.
    const justAfter = await read('2026-08-20T18:30:00.000Z');
    expect(itemsOf(justAfter, 'due-soon')).toEqual([world.taskInEpicId]);
    expect(await read('2026-08-20T18:31:00.000Z').then((r) => itemsOf(r, 'due-soon'))).toEqual([
      world.taskInEpicId,
    ]);
    expect(justBefore.generatedAt.slice(0, 10)).toBe(justAfter.generatedAt.slice(0, 10));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/attention.test.ts`
Expected: FAIL — `registerAttentionRoutes` does not exist. Add to `buildReadTestApp`:

```ts
import { SCENARIO_NOW } from './read-scenario.js';
import { registerAttentionRoutes } from '../../src/routes/attention.js';
// inside buildReadTestApp:
registerAttentionRoutes(app, { pool, auth: authInstance, now: () => SCENARIO_NOW });
```

- [ ] **Step 3: Implement the route**

`apps/server/src/routes/attention.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { AttentionItem, AttentionResponse } from '@gisik-nokma/domain';
import { istDayBounds, istDayOf } from '@gisik-nokma/domain';
import type { Auth } from '../auth/auth.js';
import { makeRequireSession } from '../auth/routes.js';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { getWorkspaceSettings } from '../projections/workspace-settings.js';
import { SqlParams } from '../read/sql-params.js';
import { requireMember } from '../read/membership.js';
import { visibleTicketsWhere } from '../read/visible-where.js';
import { blockedStateKeys, latestWorkflowDefs } from '../read/workflow-defs.js';
import { assembleTicketCards, PROJ_TICKET_COLUMNS, type ProjTicketRow } from '../read/ticket-cards.js';

const DAY_MS = 86_400_000;

/**
 * `delta` IST days after `day` (negative walks backwards).
 *
 * `istDayBounds(day).startUtc` IS IST midnight of `day`, and India has no
 * daylight saving — every IST day is exactly 24h, no exceptions (Plan 1's
 * `ist-day.test.ts` asserts that over a full year). So stepping by whole
 * DAY_MS from one IST midnight lands exactly on another IST midnight, and
 * `istDayOf` names it. This is calendar arithmetic on IST days, not elapsed
 * time between two arbitrary instants.
 */
function addIstDays(day: string, delta: number): string {
  return istDayOf(new Date(Date.parse(istDayBounds(day).startUtc) + delta * DAY_MS).toISOString());
}

/**
 * How many IST days from `fromDay` to `toDay` — a day COUNT, not a duration.
 *
 * Both operands are snapped to IST midnight before subtracting, so the result
 * is an exact integer number of calendar days. This is what "subtract two
 * `istDayOf` results" means computationally; it is emphatically NOT
 * `(b - a) / 86_400_000` over two raw instants, which silently answers a
 * different question — "how many 24-hour spans" — and gets a day boundary
 * wrong every time a claim lands between 18:30Z and midnight UTC.
 */
function istDaysBetween(fromDay: string, toDay: string): number {
  return Math.round(
    (Date.parse(istDayBounds(toDay).startUtc) - Date.parse(istDayBounds(fromDay).startUtc)) / DAY_MS,
  );
}

/**
 * The attention strip: computed at read time, NEVER stored — attention is
 * derived from claims plus the clock, and materialising it would freeze a
 * judgment that changes as time passes. generatedAt names the moment.
 *
 * EVERY window and every day count here is an INDIAN day (owner decision
 * 2026-08-20, "time is Asia/Kolkata"). "Stale for 7 days" and "due within 7
 * days" are questions about where a day starts, and it starts at IST
 * midnight — 18:30Z — never at the server's locale midnight, never at the
 * viewer's device midnight. Concretely: an event at 18:31Z is already
 * TOMORROW in India, and any comparison that slices `.toISOString()` at ten
 * characters gets that wrong by a full day. Windows compare half-open against
 * `istDayBounds` (`>= startUtc`, `< endUtc`); counts subtract IST days.
 *
 * Plan 10 adds a fourth, additive item kind for contested claims once
 * `claim.contested` events exist (coordination amendment 16).
 */
export async function readAttention(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  now: Date,
): Promise<AttentionResponse> {
  const settings = await getWorkspaceSettings(db, workspaceId);
  const params = new SqlParams();
  const { rows } = await db.query(
    `SELECT ${PROJ_TICKET_COLUMNS}
     FROM proj_tickets t
     JOIN proj_visibility v ON v.ticket_id = t.ticket_id
     WHERE t.workspace_id = ${params.add(workspaceId)} AND ${visibleTicketsWhere(eff, viewerId, params)}
     ORDER BY t.ticket_id`,
    params.toArray(),
  );
  const ticketRows = rows as ProjTicketRow[];
  const cards = await assembleTicketCards(db, viewerId, ticketRows);
  const defs = await latestWorkflowDefs(db, ticketRows.map((r) => r.workflow_id));
  const blocked = blockedStateKeys(defs);

  const items: AttentionItem[] = [];

  for (const card of cards) {
    if (!blocked.has(`${card.workflowId}:${card.stateId}`)) continue;
    const stateName =
      defs.get(card.workflowId)?.states.find((s) => s.id === card.stateId)?.name ?? card.stateId;
    items.push({ kind: 'blocked', card, stateName, reason: `In "${stateName}" — a blocked state.` });
  }

  // Today, in India. Everything below is measured from this day, not from a
  // UTC calendar page that turns over five and a half hours late.
  const today = istDayOf(now.toISOString());

  // The staleness window is the last `staleDays` IST days. A ticket is stale
  // when it entered its state on or before the cutoff day — i.e. strictly
  // before that day's END, the half-open upper bound `istDayBounds` gives us.
  // Equivalent to `istDaysBetween(entryDay, today) >= staleDays`, and stated
  // as an instant comparison so no per-card day string has to be parsed.
  const staleCutoffUtc = Date.parse(istDayBounds(addIstDays(today, -settings.staleDays)).endUtc);
  for (const card of cards) {
    if (card.stateCategory !== 'active') continue;
    const enteredStateAt = card.stateProvenance.serverTime;
    if (Date.parse(enteredStateAt) >= staleCutoffUtc) continue;
    const enteredOnIstDay = istDayOf(enteredStateAt);
    items.push({
      kind: 'stale',
      card,
      enteredStateAt,
      // Days in flight: two IST days subtracted, never a millisecond quotient.
      daysInFlight: istDaysBetween(enteredOnIstDay, today),
      thresholdDays: settings.staleDays,
      reason: `In an active state since ${enteredOnIstDay} — past the ${settings.staleDays}-day staleness threshold.`,
    });
  }

  // The due window runs to the end of the IST day `dueSoonDays` from today.
  // `dueDate.date` is already a day claim in the same calendar, so the
  // comparison is day-string to day-string and needs no clock at all.
  const horizon = addIstDays(today, settings.dueSoonDays);
  for (const card of cards) {
    if (card.stateCategory === 'terminal' || card.dueDate === null) continue;
    if (card.dueDate.date > horizon) continue;
    items.push({
      kind: 'due-soon',
      card,
      due: card.dueDate,
      windowDays: settings.dueSoonDays,
      reason: `Needed by ${card.dueDate.date} — due within ${settings.dueSoonDays} days.`,
    });
  }

  return {
    workspaceId,
    generatedAt: now.toISOString(),
    settings: { staleDays: settings.staleDays, dueSoonDays: settings.dueSoonDays },
    items,
  };
}

export function registerAttentionRoutes(
  app: FastifyInstance,
  deps: { pool: Pool; auth: Auth; now?: () => Date },
): void {
  const requireSession = makeRequireSession(deps.auth);
  const now = deps.now ?? (() => new Date());
  app.get(
    '/v1/workspaces/:workspaceId/attention',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const viewerId = (request as FastifyRequest & { currentUserId: string }).currentUserId;
      const eff = await requireMember(deps.pool, viewerId, workspaceId);
      if (eff === null) return reply.status(404).send({ error: 'not_found' });
      return readAttention(deps.pool, eff, viewerId, workspaceId, now());
    },
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/attention.test.ts`
Expected: PASS (8 tests) — including the two IST-boundary defects.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/attention.ts apps/server/test/routes/attention.test.ts apps/server/test/helpers/read-app.ts apps/server/src/app.ts
git commit -m "Attention strip: blocked flags, staleness and due windows computed at read time from claims plus the clock, never stored — the planted settings claim flips the thresholds, proving they are read from the ledger, not from constants

Every window and every day count is an INDIAN day (owner decision
2026-08-20): boundaries from istDayBounds compared half-open, counts by
subtracting istDayOf results. The planted 18:31Z cases prove it both
ways — an event a minute past IST midnight belongs to the next Indian
day, and a read a millisecond past it happens on the next Indian date —
neither of which UTC math can see, because both instants sit on the same
UTC day."
```

---

### Task 13: `/v1/me/preferences` — server-owned view preferences

**Files:**
- Create: `packages/domain/src/preferences.ts`
- Modify: `packages/domain/src/index.ts` (add export)
- Create: `apps/server/migrations/<timestamp>_user-preferences.js` (generate as in Task 4)
- Create: `apps/server/src/preferences/store.ts`
- Create: `apps/server/src/routes/preferences.ts`
- Modify: the app assembly — add `registerPreferencesRoutes(app, { pool, auth })`
- Modify: `apps/server/test/helpers/read-app.ts` (register the route)
- Test: `apps/server/test/routes/preferences.test.ts`

**Interfaces:**
- Consumes: `filterSpecSchema`/`groupingSchema` (Task 2), `requireMember` (Task 5), `Queryable` (Plan 4).
- Produces (cross-plan API — coordination amendment 14; Plans 6 and 10 read/write these through the `DataSource`):
  - `preferencesDocSchema` (zod, `.strict()`), `type PreferencesDoc = { savedFilters: Array<{id: string; name: string; filterSpec: FilterSpec}>; listColumns: Record<string, string[]>; grouping: Record<string, Grouping> }` (`listColumns`/`grouping` keyed by project id), `EMPTY_PREFERENCES`.
  - Table `user_preferences` (`user_id`, `workspace_id`, `doc jsonb`, `updated_at`; PK `(user_id, workspace_id)`) — NOT a `proj_` table: nothing derives it from the ledger, nothing rebuilds it.
  - `getPreferences(db: Queryable, userId: string, workspaceId: string): Promise<PreferencesDoc>` (empty doc when no row) and `putPreferences(db, userId, workspaceId, doc): Promise<void>` (full-replace upsert — pinned).
  - `registerPreferencesRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void` serving `GET /v1/me/preferences?workspaceId=` and `PUT /v1/me/preferences?workspaceId=` (body = `PreferencesDoc`) → `200` | `400 {error:'invalid_query'|'invalid_preferences'}` | `404 {error:'not_found'}`.
  - **Why rows and not ledger events (coordination amendment 14):** view preferences arrange truth — they change how the record is displayed, never what it says — so recording them as attributed claims would dilute the ledger's meaning and bloat replay with non-facts; server-owned per-user rows are the honest home.

- [ ] **Step 1: Write the failing domain schema test**

Add to a new describe block in `packages/domain/test/filter-spec.test.ts` (the schemas travel together):

```ts
import { EMPTY_PREFERENCES, preferencesDocSchema } from '../src/preferences.js';

describe('preferencesDocSchema', () => {
  it('accepts a full document and the empty default', () => {
    const doc = {
      savedFilters: [{ id: 'sf1', name: 'My active', filterSpec: { stateCategory: 'active' } }],
      listColumns: { prj_01: ['status', 'assignee', 'dueDate'] },
      grouping: { prj_01: 'epic' },
    };
    expect(preferencesDocSchema.parse(doc)).toEqual(doc);
    expect(preferencesDocSchema.parse(EMPTY_PREFERENCES)).toEqual(EMPTY_PREFERENCES);
  });

  it('refuses malformed filter specs inside saved filters', () => {
    expect(() =>
      preferencesDocSchema.parse({
        savedFilters: [{ id: 'sf1', name: 'Bad', filterSpec: { velocity: 9 } }],
        listColumns: {},
        grouping: {},
      }),
    ).toThrow();
  });

  it('refuses unknown groupings and unknown top-level keys', () => {
    expect(() =>
      preferencesDocSchema.parse({ savedFilters: [], listColumns: {}, grouping: { prj_01: 'priority' } }),
    ).toThrow();
    expect(() =>
      preferencesDocSchema.parse({ savedFilters: [], listColumns: {}, grouping: {}, theme: 'dark' }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement the domain module**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/filter-spec.test.ts`
Expected: FAIL — `../src/preferences.js` missing.

`packages/domain/src/preferences.ts`:

```ts
import { z } from 'zod';
import { filterSpecSchema, groupingSchema } from './filter-spec.js';

export const savedFilterSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(120),
    filterSpec: filterSpecSchema,
  })
  .strict();

/**
 * Per-user, per-workspace view preferences (coordination amendment 14):
 * server-owned rows, NOT ledger events — they arrange truth, they are not
 * history. listColumns and grouping are keyed by project id.
 */
export const preferencesDocSchema = z
  .object({
    savedFilters: z.array(savedFilterSchema).max(50),
    listColumns: z.record(z.string(), z.array(z.string().min(1).max(64)).max(30)),
    grouping: z.record(z.string(), groupingSchema),
  })
  .strict();
export type PreferencesDoc = z.infer<typeof preferencesDocSchema>;

export const EMPTY_PREFERENCES: PreferencesDoc = { savedFilters: [], listColumns: {}, grouping: {} };
```

In `packages/domain/src/index.ts`, add:

```ts
export * from './preferences.js';
```

Run the domain test again. Expected: PASS.

- [ ] **Step 3: Write the failing route test**

`apps/server/test/routes/preferences.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { EMPTY_PREFERENCES, type PreferencesDoc } from '@gisik-nokma/domain';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { scenarioUsers, seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';
import { buildReadTestApp, signInAs } from '../helpers/read-app.js';

let pool: Pool;
let app: FastifyInstance;
let world: ReadScenario;
let memberToken: string;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
  app = await buildReadTestApp(pool);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  resetEntitySeqs();
  const owner = await signInAs(app, '+911111111101');
  const member = await signInAs(app, '+911111111102');
  const outsider = await signInAs(app, '+911111111103');
  const guest = await signInAs(app, '+911111111104');
  memberToken = member.token;
  world = await seedReadScenario(pool, {
    owner: owner.userId,
    member: member.userId,
    outsider: outsider.userId,
    guest: guest.userId,
  });
});

function url(workspaceId: string): string {
  return `/v1/me/preferences?workspaceId=${workspaceId}`;
}

describe('/v1/me/preferences', () => {
  it('answers the empty document before anything was saved', async () => {
    const response = await app.inject({
      method: 'GET',
      url: url(world.workspaceId),
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(EMPTY_PREFERENCES);
  });

  it('round-trips a full document, replacing wholesale on PUT', async () => {
    const doc: PreferencesDoc = {
      savedFilters: [{ id: 'sf1', name: 'My blocked', filterSpec: { blocked: true } }],
      listColumns: { [world.projectId]: ['status', 'assignee', 'dueDate'] },
      grouping: { [world.projectId]: 'epic' },
    };
    const put = await app.inject({
      method: 'PUT',
      url: url(world.workspaceId),
      headers: { authorization: `Bearer ${memberToken}`, 'content-type': 'application/json' },
      payload: doc,
    });
    expect(put.statusCode).toBe(200);
    const got = await app.inject({
      method: 'GET',
      url: url(world.workspaceId),
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(got.json()).toEqual(doc);

    const replacement: PreferencesDoc = { savedFilters: [], listColumns: {}, grouping: { [world.projectId]: 'flat' } };
    await app.inject({
      method: 'PUT',
      url: url(world.workspaceId),
      headers: { authorization: `Bearer ${memberToken}`, 'content-type': 'application/json' },
      payload: replacement,
    });
    const afterReplace = await app.inject({
      method: 'GET',
      url: url(world.workspaceId),
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(afterReplace.json()).toEqual(replacement); // the saved filter is gone: full replace
  });

  it('PLANTED DEFECT: a malformed document is refused, not partially stored', async () => {
    const bad = { savedFilters: [{ id: 'sf1', name: 'Bad', filterSpec: { velocity: 9 } }], listColumns: {}, grouping: {} };
    const put = await app.inject({
      method: 'PUT',
      url: url(world.workspaceId),
      headers: { authorization: `Bearer ${memberToken}`, 'content-type': 'application/json' },
      payload: bad,
    });
    expect(put.statusCode).toBe(400);
    expect(put.json()).toEqual({ error: 'invalid_preferences' });
    const got = await app.inject({
      method: 'GET',
      url: url(world.workspaceId),
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(got.json()).toEqual(EMPTY_PREFERENCES); // nothing landed
  });

  it('preferences write no ledger events — they are not history', async () => {
    const before = await pool.query('SELECT count(*)::int AS n FROM events');
    await app.inject({
      method: 'PUT',
      url: url(world.workspaceId),
      headers: { authorization: `Bearer ${memberToken}`, 'content-type': 'application/json' },
      payload: EMPTY_PREFERENCES,
    });
    const after = await pool.query('SELECT count(*)::int AS n FROM events');
    expect((after.rows[0] as { n: number }).n).toBe((before.rows[0] as { n: number }).n);
  });

  it('404s non-members and refuses a missing workspaceId', async () => {
    const stranger = await signInAs(app, '+911111111109');
    const forbidden = await app.inject({
      method: 'GET',
      url: url(world.workspaceId),
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(forbidden.statusCode).toBe(404);
    const noWorkspace = await app.inject({
      method: 'GET',
      url: '/v1/me/preferences',
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(noWorkspace.statusCode).toBe(400);
  });
});
```

- [ ] **Step 4: Run it to verify it fails, then write migration, store, and route**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/preferences.test.ts`
Expected: FAIL — modules missing. Add `registerPreferencesRoutes(app, { pool, auth: authInstance });` to `buildReadTestApp`.

Migration:

```js
// apps/server/migrations/<timestamp>_user-preferences.js
exports.up = (pgm) => {
  pgm.createTable('user_preferences', {
    user_id: { type: 'text', notNull: true },
    workspace_id: { type: 'text', notNull: true },
    doc: { type: 'jsonb', notNull: true },
    updated_at: { type: 'timestamptz', notNull: true },
  });
  pgm.addConstraint('user_preferences', 'user_preferences_pk', {
    primaryKey: ['user_id', 'workspace_id'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('user_preferences');
};
```

`apps/server/src/preferences/store.ts`:

```ts
import { EMPTY_PREFERENCES, preferencesDocSchema, type PreferencesDoc } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

export async function getPreferences(
  db: Queryable,
  userId: string,
  workspaceId: string,
): Promise<PreferencesDoc> {
  const { rows } = await db.query(
    'SELECT doc FROM user_preferences WHERE user_id = $1 AND workspace_id = $2',
    [userId, workspaceId],
  );
  if (rows.length === 0) return EMPTY_PREFERENCES;
  return preferencesDocSchema.parse((rows[0] as { doc: unknown }).doc);
}

/** Full-replace upsert (pinned): the document is small and owned whole by its user. */
export async function putPreferences(
  db: Queryable,
  userId: string,
  workspaceId: string,
  doc: PreferencesDoc,
): Promise<void> {
  await db.query(
    `INSERT INTO user_preferences (user_id, workspace_id, doc, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, workspace_id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
    [userId, workspaceId, JSON.stringify(doc)],
  );
}
```

`apps/server/src/routes/preferences.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { preferencesDocSchema } from '@gisik-nokma/domain';
import type { Auth } from '../auth/auth.js';
import { makeRequireSession } from '../auth/routes.js';
import { requireMember } from '../read/membership.js';
import { getPreferences, putPreferences } from '../preferences/store.js';

/**
 * Per-user view preferences (coordination amendment 14). Server-owned rows,
 * NOT ledger events: preferences arrange truth — they change how the record
 * is displayed, never what it says — so recording them as attributed claims
 * would dilute the ledger's meaning.
 */
export function registerPreferencesRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void {
  const requireSession = makeRequireSession(deps.auth);

  app.get('/v1/me/preferences', { preHandler: requireSession }, async (request, reply) => {
    const raw = request.query as { workspaceId?: string };
    if (raw.workspaceId === undefined || raw.workspaceId.length === 0) {
      return reply.status(400).send({ error: 'invalid_query' });
    }
    const userId = (request as FastifyRequest & { currentUserId: string }).currentUserId;
    const eff = await requireMember(deps.pool, userId, raw.workspaceId);
    if (eff === null) return reply.status(404).send({ error: 'not_found' });
    return getPreferences(deps.pool, userId, raw.workspaceId);
  });

  app.put('/v1/me/preferences', { preHandler: requireSession }, async (request, reply) => {
    const raw = request.query as { workspaceId?: string };
    if (raw.workspaceId === undefined || raw.workspaceId.length === 0) {
      return reply.status(400).send({ error: 'invalid_query' });
    }
    const parsed = preferencesDocSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_preferences' });
    const userId = (request as FastifyRequest & { currentUserId: string }).currentUserId;
    const eff = await requireMember(deps.pool, userId, raw.workspaceId);
    if (eff === null) return reply.status(404).send({ error: 'not_found' });
    await putPreferences(deps.pool, userId, raw.workspaceId, parsed.data);
    return parsed.data;
  });
}
```

- [ ] **Step 5: Run migrations, then the test, to verify it passes**

Run: `pnpm --filter @gisik-nokma/server migrate`, then `pnpm --filter @gisik-nokma/server exec vitest run test/routes/preferences.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/preferences.ts packages/domain/src/index.ts packages/domain/test/filter-spec.test.ts apps/server/migrations apps/server/src/preferences/store.ts apps/server/src/routes/preferences.ts apps/server/test/routes/preferences.test.ts apps/server/test/helpers/read-app.ts apps/server/src/app.ts
git commit -m "Preferences: saved filters, list columns and grouping as server-owned per-user rows — arranged truth, not history, so the test proves a PUT leaves the ledger untouched and a malformed document is refused whole"
```

---
### Task 14: Stream frames and the subscription hub

**Files:**
- Create: `packages/domain/src/stream-frames.ts`
- Modify: `packages/domain/src/index.ts` (add export)
- Create: `apps/server/src/stream/hub.ts`
- Test: `packages/domain/test/stream-frames.test.ts`
- Test: `apps/server/test/stream/hub.test.ts`

**Interfaces:**
- Consumes: `EventEnvelope` (domain), `visibleEventsFor`/`SyncItem` (Plan 4), `onEventCommitted` (Plan 1).
- Produces (cross-plan API — coordination amendment 13; Plan 10's replica `DataSource` speaks exactly this protocol):
  - `subscribeFrameSchema` (zod) and `type SubscribeFrame = {type:'subscribe'; workspaceId: string; afterSeq: number}` — the only client frame.
  - `type ServerStreamFrame = {type:'event'; envelope: EventEnvelope} | {type:'purge'; workspaceId: string; entityId: string} | {type:'caught-up'; workspaceId: string; seq: number} | {type:'error'; workspaceId: string | null; code: StreamErrorCode; message: string}` with `type StreamErrorCode = 'bad-message' | 'not-a-member' | 'already-subscribed'`. (Amendment 13's purge/caught-up frames gain `workspaceId` — additive, forced by the amendment's own per-connection multi-workspace requirement; the event frame needs none because the envelope carries it. Flagged in Open questions.)
  - `STREAM_CLOSE_CODES = { unauthorized: 1008, slowConsumer: 1013, internalError: 1011 }`.
  - `type StreamSocket = { send(data: string): void; close(code: number, reason: string): void; terminate(): void; readonly bufferedAmount: number }` — structurally satisfied by `ws`.
  - `createStreamHub(deps: StreamHubDeps): StreamHub` with `StreamHubDeps = { pool: Pool; onEventCommitted(listener): () => void; visibleEvents?: typeof visibleEventsFor; maxBufferedBytes?: number; onError?(error: unknown): void }` and `StreamHub = { subscribe(userId, socket, workspaceId, afterSeq): Promise<'subscribed' | 'already-subscribed'>; dropSocket(socket): void; close(): void }`; `DEFAULT_MAX_BUFFERED_BYTES = 1_000_000`.
  - **The pump design (the honesty core):** catch-up AND live tail are the same operation — drain `visibleEventsFor(pool, userId, workspaceId, cursor)` and advance the cursor past each yielded envelope. `subscribe` registers the subscription *before* the first drain, then drains and sends `caught-up` exactly once (first drain only); every `onEventCommitted` notification marks the subscription dirty and re-drains. A commit landing mid-drain is therefore never lost, and the per-subscriber visibility filter is Plan 4's — one implementation, no live-path re-derivation to drift.
  - **Slow-consumer bound:** before each send, a socket whose `bufferedAmount` exceeds `maxBufferedBytes` is closed with `1013 'slow-consumer'`. The ledger is the durable buffer — the client reconnects and resumes from its cursor, losing nothing.

- [ ] **Step 1: Write the failing frame-schema test**

`packages/domain/test/stream-frames.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STREAM_CLOSE_CODES, subscribeFrameSchema } from '../src/stream-frames.js';

describe('subscribeFrameSchema', () => {
  it('accepts a well-formed subscribe frame', () => {
    expect(subscribeFrameSchema.parse({ type: 'subscribe', workspaceId: 'wks_01', afterSeq: 0 })).toEqual({
      type: 'subscribe',
      workspaceId: 'wks_01',
      afterSeq: 0,
    });
  });

  it('refuses wrong types, negative cursors, and unknown keys', () => {
    expect(() => subscribeFrameSchema.parse({ type: 'subscribe', workspaceId: 'wks_01', afterSeq: -1 })).toThrow();
    expect(() => subscribeFrameSchema.parse({ type: 'subscribe', workspaceId: '', afterSeq: 0 })).toThrow();
    expect(() => subscribeFrameSchema.parse({ type: 'unsubscribe', workspaceId: 'wks_01', afterSeq: 0 })).toThrow();
    expect(() =>
      subscribeFrameSchema.parse({ type: 'subscribe', workspaceId: 'wks_01', afterSeq: 0, extra: true }),
    ).toThrow();
  });
});

describe('close codes', () => {
  it('pins the protocol close codes', () => {
    expect(STREAM_CLOSE_CODES).toEqual({ unauthorized: 1008, slowConsumer: 1013, internalError: 1011 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement the frames module**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/stream-frames.test.ts`
Expected: FAIL — module missing.

`packages/domain/src/stream-frames.ts`:

```ts
import { z } from 'zod';
import type { EventEnvelope } from './event.js';

/**
 * WS /v1/stream protocol (coordination amendment 13).
 *
 * Client → server: {type:'subscribe', workspaceId, afterSeq} — one per
 * workspace per connection; multiple workspaces multiplex on one socket.
 *
 * Server → client, per subscription:
 *   {type:'event', envelope}            catch-up and live events, seq order
 *   {type:'purge', workspaceId, entityId}   revocation: forget this entity
 *   {type:'caught-up', workspaceId, seq}    sent exactly once, after the
 *                                            first drain; seq = resume cursor
 *   {type:'error', workspaceId|null, code, message}
 *
 * Reconnect semantics: delivery is at-least-once. The client resumes with
 * afterSeq = the highest envelope seq it has applied; frames at or below
 * the cursor may repeat; dedupe by envelope id; purges are idempotent.
 * A slow consumer is closed with 1013 'slow-consumer' — the ledger is the
 * durable buffer, so reconnect-and-resume loses nothing.
 */
export const subscribeFrameSchema = z
  .object({
    type: z.literal('subscribe'),
    workspaceId: z.string().min(1),
    afterSeq: z.number().int().min(0),
  })
  .strict();
export type SubscribeFrame = z.infer<typeof subscribeFrameSchema>;
export type ClientStreamFrame = SubscribeFrame;

export type StreamErrorCode = 'bad-message' | 'not-a-member' | 'already-subscribed';

export type ServerStreamFrame =
  | { type: 'event'; envelope: EventEnvelope }
  | { type: 'purge'; workspaceId: string; entityId: string }
  | { type: 'caught-up'; workspaceId: string; seq: number }
  | { type: 'error'; workspaceId: string | null; code: StreamErrorCode; message: string };

export const STREAM_CLOSE_CODES = {
  unauthorized: 1008,
  slowConsumer: 1013,
  internalError: 1011,
} as const;
```

(If Plan 1's `EventEnvelope` lives at a different relative path than `./event.js`, fix the import.) In `packages/domain/src/index.ts`, add:

```ts
export * from './stream-frames.js';
```

Run the test again. Expected: PASS.

- [ ] **Step 3: Write the failing hub unit test**

`apps/server/test/stream/hub.test.ts` — the hub is tested with an injected `visibleEvents` and a scripted `onEventCommitted`, no database and no sockets:

```ts
import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { newUlid, type EventEnvelope, type ServerStreamFrame } from '@gisik-nokma/domain';
import { createStreamHub, type StreamSocket } from '../../src/stream/hub.js';

const WS_A = newUlid();
const WS_B = newUlid();

function envelope(workspaceId: string, entityId: string, seq: number): EventEnvelope {
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'ticket', id: entityId },
    type: 'ticket.created',
    version: 1,
    payload: { typeId: 'task', projectId: 'prj', parentId: null, title: 't' },
    actorId: 'usr',
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
    serverTime: '2026-08-20T09:00:01.000Z',
    seq,
  };
}

type FakeSocket = StreamSocket & {
  frames: ServerStreamFrame[];
  closes: Array<{ code: number; reason: string }>;
  buffered: number;
};

function fakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    frames: [],
    closes: [],
    buffered: 0,
    get bufferedAmount() {
      return socket.buffered;
    },
    send(data: string) {
      socket.frames.push(JSON.parse(data) as ServerStreamFrame);
    },
    close(code: number, reason: string) {
      socket.closes.push({ code, reason });
    },
    terminate() {
      socket.closes.push({ code: -1, reason: 'terminated' });
    },
  };
  return socket;
}

/**
 * A visibleEventsFor stand-in over a mutable "ledger": yields items whose
 * seq exceeds afterSeq, in order — purge instructions ride along after the
 * envelope that caused them, mirroring Plan 4's semantics.
 */
function scriptedVisibleEvents(ledger: Array<EventEnvelope | { kind: 'purge'; entityId: string; atSeq: number }>) {
  return async function* visibleEvents(_pool: Pool, _userId: string, workspaceId: string, afterSeq: number) {
    for (const item of ledger) {
      if ('kind' in item) {
        if (item.atSeq > afterSeq) yield { kind: 'purge' as const, entityId: item.entityId };
      } else if (item.workspaceId === workspaceId && item.seq > afterSeq) {
        yield item;
      }
    }
  };
}

function hubWith(ledger: Parameters<typeof scriptedVisibleEvents>[0], maxBufferedBytes?: number) {
  let committedListener: ((event: EventEnvelope) => void) | undefined;
  const hub = createStreamHub({
    pool: {} as Pool,
    onEventCommitted: (listener) => {
      committedListener = listener;
      return () => {
        committedListener = undefined;
      };
    },
    visibleEvents: scriptedVisibleEvents(ledger) as never,
    maxBufferedBytes,
  });
  return { hub, commit: (event: EventEnvelope) => committedListener?.(event), ledger };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('stream hub', () => {
  it('catch-up: drains events past afterSeq, then caught-up exactly once with the cursor', async () => {
    const t1 = newUlid();
    const { hub } = hubWith([envelope(WS_A, t1, 1), envelope(WS_A, t1, 2), envelope(WS_A, t1, 3)]);
    const socket = fakeSocket();
    await hub.subscribe('usr', socket, WS_A, 1);
    expect(socket.frames.map((f) => f.type)).toEqual(['event', 'event', 'caught-up']);
    expect(socket.frames[2]).toEqual({ type: 'caught-up', workspaceId: WS_A, seq: 3 });
  });

  it('caught-up with seq = afterSeq when there is nothing to catch up', async () => {
    const { hub } = hubWith([]);
    const socket = fakeSocket();
    await hub.subscribe('usr', socket, WS_A, 7);
    expect(socket.frames).toEqual([{ type: 'caught-up', workspaceId: WS_A, seq: 7 }]);
  });

  it('live tail: a commit notification re-drains from the cursor — and only for the matching workspace', async () => {
    const t1 = newUlid();
    const { hub, commit, ledger } = hubWith([envelope(WS_A, t1, 1)]);
    const socket = fakeSocket();
    await hub.subscribe('usr', socket, WS_A, 0);
    expect(socket.frames.map((f) => f.type)).toEqual(['event', 'caught-up']);

    const live = envelope(WS_A, t1, 2);
    ledger.push(live);
    commit(live);
    await settle();
    expect(socket.frames.map((f) => f.type)).toEqual(['event', 'caught-up', 'event']);
    expect(socket.frames.filter((f) => f.type === 'caught-up')).toHaveLength(1); // never re-sent

    const foreign = envelope(WS_B, newUlid(), 1);
    ledger.push(foreign);
    commit(foreign);
    await settle();
    expect(socket.frames).toHaveLength(3); // nothing new for WS_A
  });

  it('purge instructions become purge frames carrying the workspace', async () => {
    const t1 = newUlid();
    const { hub } = hubWith([envelope(WS_A, t1, 1), { kind: 'purge', entityId: t1, atSeq: 1 }]);
    const socket = fakeSocket();
    await hub.subscribe('usr', socket, WS_A, 0);
    expect(socket.frames).toContainEqual({ type: 'purge', workspaceId: WS_A, entityId: t1 });
  });

  it('multi-workspace: one socket, independent cursors and caught-up per subscription', async () => {
    const tA = newUlid();
    const tB = newUlid();
    const { hub } = hubWith([envelope(WS_A, tA, 1), envelope(WS_B, tB, 1), envelope(WS_B, tB, 2)]);
    const socket = fakeSocket();
    await hub.subscribe('usr', socket, WS_A, 0);
    await hub.subscribe('usr', socket, WS_B, 1);
    const caughtUp = socket.frames.filter((f) => f.type === 'caught-up');
    expect(caughtUp).toEqual([
      { type: 'caught-up', workspaceId: WS_A, seq: 1 },
      { type: 'caught-up', workspaceId: WS_B, seq: 2 },
    ]);
    expect(await hub.subscribe('usr', socket, WS_A, 0)).toBe('already-subscribed');
  });

  it('slow consumer: a socket over the buffer bound is closed 1013 and unsubscribed', async () => {
    const t1 = newUlid();
    const { hub, commit, ledger } = hubWith([envelope(WS_A, t1, 1)], 10);
    const socket = fakeSocket();
    await hub.subscribe('usr', socket, WS_A, 0);
    socket.buffered = 11; // the peer stopped reading
    const live = envelope(WS_A, t1, 2);
    ledger.push(live);
    commit(live);
    await settle();
    expect(socket.closes).toEqual([{ code: 1013, reason: 'slow-consumer' }]);
    const framesAfterClose = socket.frames.length;
    const more = envelope(WS_A, t1, 3);
    ledger.push(more);
    commit(more);
    await settle();
    expect(socket.frames).toHaveLength(framesAfterClose); // nothing sent after close
  });

  it('dropSocket unsubscribes every workspace on that socket', async () => {
    const t1 = newUlid();
    const { hub, commit, ledger } = hubWith([envelope(WS_A, t1, 1)]);
    const socket = fakeSocket();
    await hub.subscribe('usr', socket, WS_A, 0);
    hub.dropSocket(socket);
    const live = envelope(WS_A, t1, 2);
    ledger.push(live);
    commit(live);
    await settle();
    expect(socket.frames.map((f) => f.type)).toEqual(['event', 'caught-up']); // nothing after the drop
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/stream/hub.test.ts`
Expected: FAIL — `createStreamHub` does not exist.

- [ ] **Step 5: Implement the hub**

`apps/server/src/stream/hub.ts`:

```ts
import type { Pool } from 'pg';
import type { EventEnvelope, ServerStreamFrame } from '@gisik-nokma/domain';
import { STREAM_CLOSE_CODES } from '@gisik-nokma/domain';
import { visibleEventsFor as defaultVisibleEvents } from '../visibility/visible-events-for.js';

export type StreamSocket = {
  send(data: string): void;
  close(code: number, reason: string): void;
  terminate(): void;
  readonly bufferedAmount: number;
};

export type StreamHubDeps = {
  pool: Pool;
  onEventCommitted(listener: (event: EventEnvelope) => void): () => void;
  /** Injectable for unit tests; production uses Plan 4's visibleEventsFor. */
  visibleEvents?: typeof defaultVisibleEvents;
  maxBufferedBytes?: number;
  onError?(error: unknown): void;
};

export type StreamHub = {
  subscribe(
    userId: string,
    socket: StreamSocket,
    workspaceId: string,
    afterSeq: number,
  ): Promise<'subscribed' | 'already-subscribed'>;
  dropSocket(socket: StreamSocket): void;
  close(): void;
};

export const DEFAULT_MAX_BUFFERED_BYTES = 1_000_000;

type Subscription = {
  userId: string;
  workspaceId: string;
  socket: StreamSocket;
  cursor: number;
  dirty: boolean;
  running: boolean;
  caughtUpSent: boolean;
  closed: boolean;
};

/**
 * One pump per (connection, workspace) subscription. Catch-up and live tail
 * are the SAME drain of visibleEventsFor — Plan 4's per-event visibility
 * filter and purge semantics apply identically to both, so the two paths
 * cannot disagree about what a viewer may see. onEventCommitted only marks
 * subscriptions dirty; the serialized pump does all reading and sending.
 */
export function createStreamHub(deps: StreamHubDeps): StreamHub {
  const visibleEvents = deps.visibleEvents ?? defaultVisibleEvents;
  const maxBuffered = deps.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;
  const bySocket = new Map<StreamSocket, Map<string, Subscription>>();
  const byWorkspace = new Map<string, Set<Subscription>>();

  function removeSocket(socket: StreamSocket): void {
    const subs = bySocket.get(socket);
    if (subs === undefined) return;
    for (const sub of subs.values()) {
      sub.closed = true;
      byWorkspace.get(sub.workspaceId)?.delete(sub);
    }
    bySocket.delete(socket);
  }

  function closeSocket(socket: StreamSocket, code: number, reason: string): void {
    removeSocket(socket);
    socket.close(code, reason);
  }

  function send(sub: Subscription, frame: ServerStreamFrame): void {
    if (sub.closed) return;
    if (sub.socket.bufferedAmount > maxBuffered) {
      // The ledger is the durable buffer: closing loses nothing — the
      // client reconnects and resumes from its cursor.
      closeSocket(sub.socket, STREAM_CLOSE_CODES.slowConsumer, 'slow-consumer');
      return;
    }
    sub.socket.send(JSON.stringify(frame));
  }

  async function drain(sub: Subscription): Promise<void> {
    for await (const item of visibleEvents(deps.pool, sub.userId, sub.workspaceId, sub.cursor)) {
      if (sub.closed) return;
      if ('kind' in item && item.kind === 'purge') {
        send(sub, { type: 'purge', workspaceId: sub.workspaceId, entityId: item.entityId });
      } else {
        const envelope = item as EventEnvelope;
        send(sub, { type: 'event', envelope });
        if (envelope.seq > sub.cursor) sub.cursor = envelope.seq;
      }
    }
  }

  async function pump(sub: Subscription): Promise<void> {
    if (sub.running) {
      sub.dirty = true;
      return;
    }
    sub.running = true;
    try {
      do {
        sub.dirty = false;
        await drain(sub);
        if (!sub.caughtUpSent && !sub.closed) {
          sub.caughtUpSent = true;
          send(sub, { type: 'caught-up', workspaceId: sub.workspaceId, seq: sub.cursor });
        }
      } while (sub.dirty && !sub.closed);
    } catch (error) {
      deps.onError?.(error);
      closeSocket(sub.socket, STREAM_CLOSE_CODES.internalError, 'stream-error');
    } finally {
      sub.running = false;
    }
  }

  const unsubscribe = deps.onEventCommitted((event) => {
    const subs = byWorkspace.get(event.workspaceId);
    if (subs === undefined) return;
    for (const sub of subs) void pump(sub);
  });

  return {
    async subscribe(userId, socket, workspaceId, afterSeq) {
      let socketSubs = bySocket.get(socket);
      if (socketSubs === undefined) {
        socketSubs = new Map();
        bySocket.set(socket, socketSubs);
      }
      if (socketSubs.has(workspaceId)) return 'already-subscribed';
      const sub: Subscription = {
        userId,
        workspaceId,
        socket,
        cursor: afterSeq,
        dirty: false,
        running: false,
        caughtUpSent: false,
        closed: false,
      };
      socketSubs.set(workspaceId, sub);
      let workspaceSubs = byWorkspace.get(workspaceId);
      if (workspaceSubs === undefined) {
        workspaceSubs = new Set();
        byWorkspace.set(workspaceId, workspaceSubs);
      }
      // Registered BEFORE the first drain: a commit landing mid-catch-up
      // marks the subscription dirty and re-drains — never lost.
      workspaceSubs.add(sub);
      await pump(sub);
      return 'subscribed';
    },
    dropSocket(socket) {
      removeSocket(socket);
    },
    close() {
      unsubscribe();
      for (const socket of [...bySocket.keys()]) removeSocket(socket);
    },
  };
}
```

- [ ] **Step 6: Run the hub test to verify it passes**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/stream/hub.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/stream-frames.ts packages/domain/src/index.ts packages/domain/test/stream-frames.test.ts apps/server/src/stream/hub.ts apps/server/test/stream/hub.test.ts
git commit -m "Stream protocol and hub: catch-up and live tail are one drain of visibleEventsFor per subscription, caught-up fires exactly once, and a slow consumer is closed at the buffer bound because the ledger — not the socket queue — is the durable buffer"
```

---

### Task 15: WS `/v1/stream` — the route, heartbeat, and the planted stream defects

**Files:**
- Modify: `apps/server/package.json` (dependencies)
- Create: `apps/server/src/stream/routes.ts`
- Modify: the app assembly — register `@fastify/websocket`, create the hub, add `registerStreamRoute(...)`
- Create: `apps/server/test/helpers/stream.ts`
- Test: `apps/server/test/stream/stream-route.test.ts`

**Interfaces:**
- Consumes: `createStreamHub`/`StreamHub` (Task 14), `subscribeFrameSchema`/`ServerStreamFrame`/`STREAM_CLOSE_CODES` (domain), `makeRequireSession`/`Auth` (Plan 4), `resolveEffectiveRole` (Plan 4), `createIngestService`/`onEventCommitted` (Plan 1), scenario + read-app helpers (Tasks 5, 8).
- Produces (cross-plan API — Plan 6's online `DataSource.subscribe` and Plan 10's sync both connect here):
  - `registerStreamRoute(app: FastifyInstance, deps: { pool: Pool; auth: Auth; hub: StreamHub; heartbeatMs?: number }): void` serving WS `GET /v1/stream`.
  - Protocol: authenticate at upgrade (session preHandler; no session → HTTP 401 before upgrade, or close `1008 'unauthorized'` as fallback); then any number of `subscribe` frames, each gated on workspace membership (`not-a-member` error frame, no subscription, zero events); malformed frames answer a `bad-message` error frame without closing.
  - Heartbeat: protocol-level ping every `heartbeatMs` (default 30 000 ms); a peer that misses two pings is terminated. Clients need no application-level handling — WebSocket pongs are automatic.
  - Reconnect: documented at the frames module (Task 14) — at-least-once delivery, resume via `afterSeq`, dedupe by envelope id.

- [ ] **Step 1: Add the dependencies**

Run (from `apps/server/`):

```bash
pnpm add @fastify/websocket@^11.0.0
pnpm add -D ws@^8.18.0 @types/ws@^8.5.0
```

(`@fastify/websocket` v11 is the Fastify 5 line. `ws` is test-only — the client that connects to the listening server.)

- [ ] **Step 2: Write the ws test helper**

`apps/server/test/helpers/stream.ts`:

```ts
import WebSocket from 'ws';
import type { ServerStreamFrame } from '@gisik-nokma/domain';

export type TestStream = {
  frames: ServerStreamFrame[];
  socket: WebSocket;
  subscribe(workspaceId: string, afterSeq: number): void;
  sendRaw(data: string): void;
  /** Resolves with the first frame (already-received or future) matching the predicate. */
  next(match: (frame: ServerStreamFrame) => boolean, timeoutMs?: number): Promise<ServerStreamFrame>;
  /** Lets in-flight frames land. */
  settle(ms?: number): Promise<void>;
  close(): Promise<void>;
  closed: Promise<{ code: number; reason: string }>;
  pings: number;
};

export function openStream(
  port: number,
  headers: Record<string, string>,
  options: { autoPong?: boolean } = {},
): Promise<TestStream> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/stream`, {
    headers,
    autoPong: options.autoPong ?? true,
  });
  const frames: ServerStreamFrame[] = [];
  const waiters: Array<{ match: (f: ServerStreamFrame) => boolean; resolve: (f: ServerStreamFrame) => void }> = [];
  const stream: TestStream = {
    frames,
    socket,
    pings: 0,
    subscribe: (workspaceId, afterSeq) =>
      socket.send(JSON.stringify({ type: 'subscribe', workspaceId, afterSeq })),
    sendRaw: (data) => socket.send(data),
    next: (match, timeoutMs = 3000) =>
      new Promise((resolve, reject) => {
        const found = frames.find(match);
        if (found !== undefined) {
          resolve(found);
          return;
        }
        const timer = setTimeout(
          () => reject(new Error(`no matching frame within ${timeoutMs}ms; saw: ${JSON.stringify(frames)}`)),
          timeoutMs,
        );
        waiters.push({
          match,
          resolve: (frame) => {
            clearTimeout(timer);
            resolve(frame);
          },
        });
      }),
    settle: (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms)),
    close: () =>
      new Promise((resolve) => {
        socket.once('close', () => resolve());
        socket.close();
      }),
    closed: new Promise((resolve) =>
      socket.once('close', (code, reason) => resolve({ code, reason: reason.toString() })),
    ),
  };
  socket.on('ping', () => {
    stream.pings += 1;
  });
  socket.on('message', (data) => {
    const frame = JSON.parse(data.toString()) as ServerStreamFrame;
    frames.push(frame);
    const index = waiters.findIndex((w) => w.match(frame));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      waiter.resolve(frame);
    }
  });
  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.once('open', () => resolve(stream));
  });
}
```

- [ ] **Step 3: Write the failing integration test**

`apps/server/test/stream/stream-route.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';
import type { Pool } from 'pg';
import { newUlid, type EventEnvelope, type SubmittedEvent } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import websocket from '@fastify/websocket';
import { buildApp } from '../../src/app.js';
import { createAuth, type Auth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { registerAuthRoutes } from '../../src/auth/routes.js';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createStreamHub, type StreamHub } from '../../src/stream/hub.js';
import { registerStreamRoute } from '../../src/stream/routes.js';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';
import { openStream, type TestStream } from '../helpers/stream.js';
import { signInWithPhone } from '../helpers/session.js';

let pool: Pool;
let app: FastifyInstance;
let auth: Auth;
let otp: LogOtpSender;
let ingest: IngestService;
let hub: StreamHub;
let port: number;
let world: ReadScenario;
let memberToken: string;
let ownerToken: string;
const openStreams: TestStream[] = [];

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
  otp = new LogOtpSender(() => {});
  auth = createAuth({ pool, otpSender: otp, magicLinkSender: new LogMagicLinkSender(() => {}) });
  ingest = createIngestService({ pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
  hub = createStreamHub({ pool, onEventCommitted: (listener) => ingest.onEventCommitted(listener) });
  app = buildApp({ db: pool, ingest });
  registerAuthRoutes(app, auth);
  await app.register(websocket);
  registerStreamRoute(app, { pool, auth, hub, heartbeatMs: 60_000 });
  await app.listen({ port: 0, host: '127.0.0.1' });
  port = (app.server.address() as AddressInfo).port;
});
afterAll(async () => {
  hub.close();
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  resetEntitySeqs();
  const ownerSession = await signIn('+911111111101');
  const memberSession = await signIn('+911111111102');
  const outsiderSession = await signIn('+911111111103');
  const guestSession = await signIn('+911111111104');
  ownerToken = ownerSession.token;
  memberToken = memberSession.token;
  world = await seedReadScenario(pool, {
    owner: ownerSession.userId,
    member: memberSession.userId,
    outsider: outsiderSession.userId,
    guest: guestSession.userId,
  });
});
afterEach(async () => {
  for (const stream of openStreams.splice(0)) {
    if (stream.socket.readyState === stream.socket.OPEN) await stream.close();
  }
});

async function signIn(phone: string): Promise<{ userId: string; token: string }> {
  const token = await signInWithPhone(app, otp, phone);
  const session = await app.inject({
    method: 'GET',
    url: '/api/auth/get-session',
    headers: { authorization: `Bearer ${token}` },
  });
  return { userId: (session.json() as { user: { id: string } }).user.id, token };
}

async function connect(token: string, options: { autoPong?: boolean } = {}): Promise<TestStream> {
  const stream = await openStream(port, { authorization: `Bearer ${token}` }, options);
  openStreams.push(stream);
  return stream;
}

function submitted(partial: Pick<EventEnvelope, 'entity' | 'type' | 'payload' | 'actorId'>): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: world.workspaceId,
    origin: 'web',
    version: 1,
    clientTime: new Date().toISOString(),
    ...partial,
  };
}

async function ingestOk(events: SubmittedEvent[]): Promise<void> {
  const results = await ingest.ingestBatch(events);
  for (const result of results) {
    if (result.status !== 'committed') throw new Error(`test event not committed: ${JSON.stringify(result)}`);
  }
}

describe('WS /v1/stream', () => {
  it('subscribe → visibility-filtered catch-up → caught-up{seq} → live tail', async () => {
    const stream = await connect(memberToken);
    stream.subscribe(world.workspaceId, 0);
    const caughtUp = await stream.next((f) => f.type === 'caught-up');

    // Catch-up carried the member-visible tickets…
    const caughtUpIds = stream.frames
      .filter((f): f is Extract<typeof f, { type: 'event' }> => f.type === 'event')
      .filter((f) => f.envelope.entity.kind === 'ticket')
      .map((f) => f.envelope.entity.id);
    expect(caughtUpIds).toContain(world.taskInEpicId);
    // …and caught-up.seq is the highest envelope seq that was yielded:
    const maxSeq = Math.max(
      ...stream.frames
        .filter((f): f is Extract<typeof f, { type: 'event' }> => f.type === 'event')
        .map((f) => f.envelope.seq),
    );
    expect(caughtUp).toEqual({ type: 'caught-up', workspaceId: world.workspaceId, seq: maxSeq });

    // Live tail: a new legal event lands as an event frame after caught-up
    await ingestOk([
      submitted({
        actorId: world.member,
        entity: { kind: 'ticket', id: world.taskInEpicId },
        type: 'ticket.field_set',
        payload: { fieldId: 'dueDate', value: { date: '2026-08-28' } },
      }),
    ]);
    const live = await stream.next(
      (f) => f.type === 'event' && f.envelope.type === 'ticket.field_set' && f.envelope.entity.id === world.taskInEpicId,
    );
    expect(stream.frames.indexOf(live)).toBeGreaterThan(stream.frames.indexOf(caughtUp));
  });

  it('PLANTED DEFECT: the hidden ticket’s events never cross the wire — catch-up and live alike', async () => {
    const stream = await connect(memberToken);
    stream.subscribe(world.workspaceId, 0);
    await stream.next((f) => f.type === 'caught-up');
    expect(JSON.stringify(stream.frames)).not.toContain(world.hiddenTaskId);

    // Live: the owner touches the hidden ticket; the member hears nothing…
    await ingestOk([
      submitted({
        actorId: world.owner,
        entity: { kind: 'ticket', id: world.hiddenTaskId },
        type: 'ticket.field_set',
        payload: { fieldId: 'dueDate', value: { date: '2026-08-29' } },
      }),
    ]);
    // …but a visible event ingested AFTER it does arrive — proving the
    // stream is live and the silence was the filter, not lag:
    await ingestOk([
      submitted({
        actorId: world.member,
        entity: { kind: 'ticket', id: world.taskInEpicId },
        type: 'ticket.field_set',
        payload: { fieldId: 'dueDate', value: { date: '2026-08-30' } },
      }),
    ]);
    await stream.next(
      (f) => f.type === 'event' && f.envelope.entity.id === world.taskInEpicId && f.envelope.type === 'ticket.field_set',
    );
    expect(JSON.stringify(stream.frames)).not.toContain(world.hiddenTaskId);
  });

  it('PLANTED DEFECT: revocation mid-stream yields purge frames for the subtree, and the revoking event itself is not leaked', async () => {
    const stream = await connect(memberToken);
    stream.subscribe(world.workspaceId, 0);
    await stream.next((f) => f.type === 'caught-up');

    // The owner (project admin) restricts the epic to themselves; the member
    // loses the epic AND its inheriting child.
    await ingestOk([
      submitted({
        actorId: world.owner,
        entity: { kind: 'ticket', id: world.epicId },
        type: 'visibility.set',
        payload: { ticketId: world.epicId, mode: 'explicit', userIds: [world.owner] },
      }),
    ]);
    await stream.next((f) => f.type === 'purge' && f.entityId === world.epicId);
    await stream.next((f) => f.type === 'purge' && f.entityId === world.taskInEpicId);
    const eventFramesForEpic = stream.frames.filter(
      (f) => f.type === 'event' && f.envelope.type === 'visibility.set' && f.envelope.entity.id === world.epicId,
    );
    expect(eventFramesForEpic).toEqual([]); // the event that revoked is itself invisible now
  });

  it('a non-member subscribe gets an error frame and zero events — membership is checked per subscription', async () => {
    const stranger = await signIn('+911111111110');
    const stream = await connect(stranger.token);
    stream.subscribe(world.workspaceId, 0);
    const error = await stream.next((f) => f.type === 'error');
    expect(error).toEqual({
      type: 'error',
      workspaceId: world.workspaceId,
      code: 'not-a-member',
      message: 'not a member of this workspace',
    });
    await ingestOk([
      submitted({
        actorId: world.member,
        entity: { kind: 'ticket', id: world.taskInEpicId },
        type: 'ticket.field_set',
        payload: { fieldId: 'dueDate', value: { date: '2026-08-31' } },
      }),
    ]);
    await stream.settle();
    expect(stream.frames.filter((f) => f.type === 'event')).toEqual([]);
  });

  it('rejects a connection without a session before any frame flows', async () => {
    await expect(openStream(port, {})).rejects.toThrow(); // 401 at upgrade
  });

  it('answers bad-message for junk without closing the socket', async () => {
    const stream = await connect(memberToken);
    stream.sendRaw('not json at all');
    const error = await stream.next((f) => f.type === 'error' && f.code === 'bad-message');
    expect(error.workspaceId).toBeNull();
    stream.subscribe(world.workspaceId, 0);
    await stream.next((f) => f.type === 'caught-up'); // still alive and serving
  });

  it('multiplexes two workspaces on one connection, frames demuxed by workspaceId', async () => {
    // The owner also owns a second workspace with one ticket.
    const otherWorkspace = await seedSecondWorkspace();
    const stream = await connect(ownerToken);
    stream.subscribe(world.workspaceId, 0);
    stream.subscribe(otherWorkspace.workspaceId, 0);
    const first = await stream.next((f) => f.type === 'caught-up' && f.workspaceId === world.workspaceId);
    const second = await stream.next((f) => f.type === 'caught-up' && f.workspaceId === otherWorkspace.workspaceId);
    expect(first).not.toEqual(second);
    const duplicate = stream.subscribe(world.workspaceId, 0);
    await stream.next((f) => f.type === 'error' && f.code === 'already-subscribed');
    void duplicate;
  });

  it('heartbeat: pings flow, and a peer that never pongs is terminated', async () => {
    const server = await heartbeatApp(40);
    try {
      const silent = await openStream(server.port, { authorization: `Bearer ${memberToken}` }, { autoPong: false });
      const { code } = await silent.closed;
      expect(code).toBe(1006); // terminated without a close frame
      expect(silent.pings).toBeGreaterThan(0);

      const healthy = await openStream(server.port, { authorization: `Bearer ${memberToken}` });
      await healthy.settle(200);
      expect(healthy.socket.readyState).toBe(healthy.socket.OPEN); // auto-pong keeps it alive
      await healthy.close();
    } finally {
      await server.close();
    }
  });

  it.fails(
    'PINNED SERIES DEFECT: resume after caught-up still delivers a NEW entity whose per-entity seq is below the cursor (workspace-cursor amendment pending — flip to `it` when it lands)',
    async () => {
      const stream = await connect(memberToken);
      stream.subscribe(world.workspaceId, 0);
      await stream.next((f) => f.type === 'caught-up');
      // A brand-new ticket's ledger seq starts at 1 — far below the cursor
      // that catch-up advanced past the existing entities' seqs.
      const freshId = newUlid();
      await ingestOk([
        submitted({
          actorId: world.member,
          entity: { kind: 'ticket', id: freshId },
          type: 'ticket.created',
          payload: { typeId: 'task', projectId: world.projectId, parentId: null, title: 'Born after the cursor' },
        }),
      ]);
      await stream.next((f) => f.type === 'event' && f.envelope.entity.id === freshId, 1500);
    },
  );
});

async function seedSecondWorkspace(): Promise<{ workspaceId: string }> {
  const { applyCommitted, makeCommitted } = await import('../helpers/apply.js');
  const { membershipId } = await import('@gisik-nokma/domain');
  const workspaceId = newUlid();
  await applyCommitted(pool, [
    makeCommitted({
      workspaceId,
      actorId: world.owner,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.created',
      payload: { name: 'Second shop' },
    }),
    makeCommitted({
      workspaceId,
      actorId: world.owner,
      entity: { kind: 'membership', id: membershipId(workspaceId, world.owner) },
      type: 'membership.granted',
      payload: { userId: world.owner, role: 'owner', scope: 'workspace' },
    }),
  ]);
  return { workspaceId };
}

async function heartbeatApp(heartbeatMs: number): Promise<{ port: number; close(): Promise<void> }> {
  const heartbeatHub = createStreamHub({ pool, onEventCommitted: (l) => ingest.onEventCommitted(l) });
  const heartbeat = buildApp({ db: pool, ingest });
  registerAuthRoutes(heartbeat, auth);
  await heartbeat.register(websocket);
  registerStreamRoute(heartbeat, { pool, auth, hub: heartbeatHub, heartbeatMs });
  await heartbeat.listen({ port: 0, host: '127.0.0.1' });
  return {
    port: (heartbeat.server.address() as AddressInfo).port,
    close: async () => {
      heartbeatHub.close();
      await heartbeat.close();
    },
  };
}
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/stream/stream-route.test.ts`
Expected: FAIL — `registerStreamRoute` does not exist.

- [ ] **Step 5: Implement the route**

`apps/server/src/stream/routes.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { WebSocket } from 'ws';
import { STREAM_CLOSE_CODES, subscribeFrameSchema, type ServerStreamFrame } from '@gisik-nokma/domain';
import type { Auth } from '../auth/auth.js';
import { makeRequireSession } from '../auth/routes.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import type { StreamHub } from './hub.js';

const DEFAULT_HEARTBEAT_MS = 30_000;

/**
 * WS /v1/stream (coordination amendment 13). The session preHandler runs at
 * the upgrade request — no session, no upgrade. Membership is checked per
 * subscribe frame: one connection may hold subscriptions in several
 * workspaces, and each is filtered per-subscriber through visibleEventsFor
 * by the hub. Protocol and reconnect semantics are documented on the frames
 * module in @gisik-nokma/domain (stream-frames.ts).
 */
export function registerStreamRoute(
  app: FastifyInstance,
  deps: { pool: Pool; auth: Auth; hub: StreamHub; heartbeatMs?: number },
): void {
  const requireSession = makeRequireSession(deps.auth);
  const heartbeatMs = deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;

  app.get('/v1/stream', { websocket: true, preHandler: requireSession }, (socket: WebSocket, request) => {
    const userId = (request as FastifyRequest & { currentUserId?: string }).currentUserId;
    if (userId === undefined) {
      // Fallback only: the preHandler should have refused the upgrade.
      socket.close(STREAM_CLOSE_CODES.unauthorized, 'unauthorized');
      return;
    }

    let alive = true;
    socket.on('pong', () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, heartbeatMs);

    function sendFrame(frame: ServerStreamFrame): void {
      socket.send(JSON.stringify(frame));
    }

    async function handleMessage(data: Buffer): Promise<void> {
      let raw: unknown;
      try {
        raw = JSON.parse(data.toString('utf8'));
      } catch {
        sendFrame({ type: 'error', workspaceId: null, code: 'bad-message', message: 'frames are JSON' });
        return;
      }
      const parsed = subscribeFrameSchema.safeParse(raw);
      if (!parsed.success) {
        sendFrame({
          type: 'error',
          workspaceId: null,
          code: 'bad-message',
          message: 'expected {type:"subscribe", workspaceId, afterSeq}',
        });
        return;
      }
      const { workspaceId, afterSeq } = parsed.data;
      const eff = await resolveEffectiveRole(deps.pool, userId!, workspaceId);
      if (eff.workspaceRole === null) {
        sendFrame({ type: 'error', workspaceId, code: 'not-a-member', message: 'not a member of this workspace' });
        return;
      }
      const outcome = await deps.hub.subscribe(userId!, socket, workspaceId, afterSeq);
      if (outcome === 'already-subscribed') {
        sendFrame({
          type: 'error',
          workspaceId,
          code: 'already-subscribed',
          message: 'one subscription per workspace per connection',
        });
      }
    }

    socket.on('message', (data: Buffer) => {
      void handleMessage(data);
    });
    socket.on('close', () => {
      clearInterval(heartbeat);
      deps.hub.dropSocket(socket);
    });
    socket.on('error', () => {
      clearInterval(heartbeat);
      deps.hub.dropSocket(socket);
    });
  });
}
```

(`@fastify/websocket` v11 hands the handler `(socket, request)` with `socket` a `ws` WebSocket — which structurally satisfies Task 14's `StreamSocket`. If the installed version hands a `{socket}` connection object instead, destructure it; the rest is unchanged.)

- [ ] **Step 6: Register in the app assembly**

At the assembly point, before the route registrations:

```ts
import websocket from '@fastify/websocket';
import { createStreamHub } from './stream/hub.js';
import { registerStreamRoute } from './stream/routes.js';

await app.register(websocket);
const hub = createStreamHub({ pool, onEventCommitted: (listener) => ingest.onEventCommitted(listener) });
registerStreamRoute(app, { pool, auth, hub });
```

(The plugin must be registered before the websocket route; the hub is created once, next to the ingest service it listens to.)

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/stream/stream-route.test.ts`
Expected: PASS — 8 passing tests, and the final `it.fails` test PASSES AS `it.fails` (the frame never arrives, which is today's true, defective behaviour — see Open questions #1; when the workspace-cursor amendment lands, this test turns red and is flipped to `it`, becoming the amendment's proof).

- [ ] **Step 8: Run the full server suite**

Run: `pnpm --filter @gisik-nokma/server test`
Expected: PASS across every suite — the stream wiring must not disturb the read routes or Plans 1–4's tests.

- [ ] **Step 9: Commit**

```bash
git add apps/server/package.json pnpm-lock.yaml apps/server/src/stream/routes.ts apps/server/test/helpers/stream.ts apps/server/test/stream/stream-route.test.ts apps/server/src/app.ts
git commit -m "WS /v1/stream: session at upgrade, membership per subscribe, heartbeat and slow-consumer bounds — the planted defects prove an invisible ticket never crosses the wire, revocation is followed by purge frames, and the series' per-entity-seq cursor defect is pinned as an it.fails test that will turn red the day it is fixed"
```

---
### Task 16: Features.md and test-cases/ — the catalogue moves in the same change set

**Files:**
- Modify: `Features.md` (append §7)
- Create: `test-cases/07-api-realtime-search.md`

**Numbering note:** Plans 1–4 execute before this plan and claim §3–§6 (coordination decision 2). This plan claims §7 and cases 7.x — nothing else. If an earlier section number is somehow free, still use §7 only if the coordination table says so; never renumber anything that exists.

**Interfaces:**
- Consumes: the shipped work of Tasks 1–15.
- Produces: the workspace-mandated catalogue entries; statuses are ✅ because the covering tests land in this same change set (same PR), which satisfies the same-change-set rule. Case 7.33 is 🧪-adjacent by nature but recorded as ✅-with-a-note because the `it.fails` pin is executable.

- [ ] **Step 1: Append the feature section to `Features.md`**

````markdown
## 7. API, realtime & search

- ✅ **Board read API** — `GET /v1/projects/:id/board`: columns are exactly the attached workflows' states (mixed workflows side by side, each ticket under its own workflow's state), per-column `{stateId, name, category, blocked}`; cards carry the TicketState summary, the provenance of the current state (actor, both clocks, reopen cause), and the viewer-honest parent rollup `{totalChildren, terminalChildren, restrictedCount}`. `apps/server/src/routes/board.ts`
- ✅ **List read API** — `GET /v1/projects/:id/tickets`: composable FilterSpec, five groupings (epic / status / assignee / type / flat), keyset pagination by ticket id, hierarchy by parent query (`parentId=<id>` for children, `parentId=root` for roots). Epic grouping heads a group with the nearest ancestor-or-self whose type carries the **epic rank** — the built-in `epic` and any custom type defined at that rank alike, so a workspace's own top-rung type ("Initiative") heads its own group. Grouping arranges truth; it never changes what matches. `apps/server/src/routes/list.ts`
- ✅ **Builder read surface** — `GET /v1/workspaces/:id/workflows` (latest definition per workflow), `…/workflows/:workflowId?version=` (one definition, latest by default), `…/ticket-types`, `…/members` (`{userId, displayName, role}`, guests withheld from non-admin callers), and admin-only `…/workflows/:workflowId/state-occupancy` (live ticket counts per state, zeroes and undefined-state stragglers included) — the reads Plan 8's workflow builder authors against. `apps/server/src/routes/builder-reads.ts`
- ✅ **Full-text search** — `GET /v1/search`: ranked cross-project search over titles, descriptions, and comments, visibility-filtered at read time, snippets with the match marked; composable with FilterSpec (`q` owns the text term). `apps/server/src/routes/search.ts`
- ✅ **My Work** — `GET /v1/me/work`: assigned-to-me across a workspace's projects, grouped by state category; Plan 10's contested-claims extension point documented in the shape. `apps/server/src/routes/my-work.ts`
- ✅ **Attention strip API** — `GET /v1/workspaces/:id/attention`: blocked-flagged states, active-state staleness, and due-window claims — computed at read time from claims plus the clock, never stored; every item carries its reason and the claim's provenance; thresholds come from `workspace.settings_set` claims. Both windows and the `daysInFlight` count are **Indian days**: boundaries from `istDayBounds` compared half-open, counts by subtracting `istDayOf` results, so a claim made in the Indian evening lands on the day India was living in (owner decision 2026-08-20). `apps/server/src/routes/attention.ts`
- ✅ **Realtime stream** — WS `/v1/stream`: authenticated subscribe per workspace, visibility-filtered catch-up through `visibleEventsFor`, `caught-up` cursor frame, live tail off `onEventCommitted` through the same filter, purge frames on revocation, ping/pong heartbeat, bounded-buffer slow-consumer close (the ledger is the durable buffer; reconnect resumes by cursor). `apps/server/src/stream/`
- ✅ **View preferences** — `GET/PUT /v1/me/preferences`: saved filters, per-project list columns and grouping as server-owned per-user rows — never ledger events, because preferences arrange truth rather than claim anything. `apps/server/src/routes/preferences.ts`
- ⚙️ **FilterSpec compiler** — one strict zod shape (`@gisik-nokma/domain`) compiled to parameterized SQL; user bytes travel only as parameters, injection-proven against planted hostile input. `apps/server/src/read/compile-filter.ts`
- ⚙️ **Visibility SQL predicate** — Plan 4's decision table as one WHERE fragment for set-based reads, proven in agreement with `canSee` over a five-viewer matrix. `apps/server/src/read/visible-where.ts`
- ⚙️ **docToPlainText** — dependency-free ProseMirror-JSON walker in `@gisik-nokma/domain` (mentions render as `@name`; total on junk); the mention shape is the contract Plan 7's editor conforms to. `packages/domain/src/doc-text.ts`
- ⚙️ **proj_search** — weighted tsvector projection over title/description/comments (`'simple'` config), rebuild-and-diff clean. `apps/server/src/projections/search.ts`
- ⚙️ **workspace.settings_set + proj_workspace_settings** — attention thresholds as attributed claims (owner/admin only), projected with the last claim's provenance and defaults applied at read. `apps/server/src/projections/workspace-settings.ts`
````

- [ ] **Step 2: Create the test-cases bucket**

`test-cases/07-api-realtime-search.md`:

````markdown
# 7. API, realtime & search — test cases

Mirrors `Features.md` §7. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope (with reason).

- 7.1 ✅ `docToPlainText` renders paragraphs, hard breaks, and mentions as `@label`/`@userId`; descends into unknown nodes; images render as nothing. (`doc-text.test.ts`)
- 7.2 ✅ `docToPlainText` is total: null, numbers, strings, arrays, and malformed nodes yield `''`, never a throw. (`doc-text.test.ts`)
- 7.3 ✅ `filterSpecSchema` refuses unknown keys, bad ops, malformed dates, and oversized inputs; `groupingSchema` admits exactly five groupings. (`filter-spec.test.ts`)
- 7.4 ✅ Planted defect: a hostile fieldId/text term never reaches SQL text — compiled clauses carry only `$n` placeholders, hostile bytes only in the parameter array. (`compile-filter.test.ts`)
- 7.5 ✅ Planted defect end-to-end: the hostile filter executes against the live route, returns empty, and `proj_tickets`/`events` survive. (`list.test.ts`)
- 7.6 ✅ `workspace.settings_set` v1 registered; empty claims, unknown keys, and out-of-range values refused at the door. (`workspace-settings.test.ts` in domain)
- 7.7 ✅ Planted defect: a member claiming the staleness threshold is refused `permission.role` with the reason named; owner/admin pass; guest/non-member refused. (`settings-permission.test.ts`)
- 7.8 ✅ `proj_workspace_settings`: last claim per key with provenance, partial updates leave the other key, defaults with null provenance when never claimed, rebuild-and-diff clean. (`workspace-settings.test.ts` in server)
- 7.9 ✅ `visibleTicketsWhere` agrees with `canSee` for owner/member/outsider/guest/stranger over the seeded matrix; non-member compiles to `FALSE`. (`visible-where.test.ts`)
- 7.10 ✅ Planted defect: the explicit-mode ticket omitting the member never surfaces in the SQL set. (`visible-where.test.ts`)
- 7.11 ✅ `proj_search` indexes titles, descriptions (via docToPlainText), and comments (mention labels searchable); title re-claims re-index; comments accumulate. (`search.test.ts` in projections)
- 7.12 ✅ `proj_search` reproduces byte-identically on reset-and-replay. (`search.test.ts` in projections)
- 7.13 ✅ Board: one column per (workflow, state), empty states included, blocked flag carried from the definition. (`board.test.ts`)
- 7.14 ✅ Board cards carry state provenance (actor + both clocks) and parent rollups with viewer-honest restrictedCount. (`board.test.ts`, `ticket-cards.test.ts`)
- 7.15 ✅ Planted defect: after two transitions by different actors the card carries the LAST claim; a reopen carries its `cause`. (`ticket-cards.test.ts`)
- 7.16 ✅ Planted defect: the hidden ticket appears nowhere in the member's board body; the owner's board has it; the filter is visibility, not deletion. (`board.test.ts`)
- 7.17 ✅ Board membership: guests see their slice, off-project members get an empty board, strangers and unknown ids get identical 404s, no session is 401. (`board.test.ts`)
- 7.18 ✅ List filters compose: assignee + category + due window; blocked-flag filter; FTS text term; custom-field eq/contains. (`list.test.ts`)
- 7.19 ✅ List groupings: epic (nearest ancestor-or-self at the epic rank, `no-epic` bucket, epic titles as labels), status, assignee (`unassigned`), type, flat. (`list.test.ts`)
- 7.20 ✅ List hierarchy and pagination: children by `parentId`, roots by `parentId=root`, keyset pages without overlap or gap. (`list.test.ts`)
- 7.21 ✅ Planted defect: the hidden ticket is absent from every grouping and every page of the member's list. (`list.test.ts`)
- 7.22 ✅ List refuses malformed filter JSON, unknown groupings, and out-of-range limits with generic 400s. (`list.test.ts`)
- 7.23 ✅ Search finds by title, description, and comment (mention label included), marks matches in snippets, composes with FilterSpec, refuses a filter smuggling `text`. (`search.test.ts` in routes)
- 7.24 ✅ Planted defect: the confidential comment on the hidden ticket is unfindable by the member — no hit, no snippet, no id — while the owner finds it. (`search.test.ts` in routes)
- 7.25 ✅ Search: guests search only their shared slice; non-members 404; hostile `q` is a plain phrase. (`search.test.ts` in routes)
- 7.26 ✅ My Work groups assigned-to-me by state category and follows category changes. (`my-work.test.ts`)
- 7.27 ✅ Planted defect: assigned-but-invisible never appears in My Work — assignment is not visibility. (`my-work.test.ts`)
- 7.28 ✅ Attention: blocked / stale / due-soon computed at the injected clock with reasons and claim provenance; overdue included; terminal excluded; `generatedAt` names the moment; the stale item reports `daysInFlight` as a count of Indian days. (`attention.test.ts`)
- 7.29 ✅ Planted defect: a `workspace.settings_set` claim flips staleness and due-window membership — thresholds are read from the ledger, not constants. (`attention.test.ts`)
- 7.30 ✅ Planted defect: the hidden ticket's imminent due date alarms the owner and never the member. (`attention.test.ts`)
- 7.31 ✅ Preferences round-trip with full-replace PUT; malformed documents refused whole; a PUT writes zero ledger events; non-members 404. (`preferences.test.ts`)
- 7.32 ✅ Stream frames: subscribe schema strict; close codes pinned; hub delivers catch-up in order, caught-up exactly once with the cursor, live tail only for the subscribed workspace, purge frames with workspaceId, multi-workspace demux, slow-consumer close 1013, dropSocket detaches. (`stream-frames.test.ts`, `hub.test.ts`)
- 7.33 ✅ Stream integration: visibility-filtered catch-up → caught-up{seq = max yielded} → live tail; planted invisible-ticket silence proven live; purge frames follow mid-stream revocation with the revoking event unleaked; non-member subscribe gets an error frame and zero events; no session refused at upgrade; bad frames answered without closing; heartbeat terminates silent peers. (`stream-route.test.ts`)
- 7.34 ✅ Pinned series defect (`it.fails`): a new entity born after the cursor is LOST on resume because per-entity seq cannot serve as a workspace cursor — turns red, and flips to `it`, when the workspace-cursor amendment lands. (`stream-route.test.ts`; Open questions #1)
- 7.35 🚫 Load/soak of the stream under thousands of subscribers — an operational concern for Plan 11's deployment work, not a correctness case here.
- 7.36 ✅ Workflow roster: latest definition per workflow with states and `initialStateId`; guests receive definitions too; non-members and unknown workspaces answer the same 404, no session is 401. (`builder-reads.test.ts`)
- 7.37 ✅ One workflow by id: latest by default, exact `?version=` on request; malformed or non-positive versions are a generic 400, an unpublished version and an unknown workflow are 404. (`builder-reads.test.ts`)
- 7.38 ✅ Ticket types read back from `proj_ticket_types` with name, rank and workflow binding, last definition winning. (`builder-reads.test.ts`)
- 7.39 ✅ Planted defect: the workspace roster withholds guests from a plain member and from a guest — the guest's id appears nowhere in the body — while owners and admins see them with role `guest`. (`builder-reads.test.ts`)
- 7.40 ✅ Planted defect: state occupancy counts every ticket in the workflow's states including one the caller could never see, reports empty states as 0, and answers 404 to members, guests and strangers alike — the number is the workspace's, so only admins hold it. (`builder-reads.test.ts`)
- 7.41 ✅ Planted defect: a custom type defined at the epic rank heads its own group and keeps its children out of the `no-epic` bucket — grouping resolves the rank, never the id `'epic'` (owner sign-off 2026-08-20). (`list.test.ts`)
- 7.42 ✅ Planted defect: the attention windows are INDIAN days. An event at 18:31Z belongs to the next Indian day, so a state entered then is 6 days old and not stale at the 7-day threshold while one entered at 18:35Z the previous day is 7 days old and is — and reading the same world a millisecond either side of 18:30Z moves the due-soon horizon by a whole day, though both reads sit on the same UTC date. Boundaries come from `istDayBounds` compared half-open; `daysInFlight` subtracts `istDayOf` results (owner decision 2026-08-20, "time is Asia/Kolkata"). (`attention.test.ts`)
````

- [ ] **Step 3: Run the full suite one last time**

Run: `pnpm turbo run test typecheck`
Expected: PASS across packages/domain, packages/rule-engine, apps/server; typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add Features.md test-cases/07-api-realtime-search.md
git commit -m "Catalogue the read surface, realtime stream and search in Features.md §7 and forty-one test cases in the same change set as the work — including the pinned series defect that documents what the stream cannot yet promise about resume"
```

---

## Open questions

Flagged rather than silently resolved. Only #1 is blocking-grade; each names the assumption the plan proceeds on.

1. **Per-entity seq cannot serve as a workspace stream cursor (BLOCKING for stream resume correctness).** Plan 1 pins `seq` as per-entity (`UNIQUE (entity_kind, entity_id, seq)`, `nextSeq` per entity), while Plan 4's `visibleEventsFor` reads `WHERE workspace_id = $1 AND seq > $2 ORDER BY seq` — treating `seq` as workspace-orderable. With two entities both carrying seqs 1..n, any resume with `afterSeq > 0` silently skips newer entities' early events; amendment 13's `afterSeq`/`caught-up` inherit the defect. This plan (a) keeps its stream layer cursor-opaque (cursor = max yielded envelope seq — unchanged whatever ordering lands), (b) pins the defect as an executable `it.fails` test (case 7.34) that turns red the day it is fixed, and (c) recommends the coordination-level fix: a `workspace_seq bigint` assigned inside the ingest transaction under a per-workspace advisory lock (alongside Plan 1's per-entity lock), with `visibleEventsFor` filtering and ordering by it. Do NOT paper over it with a max-seq pre-read — out-of-order commits would still skip events. Corollary fixed by the same amendment: purge instructions carry no seq, so a purge-only drain cannot advance the cursor and re-emits purges on the next drain (idempotent, but wasteful). **Since written, the coordination-level fix has landed** — Plan 1 ships `workspace_seq` with its per-workspace advisory lock and Plan 4's `visibleEventsFor` filters and orders by it — so this plan's stream layer needs no change (its cursor was always the max yielded value) and case 7.34's `it.fails` pin flips to `it` at execution, exactly as designed.
2. **Purge/caught-up/error frames gained `workspaceId`.** Amendment 13 lists `{type:'purge', entityId}` and `{type:'caught-up', seq}`, and in the same sentence mandates per-connection multi-workspace subscriptions — without a workspace discriminator those frames are ambiguous on a multiplexed socket. Added additively; the event frame is untouched (the envelope already carries `workspaceId`). Confirm at review.
3. **Route prefix split.** This plan's routes live under `/v1/...` per its assignment; Plan 4 mounted auth under `/api/auth/*` and its ticket reads under `/api/workspaces/...`, and Plan 3's history sits at `/v1/tickets/:id/history`. One prefix should win at integration — mechanical either way; flagged for the coordination doc.
4. **Settings payload carries `dueSoonDays` alongside `staleDays` — SETTLED (owner sign-off 2026-08-20).** The assignment names `{staleDays}` but also demands a workspace-configurable due window; one event with optional keys covers both. The **7-day / 7-day defaults are approved** (`DEFAULT_STALE_DAYS`, `DEFAULT_DUE_SOON_DAYS`); nothing here waits on a decision. Both are counts of **Indian** days, per the same day's decision on time — 7 days back from today means seven IST midnights, not 168 hours.
5. **FTS config is `'simple'`, search is top-50 without pagination.** No English stemming — the audience writes in more than one language, and stemming one language while not stemming others would rank dishonestly. Rank order is `ts_rank_cd` (derived, not stored, never presented as anything but ordering). Pagination can be added later without breaking the shape (`hits` stays an array).
6. **List pins:** hierarchy by parent query (children never inlined); grouping applied per page (a group key may recur across pages; clients merge by key); epic grouping = nearest ancestor-or-self whose type carries the **epic rank**. **SETTLED (owner sign-off 2026-08-20): custom epic-rank types DO head groups.** This was written as an open spec-owner question — whether `groupBy=epic` should match only the built-in id `'epic'` — and the owner ruled that a workspace's own top-rung type ("Initiative", "Campaign") heads its own group exactly as the built-in does. The rank is the concept; `'epic'` is one id of it. Resolution therefore reads `EPIC_RANK` from `BUILTIN_TICKET_TYPE_SEEDS` (never the literal `1`) and joins the workspace's `proj_ticket_types` roster; case 7.41 is the planted defect that bites the old id-matching behaviour. Nothing here waits on Plan 8 any more — the coordination doc's separate sub-task-rank question is unaffected and stays with Plan 8.
7. **Empty board = empty columns.** The board derives its columns from workflows *in use by visible tickets*; a project with no visible tickets answers `columns: []`. If Plan 6 wants default-workflow columns for an empty project, that needs a project→type-roster source that no projection currently owns — Plan 6 should raise it, not invent it.
8. **Unknown-state straggler columns.** A ticket whose `state_id` is absent from its workflow's latest definition gets a fallback column (named by state id, category from `proj_tickets`). Plan 2's forced state-mapping should make this unreachable; the board shows rather than hides if it ever happens. No planted test — the state is contracted-unreachable; the code path is 12 lines and pure.
9. **My Work is per-workspace (`?workspaceId=`).** Cross-workspace aggregation is one call per workspace, client-side — a server-side cross-workspace join would need cross-workspace session scoping this series has not defined.
10. **Preferences are per (user, workspace) with full-replace PUT.** Concurrent editors last-write-win a whole document; acceptable for single-user view preferences. Per-key PATCH can be added additively if Plan 6 finds replace too coarse.
11. **Attention reasons are English template strings** (`In "X" — a blocked state.`). The spec wants reasons "in the user's language"; localisation infrastructure belongs to the client plans — the structured fields (`stateName`, `thresholdDays`, `windowDays`, `due`) carry everything a client needs to re-render the reason localised. Flagged so Plan 6 does not parse the English strings.
12. **Assembler cost.** `assembleTicketCards` runs one batched provenance query plus one `rollupFor` per card (per-viewer restrictedCount cannot be materialised). Board/list pages are ≤200 cards, so worst case is ~201 indexed queries per request — acceptable for v1; a batched `rollupFor` variant is the first optimisation if profiling disagrees.

## Self-review (performed on the finished plan)

1. **Spec §7 views' data needs:** Board (columns = workflow states, provenance on cards, pending/derived progress) → Tasks 7–8; List (customisable columns are client-side — the server ships full cards + per-user column *preferences* via Task 13; switchable grouping → Task 9; nested rows → parentId queries); My Work → Task 11 with Plan 10's extension point; attention strip (blocked/stale/due, workspace-set threshold) → Tasks 3, 4, 12; search + composable filters + saved filters → Tasks 2, 6, 10, 13. Realtime (§3: push over WebSocket, catch-up from last sequence number) → Tasks 14–15. "Recently assigned" pinned section (spec §7 List) is a client arrangement of `ticket.assigned` provenance already present on cards — noted here so Plan 6 knows nothing server-side is missing.
2. **Honesty invariants coverage:** provenance floor → cases 7.14–7.15 (planted two-actor defect, reopen cause); visibility never lies → 7.10, 7.16, 7.21, 7.24, 7.27, 7.30, and the stream's 7.33 (invisible silence + purge-follows-revocation); attention computed-not-stored → 7.28–7.29; nothing invented → due-soon/stale carry the claim and threshold, search rank never presented as truth; preferences-are-not-history → 7.31's zero-ledger-events assertion. Every refusal introduced here (`permission.role` on settings, `invalid_*` request refusals, `not-a-member` stream refusal) has a planted-defect test.
3. **Placeholder scan:** no TBDs, no "add validation", no "similar to Task N" — every code step carries the code; cross-plan touchpoints name a concrete assumed shape plus an adaptation rule in Cross-plan path assumptions.
4. **Type consistency:** `visibleTicketsWhere(eff, userId, params)` identical in Tasks 5, 8, 9, 10, 11, 12; `SqlParams.add/toArray` throughout; `assembleTicketCards(db, viewerId, rows)` consumed by four routes with the same `ProjTicketRow`/`PROJ_TICKET_COLUMNS`; `TicketCard.rollup` mapping from Plan 4's `RollupView {total, terminal, restrictedCount}` defined once (Task 7) and asserted in 7.14; stream frame types defined once in domain and used verbatim by hub, route, and tests; `getWorkspaceSettings` return type is Task 3's `WorkspaceSettings` everywhere; consumed signatures match the siblings' Produces blocks (`canSee(db, userId, ticketId)`, `visibleEventsFor(db, userId, workspaceId, afterSeq)`, `rollupFor(db, viewerId, ticketId)`, `getWorkflowDefFromProjection(db, workflowId, version?)`, `makeRequireSession(auth)`, `onEventCommitted(listener) → unsubscribe`).
5. **Coordination-amendment fidelity:** amendment 9 (blocked flag read from defs; builder exposes it in Plan 8) → Tasks 2, 7, 12; amendment 12 (`docToPlainText` in domain, dependency-free) → Task 1; amendment 13 (frames, `visibleEventsFor` + `onEventCommitted` backing) → Tasks 14–15 with the additive `workspaceId` flagged; amendment 14 (preferences as rows, with the required one-sentence justification) → Task 13; owner reopen decision (`cause` rendered from provenance) → Task 7.

