import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, ticketKey, type SubmittedEvent } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { ticketNumbers } from '../../src/read/ticket-numbers.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { submittedWorkspaceCreated } from '../helpers/events.js';

/**
 * 13.1026 — the counter under real contention.
 *
 * The dispatch that specified the ticket key asked for this explicitly: *"a
 * mutation that lets two simultaneous creations take the same number must
 * redden something."*
 *
 * ## Why this file drives the REAL ingest rather than a fixture
 *
 * A number allocated by a helper the test itself called is not evidence about
 * the server. Every part of the property that matters lives in `commitOne`:
 * the per-workspace advisory lock, `nextWorkspaceSeq`'s `max + 1`, and the
 * `events_workspace_seq_unique` constraint behind them. A fixture that wrote
 * `workspace_seq` values directly would be asserting that the test can count.
 *
 * So this founds a workspace, founds a project and fires N creations through
 * `ingestBatch` CONCURRENTLY — all N in flight before any is awaited — and then
 * reads the numbers back out of the ledger.
 *
 * ## What a failure would look like, and why it cannot hide
 *
 * The numbers are DERIVED from `workspace_seq`, so two creations sharing a
 * number would require them to share a `workspace_seq` — which the unique
 * constraint forbids. A mutation that removed `lockWorkspace` from `commitOne`
 * lets two transactions read the same `max(workspace_seq)` under READ
 * COMMITTED; the second INSERT then violates the constraint and that creation
 * does not commit. Either outcome reddens a line below: a missing commit
 * reddens the committed-count assertion, and a shared position reddens the
 * distinct-count one.
 *
 * **The distinctness assertion is the one that would survive a weaker bug**, so
 * it is asserted on its own line rather than left to the exact `[1..N]` check —
 * which is a stronger claim but a different one.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

function service() {
  return createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
}

function submittedProjectCreated(workspaceId: string, projectId: string, actorId: string): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.created',
    version: 1,
    payload: { name: 'Shop operations', prefix: 'SO' },
    actorId,
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
  };
}

function submittedTicketCreated(
  workspaceId: string,
  projectId: string,
  ticketId: string,
  actorId: string,
): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    version: 1,
    payload: { typeId: 'task', projectId, parentId: null, title: `Ticket ${ticketId}` },
    actorId,
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
  };
}

describe('13.1026 the ticket number under concurrent creation', () => {
  it('13.1026 — N creations in flight at once take N DISTINCT numbers, and they are 1..N', async () => {
    const ingest = service();
    const ws = newUlid();
    const actor = newUlid();

    const founding = submittedWorkspaceCreated({
      workspaceId: ws,
      entity: { kind: 'workspace', id: ws },
      payload: { name: 'Convenience Corner', prefix: 'CC' },
      actorId: actor,
    });
    const [foundingResult] = await ingest.ingestBatch([founding]);
    expect(foundingResult?.status).toBe('committed');

    const projectId = newUlid();
    const [projectResult] = await ingest.ingestBatch([
      submittedProjectCreated(ws, projectId, actor),
    ]);
    expect(projectResult?.status).toBe('committed');

    const N = 8;
    const ticketIds = Array.from({ length: N }, () => newUlid());
    // ALL N IN FLIGHT BEFORE ANY IS AWAITED — the whole point. A `for … await`
    // loop would serialise them and the test would pass against an
    // implementation with no lock at all.
    const results = await Promise.all(
      ticketIds.map((ticketId) =>
        ingest.ingestBatch([submittedTicketCreated(ws, projectId, ticketId, actor)]),
      ),
    );
    expect(results.map(([result]) => result?.status)).toEqual(Array.from({ length: N }, () => 'committed'));

    const numbers = await ticketNumbers(db.pool, ws, ticketIds);
    expect(numbers.size).toBe(N);
    // DISTINCT — the property a lost lock breaks.
    expect(new Set(numbers.values()).size).toBe(N);
    // And contiguous from 1, which a shared or skipped position would break.
    expect([...numbers.values()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: N }, (_, index) => index + 1),
    );
    // The key a reader would see, composed from the two prefixes and the number.
    // Asserted PER TICKET and never against a fixture's order: WHICH ticket
    // gets 1 is decided by the race, so pinning `ticketIds[0]` to `CCSO-1`
    // would be an assertion about the scheduler rather than about the key.
    const keys = ticketIds.map((id) => ticketKey('CC', 'SO', numbers.get(id)!));
    expect(keys.every((key) => /^CCSO-[1-9][0-9]*$/.test(key))).toBe(true);
    expect(new Set(keys).size).toBe(N);
  });
});
