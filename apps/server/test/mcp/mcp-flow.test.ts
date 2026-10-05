import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NOT_A_MEMBER_REASON, PERMISSION_ROLE_RULE } from '../../src/permissions/check-permission.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { runDoorMatrix } from './helpers/door-matrix.js';
import { buildDoorWorld, callTool, mk, ok } from './helpers/flow-world.js';

/** Graph Part 5, hosted door. Every call is a `tools/call` on `POST /mcp`. Run LOCALLY. */
let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });

describe('29.375–29.378 the simple writes through the hosted door', () => {
  it('29.375 29.376 a labelled arrow, a relabel, a loop removed from the right end; every event origin mcp', async () => {
    const w = await buildDoorWorld(db, '3753');
    const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' });
    const yes = await mk(w, w.owner, 'Pitch');
    const no = await mk(w, w.owner, 'Rework');
    const link = (args: Record<string, unknown>) => ok(w, w.owner, 'link_tickets', { workspaceId: w.workspaceId, kind: 'leads_to', ...args });
    await link({ ticketId: decision, targetId: yes, action: 'add', label: 'Yes' });
    await link({ ticketId: decision, targetId: no, action: 'add', label: 'No' });
    const refused = await callTool(w.app, w.owner.token, 'link_tickets', { workspaceId: w.workspaceId, kind: 'leads_to', ticketId: decision, targetId: w.ticketId, action: 'add' });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('refused by link.label-required'); // control: the labelled adds above committed
    await link({ ticketId: decision, targetId: yes, action: 'relabel', label: 'Approved' });
    const got = (await ok(w, w.owner, 'get_ticket', { workspaceId: w.workspaceId, ticketId: decision })) as { links: Array<{ kind: string; direction: string; label?: string; ticket: { id: string } }> };
    expect(got.links.find((l) => l.ticket.id === yes)?.label).toBe('Approved');
    expect(got.links.find((l) => l.ticket.id === no)?.label).toBe('No');
    // a loop: yes -> decision as well; removing (yes, decision) must not touch decision -> yes
    await link({ ticketId: yes, targetId: decision, action: 'add' });
    const loop = (await ok(w, w.owner, 'get_ticket', { workspaceId: w.workspaceId, ticketId: decision })) as { links: Array<{ direction: string; ticket: { id: string } }> };
    expect(loop.links.some((l) => l.direction === 'in' && l.ticket.id === yes)).toBe(true); // control for the `false` leg below: the loop's back edge was stored
    await link({ ticketId: yes, targetId: decision, action: 'remove' });
    const after = (await ok(w, w.owner, 'get_ticket', { workspaceId: w.workspaceId, ticketId: decision })) as { links: Array<{ direction: string; ticket: { id: string } }> };
    expect(after.links.some((l) => l.direction === 'out' && l.ticket.id === yes)).toBe(true);
    expect(after.links.some((l) => l.direction === 'in' && l.ticket.id === yes)).toBe(false);
    const origins = await db.pool.query<{ origin: string }>(`SELECT DISTINCT origin FROM events WHERE entity_id = $1 AND type LIKE 'ticket.link_%'`, [decision]);
    expect(origins.rows.map((r) => r.origin)).toEqual(['mcp']);
  });

  it('29.377 29.378 wait-for-all and estimate are claims in the History, attributed to mcp, and clear', async () => {
    const w = await buildDoorWorld(db, '3754');
    const t = await mk(w, w.owner, 'Plan', { estimate: 3 });
    await ok(w, w.owner, 'set_wait_for_all', { workspaceId: w.workspaceId, ticketId: t, value: true });
    await ok(w, w.owner, 'update_ticket', { workspaceId: w.workspaceId, ticketId: t, estimate: 5, reworkEstimate: 2 });
    await ok(w, w.owner, 'set_wait_for_all', { workspaceId: w.workspaceId, ticketId: t, value: false });
    await ok(w, w.owner, 'update_ticket', { workspaceId: w.workspaceId, ticketId: t, estimate: null, reworkEstimate: null });
    const history = (await ok(w, w.owner, 'get_ticket_history', { ticketId: t })) as { events: Array<{ type: string; origin: string; payload: { fieldId?: string; value?: unknown; estimate?: unknown } }> };
    expect(history.events.find((e) => e.type === 'ticket.created')?.payload.estimate).toBe(3);
    const fieldSets = history.events.filter((e) => e.type === 'ticket.field_set').map((e) => [e.payload.fieldId, e.payload.value, e.origin]);
    expect(fieldSets).toEqual([
      ['waitForAll', true, 'mcp'], ['estimate', 5, 'mcp'], ['reworkEstimate', 2, 'mcp'],
      ['waitForAll', null, 'mcp'], ['estimate', null, 'mcp'], ['reworkEstimate', null, 'mcp'],
    ]);
  });

  it('29.375 29.377 door rows: a stranger is answered uniformly, a member may', async () => {
    const w = await buildDoorWorld(db, '3755');
    const NOT_MEMBER = `refused by ${PERMISSION_ROLE_RULE}: ${NOT_A_MEMBER_REASON}`;
    await runDoorMatrix(w, [
      { tool: 'link_tickets', args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, targetId: x.secondTicketId, kind: 'leads_to', action: 'add' }), stranger: 'ticket not found or not visible to you', allowed: { caller: 'member', eventType: 'ticket.link_added' } },
      { tool: 'set_wait_for_all', args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, value: true }), stranger: NOT_MEMBER, allowed: { caller: 'member', eventType: 'ticket.field_set' } },
    ]);
  });
});
