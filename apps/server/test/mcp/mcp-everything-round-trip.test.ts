import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid } from '@gisik-nokma/domain';
import { buildOAuthApp, hostedToken } from '../helpers/oauth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * MCP-everything T13, case 14.554. One person, one HOSTED token, every step a `tools/call` against `POST /mcp` — the
 * door an assistant uses — on the real app and a real database, nothing stubbed. Notes → comments → files → ticket acts
 * → trash → an admin preview → search, with an assertion after each step. Run LOCALLY (CI does not run on a dev PR).
 */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

type Content = Array<{ type: string; text?: string; data?: string; mimeType?: string }>;

describe('MCP everything, end to end through the hosted door', () => {
  it('14.554 note → comments → file → ticket acts → trash → group preview/confirm → search, every written event origin mcp', async () => {
    const { app, otp } = buildOAuthApp(db);
    await app.ready();
    const owner = await signInWithPhone(app, otp, '+911100002554');
    const reader = await signInWithPhone(app, otp, '+911100002555');
    const token = await hostedToken(app, db.pool, owner.userId);

    const rpc = (method: string, params: unknown) =>
      (app as FastifyInstance).inject({
        method: 'POST', url: '/mcp',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${token}` },
        payload: { jsonrpc: '2.0', id: 1, method, params },
      });
    /** The id of every event a tool COMMITTED, as the tool's own answer names it. */
    const written: string[] = [];
    const raw = async (name: string, args: Record<string, unknown>) => {
      const res = await rpc('tools/call', { name, arguments: args });
      expect(res.statusCode, res.body.slice(0, 200)).toBe(200);
      const result = res.json().result as { isError?: boolean; content: Content };
      const text = result.content.find((c) => c.type === 'text')?.text ?? '';
      const json = result.isError === true ? null : (JSON.parse(text) as Record<string, unknown>);
      const results = (json?.['results'] as Array<{ eventId?: string }> | undefined) ?? [json as { eventId?: string } | null];
      for (const r of results) if (typeof r?.eventId === 'string') written.push(r.eventId);
      return { isError: result.isError === true, text, json, content: result.content };
    };
    const ok = async (name: string, args: Record<string, unknown>) => {
      const r = await raw(name, args);
      expect(r.isError, `${name}: ${r.text}`).toBe(false);
      return r.json as Record<string, unknown>;
    };

    // The registry the assistant sees holds every tool this walk uses (14.555 pins the whole literal).
    const names = ((await rpc('tools/list', {})).json().result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    for (const used of ['create_note', 'get_note', 'update_note', 'add_comment', 'list_comments', 'edit_comment', 'delete_comment', 'add_attachment', 'get_attachment',
      'update_ticket', 'close_ticket', 'reopen_ticket', 'delete_ticket', 'list_deleted', 'restore_ticket', 'manage_groups', 'search']) {
      expect(names, used).toContain(used);
    }

    const ws = (await ok('create_workspace', { name: 'Everything Co' }))['workspaceId'] as string;
    const projectId = (await ok('create_project', { workspaceId: ws, name: 'Counter' }))['projectId'] as string;
    // The reader joins the workspace and the project (the member door is covered elsewhere; this is the setup).
    const ev = (entity: { kind: string; id: string }, type: string, payload: unknown) =>
      ({ id: newUlid(), workspaceId: ws, entity, type, version: 1, payload, actorId: owner.userId, origin: 'web', clientTime: new Date().toISOString() });
    const joined = await (app as FastifyInstance).inject({
      method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${owner.token}` },
      payload: { events: [
        ev({ kind: 'membership', id: `${ws}:${reader.userId}` }, 'membership.granted', { userId: reader.userId, role: 'member' }),
        ev({ kind: 'project', id: projectId }, 'project.member_added', { userId: reader.userId, projectAdmin: false }),
      ] },
    });
    for (const r of joined.json<{ results: Array<{ status: string; reason?: string }> }>().results) expect(r.status, r.reason).toBe('committed');

    // 1. a note, written in Markdown with a mention of the reader
    const made = await ok('create_note', {
      workspaceId: ws, title: 'Cold room', scope: 'workspace',
      markdown: `## Steps\n\n1. ring the vendor\n\n## Notes\n\nThe chiller is loud. ask @[Ravi](user:${reader.userId})`,
    });
    const noteId = made['noteId'] as string;
    const note = await ok('get_note', { noteId });
    expect(note['markdown']).toContain('## Steps');
    expect(note['markdown']).toContain('The chiller is loud.');

    // 2. one section replaced; the other stays
    await ok('update_note', { noteId, markdown: '1. call the vendor', mode: 'replace_section', section: 'Steps' });
    const changed = await ok('get_note', { noteId });
    expect(changed['markdown']).toContain('1. call the vendor');
    expect(changed['markdown']).not.toContain('ring the vendor');
    expect(changed['markdown']).toContain('## Notes'); // control: the untouched section is still there

    // 3. a ticket, a comment, listed, edited, deleted
    const ticketId = (await ok('create_ticket', { workspaceId: ws, projectId, typeId: 'task', title: 'Chiller', start: 'focus', markdown: '## Steps\n\n1. ring the vendor' }))['ticketId'] as string;
    const added = await ok('add_comment', { workspaceId: ws, ticketId, markdown: '13:37 — chiller part ordered' });
    const first = (await ok('list_comments', { workspaceId: ws, ticketId })) as { comments: Array<{ commentId: string; markdown: string | null; deleted: boolean }> };
    expect(first.comments.map((c) => c.markdown)).toEqual(['13:37 — chiller part ordered']);
    const commentId = first.comments[0]!.commentId;
    expect(added).toBeDefined();
    await ok('edit_comment', { workspaceId: ws, ticketId, commentId, markdown: '13:40 — part is here' });
    const edited = (await ok('list_comments', { workspaceId: ws, ticketId })) as { comments: Array<{ markdown: string | null }> };
    expect(edited.comments[0]!.markdown).toBe('13:40 — part is here');
    await ok('delete_comment', { workspaceId: ws, ticketId, commentId });
    const gone = (await ok('list_comments', { workspaceId: ws, ticketId })) as { comments: Array<{ markdown: string | null; deleted: boolean }> };
    expect(gone.comments[0]).toMatchObject({ deleted: true, markdown: null });

    // 4. a picture on the ticket, read back as an image
    await ok('add_attachment', { workspaceId: ws, ticketId, file: { name: 'dot.png', base64: PNG_B64 } });
    const files = (await ok('list_attachments', { workspaceId: ws, ticketId })) as { attachments: Array<{ attachmentId: string }> };
    const got = await raw('get_attachment', { attachmentId: files.attachments[0]!.attachmentId });
    expect(got.isError, got.text).toBe(false);
    expect(got.content.find((c) => c.type === 'image')?.mimeType).toBe('image/png');

    // 5. ticket acts: one description section, close with a comment, reopen
    await ok('update_ticket', { workspaceId: ws, ticketId, markdown: '1. call the vendor', mode: 'replace_section', section: 'Steps' });
    await ok('transition_ticket', { workspaceId: ws, ticketId, to: 'doing' });
    await ok('transition_ticket', { workspaceId: ws, ticketId, to: 'done' });
    await ok('close_ticket', { workspaceId: ws, ticketId, comment: 'All **done**.' });
    await ok('reopen_ticket', { workspaceId: ws, ticketId });
    const key = (await ok('get_ticket', { workspaceId: ws, ticketId }))['key'] as string;

    // 6. delete: the preview first (nothing changes), then the key; the trash lists it; restore
    const preview = await ok('delete_ticket', { workspaceId: ws, ticketId, confirm_name: 'Chiller' });
    expect(preview['preview']).toBe(true);
    expect((await db.pool.query(`SELECT 1 FROM events WHERE entity_id = $1 AND type = 'ticket.deleted'`, [ticketId])).rowCount).toBe(0);
    await ok('delete_ticket', { workspaceId: ws, ticketId, confirm_name: key });
    const trash = (await ok('list_deleted', { workspaceId: ws })) as { items: Array<{ kind: string; id: string; restoreWith: string }> };
    expect(trash.items.find((i) => i.id === ticketId)).toMatchObject({ kind: 'ticket', restoreWith: 'restore_ticket' });
    const onlyNotes = (await ok('list_deleted', { workspaceId: ws, kinds: ['note'] })) as { items: unknown[] };
    expect(onlyNotes.items).toEqual([]); // control: the kinds filter really filters
    await ok('restore_ticket', { workspaceId: ws, ticketId });
    expect(((await ok('list_deleted', { workspaceId: ws })) as { items: Array<{ id: string }> }).items.some((i) => i.id === ticketId)).toBe(false);

    // 7. an admin act: a wrong name writes nothing, the workspace's exact name does
    const groupEvents = async () => (await db.pool.query(`SELECT 1 FROM events WHERE workspace_id = $1 AND type = 'group.created'`, [ws])).rowCount;
    const previewed = await ok('manage_groups', { workspaceId: ws, action: 'create', name: 'Kitchen', confirm_name: 'everything co' });
    expect(previewed['preview']).toBe(true);
    expect(await groupEvents()).toBe(0);
    await ok('manage_groups', { workspaceId: ws, action: 'create', name: 'Kitchen', confirm_name: 'Everything Co' });
    expect(await groupEvents()).toBe(1);

    // 8. search finds both the note and the ticket
    await vi.waitFor(async () => {
      const found = (await ok('search', { workspaceId: ws, query: 'chiller' })) as { hits?: Array<{ card?: { ticketId?: string; id?: string }; matchedIn?: string }>; notes?: Array<{ noteId?: string }> };
      expect(found.hits?.some((h) => h.card?.ticketId === ticketId || h.card?.id === ticketId), JSON.stringify(found).slice(0, 300)).toBe(true);
      expect(found.notes?.some((n) => n.noteId === noteId), JSON.stringify(found).slice(0, 300)).toBe(true);
    }, { timeout: 5000, interval: 100 });
    const onlyTickets = (await ok('search', { workspaceId: ws, query: 'chiller', kinds: ['ticket'] })) as { notes?: unknown[] };
    expect(onlyTickets.notes ?? []).toEqual([]); // control: kinds narrows

    // The ledger: every event a tool committed has origin `mcp` …
    const wroteRows = await db.pool.query<{ origin: string }>(`SELECT DISTINCT origin FROM events WHERE id = ANY($1)`, [written]);
    expect(written.length).toBeGreaterThan(15);
    expect(wroteRows.rows.map((r) => r.origin)).toEqual(['mcp']);
    // … and the check is not blind: the setup written through /v1/events is NOT mcp, so "all mcp" above is a real filter.
    const setup = await db.pool.query<{ origin: string }>(`SELECT DISTINCT origin FROM events WHERE workspace_id = $1 AND type = 'membership.granted' AND NOT (id = ANY($2))`, [ws, written]);
    expect(setup.rows.map((r) => r.origin)).toContain('web');
    // the mentioned reader was notified once
    await vi.waitFor(async () => {
      const mentioned = await db.pool.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'mention'`, [reader.userId]);
      expect(mentioned.rowCount).toBe(1);
    }, { timeout: 5000, interval: 50 });
    await app.close();
  });
});
