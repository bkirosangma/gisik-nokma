import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { meaningNoteSearch } from '../../src/read/note-search.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';

/**
 * Where meaning search over notes makes its cut (cases 18.496–18.497).
 *
 * ## Why a database of its own, and an empty chunk table per case
 *
 * The counts here are exact: 18.496's control is "200 chunked notes", and one
 * leftover chunk from another case would turn it into 201 and make the control
 * fail on the very code it is meant to be green on. `seedNotesFixture` seeds no
 * chunks, and each case deletes the workspace's chunks before it seeds its own
 * (a note with no chunk is no meaning candidate), so neither case sees the
 * other's whatever order they run in.
 *
 * ## Why the ids are made first and sorted
 *
 * `newUlid()` is not monotonic inside one millisecond, so "created last" is not
 * "highest id". The cut under test is an id-order cut, so the ids are drawn up
 * front, sorted, and the note that must survive it is given the highest.
 *
 * Every chunk is placed at an explicit angle in the plane of the first two
 * components; the query sits at angle 0, so a chunk's cosine distance is
 * `1 - cos(angle)` and "nearest" is decided by the test.
 */
const QUERY = 'where does the meaning cut fall';

function vectorAt(angle: number): Float32Array {
  const vector = new Float32Array(512);
  vector[0] = Math.cos(angle);
  vector[1] = Math.sin(angle);
  return vector;
}

const embedAtZero = async (): Promise<Float32Array> => vectorAt(0);

function sortedIds(count: number): string[] {
  return Array.from({ length: count }, () => newUlid() as string).sort();
}

async function effFor(db: TestDatabase, fixture: NotesFixture) {
  const eff = await resolveEffectiveRole(db.pool, fixture.ids.author, fixture.WS);
  if (eff.workspaceRole === null) throw new Error('fixture author is not a member of the workspace');
  return eff;
}

async function makeNotes(db: TestDatabase, fixture: NotesFixture, ids: readonly string[]): Promise<void> {
  await applyCommitted(
    db.pool,
    ids.map(
      (id, index): LedgerEvent =>
        makeCommitted({
          workspaceId: fixture.WS,
          actorId: fixture.ids.author,
          entity: { kind: 'note', id },
          type: 'note.created',
          payload: { title: `Cut note ${index}`, homeProjectId: fixture.P, scope: { mode: 'workspace' } },
        }),
    ),
  );
}

async function seedChunkAt(db: TestDatabase, fixture: NotesFixture, noteId: string, angle: number): Promise<void> {
  await db.pool.query(
    `INSERT INTO search_note_chunks
       (note_id, chunk_index, workspace_id, heading_path, chunk_text, model, source_seq, embedding)
     VALUES ($1, 0, $2, '', $3, 'cut-test@1', 0, $4)`,
    [noteId, fixture.WS, `chunk of ${noteId}`, `[${Array.from(vectorAt(angle)).join(',')}]`],
  );
}

describe('18.496–18.497 where meaning search over notes cuts', () => {
  let db: TestDatabase;
  let fixture: NotesFixture;
  beforeAll(async () => {
    db = await createTestDatabase();
    fixture = await seedNotesFixture(db.pool);
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(async () => {
    await db.pool.query('DELETE FROM search_note_chunks WHERE workspace_id = $1', [fixture.WS]);
  });


  /**
   * 18.496 — the newest note is the nearest, and 204 older notes are far.
   *
   * A candidate cut taken in `note_id` order (the oldest 200) never sees it.
   * Control, same `it`: with 199 far notes chunked it is the 200th candidate and
   * is found — so the fixture places it nearest, and what the second assertion
   * measures is the cut.
   *
   * Kill: the inner `ORDER BY c.note_id … LIMIT 200` put back.
   */
  it('18.496 — the nearest note is first even when 200 older notes have chunks', async () => {
    const ids = sortedIds(205);
    const near = ids[204]!;
    const far = ids.slice(0, 204);
    await makeNotes(db, fixture, ids);
    const eff = await effFor(db, fixture);

    for (const id of far.slice(0, 199)) await seedChunkAt(db, fixture, id, Math.PI);
    await seedChunkAt(db, fixture, near, 0.01);
    const control = await meaningNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, QUERY, { embed: embedAtZero });
    expect(control[0]?.noteId, 'control: 200 chunked notes, the near one is found and first').toBe(near);

    for (const id of far.slice(199)) await seedChunkAt(db, fixture, id, Math.PI);
    const hits = await meaningNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, QUERY, { embed: embedAtZero });
    expect(hits[0]?.noteId, '205 chunked notes, the near one has the highest id').toBe(near);
  }, 60_000);

  /**
   * 18.497 — 25 notes at known distances; ranks 19 and 20 (0-based) are at the
   * SAME distance, straddling the cut, so the tie-break decides both the order
   * and which of the two is returned.
   *
   * Rank r goes to sorted id `(r * 7) % 25`, so id order and distance order
   * disagree (7 is coprime with 25: a permutation). The tied pair are ids 8 and
   * 15; `note_id` breaks the tie, so id 8 is 20th and id 15 is not returned.
   *
   * Kills: outer `ORDER BY d.distance DESC`; the `d.note_id` tie-break dropped;
   * outer `LIMIT` 21 or 19.
   */
  it('18.497 — exactly the 20 nearest come back, nearest first, note_id breaking the tie', async () => {
    const ids = sortedIds(25);
    await makeNotes(db, fixture, ids);
    const eff = await effFor(db, fixture);

    const byRank = Array.from({ length: 25 }, (_, rank) => ids[(rank * 7) % 25]!);
    const angleOf = (rank: number) => 0.05 * ((rank === 20 ? 19 : rank) + 1);
    for (let rank = 0; rank < 25; rank += 1) await seedChunkAt(db, fixture, byRank[rank]!, angleOf(rank));

    const hits = await meaningNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, QUERY, { embed: embedAtZero });
    expect(byRank[19]! < byRank[20]!, 'fixture: the tied pair is ordered by id as ranked').toBe(true);
    expect(hits.map((hit) => hit.noteId)).toEqual(byRank.slice(0, 20));
  }, 60_000);
});
