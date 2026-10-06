import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, SYSTEM_ACTOR_FLOW } from '@gisik-nokma/domain';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildDoorWorld, callTool, mk, type DoorWorld } from './helpers/flow-world.js';

/**
 * PTR wtg-flow-cause-withhold, the hosted door (29.444). A member who cannot see a not-taken ticket's Decision is told
 * nothing of it: `get_ticket` lifts the close cause into `resolution` and names the Decision only when the caller can read
 * it (wtg-part5 T2, `ticket-flow-facts.ts`), and `get_ticket_history` phrases the cause the server withheld the way
 * `phrasedCause` does ("a ticket you can't see", "someone you can't see"; wtg2 T8). The hidden Decision's outcome goes
 * with it (planner ruling 2026-10-06 05:46): neither answer names the branch it chose. The decider and the outcome are
 * DEDICATED tokens that appear nowhere else, so `not.toContain` can only fail through the cause. Run LOCALLY.
 */
let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });

/** One committed event on `entityId` at the ledger's next seqs: the world's tickets were filed through HTTP, not the helper's seq map. */
async function file(w: DoorWorld, actorId: string, entityId: string, type: string, payload: unknown): Promise<void> {
  const { rows } = await w.db.pool.query<{ seq: string; ws: string }>(
    `SELECT (SELECT coalesce(max(seq), 0) FROM events WHERE entity_kind = 'ticket' AND entity_id = $1) AS seq,
            (SELECT coalesce(max(workspace_seq), 0) FROM events WHERE workspace_id = $2) AS ws`,
    [entityId, w.workspaceId],
  );
  const at = rows[0]!;
  await applyCommitted(w.db.pool, [
    makeCommitted({ workspaceId: w.workspaceId, actorId, entity: { kind: 'ticket', id: entityId }, type, payload, seq: Number(at.seq) + 1, workspaceSeq: Number(at.ws) + 1 }),
  ]);
}

describe('29.444 MCP names no Decision or decider the caller cannot see', () => {
  it("29.444 get_ticket names no hidden Decision (decision: null, no outcome) and get_ticket_history reads \"a ticket you can't see\" and \"someone you can't see\", no id and no outcome; control: the owner's answers name all three", async () => {
    const w = await buildDoorWorld(db, '4441');
    const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' });
    const skipped = await mk(w, w.owner, 'Rework the pitch');
    await file(w, w.owner.userId, decision, 'visibility.set', { ticketId: decision, mode: 'explicit', userIds: [w.owner.userId] });
    const DECIDER = newUlid();
    const OUTCOME = 'branch-chosen-4441';
    const cause = { kind: 'branch-not-taken', decisionTicketId: decision, outcome: OUTCOME, pass: 1, decidedBy: DECIDER, decisionEventId: newUlid() };
    await file(w, SYSTEM_ACTOR_FLOW, skipped, 'ticket.transitioned', { to: 'done', cause });
    await file(w, SYSTEM_ACTOR_FLOW, skipped, 'ticket.closed', { cause });

    const ticket = (token: string) => callTool(w.app, token, 'get_ticket', { workspaceId: w.workspaceId, ticketId: skipped });
    const history = (token: string) => callTool(w.app, token, 'get_ticket_history', { ticketId: skipped });
    type Line = { type: string; payload: { cause?: unknown } };
    const closeLine = (json: unknown) => (json as { events: Line[] }).events.find((e) => e.type === 'ticket.closed');

    // control: the owner can read the Decision, so both answers name it, its outcome and the decider
    const owner = await ticket(w.owner.token);
    expect(owner.isError, owner.text).toBe(false);
    expect((owner.json as { resolution: { decision: { id: string } | null } }).resolution.decision?.id).toBe(decision);
    expect((owner.json as { resolution: unknown }).resolution).toMatchObject({ kind: 'not-taken', outcome: OUTCOME, pass: 1 });
    const ownerHistory = await history(w.owner.token);
    expect(closeLine(ownerHistory.json)?.payload.cause).toEqual(cause);
    expect(ownerHistory.text).toContain(DECIDER);
    expect(ownerHistory.text).toContain(OUTCOME);

    const member = await ticket(w.member.token);
    expect(member.isError, member.text).toBe(false);
    expect((member.json as { resolution: unknown }).resolution).toEqual({ kind: 'not-taken', pass: 1, decision: null });
    expect((member.json as { resolution: object }).resolution).not.toHaveProperty('outcome');
    for (const secret of [decision, DECIDER, OUTCOME]) expect(member.text, `get_ticket names ${secret}`).not.toContain(secret);
    const memberHistory = await history(w.member.token);
    expect(memberHistory.isError, memberHistory.text).toBe(false);
    expect(closeLine(memberHistory.json)?.payload.cause).toEqual({
      kind: 'branch-not-taken', decisionTicketId: "a ticket you can't see", pass: 1, decidedBy: "someone you can't see", decisionEventId: cause.decisionEventId,
    });
    expect(closeLine(memberHistory.json)?.payload.cause).not.toHaveProperty('outcome');
    for (const secret of [decision, DECIDER, OUTCOME]) expect(memberHistory.text, `get_ticket_history names ${secret}`).not.toContain(secret);
  });
  it('29.449 get_flow, hosted: the blind member\'s flow parses and its Not-taken ticket\'s resolution has neither the hidden Decision nor its outcome; control: the owner\'s names both', async () => {
    const w = await buildDoorWorld(db, '4449');
    const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' });
    const skipped = await mk(w, w.owner, 'Rework the pitch');
    await file(w, w.owner.userId, decision, 'visibility.set', { ticketId: decision, mode: 'explicit', userIds: [w.owner.userId] });
    await file(w, w.owner.userId, decision, 'ticket.link_added', { kind: 'leads_to', targetId: skipped, label: 'No' });
    const OUTCOME = 'branch-chosen-4449';
    const cause = { kind: 'branch-not-taken', decisionTicketId: decision, outcome: OUTCOME, pass: 1, decidedBy: newUlid(), decisionEventId: newUlid() };
    await file(w, SYSTEM_ACTOR_FLOW, skipped, 'ticket.closed', { cause });

    type Flow = { nodes: Array<{ id: string; resolution: unknown }> };
    const flow = (token: string) => callTool(w.app, token, 'get_flow', { workspaceId: w.workspaceId, ticketId: skipped });
    const resolutionOf = (json: unknown) => (json as Flow).nodes.find((n) => n.id === skipped)?.resolution;
    // control: the owner's walk reaches the Decision, so the resolution names it and its outcome
    const owner = await flow(w.owner.token);
    expect(owner.isError, owner.text).toBe(false);
    expect(resolutionOf(owner.json)).toEqual({ kind: 'not-taken', decisionTicketId: decision, outcome: OUTCOME, pass: 1 });

    const member = await flow(w.member.token);
    expect(member.isError, member.text).toBe(false); // the seam reads a resolution with no outcome
    expect(resolutionOf(member.json)).toEqual({ kind: 'not-taken', decisionTicketId: null, pass: 1 });
    expect(resolutionOf(member.json)).not.toHaveProperty('outcome');
    for (const secret of [decision, OUTCOME]) expect(member.text, `get_flow names ${secret}`).not.toContain(secret);
  });
});
