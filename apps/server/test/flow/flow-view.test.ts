// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DECISION_TYPE_ID, newUlid, SYSTEM_ACTOR_FLOW, type FlowRead, type LedgerEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../../src/db/queryable.js';
import { AUTO_MOVE_LIMIT, loadAutoMoves } from '../../src/flow/auto-moves.js';
import { loadFlowFacts } from '../../src/flow/flow-facts.js';
import { readFlowView } from '../../src/flow/flow-view.js';
import { requireMember } from '../../src/read/membership.js';
import { listNotesForTickets } from '../../src/read/notes.js';
import { ticketNumbers } from '../../src/read/ticket-numbers.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';

/**
 * Part 3 T3, case 29.243: `readFlowView`, the Workflow graph's read for ONE viewer. The world is the mockup's diamond
 * (A -> D, D -Yes-> B, D -No-> C, both -> E) plus X, a ticket only the owner may see, linked A -> X -> E, and Y, reachable
 * only through X. The member's read is the hole case; the owner's read of the same seed is its control.
 */
let db: TestDatabase;
let read: ReadWorld;
// y sits BEHIND the hidden x (x → y is its only link): the member's walk must not reach it
const id = { a: newUlid(), d: newUlid(), b: newUlid(), c: newUlid(), e: newUlid(), x: newUlid(), y: newUlid() };
const noteId = newUlid();
const hiddenNoteId = newUlid();

const link = (from: string, to: string, label?: string): LedgerEvent =>
  makeCommitted({
    workspaceId: read.world.workspaceId,
    actorId: read.world.owner,
    entity: { kind: 'ticket', id: from },
    type: 'ticket.link_added',
    payload: { kind: 'leads_to', targetId: to, ...(label === undefined ? {} : { label }) },
  });

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  const ws = { workspaceId: read.world.workspaceId, actorId: read.world.owner };
  const create = (ticket: string, title: string, typeId = 'task'): LedgerEvent =>
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: ticket }, type: 'ticket.created', payload: { typeId, projectId: read.world.projectId, parentId: null, title } });
  await applyCommitted(db.pool, [
    makeCommitted({ ...ws, entity: { kind: 'ticket-type', id: DECISION_TYPE_ID }, type: 'ticket-type.defined', payload: { id: DECISION_TYPE_ID, name: 'Decision', icon: 'help', rank: 3, workflowId: read.world.workflowId, fields: [] } }),
    create(id.a, 'Draft the pitch'),
    create(id.d, 'Is the pitch approved', DECISION_TYPE_ID),
    create(id.b, 'Send to the client'),
    create(id.c, 'Shelve the pitch'),
    create(id.e, 'Close the file'),
    create(id.x, 'Salary review for the pitch team'),
    create(id.y, 'Brief the pitch team'),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: id.x }, type: 'visibility.set', payload: { ticketId: id.x, mode: 'explicit', userIds: [read.world.owner] } }),
    link(id.a, id.d), link(id.d, id.b, 'Yes'), link(id.d, id.c, 'No'), link(id.b, id.e), link(id.c, id.e), link(id.a, id.x), link(id.x, id.e), link(id.x, id.y),
    // A is past its first state (so its state name and its workflow's first state name differ); B is assigned to the member
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: id.a }, type: 'ticket.transitioned', payload: { to: 'doing' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: id.b }, type: 'ticket.assigned', payload: { assigneeId: read.world.member } }),
    // an automatic move of E that the HIDDEN x caused: the move is the member's to see, its cause is not
    makeCommitted({ ...ws, actorId: SYSTEM_ACTOR_FLOW, entity: { kind: 'ticket', id: id.e }, type: 'ticket.transitioned', payload: { to: 'doing', cause: { kind: 'led-to', sourceTicketId: id.x, triggeredBy: read.world.owner } } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: id.b }, type: 'ticket.link_added', payload: { kind: 'blocks', targetId: id.c } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: id.b }, type: 'ticket.link_added', payload: { kind: 'blocks', targetId: id.x } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: id.d }, type: 'ticket.decided', payload: { outcome: 'Yes' } }),
  ]);
  await db.pool.query(`INSERT INTO attachments (id, workspace_id, ticket_id, uploader_id, filename, mime, size, object_key) VALUES ($1,$2,$3,$4,'brief.pdf','application/pdf',10,$5)`, [newUlid(), ws.workspaceId, id.b, ws.actorId, `k-${newUlid()}`]);
  // A phone sign-in has a synthetic address, and `readActorNames` labels nobody with one (FD3), so the member gets a real
  // name and address here (the vendor `"user"` table, as `builder-reads.test.ts` does; this file owns its database).
  await db.pool.query('UPDATE "user" SET "name" = $1, email = $2 WHERE id = $3', ['Ama Marak', 'ama@example.test', read.world.member]);
  // a workspace-visible note on B, and a private note of the owner's on B that the member cannot read
  const note = (noteEntity: string, title: string, scope: unknown): LedgerEvent =>
    makeCommitted({ ...ws, entity: { kind: 'note', id: noteEntity }, type: 'note.created', payload: { title, homeProjectId: read.world.projectId, scope, attachTicketId: id.b } });
  await applyCommitted(db.pool, [note(noteId, 'Pitch brief', { mode: 'workspace' }), note(hiddenNoteId, 'Owner only', { mode: 'private' })]);
}, 60_000);
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

async function viewAs(userId: string, seed = id.b): Promise<FlowRead> {
  const eff = (await requireMember(db.pool, userId, read.world.workspaceId))!;
  return readFlowView(db.pool, { workspaceId: read.world.workspaceId, seedId: seed, viewerId: userId, eff });
}

describe('29.243 the flow read for one viewer', () => {
  it('29.243 a ticket the member cannot see is a hole: no node, no edge, no count; the owner sees it; control: both reads are of the same seed', async () => {
    const member = await viewAs(read.world.member);
    const owner = await viewAs(read.world.owner);
    expect(owner.nodes.map((n) => n.id).sort()).toEqual([id.a, id.b, id.c, id.d, id.e, id.x, id.y].sort());
    expect(member.nodes.map((n) => n.id).sort()).toEqual([id.a, id.b, id.c, id.d, id.e].sort());
    expect(JSON.stringify(member)).not.toContain(id.x);
    expect(JSON.stringify(member)).not.toContain(id.y); // only reachable through the hole
    expect(JSON.stringify(member)).not.toContain('Salary review');
    expect([member.reached, owner.reached]).toEqual([5, 7]);
    // the flow actor's move of E stays; the hidden ticket that caused it is blanked for the member and named for the owner
    expect(member.autoMoves).toEqual([expect.objectContaining({ ticketId: id.e, kind: 'led-to', becauseTicketId: null })]);
    expect(owner.autoMoves).toEqual([expect.objectContaining({ ticketId: id.e, kind: 'led-to', becauseTicketId: id.x })]);
    expect(member.edges.filter((e) => e.kind === 'blocks').map((e) => e.id)).toEqual([`${id.b}~${id.c}`]);
    expect(owner.edges.filter((e) => e.kind === 'blocks').map((e) => e.id).sort()).toEqual([`${id.b}~${id.c}`, `${id.b}~${id.x}`].sort());
    // the leads_to edges are the walk's, with D's labels; none touches the hole for the member
    expect(member.edges.filter((e) => e.kind === 'leads_to').map((e) => `${e.from}>${e.to}:${e.label}`).sort()).toEqual(
      [`${id.a}>${id.d}:null`, `${id.d}>${id.b}:Yes`, `${id.d}>${id.c}:No`, `${id.b}>${id.e}:null`, `${id.c}>${id.e}:null`].sort(),
    );
    expect([member.rootId, member.draftCount, member.truncated]).toEqual([id.b, 0, false]);
  });

  it('29.243 titles, keys, state names, notes and pins match the rows; a note the viewer cannot read is absent and uncounted; the Decision is a decision with its outcome', async () => {
    const member = await viewAs(read.world.member);
    const b = member.nodes.find((n) => n.id === id.b)!;
    expect(b).toMatchObject({ title: 'Send to the client', kind: 'ticket', draft: false });
    // the world has no entered prefixes: both halves are derived, `CC` + `RE` (ticket-cards.test.ts 13.1278)
    const numbers = await ticketNumbers(db.pool, read.world.workspaceId, [id.a, id.b]);
    expect([b.key, member.nodes.find((n) => n.id === id.a)!.key]).toEqual([`CCRE-${numbers.get(id.b)}`, `CCRE-${numbers.get(id.a)}`]);
    expect(b.state).toEqual({ id: 'todo', name: 'To do', category: 'open' });
    // A moved on: its state name is its current state's, its initialStateName is the workflow's first state's
    const a = member.nodes.find((n) => n.id === id.a)!;
    expect(a).toMatchObject({ state: { id: 'doing', name: 'Doing', category: 'active' }, initialStateName: 'To do', assigneeId: null, assigneeName: null, projectId: read.world.projectId });
    expect(a.pin).toEqual({ notes: 0, attachments: 0 });
    expect([b.assigneeId, b.assigneeName, b.projectId]).toEqual([read.world.member, 'Ama Marak', read.world.projectId]);
    expect(b.pin.attachments).toBe(1);
    expect(b.notes).toEqual([{ id: noteId, title: 'Pitch brief' }]);
    expect(b.pin.notes).toBe(1);
    expect(member.nodes.find((n) => n.id === id.d)).toMatchObject({ kind: 'decision', outcome: 'Yes', title: 'Is the pitch approved' });
    const owner = await viewAs(read.world.owner);
    // newest first: the private note was filed after the workspace one
    expect(owner.nodes.find((n) => n.id === id.b)!.notes).toEqual([{ id: hiddenNoteId, title: 'Owner only' }, { id: noteId, title: 'Pitch brief' }]);
    expect(owner.nodes.find((n) => n.id === id.b)!.pin).toEqual({ notes: 2, attachments: 1 });
  });

  it('29.243 the facts loader refuses a row it cannot name, naming the ticket; control: the same ticket loads before its row is broken', async () => {
    const lone = [newUlid(), newUlid()];
    const ws = { workspaceId: read.world.workspaceId, actorId: read.world.owner };
    await applyCommitted(db.pool, lone.map((t, i) => makeCommitted({ ...ws, entity: { kind: 'ticket', id: t }, type: 'ticket.created', payload: { typeId: 'task', projectId: read.world.projectId, parentId: null, title: `Lone ${i}` } })));
    const eff = (await requireMember(db.pool, read.world.owner, read.world.workspaceId))!;
    const load = (ids: string[]) => loadFlowFacts(db.pool, { eff, viewerId: read.world.owner, workspaceId: read.world.workspaceId, ids });
    // CONTROL: both load, each with its own title
    expect([...(await load(lone)).values()].map((f) => f.title).sort()).toEqual(['Lone 0', 'Lone 1']);
    // an empty id list loads nothing
    expect((await load([])).size).toBe(0);
    const { workflow_id: wf, workflow_version: v } = (
      await db.pool.query<{ workflow_id: string; workflow_version: number }>('SELECT workflow_id, workflow_version FROM proj_tickets WHERE ticket_id = $1', [lone[0]])
    ).rows[0] as { workflow_id: string; workflow_version: number };
    await db.pool.query('UPDATE proj_tickets SET workflow_version = workflow_version + 100 WHERE ticket_id = $1', [lone[0]]);
    await expect(load([lone[0]!])).rejects.toThrow(
      `loadFlowFacts: no published definition of workflow ${wf} at version ${v + 100}, which ticket ${lone[0]} is folded to`,
    );
    await db.pool.query("UPDATE proj_tickets SET state_id = 'nowhere' WHERE ticket_id = $1", [lone[1]]);
    await expect(load([lone[1]!])).rejects.toThrow(`loadFlowFacts: workflow ${wf}@${v} has no state nowhere, which ticket ${lone[1]} is in`);
  });

  it('29.243 every loader keeps to the path\'s workspace and to the ids it is given: another workspace\'s ticket passed in by id gets no facts, no moves and no notes; control: its own workspace reads all three', async () => {
    // The ids a loader is handed come from this workspace's walk, so these clauses never decide a read today; they are the
    // tenant guard of three exported functions, and each is pinned here by a direct call rather than trusted to the walk.
    const nb = read.neighbour;
    const nbOwner = read.userIds.neighbour;
    const nbNote = newUlid();
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: nb.workspaceId, actorId: SYSTEM_ACTOR_FLOW, entity: { kind: 'ticket', id: nb.ticketId }, type: 'ticket.transitioned', payload: { to: 'todo', cause: { kind: 'led-to', sourceTicketId: nb.ticketId, triggeredBy: nbOwner } } }),
      makeCommitted({ workspaceId: nb.workspaceId, actorId: nbOwner, entity: { kind: 'note', id: nbNote }, type: 'note.created', payload: { title: 'Next door', homeProjectId: nb.projectId, scope: { mode: 'workspace' }, attachTicketId: nb.ticketId } }),
    ]);
    const here = (await requireMember(db.pool, read.world.owner, read.world.workspaceId))!;
    const there = (await requireMember(db.pool, nbOwner, nb.workspaceId))!;
    // CONTROL: the neighbour's own workspace reads the ticket's facts, its flow move and its note
    const own = await loadFlowFacts(db.pool, { eff: there, viewerId: nbOwner, workspaceId: nb.workspaceId, ids: [nb.ticketId] });
    expect(own.get(nb.ticketId)).toMatchObject({ title: nb.ticketTitle, notes: [{ id: nbNote, title: 'Next door' }] });
    expect((await loadAutoMoves(db.pool, nb.workspaceId, [nb.ticketId])).map((m) => m.ticketId)).toEqual([nb.ticketId]);
    expect([...(await listNotesForTickets(db.pool, there, nbOwner, nb.workspaceId, [nb.ticketId])).keys()]).toEqual([nb.ticketId]);
    // through this workspace, the same id is nothing; B, passed beside it, still loads, so the answer is not merely empty
    const across = await loadFlowFacts(db.pool, { eff: here, viewerId: read.world.owner, workspaceId: read.world.workspaceId, ids: [id.b, nb.ticketId] });
    expect([...across.keys()]).toEqual([id.b]);
    expect(await loadAutoMoves(db.pool, read.world.workspaceId, [nb.ticketId])).toEqual([]);
    expect([...(await listNotesForTickets(db.pool, here, read.world.owner, read.world.workspaceId, [id.b, nb.ticketId])).keys()]).toEqual([id.b]);
    // and the id list binds too: E, a ticket of this workspace with no notes, asked alone, gets none of B's
    expect((await listNotesForTickets(db.pool, here, read.world.owner, read.world.workspaceId, [id.e])).size).toBe(0);
  });

  it('29.243 the automatic moves: the flow actor\'s moves of every kind, newest first, one per reset, only on tickets in the read, at most the limit', async () => {
    const ws = { workspaceId: read.world.workspaceId, actorId: SYSTEM_ACTOR_FLOW };
    const decision = (outcome: string, pass: number) => ({ decisionTicketId: id.d, outcome, pass, decidedBy: read.world.owner, decisionEventId: newUlid() });
    const reset = { kind: 'reopened-by-flow', ...decision('Need rework', 1) };
    await applyCommitted(db.pool, [
      // C closed Not taken, then reset by a loop: the reset is a paired reopened + transitioned, and reads as ONE move
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: id.c }, type: 'ticket.closed', payload: { cause: { kind: 'branch-not-taken', ...decision('Yes', 1) } } }),
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: id.c }, type: 'ticket.reopened', payload: { cause: reset } }),
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: id.c }, type: 'ticket.transitioned', payload: { to: 'todo', cause: reset } }),
      // a flow move of the hidden x: the owner's to see, never the member's
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: id.x }, type: 'ticket.transitioned', payload: { to: 'doing', cause: { kind: 'led-to', sourceTicketId: id.a, triggeredBy: read.world.owner } } }),
      // not the flow's: a person's move carrying a flow cause, and a flow-actor move with no cause
      makeCommitted({ ...ws, actorId: read.world.owner, entity: { kind: 'ticket', id: id.b }, type: 'ticket.transitioned', payload: { to: 'doing', cause: { kind: 'led-to', sourceTicketId: id.a, triggeredBy: read.world.owner } } }),
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: id.b }, type: 'ticket.transitioned', payload: { to: 'todo' } }),
    ]);
    const atOf = async (ticket: string, type: string): Promise<string> =>
      ((await db.pool.query<{ t: Date }>('SELECT server_time AS t FROM events WHERE entity_id = $1 AND type = $2 AND actor_id = $3 ORDER BY server_time DESC LIMIT 1', [ticket, type, SYSTEM_ACTOR_FLOW])).rows[0]!.t).toISOString();
    const closedAt = await atOf(id.c, 'ticket.closed');
    const resetAt = await atOf(id.c, 'ticket.transitioned');
    const ledToE = { ticketId: id.e, kind: 'led-to', pass: null };
    const member = await viewAs(read.world.member);
    expect(member.autoMoves).toEqual([
      { ticketId: id.c, at: resetAt, kind: 'reopened-by-flow', becauseTicketId: id.d, pass: 1, outcome: 'Need rework' },
      { ticketId: id.c, at: closedAt, kind: 'branch-not-taken', becauseTicketId: id.d, pass: 1, outcome: 'Yes' },
      expect.objectContaining({ ...ledToE, becauseTicketId: null }),
    ]);
    // the hidden x caused E's move: with its id goes the outcome KEY (29.448), not merely its value
    expect(member.autoMoves[2]).not.toHaveProperty('outcome');
    const owner = await viewAs(read.world.owner);
    expect(owner.autoMoves.map((m) => [m.ticketId, m.kind, m.becauseTicketId])).toEqual([
      [id.x, 'led-to', id.a],
      [id.c, 'reopened-by-flow', id.d],
      [id.c, 'branch-not-taken', id.d],
      [id.e, 'led-to', id.x],
    ]);
    expect(owner.autoMoves[3]).toMatchObject({ ...ledToE, becauseTicketId: id.x, outcome: null }); // a seen promotion names no outcome: null
    // the limit: AUTO_MOVE_LIMIT + 1 more flow moves of B, and the read keeps the newest AUTO_MOVE_LIMIT
    expect(AUTO_MOVE_LIMIT).toBe(50);
    const many = Array.from({ length: 51 }, (_, i) =>
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: id.b }, type: 'ticket.transitioned', payload: { to: i % 2 === 0 ? 'doing' : 'todo', cause: { kind: 'led-to', sourceTicketId: id.a, triggeredBy: read.world.owner } } }),
    );
    await applyCommitted(db.pool, many);
    const capped = await viewAs(read.world.owner);
    expect(capped.autoMoves).toHaveLength(50);
    expect(capped.autoMoves.every((m) => m.ticketId === id.b)).toBe(true); // the 51st newest (the first of the 51) and every older move fall off
    const newest = await atOf(id.b, 'ticket.transitioned');
    expect(capped.autoMoves[0]!.at).toBe(newest);
  });

  it('29.243 the query count does not grow with the flow', async () => {
    const counter = (): { db: Queryable; count: () => number } => {
      let n = 0;
      const counted = new Proxy(db.pool, {
        get(target, prop, receiver) {
          if (prop !== 'query') return Reflect.get(target, prop, receiver) as unknown;
          return (...args: unknown[]) => {
            n += 1;
            return (target.query as (...a: unknown[]) => unknown).apply(target, args);
          };
        },
      });
      return { db: counted, count: () => n };
    };
    const eff = (await requireMember(db.pool, read.world.owner, read.world.workspaceId))!;
    const small = counter();
    await readFlowView(small.db, { workspaceId: read.world.workspaceId, seedId: id.b, viewerId: read.world.owner, eff });
    // 34 more tickets FANNED out of E, all in the ring E's other successors are in. Part 2's walk is one statement per
    // RING (FL-2), so a chain would add a statement per ticket and pass FLOW_MAX_RINGS (30) at 34 deep: what must not
    // grow is the count per ring and every query after the walk.
    const ws = { workspaceId: read.world.workspaceId, actorId: read.world.owner };
    const fan = Array.from({ length: 34 }, () => newUlid());
    const events: LedgerEvent[] = [];
    fan.forEach((t, i) => {
      events.push(makeCommitted({ ...ws, entity: { kind: 'ticket', id: t }, type: 'ticket.created', payload: { typeId: 'task', projectId: read.world.projectId, parentId: null, title: `Step ${i}` } }));
      events.push(link(id.e, t));
    });
    await applyCommitted(db.pool, events);
    const big = counter();
    const wide = await readFlowView(big.db, { workspaceId: read.world.workspaceId, seedId: id.b, viewerId: read.world.owner, eff });
    expect([wide.nodes.length, wide.truncated]).toEqual([7 + 34, false]);
    expect(small.count()).toBeGreaterThan(0); // precondition: the counter sits on the path the read takes
    expect(big.count()).toBe(small.count());
  });

  it('29.243 a note that is deleted, or homed in a deleted project, is absent from the read and uncounted; control: both are listed while live', async () => {
    const ws = { workspaceId: read.world.workspaceId, actorId: read.world.owner };
    const goneNote = newUlid();
    const homedNote = newUlid();
    const doomed = newUlid();
    await applyCommitted(db.pool, [
      makeCommitted({ ...ws, entity: { kind: 'project', id: doomed }, type: 'project.created', payload: { name: 'Doomed errands' } }),
      makeCommitted({ ...ws, entity: { kind: 'note', id: goneNote }, type: 'note.created', payload: { title: 'Scratch', homeProjectId: read.world.projectId, scope: { mode: 'workspace' }, attachTicketId: id.b } }),
      makeCommitted({ ...ws, entity: { kind: 'note', id: homedNote }, type: 'note.created', payload: { title: 'Elsewhere', homeProjectId: doomed, scope: { mode: 'workspace' }, attachTicketId: id.b } }),
    ]);
    const bOf = async () => (await viewAs(read.world.owner)).nodes.find((n) => n.id === id.b)!;
    // CONTROL: both are listed while live, newest first, beside the two the seed filed
    expect((await bOf()).notes.map((n) => n.id)).toEqual([homedNote, goneNote, hiddenNoteId, noteId]);
    await applyCommitted(db.pool, [
      makeCommitted({ ...ws, entity: { kind: 'note', id: goneNote }, type: 'note.deleted', payload: {} }),
      makeCommitted({ ...ws, entity: { kind: 'project', id: doomed }, type: 'project.deleted', payload: {} }),
    ]);
    const b = await bOf();
    expect(b.notes.map((n) => n.id)).toEqual([hiddenNoteId, noteId]);
    expect(b.pin.notes).toBe(2);
  });
});
