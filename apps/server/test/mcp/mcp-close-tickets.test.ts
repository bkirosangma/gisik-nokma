import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { TICKET_NOT_VISIBLE_REASON } from '../../src/permissions/check-permission.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildDoorWorld, callTool, type DoorWorld } from './helpers/door-matrix.js';
import { event, eventCount, mustCommit } from './helpers/sweep2.js';

/**
 * MCP sweep 2 T5, cases 14.619 (server half), 14.620, 14.621, 14.623 (history half), 14.626 (the package half of the rest is
 * `close-tickets.test.ts`). Every call is a `tools/call` on `POST /mcp`. Run LOCALLY.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

type Row = { ticketId: string; status: string; rule?: string; reason?: string };
type Closed = { closed: number; refused: number; results: Row[] };

/** A ticket born in focus; `terminal` walks it doing, done (the 14.457 route: the workflow decides, so reach a terminal state first). */
async function ticket(w: DoorWorld, title: string, opts: { terminal?: boolean; typeId?: string; parentId?: string } = {}): Promise<string> {
  const made = await callTool(w.app, w.owner.token, 'create_ticket', {
    workspaceId: w.workspaceId, projectId: w.projectId, typeId: opts.typeId ?? 'task', title, start: 'focus', ...(opts.parentId === undefined ? {} : { parentId: opts.parentId }),
  });
  expect(made.isError, made.text).toBe(false);
  const ticketId = (made.json as { ticketId: string }).ticketId;
  if (opts.terminal === true) {
    for (const to of ['doing', 'done']) {
      const moved = await callTool(w.app, w.owner.token, 'transition_ticket', { workspaceId: w.workspaceId, ticketId, to });
      expect(moved.isError, `${title} -> ${to}: ${moved.text}`).toBe(false);
    }
  }
  return ticketId;
}
const closeMany = (w: DoorWorld, who: DoorWorld['owner'], ticketIds: string[], confirm = true) =>
  callTool(w.app, who.token, 'close_tickets', { workspaceId: w.workspaceId, ticketIds, ...(confirm ? { confirm_count: String(ticketIds.length) } : {}) });

describe('close_tickets through the hosted door', () => {
  it('14.619 three tickets, the middle one not terminal: the first and third ARE closed on the server, the middle is refused with the engine\'s own words, and close_ticket on it refuses with the same', async () => {
    const w = await buildDoorWorld(db, '2619');
    const [a, b, c] = [await ticket(w, 'A', { terminal: true }), await ticket(w, 'B'), await ticket(w, 'C', { terminal: true })];
    const out = await closeMany(w, w.owner, [a, b, c]);
    expect(out.isError, out.text).toBe(false);
    const reply = out.json as Closed;
    expect(reply).toMatchObject({ closed: 2, refused: 1 });
    expect(reply.results.map((r) => [r.ticketId, r.status])).toEqual([[a, 'closed'], [b, 'refused'], [c, 'closed']]);
    expect(reply.results[1]).toMatchObject({ rule: 'close-requires-terminal' });
    expect(reply.results[1]!.reason).toMatch(/^A ticket can only be closed from a terminal state; ".+" is not one\.$/);
    expect([await eventCount(db, a, 'ticket.closed'), await eventCount(db, b, 'ticket.closed'), await eventCount(db, c, 'ticket.closed')]).toEqual([1, 0, 1]);
    // CONTROL, same `it`: the single close refuses with the same rule and sentence.
    const single = await callTool(w.app, w.owner.token, 'close_ticket', { workspaceId: w.workspaceId, ticketId: b });
    expect(single.isError).toBe(true);
    expect(single.text).toBe(`event 0 refused by ${reply.results[1]!.rule}: ${reply.results[1]!.reason}`);
  });

  it('14.620 a parent and its terminal children all close, in either order (the engine reads the children\'s state, not their closed flag)', async () => {
    const w = await buildDoorWorld(db, '2620');
    for (const parentFirst of [true, false]) {
      const parent = await ticket(w, `Epic ${parentFirst}`, { typeId: 'epic' });
      const kids = [await ticket(w, 'Kid one', { terminal: true, parentId: parent }), await ticket(w, 'Kid two', { terminal: true, parentId: parent })];
      for (const to of ['doing', 'done']) expect((await callTool(w.app, w.owner.token, 'transition_ticket', { workspaceId: w.workspaceId, ticketId: parent, to })).isError).toBe(false);
      const order = parentFirst ? [parent, ...kids] : [...kids, parent];
      const reply = (await closeMany(w, w.owner, order)).json as Closed;
      expect(reply, `parentFirst=${parentFirst}: ${JSON.stringify(reply)}`).toMatchObject({ closed: 3, refused: 0 });
    }
  });

  it('14.621 a ticket the caller cannot see and one that does not exist get the SAME refusal; a visible terminal ticket in the same batch closes', async () => {
    const w = await buildDoorWorld(db, '2621');
    const hidden = await ticket(w, 'Salary review', { terminal: true });
    await mustCommit(w.app, w.owner, [event(w.workspaceId, w.owner, { kind: 'ticket', id: hidden }, 'visibility.set', { ticketId: hidden, mode: 'explicit', userIds: [w.owner.userId] })]);
    const visible = await ticket(w, 'Visible', { terminal: true });
    const ghost = newUlid();
    // The visible ticket rides in the SAME batch as the two refusals (the case's claim), last, so a refusal ahead of it cannot stop it.
    const asMember = (await closeMany(w, w.member, [hidden, ghost, visible])).json as Closed;
    expect(asMember).toMatchObject({ closed: 1, refused: 2 });
    expect(asMember.results[0]).toMatchObject({ status: 'refused', reason: TICKET_NOT_VISIBLE_REASON });
    expect({ rule: asMember.results[1]!.rule, reason: asMember.results[1]!.reason }).toEqual({ rule: asMember.results[0]!.rule, reason: asMember.results[0]!.reason });
    expect(asMember.results[2]).toMatchObject({ ticketId: visible, status: 'closed' });
    expect(await eventCount(db, hidden, 'ticket.closed')).toBe(0);
    expect(await eventCount(db, visible, 'ticket.closed')).toBe(1);
    // CONTROL, same `it`: the owner can see and close both the hidden one and another visible one.
    const another = await ticket(w, 'Visible too', { terminal: true });
    expect(((await closeMany(w, w.owner, [hidden, another])).json as Closed)).toMatchObject({ closed: 2 });
  });

  it('14.623 a closed ticket\'s History shows the close as the assistant\'s (origin mcp) and reopen_ticket undoes it', async () => {
    const w = await buildDoorWorld(db, '2623');
    const a = await ticket(w, 'History', { terminal: true });
    expect(((await closeMany(w, w.owner, [a])).json as Closed).closed).toBe(1);
    const history = async () => ((await callTool(w.app, w.owner.token, 'get_ticket_history', { ticketId: a })).json as { events: Array<{ type: string; origin: string }> }).events;
    expect((await history()).find((e) => e.type === 'ticket.closed')).toMatchObject({ origin: 'mcp' });
    const back = await callTool(w.app, w.owner.token, 'reopen_ticket', { workspaceId: w.workspaceId, ticketId: a });
    expect(back.isError, back.text).toBe(false);
    expect((await history()).map((e) => e.type)).toEqual(expect.arrayContaining(['ticket.closed', 'ticket.reopened']));
  });

  it('14.626 the preview is not a promise: a non-terminal ticket is in the preview and is then refused at the close with the engine\'s sentence', async () => {
    const w = await buildDoorWorld(db, '2626');
    const [done, open] = [await ticket(w, 'Done one', { terminal: true }), await ticket(w, 'Still open')];
    const preview = (await closeMany(w, w.owner, [done, open], false)).json as { preview: boolean; wouldChange: string; nothingChanged: boolean };
    expect(preview).toMatchObject({ preview: true, nothingChanged: true });
    expect(preview.wouldChange).toContain('"Still open"'); // listed like any other
    expect(await eventCount(db, open, 'ticket.closed')).toBe(0);
    // The terminal one is the leg that can fail: a preview that wrote would CLOSE it (the open one is refused either way).
    expect(await eventCount(db, done, 'ticket.closed')).toBe(0);
    const closed = (await closeMany(w, w.owner, [done, open])).json as Closed;
    expect(closed.results[1]).toMatchObject({ status: 'refused', rule: 'close-requires-terminal' });
    expect(closed.results[1]!.reason).toMatch(/^A ticket can only be closed from a terminal state; ".+" is not one\.$/);
    expect(closed.results[0]).toMatchObject({ status: 'closed' }); // CONTROL: the terminal one closed
  });
});
