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

// TicketState, WorkflowDef, WorkflowState, and StateCategory live in
// ./provisional.ts as PROVISIONAL stubs until Plan 2's domain tasks land
// the authoritative definitions (coordination doc §4).
