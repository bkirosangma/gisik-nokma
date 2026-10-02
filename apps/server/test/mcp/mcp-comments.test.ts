import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { COMMENT_DELETE_AUTHORITY_REASON, COMMENT_EDIT_AUTHOR_REASON, COMMENT_PERMISSION_RULE } from '../../src/permissions/check-comment-authority.js';
import { NOT_A_MEMBER_REASON, PERMISSION_ROLE_RULE } from '../../src/permissions/check-permission.js';
import { buildOAuthApp, hostedToken } from '../helpers/oauth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';
import { buildDoorWorld, callTool, runDoorMatrix } from './helpers/door-matrix.js';

/**
 * MCP-everything T6, cases 14.380 / 14.382 / 14.389 (the package cases 14.381 / 14.383–14.388 are
 * `packages/mcp-server/test/comment-tools.test.ts`). Every call is a `tools/call` on `POST /mcp` — the
 * door an assistant uses — against the real app and database. Run LOCALLY.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

describe('MCP comments through the hosted door', () => {
  it("14.380 / 14.382 the owner's 13:37 text is stored as headings and a list; a mention notifies", async () => {
    const { app, otp } = buildOAuthApp(db);
    await app.ready();
    const owner = await signInWithPhone(app, otp, '+911100002380');
    const member = await signInWithPhone(app, otp, '+911100002381');
    const token = await hostedToken(app, db.pool, owner.userId);
    const call = (name: string, args: Record<string, unknown>) => callTool(app, token, name, args);

    const workspaceId = (await call('create_workspace', { name: 'Comments Co' })).json as { workspaceId: string };
    const ws = workspaceId.workspaceId;
    const projectId = ((await call('create_project', { workspaceId: ws, name: 'Counter' })).json as { projectId: string }).projectId;
    const ticketId = newUlid();
    const ev = (entity: { kind: string; id: string }, type: string, payload: unknown) =>
      ({ id: newUlid(), workspaceId: ws, entity, type, version: 1, payload, actorId: owner.userId, origin: 'web', clientTime: new Date().toISOString() });
    const joined = await app.inject({
      method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${owner.token}` },
      payload: { events: [
        ev({ kind: 'membership', id: `${ws}:${member.userId}` }, 'membership.granted', { userId: member.userId, role: 'member' }),
        ev({ kind: 'project', id: projectId }, 'project.member_added', { userId: member.userId, projectAdmin: false }),
        ev({ kind: 'ticket', id: ticketId }, 'ticket.created', { typeId: 'task', projectId, parentId: null, title: 'Cold room', start: 'backlog' }),
      ] },
    });
    for (const r of joined.json<{ results: Array<{ status: string; reason?: string }> }>().results) expect(r.status, r.reason).toBe('committed');

    const brief = "# Achri's Brief\n\n### 1. Where we are\n\n- responding to the cold-room ticket\n- waiting on the chiller part";
    const added = await call('add_comment', { workspaceId: ws, ticketId, markdown: `${brief}\n\n@[Ravi](user:${member.userId})` });
    expect(added.isError, added.text).toBe(false);
    const { rows } = await db.pool.query<{ body: { content: Array<{ type: string }> } }>('SELECT body FROM proj_ticket_comments WHERE ticket_id = $1', [ticketId]);
    expect(rows[0]?.body.content.map((n) => n.type)).toEqual(['heading', 'heading', 'bulletList', 'paragraph']); // 14.380

    const viaText = await call('add_comment', { workspaceId: ws, ticketId, text: '## Old name' }); // `text` is the same door
    expect(viaText.isError, viaText.text).toBe(false);
    const both = await call('add_comment', { workspaceId: ws, ticketId, text: 'a', markdown: 'b' });
    expect(both.isError).toBe(true);
    expect(both.text).toBe('add_comment takes exactly one of markdown or text');

    const notified = await db.pool.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'mention'`, [member.userId]);
    expect(notified.rowCount).toBe(1); // 14.382

    const plain = await call('add_comment', { workspaceId: ws, ticketId, markdown: 'just a line' });
    expect(plain.isError, plain.text).toBe(false); // control: one paragraph
    const plainRows = await db.pool.query<{ body: { content: Array<{ type: string }> } }>(
      'SELECT body FROM proj_ticket_comments WHERE ticket_id = $1 ORDER BY workspace_seq DESC LIMIT 1', [ticketId]);
    expect(plainRows.rows[0]?.body.content.map((n) => n.type)).toEqual(['paragraph']);
  });

  it('14.389 every comment tool: stranger, forbidden member, allowed caller', async () => {
    const w = await buildDoorWorld(db, '2389');
    const NOT_MEMBER = `refused by ${PERMISSION_ROLE_RULE}: ${NOT_A_MEMBER_REASON}`;
    const onTicket = (extra: Record<string, unknown>) => (x: typeof w) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, ...extra });
    await runDoorMatrix(w, [
      { tool: 'list_comments', args: onTicket({}), stranger: 'ticket not found or not visible to you', allowed: { caller: 'member' } },
      { tool: 'add_comment', args: onTicket({ markdown: 'From the matrix' }), stranger: NOT_MEMBER, allowed: { caller: 'member', eventType: 'comment.added' } },
      { tool: 'edit_comment', args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, commentId: x.commentId, markdown: 'edited' }), stranger: NOT_MEMBER,
        forbidden: { text: `refused by ${COMMENT_PERMISSION_RULE}: ${COMMENT_EDIT_AUTHOR_REASON}` }, allowed: { caller: 'owner', eventType: 'comment.edited' } },
      { tool: 'delete_comment', args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, commentId: x.commentId }), stranger: NOT_MEMBER,
        forbidden: { text: `refused by ${COMMENT_PERMISSION_RULE}: ${COMMENT_DELETE_AUTHORITY_REASON}` }, allowed: { caller: 'owner', eventType: 'comment.deleted' } },
    ]);
    // list_comments pages, and a note's comments are read the same way
    const first = await callTool(w.app, w.owner.token, 'list_comments', { workspaceId: w.workspaceId, ticketId: w.ticketId, limit: 1 });
    expect(first.isError, first.text).toBe(false);
    const pageOne = first.json as { comments: unknown[]; nextCursor: string | null };
    expect(pageOne.comments).toHaveLength(1);
    expect(pageOne.nextCursor).not.toBeNull();
    const second = await callTool(w.app, w.owner.token, 'list_comments', { workspaceId: w.workspaceId, ticketId: w.ticketId, limit: 1, cursor: pageOne.nextCursor });
    expect((second.json as { comments: unknown[] }).comments).toHaveLength(1);
  });
});
