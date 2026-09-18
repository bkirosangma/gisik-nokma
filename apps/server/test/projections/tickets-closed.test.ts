import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { rowToTicketState } from '../../src/projections/tickets.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Task 4 (backlog/closed spec §3.1, 2026-09-17) — `proj_tickets.closed_at` /
 * `closed_by`, the two columns this table's `upsertTicket` now writes from
 * `TicketState.closed`, the SAME field the shared reducer (`applyTicketEvent`,
 * `@gisik-nokma/domain`) already folds `ticket.closed` / `ticket.reopened`
 * into (case 13.566). Nothing here re-derives the flag; it asserts that the
 * two columns carry exactly what the reducer already computed, and that
 * `rowToTicketState` — the one function every reader of this table goes
 * through — maps the pair back to `TicketState.closed` and to `null` when
 * both are `NULL`, which is every ticket this table has ever held before this
 * migration.
 *
 * `WF`'s three states are joined by wildcard (`from: '*'`) edges precisely so
 * a `ticket.transitioned` needs no specific FROM state named — this file
 * seeds through `applyCommitted`, which carries no rule engine (`./apply.js`'s
 * own header), so the only thing that needs to be true of the seed is that
 * `applyTicketEvent` accepts it, not that a real close door would.
 */

let db: TestDatabase;

const WS = newUlid();
const PRJ = newUlid();
const WF = newUlid();
const TYPE_ID = 'closed-spec-task';

beforeAll(async () => {
  db = await createTestDatabase();

  // One workflow, one type, shared by both cases below — neither mutates the
  // other's ticket, so declaration order does not matter.
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId: WS,
      actorId: newUlid(),
      entity: { kind: 'workflow', id: WF },
      type: 'workflow.defined',
      payload: {
        id: WF,
        version: 1,
        name: 'Closed-spec flow',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'doing', name: 'Doing', category: 'active' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [
          { from: '*', to: 'todo', rules: [] },
          { from: '*', to: 'doing', rules: [] },
          { from: '*', to: 'done', rules: [] },
        ],
      },
    }),
    makeCommitted({
      workspaceId: WS,
      actorId: newUlid(),
      entity: { kind: 'ticket-type', id: TYPE_ID },
      type: 'ticket-type.defined',
      payload: { id: TYPE_ID, name: 'Closed-spec task', icon: 'check', rank: 3, workflowId: WF, fields: [] },
    }),
  ]);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

/** The full row, exactly as `rowToTicketState` needs it — see that function's own note on why `SELECT *` is the shape every reader of this table uses. */
async function rowFor(ticketId: string) {
  const { rows } = await db.pool.query('SELECT * FROM proj_tickets WHERE ticket_id = $1', [ticketId]);
  return rows[0];
}

describe('13.572 proj_tickets carries closed_at / closed_by', () => {
  it('a created ticket has both NULL; a close fills both from the event; a reopen clears both', async () => {
    const ticketId = newUlid();
    const actorId = newUlid();

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.created',
        payload: { typeId: TYPE_ID, projectId: PRJ, parentId: null, title: 'Ship the thing', start: 'focus' },
      }),
    ]);
    let row = await rowFor(ticketId);
    expect(row.closed_at).toBeNull();
    expect(row.closed_by).toBeNull();

    // Two transitions to reach `done` — the door's own precondition for a
    // close (`checkTicketClosed`, case 13.568) — even though `applyCommitted`
    // carries no rule engine and would not enforce it either way. Seeding the
    // real path a close follows is what makes this fixture a fact about the
    // product rather than an artifact of the shortcut.
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.transitioned',
        payload: { to: 'doing' },
      }),
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.transitioned',
        payload: { to: 'done' },
      }),
    ]);

    const closeEvent = makeCommitted({
      workspaceId: WS,
      actorId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.closed',
      payload: {},
    });
    await applyCommitted(db.pool, [closeEvent]);

    row = await rowFor(ticketId);
    // Mutation target: hardcode `closed_by` from a different field (e.g.
    // `assignee_id`) and this reddens naming the actor; hardcode `closed_at`
    // to `new Date()` and this reddens naming the clock — the projection must
    // not read one.
    expect(row.closed_by).toBe(actorId);
    expect(row.closed_at.toISOString()).toBe(closeEvent.serverTime);

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.reopened',
        payload: {},
      }),
    ]);

    row = await rowFor(ticketId);
    // The clearing case is the one an ON CONFLICT SET list that omits these
    // two columns cannot produce: without `closed_at = EXCLUDED.closed_at` /
    // `closed_by = EXCLUDED.closed_by`, this UPDATE would leave the row
    // holding the close's stale values forever.
    expect(row.closed_at).toBeNull();
    expect(row.closed_by).toBeNull();
  });

  it('rowToTicketState maps the pair to `closed`, and null to null', async () => {
    const ticketId = newUlid();
    const actorId = newUlid();

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.created',
        payload: {
          typeId: TYPE_ID,
          projectId: PRJ,
          parentId: null,
          title: 'Ship the other thing',
          start: 'focus',
        },
      }),
    ]);
    // The positive control for the mapping below, in the same test: a fresh
    // ticket's row maps to `closed: null`, not to an object with null fields.
    expect(rowToTicketState(await rowFor(ticketId)).closed).toBeNull();

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.transitioned',
        payload: { to: 'done' },
      }),
    ]);
    const closeEvent = makeCommitted({
      workspaceId: WS,
      actorId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.closed',
      payload: {},
    });
    await applyCommitted(db.pool, [closeEvent]);

    expect(rowToTicketState(await rowFor(ticketId)).closed).toEqual({
      actorId,
      at: closeEvent.serverTime,
    });
  });
});

/**
 * 13.723 — `proj_tickets.reopened_at`, the column Task 7 adds (spec §8.2,
 * second wave 2026-09-18). A sibling of 13.572 above and deliberately built the
 * same way: this file owns the `proj_tickets` columns the closed/reopened pair
 * writes, and `rowToTicketState` is read back here rather than through a second,
 * reimplemented mapping — the same reason that file's own header gives.
 *
 * **The three arms are the whole semantics, and the middle one is a control.**
 * A created ticket is `NULL`; a reopen fills it with the envelope's server time;
 * a following transition clears it again. Without the middle arm the third would
 * pass against a projection that simply never wrote the column. The third is the
 * one an `ON CONFLICT SET` list that omits this column cannot produce: the row
 * would keep the reopen's stamp forever, so the sweep would skip the ticket for
 * the rest of its life — a ticket that can never be auto-closed again after one
 * reopen, which is the failure mode §8.2's re-arm sentence names.
 *
 * The final transition goes back into `done`, the state the ticket is already
 * in, because that is the case a "clear it only when the state moved"
 * implementation gets wrong (13.722 asserts the same path in the reducer).
 */
describe('13.723 proj_tickets carries reopened_at', () => {
  it('a created ticket is NULL; a reopen fills it from the event; a transition clears it', async () => {
    const ticketId = newUlid();
    const actorId = newUlid();

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.created',
        payload: { typeId: TYPE_ID, projectId: PRJ, parentId: null, title: 'Reopen the thing', start: 'focus' },
      }),
    ]);

    let row = await rowFor(ticketId);
    expect(row.reopened_at).toBeNull();
    // The mapping half, on the same row: `null` survives as `null` rather than
    // becoming `undefined`, which is what the dual-client rig's whole-state
    // `toEqual` compares against the reducer's own `reopenedAt: null`.
    expect(rowToTicketState(row).reopenedAt).toBeNull();

    // The real path a reopen follows: terminal, closed, then reopened. The
    // engine's doors are not present in `applyCommitted` (see this file's
    // header), so seeding the path is what makes this a fact about the product
    // rather than an artifact of the shortcut.
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.transitioned',
        payload: { to: 'done' },
      }),
    ]);
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.closed',
        payload: {},
      }),
    ]);
    const reopenEvent = makeCommitted({
      workspaceId: WS,
      actorId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.reopened',
      payload: {},
    });
    await applyCommitted(db.pool, [reopenEvent]);

    row = await rowFor(ticketId);
    // Mutation targets, both directions: `next.reopenedAt ?? null` bound to a
    // constant, or the `ON CONFLICT SET` line dropped, and this reddens naming
    // the clock; `reopened_at = now()` and it reddens because the column must
    // carry the CLAIM's recorded instant and not the projection's own.
    expect(row.reopened_at.toISOString()).toBe(reopenEvent.serverTime);
    expect(rowToTicketState(row).reopenedAt).toBe(reopenEvent.serverTime);

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.transitioned',
        payload: { to: 'done' },
      }),
    ]);

    row = await rowFor(ticketId);
    expect(row.reopened_at).toBeNull();
    expect(rowToTicketState(row).reopenedAt).toBeNull();
  });
});
