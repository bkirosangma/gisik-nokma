import type { LedgerEvent } from '../../src/ledger/event-store.js';

/**
 * A fixed ledger: three workspaces, ten events, hand-built deterministic ids.
 * ULIDs are Crockford base32 (no I, L, O, U); every literal here is 26 chars
 * with a leading 0 — the determinism test asserts each against ULID_REGEX so
 * a bad literal fails loudly, not silently.
 */
export const FIXTURE_WORKSPACE_A = '01J6000000000000000000WKSA';
export const FIXTURE_WORKSPACE_B = '01J6000000000000000000WKSB';
export const FIXTURE_WORKSPACE_C = '01J6000000000000000000WKSC';
export const FIXTURE_ACTOR = '01J6000000000000000000ACTR';

function eventId(index: number): string {
  return `01J6000000000000000000EV${String(index).padStart(2, '0')}`;
}

function fixtureEvent(input: {
  index: number;         // 1-based position; drives id and both timestamps
  workspace: string;
  seq: number;
  type: 'workspace.created' | 'workspace.renamed';
  name: string;
}): LedgerEvent {
  const second = String(input.index).padStart(2, '0');
  return {
    id: eventId(input.index),
    workspaceId: input.workspace,
    entity: { kind: 'workspace', id: input.workspace },
    type: input.type,
    version: 1,
    payload: { name: input.name },
    actorId: FIXTURE_ACTOR,
    origin: 'server',
    clientTime: `2026-08-20T09:00:${second}.000Z`,
    serverTime: `2026-08-20T09:01:${second}.000Z`,
    seq: input.seq,
    // Every fixture entity IS its workspace, so the two counters coincide.
    workspaceSeq: input.seq,
  };
}

export const FIXTURE_EVENTS: readonly LedgerEvent[] = [
  fixtureEvent({ index: 1, workspace: FIXTURE_WORKSPACE_A, seq: 1, type: 'workspace.created', name: 'Convenience Corner' }),
  fixtureEvent({ index: 2, workspace: FIXTURE_WORKSPACE_A, seq: 2, type: 'workspace.renamed', name: 'Convenience Corner HQ' }),
  fixtureEvent({ index: 3, workspace: FIXTURE_WORKSPACE_A, seq: 3, type: 'workspace.renamed', name: 'CC HQ' }),
  fixtureEvent({ index: 4, workspace: FIXTURE_WORKSPACE_A, seq: 4, type: 'workspace.renamed', name: 'Corner HQ' }),
  fixtureEvent({ index: 5, workspace: FIXTURE_WORKSPACE_B, seq: 1, type: 'workspace.created', name: 'Gisik Nokma Build' }),
  fixtureEvent({ index: 6, workspace: FIXTURE_WORKSPACE_B, seq: 2, type: 'workspace.renamed', name: 'Gisik Nokma' }),
  fixtureEvent({ index: 7, workspace: FIXTURE_WORKSPACE_B, seq: 3, type: 'workspace.renamed', name: 'GN Build' }),
  fixtureEvent({ index: 8, workspace: FIXTURE_WORKSPACE_C, seq: 1, type: 'workspace.created', name: 'Personal' }),
  fixtureEvent({ index: 9, workspace: FIXTURE_WORKSPACE_C, seq: 2, type: 'workspace.renamed', name: 'Personal Errands' }),
  fixtureEvent({ index: 10, workspace: FIXTURE_WORKSPACE_C, seq: 3, type: 'workspace.renamed', name: 'Errands' }),
];
