import type { FieldClaim, StateCategory, TicketState } from '@gisik-nokma/domain';

export type Actor = { id: string; name: string };
export type ProjectRef = { id: string; name: string };
export type WorkspaceRef = { id: string; name: string; projects: ProjectRef[] };

/**
 * Who claimed it and when — both clocks, always (spec §3: both are true in
 * different senses, and conflating them is a small lie). `actorName` is a
 * display convenience; a null name NEVER means anonymous — rendering falls
 * back to the raw actorId (see provenance.ts).
 */
export type ClaimProvenance = {
  actorId: string;
  actorName: string | null;
  clientTime: string;
  serverTime: string;
};

/** Owner decision: a reopen carries its cause; boards render it, never an anonymous flip. */
export type TransitionCause = { kind: 'reopened-for-child'; childTicketId: string };

/**
 * Derived child progress as shown to a viewer (prompt-pinned spelling).
 * Counts are over ALL direct children — visibility never shrinks them; the
 * children the viewer cannot see are NAMED in restrictedCount (spec §6).
 */
export type RollupToViewer = {
  totalChildren: number;
  terminalChildren: number;
  restrictedCount: number;
};

export type BoardCard = {
  ticketId: string;
  title: string;
  typeId: string;
  assignee: Actor | null;
  stateProvenance: ClaimProvenance;
  cause: TransitionCause | null;
  rollup: RollupToViewer | null;
  /** True only between submit and the server's answer (web is online-only). */
  pending: boolean;
};

/** Columns are exactly the attached workflow's states, never invented (spec §7). */
export type BoardColumn = {
  stateId: string;
  name: string;
  category: StateCategory;
  blocked: boolean;
  cards: BoardCard[];
};

/**
 * A project may hold ticket types on different workflows; merging their
 * states into one column set would invent columns no definition declares.
 * Boards therefore group by workflow.
 */
export type BoardGroup = {
  workflowId: string;
  workflowVersion: number;
  workflowName: string;
  columns: BoardColumn[];
};

export type BoardView = { projectId: string; groups: BoardGroup[] };

/** Composable filters (spec §7 Search): every axis optional, all AND-combined. */
export type FilterSpec = {
  text?: string;
  assigneeIds?: string[];
  collaboratorIds?: string[];
  typeIds?: string[];
  stateIds?: string[];
  stateCategories?: StateCategory[];
  projectIds?: string[];
  dueBefore?: string; // claimed dates only, YYYY-MM-DD — nothing estimated
  dueAfter?: string;
  fields?: Record<string, string>;
};

export type Grouping = 'epic' | 'status' | 'assignee' | 'type' | 'flat';

export type ListColumnId = 'status' | 'assignee' | 'dueDate' | 'type' | 'progress' | `field:${string}`;

export type ListRow = {
  ticketId: string;
  title: string;
  typeId: string;
  typeRank: number;
  parentId: string | null;
  /** Nearest rank-1 ancestor, for grouping by epic; null when none. */
  epicId: string | null;
  stateId: string;
  stateName: string;
  stateCategory: StateCategory;
  stateProvenance: ClaimProvenance;
  assignee: Actor | null;
  assignedProvenance: ClaimProvenance | null;
  dueDate: { date: string; claim: ClaimProvenance } | null;
  fields: Record<string, FieldClaim>;
  rollup: RollupToViewer | null;
  hasRestrictedParent: boolean;
};

export type TicketListView = { projectId: string; rows: ListRow[] };

/** Plan 4's read shape: a restricted parent is existence-without-title, structurally. */
export type ParentRef =
  | { kind: 'ticket'; id: string; title: string }
  | { kind: 'restricted'; id: string }
  | null;

export type TicketRead = {
  ticket: TicketState;
  title: string;
  stateProvenance: ClaimProvenance;
  parent: ParentRef;
  rollup: RollupToViewer | null;
};

/** Plan 3's history event: the ledger filtered, both clocks, no summarising. */
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

export type WorkItem = {
  ticketId: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  title: string;
  stateId: string;
  stateName: string;
  stateCategory: StateCategory;
  stateProvenance: ClaimProvenance;
  dueDate: { date: string; claim: ClaimProvenance } | null;
};

export type ContestedClaim = {
  ticketId: string;
  title: string;
  rule: string;
  reason: string;
  claim: ClaimProvenance;
};

export type MyWorkView = {
  assigned: WorkItem[];
  inTransit: WorkItem[];
  contested: ContestedClaim[];
};

export type AttentionKind = 'blocked' | 'stale' | 'due-soon' | 'contested';

/** Computed, never authored (spec §7). `claim` is the underlying claim's provenance when one exists. */
export type AttentionItem = {
  kind: AttentionKind;
  ticketId: string;
  projectId: string;
  title: string;
  reason: string;
  claim: ClaimProvenance | null;
};

export type SearchHit = {
  ticketId: string;
  projectId: string;
  title: string;
  snippet: string;
  matchedIn: 'title' | 'description' | 'comment';
};

export type SavedFilter = { id: string; name: string; filter: FilterSpec };

export type ProjectViewPrefs = { columns: ListColumnId[]; grouping: Grouping };

/**
 * Server-owned per-user rows, NOT ledger events (amendment 14). View
 * preferences arrange truth; they never change it — proven in Task 10.
 */
export type UserPreferences = {
  version: 1;
  projects: Record<string, ProjectViewPrefs>;
  savedFilters: SavedFilter[];
};

export const DEFAULT_VIEW_PREFS: ProjectViewPrefs = {
  columns: ['status', 'assignee', 'dueDate', 'progress'],
  grouping: 'epic',
};
