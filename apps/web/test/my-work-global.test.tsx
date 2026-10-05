import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttentionShow, MyWorkPreferences, TicketState, WorkflowDef } from '@gisik-nokma/domain';
import type { AttentionItem, MyWorkView, TicketRead, WorkItem, WorkspaceRef } from '@gisik-nokma/app-core';
import { createClientStateCache } from '@gisik-nokma/app-core';
import { Providers, type AppServices } from '../src/providers.js';
import { clearMyWorkspacesCache } from '../src/use-my-workspaces.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * The GLOBAL My work page, `/my-work` (my-work-global T4, cases 30.036–30.046 and 30.050).
 *
 * One page across every workspace the viewer belongs to: the attention strip and My work are
 * fanned out per workspace (T3's `useGlobalMyWork`), narrowed by the "Show" chips, arranged by
 * the "Group" pair, and both choices are the user's own document (`getMyWorkPreferences` /
 * `putMyWorkPreferences`). The open ticket is `?ticket=<id>&ws=<workspaceId>`: the sheet needs a
 * workspace, and on a global page only the URL can say which.
 *
 * ⚠ The search params are MUTABLE and `push` does not feed back into them, the same rule as
 * `my-work-sheet-in-place.test.tsx`: an arm that needs the sheet on screen sets the params and
 * renders; an arm about a click reads the router mock.
 */

const W1 = '01J9WSALPHA000000000000000';
const W2 = '01J9WSBETA0000000000000000';
const W_ARCHIVED = '01J9WSOLD00000000000000000';
const P_MANGO = '01J9PMANGO0000000000000000';
const P_BANANA = '01J9PBANANA000000000000000';
const P_ZINC = '01J9PZINC00000000000000000';

const T_OVERDUE = '01J9TOVERDUE00000000000000';
const T_BLOCKED = '01J9TBLOCKED00000000000000';
const T_A1 = '01J9TASSIGNEDONE0000000000';
const T_A2 = '01J9TASSIGNEDTWO0000000000';

const ME = '01J9USER000000000000000000';

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/my-work',
  useSearchParams: () => searchParams,
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: ME, name: 'Anselma Marak' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import GlobalMyWorkPage from '../app/my-work/page.js';

const CLAIM = {
  actorId: ME,
  actorName: 'Anselma Marak',
  clientTime: '2026-10-05T07:00:00.000Z',
  serverTime: '2026-10-05T07:00:01.000Z',
  cause: null,
};

const WF: WorkflowDef = {
  id: 'wf-errand',
  version: 1,
  name: 'Errand',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'todo', to: 'done', rules: [] }],
};

function project(id: string, name: string) {
  return { id, name, prefix: 'PR', archived: false, ticketCount: 1, blockedCount: 0 };
}

function workspaceRef(id: string, name: string, over: Partial<WorkspaceRef> = {}): WorkspaceRef {
  return {
    id,
    name,
    prefix: 'WS',
    role: 'member',
    archived: false,
    memberCount: 2,
    nameRestrictedProjectCount: 0,
    projects: [],
    ...over,
  };
}

/** "Alpha Works" (a member) and "beta Freight" (an admin): two cases of name, two roles. */
const ALPHA = workspaceRef(W1, 'Alpha Works', { projects: [project(P_MANGO, 'Mango'), project(P_BANANA, 'Banana')] });
const BETA = workspaceRef(W2, 'beta Freight', { role: 'admin', projects: [project(P_ZINC, 'Zinc')] });

function attention(ticketId: string, title: string, kind: AttentionItem['kind'], workspaceId: string, projectId: string): AttentionItem {
  return { kind, ticketId, title, workspaceId, projectId, reason: `${kind} for a while`, claim: null };
}

function work(ticketId: string, title: string, workspaceId: string, projectId: string, projectName: string): WorkItem {
  return {
    ticketId,
    title,
    workspaceId,
    projectId,
    projectName,
    stateId: 'todo',
    stateName: 'To do',
    stateCategory: 'open',
    stateProvenance: CLAIM,
    dueDate: null,
  };
}

const EMPTY: MyWorkView = { assigned: [], inTransit: [], contested: [], shared: [] };

const ATTENTION: Record<string, AttentionItem[]> = {
  [W1]: [attention(T_OVERDUE, 'Renew the lease', 'overdue', W1, P_MANGO)],
  [W2]: [attention(T_BLOCKED, 'Chase the delivery', 'blocked', W2, P_ZINC)],
};
const MY_WORK: Record<string, MyWorkView> = {
  [W1]: { ...EMPTY, assigned: [work(T_A1, 'File the return', W1, P_BANANA, 'Banana')] },
  [W2]: { ...EMPTY, assigned: [work(T_A2, 'Count the stock', W2, P_ZINC, 'Zinc')] },
};

function ticketRead(id: string, title: string, workspaceId: string, projectId: string): TicketRead {
  const ticket: TicketState = {
    kind: 'ticket',
    id,
    workspaceId,
    projectId,
    typeId: 'task',
    parentId: null,
    workflowId: WF.id,
    workflowVersion: WF.version,
    stateId: 'todo',
    stateCategory: 'open',
    assigneeId: null,
    collaboratorIds: [],
    fields: { title: { value: title, actorId: ME, clientTime: CLAIM.clientTime, serverTime: CLAIM.serverTime } },
    transitions: [],
    closed: null,
    rank: null,
    reopenedAt: null,
    deleted: null,
  };
  return {
    ticket,
    title,
    stateProvenance: CLAIM,
    assignedProvenance: null,
    visibility: null,
    parent: null,
    rollup: null,
    key: null,
    epic: null,
  };
}

/** What the page asked, in order — the instrument for "re-queried" and "persisted". */
type Calls = {
  attention: Array<[string, readonly AttentionShow[] | undefined]>;
  myWork: string[];
  puts: MyWorkPreferences[];
  prefsGets: number;
  getTicket: Array<[string, string]>;
};

type Store = { doc: MyWorkPreferences | null; fail: Error | null };

function mount(
  opts: {
    workspaces?: WorkspaceRef[];
    attention?: Record<string, AttentionItem[] | Error>;
    myWork?: Record<string, MyWorkView>;
    store?: Store;
  } = {},
): { services: AppServices; calls: Calls; store: Store } {
  const calls: Calls = { attention: [], myWork: [], puts: [], prefsGets: 0, getTicket: [] };
  const store: Store = opts.store ?? { doc: null, fail: null };
  const workspaces = opts.workspaces ?? [ALPHA, BETA];
  const titles: Record<string, [string, string, string]> = {
    [T_A1]: ['File the return', W1, P_BANANA],
    [T_A2]: ['Count the stock', W2, P_ZINC],
    [T_OVERDUE]: ['Renew the lease', W1, P_MANGO],
    [T_BLOCKED]: ['Chase the delivery', W2, P_ZINC],
  };
  const services = stubServices({
    getMyWorkspaces: async () => workspaces,
    getAttention: async (workspaceId, show) => {
      calls.attention.push([workspaceId, show]);
      const answer = (opts.attention ?? ATTENTION)[workspaceId] ?? [];
      if (answer instanceof Error) throw answer;
      return answer;
    },
    getMyWork: async (workspaceId) => {
      calls.myWork.push(workspaceId);
      return (opts.myWork ?? MY_WORK)[workspaceId] ?? EMPTY;
    },
    getMyWorkPreferences: async () => {
      calls.prefsGets += 1;
      if (store.fail !== null) throw store.fail;
      return store.doc ?? { show: ['created', 'assigned'], grouping: 'workspace-project' };
    },
    putMyWorkPreferences: async (doc) => {
      calls.puts.push(doc);
      store.doc = doc;
      return doc;
    },
    getTicket: async (workspaceId, ticketId) => {
      calls.getTicket.push([workspaceId, ticketId]);
      const [title, ws, projectId] = titles[ticketId] ?? ['Unknown', workspaceId, P_MANGO];
      return ticketRead(ticketId, title, ws, projectId);
    },
    getTicketAttachments: async () => [],
    getWorkflowDef: async () => WF,
    getTicketHistory: async () => [],
    getTicketComments: async () => [],
    getMembers: async () => [{ id: ME, name: 'Anselma Marak', role: 'owner' }],
    getTickets: async () => ({ projectId: P_MANGO, rows: [] }),
  });
  services.cache = createClientStateCache();
  return { services, calls, store };
}

function renderPage(services: AppServices) {
  return render(
    <Providers services={services}>
      <GlobalMyWorkPage />
    </Providers>,
  );
}

/** The page's outline in document order: headings and row titles, under the shell's main column. */
function outline(): string[] {
  const main = document.querySelector('.gn-shell__main');
  if (main === null) return [];
  return Array.from(main.querySelectorAll('h2, h3, h4, .gn-attention__title, .gn-my-work__title')).map(
    (node) => `${node.tagName === 'BUTTON' ? '·' : node.tagName.toLowerCase()} ${node.textContent ?? ''}`,
  );
}

function showGroup(): HTMLElement {
  return screen.getByRole('group', { name: 'Show' });
}

function chip(name: string): HTMLElement {
  return within(showGroup()).getByRole('button', { name });
}

const pressed = (): string[] =>
  within(showGroup())
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.textContent ?? '');

beforeEach(() => {
  push.mockClear();
  searchParams = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  clearMyWorkspacesCache();
  clearWorkspaceNameCache();
});

describe('30.036 the global page, grouped by default', () => {
  it('30.036 renders "My work" with BOTH sections across two workspaces: workspace headings, then project headings', async () => {
    const { services } = mount();
    renderPage(services);
    expect(screen.getByRole('heading', { level: 1, name: 'My work' })).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Count the stock' });
    await screen.findByRole('button', { name: 'Chase the delivery' });
    expect(outline()).toEqual([
      // The strip: workspaces by name, case-insensitive ("Alpha" before "beta"), then projects.
      'h2 Alpha Works',
      'h3 Mango',
      '· Renew the lease',
      'h2 beta Freight',
      'h3 Zinc',
      '· Chase the delivery',
      // My work: the same tree inside each section.
      'h2 Assigned to me',
      'h3 Alpha Works',
      'h4 Banana',
      '· File the return',
      'h3 beta Freight',
      'h4 Zinc',
      '· Count the stock',
      'h2 My claims in transit',
      'h2 My contested claims',
      'h2 Shared with me',
    ]);
    expect(within(screen.getByRole('radiogroup', { name: 'Group' })).getByRole('radio', { name: 'By workspace and project' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});

describe('30.037 Flat', () => {
  it('30.037 Flat drops every workspace and project heading, and each row and card names its workspace › project', async () => {
    const { services } = mount();
    renderPage(services);
    await screen.findByRole('button', { name: 'Count the stock' });
    await userEvent.click(screen.getByRole('radio', { name: 'Flat' }));
    await waitFor(() => expect(outline()).not.toContain('h2 Alpha Works'));
    expect(outline()).toEqual([
      '· Renew the lease',
      '· Chase the delivery',
      'h2 Assigned to me',
      '· File the return',
      '· Count the stock',
      'h2 My claims in transit',
      'h2 My contested claims',
      'h2 Shared with me',
    ]);
    const placeOf = (title: string): string[] => {
      const row = screen.getByRole('button', { name: title }).closest('.gn-attention__item, .gn-my-work__item');
      const place = row?.querySelector('.gn-attention__place, .gn-my-work__place');
      expect(place).not.toBeNull();
      const separator = place?.querySelector('[aria-hidden="true"]');
      expect(separator?.textContent).toBe('›');
      return Array.from(place?.children ?? [])
        .filter((child) => child !== separator)
        .map((child) => child.textContent ?? '');
    };
    expect(placeOf('Renew the lease')).toEqual(['Alpha Works', 'Mango']);
    expect(placeOf('Chase the delivery')).toEqual(['beta Freight', 'Zinc']);
    expect(placeOf('File the return')).toEqual(['Alpha Works', 'Banana']);
    expect(placeOf('Count the stock')).toEqual(['beta Freight', 'Zinc']);
    expect(document.querySelector('.gn-shell__main')?.textContent ?? '').not.toMatch(/ · /);
  });
});

describe('30.038 the choices are the user\'s own document', () => {
  it('30.038 a chip press PUTs the whole document and re-asks with the new selection; a remount restores it', async () => {
    const { services, calls, store } = mount();
    const first = renderPage(services);
    await screen.findByRole('button', { name: 'Count the stock' });
    expect(calls.attention.map(([, show]) => show)).toEqual([
      ['created', 'assigned'],
      ['created', 'assigned'],
    ]);
    calls.attention.length = 0;

    await userEvent.click(chip('Assigned to me'));
    await waitFor(() => expect(calls.puts).toEqual([{ show: ['created'], grouping: 'workspace-project' }]));
    await waitFor(() => expect(calls.attention.map(([ws, show]) => [ws, show]).sort()).toEqual([[W1, ['created']], [W2, ['created']]]));
    expect(pressed()).toEqual(['Created by me']);

    first.unmount();
    clearMyWorkspacesCache();
    calls.attention.length = 0;
    const { services: again, calls: againCalls } = mount({ store });
    renderPage(again);
    await screen.findByRole('button', { name: 'Count the stock' });
    expect(pressed()).toEqual(['Created by me']);
    // The stored selection is the FIRST question asked after a reload: no default-first fan-out.
    expect(againCalls.attention.map(([, show]) => show)).toEqual([['created'], ['created']]);
    expect(againCalls.puts).toEqual([]);
  });

  it('30.038 the Group choice is saved the same way, and a remount opens Flat', async () => {
    const { services, calls, store } = mount();
    const first = renderPage(services);
    await screen.findByRole('button', { name: 'Count the stock' });
    await userEvent.click(screen.getByRole('radio', { name: 'Flat' }));
    await waitFor(() => expect(calls.puts).toEqual([{ show: ['created', 'assigned'], grouping: 'flat' }]));

    first.unmount();
    clearMyWorkspacesCache();
    const { services: again } = mount({ store });
    renderPage(again);
    await screen.findByRole('button', { name: 'Count the stock' });
    expect(screen.getByRole('radio', { name: 'Flat' })).toHaveAttribute('aria-checked', 'true');
    expect(outline()).not.toContain('h3 Alpha Works');
  });
});

describe('30.039 a preferences read that fails', () => {
  it('30.039 falls back to the defaults, the page still renders, and nothing is written', async () => {
    const { services, calls } = mount({ store: { doc: null, fail: new Error('HTTP 500 for /v1/me/my-work-preferences') } });
    renderPage(services);
    await screen.findByRole('button', { name: 'Count the stock' });
    expect(pressed()).toEqual(['Created by me', 'Assigned to me']);
    expect(outline()).toContain('h3 Alpha Works');
    expect(calls.attention.map(([, show]) => show)).toEqual([
      ['created', 'assigned'],
      ['created', 'assigned'],
    ]);
    // Give any stray effect a turn before asserting the silence.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(calls.puts).toEqual([]);
  });
});

describe('30.041 / 30.042 the deep link', () => {
  it('30.041 ?ticket=T&ws=W1 opens T\'s sheet in W1; closing it returns to /my-work with no params', async () => {
    searchParams = new URLSearchParams({ ticket: T_A1, ws: W1 });
    const { services, calls } = mount();
    renderPage(services);
    const sheet = await screen.findByRole('dialog');
    const input = await within(sheet).findByLabelText('Ticket title');
    expect((input as HTMLInputElement).value).toBe('File the return');
    expect(calls.getTicket).toContainEqual([W1, T_A1]);
    expect(calls.getTicket.every(([ws]) => ws === W1)).toBe(true);

    await userEvent.click(within(sheet).getByRole('button', { name: 'Close sheet' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/my-work', { scroll: false }));
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('30.042 ?ticket=T with no ws, or a ws the viewer is not in, mounts no sheet and still renders the page', async () => {
    for (const params of [{ ticket: T_A1 }, { ticket: T_A1, ws: '01J9WSNOTMINE0000000000000' }] as Record<string, string>[]) {
      searchParams = new URLSearchParams(params);
      const { services, calls } = mount();
      const view = renderPage(services);
      await screen.findByRole('button', { name: 'Count the stock' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(calls.getTicket).toEqual([]);
      view.unmount();
      clearMyWorkspacesCache();
    }
  });
});

describe('30.044 nothing needs your attention', () => {
  const nothing = { attention: { [W1]: [], [W2]: [] }, myWork: { [W1]: EMPTY, [W2]: EMPTY } };

  it('30.044 says so for the SELECTED chips, and the chips stay live (Review Focus 3)', async () => {
    const { services } = mount(nothing);
    renderPage(services);
    expect(
      await screen.findByText('Nothing needs your attention for created by me and assigned to me'),
    ).toBeInTheDocument();
    await userEvent.click(chip('Created by me'));
    expect(await screen.findByText('Nothing needs your attention for assigned to me')).toBeInTheDocument();
    expect(pressed()).toEqual(['Assigned to me']);
  });

  it('30.044 the summary names the selection, not every offered chip; "I" keeps its capital', async () => {
    const { services } = mount({ ...nothing, store: { doc: { show: ['created', 'ws-admin'], grouping: 'flat' }, fail: null } });
    renderPage(services);
    // beta Freight makes this viewer an admin, so three chips are OFFERED and two are selected.
    expect(
      await screen.findByText('Nothing needs your attention for created by me and workspaces I own or run'),
    ).toBeInTheDocument();
    expect(within(showGroup()).getAllByRole('button')).toHaveLength(3);
  });

  it('30.044 a workspace that failed is never an all-clear: its refusal shows, the sentence does not', async () => {
    const { services } = mount({
      attention: { [W1]: new Error('HTTP 500 for /v1/workspaces/w1/attention'), [W2]: [] },
      myWork: { [W1]: EMPTY, [W2]: EMPTY },
    });
    renderPage(services);
    expect(await screen.findByText(/HTTP 500 for \/v1\/workspaces\/w1\/attention/)).toBeInTheDocument();
    expect(screen.getByText(/Alpha Works/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing needs your attention/)).toBeNull();
  });
});

describe('30.045 the chips a viewer is offered', () => {
  const labels = (): string[] => within(showGroup()).getAllByRole('button').map((button) => button.textContent ?? '');

  it('30.045 a member everywhere sees two; an admin somewhere sees three; a project admin sees "Projects I run"', async () => {
    const arms: Array<[WorkspaceRef[], string[]]> = [
      [[ALPHA, { ...BETA, role: 'member' }], ['Created by me', 'Assigned to me']],
      [[ALPHA, BETA], ['Created by me', 'Assigned to me', 'Workspaces I own or run']],
      [[{ ...ALPHA, adminProjectIds: [P_MANGO] }, { ...BETA, role: 'member' }], ['Created by me', 'Assigned to me', 'Projects I run']],
    ];
    for (const [workspaces, expected] of arms) {
      const { services } = mount({ workspaces });
      const view = renderPage(services);
      await screen.findByRole('button', { name: 'Count the stock' });
      expect(labels()).toEqual(expected);
      view.unmount();
      clearMyWorkspacesCache();
    }
  });

  it('30.045 an archived workspace is neither asked nor shown', async () => {
    const OLD = workspaceRef(W_ARCHIVED, 'Archived Annex', { archived: true, role: 'owner', projects: [project(P_MANGO, 'Mango')] });
    const { services, calls } = mount({ workspaces: [ALPHA, { ...BETA, role: 'member' }, OLD] });
    renderPage(services);
    await screen.findByRole('button', { name: 'Count the stock' });
    expect(calls.attention.map(([ws]) => ws).sort()).toEqual([W1, W2].sort());
    expect(calls.myWork.sort()).toEqual([W1, W2].sort());
    // Its owner role offers nothing either: the chip it alone would justify selects nothing anywhere.
    expect(labels()).toEqual(['Created by me', 'Assigned to me']);
  });
});

describe('30.046 the sheet opener', () => {
  it('30.046 passes the item\'s OWN workspace: one ticket in each of two workspaces', async () => {
    const { services } = mount();
    renderPage(services);
    await userEvent.click(await screen.findByRole('button', { name: 'Renew the lease' }));
    expect(push).toHaveBeenLastCalledWith(`/my-work?ticket=${T_OVERDUE}&ws=${W1}`, { scroll: false });
    await userEvent.click(screen.getByRole('button', { name: 'Count the stock' }));
    expect(push).toHaveBeenLastCalledWith(`/my-work?ticket=${T_A2}&ws=${W2}`, { scroll: false });
    await userEvent.click(screen.getByRole('button', { name: 'Chase the delivery' }));
    expect(push).toHaveBeenLastCalledWith(`/my-work?ticket=${T_BLOCKED}&ws=${W2}`, { scroll: false });
  });
});

describe('30.050 keyboard order', () => {
  it('30.050 Tab goes from the chips to the group toggle, then to the first card', async () => {
    const { services } = mount();
    renderPage(services);
    await screen.findByRole('button', { name: 'Count the stock' });
    const user = userEvent.setup();
    chip('Created by me').focus();
    const visited: string[] = [];
    for (let step = 0; step < 4; step += 1) {
      await user.tab();
      visited.push(document.activeElement?.textContent ?? '');
    }
    // Beta is an admin workspace, so the row carries a third chip before the toggle.
    expect(visited).toEqual(['Assigned to me', 'Workspaces I own or run', 'By workspace and project', 'Renew the lease']);
  });
});
