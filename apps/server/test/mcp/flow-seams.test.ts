import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as domain from '@gisik-nokma/domain';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildDoorWorld, mk, rawEvents } from './helpers/flow-world.js';

/**
 * Seam probes for the Part 5 MCP tools. A failure here names the OWNER of the missing piece:
 * do not build it in this plan, report it to the planner and wait (Global Constraints). Run LOCALLY.
 */
let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });

describe('SEAM probes (Part 5 T1)', () => {
  it('SEAM S8 (Graph Part 2): the domain exports what the tools import', () => {
    expect(domain.DECISION_TYPE_ID, 'DECISION_TYPE_ID').toBe('decision');
    expect(typeof domain.estimateValueSchema.safeParse, 'estimateValueSchema').toBe('function');
    expect(domain.estimateValueSchema.safeParse(365).success).toBe(true);
    expect(domain.estimateValueSchema.safeParse(366).success).toBe(false);
    for (const f of ['estimate', 'waitForAll', 'reworkEstimate']) expect(domain.BUILTIN_FIELD_IDS as readonly string[], f).toContain(f);
    expect(domain.TICKET_LINK_KINDS as readonly string[]).toContain('leads_to');
  });

  it('SEAM S1/S3 (typed-links T4, Graph Part 2): a labelled leads_to is stored and the links route returns the label and direction', async () => {
    const w = await buildDoorWorld(db, '3751');
    const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' }); // S8: the Decision seed exists in a new workspace
    const next = await mk(w, w.owner, 'Pitch');
    const [r] = await rawEvents(w, w.owner, [{ entityId: decision, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: next, label: 'Yes' } }]);
    expect(r?.status, `S3: ${r?.reason}`).toBe('committed');
    const res = await w.app.inject({ method: 'GET', url: `/v1/workspaces/${w.workspaceId}/tickets/${decision}/links`, headers: { authorization: `Bearer ${w.owner.sessionToken}` } });
    const rows = res.json<{ links: Array<{ kind: string; direction: string; label?: string | null; ticket: { id: string } }> }>().links;
    expect(rows.find((l) => l.kind === 'leads_to' && l.direction === 'out' && l.ticket.id === next)?.label, 'S1: the links row carries `label`').toBe('Yes');
    // control: the other end sees the same link as incoming, with the label too
    const back = await w.app.inject({ method: 'GET', url: `/v1/workspaces/${w.workspaceId}/tickets/${next}/links`, headers: { authorization: `Bearer ${w.owner.sessionToken}` } });
    expect(back.json<{ links: Array<{ direction: string; label?: string | null }> }>().links.some((l) => l.direction === 'in' && l.label === 'Yes')).toBe(true);
  });

  it('SEAM S2/S3 (Drafts): the ticket detail carries `ticketState.draft` and `key: null`, and a link whose target is a draft takes the `from` form on the draft stream', async () => {
    const w = await buildDoorWorld(db, '3752');
    const draft = domain.newUlid();
    const [created] = await rawEvents(w, w.owner, [{ entityId: draft, type: 'ticket.created', payload: { typeId: 'task', projectId: w.projectId, parentId: null, title: 'A draft', start: 'backlog', draft: true } }]);
    expect(created?.status, `Drafts D2: ${created?.reason}`).toBe('committed');
    const detail = await w.app.inject({ method: 'GET', url: `/v1/workspaces/${w.workspaceId}/tickets/${draft}`, headers: { authorization: `Bearer ${w.owner.sessionToken}` } });
    const read = detail.json<{ key: string | null; ticketState: { draft?: { authorId: string } } }>();
    expect(read.ticketState.draft?.authorId, 'S2 (Drafts T4 G7): `ticketState.draft.authorId`').toBe(w.owner.userId);
    expect(read.key, 'S2: a draft has no key').toBeNull();
    const [linked] = await rawEvents(w, w.owner, [{ entityId: draft, type: 'ticket.link_added', payload: { kind: 'blocks', targetId: draft, from: w.ticketId } }]);
    expect(linked?.status, `S3 (Drafts R42): ${linked?.reason}`).toBe('committed');
    // control: the plain form on the PUBLISHED source's stream, naming the draft, is refused (R43 draft.link-form)
    const [plain] = await rawEvents(w, w.owner, [{ entityId: w.ticketId, type: 'ticket.link_added', payload: { kind: 'relates', targetId: draft } }]);
    expect(plain?.status).toBe('refused');
    expect(plain?.rule).toBe('draft.link-form');
  });
});

describe('SEAM probes (Part 5 T2)', () => {
  it('SEAM S10 (Graph Part 2): the folded ticketState carries outcome and passes after a decision', async () => {
    const w = await buildDoorWorld(db, '3761');
    const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' });
    const next = await mk(w, w.owner, 'Pitch');
    await rawEvents(w, w.owner, [{ entityId: decision, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: next, label: 'Yes' } }]);
    const [decided] = await rawEvents(w, w.owner, [{ entityId: decision, type: 'ticket.decided', payload: { outcome: 'Yes' } }]);
    expect(decided?.status, `Part 2 DC-4: ${decided?.reason}`).toBe('committed');
    const res = await w.app.inject({ method: 'GET', url: `/v1/workspaces/${w.workspaceId}/tickets/${decision}`, headers: { authorization: `Bearer ${w.owner.sessionToken}` } });
    const state = res.json<{ ticketState: { outcome?: string | null; passes?: unknown[] } }>().ticketState;
    expect(state.outcome, 'S10: ticketState.outcome').toBe('Yes');
    expect(state.passes?.length, 'S10: ticketState.passes').toBe(1);
  });

  it('SEAM S4 (Graph Part 3): the flow route answers every member get_flow reads, nodes in flow order', async () => {
    const w = await buildDoorWorld(db, '3762');
    const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' });
    const next = await mk(w, w.owner, 'Pitch');
    await rawEvents(w, w.owner, [{ entityId: decision, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: next, label: 'Yes' } }]);
    const res = await w.app.inject({ method: 'GET', url: `/v1/workspaces/${w.workspaceId}/tickets/${decision}/flow`, headers: { authorization: `Bearer ${w.owner.sessionToken}` } });
    expect(res.statusCode, 'S4: the flow route exists').toBe(200);
    const flow = res.json<Record<string, unknown> & { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> }>();
    for (const k of ['flowId', 'truncated', 'start', 'end', 'nodes', 'edges', 'autoMoves', 'draftCount']) expect(flow, `S4 flow.${k}`).toHaveProperty(k);
    for (const k of ['id', 'key', 'draft', 'title', 'parentId', 'kind', 'state', 'assigneeId', 'waitForAll', 'estimate', 'reworkEstimate', 'round', 'outcome', 'passes', 'resolution', 'alternates', 'periods', 'planned', 'actual', 'tray', 'notes']) {
      expect(flow.nodes[0], `S4 node.${k}`).toHaveProperty(k);
    }
    for (const k of ['kind', 'from', 'to', 'label', 'loop', 'taken']) expect(flow.edges[0], `S4 edge.${k}`).toHaveProperty(k);
    expect(flow.nodes.map((n) => n['id']), 'S4: the Decision precedes what it leads to (flow order)').toEqual([decision, next]);
    // a ticket in no flow: 200, and its only node is itself (the T5 cases and door rows call the route on unconnected tickets)
    const alone = await mk(w, w.owner, 'Alone');
    const lone = await w.app.inject({ method: 'GET', url: `/v1/workspaces/${w.workspaceId}/tickets/${alone}/flow`, headers: { authorization: `Bearer ${w.owner.sessionToken}` } });
    expect(lone.statusCode, 'S4: an unconnected ticket has a flow of one').toBe(200);
    expect(lone.json<{ nodes: Array<{ id: string }> }>().nodes.map((n) => n.id)).toEqual([alone]);
  });
});
