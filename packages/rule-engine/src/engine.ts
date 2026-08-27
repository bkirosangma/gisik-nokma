import type { EntityState, EventEnvelope, TicketState, WorkflowDef } from '@gisik-nokma/domain';

export type Refusal = { refused: true; rule: string; reason: string }; // reason: plain language, names the rule
export type Accept = { refused: false };
export type Verdict = Accept | Refusal;

export type EngineContext = {
  getEntityState(kind: EventEnvelope['entity']['kind'], id: string): Promise<EntityState | null>;
  getChildrenStates(ticketId: string): Promise<TicketState[]>;
  getWorkflowDef(workflowId: string, version?: number): Promise<WorkflowDef | null>;
};

/**
 * `evaluateEvent` used to live here as Plan 1's pass-through. Plan 2 replaced
 * it with the real dispatcher in `./evaluate.js`; the types above stayed,
 * because they are what the server, the fixture harness and every rule module
 * bind to. The signature Plan 1 froze is unchanged and remains cross-plan
 * contract: pure, no I/O, all state arrives through `ctx`.
 */
