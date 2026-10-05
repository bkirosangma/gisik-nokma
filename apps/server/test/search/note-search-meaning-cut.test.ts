import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { meaningNoteSearch } from '../../src/read/note-search.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { seedNotesFixture, type NotesFixture, type NotesUser } from '../helpers/notes-fixture.js';
import { seedNeighbourWorkspace } from '../helpers/read-app.js';

/**
 * Where meaning search over notes makes its cut, which chunk speaks for a note,
 * and what a hit carries (cases 18.496–18.499).
 *
 * ## Why a database of its own, and an empty chunk table per case
 *
 * The counts here are exact: 18.496's control is "200 chunked notes", and one
 * leftover chunk from another case would turn it into 201 and make the control
 * fail on the very code it is meant to be green on. `seedNotesFixture` seeds no
 * chunks, and each case empties the whole chunk table before it seeds its own
 * (a note with no chunk is no meaning candidate; the table is this file's, and
 * 18.498 seeds a chunk in ANOTHER workspace), so no case sees another's
 * whatever order they run in.
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

async function effFor(db: TestDatabase, fixture: NotesFixture, user: NotesUser = 'author') {
  const eff = await resolveEffectiveRole(db.pool, fixture.ids[user], fixture.WS);
  if (eff.workspaceRole === null) throw new Error(`fixture ${user} is not a member of the workspace`);
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

async function seedChunkAt(
  db: TestDatabase,
  workspaceId: string,
  noteId: string,
  angle: number,
  chunk: { index?: number; text?: string } = {},
): Promise<void> {
  await db.pool.query(
    `INSERT INTO search_note_chunks
       (note_id, chunk_index, workspace_id, heading_path, chunk_text, model, source_seq, embedding)
     VALUES ($1, $2, $3, '', $4, 'cut-test@1', 0, $5)`,
    [
      noteId,
      chunk.index ?? 0,
      workspaceId,
      chunk.text ?? `chunk of ${noteId}`,
      `[${Array.from(vectorAt(angle)).join(',')}]`,
    ],
  );
}

describe('18.496–18.499 where meaning search over notes cuts, and what a hit carries', () => {
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
    await db.pool.query('DELETE FROM search_note_chunks');
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

    for (const id of far.slice(0, 199)) await seedChunkAt(db, fixture.WS, id, Math.PI);
    await seedChunkAt(db, fixture.WS, near, 0.01);
    const control = await meaningNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, QUERY, { embed: embedAtZero });
    expect(control[0]?.noteId, 'control: 200 chunked notes, the near one is found and first').toBe(near);

    for (const id of far.slice(199)) await seedChunkAt(db, fixture.WS, id, Math.PI);
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
    for (let rank = 0; rank < 25; rank += 1) await seedChunkAt(db, fixture.WS, byRank[rank]!, angleOf(rank));

    const hits = await meaningNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, QUERY, { embed: embedAtZero });
    expect(byRank[19]! < byRank[20]!, 'fixture: the tied pair is ordered by id as ranked').toBe(true);
    expect(hits.map((hit) => hit.noteId)).toEqual(byRank.slice(0, 20));
  }, 60_000);

  /**
   * 18.498 — `c.workspace_id` is this query's only tenant boundary.
   *
   * `visibleNotesWhere` names no workspace: it is `TRUE` for an owner, and its
   * workspace-scope arm admits a workspace-scope note of ANY workspace for any
   * member. So a neighbour workspace's workspace-scope note, chunked nearer than
   * anything here, is kept out by the chunk table's workspace column alone.
   * Asked as a non-owner member (the workspace-scope arm) and as the owner
   * (`TRUE`).
   *
   * Control, same `it`, asserted first: this workspace's own workspace-scope
   * note, farther away, IS returned — the query reached a hit list the
   * neighbour note would have topped. Then the leg, then that it is first.
   *
   * Kill: `c.workspace_id = …` neutralised with `OR TRUE`.
   */
  it('18.498 — a nearer workspace-scope note of another workspace is never a hit, for a member or the owner', async () => {
    const neighbourOwner = newUlid();
    const neighbour = await seedNeighbourWorkspace(db.pool, neighbourOwner);
    const foreign = newUlid();
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: neighbour.workspaceId,
        actorId: neighbourOwner,
        entity: { kind: 'note', id: foreign },
        type: 'note.created',
        payload: { title: 'Next door note', homeProjectId: neighbour.projectId, scope: { mode: 'workspace' } },
      }),
    ]);
    const local = newUlid();
    await makeNotes(db, fixture, [local]);
    await seedChunkAt(db, neighbour.workspaceId, foreign, 0);
    await seedChunkAt(db, fixture.WS, local, 0.3);

    for (const user of ['memberIn', 'owner'] as const) {
      const eff = await effFor(db, fixture, user);
      const hits = await meaningNoteSearch(db.pool, eff, fixture.ids[user], fixture.WS, QUERY, { embed: embedAtZero });
      const ids = hits.map((hit) => hit.noteId);
      expect(ids, `control (${user}): this workspace's note is a hit`).toContain(local);
      expect(ids, `${user}: the neighbour workspace's note is not`).not.toContain(foreign);
      expect(ids[0], `${user}: so this workspace's note is first`).toBe(local);
    }
  }, 60_000);

  /**
   * 18.499 — a note is ranked and quoted by its NEAREST chunk.
   *
   * Note A has a far chunk at index 0 and a near one at index 1; note B one
   * chunk between them. The inner `DISTINCT ON` keeps the first row per note in
   * `distance` order, and the outer sort ranks by the distance it kept, so that
   * pick decides both the rank (A before B) and the snippet (the near chunk's
   * text). The far chunk is index 0 so a pick that ignored distance would take it.
   *
   * Kill: the inner `ORDER BY c.note_id, distance DESC`.
   */
  it('18.499 — a note with two chunks ranks and is quoted by the nearer one', async () => {
    const [a, b] = sortedIds(2) as [string, string];
    await makeNotes(db, fixture, [a, b]);
    await seedChunkAt(db, fixture.WS, a, 1.2, { index: 0, text: 'far chunk of A' });
    await seedChunkAt(db, fixture.WS, a, 0.05, { index: 1, text: 'near chunk of A' });
    await seedChunkAt(db, fixture.WS, b, 0.5);

    const hits = await meaningNoteSearch(db.pool, await effFor(db, fixture), fixture.ids.author, fixture.WS, QUERY, {
      embed: embedAtZero,
    });
    expect(hits.map((hit) => [hit.noteId, hit.snippet])).toEqual([
      [a, 'near chunk of A'],
      [b, `chunk of ${b}`],
    ]);
  }, 60_000);

  /**
   * 18.499, leg 2 — every hit carries the keys of its attached tickets the
   * reader can see, the FIRST hit included.
   *
   * Asked as the owner, who reads both of the fixture's tickets (`TE` is
   * explicit to a guest, so the author would not): `TP` is attached to the
   * nearest note, `TE` to the next. Control: the second hit carries `TE`'s key,
   * so the lookup ran over this answer and the two keys are distinct.
   *
   * Kill: the lookup handed `rows.slice(1)` instead of every row.
   */
  it('18.499 — the first meaning hit carries its attached ticket key, as every later one does', async () => {
    const [first, second] = sortedIds(2) as [string, string];
    await makeNotes(db, fixture, [first, second]);
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: fixture.WS,
        actorId: fixture.ids.author,
        entity: { kind: 'note', id: first },
        type: 'note.attached',
        payload: { ticketId: fixture.TP },
      }),
      makeCommitted({
        workspaceId: fixture.WS,
        actorId: fixture.ids.author,
        entity: { kind: 'note', id: second },
        type: 'note.attached',
        payload: { ticketId: fixture.TE },
      }),
    ]);
    await seedChunkAt(db, fixture.WS, first, 0.1);
    await seedChunkAt(db, fixture.WS, second, 0.4);

    const hits = await meaningNoteSearch(db.pool, await effFor(db, fixture, 'owner'), fixture.ids.owner, fixture.WS, QUERY, {
      embed: embedAtZero,
    });
    expect(hits.map((hit) => hit.noteId), 'fixture: the two notes, nearest first').toEqual([first, second]);
    expect(hits[1]?.attachedTicketKeys, "control: the second hit carries TE's key").toEqual(['CCRE-2']);
    expect(hits[0]?.attachedTicketKeys, "the first hit carries TP's key").toEqual(['CCRE-1']);
  }, 60_000);
});
