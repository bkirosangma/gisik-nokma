import type { TicketState } from '../entity-state.js';
import { IST_DAY_REGEX } from '../ist-day.js';
import { claimedEstimate, claimedWaitForAll, DECISION_TYPE_ID } from '../ticket-types.js';
import type { WorkflowDef } from '../workflow.js';
import { hasStarted, resolutionOf, ticketRound } from './derive.js';
import type { FlowNode } from './types.js';

function dayClaim(state: TicketState, fieldId: 'startDate' | 'dueDate'): string | null {
  const value = state.fields[fieldId]?.value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const date = (value as { date?: unknown }).date;
  return typeof date === 'string' && IST_DAY_REGEX.test(date) ? date : null;
}

/**
 * The one door from a ticket's folded state to the flow code's node. Every derived fact comes from a
 * helper that already exists (`hasStarted`, `resolutionOf`, `ticketRound`), never from a re-read of
 * the raw members, so a node and the sheet cannot disagree about "started" or "Not taken".
 *
 * `flags.trashed` defaults to the soft-delete flag on the state; `flags.draft` defaults to false and
 * is set by the caller that knows the ticket is the viewer's own draft (`TicketState.draft` holds the
 * author, but only the read, T12, knows who the viewer is).
 */
export function flowNodeOf(state: TicketState, wf: WorkflowDef, flags: { trashed?: boolean; draft?: boolean } = {}): FlowNode {
  return {
    id: state.id,
    typeId: state.typeId,
    stateId: state.stateId,
    category: state.stateCategory,
    closed: (state.closed ?? null) !== null,
    trashed: flags.trashed ?? (state.deleted ?? null) !== null,
    draft: flags.draft ?? false,
    parentId: state.parentId,
    isDecision: state.typeId === DECISION_TYPE_ID,
    outcome: state.outcome ?? null,
    passes: state.passes ?? [],
    notTaken: resolutionOf(state),
    waitForAll: claimedWaitForAll(state.fields),
    started: hasStarted(state),
    rounds: ticketRound(state),
    periods: state.periods ?? [],
    explicitStart: dayClaim(state, 'startDate'),
    explicitDue: dayClaim(state, 'dueDate'),
    estimate: claimedEstimate(state.fields, 'estimate'),
    reworkEstimate: claimedEstimate(state.fields, 'reworkEstimate'),
    initialStateId: wf.initialStateId,
    firstTerminalStateId: wf.states.find((s) => s.category === 'terminal')?.id ?? null,
  };
}
