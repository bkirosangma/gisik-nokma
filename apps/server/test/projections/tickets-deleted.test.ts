import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { rowToTicketState } from '../../src/projections/tickets.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * `proj_tickets.deleted_at` / `deleted_by`, and the migration that adds them —
 * the sibling of `tickets-closed.test.ts`, built the same way and for the same
 * reason: this file owns the `proj_tickets` columns the delete pair writes, and
 * `rowToTicketState` is read back here rather than through a second,
 * reimplemented mapping.
 *
 * ## The three arms, and the ones that cannot be dropped
 *
 * A created ticket is `NULL`; a delete fills both columns from the ENVELOPE; a
 * restore clears both. **The middle arm is a control for the third**: without
 * it, "restore leaves them NULL" passes against a projection that never wrote
 * the columns at all. And the third is the arm an `ON CONFLICT SET` list that
 * omits these two columns cannot produce — the row would keep the delete's
 * values forever, so the ticket would stay absent from every view while
 * `TicketState.deleted` read `null`, and the undo would be a no-op that reported
 * success.
 *
 * ## `deleted_by` is the ACTOR and `deleted_at` is the CLAIM's instant
 *
 * Both are asserted against the event itself rather than against a loose
 * pattern, because the two failure modes are the ones `tickets-closed.test.ts`
 * names for the same pair: binding `deleted_by` to a neighbouring column (an
 * assignee, say) and reading a clock inside the projection (`new Date()`) both
 * produce a plausible row and both destroy the feature's only retained fact —
 * WHO deleted it, and WHEN.
 */

let db: TestDatabase;

const WS = newUlid();
const PRJ = newUlid();
const WF = newUlid();
const TYPE_ID = 'deleted-spec-task';
/** A ULID-shaped id for the hand-built row below; it names no real user. */
const OWNER_LIKE = '01J9GACT000000000000000000';

beforeAll(async () => {
  db = await createTestDatabase();

  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId: WS,
      actorId: newUlid(),
      entity: { kind: 'workflow', id: WF },
      type: 'workflow.defined',
      payload: {
        id: WF,
        version: 1,
        name: 'Deleted-spec flow',
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
      payload: { id: TYPE_ID, name: 'Deleted-spec task', icon: 'check', rank: 3, workflowId: WF, fields: [] },
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

describe('proj_tickets carries deleted_at / deleted_by, and restore clears them', () => {
  it('a created ticket has both NULL; a delete fills both from the envelope; a restore clears both', async () => {
    const ticketId = newUlid();
    const actorId = newUlid();

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.created',
        payload: { typeId: TYPE_ID, projectId: PRJ, parentId: null, title: 'Remove the thing', start: 'focus' },
      }),
    ]);
    let row = await rowFor(ticketId);
    expect(row.deleted_at).toBeNull();
    expect(row.deleted_by).toBeNull();
    // The mapping half, on the same row: `null` survives as `null` rather than
    // becoming `undefined`, which is what the dual-client rig's whole-state
    // `toEqual` compares against the reducer's own `deleted: null`.
    expect(rowToTicketState(row).deleted).toBeNull();

    // A transition first, so the fixture carries a state the delete has to
    // leave alone — the claim `packages/domain` pins at the fold and this table
    // has to agree with.
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.transitioned',
        payload: { to: 'doing' },
      }),
    ]);

    const deleteEvent = makeCommitted({
      workspaceId: WS,
      actorId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.deleted',
      payload: {},
    });
    await applyCommitted(db.pool, [deleteEvent]);

    row = await rowFor(ticketId);
    // Mutation targets, both directions: bind `deleted_by` to another column and
    // this reddens naming the actor; write `now()` and it reddens because the
    // column must carry the CLAIM's recorded instant and not the projection's.
    expect(row.deleted_by).toBe(actorId);
    expect(row.deleted_at.toISOString()).toBe(deleteEvent.serverTime);
    expect(rowToTicketState(row).deleted).toEqual({ actorId, at: deleteEvent.serverTime });
    // The state is untouched by the delete, at the row: the undo restores a
    // ticket into the state the person left it in.
    expect(row.state_id).toBe('doing');

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.restored',
        payload: {},
      }),
    ]);

    row = await rowFor(ticketId);
    // The clearing case, and the reason the `ON CONFLICT SET` list must name
    // both columns: without `deleted_at = EXCLUDED.deleted_at` /
    // `deleted_by = EXCLUDED.deleted_by`, this UPDATE leaves the row holding the
    // delete's stale values and the ticket stays absent from every view forever.
    expect(row.deleted_at).toBeNull();
    expect(row.deleted_by).toBeNull();
    expect(rowToTicketState(row).deleted).toBeNull();
    // And the row is the SAME row — a delete/restore pair must not create a
    // second one. The count is per-ticket, so it is a claim about this ticket
    // rather than about the table.
    const { rows } = await db.pool.query<{ n: string }>(
      'SELECT count(*) AS n FROM proj_tickets WHERE ticket_id = $1',
      [ticketId],
    );
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it('a PARTIAL mapping is refused: one column NULL and the other set reads as not-deleted', async () => {
    // `rowToTicketState`'s own rule, and the one an `OR` would get wrong. A row
    // with `deleted_at` set and `deleted_by` NULL is a projection/ledger
    // disagreement, not a deleted ticket — every delete writes both from one
    // envelope — and the domain type has no third value for it. Asserted
    // directly on the mapper because no event pair can produce it: that is the
    // point of asserting it here rather than hoping a fixture covers it.
    const shaped = {
      ticket_id: newUlid(),
      workspace_id: WS,
      project_id: PRJ,
      type_id: TYPE_ID,
      parent_id: null,
      workflow_id: WF,
      workflow_version: 1,
      state_id: 'todo',
      state_category: 'open' as const,
      assignee_id: null,
      collaborator_ids: [],
      rank: null,
      fields: { title: { value: 'x', actorId: OWNER_LIKE, clientTime: '2026-09-20T00:00:00.000Z', serverTime: '2026-09-20T00:00:00.000Z' } },
      transitions: [],
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      deleted_at: new Date('2026-09-20T06:00:00.000Z'),
      deleted_by: null,
      // Drafts T3: the row type carries the draft columns; this row is not a draft.
      draft_author_id: null,
      draft_at: null,
      draft_discarded: null,
      links: [],
      pending_children: [], // drafts T6 (owner ruling O1): a non-draft holds none
    };
    expect(rowToTicketState(shaped).deleted).toBeNull();
    // The positive control through the same call: set the second column and the
    // identical row maps to the object. Without it this case would pass on a
    // mapper that returned `null` unconditionally.
    expect(rowToTicketState({ ...shaped, deleted_by: OWNER_LIKE }).deleted).toEqual({
      actorId: OWNER_LIKE,
      at: '2026-09-20T06:00:00.000Z',
    });
  });
});

/**
 * The migration itself — case 3.28's sibling for `migrations.test.ts`'s
 * "migrations create …" shape. `createTestDatabase` runs `node-pg-migrate` from
 * zero, so a column asserted here exists because the migration put it there and
 * not because a fixture wrote it.
 */
describe('the deleted_at migration', () => {
  it('creates both columns as nullable, and the partial live index', async () => {
    const columns = await db.pool.query<{ column_name: string; is_nullable: string; data_type: string }>(
      `SELECT column_name, is_nullable, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'proj_tickets'
          AND column_name IN ('deleted_at', 'deleted_by')
        ORDER BY column_name`,
    );
    expect(columns.rows.map((r) => r.column_name)).toEqual(['deleted_at', 'deleted_by']);
    // Nullable, and that is the whole design: every predicate in the product is
    // `deleted_at IS NULL`, so a NOT NULL column with a default would be a
    // predicate nothing can ever be false about.
    expect(columns.rows.every((r) => r.is_nullable === 'YES')).toBe(true);
    expect(columns.rows.find((r) => r.column_name === 'deleted_at')?.data_type).toBe('timestamp with time zone');
    expect(columns.rows.find((r) => r.column_name === 'deleted_by')?.data_type).toBe('text');

    const index = await db.pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'proj_tickets_live_idx'`,
    );
    expect(index.rows).toHaveLength(1);
    // A PARTIAL index whose predicate matches the constant, asserted on the
    // `WHERE` clause rather than on the name: an index over the whole table
    // carries the same name and would satisfy a name-only check while indexing
    // exactly the rows no query wants.
    expect(index.rows[0]?.indexdef).toContain('WHERE (deleted_at IS NULL)');
    expect(index.rows[0]?.indexdef).toContain('(workspace_id, project_id)');
  });
});
