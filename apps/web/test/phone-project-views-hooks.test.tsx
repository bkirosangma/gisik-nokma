import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain';
import type { ListRow } from '@gisik-nokma/app-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '../src/providers.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * The web app on phones, Plan Task 8 — the CLASS HOOKS the project header's phone rules key on (case 21.110).
 * `phone-project-views.test.ts` pins the CSS; this pins that the page CARRIES the classes that CSS paints.
 * A phone rule on a class the component does not carry is a rule that paints nothing and passes every
 * value check — the survivor the controller's mutation run found on Task 6.
 */
const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';
const ANSELMA = '01J9USER000000000000000000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: WORKSPACE, projectId: PROJECT }),
  usePathname: () => `/w/${WORKSPACE}/p/${PROJECT}`,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: ANSELMA, name: 'Anselma Marak' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

beforeEach(() => {
  clearWorkspaceNameCache();
  clearWorkspaceProjectsCache();
});

// Create ticket is offered only once the type ladder and the project's rows have answered (`createRegion`).
const TYPES = [{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand', fields: [] }] as unknown as TicketTypeDef[];

const world = (overrides: Parameters<typeof stubServices>[0] = {}) =>
  stubServices({
    getTickets: async () => ({ projectId: PROJECT, rows: [] }),
    getTicketTypes: async () => TYPES,
    getMyWorkspaces: async () => [
      {
        id: WORKSPACE,
        name: 'Garo Hills Logistics',
        prefix: 'GH',
        role: 'owner',
        archived: false,
        memberCount: 3,
        nameRestrictedProjectCount: 0,
        projects: [{ id: PROJECT, name: 'Errand tracking', prefix: 'ET', archived: false, ticketCount: 4, blockedCount: 0 }],
      },
    ],
    ...overrides,
  });

describe('21.110 the project header carries the classes its phone rules key on', () => {
  it('21.110 the view tabs are `.gn-project__rail`, the search is `.gn-project__search`, Filters is `.gn-project__filters` and Create ticket is the header’s one direct-child primary', async () => {
    render(
      <Providers services={world()}>
        <ProjectPage />
      </Providers>,
    );
    const search = await screen.findByRole('searchbox', { name: 'Search the board' });
    const header = document.querySelector('.gn-project__head > .gn-project__header');
    expect(header).not.toBeNull();

    expect(search).toHaveClass('gn-project__search');
    expect(header?.contains(search)).toBe(true);

    const filters = screen.getByRole('button', { name: 'Filters' });
    expect(filters).toHaveClass('gn-project__filters');
    expect(filters.parentElement).toBe(header);

    // The CSS selector is `.gn-project__header > .gn-button--primary`: the primary must be a DIRECT child.
    const create = await screen.findByRole('button', { name: 'Create ticket' });
    expect(create).toHaveClass('gn-button--primary');
    expect(create.parentElement).toBe(header);
    // …and it is the ONLY primary in the header, so "the one primary at full width" names one button.
    expect(header?.querySelectorAll(':scope > .gn-button--primary')).toHaveLength(1);

    // The tab rail: the tablist the phone arm turns into a scroller.
    const rail = screen.getByRole('tablist', { name: 'Project view' });
    expect(rail).toHaveClass('gn-project__rail');
    expect(rail).toHaveClass('gn-segmented');
    expect(rail.querySelectorAll('.gn-segmented__item').length).toBeGreaterThanOrEqual(5);
  });
});

/**
 * 21.111 — the PAGE'S OWN bulk bar. The app-core hooks test hands `TicketList` a `controls` span it planted itself, so it can
 * only find what it put there: the page's real `gn-list__bulk` / `gn-list__bulk-close` classes (the ones the full-width
 * rules paint) were tied to nothing. This renders the project page's List tab and walks the real DOM.
 */
const PROVENANCE = {
  actorId: ANSELMA,
  actorName: 'Anselma Marak',
  clientTime: '2026-09-18T09:00:00.000Z',
  serverTime: '2026-09-18T09:00:01.000Z',
};

const doneRow: ListRow = {
  ticketId: 't_1',
  title: 'Deliver the crates',
  key: 'ET-1',
  typeId: 'task',
  typeRank: 3,
  parentId: null,
  epicId: null,
  stateId: 'done',
  stateName: 'Done',
  stateCategory: 'terminal',
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
};

const WORKFLOW: WorkflowDef = {
  id: 'wf-errand',
  version: 1,
  name: 'Errand',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [],
};

const listWorld = () =>
  world({
    getBoard: async () => ({ projectId: PROJECT, groups: [] }),
    getMembers: async () => [],
    getTickets: async () => ({ projectId: PROJECT, rows: [doneRow] }),
    getWorkflowDef: async (_workspaceId, workflowId) => (workflowId === WORKFLOW.id ? WORKFLOW : null),
  });

describe('21.111 the project page’s real List bulk bar carries the classes the full-width rules key on', () => {
  it('21.111 `.gn-list__controls-end > .gn-list__bulk > .gn-list__bulk-close` on the arming button, and again on Confirm close once armed', async () => {
    const user = userEvent.setup();
    render(
      <Providers services={listWorld()}>
        <ProjectPage />
      </Providers>,
    );
    await user.click(await screen.findByRole('tab', { name: 'List' }));
    const arm = await screen.findByRole('button', { name: 'Bulk close' });
    const CHAIN = '.gn-list__controls-end > .gn-list__bulk > .gn-list__bulk-close';
    expect(arm.matches(CHAIN)).toBe(true);
    // CONTROL — unarmed, there is no Confirm close yet; the arming button is the one `gn-list__bulk-close` in the bar.
    expect(screen.queryByRole('button', { name: /^Confirm close/ })).toBeNull();
    expect(document.querySelectorAll('.gn-list__bulk-close')).toHaveLength(1);

    await user.click(arm);
    const confirm = screen.getByRole('button', { name: 'Confirm close (0)' });
    expect(confirm.matches(CHAIN)).toBe(true);
    // …and the ✕ sits in the same bar beside it, and the arming button is gone (still the one `gn-list__bulk-close`).
    expect(screen.getByRole('button', { name: 'Cancel bulk close' }).parentElement).toBe(confirm.parentElement);
    expect(screen.queryByRole('button', { name: 'Bulk close' })).toBeNull();
    expect(document.querySelectorAll('.gn-list__bulk-close')).toHaveLength(1);
  });
});
