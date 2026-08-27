import type { EntityKind } from './envelope.js';

/**
 * The head pointer for an entity — exactly what proj_entity_heads materialises.
 * Named EntityHead, not EntityState: the coordination doc (§4) reserves
 * EntityState for Plan 2's discriminated union of per-kind entity states.
 */
export type EntityHead = {
  kind: EntityKind;
  id: string;
  headSeq: number;        // seq of the newest committed event for this entity
  headEventId: string;
  headEventType: string;
};

// StateCategory, WorkflowState and WorkflowDef live in ./workflow.js;
// TicketState and the rest of the EntityState union live in
// ./entity-state.js. Both are the authoritative definitions (coordination
// doc §4) — the PROVISIONAL stubs they replaced are gone.
