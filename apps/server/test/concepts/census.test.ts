/**
 * Knowledge Graph spec D §3.2 (KG-D Task 3): the concept kind's audience on the stream (27.454), and the registry
 * census that holds every registered `concept.*` type to the door, the purge check and the projection (27.457)
 * (`test-cases/27-knowledge-graph.md` §27.4). The history half is 27.456 (app-core); the audience half is the
 * compile-time switch (TS2366) plus 27.454.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONCEPT_EVENT_TYPES, domainRegistry, makeEnvelope, newUlid, type LedgerEvent, type Ulid } from '@gisik-nokma/domain';
import { checkConceptPermission } from '../../src/permissions/check-concept.js';
import { checkPermission } from '../../src/permissions/check-permission.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { checkPurged } from '../../src/purge/check-purged.js';
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

/** The three concept tables, every column, ordered: a fold that changed nothing serialises identically. */
async function tables(): Promise<string> {
  const read = async (sql: string) => JSON.stringify((await db.pool.query(sql)).rows);
  return [
    await read('SELECT * FROM proj_concepts ORDER BY concept_id'),
    await read('SELECT * FROM proj_concept_items ORDER BY concept_id, item_kind, item_id'),
    await read('SELECT * FROM proj_concept_links ORDER BY a, b, relation'),
  ].join('\n');
}

describe('27.457 the concept registry census', () => {
  it('27.457 each registered concept.* type is in the list, refused to a guest, purge-checked for what it names, and folded; control: a guest’s comment is not the concept pass’s', async () => {
    const registered = domainRegistry
      .registrations()
      .map((r) => r.type)
      .filter((type) => type.startsWith('concept.'));
    expect(registered).toHaveLength(9);

    // A purged ticket, note and concept, as the purge registry records them (`migrations/1790600000000_purge-engine.sql:7-13`).
    const [goneTicket, goneNote, goneConcept] = [newUlid(), newUlid(), newUlid()];
    await db.pool.query(
      `INSERT INTO purged_entities (entity_kind, entity_id, workspace_id, purged_at)
       VALUES ('ticket', $1, $4, now()), ('note', $2, $4, now()), ('concept', $3, $4, now())`,
      [goneTicket, goneNote, goneConcept, world.WS],
    );
    const valid: Record<string, Record<string, unknown>> = {
      'concept.created': { name: 'Census' },
      'concept.renamed': { name: 'Renamed' },
      'concept.described': { summary: 'x' },
      'concept.item_tagged': { itemKind: 'ticket', itemId: world.TE },
      'concept.item_untagged': { itemKind: 'ticket', itemId: world.TE },
      'concept.linked': { otherId: CW, relation: 'related' },
      'concept.unlinked': { otherId: CW, relation: 'related' },
      'concept.merged': { intoId: CW },
      'concept.deleted': {},
    };
    /** The payloads naming a purged entity, by type: the five that name another entity. */
    const naming: Record<string, Record<string, unknown>[]> = {
      'concept.item_tagged': [{ itemKind: 'ticket', itemId: goneTicket }, { itemKind: 'note', itemId: goneNote }],
      'concept.item_untagged': [{ itemKind: 'ticket', itemId: goneTicket }, { itemKind: 'note', itemId: goneNote }],
      'concept.linked': [{ otherId: goneConcept, relation: 'related' }],
      'concept.unlinked': [{ otherId: goneConcept, relation: 'broader' }],
      'concept.merged': [{ intoId: goneConcept }],
    };
    const guest = world.ids.guestListed;
    const envelope = (type: string, payload: unknown, actorId: string) =>
      makeEnvelope({ type, payload, entity: { kind: 'concept', id: CE }, workspaceId: world.WS, actorId, origin: 'web' });

    for (const type of registered) {
      // 1. In the domain's list.
      expect(CONCEPT_EVENT_TYPES as readonly string[], type).toContain(type);
      // 2. The door has an arm: a guest is refused it, on a concept the guest can see (CE tags TE, explicit [guestListed]).
      expect(await checkPermission(envelope(type, valid[type], guest), { db: db.pool, sessionUserId: guest }), type).toEqual({
        refused: true,
        rule: 'permission.concept',
        reason: 'Guests can read concepts but cannot change them.',
      });
      // 3. What it names is checked against the purge registry; the valid payload (live ids) passes.
      for (const payload of naming[type] ?? []) {
        expect(await checkPurged(db.pool, envelope(type, payload, world.ids.owner)), `${type} ${JSON.stringify(payload)}`).toMatchObject({
          refused: true,
          rule: 'purge.erased',
        });
      }
      expect(await checkPurged(db.pool, envelope(type, valid[type], world.ids.owner)), type).toBeNull();
    }
    expect(Object.keys(naming).sort()).toEqual(['concept.item_tagged', 'concept.item_untagged', 'concept.linked', 'concept.merged', 'concept.unlinked']);

    // Control: the concept pass answers only for the concept kind (a guest's comment on TP is not its business).
    const eff = await resolveEffectiveRole(db.pool, guest, world.WS);
    const comment = makeEnvelope({
      type: 'comment.added',
      payload: { body: { type: 'doc' } },
      entity: { kind: 'ticket', id: world.TP },
      workspaceId: world.WS,
      actorId: guest,
      origin: 'web',
    });
    expect(await checkConceptPermission(comment, { db: db.pool, sessionUserId: guest, eff, workspaceExists: true })).toBeNull();

    // 4. The projection is total over the nine AND each arm does something: every step changes the tables.
    const [C1, C2] = [newUlid(), newUlid()].sort() as [Ulid, Ulid]; // C1 < C2: a related link is written by the lower id (R1)
    const steps: Array<[string, string, Record<string, unknown>]> = [
      [C1, 'concept.created', { name: 'One' }],
      [C2, 'concept.created', { name: 'Two' }],
      [C1, 'concept.renamed', { name: 'One renamed' }],
      [C1, 'concept.described', { summary: 'x' }],
      [C1, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TP }],
      [C1, 'concept.item_untagged', { itemKind: 'ticket', itemId: world.TP }],
      [C1, 'concept.linked', { otherId: C2, relation: 'related' }],
      [C1, 'concept.unlinked', { otherId: C2, relation: 'related' }],
      [C1, 'concept.merged', { intoId: C2 }],
      [C2, 'concept.deleted', {}],
    ];
    expect([...new Set(steps.map(([, type]) => type))].sort()).toEqual([...registered].sort());
    for (const [concept, type, payload] of steps) {
      const before = await tables();
      await applyCommitted(db.pool, [cev(concept, type, payload)]);
      expect(await tables(), `${type} changed nothing`).not.toBe(before);
    }
  });
});
