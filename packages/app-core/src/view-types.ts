import type { FieldClaim, StateCategory, TicketState } from '@gisik-nokma/domain';

export type Actor = { id: string; name: string };
/**
 * `archived` and the two counts arrived with Task 16 (owner brief 2026-09-09).
 *
 * **`null` is WITHHELD, and it is not `0`.** The server omits the count keys
 * entirely when the caller is a guest in that workspace; the mapper turns that
 * absence into `null`, and the card renders "Restricted". A `0` that reached
 * here is a number somebody counted — "no work you can see in this project" —
 * and a renderer that treated the two the same would print a fact nobody
 * established. `archived` is never withheld: it is a property of a project whose
 * NAME the caller is already being told (`read/visible-projects.ts`).
 */
export type ProjectRef = {
  id: string;
  name: string;
  archived: boolean;
  /** null = withheld (guest); a number is a count of what THIS caller may see. */
  ticketCount: number | null;
  /** null = withheld (guest). Counted by the same rule `FilterSpec.blocked` uses. */
  blockedCount: number | null;
};
/**
 * `role` (Task 15, the audit's one owner-approved invented row — the SAFE
 * form: real backing data, only the display was missing). The server has
 * disclosed it on `GET /v1/me/workspaces` since the route first answered
 * (`role: row.role` in `apps/server/src/routes/workspaces.ts`); `mapWorkspaceRefs`
 * never read it.
 *
 * **The "seven other invented rows stay unbuilt" sentence that stood here is
 * superseded (owner brief 2026-09-09).** The owner's `/workspaces` reference
 * turned three of them into real features with real data behind them: the
 * member count and the ticket/blocked chips are `memberCount` and the two
 * per-project counts below (Task 16), and the invitation banner is Task 17's
 * caller-scoped invitations read. Avatars are derived from data already served
 * (a monogram and a deterministic colour from the workspace id, Task 18) rather
 * than invented. Help/Account nav is Task 18 and carries no data at all. What
 * has NOT changed is the rule the old sentence was protecting: a field arrives
 * here only once a server read computes it, and a number nobody counted is
 * withheld rather than painted — which is what the `| null` below means.
 *
 * **Help/Account nav landed in Task 18** and still carries no data: `/help` was
 * already a route, and `/account` ships as a minimal stub in the same change
 * set so the new link is not dead. The one field Task 18 DID add is
 * `nameRestrictedProjectCount` below, and it is a computed server read like
 * every other — the owner ruled it before it was built.
 */
export type WorkspaceRef = {
  id: string;
  name: string;
  role: string;
  /**
   * null = withheld (guest). When served it counts exactly the people
   * `GET /v1/workspaces/:id/members` would list for this caller — guests
   * included for an admin, excluded for anyone else — because a count and a
   * directory are one disclosure (`read/membership-roster.ts`).
   */
  memberCount: number | null;
  /**
   * How many projects this caller already holds the ID of and may not be told
   * the NAME of — the card's *"N project · name restricted"* (Task 18, owner
   * ruling 2026-09-09, "option 2").
   *
   * **A plain `number`, never `| null`, and served to a GUEST too.** It is the
   * one number on this route nobody is withheld from, because it is not a
   * disclosure of the same kind as the two beside it: those are VOLUME, this is
   * a count of ids the caller carries on their own ticket cards
   * (`read/ticket-cards.ts` puts `projectId` there), so it reveals a NAME
   * restriction rather than an existence — the P32 distinction
   * `read/visible-projects.ts` draws. An owner's is `0` by construction. What
   * it is NOT is a count of every project in the workspace; that was option 3
   * and the owner refused it. See `read/workspace-counts.ts`.
   */
  nameRestrictedProjectCount: number;
  projects: ProjectRef[];
};

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

/**
 * The six id-shaped axes of a filter — every one a list, and an absent or
 * empty list narrows nothing. Declared ONCE and used twice (exclude-mode
 * spec §1, 2026-09-17): spread into `FilterSpec` as its include half, and as
 * the type of its `exclude` half — so the two halves cannot drift into two
 * vocabularies, the fork `matches-filter.ts`'s docblock forbids.
 */
export type IdAxes = {
  assigneeIds?: string[];
  collaboratorIds?: string[];
  typeIds?: string[];
  stateIds?: string[];
  stateCategories?: StateCategory[];
  projectIds?: string[];
};

/** Composable filters (spec §7 Search): every axis optional, all AND-combined. */
export type FilterSpec = IdAxes & {
  text?: string;
  dueBefore?: string; // claimed dates only, YYYY-MM-DD — nothing estimated
  dueAfter?: string;
  fields?: Record<string, string>;
  /**
   * `true` closed only, `false` not closed, absent all (backlog/closed spec
   * §4, 2026-09-17) — NOT an id axis: a single boolean has no include/exclude
   * halves, unlike everything in `IdAxes`, so it carries no matching key under
   * `exclude` below.
   */
  closed?: boolean;
  /**
   * The exclude half (exclude-mode spec §1): a ticket matching ANY listed
   * value on an axis is dropped. Evaluated after the include half — a ticket
   * must match one of the includes (when any are set) AND none of the
   * excludes. The Filters sheet's cycler never leaves one id in both halves;
   * the predicates do not need to care. `text`, the due bounds and `fields`
   * have no exclude form. CLIENT-SIDE ONLY: the wire's `filterSpecSchema`
   * has no negation term, and `toServerFilterSpec` refuses a non-empty
   * exclude rather than silently dropping it (`online/mappers.ts`).
   */
  exclude?: IdAxes;
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
  /**
   * True only between submit and the server's answer — the SAME field, with the
   * same meaning, that `BoardCard` has carried since Plan 6.
   *
   * It was on the board and not on the list, and the asymmetry was silent: the
   * board could badge a claim in transit and the list could not, while Plan
   * 10's replica source pins its honesty contract as "how every board/list badge
   * renders". An offline list is the surface where a queued claim is most
   * common, so the half that was missing is the half that needed it most.
   * Ruling P30 permits this one widening for that reason — it mirrors a shipped
   * field rather than inventing one, and the ONLINE mapper's answer was already
   * written and already correct: `online/mappers.ts` refuses `getTickets`
   * outright, and an online-only shell has no outbox, so nothing is ever in
   * transit for it.
   */
  pending: boolean;
  /**
   * REQUIRED here — the row is assembled by one mapper — while the domain
   * `TicketState.closed?` keeps it optional, because 441 fixtures predate the
   * flag and have no legacy literal to spare (backlog/closed spec §1.2,
   * 2026-09-17). Every producer of a row is this task's own code (the online
   * mapper, the replica), so there is no such debt here; a reader spells
   * `state.closed ?? null` at the boundary rather than inheriting the
   * optionality onto this type. `null` means never closed, or reopened.
   */
  closed: { actorId: string; at: string } | null;
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
  /**
   * `null` when this viewer may not be told the project's NAME (rulings
   * P32/P38) — they still have `projectId`, so the item renders id-only rather
   * than blank. Nullable rather than absent, because "no name for you" is a
   * fact the renderer must be able to act on; an optional key would let a
   * mapper that simply forgot the field look the same as the rule applying.
   */
  projectName: string | null;
  title: string;
  stateId: string;
  stateName: string;
  stateCategory: StateCategory;
  stateProvenance: ClaimProvenance;
  dueDate: { date: string; claim: ClaimProvenance } | null;
};

/**
 * What a refused claim honestly has (ruling P39).
 *
 * **This is deliberately NOT a `ClaimProvenance`, and the difference is the one
 * fact a contest is about.** `ClaimProvenance` requires both clocks because a
 * committed claim HAS both: the device said when it made the claim, and the
 * server stamped when it accepted it. A contested claim was refused at the door,
 * so it was never committed and never stamped — `SubmittedEvent` is
 * `Omit<EventEnvelope, 'serverTime' | 'seq'>` by construction — and **no row in
 * this system records a server instant for the claim itself.**
 *
 * So there is no `serverTime` member at all. The two alternatives were both
 * refused in writing:
 *
 * - **Copying `contestedAt` into it** would attribute one event's instant to
 *   another — the CONTEST event's stamp presented as the claim's. That is the
 *   same move refused on the snapshot's state provenance (ruling P36's option
 *   3), and it is the one that would pass a gate.
 * - **A bare `serverTime?` on `ClaimProvenance`** would make every consumer of a
 *   REAL claim's provenance handle an absence that can never occur there, and
 *   the type would stop saying which shapes have a server instant and which
 *   cannot have one.
 *
 * `contestedAt` is carried under its own name — the server's instant for the
 * CONTEST, which is a real recorded fact about a real event — so a renderer can
 * say when the refusal was filed without any reader mistaking it for when the
 * claim was made. *If a consumer needs a server instant for a contested claim,
 * that consumer is wrong about what a contested claim is.*
 *
 * No `actorName`: unlike `ClaimProvenance`, nothing here is resolved through the
 * member roster. `renderContestedClaimText` already renders this shape's facts
 * from the raw `actorId`, which is the fallback `ClaimProvenance` documents for
 * a null name anyway.
 */
export type ContestedClaimProvenance = {
  actorId: string;
  /** The claimant's DEVICE instant, recorded on the refused envelope. */
  clientTime: string;
  /** The SERVER's instant for the `claim.contested` event — when the refusal was filed. */
  contestedAt: string;
};

export type ContestedClaim = {
  ticketId: string;
  /**
   * `null` when this viewer may no longer see the contested TICKET (ruling P40,
   * constraint b) — they still have `ticketId`, so the row renders id-only
   * rather than vanishing.
   *
   * A contest outlives the visibility of its ticket. The claim is this viewer's
   * own, so the refusal is always theirs to see; whether they may still read the
   * ticket is a separate question, answered by `canSee` at read time, and it can
   * have changed since the claim was refused. Losing the row would lose the
   * record of their own claim; inventing a title would be the disclosure.
   *
   * Nullable rather than absent, the same register as `WorkItem.projectName`:
   * "no title for you" is a fact the renderer must act on, and an optional key
   * would let a mapper that simply forgot the field look identical to the rule
   * applying.
   */
  title: string | null;
  rule: string;
  reason: string;
  claim: ContestedClaimProvenance;
};

export type MyWorkView = {
  assigned: WorkItem[];
  inTransit: WorkItem[];
  contested: ContestedClaim[];
  /**
   * Handed to this viewer BY NAME — the ticket's resolved audience lists them
   * (case 13.176). A fourth section rather than more rows in `assigned`, because
   * *you are doing this* and *you were handed this* are different claims and a
   * ticket can carry the second without the first.
   *
   * **A ticket in both is in both**, deliberately: de-duplicating would drop the
   * only claim a non-assignee can ever have. `MyWork` labels the sections so the
   * repeat reads as two facts about one errand rather than as a doubled row.
   *
   * Unlike `inTransit`, this is READ OFF THE WIRE (`MyWorkResponse.shared`) —
   * who may see a ticket is a server fact, and the replica has no visibility
   * table at all, which is why `getMyWork` refuses there outright rather than
   * serving a narrowed version of this.
   */
  shared: WorkItem[];
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
