import { describe, expect, it, vi } from 'vitest';
import { createHttpClient, type FetchLike } from '@gisik-nokma/app-core/online';
import type { DataSource } from '@gisik-nokma/app-core';
import {
  AuthoringReadRefused,
  createWebAuthoringGateway,
} from '../src/authoring/data-source-gateway.js';

/**
 * ## The transport under test is the REAL one
 *
 * `createHttpClient` is built here over a scripted `fetch` rather than replaced
 * by a hand-written `HttpClient` stub, for one measured reason: the behaviour
 * these cases are about IS the transport's — `send` answers **`null`** for a 404
 * on a GET (the read affordance every `/v1` read route depends on, because
 * "no such thing" and "not yours" are one frozen body). A stub of the client
 * would let this file decide what a 404 does, and the adapter's whole reason for
 * existing is what it does with that `null`.
 */
function scriptedHttp(routes: Record<string, { status: number; body?: unknown }>) {
  const seen: Array<{ method: string; path: string; body: unknown }> = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const method = init?.method ?? 'GET';
    seen.push({
      method,
      path: input,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const scripted = routes[`${method} ${input}`];
    if (scripted === undefined) throw new Error(`this case scripted no ${method} ${input}`);
    return new Response(scripted.body === undefined ? null : JSON.stringify(scripted.body), {
      status: scripted.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { http: createHttpClient('', fetchImpl), seen };
}

const WORKFLOW = {
  id: 'wf-flow',
  version: 3,
  name: 'Flow',
  initialStateId: 'todo',
  states: [{ id: 'todo', name: 'To do', category: 'open' }],
  transitions: [],
};

function fakeDataSource(overrides: Partial<DataSource['query']> = {}) {
  const unstubbed = (name: string) => () =>
    Promise.reject(new Error(`this case did not stub ${name}`));
  return {
    ingest: vi.fn(async () => [
      { status: 'committed' as const, eventId: 'e', seq: 1, serverTime: 't' },
    ]),
    query: {
      getMyWorkspaces: unstubbed('getMyWorkspaces'),
      getMembers: vi.fn(unstubbed('getMembers')),
      getBoard: unstubbed('getBoard'),
      getTickets: unstubbed('getTickets'),
      getTicket: unstubbed('getTicket'),
      getTicketHistory: unstubbed('getTicketHistory'),
      getWorkflowDef: vi.fn(async () => WORKFLOW),
      getTicketTypes: vi.fn(async () => []),
      search: unstubbed('search'),
      getMyWork: unstubbed('getMyWork'),
      getAttention: unstubbed('getAttention'),
      getPreferences: unstubbed('getPreferences'),
      putPreferences: unstubbed('putPreferences'),
      ...overrides,
    },
    subscribe: vi.fn(() => () => undefined),
  } as unknown as DataSource & {
    ingest: ReturnType<typeof vi.fn>;
    query: { getWorkflowDef: ReturnType<typeof vi.fn>; getTicketTypes: ReturnType<typeof vi.fn>; getMembers: ReturnType<typeof vi.fn> };
  };
}

describe('the three reads and the one write that Plan 6’s DataSource already serves go through it', () => {
  it('getWorkflow, listTicketTypes and submit delegate to DataSource and speak no HTTP', async () => {
    const dataSource = fakeDataSource();
    // No routes scripted at all: any HTTP call from these three throws by name.
    const { http, seen } = scriptedHttp({});
    const gateway = createWebAuthoringGateway({ dataSource, http });

    expect(await gateway.getWorkflow('ws', 'wf-flow')).toEqual(WORKFLOW);
    expect(dataSource.query.getWorkflowDef).toHaveBeenCalledWith('ws', 'wf-flow');

    expect(await gateway.listTicketTypes('ws')).toEqual([]);
    expect(dataSource.query.getTicketTypes).toHaveBeenCalledWith('ws');

    const events = [{ id: 'evt' }] as never;
    expect(await gateway.submit(events)).toEqual([
      { status: 'committed', eventId: 'e', seq: 1, serverTime: 't' },
    ]);
    expect(dataSource.ingest).toHaveBeenCalledWith(events);

    // Printed, not counted: a failure names the request that should not exist.
    expect(seen).toEqual([]);
  });
});

describe('listMembers cannot go through DataSource.getMembers, and this is the measurement', () => {
  it('reads the roster over HTTP and keeps the role DataSource.getMembers discards', async () => {
    const dataSource = fakeDataSource();
    const { http } = scriptedHttp({
      'GET /v1/workspaces/ws/members': {
        status: 200,
        body: {
          workspaceId: 'ws',
          members: [
            { userId: 'u-anselma', displayName: 'Anselma Marak', role: 'admin' },
            { userId: 'u-bikash', displayName: 'Bikash Sangma', role: 'member' },
          ],
        },
      },
    });
    const gateway = createWebAuthoringGateway({ dataSource, http });

    expect(await gateway.listMembers('ws')).toEqual([
      { userId: 'u-anselma', displayName: 'Anselma Marak', role: 'admin' },
      { userId: 'u-bikash', displayName: 'Bikash Sangma', role: 'member' },
    ]);
    // The control that makes the claim falsifiable: routing this through
    // `DataSource.query.getMembers` would satisfy an assertion on names alone,
    // because `Actor` carries `id` and `name`. It carries NO role, and the
    // builder's rule summaries and `require-different-user` editors are built
    // on the roster's roles.
    expect(dataSource.query.getMembers).not.toHaveBeenCalled();
  });

  it('a 404 — the no-guests door — rejects with the named refusal, never an empty roster', async () => {
    const { http } = scriptedHttp({ 'GET /v1/workspaces/ws/members': { status: 404, body: {} } });
    const gateway = createWebAuthoringGateway({ dataSource: fakeDataSource(), http });
    await expect(gateway.listMembers('ws')).rejects.toBeInstanceOf(AuthoringReadRefused);
  });
});

describe('the three reads with no DataSource member at all go over the shipped routes', () => {
  it('listWorkflows unwraps WorkflowListResponse.workflows', async () => {
    const { http, seen } = scriptedHttp({
      'GET /v1/workspaces/ws/workflows': {
        status: 200,
        body: { workspaceId: 'ws', workflows: [WORKFLOW] },
      },
    });
    const gateway = createWebAuthoringGateway({ dataSource: fakeDataSource(), http });
    expect(await gateway.listWorkflows('ws')).toEqual([WORKFLOW]);
    expect(seen.map((call) => `${call.method} ${call.path}`)).toEqual([
      'GET /v1/workspaces/ws/workflows',
    ]);
  });

  it('getStateOccupancy unwraps .counts, zeroes included', async () => {
    const { http } = scriptedHttp({
      'GET /v1/workspaces/ws/workflows/wf-flow/state-occupancy': {
        status: 200,
        body: { workspaceId: 'ws', workflowId: 'wf-flow', counts: { todo: 2, done: 0 } },
      },
    });
    const gateway = createWebAuthoringGateway({ dataSource: fakeDataSource(), http });
    expect(await gateway.getStateOccupancy('ws', 'wf-flow')).toEqual({ todo: 2, done: 0 });
  });

  it('getTypeWorkflowPopulation names the workflow in the query string and unwraps .count', async () => {
    const { http, seen } = scriptedHttp({
      'GET /v1/workspaces/ws/ticket-types/task/population?workflowId=wf-flow': {
        status: 200,
        body: { workspaceId: 'ws', typeId: 'task', workflowId: 'wf-flow', count: 7 },
      },
    });
    const gateway = createWebAuthoringGateway({ dataSource: fakeDataSource(), http });
    expect(await gateway.getTypeWorkflowPopulation('ws', 'task', 'wf-flow')).toBe(7);
    expect(seen.map((call) => call.path)).toEqual([
      '/v1/workspaces/ws/ticket-types/task/population?workflowId=wf-flow',
    ]);
  });
});

/**
 * The sharpest cases in this file. `createHttpClient` answers `null` for a 404
 * on a GET, and the three reads above have obvious-looking empties to fall back
 * on: `[]`, `{}` and `0`. Every one of them would be this adapter inventing an
 * answer the server declined to give — "this workspace has no workflows", "no
 * ticket is in any state", "nothing is pinned to this workflow" — at the moment
 * a mapping dialog is deciding there is nothing to move. `gateway.ts` forbids
 * exactly this by name for both counts: "it may reject, and the caller says
 * 'unavailable' rather than guessing a number".
 */
describe('a 404 is a refusal to answer, and never an empty answer', () => {
  it.each([
    ['listWorkflows', 'GET /v1/workspaces/ws/workflows', (g: ReturnType<typeof createWebAuthoringGateway>) => g.listWorkflows('ws')],
    [
      'getStateOccupancy',
      'GET /v1/workspaces/ws/workflows/wf-flow/state-occupancy',
      (g: ReturnType<typeof createWebAuthoringGateway>) => g.getStateOccupancy('ws', 'wf-flow'),
    ],
    [
      'getTypeWorkflowPopulation',
      'GET /v1/workspaces/ws/ticket-types/task/population?workflowId=wf-flow',
      (g: ReturnType<typeof createWebAuthoringGateway>) => g.getTypeWorkflowPopulation('ws', 'task', 'wf-flow'),
    ],
  ])('%s rejects rather than answering an empty', async (_name, route, call) => {
    const { http } = scriptedHttp({ [route]: { status: 404, body: {} } });
    const gateway = createWebAuthoringGateway({ dataSource: fakeDataSource(), http });
    await expect(call(gateway)).rejects.toBeInstanceOf(AuthoringReadRefused);
  });
});

describe('migrateTypeToWorkflow: a refusal is a VALUE, and an unreadable failure is not', () => {
  it('a 200 answers the migrated outcome and sends the door’s own body shape', async () => {
    const { http, seen } = scriptedHttp({
      'POST /v1/workspaces/ws/ticket-types/task/migrate': {
        status: 200,
        body: { status: 'migrated', count: 4 },
      },
    });
    const gateway = createWebAuthoringGateway({ dataSource: fakeDataSource(), http });
    expect(
      await gateway.migrateTypeToWorkflow({
        workspaceId: 'ws',
        typeId: 'task',
        fromWorkflowId: 'wf-old',
        toWorkflowId: 'wf-new',
        stateMap: { todo: 'open' },
      }),
    ).toEqual({ status: 'migrated', count: 4 });
    // `migrateBodySchema` is `.strict()`: `workspaceId` and `typeId` live in the
    // URL, and sending them in the body too would be refused as unknown keys.
    expect(seen[0]?.body).toEqual({
      fromWorkflowId: 'wf-old',
      toWorkflowId: 'wf-new',
      stateMap: { todo: 'open' },
    });
  });

  it('a 422 carrying the door’s refusal comes back as the outcome, not as a throw', async () => {
    const { http } = scriptedHttp({
      'POST /v1/workspaces/ws/ticket-types/task/migrate': {
        status: 422,
        body: {
          status: 'refused',
          rule: 'migration.unmapped-state',
          reason: 'Tickets are sitting in "todo" and the map gives it no target.',
        },
      },
    });
    const gateway = createWebAuthoringGateway({ dataSource: fakeDataSource(), http });
    expect(
      await gateway.migrateTypeToWorkflow({
        workspaceId: 'ws',
        typeId: 'task',
        fromWorkflowId: 'wf-old',
        toWorkflowId: 'wf-new',
        stateMap: {},
      }),
    ).toEqual({
      status: 'refused',
      rule: 'migration.unmapped-state',
      reason: 'Tickets are sitting in "todo" and the map gives it no target.',
    });
  });

  it('a failure with no readable refusal in it REJECTS — it does not become an invented rule', async () => {
    const { http } = scriptedHttp({
      'POST /v1/workspaces/ws/ticket-types/task/migrate': { status: 500, body: { error: 'boom' } },
    });
    const gateway = createWebAuthoringGateway({ dataSource: fakeDataSource(), http });
    await expect(
      gateway.migrateTypeToWorkflow({
        workspaceId: 'ws',
        typeId: 'task',
        fromWorkflowId: 'wf-old',
        toWorkflowId: 'wf-new',
        stateMap: {},
      }),
    ).rejects.toThrow('HTTP 500');
  });
});
