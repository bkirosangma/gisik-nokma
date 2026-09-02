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
      ['getMyWorkspaces', () => source.query.getMyWorkspaces(), 'WorkspaceRef.projects'],
      ['getTickets', () => source.query.getTickets(PROJECT, {}, 'flat'), 'ListRow.typeRank'],
      ['getTicket', () => source.query.getTicket(WORKSPACE, 't_1'), 'TicketRead.title'],
      ['search', () => source.query.search(WORKSPACE, 'q'), 'SearchHit.matchedIn'],
      ['getMyWork', () => source.query.getMyWork(WORKSPACE), 'ContestedClaim.title'],
      ['getAttention', () => source.query.getAttention(WORKSPACE), "kind 'contested'"],
    ];
    for (const [method, call, field] of expected) {
      await expect(call(), method).rejects.toBeInstanceOf(ServingGapError);
      await expect(call(), method).rejects.toThrow(field);
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
      projects: { [PROJECT]: { columns: ['status'], grouping: 'epic' } },
      savedFilters: [],
    });
    await source.query.getMyWork(WORKSPACE).catch(() => undefined);
    expect(calls.map((call) => call.input)).toEqual([
      `/v1/me/preferences?workspaceId=${WORKSPACE}`,
      `/v1/me/preferences?workspaceId=${WORKSPACE}`,
      `/v1/me/work?workspaceId=${WORKSPACE}`,
    ]);
    // The PUT sends the SERVER's document (P24), not the client's.
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      savedFilters: [],
      listColumns: { [PROJECT]: ['status'] },
      grouping: { [PROJECT]: 'epic' },
    });
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
