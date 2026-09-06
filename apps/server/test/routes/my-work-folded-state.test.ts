import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LedgerEvent, MyWorkResponse } from '@gisik-nokma/domain';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';

/**
 * `MyWorkResponse.stateNames` names the state in the definition the ticket is
 * FOLDED TO — and this file is the only place in the repository where that can
 * be told apart from "the latest definition".
 *
 * ## Why this is a separate file, and why it exists at all
 *
 * `test/routes/my-work.test.ts` shares one seeded world across every case, and
 * several of its cases assert exact row COUNTS and exact `ticket_id` ORDER for a
 * given viewer (7.26, 7.103, 7.113). Adding a ticket there to carry this
 * property would have moved those answers, so the property gets its own database
 * and its own two tickets rather than a shared one it would disturb.
 *
 * The gap it closes was RECORDED, not discovered here: case 7.210 has been ✅
 * for the list route's `ListCard.stateName` while carrying the note that its
 * folded-versus-latest property was *unconstrained, because every fixture
 * workflow has ONE published version*. A mutation swapping `foldedWorkflowDefs`
 * for `latestWorkflowDefs` therefore survived everywhere. It does not survive
 * here.
 *
 * ## WHY 7.210's property was unconstrained, measured rather than assumed
 *
 * The first draft of this file created a ticket, published a v2 that renamed its
 * state, and expected the ticket to keep v1's name. It got v2's. The probe that
 * settled it read the row: `workflow_version` was **2**.
 *
 * **Publishing a version FORWARD-FOLDS every existing ticket in that
 * workspace.** `projections/tickets.ts` handles `workflow.defined` by selecting
 * `WHERE workflow_id = $2 AND workflow_version < $3` and folding those rows up
 * to the new version — a monotone max-join, documented there as exactly that.
 * So within one workspace, after any publish, **every ticket is at the newest
 * version and `folded` and `latest` give the same answer**. Publishing a second
 * version cannot separate them, and the neighbouring workspace cannot either:
 * the fold and `latestWorkflowDefs` are both workspace-scoped, so a neighbour's
 * publish moves neither.
 *
 * That is the whole reason case 7.210 has carried "folded-versus-latest
 * unconstrained — every fixture workflow has one published version" rather than
 * simply lacking a fixture. The property was not un-tested for want of effort:
 * it is **not reachable through the product path today**, and a case built on a
 * second publish would pass against `latestWorkflowDefs` too. The note is now
 * EXPLAINED instead of restated.
 *
 * ## What this file asserts instead, and why it is still worth having
 *
 * The reader is still written against the row's own `(workflow_id,
 * workflow_version)` — `foldedWorkflowDefs`, not `latestWorkflowDefs` — because
 * that is the conservative reading and the one `assembleListCards` already
 * makes. What this file pins is that it REALLY reads the row: the ticket's
 * `workflow_version` is set back to 1 by a direct write after v2 is published,
 * and the route must then answer v1's name.
 *
 * **That row state is declared, not disguised: the product path cannot produce
 * it today**, precisely because of the fold above. The case is therefore a test
 * of the READER's contract rather than a scenario, and it is the only thing that
 * distinguishes the two definition reads at all — swap `foldedWorkflowDefs` for
 * `latestWorkflowDefs` in `routes/my-work.ts` and this is what reddens.
 */
describe('7.214 GET /v1/me/work — stateNames comes from the FOLDED definition, never the latest', () => {
  let db: TestDatabase;
  let read: ReadWorld;
  const CHORE_TICKET = '0MWF00000000000000000000AA';

  beforeAll(async () => {
    db = await createTestDatabase();
    read = await buildReadTestApp(db);
    const ws = { workspaceId: read.world.workspaceId, actorId: read.world.owner };

    const events: LedgerEvent[] = [
      // Created and assigned while `wf-second` is at v1 — so this ticket is
      // folded to v1 and the publish below cannot move it.
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: CHORE_TICKET },
        type: 'ticket.created',
        payload: {
          typeId: 'chore',
          projectId: read.world.projectId,
          parentId: null,
          title: 'Restock the till roll',
        },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: CHORE_TICKET },
        type: 'ticket.assigned',
        payload: { assigneeId: read.world.owner },
      }),
      // Move it to `waiting`, whose name differs between the two versions.
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: CHORE_TICKET },
        type: 'ticket.transitioned',
        payload: { to: 'waiting' },
      }),
      // v2: same state IDS, renamed. Published AFTER the ticket exists.
      makeCommitted({
        ...ws,
        entity: { kind: 'workflow', id: read.sibling.secondWorkflowId },
        type: 'workflow.defined',
        payload: {
          id: read.sibling.secondWorkflowId,
          version: 2,
          name: 'Second flow',
          initialStateId: 'todo',
          states: [
            { id: 'todo', name: 'Backlog', category: 'open' },
            { id: 'waiting', name: 'Held', category: 'active' },
            { id: 'done', name: 'Archived', category: 'terminal' },
          ],
          transitions: [
            { from: '*', to: 'todo', rules: [] },
            { from: '*', to: 'waiting', rules: [] },
            { from: '*', to: 'done', rules: [] },
          ],
        },
      }),
    ];
    await applyCommitted(db.pool, events);
  }, 120_000);

  afterAll(async () => {
    await read.app.close();
    await db.drop();
  });

  it('7.214 stateNames is read from the ROW\u2019s version, so a row at v1 answers v1\u2019s name', async () => {
    // The row is put at v1 by hand. `applyCommitted` cannot leave it there —
    // publishing v2 folded it forward, which the docblock above explains — so
    // this is a direct write and is labelled as one rather than dressed up as a
    // scenario. What is under test is the READER: given a row naming v1, does
    // the route answer v1's vocabulary or the newest one?
    await db.pool.query('UPDATE proj_tickets SET workflow_version = 1 WHERE ticket_id = $1', [
      CHORE_TICKET,
    ]);
    // The write really landed, and really disagrees with the published latest —
    // without this the assertions below could pass on a row still at v2 if v2
    // had never published.
    const row = await db.pool.query<{ workflow_version: number }>(
      'SELECT workflow_version FROM proj_tickets WHERE ticket_id = $1',
      [CHORE_TICKET],
    );
    expect(row.rows[0]?.workflow_version).toBe(1);
    const published = await db.pool.query<{ version: number }>(
      'SELECT version FROM proj_workflows WHERE workflow_id = $1 ORDER BY version',
      ['wf-second'],
    );
    expect(published.rows.map((each) => each.version)).toEqual([1, 2]);

    const res = await read.app.inject({
      method: 'GET',
      url: `/v1/me/work?workspaceId=${read.world.workspaceId}`,
      headers: read.authOf('owner'),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as MyWorkResponse;

    // The fixture is really in the answer. Without this every assertion below
    // would pass on an empty map.
    const card = [...body.groups.open, ...body.groups.active, ...body.groups.terminal].find(
      (each) => each.ticketId === CHORE_TICKET,
    );
    expect(card, 'the chore ticket must be in this viewer\u2019s answer').toBeDefined();
    expect(card?.stateId).toBe('waiting');

    // v1's name...
    expect(body.stateNames[CHORE_TICKET]).toBe('Parked');
    // ...and NOT v2's, which is what a `latestWorkflowDefs` read returns, nor
    // the state id, which is what a slug fallback returns. Asserted separately
    // from the line above so the FAILURE says which of the two mistakes was
    // made rather than only that the answer was wrong.
    expect(body.stateNames[CHORE_TICKET]).not.toBe('Held');
    expect(body.stateNames[CHORE_TICKET]).not.toBe(card?.stateId);
  });

  it('7.215 the forward fold is why 7.210 stayed unconstrained \u2014 a publish moves EVERY ticket up', async () => {
    // The measurement the case above is built on, asserted rather than left in
    // a comment: this is the behaviour that makes `folded` and `latest` agree on
    // the product path, and if it ever stops being true, 7.214's docblock is
    // wrong and a real scenario becomes writable.
    //
    // Runs AFTER 7.214's direct write, so it also proves the fold is reachable
    // from the state that write leaves behind: re-publishing v2 pulls the
    // hand-written v1 row back up to 2.
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: read.world.workspaceId,
        actorId: read.world.owner,
        entity: { kind: 'workflow', id: read.sibling.secondWorkflowId },
        type: 'workflow.defined',
        payload: {
          id: read.sibling.secondWorkflowId,
          version: 3,
          name: 'Second flow',
          initialStateId: 'todo',
          states: [
            { id: 'todo', name: 'Backlog', category: 'open' },
            { id: 'waiting', name: 'Held', category: 'active' },
            { id: 'done', name: 'Archived', category: 'terminal' },
          ],
          transitions: [
            { from: '*', to: 'todo', rules: [] },
            { from: '*', to: 'waiting', rules: [] },
            { from: '*', to: 'done', rules: [] },
          ],
        },
      }),
    ]);
    const row = await db.pool.query<{ workflow_version: number }>(
      'SELECT workflow_version FROM proj_tickets WHERE ticket_id = $1',
      [CHORE_TICKET],
    );
    // Folded forward from the 1 that 7.214 wrote, straight past 2, to 3.
    expect(row.rows[0]?.workflow_version).toBe(3);
  });
});
