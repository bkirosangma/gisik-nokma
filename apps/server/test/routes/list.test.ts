import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { newUlid, type FilterSpec, type LedgerEvent, type ListResponse } from '@gisik-nokma/domain';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * Plan 5 Task 9 — `GET /v1/projects/:projectId/tickets`, the list read.
 *
 * ## The door is Task 8's, measured the same way
 *
 * This is the second route on the branch and it stands behind the same gate, so
 * the four cells are pinned again here rather than assumed to be inherited —
 * the gate is written per route, so "board does it" is not evidence about this
 * one:
 *
 * | caller | answer | the case that pins it |
 * |---|---|---|
 * | no session, or a forged bearer | **401** `{error:'unauthenticated'}` | "7.17 no session is 401 …" |
 * | a session in a DIFFERENT workspace | **404** | "7.17 a stranger, a neighbour …" |
 * | a project id that does not exist | **404**, byte-identical | same case, headers compared |
 * | a workspace member NOT on the project | **200**, `groups: []` | "7.17 an on-workspace, off-project member …" |
 *
 * ## Three things this file works hard not to prove vacuously
 *
 * 1. **Pagination.** The seeded world holds three tickets a member may see —
 *    fewer than one default page — so a page-size assertion against it could
 *    only ever pass. `bulkProject` therefore carries SIXTY tickets, which is the
 *    only fixture on the branch that can tell `DEFAULT_LIMIT = 50` from
 *    `DEFAULT_LIMIT = 1000`, and its second page holds DIFFERENT ids from its
 *    first.
 * 2. **Ordering.** The contract IS `ticket_id` order, so no fixture can make the
 *    correct order differ from id order — that would be asserting the opposite
 *    of the contract. What a fixture CAN do is make id order differ from
 *    INSERTION order, and `bulkProject`'s ids are hand-built Crockford strings
 *    inserted in reverse, so a route that returned rows in the order the ledger
 *    wrote them fails on the first page.
 * 3. **The cursor is an input from the caller**, so it gets the treatment an
 *    input gets: a foreign workspace's ticket id, an invisible ticket's id and a
 *    hostile non-ULID string are each handed back as a cursor, each with a
 *    positive control in the same case so that an empty answer means "narrowed"
 *    rather than "this route answers nothing".
 *
 * ## One database, one seed, everything in `beforeAll`
 *
 * `seedReadScenario` refuses a second seed into one database, so this file takes
 * one `createTestDatabase` and seeds once. The extra fixtures below are seeded
 * in the SAME `beforeAll`, in projects of their own, so that no case changes
 * what another case measures and no case depends on declaration order. They live
 * here rather than in `read-app.ts` because that helper is the shared world for
 * Tasks 8–15 and every fixture in it is justified for all of them; sixty rows of
 * pagination bait are this task's problem alone.
 *
 * ## Nothing on this response moves with `TZ`
 *
 * Stated rather than skipped, as `board.test.ts` states it. The only times a
 * card carries are `stateProvenance`'s two `timestamptz` columns rendered by
 * `toISOString()` — one instant, spelled with a `Z`. The `due` filter compares
 * IST DAY STRINGS as text against a stored day string and reads no clock at all.
 * So a `TZ`-varying case here would be a check that cannot fail, and the honest
 * thing is to say so instead of adding one.
 */

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let db: TestDatabase;
let read: ReadWorld;
let fixtures: ListFixtures;

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  fixtures = await seedListFixtures(db.pool, read);
}, 120_000);

afterAll(async () => {
  await read.app.close();
  await db.drop();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type ListFixtures = {
  /** Two `invoice`-typed tickets carrying a custom `amount` field. */
  filterProjectId: string;
  invoiceLowId: string;
  invoiceHighId: string;
  /**
   * The epic-grouping world: a custom type at the epic RANK, and an
   * epic-rank ancestor the member may not see holding a child they may.
   */
  epicProjectId: string;
  initiativeId: string;
  underInitiativeId: string;
  hiddenEpicId: string;
  hiddenEpicTitle: string;
  visibleChildId: string;
  /** Sixty tickets whose ids sort in the OPPOSITE order to their insertion. */
  bulkProjectId: string;
  bulkIdsSorted: string[];
  bulkIdsInsertionOrder: string[];
};

const BULK_COUNT = 60;

/**
 * Crockford base32 — the ULID alphabet, `I`, `L`, `O` and `U` absent — in
 * ascending byte order, so a suffix built from it sorts in Postgres exactly as
 * it sorts in JavaScript.
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A hand-built ticket id, valid against `ULID_REGEX` and ordered by `index`.
 *
 * `newUlid()` is monotonic, so ids minted in a loop come out in insertion order
 * and an ordering assertion over them agrees with a route that has no `ORDER BY`
 * at all. These are built instead, and the seed inserts them BACKWARDS: id order
 * and insertion order are then opposites, and only one of them is the contract.
 */
function bulkTicketId(index: number): string {
  const suffix = `${CROCKFORD[Math.floor(index / CROCKFORD.length)]}${CROCKFORD[index % CROCKFORD.length]}`;
  return `0BK${'0'.repeat(21)}${suffix}`;
}

async function seedListFixtures(pool: Pool, world: ReadWorld): Promise<ListFixtures> {
  const ws = { workspaceId: world.world.workspaceId, actorId: world.world.owner };
  const filterProjectId = newUlid();
  const epicProjectId = newUlid();
  const bulkProjectId = newUlid();
  const invoiceLowId = newUlid();
  const invoiceHighId = newUlid();
  const initiativeId = newUlid();
  const underInitiativeId = newUlid();
  const hiddenEpicId = newUlid();
  const hiddenEpicTitle = 'Confidential programme';
  const visibleChildId = newUlid();

  const project = (projectId: string, name: string): LedgerEvent[] => [
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: world.world.owner, projectAdmin: true } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: world.world.member, projectAdmin: false } }),
  ];

  const bulkIdsSorted = Array.from({ length: BULK_COUNT }, (_, index) => bulkTicketId(index));
  const bulkIdsInsertionOrder = [...bulkIdsSorted].reverse();

  const events: LedgerEvent[] = [
    ...project(filterProjectId, 'Invoices'),
    ...project(epicProjectId, 'Programmes'),
    ...project(bulkProjectId, 'Bulk'),

    // A custom type carrying a custom field. Rank 3 — a Task, not an epic — so
    // it changes nothing about the epic grouping.
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket-type', id: 'invoice' },
      type: 'ticket-type.defined',
      payload: {
        id: 'invoice',
        name: 'Invoice',
        icon: 'receipt',
        rank: 3,
        workflowId: world.world.workflowId,
        fields: [{ id: 'amount', name: 'Invoice amount', type: 'text' }],
      },
    }),
    // A custom type at the epic RANK. `rank: 1` is written as the built-in
    // epic's rank deliberately — this fixture is the whole reason the route
    // resolves on rank rather than on the id `'epic'`.
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket-type', id: 'initiative' },
      type: 'ticket-type.defined',
      payload: {
        id: 'initiative',
        name: 'Initiative',
        icon: 'flag',
        rank: 1,
        workflowId: world.world.workflowId,
        fields: [],
      },
    }),

    makeCommitted({ ...ws, entity: { kind: 'ticket', id: invoiceLowId }, type: 'ticket.created', payload: { typeId: 'invoice', projectId: filterProjectId, parentId: null, title: 'July printing invoice' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: invoiceLowId }, type: 'ticket.field_set', payload: { fieldId: 'amount', value: '4200' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: invoiceHighId }, type: 'ticket.created', payload: { typeId: 'invoice', projectId: filterProjectId, parentId: null, title: 'August printing invoice' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: invoiceHighId }, type: 'ticket.field_set', payload: { fieldId: 'amount', value: '5300' } }),

    makeCommitted({ ...ws, entity: { kind: 'ticket', id: initiativeId }, type: 'ticket.created', payload: { typeId: 'initiative', projectId: epicProjectId, parentId: null, title: 'Shop-front refresh' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: underInitiativeId }, type: 'ticket.created', payload: { typeId: 'task', projectId: epicProjectId, parentId: initiativeId, title: 'Repaint the shutter' } }),

    // The leak fixture: an epic-rank ancestor the member may NOT see, holding a
    // child they MAY. `visibility.set` on the child is what makes it reachable —
    // a child authors its own audience and stops inheriting.
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: hiddenEpicId }, type: 'ticket.created', payload: { typeId: 'epic', projectId: epicProjectId, parentId: null, title: hiddenEpicTitle } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: hiddenEpicId }, type: 'visibility.set', payload: { ticketId: hiddenEpicId, mode: 'explicit', userIds: [world.world.owner] } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: visibleChildId }, type: 'ticket.created', payload: { typeId: 'task', projectId: epicProjectId, parentId: hiddenEpicId, title: 'Visible child of a hidden epic' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: visibleChildId }, type: 'visibility.set', payload: { ticketId: visibleChildId, mode: 'explicit', userIds: [world.world.owner, world.world.member] } }),

    ...bulkIdsInsertionOrder.map((ticketId, index) =>
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId: bulkProjectId, parentId: null, title: `Bulk item ${index}` },
      }),
    ),
  ];

  await applyCommitted(pool, events);

  return {
    filterProjectId,
    invoiceLowId,
    invoiceHighId,
    epicProjectId,
    initiativeId,
    underInitiativeId,
    hiddenEpicId,
    hiddenEpicTitle,
    visibleChildId,
    bulkProjectId,
    bulkIdsSorted,
    bulkIdsInsertionOrder,
  };
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

type ListQuery = {
  groupBy?: string;
  filter?: FilterSpec | string;
  parentId?: string;
  cursor?: string;
  limit?: string | number;
};

function listUrl(projectId: string, query: ListQuery = {}): string {
  const parts: string[] = [];
  if (query.groupBy !== undefined) parts.push(`groupBy=${encodeURIComponent(query.groupBy)}`);
  if (query.filter !== undefined) {
    const raw = typeof query.filter === 'string' ? query.filter : JSON.stringify(query.filter);
    parts.push(`filter=${encodeURIComponent(raw)}`);
  }
  if (query.parentId !== undefined) parts.push(`parentId=${encodeURIComponent(query.parentId)}`);
  if (query.cursor !== undefined) parts.push(`cursor=${encodeURIComponent(query.cursor)}`);
  if (query.limit !== undefined) parts.push(`limit=${encodeURIComponent(String(query.limit))}`);
  return `/v1/projects/${projectId}/tickets${parts.length > 0 ? `?${parts.join('&')}` : ''}`;
}

function getList(role: ReadRole, projectId: string, query: ListQuery = {}): Promise<InjectResponse> {
  return read.app.inject({
    method: 'GET',
    url: listUrl(projectId, query),
    headers: read.authOf(role),
  });
}

async function listOf(role: ReadRole, projectId: string, query: ListQuery = {}): Promise<ListResponse> {
  const response = await getList(role, projectId, query);
  expect(response.statusCode).toBe(200);
  return response.json() as ListResponse;
}

function ids(list: ListResponse): string[] {
  return list.groups.flatMap((group) => group.cards.map((card) => card.ticketId));
}

async function idsOf(role: ReadRole, projectId: string, query: ListQuery = {}): Promise<string[]> {
  return ids(await listOf(role, projectId, query));
}

function byKey(list: ListResponse): Record<string, { label: string; cards: string[] }> {
  return Object.fromEntries(
    list.groups.map((group) => [
      group.key,
      { label: group.label, cards: group.cards.map((card) => card.ticketId) },
    ]),
  );
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

/** The three tickets the seeded world's `member` may see, in `ticket_id` order. */
function memberVisible(): string[] {
  return [read.world.epicId, read.world.taskInEpicId, read.world.sharedTaskId].sort();
}

// ---------------------------------------------------------------------------

describe('GET /v1/projects/:projectId/tickets — the flat list and its filters', () => {
  it('7.18 answers the visible flat list by default: one group, every card the caller may see, no cursor', async () => {
    const list = await listOf('member', read.world.projectId);
    expect(list.projectId).toBe(read.world.projectId);
    expect(list.groupBy).toBe('flat');
    expect(list.groups).toHaveLength(1);
    expect(list.groups[0]?.key).toBe('all');
    expect(ids(list)).toEqual(memberVisible());
    // `null` here means "there is no next page", and the positive control for
    // it is the pagination case below, where the SAME field is a real id.
    expect(list.nextCursor).toBeNull();
  });

  it('7.18 filters compose and NARROW: assignee + state category + due window answers one ticket, and each term alone answers more', async () => {
    const composed = await idsOf('member', read.world.projectId, {
      filter: { assigneeId: read.world.member, stateCategory: 'active', due: { before: '2026-08-31' } },
    });
    expect(composed).toEqual([read.world.taskInEpicId]);

    // The positive controls that make the single answer mean composition: each
    // term on its own admits strictly more, so the narrow answer is the
    // conjunction and not a route that answers one ticket to everything.
    expect(await idsOf('member', read.world.projectId, { filter: { stateCategory: 'active' } })).toEqual(
      [read.world.taskInEpicId, read.world.sharedTaskId].sort(),
    );
    expect(await idsOf('member', read.world.projectId, { filter: { due: { before: '2026-08-31' } } })).toEqual([
      read.world.taskInEpicId,
    ]);
    expect(await idsOf('member', read.world.projectId, { filter: { assigneeId: read.world.member } })).toEqual([
      read.world.taskInEpicId,
    ]);
    // …and a due window that excludes the one dated ticket answers nothing,
    // which is the same filter reaching the opposite conclusion.
    expect(await idsOf('member', read.world.projectId, { filter: { due: { before: '2026-08-01' } } })).toEqual([]);
  });

  it('7.18 filters on the blocked flag through the workflow definition, and `blocked: false` is its complement rather than its absence', async () => {
    expect(await idsOf('member', read.world.projectId, { filter: { blocked: true } })).toEqual([
      read.world.sharedTaskId,
    ]);
    expect(await idsOf('member', read.world.projectId, { filter: { blocked: false } })).toEqual(
      [read.world.epicId, read.world.taskInEpicId].sort(),
    );
  });

  it('7.18 joins a text term through FTS, and two different terms answer two different tickets', async () => {
    expect(await idsOf('member', read.world.projectId, { filter: { text: 'GST' } })).toEqual([
      read.world.taskInEpicId,
    ]);
    // A second term with a different answer: without it, a route that answered
    // its first visible ticket to every text query would pass the line above.
    expect(await idsOf('member', read.world.projectId, { filter: { text: 'licence' } })).toEqual([
      read.world.sharedTaskId,
    ]);
    expect(await idsOf('member', read.world.projectId, { filter: { text: 'zzzznotpresent' } })).toEqual([]);
  });

  it('7.18 filters custom fields by eq and by contains, against a project holding two of them', async () => {
    // The positive control first: this project holds TWO invoices, so selecting
    // one is a filter and not the whole project.
    expect(await idsOf('member', fixtures.filterProjectId)).toEqual(
      [fixtures.invoiceLowId, fixtures.invoiceHighId].sort(),
    );
    expect(
      await idsOf('member', fixtures.filterProjectId, {
        filter: { fields: [{ fieldId: 'amount', op: 'eq', value: '4200' }] },
      }),
    ).toEqual([fixtures.invoiceLowId]);
    expect(
      await idsOf('member', fixtures.filterProjectId, {
        filter: { fields: [{ fieldId: 'amount', op: 'contains', value: '42' }] },
      }),
    ).toEqual([fixtures.invoiceLowId]);
    expect(
      await idsOf('member', fixtures.filterProjectId, {
        filter: { fields: [{ fieldId: 'amount', op: 'contains', value: '53' }] },
      }),
    ).toEqual([fixtures.invoiceHighId]);
    expect(
      await idsOf('member', fixtures.filterProjectId, {
        filter: { fields: [{ fieldId: 'amount', op: 'eq', value: '9999' }] },
      }),
    ).toEqual([]);
  });
});

describe('GET /v1/projects/:projectId/tickets — groupings', () => {
  it('7.19 groups by epic: the epic heads its own group, its child joins it, and the parentless task falls to `no-epic`', async () => {
    const grouped = byKey(await listOf('member', read.world.projectId, { groupBy: 'epic' }));
    expect(grouped[read.world.epicId]?.label).toBe('Registrations drive');
    expect(grouped[read.world.epicId]?.cards).toEqual(
      [read.world.epicId, read.world.taskInEpicId].sort(),
    );
    expect(grouped['no-epic']).toEqual({ label: 'No epic', cards: [read.world.sharedTaskId] });
  });

  it('7.19 PLANTED DEFECT: a custom type at the epic RANK heads its own group — the rank is the concept, `epic` is only one id of it', async () => {
    // A workspace that calls its top rung "Initiative" gets headings, not a
    // "no-epic" pile. Resolving on `typeId === 'epic'` fails both assertions
    // below; resolving on the rank passes both.
    const grouped = byKey(await listOf('member', fixtures.epicProjectId, { groupBy: 'epic', limit: 200 }));
    expect(grouped[fixtures.initiativeId]?.label).toBe('Shop-front refresh');
    expect(grouped[fixtures.initiativeId]?.cards).toEqual(
      [fixtures.initiativeId, fixtures.underInitiativeId].sort(),
    );
    expect(grouped['no-epic']?.cards ?? []).not.toContain(fixtures.underInitiativeId);
  });

  it('7.80 PLANTED DEFECT: an epic-rank ancestor the caller may NOT see never becomes their group key or LABEL — the walk carries the visibility predicate too', async () => {
    const response = await getList('member', fixtures.epicProjectId, { groupBy: 'epic', limit: 200 });
    expect(response.statusCode).toBe(200);
    // Positive controls: the body carries the child, so the absences below mean
    // absence rather than an error page with nothing in it.
    expect(response.body).toContain(fixtures.visibleChildId);
    expect(response.body).toContain('Visible child of a hidden epic');

    // THE TITLE is what a grouping leaks, and it is the thing spec line 117
    // refuses: "existence, no title". It appears nowhere.
    expect(response.body).not.toContain(fixtures.hiddenEpicTitle);
    const list = response.json() as ListResponse;
    const grouped = byKey(list);
    expect(list.groups.map((group) => group.key)).not.toContain(fixtures.hiddenEpicId);
    expect(list.groups.map((group) => group.label)).not.toContain(fixtures.hiddenEpicTitle);
    expect(grouped['no-epic']?.cards).toEqual([fixtures.visibleChildId]);

    // The ID, on the other hand, IS disclosed — on the child's own `parentId`,
    // and deliberately. `TicketCard`'s docblock states it as a decided trade
    // ("a viewer who cannot see the parent still gets its id here … spec line
    // 117, 'existence, no title'"), so this assertion is not a concession: it is
    // the boundary of the disclosure, pinned, so that the day the product moves
    // that line this case says so rather than passing quietly.
    const child = list.groups
      .flatMap((group) => group.cards)
      .find((card) => card.ticketId === fixtures.visibleChildId);
    expect(child?.parentId).toBe(fixtures.hiddenEpicId);

    // The positive control that makes the member's `no-epic` a REFUSAL and not
    // a route that groups nothing: the owner, who may see the epic, gets it as
    // a key with its title as the label, holding both tickets.
    const ownersView = byKey(await listOf('owner', fixtures.epicProjectId, { groupBy: 'epic', limit: 200 }));
    expect(ownersView[fixtures.hiddenEpicId]).toEqual({
      label: fixtures.hiddenEpicTitle,
      cards: [fixtures.hiddenEpicId, fixtures.visibleChildId].sort(),
    });
    expect(ownersView['no-epic']).toBeUndefined();
  });

  it('7.19 groups by status with the state name as the label, by assignee with an `unassigned` bucket, and by type', async () => {
    const status = byKey(await listOf('member', read.world.projectId, { groupBy: 'status' }));
    expect(status).toEqual({
      [`${read.world.workflowId}:doing`]: { label: 'Doing', cards: [read.world.taskInEpicId] },
      [`${read.world.workflowId}:todo`]: { label: 'To do', cards: [read.world.epicId] },
      [`${read.world.workflowId}:waiting`]: {
        label: 'Waiting on counterparty',
        cards: [read.world.sharedTaskId],
      },
    });

    const assignee = byKey(await listOf('member', read.world.projectId, { groupBy: 'assignee' }));
    expect(assignee[read.world.member]?.cards).toEqual([read.world.taskInEpicId]);
    expect(assignee['unassigned']).toEqual({
      label: 'Unassigned',
      cards: [read.world.epicId, read.world.sharedTaskId].sort(),
    });

    const type = byKey(await listOf('member', read.world.projectId, { groupBy: 'type' }));
    expect(Object.keys(type).sort()).toEqual(['epic', 'task']);
    expect(type['epic']?.cards).toEqual([read.world.epicId]);
    expect(type['task']?.cards).toEqual([read.world.taskInEpicId, read.world.sharedTaskId].sort());
  });

  it('7.19 a grouping ARRANGES the same matched set — every grouping of one project holds exactly the same card ids', async () => {
    const flat = await idsOf('member', read.world.projectId);
    for (const groupBy of ['status', 'assignee', 'type', 'epic']) {
      expect((await idsOf('member', read.world.projectId, { groupBy })).sort()).toEqual([...flat].sort());
    }
  });

  it('7.19 an empty answer is `groups: []` — no bucket is emitted for cards that are not there', async () => {
    const empty = await listOf('member', read.world.projectId, { filter: { text: 'zzzznotpresent' } });
    expect(empty.groups).toEqual([]);
    // The positive control for the `[]`: the same route, same viewer, same
    // project, one different filter term, answers three buckets' worth.
    expect(ids(await listOf('member', read.world.projectId))).toHaveLength(3);
  });
});

describe('GET /v1/projects/:projectId/tickets — hierarchy', () => {
  it('7.20 answers direct children by `parentId` and roots by `parentId=root`', async () => {
    expect(await idsOf('member', read.world.projectId, { parentId: read.world.epicId })).toEqual([
      read.world.taskInEpicId,
    ]);
    expect(await idsOf('member', read.world.projectId, { parentId: 'root' })).toEqual(
      [read.world.epicId, read.world.sharedTaskId].sort(),
    );
    // The positive control that makes both mean "filtered": no `parentId` at
    // all answers the union, so neither of the two above is the whole project.
    expect(await idsOf('member', read.world.projectId)).toEqual(memberVisible());
  });

  it('7.20 `parentId` is a narrowing conjunct and not a way out of the project: a foreign parent answers nothing', async () => {
    expect(
      await idsOf('member', read.world.projectId, { parentId: read.neighbour.ticketId }),
    ).toEqual([]);
    expect(await idsOf('member', read.world.projectId, { parentId: newUlid() })).toEqual([]);
    // Positive control: the same shape of request with a parent that IS in this
    // project answers a card, so the two empties are the parent clause working.
    expect(await idsOf('member', read.world.projectId, { parentId: read.world.epicId })).toEqual([
      read.world.taskInEpicId,
    ]);
  });
});

describe('GET /v1/projects/:projectId/tickets — pagination and ordering', () => {
  it('7.20 keyset pages walk a project without overlap and without gap', async () => {
    const pageOne = await listOf('member', read.world.projectId, { limit: 2 });
    expect(ids(pageOne)).toHaveLength(2);
    expect(pageOne.nextCursor).toBe(ids(pageOne)[1]);

    const pageTwo = await listOf('member', read.world.projectId, {
      limit: 2,
      cursor: pageOne.nextCursor ?? '',
    });
    expect(ids(pageTwo)).toHaveLength(1);
    expect(pageTwo.nextCursor).toBeNull();

    const walked = [...ids(pageOne), ...ids(pageTwo)];
    expect(walked).toEqual(memberVisible());
    expect(new Set(walked).size).toBe(walked.length);
  });

  it('7.20 the DEFAULT page is 50 of a sixty-row project, and its second page holds the other ten', async () => {
    const pageOne = await listOf('member', fixtures.bulkProjectId);
    expect(ids(pageOne)).toEqual(fixtures.bulkIdsSorted.slice(0, 50));
    expect(pageOne.nextCursor).toBe(fixtures.bulkIdsSorted[49]);

    const pageTwo = await listOf('member', fixtures.bulkProjectId, {
      cursor: pageOne.nextCursor ?? '',
    });
    expect(ids(pageTwo)).toEqual(fixtures.bulkIdsSorted.slice(50));
    expect(pageTwo.nextCursor).toBeNull();

    // Different ids on the second page, and sixty distinct ids across the two —
    // the property a page-size assertion over a three-row fixture cannot state.
    expect(ids(pageOne).some((id) => ids(pageTwo).includes(id))).toBe(false);
    expect(new Set([...ids(pageOne), ...ids(pageTwo)]).size).toBe(BULK_COUNT);
  });

  it('7.20 an explicit `limit` overrides the default, and the last page reports no cursor rather than an empty one', async () => {
    const page = await listOf('member', fixtures.bulkProjectId, { limit: 7 });
    expect(ids(page)).toEqual(fixtures.bulkIdsSorted.slice(0, 7));
    expect(page.nextCursor).toBe(fixtures.bulkIdsSorted[6]);

    // A limit that exactly consumes the remainder must still say "no more":
    // 60 rows, cursor at row 53, limit 7.
    const tail = await listOf('member', fixtures.bulkProjectId, {
      limit: 7,
      cursor: fixtures.bulkIdsSorted[52] ?? '',
    });
    expect(ids(tail)).toEqual(fixtures.bulkIdsSorted.slice(53));
    expect(tail.nextCursor).toBeNull();
  });

  it('7.80 cards come back in TICKET_ID order and not in the order the ledger wrote them', async () => {
    const page = await listOf('member', fixtures.bulkProjectId, { limit: BULK_COUNT });
    expect(ids(page)).toEqual(fixtures.bulkIdsSorted);
    // The fixture's whole point, stated as an assertion so it cannot rot: these
    // sixty rows were INSERTED in the opposite order, so the line above
    // distinguishes id order from arrival order rather than agreeing with both.
    expect(fixtures.bulkIdsInsertionOrder).not.toEqual(fixtures.bulkIdsSorted);
    expect(ids(page)).not.toEqual(fixtures.bulkIdsInsertionOrder);
  });

  it('7.80 the cursor is an input, not a key: a foreign, an invisible and a hostile cursor each narrow and none widens', async () => {
    // Positive control first: a cursor BELOW every id answers the whole visible
    // list, so the narrowings below are the clause working rather than a route
    // that answers nothing whenever a cursor is present.
    expect(await idsOf('member', read.world.projectId, { cursor: '0' })).toEqual(memberVisible());
    const [first] = memberVisible();
    expect(await idsOf('member', read.world.projectId, { cursor: first ?? '' })).toEqual(
      memberVisible().slice(1),
    );

    // A cursor naming a ticket in ANOTHER workspace. It is compared as text and
    // nothing more: the answer stays inside this project and this viewer's
    // slice, and no byte of the neighbour tenancy appears.
    const foreign = await getList('member', read.world.projectId, { cursor: read.neighbour.ticketId });
    expect(foreign.statusCode).toBe(200);
    expect(foreign.body).not.toContain(read.neighbour.ticketId);
    expect(foreign.body).not.toContain(read.neighbour.ticketTitle);
    for (const id of ids(foreign.json() as ListResponse)) {
      expect(memberVisible()).toContain(id);
    }

    // A cursor naming a ticket this viewer may NOT see. It does not become a
    // key to it, and it does not lift the visibility predicate for the rows
    // after it either — the owner's answer to the same cursor is the proof
    // that there IS something after it to be leaked.
    const hidden = await getList('member', read.world.projectId, {
      cursor: read.world.hiddenTaskId,
    });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.body).not.toContain(read.world.hiddenTaskId);
    expect(hidden.body).not.toContain('Salary review');
    expect(ids(hidden.json() as ListResponse)).toEqual(
      memberVisible().filter((id) => id > read.world.hiddenTaskId),
    );
    expect(await idsOf('owner', read.world.projectId, { cursor: read.world.hiddenTaskId })).toEqual(
      [read.world.guestTaskId].filter((id) => id > read.world.hiddenTaskId),
    );

    // A hostile cursor is a bound parameter like every other value: no 500, no
    // SQL, and the table it names is still there afterwards.
    const hostile = await getList('member', read.world.projectId, {
      cursor: `x'; DROP TABLE proj_tickets; --`,
    });
    expect(hostile.statusCode).toBe(200);
    const intact = await db.pool.query<{ t: string | null }>(
      `SELECT to_regclass('proj_tickets') AS t`,
    );
    expect(intact.rows[0]?.t).toBe('proj_tickets');
    expect(await idsOf('member', read.world.projectId)).toEqual(memberVisible());
  });
});

describe('GET /v1/projects/:projectId/tickets — visibility', () => {
  it('7.21 PLANTED DEFECT: the hidden ticket is absent from every grouping and from every page of the member’s list', async () => {
    for (const groupBy of ['flat', 'status', 'assignee', 'type', 'epic']) {
      const response = await getList('member', read.world.projectId, { groupBy, limit: 200 });
      expect(response.statusCode).toBe(200);
      // Positive control INSIDE the loop: this grouping answered something, so
      // the absence below is a filtered body rather than an empty one.
      expect(response.body).toContain(read.world.epicId);
      expect(response.body).not.toContain(read.world.hiddenTaskId);
      expect(response.body).not.toContain('Salary review');
    }

    // …and page by page, at a page size small enough that three pages are
    // walked: a route that only filtered the FIRST page would show it here.
    let cursor: string | null = null;
    const walked: string[] = [];
    for (let page = 0; page < 5; page += 1) {
      const list: ListResponse = await listOf('member', read.world.projectId, {
        limit: 1,
        ...(cursor === null ? {} : { cursor }),
      });
      walked.push(...ids(list));
      cursor = list.nextCursor;
      if (cursor === null) break;
    }
    expect(walked).toEqual(memberVisible());
    expect(walked).not.toContain(read.world.hiddenTaskId);

    // The filter is visibility, not deletion.
    const owner = await getList('owner', read.world.projectId, { limit: 200 });
    expect(owner.body).toContain(read.world.hiddenTaskId);
    expect(owner.body).toContain('Salary review');
  });

  it('7.21 a guest gets only the slice they were named on, and the neighbour tenancy never bleeds across', async () => {
    expect(await idsOf('guest', read.world.projectId)).toEqual([read.world.guestTaskId]);

    const ours = await getList('owner', read.world.projectId, { limit: 200 });
    expect(ours.body).not.toContain(read.neighbour.ticketId);
    expect(ours.body).not.toContain(read.neighbour.ticketTitle);
    expect(ours.body).toContain(read.world.epicId);

    const theirs = await getList('neighbour', read.neighbour.projectId, { limit: 200 });
    expect(theirs.body).not.toContain(read.world.epicId);
    expect(theirs.body).not.toContain('Registrations drive');
    expect(theirs.body).toContain(read.neighbour.ticketId);
  });

  it('7.21 the list is ONE PROJECT’s, not the workspace’s: a sibling project’s visible ticket is absent, and present on its own list', async () => {
    const ours = await getList('member', read.world.projectId, { limit: 200 });
    expect(ours.body).not.toContain(read.sibling.ticketId);
    expect(ours.body).not.toContain(read.sibling.ticketTitle);
    expect(ours.body).toContain(read.world.epicId);

    // The positive control that makes the absence project scope rather than
    // invisibility: the SAME viewer sees it on the sibling project's own list.
    expect(await idsOf('member', read.sibling.projectId)).toEqual(
      [read.sibling.ticketId, read.sibling.choreTicketId].sort(),
    );
  });

  it('7.18 PLANTED DEFECT: a hostile filter executes harmlessly — parameters, not SQL', async () => {
    const hostile: FilterSpec = {
      text: `'); DELETE FROM events; --`,
      fields: [{ fieldId: `x'; DROP TABLE proj_tickets; --`, op: 'contains', value: `%' OR '1'='1` }],
    };
    const response = await getList('member', read.world.projectId, { filter: hostile });
    expect(response.statusCode).toBe(200);
    expect(ids(response.json() as ListResponse)).toEqual([]);

    const intact = await db.pool.query<{ t: string | null; events: number }>(
      `SELECT to_regclass('proj_tickets') AS t, count(*)::int AS events FROM events`,
    );
    expect(intact.rows[0]?.t).toBe('proj_tickets');
    expect(intact.rows[0]?.events).toBeGreaterThan(0);
    // The positive control for the `[]` and for the surviving table alike: the
    // same viewer, same project, no filter, still gets their three cards.
    expect(await idsOf('member', read.world.projectId)).toEqual(memberVisible());
  });
});

describe('GET /v1/projects/:projectId/tickets — the door', () => {
  it('7.17 no session is 401 and never a list — the same URL with a session is 200', async () => {
    const anonymous = await read.app.inject({ method: 'GET', url: listUrl(read.world.projectId) });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual(UNAUTHENTICATED_BODY);
    expect(anonymous.body).not.toContain(read.world.epicId);

    const authenticated = await getList('member', read.world.projectId);
    expect(authenticated.statusCode).toBe(200);
    expect(authenticated.body).toContain(read.world.epicId);
  });

  it('7.17 a forged bearer token is 401, not a list — the session is resolved, not merely present', async () => {
    const forged = await read.app.inject({
      method: 'GET',
      url: listUrl(read.world.projectId),
      headers: { authorization: 'Bearer not-a-real-session-token' },
    });
    expect(forged.statusCode).toBe(401);
    expect(forged.json()).toEqual(UNAUTHENTICATED_BODY);
    expect(forged.body).not.toContain(read.world.epicId);
  });

  it('7.17 a stranger, a neighbour workspace owner and an unknown project id all get the SAME 404 — status, body and every header but date', async () => {
    const stranger = await getList('stranger', read.world.projectId);
    const neighbour = await getList('neighbour', read.world.projectId);
    const unknown = await getList('owner', newUlid());

    expect(stranger.statusCode).toBe(404);
    expect(stranger.json()).toEqual({ error: 'not_found' });
    expect(neighbour.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);

    // Indistinguishable, or the route is an existence oracle: a 403 for the
    // neighbour would confirm the project exists to somebody with no business
    // knowing it does.
    expect(neighbour.json()).toEqual(stranger.json());
    expect(unknown.json()).toEqual(stranger.json());
    expect(comparableHeaders(neighbour)).toEqual(comparableHeaders(stranger));
    expect(comparableHeaders(unknown)).toEqual(comparableHeaders(stranger));

    // Positive control for all three: this route answers 200 to somebody, and
    // the neighbour is a real session that gets 200 on their OWN project — so
    // their 404 is about tenancy and not about them being unauthenticated.
    expect(await idsOf('owner', read.world.projectId, { limit: 200 })).toHaveLength(5);
    expect(await idsOf('neighbour', read.neighbour.projectId)).toEqual([read.neighbour.ticketId]);
  });

  it('7.17 an on-workspace, off-project member gets 200 with `groups: []`, not a 404 — the workspace is the boundary, the project roster is not', async () => {
    const outsider = await listOf('outsider', read.world.projectId);
    expect(outsider.groups).toEqual([]);
    expect(outsider.projectId).toBe(read.world.projectId);
    expect(outsider.nextCursor).toBeNull();

    // Positive control, same helper, same project: the emptiness above is this
    // viewer's slice and not a route that answers `[]` to everyone.
    expect(await idsOf('member', read.world.projectId)).toEqual(memberVisible());
  });

  it('7.80 the door answers BEFORE the query is parsed: a stranger sending nonsense gets the tenancy 404, a member gets the 400', async () => {
    const stranger = await getList('stranger', read.world.projectId, { groupBy: 'priority', limit: 0 });
    expect(stranger.statusCode).toBe(404);
    expect(stranger.json()).toEqual({ error: 'not_found' });

    const member = await getList('member', read.world.projectId, { groupBy: 'priority', limit: 0 });
    expect(member.statusCode).toBe(400);
  });

  it('7.22 refuses malformed inputs with a named 400 and without echoing internals', async () => {
    const cases: Array<[ListQuery, string]> = [
      [{ filter: 'not json' }, 'invalid_filter'],
      [{ filter: { velocity: 9 } as unknown as FilterSpec }, 'invalid_filter'],
      [{ filter: { assigneeId: '' } as FilterSpec }, 'invalid_filter'],
      [{ groupBy: 'priority' }, 'invalid_grouping'],
      [{ groupBy: '' }, 'invalid_grouping'],
      [{ limit: 0 }, 'invalid_limit'],
      [{ limit: 999 }, 'invalid_limit'],
      [{ limit: -1 }, 'invalid_limit'],
      [{ limit: '2.5' }, 'invalid_limit'],
      [{ limit: 'lots' }, 'invalid_limit'],
    ];
    for (const [query, error] of cases) {
      const response = await getList('member', read.world.projectId, query);
      expect([error, response.statusCode]).toEqual([error, 400]);
      expect(response.json()).toEqual({ error });
      // Nothing about the store leaks out with the refusal.
      expect(response.body).not.toContain('proj_tickets');
      expect(response.body).not.toContain('SELECT');
    }

    // The positive controls that make every 400 above a BOUND rather than a
    // route that refuses everything: the boundaries on the legal side pass.
    expect(await idsOf('member', read.world.projectId, { limit: 200 })).toEqual(memberVisible());
    expect(await idsOf('member', read.world.projectId, { limit: 1 })).toEqual(
      memberVisible().slice(0, 1),
    );
    expect(await idsOf('member', read.world.projectId, { groupBy: 'flat' })).toEqual(memberVisible());
    expect(
      await idsOf('member', read.world.projectId, { filter: { assigneeId: read.world.member } }),
    ).toEqual([read.world.taskInEpicId]);
  });
});
