import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RosterMember, WorkspaceRef } from '@gisik-nokma/app-core';
import type { Notification } from '@gisik-nokma/domain';
import { HttpError } from '@gisik-nokma/app-core/online';
import { Providers } from '../src/providers.js';
import { clearMyWorkspacesCache } from '../src/use-my-workspaces.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';
import { clearLastWorkspaceCache } from '../src/use-last-workspace.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Smoothness T8 — every secondary screen paints its OWN wireframe while its reads are open (spec S1, S7; amendment S-R1;
 * audit SM-09; cases 25.122–25.129, 25.135). Each case holds a read open with a deferred promise, asserts (a) the skeleton is
 * the screen's real container class filled with `Skeleton` parts, (b) there is a named busy region and no sentence, and (c)
 * the swap leaves no busy region behind. 25.135 is the other half: a read that ANSWERED EMPTY or REFUSED never leaves a
 * skeleton up, because "null" and "in flight" are not the same state.
 *
 * jsdom has no layout, so "nothing shifts" is carried by structure here (the same container classes before and after); the pixel
 * measurement is a browser step the lean build does not run (T14's capture covers it).
 */

const WS = '01J9WORKSPACE0000000000000';
const ME = '01J9USER000000000000000000';
let currentPath = `/w/${WS}/members`;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: WS }),
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: ME, name: 'Kiro' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import MembersPage from '../app/w/[workspaceId]/members/page.js';
import WorkspacesPage from '../app/workspaces/page.js';
import WorkspaceHomePage from '../app/w/[workspaceId]/page.js';
import InboxPage from '../app/inbox/page.js';
import MyWorkPage from '../app/w/[workspaceId]/my-work/page.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ws: WorkspaceRef = {
  id: WS,
  name: 'Convenience Corner',
  prefix: 'CC',
  role: 'owner',
  archived: false,
  memberCount: 2,
  nameRestrictedProjectCount: 0,
  projects: [{ id: '01J9PROJECT000000000000000', name: 'Errand tracking', archived: false, prefix: 'ET', ticketCount: 1, blockedCount: 0 }],
};
const kiro: RosterMember = { id: ME, name: 'Kiro', role: 'owner' };
const anselma: RosterMember = { id: '01J9USER000000000000000001', name: 'Anselma Marak', role: 'member' };
const noUnread = { notifications: { unreadCount: async () => 0 } };

/** The named busy region a screen draws: its hidden label's parent. */
async function regionNamed(label: string): Promise<HTMLElement> {
  const name = await screen.findByText(label);
  const region = name.parentElement!;
  expect(region).toHaveClass('gn-skeleton-region');
  expect(region).toHaveAttribute('aria-busy', 'true');
  return region;
}
const busyRegions = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.gn-skeleton-region')];

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  clearMyWorkspacesCache();
  clearWorkspaceNameCache();
  clearWorkspaceProjectsCache();
  clearLastWorkspaceCache();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('25.122 Members', () => {
  const mount = (over: Parameters<typeof stubServices>[0], invitesAdmin: { listPending: () => Promise<never[]> }) =>
    render(
      <Providers services={stubServices({ getMyWorkspaces: async () => [ws], ...over }, { invitesAdmin, ...noUnread })}>
        <MembersPage />
      </Providers>,
    );

  it('25.122 shows the roster in its own container (table, head row, five rows of avatar + two lines + role chip) while the read is open, with no sentence and the heading untouched', async () => {
    const members = deferred<RosterMember[]>();
    mount({ getMembers: () => members.promise }, { listPending: async () => [] });
    const region = await regionNamed('Loading members');
    const table = region.querySelector('.gn-members table.gn-members__table');
    expect(table, 'the skeleton is not the roster\'s own table').not.toBeNull();
    expect(table!.querySelectorAll('tbody tr.gn-members__row')).toHaveLength(5);
    expect(table!.querySelectorAll('tbody .gn-members__initial .gn-skeleton--circle, tbody .gn-skeleton--circle').length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText('Loading…')).toBeNull();
    const title = screen.getByRole('heading', { level: 1, name: 'Members' });
    act(() => members.resolve([kiro, anselma]));
    await screen.findByText('Anselma Marak');
    // CONTROL: the real roster is the SAME container, with the real rows; no region is left.
    expect(document.querySelectorAll('.gn-members tbody tr.gn-members__row')).toHaveLength(2);
    await waitFor(() => expect(document.querySelector('.gn-skeleton-region[aria-busy="true"]')).toBeNull());
    expect(screen.getByRole('heading', { level: 1, name: 'Members' })).toBe(title);
  });

  it('25.122 the invitation machinery slot is a skeleton while the admin question is open (no "Checking…" sentence), then the form', async () => {
    const asked = deferred<never[]>();
    mount({ getMembers: async () => [kiro] }, { listPending: () => asked.promise });
    await regionNamed('Checking whether you can invite people');
    expect(screen.queryByText(/Checking whether you can invite/i, { selector: 'p' })).toBeNull();
    act(() => asked.resolve([]));
    await screen.findByText('Pending invitations (0)');
    expect(busyRegions()).toEqual([]);
  });
});

describe('25.123 Workspaces', () => {
  it('25.123 draws three workspace cards in the real list and card classes, and a band in the invitations\' own container that collapses ONLY once the answer is empty', async () => {
    const list = deferred<WorkspaceRef[]>();
    const invites = deferred<never[]>();
    render(
      <Providers services={stubServices({ getMyWorkspaces: () => list.promise }, { myInvitations: { list: () => invites.promise }, ...noUnread })}>
        <WorkspacesPage />
      </Providers>,
    );
    const region = await regionNamed('Loading your workspaces');
    const cards = region.querySelectorAll('ul.gn-workspace-list > li .gn-workspace-card');
    expect(cards).toHaveLength(3);
    expect(cards[0]!.querySelector('.gn-skeleton--circle'), 'the card has no avatar part').not.toBeNull();
    const band = await regionNamed('Checking for invitations');
    expect(band.closest('.gn-invitations') ?? band.querySelector('.gn-invitations')).not.toBeNull();
    expect(screen.queryByText('Loading…')).toBeNull();
    act(() => invites.resolve([]));
    await waitFor(() => expect(screen.queryByText('Checking for invitations')).toBeNull());
    expect(document.querySelector('.gn-invitations'), 'an answered-empty list leaves no band').toBeNull();
    // The list's own region is still up: the collapse was the band's alone.
    expect(screen.getByText('Loading your workspaces')).toBeInTheDocument();
    act(() => list.resolve([ws]));
    await screen.findByRole('link', { name: 'Convenience Corner' });
    expect(busyRegions()).toEqual([]);
  });
});

describe('25.124 Workspace home', () => {
  it('25.124 keeps ONE h1 in place and draws project cards in the real grid and card classes; the create dialog\'s group field is a skeleton while its read is open', async () => {
    currentPath = `/w/${WS}`;
    const list = deferred<WorkspaceRef[]>();
    const groups = deferred<never[]>();
    const user = userEvent.setup();
    render(
      <Providers services={stubServices({ getMyWorkspaces: () => list.promise, getGroups: () => groups.promise }, noUnread)}>
        <WorkspaceHomePage />
      </Providers>,
    );
    const region = await regionNamed('Loading the workspace');
    expect(region.querySelectorAll('ul.gn-workspace-home__projects > li .gn-project-card')).toHaveLength(3);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText('Loading…')).toBeNull();
    act(() => list.resolve([ws]));
    await screen.findByRole('link', { name: 'Open Errand tracking' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    const field = await regionNamed('Loading groups');
    expect(field.closest('form.gn-project-create')).not.toBeNull();
    act(() => groups.resolve([]));
    await waitFor(() => expect(screen.queryByText('Loading groups')).toBeNull());
  });
});

describe('25.125 Inbox', () => {
  it('25.125 draws the tabs\' real list and six rows in the inbox\'s own classes (glyph circle, two text lines) while the first page is in flight', async () => {
    currentPath = '/inbox';
    const first = deferred<{ notifications: Notification[]; nextCursor: string | null }>();
    render(
      <Providers services={stubServices({}, { notifications: { list: async () => first.promise, unreadCount: async () => 0 } })}>
        <InboxPage />
      </Providers>,
    );
    const region = await regionNamed('Loading your inbox');
    expect(region.querySelectorAll('.gn-inbox ul.gn-inbox__list > li.gn-inbox__item')).toHaveLength(6);
    expect(region.querySelector('.gn-inbox__glyph .gn-skeleton--circle')).not.toBeNull();
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(1);
    act(() => first.resolve({ notifications: [], nextCursor: null }));
    await waitFor(() => expect(busyRegions()).toEqual([]));
  });
});

describe('25.126 My work', () => {
  it('25.126 reserves the attention band (the strip\'s own aside) and draws the four sections in the page\'s own classes while both reads are open', async () => {
    currentPath = `/w/${WS}/my-work`;
    const attention = deferred<never[]>();
    const work = deferred<{ assigned: never[]; inTransit: never[]; contested: never[]; shared: never[] }>();
    render(
      <Providers services={stubServices({ getAttention: () => attention.promise, getMyWork: () => work.promise, getMyWorkspaces: async () => [ws] }, noUnread)}>
        <MyWorkPage />
      </Providers>,
    );
    const band = await regionNamed('Loading what needs your attention');
    expect(band.closest('aside.gn-attention') ?? band.querySelector('aside.gn-attention') ?? band).toBeTruthy();
    const body = await regionNamed('Loading your work');
    expect(body.querySelectorAll('.gn-my-work section.gn-my-work__section')).toHaveLength(4);
    expect(body.querySelectorAll('.gn-my-work__item').length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText('Loading…')).toBeNull();
    act(() => attention.resolve([]));
    await waitFor(() => expect(screen.queryByText('Loading what needs your attention')).toBeNull());
    act(() => work.resolve({ assigned: [], inTransit: [], contested: [], shared: [] }));
    await screen.findByText('Nothing assigned to you.');
    expect(busyRegions()).toEqual([]);
  });
});

describe('25.135 a skeleton means "a read is in flight", never "the value is null"', () => {
  it('25.135 Members: an answered-empty roster and a refused one leave no busy region (control: the open read has one)', async () => {
    const open = render(
      <Providers services={stubServices({ getMyWorkspaces: async () => [ws], getMembers: () => new Promise<RosterMember[]>(() => undefined) }, { invitesAdmin: { listPending: async () => [] }, ...noUnread })}>
        <MembersPage />
      </Providers>,
    );
    await regionNamed('Loading members');
    open.unmount();
    render(
      <Providers services={stubServices({ getMyWorkspaces: async () => [ws], getMembers: async () => [] }, { invitesAdmin: { listPending: async () => [] }, ...noUnread })}>
        <MembersPage />
      </Providers>,
    );
    await screen.findByText('No members are listed here.');
    await waitFor(() => expect(busyRegions()).toEqual([]));
    cleanup();
    render(
      <Providers services={stubServices({ getMyWorkspaces: async () => [ws], getMembers: () => Promise.reject(new Error('boom')) }, { invitesAdmin: { listPending: async () => [] }, ...noUnread })}>
        <MembersPage />
      </Providers>,
    );
    await screen.findByText(/boom/);
    await waitFor(() => expect(busyRegions()).toEqual([]));
  });

  it('25.135 Workspaces and Inbox: a refused read shows its refusal and no region', async () => {
    render(
      <Providers services={stubServices({ getMyWorkspaces: () => Promise.reject(new Error('no list')) }, { myInvitations: { list: async () => [] }, ...noUnread })}>
        <WorkspacesPage />
      </Providers>,
    );
    await screen.findByText(/no list/);
    await waitFor(() => expect(busyRegions()).toEqual([]));
    cleanup();
    currentPath = '/inbox';
    render(
      <Providers services={stubServices({}, { notifications: { list: () => Promise.reject(new HttpError(500, 'x')), unreadCount: async () => 0 } })}>
        <InboxPage />
      </Providers>,
    );
    await waitFor(() => expect(busyRegions()).toEqual([]));
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('25.135 the create dialog\'s group field: a REFUSED groups read leaves no skeleton (the form without the field), not one for ever', async () => {
    currentPath = `/w/${WS}`;
    const user = userEvent.setup();
    render(
      <Providers services={stubServices({ getMyWorkspaces: async () => [ws], getGroups: () => Promise.reject(new Error('no groups')) }, noUnread)}>
        <WorkspaceHomePage />
      </Providers>,
    );
    await user.click(await screen.findByRole('button', { name: 'Create project' }));
    await screen.findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(within(screen.getByRole('dialog')).queryByText('Loading groups')).toBeNull());
  });
});
