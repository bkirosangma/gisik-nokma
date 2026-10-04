import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { filterSpecSchema } from '@gisik-nokma/domain';
import { buildOAuthApp, hostedToken } from '../helpers/oauth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';
import { buildDoorWorld, callTool, type DoorWorld } from './helpers/door-matrix.js';
import { grantRole } from './helpers/sweep2.js';

/**
 * MCP sweep 2 T6, cases 14.628 (hosted half), 14.631, 14.633, 14.635, 14.636, 14.637 (the package half is
 * `notification-preferences.test.ts`). Every call is a `tools/call` on `POST /mcp`. Run LOCALLY.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

const route = (w: DoorWorld, who: DoorWorld['owner'], method: 'GET' | 'PUT', url: string, payload?: unknown) =>
  w.app.inject({ method, url, headers: { authorization: `Bearer ${who.sessionToken}` }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) });
const saveFilters = (w: DoorWorld, who: DoorWorld['owner'], savedFilters: unknown[]) =>
  route(w, who, 'PUT', `/v1/me/preferences?workspaceId=${w.workspaceId}`, { savedFilters, listColumns: {}, grouping: {} });

describe('notification preferences through the hosted door', () => {
  it('14.628 set_notification_preferences reaches PUT /v1/me/notification-preferences on the hosted door; the stored document is what the app\'s own route reads', async () => {
    const w = await buildDoorWorld(db, '2628');
    const done = await callTool(w.app, w.member.token, 'set_notification_preferences', { mute: ['mention', 'stale-ticket'] });
    expect(done.isError, done.text).toBe(false);
    expect(done.json).toEqual({ mutedKinds: ['mention', 'stale-ticket'], changed: true });
    expect((await route(w, w.member, 'GET', '/v1/me/notification-preferences')).json()).toEqual({ mutedKinds: ['mention', 'stale-ticket'] });
    expect((await callTool(w.app, w.member.token, 'get_notification_preferences', {})).json).toMatchObject({ mutedKinds: ['mention', 'stale-ticket'] }); // CONTROL: the read tool agrees
  });

  it('14.631 muting mention hides mention rows from list_notifications and the unread count, unmuting brings them back, and the rows were never deleted', async () => {
    const w = await buildDoorWorld(db, '2631');
    const mention = `@[${w.memberName}](user:${w.member.userId})`;
    const added = await callTool(w.app, w.owner.token, 'add_comment', { workspaceId: w.workspaceId, ticketId: w.ticketId, markdown: `ping ${mention}` });
    expect(added.isError, added.text).toBe(false);
    const kinds = async () => ((await callTool(w.app, w.member.token, 'list_notifications', {})).json as { notifications: Array<{ kind: string }> }).notifications.map((n) => n.kind);
    const unread = async () => (await route(w, w.member, 'GET', '/v1/me/notifications/unread-count')).json<{ unread: number }>().unread;
    const rows = async () => (await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'mention'`, [w.member.userId])).rows[0]!.n;
    await vi.waitFor(async () => expect(await kinds()).toContain('mention'), { timeout: 5000, interval: 50 }); // the fan-out runs after the commit
    const before = await unread();
    expect(before).toBeGreaterThan(0);
    const muted = await callTool(w.app, w.member.token, 'set_notification_preferences', { mute: ['mention'] });
    expect(muted.isError, muted.text).toBe(false);
    expect(await kinds()).not.toContain('mention');
    expect(await unread()).toBe(before - (await rows()));
    expect(await rows()).toBeGreaterThan(0); // hidden, never deleted
    const unmuted = await callTool(w.app, w.member.token, 'set_notification_preferences', { unmute: ['mention'] });
    expect(unmuted.isError, unmuted.text).toBe(false);
    expect(await kinds()).toContain('mention');
    expect(await unread()).toBe(before);
  });

  it('14.633 isolation: one person\'s set leaves another person\'s document unchanged', async () => {
    const w = await buildDoorWorld(db, '2633');
    await callTool(w.app, w.owner.token, 'set_notification_preferences', { mute: ['assignment'] });
    expect((await callTool(w.app, w.member.token, 'get_notification_preferences', {})).json).toMatchObject({ mutedKinds: [] });
    expect((await callTool(w.app, w.owner.token, 'get_notification_preferences', {})).json).toMatchObject({ mutedKinds: ['assignment'] }); // CONTROL
  });
});

describe('list_saved_filters through the hosted door', () => {
  it('14.635 a saved filter comes back unchanged, is accepted by filterSpecSchema, and list_tickets takes it as its filter', async () => {
    const w = await buildDoorWorld(db, '2635');
    const assigned = await callTool(w.app, w.owner.token, 'assign_ticket', { workspaceId: w.workspaceId, ticketId: w.ticketId, assigneeId: w.member.userId });
    expect(assigned.isError, assigned.text).toBe(false);
    const spec = { assigneeId: w.member.userId, closed: false };
    expect((await saveFilters(w, w.member, [{ id: 'f1', name: 'Mine, open', filterSpec: spec }])).statusCode).toBe(200);
    const out = await callTool(w.app, w.member.token, 'list_saved_filters', { workspaceId: w.workspaceId });
    expect(out.isError, out.text).toBe(false);
    const filter = (out.json as { savedFilters: Array<{ id: string; name: string; filter: unknown }> }).savedFilters[0]!;
    expect(filter).toEqual({ id: 'f1', name: 'Mine, open', filter: spec });
    expect(filterSpecSchema.safeParse(filter.filter).success).toBe(true);
    const tickets = await callTool(w.app, w.member.token, 'list_tickets', { projectId: w.projectId, filter: filter.filter });
    expect(tickets.isError, tickets.text).toBe(false);
    expect(tickets.text).toContain(w.ticketId);
    expect(tickets.text).not.toContain(w.secondTicketId); // CONTROL: the filter filtered
  });

  it('14.636 isolation: another person\'s saved filters in the same workspace never appear', async () => {
    const w = await buildDoorWorld(db, '2636');
    expect((await saveFilters(w, w.owner, [{ id: 'o1', name: 'Owner only', filterSpec: { closed: false } }])).statusCode).toBe(200);
    const member = await callTool(w.app, w.member.token, 'list_saved_filters', { workspaceId: w.workspaceId });
    expect(member.json).toEqual({ workspaceId: w.workspaceId, savedFilters: [] });
    const owner = await callTool(w.app, w.owner.token, 'list_saved_filters', { workspaceId: w.workspaceId });
    expect((owner.json as { savedFilters: Array<{ id: string }> }).savedFilters.map((f) => f.id)).toEqual(['o1']); // CONTROL
  });

  it('14.637 a guest gets their own filters; a stranger and an unknown workspace get the uniform sentence', async () => {
    const { app, otp } = buildOAuthApp(db);
    await app.ready();
    const owner = await signInWithPhone(app, otp, '+911100002637');
    const guest = await signInWithPhone(app, otp, '+911100002638');
    const stranger = await signInWithPhone(app, otp, '+911100002639');
    const ws = (await app.inject({ method: 'POST', url: '/v1/workspaces', headers: { authorization: `Bearer ${owner.token}` }, payload: { name: 'Guest Co' } })).json<{ workspaceId: string }>().workspaceId;
    await grantRole(app, { userId: owner.userId, sessionToken: owner.token }, ws, guest.userId, 'guest');
    const saved = await app.inject({
      method: 'PUT', url: `/v1/me/preferences?workspaceId=${ws}`, headers: { authorization: `Bearer ${guest.token}` },
      payload: { savedFilters: [{ id: 'g1', name: 'Guest view', filterSpec: { closed: false } }], listColumns: {}, grouping: {} },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const as = async (userId: string, workspaceId: string) => callTool(app, await hostedToken(app, db.pool, userId), 'list_saved_filters', { workspaceId });
    const own = await as(guest.userId, ws);
    expect((own.json as { savedFilters: Array<{ id: string }> }).savedFilters.map((f) => f.id)).toEqual(['g1']); // a guest keeps their own
    for (const [label, userId, workspaceId] of [['stranger', stranger.userId, ws], ['unknown workspace', guest.userId, '01J0000000000000000000NONE']] as const) {
      const refused = await as(userId, workspaceId);
      expect(refused.isError, label).toBe(true);
      expect(refused.text, label).toBe('workspace not found or not visible to you');
    }
  });
});
