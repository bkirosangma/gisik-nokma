import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { ticketNumbers } from '../../src/read/ticket-numbers.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { ev, seedWorkspace, ticketCreated, TYPE_ID, type Base } from './world.js';

/**
 * Drafts T2 (spec §6.3, R28): the purge keeps the NUMBERING ROWS, redacted, and the append-only trigger
 * admits exactly those redactions. Cases 28.022-28.025 (`test-cases/28-drafts.md` §28.2). Ledger-level:
 * `purge_ledger` is called directly, the way `purgeItem` and (from T5) the discard call it.
 */

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
}, 60_000);
afterAll(async () => {
  await db.drop();
});

const draftCreated = (base: Base, id: string, projectId: string): LedgerEvent =>
  ev(base, 'ticket', id, 'ticket.created', { typeId: TYPE_ID, projectId, parentId: null, title: 'd', start: 'backlog', draft: true });
const published = (base: Base, id: string, projectId: string): LedgerEvent =>
  ev(base, 'ticket', id, 'ticket.published', { projectId });
async function append(...events: LedgerEvent[]): Promise<void> {
  for (const event of events) await appendTestEvent(db.pool, event);
}
/** The sanctioned purge path, ledger half only: `purge_ledger` is the one function the trigger admits. */
async function purgeLedger(ticketId: string): Promise<void> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT * FROM purge_ledger($1, $2)', ['ticket', ticketId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
async function inTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}
const payloadOf = async (client: PoolClient | typeof db.pool, id: string, type: string): Promise<unknown> =>
  (await client.query('SELECT payload FROM events WHERE entity_id = $1 AND type = $2', [id, type])).rows[0]?.payload;
/** Every ledger row the entity still has, in its own seq order: what a purge must leave is read whole. */
const streamOf = async (id: string): Promise<{ type: string; payload: unknown }[]> =>
  (await db.pool.query('SELECT type, payload FROM events WHERE entity_id = $1 ORDER BY seq', [id])).rows;
const fieldSet = (base: Base, id: string, value: string): LedgerEvent =>
  ev(base, 'ticket', id, 'ticket.field_set', { fieldId: 'title', value });

describe('28.022 a discarded draft leaves no gap', () => {
  it('28.022 D1 (draft), T2, discard D1, T3: T2 is #1 and T3 is #2; D1 keeps exactly its redacted creation', async () => {
    const base = await seedWorkspace(db.pool);
    const P = newUlid();
    const [D1, T2, T3] = [newUlid(), newUlid(), newUlid()] as const;
    await append(draftCreated(base, D1, P), ticketCreated(base, T2, P, 'two'));
    // a real draft stream: edited, assigned, then discarded (T5 commits ticket.discarded, then purges)
    await append(
      fieldSet(base, D1, 'd edited'),
      ev(base, 'ticket', D1, 'ticket.assigned', { assigneeId: base.OWNER }),
      ev(base, 'ticket', D1, 'ticket.discarded', {}),
    );
    // control: before the purge every row of the draft is there
    expect((await streamOf(D1)).map((row) => row.type)).toEqual(['ticket.created', 'ticket.field_set', 'ticket.assigned', 'ticket.discarded']);
    await purgeLedger(D1); // the discard's ledger half
    // a discard erases everything (spec R37): exactly one redacted creation remains, nothing else
    expect(await streamOf(D1)).toEqual([{ type: 'ticket.created', payload: { projectId: P, purged: true, draft: true } }]);
    await append(ticketCreated(base, T3, P, 'three'));
    const numbers = await ticketNumbers(db.pool, base.WS, [D1, T2, T3]);
    expect([numbers.get(D1), numbers.get(T2), numbers.get(T3)]).toEqual([undefined, 1, 2]);
    expect(await payloadOf(db.pool, D1, 'ticket.created')).toEqual({ projectId: P, purged: true, draft: true });
  });
});

describe('28.023 purge failure (1): an unpublished draft consumes no number when purged', () => {
  it('28.023 the redacted creation still says draft, so a later ticket keeps its number', async () => {
    const base = await seedWorkspace(db.pool);
    const P = newUlid();
    const [A, D, Z] = [newUlid(), newUlid(), newUlid()] as const;
    await append(ticketCreated(base, A, P, 'a'), draftCreated(base, D, P));
    await append(ticketCreated(base, Z, P, 'z'));
    const before = (await ticketNumbers(db.pool, base.WS, [Z])).get(Z);
    expect(before).toBe(2);
    await purgeLedger(D);
    expect((await ticketNumbers(db.pool, base.WS, [Z])).get(Z)).toBe(2);
    expect((await ticketNumbers(db.pool, base.WS, [D])).get(D)).toBeUndefined();
    // control: a NON-draft ticket purged keeps its slot, so the next one moves by nothing either
    await purgeLedger(A);
    expect((await ticketNumbers(db.pool, base.WS, [A, Z])).get(A)).toBe(1);
    expect((await ticketNumbers(db.pool, base.WS, [Z])).get(Z)).toBe(2);
  });
});

describe('28.024 purge failure (2): a purged published draft keeps its slot', () => {
  it('28.024 the redacted ticket.published row is still a numbering row; later numbers do not shift; X keeps exactly its two redacted rows', async () => {
    const base = await seedWorkspace(db.pool);
    const P = newUlid();
    const [A, X, B, C] = [newUlid(), newUlid(), newUlid(), newUlid()] as const;
    await append(ticketCreated(base, A, P, 'a'), draftCreated(base, X, P), ticketCreated(base, B, P, 'b'));
    await append(fieldSet(base, X, 'x drafted'), published(base, X, P), fieldSet(base, X, 'x live'), ticketCreated(base, C, P, 'c'));
    // control: before the purge X's edits on both sides of the publish are there
    expect((await streamOf(X)).map((row) => row.type)).toEqual(['ticket.created', 'ticket.field_set', 'ticket.published', 'ticket.field_set']);
    const before = await ticketNumbers(db.pool, base.WS, [A, X, B, C]);
    expect([before.get(A), before.get(B), before.get(X), before.get(C)]).toEqual([1, 2, 3, 4]);
    await purgeLedger(X);
    const after = await ticketNumbers(db.pool, base.WS, [A, X, B, C]);
    expect([after.get(A), after.get(B), after.get(X), after.get(C)]).toEqual([1, 2, 3, 4]);
    expect(await payloadOf(db.pool, X, 'ticket.published')).toEqual({ projectId: P, purged: true });
    expect(await payloadOf(db.pool, X, 'ticket.created')).toEqual({ projectId: P, purged: true, draft: true });
    // exactly the two redacted numbering rows remain, in seq order; both edits are gone
    expect(await streamOf(X)).toEqual([
      { type: 'ticket.created', payload: { projectId: P, purged: true, draft: true } },
      { type: 'ticket.published', payload: { projectId: P, purged: true } },
    ]);
  });
});

describe('28.025 the trigger admits exactly three redactions', () => {
  it('28.025 the three exact shapes pass; every near miss and every outside-purge write is refused', async () => {
    const base = await seedWorkspace(db.pool);
    const P = newUlid();
    const [N, D, X, F] = [newUlid(), newUlid(), newUlid(), newUlid()] as const;
    await append(
      ticketCreated(base, N, P, 'plain'),
      draftCreated(base, D, P),
      draftCreated(base, X, P),
      published(base, X, P),
      ev(base, 'ticket', F, 'ticket.created', { typeId: TYPE_ID, projectId: P, parentId: null, title: 'f' }),
      ev(base, 'ticket', F, 'ticket.field_set', { fieldId: 'title', value: 'g' }),
    );
    const REFUSED = (op: string) => `events is append-only: ${op} refused`;
    /**
     * Opens a real purge of `id` (so the sanction is open and `purge_ledger` has put the row in its redacted
     * form), then tries to rewrite that row's payload. The trigger compares the new payload with the
     * redaction it computes from the row, so a rewrite to the same shape is accepted and any other is refused.
     * The whole transaction is rolled back, so the shared world is unchanged between probes.
     */
    const rewrite = (id: string, type: string, payload: object): Promise<string> =>
      inTx(async (client) => {
        await client.query('SELECT * FROM purge_ledger($1, $2)', ['ticket', id]);
        try {
          await client.query('UPDATE events SET payload = $3 WHERE entity_id = $1 AND type = $2', [id, type, JSON.stringify(payload)]);
          return 'accepted';
        } catch (error) {
          return (error as Error).message;
        }
      });
    // the three exact shapes: accepted
    expect(await rewrite(N, 'ticket.created', { projectId: P, purged: true })).toBe('accepted');
    expect(await rewrite(D, 'ticket.created', { projectId: P, purged: true, draft: true })).toBe('accepted');
    expect(await rewrite(X, 'ticket.published', { projectId: P, purged: true })).toBe('accepted');
    // near misses, each the same call with one input changed: refused
    expect(await rewrite(D, 'ticket.created', { projectId: P, purged: true })).toBe(REFUSED('UPDATE')); // marker dropped
    expect(await rewrite(N, 'ticket.created', { projectId: P, purged: true, draft: true })).toBe(REFUSED('UPDATE')); // marker invented
    expect(await rewrite(X, 'ticket.published', { projectId: P, purged: true, draft: true })).toBe(REFUSED('UPDATE'));
    expect(await rewrite(X, 'ticket.published', { projectId: P, purged: true, extra: 1 })).toBe(REFUSED('UPDATE'));
    expect(await rewrite(X, 'ticket.published', { projectId: newUlid(), purged: true })).toBe(REFUSED('UPDATE')); // another project
    // outside a purge every write is refused, whatever the type, with the original message
    for (const type of ['ticket.created', 'ticket.published', 'ticket.field_set']) {
      const id = type === 'ticket.published' ? X : type === 'ticket.field_set' ? F : N;
      await expect(db.pool.query('UPDATE events SET payload = $2 WHERE entity_id = $1 AND type = $3', [id, '{}', type])).rejects.toMatchObject({ message: REFUSED('UPDATE') });
      await expect(db.pool.query('DELETE FROM events WHERE entity_id = $1 AND type = $2', [id, type])).rejects.toMatchObject({ message: REFUSED('DELETE') });
    }
  });
});
