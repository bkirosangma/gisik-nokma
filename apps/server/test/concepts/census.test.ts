/**
 * Knowledge Graph spec D §3.2 (KG-D Task 3): the concept kind's audience on the stream. Case 27.454
 * (`test-cases/27-knowledge-graph.md` §27.4).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { visibleEventsFor, type SyncItem } from '../../src/visibility/visible-events-for.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture, type NotesUser } from '../helpers/notes-fixture.js';

let db: TestDatabase;
let world: NotesFixture;
const [CP, CW, CE] = [newUlid(), newUlid(), newUlid()];

function cev(conceptId: string, type: string, payload: Record<string, unknown>): LedgerEvent {
  return makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'concept', id: conceptId }, type, payload });
}

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedNotesFixture(db.pool);
  await applyCommitted(db.pool, [
    cev(CP, 'concept.created', { name: 'Licences' }),
    cev(CP, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TP }),
    cev(CW, 'concept.created', { name: 'Workspace notes' }),
    cev(CW, 'concept.item_tagged', { itemKind: 'note', itemId: world.NOTES.nWorkspace }),
    cev(CE, 'concept.created', { name: 'Invoices' }),
    cev(CE, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TE }),
  ]);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

/** The drain of `test/visibility/notes-stream.test.ts:69-75`, for one reader from the start of the stream. */
async function drain(who: NotesUser): Promise<LedgerEvent[]> {
  const items: SyncItem[] = [];
  for await (const item of visibleEventsFor(db.pool, world.ids[who], world.WS, 0)) items.push(item);
  return items.filter((item): item is LedgerEvent => !('kind' in item));
}

describe('27.454 concept events never stream', () => {
  it('27.454 the raw stream holds the concept events and no reader is sent one; control: TP’s ticket events reach memberIn', async () => {
    // A "yields none" over a stream that holds none cannot fail.
    const raw = await db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM events WHERE workspace_id = $1 AND entity_kind = 'concept'`,
      [world.WS],
    );
    expect(raw.rows[0]?.n).toBe(6);
    for (const who of ['memberIn', 'owner', 'guestListed'] as NotesUser[]) {
      expect((await drain(who)).filter((event) => event.entity.kind === 'concept'), who).toEqual([]);
    }
    const memberIn = await drain('memberIn');
    expect(memberIn.some((event) => event.entity.kind === 'ticket' && event.entity.id === world.TP && event.type === 'ticket.created')).toBe(true);
  });
});
