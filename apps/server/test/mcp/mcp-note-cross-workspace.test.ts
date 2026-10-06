import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildDoorWorld, callTool } from './helpers/door-matrix.js';

/**
 * Case 18.503 (task/notes-cross-workspace-attach): the MCP door gives the same refusal the client door gives
 * (18.500–18.502, `test/permissions/note-cross-workspace.test.ts`). And 18.520's MCP door
 * (task/notes-cross-workspace-followup): `update_note {projectId}` files `note.moved`, refused across workspaces as
 * the client door refuses it (`test/permissions/note-cross-workspace-followup.test.ts`). Every call is a `tools/call` on `POST /mcp`
 * against the real app and database. The world's MEMBER is on the world's project and founds a second workspace of
 * their own, so they can open the world's ticket and own a note elsewhere: the one person the hole admitted.
 *
 * The answer is asserted as the WHOLE text, a literal: `refused by permission.note: ` plus the unknown-ticket
 * sentence (`tools/submit.ts`'s `resultError` spelling), never a bare `isError`.
 */
const REFUSED = 'refused by permission.note: You cannot see the ticket this note would be attached to.';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

describe('18.503 the MCP note tools refuse a cross-workspace link with the unknown-ticket sentence', () => {
  it('18.503 link_note attach and create_note attachTicketId from the member\'s own workspace to the world\'s ticket are refused; the same tools inside the world commit', async () => {
    const w = await buildDoorWorld(db, '2503');
    const W2 = (
      await w.app.inject({ method: 'POST', url: '/v1/workspaces', headers: { authorization: `Bearer ${w.member.sessionToken}` }, payload: { name: 'Elsewhere' } })
    ).json<{ workspaceId: string }>().workspaceId;
    const away = await callTool(w.app, w.member.token, 'create_note', { workspaceId: W2, title: 'Homed elsewhere', scope: 'workspace' });
    expect(away.isError, away.text).toBe(false);
    const awayId = (away.json as { noteId: string }).noteId;
    const links = async (noteId: string) =>
      (await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM proj_note_attachments WHERE note_id = $1 AND ticket_id = $2', [noteId, w.ticketId])).rows[0]?.n;

    // CONTROL first, same person, same ticket: the world's own note links.
    const home = await callTool(w.app, w.member.token, 'link_note', { noteId: w.workspaceNoteId, ticketId: w.ticketId, action: 'attach' });
    expect(home.isError, home.text).toBe(false);
    expect(await links(w.workspaceNoteId)).toBe(1);

    const linked = await callTool(w.app, w.member.token, 'link_note', { noteId: awayId, ticketId: w.ticketId, action: 'attach' });
    expect(linked.isError).toBe(true);
    expect(linked.text).toBe(REFUSED);
    expect(await links(awayId)).toBe(0);

    const created = await callTool(w.app, w.member.token, 'create_note', { workspaceId: W2, title: 'Born linked elsewhere', attachTicketId: w.ticketId });
    expect(created.isError).toBe(true);
    expect(created.text).toBe(REFUSED);
    // CONTROL: the same create, in the world's workspace, commits.
    const bornHome = await callTool(w.app, w.member.token, 'create_note', { workspaceId: w.workspaceId, title: 'Born linked at home', attachTicketId: w.ticketId });
    expect(bornHome.isError, bornHome.text).toBe(false);

    // The assistant is told the rule before it tries: `link_note`'s description, as `tools/list` serves it, whole.
    const list = await w.app.inject({
      method: 'POST', url: '/mcp',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${w.member.token}` },
      payload: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    });
    const tools = (list.json().result as { tools: Array<{ name: string; description?: string }> }).tools;
    expect(tools.find((t) => t.name === 'link_note')?.description).toBe(
      'Attach a note to a ticket (action "attach") or detach it ("detach"). You must be able to see both, and the ticket must be in the note\'s workspace.',
    );
  });
});

describe('18.520 (MCP) update_note files note.moved, bound to the note\'s workspace', () => {
  it('18.520 (MCP) update_note moving a note under a project of the other workspace is refused, each way, with the client door\'s sentence; the same tool moves both notes within their own workspaces', async () => {
    const w = await buildDoorWorld(db, '2520');
    const W2 = (
      await w.app.inject({ method: 'POST', url: '/v1/workspaces', headers: { authorization: `Bearer ${w.member.sessionToken}` }, payload: { name: 'Elsewhere' } })
    ).json<{ workspaceId: string }>().workspaceId;
    const founded = await callTool(w.app, w.member.token, 'create_project', { workspaceId: W2, name: 'Elsewhere' });
    expect(founded.isError, founded.text).toBe(false);
    const P2 = (await db.pool.query<{ id: string }>('SELECT project_id AS id FROM proj_projects WHERE workspace_id = $1', [W2])).rows[0]!.id;
    const noteIn = async (workspaceId: string) => {
      const made = await callTool(w.app, w.member.token, 'create_note', { workspaceId, title: 'To be moved', scope: 'workspace' });
      expect(made.isError, made.text).toBe(false);
      return (made.json as { noteId: string }).noteId;
    };
    const away = await noteIn(W2);
    const home = await noteIn(w.workspaceId);
    const move = (noteId: string, projectId: string) => callTool(w.app, w.member.token, 'update_note', { noteId, projectId });
    const homeOf = async (noteId: string) =>
      (await db.pool.query<{ h: string }>('SELECT home_project_id AS h FROM proj_notes WHERE note_id = $1', [noteId])).rows[0]?.h;

    // CONTROL first, the same person and tool: each note moves under a project of its own workspace.
    expect((await move(away, P2)).isError).toBe(false);
    expect((await move(home, w.projectId)).isError).toBe(false);
    expect([await homeOf(away), await homeOf(home)]).toEqual([P2, w.projectId]);

    // The member OWNS W2: the existence half answers there. They are a MEMBER of the world: the membership half.
    const intoWorld = await move(away, w.projectId);
    expect(intoWorld.isError).toBe(true);
    // `submitBatch`'s spelling: the event's index in the batch, then `resultError`'s.
    expect(intoWorld.text).toBe(`event 0 refused by project.unknown: There is no project ${w.projectId} in this workspace.`);
    const intoW2 = await move(home, P2);
    expect(intoW2.isError).toBe(true);
    expect(intoW2.text).toBe('event 0 refused by permission.note: You are not a member of the project this note is filed under.');
    expect([await homeOf(away), await homeOf(home)]).toEqual([P2, w.projectId]);

    // The assistant is told the rule before it tries: `update_note`'s description names it.
    const list = await w.app.inject({
      method: 'POST', url: '/mcp',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${w.member.token}` },
      payload: { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} },
    });
    const tools = (list.json().result as { tools: Array<{ name: string; description?: string }> }).tools;
    expect(tools.find((t) => t.name === 'update_note')?.description).toContain(
      'or projectId to move it (a project of the note\'s own workspace, or "" for the workspace itself). ',
    );
  });
});
