import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildOAuthApp, hostedToken } from '../helpers/oauth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * MCP CRUD plan Task 9. Case 14.338 (14.337 is the manual; 14.339 and 14.340 are 🧪, run on the dev stack).
 *
 * One person, one HOSTED token, every step a `tools/call` against `POST /mcp` — the door an assistant
 * uses — on the real app and a real database, with nothing stubbed. Run LOCALLY (CI does not run on a dev PR).
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

const rpc = (method: string, params: unknown, id = 1) => ({ jsonrpc: '2.0', id, method, params });

describe('MCP CRUD round trip through the hosted door', () => {
  it('14.338 workspace → project → rename → archive → restore → delete → undelete → tickets → delete → undelete, every event origin mcp', async () => {
    const { app, otp } = buildOAuthApp(db);
    await app.ready();
    const user = await signInWithPhone(app, otp, '+911100002338');
    const token = await hostedToken(app, db.pool, user.userId);

    /** The id of every event a tool COMMITTED, as the tool's own answer names it. */
    const written: string[] = [];
    /** `tools/call` over `POST /mcp`, unwrapped to what the assistant reads. */
    const call = async (name: string, args: Record<string, unknown>) => {
      const res = await (app as FastifyInstance).inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-06-18',
          authorization: `Bearer ${token}`,
        },
        payload: rpc('tools/call', { name, arguments: args }),
      });
      expect(res.statusCode).toBe(200);
      const result = res.json().result as { isError?: boolean; content: Array<{ text: string }> };
      const text = result.content[0]?.text ?? '';
      const json = result.isError === true ? null : (JSON.parse(text) as Record<string, unknown>);
      const results = (json?.results as Array<{ eventId?: string }> | undefined) ?? [json as { eventId?: string } | null];
      for (const r of results) if (typeof r?.eventId === 'string') written.push(r.eventId);
      return { isError: result.isError === true, text, json };
    };
    const ledger = async (workspaceId: string) =>
      (await db.pool.query<{ type: string }>(`SELECT type FROM events WHERE workspace_id = $1`, [workspaceId])).rows;
    const committed = (r: { isError: boolean; json: Record<string, unknown> | null }) => {
      expect(r.isError).toBe(false);
      expect((r.json as { status?: string }).status).toBe('committed');
    };

    // 1. create_workspace — the founding REST door.
    const founded = await call('create_workspace', { name: 'Round Trip Co' });
    expect(founded.isError).toBe(false);
    const workspaceId = founded.json?.workspaceId as string;
    expect(workspaceId).toMatch(/^[0-9A-Z]{26}$/);

    // 2. create_project — ONE batch, the founder joins as project admin.
    const made = await call('create_project', { workspaceId, name: 'Counter', description: 'The shop counter' });
    expect(made.isError).toBe(false);
    const projectId = made.json?.projectId as string;
    expect((made.json?.results as Array<{ status: string }>).map((r) => r.status)).toEqual(['committed', 'committed']);
    expect((await call('get_project', { projectId })).json).toMatchObject({
      name: 'Counter', description: 'The shop counter', archived: false,
    });

    // 3. update_project — the new name is what every later exact-name check must use.
    committed(await call('update_project', { projectId, name: 'Counter Desk' }));
    expect((await call('get_project', { projectId })).json).toMatchObject({ name: 'Counter Desk', description: 'The shop counter' });

    // CONTROL: the OLD name, a wrong case and no name at all are each refused, name the real one, and change nothing.
    const before = (await ledger(workspaceId)).length;
    for (const confirm_name of ['Counter', 'counter desk', undefined]) {
      const refused = await call('archive_project', { projectId, ...(confirm_name === undefined ? {} : { confirm_name }) });
      expect(refused.isError).toBe(true);
      expect(refused.text).toContain('confirm_name must be "Counter Desk"');
    }
    expect((await ledger(workspaceId)).length).toBe(before);
    expect((await call('get_project', { projectId })).json).toMatchObject({ archived: false });

    // 4. archive_project (exact name) → 5. restore_project.
    committed(await call('archive_project', { projectId, confirm_name: 'Counter Desk' }));
    expect((await call('get_project', { projectId })).json).toMatchObject({ archived: true });
    committed(await call('restore_project', { projectId }));
    expect((await call('get_project', { projectId })).json).toMatchObject({ archived: false });

    // 6. delete_project (exact name) → Deleted items; 7. undelete_project.
    const deleted = await call('delete_project', { projectId, confirm_name: 'Counter Desk' });
    committed(deleted);
    expect(deleted.json?.note).toContain('15 days');
    expect((await call('get_project', { projectId })).json).toMatchObject({ deleted: true, name: 'Counter Desk' });
    committed(await call('undelete_project', { projectId }));
    expect((await call('get_project', { projectId })).json).toMatchObject({ archived: false, name: 'Counter Desk' });

    // 8. list_tickets by workspace with "me" — non-vacuous: one ticket assigned to me, one not.
    const mine = await call('create_ticket', { workspaceId, projectId, typeId: 'task', title: 'Mine' });
    const other = await call('create_ticket', { workspaceId, projectId, typeId: 'task', title: 'Unassigned' });
    expect(mine.isError).toBe(false);
    expect(other.isError).toBe(false);
    committed(await call('assign_ticket', { workspaceId, ticketId: mine.json?.ticketId as string, assigneeId: user.userId }));
    const listed = await call('list_tickets', { workspaceId, filter: { assigneeId: 'me' } });
    expect(listed.isError).toBe(false);
    const body = listed.json as { projectId: string | null; groups: Array<{ cards: Array<{ ticketId: string }> }> };
    expect(body.projectId).toBeNull();
    expect(body.groups.flatMap((g) => g.cards.map((c) => c.ticketId))).toEqual([mine.json?.ticketId]);
    // CONTROL, same `it`: without the filter both tickets are listed, so the answer above is a filtered one.
    const all = (await call('list_tickets', { workspaceId })).json as typeof body;
    expect(all.groups.flatMap((g) => g.cards.map((c) => c.ticketId)).sort()).toEqual(
      [mine.json?.ticketId as string, other.json?.ticketId as string].sort(),
    );

    // 9. delete_workspace (exact name) → 10. undelete_workspace.
    const wrong = await call('delete_workspace', { workspaceId, confirm_name: 'Round Trip' });
    expect(wrong.isError).toBe(true);
    expect(wrong.text).toContain('confirm_name must be "Round Trip Co"');
    expect((await call('get_workspace', { workspaceId })).json).not.toHaveProperty('deleted');
    const gone = await call('delete_workspace', { workspaceId, confirm_name: 'Round Trip Co' });
    committed(gone);
    expect(gone.json?.note).toContain('15 days');
    expect((await call('get_workspace', { workspaceId })).json).toMatchObject({ deleted: true });
    committed(await call('undelete_workspace', { workspaceId }));
    expect((await call('get_workspace', { workspaceId })).json).toMatchObject({ name: 'Round Trip Co', archived: false });

    // The ledger: every event the tools wrote — in call order — carries origin `mcp`; so does the founding
    // `workspace.created` (the REST door answers no event id, so it is read by type).
    const byId = new Map(
      (
        await db.pool.query<{ id: string; type: string; origin: string }>(
          `SELECT id, type, origin FROM events WHERE workspace_id = $1 AND (id = ANY($2) OR type = 'workspace.created')`,
          [workspaceId, written],
        )
      ).rows.map((r) => [r.id, r]),
    );
    const wrote = written.map((id) => byId.get(id));
    expect(wrote.map((r) => r?.type)).toEqual([
      'project.created', 'project.member_added', 'project.updated',
      'project.archived', 'project.restored', 'project.deleted', 'project.undeleted',
      'ticket.created', 'ticket.created', 'ticket.assigned',
      'workspace.deleted', 'workspace.undeleted',
    ]);
    const founding = [...byId.values()].filter((r) => r.type === 'workspace.created');
    expect([...wrote, ...founding].map((r) => r?.origin)).toEqual([...wrote, ...founding].map(() => 'mcp'));
    // CONTROL, same `it`: the check is not blind to other origins — the founding seeds the server writes
    // itself sit in the same workspace and are NOT `mcp` (by design), so "all mcp" above is a real filter result.
    const seeds = (
      await db.pool.query<{ origin: string }>(
        `SELECT origin FROM events WHERE workspace_id = $1 AND type <> 'workspace.created' AND NOT (id = ANY($2))`,
        [workspaceId, written],
      )
    ).rows;
    expect(seeds.some((r) => r.origin !== 'mcp')).toBe(true);
    await app.close();
  });
});
