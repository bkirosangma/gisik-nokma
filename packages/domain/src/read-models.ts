import type { FieldClaim, WorkspaceRole } from './entity-state.js';
import type { PublishedWorkflowDef, StateCategory } from './workflow.js';
import type { Grouping } from './filter-spec.js';
import type { Priority, TicketTypeDef } from './ticket-types.js';
import type { WorkspaceSettings } from './events/workspace-settings.js';
import type { NoteScope, NoteScopeMode } from './note-state.js';

/**
 * The read models every `/v1` read route serves and every client renders
 * (Plan 5 Task 7). These are VIEW MODELS, and the standard they are held to is
 * that **no field of one may collapse two different facts into one value.**
 *
 * ## The rule, stated once for the whole file
 *
 * For every field here, three situations must stay tellable apart:
 *
 * - **never claimed** — nobody ever said anything. `dueDate` on a fresh ticket.
 * - **claimed, then withdrawn** — somebody said something and then took it
 *   back. The ledger keeps the withdrawal AS A CLAIM, with its actor and both
 *   clocks (`ticket.field_set` with `value: null`; see the reducer's own note
 *   in `./ticket-state.ts`, which exists so "who emptied this, and when"
 *   survives). A view model that renders it as the same blank as
 *   "never claimed" throws away provenance the ledger deliberately kept.
 * - **withheld** — the fact exists and this viewer may not have it. Rollups are
 *   the one place this happens here, and it is NAMED rather than subtracted
 *   (`TicketRollup.restrictedCount`).
 *
 * Where a type below cannot tell two of those apart, it says so IN THE TYPE —
 * a discriminated union or an extra counted field — rather than in a comment.
 * `TicketDueDate` and `TicketRollup.uncategorizedChildren` are both that rule
 * applied, and both replace a `null`/`0` the plan text carried.
 */

/** Owner decision (coordination doc): a reopen names the child that caused it. */
export type TransitionCause = { kind: 'reopened-for-child'; childTicketId: string };

/**
 * Who claimed the current state, and when — by both clocks. The provenance
 * floor made queryable: every card carries this, so "Done" can always
 * unfold to "marked done by X on date".
 *
 * `cause: null` is NOT a collapse. Every state a ticket can be in was claimed
 * by exactly one event, so there is always an actor and always both clocks;
 * `cause` is a field that event either carried or did not, and "the transition
 * named no cause" is a complete statement about a claim that exists. That is
 * why this type has no `never-claimed` arm and `TicketDueDate` does.
 */
export type StateProvenance = {
  actorId: string;
  clientTime: string;
  serverTime: string;
  cause: TransitionCause | null;
};

/**
 * A parent's child counts as a viewer is honestly told them — spec §6's
 * "5 of 8 done · 2 restricted", field by field.
 *
 * `totalChildren` and `terminalChildren` are TRUE counts over **all** direct
 * children, including the ones this viewer may not see. That is a deliberate,
 * spec-level disclosure (`docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md`
 * line 116: "Derived parent progress is computed server-side over *all*
 * children … true counts, restriction named, nothing pretended absent"), and
 * `terminalChildren` discloses strictly MORE than `totalChildren` does — the
 * first leaks the existence of children the viewer cannot reach, the second
 * leaks something about their state. That is the "5 of 8 **done**" half and it
 * is sanctioned by the same line; it is written out here rather than left to
 * ride on `totalChildren`'s precedent.
 *
 * `restrictedCount` is the per-VIEWER half and the thing that keeps the
 * disclosure honest: it names how much of the total the viewer cannot reach
 * instead of quietly subtracting it out.
 *
 * `uncategorizedChildren` exists because the two halves come from two
 * projections. The child SET comes from `proj_visibility`; each child's state
 * category comes from `proj_tickets`. A child the first knows and the second
 * has no row for has an UNKNOWN category, and counting it as non-terminal
 * would understate "done" while looking exactly like a true count. So it is
 * counted on its own line: `terminalChildren + uncategorizedChildren <=
 * totalChildren`, and a client rendering "5 of 8 done" while
 * `uncategorizedChildren > 0` is rendering a number it was told is incomplete.
 *
 * It is 0 whenever BOTH projections are current with the ledger — the condition,
 * stated instead of the shorter and slightly false "always 0 in the product".
 * One ingest transaction writes both or rolls back, and `rebuildProjection`
 * replays the WHOLE ledger into one projection inside one transaction, so
 * neither path can leave a partial set. What CAN is a caller that advances one
 * and not the other: a fixture applying a subset of the registry
 * (`test/helpers/seed.ts`'s `applyAll`), or a truncation of one table alone.
 * So a nonzero value means one projection is behind, made countable rather than
 * either invented away or thrown on. See `apps/server/src/visibility/rollup.ts`
 * (case 6.83).
 */
export type TicketRollup = {
  totalChildren: number;
  terminalChildren: number;
  uncategorizedChildren: number;
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

/**
 * A ticket's due date in the three states the ledger can actually be in.
 *
 * The plan text typed this `DueDateClaim | null`, and that `null` is the defect
 * this task is named for: it is the same value for a ticket nobody ever gave a
 * due date and for a ticket whose due date somebody DELETED. The second is an
 * attributed act — `ticket.field_set` with `value: null` keeps the clearer's id
 * and both clocks precisely so it can be shown — and flattening it to `null`
 * discards provenance one layer below the layer that fought to keep it.
 *
 * There is no `null` arm at all, deliberately: a discriminated union with no
 * empty case makes the compiler ask every renderer which of the three it means,
 * which is the same device `EffectiveRole`'s brand and this codebase's bare
 * exhaustive switches use.
 */
export type TicketDueDate =
  | { state: 'claimed'; claim: DueDateClaim }
  /** Somebody removed it. Who, and by both clocks — the claim is the clearing. */
  | { state: 'cleared'; actorId: string; clientTime: string; serverTime: string }
  /** No claim has ever been made about this ticket's due date. */
  | { state: 'never-claimed' };

/**
 * A ticket's priority: the value plus who claimed it and when. NEVER nullable and
 * NEVER a three-state union like `TicketDueDate` — there is no never-claimed or
 * cleared state to represent, because `ticket.created` writes the claim
 * (`applyTicketEvent`) and the engine refuses `value: null` for this field.
 */
export type PriorityClaim = {
  value: Priority;
  actorId: string;
  clientTime: string;
  serverTime: string;
};

/**
 * One ticket as a board, list, search or My Work response carries it.
 *
 * Field-by-field, what each value means when the underlying fact was withheld,
 * absent, or never claimed:
 *
 * - `parentId: null` — this ticket is a ROOT. It is never "a parent you may not
 *   see": a viewer who cannot see the parent still gets its id here, which is
 *   the disclosed trade the single-ticket route already makes (spec line 117,
 *   "existence, no title"). So null is unambiguous.
 * - `assigneeId: null` — nobody is assigned RIGHT NOW. It does not distinguish
 *   "never assigned" from "unassigned by somebody", and on THIS type it cannot:
 *   `proj_tickets.assignee_id` is a bare column with no provenance beside it,
 *   so the projection does not hold the difference either. Recorded rather than
 *   invented — this view model does not claim to carry unassignment provenance,
 *   and inventing a union whose second arm could never be populated would be
 *   worse than the honest gap.
 *
 *   **The LEDGER does hold it, and `ListCard.assignedProvenance` reads it**
 *   (`apps/server/src/read/assigned-provenance.ts`). This paragraph used to end
 *   at "the projection does not hold the difference either", which is a true
 *   sentence about a table that a reader takes as a statement about the system;
 *   `ticket.assigned` is an event like any other and its actor and both clocks
 *   are in `events`. What is still true of THIS type is that a card carries no
 *   such field, which is a fact about the card and not about the product.
 * - `collaboratorIds: []` — nobody is a collaborator. Never "withheld": the
 *   list is not filtered per viewer anywhere on the read path.
 * - `title` — always a claimed string. `ticket.created` writes `fields.title`
 *   unconditionally, so a card with no title claim means the projection and the
 *   ledger disagree, and the assembler throws rather than emitting `''` — the
 *   empty string would be a title nobody typed sitting where a real one goes.
 * - `dueDate` — the three-state union above; never a bare null.
 * - `priority` — always a claim; an assembler that finds none THROWS (the projection was not rebuilt).
 * - `fields` — every claim verbatim, each carrying its own actor and clocks. An
 *   ABSENT key means never claimed; a present key whose `value` is `null` means
 *   cleared by that claim's actor. The map preserves the distinction the
 *   reducer stores, so no field-specific flattening happens here.
 * - `stateProvenance` — always present; see its own note.
 * - `rollup: null` — this ticket has NO CHILDREN. Not "children you may not
 *   see": restricted children are counted in `restrictedCount` and the rollup
 *   is non-null. Matches `rollupFor`, which answers null for a leaf on the same
 *   reasoning.
 * - `closed: null` — this ticket has never been closed, or was reopened.
 *   REQUIRED here (backlog/closed spec §3.3, 2026-09-17), unlike
 *   `TicketState.closed?`, which predates the flag on 441 fixtures: every
 *   producer of a card is this task's own code, so there is no legacy literal
 *   to spare, and a reader spells `state.closed ?? null` at the boundary
 *   rather than inheriting the optionality onto the wire type.
 */
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
  dueDate: TicketDueDate;
  priority: PriorityClaim;
  /**
   * The ticket's key — `<workspace prefix><project prefix>-<number>`, the same
   * composition the single-ticket read makes for its crumb (`ticketKey`,
   * `packages/domain/src/prefix.ts`) — or `null` when the ledger holds no
   * workspace prefix, no project prefix, or no number for this ticket. REQUIRED
   * on the wire (owner, 2026-09-22: "in the board, i want the ticket keys to be
   * shown like in the prototype"), so every producer has to say; `null` is a
   * fact about the ledger, never a placeholder to be dressed as a key.
   */
  key: string | null;
  fields: Record<string, FieldClaim>;
  stateProvenance: StateProvenance;
  rollup: TicketRollup | null;
  /** The closed flag (backlog/closed spec §3.3, 2026-09-17); see this type's own docblock. */
  closed: { actorId: string; at: string } | null;
  /**
   * The backlog rank key (spec §8.1, second wave 2026-09-18), or `null` when
   * nobody has ranked this ticket. REQUIRED here for the same reason `closed`
   * above is: every producer of a card is the server's own assembler, reading
   * `proj_tickets.rank`, so there is no legacy literal to spare — and the
   * server always emits the key, which is what lets `mapRank` refuse an absent
   * one rather than defaulting it (case 13.703).
   *
   * Note where the ORDER lives: not on this type and not in the list route.
   * Ruling R1 keeps the route's `ticket_id` keyset order, so a card carries its
   * key and the client sorts. A rank is meaningful only within one project.
   */
  rank: string | null;
};

/**
 * One column of a board: one state of one workflow, holding the cards this
 * viewer may see.
 *
 * `workflowVersion` names the published definition this column's `name`,
 * `category` and `blocked` were read out of. It is the field the client's
 * `BoardGroup` keys its groups on (`packages/app-core/src/views/board.tsx:28`
 * builds `` `${workflowId}@${workflowVersion}` ``), which is why it must name a
 * definition and not merely a workflow: two columns sharing a key are asserted
 * by that key to have come from the same published definition.
 *
 * **`0` is the one value that is not a version**, and it means "no published
 * definition names this column" — the straggler case in
 * `apps/server/src/routes/board.ts`. It collapses nothing, because no publisher
 * can mint it: `workflowDefSchema.version` is `z.number().int().min(1)`, and the
 * only writer of `proj_workflows` ON THE PRODUCT PATH
 * (`apps/server/src/projections/workflows.ts`) parses every payload through that
 * schema before inserting. (Enumerated, not assumed: one TEST file also inserts
 * directly — `apps/server/test/read/compile-filter.test.ts` — which is a fixture
 * and not a road a request can take.) So `0` and "a real version" stay
 * tellable apart at the client, exactly as this file's rule requires — and the
 * alternative, carrying the workflow's LATEST version on a column no definition
 * names, would file that column under a definition it was never folded into.
 */
/**
 * A `TicketCard` plus the two hierarchy facts the BOARD — and only the board —
 * also serves (owner request, 2026-09-23: parent-key badge, epic chip). The
 * SAME reasoning `ListCard`'s own docblock states for why it is a separate
 * type and not two fields on `TicketCard` applies here word for word:
 * `TicketCard` is shared by search, My Work and the attention strip, and a
 * field addition that closes a gap on the board would half-close a
 * differently-shaped one on three surfaces that never asked for it.
 *
 * - `parent` — this ticket's IMMEDIATE parent, or `null` when it has none OR
 *   this viewer may not see it. Unlike `TicketCard.parentId` (an existence
 *   leak the single-ticket read deliberately makes, spec §6), the board makes
 *   NO existence leak at all: an unreadable parent is indistinguishable from
 *   no parent, exactly the choice `ListCard.epicId` already makes for the
 *   epic walk one ancestor further up. A parent badge naming a ticket this
 *   viewer cannot open would BE a leak, so this field follows the epic rule
 *   rather than the single-ticket route's.
 * - `epic` — the nearest ancestor-or-self whose type carries the EPIC rank AND
 *   which this viewer may see; `null` when there is none or the walk is
 *   stopped by a link the viewer may not follow. Exactly `epicId`'s own rule
 *   (`ancestry.ts`'s `epicAncestors`), widened to also carry the `key` and
 *   `title` the board's chip needs to draw ITSELF — `ListCard.epicId` never
 *   needed a title on the card because the list only draws it once, on the
 *   GROUP heading, not per card.
 */
export type BoardTicketCard = TicketCard & {
  parent: { ticketId: string; key: string | null } | null;
  epic: { ticketId: string; key: string | null; title: string } | null;
};

export type BoardColumn = {
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  stateId: string;
  name: string;
  category: StateCategory;
  blocked: boolean;
  /**
   * Whether a NEW ticket may be born in this state (starting-status design,
   * 2026-09-23) — `isCreatableState(def, stateId)`, read straight off the
   * published definition the same way `blocked` is, immediately above. The
   * board's empty-column "Create ticket" button reads this rather than
   * re-deriving it, so the client and the server can never disagree about
   * which columns may receive a new ticket.
   */
  creatable: boolean;
  cards: BoardTicketCard[];
};

export type BoardResponse = { projectId: string; workspaceId: string; columns: BoardColumn[] };

/**
 * Who claimed the current ASSIGNMENT, and when — by both clocks.
 *
 * No `cause`, unlike `StateProvenance`: a reopen names the child that caused it
 * because `ticket.transitioned` carries a `cause` field, and
 * `ticket.assigned`'s payload is `{ assigneeId }` and nothing else
 * (`packages/domain/src/events/ticket-events.ts:50`). A nullable `cause` here
 * would be a field no event could ever fill.
 */
export type AssignmentProvenance = {
  actorId: string;
  clientTime: string;
  serverTime: string;
};

/**
 * A `TicketCard` plus the five facts the LIST route — and only the list route —
 * also serves (ruling P25 clause 1).
 *
 * ## Why this is a separate type and not five fields on `TicketCard`
 *
 * `TicketCard` is shared by the board, search, My Work and the attention strip.
 * A field addition that closes a gap on one surface and half-closes a
 * differently-shaped one on four others is the "implemented on ONE DOOR of a
 * set" defect run backwards. So the list route widens its OWN card and nothing
 * else moves.
 *
 * **This paragraph used to give a second reason and that reason was FALSE**, so
 * it is corrected in place rather than deleted — it was read to decide what not
 * to touch. It said `GET /v1/me/work` could not serve a state name because "a My
 * Work card names no workflow version to read a name from, and the ticket is not
 * fetched with its project's workflow defs in hand". The first clause is true of
 * the CARD and beside the point: the version is on the ROW, not the card
 * (`ProjTicketRow.workflow_version`, whose own docblock says it is carried there
 * precisely so no card field is derived from it). The second clause was wrong —
 * `readMyWork` selects `PROJ_TICKET_COLUMNS`, which has named
 * `t.workflow_id, t.workflow_version` all along, so the route held the pair the
 * whole time and only the by-version definition read was missing. That read is
 * one `foldedWorkflowDefs` call, and `MyWorkResponse.stateNames` now makes it as
 * a sibling MAP — so the argument above for keeping the field off `TicketCard`
 * still holds, and nothing else moved after all.
 *
 * ## Field by field, what each value means
 *
 * - `typeRank` — `proj_ticket_types.rank` for this card's `typeId`, read in the
 *   card's own workspace. The ladder's rung, which is what an outline indents
 *   by. Absent type row → the assembler throws: a ticket's type is written by
 *   `ticket.created`, which the door refuses for an unknown type, so a card
 *   whose type has no row means the projection and the ledger disagree.
 * - `epicId` — the nearest ancestor-or-self whose type carries the EPIC rank AND
 *   which this viewer may see; `null` when there is none, when the walk is
 *   stopped by a link the viewer may not follow, or when the card is not itself
 *   under one. Exactly `epicAncestors`' answer, which the route already computed
 *   for `groupBy=epic` and threw away for every other grouping.
 * - `stateName` — the state's name **in the definition this ticket is folded
 *   to**, `(workflow_id, workflow_version)` off the ticket's own row — never the
 *   latest definition's. Reading the latest would be the `workflowVersion` lie
 *   in miniature: a name from a vocabulary this ticket was never folded into.
 *   No published definition at that version, or no such state in it → the
 *   assembler throws rather than falling back to the state id, which would put
 *   a slug where a name goes.
 * - `assignedProvenance` — the claim that produced the CURRENT assignee, or
 *   `null` when nobody is assigned. `ticket.assigned` is the only event that
 *   writes `assigneeId` (`ticket-state.ts:195`; `ticket.created` sets it to
 *   `null` at `:136`), so the latest one is that claim. Assigned with no such
 *   event → throw, the same ledger/projection disagreement `assembleTicketCards`
 *   throws on.
 * - `hasRestrictedParent` — this card names a parent, the parent HAS a
 *   `proj_visibility` row, and `canSeeResolved` says this viewer may not see it.
 *   `false` covers all three of "no parent", "a parent you may see" and "a
 *   `parent_id` naming no row at all" — the last because the projection already
 *   resolved such a ticket as a root (`proj-visibility.ts`), and claiming a
 *   restricted parent there would invent an existence the system has no evidence
 *   for. Strictly less than the `parent: { kind: 'restricted', id }` the single
 *   ticket read already serves for the same viewer over the same rows.
 */
export type ListCard = TicketCard & {
  typeRank: number;
  epicId: string | null;
  stateName: string;
  assignedProvenance: AssignmentProvenance | null;
  hasRestrictedParent: boolean;
};

export type ListGroup = { key: string; label: string; cards: ListCard[] };

export type ListResponse = {
  /**
   * **REQUIRED, and it is what the client's roster join is fetched with.**
   *
   * Every `ListCard` carries `assignee` and `assignedProvenance`/`stateProvenance`
   * naming an actor by ID; a client that can only render those ids prints a ULID
   * where a person's name belongs. The display names live on the members route,
   * which is keyed by workspace — so the list body has to say which workspace it
   * was read for, exactly as `BoardResponse.workspaceId` (`:262`) does and for
   * the same reason (`online-data-source.ts`'s `getBoard` fetches the roster
   * through `boardWorkspaceId(raw)` before mapping).
   *
   * `projectId` sitting beside it is NOT a substitute: a project belongs to one
   * workspace, and a client deriving one from the other would be re-deriving a
   * fact the route already holds as a parameter. Required rather than optional
   * so that a body which forgot it is a compile error at every construction
   * site, rather than `undefined` reaching a mapper that would degrade silently.
   */
  workspaceId: string;
  /**
   * The project the list was read for — or `null` for the WORKSPACE scope
   * (`GET /v1/workspaces/:workspaceId/ticket-list`, MCP CRUD plan Task 4), which
   * spans every project and so names none. Still required: a body that forgot it
   * is still a compile error; `null` is a claim ("no one project"), never an absence.
   * The project route always answers a string, and the web client reads only that route.
   */
  projectId: string | null;
  groupBy: Grouping;
  groups: ListGroup[];
  nextCursor: string | null;
};

export type SearchHit = {
  card: TicketCard;
  snippet: string;
  /**
   * **Which of the three indexed columns matched** (owner ruling, 2026-09-19:
   * *"change the query so `matchedIn` is derivable"*).
   *
   * This is the ONE fact the route could not previously answer. `proj_search`
   * has always stored `title`, `description` and `comments` as three separately
   * weighted columns — the distinction was in the data the whole time — and the
   * query destroyed it by concatenating them into a single `ts_headline` before
   * anything could ask which one matched. The route now derives it with one
   * `@@` per column.
   *
   * **It is a SINGLE value, not a list, and the precedence is `title` →
   * `description` → `comment`** — the order the `tsv` weights already imply
   * (A, B, C). A query that matches two columns is answered by the first of
   * them, stated here so the order is a rule rather than an accident of how the
   * CASE happened to be written.
   */
  matchedIn: 'title' | 'description' | 'comment';
};

/**
 * One note in a search answer (notes series, Plan 3 of 6, spec §2).
 *
 * ## Why there is no `source` field here, although the spec's type has one
 *
 * The spec's `NoteSearchHit` carries `source: 'lexical' | 'meaning'`, and it is
 * set on the CLIENT from the `mode` the client itself asked for — the server
 * knows the mode of the REQUEST, so a per-row copy would be the request's own
 * parameter echoed back on every row, with the two free to disagree the moment
 * anything filtered or reordered. This is the WIRE shape and it stops at what
 * the server knows per row; `packages/app-core`'s view model is where `source`
 * appears. (`SearchHit` is split the same way, and for the same reason.)
 *
 * `title` is the RAW title, not the folded one the index matched: folding is an
 * indexing detail and a reader shown `compressor log` for `Compressor Log` would
 * be reading the search engine rather than their own note.
 */
export type NoteSearchHit = {
  noteId: string;
  title: string;
  /** `ts_headline` output with `**` around matches (lexical), or the chunk text (meaning). */
  snippet: string;
  homeProjectId: string;
  scopeMode: NoteScopeMode;
  attachedTicketKeys: string[];
  authorId: string;
  updatedAt: string;
};

export type SearchResponse = {
  workspaceId: string;
  query: string;
  hits: SearchHit[];
  /**
   * The note half of the answer. ALWAYS present — `[]` when no note matched,
   * when `kinds` left notes out, or when `mode=meaning` found nothing.
   *
   * Required rather than optional, although the plan's route description writes
   * it as a sibling of an unchanged `hits`: a client that had to handle
   * `undefined` and `[]` as different states would be inventing a distinction
   * the server does not draw. `hits` stays exactly what it was, which is what
   * keeps an older client working.
   */
  notes: NoteSearchHit[];
  /**
   * The words a misspelt query was corrected TO, present exactly when a
   * correction happened (spec §7.5). Absent rather than `[]` when nothing was
   * corrected, so a UI can render "showing results for …" on the presence of
   * this field alone.
   */
  corrected?: string[];
};

export type MyWorkResponse = {
  workspaceId: string;
  groups: { open: TicketCard[]; active: TicketCard[]; terminal: TicketCard[] };
  /**
   * `projectId` → name, for the projects in THESE cards that this viewer may be
   * told the name of (rulings P32/P38). A card always carries its `projectId`;
   * an id absent from this map is one whose NAME is withheld, and the item
   * renders id-only rather than blank — the existence-without-title register.
   *
   * A map beside the groups, not a field on `TicketCard`: that type is shared
   * by the board, the list, search and attention, and a name there would put
   * this visibility decision on four routes that never asked the question.
   */
  projectNames: Record<string, string>;
  /**
   * `ticketId` → the name of the state that card is in, **in the definition the
   * ticket is folded to** — `(workflow_id, workflow_version)` off the ticket's
   * own row, never the latest published one. Reading the latest would be
   * `BoardGroup.workflowVersion`'s lie in miniature: a name from a vocabulary
   * this ticket was never folded into.
   *
   * Keyed by `ticketId` and not by state id, because a state id is unique only
   * within one workflow AND one version: two cards in this answer may name the
   * same `stateId` under different workflows, or under different versions of one
   * workflow, and mean different states. `TicketCard` carries `workflowId` but
   * NOT the version it is folded to (that stays on `ProjTicketRow`, for the
   * reason stated there), so `ticketId` is the only key the client can look a
   * card up by without the route disclosing a second vocabulary.
   *
   * TOTAL over the cards in `groups`: every card has an entry, and the route
   * throws rather than omitting one. An absent entry would be a card whose state
   * has no name, and the client's `WorkItem.stateName` is required — so the
   * honest failure is here, where the projection and the ledger can be named as
   * disagreeing, not at a client falling back to the state id and rendering a
   * slug where a name goes.
   *
   * A map beside the groups for the same reason `projectNames` is one:
   * `TicketCard` is shared by the board, the list, search and attention, and
   * `ListCard` already widens its OWN card for this exact field so nothing else
   * moves. Additive, so a client that ignores it is unaffected.
   */
  stateNames: Record<string, string>;
  /**
   * This viewer's OWN open contested claims (ruling P40).
   *
   * The additive key the docblock on `routes/my-work.ts` reserved — "the shape
   * here nests the cards under `groups` precisely so that key can arrive beside
   * it without reshaping anything a client already parses". It arrives beside
   * them, and nothing above it moved.
   *
   * **Why HERE and not left to `GET /v1/contests`**, which is shipped,
   * `canSee`-gated and queryable by `claimantId`: because "MY contested claims"
   * is a VIEWER-scoped read, and the viewer is a fact only the server holds.
   * `/v1/contests`' `claimantId` is caller-supplied, and the online client
   * cannot supply its own — `getMyWork(workspaceId)` carries no viewer id, P30
   * forbids widening `data-source.ts`, and the web shell builds its data source
   * before the session resolves. A client reading `/v1/contests` unfiltered
   * would render every contest it may SEE as the viewer's own, which is not a
   * degraded answer but a wrong one. `proj_contested`'s
   * `(workspace_id, claimant_id)` index exists for exactly this path and its
   * migration comment says so.
   *
   * Open contests only (`NOT resolved`): a settled contest is not outstanding
   * work, and the resolutions have their own surface.
   */
  contested: ContestedClaimView[];
  /**
   * Tickets handed to this viewer BY NAME — `proj_visibility.resolved_mode =
   * 'explicit'` with them in `resolved_user_ids` (case 13.176).
   *
   * ## Why this key exists, and why it is not a filter over `groups`
   *
   * `groups` is *assigned to me*. A ticket can be shared with somebody who is
   * not its assignee — that is what an explicit audience IS — so a shared errand
   * appears in none of the three groups, and before this key the product had no
   * read that listed one. A guest is the extreme case and the one 13.176 names:
   * `eff.projects` is built from `proj_memberships` alone
   * (`permissions/effective-role.ts`), so a guest on no project gets no project
   * card, hence no link, hence no route to the errands they were handed. They
   * could already REACH `/v1/me/work` — the workspaces page links it from every
   * workspace card, outside the projects list — and it answered them three empty
   * groups. This key is what makes that page tell them the truth.
   *
   * ## Overlap with `groups` is real and deliberate
   *
   * A ticket both assigned to and explicitly shared with the viewer appears in
   * BOTH. These are two different claims about one ticket — *you are doing this*
   * and *you were handed this* — and de-duplicating would silently drop the
   * second, which is the only one a non-assignee can ever have. The client keys
   * its sections separately and says so.
   *
   * ## The audience is the RESOLVED one, so inheritance counts
   *
   * A child that authored no `visibility.set` carries its nearest authoring
   * ancestor's audience, and somebody handed a parent errand was handed its
   * sub-errands with it. See `read/visible-where.ts`'s `explicitAudienceWhere`,
   * which this shares rather than restates.
   *
   * `projectNames` and `stateNames` are TOTAL over these cards too — a shared
   * card is a card, and a guest whose project name is withheld (rulings P32/P38)
   * gets the id-only render, not a missing state name.
   *
   * Additive, like `contested` before it: a client that ignores the key is
   * unaffected, and nothing above it moved.
   */
  shared: TicketCard[];
};

/**
 * One of the viewer's own refused claims, as `GET /v1/me/work` serves it.
 *
 * ## `title` is nullable, and that is ruling P40's constraint (b)
 *
 * A contest outlives the visibility of the ticket it is about. The viewer made
 * this claim, so the CONTEST is theirs to see; whether they may still see the
 * TICKET is a separate question answered by `canSee` at read time, and it can
 * have changed since the claim was refused. So the title is served iff the
 * viewer can see the ticket NOW, and is `null` otherwise — the same
 * existence-without-title register as `WorkItem.projectName` under P32/P38: the
 * `ticketId` is always present, so the row renders id-only rather than
 * vanishing or blank.
 *
 * Nullable rather than absent, for the reason that register always gives: "no
 * title for you" is a fact the renderer must be able to act on, and an optional
 * key would let a route that simply forgot the field look the same as the rule
 * applying.
 */
export type ContestedClaimView = {
  ticketId: string;
  title: string | null;
  rule: string;
  reason: string;
  /**
   * What a REFUSED claim honestly has (ruling P39). There is no `serverTime`
   * member: the claim was refused at the door, never committed and never
   * stamped, so no row in this system records a server instant for it.
   * `contestedAt` is the CONTEST event's own instant — when the refusal was
   * filed — and is named for that rather than spent as the claim's.
   */
  claim: { actorId: string; clientTime: string; contestedAt: string };
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
  | { kind: 'due-soon'; card: TicketCard; due: DueDateClaim; windowDays: number; reason: string }
  /**
   * A live due-date claim on a day BEFORE today (IST). `daysOverdue` is the IST
   * day count (1 = yesterday); today itself is `due-soon`, not this (NP-06).
   */
  | { kind: 'overdue'; card: TicketCard; due: DueDateClaim; daysOverdue: number; reason: string };

/**
 * The attention strip, as the server computes it at `generatedAt` and never
 * stores it.
 *
 * `settings` is the WHOLE `WorkspaceSettings`, provenance included, rather than
 * the plan text's bare `{ staleDays, dueSoonDays }` pair. That pair is this
 * file's own rule broken: it gives "the defaults are in force because nobody has
 * configured this workspace" and "somebody claimed 7 and 7" the same value, and
 * a client rendering "stale after 7 days" then cannot say whether anyone chose
 * it. `getWorkspaceSettings` already keeps the two apart — `provenance: null`
 * means never claimed, and the defaults live in the reader rather than in the
 * table for exactly that reason — so carrying its answer whole is the change
 * that stops discarding a distinction one layer below the layer that made it.
 * The same call `TicketDueDate` makes about a due date somebody deleted.
 *
 * `generatedAt` names the moment the judgment was made, and is the only honest
 * thing a computed strip can return: everything below it expires.
 */
export type AttentionResponse = {
  workspaceId: string;
  generatedAt: string;
  settings: WorkspaceSettings;
  items: AttentionItem[];
};

/**
 * ## The builder's read surface (Plan 5 Task 9b)
 *
 * Plan 8's workflow builder consumes these through Plan 6's `DataSource.query`.
 * They are the SHAPE of a workspace — its workflows, its ticket types, its
 * roster, and how much live work sits in each state — rather than the work
 * itself, so none of them passes through the ticket visibility predicate. The
 * access decision therefore lives entirely at the door, and it differs per
 * route; `apps/server/src/routes/builder-reads.ts` is where it is written down.
 *
 * The definition and type payloads travel VERBATIM (`PublishedWorkflowDef`,
 * `TicketTypeDef`) rather than as flattened view models: the builder loads one
 * onto a canvas and republishes it, so any field this surface dropped would be
 * a field the next publish silently deleted.
 */
export type WorkflowListResponse = { workspaceId: string; workflows: PublishedWorkflowDef[] };

export type WorkflowResponse = { workspaceId: string; workflow: PublishedWorkflowDef };

export type TicketTypeListResponse = { workspaceId: string; ticketTypes: TicketTypeDef[] };

/**
 * `displayName` is whatever better-auth's `"user"."name"` holds — the vendor
 * owns identity (Plan 4), and this surface neither invents a fallback nor
 * formats a phone number into a name. It is not nullable because a roster row
 * with no name is not something this read may produce: see `readMembers`, which
 * states what it does when the join finds nothing.
 */
export type WorkspaceMember = {
  userId: string;
  displayName: string;
  role: WorkspaceRole;
  /**
   * The member's address, **present only when it is a real one.**
   *
   * The owner's instruction is *"if the name is absent, show the email instead"*,
   * and the product has two populations that do not overlap **as it creates
   * them** — a magic-link sign-up on the synthetic domain is accepted by
   * better-auth's `z.email()` and drifts the label to the member's id, which is
   * benign but is why this is stated as a fact about minting rather than an
   * invariant: a phone-only sign-up
   * gets a **synthetic** address (`phone.gisik-nokma.invalid`, whose local part is
   * the phone number) but a `displayName` that IS the phone, while an email
   * sign-up gets a real address and — because better-auth's magic-link plugin
   * creates the user with `name: name || ""` and the sign-in page sends no name —
   * an **empty** `displayName`. So the fallback fires exactly for genuine
   * addresses.
   *
   * **OPTIONAL, and the absence is the declaration rather than a gap:** the server
   * WITHHOLDS the synthetic address (`readMembers`), so a phone member's row
   * carries no `email` key at all rather than a key whose value is a phone number
   * in disguise. Absent is not `''`, for the same reason a withheld count is not
   * `0` on `WorkspaceRef` — a renderer that treats them alike would print an empty
   * string where the product decided to say nothing.
   */
  email?: string;
};

export type MemberListResponse = { workspaceId: string; members: WorkspaceMember[] };

/**
 * One person's display name, and NOTHING else — no role, no address. The wire
 * shape of `GET /v1/workspaces/:id/actor-names`: what a client joins onto an
 * actor id it already holds when the roster (`MemberListResponse`) does not
 * name that person (a guest is withheld from a non-admin's roster).
 *
 * `removed` is present ONLY when true: the person was granted in this workspace
 * and no longer holds a membership (R3/R5), so a client writes "Name (removed)".
 * `displayName` is the name, or the verified email when the name is blank.
 */
export type ActorName = { userId: string; displayName: string; removed?: true };
export type ActorNameListResponse = { workspaceId: string; names: ActorName[] };

/**
 * Tickets currently sitting in each state of one workflow. Counts cover the
 * WHOLE workspace, not the caller's view — the route is admin-only for exactly
 * that reason, so there is no per-viewer variant to drift out of step. Every
 * state of the resolved definition appears, zeroes included: a mapping dialog
 * that silently omitted an empty state would invite an author to delete a state
 * that turns out to hold work tomorrow.
 */
export type StateOccupancyResponse = {
  workspaceId: string;
  workflowId: string;
  counts: Record<string, number>;
};

/**
 * How many tickets of one type are PINNED to one workflow — `proj_tickets`
 * filtered on both, because a ticket pins its workflow at creation (owner
 * decision 2026-08-27) and re-pointing the type's binding changes only what new
 * tickets get. Admin-only on `StateOccupancyResponse`'s exact terms.
 *
 * `count: 0` is a real answer here and not a collapse of "no such type": the
 * route resolves the type and the workflow first and answers 404 if either is
 * unknown in this workspace, so a zero always means "this pairing exists and
 * holds nothing".
 */
export type TypePopulationResponse = {
  workspaceId: string;
  typeId: string;
  workflowId: string;
  count: number;
};

/**
 * How many tickets of each type exist in the WORKSPACE — the type's own count,
 * asked once for every type the workspace defines.
 *
 * ## Why this is not `TypePopulationResponse`, and why the route was not widened
 *
 * `TypePopulationResponse` answers *"how many of this type are ON THIS
 * WORKFLOW"*, filtered on both, and it is a different question: a ticket pins
 * the workflow it was CREATED under (owner decision 2026-08-27), so re-pointing
 * the type's binding changes only what new tickets get. The pinned number
 * therefore stops being the type's count the moment a rebind leaves tickets
 * behind — which is exactly the divergence the builder's migration dialog
 * exists to show. Answering both questions from one route, with the meaning
 * depending on whether an argument was passed, would be one door serving two
 * things — this repo's "second door" defect read backwards. Two questions, two
 * reads.
 *
 * ## One read for every type, zeroes included
 *
 * The type list renders every row at once, so a per-type read would be N
 * requests to paint one screen. And every type the workspace DEFINES appears,
 * zeroes included, on `StateOccupancyResponse`'s stated terms: a screen that
 * silently omitted an empty type would invite an author to delete one that
 * turns out to hold work tomorrow. A caller can therefore tell "this type has
 * no tickets" (0) from "this workspace does not define that type" (absent).
 *
 * Admin-only on `StateOccupancyResponse`'s exact terms and for its exact
 * reason: the number is the whole workspace's, counted over tickets the caller
 * may not see, so there is no per-viewer variant to serve instead.
 */
export type TicketCountsResponse = {
  workspaceId: string;
  counts: Record<string, number>;
};

/**
 * The bulk rebind's answer — the shape Plan 8's gateway already pinned, served
 * verbatim rather than renegotiated.
 *
 * A union rather than a `count` that goes to 0 on refusal: "nothing moved
 * because nothing needed to" and "nothing moved because the batch was refused"
 * are different facts, and a caller must not have to guess which happened.
 */
export type MigrationOutcome =
  | { status: 'migrated'; count: number }
  | { status: 'refused'; rule: string; reason: string };

/**
 * The note read models (notes series, Plan 1 of 6, spec §2).
 *
 * `NoteSummary` is what a LIST serves and `NoteDetail` adds the two fields only
 * a single-note read can afford: the `body` itself and the `schemaVersion` that
 * says which document schema wrote it (the version rides INSIDE the doc —
 * `DocJson`'s `attrs.schemaVersion` — but a reader that had to open the document
 * to learn it would be parsing JSON to decide whether it can parse JSON).
 *
 * `attachedTickets` carries the ticket's `key` and `title`, not just its id,
 * because the notes page shows "CCSO-1183 Renew the trade licence" on the row
 * and a caller that had only ids would need N more reads to paint the list. The
 * server builds it with the viewer's own ticket visibility applied — a reader of
 * a note who cannot see one of its tickets does not learn that ticket's key —
 * which is why the field is on the READ model and not derived client-side from
 * an id list.
 *
 * `projectId` was added additively (notes series, Plan 6 of 7) so a note's
 * byline can link to the ticket's own project page (`ticketSheetPath`) instead
 * of the id-only My Work door — the same reason `key` and `title` are carried
 * rather than looked up.
 *
 * `NoteVersion` is a POINTER, not a snapshot: a version is an event, and the
 * history screen lists pointers until one is opened, at which point
 * `getNoteVersion` fetches that event's body. Storing every version's body in
 * this shape would ship the whole document history on every history read.
 *
 * `NoteComment` is deliberately narrower than the ticket comment read: no
 * files, no mentions. Notes get images in Plan 4 of the series, and a field
 * that is always empty today would read as "this note has no files" rather than
 * "this read does not carry files yet".
 */
export type NoteSummary = {
  noteId: string;
  workspaceId: string;
  homeProjectId: string;
  authorId: string;
  title: string;
  scope: NoteScope;
  attachedTickets: { ticketId: string; projectId: string; key: string; title: string }[];
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
};
export type NoteDetail = NoteSummary & { body: unknown; schemaVersion: number };
export type NoteVersion = { eventId: string; authorId: string; recordedAt: string; seq: number };
export type NoteComment = {
  commentId: string;
  authorId: string;
  /** `null` once the comment is deleted (spec §6): the placeholder keeps the author and time, never the text. */
  body: unknown;
  recordedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

/**
 * `GET /v1/me/deleted-items` (trash series, Plan 1 Task 7, spec §6.3's read).
 *
 * One item per deleted workspace, project, ticket or note this caller may
 * currently restore or mark — by CURRENT authority (T3), never by who deleted
 * it. An item inside a deleted container is NOT listed on its own; the
 * container's own row carries `containedCount` instead (spec §6.3).
 */
export type DeletedItem = {
  kind: 'workspace' | 'project' | 'ticket' | 'note';
  id: string;
  workspaceId: string;
  workspaceName: string;
  projectId: string | null;
  projectName: string | null;
  /** Workspace/project name, ticket `KEY title`, note title. */
  label: string;
  deletedBy: string;
  /**
   * The deleter's display name (trash Plan 4, D1) — `"user"."name"` trimmed, or
   * `null` when it is blank or the account is gone. The Deleted items screen
   * says "you" for the viewer's own deletions and "someone" for `null`; the id
   * above stays the identity, this is only what a person reads.
   */
  deletedByName: string | null;
  deletedAt: string;
  purgeMarkedAt: string | null;
  /** `purgeDueAt(purgeMarkedAt)`, computed by the server; `null` when unmarked. */
  purgeDueAt: string | null;
  /** Live items inside a deleted workspace/project (projects + tickets + notes); 0 for tickets and notes. */
  containedCount: number;
};
export type DeletedItemsRead = { items: DeletedItem[] };

/**
 * One project group as `GET /v1/workspaces/:workspaceId/groups` serves it
 * (prefixes and groups plan Task 6). `level` is 1–4 and `parentId` is null
 * exactly at level 1. `projectCount` counts the projects filed directly under
 * the group (trashed ones included — they still point at it); `childCount`
 * counts the groups directly under it. Siblings sort by `rank`.
 */
export type GroupRow = {
  id: string;
  parentId: string | null;
  level: 1 | 2 | 3 | 4;
  name: string;
  rank: string;
  projectCount: number;
  childCount: number;
};
export type GroupListResponse = { workspaceId: string; groups: GroupRow[] };
