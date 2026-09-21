import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListRow, RosterMember, TicketListView } from '@gisik-nokma/app-core';
import type { TicketTypeDef } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { istToday } from '../src/ist-today.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 11.160–11.166 — the four-way `Board | List | Calendar | Timeline` chain, which
 * is Plan 6's Step 5b landed late by Plan 9's Task 14.
 *
 * FIVE-WAY as of Task 10 (backlog/closed spec §5.4, 2026-09-17): `Backlog`
 * joined the rail, FIRST, ahead of `Board`. 11.160 and 13.430 below are the
 * only two cases in this file that name the tabs by fixed array position
 * (`viewTabs()`'s own callers) — both updated in place for the new count and
 * order rather than renumbered; every other case in this file addresses a
 * tab by NAME (`findByRole('tab', {name: …})`) and needed no change.
 *

 * The two questions this file exists for are the two the plan's snippet gets
 * wrong. First, `(list.rows ?? []).map(...)`: a REFUSED `getTickets` renders as
 * a complete month grid with nothing in it — a page saying no ticket here has a
 * claimed date. That sentence read "against the shipped server `getTickets`
 * REFUSES" until ruling P25 clause 1 served its five gaps; the read can still
 * fail, so the property is unchanged and the cases now stub the failure
 * EXPLICITLY (`REFUSED_LIST` below) rather than leaning on a default that has
 * gone. Second,
 * `today`: the plan's own note calls this line the single place the web client
 * decides which day it is, and an assertion about it is unfalsifiable unless the
 * instant is pinned, because `toISOString().slice(0, 10)` and `istToday()` agree
 * for eighteen and a half hours out of every twenty-four.
 */
/**
 * A `getTickets` that fails, stated in the case rather than inherited.
 *
 * `stubServices` used to refuse this read by default with the real
 * `ServingGapError`, and the three cases below asserted on `ListRow.typeRank` —
 * one of the five facts that gap named. Those facts are served now, so the
 * assertion had to change or become a check that cannot fail. What the cases are
 * ACTUALLY about is unchanged and is what they assert now: a read that did not
 * answer is named on screen, in the failed view's own words, with no grid or
 * lane standing in for it.
 */
const REFUSED_LIST = () =>
  Promise.reject(new Error('the ticket list read did not answer')) as Promise<never>;

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: 'ws_1', projectId: 'p_1' }),
  usePathname: () => '/w/ws_1/p/p_1',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * MUTABLE, because case 13.880 has to put this page in the LOADING window and
 * then let the session land — the transition is the whole of that case, and a
 * frozen mock cannot produce it. Every other case in this file sees the
 * signed-in value it always did, restored before each one.
 */
let mockSession: {
  data: { user: { id: string; name: string } } | null;
  isPending?: boolean;
} = { data: { user: { id: 'user_kiro', name: 'Kiro' } } };

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => mockSession,
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

beforeEach(() => {
  mockSession = { data: { user: { id: 'user_kiro', name: 'Kiro' } } };
});

afterEach(() => {
  push.mockClear();
  vi.useRealTimers();
});

/**
 * `role` is REQUIRED since 2026-09-18 (case 13.760) — `getMembers` answers
 * `RosterMember[]`, because the route has always sent a role per person and the
 * members screen draws it. These views read only the name.
 */
const MEMBERS: RosterMember[] = [{ id: 'user_kiro', name: 'Kiro', role: 'owner' }];

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
    closed: null,
    rank: null,
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
    getMembers: async () => MEMBERS,
    getTicketTypes: async () => types,
    getTickets: async (): Promise<TicketListView> => ({ projectId: 'p_1', rows }),
  });
}

async function openTab(name: 'Calendar' | 'Timeline' | 'List') {
  await userEvent.click(await screen.findByRole('tab', { name }));
}

/**
 * Scoped to `.gn-segmented`, not a bare `screen.findAllByRole('tab')`.
 *
 * RENAMED (board-prototype-port Task 2, 2026-09-16): the container was
 * `.gn-view-tabs` until this task restyled it onto the shared
 * `.gn-segmented`/`.gn-segmented__item` classes — same `role="tablist"`, same
 * four `role="tab"` children, only the class changed. `.gn-view-tabs` no
 * longer exists anywhere in this page's markup (see `page.tsx`'s own
 * docblock on the change), so a selector still pointed at it would have
 * thrown on a null container rather than reporting a readable failure.
 *
 * STALE AS OF the owner's `StyleToggle` move (2026-09-09): the second,
 * unrelated `role="tablist"` this scoping originally guarded against
 * (`AppNav`'s `StyleToggle`, Task 14, `aria-label="Style"`) no longer lives
 * on this page — it moved to `/account`, first becoming a plain `<select>`
 * and then, in Phase 2 Wave A, migrating onto the shared `Select` component
 * from `@gisik-nokma/ui` (whose trigger renders `role="button"`, not a
 * tablist, so this remains a non-issue either way it's shaped). The scope
 * is kept anyway rather than loosened back to a bare query: the view-tabs
 * tablist itself still carries no `aria-label` to disambiguate by name if a
 * future control ever adds a second tablist here again, and scoping by the
 * DOM container costs nothing today.
 */
async function viewTabs(): Promise<HTMLElement[]> {
  // BY ROLE, not by text, since Round 19b: `AppNav` now offers its own
  // "Board" link (a door to this same project's board from the nav) beside
  // this tablist's "Board" TAB, and `findByText` cannot tell a `link` from a
  // `tab` that happen to share a label — a screen reader can, from the role
  // each carries.
  await screen.findByRole('tab', { name: 'Board' });
  const container = document.querySelector('.gn-segmented') as HTMLElement;
  return within(container).getAllByRole('tab');
}

describe('the project page mounts four views over one list read', () => {
  it('11.160 offers all five tabs (Backlog first), with Board selected and each tab selected alone', async () => {
    render(
      <Providers services={servedList([row()])}>
        <ProjectPage />
      </Providers>,
    );
    const tabs = await viewTabs();
    // Task 10 (backlog/closed spec §5.4): Backlog joined the rail, FIRST — Board
    // stays the DEFAULT SELECTION regardless (the rail's order and the page's
    // default are independent facts; `page.tsx`'s own docblock on `view` says so).
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Backlog', 'Board', 'List', 'Calendar', 'Timeline']);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
      'false',
      'false',
    ]);

    await openTab('Timeline');
    expect((await viewTabs()).map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
      'false',
      'false',
      'true',
    ]);
  });

  /**
   * 13.430 — the tab rail is the SHARED segmented control, not a page-local
   * lookalike. `viewTabs()` already scopes by `.gn-segmented` (Task 2 of the
   * board-prototype-port renamed the container from `.gn-view-tabs`), so a
   * class-name typo or a reverted rename would already null out `container`
   * and throw before this case's own assertions run — this case adds the one
   * thing that check does not: that exactly the SELECTED tab, and only it,
   * carries `.gn-segmented__item--on`, driven from the same `view === tab`
   * expression that sets `aria-selected` (`page.tsx`), rather than two
   * comparisons that could drift apart.
   */
  it('13.430 the selected tab, and only it, carries gn-segmented__item--on', async () => {
    render(
      <Providers services={servedList([row()])}>
        <ProjectPage />
      </Providers>,
    );
    const onFlags = (tabs: HTMLElement[]) =>
      tabs.map((tab) => tab.classList.contains('gn-segmented__item--on'));

    // Order is Backlog, Board, List, Calendar, Timeline (Task 10) — Board (index 1) starts selected.
    expect(onFlags(await viewTabs())).toEqual([false, true, false, false, false]);

    await openTab('Calendar');
    expect(onFlags(await viewTabs())).toEqual([false, false, false, true, false]);
  });

  /**
   * 11.161/11.162 — THE CASE THE PLAN'S SNIPPET FAILS.
   *
   * `getTickets` is stubbed to FAIL, which is the state a person meets whenever
   * the read does not answer — a transport failure, a refusal, a 404 turned back
   * into an exception. `(list.rows ?? []).map(...)` renders a full month grid
   * here regardless of which one it was, which is the defect.
   */
  it('11.161 the Calendar tab names the refusal instead of drawing an empty month', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => ({ projectId: 'p_1', groups: [] }),
          getMembers: async () => MEMBERS,
          getTicketTypes: async () => [typeDef()],
          getTickets: REFUSED_LIST,
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await openTab('Calendar');

    const refusal = (await screen.findByText(/The calendar could not be loaded/)).closest(
      '[role="status"]',
    );
    // The CAUSE's own words, not a paraphrase — the shell reports what failed
    // and does not summarise it. This used to read `ListRow.typeRank`, one of
    // the five facts the serving gap named; those are served now, and asserting
    // on a gap that no longer fires would have been a check that cannot fail.
    expect(refusal?.textContent).toContain('the ticket list read did not answer');
    // The half that makes the line above a test: no grid stands in its place.
    expect(document.querySelector('.gn-calendar')).toBeNull();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('11.162 the Timeline tab does the same, and names ITSELF rather than the list', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => ({ projectId: 'p_1', groups: [] }),
          getMembers: async () => MEMBERS,
          getTicketTypes: async () => [typeDef()],
          getTickets: REFUSED_LIST,
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await openTab('Timeline');

    expect(await screen.findByText(/The timeline could not be loaded/)).toBeInTheDocument();
    // Not the List tab's wording — a viewer on the Timeline tab is told which
    // view went missing, which is the whole job of `ShellRefusal`'s `what`.
    expect(screen.queryByText(/The ticket list could not be loaded/)).not.toBeInTheDocument();
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
          getMembers: async () => MEMBERS,
          getTicketTypes: async () => [typeDef()],
          getTickets: REFUSED_LIST,
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
    const refusal = (await screen.findByText(/The ticket list could not be loaded/)).closest(
      '[role="status"]',
    );
    expect(refusal?.textContent).toContain('the ticket list read did not answer');
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
    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
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
   * say — the empty-month copy, whose opening has been "No claimed dates are
   * drawn in this month. Undated work is absent, not estimated" since
   * 2026-09-20 — an assertion about claims, made from a read that has not come
   * back. So the assertion here is deliberately two-sided: the loading state is
   * present AND the honest-empty copy is absent. Asserting only "Loading…"
   * would pass against a page that rendered both.
   *
   * ⚠ The quote above is kept current with the copy on purpose — it is a
   * description of what the mutation renders, so it rots the moment the copy
   * does. The ASSERTION below did not need touching, and that is the design:
   * it pins the substring that is the reference's honesty note and has not
   * moved, not the sentence's opening.
   *
   * `getTickets` returns a promise that never settles, which is the state
   * itself rather than a race: no `act` flush can advance past it.
   */
  it('11.186 the Calendar tab says it is loading — it does not draw an empty month over a read that has not answered', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => ({ projectId: 'p_1', groups: [] }),
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
    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
  });

  it('11.187 the Timeline tab does the same — the guard is per-arm, so one witness cannot cover both', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => ({ projectId: 'p_1', groups: [] }),
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
    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
  });

});

/**
 * The nav item's project, witnessed at the PAGE level because that is where the
 * defect this case forbids actually lives.
 *
 * `AppNav` is rendered INSIDE this page's JSX, so `LastProjectNav`'s effect is a
 * DESCENDANT of `ProjectBoard`'s `useLastProject` write — and React commits
 * passive effects CHILD-FIRST, which was measured here rather than taken from
 * the docs: a probe rendering a parent with one child logged
 * `["child","parent"]`. So the nav reads storage BEFORE the page writes the
 * project it just opened, and without the route id the item names whatever was
 * there before. It self-heals one navigation later, which is what makes it easy
 * to miss: it is wrong exactly on the arrival that matters.
 *
 * The fixture is built so that the FALLBACK cannot produce the passing answer
 * either — `p_other` is served FIRST, so an implementation that ignored both
 * storage and the route would name Omega, and one that read only storage would
 * name Omega too. Only reading the route names Alpha.
 */
describe('the nav item follows the route it is on', () => {
  it('13.879 names the project in the route, not the one storage still holds', async () => {
    window.localStorage.setItem(
      'gn-last-project',
      JSON.stringify({ userId: 'user_kiro', workspaceId: 'ws_1', projectId: 'p_other' }),
    );

    render(
      <Providers
        services={stubServices({
          getBoard: async () => ({ projectId: 'p_1', groups: [] }),
          getMembers: async () => MEMBERS,
          getTicketTypes: async () => [typeDef()],
          getTickets: async (): Promise<TicketListView> => ({ projectId: 'p_1', rows: [row()] }),
          getMyWorkspaces: async () => [
            {
              id: 'ws_1',
              name: 'Convenience Corner',
              prefix: 'CC',
              role: 'owner',
              memberCount: 1,
              nameRestrictedProjectCount: 0,
              projects: [
                { id: 'p_other', name: 'Omega', prefix: 'OM', archived: false, ticketCount: null, blockedCount: null },
                { id: 'p_1', name: 'Alpha', prefix: 'AL', archived: false, ticketCount: null, blockedCount: null },
              ],
            },
          ],
        })}
      >
        <ProjectPage />
      </Providers>,
    );

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute(
        'href',
        '/w/ws_1/p/p_1',
      ),
    );
    expect(screen.queryByRole('link', { name: 'Omega' })).toBeNull();
  });
});

/**
 * The remembered tab (owner, 2026-09-18): *"on click, open the project page
 * (save the last open tab as well)"*.
 *
 * The memory is GLOBAL — the owner answered that directly — so it applies
 * whenever a project opens, not only when you arrive through the nav item. That
 * is why the cases below live here, on the page, and not in
 * `last-project-nav.test.tsx`: this file is where a project page is mounted
 * with no nav item involved at all.
 *
 * ## These cases could not have been written before, and the reason is a real
 * ## hazard rather than a technicality
 *
 * The page now WRITES to `localStorage` on every tab change, so every earlier
 * case in this file (and in the eight other files that mount this page) leaves
 * a record behind for the next one. `test/setup.ts` clears STORAGE before every
 * case for exactly that reason; without it, whether `11.160` above sees Board
 * selected would depend on which tab an earlier case happened to click.
 *
 * **Storage only — it does NOT clear the module caches, and an earlier draft of
 * this very comment said it did.** `setup.ts` imports nothing from `src/` (its
 * own docblock records the measured reason: doing so silently defeated
 * `vi.mock` in every file that mocks the auth client), so the `clear*Cache`
 * functions are out of its reach and each case's own file calls them. The
 * distinction matters here because this file's cases vary the SESSION as well
 * as storage, and a reader who believed the caches were cleared between cases
 * would stop asking whether a first frame can come from a previous case. Case
 * 13.880 is the one that would notice.
 */
describe('the remembered tab', () => {
  /** The label of the one tab carrying `aria-selected="true"`. */
  async function selectedTab(): Promise<string | undefined> {
    const tabs = await viewTabs();
    return tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent;
  }

  /**
   * 13.874 — the page OPENS at the remembered tab.
   *
   * `waitFor` rather than a bare read, and that is the honest shape: the seed
   * is applied by an effect, because a `useState` initialiser reading storage
   * would answer `null` on the server and then disagree with the client at
   * hydration — the same reason `theme-toggle.tsx` reads `gn-theme` in one.
   * Without the seed this case never settles on Timeline and times out.
   */
  it('13.874 opens at the tab remembered for this project', async () => {
    window.localStorage.setItem(
      'gn-project-tabs',
      JSON.stringify({ userId: 'user_kiro', tabs: { p_1: 'timeline' } }),
    );
    render(
      <Providers services={servedList([row()])}>
        <ProjectPage />
      </Providers>,
    );

    await waitFor(async () => expect(await selectedTab()).toBe('Timeline'));
  });

  /**
   * 13.875 — switching a tab WRITES it, and a fresh mount opens on it.
   *
   * Both halves matter and neither implies the other: a page that seeded from
   * storage but never wrote would forget the moment you navigated away, and one
   * that wrote but never seeded would store a tab it never used. The remount is
   * a real second mount of the same component against the same storage, which
   * is what a navigation to another page and back produces.
   */
  it('13.875 writes the tab on switch, and the next mount opens on it', async () => {
    const first = render(
      <Providers services={servedList([row()])}>
        <ProjectPage />
      </Providers>,
    );
    await openTab('Calendar');

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('gn-project-tabs') as string)).toEqual({
        userId: 'user_kiro',
        tabs: { p_1: 'calendar' },
      }),
    );

    first.unmount();
    render(
      <Providers services={servedList([row()])}>
        <ProjectPage />
      </Providers>,
    );

    await waitFor(async () => expect(await selectedTab()).toBe('Calendar'));
  });

  /**
   * 13.876 — a DIFFERENT project's remembered tab does not decide this one's,
   * and writing this one's does not disturb it.
   *
   * The map is per project. The fixture is a record that exists but names
   * another project, which is what makes it discriminating in BOTH directions:
   * a page that read the map without looking up the id — one remembered tab for
   * everything — would open on Timeline here and still pass 13.874, and a
   * writer that replaced the whole map instead of merging one entry would drop
   * `p_other` when the List tab is chosen.
   *
   * The write is asserted as a MAP of two entries rather than only as `p_1`'s,
   * because that is the difference: `rememberProjectTab` reads the existing map
   * back so this project's entry JOINS it.
   */
  it('13.876 opens at Board with nothing remembered for this project, and keeps another project’s entry', async () => {
    window.localStorage.setItem(
      'gn-project-tabs',
      JSON.stringify({ userId: 'user_kiro', tabs: { p_other: 'timeline' } }),
    );
    render(
      <Providers services={servedList([row()])}>
        <ProjectPage />
      </Providers>,
    );

    const tabs = await viewTabs();
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
      'false',
      'false',
    ]);

    await openTab('List');

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('gn-project-tabs') as string)).toEqual({
        userId: 'user_kiro',
        tabs: { p_other: 'timeline', p_1: 'list' },
      }),
    );
  });

  /**
   * 13.880 — a tab chosen while the session is still LOADING is not reverted
   * when the session lands.
   *
   * The rail is not gated on the session: the page's main return is
   * unconditional and nothing between it and the tablist asks what
   * `session.kind` is, so the tabs are clickable during the one network round
   * trip the session read takes. In that window `tabUserId` is `null`, so
   * `setView` writes nothing — and the seed effect, whose dependency
   * `tabUserId` is, then RE-RUNS when the session resolves and applies the
   * stored tab over the choice the person just made.
   *
   * The stored tab is deliberately a different one from the click: with
   * `calendar` in storage, a click on List is reverted to Calendar by the
   * resolving session, which is the visible half of this defect. The invisible
   * half — the click's own write is dropped, because there is no user to key it
   * by — is NOT fixed here and is recorded in the catalogue as a known
   * limitation rather than papered over.
   */
  it('13.880 keeps a tab chosen while the session was still loading', async () => {
    window.localStorage.setItem(
      'gn-project-tabs',
      JSON.stringify({ userId: 'user_kiro', tabs: { p_1: 'calendar' } }),
    );
    mockSession = { data: null, isPending: true };
    const services = servedList([row()]);
    const { rerender } = render(
      <Providers services={services}>
        <ProjectPage />
      </Providers>,
    );

    await openTab('List');

    // The session lands. `tabUserId` goes null -> 'user_kiro', which is the
    // dependency that re-runs the seed.
    mockSession = { data: { user: { id: 'user_kiro', name: 'Kiro' } } };
    rerender(
      <Providers services={services}>
        <ProjectPage />
      </Providers>,
    );

    await waitFor(async () => expect(await selectedTab()).toBe('List'));
  });

  /**
   * 13.877 — opening a project is what REMEMBERS it, keyed by user AND
   * workspace.
   *
   * The counterpart of 13.427 one level up ("opening a workspace is what
   * remembers it"), and the write the nav item's READ depends on: without it
   * the nav's "last open project" would only ever update when you arrived
   * through the nav item itself, which is the one route that does not need it.
   *
   * The workspace id is asserted because it is the half the sibling hook has no
   * analogue for — a project id is unique inside its workspace and meaningless
   * outside it, so a record missing it would resolve `p_1` inside whichever
   * workspace the viewer happened to be standing in.
   */
  it('13.877 records the opened project, keyed by user and workspace', async () => {
    render(
      <Providers services={servedList([row()])}>
        <ProjectPage />
      </Providers>,
    );
    await viewTabs();

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('gn-last-project') as string)).toEqual({
        userId: 'user_kiro',
        workspaceId: 'ws_1',
        projectId: 'p_1',
      }),
    );
  });
});
