/**
 * Knowledge Graph spec D §3.1 under the planner's R1 ruling (2026-10-05): every concept row key is written and removed
 * by ONE stream, so `verifyProjections` — whose rebuild replays one concept's whole stream at a time (`readLedger`) —
 * agrees with live whichever concept sorts first. Cases 27.458–27.464 (`test-cases/27-knowledge-graph.md` §27.4).
 *
 * Every leg runs in a FRESH database: `verifyProjections` compares whole tables, so one leg's drift would red the next.
 * Where the order matters, a leg runs twice, once with each concept sorting first. The door legs post through the real
 * client ingest (`ingestClientBatch`, what `POST /v1/events` calls), one transaction per event; they seed first and
 * post after, because a post takes the ledger's next `workspace_seq` and `makeCommitted`'s counter never sees it.
 */
import { describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { makeEnvelope, newUlid, type LedgerEvent, type Ulid } from '@gisik-nokma/domain';
import { conceptMergeSteps, type ConceptMergeStep } from '../../src/concepts/merge.js';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { doc, ev, noteCreated, projectCreated, seedWorkspace, text, ticketCreated, type Base } from '../purge/world.js';

type World = Base & { db: TestDatabase; P: string };
type Step = Pick<ConceptMergeStep, 'entity' | 'type'> & { payload: Record<string, unknown> };

/** A workspace with one project, in a database of its own, dropped afterwards. */
async function inFreshWorld(run: (w: World) => Promise<void>): Promise<void> {
  const db = await createTestDatabase();
  try {
    const base = await seedWorkspace(db.pool);
    const P = newUlid();
    await applyCommitted(db.pool, [projectCreated(base, P, 'Concepts', 'CN')]);
    await run({ ...base, db, P });
  } finally {
    await db.drop();
  }
}

/** Two fresh ids, the lower first. */
function pair(): [string, string] {
  const [x, y] = [newUlid(), newUlid()].sort();
  return [x!, y!];
}

const step = (conceptId: string, type: string, payload: Record<string, unknown>): Step => ({
  entity: { kind: 'concept', id: conceptId },
  type: type as Step['type'],
  payload,
});

/** Seeds steps directly (no door), as `applyCommitted` does live. */
async function seed(w: World, steps: Step[], actorId: string = w.OWNER, origin: LedgerEvent['origin'] = 'web'): Promise<void> {
  await applyCommitted(
    w.db.pool,
    steps.map((s) => makeCommitted({ workspaceId: w.WS, actorId, entity: s.entity, type: s.type, payload: s.payload, origin })),
  );
}

/** Posts steps by the owner through the client door, in order; each answer is `committed` or `refused <rule>: <reason>`. */
async function post(w: World, steps: Array<Step | LedgerEvent>): Promise<string[]> {
  const ingest = createIngestService({ pool: w.db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
  const envelopes = steps.map((s) =>
    makeEnvelope({ type: s.type, payload: s.payload, entity: s.entity, workspaceId: w.WS, actorId: w.OWNER, origin: 'mcp' }),
  );
  const results = (await ingest.ingestClientBatch(envelopes, w.OWNER)) as Array<{ status: string; rule?: string; reason?: string }>;
  return results.map((r) => (r.status === 'refused' ? `refused ${r.rule}: ${r.reason}` : r.status));
}

async function links(w: World): Promise<Array<{ a: string; b: string; relation: string }>> {
  return (await w.db.pool.query('SELECT a, b, relation FROM proj_concept_links ORDER BY a, b, relation')).rows;
}

type ItemRow = { item_id: string; tagged_by: string; origin: string };
const byItemId = (x: ItemRow, y: ItemRow) => (x.item_id < y.item_id ? -1 : 1);

/** Sorted here, not in SQL, so an expected list sorts the same way. */
async function items(w: World, conceptId: string): Promise<ItemRow[]> {
  const { rows } = await w.db.pool.query<ItemRow>('SELECT item_id, tagged_by, origin FROM proj_concept_items WHERE concept_id = $1', [conceptId]);
  return rows.sort(byItemId);
}

async function concept(w: World, conceptId: string): Promise<{ deleted: boolean; merged_into: string | null } | undefined> {
  return (await w.db.pool.query('SELECT deleted, merged_into FROM proj_concepts WHERE concept_id = $1', [conceptId])).rows[0];
}

/** Rebuilt from the ledger, every projection equals live. */
async function expectRebuildAgrees(w: World, leg: string): Promise<void> {
  const verdict = await verifyProjections({ pool: w.db.pool, projections: buildProjectionRegistry() });
  expect(verdict, leg).toEqual({ clean: true, diffs: [] });
}

/** Creates the concepts; and live tickets, one per id. */
async function concepts(w: World, ...ids: string[]): Promise<void> {
  await seed(w, ids.map((id, i) => step(id, 'concept.created', { name: `Concept ${i}` })));
}
async function tickets(w: World, ...ids: string[]): Promise<void> {
  await applyCommitted(w.db.pool, ids.map((id, i) => ticketCreated(w, id, w.P, `Ticket ${i}`)));
}

const tag = (conceptId: string, itemId: string, itemKind = 'ticket') => step(conceptId, 'concept.item_tagged', { itemKind, itemId });

describe('27.458 a link to a concept deleted or merged later goes, live and rebuilt', () => {
  it('27.458 written on the other concept’s stream, with either concept sorting first; controls: a link between two live concepts stays, and one whose writer is deleted goes', async () => {
    // [the writer, what happens to the other end]: the writer's link names the target, and the target goes after it.
    // With the writer = hi, replay meets the link AFTER the target's delete (lo's stream first): the case that drifted.
    const legs: Array<['lo' | 'hi', 'deleted' | 'merged' | 'stays']> = [
      ['hi', 'deleted'],
      ['lo', 'deleted'],
      ['hi', 'merged'],
      ['lo', 'merged'],
      ['hi', 'stays'], // control: nothing deleted, the link stays live and rebuilt
    ];
    for (const [who, fate] of legs) {
      const leg = `${who} links, the other is ${fate}`;
      await inFreshWorld(async (w) => {
        const [lo, hi] = pair(); // fresh per database: makeCommitted's per-entity seq counter is process-wide
        const [writer, target] = who === 'hi' ? [hi, lo] : [lo, hi];
        await concepts(w, lo, hi);
        await seed(w, [step(writer, 'concept.linked', { otherId: target, relation: 'broader' })]);
        if (fate === 'deleted') await seed(w, [step(target, 'concept.deleted', {})]);
        if (fate === 'merged') await seed(w, [step(target, 'concept.merged', { intoId: writer })]);
        expect(await links(w), leg).toEqual(fate === 'stays' ? [{ a: writer, b: target, relation: 'broader' }] : []);
        await expectRebuildAgrees(w, leg);
      });
    }
    // Control: the writer itself deleted (its own stream, related from the lower id): its row goes too.
    await inFreshWorld(async (w) => {
      const [lo, hi] = pair();
      await concepts(w, lo, hi);
      await seed(w, [step(lo, 'concept.linked', { otherId: hi, relation: 'related' }), step(lo, 'concept.deleted', {})]);
      expect(await links(w)).toEqual([]);
      await expectRebuildAgrees(w, 'writer deleted');
    });
  });
});

const RELATED_STREAM = 'refused concept.related-stream: A related link is posted on the concept with the lower id.';

describe('27.459 a related link is posted and removed on the lower id’s stream only', () => {
  it('27.459 the higher id’s related link and unlink are refused; the lower id’s link, unlink and re-link commit and a rebuild agrees; control: broader from the higher id commits', async () => {
    await inFreshWorld(async (w) => {
      const [lo, hi] = pair();
      await concepts(w, lo, hi);
      const related = (from: string, to: string, type = 'concept.linked') => step(from, type, { otherId: to, relation: 'related' });
      expect(
        await post(w, [
          related(hi, lo),
          related(lo, hi),
          related(hi, lo, 'concept.unlinked'),
          related(lo, hi, 'concept.unlinked'),
          related(lo, hi),
          step(hi, 'concept.linked', { otherId: lo, relation: 'broader' }),
        ]),
      ).toEqual([RELATED_STREAM, 'committed', RELATED_STREAM, 'committed', 'committed', 'committed']);
      const rows = (await links(w)).sort((x, y) => (x.a < y.a ? -1 : 1));
      expect(rows).toEqual([
        { a: lo, b: hi, relation: 'related' },
        { a: hi, b: lo, relation: 'broader' },
      ]);
      await expectRebuildAgrees(w, 'related');
    });
  });
});

describe('27.460 the merge target untags an item it got from the merge', () => {
  it('27.460 C’s tag reaches D as D’s own event, so D’s untag holds after a rebuild, whichever sorts first', async () => {
    for (const cFirst of [true, false]) {
      await inFreshWorld(async (w) => {
        const [lo, hi] = pair();
        const [C, D] = cFirst ? [lo, hi] : [hi, lo];
        const TP = newUlid();
        await tickets(w, TP);
        await concepts(w, C, D);
        await seed(w, [tag(C, TP)]);
        await seed(w, await conceptMergeSteps(w.db.pool, w.WS, C, D));
        expect(await items(w, D), 'merged').toHaveLength(1);
        await seed(w, [step(D, 'concept.item_untagged', { itemKind: 'ticket', itemId: TP })]);
        expect(await items(w, D)).toEqual([]);
        expect(await items(w, C)).toEqual([]);
        expect(await concept(w, C)).toEqual({ deleted: true, merged_into: D });
        await expectRebuildAgrees(w, `C first: ${cFirst}`);
      });
    }
  });
});

describe('27.461 a merge chain C → D → E', () => {
  it('27.461 C’s item ends on E, tagged there by the merging actor, whichever sorts first', async () => {
    // D first is the order a copying merge got wrong (D's merge into E replayed before C's into D).
    for (const dFirst of [true, false]) {
      await inFreshWorld(async (w) => {
        const [x, y, z] = [newUlid(), newUlid(), newUlid()].sort() as [Ulid, Ulid, Ulid];
        const [C, D, E] = dFirst ? [z, x, y] : [x, y, z];
        const TP = newUlid();
        const [mergerOne, mergerTwo] = [newUlid(), newUlid()];
        await tickets(w, TP);
        await concepts(w, C, D, E);
        await seed(w, [tag(C, TP)]);
        await seed(w, await conceptMergeSteps(w.db.pool, w.WS, C, D), mergerOne, 'mcp');
        await seed(w, await conceptMergeSteps(w.db.pool, w.WS, D, E), mergerTwo, 'web');
        expect(await items(w, E)).toEqual([{ item_id: TP, tagged_by: mergerTwo, origin: 'web' }]);
        expect([...(await items(w, C)), ...(await items(w, D))]).toEqual([]);
        expect(await concept(w, D)).toEqual({ deleted: true, merged_into: E });
        await expectRebuildAgrees(w, `D first: ${dFirst}`);
      });
    }
  });
});

describe('27.462 both concepts hold the item when they merge', () => {
  it('27.462 D keeps its own tag (its tagger and origin), the item C alone held is tagged by the merging actor, whichever sorts first', async () => {
    for (const cFirst of [true, false]) {
      await inFreshWorld(async (w) => {
        const [lo, hi] = pair();
        const [C, D] = cFirst ? [lo, hi] : [hi, lo];
        const [TP, TE] = [newUlid(), newUlid()];
        const [dTagger, cTagger, merger] = [newUlid(), newUlid(), newUlid()];
        await tickets(w, TP, TE);
        await concepts(w, C, D);
        await seed(w, [tag(D, TP)], dTagger, 'web');
        await seed(w, [tag(C, TP), tag(C, TE)], cTagger, 'mobile');
        const steps = await conceptMergeSteps(w.db.pool, w.WS, C, D);
        expect(steps.map((s) => [s.entity.id, s.type])).toEqual([
          [D, 'concept.item_tagged'],
          [C, 'concept.merged'],
        ]);
        await seed(w, steps, merger, 'mcp');
        expect(await items(w, D)).toEqual(
          [
            { item_id: TP, tagged_by: dTagger, origin: 'web' },
            { item_id: TE, tagged_by: merger, origin: 'mcp' },
          ].sort(byItemId),
        );
        await expectRebuildAgrees(w, `C first: ${cFirst}`);
      });
    }
  });
});

const incomplete = (sentence: string) => `refused concept.merge-incomplete: ${sentence}`;

describe('27.463 a merge is refused while the merged concept holds a live item the target lacks', () => {
  it('27.463 counted over live items only; a partial sequence leaves a legal state and a retry completes it; rebuilt equal each time', async () => {
    await inFreshWorld(async (w) => {
      const [C, D] = pair();
      const [TP, TE, TT, N, nDel] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
      await tickets(w, TP, TE, TT);
      const note = (id: string) =>
        noteCreated(w, id, { title: 'A note', homeProjectId: '', scope: { mode: 'private' }, body: doc(text('a note')) });
      await applyCommitted(w.db.pool, [note(N), note(nDel), ev(w, 'note', nDel, 'note.deleted', {}), ev(w, 'ticket', TT, 'ticket.deleted', {})]);
      await concepts(w, C, D);
      await seed(w, [tag(C, TP), tag(C, TE), tag(C, TT), tag(C, N, 'note'), tag(C, nDel, 'note'), tag(D, TP)]);

      // The merge alone: TE and N are missing from D. TP is on D already, TT is in the trash and nDel is deleted.
      const merged = step(C, 'concept.merged', { intoId: D });
      expect(await post(w, [merged])).toEqual([
        incomplete('2 items in this concept are not yet in the concept it merges into. Add them there first.'),
      ]);

      // The sequence, with TE's tag lost on the way: N's tag commits, the merge is refused, nothing is half-merged.
      const steps = await conceptMergeSteps(w.db.pool, w.WS, C, D);
      expect(steps).toEqual([tag(D, N, 'note'), tag(D, TE), merged]);
      expect(await post(w, [steps[0]!, steps[2]!])).toEqual([
        'committed',
        incomplete('One item in this concept is not yet in the concept it merges into. Add it there first.'),
      ]);
      expect((await items(w, D)).map((i) => i.item_id).sort()).toEqual([N, TP].sort());
      expect(await items(w, C)).toHaveLength(5);
      expect(await concept(w, C)).toEqual({ deleted: false, merged_into: null });
      await expectRebuildAgrees(w, 'partial');

      // The retry asks again and completes.
      const retry = await conceptMergeSteps(w.db.pool, w.WS, C, D);
      expect(retry).toEqual([tag(D, TE), merged]);
      expect(await post(w, retry)).toEqual(['committed', 'committed']);
      expect((await items(w, D)).map((i) => i.item_id).sort()).toEqual([N, TE, TP].sort());
      expect(await items(w, C)).toEqual([]);
      expect(await concept(w, C)).toEqual({ deleted: true, merged_into: D });
      await expectRebuildAgrees(w, 'retried');
    });
  });
});

describe('27.464 an item in the trash when its concept is merged keeps no concept', () => {
  it('27.464 trash TT, merge C into D, restore TT: TT is in neither concept (accepted); control: TP, live at the merge, is on D', async () => {
    await inFreshWorld(async (w) => {
      const [C, D] = pair();
      const [TP, TT] = [newUlid(), newUlid()];
      await tickets(w, TP, TT);
      await concepts(w, C, D);
      await seed(w, [tag(C, TP), tag(C, TT)]);
      const onTicket = (type: string) => ev(w, 'ticket', TT, type, {});

      expect(await post(w, [onTicket('ticket.deleted')])).toEqual(['committed']);
      const steps = await conceptMergeSteps(w.db.pool, w.WS, C, D);
      expect(steps).toEqual([tag(D, TP), step(C, 'concept.merged', { intoId: D })]);
      expect(await post(w, steps)).toEqual(['committed', 'committed']);
      expect(await post(w, [onTicket('ticket.restored')])).toEqual(['committed']);

      const tt = await w.db.pool.query('SELECT concept_id FROM proj_concept_items WHERE item_id = $1', [TT]);
      expect(tt.rows).toEqual([]);
      expect((await items(w, D)).map((i) => i.item_id)).toEqual([TP]);
      await expectRebuildAgrees(w, 'trash');
    });
  });
});
