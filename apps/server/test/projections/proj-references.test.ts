import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { rebuildProjection } from '../../src/projections/rebuild.js';
import { referencesProjection } from '../../src/projections/references.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { projectCreated, seedWorkspace, TYPE_ID } from '../purge/world.js';

let db: TestDatabase;
let WS = '';
let ACTOR = '';
const PID = newUlid();
beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
  // `proj_tickets` folds `ticket.created` through the engine: it needs a real workflow, ticket type and project.
  const base = await seedWorkspace(db.pool);
  WS = base.WS;
  ACTOR = base.OWNER;
  await applyCommitted(db.pool, [projectCreated(base, PID, 'Refs', 'RF')]);
});
afterAll(async () => {
  await db.drop();
});

const text = (value: string) => ({ type: 'text', text: value });
const body = (...inline: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: inline }] });
const chip = (ticketId: string) => ({ type: 'ticketRef', attrs: { ticketId, projectId: PID, key: 'GN-1', title: 'Chiller' } });
const link = (noteId: string) => ({ type: 'wikiLink', attrs: { noteId, title: 'Rulings' } });
const ev = (kind: 'ticket' | 'note', id: string, type: string, payload: unknown, extra: Partial<LedgerEvent> = {}) =>
  makeCommitted({ workspaceId: WS, actorId: ACTOR, entity: { kind, id }, type, payload, ...extra });

type Row = { source_kind: string; source_id: string; source_parent_kind: string; source_parent_id: string; target_kind: string; target_id: string; ordinal: number; snippet: string };
async function rowsOf(parentId: string): Promise<Row[]> {
  const { rows } = await db.pool.query<Row>(
    `SELECT source_kind, source_id, source_parent_kind, source_parent_id, target_kind, target_id, ordinal, snippet
       FROM proj_references WHERE source_parent_id = $1 ORDER BY source_kind, source_id, ordinal`,
    [parentId],
  );
  return rows;
}

describe('27.106 a description is indexed at birth and REPLACED by every description claim', () => {
  it('27.106 created → field_set → the same field_set again → null; never more rows than the body holds', async () => {
    const T = newUlid(), A = newUlid(), B = newUlid();
    await applyCommitted(db.pool, [ev('ticket', T, 'ticket.created', { typeId: TYPE_ID, projectId: PID, parentId: null, title: 't', description: body(chip(A)) })]);
    expect((await rowsOf(T)).map((r) => [r.source_kind, r.target_id])).toEqual([['ticket', A]]);
    const next = body(chip(B), text(' and '), chip(A));
    await applyCommitted(db.pool, [ev('ticket', T, 'ticket.field_set', { fieldId: 'description', value: next })]);
    await applyCommitted(db.pool, [ev('ticket', T, 'ticket.field_set', { fieldId: 'description', value: next })]); // CONTROL: same body twice
    expect((await rowsOf(T)).map((r) => [r.ordinal, r.target_id])).toEqual([[0, B], [1, A]]);
    await applyCommitted(db.pool, [ev('ticket', T, 'ticket.field_set', { fieldId: 'title', value: 'renamed' })]); // not a body
    expect(await rowsOf(T)).toHaveLength(2);
    await applyCommitted(db.pool, [ev('ticket', T, 'ticket.field_set', { fieldId: 'description', value: null })]);
    expect(await rowsOf(T)).toEqual([]);
  });
});

describe('27.107 a note body is indexed at birth and by note.body_set', () => {
  it('27.107 created with a body, then body_set; the source and the parent are the note', async () => {
    const N = newUlid(), T = newUlid();
    await applyCommitted(db.pool, [ev('note', N, 'note.created', { title: 'n', homeProjectId: '', scope: { mode: 'workspace' }, body: body(chip(T)) })]);
    expect((await rowsOf(N)).map((r) => [r.source_kind, r.source_id, r.source_parent_kind, r.target_kind])).toEqual([['note', N, 'note', 'ticket']]);
    await applyCommitted(db.pool, [ev('note', N, 'note.body_set', { body: body(text('nothing')) })]);
    expect(await rowsOf(N)).toEqual([]);
  });
});

describe('27.108 comments on a ticket and on a note: added, edited, deleted', () => {
  it('27.108 the comment is the source, its ticket or note the parent; edit replaces, delete removes', async () => {
    const T = newUlid(), N = newUlid(), X = newUlid(), Y = newUlid();
    const onTicket = ev('ticket', T, 'comment.added', { body: body(link(X)) });
    const onNote = ev('note', N, 'comment.added', { body: body(chip(X)) });
    await applyCommitted(db.pool, [onTicket, onNote]);
    expect((await rowsOf(T)).map((r) => [r.source_kind, r.source_id, r.source_parent_kind])).toEqual([['comment', onTicket.id, 'ticket']]);
    expect((await rowsOf(N)).map((r) => [r.source_kind, r.source_id, r.source_parent_kind])).toEqual([['comment', onNote.id, 'note']]);
    await applyCommitted(db.pool, [ev('ticket', T, 'comment.edited', { commentId: onTicket.id, body: body(link(Y)) })]);
    expect((await rowsOf(T)).map((r) => r.target_id)).toEqual([Y]);
    await applyCommitted(db.pool, [ev('ticket', T, 'comment.deleted', { commentId: onTicket.id })]);
    expect(await rowsOf(T)).toEqual([]);
    expect(await rowsOf(N)).toHaveLength(1); // CONTROL: the other parent's comment is untouched
  });
});

describe('27.109 a creation with no description, a redacted creation and a non-body event write nothing', () => {
  it('27.109 ticket.created with no description: no rows; with one: a row (control)', async () => {
    const T = newUlid(), U = newUlid();
    await applyCommitted(db.pool, [
      ev('ticket', T, 'ticket.created', { typeId: TYPE_ID, projectId: PID, parentId: null, title: 't' }),
      ev('ticket', U, 'ticket.created', { typeId: TYPE_ID, projectId: PID, parentId: null, title: 'u', description: body(chip(T)) }),
    ]);
    expect(await rowsOf(T)).toEqual([]);
    expect(await rowsOf(U)).toHaveLength(1);
  });

  it('27.109 a REDACTED ticket.created and a transition comment are not bodies (apply called directly: the redaction trigger admits only purge_ledger)', async () => {
    const R = newUlid(), X = newUlid();
    const client = await db.pool.connect();
    try {
      // A redacted creation that still carried a description key would be a forged row; apply must ask isRedactedTicketCreated first.
      await referencesProjection.apply(ev('ticket', R, 'ticket.created', { projectId: PID, purged: true, description: body(chip(X)) }), client);
      // `ticket.transitioned`'s comment: copy the payload shape from `ticketTransitionedPayload` in
      // packages/domain/src/events/ticket-events.ts (its comment is plain `{ text }`), with chip-like text.
      await referencesProjection.apply(ev('ticket', R, 'ticket.transitioned', { toStateId: 's2', comment: { text: `see GN-1 ${X}` } }), client);
      expect(await rowsOf(R)).toEqual([]);
      // CONTROL: the same direct call with a real description writes a row.
      await referencesProjection.apply(ev('ticket', R, 'ticket.field_set', { fieldId: 'description', value: body(chip(X)) }), client);
      expect(await rowsOf(R)).toHaveLength(1);
    } finally {
      // These rows have no ledger event: remove them, or 27.112's rebuild-equals-live comparison fails on them.
      await client.query('DELETE FROM proj_references WHERE source_id = $1', [R]);
      client.release();
    }
  });
});

describe('27.110 trash keeps the rows; restore changes nothing', () => {
  it('27.110 ticket.deleted / note.deleted and their restores leave every row in place', async () => {
    const T = newUlid(), N = newUlid(), X = newUlid();
    await applyCommitted(db.pool, [
      ev('ticket', T, 'ticket.created', { typeId: TYPE_ID, projectId: PID, parentId: null, title: 't', description: body(chip(X)) }),
      ev('note', N, 'note.created', { title: 'n', homeProjectId: '', scope: { mode: 'workspace' }, body: body(chip(X)) }),
    ]);
    await applyCommitted(db.pool, [ev('ticket', T, 'ticket.deleted', {}), ev('note', N, 'note.deleted', {})]);
    expect([(await rowsOf(T)).length, (await rowsOf(N)).length]).toEqual([1, 1]);
    await applyCommitted(db.pool, [ev('ticket', T, 'ticket.restored', {}), ev('note', N, 'note.restored', {})]);
    expect([(await rowsOf(T)).length, (await rowsOf(N)).length]).toEqual([1, 1]);
  });
});

describe('27.112 the rebuild equals the live table', () => {
  it('27.112 rebuildProjection reproduces every row, and verifyProjections is clean', async () => {
    const before = (await db.pool.query('SELECT * FROM proj_references ORDER BY source_kind, source_id, ordinal')).rows;
    expect(before.length).toBeGreaterThan(0); // CONTROL: the cases above wrote rows
    // A row no ledger event wrote: only `reset` (TRUNCATE) removes it, so a rebuild whose reset does nothing is caught here.
    await db.pool.query(
      `INSERT INTO proj_references (workspace_id, source_kind, source_id, source_parent_kind, source_parent_id, target_kind, target_id, ordinal, snippet, updated_by, updated_at, seq)
       VALUES ($1, 'note', $2, 'note', $2, 'ticket', $3, 0, 'ghost', $4, now(), 1)`,
      [WS, newUlid(), newUlid(), ACTOR],
    );
    expect((await db.pool.query('SELECT 1 FROM proj_references')).rowCount).toBe(before.length + 1); // CONTROL: the ghost is there
    await rebuildProjection('proj_references', { pool: db.pool, projections: buildProjectionRegistry() });
    const after = (await db.pool.query('SELECT * FROM proj_references ORDER BY source_kind, source_id, ordinal')).rows;
    expect(after).toEqual(before);
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});
