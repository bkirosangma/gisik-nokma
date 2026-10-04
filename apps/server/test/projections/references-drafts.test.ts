import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { backfillReferences } from '../../src/projections/backfill-references.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { rebuildProjection } from '../../src/projections/rebuild.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { doc, projectCreated, seedWorkspace, text, ticketRef, TYPE_ID } from '../purge/world.js';

/**
 * Drafts T3, errata E1 (owner ruling 2026-10-04: a draft leaves no trace outside its author's view until
 * publish). `proj_references` indexes the BODIES of `ticket.created` and `ticket.field_set`; without a draft
 * arm, a draft's description that mentions another ticket gives that ticket an incoming reference ("Linked
 * from", the graph's `ref` edge) and moves its count. Case 28.068.
 *
 * The events are applied in STAGES with an assertion after each, because the arms cover for each other: a
 * creation that indexed would be wiped by the draft `field_set` after it (both delete the source's rows
 * first), so only a check between the two can tell the creation arm is live.
 */

let db: TestDatabase;
let WS = '';
let AUTHOR = '';
const PID = newUlid();
beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
  const base = await seedWorkspace(db.pool);
  WS = base.WS;
  AUTHOR = base.OWNER;
  await applyCommitted(db.pool, [projectCreated(base, PID, 'Drafted refs', 'DR')]);
}, 60_000);
afterAll(async () => {
  await db.drop();
});

const mentions = (ticketId: string) => doc(text('see '), ticketRef(ticketId, PID, 'DR-1', 'Target'));
const ev = (id: string, type: string, payload: unknown): LedgerEvent =>
  makeCommitted({ workspaceId: WS, actorId: AUTHOR, entity: { kind: 'ticket', id }, type, payload });
const created = (id: string, extra: Record<string, unknown> = {}): LedgerEvent =>
  ev(id, 'ticket.created', { typeId: TYPE_ID, projectId: PID, parentId: null, title: `t-${id}`, ...extra });
const description = (id: string, value: unknown): LedgerEvent => ev(id, 'ticket.field_set', { fieldId: 'description', value });

type Row = { source_parent_id: string; target_id: string; updated_by: string; updated_at: Date; seq: string };
/** The rows a ticket is the SOURCE of (its description and its comments). */
const from = async (ticketId: string): Promise<Row[]> =>
  (await db.pool.query<Row>(
    'SELECT source_parent_id, target_id, updated_by, updated_at, seq::text FROM proj_references WHERE source_parent_id = $1 ORDER BY target_id',
    [ticketId],
  )).rows;
/** "Linked from" of a target: how many sources point at it, and from which parents. */
const linkedFrom = async (targetId: string): Promise<string[]> =>
  (await db.pool.query<{ source_parent_id: string }>(
    "SELECT source_parent_id FROM proj_references WHERE target_kind = 'ticket' AND target_id = $1 ORDER BY source_parent_id",
    [targetId],
  )).rows.map((row) => row.source_parent_id);
const everyRow = async (): Promise<unknown[]> =>
  (await db.pool.query('SELECT * FROM proj_references ORDER BY source_kind, source_id, ordinal')).rows;

describe('28.068 the reference index skips a draft (errata E1)', () => {
  it('a draft mentioning a ticket leaves it no Linked-from row or count; control: the same body published does; publish indexes the then-current body as the publish; discard leaves none; rebuild and backfill agree', async () => {
    const [target, other, plain, draft, discarded] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
    await applyCommitted(db.pool, [created(target), created(other)]);

    // 1. A DRAFT whose description, at creation, mentions `target`: no row, so `target` has no Linked from.
    await applyCommitted(db.pool, [created(draft, { start: 'backlog', draft: true, description: mentions(target) })]);
    expect(await from(draft)).toEqual([]);
    expect(await linkedFrom(target)).toEqual([]);
    //    ... and a description EDIT while it is a draft (now mentioning `other`) writes none either.
    await applyCommitted(db.pool, [description(draft, mentions(other))]);
    expect(await from(draft)).toEqual([]);
    expect(await linkedFrom(other)).toEqual([]);

    // 2. CONTROL, same `it`: the SAME body on a ticket that is not a draft writes the row.
    await applyCommitted(db.pool, [created(plain, { description: mentions(target) })]);
    expect(await linkedFrom(target)).toEqual([plain]);

    // 3. The publish indexes the THEN-CURRENT description (the edit's `other`, not the creation's `target`),
    //    attributed to the publish itself: its actor, its time, its workspace seq.
    const publish = ev(draft, 'ticket.published', { projectId: PID });
    await applyCommitted(db.pool, [publish]);
    expect(await from(draft)).toEqual([
      { source_parent_id: draft, target_id: other, updated_by: publish.actorId, updated_at: new Date(publish.serverTime), seq: String(publish.workspaceSeq) },
    ]);
    expect(await linkedFrom(target)).toEqual([plain]);
    //    After the publish the ticket is an ordinary ticket: an edit indexes as usual (no "ever a draft" skip).
    const edit = description(draft, mentions(target));
    await applyCommitted(db.pool, [edit]);
    expect((await from(draft)).map((row) => [row.target_id, row.seq])).toEqual([[target, String(edit.workspaceSeq)]]);
    expect(await linkedFrom(target)).toEqual([draft, plain].sort());

    // 4. A discarded draft leaves nothing: it never wrote a row, and the discard writes none.
    await applyCommitted(db.pool, [
      created(discarded, { start: 'backlog', draft: true, description: mentions(other) }),
      description(discarded, mentions(target)),
      ev(discarded, 'ticket.discarded', {}),
    ]);
    expect(await from(discarded)).toEqual([]);
    expect(await linkedFrom(target)).toEqual([draft, plain].sort());
    expect(await linkedFrom(other)).toEqual([]);

    // 5. The other two paths that write this table give exactly the live rows: the rebuild (whole ledger,
    //    against today's sibling tables) and the boot backfill (entity by entity), after a truncate.
    const live = await everyRow();
    expect(live.length).toBe(2);
    const projections = buildProjectionRegistry();
    await rebuildProjection('proj_references', { pool: db.pool, projections });
    expect(await everyRow()).toEqual(live);
    await db.pool.query('TRUNCATE proj_references');
    await db.pool.query('DELETE FROM projection_backfills');
    expect((await backfillReferences(db.pool, { projections })).ran).toBe(true);
    expect(await everyRow()).toEqual(live);
    expect(await verifyProjections({ pool: db.pool, projections })).toEqual({ clean: true, diffs: [] });
  });
});
