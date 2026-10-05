import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { rebuildProjection } from '../../src/projections/rebuild.js';
import { rowToTicketState } from '../../src/projections/tickets.js';
import { formatReport, verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * wtg2 T9 (workflow-timeline-graphs WP-1, ES-4, PS-2): `proj_tickets.started_at|ended_at|periods|rounds|closed_cause`,
 * written by `upsertTicket` from the reducer's fold and read back by `rowToTicketState` in the reducer's own shape
 * (`periods` and `rounds` ABSENT when empty / 1, the `links` rule the dual-client rig's `toEqual` needs).
 *
 * The harness is `tickets-rank.test.ts`'s: `applyCommitted` seeds the ledger and every projection with no rule engine,
 * so the fixtures need only be foldable. Each `it` defines its OWN workflow and type, so one case's republish never
 * moves another case's tickets; `verifyProjections` still diffs the whole database, every case's rows included.
 */

let db: TestDatabase;

const WS = newUlid();
const PRJ = newUlid();
const ACTOR = newUlid();
const DECISION = newUlid();
/** Day `n` of September at 10:00Z: the `serverTime` each step is filed at. */
const at = (n: number): string => `2026-09-0${n}T10:00:00.000Z`;
const NOT_TAKEN = { kind: 'branch-not-taken', decisionTicketId: DECISION, outcome: 'Yes', pass: 1, decidedBy: ACTOR, decisionEventId: newUlid() };
const RESET = { kind: 'reopened-by-flow', decisionTicketId: DECISION, outcome: 'No', pass: 1, decidedBy: ACTOR, decisionEventId: newUlid() };

type StateDef = { id: string; name: string; category: 'open' | 'active' | 'terminal' };
const STATES: StateDef[] = [
  { id: 'todo', name: 'To do', category: 'open' },
  { id: 'doing', name: 'Doing', category: 'active' },
  { id: 'done', name: 'Done', category: 'terminal' },
];

const workflowDefined = (wf: string, version: number, states: StateDef[]) =>
  makeCommitted({
    workspaceId: WS,
    actorId: ACTOR,
    entity: { kind: 'workflow', id: wf },
    type: 'workflow.defined',
    payload: {
      id: wf,
      version,
      name: 'Periods flow',
      initialStateId: 'todo',
      states,
      transitions: states.map((s) => ({ from: '*', to: s.id, rules: [] })),
    },
  });

let worlds = 0;
/** A fresh workflow (v1: To do, Doing, Done) and a type bound to it. */
async function world(): Promise<{ wf: string; typeId: string }> {
  worlds += 1;
  const wf = newUlid();
  const typeId = `periods-spec-task-${worlds}`;
  await applyCommitted(db.pool, [
    workflowDefined(wf, 1, STATES),
    makeCommitted({
      workspaceId: WS,
      actorId: ACTOR,
      entity: { kind: 'ticket-type', id: typeId },
      type: 'ticket-type.defined',
      payload: { id: typeId, name: 'Periods task', icon: 'check', rank: 3, workflowId: wf, fields: [] },
    }),
  ]);
  return { wf, typeId };
}

const step = (ticketId: string, type: string, payload: unknown, n: number) =>
  makeCommitted({ workspaceId: WS, actorId: ACTOR, entity: { kind: 'ticket', id: ticketId }, type, payload, serverTime: at(n) });
const created = (ticketId: string, typeId: string, n: number) =>
  step(ticketId, 'ticket.created', { typeId, projectId: PRJ, parentId: null, title: 'Periods', start: 'focus' }, n);
const to = (ticketId: string, state: string, n: number, cause?: unknown) =>
  step(ticketId, 'ticket.transitioned', cause === undefined ? { to: state } : { to: state, cause }, n);

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await db.drop();
});

/** The full row, `SELECT *`, the shape every reader of this table hands `rowToTicketState`. */
async function rowFor(ticketId: string) {
  const { rows } = await db.pool.query('SELECT * FROM proj_tickets WHERE ticket_id = $1', [ticketId]);
  return rows[0];
}

describe('29.169 the projection round-trips periods, rounds and the close cause', () => {
  it('29.169 writes the five columns from the fold, reads the reducer shape back, and a republish keeps periods', async () => {
    const { wf, typeId } = await world();
    const A = newUlid();
    const FINISHED = newUlid();
    const IDLE = newUlid();
    await applyCommitted(db.pool, [
      created(A, typeId, 1), to(A, 'doing', 2), to(A, 'done', 3), step(A, 'ticket.closed', {}, 4), step(A, 'ticket.reopened', {}, 5), to(A, 'doing', 6),
      created(FINISHED, typeId, 1), to(FINISHED, 'doing', 2), to(FINISHED, 'done', 3),
      created(IDLE, typeId, 1),
    ]);
    const periods = [{ start: at(2), end: at(3), pass: 1 }, { start: at(6), end: null, pass: 1 }];
    const row = await rowFor(A);
    expect(row.periods).toEqual(periods);
    // `ended_at` NULL: the second period is open. `rounds` 1, `closed_cause` NULL: a person's close and reopen.
    expect([row.started_at?.toISOString(), row.ended_at, row.rounds, row.closed_cause]).toEqual([at(2), null, 1, null]);
    expect(rowToTicketState(row).periods).toEqual(periods);
    // The one non-null `ended_at`: a ticket stopped at Done.
    const finished = await rowFor(FINISHED);
    expect([finished.started_at?.toISOString(), finished.ended_at?.toISOString() ?? null]).toEqual([at(2), at(3)]);
    // Control: a never-started ticket round-trips with no `periods` and no `rounds` key.
    const idle = rowToTicketState(await rowFor(IDLE));
    expect(['periods' in idle, 'rounds' in idle]).toEqual([false, false]);
    expect(idle.closed).toBeNull();

    const NT = newUlid();
    await applyCommitted(db.pool, [created(NT, typeId, 1), to(NT, 'done', 2, NOT_TAKEN), step(NT, 'ticket.closed', { cause: NOT_TAKEN }, 3)]);
    const nt = await rowFor(NT);
    expect(nt.closed_cause).toEqual(NOT_TAKEN);
    expect(rowToTicketState(nt).closed?.cause).toEqual(NOT_TAKEN);

    // Refresh-on-publish re-reads every row on the workflow through `rowToTicketState` and upserts it.
    await applyCommitted(db.pool, [workflowDefined(wf, 2, [...STATES, { id: 'review', name: 'Review', category: 'active' }])]);
    const republished = await rowFor(A);
    expect([republished.workflow_version, republished.periods]).toEqual([2, periods]);
  });
});

describe('29.170 the migration and the rebuild', () => {
  it('29.170 adds the five columns with their defaults; a pre-migration row reads no periods until proj_tickets is rebuilt', async () => {
    const { rows: columns } = await db.pool.query(
      `SELECT column_name, column_default, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'proj_tickets'
          AND column_name IN ('started_at', 'ended_at', 'periods', 'rounds', 'closed_cause')
        ORDER BY column_name`,
    );
    expect(columns).toEqual([
      { column_name: 'closed_cause', column_default: null, is_nullable: 'YES' },
      { column_name: 'ended_at', column_default: null, is_nullable: 'YES' },
      { column_name: 'periods', column_default: "'[]'::jsonb", is_nullable: 'NO' },
      { column_name: 'rounds', column_default: '1', is_nullable: 'NO' },
      { column_name: 'started_at', column_default: null, is_nullable: 'YES' },
    ]);
    // The snapshot fold version: every row the migration finds is a version-1 row, which the snapshot pass restates.
    const { rows: fold } = await db.pool.query(
      `SELECT column_default, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'snapshots' AND column_name = 'fold_version'`,
    );
    expect(fold).toEqual([{ column_default: '1', is_nullable: 'NO' }]);

    const { typeId } = await world();
    const A = newUlid();
    await applyCommitted(db.pool, [created(A, typeId, 1), to(A, 'doing', 2), to(A, 'done', 3), to(A, 'doing', 4)]);
    const periods = [{ start: at(2), end: at(3), pass: 1 }, { start: at(4), end: null, pass: 1 }];
    // Control: a ticket created after the migration carries its periods with no rebuild.
    expect((await rowFor(A)).periods).toEqual(periods);
    // A round is never below 1 (the column's CHECK).
    await expect(db.pool.query('UPDATE proj_tickets SET rounds = 0 WHERE ticket_id = $1', [A])).rejects.toThrow(/violates check constraint/);

    // A row as the migration leaves a pre-existing ticket: the defaults, nothing derived.
    await db.pool.query(`UPDATE proj_tickets SET periods = '[]', started_at = NULL, ended_at = NULL WHERE ticket_id = $1`, [A]);
    expect('periods' in rowToTicketState(await rowFor(A))).toBe(false);
    await rebuildProjection('proj_tickets', { pool: db.pool, projections: buildProjectionRegistry() });
    const rebuilt = await rowFor(A);
    expect([rebuilt.periods, rebuilt.started_at?.toISOString()]).toEqual([periods, at(2)]);
  });
});

describe('29.359 rebuilt equals live', () => {
  it('29.359 verifyProjections is clean for a reopen after a finish, a not-taken close and a flow-reset round', async () => {
    const { wf, typeId } = await world();
    const REOPENED = newUlid();
    const NT = newUlid();
    const ROUND2 = newUlid();
    await applyCommitted(db.pool, [
      created(REOPENED, typeId, 1), to(REOPENED, 'doing', 2), to(REOPENED, 'done', 3),
      step(REOPENED, 'ticket.closed', {}, 4), step(REOPENED, 'ticket.reopened', {}, 5), to(REOPENED, 'doing', 6),
      created(NT, typeId, 1), to(NT, 'done', 2, NOT_TAKEN), step(NT, 'ticket.closed', { cause: NOT_TAKEN }, 3),
      created(ROUND2, typeId, 1), to(ROUND2, 'doing', 2), to(ROUND2, 'done', 3), step(ROUND2, 'ticket.closed', {}, 4),
      step(ROUND2, 'ticket.reopened', { cause: RESET }, 5), to(ROUND2, 'todo', 6, RESET), to(ROUND2, 'doing', 7),
    ]);
    // Precondition: the flow-reset ticket is in round 2, and its row reads the round back.
    const round2 = await rowFor(ROUND2);
    expect([round2.rounds, round2.periods]).toEqual([2, [{ start: at(2), end: at(3), pass: 1 }, { start: at(7), end: null, pass: 2 }]]);
    expect(rowToTicketState(round2).rounds).toBe(2);

    // A republish that RE-CATEGORISES Doing to open, after every ticket event above: a rebuild that folded with the
    // definitions of NOW, not those in force at each event, would open no period on the moves into Doing.
    await applyCommitted(db.pool, [workflowDefined(wf, 2, STATES.map((s) => (s.id === 'doing' ? { ...s, category: 'open' as const } : s)))]);
    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report.clean, formatReport(report)).toBe(true);

    // Control: alter one live row's periods, verify, restore, then assert (the restore runs whatever the verdict).
    const saved = (await rowFor(REOPENED)).periods;
    await db.pool.query(`UPDATE proj_tickets SET periods = '[]' WHERE ticket_id = $1`, [REOPENED]);
    const drifted = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    await db.pool.query('UPDATE proj_tickets SET periods = $2 WHERE ticket_id = $1', [REOPENED, JSON.stringify(saved)]);
    expect(drifted.clean).toBe(false);
  });
});
