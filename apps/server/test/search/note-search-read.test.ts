import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { lexicalNoteSearch, meaningNoteSearch } from '../../src/read/note-search.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';

/**
 * The three note search queries (spec §7.4–§7.6, cases 18.141–18.148, Plan 3 of
 * 6).
 *
 * ## Why the embedder is injected here
 *
 * `meaningNoteSearch` takes an optional `embed`. The real one loads a 130 MB
 * model and gives vectors this file cannot state a distance between; a fake
 * gives a two-dimensional vector whose ANGLE is chosen per chunk text, so
 * "nearest" is a fact the test decided rather than a fact it discovered. That is
 * what makes 18.145 and 18.146 testable at all — with the real model, a
 * no-leak case would depend on whether a private note happened to be near the
 * query, which is not a property of the predicate under test. What the real
 * model is evidence for is 18.126–18.127 and Task 8's Garo evaluation.
 *
 * ## The viewer is the fixture's `author` for most cases
 *
 * Every fixture note is authored by `author`, and `author` is a member on the
 * project and therefore a reader of all five. That gives each case a viewer who
 * can see the whole world, so a filter or a predicate that returns nothing is
 * the filter's doing and not the viewer's.
 */
let db: TestDatabase;
let fixture: NotesFixture;
beforeAll(async () => {
  db = await createTestDatabase();
  fixture = await seedNotesFixture(db.pool);
});
afterAll(async () => {
  await db.drop();
});

async function effFor(userId: string) {
  const eff = await resolveEffectiveRole(db.pool, userId, fixture.WS);
  if (eff.workspaceRole === null) throw new Error('fixture user is not a member of the workspace');
  return eff;
}

/** Angle → a unit vector in the plane of the first two components. */
function vectorFor(text: string): Float32Array {
  const vector = new Float32Array(512);
  // A HASH of the text, so a case only has to name the texts it wants far
  // apart, and every other pair is whatever the hash says. Exact control where
  // it matters, noise where it does not.
  const angle = vectors.get(text) ?? (hashAngle(text) + Math.PI / 2);
  vector[0] = Math.cos(angle);
  vector[1] = Math.sin(angle);
  return vector;
}

const vectors = new Map<string, number>();

function hashAngle(text: string): number {
  let sum = 0;
  for (const char of text) sum = (sum * 31 + char.codePointAt(0)!) % 997;
  return (sum / 997) * Math.PI;
}

/** Declare two texts to be at a chosen angle — used to place a chunk near or far. */
function atAngle(text: string, angle: number): void {
  vectors.set(text, angle);
}

const fakeEmbed = async (text: string): Promise<Float32Array> => vectorFor(text);

function vectorLiteral(vector: Float32Array): string {
  return `[${Array.from(vector).join(',')}]`;
}

async function seedChunk(noteId: string, text: string): Promise<void> {
  await db.pool.query(
    `INSERT INTO search_note_chunks
       (note_id, chunk_index, workspace_id, heading_path, chunk_text, model, source_seq, embedding)
     VALUES ($1, 0, $2, '', $3, 'read-test@1', 0, $4)`,
    [noteId, fixture.WS, text, vectorLiteral(vectorFor(text))],
  );
}

function noteEv(noteId: string, type: string, payload: unknown, actorId = fixture.ids.author): LedgerEvent {
  return makeCommitted({
    workspaceId: fixture.WS,
    actorId,
    entity: { kind: 'note', id: noteId },
    type,
    payload,
  });
}

function docOf(...paragraphs: string[]): unknown {
  return {
    type: 'doc',
    attrs: { schemaVersion: 2 },
    content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
  };
}

/** A note created and given a body in one call. */
async function makeNote(deps: {
  title: string;
  body?: string;
  scope?: 'private' | 'workspace' | 'project';
  actorId?: string;
}): Promise<string> {
  const id = newUlid();
  const events: LedgerEvent[] = [
    noteEv(
      id,
      'note.created',
      {
        title: deps.title,
        homeProjectId: fixture.P,
        scope: { mode: deps.scope ?? 'workspace' },
      },
      deps.actorId ?? fixture.ids.author,
    ),
  ];
  if (deps.body !== undefined) events.push(noteEv(id, 'note.body_set', { body: docOf(deps.body) }, deps.actorId ?? fixture.ids.author));
  await applyCommitted(db.pool, events);
  return id;
}

function idsOf(hits: readonly { noteId: string }[]): string[] {
  return hits.map((hit) => hit.noteId);
}

describe('18.141–18.148 the note search queries', () => {
  /**
   * 18.141 — the last word is a PREFIX.
   *
   * Mutation: drop `:*`.
   */
  it('18.141 — a prefix finds the note, and a control query finds nothing', async () => {
    const eff = await effFor(fixture.ids.author);
    const NOTE = await makeNote({
      title: 'Compressor log',
      body: 'The compressor stopped in the cold room overnight.',
    });

    const hits = await lexicalNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, 'cold compr', {});
    expect(idsOf(hits.hits)).toContain(NOTE);
    expect(hits.corrected, 'a query that found something is not corrected').toBeUndefined();

    const control = await lexicalNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, 'cold xylophone', {});
    expect(control.hits, 'control: neither word is anywhere').toEqual([]);
  });

  /**
   * 18.142 — weights, asserted through the ORDER the query returns.
   *
   * Mutation: swap A and B in the migration's generated column.
   */
  it('18.142 — a title match outranks a body-only match for the same word', async () => {
    const eff = await effFor(fixture.ids.author);
    const IN_TITLE = await makeNote({ title: 'Freezer door seal', body: 'nothing to see here' });
    const IN_BODY = await makeNote({ title: 'Weekly round', body: 'the freezer door seal is worn' });

    const hits = await lexicalNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, 'freezer', {});
    const order = idsOf(hits.hits);
    expect(order, 'both match').toEqual(expect.arrayContaining([IN_TITLE, IN_BODY]));
    expect(
      order.indexOf(IN_TITLE) < order.indexOf(IN_BODY),
      `the title match (weight A) comes first; order was ${order.join(', ')}`,
    ).toBe(true);
  });

  /**
   * 18.143 — trigram correction, and only on zero hits.
   *
   * Mutation: skip `correctWords`.
   */
  it('18.143 — a misspelt word is corrected, and a correct one is not', async () => {
    const eff = await effFor(fixture.ids.author);
    const NOTE = await makeNote({ title: 'Belt tension', body: 'check the compressor belt' });

    const misspelt = await lexicalNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, 'compresor', {});
    expect(misspelt.corrected, 'the vocabulary supplied the correction').toEqual(['compressor']);
    expect(idsOf(misspelt.hits)).toContain(NOTE);

    const correct = await lexicalNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, 'compressor', {});
    expect(correct.corrected, 'control: a query that matched is never corrected').toBeUndefined();
    expect(idsOf(correct.hits)).toContain(NOTE);
  });

  /**
   * 18.144 — the reader predicate, inside the LEXICAL statement.
   *
   * Mutation: drop `visibleNotesWhere`.
   */
  it('18.144 — a private note is invisible to a member and visible to its author', async () => {
    const member = await effFor(fixture.ids.memberIn);
    const author = await effFor(fixture.ids.author);

    const forMember = await lexicalNoteSearch(db.pool, member, fixture.ids.memberIn, fixture.WS, 'private', {});
    expect(idsOf(forMember.hits), 'a private note is not in a member\'s results').not.toContain(
      fixture.NOTES.nPrivate,
    );

    const forAuthor = await lexicalNoteSearch(db.pool, author, fixture.ids.author, fixture.WS, 'private', {});
    expect(idsOf(forAuthor.hits), 'control: its author sees it').toContain(fixture.NOTES.nPrivate);
  });

  /**
   * 18.145 — the reader predicate, inside the MEANING statement.
   *
   * The private note's chunk text IS the query string, so it is the nearest
   * chunk by construction — which is what makes its absence from a member's
   * results the predicate's doing rather than a distance accident.
   *
   * Mutation: drop the predicate from the chunks query.
   */
  it('18.145 — a private note is invisible to a member by meaning too', async () => {
    const QUERY = 'a phrase that lives only in the private note';
    const PRIVATE = await makeNote({ title: 'Private by meaning', body: QUERY, scope: 'private' });
    const READABLE = await makeNote({ title: 'Readable by meaning', body: 'an unrelated sentence' });
    atAngle(QUERY, 0);
    await seedChunk(PRIVATE, QUERY);
    await seedChunk(READABLE, 'an unrelated sentence');

    const member = await effFor(fixture.ids.memberIn);
    const forMember = await meaningNoteSearch(db.pool, member, fixture.ids.memberIn, fixture.WS, QUERY, {
      embed: fakeEmbed,
    });
    expect(idsOf(forMember), 'the nearest chunk belongs to a note the member cannot read').not.toContain(PRIVATE);

    const author = await effFor(fixture.ids.author);
    const forAuthor = await meaningNoteSearch(db.pool, author, fixture.ids.author, fixture.WS, QUERY, {
      embed: fakeEmbed,
    });
    expect(idsOf(forAuthor), 'control: its author gets it, and it is first because it is nearest').toContain(PRIVATE);
    expect(forAuthor[0]?.noteId).toBe(PRIVATE);
  });

  /**
   * 18.146 — the two filters, in both modes.
   *
   * Mutation: ignore `scopeMode`.
   */
  it('18.146 — author and scope narrow both modes, and no filter is the superset', async () => {
    const eff = await effFor(fixture.ids.author);
    const WORKSPACE_NOTE = await makeNote({ title: 'Quokka sighting', body: 'quokka near the shed' });
    const PRIVATE_NOTE = await makeNote({ title: 'Quokka habitat', body: 'quokka burrow', scope: 'private' });
    await seedChunk(WORKSPACE_NOTE, 'quokka near the shed');
    await seedChunk(PRIVATE_NOTE, 'quokka burrow');

    const unfiltered = await lexicalNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, 'quokka', {});
    expect(idsOf(unfiltered.hits), 'control: no filter returns the superset').toEqual(
      expect.arrayContaining([WORKSPACE_NOTE, PRIVATE_NOTE]),
    );

    const byScope = await lexicalNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, 'quokka', {
      scopeMode: 'workspace',
    });
    expect(idsOf(byScope.hits), 'the private one is filtered out').not.toContain(PRIVATE_NOTE);
    expect(idsOf(byScope.hits)).toContain(WORKSPACE_NOTE);

    const byAuthor = await lexicalNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, 'quokka', {
      authorId: fixture.ids.memberIn,
    });
    expect(byAuthor.hits, 'control: nobody else wrote about a quokka').toEqual([]);

    const meaningUnfiltered = await meaningNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, 'quokka burrow', {
      embed: fakeEmbed,
    });
    expect(idsOf(meaningUnfiltered)).toContain(PRIVATE_NOTE);

    const meaningByScope = await meaningNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, 'quokka burrow', {
      scopeMode: 'workspace',
      embed: fakeEmbed,
    });
    expect(idsOf(meaningByScope), 'the same filter, the other mode').not.toContain(PRIVATE_NOTE);
  });

  /**
   * 18.147 — the snippet: highlighted by `ts_headline`, within `MaxWords`, and
   * for a meaning hit the chunk text after the heading line.
   *
   * Mutation: use `title` as the snippet.
   */
  it('18.147 — a lexical snippet is highlighted and capped, and a meaning snippet is the chunk text', async () => {
    const eff = await effFor(fixture.ids.author);
    const body = `${Array.from({ length: 30 }, (_, index) => `filler${String(index)}`).join(' ')} wobbleshaft ${Array.from(
      { length: 30 },
      (_, index) => `trailer${String(index)}`,
    ).join(' ')}`;
    const NOTE = await makeNote({ title: 'Long body', body });

    const hits = await lexicalNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, 'wobbleshaft', {});
    const hit = hits.hits.find((entry) => entry.noteId === NOTE);
    expect(hit, 'the note matched').toBeDefined();
    expect(hit?.snippet, 'the match is marked').toContain('**wobbleshaft**');
    expect(
      (hit?.snippet ?? '').split(/\s+/).filter(Boolean).length,
      'MaxWords=18 caps the window',
    ).toBeLessThanOrEqual(18);
    expect(hit?.title, 'the hit carries the RAW title, not the folded one').toBe('Long body');

    // The meaning half: the snippet is the chunk text with the heading line
    // removed and cut to 160 characters.
    const CHUNK = `${'H'.repeat(20)}\n${'body '.repeat(60)}`;
    const MEANING_NOTE = await makeNote({ title: 'Chunked', body: 'x' });
    atAngle('a meaning query', 0);
    await db.pool.query(
      `INSERT INTO search_note_chunks
         (note_id, chunk_index, workspace_id, heading_path, chunk_text, model, source_seq, embedding)
       VALUES ($1, 0, $2, 'Cold room', $3, 'read-test@1', 0, $4)`,
      [MEANING_NOTE, fixture.WS, CHUNK, vectorLiteral(vectorFor('a meaning query'))],
    );
    const meaning = await meaningNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, 'a meaning query', {
      embed: fakeEmbed,
    });
    const meaningHit = meaning.find((entry) => entry.noteId === MEANING_NOTE);
    expect(meaningHit?.snippet.length, 'cut to 160 characters').toBeLessThanOrEqual(160);
    expect(meaningHit?.snippet, 'the heading line is dropped').not.toContain('HHHH');
  });

  /**
   * 18.148 — a deleted note is in neither mode.
   *
   * Mutation: drop `n.deleted = FALSE`.
   */
  it('18.148 — a deleted note never appears in either mode', async () => {
    const eff = await effFor(fixture.ids.author);
    const NOTE = await makeNote({ title: 'Numbat census', body: 'numbat count' });
    await seedChunk(NOTE, 'numbat count');

    const before = await lexicalNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, 'numbat', {});
    expect(idsOf(before.hits), 'control: it is there while it is live').toContain(NOTE);

    await applyCommitted(db.pool, [noteEv(NOTE, 'note.deleted', {})]);

    const lexical = await lexicalNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, 'numbat', {});
    expect(idsOf(lexical.hits), 'lexical').not.toContain(NOTE);

    const meaning = await meaningNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, 'numbat count', {
      embed: fakeEmbed,
    });
    expect(idsOf(meaning), 'meaning — the chunk row is still there, and must not be returned').not.toContain(NOTE);
  });
});
