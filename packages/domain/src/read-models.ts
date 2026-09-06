import type { FieldClaim, WorkspaceRole } from './entity-state.js';
import type { PublishedWorkflowDef, StateCategory } from './workflow.js';
import type { Grouping } from './filter-spec.js';
import type { TicketTypeDef } from './ticket-types.js';
import type { WorkspaceSettings } from './events/workspace-settings.js';

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
 * - `fields` — every claim verbatim, each carrying its own actor and clocks. An
 *   ABSENT key means never claimed; a present key whose `value` is `null` means
 *   cleared by that claim's actor. The map preserves the distinction the
 *   reducer stores, so no field-specific flattening happens here.
 * - `stateProvenance` — always present; see its own note.
 * - `rollup: null` — this ticket has NO CHILDREN. Not "children you may not
 *   see": restricted children are counted in `restrictedCount` and the rollup
 *   is non-null. Matches `rollupFor`, which answers null for a leaf on the same
 *   reasoning.
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
  fields: Record<string, FieldClaim>;
  stateProvenance: StateProvenance;
  rollup: TicketRollup | null;
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
export type BoardColumn = {
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  stateId: string;
  name: string;
  category: StateCategory;
  blocked: boolean;
  cards: TicketCard[];
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
 * Adding these there would put `stateName` on `GET /v1/me/work`, whose
 * `WorkItem.stateName` gap is a DATA gap with a different answer (a My Work card
 * names no workflow version to read a name from, and the ticket is not fetched
 * with its project's workflow defs in hand) and is with the owner. A field
 * addition that closes a gap on one surface and half-closes a differently-shaped
 * one on four others is the "implemented on ONE DOOR of a set" defect run
 * backwards. So the list route widens its OWN card and nothing else moves.
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
export type WorkspaceMember = { userId: string; displayName: string; role: WorkspaceRole };

export type MemberListResponse = { workspaceId: string; members: WorkspaceMember[] };

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
