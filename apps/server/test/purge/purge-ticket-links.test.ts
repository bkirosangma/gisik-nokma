/**
 * Typed links T2 (Knowledge Graph spec A §2.5): a purge erases every `proj_ticket_links` row naming the ticket at
 * EITHER end, a rebuild agrees with the live tables, and the door refuses a link naming the erased id.
 * Cases 27.023–27.025 (`test-cases/27-knowledge-graph.md` §27.1).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeEnvelope, newUlid } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { getTicketStateFromDb } from '../../src/projections/tickets.js';
import { checkPurged } from '../../src/purge/check-purged.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scan } from './scan.js';
import { dueAt, ev, projectCreated, recordingStore, seedWorkspace, ticketCreated, type Base } from './world.js';

let db: TestDatabase;
let base: Base;
const P = newUlid();
const [A, B, C] = [newUlid(), newUlid(), newUlid()] as [string, string, string];

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
  base = await seedWorkspace(db.pool);
  // A blocks B (B is the TARGET), B relates to C (B is the SOURCE), A duplicates C (names no B: the control).
  await applyCommitted(db.pool, [
    projectCreated(base, P, 'Links', 'LK'),
    ticketCreated(base, A, P, 'Source A'),
    ticketCreated(base, B, P, 'Purged B'),
    ticketCreated(base, C, P, 'Survivor C'),
    ev(base, 'ticket', A, 'ticket.link_added', { kind: 'blocks', targetId: B }),
    ev(base, 'ticket', B, 'ticket.link_added', { kind: 'relates', targetId: C }),
    ev(base, 'ticket', A, 'ticket.link_added', { kind: 'duplicates', targetId: C }),
  ]);
}, 60_000);
afterAll(async () => {
  await db.drop();
});

const linkRows = async () =>
  (await db.pool.query<{ source_id: string; target_id: string; kind: string }>('SELECT source_id, target_id, kind FROM proj_ticket_links ORDER BY kind')).rows;

describe('27.023–27.024 a purged ticket takes its links at both ends', () => {
  it('27.023/27.024 purge B: the rows naming B go (as target AND as source), A→C stays, and a rebuild equals live', async () => {
    // CONTROL first: all three rows exist before the purge, so "gone" below is the purge's doing.
    expect(await linkRows()).toEqual([
      { source_id: A, target_id: B, kind: 'blocks' },
      { source_id: A, target_id: C, kind: 'duplicates' },
      { source_id: B, target_id: C, kind: 'relates' },
    ]);
    await applyCommitted(db.pool, [ev(base, 'ticket', B, 'ticket.deleted', {}), ev(base, 'ticket', B, 'purge.marked', {})]);
    await purgeItem(db.pool, { kind: 'ticket', id: B }, { projections: buildProjectionRegistry(), store: recordingStore(), now: await dueAt(db.pool, 'ticket', B) });
    // 27.023: the incoming A→B and the outgoing B→C are erased; the link between two survivors is untouched.
    expect(await linkRows()).toEqual([{ source_id: A, target_id: C, kind: 'duplicates' }]);
    expect(Object.keys(await scan(db.pool, [B])).filter((k) => k.startsWith('proj_ticket_links.'))).toEqual([]);
    // What stays, decided: A's ledger still holds `link_added` toward B, and A's folded copy still names it.
    const { rows } = await db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM events WHERE entity_id = $1 AND type = 'ticket.link_added' AND payload->>'targetId' = $2`,
      [A, B],
    );
    expect(rows[0]?.n).toBe(1);
    expect((await getTicketStateFromDb(db.pool, base.WS, A))?.links).toEqual([
      { kind: 'blocks', targetId: B },
      { kind: 'duplicates', targetId: C },
    ]);
    // 27.024: the rebuild replays A's `link_added` toward B and writes no row for it (the purge registry), so it agrees.
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});

describe('27.025 the door refuses a link naming an erased ticket', () => {
  it('27.025 checkPurged refuses link_added and link_removed toward the purged B; control: the same events toward the live C pass', async () => {
    // Precondition: B was erased by the case above (this file's cases run in order on one world).
    const purged = await db.pool.query('SELECT 1 FROM purged_entities WHERE entity_id = $1', [B]);
    expect(purged.rowCount).toBe(1);
    const env = (type: 'ticket.link_added' | 'ticket.link_removed', target: string) =>
      makeEnvelope({ workspaceId: base.WS, entity: { kind: 'ticket', id: A }, type, payload: { kind: 'blocks', targetId: target } });
    expect(await checkPurged(db.pool, env('ticket.link_added', B))).toMatchObject({ refused: true });
    expect(await checkPurged(db.pool, env('ticket.link_removed', B))).toMatchObject({ refused: true });
    // CONTROL: one input changed (the target), same source, same types.
    expect(await checkPurged(db.pool, env('ticket.link_added', C))).toBeNull();
    expect(await checkPurged(db.pool, env('ticket.link_removed', C))).toBeNull();
  });
});
