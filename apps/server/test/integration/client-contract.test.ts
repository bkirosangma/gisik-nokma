import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, serverStreamFrameSchema, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createStreamHub } from '../../src/stream/hub.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';
import { fakeSocket } from '../helpers/stream-socket.js';

/**
 * Step 10, Task B — **the divergences between the shipped `/v1` surface and
 * Plan 6's client `DataSource`, pinned so a later reconciliation cannot be
 * silent.**
 *
 * ## This file does not try to make the client type satisfied
 *
 * The shapes disagree, and a suite that asserted the CLIENT's shape would
 * simply be red — it would report Plan 6's unwritten adapter as a server
 * defect, every run, until someone deleted it. So each case below asserts the
 * REAL body verbatim and then pins the disagreement as a named
 * negative-with-positive-control on the specific field:
 *
 *     expect(card).not.toHaveProperty('assignee');   // the client reads card.assignee.name
 *     expect(card).toHaveProperty('assigneeId');     // control, same run: what IS there
 *
 * Green today; RED the day the SERVER moves — every case here reads a real
 * `/v1` body — and red the day the CLIENT moves on the two divergences whose
 * client half is read out of `app-core`'s source (below). That hands the
 * decision to Plan 6 instead of hiding it in a type error nobody compiles.
 *
 * ## Nothing is IMPORTED from `@gisik-nokma/app-core`; two things are READ
 *
 * The refusal to import is deliberate, and not a convenience. A by-package-name
 * import resolves through `./dist`, so this file's failures would depend on
 * build order — a stale `dist` would make a pinned divergence pass or fail for
 * reasons that have nothing to do with either side's source.
 *
 * But a client half encoded ONLY as a literal this file types is a pin on
 * nothing: it can change only when somebody edits this file, so a
 * reconciliation landing in `app-core` leaves every such line green. Measured,
 * not argued, and reproduced here: with the two lists typed as literals,
 * applying BOTH reconciliations to `app-core` at once — `scope-revoked` added
 * to `StreamItem`, `uncategorizedChildren` added to `RollupToViewer` — left
 * this file at 15 passed, 0 failed. The divergences the file exists to pin were
 * gone and the suite did not notice.
 *
 * So the two divergences whose case TURNS on the client's shape —
 * `RollupToViewer`'s three fields and `StreamItem`'s four members — derive that
 * shape from `packages/app-core/src/*.ts` with `readFileSync` on a relative
 * path (`clientTypeFields`, `clientUnionTags`). That reads the checked-in
 * source text, never `./dist`, so the build-order rationale above survives
 * intact while the pin becomes real. Each is asserted with a whole-array
 * `toEqual`, which is simultaneously the positive control and the line that
 * fires on the reconciliation.
 *
 * The REMAINING client expectations are quoted in comments naming the line they
 * came from (`packages/app-core/src/view-types.ts`, `.../data-source.ts`).
 * Those quotations are documentation, not pins: what runs beneath each of them
 * is an assertion on the real server body, which is the half those cases are
 * about.
 *
 * ## The world is built through the shipped doors
 *
 * Same reason as `real-door-round-trip.test.ts`: a divergence measured against
 * a hand-seeded body is a claim about the seeder. Everything here arrived
 * through `signInWithPhone`, `POST /v1/workspaces` and `POST /v1/events`.
 *
 * ## The taxonomy the cases are sorted by
 *
 * Three kinds of gap, and they have different owners:
 *
 * - **Signature gap** — the client method cannot even FORM the request
 *   (`getMyWork()`, `getPreferences()`, `putPreferences()` take no
 *   `workspaceId`; all three routes answer 400 `invalid_query` without one).
 *   Fixed by changing the client's signature.
 * - **Serving gap** — the server HOLDS the fact and does not put it on the
 *   wire (`workflowVersion` lives in `proj_tickets` and appears in no board
 *   body). Fixed by one route change.
 * - **Data gap** — the server does not have the fact at all
 *   (`SearchHit.matchedIn`, `BoardCard.assignee.name`, `WorkspaceRef.projects`,
 *   `MyWorkView.contested`). Fixed by a product decision.
 *
 * Sorting them is the difference between a morning's work and a design round.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;

let owner: { userId: string; headers: { authorization: string } };
let workspaceId: string;
let projectId: string;
let ticketId: string;
/** A child of `ticketId`, so the parent's rollup is non-NULL and its fourth field is reachable. */
let childTicketId: string;
/** Granted then revoked, so the stream really has a `scope-revoked` to emit. */
let exMember: { userId: string; headers: { authorization: string } };

let phoneCounter = 0;

async function signedIn(): Promise<{ userId: string; headers: { authorization: string } }> {
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9190008${String(phoneCounter).padStart(5, '0')}`);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
}

async function post(
  headers: { authorization: string },
  event: Omit<SubmittedEvent, 'id' | 'version' | 'origin' | 'clientTime'>,
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
  const body = res.json() as { results?: Array<{ status?: string; reason?: string }> };
  expect(body.results?.[0]?.status, JSON.stringify(body.results?.[0])).toBe('committed');
}

/**
 * `packages/app-core/src`, reached as a RELATIVE PATH and read as text.
 *
 * Not the package import the docblock refuses, and the distinction is the whole
 * reason this works: `readFileSync` opens the checked-in `.ts`, so no `dist` —
 * fresh or stale — can decide what the two derived pins below see. Nothing
 * under `apps/server/src` imports `app-core` either, so there is no other route
 * by which a build artefact could reach this file.
 */
const APP_CORE_SRC = fileURLToPath(new URL('../../../../packages/app-core/src/', import.meta.url));

/** One client module's source text. */
function clientSource(file: 'view-types.ts' | 'data-source.ts'): string {
  const text = readFileSync(`${APP_CORE_SRC}${file}`, 'utf8');
  // The read found the real module and not an empty or moved file. Every claim
  // derived below is a claim about THIS text, so the text has to be here.
  expect(text, file).toContain('export type');
  return text;
}

/**
 * The field names of `export type <name> = { ... }` in a client module, in
 * source order.
 *
 * Throws rather than returning `[]` when the block is not found: an empty list
 * satisfies every `not.toContain` in this file, which is the one way a derived
 * pin could pass by being broken.
 */
function clientTypeFields(file: 'view-types.ts' | 'data-source.ts', name: string): string[] {
  const block = new RegExp(`export type ${name} = \\{([^{}]*)\\}`).exec(clientSource(file));
  if (block === null) throw new Error(`${file}: no \`export type ${name} = { ... }\` block`);
  return [...(block[1] ?? '').matchAll(/^\s*(\w+)\??:/gm)].map(([, field]) => field ?? '');
}

/**
 * The `type: '...'` discriminants of a union `export type <name> = | ... ;` in
 * a client module. Same fail-loud contract as `clientTypeFields`.
 */
function clientUnionTags(file: 'view-types.ts' | 'data-source.ts', name: string): string[] {
  const decl = new RegExp(`export type ${name} =([\\s\\S]*?);\\s*$`, 'm').exec(clientSource(file));
  if (decl === null) throw new Error(`${file}: no \`export type ${name} = ... ;\` declaration`);
  return [...(decl[1] ?? '').matchAll(/type: '([^']+)'/g)].map(([, tag]) => tag ?? '');
}

/** Every key anywhere in a body, dotted. What an "absent everywhere" claim is made over. */
function allKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => allKeys(item, `${path}[${i}]`));
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => {
    const here = path === '' ? key : `${path}.${key}`;
    return [here, ...allKeys(inner, here)];
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();

  owner = await signedIn();
  exMember = await signedIn();

  const founded = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: owner.headers,
    payload: { name: 'Contract Corner' },
  });
  expect(founded.statusCode).toBe(201);
  workspaceId = (founded.json() as { workspaceId: string }).workspaceId;

  projectId = newUlid();
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.created',
    payload: { name: 'Front counter' },
    actorId: owner.userId,
  });
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.member_added',
    payload: { userId: owner.userId, projectAdmin: true },
    actorId: owner.userId,
  });

  ticketId = newUlid();
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    payload: { typeId: 'task', projectId, parentId: null, title: 'Sweep the aisle' },
    actorId: owner.userId,
  });
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.assigned',
    payload: { assigneeId: owner.userId },
    actorId: owner.userId,
  });

  // A child, so the parent carries a real four-field rollup. Without one every
  // rollup in this world is `null` and the case that pins the fourth field
  // would be asserting a shape that never appears — a check that cannot fail.
  // It is deliberately UNASSIGNED (so the My Work case still sees exactly one
  // card) and its title shares no word with the parent's (so the search case
  // still gets exactly one hit).
  childTicketId = newUlid();
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'ticket', id: childTicketId },
    type: 'ticket.created',
    payload: { typeId: 'sub-task', projectId, parentId: ticketId, title: 'Wipe the shelf' },
    actorId: owner.userId,
  });

  // A membership that is granted and then taken away. The revocation is what
  // makes `visibleEventsFor` yield a `scope-revoked` instruction — and it is a
  // real one, appended through the gated door by the workspace's owner, rather
  // than a scripted generator standing in for the visibility pass.
  const membershipEntity = { kind: 'membership' as const, id: `${workspaceId}:${exMember.userId}` };
  await post(owner.headers, {
    workspaceId,
    entity: membershipEntity,
    type: 'membership.granted',
    payload: { userId: exMember.userId, role: 'member' },
    actorId: owner.userId,
  });
  await post(owner.headers, {
    workspaceId,
    entity: membershipEntity,
    type: 'membership.revoked',
    payload: { userId: exMember.userId },
    actorId: owner.userId,
  });
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('SIGNATURE GAP — three client methods cannot form their request at all', () => {
  /**
   * `data-source.ts` declares `getMyWork(): Promise<MyWorkView>`,
   * `getPreferences(): Promise<UserPreferences>` and
   * `putPreferences(preferences: UserPreferences): Promise<void>` — **no
   * `workspaceId` on any of the three.** Every one of those routes reads
   * `?workspaceId=` before the door and refuses without it.
   *
   * The 400 is the sharpest possible pin. A missing-field assertion on a body
   * says the shape is wrong; this says the request an adapter written to the
   * client's signature would SEND is refused at the door, whole, before
   * membership is even resolved — which is a fact about the method signature
   * and not about the view model.
   */
  const NO_WORKSPACE = [
    { method: 'GET' as const, url: '/v1/me/work' },
    { method: 'GET' as const, url: '/v1/me/preferences' },
    { method: 'PUT' as const, url: '/v1/me/preferences' },
  ];

  for (const { method, url } of NO_WORKSPACE) {
    it(`${method} ${url} with no workspaceId — the request the client's signature can build — is 400 invalid_query`, async () => {
      const refused = await app.inject({
        method,
        url,
        headers: owner.headers,
        ...(method === 'PUT'
          ? { payload: { savedFilters: [], listColumns: {}, grouping: {} } }
          : {}),
      });
      expect(refused.statusCode).toBe(400);
      expect(refused.json()).toEqual({ error: 'invalid_query' });

      // POSITIVE CONTROL, same run, one query parameter apart: the identical
      // request from the identical session, naming the workspace, is answered.
      // Without it "this route refuses everything" passes.
      const answered = await app.inject({
        method,
        url: `${url}?workspaceId=${workspaceId}`,
        headers: owner.headers,
        ...(method === 'PUT'
          ? { payload: { savedFilters: [], listColumns: {}, grouping: {} } }
          : {}),
      });
      expect(answered.statusCode).toBe(200);
    });
  }
});

describe('GET /v1/projects/:projectId/board vs BoardView', () => {
  let body: Record<string, unknown>;
  let column: Record<string, unknown>;
  let card: Record<string, unknown>;

  beforeAll(async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/board`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);
    body = res.json() as Record<string, unknown>;
    const columns = body['columns'] as Array<Record<string, unknown>>;
    // Selected BY TICKET ID and never by position: both tickets sit in `todo`,
    // and which of two ULIDs minted in one millisecond sorts first is not a
    // fact this file may lean on.
    const occupied = columns.find((c) =>
      (c['cards'] as Array<Record<string, unknown>>).some((k) => k['ticketId'] === ticketId),
    );
    expect(occupied).toBeDefined();
    column = occupied as Record<string, unknown>;
    card = (column['cards'] as Array<Record<string, unknown>>).find(
      (k) => k['ticketId'] === ticketId,
    ) as Record<string, unknown>;
    expect(card).toBeDefined();
  });

  it('DATA GAP — `BoardCard.assignee` is an `Actor`; the server sends a bare `assigneeId` and resolves no name', () => {
    // `view-types.ts:38` — `assignee: Actor | null`, and `Actor = {id, name}`.
    // `views/board.tsx:94` calls `actorLabel(card.assignee.id, card.assignee.name)`,
    // so this is not a rename an adapter can perform: the NAME is not in the
    // response and is not in `proj_tickets` either. It is a data gap, and the
    // one real view component on `main` dereferences it.
    expect(card).not.toHaveProperty('assignee');
    // Control, same object, same run — the field that IS there, populated.
    expect(card).toHaveProperty('assigneeId');
    expect(card['assigneeId']).toBe(owner.userId);
  });

  it('the response is `columns` flat; the client reads `groups` of `BoardGroup`, each holding its own `columns`', () => {
    // `view-types.ts:67` — `BoardView = {projectId, groups: BoardGroup[]}`, and
    // `BoardGroup = {workflowId, workflowVersion, workflowName, columns}`. The
    // server flattens that one level: every column carries `workflowId` and
    // `workflowName` itself. An adapter CAN regroup by `workflowId` — so this
    // is a shape gap and not a data gap — but it must know to, and today
    // nothing says so anywhere.
    expect(body).not.toHaveProperty('groups');
    expect(body).toHaveProperty('columns'); // control, same body
    expect(column).toHaveProperty('workflowId');
    expect(column).toHaveProperty('workflowName');
    // And the server carries a `workspaceId` the client's `BoardView` does not.
    expect(body['workspaceId']).toBe(workspaceId);
  });

  it('SERVING GAP — `workflowVersion` appears NOWHERE in the board body, and `proj_tickets` holds it', async () => {
    // `BoardGroup.workflowVersion` (`view-types.ts:62`) is dereferenced at
    // `views/board.tsx:28` as part of a React `key`. The negative is scoped to
    // the WHOLE body — every key at every depth — because a null scoped to one
    // object is a fact about that object only.
    expect(allKeys(body)).not.toContain('workflowVersion');
    expect(allKeys(body).filter((key) => key.endsWith('.workflowVersion'))).toEqual([]);

    // POSITIVE CONTROL, and the one that makes this a SERVING gap rather than a
    // data gap: the server holds the number. `projections/tickets.ts` writes
    // `workflow_version` on every ticket row, so the fix is one route change
    // and not a product decision — which is the distinction that decides who
    // owns it.
    const { rows } = await db.pool.query<{ workflow_version: number }>(
      'SELECT workflow_version FROM proj_tickets WHERE ticket_id = $1',
      [ticketId],
    );
    expect(rows).toHaveLength(1);
    expect(typeof rows[0]?.workflow_version).toBe('number');
    expect(rows[0]?.workflow_version).toBe(1);

    // The control's own control: the walker CAN find a key on this body, so
    // "not in `allKeys`" is a fact about the key and not about the walker.
    expect(allKeys(body)).toContain('columns');
  });

  it('the rollup carries a FOURTH field `RollupToViewer` has no room for', () => {
    // `RollupToViewer` (`view-types.ts:28-32`). READ OUT OF THE CLIENT SOURCE,
    // not transcribed: a literal typed here changes only when somebody edits
    // this file, so it would pin nothing on the client side at all — the day
    // the fourth field arrived in `app-core` this case would have stayed green.
    const CLIENT_ROLLUP_FIELDS = clientTypeFields('view-types.ts', 'RollupToViewer');
    // The pin and its own positive control in one line: the client type is
    // these three fields, in this order, and no others. It is what turns
    // "exactly three" from a transcription into a measurement, and it is what
    // goes red the day anybody adds a fourth to `RollupToViewer`.
    expect(CLIENT_ROLLUP_FIELDS).toEqual(['totalChildren', 'terminalChildren', 'restrictedCount']);

    // The PARENT's rollup, non-null because a real `ticket.created` naming it
    // as parent went through the gate. Asserting this against a leaf's `null`
    // would be a check that cannot fail: the fourth field would never appear.
    const rollup = card['rollup'] as Record<string, number>;
    expect(rollup).not.toBeNull();
    expect(Object.keys(rollup).sort()).toEqual([
      'restrictedCount',
      'terminalChildren',
      'totalChildren',
      'uncategorizedChildren',
    ]);
    expect(rollup['totalChildren']).toBe(1);

    // The divergence itself: one server key the client type cannot hold.
    expect(CLIENT_ROLLUP_FIELDS).not.toContain('uncategorizedChildren');
    // Positive control, same two lists, same run — the other three DO line up,
    // so "the client is missing a key" is not "the two types share nothing".
    for (const field of CLIENT_ROLLUP_FIELDS) {
      expect(rollup).toHaveProperty(field);
    }

    // `read-models.ts` documents `uncategorizedChildren` as the "one projection
    // is behind" signal, so an adapter that dropped it would render
    // "5 of 8 done" over a number the server said was incomplete. This is a
    // divergence the client must ADOPT, not one it may narrow away.
    expect(rollup['uncategorizedChildren']).toBe(0);

    // And the leaf answer is still distinguishable from a missing key: the
    // child's own rollup is `null` and the key is present.
    const childCard = (column['cards'] as Array<Record<string, unknown>>).find(
      (k) => k['ticketId'] === childTicketId,
    ) as Record<string, unknown>;
    expect(childCard).toHaveProperty('rollup');
    expect(childCard['rollup']).toBeNull();
  });
});

describe('GET /v1/search vs SearchHit', () => {
  it('DATA GAP — `matchedIn` is on no hit, and the server cannot compute it', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/search?workspaceId=${workspaceId}&q=aisle`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { hits: Array<Record<string, unknown>> };
    expect(body.hits).toHaveLength(1);
    const hit = body.hits[0] as Record<string, unknown>;

    // `view-types.ts:175-181` — `SearchHit = {ticketId, projectId, title,
    // snippet, matchedIn}` where `matchedIn: 'title'|'description'|'comment'`.
    // The server's `SearchHit` is `{card, snippet}`, and `matchedIn` is a DATA
    // gap: `ts_headline` is given `title || ' — ' || description || ' — ' ||
    // comments` as ONE string (`routes/search.ts`), so the server never learns
    // which of the three matched.
    expect(allKeys(body)).not.toContain('matchedIn');
    expect(hit).not.toHaveProperty('matchedIn');
    expect(hit).not.toHaveProperty('ticketId');
    expect(hit).not.toHaveProperty('title');
    // Controls, same object, same run: what IS there, populated.
    expect(hit).toHaveProperty('snippet');
    expect(hit['snippet']).toContain('**aisle**');
    expect(hit).toHaveProperty('card');
    expect((hit['card'] as Record<string, unknown>)['ticketId']).toBe(ticketId);

    // And the response WRAPS the hits, where `search()` returns `SearchHit[]`.
    expect(Object.keys(body).sort()).toEqual(['hits', 'query', 'workspaceId']);
  });
});

describe('GET /v1/me/work vs MyWorkView', () => {
  it('the grouping MODEL differs — `{open,active,terminal}` against `{assigned,inTransit,contested}`', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/me/work?workspaceId=${workspaceId}`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { groups: Record<string, unknown> };

    // `view-types.ts:157` — `MyWorkView = {assigned, inTransit, contested}`.
    // This is not a rename: the server groups by STATE CATEGORY and the client
    // groups by CLAIM STATUS. `inTransit` is the replica's outbox, which a
    // server by definition has not received; `contested` is Plan 10's
    // `claim.contested` extension point (`routes/my-work.ts` says so in as many
    // words). So one axis cannot be computed from the other at all.
    expect(Object.keys(body.groups).sort()).toEqual(['active', 'open', 'terminal']);
    for (const clientKey of ['assigned', 'inTransit', 'contested']) {
      expect(body.groups).not.toHaveProperty(clientKey);
    }
    // Control, same object, same run: the server's own keys are present AND one
    // of them is populated, so "no client key" is not "no keys". The ticket was
    // never transitioned, so it sits in `todo` — category `open`.
    expect(body.groups).toHaveProperty('open');
    expect((body.groups['open'] as unknown[]).length).toBe(1);

    // The elements are `TicketCard`s, not `WorkItem`s: the client's `WorkItem`
    // (`view-types.ts:136`) carries `projectName` and `stateName`, which are
    // NAMES, and this response carries ids.
    const card = (body.groups['open'] as Array<Record<string, unknown>>)[0] as Record<
      string,
      unknown
    >;
    expect(card).not.toHaveProperty('projectName');
    expect(card).not.toHaveProperty('stateName');
    expect(card).toHaveProperty('projectId'); // control
    expect(card).toHaveProperty('stateId'); // control
  });
});

describe('GET /v1/me/workspaces vs WorkspaceRef', () => {
  it('DATA GAP — no `projects`, and the key is `workspaceId` where the client reads `id`', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me/workspaces',
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { workspaces: Array<Record<string, unknown>> };
    expect(body.workspaces).toHaveLength(1);
    const ref = body.workspaces[0] as Record<string, unknown>;

    // `view-types.ts:5` — `WorkspaceRef = {id, name, projects: ProjectRef[]}`.
    // `projects` is a DATA gap on this surface: no projects-per-workspace read
    // exists anywhere in `/v1`, so an adapter has nothing to call. The `id` vs
    // `workspaceId` rename is adaptable and is pinned beside it so a future
    // reader does not have to re-derive which half is the hard one.
    expect(ref).not.toHaveProperty('projects');
    expect(ref).not.toHaveProperty('id');
    // Controls, same object, same run.
    expect(ref).toHaveProperty('workspaceId');
    expect(ref['workspaceId']).toBe(workspaceId);
    expect(Object.keys(ref).sort()).toEqual(['name', 'role', 'workspaceId']);
    // And the client type has no `role` at all — the server discloses MORE
    // here, which is the one direction that is safe.
  });
});

describe('GET /v1/workspaces/:ws/tickets/:id vs TicketRead', () => {
  it('the route WRAPS a snake_case visibility row — no title, no state, no provenance', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/tickets/${ticketId}`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ticket: Record<string, unknown> };

    // `view-types.ts:115` — `TicketRead = {ticket: TicketState, title,
    // stateProvenance, parent, rollup}`. Two separate disagreements, and a
    // contract register that names only the inner row misses the first:
    //
    //   1. The WRAPPER matches in `parent`/`rollup` and differs in that the
    //      client's `title` and `stateProvenance` sit at the TOP level and are
    //      absent here entirely.
    //   2. The inner `ticket` is a `proj_visibility` row in snake_case, not a
    //      domain `TicketState`.
    expect(Object.keys(body).sort()).toEqual(['parent', 'rollup', 'ticket']);
    expect(body).not.toHaveProperty('title');
    expect(body).not.toHaveProperty('stateProvenance');
    expect(Object.keys(body.ticket).sort()).toEqual([
      'own_mode',
      'parent_id',
      'project_id',
      'resolved_mode',
      'seq',
      'ticket_id',
      'workspace_id',
    ]);
    // Controls, same body, same run: the two keys that DO line up are present
    // and answered, so "no title" is not "no body".
    expect(body).toHaveProperty('parent');
    expect(body).toHaveProperty('rollup');
    expect(body.ticket['ticket_id']).toBe(ticketId);
    // The title exists in the product — it is on the board card — so its
    // absence here is this route's shape and not a missing fact.
    const board = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/board`,
      headers: owner.headers,
    });
    expect(JSON.stringify(board.json())).toContain('Sweep the aisle');
  });
});

describe('GET/PUT /v1/me/preferences vs UserPreferences', () => {
  it("the client's document is REFUSED whole — `.strict()` turns three renames into one 400", async () => {
    // `view-types.ts:191` — `UserPreferences = {version: 1, projects:
    // Record<id, {columns, grouping}>, savedFilters}`, with
    // `SavedFilter = {id, name, filter}`. The server's `preferencesDocSchema`
    // is `.strict()` and its keys are `{savedFilters, listColumns, grouping}`
    // with `SavedFilter.filterSpec`. So this is not an adapter's rename job:
    // the client's document does not reach storage at all.
    const clientDoc = {
      version: 1,
      projects: { [projectId]: { columns: ['status'], grouping: 'epic' } },
      savedFilters: [{ id: 'mine', name: 'Mine', filter: {} }],
    };
    const refused = await app.inject({
      method: 'PUT',
      url: `/v1/me/preferences?workspaceId=${workspaceId}`,
      headers: owner.headers,
      payload: clientDoc,
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toEqual({ error: 'invalid_preferences' });

    // POSITIVE CONTROL, same session, same URL: the SERVER's document is
    // stored and answered back. Without it, "this route refuses every PUT"
    // passes.
    const serverDoc = {
      savedFilters: [{ id: 'mine', name: 'Mine', filterSpec: {} }],
      listColumns: { [projectId]: ['status'] },
      grouping: { [projectId]: 'epic' },
    };
    const stored = await app.inject({
      method: 'PUT',
      url: `/v1/me/preferences?workspaceId=${workspaceId}`,
      headers: owner.headers,
      payload: serverDoc,
    });
    expect(stored.statusCode).toBe(200);
    expect(stored.json()).toEqual(serverDoc);
  });

  it("`FilterSpec` disagrees on plurality — the client's `assigneeIds` array is refused where `assigneeId` is stored", async () => {
    // `view-types.ts:70-81` — the client's `FilterSpec` is
    // `{assigneeIds?: string[], collaboratorIds?: string[], typeIds?: string[],
    // stateIds?: string[], stateCategories?: StateCategory[], projectIds?:
    // string[], dueBefore?, dueAfter?, fields?}`. The server's
    // `filterSpecSchema` is SINGULAR throughout — `assigneeId`, `typeId`,
    // `stateId` — plus `blocked` and a `due` object the client has no key for.
    //
    // This is the most consequential divergence in the file that no `.d.ts`
    // would catch, because `FilterSpec` is a PARAMETER of `getTickets` and
    // `search` as well as a stored field: a client filtering by two assignees
    // has no server request that expresses it.
    const plural = await app.inject({
      method: 'PUT',
      url: `/v1/me/preferences?workspaceId=${workspaceId}`,
      headers: owner.headers,
      payload: {
        savedFilters: [{ id: 'f', name: 'F', filterSpec: { assigneeIds: [owner.userId] } }],
        listColumns: {},
        grouping: {},
      },
    });
    expect(plural.statusCode).toBe(400);
    expect(plural.json()).toEqual({ error: 'invalid_preferences' });

    // Control, one letter apart: the singular spelling, same value, same run.
    const singular = await app.inject({
      method: 'PUT',
      url: `/v1/me/preferences?workspaceId=${workspaceId}`,
      headers: owner.headers,
      payload: {
        savedFilters: [{ id: 'f', name: 'F', filterSpec: { assigneeId: owner.userId } }],
        listColumns: {},
        grouping: {},
      },
    });
    expect(singular.statusCode).toBe(200);
  });
});

describe('the stream union — `scope-revoked` reaches a client that has no member for it', () => {
  it("the server EMITS `scope-revoked`, the published schema accepts it, and the client's union has no such member", async () => {
    // `data-source.ts:22-26` — the client's `StreamItem` union. READ OUT OF THE
    // CLIENT SOURCE as text, so a `dist` built from a different source cannot
    // decide whether this passes AND a reconciliation in `app-core` cannot pass
    // unnoticed. A transcribed literal would have done only the first.
    const CLIENT_STREAM_TYPES = clientUnionTags('data-source.ts', 'StreamItem');
    // The pin and its own positive control: the union is these four members and
    // no others. "Exactly four" is therefore measured here rather than asserted
    // in prose, and **the day somebody adds `scope-revoked` to that union this
    // case goes red** — which is the whole point of the file.
    expect(CLIENT_STREAM_TYPES).toEqual(['event', 'purge', 'caught-up', 'error']);
    expect(CLIENT_STREAM_TYPES).not.toContain('scope-revoked');

    // Now the server half, through the real path. `visibleEventsFor` is the
    // PRODUCTION generator — the hub's default — and the revocation it reads is
    // the one the owner appended through `POST /v1/events` in `beforeAll`.
    // Nothing about the frame is scripted.
    const hub = createStreamHub({ pool: db.pool, onEventCommitted: () => () => {} });
    const socket = fakeSocket();
    try {
      const outcome = await hub.subscribe(exMember.userId, socket, workspaceId, 0);
      expect(outcome).toBe('subscribed');
      await hub.settled();
    } finally {
      hub.close();
    }

    // Both halves of the recording, because they answer different questions.
    // `frames` is the PARSE — proof `serverStreamFrameSchema`, the schema whose
    // own docblock says it exists because "Plans 6, 9 and 10 mock this
    // protocol", accepts the frame. `raw` is the BYTES — what a client actually
    // receives, and therefore what it actually drops.
    const types = socket.frames.map((frame) => frame.type);
    expect(types).toContain('scope-revoked');
    expect(socket.raw.join('\n')).toContain('"type":"scope-revoked"');
    expect(serverStreamFrameSchema.parse({ type: 'scope-revoked', workspaceId })).toEqual({
      type: 'scope-revoked',
      workspaceId,
    });

    // So a revocation arrives at a client as an unrecognised `type` and is
    // silently dropped, leaving stale authorization in the replica's cache.
    // That is the consequence, and it is the client's omission that has to
    // change — the server frame is emitted, published and parseable.
    // `types` widened to `string[]` deliberately: the frame types are a literal
    // union and `CLIENT_STREAM_TYPES` is now read from a file, so TS refuses
    // the comparison outright. Refusing it is the wrong answer here — the
    // question is what the two lists share at RUNTIME, and a client tag the
    // server union has never heard of is precisely the case worth asking about.
    expect(CLIENT_STREAM_TYPES.some((type) => (types as string[]).includes(type))).toBe(false);
  });

  it("the event frame's envelope carries `workspaceSeq`, which the client's `EventEnvelope` has no field for", async () => {
    // `data-source.ts:23` — the client's `event` frame is
    // `{type: 'event', envelope: EventEnvelope}`. The server sends a
    // `LedgerEvent`, which is `EventEnvelope` PLUS `seq` and `workspaceSeq`.
    // `workspaceSeq` is the field the RESUME protocol needs: `subscribe` takes
    // `afterSeq` and `caught-up` reports one, both in workspace-cursor terms.
    // A client typed to `EventEnvelope` cannot name the cursor it must send
    // back — the divergence is a broken resume, not a cosmetic one.
    const hub = createStreamHub({ pool: db.pool, onEventCommitted: () => () => {} });
    const socket = fakeSocket();
    try {
      await hub.subscribe(owner.userId, socket, workspaceId, 0);
      await hub.settled();
    } finally {
      hub.close();
    }

    const events = socket.frames.filter((frame) => frame.type === 'event');
    expect(events.length).toBeGreaterThan(0);
    for (const frame of events) {
      expect(frame).toHaveProperty('envelope.workspaceSeq');
      expect(typeof (frame as { envelope: { workspaceSeq: unknown } }).envelope.workspaceSeq).toBe(
        'number',
      );
    }
    // Control, same run: the owner's socket got the `caught-up` whose `seq` is
    // in the SAME workspace-cursor currency, so the two really are one
    // protocol and `workspaceSeq` is the field that joins them.
    const caughtUp = socket.frames.find((frame) => frame.type === 'caught-up');
    expect(caughtUp).toBeDefined();
    const last = events[events.length - 1] as { envelope: { workspaceSeq: number } };
    expect((caughtUp as { seq: number }).seq).toBe(last.envelope.workspaceSeq);
  });
});
