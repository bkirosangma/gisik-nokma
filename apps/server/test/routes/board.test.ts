import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, type BoardResponse } from '@gisik-nokma/domain';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
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
        stateId: c.stateId,
        name: c.name,
        category: c.category,
        blocked: c.blocked,
      })),
    ).toEqual([
      { workflowId: 'wf-errands', workflowName: 'Errands', stateId: 'todo', name: 'To do', category: 'open', blocked: false },
      { workflowId: 'wf-errands', workflowName: 'Errands', stateId: 'doing', name: 'Doing', category: 'active', blocked: false },
      { workflowId: 'wf-errands', workflowName: 'Errands', stateId: 'waiting', name: 'Waiting on counterparty', category: 'active', blocked: true },
      { workflowId: 'wf-errands', workflowName: 'Errands', stateId: 'done', name: 'Done', category: 'terminal', blocked: false },
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
    expect(cardIds(response.json() as BoardResponse)).toEqual([
      read.world.epicId,
      read.world.taskInEpicId,
      read.world.sharedTaskId,
      read.world.hiddenTaskId,
      read.world.guestTaskId,
    ].sort());
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
