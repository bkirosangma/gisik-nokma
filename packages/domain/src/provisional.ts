/**
 * PROVISIONAL — Plan 2 Task 2 replaces this file with the authoritative
 * definitions; shapes must stay byte-compatible with the coordination doc.
 */

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
export type StateCategory = 'open' | 'active' | 'terminal';

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
export type WorkflowState = {
  id: string;
  name: string;
  category: StateCategory;
  blocked?: boolean; // amendment 9: the attention strip's "blocked" bucket reads this
};

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
export type WorkflowDef = {
  id: string;
  version: number;
  name: string;
  initialStateId: string;
  states: WorkflowState[];
  transitions: { from: '*' | string; to: string; rules: unknown[] }[];
};

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
export type FieldClaim = { value: unknown; actorId: string; clientTime: string; serverTime: string };

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
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
  // Coordination doc §4 (amended twice on 2026-08-26): an entry names the
  // workflow AND version whose vocabulary its toStateId is written in.
  // require-different-user skips entries from a workflow the ticket has been
  // migrated off, then walks the rest forward from their recorded version.
  transitions: { toStateId: string; actorId: string; seq: number; workflowId: string; workflowVersion: number }[];
};

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
export type MembershipState = {
  kind: 'membership';
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
};

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
export type OtherEntityState = {
  kind: 'workspace' | 'project' | 'workflow' | 'ticket-type';
  id: string;
};

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
export type EntityState = TicketState | MembershipState | OtherEntityState;
