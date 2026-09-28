import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { insertEvent } from '../../src/ledger/event-store.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { ev, noteCreated, projectCreated, seedWorkspace, ticketCreated, type Base } from './world.js';

/**
 * Spec §5.2 / §8 "The trigger" — cases 19.100–19.107
 * (`test-cases/19-trash.md` §19.12).
 *
 * Every probe runs inside `inTx`, which ALWAYS rolls back, so the shared world
 * is unchanged between cases — except 19.102, which must COMMIT a purge to
 * prove the sanction ends with the transaction, and does it on its own ticket Z.
 * This file never runs `verifyProjections`: `purge_ledger` alone (no TypeScript
 * layer) leaves projection rows behind by design; Task 5 is the whole path.
 */

let db: TestDatabase;
let base: Base;
let other: Base;
const P = newUlid();
const A = newUlid();
const A1 = newUlid();
const A2 = newUlid();
const B = newUlid();
const Z = newUlid();
const N = newUlid();
const P2 = newUlid();
const Q = newUlid();
const NP = newUlid();

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

function plantedOn(ticketId: string): LedgerEvent {
  return makeCommitted({
    workspaceId: base.WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.field_set',
    payload: { fieldId: 'title', value: 'planted' },
    actorId: base.OWNER,
  });
}

async function setOf(client: PoolClient | null, kind: string, id: string): Promise<string[]> {
  const run = client ?? db.pool;
  const { rows } = await run.query<{ k: string }>(
    `SELECT set_kind || ':' || set_id AS k FROM purge_erasure_set($1, $2) ORDER BY 1`,
    [kind, id],
  );
  // Sorted in JS, not by SQL `ORDER BY`: the database collation and `Array.prototype.sort`
  // need not agree, and every expectation below is sorted in JS.
  return rows.map((row) => row.k).sort();
}

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
  base = await seedWorkspace(db.pool);
  await applyCommitted(db.pool, [
    projectCreated(base, P, 'Ledger', 'LG'),
    ticketCreated(base, A, P, 'A'),
    ticketCreated(base, A1, P, 'A1', A),
    ticketCreated(base, A2, P, 'A2', A1),
    ticketCreated(base, B, P, 'B'),
    ticketCreated(base, Z, P, 'Z'),
    noteCreated(base, N, { title: 'N', homeProjectId: '', scope: { mode: 'private' } }),
    projectCreated(base, P2, 'Second', 'SC'),
    ticketCreated(base, Q, P2, 'Q'),
    ev(base, 'ticket', Q, 'ticket.deleted', {}),
    noteCreated(base, NP, { title: 'NP', homeProjectId: P2, scope: { mode: 'project' } }),
  ]);
  for (const ticketId of [A, B]) {
    await db.pool.query(`INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ('ticket', $1, 1, '{}')`, [
      ticketId,
    ]);
  }
  other = await seedWorkspace(db.pool);
  await applyCommitted(db.pool, [projectCreated(other, newUlid(), 'Other', 'OT')]);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe('19.100 outside a purge the ledger stays append-only', () => {
  it('refuses DELETE and UPDATE with the existing messages, and still admits an INSERT', async () => {
    await expect(db.pool.query('DELETE FROM events WHERE entity_id = $1', [B])).rejects.toMatchObject({
      message: 'events is append-only: DELETE refused',
    });
    await expect(db.pool.query('UPDATE events SET version = version WHERE entity_id = $1', [B])).rejects.toMatchObject({
      message: 'events is append-only: UPDATE refused',
    });
    // CONTROL — the triggers are BEFORE UPDATE/DELETE/TRUNCATE only.
    await inTx(async (client) => {
      await insertEvent(client, plantedOn(B));
    });
  });
});

describe('19.101 a purge sanctions its own set and nothing else', () => {
  it('refuses a row of B inside A’s purge, and admits a row of A', async () => {
    await inTx(async (client) => {
      await client.query('SELECT * FROM purge_ledger($1, $2)', ['ticket', A]);
      await client.query('SAVEPOINT probe');
      await expect(client.query('DELETE FROM events WHERE entity_id = $1', [B])).rejects.toMatchObject({
        message: 'events is append-only: DELETE refused',
      });
      await client.query('ROLLBACK TO SAVEPOINT probe');
      // CONTROL — a row of the SANCTIONED set is deletable in the same transaction.
      const planted = plantedOn(A);
      await insertEvent(client, planted);
      const deleted = await client.query('DELETE FROM events WHERE id = $1', [planted.id]);
      expect(deleted.rowCount).toBe(1);
    });
  });
});

describe('19.102 the sanction ends with its transaction', () => {
  it('reads the setting inside, and after COMMIT has no setting, no set, and refuses the redacted row', async () => {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT * FROM purge_ledger($1, $2)', ['ticket', Z]);
      const inside = await client.query<{ v: string | null }>(`SELECT current_setting('gisik.purge', true) AS v`);
      expect(inside.rows[0]?.v).toBe(`ticket:${Z}`); // CONTROL
      await client.query('COMMIT');

      const after = await client.query<{ v: string | null; t: string | null }>(
        `SELECT current_setting('gisik.purge', true) AS v, to_regclass('pg_temp.purge_set')::text AS t`,
      );
      expect(after.rows[0]?.v ?? '').toBe('');
      expect(after.rows[0]?.t).toBeNull();
      await expect(
        client.query(`DELETE FROM events WHERE entity_id = $1 AND type = 'ticket.created'`, [Z]),
      ).rejects.toMatchObject({ message: 'events is append-only: DELETE refused' });
    } finally {
      client.release();
    }
  });
});

describe('19.103 the only sanctioned UPDATE is the exact redaction', () => {
  it('refuses a redaction carrying a title and an actor rewrite, and admits the exact redaction', async () => {
    await inTx(async (client) => {
      await client.query('SELECT * FROM purge_ledger($1, $2)', ['ticket', A]);
      await client.query('SAVEPOINT probe');
      await expect(
        client.query(
          `UPDATE events SET payload = jsonb_build_object('projectId', payload->>'projectId', 'purged', true, 'title', 'kept')
            WHERE entity_id = $1 AND type = 'ticket.created'`,
          [A1],
        ),
      ).rejects.toMatchObject({ message: 'events is append-only: UPDATE refused' });
      await client.query('ROLLBACK TO SAVEPOINT probe');
      await expect(
        client.query(`UPDATE events SET actor_id = $2 WHERE entity_id = $1 AND type = 'ticket.created'`, [
          A1,
          newUlid(),
        ]),
      ).rejects.toMatchObject({ message: 'events is append-only: UPDATE refused' });
      await client.query('ROLLBACK TO SAVEPOINT probe');
      // CONTROL — the exact redaction, re-applied to a set member.
      const redone = await client.query(
        `UPDATE events SET payload = jsonb_build_object('projectId', payload->>'projectId', 'purged', true)
          WHERE entity_id = $1 AND type = 'ticket.created'`,
        [A1],
      );
      expect(redone.rowCount).toBe(1);
    });
  });
});

describe('19.104 TRUNCATE is refused even inside a purge', () => {
  it('refuses TRUNCATE with its message; a sanctioned DELETE in the same transaction succeeds', async () => {
    await inTx(async (client) => {
      await client.query('SELECT * FROM purge_ledger($1, $2)', ['ticket', A]);
      const planted = plantedOn(A);
      await insertEvent(client, planted);
      const deleted = await client.query('DELETE FROM events WHERE id = $1', [planted.id]);
      expect(deleted.rowCount).toBe(1); // CONTROL
      await expect(client.query('TRUNCATE events')).rejects.toMatchObject({
        message: 'events is append-only: TRUNCATE refused',
      });
    });
  });
});

describe('19.105 purge_erasure_set takes what each kind owns', () => {
  it('ticket → subtree; project → tickets and notes; note → itself; workspace → its events’ entities', async () => {
    expect(await setOf(null, 'ticket', A)).toEqual([`ticket:${A}`, `ticket:${A1}`, `ticket:${A2}`].sort());
    expect(await setOf(null, 'ticket', A)).not.toContain(`ticket:${B}`); // CONTROL
    expect(await setOf(null, 'project', P2)).toEqual([`note:${NP}`, `project:${P2}`, `ticket:${Q}`].sort());
    expect(await setOf(null, 'project', P2)).not.toContain(`note:${N}`); // CONTROL
    expect(await setOf(null, 'note', N)).toEqual([`note:${N}`]);
    const { rows } = await db.pool.query<{ k: string }>(
      `SELECT DISTINCT entity_kind || ':' || entity_id AS k FROM events WHERE workspace_id = $1 ORDER BY 1`,
      [other.WS],
    );
    const otherSet = await setOf(null, 'workspace', other.WS);
    expect(otherSet).toEqual(rows.map((row) => row.k).sort());
    expect(otherSet.some((k) => k === `ticket:${A}` || k === `project:${P}`)).toBe(false); // CONTROL
  });
});

describe('19.106 purge_ledger erases the set, redacting ticket creations only for a ticket purge', () => {
  it('keeps exactly the subtree’s redacted creations for a ticket, nothing for a project; returns the set', async () => {
    await inTx(async (client) => {
      const erased = await client.query<{ erased_kind: string; erased_id: string }>(
        'SELECT erased_kind, erased_id FROM purge_ledger($1, $2)',
        ['ticket', A],
      );
      expect(erased.rows.map((row) => `${row.erased_kind}:${row.erased_id}`).sort()).toEqual(
        [`ticket:${A}`, `ticket:${A1}`, `ticket:${A2}`].sort(),
      );
      const left = await client.query<{ type: string; payload: unknown }>(
        `SELECT type, payload FROM events WHERE entity_id = ANY($1::text[]) ORDER BY entity_id`,
        [[A, A1, A2]],
      );
      expect(left.rows).toHaveLength(3);
      for (const row of left.rows) {
        expect(row).toEqual({ type: 'ticket.created', payload: { projectId: P, purged: true } });
      }
      const snaps = await client.query<{ entity_id: string }>(
        `SELECT entity_id FROM snapshots WHERE entity_id = ANY($1::text[]) ORDER BY entity_id`,
        [[A, B]],
      );
      expect(snaps.rows.map((row) => row.entity_id)).toEqual([B]); // CONTROL — B untouched
    });
    await inTx(async (client) => {
      await client.query('SELECT * FROM purge_ledger($1, $2)', ['project', P2]);
      const left = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM events WHERE entity_id = ANY($1::text[])`,
        [[P2, Q, NP]],
      );
      expect(left.rows[0]?.n).toBe(0);
    });
  });
});

describe('19.107 the two functions are SECURITY DEFINER and not executable by PUBLIC', () => {
  it('reports prosecdef and a PUBLIC-free ACL; the same probe sees PUBLIC on a default-ACL function', async () => {
    const probe = async (name: string) => {
      const { rows } = await db.pool.query<{ secdef: boolean; public_exec: boolean }>(
        `SELECT p.prosecdef AS secdef,
                (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%X%')) AS public_exec
           FROM pg_proc p WHERE p.proname = $1`,
        [name],
      );
      return rows[0];
    };
    expect(await probe('purge_ledger')).toEqual({ secdef: true, public_exec: false });
    expect(await probe('purge_erasure_set')).toEqual({ secdef: true, public_exec: false });
    // CONTROL — a function with the default ACL: PUBLIC may execute.
    expect((await probe('events_append_only'))?.public_exec).toBe(true);
  });
});
