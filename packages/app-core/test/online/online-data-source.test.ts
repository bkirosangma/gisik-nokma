import { describe, expect, it } from 'vitest';
import type { BoardResponse, MemberListResponse } from '@gisik-nokma/domain';
import {
  MAX_INGEST_BATCH,
  createOnlineDataSource,
  listQueryString,
} from '../../src/online/online-data-source.js';
import {
  LIST_PAGE_CAP,
  LIST_PAGE_SIZE,
  LIST_TOO_LARGE_ABSENCE,
  ServingGapError,
  UnexpressibleFilterError,
} from '../../src/online/mappers.js';
import { HttpError } from '../../src/online/http.js';
import { submittedTicketCreated } from '../helpers/seed.js';

const WORKSPACE = '01J9GWS0000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const ANSELMA = '01J9GUSA000000000000000000';

/**
 * A fetch that answers only the paths it was given, 404s everything else, and
 * records every call. The 404 is not a convenience: it is the answer every `/v1`
 * read route gives for "no such thing" and "not yours" alike, so a test that
 * stubbed a 200 for an unexpected path would be exercising a server that does
 * not exist.
 */
function recordingFetch(answers: Record<string, unknown>) {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    calls.push(init === undefined ? { input } : { input, init });
    const path = input.replace(/^https?:\/\/[^/]+/, '').split('?')[0] ?? '';
    const body = answers[path];
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      json: async () => body,
    } as Response;
  };
  return { fetchImpl, calls };
}

/**
 * A fetch that PAGES: it answers `/v1/projects/:id/tickets` differently
 * depending on the `cursor` in the query string, and records every URL it was
 * asked for. `recordingFetch` above strips the query before looking the answer
 * up, which is exactly what a paging test must not do — it would answer page
 * one forever and a loop that ignored the cursor would still "assemble two
 * pages" out of the same rows.
 */
function pagingFetch(pages: readonly { ticketIds: readonly string[] }[]) {
  const urls: string[] = [];
  const fetchImpl = async (input: string) => {
    urls.push(input);
    // KEYSET, matching the shipped route rather than a protocol invented here.
    // `routes/list.ts` binds `t.ticket_id > $n` and emits the LAST TICKET ID of
    // the page as `nextCursor`. An earlier draft of this helper used the page
    // INDEX, which made every case below internally consistent with a contract
    // no server implements — the failure this series is named for. 7.220 proves
    // the real route against the real mapper; this keeps the fake honest.
    const cursor = new URL(input, 'http://x').searchParams.get('cursor');
    const index =
      cursor === null ? 0 : pages.findIndex((page) => page.ticketIds.at(-1) === cursor) + 1;
    const page = pages[index];
    if (page === undefined) {
      // AN UNRECOGNISED CURSOR NARROWS TO AN EMPTY PAGE. It does NOT 404, and
      // this arm said 404 until case 12.323 measured the route. `routes/list.ts`
      // binds the cursor as a VALUE — `t.ticket_id > $n` — so a cursor naming a
      // ticket that does not exist, belongs to another tenancy, or is invisible
      // to the caller is just a text comparison that narrows; the route's own
      // docblock says its tests "hand back all three (foreign, invisible,
      // hostile) and pin that". An empty page has NO groups (`list.ts:205`).
      //
      // This is the SECOND invented rule found in this helper. The first was the
      // cursor itself, implemented as a page index against a keyset route, and
      // fixing it did not make the fixture a witness — it only moved the lie.
      // That is why 12.323 exists and why it lives against the real route.
      return {
        ok: true,
        status: 200,
        json: async () => ({ projectId: PROJECT, groupBy: 'flat', groups: [], nextCursor: null }),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        projectId: PROJECT,
        groupBy: 'flat',
        groups: [
          {
            key: 'all',
            label: 'All',
            cards: page.ticketIds.map((ticketId) => listCard(ticketId)),
          },
        ],
        // Emitted exactly as the route does: the last id of the page, and null
        // on the final page rather than whenever the page came back full.
        nextCursor: index === pages.length - 1 ? null : (page.ticketIds.at(-1) ?? null),
      }),
    } as Response;
  };
  return { fetchImpl, urls };
}

/** The minimum a `ListCard` must carry for `mapListPage` to accept it. */
function listCard(ticketId: string) {
  return {
    ticketId,
    workspaceId: WORKSPACE,
    projectId: PROJECT,
    typeId: 'task',
    parentId: null,
    workflowId: 'wf-errand',
    stateId: 'doing',
    stateCategory: 'active',
    assigneeId: null,
    collaboratorIds: [],
    title: `Ticket ${ticketId}`,
    dueDate: { state: 'never-claimed' },
    fields: {},
    stateProvenance: { actorId: ANSELMA, clientTime: 'c', serverTime: 's', cause: null },
    rollup: null,
    typeRank: 3,
    epicId: null,
    stateName: 'Doing',
    assignedProvenance: null,
    hasRestrictedParent: false,
    closed: null,
    // REQUIRED on the wire (spec §8.1, second wave 2026-09-18). The same
    // fixture churn `closed` caused here in the core plan's Task 4 fix round,
    // and for the same reason: the server always sends the key, so a fixture
    // that omits it is not a body the product can produce — and `mapRank`
    // refusing it is the property case 13.703 pins.
    rank: null,
  };
}

const MEMBERS: MemberListResponse = {
  workspaceId: WORKSPACE,
  members: [{ userId: ANSELMA, displayName: 'Anselma Marak', role: 'owner' }],
};

const BOARD: BoardResponse = {
  projectId: PROJECT,
  workspaceId: WORKSPACE,
  columns: [
    {
      workflowId: 'wf-errand',
      workflowName: 'Errand',
      workflowVersion: 2,
      stateId: 'doing',
      name: 'Doing',
      category: 'active',
      blocked: false,
      cards: [
        {
          ticketId: '01J9GTKA000000000000000000',
          workspaceId: WORKSPACE,
          projectId: PROJECT,
          typeId: 'task',
          parentId: null,
          workflowId: 'wf-errand',
          stateId: 'doing',
          stateCategory: 'active',
          assigneeId: ANSELMA,
          collaboratorIds: [],
          title: 'File the GST return',
          dueDate: { state: 'never-claimed' },
          fields: {},
          stateProvenance: {
            actorId: ANSELMA,
            clientTime: 'c',
            serverTime: 's',
            cause: null,
          },
          rollup: null,
          closed: null,
          // `BoardResponse.columns[].cards` is the domain's `TicketCard[]`, so
          // this fixture carries the same REQUIRED key the list fixture does.
          rank: null,
        },
      ],
    },
  ],
};

/** Case 3.40 (`test-cases/03-foundation-ledger.md`). */
describe('3.40 createOnlineDataSource — ingest', () => {
  it('POSTs to /v1/events and returns index-aligned results', async () => {
    const event = submittedTicketCreated();
    const { fetchImpl, calls } = recordingFetch({
      '/v1/events': {
        results: [{ status: 'committed', eventId: event.id, seq: 1, serverTime: 's' }],
      },
    });
    const source = createOnlineDataSource({ baseUrl: 'http://server.test', fetchImpl });
    const results = await source.ingest([event]);
    expect(results[0]?.status).toBe('committed');
    expect(calls[0]?.input).toBe('http://server.test/v1/events');
    expect(JSON.parse(String(calls[0]?.init?.body)).events).toHaveLength(1);
  });

  it('3.40 refuses a batch over 100 client-side without spending a request', async () => {
    const { fetchImpl, calls } = recordingFetch({});
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    const oversized = Array.from({ length: MAX_INGEST_BATCH + 1 }, () => submittedTicketCreated());
    await expect(source.ingest(oversized)).rejects.toThrow(/101 exceeds the contract maximum of 100/);
    expect(calls).toEqual([]);
    // Control, one event fewer, same run: the server's own maximum is accepted.
    const { fetchImpl: ok, calls: okCalls } = recordingFetch({
      '/v1/events': {
        results: Array.from({ length: MAX_INGEST_BATCH }, (_, index) => ({
          status: 'committed',
          eventId: `e${index}`,
          seq: index + 1,
          serverTime: 's',
        })),
      },
    });
    const accepting = createOnlineDataSource({ baseUrl: '', fetchImpl: ok });
    await accepting.ingest(Array.from({ length: MAX_INGEST_BATCH }, () => submittedTicketCreated()));
    expect(okCalls).toHaveLength(1);
  });

  it('answers an empty batch without a request', async () => {
    const { fetchImpl, calls } = recordingFetch({});
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    expect(await source.ingest([])).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('3.40 the four answerable reads, at the paths the server registers', () => {
  it('getBoard joins the roster off the board body’s own workspaceId', async () => {
    const { fetchImpl, calls } = recordingFetch({
      [`/v1/projects/${PROJECT}/board`]: BOARD,
      [`/v1/workspaces/${WORKSPACE}/members`]: MEMBERS,
    });
    const source = createOnlineDataSource({ baseUrl: 'http://server.test', fetchImpl });
    const view = await source.query.getBoard(PROJECT);
    expect(view.groups[0]?.columns[0]?.cards[0]?.assignee).toEqual({
      id: ANSELMA,
      name: 'Anselma Marak',
    });
    expect(calls.map((call) => call.input)).toEqual([
      `http://server.test/v1/projects/${PROJECT}/board`,
      `http://server.test/v1/workspaces/${WORKSPACE}/members`,
    ]);
  });

  it('3.40 getBoard still renders when the roster route 404s the caller', async () => {
    // A guest is refused the roster whole (`door(..., 'no-guests')`), and a board
    // that threw for that reason would be a board no guest could ever open.
    const { fetchImpl } = recordingFetch({ [`/v1/projects/${PROJECT}/board`]: BOARD });
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    const view = await source.query.getBoard(PROJECT);
    expect(view.groups[0]?.columns[0]?.cards[0]?.assignee).toEqual({ id: ANSELMA, name: ANSELMA });
  });

  it('getMembers, getTicketHistory and getWorkflowDef read their own paths', async () => {
    const { fetchImpl, calls } = recordingFetch({
      [`/v1/workspaces/${WORKSPACE}/members`]: MEMBERS,
      '/v1/tickets/t_1/history': { ticketId: 't_1', events: [] },
      [`/v1/workspaces/${WORKSPACE}/workflows/wf-errand`]: {
        workspaceId: WORKSPACE,
        workflow: {
          id: 'wf-errand',
          version: 2,
          name: 'Errand',
          initialStateId: 'todo',
          states: [],
          transitions: [],
        },
      },
    });
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    // `role` is asserted here now (case 13.760) because it is the field the
    // mapper used to DROP: this call goes through the real HTTP client to the
    // real `mapActors`, so it is the seam where a future drop reddens rather
    // than a screen quietly losing a column.
    expect(await source.query.getMembers(WORKSPACE)).toEqual([
      { id: ANSELMA, name: 'Anselma Marak', role: 'owner' },
    ]);
    expect(await source.query.getTicketHistory('t_1', 4, 20)).toEqual([]);
    expect((await source.query.getWorkflowDef(WORKSPACE, 'wf-errand', 2))?.version).toBe(2);
    expect(calls.map((call) => call.input)).toEqual([
      `/v1/workspaces/${WORKSPACE}/members`,
      '/v1/tickets/t_1/history?afterSeq=4&limit=20',
      `/v1/workspaces/${WORKSPACE}/workflows/wf-errand?version=2`,
    ]);
  });

  it('3.40 getBoard has no absence value, so a 404 is re-raised as HttpError 404', async () => {
    // `Promise<BoardView>` cannot answer null. A non-member and a guest both get
    // the frozen 404 from this route, so this branch is on the product path —
    // and it is a NAMED, status-carrying failure rather than a bare Error, so a
    // caller can tell it from a mapping failure.
    const { fetchImpl } = recordingFetch({});
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    await expect(source.query.getBoard('nope')).rejects.toBeInstanceOf(HttpError);
    await expect(source.query.getBoard('nope')).rejects.toMatchObject({ status: 404 });
    // Control, same run: the board that IS readable answers a view.
    const { fetchImpl: ok } = recordingFetch({
      [`/v1/projects/${PROJECT}/board`]: BOARD,
      [`/v1/workspaces/${WORKSPACE}/members`]: MEMBERS,
    });
    const readable = createOnlineDataSource({ baseUrl: '', fetchImpl: ok });
    expect((await readable.query.getBoard(PROJECT)).groups).toHaveLength(1);
  });

  it('3.40 a 404 is an answer: null for a workflow, [] for a history', async () => {
    const { fetchImpl } = recordingFetch({});
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    expect(await source.query.getWorkflowDef(WORKSPACE, 'nope')).toBeNull();
    expect(await source.query.getTicketHistory('nope')).toEqual([]);
    expect(await source.query.getTicket(WORKSPACE, 'nope')).toBeNull();
    expect(await source.query.getMembers(WORKSPACE)).toEqual([]);
  });
});

/**
 * 3.40 — the six that refuse. Each is driven through the DataSource, not the
 * mapper, because what is pinned here is that the online source does not quietly
 * answer around the gap: a caller gets the enumeration and no view.
 */
describe('3.40 the blocked methods refuse through the DataSource', () => {
  it('names its absences and never returns a plausible-looking view', async () => {
    const { fetchImpl } = recordingFetch({
      '/v1/me/workspaces': { workspaces: [] },
      [`/v1/projects/${PROJECT}/tickets`]: {
        projectId: PROJECT,
        groupBy: 'flat',
        groups: [],
        nextCursor: null,
      },
      [`/v1/workspaces/${WORKSPACE}/tickets/t_1`]: {
        ticket: { ticket_id: 't_1' },
        parent: null,
        rollup: null,
      },
      '/v1/search': { workspaceId: WORKSPACE, query: 'q', hits: [] },
      '/v1/me/work': { workspaceId: WORKSPACE, groups: { open: [], active: [], terminal: [] } },
      [`/v1/workspaces/${WORKSPACE}/attention`]: {
        workspaceId: WORKSPACE,
        generatedAt: 'g',
        settings: { staleDays: 7, dueSoonDays: 7, provenance: null },
        items: [],
      },
    });
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    const expected: ReadonlyArray<[string, () => Promise<unknown>, string]> = [
      ['search', () => source.query.search(WORKSPACE, 'q'), 'SearchHit.matchedIn'],
    ];
    for (const [method, call, field] of expected) {
      await expect(call(), method).rejects.toBeInstanceOf(ServingGapError);
      await expect(call(), method).rejects.toThrow(field);
    }

    // `getTickets` and `getTicket` WERE in the list above and are not any more
    // (ruling P25 clause 1). Asserting their new silence rather than deleting
    // two rows is the point: a refusal that stops refusing has to be pinned as
    // SERVED, or the only record that it ever refused is a shorter array.
    //
    // The assertion is "not a serving gap" rather than "resolves", deliberately.
    // These stubs are minimal bodies built to make a REFUSAL observable, not to
    // satisfy a mapper, so demanding a resolved view here would test the fixture
    // rather than the change.
    const nowServed: ReadonlyArray<[string, () => Promise<unknown>]> = [
      ['getTickets', () => source.query.getTickets(PROJECT, {}, 'flat')],
      ['getTicket', () => source.query.getTicket(WORKSPACE, 't_1')],
      // `getMyWork` and `getAttention` WERE two of the three rows above until
      // rulings P39 and P40, and they move here rather than being deleted for
      // the reason this block exists. `search` is now the only row left up
      // there — which is also the positive control on this list: if the loop
      // above stopped observing refusals altogether, `search` would fail there
      // rather than everything quietly passing here.
      ['getMyWork', () => source.query.getMyWork(WORKSPACE)],
      ['getAttention', () => source.query.getAttention(WORKSPACE)],
      // Joined by rulings P32/P38. Kept as a ROW rather than deleted, for the
      // reason this block exists: a refusal that stops refusing has to be
      // pinned as SERVED, or the only record it ever refused is a shorter array.
      ['getMyWorkspaces', () => source.query.getMyWorkspaces()],
    ];
    for (const [method, call] of nowServed) {
      const outcome = await call().then(
        () => 'resolved',
        (err: unknown) => (err instanceof ServingGapError ? 'serving-gap' : 'other-error'),
      );
      expect(outcome, method).not.toBe('serving-gap');
    }
  });
});

describe('3.40 the three signatures that grew a workspaceId (P25 clause 2)', () => {
  it('puts it on the query string the routes read before the door', async () => {
    const { fetchImpl, calls } = recordingFetch({
      '/v1/me/preferences': { savedFilters: [], listColumns: {}, grouping: {} },
    });
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    expect(await source.query.getPreferences(WORKSPACE)).toEqual({
      version: 1,
      projects: {},
      savedFilters: [],
    });
    await source.query.putPreferences(WORKSPACE, {
      version: 1,
      projects: {
        [PROJECT]: {
          columns: { origin: 'stored', value: ['status'] },
          grouping: { origin: 'stored', value: 'epic' },
        },
      },
      savedFilters: [],
    });
    await source.query.getMyWork(WORKSPACE).catch(() => undefined);
    // Three requests, not two: `getMyWork` fetches the workspace ROSTER
    // alongside its own body (ruling P40's change — it answers now, and a
    // `ClaimProvenance` names its actor), the same uncached read `getBoard`
    // makes. They are issued together, so the order between the last two is the
    // order `Promise.all` starts them in and is asserted as such rather than as
    // a sequence anything depends on.
    expect(calls.map((call) => call.input)).toEqual([
      `/v1/me/preferences?workspaceId=${WORKSPACE}`,
      `/v1/me/preferences?workspaceId=${WORKSPACE}`,
      `/v1/me/work?workspaceId=${WORKSPACE}`,
      `/v1/workspaces/${WORKSPACE}/members`,
    ]);
    // The PUT sends the SERVER's document (P24), not the client's.
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      savedFilters: [],
      listColumns: { [PROJECT]: ['status'] },
      grouping: { [PROJECT]: 'epic' },
    });
  });

  /**
   * 3.67 — the HALF-SET project, measured ON THE WIRE rather than reasoned.
   *
   * `toServerPreferences` declining to store a half nobody chose is proven as a
   * pure function in `mappers.test.ts`. That is not the same claim as *what this
   * client actually sends*: between the two sits `putPreferences`, and a
   * composition can lose a property both of its halves have. So this asserts the
   * REQUEST BODY — the bytes the server would receive — for a project the user
   * has arranged only half of.
   *
   * The wrong answer this refuses is specific and it is the one a reasonable
   * implementation gives: `listColumns: { [PROJECT]: [...stock columns] }`,
   * which stores this client's default under the user's name, permanently and
   * unrecoverably, because storage cannot tell a default from a choice.
   */
  it('3.67 sends NO listColumns key for a project whose columns nobody chose', async () => {
    const { fetchImpl, calls } = recordingFetch({
      '/v1/me/preferences': { savedFilters: [], listColumns: {}, grouping: {} },
    });
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    await source.query.putPreferences(WORKSPACE, {
      version: 1,
      projects: {
        [PROJECT]: { columns: { origin: 'default' }, grouping: { origin: 'stored', value: 'flat' } },
      },
      savedFilters: [],
    });
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body).toEqual({
      savedFilters: [],
      listColumns: {},
      grouping: { [PROJECT]: 'flat' },
    });
    // Said as the refusal it is: the key is ABSENT, not present-and-empty. A
    // `listColumns: { [PROJECT]: [] }` would be the user choosing NO columns,
    // which is a different statement from never having chosen.
    expect(Object.keys(body.listColumns)).toEqual([]);

    // CONTROL, one origin apart, same run: the identical columns marked
    // `stored` DO reach the wire. Without it, a transport that dropped
    // `listColumns` entirely passes the assertions above.
    await source.query.putPreferences(WORKSPACE, {
      version: 1,
      projects: {
        [PROJECT]: {
          columns: { origin: 'stored', value: ['status'] },
          grouping: { origin: 'stored', value: 'flat' },
        },
      },
      savedFilters: [],
    });
    expect(JSON.parse(String(calls[1]?.init?.body)).listColumns).toEqual({ [PROJECT]: ['status'] });
  });
});

/**
 * 3.45 / 3.46 — the two ends of the same rule, on the one route that has both
 * a read and a write.
 *
 * `GET` and `PUT /v1/me/preferences` answer the same 404 from the same
 * `requireMember` check (`apps/server/src/routes/preferences.ts`), and the client
 * used to turn one into stock defaults and the other into silence. Neither is
 * reachable through `recordingFetch` by accident: it 404s any path it was not
 * given, which IS the revoked-member answer.
 */
describe('3.45 a revoked member is told, on both verbs', () => {
  it('3.45 putPreferences REJECTS when the server refuses the write instead of resolving', async () => {
    const { fetchImpl, calls } = recordingFetch({});
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    await expect(
      source.query.putPreferences(WORKSPACE, { version: 1, projects: {}, savedFilters: [] }),
    ).rejects.toMatchObject({ name: 'HttpError', status: 404 });
    // The request really was sent — the refusal is the SERVER's, not a
    // client-side guard that never spent a round trip.
    expect(calls.map((call) => call.input)).toEqual([
      `/v1/me/preferences?workspaceId=${WORKSPACE}`,
    ]);
    expect(calls[0]?.init?.method).toBe('PUT');
  });

  it('3.46 getPreferences REJECTS rather than answering the defaults that mean "you never saved"', async () => {
    const { fetchImpl } = recordingFetch({});
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    await expect(source.query.getPreferences(WORKSPACE)).rejects.toBeInstanceOf(HttpError);
    await expect(source.query.getPreferences(WORKSPACE)).rejects.toMatchObject({ status: 404 });

    // Control, one object apart: the SERVER'S OWN never-saved answer — a 200
    // carrying the empty document (`apps/server/src/preferences/store.ts`) —
    // still reads as the empty client document. That pair is the whole point:
    // the two situations used to be one value, and a revoked member was shown
    // somebody's-settings-shaped defaults.
    const saved = recordingFetch({
      '/v1/me/preferences': { savedFilters: [], listColumns: {}, grouping: {} },
    });
    const online = createOnlineDataSource({ baseUrl: '', fetchImpl: saved.fetchImpl });
    expect(await online.query.getPreferences(WORKSPACE)).toEqual({
      version: 1,
      projects: {},
      savedFilters: [],
    });
  });
});

describe('3.40 listQueryString — the query the shipped list route actually reads', () => {
  it('emits groupBy plus one JSON filter document', () => {
    expect(
      listQueryString({ text: 'gst', assigneeIds: [ANSELMA], stateCategories: ['active'] }, 'epic'),
    ).toBe(
      `groupBy=epic&filter=${encodeURIComponent(
        JSON.stringify({ text: 'gst', assigneeId: ANSELMA, stateCategory: 'active' }),
      )}`,
    );
  });

  it('omits the filter entirely when there is nothing to say', () => {
    expect(listQueryString({}, 'flat')).toBe('groupBy=flat');
  });

  it('3.40 THROWS on a multi-assignee filter rather than sending the first', () => {
    expect(() => listQueryString({ assigneeIds: [ANSELMA, '01J9GUSB000000000000000000'] }, 'flat')).toThrow(
      UnexpressibleFilterError,
    );
  });
});

describe('3.40 subscribe is Task 8’s stream subscriber, wired not rewritten', () => {
  it('opens the WebSocket at the stream origin and sends the resume cursor', () => {
    const sent: string[] = [];
    const opened: string[] = [];
    const source = createOnlineDataSource({
      baseUrl: 'http://server.test',
      streamBaseUrl: 'http://stream.test',
      fetchImpl: recordingFetch({}).fetchImpl,
      webSocketFactory: (url) => {
        opened.push(url);
        const socket = {
          send: (data: string) => sent.push(data),
          close: () => {},
          onopen: null as ((event: unknown) => void) | null,
          onmessage: null,
          onclose: null,
          onerror: null,
        };
        queueMicrotask(() => socket.onopen?.({}));
        return socket;
      },
    });
    const unsubscribe = source.subscribe(WORKSPACE, 12, () => {});
    expect(opened).toEqual(['ws://stream.test/v1/stream']);
    unsubscribe();
  });
});

/**
 * 3.140 — `getTicketTypes`, the seam that was missing while the route shipped.
 *
 * The route has existed since Plan 5 (`GET /v1/workspaces/:workspaceId/ticket-types`,
 * `apps/server/src/routes/builder-reads.ts:531`) and `DataSourceQuery` had no
 * method for it, so the web shell could not reach it through amendment 10's
 * boundary and hardcoded `epic`/`story`/`task`/`sub-task` instead.
 *
 * The fixture below is the SERVER'S OWN, not an invention: case 7.38
 * (`apps/server/test/routes/builder-reads.test.ts:250`) measures that body
 * against a real database and real doors — `epic` rank 1, `chore` rank 3 on a
 * second workflow, `task` rank 3, ordered by rank then id. It is deliberately
 * NOT the built-in ladder, because the whole point of this method is that a
 * workspace's types are its own.
 */
const TICKET_TYPES = {
  workspaceId: WORKSPACE,
  ticketTypes: [
    { id: 'epic', name: 'Epic', icon: 'flag', rank: 1, workflowId: 'wf-errands', fields: [] },
    { id: 'chore', name: 'Chore', icon: 'broom', rank: 3, workflowId: 'wf-second', fields: [] },
    { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errands', fields: [] },
  ],
};

describe('3.140 getTicketTypes reads the route that shipped', () => {
  it('names the workspace in the path and hands back the definitions in the server’s order', async () => {
    const { fetchImpl, calls } = recordingFetch({
      [`/v1/workspaces/${WORKSPACE}/ticket-types`]: TICKET_TYPES,
    });
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    const types = await source.query.getTicketTypes(WORKSPACE);
    // The ROWS, printed, not a count: a length assertion passes for a mapper
    // that returned three of anything.
    expect(types.map((type) => [type.id, type.name, type.icon, type.rank, type.workflowId])).toEqual(
      [
        ['epic', 'Epic', 'flag', 1, 'wf-errands'],
        ['chore', 'Chore', 'broom', 3, 'wf-second'],
        ['task', 'Task', 'check', 3, 'wf-errands'],
      ],
    );
    expect(calls.map((call) => call.input)).toEqual([
      `/v1/workspaces/${WORKSPACE}/ticket-types`,
    ]);
  });

  it('re-raises a 404 rather than answering [], because [] would be a claim no workspace can make', async () => {
    // A 404 here is `door(..., 'members-only')` — "you are not in this
    // workspace". `[]` would say "this workspace defines no ticket types", which
    // Plan 4's bootstrap makes impossible: the four built-ins land as real
    // `ticket-type.defined` events at creation. The dialog fed that `[]` would
    // offer no type at all.
    const { fetchImpl } = recordingFetch({});
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    await expect(source.query.getTicketTypes(WORKSPACE)).rejects.toBeInstanceOf(HttpError);
    await expect(source.query.getTicketTypes(WORKSPACE)).rejects.toMatchObject({ status: 404 });
    // Control, same run: the workspace that IS readable answers definitions, so
    // "this method rejects everything" cannot pass the case above.
    const { fetchImpl: ok } = recordingFetch({
      [`/v1/workspaces/${WORKSPACE}/ticket-types`]: TICKET_TYPES,
    });
    const readable = createOnlineDataSource({ baseUrl: '', fetchImpl: ok });
    expect((await readable.query.getTicketTypes(WORKSPACE)).map((type) => type.id)).toEqual([
      'epic',
      'chore',
      'task',
    ]);
  });

  it('a garbled definition fails HERE, named, rather than becoming a typeId in a write', async () => {
    // `ticket-types` is the one read this shell turns into a WRITE: the id
    // chosen in the picker is the `typeId` in `ticket.created`. A malformed
    // entry that survived to the dialog would be submitted under the actor's
    // name and refused by `ticketTypeExists`.
    const { fetchImpl } = recordingFetch({
      [`/v1/workspaces/${WORKSPACE}/ticket-types`]: {
        workspaceId: WORKSPACE,
        ticketTypes: [{ id: 'epic', name: 'Epic', icon: 'flag', rank: '1', workflowId: 'wf', fields: [] }],
      },
    });
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    await expect(source.query.getTicketTypes(WORKSPACE)).rejects.toThrowError(
      'response mapping failed at ticketTypes.ticketTypes[0].rank: expected a number',
    );
  });
});

/**
 * RULING P41, DOOR B — `getTickets` answers the COMPLETE row set or it refuses.
 *
 * C2 was "served a project's first 50 tickets as the whole project". The mapper
 * closed it by REFUSING any page, which was honest and left `getTickets`
 * unusable past 50 tickets. P41 chose the second of the two closures the mapper
 * itself named: a paging loop here, so `TicketListView` keeps meaning *the
 * complete row set* and `views/list-model.ts`'s client-side grouping license
 * stays TRUE. The type is unchanged, so `test/views/list-model.test.ts`'s
 * `paginationTripwire` still compiles and still guards the decision.
 *
 * **The replica source needs no change and this is the place that says so**
 * rather than leaving it inferred: `replicaDataSource.getTickets` reads the
 * local confirmed set directly, so it has always answered the whole project.
 * Paging is a property of the HTTP route, not of the view.
 */
describe('getTickets pages to exhaustion (ruling P41, Door B)', () => {
  it('12.257 assembles a two-page project: both pages, disjoint, and complete together', async () => {
    const { fetchImpl, urls } = pagingFetch([
      { ticketIds: ['t1', 't2'] },
      { ticketIds: ['t3', 't4'] },
    ]);
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    const view = await source.query.getTickets(PROJECT, {}, 'flat');

    // COMPLETE — all four, in page order. A loop that stopped after page one
    // returns ['t1','t2'] and fails here, which is the ruling's first mutation.
    expect(view.rows.map((row) => row.ticketId)).toEqual(['t1', 't2', 't3', 't4']);
    // DISJOINT — no row appears twice. A loop that re-sent the same cursor, or
    // failed to advance it, would double the first page and pass the length
    // check only by accident; this fails on the duplicate.
    expect(new Set(view.rows.map((row) => row.ticketId)).size).toBe(4);
    expect(view.projectId).toBe(PROJECT);

    // TWO REQUESTS, and the second carried the cursor. Without this, a source
    // that fetched page one twice from a stubbed fetch answering everything
    // would satisfy every assertion above.
    expect(urls).toHaveLength(2);
    expect(urls[0]).not.toContain('cursor=');
    // The cursor is the LAST ID OF PAGE ONE, which is what the shipped route
    // emits and consumes — not an index this test made up.
    expect(urls[1]).toContain('cursor=t2');
    // The filter and grouping survive paging — a second page requested without
    // them would silently be a different query against the same accumulator.
    expect(urls[1]).toContain('groupBy=flat');
    // The page size is SENT, not inherited from the server's default — the
    // constant the row bound is computed from, so if this stops being sent the
    // "2000 rows" the user is told becomes a different number silently.
    expect(urls[0]).toContain(`limit=${LIST_PAGE_SIZE}`);
    expect(urls[1]).toContain(`limit=${LIST_PAGE_SIZE}`);
  });

  /**
   * 12.320 — THE EXACT-CAP BOUNDARY, which the three cases above do not reach
   * and a mutant survives.
   *
   * Measured: moving the refusal to `page >= LIST_PAGE_CAP - 1`, thrown after
   * the fetch and before the `nextCursor` check, leaves 12.257 (two pages),
   * 12.259 (one page) and even 12.258 (which asserts `urls.length` AND the
   * absences) all green — while a legitimate project of exactly `LIST_ROW_CAP`
   * tickets refuses. Nothing exercised `pages.length === LIST_PAGE_CAP`, so the
   * boundary between "the largest project that works" and "the smallest that
   * refuses" was asserted on one side only.
   *
   * A cap is a claim about BOTH sides of a line. This is the other side.
   */
  it('12.320 a project of exactly the cap ASSEMBLES — the boundary is inclusive, and refusal starts one page later', async () => {
    const pages = Array.from({ length: LIST_PAGE_CAP }, (_unused, index) => ({
      ticketIds: [`t${index}`],
    }));
    const { fetchImpl, urls } = pagingFetch(pages);
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });

    const view = await source.query.getTickets(PROJECT, {}, 'flat');
    expect(view.rows).toHaveLength(LIST_PAGE_CAP);
    expect(urls).toHaveLength(LIST_PAGE_CAP);
    // Complete and in order, so "did not throw" is not the whole assertion.
    expect(view.rows.map((row) => row.ticketId)).toEqual(
      pages.map((page) => page.ticketIds[0]),
    );
  });

  it('12.258 refuses LOUDLY past the cap rather than serving a truncated project', async () => {
    // One page beyond the cap, every page still offering a cursor. The rows
    // fetched so far are real and sufficient-looking, which is exactly why
    // returning them would be the C2 defect one bound further out.
    const pages = Array.from({ length: LIST_PAGE_CAP + 1 }, (_unused, index) => ({
      ticketIds: [`t${index}`],
    }));
    const { fetchImpl, urls } = pagingFetch(pages);
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });

    const thrown = await source.query
      .getTickets(PROJECT, {}, 'flat')
      .then(() => null)
      .catch((error: unknown) => error);

    // A NAMED refusal in the register, not a bare Error and not a silent
    // truncation — a shell renders it the way it renders every other absence.
    expect(thrown).toBeInstanceOf(ServingGapError);
    expect((thrown as ServingGapError).absences).toEqual([LIST_TOO_LARGE_ABSENCE]);
    // The absence says WHY in a sentence a maintainer can act on, and names the
    // cap as a disclosed assumption rather than a measurement.
    expect((thrown as ServingGapError).message).toContain('COMPLETE row set');
    expect(LIST_TOO_LARGE_ABSENCE.owner).toContain('disclosed assumption');

    // It stopped AT the cap — it did not run away, and it did not stop early.
    // Removing the cap (the ruling's second mutation) makes this loop run to
    // exhaustion and the refusal never fires, so the `toBeInstanceOf` above
    // goes red; without this length check, a cap of 1 would also pass.
    expect(urls).toHaveLength(LIST_PAGE_CAP);
  });

  /**
   * 12.383 — THE CLIFF IS RELIEVED BY NARROWING, which is the property that decides
   * whether a filter affordance is an answer to 12.322 or only a convenience.
   *
   * 12.258 proves the refusal past the cap and 12.320 proves the boundary. Neither
   * says a user who meets that refusal has ANY way out — and until this change there
   * was none: `ticket-list.tsx` sent `{}` and nothing could change it, so a project
   * past the bound refused for ever, on every tab that reads the list.
   *
   * **The fixture is the whole point, and a smaller one would prove nothing.** A case
   * that filters a two-page project shows the filter is WIRED. It does not show the
   * cliff is relieved, because that project never refused. This one is a single
   * project seen two ways: unfiltered it needs `LIST_PAGE_CAP + 1` pages and refuses;
   * narrowed it needs two and answers. Same source, same walk, same cap.
   *
   * The filter is also asserted to reach EVERY page of the walk, not just the first.
   * `listQueryString` is called inside the loop, but a refactor hoisting it out of the
   * loop while keeping the first request correct would narrow page 1 and then ask the
   * server for everything else — a walk that neither refuses nor answers the question,
   * and one no assertion about the returned rows would catch.
   */
  it('12.383 the SAME project refuses unfiltered and answers narrowed — the cliff has a way out', async () => {
    // Eleven pages unfiltered, two when the request carries a `filter`. The fake
    // narrows on the URL because that is where the real narrowing happens: the
    // client's only lever on the walk's length is what it asks for.
    const narrow = (input: string) =>
      new URL(input, 'http://x').searchParams.get('filter') !== null;
    const WIDE = Array.from({ length: LIST_PAGE_CAP + 1 }, (_unused, i) => ({
      ticketIds: [`t${i}`],
    }));
    const NARROW = [{ ticketIds: ['t0'] }, { ticketIds: ['t1'] }];
    const urls: string[] = [];
    const fetchImpl = async (input: string) => {
      urls.push(input);
      const pages = narrow(input) ? NARROW : WIDE;
      const cursor = new URL(input, 'http://x').searchParams.get('cursor');
      const index =
        cursor === null ? 0 : pages.findIndex((page) => page.ticketIds.at(-1) === cursor) + 1;
      const page = pages[index];
      const isLast = index === pages.length - 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          projectId: PROJECT,
          groupBy: 'flat',
          groups: [
            { key: 'all', label: 'All', cards: (page?.ticketIds ?? []).map((id) => listCard(id)) },
          ],
          nextCursor: page === undefined || isLast ? null : (page.ticketIds.at(-1) ?? null),
        }),
      } as unknown as Response;
    };
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });

    // The control, and it must come FIRST: if this did not refuse, the case below
    // would be measuring a project that was never past the cap.
    const refused = await source.query
      .getTickets(PROJECT, {}, 'flat')
      .then(() => null)
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ServingGapError);
    expect((refused as ServingGapError).absences).toEqual([LIST_TOO_LARGE_ABSENCE]);

    // The same project, asked a smaller question, ANSWERS.
    urls.length = 0;
    const view = await source.query.getTickets(
      PROJECT,
      { stateCategories: ['active'] },
      'flat',
    );
    expect(view.rows.map((row) => row.ticketId)).toEqual(['t0', 't1']);

    // And the narrowing was on EVERY request of the walk, not only the first.
    // Printed as a list so a failure names which page went out wide.
    expect(urls.map((url) => new URL(url, 'http://x').searchParams.get('filter'))).toEqual([
      JSON.stringify({ stateCategory: 'active' }),
      JSON.stringify({ stateCategory: 'active' }),
    ]);
  });

  it('12.259 a single-page project makes ONE request and never pages', async () => {
    // The control that keeps the two cases above from being satisfied by a
    // source that always pages: the ordinary small project must not pay a
    // second round trip, and its cursor is null on the first answer.
    const { fetchImpl, urls } = pagingFetch([{ ticketIds: ['t1'] }]);
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    const view = await source.query.getTickets(PROJECT, {}, 'flat');
    expect(view.rows.map((row) => row.ticketId)).toEqual(['t1']);
    expect(urls).toHaveLength(1);
  });
});
