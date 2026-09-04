import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Actor, ListRow, TicketListView } from '@gisik-nokma/app-core';
import type { TicketTypeDef } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { istToday } from '../src/ist-today.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 11.160–11.166 — the four-way `Board | List | Calendar | Timeline` chain, which
 * is Plan 6's Step 5b landed late by Plan 9's Task 14.
 *
 * The two questions this file exists for are the two the plan's snippet gets
 * wrong. First, `(list.rows ?? []).map(...)`: against the shipped server
 * `getTickets` REFUSES, so that spelling draws a complete month grid with
 * nothing in it — a page saying no ticket here has a claimed date. Second,
 * `today`: the plan's own note calls this line the single place the web client
 * decides which day it is, and an assertion about it is unfalsifiable unless the
 * instant is pinned, because `toISOString().slice(0, 10)` and `istToday()` agree
 * for eighteen and a half hours out of every twenty-four.
 */
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: 'ws_1', projectId: 'p_1' }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'user_kiro', name: 'Kiro' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

afterEach(() => {
  push.mockClear();
  vi.useRealTimers();
});

const MEMBERS: Actor[] = [{ id: 'user_kiro', name: 'Kiro' }];

function claim(value: unknown, actorId = 'user_kiro') {
  return {
    value,
    actorId,
    clientTime: '2026-08-19T10:00:00.000Z',
    serverTime: '2026-08-19T10:00:01.000Z',
  };
}

/** A `ListRow` exactly as `view-types.ts` declares it — no `as ListRow` anywhere. */
function row(overrides: Partial<ListRow> = {}): ListRow {
  const base: ListRow = {
    ticketId: 't_1',
    title: 'Restock the cold shelf',
    typeId: 'task',
    typeRank: 3,
    parentId: null,
    epicId: null,
    stateId: 'doing',
    stateName: 'Doing',
    stateCategory: 'active',
    stateProvenance: {
      actorId: 'user_kiro',
      actorName: 'Kiro',
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:01.000Z',
    },
    assignee: null,
    assignedProvenance: null,
    dueDate: null,
    fields: { title: claim('Restock the cold shelf') },
    rollup: null,
    hasRestrictedParent: false,
    // This shell is online-only, so nothing is ever in transit for it — the
    // same reason `online/mappers.ts` fills `BoardCard.pending` with `false`.
    pending: false,
  };
  return { ...base, ...overrides, fields: { ...base.fields, ...overrides.fields } };
}

function typeDef(overrides: Partial<TicketTypeDef> = {}): TicketTypeDef {
  return {
    id: 'task',
    name: 'Task',
    icon: 'check',
    rank: 3,
    workflowId: 'wf_basic',
    fields: [],
    ...overrides,
  };
}

/** The shipped-server state: the board answers, the list refuses by name. */
function servedList(rows: ListRow[], types: TicketTypeDef[] = [typeDef()]) {
  return stubServices({
    getBoard: async () => ({ projectId: 'p_1', groups: [] }),
    getAttention: async () => [],
    getMembers: async () => MEMBERS,
    getTicketTypes: async () => types,
    getTickets: async (): Promise<TicketListView> => ({ projectId: 'p_1', rows }),
  });
}

async function openTab(name: 'Calendar' | 'Timeline' | 'List') {
  await userEvent.click(await screen.findByRole('tab', { name }));
}

describe('the project page mounts four views over one list read', () => {
  it('11.160 offers all four tabs, with Board selected and each tab selected alone', async () => {
    render(
      <Providers services={servedList([row()])}>
        <ProjectPage />
      </Providers>,
    );
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Board', 'List', 'Calendar', 'Timeline']);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);

    await openTab('Timeline');
    expect(
      (await screen.findAllByRole('tab')).map((tab) => tab.getAttribute('aria-selected')),
    ).toEqual(['false', 'false', 'false', 'true']);
  });

  /**
   * 11.161/11.162 — THE CASE THE PLAN'S SNIPPET FAILS.
   *
   * `stubServices` refuses `getTickets` with the REAL `ServingGapError` the
   * shipped mapper throws, so this is the state a person opening the tab today
   * actually meets. `(list.rows ?? []).map(...)` renders a full month grid here.
   */
  it('11.161 the Calendar tab names the refusal instead of drawing an empty month', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => ({ projectId: 'p_1', groups: [] }),
          getAttention: async () => [],
          getMembers: async () => MEMBERS,
          getTicketTypes: async () => [typeDef()],
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await openTab('Calendar');

    const refusal = (await screen.findByText(/The calendar cannot be shown yet\./)).closest(
      '[role="status"]',
    );
    // The authority's own words, not a paraphrase: the gap names the field and
    // who closes it.
    expect(refusal?.textContent).toContain('ListRow.typeRank');
    // The half that makes the line above a test: no grid stands in its place.
    expect(document.querySelector('.gn-calendar')).toBeNull();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('11.162 the Timeline tab does the same, and names ITSELF rather than the list', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => ({ projectId: 'p_1', groups: [] }),
          getAttention: async () => [],
          getMembers: async () => MEMBERS,
          getTicketTypes: async () => [typeDef()],
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await openTab('Timeline');

    expect(await screen.findByText(/The timeline cannot be shown yet\./)).toBeInTheDocument();
    // Not the List tab's wording — a viewer on the Timeline tab is told which
    // view went missing, which is the whole job of `ShellRefusal`'s `what`.
    expect(screen.queryByText(/The ticket list cannot be shown yet\./)).not.toBeInTheDocument();
    expect(document.querySelector('.gn-timeline')).toBeNull();
  });

  it('11.163 draws a served claim, attributed with the roster name and not the raw id', async () => {
    // The instant is pinned for the same reason 11.164 pins it, in a weaker
    // register: `CalendarView` opens on `monthOf(today)`, so an unpinned clock
    // puts whatever month the machine is in on screen and an August claim is
    // simply not in the grid. Measured — this case failed exactly that way
    // before the line below.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-23T06:00:00.000Z'));
    render(
      <Providers
        services={servedList([
          row({ fields: { title: claim('DLT'), dueDate: claim({ date: '2026-08-30' }) } }),
        ])}
      >
        <ProjectPage />
      </Providers>,
    );
    await openTab('Calendar');
    // The model's own label shape: "needed by 30 Aug — Kiro's claim". The name
    // proves `getMembers` reached `userName`; an unresolved roster would print
    // `user_kiro`, which is narrower but visibly different.
    expect(
      await screen.findByRole('button', { name: "needed by 30 Aug — Kiro's claim" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /user_kiro/ })).not.toBeInTheDocument();
  });

  /**
   * 11.164 — THE DAY, PINNED AT AN IST-MIDNIGHT BOUNDARY.
   *
   * 2026-08-20T18:30:00.000Z is exactly 2026-08-21 00:00 in Asia/Kolkata. So the
   * IST day is the 21st while `toISOString().slice(0, 10)` — and any UTC-shaped
   * shortcut — still says the 20th. Asserting the ring on the 21st AND its
   * absence from the 20th is what makes this a test of `istToday` rather than of
   * whatever the wall clock happened to be: at any other instant of the day both
   * spellings agree and the case could not fail.
   */
  it('11.164 the today-ring is the IST day, at the instant the two spellings disagree', async () => {
    const instant = new Date('2026-08-20T18:30:00.000Z');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(instant);
    // The helper the page calls, on the same instant, as the expected value —
    // never a hand-typed '2026-08-21', which would be a second statement of the
    // rule under test.
    expect(istToday(() => instant)).toBe('2026-08-21');

    const { container } = render(
      <Providers services={servedList([row()])}>
        <ProjectPage />
      </Providers>,
    );
    await openTab('Calendar');
    await waitFor(() => expect(container.querySelector('[data-today="true"]')).not.toBeNull());

    expect(container.querySelector('[data-today="true"]')?.getAttribute('data-day')).toBe(
      '2026-08-21',
    );
    expect(container.querySelector('[data-day="2026-08-20"]')?.hasAttribute('data-today')).toBe(
      false,
    );
  });

  /**
   * 11.165 — the workspace's OWN rank-1 type reaches the views.
   *
   * `isEpicType` was accepted by both models since Tasks 8 and 10 and forwarded
   * by neither view until this change (11.158, 11.159). This is the other end of
   * that wire: the SHELL building the predicate from the type roster it already
   * reads. The fixture's rank-1 type is `initiative`, so with the predicate the
   * lane is headed "Registrations" and with app-core's built-in default it would
   * be "No epic" — the product disagreeing with the server, which groups by rank.
   */
  it('11.165 heads the timeline lane with a rank-1 "Initiative", not "No epic"', async () => {
    const initiative = row({
      ticketId: 'init_1',
      typeId: 'initiative',
      typeRank: 1,
      fields: { title: claim('Registrations') },
    });
    const child = row({
      ticketId: 't_child',
      parentId: 'init_1',
      fields: {
        title: claim('DLT'),
        startDate: claim({ date: '2026-08-24' }),
        dueDate: claim({ date: '2026-08-28' }),
      },
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-23T06:00:00.000Z'));

    render(
      <Providers
        services={servedList(
          [initiative, child],
          [typeDef(), typeDef({ id: 'initiative', name: 'Initiative', rank: 1, icon: 'flag' })],
        )}
      >
        <ProjectPage />
      </Providers>,
    );
    await openTab('Timeline');

    expect(await screen.findByRole('heading', { name: 'Registrations' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'No epic' })).toBeNull();
  });

  /**
   * 11.166 — the custom date field the mounting shell is the one place to resolve.
   *
   * `customDateClaimsOf` emits an entry only for a field the ticket's TYPE
   * declares, so a claim on `filed-on` is invisible until the shell resolves the
   * `TicketTypeDef` into `customDateFields`. Keyed per type, which is what stops
   * one type's date field being offered to every other type's tickets.
   */
  it('11.166 renders a custom date claim under its own field name', async () => {
    const dated = row({
      typeId: 'task',
      fields: { title: claim('Inspected'), 'filed-on': claim('2026-08-26', 'user_kiro') },
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-23T06:00:00.000Z'));

    render(
      <Providers
        services={servedList(
          [dated],
          [typeDef({ fields: [{ id: 'filed-on', name: 'Filed on', type: 'date' }] })],
        )}
      >
        <ProjectPage />
      </Providers>,
    );
    await openTab('Calendar');
    expect(
      await screen.findByRole('button', { name: "Filed on: 26 Aug — Kiro's claim" }),
    ).toBeInTheDocument();
  });

  it('11.167 leaves the Board and List arms exactly as they were — refusals, not spinners', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => ({ projectId: 'p_1', groups: [] }),
          getAttention: async () => [],
          getMembers: async () => MEMBERS,
          getTicketTypes: async () => [typeDef()],
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    // Step 5b's snippet writes `<p>{board.error ?? 'Loading…'}</p>` for both of
    // these arms; adopting it would have deleted `ShellRefusal` from the page on
    // the way past. The board is SERVED here, so it renders; the list refuses.
    await waitFor(() => expect(document.querySelector('.gn-board')).not.toBeNull());
    await openTab('List');
    const refusal = (await screen.findByText(/The ticket list cannot be shown yet\./)).closest(
      '[role="status"]',
    );
    expect(refusal?.textContent).toContain('ListRow.typeRank');
  });
});

describe('the roster is a convenience, never a gate', () => {
  it('11.168 still draws the claim when getMembers refuses, attributed to the raw actor id', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-23T06:00:00.000Z'));
    render(
      <Providers
        services={stubServices({
          getBoard: async () => ({ projectId: 'p_1', groups: [] }),
          getAttention: async () => [],
          getTicketTypes: async () => [typeDef()],
          getTickets: async (): Promise<TicketListView> => ({
            projectId: 'p_1',
            rows: [row({ fields: { title: claim('DLT'), dueDate: claim({ date: '2026-08-30' }) } })],
          }),
          getMembers: async () => {
            throw new Error('the roster is unavailable');
          },
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await openTab('Calendar');
    // Narrower than the truth, never wrong about it: an id is still the actor.
    // A refusal panel here would have put the calendar behind a read it does not
    // need in order to be correct.
    expect(
      await screen.findByRole('button', { name: "needed by 30 Aug — user_kiro's claim" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/cannot be shown yet/)).not.toBeInTheDocument();
  });

  /**
   * 11.186/11.187 — THE LOADING WINDOW, and why the refusal cases above do not
   * already cover it.
   *
   * This file's whole argument is that `(list.rows ?? []).map(...)` would draw a
   * complete month grid over a read that did not answer. 11.161/11.162 pin the
   * half of that where the read REFUSES. Nothing pinned the half where it has
   * simply not answered YET — and `useTicketList` documents `rows` as
   * `ListRow[] | null`, "`null` until the rows load", so that window is a real
   * state on every first paint, not a contrivance.
   *
   * Measured before these were written: deleting `list.rows !== null` from the
   * calendar arm (`) : list.rows !== null ? (` -> `) : true ? (`) leaves
   * **134/134 web tests green**, and the same deletion on the timeline arm also
   * leaves 134/134 green. The guard the page's own docblock argues for at
   * length was therefore unconstrained in both places.
   *
   * What that mutation renders is the exact sentence this product exists to not
   * say: "No claimed dates fall in this month. Undated work is absent, not
   * estimated" — an assertion about claims, made from a read that has not come
   * back. So the assertion here is deliberately two-sided: the loading state is
   * present AND the honest-empty copy is absent. Asserting only "Loading…"
   * would pass against a page that rendered both.
   *
   * `getTickets` returns a promise that never settles, which is the state
   * itself rather than a race: no `act` flush can advance past it.
   */
  it('11.186 the Calendar tab says it is loading — it does not draw an empty month over a read that has not answered', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => ({ projectId: 'p_1', groups: [] }),
          getAttention: async () => [],
          getMembers: async () => MEMBERS,
          getTicketTypes: async () => [typeDef()],
          getTickets: () => new Promise<TicketListView>(() => {}),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await openTab('Calendar');

    expect(await screen.findByText('Loading\u2026')).toBeInTheDocument();
    // The grid is not merely empty — it is not drawn at all.
    expect(document.querySelector('.gn-calendar')).toBeNull();
    // And the claim about claims is not made.
    expect(screen.queryByText(/Undated work is absent, not estimated/)).not.toBeInTheDocument();
    // Nor is this mistaken for a refusal: nothing failed.
    expect(screen.queryByText(/cannot be shown yet/)).not.toBeInTheDocument();
  });

  it('11.187 the Timeline tab does the same — the guard is per-arm, so one witness cannot cover both', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => ({ projectId: 'p_1', groups: [] }),
          getAttention: async () => [],
          getMembers: async () => MEMBERS,
          getTicketTypes: async () => [typeDef()],
          getTickets: () => new Promise<TicketListView>(() => {}),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await openTab('Timeline');

    expect(await screen.findByText('Loading\u2026')).toBeInTheDocument();
    expect(document.querySelector('.gn-timeline')).toBeNull();
    expect(screen.queryByText(/Undated work is absent, not estimated/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cannot be shown yet/)).not.toBeInTheDocument();
  });

});
