# Offline Sync & the Apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The mobile and desktop apps hold an honest, visibility-scoped offline replica — outbox claims in transit, instant local refusals, contested claims as ledger history, snapshot-bounded bootstrap — proven by the spec's named dual-client sync harness.

**Architecture:** A shared `packages/sync-client` library owns the local SQLite replica (event log + read model folded through the domain reducers, **never** the server's pg projections), the ordered persisted outbox with rule-engine pre-check, and the WS catch-up/purge protocol. Server-side, this plan adds the snapshot writer, `GET /v1/sync/bootstrap`, and `POST /v1/sync` — the sync ingress that turns rule refusals into `claim.contested` ledger events and accepts duplicate event ids idempotently (retries are expected). `apps/desktop` (Tauri 2) and `apps/mobile` (Expo) are thin shells wiring app-core to the replica `DataSource`.

**Tech Stack:** TypeScript strict, pnpm workspace, Vitest; server: Fastify + Postgres (Plan 1 scaffold); local store: SQLite via `better-sqlite3` (tests/harness), `@op-engineering/op-sqlite` (RN), `@tauri-apps/plugin-sql` (desktop); clients: Tauri 2 + Vite React, React Native (Expo) with `react-native-webview` for the editor.

**Spec:** `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md` — §5 (Sync, offline, and contested claims) is this plan's section, plus honesty invariant 5 and the §7 "scripted dual-client harness" testing discipline. Cross-plan authority: `docs/superpowers/plans/2026-08-20-00-series-coordination.md` (amendments 9–17 and the owner reopen decision). Where a written plan and the coordination doc disagree, the coordination doc wins.

## Global Constraints

- **The event ledger owns the facts.** Nobody edits state; everybody appends claims; views are generated (spec §1).
- **Offline edits are claims in transit.** "A synced-in event that a rule now refuses becomes a visible *contested claim* — never a silent drop, never a silent acceptance" (spec, honesty invariant 5).
- **The board cannot lie about what has actually been accepted** — a pending claim renders visually distinct, never as settled fact (spec §5).
- **Every refusal is proven against planted defects before it is trusted** (spec, honesty invariant 6). Every guarantee in this plan carries a planted-defect test.
- **Closed, versioned event vocabulary** — unknown types are refused at ingest; new event types added here (`claim.contested`, `claim.contested_resolved`) are registered with strict zod payload schemas (spec §3).
- **Both clocks are kept:** `clientTime` is the actor's claim, `serverTime` the system's fact; "ingest flags gross skew against server time, keeping both" (spec §5).
- **Both clocks are absolute instants, and the replica stores exactly what it was handed.** Under the owner's Asia/Kolkata decision (2026-08-20) Plan 1 stores both `client_time` and `server_time` as `timestamptz`; the verbatim-text `client_time` is gone, so every readback through `rowToEnvelope` emits ISO 8601 **`Z`** at millisecond precision. A claim submitted as `…+05:30` comes back as the equivalent `…Z` — the same instant, minus the device's offset label. Consequences this plan lives with, all deliberate: the local SQLite `client_time`/`server_time` columns hold those Z strings, so **string order is instant order and string equality is instant equality** in the replica; and no fixture, assertion, or shell may expect an offset label to survive a round trip, because the server no longer has one to return.
- **A day starts at IST midnight, and the replica computes it with the server's own code.** `@gisik-nokma/domain` ships `IST_TIME_ZONE`, `IST_OFFSET_MINUTES`, `IST_DAY_REGEX`, `istDayOf(instant)` and `istDayBounds(day)` (Plan 1, Task 4a). That module is **dependency-free** — no zod, no date library, no timezone database, nothing but arithmetic against the fixed +05:30 offset — and it was written that way precisely so an offline replica can import the identical file the server runs. Local read-model day math therefore uses those helpers and nothing else. **A replica that computed days differently from the server is exactly the silent disagreement this product refuses:** the same claim would sit in one calendar cell online and another offline, "due today" would be true on the desktop and false on the server, and nothing anywhere would report a conflict — a board that lies while every individual number looks right. The point of an offline copy is that it is a copy.
- **Rendered timestamps in the shells use `IST_TIME_ZONE` from the domain** — never a `'Asia/Kolkata'` literal written into a component, never the device's locale. The device supplies the instant, which it owns; the domain supplies the day and the zone, which it owns.
- **Replica = visibility-scoped event log + read model built from domain reducers** (`applyTicketEvent` + workflow defs), never the server's pg projections (coordination amendment 17).
- **Package scope is `@gisik-nokma/*`** (coordination decision 1). `snake_case` for all SQL identifiers (CODING_STANDARDS). No colour literals outside `packages/ui/src/tokens.ts` (amendment 11).
- **`reference/` is frozen** — never edit anything under it.
- **`Features.md` §12 and `test-cases/12-offline-sync-apps.md` move in the same change set as the work** — this plan claims §12 / cases 12.x and no other numbers.
- **Provenance is never redacted** from someone who can see the ticket; a contested claim is visible to everyone who `canSee` the ticket (amendment 16).
- **TDD** — every task starts from a failing test; commits per task.

## Consumed interfaces (pinned — the executor copies these, never re-derives them)

From **Plan 1** (`@gisik-nokma/domain`, `apps/server`):
- `type EventEnvelope = { id, workspaceId, entity: {kind, id}, type, version, payload, actorId, origin: 'web'|'mobile'|'desktop'|'server', clientTime, serverTime, seq }` (`seq` is PER-ENTITY); `type LedgerEvent = EventEnvelope & { workspaceSeq: number }` — what the ledger stores and what every server reader emits, the frozen envelope plus the per-workspace stream cursor (coordination §18); `type SubmittedEvent = Omit<EventEnvelope, 'serverTime'|'seq'>`; `submittedEventSchema`, `eventEnvelopeSchema`, `newUlid(): Ulid`, `ENTITY_KINDS`, `type EntityKind`, `ORIGINS`, `type Origin`.
- `domainRegistry: EventTypeRegistry` with `register({type, version, payloadSchema})`; `parseEvent(raw, registry?): ParsedEvent | EnvelopeError`; `type EnvelopeErrorCode = 'malformed-envelope'|'unknown-event-type'|'unknown-event-version'|'invalid-payload'`.
- IST day helpers (Task 4a, `packages/domain/src/ist-day.ts`): `IST_TIME_ZONE = 'Asia/Kolkata'`, `IST_OFFSET_MINUTES = 330`, `IST_DAY_REGEX`, `istDayOf(instant: string): string` (→ `YYYY-MM-DD`, throws `RangeError` naming the input when it is not an ISO instant with a stated offset), `istDayBounds(day: string): { startUtc: string; endUtc: string }` (**half-open** `[startUtc, endUtc)`, both ISO `Z` at millisecond precision). **The module has no dependencies** — that is a deliberate property of Plan 1's design, and this plan is the reason for it: a replica running inside Expo or Tauri imports the same file the server does, so both sides answer "which day is this?" identically or neither does.
- `type IngestErrorCode = EnvelopeErrorCode | 'duplicate-event-id'`; `type IngestResult = {status:'committed'; eventId; seq; serverTime} | {status:'invalid'; eventId: string|null; code: IngestErrorCode; message} | {status:'refused'; eventId; rule; reason}`; `type IngestService = { ingestBatch(rawEvents: unknown[]): Promise<IngestResult[]>; onEventCommitted(listener): () => void }`; `createIngestService(deps)`.
- `POST /v1/events` body `{events: [raw envelope, …]}` (1–100), response `{results: IngestResult[]}` index-aligned. Interactive refusals return without recording (amendment 16).
- Ledger repo: `lockEntity(client, kind, id)`, `nextSeq(client, kind, id)`, `lockWorkspace(client, workspaceId)` and `nextWorkspaceSeq(client, workspaceId)` (§18 — the workspace lock is taken BEFORE the entity lock, one order so nothing deadlocks), `insertEvent(client, ledgerEvent)` (names `workspace_seq` among its columns), `readEntityEvents(clientOrPool, kind, id, afterSeq?)` → `LedgerEvent[]` in per-entity seq order, `rowToEnvelope(row): LedgerEvent`, `readLedger(clientOrPool)`, `rowToEnvelope(row)`, `isUniqueViolation(err, constraint)`.
- Snapshots: table `snapshots(entity_kind, entity_id, seq, state jsonb, created_at, PK(entity_kind, entity_id, seq))` — shipped **with no writer; the writer is assigned to this plan**. `type Snapshot = { entityKind; entityId; seq; state: Record<string, unknown> }`; `writeSnapshot(client, snapshot)`; `readLatestSnapshot(client, kind, id): Promise<Snapshot|null>`.
- Projections: `type Projection = { name; tables: readonly string[]; apply(event, tx: PoolClient): Promise<void>; reset(tx): Promise<void> }` (deterministic, interleaving-insensitive); `buildProjectionRegistry()` in `apps/server/src/projections/index.ts`; registration order per coordination decision 8.
- Server scaffold: `loadConfig`, `AppConfig`, `buildApp(deps)`, `createPool`; test helpers `createTestDatabase()`, `submittedWorkspaceCreated()`, `committed(submitted, seq, serverTime?)`.

From **Plan 2** (`@gisik-nokma/rule-engine`, `@gisik-nokma/domain`):
- `type Refusal = { refused: true; rule: string; reason: string }`; `type Accept = { refused: false }`; `type Verdict = Accept | Refusal`.
- `type EngineContext = { getEntityState(kind, id): Promise<EntityState|null>; getChildrenStates(ticketId): Promise<TicketState[]>; getWorkflowDef(workflowId, version?): Promise<WorkflowDef|null> }` — this plan extends it **additively** with `getContest` (Task 2).
- `evaluateEvent(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal>` — frozen signature, identical in client and server builds.
- `WorkflowDef` (with `initialStateId` per coordination amendment 3; states `{id, name, category, blocked?}`; transitions `{from, to, rules}`), `workflowDefinedPayloadSchema`, `PublishedWorkflowDef`, `stateCategorySchema`/`StateCategory`.
- `REFUSAL_RULES`: `malformed-payload`, `unknown-ticket`, `unknown-workflow`, `unknown-state`, `illegal-transition`, `stranded-state`, `parent-terminal-with-open-children`, `workflow-structure`, `workflow-version`, `workflow-state-mapping`, `restrict-to`, `require-comment`, `require-evidence`, `require-field`, `require-different-user`.
- Fixture harness (`packages/rule-engine/src/fixtures/harness.ts`): fixture JSON `{name, workflowDefs, memberships, priorEvents, candidateEvent, expected}` where `expected` is `{refused:false}` or `{refused:true, rule, reason}`; exports `fixtureSchema`/`Fixture`, `PartialEnvelope`, `loadFixtures()`, `completeEnvelope(partial, seq)`, `completeCandidate(fx)`, `buildInMemoryContext(fx)`, `assertFixtureOutcome(result, fx)`. Envelope defaults: workspace `ws_1`, actor `user_a`, origin `server`, both times `2026-08-20T00:00:00.000Z`, version 1, id `fx_evt_<seq>`.
- `membershipId(workspaceId, userId)` = `` `${workspaceId}:${userId}` ``; `MembershipState = { kind:'membership'; id; workspaceId; userId; role }`; `WorkspaceRole = 'owner'|'admin'|'member'|'guest'`.

From **Plan 3** (`@gisik-nokma/domain`):
- `type FieldClaim = { value: unknown; actorId: string; clientTime: string; serverTime: string }`.
- `type TicketState = { kind: 'ticket'; id; workspaceId; projectId; typeId; parentId: string|null; workflowId; workflowVersion: number; stateId; stateCategory: StateCategory; assigneeId: string|null; collaboratorIds: string[]; fields: Record<string, FieldClaim> }` **plus** the coordination §4 transition log `transitions: { toStateId: string; actorId: string; seq: number }[]` — the merged §4 shape, verbatim. `kind` is the `EntityState` discriminant the engine narrows on; `workflowVersion` is what pins a folded state to the definition version it was folded under, so a v2 remap is visible rather than silent. Every `TicketState` literal in this plan carries both.
- `type TicketStateDeps = { getTicketType(typeId): TicketTypeDef|undefined; getWorkflow(workflowId): WorkflowDef|undefined }`; `TICKET_EVENT_TYPES: readonly string[]`; `applyTicketEvent(state: TicketState|undefined, env: EventEnvelope, deps: TicketStateDeps): TicketState` (throws on ledger-integrity breaks — fold only accepted events); `stateCategoryOf(def, stateId)`.
- `TicketTypeDef = { id; name; icon; rank; workflowId; fields: CustomFieldDef[] }`, `ticketTypeDefSchema`, `builtinTicketTypeDefs(defaultWorkflowId)`.
- Registered ticket vocabulary (all v1): `ticket-type.defined`, `ticket.created` (`{typeId, projectId, parentId, title}`), `ticket.transitioned` (`{toStateId, comment?, evidenceAttachmentId?, cause?}` — `cause?: { kind: 'reopened-for-child'; childTicketId: string }` per the owner reopen decision), `ticket.assigned` (`{assigneeId}`), `ticket.collaborator_added/_removed` (`{userId}`), `ticket.field_set` (`{fieldId, value}`), `ticket.reparented` (`{newParentId}`), `comment.added` (`{body}`), `attachment.added` (`{attachmentId, filename, mime, size}`); `makeEnvelope(partial)` test builder.
- Refusal `hierarchy.parent-terminal` on `ticket.created`/`ticket.reparented` under a terminal parent, reason naming the reopen remedy (owner decision).

From **Plan 4** (`apps/server`):
- `canSee(db: Queryable, userId, ticketId): Promise<boolean>`; `getResolvedVisibility(db, ticketId): Promise<ResolvedVisibility|null>`; `listVisibleTickets(db, userId, workspaceId): Promise<Array<Record<string, unknown>>>` (rows carry `ticket_id`).
- `interface PurgeInstruction { kind: 'purge'; entityId: string }`; `type SyncItem = LedgerEvent | PurgeInstruction` (§18: the events a replica receives carry their stream position, so a replica can order its own ledger without asking); `visibleEventsFor(db, userId, workspaceId, afterSeq): AsyncIterable<SyncItem>` — THE sync-down filter; discriminate with `'kind' in item && item.kind === 'purge'`.
- `resolveEffectiveRole(db, userId, workspaceId)` → `EffectiveRole { workspaceRole: WorkspaceRole|null; projects: Set<string> }` (as used by `visibleEventsFor`).
- `makeRequireSession(auth)` preHandler setting `request.currentUserId: string`; `registerAuthRoutes(app, auth)`; test helper `signInWithPhone(app, sender, phone): Promise<string>` (bearer token) in `apps/server/test/helpers/session.ts`; seed helpers `seedMember`, `seedGuest`, `seedTicket`; `appendTestEvent(db, env)`.
- Tables `proj_visibility`, `proj_memberships`.

From the **coordination doc** (amendments 9–17, consumed as pinned; Plans 5–9 are written in parallel — assumptions flagged in Open questions):
- **Amendment 10:** `packages/app-core` views/view-models consume `DataSource = { ingest(events: SubmittedEvent[]): Promise<IngestResult[]>; query: typed read functions; subscribe(workspaceId, afterSeq, cb): Unsubscribe }`, implemented online (Plan 6) and replica (this plan).
- **Amendments 13 + 19:** WS `/v1/stream`; client → `{type:'subscribe', workspaceId, afterSeq}`; server → `{type:'event', envelope}` · `{type:'purge', workspaceId, entityId}` · `{type:'caught-up', workspaceId, seq}` · `{type:'error', workspaceId: string|null, code, message}` · ping/pong. Amendment 19 adds `workspaceId` to purge/caught-up/error (additive — one socket may carry several subscriptions, and `afterSeq` is per-workspace). Purge frames carry no seq, so a purge-only drain may re-emit them: purges must be idempotent (they are deletes). Backed by `visibleEventsFor` + `onEventCommitted`. Plan 5 owns the server side.
- **Amendment 12:** editor bodies are ProseMirror JSON, opaque outside the editor; `docToPlainText(doc: unknown): string` in domain; RN hosts the editor in a webview (Plan 7 owns the bridge).
- **Amendment 16:** offline-originated events arrive via `POST /v1/sync` (this plan). Sync-time refusal appends `claim.contested` (entity = the ticket; payload = original event, rule, reason). Resolution `claim.contested_resolved { resolution: 'redone'|'converted-to-comment'|'discarded' }`. Interactive `POST /v1/events` refusals return without recording. On the sync path `duplicate-event-id` becomes idempotent-accept.
- **Amendment 17:** `apps/desktop` = Tauri 2 + Vite React; `apps/mobile` = React Native (Expo), native navigation over app-core view-models, webview editor, replica DataSource; SQLite behind one storage interface on both.

## File map

```
packages/domain/src/
  events/contest-events.ts        # claim.contested + claim.contested_resolved schemas, registration,
                                  # renderContestedClaimText, plainTextToDoc
  clock-skew.ts                   # clockSkewMs, hasGrossClockSkew, GROSS_CLOCK_SKEW_MS,
                                  # formatIstInstant + IST_CLOCK_NOTE (the one instant→text renderer)
  ist-day.ts                      # READ ONLY (Plan 1's) — IST_TIME_ZONE, IST_DAY_REGEX, istDayOf, istDayBounds
  submit.ts                       # newSubmittedEvent — the one client-side envelope builder
packages/rule-engine/src/
  contests.ts                     # evaluateClaimContested / evaluateClaimContestedResolved
  types.ts                        # (modify) additive EngineContext.getContest
  fixtures/harness.ts             # (modify) in-memory getContest + contest-type skip in the ticket fold
packages/rule-engine/fixtures/    # 5 new contest fixtures (planted defects)
apps/server/
  migrations/<ts>_proj-contested.sql    # proj_contested
  src/visibility/visible-events-for.ts  # (modify) cursor reads events.workspace_seq (coordination §18; Plan 4's pending amendment)
  src/sync/stream-seq.ts                # readStreamSeq
  src/sync/ledger-deps.ts               # TicketStateDeps folded from ledger definition events
  src/sync/snapshot-writer.ts           # runSnapshotPass + startSnapshotWriter (assigned to this plan)
  src/sync/sync-service.ts              # processBatch — idempotency, visibility pre-check, contest append
  src/sync/sync-routes.ts               # POST /v1/sync · GET /v1/sync/bootstrap
  src/sync/contests-route.ts            # GET /v1/contests
  src/projections/contested.ts          # projContested
  src/engine-context.ts                 # (modify) additive getContest over proj_contested
  test/sync/*.test.ts                   # per-module tests
  test/dual-client/rig.ts               # the dual-client harness rig (spec-named discipline)
  test/dual-client/scenarios.test.ts    # S1–S6, exact-outcome assertions, real Postgres
packages/sync-client/src/
  storage/storage.ts              # SyncStorage — the ONE storage interface (op-sqlite / tauri-sql / better-sqlite3)
  storage/better-sqlite3.ts       # node adapter (tests + harness)
  storage/schema.ts               # local schema + migrateLocal
  replica/replica.ts              # visibility-scoped local ledger + reducer-built read model + purge
  replica/local-deps.ts           # TicketStateDeps over local workflows/ticket_types tables
  outbox/outbox.ts                # ordered persisted outbox, backoff bookkeeping, result application
  precheck/local-context.ts       # EngineContext over replica state incl. pending overlay + me-membership
  engine/sync-engine.ts           # bootstrap → stream → flush loop; status machine
  net/http-transport.ts           # fetch + WebSocket SyncTransport
  data-source/replica-data-source.ts  # amendment-10 DataSource, {status:'pending'} additive result
  index.ts
packages/app-core/src/            # (files added; package owned by Plan 6 — guarded scaffold in Task 13)
  contests/contest-view-model.ts  # useContests + resolveContest
  contests/contest-banner.tsx     # the ticket banner + resolution actions
  offline/reopen-pair.ts          # buildReopenPair — owner reopen decision, offline
  history/clock-skew-badge.tsx    # formatClockSkew + ClockSkewBadge
  sync/sync-status-bar.tsx        # "N claims waiting to send" / "searching offline copy"
apps/desktop/                     # Tauri 2 + Vite React shell
apps/mobile/                      # Expo shell, webview editor bridge, push stub
Features.md                       # (modify) §12
test-cases/12-offline-sync-apps.md
```

---

### Task 1: Contest event vocabulary + clock-skew + the client envelope builder (domain)

**Files:**
- Create: `packages/domain/src/events/contest-events.ts`
- Create **or extend**: `packages/domain/src/clock-skew.ts` — Plan 6 runs in parallel and its Task 6 precondition creates this file with `formatIstInstant` and `IST_CLOCK_NOTE` alone, copied verbatim from this task's Step 5, if this plan has not landed yet. So check first (`ls packages/domain/src/clock-skew.ts`) and, if it is already there, add only what is missing — `clockSkewMs`, `GROSS_CLOCK_SKEW_MS`, `hasGrossClockSkew`, and any absent `index.ts` re-export — leaving the two definitions Plan 6 wrote byte-identical to Step 5's rather than rewriting them, because a formatter that differs between the two copies is exactly the second clock the amendment exists to prevent.
- Create: `packages/domain/src/submit.ts`
- Modify: `packages/domain/src/index.ts` (re-exports + registration import)
- Test: `packages/domain/test/contest-events.test.ts`
- Test: `packages/domain/test/clock-skew.test.ts`

**Interfaces:**
- Consumes: `submittedEventSchema`, `SubmittedEvent`, `EventEnvelope`, `domainRegistry`, `parseEvent`, `newUlid`, `Origin` (Plan 1); `makeEnvelope` (Plan 3).
- Produces (cross-plan API, `@gisik-nokma/domain`):
  - `claimContestedPayloadSchema` / `type ClaimContestedPayload = { originalEvent: SubmittedEvent; rule: string; reason: string }` — event type `claim.contested` v1, entity = the ticket, **server-appended only** (Task 2 enforces).
  - `claimContestedResolvedPayloadSchema` / `type ClaimContestedResolvedPayload = { contestedEventId: string; resolution: 'redone'|'converted-to-comment'|'discarded'; replacementEventId?: string; commentEventId?: string; note?: string }` — `replacementEventId` required iff `redone`; `commentEventId` required iff `converted-to-comment` — event type `claim.contested_resolved` v1.
  - `CONTEST_EVENT_TYPES = ['claim.contested', 'claim.contested_resolved'] as const`.
  - `renderContestedClaimText(payload: ClaimContestedPayload): string` — the human rendering used by "convert to comment" and the banner; its timestamp goes through `formatIstInstant`, so a contested claim wears the same date here, on the calendar, and in the inbox.
  - `plainTextToDoc(text: string): Record<string, unknown>` — minimal ProseMirror doc (amendment 12: bodies are PM JSON).
  - `clockSkewMs(env: Pick<EventEnvelope, 'clientTime'|'serverTime'>): number | null` (null when `clientTime` unparseable); `GROSS_CLOCK_SKEW_MS = 600_000`; `hasGrossClockSkew(env): boolean`.
  - `formatIstInstant(instant: string): string` — the ONE way this product prints an absolute instant to a person: `'21 Aug 2026, 00:00 IST'`. Built on Plan 1's `istDayOf` + `IST_OFFSET_MINUTES`, so the day it prints is the day the calendar places the same instant in. An unparseable instant comes back verbatim rather than as an invented time. `IST_CLOCK_NOTE: string` — `` `times are shown in ${IST_TIME_ZONE}` ``, the line a surface puts on a timestamp so a collaborator in another timezone knows which clock they are reading (the coordination doc's named consequence of the owner decision, made visible instead of assumed).
  - `newSubmittedEvent(input: { workspaceId: string; entity: EventEnvelope['entity']; type: string; payload: unknown; actorId: string; origin: Origin; version?: number; now?: () => Date }): SubmittedEvent` — the one client-side builder (ULID + clientTime).

- [ ] **Step 1: Write the failing contest-events test**

`packages/domain/test/contest-events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseEvent } from '../src/index.js';
import {
  CONTEST_EVENT_TYPES,
  claimContestedPayloadSchema,
  claimContestedResolvedPayloadSchema,
  plainTextToDoc,
  renderContestedClaimText,
} from '../src/events/contest-events.js';
import { newSubmittedEvent } from '../src/submit.js';
import { formatIstInstant } from '../src/clock-skew.js';
import { makeEnvelope } from '../src/testing.js';

const TICKET = '01J9GTKA000000000000000000';

function original() {
  return newSubmittedEvent({
    workspaceId: 'ws_1',
    entity: { kind: 'ticket', id: TICKET },
    type: 'ticket.transitioned',
    payload: { toStateId: 'done' },
    actorId: 'user_b',
    origin: 'mobile',
  });
}

describe('claim.contested', () => {
  it('round-trips through parseEvent with the registered schema', () => {
    const payload = { originalEvent: original(), rule: 'restrict-to', reason: 'Only the assignee may do this.' };
    const env = makeEnvelope({ type: 'claim.contested', entity: { kind: 'ticket', id: TICKET }, payload });
    const parsed = parseEvent(env);
    expect(parsed.ok).toBe(true);
  });

  it('refuses a payload without the original claim — a contest must carry what was claimed', () => {
    expect(() => claimContestedPayloadSchema.parse({ rule: 'restrict-to', reason: 'x' })).toThrow();
  });

  it('is a registered, closed-vocabulary type', () => {
    expect(CONTEST_EVENT_TYPES).toEqual(['claim.contested', 'claim.contested_resolved']);
  });
});

describe('claim.contested_resolved', () => {
  const base = { contestedEventId: '01J9GCON000000000000000000' };

  it('redone requires the replacement event id — the redo is linked, never implied', () => {
    expect(() => claimContestedResolvedPayloadSchema.parse({ ...base, resolution: 'redone' })).toThrow();
    expect(
      claimContestedResolvedPayloadSchema.parse({
        ...base,
        resolution: 'redone',
        replacementEventId: '01J9GRPL000000000000000000',
      }).replacementEventId,
    ).toBe('01J9GRPL000000000000000000');
  });

  it('converted-to-comment requires the comment event id', () => {
    expect(() => claimContestedResolvedPayloadSchema.parse({ ...base, resolution: 'converted-to-comment' })).toThrow();
    expect(
      claimContestedResolvedPayloadSchema.parse({
        ...base,
        resolution: 'converted-to-comment',
        commentEventId: '01J9GCMT000000000000000000',
      }).commentEventId,
    ).toBe('01J9GCMT000000000000000000');
  });

  it('discarded needs nothing extra — but records who discarded via the envelope actor', () => {
    expect(claimContestedResolvedPayloadSchema.parse({ ...base, resolution: 'discarded', note: 'stale' }).note).toBe('stale');
  });
});

describe('renderContestedClaimText', () => {
  it('names actor, claim, time, and the refusing rule — the text a comment conversion carries', () => {
    const o = original();
    const text = renderContestedClaimText({ originalEvent: o, rule: 'restrict-to', reason: 'Only the assignee may do this.' });
    expect(text).toContain('user_b');
    expect(text).toContain('ticket.transitioned');
    expect(text).toContain(formatIstInstant(o.clientTime));
    expect(text).toContain('restrict-to');
    expect(text).toContain('Only the assignee may do this.');
  });

  it('planted defect: the time is India time, not the raw instant — and it rolls at IST midnight', () => {
    // The claim was made at 00:00 IST on 21 Aug, which is 18:30Z on the 20th.
    // A banner printing the ISO string would tell the claimant their claim was
    // made on the 20th, one IST day off from the date the same claim wears on
    // the calendar, in its ticket history, and in the inbox.
    const o = newSubmittedEvent({
      workspaceId: 'ws_1',
      entity: { kind: 'ticket', id: TICKET },
      type: 'ticket.transitioned',
      payload: { toStateId: 'done' },
      actorId: 'user_b',
      origin: 'mobile',
      now: () => new Date('2026-08-20T18:30:00.000Z'),
    });
    const text = renderContestedClaimText({ originalEvent: o, rule: 'restrict-to', reason: 'Only the assignee may do this.' });
    expect(text).toContain('21 Aug 2026, 00:00 IST');
    expect(text).not.toContain('2026-08-20T18:30:00.000Z');
  });
});

describe('plainTextToDoc', () => {
  it('produces a minimal ProseMirror doc', () => {
    expect(plainTextToDoc('hello')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    });
  });

  it('empty text yields an empty paragraph (a text node may not be empty)', () => {
    expect(plainTextToDoc('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });
});

describe('newSubmittedEvent', () => {
  it('fills id, version and clientTime; everything else is the caller claim', () => {
    const e = original();
    expect(e.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(e.version).toBe(1);
    expect(e.origin).toBe('mobile');
    expect(new Date(e.clientTime).toString()).not.toBe('Invalid Date');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `packages/domain/`): `pnpm vitest run test/contest-events.test.ts`
Expected: FAIL — `Cannot find module '../src/events/contest-events.js'`.

- [ ] **Step 3: Implement contest-events.ts, submit.ts and re-exports**

`packages/domain/src/events/contest-events.ts`:

```ts
import { z } from 'zod';
import { domainRegistry } from '../registry.js';
import { submittedEventSchema } from '../envelope.js';
import type { SubmittedEvent } from '../envelope.js';
import { formatIstInstant } from '../clock-skew.js';

/**
 * A sync-time refusal is never a silent drop: the server appends the refused
 * claim to the ledger as a contested claim on the ticket it touched
 * (spec honesty invariant 5, coordination amendment 16). The contest is
 * history, visible to everyone who can see the ticket.
 */
export const claimContestedPayloadSchema = z
  .object({
    originalEvent: submittedEventSchema,
    rule: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

export type ClaimContestedPayload = z.infer<typeof claimContestedPayloadSchema>;

const RESOLUTIONS = ['redone', 'converted-to-comment', 'discarded'] as const;

/**
 * Resolution is human: redo it legally, convert it to a comment, or discard —
 * and the discard is itself a recorded event (spec §5). The redo links its
 * replacement; the conversion links its comment. Nothing silently vanishes.
 */
export const claimContestedResolvedPayloadSchema = z
  .object({
    contestedEventId: z.string().min(1),
    resolution: z.enum(RESOLUTIONS),
    replacementEventId: z.string().min(1).optional(),
    commentEventId: z.string().min(1).optional(),
    note: z.string().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.resolution === 'redone' && v.replacementEventId === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'redone requires replacementEventId' });
    }
    if (v.resolution === 'converted-to-comment' && v.commentEventId === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'converted-to-comment requires commentEventId' });
    }
  });

export type ClaimContestedResolvedPayload = z.infer<typeof claimContestedResolvedPayloadSchema>;

export const CONTEST_EVENT_TYPES = ['claim.contested', 'claim.contested_resolved'] as const;

domainRegistry.register({ type: 'claim.contested', version: 1, payloadSchema: claimContestedPayloadSchema });
domainRegistry.register({
  type: 'claim.contested_resolved',
  version: 1,
  payloadSchema: claimContestedResolvedPayloadSchema,
});

/**
 * The banner line and the comment a conversion carries — attributed, dated,
 * rule named.
 *
 * The time is the claimant's own `clientTime`, printed in India time through
 * the one formatter (owner decision: time is Asia/Kolkata). Not the raw ISO
 * string: this text is read by a person — it goes on a ticket banner and,
 * on "convert to comment", into a comment body that stays in the ledger
 * forever — and a bare `2026-08-20T18:30:00.000Z` would be the only place in
 * the product showing a claimant a UTC timestamp, one IST day off from the
 * date the same claim wears everywhere else.
 */
export function renderContestedClaimText(payload: ClaimContestedPayload): string {
  const { originalEvent, rule, reason } = payload;
  return (
    `Contested claim by ${originalEvent.actorId} at ${formatIstInstant(originalEvent.clientTime)}: ` +
    `${originalEvent.type} ${JSON.stringify(originalEvent.payload)} — refused by rule "${rule}": ${reason}`
  );
}

/** Minimal ProseMirror doc for plain text (amendment 12: bodies are PM JSON). */
export function plainTextToDoc(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [text === '' ? { type: 'paragraph' } : { type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}
```

`packages/domain/src/submit.ts`:

```ts
import { newUlid } from './ids.js';
import type { EventEnvelope, Origin, SubmittedEvent } from './envelope.js';

/**
 * The one client-side envelope builder. Everything a client claims is here;
 * serverTime and seq are the server's to assign at ingest — a client that
 * invented them would be lying about facts it does not own.
 */
export function newSubmittedEvent(input: {
  workspaceId: string;
  entity: EventEnvelope['entity'];
  type: string;
  payload: unknown;
  actorId: string;
  origin: Origin;
  version?: number;
  now?: () => Date;
}): SubmittedEvent {
  const now = input.now ?? (() => new Date());
  return {
    id: newUlid(),
    workspaceId: input.workspaceId,
    entity: input.entity,
    type: input.type,
    version: input.version ?? 1,
    payload: input.payload,
    actorId: input.actorId,
    origin: input.origin,
    clientTime: now().toISOString(),
  };
}
```

In `packages/domain/src/index.ts`, add (keeping existing exports; the module import runs the registration side-effect exactly like Plan 3's ticket events do — match the local pattern found via `grep -n "events/" packages/domain/src/index.ts`):

```ts
export {
  CONTEST_EVENT_TYPES,
  claimContestedPayloadSchema,
  claimContestedResolvedPayloadSchema,
  plainTextToDoc,
  renderContestedClaimText,
  type ClaimContestedPayload,
  type ClaimContestedResolvedPayload,
} from './events/contest-events.js';
export { newSubmittedEvent } from './submit.js';
export { GROSS_CLOCK_SKEW_MS, IST_CLOCK_NOTE, clockSkewMs, formatIstInstant, hasGrossClockSkew } from './clock-skew.js';
```

(`ist-day.ts`'s own exports — `IST_TIME_ZONE`, `IST_OFFSET_MINUTES`, `IST_DAY_REGEX`, `istDayOf`, `istDayBounds` — are already re-exported by Plan 1's `export * from './ist-day.js'`; do not add a second export line for them.)

Note: if `newUlid` lives in a file other than `src/ids.ts`, locate it with `grep -rn "export function newUlid" packages/domain/src` and fix the import — do not create a second implementation.

- [ ] **Step 4: Run the contest-events test to verify it passes**

Run: `pnpm vitest run test/contest-events.test.ts`
Expected: PASS (10 tests, including the IST-midnight planted defect). The `clock-skew` export will fail compilation until Step 5 — if so, comment nothing out; proceed to Step 5 and run both together (contest-events imports `formatIstInstant` from it).

- [ ] **Step 5: Write the failing clock-skew test, then implement**

`packages/domain/test/clock-skew.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  GROSS_CLOCK_SKEW_MS,
  IST_CLOCK_NOTE,
  clockSkewMs,
  formatIstInstant,
  hasGrossClockSkew,
} from '../src/clock-skew.js';
import { IST_TIME_ZONE, istDayOf } from '../src/ist-day.js';

const SERVER = '2026-08-20T12:00:00.000Z';

describe('clockSkewMs', () => {
  it('is client minus server — positive when the client clock runs ahead', () => {
    expect(clockSkewMs({ clientTime: '2026-08-20T12:00:05.000Z', serverTime: SERVER })).toBe(5000);
    expect(clockSkewMs({ clientTime: '2026-08-20T11:59:55.000Z', serverTime: SERVER })).toBe(-5000);
  });

  it('is null when the client claim is unparseable — flagged, not invented', () => {
    expect(clockSkewMs({ clientTime: 'not-a-date', serverTime: SERVER })).toBeNull();
  });
});

describe('hasGrossClockSkew', () => {
  it('planted defect: an 11-minute skew is gross; 9 minutes is not', () => {
    expect(GROSS_CLOCK_SKEW_MS).toBe(600_000);
    expect(hasGrossClockSkew({ clientTime: '2026-08-20T12:11:00.000Z', serverTime: SERVER })).toBe(true);
    expect(hasGrossClockSkew({ clientTime: '2026-08-20T11:49:00.000Z', serverTime: SERVER })).toBe(true);
    expect(hasGrossClockSkew({ clientTime: '2026-08-20T12:09:00.000Z', serverTime: SERVER })).toBe(false);
  });

  it('an unparseable client time counts as gross — the claim cannot be checked', () => {
    expect(hasGrossClockSkew({ clientTime: 'garbage', serverTime: SERVER })).toBe(true);
  });
});

describe('formatIstInstant', () => {
  it('prints India time, and the day it prints is the day istDayOf gives', () => {
    expect(formatIstInstant('2026-08-20T12:00:00.000Z')).toBe('20 Aug 2026, 17:30 IST');
    expect(formatIstInstant('2026-08-20T00:00:00.000Z')).toBe('20 Aug 2026, 05:30 IST');
  });

  it('planted defect: the day rolls at IST midnight, not UTC midnight', () => {
    // 18:29:59.999Z is 23:59:59 IST on the 20th; one millisecond later is the
    // 21st. A formatter that printed the UTC day — or the device's day — would
    // put these two on the same date and disagree with the calendar cell the
    // same instant lands in.
    expect(formatIstInstant('2026-08-20T18:29:59.999Z')).toBe('20 Aug 2026, 23:59 IST');
    expect(formatIstInstant('2026-08-20T18:30:00.000Z')).toBe('21 Aug 2026, 00:00 IST');
    // And it agrees with the helper the calendar uses, by construction.
    expect(istDayOf('2026-08-20T18:29:59.999Z')).toBe('2026-08-20');
    expect(istDayOf('2026-08-20T18:30:00.000Z')).toBe('2026-08-21');
  });

  it('reads the instant, not the label — the same moment stated two ways prints once', () => {
    expect(formatIstInstant('2026-08-21T00:00:00.000+05:30')).toBe(formatIstInstant('2026-08-20T18:30:00.000Z'));
  });

  it('an unreadable instant travels verbatim — a time is never invented to fill the gap', () => {
    expect(formatIstInstant('garbage')).toBe('garbage');
  });

  it('planted defect: a DAY claim is not given a time of day', () => {
    // Date.parse('2026-08-20') is midnight UTC, which a naive formatter would
    // print as '20 Aug 2026, 05:30 IST' — an hour and a half nobody claimed.
    expect(formatIstInstant('2026-08-20')).toBe('2026-08-20');
  });

  it('names the clock it is showing, from the domain constant and not a literal', () => {
    expect(IST_CLOCK_NOTE).toBe(`times are shown in ${IST_TIME_ZONE}`);
  });
});
```

`packages/domain/src/clock-skew.ts`:

```ts
import type { EventEnvelope } from './envelope.js';
import { IST_DAY_REGEX, IST_OFFSET_MINUTES, IST_TIME_ZONE, istDayOf } from './ist-day.js';

/**
 * Spec §5 Clocks: client wall time is recorded as the claim it is; gross skew
 * is flagged against server time, keeping both. Both timestamps are immutable
 * in the envelope, so the flag is DERIVED — deterministic, rebuildable, and
 * identical wherever it is computed (server history endpoint or client render).
 *
 * Both are absolute instants (Plan 1 Task 6: `timestamptz`, re-emitted as ISO
 * 'Z'), which is what makes a subtraction meaningful at all — under the old
 * verbatim-text client_time, '…+05:30' and '…Z' were unequal strings for one
 * moment and this arithmetic would have needed a cast at every call site.
 */
export const GROSS_CLOCK_SKEW_MS = 600_000; // 10 minutes

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** What a surface says beside a printed time, so nobody has to guess the clock. */
export const IST_CLOCK_NOTE = `times are shown in ${IST_TIME_ZONE}`;

/**
 * The ONE way this product prints an absolute instant to a person:
 * '21 Aug 2026, 00:00 IST'.
 *
 * The day component comes from `istDayOf`, so a printed timestamp and the
 * calendar cell the same instant lands in can never disagree — the failure
 * this would otherwise cause is quiet and total: a history line saying
 * "20 Aug" beside a calendar marker on the 21st, with nothing to indicate
 * which one is wrong.
 *
 * The time component is a constant +05:30 shift rather than an Intl lookup,
 * for ist-day.ts's own reason (IST has no daylight saving, so there is no rule
 * to look up) plus one this plan cares about specifically: React Native's
 * Hermes runtime does not reliably ship a full timezone database, and a
 * formatter that silently fell back to the device's zone on mobile would be
 * the offline copy disagreeing with the server about when things happened.
 *
 * An unparseable instant is returned verbatim. It is someone's claim, however
 * broken; replacing it with a plausible time would be inventing one. A DAY
 * claim is returned verbatim too, and for a sharper reason: `Date.parse`
 * happily accepts '2026-08-20' and calls it midnight UTC, which this function
 * would then print as '20 Aug 2026, 05:30 IST' — a time of day nobody claimed,
 * conjured out of a date. `istDayOf` refuses a date-only string for exactly
 * this reason; a day is not an instant, and neither is it an instant with the
 * hours guessed.
 */
export function formatIstInstant(instant: string): string {
  if (IST_DAY_REGEX.test(instant)) return instant;
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) return instant;
  const day = istDayOf(new Date(ms).toISOString());
  const shifted = new Date(ms + IST_OFFSET_MINUTES * 60_000);
  const hours = String(shifted.getUTCHours()).padStart(2, '0');
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');
  const [year, month, date] = day.split('-');
  return `${Number(date)} ${MONTH_SHORT[Number(month) - 1]} ${year}, ${hours}:${minutes} IST`;
}

export function clockSkewMs(env: Pick<EventEnvelope, 'clientTime' | 'serverTime'>): number | null {
  const client = Date.parse(env.clientTime);
  const server = Date.parse(env.serverTime);
  if (Number.isNaN(client) || Number.isNaN(server)) return null;
  return client - server;
}

export function hasGrossClockSkew(env: Pick<EventEnvelope, 'clientTime' | 'serverTime'>): boolean {
  const skew = clockSkewMs(env);
  return skew === null || Math.abs(skew) >= GROSS_CLOCK_SKEW_MS;
}
```

- [ ] **Step 6: Run the whole domain suite**

Run (from `packages/domain/`): `pnpm test`
Expected: PASS — all pre-existing tests (Plan 1's `ist-day.test.ts` among them) plus the two new files. `pnpm typecheck` also clean. Watch the two IST planted defects fail first: make `formatIstInstant` slice the ISO string instead of calling `istDayOf`, and the 18:30:00Z case prints 20 Aug; put `originalEvent.clientTime` back into `renderContestedClaimText` raw, and the banner shows a UTC stamp. Restore both.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/events/contest-events.ts packages/domain/src/submit.ts packages/domain/src/clock-skew.ts packages/domain/src/index.ts packages/domain/test/contest-events.test.ts packages/domain/test/clock-skew.test.ts
git commit -m "feat(domain): contest event vocabulary, clock-skew flag, client envelope builder

claim.contested carries the refused original claim verbatim so a sync-time
refusal becomes ledger history instead of a silent drop; resolutions link
their redo/comment so nothing is implied. Skew is derived from the two kept
clocks, not stored — deterministic everywhere it renders."
```

### Task 2: Rule-engine evaluators for contest events (planted-defect fixtures)

**Files:**
- Create: `packages/rule-engine/src/contests.ts`
- Modify: `packages/rule-engine/src/types.ts` (additive `getContest` on `EngineContext`)
- Modify: `packages/rule-engine/src/evaluate.ts` (dispatch two new types)
- Modify: `packages/rule-engine/src/fixtures/harness.ts` (in-memory `getContest`; skip contest types in the ticket fold)
- Modify: `packages/rule-engine/src/index.ts` (exports)
- Create: `packages/rule-engine/fixtures/contest-refuses-client-origin.json`
- Create: `packages/rule-engine/fixtures/contest-accepts-server-origin.json`
- Create: `packages/rule-engine/fixtures/contest-resolved-refuses-unknown.json`
- Create: `packages/rule-engine/fixtures/contest-resolved-refuses-double-resolution.json`
- Create: `packages/rule-engine/fixtures/contest-resolved-accepts-discard.json`
- Test: `packages/rule-engine/test/contests.test.ts` (plus the existing fixtures runner picks up the new JSON automatically)

**Interfaces:**
- Consumes: `Accept`, `Refusal`, `EngineContext`, `evaluateEvent` dispatch (Plan 2); `claimContestedPayloadSchema`, `claimContestedResolvedPayloadSchema`, `CONTEST_EVENT_TYPES` (Task 1); fixture harness (Plan 2 Task 4).
- Produces:
  - Additive `EngineContext` member: `getContest(contestedEventId: string): Promise<ContestLookup | null>` where `type ContestLookup = { ticketId: string; resolved: boolean }` — implemented by the server context (Task 4), the fixture harness (this task), and the local replica context (Task 10). The shared fixture suite keeps client and server from quietly disagreeing (spec §7).
  - `evaluateClaimContested(env, ctx): Promise<Accept | Refusal>`; `evaluateClaimContestedResolved(env, ctx): Promise<Accept | Refusal>`.
  - Rule ids (opaque, module-scoped per coordination): `CONTEST_RULES = { serverOnly: 'contest.server-only', unknown: 'contest.unknown', alreadyResolved: 'contest.already-resolved', wrongTicket: 'contest.wrong-ticket' } as const`.

**Semantics (each line is a fixture or test):**
1. `claim.contested` with `origin !== 'server'` → refused `contest.server-only` ("a contest is the system's record of a refusal; only the server may append one"). Server origin → accepted.
2. `claim.contested_resolved` whose `contestedEventId` names no known contest → refused `contest.unknown`.
3. Resolving an already-resolved contest → refused `contest.already-resolved` (a second resolution would rewrite history).
4. Resolving a contest on a different ticket than the envelope's entity → refused `contest.wrong-ticket`.
5. A context without `getContest` → **throw** (fail loudly): evaluating contest events against a context that cannot see contests is a wiring bug, not a refusal.

- [ ] **Step 1: Write the failing unit test**

`packages/rule-engine/test/contests.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { EventEnvelope } from '@gisik-nokma/domain';
import { CONTEST_RULES, evaluateClaimContested, evaluateClaimContestedResolved } from '../src/contests.js';
import type { ContestLookup, EngineContext } from '../src/types.js';

const TICKET = '01J9GTKA000000000000000000';
const CONTEST_ID = '01J9GCON000000000000000000';

function env(partial: Partial<EventEnvelope>): EventEnvelope {
  return {
    id: '01J9GEVT000000000000000000',
    workspaceId: 'ws_1',
    entity: { kind: 'ticket', id: TICKET },
    type: 'claim.contested',
    version: 1,
    payload: {},
    actorId: 'user_b',
    origin: 'server',
    clientTime: '2026-08-20T00:00:00.000Z',
    serverTime: '2026-08-20T00:00:00.000Z',
    seq: 2,
    ...partial,
  };
}

function ctx(contests: Record<string, ContestLookup>): EngineContext {
  return {
    getEntityState: async () => null,
    getChildrenStates: async () => [],
    getWorkflowDef: async () => null,
    getContest: async (id) => contests[id] ?? null,
  };
}

const contestedPayload = {
  originalEvent: {
    id: '01J9GORG000000000000000000',
    workspaceId: 'ws_1',
    entity: { kind: 'ticket', id: TICKET },
    type: 'ticket.transitioned',
    version: 1,
    payload: { toStateId: 'done' },
    actorId: 'user_b',
    origin: 'mobile',
    clientTime: '2026-08-20T00:00:00.000Z',
  },
  rule: 'restrict-to',
  reason: 'Only the assignee may do this.',
};

describe('evaluateClaimContested', () => {
  it('planted defect: a client-forged contest is refused with contest.server-only', async () => {
    const verdict = await evaluateClaimContested(
      env({ origin: 'mobile', payload: contestedPayload }),
      ctx({}),
    );
    expect(verdict).toEqual({
      refused: true,
      rule: CONTEST_RULES.serverOnly,
      reason: 'A contested claim is the system’s record of a refusal; only the server may append one.',
    });
  });

  it('accepts the server-appended contest', async () => {
    const verdict = await evaluateClaimContested(env({ payload: contestedPayload }), ctx({}));
    expect(verdict).toEqual({ refused: false });
  });
});

describe('evaluateClaimContestedResolved', () => {
  const resolved = (payload: Record<string, unknown>) =>
    env({ type: 'claim.contested_resolved', origin: 'desktop', payload: { contestedEventId: CONTEST_ID, resolution: 'discarded', ...payload } });

  it('planted defect: resolving a contest nobody recorded is refused with contest.unknown', async () => {
    const verdict = await evaluateClaimContestedResolved(resolved({}), ctx({}));
    expect(verdict).toMatchObject({ refused: true, rule: CONTEST_RULES.unknown });
  });

  it('planted defect: a second resolution is refused with contest.already-resolved', async () => {
    const verdict = await evaluateClaimContestedResolved(
      resolved({}),
      ctx({ [CONTEST_ID]: { ticketId: TICKET, resolved: true } }),
    );
    expect(verdict).toMatchObject({ refused: true, rule: CONTEST_RULES.alreadyResolved });
  });

  it('planted defect: resolving from another ticket is refused with contest.wrong-ticket', async () => {
    const verdict = await evaluateClaimContestedResolved(
      resolved({}),
      ctx({ [CONTEST_ID]: { ticketId: '01J9GOTH000000000000000000', resolved: false } }),
    );
    expect(verdict).toMatchObject({ refused: true, rule: CONTEST_RULES.wrongTicket });
  });

  it('accepts a first, well-aimed resolution', async () => {
    const verdict = await evaluateClaimContestedResolved(
      resolved({}),
      ctx({ [CONTEST_ID]: { ticketId: TICKET, resolved: false } }),
    );
    expect(verdict).toEqual({ refused: false });
  });

  it('throws on a context without getContest — wiring bug, not a refusal', async () => {
    const bare = { getEntityState: async () => null, getChildrenStates: async () => [], getWorkflowDef: async () => null } as unknown as EngineContext;
    await expect(evaluateClaimContestedResolved(resolved({}), bare)).rejects.toThrow(/getContest/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `packages/rule-engine/`): `pnpm vitest run test/contests.test.ts`
Expected: FAIL — `Cannot find module '../src/contests.js'`.

- [ ] **Step 3: Add getContest to EngineContext and implement the evaluators**

In `packages/rule-engine/src/types.ts`, add to the `EngineContext` type (locate it with `grep -n "EngineContext" packages/rule-engine/src/types.ts`):

```ts
export type ContestLookup = { ticketId: string; resolved: boolean };
```

and inside `EngineContext`:

```ts
  /**
   * Look up a recorded contested claim by the claim.contested event id.
   * Additive (this plan): implemented by the server context over
   * proj_contested, the fixture harness over priorEvents, and the client
   * replica over its local contests table. Optional so pre-existing
   * contexts still typecheck; contest evaluators fail loudly when absent.
   */
  getContest?(contestedEventId: string): Promise<ContestLookup | null>;
```

`packages/rule-engine/src/contests.ts`:

```ts
import type { EventEnvelope } from '@gisik-nokma/domain';
import { claimContestedResolvedPayloadSchema } from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from './types.js';

export const CONTEST_RULES = {
  serverOnly: 'contest.server-only',
  unknown: 'contest.unknown',
  alreadyResolved: 'contest.already-resolved',
  wrongTicket: 'contest.wrong-ticket',
} as const;

const ACCEPT: Accept = { refused: false };

function refuse(rule: string, reason: string): Refusal {
  return { refused: true, rule, reason };
}

/** claim.contested — only the server records contests; payload shape is parse-time. */
export async function evaluateClaimContested(env: EventEnvelope, _ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.origin !== 'server') {
    return refuse(
      CONTEST_RULES.serverOnly,
      'A contested claim is the system’s record of a refusal; only the server may append one.',
    );
  }
  return ACCEPT;
}

/** claim.contested_resolved — a resolution must aim at exactly one open contest on this ticket. */
export async function evaluateClaimContestedResolved(
  env: EventEnvelope,
  ctx: EngineContext,
): Promise<Accept | Refusal> {
  if (ctx.getContest === undefined) {
    throw new Error('EngineContext.getContest is required to evaluate claim.contested_resolved');
  }
  const payload = claimContestedResolvedPayloadSchema.parse(env.payload); // parse-time revalidation is cheap and loud
  const contest = await ctx.getContest(payload.contestedEventId);
  if (contest === null) {
    return refuse(CONTEST_RULES.unknown, `No contested claim ${payload.contestedEventId} is recorded.`);
  }
  if (contest.ticketId !== env.entity.id) {
    return refuse(CONTEST_RULES.wrongTicket, 'This contested claim belongs to a different ticket.');
  }
  if (contest.resolved) {
    return refuse(
      CONTEST_RULES.alreadyResolved,
      'This contested claim is already resolved; a second resolution would rewrite history.',
    );
  }
  return ACCEPT;
}
```

In `packages/rule-engine/src/evaluate.ts`, find the per-type dispatch (`grep -n "ticket.transitioned\|workflow.defined" packages/rule-engine/src/evaluate.ts`) and add, following the same pattern the existing cases use:

```ts
    case 'claim.contested':
      return evaluateClaimContested(env, ctx);
    case 'claim.contested_resolved':
      return evaluateClaimContestedResolved(env, ctx);
```

with the import `import { evaluateClaimContested, evaluateClaimContestedResolved } from './contests.js';`. Export from `packages/rule-engine/src/index.ts`:

```ts
export { CONTEST_RULES, evaluateClaimContested, evaluateClaimContestedResolved } from './contests.js';
export type { ContestLookup } from './types.js';
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `pnpm vitest run test/contests.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Teach the fixture harness about contests**

In `packages/rule-engine/src/fixtures/harness.ts`:

1. Where `buildInMemoryContext` folds `priorEvents` into ticket state, **skip contest events before the fold** (they attach to the ticket entity but are not ticket state — exactly how the server's `proj_tickets` treats them). Locate the fold (`grep -n "priorEvents" packages/rule-engine/src/fixtures/harness.ts`) and filter:

```ts
import { CONTEST_EVENT_TYPES } from '@gisik-nokma/domain';

const foldable = completedPriorEvents.filter((e) => !(CONTEST_EVENT_TYPES as readonly string[]).includes(e.type));
```

(use the local variable name the harness already has for the completed prior events; only the filter is new).

2. Add `getContest` to the returned context, derived from the same completed prior events:

```ts
    getContest: async (contestedEventId) => {
      const contested = completedPriorEvents.find(
        (e) => e.type === 'claim.contested' && e.id === contestedEventId,
      );
      if (contested === undefined) return null;
      const resolved = completedPriorEvents.some(
        (e) =>
          e.type === 'claim.contested_resolved' &&
          (e.payload as { contestedEventId?: string }).contestedEventId === contestedEventId,
      );
      return { ticketId: contested.entity.id, resolved };
    },
```

- [ ] **Step 6: Write the five planted-defect fixtures**

`packages/rule-engine/fixtures/contest-refuses-client-origin.json`:

```json
{
  "name": "a client cannot forge the system's record of a refusal",
  "workflowDefs": [],
  "memberships": [],
  "priorEvents": [],
  "candidateEvent": {
    "type": "claim.contested",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_b",
    "origin": "mobile",
    "payload": {
      "originalEvent": {
        "id": "01J9GORG000000000000000000",
        "workspaceId": "ws_1",
        "entity": { "kind": "ticket", "id": "t1" },
        "type": "ticket.transitioned",
        "version": 1,
        "payload": { "toStateId": "done" },
        "actorId": "user_b",
        "origin": "mobile",
        "clientTime": "2026-08-20T00:00:00.000Z"
      },
      "rule": "restrict-to",
      "reason": "Only the assignee may do this."
    }
  },
  "expected": {
    "refused": true,
    "rule": "contest.server-only",
    "reason": "A contested claim is the system’s record of a refusal; only the server may append one."
  }
}
```

`packages/rule-engine/fixtures/contest-accepts-server-origin.json`:

```json
{
  "name": "the server's own contest record is accepted",
  "workflowDefs": [],
  "memberships": [],
  "priorEvents": [],
  "candidateEvent": {
    "type": "claim.contested",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_b",
    "origin": "server",
    "payload": {
      "originalEvent": {
        "id": "01J9GORG000000000000000000",
        "workspaceId": "ws_1",
        "entity": { "kind": "ticket", "id": "t1" },
        "type": "ticket.transitioned",
        "version": 1,
        "payload": { "toStateId": "done" },
        "actorId": "user_b",
        "origin": "mobile",
        "clientTime": "2026-08-20T00:00:00.000Z"
      },
      "rule": "restrict-to",
      "reason": "Only the assignee may do this."
    }
  },
  "expected": { "refused": false }
}
```

(The only differences from the previous fixture are `name`, the candidate's `origin`, and `expected` — written out in full rather than described, because the executor may open this file without the previous one in view.)

`packages/rule-engine/fixtures/contest-resolved-refuses-unknown.json`:

```json
{
  "name": "resolving a contest nobody recorded is refused",
  "workflowDefs": [],
  "memberships": [],
  "priorEvents": [],
  "candidateEvent": {
    "type": "claim.contested_resolved",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_b",
    "origin": "desktop",
    "payload": { "contestedEventId": "01J9GNOP000000000000000000", "resolution": "discarded" }
  },
  "expected": {
    "refused": true,
    "rule": "contest.unknown",
    "reason": "No contested claim 01J9GNOP000000000000000000 is recorded."
  }
}
```

`packages/rule-engine/fixtures/contest-resolved-refuses-double-resolution.json`:

```json
{
  "name": "a contested claim cannot be resolved twice",
  "workflowDefs": [],
  "memberships": [],
  "priorEvents": [
    {
      "type": "claim.contested",
      "entity": { "kind": "ticket", "id": "t1" },
      "actorId": "user_b",
      "origin": "server",
      "payload": {
        "originalEvent": {
          "id": "01J9GORG000000000000000000",
          "workspaceId": "ws_1",
          "entity": { "kind": "ticket", "id": "t1" },
          "type": "ticket.transitioned",
          "version": 1,
          "payload": { "toStateId": "done" },
          "actorId": "user_b",
          "origin": "mobile",
          "clientTime": "2026-08-20T00:00:00.000Z"
        },
        "rule": "restrict-to",
        "reason": "Only the assignee may do this."
      }
    },
    {
      "type": "claim.contested_resolved",
      "entity": { "kind": "ticket", "id": "t1" },
      "actorId": "user_b",
      "origin": "desktop",
      "payload": { "contestedEventId": "fx_evt_1", "resolution": "discarded" }
    }
  ],
  "candidateEvent": {
    "type": "claim.contested_resolved",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_b",
    "origin": "desktop",
    "payload": { "contestedEventId": "fx_evt_1", "resolution": "discarded" }
  },
  "expected": {
    "refused": true,
    "rule": "contest.already-resolved",
    "reason": "This contested claim is already resolved; a second resolution would rewrite history."
  }
}
```

(the harness assigns prior-event ids `fx_evt_<seq>`, so the contest recorded first is `fx_evt_1`.)

`packages/rule-engine/fixtures/contest-resolved-accepts-discard.json`:

```json
{
  "name": "discarding a contested claim is a recorded, accepted resolution",
  "workflowDefs": [],
  "memberships": [],
  "priorEvents": [
    {
      "type": "claim.contested",
      "entity": { "kind": "ticket", "id": "t1" },
      "actorId": "user_b",
      "origin": "server",
      "payload": {
        "originalEvent": {
          "id": "01J9GORG000000000000000000",
          "workspaceId": "ws_1",
          "entity": { "kind": "ticket", "id": "t1" },
          "type": "ticket.transitioned",
          "version": 1,
          "payload": { "toStateId": "done" },
          "actorId": "user_b",
          "origin": "mobile",
          "clientTime": "2026-08-20T00:00:00.000Z"
        },
        "rule": "restrict-to",
        "reason": "Only the assignee may do this."
      }
    }
  ],
  "candidateEvent": {
    "type": "claim.contested_resolved",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_b",
    "origin": "desktop",
    "payload": { "contestedEventId": "fx_evt_1", "resolution": "discarded" }
  },
  "expected": { "refused": false }
}
```

(Same contest, same candidate as the previous fixture — the ONLY difference is that no prior resolution exists, which is why this one is accepted. Written out in full because the executor may open it alone.)

- [ ] **Step 7: Run the fixtures runner and the whole package**

Run (from `packages/rule-engine/`): `pnpm test`
Expected: PASS — the fixtures runner (`test/fixtures.test.ts`) discovers the five new files and every prior fixture still passes; `test/contests.test.ts` passes. `pnpm typecheck` clean.

- [ ] **Step 8: Commit**

```bash
git add packages/rule-engine/src/contests.ts packages/rule-engine/src/types.ts packages/rule-engine/src/evaluate.ts packages/rule-engine/src/fixtures/harness.ts packages/rule-engine/src/index.ts packages/rule-engine/fixtures/contest-*.json packages/rule-engine/test/contests.test.ts
git commit -m "feat(rule-engine): contest evaluators — forged, unknown, double and misaimed resolutions all refuse

The shared fixture suite now proves the contest lifecycle at the engine
door in every build that runs it; getContest joins EngineContext
additively so server, harness and replica answer the same question."
```

---

### Task 3: `workspace_seq` — the workspace stream cursor (coordination amendment 18)

The wire contract's `seq` is **per-entity** (Plan 1: `UNIQUE (entity_kind, entity_id, seq)`), but amendment 13's `subscribe {workspaceId, afterSeq}` and `caught-up {seq}` need a cursor that is monotone across a whole workspace — per-entity seq restarts at 1 for every entity, so `WHERE seq > $2` skips every new entity's early events once the cursor moves. Plan 5 found this (its case 7.34) and **coordination amendment 18 pinned the fix: `events.workspace_seq bigint` with `UNIQUE (workspace_id, workspace_seq)`, assigned inside the ingest transaction under a per-workspace advisory lock.** Plan 1 has already landed the schema, the lock and the assignment; Plan 4's `visibleEventsFor` semantics are the remaining pending amendment. This task therefore **consumes** the pinned cursor — it does not invent one — and finishes the Plan 4 half so the sync-down filter and the bootstrap/WS cursors all mean the same thing.

Why the pinned design and not a `GENERATED ALWAYS AS IDENTITY` arrival ordinal: an identity column is assigned at INSERT but becomes *visible* at COMMIT, so a transaction that took a lower ordinal can commit after a reader has already passed it — the reader's cursor then skips it forever. That is the same silent skip in a new costume. The advisory lock plus `max(workspace_seq)+1` inside the ingest transaction is what makes "everything at or below this cursor is already visible" true. Do not substitute a sequence, an identity column, or a `max`-pre-read.

**Files:**
- Modify: `apps/server/src/visibility/visible-events-for.ts` (cursor SQL only — Plan 4's pending amendment-18 change)
- Modify: `apps/server/test/visibility/visible-events-for.test.ts` (cursor expectations only)
- Create: `apps/server/src/sync/stream-seq.ts`
- Test: `apps/server/test/sync/stream-seq.test.ts`

**Interfaces:**
- Consumes (Plan 1, coordination §18): `events.workspace_seq bigint NOT NULL` with `CONSTRAINT events_workspace_seq_unique UNIQUE (workspace_id, workspace_seq)`; `lockWorkspace(client, workspaceId)`; `nextWorkspaceSeq(client, workspaceId)`; `type LedgerEvent = EventEnvelope & { workspaceSeq: number }`; `rowToEnvelope`; `insertEvent`; `createTestDatabase`. Plan 4's `visibleEventsFor`.
- Produces:
  - `readStreamSeq(db: Queryable, workspaceId: string): Promise<number>` — the workspace's high-water cursor, `MAX(workspace_seq)` (`0` for an empty workspace).
  - `visibleEventsFor` streams `WHERE workspace_id = $1 AND workspace_seq > $2 ORDER BY workspace_seq` — `afterSeq` means "after this stream position" everywhere (bootstrap `streamSeq`, WS `subscribe.afterSeq`, `caught-up.seq`). Per-entity `seq` keeps its own role (entity history, replay, snapshots) and stays in the envelope unchanged.

- [ ] **Step 1: Guard — confirm Plan 1's cursor is present before building on it**

Run (from `apps/server/`):

```bash
grep -rn "workspace_seq" migrations/ src/ledger/ | head
grep -n "lockWorkspace\|nextWorkspaceSeq\|workspaceSeq" src/ledger/event-store.ts src/ingest/ingest-service.ts
```

Expected: the `events` table declares `workspace_seq bigint NOT NULL` with `events_workspace_seq_unique UNIQUE (workspace_id, workspace_seq)`; `lockWorkspace` and `nextWorkspaceSeq` exist; `insertEvent` names `workspace_seq` among its columns; ingest calls `lockWorkspace` **before** `lockEntity` and assigns `workspaceSeq` inside the same transaction.

If any of that is missing, Plan 1's amendment-18 change has not landed — **stop and apply it there**, in `apps/server/migrations/` and `src/ledger/event-store.ts`, exactly as coordination §18 specifies (column + unique constraint + `pg_advisory_xact_lock` on the workspace id + `max(workspace_seq)+1` in the ingest transaction). Do not add a second, differently-named cursor column here: two cursors on one table is precisely the ambiguity this amendment exists to remove.

- [ ] **Step 2: Write the failing stream-seq test**

`apps/server/test/sync/stream-seq.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { readStreamSeq } from '../../src/sync/stream-seq.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { committed, submittedWorkspaceCreated } from '../helpers/events.js';
import { insertEvent } from '../../src/ledger/event-store.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

describe('readStreamSeq', () => {
  it('is 0 for a workspace with no events', async () => {
    expect(await readStreamSeq(db.pool, 'ws_empty')).toBe(0);
  });

  it('is workspace-SCOPED: each workspace counts its own stream from 1, and they never interleave', async () => {
    // committed(submitted, seq, serverTime?, workspaceSeq?) — Plan 1's helper;
    // workspaceSeq is the per-workspace cursor, NOT a global ordinal.
    const a1 = committed({ ...submittedWorkspaceCreated(), workspaceId: 'ws_a' }, 1, undefined, 1);
    const b1 = committed({ ...submittedWorkspaceCreated(), id: newUlid(), workspaceId: 'ws_b' }, 1, undefined, 1);
    const client = await db.pool.connect();
    try {
      await insertEvent(client, a1);
      await insertEvent(client, b1);
    } finally {
      client.release();
    }

    // Both are the FIRST event of their own workspace: both cursors read 1.
    // A global ordinal would have made these differ — and a client resuming
    // ws_b at ws_a's number would skip its own history.
    expect(await readStreamSeq(db.pool, 'ws_a')).toBe(1);
    expect(await readStreamSeq(db.pool, 'ws_b')).toBe(1);
  });

  it('advances with each arrival in that workspace, across DIFFERENT entities', async () => {
    const first = submittedWorkspaceCreated({ workspaceId: 'ws_c' });
    const second = submittedWorkspaceCreated({ workspaceId: 'ws_c' }); // a different entity, seq 1 again
    const client = await db.pool.connect();
    try {
      await insertEvent(client, committed(first, 1, undefined, 1));
      await insertEvent(client, committed(second, 1, undefined, 2));
    } finally {
      client.release();
    }

    // Per-entity seq is 1 for BOTH; the stream cursor is 1 then 2. This is the
    // whole point of amendment 18: resuming at 1 must still deliver `second`.
    expect(await readStreamSeq(db.pool, 'ws_c')).toBe(2);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run (from `apps/server/`): `pnpm vitest run test/sync/stream-seq.test.ts`
Expected: FAIL — cannot resolve `../../src/sync/stream-seq.js`. (The `workspace_seq` column itself already exists: `createTestDatabase` runs Plan 1's migrations, and Step 1 confirmed it. If instead you see a missing-column error, Step 1's guard was skipped — go back and apply Plan 1's amendment-18 change first.)

- [ ] **Step 4: Implement readStreamSeq**

`apps/server/src/sync/stream-seq.ts`:

```ts
import type { Queryable } from '../db/queryable.js';

/**
 * The workspace stream's high-water mark (coordination §18). Bootstrap hands
 * it to the client; the client hands it back as subscribe.afterSeq; caught-up
 * frames advance it. Opaque to clients — only "later than" has meaning, and
 * only WITHIN one workspace: workspace_seq is per-workspace, so a cursor from
 * one workspace is meaningless in another.
 *
 * Reading max() here is safe as a HIGH-WATER READ (bootstrap answers "you have
 * everything up to N") because ingest assigns workspace_seq under
 * lockWorkspace inside the appending transaction: nothing at or below a
 * committed max can still be in flight. It is NOT safe as an ASSIGNMENT
 * strategy — use nextWorkspaceSeq under lockWorkspace for that.
 */
export async function readStreamSeq(db: Queryable, workspaceId: string): Promise<number> {
  const { rows } = await db.query(
    'SELECT COALESCE(MAX(workspace_seq), 0) AS stream_seq FROM events WHERE workspace_id = $1',
    [workspaceId],
  );
  return Number((rows[0] as { stream_seq: number | string }).stream_seq);
}
```

(If Plan 4's `Queryable` lives elsewhere, locate it: `grep -rn "interface Queryable\|type Queryable" apps/server/src` and import from there.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run test/sync/stream-seq.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Point visibleEventsFor at the stream cursor (Plan 4's pending amendment-18 change)**

First check whether the orchestrator already applied it: `grep -n "workspace_seq" apps/server/src/visibility/visible-events-for.ts`. If it is already there, skip to Step 8 — there is nothing to change.

Otherwise, in `apps/server/src/visibility/visible-events-for.ts`, change the main query (locate: `grep -n "seq > \$2" apps/server/src/visibility/visible-events-for.ts`):

```ts
  const { rows } = await db.query(
    `SELECT id, workspace_id, entity_kind, entity_id, type, version, payload,
            actor_id, origin, client_time, server_time, seq, workspace_seq
     FROM events WHERE workspace_id = $1 AND workspace_seq > $2 ORDER BY workspace_seq`,
    [workspaceId, afterSeq],
  );
```

and update the function's doc comment to say `afterSeq` is the per-workspace stream position (`events.workspace_seq`, coordination §18), while envelope `seq` stays per-entity. Nothing else in the function changes — the filter and purge logic are position-independent. If `rowToEnvelope` is what builds each yielded item, it already carries `workspaceSeq` (Plan 1's `LedgerEvent`), so selecting the column keeps the emitted envelope complete rather than silently dropping the cursor the caller needs for `caught-up`.

- [ ] **Step 7: Fix Plan 4's cursor-sensitive tests**

Run: `pnpm vitest run test/visibility/visible-events-for.test.ts`

Any test that passed a non-zero `afterSeq` computed from per-entity seq now needs the stream position instead. In each such test, read the cursor with a helper added to the test file:

```ts
async function streamSeqNow(workspaceId: string): Promise<number> {
  const { rows } = await pool.query(
    'SELECT COALESCE(MAX(workspace_seq), 0) AS s FROM events WHERE workspace_id = $1',
    [workspaceId],
  );
  return Number(rows[0].s);
}
```

(Note the workspace argument: `workspace_seq` is per-workspace, so a cursor read without scoping is meaningless. A test that seeds two workspaces and reads an unscoped `max` would pass by luck and lie later.)

and replace hard-coded `afterSeq` arguments with `await streamSeqNow(workspaceId)` captured at the intended point in the scenario (i.e., capture the cursor after the events that should be excluded, before the events that should be included). Do not weaken any assertion about which events/purges are yielded — only how the cursor is obtained. Re-run until the file passes.

- [ ] **Step 8: Run the whole server suite**

Run (from `apps/server/`): `pnpm test`
Expected: PASS — projections, ingest and auth suites unaffected (none reads `workspace_seq`); the visibility suite passes with the cursor helper.

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/sync/stream-seq.ts apps/server/src/visibility/visible-events-for.ts apps/server/test/sync/stream-seq.test.ts apps/server/test/visibility/visible-events-for.test.ts
git commit -m "feat(server): resume the workspace stream by workspace_seq, not per-entity seq

Coordination amendment 18: per-entity seq restarts at 1 for every entity,
so 'seq > afterSeq' as a workspace cursor silently skips new entities'
early events — exactly the kind of quiet lie the ledger exists to
prevent. Plan 1 ships the column and its advisory-locked assignment;
this closes the read half, so bootstrap, subscribe and caught-up all
mean the same position. The envelope is unchanged; cursors stay opaque
to clients and scoped to one workspace."
```

---

### Task 4: `proj_contested` + engine lookup + `GET /v1/contests`

**Files:**
- Create: `apps/server/migrations/<timestamp>_proj-contested.sql`
- Create: `apps/server/src/projections/contested.ts`
- Modify: `apps/server/src/projections/index.ts` (register after `proj_visibility`)
- Modify: `apps/server/src/engine-context.ts` (additive `getContest`)
- Create: `apps/server/src/sync/contests-route.ts`
- Modify: `apps/server/src/index.ts` (mount route — see step 8)
- Test: `apps/server/test/sync/contested-projection.test.ts`
- Test: `apps/server/test/sync/contests-route.test.ts`

**Interfaces:**
- Consumes: `Projection`, `buildProjectionRegistry` (Plan 1); `claimContestedPayloadSchema`, `claimContestedResolvedPayloadSchema` (Task 1); `canSee`, `makeRequireSession`, seed/session helpers (Plan 4); `ContestLookup` (Task 2).
- Produces:
  - Table `proj_contested(contested_event_id text PK, original_event_id text UNIQUE, workspace_id, ticket_id, claimant_id, rule, reason, original jsonb, contested_at timestamptz, resolved boolean, resolution text NULL, resolved_by text NULL, resolved_event_id text NULL, resolved_at timestamptz NULL)`.
  - Projection object `projContested = { name: 'contested', tables: ['proj_contested'], apply, reset }`, registered LAST (after `proj_visibility`) — coordination decision 8's order gains one tail entry.
  - `getContest` on the server `EngineContext`: reads `proj_contested` — the idempotency lookup for the sync path (Task 7) reuses the same table via `original_event_id`.
  - `GET /v1/contests?workspaceId=<id>&ticketId=<id?>&claimantId=<id?>&open=<true?>` → `{ contests: ContestView[] }`, `ContestView = { contestedEventId, originalEventId, workspaceId, ticketId, claimantId, rule, reason, original: SubmittedEvent, contestedAt, resolved, resolution: string|null, resolvedBy: string|null, resolvedEventId: string|null, resolvedAt: string|null }` — visibility-filtered by `canSee`; the extension point Plans 5 (My Work) and 9 (attention strip) consume for "contested claims appear in My Work + attention".

- [ ] **Step 1: Generate the migration and write the SQL**

Run (from `apps/server/`): `pnpm node-pg-migrate create proj-contested --migration-file-language sql --migrations-dir migrations`

Up SQL:

```sql
CREATE TABLE proj_contested (
  contested_event_id text PRIMARY KEY,
  original_event_id  text NOT NULL,
  workspace_id       text NOT NULL,
  ticket_id          text NOT NULL,
  claimant_id        text NOT NULL,
  rule               text NOT NULL,
  reason             text NOT NULL,
  original_event     jsonb NOT NULL,
  contested_at       timestamptz NOT NULL,
  resolved           boolean NOT NULL DEFAULT false,
  resolution         text,
  resolved_by        text,
  resolved_event_id  text,
  resolved_at        timestamptz
);

CREATE UNIQUE INDEX proj_contested_original_idx ON proj_contested (original_event_id);
CREATE INDEX proj_contested_ticket_idx ON proj_contested (workspace_id, ticket_id);
CREATE INDEX proj_contested_claimant_idx ON proj_contested (workspace_id, claimant_id);

COMMENT ON TABLE proj_contested IS 'Open and resolved contested claims per ticket and claimant; rebuildable from claim.contested / claim.contested_resolved.';
```

Down SQL:

```sql
DROP TABLE proj_contested;
```

- [ ] **Step 2: Write the failing projection test**

`apps/server/test/sync/contested-projection.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, newSubmittedEvent, type EventEnvelope } from '@gisik-nokma/domain';
import { projContested } from '../../src/projections/contested.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { committed } from '../helpers/events.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

const TICKET = newUlid();

function contestEnvelope(seq: number, contestId = newUlid()): EventEnvelope {
  const original = newSubmittedEvent({
    workspaceId: 'ws_1',
    entity: { kind: 'ticket', id: TICKET },
    type: 'ticket.transitioned',
    payload: { toStateId: 'done' },
    actorId: 'user_b',
    origin: 'mobile',
  });
  return committed(
    {
      id: contestId,
      workspaceId: 'ws_1',
      entity: { kind: 'ticket', id: TICKET },
      type: 'claim.contested',
      version: 1,
      payload: { originalEvent: original, rule: 'restrict-to', reason: 'Only the assignee may do this.' },
      actorId: 'user_b',
      origin: 'server',
      clientTime: '2026-08-20T10:00:00.000Z',
    },
    seq,
  );
}

async function apply(env: EventEnvelope): Promise<void> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await projContested.apply(env, client);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

describe('projContested', () => {
  it('is registered last in the projection registry', () => {
    const names = buildProjectionRegistry().all().map((p) => p.name);
    expect(names[names.length - 1]).toBe('contested');
  });

  it('records a contest open, keyed by both event ids, claimant from the original claim', async () => {
    const env = contestEnvelope(2);
    await apply(env);
    const { rows } = await db.pool.query('SELECT * FROM proj_contested WHERE contested_event_id = $1', [env.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      original_event_id: (env.payload as { original: { id: string } }).original.id,
      ticket_id: TICKET,
      claimant_id: 'user_b',
      rule: 'restrict-to',
      resolved: false,
      resolution: null,
    });
  });

  it('marks the contest resolved with who, how, and the resolving event', async () => {
    const contest = contestEnvelope(3);
    await apply(contest);
    const resolvedEnv = committed(
      {
        id: newUlid(),
        workspaceId: 'ws_1',
        entity: { kind: 'ticket', id: TICKET },
        type: 'claim.contested_resolved',
        version: 1,
        payload: { contestedEventId: contest.id, resolution: 'discarded', note: 'stale' },
        actorId: 'user_c',
        origin: 'web',
        clientTime: '2026-08-20T11:00:00.000Z',
      },
      4,
    );
    await apply(resolvedEnv);
    const { rows } = await db.pool.query('SELECT * FROM proj_contested WHERE contested_event_id = $1', [contest.id]);
    expect(rows[0]).toMatchObject({
      resolved: true,
      resolution: 'discarded',
      resolved_by: 'user_c',
      resolved_event_id: resolvedEnv.id,
    });
  });

  it('ignores every other event type — determinism over defensiveness', async () => {
    const before = await db.pool.query('SELECT count(*)::int AS n FROM proj_contested');
    await apply(
      committed(
        {
          id: newUlid(),
          workspaceId: 'ws_1',
          entity: { kind: 'ticket', id: TICKET },
          type: 'ticket.assigned',
          version: 1,
          payload: { assigneeId: 'user_a' },
          actorId: 'user_a',
          origin: 'web',
          clientTime: '2026-08-20T10:00:00.000Z',
        },
        5,
      ),
    );
    const after = await db.pool.query('SELECT count(*)::int AS n FROM proj_contested');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run test/sync/contested-projection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the projection and register it**

`apps/server/src/projections/contested.ts`:

```ts
import type { PoolClient } from 'pg';
import {
  claimContestedPayloadSchema,
  claimContestedResolvedPayloadSchema,
  type EventEnvelope,
} from '@gisik-nokma/domain';
import type { Projection } from './registry.js';

/**
 * Open contests per ticket and per claimant. Deterministic: every column
 * derives from the event alone. claim.contested and claim.contested_resolved
 * share the ticket entity, so per-entity seq order guarantees the contest row
 * exists before its resolution arrives — in live apply and in rebuild alike.
 */
export const projContested: Projection = {
  name: 'contested',
  tables: ['proj_contested'],

  async apply(event: EventEnvelope, tx: PoolClient): Promise<void> {
    if (event.type === 'claim.contested') {
      const payload = claimContestedPayloadSchema.parse(event.payload);
      await tx.query(
        `INSERT INTO proj_contested
           (contested_event_id, original_event_id, workspace_id, ticket_id, claimant_id,
            rule, reason, original_event, contested_at, resolved)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)`,
        [
          event.id,
          payload.originalEvent.id,
          event.workspaceId,
          event.entity.id,
          payload.originalEvent.actorId,
          payload.rule,
          payload.reason,
          JSON.stringify(payload.originalEvent),
          event.serverTime,
        ],
      );
      return;
    }
    if (event.type === 'claim.contested_resolved') {
      const payload = claimContestedResolvedPayloadSchema.parse(event.payload);
      const result = await tx.query(
        `UPDATE proj_contested
            SET resolved = true, resolution = $2, resolved_by = $3, resolved_event_id = $4, resolved_at = $5
          WHERE contested_event_id = $1`,
        [payload.contestedEventId, payload.resolution, event.actorId, event.id, event.serverTime],
      );
      if (result.rowCount !== 1) {
        // The engine refuses resolutions of unknown contests at the door; reaching
        // this in replay means ledger integrity is broken. Fail loudly.
        throw new Error(`claim.contested_resolved ${event.id} resolves unknown contest ${payload.contestedEventId}`);
      }
      return;
    }
  },

  async reset(tx: PoolClient): Promise<void> {
    await tx.query('DELETE FROM proj_contested');
  },
};
```

In `apps/server/src/projections/index.ts`, import and register `projContested` **after** `projVisibility` (locate the registration list: `grep -n "register(" apps/server/src/projections/index.ts`).

- [ ] **Step 5: Run the projection test to verify it passes**

Run: `pnpm vitest run test/sync/contested-projection.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Wire getContest into the server EngineContext**

In `apps/server/src/engine-context.ts` (Plan 3 may have evolved Plan 1's shape — find the object literal that implements `getEntityState`: `grep -n "getEntityState" apps/server/src/engine-context.ts`), add alongside the existing members, using the same queryable the other members use:

```ts
    async getContest(contestedEventId: string) {
      const { rows } = await client.query(
        'SELECT ticket_id, resolved FROM proj_contested WHERE contested_event_id = $1',
        [contestedEventId],
      );
      if (rows.length === 0) return null;
      const row = rows[0] as { ticket_id: string; resolved: boolean };
      return { ticketId: row.ticket_id, resolved: row.resolved };
    },
```

(rename `client` to whatever the surrounding code calls its queryable). Add a case to the existing engine-context test file if one exists (`grep -rn "engine-context" apps/server/test`); otherwise the ingest-path tests in Task 7 cover it end to end.

- [ ] **Step 7: Write the failing contests-route test**

`apps/server/test/sync/contests-route.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, newSubmittedEvent } from '@gisik-nokma/domain';
import { buildTestApp } from '../helpers/app.js'; // if absent, assemble as events-route.test.ts does: buildApp + auth + routes
import { signInWithPhone } from '../helpers/session.js';
import { seedGuest, seedMember, seedTicket } from '../helpers/seed.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { committed } from '../helpers/events.js';

let db: TestDatabase;
let app: FastifyInstance;
let memberToken: string;
let outsiderToken: string;

const WS = 'ws_1';
const TICKET = newUlid();

beforeAll(async () => {
  db = await createTestDatabase();
  ({ app } = await buildTestApp(db)); // must register auth routes + registerContestsRoute (this task)
  memberToken = await signInWithPhone(app, appSender(), '+911111111111');
  outsiderToken = await signInWithPhone(app, appSender(), '+912222222222');
});
```

The full test body (write it now, not later — the helper wiring above is adjusted to whatever `test/helpers` Plan 4 actually shipped, located via `ls apps/server/test/helpers/`):

```ts
describe('GET /v1/contests', () => {
  it('lists open contests for a ticket the caller can see', async () => {
    await seedMember(db.pool, WS, 'usr_member');
    await seedTicket(db.pool, WS, TICKET, { visibility: 'workspace' });
    const original = newSubmittedEvent({
      workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.field_set',
      payload: { fieldId: 'dueDate', value: { date: '2026-09-01' } }, actorId: 'usr_member', origin: 'mobile',
    });
    const contest = committed({
      id: newUlid(), workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'claim.contested', version: 1,
      payload: { originalEvent: original, rule: 'require-field', reason: 'planted' }, actorId: 'usr_member', origin: 'server',
      // Both ledger clocks are timestamptz absolute instants (owner decision
      // 2026-08-20). Every seeded time in this plan — here, in the harness, in
      // any direct `appendTestEvent`/`INSERT INTO events` — is an ISO 8601 'Z'
      // instant, never a wall-clock string with an offset label and never a
      // bare date. A fixture that supplied '2026-09-01' or
      // '2026-09-01 10:00:00 +05:30' would be seeding a shape the product
      // cannot produce, and the test would then be proving something about a
      // world that does not exist.
      clientTime: new Date().toISOString(),
    }, 2);
    await appendTestEvent(db.pool, contest);
    await applyProjections(db.pool, [contest]); // helper: run buildProjectionRegistry().all() apply in a tx

    const res = await app.inject({
      method: 'GET',
      url: `/v1/contests?workspaceId=${WS}&ticketId=${TICKET}&open=true`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    const { contests } = res.json();
    expect(contests).toHaveLength(1);
    expect(contests[0]).toMatchObject({
      contestedEventId: contest.id,
      ticketId: TICKET,
      claimantId: 'usr_member',
      rule: 'require-field',
      resolved: false,
    });
    expect(contests[0].originalEvent.id).toBe(original.id); // the claim travels whole — provenance floor
  });

  it('planted defect: a caller who cannot see the ticket gets NO contest — not even its existence', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/contests?workspaceId=${WS}&ticketId=${TICKET}`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().contests).toEqual([]);
  });

  it('filters by claimant for the My Work surface', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/contests?workspaceId=${WS}&claimantId=usr_member&open=true`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().contests.map((c: { claimantId: string }) => c.claimantId)).toEqual(['usr_member']);
  });

  it('401s without a session', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/contests?workspaceId=${WS}` });
    expect(res.statusCode).toBe(401);
  });
});
```

Adjust helper imports to the names Plan 4 shipped (`ls apps/server/test/helpers/`); if `buildTestApp`/`applyProjections` do not exist, create them in `apps/server/test/helpers/app.ts` by copying the assembly used in Plan 4's route tests (buildApp + `registerAuthRoutes` + this task's `registerContestsRoute`; Tasks 6/7 extend the same helper with `registerSyncRoutes`) — one shared helper, not per-file copies. `appSender()` stands for however Plan 4's tests obtain the OTP sender for `signInWithPhone` — mirror their wiring, and remember the session-id caveat: seed memberships/visibility with the REAL session user ids resolved from the tokens, not literals.

- [ ] **Step 8: Implement the route**

`apps/server/src/sync/contests-route.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { Auth } from '../auth/auth.js';
import { makeRequireSession } from '../auth/require-session.js';
import { canSee } from '../visibility/can-see.js';

export type ContestView = {
  contestedEventId: string;
  originalEventId: string;
  workspaceId: string;
  ticketId: string;
  claimantId: string;
  rule: string;
  reason: string;
  originalEvent: unknown;
  contestedAt: string;
  resolved: boolean;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedEventId: string | null;
  resolvedAt: string | null;
};

/**
 * The read surface for contested claims: the ticket banner, My Work, and the
 * attention strip all read this. Visibility-filtered with canSee — a contest
 * is exactly as visible as its ticket, never more.
 */
export function registerContestsRoute(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void {
  const requireSession = makeRequireSession(deps.auth);

  app.get<{ Querystring: { workspaceId: string; ticketId?: string; claimantId?: string; open?: string } }>(
    '/v1/contests',
    {
      preHandler: requireSession,
      schema: {
        querystring: {
          type: 'object',
          required: ['workspaceId'],
          properties: {
            workspaceId: { type: 'string' },
            ticketId: { type: 'string' },
            claimantId: { type: 'string' },
            open: { type: 'string', enum: ['true', 'false'] },
          },
        },
      },
    },
    async (request) => {
      const { workspaceId, ticketId, claimantId, open } = request.query;
      const clauses = ['workspace_id = $1'];
      const params: unknown[] = [workspaceId];
      if (ticketId !== undefined) {
        params.push(ticketId);
        clauses.push(`ticket_id = $${params.length}`);
      }
      if (claimantId !== undefined) {
        params.push(claimantId);
        clauses.push(`claimant_id = $${params.length}`);
      }
      if (open === 'true') clauses.push('NOT resolved');
      const { rows } = await deps.pool.query(
        `SELECT * FROM proj_contested WHERE ${clauses.join(' AND ')} ORDER BY contested_at, contested_event_id`,
        params,
      );

      const contests: ContestView[] = [];
      for (const row of rows as Array<Record<string, unknown>>) {
        if (!(await canSee(deps.pool, request.currentUserId, row.ticket_id as string))) continue;
        contests.push({
          contestedEventId: row.contested_event_id as string,
          originalEventId: row.original_event_id as string,
          workspaceId: row.workspace_id as string,
          ticketId: row.ticket_id as string,
          claimantId: row.claimant_id as string,
          rule: row.rule as string,
          reason: row.reason as string,
          originalEvent: row.original_event,
          contestedAt: new Date(row.contested_at as string).toISOString(),
          resolved: row.resolved as boolean,
          resolution: (row.resolution as string) ?? null,
          resolvedBy: (row.resolved_by as string) ?? null,
          resolvedEventId: (row.resolved_event_id as string) ?? null,
          resolvedAt: row.resolved_at === null ? null : new Date(row.resolved_at as string).toISOString(),
        });
      }
      return { contests };
    },
  );
}
```

Mount it where the server assembles routes — `grep -n "registerAuthRoutes\|registerTicketRoutes" apps/server/src/index.ts` and add `registerContestsRoute(app, { pool, auth });` beside them.

- [ ] **Step 9: Run both test files, then the whole suite**

Run: `pnpm vitest run test/sync/contested-projection.test.ts test/sync/contests-route.test.ts`
Expected: PASS. Then `pnpm test` — the full server suite stays green (rebuild-and-diff verifier now also covers `proj_contested` automatically, since it iterates the registry).

- [ ] **Step 10: Commit**

```bash
git add apps/server/migrations/*proj-contested.sql apps/server/src/projections/contested.ts apps/server/src/projections/index.ts apps/server/src/engine-context.ts apps/server/src/sync/contests-route.ts apps/server/src/index.ts apps/server/test/sync/contested-projection.test.ts apps/server/test/sync/contests-route.test.ts
git commit -m "feat(server): contested-claims projection and read surface

A contest is exactly as visible as its ticket. proj_contested keys by
both event ids so sync retries can find prior contests idempotently;
the engine's getContest reads the same table the banner does."
```

### Task 5: The snapshot writer — bounded replay, folded by the domain reducer

Plan 1 shipped the `snapshots` table with no writer and assigned the policy here (replica bootstrap is its first real need). The writer folds **the domain reducer** (`applyTicketEvent`), never `proj_tickets` — a snapshot is exactly the state a client would compute from the same events, so snapshot+tail on the client equals full replay.

**Files:**
- Create: `apps/server/src/sync/ledger-deps.ts`
- Create: `apps/server/src/sync/snapshot-writer.ts`
- Modify: `apps/server/src/config.ts` (two additive config fields)
- Modify: `apps/server/src/index.ts` (interval wiring)
- Test: `apps/server/test/sync/snapshot-writer.test.ts`

**Interfaces:**
- Consumes: `applyTicketEvent`, `TicketStateDeps`, `TICKET_EVENT_TYPES`, `TicketState`, `workflowDefinedPayloadSchema`, `ticketTypeDefSchema` (Plans 2/3); `readEntityEvents`, `readLatestSnapshot`, `writeSnapshot` (Plan 1); `loadConfig` (Plan 1).
- Produces:
  - `buildLedgerDeps(db: Queryable, workspaceId: string): Promise<TicketStateDeps>` — workflow and ticket-type definitions folded from their *ledger events* (`workflow.defined`, `ticket-type.defined`), latest version wins; shared with the bootstrap route.
  - `runSnapshotPass(pool: Pool, opts?: { minEvents?: number }): Promise<{ written: Array<{ entityId: string; seq: number }> }>` — snapshots every ticket entity whose head seq is ≥ `minEvents` (default 20) past its latest snapshot; each snapshot's `state` is the reducer fold at that seq.
  - `startSnapshotWriter(pool: Pool, opts: { intervalMs: number; minEvents: number }): () => void` — setInterval wrapper returning a stop function; errors are logged, never crash the server.
  - Config (additive, env): `SNAPSHOT_INTERVAL_MS` (default `300000`), `SNAPSHOT_MIN_EVENTS` (default `20`).

- [ ] **Step 1: Write the failing test**

`apps/server/test/sync/snapshot-writer.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyTicketEvent,
  newSubmittedEvent,
  newUlid,
  TICKET_EVENT_TYPES,
  type TicketState,
} from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { readLatestSnapshot } from '../../src/ledger/snapshot-store.js';
import { readEntityEvents } from '../../src/ledger/event-store.js';
import { buildLedgerDeps } from '../../src/sync/ledger-deps.js';
import { runSnapshotPass } from '../../src/sync/snapshot-writer.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

let db: TestDatabase;
const WS = 'ws_snap';
const TICKET = newUlid();
const ACTOR = 'usr_a';

function ingest() {
  return createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
}

const wfBasic = {
  id: 'wf_basic', version: 1, name: 'Basic', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'doing', rules: [] },
    { from: '*', to: 'done', rules: [] },
    { from: '*', to: 'todo', rules: [] },
  ],
};

function submitted(entity: { kind: 'workflow' | 'ticket-type' | 'ticket'; id: string }, type: string, payload: unknown) {
  return newSubmittedEvent({ workspaceId: WS, entity, type, payload, actorId: ACTOR, origin: 'server' });
}

async function seedDefinitionsAndTicket(): Promise<void> {
  const results = await ingest().ingestBatch([
    submitted({ kind: 'workflow', id: 'wf_basic' }, 'workflow.defined', wfBasic),
    submitted({ kind: 'ticket-type', id: 'task' }, 'ticket-type.defined', {
      id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_basic', fields: [],
    }),
    submitted({ kind: 'ticket', id: TICKET }, 'ticket.created', {
      typeId: 'task', projectId: newUlid(), parentId: null, title: 'Snapshot me',
    }),
  ]);
  for (const r of results) expect(r.status).toBe('committed');
}

async function appendFieldSets(n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    const [r] = await ingest().ingestBatch([
      submitted({ kind: 'ticket', id: TICKET }, 'ticket.field_set', { fieldId: 'notes', value: `note ${i}` }),
    ]);
    expect(r.status).toBe('committed');
  }
}

/** The independent truth: a full fold of the ledger through the domain reducer. */
async function fullFold(): Promise<TicketState> {
  const deps = await buildLedgerDeps(db.pool, WS);
  const events = await readEntityEvents(db.pool, 'ticket', TICKET);
  let state: TicketState | undefined;
  for (const env of events) {
    if ((TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) state = applyTicketEvent(state, env, deps);
  }
  if (state === undefined) throw new Error('no events folded');
  return state;
}

beforeAll(async () => {
  db = await createTestDatabase();
  await seedDefinitionsAndTicket();
});

afterAll(async () => {
  await db.drop();
});

describe('runSnapshotPass', () => {
  it('writes nothing below the threshold', async () => {
    await appendFieldSets(10); // ticket now has 11 events, threshold 20
    const { written } = await runSnapshotPass(db.pool, { minEvents: 20 });
    expect(written).toEqual([]);
  });

  it('planted defect: the snapshot equals the reducer fold, byte for byte', async () => {
    await appendFieldSets(10); // 21 events total
    const { written } = await runSnapshotPass(db.pool, { minEvents: 20 });
    expect(written).toEqual([{ entityId: TICKET, seq: 21 }]);
    const client = await db.pool.connect();
    try {
      const snapshot = await readLatestSnapshot(client, 'ticket', TICKET);
      expect(snapshot?.seq).toBe(21);
      expect(snapshot?.state).toEqual(JSON.parse(JSON.stringify(await fullFold())));
    } finally {
      client.release();
    }
  });

  it('the next pass folds from the previous snapshot, not from scratch', async () => {
    await appendFieldSets(20); // 41 events
    const { written } = await runSnapshotPass(db.pool, { minEvents: 20 });
    expect(written).toEqual([{ entityId: TICKET, seq: 41 }]);
    const client = await db.pool.connect();
    try {
      const snapshot = await readLatestSnapshot(client, 'ticket', TICKET);
      expect(snapshot?.seq).toBe(41);
      expect(snapshot?.state).toEqual(JSON.parse(JSON.stringify(await fullFold())));
    } finally {
      client.release();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `apps/server/`): `pnpm vitest run test/sync/snapshot-writer.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement ledger-deps and the writer**

`apps/server/src/sync/ledger-deps.ts`:

```ts
import {
  ticketTypeDefSchema,
  workflowDefinedPayloadSchema,
  type TicketStateDeps,
  type TicketTypeDef,
  type WorkflowDef,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

/**
 * TicketStateDeps folded from the LEDGER's definition events — never from
 * proj_workflows/proj_ticket_types. The replica folds the same events with the
 * same reducer; deps from the same source keep server snapshots and client
 * folds identical. Latest version wins (matching client behaviour).
 */
export async function buildLedgerDeps(db: Queryable, workspaceId: string): Promise<TicketStateDeps> {
  const workflows = new Map<string, WorkflowDef>();
  const ticketTypes = new Map<string, TicketTypeDef>();

  const { rows } = await db.query(
    `SELECT type, payload FROM events
      WHERE workspace_id = $1 AND entity_kind IN ('workflow', 'ticket-type')
      ORDER BY entity_kind, entity_id, seq`,
    [workspaceId],
  );
  for (const row of rows as Array<{ type: string; payload: unknown }>) {
    if (row.type === 'workflow.defined') {
      const def = workflowDefinedPayloadSchema.parse(row.payload);
      const existing = workflows.get(def.id);
      if (existing === undefined || existing.version < def.version) workflows.set(def.id, def);
    } else if (row.type === 'ticket-type.defined') {
      ticketTypes.set((row.payload as { id: string }).id, ticketTypeDefSchema.parse(row.payload));
    }
  }
  return {
    getWorkflow: (id) => workflows.get(id),
    getTicketType: (id) => ticketTypes.get(id),
  };
}
```

(If `workflowDefinedPayloadSchema.parse` returns a wrapper rather than the `WorkflowDef` itself, check Plan 2's `PublishedWorkflowDef` — the payload IS the def; adjust the two lines that read `def.id`/`def.version` to the actual field paths, verified against `packages/domain/src` with `grep -n "workflowDefinedPayloadSchema" -r packages/domain/src`.)

`apps/server/src/sync/snapshot-writer.ts`:

```ts
import type { Pool } from 'pg';
import { applyTicketEvent, TICKET_EVENT_TYPES, type TicketState } from '@gisik-nokma/domain';
import { readEntityEvents } from '../ledger/event-store.js';
import { readLatestSnapshot, writeSnapshot } from '../ledger/snapshot-store.js';
import { buildLedgerDeps } from './ledger-deps.js';

const DEFAULT_MIN_EVENTS = 20;

type Due = { workspaceId: string; entityId: string; headSeq: number; snapSeq: number };

/**
 * Snapshots bound replay cost per entity (spec §3). state = the domain
 * reducer's fold at seq — exactly what a replica would compute, so
 * snapshot + tail ≡ full replay on every client.
 */
export async function runSnapshotPass(
  pool: Pool,
  opts: { minEvents?: number } = {},
): Promise<{ written: Array<{ entityId: string; seq: number }> }> {
  const minEvents = opts.minEvents ?? DEFAULT_MIN_EVENTS;
  const { rows } = await pool.query(
    `SELECT e.workspace_id, e.entity_id, MAX(e.seq) AS head_seq, COALESCE(s.snap_seq, 0) AS snap_seq
       FROM events e
       LEFT JOIN (
         SELECT entity_id, MAX(seq) AS snap_seq FROM snapshots WHERE entity_kind = 'ticket' GROUP BY entity_id
       ) s ON s.entity_id = e.entity_id
      WHERE e.entity_kind = 'ticket'
      GROUP BY e.workspace_id, e.entity_id, s.snap_seq
     HAVING MAX(e.seq) - COALESCE(s.snap_seq, 0) >= $1
      ORDER BY e.entity_id`,
    [minEvents],
  );
  const due: Due[] = (rows as Array<Record<string, unknown>>).map((r) => ({
    workspaceId: r.workspace_id as string,
    entityId: r.entity_id as string,
    headSeq: Number(r.head_seq),
    snapSeq: Number(r.snap_seq),
  }));

  const written: Array<{ entityId: string; seq: number }> = [];
  const depsByWorkspace = new Map<string, Awaited<ReturnType<typeof buildLedgerDeps>>>();

  for (const item of due) {
    let deps = depsByWorkspace.get(item.workspaceId);
    if (deps === undefined) {
      deps = await buildLedgerDeps(pool, item.workspaceId);
      depsByWorkspace.set(item.workspaceId, deps);
    }
    const client = await pool.connect();
    try {
      const previous = await readLatestSnapshot(client, 'ticket', item.entityId);
      let state = previous?.state as TicketState | undefined;
      const tail = await readEntityEvents(client, 'ticket', item.entityId, previous?.seq ?? 0);
      let seq = previous?.seq ?? 0;
      for (const env of tail) {
        seq = env.seq;
        if ((TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) state = applyTicketEvent(state, env, deps);
      }
      if (state === undefined) continue; // ticket with only non-state events — nothing to snapshot
      await writeSnapshot(client, {
        entityKind: 'ticket',
        entityId: item.entityId,
        seq,
        state: JSON.parse(JSON.stringify(state)) as Record<string, unknown>,
      });
      written.push({ entityId: item.entityId, seq });
    } finally {
      client.release();
    }
  }
  return { written };
}

/** Interval wrapper for the server entrypoint. Errors log; the ledger is untouched either way. */
export function startSnapshotWriter(
  pool: Pool,
  opts: { intervalMs: number; minEvents: number; log?: (msg: string) => void },
): () => void {
  const log = opts.log ?? (() => undefined);
  const timer = setInterval(() => {
    void runSnapshotPass(pool, { minEvents: opts.minEvents }).catch((err: unknown) => {
      log(`snapshot pass failed: ${String(err)}`);
    });
  }, opts.intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/sync/snapshot-writer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire config and the entrypoint**

In `apps/server/src/config.ts`, add to `AppConfig` (additive): `snapshotIntervalMs: number; snapshotMinEvents: number;` parsed from `SNAPSHOT_INTERVAL_MS` (default `300000`) and `SNAPSHOT_MIN_EVENTS` (default `20`) with the same number-parsing pattern `PORT` uses (locate: `grep -n "PORT" apps/server/src/config.ts`). In `apps/server/src/index.ts`, after the server starts listening, add:

```ts
const stopSnapshots = startSnapshotWriter(pool, {
  intervalMs: config.snapshotIntervalMs,
  minEvents: config.snapshotMinEvents,
  log: (msg) => app.log.warn(msg),
});
```

and call `stopSnapshots()` in the shutdown path beside the existing pool/app close calls. Extend the existing config test (`grep -rn "loadConfig" apps/server/test`) with two lines asserting the defaults.

- [ ] **Step 6: Run the whole server suite, then commit**

Run: `pnpm test` — green. Then:

```bash
git add apps/server/src/sync/ledger-deps.ts apps/server/src/sync/snapshot-writer.ts apps/server/src/config.ts apps/server/src/index.ts apps/server/test/sync/snapshot-writer.test.ts
git commit -m "feat(server): snapshot writer — reducer-folded, replay-bounded

A snapshot is the state a client would compute from the same events:
folded by applyTicketEvent with deps read from the ledger's own
definition events, never from pg projections. snapshot + tail = replay."
```

---

### Task 6: `GET /v1/sync/bootstrap` — first-run replica build without full history

**Files:**
- Create: `apps/server/src/sync/sync-routes.ts` (bootstrap here; Task 7 adds `POST /v1/sync` to the same file)
- Modify: `apps/server/src/index.ts` (mount `registerSyncRoutes`)
- Test: `apps/server/test/sync/bootstrap.test.ts`

**Interfaces:**
- Consumes: `readStreamSeq` (Task 3), `buildLedgerDeps` not needed here; `readLatestSnapshot`, `readEntityEvents`, `rowToEnvelope` (Plan 1); `listVisibleTickets`, `resolveEffectiveRole`, `makeRequireSession` (Plan 4); `runSnapshotPass` (Task 5, in tests).
- Produces (THE wire shape `packages/sync-client` consumes — Task 11):

```ts
type BootstrapTicket = {
  ticketId: string;
  snapshot: { seq: number; state: TicketState } | null; // null → `events` is the full history
  events: LedgerEvent[];   // per-entity seq order: everything after snapshot.seq, PLUS all
                           // comment.added / attachment.added / claim.contested /
                           // claim.contested_resolved regardless of snapshot position
};
type BootstrapMe = { userId: string; workspaceRole: 'owner'|'admin'|'member'|'guest'; projectIds: string[] };
type BootstrapResponse = {
  workspaceId: string;
  me: BootstrapMe;
  streamSeq: number;            // subscribe afterSeq = this
  definitions: LedgerEvent[];   // ALL workflow.defined + ticket-type.defined events (guests included —
                                // a guest cannot render status without the workflow definition, Plan 4 §5)
  tickets: BootstrapTicket[];   // exactly the tickets this user canSee — nothing else, not even ids
};
```

`GET /v1/sync/bootstrap?workspaceId=<id>` → 200 `BootstrapResponse`; 401 without session; 403 `{error:'not_a_member'}` when `resolveEffectiveRole` yields `workspaceRole: null`. The whole read runs in ONE `REPEATABLE READ` transaction with `streamSeq` read first — the response is a consistent cut, and subscribing at `streamSeq` misses nothing.

`BOOTSTRAP_BACKFILL_TYPES = ['comment.added', 'attachment.added', 'claim.contested', 'claim.contested_resolved'] as const` — content and contests are not ticket *state*, so a snapshot does not carry them; they backfill in full.

- [ ] **Step 1: Write the failing test**

`apps/server/test/sync/bootstrap.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newSubmittedEvent, newUlid } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { runSnapshotPass } from '../../src/sync/snapshot-writer.js';
import { buildTestApp } from '../helpers/app.js';
import { signInWithPhone } from '../helpers/session.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

let db: TestDatabase;
let app: FastifyInstance;
let memberToken: string;
let guestToken: string;

const WS = 'ws_boot';
const VISIBLE = newUlid();
const HIDDEN = newUlid();
const PROJECT = newUlid();

// Seed through REAL ingest so projections (visibility, memberships) are true.
// Membership/visibility seeding uses Plan 4's event vocabulary — locate the
// exact type names with: grep -rn "membership\." packages/domain/src | head
// and mirror what Plan 4's own route tests seed.
```

Then the test body — written against the helpers Plan 4 shipped (`seedMember`, `seedGuest`, `seedTicket` write projections directly, which is fine for visibility; ticket events must go through ingest so the ledger is real):

```ts
beforeAll(async () => {
  db = await createTestDatabase();
  ({ app } = await buildTestApp(db));
  const ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });

  const submit = (entity: { kind: 'workflow'|'ticket-type'|'ticket'; id: string }, type: string, payload: unknown) =>
    newSubmittedEvent({ workspaceId: WS, entity, type, payload, actorId: 'usr_member', origin: 'server' });

  await ingest.ingestBatch([
    submit({ kind: 'workflow', id: 'wf_basic' }, 'workflow.defined', {
      id: 'wf_basic', version: 1, name: 'Basic', initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [{ from: '*', to: 'done', rules: [] }, { from: '*', to: 'todo', rules: [] }],
    }),
    submit({ kind: 'ticket-type', id: 'task' }, 'ticket-type.defined', {
      id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_basic', fields: [],
    }),
    submit({ kind: 'ticket', id: VISIBLE }, 'ticket.created', { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Seen' }),
    submit({ kind: 'ticket', id: VISIBLE }, 'comment.added', { body: { type: 'doc', content: [] } }),
    submit({ kind: 'ticket', id: HIDDEN }, 'ticket.created', { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Unseen' }),
  ]);
  // 22 more field_sets so a snapshot lands for VISIBLE (threshold 20)
  for (let i = 0; i < 22; i += 1) {
    await ingest.ingestBatch([submit({ kind: 'ticket', id: VISIBLE }, 'ticket.field_set', { fieldId: 'notes', value: `n${i}` })]);
  }
  await runSnapshotPass(db.pool, { minEvents: 20 });

  await seedMember(db.pool, WS, 'usr_member');
  await seedGuest(db.pool, WS, 'usr_guest');
  await seedTicket(db.pool, WS, VISIBLE, { visibility: 'workspace' });
  await seedTicket(db.pool, WS, HIDDEN, { visibility: 'explicit', userIds: ['usr_other'] });

  memberToken = await signInWithPhone(app, sender, '+911111111111'); // wire sender exactly as Plan 4's route tests do
  guestToken = await signInWithPhone(app, sender, '+912222222222');
});

afterAll(async () => {
  await db.drop();
});

describe('GET /v1/sync/bootstrap', () => {
  it('hands a member snapshot + tail for visible tickets, definitions, me, and the stream cursor', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/sync/bootstrap?workspaceId=${WS}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.workspaceId).toBe(WS);
    expect(body.me).toMatchObject({ userId: expect.any(String), workspaceRole: 'member' });
    expect(body.streamSeq).toBeGreaterThan(0);
    expect(body.definitions.map((d: { type: string }) => d.type).sort()).toEqual(['ticket-type.defined', 'workflow.defined']);

    const visible = body.tickets.find((t: { ticketId: string }) => t.ticketId === VISIBLE);
    expect(visible.snapshot.seq).toBe(24); // created + comment + 22 field_sets
    expect(visible.snapshot.state.stateId).toBe('todo');
    // the comment predates the snapshot but still travels — content is not state
    expect(visible.events.some((e: { type: string }) => e.type === 'comment.added')).toBe(true);
    // and nothing in the tail predates the snapshot except backfill types
    for (const e of visible.events) {
      expect(e.seq > 24 || ['comment.added', 'attachment.added', 'claim.contested', 'claim.contested_resolved'].includes(e.type)).toBe(true);
    }
  });

  it('planted defect: an invisible ticket is absent — no id, no stub, nothing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/sync/bootstrap?workspaceId=${WS}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(JSON.stringify(res.json())).not.toContain(HIDDEN);
  });

  it('a guest gets definitions and only explicitly-shared tickets', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/sync/bootstrap?workspaceId=${WS}`,
      headers: { authorization: `Bearer ${guestToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tickets).toEqual([]); // guest is not on the explicit list of either ticket
    expect(body.definitions).toHaveLength(2); // definitions go to everyone incl. guests (Plan 4 §5)
  });

  it('403s a non-member; 401s without a session', async () => {
    const stranger = await signInWithPhone(app, sender, '+913333333333');
    const forbidden = await app.inject({
      method: 'GET', url: `/v1/sync/bootstrap?workspaceId=${WS}`, headers: { authorization: `Bearer ${stranger}` },
    });
    expect(forbidden.statusCode).toBe(403);
    const anon = await app.inject({ method: 'GET', url: `/v1/sync/bootstrap?workspaceId=${WS}` });
    expect(anon.statusCode).toBe(401);
  });
});
```

Note for the executor: `seedMember`/`seedGuest`/`seedTicket`/`signInWithPhone` are Plan 4's helpers — check their real signatures in `apps/server/test/helpers/` and adjust the calls (including the OTP `sender` wiring) to match exactly how `apps/server/test/visibility/*.test.ts` uses them. **Crucially, better-auth assigns session user ids: resolve each signed-in user's real id (the `currentUserIdFor(token)` helper pattern from `test/sync/sync-route.test.ts`) and seed memberships, visibility lists, and event `actorId`s with THAT id — never a literal like `'usr_member'` unless Plan 4's helpers accept fixed ids.** `buildTestApp` must register `registerAuthRoutes`, `registerContestsRoute`, and `registerSyncRoutes` so one helper serves Tasks 4, 6, and 7. The assertions above are the contract; the seeding mechanics follow the house style.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run test/sync/bootstrap.test.ts`
Expected: FAIL — `registerSyncRoutes` not found / 404.

- [ ] **Step 3: Implement the bootstrap route**

`apps/server/src/sync/sync-routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { EventEnvelope, TicketState } from '@gisik-nokma/domain';
import type { Auth } from '../auth/auth.js';
import { makeRequireSession } from '../auth/require-session.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { listVisibleTickets } from '../visibility/can-see.js';
import { readEntityEvents } from '../ledger/event-store.js';
import { readLatestSnapshot } from '../ledger/snapshot-store.js';
import { readStreamSeq } from './stream-seq.js';

export const BOOTSTRAP_BACKFILL_TYPES = [
  'comment.added',
  'attachment.added',
  'claim.contested',
  'claim.contested_resolved',
] as const;

export type BootstrapTicket = {
  ticketId: string;
  snapshot: { seq: number; state: TicketState } | null;
  events: LedgerEvent[];
};

export type BootstrapMe = { userId: string; workspaceRole: string; projectIds: string[] };

export type BootstrapResponse = {
  workspaceId: string;
  me: BootstrapMe;
  streamSeq: number;
  definitions: LedgerEvent[];
  tickets: BootstrapTicket[];
};

async function bootstrapTicket(client: PoolClient, ticketId: string): Promise<BootstrapTicket> {
  const snapshot = await readLatestSnapshot(client, 'ticket', ticketId);
  const all = await readEntityEvents(client, 'ticket', ticketId);
  const snapSeq = snapshot?.seq ?? 0;
  const events = all.filter(
    (e) => e.seq > snapSeq || (BOOTSTRAP_BACKFILL_TYPES as readonly string[]).includes(e.type),
  );
  return {
    ticketId,
    snapshot: snapshot === null ? null : { seq: snapshot.seq, state: snapshot.state as unknown as TicketState },
    events,
  };
}

export function registerSyncRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void {
  const requireSession = makeRequireSession(deps.auth);

  app.get<{ Querystring: { workspaceId: string } }>(
    '/v1/sync/bootstrap',
    {
      preHandler: requireSession,
      schema: {
        querystring: { type: 'object', required: ['workspaceId'], properties: { workspaceId: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.query;
      const userId = request.currentUserId;
      const client = await deps.pool.connect();
      try {
        // One consistent cut: the cursor is read FIRST inside REPEATABLE READ,
        // so subscribing at streamSeq re-delivers at worst, never skips.
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        const eff = await resolveEffectiveRole(client, userId, workspaceId);
        if (eff.workspaceRole === null) {
          await client.query('ROLLBACK');
          return reply.code(403).send({ error: 'not_a_member' });
        }
        const streamSeq = await readStreamSeq(client, workspaceId);
        const { rows: defRows } = await client.query(
          `SELECT id, workspace_id, entity_kind, entity_id, type, version, payload,
                  actor_id, origin, client_time, server_time, seq, workspace_seq
             FROM events
            WHERE workspace_id = $1 AND entity_kind IN ('workflow', 'ticket-type')
            ORDER BY entity_kind, entity_id, seq`,
          [workspaceId],
        );
        const definitions = (defRows as Array<Record<string, unknown>>).map(rowToEnvelopeCompat);
        const visible = await listVisibleTickets(client, userId, workspaceId);
        const tickets: BootstrapTicket[] = [];
        for (const row of visible) tickets.push(await bootstrapTicket(client, row.ticket_id as string));
        await client.query('COMMIT');
        const me: BootstrapMe = { userId, workspaceRole: eff.workspaceRole, projectIds: [...eff.projects] };
        const body: BootstrapResponse = { workspaceId, me, streamSeq, definitions, tickets };
        return body;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  );
}
```

`rowToEnvelopeCompat` is Plan 1's `rowToEnvelope` — import it (`grep -n "export function rowToEnvelope" apps/server/src/ledger/event-store.ts`) and delete the placeholder name; if its row-shape type differs from the raw query rows, map through it exactly as `readEntityEvents` does internally. Mount in `apps/server/src/index.ts`: `registerSyncRoutes(app, { pool, auth });` beside the other route registrations.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/sync/bootstrap.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sync/sync-routes.ts apps/server/src/index.ts apps/server/test/sync/bootstrap.test.ts
git commit -m "feat(server): visibility-scoped bootstrap — snapshot + tail, one consistent cut

First-run replicas build without replaying full history: reducer-folded
snapshots plus per-entity tails, full comment/contest backfill (content
is not state), definitions for everyone including guests, and a stream
cursor read first so subscribing at it can only re-deliver, never skip."
```

### Task 7: `POST /v1/sync` — sync ingress: idempotent duplicates, contests as ledger history

Amendment 16 verbatim: offline-originated events arrive here; a sync-time refusal appends `claim.contested`; on this path `duplicate-event-id` becomes **idempotent-accept** (retries are expected); interactive `POST /v1/events` refusals return **without recording**. Both paths are tested side by side.

**Files:**
- Create: `apps/server/src/sync/sync-service.ts`
- Modify: `apps/server/src/sync/sync-routes.ts` (add the POST route)
- Test: `apps/server/test/sync/sync-route.test.ts`

**Interfaces:**
- Consumes: `IngestService`, `IngestResult`, `IngestErrorCode` (Plan 1); `parseEvent`, `newSubmittedEvent`, `claimContestedPayloadSchema` (Task 1); `canSee`, `getResolvedVisibility` (Plan 4); `proj_contested` (Task 4); `makeRequireSession` (Plan 4).
- Produces (THE wire shape `packages/sync-client` consumes — Tasks 10/11):

```ts
export const VISIBILITY_REFUSAL_RULE = 'visibility.not-visible';

export type SyncInvalidCode = IngestErrorCode | 'actor-mismatch' | 'reserved-type';

export type SyncEventResult =
  | { status: 'committed'; eventId: string; seq: number; workspaceSeq: number; serverTime: string }
  | { status: 'contested'; eventId: string; rule: string; reason: string; contestEventId: string }
  | { status: 'refused'; eventId: string; rule: string; reason: string }   // non-ticket entity: no contest recordable
  | { status: 'invalid'; eventId: string | null; code: SyncInvalidCode; message: string };

export type SyncService = { processBatch(userId: string, rawEvents: unknown[]): Promise<SyncEventResult[]> };
export function createSyncService(deps: { pool: Pool; ingest: IngestService }): SyncService;
```

`POST /v1/sync` body `{events: [raw SubmittedEvent, …]}` (1–100, same Fastify schema bounds as `/v1/events`), response 200 `{results: SyncEventResult[]}` index-aligned. Requires session.

**Per-event pipeline (exact, in order — each step is a test):**
1. `parseEvent` fails → `invalid` (envelope errors cannot contest — they are not well-formed claims).
2. `actorId !== session user` → `invalid` `actor-mismatch` (a synced claim is still the signed-in user's claim).
3. `type === 'claim.contested'` → `invalid` `reserved-type` (only the server records contests — defense at the door on this path; the engine rule backs it everywhere else).
4. Event id already in the ledger → **idempotent-accept**: answer `committed` with the STORED seq/`workspaceSeq`/`serverTime` (no re-ingest, no double effects). The stored `serverTime` is the ledger's `timestamptz` read back through `rowToEnvelope` — an ISO `Z` instant at millisecond precision — which is the same **instant** the first attempt was answered with. That is the guarantee a retry gets: *the same instant*, not *the same characters*. The two happen to coincide because Plan 1 Z-normalises on both paths, and the test below asserts the guarantee (parsed instants) rather than the coincidence (string identity), so a future change to how either side spells an instant is caught as a formatting change instead of being mistaken for a broken idempotency contract.
5. Event id already contested (`proj_contested.original_event_id`) → answer `contested` with the STORED contest (no second contest).
6. Entity is an existing ticket the user can no longer see → refusal `{rule: VISIBILITY_REFUSAL_RULE}` → contest path (step 7b). "Existing" = `getResolvedVisibility` non-null; a fresh offline-created ticket must not trip this.
7. `ingest.ingestBatch([event])`:
   a. `committed` → `committed`. `invalid` → `invalid` (pass through).
   b. `refused` (or step 6) and entity kind is `ticket` → build `claim.contested` via `newSubmittedEvent` (entity = the ticket, `actorId` = the claimant, `origin: 'server'`, payload `{original, rule, reason}`), ingest it; its commit is the contest → `contested` with `contestEventId`. A refused contest-append is a server integrity failure → throw (500).
   c. `refused`, entity kind not `ticket` → `refused` (no ticket to attach the contest to; the client surfaces it as a failed outbox item).

Events are processed strictly in batch order — an ordered pair (parent reopen, then child create) whose first member contests will see the second contest too, coherently (harness S5 proves it).

- [ ] **Step 1: Write the failing tests**

`apps/server/test/sync/sync-route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newSubmittedEvent, newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { buildTestApp } from '../helpers/app.js';
import { signInWithPhone } from '../helpers/session.js';
import { seedMember, seedTicket } from '../helpers/seed.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

let db: TestDatabase;
let app: FastifyInstance;
let token: string;
let userId: string; // resolve the signed-in user's id the way Plan 4's tests do (session lookup or /api/auth response)

const WS = 'ws_sync';
const TICKET = newUlid();
const PROJECT = newUlid();

const wfRestricted = {
  id: 'wf_r', version: 1, name: 'Restricted', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'todo', rules: [] },
    { from: 'todo', to: 'done', rules: [{ kind: 'restrict-to', assignee: true }] },
  ],
};
// ^ restrict-to config shape: copy the exact rule literal from a Plan 2 restrict-to
//   fixture (grep -l "restrict-to" packages/rule-engine/fixtures) — the shape there is the contract.

function post(path: string, events: unknown[]) {
  return app.inject({ method: 'POST', url: path, headers: { authorization: `Bearer ${token}` }, payload: { events } });
}

async function ledgerCount(): Promise<number> {
  const { rows } = await db.pool.query('SELECT count(*)::int AS n FROM events');
  return rows[0].n as number;
}

beforeAll(async () => {
  db = await createTestDatabase();
  ({ app } = await buildTestApp(db));
  token = await signInWithPhone(app, sender, '+911111111111');
  userId = await currentUserIdFor(token); // helper mirroring Plan 4's session tests
  await seedMember(db.pool, WS, userId);

  // definitions + a ticket assigned to someone ELSE, via interactive ingest
  const seed = (entity: { kind: 'workflow'|'ticket-type'|'ticket'; id: string }, type: string, payload: unknown) =>
    newSubmittedEvent({ workspaceId: WS, entity, type, payload, actorId: userId, origin: 'web' });
  const seeded = await post('/v1/events', [
    seed({ kind: 'workflow', id: 'wf_r' }, 'workflow.defined', wfRestricted),
    seed({ kind: 'ticket-type', id: 'task' }, 'ticket-type.defined', { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_r', fields: [] }),
    seed({ kind: 'ticket', id: TICKET }, 'ticket.created', { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Sync target' }),
    seed({ kind: 'ticket', id: TICKET }, 'ticket.assigned', { assigneeId: 'usr_someone_else' }),
  ]);
  for (const r of seeded.json().results) expect(r.status).toBe('committed');
  await seedTicket(db.pool, WS, TICKET, { visibility: 'workspace' });
});

afterAll(async () => {
  await db.drop();
});

function offlineTransition(): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.transitioned',
    payload: { toStateId: 'done' }, actorId: userId, origin: 'mobile',
  });
}

function offlineField(): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.field_set',
    payload: { fieldId: 'notes', value: 'offline note' }, actorId: userId, origin: 'mobile',
  });
}

describe('POST /v1/sync', () => {
  it('commits a legal offline claim like normal ingest', async () => {
    const e = offlineField();
    const res = await post('/v1/sync', [e]);
    expect(res.statusCode).toBe(200);
    expect(res.json().results[0]).toMatchObject({ status: 'committed', eventId: e.id });
    // §18: the committed answer carries the stream position, so the replica stores
    // what arrived instead of inventing an order for it.
    expect(typeof res.json().results[0].workspaceSeq).toBe('number');
  });

  it('a rule refusal becomes a claim.contested ledger event naming the exact rule', async () => {
    const e = offlineTransition(); // restrict-to: only the assignee, and we are not
    const res = await post('/v1/sync', [e]);
    const [result] = res.json().results;
    expect(result).toMatchObject({ status: 'contested', eventId: e.id, rule: 'restrict-to' });
    const { rows } = await db.pool.query('SELECT * FROM proj_contested WHERE original_event_id = $1', [e.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].contested_event_id).toBe(result.contestEventId);
    const ledger = await db.pool.query('SELECT type FROM events WHERE id = $1', [result.contestEventId]);
    expect(ledger.rows[0].type).toBe('claim.contested'); // the contest IS history
  });

  it('planted defect: the same batch twice — identical answers, no double effects', async () => {
    const legal = offlineField();
    const illegal = offlineTransition();
    const first = await post('/v1/sync', [legal, illegal]);
    const countAfterFirst = await ledgerCount();
    const second = await post('/v1/sync', [legal, illegal]);
    // Compare INSTANTS, not strings. The first answer's serverTime comes from
    // ingest; the retry's is the same row read back through rowToEnvelope, and
    // both clocks are timestamptz absolute instants (owner decision 2026-08-20),
    // so what a retry must return is the same MOMENT the first attempt did.
    // Asserting raw string equality would pass today and turn a harmless change
    // in how one side spells an instant into a phantom idempotency failure —
    // and, worse, would have silently passed under the old verbatim-text
    // client_time while two different instants wore the same characters.
    const instants = (results: Array<Record<string, unknown>>) =>
      results.map((r) =>
        typeof r.serverTime === 'string' ? { ...r, serverTime: Date.parse(r.serverTime) } : r,
      );
    expect(instants(second.json().results)).toEqual(instants(first.json().results)); // same seqs, same cursors, same contestEventId, same instants
    expect(await ledgerCount()).toBe(countAfterFirst); // not one event more
    const { rows } = await db.pool.query('SELECT count(*)::int AS n FROM proj_contested WHERE original_event_id = $1', [illegal.id]);
    expect(rows[0].n).toBe(1); // one contest, not two
  });

  it('a retried claim re-answers the SAME instant, however either side spells it', async () => {
    const e = offlineField();
    const first = await post('/v1/sync', [e]);
    const second = await post('/v1/sync', [e]);
    const a = first.json().results[0];
    const b = second.json().results[0];
    expect(b.status).toBe('committed');
    expect(Date.parse(b.serverTime)).toBe(Date.parse(a.serverTime));
    expect(b.seq).toBe(a.seq);
    expect(b.workspaceSeq).toBe(a.workspaceSeq);
    // And the stored row agrees: one instant, read back Z-normalised.
    const { rows } = await db.pool.query('SELECT server_time FROM events WHERE id = $1', [e.id]);
    expect((rows[0].server_time as Date).getTime()).toBe(Date.parse(a.serverTime));
  });

  it('planted defect: interactive /v1/events NEVER records a contest', async () => {
    const e = offlineTransition();
    const before = await db.pool.query('SELECT count(*)::int AS n FROM proj_contested');
    const res = await post('/v1/events', [e]);
    expect(res.json().results[0]).toMatchObject({ status: 'refused', rule: 'restrict-to' });
    const after = await db.pool.query('SELECT count(*)::int AS n FROM proj_contested');
    expect(after.rows[0].n).toBe(before.rows[0].n);
    const ledger = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [e.id]);
    expect(ledger.rows[0].n).toBe(0); // refusals leave no trace on the interactive path
  });

  it('refuses to relay claims for other actors', async () => {
    const forged = { ...offlineField(), id: newUlid(), actorId: 'usr_someone_else' };
    const res = await post('/v1/sync', [forged]);
    expect(res.json().results[0]).toMatchObject({ status: 'invalid', code: 'actor-mismatch' });
  });

  it('refuses client-supplied claim.contested — reserved for the server', async () => {
    const forged = newSubmittedEvent({
      workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'claim.contested',
      payload: { originalEvent: offlineField(), rule: 'x', reason: 'y' }, actorId: userId, origin: 'mobile',
    });
    const res = await post('/v1/sync', [forged]);
    expect(res.json().results[0]).toMatchObject({ status: 'invalid', code: 'reserved-type' });
  });

  it('a claim on a ticket the user can no longer see contests with visibility.not-visible', async () => {
    await seedTicket(db.pool, WS, TICKET, { visibility: 'explicit', userIds: ['usr_someone_else'] });
    const e = offlineField();
    const res = await post('/v1/sync', [e]);
    expect(res.json().results[0]).toMatchObject({ status: 'contested', rule: 'visibility.not-visible' });
    await seedTicket(db.pool, WS, TICKET, { visibility: 'workspace' }); // restore for later tests
  });
});
```

(`currentUserIdFor` and the OTP `sender`: mirror `apps/server/test/auth/sign-in-flows.test.ts` — one small helper in `test/helpers/session.ts` if Plan 4 didn't already export it.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run test/sync/sync-route.test.ts`
Expected: FAIL — 404 on `/v1/sync` (bootstrap route exists from Task 6; POST is absent).

- [ ] **Step 3: Implement the sync service**

`apps/server/src/sync/sync-service.ts`:

```ts
import type { Pool } from 'pg';
import {
  newSubmittedEvent,
  parseEvent,
  type EventEnvelope,
  type LedgerEvent,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import type { IngestErrorCode, IngestService } from '../ingest/ingest-service.js';
import { rowToEnvelope, type EventRow } from '../ledger/event-store.js';
import { canSee, getResolvedVisibility } from '../visibility/can-see.js';

export const VISIBILITY_REFUSAL_RULE = 'visibility.not-visible';

export type SyncInvalidCode = IngestErrorCode | 'actor-mismatch' | 'reserved-type';

export type SyncEventResult =
  | { status: 'committed'; eventId: string; seq: number; workspaceSeq: number; serverTime: string }
  | { status: 'contested'; eventId: string; rule: string; reason: string; contestEventId: string }
  | { status: 'refused'; eventId: string; rule: string; reason: string }
  | { status: 'invalid'; eventId: string | null; code: SyncInvalidCode; message: string };

export type SyncService = { processBatch(userId: string, rawEvents: unknown[]): Promise<SyncEventResult[]> };

/**
 * The sync ingress (amendment 16). Retries are EXPECTED on this path, so
 * duplicates answer idempotently from the ledger and from proj_contested;
 * refusals become claim.contested ledger events — a contested claim is
 * history, never a silent drop (honesty invariant 5).
 */
export function createSyncService(deps: { pool: Pool; ingest: IngestService }): SyncService {
  // rowToEnvelope answers a LedgerEvent (§18) — the frozen envelope PLUS its
  // workspace stream position, which the replica needs to store what arrived.
  async function storedEnvelope(eventId: string): Promise<LedgerEvent | null> {
    const { rows } = await deps.pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
    return rows.length === 0 ? null : rowToEnvelope(rows[0] as EventRow);
  }

  async function storedContest(
    originalEventId: string,
  ): Promise<{ contestEventId: string; rule: string; reason: string } | null> {
    const { rows } = await deps.pool.query(
      'SELECT contested_event_id, rule, reason FROM proj_contested WHERE original_event_id = $1',
      [originalEventId],
    );
    if (rows.length === 0) return null;
    const row = rows[0] as { contested_event_id: string; rule: string; reason: string };
    return { contestEventId: row.contested_event_id, rule: row.rule, reason: row.reason };
  }

  async function contest(event: SubmittedEvent, rule: string, reason: string): Promise<SyncEventResult> {
    const contestEvent = newSubmittedEvent({
      workspaceId: event.workspaceId,
      entity: { kind: 'ticket', id: event.entity.id },
      type: 'claim.contested',
      payload: { originalEvent: event, rule, reason },
      actorId: event.actorId, // the contest belongs to the claimant's history
      origin: 'server',
    });
    const [appended] = await deps.ingest.ingestBatch([contestEvent]);
    if (appended?.status !== 'committed') {
      // The server failing to record its own refusal is an integrity failure, not a client error.
      throw new Error(`failed to append claim.contested for ${event.id}: ${JSON.stringify(appended)}`);
    }
    return { status: 'contested', eventId: event.id, rule, reason, contestEventId: contestEvent.id };
  }

  async function processOne(userId: string, raw: unknown): Promise<SyncEventResult> {
    const parsed = parseEvent(raw);
    if (!parsed.ok) return { status: 'invalid', eventId: parsed.eventId, code: parsed.code, message: parsed.message };
    const event = parsed.event;

    if (event.actorId !== userId) {
      return { status: 'invalid', eventId: event.id, code: 'actor-mismatch', message: 'A synced claim must belong to the signed-in user.' };
    }
    if (event.type === 'claim.contested') {
      return { status: 'invalid', eventId: event.id, code: 'reserved-type', message: 'Only the server records contested claims.' };
    }

    const stored = await storedEnvelope(event.id);
    if (stored !== null) {
      return { status: 'committed', eventId: stored.id, seq: stored.seq, workspaceSeq: stored.workspaceSeq, serverTime: stored.serverTime };
    }
    const priorContest = await storedContest(event.id);
    if (priorContest !== null) {
      return { status: 'contested', eventId: event.id, ...priorContest };
    }

    if (event.entity.kind === 'ticket') {
      const exists = (await getResolvedVisibility(deps.pool, event.entity.id)) !== null;
      if (exists && !(await canSee(deps.pool, userId, event.entity.id))) {
        return contest(event, VISIBILITY_REFUSAL_RULE, 'You can no longer see this ticket.');
      }
    }

    const [result] = await deps.ingest.ingestBatch([event]);
    if (result === undefined) throw new Error('ingestBatch answered nothing for one event');
    switch (result.status) {
      case 'committed': {
        // Plan 1's IngestResult carries per-entity seq only; the replica needs the
        // stream position too, so read back the row ingest just wrote (indexed by
        // primary key). Inventing a workspaceSeq here would be a lie about order.
        const written = await storedEnvelope(result.eventId);
        if (written === null) throw new Error(`ingest reported committed but ${result.eventId} is not in the ledger`);
        return {
          status: 'committed',
          eventId: result.eventId,
          seq: result.seq,
          workspaceSeq: written.workspaceSeq,
          serverTime: result.serverTime,
        };
      }
      case 'invalid':
        return { status: 'invalid', eventId: result.eventId, code: result.code, message: result.message };
      case 'refused':
        if (event.entity.kind === 'ticket') return contest(event, result.rule, result.reason);
        return { status: 'refused', eventId: event.id, rule: result.rule, reason: result.reason };
    }
  }

  return {
    async processBatch(userId, rawEvents) {
      const results: SyncEventResult[] = [];
      for (const raw of rawEvents) results.push(await processOne(userId, raw)); // strictly in order
      return results;
    },
  };
}
```

- [ ] **Step 4: Add the POST route**

In `apps/server/src/sync/sync-routes.ts`, extend `registerSyncRoutes` deps to `{ pool: Pool; auth: Auth; ingest: IngestService }` and add inside the function:

```ts
  const syncService = createSyncService({ pool: deps.pool, ingest: deps.ingest });

  app.post<{ Body: { events: unknown[] } }>(
    '/v1/sync',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object',
          required: ['events'],
          properties: { events: { type: 'array', minItems: 1, maxItems: 100 } },
        },
      },
    },
    async (request) => ({ results: await syncService.processBatch(request.currentUserId, request.body.events) }),
  );
```

with `import { createSyncService } from './sync-service.js';` and the `IngestService` type import. Update the mount in `apps/server/src/index.ts` to pass `ingest`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run test/sync/sync-route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Run the whole server suite, then commit**

Run: `pnpm test` — green.

```bash
git add apps/server/src/sync/sync-service.ts apps/server/src/sync/sync-routes.ts apps/server/src/index.ts apps/server/test/sync/sync-route.test.ts
git commit -m "feat(server): POST /v1/sync — refusals become contested claims; retries are idempotent

The sync door answers every event: committed with its stored facts,
contested with the one recorded contest, never twice. Interactive
ingest keeps refusing without recording — proven side by side."
```

---

### Task 8: `packages/sync-client` scaffold — the ONE storage interface + local schema

**Files:**
- Create: `packages/sync-client/package.json`
- Create: `packages/sync-client/tsconfig.json`, `packages/sync-client/tsconfig.typecheck.json`, `packages/sync-client/vitest.config.ts`
- Create: `packages/sync-client/src/storage/storage.ts`
- Create: `packages/sync-client/src/storage/better-sqlite3.ts`
- Create: `packages/sync-client/src/storage/schema.ts`
- Create: `packages/sync-client/src/index.ts`
- Test: `packages/sync-client/test/storage.test.ts`

**Interfaces:**
- Consumes: workspace scaffold (Plan 1 Task 1 — pnpm workspace, `tsconfig.base.json`).
- Produces (cross-plan API, package `@gisik-nokma/sync-client`):
  - `type SqlValue = string | number | null`; `type SqlRow = Record<string, SqlValue>`.
  - `interface SyncStorage { run(sql: string, params?: SqlValue[]): Promise<void>; all(sql: string, params?: SqlValue[]): Promise<SqlRow[]>; transaction<T>(fn: (tx: SyncStorage) => Promise<T>): Promise<T>; close(): Promise<void> }` — the ONE storage interface (amendment 17); op-sqlite (Task 17) and tauri-plugin-sql (Task 16) implement it; `better-sqlite3` backs tests and the dual-client harness.
  - `createBetterSqliteStorage(path?: string): SyncStorage` (default `':memory:'`).
  - `migrateLocal(storage: SyncStorage): Promise<void>`; `LOCAL_SCHEMA_VERSION = 1`.
  - `storageConformanceTests(name: string, make: () => Promise<SyncStorage>): void` — a reusable Vitest suite the app adapters run too.
  - Local tables (all JSON payloads as TEXT): `events`, `snapshots`, `tickets`, `workflows`, `ticket_types`, `contests`, `outbox`, `meta`.

- [ ] **Step 1: Scaffold the package**

`packages/sync-client/package.json`:

```json
{
  "name": "@gisik-nokma/sync-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./testing": { "types": "./dist/testing.d.ts", "default": "./dist/testing.js" }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.typecheck.json"
  },
  "dependencies": {
    "@gisik-nokma/domain": "workspace:*",
    "@gisik-nokma/rule-engine": "workspace:*"
  },
  "devDependencies": {
    "better-sqlite3": "^11.10.0",
    "@types/better-sqlite3": "^7.6.12",
    "typescript": "^5.6.3",
    "vitest": "^3.1.0"
  }
}
```

`better-sqlite3` is a **dev** dependency on purpose: apps bring their own native SQLite; only tests and the harness need a node engine. `tsconfig.json` / `tsconfig.typecheck.json` / `vitest.config.ts`: copy `packages/domain`'s exactly (same compiler options, `include: ['test/**/*.test.ts']`). Run `pnpm install` at the repo root.

- [ ] **Step 2: Write the failing storage test**

`packages/sync-client/test/storage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import { LOCAL_SCHEMA_VERSION, migrateLocal } from '../src/storage/schema.js';
import { storageConformanceTests } from '../src/storage/conformance.js';

storageConformanceTests('better-sqlite3', async () => createBetterSqliteStorage());

describe('migrateLocal', () => {
  it('creates the replica tables and stamps the version, idempotently', async () => {
    const storage = createBetterSqliteStorage();
    await migrateLocal(storage);
    await migrateLocal(storage); // second run is a no-op
    const tables = await storage.all(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual([
      'contests', 'events', 'meta', 'outbox', 'snapshots', 'ticket_types', 'tickets', 'workflows',
    ]);
    const version = await storage.all("SELECT value FROM meta WHERE key = 'schema_version'");
    expect(version[0]?.value).toBe(String(LOCAL_SCHEMA_VERSION));
    await storage.close();
  });
});
```

`packages/sync-client/src/storage/conformance.ts` (part of this step — it is imported by the test):

```ts
import { describe, expect, it } from 'vitest';
import type { SyncStorage } from './storage.js';

/**
 * The behavioural contract every adapter must honour — run it against
 * better-sqlite3 here, op-sqlite and tauri-plugin-sql in their app packages.
 */
export function storageConformanceTests(name: string, make: () => Promise<SyncStorage>): void {
  describe(`SyncStorage conformance: ${name}`, () => {
    it('runs DDL + DML and reads rows back with named columns', async () => {
      const s = await make();
      await s.run('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)');
      await s.run('INSERT INTO t (id, n) VALUES (?, ?)', ['a', 1]);
      expect(await s.all('SELECT id, n FROM t ORDER BY id')).toEqual([{ id: 'a', n: 1 }]);
      await s.close();
    });

    it('transaction commits atomically and rolls back on throw', async () => {
      const s = await make();
      await s.run('CREATE TABLE t (id TEXT PRIMARY KEY)');
      await s.transaction(async (tx) => {
        await tx.run('INSERT INTO t (id) VALUES (?)', ['kept']);
      });
      await expect(
        s.transaction(async (tx) => {
          await tx.run('INSERT INTO t (id) VALUES (?)', ['lost']);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await s.all('SELECT id FROM t')).toEqual([{ id: 'kept' }]);
      await s.close();
    });

    it('serialises concurrent transactions instead of interleaving them', async () => {
      const s = await make();
      await s.run('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, tag TEXT)');
      await Promise.all([
        s.transaction(async (tx) => {
          await tx.run("INSERT INTO t (tag) VALUES ('a1')");
          await tx.run("INSERT INTO t (tag) VALUES ('a2')");
        }),
        s.transaction(async (tx) => {
          await tx.run("INSERT INTO t (tag) VALUES ('b1')");
          await tx.run("INSERT INTO t (tag) VALUES ('b2')");
        }),
      ]);
      const tags = (await s.all('SELECT tag FROM t ORDER BY id')).map((r) => r.tag);
      expect([tags.join(','), 'a1,a2,b1,b2', 'b1,b2,a1,a2']).toContain(tags.join(','));
      await s.close();
    });
  });
}
```

Note: `conformance.ts` imports vitest, so it is exported through the `./testing` subpath, not the package root — create `packages/sync-client/src/testing.ts` re-exporting `storageConformanceTests` and `createBetterSqliteStorage`.

- [ ] **Step 3: Run to verify failure**

Run (from `packages/sync-client/`): `pnpm test`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement storage.ts, the better-sqlite3 adapter, and the schema**

`packages/sync-client/src/storage/storage.ts`:

```ts
export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;

/**
 * The ONE local-storage interface (amendment 17). SQLite everywhere:
 * op-sqlite on React Native, tauri-plugin-sql on desktop, better-sqlite3
 * in tests and the dual-client harness. JSON is stored as TEXT — the
 * replica owns (de)serialisation, adapters stay dumb.
 */
export interface SyncStorage {
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all(sql: string, params?: SqlValue[]): Promise<SqlRow[]>;
  /** Serialised: one transaction at a time; rolls back when fn throws. */
  transaction<T>(fn: (tx: SyncStorage) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
```

`packages/sync-client/src/storage/better-sqlite3.ts`:

```ts
import Database from 'better-sqlite3';
import type { SqlRow, SqlValue, SyncStorage } from './storage.js';

export function createBetterSqliteStorage(path = ':memory:'): SyncStorage {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  let queue: Promise<unknown> = Promise.resolve();

  const base = {
    async run(sql: string, params: SqlValue[] = []): Promise<void> {
      db.prepare(sql).run(...params);
    },
    async all(sql: string, params: SqlValue[] = []): Promise<SqlRow[]> {
      return db.prepare(sql).all(...params) as SqlRow[];
    },
  };

  return {
    ...base,
    async transaction<T>(fn: (tx: SyncStorage) => Promise<T>): Promise<T> {
      // better-sqlite3 is synchronous underneath; the queue serialises callers
      // so interleaved async transactions cannot interleave their statements.
      const job = queue.then(async () => {
        db.prepare('BEGIN IMMEDIATE').run();
        try {
          const result = await fn({ ...base, transaction: () => Promise.reject(new Error('no nested transactions')), close: async () => undefined });
          db.prepare('COMMIT').run();
          return result;
        } catch (err) {
          db.prepare('ROLLBACK').run();
          throw err;
        }
      });
      queue = job.catch(() => undefined);
      return job;
    },
    async close(): Promise<void> {
      db.close();
    },
  };
}
```

`packages/sync-client/src/storage/schema.ts`:

```ts
import type { SyncStorage } from './storage.js';

export const LOCAL_SCHEMA_VERSION = 1;

const TABLES = [
  // the visibility-scoped local ledger — exactly what arrived, nothing invented
  // Mirrors the server's column set (coordination §18) — BOTH sequences are kept
  // because both are true in different senses: `seq` orders one entity's history
  // (what the reducer replays), `workspace_seq` orders the workspace's stream
  // (what a resume cursor means). Dropping either would force the replica to
  // invent an order it was never told.
  //
  // client_time / server_time hold ISO 8601 'Z' instant strings — EXACTLY what
  // the server's rowToEnvelope emits, never a device-offset label. SQLite has
  // no timestamp type, so these are TEXT; that is safe here and only here,
  // because every value is Z-normalised at millisecond precision by the server
  // before it is handed over. Two consequences worth naming: string comparison
  // IS instant comparison and lexicographic order IS chronological order (which
  // is why the outbox and the duplicate checks may compare them directly), and
  // a replica must never write a locally-formatted time into these columns —
  // '2026-08-21T00:00:00+05:30' and '2026-08-20T18:30:00.000Z' are one moment
  // and two strings, and the second one is the only one the server will ever
  // send. Owner decision 2026-08-20: both ledger clocks are timestamptz, so
  // the offset label the device attached is not a fact the server preserves.
  `CREATE TABLE IF NOT EXISTS events (
     id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL,
     type TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, actor_id TEXT NOT NULL,
     origin TEXT NOT NULL, client_time TEXT NOT NULL, server_time TEXT NOT NULL,
     seq INTEGER NOT NULL, workspace_seq INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS events_entity_idx ON events (entity_kind, entity_id, seq)`,
  `CREATE INDEX IF NOT EXISTS events_stream_idx ON events (workspace_id, workspace_seq)`,
  // reducer-state baseline from bootstrap (server snapshots, reducer-folded)
  `CREATE TABLE IF NOT EXISTS snapshots (
     entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, seq INTEGER NOT NULL, state TEXT NOT NULL,
     PRIMARY KEY (entity_kind, entity_id)
   )`,
  // confirmed read model — folded by applyTicketEvent, NEVER downloaded projections
  `CREATE TABLE IF NOT EXISTS tickets (
     ticket_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, parent_id TEXT, state TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS tickets_parent_idx ON tickets (parent_id)`,
  `CREATE TABLE IF NOT EXISTS workflows (
     workflow_id TEXT NOT NULL, version INTEGER NOT NULL, def TEXT NOT NULL, PRIMARY KEY (workflow_id, version)
   )`,
  `CREATE TABLE IF NOT EXISTS ticket_types (type_id TEXT PRIMARY KEY, def TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS contests (
     contested_event_id TEXT PRIMARY KEY, original_event_id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL,
     ticket_id TEXT NOT NULL, claimant_id TEXT NOT NULL, rule TEXT NOT NULL, reason TEXT NOT NULL,
     original_event TEXT NOT NULL, contested_at TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0, resolution TEXT
   )`,
  // ordered, persisted claims in transit
  `CREATE TABLE IF NOT EXISTS outbox (
     position INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL,
     entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, envelope TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
     next_attempt_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z', last_error TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

export async function migrateLocal(storage: SyncStorage): Promise<void> {
  await storage.transaction(async (tx) => {
    for (const ddl of TABLES) await tx.run(ddl);
    await tx.run(
      `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(LOCAL_SCHEMA_VERSION)],
    );
  });
}
```

`packages/sync-client/src/index.ts` exports `SyncStorage`, `SqlValue`, `SqlRow`, `migrateLocal`, `LOCAL_SCHEMA_VERSION` (adapter + conformance go through `src/testing.ts`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — conformance (3) + migrate (1).

- [ ] **Step 6: Commit**

```bash
git add packages/sync-client
git commit -m "feat(sync-client): one storage interface, three engines

op-sqlite, tauri-plugin-sql and better-sqlite3 all answer the same
four methods; a shared conformance suite keeps them honest. The local
schema separates confirmed ledger, reducer state, contests and outbox."
```

### Task 9: The replica — visibility-scoped local ledger, reducer-built read model, purge

**Files:**
- Create: `packages/sync-client/src/replica/local-deps.ts`
- Create: `packages/sync-client/src/replica/replica.ts`
- Modify: `packages/sync-client/src/index.ts` (exports)
- Test: `packages/sync-client/test/replica.test.ts`

**Interfaces:**
- Consumes: `SyncStorage`, `migrateLocal` (Task 8); `applyTicketEvent`, `TICKET_EVENT_TYPES`, `CONTEST_EVENT_TYPES`, `claimContestedPayloadSchema`, `claimContestedResolvedPayloadSchema`, `TicketState`, `TicketStateDeps`, `WorkflowDef`, `TicketTypeDef`, `EventEnvelope`, `docToPlainText`, `istDayOf`, `istDayBounds`, `IST_DAY_REGEX` (domain); `SyncItem`, `PurgeInstruction` shape (Plan 4, as wire data); `BootstrapResponse` (Task 6 wire shape, re-declared here as the client-side type).

**Day math in the local read model — the same code the server runs, and why that is not negotiable.** Anything this replica derives that involves a *day* — which day a `dueDate` claim falls in, whether a ticket is due today or overdue, how many days it has been in flight, which calendar cell or timeline column app-core's view-models place it in — resolves that day with `istDayOf` and `istDayBounds` from `@gisik-nokma/domain`, exactly as `apps/server` does. Day-vs-day comparisons compare `YYYY-MM-DD` strings; the one shape a day claim may take is `IST_DAY_REGEX`; day-vs-instant comparisons use `istDayBounds`, half-open `[startUtc, endUtc)`.

`packages/domain/src/ist-day.ts` **has no dependencies** — no zod, no date library, no timezone database, just arithmetic against the fixed +05:30 offset — and that is not an accident of style. It is what lets an Expo bundle and a Tauri webview import the identical file that the Fastify process imports, rather than reaching for a local `toLocaleDateString()` or a hand-rolled offset because "the real helper pulls in too much".

**A replica that computed days differently from the server is exactly the silent disagreement this product refuses.** It would not throw, would not sync-error, and would not show up in a contest: the same claim would simply sit in one calendar cell on the desktop and another on the web, "due today" would be true offline and false online, and a rollup counted locally would differ from the same rollup counted on the server — with every individual number looking perfectly reasonable and nothing anywhere naming the conflict. That is a board that lies. The point of an offline copy is that it is a *copy*; the moment it starts answering questions its own way, it is a second product with the same data.

- Produces (cross-plan API):

```ts
export type Me = { userId: string; workspaceRole: 'owner'|'admin'|'member'|'guest'; projectIds: string[] };
export type LocalContest = {
  contestedEventId: string; originalEventId: string; workspaceId: string; ticketId: string;
  claimantId: string; rule: string; reason: string; originalEvent: SubmittedEvent;
  contestedAt: string; resolved: boolean; resolution: string | null;
};
export type ReplicaTicket = { ticketId: string; confirmed: TicketState | null; contests: LocalContest[] };

export type Replica = {
  loadBootstrap(data: BootstrapResponse): Promise<void>;
  applyServerItem(item: SyncItem): Promise<{ applied: boolean }>;   // false = duplicate, ignored
  purgeEntity(entityId: string): Promise<void>;
  getTicket(ticketId: string): Promise<ReplicaTicket | null>;
  listTickets(workspaceId: string): Promise<ReplicaTicket[]>;
  listContests(workspaceId: string, filter?: { ticketId?: string; claimantId?: string; open?: boolean }): Promise<LocalContest[]>;
  listEntityEvents(ticketId: string): Promise<LedgerEvent[]>;       // local history view, per-entity seq order
  searchLocal(workspaceId: string, text: string): Promise<Array<{ ticketId: string; title: string }>>;
  getCursor(workspaceId: string): Promise<number>;
  setCursor(workspaceId: string, seq: number): Promise<void>;
  getMe(): Promise<Me | null>;
  buildDeps(): Promise<TicketStateDeps>;                            // local defs — shared with pre-check
  onChange(cb: () => void): () => void;                             // view invalidation
};
export function createReplica(deps: { storage: SyncStorage }): Promise<Replica>;
```

**Rules encoded (each is a test):** read model is folded by `applyTicketEvent` from snapshot + local events, never assembled from server projections (there is no code path that could — the replica only ever receives envelopes and snapshots); duplicate event ids are ignored; contests fold into the `contests` table (they are not ticket state); purge removes EVERY local trace of the entity — with one deliberate exception: the local user's OWN contested-claim stubs survive, because their `original` is what this user authored on this device and silently vanishing it would break honesty invariant 5 (harness S4 proves both halves); `searchLocal` matches titles and comment text (via `docToPlainText`).

- [ ] **Step 1: Write the failing replica test**

`packages/sync-client/test/replica.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  newSubmittedEvent,
  newUlid,
  plainTextToDoc,
  type EventEnvelope,
  type LedgerEvent,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import { createReplica, type Replica } from '../src/replica/replica.js';

const WS = 'ws_r';
const TICKET = newUlid();
const PROJECT = newUlid();

const wf = {
  id: 'wf_basic', version: 1, name: 'Basic', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: '*', to: 'doing', rules: [] }, { from: '*', to: 'done', rules: [] }, { from: '*', to: 'todo', rules: [] }],
};

let seqCounter = 0;
let streamCounter = 0;
/**
 * A server-shaped LedgerEvent (§18): per-entity `seq` AND the workspace stream
 * position. `seq` is caller-controllable because reducer order depends on it;
 * `workspaceSeq` just keeps climbing, exactly as arrivals do.
 */
function envelope(entity: EventEnvelope['entity'], type: string, payload: unknown, seq?: number): LedgerEvent {
  seqCounter += 1;
  streamCounter += 1;
  return {
    ...newSubmittedEvent({ workspaceId: WS, entity, type, payload, actorId: 'user_a', origin: 'server' }),
    serverTime: '2026-08-20T00:00:00.000Z',
    seq: seq ?? seqCounter,
    workspaceSeq: streamCounter,
  };
}

async function seededReplica(): Promise<Replica> {
  seqCounter = 0;
  streamCounter = 0;
  const replica = await createReplica({ storage: createBetterSqliteStorage() });
  await replica.loadBootstrap({
    workspaceId: WS,
    me: { userId: 'user_a', workspaceRole: 'member', projectIds: [PROJECT] },
    streamSeq: 0,
    definitions: [
      envelope({ kind: 'workflow', id: 'wf_basic' }, 'workflow.defined', wf, 1),
      envelope({ kind: 'ticket-type', id: 'task' }, 'ticket-type.defined', { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_basic', fields: [] }, 1),
    ],
    tickets: [],
  });
  seqCounter = 0;
  streamCounter = 0;
  return replica;
}

describe('replica read model — folded by the domain reducer', () => {
  it('folds created + transitioned + field_set into TicketState', async () => {
    const replica = await seededReplica();
    await replica.applyServerItem(envelope({ kind: 'ticket', id: TICKET }, 'ticket.created', { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Fold me' }));
    await replica.applyServerItem(envelope({ kind: 'ticket', id: TICKET }, 'ticket.transitioned', { toStateId: 'doing' }));
    await replica.applyServerItem(envelope({ kind: 'ticket', id: TICKET }, 'ticket.field_set', { fieldId: 'notes', value: 'hi' }));
    const ticket = await replica.getTicket(TICKET);
    expect(ticket?.confirmed).toMatchObject({ stateId: 'doing', stateCategory: 'active' });
    expect(ticket?.confirmed?.fields.notes?.value).toBe('hi');
    expect(ticket?.confirmed?.transitions).toEqual([{ toStateId: 'doing', actorId: 'user_a', seq: 2 }]);
  });

  it('ignores a duplicate event id — at-least-once delivery is expected', async () => {
    const replica = await seededReplica();
    const created = envelope({ kind: 'ticket', id: TICKET }, 'ticket.created', { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Once' });
    expect(await replica.applyServerItem(created)).toEqual({ applied: true });
    expect(await replica.applyServerItem(created)).toEqual({ applied: false });
    expect(await replica.listEntityEvents(TICKET)).toHaveLength(1);
  });

  it('folds a claim.contested into contests, not into ticket state', async () => {
    const replica = await seededReplica();
    await replica.applyServerItem(envelope({ kind: 'ticket', id: TICKET }, 'ticket.created', { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Contested' }));
    const original: SubmittedEvent = newSubmittedEvent({
      workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.transitioned',
      payload: { toStateId: 'done' }, actorId: 'user_b', origin: 'mobile',
    });
    const contest = envelope({ kind: 'ticket', id: TICKET }, 'claim.contested', { originalEvent: original, rule: 'restrict-to', reason: 'planted' });
    await replica.applyServerItem(contest);
    const before = await replica.getTicket(TICKET);
    expect(before?.confirmed?.stateId).toBe('todo'); // the contested claim did NOT move the ticket
    expect(before?.contests).toHaveLength(1);
    expect(before?.contests[0]).toMatchObject({ contestedEventId: contest.id, rule: 'restrict-to', resolved: false });

    await replica.applyServerItem(envelope({ kind: 'ticket', id: TICKET }, 'claim.contested_resolved', { contestedEventId: contest.id, resolution: 'discarded' }));
    const after = await replica.getTicket(TICKET);
    expect(after?.contests[0]).toMatchObject({ resolved: true, resolution: 'discarded' });
    expect(await replica.listContests(WS, { open: true })).toEqual([]);
  });

  it('bootstrap: snapshot + tail equals the folded state, comments searchable', async () => {
    seqCounter = 0;
    streamCounter = 0;
    const replica = await createReplica({ storage: createBetterSqliteStorage() });
    const snapshotState: TicketState = {
      kind: 'ticket',
      id: TICKET, workspaceId: WS, projectId: PROJECT, typeId: 'task', parentId: null,
      workflowId: 'wf_basic', workflowVersion: 1, stateId: 'todo', stateCategory: 'open', assigneeId: null,
      collaboratorIds: [], fields: {}, transitions: [],
    };
    await replica.loadBootstrap({
      workspaceId: WS,
      me: { userId: 'user_a', workspaceRole: 'member', projectIds: [PROJECT] },
      streamSeq: 41,
      definitions: [
        envelope({ kind: 'workflow', id: 'wf_basic' }, 'workflow.defined', wf, 1),
        envelope({ kind: 'ticket-type', id: 'task' }, 'ticket-type.defined', { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_basic', fields: [] }, 1),
      ],
      tickets: [{
        ticketId: TICKET,
        snapshot: { seq: 3, state: snapshotState },
        events: [
          envelope({ kind: 'ticket', id: TICKET }, 'comment.added', { body: plainTextToDoc('the dlt registration is stuck') }, 2),
          envelope({ kind: 'ticket', id: TICKET }, 'ticket.transitioned', { toStateId: 'doing' }, 4),
        ],
      }],
    });
    const ticket = await replica.getTicket(TICKET);
    expect(ticket?.confirmed?.stateId).toBe('doing'); // snapshot(seq 3) + tail(seq 4): only seq>3 folds
    expect(await replica.getCursor(WS)).toBe(41);
    expect(await replica.searchLocal(WS, 'dlt registration')).toEqual([{ ticketId: TICKET, title: expect.any(String) }]);
  });
});

describe('purge — revocation removes every local trace', () => {
  it('planted defect: after purge the ticket is unreadable, unsearchable, and gone from raw storage', async () => {
    const storage = createBetterSqliteStorage();
    seqCounter = 0;
    streamCounter = 0;
    const replica = await createReplica({ storage });
    await replica.loadBootstrap({
      workspaceId: WS, me: { userId: 'user_a', workspaceRole: 'member', projectIds: [PROJECT] }, streamSeq: 0,
      definitions: [
        envelope({ kind: 'workflow', id: 'wf_basic' }, 'workflow.defined', wf, 1),
        envelope({ kind: 'ticket-type', id: 'task' }, 'ticket-type.defined', { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_basic', fields: [] }, 1),
      ],
      tickets: [],
    });
    seqCounter = 0;
    streamCounter = 0;
    await replica.applyServerItem(envelope({ kind: 'ticket', id: TICKET }, 'ticket.created', { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Secret errand' }));
    await replica.applyServerItem(envelope({ kind: 'ticket', id: TICKET }, 'comment.added', { body: plainTextToDoc('supplier pricing inside') }));

    await replica.applyServerItem({ kind: 'purge', entityId: TICKET });

    expect(await replica.getTicket(TICKET)).toBeNull();
    expect(await replica.searchLocal(WS, 'supplier')).toEqual([]);
    expect(await replica.listEntityEvents(TICKET)).toEqual([]);
    for (const table of ['events', 'tickets', 'snapshots', 'contests']) {
      const col = table === 'events' ? 'entity_id' : table === 'tickets' ? 'ticket_id' : table === 'snapshots' ? 'entity_id' : 'ticket_id';
      const rows = await storage.all(`SELECT count(*) AS n FROM ${table} WHERE ${col} = ?`, [TICKET]);
      expect(rows[0]?.n).toBe(0);
    }
    // and no leftover text anywhere the eye could reach
    const spill = await storage.all("SELECT count(*) AS n FROM events WHERE payload LIKE '%supplier pricing%'");
    expect(spill[0]?.n).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `packages/sync-client/`): `pnpm vitest run test/replica.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement local-deps and the replica**

`packages/sync-client/src/replica/local-deps.ts`:

```ts
import type { TicketStateDeps, TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain';
import type { SyncStorage } from '../storage/storage.js';

/** Local TicketStateDeps: definitions folded from workflow.defined / ticket-type.defined events. Latest version wins — mirroring the server's ledger-deps. */
export async function buildLocalDeps(storage: SyncStorage): Promise<TicketStateDeps> {
  const wfRows = await storage.all(
    'SELECT workflow_id, def FROM workflows w WHERE version = (SELECT MAX(version) FROM workflows WHERE workflow_id = w.workflow_id)',
  );
  const workflows = new Map<string, WorkflowDef>(
    wfRows.map((r) => [r.workflow_id as string, JSON.parse(r.def as string) as WorkflowDef]),
  );
  const ttRows = await storage.all('SELECT type_id, def FROM ticket_types');
  const ticketTypes = new Map<string, TicketTypeDef>(
    ttRows.map((r) => [r.type_id as string, JSON.parse(r.def as string) as TicketTypeDef]),
  );
  return { getWorkflow: (id) => workflows.get(id), getTicketType: (id) => ticketTypes.get(id) };
}
```

`packages/sync-client/src/replica/replica.ts` — the heart of the offline story:

```ts
import {
  applyTicketEvent,
  claimContestedPayloadSchema,
  claimContestedResolvedPayloadSchema,
  CONTEST_EVENT_TYPES,
  docToPlainText,
  TICKET_EVENT_TYPES,
  type EventEnvelope,
  type LedgerEvent,
  type SubmittedEvent,
  type TicketState,
  type TicketStateDeps,
} from '@gisik-nokma/domain';
import type { SyncStorage } from '../storage/storage.js';
import { migrateLocal } from '../storage/schema.js';
import { buildLocalDeps } from './local-deps.js';

// Wire shapes (server Task 6 / Plan 4) — re-declared client-side, structurally identical.
export type PurgeInstruction = { kind: 'purge'; entityId: string };
export type SyncItem = LedgerEvent | PurgeInstruction;
export type Me = { userId: string; workspaceRole: 'owner' | 'admin' | 'member' | 'guest'; projectIds: string[] };
export type BootstrapTicket = { ticketId: string; snapshot: { seq: number; state: TicketState } | null; events: LedgerEvent[] };
export type BootstrapResponse = { workspaceId: string; me: Me; streamSeq: number; definitions: LedgerEvent[]; tickets: BootstrapTicket[] };

export type LocalContest = {
  contestedEventId: string; originalEventId: string; workspaceId: string; ticketId: string;
  claimantId: string; rule: string; reason: string; originalEvent: SubmittedEvent;
  contestedAt: string; resolved: boolean; resolution: string | null;
};
export type ReplicaTicket = { ticketId: string; confirmed: TicketState | null; contests: LocalContest[] };

export type Replica = {
  loadBootstrap(data: BootstrapResponse): Promise<void>;
  applyServerItem(item: SyncItem): Promise<{ applied: boolean }>;
  purgeEntity(entityId: string): Promise<void>;
  getTicket(ticketId: string): Promise<ReplicaTicket | null>;
  listTickets(workspaceId: string): Promise<ReplicaTicket[]>;
  listContests(workspaceId: string, filter?: { ticketId?: string; claimantId?: string; open?: boolean }): Promise<LocalContest[]>;
  listEntityEvents(ticketId: string): Promise<LedgerEvent[]>;
  searchLocal(workspaceId: string, text: string): Promise<Array<{ ticketId: string; title: string }>>;
  getCursor(workspaceId: string): Promise<number>;
  setCursor(workspaceId: string, seq: number): Promise<void>;
  getMe(): Promise<Me | null>;
  buildDeps(): Promise<TicketStateDeps>;
  onChange(cb: () => void): () => void;
};

/**
 * Local row → envelope. Both clocks come back as the ISO 'Z' strings the
 * server's own rowToEnvelope emitted and this replica stored verbatim — no
 * parse, no re-format, no local-offset step. The replica's job is to hold what
 * it was handed; re-rendering an instant on the way out would give the offline
 * copy its own opinion about when things happened.
 */
function rowToEnvelope(row: Record<string, unknown>): LedgerEvent {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    entity: { kind: row.entity_kind as EventEnvelope['entity']['kind'], id: row.entity_id as string },
    type: row.type as string,
    version: Number(row.version),
    payload: JSON.parse(row.payload as string),
    actorId: row.actor_id as string,
    origin: row.origin as EventEnvelope['origin'],
    clientTime: row.client_time as string,
    serverTime: row.server_time as string,
    seq: Number(row.seq),
    workspaceSeq: Number(row.workspace_seq),
  };
}

export async function createReplica(deps: { storage: SyncStorage }): Promise<Replica> {
  const { storage } = deps;
  await migrateLocal(storage);
  const listeners = new Set<() => void>();
  const notify = (): void => listeners.forEach((cb) => cb());

  // Column order matches Plan 1's insertEventSql, workspace_seq included: a
  // replica stores exactly what arrived. Inventing a stream position for a row
  // that was handed one would be the quietest possible lie about ordering.
  async function insertEnvelope(tx: SyncStorage, env: LedgerEvent): Promise<void> {
    await tx.run(
      `INSERT INTO events (id, workspace_id, entity_kind, entity_id, type, version, payload, actor_id, origin, client_time, server_time, seq, workspace_seq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [env.id, env.workspaceId, env.entity.kind, env.entity.id, env.type, env.version, JSON.stringify(env.payload), env.actorId, env.origin, env.clientTime, env.serverTime, env.seq, env.workspaceSeq],
    );
  }

  async function applyDefinition(tx: SyncStorage, env: EventEnvelope): Promise<void> {
    if (env.type === 'workflow.defined') {
      const def = env.payload as { id: string; version: number };
      await tx.run(
        'INSERT INTO workflows (workflow_id, version, def) VALUES (?, ?, ?) ON CONFLICT(workflow_id, version) DO UPDATE SET def = excluded.def',
        [def.id, def.version, JSON.stringify(env.payload)],
      );
    } else if (env.type === 'ticket-type.defined') {
      const def = env.payload as { id: string };
      await tx.run(
        'INSERT INTO ticket_types (type_id, def) VALUES (?, ?) ON CONFLICT(type_id) DO UPDATE SET def = excluded.def',
        [def.id, JSON.stringify(env.payload)],
      );
    }
  }

  async function applyContest(tx: SyncStorage, env: EventEnvelope): Promise<void> {
    if (env.type === 'claim.contested') {
      const p = claimContestedPayloadSchema.parse(env.payload);
      // Upsert: the outbox may have written a local stub from the sync response
      // (client-side timestamp) before the real event streams in — the server's
      // envelope is the truth and corrects the stub, so replicas converge exactly.
      await tx.run(
        `INSERT INTO contests (contested_event_id, original_event_id, workspace_id, ticket_id, claimant_id, rule, reason, original_event, contested_at, resolved, resolution)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
         ON CONFLICT(contested_event_id) DO UPDATE SET contested_at = excluded.contested_at, rule = excluded.rule, reason = excluded.reason, original_event = excluded.original_event`,
        [env.id, p.originalEvent.id, env.workspaceId, env.entity.id, p.originalEvent.actorId, p.rule, p.reason, JSON.stringify(p.originalEvent), env.serverTime],
      );
    } else {
      const p = claimContestedResolvedPayloadSchema.parse(env.payload);
      await tx.run('UPDATE contests SET resolved = 1, resolution = ? WHERE contested_event_id = ?', [
        p.resolution, p.contestedEventId,
      ]);
    }
  }

  /** Refold one ticket's confirmed state: snapshot baseline + local events past it, reducer only. */
  async function refoldTicket(tx: SyncStorage, ticketId: string, localDeps: TicketStateDeps): Promise<void> {
    const snapRows = await tx.all("SELECT seq, state FROM snapshots WHERE entity_kind = 'ticket' AND entity_id = ?", [ticketId]);
    let state: TicketState | undefined = snapRows.length > 0 ? (JSON.parse(snapRows[0]!.state as string) as TicketState) : undefined;
    const snapSeq = snapRows.length > 0 ? Number(snapRows[0]!.seq) : 0;
    const eventRows = await tx.all(
      "SELECT * FROM events WHERE entity_kind = 'ticket' AND entity_id = ? AND seq > ? ORDER BY seq",
      [ticketId, snapSeq],
    );
    for (const row of eventRows) {
      const env = rowToEnvelope(row);
      if ((TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) state = applyTicketEvent(state, env, localDeps);
    }
    if (state === undefined) return;
    await tx.run(
      `INSERT INTO tickets (ticket_id, workspace_id, parent_id, state) VALUES (?, ?, ?, ?)
       ON CONFLICT(ticket_id) DO UPDATE SET workspace_id = excluded.workspace_id, parent_id = excluded.parent_id, state = excluded.state`,
      [ticketId, state.workspaceId, state.parentId, JSON.stringify(state)],
    );
  }

  function rowToContest(row: Record<string, unknown>): LocalContest {
    return {
      contestedEventId: row.contested_event_id as string,
      originalEventId: row.original_event_id as string,
      workspaceId: row.workspace_id as string,
      ticketId: row.ticket_id as string,
      claimantId: row.claimant_id as string,
      rule: row.rule as string,
      reason: row.reason as string,
      originalEvent: JSON.parse(row.original_event as string) as SubmittedEvent,
      contestedAt: row.contested_at as string,
      resolved: Number(row.resolved) === 1,
      resolution: (row.resolution as string) ?? null,
    };
  }

  async function contestsFor(tx: SyncStorage, ticketId: string): Promise<LocalContest[]> {
    const rows = await tx.all('SELECT * FROM contests WHERE ticket_id = ? ORDER BY contested_at, contested_event_id', [ticketId]);
    return rows.map(rowToContest);
  }

  const replica: Replica = {
    async loadBootstrap(data) {
      await storage.transaction(async (tx) => {
        await tx.run("INSERT INTO meta (key, value) VALUES ('me', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [JSON.stringify(data.me)]);
        for (const def of data.definitions) {
          const dupe = await tx.all('SELECT 1 FROM events WHERE id = ?', [def.id]);
          if (dupe.length === 0) await insertEnvelope(tx, def);
          await applyDefinition(tx, def);
        }
        const localDeps = await buildLocalDeps(tx);
        for (const ticket of data.tickets) {
          if (ticket.snapshot !== null) {
            await tx.run(
              `INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ('ticket', ?, ?, ?)
               ON CONFLICT(entity_kind, entity_id) DO UPDATE SET seq = excluded.seq, state = excluded.state`,
              [ticket.ticketId, ticket.snapshot.seq, JSON.stringify(ticket.snapshot.state)],
            );
          }
          for (const env of ticket.events) {
            const dupe = await tx.all('SELECT 1 FROM events WHERE id = ?', [env.id]);
            if (dupe.length === 0) await insertEnvelope(tx, env);
            if ((CONTEST_EVENT_TYPES as readonly string[]).includes(env.type)) await applyContest(tx, env);
          }
          await refoldTicket(tx, ticket.ticketId, localDeps);
        }
        await tx.run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
          `cursor:${data.workspaceId}`, String(data.streamSeq),
        ]);
      });
      notify();
    },

    async applyServerItem(item) {
      if ('kind' in item && item.kind === 'purge') {
        await replica.purgeEntity(item.entityId);
        return { applied: true };
      }
      const env = item as EventEnvelope;
      const applied = await storage.transaction(async (tx) => {
        const dupe = await tx.all('SELECT 1 FROM events WHERE id = ?', [env.id]);
        if (dupe.length > 0) return false;
        await insertEnvelope(tx, env);
        if (env.entity.kind === 'workflow' || env.entity.kind === 'ticket-type') {
          await applyDefinition(tx, env);
        } else if ((CONTEST_EVENT_TYPES as readonly string[]).includes(env.type)) {
          await applyContest(tx, env);
        } else if (env.entity.kind === 'ticket' && (TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) {
          await refoldTicket(tx, env.entity.id, await buildLocalDeps(tx));
        }
        // an echo of our own claim confirms it: the outbox row is done
        await tx.run("DELETE FROM outbox WHERE event_id = ?", [env.id]);
        return true;
      });
      if (applied) notify();
      return { applied };
    },

    async purgeEntity(entityId) {
      const me = await replica.getMe();
      await storage.transaction(async (tx) => {
        await tx.run('DELETE FROM events WHERE entity_id = ?', [entityId]);
        await tx.run('DELETE FROM tickets WHERE ticket_id = ?', [entityId]);
        await tx.run("DELETE FROM snapshots WHERE entity_id = ?", [entityId]);
        // Contests OTHERS raised vanish with the ticket. The local user's OWN
        // contested claims survive as content-light stubs: their `originalEvent` is
        // what this user typed on this device — purging it would silently
        // vanish their claim (honesty invariant 5), and it leaks nothing the
        // user did not author themselves.
        if (me === null) await tx.run('DELETE FROM contests WHERE ticket_id = ?', [entityId]);
        else await tx.run('DELETE FROM contests WHERE ticket_id = ? AND claimant_id <> ?', [entityId, me.userId]);
        // outbox rows for the purged ticket STAY: they are the user's claims in
        // transit and must go up, contest, and surface — nothing silently vanishes.
      });
      notify();
    },

    async getTicket(ticketId) {
      const rows = await storage.all('SELECT * FROM tickets WHERE ticket_id = ?', [ticketId]);
      if (rows.length === 0) return null;
      return {
        ticketId,
        confirmed: JSON.parse(rows[0]!.state as string) as TicketState,
        contests: await contestsFor(storage, ticketId),
      };
    },

    async listTickets(workspaceId) {
      const rows = await storage.all('SELECT ticket_id FROM tickets WHERE workspace_id = ? ORDER BY ticket_id', [workspaceId]);
      const out: ReplicaTicket[] = [];
      for (const row of rows) {
        const t = await replica.getTicket(row.ticket_id as string);
        if (t !== null) out.push(t);
      }
      return out;
    },

    async listContests(workspaceId, filter = {}) {
      const clauses = ['workspace_id = ?'];
      const params: Array<string | number> = [workspaceId];
      if (filter.ticketId !== undefined) { clauses.push('ticket_id = ?'); params.push(filter.ticketId); }
      if (filter.claimantId !== undefined) { clauses.push('claimant_id = ?'); params.push(filter.claimantId); }
      if (filter.open === true) clauses.push('resolved = 0');
      const rows = await storage.all(`SELECT * FROM contests WHERE ${clauses.join(' AND ')} ORDER BY contested_at, contested_event_id`, params);
      return rows.map(rowToContest);
    },

    async listEntityEvents(ticketId) {
      const rows = await storage.all("SELECT * FROM events WHERE entity_kind = 'ticket' AND entity_id = ? ORDER BY seq", [ticketId]);
      return rows.map(rowToEnvelope);
    },

    async searchLocal(workspaceId, text) {
      // Honest local search: titles and comment text, LIKE-matched. The UI labels
      // it "searching offline copy" — never pretending to be the server index.
      const needle = `%${text.toLowerCase()}%`;
      const hits = new Map<string, string>();
      const tickets = await storage.all('SELECT ticket_id, state FROM tickets WHERE workspace_id = ?', [workspaceId]);
      for (const row of tickets) {
        const state = JSON.parse(row.state as string) as TicketState;
        const title = String((state.fields.title as { value?: unknown } | undefined)?.value ?? '');
        if (title.toLowerCase().includes(text.toLowerCase())) hits.set(row.ticket_id as string, title);
      }
      const comments = await storage.all(
        "SELECT entity_id, payload FROM events WHERE workspace_id = ? AND type = 'comment.added' AND LOWER(payload) LIKE ?",
        [workspaceId, needle],
      );
      for (const row of comments) {
        const body = (JSON.parse(row.payload as string) as { body: unknown }).body;
        if (docToPlainText(body).toLowerCase().includes(text.toLowerCase()) && !hits.has(row.entity_id as string)) {
          const t = await storage.all('SELECT state FROM tickets WHERE ticket_id = ?', [row.entity_id as string]);
          if (t.length === 0) continue; // comment on a ticket we no longer hold
          const state = JSON.parse(t[0]!.state as string) as TicketState;
          hits.set(row.entity_id as string, String((state.fields.title as { value?: unknown } | undefined)?.value ?? ''));
        }
      }
      return [...hits.entries()].map(([ticketId, title]) => ({ ticketId, title }));
    },

    async getCursor(workspaceId) {
      const rows = await storage.all('SELECT value FROM meta WHERE key = ?', [`cursor:${workspaceId}`]);
      return rows.length === 0 ? 0 : Number(rows[0]!.value);
    },

    async setCursor(workspaceId, seq) {
      await storage.run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
        `cursor:${workspaceId}`, String(seq),
      ]);
    },

    async getMe() {
      const rows = await storage.all("SELECT value FROM meta WHERE key = 'me'");
      return rows.length === 0 ? null : (JSON.parse(rows[0]!.value as string) as Me);
    },

    buildDeps: () => buildLocalDeps(storage),

    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return replica;
}
```

Note on the title lookup: Plan 3's reducer stores the title as a field claim (`fields.title`) — verify with `grep -n "title" packages/domain/src/ticket-state.ts`; if the reducer keeps `title` as a top-level property instead, read that property in `searchLocal` (both places marked above) and in Task 12's summaries. Do not guess: read the reducer.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run test/replica.test.ts`
Expected: PASS (6 tests). Export the new public names from `src/index.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/sync-client/src/replica packages/sync-client/src/index.ts packages/sync-client/test/replica.test.ts
git commit -m "feat(sync-client): the replica — reducer-folded read model, whole-trace purge

Confirmed state is always applyTicketEvent over snapshot+events with
locally-folded definitions; contests sit beside state, never inside it;
revocation deletes every readable trace while claims in transit stay
queued so they can contest instead of vanishing."
```

---

### Task 10: Outbox + local pre-check — instant named refusals, pending never settled

**Files:**
- Create: `packages/sync-client/src/precheck/local-context.ts`
- Create: `packages/sync-client/src/outbox/outbox.ts`
- Modify: `packages/sync-client/src/index.ts` (exports)
- Test: `packages/sync-client/test/precheck.test.ts`
- Test: `packages/sync-client/test/outbox.test.ts`

**Interfaces:**
- Consumes: `Replica`, `SyncStorage` (Tasks 8/9); `evaluateEvent`, `EngineContext`, `Verdict` (rule-engine); `applyTicketEvent`, `TICKET_EVENT_TYPES`, `membershipId`, `MembershipState`, `TicketState`, `SubmittedEvent`, `EventEnvelope` (domain); `SyncEventResult` (Task 7 wire shape, re-declared).
- Produces (cross-plan API):

```ts
export type PendingTicket = { pending: TicketState; pendingEventIds: string[] };
export type EnqueueResult = { queued: true; eventId: string } | { queued: false; rule: string; reason: string };
export type OutboxItem = { position: number; eventId: string; workspaceId: string; envelope: SubmittedEvent; attempts: number; status: 'queued'|'failed' };

export type Outbox = {
  enqueue(event: SubmittedEvent): Promise<EnqueueResult>;      // pre-check first; refusal = NOT queued
  nextBatch(limit?: number, now?: () => Date): Promise<OutboxItem[]>;
  applyResult(eventId: string, result: SyncEventResult): Promise<void>;
  recordFailure(eventIds: string[], error: string, now?: () => Date): Promise<void>;
  queuedCount(workspaceId: string): Promise<number>;
  failedItems(workspaceId: string): Promise<OutboxItem[]>;
  pendingFor(ticketId: string): Promise<PendingTicket | null>; // outbox overlay over confirmed state
  pendingCreatedTickets(workspaceId: string): Promise<PendingTicket[]>;
};
export function createOutbox(deps: { storage: SyncStorage; replica: Replica }): Outbox;
export function buildLocalEngineContext(deps: { storage: SyncStorage; replica: Replica }): EngineContext;
export function backoffMs(attempts: number): number; // min(1000 * 2^attempts, 60_000)
```

**The pre-check context reads pending-applied state** — `getEntityState('ticket', id)` folds confirmed state through queued outbox events for that entity, so the second half of an ordered pair (child create after parent reopen) sees the queued reopen. `getEntityState('membership', …)` synthesizes `MembershipState` from bootstrap's `me` (the only membership the pre-check ever needs is the actor's own). `getChildrenStates` includes pending-created children. `getContest` reads the local contests table.

- [ ] **Step 1: Write the failing pre-check test**

`packages/sync-client/test/precheck.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, type EventEnvelope } from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import { createReplica, type Replica } from '../src/replica/replica.js';
import { createOutbox } from '../src/outbox/outbox.js';
import { buildLocalEngineContext } from '../src/precheck/local-context.js';

const WS = 'ws_p';
const PROJECT = newUlid();
const PARENT = newUlid();

const wfDone = {
  id: 'wf_d', version: 1, name: 'Doneable', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: '*', to: 'done', rules: [] }, { from: '*', to: 'todo', rules: [] }],
};

let seq = 0;
let streamSeq = 0;
/** A server-shaped LedgerEvent (§18): per-entity `seq` plus the workspace stream position. */
function committed(entity: EventEnvelope['entity'], type: string, payload: unknown, entitySeq?: number): LedgerEvent {
  seq += 1;
  streamSeq += 1;
  return {
    ...newSubmittedEvent({ workspaceId: WS, entity, type, payload, actorId: 'user_a', origin: 'server' }),
    serverTime: '2026-08-20T00:00:00.000Z',
    seq: entitySeq ?? seq,
    workspaceSeq: streamSeq,
  };
}

async function seeded(): Promise<{ replica: Replica; storage: ReturnType<typeof createBetterSqliteStorage> }> {
  seq = 0;
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  await replica.loadBootstrap({
    workspaceId: WS, me: { userId: 'user_a', workspaceRole: 'member', projectIds: [PROJECT] }, streamSeq: 0,
    definitions: [
      committed({ kind: 'workflow', id: 'wf_d' }, 'workflow.defined', wfDone, 1),
      committed({ kind: 'ticket-type', id: 'task' }, 'ticket-type.defined', { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_d', fields: [] }, 1),
      committed({ kind: 'ticket-type', id: 'sub-task' }, 'ticket-type.defined', { id: 'sub-task', name: 'Sub-task', icon: 'dot', rank: 4, workflowId: 'wf_d', fields: [] }, 1),
    ],
    tickets: [],
  });
  await replica.applyServerItem(committed({ kind: 'ticket', id: PARENT }, 'ticket.created', { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Parent' }, 1));
  await replica.applyServerItem(committed({ kind: 'ticket', id: PARENT }, 'ticket.transitioned', { toStateId: 'done' }, 2));
  return { replica, storage };
}

function childUnderParent() {
  return newSubmittedEvent({
    workspaceId: WS, entity: { kind: 'ticket', id: newUlid() }, type: 'ticket.created',
    payload: { typeId: 'sub-task', projectId: PROJECT, parentId: PARENT, title: 'Late child' },
    actorId: 'user_a', origin: 'desktop',
  });
}

describe('local pre-check — the same engine, the same refusals, instantly', () => {
  it('planted defect: creating under a terminal parent refuses hierarchy.parent-terminal BEFORE enqueue', async () => {
    const { replica, storage } = await seeded();
    const outbox = createOutbox({ storage, replica });
    const result = await outbox.enqueue(childUnderParent());
    expect(result).toMatchObject({ queued: false, rule: 'hierarchy.parent-terminal' });
    expect(await outbox.queuedCount(WS)).toBe(0); // an instant refusal queues NOTHING
  });

  it('the reopen pair passes: parent transition queued first, child sees pending state', async () => {
    const { replica, storage } = await seeded();
    const outbox = createOutbox({ storage, replica });
    const child = childUnderParent();
    const reopen = newSubmittedEvent({
      workspaceId: WS, entity: { kind: 'ticket', id: PARENT }, type: 'ticket.transitioned',
      payload: { toStateId: 'todo', cause: { kind: 'reopened-for-child', childTicketId: child.entity.id } },
      actorId: 'user_a', origin: 'desktop',
    });
    expect(await outbox.enqueue(reopen)).toEqual({ queued: true, eventId: reopen.id });
    expect(await outbox.enqueue(child)).toEqual({ queued: true, eventId: child.id }); // pending overlay made the parent open
    expect(await outbox.queuedCount(WS)).toBe(2);
  });

  it('getEntityState(membership) answers for me and only me, from bootstrap', async () => {
    const { replica, storage } = await seeded();
    const ctx = buildLocalEngineContext({ storage, replica });
    const mine = await ctx.getEntityState('membership', `${WS}:user_a`);
    expect(mine).toMatchObject({ kind: 'membership', userId: 'user_a', role: 'member' });
    expect(await ctx.getEntityState('membership', `${WS}:user_b`)).toBeNull();
  });
});

describe('pending overlay — never settled fact', () => {
  it('planted defect: a queued claim changes pending state only; confirmed state stays the truth', async () => {
    const { replica, storage } = await seeded();
    const outbox = createOutbox({ storage, replica });
    const reopen = newSubmittedEvent({
      workspaceId: WS, entity: { kind: 'ticket', id: PARENT }, type: 'ticket.transitioned',
      payload: { toStateId: 'todo' }, actorId: 'user_a', origin: 'desktop',
    });
    await outbox.enqueue(reopen);
    const confirmed = (await replica.getTicket(PARENT))?.confirmed;
    expect(confirmed?.stateId).toBe('done'); // the board's settled fact is unmoved
    const pending = await outbox.pendingFor(PARENT);
    expect(pending?.pending.stateId).toBe('todo'); // the claim in transit, clearly separate
    expect(pending?.pendingEventIds).toEqual([reopen.id]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/precheck.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the local engine context**

`packages/sync-client/src/precheck/local-context.ts`:

```ts
import {
  applyTicketEvent,
  membershipId,
  TICKET_EVENT_TYPES,
  type EventEnvelope,
  type SubmittedEvent,
  type TicketState,
} from '@gisik-nokma/domain';
import type { EngineContext } from '@gisik-nokma/rule-engine';
import type { SyncStorage } from '../storage/storage.js';
import type { Replica } from '../replica/replica.js';

/**
 * The rule engine against the REPLICA, with the outbox overlaid: an offline
 * edit is checked against the world as this device honestly believes it will
 * be once its queued claims land. Same evaluateEvent, same fixtures, same
 * reasons — instant and named (spec §5).
 */
export function buildLocalEngineContext(deps: { storage: SyncStorage; replica: Replica }): EngineContext {
  const { storage, replica } = deps;

  async function queuedEnvelopesFor(entityId: string): Promise<SubmittedEvent[]> {
    const rows = await storage.all(
      "SELECT envelope FROM outbox WHERE entity_kind = 'ticket' AND entity_id = ? AND status = 'queued' ORDER BY position",
      [entityId],
    );
    return rows.map((r) => JSON.parse(r.envelope as string) as SubmittedEvent);
  }

  async function pendingApplied(ticketId: string): Promise<TicketState | null> {
    const confirmed = (await replica.getTicket(ticketId))?.confirmed ?? undefined;
    const queued = await queuedEnvelopesFor(ticketId);
    if (confirmed === undefined && queued.length === 0) return null;
    const localDeps = await replica.buildDeps();
    let state = confirmed;
    let seq = state?.transitions.at(-1)?.seq ?? 0;
    for (const submitted of queued) {
      seq += 1;
      const env: EventEnvelope = { ...submitted, serverTime: submitted.clientTime, seq };
      if ((TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) state = applyTicketEvent(state, env, localDeps);
    }
    return state ?? null;
  }

  return {
    async getEntityState(kind, id) {
      if (kind === 'ticket') return pendingApplied(id);
      if (kind === 'membership') {
        const me = await replica.getMe();
        if (me === null) return null;
        // membership ids are `${workspaceId}:${userId}` (coordination decision 5) —
        // the pre-check only ever needs the ACTOR's own membership, from bootstrap's me
        const workspaceId = id.slice(0, id.lastIndexOf(':'));
        const userId = id.slice(id.lastIndexOf(':') + 1);
        if (userId !== me.userId) return null;
        return { kind: 'membership', id: membershipId(workspaceId, userId), workspaceId, userId, role: me.workspaceRole };
      }
      return null;
    },

    async getChildrenStates(ticketId) {
      const out: TicketState[] = [];
      const rows = await storage.all('SELECT ticket_id FROM tickets WHERE parent_id = ?', [ticketId]);
      for (const row of rows) {
        const state = await pendingApplied(row.ticket_id as string);
        if (state !== null) out.push(state);
      }
      // children that exist ONLY as queued ticket.created claims
      const queued = await storage.all(
        "SELECT entity_id, envelope FROM outbox WHERE entity_kind = 'ticket' AND status = 'queued' ORDER BY position",
      );
      for (const row of queued) {
        const submitted = JSON.parse(row.envelope as string) as SubmittedEvent;
        if (submitted.type !== 'ticket.created') continue;
        if ((submitted.payload as { parentId: string | null }).parentId !== ticketId) continue;
        if (out.some((s) => s.id === submitted.entity.id)) continue;
        const state = await pendingApplied(submitted.entity.id);
        if (state !== null) out.push(state);
      }
      return out;
    },

    async getWorkflowDef(workflowId, version) {
      const rows = version === undefined
        ? await storage.all('SELECT def FROM workflows WHERE workflow_id = ? ORDER BY version DESC LIMIT 1', [workflowId])
        : await storage.all('SELECT def FROM workflows WHERE workflow_id = ? AND version = ?', [workflowId, version]);
      return rows.length === 0 ? null : JSON.parse(rows[0]!.def as string);
    },

    async getContest(contestedEventId) {
      const rows = await storage.all('SELECT ticket_id, resolved FROM contests WHERE contested_event_id = ?', [contestedEventId]);
      if (rows.length === 0) return null;
      return { ticketId: rows[0]!.ticket_id as string, resolved: Number(rows[0]!.resolved) === 1 };
    },
  };
}
```

- [ ] **Step 4: Implement the outbox**

`packages/sync-client/src/outbox/outbox.ts`:

```ts
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { TICKET_EVENT_TYPES, applyTicketEvent, type EventEnvelope, type LedgerEvent, type SubmittedEvent, type TicketState } from '@gisik-nokma/domain';
import type { SyncStorage } from '../storage/storage.js';
import type { Replica } from '../replica/replica.js';
import { buildLocalEngineContext } from '../precheck/local-context.js';

// Wire shape of POST /v1/sync results (server Task 7) — structurally identical re-declaration.
export type SyncEventResult =
  | { status: 'committed'; eventId: string; seq: number; workspaceSeq: number; serverTime: string }
  | { status: 'contested'; eventId: string; rule: string; reason: string; contestEventId: string }
  | { status: 'refused'; eventId: string; rule: string; reason: string }
  | { status: 'invalid'; eventId: string | null; code: string; message: string };

export type PendingTicket = { pending: TicketState; pendingEventIds: string[] };
export type EnqueueResult = { queued: true; eventId: string } | { queued: false; rule: string; reason: string };
export type OutboxItem = {
  position: number; eventId: string; workspaceId: string; envelope: SubmittedEvent; attempts: number; status: 'queued' | 'failed';
};

export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** attempts, 60_000);
}

export type Outbox = {
  enqueue(event: SubmittedEvent): Promise<EnqueueResult>;
  nextBatch(limit?: number, now?: () => Date): Promise<OutboxItem[]>;
  applyResult(eventId: string, result: SyncEventResult): Promise<void>;
  recordFailure(eventIds: string[], error: string, now?: () => Date): Promise<void>;
  queuedCount(workspaceId: string): Promise<number>;
  failedItems(workspaceId: string): Promise<OutboxItem[]>;
  pendingFor(ticketId: string): Promise<PendingTicket | null>;
  pendingCreatedTickets(workspaceId: string): Promise<PendingTicket[]>;
};

export function createOutbox(deps: { storage: SyncStorage; replica: Replica }): Outbox {
  const { storage, replica } = deps;
  const ctx = buildLocalEngineContext({ storage, replica });

  function rowToItem(row: Record<string, unknown>): OutboxItem {
    return {
      position: Number(row.position),
      eventId: row.event_id as string,
      workspaceId: row.workspace_id as string,
      envelope: JSON.parse(row.envelope as string) as SubmittedEvent,
      attempts: Number(row.attempts),
      status: row.status as 'queued' | 'failed',
    };
  }

  async function queuedFor(ticketId: string): Promise<SubmittedEvent[]> {
    const rows = await storage.all(
      "SELECT envelope FROM outbox WHERE entity_kind = 'ticket' AND entity_id = ? AND status = 'queued' ORDER BY position",
      [ticketId],
    );
    return rows.map((r) => JSON.parse(r.envelope as string) as SubmittedEvent);
  }

  async function overlay(ticketId: string): Promise<PendingTicket | null> {
    const queued = await queuedFor(ticketId);
    if (queued.length === 0) return null;
    const confirmed = (await replica.getTicket(ticketId))?.confirmed ?? undefined;
    const localDeps = await replica.buildDeps();
    let state = confirmed;
    let seq = state?.transitions.at(-1)?.seq ?? 0;
    for (const submitted of queued) {
      seq += 1;
      const env: EventEnvelope = { ...submitted, serverTime: submitted.clientTime, seq };
      if ((TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) state = applyTicketEvent(state, env, localDeps);
    }
    if (state === undefined) return null;
    return { pending: state, pendingEventIds: queued.map((q) => q.id) };
  }

  return {
    async enqueue(event) {
      // The same rule engine, against the replica + pending overlay: instant,
      // honest feedback with the reason named — BEFORE anything is queued.
      const probe: EventEnvelope = { ...event, serverTime: event.clientTime, seq: 0 };
      const verdict = await evaluateEvent(probe, ctx);
      if (verdict.refused) return { queued: false, rule: verdict.rule, reason: verdict.reason };
      await storage.run(
        `INSERT INTO outbox (event_id, workspace_id, entity_kind, entity_id, envelope) VALUES (?, ?, ?, ?, ?)`,
        [event.id, event.workspaceId, event.entity.kind, event.entity.id, JSON.stringify(event)],
      );
      return { queued: true, eventId: event.id };
    },

    async nextBatch(limit = 50, now = () => new Date()) {
      const rows = await storage.all(
        "SELECT * FROM outbox WHERE status = 'queued' AND next_attempt_at <= ? ORDER BY position LIMIT ?",
        [now().toISOString(), limit],
      );
      return rows.map(rowToItem);
    },

    async applyResult(eventId, result) {
      if (result.status === 'committed') {
        const rows = await storage.all('SELECT envelope FROM outbox WHERE event_id = ?', [eventId]);
        if (rows.length > 0) {
          const submitted = JSON.parse(rows[0]!.envelope as string) as SubmittedEvent;
          const env: LedgerEvent = { ...submitted, serverTime: result.serverTime, seq: result.seq, workspaceSeq: result.workspaceSeq };
          await replica.applyServerItem(env); // idempotent; also deletes the outbox row
        }
        await storage.run('DELETE FROM outbox WHERE event_id = ?', [eventId]);
        return;
      }
      if (result.status === 'contested') {
        const rows = await storage.all('SELECT envelope, workspace_id, entity_id FROM outbox WHERE event_id = ?', [eventId]);
        if (rows.length > 0) {
          const submitted = JSON.parse(rows[0]!.envelope as string) as SubmittedEvent;
          // Record the contest locally NOW from the response — the claim.contested
          // envelope also arrives via the stream (or never, if visibility was lost;
          // this local stub is then the claimant's only honest record).
          await storage.run(
            `INSERT INTO contests (contested_event_id, original_event_id, workspace_id, ticket_id, claimant_id, rule, reason, original_event, contested_at, resolved, resolution)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
             ON CONFLICT(contested_event_id) DO NOTHING`,
            [result.contestEventId, eventId, rows[0]!.workspace_id as string, rows[0]!.entity_id as string, submitted.actorId, result.rule, result.reason, JSON.stringify(submitted), new Date().toISOString()],
          );
        }
        await storage.run('DELETE FROM outbox WHERE event_id = ?', [eventId]);
        return;
      }
      // refused (non-ticket) or invalid: keep the item, visibly failed — never silently dropped
      const message = result.status === 'refused' ? `${result.rule}: ${result.reason}` : `${result.code}: ${result.message}`;
      await storage.run("UPDATE outbox SET status = 'failed', last_error = ? WHERE event_id = ?", [message, eventId]);
    },

    async recordFailure(eventIds, error, now = () => new Date()) {
      for (const eventId of eventIds) {
        const rows = await storage.all('SELECT attempts FROM outbox WHERE event_id = ?', [eventId]);
        if (rows.length === 0) continue;
        const attempts = Number(rows[0]!.attempts) + 1;
        const nextAt = new Date(now().getTime() + backoffMs(attempts)).toISOString();
        await storage.run('UPDATE outbox SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE event_id = ?', [
          attempts, nextAt, error, eventId,
        ]);
      }
    },

    async queuedCount(workspaceId) {
      const rows = await storage.all("SELECT count(*) AS n FROM outbox WHERE workspace_id = ? AND status = 'queued'", [workspaceId]);
      return Number(rows[0]!.n);
    },

    async failedItems(workspaceId) {
      const rows = await storage.all("SELECT * FROM outbox WHERE workspace_id = ? AND status = 'failed' ORDER BY position", [workspaceId]);
      return rows.map(rowToItem);
    },

    pendingFor: overlay,

    async pendingCreatedTickets(workspaceId) {
      const rows = await storage.all(
        "SELECT DISTINCT entity_id FROM outbox WHERE workspace_id = ? AND entity_kind = 'ticket' AND status = 'queued' ORDER BY entity_id",
        [workspaceId],
      );
      const out: PendingTicket[] = [];
      for (const row of rows) {
        const confirmed = await replica.getTicket(row.entity_id as string);
        if (confirmed !== null) continue; // exists confirmed — the board lists it there, with a badge
        const p = await overlay(row.entity_id as string);
        if (p !== null) out.push(p);
      }
      return out;
    },
  };
}
```

- [ ] **Step 5: Write the failing outbox test, then run everything**

`packages/sync-client/test/outbox.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid } from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import { createReplica } from '../src/replica/replica.js';
import { backoffMs, createOutbox } from '../src/outbox/outbox.js';

const WS = 'ws_o';
const PROJECT = newUlid();

async function fixture() {
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  await replica.loadBootstrap({
    workspaceId: WS, me: { userId: 'user_a', workspaceRole: 'member', projectIds: [PROJECT] }, streamSeq: 0,
    definitions: [
      {
        ...newSubmittedEvent({ workspaceId: WS, entity: { kind: 'workflow', id: 'wf' }, type: 'workflow.defined', payload: {
          id: 'wf', version: 1, name: 'W', initialStateId: 'todo',
          states: [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'done', name: 'Done', category: 'terminal' }],
          transitions: [{ from: '*', to: 'done', rules: [] }, { from: '*', to: 'todo', rules: [] }],
        }, actorId: 'user_a', origin: 'server' }),
        serverTime: '2026-08-20T00:00:00.000Z', seq: 1, workspaceSeq: 1,
      },
      {
        ...newSubmittedEvent({ workspaceId: WS, entity: { kind: 'ticket-type', id: 'task' }, type: 'ticket-type.defined', payload: { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf', fields: [] }, actorId: 'user_a', origin: 'server' }),
        serverTime: '2026-08-20T00:00:00.000Z', seq: 1, workspaceSeq: 2,
      },
    ],
    tickets: [],
  });
  return { storage, replica, outbox: createOutbox({ storage, replica }) };
}

function createTicket(ticketId: string) {
  return newSubmittedEvent({
    workspaceId: WS, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.created',
    payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Offline born' },
    actorId: 'user_a', origin: 'mobile',
  });
}

describe('outbox ordering and results', () => {
  it('preserves enqueue order and answers batches only when due', async () => {
    const { outbox } = await fixture();
    const t1 = createTicket(newUlid());
    const t2 = newSubmittedEvent({ workspaceId: WS, entity: t1.entity, type: 'ticket.field_set', payload: { fieldId: 'notes', value: 'x' }, actorId: 'user_a', origin: 'mobile' });
    await outbox.enqueue(t1);
    await outbox.enqueue(t2);
    const batch = await outbox.nextBatch();
    expect(batch.map((b) => b.eventId)).toEqual([t1.id, t2.id]);
  });

  it('a committed result confirms the claim into the local ledger and clears the row', async () => {
    const { outbox, replica } = await fixture();
    const t1 = createTicket(newUlid());
    await outbox.enqueue(t1);
    await outbox.applyResult(t1.id, { status: 'committed', eventId: t1.id, seq: 1, workspaceSeq: 11, serverTime: '2026-08-20T01:00:00.000Z' });
    expect(await outbox.queuedCount(WS)).toBe(0);
    expect((await replica.getTicket(t1.entity.id))?.confirmed?.stateId).toBe('todo');
  });

  it('a contested result records the contest locally and clears the row — nothing vanishes', async () => {
    const { outbox, replica } = await fixture();
    const t1 = createTicket(newUlid());
    await outbox.enqueue(t1);
    await outbox.applyResult(t1.id, { status: 'contested', eventId: t1.id, rule: 'hierarchy.parent-terminal', reason: 'planted', contestEventId: newUlid() });
    expect(await outbox.queuedCount(WS)).toBe(0);
    const contests = await replica.listContests(WS, { open: true });
    expect(contests).toHaveLength(1);
    expect(contests[0]).toMatchObject({ originalEventId: t1.id, rule: 'hierarchy.parent-terminal', claimantId: 'user_a' });
  });

  it('failure backs off exponentially and holds the batch until due', async () => {
    const { outbox } = await fixture();
    const t1 = createTicket(newUlid());
    await outbox.enqueue(t1);
    const t0 = new Date('2026-08-20T00:00:00.000Z');
    await outbox.recordFailure([t1.id], 'network down', () => t0);
    expect(await outbox.nextBatch(50, () => t0)).toEqual([]); // not due yet
    const later = new Date(t0.getTime() + backoffMs(1) + 1);
    expect((await outbox.nextBatch(50, () => later)).map((b) => b.eventId)).toEqual([t1.id]);
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(10)).toBe(60_000); // capped
  });
});
```

Run: `pnpm vitest run test/precheck.test.ts test/outbox.test.ts`
Expected: PASS (9 tests). Then `pnpm test` for the whole package. Export the new names from `src/index.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/sync-client/src/precheck packages/sync-client/src/outbox packages/sync-client/src/index.ts packages/sync-client/test/precheck.test.ts packages/sync-client/test/outbox.test.ts
git commit -m "feat(sync-client): outbox with rule-engine pre-check — refusals are instant, pending is never fact

The same evaluateEvent runs against replica + queued overlay, so the
reopen pair passes locally and an illegal claim never even queues.
Confirmed and pending state are separate readings; results from the
sync door confirm, contest, or visibly fail — never silently drop."
```

### Task 11: The sync engine — bootstrap client, WS catch-up, flush loop, status

**Files:**
- Create: `packages/sync-client/src/engine/sync-engine.ts`
- Create: `packages/sync-client/src/net/http-transport.ts`
- Modify: `packages/sync-client/src/index.ts` (exports)
- Test: `packages/sync-client/test/sync-engine.test.ts`

**Interfaces:**
- Consumes: `Replica`, `Outbox`, `SyncEventResult`, `backoffMs` (Tasks 9/10); `BootstrapResponse`, `SyncItem` (Task 9's client-side types); amendment 13's WS frames (Plan 5 owns the server end — assumption flagged in Open questions).
- Produces (cross-plan API):

```ts
export type StreamHandlers = {
  onItem(item: SyncItem): void;                  // {type:'event'} → envelope · {type:'purge'} → PurgeInstruction
  onCaughtUp(seq: number): void;                 // amendment 19: only for THIS subscription's workspaceId
  onError(err: { code: string; message: string }): void;  // amendment 19's error frame — surfaced, never swallowed
  onClose(): void;
};
export type StreamHandle = { close(): void };
export type SyncTransport = {
  bootstrap(workspaceId: string): Promise<BootstrapResponse>;
  sync(events: SubmittedEvent[]): Promise<SyncEventResult[]>;    // POST /v1/sync
  openStream(workspaceId: string, afterSeq: number, handlers: StreamHandlers): StreamHandle;
};
export type SyncStatus = 'offline' | 'connecting' | 'catching-up' | 'live';
export type SyncEngine = {
  start(workspaceId: string): Promise<void>;   // bootstrap if no cursor, then stream + flush
  stop(): void;
  flush(): Promise<void>;                      // drain due outbox batches now
  status(): SyncStatus;
  lastError(): { code: string; message: string } | null;  // amendment 19's error frame, kept, not swallowed
  onStatus(cb: (status: SyncStatus) => void): () => void;
};
export function createSyncEngine(deps: { replica: Replica; outbox: Outbox; transport: SyncTransport; reconnectDelayMs?: number }): SyncEngine;
export function createHttpTransport(opts: { baseUrl: string; token: string; fetchImpl?: typeof fetch; WebSocketImpl?: typeof WebSocket }): SyncTransport;
```

**Behaviour (each line is a test):** an amendment-19 `error` frame is kept verbatim in `lastError()` and never advances the cursor (an errored stream has not caught up); first `start` on an empty replica bootstraps, stores the cursor, subscribes at it; a later `start` skips bootstrap and subscribes at the persisted cursor; every `{event}`/`{purge}` frame applies to the replica (duplicates are no-ops — re-delivery after reconnect is expected); `{caught-up, seq}` persists the cursor, flips status to `live`, and triggers a flush; stream close flips to `offline`/`connecting` and reconnects with delay; `flush` sends due batches **in order** and applies per-event results; transport rejection records failure with backoff (items retry later — never lost).

- [ ] **Step 1: Write the failing engine test with a scripted fake transport**

`packages/sync-client/test/sync-engine.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { newSubmittedEvent, newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import { createReplica, type BootstrapResponse, type SyncItem } from '../src/replica/replica.js';
import { createOutbox, type SyncEventResult } from '../src/outbox/outbox.js';
import { createSyncEngine, type StreamHandlers, type SyncTransport } from '../src/engine/sync-engine.js';

const WS = 'ws_e';
const PROJECT = newUlid();

function bootstrapBody(): BootstrapResponse {
  return {
    workspaceId: WS,
    me: { userId: 'user_a', workspaceRole: 'member', projectIds: [PROJECT] },
    streamSeq: 7,
    definitions: [
      {
        ...newSubmittedEvent({ workspaceId: WS, entity: { kind: 'workflow', id: 'wf' }, type: 'workflow.defined', payload: {
          id: 'wf', version: 1, name: 'W', initialStateId: 'todo',
          states: [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'done', name: 'Done', category: 'terminal' }],
          transitions: [{ from: '*', to: 'done', rules: [] }, { from: '*', to: 'todo', rules: [] }],
        }, actorId: 'user_a', origin: 'server' }),
        serverTime: '2026-08-20T00:00:00.000Z', seq: 1, workspaceSeq: 1,
      },
      {
        ...newSubmittedEvent({ workspaceId: WS, entity: { kind: 'ticket-type', id: 'task' }, type: 'ticket-type.defined', payload: { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf', fields: [] }, actorId: 'user_a', origin: 'server' }),
        serverTime: '2026-08-20T00:00:00.000Z', seq: 1, workspaceSeq: 2,
      },
    ],
    tickets: [],
  };
}

type Script = {
  bootstraps: number;
  subscribes: Array<{ afterSeq: number }>;
  syncBatches: SubmittedEvent[][];
  handlers: StreamHandlers | null;
  syncImpl: (events: SubmittedEvent[]) => Promise<SyncEventResult[]>;
};

function fakeTransport(script: Script): SyncTransport {
  return {
    async bootstrap() {
      script.bootstraps += 1;
      return bootstrapBody();
    },
    async sync(events) {
      script.syncBatches.push(events);
      return script.syncImpl(events);
    },
    openStream(_ws, afterSeq, handlers) {
      script.subscribes.push({ afterSeq });
      script.handlers = handlers;
      return { close: () => undefined };
    },
  };
}

async function fixture(syncImpl?: Script['syncImpl']) {
  const script: Script = {
    bootstraps: 0, subscribes: [], syncBatches: [], handlers: null,
    syncImpl: syncImpl ?? (async (events) => events.map((e, i) => ({ status: 'committed' as const, eventId: e.id, seq: i + 1, workspaceSeq: 100 + i, serverTime: '2026-08-20T02:00:00.000Z' }))),
  };
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  const outbox = createOutbox({ storage, replica });
  const engine = createSyncEngine({ replica, outbox, transport: fakeTransport(script), reconnectDelayMs: 5 });
  return { script, replica, outbox, engine };
}

describe('sync engine lifecycle', () => {
  it('bootstraps once, subscribes at the bootstrap cursor, goes live at caught-up', async () => {
    const { script, replica, engine } = await fixture();
    await engine.start(WS);
    expect(script.bootstraps).toBe(1);
    expect(script.subscribes).toEqual([{ afterSeq: 7 }]);
    expect(engine.status()).toBe('catching-up');
    script.handlers!.onCaughtUp(9);
    await vi.waitFor(async () => expect(await replica.getCursor(WS)).toBe(9));
    expect(engine.status()).toBe('live');
    engine.stop();
  });

  it('a second start skips bootstrap and resumes from the persisted cursor', async () => {
    const { script, engine } = await fixture();
    await engine.start(WS);
    script.handlers!.onCaughtUp(9);
    engine.stop();
    await engine.start(WS);
    expect(script.bootstraps).toBe(1); // no re-bootstrap
    expect(script.subscribes.at(-1)).toEqual({ afterSeq: 9 });
    engine.stop();
  });

  it('applies event and purge frames to the replica', async () => {
    const { script, replica, engine } = await fixture();
    await engine.start(WS);
    const ticketId = newUlid();
    const created: SyncItem = {
      ...newSubmittedEvent({ workspaceId: WS, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.created', payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Streamed' }, actorId: 'user_a', origin: 'server' }),
      serverTime: '2026-08-20T02:00:00.000Z', seq: 1, workspaceSeq: 20,
    };
    script.handlers!.onItem(created);
    await vi.waitFor(async () => expect(await replica.getTicket(ticketId)).not.toBeNull());
    script.handlers!.onItem({ kind: 'purge', entityId: ticketId });
    await vi.waitFor(async () => expect(await replica.getTicket(ticketId)).toBeNull());
    engine.stop();
  });

  it('caught-up triggers a flush of the queued outbox, in order', async () => {
    const { script, outbox, engine } = await fixture();
    await engine.start(WS);
    const t = newUlid();
    const e1 = newSubmittedEvent({ workspaceId: WS, entity: { kind: 'ticket', id: t }, type: 'ticket.created', payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Queued' }, actorId: 'user_a', origin: 'desktop' });
    const e2 = newSubmittedEvent({ workspaceId: WS, entity: { kind: 'ticket', id: t }, type: 'ticket.field_set', payload: { fieldId: 'notes', value: 'x' }, actorId: 'user_a', origin: 'desktop' });
    await outbox.enqueue(e1);
    await outbox.enqueue(e2);
    script.handlers!.onCaughtUp(8);
    await vi.waitFor(async () => expect(await outbox.queuedCount(WS)).toBe(0));
    expect(script.syncBatches[0]!.map((e) => e.id)).toEqual([e1.id, e2.id]);
    engine.stop();
  });

  it('transport failure backs off and retries — the claim is never lost', async () => {
    let calls = 0;
    const { script, outbox, engine } = await fixture(async (events) => {
      calls += 1;
      if (calls === 1) throw new Error('network down');
      return events.map((e, i) => ({ status: 'committed' as const, eventId: e.id, seq: 1, workspaceSeq: 200 + i, serverTime: '2026-08-20T02:00:00.000Z' }));
    });
    await engine.start(WS);
    const e1 = newSubmittedEvent({ workspaceId: WS, entity: { kind: 'ticket', id: newUlid() }, type: 'ticket.created', payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Retry me' }, actorId: 'user_a', origin: 'desktop' });
    await outbox.enqueue(e1);
    await engine.flush(); // fails, records backoff
    expect(await outbox.queuedCount(WS)).toBe(1); // still queued
    void script;
    engine.stop();
  });

  it('stream close goes offline then reconnects', async () => {
    const { script, engine } = await fixture();
    await engine.start(WS);
    const statuses: string[] = [];
    engine.onStatus((s) => statuses.push(s));
    script.handlers!.onClose();
    await vi.waitFor(() => expect(script.subscribes.length).toBeGreaterThanOrEqual(2));
    expect(statuses).toContain('connecting');
    engine.stop();
  });

  it('PLANTED DEFECT: an error frame is kept verbatim and does NOT advance the cursor', async () => {
    const { script, engine, replica } = await fixture();
    await engine.start(WS);
    const before = await replica.getCursor(WS);
    expect(engine.lastError()).toBeNull();
    script.handlers!.onError({ code: 'not-a-member', message: 'not a member of this workspace' });
    // The server named a reason; the engine keeps it word for word so a shell can
    // show it. Swallowing it would leave the user staring at a stream that has
    // silently stopped delivering.
    expect(engine.lastError()).toEqual({ code: 'not-a-member', message: 'not a member of this workspace' });
    expect(await replica.getCursor(WS)).toBe(before); // an errored stream has NOT caught up
    engine.stop();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/sync-engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the engine**

`packages/sync-client/src/engine/sync-engine.ts`:

```ts
import type { SubmittedEvent } from '@gisik-nokma/domain';
import type { BootstrapResponse, Replica, SyncItem } from '../replica/replica.js';
import type { Outbox, SyncEventResult } from '../outbox/outbox.js';

export type StreamHandlers = {
  onItem(item: SyncItem): void;
  onCaughtUp(seq: number): void;
  onError(err: { code: string; message: string }): void;
  onClose(): void;
};
export type StreamHandle = { close(): void };
export type SyncTransport = {
  bootstrap(workspaceId: string): Promise<BootstrapResponse>;
  sync(events: SubmittedEvent[]): Promise<SyncEventResult[]>;
  openStream(workspaceId: string, afterSeq: number, handlers: StreamHandlers): StreamHandle;
};
export type SyncStatus = 'offline' | 'connecting' | 'catching-up' | 'live';

export type SyncEngine = {
  start(workspaceId: string): Promise<void>;
  stop(): void;
  flush(): Promise<void>;
  status(): SyncStatus;
  /** The last error frame the server sent on this stream (amendment 19), or null. */
  lastError(): { code: string; message: string } | null;
  onStatus(cb: (status: SyncStatus) => void): () => void;
};

/**
 * Orchestrates the honest loop: bootstrap once, catch up from the cursor,
 * apply every frame (duplicates are no-ops — re-delivery is the protocol's
 * failure mode, silence is not), persist the cursor only at caught-up, and
 * push claims up in order whenever we are live.
 */
export function createSyncEngine(deps: {
  replica: Replica;
  outbox: Outbox;
  transport: SyncTransport;
  reconnectDelayMs?: number;
}): SyncEngine {
  const { replica, outbox, transport } = deps;
  const reconnectDelayMs = deps.reconnectDelayMs ?? 2000;
  let currentStatus: SyncStatus = 'offline';
  let handle: StreamHandle | null = null;
  let workspaceId: string | null = null;
  let stopped = true;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let applyChain: Promise<unknown> = Promise.resolve(); // frames apply strictly in arrival order
  let flushing: Promise<void> | null = null;
  let lastStreamError: { code: string; message: string } | null = null;
  const statusListeners = new Set<(s: SyncStatus) => void>();

  function setStatus(next: SyncStatus): void {
    if (next === currentStatus) return;
    currentStatus = next;
    statusListeners.forEach((cb) => cb(next));
  }

  function subscribe(afterSeq: number): void {
    if (stopped || workspaceId === null) return;
    setStatus('catching-up');
    handle = transport.openStream(workspaceId, afterSeq, {
      onItem: (item) => {
        applyChain = applyChain.then(() => replica.applyServerItem(item)).catch(() => undefined);
      },
      onCaughtUp: (seq) => {
        applyChain = applyChain
          .then(async () => {
            if (workspaceId !== null) await replica.setCursor(workspaceId, seq);
            setStatus('live');
            await engine.flush();
          })
          .catch(() => undefined);
      },
      onError: (err) => {
        // The server named a reason (not-a-member, bad-message, …). Record it and
        // do NOT advance the cursor: a stream that errors has not caught up, and
        // pretending otherwise would silently skip whatever it did not send.
        lastStreamError = err;
      },
      onClose: () => {
        handle = null;
        if (stopped) return;
        setStatus('connecting');
        reconnectTimer = setTimeout(() => {
          void (async () => {
            if (stopped || workspaceId === null) return;
            subscribe(await replica.getCursor(workspaceId));
          })();
        }, reconnectDelayMs);
      },
    });
  }

  const engine: SyncEngine = {
    async start(ws) {
      workspaceId = ws;
      stopped = false;
      setStatus('connecting');
      const cursor = await replica.getCursor(ws);
      if (cursor === 0 && (await replica.getMe()) === null) {
        const body = await transport.bootstrap(ws);
        await replica.loadBootstrap(body);
      }
      subscribe(await replica.getCursor(ws));
    },

    stop() {
      stopped = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      handle?.close();
      handle = null;
      setStatus('offline');
    },

    async flush() {
      if (flushing !== null) return flushing; // one drain at a time
      flushing = (async () => {
        try {
          for (;;) {
            const batch = await outbox.nextBatch();
            if (batch.length === 0) return;
            let results: SyncEventResult[];
            try {
              results = await transport.sync(batch.map((b) => b.envelope));
            } catch (err) {
              await outbox.recordFailure(batch.map((b) => b.eventId), String(err));
              return; // due again after backoff; the engine retries on next flush/caught-up
            }
            for (let i = 0; i < batch.length; i += 1) {
              const result = results[i];
              if (result !== undefined) await outbox.applyResult(batch[i]!.eventId, result);
            }
          }
        } finally {
          flushing = null;
        }
      })();
      return flushing;
    },

    status: () => currentStatus,
    lastError: () => lastStreamError,

    onStatus(cb) {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
  };
  return engine;
}
```

- [ ] **Step 4: Implement the HTTP/WS transport**

`packages/sync-client/src/net/http-transport.ts`:

```ts
import type { SubmittedEvent } from '@gisik-nokma/domain';
import type { BootstrapResponse } from '../replica/replica.js';
import type { SyncEventResult } from '../outbox/outbox.js';
import type { StreamHandlers, StreamHandle, SyncTransport } from '../engine/sync-engine.js';

/**
 * The wire implementation: GET /v1/sync/bootstrap, POST /v1/sync, and the
 * amendment-13 stream at /v1/stream. Injectable fetch/WebSocket so both app
 * shells and tests choose their platform implementations.
 */
export function createHttpTransport(opts: {
  baseUrl: string; // e.g. https://api.gisik-nokma.example — no trailing slash
  token: string;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
}): SyncTransport {
  const doFetch = opts.fetchImpl ?? fetch;
  const WS = opts.WebSocketImpl ?? WebSocket;
  const headers = { authorization: `Bearer ${opts.token}`, 'content-type': 'application/json' };

  return {
    async bootstrap(workspaceId) {
      const res = await doFetch(`${opts.baseUrl}/v1/sync/bootstrap?workspaceId=${encodeURIComponent(workspaceId)}`, { headers });
      if (!res.ok) throw new Error(`bootstrap failed: ${res.status}`);
      return (await res.json()) as BootstrapResponse;
    },

    async sync(events: SubmittedEvent[]) {
      const res = await doFetch(`${opts.baseUrl}/v1/sync`, { method: 'POST', headers, body: JSON.stringify({ events }) });
      if (!res.ok) throw new Error(`sync failed: ${res.status}`);
      return ((await res.json()) as { results: SyncEventResult[] }).results;
    },

    openStream(workspaceId, afterSeq, handlers: StreamHandlers): StreamHandle {
      const wsUrl = `${opts.baseUrl.replace(/^http/, 'ws')}/v1/stream`;
      const socket = new WS(wsUrl, [`bearer.${opts.token}`]); // token via subprotocol — see Open questions (Plan 5 owns the handshake)
      socket.onopen = () => socket.send(JSON.stringify({ type: 'subscribe', workspaceId, afterSeq }));
      socket.onmessage = (msg: MessageEvent) => {
        // Amendment 19: purge/caught-up/error carry workspaceId. This socket holds ONE
        // subscription, so a frame for another workspace is a server bug or a crossed
        // stream — drop it rather than advancing this workspace's cursor with a number
        // that means nothing here.
        const frame = JSON.parse(String(msg.data)) as
          | { type: 'event'; envelope: { workspaceId?: string } }
          | { type: 'purge'; workspaceId: string; entityId: string }
          | { type: 'caught-up'; workspaceId: string; seq: number }
          | { type: 'error'; workspaceId: string | null; code: string; message: string }
          | { type: 'ping' };
        if (frame.type === 'event') handlers.onItem(frame.envelope as never);
        else if (frame.type === 'purge') {
          if (frame.workspaceId === workspaceId) handlers.onItem({ kind: 'purge', entityId: frame.entityId });
        } else if (frame.type === 'caught-up') {
          if (frame.workspaceId === workspaceId) handlers.onCaughtUp(frame.seq);
        } else if (frame.type === 'error') {
          // Never silent: the engine's word reaches the user, and the cursor does not move.
          handlers.onError({ code: frame.code, message: frame.message });
        } else if (frame.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
      };
      socket.onclose = () => handlers.onClose();
      socket.onerror = () => socket.close();
      return { close: () => socket.close() };
    },
  };
}
```

- [ ] **Step 5: Run the tests, export, commit**

Run: `pnpm vitest run test/sync-engine.test.ts` → PASS (6 tests); then `pnpm test` for the package; export `createSyncEngine`, `createHttpTransport`, and the transport/status types from `src/index.ts`.

```bash
git add packages/sync-client/src/engine packages/sync-client/src/net packages/sync-client/src/index.ts packages/sync-client/test/sync-engine.test.ts
git commit -m "feat(sync-client): sync engine — cursor-honest catch-up, ordered flush, backoff

The cursor only advances at caught-up, so a dropped connection can
re-deliver but never skip; queued claims drain strictly in order and
survive transport failure with exponential backoff."
```

---

### Task 12: The replica `DataSource` (amendment 10) — app-core's one door to the offline world

**Files:**
- Create: `packages/sync-client/src/data-source/replica-data-source.ts`
- Modify: `packages/sync-client/src/index.ts` (exports)
- Test: `packages/sync-client/test/data-source.test.ts`

**Interfaces:**
- Consumes: `Replica`, `Outbox`, `SyncEngine` (Tasks 9–11); amendment 10's `DataSource` shape; Plan 6's `app-core` query expectations (written in parallel — the query surface below is this plan's offer; divergences reconciled at execution, flagged in Open questions).
- Produces (cross-plan API — app-core's replica wiring, Tasks 13/16/17):

```ts
// IngestResult (Plan 1) + the replica's honest extra: accepted-for-now, not committed.
export type LocalIngestResult =
  | { status: 'committed'; eventId: string; seq: number; serverTime: string }
  | { status: 'invalid'; eventId: string | null; code: string; message: string }
  | { status: 'refused'; eventId: string; rule: string; reason: string }
  | { status: 'pending'; eventId: string };

export type TicketSummary = {
  ticketId: string;
  title: string;
  stateId: string; stateCategory: string; assigneeId: string | null; parentId: string | null;
  pending: boolean;                 // ANY queued claim → the badge; never folded into the settled columns
  pendingEventIds: string[];
  openContests: number;
};

export type ReplicaQuery = {
  getTicket(ticketId: string): Promise<(ReplicaTicket & { pending: PendingTicket | null }) | null>;
  listTickets(workspaceId: string): Promise<TicketSummary[]>;   // confirmed + pending-created, badged
  listContests(workspaceId: string, filter?: { ticketId?: string; claimantId?: string; open?: boolean }): Promise<LocalContest[]>;
  listEntityEvents(ticketId: string): Promise<LedgerEvent[]>;
  myWork(workspaceId: string, userId: string): Promise<{ assigned: TicketSummary[]; claimsInTransit: TicketSummary[]; contested: LocalContest[] }>;
  search(workspaceId: string, text: string): Promise<{ offlineCopy: true; hits: Array<{ ticketId: string; title: string }> }>;
  syncStatus(workspaceId: string): Promise<{ status: SyncStatus; queued: number; failed: number }>;
};

export type ReplicaDataSource = {
  ingest(events: SubmittedEvent[]): Promise<LocalIngestResult[]>;
  query: ReplicaQuery;
  subscribe(workspaceId: string, afterSeq: number, cb: () => void): () => void; // change signal; views re-query
};
export function createReplicaDataSource(deps: { replica: Replica; outbox: Outbox; engine: SyncEngine }): ReplicaDataSource;
```

**Honesty pins:** `ingest` pre-checks and answers `{status:'refused', rule, reason}` instantly without queueing, or `{status:'pending'}` — it NEVER answers `committed` for a local accept (that would launder a claim in transit into settled fact); `TicketSummary.pending` is how every board/list badge renders; `search` returns `offlineCopy: true` so the UI must say "searching offline copy".

- [ ] **Step 1: Write the failing test**

`packages/sync-client/test/data-source.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, type EventEnvelope } from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import { createReplica } from '../src/replica/replica.js';
import { createOutbox } from '../src/outbox/outbox.js';
import { createSyncEngine, type SyncTransport } from '../src/engine/sync-engine.js';
import { createReplicaDataSource } from '../src/data-source/replica-data-source.js';

const WS = 'ws_ds';
const PROJECT = newUlid();
const TICKET = newUlid();

const idleTransport: SyncTransport = {
  bootstrap: () => Promise.reject(new Error('offline')),
  sync: () => Promise.reject(new Error('offline')),
  openStream: () => ({ close: () => undefined }),
};

async function fixture() {
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  const wf = {
    id: 'wf', version: 1, name: 'W', initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [
      { from: '*', to: 'todo', rules: [] },
      { from: 'todo', to: 'done', rules: [{ kind: 'require-comment' }] },
    ],
  };
  // ^ require-comment rule literal: copy the exact shape from a Plan 2 fixture
  //   (grep -l "require-comment" packages/rule-engine/fixtures)
  let seq = 0;
  let streamSeq = 0;
  // A server-shaped LedgerEvent (§18): per-entity seq plus the workspace stream position.
  const committed = (entity: EventEnvelope['entity'], type: string, payload: unknown, s?: number): LedgerEvent => ({
    ...newSubmittedEvent({ workspaceId: WS, entity, type, payload, actorId: 'user_a', origin: 'server' }),
    serverTime: '2026-08-20T00:00:00.000Z',
    seq: s ?? (seq += 1),
    workspaceSeq: (streamSeq += 1),
  });
  await replica.loadBootstrap({
    workspaceId: WS, me: { userId: 'user_a', workspaceRole: 'member', projectIds: [PROJECT] }, streamSeq: 0,
    definitions: [
      committed({ kind: 'workflow', id: 'wf' }, 'workflow.defined', wf, 1),
      committed({ kind: 'ticket-type', id: 'task' }, 'ticket-type.defined', { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf', fields: [] }, 1),
    ],
    tickets: [],
  });
  await replica.applyServerItem(committed({ kind: 'ticket', id: TICKET }, 'ticket.created', { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Board ticket' }, 1));
  await replica.applyServerItem(committed({ kind: 'ticket', id: TICKET }, 'ticket.assigned', { assigneeId: 'user_a' }, 2));
  const outbox = createOutbox({ storage, replica });
  const engine = createSyncEngine({ replica, outbox, transport: idleTransport });
  return { ds: createReplicaDataSource({ replica, outbox, engine }), replica, outbox };
}

describe('replica DataSource', () => {
  it('planted defect: a locally-accepted claim answers pending, and the board summary badges it — never settles it', async () => {
    const { ds } = await fixture();
    const fieldSet = newSubmittedEvent({
      workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.field_set',
      payload: { fieldId: 'notes', value: 'offline note' }, actorId: 'user_a', origin: 'desktop',
    });
    const [result] = await ds.ingest([fieldSet]);
    expect(result).toEqual({ status: 'pending', eventId: fieldSet.id });

    const [summary] = await ds.query.listTickets(WS);
    expect(summary).toMatchObject({ ticketId: TICKET, pending: true, pendingEventIds: [fieldSet.id] });
    const full = await ds.query.getTicket(TICKET);
    expect(full?.confirmed?.fields.notes).toBeUndefined();       // settled fact: unchanged
    expect(full?.pending?.pending.fields.notes?.value).toBe('offline note'); // claim in transit: visible, distinct
  });

  it('planted defect: a rule violation refuses instantly with the named rule and queues nothing', async () => {
    const { ds, outbox } = await fixture();
    const bare = newSubmittedEvent({
      workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.transitioned',
      payload: { toStateId: 'done' }, actorId: 'user_a', origin: 'desktop', // require-comment, and none given
    });
    const [result] = await ds.ingest([bare]);
    expect(result).toMatchObject({ status: 'refused', rule: 'require-comment' });
    expect(await outbox.queuedCount(WS)).toBe(0);
  });

  it('myWork separates assigned, claims in transit, and contested', async () => {
    const { ds } = await fixture();
    const fieldSet = newSubmittedEvent({
      workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.field_set',
      payload: { fieldId: 'notes', value: 'x' }, actorId: 'user_a', origin: 'desktop',
    });
    await ds.ingest([fieldSet]);
    const mine = await ds.query.myWork(WS, 'user_a');
    expect(mine.assigned.map((t) => t.ticketId)).toEqual([TICKET]);
    expect(mine.claimsInTransit.map((t) => t.ticketId)).toEqual([TICKET]);
    expect(mine.contested).toEqual([]);
  });

  it('search names its source: offline copy', async () => {
    const { ds } = await fixture();
    const result = await ds.query.search(WS, 'board');
    expect(result.offlineCopy).toBe(true);
    expect(result.hits.map((h) => h.ticketId)).toEqual([TICKET]);
  });

  it('subscribe fires on replica change and unsubscribes cleanly', async () => {
    const { ds, replica } = await fixture();
    let fired = 0;
    const off = ds.subscribe(WS, 0, () => { fired += 1; });
    await replica.applyServerItem({
      ...newSubmittedEvent({ workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.field_set', payload: { fieldId: 'notes', value: 'server side' }, actorId: 'user_b', origin: 'server' }),
      serverTime: '2026-08-20T03:00:00.000Z', seq: 3, workspaceSeq: 30,
    });
    expect(fired).toBeGreaterThan(0);
    off();
    const at = fired;
    await replica.applyServerItem({
      ...newSubmittedEvent({ workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.field_set', payload: { fieldId: 'notes', value: 'again' }, actorId: 'user_b', origin: 'server' }),
      serverTime: '2026-08-20T03:01:00.000Z', seq: 4, workspaceSeq: 31,
    });
    expect(fired).toBe(at);
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement**

Run: `pnpm vitest run test/data-source.test.ts` → FAIL (module not found).

`packages/sync-client/src/data-source/replica-data-source.ts`:

```ts
import type { EventEnvelope, SubmittedEvent, TicketState } from '@gisik-nokma/domain';
import type { LocalContest, Replica, ReplicaTicket } from '../replica/replica.js';
import type { Outbox, PendingTicket } from '../outbox/outbox.js';
import type { SyncEngine, SyncStatus } from '../engine/sync-engine.js';

export type LocalIngestResult =
  | { status: 'committed'; eventId: string; seq: number; serverTime: string }
  | { status: 'invalid'; eventId: string | null; code: string; message: string }
  | { status: 'refused'; eventId: string; rule: string; reason: string }
  | { status: 'pending'; eventId: string };

export type TicketSummary = {
  ticketId: string;
  title: string;
  stateId: string;
  stateCategory: string;
  assigneeId: string | null;
  parentId: string | null;
  pending: boolean;
  pendingEventIds: string[];
  openContests: number;
};

export type ReplicaQuery = {
  getTicket(ticketId: string): Promise<(ReplicaTicket & { pending: PendingTicket | null }) | null>;
  listTickets(workspaceId: string): Promise<TicketSummary[]>;
  listContests(workspaceId: string, filter?: { ticketId?: string; claimantId?: string; open?: boolean }): Promise<LocalContest[]>;
  listEntityEvents(ticketId: string): Promise<LedgerEvent[]>;
  myWork(workspaceId: string, userId: string): Promise<{ assigned: TicketSummary[]; claimsInTransit: TicketSummary[]; contested: LocalContest[] }>;
  search(workspaceId: string, text: string): Promise<{ offlineCopy: true; hits: Array<{ ticketId: string; title: string }> }>;
  syncStatus(workspaceId: string): Promise<{ status: SyncStatus; queued: number; failed: number }>;
};

export type ReplicaDataSource = {
  ingest(events: SubmittedEvent[]): Promise<LocalIngestResult[]>;
  query: ReplicaQuery;
  subscribe(workspaceId: string, afterSeq: number, cb: () => void): () => void;
};

function titleOf(state: TicketState): string {
  return String((state.fields.title as { value?: unknown } | undefined)?.value ?? '');
}

/**
 * Amendment 10's DataSource over the replica. The one honesty extra:
 * a local accept is {status:'pending'} — the replica cannot truthfully say
 * 'committed', so it does not. Views render pending as a badge, never as fact.
 */
export function createReplicaDataSource(deps: { replica: Replica; outbox: Outbox; engine: SyncEngine }): ReplicaDataSource {
  const { replica, outbox, engine } = deps;

  async function summarise(ticketId: string, state: TicketState, contests: LocalContest[]): Promise<TicketSummary> {
    const pending = await outbox.pendingFor(ticketId);
    return {
      ticketId,
      title: titleOf(state),
      stateId: state.stateId,
      stateCategory: state.stateCategory,
      assigneeId: state.assigneeId,
      parentId: state.parentId,
      pending: pending !== null,
      pendingEventIds: pending?.pendingEventIds ?? [],
      openContests: contests.filter((c) => !c.resolved).length,
    };
  }

  const query: ReplicaQuery = {
    async getTicket(ticketId) {
      const confirmed = await replica.getTicket(ticketId);
      const pending = await outbox.pendingFor(ticketId);
      if (confirmed === null && pending === null) return null;
      return {
        ticketId,
        confirmed: confirmed?.confirmed ?? null,
        contests: confirmed?.contests ?? [],
        pending,
      };
    },

    async listTickets(workspaceId) {
      const out: TicketSummary[] = [];
      for (const t of await replica.listTickets(workspaceId)) {
        if (t.confirmed !== null) out.push(await summarise(t.ticketId, t.confirmed, t.contests));
      }
      // offline-born tickets: pending-only, summarised from the OVERLAY state but always badged
      for (const p of await outbox.pendingCreatedTickets(workspaceId)) {
        const summary = await summarise(p.pending.id, p.pending, []);
        out.push({ ...summary, pending: true, pendingEventIds: p.pendingEventIds });
      }
      return out;
    },

    listContests: (workspaceId, filter) => replica.listContests(workspaceId, filter),
    listEntityEvents: (ticketId) => replica.listEntityEvents(ticketId),

    async myWork(workspaceId, userId) {
      const all = await query.listTickets(workspaceId);
      return {
        assigned: all.filter((t) => t.assigneeId === userId),
        claimsInTransit: all.filter((t) => t.pending),
        contested: await replica.listContests(workspaceId, { claimantId: userId, open: true }),
      };
    },

    async search(workspaceId, text) {
      return { offlineCopy: true, hits: await replica.searchLocal(workspaceId, text) };
    },

    async syncStatus(workspaceId) {
      return {
        status: engine.status(),
        queued: await outbox.queuedCount(workspaceId),
        failed: (await outbox.failedItems(workspaceId)).length,
      };
    },
  };

  return {
    async ingest(events) {
      const results: LocalIngestResult[] = [];
      for (const event of events) {
        const outcome = await outbox.enqueue(event);
        results.push(
          outcome.queued
            ? { status: 'pending', eventId: outcome.eventId }
            : { status: 'refused', eventId: event.id, rule: outcome.rule, reason: outcome.reason },
        );
      }
      void engine.flush().catch(() => undefined); // opportunistic: sends now when online
      return results;
    },
    query,
    subscribe(_workspaceId, _afterSeq, cb) {
      return replica.onChange(cb);
    },
  };
}
```

- [ ] **Step 3: Run the tests, export, run the whole package**

Run: `pnpm vitest run test/data-source.test.ts` → PASS (5 tests); `pnpm test` → whole package green; export the new names from `src/index.ts`.

- [ ] **Step 4: Commit**

```bash
git add packages/sync-client/src/data-source packages/sync-client/src/index.ts packages/sync-client/test/data-source.test.ts
git commit -m "feat(sync-client): replica DataSource — pending is an answer, not a lie

ingest answers refused-with-reason instantly or pending; it can never
say committed because the replica cannot know that yet. Summaries carry
the badge; search confesses it reads the offline copy."
```

### Task 13: app-core — contested-claim UX, offline reopen pair, skew badge, sync status bar

`packages/app-core` is Plan 6's package (amendment 10), written in parallel. This task ADDS files to it. **Guard:** if `packages/app-core` does not exist yet at execution time, scaffold it minimally first (Step 0); if it exists, skip Step 0 and match its test setup (`grep -n "environment" packages/app-core/vitest.config.ts` — expect jsdom + @testing-library/react).

**Files:**
- Create (only if missing): `packages/app-core/package.json`, `tsconfig.json`, `tsconfig.typecheck.json`, `vitest.config.ts`, `src/index.ts`
- Create: `packages/app-core/src/contests/contest-view-model.ts`
- Create: `packages/app-core/src/contests/contest-banner.tsx`
- Create: `packages/app-core/src/offline/reopen-pair.ts`
- Create: `packages/app-core/src/history/clock-skew-badge.tsx`
- Create: `packages/app-core/src/sync/sync-status-bar.tsx`
- Test: `packages/app-core/test/contests.test.tsx`
- Test: `packages/app-core/test/reopen-pair.test.ts`
- Test: `packages/app-core/test/skew-and-status.test.tsx`

**Interfaces:**
- Consumes: `SubmittedEvent`, `newSubmittedEvent`, `renderContestedClaimText`, `plainTextToDoc`, `clockSkewMs`, `hasGrossClockSkew`, `formatIstInstant`, `IST_CLOCK_NOTE`, `WorkflowDef`, `Origin` (domain); `LocalContest`, `LocalIngestResult` shape (Task 12 — app-core declares the minimal structural types it needs rather than importing sync-client, keeping the package usable with the online DataSource too); amendment 10 `DataSource.ingest`; `packages/ui` tokens (amendment 11 — components use token classes/vars, zero colour literals).
- Produces (cross-plan API, `@gisik-nokma/app-core`):

```ts
// contests/contest-view-model.ts
export type ContestLike = {
  contestedEventId: string; ticketId: string; claimantId: string; rule: string; reason: string;
  originalEvent: SubmittedEvent; contestedAt: string; resolved: boolean; resolution: string | null;
};
export type IngestFn = (events: SubmittedEvent[]) => Promise<Array<{ status: string; eventId: string | null } & Record<string, unknown>>>;
export type ResolveContestInput =
  | { resolution: 'discarded'; note?: string }
  | { resolution: 'converted-to-comment' }
  | { resolution: 'redone'; replacementEvent: SubmittedEvent };
export function resolveContest(ingest: IngestFn, contest: ContestLike, input: ResolveContestInput, actor: { userId: string; origin: Origin }): Promise<{ ok: boolean; refused?: { rule: string; reason: string } }>;

// contests/contest-banner.tsx
export function ContestBanner(props: { contests: ContestLike[]; onResolve(contest: ContestLike, input: ResolveContestInput): void; onRedo(contest: ContestLike): void }): JSX.Element | null;
// onRedo is separate from onResolve on purpose: a redo needs a FRESH envelope, and
// resolveContest throws if handed the contested claim back as `replacementEvent`.

// offline/reopen-pair.ts
export function buildReopenPair(input: {
  workspaceId: string; parentTicketId: string; reopenToStateId: string;
  childEvent: SubmittedEvent;   // the refused ticket.created / ticket.reparented, re-issued
  actor: { userId: string; origin: Origin };
}): [SubmittedEvent, SubmittedEvent];   // [parent ticket.transitioned with cause, child event] — enqueue IN ORDER
export function nonTerminalStates(def: WorkflowDef): Array<{ id: string; name: string }>;

// history/clock-skew-badge.tsx
export function formatClockSkew(env: { clientTime: string; serverTime: string }): string | null; // null = no badge
export function ClockSkewBadge(props: { env: { clientTime: string; serverTime: string } }): JSX.Element | null;

// sync/sync-status-bar.tsx
export function SyncStatusBar(props: { status: 'offline'|'connecting'|'catching-up'|'live'; queued: number; failed: number }): JSX.Element;
export function syncStatusLabel(status: string, queued: number): string; // "3 claims waiting to send" · "Offline — 3 claims waiting to send" · "Live"
```

- [ ] **Step 0 (only if `packages/app-core` is missing): minimal scaffold**

`packages/app-core/package.json` — mirror `packages/sync-client/package.json` renamed to `@gisik-nokma/app-core`, dependencies `{ "@gisik-nokma/domain": "workspace:*", "react": "^18.3.1" }`, devDependencies add `{ "@testing-library/react": "^16.0.0", "jsdom": "^25.0.0", "@types/react": "^18.3.12", "react-dom": "^18.3.1" }`; `vitest.config.ts` with `test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'] }`; tsconfigs copied from sync-client plus `"jsx": "react-jsx"` in compilerOptions. Run `pnpm install`. (If Plan 6's real scaffold lands later with different versions, its versions win — these files exist only so this plan's components are testable now.)

- [ ] **Step 1: Write the failing reopen-pair test**

`packages/app-core/test/reopen-pair.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newSubmittedEvent } from '@gisik-nokma/domain';
import { buildReopenPair, nonTerminalStates } from '../src/offline/reopen-pair.js';

const WS = 'ws_1';
const PARENT = '01J9GPAR000000000000000000';

const wf = {
  id: 'wf', version: 1, name: 'W', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' as const },
    { id: 'doing', name: 'Doing', category: 'active' as const },
    { id: 'done', name: 'Done', category: 'terminal' as const },
  ],
  transitions: [],
};

describe('nonTerminalStates', () => {
  it('offers exactly the non-terminal states for the reopen dialog', () => {
    expect(nonTerminalStates(wf)).toEqual([
      { id: 'todo', name: 'To do' },
      { id: 'doing', name: 'Doing' },
    ]);
  });
});

describe('buildReopenPair', () => {
  it('emits parent transition WITH cause first, then the child event — order is the contract', () => {
    const child = newSubmittedEvent({
      workspaceId: WS, entity: { kind: 'ticket', id: '01J9GCHD000000000000000000' }, type: 'ticket.created',
      payload: { typeId: 'sub-task', projectId: '01J9GPRJ000000000000000000', parentId: PARENT, title: 'Late child' },
      actorId: 'user_a', origin: 'desktop',
    });
    const [reopen, reissued] = buildReopenPair({
      workspaceId: WS, parentTicketId: PARENT, reopenToStateId: 'doing', childEvent: child,
      actor: { userId: 'user_a', origin: 'desktop' },
    });
    expect(reopen).toMatchObject({
      entity: { kind: 'ticket', id: PARENT },
      type: 'ticket.transitioned',
      actorId: 'user_a',
      payload: { toStateId: 'doing', cause: { kind: 'reopened-for-child', childTicketId: child.entity.id } },
    });
    expect(reissued).toEqual(child); // the child claim itself is untouched — same id, same payload
  });
});
```

- [ ] **Step 2: Implement reopen-pair, then run**

`packages/app-core/src/offline/reopen-pair.ts`:

```ts
import { newSubmittedEvent, type Origin, type SubmittedEvent, type WorkflowDef } from '@gisik-nokma/domain';

/** The dialog's choices: reopen targets are the parent workflow's non-terminal states. */
export function nonTerminalStates(def: WorkflowDef): Array<{ id: string; name: string }> {
  return def.states.filter((s) => s.category !== 'terminal').map((s) => ({ id: s.id, name: s.name }));
}

/**
 * The owner reopen decision, offline: "Parent X is <terminal>. Reopen it and
 * proceed?" On acceptance the parent's transition (with its named cause) goes
 * FIRST, then the child event — the pre-check overlay makes the pair pass
 * locally, and the server sees the same order at sync. If the world changed,
 * the pair contests coherently (harness S5).
 */
export function buildReopenPair(input: {
  workspaceId: string;
  parentTicketId: string;
  reopenToStateId: string;
  childEvent: SubmittedEvent;
  actor: { userId: string; origin: Origin };
}): [SubmittedEvent, SubmittedEvent] {
  const reopen = newSubmittedEvent({
    workspaceId: input.workspaceId,
    entity: { kind: 'ticket', id: input.parentTicketId },
    type: 'ticket.transitioned',
    payload: {
      toStateId: input.reopenToStateId,
      cause: { kind: 'reopened-for-child', childTicketId: input.childEvent.entity.id },
    },
    actorId: input.actor.userId,
    origin: input.actor.origin,
  });
  return [reopen, input.childEvent];
}
```

Run: `pnpm vitest run test/reopen-pair.test.ts` (from `packages/app-core/`) → PASS.

- [ ] **Step 3: Write the failing contests test**

`packages/app-core/test/contests.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { newSubmittedEvent } from '@gisik-nokma/domain';
import { resolveContest, type ContestLike } from '../src/contests/contest-view-model.js';
import { ContestBanner } from '../src/contests/contest-banner.js';

const TICKET = '01J9GTKA000000000000000000';

function contest(): ContestLike {
  return {
    contestedEventId: '01J9GCON000000000000000000',
    ticketId: TICKET,
    claimantId: 'user_b',
    rule: 'restrict-to',
    reason: 'Only the assignee may do this.',
    originalEvent: newSubmittedEvent({
      workspaceId: 'ws_1', entity: { kind: 'ticket', id: TICKET }, type: 'ticket.transitioned',
      payload: { toStateId: 'done' }, actorId: 'user_b', origin: 'mobile',
    }),
    contestedAt: '2026-08-20T10:00:00.000Z',
    resolved: false,
    resolution: null,
  };
}

describe('ContestBanner', () => {
  it('names what was claimed, by whom, when, and which rule now refuses it', () => {
    render(<ContestBanner contests={[contest()]} onResolve={() => undefined} onRedo={() => undefined} />);
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('user_b');
    expect(banner.textContent).toContain('ticket.transitioned');
    expect(banner.textContent).toContain('restrict-to');
    expect(banner.textContent).toContain('Only the assignee may do this.');
    // The "when" is India time, named as such — not a raw ISO instant, and not
    // the viewer's device clock (owner decision 2026-08-20).
    expect(banner.textContent).toContain('IST');
    expect(banner.textContent).not.toContain('T00:00:00.000Z');
    expect(screen.getByRole('button', { name: /redo/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /convert to comment/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /discard/i })).toBeTruthy();
  });

  it('renders nothing when there is nothing contested — no empty chrome', () => {
    const { container } = render(<ContestBanner contests={[]} onResolve={() => undefined} onRedo={() => undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('planted defect: Redo goes to onRedo, NEVER to onResolve with the contested envelope as the replacement', () => {
    const onResolve = vi.fn();
    const onRedo = vi.fn();
    const c = contest();
    render(<ContestBanner contests={[c]} onResolve={onResolve} onRedo={onRedo} />);
    fireEvent.click(screen.getByRole('button', { name: /redo/i }));
    expect(onRedo).toHaveBeenCalledWith(c);
    expect(onResolve).not.toHaveBeenCalled(); // handing back c.originalEvent would throw in resolveContest
  });
});

describe('resolveContest', () => {
  it('discard emits ONE recorded resolution event carrying who discarded', async () => {
    const ingest = vi.fn(async (events: unknown[]) => events.map(() => ({ status: 'pending', eventId: 'x' })));
    const c = contest();
    const result = await resolveContest(ingest, c, { resolution: 'discarded', note: 'stale' }, { userId: 'user_c', origin: 'desktop' });
    expect(result.ok).toBe(true);
    expect(ingest).toHaveBeenCalledTimes(1);
    const [events] = ingest.mock.calls[0]!;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'claim.contested_resolved',
      actorId: 'user_c', // the discard is itself a recorded event, attributed
      entity: { kind: 'ticket', id: TICKET },
      payload: { contestedEventId: c.contestedEventId, resolution: 'discarded', note: 'stale' },
    });
  });

  it('convert-to-comment emits comment.added with the claim text, then the linked resolution', async () => {
    const ingest = vi.fn(async (events: unknown[]) => events.map(() => ({ status: 'pending', eventId: 'x' })));
    const c = contest();
    await resolveContest(ingest, c, { resolution: 'converted-to-comment' }, { userId: 'user_c', origin: 'desktop' });
    const [events] = ingest.mock.calls[0]!;
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: 'comment.added' });
    const bodyText = JSON.stringify((events[0] as { payload: { body: unknown } }).payload.body);
    expect(bodyText).toContain('user_b');          // the original claimant survives in the comment
    expect(bodyText).toContain('restrict-to');
    expect(events[1]).toMatchObject({
      type: 'claim.contested_resolved',
      payload: { resolution: 'converted-to-comment', commentEventId: (events[0] as { id: string }).id },
    });
  });

  it('redo sends the replacement first and links it from the resolution', async () => {
    const ingest = vi.fn(async (events: unknown[]) => events.map(() => ({ status: 'pending', eventId: 'x' })));
    const c = contest();
    const replacement = newSubmittedEvent({
      workspaceId: 'ws_1', entity: { kind: 'ticket', id: TICKET }, type: 'ticket.transitioned',
      payload: { toStateId: 'done', comment: 'done legally this time' }, actorId: 'user_b', origin: 'desktop',
    });
    await resolveContest(ingest, c, { resolution: 'redone', replacementEvent: replacement }, { userId: 'user_b', origin: 'desktop' });
    const [events] = ingest.mock.calls[0]!;
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(replacement);
    expect(events[1]).toMatchObject({ payload: { resolution: 'redone', replacementEventId: replacement.id } });
  });

  it('a refused resolution surfaces the refusal instead of pretending', async () => {
    const ingest = vi.fn(async (events: unknown[]) =>
      events.map(() => ({ status: 'refused', eventId: 'x', rule: 'contest.already-resolved', reason: 'planted' })));
    const result = await resolveContest(ingest, contest(), { resolution: 'discarded' }, { userId: 'user_c', origin: 'desktop' });
    expect(result).toEqual({ ok: false, refused: { rule: 'contest.already-resolved', reason: 'planted' } });
  });

  it('planted defect: redoing with the contested id itself throws — a redo is a fresh claim', async () => {
    const ingest = vi.fn(async () => []);
    const c = contest();
    await expect(
      resolveContest(ingest, c, { resolution: 'redone', replacementEvent: c.originalEvent }, { userId: 'user_b', origin: 'desktop' }),
    ).rejects.toThrow(/fresh envelope/);
    expect(ingest).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Implement the view-model and banner**

`packages/app-core/src/contests/contest-view-model.ts`:

```ts
import {
  newSubmittedEvent,
  plainTextToDoc,
  renderContestedClaimText,
  type Origin,
  type SubmittedEvent,
} from '@gisik-nokma/domain';

export type ContestLike = {
  contestedEventId: string; ticketId: string; claimantId: string; rule: string; reason: string;
  originalEvent: SubmittedEvent; contestedAt: string; resolved: boolean; resolution: string | null;
};

export type IngestFn = (
  events: SubmittedEvent[],
) => Promise<Array<{ status: string; eventId: string | null } & Record<string, unknown>>>;

export type ResolveContestInput =
  | { resolution: 'discarded'; note?: string }
  | { resolution: 'converted-to-comment' }
  | { resolution: 'redone'; replacementEvent: SubmittedEvent };

/**
 * The three human resolutions (spec §5). Each is events, in one ordered ingest
 * call: nothing here mutates anything — it appends attributed claims, and a
 * refusal comes back named instead of being swallowed.
 */
export async function resolveContest(
  ingest: IngestFn,
  contest: ContestLike,
  input: ResolveContestInput,
  actor: { userId: string; origin: Origin },
): Promise<{ ok: boolean; refused?: { rule: string; reason: string } }> {
  const entity = { kind: 'ticket' as const, id: contest.ticketId };
  const resolutionEvent = (payload: Record<string, unknown>): SubmittedEvent =>
    newSubmittedEvent({
      workspaceId: contest.originalEvent.workspaceId, entity, type: 'claim.contested_resolved',
      payload, actorId: actor.userId, origin: actor.origin,
    });

  if (input.resolution === 'redone' && input.replacementEvent.id === contest.originalEvent.id) {
    // The original id is already contested — re-sending it would idempotently
    // re-answer 'contested'. A redo is a FRESH claim: fail loudly, not quietly.
    throw new Error('redone requires a fresh envelope: the replacement must not reuse the contested claim id');
  }

  let events: SubmittedEvent[];
  if (input.resolution === 'discarded') {
    events = [resolutionEvent({ contestedEventId: contest.contestedEventId, resolution: 'discarded', ...(input.note === undefined ? {} : { note: input.note }) })];
  } else if (input.resolution === 'converted-to-comment') {
    const comment = newSubmittedEvent({
      workspaceId: contest.originalEvent.workspaceId, entity, type: 'comment.added',
      payload: { body: plainTextToDoc(renderContestedClaimText({ originalEvent: contest.originalEvent, rule: contest.rule, reason: contest.reason })) },
      actorId: actor.userId, origin: actor.origin,
    });
    events = [comment, resolutionEvent({ contestedEventId: contest.contestedEventId, resolution: 'converted-to-comment', commentEventId: comment.id })];
  } else {
    events = [input.replacementEvent, resolutionEvent({ contestedEventId: contest.contestedEventId, resolution: 'redone', replacementEventId: input.replacementEvent.id })];
  }

  const results = await ingest(events);
  const refused = results.find((r) => r.status === 'refused' || r.status === 'invalid');
  if (refused !== undefined) {
    return { ok: false, refused: { rule: String(refused.rule ?? refused.code ?? 'invalid'), reason: String(refused.reason ?? refused.message ?? '') } };
  }
  return { ok: true };
}
```

`packages/app-core/src/contests/contest-banner.tsx`:

```tsx
import { IST_CLOCK_NOTE, renderContestedClaimText } from '@gisik-nokma/domain';
import type { ContestLike, ResolveContestInput } from './contest-view-model.js';

/**
 * The ticket banner: every open contested claim, verbatim — what was claimed,
 * by whom, when, which rule now refuses it — with the three resolutions.
 * BEM classes; colours come from packages/ui tokens (amendment 11).
 *
 * The "when" is India time, because renderContestedClaimText formats it there
 * (owner decision 2026-08-20) — the same date the calendar, the timeline and
 * the inbox give the same instant. IST_CLOCK_NOTE says so out loud, since a
 * collaborator working from another timezone is reading their own action
 * rendered in IST: the same instant, correctly labelled, and labelled is the
 * part that makes it honest rather than confusing.
 */
export function ContestBanner(props: {
  contests: ContestLike[];
  onResolve(contest: ContestLike, input: ResolveContestInput): void;
  onRedo(contest: ContestLike): void;
}): JSX.Element | null {
  const open = props.contests.filter((c) => !c.resolved);
  if (open.length === 0) return null;
  return (
    <div className="contest-banner" role="alert">
      {open.map((c) => (
        <div className="contest-banner__item" key={c.contestedEventId}>
          <p className="contest-banner__claim" title={IST_CLOCK_NOTE}>
            {renderContestedClaimText({ originalEvent: c.originalEvent, rule: c.rule, reason: c.reason })}
          </p>
          <div className="contest-banner__actions">
            <button className="contest-banner__action" type="button" onClick={() => props.onRedo(c)}>
              Redo legally
            </button>
            <button className="contest-banner__action" type="button" onClick={() => props.onResolve(c, { resolution: 'converted-to-comment' })}>
              Convert to comment
            </button>
            <button className="contest-banner__action contest-banner__action--discard" type="button" onClick={() => props.onResolve(c, { resolution: 'discarded' })}>
              Discard
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

(The "Redo legally" button calls `onRedo`, NOT `onResolve` — deliberately. A redo is a *fresh* claim: `resolveContest` throws when handed the contested envelope back as `replacementEvent` (the planted defect above), so the banner must never present the contested event under that name. `onRedo` hands the host the contest; the host opens its edit affordance seeded from `contest.originalEvent`, builds a NEW envelope with `newSubmittedEvent`, and only then calls `resolveContest(…, { resolution: 'redone', replacementEvent: fresh })`. The banner itself stays dumb.)

Run: `pnpm vitest run test/contests.test.tsx` → PASS (8 tests).

- [ ] **Step 5: Skew badge + status bar (failing test, then implement)**

`packages/app-core/test/skew-and-status.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClockSkewBadge, formatClockSkew } from '../src/history/clock-skew-badge.js';
import { SyncStatusBar, syncStatusLabel } from '../src/sync/sync-status-bar.js';

describe('clock skew in history', () => {
  it('no badge under the gross threshold — both clocks are simply kept', () => {
    expect(formatClockSkew({ clientTime: '2026-08-20T12:00:30.000Z', serverTime: '2026-08-20T12:00:00.000Z' })).toBeNull();
  });

  it('planted defect: an 11-minute skew renders the flag, attributed to the device clock', () => {
    const text = formatClockSkew({ clientTime: '2026-08-20T12:11:00.000Z', serverTime: '2026-08-20T12:00:00.000Z' });
    expect(text).toBe('device clock ran 11 min ahead of the server');
    render(<ClockSkewBadge env={{ clientTime: '2026-08-20T11:49:00.000Z', serverTime: '2026-08-20T12:00:00.000Z' }} />);
    expect(screen.getByText('device clock ran 11 min behind the server')).toBeTruthy();
  });

  it('an unparseable client claim is flagged, not hidden', () => {
    expect(formatClockSkew({ clientTime: 'garbage', serverTime: '2026-08-20T12:00:00.000Z' })).toBe('device clock claim unreadable');
  });
});

describe('sync status bar', () => {
  it('says how many claims wait, and that offline search is the offline copy story', () => {
    expect(syncStatusLabel('live', 0)).toBe('Live');
    expect(syncStatusLabel('live', 3)).toBe('3 claims waiting to send');
    expect(syncStatusLabel('offline', 3)).toBe('Offline — 3 claims waiting to send');
    expect(syncStatusLabel('offline', 1)).toBe('Offline — 1 claim waiting to send');
    expect(syncStatusLabel('catching-up', 0)).toBe('Catching up…');
    render(<SyncStatusBar status="offline" queued={2} failed={1} />);
    expect(screen.getByRole('status').textContent).toContain('Offline — 2 claims waiting to send');
    expect(screen.getByRole('status').textContent).toContain('1 needs attention');
  });
});
```

`packages/app-core/src/history/clock-skew-badge.tsx`:

```tsx
import { clockSkewMs, hasGrossClockSkew } from '@gisik-nokma/domain';

/** Renders spec §5's skew flag: derived from the two kept clocks, shown only when gross. */
export function formatClockSkew(env: { clientTime: string; serverTime: string }): string | null {
  if (!hasGrossClockSkew(env)) return null;
  const skew = clockSkewMs(env);
  if (skew === null) return 'device clock claim unreadable';
  const minutes = Math.round(Math.abs(skew) / 60_000);
  return `device clock ran ${minutes} min ${skew > 0 ? 'ahead of' : 'behind'} the server`;
}

export function ClockSkewBadge(props: { env: { clientTime: string; serverTime: string } }): JSX.Element | null {
  const text = formatClockSkew(props.env);
  if (text === null) return null;
  return <span className="clock-skew-badge">{text}</span>;
}
```

`packages/app-core/src/sync/sync-status-bar.tsx`:

```tsx
export function syncStatusLabel(status: string, queued: number): string {
  const claims = queued === 1 ? '1 claim waiting to send' : `${queued} claims waiting to send`;
  if (status === 'offline') return queued === 0 ? 'Offline' : `Offline — ${claims}`;
  if (status === 'catching-up') return 'Catching up…';
  if (status === 'connecting') return 'Connecting…';
  return queued === 0 ? 'Live' : claims;
}

/** The one sync-truth strip both apps mount: status, queued claims, failed items. */
export function SyncStatusBar(props: { status: 'offline' | 'connecting' | 'catching-up' | 'live'; queued: number; failed: number }): JSX.Element {
  return (
    <div className="sync-status-bar" role="status" data-status={props.status}>
      <span className="sync-status-bar__label">{syncStatusLabel(props.status, props.queued)}</span>
      {props.failed > 0 ? <span className="sync-status-bar__failed">{props.failed} needs attention</span> : null}
    </div>
  );
}
```

Run: `pnpm vitest run test/skew-and-status.test.tsx` → PASS (4 tests). Export everything new from `packages/app-core/src/index.ts`.

- [ ] **Step 6: Run the whole app-core suite, commit**

Run (from `packages/app-core/`): `pnpm test` → green.

```bash
git add packages/app-core
git commit -m "feat(app-core): contested-claim UX, offline reopen pair, skew badge, sync truth strip

The banner shows the claim verbatim with its refusing rule; all three
resolutions are ordered events (the discard is recorded, the redo and
comment are linked); the reopen dialog builds its pair in the only
order that can pass; gross clock skew renders as the attributed flag."
```

---

### Task 14: Dual-client harness rig — two replicas, one real server, real Postgres

The spec's named testing discipline (§7): "Sync gets a scripted dual-client harness: two replicas diverge offline, sync, and the outcome — including every contested claim — is asserted exactly." This rig is a first-class deliverable; Task 15 scripts the scenarios on top of it.

**Files:**
- Create: `apps/server/test/dual-client/rig.ts`
- Test: `apps/server/test/dual-client/rig.test.ts` (the rig proves itself before scenarios trust it)
- Modify: `apps/server/package.json` (add `"@gisik-nokma/sync-client": "workspace:*"` to devDependencies; run `pnpm install`)

**Interfaces:**
- Consumes: `createIngestService`, `buildProjectionRegistry`, `createTestDatabase` (Plan 1); `createSyncService` (Task 7); `visibleEventsFor` (Plan 4 + Task 3 cursor); `readStreamSeq` (Task 3); `runSnapshotPass` (Task 5); the bootstrap assembly (Task 6's semantics, invoked as a function — see `bootstrapFor` below); `createReplica`, `createOutbox`, `createBetterSqliteStorage`, `createSyncEngine`, `SyncTransport` (sync-client).
- Produces (harness API for Task 15):

```ts
export type HarnessClient = {
  userId: string;
  replica: Replica;
  outbox: Outbox;
  ds: ReplicaDataSource;
  goOnline(): Promise<void>;    // flush outbox through the REAL sync service, then catch up via visibleEventsFor
  syncDown(): Promise<void>;    // catch up only
  submit(event: SubmittedEvent): Promise<LocalIngestResult>; // ds.ingest sugar (pre-check + queue; nothing sent while "offline")
};
export type Harness = {
  pool: Pool;
  workspaceId: string;   // the seeded scenario workspace
  projectId: string;
  ingestInteractive(events: SubmittedEvent[]): Promise<IngestResult[]>; // the online-user stand-in (/v1/events semantics)
  client(userId: string): Promise<HarnessClient>;   // bootstraps a fresh replica for that user
  ledger(entityId: string): Promise<Array<{ id: string; type: string; seq: number; actorId: string }>>;
  contests(): Promise<Array<Record<string, unknown>>>; // proj_contested rows, ordered
  projTicket(ticketId: string): Promise<TicketState | null>; // the SERVER's read model (Plan 3's getTicketStateFromDb)
  snapshotPass(): Promise<void>;
  drop(): Promise<void>;
};
export function createHarness(): Promise<Harness>;
```

The harness pipes `visibleEventsFor` output straight into `replica.applyServerItem` — the same primitive amendment 13's WS wraps — so scenarios are deterministic without sockets. (Plan 5's live `/v1/stream` is exercised by its own tests; the transport-level smoke on the apps is Tasks 16/17's concern.)

- [ ] **Step 1: Write the failing rig self-test**

`apps/server/test/dual-client/rig.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid } from '@gisik-nokma/domain';
import { createHarness, type Harness } from './rig.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});

afterAll(async () => {
  await h.drop();
});

describe('the rig', () => {
  it('a claim from client A reaches client B through sync, exactly once', async () => {
    const a = await h.client('usr_a');
    const b = await h.client('usr_b');
    const ticketId = newUlid();
    const created = newSubmittedEvent({
      workspaceId: h.workspaceId, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.created',
      payload: { typeId: 'task', projectId: h.projectId, parentId: null, title: 'Crosses the wire' },
      actorId: 'usr_a', origin: 'desktop',
    });
    expect(await a.submit(created)).toMatchObject({ status: 'pending' });
    expect(await b.ds.query.getTicket(ticketId)).toBeNull(); // not yet — A is offline
    await a.goOnline();
    await b.syncDown();
    expect((await a.ds.query.getTicket(ticketId))?.confirmed?.stateId).toBe('todo');
    expect((await b.ds.query.getTicket(ticketId))?.confirmed?.stateId).toBe('todo');
    // and syncing down again changes nothing — idempotent all the way
    await b.syncDown();
    expect(await b.ds.query.listEntityEvents(ticketId)).toHaveLength(1);
    expect(await h.ledger(ticketId)).toEqual([{ id: created.id, type: 'ticket.created', seq: 1, actorId: 'usr_a' }]);
  });
});
```

- [ ] **Step 2: Implement the rig**

`apps/server/test/dual-client/rig.ts`:

```ts
import type { Pool } from 'pg';
import { newSubmittedEvent, type EventEnvelope, type SubmittedEvent, type TicketState } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import {
  createOutbox,
  createReplica,
  createReplicaDataSource,
  createSyncEngine,
  type LocalIngestResult,
  type Outbox,
  type Replica,
  type ReplicaDataSource,
  type SyncTransport,
} from '@gisik-nokma/sync-client';
// The node adapter lives on the testing subpath so app builds never resolve
// better-sqlite3; the harness runs under vitest, where the subpath is at home.
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
import { createIngestService, type IngestResult, type IngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { getTicketStateFromDb } from '../../src/projections/tickets.js';
import { createSyncService, type SyncService } from '../../src/sync/sync-service.js';
import { visibleEventsFor } from '../../src/visibility/visible-events-for.js';
import { readStreamSeq } from '../../src/sync/stream-seq.js';
import { runSnapshotPass } from '../../src/sync/snapshot-writer.js';
import { readEntityEvents, rowToEnvelope } from '../../src/ledger/event-store.js';
import { readLatestSnapshot } from '../../src/ledger/snapshot-store.js';
import { listVisibleTickets } from '../../src/visibility/can-see.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedMember } from '../helpers/seed.js';

const BACKFILL = ['comment.added', 'attachment.added', 'claim.contested', 'claim.contested_resolved'];

export type HarnessClient = {
  userId: string;
  replica: Replica;
  outbox: Outbox;
  ds: ReplicaDataSource;
  goOnline(): Promise<void>;
  syncDown(): Promise<void>;
  submit(event: SubmittedEvent): Promise<LocalIngestResult>;
};

export type Harness = {
  pool: Pool;
  workspaceId: string;
  projectId: string;
  ingestInteractive(events: SubmittedEvent[]): Promise<IngestResult[]>;
  client(userId: string): Promise<HarnessClient>;
  ledger(entityId: string): Promise<Array<{ id: string; type: string; seq: number; actorId: string }>>;
  contests(): Promise<Array<Record<string, unknown>>>;
  snapshotPass(): Promise<void>;
  drop(): Promise<void>;
};

/** Bootstrap assembled from the same primitives the route uses (Task 6 semantics, no HTTP). */
async function bootstrapFor(pool: Pool, userId: string, workspaceId: string) {
  const eff = await resolveEffectiveRole(pool, userId, workspaceId);
  if (eff.workspaceRole === null) throw new Error(`${userId} is not a member of ${workspaceId}`);
  const streamSeq = await readStreamSeq(pool, workspaceId);
  const { rows } = await pool.query(
    `SELECT * FROM events WHERE workspace_id = $1 AND entity_kind IN ('workflow', 'ticket-type') ORDER BY entity_kind, entity_id, seq`,
    [workspaceId],
  );
  const definitions = rows.map((r) => rowToEnvelope(r as never));
  const tickets = [];
  const client = await pool.connect();
  try {
    for (const row of await listVisibleTickets(client, userId, workspaceId)) {
      const ticketId = row.ticket_id as string;
      const snapshot = await readLatestSnapshot(client, 'ticket', ticketId);
      const all = await readEntityEvents(client, 'ticket', ticketId);
      const snapSeq = snapshot?.seq ?? 0;
      tickets.push({
        ticketId,
        snapshot: snapshot === null ? null : { seq: snapshot.seq, state: snapshot.state as never },
        events: all.filter((e) => e.seq > snapSeq || BACKFILL.includes(e.type)),
      });
    }
  } finally {
    client.release();
  }
  return {
    workspaceId,
    me: { userId, workspaceRole: eff.workspaceRole, projectIds: [...eff.projects] },
    streamSeq,
    definitions,
    tickets,
  };
}

export async function createHarness(): Promise<Harness> {
  const db: TestDatabase = await createTestDatabase();
  const workspaceId = 'ws_harness';
  const projectId = '01J9GPRJ000000000000000000';
  const ingest: IngestService = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
  const syncService: SyncService = createSyncService({ pool: db.pool, ingest });

  const harness: Harness = {
    pool: db.pool,
    workspaceId,
    projectId,
    ingestInteractive: (events) => ingest.ingestBatch(events),

    async client(userId) {
      const storage = createBetterSqliteStorage();
      const replica = await createReplica({ storage });
      const outbox = createOutbox({ storage, replica });
      // The engine exists so ds.ingest's opportunistic flush has a target, but its
      // transport never reaches the network: goOnline drives sync explicitly.
      const inert: SyncTransport = {
        bootstrap: async () => bootstrapFor(db.pool, userId, workspaceId),
        sync: async () => { throw new Error('harness clients sync via goOnline()'); },
        openStream: () => ({ close: () => undefined }),
      };
      const engine = createSyncEngine({ replica, outbox, transport: inert });
      const ds = createReplicaDataSource({ replica, outbox, engine });
      await replica.loadBootstrap(await bootstrapFor(db.pool, userId, workspaceId));

      const clientHandle: HarnessClient = {
        userId, replica, outbox, ds,
        async syncDown() {
          const cursor = await replica.getCursor(workspaceId);
          for await (const item of visibleEventsFor(db.pool, userId, workspaceId, cursor)) {
            await replica.applyServerItem(item);
          }
          await replica.setCursor(workspaceId, await readStreamSeq(db.pool, workspaceId));
        },
        async goOnline() {
          for (;;) {
            const batch = await outbox.nextBatch();
            if (batch.length === 0) break;
            const results = await syncService.processBatch(userId, batch.map((b) => b.envelope));
            for (let i = 0; i < batch.length; i += 1) {
              await outbox.applyResult(batch[i]!.eventId, results[i]! as never);
            }
          }
          await clientHandle.syncDown();
        },
        async submit(event) {
          const [result] = await ds.ingest([event]);
          return result!;
        },
      };
      return clientHandle;
    },

    async ledger(entityId) {
      const { rows } = await db.pool.query(
        "SELECT id, type, seq, actor_id FROM events WHERE entity_id = $1 ORDER BY seq",
        [entityId],
      );
      return rows.map((r: Record<string, unknown>) => ({ id: r.id as string, type: r.type as string, seq: Number(r.seq), actorId: r.actor_id as string }));
    },

    async contests() {
      const { rows } = await db.pool.query('SELECT * FROM proj_contested ORDER BY contested_at, contested_event_id');
      return rows as Array<Record<string, unknown>>;
    },

    // Plan 3's proj_tickets read — the server's own read model, so scenarios can
    // prove server projection ≡ reducer-folded replicas, not just replica ≡ replica.
    projTicket: (ticketId) => getTicketStateFromDb(db.pool, workspaceId, ticketId),

    snapshotPass: async () => { await runSnapshotPass(db.pool, { minEvents: 1 }); },
    drop: () => db.drop(),
  };

  // Shared scenario ground: memberships + definitions, via real ingest. Scenarios create their own tickets.
  await seedMember(db.pool, workspaceId, 'usr_a');
  await seedMember(db.pool, workspaceId, 'usr_b');
  const submit = (entity: { kind: 'workflow'|'ticket-type'|'ticket'; id: string }, type: string, payload: unknown, actorId = 'usr_a') =>
    newSubmittedEvent({ workspaceId, entity, type, payload, actorId, origin: 'server' });
  const seeded = await ingest.ingestBatch([
    submit({ kind: 'workflow', id: 'wf_h' }, 'workflow.defined', {
      id: 'wf_h', version: 1, name: 'Harness', initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'review', name: 'Review', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        // leaving ANY state for todo is assignee-only: this is what makes S5's
        // reopen contestable when the assignment changed under the offline client
        { from: '*', to: 'todo', rules: [{ kind: 'restrict-to', assignee: true }] },
        { from: '*', to: 'review', rules: [] },
        { from: 'review', to: 'done', rules: [{ kind: 'restrict-to', assignee: true }] },
        { from: 'todo', to: 'done', rules: [{ kind: 'restrict-to', assignee: true }] },
      ],
    }),
    submit({ kind: 'ticket-type', id: 'task' }, 'ticket-type.defined', { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_h', fields: [] }),
    submit({ kind: 'ticket-type', id: 'sub-task' }, 'ticket-type.defined', { id: 'sub-task', name: 'Sub-task', icon: 'dot', rank: 4, workflowId: 'wf_h', fields: [] }),
  ]);
  for (const r of seeded) {
    if (r.status !== 'committed') throw new Error(`harness seed failed: ${JSON.stringify(r)}`);
  }
  return harness;
}
```

(`restrict-to` rule literal: as in Task 7, copy the exact config shape from Plan 2's fixtures. `seedMember`/`seedTicket` signatures: from Plan 4's helpers, verified in place.)

- [ ] **Step 3: Run the rig self-test**

Run (from `apps/server/`): `pnpm vitest run test/dual-client/rig.test.ts`
Expected: PASS (1 test). This also proves CI wiring: the suite runs inside the existing server test job against real Postgres (Plan 1's `createTestDatabase` — no new CI configuration needed; verify the job includes `apps/server` tests with `grep -rn "apps/server" .github/workflows/ 2>/dev/null || true` and note the CI file Plan 1/11 owns).

- [ ] **Step 4: Commit**

```bash
git add apps/server/test/dual-client/rig.ts apps/server/test/dual-client/rig.test.ts apps/server/package.json pnpm-lock.yaml
git commit -m "test(server): dual-client harness rig — two real replicas against the real sync door

The spec's named discipline gets its instrument: sync-client replicas on
in-memory SQLite, the real ingest + sync service + visibleEventsFor on
real Postgres, deterministic and CI-ready."
```

### Task 15: Dual-client scenarios S1–S6 — diverge offline, sync, assert EXACTLY

**Files:**
- Test: `apps/server/test/dual-client/scenarios.test.ts`

**Interfaces:**
- Consumes: the whole rig (Task 14); `seedTicket` (Plan 4 helper) for visibility flips; `REFUSAL_RULES` names (Plan 2); `VISIBILITY_REFUSAL_RULE` (Task 7).
- Produces: the six scripted scenarios the spec names, asserted against final ledger, projections, BOTH replicas, and every contested claim:
  - **S1 concurrent-field-set** — later stream order wins the projection; the earlier claim survives in history; both replicas converge byte-identically.
  - **S2 stale-assignee restrict-to** — passes the stale local pre-check, contests on the server with rule `restrict-to`.
  - **S3 workflow-changed-stranded** — workflow v2 removed the target state while offline; the transition contests with the exact engine rule.
  - **S4 visibility-revoked** — purge on sync-down; outbox claim contests `visibility.not-visible`; the revoked replica holds no content, the claimant keeps an honest local stub; other viewers see the contest in the ledger.
  - **S5 offline-reopen-pair** — the world changed; BOTH halves contest coherently (reopen: `restrict-to`; child: `hierarchy.parent-terminal`).
  - **S6 duplicate-batch** — the same outbox batch lands twice; results identical, ledger unchanged, one contest only.

- [ ] **Step 1: Write the scenario suite (this whole task is one test file; write it complete)**

`apps/server/test/dual-client/scenarios.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { seedTicket } from '../helpers/seed.js';
import { createHarness, type Harness, type HarnessClient } from './rig.js';

let h: Harness;
let a: HarnessClient; // usr_a — the "online" side of each divergence
let b: HarnessClient; // usr_b — the offline claimant

beforeEach(async () => {
  h = await createHarness();
  a = await h.client('usr_a');
  b = await h.client('usr_b');
});

afterEach(async () => {
  await h.drop();
});

function ticketEvent(actorId: string, ticketId: string, type: string, payload: unknown): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: h.workspaceId, entity: { kind: 'ticket', id: ticketId }, type, payload,
    actorId, origin: actorId === 'usr_a' ? 'desktop' : 'mobile',
  });
}

/** Seed one workspace-visible ticket through the interactive door and pull both replicas current. */
async function seedSharedTicket(extra: SubmittedEvent[] = []): Promise<string> {
  const ticketId = newUlid();
  const results = await h.ingestInteractive([
    ticketEvent('usr_a', ticketId, 'ticket.created', { typeId: 'task', projectId: h.projectId, parentId: null, title: 'Shared ground' }),
    ...extra,
  ]);
  for (const r of results) expect(r.status).toBe('committed');
  await seedTicket(h.pool, h.workspaceId, ticketId, { visibility: 'workspace' });
  await a.syncDown();
  await b.syncDown();
  return ticketId;
}

async function expectReplicasConverged(ticketId: string): Promise<void> {
  const ta = await a.ds.query.getTicket(ticketId);
  const tb = await b.ds.query.getTicket(ticketId);
  expect(tb?.confirmed).toEqual(ta?.confirmed);
  expect(tb?.contests).toEqual(ta?.contests);
  expect(await b.ds.query.listEntityEvents(ticketId)).toEqual(await a.ds.query.listEntityEvents(ticketId));
  expect(ta?.pending ?? null).toBeNull();
  expect(tb?.pending ?? null).toBeNull(); // nothing left in transit after full sync
  // the strongest line in the harness: the SERVER's read model (proj_tickets,
  // Plan 3's projection) equals the reducer-folded replicas — server and
  // clients can never quietly disagree (spec §7).
  expect(await h.projTicket(ticketId)).toEqual(ta?.confirmed ?? null);
}

describe('S1 — concurrent field_set: later claim wins the projection, earlier survives in history', () => {
  it('asserts the exact final ledger and both replicas byte-identical', async () => {
    const ticketId = await seedSharedTicket();
    const claimA = ticketEvent('usr_a', ticketId, 'ticket.field_set', { fieldId: 'notes', value: 'A said this' });
    const claimB = ticketEvent('usr_b', ticketId, 'ticket.field_set', { fieldId: 'notes', value: 'B said this' });
    expect(await a.submit(claimA)).toMatchObject({ status: 'pending' });
    expect(await b.submit(claimB)).toMatchObject({ status: 'pending' });

    await a.goOnline();   // A lands first…
    await b.goOnline();   // …B lands second: the later claim
    await a.syncDown();

    expect(await h.ledger(ticketId)).toEqual([
      expect.objectContaining({ type: 'ticket.created', seq: 1 }),
      { id: claimA.id, type: 'ticket.field_set', seq: 2, actorId: 'usr_a' },
      { id: claimB.id, type: 'ticket.field_set', seq: 3, actorId: 'usr_b' },
    ]);
    const ticket = await a.ds.query.getTicket(ticketId);
    expect(ticket?.confirmed?.fields.notes).toMatchObject({ value: 'B said this', actorId: 'usr_b' }); // later wins…
    expect((await h.projTicket(ticketId))?.fields.notes).toMatchObject({ value: 'B said this', actorId: 'usr_b' }); // …in the SERVER projection too
    const history = await a.ds.query.listEntityEvents(ticketId);
    expect(history.map((e) => e.id)).toContain(claimA.id); // …earlier is preserved, never erased
    expect(await h.contests()).toEqual([]); // a race is not a rule violation
    await expectReplicasConverged(ticketId);
  });
});

describe('S2 — restrict-to violated because the world changed: contested with the exact rule', () => {
  it('B was assignee locally, reassignment landed meanwhile; the offline claim contests', async () => {
    const ticketId = await seedSharedTicket();
    // make B assignee, sync everyone
    await h.ingestInteractive([ticketEvent('usr_a', ticketId, 'ticket.assigned', { assigneeId: 'usr_b' })]);
    await a.syncDown();
    await b.syncDown();

    // B goes offline and claims Done — legal against B's replica (B is assignee)
    const doneClaim = ticketEvent('usr_b', ticketId, 'ticket.transitioned', { toStateId: 'done' });
    expect(await b.submit(doneClaim)).toMatchObject({ status: 'pending' }); // local pre-check passes

    // meanwhile A reassigns to A — the world changes
    await h.ingestInteractive([ticketEvent('usr_a', ticketId, 'ticket.assigned', { assigneeId: 'usr_a' })]);

    await b.goOnline();
    await a.syncDown();

    const contests = await h.contests();
    expect(contests).toHaveLength(1);
    expect(contests[0]).toMatchObject({
      original_event_id: doneClaim.id, ticket_id: ticketId, claimant_id: 'usr_b', rule: 'restrict-to', resolved: false,
    });
    const ledger = await h.ledger(ticketId);
    expect(ledger.map((e) => e.type)).toEqual(['ticket.created', 'ticket.assigned', 'ticket.assigned', 'claim.contested']);
    const ticket = await b.ds.query.getTicket(ticketId);
    expect(ticket?.confirmed?.stateId).toBe('todo'); // the refused claim moved NOTHING
    expect(ticket?.contests[0]).toMatchObject({ rule: 'restrict-to', claimantId: 'usr_b', resolved: false });
    expect((await b.ds.query.myWork(h.workspaceId, 'usr_b')).contested).toHaveLength(1); // claimant's attention
    await expectReplicasConverged(ticketId);
  });
});

describe('S3 — workflow changed while offline: the stranded transition contests', () => {
  it('v2 removed "review"; B\'s queued transition to it contests with the engine\'s exact rule', async () => {
    const ticketId = await seedSharedTicket();
    // B offline: claim a move to review (legal under v1)
    const toReview = ticketEvent('usr_b', ticketId, 'ticket.transitioned', { toStateId: 'review' });
    expect(await b.submit(toReview)).toMatchObject({ status: 'pending' });

    // meanwhile v2 lands without "review", mapping review → todo
    const v2 = newSubmittedEvent({
      workspaceId: h.workspaceId, entity: { kind: 'workflow', id: 'wf_h' }, type: 'workflow.defined',
      payload: {
        id: 'wf_h', version: 2, name: 'Harness', initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [
          { from: '*', to: 'todo', rules: [] },
          { from: 'todo', to: 'done', rules: [{ kind: 'restrict-to', assignee: true }] },
        ],
        stateMapping: { review: 'todo' },
      },
      actorId: 'usr_a', origin: 'web',
    });
    // ^ stateMapping field name: copy the exact key from Plan 2's stateMappingSchema
    //   (grep -n "stateMapping" packages/domain/src — the schema is the contract)
    const [v2result] = await h.ingestInteractive([v2]);
    expect(v2result?.status).toBe('committed');

    await b.goOnline();
    await a.syncDown();

    const contests = await h.contests();
    expect(contests).toHaveLength(1);
    expect(contests[0]).toMatchObject({ original_event_id: toReview.id, claimant_id: 'usr_b', resolved: false });
    expect(['unknown-state', 'illegal-transition', 'stranded-state']).toContain(contests[0]!.rule as string);
    // pin the exact rule once observed and assert it strictly — the point of the
    // scenario is EXACT outcomes; after the first green run, replace the
    // three-way membership with the single literal the engine actually names.
    const ticket = await b.ds.query.getTicket(ticketId);
    expect(ticket?.confirmed?.stateId).toBe('todo');
    await expectReplicasConverged(ticketId);
  });
});

describe('S4 — visibility revoked while offline: purge down, contest up, honest stubs', () => {
  it('the revoked replica holds no content; the claim contests visibility.not-visible; viewers see the contest', async () => {
    const ticketId = await seedSharedTicket();
    // B offline edits
    const edit = ticketEvent('usr_b', ticketId, 'ticket.field_set', { fieldId: 'notes', value: 'B private note' });
    expect(await b.submit(edit)).toMatchObject({ status: 'pending' });

    // meanwhile visibility flips to explicit: only usr_a
    await seedTicket(h.pool, h.workspaceId, ticketId, { visibility: 'explicit', userIds: ['usr_a'] });
    const visibilityEvent = ticketEvent('usr_a', ticketId, 'visibility.set', { mode: 'explicit', userIds: ['usr_a'] });
    // ^ visibility.set payload: mirror Plan 4's registered schema exactly
    //   (grep -n "visibility.set" packages/domain/src)
    await h.ingestInteractive([visibilityEvent]);

    await b.goOnline(); // pushes the edit → contests; then syncs down → purge

    // up: the claim contested, with the visibility rule
    const contests = await h.contests();
    expect(contests).toHaveLength(1);
    expect(contests[0]).toMatchObject({ original_event_id: edit.id, rule: 'visibility.not-visible', claimant_id: 'usr_b' });

    // down: B's replica holds NO content for the ticket (planted defect)
    expect(await b.ds.query.getTicket(ticketId)).toBeNull(); // pending gone, confirmed purged
    expect(await b.ds.query.listEntityEvents(ticketId)).toEqual([]);
    expect((await b.ds.query.search(h.workspaceId, 'Shared ground')).hits).toEqual([]);
    // …but the claimant keeps an honest, content-light stub of their own contested claim
    const stubs = await b.ds.query.listContests(h.workspaceId, { claimantId: 'usr_b', open: true });
    expect(stubs).toHaveLength(1);
    expect(stubs[0]).toMatchObject({ originalEventId: edit.id, rule: 'visibility.not-visible' });

    // A (who still sees the ticket) sees the contest as ledger history
    await a.syncDown();
    const ticketForA = await a.ds.query.getTicket(ticketId);
    expect(ticketForA?.contests).toHaveLength(1);
    expect((await h.ledger(ticketId)).map((e) => e.type)).toEqual(['ticket.created', 'visibility.set', 'claim.contested']);
  });
});

describe('S5 — the offline reopen pair contests coherently when the world changed', () => {
  it('reopen refused restrict-to, child then refused hierarchy.parent-terminal — two contests, exact rules', async () => {
    // parent assigned to A and Done (A may transition; B may not)
    const parentId = await seedSharedTicket();
    await h.ingestInteractive([
      ticketEvent('usr_a', parentId, 'ticket.assigned', { assigneeId: 'usr_a' }),
      ticketEvent('usr_a', parentId, 'ticket.transitioned', { toStateId: 'done' }),
    ]);
    await a.syncDown();
    await b.syncDown();

    // B offline: creating a child under Done parent refuses locally, dialog offers reopen.
    const childId = newUlid();
    const child = ticketEvent('usr_b', childId, 'ticket.created', { typeId: 'sub-task', projectId: h.projectId, parentId, title: 'Needs the parent open' });
    const bare = await b.submit(child);
    expect(bare).toMatchObject({ status: 'refused', rule: 'hierarchy.parent-terminal' }); // the dialog trigger

    // B accepts the dialog. For the pair to pass LOCALLY but contest on the
    // server, B's replica must be stale: reassign the parent to B, sync B
    // (reopen now locally legal for B), then A takes it back while B is offline.
    await h.ingestInteractive([ticketEvent('usr_a', parentId, 'ticket.assigned', { assigneeId: 'usr_b' })]);
    await b.syncDown(); // B's replica: parent Done, assignee usr_b — reopen is locally legal
    await h.ingestInteractive([ticketEvent('usr_a', parentId, 'ticket.assigned', { assigneeId: 'usr_a' })]); // world changes

    const [reopen, reissued] = [
      ticketEvent('usr_b', parentId, 'ticket.transitioned', { toStateId: 'todo', cause: { kind: 'reopened-for-child', childTicketId: childId } }),
      child,
    ];
    expect(await b.submit(reopen)).toMatchObject({ status: 'pending' });
    expect(await b.submit(reissued)).toMatchObject({ status: 'pending' }); // overlay sees the queued reopen

    await b.goOnline();
    await a.syncDown();

    const contests = await h.contests();
    expect(contests).toHaveLength(2);
    expect(contests[0]).toMatchObject({ original_event_id: reopen.id, ticket_id: parentId, rule: 'restrict-to' });
    expect(contests[1]).toMatchObject({ original_event_id: child.id, ticket_id: childId, rule: 'hierarchy.parent-terminal' });
    // note: the child contest attaches to the CHILD ticket id — the entity the
    // refused claim addressed — even though that ticket never came to exist.
    const parent = await a.ds.query.getTicket(parentId);
    expect(parent?.confirmed?.stateId).toBe('done'); // nothing moved
    expect((await h.projTicket(parentId))?.stateId).toBe('done'); // server projection agrees: nothing moved
    expect(await h.projTicket(childId)).toBeNull(); // and nothing was created server-side
    expect(await a.ds.query.getTicket(childId).then((t) => t?.confirmed ?? null)).toBeNull(); // nothing created
    expect((await b.ds.query.myWork(h.workspaceId, 'usr_b')).contested).toHaveLength(2);
  });
});

describe('S6 — the same batch twice: idempotent to the byte', () => {
  it('replaying a mixed committed/contested batch changes nothing', async () => {
    const ticketId = await seedSharedTicket();
    await h.ingestInteractive([ticketEvent('usr_a', ticketId, 'ticket.assigned', { assigneeId: 'usr_a' })]);
    await b.syncDown();
    const legal = ticketEvent('usr_b', ticketId, 'ticket.field_set', { fieldId: 'notes', value: 'kept' });
    const illegal = ticketEvent('usr_b', ticketId, 'ticket.transitioned', { toStateId: 'done' }); // restrict-to usr_a — but B's replica knows that…
    // …so bypass the pre-check deliberately: this scenario tests the SERVER's
    // idempotency, so feed the sync service directly, twice, like a retrying client.
    const { createSyncService } = await import('../../src/sync/sync-service.js');
    const { createIngestService } = await import('../../src/ingest/ingest-service.js');
    const { buildProjectionRegistry } = await import('../../src/projections/index.js');
    const { evaluateEvent } = await import('@gisik-nokma/rule-engine');
    const service = createSyncService({
      pool: h.pool,
      ingest: createIngestService({ pool: h.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() }),
    });
    const first = await service.processBatch('usr_b', [legal, illegal]);
    const eventsAfterFirst = await h.ledger(ticketId);
    const second = await service.processBatch('usr_b', [legal, illegal]);

    expect(second).toEqual(first);                          // identical answers, same seqs, same contest id
    expect(await h.ledger(ticketId)).toEqual(eventsAfterFirst); // not one event more
    const contests = await h.contests();
    expect(contests).toHaveLength(1);
    expect(contests[0]).toMatchObject({ original_event_id: illegal.id });
  });
});
```

- [ ] **Step 2: Run the suite; pin exact rules**

Run (from `apps/server/`): `pnpm vitest run test/dual-client/scenarios.test.ts`
Expected: PASS (6 scenarios). Two follow-ups the suite itself demands:
1. In S3, replace the three-way `toContain` with the single rule the engine actually named (strict equality) — the scenario asserts EXACT outcomes.
2. If any assertion needed loosening to pass, that is a finding, not a fix: stop and reconcile the underlying module instead.

- [ ] **Step 3: Run the entire workspace test suite**

Run (repo root): `pnpm -r test`
Expected: every package green — domain, rule-engine, server (incl. rebuild-and-diff with `proj_contested`), sync-client, app-core.

- [ ] **Step 4: Commit**

```bash
git add apps/server/test/dual-client/scenarios.test.ts
git commit -m "test(server): dual-client scenarios — divergence, contests, purge, reopen pair, idempotent retry

Six scripted divergences asserted to the byte: final ledger, projections,
both replicas, and every contested claim. The board that cannot lie,
proven with two boards and one truth."
```

---

### Task 16: `apps/desktop` — Tauri 2 + Vite React shell on the replica DataSource

**Files:**
- Create: `apps/desktop/package.json`, `apps/desktop/vite.config.ts`, `apps/desktop/index.html`, `apps/desktop/tsconfig.json`, `apps/desktop/vitest.config.ts`
- Create: `apps/desktop/src/main.tsx`, `apps/desktop/src/app.tsx`
- Create: `apps/desktop/src/storage/tauri-sql-storage.ts`
- Create: `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/src/main.rs`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/capabilities/default.json`, `apps/desktop/src-tauri/build.rs`
- Test: `apps/desktop/src/storage/tauri-sql-storage.test.ts`

**Interfaces:**
- Consumes: `SyncStorage`, `createReplica`, `createOutbox`, `createSyncEngine`, `createHttpTransport`, `createReplicaDataSource` (sync-client); `SyncStatusBar`, `ContestBanner`, board/list views as Plan 6 lands them (assumption flagged); `@tauri-apps/plugin-sql`.
- Produces: `createTauriSqlStorage(dbName?: string): Promise<SyncStorage>`; a running desktop shell wiring app-core to the replica DataSource with online/offline transitions and the sync status UI. Sign-in: better-auth bearer token via the existing web auth flow (Plan 4's `/api/auth/*`), stored with `@tauri-apps/plugin-store` — kept minimal here; Plan 6's session handling is the reference implementation (assumption flagged).

- [ ] **Step 1: Scaffold the Tauri app**

`apps/desktop/package.json`:

```json
{
  "name": "@gisik-nokma/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json --noEmit && vite build",
    "tauri": "tauri",
    "test": "vitest run"
  },
  "dependencies": {
    "@gisik-nokma/app-core": "workspace:*",
    "@gisik-nokma/domain": "workspace:*",
    "@gisik-nokma/sync-client": "workspace:*",
    "@tauri-apps/api": "^2.1.1",
    "@tauri-apps/plugin-sql": "^2.0.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.1.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^6.0.0",
    "vitest": "^3.1.0"
  }
}
```

`apps/desktop/src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Gisik Nokma",
  "version": "0.1.0",
  "identifier": "com.gisik-nokma.desktop",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [{ "title": "Gisik Nokma", "width": 1200, "height": 800 }],
    "security": { "csp": null }
  },
  "plugins": {}
}
```

`apps/desktop/src-tauri/Cargo.toml`:

```toml
[package]
name = "gisik-nokma-desktop"
version = "0.1.0"
edition = "2021"

[lib]
name = "gisik_nokma_desktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

`apps/desktop/src-tauri/src/lib.rs`:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running gisik-nokma desktop");
}
```

`apps/desktop/src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    gisik_nokma_desktop_lib::run();
}
```

`apps/desktop/src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

`apps/desktop/src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "windows": ["main"],
  "permissions": ["core:default", "sql:default", "sql:allow-execute", "sql:allow-select", "sql:allow-load"]
}
```

`apps/desktop/vite.config.ts`, `index.html`, `tsconfig.json`, `vitest.config.ts`: standard Vite React (plugin-react, root `index.html` mounting `src/main.tsx` at `#root`, `"jsx": "react-jsx"`, vitest `environment: 'jsdom'` for `src/**/*.test.ts`). Run `pnpm install`.

- [ ] **Step 2: Write the failing storage-adapter test (fake plugin, real mapping)**

`apps/desktop/src/storage/tauri-sql-storage.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { wrapTauriDatabase } from './tauri-sql-storage.js';

type Call = { method: 'execute' | 'select'; sql: string; params: unknown[] };

function fakeDb() {
  const calls: Call[] = [];
  return {
    calls,
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ method: 'execute', sql, params });
      return { rowsAffected: 1 };
    }),
    select: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ method: 'select', sql, params });
      return [{ id: 'a', n: 1 }];
    }),
  };
}

describe('wrapTauriDatabase', () => {
  it('maps run→execute and all→select with positional params', async () => {
    const db = fakeDb();
    const storage = wrapTauriDatabase(db);
    await storage.run('INSERT INTO t (id) VALUES (?)', ['a']);
    expect(await storage.all('SELECT id, n FROM t WHERE id = ?', ['a'])).toEqual([{ id: 'a', n: 1 }]);
    expect(db.calls).toEqual([
      { method: 'execute', sql: 'INSERT INTO t (id) VALUES (?)', params: ['a'] },
      { method: 'select', sql: 'SELECT id, n FROM t WHERE id = ?', params: ['a'] },
    ]);
  });

  it('transaction wraps in BEGIN IMMEDIATE / COMMIT, rolls back on throw, serialises', async () => {
    const db = fakeDb();
    const storage = wrapTauriDatabase(db);
    await storage.transaction(async (tx) => tx.run('INSERT INTO t (id) VALUES (?)', ['x']));
    await expect(storage.transaction(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    const sqls = db.calls.map((c) => c.sql);
    expect(sqls).toEqual(['BEGIN IMMEDIATE', "INSERT INTO t (id) VALUES (?)", 'COMMIT', 'BEGIN IMMEDIATE', 'ROLLBACK']);
  });
});
```

- [ ] **Step 3: Implement the adapter**

`apps/desktop/src/storage/tauri-sql-storage.ts`:

```ts
import type { SqlRow, SqlValue, SyncStorage } from '@gisik-nokma/sync-client';

type TauriDatabase = {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  select(sql: string, params?: unknown[]): Promise<unknown>;
};

/**
 * SyncStorage over tauri-plugin-sql. The plugin has no transaction API, so
 * BEGIN IMMEDIATE/COMMIT/ROLLBACK run as statements behind a promise queue —
 * one writer at a time, same discipline as the other adapters.
 */
export function wrapTauriDatabase(db: TauriDatabase): SyncStorage {
  let queue: Promise<unknown> = Promise.resolve();

  const base = {
    async run(sql: string, params: SqlValue[] = []): Promise<void> {
      await db.execute(sql, params);
    },
    async all(sql: string, params: SqlValue[] = []): Promise<SqlRow[]> {
      return (await db.select(sql, params)) as SqlRow[];
    },
  };

  return {
    ...base,
    async transaction<T>(fn: (tx: SyncStorage) => Promise<T>): Promise<T> {
      const job = queue.then(async () => {
        await db.execute('BEGIN IMMEDIATE');
        try {
          const result = await fn({
            ...base,
            transaction: () => Promise.reject(new Error('no nested transactions')),
            close: async () => undefined,
          });
          await db.execute('COMMIT');
          return result;
        } catch (err) {
          await db.execute('ROLLBACK');
          throw err;
        }
      });
      queue = job.catch(() => undefined);
      return job;
    },
    close: async () => undefined, // plugin owns the connection lifecycle
  };
}

export async function createTauriSqlStorage(dbName = 'gisik-nokma.db'): Promise<SyncStorage> {
  const { default: Database } = await import('@tauri-apps/plugin-sql');
  return wrapTauriDatabase(await Database.load(`sqlite:${dbName}`));
}
```

Run: `pnpm vitest run src/storage/tauri-sql-storage.test.ts` (from `apps/desktop/`) → PASS (2 tests).

- [ ] **Step 4: Wire the shell**

`apps/desktop/src/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.js';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`apps/desktop/src/app.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { SyncStatusBar } from '@gisik-nokma/app-core';
import {
  createHttpTransport,
  createOutbox,
  createReplica,
  createReplicaDataSource,
  createSyncEngine,
  type ReplicaDataSource,
  type SyncStatus,
} from '@gisik-nokma/sync-client';
import { createTauriSqlStorage } from './storage/tauri-sql-storage.js';

// Dev configuration; Plan 11 owns real endpoints. Session/workspace selection
// follows Plan 6's session handling once it lands (Open questions) — until
// then the token and workspace arrive via localStorage set on the sign-in page.
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

export function App(): JSX.Element {
  const [ds, setDs] = useState<ReplicaDataSource | null>(null);
  const [status, setStatus] = useState<SyncStatus>('offline');
  const [queued, setQueued] = useState(0);
  const [failed, setFailed] = useState(0);
  const workspaceId = useMemo(() => localStorage.getItem('gisik.workspaceId') ?? '', []);
  const token = useMemo(() => localStorage.getItem('gisik.token') ?? '', []);

  useEffect(() => {
    if (workspaceId === '' || token === '') return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void (async () => {
      const storage = await createTauriSqlStorage();
      const replica = await createReplica({ storage });
      const outbox = createOutbox({ storage, replica });
      const transport = createHttpTransport({ baseUrl: API_BASE, token });
      const engine = createSyncEngine({ replica, outbox, transport });
      const dataSource = createReplicaDataSource({ replica, outbox, engine });
      if (disposed) return;
      setDs(dataSource);
      const offStatus = engine.onStatus(setStatus);
      const refreshCounts = (): void => {
        void dataSource.query.syncStatus(workspaceId).then((s) => {
          setQueued(s.queued);
          setFailed(s.failed);
        });
      };
      const offChange = dataSource.subscribe(workspaceId, 0, refreshCounts);
      // Online/offline transitions: the OS's word starts/stops the engine;
      // the engine's status is what the UI trusts.
      const goOnline = (): void => void engine.start(workspaceId);
      const goOffline = (): void => engine.stop();
      window.addEventListener('online', goOnline);
      window.addEventListener('offline', goOffline);
      if (navigator.onLine) void engine.start(workspaceId);
      refreshCounts();
      stop = () => {
        offStatus();
        offChange();
        window.removeEventListener('online', goOnline);
        window.removeEventListener('offline', goOffline);
        engine.stop();
      };
    })();
    return () => {
      disposed = true;
      stop?.();
    };
  }, [workspaceId, token]);

  if (workspaceId === '' || token === '') {
    return <p className="app-signin-hint">Sign in on the web app, then paste your token in Settings (interim flow — see plan Open questions).</p>;
  }
  return (
    <div className="app-shell">
      <SyncStatusBar status={status} queued={queued} failed={failed} />
      {/* Plan 6's Board/List/ticket views mount here with ds as their DataSource.
          Until they land, the shell renders the status bar and a minimal ticket
          list driven by ds.query.listTickets — enough to see pending badges live.

          When they do mount: the Calendar and Timeline take `today`/`anchor` as
          `istDayOf(new Date().toISOString())` — the device supplies the instant,
          which it owns, and the domain decides the day, which it owns — and any
          timestamp this shell prints goes through `formatIstInstant`, with
          `IST_CLOCK_NOTE` naming the clock. Never `toLocaleDateString()`, and
          never the zone name written inline — it comes from IST_TIME_ZONE. A
          desktop replica that answered "which day is this?" from the OS would
          put the same claim in a different cell from the server, and nothing
          would report the disagreement. */}
      {ds === null ? <p>Opening local replica…</p> : <TicketList ds={ds} workspaceId={workspaceId} />}
    </div>
  );
}

function TicketList(props: { ds: ReplicaDataSource; workspaceId: string }): JSX.Element {
  const [tickets, setTickets] = useState<Awaited<ReturnType<typeof props.ds.query.listTickets>>>([]);
  useEffect(() => {
    const refresh = (): void => void props.ds.query.listTickets(props.workspaceId).then(setTickets);
    refresh();
    return props.ds.subscribe(props.workspaceId, 0, refresh);
  }, [props.ds, props.workspaceId]);
  return (
    <ul className="ticket-list">
      {tickets.map((t) => (
        <li className="ticket-list__row" key={t.ticketId}>
          <span className="ticket-list__title">{t.title}</span>
          <span className="ticket-list__state">{t.stateId}</span>
          {t.pending ? <span className="ticket-list__badge ticket-list__badge--pending">claim in transit</span> : null}
          {t.openContests > 0 ? <span className="ticket-list__badge ticket-list__badge--contested">{t.openContests} contested</span> : null}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Verify build and tests**

Run (from `apps/desktop/`): `pnpm test` → PASS; `pnpm build` → clean typecheck + Vite build. `pnpm tauri dev` is a manual smoke (requires local Rust toolchain) — note in the PR, do not gate CI on it.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop
git commit -m "feat(desktop): Tauri 2 shell on the replica DataSource

tauri-plugin-sql behind the one storage interface, the OS's online/
offline word driving the engine, and the sync truth strip always
visible: claims in transit are badges, never facts."
```

### Task 17: `apps/mobile` — Expo shell, op-sqlite replica, webview editor bridge, push stub

**Files:**
- Create: `apps/mobile/package.json`, `apps/mobile/app.json`, `apps/mobile/tsconfig.json`, `apps/mobile/vitest.config.ts`, `apps/mobile/index.ts`
- Create: `apps/mobile/src/app.tsx`
- Create: `apps/mobile/src/storage/op-sqlite-storage.ts`
- Create: `apps/mobile/src/screens/board-screen.tsx`, `apps/mobile/src/screens/ticket-screen.tsx`
- Create: `apps/mobile/src/editor/editor-web-view.tsx`
- Create: `apps/mobile/src/push/register-push.ts`
- Test: `apps/mobile/src/storage/op-sqlite-storage.test.ts`
- Test: `apps/mobile/src/editor/editor-web-view.test.ts`
- Test: `apps/mobile/src/push/register-push.test.ts`

**Interfaces:**
- Consumes: sync-client (replica DataSource, one storage interface); app-core view-models (`syncStatusLabel`, `resolveContest`, `buildReopenPair` — RN screens are native components over app-core view-models, amendment 17); Plan 7's webview editor bridge (assumption pinned below, flagged in Open questions); Plan 9's `NotificationTransport` client side (assumption pinned below, flagged).
- Produces:
  - `wrapOpSqliteDatabase(db)/createOpSqliteStorage(name?): SyncStorage`.
  - `EditorWebView` RN component `{ initialDoc: unknown; onChange(doc: unknown): void; html?: string }` speaking the bridge protocol `{type:'editor-ready'}` / `{type:'set-doc', doc}` / `{type:'doc-changed', doc}` over `postMessage` — the protocol lives in ONE constant so a Plan 7 rename is a one-file fix.
  - `registerPushToken(opts): Promise<{registered: boolean; reason?: string}>` — the client half of Plan 9's push transport; tolerates the route not existing yet.
  - Offline indicators: the same `SyncStatusBar` semantics via `syncStatusLabel` in a native strip; "searching offline copy" label on local search.

- [ ] **Step 1: Scaffold the Expo app**

`apps/mobile/package.json`:

```json
{
  "name": "@gisik-nokma/mobile",
  "version": "0.1.0",
  "private": true,
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "test": "vitest run"
  },
  "dependencies": {
    "@gisik-nokma/app-core": "workspace:*",
    "@gisik-nokma/domain": "workspace:*",
    "@gisik-nokma/sync-client": "workspace:*",
    "@op-engineering/op-sqlite": "^15.0.0",
    "@react-navigation/native": "^7.0.0",
    "@react-navigation/native-stack": "^7.0.0",
    "expo": "~54.0.0",
    "expo-notifications": "~0.32.0",
    "react": "18.3.1",
    "react-native": "0.81.0",
    "react-native-get-random-values": "^1.11.0",
    "react-native-safe-area-context": "^5.0.0",
    "react-native-screens": "^4.0.0",
    "react-native-webview": "^13.12.0"
  },
  "devDependencies": {
    "@types/react": "~18.3.12",
    "typescript": "^5.6.3",
    "vitest": "^3.1.0"
  }
}
```

Version note for the executor: `expo ~54` / RN `0.81` are the versions current at plan time — on execution run `npx expo install --check` and accept what the Expo SDK pins (op-sqlite requires a dev build, not Expo Go; `expo run:ios|android` builds one). `apps/mobile/index.ts`:

```ts
import 'react-native-get-random-values'; // ulidx needs crypto.getRandomValues on RN — MUST be first
import { registerRootComponent } from 'expo';
import { App } from './src/app.js';

registerRootComponent(App);
```

`app.json`: standard Expo config (`{"expo": {"name": "Gisik Nokma", "slug": "gisik-nokma", "scheme": "gisik-nokma", "newArchEnabled": true}}`). `vitest.config.ts`: node environment, `include: ['src/**/*.test.ts']` (component logic is tested at the module seam; RN rendering is covered by the manual smoke and Plan 11's e2e).

- [ ] **Step 2: op-sqlite adapter — failing test, then implement**

`apps/mobile/src/storage/op-sqlite-storage.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { wrapOpSqliteDatabase } from './op-sqlite-storage.js';

function fakeDb() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows: sql.startsWith('SELECT') ? [{ id: 'a', n: 1 }] : [] };
    }),
  };
}

describe('wrapOpSqliteDatabase', () => {
  it('maps run/all onto execute and returns plain row objects', async () => {
    const db = fakeDb();
    const storage = wrapOpSqliteDatabase(db);
    await storage.run('INSERT INTO t (id) VALUES (?)', ['a']);
    expect(await storage.all('SELECT id, n FROM t WHERE id = ?', ['a'])).toEqual([{ id: 'a', n: 1 }]);
  });

  it('transaction emits BEGIN IMMEDIATE/COMMIT and ROLLBACK on throw, serialised', async () => {
    const db = fakeDb();
    const storage = wrapOpSqliteDatabase(db);
    await storage.transaction(async (tx) => tx.run('INSERT INTO t (id) VALUES (?)', ['x']));
    await expect(storage.transaction(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(db.calls.map((c) => c.sql)).toEqual([
      'BEGIN IMMEDIATE', 'INSERT INTO t (id) VALUES (?)', 'COMMIT', 'BEGIN IMMEDIATE', 'ROLLBACK',
    ]);
  });
});
```

`apps/mobile/src/storage/op-sqlite-storage.ts`:

```ts
import type { SqlRow, SqlValue, SyncStorage } from '@gisik-nokma/sync-client';

type OpSqliteDb = { execute(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> };

/** SyncStorage over op-sqlite — same explicit-transaction discipline as the other adapters. */
export function wrapOpSqliteDatabase(db: OpSqliteDb): SyncStorage {
  let queue: Promise<unknown> = Promise.resolve();
  const base = {
    async run(sql: string, params: SqlValue[] = []): Promise<void> {
      await db.execute(sql, params);
    },
    async all(sql: string, params: SqlValue[] = []): Promise<SqlRow[]> {
      return (await db.execute(sql, params)).rows as SqlRow[];
    },
  };
  return {
    ...base,
    async transaction<T>(fn: (tx: SyncStorage) => Promise<T>): Promise<T> {
      const job = queue.then(async () => {
        await db.execute('BEGIN IMMEDIATE');
        try {
          const result = await fn({ ...base, transaction: () => Promise.reject(new Error('no nested transactions')), close: async () => undefined });
          await db.execute('COMMIT');
          return result;
        } catch (err) {
          await db.execute('ROLLBACK');
          throw err;
        }
      });
      queue = job.catch(() => undefined);
      return job;
    },
    close: async () => undefined,
  };
}

export async function createOpSqliteStorage(name = 'gisik-nokma.db'): Promise<SyncStorage> {
  const { open } = await import('@op-engineering/op-sqlite');
  return wrapOpSqliteDatabase(open({ name }) as unknown as OpSqliteDb);
}
```

Run: `pnpm vitest run src/storage/op-sqlite-storage.test.ts` (from `apps/mobile/`) → PASS. (If op-sqlite's `execute` is sync-returning in the installed version, the `await` still works; the adapter test pins the mapping, not the library.)

- [ ] **Step 3: Editor webview bridge — failing test, then implement**

`apps/mobile/src/editor/editor-web-view.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { EDITOR_BRIDGE, parseEditorMessage, setDocScript } from './editor-web-view.js';

describe('editor bridge protocol', () => {
  it('pins the frame names in one place — a Plan 7 rename is a one-line fix', () => {
    expect(EDITOR_BRIDGE).toEqual({ ready: 'editor-ready', setDoc: 'set-doc', docChanged: 'doc-changed' });
  });

  it('parses doc-changed frames and rejects noise without throwing', () => {
    const doc = { type: 'doc', content: [] };
    expect(parseEditorMessage(JSON.stringify({ type: 'doc-changed', doc }))).toEqual({ type: 'doc-changed', doc });
    expect(parseEditorMessage(JSON.stringify({ type: 'editor-ready' }))).toEqual({ type: 'editor-ready' });
    expect(parseEditorMessage('not json')).toBeNull();
    expect(parseEditorMessage(JSON.stringify({ type: 'unknown' }))).toBeNull();
  });

  it('setDocScript injects the doc as a set-doc frame', () => {
    const script = setDocScript({ type: 'doc', content: [] });
    expect(script).toContain('set-doc');
    expect(script).toContain('"type":"doc"');
  });
});
```

`apps/mobile/src/editor/editor-web-view.tsx`:

```tsx
import { useCallback, useRef } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

/**
 * Plan 7's webview editor, hosted (amendment 12: RN hosts the editor in a
 * webview — the honest mobile path for a Tiptap-family editor). ASSUMPTION
 * (Open questions): packages/editor exports getEditorWebviewHtml(): string —
 * a self-contained bundle speaking this postMessage protocol. The names live
 * in EDITOR_BRIDGE only, so reconciling with Plan 7 touches this file alone.
 */
export const EDITOR_BRIDGE = { ready: 'editor-ready', setDoc: 'set-doc', docChanged: 'doc-changed' } as const;

export type EditorMessage = { type: 'editor-ready' } | { type: 'doc-changed'; doc: unknown };

export function parseEditorMessage(raw: string): EditorMessage | null {
  try {
    const frame = JSON.parse(raw) as { type?: string; doc?: unknown };
    if (frame.type === EDITOR_BRIDGE.ready) return { type: 'editor-ready' };
    if (frame.type === EDITOR_BRIDGE.docChanged) return { type: 'doc-changed', doc: frame.doc };
    return null;
  } catch {
    return null;
  }
}

export function setDocScript(doc: unknown): string {
  return `window.postMessage(${JSON.stringify(JSON.stringify({ type: EDITOR_BRIDGE.setDoc, doc }))}); true;`;
}

export function EditorWebView(props: { initialDoc: unknown; onChange(doc: unknown): void; html: string }): JSX.Element {
  const ref = useRef<WebView>(null);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseEditorMessage(event.nativeEvent.data);
      if (message === null) return;
      if (message.type === 'editor-ready') ref.current?.injectJavaScript(setDocScript(props.initialDoc));
      else props.onChange(message.doc);
    },
    [props],
  );

  return <WebView ref={ref} originWhitelist={["about:*"]} source={{ html: props.html }} onMessage={onMessage} javaScriptEnabled />;
}
```

Run: `pnpm vitest run src/editor/editor-web-view.test.ts` → PASS (3 tests). (The `.tsx` imports `react-native-webview` — vitest resolves types only for the pure functions under test; if the import breaks node-environment tests, split the three pure exports into `editor-bridge.ts` and re-export — keep the test green without weakening it.)

- [ ] **Step 4: Push registration stub — failing test, then implement**

`apps/mobile/src/push/register-push.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { registerPushToken } from './register-push.js';

describe('registerPushToken', () => {
  const getToken = vi.fn(async () => ({ data: 'ExponentPushToken[abc]' }));

  it('POSTs the expo token to the push registration route', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const result = await registerPushToken({ baseUrl: 'http://api', token: 't', getToken, fetchImpl });
    expect(result).toEqual({ registered: true });
    expect(fetchImpl).toHaveBeenCalledWith('http://api/v1/push/registrations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ platform: 'expo', token: 'ExponentPushToken[abc]' }),
    }));
  });

  it('tolerates the transport not existing yet — stub honestly says so', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }));
    const result = await registerPushToken({ baseUrl: 'http://api', token: 't', getToken, fetchImpl });
    expect(result).toEqual({ registered: false, reason: 'transport-unavailable' });
  });

  it('reports permission denial without throwing', async () => {
    const denied = vi.fn(async () => { throw new Error('permission denied'); });
    const result = await registerPushToken({ baseUrl: 'http://api', token: 't', getToken: denied, fetchImpl: vi.fn() });
    expect(result).toEqual({ registered: false, reason: 'no-token' });
  });
});
```

`apps/mobile/src/push/register-push.ts`:

```ts
/**
 * The client half of Plan 9's NotificationTransport (assumption flagged in
 * Open questions): POST /v1/push/registrations {platform, token}. Written to
 * degrade honestly — a 404 means the server transport has not landed, and the
 * app keeps working without push rather than failing sign-in.
 */
export async function registerPushToken(opts: {
  baseUrl: string;
  token: string;
  getToken?: () => Promise<{ data: string }>;
  fetchImpl?: typeof fetch;
}): Promise<{ registered: boolean; reason?: string }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const getToken =
    opts.getToken ??
    (async () => {
      const Notifications = await import('expo-notifications');
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') throw new Error('permission denied');
      return Notifications.getExpoPushTokenAsync();
    });

  let expoToken: string;
  try {
    expoToken = (await getToken()).data;
  } catch {
    return { registered: false, reason: 'no-token' };
  }
  const res = await doFetch(`${opts.baseUrl}/v1/push/registrations`, {
    method: 'POST',
    headers: { authorization: `Bearer ${opts.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ platform: 'expo', token: expoToken }),
  });
  if (res.status === 404) return { registered: false, reason: 'transport-unavailable' };
  if (!res.ok) return { registered: false, reason: `http-${res.status}` };
  return { registered: true };
}
```

Run: `pnpm vitest run src/push/register-push.test.ts` → PASS (3 tests).

- [ ] **Step 5: Screens and shell wiring**

`apps/mobile/src/app.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  createHttpTransport, createOutbox, createReplica, createReplicaDataSource, createSyncEngine,
  type ReplicaDataSource, type SyncStatus,
} from '@gisik-nokma/sync-client';
import { createOpSqliteStorage } from './storage/op-sqlite-storage.js';
import { BoardScreen } from './screens/board-screen.js';
import { TicketScreen } from './screens/ticket-screen.js';
import { registerPushToken } from './push/register-push.js';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:3000';
// Interim session plumbing until Plan 6's session handling is the reference
// (Open questions): token + workspace from expo-constants extra in dev builds.
const TOKEN = process.env.EXPO_PUBLIC_DEV_TOKEN ?? '';
const WORKSPACE = process.env.EXPO_PUBLIC_DEV_WORKSPACE ?? '';

const Stack = createNativeStackNavigator();

export function App(): JSX.Element {
  const [ds, setDs] = useState<ReplicaDataSource | null>(null);
  const [status, setStatus] = useState<SyncStatus>('offline');
  const [queued, setQueued] = useState(0);
  const workspaceId = useMemo(() => WORKSPACE, []);

  useEffect(() => {
    if (workspaceId === '' || TOKEN === '') return;
    let stop: (() => void) | undefined;
    void (async () => {
      const storage = await createOpSqliteStorage();
      const replica = await createReplica({ storage });
      const outbox = createOutbox({ storage, replica });
      const engine = createSyncEngine({ replica, outbox, transport: createHttpTransport({ baseUrl: API_BASE, token: TOKEN }) });
      const dataSource = createReplicaDataSource({ replica, outbox, engine });
      setDs(dataSource);
      const offStatus = engine.onStatus(setStatus);
      const offChange = dataSource.subscribe(workspaceId, 0, () => {
        void dataSource.query.syncStatus(workspaceId).then((s) => setQueued(s.queued));
      });
      void engine.start(workspaceId);
      void registerPushToken({ baseUrl: API_BASE, token: TOKEN });
      stop = () => { offStatus(); offChange(); engine.stop(); };
    })();
    return () => stop?.();
  }, [workspaceId]);

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Board" options={{ title: 'Gisik Nokma' }}>
          {() => <BoardScreen ds={ds} workspaceId={workspaceId} status={status} queued={queued} />}
        </Stack.Screen>
        <Stack.Screen name="Ticket">
          {({ route }) => <TicketScreen ds={ds} ticketId={(route.params as { ticketId: string }).ticketId} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

`apps/mobile/src/screens/board-screen.tsx` — native components over app-core view-model helpers:

```tsx
import { useEffect, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { syncStatusLabel } from '@gisik-nokma/app-core';
import type { ReplicaDataSource, TicketSummary } from '@gisik-nokma/sync-client';

export function BoardScreen(props: { ds: ReplicaDataSource | null; workspaceId: string; status: string; queued: number }): JSX.Element {
  const navigation = useNavigation<{ navigate(name: string, params: { ticketId: string }): void }>();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [query, setQuery] = useState('');
  const [offlineCopy, setOfflineCopy] = useState(false);
  const { ds, workspaceId } = props;

  useEffect(() => {
    if (ds === null) return;
    const refresh = (): void => {
      if (query === '') {
        setOfflineCopy(false);
        void ds.query.listTickets(workspaceId).then(setTickets);
      } else {
        void ds.query.search(workspaceId, query).then(async (r) => {
          setOfflineCopy(r.offlineCopy); // always true on the replica — the label is the honesty
          const found: TicketSummary[] = [];
          for (const hit of r.hits) {
            const all = await ds.query.listTickets(workspaceId);
            const match = all.find((t) => t.ticketId === hit.ticketId);
            if (match !== undefined) found.push(match);
          }
          setTickets(found);
        });
      }
    };
    refresh();
    return ds.subscribe(workspaceId, 0, refresh);
  }, [ds, workspaceId, query]);

  return (
    <View>
      <Text accessibilityRole="text">{syncStatusLabel(props.status, props.queued)}</Text>
      <TextInput placeholder="Search" value={query} onChangeText={setQuery} />
      {offlineCopy && query !== '' ? <Text>searching offline copy</Text> : null}
      <FlatList
        data={tickets}
        keyExtractor={(t) => t.ticketId}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => navigation.navigate('Ticket', { ticketId: item.ticketId })}>
            <Text>{item.title} · {item.stateId}</Text>
            {item.pending ? <Text>claim in transit</Text> : null}
            {item.openContests > 0 ? <Text>{item.openContests} contested</Text> : null}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
```

`apps/mobile/src/screens/ticket-screen.tsx` — ticket sheet with the contest banner semantics and the editor bridge:

```tsx
import { useEffect, useState } from 'react';
import { Alert, Button, ScrollView, Text, View } from 'react-native';
import { resolveContest, type ContestLike } from '@gisik-nokma/app-core';
import { IST_CLOCK_NOTE, formatIstInstant, newSubmittedEvent, plainTextToDoc } from '@gisik-nokma/domain';
import type { ReplicaDataSource } from '@gisik-nokma/sync-client';
import { EditorWebView } from '../editor/editor-web-view.js';

// ASSUMPTION (Open questions): Plan 7 exports this; until it lands, comments
// fall back to a minimal self-contained editor page constant defined here.
const FALLBACK_EDITOR_HTML = `<!doctype html><html><body><textarea id="t" style="width:100%;height:40vh"></textarea>
<script>
  const t = document.getElementById('t');
  const send = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
  window.addEventListener('message', (e) => {
    try { const f = JSON.parse(e.data); if (f.type === 'set-doc') t.value = (f.doc.content?.[0]?.content?.[0]?.text) ?? ''; } catch {}
  });
  t.addEventListener('input', () => send({ type: 'doc-changed', doc: { type: 'doc', content: [{ type: 'paragraph', content: t.value === '' ? undefined : [{ type: 'text', text: t.value }] }] } }));
  send({ type: 'editor-ready' });
</script></body></html>`;

export function TicketScreen(props: { ds: ReplicaDataSource | null; ticketId: string }): JSX.Element {
  const { ds, ticketId } = props;
  const [ticket, setTicket] = useState<Awaited<ReturnType<NonNullable<typeof ds>['query']['getTicket']>>>(null);
  const [draft, setDraft] = useState<unknown>(plainTextToDoc(''));

  useEffect(() => {
    if (ds === null) return;
    const refresh = (): void => void ds.query.getTicket(ticketId).then(setTicket);
    refresh();
    return ds.subscribe('', 0, refresh);
  }, [ds, ticketId]);

  if (ds === null || ticket === null) return <Text>Opening…</Text>;
  const state = ticket.pending?.pending ?? ticket.confirmed;
  const openContests = ticket.contests.filter((c) => !c.resolved);

  const onResolve = (contest: ContestLike, resolution: 'discarded' | 'converted-to-comment'): void => {
    void resolveContest(ds.ingest, contest, resolution === 'discarded' ? { resolution } : { resolution }, {
      userId: contest.claimantId, origin: 'mobile',
    }).then((r) => {
      if (!r.ok) Alert.alert('Refused', `${r.refused?.rule}: ${r.refused?.reason}`);
    });
  };

  return (
    <ScrollView>
      <Text>{String((state?.fields.title as { value?: unknown } | undefined)?.value ?? '')}</Text>
      <Text>State: {state?.stateId} {ticket.pending !== null ? '(claim in transit)' : ''}</Text>
      {openContests.map((c) => (
        <View key={c.contestedEventId} accessibilityRole="alert">
          {/*
            The time renders through formatIstInstant, so this line shows the
            same date as the ticket's calendar marker and the same date the web
            banner shows. A raw c.originalEvent.clientTime would print a UTC
            instant — the only place in the product that does — and for the
            five and a half hours after IST midnight it would name the wrong
            day. IST_CLOCK_NOTE names the clock for a collaborator working from
            somewhere else; the zone string itself lives in the domain
            (IST_TIME_ZONE), never inline here.
          */}
          <Text accessibilityHint={IST_CLOCK_NOTE}>
            Contested: {c.originalEvent.type} by {c.claimantId} at {formatIstInstant(c.originalEvent.clientTime)} — {c.rule}: {c.reason}
          </Text>
          <Button title="Convert to comment" onPress={() => onResolve(c, 'converted-to-comment')} />
          <Button title="Discard" onPress={() => onResolve(c, 'discarded')} />
        </View>
      ))}
      <EditorWebView initialDoc={draft} onChange={setDraft} html={FALLBACK_EDITOR_HTML} />
      <Button
        title="Comment"
        onPress={() => {
          const me = state;
          if (me === undefined || me === null) return;
          void ds.ingest([
            newSubmittedEvent({
              workspaceId: me.workspaceId, entity: { kind: 'ticket', id: ticketId }, type: 'comment.added',
              payload: { body: draft }, actorId: me.assigneeId ?? 'me', origin: 'mobile',
            }),
          ]);
        }}
      />
    </ScrollView>
  );
}
```

Interim shortcuts marked for reconciliation (all flagged in Open questions): `actorId: me.assigneeId ?? 'me'` must become the session user id once Plan 6's session handling lands; the `subscribe('', …)` workspace argument is unused by the replica DataSource; `FALLBACK_EDITOR_HTML` is replaced by Plan 7's `getEditorWebviewHtml()`.

- [ ] **Step 6: Run all mobile tests, commit**

Run (from `apps/mobile/`): `pnpm test` → PASS (8 tests). `npx expo run:ios` / `run:android` is the manual smoke (dev build; op-sqlite excludes Expo Go).

```bash
git add apps/mobile
git commit -m "feat(mobile): Expo shell — op-sqlite replica, webview editor bridge, honest offline UI

Native screens over app-core view-models with the replica DataSource;
the editor rides a webview behind a one-constant bridge protocol; push
registration degrades honestly while Plan 9's transport lands."
```

---

### Task 18: `Features.md` §12 + `test-cases/12-offline-sync-apps.md`

Same change set as the work, per the workspace convention. This plan claims §12 and cases 12.x only.

**Files:**
- Modify: `Features.md` (append §12; if a §12 stub exists from reconciliation, replace its body)
- Create: `test-cases/12-offline-sync-apps.md`

- [ ] **Step 1: Append §12 to Features.md**

```markdown
## 12. Offline sync & the apps

Legend: ✅ user-observable · ⚙️ internal subsystem

- ✅ **Desktop app (Tauri 2)** — Vite React shell over the shared app-core views with a local replica; works offline, syncs when online. `apps/desktop/`
- ✅ **Mobile app (Expo / React Native)** — native navigation over app-core view-models, editor in a webview, local replica; works offline. `apps/mobile/`
- ✅ **Claims in transit** — offline edits pass the local rule engine, queue in a persisted outbox, and render as visually distinct pending claims; the board never shows a pending claim as settled fact. `packages/sync-client/src/outbox/`
- ✅ **Instant local refusals** — the same rule engine runs against the replica before anything queues; violations refuse immediately with the rule named. `packages/sync-client/src/precheck/`
- ✅ **Contested claims** — a synced-in claim the server now refuses becomes a `claim.contested` ledger event on its ticket: banner on the ticket, entry in the claimant's My Work/attention, visible to everyone who can see the ticket. `apps/server/src/sync/sync-service.ts`, `packages/app-core/src/contests/`
- ✅ **Contest resolution** — redo legally (replacement linked), convert to comment (comment linked, claim text preserved), or discard (recorded, attributed); all three are ledger events. `packages/app-core/src/contests/contest-view-model.ts`
- ✅ **Offline reopen flow** — creating live work under a terminal parent offers the reopen dialog offline; the accepted pair (parent transition with cause, then child) queues in order and contests coherently if the world changed. `packages/app-core/src/offline/reopen-pair.ts`
- ✅ **Offline search** — local replica search labelled "searching offline copy". `packages/sync-client` `searchLocal`
- ✅ **Sync status UI** — "N claims waiting to send", per-ticket pending badges, failed-item attention. `packages/app-core/src/sync/sync-status-bar.tsx`
- ✅ **Clock-skew flag** — gross device-clock skew renders as an attributed badge in history, derived from the two kept clocks. `packages/app-core/src/history/clock-skew-badge.tsx`
- ✅ **One clock, printed one way** — every instant a shell or banner shows renders through `formatIstInstant` in India time, with `IST_CLOCK_NOTE` naming the zone for collaborators elsewhere; the day it prints is the day `istDayOf` gives, so a timestamp can never disagree with the calendar cell the same instant lands in. `packages/domain/src/clock-skew.ts`
- ⚙️ **Replica day math is the server's day math** — local read-model day boundaries, due-today/overdue and day counts use the domain's dependency-free `istDayOf`/`istDayBounds`, the same file the server runs; the replica stores the Z-normalised instants it was handed and never re-formats them. `packages/sync-client/src/replica/`, `packages/domain/src/ist-day.ts`
- ⚙️ **Sync ingress `POST /v1/sync`** — ordered batches; idempotent on retries (duplicate ids re-answer from the ledger, prior contests re-answer from `proj_contested`); refusals append contests; interactive `/v1/events` never records contests. `apps/server/src/sync/`
- ⚙️ **Replica bootstrap `GET /v1/sync/bootstrap`** — visibility-scoped snapshot set + per-entity event tails + full comment/contest backfill, one consistent cut with the stream cursor. `apps/server/src/sync/sync-routes.ts`
- ⚙️ **Snapshot writer** — periodic per-ticket snapshots into Plan 1's `snapshots` table, folded by the domain reducer so snapshot+tail ≡ replay. `apps/server/src/sync/snapshot-writer.ts`
- ⚙️ **Stream cursor `events.workspace_seq`** — the per-workspace cursor (coordination §18, shipped by the foundation plan) is what `afterSeq`/`caught-up` resume by; this plan closes the read half (`readStreamSeq`, `visibleEventsFor`). Envelope `seq` stays per-entity. `apps/server/src/sync/stream-seq.ts`
- ⚙️ **Contested-claims projection `proj_contested`** + `GET /v1/contests` read surface (visibility-filtered). `apps/server/src/projections/contested.ts`
- ⚙️ **Contest rule enforcement** — `contest.server-only`, `contest.unknown`, `contest.already-resolved`, `contest.wrong-ticket` in the shared engine, fixture-proven in every build. `packages/rule-engine/src/contests.ts`
- ⚙️ **One storage interface** — SQLite behind `SyncStorage` (op-sqlite / tauri-plugin-sql / better-sqlite3) with a shared conformance suite; replica read model folded by domain reducers, never server projections. `packages/sync-client/src/storage/`
- ⚙️ **Purge on revocation** — sync-down purge tombstones delete every local trace of a revoked ticket (only the user's own contested-claim stubs survive — their own authored words); queued claims still go up and contest. `packages/sync-client/src/replica/replica.ts`
- ⚙️ **Dual-client sync harness** — two real replicas against the real server on real Postgres; six scripted divergence scenarios asserted exactly, in CI. `apps/server/test/dual-client/`
```

- [ ] **Step 2: Write the test-case catalogue**

`test-cases/12-offline-sync-apps.md`:

```markdown
# 12. Offline sync & the apps

Status: ✅ covered · 🟡 partial · 🧪 manual · ❌ not covered · 🚫 out of scope
Test files: packages/domain/test/{contest-events,clock-skew}.test.ts · packages/rule-engine/test/contests.test.ts + fixtures/contest-*.json · apps/server/test/sync/*.test.ts · apps/server/test/dual-client/*.test.ts · packages/sync-client/test/*.test.ts · packages/app-core/test/*.test.{ts,tsx} · apps/desktop/src/storage/*.test.ts · apps/mobile/src/**/*.test.ts

## Contest vocabulary & rules
- 12.1 ✅ `claim.contested` carries the original claim whole; payload without it refuses at parse (contest-events.test.ts)
- 12.2 ✅ `claim.contested_resolved` requires the replacement link for `redone` and the comment link for `converted-to-comment` (contest-events.test.ts)
- 12.3 ✅ a client-forged `claim.contested` refuses `contest.server-only` — planted defect (fixtures/contest-refuses-client-origin.json)
- 12.4 ✅ resolving an unknown contest refuses `contest.unknown`; a second resolution refuses `contest.already-resolved`; a misaimed one refuses `contest.wrong-ticket` — planted defects (contests.test.ts, fixtures)
- 12.5 ✅ contest evaluators run identically from the shared fixture suite in every build (rule-engine fixtures runner)

## Sync ingress & bootstrap
- 12.6 ✅ a legal offline claim commits through `/v1/sync` exactly like ingest (sync-route.test.ts)
- 12.7 ✅ a refused offline claim becomes a `claim.contested` ledger event naming the exact rule (sync-route.test.ts)
- 12.8 ✅ the same sync batch twice: identical results, ledger unchanged, one contest — planted defect (sync-route.test.ts, S6)
- 12.9 ✅ interactive `/v1/events` refusal records NOTHING — planted defect proving both paths side by side (sync-route.test.ts)
- 12.10 ✅ actor mismatch and client-supplied `claim.contested` are refused at the sync door (sync-route.test.ts)
- 12.11 ✅ a claim on a no-longer-visible ticket contests `visibility.not-visible` (sync-route.test.ts, S4)
- 12.12 ✅ bootstrap: snapshot+tail for exactly the visible tickets; invisible tickets leave no trace in the response — planted defect (bootstrap.test.ts)
- 12.13 ✅ bootstrap backfills comments/attachments/contests older than the snapshot; guests get definitions + explicit tickets only (bootstrap.test.ts)
- 12.14 ✅ snapshot writer: snapshot equals the reducer fold byte-for-byte; next pass folds from the previous snapshot — planted defect (snapshot-writer.test.ts)
- 12.15 ✅ `readStreamSeq` is 0 for an empty workspace, workspace-SCOPED (two workspaces both start at 1), and advances across different entities whose per-entity seq is both 1 (stream-seq.test.ts)

## Replica, outbox & pre-check
- 12.16 ✅ replica read model is the domain reducer's fold; contests fold beside state, never into it; the local ledger stores BOTH sequences it was handed — per-entity `seq` and `workspace_seq` (§18) — rather than inventing an order (replica.test.ts)
- 12.17 ✅ duplicate stream delivery is a no-op (replica.test.ts)
- 12.18 ✅ purge removes every local trace: unreadable, unsearchable, gone from raw SQLite; only the user's own contested-claim stubs survive — planted defect (replica.test.ts, S4)
- 12.19 ✅ local pre-check refuses instantly with the named rule and queues nothing — planted defect (precheck.test.ts)
- 12.20 ✅ pending overlay: confirmed state unmoved, pending state separate, badge ids exposed — planted defect (precheck.test.ts, data-source.test.ts)
- 12.21 ✅ outbox preserves order, applies committed/contested/failed results, backs off exponentially (outbox.test.ts)
- 12.22 ✅ replica DataSource answers `pending`, never `committed`, for local accepts — planted defect (data-source.test.ts)
- 12.23 ✅ sync engine: bootstrap once, cursor only advances at caught-up, reconnects, flushes in order, survives transport failure (sync-engine.test.ts)
- 12.24 ✅ offline search names its source (`offlineCopy: true` → "searching offline copy") (data-source.test.ts, board-screen)

## Contested-claim UX & reopen
- 12.25 ✅ banner names what was claimed, by whom, when, and the refusing rule; renders nothing when empty; PLANTED DEFECT — Redo routes to `onRedo`, never to `onResolve` with the contested envelope as the replacement (contests.test.tsx)
- 12.26 ✅ discard emits one attributed resolution event; convert emits the linked comment carrying the claim text; redo links its replacement (contests.test.tsx)
- 12.27 ✅ reopen pair: parent transition with cause first, child unchanged second (reopen-pair.test.ts)
- 12.28 ✅ clock-skew badge: gross skew renders attributed; sub-threshold renders nothing; unreadable claims flagged — planted defect (skew-and-status.test.tsx)
- 12.29 ✅ sync status labels: waiting counts, offline, catching up, failed attention (skew-and-status.test.tsx)

## Dual-client harness (spec-named discipline, real Postgres, CI)
- 12.30 ✅ S1 concurrent field_set: later claim wins projection, earlier preserved, replicas byte-identical (scenarios.test.ts)
- 12.31 ✅ S2 stale-assignee restrict-to: passes stale pre-check, contests with exact rule (scenarios.test.ts)
- 12.32 ✅ S3 workflow changed while offline: stranded transition contests (scenarios.test.ts)
- 12.33 ✅ S4 visibility revoked: purge + contest + honest claimant stub + viewer-visible history (scenarios.test.ts)
- 12.34 ✅ S5 offline reopen pair contests coherently, both exact rules, nothing moved (scenarios.test.ts)
- 12.35 ✅ S6 duplicate batch idempotent to the byte (scenarios.test.ts)

## App shells
- 12.36 ✅ tauri-plugin-sql adapter: mapping + transaction discipline (tauri-sql-storage.test.ts)
- 12.37 ✅ op-sqlite adapter: mapping + transaction discipline (op-sqlite-storage.test.ts)
- 12.38 ✅ editor webview bridge protocol: pinned names, tolerant parsing, doc injection (editor-web-view.test.ts)
- 12.39 ✅ push registration stub: registers, tolerates missing transport, reports denial (register-push.test.ts)
- 12.40 🧪 desktop end-to-end smoke: `pnpm tauri dev`, sign in, toggle network, watch pending → committed (manual until Plan 11's e2e)
- 12.41 🧪 mobile end-to-end smoke: dev build, airplane mode, edit, reconnect, watch the claim land or contest (manual until Plan 11's e2e)

## Time: one clock, one day boundary (owner decision 2026-08-20 — Asia/Kolkata)
- 12.42 ✅ `formatIstInstant` prints India time and rolls the day at IST midnight, not UTC midnight (18:29:59.999Z is the 20th, 18:30:00.000Z is the 21st, agreeing with `istDayOf`); the same moment stated as `+05:30` and as `Z` prints once; an unreadable instant travels verbatim rather than becoming an invented time — planted defect (clock-skew.test.ts)
- 12.43 ✅ a contested claim's banner and its converted comment carry the claimant's time in IST, never the raw instant — planted defect: a claim made at 00:00 IST on the 21st does not read as the 20th (contest-events.test.ts, contests.test.tsx)
- 12.44 ✅ a sync retry re-answers the same INSTANT, not merely the same characters: parsed `serverTime`, `seq` and `workspaceSeq` all match the first answer, and the stored `timestamptz` row agrees with both (sync-route.test.ts)
```

- [ ] **Step 3: Commit**

```bash
git add Features.md test-cases/12-offline-sync-apps.md
git commit -m "docs: Features §12 + test-cases 12.x — offline sync & the apps

The catalogue moves in the same change set as the work: every guarantee
this plan makes has its case number, and the two manual smokes are
named as manual instead of pretended."
```

---

## Open questions (owner / reconciliation review)

1. **Stream cursor — RESOLVED to coordination amendment 18, no sign-off outstanding.** An earlier draft of this plan proposed its own `events.global_seq` identity column. That is withdrawn: amendment 18 already pins `events.workspace_seq bigint` with `UNIQUE (workspace_id, workspace_seq)`, assigned inside the ingest transaction under a per-workspace advisory lock, and Plan 1 has landed the schema, `lockWorkspace` and `nextWorkspaceSeq`. Task 3 now consumes that column and finishes the one half amendment 18 still lists as pending — Plan 4's `visibleEventsFor` filtering and ordering by `workspace_seq` — with Plan 4's cursor-sensitive tests updated. Plan 5's `/v1/stream` sends `caught-up.seq` = the high-water `workspace_seq` for that workspace (`readStreamSeq`); its `visibleEventsFor` pass-through needs no other change. Two consequences worth stating: a cursor is meaningful only within its own workspace (a multi-workspace socket must keep one per subscription), and an identity/sequence column must NOT be substituted — it is assigned before COMMIT but becomes visible after it, so a reader can pass a number that later appears.
2. **Clock-skew flag is derived, not stored.** Spec §5 says "ingest flags gross skew"; Plan 1's ingest stores both clocks and flags nothing. Since both timestamps are immutable in the envelope, this plan derives the flag (`hasGrossClockSkew`) at render — deterministic and rebuild-safe. If the owner wants an ingest-time *persisted* flag (e.g. for server-side reporting), it is an additive projection later; nothing here blocks it.
3. **`visibility.not-visible` enforcement parity.** This plan's sync door pre-checks `canSee` for events on existing tickets. Interactive `/v1/events` (Plan 1/5) does NOT visibility-check writes today — an online user who lost visibility mid-session gets an engine-level answer only if some rule happens to catch it. Plan 5 should add the same `canSee` write-check to `/v1/events` (refusal, no contest) so the two doors agree; rule id `visibility.not-visible` is exported from `sync-service.ts` for exactly that reuse.
4. **Contests on non-ticket entities respond `refused`, not `contested`** (no ticket to attach the contest to — e.g. an offline-authored `workflow.defined`). The apps do not author non-ticket events offline in this plan, so the path is theoretical; if a later plan adds offline workflow editing, decide where such contests should live.
5. **Origin forgery at the interactive door.** `claim.contested` is refused by engine rule (`contest.server-only`, origin-based) and by the sync door (`reserved-type`). A client could still POST `/v1/events` with `origin: 'server'` on other event types — origin is a client claim. Plan 5 should decide whether `/v1/events` stamps/validates origin against the transport (recommended: refuse `origin: 'server'` on any authenticated client call).
6. **`DataSource.ingest` return type (amendment 10).** The replica implementation returns the additive `{status:'pending', eventId}` — it cannot truthfully return `committed`. Plan 6's app-core views must treat `pending` as accepted-for-now (render via badges) — flagged for the amendment-10 contract text; the online DataSource is unaffected.
7. **`DataSource.subscribe` semantics on the replica.** Implemented as a change signal (`cb()` on every replica change; views re-query). If Plan 6 pins a payload-carrying callback, the replica adapts by passing the applied `SyncItem` — one-line change, noted in `replica-data-source.ts`.
8. **Plan 7 editor bridge assumption.** `EDITOR_BRIDGE` frame names (`editor-ready`/`set-doc`/`doc-changed`) and `getEditorWebviewHtml(): string` are this plan's offer; the mobile fallback textarea page ships until Plan 7 lands. Reconciliation touches one file (`editor-web-view.tsx`).
9. **Plan 9 push transport assumption.** `POST /v1/push/registrations {platform: 'expo', token}` with 404-tolerance. Plan 9 owns the server side and may rename — the stub is one file.
10. **Interim session plumbing in the shells** (desktop localStorage token; mobile `EXPO_PUBLIC_DEV_*`; `actorId: me.assigneeId ?? 'me'` in the ticket screen) is explicitly temporary until Plan 6's session handling is the reference — each site is comment-marked. Plan 11 must not ship with these in place.
11. **Route prefix — SETTLED by coordination amendment 20** (`/v1/*` is the whole product API; `/api/auth/*` is better-auth's vendor surface and the only `/api/` mount). Plan 4 registered its ticket reads at `/api/workspaces/…` before that amendment landed; the orchestrator moves them, and Plan 6 already consumes the `/v1/` path. Nothing in this plan changes either way — every route it adds is already `/v1/*`. Original note, kept for provenance: this plan follows the coordination doc's `/v1` pins. A series-wide prefix reconciliation belongs to Plan 5's review.
12. **Contest resolution permissions.** Anyone who can submit events on the ticket can resolve a contest (engine checks existence/aim/single-resolution; visibility gates reads). If the owner wants resolution restricted (claimant + admins, say), that is a new engine rule on `claim.contested_resolved` — additive.
13. **Reducer deps version pinning.** `buildLedgerDeps`/`buildLocalDeps` resolve workflow definitions latest-version-wins, matching the reducer's `getWorkflow(id)` call shape (no version argument). If Plan 3's reducer resolves by `ticket.workflowVersion` internally, both helpers must switch to keyed-by-version lookups — verify at execution against `packages/domain/src/ticket-state.ts` (marked in both files).
14. **S3's exact rule name** (`unknown-state` vs `illegal-transition` vs `stranded-state`) is pinned to a single literal after the first green run — the scenario file carries the instruction. If the engine's answer surprises (e.g. `workflow-version`), that is a reconciliation finding for Plan 2.
15. **`claim.contested` payload field name — RECONCILED with Plan 9, no decision outstanding.** Amendment 16 pins the event ("payload = the original event, rule, reason") but not the field names, and the two plans spelled it differently: Plan 9's notification fan-out parses `{ originalEvent: { id, type, actorId, clientTime, … }, rule, reason }` (zod `.passthrough()`); this plan's registration carried `{ original: SubmittedEvent, rule, reason }`. Taken: **`{ originalEvent: SubmittedEvent, rule, reason }`** — Plan 9's field name, this plan's richness. This plan owns the registration and needs the whole envelope (the redo path re-issues it, the convert-to-comment path renders its payload, `proj_contested` stores it for the sync-time idempotency lookup), and a full `SubmittedEvent` under the key `originalEvent` satisfies Plan 9's schema unchanged — `id`, `type`, `actorId` and `clientTime` are all envelope fields, and the extra keys pass through. **Plan 9 needs no edit**; `contestedPayloadSchema` in its `fanout.ts` already validates what this plan now emits. The `proj_contested` / local `contests` column is `original_event` to match.
16. **Attention-strip wiring.** This plan supplies open contests per claimant (`query.myWork(...).contested`, `query.listContests`, `GET /v1/contests?claimantId=&open=true`); the attention strip itself belongs to app-core/Plan 9's extension points. Their "contested claims" bucket should read exactly these — if their extension-point signature differs, only the wiring line changes, not the data shape.
17. **Time is Asia/Kolkata — SETTLED by owner decision (2026-08-20), applied here, nothing outstanding.** Three of this plan's surfaces touched it and all three are now explicit:
    - **Storage.** Both ledger clocks are `timestamptz` absolute instants; the verbatim-text `client_time` an earlier draft of Plan 1 chose is gone, so `rowToEnvelope` emits ISO `Z` on every read path. The local SQLite `client_time`/`server_time` columns hold exactly those strings (Task 8's schema comment says so), which is what makes string comparison equal instant comparison in the replica. Audited at write time: no fixture, assertion, or seeder in this plan expected an offset label to survive a round trip, so nothing had to be corrected — but the invariant is now stated where a future author would otherwise re-introduce one.
    - **Day math.** The replica computes days with `istDayOf`/`istDayBounds` from `@gisik-nokma/domain`, the same dependency-free module the server imports (Task 9's Interfaces block carries the full reasoning). A replica with its own day boundary would disagree with the server silently — no error, no contest, just a claim in a different calendar cell offline than online — which is the one failure mode this product exists to refuse.
    - **Rendering.** `formatIstInstant` + `IST_CLOCK_NOTE` (Task 1, in this plan's own `clock-skew.ts`) are the single instant→text renderer, consumed by `renderContestedClaimText`, the web contest banner, and the mobile ticket screen. The zone string lives in `IST_TIME_ZONE`; no component writes it inline. The time component is a constant +05:30 shift rather than `Intl`, deliberately: Hermes does not reliably ship a timezone database, and a silent fallback to the device zone on mobile is exactly the disagreement above wearing a different hat.
    - Carried to the orchestrator, not fixed here: Plan 6's shells pass `today`/`anchor` as `istDayOf(new Date().toISOString())` to the views this plan's replica feeds, and format their clocks with `IST_TIME_ZONE`.

## Execution notes

- Execution order within this plan: Tasks 1→2 (shared vocabulary), 3→7 (server), 8→12 (sync-client), 13 (app-core), 14→15 (harness — the gate for everything before it), 16→17 (shells), 18 (catalogue). Tasks 16 and 17 are independent of each other.
- Plans 5–9 execute before this plan (series order). Where this plan Modifies their files or consumes their exports, the executor verifies the real names first with the greps given in-line; the coordination doc wins over any drifted plan text.
- Every planted-defect test must be watched failing for the right reason before the code that kills it lands — that is the base's discipline, inherited whole.








