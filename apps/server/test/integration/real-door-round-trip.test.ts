import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { READ_NOT_FOUND_BODY } from '../../src/read/membership.js';
import { NOT_FOUND_BODY } from '../../src/routes/tickets.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Step 10, Task B — the integration checkpoint. **One world, built entirely
 * through the shipped doors, read back through the shipped read routes.**
 *
 * ## The gap this closes, measured rather than inherited
 *
 * The dispatch brief and two earlier recons framed this step as closing the six
 * absences `test/helpers/apply.ts` enumerates. Recounted against this tree,
 * five of the six are already exercised through the real door somewhere —
 * `notifyCommitted` by `test/stream/stream-route.test.ts`'s `submit()`, and
 * `bootstrapWorkspace`, the permission gate, the rule engine and DB-minted
 * seqs by `test/routes/workspaces.test.ts`. Only `lockWorkspace`/`lockEntity`
 * is uncovered **through the real door** — not "anywhere": both are covered
 * directly in `test/event-store.test.ts`, `lockEntity` at `:83` ("holds off a
 * second transaction until the first commits (falsifiable)") and `lockWorkspace`
 * at `:242` via `appendUnderBothLocks`. What no test does is reach either lock
 * through `POST /v1/events`, and concurrency is not this file's subject.
 *
 * The real gap is one sentence and it was measured:
 *
 * > Every Plan 5 read-route test seeds its world with `applyCommitted` and NONE
 * > of them writes through `POST /v1/events`. The absences are closed for the
 * > WRITE path and open for the READ path.
 *
 * `grep -l "v1/events"` over `test/routes/{board,list,search,my-work,attention,
 * preferences}.test.ts` returns nothing; the same grep over
 * `workspaces`/`invites`/`security`/`stream-route` returns 4/5/3/2. The
 * instrument can hit. `workspaces.test.ts` already proves the WRITE half end to
 * end — real sign-in, `POST /v1/workspaces`, three committing `POST /v1/events`
 * — and then asserts `proj_tickets` **by querying the table directly**. The one
 * missing hop is the last one: nothing reads back through a shipped READ route
 * what a real POST wrote. That is this file.
 *
 * ## The prohibition, which is the whole point
 *
 * **No `applyCommitted`, no `insertEvent`, no INSERT into any `proj_*` table.**
 * Every fact these routes answer with arrived through `signInWithPhone`,
 * `POST /v1/workspaces` or `POST /v1/events`. A seeder anywhere below would put
 * the fact into the projection by hand and leave the route re-asserting the
 * arithmetic `test/routes/board.test.ts` already covers.
 *
 * ## What a round trip proves that a seeded read cannot — the general form
 *
 * Every assertion below carries its own sentence, but they are instances of
 * three:
 *
 * 1. **Values nobody in this file typed.** `workflowId`, `stateId`,
 *    `stateCategory` and every `seq` are chosen by the founding sequence, the
 *    rule engine and `nextSeq` respectively. A seeded test supplies all four,
 *    so it cannot tell a correct engine from a fixture that agrees with it.
 * 2. **`rollup.uncategorizedChildren === 0`.** `read-models.ts` states the
 *    condition exactly: it is 0 iff BOTH `proj_visibility` and `proj_tickets`
 *    are current with the ledger, and the named way to make it nonzero is "a
 *    fixture applying a subset of the registry (`test/helpers/seed.ts`'s
 *    `applyAll`)". So a zero here is a fact about the ingest TRANSACTION having
 *    advanced both projections together — precisely the thing a seeder can
 *    silently break and a real POST guarantees.
 * 3. **The gate admitted the write.** `project.created` is admin-only and
 *    `ticket.created` resolves its type against the workspace's ledger, so
 *    every card below exists only because `checkPermission` and the engine both
 *    said yes to a request that came in over the wire.
 *
 * ## Every route has a control that separates "works" from "answers anything"
 *
 * A second signed-in person — `outsider`, a real session, no membership
 * anywhere — asks each route the same question in the same run and gets that
 * route's refusal. Without it a route that answered the member's body by
 * accident and everybody else's by accident too would pass.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;

/** The founder, workspace owner and project admin. Everything below is theirs. */
let member: { userId: string; phone: string; headers: { authorization: string } };
/** A real session that belongs to nothing. The control for every route here. */
let outsider: { userId: string; phone: string; headers: { authorization: string } };

let workspaceId: string;
let projectId: string;
let parentId: string;
let childId: string;
/** The workspace's only workflow, minted by the founding sequence. Never typed here. */
let workflowId: string;
/** `SIMPLE_KANBAN_TEMPLATE.initialStateId`, read back off the ledger rather than assumed. */
let initialStateId: string;

let phoneCounter = 0;

/** The member's phone, kept because the attention block signs the SAME person in again. */
let memberPhone: string;

async function signedIn(): Promise<{
  userId: string;
  phone: string;
  headers: { authorization: string };
}> {
  phoneCounter += 1;
  const phone = `+9190007${String(phoneCounter).padStart(5, '0')}`;
  const user = await signInWithPhone(app, otp, phone);
  return { userId: user.userId, phone, headers: { authorization: `Bearer ${user.token}` } };
}

/**
 * One event through the product's own door, asserting it COMMITTED.
 *
 * The assertion is the point rather than the plumbing: a refusal here would
 * leave the world half-built and every read below would assert an emptiness
 * that looked like a route bug. `results[0].status` is checked on every call so
 * a failure names the write that failed, not the read that noticed.
 */
async function post(
  headers: { authorization: string },
  event: Omit<SubmittedEvent, 'id' | 'version' | 'origin' | 'clientTime'>,
  expectedSeq: number,
): Promise<void> {
  const submitted: SubmittedEvent = {
    id: newUlid(),
    version: 1,
    origin: 'web',
    clientTime: new Date().toISOString(),
    ...event,
  };
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers,
    payload: { events: [submitted] },
  });
  const body = res.json() as { results?: Array<Record<string, unknown>> };
  // The write door's whole answer, not `status` alone. `seq` here is the
  // per-entity cursor `nextSeq` allocated INSIDE the ingest transaction and
  // `serverTime` is the clock it stamped — the two facts `applyCommitted`'s
  // docblock names as its first absence ("seqs from a process map, not the
  // DB"). Every caller below states the seq it expects, so the sequence is a
  // claim made at the point of writing rather than one discovered afterwards.
  expect(freezeClocks(body.results?.[0])).toEqual({
    status: 'committed',
    eventId: submitted.id,
    seq: expectedSeq,
    serverTime: 'SERVER-TIME',
  });
}

/** What a `toISOString()` looks like. Anything else in a clock field is a defect. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Every `clientTime`/`serverTime` in a response body replaced by a constant,
 * AFTER each one has been checked to be a real ISO instant.
 *
 * Two rules, and both are why this is a function rather than `expect.any`:
 *
 * - **Value replacement, never key deletion.** A normaliser that `delete`d a
 *   clock key would stop `toEqual` failing the day the server omits it, which
 *   is precisely the hole this file exists to close. Every key survives; only
 *   the unpredictable value is swapped.
 * - **`expect.any(String)` is not used anywhere in this file.** Inside a
 *   `toEqual` it is a partial matcher wearing a whole-object coat: it accepts
 *   `''`, it accepts `'yesterday'`, and it accepts a `clientTime` the server
 *   invented. The check here is the actual claim — a millisecond-precision
 *   UTC instant that `Date.parse` accepts — asserted once per occurrence, and
 *   THEN made comparable.
 *
 * `generatedAt` is deliberately NOT on the list. The attention strip reads the
 * clock the app was built with, and the attention block below builds an app
 * whose clock is a constant this file chose — so that field is a known value
 * and is asserted as one.
 */
function freezeClocks(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(freezeClocks);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'clientTime' || key === 'serverTime') {
      expect(typeof inner).toBe('string');
      expect(inner).toMatch(ISO_INSTANT);
      expect(Number.isNaN(Date.parse(inner as string))).toBe(false);
      out[key] = key === 'clientTime' ? 'CLIENT-TIME' : 'SERVER-TIME';
      continue;
    }
    out[key] = freezeClocks(inner);
  }
  return out;
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();

  member = await signedIn();
  memberPhone = member.phone;
  outsider = await signedIn();

  // ─── The world, through the doors and nothing else ────────────────────────
  const founded = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: member.headers,
    payload: { name: 'Round Trip Corner' },
  });
  expect(founded.statusCode).toBe(201);
  workspaceId = (founded.json() as { workspaceId: string }).workspaceId;

  // The workflow the founding sequence minted, read off the LEDGER. Nothing in
  // this file chooses it, and every `workflowId`/`stateId` asserted below is
  // compared against what the bootstrap wrote rather than against a literal.
  const { rows: ledger } = await db.pool.query<{ type: string; payload: Record<string, unknown> }>(
    'SELECT type, payload FROM events WHERE workspace_id = $1 ORDER BY workspace_seq',
    [workspaceId],
  );
  const defined = ledger.find((row) => row.type === 'workflow.defined');
  expect(defined).toBeDefined();
  workflowId = defined?.payload['id'] as string;
  initialStateId = defined?.payload['initialStateId'] as string;

  projectId = newUlid();
  await post(member.headers, {
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.created',
    payload: { name: 'Shop floor' },
    actorId: member.userId,
  }, 1);
  // The founder owns the workspace but is not on the project until this lands;
  // without it the visibility pass refuses every read below and the assertions
  // would fire on the wrong guard. Every earlier guard is made to pass first.
  await post(member.headers, {
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.member_added',
    payload: { userId: member.userId, projectAdmin: true },
    actorId: member.userId,
  }, 2);

  parentId = newUlid();
  childId = newUlid();
  await post(member.headers, {
    workspaceId,
    entity: { kind: 'ticket', id: parentId },
    type: 'ticket.created',
    payload: { typeId: 'story', projectId, parentId: null, title: 'Restock the chiller' },
    actorId: member.userId,
  }, 1);
  await post(member.headers, {
    workspaceId,
    entity: { kind: 'ticket', id: childId },
    type: 'ticket.created',
    payload: { typeId: 'task', projectId, parentId, title: 'Count the crates' },
    actorId: member.userId,
  }, 1);
  // Assignment and a transition, so My Work is non-empty and the board holds
  // cards in two DIFFERENT columns. A board with every card in one column
  // cannot tell a working column split from a constant.
  await post(member.headers, {
    workspaceId,
    entity: { kind: 'ticket', id: childId },
    type: 'ticket.assigned',
    payload: { assigneeId: member.userId },
    actorId: member.userId,
  }, 2);
  await post(member.headers, {
    workspaceId,
    entity: { kind: 'ticket', id: childId },
    type: 'ticket.transitioned',
    payload: { to: 'doing' },
    actorId: member.userId,
  }, 3);
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

/**
 * The card a read route must answer with for a given ticket, built from the
 * facts THIS FILE claimed plus the facts the SERVER chose.
 *
 * `workflowId` and `stateId` are parameters rather than literals precisely
 * because the server chose them; the assertions that they are the bootstrap's
 * values live in their own case below, so a card comparison and an
 * "the engine resolved the type" claim cannot pass for each other.
 */
function expectedCard(over: {
  ticketId: string;
  parentId: string | null;
  typeId: string;
  stateId: string;
  stateCategory: string;
  assigneeId: string | null;
  title: string;
  rollup: Record<string, number> | null;
}): Record<string, unknown> {
  return {
    ticketId: over.ticketId,
    workspaceId,
    projectId,
    typeId: over.typeId,
    parentId: over.parentId,
    workflowId,
    stateId: over.stateId,
    stateCategory: over.stateCategory,
    assigneeId: over.assigneeId,
    collaboratorIds: [],
    title: over.title,
    dueDate: { state: 'never-claimed' },
    fields: {
      title: {
        value: over.title,
        actorId: member.userId,
        clientTime: 'CLIENT-TIME',
        serverTime: 'SERVER-TIME',
      },
    },
    stateProvenance: {
      actorId: member.userId,
      clientTime: 'CLIENT-TIME',
      serverTime: 'SERVER-TIME',
      cause: null,
    },
    rollup: over.rollup,
  };
}

describe('the world was built through the doors, and the server chose these values', () => {
  it('the ticket resolved its type against the FOUNDING sequence — nothing here typed the workflow or the state', () => {
    // What a seeded board test cannot say. `applyCommitted` writes
    // `proj_tickets.workflow_id` and `state_id` from the fixture's own literals,
    // so the fixture and the assertion are the same author. Here the only
    // `ticket.created` payload sent was `{typeId:'task'|'story', projectId,
    // parentId, title}` — no workflow, no state — and the engine resolved both
    // by reading the four `ticket-type.defined` events the founding sequence
    // put in this workspace's ledger and the `workflow.defined` beside them.
    expect(workflowId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(initialStateId).toBe('todo');
  });
});

describe('GET /v1/me/workspaces — the directory', () => {
  it('lists the workspace this person founded over the wire, with the name they claimed', async () => {
    // UNIQUELY: the `role: 'owner'` here is `proj_memberships` answering, and
    // the row exists because `bootstrapWorkspace` emitted `membership.granted`
    // from INSIDE the ingest transaction that committed `workspace.created`.
    // Nothing in this file granted anybody anything.
    const res = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: member.headers });
    expect(res.statusCode).toBe(200);
    expect(freezeClocks(res.json())).toEqual({
      workspaces: [{ workspaceId, name: 'Round Trip Corner', role: 'owner' }],
    });
  });

  it("CONTROL — the outsider's own directory is empty, and it is the same 200 route", async () => {
    // This route's refusal for a non-member is an empty list, not a status:
    // the directory is per-caller, so there is no workspace to be refused ABOUT.
    // The control is therefore the emptiness beside the member's non-empty
    // answer in the same run — which is what separates "scoped to the caller"
    // from "returns every workspace in the database".
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me/workspaces',
      headers: outsider.headers,
    });
    expect(res.statusCode).toBe(200);
    expect(freezeClocks(res.json())).toEqual({ workspaces: [] });
  });
});

describe('GET /v1/projects/:projectId/board', () => {
  it('every state of the workspace workflow is a column, and the two real tickets sit in two of them', async () => {
    // UNIQUELY, three things:
    //   1. The column set is `SIMPLE_KANBAN_TEMPLATE` as the founding sequence
    //      cloned it — `todo`/`doing`/`done` with their names, categories and
    //      `blocked:false` — reached through `latestWorkflowDefs` reading
    //      `proj_workflows`, which the bootstrap's `workflow.defined` filled.
    //   2. The child is in `doing` because `ticket.transitioned` passed the
    //      engine's transition table. A seeder writes `state_id='doing'`
    //      directly and never asks whether that edge exists.
    //   3. `rollup.uncategorizedChildren === 0` on the parent. Per
    //      `read-models.ts` that is 0 iff `proj_visibility` and `proj_tickets`
    //      are BOTH current with the ledger — a fact about the ingest
    //      transaction, and the named way to break it is a fixture applying a
    //      subset of the registry.
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/board`,
      headers: member.headers,
    });
    expect(res.statusCode).toBe(200);

    const parentCard = expectedCard({
      ticketId: parentId,
      parentId: null,
      typeId: 'story',
      stateId: 'todo',
      stateCategory: 'open',
      assigneeId: null,
      title: 'Restock the chiller',
      rollup: {
        totalChildren: 1,
        terminalChildren: 0,
        uncategorizedChildren: 0,
        restrictedCount: 0,
      },
    });
    const childCard = expectedCard({
      ticketId: childId,
      parentId,
      typeId: 'task',
      stateId: 'doing',
      stateCategory: 'active',
      assigneeId: member.userId,
      title: 'Count the crates',
      rollup: null,
    });

    expect(freezeClocks(res.json())).toEqual({
      projectId,
      workspaceId,
      columns: [
        {
          workflowId,
          workflowName: 'Simple kanban',
          stateId: 'todo',
          name: 'To do',
          category: 'open',
          blocked: false,
          cards: [parentCard],
        },
        {
          workflowId,
          workflowName: 'Simple kanban',
          stateId: 'doing',
          name: 'Doing',
          category: 'active',
          blocked: false,
          cards: [childCard],
        },
        {
          workflowId,
          workflowName: 'Simple kanban',
          stateId: 'done',
          name: 'Done',
          category: 'terminal',
          blocked: false,
          cards: [],
        },
      ],
    });
  });

  it('CONTROL — the outsider is refused 404, byte-for-byte the read surface refusal', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/board`,
      headers: outsider.headers,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(READ_NOT_FOUND_BODY);
  });
});

describe('GET /v1/projects/:projectId/tickets — the list', () => {
  it('the default flat grouping holds both real tickets, in ticket_id order', async () => {
    // UNIQUELY: the two cards here are assembled by the SAME
    // `assembleTicketCards` the board used, over rows the same ingest wrote —
    // so a projection that wrote a card the board and the list would disagree
    // about cannot exist in this run. The list's own contribution is
    // `nextCursor: null`, which is the pager saying the whole matched set fit,
    // over a matched set that came from real writes rather than from a seeder
    // that chose how many rows there would be.
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/tickets`,
      headers: member.headers,
    });
    expect(res.statusCode).toBe(200);

    // ULIDs minted in the same millisecond have a random low half, so which of
    // the two sorts first is not something this file may hard-code. The ORDER
    // claim is made explicitly below instead; here the expectation is built in
    // whatever order `ORDER BY t.ticket_id` must produce.
    const byId = [parentId, childId].sort();
    const cards = byId.map((id) =>
      id === parentId
        ? expectedCard({
            ticketId: parentId,
            parentId: null,
            typeId: 'story',
            stateId: 'todo',
            stateCategory: 'open',
            assigneeId: null,
            title: 'Restock the chiller',
            rollup: {
              totalChildren: 1,
              terminalChildren: 0,
              uncategorizedChildren: 0,
              restrictedCount: 0,
            },
          })
        : expectedCard({
            ticketId: childId,
            parentId,
            typeId: 'task',
            stateId: 'doing',
            stateCategory: 'active',
            assigneeId: member.userId,
            title: 'Count the crates',
            rollup: null,
          }),
    );

    expect(freezeClocks(res.json())).toEqual({
      projectId,
      groupBy: 'flat',
      groups: [{ key: 'all', label: 'All tickets', cards }],
      nextCursor: null,
    });

    // The order claim, said once and separately from the body comparison.
    const { groups } = res.json() as { groups: Array<{ cards: Array<{ ticketId: string }> }> };
    expect(groups[0]?.cards.map((card) => card.ticketId)).toEqual(byId);
  });

  it('CONTROL — the outsider is refused 404 with the same frozen body', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/tickets`,
      headers: outsider.headers,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(READ_NOT_FOUND_BODY);
  });
});

describe('GET /v1/workspaces/:workspaceId/tickets/:ticketId — the single read', () => {
  it("the child's row names its parent, and the parent is disclosed because this viewer may see it", async () => {
    // UNIQUELY: `parent.kind === 'ticket'` is `canSee` answering about a parent
    // that exists because a `ticket.created` naming it went through the gate.
    // The `seq` on both rows is `proj_visibility`'s own cursor — a DB-minted
    // per-entity sequence, never a number this file chose.
    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/tickets/${childId}`,
      headers: member.headers,
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      ticket: Record<string, unknown>;
      parent: { kind: string; id: string; ticket: Record<string, unknown> };
      rollup: unknown;
    };
    expect(typeof body.ticket['seq']).toBe('number');
    expect(typeof body.parent.ticket['seq']).toBe('number');

    expect(body).toEqual({
      ticket: {
        ticket_id: childId,
        workspace_id: workspaceId,
        project_id: projectId,
        parent_id: parentId,
        own_mode: 'inherit',
        resolved_mode: 'project',
        seq: body.ticket['seq'],
      },
      parent: {
        kind: 'ticket',
        id: parentId,
        ticket: {
          ticket_id: parentId,
          workspace_id: workspaceId,
          project_id: projectId,
          parent_id: null,
          own_mode: 'inherit',
          resolved_mode: 'project',
          seq: body.parent.ticket['seq'],
        },
      },
      // A leaf. `rollupFor` answers null for a ticket with no children, which
      // is the same call `TicketCard.rollup: null` makes.
      rollup: null,
    });
  });

  it('CONTROL — the outsider is refused 404 with this surface own frozen body', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/tickets/${childId}`,
      headers: outsider.headers,
    });
    expect(res.statusCode).toBe(404);
    // This surface predates the shared read 404 and keeps its own constant
    // (`routes/tickets.ts`), so the control is that body and not the other one.
    expect(res.json()).toEqual(NOT_FOUND_BODY);
  });
});

describe('GET /v1/tickets/:id/history — the ledger, filtered', () => {
  it("the child's three events come back in DB-minted seq order, with server clocks the server set", async () => {
    // UNIQUELY, and this is the sharpest case in the file. `applyCommitted`'s
    // own docblock names "seqs from a process map, not the DB" as one of its
    // six absences. Here `seq` is 1, 2, 3 because `nextSeq` allocated them
    // inside the ingest transaction, and `serverTime` is the server's clock at
    // commit — neither is a value this file supplied, and a fixture supplies
    // both. This is the one route whose body IS the ledger, so it is where a
    // fabricated cursor would show.
    const res = await app.inject({
      method: 'GET',
      url: `/v1/tickets/${childId}/history`,
      headers: member.headers,
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      ticketId: string;
      events: Array<Record<string, unknown>>;
    };
    // The event ids are minted per call and are the one other unpredictable
    // value here, so they are replaced the same way the clocks are — and
    // asserted for what they actually claim (three DISTINCT ids) below, rather
    // than lost.
    const frozen = freezeClocks(body) as { events: Array<Record<string, unknown>> };
    const normalised = {
      ...frozen,
      events: frozen.events.map((event) => ({ ...event, id: 'EVENT-ID' })),
    };

    expect(normalised).toEqual({
      ticketId: childId,
      events: [
        {
          id: 'EVENT-ID',
          type: 'ticket.created',
          version: 1,
          payload: { typeId: 'task', projectId, parentId, title: 'Count the crates' },
          actorId: member.userId,
          origin: 'web',
          clientTime: 'CLIENT-TIME',
          serverTime: 'SERVER-TIME',
          seq: 1,
        },
        {
          id: 'EVENT-ID',
          type: 'ticket.assigned',
          version: 1,
          payload: { assigneeId: member.userId },
          actorId: member.userId,
          origin: 'web',
          clientTime: 'CLIENT-TIME',
          serverTime: 'SERVER-TIME',
          seq: 2,
        },
        {
          id: 'EVENT-ID',
          type: 'ticket.transitioned',
          version: 1,
          payload: { to: 'doing' },
          actorId: member.userId,
          origin: 'web',
          clientTime: 'CLIENT-TIME',
          serverTime: 'SERVER-TIME',
          seq: 3,
        },
      ],
    });

    // The ids really are the ones the writer minted and really are distinct —
    // the fact the normaliser above had to flatten, asserted rather than lost.
    expect(new Set(body.events.map((event) => event['id'])).size).toBe(3);
  });

  it('CONTROL — the outsider is refused 404 for a ticket they may not see', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/tickets/${childId}/history`,
      headers: outsider.headers,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NOT_FOUND_BODY);
  });
});

describe('GET /v1/search', () => {
  it('a word from a real ticket title finds it, with a snippet cut from the indexed text', async () => {
    // UNIQUELY: `proj_search.title` was written by the search projection inside
    // the same ingest transaction as `proj_tickets` and `proj_visibility`, and
    // `tsv` is a GENERATED column Postgres derived from it. So a hit here is
    // three projections and one database-computed index agreeing about a row
    // that only a committed `ticket.created` could have produced. A seeded
    // search test writes `proj_search` itself and never exercises the fan-out.
    const res = await app.inject({
      method: 'GET',
      url: `/v1/search?workspaceId=${workspaceId}&q=crates`,
      headers: member.headers,
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as { hits: Array<{ snippet: string }> };
    expect(freezeClocks(body)).toEqual({
      workspaceId,
      query: 'crates',
      hits: [
        {
          card: expectedCard({
            ticketId: childId,
            parentId,
            typeId: 'task',
            stateId: 'doing',
            stateCategory: 'active',
            assigneeId: member.userId,
            title: 'Count the crates',
            rollup: null,
          }),
          // The snippet is `ts_headline` over `title — description — comments`
          // with this route's own `HEADLINE_OPTIONS` markers. Pinned WHOLE
          // rather than probed with `toContain`: the two empty segments after
          // the em dashes are the description and comments this ticket never
          // got, and a `toContain('crates')` would pass for a snippet that had
          // silently started blobbing another ticket's text into this one.
          snippet: 'Count the **crates** \u2014  \u2014 ',
        },
      ],
    });
    // The markup really is markup and not part of the title: the ticket was
    // created as `Count the crates`, so every `*` in that snippet was added by
    // `ts_headline` matching the query term.
    expect(body.hits[0]?.snippet).toContain('**crates**');
  });

  it('CONTROL, same run — a term in nothing returns no hits, so the index is not matching everything', async () => {
    // The membership control alone cannot catch a search that answers `hits:[]`
    // for every query: an empty answer for the member and a 404 for the
    // outsider both pass. This is the axis that actually matters for a text
    // index, and it runs beside the hit above.
    const res = await app.inject({
      method: 'GET',
      url: `/v1/search?workspaceId=${workspaceId}&q=zzzabsentterm`,
      headers: member.headers,
    });
    expect(res.statusCode).toBe(200);
    expect(freezeClocks(res.json())).toEqual({ workspaceId, query: 'zzzabsentterm', hits: [] });
  });

  it('CONTROL — the outsider naming this workspace is refused 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/search?workspaceId=${workspaceId}&q=crates`,
      headers: outsider.headers,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(READ_NOT_FOUND_BODY);
  });
});

describe('GET /v1/me/work', () => {
  it('the assigned child is in `active`, and the unassigned parent is in no group at all', async () => {
    // UNIQUELY, two facts at once:
    //   - `proj_tickets.assignee_id` holds this person because a
    //     `ticket.assigned` event went through the gate and the reducer applied
    //     it. This route's filter IS that column.
    //   - the group is `active` because `state_category` was denormalized by the
    //     reducer at the moment `ticket.transitioned` committed — the category
    //     is read off `SIMPLE_KANBAN_TEMPLATE`'s `doing` state, which nothing
    //     here typed.
    // The parent's absence is the negative half and it can fire: it is a
    // visible ticket in the same project, excluded only because nobody assigned
    // it. `open: []` is that, with the board's `todo` column above as the
    // positive control that the parent exists and is visible.
    const res = await app.inject({
      method: 'GET',
      url: `/v1/me/work?workspaceId=${workspaceId}`,
      headers: member.headers,
    });
    expect(res.statusCode).toBe(200);
    expect(freezeClocks(res.json())).toEqual({
      workspaceId,
      groups: {
        open: [],
        active: [
          expectedCard({
            ticketId: childId,
            parentId,
            typeId: 'task',
            stateId: 'doing',
            stateCategory: 'active',
            assigneeId: member.userId,
            title: 'Count the crates',
            rollup: null,
          }),
        ],
        terminal: [],
      },
    });
  });

  it('CONTROL — the outsider naming this workspace is refused 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/me/work?workspaceId=${workspaceId}`,
      headers: outsider.headers,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(READ_NOT_FOUND_BODY);
  });
});

describe('GET and PUT /v1/me/preferences', () => {
  it('a person who has saved nothing reads the empty document, and a PUT comes back on the next GET', async () => {
    // UNIQUELY, and it is a NEGATIVE about the ledger: preferences are rows and
    // not events (coordination amendment 14), so this is the one write on the
    // whole surface that must NOT reach the ledger. In a file where every other
    // fact arrived as an event, the ledger count before and after the PUT is a
    // real instrument rather than a restatement — and its positive control is
    // every committed event above, which moved that same counter.
    const before = await app.inject({
      method: 'GET',
      url: `/v1/me/preferences?workspaceId=${workspaceId}`,
      headers: member.headers,
    });
    expect(before.statusCode).toBe(200);
    expect(freezeClocks(before.json())).toEqual({ savedFilters: [], listColumns: {}, grouping: {} });

    const eventsBefore = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM events WHERE workspace_id = $1',
      [workspaceId],
    );

    const doc = {
      // `assigneeId`, singular — the SERVER's `filterSpecSchema` spelling. The
      // client's `FilterSpec` (`packages/app-core/src/view-types.ts`) says
      // `assigneeIds: string[]`, and the plural is refused here with
      // `invalid_preferences` because `savedFilterSchema` is `.strict()`. That
      // divergence is pinned in `client-contract.test.ts`; here the point is
      // only that the document the SERVER accepts round-trips.
      savedFilters: [{ id: 'mine', name: 'Mine', filterSpec: { assigneeId: member.userId } }],
      listColumns: { [projectId]: ['status', 'assignee'] },
      grouping: { [projectId]: 'status' },
    };
    const put = await app.inject({
      method: 'PUT',
      url: `/v1/me/preferences?workspaceId=${workspaceId}`,
      headers: member.headers,
      payload: doc,
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual(doc);

    const after = await app.inject({
      method: 'GET',
      url: `/v1/me/preferences?workspaceId=${workspaceId}`,
      headers: member.headers,
    });
    expect(after.json()).toEqual(doc);

    const eventsAfter = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM events WHERE workspace_id = $1',
      [workspaceId],
    );
    expect(eventsAfter.rows[0]?.n).toBe(eventsBefore.rows[0]?.n);
    // The counter is not stuck: the world above put a double-digit number of
    // events in this workspace through the same table.
    expect(eventsBefore.rows[0]?.n ?? 0).toBeGreaterThan(0);
  });

  it('CONTROL — the outsider is refused 404 on both verbs', async () => {
    const get = await app.inject({
      method: 'GET',
      url: `/v1/me/preferences?workspaceId=${workspaceId}`,
      headers: outsider.headers,
    });
    expect(get.statusCode).toBe(404);
    expect(get.json()).toEqual(READ_NOT_FOUND_BODY);

    const put = await app.inject({
      method: 'PUT',
      url: `/v1/me/preferences?workspaceId=${workspaceId}`,
      headers: outsider.headers,
      payload: { savedFilters: [], listColumns: {}, grouping: {} },
    });
    expect(put.statusCode).toBe(404);
    expect(put.json()).toEqual(READ_NOT_FOUND_BODY);
  });
});

/**
 * `GET /v1/workspaces/:workspaceId/attention` — the one clock-sensitive route
 * on this surface, and therefore the one that must vary `TZ`.
 *
 * ## Why this block builds a SECOND app
 *
 * The strip computes against `AppDeps.now`, and the world above was written at
 * the real clock — so nothing in it is stale yet and the strip would answer
 * `items: []`, which is an emptiness that passes whether the route works or
 * not. A second `buildTestApp` over the SAME database, with `now` frozen thirty
 * days after the child's transition, is the whole change: the same real
 * `buildApp`, the same real routes, the same real rows, one constant instead of
 * `new Date()`. Nothing is seeded and nothing is re-written.
 *
 * The member signs in AGAIN through the real OTP path, with the same phone.
 * `helpers/session.ts` records that a repeated phone signs the SAME person in,
 * so this is the same `userId` and the same memberships — minting a new phone
 * here would quietly turn the member into an outsider and every assertion below
 * would be measuring the 404.
 *
 * ## `TZ` is varied, EXPLICITLY, and the variation carries its own control
 *
 * Measured across all 48 test files on an earlier `main`: zero vary `TZ`, seven
 * are clock-sensitive, all seven omit it — and both this machine and the
 * product are `Asia/Kolkata`, so every day-boundary proof in the repo is
 * currently consistent with the property being false. `daysInFlight` is
 * subtracted IST days (`istDaysBetween`), and `istDayOf` shifts by a constant
 * `IST_OFFSET_MINUTES` and then reads UTC getters — so it is process-timezone
 * independent BY CONSTRUCTION, and this asserts that construction rather than
 * assuming it. **The mutation it kills: `formatUtcDay` reading `getDate()` /
 * `getMonth()` / `getFullYear()` instead of their UTC forms.** Under that
 * mutation the three runs below disagree.
 *
 * A three-way equality is worthless if `process.env.TZ` does nothing, so the
 * first case proves the knob moves before any of the others leans on it.
 */
describe('GET /v1/workspaces/:workspaceId/attention — with the clock frozen and TZ varied', () => {
  /** The zones the strip is asked from. IST is the product's own; the others straddle it. */
  const ZONES = ['UTC', 'Asia/Kolkata', 'America/Los_Angeles'] as const;

  let strip: FastifyInstance;
  let stripOtp: LogOtpSender;
  let stripHeaders: { authorization: string };
  /** The IST calendar day the child entered `doing`, computed here, not by the code under test. */
  let enteredIstDay: string;
  /** IST days between that and the frozen "today", differenced here rather than assumed. */
  let expectedDaysInFlight: number;

  /**
   * The IST calendar day of an instant, computed WITHOUT `istDayOf`.
   *
   * Shift by the fixed +05:30 and read the UTC page. Written out rather than
   * imported because an expectation produced by the function under test agrees
   * with it by construction — and this block's whole subject is which calendar
   * page an instant lands on.
   */
  const istDayHere = (instant: string): string =>
    new Date(Date.parse(instant) + (5 * 60 + 30) * 60 * 1000).toISOString().slice(0, 10);
  /** The instant the child entered `doing` — the server's own clock, read back. */
  let enteredStateAt: string;
  /** Exactly thirty days after that instant. The strip's whole notion of "now". */
  let frozenNow: Date;

  beforeAll(async () => {
    const { rows } = await db.pool.query<{ server_time: Date }>(
      `SELECT server_time FROM events
        WHERE entity_kind = 'ticket' AND entity_id = $1 AND type = 'ticket.transitioned'`,
      [childId],
    );
    expect(rows).toHaveLength(1);
    enteredStateAt = (rows[0] as { server_time: Date }).server_time.toISOString();

    // Thirty days on, and then the time of day is PINNED to 20:00Z — which is
    // the whole point of this block and was a real weakness before it was.
    //
    // At 20:00Z the three zones disagree about which calendar page it is:
    // 01:30 the NEXT day in IST, 20:00 the same day in UTC, and lunchtime the
    // same day in Los Angeles. `read-models.ts` names that window — "every
    // instant between 18:30Z and 00:00Z, which is the whole Indian evening" —
    // as exactly where an IST day and a UTC day come apart. A frozen instant
    // inherited from whatever wall clock the suite happened to run at spends
    // most of the day OUTSIDE that window, and a process-timezone-dependent
    // implementation passes all three zones on such a run. Pinning the instant
    // is what turns the three-zone comparison from a coin flip into a test.
    const thirtyDaysOn = new Date(Date.parse(enteredStateAt) + 30 * 24 * 60 * 60 * 1000);
    frozenNow = new Date(`${thirtyDaysOn.toISOString().slice(0, 10)}T20:00:00.000Z`);

    // The day the reason string must name. `istDayHere` above says why it is
    // computed rather than imported.
    enteredIstDay = istDayHere(enteredStateAt);
    // And the count of IST days between them, subtracted the same independent
    // way: two IST day strings, differenced as UTC midnights. Computed rather
    // than asserted as a constant, because pinning the frozen instant to 20:00Z
    // means the answer is 30 or 31 depending on where in the Indian evening the
    // entry instant fell — and hard-coding either would be a fixture that is
    // right on some runs and wrong on others.
    expectedDaysInFlight = Math.round(
      (Date.parse(`${istDayHere(frozenNow.toISOString())}T00:00:00Z`) -
        Date.parse(`${enteredIstDay}T00:00:00Z`)) /
        (24 * 60 * 60 * 1000),
    );
    // The fixture really is the interesting one: the IST page and the UTC page
    // of the frozen instant DIFFER. Without this, the three-zone comparison
    // below could be passing on an instant where every zone agrees anyway.
    expect(istDayHere(frozenNow.toISOString())).not.toBe(frozenNow.toISOString().slice(0, 10));

    const built = buildTestApp(db, { now: () => frozenNow });
    strip = built.app;
    stripOtp = built.otp;
    await strip.ready();
    const again = await signInWithPhone(strip, stripOtp, memberPhone);
    expect(again.userId).toBe(member.userId);
    stripHeaders = { authorization: `Bearer ${again.token}` };
  });

  afterAll(async () => {
    await strip.close();
  });

  it('CONTROL — setting process.env.TZ really does change what this process thinks local time is', () => {
    // Without this, the three identical bodies below prove nothing: they would
    // be identical because the knob is inert. `new Date(0)` is midnight UTC, so
    // its LOCAL hour is 0 in UTC and 5 in IST — a difference only a live TZ
    // switch produces.
    const original = process.env['TZ'];
    try {
      process.env['TZ'] = 'UTC';
      const utcHour = new Date(0).getHours();
      process.env['TZ'] = 'Asia/Kolkata';
      const istHour = new Date(0).getHours();
      expect(utcHour).toBe(0);
      expect(istHour).toBe(5);
    } finally {
      // Restored in a `finally`: a leaked TZ contaminates every later file in
      // this worker, and the failure it causes would surface somewhere else.
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    }
  });

  it('the child is stale after thirty IST days, and the answer is byte-identical from three time zones', async () => {
    // UNIQUELY: `enteredStateAt` is the `serverTime` the ingest transaction
    // stamped on `ticket.transitioned` — not a fixture instant — and
    // `stateCategory: 'active'` is the reducer's denormalization of the state
    // the engine moved the ticket into. Both halves of "this has been sitting in
    // an active state too long" therefore come from the write path. The
    // `settings` block is `getWorkspaceSettings` answering with
    // `provenance: null`, which is the honest "nobody configured this
    // workspace" this response type exists to keep distinguishable from a
    // claimed 7.
    const expected = {
      workspaceId,
      generatedAt: frozenNow.toISOString(),
      settings: { staleDays: 7, dueSoonDays: 7, provenance: null },
      items: [
        {
          kind: 'stale',
          card: expectedCard({
            ticketId: childId,
            parentId,
            typeId: 'task',
            stateId: 'doing',
            stateCategory: 'active',
            assigneeId: member.userId,
            title: 'Count the crates',
            rollup: null,
          }),
          enteredStateAt,
          daysInFlight: expectedDaysInFlight,
          thresholdDays: 7,
          reason: `In an active state since ${enteredIstDay} — past the 7-day staleness threshold.`,
        },
      ],
    };

    const original = process.env['TZ'];
    const bodies: unknown[] = [];
    try {
      for (const zone of ZONES) {
        process.env['TZ'] = zone;
        const res = await strip.inject({
          method: 'GET',
          url: `/v1/workspaces/${workspaceId}/attention`,
          headers: stripHeaders,
        });
        expect(res.statusCode).toBe(200);
        bodies.push(freezeClocks(res.json()));
      }
    } finally {
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    }

    // The whole body, three times, against the same expectation. Asserted per
    // zone rather than by comparing the three to each other: three agreeing
    // WRONG answers would pass a mutual comparison.
    for (const [index, body] of bodies.entries()) {
      expect(body, `zone ${ZONES[index]}`).toEqual(expected);
    }

    // The reason string is already inside `expected`, built from `enteredIstDay`
    // — computed by `istDayHere` and NOT by `istDayOf`, so the agreement is not
    // by construction. What the equality does not say on its own is where the
    // instant came from, and that is this line: `enteredStateAt` on the wire is
    // the `server_time` the ingest transaction stamped, read back out of
    // `events` in `beforeAll`. Both halves of the staleness claim therefore
    // come from the write path rather than from a fixture.
    const first = bodies[0] as { items: Array<{ reason: string; enteredStateAt: string }> };
    expect(first.items[0]?.enteredStateAt).toBe(enteredStateAt);
  });

  it('CONTROL — the outsider is refused 404 by the same frozen-clock app', async () => {
    // The same person, signed in again through the same real OTP path on this
    // app, still belongs to nothing — so the strip that answered a full item
    // above answers the read surface's frozen 404 here, in the same run.
    const again = await signInWithPhone(strip, stripOtp, outsider.phone);
    expect(again.userId).toBe(outsider.userId);

    const res = await strip.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/attention`,
      headers: { authorization: `Bearer ${again.token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(READ_NOT_FOUND_BODY);
  });
});
