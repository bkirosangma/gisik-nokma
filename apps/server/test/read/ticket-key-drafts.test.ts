import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { NUMBERING_ROWS_SQL, ticketIdsAtNumber, ticketNumbers } from '../../src/read/ticket-numbers.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { ev, seedWorkspace, ticketCreated, TYPE_ID, type Base } from '../purge/world.js';

/**
 * Drafts T2 (spec §6.1, R25-R27): a ticket's number is its position among its project's NUMBERING ROWS.
 * Cases 28.020 and 28.021 (`test-cases/28-drafts.md` §28.2). Ledger-level, with no projections: the key
 * query reads `events` alone, and T3 is what teaches the projections what a draft is.
 */

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
}, 60_000);
afterAll(async () => {
  await db.drop();
});

const draftCreated = (base: Base, id: string, projectId: string, title: string): LedgerEvent =>
  ev(base, 'ticket', id, 'ticket.created', { typeId: TYPE_ID, projectId, parentId: null, title, start: 'backlog', draft: true });
const published = (base: Base, id: string, projectId: string): LedgerEvent =>
  ev(base, 'ticket', id, 'ticket.published', { projectId });
async function append(...events: LedgerEvent[]): Promise<void> {
  for (const event of events) await appendTestEvent(db.pool, event);
}

/** The query the key used before drafts, copied verbatim, so the parity is against the OLD text and not a restatement. */
async function legacyRows(workspaceId: string): Promise<Array<{ ticketId: string; projectId: string; number: number }>> {
  const { rows } = await db.pool.query<{ ticket_id: string; project_id: string; number: string }>(
    `SELECT ticket_id, project_id, number FROM (
       SELECT entity_id AS ticket_id,
              payload->>'projectId' AS project_id,
              row_number() OVER (PARTITION BY payload->>'projectId' ORDER BY workspace_seq) AS number
         FROM events
        WHERE workspace_id = $1 AND type = 'ticket.created'
     ) ranked`,
    [workspaceId],
  );
  return rows.map((row) => ({ ticketId: row.ticket_id, projectId: row.project_id, number: Number(row.number) }));
}

describe('28.020 the key query is unchanged on a ledger with no draft', () => {
  it('28.020 ticketNumbers and ticketIdsAtNumber equal the old query for every ticket, a purged one included', async () => {
    const base = await seedWorkspace(db.pool);
    const P1 = newUlid();
    const P2 = newUlid();
    const ids = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
    await append(
      ticketCreated(base, ids[0]!, P1, 'a'),
      ticketCreated(base, ids[1]!, P2, 'b'),
      ticketCreated(base, ids[2]!, P1, 'c'),
      ticketCreated(base, ids[3]!, P1, 'd'),
      ticketCreated(base, ids[4]!, P2, 'e'),
    );
    // a purged ticket keeps its slot: redact ids[2] through the sanctioned path
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT * FROM purge_ledger($1, $2)', ['ticket', ids[2]]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    // the purge really redacted the row, so the parity below covers a purged ticket and not a live one
    const { rows: purgedRows } = await db.pool.query<{ payload: unknown }>(
      `SELECT payload FROM events WHERE entity_id = $1 AND type = 'ticket.created'`,
      [ids[2]],
    );
    expect(purgedRows.map((row) => row.payload)).toEqual([{ projectId: P1, purged: true }]);
    const old = await legacyRows(base.WS);
    expect(old).toHaveLength(5);
    const now = await ticketNumbers(db.pool, base.WS);
    expect([...now.entries()].sort()).toEqual(old.map((row) => [row.ticketId, row.number] as const).sort());
    expect(now.get(ids[3]!)).toBe(3); // control: the purged slot is still counted (P1: a, c purged, d)
    // the inverse equals the old inverse, for every (project, number) the old query numbered
    for (const { projectId, number } of old) {
      const wanted = old.filter((row) => row.projectId === projectId && row.number === number).map((row) => row.ticketId);
      expect(await ticketIdsAtNumber(db.pool, base.WS, [projectId], number)).toEqual(wanted.sort());
    }
    expect(NUMBERING_ROWS_SQL).toContain("'ticket.published'");
  });
});

describe('28.021 a draft takes no number until it is published', () => {
  it('28.021 draft X1, ticket Y2, publish X1: Y2 is #1, X1 is #2; control: without draft X1 is #1', async () => {
    const base = await seedWorkspace(db.pool);
    const P = newUlid();
    const X1 = newUlid();
    const Y2 = newUlid();
    await append(draftCreated(base, X1, P, 'draft'), ticketCreated(base, Y2, P, 'plain'));
    expect((await ticketNumbers(db.pool, base.WS, [X1, Y2])).get(X1)).toBeUndefined();
    expect((await ticketNumbers(db.pool, base.WS, [X1, Y2])).get(Y2)).toBe(1);
    await append(published(base, X1, P));
    const after = await ticketNumbers(db.pool, base.WS, [X1, Y2]);
    expect(after.get(Y2)).toBe(1);
    expect(after.get(X1)).toBe(2);
    expect(await ticketIdsAtNumber(db.pool, base.WS, [P], 2)).toEqual([X1]);
    expect(await ticketIdsAtNumber(db.pool, base.WS, [P], 1)).toEqual([Y2]);
    // control: the same two creates without `draft`
    const base2 = await seedWorkspace(db.pool);
    const P2 = newUlid();
    const X = newUlid();
    const Y = newUlid();
    await append(ticketCreated(base2, X, P2, 'plain first'), ticketCreated(base2, Y, P2, 'plain second'));
    const control = await ticketNumbers(db.pool, base2.WS, [X, Y]);
    expect([control.get(X), control.get(Y)]).toEqual([1, 2]);
  });
});
