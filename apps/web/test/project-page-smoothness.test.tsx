import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  liveQueryStoreKey,
  recallLiveQuery,
  type ListRow,
  type RosterMember,
  type TicketListView,
  type WorkspaceRef,
} from '@gisik-nokma/app-core';
import { BACKLOG_STATE_ID, type TicketTypeDef } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { clearReadCaches } from '../src/clear-read-caches.js';
import { rememberLastUserId } from '../src/last-user-id.js';
import { readProjectTab, rememberProjectTab } from '../src/use-last-project.js';
import { useMyWorkspaces } from '../src/use-my-workspaces.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Smoothness T6 (spec D9, S1, S4, S-R1; audit SM-01, SM-02, SM-09): the project page. Cases 25.072–25.086 (25.071 is the
 * amended sweep in `loading-status.test.tsx`; 25.079–25.081 are `packages/app-core/test/views/project-reads-cache.test.tsx`;
 * 25.070 is unused). Mounted through `Providers` + `stubServices`, the way `project-calendar-timeline.test.tsx` does.
 */
const push = vi.fn();
let suspendSearchParams = false;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: 'ws_1', projectId: 'p_1' }),
  usePathname: () => '/w/ws_1/p/p_1',
  useSearchParams: () => {
    // A promise thrown inside the boundary is what shows the Suspense fallback (the case that exercises the fallback).
    if (suspendSearchParams) throw new Promise<never>(() => {});
    return new URLSearchParams();
  },
}));

let mockSession: { data: { user: { id: string; name: string } } | null; isPending: boolean } = {
  data: { user: { id: 'u_kiro', name: 'Kiro' } },
  isPending: false,
};
vi.mock('../src/auth-client.js', () => ({
  authClient: { useSession: () => mockSession, signOut: async () => ({ data: {}, error: null }) },
}));

// The one reader on this page that keeps its OWN `getMyWorkspaces` call on purpose (T4: it derives a permission, and the in-flight
// dedupe folds it into the shared call only in the same tick). Silenced here so 25.085 counts what T6 moved — ProjectTitle's read —
// and nothing else; no case in this file is about moderation.
vi.mock('../src/use-can-moderate-comments.js', () => ({ useCanModerateComments: () => false }));

// Records every startTransition / useTransition-started update so a case can tell a transition from a plain set-state.
const transitions = { start: 0, hook: 0 };
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    startTransition: (scope: () => void) => {
      transitions.start += 1;
      actual.startTransition(scope);
    },
    useTransition: () => {
      const [pending, start] = actual.useTransition();
      return [
        pending,
        (scope: () => void) => {
          transitions.hook += 1;
          start(scope);
        },
      ] as const;
    },
  };
});

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

const MEMBERS: RosterMember[] = [{ id: 'u_kiro', name: 'Kiro', role: 'owner' }];
const provenance = { actorId: 'u_kiro', actorName: 'Kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' };

function listRow(overrides: Partial<ListRow> = {}): ListRow {
  return {
    ticketId: 't_1',
    title: 'Restock the cold shelf',
    key: 'CCSO-7',
    typeId: 'task',
    typeRank: 3,
    parentId: null,
    epicId: null,
    stateId: 'doing',
    stateName: 'Doing',
    stateCategory: 'active',
    stateProvenance: provenance,
    assignee: null,
    assignedProvenance: null,
    dueDate: null,
    priority: { value: 'P2', claim: provenance },
    fields: { title: { value: 'Restock the cold shelf', actorId: 'u_kiro', clientTime: provenance.clientTime, serverTime: provenance.serverTime } },
    rollup: null,
    hasRestrictedParent: false,
    pending: false,
    closed: null,
    rank: null,
    ...overrides,
  };
}
const typeDef = (): TicketTypeDef => ({ id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_basic', fields: [] });
const reads = {
  getBoard: async () => ({ projectId: 'p_1', groups: [] }),
  getMembers: async () => MEMBERS,
  getTicketTypes: async () => [typeDef()],
  getTickets: async (): Promise<TicketListView> => ({ projectId: 'p_1', rows: [listRow()] }),
  getWorkflowDef: async () => null,
};
/** The header's trigger: the first Create ticket button in document order (an empty board column renders its own below it). */
const headerCreate = (): HTMLElement => screen.getAllByRole('button', { name: 'Create ticket' })[0]!;
const NEVER = () => new Promise<never>(() => {});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}
const services = (overrides: Parameters<typeof stubServices>[0] = {}) => stubServices({ ...reads, ...overrides });
const mount = (overrides: Parameters<typeof stubServices>[0] = {}) =>
  render(
    <Providers services={services(overrides)}>
      <ProjectPage />
    </Providers>,
  );
const ROW = (overrides: Partial<WorkspaceRef> = {}): WorkspaceRef => ({
  id: 'ws_1',
  name: 'Corner Shop',
  prefix: 'CS',
  role: 'owner',
  archived: false,
  memberCount: 1,
  nameRestrictedProjectCount: 0,
  projects: [{ id: 'p_1', name: 'Stockroom', archived: false, prefix: 'SR', ticketCount: 0, blockedCount: 0 }],
  ...overrides,
});

beforeEach(() => {
  window.localStorage.clear();
  clearReadCaches();
  suspendSearchParams = false;
  transitions.start = 0;
  transitions.hook = 0;
  mockSession = { data: { user: { id: 'u_kiro', name: 'Kiro' } }, isPending: false };
});
afterEach(() => {
  cleanup();
  push.mockClear();
});

/** Every `aria-selected` flip the tab rail made, as (tab text, value it LEFT) pairs: a tab that was ever selected shows up. */
function recordSelections() {
  const left: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes' && r.attributeName === 'aria-selected' && r.oldValue === 'true') left.push(r.target.textContent ?? '');
    }
  });
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-selected'], attributeOldValue: true });
  return { left, stop: () => { observer.takeRecords(); observer.disconnect(); } , flush: () => { const rest = observer.takeRecords(); for (const r of rest) if (r.oldValue === 'true') left.push(r.target.textContent ?? ''); } };
}

describe('the remembered tab is the first thing rendered (spec D9; audit SM-02)', () => {
  it('25.072 the remembered List tab is selected in the FIRST commit — the Board tab is never selected, session pending or not', async () => {
    rememberLastUserId('u_kiro');
    rememberProjectTab('p_1', 'list', 'u_kiro');
    // The session has NOT answered: only the remembered user id can pick the key.
    mockSession = { data: null, isPending: true };
    const seen = recordSelections();
    const view = mount();
    await screen.findByRole('tab', { name: 'List', selected: true });
    mockSession = { data: { user: { id: 'u_kiro', name: 'Kiro' } }, isPending: false };
    view.rerender(
      <Providers services={services()}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByRole('tab', { name: 'List', selected: true });
    seen.flush();
    seen.stop();
    expect(seen.left.filter((text) => text === 'Board')).toHaveLength(0);
    // Control: with no remembered tab the first selected tab is Board.
    cleanup();
    window.localStorage.clear();
    mount();
    await screen.findByRole('tab', { name: 'Board', selected: true });
  });

  it("25.083 a session that turns out to be someone else resolves to THEIR tab (or the default), never the remembered person's", async () => {
    rememberLastUserId('u_old');
    rememberProjectTab('p_1', 'calendar', 'u_old');
    mockSession = { data: null, isPending: true };
    const view = mount();
    await screen.findByRole('tab', { name: 'Calendar', selected: true });
    mockSession = { data: { user: { id: 'u_new', name: 'Newcomer' } }, isPending: false };
    view.rerender(
      <Providers services={services()}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByRole('tab', { name: 'Board', selected: true });
    expect(readProjectTab('p_1', 'u_old')).toBe('calendar'); // the old person's memory is untouched
    // Control: a tab the person CHOSE while the session was pending outranks the memory (13.880).
    cleanup();
    mockSession = { data: null, isPending: true };
    const second = mount();
    await userEvent.click(await screen.findByRole('tab', { name: 'Timeline' }));
    mockSession = { data: { user: { id: 'u_old', name: 'Old' } }, isPending: false };
    second.rerender(
      <Providers services={services()}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByRole('tab', { name: 'Timeline', selected: true });
  });

  it('25.086 the Suspense fallback paints the remembered tab on the client but the SERVER snapshot is the board (no hydration mismatch)', () => {
    rememberLastUserId('u_kiro');
    rememberProjectTab('p_1', 'list', 'u_kiro');
    suspendSearchParams = true;
    const { container } = render(
      <Providers services={services()}>
        <ProjectPage />
      </Providers>,
    );
    // Client render: the list shape (a real table), not the board's columns.
    expect(container.querySelectorAll('.gn-list__table-wrap')).toHaveLength(1);
    expect(container.querySelectorAll('.gn-board__column')).toHaveLength(0);
    // Server render of the same tree: storage is not readable there, so the HTML is the board skeleton the hydrating client
    // compares against; the remembered tab arrives on the client's first re-render, never as a different first paint.
    const serverHtml = renderToString(
      <Providers services={services()}>
        <ProjectPage />
      </Providers>,
    );
    expect(serverHtml).toContain('gn-board__column');
    expect(serverHtml).not.toContain('gn-list__table-wrap');
  });
});

describe('the arms are structural skeletons, never a sentence (S-R1; audit SM-02, SM-09)', () => {
  it("25.075 the board arm is the board's own rail, column and card; the list arm is the list's own table wrap; neither names a stand-in shape or the well", async () => {
    mount({ getBoard: NEVER, getTickets: NEVER });
    const board = await screen.findByTestId('project-tab-skeleton');
    expect(board.querySelectorAll('section.gn-board__column .gn-board__cards > li > .gn-card.gn-board-card').length).toBeGreaterThan(0);
    expect(board.querySelectorAll('.gn-skeleton--card')).toHaveLength(0);
    for (const el of board.querySelectorAll<HTMLElement>('*')) {
      expect(`${el.className} ${el.getAttribute('style') ?? ''}`, 'no part names the well or the track').not.toMatch(/well|track|sunken/);
    }
    // Control: the list tab's arm is a different, real container.
    await userEvent.click(screen.getByRole('tab', { name: 'List' }));
    const list = await screen.findByTestId('project-tab-skeleton');
    expect(list.querySelectorAll('.gn-list .gn-list__table-wrap table.gn-table.gn-list__table tbody tr.gn-list__table-row').length).toBeGreaterThan(0);
    expect(list.querySelectorAll('.gn-board__column')).toHaveLength(0);
    for (const el of list.querySelectorAll<HTMLElement>('*')) {
      expect(`${el.className} ${el.getAttribute('style') ?? ''}`).not.toMatch(/well|track|sunken/);
    }
  });

  it('25.076 each of the five tabs, with its read open, draws a named busy region and no Loading… sentence', async () => {
    mount({ getBoard: NEVER, getTickets: NEVER });
    for (const tab of ['Backlog', 'Board', 'List', 'Calendar', 'Timeline'] as const) {
      await userEvent.click(await screen.findByRole('tab', { name: tab }));
      const region = await screen.findByTestId('project-tab-skeleton');
      expect(region.closest('[aria-busy="true"]'), tab).not.toBeNull();
      expect(screen.getByText(`Loading the ${tab.toLowerCase()}`), tab).toBeInTheDocument();
      expect(screen.queryByText('Loading…')).toBeNull();
    }
  });

  it('25.073 a filter toggle keeps the rows on screen: no skeleton, no sentence; the List arm shows the table skeleton only while no walk has answered', async () => {
    const open = deferred<TicketListView>();
    let calls = 0;
    const getTickets = vi.fn(() => {
      calls += 1;
      return calls === 1 ? Promise.resolve({ projectId: 'p_1', rows: [listRow()] }) : open.promise;
    });
    mount({ getTickets });
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    await screen.findByText(listRow().title);
    await userEvent.click(screen.getByRole('checkbox', { name: /Only tickets in progress/ }));
    await waitFor(() => expect(getTickets.mock.calls.length).toBeGreaterThan(1)); // the new key asked
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(document.querySelector('[data-testid="project-tab-skeleton"]')).toBeNull();
    expect(screen.getByText(listRow().title)).toBeInTheDocument();
    act(() => open.resolve({ projectId: 'p_1', rows: [] }));
    // Control: before any walk answered, the same arm IS the skeleton.
    cleanup();
    clearReadCaches();
    window.localStorage.clear();
    mount({ getTickets: NEVER });
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    expect(await screen.findByTestId('project-tab-skeleton')).toBeInTheDocument();
  });

  it('25.077 a tab switch and the filter toggle each run in a transition; the click still selects the tab', async () => {
    mount();
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    await screen.findByRole('tab', { name: 'List', selected: true });
    expect(transitions.start).toBeGreaterThan(0);
    const before = transitions.hook;
    await userEvent.click(screen.getByRole('checkbox', { name: /Only tickets in progress/ }));
    expect(transitions.hook).toBeGreaterThan(before);
    expect(screen.getByRole('checkbox', { name: /Only tickets in progress/ })).toBeChecked();
    // Control: the remembered tab was still written by the click (the write is not deferred with the render).
    expect(readProjectTab('p_1', 'u_kiro')).toBe('list');
  });
});

describe('the Create ticket control is the same box while it waits (S1; audit SM-02)', () => {
  it('25.074 while the list walk is open, Create ticket is a busy BUTTON of the real trigger (primary, plus icon), never a sentence', async () => {
    const open = deferred<TicketListView>();
    mount({ getTickets: () => open.promise });
    const button = await waitFor(() => headerCreate());
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    expect(button).toHaveClass('gn-button', 'gn-button--primary');
    expect(button.querySelector('svg'), 'the icon is part of the box').not.toBeNull();
    expect(screen.queryByText('Preparing the Create ticket form…')).toBeNull();
    act(() => open.resolve({ projectId: 'p_1', rows: [] }));
    await waitFor(() => expect(headerCreate()).toBeEnabled());
    // Control: once answered it is the same element class with no busy flag.
    const ready = headerCreate();
    expect(ready).not.toHaveAttribute('aria-busy');
    expect(ready.className).toBe(button.className);
  });

  it('25.082 a signed-out viewer still gets the sentence, not a busy button; a pending session gets the busy button', async () => {
    mockSession = { data: null, isPending: false };
    mount();
    expect(await screen.findByText('Sign in to create a ticket.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create ticket' })).toBeNull();
    cleanup();
    mockSession = { data: null, isPending: true };
    mount();
    expect(await waitFor(() => headerCreate())).toHaveAttribute('aria-busy', 'true');
  });
});

describe('the page reads are cached under their own keys (spec S4, D1; audit SM-01)', () => {
  it('25.078 after the page answers, the board, members, types and both workflow-def reads sit in the read cache under their keys', async () => {
    // One row in the backlog state, so the backlog's workflow ids are non-empty and its key is `wf:backlog:wf_basic`, not `wf:backlog:`.
    mount({
      getTickets: async (): Promise<TicketListView> => ({
        projectId: 'p_1',
        rows: [listRow(), listRow({ ticketId: 't_2', key: 'CCSO-8', stateId: BACKLOG_STATE_ID, stateName: 'Backlog', stateCategory: 'open' })],
      }),
    });
    await waitFor(() => expect(headerCreate()).toBeEnabled());
    const has = (key: string) => recallLiveQuery(liveQueryStoreKey('ws_1', key)) !== undefined;
    expect(has('board:p_1')).toBe(true);
    expect(has('members:ws_1')).toBe(true);
    expect(has('types:ws_1')).toBe(true);
    expect(has('wf:types:wf_basic')).toBe(true);
    await waitFor(() => expect(has('wf:backlog:wf_basic')).toBe(true));
    // Control: another project's / workspace's key is empty.
    expect(has('board:p_other')).toBe(false);
    expect(recallLiveQuery(liveQueryStoreKey('ws_other', 'board:p_1'))).toBeUndefined();
  });
});

describe('the header names reserve their place (S1, S-R1; audit SM-02)', () => {
  it('25.084 while the workspaces read is open the breadcrumb and the title are skeleton parts in their real containers; a refusal omits them', async () => {
    const open = deferred<WorkspaceRef[]>();
    mount({ getMyWorkspaces: () => open.promise });
    const identity = await waitFor(() => {
      const el = document.querySelector('.gn-project__identity');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(identity.querySelectorAll('.gn-skeleton').length).toBe(2);
    expect(within(identity).queryByRole('heading')).toBeNull();
    act(() => open.resolve([ROW()]));
    expect(await within(identity).findByRole('heading', { name: 'Stockroom' })).toBeInTheDocument();
    expect(identity.querySelectorAll('.gn-skeleton')).toHaveLength(0);
    expect(within(identity).getByText('Corner Shop')).toHaveClass('gn-project__breadcrumb');
    // Control: a REFUSED read is not a wait — nothing pulses for ever.
    cleanup();
    clearReadCaches();
    mount({ getMyWorkspaces: () => Promise.reject(new Error('refused')) });
    await waitFor(() => expect(document.querySelector('.gn-project__identity')).not.toBeNull());
    await waitFor(() => expect(document.querySelectorAll('.gn-project__identity .gn-skeleton')).toHaveLength(0));
    // Control: a SIGNED-OUT viewer never reads the workspaces, so nothing waits on them — no placeholder at first sight, and none after
    // the page has settled (a guard-less `namesPending` would pulse for ever: their read is `{rows: null, error: null}`).
    cleanup();
    clearReadCaches();
    mockSession = { data: null, isPending: false };
    mount();
    const signedOut = await waitFor(() => {
      const el = document.querySelector('.gn-project__identity');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(signedOut.querySelectorAll('.gn-skeleton')).toHaveLength(0);
    expect(await screen.findByText('Sign in to create a ticket.')).toBeInTheDocument();
    expect(signedOut.querySelectorAll('.gn-skeleton')).toHaveLength(0);
  });

  it('25.085 ProjectTitle rides the shared workspaces read: one getMyWorkspaces call for the page, and a remount within 30 s makes no second', async () => {
    const getMyWorkspaces = vi.fn(async () => [ROW()]);
    // ONE service object across both mounts, as the app has one data source for its life: the shared read is keyed by it.
    const shared = services({ getMyWorkspaces });
    const page = () => (
      <Providers services={shared}>
        <ProjectPage />
      </Providers>
    );
    const first = render(page());
    expect(await screen.findByRole('heading', { name: 'Stockroom' })).toBeInTheDocument();
    expect(getMyWorkspaces).toHaveBeenCalledTimes(1); // nav, name hooks and ProjectTitle share ONE read
    first.unmount();
    render(page());
    // Served from memory on the first frame, with no new request.
    expect(screen.getByRole('heading', { name: 'Stockroom' })).toBeInTheDocument();
    expect(getMyWorkspaces).toHaveBeenCalledTimes(1);
    // Control: the hook itself is what is shared — a bare consumer sees the same rows.
    const bare = renderHook(() => useMyWorkspaces(), {
      wrapper: ({ children }) => <Providers services={shared}>{children}</Providers>,
    });
    expect(bare.result.current.rows?.[0]?.name).toBe('Corner Shop');
    expect(getMyWorkspaces).toHaveBeenCalledTimes(1);
  });
});
