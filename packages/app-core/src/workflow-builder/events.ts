import {
  newUlid,
  type Origin,
  type PublishedWorkflowDef,
  type SubmittedEvent,
  type TicketTypeDef,
} from '@gisik-nokma/domain';
import type { WorkflowDraft } from './draft-store.js';

/** States the base version has that the draft no longer does — each needs a mapping entry or the server refuses. */
export function droppedStates(draft: WorkflowDraft): { id: string; name: string }[] {
  if (draft.base === null) return [];
  const keptIds = new Set(draft.def.states.map((state) => state.id));
  return draft.base.states.filter((state) => !keptIds.has(state.id));
}

export function buildPublishPayload(
  draft: WorkflowDraft,
  stateMapping?: Record<string, string>,
): PublishedWorkflowDef {
  const payload: PublishedWorkflowDef = {
    ...draft.def,
    version: (draft.base?.version ?? 0) + 1,
  };
  if (stateMapping !== undefined && Object.keys(stateMapping).length > 0) {
    return { ...payload, stateMapping };
  }
  return payload;
}

export function buildWorkflowDefinedEvent(input: {
  workspaceId: string;
  actorId: string;
  origin: Origin;
  payload: PublishedWorkflowDef;
}): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: input.workspaceId,
    entity: { kind: 'workflow', id: input.payload.id },
    type: 'workflow.defined',
    version: 1,
    payload: input.payload,
    actorId: input.actorId,
    origin: input.origin,
    clientTime: new Date().toISOString(),
  };
}

export function buildTicketTypeDefinedEvent(input: {
  workspaceId: string;
  actorId: string;
  origin: Origin;
  def: TicketTypeDef;
}): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: input.workspaceId,
    // Fresh entity ULID per submission; the projection folds by payload id
    // (Plan 3's convention — design decision 6).
    entity: { kind: 'ticket-type', id: newUlid() },
    type: 'ticket-type.defined',
    version: 1,
    payload: input.def,
    actorId: input.actorId,
    origin: input.origin,
    clientTime: new Date().toISOString(),
  };
}
