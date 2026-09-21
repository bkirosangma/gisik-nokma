import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { formatReport, verifyProjections } from '../src/tools/verify-projections.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { buildContestedClaim } from '../src/sync/contest-coherence.js';
import {
  submittedTicketTypeDefined,
  submittedWorkflowDefined,
  submittedWorkspaceCreated,
} from './helpers/events.js';

let db: TestDatabase;

/** A server-origin contest through the internal door — the only door entitled to one. */
function contestedClaim(workspaceId: string): SubmittedEvent {
  return buildContestedClaim({
    originalEvent: {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'ticket', id: newUlid() },
      type: 'ticket.transitioned',
      version: 1,
      // Keys deliberately not in alphabetical order: if jsonb's normalisation
      // ever differed between a live INSERT and a shadow rebuild, this is the
      // shape that would show it.
      payload: { toStateId: 'done', note: 'unsorted keys', assignee: null },
      actorId: newUlid(),
      origin: 'mobile',
      clientTime: '2026-08-20T09:00:00.000Z',
    },
    rule: 'workflow.transition-not-allowed',
    reason: 'That move is not allowed from here.',
    actorId: newUlid(),
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  const ingest = createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
  const home = submittedWorkspaceCreated();
  // Hoisted out of the batch because the ticket seed below needs its id: a
  // ticket type binds to a workflow BY ID, and `submittedTicketTypeDefined`'s
  // own binding (`wf-basic`) names no workflow this seed publishes — a ticket of
  // that type would be refused `ticket.workflow-undefined`, which is a true
  // refusal about a seed and would have looked like a defect in the context.
  const workflow = submittedWorkflowDefined(home.workspaceId);
  const workflowId = (workflow.payload as { id: string }).id;
  const project = newUlid();
  const parentTicket = newUlid();
  const childTicket = newUlid();
  const ticketType = (id: string, rank: number): SubmittedEvent => ({
    id: newUlid(),
    workspaceId: home.workspaceId,
    entity: { kind: 'ticket-type', id: newUlid() },
    type: 'ticket-type.defined',
    version: 1,
    payload: { id, name: id, icon: 'check', rank, workflowId, fields: [] },
    actorId: newUlid(),
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
  });
  const createdTicket = (ticketId: string, typeId: string, parentId: string | null): SubmittedEvent => ({
    id: newUlid(),
    workspaceId: home.workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    version: 1,
    payload: { typeId, projectId: project, parentId, title: `Seed ${typeId}` },
    actorId: newUlid(),
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
  });
  const results = await ingest.ingestBatch([
    home,
    submittedWorkspaceCreated(),
    // A workflow, so proj_workflows is compared with a real row in it rather
    // than empty — an empty table diffs clean without proving that live
    // application and ledger re-derivation produce the same jsonb.
    workflow,
    // A CONTEST, so proj_contested is compared with a real row in it rather than
    // empty — same reason as the workflow above, and sharper: `original_event`
    // is the repo's FIRST jsonb projection column. The registry contract forbids
    // `json` because it has no equality operator and this verifier diffs with
    // EXCEPT; jsonb HAS one, which is the argument the migration makes. THIS
    // SEED is what turns that argument into an observation — jsonb normalises
    // key order and whitespace on ingest, so a live INSERT and a shadow-schema
    // rebuild have to agree through EXCEPT in both directions, and an empty
    // table would have proven neither. The unique index on original_event_id
    // rides along through `CREATE TABLE … LIKE … INCLUDING ALL`.
    contestedClaim(home.workspaceId),
    // A TICKET TYPE, so proj_ticket_types is compared with a real row in it
    // rather than empty — same reason as the two above, and the reason the
    // prompt for Plan 3 Task 9 calls the registry-driven verifier's trap: a
    // check that iterates the registry proves nothing for a projection whose
    // table the seed never filled. Its `fields` column is this file's SECOND
    // jsonb projection column, carrying a nested options array, so the live
    // INSERT and the shadow-schema rebuild must agree through EXCEPT in both
    // directions on more than a scalar.
    submittedTicketTypeDefined(home.workspaceId),
    // A PARENT AND A CHILD, so proj_tickets and proj_rollups are compared with
    // real rows in them rather than empty (Plan 3 Chain B Task 12 — the two
    // notes below used to say this file could not do it, and named the wiring
    // that had to land first). proj_tickets carries THREE jsonb columns and the
    // title claim fills one of them on creation; the transition fills the second
    // with a log entry, so the live INSERT and the shadow rebuild have to agree
    // through EXCEPT in both directions on more than a scalar.
    //
    // The child is what makes proj_rollups non-empty at all: it stores one row
    // per PARENT, so a ticket at project root leaves the table empty and adding
    // it to the list below would have been the check that cannot pass.
    ticketType('saga', 2),
    ticketType('chore', 3),
    // A PROJECT, AND THEN AN ARCHIVE OF IT (Task 16). Two reasons, and the
    // second is the one that needed a new event.
    //
    // `proj_projects` was EMPTY through this verifier: the tickets below name
    // `project` in their payloads, but nothing appended a `project.created`,
    // and the internal door runs no existence check. That is this file's own
    // named trap — "a check that iterates the registry proves nothing for a
    // projection whose table the seed never filled" — standing open on the one
    // projection nobody had filled.
    //
    // The archive is what makes the row's `archived` column a NON-DEFAULT
    // value. `archived` is written by an UPDATE, not by the INSERT, and an
    // UPDATE is the one shape whose live and rebuilt results can differ without
    // anything throwing: it is a silent no-op against a row that does not exist
    // yet. Seeded `true` here, both orders must produce `true`, and a rebuild
    // that replayed the archive before the creation would produce `false` and
    // be caught by EXCEPT rather than by an argument about stream ordering. The
    // non-emptiness case below asserts the `true`, because a defaulted `false`
    // on both sides diffs clean and would make this seed decorative.
    {
      id: newUlid(),
      workspaceId: home.workspaceId,
      entity: { kind: 'project', id: project },
      type: 'project.created',
      version: 1,
      // `prefix` is here so the shadow rebuild exercises the NON-NULL path of
      // `proj_projects.prefix`, added 2026-09-20. Without it this world only
      // ever proves that NULL equals NULL — and the case that matters is the
      // one where the column holds a value an event actually made, because
      // THAT is the value a replay has to reproduce.
      //
      // ⚠ What this does NOT prove is that the column holds only what an event
      // said. A DERIVED value written here reddens nothing at all, measured:
      // the derivation is a pure function, so live and shadow agree and `EXCEPT`
      // has nothing to report. See `proj-projects.ts`'s comment and mutation M4
      // in `test-cases/13-owner-requests-and-backlog.md`.
      payload: { name: 'Seed project', prefix: 'SP' },
      actorId: newUlid(),
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
    },
    {
      id: newUlid(),
      workspaceId: home.workspaceId,
      entity: { kind: 'project', id: project },
      type: 'project.archived',
      version: 1,
      payload: {},
      actorId: newUlid(),
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
    },
    createdTicket(parentTicket, 'saga', null),
    createdTicket(childTicket, 'chore', parentTicket),
    {
      id: newUlid(),
      workspaceId: home.workspaceId,
      entity: { kind: 'ticket', id: childTicket },
      type: 'ticket.transitioned',
      version: 1,
      payload: { to: 'done' },
      actorId: newUlid(),
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
    },
  ]);
  if (results.some((result) => result.status !== 'committed')) {
    throw new Error('seeding failed — verifier tests need an honest baseline');
  }
});

afterAll(async () => {
  await db.drop();
});

async function shadowSchemaExists(): Promise<boolean> {
  const result = await db.pool.query(
    "SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = 'verify_shadow'",
  );
  return result.rows[0].n > 0;
}

/**
 * 3.20 — cited on the block: verify-projections is clean on honest state, and corrupted and deleted live rows are named with per-direction counts, with the shadow schema dropped afterwards.
 */
describe('verifyProjections', () => {
  /**
   * 5.69 — the non-emptiness guard the registry-driven verifier’s clean verdict depends on: a clean verdict over an EMPTY table is the check that cannot fail, so every table the verdict covers is asserted non-empty first.
   */
  it('the seed is NON-EMPTY in every table the clean verdict below covers', async () => {
    // A clean verdict over empty tables is the check that cannot fail, and this
    // file's own seed comment says so about proj_workflows. Asserted rather than
    // trusted: if a seed ever stops committing, the verdict below stops meaning
    // anything, and THIS is what says so, naming the table.
    //
    // proj_tickets and proj_rollups JOINED THIS LIST in Plan 3 Chain B Task 12,
    // which is the task the two notes that stood here named. They said this file
    // could not seed a ticket — a real `ticket.created` needs
    // `ctx.getTicketTypeDef` to resolve and `createEngineContext` answered null
    // for every type — and that proj_rollups must not be added before a seeded
    // ticket HAD A PARENT, because it stores one row per parent and a ticket at
    // project root leaves it empty. Both conditions are met above: the context
    // reads proj_ticket_types now, and the seed is a parent with one child.
    //
    // `test/proj-visibility.test.ts` also
    // plants a ledger by hand — its definitions in `beforeAll`, so they are in
    // force for the creations that follow — rebuilds every projection and runs
    // THIS verifier over it, which is where proj_tickets' three jsonb columns
    // are actually diffed live against a shadow rebuild in both directions.
    // That case carries its own non-empty assertion, for the reason this one
    // does.
    for (const table of [
      'proj_entity_heads',
      'proj_workflows',
      'proj_contested',
      'proj_ticket_types',
      'proj_tickets',
      'proj_rollups',
      // Task 16. `proj_projects` was covered by the clean verdict and never
      // filled — the trap this case exists to close, standing open on one
      // projection because nothing in the seed appended a `project.created`
      // (the internal door runs no existence check, so the tickets could name
      // a project that had none).
      'proj_projects',
    ]) {
      const { rows } = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
      expect(
        rows[0]?.n,
        `${table} is empty — a clean verdict over it proves nothing`,
      ).toBeGreaterThan(0);
    }

    // Non-emptiness is not enough for `proj_projects.archived` (Task 16). That
    // column has a DEFAULT, so a table full of rows the archive never touched
    // diffs clean for the same reason an empty one does — the UPDATE would
    // never have run on either side. The seed archives its project, so the
    // value under comparison is the non-default one.
    //
    // **What the verdict below proves about this column, stated exactly:** that
    // live application and ledger re-derivation AGREE, which is the property an
    // UPDATE can break silently (it is a no-op against a row that does not
    // exist yet, and a replay that delivered the archive before the creation
    // would produce `false` here and be caught by EXCEPT). It does NOT prove the
    // fold is CORRECT — a projection that ignored `project.archived` entirely
    // would produce `false` on both sides and diff clean. That half is case
    // 13.370's, through the real door.
    const archived = await db.pool.query<{ archived: boolean }>(
      'SELECT archived FROM proj_projects',
    );
    expect(archived.rows.map((row) => row.archived)).toEqual([true]);
  });

  /**
   * 12.81 — the rebuild-and-diff verifier runs over proj_contested (among other tables) with a real seeded row, diffing its jsonb original_event column in both directions between live and the shadow schema; the seed's non-emptiness for proj_contested is asserted separately (this file, line 157-193) so a clean verdict over an empty table cannot pass.
   */
  it('reports clean when live projections match their rebuild, and drops its shadow schema', async () => {
    // proj_contested's jsonb column is diffed here in both directions, which is
    // what earns the migration's claim that jsonb is legal where `json` is not.
    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report).toEqual({ clean: true, diffs: [] });
    await expect(shadowSchemaExists()).resolves.toBe(false);
  });

  it('planted defect: a corrupted live row is reported with the table named and both directions counted', async () => {
    const victim = await db.pool.query('SELECT entity_id FROM proj_entity_heads LIMIT 1');
    const entityId: string = victim.rows[0].entity_id;
    await db.pool.query('UPDATE proj_entity_heads SET head_seq = 999 WHERE entity_id = $1', [entityId]);

    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report.clean).toBe(false);
    expect(report.diffs).toHaveLength(1);
    expect(report.diffs[0]).toMatchObject({
      table: 'proj_entity_heads',
      missingFromLive: 1, // the honest row the ledger derives
      extraInLive: 1,     // the corrupted row live holds
    });
    expect(report.diffs[0]?.samples.join('\n')).toContain('999');
    await expect(shadowSchemaExists()).resolves.toBe(false);

    // Repair via rebuild, then verify is clean again — the loop closes.
    const { rebuildProjection } = await import('../src/projections/rebuild.js');
    await rebuildProjection('proj_entity_heads', {
      pool: db.pool,
      projections: buildProjectionRegistry(),
    });
    const repaired = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(repaired.clean).toBe(true);
  });

  it('planted defect: a deleted live row is one missing, zero extra', async () => {
    const victim = await db.pool.query('SELECT entity_id FROM proj_entity_heads LIMIT 1');
    const entityId: string = victim.rows[0].entity_id;
    await db.pool.query('DELETE FROM proj_entity_heads WHERE entity_id = $1', [entityId]);

    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report.clean).toBe(false);
    expect(report.diffs[0]).toMatchObject({ table: 'proj_entity_heads', missingFromLive: 1, extraInLive: 0 });

    const { rebuildProjection } = await import('../src/projections/rebuild.js');
    await rebuildProjection('proj_entity_heads', {
      pool: db.pool,
      projections: buildProjectionRegistry(),
    });
  });
});

describe('formatReport', () => {
  it('says clean plainly', () => {
    expect(formatReport({ clean: true, diffs: [] })).toBe(
      'verify-projections: clean — every projection matches its rebuild from the ledger',
    );
  });

  it('names each drifted table with counts and samples', () => {
    const text = formatReport({
      clean: false,
      diffs: [
        {
          table: 'proj_entity_heads',
          missingFromLive: 1,
          extraInLive: 1,
          samples: ['missing from live: {"head_seq":2}', 'extra in live: {"head_seq":999}'],
        },
      ],
    });
    expect(text).toContain('DRIFT DETECTED');
    expect(text).toContain('proj_entity_heads: 1 row(s) missing from live, 1 extra in live');
    expect(text).toContain('extra in live: {"head_seq":999}');
  });
});

/**
 * 3.960 — E6-13: the verifier after a ticket type is re-bound to another
 * workflow, in BOTH orders the re-bind can take. Each order gets its own
 * database: a re-bind in the shared seed above would change what the
 * planted-defect cases count.
 *
 * Before the fix (`getTicketTypeLadderFromDb` read the type's binding as of
 * NOW), measured on 2026-09-21 with a scratch probe through this same door:
 *
 *   order A — WF2 published BEFORE the ticket, type re-bound after it:
 *     verify-projections: DRIFT DETECTED | proj_tickets: 1 row(s) missing from live, 1 extra in live
 *     (the rebuild put the ticket on WF2; live holds WF1 — the finding's Appendix L)
 *   order B — WF2 published AFTER the ticket, then the type re-bound (the type
 *   editor's ordinary act: define a new workflow, move a type onto it):
 *     verifyProjections THREW: applyTicketEvent: workflow "<WF2>" is not defined —
 *     the engine must refuse ticket.created before it reaches a projection
 *     (the rebuild resolved WF2 and asked for it as of the ticket's position,
 *     where it was not yet in force — no report at all, a stack trace)
 *
 * The runbook's restore drill "passes only on the clean line and exit 0", so
 * both orders failed the drill on a correct database. The `rebuildProjection`
 * control is the same defect's other face: the live repair tool wrote the WF2
 * row over a correct one in order A and threw in order B.
 *
 * `rank: 2` on the custom type is load-bearing for the fixture, not decoration:
 * a custom type at the ladder's deepest rank is refused
 * `hierarchy.deepest-rank-parent-required` on a parentless `ticket.created`.
 */
describe('E6-13: a type re-bound to another workflow after a ticket was created', () => {
  function typeDefined(workspaceId: string, workflowId: string): SubmittedEvent {
    return {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'ticket-type', id: newUlid() },
      type: 'ticket-type.defined',
      version: 1,
      payload: { id: 'feature', name: 'Feature', icon: 'flag', rank: 2, workflowId, fields: [] },
      actorId: newUlid(),
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
    };
  }
  function projectCreated(workspaceId: string, projectId: string): SubmittedEvent {
    return {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.created',
      version: 1,
      payload: { name: 'Seed project', prefix: 'SP' },
      actorId: newUlid(),
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
    };
  }
  function ticketCreated(workspaceId: string, ticketId: string, projectId: string): SubmittedEvent {
    return {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.created',
      version: 1,
      payload: { typeId: 'feature', projectId, parentId: null, title: 'born on WF1' },
      actorId: newUlid(),
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
    };
  }

  /**
   * One world per order. `publishSecondWorkflowBeforeTicket` is the only
   * difference between the two: where WF2's `workflow.defined` sits relative
   * to the ticket's `ticket.created` in the workspace stream.
   */
  async function reboundWorld(publishSecondWorkflowBeforeTicket: boolean): Promise<{
    world: TestDatabase;
    ticketId: string;
    firstWorkflowId: string;
    secondWorkflowId: string;
  }> {
    const world = await createTestDatabase();
    const ingest = createIngestService({
      pool: world.pool,
      evaluate: evaluateEvent,
      projections: buildProjectionRegistry(),
    });
    const home = submittedWorkspaceCreated();
    const workspaceId = home.workspaceId;
    const first = submittedWorkflowDefined(workspaceId);
    const second = submittedWorkflowDefined(workspaceId);
    const firstWorkflowId = (first.payload as { id: string }).id;
    const secondWorkflowId = (second.payload as { id: string }).id;
    const projectId = newUlid();
    const ticketId = newUlid();
    const before = [home, first, ...(publishSecondWorkflowBeforeTicket ? [second] : []), projectCreated(workspaceId, projectId), typeDefined(workspaceId, firstWorkflowId), ticketCreated(workspaceId, ticketId, projectId)];
    const after = [...(publishSecondWorkflowBeforeTicket ? [] : [second]), typeDefined(workspaceId, secondWorkflowId)];
    for (const batch of [before, after]) {
      const results = await ingest.ingestBatch(batch);
      const refused = results.find((result) => result.status !== 'committed');
      if (refused !== undefined) {
        throw new Error(`E6-13 seed refused: ${JSON.stringify(refused)}`);
      }
    }
    return { world, ticketId, firstWorkflowId, secondWorkflowId };
  }

  async function liveWorkflowId(world: TestDatabase, ticketId: string): Promise<string> {
    const { rows } = await world.pool.query<{ workflow_id: string }>(
      'SELECT workflow_id FROM proj_tickets WHERE ticket_id = $1',
      [ticketId],
    );
    return rows[0]!.workflow_id;
  }

  it.each([
    ['A: the second workflow was published BEFORE the ticket', true],
    ['B: the second workflow was published AFTER the ticket', false],
  ])(
    'order %s — the live row stays on the first workflow, the verifier is clean, and a rebuild reproduces the live row',
    async (_label, publishSecondWorkflowBeforeTicket) => {
      const { world, ticketId, firstWorkflowId, secondWorkflowId } = await reboundWorld(publishSecondWorkflowBeforeTicket);
      try {
        // The owner's rule, as a control on the live path: "a re-binding
        // affects new tickets only" (2026-08-26). This half was green before
        // the fix and must stay green after it — the fix is to the REPLAY,
        // and a change that reached the live path would show here first.
        expect(await liveWorkflowId(world, ticketId)).toBe(firstWorkflowId);
        expect(secondWorkflowId).not.toBe(firstWorkflowId);

        // RED before: order A reported DRIFT DETECTED on proj_tickets (1
        // missing, 1 extra); order B threw from inside the reducer, so there
        // was no report to read at all.
        const report = await verifyProjections({ pool: world.pool, projections: buildProjectionRegistry() });
        expect(formatReport(report)).toBe(
          'verify-projections: clean — every projection matches its rebuild from the ledger',
        );
        expect(report).toEqual({ clean: true, diffs: [] });

        // The repair tool is the same replay. Before the fix a rebuild after a
        // re-bind either wrote the WF2 row over a correct live one (order A)
        // or threw (order B); now it reproduces the live row.
        const { rebuildProjection } = await import('../src/projections/rebuild.js');
        await rebuildProjection('proj_tickets', { pool: world.pool, projections: buildProjectionRegistry() });
        expect(await liveWorkflowId(world, ticketId)).toBe(firstWorkflowId);
      } finally {
        await world.drop();
      }
    },
  );
});
