import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyNoteEvent, newUlid, type NoteState } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { getNoteStateFromDb } from '../../src/projections/notes.js';
import { rebuildProjection } from '../../src/projections/rebuild.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  // BEFORE any ledger write in this file, and exactly once: `applyCommitted`
  // mints seqs from a PROCESS-LOCAL map and says so ("one fresh database per
  // file, or pass explicit seqs"), so a second reset re-mints the colliding 1.
  resetEntitySeqs();
});
afterAll(async () => {
  await db.drop();
});

/**
 * ## Why there is no `beforeEach` here, and why nothing is truncated
 *
 * The plan text's `beforeEach` truncates `events` along with the projections.
 * That cannot run: `events` is APPEND-ONLY BY TRIGGER, and the refusal is
 * pinned deliberately (`test/migrations.test.ts:171` asserts `TRUNCATE events`
 * rejects). No test in this repo truncates it.
 *
 * So this file follows the discipline every other projection/read test uses —
 * one fresh database, one ledger, no truncation — and pays for it the way
 * `projections/search.test.ts` does: **the fixture is PER CASE.** Each case
 * mints its own note and its own ticket ids, so no case can read another's
 * rows, and 18.015's whole-table verifier claim stays true because every write
 * in this file goes through `applyCommitted`, which applies every registered
 * projection in the same transaction as the event.
 *
 * The ORDER of the cases is therefore part of the fixture, and 18.015 comes
 * first on purpose: it is the case that asserts the WHOLE table matches a
 * rebuild from the ledger, so it must not sit after a case that deliberately
 * leaves a projection out of step. A reordering that moves it later changes
 * what it asserts — say so in the case, do not silently shuffle.
 */
const WS = newUlid();
const ACTOR = newUlid();

/** A note entity id and the ticket ids its events name, minted per case. */
function fixture(): { NOTE: string; T1: string; T2: string; note: (type: string, payload: unknown) => unknown } {
  const NOTE = newUlid();
  const T1 = newUlid();
  const T2 = newUlid();
  return {
    NOTE,
    T1,
    T2,
    note: (type: string, payload: unknown) =>
      makeCommitted({ workspaceId: WS, entity: { kind: 'note', id: NOTE }, type, payload, actorId: ACTOR }),
  };
}

/**
 * Spec §3.4's first worked example, and the reason it is the projection's
 * fixture: it is the ONLY sequence in the spec that exercises all three of the
 * things a naive table gets wrong. The scope moves `project` → `inherit` →
 * `project`, so a row written from the PAYLOAD rather than from the reducer's
 * state ends up on `inherit`; the attachment list grows to two and shrinks to
 * none, so an attachment table that only inserts ends with two rows; and the
 * memory `pre_inherit_mode` is SET and then CLEARED, so a row that never clears
 * it holds a value the state does not have.
 */
const EXAMPLE_1 = (note: (type: string, payload: unknown) => unknown, T1: string, T2: string) => [
  note('note.created', { title: 'Cold room', homeProjectId: 'P1', scope: { mode: 'project' } }),
  note('note.attached', { ticketId: T1 }),
  note('note.scope_set', { mode: 'inherit' }),
  note('note.attached', { ticketId: T2 }),
  note('note.detached', { ticketId: T1 }),
  note('note.detached', { ticketId: T2 }),
] as Parameters<typeof applyCommitted>[1];

describe('18.015 proj_notes', () => {
  it('18.015 folds the example-1 sequence and verifies clean', async () => {
    const { NOTE, T1, T2, note } = fixture();
    const events = EXAMPLE_1(note, T1, T2) as ReturnType<typeof makeCommitted>[];
    await applyCommitted(db.pool, events.slice(0, 4));
    let att = await db.pool.query('SELECT ticket_id FROM proj_note_attachments WHERE note_id = $1 ORDER BY ticket_id', [
      NOTE,
    ]);
    expect(att.rows.map((r) => r.ticket_id).sort()).toEqual([T1, T2].sort());
    await applyCommitted(db.pool, events.slice(4));
    const row = (
      await db.pool.query('SELECT scope_mode, pre_inherit_mode FROM proj_notes WHERE note_id = $1', [NOTE])
    ).rows[0];
    expect(row).toEqual({ scope_mode: 'project', pre_inherit_mode: null });
    att = await db.pool.query('SELECT ticket_id FROM proj_note_attachments WHERE note_id = $1', [NOTE]);
    expect(att.rowCount).toBe(0);
    const projections = buildProjectionRegistry();
    expect(await verifyProjections({ pool: db.pool, projections })).toEqual({ clean: true, diffs: [] });
  });

  it('18.016 rebuild reproduces the rows', async () => {
    const { T1, T2, note } = fixture();
    await applyCommitted(db.pool, EXAMPLE_1(note, T1, T2) as ReturnType<typeof makeCommitted>[]);
    const before = (await db.pool.query('SELECT * FROM proj_notes ORDER BY note_id')).rows;
    const projections = buildProjectionRegistry();
    await rebuildProjection('proj_notes', { pool: db.pool, projections });
    const after = (await db.pool.query('SELECT * FROM proj_notes ORDER BY note_id')).rows;
    expect(after).toEqual(before);
  });

  it('18.018 schema_version comes from the body', async () => {
    const { NOTE, note } = fixture();
    await applyCommitted(db.pool, [
      note('note.created', {
        title: 'v',
        homeProjectId: '',
        scope: { mode: 'private' },
        body: { type: 'doc', attrs: { schemaVersion: 7 }, content: [] },
      }),
    ] as ReturnType<typeof makeCommitted>[]);
    const row = (await db.pool.query('SELECT schema_version FROM proj_notes WHERE note_id = $1', [NOTE])).rows[0];
    expect(row.schema_version).toBe(7);
  });

  it('18.019 getNoteStateFromDb round-trips the reducer state', async () => {
    const { NOTE, T1, T2, note } = fixture();
    const events = (EXAMPLE_1(note, T1, T2) as ReturnType<typeof makeCommitted>[]).slice(0, 3);
    await applyCommitted(db.pool, events);
    let expected: NoteState | null = null;
    for (const e of events) expected = applyNoteEvent(expected, e);
    expect(await getNoteStateFromDb(db.pool, NOTE)).toEqual(expected);
  });
});

describe('18.017 comment.added on a note', () => {
  it('18.017 lands in proj_note_comments; a ticket comment stays in proj_ticket_comments (control)', async () => {
    const { NOTE, note } = fixture();
    const c = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'note', id: NOTE },
      type: 'comment.added',
      payload: { body: { type: 'doc' } },
      actorId: ACTOR,
    });
    await applyCommitted(db.pool, [
      note('note.created', { title: 'n', homeProjectId: '', scope: { mode: 'private' } }),
      c,
    ] as ReturnType<typeof makeCommitted>[]);
    const rows = (await db.pool.query('SELECT comment_id, note_id FROM proj_note_comments WHERE note_id = $1', [NOTE]))
      .rows;
    expect(rows).toEqual([{ comment_id: c.id, note_id: NOTE }]);
    expect((await db.pool.query('SELECT count(*)::int AS n FROM proj_ticket_comments')).rows[0].n).toBe(0);
  });
});
