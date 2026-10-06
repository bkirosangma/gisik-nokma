import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BUILTIN_TICKET_TYPE_SEEDS,
  SIMPLE_KANBAN_TEMPLATE,
  newUlid,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
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
/**
 * The VERSION the founding sequence published, read off the same
 * `workflow.defined` payload. Typed `number` and asserted `1` below rather than
 * hard-coded into the board expectation: `toEqual` ignores an `undefined`
 * property, so a `payload['version']` that came back missing would make the
 * board's `workflowVersion` line pass against a body that never carried the key.
 */
let workflowVersion: number;

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
  workflowVersion = defined?.payload['version'] as number;

  projectId = newUlid();
  await post(member.headers, {
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.created',
    // The description rides the REAL door (door A, 2026-09-19), so the exact
    // wire assertion below is a witness of the whole path — typed here, parsed
    // by the domain schema, written by the projection, selected by the read and
    // spelled by the route — rather than a witness of the route alone.
    payload: { name: 'Shop floor', description: 'Sprint work for the rollout' },
    actorId: member.userId,
  }, 1);
  // The founder owns the workspace but was not on the project until this landed;
  // without it the visibility pass refused every read below and the assertions
  // would fire on the wrong guard. Every earlier guard is made to pass first.
  // Amended 2026-09-29 (rule A): the owner is on every founded project without this
  // event, so it no longer gates the reads below. It stays as a fixture: it makes
  // the founder an explicit project admin, which is what the assertions were built on.
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
    // The card's key (owner, 2026-09-22), composed by the real assembler on the far
    // side of the real doors: `RT` is the workspace derivation the `/v1/workspaces`
    // read below asserts by name, `SF` is `derivePrefix('Shop floor')`, and the
    // number is the ticket's position in the ledger — the parent was created
    // first, the child second, and nothing else in this file mints a ticket.
    key: over.ticketId === parentId ? 'RTSF-1' : over.ticketId === childId ? 'RTSF-2' : null,
    // The birth priority (spec 2026-09-22): every ticket in this file is created
    // with no explicit priority, so it is P2, attributed like the title claim.
    priority: {
      value: 'P2',
      actorId: member.userId,
      clientTime: 'CLIENT-TIME',
      serverTime: 'SERVER-TIME',
    },
    fields: {
      title: {
        value: over.title,
        actorId: member.userId,
        clientTime: 'CLIENT-TIME',
        serverTime: 'SERVER-TIME',
      },
      priority: {
        value: 'P2',
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
    // None of this file's tickets are ever closed (Task 4, backlog/closed
    // spec §3.1/§3.3) — `TicketCard.closed` is required, never an absent key.
    closed: null,
    // Same rule, same reason (spec §8.1, Task 3 of the second wave): nobody in
    // this file has ranked anything, and `TicketCard.rank` is required, so the
    // wire says `null` rather than dropping the key.
    rank: null,
  };
}

/**
 * The LIST route's card: `expectedCard` plus the five facts ruling P25 clause 1
 * added to it, and only the list route serves them.
 *
 * `stateName` is read out of `SIMPLE_KANBAN_TEMPLATE` rather than typed as a
 * literal, for the reason `workflowId` and `stateId` are parameters above: the
 * name is the SERVER's, out of the definition the bootstrap cloned, and a
 * literal here would be this file and the assertion agreeing with each other
 * instead of with the product. `typeRank` is read out of
 * `BUILTIN_TICKET_TYPE_SEEDS` for the same reason — and it is the reason the
 * epic RANK, not the id `'epic'`, is what the route groups by.
 */
function expectedListCard(
  over: Parameters<typeof expectedCard>[0] & {
    epicId: string | null;
    assignedProvenance: Record<string, unknown> | null;
    hasRestrictedParent: boolean;
  },
): Record<string, unknown> {
  const rank = BUILTIN_TICKET_TYPE_SEEDS.find((seed) => seed.id === over.typeId)?.rank;
  const stateName = SIMPLE_KANBAN_TEMPLATE.states.find((state) => state.id === over.stateId)?.name;
  // Both lookups fail LOUDLY: `undefined` in either slot would compare equal to
  // a route that omitted the field, which is the one way this pin could pass by
  // being broken.
  expect(rank, `no builtin seed for type ${over.typeId}`).toBeTypeOf('number');
  expect(stateName, `no kanban state named ${over.stateId}`).toBeTypeOf('string');
  return {
    ...expectedCard(over),
    typeRank: rank,
    epicId: over.epicId,
    stateName,
    assignedProvenance: over.assignedProvenance,
    hasRestrictedParent: over.hasRestrictedParent,
  };
}

describe('the world was built through the doors, and the server chose these values', () => {
  /**
   * 7.163 — the ticket resolved its type against the FOUNDING sequence — nothing in this test typed the workflow or the state.
   */
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
    // The founding sequence publishes ONE version, and it is the first one.
    // This is the positive control for the `workflowVersion` the board
    // expectation below is built from: a `number` that really is a number, so
    // that line cannot pass by both sides being `undefined`.
    expect(typeof workflowVersion).toBe('number');
    expect(workflowVersion).toBe(1);
  });
});

describe('GET /v1/me/workspaces — the directory', () => {
  /**
   * 7.164 — `GET /v1/me/workspaces` lists the workspace this person founded, over the wire, with the name they claimed.
   */
  it('lists the workspace this person founded over the wire, with the name they claimed', async () => {
    // UNIQUELY: the `role: 'owner'` here is `proj_memberships` answering, and
    // the row exists because `bootstrapWorkspace` emitted `membership.granted`
    // from INSIDE the ingest transaction that committed `workspace.created`.
    // Nothing in this file granted anybody anything.
    const res = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: member.headers });
    expect(res.statusCode).toBe(200);
    // `projects` since rulings P32/P38. EMPTY here and that is the honest
    // answer, not a stub: this workspace was founded by `bootstrapWorkspace`
    // and nothing in this file created a project, so there is none to name.
    // Asserted as part of the exact `toEqual` rather than omitted, because an
    // absent key and an empty list are different claims on this surface.
    expect(freezeClocks(res.json())).toEqual({
      // `projects` since rulings P32/P38, and NOT empty: this world founds
      // 'Shop floor' through the real door, and the caller is the owner — the
      // one role the shipped `canSeeResolved` switch exempts by name, so they
      // are told every project's name. Asserted inside the exact `toEqual`,
      // so a rule that started withholding it from an owner reddens here.
      workspaces: [
        {
          workspaceId,
          name: 'Round Trip Corner',
          // The ticket key's first half (2026-09-20), and this is the ONE place
          // it is asserted against a world built entirely through the real
          // doors: the founding event this run posted carried a NAME and no
          // prefix, so `RT` here is the derivation running on the far side of a
          // real `POST /v1/workspaces`.
          prefix: 'RT',
          role: 'owner',
          // My-work-global T1 (30.011), and NOT empty: the project this run
          // founded through the real door put its founder on the roster as its
          // project admin, so the owner administers it — the one place that is
          // asserted against the real ingest path rather than a seeded row.
          adminProjectIds: [projectId],
          archived: false,
          // Task 16's counts, and this file is the one place they are asserted
          // against a world built ENTIRELY through the real doors — the
          // founder alone in the workspace, and the two tickets this file
          // created earlier in the same run, both visible to the owner. A
          // count computed off the seeded fixtures elsewhere could agree with a
          // route that had drifted from the real ingest path; these cannot.
          memberCount: 1,
          // Task 18, and `0` is the load-bearing value rather than a filler:
          // this caller is the owner, `visibleProjects` names every project for
          // an owner, and the subtraction therefore empties. A non-zero here
          // would mean the count had picked up a project id from outside this
          // workspace's named set — which is the tenancy failure case 13.382
          // seeds directly.
          nameRestrictedProjectCount: 0,
          // 13.987 (door A, 2026-09-19). The description is asserted HERE, in
          // the exact shape, because the value was authored over the real wire
          // in this same run: this line is the end of a path that began at the
          // `project.created` above, and it goes red if ANY link drops the
          // field — the schema refusing it, the projection not writing it, the
          // read not selecting it, or the route not spelling it.
          projects: [
            {
              projectId,
              name: 'Shop floor',
              // The second half, likewise derived from a name that crossed the
              // wire in this same run.
              prefix: 'SF',
              groupId: null,
              archived: false,
              description: 'Sprint work for the rollout',
              ticketCount: 2,
              blockedCount: 0,
            },
          ],
        },
      ],
    });
  });

  /**
   * 7.165 — CONTROL — the outsider’s own directory is empty from the SAME 200 route: this route’s refusal for a non-member IS the emptiness.
   */
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
  /**
   * 7.166 — `GET /v1/projects/:projectId/board` — every state of the workspace’s only workflow is a column, and the two real tickets sit in two of them.
   */
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

    // `parent`/`epic` (owner request, 2026-09-23, board-card badges) are
    // BOARD-ONLY — `expectedCard` stays untouched because `expectedListCard`
    // below builds on it too, and `ListCard` carries neither field. Spread
    // onto the board's own two card objects instead: the parent is a `story`
    // (rank 2, not the epic rank) with no parent of its own, so BOTH are
    // `null`; the child's parent is the story, key `RTSF-1` — the one the
    // key comment above already names — and its epic is also `null`,
    // for the same reason.
    const parentCard = { ...expectedCard({
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
    }), parent: null, epic: null };
    const childCard = { ...expectedCard({
      ticketId: childId,
      parentId,
      typeId: 'task',
      stateId: 'doing',
      stateCategory: 'active',
      assigneeId: member.userId,
      title: 'Count the crates',
      rollup: null,
    }), parent: { ticketId: parentId, key: 'RTSF-1' }, epic: null };

    expect(freezeClocks(res.json())).toEqual({
      projectId,
      workspaceId,
      columns: [
        {
          workflowId,
          workflowName: 'Simple kanban',
          workflowVersion,
          stateId: 'todo',
          name: 'To do',
          category: 'open',
          blocked: false,
          creatable: true,
          cards: [parentCard],
        },
        {
          workflowId,
          workflowName: 'Simple kanban',
          workflowVersion,
          stateId: 'doing',
          name: 'Doing',
          category: 'active',
          blocked: false,
          creatable: true,
          cards: [childCard],
        },
        {
          workflowId,
          workflowName: 'Simple kanban',
          workflowVersion,
          stateId: 'done',
          name: 'Done',
          category: 'terminal',
          blocked: false,
          creatable: false,
          cards: [],
        },
      ],
    });
  });

  /**
   * 7.167 — CONTROL — the outsider is refused 404, byte-for-byte the shared read-surface refusal.
   */
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
  /**
   * 7.168 — `GET /v1/projects/:projectId/tickets` — the default `flat` grouping holds both real tickets, in ticket_id order.
   */
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
        ? expectedListCard({
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
            // A root, so no parent to be restricted; a story, so no epic-ranked
            // ancestor-or-self; never assigned, so no assignment claim exists.
            epicId: null,
            assignedProvenance: null,
            hasRestrictedParent: false,
          })
        : expectedListCard({
            ticketId: childId,
            parentId,
            typeId: 'task',
            stateId: 'doing',
            stateCategory: 'active',
            assigneeId: member.userId,
            title: 'Count the crates',
            rollup: null,
            // Its parent is the story, which is rank 2 and not the epic rank, so
            // the walk finds no epic — `null` here is the walk answering, not the
            // field being absent.
            epicId: null,
            // The `ticket.assigned` this file posted, attributed and stamped by
            // the server. Two different facts from two different events sit on
            // this card now — the STATE claim is the `ticket.transitioned`, the
            // ASSIGNMENT claim is the `ticket.assigned` — and a mapper reading
            // one for the other would still satisfy a presence check.
            assignedProvenance: {
              actorId: member.userId,
              clientTime: 'CLIENT-TIME',
              serverTime: 'SERVER-TIME',
            },
            // The parent is visible to this viewer — the single-read case below
            // is the same fact from the other side.
            hasRestrictedParent: false,
          }),
    );

    expect(freezeClocks(res.json())).toEqual({
      // The body names its workspace, which is the id the client fetches the
      // roster from before it can render these cards' actor ids as names.
      workspaceId,
      projectId,
      groupBy: 'flat',
      groups: [{ key: 'all', label: 'All tickets', cards }],
      nextCursor: null,
    });

    // The order claim, said once and separately from the body comparison.
    const { groups } = res.json() as { groups: Array<{ cards: Array<{ ticketId: string }> }> };
    expect(groups[0]?.cards.map((card) => card.ticketId)).toEqual(byId);
  });

  /**
   * 7.169 — CONTROL — the outsider is refused 404 with the same frozen body.
   */
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
  /**
   * 7.170 — the single read: the child’s row names its parent, and the parent is disclosed because this viewer may see it.
   */
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
      parent: { kind: string; id: string; title: string; ticket: Record<string, unknown> };
      rollup: unknown;
    };
    expect(typeof body.ticket['seq']).toBe('number');
    expect(typeof body.parent.ticket['seq']).toBe('number');

    // `ticketState.transitions[0].seq` is the ledger's own per-entity sequence,
    // minted by the database exactly as the two `seq`s above are, so it is
    // carried across rather than typed — and asserted to BE a number first, so
    // carrying it cannot carry an absence.
    const transitions = (body as unknown as {
      ticketState: { transitions: Array<Record<string, unknown>> };
    }).ticketState.transitions;
    expect(transitions).toHaveLength(1);
    expect(typeof transitions[0]?.['seq']).toBe('number');

    expect(freezeClocks(body)).toEqual({
      ticket: {
        ticket_id: childId,
        workspace_id: workspaceId,
        project_id: projectId,
        parent_id: parentId,
        own_mode: 'inherit',
        resolved_mode: 'project',
        seq: body.ticket['seq'],
      },
      // The domain state, the title and the state provenance joined this body
      // with ruling P25 clause 1. The title is served under `canSee` — the very
      // guard that already stood in front of this handler — and the parent's
      // title under the `canSee` call that chooses the parent's arm.
      ticketState: {
        kind: 'ticket',
        id: childId,
        workspaceId,
        projectId,
        typeId: 'task',
        parentId,
        workflowId,
        workflowVersion: 1,
        stateId: 'doing',
        stateCategory: 'active',
        assigneeId: member.userId,
        collaboratorIds: [],
        fields: {
          title: {
            value: 'Count the crates',
            actorId: member.userId,
            clientTime: 'CLIENT-TIME',
            serverTime: 'SERVER-TIME',
          },
          // The birth priority (spec 2026-09-22): this ticket's `ticket.created`
          // named none, so the reducer's default P2 is the claim, attributed
          // like the title claim above.
          priority: {
            value: 'P2',
            actorId: member.userId,
            clientTime: 'CLIENT-TIME',
            serverTime: 'SERVER-TIME',
          },
        },
        transitions: [
          {
            toStateId: 'doing',
            actorId: member.userId,
            seq: transitions[0]?.['seq'],
            workflowId,
            workflowVersion: 1,
          },
        ],
        // `rowToTicketState` now writes this unconditionally (Task 4,
        // backlog/closed spec §3.1) — this ticket was never closed, so `null`
        // rather than an absent key.
        closed: null,
        rank: null,
        // The third of the family, and this file is where the wire's actual
        // SHAPE is pinned rather than a mapper's reading of it: `toEqual` on the
        // whole `ticketState` is what makes a member reaching the client a fact
        // this test can fail on. Never reopened, so `null` and not an absent key
        // (Task 7, backlog/closed spec §8.2). `reopenedAt` is a sweep input no
        // client surface renders, but it still crosses this body, so it is
        // pinned here for the same reason as the two above.
        reopenedAt: null,
        // The fourth of the family (soft delete, 2026-09-20): `rowToTicketState`
        // writes it unconditionally, so a never-deleted ticket crosses the wire
        // as `null` rather than as an absent key. The whole-state `toEqual` is
        // what catches a producer that skips it — the same shape
        // `packages/domain/test/ticket-state.test.ts` pins on the reducer, since
        // the dual-client rig compares reducers and the wire against one
        // another.
        deleted: null,
      },
      title: 'Count the crates',
      stateProvenance: {
        actorId: member.userId,
        clientTime: 'CLIENT-TIME',
        serverTime: 'SERVER-TIME',
        cause: null,
      },
      // The claim behind `ticketState.assigneeId`, added 2026-09-19 with the
      // sheet's editable assignee — the reader the LIST has always used, called
      // once more on this route. This world assigned the child through
      // `POST /v1/events` (`ticket.assigned`, actor `member`), so the claim is
      // that actor's and both clocks are the server's.
      assignedProvenance: {
        actorId: member.userId,
        clientTime: 'CLIENT-TIME',
        serverTime: 'SERVER-TIME',
        // THREE fields, where `StateProvenance` beside it has four: there is no
        // `cause` on `AssignmentProvenance`, because a move can be caused by a
        // reopened child and an assignment cannot be caused by anything. Asserted
        // by the absence of the key, which `toEqual` on the whole body enforces.
      },
      parent: {
        kind: 'ticket',
        id: parentId,
        title: 'Restock the chiller',
        // P3 — the parent crumb's key. This workspace is created THROUGH THE
        // DOOR (so a founding claim exists), its project is real and the parent
        // is a real ticket, so the composition has all three facts and answers a
        // STRING. ⚠ Asserted as `expect.any(String)` rather than pinned to a
        // literal, and that is a deliberate limit rather than laziness: the
        // literal is derivable from this fixture's own prefixes and the parent's
        // position, but this whole-body `toEqual` runs through `freezeClocks`,
        // and a literal typed from reasoning about that pipeline is exactly the
        // kind of number this series keeps catching. `expect.any(String)` cannot
        // pass on an absence — which is the property that matters here — and the
        // EXACT string is pinned deterministically in
        // `test/routes/ticket-crumbs.test.ts`'s P3 case, which seeds the
        // founding claim itself.
        key: expect.any(String),
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
      // THE COMPOSED KEY, and this is the assertion the whole wire change is
      // for. It reads `RTSF-2` and every character of it is derived:
      // `RT` + `SF` + `-` + `2`.
      //
      // ⚠ **BOTH PREFIXES ARE DERIVED, NOT ENTERED, AND THAT MAKES THIS A
      // STRONGER WITNESS THAN IT FIRST LOOKS.** My first version of this
      // comment said the fixture "ENTERED" them on its founding claims; that was
      // FALSE and an independent reviewer caught it by opening the lines. The
      // founding posts carry names and nothing else — `POST /v1/workspaces` with
      // `{name: 'Round Trip Corner'}` (`:226`) and `project.created` with
      // `{name: 'Shop floor', description: …}` (`:254`) — and this file says so
      // itself at `:450-454`. The `prefix: 'RT'` my comment cited at `:455` is
      // inside the expected body of `GET /v1/me/workspaces`, i.e. an EXPECTED
      // answer, not an input. So `RT` and `SF` are `derivePrefix` running on the
      // far side of a real door, which is a better property to have pinned here
      // than a typed prefix would have been.
      //
      // The number is the ticket's position among its project's creations by
      // `workspace_seq`: `Restock the chiller` (`:273`) is the first and this
      // child the second — `ticketCount: 2` at `:486` agrees.
      //
      // ⚠ Pinning the literal rather than a pattern is deliberate: a regex
      // would pass for a route that composed the wrong prefixes, and the whole
      // point of an exact-value pin is that ANOTHER workspace's key would be a
      // different string. Renaming a fixture that changes these prefixes moves
      // this assertion, which is the correct failure.
      key: 'RTSF-2',
      // The grandparent, 2026-09-20. `null` for a two-hop reason this fixture
      // happens to contain: the child's parent `Restock the chiller` is a
      // `story` (`:274`) and the story's own parent is null, so the walk reaches
      // a root and finds no epic-rank ancestor.
      //
      // ⚠ **A version reporting the IMMEDIATE PARENT would put `Restock the
      // chiller` here and redden** — that is the falsifier this assertion
      // carries. My first version of this comment named ancestor-or-self as the
      // other failing version, and that was WRONG: the walk is rank-filtered, so
      // starting at the ticket itself still finds no `epic`-rank type on this
      // chain and still answers `null`. Corrected rather than deleted, because
      // the difference between the two wrong versions is exactly the difference
      // between the two checks (`16.70`'s sibling arm is the one that witnesses
      // PROPER-versus-self, on a fixture that HAS an epic).
      epic: null,
    });
  });

  /**
   * 7.171 — CONTROL — the outsider is refused 404 with this surface’s own frozen body.
   */
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
  /**
   * 7.172 — `GET /v1/tickets/:id/history` — the child’s three events come back in DB-minted seq order, with the server clocks the SERVER set.
   */
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

  /**
   * 7.173 — CONTROL — the outsider is refused 404 for a ticket they may not see.
   */
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
  /**
   * 7.174 — `GET /v1/search` — a word from a real ticket title finds it, with a snippet cut from the indexed text.
   */
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
      // REQUIRED on the response since the notes series' search plan (Plan 3 of
      // 6, spec §7.7), and empty here: `crates` is in a ticket title and in no
      // note. Pinned as a whole-body `toEqual` rather than relaxed to
      // `toMatchObject`, so the note half of this route is asserted in the same
      // breath as the ticket half — which is the only place both are true at once.
      notes: [],
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
          // WHICH COLUMN MATCHED (2026-09-19). `crates` is in this ticket's
          // TITLE and nowhere else \u2014 the description and comments segments of
          // the snippet above are both empty \u2014 so the derivation must answer
          // `title`, and the exact `toEqual` is what makes this line notice a
          // route that started answering a constant instead.
          matchedIn: 'title',
        },
      ],
    });
    // The markup really is markup and not part of the title: the ticket was
    // created as `Count the crates`, so every `*` in that snippet was added by
    // `ts_headline` matching the query term.
    expect(body.hits[0]?.snippet).toContain('**crates**');
  });

  /**
   * 7.175 — CONTROL, same run — a term in nothing returns no hits, so the index is not matching everything.
   */
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
    expect(freezeClocks(res.json())).toEqual({ workspaceId, query: 'zzzabsentterm', hits: [], notes: [] });
  });

  /**
   * 7.176 — CONTROL — the outsider naming this workspace is refused 404.
   */
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
  /**
   * 7.177 — `GET /v1/me/work` — the assigned child is in `active`, and the unassigned parent is in no group at all.
   */
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
      // `projectNames` since rulings P32/P38 — the names of the projects THESE
      // cards are in, for a viewer who may be told them. The owner may, and the
      // card is in 'Shop floor', so the map has exactly that one entry: a map
      // carrying the viewer's whole visible set would disclose names through a
      // door nobody asked that question of.
      projectNames: { [projectId]: 'Shop floor' },
      // `stateNames` since ruling P40's change set — the name of the state each
      // card is IN, read from the definition its own row names. 'Doing' is
      // `SIMPLE_KANBAN_TEMPLATE`'s name for `doing`, and nothing in this file
      // typed either: the template went through the real founding door, so this
      // entry is the round trip reaching the state VOCABULARY and not only the
      // state id. Inside the exact `toEqual`, so a route that stopped serving
      // it, or served the id instead, reddens here.
      stateNames: { [childId]: 'Doing' },
      // Empty, and it is a real answer rather than an unimplemented key: this
      // world files no contests, so the viewer has no refused claims. Asserted
      // as part of the exact `toEqual` because an absent key and an empty list
      // are different claims on this surface — the same argument the
      // `projects` key above makes one route over.
      contested: [],
      // Empty for the same class of reason as `contested`, and asserted inside
      // the exact `toEqual` rather than omitted: every ticket in this world is
      // project-mode, so no `resolved_user_ids` names anybody and "nothing was
      // handed to you" is the true answer rather than an unserved key. A route
      // that stopped serving `shared`, or served it as a copy of `groups`,
      // reddens here at the real door.
      shared: [],
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

  /**
   * 7.178 — CONTROL — the outsider naming this workspace is refused 404.
   */
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
  /**
   * 7.179 — `GET`/`PUT /v1/me/preferences` — a person who has saved nothing reads the empty document, and a PUT comes back on the next GET.
   */
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

  /**
   * 7.180 — CONTROL — the outsider is refused 404 on BOTH verbs.
   */
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

  /**
   * 7.181 — CONTROL for 7.182, and it is load-bearing: `process.env.TZ` really does change what this process thinks local time is (`new Date(0).getHours()` is 0 under UTC and 5 under Asia/Kolkata). WITHOUT this, 7.182’s three identical bodies would prove nothing — they could be identical because the zone never moved.
   */
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

  /**
   * 7.182 — the attention surface with the clock frozen thirty days after the child’s transition and its time of day pinned to 20:00Z, asked from UTC, Asia/Kolkata and America/Los_Angeles — the bodies are byte-identical, and 7.181 above is what makes that mean something.
   */
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
    // The day in the product's day format ("10 Jul", the year only when it is not
    // the current IST year), built here from the day string with its own month
    // names and not by importing the server's label function.
    const [enteredYear = '', enteredMonth = '', enteredDate = ''] = enteredIstDay.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const enteredDayLabel =
      `${Number(enteredDate)} ${monthNames[Number(enteredMonth) - 1]}` +
      (enteredYear === istDayHere(frozenNow.toISOString()).slice(0, 4) ? '' : ` ${enteredYear}`);
    const expected = {
      workspaceId,
      generatedAt: frozenNow.toISOString(),
      settings: { staleDays: 7, dueSoonDays: 7, autoCloseAfterDays: null, provenance: null },
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
          reason: `In an active state since ${enteredDayLabel}, past the 7-day staleness threshold.`,
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

  /**
   * 7.183 — CONTROL — the outsider is refused 404 by the same frozen-clock app, signed in again through the same real OTP path.
   */
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
