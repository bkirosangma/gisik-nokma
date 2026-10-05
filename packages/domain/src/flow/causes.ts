import { z } from 'zod';
import { ulidString } from '../envelope.js';

/**
 * The three flow causes (workflow-timeline-graphs spec AP-2, PS-4, PS-5; wtg2 T8). The flow writes them on the ordinary
 * `ticket.transitioned` / `ticket.closed` / `ticket.reopened` events it files as `SYSTEM_ACTOR_FLOW`, so every existing
 * reader already understands the move; the cause says why it happened.
 *
 * - `led-to`: a promotion out of Backlog; `triggeredBy` is the actor of the event that satisfied the condition.
 * - `reopened-by-flow`: a loop reset; `decidedBy` and `decisionEventId` name the choice that caused it.
 * - `branch-not-taken`: a close because the Decision went another way.
 *
 * Unlike the old `reopened-for-child`, these are not opaque: they unlock moves no workflow declares, so the engine refuses
 * one from anyone but the flow actor (`cause.forged`, `rule-engine/src/checks/flow-cause.ts`). The outcome and the label
 * are plain non-empty strings here, not `linkLabelSchema`: the flow copies them from labels `ticket.link_added` already
 * validated, and importing `events/ticket-events.ts` from `workflow.ts` (which imports this file) would close a cycle.
 */
const decisionCause = {
  decisionTicketId: ulidString,
  outcome: z.string().min(1),
  pass: z.number().int().min(1),
  decidedBy: ulidString,
  decisionEventId: ulidString,
};

export const ledToCauseSchema = z
  .object({ kind: z.literal('led-to'), sourceTicketId: ulidString, label: z.string().min(1).optional(), triggeredBy: ulidString })
  .strict();
export const reopenedByFlowCauseSchema = z.object({ kind: z.literal('reopened-by-flow'), ...decisionCause }).strict();
export const branchNotTakenCauseSchema = z.object({ kind: z.literal('branch-not-taken'), ...decisionCause }).strict();
export const flowCauseSchema = z.discriminatedUnion('kind', [ledToCauseSchema, reopenedByFlowCauseSchema, branchNotTakenCauseSchema]);
export type FlowCause = z.infer<typeof flowCauseSchema>;

export const isFlowCause = (c: unknown): c is FlowCause => flowCauseSchema.safeParse(c).success;

/** What a viewer is served: the kind, never the ids (spec FL-1: they may name a ticket or a person this viewer cannot see). */
export const viewerSafeCause = (c: FlowCause): { kind: FlowCause['kind'] } => ({ kind: c.kind });
