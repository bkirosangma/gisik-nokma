import type { FieldClaim } from './entity-state.js';
import type { StateCategory } from './workflow.js';
import type { Grouping } from './filter-spec.js';

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
 * In a ledger written through the shipped door it is always 0 — one ingest
 * transaction writes both projections or neither — so a nonzero value is a
 * projection disagreement, made countable rather than either invented away or
 * thrown on. See `apps/server/src/visibility/rollup.ts` (case 6.83).
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
 *   "never assigned" from "unassigned by somebody", and it cannot:
 *   `proj_tickets.assignee_id` is a bare column with no provenance beside it,
 *   so the projection does not hold the difference either. Recorded rather than
 *   invented — this view model does not claim to carry unassignment provenance,
 *   and inventing a union whose second arm could never be populated would be
 *   worse than the honest gap.
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
