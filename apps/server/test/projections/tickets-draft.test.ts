import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { rowToTicketState } from '../../src/projections/tickets.js';
import { buildLedgerDeps } from '../../src/sync/ledger-deps.js';
import { foldTicketHead } from '../../src/sync/snapshot-writer.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Drafts T3 (spec §2.3, §7.1, §11): `proj_tickets.draft_author_id/draft_at/draft_discarded` and
 * `proj_visibility.draft_author_id` carry `TicketState.draft`, and `rowToTicketState` maps them back to the
 * reducer's exact state (case 28.045). The head (one workflow, one type, `rowFor`) is `tickets-closed.test.ts`'s.
 */

let db: TestDatabase;

const WS = newUlid();
const PRJ = newUlid();
const WF = newUlid();
const TYPE_ID = 'draft-spec-task';

beforeAll(async () => {
  db = await createTestDatabase();

  // One workflow, one type, shared by both cases below — neither mutates the
  // other's ticket, so declaration order does not matter.
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId: WS,
      actorId: newUlid(),
      entity: { kind: 'workflow', id: WF },
      type: 'workflow.defined',
      payload: {
        id: WF,
        version: 1,
        name: 'Draft-spec flow',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'doing', name: 'Doing', category: 'active' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [
          { from: '*', to: 'todo', rules: [] },
          { from: '*', to: 'doing', rules: [] },
          { from: '*', to: 'done', rules: [] },
        ],
      },
    }),
    makeCommitted({
      workspaceId: WS,
      actorId: newUlid(),
      entity: { kind: 'ticket-type', id: TYPE_ID },
      type: 'ticket-type.defined',
      payload: { id: TYPE_ID, name: 'Draft-spec task', icon: 'check', rank: 3, workflowId: WF, fields: [] },
    }),
  ]);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

/** The full row, exactly as `rowToTicketState` needs it — see that function's own note on why `SELECT *` is the shape every reader of this table uses. */
async function rowFor(ticketId: string) {
  const { rows } = await db.pool.query('SELECT * FROM proj_tickets WHERE ticket_id = $1', [ticketId]);
  return rows[0];
}

const AUTHOR = newUlid();
const visRow = async (id: string) =>
  (await db.pool.query('SELECT * FROM proj_visibility WHERE ticket_id = $1', [id])).rows[0];
const born = (id: string, extra: Record<string, unknown> = {}) =>
  makeCommitted({
    workspaceId: WS, actorId: AUTHOR, entity: { kind: 'ticket', id }, type: 'ticket.created',
    payload: { typeId: TYPE_ID, projectId: PRJ, parentId: null, title: `t-${id}`, ...extra },
  });

describe('28.045 the projections carry the draft flag', () => {
  it('a draft sets the columns in both tables, the discard marks it, a publish clears all of it; the row maps to the reducer state; the ledger verifies', async () => {
    const plain = newUlid();
    const draft = newUlid();
    const published = newUlid();
    const discarded = newUlid();
    await applyCommitted(db.pool, [
      born(plain),
      born(draft, { start: 'backlog', draft: true }),
      born(published, { start: 'backlog', draft: true }),
      born(discarded, { start: 'backlog', draft: true }),
      makeCommitted({ workspaceId: WS, actorId: AUTHOR, entity: { kind: 'ticket', id: discarded }, type: 'ticket.discarded', payload: {} }),
      makeCommitted({ workspaceId: WS, actorId: AUTHOR, entity: { kind: 'ticket', id: published }, type: 'ticket.published', payload: { projectId: PRJ } }),
    ]);

    // CONTROL, same `it`: a ticket made without `draft` has NULL in every draft column of both tables.
    expect(await rowFor(plain)).toMatchObject({ draft_author_id: null, draft_at: null, draft_discarded: null });
    expect((await visRow(plain)).draft_author_id).toBeNull();

    // the author is the EVENT'S actor (the payload names no author), in both tables
    expect(await rowFor(draft)).toMatchObject({ draft_author_id: AUTHOR, draft_discarded: null });
    expect((await rowFor(draft)).draft_at).toBeInstanceOf(Date);
    expect((await visRow(draft)).draft_author_id).toBe(AUTHOR);
    expect(await rowFor(discarded)).toMatchObject({ draft_author_id: AUTHOR, draft_discarded: true });
    expect((await visRow(discarded)).draft_author_id).toBe(AUTHOR); // the erase, not the flag, deletes the row (T5)

    // a publish clears every draft column of both tables
    expect(await rowFor(published)).toMatchObject({ draft_author_id: null, draft_at: null, draft_discarded: null });
    expect((await visRow(published)).draft_author_id).toBeNull();

    // the row maps back to EXACTLY the state the reducer folds (the dual-client rig compares whole states)
    const client = await db.pool.connect();
    try {
      const deps = await buildLedgerDeps(client, WS);
      for (const id of [plain, draft, published, discarded]) {
        const folded = await foldTicketHead(client, id, deps);
        expect(rowToTicketState(await rowFor(id)), `ticket ${id}`).toEqual(folded?.state);
      }
      const mapped = rowToTicketState(await rowFor(discarded));
      expect(mapped.draft).toEqual({ authorId: AUTHOR, at: expect.any(String), discarded: true });
      expect('draft' in rowToTicketState(await rowFor(published))).toBe(false); // ABSENT, not undefined-valued
      expect('draft' in rowToTicketState(await rowFor(plain))).toBe(false);
    } finally {
      client.release();
    }

    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});
