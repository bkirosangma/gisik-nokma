import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, SYSTEM_ACTOR_FLOW } from '@gisik-nokma/domain';
import { NOT_A_MEMBER_REASON, PERMISSION_ROLE_RULE } from '../../src/permissions/check-permission.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { runDoorMatrix } from './helpers/door-matrix.js';
import { buildDoorWorld, callTool, mk, ok, rawEvents, until } from './helpers/flow-world.js';

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

describe('29.380 29.381 get_flow and get_ticket through the hosted door', () => {
  /** Hide a ticket from the world's member: explicit visibility naming the owner alone (the 28.196 precedent; a member sees every project). */
  const hide = async (w: Awaited<ReturnType<typeof buildDoorWorld>>, ticketId: string) => {
    const key = ((await ok(w, w.owner, 'get_ticket', { workspaceId: w.workspaceId, ticketId })) as { key: string }).key;
    await ok(w, w.owner, 'set_visibility', { workspaceId: w.workspaceId, ticketId, mode: 'explicit', userIds: [w.owner.userId], confirm_name: key });
    // the control that the hide worked: the member cannot read it
    expect((await callTool(w.app, w.member.token, 'get_ticket', { workspaceId: w.workspaceId, ticketId })).isError).toBe(true);
  };

  it('29.380 a member who cannot see the Decision sees neither its id nor its arrows; the owner sees both', async () => {
    const w = await buildDoorWorld(db, '3763');
    const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' });
    await hide(w, decision);
    const visible = await mk(w, w.owner, 'Pitch');
    await ok(w, w.owner, 'link_tickets', { workspaceId: w.workspaceId, ticketId: decision, targetId: visible, kind: 'leads_to', action: 'add', label: 'Yes' });
    const asMember = await ok(w, w.member, 'get_flow', { workspaceId: w.workspaceId, ticketId: visible });
    expect(JSON.stringify(asMember)).not.toContain(decision);
    expect((asMember['nodes'] as Array<{ id: string }>).map((n) => n.id)).toEqual([visible]);
    const asOwner = await ok(w, w.owner, 'get_flow', { workspaceId: w.workspaceId, ticketId: visible });
    expect((asOwner['nodes'] as Array<{ id: string }>).map((n) => n.id)).toEqual([decision, visible]);
    expect((asOwner['edges'] as Array<{ label: string }>)[0]?.label).toBe('Yes');
  });

  it('29.381 get_ticket carries passes after a decision and list_ticket_types lists the Decision', async () => {
    const w = await buildDoorWorld(db, '3764');
    const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' });
    const next = await mk(w, w.owner, 'Pitch');
    await ok(w, w.owner, 'link_tickets', { workspaceId: w.workspaceId, ticketId: decision, targetId: next, kind: 'leads_to', action: 'add', label: 'Yes' });
    const [decided] = await rawEvents(w, w.owner, [{ entityId: decision, type: 'ticket.decided', payload: { outcome: 'Yes' } }]);
    expect(decided?.status, decided?.reason).toBe('committed');
    const got = (await ok(w, w.owner, 'get_ticket', { workspaceId: w.workspaceId, ticketId: decision })) as { passes: Array<{ pass: number; outcome: string }>; ticketState: Record<string, unknown> };
    expect(got.passes.map((p) => [p.pass, p.outcome])).toEqual([[1, 'Yes']]);
    expect(got.ticketState).not.toHaveProperty('passes');
    expect(got.ticketState['outcome']).toBe('Yes');
    const types = (await ok(w, w.owner, 'list_ticket_types', { workspaceId: w.workspaceId })) as { ticketTypes: Array<{ id: string; rank: number }> };
    expect(types.ticketTypes.find((t) => t.id === 'decision')?.rank).toBe(3);
  });

  // The unit test's fake `ticketState` holds exactly the members `withFlowFacts` strips, so it cannot catch an id Part 2
  // carries somewhere else (Review Focus 3): this reads the REAL detail of a Not-taken step.
  it('29.381 get_ticket on a Not-taken step never carries the id of a Decision the member cannot read; the owner sees it', async () => {
    const w = await buildDoorWorld(db, '3765');
    const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' });
    await hide(w, decision);
    const yes = await mk(w, w.owner, 'Pitch', { estimate: 3 });
    const no = await mk(w, w.owner, 'Rework');
    await rawEvents(w, w.owner, [
      { entityId: decision, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: yes, label: 'Yes' } },
      { entityId: decision, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: no, label: 'No' } },
    ]);
    const [decided] = await rawEvents(w, w.owner, [{ entityId: decision, type: 'ticket.decided', payload: { outcome: 'Yes' } }]);
    expect(decided?.status, decided?.reason).toBe('committed');
    // The flow actor's close of the branch not taken. Part 3's settle cascade, which files it, is not on this release yet, so
    // the close is applied as SYSTEM_ACTOR_FLOW the way flow-view.test.ts seeds one (after the ticket's own events).
    const last = async (sql: string, arg: string) => (await db.pool.query<{ n: number }>(sql, [arg])).rows[0]!.n;
    const seq = await last('SELECT COALESCE(MAX(seq), 0)::int AS n FROM events WHERE entity_id = $1', no);
    const workspaceSeq = await last('SELECT COALESCE(MAX(workspace_seq), 0)::int AS n FROM events WHERE workspace_id = $1', w.workspaceId);
    const now = new Date().toISOString();
    await applyCommitted(db.pool, [makeCommitted({
      workspaceId: w.workspaceId, actorId: SYSTEM_ACTOR_FLOW, entity: { kind: 'ticket', id: no }, type: 'ticket.closed', seq: seq + 1, workspaceSeq: workspaceSeq + 1, clientTime: now, serverTime: now,
      payload: { cause: { kind: 'branch-not-taken', decisionTicketId: decision, outcome: 'Yes', pass: 1, decidedBy: w.owner.userId, decisionEventId: newUlid() } },
    })]);
    const read = (who: typeof w.owner) => until('the Not-taken close', async () => {
      const r = await callTool(w.app, who.token, 'get_ticket', { workspaceId: w.workspaceId, ticketId: no });
      return r.isError || !(r.json as { resolution?: unknown }).resolution ? null : r;
    });
    const asOwner = await read(w.owner);
    expect((asOwner.json as { resolution: unknown }).resolution).toMatchObject({ kind: 'not-taken', outcome: 'Yes', pass: 1, decision: { id: decision } }); // control: the owner can read the Decision
    const asMember = await read(w.member);
    // the hidden Decision's branch goes with it (planner ruling 2026-10-06 05:46): no outcome key, where the owner's above keeps it
    const memberResolution = (asMember.json as { resolution: Record<string, unknown> }).resolution;
    expect(memberResolution).toEqual({ kind: 'not-taken', pass: 1, decision: null });
    expect(Object.keys(memberResolution).sort()).toEqual(['decision', 'kind', 'pass']);
    expect(asMember.text).not.toContain(decision); // the WHOLE reply, not just the member this tool knows about
    // the real flow answer parses with passes, a Not-taken resolution, alternates, an estimate and the automatic close in it
    const flow = (await ok(w, w.owner, 'get_flow', { workspaceId: w.workspaceId, ticketId: no })) as {
      nodes: Array<{ id: string; estimate: number | null; passes: unknown[]; resolution: { decisionTicketId: string | null } | null }>;
      autoMoves: Array<{ ticketId: string; kind: string; becauseTicketId: string | null }>;
    };
    expect(flow.nodes.map((n) => n.id).sort()).toEqual([decision, yes, no].sort());
    expect(flow.nodes.find((n) => n.id === decision)?.passes).toHaveLength(1);
    expect(flow.nodes.find((n) => n.id === yes)?.estimate).toBe(3);
    expect(flow.nodes.find((n) => n.id === no)?.resolution?.decisionTicketId).toBe(decision);
    expect(flow.autoMoves).toContainEqual(expect.objectContaining({ ticketId: no, kind: 'branch-not-taken', becauseTicketId: decision }));
    // and the member's flow from the same step: the Decision is a hole, so its id is nowhere
    const memberFlow = await ok(w, w.member, 'get_flow', { workspaceId: w.workspaceId, ticketId: no });
    expect(JSON.stringify(memberFlow)).not.toContain(decision);
  });
});
