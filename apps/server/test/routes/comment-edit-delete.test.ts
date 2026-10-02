import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { insertAttachment } from '../../src/attachments/attachment-repo.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

let db: TestDatabase;
let app: FastifyInstance;
let token = '';
let me = '';
let WS = '';
let PRJ = '';
let TICKET = '';
let OTHER = '';
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

type Result = { status: string; rule?: string; reason?: string };
async function send(entity: { kind: string; id: string }, type: string, payload: unknown, id = newUlid()): Promise<Result> {
  const res = await app.inject({
    method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${token}` },
    payload: { events: [{ id, workspaceId: WS, entity, type, version: 1, payload, actorId: me, origin: 'web', clientTime: new Date().toISOString() }] },
  });
  return res.json<{ results: Result[] }>().results[0]!;
}
async function ok(entity: { kind: string; id: string }, type: string, payload: unknown, id = newUlid()): Promise<string> {
  const r = await send(entity, type, payload, id);
  expect(r.status, `${type}: ${r.rule ?? ''} ${r.reason ?? ''}`).toBe('committed');
  return id;
}
type ThreadRow = { commentId: string; body: unknown; editedAt: string | null; deletedAt: string | null; files: unknown[] };
const thread = async (ticketId: string) =>
  (await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${ticketId}/comments`, headers: { authorization: `Bearer ${token}` } }))
    .json<{ comments: ThreadRow[] }>().comments;
const noteThread = async (noteId: string) =>
  (await app.inject({ method: 'GET', url: `/v1/notes/${noteId}/comments`, headers: { authorization: `Bearer ${token}` } }))
    .json<{ comments: ThreadRow[] }>().comments;
const hits = async (q: string) =>
  (await app.inject({ method: 'GET', url: `/v1/search?workspaceId=${WS}&q=${q}&kinds=ticket`, headers: { authorization: `Bearer ${token}` } }))
    .json<{ hits: Array<{ card: { ticketId: string } }> }>().hits.map((h) => h.card.ticketId);

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const user = await signInWithPhone(app, built.otp, '+919000002604');
  token = user.token;
  me = user.userId;
  const founded = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: { authorization: `Bearer ${token}` }, payload: { name: 'Comment edits' } });
  WS = founded.json<{ workspaceId: string }>().workspaceId;
  PRJ = newUlid();
  await ok({ kind: 'project', id: PRJ }, 'project.created', { name: 'Edits' });
  await ok({ kind: 'project', id: PRJ }, 'project.member_added', { userId: me, projectAdmin: true });
  TICKET = newUlid();
  OTHER = newUlid();
  for (const [id, title] of [[TICKET, 'Edited ticket'], [OTHER, 'Another ticket']] as const) {
    await ok({ kind: 'ticket', id }, 'ticket.created', { typeId: 'task', projectId: PRJ, parentId: null, title });
  }
});
afterAll(async () => {
  await db.drop();
});

describe('26.047–26.053 through the door', () => {
  it('26.047/26.049/26.051 edit and delete: projection, read and search follow', async () => {
    const t = { kind: 'ticket', id: TICKET };
    const first = await ok(t, 'comment.added', { body: doc('walrusfirst') });
    const sibling = await ok(t, 'comment.added', { body: doc('penguinsibling') });
    expect(await hits('walrusfirst')).toEqual([TICKET]); // control: indexed before the edit
    await ok(t, 'comment.edited', { commentId: first, body: doc('narwhalsecond') });
    let rows = await thread(TICKET);
    expect(rows.find((c) => c.commentId === first)).toMatchObject({ body: doc('narwhalsecond'), deletedAt: null });
    expect(rows.find((c) => c.commentId === first)?.editedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rows.find((c) => c.commentId === sibling)).toMatchObject({ body: doc('penguinsibling'), editedAt: null, deletedAt: null });
    expect(await hits('walrusfirst')).toEqual([]);
    expect(await hits('narwhalsecond')).toEqual([TICKET]);
    await ok(t, 'comment.deleted', { commentId: first });
    rows = await thread(TICKET);
    expect(rows.find((c) => c.commentId === first)).toMatchObject({ body: null, files: [] });
    expect(rows.find((c) => c.commentId === first)?.deletedAt).toMatch(/^\d{4}-/);
    expect(await hits('narwhalsecond')).toEqual([]);
    expect(await hits('penguinsibling')).toEqual([TICKET]); // control: the sibling's text stays
    const { rows: raw } = await db.pool.query('SELECT author_id, body FROM proj_ticket_comments WHERE comment_id = $1', [first]);
    expect(raw[0]).toEqual({ author_id: me, body: null });
  });

  it('26.050 a note comment: the same edit, delete and read', async () => {
    const note = { kind: 'note', id: newUlid() };
    await ok(note, 'note.created', { title: 'Edited note', homeProjectId: '', scope: { mode: 'workspace' } });
    const first = await ok(note, 'comment.added', { body: doc('walrusfirst') });
    const sibling = await ok(note, 'comment.added', { body: doc('penguinsibling') });
    await ok(note, 'comment.edited', { commentId: first, body: doc('narwhalsecond') });
    let rows = await noteThread(note.id);
    expect(rows.find((c) => c.commentId === first)).toMatchObject({ body: doc('narwhalsecond'), deletedAt: null });
    expect(rows.find((c) => c.commentId === first)?.editedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rows.find((c) => c.commentId === sibling)).toMatchObject({ body: doc('penguinsibling'), editedAt: null, deletedAt: null });
    await ok(note, 'comment.deleted', { commentId: first });
    rows = await noteThread(note.id);
    expect(rows.find((c) => c.commentId === first)).toMatchObject({ body: null });
    expect(rows.find((c) => c.commentId === first)?.deletedAt).toMatch(/^\d{4}-/);
    expect(rows.find((c) => c.commentId === sibling)?.body).toEqual(doc('penguinsibling')); // control
  });

  it('26.052 (ticket arm) a deleted ticket refuses an edit; restored, the edit commits', async () => {
    const t = { kind: 'ticket', id: OTHER };
    const c = await ok(t, 'comment.added', { body: doc('before') });
    await ok(t, 'ticket.deleted', {});
    const before = (await db.pool.query('SELECT count(*)::int AS n FROM events')).rows[0].n as number;
    expect(await send(t, 'comment.edited', { commentId: c, body: doc('after') })).toMatchObject({
      status: 'refused', rule: 'deleted-ticket', reason: 'This ticket is deleted; restore it first.',
    });
    expect((await db.pool.query('SELECT count(*)::int AS n FROM events')).rows[0].n).toBe(before);
    await ok(t, 'ticket.restored', {});
    await ok(t, 'comment.edited', { commentId: c, body: doc('after') });
  });

  it("26.053 an edit may embed only this ticket's own image", async () => {
    const own = newUlid();
    const foreign = newUlid();
    for (const [id, ticketId] of [[own, TICKET], [foreign, OTHER]] as const) {
      await insertAttachment(db.pool, { id, workspaceId: WS, ticketId, uploaderId: me, filename: 'p.png', mime: 'image/png', size: 4, objectKey: `w/${WS}/a/${id}`, sha256: 'a'.repeat(64) });
    }
    const t = { kind: 'ticket', id: TICKET };
    const c = await ok(t, 'comment.added', { body: doc('pic soon') });
    const withImage = (attachmentId: string) => ({ type: 'doc', content: [{ type: 'image', attrs: { attachmentId, wrap: 'block', alt: '' } }] });
    expect(await send(t, 'comment.edited', { commentId: c, body: withImage(foreign) })).toMatchObject({ status: 'refused', rule: 'attachment.embed-unknown' });
    await ok(t, 'comment.edited', { commentId: c, body: withImage(own) }); // control
  });

  it('26.048 rebuild equals live', async () => {
    for (const table of ['proj_ticket_comments', 'proj_note_comments', 'proj_search']) {
      const { rows } = await db.pool.query(`SELECT count(*)::int AS n FROM ${table}`);
      expect(rows[0].n, `${table} empty`).toBeGreaterThan(0); // control
    }
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});
