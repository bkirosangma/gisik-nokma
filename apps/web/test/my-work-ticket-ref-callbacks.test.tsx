import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MyWorkView, TicketRead } from '@gisik-nokma/app-core';
import { createClientStateCache } from '@gisik-nokma/app-core';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { Providers, type AppServices } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 18.287 — a final-review finding (2026-09-23): the project page's
 * `TicketSheet` mount supplies `queryTickets`/`resolveTicketHref` (Plan 7
 * Task 4, case 18.274), but My work's own mount
 * (`app/w/[workspaceId]/my-work/page.tsx`) never did — so a `:ticket` picker
 * opened from a comment or description on THIS page falsely reported "No
 * tickets match" instead of searching, and a `ticketRef` chip in a rendered
 * comment here rendered as a plain span instead of a link. My work spans
 * projects, so there is no single "current project" the way the project
 * page has one — the open ticket's OWN project (`openTicketProjectId`) is
 * used for the ordering partition instead (mirrors `buildProjectPageQueryTickets`'s
 * own contract, spec §14.1/D28's "current project's hits first").
 */

let capturedSlotProps: Array<Record<string, unknown>> = [];
vi.mock('@gisik-nokma/editor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gisik-nokma/editor')>();
  return {
    ...actual,
    TicketEditorSlot: function CapturingSlot(props: Record<string, unknown>) {
      capturedSlotProps.push(props);
      return <div data-testid={`stub-${String(props['mode'])}-editor`} />;
    },
  };
});

const push = vi.fn();
let searchParams = new URLSearchParams({ ticket: 'TICKET' });
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: 'WS' }),
  usePathname: () => '/w/WS/my-work',
  useSearchParams: () => searchParams,
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'user_kiro', name: 'Kiro' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import MyWorkPage from '../app/w/[workspaceId]/my-work/page.js';

const WORKSPACE = 'WS';
const PROJECT = 'PROJECT';
const TICKET = 'TICKET';

const WF: WorkflowDef = {
  id: 'wf-errand',
  version: 1,
  name: 'Errand',
  initialStateId: 'todo',
  states: [{ id: 'todo', name: 'To do', category: 'open' }],
  transitions: [],
};

function ticketRead(): TicketRead {
  return {
    ticket: {
      kind: 'ticket',
      id: TICKET,
      workspaceId: WORKSPACE,
      projectId: PROJECT,
      typeId: 'task',
      parentId: null,
      workflowId: WF.id,
      workflowVersion: WF.version,
      stateId: 'todo',
      stateCategory: 'open',
      assigneeId: null,
      collaboratorIds: [],
      fields: {
        title: {
          value: 'Renew the trade licence',
          actorId: 'user_kiro',
          clientTime: '2026-09-23T07:00:00.000Z',
          serverTime: '2026-09-23T07:00:01.000Z',
        },
      },
      transitions: [],
      closed: null,
      rank: null,
      reopenedAt: null,
      deleted: null,
    },
    title: 'Renew the trade licence',
    stateProvenance: {
      actorId: 'user_kiro',
      actorName: 'Kiro',
      clientTime: '2026-09-23T07:00:00.000Z',
      serverTime: '2026-09-23T07:00:01.000Z',
    },
    assignedProvenance: null,
    visibility: null,
    parent: null,
    rollup: null,
    key: null,
    epic: null,
  };
}

function emptyView(): MyWorkView {
  return { assigned: [], inTransit: [], contested: [], shared: [] };
}

function mount(): { services: AppServices } {
  const services = stubServices(
    {
      getMyWork: async () => emptyView(),
      getAttention: async () => [],
      getTicket: async () => ticketRead(),
      getTicketAttachments: async () => [],
      getMyWorkspaces: async () => [
        {
          id: WORKSPACE,
          name: 'Garo Hills Logistics',
          prefix: 'GH',
          role: 'owner' as const,
          memberCount: 1,
          nameRestrictedProjectCount: 0,
          archived: false,
          projects: [{ id: PROJECT, name: 'Shop operations', prefix: 'SF', archived: false, ticketCount: 1, blockedCount: 0 }],
        },
      ],
      getWorkflowDef: async () => WF,
      getTicketHistory: async () => [],
      getTicketComments: async () => [],
      getMembers: async () => [{ id: 'user_kiro', name: 'Kiro', role: 'owner' as const }],
      getTickets: async () => ({ projectId: PROJECT, rows: [] }),
    },
    { ticketLocation: { locate: async (workspaceId: string) => ({ workspaceId, projectId: PROJECT }) } },
  );
  services.cache = createClientStateCache();
  return { services };
}

describe('18.287 My work supplies queryTickets/resolveTicketHref to the open ticket’s sheet', () => {
  it('18.287 both EditorSlot mounts get a working queryTickets and resolveTicketHref, keyed on the OPEN TICKET’s own project', async () => {
    capturedSlotProps = [];
    searchParams = new URLSearchParams({ ticket: TICKET });
    const { services } = mount();
    const search = vi.fn(async (_workspaceId: string, _text: string) => [
      { ticketId: TICKET, projectId: PROJECT, title: 'Renew the trade licence', snippet: '', matchedIn: 'title' as const, key: 'SF-1' },
    ]);
    services.dataSource.query.search = search;

    render(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );
    await screen.findByRole('dialog');
    // The editor loads on first use (smoothness T10), so each slot mounts a tick after the sheet: wait for BOTH modes, not the first.
    await waitFor(() => {
      const modes = capturedSlotProps.map((p) => p['mode']);
      expect(modes).toContain('description');
      expect(modes).toContain('comment');
    });

    const description = capturedSlotProps.find((p) => p['mode'] === 'description');
    const comment = capturedSlotProps.find((p) => p['mode'] === 'comment');
    expect(description?.['queryTickets']).toBeDefined();
    expect(description?.['resolveTicketHref']).toBeDefined();
    expect(comment?.['queryTickets']).toBeDefined();
    expect(comment?.['resolveTicketHref']).toBeDefined();

    const queryTickets = comment?.['queryTickets'] as (
      q: string,
    ) => Promise<Array<{ ticketId: string; projectId: string; key: string; title: string }>>;
    const hits = await queryTickets('licence');
    expect(search).toHaveBeenCalledWith(WORKSPACE, 'licence');
    expect(hits).toEqual([{ ticketId: TICKET, projectId: PROJECT, key: 'SF-1', title: 'Renew the trade licence' }]);

    const resolveTicketHref = comment?.['resolveTicketHref'] as (ref: {
      ticketId: string;
      projectId: string;
    }) => string | null;
    expect(resolveTicketHref({ ticketId: TICKET, projectId: PROJECT })).toBe(`/w/${WORKSPACE}/p/${PROJECT}?ticket=${TICKET}`);
  });
});
