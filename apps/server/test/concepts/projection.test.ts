/**
 * Knowledge Graph spec D §3.1 (KG-D Task 3): the three concept projections — `proj_concepts`,
 * `proj_concept_items`, `proj_concept_links` — folded by `projConcepts`, kept through trash, erased by a
 * purge, and rebuilt equal to live. Cases 27.443–27.446, 27.452, 27.455 (`test-cases/27-knowledge-graph.md` §27.4).
 *
 * The cases share one world and run in file order: 27.452 purges TP and nWorkspace, so it runs after every case
 * that tags them, and 27.455 (reset, rolled back) runs last.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { projConcepts } from '../../src/projections/proj-concepts.js';
import { purgeItem, type PurgeDeps } from '../../src/purge/purge-item.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture, type NotesUser } from '../helpers/notes-fixture.js';
import { dueAt, recordingStore } from '../purge/world.js';

let db: TestDatabase;
let world: NotesFixture;

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedNotesFixture(db.pool);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

/** One committed concept event, by `who`, over `origin`. */
function cev(
  conceptId: string,
  type: string,
  payload: Record<string, unknown>,
  who: NotesUser = 'owner',
  origin: LedgerEvent['origin'] = 'web',
): LedgerEvent {
  return makeCommitted({
    workspaceId: world.WS,
    actorId: world.ids[who],
    entity: { kind: 'concept', id: conceptId },
    type,
    payload,
    origin,
  });
}

function onEntity(kind: 'ticket' | 'note', id: string, type: string, extra: Partial<LedgerEvent> = {}): LedgerEvent {
  return makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind, id }, type, payload: {}, ...extra });
}

/**
 * A purge appends its own events, which `makeCommitted`'s process-local counter never saw (`apply.ts` docblock:
 * "pass explicit seqs"), so the first event seeded after one carries the ledger's next `workspace_seq`.
 */
async function nextWorkspaceSeq(): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>('SELECT max(workspace_seq)::int + 1 AS n FROM events WHERE workspace_id = $1', [world.WS]);
  return rows[0]?.n ?? 1;
}

type ConceptRow = {
  workspace_id: string;
  name: string;
  summary: string;
  created_by: string;
  origin: string;
  from_suggestion: string | null;
  merged_into: string | null;
  deleted: boolean;
};

async function conceptRow(conceptId: string): Promise<ConceptRow | undefined> {
  const { rows } = await db.pool.query<ConceptRow>(
    'SELECT workspace_id, name, summary, created_by, origin, from_suggestion, merged_into, deleted FROM proj_concepts WHERE concept_id = $1',
    [conceptId],
  );
  return rows[0];
}

type ItemRow = { workspace_id: string; item_kind: string; item_id: string; tagged_by: string; origin: string };

async function itemRows(conceptId: string): Promise<ItemRow[]> {
  const { rows } = await db.pool.query<ItemRow>(
    'SELECT workspace_id, item_kind, item_id, tagged_by, origin FROM proj_concept_items WHERE concept_id = $1 ORDER BY item_kind, item_id',
    [conceptId],
  );
  return rows;
}

type LinkRow = { a: string; b: string; relation: string };

async function linkRows(...conceptIds: string[]): Promise<LinkRow[]> {
  const { rows } = await db.pool.query<LinkRow>(
    'SELECT a, b, relation FROM proj_concept_links WHERE a = ANY($1::text[]) OR b = ANY($1::text[]) ORDER BY relation, a, b',
    [conceptIds],
  );
  return rows;
}

function purgeDeps(now: Date): PurgeDeps {
  return { projections: buildProjectionRegistry(), store: recordingStore(), now };
}

describe('27.443 proj_concepts folds created, renamed, described and deleted', () => {
  it('27.443 rename keeps the summary, described "" clears it, delete keeps the row; control: a second created changes nothing', async () => {
    const C = newUlid();
    await applyCommitted(db.pool, [cev(C, 'concept.created', { name: 'Scroll', summary: 'first' })]);
    expect(await conceptRow(C)).toEqual({
      workspace_id: world.WS,
      name: 'Scroll',
      summary: 'first',
      created_by: world.ids.owner,
      origin: 'web',
      from_suggestion: null,
      merged_into: null,
      deleted: false,
    });

    await applyCommitted(db.pool, [cev(C, 'concept.renamed', { name: 'Scroll jumps' })]);
    expect(await conceptRow(C)).toMatchObject({ name: 'Scroll jumps', summary: 'first' });

    // Control: a second `concept.created` on the same id, by another actor, changes neither the name nor the creator.
    await applyCommitted(db.pool, [cev(C, 'concept.created', { name: 'Other', summary: 'other' }, 'memberIn')]);
    expect(await conceptRow(C)).toMatchObject({ name: 'Scroll jumps', summary: 'first', created_by: world.ids.owner });

    // From 'first', not from '': a summary that started empty could not show a no-op `described` arm.
    await applyCommitted(db.pool, [cev(C, 'concept.described', { summary: '' })]);
    expect(await conceptRow(C)).toMatchObject({ name: 'Scroll jumps', summary: '' });

    await applyCommitted(db.pool, [cev(C, 'concept.deleted', {})]);
    expect(await conceptRow(C)).toMatchObject({ name: 'Scroll jumps', deleted: true, merged_into: null });

    // The INSERT's other columns: an assistant's creation from a suggestion, with no summary.
    const S = newUlid();
    const suggestion = newUlid();
    await applyCommitted(db.pool, [cev(S, 'concept.created', { name: 'Phones', fromSuggestion: suggestion }, 'memberIn', 'mcp')]);
    expect(await conceptRow(S)).toMatchObject({
      name: 'Phones',
      summary: '',
      created_by: world.ids.memberIn,
      origin: 'mcp',
      from_suggestion: suggestion,
      deleted: false,
    });
  });
});

describe('27.444 tag and untag', () => {
  it('27.444 untag removes only its own row; tagged_by and origin are the event’s; control: ticket.deleted keeps the tag', async () => {
    const C = newUlid();
    await applyCommitted(db.pool, [
      cev(C, 'concept.created', { name: 'Tagging' }),
      cev(C, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TP }, 'memberIn', 'mcp'),
      cev(C, 'concept.item_tagged', { itemKind: 'note', itemId: world.NOTES.nProject }, 'author', 'web'),
    ]);
    // Both rows first, differing in both fields, so neither can be a constant.
    expect(await itemRows(C)).toEqual([
      { workspace_id: world.WS, item_kind: 'note', item_id: world.NOTES.nProject, tagged_by: world.ids.author, origin: 'web' },
      { workspace_id: world.WS, item_kind: 'ticket', item_id: world.TP, tagged_by: world.ids.memberIn, origin: 'mcp' },
    ]);

    await applyCommitted(db.pool, [cev(C, 'concept.item_untagged', { itemKind: 'note', itemId: world.NOTES.nProject })]);
    const onlyTP = [{ workspace_id: world.WS, item_kind: 'ticket', item_id: world.TP, tagged_by: world.ids.memberIn, origin: 'mcp' }];
    expect(await itemRows(C)).toEqual(onlyTP);

    // Control: trash keeps rows (a projection that dropped the tag on ticket.deleted would lose it for good).
    await applyCommitted(db.pool, [onEntity('ticket', world.TP, 'ticket.deleted')]);
    expect(await itemRows(C)).toEqual(onlyTP);
    await applyCommitted(db.pool, [onEntity('ticket', world.TP, 'ticket.restored')]);
    expect(await itemRows(C)).toEqual(onlyTP);
  });
});

describe('27.445 concept links', () => {
  it('27.445 related is stored a < b from either side, broader as written, unlinked from either side; control: unlink broader from the other concept keeps it', async () => {
    const [C2, C1] = [newUlid(), newUlid()].sort() as [string, string];
    expect(C2 < C1).toBe(true);
    await applyCommitted(db.pool, [cev(C1, 'concept.created', { name: 'One' }), cev(C2, 'concept.created', { name: 'Two' })]);

    // From the HIGHER id: the related row is stored (C2, C1).
    await applyCommitted(db.pool, [cev(C1, 'concept.linked', { otherId: C2, relation: 'related' })]);
    expect(await linkRows(C1, C2)).toEqual([{ a: C2, b: C1, relation: 'related' }]);

    // broader from C1 to C2 is stored as written, although C2 < C1; by an assistant, so actor and origin are the event's.
    await applyCommitted(db.pool, [cev(C1, 'concept.linked', { otherId: C2, relation: 'broader' }, 'memberIn', 'mcp')]);
    expect(await linkRows(C1, C2)).toEqual([
      { a: C1, b: C2, relation: 'broader' },
      { a: C2, b: C1, relation: 'related' },
    ]);
    const broader = await db.pool.query<{ workspace_id: string; linked_by: string; origin: string }>(
      `SELECT workspace_id, linked_by, origin FROM proj_concept_links WHERE a = $1 AND b = $2 AND relation = 'broader'`,
      [C1, C2],
    );
    expect(broader.rows).toEqual([{ workspace_id: world.WS, linked_by: world.ids.memberIn, origin: 'mcp' }]);

    // Control: `broader` is directed, so unlinking it from C2 names (C2, C1) and leaves C1's (C1, C2).
    await applyCommitted(db.pool, [cev(C2, 'concept.unlinked', { otherId: C1, relation: 'broader' })]);
    expect(await linkRows(C1, C2)).toEqual([
      { a: C1, b: C2, relation: 'broader' },
      { a: C2, b: C1, relation: 'related' },
    ]);

    // Unlinked from C1, the HIGHER id: the raw key (C1, C2) is not the stored (C2, C1), so this needs linkKey.
    await applyCommitted(db.pool, [cev(C1, 'concept.unlinked', { otherId: C2, relation: 'related' })]);
    expect(await linkRows(C1, C2)).toEqual([{ a: C1, b: C2, relation: 'broader' }]);

    // The other side: linked from C2 (no swap needed), unlinked from C2.
    await applyCommitted(db.pool, [cev(C2, 'concept.linked', { otherId: C1, relation: 'related' })]);
    expect(await linkRows(C1, C2)).toEqual([
      { a: C1, b: C2, relation: 'broader' },
      { a: C2, b: C1, relation: 'related' },
    ]);
    await applyCommitted(db.pool, [cev(C2, 'concept.unlinked', { otherId: C1, relation: 'related' })]);
    expect(await linkRows(C1, C2)).toEqual([{ a: C1, b: C2, relation: 'broader' }]);
  });
});

describe('27.446 merge', () => {
  it('27.446 C1 into C2: tags move without duplicates, C1’s links go, C1 is deleted and merged_into C2; C3 is untouched', async () => {
    const [C1, C2, C3] = [newUlid(), newUlid(), newUlid()];
    await applyCommitted(db.pool, [
      cev(C1, 'concept.created', { name: 'Merged' }),
      cev(C2, 'concept.created', { name: 'Kept' }),
      cev(C3, 'concept.created', { name: 'Third' }),
      cev(C1, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TP }),
      cev(C1, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TE }, 'author', 'mcp'),
      cev(C2, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TP }),
      cev(C1, 'concept.linked', { otherId: C3, relation: 'related' }),
    ]);
    // Something for "no links" to remove.
    expect(await linkRows(C1)).toHaveLength(1);

    await applyCommitted(db.pool, [cev(C1, 'concept.merged', { intoId: C2 })]);

    const expected = [
      { workspace_id: world.WS, item_kind: 'ticket', item_id: world.TE, tagged_by: world.ids.author, origin: 'mcp' },
      { workspace_id: world.WS, item_kind: 'ticket', item_id: world.TP, tagged_by: world.ids.owner, origin: 'web' },
    ].sort((x, y) => x.item_id.localeCompare(y.item_id));
    expect(await itemRows(C2)).toEqual(expected);
    expect(await itemRows(C1)).toEqual([]);
    expect(await linkRows(C1)).toEqual([]);
    expect(await conceptRow(C1)).toMatchObject({ name: 'Merged', deleted: true, merged_into: C2 });
    expect(await conceptRow(C2)).toMatchObject({ name: 'Kept', deleted: false, merged_into: null });
    expect(await conceptRow(C3)).toMatchObject({ name: 'Third', deleted: false, merged_into: null });
  });
});

describe('27.452 trash keeps a tag, purge erases it, and a rebuild agrees', () => {
  it('27.452 TP and then nWorkspace are purged: each one’s row goes, the note row of the same concept stays, verify is clean', async () => {
    const C = newUlid();
    const { TP } = world;
    const { nProject, nWorkspace } = world.NOTES;
    await applyCommitted(db.pool, [
      cev(C, 'concept.created', { name: 'Purge' }),
      cev(C, 'concept.item_tagged', { itemKind: 'ticket', itemId: TP }),
      cev(C, 'concept.item_tagged', { itemKind: 'note', itemId: nProject }),
      cev(C, 'concept.item_tagged', { itemKind: 'note', itemId: nWorkspace }),
    ]);
    const ids = async () => (await itemRows(C)).map((row) => row.item_id).sort();
    expect(await ids()).toEqual([TP, nProject, nWorkspace].sort());

    await applyCommitted(db.pool, [onEntity('ticket', TP, 'ticket.deleted')]);
    expect(await ids()).toEqual([TP, nProject, nWorkspace].sort());
    await applyCommitted(db.pool, [onEntity('ticket', TP, 'ticket.restored')]);
    expect(await ids()).toEqual([TP, nProject, nWorkspace].sort());

    // The purge driver of `test/purge/purge-ticket-links.test.ts:49-50`: delete, mark, purge at the due time.
    await applyCommitted(db.pool, [onEntity('ticket', TP, 'ticket.deleted'), onEntity('ticket', TP, 'purge.marked')]);
    expect((await purgeItem(db.pool, { kind: 'ticket', id: TP }, purgeDeps(await dueAt(db.pool, 'ticket', TP)))).status).toBe('purged');
    // Control: the note rows of the SAME concept survive (a statement erasing whole concepts would take them).
    expect(await ids()).toEqual([nProject, nWorkspace].sort());

    // The guard below is only exercised if replay meets the tag naming TP: the concept stream still holds it.
    const tagged = async (itemId: string) =>
      (
        await db.pool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM events
            WHERE entity_kind = 'concept' AND entity_id = $1 AND type = 'concept.item_tagged' AND payload->>'itemId' = $2`,
          [C, itemId],
        )
      ).rows[0]?.n;
    expect(await tagged(TP)).toBe(1);
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });

    // A note purge (the note driver of `test/purge/purge-kinds.test.ts:40`): its row goes, nProject's stays.
    await applyCommitted(db.pool, [
      onEntity('note', nWorkspace, 'note.deleted', { workspaceSeq: await nextWorkspaceSeq() }),
      onEntity('note', nWorkspace, 'purge.marked'),
    ]);
    expect((await purgeItem(db.pool, { kind: 'note', id: nWorkspace }, purgeDeps(await dueAt(db.pool, 'note', nWorkspace)))).status).toBe('purged');
    expect(await ids()).toEqual([nProject]);
    expect(await tagged(nWorkspace)).toBe(1);
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});

describe('27.455 reset empties all three concept tables', () => {
  it('27.455 each table holds a row, then reset leaves none (rolled back)', async () => {
    const tables = ['proj_concepts', 'proj_concept_items', 'proj_concept_links'];
    const client = await db.pool.connect();
    try {
      const counts = async () =>
        Promise.all(tables.map(async (table) => (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]?.n));
      await client.query('BEGIN');
      for (const n of await counts()) expect(n).toBeGreaterThan(0);
      await projConcepts.reset(client);
      expect(await counts()).toEqual([0, 0, 0]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
