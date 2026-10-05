import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { PURGE_TABLE_RULES } from '../../src/purge/table-rules.js';
import { runSuggestionJob } from '../../src/semantic/suggestion-job.js';
import { itemHash, itemKey, signatureOf } from '../../src/semantic/signature.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';
import { dueAt, recordingStore } from '../purge/world.js';

/**
 * Knowledge Graph spec D §4.1/§4.3 (KG-D Task 5): the suggestion job's database plumbing, cases 27.485 and 27.487–27.490
 * (`test-cases/27-knowledge-graph.md` §27.D). What vectors MEAN is Task 1's (`pipeline.test.ts`, `quality.test.ts`);
 * here every vector is a basis direction written straight into the chunk tables, so the clusters are certain.
 *
 * The world is `seedNotesFixture` (real events through the real projections, so `verifyProjections` agrees), and each
 * case seeds its OWN tickets: a ticket with no chunk row is no item of the job, so the fixture's TP and TE and every
 * earlier case's tickets that this case does not re-chunk stay out of its counts (`clearCache` empties the chunk
 * tables and the suggestions between cases).
 */
let db: TestDatabase;
let world: NotesFixture;

function rejection(workspaceId: string, signature: string, itemHashes: string[], actorId: string, origin: LedgerEvent['origin'] = 'mcp'): LedgerEvent {
  return makeCommitted({
    workspaceId,
    actorId,
    origin,
    entity: { kind: 'workspace', id: workspaceId },
    type: 'workspace.concept_suggestion_rejected',
    payload: { signature, itemHashes },
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedNotesFixture(db.pool);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

const DIM = 512;
/** A unit basis vector: two different indices are orthogonal (cosine 0, below any τ), equal ones identical. */
function basis(index: number): Float32Array {
  const vector = new Float32Array(DIM);
  vector[index] = 1;
  return vector;
}
const pgVector = (vector: Float32Array): string => `[${Array.from(vector).join(',')}]`;

/** One chunk row per item, as the embed worker writes them (`search_item_chunks`, `search_note_chunks`). */
async function chunkTicket(ticketId: string, vector: Float32Array, text: string, workspaceId = world.WS): Promise<void> {
  await db.pool.query(
    `INSERT INTO search_item_chunks (item_kind, item_id, chunk_index, workspace_id, ticket_id, heading_path, chunk_text, model, source_hash, embedding)
     VALUES ('ticket', $1, 0, $2, $1, '', $3, 'test', 'h', $4::vector)`,
    [ticketId, workspaceId, text, pgVector(vector)],
  );
}
async function chunkNote(noteId: string, vector: Float32Array, text: string, workspaceId = world.WS): Promise<void> {
  await db.pool.query(
    `INSERT INTO search_note_chunks (note_id, chunk_index, workspace_id, heading_path, chunk_text, model, source_seq, embedding)
     VALUES ($1, 0, $2, '', $3, 'test', 1, $4::vector)`,
    [noteId, workspaceId, text, pgVector(vector)],
  );
}
/** Chunks and suggestions from an earlier case are no items of this one. */
async function clearCache(): Promise<void> {
  await db.pool.query('DELETE FROM search_item_chunks');
  await db.pool.query('DELETE FROM search_note_chunks');
  await db.pool.query('DELETE FROM sem_suggestions');
}

type Audience = 'workspace' | 'owner';
/** `n` live tickets in P. `seedNotesFixture`'s tickets resolve to `project`, so each gets the audience it is asked for. */
async function newTickets(n: number, audience: Audience): Promise<string[]> {
  const ids = Array.from({ length: n }, () => newUlid());
  await applyCommitted(
    db.pool,
    ids.flatMap((ticketId, index) => [
      makeCommitted({
        workspaceId: world.WS,
        actorId: world.ids.owner,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId: world.P, parentId: null, title: `Ticket ${String(index)}` },
      }),
      makeCommitted({
        workspaceId: world.WS,
        actorId: world.ids.owner,
        entity: { kind: 'ticket', id: ticketId },
        type: 'visibility.set',
        payload: audience === 'workspace' ? { ticketId, mode: 'workspace' } : { ticketId, mode: 'explicit', userIds: [world.ids.owner] },
      }),
    ]),
  );
  return ids;
}
function cev(conceptId: string, type: string, payload: Record<string, unknown>, workspaceId = world.WS): LedgerEvent {
  return makeCommitted({ workspaceId, actorId: world.ids.owner, entity: { kind: 'concept', id: conceptId }, type, payload });
}

type Row = { id: string; signature: string; partition_key: string; item_kind: string[]; item_id: string[]; item_hashes: string[] };
async function suggestionRows(workspaceId = world.WS): Promise<Row[]> {
  return (
    await db.pool.query<Row>(
      'SELECT id, signature, partition_key, item_kind, item_id, item_hashes FROM sem_suggestions WHERE workspace_id = $1 ORDER BY partition_key, signature',
      [workspaceId],
    )
  ).rows;
}
const sorted = (values: readonly string[]): string[] => [...values].sort();

describe('27.485 the rejection projection and the three tables', () => {
  it('27.485 the three tables have their purge rules; a rejection lands with its actor, hashes and origin; control: verifyProjections agrees', async () => {
    expect(PURGE_TABLE_RULES['sem_suggestions']).toMatchObject({ rule: 'rederive', by: ['workspace_id'] });
    expect(PURGE_TABLE_RULES['proj_concept_rejections']).toMatchObject({ rule: 'erase', by: ['workspace_id'] });
    expect(PURGE_TABLE_RULES['sem_job_state']).toMatchObject({ rule: 'erase', by: ['workspace_id'] });

    const keys = [newUlid(), newUlid(), newUlid()].map((id) => itemKey('ticket', id));
    const hashes = keys.map(itemHash);
    const event = rejection(world.WS, signatureOf(keys), hashes, world.ids.memberIn);
    await applyCommitted(db.pool, [event]);
    const { rows } = await db.pool.query<{ signature: string; item_hashes: string[]; rejected_by: string; rejected_at: Date; origin: string }>(
      'SELECT signature, item_hashes, rejected_by, rejected_at, origin FROM proj_concept_rejections WHERE workspace_id = $1',
      [world.WS],
    );
    expect(rows).toEqual([
      { signature: signatureOf(keys), item_hashes: hashes, rejected_by: world.ids.memberIn, rejected_at: new Date(event.serverTime), origin: 'mcp' },
    ]);
    // A replay that wrote another `rejected_at` (or skipped the row) would differ from live.
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});

describe('27.487 the job never clusters across audiences', () => {
  it('27.487 identical vectors in two audiences give two rows, an inherit note follows its unembedded ticket, dead items are none; control: one audience gives one row', async () => {
    await clearCache();
    const W = await newTickets(4, 'workspace');
    const E = await newTickets(4, 'owner');
    // TU: live, explicit [owner], and NOT embedded. The inherit note N is pinned to it, so N's audience is TU's.
    const [TU] = (await newTickets(1, 'owner')) as [string];
    const [WT] = await newTickets(1, 'workspace'); // trashed below: its chunks stay, it is no item
    const [WE] = await newTickets(1, 'workspace'); // its only chunk is empty text: no item
    const N = newUlid();
    const ND = newUlid(); // a deleted workspace note: no item
    const other = newUlid();
    const NX = newUlid(); // a workspace note in ANOTHER workspace: no item here
    const noteEv = (workspaceId: string, id: string, type: string, payload: unknown) =>
      makeCommitted({ workspaceId, actorId: world.ids.author, entity: { kind: 'note', id }, type, payload });
    await applyCommitted(db.pool, [
      noteEv(world.WS, N, 'note.created', { title: 'Pinned', homeProjectId: world.P, scope: { mode: 'inherit' }, attachTicketId: TU }),
      noteEv(world.WS, ND, 'note.created', { title: 'Gone', homeProjectId: world.P, scope: { mode: 'workspace' } }),
      noteEv(world.WS, ND, 'note.deleted', {}),
      noteEv(other, NX, 'note.created', { title: 'Elsewhere', homeProjectId: '', scope: { mode: 'workspace' } }),
      makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'ticket', id: WT as string }, type: 'ticket.deleted', payload: {} }),
    ]);
    const text = 'licence renewal permit';
    for (const id of [...W, ...E, WT as string]) await chunkTicket(id, basis(0), text);
    await chunkTicket(WE as string, basis(0), '');
    await chunkNote(N, basis(0), text);
    await chunkNote(ND, basis(0), text);
    await chunkNote(NX, basis(0), text, other);
    expect((await db.pool.query('SELECT 1 FROM proj_notes WHERE note_id = $1 AND deleted', [ND])).rows).toHaveLength(1);
    expect((await db.pool.query('SELECT 1 FROM proj_tickets WHERE ticket_id = $1 AND deleted_at IS NOT NULL', [WT])).rows).toHaveLength(1);
    expect((await db.pool.query('SELECT 1 FROM proj_notes WHERE note_id = $1', [NX])).rows).toHaveLength(1);

    await runSuggestionJob(db.pool, world.WS);
    const rows = await suggestionRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.partition_key)).toEqual([`e:${world.ids.owner}`, 'w']);
    const [ownerRow, workspaceRow] = rows as [Row, Row];
    expect(sorted(ownerRow.item_id)).toEqual(sorted([...E, N]));
    expect(ownerRow.item_kind[ownerRow.item_id.indexOf(N)]).toBe('note');
    expect(sorted(workspaceRow.item_id)).toEqual(sorted(W));
    expect(workspaceRow.item_kind).toEqual(['ticket', 'ticket', 'ticket', 'ticket']);

    // Control: the same eight tickets in ONE audience are one suggestion (N stays with TU, alone, below the minimum).
    await applyCommitted(
      db.pool,
      E.map((ticketId) =>
        makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'ticket', id: ticketId }, type: 'visibility.set', payload: { ticketId, mode: 'workspace' } }),
      ),
    );
    await runSuggestionJob(db.pool, world.WS);
    const after = await suggestionRows();
    expect(after).toHaveLength(1);
    expect(after[0]?.partition_key).toBe('w');
    expect(sorted(after[0]?.item_id ?? [])).toEqual(sorted([...W, ...E]));
  });
});

describe('27.488 suggestion ids are stable across runs', () => {
  it('27.488 a re-run keeps the id; a group that loses an item is a new row and the old one is gone; another workspace\'s row stays', async () => {
    await clearCache();
    const T = await newTickets(4, 'workspace');
    for (const id of T) await chunkTicket(id, basis(1), 'invoice july share');
    await runSuggestionJob(db.pool, world.WS);
    const first = await suggestionRows();
    expect(first).toHaveLength(1);
    // Another workspace's cached row, which no run here may touch.
    const otherWs = newUlid();
    await db.pool.query(
      `INSERT INTO sem_suggestions (id, workspace_id, signature, partition_key, item_kind, item_id, item_hashes, terms, label, score, computed_at)
       VALUES ($1, $2, 'other', 'w', '{ticket}', '{x}', '{h}', '{}', '', 0, now())`,
      [newUlid(), otherWs],
    );
    await runSuggestionJob(db.pool, world.WS);
    const second = await suggestionRows();
    expect(second).toHaveLength(1);
    expect(second[0]?.id).toBe(first[0]?.id);
    expect(second[0]?.signature).toBe(first[0]?.signature);

    await db.pool.query('UPDATE search_item_chunks SET embedding = $2::vector WHERE item_id = $1', [T[3], pgVector(basis(2))]);
    await runSuggestionJob(db.pool, world.WS);
    const moved = await suggestionRows();
    expect(moved).toHaveLength(1);
    expect(moved[0]?.signature).not.toBe(first[0]?.signature);
    expect(sorted(moved[0]?.item_id ?? [])).toEqual(sorted(T.slice(0, 3)));
    expect(await suggestionRows(otherWs)).toHaveLength(1);
  });
});

describe('27.489 a rejection suppresses its group, in its own workspace only', () => {
  it('27.489 R rejected here, Q rejected in another workspace: Q alone is written; control: R changed by more than half is written again', async () => {
    await clearCache();
    const R = await newTickets(4, 'workspace');
    const Q = await newTickets(4, 'workspace');
    for (const id of R) await chunkTicket(id, basis(3), 'gst filing return');
    for (const id of Q) await chunkTicket(id, basis(4), 'staff rota shift');
    await runSuggestionJob(db.pool, world.WS);
    const both = await suggestionRows();
    expect(both).toHaveLength(2);
    const rRow = both.find((row) => row.item_id.includes(R[0] as string)) as Row;
    const qRow = both.find((row) => row.item_id.includes(Q[0] as string)) as Row;
    expect(sorted(rRow.item_id)).toEqual(sorted(R));
    expect(sorted(qRow.item_id)).toEqual(sorted(Q));

    await applyCommitted(db.pool, [
      rejection(world.WS, rRow.signature, rRow.item_hashes, world.ids.memberIn),
      rejection(newUlid(), qRow.signature, qRow.item_hashes, world.ids.memberIn),
    ]);
    await runSuggestionJob(db.pool, world.WS);
    const rejected = await suggestionRows();
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.signature).toBe(qRow.signature);

    // Control: three of R's four replaced (1 shared of 7) is more than half changed, so it is suggested again.
    await db.pool.query('DELETE FROM search_item_chunks WHERE item_id = ANY ($1::text[])', [R.slice(1)]);
    const fresh = await newTickets(3, 'workspace');
    for (const id of fresh) await chunkTicket(id, basis(3), 'gst filing return');
    await runSuggestionJob(db.pool, world.WS);
    const again = await suggestionRows();
    expect(again).toHaveLength(2);
    expect(again.map((row) => sorted(row.item_id))).toContainEqual(sorted([R[0] as string, ...fresh]));
  });
});

describe('27.490 a group already half tagged into one live concept is not suggested', () => {
  it('27.490 2 of 4 tagged → no row; control: 1 of 4, a deleted concept, and another workspace\'s concept do not suppress', async () => {
    await clearCache();
    const C = await newTickets(4, 'workspace');
    for (const id of C) await chunkTicket(id, basis(5), 'courier parcel delivery');
    const K = newUlid();
    const tag = (conceptId: string, itemId: string, workspaceId = world.WS) => cev(conceptId, 'concept.item_tagged', { itemKind: 'ticket', itemId }, workspaceId);
    // A live concept in ANOTHER workspace whose rows name two of the four (a state no door writes): not this workspace's.
    const elsewhere = newUlid();
    const KX = newUlid();
    await applyCommitted(db.pool, [
      cev(KX, 'concept.created', { name: 'Elsewhere' }, elsewhere),
      tag(KX, C[0] as string, elsewhere),
      tag(KX, C[1] as string, elsewhere),
      cev(K, 'concept.created', { name: 'Parcels' }),
      tag(K, C[0] as string),
    ]);
    await runSuggestionJob(db.pool, world.WS);
    expect(await suggestionRows()).toHaveLength(1); // 1 of 4

    await applyCommitted(db.pool, [tag(K, C[1] as string)]);
    await runSuggestionJob(db.pool, world.WS);
    expect(await suggestionRows()).toHaveLength(0); // 2 of 4

    await applyCommitted(db.pool, [cev(K, 'concept.deleted', {})]);
    expect((await db.pool.query('SELECT 1 FROM proj_concept_items WHERE concept_id = $1', [K])).rows).toHaveLength(2); // the rows stay
    await runSuggestionJob(db.pool, world.WS);
    const rows = await suggestionRows();
    expect(rows).toHaveLength(1);
    expect(sorted(rows[0]?.item_id ?? [])).toEqual(sorted(C));
  });
});

// LAST in the file: a purge appends its own events, which `makeCommitted`'s process-local counter never saw.
describe('27.485 a purge erases the cached suggestions that name the purged item', () => {
  it('27.485 purging TP takes the row naming TP, purging nProject the row naming it; control: the row naming neither stays', async () => {
    const { TP } = world;
    const { nProject } = world.NOTES;
    const cached = async (label: string, itemKinds: string[], itemIds: string[]) =>
      db.pool.query(
        `INSERT INTO sem_suggestions (id, workspace_id, signature, partition_key, item_kind, item_id, item_hashes, terms, label, score, computed_at)
         VALUES ($1, $2, $3, 'p', $4, $5, '{}', '{}', $3, 0, now())`,
        [newUlid(), world.WS, label, itemKinds, itemIds],
      );
    await clearCache();
    await cached('names-tp', ['ticket', 'ticket'], [newUlid(), TP]);
    await cached('names-note', ['note', 'ticket'], [nProject, newUlid()]);
    await cached('names-neither', ['ticket', 'note'], [newUlid(), newUlid()]);
    const labels = async () => (await db.pool.query<{ label: string }>('SELECT label FROM sem_suggestions WHERE workspace_id = $1 ORDER BY label', [world.WS])).rows.map((row) => row.label);
    const deps = (now: Date) => ({ projections: buildProjectionRegistry(), store: recordingStore(), now });
    const nextWorkspaceSeq = async () =>
      (await db.pool.query<{ n: number }>('SELECT max(workspace_seq)::int + 1 AS n FROM events WHERE workspace_id = $1', [world.WS])).rows[0]?.n ?? 1;
    const onEntity = (kind: 'ticket' | 'note', id: string, type: string, extra: Partial<LedgerEvent> = {}) =>
      makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind, id }, type, payload: {}, ...extra });

    await applyCommitted(db.pool, [onEntity('ticket', TP, 'ticket.deleted', { workspaceSeq: await nextWorkspaceSeq() })]);
    await applyCommitted(db.pool, [onEntity('ticket', TP, 'purge.marked', { workspaceSeq: await nextWorkspaceSeq() })]);
    expect((await purgeItem(db.pool, { kind: 'ticket', id: TP }, deps(await dueAt(db.pool, 'ticket', TP)))).status).toBe('purged');
    expect(await labels()).toEqual(['names-neither', 'names-note']);

    await applyCommitted(db.pool, [onEntity('note', nProject, 'note.deleted', { workspaceSeq: await nextWorkspaceSeq() })]);
    await applyCommitted(db.pool, [onEntity('note', nProject, 'purge.marked', { workspaceSeq: await nextWorkspaceSeq() })]);
    expect((await purgeItem(db.pool, { kind: 'note', id: nProject }, deps(await dueAt(db.pool, 'note', nProject)))).status).toBe('purged');
    expect(await labels()).toEqual(['names-neither']);
  });
});
