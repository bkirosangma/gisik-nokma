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
 * Plan 1 pass-through: accepts every parsed event and consults nothing.
 * Plan 2 replaces these internals with real rule evaluation (pure, no I/O —
 * all state arrives through ctx). The signature is cross-plan contract:
 * it must not change.
 */
export async function evaluateEvent(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  void env;
  void ctx;
  return { refused: false };
}
