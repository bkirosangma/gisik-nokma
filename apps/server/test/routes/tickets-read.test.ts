import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { applyAll, seedMember, seedTicket, setVisibilityEnv } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Plan 4 Task 8 — read enforcement.
 *
 * ## What this file pins, and the shape it pins it in
 *
 * The property is INDISTINGUISHABILITY, not refusal. A 404 on an invisible
 * ticket proves nothing on its own: a route that 404'd everything would pass
 * it. So every refusal case here is asserted against a positive control in the
 * same test — the same viewer, the same route, an id they may see — and the
 * indistinguishability case compares the invisible answer to the NONEXISTENT
 * answer field by field, status, body and headers, rather than checking a
 * status code twice.
 *
 * ## The rows are `proj_visibility`'s, and there is now a TITLE beside them
 *
 * This section read "`proj_tickets` does not exist on this branch (Plan 3 Task
 * 12 owns it; cases 6.61, 6.66), so no ticket title exists anywhere queryable"
 * and concluded that the plan text's `expect(parent).not.toHaveProperty('title')`
 * could not be written honestly — it would have passed for a reason unrelated to
 * the property it names, which is this series' signature defect.
 *
 * Both halves have changed. `proj_tickets` landed, `seedTicket` writes the head
 * row the ingest transaction really writes, and ruling P25 clause 1 put the
 * ticket's `title`, its domain `ticketState` and its `stateProvenance` on this
 * route — with the visible parent's title on the `kind: 'ticket'` arm only. So
 * the withheld-title assertion is MEANINGFUL now and it is written: the
 * restricted case asserts the parent's title appears on no key at any depth,
 * with the child's own title in the same run as the control. `toEqual({ kind:
 * 'restricted', id })` stays beside it — it is exact, so any field the
 * restricted branch grew reddens it too.
 *
 * ## A fresh workspace per test, and no sequence reset
 *
 * Each test file gets its own database, and the `events` table refuses TRUNCATE
 * (it is append-only), so tests SHARE state within this file. Every test
 * therefore mints its own workspace ULID: an exact-id-set assertion over a
 * shared workspace would break the day someone inserts a test above it, for a
 * reason unrelated to what it names. `resetTestSequences()` is deliberately not
 * called — with rows that are never deleted, restarting the counter would
 * re-mint a `workspace_seq` and collide on `events_workspace_seq_unique`.
 */

/**
 * `app.inject`'s response type, derived from the instance rather than imported
 * from `light-my-request` — that package is a transitive dependency of fastify
 * and is not declared here, so naming it directly does not resolve.
 */
type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

let phoneCounter = 0;

/** A signed-in caller, real sign-in over the wire. `userId` is what their membership is seeded under. */
async function signedIn(): Promise<{ userId: string; headers: { authorization: string } }> {
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9190000${String(phoneCounter).padStart(5, '0')}`);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
}

function get(url: string, headers?: Record<string, string>): Promise<InjectResponse> {
  const options: InjectOptions = { method: 'GET', url, ...(headers ? { headers } : {}) };
  return app.inject(options);
}

/**
 * Every response header except `date`, which is a clock reading and differs
 * between two requests for reasons that have nothing to do with what is being
 * compared. Everything else — `content-type` and `content-length` above all —
 * must match, because a length that differed would ITSELF be the oracle even if
 * both bodies parsed to the same object.
 */
function comparableHeaders(res: InjectResponse): Record<string, unknown> {
  const { date: _date, ...rest } = res.headers;
  return rest;
}

describe('GET /v1/workspaces/:workspaceId/tickets/:ticketId — invisible is nonexistent', () => {
  it('a member reading another project’s ticket gets a 404 indistinguishable from a ticket that never existed', async () => {
    // Mutation that reddens it: give the `canSee` refusal any answer of its own
    // — a 403, or a body naming the ticket — and the two responses stop
    // matching. Deleting the `canSee` guard outright reddens it the other way,
    // through the positive control below.
    const ws = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: mine }]);
    const visible = newUlid();
    const invisibleId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: visible });
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: invisibleId });

    // Positive control FIRST: this viewer, this route, an id they may see. It
    // is what stops "404s everything" from passing this test.
    const allowed = await get(`/v1/workspaces/${ws}/tickets/${visible}`, headers);
    expect(allowed.statusCode).toBe(200);

    const invisible = await get(`/v1/workspaces/${ws}/tickets/${invisibleId}`, headers);
    const ghost = await get(`/v1/workspaces/${ws}/tickets/${newUlid()}`, headers);

    expect(invisible.statusCode).toBe(404);
    expect(ghost.statusCode).toBe(404);
    expect(invisible.json()).toEqual({ error: 'not_found' });
    expect(invisible.json()).toEqual(ghost.json());
    expect(comparableHeaders(invisible)).toEqual(comparableHeaders(ghost));
  });

  it('history of an invisible ticket is the same 404, indistinguishable from a ticket that never existed', async () => {
    // The history door is a separate registration and would have to be refused
    // separately. Mutation: drop either guard from the `/events` handler and
    // the invisible read answers 200 with an (empty) event list.
    const ws = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: mine }]);
    const visible = newUlid();
    const invisibleId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: visible });
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: invisibleId });

    const allowed = await get(`/v1/workspaces/${ws}/tickets/${visible}/events`, headers);
    expect(allowed.statusCode).toBe(200);

    const invisible = await get(`/v1/workspaces/${ws}/tickets/${invisibleId}/events`, headers);
    const ghost = await get(`/v1/workspaces/${ws}/tickets/${newUlid()}/events`, headers);
    expect(invisible.statusCode).toBe(404);
    expect(invisible.json()).toEqual({ error: 'not_found' });
    expect(invisible.json()).toEqual(ghost.json());
    expect(comparableHeaders(invisible)).toEqual(comparableHeaders(ghost));
  });

  /**
   * 6.67 — the route’s `:workspaceId` MEANS something: `canSee` deliberately takes no workspace, so the path segment is what fences a ticket in another workspace — the same viewer reads it through its own path.
   */
  it('a ticket in another workspace is a 404 through this workspace’s path, though the same viewer reads it through its own', async () => {
    // `canSee` deliberately takes no workspaceId — it resolves the role in the
    // workspace the TICKET names — so nothing in the visibility decision
    // notices a path that names the wrong workspace. The route's own
    // `workspace_id` clause is what does, and this is the only case that walks
    // it. Mutation: delete `AND workspace_id = $2` from `loadTicketRow` and the
    // cross-workspace read answers 200.
    //
    // The viewer is a member of BOTH workspaces, so the refusal cannot be
    // "you are not in workspace A"; and the positive control on the same id
    // through workspace B's path is what makes the 404 attributable to the
    // path rather than to invisibility.
    const wsA = newUlid();
    const wsB = newUlid();
    const prjA = newUlid();
    const prjB = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, wsA, userId, 'member', [{ projectId: prjA }]);
    await seedMember(db.pool, wsB, userId, 'member', [{ projectId: prjB }]);
    const ticketInB = newUlid();
    await seedTicket(db.pool, { workspaceId: wsB, projectId: prjB, ticketId: ticketInB });

    const throughB = await get(`/v1/workspaces/${wsB}/tickets/${ticketInB}`, headers);
    expect(throughB.statusCode).toBe(200);

    const throughA = await get(`/v1/workspaces/${wsA}/tickets/${ticketInB}`, headers);
    expect(throughA.statusCode).toBe(404);
    expect(throughA.json()).toEqual({ error: 'not_found' });

    const historyThroughA = await get(`/v1/workspaces/${wsA}/tickets/${ticketInB}/events`, headers);
    expect(historyThroughA.statusCode).toBe(404);
  });
});

describe('GET /v1/workspaces/:workspaceId/tickets — the viewer’s slice, filtered server-side', () => {
  it('returns only the tickets this viewer may see, and an outsider gets an empty list rather than a refusal', async () => {
    // Mutation: return every row for the workspace instead of
    // `listVisibleTickets`' filtered set and the id-set assertion reddens. The
    // outsider half is the collection-shaped statement of the same honesty rule
    // as the 404 — "you may not see this" and "there is nothing here" must not
    // be tellable apart — so it is a 200 with nothing, never a 403.
    const ws = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: mine }]);
    const ticketMine = newUlid();
    const ticketTheirs = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: ticketMine });
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: ticketTheirs });

    const res = await get(`/v1/workspaces/${ws}/tickets`, headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().tickets.map((t: { ticket_id: string }) => t.ticket_id)).toEqual([ticketMine]);

    const outsider = await signedIn();
    const theirView = await get(`/v1/workspaces/${ws}/tickets`, outsider.headers);
    expect(theirView.statusCode).toBe(200);
    expect(theirView.json()).toEqual({ tickets: [] });
  });

  /**
   * 6.69 — the list row and the single read serve the VERY SAME row, pinned by deep equality, so the two halves of this surface cannot drift apart.
   */
  it('the list row and the single read serve the very same row, so the two halves of this surface cannot drift', async () => {
    // The substitution pin. Both sites serve the same `toTicketView` allow-list
    // over `proj_visibility` today because `proj_tickets` does not exist (cases
    // 6.61, 6.66, 6.72); when it lands, both have to change together or this
    // reddens. Mutation: have the single read return the raw row instead of the
    // mapper's view and the deep-equality fails. (Narrowing the mapper itself
    // no longer reddens this case — both routes go through the one mapper, so
    // they narrow together; that is what 6.72 pins instead.)
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    const ticketId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId });

    const list = await get(`/v1/workspaces/${ws}/tickets`, headers);
    const single = await get(`/v1/workspaces/${ws}/tickets/${ticketId}`, headers);
    expect(list.json().tickets).toHaveLength(1);
    expect(single.json().ticket).toEqual(list.json().tickets[0]);
    expect(single.json().ticket.ticket_id).toBe(ticketId);
    // A root ticket claims no parent, and says so rather than omitting the key.
    expect(single.json().parent).toBeNull();
  });
});

describe('the single read carries the rollup — true totals with the restriction named', () => {
  it('a parent whose children the viewer only partly sees is told the TRUE total beside what it may not reach', async () => {
    // Three different numbers on purpose — three children, two this viewer can
    // reach, one it cannot: a fixture where any two coincided would let a swap
    // through.
    const ws = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: mine }]);

    const parentId = newUlid();
    const visibleA = newUlid();
    const visibleB = newUlid();
    const hidden = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: parentId });
    for (const id of [visibleA, visibleB]) {
      await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: id, parentId });
    }
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: hidden, parentId });
    await applyAll(db.pool, [
      setVisibilityEnv(ws, visibleA, 'workspace'),
      setVisibilityEnv(ws, visibleB, 'workspace'),
      setVisibilityEnv(ws, hidden, 'project'),
    ]);

    const res = await get(`/v1/workspaces/${ws}/tickets/${parentId}`, headers);
    expect(res.statusCode).toBe(200);
    // `toEqual` is exact, so an `open`/`active` grown on the shape would redden
    // — those are still absent from `RollupView` (case 6.82). `terminal` and
    // `uncategorized` landed with Plan 5 Task 7 and appear here because this
    // route returns the view verbatim.
    //
    // `uncategorized: 3` here until `seedTicket` began writing the
    // `proj_tickets` head row beside the visibility one (P25 clause 1's change
    // set — the single read now serves the ticket's title and domain state, so a
    // fixture with no head row was seeding a world one ingest transaction cannot
    // produce). Every child now HAS a known category, and `0` is the honest
    // answer where `3` used to be. `terminal: 0` is unchanged and is a fact
    // about the seed's `open` state, not a placeholder — the control below is
    // what keeps these four numbers from being an arithmetic accident.
    // THE KEY NAMES ARE THE ASSERTION, not decoration. This route used to
    // serve `rollupFor`'s own `RollupView` spelling (`total`/`terminal`/
    // `uncategorized`), which no client reader on the `/v1` surface can read:
    // `mapRollup` reads `TicketRollup`, so every ticket WITH CHILDREN came back
    // a `MappingError` while leaves mapped fine. An exact `toEqual` is what
    // makes this a check rather than a hope — a renamed key fails it.
    expect(res.json().rollup).toEqual({
      totalChildren: 3,
      terminalChildren: 0,
      uncategorizedChildren: 0,
      restrictedCount: 1,
    });

    // The non-vacuity control, in the same test: the restricted child really is
    // one this viewer is refused, so "3 · 2 · 1" is not an arithmetic accident
    // over three children they could all see.
    const probe = await get(`/v1/workspaces/${ws}/tickets/${hidden}`, headers);
    expect(probe.statusCode).toBe(404);
    const reachable = await get(`/v1/workspaces/${ws}/tickets/${visibleA}`, headers);
    expect(reachable.statusCode).toBe(200);
  });

  /**
   * 6.87 — `null` means "no direct children", and a nonexistent ticket answers the same `null`. Not a zeroed family: the key is present rather than omitted.
   */
  it('a childless ticket carries rollup null, present as a key rather than omitted', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    const leaf = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: leaf });

    const res = await get(`/v1/workspaces/${ws}/tickets/${leaf}`, headers);
    // The key is part of the contract: a client that reads `body.rollup` must
    // get an explicit "no children", not `undefined` from a missing field.
    expect(Object.hasOwn(res.json(), 'rollup')).toBe(true);
    expect(res.json().rollup).toBeNull();
  });
});

describe('the restricted-parent placeholder — existence, and nothing else', () => {
  it('a visible child under a parent it may not see reports the parent’s existence and its id alone', async () => {
    // Mutation: return the parent's row on the restricted branch (or fall back
    // to `parent: null`) and this reddens — `toEqual` is exact, so a grown
    // field fails, and a null parent fails too. The sibling test below is the
    // control that the visible branch really does carry more, so "existence and
    // nothing else" is a contrast rather than a description of every branch.
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    const parentId = newUlid();
    const childId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parentId });
    await applyAll(db.pool, [setVisibilityEnv(ws, parentId, 'explicit', [newUlid()])]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: childId, parentId });
    // Authored back open: the child inherited the parent's explicit list at
    // creation, so without this the child would be invisible too and the test
    // would be measuring nothing.
    await applyAll(db.pool, [setVisibilityEnv(ws, childId, 'project')]);

    // The parent really is out of reach — asserted, not assumed. Without this
    // the case would pass just as well against a parent the viewer could see
    // if the branch were inverted.
    const parentDirect = await get(`/v1/workspaces/${ws}/tickets/${parentId}`, headers);
    expect(parentDirect.statusCode).toBe(404);

    const res = await get(`/v1/workspaces/${ws}/tickets/${childId}`, headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().parent).toEqual({ kind: 'restricted', id: parentId });
    // THE WITHHELD TITLE, asserted directly rather than left to `toEqual`'s
    // exactness. The plan text's `expect(parent).not.toHaveProperty('title')`
    // was deliberately NOT written here while no title existed anywhere in the
    // system — it would have passed for a reason unrelated to the property it
    // names. Titles exist now (this route serves one at the top level), so the
    // assertion has become meaningful and is written: the parent's title is on
    // NO key at any depth of this body, and the control in the same run is that
    // the CHILD's title is, so "no title" is not "no body".
    const dotted = (value: unknown, path = ''): string[] =>
      Array.isArray(value)
        ? value.flatMap((item, i) => dotted(item, `${path}[${i}]`))
        : value === null || typeof value !== 'object'
          ? []
          : Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => {
              const here = path === '' ? key : `${path}.${key}`;
              return [here, ...dotted(inner, here)];
            });
    const body = res.json() as unknown;
    expect(JSON.stringify(body)).not.toContain(`Ticket ${parentId}`);
    expect(dotted(body).filter((key) => key.startsWith('parent.'))).toEqual(['parent.kind', 'parent.id']);
    expect(res.json().title).toBe(`Ticket ${childId}`);
  });

  it('a visible parent comes through as kind ticket carrying the same row a direct read of it serves', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    const parentId = newUlid();
    const childId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parentId });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: childId, parentId });

    const parentDirect = await get(`/v1/workspaces/${ws}/tickets/${parentId}`, headers);
    const res = await get(`/v1/workspaces/${ws}/tickets/${childId}`, headers);
    expect(res.statusCode).toBe(200);
    // The `title` joined this arm with P25 clause 1, under the SAME rule that
    // chooses between the two arms — `canSee` on the parent. `toEqual` is exact
    // both ways: a title missing here reddens, and the sibling case above pins
    // that the restricted arm carries none.
    expect(res.json().parent).toEqual({
      kind: 'ticket',
      id: parentId,
      title: `Ticket ${parentId}`,
      ticket: parentDirect.json().ticket,
    });
    // Same title, same run, from the parent's own read — so "the parent's title"
    // is the parent's and not a copy of the child's.
    expect(parentDirect.json().title).toBe(`Ticket ${parentId}`);
    expect(res.json().title).toBe(`Ticket ${childId}`);
  });

  /**
   * 6.68 — the inverse leak: a `parent_id` naming NO ticket reports no parent, rather than inventing a restricted one.
   */
  it('a parent_id naming no ticket at all reports no parent, rather than inventing a restricted one', async () => {
    // The inverse leak, and the one the obvious implementation commits: `canSee`
    // answers `false` for an invisible ticket AND for a ticket with no row, so
    // collapsing the two branches would have this route assert the existence of
    // a ticket the system has no evidence for. `proj_visibility` already
    // resolves such a child as a ROOT (case 6.9), so `null` is also the answer
    // the projection gave.
    // Mutation: drop the `parentRow === undefined` branch and fall through to
    // `{ kind: 'restricted' }` — this reddens naming the dangling id.
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    const childId = newUlid();
    const neverCreated = newUlid();
    await seedTicket(db.pool, {
      workspaceId: ws,
      projectId: prj,
      ticketId: childId,
      parentId: neverCreated,
    });

    const res = await get(`/v1/workspaces/${ws}/tickets/${childId}`, headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().ticket.parent_id).toBe(neverCreated);
    expect(res.json().parent).toBeNull();
    // ⚠ AND THE SAME QUESTION OF THE WALK, which this case did not ask until
    // 2026-09-20 — and the omission was a real defect, not a gap in coverage.
    // The grandparent walk asked `canSee` FIRST and never tested the row, so for
    // THIS dangling id it took the `restricted` arm on its first hop and the
    // body carried `epic: {kind:'restricted', id: neverCreated}` — the inverse
    // leak this very case exists to prevent, committed one field to the right of
    // the one it was watching. **The assertion below is the falsifier: it is red
    // on that implementation and green on the one that tests existence first.**
    // An independent reviewer found it by asking what this case does NOT assert.
    expect(res.json().epic).toBeNull();
  });
});

describe('a served row discloses no ticket the viewer may not see, beyond the one authorized parent', () => {
  it('the authoring ancestor a child inherited from is not on the wire, though the projection stores its id', async () => {
    // `resolved_from` names the nearest AUTHORED ancestor, which is deliberately
    // not the immediate parent (case 6.9), so serving the raw row leaks the
    // existence of a ticket that is neither visible nor the parent — outside the
    // one leak spec §6 authorizes. This is the fixture that reaches it: a child
    // in project R, under a parent in project Q, inheriting a Q grandparent's
    // authored mode. NO DOOR CAN MAKE THIS ROW: `hierarchy.cross-project`
    // refuses a parent in another project at both doors that set one
    // (`hierarchy.ts:125` for `ticket.created`, `:274` for `ticket.reparented`),
    // so this fixture seeds the projections directly (case 6.57).
    //
    // Mutation: put `resolved_from` back into `toTicketView` and this reddens
    // naming the grandparent's id.
    const ws = newUlid();
    const projectQ = newUlid();
    const projectR = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: projectR }]);

    const grandparent = newUlid();
    const parentId = newUlid();
    const childId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: projectQ, ticketId: grandparent });
    // The grandparent AUTHORS a mode, which is what makes it the ancestor
    // `resolved_from` names rather than leaving the chain at the project default.
    await applyAll(db.pool, [setVisibilityEnv(ws, grandparent, 'project')]);
    await seedTicket(db.pool, {
      workspaceId: ws,
      projectId: projectQ,
      ticketId: parentId,
      parentId: grandparent,
    });
    await seedTicket(db.pool, {
      workspaceId: ws,
      projectId: projectR,
      ticketId: childId,
      parentId,
    });

    // Non-vacuity: the projection really did store the grandparent's id on the
    // child's row. Without this the test would pass just as well against a
    // fixture where `resolved_from` was empty and there was nothing to leak.
    const stored = await db.pool.query<{ resolved_from: string }>(
      'SELECT resolved_from FROM proj_visibility WHERE ticket_id = $1',
      [childId],
    );
    expect(stored.rows[0]?.resolved_from).toBe(grandparent);

    // The two ancestors are both out of reach — asserted, not assumed.
    expect((await get(`/v1/workspaces/${ws}/tickets/${grandparent}`, headers)).statusCode).toBe(404);
    expect((await get(`/v1/workspaces/${ws}/tickets/${parentId}`, headers)).statusCode).toBe(404);

    const res = await get(`/v1/workspaces/${ws}/tickets/${childId}`, headers);
    expect(res.statusCode).toBe(200);
    // The parent IS disclosed — that is the authorized placeholder. The
    // grandparent is not, anywhere in the response.
    expect(res.json().parent).toEqual({ kind: 'restricted', id: parentId });
    expect(res.body).not.toContain(grandparent);

    // And not through the list either, which goes through the same mapper.
    const list = await get(`/v1/workspaces/${ws}/tickets`, headers);
    expect(list.json().tickets.map((t: { ticket_id: string }) => t.ticket_id)).toEqual([childId]);
    expect(list.body).not.toContain(grandparent);

    // The audience roster is not on the wire either — a smaller cut, made here
    // rather than left to the shape of a `SELECT *`.
    expect(res.json().ticket).not.toHaveProperty('resolved_user_ids');
    expect(res.json().ticket).not.toHaveProperty('own_user_ids');
  });
});

describe('provenance is never redacted from someone entitled to the state', () => {
  /**
   * 6.15 — provenance is never redacted from someone entitled to the state: history carries `actor_id` and both clocks untouched, though the actor shares nothing with the viewer.
   */
  it('history carries the actor and both clocks untouched, though the actor shares no project — indeed nothing — with the viewer', async () => {
    // Mutation: replace `actor_id` with a placeholder for an actor the viewer
    // shares nothing with, or render either clock any way but the ISO instant
    // (`String(row.client_time)` yields the Asia/Kolkata `+05:30` rendering) —
    // each reddens naming its own field.
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    const ticketId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId });

    const stranger = newUlid();
    const claim = testEnvelope({
      workspaceId: ws,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.transitioned',
      payload: { to: 'done' },
      actorId: stranger,
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:02.000Z',
    });
    await appendTestEvent(db.pool, claim);

    const res = await get(`/v1/workspaces/${ws}/tickets/${ticketId}/events`, headers);
    expect(res.statusCode).toBe(200);
    const event = res.json().events.find((e: { id: string }) => e.id === claim.id);
    expect(event).toMatchObject({
      actor_id: stranger,
      client_time: '2026-08-19T10:00:00.000Z',
      server_time: '2026-08-19T10:00:02.000Z',
      origin: 'web',
      type: 'ticket.transitioned',
    });
    // The two clocks are separate facts and both survive: a serializer that
    // dropped one, or collapsed them onto each other, would pass an assertion
    // that only looked at one.
    expect(event.client_time).not.toBe(event.server_time);
  });
});

describe('every door on this surface requires a session', () => {
  /**
   * 6.70 — all three doors carry `requireSession`, and the collection refuses the way a collection must. The session case is load-bearing rather than routine.
   */
  it('all three routes answer the generic 401 with no session', async () => {
    // Without this the whole file would prove only that a signed-in caller is
    // filtered: a route registered WITHOUT `requireSession` leaves
    // `request.currentUserId` undefined, which resolves to no role and 404s
    // anyway — so every refusal case above would still pass while the door
    // stood open. Mutation: drop `preHandler: requireSession` from any of the
    // three registrations and its line here answers 404 or 200 instead of 401.
    const ws = newUlid();
    const ticketId = newUlid();
    for (const url of [
      `/v1/workspaces/${ws}/tickets`,
      `/v1/workspaces/${ws}/tickets/${ticketId}`,
      `/v1/workspaces/${ws}/tickets/${ticketId}/events`,
    ]) {
      const res = await get(url);
      expect([url, res.statusCode]).toEqual([url, 401]);
      expect(res.json()).toEqual({ error: 'unauthenticated' });
    }
  });
});

/**
 * **13.966 — the single read serves the assignment's PROVENANCE, and the two
 * absences stay two.**
 *
 * The ticket sheet's assignee became editable, and every sibling row on that
 * sheet already carries `set by {actor} on {date}` — an edited field that does
 * not say who set it is the one row there which cannot be trusted. The LIST has
 * served `assignedProvenance` on every card since it existed; the single read was
 * the one place it did not, which is why the sheet had no claim to render.
 *
 * **This is a widening, not a second door.** It is one more call to the reader
 * the list already uses (`read/assigned-provenance.ts`), batched by the same
 * `DISTINCT ON` shape as `stateProvenanceFor` on the line above it, on the route
 * that already answers `stateProvenance`. No route is added.
 */
describe('13.966 the single read carries the assignee’s provenance', () => {
  it('carries who assigned the ticket and when; an UNASSIGNED ticket answers null', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    const assignee = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);

    const assignedId = newUlid();
    const bareId = newUlid();
    // `seedTicket` writes the `ticket.assigned` event itself when handed an
    // `assigneeId`, so the claim under test is a real ledger row and not a
    // column somebody set.
    await seedTicket(db.pool, {
      workspaceId: ws,
      projectId: prj,
      ticketId: assignedId,
      assigneeId: assignee.userId,
      createdBy: userId,
    });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: bareId, createdBy: userId });

    const assigned = await get(`/v1/workspaces/${ws}/tickets/${assignedId}`, headers);
    expect(assigned.statusCode).toBe(200);
    const body = assigned.json() as {
      ticketState: { assigneeId: string | null };
      assignedProvenance: Record<string, unknown> | null;
    };
    expect(body.ticketState.assigneeId).toBe(assignee.userId);
    // The actor is whoever wrote the event — `seedTicket` names the CREATOR —
    // and both clocks are the server's own, so a route that invented a claim
    // would have to invent these too.
    expect(body.assignedProvenance).toMatchObject({ actorId: userId });
    expect(typeof body.assignedProvenance?.['serverTime']).toBe('string');

    // THE CONTROL, same viewer and same route: a ticket nobody assigned answers
    // `null`, which is the whole truth rather than a missing key. Without it, a
    // route that answered `null` for EVERY ticket would pass the arm above.
    const bare = await get(`/v1/workspaces/${ws}/tickets/${bareId}`, headers);
    expect(bare.statusCode).toBe(200);
    expect((bare.json() as { assignedProvenance: unknown }).assignedProvenance).toBeNull();
  });
});
