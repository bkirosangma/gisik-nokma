import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BACKLOG_STATE_ID, type TicketTypeDef, type WorkflowDef } from '@gisik-nokma/domain';
import type { DataSourceQuery, ListRow, TicketListView } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Task 10 (backlog/closed spec §5.4) — the Backlog tab, its per-row Start,
 * and the empty copy it hands `TicketList`. Modelled on
 * `project-calendar-timeline.test.tsx` (the `row()`/`typeDef()`/`servedList()`
 * shape) and `project-create-gate.test.tsx` (overriding `dataSource.ingest`
 * directly on a `stubServices()` result, `:463-470`) — both read before this
 * file was written.
 */

const WORKSPACE = 'ws_1';
const PROJECT = 'p_1';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
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

afterEach(() => {
  push.mockClear();
});

const PROVENANCE = {
  actorId: 'user_kiro',
  actorName: 'Kiro',
  clientTime: '2026-09-17T09:00:00.000Z',
  serverTime: '2026-09-17T09:00:01.000Z',
};

/** A `ListRow` exactly as `view-types.ts` declares it. `assignee: null` throughout — see `ticket-list.test.tsx`'s 13.597 docblock for why an assigned row would double-render. */
function row(overrides: Partial<ListRow> = {}): ListRow {
  const base: ListRow = {
    ticketId: 't_1',
    title: 'A ticket',
    typeId: 'task',
    typeRank: 3,
    parentId: null,
    epicId: null,
    stateId: 'doing',
    stateName: 'Doing',
    stateCategory: 'active',
    stateProvenance: PROVENANCE,
    assignee: null,
    assignedProvenance: null,
    dueDate: null,
    fields: {},
    rollup: null,
    hasRestrictedParent: false,
    pending: false,
    closed: null,
    rank: null,
  };
  return { ...base, ...overrides };
}

function typeDef(overrides: Partial<TicketTypeDef> = {}): TicketTypeDef {
  return { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_basic', fields: [], ...overrides };
}

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

/** The shipped-server shape, minus what a case overrides. */
function servedWorld(rows: ListRow[], overrides: Partial<DataSourceQuery> = {}) {
  return stubServices({
    getBoard: async () => ({ projectId: PROJECT, groups: [] }),
    getAttention: async () => [],
    getMembers: async () => [],
    getTicketTypes: async () => [typeDef()],
    getTickets: async (): Promise<TicketListView> => ({ projectId: PROJECT, rows }),
    getWorkflowDef: async (_workspaceId, workflowId) => (workflowId === WORKFLOW.id ? WORKFLOW : null),
    ...overrides,
  });
}

async function backlogTabs(): Promise<HTMLElement[]> {
  await screen.findByRole('tab', { name: 'Board' });
  const container = document.querySelector('.gn-segmented') as HTMLElement;
  return within(container).getAllByRole('tab');
}

/**
 * 13.594 — the fifth tab exists, labelled Backlog, FIRST in the tablist;
 * clicking it shows only backlog rows; the List tab still shows both.
 */
describe('13.594 the Backlog tab', () => {
  it('is labelled Backlog and sits first; narrows to backlog rows; List keeps showing everything', async () => {
    const backlogRow = row({
      ticketId: 'bt_1',
      title: 'Backlog ticket',
      stateId: BACKLOG_STATE_ID,
      stateName: 'Backlog',
      stateCategory: 'open',
    });
    const focusedRow = row({ ticketId: 'ft_1', title: 'Focused ticket' });

    render(
      <Providers services={servedWorld([backlogRow, focusedRow])}>
        <ProjectPage />
      </Providers>,
    );

    const tabs = await backlogTabs();
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Backlog', 'Board', 'List', 'Calendar', 'Timeline']);
    // Board stays the DEFAULT selection even though Backlog is first in the rail.
    expect(screen.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(screen.getByRole('tab', { name: 'Backlog' }));
    expect(await screen.findByText('Backlog ticket')).toBeInTheDocument();
    expect(screen.queryByText('Focused ticket')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'List' }));
    expect(await screen.findByText('Backlog ticket')).toBeInTheDocument();
    expect(screen.getByText('Focused ticket')).toBeInTheDocument();
  });
});

/** 13.596 — the empty copy when the project holds no backlog rows. */
describe('13.596 the Backlog tab, empty', () => {
  it('shows "Nothing in the backlog — new tickets land here." with no backlog rows', async () => {
    const focusedRow = row({ ticketId: 'ft_1', title: 'Focused ticket' });
    render(
      <Providers services={servedWorld([focusedRow])}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));
    expect(
      await screen.findByText('Nothing in the backlog — new tickets land here.'),
    ).toBeInTheDocument();
  });
});

/**
 * 13.595 — Start ingests `ticket.transitioned {to: initialStateId}` and the
 * row leaves the tab on reload; a refused Start renders the reason per row
 * and re-enables the button (Ruling 41 — the "gated initial edge opens the
 * dialog" branch this case's brief originally named is STRUCK: the universal
 * Start edge carries no rules, ever, so that branch is unreachable).
 */
describe('13.595 Start on a Backlog row', () => {
  it('ingests ticket.transitioned {to: the fixture workflow\'s initialStateId}, and the row leaves the tab on reload', async () => {
    const backlogRow = row({
      ticketId: 'bt_1',
      title: 'Backlog ticket',
      typeId: 'task',
      stateId: BACKLOG_STATE_ID,
      stateName: 'Backlog',
      stateCategory: 'open',
    });
    // Call-count-driven: the FIRST `getTickets` answers with the row still in
    // the backlog; every read after names it moved. Without this, `list.reload()`
    // firing is unfalsifiable — a fixed answer can never show the row leaving.
    let callCount = 0;
    const getTickets = async (): Promise<TicketListView> => {
      callCount += 1;
      if (callCount === 1) return { projectId: PROJECT, rows: [backlogRow] };
      return {
        projectId: PROJECT,
        rows: [{ ...backlogRow, stateId: 'todo', stateName: 'To do', stateCategory: 'active' }],
      };
    };
    const services = servedWorld([], { getTickets });
    const ingested: Array<{ workspaceId: string; entityId: string; type: string; to: unknown }> = [];
    services.dataSource.ingest = async (events) => {
      for (const event of events) {
        ingested.push({
          workspaceId: event.workspaceId,
          entityId: event.entity.id,
          type: event.type,
          to: (event.payload as { to?: unknown }).to,
        });
      }
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-17T09:05:00.000Z',
      }));
    };

    render(
      <Providers services={services}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));
    expect(await screen.findByText('Backlog ticket')).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: 'Start Backlog ticket' }));

    await waitFor(() =>
      expect(ingested).toEqual([
        { workspaceId: WORKSPACE, entityId: 'bt_1', type: 'ticket.transitioned', to: 'todo' },
      ]),
    );
    // The row leaves the Backlog tab once the reload's answer no longer
    // places it there — the ticket itself is not deleted, only its state
    // moved, exactly as `getTickets` above models.
    await waitFor(() => expect(screen.queryByText('Backlog ticket')).not.toBeInTheDocument());
  });

  it('a refused Start renders the reason, and the button is enabled again', async () => {
    const backlogRow = row({
      ticketId: 'bt_1',
      title: 'Backlog ticket',
      typeId: 'task',
      stateId: BACKLOG_STATE_ID,
      stateName: 'Backlog',
      stateCategory: 'open',
    });
    const services = servedWorld([backlogRow]);
    services.dataSource.ingest = async (events) =>
      events.map((event) => ({
        status: 'refused' as const,
        eventId: event.id,
        rule: 'some-rule',
        reason: 'Some reason.',
      }));

    render(
      <Providers services={services}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));
    const startButton = await screen.findByRole('button', { name: 'Start Backlog ticket' });
    await userEvent.click(startButton);

    expect(await screen.findByText('Refused by the server — some-rule: Some reason.')).toBeInTheDocument();
    await waitFor(() => expect(startButton).toBeEnabled());
    // Never the transport wording, for a refusal — Ruling 27/41's split.
    expect(screen.queryByText(/did not answer this start/)).not.toBeInTheDocument();
  });
});
