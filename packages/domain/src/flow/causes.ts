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

/**
 * A flow cause as the History route serves it to a viewer who cannot see the ticket it names (wtg2 T17, AMEND 2): the
 * ticket id and the person are NULL, their keys kept, as `withholdEvent` serves a hidden link target (`targetId: null`)
 * and MCP's `redactedPayload` reads a null as "a ticket you can't see" / "someone you can't see". Only the keys the
 * kind has: a `led-to` cause gains no decision keys. The kind, the label or outcome, the pass and the opaque decision
 * event id stay (History pairs a reset by it).
 */
export type WithheldFlowCause =
  | { kind: 'led-to'; sourceTicketId: null; label?: string; triggeredBy: null }
  | { kind: 'reopened-by-flow' | 'branch-not-taken'; decisionTicketId: null; outcome: string; pass: number; decidedBy: null; decisionEventId: string };

/**
 * The SERVED shape as a schema (wtg-flow-cause-withhold, planner ruling 2026-10-06 03:49, Q1 = A): what every server door
 * hands a viewer who cannot see the cause's ticket (`withholdFlowCause`, `visibility/withhold-link-targets.ts`). Only a
 * client's fold reads it (`ticket-state.ts`, `servedPayload`): the ingest door parses with the vocabulary's strict
 * payload schemas, which keep `flowCauseSchema`'s ULIDs, so no client can FILE a nulled cause (29.446). Each arm is
 * strict, as `flowCauseSchema`'s are; the members the kind keeps are bounded as there.
 */
const withheldDecision = {
  decisionTicketId: z.null(),
  outcome: z.string().min(1),
  pass: z.number().int().min(1),
  decidedBy: z.null(),
  decisionEventId: ulidString,
};
export const withheldFlowCauseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('led-to'), sourceTicketId: z.null(), label: z.string().min(1).optional(), triggeredBy: z.null() }).strict(),
  z.object({ kind: z.literal('reopened-by-flow'), ...withheldDecision }).strict(),
  z.object({ kind: z.literal('branch-not-taken'), ...withheldDecision }).strict(),
]);
export const isWithheldFlowCause = (c: unknown): c is WithheldFlowCause => withheldFlowCauseSchema.safeParse(c).success;

export function withholdCauseTicket(cause: FlowCause): WithheldFlowCause {
  if (cause.kind === 'led-to') return { kind: 'led-to', sourceTicketId: null, ...(cause.label === undefined ? {} : { label: cause.label }), triggeredBy: null };
  return { kind: cause.kind, decisionTicketId: null, outcome: cause.outcome, pass: cause.pass, decidedBy: null, decisionEventId: cause.decisionEventId };
}
