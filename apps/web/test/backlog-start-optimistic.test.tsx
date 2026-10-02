import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKLOG_STATE_ID, type TicketTypeDef, type WorkflowDef } from '@gisik-nokma/domain';
import type { IngestResult } from '@gisik-nokma/domain';
import type { ListRow, TicketListView } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { START_TTL_MS, useOptimisticStarts } from '../src/use-optimistic-starts.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * The Backlog tab's Start, shown at once and rolled back honestly (smoothness T7, spec S5; audit SM-03; owner D2b) —
 * case 25.098. The hook's own bounds are exercised through the page, the way a person meets them.
 */

const WORKSPACE = 'ws_1';
const PROJECT = 'p_1';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: WORKSPACE, projectId: PROJECT }),
  usePathname: () => `/w/${WORKSPACE}/p/${PROJECT}`,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'user_kiro', name: 'Kiro' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

afterEach(() => vi.useRealTimers());

const PROVENANCE = { actorId: 'user_kiro', actorName: 'Kiro', clientTime: '2026-09-17T09:00:00.000Z', serverTime: '2026-09-17T09:00:01.000Z' };

function row(overrides: Partial<ListRow>): ListRow {
  return {
    ticketId: 'bt_1',
    title: 'Backlog ticket',
    key: 'CCSO-7',
    typeId: 'task',
    typeRank: 3,
    parentId: null,
    epicId: null,
    stateId: BACKLOG_STATE_ID,
    stateName: 'Backlog',
    stateCategory: 'open',
    stateProvenance: PROVENANCE,
    assignee: null,
    assignedProvenance: null,
    dueDate: null,
    priority: { value: 'P2', claim: PROVENANCE },
    fields: {},
    rollup: null,
    hasRestrictedParent: false,
    pending: false,
    closed: null,
    rank: null,
    ...overrides,
  };
}

const TYPE: TicketTypeDef = { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_basic', fields: [] };
const WORKFLOW: WorkflowDef = {
  id: 'wf_basic',
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
  ],
  transitions: [],
};

function deferred() {
  let resolve!: (results: IngestResult[]) => void;
  const promise = new Promise<IngestResult[]>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** The world the page reads: the row is in the backlog for every read until `moved` flips, then it is in To do. */
function world() {
  const state = { moved: false };
  const backlogRow = row({});
  const services = stubServices({
    getBoard: async () => ({ projectId: PROJECT, groups: [] }),
    getMembers: async () => [],
    getTicketTypes: async () => [TYPE],
    getTickets: async (): Promise<TicketListView> => ({
      projectId: PROJECT,
      rows: [state.moved ? { ...backlogRow, stateId: 'todo', stateName: 'To do', stateCategory: 'open' } : backlogRow],
    }),
    getWorkflowDef: async (_workspaceId, workflowId) => (workflowId === WORKFLOW.id ? WORKFLOW : null),
  });
  const writes: Array<ReturnType<typeof deferred>> = [];
  services.dataSource.ingest = async () => {
    const write = deferred();
    writes.push(write);
    return write.promise;
  };
  return { services, writes, state };
}

async function openBacklog(services: ReturnType<typeof world>['services']) {
  render(
    <Providers services={services}>
      <ProjectPage />
    </Providers>,
  );
  await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));
  expect(await screen.findByText('Backlog ticket')).toBeInTheDocument();
}

describe('25.098 Start on a Backlog row', () => {
  it('25.098 the row leaves the tab the moment Start is clicked, and a commit keeps it gone even while the reload still says Backlog', async () => {
    const { services, writes } = world();
    await openBacklog(services);
    await userEvent.click(await screen.findByRole('button', { name: 'Start Backlog ticket' }));
    // Gone this frame, with the write still open.
    expect(screen.queryByText('Backlog ticket')).toBeNull();
    await waitFor(() => expect(writes).toHaveLength(1));
    writes[0]!.resolve([{ status: 'committed', eventId: 'e', seq: 3, serverTime: '2026-10-02T09:00:00.000Z' } as IngestResult]);
    // The reload answers STALE (the row is still in the backlog): it must not flash back.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.queryByText('Backlog ticket')).toBeNull();
  });

  it('25.098 a refused Start puts the row back WITH the reason, and the button works again', async () => {
    const { services, writes } = world();
    await openBacklog(services);
    await userEvent.click(await screen.findByRole('button', { name: 'Start Backlog ticket' }));
    expect(screen.queryByText('Backlog ticket')).toBeNull();
    await waitFor(() => expect(writes).toHaveLength(1));
    writes[0]!.resolve([{ status: 'refused', eventId: 'e', rule: 'some-rule', reason: 'Some reason.' } as IngestResult]);
    // The row is back where the data says it is, and the reason is under it (held on the page: the button's own state died with the row).
    expect(await screen.findByText('Backlog ticket')).toBeInTheDocument();
    expect(await screen.findByText('Refused by the server: some-rule: Some reason.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Backlog ticket' })).toBeEnabled();
    // Control: a second attempt clears the old reason (the row is hidden again) and is its own write.
    await userEvent.click(screen.getByRole('button', { name: 'Start Backlog ticket' }));
    expect(screen.queryByText('Refused by the server: some-rule: Some reason.')).toBeNull();
    await waitFor(() => expect(writes).toHaveLength(2));
  });

  it('25.098 a Start the server never answers brings the row back with the transport sentence, not a refusal', async () => {
    const { services } = world();
    services.dataSource.ingest = async () => [];
    await openBacklog(services);
    await userEvent.click(await screen.findByRole('button', { name: 'Start Backlog ticket' }));
    expect(await screen.findByText('The server did not answer this start.')).toBeInTheDocument();
    expect(screen.getByText('Backlog ticket')).toBeInTheDocument();
    expect(screen.queryByText(/Refused by the server/)).toBeNull();
  });

  it('25.098 a committed Start whose read agrees (the row is no longer in the backlog) stays gone', async () => {
    const { services, writes, state } = world();
    await openBacklog(services);
    await userEvent.click(await screen.findByRole('button', { name: 'Start Backlog ticket' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    state.moved = true;
    writes[0]!.resolve([{ status: 'committed', eventId: 'e', seq: 3, serverTime: '2026-10-02T09:00:00.000Z' } as IngestResult]);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.queryByText('Backlog ticket')).toBeNull();
  });
});

describe('25.098 useOptimisticStarts (the bounds of the hide)', () => {
  beforeEach(() => vi.useFakeTimers());

  it('25.098 begin hides at once; settle keeps it hidden until a read drops the row from the backlog; fail unhides and keeps the reason; a settled hide no read confirms expires', () => {
    let inBacklog: ReadonlySet<string> | null = new Set(['a', 'b']);
    const { result, rerender } = renderHook(() => useOptimisticStarts(inBacklog));
    act(() => result.current.begin('a'));
    expect(result.current.hidden.has('a')).toBe(true);
    act(() => result.current.settle('a'));
    // A stale read that still holds the row retires nothing.
    rerender();
    expect(result.current.hidden.has('a')).toBe(true);
    // The read that no longer holds it retires the hide.
    inBacklog = new Set(['b']);
    rerender();
    expect(result.current.hidden.has('a')).toBe(false);
    // A refusal unhides the row and keeps the words; the next begin clears them.
    act(() => result.current.begin('b'));
    act(() => result.current.fail('b', { kind: 'server', rule: 'r', reason: 'No.' }));
    expect(result.current.hidden.has('b')).toBe(false);
    expect(result.current.refusals['b']).toEqual({ kind: 'server', rule: 'r', reason: 'No.' });
    act(() => result.current.begin('b'));
    expect(result.current.refusals['b']).toBeUndefined();
    // Control: an OPEN write never expires by itself (only a settled one is on the clock)…
    act(() => {
      vi.advanceTimersByTime(START_TTL_MS * 2);
    });
    expect(result.current.hidden.has('b')).toBe(true);
    // …and a settled one the read never confirms does.
    inBacklog = new Set(['b']);
    act(() => result.current.settle('b'));
    act(() => {
      vi.advanceTimersByTime(START_TTL_MS - 1);
    });
    expect(result.current.hidden.has('b')).toBe(true);
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(result.current.hidden.has('b')).toBe(false);
  });
});
