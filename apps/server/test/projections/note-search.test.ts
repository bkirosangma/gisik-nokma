import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';

/**
 * `proj_note_search` and `proj_note_lexemes` (spec §7.3, cases 18.131–18.135,
 * Plan 3 of 6).
 *
 * ## The ticket key in `ticket_text` is `CCRE-<n>`, and the literal is deliberate
 *
 * `ticket_text` is `"<key> <title>"` per attached ticket, and `<key>` is
 * `ticketKey(workspacePrefix, projectPrefix, number)` — so the assertion has to
 * know the key. This file PINS the literal rather than calling the same helpers
 * the projection calls: a test that recomputed the expectation with
 * `workspaceIdentityFromLedger` + `projectPrefixesInWorkspace` + `ticketNumbers`
 * would pass whether the projection got the key right or both got it wrong
 * together. The literal comes from the fixture's own names, independently
 * derived: workspace `Convenience Corner` → `CC` (`derivePrefix`, one word of
 * two → first two letters), project `Registrations` → `RE`, and this file's
 * ticket is the THIRD `ticket.created` in project P's `workspace_seq` order
 * after the fixture's `TP` and `TE`.
 *
 * ## One database, one ledger, and 18.135 LAST
 *
 * Nothing is truncated: as `proj-notes.test.ts` documents at length, `events` is
 * append-only by trigger and no test in this repo truncates it. Every case mints
 * its own note and ticket ids, so no case can read another's rows — and 18.135
 * asserts the WHOLE table matches a rebuild from the ledger, so it must run
 * after every case that writes. Reordering it changes what it asserts.
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

type Row = { title: string; body_text: string; ticket_text: string; tsv: string };

async function rowOf(noteId: string): Promise<Row | null> {
  const { rows } = await db.pool.query<Row>(
    'SELECT title, body_text, ticket_text, tsv::text AS tsv FROM proj_note_search WHERE note_id = $1',
    [noteId],
  );
  return rows[0] ?? null;
}

async function lexemesFor(workspaceId: string): Promise<string[]> {
  const { rows } = await db.pool.query<{ lexeme: string }>(
    'SELECT lexeme FROM proj_note_lexemes WHERE workspace_id = $1',
    [workspaceId],
  );
  return rows.map((row) => row.lexeme);
}

function docOf(...paragraphs: string[]): unknown {
  return {
    type: 'doc',
    attrs: { schemaVersion: 2 },
    content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
  };
}

/** A note event in the fixture's workspace, authored by the fixture's author. */
function noteEv(noteId: string, type: string, payload: unknown): LedgerEvent {
  return makeCommitted({
    workspaceId: fixture.WS,
    actorId: fixture.ids.author,
    entity: { kind: 'note', id: noteId },
    type,
    payload,
  });
}

function ticketEv(ticketId: string, type: string, payload: unknown): LedgerEvent {
  return makeCommitted({
    workspaceId: fixture.WS,
    actorId: fixture.ids.author,
    entity: { kind: 'ticket', id: ticketId },
    type,
    payload,
  });
}

describe('18.131–18.135 the note search projection', () => {
  /**
   * 18.131 — the folded title and body, and the ticket line that arrives with
   * an attachment.
   *
   * Mutation: skip folding the body.
   */
  it('18.131 — folds title and body, and derives ticket_text from attached tickets', async () => {
    const NOTE = newUlid();
    const TICKET = newUlid();
    await applyCommitted(db.pool, [
      ticketEv(TICKET, 'ticket.created', {
        typeId: 'task',
        projectId: fixture.P,
        parentId: null,
        title: 'Fix the freezer',
      }),
      noteEv(NOTE, 'note.created', {
        title: 'Broken Fridge',
        homeProjectId: fixture.P,
        scope: { mode: 'workspace' },
      }),
      noteEv(NOTE, 'note.body_set', { body: docOf('The Compressor stopped in the Cold Room.') }),
    ]);

    const before = await rowOf(NOTE);
    expect(before, 'the note is indexed as soon as it has an event').not.toBeNull();
    expect(before?.title, 'the title is FOLDED here, and the raw one is proj_notes.title').toBe('broken fridge');
    expect(before?.body_text).toBe('the compressor stopped in the cold room.');
    expect(before?.ticket_text, 'nothing is attached yet').toBe('');

    // Control: the RAW title is still upstream, unmangled — so the fold is a
    // property of this table and not of the note.
    const { rows: raw } = await db.pool.query<{ title: string }>(
      'SELECT title FROM proj_notes WHERE note_id = $1',
      [NOTE],
    );
    expect(raw[0]?.title).toBe('Broken Fridge');

    await applyCommitted(db.pool, [noteEv(NOTE, 'note.attached', { ticketId: TICKET })]);

    const after = await rowOf(NOTE);
    expect(after?.ticket_text, 'the ticket key and title, folded onto one line').toBe('ccre-3 fix the freezer');
    expect(after?.body_text, 'the note text is unchanged by an attachment').toBe(
      'the compressor stopped in the cold room.',
    );

    // The same fact from the FIXTURE's own world, so this is not a property of
    // one hand-made ticket: nInherit is attached to TE at birth.
    const inherit = await rowOf(fixture.NOTES.nInherit);
    expect(inherit?.ticket_text).toBe('ccre-2 share the july invoices');
  });

  /**
   * 18.132 — the ticket events the projection must follow.
   *
   * Mutation: ignore ticket events.
   */
  it('18.132 — a renamed ticket re-derives ticket_text; a deleted one drops its line; restoring brings it back', async () => {
    const NOTE = newUlid();
    const TICKET = newUlid();
    await applyCommitted(db.pool, [
      ticketEv(TICKET, 'ticket.created', {
        typeId: 'task',
        projectId: fixture.P,
        parentId: null,
        title: 'Fix the freezer',
      }),
      noteEv(NOTE, 'note.created', {
        title: 'Cold room log',
        homeProjectId: fixture.P,
        scope: { mode: 'workspace' },
        attachTicketId: TICKET,
      }),
    ]);
    expect((await rowOf(NOTE))?.ticket_text).toBe('ccre-4 fix the freezer');

    await applyCommitted(db.pool, [
      ticketEv(TICKET, 'ticket.field_set', { fieldId: 'title', value: 'Fix the freezer door' }),
    ]);
    expect((await rowOf(NOTE))?.ticket_text, 'the rename reached the note').toBe('ccre-4 fix the freezer door');

    // A field claim that is NOT the title must not touch the note at all. Its
    // value carries the renamed title, so a projection that ignored `fieldId`
    // would write the same string here and pass by accident — the control is
    // the assignment below, which it WOULD carry.
    await applyCommitted(db.pool, [
      ticketEv(TICKET, 'ticket.field_set', { fieldId: 'description', value: 'Fix the freezer door' }),
    ]);
    expect((await rowOf(NOTE))?.ticket_text).toBe('ccre-4 fix the freezer door');

    await applyCommitted(db.pool, [ticketEv(TICKET, 'ticket.deleted', {})]);
    expect((await rowOf(NOTE))?.ticket_text, 'a deleted ticket contributes no line').toBe('');

    await applyCommitted(db.pool, [ticketEv(TICKET, 'ticket.restored', {})]);
    expect((await rowOf(NOTE))?.ticket_text, 'and the undo brings it back').toBe('ccre-4 fix the freezer door');
  });

  /**
   * 18.133 — the note's own delete and restore.
   *
   * Mutation: keep the row.
   */
  it('18.133 — note.deleted removes the row and note.restored recreates it', async () => {
    const NOTE = newUlid();
    await applyCommitted(db.pool, [
      noteEv(NOTE, 'note.created', {
        title: 'Scratch',
        homeProjectId: fixture.P,
        scope: { mode: 'workspace' },
      }),
      noteEv(NOTE, 'note.body_set', { body: docOf('a note that will be deleted') }),
    ]);
    expect(await rowOf(NOTE)).not.toBeNull();

    await applyCommitted(db.pool, [noteEv(NOTE, 'note.deleted', {})]);
    expect(await rowOf(NOTE), 'a deleted note is not searchable').toBeNull();

    await applyCommitted(db.pool, [noteEv(NOTE, 'note.restored', {})]);
    const restored = await rowOf(NOTE);
    expect(restored, 'and the undo recreates it from proj_notes, not from nothing').not.toBeNull();
    expect(restored?.title).toBe('scratch');
    expect(restored?.body_text).toBe('a note that will be deleted');
  });

  /**
   * 18.134 — the lexeme vocabulary, and the split that fills it.
   *
   * Mutation: split on spaces only.
   */
  it('18.134 — proj_note_lexemes holds every folded word of three letters or more, split on non-alphanumerics', async () => {
    const NOTE = newUlid();
    await applyCommitted(db.pool, [
      noteEv(NOTE, 'note.created', {
        title: 'Belt tension',
        homeProjectId: fixture.P,
        scope: { mode: 'workspace' },
      }),
      noteEv(NOTE, 'note.body_set', { body: docOf('check the cold-room belt, to be sure') }),
    ]);

    const lexemes = new Set(await lexemesFor(fixture.WS));
    expect(lexemes.has('belt'), 'from the title and the body').toBe(true);
    expect(lexemes.has('tension')).toBe(true);
    expect(lexemes.has('room'), 'the hyphen is a separator, not part of the word').toBe(true);
    expect(lexemes.has('cold'), 'the other half of the same token').toBe(true);
    expect(lexemes.has('cold-room'), 'control: the run is not kept whole').toBe(false);
    expect(lexemes.has('sure')).toBe(true);
    expect(lexemes.has('to'), 'control: two letters is below the length floor').toBe(false);

    // "once per workspace": the primary key is (workspace_id, lexeme), and the
    // projection inserts with ON CONFLICT DO NOTHING — so a word used by two
    // notes is one row, not two.
    const { rows } = await db.pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM proj_note_lexemes WHERE workspace_id = $1 AND lexeme = 'belt'`,
      [fixture.WS],
    );
    expect(rows[0]?.n).toBe('1');

    // The ticket line feeds the vocabulary too — the third of the three sources
    // spec §7.3 names. `freezer` appears ONLY in a ticket title.
    expect(lexemes.has('freezer')).toBe(true);
  });

  /**
   * 18.135 — replay is clean, and the `simple` configuration is the one the
   * stored vector was built with.
   *
   * LAST IN THIS FILE, deliberately: it asserts the WHOLE table equals a
   * rebuild from the ledger, so every case above it must have run.
   *
   * Mutation: use `'english'` in the migration's generated column.
   */
  it('18.135 — verifyProjections is clean for both tables, and the index is unstemmed', async () => {
    const NOTE = newUlid();
    await applyCommitted(db.pool, [
      noteEv(NOTE, 'note.created', {
        title: 'Trade licences',
        homeProjectId: fixture.P,
        scope: { mode: 'workspace' },
      }),
      noteEv(NOTE, 'note.body_set', { body: docOf('the licences are renewed') }),
    ]);

    const stored = await rowOf(NOTE);
    expect(stored?.tsv, "'simple' does not stem: the word survives whole").toContain('licences');
    expect(stored?.tsv, 'the stemmed form would be the `english` configuration').not.toContain('licenc:');

    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report.diffs, report.diffs.map((diff) => diff.table).join(', ')).toEqual([]);
    expect(report.clean).toBe(true);
  });
});
