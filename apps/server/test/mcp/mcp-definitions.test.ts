import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { adminOnlyReason, PERMISSION_ROLE_RULE, VISIBILITY_AUTHORITY_REASON } from '../../src/permissions/check-permission.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildDoorWorld, callTool, runDoorMatrix, type DoorWorld } from './helpers/door-matrix.js';

/**
 * MCP-everything T12, against the REAL server through `POST /mcp`. Cases 14.535 and 14.536 (the unit cases
 * 14.530–14.534 are in `packages/mcp-server/test/definition-admin-tools.test.ts`).
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

const WS_GONE = 'workspace not found or not visible to you';
const NOT_ADMIN = `refused by ${PERMISSION_ROLE_RULE}: ${adminOnlyReason('member')}`;
const NOT_VISIBILITY_AUTHORITY = `refused by ${PERMISSION_ROLE_RULE}: ${VISIBILITY_AUTHORITY_REASON}`;
const NOT_ADMIN_SETTINGS = `refused by ${PERMISSION_ROLE_RULE}: Only a workspace owner or admin can change workspace settings.`;

/** Parse-valid fixtures; the workflow and the type take fresh ids per call so a second definition is a new one. */
const newWorkflow = (id = newUlid()) => ({
  id,
  version: 1,
  name: 'Repairs',
  initialStateId: 'open',
  states: [
    { id: 'open', name: 'Open', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'open', to: 'done', rules: [] }],
});
const newType = (workflowId: string) => ({ id: `repair-${newUlid().toLowerCase()}`, name: 'Repair', icon: 'wrench', rank: 3, workflowId, fields: [] });

async function ledger(w: DoorWorld, type: string, actorId: string): Promise<number> {
  const { rows } = await w.db.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM events WHERE workspace_id = $1 AND type = $2 AND origin = 'mcp' AND actor_id = $3`,
    [w.workspaceId, type, actorId],
  );
  return rows[0]?.n ?? 0;
}

describe('14.535 a member is refused, an admin commits', () => {
  it('14.535 the same person: refused each of the five as a member, committing each once the owner makes them an admin', async () => {
    const w = await buildDoorWorld(db, '2535');
    try {
      const typesRes = await w.app.inject({
        method: 'GET',
        url: `/v1/workspaces/${w.workspaceId}/ticket-types`,
        headers: { authorization: `Bearer ${w.owner.sessionToken}` },
      });
      const task = typesRes.json<{ ticketTypes: Array<{ id: string; name: string; workflowId: string }> }>().ticketTypes.find((t) => t.id === 'task')!;
      const wf = newWorkflow();
      const type = newType(wf.id);
      const acts: Array<{ tool: string; args: Record<string, unknown>; refused: string; eventType: string | null }> = [
        { tool: 'update_workspace_settings', args: { workspaceId: w.workspaceId, staleDays: 11, confirm_name: w.workspaceName }, refused: NOT_ADMIN_SETTINGS, eventType: 'workspace.settings_set' },
        { tool: 'define_workflow', args: { workspaceId: w.workspaceId, definition: wf, confirm_name: w.workspaceName }, refused: NOT_ADMIN, eventType: 'workflow.defined' },
        { tool: 'define_ticket_type', args: { workspaceId: w.workspaceId, definition: type, confirm_name: w.workspaceName }, refused: NOT_ADMIN, eventType: 'ticket-type.defined' },
        {
          tool: 'migrate_ticket_type',
          args: { workspaceId: w.workspaceId, typeId: 'task', fromWorkflowId: task.workflowId, toWorkflowId: wf.id, stateMap: {}, confirm_name: task.name },
          refused: NOT_ADMIN,
          eventType: null,
        },
        { tool: 'set_visibility', args: { workspaceId: w.workspaceId, ticketId: w.ticketId, mode: 'project', confirm_name: w.ticketKey }, refused: NOT_VISIBILITY_AUTHORITY, eventType: 'visibility.set' },
      ];

      // 1. The plain member: every confirmed act is refused in the product's own words, and nothing is written.
      for (const a of acts) {
        const r = await callTool(w.app, w.member.token, a.tool, a.args);
        expect(r.isError, `${a.tool}: member`).toBe(true);
        expect(r.text, `${a.tool}: member`).toBe(a.refused);
        if (a.eventType !== null) expect(await ledger(w, a.eventType, w.member.userId), `${a.tool}: nothing written`).toBe(0);
      }

      // 2. CONTROL, the same person after the owner makes them an admin: the same five calls commit.
      const grant = await w.app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { authorization: `Bearer ${w.owner.sessionToken}` },
        payload: {
          events: [
            {
              id: newUlid(),
              workspaceId: w.workspaceId,
              entity: { kind: 'membership', id: `${w.workspaceId}:${w.member.userId}` },
              type: 'membership.granted',
              version: 1,
              payload: { userId: w.member.userId, role: 'admin' },
              actorId: w.owner.userId,
              origin: 'web',
              clientTime: new Date().toISOString(),
            },
          ],
        },
      });
      expect(grant.json<{ results: Array<{ status: string; reason?: string }> }>().results[0]).toMatchObject({ status: 'committed' });
      for (const a of acts) {
        const r = await callTool(w.app, w.member.token, a.tool, a.args);
        expect(r.isError, `${a.tool}: admin: ${r.text}`).toBe(false);
        if (a.eventType !== null) expect(await ledger(w, a.eventType, w.member.userId), `${a.tool}: ${a.eventType} with origin mcp`).toBe(1);
      }
    } finally {
      await w.app.close();
    }
  });
});

describe('14.536 the door matrix', () => {
  it('14.536 every definition, visibility and settings act: stranger, member, owner', async () => {
    const w = await buildDoorWorld(db, '2536');
    try {
      const wf = newWorkflow();
      await runDoorMatrix(w, [
        {
          tool: 'update_workspace_settings',
          args: (x) => ({ workspaceId: x.workspaceId, staleDays: 9, confirm_name: x.workspaceName }),
          stranger: WS_GONE,
          forbidden: { text: NOT_ADMIN_SETTINGS },
          allowed: { caller: 'owner', eventType: 'workspace.settings_set' },
        },
        {
          tool: 'set_visibility',
          args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, mode: 'project', confirm_name: x.ticketKey }),
          stranger: 'ticket not found or not visible to you',
          forbidden: { text: NOT_VISIBILITY_AUTHORITY },
          allowed: { caller: 'owner', eventType: 'visibility.set' },
        },
        {
          tool: 'define_ticket_type',
          args: (x) => ({ workspaceId: x.workspaceId, definition: newType(wf.id), confirm_name: x.workspaceName }),
          stranger: WS_GONE,
          forbidden: { text: NOT_ADMIN },
          allowed: { caller: 'owner', eventType: 'ticket-type.defined' },
        },
        {
          tool: 'migrate_ticket_type',
          args: (x) => ({ workspaceId: x.workspaceId, typeId: 'task', fromWorkflowId: 'a', toWorkflowId: 'b', stateMap: {}, confirm_name: 'Task' }),
          stranger: WS_GONE,
        },
        {
          tool: 'define_workflow',
          args: (x) => ({ workspaceId: x.workspaceId, definition: wf, confirm_name: x.workspaceName }),
          stranger: WS_GONE,
          forbidden: { text: NOT_ADMIN },
          allowed: { caller: 'owner', eventType: 'workflow.defined' },
        },
      ]);
    } finally {
      await w.app.close();
    }
  });
});
