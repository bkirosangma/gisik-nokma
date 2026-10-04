import type { TicketLinkKind } from './events/ticket-events.js';
import type { StateCategory } from './workflow.js';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';

/** A field's current value plus its provenance — who claimed it, and both clocks. */
export type FieldClaim = { value: unknown; actorId: string; clientTime: string; serverTime: string };

/**
 * The projected current state of a ticket, as the rule engine reads it —
 * the merged cross-plan shape (coordination doc §4): Plan 3's domain fields
 * plus this plan's transition log. Plan 3's reducer and projection maintain
 * every field. `stateCategory` is denormalized from the ticket's workflow so
 * the parent-terminal invariant needs no per-child workflow lookup.
 * `transitions` is the append-only log of every ticket.transitioned applied
 * to this ticket, oldest first — what require-different-user reads. An
 * entry's workflowId + workflowVersion name the vocabulary that entry's
 * toStateId is written in (the ticket's workflow and version when the
 * transition was applied, after any forward fold). Four-eyes skips entries
 * from a different workflow and resolves the rest forward before comparing,
 * so neither a dropped-and-remapped state nor a workflow migration can
 * disarm the rule. Entries are never rewritten: a fold moves the ticket's
 * current state, never the history that got it there.
 */
export type TicketState = {
  kind: 'ticket';
  id: string;
  workspaceId: string;
  projectId: string;
  typeId: string;
  parentId: string | null;
  workflowId: string;
  workflowVersion: number;
  stateId: string;
  stateCategory: StateCategory;
  assigneeId: string | null;
  collaboratorIds: string[];
  fields: Record<string, FieldClaim>;
  transitions: { toStateId: string; actorId: string; seq: number; workflowId: string; workflowVersion: number }[];
  /**
   * The closed flag (backlog/closed spec §1.2, 2026-09-17): set by
   * `ticket.closed`, cleared by `ticket.reopened`, never touching `stateId`.
   * OPTIONAL here, and only here, because 441 `TicketState` literals in tests
   * across five packages predate it; every producer sets it (the reducer,
   * `rowToTicketState`, the replica) and every reader spells
   * `state.closed ?? null`. The wire types carry it required.
   */
  closed?: { actorId: string; at: string } | null;
  /**
   * The backlog rank key (spec §8.1): set by `ticket.ranked`, and `null` on a
   * ticket nobody has ranked — including one just created, which writes the
   * null (Task 3, 2026-09-18; `ticket-state.ts`'s creation branch records the
   * decision and the `toEqual`-across-the-rig measurement behind it). Meaningful
   * only within the ticket's project.
   *
   * OPTIONAL here, and only here, because the same hundreds of `TicketState`
   * literals in tests that predate `closed` predate this too. That optionality
   * is a statement about those LEGACY LITERALS, never about the producers: every
   * producer sets the field — the reducer writes the null at creation, the
   * server reads the column unconditionally, the replica reads the fold — and
   * every reader spells `state.rank ?? null` for the literals' sake. The wire
   * types (`TicketCard.rank`, `ListRow.rank`) carry it REQUIRED.
   */
  rank?: string | null;
  /**
   * When this ticket was last explicitly reopened (spec §8.2, second wave
   * 2026-09-18): the `ticket.reopened` envelope's server time, or `null` for a
   * ticket that has never been reopened OR has been acted on since.
   *
   * **A SWEEP INPUT, not a display fact** — nothing renders it, and it is
   * deliberately absent from `TicketCard`/`ListRow`. It exists because the
   * auto-close sweep has to tell "terminal for 30 days because nobody came
   * back" apart from "terminal for 30 days, reopened by a person yesterday":
   * both rows carry the same `closed: null` and the same terminal `stateId`,
   * so without this the sweep would close a ticket an hour after someone
   * deliberately reopened it.
   *
   * Cleared by ANY `ticket.transitioned`, including one back into the same
   * terminal state, because the clock the sweep measures is "how long has this
   * sat in the state it is in" and a transition restarts it. Letting the flag
   * survive would exempt a ticket from auto-close forever after one reopen.
   *
   * OPTIONAL here on `rank`'s exact rule and for its exact reason: hundreds of
   * `TicketState` literals in tests across five packages predate the field, so
   * the DOMAIN type is optional while every producer sets it — the reducer on
   * all three of `ticket.created`, `ticket.transitioned` and `ticket.reopened`,
   * and `rowToTicketState` from the column. Readers spell `?? null` for the
   * literals' sake. Unlike `rank` it is NOT carried on the wire's card types,
   * because no surface displays it.
   */
  reopenedAt?: string | null;
  /**
   * The soft-delete flag: set by `ticket.deleted`, cleared back to `null` by
   * `ticket.restored`, never touching `stateId` — `closed`'s exact shape and
   * its exact reason (the flag and the state are orthogonal).
   *
   * The product says "deleted" rather than "erased" on purpose, and the FAQ
   * states the semantics this field carries before the event existed
   * (`design-system/interactive/desktop.dc.html`, `faq-delete`): *"The ticket
   * stops appearing in views. Its history is retained, because other events
   * cite it — a comment, a block, a workflow version."* So this flag is a
   * READ filter, not a tombstone: the ledger, the row and the history all stay,
   * and every view-serving SELECT excludes the rows it marks. Nothing erases.
   *
   * The ENGINE's own by-id reads deliberately ignore it (`projections/
   * tickets.ts`'s `getTicketStateFromDb`, which feeds `EngineContext`): the
   * undo is `ticket.restored`, and a rule engine that could not see a deleted
   * ticket would refuse its own undo with "no such ticket" — the feature would
   * not be reversible at all. The filter belongs to views, not to the fold.
   *
   * OPTIONAL here, and only here, on `closed`'s exact rule and for its exact
   * reason: hundreds of `TicketState` literals in tests across five packages
   * predate the field, so the DOMAIN type is optional while every producer sets
   * it — the reducer writes the `null` at creation and on `ticket.restored`,
   * the object on `ticket.deleted`, and `rowToTicketState` reads the columns
   * unconditionally. Every reader spells `state.deleted ?? null`. The wire
   * types do NOT carry it: no surface renders it, and whether a ticket is
   * deleted is a filter the server applies, not a fact the card needs.
   */
  deleted?: { actorId: string; at: string } | null;
  /**
   * Typed links held on this ticket's stream, in the order added: its outbound
   * links, plus, on a DRAFT only, the inbound links filed from the other end
   * (entries with `from`, drafts spec R42). ABSENT when there are none, on
   * the reducer and on `rowToTicketState` alike (typed-links plan T1/T2): the
   * reducer drops the key with the last link, so the two shapes agree.
   */
  links?: TicketLink[];
  /**
   * Present ONLY while the ticket is a DRAFT (drafts spec §2.3): private to `authorId`, with no key.
   * ABSENT on every other ticket, on the reducer and on `rowToTicketState` alike (the rule `links` follows:
   * the dual-client rig's `toEqual` needs both producers to agree on shape). `ticket.published` removes it;
   * `ticket.discarded` sets `discarded: true`, so every door treats the draft as gone between the commit
   * and the erasure (`purge/discard-draft.ts`).
   */
  draft?: TicketDraft;
};

/**
 * One typed link held on a ticket's state (spec A §2.2). `from` is set only on a DRAFT's entries for links filed
 * from the other end (drafts spec R42): `{ kind, targetId: <the draft>, from: <the source> }` means "source kind
 * draft". Every entry without `from` is outbound.
 */
export type TicketLink = { kind: TicketLinkKind; targetId: string; from?: string };

/** A draft's head state: who drafted it, when, and whether they have discarded it. */
export type TicketDraft = { authorId: string; at: string; discarded?: true };

export type MembershipState = {
  kind: 'membership';
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
};

/** Entity kinds this plan does not read; later plans refine them into real shapes. */
export type OtherEntityState = {
  kind: 'workspace' | 'project' | 'workflow' | 'ticket-type';
  id: string;
};

export type EntityState = TicketState | MembershipState | OtherEntityState;

/** The entity id of a user's membership in a workspace — the cross-plan convention (Open question 4). */
export function membershipId(workspaceId: string, userId: string): string {
  return `${workspaceId}:${userId}`;
}
