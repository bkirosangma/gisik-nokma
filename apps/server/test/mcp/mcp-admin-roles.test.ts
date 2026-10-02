import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { WORKSPACE_MEMBERSHIP_REASON, WORKSPACE_OWNER_GRANT_REASON, adminOnlyReason, PERMISSION_ROLE_RULE } from '../../src/permissions/check-permission.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildOAuthApp, hostedToken } from '../helpers/oauth.js';
import { signInWithPhone } from '../helpers/session.js';
import { buildDoorWorld, callTool, runDoorMatrix, type DoorWorld } from './helpers/door-matrix.js';

/**
 * MCP-everything T11 (plan Task 11): the admin tools through the HOSTED door. 14.505 is the guest / member /
 * admin / owner matrix; 14.506 is the stranger-and-member door matrix over every act.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

describe('14.506 every admin act through the door', () => {
  let w: DoorWorld;
  beforeAll(async () => {
    w = await buildDoorWorld(db, '2506');
  });
  afterAll(async () => {
    await w.app.close();
  });

  it('14.506 stranger: one sentence; member: the gate\'s words; owner: an mcp event', async () => {
    const WS_GONE = 'workspace not found or not visible to you';
    const NOT_ADMIN = `refused by ${PERMISSION_ROLE_RULE}: ${adminOnlyReason('member')}`;
    await runDoorMatrix(w, [
      { tool: 'manage_groups', args: (x) => ({ workspaceId: x.workspaceId, action: 'list' }), stranger: WS_GONE, allowed: { caller: 'member' } },
      { tool: 'manage_groups', args: (x) => ({ workspaceId: x.workspaceId, action: 'create', name: 'Front', confirm_name: x.workspaceName }), stranger: WS_GONE,
        forbidden: { text: NOT_ADMIN }, allowed: { caller: 'owner', eventType: 'group.created' } },
      { tool: 'change_prefix', args: (x) => ({ workspaceId: x.workspaceId, prefix: 'DM', confirm_name: x.workspaceName }), stranger: WS_GONE,
        forbidden: { text: NOT_ADMIN }, allowed: { caller: 'owner', eventType: 'workspace.prefix_changed' } },
      { tool: 'manage_members', args: (x) => ({ workspaceId: x.workspaceId, action: 'add_to_project', userId: x.member.userId, projectId: x.projectId, projectAdmin: true, confirm_name: x.memberName }),
        stranger: WS_GONE, allowed: { caller: 'owner', eventType: 'project.member_added' } },
      { tool: 'manage_members', args: (x) => ({ workspaceId: x.workspaceId, action: 'invite', address: '+911100099999', channel: 'phone', inviteRole: 'member', confirm_name: '+911100099999' }),
        stranger: WS_GONE, forbidden: { text: NOT_ADMIN }, allowed: { caller: 'owner' } },
    ]);
    // CONTROL, same `it`: the preview a stranger-free owner call gets, with no event (the matrix above only runs confirmed acts).
    const preview = await callTool(w.app, w.owner.token, 'change_prefix', { workspaceId: w.workspaceId, prefix: 'XX' });
    expect(preview.json).toMatchObject({ preview: true, nothingChanged: true });
  });
});

describe('14.505 the role matrix through the hosted door', () => {
  it('14.505 guest and member are refused, an admin works below owner, only the owner grants owner', async () => {
    const { app, otp } = buildOAuthApp(db);
    await app.ready();
    try {
      const person = async (n: number) => {
        const u = await signInWithPhone(app, otp, `+91110002505${n}`);
        return { userId: u.userId, sessionToken: u.token, token: await hostedToken(app, db.pool, u.userId) };
      };
      const [owner, admin, member, guest] = [await person(1), await person(2), await person(3), await person(4)] as const;
      const name = 'Roles Co';
      const workspaceId = (await app.inject({ method: 'POST', url: '/v1/workspaces', headers: { authorization: `Bearer ${owner.sessionToken}` }, payload: { name } })).json<{ workspaceId: string }>().workspaceId;
      const grant = (who: { userId: string }, role: string) => ({
        id: newUlid(), workspaceId, entity: { kind: 'membership', id: `${workspaceId}:${who.userId}` }, type: 'membership.granted', version: 1,
        payload: { userId: who.userId, role }, actorId: owner.userId, origin: 'web', clientTime: new Date().toISOString(),
      });
      const res = await app.inject({ method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${owner.sessionToken}` }, payload: { events: [grant(admin, 'admin'), grant(member, 'member'), grant(guest, 'guest')] } });
      for (const r of res.json<{ results: Array<{ status: string; reason?: string }> }>().results) expect(r.status, r.reason).toBe('committed');
      const nameOf = async (userId: string) => (await app.inject({ method: 'GET', url: `/v1/workspaces/${workspaceId}/members`, headers: { authorization: `Bearer ${owner.sessionToken}` } }))
        .json<{ members: Array<{ userId: string; displayName: string }> }>().members.find((m) => m.userId === userId)!.displayName;
      const memberName = await nameOf(member.userId);

      const acts = (confirmed: boolean, extra: { role: string }) => [
        ['manage_members', { workspaceId, action: 'change_role', userId: member.userId, role: extra.role, ...(confirmed ? { confirm_name: memberName } : {}) }],
        ['manage_groups', { workspaceId, action: 'create', name: `G ${extra.role}`, ...(confirmed ? { confirm_name: name } : {}) }],
        ['change_prefix', { workspaceId, prefix: 'RC', ...(confirmed ? { confirm_name: name } : {}) }],
      ] as const;

      // CONTROL first, same `it`: the owner's confirmed prefix change commits (so the refusals below are the gate, not a bad call).
      const control = await callTool(app, owner.token, 'change_prefix', { workspaceId, prefix: 'RC', confirm_name: name });
      expect(control.isError, control.text).toBe(false);

      const refused: Record<string, string[]> = { guest: [], member: [] };
      for (const [label, who] of [['guest', guest], ['member', member]] as const) {
        for (const [tool, args] of acts(true, { role: 'admin' })) {
          const r = await callTool(app, who.token, tool, { ...args });
          expect(r.isError, `${label} ${tool}: ${r.text}`).toBe(true);
          refused[label]!.push(r.text);
        }
      }
      // A member is refused in the gate's own words; a guest is not shown the roster or the groups at all (the reads 404),
      // so the guest hears the uniform sentence for those two and the gate's words for the prefix.
      const notAdmin = `refused by ${PERMISSION_ROLE_RULE}: ${adminOnlyReason('member')}`;
      // `membership.granted` has its own sentence in the gate; the group and prefix events share the generic one.
      expect(refused['member']).toEqual([`refused by ${PERMISSION_ROLE_RULE}: ${WORKSPACE_MEMBERSHIP_REASON}`, notAdmin, notAdmin]);
      expect(refused['guest']).toEqual([
        'workspace not found or not visible to you',
        'workspace not found or not visible to you',
        `refused by ${PERMISSION_ROLE_RULE}: ${adminOnlyReason('guest')}`,
      ]);

      // An admin: group create and prefix change commit; a role change below owner commits; granting owner is refused.
      for (const [tool, args] of acts(true, { role: 'member' }).slice(1)) {
        const r = await callTool(app, admin.token, tool, { ...args });
        expect(r.isError, `admin ${tool}: ${r.text}`).toBe(false);
      }
      const below = await callTool(app, admin.token, 'manage_members', { workspaceId, action: 'change_role', userId: member.userId, role: 'guest', confirm_name: memberName });
      expect(below.isError, below.text).toBe(false);
      const ownerGrant = { workspaceId, action: 'change_role', userId: member.userId, role: 'owner', confirm_name: memberName };
      const byAdmin = await callTool(app, admin.token, 'manage_members', ownerGrant);
      expect(byAdmin.isError).toBe(true);
      expect(byAdmin.text).toContain(WORKSPACE_OWNER_GRANT_REASON);
      const byOwner = await callTool(app, owner.token, 'manage_members', ownerGrant);
      expect(byOwner.isError, byOwner.text).toBe(false);
    } finally {
      await app.close();
    }
  });
});
