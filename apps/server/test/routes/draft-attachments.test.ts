import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { draftNotAllowedReason, newUlid } from '@gisik-nokma/domain';
import { getAttachment } from '../../src/attachments/attachment-repo.js';
import { LocalDiskStore } from '../../src/attachments/local-disk-store.js';
import { PERMISSION_VISIBILITY_RULE, TICKET_NOT_VISIBLE_REASON } from '../../src/permissions/check-permission.js';
import { door, PNG, uploadFile } from '../helpers/door.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

let db: TestDatabase;
let read: ReadWorld;
let storeRoot = '';
let store: LocalDiskStore;
beforeAll(async () => {
  db = await createTestDatabase();
  storeRoot = await mkdtemp(join(tmpdir(), 'gisik-draft-att-'));
  store = new LocalDiskStore(storeRoot);
  read = await buildReadTestApp(db, { store });
}, 120_000);
afterAll(async () => {
  await read.app.close();
  await rm(storeRoot, { recursive: true, force: true });
  await db.drop();
});

const WS = (): string => read.world.workspaceId;
const PROJECT = (): string => read.world.projectId;
const doc = (word: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: word }] }] });

/** A draft by `member`, born through the door. */
async function draft(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  expect(
    await door(read, 'member', 'ticket', id, 'ticket.created', {
      typeId: 'task', projectId: PROJECT(), parentId: null, title: `Quokka ${id.slice(-6)}`, start: 'backlog', draft: true, ...extra,
    }),
  ).toMatchObject({ status: 'committed' });
}
async function published(id: string): Promise<void> {
  expect(
    await door(read, 'owner', 'ticket', id, 'ticket.created', { typeId: 'task', projectId: PROJECT(), parentId: null, title: `Real ${id.slice(-6)}` }),
  ).toMatchObject({ status: 'committed' });
}
const list = (role: ReadRole, ticketId: string) =>
  read.app.inject({ method: 'GET', url: `/v1/workspaces/${WS()}/tickets/${ticketId}/attachments`, headers: read.authOf(role) });
const download = (role: ReadRole, attachmentId: string) =>
  read.app.inject({ method: 'GET', url: `/v1/attachments/${attachmentId}`, headers: read.authOf(role) });
const rowsOf = async (ticketId: string): Promise<number> =>
  (await db.pool.query('SELECT 1 FROM attachments WHERE ticket_id = $1', [ticketId])).rows.length;
async function uploaded(role: ReadRole, ticketId: string): Promise<string> {
  const res = await uploadFile(read, role, ticketId);
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { attachmentId: string }).attachmentId;
}

describe('28.180 the attachment doors on a draft (G10)', () => {
  it('the author uploads, lists and downloads; everyone else gets the unknown-ticket answer on all three, and adds nothing; CONTROL: a published ticket serves the owner', async () => {
    const d = newUlid();
    await draft(d);
    const attachmentId = await uploaded('member', d);
    const mine = await list('member', d);
    expect(mine.statusCode).toBe(200);
    expect((mine.json() as { attachments: Array<{ attachmentId: string }> }).attachments.map((a) => a.attachmentId)).toEqual([attachmentId]);
    const bytes = await download('member', attachmentId);
    expect(bytes.statusCode).toBe(200);
    expect(bytes.rawPayload.equals(PNG)).toBe(true);

    const ghost = newUlid();
    for (const role of ['owner', 'admin', 'outsider', 'guest', 'projectLead', 'stranger'] as const) {
      const up = await uploadFile(read, role, d);
      const upGhost = await uploadFile(read, role, ghost);
      expect(up.statusCode, `${role} upload`).toBe(404);
      expect(up.json(), `${role} upload`).toEqual(upGhost.json());
      const ls = await list(role, d);
      const lsGhost = await list(role, ghost);
      expect(ls.statusCode, `${role} list`).toBe(404);
      expect(ls.json(), `${role} list`).toEqual(lsGhost.json());
      const dl = await download(role, attachmentId);
      const dlGhost = await download(role, newUlid());
      expect(dl.statusCode, `${role} download`).toBe(404);
      expect(dl.json(), `${role} download`).toEqual(dlGhost.json());
    }
    expect(await rowsOf(d)).toBe(1); // nobody else's attempt left a row

    const p = newUlid();
    await published(p);
    const pid = await uploaded('owner', p);
    expect((await list('owner', p)).statusCode).toBe(200);
    expect((await download('owner', pid)).statusCode).toBe(200);
  });
});

describe('28.181 recording it, and what stays closed (R6, R61)', () => {
  it('attachment.added commits for the author and is permission.visibility for anyone else; a comment on the draft is draft.not-allowed; CONTROL: the owner does both on a published ticket', async () => {
    const d = newUlid();
    await draft(d);
    const attachmentId = await uploaded('member', d);
    const row = await getAttachment(db.pool, attachmentId);
    const added = { kind: 'upload', attachmentId, filename: row?.filename, mime: row?.mime, size: row?.size, sha256: row?.sha256 };

    expect(await door(read, 'owner', 'ticket', d, 'attachment.added', added)).toMatchObject({
      status: 'refused', rule: PERMISSION_VISIBILITY_RULE, reason: TICKET_NOT_VISIBLE_REASON,
    });
    expect(await door(read, 'member', 'ticket', d, 'attachment.added', added)).toMatchObject({ status: 'committed' });
    expect(await door(read, 'member', 'ticket', d, 'comment.added', { body: doc('hello') })).toMatchObject({
      status: 'refused', rule: 'draft.not-allowed', reason: draftNotAllowedReason('comment.added'),
    });

    const p = newUlid();
    await published(p);
    const pid = await uploaded('owner', p);
    const prow = await getAttachment(db.pool, pid);
    expect(
      await door(read, 'owner', 'ticket', p, 'attachment.added', { kind: 'upload', attachmentId: pid, filename: prow?.filename, mime: prow?.mime, size: prow?.size, sha256: prow?.sha256 }),
    ).toMatchObject({ status: 'committed' });
    expect(await door(read, 'owner', 'ticket', p, 'comment.added', { body: doc('hello') })).toMatchObject({ status: 'committed' });
  });
});

describe('28.182 publish keeps them (R57)', () => {
  it('leaves rows and objects as they were; the owner then lists, downloads and sees attachment.added in the history; CONTROL: before the publish the owner got the unknown-ticket answer on the list and the history', async () => {
    const d = newUlid();
    await draft(d);
    const attachmentId = await uploaded('member', d);
    const row = await getAttachment(db.pool, attachmentId);
    expect(
      await door(read, 'member', 'ticket', d, 'attachment.added', {
        kind: 'upload', attachmentId, filename: row?.filename, mime: row?.mime, size: row?.size, sha256: row?.sha256,
      }),
    ).toMatchObject({ status: 'committed' });
    const events = (role: ReadRole) =>
      read.app.inject({ method: 'GET', url: `/v1/workspaces/${WS()}/tickets/${d}/events`, headers: read.authOf(role) });
    expect((await list('owner', d)).statusCode).toBe(404);
    expect((await events('owner')).statusCode).toBe(404);

    const before = await db.pool.query('SELECT id, ticket_id, object_key, filename, size, sha256 FROM attachments WHERE ticket_id = $1', [d]);
    expect(await door(read, 'member', 'ticket', d, 'ticket.published', { projectId: PROJECT() })).toMatchObject({ status: 'committed' });
    const after = await db.pool.query('SELECT id, ticket_id, object_key, filename, size, sha256 FROM attachments WHERE ticket_id = $1', [d]);
    expect(after.rows).toEqual(before.rows);
    expect(before.rows).toHaveLength(1);
    (await store.getStream(row?.objectKey ?? '')).destroy(); // still in the store

    const seen = await list('owner', d);
    expect(seen.statusCode).toBe(200);
    expect((seen.json() as { attachments: Array<{ attachmentId: string }> }).attachments.map((a) => a.attachmentId)).toEqual([attachmentId]);
    expect((await download('owner', attachmentId)).rawPayload.equals(PNG)).toBe(true);
    const history = await events('owner');
    expect(history.statusCode).toBe(200);
    expect((history.json() as { events: Array<{ type: string }> }).events.map((e) => e.type)).toContain('attachment.added');
  });
});

describe('28.190 the number the discard confirm states (R60)', () => {
  it('carries attachmentCount per draft: uploads raise it, a sub-draft counts on itself, none says 0; CONTROL: a published ticket is not listed', async () => {
    const [parent, child, bare, live] = [newUlid(), newUlid(), newUlid(), newUlid()];
    await draft(parent, { typeId: 'epic' });
    await draft(child, { parentId: parent });
    await draft(bare);
    // `live` is the MEMBER's own ticket, born a draft and published, with a file: an owner-born ticket is never the
    // member's draft, so a Drafts read that forgot `draft_author_id IS NOT NULL` would still not have listed it.
    await draft(live);
    await uploaded('member', parent);
    await uploaded('member', parent);
    await uploaded('member', child);
    await uploaded('member', live);
    expect(await door(read, 'member', 'ticket', live, 'ticket.published', { projectId: PROJECT() })).toMatchObject({ status: 'committed' });

    const res = await read.app.inject({ method: 'GET', url: `/v1/workspaces/${WS()}/drafts`, headers: read.authOf('member') });
    expect(res.statusCode, res.body).toBe(200);
    const items = (res.json() as { items: Array<{ ticketId: string; parentId: string | null; attachmentCount: number }> }).items;
    const count = (id: string): number | undefined => items.find((item) => item.ticketId === id)?.attachmentCount;
    expect([count(parent), count(child), count(bare)]).toEqual([2, 1, 0]);
    // The number the confirm states for the parent, computed from the read the way the confirm does (the draft and the
    // rows whose `parentId` is it): this needs the child's `parentId`, so it is not implied by the line above.
    const confirm = items.filter((item) => item.ticketId === parent || item.parentId === parent).reduce((sum, item) => sum + item.attachmentCount, 0);
    expect(confirm).toBe(3);
    expect(count(live)).toBeUndefined();
  });
});
