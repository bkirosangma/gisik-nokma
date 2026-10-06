import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { foldSearchText, newUlid } from '@gisik-nokma/domain';
import { startNoteSearchBindBackfill } from '../../src/projections/backfill-note-search-binds.js';
import { backfillNoteVocabularies, startNoteVocabularyBackfill } from '../../src/projections/backfill-note-vocabularies.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { correctWords } from '../../src/read/note-search.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';
import { dueAt, recordingStore } from '../purge/world.js';

/**
 * Cases 18.526–18.530 (task/kg-vocab-rederive-all): the one-shot boot re-derive of EVERY workspace's spelling
 * vocabulary (`backfill-note-vocabularies.ts`), for the words a link written before 18.500 put in a note's workspace's
 * `proj_note_lexemes` from another workspace's ticket, once the link is gone. Lane 3's review probe of
 * task/notes-cross-workspace-followup d5be349b (roles/mut-out/xwsfu-lane3/probe-vocab-residue.test.ts) is the W2 leg.
 *
 * The OLD index's words are written DIRECTLY into `proj_note_lexemes` (and, for W3 and W8, the old `ticket_text`
 * line into the note's search row), the shape it wrote while the link stood: the new projection code never writes
 * that shape, so seeding through it would prove nothing about the production rows.
 *
 * World: the notes fixture's WS, whose ticket TP is "Renew the trade licence" and whose note nWS is linked to TP (a
 * same-workspace link: WS's `licence` is its own). Each other workspace is founded by `author`, holds one note, and
 * shows one way the link went, each with its own word for a control:
 * - W2: linked to TP, then DETACHED (the probe's shape). Own word `unlinked`.
 * - W6: linked to TP, detached, then the note DELETED: words and no search row. Own words gone with the note.
 * - W3: linked to TQ ("Quarterly walrus census", a WS ticket), which is then PURGED. Own word `harbour`.
 * - W4: as W2, then the workspace ARCHIVED. Own word `ledger`.
 * - W5: as W2, then the workspace DELETED (in the trash). Own word `pamphlet`.
 * - W8: still linked to TP: the bind re-derive's case (18.522), here for the order of the two passes. Own word `pelican`.
 * - W7: no note at all, so no word and no row.
 */
let db: TestDatabase;
let world: NotesFixture;
const W2 = newUlid();
const W3 = newUlid();
const W4 = newUlid();
const W5 = newUlid();
const W6 = newUlid();
const W7 = newUlid();
const W8 = newUlid();
const TQ = newUlid();
const n = { WS: newUlid(), W2: newUlid(), W3: newUlid(), W4: newUlid(), W5: newUlid(), W6: newUlid(), W8: newUlid() };
const MARKER = 'proj_note_lexemes:rederive-all';

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedNotesFixture(db.pool);
  const author = world.ids.author;
  const inW = (workspaceId: string) => ({ workspaceId, actorId: author });
  const founding = (w: string) => [
    makeCommitted({ ...inW(w), entity: { kind: 'workspace', id: w }, type: 'workspace.created', payload: { name: 'Elsewhere' } }),
    makeCommitted({ ...inW(w), entity: { kind: 'membership', id: `${w}:${author}` }, type: 'membership.granted', payload: { userId: author, role: 'owner' } }),
  ];
  const noteIn = (w: string, id: string, title: string) =>
    makeCommitted({ ...inW(w), entity: { kind: 'note', id }, type: 'note.created', payload: { title, homeProjectId: '', scope: { mode: 'workspace' } } });
  // The link 18.500 now refuses, as the door took it before.
  const preFixLink = (w: string, id: string, ticketId: string) =>
    makeCommitted({ ...inW(w), entity: { kind: 'note', id }, type: 'note.attached', payload: { ticketId } });
  const detach = (w: string, id: string, ticketId: string) =>
    makeCommitted({ ...inW(w), entity: { kind: 'note', id }, type: 'note.detached', payload: { ticketId } });
  const inWS = { workspaceId: world.WS, actorId: world.ids.owner };

  await applyCommitted(db.pool, [
    makeCommitted({ ...inWS, entity: { kind: 'ticket', id: TQ }, type: 'ticket.created', payload: { typeId: 'task', projectId: world.P, parentId: null, title: 'Quarterly walrus census' } }),
    makeCommitted({ ...inWS, actorId: author, entity: { kind: 'note', id: n.WS }, type: 'note.created', payload: { title: 'Paperwork', homeProjectId: world.P, scope: { mode: 'workspace' } } }),
    makeCommitted({ ...inWS, actorId: author, entity: { kind: 'note', id: n.WS }, type: 'note.attached', payload: { ticketId: world.TP } }),
    ...founding(W2),
    noteIn(W2, n.W2, 'Linked then unlinked'),
    preFixLink(W2, n.W2, world.TP),
    ...founding(W6),
    noteIn(W6, n.W6, 'Gone entirely'),
    preFixLink(W6, n.W6, world.TP),
    ...founding(W3),
    noteIn(W3, n.W3, 'Harbour inventory'),
    preFixLink(W3, n.W3, TQ),
    ...founding(W4),
    noteIn(W4, n.W4, 'Archived ledger'),
    preFixLink(W4, n.W4, world.TP),
    ...founding(W5),
    noteIn(W5, n.W5, 'Binned pamphlet'),
    preFixLink(W5, n.W5, world.TP),
    ...founding(W8),
    noteIn(W8, n.W8, 'Pelican crate count'),
    preFixLink(W8, n.W8, world.TP),
    ...founding(W7),
  ]);

  // What the OLD index wrote while each link stood: the ticket's words in the note's workspace's vocabulary, and for
  // W3 and W8 the ticket's line in the note's search row.
  const licence = foldSearchText('Renew the trade licence');
  const walrus = foldSearchText('Quarterly walrus census');
  const inject = (w: string, line: string) =>
    db.pool.query('INSERT INTO proj_note_lexemes (workspace_id, lexeme) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING', [w, line.split(' ')]);
  const staleRow = (noteId: string, line: string) =>
    db.pool.query("UPDATE proj_note_search SET ticket_text = ticket_text || $2 || E'\\n' WHERE note_id = $1", [noteId, line]);
  for (const w of [W2, W6, W4, W5, W8]) await inject(w, licence);
  await inject(W3, walrus);
  await staleRow(n.W3, walrus);
  await staleRow(n.W8, licence);

  // How each link went, before the deploy (the door took a detach before 18.500 bound it).
  await applyCommitted(db.pool, [
    detach(W2, n.W2, world.TP),
    detach(W6, n.W6, world.TP),
    makeCommitted({ ...inW(W6), entity: { kind: 'note', id: n.W6 }, type: 'note.deleted', payload: {} }),
    detach(W4, n.W4, world.TP),
    makeCommitted({ ...inW(W4), entity: { kind: 'workspace', id: W4 }, type: 'workspace.archived', payload: {} }),
    detach(W5, n.W5, world.TP),
    makeCommitted({ ...inW(W5), entity: { kind: 'workspace', id: W5 }, type: 'workspace.deleted', payload: {} }),
    makeCommitted({ ...inWS, entity: { kind: 'ticket', id: TQ }, type: 'ticket.deleted', payload: {} }),
    makeCommitted({ ...inWS, entity: { kind: 'ticket', id: TQ }, type: 'purge.marked', payload: {} }),
  ]);
  const purged = await purgeItem(db.pool, { kind: 'ticket', id: TQ }, { projections: buildProjectionRegistry(), store: recordingStore(), now: await dueAt(db.pool, 'ticket', TQ) });
  expect(purged.status).toBe('purged');
}, 120_000);

afterAll(async () => {
  await db.drop();
});

const corrects = (workspaceId: string, word: string) => correctWords(db.pool, workspaceId, [word]);
const markerRows = async () =>
  (await db.pool.query<{ entities: string }>('SELECT entities FROM projection_backfills WHERE name = $1', [MARKER])).rows.map((row) => Number(row.entities));
/** True when the key was free (taken and given back at once); false when another session holds it. */
const tryLock = async (key: string) => {
  const { rows } = await db.pool.query<{ ok: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok', [key]);
  if (rows[0]?.ok === true) await db.pool.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key]);
  return rows[0]?.ok === true;
};
const sleep = (ms: number) => new Promise<'waited'>((resolve) => setTimeout(() => resolve('waited'), ms));
const gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
};
/** The workspaces that hold a word or a row, which the pass must visit: every one but W7. */
const holders = () => [world.WS, W2, W3, W4, W5, W6, W8].sort();

describe('the residue is there before the pass (the haystacks hold their subjects)', () => {
  it('18.526 18.527 each workspace whose link went corrects to the other workspace\'s word, and the purge re-indexed W3\'s row but left its words', async () => {
    for (const w of [W2, W6, W4, W5, W8]) expect(await corrects(w, 'licenc')).toEqual([["'licence'"]]);
    expect(await corrects(W3, 'walrs')).toEqual([["'walrus'"]]);
    // The purge's survivor re-index cleaned the ROW (the line is gone) and re-derived only WS's vocabulary.
    const row = await db.pool.query<{ ticket_text: string }>('SELECT ticket_text FROM proj_note_search WHERE note_id = $1', [n.W3]);
    expect(row.rows).toEqual([{ ticket_text: '' }]);
    // W6's only note is deleted: words, and no search row.
    expect((await db.pool.query('SELECT 1 FROM proj_note_search WHERE workspace_id = $1', [W6])).rowCount).toBe(0);
    expect(await markerRows()).toEqual([]);
  });
});

describe('18.530 it runs once, one instance at a time, and a stop leaves no marker', () => {
  it('18.530 another instance holds the run\'s lock: this one does nothing', async () => {
    const holder = await db.pool.connect();
    try {
      await holder.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [`backfill:${MARKER}`]);
      expect(await backfillNoteVocabularies(db.pool, { probe: async () => expect.unreachable() })).toEqual({ ran: false, entities: 0, ms: 0, maxEntityMs: 0 });
      await holder.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [`backfill:${MARKER}`]);
    } finally {
      holder.release();
    }
    expect(await corrects(W2, 'licenc')).toEqual([["'licence'"]]);
    expect(await markerRows()).toEqual([]);
  });

  it('18.530 a shutdown before the first workspace re-derives nothing; one after the first re-derives that one only; neither writes the marker', async () => {
    expect(await backfillNoteVocabularies(db.pool, { shouldStop: () => true })).toEqual({ ran: false, entities: 0, ms: 0, maxEntityMs: 0 });
    for (const w of [W2, W6, W4, W5, W8]) expect(await corrects(w, 'licenc')).toEqual([["'licence'"]]);
    const visited: string[] = [];
    let asked = 0;
    const partial = await backfillNoteVocabularies(db.pool, { shouldStop: () => asked++ >= 1, probe: async (w) => void visited.push(w) });
    expect(partial).toEqual({ ran: false, entities: 1, ms: 0, maxEntityMs: 0 });
    expect(visited).toEqual([holders()[0]]);
    expect(await markerRows()).toEqual([]);
  });

  it('18.530 the boot starter: stopped while it waits for the bind re-derive, it never starts; a failure is logged, never thrown, and leaves no marker', async () => {
    const waiting = gate();
    let visits = 0;
    const stopped = startNoteVocabularyBackfill(db.pool, { after: () => waiting.opened, probe: async () => void visits++ });
    stopped.run();
    const stopping = stopped.stop();
    waiting.open();
    await stopping;
    expect(visits).toBe(0);
    expect(await markerRows()).toEqual([]);

    const logs: string[] = [];
    const failing = startNoteVocabularyBackfill(db.pool, {
      after: async () => undefined,
      log: (message) => void logs.push(message),
      probe: async () => {
        throw new Error('boom at the first workspace');
      },
    });
    failing.run();
    await failing.settled();
    expect(logs).toEqual(['backfill proj_note_lexemes:rederive-all failed; the next boot re-runs it: boom at the first workspace']);
    expect(await markerRows()).toEqual([]);
  });
});

describe('the boot: the bind re-derive, then the vocabulary re-derive', () => {
  const visited: string[] = [];
  const heldWhileVisited: boolean[] = [];
  const bindMarkerWhileVisited: boolean[] = [];
  const logs: string[] = [];
  let otherWorkspaceFree: boolean | undefined;
  let raced: string | undefined;
  let markerCount: number[] | undefined;

  it('18.529 started together, as index.ts does, the vocabulary pass does not begin while the bind pass holds its first note, and begins after it ends', async () => {
    const bindHeld = gate();
    const bindReached = gate();
    const firstVisit = gate();
    const bind = startNoteSearchBindBackfill(db.pool, {
      probe: async (stage) => {
        if (stage !== 'locked') return;
        bindReached.open();
        await bindHeld.opened;
      },
    });
    const vocabulary = startNoteVocabularyBackfill(db.pool, {
      after: () => bind.settled(),
      log: (message) => void logs.push(message),
      probe: async (workspaceId) => {
        firstVisit.open();
        visited.push(workspaceId);
        heldWhileVisited.push(!(await tryLock(`workspace-seq:${workspaceId}`)));
        otherWorkspaceFree ??= await tryLock(`workspace-seq:${W7}`); // CONTROL: a workspace the run is not on is free
        const bindMarker = await db.pool.query("SELECT 1 FROM projection_backfills WHERE name = 'proj_note_search:workspace-bind'");
        bindMarkerWhileVisited.push(bindMarker.rowCount === 1);
      },
    });
    bind.run();
    vocabulary.run();
    await bindReached.opened;
    // A pass that did not wait would visit its first workspace now; this one does not within a second.
    raced = await Promise.race([firstVisit.opened.then(() => 'visited'), sleep(1_000)]);
    bindHeld.open();
    await vocabulary.settled();
    expect(raced).toBe('waited');
    expect(bindMarkerWhileVisited.length).toBeGreaterThan(0);
    expect(bindMarkerWhileVisited.every(Boolean)).toBe(true);
    // W8 was still linked: the bind pass cleaned its row, so this pass read a clean row (CONTROL: its own word stays).
    expect(await corrects(W8, 'licenc')).toBeNull();
    expect(await corrects(W8, 'pelicn')).toEqual([["'pelican'"]]);
    const markers = await db.pool.query<{ name: string }>('SELECT name FROM projection_backfills ORDER BY name');
    expect(markers.rows.map((row) => row.name)).toEqual([MARKER, 'proj_note_search:workspace-bind']);
    markerCount = await markerRows();
  });

  it('18.526 a link DETACHED before the deploy: the other workspace\'s word is no longer a correction, also where the note is deleted since; the own word and WS\'s same word still are', async () => {
    expect(await corrects(W2, 'licenc')).toBeNull();
    expect(await corrects(W2, 'unlinkd')).toEqual([["'unlinked'"]]); // CONTROL: W2's own word
    // CONTROL: the same word stays in WS, where a current row (nWS's link to its own TP) holds it.
    expect(await corrects(world.WS, 'licenc')).toEqual([["'licence'"]]);
    // W6 has no live note: its vocabulary is what a rebuild gives, nothing.
    expect(await corrects(W6, 'licenc')).toBeNull();
    expect((await db.pool.query('SELECT 1 FROM proj_note_lexemes WHERE workspace_id = $1', [W6])).rowCount).toBe(0);
  });

  it('18.527 a link whose ticket was PURGED: the purged ticket\'s word is no longer a correction in the note\'s workspace; its own word still is', async () => {
    expect(await corrects(W3, 'walrs')).toBeNull();
    expect(await corrects(W3, 'harbur')).toEqual([["'harbour'"]]); // CONTROL
  });

  it('18.528 every workspace holding a word or a note search row is visited exactly once, under its workspace lock, archived and trashed ones included; a workspace with neither is not', async () => {
    expect([...visited].sort()).toEqual(holders());
    expect(new Set(visited).size).toBe(visited.length);
    expect(visited).not.toContain(W7);
    expect(heldWhileVisited).toEqual(visited.map(() => true));
    expect(otherWorkspaceFree).toBe(true);
    // The archived W4 and the trashed W5 are cleaned like any other; their own words stay.
    expect(await corrects(W4, 'licenc')).toBeNull();
    expect(await corrects(W4, 'ledgr')).toEqual([["'ledger'"]]);
    expect(await corrects(W5, 'licenc')).toBeNull();
    expect(await corrects(W5, 'pamflet')).toEqual([["'pamphlet'"]]);
    // The marker counts the workspaces; the log says the same.
    expect(markerCount).toEqual([holders().length]);
    expect(logs).toEqual([expect.stringMatching(new RegExp(`^backfill ${MARKER}: ${holders().length} workspaces in \\d+ ms \\(longest workspace \\d+ ms\\)$`))]);
  });

  it('18.530 a second boot does no work: the marker stands, counted once', async () => {
    expect(await backfillNoteVocabularies(db.pool, { probe: async () => expect.unreachable() })).toEqual({ ran: false, entities: 0, ms: 0, maxEntityMs: 0 });
    let visits = 0;
    const again = startNoteVocabularyBackfill(db.pool, { after: async () => undefined, probe: async () => void visits++ });
    again.run();
    await again.settled();
    expect(visits).toBe(0);
    expect(await markerRows()).toEqual([holders().length]);
  });
});

describe('18.530 the result of a full run', () => {
  it('18.530 a full run on a fresh marker reports every workspace and its longest transaction', async () => {
    await db.pool.query('DELETE FROM projection_backfills WHERE name = $1', [MARKER]);
    const full = await backfillNoteVocabularies(db.pool);
    // W6 has no live note, so the first full run left it neither a word nor a row: nothing to visit now.
    const left = holders().filter((w) => w !== W6);
    expect(full.ran).toBe(true);
    expect(full.entities).toBe(left.length);
    expect(full.maxEntityMs).toBeGreaterThan(0);
    expect(full.maxEntityMs).toBeLessThanOrEqual(full.ms);
    expect(await markerRows()).toEqual([left.length]);
    // Idempotent: the same vocabularies (CONTROL words and cleaned words alike).
    expect(await corrects(W2, 'licenc')).toBeNull();
    expect(await corrects(world.WS, 'licenc')).toEqual([["'licence'"]]);
  });
});
