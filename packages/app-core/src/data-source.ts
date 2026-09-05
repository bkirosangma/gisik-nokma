import type {
  IngestResult,
  LedgerEvent,
  SubmittedEvent,
  TicketTypeDef,
  WorkflowDef,
} from '@gisik-nokma/domain';
import type {
  Actor,
  AttentionItem,
  BoardView,
  FilterSpec,
  Grouping,
  MyWorkView,
  SearchHit,
  TicketHistoryEvent,
  TicketListView,
  TicketRead,
  UserPreferences,
  WorkspaceRef,
} from './view-types.js';

/**
 * One streamed frame, mirroring coordination amendments 13 + 19's server frames.
 * `workspaceId` on purge/caught-up/error is amendment 19: a socket may carry more
 * than one subscription, and a cursor from one workspace is meaningless in another.
 *
 * ## Two members were WIDENED here (Plan 6 Task 8), and neither is a contract change
 *
 * This union was written before any server emitted a frame, and both widenings are
 * the client catching up to a server that shipped first — `ServerStreamFrame`
 * (`packages/domain/src/stream-frames.ts`) has declared both since Plan 5, and the
 * hub emits both today.
 *
 * 1. **`scope-revoked` was missing.** A revocation therefore arrived as an
 *    unrecognised `type` and was silently DROPPED, leaving stale authorization in
 *    any cache fed by the stream. `projectId?: never` is copied deliberately from
 *    the server declaration rather than softened to an optional `string`: both of
 *    `visibleEventsFor`'s emitters yield `{kind:'scope-revoked', workspaceId}` and
 *    the hub REFUSES an instruction carrying a project scope, so a client field
 *    that could be filled in would be a field describing a frame nobody sends.
 * 2. **The event frame carried `EventEnvelope`, which has no `workspaceSeq`.**
 *    `afterSeq` — the value `subscribe` sends and `caught-up` reports — is the
 *    workspace stream position, and `EventEnvelope.seq` is the PER-ENTITY counter
 *    that restarts at 1 for every entity. A client holding only an `EventEnvelope`
 *    cannot name the cursor it must send back. `LedgerEvent` is `EventEnvelope`
 *    plus exactly that field, so this is a widening and not a move:
 *    `EventEnvelope` itself is untouched, because it is the coordination-pinned
 *    wire type the server, the domain and Plan 10 all share.
 *
 * Widening rather than narrowing is what makes both safe. `StreamItem` has two
 * implementers — the online source (`src/online/stream.ts`) and Plan 10's replica —
 * and the coordination doc records `replica.revokeScope` as already **Done**, i.e.
 * Plan 10 already consumes `ScopeRevokedInstruction`. Adding the member ALIGNS the
 * two implementers; leaving it out stranded the one that had already shipped.
 *
 * ONE divergence from `ServerStreamFrame` deliberately remains, named so the next
 * reader does not have to rediscover it: `code` is a bare `string` rather than
 * `StreamErrorCode`, so a misspelled code is a runtime surprise instead of a
 * compile error. Separately — a judgement about the end state rather than a
 * divergence — `stream-frames.ts`'s own docblock argues `StreamItem` should be
 * REPLACED by `ServerStreamFrame` rather than re-synchronised with it, owner
 * Plan 10. This task performs the two measured widenings only.
 */
export type StreamItem =
  | { type: 'event'; envelope: LedgerEvent }
  | { type: 'purge'; workspaceId: string; entityId: string }
  | { type: 'scope-revoked'; workspaceId: string; projectId?: never }
  | { type: 'caught-up'; workspaceId: string; seq: number }
  | { type: 'error'; workspaceId: string | null; code: string; message: string };

export type Unsubscribe = () => void;

/**
 * Typed read functions mirroring the server read surface (Plan 5 + earlier).
 * Implemented twice: online (this plan — HTTP) and replica (Plan 10 — local
 * store + outbox). Views call these and never speak HTTP (amendment 10).
 *
 * ## THREE signatures grew a `workspaceId` (Plan 6 Task 7, ruling P25 clause 2)
 *
 * `getMyWork`, `getPreferences` and `putPreferences` took no argument at all
 * when this file was written, and no server existed to contradict them. Three
 * shipped routes now do: `GET /v1/me/work`, `GET /v1/me/preferences` and
 * `PUT /v1/me/preferences` each read `?workspaceId=` BEFORE the door and answer
 * **400 `invalid_query`** without one — so the request the old signatures could
 * build was refused whole, before membership was even resolved. That is a fact
 * about the method signature rather than about the view model, which is why it
 * could not be adapted inside `online/mappers.ts` the way a renamed field can.
 *
 * It extends ruling **P24** — already taken, that the shipped `.strict()`
 * preferences document wins over Plan 6's — from the document's shape to the
 * method's signature: the same argument one layer out.
 * `apps/server/test/integration/client-contract.test.ts` pins both halves, the
 * client's declared parameters read out of THIS file's source and the routes'
 * 400/200 pair measured through the real door.
 *
 * `getAttention` and `getMembers` already carried one and are untouched.
 *
 * ## A THIRTEENTH method: `getTicketTypes` (Plan 6 Task 14 fix round)
 *
 * The web shell's New-ticket dialog HARDCODED `epic`/`story`/`task`/`sub-task`
 * and presented them as the workspace's own types. A workspace whose types
 * differ — `readTicketTypes` orders by rank then id and the server's own fixture
 * answers `epic`, `chore`, `task` — got a picker offering four it does not have,
 * and `ticketTypeExists` (`apps/server/src/routes/builder-reads.ts:363`) then
 * refused the create. The failure surfaced as a rejected WRITE rather than as
 * "this build cannot read your ticket types", which is the wrong sentence about
 * the wrong thing.
 *
 * The server serves them — `GET /v1/workspaces/:workspaceId/ticket-types`,
 * registered at `builder-reads.ts:531`. What was missing was the SEAM: amendment
 * 10 says views never speak HTTP, so with no method here the shell could not
 * reach a route that had shipped. Plan 6's own Open question 7 settles the
 * intent — "the `typeOptions` prop is fed from it; the built-in ladder remains
 * only the LOADING FALLBACK" — and this is that method.
 *
 * It returns the DOMAIN's `TicketTypeDef`, not a client view model, exactly as
 * `getWorkflowDef` returns `WorkflowDef`: the wire body is
 * `TicketTypeListResponse` (`packages/domain/src/read-models.ts:301`), whose
 * `ticketTypes` are `TicketTypeDef` already. There is no rename to adapt and
 * therefore no view model to invent. It is NOT one of the refusals (six of them
 * until ruling P25 clause 1, four since): every
 * field the client needs is on the wire, pinned by case 7.38
 * (`apps/server/test/routes/builder-reads.test.ts:250`).
 */
export type DataSourceQuery = {
  getMyWorkspaces(): Promise<WorkspaceRef[]>;
  getMembers(workspaceId: string): Promise<Actor[]>;
  getBoard(projectId: string): Promise<BoardView>;
  getTickets(projectId: string, filter: FilterSpec, grouping: Grouping): Promise<TicketListView>;
  getTicket(workspaceId: string, ticketId: string): Promise<TicketRead | null>;
  getTicketHistory(ticketId: string, afterSeq?: number, limit?: number): Promise<TicketHistoryEvent[]>;
  getWorkflowDef(workspaceId: string, workflowId: string, version?: number): Promise<WorkflowDef | null>;
  getTicketTypes(workspaceId: string): Promise<TicketTypeDef[]>;
  search(workspaceId: string, text: string, filter?: FilterSpec): Promise<SearchHit[]>;
  getMyWork(workspaceId: string): Promise<MyWorkView>;
  getAttention(workspaceId: string): Promise<AttentionItem[]>;
  getPreferences(workspaceId: string): Promise<UserPreferences>;
  putPreferences(workspaceId: string, preferences: UserPreferences): Promise<void>;
};

/** Coordination amendment 10 — the one seam between views and the world. */
export type DataSource = {
  ingest(events: SubmittedEvent[]): Promise<IngestResult[]>;
  query: DataSourceQuery;
  subscribe(workspaceId: string, afterSeq: number, cb: (item: StreamItem) => void): Unsubscribe;
};
