import type {
  EventEnvelope,
  Rule,
  TicketState,
  TicketTransitionedPayload,
  WorkflowDef,
  WorkflowState,
} from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';

/** Everything a transition rule may read. fromStateId is the resolved (post version-mapping) current state. */
export type TransitionRuleInput = {
  env: EventEnvelope;
  ctx: EngineContext;
  ticket: TicketState;
  def: WorkflowDef;
  toState: WorkflowState;
  fromStateId: string;
  payload: TicketTransitionedPayload;
};

export type RuleEvaluator<R extends Rule = Rule> = (
  rule: R,
  input: TransitionRuleInput,
) => Promise<Accept | Refusal>;
