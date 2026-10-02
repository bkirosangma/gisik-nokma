import { expect } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { buildOAuthApp, hostedToken } from '../../helpers/oauth.js';
import type { TestDatabase } from '../../helpers/db.js';
import { signInWithPhone } from '../../helpers/session.js';

export type Caller = { userId: string; token: string; sessionToken: string };
export type DoorWorld = {
  app: FastifyInstance; db: TestDatabase; owner: Caller; member: Caller; stranger: Caller;
  workspaceId: string; workspaceName: string; projectId: string; ticketId: string; ticketKey: string; secondTicketId: string; secondTicketKey: string;
  commentId: string; privateNoteId: string; workspaceNoteId: string; memberName: string;
};
export type DoorRow = {
  tool: string;
  args: (w: DoorWorld) => Record<string, unknown>;
  /** What a signed-in person with NO role in the workspace is answered: an exact sentence, or (for a per-person list) the empty JSON. */
  stranger: string | { json: unknown };
  /** What the MEMBER is answered, verbatim, when the act is not theirs. */
  forbidden?: { text: string };
  /** Who may do it, and the event that must then be in the ledger with origin `mcp` and that actor. */
  allowed?: { caller: 'owner' | 'member'; eventType?: string };
};

export async function callTool(app: FastifyInstance, token: string, name: string, args: Record<string, unknown>) {
  const res = await app.inject({
    method: 'POST', url: '/mcp',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${token}` },
    payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  const result = res.json().result as { isError?: boolean; content: Array<{ type: string; text?: string }> };
  const text = result.content.find((c) => c.type === 'text')?.text ?? '';
  return { isError: result.isError === true, text, json: result.isError === true ? null : (JSON.parse(text) as unknown) };
}

/** An owner, a plain member (on the project), a signed-in stranger; one project, two tickets, the owner's comment, a private and a workspace note. */
export async function buildDoorWorld(db: TestDatabase, phoneTail: string): Promise<DoorWorld> {
  const { app, otp } = buildOAuthApp(db);
  await app.ready();
  const person = async (n: number): Promise<Caller> => {
    const u = await signInWithPhone(app, otp, `+9111000${phoneTail}${n}`);
    return { userId: u.userId, sessionToken: u.token, token: await hostedToken(app, db.pool, u.userId) };
  };
  const owner = await person(1);
  const member = await person(2);
  const stranger = await person(3);
  const workspaceName = 'Door matrix';
  const workspaceId = (await app.inject({ method: 'POST', url: '/v1/workspaces', headers: { authorization: `Bearer ${owner.sessionToken}` }, payload: { name: workspaceName } })).json<{ workspaceId: string }>().workspaceId;
  const projectId = newUlid();
  const ticketId = newUlid();
  const secondTicketId = newUlid();
  const commentId = newUlid();
  const privateNoteId = newUlid();
  const workspaceNoteId = newUlid();
  const ev = (entity: { kind: string; id: string }, type: string, payload: unknown, id = newUlid()) =>
    ({ id, workspaceId, entity, type, version: 1, payload, actorId: owner.userId, origin: 'web', clientTime: new Date().toISOString() });
  const res = await app.inject({ method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${owner.sessionToken}` }, payload: { events: [
    ev({ kind: 'project', id: projectId }, 'project.created', { name: 'Matrix' }),
    ev({ kind: 'project', id: projectId }, 'project.member_added', { userId: owner.userId, projectAdmin: true }),
    ev({ kind: 'membership', id: `${workspaceId}:${member.userId}` }, 'membership.granted', { userId: member.userId, role: 'member' }),
    ev({ kind: 'project', id: projectId }, 'project.member_added', { userId: member.userId, projectAdmin: false }),
    ev({ kind: 'ticket', id: ticketId }, 'ticket.created', { typeId: 'task', projectId, parentId: null, title: 'Matrix ticket', start: 'backlog' }),
    ev({ kind: 'ticket', id: secondTicketId }, 'ticket.created', { typeId: 'task', projectId, parentId: null, title: 'Second ticket', start: 'backlog' }),
    ev({ kind: 'ticket', id: ticketId }, 'comment.added', { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'owner says' }] }] } }, commentId),
    ev({ kind: 'note', id: privateNoteId }, 'note.created', { title: 'Private matrix note', homeProjectId: '', scope: { mode: 'private' } }),
    ev({ kind: 'note', id: workspaceNoteId }, 'note.created', { title: 'Matrix note', homeProjectId: '', scope: { mode: 'workspace' } }),
  ] } });
  for (const r of res.json<{ results: Array<{ status: string; reason?: string }> }>().results) expect(r.status, r.reason).toBe('committed');
  const get = (url: string) => app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${owner.sessionToken}` } });
  const ticketKey = (await get(`/v1/workspaces/${workspaceId}/tickets/${ticketId}`)).json<{ key: string }>().key;
  const secondTicketKey = (await get(`/v1/workspaces/${workspaceId}/tickets/${secondTicketId}`)).json<{ key: string }>().key;
  const memberName = (await get(`/v1/workspaces/${workspaceId}/members`)).json<{ members: Array<{ userId: string; displayName: string }> }>()
    .members.find((m) => m.userId === member.userId)!.displayName;
  return { app, db, owner, member, stranger, workspaceId, workspaceName, projectId, ticketId, ticketKey, secondTicketId, secondTicketKey, commentId, privateNoteId, workspaceNoteId, memberName };
}

export async function runDoorMatrix(w: DoorWorld, rows: DoorRow[]): Promise<void> {
  for (const row of rows) {
    const s = await callTool(w.app, w.stranger.token, row.tool, row.args(w));
    if (typeof row.stranger === 'string') {
      expect(s.isError, `${row.tool}: stranger`).toBe(true);
      expect(s.text, `${row.tool}: stranger`).toBe(row.stranger); // EXACT: a uniform sentence, never "answered 404"
    } else {
      expect(s.json, `${row.tool}: stranger`).toEqual(row.stranger.json);
    }
    if (row.forbidden !== undefined) {
      const m = await callTool(w.app, w.member.token, row.tool, row.args(w));
      expect(m.isError, `${row.tool}: member`).toBe(true);
      expect(m.text, `${row.tool}: member`).toBe(row.forbidden.text);
    }
    if (row.allowed === undefined) continue;
    const caller = w[row.allowed.caller];
    const count = async () =>
      row.allowed?.eventType === undefined ? 0
        : (await w.db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM events WHERE workspace_id = $1 AND type = $2 AND origin = 'mcp' AND actor_id = $3`, [w.workspaceId, row.allowed.eventType, caller.userId])).rows[0]!.n;
    const before = await count();
    const ok = await callTool(w.app, caller.token, row.tool, row.args(w));
    expect(ok.isError, `${row.tool}: ${row.allowed.caller}: ${ok.text}`).toBe(false);
    if (row.allowed.eventType !== undefined) expect(await count(), `${row.tool}: ${row.allowed.eventType} with origin mcp`).toBe(before + 1);
  }
}
