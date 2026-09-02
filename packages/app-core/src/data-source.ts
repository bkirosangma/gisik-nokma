import type { IngestResult, LedgerEvent, SubmittedEvent, WorkflowDef } from '@gisik-nokma/domain';
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
 */
export type DataSourceQuery = {
  getMyWorkspaces(): Promise<WorkspaceRef[]>;
  getMembers(workspaceId: string): Promise<Actor[]>;
  getBoard(projectId: string): Promise<BoardView>;
  getTickets(projectId: string, filter: FilterSpec, grouping: Grouping): Promise<TicketListView>;
  getTicket(workspaceId: string, ticketId: string): Promise<TicketRead | null>;
  getTicketHistory(ticketId: string, afterSeq?: number, limit?: number): Promise<TicketHistoryEvent[]>;
  getWorkflowDef(workspaceId: string, workflowId: string, version?: number): Promise<WorkflowDef | null>;
  search(workspaceId: string, text: string, filter?: FilterSpec): Promise<SearchHit[]>;
  getMyWork(): Promise<MyWorkView>;
  getAttention(workspaceId: string): Promise<AttentionItem[]>;
  getPreferences(): Promise<UserPreferences>;
  putPreferences(preferences: UserPreferences): Promise<void>;
};

/** Coordination amendment 10 — the one seam between views and the world. */
export type DataSource = {
  ingest(events: SubmittedEvent[]): Promise<IngestResult[]>;
  query: DataSourceQuery;
  subscribe(workspaceId: string, afterSeq: number, cb: (item: StreamItem) => void): Unsubscribe;
};
