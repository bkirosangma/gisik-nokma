import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type EntityKind, type LedgerEvent } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { lexicalNoteSearch } from '../../src/read/note-search.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';

/**
 * Cases 22.080–22.082 (prefixes and groups plan Task 5, FD7). `ticket_text` in
 * `proj_note_search` bakes the ticket KEY into the note's index row, so a prefix
 * change has to re-index the notes attached to the tickets it re-keys — or a
 * person searching a note by the key they now see finds nothing, and
 * `verify-projections` drifts.
 *
 * ## The keys are literals, on purpose
 *
 * As `note-search.test.ts` explains, a test that recomputed the expected key
 * with the helpers the projection calls would pass if both were wrong together.
 * The fixture's workspace `Convenience Corner` is `CC`, its project
 * `Registrations` is `RE`, and its first two tickets are `TP` and `TE`, so the
 * first ticket THIS file makes is `-3` and the second `-4`.
 *
 * ## 22.080 and 22.081 share one world; 22.082 makes its own
 *
 * 22.080 moves the fixture's project to `SH`; 22.081 then moves the workspace
 * to `CD` and so reads `CDSH-4`. One database per file (`seedNotesFixture`
 * refuses a second seed), and nothing in `events` is ever truncated. 22.082
 * founds its OWN project and note and makes both changes itself, so it reads no
 * state the earlier cases left and passes in any order (it asserts no literal
 * that carries the workspace prefix, which 22.081 moves).
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

async function ticketTextOf(noteId: string): Promise<string | undefined> {
  const { rows } = await db.pool.query<{ ticket_text: string }>(
    'SELECT ticket_text FROM proj_note_search WHERE note_id = $1',
    [noteId],
  );
  return rows[0]?.ticket_text;
}

async function searchNotes(q: string): Promise<string[]> {
  const eff = await resolveEffectiveRole(db.pool, fixture.ids.author, fixture.WS);
  const { hits } = await lexicalNoteSearch(db.pool, eff, fixture.ids.author, fixture.WS, q, {});
  return hits.map((hit) => hit.noteId);
}

const ev = (
  entity: { kind: EntityKind; id: string },
  actorId: string,
  type: string,
  payload: unknown,
): LedgerEvent => makeCommitted({ workspaceId: fixture.WS, actorId, entity, type, payload });

/** A ticket in the fixture's project and a workspace-scoped note attached to it. */
async function noteAttachedToNewTicket(
  title: string,
  projectId: string = fixture.P,
): Promise<{ note: string; ticket: string }> {
  const note = newUlid();
  const ticket = newUlid();
  await applyCommitted(db.pool, [
    ev({ kind: 'ticket', id: ticket }, fixture.ids.author, 'ticket.created', {
      typeId: 'task',
      projectId,
      parentId: null,
      title,
    }),
    ev({ kind: 'note', id: note }, fixture.ids.author, 'note.created', {
      title: `Note on ${title}`,
      homeProjectId: projectId,
      scope: { mode: 'workspace' },
      attachTicketId: ticket,
    }),
  ]);
  return { note, ticket };
}

describe('22.080–22.081 the note search index follows a prefix change', () => {
  it('22.080 — project.updated {prefix:SH} re-keys ticket_text to CCSH-3 and a note search for CCSH-3 finds the note; control: before, CCRE-3 found it', async () => {
    const { note } = await noteAttachedToNewTicket('Fix the freezer');
    expect(await ticketTextOf(note), 'control: the old key is what is indexed first').toBe('ccre-3 fix the freezer');
    expect(await searchNotes('CCRE-3')).toContain(note);
    expect(await searchNotes('CCSH-3'), 'nothing is indexed under the new key yet').not.toContain(note);

    await applyCommitted(db.pool, [
      ev({ kind: 'project', id: fixture.P }, fixture.ids.owner, 'project.updated', { prefix: 'SH' }),
    ]);

    expect(await ticketTextOf(note)).toBe('ccsh-3 fix the freezer');
    expect(await searchNotes('CCSH-3')).toContain(note);
  });

  it('22.081 — workspace.prefix_changed {prefix:CD} re-keys it again, to CDSH-4, and the note is found by CDSH-4; control: before, CCSH-4 found it', async () => {
    const { note } = await noteAttachedToNewTicket('Mend the shutter');
    expect(await ticketTextOf(note), 'control: the current key is what is indexed').toBe('ccsh-4 mend the shutter');
    expect(await searchNotes('CCSH-4')).toContain(note);

    await applyCommitted(db.pool, [
      ev({ kind: 'workspace', id: fixture.WS }, fixture.ids.owner, 'workspace.prefix_changed', { prefix: 'CD' }),
    ]);

    expect(await ticketTextOf(note)).toBe('cdsh-4 mend the shutter');
    expect(await searchNotes('CDSH-4')).toContain(note);
  });
});

describe('22.082 the lexeme vocabulary follows each prefix change on its own', () => {
  it('22.082 — verifyProjections is clean right after a PROJECT prefix change and again after a WORKSPACE one; control: the note is re-keyed at each step', async () => {
    const project = newUlid();
    await applyCommitted(db.pool, [
      ev({ kind: 'project', id: project }, fixture.ids.owner, 'project.created', { name: 'Lexemes', prefix: 'ZA' }),
    ]);
    const { note } = await noteAttachedToNewTicket('Polish the brass', project);
    const verify = async () => {
      const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
      expect(report.diffs, report.diffs.map((diff) => diff.table).join(', ')).toEqual([]);
      expect(report.clean).toBe(true);
    };
    expect(await ticketTextOf(note), 'control: the founding key is what is indexed').toMatch(/^[a-z]+za-1 polish the brass$/);
    await verify();

    // Checkpoint 1: the project path ALONE. The workspace change below
    // re-derives the whole vocabulary and would hide a missing re-derive here.
    await applyCommitted(db.pool, [
      ev({ kind: 'project', id: project }, fixture.ids.owner, 'project.updated', { prefix: 'ZB' }),
    ]);
    expect(await ticketTextOf(note), 'control: the project change re-keyed the note').toMatch(/^[a-z]+zb-1 polish the brass$/);
    await verify();

    // Checkpoint 2: the workspace path. `CF` is neither the fixture's `CC` nor 22.081's `CD`.
    await applyCommitted(db.pool, [
      ev({ kind: 'workspace', id: fixture.WS }, fixture.ids.owner, 'workspace.prefix_changed', { prefix: 'CF' }),
    ]);
    expect(await ticketTextOf(note), 'control: the workspace change re-keyed it again').toBe('cfzb-1 polish the brass');
    await verify();
  });
});
