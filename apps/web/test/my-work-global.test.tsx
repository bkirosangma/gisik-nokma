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
import type { TicketLocation, TicketLocator } from '../src/ticket-location.js';

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
/** A project Alpha Works does NOT name for this viewer (absent from `ALPHA.projects`). */
const P_SECRET = '01J9PSECRET000000000000000';

const T_OVERDUE = '01J9TOVERDUE00000000000000';
const T_BLOCKED = '01J9TBLOCKED00000000000000';
const T_A1 = '01J9TASSIGNEDONE0000000000';
const T_A2 = '01J9TASSIGNEDTWO0000000000';
const T_OLD = '01J9TOLDLEDGER000000000000';
const T_SECRET = '01J9TSECRETYARD00000000000';

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

function work(ticketId: string, title: string, workspaceId: string, projectId: string, projectName: string | null): WorkItem {
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
  /** The workspaces `getMembers` and `getActorNames` were asked for (the actor-name fan-out). */
  members: string[];
  actorNames: string[];
};

/** `putFail` makes every PUT refuse with it (the choice stays on screen; the page says it was not saved). */
type Store = { doc: MyWorkPreferences | null; fail: Error | null; putFail?: Error | null };

function mount(
  opts: {
    workspaces?: WorkspaceRef[];
    attention?: Record<string, AttentionItem[] | Error>;
    myWork?: Record<string, MyWorkView>;
    store?: Store;
    /** Holds the preferences GET until it settles (the fan-out must wait for it). */
    prefsGate?: Promise<void>;
    /** The sheet's locator; absent leaves it unstubbed (a call rejects). */
    locate?: TicketLocator['locate'];
  } = {},
): { services: AppServices; calls: Calls; store: Store } {
  const calls: Calls = { attention: [], myWork: [], puts: [], prefsGets: 0, getTicket: [], members: [], actorNames: [] };
  const store: Store = opts.store ?? { doc: null, fail: null };
  const workspaces = opts.workspaces ?? [ALPHA, BETA];
  const titles: Record<string, [string, string, string]> = {
    [T_A1]: ['File the return', W1, P_BANANA],
    [T_A2]: ['Count the stock', W2, P_ZINC],
    [T_OVERDUE]: ['Renew the lease', W1, P_MANGO],
    [T_BLOCKED]: ['Chase the delivery', W2, P_ZINC],
    [T_OLD]: ['Close the old ledger', W_ARCHIVED, P_MANGO],
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
      if (opts.prefsGate !== undefined) await opts.prefsGate;
      if (store.fail !== null) throw store.fail;
      return store.doc ?? { show: ['created', 'assigned'], grouping: 'workspace-project' };
    },
    putMyWorkPreferences: async (doc) => {
      calls.puts.push(doc);
      if (store.putFail) throw store.putFail;
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
    getMembers: async (workspaceId) => {
      calls.members.push(workspaceId);
      return [{ id: ME, name: 'Anselma Marak', role: 'owner' }];
    },
    getActorNames: async (workspaceId) => {
      calls.actorNames.push(workspaceId);
      return [];
    },
    getTickets: async () => ({ projectId: P_MANGO, rows: [] }),
  }, opts.locate === undefined ? {} : { ticketLocation: { locate: opts.locate } });
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

/** Gives any stray effect a turn, so an assertion about silence is not made too early. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
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
    // Grouped, the headings say where each row lives, so no row repeats it (Flat's labels are 30.037's).
    expect(document.querySelectorAll('.gn-attention__place, .gn-my-work__place')).toHaveLength(0);
    expect(within(screen.getByRole('radiogroup', { name: 'Group' })).getByRole('radio', { name: 'By workspace and project' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});

describe('30.037 Flat', () => {
  /** The visible names in the place label of the row or card titled `title`, its `›` asserted aria-hidden. */
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
    expect(placeOf('Renew the lease')).toEqual(['Alpha Works', 'Mango']);
    expect(placeOf('Chase the delivery')).toEqual(['beta Freight', 'Zinc']);
    expect(placeOf('File the return')).toEqual(['Alpha Works', 'Banana']);
    expect(placeOf('Count the stock')).toEqual(['beta Freight', 'Zinc']);
    expect(document.querySelector('.gn-shell__main')?.textContent ?? '').not.toMatch(/ · /);
  });

  it('30.037 a withheld project reads "Unknown project" in BOTH arrangements, the grouped heading and the Flat place label, never its id there; the grouped card keeps its 3.161 id line and the Flat card gains none (planner 22:09 P1, 22:26 (A))', async () => {
    // A ticket shared with the viewer in a project Alpha Works does not name for them.
    const withheld = work(T_SECRET, 'Sweep the yard', W1, P_SECRET, null);
    const alpha = MY_WORK[W1] ?? EMPTY;
    const { services } = mount({ myWork: { ...MY_WORK, [W1]: { ...alpha, shared: [withheld] } } });
    renderPage(services);
    await screen.findByRole('button', { name: 'Sweep the yard' });
    const card = (): Element | null => screen.getByRole('button', { name: 'Sweep the yard' }).closest('.gn-my-work__item');

    // Grouped, the default. SOFT, so that a broken "Unknown project" rule still lets the Flat arm
    // below be read: it has to show in both arrangements.
    const grouped = outline();
    expect.soft(grouped.slice(grouped.indexOf('h2 Shared with me'))).toEqual([
      'h2 Shared with me',
      'h3 Alpha Works',
      'h4 Unknown project',
      '· Sweep the yard',
    ]);
    // GROUPED CONTROL: the card's own id-only line, case 3.161's, is unchanged (ruling 22:26 (A)).
    const idLine = card()?.querySelector('.gn-my-work__project--id');
    expect.soft(idLine?.textContent).toBe(P_SECRET);
    expect.soft(idLine?.getAttribute('title')).toBe('You have not been told this project’s name.');

    await userEvent.click(screen.getByRole('radio', { name: 'Flat' }));
    await waitFor(() => expect(card()?.querySelector('.gn-my-work__place')).not.toBeNull());
    expect(placeOf('Sweep the yard')).toEqual(['Alpha Works', 'Unknown project']);
    // No raw id anywhere on the flat card: not in the label, and no 3.161 line beside it.
    expect(card()?.textContent ?? '').not.toContain(P_SECRET);
    expect(card()?.querySelectorAll('.gn-my-work__project--id')).toHaveLength(0);
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

  it('30.038 the Group save carries the selection on screen, never the defaults', async () => {
    const { services, calls } = mount({ store: { doc: { show: ['assigned'], grouping: 'workspace-project' }, fail: null } });
    renderPage(services);
    await screen.findByRole('button', { name: 'Count the stock' });
    expect(pressed()).toEqual(['Assigned to me']);
    await userEvent.click(screen.getByRole('radio', { name: 'Flat' }));
    await waitFor(() => expect(calls.puts).toEqual([{ show: ['assigned'], grouping: 'flat' }]));
  });

  it('30.038 the fan-out waits for the document: with its GET held nothing is asked, then the stored selection is the first question', async () => {
    let answer: () => void = () => undefined;
    const prefsGate = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const { services, calls } = mount({ store: { doc: { show: ['created'], grouping: 'workspace-project' }, fail: null }, prefsGate });
    renderPage(services);
    await waitFor(() => expect(calls.prefsGets).toBe(1));
    await settle();
    // The workspace list has answered by now; the list alone does not start the fan-out.
    expect(calls.attention).toEqual([]);
    expect(calls.myWork).toEqual([]);
    await act(async () => {
      answer();
    });
    await screen.findByRole('button', { name: 'Count the stock' });
    expect(calls.attention.map(([, show]) => show)).toEqual([['created'], ['created']]);
    expect(calls.myWork.sort()).toEqual([W1, W2].sort());
  });

  it('30.038 a save that fails says it was NOT SAVED (never "Reload") and keeps the pressed chips as chosen; CONTROLS: a save that lands says nothing, and a load that fails beside it still says "could not be loaded"', async () => {
    const pressAssignedOff = async (putFail: Error | null, attention?: Record<string, AttentionItem[] | Error>) => {
      const mounted = mount({ store: { doc: null, fail: null, putFail }, ...(attention === undefined ? {} : { attention }) });
      const view = renderPage(mounted.services);
      await screen.findByRole('button', { name: 'Count the stock' });
      await userEvent.click(chip('Assigned to me'));
      await waitFor(() => expect(mounted.calls.puts).toEqual([{ show: ['created'], grouping: 'workspace-project' }]));
      await settle();
      return view;
    };
    // The refusal carrying the PUT's own wire string: found by what failed, never by its wording,
    // so a load refusal that wrongly takes the save sentence cannot make this lookup ambiguous.
    const saveRefusal = (): Element | null =>
      Array.from(document.querySelectorAll('.gn-shell__refusal')).find((panel) => (panel.textContent ?? '').includes('/v1/me/my-work-preferences')) ?? null;

    // CONTROL: the PUT lands, and nothing is said about it.
    const landed = await pressAssignedOff(null);
    expect(pressed()).toEqual(['Created by me']);
    expect(screen.queryByText(/Your choice for this page/)).toBeNull();
    landed.unmount();
    clearMyWorkspacesCache();

    // The PUT is refused while one workspace's attention read fails too: the choice stays on screen
    // for this visit, and the page says it was not saved (planner ruling 22:54), not the shared load
    // sentence, whose "Reload to try again" would throw the choice away.
    await pressAssignedOff(new Error('HTTP 500 for /v1/me/my-work-preferences'), {
      [W1]: new Error('HTTP 500 for /v1/workspaces/w1/attention'),
      [W2]: ATTENTION[W2] ?? [],
    });
    expect(pressed()).toEqual(['Created by me']);
    const refusal = saveRefusal();
    expect(refusal?.querySelector('.gn-shell__refusal-what')?.textContent).toBe(
      'Your choice for this page was not saved. It stays as you set it until you leave this page.',
    );
    expect(refusal?.textContent ?? '').not.toMatch(/Reload/);
    expect(refusal?.querySelector('.gn-shell__refusal-wire')?.textContent).toBe('HTTP 500 for /v1/me/my-work-preferences');
    // CONTROL: the failed LOAD beside it keeps the shared refusal and its sentence.
    expect(screen.getByText('What needs your attention in Alpha Works could not be loaded. Reload to try again.')).toBeInTheDocument();
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

  it('30.039 a 401 on the preferences read alone is a session that ended, said once in place of the page; CONTROL: a 500 is the defaults, with no such notice', async () => {
    // CONTROL: a 500 draws the page with the defaults, and says nothing about the session.
    const control = mount({ store: { doc: null, fail: new Error('HTTP 500 for /v1/me/my-work-preferences') } });
    const first = renderPage(control.services);
    await screen.findByRole('button', { name: 'Count the stock' });
    expect(pressed()).toEqual(['Created by me', 'Assigned to me']);
    expect(screen.queryByText(/Your session has ended/)).toBeNull();
    first.unmount();
    clearMyWorkspacesCache();

    // The document's own 401, with every other read answering: the expired-session notice (13.1399's).
    const { services } = mount({ store: { doc: null, fail: new Error('HTTP 401 for /v1/me/my-work-preferences') } });
    renderPage(services);
    const notice = await screen.findByText(/Your session has ended/);
    expect(notice.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Count the stock' })).toBeNull();
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

  it('30.041 with the preferences GET held, the locator is not asked: a deep link waits for the reads that would place it, then opens from the rows', async () => {
    let answer: () => void = () => undefined;
    const prefsGate = new Promise<void>((resolve) => {
      answer = resolve;
    });
    searchParams = new URLSearchParams({ ticket: T_A1, ws: W1 });
    const located: Array<[string, string]> = [];
    const { services, calls } = mount({
      prefsGate,
      // A locator that WOULD place the ticket, so only the page's wait keeps it unasked.
      locate: async (workspaceId, ticketId) => {
        located.push([workspaceId, ticketId]);
        return { workspaceId, projectId: P_BANANA };
      },
    });
    renderPage(services);
    await waitFor(() => expect(calls.prefsGets).toBe(1));
    await settle();
    expect(located).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      answer();
    });
    const sheet = await screen.findByRole('dialog');
    expect(((await within(sheet).findByLabelText('Ticket title')) as HTMLInputElement).value).toBe('File the return');
    // Placed from the rows once they answered: the locator was never needed.
    expect(located).toEqual([]);
  });

  it('30.042 ?ticket=T with no ws, or a ws the viewer is not in, mounts no sheet and still renders the page', async () => {
    for (const params of [{ ticket: T_A1 }, { ticket: T_A1, ws: '01J9WSNOTMINE0000000000000' }] as Record<string, string>[]) {
      searchParams = new URLSearchParams(params);
      // A locator that WOULD place the ticket, so only the page's own membership check keeps the sheet shut.
      const located: Array<[string, string]> = [];
      const { services, calls } = mount({
        locate: async (workspaceId, ticketId) => {
          located.push([workspaceId, ticketId]);
          return { workspaceId, projectId: P_BANANA };
        },
      });
      const view = renderPage(services);
      await screen.findByRole('button', { name: 'Count the stock' });
      await settle();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(calls.getTicket).toEqual([]);
      expect(located).toEqual([]);
      view.unmount();
      clearMyWorkspacesCache();
    }
  });

  it('30.042 a ws that is not the row\'s own workspace never borrows its project: W1\'s ticket at ws=W2 asks the locator for (W2, T) and its null is the NOT_PLACEABLE sentence; CONTROL: ws=W1 opens from the rows, unasked', async () => {
    const located: Array<[string, string]> = [];
    const locate: TicketLocator['locate'] = async (workspaceId, ticketId) => {
      located.push([workspaceId, ticketId]);
      return null;
    };
    // The real path: /w/W2/my-work?ticket=<a W1 ticket> redirects to ?ticket=…&ws=W2.
    searchParams = new URLSearchParams({ ticket: T_A1, ws: W2 });
    const foreign = mount({ locate });
    const view = renderPage(foreign.services);
    expect(await screen.findByRole('alert')).toHaveTextContent('That ticket cannot be opened from here.');
    expect(located).toContainEqual([W2, T_A1]);
    expect(located.filter(([workspaceId, ticketId]) => workspaceId !== W2 || ticketId !== T_A1)).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(foreign.calls.getTicket).toEqual([]);
    view.unmount();
    clearMyWorkspacesCache();
    clearWorkspaceNameCache();

    // CONTROL: the row's own workspace opens the sheet from the rows, and nobody is asked.
    located.length = 0;
    searchParams = new URLSearchParams({ ticket: T_A1, ws: W1 });
    renderPage(mount({ locate }).services);
    const sheet = await screen.findByRole('dialog');
    expect(((await within(sheet).findByLabelText('Ticket title')) as HTMLInputElement).value).toBe('File the return');
    expect(located).toEqual([]);
  });

  it('30.042 a ws naming an ARCHIVED workspace the viewer is in still opens the sheet, read in that workspace (planner 22:09 P2: the server applies its own read rules); CONTROL: the locator\'s null is the NOT_PLACEABLE sentence, with no sheet and no read', async () => {
    const OLD = workspaceRef(W_ARCHIVED, 'Archived Annex', { archived: true, projects: [project(P_MANGO, 'Mango')] });
    const located: Array<[string, string]> = [];
    let answer: TicketLocation | null = { workspaceId: W_ARCHIVED, projectId: P_MANGO };
    const locate: TicketLocator['locate'] = async (workspaceId, ticketId) => {
      located.push([workspaceId, ticketId]);
      return answer;
    };
    searchParams = new URLSearchParams({ ticket: T_OLD, ws: W_ARCHIVED });
    const opened = mount({ workspaces: [ALPHA, BETA, OLD], locate });
    const view = renderPage(opened.services);
    const sheet = await screen.findByRole('dialog');
    expect(((await within(sheet).findByLabelText('Ticket title')) as HTMLInputElement).value).toBe('Close the old ledger');
    expect(located).toContainEqual([W_ARCHIVED, T_OLD]);
    // Read in the archived workspace, and for nothing else.
    expect(opened.calls.getTicket).toContainEqual([W_ARCHIVED, T_OLD]);
    expect(opened.calls.getTicket.filter(([workspaceId, ticketId]) => workspaceId !== W_ARCHIVED || ticketId !== T_OLD)).toEqual([]);
    view.unmount();
    clearMyWorkspacesCache();
    clearWorkspaceNameCache();

    // CONTROL: the server's frozen 404 (the locator's null) is the one sentence, with no sheet and no read.
    answer = null;
    located.length = 0;
    const refused = mount({ workspaces: [ALPHA, BETA, OLD], locate });
    renderPage(refused.services);
    expect(await screen.findByRole('alert')).toHaveTextContent('That ticket cannot be opened from here.');
    expect(located).toContainEqual([W_ARCHIVED, T_OLD]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(refused.calls.getTicket).toEqual([]);
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

  it('30.045 a stored chip the viewer is no longer offered is dropped, and the selection takes the chips\' order', async () => {
    const member = [ALPHA, { ...BETA, role: 'member' as const }];
    const arms: Array<[AttentionShow[], AttentionShow[]]> = [
      // No longer an admin anywhere: the admin chip is gone, the rest of the selection stands.
      [['assigned', 'ws-admin'], ['assigned']],
      // Nothing left once it is dropped: the defaults (at least one chip is always selected).
      [['ws-admin'], ['created', 'assigned']],
      // Stored out of order: asked in the chips' order (the summary and the URL follow it).
      [['assigned', 'created'], ['created', 'assigned']],
    ];
    for (const [stored, asked] of arms) {
      const { services, calls } = mount({ workspaces: member, store: { doc: { show: stored, grouping: 'workspace-project' }, fail: null } });
      const view = renderPage(services);
      await screen.findByRole('button', { name: 'Count the stock' });
      expect(calls.attention.map(([, show]) => show), `stored ${stored.join(',')}`).toEqual([asked, asked]);
      expect(labels()).toEqual(['Created by me', 'Assigned to me']);
      view.unmount();
      clearMyWorkspacesCache();
    }
  });

  it('30.045 an archived workspace is neither asked (its members and actor names included) nor shown', async () => {
    const OLD = workspaceRef(W_ARCHIVED, 'Archived Annex', { archived: true, role: 'owner', projects: [project(P_MANGO, 'Mango')] });
    const { services, calls } = mount({ workspaces: [ALPHA, { ...BETA, role: 'member' }, OLD] });
    renderPage(services);
    await screen.findByRole('button', { name: 'Count the stock' });
    expect(calls.attention.map(([ws]) => ws).sort()).toEqual([W1, W2].sort());
    expect(calls.myWork.sort()).toEqual([W1, W2].sort());
    // Its owner role offers nothing either: the chip it alone would justify selects nothing anywhere.
    expect(labels()).toEqual(['Created by me', 'Assigned to me']);
    // The actor-name reads are per LIVE workspace too (CONTROL: both reach the two live ones).
    await waitFor(() => expect(calls.members).toEqual(expect.arrayContaining([W1, W2])));
    expect(calls.actorNames).toEqual(expect.arrayContaining([W1, W2]));
    expect(calls.members).not.toContain(W_ARCHIVED);
    expect(calls.actorNames).not.toContain(W_ARCHIVED);
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
