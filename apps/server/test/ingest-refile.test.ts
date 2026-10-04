import { describe, expect, it } from 'vitest';
import { newUlid, PURGE_RULE, type LedgerEvent, type SubmittedEvent } from '@gisik-nokma/domain';
import { payloadIds } from '../src/purge/check-purged.js';
import { buildTestApp } from './helpers/app.js';
import { applyCommitted, resetEntitySeqs } from './helpers/apply.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { dueAt, ev, projectCreated, recordingStore, seedWorkspace, TYPE_ID } from './purge/world.js';
import { DRAFT_LINK_REFILE_REFUSED_RULE } from '../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { purgeItem } from '../src/purge/purge-item.js';

const D = '01J9GMKD000000000000000000';
const S = '01J9GMKS000000000000000000';

describe('28.116 payloadIds names the source of a from-form link', () => {
  it('names target and from for both types; a plain link names the target alone', () => {
    for (const type of ['ticket.link_added', 'ticket.link_removed']) {
      expect(payloadIds(type, { kind: 'blocks', targetId: D, from: S }), type).toEqual([['ticket', D], ['ticket', S]]);
      expect(payloadIds(type, { kind: 'blocks', targetId: D }), type).toEqual([['ticket', D]]); // CONTROL
    }
  });

  it('names a pending child beside the new parent (28.128); a plain reparent names the parent alone', () => {
    expect(payloadIds('ticket.reparented', { newParentId: D, childId: S })).toEqual([['ticket', D], ['ticket', S]]);
    expect(payloadIds('ticket.reparented', { newParentId: D })).toEqual([['ticket', D]]); // CONTROL
  });
});

/** Erase a ticket exactly as `purge-comment-edits.test.ts:38-39` does: trash it, mark it, purge it at its due time. */
async function eraseTicket(db: TestDatabase, base: Parameters<typeof ev>[0], id: string): Promise<void> {
  await applyCommitted(db.pool, [ev(base, 'ticket', id, 'ticket.deleted', {}), ev(base, 'ticket', id, 'purge.marked', {})]);
  await purgeItem(
    db.pool,
    { kind: 'ticket', id },
    { projections: buildProjectionRegistry(), store: recordingStore(), now: await dueAt(db.pool, 'ticket', id) },
  );
}

/** A published S ("Ice maker"), a published S2 and two drafts D1, D2 by one author, each draft holding a from link. */
async function linkedDrafts(db: TestDatabase) {
  resetEntitySeqs();
  const base = await seedWorkspace(db.pool);
  const P = newUlid();
  const author = newUlid();
  const [s, s2, d1, d2] = [newUlid(), newUlid(), newUlid(), newUlid()];
  await applyCommitted(db.pool, [
    projectCreated(base, P, 'Refile', 'RF'),
    ev(base, 'ticket', s, 'ticket.created', { typeId: TYPE_ID, projectId: P, parentId: null, title: 'Ice maker' }, author),
    ev(base, 'ticket', s2, 'ticket.created', { typeId: TYPE_ID, projectId: P, parentId: null, title: 'Compressor' }, author),
    ...[d1, d2].map((id) =>
      ev(base, 'ticket', id, 'ticket.created', { typeId: TYPE_ID, projectId: P, parentId: null, title: `d ${id}`, start: 'backlog', draft: true }, author),
    ),
    ev(base, 'ticket', d1, 'ticket.link_added', { kind: 'blocks', targetId: d1, from: s }, author),
    ev(base, 'ticket', d2, 'ticket.link_added', { kind: 'blocks', targetId: d2, from: s2 }, author),
  ]);
  const submit = (type: string, id: string, payload: unknown): SubmittedEvent => ({
    id: newUlid(), workspaceId: base.WS, entity: { kind: 'ticket', id }, type, version: 1, payload,
    actorId: author, origin: 'web', clientTime: '2026-10-04T06:00:00.000Z',
  });
  const publish = (id: string) => submit('ticket.published', id, { projectId: P });
  return { base, P, author, s, s2, d1, d2, submit, publish };
}

describe('28.123 S in the trash, and S erased', () => {
  it('refuses a publish whose source is trashed, naming it by title, and succeeds once it is restored', async () => {
    const db = await createTestDatabase();
    try {
      const { app, ingest } = buildTestApp(db);
      await app.ready();
      const x = await linkedDrafts(db);
      expect((await ingest.ingestBatch([x.submit('ticket.deleted', x.s, {})]))[0]?.status).toBe('committed');
      const [refused] = await ingest.ingestBatch([x.publish(x.d1)]);
      expect(refused).toMatchObject({
        status: 'refused',
        rule: DRAFT_LINK_REFILE_REFUSED_RULE,
        reason: expect.stringMatching(/^The link from "Ice maker" to this draft could not be filed there: /),
      });
      expect((await db.pool.query(`SELECT 1 FROM events WHERE type = 'ticket.published' AND entity_id = $1`, [x.d1])).rows).toHaveLength(0);

      expect((await ingest.ingestBatch([x.submit('ticket.restored', x.s, {})]))[0]?.status).toBe('committed');
      expect((await ingest.ingestBatch([x.publish(x.d1)]))[0]?.status).toBe('committed'); // CONTROL: same publish, source restored
      await app.close();
    } finally {
      await db.drop();
    }
  });

  it('skips an erased source: the publish succeeds, files nothing, and a new from link naming it is purge.erased', async () => {
    const db = await createTestDatabase();
    try {
      const { app, ingest } = buildTestApp(db);
      await app.ready();
      const x = await linkedDrafts(db);
      await eraseTicket(db, x.base, x.s);
      const [published] = await ingest.ingestBatch([x.publish(x.d1)]);
      expect(published?.status).toBe('committed');
      expect((await db.pool.query(`SELECT 1 FROM events WHERE entity_id = $1 AND type = 'ticket.link_added'`, [x.s])).rows).toHaveLength(0);
      const [again] = await ingest.ingestBatch([x.submit('ticket.link_added', x.d2, { kind: 'relates', targetId: x.d2, from: x.s })]);
      expect(again).toMatchObject({ status: 'refused', rule: PURGE_RULE });
      await app.close();
    } finally {
      await db.drop();
    }
  });
});

describe('28.125 the listeners hear the publish and then each re-filed event, after the COMMIT', () => {
  it('in order on a publish; nothing for a publish or a set that is refused', async () => {
    const db = await createTestDatabase();
    try {
      const { app, ingest } = buildTestApp(db);
      await app.ready();
      const x = await linkedDrafts(db);
      const heard: Array<[string, string]> = [];
      const stop = ingest.onEventCommitted((e: LedgerEvent) => heard.push([e.type, e.entity.id]));

      expect((await ingest.ingestBatch([x.publish(x.d1)]))[0]?.status).toBe('committed');
      expect(heard).toEqual([['ticket.published', x.d1], ['ticket.link_added', x.s]]);

      // a refused re-file: S2 is trashed, so the set [D2] rolls back and nobody hears anything
      expect((await ingest.ingestBatch([x.submit('ticket.deleted', x.s2, {})]))[0]?.status).toBe('committed');
      heard.length = 0;
      const outcome = await ingest.ingestAtomic([x.publish(x.d2)]);
      expect(outcome).toMatchObject({ status: 'rolled-back', index: 0, result: { status: 'refused', rule: DRAFT_LINK_REFILE_REFUSED_RULE } });
      expect(heard).toEqual([]);
      // and the single path: the same refused publish is heard by nobody either
      expect((await ingest.ingestBatch([x.publish(x.d2)]))[0]).toMatchObject({ status: 'refused', rule: DRAFT_LINK_REFILE_REFUSED_RULE });
      expect(heard).toEqual([]);
      stop();
      await app.close();
    } finally {
      await db.drop();
    }
  });
});

describe('28.128 an erased pending child', () => {
  it('is skipped at publish, not refused; a new childId naming it is purge.erased', async () => {
    // p11 N16 (28.128): C is D1's pending child, then C is erased; D1's publish succeeds and files nothing on C
    const db = await createTestDatabase();
    try {
      const { app, ingest } = buildTestApp(db);
      await app.ready();
      const x = await linkedDrafts(db);
      const c = newUlid();
      await applyCommitted(db.pool, [
        ev(x.base, 'ticket', c, 'ticket.created', { typeId: TYPE_ID, projectId: x.P, parentId: null, title: 'Pending child' }, x.author),
        ev(x.base, 'ticket', x.d1, 'ticket.reparented', { newParentId: x.d1, childId: c }, x.author),
      ]);
      await eraseTicket(db, x.base, c);
      expect((await ingest.ingestBatch([x.publish(x.d1)]))[0]?.status).toBe('committed');
      expect((await db.pool.query(`SELECT 1 FROM events WHERE entity_id = $1 AND type = 'ticket.reparented'`, [c])).rows).toHaveLength(0);
      // the plan's kill (e): `payloadIds` names `childId`, so a new hold naming the erased C is refused at the purge check
      const [again] = await ingest.ingestBatch([x.submit('ticket.reparented', x.d2, { newParentId: x.d2, childId: c })]);
      expect(again).toMatchObject({ status: 'refused', rule: PURGE_RULE });
      await app.close();
    } finally {
      await db.drop();
    }
    // CONTROL: 28.128's publish leg (routes/draft-relations.test.ts), the same shape with C live, files exactly one follower on C
  });
});
