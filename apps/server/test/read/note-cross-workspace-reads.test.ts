import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { foldSearchText, makeEnvelope, newUlid, type GraphGroup } from '@gisik-nokma/domain';
import { checkPermission } from '../../src/permissions/check-permission.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { backfillNoteSearchBinds } from '../../src/projections/backfill-note-search-binds.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { readDeletedItems } from '../../src/read/deleted-items.js';
import { readGraphRing } from '../../src/read/graph-neighbours.js';
import { correctWords, lexicalNoteSearch } from '../../src/read/note-search.js';
import { attachedTicketsByNote, getNoteDetail, listNotes, listNotesForTicket } from '../../src/read/notes.js';
import { canReadNoteById } from '../../src/visibility/can-read-note.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';
import { dueAt, recordingStore } from '../purge/world.js';

/**
 * Cases 18.522 and 18.523 (task/notes-cross-workspace-followup): links and homes written BEFORE 18.500–18.503 and
 * 18.520 refused them are HIDDEN from every read that joins a note to a ticket or a project. Nothing is deleted.
 *
 * The PRE-FIX rows are seeded the way the door wrote them before the fixes, through the projections
 * (`applyCommitted`, which asks no permission), plus, for search, a `proj_note_search` row and vocabulary written
 * DIRECTLY in the shape the old index produced: another workspace's ticket title in `ticket_text` and its words in
 * the lexemes. The new projection code would never write that shape, so seeding through it would prove nothing about
 * the production rows the one-shot re-derive exists for.
 *
 * World: the notes fixture's WS (`author` a member on P) and W2, which `author` OWNS and `x2` is a plain member of
 * (W2 only). `author` is the person in BOTH workspaces, the only viewer for whom the graph ring crossed (a W2-only
 * reader already got nothing there).
 */
let db: TestDatabase;
let world: NotesFixture;
let W2: string;
let P2: string;
let TW2: string;
/** A WORKSPACE-mode ticket of WS: any W2 member passes its audience when it is asked with W2's role. */
let TWS: string;
/** WS projects: PX deleted (trash), PY deleted and purged. */
let PX: string;
let PY: string;
let x2: string;
const n: Record<'away' | 'movedL' | 'movedX' | 'movedY' | 'homeless' | 'inheritAway' | 'inheritHome' | 'inPX' | 'inPY', string> = {
  away: '',
  movedL: '',
  movedX: '',
  movedY: '',
  homeless: '',
  inheritAway: '',
  inheritHome: '',
  inPX: '',
  inPY: '',
};

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedNotesFixture(db.pool);
  W2 = newUlid();
  P2 = newUlid();
  TW2 = newUlid();
  TWS = newUlid();
  PX = newUlid();
  PY = newUlid();
  x2 = newUlid();
  for (const key of Object.keys(n) as (keyof typeof n)[]) n[key] = newUlid();
  const inWS = { workspaceId: world.WS, actorId: world.ids.owner };
  const inW2 = { workspaceId: W2, actorId: world.ids.author };
  const w2Note = (id: string, title: string, scope: string, homeProjectId = P2, attachTicketId?: string) =>
    makeCommitted({
      ...inW2,
      entity: { kind: 'note', id },
      type: 'note.created',
      payload: { title, homeProjectId, scope: { mode: scope }, ...(attachTicketId === undefined ? {} : { attachTicketId }) },
    });
  // A W2 note re-filed under a project of WS: the move 18.520 now refuses, as the door took it before.
  const preFixMove = (id: string, homeProjectId: string) =>
    makeCommitted({ ...inW2, entity: { kind: 'note', id }, type: 'note.moved', payload: { homeProjectId } });
  // A W2 note linked to a WS ticket: the link 18.500 now refuses, as the door took it before.
  const preFixLink = (id: string, ticketId: string) =>
    makeCommitted({ ...inW2, entity: { kind: 'note', id }, type: 'note.attached', payload: { ticketId } });

  await applyCommitted(db.pool, [
    makeCommitted({
      ...inWS,
      entity: { kind: 'ticket', id: TWS },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId: world.P, parentId: null, title: 'Pelican crate count' },
    }),
    makeCommitted({ ...inWS, entity: { kind: 'ticket', id: TWS }, type: 'visibility.set', payload: { ticketId: TWS, mode: 'workspace' } }),
    makeCommitted({ ...inWS, entity: { kind: 'project', id: PX }, type: 'project.created', payload: { name: 'Binned' } }),
    makeCommitted({ ...inWS, entity: { kind: 'project', id: PY }, type: 'project.created', payload: { name: 'Erased' } }),
    makeCommitted({
      ...inWS,
      actorId: world.ids.author,
      entity: { kind: 'note', id: n.inPX },
      type: 'note.created',
      payload: { title: 'Filed in the binned project', homeProjectId: PX, scope: { mode: 'workspace' } },
    }),
    makeCommitted({
      ...inWS,
      actorId: world.ids.author,
      entity: { kind: 'note', id: n.inPY },
      type: 'note.created',
      payload: { title: 'Filed in the erased project', homeProjectId: PY, scope: { mode: 'workspace' } },
    }),

    makeCommitted({ ...inW2, entity: { kind: 'workspace', id: W2 }, type: 'workspace.created', payload: { name: 'Elsewhere' } }),
    makeCommitted({
      ...inW2,
      entity: { kind: 'membership', id: `${W2}:${world.ids.author}` },
      type: 'membership.granted',
      payload: { userId: world.ids.author, role: 'owner' },
    }),
    makeCommitted({ ...inW2, entity: { kind: 'membership', id: `${W2}:${x2}` }, type: 'membership.granted', payload: { userId: x2, role: 'member' } }),
    makeCommitted({ ...inW2, entity: { kind: 'project', id: P2 }, type: 'project.created', payload: { name: 'Elsewhere' } }),
    makeCommitted({
      ...inW2,
      entity: { kind: 'workflow', id: 'wf-elsewhere' },
      type: 'workflow.defined',
      payload: {
        id: 'wf-elsewhere',
        version: 1,
        name: 'Elsewhere',
        initialStateId: 'todo',
        states: [{ id: 'todo', name: 'To do', category: 'open' }],
        transitions: [{ from: '*', to: 'todo', rules: [] }],
      },
    }),
    makeCommitted({
      ...inW2,
      entity: { kind: 'ticket-type', id: 'task-elsewhere' },
      type: 'ticket-type.defined',
      payload: { id: 'task-elsewhere', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-elsewhere', fields: [] },
    }),
    makeCommitted({
      ...inW2,
      entity: { kind: 'ticket', id: TW2 },
      type: 'ticket.created',
      payload: { typeId: 'task-elsewhere', projectId: P2, parentId: null, title: 'Zanzibar shipping quote' },
    }),
    w2Note(n.away, 'Homed in the second workspace', 'workspace'),
    makeCommitted({ ...inW2, entity: { kind: 'note', id: n.away }, type: 'note.attached', payload: { ticketId: TW2 } }),
    preFixLink(n.away, world.TP),
    w2Note(n.movedL, 'Moved under a live project of WS', 'workspace'),
    preFixMove(n.movedL, world.P),
    w2Note(n.movedX, 'Moved under the binned project', 'workspace'),
    preFixMove(n.movedX, PX),
    w2Note(n.movedY, 'Moved under the erased project', 'workspace'),
    preFixMove(n.movedY, PY),
    w2Note(n.homeless, 'Filed at workspace level', 'workspace', ''),
    // Born linked to a WS ticket: the create 18.501 now refuses, as the door took it before.
    w2Note(n.inheritAway, 'Inherits from a ticket of WS only', 'inherit', P2, TWS),
    w2Note(n.inheritHome, 'Inherits from a ticket of W2', 'inherit', P2, TW2),

    makeCommitted({ ...inWS, entity: { kind: 'project', id: PX }, type: 'project.deleted', payload: {} }),
    makeCommitted({ ...inWS, entity: { kind: 'project', id: PY }, type: 'project.deleted', payload: {} }),
    makeCommitted({ ...inWS, entity: { kind: 'project', id: PY }, type: 'purge.marked', payload: {} }),
  ]);
  await purgeItem(db.pool, { kind: 'project', id: PY }, { projections: buildProjectionRegistry(), store: recordingStore(), now: await dueAt(db.pool, 'project', PY) });

  // The search row the OLD index wrote for `away`: TP's title in `ticket_text`, its words in W2's vocabulary.
  const foreignLine = foldSearchText('Renew the trade licence');
  await db.pool.query("UPDATE proj_note_search SET ticket_text = ticket_text || $2 || E'\\n' WHERE note_id = $1", [n.away, foreignLine]);
  await db.pool.query(
    'INSERT INTO proj_note_lexemes (workspace_id, lexeme) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING',
    [W2, foreignLine.split(' ')],
  );
  // A sentinel in a note with NO cross-workspace link: the re-derive must not touch it.
  await db.pool.query("UPDATE proj_note_search SET ticket_text = ticket_text || 'sentinelword' WHERE note_id = $1", [n.inheritHome]);
}, 120_000);

afterAll(async () => {
  await db.drop();
});

const effOf = (userId: string, workspaceId: string) => resolveEffectiveRole(db.pool, userId, workspaceId);
const author = () => world.ids.author;
const ring = async (center: string, groups: GraphGroup[]) =>
  readGraphRing(db.pool, author(), {
    center: { kind: 'note', id: center },
    hops: 1,
    workspaceIds: [W2],
    projectIds: [],
    groups: new Set<GraphGroup>(groups),
    offset: 0,
  });
const hitsFor = async (q: string) =>
  (await lexicalNoteSearch(db.pool, await effOf(author(), W2), author(), W2, q)).hits;

describe('18.522 a pre-fix cross-workspace link is absent from every read of the note', () => {
  it('18.522 attachedTicketsByNote and the ticket\'s notes list show the W2 note with its W2 ticket only, never WS\'s TP', async () => {
    const eff = await effOf(author(), W2);
    // CONTROL in the same read: the same-workspace link is present.
    const attached = (await attachedTicketsByNote(db.pool, eff, author(), W2, [n.away])).get(n.away) ?? [];
    expect(attached.map((t) => t.ticketId)).toEqual([TW2]);
    expect(attached.map((t) => t.title)).toEqual(['Zanzibar shipping quote']);
    expect((await getNoteDetail(db.pool, eff, author(), n.away))?.attachedTickets.map((t) => t.ticketId)).toEqual([TW2]);

    expect((await listNotesForTicket(db.pool, eff, author(), W2, TW2)).map((s) => s.noteId)).toContain(n.away);
    expect(await listNotesForTicket(db.pool, eff, author(), W2, world.TP)).toEqual([]);
  });

  it('18.522 the graph ring around the W2 note, viewed by the person in BOTH workspaces, has the W2 ticket and no WS ticket, and a note moved under a WS project has no project there', async () => {
    const attachedRing = await ring(n.away, ['attached']);
    const refs = attachedRing?.items.map((item) => item.ref) ?? [];
    expect(refs).toContain(`ticket:${TW2}`); // CONTROL
    expect(refs).not.toContain(`ticket:${world.TP}`);
    expect(attachedRing?.edges.map((edge) => edge.to)).not.toContain(`ticket:${world.TP}`);

    const homeRing = await ring(n.away, ['projects']);
    expect(homeRing?.items.map((item) => item.ref)).toContain(`project:${P2}`); // CONTROL
    expect(homeRing?.center.projectId).toBe(P2);
    const movedRing = await ring(n.movedL, ['projects']);
    expect(movedRing?.items.map((item) => item.ref)).not.toContain(`project:${world.P}`);
    expect(movedRing?.edges).toEqual([]);
    expect(movedRing?.center.projectId).toBeNull();
  });

  it('18.522 an inherit note of W2 linked only to a WS ticket admits no W2 reader, in the list (SQL) as in canReadNote (TS): the two agree', async () => {
    const eff = await effOf(x2, W2);
    const listed = (await listNotes(db.pool, eff, x2, W2)).map((s) => s.noteId);
    // CONTROL: the inherit note linked to a W2 ticket the member sees is read by both.
    expect(listed).toContain(n.inheritHome);
    expect(await canReadNoteById(db.pool, x2, n.inheritHome)).toBe(true);
    expect(listed).not.toContain(n.inheritAway);
    expect(await canReadNoteById(db.pool, x2, n.inheritAway)).toBe(false);
  });

  it('18.522 note search: the PRE-FIX row finds the W2 note by a WS title word and corrects to it; the boot re-derive (once, under each note\'s lock, cross-workspace notes only) leaves the W2 words and drops the WS ones', async () => {
    // The haystack holds its subject: before the re-derive the old row answers for the WS word.
    expect((await hitsFor('licence')).map((hit) => hit.noteId)).toEqual([n.away]);
    expect(await correctWords(db.pool, W2, ['licenc'])).toEqual([["'licence'"]]);

    let lockedElsewhere: boolean | undefined;
    let freeElsewhere: boolean | undefined;
    const result = await backfillNoteSearchBinds(db.pool, {
      probe: async (_stage, noteId) => {
        if (noteId !== n.away) return;
        const tryLock = async (id: string) => {
          const { rows } = await db.pool.query<{ ok: boolean }>("SELECT pg_try_advisory_lock(hashtextextended('note:' || $1, 0)) AS ok", [id]);
          if (rows[0]?.ok === true) await db.pool.query("SELECT pg_advisory_unlock(hashtextextended('note:' || $1, 0))", [id]);
          return rows[0]?.ok === true;
        };
        lockedElsewhere = await tryLock(n.away);
        freeElsewhere = await tryLock(n.homeless); // CONTROL: a note the run is not on is free
      },
    });
    expect(result).toMatchObject({ ran: true, entities: 2 }); // away (TP) and inheritAway (TWS)
    expect(lockedElsewhere).toBe(false);
    expect(freeElsewhere).toBe(true);

    expect(await hitsFor('licence')).toEqual([]);
    expect(await correctWords(db.pool, W2, ['licenc'])).toBeNull();
    // CONTROL: the same note is still found by its W2 ticket's word, and that word is still corrected to.
    const zanzibar = await hitsFor('zanzibar');
    expect(zanzibar.map((hit) => hit.noteId)).toContain(n.away);
    expect(zanzibar.find((hit) => hit.noteId === n.away)?.attachedTicketKeys).toHaveLength(1);
    expect(await correctWords(db.pool, W2, ['zanzibr'])).toEqual([["'zanzibar'"]]);
    // Only cross-workspace notes were re-derived: the sentinel in a W2-only note's row is still there.
    const sentinel = await db.pool.query('SELECT 1 FROM proj_note_search WHERE note_id = $1 AND ticket_text LIKE $2', [n.inheritHome, '%sentinelword']);
    expect(sentinel.rowCount).toBe(1);

    // The marker: a second boot does no work.
    expect(await backfillNoteSearchBinds(db.pool)).toMatchObject({ ran: false, entities: 0 });
    const marker = await db.pool.query<{ entities: string }>("SELECT entities FROM projection_backfills WHERE name = 'proj_note_search:workspace-bind'");
    expect(marker.rows.map((row) => Number(row.entities))).toEqual([2]);
  });
});

describe('18.523 a WS project\'s state reaches no note of W2', () => {
  it('18.523 the project-delete preview counts the WS note homed in it and not the W2 note moved under it', async () => {
    const items = await readDeletedItems(db.pool, world.ids.owner);
    const binned = items.find((item) => item.kind === 'project' && item.id === PX);
    expect(binned?.containedCount).toBe(1); // n.inPX, the same-workspace note (a count of 0 would mean nothing is counted)
  });

  it('18.523 the W2 note moved under the deleted WS project is listed, reads as workspace level, and its author may still change it; the WS note in that project is refused by the lifecycle gate', async () => {
    const eff = await effOf(author(), W2);
    const listed = await listNotes(db.pool, eff, author(), W2);
    expect(listed.find((s) => s.noteId === n.homeless)?.homeProjectId).toBe(''); // CONTROL: a note with no home project
    expect(listed.find((s) => s.noteId === n.movedX)?.homeProjectId).toBe('');

    const rename = (workspaceId: string, noteId: string) =>
      checkPermission(
        makeEnvelope({ type: 'note.renamed', payload: { title: 'x' }, entity: { kind: 'note', id: noteId }, workspaceId, actorId: author(), origin: 'web' }),
        { db: db.pool, sessionUserId: author() },
      );
    expect(await rename(world.WS, n.inPX)).toEqual({
      refused: true,
      rule: 'lifecycle.state',
      reason: 'This project is deleted. Restore it from Deleted items on your Account page first.',
    });
    expect(await rename(W2, n.movedX)).toBeNull();
  });

  it('18.523 a note of W2 homed in a project of WS reads exactly as a note with no home project, whether that project is live or PURGED (it survived the purge): no dangling id in the list, the detail, a filter, search or the graph', async () => {
    // The purge erased the WS note homed in PY (CONTROL: it ran) and not the W2 one.
    expect((await db.pool.query('SELECT 1 FROM proj_notes WHERE note_id = $1', [n.inPY])).rowCount).toBe(0);
    expect((await db.pool.query('SELECT 1 FROM events WHERE entity_id = $1', [n.movedY])).rowCount).toBeGreaterThan(0);

    const eff = await effOf(author(), W2);
    const homeless = await getNoteDetail(db.pool, eff, author(), n.homeless);
    expect(homeless?.homeProjectId).toBe(''); // CONTROL
    for (const id of [n.movedL, n.movedY]) {
      expect((await getNoteDetail(db.pool, eff, author(), id))?.homeProjectId).toBe('');
      expect((await listNotes(db.pool, eff, author(), W2)).find((s) => s.noteId === id)?.homeProjectId).toBe('');
      expect((await ring(id, ['projects']))?.center.projectId).toBeNull();
    }
    const atWorkspaceLevel = (await listNotes(db.pool, eff, author(), W2, { homeProjectId: '' })).map((s) => s.noteId);
    expect(atWorkspaceLevel).toEqual(expect.arrayContaining([n.homeless, n.movedL, n.movedY]));
    expect(await listNotes(db.pool, eff, author(), W2, { homeProjectId: world.P })).toEqual([]);
    expect(await listNotes(db.pool, eff, author(), W2, { homeProjectId: P2 })).not.toEqual([]); // CONTROL
    const moved = (await hitsFor('moved')).filter((hit) => hit.noteId === n.movedL || hit.noteId === n.movedY);
    expect(moved.map((hit) => hit.homeProjectId)).toEqual(['', '']);
  });
});
