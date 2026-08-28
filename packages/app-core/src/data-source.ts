import type { EventEnvelope, IngestResult, SubmittedEvent, WorkflowDef } from '@gisik-nokma/domain';
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
 */
export type StreamItem =
  | { type: 'event'; envelope: EventEnvelope }
  | { type: 'purge'; workspaceId: string; entityId: string }
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
