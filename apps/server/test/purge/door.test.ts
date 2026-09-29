import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import {
  newUlid,
  PURGE_SERVER_ONLY_REASON,
  PURGED_REASON,
  type EntityKind,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { PURGE_RULE } from '../../src/purge/check-purged.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { buildContestedClaim } from '../../src/sync/contest-coherence.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  buildTicketWorld,
  buildWorkspacePair,
  dueAt,
  noteCreated,
  recordingStore,
  TYPE_ID,
  type TicketWorld,
  type WorkspacePair,
} from './world.js';

/**
 * Spec §5.7, server half — "a device holding unsent events against a purged
 * item has them refused at the door ('This item was permanently deleted')".
 * Cases 19.140–19.143 (`test-cases/19-trash.md` §19.16), through the real
 * ingest service: `ingestClientBatch` is the client door, `ingestBatch` the
 * internal one.
 */

let db: TestDatabase;
let ingest: IngestService;
let w: TicketWorld;
let pair: WorkspacePair;
const NOTE = newUlid();

function submitted(
  workspaceId: string,
  actorId: string,
  kind: EntityKind,
  id: string,
  type: string,
  payload: unknown,
  origin: SubmittedEvent['origin'] = 'web',
): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind, id },
    type,
    version: 1,
    payload,
    actorId,
    origin,
    clientTime: '2026-09-28T10:00:00.000Z',
  };
}

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
  const projections = buildProjectionRegistry();
  ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections });
  w = await buildTicketWorld(db.pool);
  await applyCommitted(db.pool, [
    noteCreated(w, NOTE, { title: 'Live note', homeProjectId: '', scope: { mode: 'workspace' } }),
  ]);
  await purgeItem(db.pool, { kind: 'ticket', id: w.T }, {
    projections,
    store: recordingStore(),
    now: await dueAt(db.pool, 'ticket', w.T),
  });
  pair = await buildWorkspacePair(db.pool);
  await purgeItem(db.pool, { kind: 'workspace', id: pair.W1.WS }, {
    projections,
    store: recordingStore(),
    now: await dueAt(db.pool, 'workspace', pair.W1.WS),
  });
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe('19.140 only the purge records a purge', () => {
  it('refuses purge.completed at both doors; the owner’s ordinary claim commits', async () => {
    const payload = { kind: 'ticket', markedBy: w.OWNER, markedAt: '2026-09-13T10:00:00.000Z' };
    const [client] = await ingest.ingestClientBatch(
      [submitted(w.WS, w.OWNER, 'ticket', w.S1, 'purge.completed', payload)],
      w.OWNER,
    );
    expect(client).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGE_SERVER_ONLY_REASON });
    const [internal] = await ingest.ingestBatch([
      submitted(w.WS, w.OWNER, 'ticket', w.S1, 'purge.completed', payload, 'server'),
    ]);
    expect(internal).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGE_SERVER_ONLY_REASON });
    // CONTROL
    const [ok] = await ingest.ingestClientBatch(
      [submitted(w.WS, w.OWNER, 'ticket', w.S1, 'ticket.field_set', { fieldId: 'title', value: 'Renamed sibling' })],
      w.OWNER,
    );
    expect(ok?.status).toBe('committed');
  });
});

describe('19.141 claims about a purged ticket are refused', () => {
  it('refuses a field set, a comment and a child creation; a comment on the sibling commits', async () => {
    const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'late' }] }] };
    const results = await ingest.ingestClientBatch(
      [
        submitted(w.WS, w.OWNER, 'ticket', w.T, 'ticket.field_set', { fieldId: 'title', value: 'late' }),
        submitted(w.WS, w.OWNER, 'ticket', w.T, 'comment.added', { body }),
        submitted(w.WS, w.OWNER, 'ticket', newUlid(), 'ticket.created', {
          typeId: TYPE_ID,
          projectId: w.P,
          parentId: w.T,
          title: 'Orphan',
        }),
      ],
      w.OWNER,
    );
    for (const result of results) {
      expect(result).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGED_REASON });
    }
    // CONTROL
    const [ok] = await ingest.ingestClientBatch([submitted(w.WS, w.OWNER, 'ticket', w.S1, 'comment.added', { body })], w.OWNER);
    expect(ok?.status).toBe('committed');
  });
});

describe('19.142 a purged workspace answers with the purge, not a membership refusal', () => {
  it('refuses project.created in W1 with PURGED_REASON; the same in W2 commits', async () => {
    const [refused] = await ingest.ingestClientBatch(
      [submitted(pair.W1.WS, pair.U, 'project', newUlid(), 'project.created', { name: 'Back again', prefix: 'BA' })],
      pair.U,
    );
    expect(refused).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGED_REASON });
    // CONTROL
    const [ok] = await ingest.ingestClientBatch(
      [submitted(pair.W2.WS, pair.U, 'project', newUlid(), 'project.created', { name: 'Back again', prefix: 'BA' })],
      pair.U,
    );
    expect(ok?.status).toBe('committed');
  });
});

describe('19.143 the internal door refuses too, so a sync contest cannot resurrect the purged ticket', () => {
  it('refuses a contest on T and an attach of T; the same on the sibling commit', async () => {
    const contestOn = (ticketId: string) =>
      buildContestedClaim({
        originalEvent: submitted(w.WS, w.OWNER, 'ticket', ticketId, 'ticket.field_set', { fieldId: 'title', value: 'x' }),
        rule: 'workflow.transition-not-allowed',
        reason: 'That move is not allowed from here.',
        actorId: w.OWNER,
      });
    const streamOfT = async () =>
      (
        await db.pool.query<{ type: string }>(
          `SELECT type FROM events WHERE entity_kind = 'ticket' AND entity_id = $1 ORDER BY seq`,
          [w.T],
        )
      ).rows.map((row) => row.type);
    const before = await streamOfT();
    const [refused] = await ingest.ingestBatch([contestOn(w.T)]);
    expect(refused).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGED_REASON });
    expect(await streamOfT()).toEqual(before);
    expect(before).toEqual(['ticket.created', 'purge.completed']);
    const [attach] = await ingest.ingestClientBatch(
      [submitted(w.WS, w.OWNER, 'note', NOTE, 'note.attached', { ticketId: w.T })],
      w.OWNER,
    );
    expect(attach).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGED_REASON });
    // CONTROL
    const [contestOk] = await ingest.ingestBatch([contestOn(w.S1)]);
    expect(contestOk?.status).toBe('committed');
    const [attachOk] = await ingest.ingestClientBatch(
      [submitted(w.WS, w.OWNER, 'note', NOTE, 'note.attached', { ticketId: w.S1 })],
      w.OWNER,
    );
    expect(attachOk?.status).toBe('committed');
  });
});
