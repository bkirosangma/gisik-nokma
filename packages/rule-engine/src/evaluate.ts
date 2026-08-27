import type { EventEnvelope } from '@gisik-nokma/domain';
import { evaluateWorkflowDefined } from './workflow-defined.js';
import type { Accept, EngineContext, Refusal } from './engine.js';

/**
 * The rule engine. Envelope-level checks (shape, unknown event type, ULID,
 * sequencing) belong to ingest (Plan 1) and are NOT repeated here. This plan
 * handles workflow.defined and (from Task 6) ticket.transitioned; every other
 * event type passes through — later plans add their own cases.
 */
export async function evaluateEvent(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  switch (env.type) {
    case 'workflow.defined':
      return evaluateWorkflowDefined(env, ctx);
    default:
      return { refused: false };
  }
}
