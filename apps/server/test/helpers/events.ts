import { newUlid, type LedgerEvent, type SubmittedEvent } from '@gisik-nokma/domain';

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
 * A valid `workflow.defined` submission for a fresh workflow entity inside an
 * existing workspace — the second entity kind the vocabulary admits, and the
 * way a test gets a second entity into one workspace now that an event type is
 * bound to the kind it is about (coordination doc §11). The payload's `id` is
 * the entity's own id, which is what the engine will later require of it.
 */
export function submittedWorkflowDefined(workspaceId: string): SubmittedEvent {
  const workflowId = newUlid();
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'workflow', id: workflowId },
    type: 'workflow.defined',
    version: 1,
    payload: {
      id: workflowId,
      version: 1,
      name: 'Basic',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [{ from: 'todo', to: 'done', rules: [] }],
    },
    actorId: newUlid(),
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
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
