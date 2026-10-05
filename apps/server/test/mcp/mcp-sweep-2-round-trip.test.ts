import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildOAuthApp, hostedToken } from '../helpers/oauth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithEmail, signInWithPhone } from '../helpers/session.js';

/**
 * MCP sweep 2 T9, case 14.659. One person, one HOSTED token, every step a `tools/call` against `POST /mcp` on the real app and a real
 * database, nothing stubbed: the notes on a ticket, a restored note version, close three (one cannot close), mute and unmute, a saved
 * filter used in `list_tickets`, and assign-by-email plus create-by-email for an outsider, each with its preview first. Run LOCALLY.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

type Content = Array<{ type: string; text?: string }>;

describe('MCP sweep 2, end to end through the hosted door', () => {
  it('14.659 notes on a ticket → restore a version → close three → mute/unmute → saved filter → assign and create by email (preview, then confirm)', async () => {
    const { app, otp, magic } = buildOAuthApp(db);
    await app.ready();
    const owner = await signInWithPhone(app, otp, '+911100002659');
    const token = await hostedToken(app, db.pool, owner.userId);
    const outsider = await signInWithEmail(app, magic, 'sweep2-out@example.test');
    const second = await signInWithEmail(app, magic, 'sweep2-second@example.test');

    const rpc = (method: string, params: unknown) =>
      (app as FastifyInstance).inject({
        method: 'POST', url: '/mcp',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${token}` },
        payload: { jsonrpc: '2.0', id: 1, method, params },
      });
    const raw = async (name: string, args: Record<string, unknown>) => {
      const res = await rpc('tools/call', { name, arguments: args });
      expect(res.statusCode, res.body.slice(0, 200)).toBe(200);
      const result = res.json().result as { isError?: boolean; content: Content };
      const text = result.content.find((c) => c.type === 'text')?.text ?? '';
      return { isError: result.isError === true, text, json: result.isError === true ? null : (JSON.parse(text) as Record<string, unknown>) };
    };
    const ok = async (name: string, args: Record<string, unknown>) => {
      const r = await raw(name, args);
      expect(r.isError, `${name}: ${r.text}`).toBe(false);
      return r.json as Record<string, unknown>;
    };

    const names = ((await rpc('tools/list', {})).json().result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    for (const used of ['restore_note_version', 'close_tickets', 'get_notification_preferences', 'set_notification_preferences', 'list_saved_filters']) expect(names, used).toContain(used);

    const ws = (await ok('create_workspace', { name: 'Sweep Two Co' }))['workspaceId'] as string;
    const projectId = (await ok('create_project', { workspaceId: ws, name: 'Counter' }))['projectId'] as string;
    const ticket = async (title: string, extra: Record<string, unknown> = {}) =>
      (await ok('create_ticket', { workspaceId: ws, projectId, typeId: 'task', title, start: 'focus', ...extra }))['ticketId'] as string;

    // 1. A note attached to a ticket shows on get_ticket.
    const t1 = await ticket('Chiller');
    const note = (await ok('create_note', { workspaceId: ws, title: 'Cold room', scope: 'workspace', markdown: 'first draft' }))['noteId'] as string;
    await ok('link_note', { noteId: note, ticketId: t1, action: 'attach' });
    const shown = (await ok('get_ticket', { workspaceId: ws, ticketId: t1 })) as { notes: Array<{ noteId: string; title: string }>; notesTotal: number };
    expect(shown.notes.map((n) => n.noteId)).toEqual([note]);
    expect(shown.notesTotal).toBe(1);
    const bare = await ticket('No notes here');
    expect(((await ok('get_ticket', { workspaceId: ws, ticketId: bare })) as { notes: unknown[]; notesTotal: number })).toMatchObject({ notes: [], notesTotal: 0 }); // CONTROL

    // 2. Restore an earlier version of the note.
    await ok('update_note', { noteId: note, markdown: 'second draft' });
    const versions = ((await ok('get_note_history', { noteId: note })) as { versions: Array<{ eventId: string }> }).versions;
    expect(versions.length).toBeGreaterThanOrEqual(2);
    let restoredFrom: string | undefined;
    for (const v of versions) {
      // The born-empty first version has no body (the route answers 404), so a read can be an error: look at the answer, do not demand it.
      const read = await raw('get_note_history', { noteId: note, versionId: v.eventId });
      if (!read.isError && String(read.json?.['markdown'] ?? '').includes('first draft')) restoredFrom = v.eventId;
    }
    expect(restoredFrom, 'one saved version holds the first draft').toBeDefined();
    const back = await ok('restore_note_version', { noteId: note, versionId: restoredFrom });
    expect(back).toMatchObject({ noteId: note, restored: true });
    expect((await ok('get_note', { noteId: note }))['markdown']).toContain('first draft');

    // 3. Close three: two are done, one is not. Preview first, then the count.
    const a = await ticket('Close A');
    const b = await ticket('Close B');
    const c = await ticket('Close C (still open)');
    for (const id of [a, b]) {
      await ok('transition_ticket', { workspaceId: ws, ticketId: id, to: 'doing' });
      await ok('transition_ticket', { workspaceId: ws, ticketId: id, to: 'done' });
    }
    const closedEvents = async () => (await db.pool.query(`SELECT 1 FROM events WHERE workspace_id = $1 AND type = 'ticket.closed'`, [ws])).rowCount;
    const before = await closedEvents();
    const previewed = await ok('close_tickets', { workspaceId: ws, ticketIds: [a, b, c] });
    expect(previewed).toMatchObject({ preview: true, nothingChanged: true });
    expect(await closedEvents()).toBe(before);
    const closed = (await ok('close_tickets', { workspaceId: ws, ticketIds: [a, b, c], confirm_count: '3' })) as { closed: number; refused: number; results: Array<{ ticketId: string; status: string }> };
    expect(closed).toMatchObject({ closed: 2, refused: 1 });
    expect(closed.results.map((r) => r.status)).toEqual(['closed', 'closed', 'refused']);
    expect(await closedEvents()).toBe((before ?? 0) + 2); // CONTROL: exactly the two that could close

    // 4. Mute and unmute; the stored preference is what the app reads.
    expect(await ok('set_notification_preferences', { mute: ['mention'] })).toMatchObject({ mutedKinds: ['mention'], changed: true });
    expect(await ok('get_notification_preferences', {})).toMatchObject({ mutedKinds: ['mention'] });
    expect(await ok('set_notification_preferences', { unmute: ['mention'] })).toMatchObject({ mutedKinds: [], changed: true });
    expect(await ok('set_notification_preferences', { unmute: ['mention'] })).toMatchObject({ changed: false }); // CONTROL: a no-op says so (14.629 pins that it sends no PUT)

    // 5. A saved filter, used as list_tickets' filter.
    const spec = { closed: false };
    const saved = await (app as FastifyInstance).inject({
      method: 'PUT', url: `/v1/me/preferences?workspaceId=${ws}`, headers: { authorization: `Bearer ${owner.token}` },
      payload: { savedFilters: [{ id: 'f1', name: 'Still open', filterSpec: spec }], listColumns: {}, grouping: {} },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const filters = (await ok('list_saved_filters', { workspaceId: ws })) as { savedFilters: Array<{ id: string; filter: unknown }> };
    expect(filters.savedFilters).toEqual([{ id: 'f1', name: 'Still open', filter: spec }]);
    // Precondition: unfiltered, the closed ticket IS listed (a FilterSpec without `closed` is "all", `filter-spec.ts:151-152`),
    // so the control below shows the filter working rather than a default that already hides closed tickets.
    expect(JSON.stringify(await ok('list_tickets', { projectId }))).toContain(a);
    const open = JSON.stringify(await ok('list_tickets', { projectId, filter: filters.savedFilters[0]!.filter }));
    expect(open).toContain(c);
    expect(open).not.toContain(a); // CONTROL: the filter filtered (a is closed)

    // 6. Assign by email: the preview first (nobody added), then the confirmation. The assignee is read from `ticketState.assigneeId`:
    // `get_ticket`'s `ticket` is the visibility row (`toTicketView`, `apps/server/src/routes/tickets.ts:142-152`), which has no assignee.
    const guestRows = async (userId: string) =>
      (await db.pool.query(`SELECT 1 FROM proj_memberships WHERE workspace_id = $1 AND user_id = $2`, [ws, userId])).rowCount;
    const previewA = (await ok('assign_ticket', { workspaceId: ws, ticketId: t1, assignee_email: 'sweep2-out@example.test' })) as { preview: boolean; wouldChange: string; person: { userId: string }; joinsAsGuest: boolean };
    expect(previewA).toMatchObject({ preview: true, joinsAsGuest: true, person: { userId: outsider.userId } });
    expect(previewA.wouldChange).toContain('WILL BE ADDED AS A GUEST');
    expect(await guestRows(outsider.userId)).toBe(0);
    await ok('assign_ticket', { workspaceId: ws, ticketId: t1, assignee_email: 'sweep2-out@example.test', confirm_assignee: previewA.person.userId });
    expect(await guestRows(outsider.userId)).toBe(1);
    expect(((await ok('get_ticket', { workspaceId: ws, ticketId: t1 })) as { ticketState: { assigneeId: string } }).ticketState.assigneeId).toBe(outsider.userId);

    // 7. Create by email: the preview creates nothing; the confirmation creates it assigned.
    const countTickets = async () => Number((await db.pool.query(`SELECT count(*) AS n FROM proj_tickets WHERE project_id = $1`, [projectId])).rows[0].n);
    const tickets = await countTickets();
    const previewC = (await ok('create_ticket', { workspaceId: ws, projectId, typeId: 'task', title: 'Born assigned', assignee_email: 'sweep2-second@example.test' })) as { preview: boolean; person: { userId: string } };
    expect(previewC.preview).toBe(true);
    expect(await countTickets()).toBe(tickets);
    const born = (await ok('create_ticket', { workspaceId: ws, projectId, typeId: 'task', title: 'Born assigned', assignee_email: 'sweep2-second@example.test', confirm_assignee: previewC.person.userId }))['ticketId'] as string;
    expect(await countTickets()).toBe(tickets + 1);
    expect(((await ok('get_ticket', { workspaceId: ws, ticketId: born })) as { ticketState: { assigneeId: string } }).ticketState.assigneeId).toBe(second.userId);
  });
});
