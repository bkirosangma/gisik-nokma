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
};

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
