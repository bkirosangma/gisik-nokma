import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

import ProjectPage, {
  // Value import, deliberately: the case asserts the string that RENDERS rather
  // than a re-typed copy of it — two spellings of one sentence is how a copy
  // change passes a test it broke (`epics-not-rows.test.tsx`'s own note).
  BACKLOG_EMPTY_ACTIVE_ONLY_COPY,
} from '../app/w/[workspaceId]/p/[projectId]/page.js';

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

describe('13.1115 the Backlog tab with “Only tickets in progress” ON (E5-40)', () => {
  /**
   * 13.1115 — E5-40. The toggle writes `stateCategories: ['active']` into the
   * SERVER read (`listFilter`, above `useTicketList`), and a backlog ticket's
   * category is `open` — so with the toggle on, every backlog row is stripped
   * before any screen-level fold sees it. The Backlog tab then rendered
   * *"Nothing in the backlog — new tickets land here."* over a project that may
   * hold plenty, and nothing on the tab said the toggle was why. The file itself
   * recorded this as `RECORDED, NOT FIXED`.
   *
   * **The stub APPLIES the filter rather than ignoring it**, which is the whole
   * case: a `getTickets` that returned every row would render the backlog
   * correctly and the defect could not appear. It mirrors the server — filter
   * first, then answer — for the reason the fake-notifications gateway's own
   * extension records, one file over.
   *
   * Asserted on the pair, because the two sentences are alternatives in ONE
   * branch: the toggle's sentence renders AND the original is absent. A case
   * asserting only the new sentence passes on a screen that draws both.
   */
  it('13.1115 says the backlog is HIDDEN, not that it is empty, when the toggle emptied it', async () => {
    const backlogRow = row({
      ticketId: 'bt_1',
      title: 'Backlog ticket',
      stateId: BACKLOG_STATE_ID,
      stateName: 'Backlog',
      stateCategory: 'open',
    });
    const activeRow = row({ ticketId: 'at_1', title: 'Active ticket' });
    const world = servedWorld([], {
      getTickets: async (_projectId: string, filter): Promise<TicketListView> => {
        const narrowing = filter?.stateCategories;
        const all = [backlogRow, activeRow];
        return {
          projectId: PROJECT,
          rows: narrowing === undefined ? all : all.filter((r) => narrowing.includes(r.stateCategory)),
        };
      },
    });
    render(
      <Providers services={world}>
        <ProjectPage />
      </Providers>,
    );

    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Only tickets in progress' }),
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));

    expect(await screen.findByText(BACKLOG_EMPTY_ACTIVE_ONLY_COPY)).toBeInTheDocument();
    expect(
      screen.queryByText('Nothing in the backlog — new tickets land here.'),
    ).toBeNull();
    // And the backlog's own row is really gone from the read — without this the
    // case would pass against a page that never narrowed anything.
    expect(screen.queryByText('Backlog ticket')).toBeNull();
  });

  /**
   * 13.1115's control — the sentence is about the TOGGLE, so it must not appear
   * without it. With the toggle OFF and a genuinely empty backlog, the original
   * sentence is the true one and still renders. Without this the fix could be
   * "always print the toggle sentence", which would be false whenever the toggle
   * is off.
   */
  it('13.1115 control: with the toggle OFF, an empty backlog keeps the original sentence', async () => {
    render(
      <Providers services={servedWorld([])}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));

    expect(
      await screen.findByText('Nothing in the backlog — new tickets land here.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(BACKLOG_EMPTY_ACTIVE_ONLY_COPY)).toBeNull();
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

// ---------------------------------------------------------------------------
// Second wave Task 5 — the Backlog tab's rank order, drag reorder, and the
// Move up / Move down buttons.
// ---------------------------------------------------------------------------

/**
 * The page's rows, in the order the DOM renders them. `TicketList` puts
 * `data-testid="ticket-card-<ticketId>"` on each row's title cell, so the
 * query is in DOCUMENT ORDER — which is the only thing these cases are
 * about. Reading the order out of the fixture instead would assert what the
 * stub answered, not what the tab drew.
 */
function backlogOrder(): string[] {
  return Array.from(document.querySelectorAll('[data-testid^="ticket-card-"]')).map((el) =>
    (el.getAttribute('data-testid') ?? '').replace('ticket-card-', ''),
  );
}

/** A backlog row with a rank key. `assignee: null` still — see `row()`'s own note. */
function backlogRow(ticketId: string, title: string, rank: string | null): ListRow {
  return row({
    ticketId,
    title,
    typeId: 'task',
    stateId: BACKLOG_STATE_ID,
    stateName: 'Backlog',
    stateCategory: 'open',
    rank,
  });
}

/**
 * The drag stub Task 4's own suite uses (`ticket-list.test.tsx:1509`), copied
 * rather than re-invented so the two suites drive the component through the
 * identical transfer shape.
 */
function fakeDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    setData: (format: string, data: string) => {
      store.set(format, data);
    },
    getData: (format: string) => store.get(format) ?? '',
    effectAllowed: 'uninitialized',
  } as unknown as DataTransfer;
}

function rowTr(ticketId: string): HTMLTableRowElement {
  const tr = screen.getByTestId(`ticket-card-${ticketId}`).closest('tr');
  if (tr === null) throw new Error(`no <tr> for ${ticketId}`);
  return tr;
}

function tailZone(): Element {
  const tail = document.querySelector('.gn-list__tail-drop');
  if (tail === null) throw new Error('no .gn-list__tail-drop rendered');
  return tail;
}

type CapturedRank = { entityId: string; type: string; rank: unknown };

/**
 * 13.708 — the Backlog tab's rank ORDER, and `Move down`.
 *
 * The three halves are deliberately separate. The order case can be passed by
 * a tab that ignores the buttons; the button case can be passed by a tab that
 * ingests the right event while drawing the wrong order; and the refusal case
 * can be passed by one that never moves optimistically at all (there would be
 * nothing to snap back). Each names the other two's failure as its control.
 */
describe('13.708 the Backlog tab in rank order, and Move down', () => {
  const FIRST = backlogRow('br_1', 'First', 'g');
  const SECOND = backlogRow('br_2', 'Second', 'n');
  const THIRD = backlogRow('br_3', 'Third', 't');

  it('draws ranked rows by key and unranked rows last, whatever order the server sent', async () => {
    // The stub's order is the reverse of the answer, so a tab that rendered
    // `rows` as they arrived would draw exactly backwards.
    const unranked = backlogRow('br_0', 'Unranked', null);
    render(
      <Providers services={servedWorld([unranked, THIRD, SECOND, FIRST])}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));
    await screen.findByText('First');

    expect(await waitFor(() => backlogOrder())).toEqual(['br_1', 'br_2', 'br_3', 'br_0']);
  });

  it('Move down ingests ONE ticket.ranked whose key is strictly between its two neighbours, and the row moves before the server answers', async () => {
    let reloads = 0;
    const services = servedWorld([FIRST, SECOND, THIRD], {
      // Counted, so "the reload follows a committed move" is a fact about a
      // request rather than about a render that might have come from anywhere.
      getTickets: async (): Promise<TicketListView> => {
        reloads += 1;
        return { projectId: PROJECT, rows: [FIRST, SECOND, THIRD] };
      },
    });
    const captured: CapturedRank[] = [];
    // HELD OPEN ON PURPOSE. The optimistic half of this case is only
    // observable while the ingest is still in flight; a stub that resolves
    // immediately would let the reload land first and make "the row moved
    // optimistically" indistinguishable from "the row moved".
    // A ONE-SLOT MAILBOX, deliberately an array rather than a `let`: TypeScript
    // narrows a `let x: T | null = null` to `null` at the call site, because
    // the only assignment happens inside this callback and the checker cannot
    // see that the callback ran — `answer?.()` then reports "Type 'never' has
    // no call signatures", which is a compile-time refusal of a pattern that
    // works at runtime. An indexed read is not narrowed that way.
    const answers: Array<(results: unknown[]) => void> = [];
    services.dataSource.ingest = async (events) => {
      for (const event of events) {
        captured.push({
          entityId: event.entity.id,
          type: event.type,
          rank: (event.payload as { rank?: unknown }).rank,
        });
      }
      return await new Promise((resolve) => {
        answers.push(resolve as (results: unknown[]) => void);
      });
    };

    render(
      <Providers services={services}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));
    await screen.findByText('First');
    expect(backlogOrder()).toEqual(['br_1', 'br_2', 'br_3']);

    await userEvent.click(screen.getByRole('button', { name: 'Move First down' }));

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]?.entityId).toBe('br_1');
    expect(captured[0]?.type).toBe('ticket.ranked');
    // THE BETWEEN ASSERTION, ON THE CAPTURED PAYLOAD AND NEVER ON A LITERAL.
    // 'First' was at the top, so moving it down places it between 'Second'
    // ('n') and 'Third' ('t'). A literal key would pass on any plausible
    // spelling — including one that sorts the row somewhere else entirely —
    // so the assertion is the two comparisons themselves.
    const rank = captured[0]?.rank as string;
    expect(typeof rank).toBe('string');
    expect(rank > 'n').toBe(true);
    expect(rank < 't').toBe(true);

    // Optimistic, and the ORDER is the claim: the row is now second, while
    // the ingest has not answered.
    await waitFor(() => expect(backlogOrder()).toEqual(['br_2', 'br_1', 'br_3']));

    // ...and the committed answer pulls a reload, which is what reconciles the
    // tab with the server's own key.
    const before = reloads;
    answers[0]?.([{ status: 'committed', eventId: 'e1', seq: 1, serverTime: '2026-09-17T09:05:00.000Z' }]);
    await waitFor(() => expect(reloads).toBeGreaterThan(before));
  });

  it('the optimistic position SURVIVES the committed answer until the reload\'s own rows land', async () => {
    // KILLS: clearing the override on the `committed` path instead of only on
    // the failures — `if (!committed)` → unconditional. An independent review
    // measured that mutant surviving this whole file, and the behaviour it
    // breaks is the "two moves for one gesture" flicker `page.tsx`'s docblock
    // argues the flag exists to prevent: the row snaps back to its old key the
    // moment the answer lands, then jumps forward again when the reload
    // arrives.
    //
    // The reload is held open, which is the only way to see it: while the new
    // rows are in flight the page is still drawing the OLD server rows, so the
    // override is the only thing holding the row in its new position. If the
    // override is gone, the old rows put it straight back.
    let calls = 0;
    const reloads: Array<(v: TicketListView) => void> = [];
    const services = servedWorld([FIRST, SECOND, THIRD], {
      getTickets: async (): Promise<TicketListView> => {
        calls += 1;
        if (calls === 1) return { projectId: PROJECT, rows: [FIRST, SECOND, THIRD] };
        return await new Promise<TicketListView>((resolve) => {
          reloads.push(resolve);
        });
      },
    });
    const answers: Array<(results: unknown[]) => void> = [];
    services.dataSource.ingest = async () =>
      await new Promise((resolve) => {
        answers.push(resolve as (results: unknown[]) => void);
      });

    render(
      <Providers services={services}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));
    await screen.findByText('First');
    await userEvent.click(screen.getByRole('button', { name: 'Move First down' }));
    await waitFor(() => expect(backlogOrder()).toEqual(['br_2', 'br_1', 'br_3']));

    answers[0]?.([{ status: 'committed', eventId: 'e1', seq: 1, serverTime: '2026-09-17T09:05:00.000Z' }]);
    await waitFor(() => expect(reloads).toHaveLength(1));
    // Still second, with the server's own rows still saying otherwise.
    expect(backlogOrder()).toEqual(['br_2', 'br_1', 'br_3']);

    // ...and the answer, when it lands, is what the tab follows — even though
    // it CONTRADICTS the optimistic key. This second half is the leak
    // direction: an override that outlived its answer would keep `br_1` in
    // second place for the rest of the session, showing a position the server
    // never agreed to. An independent review measured the effect's `[]` deps
    // surviving this file, and this is the case that kills it.
    reloads[0]?.({ projectId: PROJECT, rows: [{ ...FIRST, rank: 'z' }, SECOND, THIRD] });
    await waitFor(() => expect(backlogOrder()).toEqual(['br_2', 'br_3', 'br_1']));
  });

  it('the drawn order, not the server\'s arrival order, decides which rows are neighbours', async () => {
    // KILLS: handing the handlers the server's rows (`backlogNarrowing.rows`)
    // while the table draws the SORTED ones — an independent review measured
    // that mutant surviving this file, because every other fixture is supplied
    // in rank order and rank order happens to equal ticket-id order there.
    //
    // Here they disagree: the stub's rows arrive in REVERSE rank order, so the
    // drawn list is First, Second, Third while the arrival list is Third,
    // Second, First. In the arrival list, First is LAST — its `Move down`
    // would be disabled and its drop target would be the tail, producing a key
    // above 't' rather than between 'n' and 't'. The assertion is the two
    // comparisons, so neither answer passes by accident.
    const services = servedWorld([THIRD, SECOND, FIRST]);
    const captured: CapturedRank[] = [];
    services.dataSource.ingest = async (events) => {
      for (const event of events) {
        captured.push({
          entityId: event.entity.id,
          type: event.type,
          rank: (event.payload as { rank?: unknown }).rank,
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
    await screen.findByText('First');
    // The tab drew them in rank order, not arrival order.
    expect(backlogOrder()).toEqual(['br_1', 'br_2', 'br_3']);

    await userEvent.click(screen.getByRole('button', { name: 'Move First down' }));

    await waitFor(() => expect(captured).toHaveLength(1));
    const rank = captured[0]?.rank as string;
    expect(rank > 'n').toBe(true);
    expect(rank < 't').toBe(true);
  });

  it('a refused move snaps the order back to the server\'s, and says why', async () => {
    const services = servedWorld([FIRST, SECOND, THIRD]);
    const answers: Array<(results: unknown[]) => void> = [];
    services.dataSource.ingest = async () =>
      await new Promise((resolve) => {
        answers.push(resolve as (results: unknown[]) => void);
      });

    render(
      <Providers services={services}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));
    await screen.findByText('First');

    await userEvent.click(screen.getByRole('button', { name: 'Move First down' }));
    // Moved optimistically first: without this the snap-back below would be
    // satisfied by a component that never moved at all.
    await waitFor(() => expect(backlogOrder()).toEqual(['br_2', 'br_1', 'br_3']));

    answers[0]?.([
      {
        status: 'refused',
        eventId: 'e1',
        rule: 'rank-requires-backlog',
        reason: 'Only a backlog ticket can be ranked; this one is in "To do".',
      },
    ]);

    expect(
      await screen.findByText(
        'Refused by the server — rank-requires-backlog: Only a backlog ticket can be ranked; this one is in "To do".',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(backlogOrder()).toEqual(['br_1', 'br_2', 'br_3']));
  });
});

/**
 * 13.709 — the drag path. It must reach the SAME `submitRank` the buttons
 * use: the two cases below assert the keys a drag produces, which is exactly
 * what a second, independently-computed neighbour would get wrong.
 */
describe('13.709 dragging a Backlog row', () => {
  const FIRST = backlogRow('br_1', 'First', 'g');
  const SECOND = backlogRow('br_2', 'Second', 'n');
  const THIRD = backlogRow('br_3', 'Third', 't');

  function draggedServices(): { services: ReturnType<typeof servedWorld>; captured: CapturedRank[] } {
    const services = servedWorld([FIRST, SECOND, THIRD]);
    const captured: CapturedRank[] = [];
    services.dataSource.ingest = async (events) => {
      for (const event of events) {
        captured.push({
          entityId: event.entity.id,
          type: event.type,
          rank: (event.payload as { rank?: unknown }).rank,
        });
      }
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-17T09:05:00.000Z',
      }));
    };
    return { services, captured };
  }

  it('a drop on a row ingests a key below that row\'s own', async () => {
    const { services, captured } = draggedServices();
    render(
      <Providers services={services}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));
    await screen.findByText('Third');

    // Row 3 onto row 1 — the far end, so the key has to be built against the
    // FIRST row's key and nothing below it.
    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(rowTr('br_3'), { dataTransfer });
    fireEvent.dragOver(rowTr('br_1'), { dataTransfer });
    fireEvent.drop(rowTr('br_1'), { dataTransfer });

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]?.entityId).toBe('br_3');
    expect(captured[0]?.type).toBe('ticket.ranked');
    expect((captured[0]?.rank as string) < 'g').toBe(true);
  });

  it('a drop on the tail zone ingests a key above the last RANKED row\'s', async () => {
    const { services, captured } = draggedServices();
    render(
      <Providers services={services}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));
    await screen.findByText('Third');

    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(rowTr('br_3'), { dataTransfer });
    fireEvent.dragOver(tailZone(), { dataTransfer });
    fireEvent.drop(tailZone(), { dataTransfer });

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]?.entityId).toBe('br_3');
    expect((captured[0]?.rank as string) > 'n').toBe(true);
  });
});

/** 13.710 — the two edges: only the top row's Move up and the bottom row's Move down are disabled. */
describe('13.710 the Move up / Move down edges', () => {
  it('disables only the top row\'s up and the bottom row\'s down', async () => {
    const FIRST = backlogRow('br_1', 'First', 'g');
    const SECOND = backlogRow('br_2', 'Second', 'n');
    const THIRD = backlogRow('br_3', 'Third', 't');
    render(
      <Providers services={servedWorld([FIRST, SECOND, THIRD])}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));
    await screen.findByText('First');

    expect(screen.getByRole('button', { name: 'Move First up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Third down' })).toBeDisabled();

    // THE CONTROL: the middle row has both directions available, and the
    // second row's Move down must NOT be disabled — it means "place last",
    // which is a move the row can still make. A component that disabled the
    // button whenever there was no row two below would pass the two lines
    // above and strand the second-to-last row.
    expect(screen.getByRole('button', { name: 'Move Second up' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move Second down' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move Third up' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move First down' })).toBeEnabled();
  });
});

/**
 * 13.712 — the owner's ruling on the unranked tail (2026-09-18, option B):
 * rank the rows that have no key FIRST, in their drawn order, then apply the
 * move, all in one ingest.
 *
 * The cases below are the two behaviours that were BROKEN before the ruling
 * (measured on the shipped build: a tail drop in a fresh backlog drew the row
 * at the TOP, and a Move down that stepped over an unranked row drew the order
 * unchanged), plus the partial-application case the owner accepted as the cost
 * rather than waived.
 */
describe('13.712 the unranked backlog tail — option B: rank first, then move', () => {
  const U1 = backlogRow('br_1', 'First', null);
  const U2 = backlogRow('br_2', 'Second', null);
  const U3 = backlogRow('br_3', 'Third', null);
  const U4 = backlogRow('br_4', 'Fourth', null);

  it('PLANTED DEFECT: a tail drop in a FRESH backlog lands the row LAST, and every unranked row gets a key', async () => {
    // KILLS, in one case, both halves of the defect and the optimistic half
    // too: a plan that leaves rows unranked (the order would be `br_4` first,
    // because the moved row would be the only ranked one), and a `submitRank`
    // that applies the moved row's optimistic key WITHOUT the backfilled
    // rows' — the same wrong order, on screen, before the answer lands.
    const services = servedWorld([U1, U2, U3, U4]);
    const captured: CapturedRank[] = [];
    const answers: Array<(results: unknown[]) => void> = [];
    services.dataSource.ingest = async (events) => {
      for (const event of events) {
        captured.push({
          entityId: event.entity.id,
          type: event.type,
          rank: (event.payload as { rank?: unknown }).rank,
        });
      }
      return await new Promise((resolve) => {
        answers.push(resolve as (results: unknown[]) => void);
      });
    };

    render(
      <Providers services={services}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));
    await screen.findByText('Fourth');
    expect(backlogOrder()).toEqual(['br_1', 'br_2', 'br_3', 'br_4']);

    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(rowTr('br_4'), { dataTransfer });
    fireEvent.dragOver(tailZone(), { dataTransfer });
    fireEvent.drop(tailZone(), { dataTransfer });

    await waitFor(() => expect(captured).toHaveLength(4));
    // The move is the LAST event, and every earlier one is a distinct row.
    expect(captured.map((c) => c.entityId)).toEqual(['br_1', 'br_2', 'br_3', 'br_4']);
    expect(captured.every((c) => c.type === 'ticket.ranked')).toBe(true);

    // The backfill keys ascend above the tail they already occupied, and the
    // moved row's key is above all of them — which is what makes it LAST. The
    // assertion is the comparisons, never a literal key.
    const keys = captured.map((c) => c.rank as string);
    for (let i = 1; i < keys.length; i += 1) {
      expect((keys[i] as string) > (keys[i - 1] as string)).toBe(true);
    }

    // Optimistically LAST while the ingest is still open.
    await waitFor(() => expect(backlogOrder()).toEqual(['br_1', 'br_2', 'br_3', 'br_4']));

    answers[0]?.(captured.map((c, i) => ({ status: 'committed' as const, eventId: `e${i}`, seq: i + 1, serverTime: '2026-09-17T09:05:00.000Z' })));
  });

  it('PLANTED DEFECT: Move down that has to step over an unranked row now moves it', async () => {
    // The second shape. `[br_1('g'), br_2('n'), br_3(null)]`: Second's "down"
    // target is the tail, and before the ruling the only key available above
    // 'g' drew it BEFORE Third — an enabled button that spent an ingest and
    // changed nothing.
    const R1 = backlogRow('br_1', 'First', 'g');
    const R2 = backlogRow('br_2', 'Second', 'n');
    const R3 = backlogRow('br_3', 'Third', null);
    const captured: CapturedRank[] = [];
    // The reload answers with the ranks the move JUST produced, so the order
    // asserted below is the SERVER'S and not the client's optimistic override
    // surviving a stub that never changed its answer. A fixture that kept
    // returning the old rows would leave that assertion satisfied by the
    // override, which is a weaker claim than it reads as.
    let calls = 0;
    const services = servedWorld([R1, R2, R3], {
      getTickets: async (): Promise<TicketListView> => {
        calls += 1;
        if (calls === 1) return { projectId: PROJECT, rows: [R1, R2, R3] };
        const keys = new Map(captured.map((entry) => [entry.entityId, entry.rank as string] as const));
        return {
          projectId: PROJECT,
          rows: [R1, R2, R3].map((row) => {
            const key = keys.get(row.ticketId);
            return key === undefined ? row : { ...row, rank: key };
          }),
        };
      },
    });
    services.dataSource.ingest = async (events) => {
      for (const event of events) {
        captured.push({
          entityId: event.entity.id,
          type: event.type,
          rank: (event.payload as { rank?: unknown }).rank,
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
    await screen.findByText('Third');
    expect(backlogOrder()).toEqual(['br_1', 'br_2', 'br_3']);

    await userEvent.click(screen.getByRole('button', { name: 'Move Second down' }));

    await waitFor(() => expect(captured).toHaveLength(2));
    // The unranked row is ranked first, then the move — never the other way.
    expect(captured[0]?.entityId).toBe('br_3');
    expect(captured[1]?.entityId).toBe('br_2');
    expect((captured[1]?.rank as string) > (captured[0]?.rank as string)).toBe(true);
    await waitFor(() => expect(backlogOrder()).toEqual(['br_1', 'br_3', 'br_2']));
  });

  it('a PARTIAL application is reported and the list reloads to the server\'s own state', async () => {
    // The cost the owner accepted rather than waived. Half the batch commits;
    // the tab must NOT keep showing the order that was asked for, and the
    // person must be told. Reported on the transport channel, because part of
    // it committed — it is not a verdict.
    let reloads = 0;
    const services = servedWorld([U1, U2, U3, U4], {
      getTickets: async (): Promise<TicketListView> => {
        reloads += 1;
        return { projectId: PROJECT, rows: [U1, U2, U3, U4] };
      },
    });
    services.dataSource.ingest = async (events) =>
      events.map((event, index) =>
        index === 0
          ? { status: 'committed' as const, eventId: event.id, seq: 1, serverTime: '2026-09-17T09:05:00.000Z' }
          : { status: 'refused' as const, eventId: event.id, rule: 'some-rule', reason: 'Some reason.' },
      );

    render(
      <Providers services={services}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));
    await screen.findByText('Fourth');
    const before = reloads;

    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(rowTr('br_4'), { dataTransfer });
    fireEvent.dragOver(tailZone(), { dataTransfer });
    fireEvent.drop(tailZone(), { dataTransfer });

    expect(
      await screen.findByText('Only 1 of the 4 parts of this move reached the server — the list has been reloaded to match what the server holds.'),
    ).toBeInTheDocument();
    // Reloaded: the tab shows what the server holds, not what was asked for.
    await waitFor(() => expect(reloads).toBeGreaterThan(before));
    // Never dressed as a verdict — part of the batch committed.
    expect(screen.queryByText(/^Refused by the server/)).not.toBeInTheDocument();
  });
});
