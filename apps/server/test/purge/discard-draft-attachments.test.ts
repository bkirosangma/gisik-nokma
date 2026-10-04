import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { LocalDiskStore } from '../../src/attachments/local-disk-store.js';
import { ObjectNotFoundError } from '../../src/attachments/object-store.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { discardDraft } from '../../src/purge/discard-draft.js';
import { deletePendingObjects } from '../../src/purge/pending-objects.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { doc, ev, insertAttachment, noteCreated, projectCreated, recordingStore, seedWorkspace, text, TYPE_ID, ticketCreated, type Base } from './world.js';

/** Drafts T9: what a discard does to the attachments uploaded from the draft and to the notes linked to it (28.183 to 28.185). */
const AUTHOR = newUlid();
const NOW = new Date('2026-10-04T06:00:00.000Z');

type World = Base & {
  P: string; D: string; C: string; PUB: string; N: string;
  keys: { d: string; c: string; pub: string; n: string };
  noteTitle: string;
};

/** A draft D with a sub-draft C and an attachment each, a published ticket PUB with one, and a note N linked to D with its own attachment. */
async function build(db: TestDatabase): Promise<World> {
  const base = await seedWorkspace(db.pool);
  const [P, D, C, PUB, N] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
  const ids = { d: newUlid(), c: newUlid(), pub: newUlid(), n: newUlid() };
  const keys = {
    d: `w/${base.WS}/a/${ids.d}`, c: `w/${base.WS}/a/${ids.c}`, pub: `w/${base.WS}/a/${ids.pub}`, n: `w/${base.WS}/a/${ids.n}`,
  };
  const noteTitle = `Linked minutes ${newUlid().slice(-8)}`;
  const draft = (id: string, parentId: string | null, title: string) =>
    ev(base, 'ticket', id, 'ticket.created', { typeId: TYPE_ID, projectId: P, parentId, title, start: 'backlog', draft: true }, AUTHOR);
  await applyCommitted(db.pool, [
    projectCreated(base, P, 'Drafts', 'DR'),
    ticketCreated(base, PUB, P, 'Published control'),
    draft(D, null, 'Quokka draft'),
    draft(C, D, 'Quokka sub-draft'),
    noteCreated(base, N, { title: noteTitle, homeProjectId: '', scope: { mode: 'workspace' }, body: doc(text('the note body survives')) }),
    ev(base, 'note', N, 'note.attached', { ticketId: D }),
  ]);
  await insertAttachment(db.pool, base, ids.d, { ticketId: D }, 'draft.pdf', keys.d);
  await insertAttachment(db.pool, base, ids.c, { ticketId: C }, 'sub-draft.pdf', keys.c);
  await insertAttachment(db.pool, base, ids.pub, { ticketId: PUB }, 'published.pdf', keys.pub);
  await insertAttachment(db.pool, base, ids.n, { noteId: N }, 'note.pdf', keys.n);
  await applyCommitted(db.pool, [ev(base, 'ticket', D, 'ticket.discarded', {}, AUTHOR)]);
  return { ...base, P, D, C, PUB, N, keys, noteTitle };
}

async function putAll(store: LocalDiskStore, keys: string[]): Promise<void> {
  for (const key of keys) await store.put(key, Readable.from(Buffer.from('bytes')), { mime: 'application/pdf', size: 5 });
}
async function stored(store: LocalDiskStore, key: string): Promise<boolean> {
  try {
    (await store.getStream(key)).destroy();
    return true;
  } catch (error) {
    if (error instanceof ObjectNotFoundError) return false;
    throw error;
  }
}
const objectKeys = async (db: TestDatabase, ws: string): Promise<string[]> =>
  (await db.pool.query<{ object_key: string }>('SELECT object_key FROM attachments WHERE workspace_id = $1 ORDER BY object_key', [ws])).rows.map((r) => r.object_key);

let shared: TestDatabase;
let storeRoot = '';
beforeAll(async () => {
  resetEntitySeqs();
  shared = await createTestDatabase();
  storeRoot = await mkdtemp(join(tmpdir(), 'gisik-draft-purge-'));
}, 60_000);
afterAll(async () => {
  await rm(storeRoot, { recursive: true, force: true });
  await shared.drop();
});

describe('28.183 discard erases what came from the draft', () => {
  it('removes the rows and the objects of the draft and its sub-draft; the published ticket\'s attachment and the note\'s own attachment keep both', async () => {
    const w = await build(shared);
    const store = new LocalDiskStore(join(storeRoot, 'a'));
    const all = [w.keys.d, w.keys.c, w.keys.pub, w.keys.n];
    await putAll(store, all);
    for (const key of all) expect(await stored(store, key), key).toBe(true); // CONTROL: every object is there to be erased
    expect(await objectKeys(shared, w.WS)).toEqual([...all].sort());

    const outcome = await discardDraft(shared.pool, w.D, { projections: buildProjectionRegistry(), store, now: NOW });
    expect(outcome).toMatchObject({ status: 'purged' });

    expect(await objectKeys(shared, w.WS)).toEqual([w.keys.n, w.keys.pub].sort());
    expect(await stored(store, w.keys.d)).toBe(false);
    expect(await stored(store, w.keys.c)).toBe(false);
    expect(await stored(store, w.keys.pub)).toBe(true);
    expect(await stored(store, w.keys.n)).toBe(true);
    const queued = await shared.pool.query('SELECT 1 FROM purge_pending_objects WHERE object_key = ANY($1)', [all]);
    expect(queued.rows).toHaveLength(0);
  });
});

describe('28.184 a store that throws on delete', () => {
  it('leaves the key queued with its error and one attempt, deletes the other, and a later drain empties the queue', async () => {
    const w = await build(shared);
    const failing = recordingStore(new Set([w.keys.d]));
    const outcome = await discardDraft(shared.pool, w.D, { projections: buildProjectionRegistry(), store: failing, now: NOW });
    expect(outcome).toMatchObject({ status: 'purged' });

    expect(await objectKeys(shared, w.WS)).toEqual([w.keys.n, w.keys.pub].sort()); // the rows are gone whatever the store did
    expect(failing.deleted).toEqual([w.keys.c]);
    const { rows } = await shared.pool.query<{ object_key: string; attempts: number; last_error: string }>(
      'SELECT object_key, attempts, last_error FROM purge_pending_objects WHERE object_key = ANY($1)',
      [[w.keys.d, w.keys.c]],
    );
    expect(rows).toEqual([{ object_key: w.keys.d, attempts: 1, last_error: `boom: ${w.keys.d}` }]);

    const working = recordingStore();
    expect(await deletePendingObjects(shared.pool, working, [w.keys.d])).toEqual({ deleted: 1, pending: 0 });
    expect(working.deleted).toEqual([w.keys.d]);
    expect((await shared.pool.query('SELECT 1 FROM purge_pending_objects WHERE object_key = $1', [w.keys.d])).rows).toHaveLength(0);
    expect(await deletePendingObjects(shared.pool, working, [w.keys.d])).toEqual({ deleted: 0, pending: 0 }); // CONTROL: nothing left to do
  });
});

describe('28.185 a linked note survives', () => {
  it('keeps its title, body and own attachment, loses the link row, and the projections verify clean', async () => {
    const w = await build(shared);
    const link = () => shared.pool.query('SELECT 1 FROM proj_note_attachments WHERE note_id = $1 AND ticket_id = $2', [w.N, w.D]);
    expect((await link()).rows).toHaveLength(1); // CONTROL: the link existed

    await discardDraft(shared.pool, w.D, { projections: buildProjectionRegistry(), store: recordingStore(), now: NOW });

    expect((await link()).rows).toHaveLength(0);
    const note = await shared.pool.query<{ title: string; body: unknown }>('SELECT title, body FROM proj_notes WHERE note_id = $1', [w.N]);
    expect(note.rows).toEqual([{ title: w.noteTitle, body: doc(text('the note body survives')) }]);
    expect((await shared.pool.query('SELECT 1 FROM attachments WHERE note_id = $1', [w.N])).rows).toHaveLength(1);
    expect(await verifyProjections({ pool: shared.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});
