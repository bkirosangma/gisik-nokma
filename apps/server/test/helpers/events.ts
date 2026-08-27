import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { LedgerEvent } from '../../src/ledger/event-store.js';

/** A valid workspace.created submission; each call invents a fresh workspace. */
export function submittedWorkspaceCreated(overrides: Partial<SubmittedEvent> = {}): SubmittedEvent {
  const workspaceId = newUlid();
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'workspace', id: workspaceId },
    type: 'workspace.created',
    version: 1,
    payload: { name: 'Convenience Corner' },
    actorId: newUlid(),
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
    ...overrides,
  };
}

/**
 * Completes a submission into a full ledger event the way ingest would.
 * `workspaceSeq` defaults to `seq`: these fixtures are workspace entities, so
 * the per-entity and per-workspace counters coincide. Tests that need them to
 * diverge — a second entity in the same workspace, or a deliberate collision —
 * pass it explicitly.
 */
export function committed(
  submitted: SubmittedEvent,
  seq: number,
  serverTime = '2026-08-20T09:00:01.000Z',
  workspaceSeq = seq,
): LedgerEvent {
  return { ...submitted, serverTime, seq, workspaceSeq };
}
