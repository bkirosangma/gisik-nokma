import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildOAuthApp, hostedToken } from '../helpers/oauth.js';
import { signInWithEmail, signInWithPhone } from '../helpers/session.js';
import { buildDoorWorld, callTool, runDoorMatrix, type DoorWorld } from './helpers/door-matrix.js';

/**
 * MCP-everything T10: the discovery and "me" tools through the HOSTED door (a token caller, `POST /mcp`).
 * Cases 14.485 and 14.486. The unit cases are in `packages/mcp-server/test/discovery-tools.test.ts`.
 */
let db: TestDatabase;
let w: DoorWorld;
beforeAll(async () => {
  db = await createTestDatabase();
  w = await buildDoorWorld(db, '2486');
});
afterAll(async () => {
  await w.app.close();
  await db.drop();
});

describe('14.485 a token caller answers its own invitations', () => {
  it('14.485 list, accept and decline work through the hosted door (requireSession alone)', async () => {
    const { app, otp, magic } = buildOAuthApp(db);
    await app.ready();
    try {
      const owner = await signInWithPhone(app, otp, '+911100024851');
      const ownerAuth = { authorization: `Bearer ${owner.token}` };
      const found = async (name: string) => {
        const created = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: ownerAuth, payload: { name } });
        expect(created.statusCode).toBe(201);
        return created.json<{ workspaceId: string }>().workspaceId;
      };
      const workspaceId = await found('Invite door');
      const otherWorkspaceId = await found('Invite door two');

      const person = async (email: string) => {
        const u = await signInWithEmail(app, magic, email);
        return { userId: u.userId, sessionAuth: { authorization: `Bearer ${u.token}` }, token: await hostedToken(app, db.pool, u.userId) };
      };
      const invitee = await person('invitee-14485@discovery.test');
      // One pending invitation per (address, workspace): a second to the same workspace would replace the first.
      const inviteTo = async (address: string, into: string) => {
        const res = await app.inject({ method: 'POST', url: `/v1/workspaces/${into}/invites`, headers: ownerAuth, payload: { address, channel: 'email', role: 'member' } });
        expect(res.statusCode, res.body).toBe(201);
        return res.json<{ inviteId: string }>().inviteId;
      };
      const first = await inviteTo('invitee-14485@discovery.test', workspaceId);
      const second = await inviteTo('invitee-14485@discovery.test', otherWorkspaceId);

      // CONTROL: the list shows the pending invitations first, and pages by offset.
      const listed = await callTool(app, invitee.token, 'list_my_invitations', {});
      const ids = (listed.json as { invitations: Array<{ inviteId: string; workspaceId: string }> }).invitations.map((i) => i.inviteId);
      expect(ids.sort()).toEqual([first, second].sort());
      const page1 = await callTool(app, invitee.token, 'list_my_invitations', { limit: 1 });
      expect((page1.json as { invitations: unknown[]; nextCursor: string | null }).invitations).toHaveLength(1);
      expect((page1.json as { nextCursor: string | null }).nextCursor).toBe('1');
      const page2 = await callTool(app, invitee.token, 'list_my_invitations', { limit: 1, cursor: '1' });
      expect((page2.json as { invitations: unknown[]; nextCursor: string | null }).invitations).toHaveLength(1);
      expect((page2.json as { nextCursor: string | null }).nextCursor).toBeNull();

      const accepted = await callTool(app, invitee.token, 'respond_to_invitation', { inviteId: first, answer: 'accept' });
      expect(accepted.isError, accepted.text).toBe(false);
      expect(accepted.json).toEqual({ workspaceId });
      const mine = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: invitee.sessionAuth });
      expect(mine.json<{ workspaces: Array<{ workspaceId: string }> }>().workspaces.map((x) => x.workspaceId)).toContain(workspaceId);

      const declined = await callTool(app, invitee.token, 'respond_to_invitation', { inviteId: second, answer: 'decline' });
      expect(declined.isError, declined.text).toBe(false);
      expect(declined.json).toEqual({ declined: true });
      expect((await callTool(app, invitee.token, 'list_my_invitations', {})).json).toEqual({ invitations: [], nextCursor: null });
      // answering it again is the one sentence, not a 404 status
      const again = await callTool(app, invitee.token, 'respond_to_invitation', { inviteId: second, answer: 'accept' });
      expect(again.isError).toBe(true);
      expect(again.text).toBe('invitation not found or not yours');

      // the inbox write door works for a token caller too
      const marked = await callTool(app, invitee.token, 'mark_notifications_read', { all: true });
      expect(marked.isError, marked.text).toBe(false);
      expect(marked.json).toEqual({ changed: expect.any(Number) });
    } finally {
      await app.close();
    }
  });
});

describe('14.486 the door matrix over the discovery tools', () => {
  it('14.486 a stranger is answered the one sentence (or an empty personal list); the member reads; the lists page', async () => {
    const WS_GONE = 'workspace not found or not visible to you';
    const ws = (x: DoorWorld) => ({ workspaceId: x.workspaceId });
    await runDoorMatrix(w, [
      { tool: 'list_ticket_types', args: ws, stranger: WS_GONE, allowed: { caller: 'member' } },
      { tool: 'list_workflows', args: ws, stranger: WS_GONE, allowed: { caller: 'member' } },
      { tool: 'my_work', args: ws, stranger: WS_GONE, allowed: { caller: 'member' } },
      { tool: 'get_attention', args: ws, stranger: WS_GONE, allowed: { caller: 'member' } },
      { tool: 'list_notifications', args: () => ({}), stranger: { json: { notifications: [], nextCursor: null } }, allowed: { caller: 'member' } },
      { tool: 'list_my_invitations', args: () => ({}), stranger: { json: { invitations: [], nextCursor: null } }, allowed: { caller: 'member' } },
      { tool: 'respond_to_invitation', args: () => ({ inviteId: '01J0N0SUCH1NV1TE000000000A', answer: 'accept' }), stranger: 'invitation not found or not yours' },
    ]);
    // a one-workflow read of an unknown workflow is its own sentence, for a member and a stranger alike
    const unknown = await callTool(w.app, w.member.token, 'list_workflows', { workspaceId: w.workspaceId, workflowId: '01J0N0SUCHW0RKF10W000000AA' });
    expect(unknown.isError).toBe(true);
    expect(unknown.text).toBe('workflow not found or not visible to you');
    // the lists page: ticket types and workflows by offset, notifications with the server's cursor key present
    const types = await callTool(w.app, w.member.token, 'list_ticket_types', { workspaceId: w.workspaceId, limit: 1 });
    const body = types.json as { ticketTypes: unknown[]; nextCursor: string | null };
    expect(body.ticketTypes).toHaveLength(1);
    const all = await callTool(w.app, w.member.token, 'list_ticket_types', { workspaceId: w.workspaceId });
    const total = (all.json as { ticketTypes: unknown[] }).ticketTypes.length;
    expect(body.nextCursor).toBe(total > 1 ? '1' : null);
    const notes = await callTool(w.app, w.member.token, 'list_notifications', { limit: 1 });
    expect(notes.json).toHaveProperty('nextCursor');
  });
});
