import { describe, expect, it } from 'vitest';
import type { BoardResponse, MemberListResponse } from '@gisik-nokma/domain';
import {
  MAX_INGEST_BATCH,
  createOnlineDataSource,
  listQueryString,
} from '../../src/online/online-data-source.js';
import { ServingGapError, UnexpressibleFilterError } from '../../src/online/mappers.js';
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
    expect(await source.query.getMembers(WORKSPACE)).toEqual([
      { id: ANSELMA, name: 'Anselma Marak' },
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
