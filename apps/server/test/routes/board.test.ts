import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, type BoardResponse, type LedgerEvent } from '@gisik-nokma/domain';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * Plan 5 Task 8 — `GET /v1/projects/:projectId/board`.
 *
 * ## This is the first route in the plan, so the subject is the DOOR
 *
 * Tasks 2–7 were readers and projections with nothing in front of them, and
 * their tests ask "does the SQL answer correctly". From here the question is
 * "can the wrong person reach it at all", so the four cells of the auth and
 * tenancy seam are each pinned by a named case below:
 *
 * | caller | answer | the case that pins it |
 * |---|---|---|
 * | no session | **401** `{error:'unauthenticated'}` | "no session is 401 …" |
 * | a session in a DIFFERENT workspace | **404** | "the neighbour workspace's owner …" |
 * | a project id that does not exist | **404**, byte-identical | "a stranger, a neighbour and an unknown id …" |
 * | a workspace member NOT on the project | **200**, `columns: []` | "an on-workspace, off-project member …" |
 *
 * The last row is the one worth stating out loud: the gate is
 * `requireMember`, which asks about the WORKSPACE, so the 404 boundary is the
 * tenancy edge and not the project roster. A project's existence is not a
 * secret from somebody already inside the workspace; its CONTENTS are, and the
 * empty board is the visibility predicate answering, not the door.
 *
 * ## Every negative carries its positive control in the same `it`
 *
 * A 404, a `[]` and a bare status code are all answers a broken route gives for
 * free — a typo in the URL 404s, a route that returns no columns returns none
 * for everyone. So each refusal case asserts a SUCCESS through the same helper,
 * in the same test, and the indistinguishability case compares status, body AND
 * headers-minus-`date` rather than checking one status code twice
 * (`tickets-read.test.ts`'s precedent: `content-length` is itself an oracle
 * even when two bodies parse equal).
 *
 * ## One database, one seed, no mutation
 *
 * `seedReadScenario` refuses a second seed into one database, so this file
 * takes one `createTestDatabase` and seeds once in `beforeAll` (via
 * `buildReadTestApp`, which also signs the six users in for real and seeds the
 * neighbour workspace). Nothing here writes to the ledger after that, so no
 * case depends on declaration order.
 *
 * ## The one thing this file appends to the shared world: `wf-second` v2
 *
 * Still inside `beforeAll`, before any case runs, so the paragraph above holds.
 * Its reason is falsifiability and it is worth stating, because without it a
 * field this file asserts could not be wrong. Every workflow any BOARD sees in
 * this suite was at version 1 — `test/routes/attention.test.ts` publishes a
 * `wf-second` v2 of its own, but that file exercises the attention strip and
 * produces no columns — so a board column's `workflowVersion` could not be told
 * apart from the literal `1`, from the ticket row's `workflow_version`, or from
 * any other workflow's version. **MEASURED, as the counterfactual and not as a
 * prediction:** with this publish removed and the `wf-second` expectations below
 * put back to `1`, replacing `workflowVersion: def.version` in `routes/board.ts`
 * with `workflowVersion: 1` left all 756 server tests green — the whole-body
 * `toEqual` in `test/integration/real-door-round-trip.test.ts` and the agreement
 * case in `test/integration/client-contract.test.ts` included. The second
 * publish gives the sibling board TWO workflows at TWO versions, and the
 * candidates come apart: the same mutation then kills the second case below.
 *
 * It is appended HERE and not in `seedSiblingProject` because
 * `test/routes/attention.test.ts` already publishes its OWN `wf-second` v2 (with
 * `todo` flagged blocked) into the same shared sibling project, and
 * `proj_workflows` is `ON CONFLICT (workflow_id, version) DO NOTHING` — a shared
 * v2 would silently swallow that file's definition and take four of its cases
 * with it. Measured, not predicted: it did, before this moved.
 *
 * The states are byte-identical to v1, so no `stateMapping` is owed and no
 * column set, name, category or blocked flag any case here asserts moves. The
 * chore ticket, created under v1, is folded forward to v2 by Plan 3's
 * refresh-on-publish.
 *
 * ## Nothing on this response moves with `TZ`
 *
 * Stated rather than skipped. The only times a board carries are
 * `stateProvenance.clientTime` / `serverTime`, which are `timestamptz` columns
 * rendered by `Date.prototype.toISOString()` — one instant, spelled with a `Z`,
 * identical under any ambient zone. There is no IST day arithmetic on this
 * route (that is Task 12's attention windows, whose fixtures do vary `TZ`), so
 * a `TZ`-varying case here would be a check that cannot fail.
 */

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let db: TestDatabase;
let read: ReadWorld;

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);

  // See the docblock — `wf-second`'s SECOND version, identical states, so that
  // one board carries two workflows at two different versions.
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId: read.world.workspaceId,
      actorId: read.world.owner,
      entity: { kind: 'workflow', id: read.sibling.secondWorkflowId },
      type: 'workflow.defined',
      payload: {
        id: read.sibling.secondWorkflowId,
        version: 2,
        name: 'Second flow',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'Queued', category: 'open' },
          { id: 'waiting', name: 'Parked', category: 'active' },
          { id: 'done', name: 'Filed', category: 'terminal' },
        ],
        transitions: [
          { from: '*', to: 'todo', rules: [] },
          { from: '*', to: 'waiting', rules: [] },
          { from: '*', to: 'done', rules: [] },
        ],
      },
    }),
  ]);
}, 60_000);

afterAll(async () => {
  await read.app.close();
  await db.drop();
});

function getBoard(role: ReadRole, projectId: string): Promise<InjectResponse> {
  return read.app.inject({
    method: 'GET',
    url: `/v1/projects/${projectId}/board`,
    headers: read.authOf(role),
  });
}

async function boardOf(role: ReadRole, projectId: string): Promise<BoardResponse> {
  const response = await getBoard(role, projectId);
  expect(response.statusCode).toBe(200);
  return response.json() as BoardResponse;
}

/**
 * Every response header except `date`, which is a clock reading and differs
 * between two requests for reasons unrelated to what is being compared.
 * `content-length` above all must match: a length that differed would itself be
 * the oracle even if both bodies parsed to the same object.
 */
function comparableHeaders(response: InjectResponse): Record<string, unknown> {
  const { date: _date, ...rest } = response.headers;
  return rest;
}

function cardIds(board: BoardResponse): string[] {
  return board.columns.flatMap((column) => column.cards.map((card) => card.ticketId));
}

describe('GET /v1/projects/:projectId/board — the columns', () => {
  it('7.13 one column per state of every workflow in use, empty states included, the blocked flag carried from the definition', async () => {
    const board = await boardOf('member', read.world.projectId);
    expect(board.projectId).toBe(read.world.projectId);
    expect(board.workspaceId).toBe(read.world.workspaceId);

    expect(
      board.columns.map((c) => ({
        workflowId: c.workflowId,
        workflowName: c.workflowName,
        workflowVersion: c.workflowVersion,
        stateId: c.stateId,
        name: c.name,
        category: c.category,
        blocked: c.blocked,
      })),
    ).toEqual([
      { workflowId: 'wf-errands', workflowName: 'Errands', workflowVersion: 1, stateId: 'todo', name: 'To do', category: 'open', blocked: false },
      { workflowId: 'wf-errands', workflowName: 'Errands', workflowVersion: 1, stateId: 'doing', name: 'Doing', category: 'active', blocked: false },
      { workflowId: 'wf-errands', workflowName: 'Errands', workflowVersion: 1, stateId: 'waiting', name: 'Waiting on counterparty', category: 'active', blocked: true },
      { workflowId: 'wf-errands', workflowName: 'Errands', workflowVersion: 1, stateId: 'done', name: 'Done', category: 'terminal', blocked: false },
    ]);
  });

  it('7.13 cards sit under their own state, and the empty state is a column with no cards rather than no column', async () => {
    const board = await boardOf('member', read.world.projectId);
    const byState = Object.fromEntries(
      board.columns.map((c) => [c.stateId, c.cards.map((card) => card.ticketId)]),
    );
    expect(byState).toEqual({
      todo: [read.world.epicId],
      doing: [read.world.taskInEpicId],
      waiting: [read.world.sharedTaskId],
      // The positive control for this `[]`: the three above are non-empty, so
      // an empty `done` is a state nobody is in, not a board that lost its cards.
      done: [],
    });
  });

  it('7.13 two workflows on one board sit side by side: a repeated state id is TWO columns, each holding only its own workflow’s card, and the blocked flag does not cross', async () => {
    const board = await boardOf('member', read.sibling.projectId);

    expect(
      board.columns.map((c) => ({
        workflowId: c.workflowId,
        workflowVersion: c.workflowVersion,
        stateId: c.stateId,
        name: c.name,
        blocked: c.blocked,
      })),
    ).toEqual([
      // Ordered by workflow id, then by the order each publisher authored their
      // states. `todo` and `waiting` each appear TWICE — once per workflow —
      // and `waiting` is blocked under one and not the other, which is what a
      // flag keyed on a bare state id would get wrong.
      //
      // `workflowVersion` is the second thing this board is uniquely able to
      // say. `wf-second` is published TWICE (see this file's docblock), so the two
      // workflows here sit at DIFFERENT versions — and that is the only place
      // in the suite where the column's version can be told apart from the
      // literal `1`, from the ticket row's `workflow_version`, or from the
      // other workflow's version. Every state of one workflow carries that
      // workflow's own number, which is what a version read off the first def
      // in the map, or off the card, would get wrong.
      { workflowId: 'wf-errands', workflowVersion: 1, stateId: 'todo', name: 'To do', blocked: false },
      { workflowId: 'wf-errands', workflowVersion: 1, stateId: 'doing', name: 'Doing', blocked: false },
      { workflowId: 'wf-errands', workflowVersion: 1, stateId: 'waiting', name: 'Waiting on counterparty', blocked: true },
      { workflowId: 'wf-errands', workflowVersion: 1, stateId: 'done', name: 'Done', blocked: false },
      { workflowId: 'wf-second', workflowVersion: 2, stateId: 'todo', name: 'Queued', blocked: false },
      { workflowId: 'wf-second', workflowVersion: 2, stateId: 'waiting', name: 'Parked', blocked: false },
      { workflowId: 'wf-second', workflowVersion: 2, stateId: 'done', name: 'Filed', blocked: false },
    ]);

    // Each card under its OWN workflow's column and nowhere else. A board that
    // matched on state id alone would put both tickets in both `todo`s.
    expect(
      board.columns.map((c) => [`${c.workflowId}:${c.stateId}`, c.cards.map((card) => card.ticketId)]),
    ).toEqual([
      ['wf-errands:todo', [read.sibling.ticketId]],
      ['wf-errands:doing', []],
      ['wf-errands:waiting', []],
      ['wf-errands:done', []],
      ['wf-second:todo', [read.sibling.choreTicketId]],
      ['wf-second:waiting', []],
      ['wf-second:done', []],
    ]);
  });

  it('7.14 the card carries who claimed its state by both clocks, and the epic carries its four-field rollup', async () => {
    const board = await boardOf('member', read.world.projectId);
    const doing = board.columns.find((c) => c.stateId === 'doing');
    expect(doing?.cards[0]?.stateProvenance).toEqual({
      actorId: read.world.member,
      clientTime: '2026-08-01T09:00:00.000Z',
      serverTime: '2026-08-01T09:00:05.000Z',
      cause: null,
    });

    const todo = board.columns.find((c) => c.stateId === 'todo');
    expect(todo?.cards[0]?.ticketId).toBe(read.world.epicId);
    expect(todo?.cards[0]?.rollup).toEqual({
      totalChildren: 1,
      terminalChildren: 0,
      uncategorizedChildren: 0,
      restrictedCount: 0,
    });
    // The positive control for the rollup's zeros: a childless ticket answers
    // `null`, so `restrictedCount: 0` above is a counted zero and not the
    // shape a route emits when it has nothing to say.
    expect(doing?.cards[0]?.rollup).toBeNull();
  });
});

describe('GET /v1/projects/:projectId/board — visibility', () => {
  it('7.16 PLANTED DEFECT: the hidden ticket appears nowhere in the member board — not as a card, not as an id, not as a byte of its title', async () => {
    const response = await getBoard('member', read.world.projectId);
    expect(response.statusCode).toBe(200);
    // Positive controls first: a body that contains what it should makes the
    // three absences below mean absence, rather than meaning "this is an error
    // page and contains nothing at all".
    expect(response.body).toContain(read.world.epicId);
    expect(response.body).toContain('Registrations drive');

    expect(response.body).not.toContain(read.world.hiddenTaskId);
    expect(response.body).not.toContain('Salary review');
    expect(cardIds(response.json() as BoardResponse)).not.toContain(read.world.hiddenTaskId);
  });

  it('7.16 the owner board DOES hold the hidden ticket — the filter is visibility, not deletion', async () => {
    const response = await getBoard('owner', read.world.projectId);
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(read.world.hiddenTaskId);
    expect(response.body).toContain('Salary review');
    // Asserted per COLUMN, not as one flat list: the flat list would also pass
    // for a board that put every card in one column. The three `todo` ids are
    // ULIDs minted at seed time, so their relative order is `ticket_id` order —
    // the documented card ordering — and `.sort()` is how that is spelled.
    const board = response.json() as BoardResponse;
    expect(
      Object.fromEntries(board.columns.map((c) => [c.stateId, c.cards.map((card) => card.ticketId)])),
    ).toEqual({
      todo: [read.world.epicId, read.world.hiddenTaskId, read.world.guestTaskId].sort(),
      doing: [read.world.taskInEpicId],
      waiting: [read.world.sharedTaskId],
      done: [],
    });
  });

  it('7.17 a guest gets the whole board of their slice: every column of the workflow, holding only the ticket they were named on', async () => {
    const board = await boardOf('guest', read.world.projectId);
    expect(board.columns.map((c) => c.stateId)).toEqual(['todo', 'doing', 'waiting', 'done']);
    expect(cardIds(board)).toEqual([read.world.guestTaskId]);
  });
});

describe('GET /v1/projects/:projectId/board — the door', () => {
  it('7.17 an on-workspace, off-project member gets 200 with an empty board, not a 404 — the workspace is the boundary, the project roster is not', async () => {
    const outsider = await getBoard('outsider', read.world.projectId);
    expect(outsider.statusCode).toBe(200);
    expect((outsider.json() as BoardResponse).columns).toEqual([]);
    expect((outsider.json() as BoardResponse).projectId).toBe(read.world.projectId);

    // Positive control, same helper, same project: the emptiness above is this
    // viewer's slice and not a route that answers `[]` to everyone.
    const member = await boardOf('member', read.world.projectId);
    expect(member.columns.length).toBe(4);
    expect(cardIds(member).length).toBe(3);
  });

  it('7.17 a stranger, a neighbour workspace owner and an unknown project id all get the SAME 404 — status, body and every header but date', async () => {
    const stranger = await getBoard('stranger', read.world.projectId);
    const neighbour = await getBoard('neighbour', read.world.projectId);
    const unknown = await getBoard('owner', newUlid());

    expect(stranger.statusCode).toBe(404);
    expect(stranger.json()).toEqual({ error: 'not_found' });
    expect(neighbour.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);

    // Indistinguishable, or the route is an existence oracle: a caller who
    // cannot reach a project must not be able to learn whether it exists.
    expect(neighbour.json()).toEqual(stranger.json());
    expect(unknown.json()).toEqual(stranger.json());
    expect(comparableHeaders(neighbour)).toEqual(comparableHeaders(stranger));
    expect(comparableHeaders(unknown)).toEqual(comparableHeaders(stranger));

    // Positive control for all three: this route answers 200 to somebody, and
    // the neighbour is a real session that gets 200 on their OWN project — so
    // their 404 is about tenancy and not about them being unauthenticated.
    const ownersOwn = await boardOf('owner', read.world.projectId);
    expect(cardIds(ownersOwn).length).toBe(5);
    const neighboursOwn = await boardOf('neighbour', read.neighbour.projectId);
    expect(cardIds(neighboursOwn)).toEqual([read.neighbour.ticketId]);
  });

  it('7.17 the neighbour workspace never bleeds across: neither owner sees the other tenancy, though the predicate compiles to TRUE for both', async () => {
    const ours = await getBoard('owner', read.world.projectId);
    expect(ours.body).not.toContain(read.neighbour.ticketId);
    expect(ours.body).not.toContain(read.neighbour.ticketTitle);
    expect(ours.body).toContain(read.world.epicId);

    const theirs = await getBoard('neighbour', read.neighbour.projectId);
    expect(theirs.body).not.toContain(read.world.epicId);
    expect(theirs.body).not.toContain('Registrations drive');
    expect(theirs.body).toContain(read.neighbour.ticketId);
  });

  it('7.17 the board is ONE PROJECT’s, not the workspace’s: a sibling project’s ticket the member may see is absent, and present on its own board', async () => {
    const ours = await getBoard('member', read.world.projectId);
    expect(ours.body).not.toContain(read.sibling.ticketId);
    expect(ours.body).not.toContain(read.sibling.ticketTitle);
    expect(ours.body).toContain(read.world.epicId);

    // The positive control that makes the absence mean project scope rather
    // than invisibility: the SAME viewer sees this ticket on the sibling
    // project's own board. Without it, a ticket nobody could see would satisfy
    // the three assertions above and prove nothing.
    const sibling = await boardOf('member', read.sibling.projectId);
    expect(cardIds(sibling)).toEqual([read.sibling.ticketId, read.sibling.choreTicketId]);
    expect(sibling.projectId).toBe(read.sibling.projectId);
    expect(sibling.workspaceId).toBe(read.world.workspaceId);
  });

  it('7.17 no session is 401 and never a board — the same URL with a session is 200', async () => {
    const anonymous = await read.app.inject({
      method: 'GET',
      url: `/v1/projects/${read.world.projectId}/board`,
    });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual(UNAUTHENTICATED_BODY);
    expect(anonymous.body).not.toContain(read.world.epicId);

    // Positive control: the URL is right, the project is there, and the only
    // difference between this request and the one above is the session.
    const authenticated = await getBoard('member', read.world.projectId);
    expect(authenticated.statusCode).toBe(200);
    expect(authenticated.body).toContain(read.world.epicId);
  });

  it('7.17 a forged bearer token is 401, not a board — the session is resolved, not merely present', async () => {
    const forged = await read.app.inject({
      method: 'GET',
      url: `/v1/projects/${read.world.projectId}/board`,
      headers: { authorization: 'Bearer not-a-real-session-token' },
    });
    expect(forged.statusCode).toBe(401);
    expect(forged.json()).toEqual(UNAUTHENTICATED_BODY);
  });
});

/**
 * 13.574 (backlog/closed spec §3.2, 2026-09-17) — the board excludes both a
 * backlog ticket and a closed one, at the SELECT rather than at the bucketing
 * pass below it.
 *
 * A PROJECT OF ITS OWN, exactly for the reason `SiblingProject`'s docblock
 * gives for existing at all: `read.world.projectId`'s four exact-array
 * assertions above ("cards sit under their own state" et al.) are a fixture
 * this file already spends its own docblock arguing for, and a ticket added to
 * that project would change what those cases measure. This project reuses the
 * workspace's own `wf-errands` workflow and `task` type rather than defining
 * new ones — nothing about backlog/closed exclusion depends on a second
 * workflow, which is `SiblingProject`'s reason to exist, not this one's.
 */
describe('GET /v1/projects/:projectId/board — backlog and closed (owner request, 2026-09-17)', () => {
  let backlogClosedProjectId: string;
  let backlogTicketId: string;
  let closedTicketId: string;
  let openDoneTicketId: string;

  beforeAll(async () => {
    backlogClosedProjectId = newUlid();
    backlogTicketId = newUlid();
    closedTicketId = newUlid();
    openDoneTicketId = newUlid();
    const ws = { workspaceId: read.world.workspaceId, actorId: read.world.owner };

    const events: LedgerEvent[] = [
      makeCommitted({ ...ws, entity: { kind: 'project', id: backlogClosedProjectId }, type: 'project.created', payload: { name: 'Backlog and closed' } }),
      makeCommitted({ ...ws, entity: { kind: 'project', id: backlogClosedProjectId }, type: 'project.member_added', payload: { userId: read.world.owner, projectAdmin: true } }),
      makeCommitted({ ...ws, entity: { kind: 'project', id: backlogClosedProjectId }, type: 'project.member_added', payload: { userId: read.world.member, projectAdmin: false } }),

      // Born in the universal state, never moved. `start: 'backlog'` is the
      // spec's own wire shape (§1.3) — this is not a ticket ANY transition put
      // here, it is what "born parked" means.
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: backlogTicketId },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId: backlogClosedProjectId, parentId: null, title: 'Born in backlog', start: 'backlog' },
      }),

      // Reaches a terminal state, THEN closed — the realistic path a real
      // close follows (the engine's own precondition, bypassed by
      // `applyCommitted` but seeded anyway so this fixture is a fact about the
      // product rather than an artifact of the shortcut).
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: closedTicketId },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId: backlogClosedProjectId, parentId: null, title: 'Finished and closed' },
      }),
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: closedTicketId }, type: 'ticket.transitioned', payload: { to: 'done' } }),
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: closedTicketId }, type: 'ticket.closed', payload: {} }),

      // The POSITIVE CONTROL: terminal, like the ticket above, but never
      // closed. Without it, an implementation that excluded every `done` card
      // (not only closed ones) would still pass every assertion below.
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: openDoneTicketId },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId: backlogClosedProjectId, parentId: null, title: 'Finished, still open' },
      }),
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: openDoneTicketId }, type: 'ticket.transitioned', payload: { to: 'done' } }),
    ];
    await applyCommitted(db.pool, events);
  }, 60_000);

  it('13.574 neither the backlog ticket nor the closed one appears in any column, no column is stateId `backlog`, and a done-but-not-closed ticket still sits in `done`', async () => {
    // The positive controls the row itself carries, read back before the board
    // is asked anything: a board that answered correctly by accident (an
    // empty board, say) must not be mistaken for one that excluded these rows
    // on purpose.
    const rows = await db.pool.query<{ ticket_id: string; state_id: string; state_category: string; closed_at: Date | null }>(
      'SELECT ticket_id, state_id, state_category, closed_at FROM proj_tickets WHERE ticket_id = ANY ($1::text[])',
      [[backlogTicketId, closedTicketId, openDoneTicketId]],
    );
    const byId = new Map(rows.rows.map((row) => [row.ticket_id, row]));
    expect(byId.get(backlogTicketId)).toMatchObject({ state_id: 'backlog', state_category: 'open' });
    expect(byId.get(closedTicketId)?.closed_at).not.toBeNull();
    expect(byId.get(openDoneTicketId)).toMatchObject({ state_id: 'done', state_category: 'terminal' });
    expect(byId.get(openDoneTicketId)?.closed_at).toBeNull();

    const board = await boardOf('owner', backlogClosedProjectId);
    expect(board.columns.map((c) => c.stateId)).toEqual(['todo', 'doing', 'waiting', 'done']);
    expect(board.columns.some((c) => c.stateId === 'backlog')).toBe(false);

    expect(cardIds(board)).not.toContain(backlogTicketId);
    expect(cardIds(board)).not.toContain(closedTicketId);
    // The done-but-not-closed ticket is the reason the two absences above mean
    // "backlog/closed excluded" rather than "this board shows nothing".
    expect(cardIds(board)).toContain(openDoneTicketId);
    const done = board.columns.find((c) => c.stateId === 'done');
    expect(done?.cards.map((card) => card.ticketId)).toEqual([openDoneTicketId]);
  });
});
