import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { NOT_A_MEMBER_REASON, PERMISSION_ROLE_RULE, ticketDeleteAuthorityReason } from '../../src/permissions/check-permission.js';
import { buildOAuthApp, hostedToken } from '../helpers/oauth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';
import { buildDoorWorld, callTool, runDoorMatrix } from './helpers/door-matrix.js';

/**
 * MCP-everything T9, cases 14.457 and 14.458 (the package cases 14.450–14.456 are
 * `packages/mcp-server/test/ticket-tools.test.ts`, `write-tools.test.ts` and `read-tools.test.ts`). Every call is a
 * `tools/call` on `POST /mcp` — the door an assistant uses — against the real app and database. Run LOCALLY.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

describe('MCP tickets through the hosted door', () => {
  it('14.457 update a description section, close with a comment, reopen, delete (preview, then the key), restore — every event origin mcp', async () => {
    const { app, otp } = buildOAuthApp(db);
    await app.ready();
    const owner = await signInWithPhone(app, otp, '+911100002457');
    const token = await hostedToken(app, db.pool, owner.userId);
    const call = (name: string, args: Record<string, unknown>) => callTool(app, token, name, args);
    const ok = async (name: string, args: Record<string, unknown>) => {
      const r = await call(name, args);
      expect(r.isError, `${name}: ${r.text}`).toBe(false);
      return r.json as Record<string, unknown>;
    };

    const ws = ((await ok('create_workspace', { name: 'Tickets Co' }))['workspaceId']) as string;
    const projectId = ((await ok('create_project', { workspaceId: ws, name: 'Counter' }))['projectId']) as string;
    const created = await ok('create_ticket', {
      workspaceId: ws, projectId, typeId: 'task', title: 'Chiller', start: 'focus', priority: 'P2', assigneeId: 'me',
      markdown: '## Steps\n\n1. ring the vendor\n\n## Notes\n\nKeep the receipt.',
    });
    const ticketId = created['ticketId'] as string;

    // update a description SECTION: "Notes" stays as it was
    await ok('update_ticket', { workspaceId: ws, ticketId, markdown: '1. call the vendor\n2. book the engineer', mode: 'replace_section', section: 'Steps' });
    const read = (await ok('get_ticket', { workspaceId: ws, ticketId })) as {
      key: string; description: { markdown: string; lossy: string[] }; ticketState: { fields: Record<string, unknown> };
    };
    expect(read.description.markdown).toContain('## Steps');
    expect(read.description.markdown).toContain('2. book the engineer'); // control: the ticket reads back with the new section
    expect(read.description.markdown).toContain('## Notes\n\nKeep the receipt.');
    expect(read.description.markdown).not.toContain('ring the vendor');
    expect(read.ticketState.fields['description'], 'no raw document').toBeUndefined();

    // close with a comment (the workflow decides: reach a terminal state first), then reopen
    await ok('transition_ticket', { workspaceId: ws, ticketId, to: 'doing' });
    await ok('transition_ticket', { workspaceId: ws, ticketId, to: 'done', comment: 'finished' });
    await ok('close_ticket', { workspaceId: ws, ticketId, comment: 'All **done**.' });
    await ok('reopen_ticket', { workspaceId: ws, ticketId });

    // delete: the preview first, nothing changes; then the key
    const preview = (await ok('delete_ticket', { workspaceId: ws, ticketId, confirm_name: 'Chiller' })) as { preview?: boolean; confirm?: string };
    expect(preview.preview).toBe(true);
    expect(preview.confirm).toBe(`confirm_name must be "${read.key}"`);
    const stillThere = await db.pool.query(`SELECT 1 FROM events WHERE entity_id = $1 AND type = 'ticket.deleted'`, [ticketId]);
    expect(stillThere.rowCount).toBe(0);
    await ok('delete_ticket', { workspaceId: ws, ticketId, confirm_name: read.key });
    await ok('restore_ticket', { workspaceId: ws, ticketId });

    const types = await db.pool.query<{ type: string; origin: string }>(`SELECT type, origin FROM events WHERE entity_id = $1 ORDER BY workspace_seq`, [ticketId]);
    expect(types.rows.map((r) => r.type)).toEqual(expect.arrayContaining([
      'ticket.created', 'ticket.field_set', 'comment.added', 'ticket.closed', 'ticket.reopened', 'ticket.deleted', 'ticket.restored',
    ]));
    const other = await db.pool.query<{ origin: string }>(`SELECT origin FROM events WHERE entity_id = $1 AND type <> 'ticket.created'`, [ticketId]);
    expect(other.rows.length).toBeGreaterThan(5);
    expect(new Set(other.rows.map((r) => r.origin))).toEqual(new Set(['mcp']));

    // the history shows who and from where, and no text
    const history = (await ok('get_ticket_history', { ticketId })) as { events: Array<{ type: string; origin: string; payload: unknown }> };
    expect(history.events.some((e) => e.type === 'ticket.closed' && e.origin === 'mcp')).toBe(true);
    expect(JSON.stringify(history)).not.toContain('book the engineer');
    expect(JSON.stringify(history)).not.toContain('finished');
  });

  it('14.458 every ticket tool: stranger, forbidden member, allowed caller', async () => {
    const w = await buildDoorWorld(db, '2458');
    const NOT_MEMBER = `event 0 refused by ${PERMISSION_ROLE_RULE}: ${NOT_A_MEMBER_REASON}`;
    const TICKET_GONE = 'ticket not found or not visible to you';
    const t = (extra: Record<string, unknown> = {}) => (x: typeof w) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, ...extra });
    const t2 = (extra: Record<string, unknown> = {}) => (x: typeof w) => ({ workspaceId: x.workspaceId, ticketId: x.secondTicketId, ...extra });
    await runDoorMatrix(w, [
      { tool: 'update_ticket', args: t({ title: 'Renamed in the matrix' }), stranger: NOT_MEMBER, allowed: { caller: 'member', eventType: 'ticket.field_set' } },
      { tool: 'close_ticket', args: t(), stranger: NOT_MEMBER }, // the allowed path needs a terminal state: 14.457
      { tool: 'reopen_ticket', args: t(), stranger: NOT_MEMBER },
      {
        tool: 'delete_ticket',
        args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.secondTicketId, confirm_name: x.secondTicketKey }),
        stranger: TICKET_GONE,
        forbidden: { text: `event 0 refused by ${PERMISSION_ROLE_RULE}: ${ticketDeleteAuthorityReason('delete')}` },
        allowed: { caller: 'owner', eventType: 'ticket.deleted' },
      },
      {
        tool: 'restore_ticket',
        args: t2(),
        stranger: NOT_MEMBER,
        forbidden: { text: `event 0 refused by ${PERMISSION_ROLE_RULE}: ${ticketDeleteAuthorityReason('restore')}` },
        allowed: { caller: 'owner', eventType: 'ticket.restored' },
      },
      { tool: 'get_ticket_history', args: (x) => ({ ticketId: x.ticketId }), stranger: TICKET_GONE, allowed: { caller: 'member' } },
      { tool: 'rank_ticket', args: t({ after: w.secondTicketId }), stranger: TICKET_GONE }, // the rank arithmetic is 14.455's
      { tool: 'get_ticket', args: t(), stranger: TICKET_GONE, allowed: { caller: 'member' } },
      // 27.060 (typed-links T4): the server's gate decides; a member who sees both ends links them.
      {
        tool: 'link_tickets',
        args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, targetId: x.secondTicketId, kind: 'relates', action: 'add' }),
        stranger: `refused by ${PERMISSION_ROLE_RULE}: ${NOT_A_MEMBER_REASON}`,
        allowed: { caller: 'member', eventType: 'ticket.link_added' },
      },
    ]);
    // 27.060: the link landed on ticketId's stream (the SOURCE), naming secondTicketId.
    const linked = await w.db.pool.query<{ entity_id: string; payload: unknown }>(
      `SELECT entity_id, payload FROM events WHERE workspace_id = $1 AND type = 'ticket.link_added'`,
      [w.workspaceId],
    );
    expect(linked.rows).toEqual([{ entity_id: w.ticketId, payload: { kind: 'relates', targetId: w.secondTicketId } }]);
  });

  it("27.059 get_ticket_history withholds a hidden link target from a member: a ticket you can't see, never its id; control: the owner's line carries the id and the key", async () => {
    const w = await buildDoorWorld(db, '2759');
    const H = newUlid();
    const ev = (id: string, type: string, payload: unknown) => ({
      id: newUlid(), workspaceId: w.workspaceId, entity: { kind: 'ticket', id }, type, version: 1, payload,
      actorId: w.owner.userId, origin: 'web', clientTime: new Date().toISOString(),
    });
    const res = await w.app.inject({ method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${w.owner.sessionToken}` }, payload: { events: [
      ev(H, 'ticket.created', { typeId: 'task', projectId: w.projectId, parentId: null, title: 'Salary review', start: 'backlog' }),
      ev(H, 'visibility.set', { ticketId: H, mode: 'explicit', userIds: [w.owner.userId] }),
      ev(w.ticketId, 'ticket.link_added', { kind: 'duplicates', targetId: H }),
    ] } });
    for (const r of res.json<{ results: Array<{ status: string; reason?: string }> }>().results) expect(r.status, r.reason).toBe('committed');
    const hKey = (await w.app.inject({ method: 'GET', url: `/v1/workspaces/${w.workspaceId}/tickets/${H}`, headers: { authorization: `Bearer ${w.owner.sessionToken}` } })).json<{ key: string }>().key;
    expect(hKey).toMatch(/-\d+$/); // precondition: H has a key to leak
    type Line = { type: string; payload: Record<string, unknown>; linkTarget?: unknown };
    const historyAs = async (caller: 'owner' | 'member') => {
      const r = await callTool(w.app, w[caller].token, 'get_ticket_history', { ticketId: w.ticketId });
      expect(r.isError, r.text).toBe(false);
      return r.json as { events: Line[] };
    };
    const dupOf = (out: { events: Line[] }) => out.events.find((e) => e.type === 'ticket.link_added')!;

    const member = await historyAs('member');
    const memberDup = dupOf(member);
    expect(memberDup.payload).toEqual({ kind: 'duplicates', target: "a ticket you can't see" });
    // N6 (AMEND p11): a withheld target is labelled null, not dropped.
    expect(memberDup).toHaveProperty('linkTarget', null);
    expect(JSON.stringify(member)).not.toContain(H);
    expect(JSON.stringify(member)).not.toContain(hKey);

    const ownerDup = dupOf(await historyAs('owner'));
    expect(ownerDup.payload).toEqual({ kind: 'duplicates', targetId: H });
    expect(ownerDup.linkTarget).toEqual({ key: hKey });
  });
});
