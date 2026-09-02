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

/**
 * Whether what is on screen is the user's own choice or this client's stock
 * value. One vocabulary for the whole surface: `TicketList` re-exports this
 * name rather than declaring a second spelling of it.
 */
export type PrefsOrigin = 'stored' | 'default';

/**
 * One half of an arrangement, carrying WHO chose it — and the `default` arm
 * carries NO VALUE, on purpose.
 *
 * Ruling P24 (coordination doc): server → client is not total. The client pairs
 * `{columns, grouping}` under one project key and the server keeps two parallel
 * records, so a project present in `listColumns` and absent from `grouping` has
 * no faithful representation as a plain pair — and *"reaching for
 * `DEFAULT_VIEW_PREFS` there invents a preference the user never set … a project
 * missing from `grouping` surfaces as **not set**, never as a default wearing a
 * user's authority."*
 *
 * A `{ value, origin }` record would express that and still let a consumer read
 * `.value` while ignoring `.origin` — the ruling would hold by convention, which
 * is the same standing the substitution had before it was caught. Here the
 * `default` arm has no `value` member at all, so reading a value without first
 * narrowing on `origin` is a COMPILE ERROR, and the only way to put a stock
 * value on screen is to reach for `DEFAULT_LIST_COLUMNS` / `DEFAULT_GROUPING`
 * by name, with the origin in hand to say so.
 */
export type Chosen<T> = { origin: 'stored'; value: T } | { origin: 'default' };

export type ProjectViewPrefs = { columns: Chosen<ListColumnId[]>; grouping: Chosen<Grouping> };

/**
 * Server-owned per-user rows, NOT ledger events (amendment 14). View
 * preferences arrange truth; they never change it — proven in Task 10.
 */
export type UserPreferences = {
  version: 1;
  projects: Record<string, ProjectViewPrefs>;
  savedFilters: SavedFilter[];
};

/**
 * The stock arrangement's VALUES — what a view renders when the user has chosen
 * nothing. Split out from `DEFAULT_VIEW_PREFS` because the two are different
 * facts and fusing them is what let a default wear a user's authority: these
 * constants are a client's stock answer, `DEFAULT_VIEW_PREFS` is the statement
 * that NOTHING IS SET. A consumer that wants the former must name it.
 */
export const DEFAULT_LIST_COLUMNS: ListColumnId[] = ['status', 'assignee', 'dueDate', 'progress'];
export const DEFAULT_GROUPING: Grouping = 'epic';

/** Neither half chosen — the arrangement of a project nobody has arranged. */
export const DEFAULT_VIEW_PREFS: ProjectViewPrefs = {
  columns: { origin: 'default' },
  grouping: { origin: 'default' },
};

/**
 * The PROJECT-level origin, derived from the halves and stored nowhere.
 *
 * `'default'` means the user has arranged NEITHER half — which, coming out of
 * `mapPreferences`, is exactly the project that appears in neither of the
 * server's two records, i.e. the project absent from the document. Kept as one
 * exported function because both `useTicketList` and `TicketList` need the rule
 * and a second copy of it is how the two would come to disagree.
 */
export function prefsOriginOf(prefs: ProjectViewPrefs): PrefsOrigin {
  return prefs.columns.origin === 'stored' || prefs.grouping.origin === 'stored'
    ? 'stored'
    : 'default';
}
