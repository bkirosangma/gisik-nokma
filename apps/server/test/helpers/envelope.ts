import { newUlid, type EventEnvelope, type LedgerEvent } from '@gisik-nokma/domain';

/**
 * Builds a LedgerEvent for tests that need one directly — a projection called
 * by hand, or a ledger seeded through `insertEvent` — without going through
 * ingest.
 *
 * Distinct from `./events.ts`'s `committed()`, which completes a
 * `SubmittedEvent` a test already has. This one INVENTS the whole event from a
 * few named fields, which is what a projection test wants: it is describing a
 * claim, not a submission.
 *
 * ## The two counters are deliberately never equal
 *
 * `seq` is the per-entity sequence; `workspaceSeq` is the per-workspace stream
 * cursor (coordination §18). They coincide only when the entity IS the
 * workspace, and membership and project entities are not — proj-workflows.test.ts
 * spells out the hazard: a fixture that lets them coincide makes an assertion
 * about the stored position pass whether the code stored `event.seq` or
 * `event.workspaceSeq`. So `seq` counts per entity from 1 while `workspaceSeq`
 * counts globally from `WORKSPACE_SEQ_BASE`, and no fixture event ever gets the
 * same value for both.
 *
 * `workspaceSeq` is global rather than per workspace on purpose too: a globally
 * monotonic number is unique inside every workspace, so it satisfies the
 * ledger's `UNIQUE (workspace_id, workspace_seq)` in every workspace at once,
 * and it puts a whole test's events in a single total order the test can reason
 * about.
 *
 * ## Times
 *
 * `serverTime` is derived from `workspaceSeq`, so every fixture event lands on
 * its own instant and a test can tell WHICH event last wrote a row rather than
 * only that some event did. `clientTime` is one second earlier — a claim made
 * before it was received, which is the ordinary case.
 *
 * Both are ISO-8601 `Z` strings at the domain boundary and land in `timestamptz`
 * columns (owner decision 2026-08-20). A test reading one back gets the moment,
 * not the label: compare against `new Date(event.serverTime)`, never against a
 * rendered string.
 */
const WORKSPACE_SEQ_BASE = 1000;

/** 2026-08-20T09:00:00.000Z, the fixture epoch the rest of the suite writes by hand. */
const SERVER_TIME_EPOCH_MS = Date.UTC(2026, 7, 20, 9, 0, 0);

let workspaceSeqCounter = WORKSPACE_SEQ_BASE;
const entitySeqs = new Map<string, number>();

/**
 * Restarts both counters. Call it in a `beforeEach` alongside whatever empties
 * the tables, so one test file's events do not inherit another test's numbering
 * when exact values are asserted.
 */
export function resetTestSequences(): void {
  workspaceSeqCounter = WORKSPACE_SEQ_BASE;
  entitySeqs.clear();
}

export function testEnvelope(
  fields: Partial<LedgerEvent> &
    Pick<EventEnvelope, 'workspaceId' | 'entity' | 'type' | 'payload' | 'actorId'>,
): LedgerEvent {
  const entityKey = `${fields.entity.kind}:${fields.entity.id}`;
  const seq = (entitySeqs.get(entityKey) ?? 0) + 1;
  entitySeqs.set(entityKey, seq);
  workspaceSeqCounter += 1;
  const workspaceSeq = workspaceSeqCounter;
  const serverTime = new Date(SERVER_TIME_EPOCH_MS + workspaceSeq * 1000).toISOString();
  const clientTime = new Date(SERVER_TIME_EPOCH_MS + workspaceSeq * 1000 - 1000).toISOString();

  return {
    id: newUlid(),
    version: 1,
    origin: 'web',
    clientTime,
    serverTime,
    seq,
    workspaceSeq,
    ...fields,
  };
}
