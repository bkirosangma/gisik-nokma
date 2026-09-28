import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { newUlid, PURGED_REASON, type SubmittedEvent } from '@gisik-nokma/domain';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { PURGE_RULE } from '../../src/purge/check-purged.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { createSyncService, type SyncService } from '../../src/sync/sync-service.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  buildProjectWorld,
  buildTicketWorld,
  dueAt,
  ev,
  recordingStore,
  TYPE_ID,
  type ProjectWorld,
  type TicketWorld,
} from './world.js';

/**
 * Trash series Plan 3, Task 2 (deviation D10) — Plan 2's door, reached the way
 * an offline device reaches it: through the sync service, whose refused ticket
 * claims become server-appended contests on the claim's OWN entity. Wired as
 * `apps/server/test/dual-client/rig.ts` wires it: the gated door for the claim,
 * `ingestBatch` as the named internal append.
 */

let db: TestDatabase;
let sync: SyncService;
let w: TicketWorld;
let pw: ProjectWorld;

function claim(workspaceId: string, actorId: string, ticketId: string, type: string, payload: unknown): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type,
    version: 1,
    payload,
    actorId,
    origin: 'desktop',
    clientTime: '2026-09-29T10:00:00.000Z',
  };
}

async function typesOn(entityId: string): Promise<string[]> {
  const { rows } = await db.pool.query<{ type: string }>(
    'SELECT type FROM events WHERE entity_id = $1 ORDER BY seq',
    [entityId],
  );
  return rows.map((row) => row.type);
}

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
  const projections = buildProjectionRegistry();
  const ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections });
  sync = createSyncService({ pool: db.pool, ingest, serverAppend: (events) => ingest.ingestBatch(events) });
  w = await buildTicketWorld(db.pool);
  pw = await buildProjectWorld(db.pool);
  // The worlds seed the owner on no project except the doomed one, and the
  // workspace-owner role alone cannot create a ticket (`permission.role`). The
  // controls below need a legal creator, so the owner joins the surviving
  // projects. Applied BEFORE either purge: `applyCommitted` numbers events from
  // its own counter, which a purge's server-written events would leave behind.
  await applyCommitted(db.pool, [
    ev(w, 'project', w.P, 'project.member_added', { userId: w.OWNER, projectAdmin: true }),
    ev(pw, 'project', pw.Q, 'project.member_added', { userId: pw.OWNER, projectAdmin: true }),
  ]);
  await purgeItem(db.pool, { kind: 'ticket', id: w.T }, {
    projections,
    store: recordingStore(),
    now: await dueAt(db.pool, 'ticket', w.T),
  });
  await purgeItem(db.pool, { kind: 'project', id: pw.P2 }, {
    projections,
    store: recordingStore(),
    now: await dueAt(db.pool, 'project', pw.P2),
  });
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe('19.165 a creation under a purged parent is refused, not contested', () => {
  it('19.165 answers refused with PURGED_REASON and writes nothing for the new ticket; a legal creation in the same project commits', async () => {
    const child = newUlid();
    const [answer] = await sync.processBatch(w.OWNER, [
      claim(w.WS, w.OWNER, child, 'ticket.created', {
        typeId: TYPE_ID,
        projectId: w.P,
        parentId: w.T,
        title: 'Written offline',
      }),
    ]);
    expect(answer).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGED_REASON });
    expect(await typesOn(child)).toEqual([]);
    // CONTROL
    const [ok] = await sync.processBatch(w.OWNER, [
      claim(w.WS, w.OWNER, newUlid(), 'ticket.created', {
        typeId: TYPE_ID,
        projectId: w.P,
        // Top level: the world's one ticket type ranks itself (`hierarchy.rank`
        // refuses a Task under a Task), so "under the live sibling" cannot commit.
        parentId: null,
        title: 'Beside the survivor',
      }),
    ]);
    expect(ok).toMatchObject({ status: 'committed' });
  });
});

describe('19.166 a container named in the payload is enough', () => {
  it('19.166 refuses a creation in the purged project and a reparent under the purged ticket; a creation in the kept project commits', async () => {
    const orphan = newUlid();
    const [inProject] = await sync.processBatch(pw.OWNER, [
      claim(pw.WS, pw.OWNER, orphan, 'ticket.created', {
        typeId: TYPE_ID,
        projectId: pw.P2,
        parentId: null,
        title: 'Offline, in a purged project',
      }),
    ]);
    expect(inProject).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGED_REASON });
    expect(await typesOn(orphan)).toEqual([]);

    const before = await typesOn(w.S2);
    const [reparent] = await sync.processBatch(w.OWNER, [
      claim(w.WS, w.OWNER, w.S2, 'ticket.reparented', { newParentId: w.T }),
    ]);
    expect(reparent).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGED_REASON });
    expect(await typesOn(w.S2)).toEqual(before);
    // CONTROL
    const [kept] = await sync.processBatch(pw.OWNER, [
      claim(pw.WS, pw.OWNER, newUlid(), 'ticket.created', {
        typeId: TYPE_ID,
        projectId: pw.Q,
        parentId: null,
        title: 'In the kept project',
      }),
    ]);
    expect(kept).toMatchObject({ status: 'committed' });
  });
});
