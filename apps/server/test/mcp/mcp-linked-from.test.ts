import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildDoorWorld, callTool } from './helpers/door-matrix.js';

/**
 * Knowledge Graph B (reference index) Task 4, case 27.169: MCP `get_ticket`'s `linkedFrom` through the hosted
 * door (`tools/call` on `POST /mcp`) equals `GET /v1/workspaces/:id/references` for the same viewer. The package
 * cases 27.165–27.168 are `packages/mcp-server/test/{read-tools,note-tools}.test.ts`. Run LOCALLY.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

describe('27.169 MCP linkedFrom equals the endpoint for the same viewer, through the hosted door', () => {
  it('27.169 the member does not get the owner’s private note (row or count); the owner gets both; MCP = endpoint for each', async () => {
    const w = await buildDoorWorld(db, '2769');
    const chip = { type: 'ticketRef', attrs: { ticketId: w.ticketId, projectId: w.projectId, key: w.ticketKey, title: 'Matrix ticket' } };
    const bodyWith = (words: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `${words} ` }, chip] }] });
    const ev = (noteId: string, payload: unknown) => ({ id: newUlid(), workspaceId: w.workspaceId, entity: { kind: 'note', id: noteId }, type: 'note.body_set', version: 1, payload, actorId: w.owner.userId, origin: 'web', clientTime: new Date().toISOString() });
    const res = await w.app.inject({ method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${w.owner.sessionToken}` }, payload: { events: [
      ev(w.privateNoteId, { body: bodyWith('private says') }),
      ev(w.workspaceNoteId, { body: bodyWith('shared says') }),
    ] } });
    for (const r of res.json<{ results: Array<{ status: string; reason?: string }> }>().results) expect(r.status, r.reason).toBe('committed');

    for (const [caller, expected] of [[w.owner, 2], [w.member, 1]] as const) {
      const mcp = await callTool(w.app, caller.token, 'get_ticket', { workspaceId: w.workspaceId, ticketId: w.ticketId });
      expect(mcp.isError, mcp.text).toBe(false);
      const linked = (mcp.json as { linkedFrom: { total: number; items: Array<{ sourceId: string; snippet: string }> } }).linkedFrom;
      const http = (await w.app.inject({ method: 'GET', url: `/v1/workspaces/${w.workspaceId}/references?target=ticket:${w.ticketId}`, headers: { authorization: `Bearer ${caller.sessionToken}` } })).json<{ total: number; items: Array<{ sourceId: string; snippet: string }> }>();
      expect(linked.total).toBe(expected);
      expect(linked.total).toBe(http.total);
      expect(linked.items.map((i) => [i.sourceId, i.snippet])).toEqual(http.items.map((i) => [i.sourceId, i.snippet]));
    }
    const ownerText = (await callTool(w.app, w.owner.token, 'get_ticket', { workspaceId: w.workspaceId, ticketId: w.ticketId })).text;
    expect(ownerText).toContain('private says'); // precondition: the private snippet IS served, to the one who may see it
    const memberText = (await callTool(w.app, w.member.token, 'get_ticket', { workspaceId: w.workspaceId, ticketId: w.ticketId })).text;
    expect(memberText).not.toContain('private says');
    expect(memberText).toContain('shared says'); // control
  });
});
