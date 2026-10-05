import type { SubmittedEvent } from '@gisik-nokma/domain';
import type { MakeSubmitted } from '../submit.js';

/**
 * Planner ruling A (2026-10-04): the one way the app places a ticket under a parent. A draft parent holds a published
 * child on ITS OWN stream (`childId`, spec R4, drafts T6 Step 5a); the child's stream never names a draft (owner
 * ruling O1). A published parent files the ordinary `ticket.reparented` on the child's stream.
 */
export function placeUnderEvent(
  make: MakeSubmitted,
  workspaceId: string,
  p: { parentId: string; parentIsDraft: boolean; childId: string },
): SubmittedEvent {
  return p.parentIsDraft
    ? make({ workspaceId, entity: { kind: 'ticket', id: p.parentId }, type: 'ticket.reparented', payload: { newParentId: p.parentId, childId: p.childId } })
    : make({ workspaceId, entity: { kind: 'ticket', id: p.childId }, type: 'ticket.reparented', payload: { newParentId: p.parentId } });
}
