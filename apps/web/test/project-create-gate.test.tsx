import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TicketTypeDef } from '@gisik-nokma/domain';
import { EMPTY_BOARD_COPY, type BoardView, type TicketListView } from '@gisik-nokma/app-core';
import { HttpError } from '@gisik-nokma/app-core/online';
import { Providers } from '../src/providers.js';
import { EMPTY_PREFERENCES, stubServices } from './helpers/stub-services.js';

/**
 * ## WHAT THIS FILE EXISTS TO STOP THE NEW-TICKET CONTROL FROM SAYING
 *
 * Three claims the project page used to make with nothing to back any of them,
 * all of them inside a MODAL where a sentence rendered on the page behind it
 * cannot be read:
 *
 * 1. **"This project has no ticket that could be a parent."** `parentCandidates`
 *    was `(list.rows ?? []).map(…)` and `getTickets` REFUSED against the shipped
 *    server of the day (ruling P25 clause 1 has since served its five gaps; a
 *    read that fails for any other reason lands in the same place, which is why
 *    the case below stubs the failure rather than inheriting it), so `list.rows`
 *    is null and the picker offered *None
 *    (project root)* and nothing else — while the Board tab on the same page
 *    rendered the very tickets the picker said did not exist, because `getBoard`
 *    IS served. That pairing is asserted below: it is what makes the defect a
 *    contradiction rather than an opinion.
 * 2. **"These four are your ticket types."** `typeOptions` hardcoded
 *    `epic`/`story`/`task`/`sub-task` with nothing saying they were placeholders,
 *    while `GET /v1/workspaces/:workspaceId/ticket-types` has shipped since Plan
 *    5. A workspace whose types differ got a picker offering four it does not
 *    have, and `ticketTypeExists` then refused the CREATE — so the failure
 *    surfaced as a rejected write about the actor instead of a read this build
 *    could not perform.
 * 3. **"You may create a ticket."** `currentUserId` was `user?.id ?? ''` and
 *    `useCurrentUser()` answers null both while the session resolves AND when
 *    signed out, so the button was offered to a signed-out viewer and a fast
 *    click during the load window posted an event with an empty actor.
 *
 * Every case pairs the true thing PRESENT with the false thing ABSENT. Asserting
 * only the first passes just as well against a surface rendering both.
 */

const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';
const ANSELMA = '01J9USER000000000000000000';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: WORKSPACE, projectId: PROJECT }),
  usePathname: () => `/w/${WORKSPACE}/p/${PROJECT}`,
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * The session is a VARIABLE here, not a constant, because two of the three
 * states this file measures are states `useCurrentUser` collapses. `isPending`
 * is better-auth 1.7.2's own flag and `useSessionStatus` reads it; a mock that
 * only ever answered "signed in" would leave both other branches dark.
 */
type SessionAnswer = { data: { user: { id: string; name: string } } | null; isPending: boolean };
let session: SessionAnswer = { data: { user: { id: ANSELMA, name: 'Anselma Marak' } }, isPending: false };
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => session,
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage, { BUILTIN_LADDER_NOTICE } from '../app/w/[workspaceId]/p/[projectId]/page.js';

const PROVENANCE = {
  actorId: ANSELMA,
  actorName: 'Anselma Marak',
  clientTime: '2026-08-20T09:00:00.000Z',
  serverTime: '2026-08-20T09:00:01.000Z',
};

/**
 * A board that HAS a ticket, so "the picker says none exist" has a counterpart.
 *
 * ⚠ **THE CARD'S TYPE IS `task` AND IT WAS `epic` UNTIL 2026-09-20.** The
 * owner's ruling that day — *"epics should never show up in the board, timeline
 * and calendar views"* — makes an epic a card the board deliberately does not
 * draw, so an epic fixture would have made this file's central counterpart
 * ("the board renders a real ticket") render NOTHING, and 3.142's own claim
 * would have gone untested behind a fixture that had quietly stopped being
 * about a ticket. The property is unchanged and is why the fix is here rather
 * than in the page: the board must show a ticket it can draw, so the fixture
 * must carry one. `task` is on the same workflow (`wf-errands`) and is rank 3,
 * so nothing else about the fixture moves.
 */
const BOARD: BoardView = {
  projectId: PROJECT,
  groups: [
    {
      workflowId: 'wf-errands',
      workflowVersion: 1,
      workflowName: 'Errand',
      columns: [
        {
          stateId: 'doing',
          name: 'Doing',
          category: 'active',
          blocked: false,
          cards: [
            {
              ticketId: '01J9TICKET00000000000000TS',
              title: 'Rewire the shop sign',
              typeId: 'task',
              assignee: null,
              stateProvenance: PROVENANCE,
              // Ruling E5-2 made this REQUIRED on `BoardCard`; `null` is "this
              // ticket claims no date", the same default `boardCardSeed` uses.
              dueDate: null,
              cause: null,
              rollup: null,
              pending: false,
            },
          ],
        },
      ],
    },
  ],
};

const LIST: TicketListView = {
  projectId: PROJECT,
  rows: [
    {
      ticketId: '01J9TICKET00000000000000EP',
      title: 'Rewire the shop sign',
      typeId: 'epic',
      typeRank: 1,
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
      // This shell is online-only, so nothing is ever in transit — the same
      // `false` the board card above carries, for the same reason.
      pending: false,
      closed: null,
      rank: null,
    },
  ],
};

/**
 * The SERVER'S OWN types, not the built-in ladder — case 7.38
 * (`apps/server/test/routes/builder-reads.test.ts:250`) measures exactly these
 * against a real database: ordered by rank then id, with `chore` between `epic`
 * and `task`. Two of the four ladder entries (`Story`, `Sub-task`) are absent
 * from it and one entry (`Chore`) is absent from the ladder, which is what lets
 * a single render tell the two apart in both directions.
 */
const WORKSPACE_TYPES: TicketTypeDef[] = [
  { id: 'epic', name: 'Epic', icon: 'flag', rank: 1, workflowId: 'wf-errands', fields: [] },
  { id: 'chore', name: 'Chore', icon: 'broom', rank: 3, workflowId: 'wf-second', fields: [] },
  { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errands', fields: [] },
];

beforeEach(() => {
  session = { data: { user: { id: ANSELMA, name: 'Anselma Marak' } }, isPending: false };
});

afterEach(() => {
  push.mockClear();
});

/**
 * The dialog's Type and Parent pickers are the shared SEARCHABLE `Select` now, so their options
 * can no longer be read off the trigger: the trigger is an `<input role="combobox">` with no
 * `<option>` children of its own, and the rows exist only while the panel is OPEN, portal-rendered
 * into a `listbox` on `document.body` (`packages/ui/src/select/select.tsx`). A searchable `Select`
 * renders no `HiddenSelect` mirror either, so there is no always-present copy to read instead.
 *
 * Hence: open, read, close. Still the labels in order and printed rather than counted, which is
 * the whole point of these two helpers — `toEqual` on a printed list is simultaneously the pin and
 * its own control, and a failure names the options that were actually offered.
 *
 * `textContent` remains exactly the label: `SelectOptionRow` renders the selected row's check mark
 * as an `aria-hidden` `<svg>` carrying no text, and these options have no icon or description.
 */
async function optionLabels(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
): Promise<string[]> {
  await user.click(screen.getByRole('combobox', { name }));
  const listbox = await screen.findByRole('listbox');
  const labels = within(listbox)
    .getAllByRole('option')
    .map((option) => option.textContent ?? '');
  // Closed again before returning: there is one portal-rendered `listbox` for the whole document,
  // so a panel left open would make any later `findByRole('listbox')` in the same test ambiguous.
  await user.keyboard('{Escape}');
  return labels;
}

/** The type picker's option labels, in order, printed rather than counted. */
function typeOptionLabels(user: ReturnType<typeof userEvent.setup>): Promise<string[]> {
  return optionLabels(user, 'Type');
}

function parentOptionLabels(user: ReturnType<typeof userEvent.setup>): Promise<string[]> {
  return optionLabels(user, 'Parent');
}

describe('3.142 a refused ticket list is never rendered as "this project has no parents"', () => {
  /**
   * **The PRINCIPLE is unchanged; the MECHANISM moved, and that is the whole edit.**
   * A refused list must never render as "this project has no parents". It used to
   * satisfy that by withholding the New-ticket control entirely — which also blocked
   * creation at PROJECT ROOT, the one creation that never needed a parent. The page's
   * own docblock named that cost and accepted it on the premise that the refusal was
   * temporary and route-owned.
   *
   * That premise expired for the refusal a real customer meets: `LIST_TOO_LARGE_ABSENCE`
   * is a bound this client chose, and no route change clears it (12.382). So the control
   * is offered, and the parent picker — not the form — carries the refusal.
   */
  it('offers New ticket and names the missing parent list, rather than withholding the whole control', async () => {
    render(
      <Providers
        services={stubServices({
          // `getTickets` is left UNSTUBBED, so it rejects by name. It refused
          // by default here until ruling P25 clause 1 served its gaps; what the
          // case is about — a read that did not answer must not render as "this
          // project has no tickets" — is the same for either cause.
          getBoard: async () => BOARD,
          getTicketTypes: async () => WORKSPACE_TYPES,
        })}
      >
        <ProjectPage />
      </Providers>,
    );

    // The board renders the ticket. THIS is the counterpart that makes the old
    // `?? []` a contradiction and not merely an empty state.
    expect(await screen.findByText('Rewire the shop sign')).toBeInTheDocument();

    // The control IS offered now — creation at project root never needed the list.
    const user = userEvent.setup();
    const open = await screen.findByRole('button', { name: 'New ticket' });
    fireEvent.click(open);

    // And the half that keeps 3.142's claim true: there is no parent `<select>` at
    // all, so nothing can assert "this project has no parents". The reason stands
    // in its place. Measured before the original fix, when the picker DID render:
    // `PARENT OPTIONS: ['None (project root)']` — a lie with one option.
    //
    // **This assertion used to be one that could not fail**, and it is worth naming
    // because it looked like the strictest spelling available:
    //
    //     screen.queryByLabelText('Parent')?.querySelector('select') ?? null
    //
    // `queryByLabelText('Parent')` returns the `<select>` ITSELF (the label wraps the
    // control), so `.querySelector('select')` looks INSIDE it and finds nothing when
    // the picker is present — and the optional chain yields null when it is absent.
    // `null` in both states, for opposite reasons. Restoring the empty picker left it
    // green, and so did rendering the picker AND the reason together, which is the
    // one arrangement this case exists to forbid.
    //
    // Counted instead, over the dialog, because the number differs between the two
    // states where the old expression did not: Title has no select, Type has one, and
    // Parent adds a second only when the picker renders.
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryAllByRole('combobox')).toHaveLength(1);
    // The second half USED to read `within(dialog).queryByRole('option', { name: 'None (project
    // root)' })`, and that spelling had to go for the very reason the paragraphs above exist.
    // Both pickers are the shared searchable `Select` now, and its rows are portal-rendered onto
    // `document.body` only while the panel is OPEN — so an option query scoped `within(dialog)`
    // matches nothing in EITHER state, whether or not the parent picker is rendered. It would
    // have become a third spelling of the same defect this comment was written to record: an
    // assertion that is null for opposite reasons and therefore cannot fail.
    //
    // Named on the control instead of its contents. The count above still discriminates (Title is
    // a textbox, Type is the one combobox, Parent would add a second), and this names WHICH
    // combobox is missing, so the pair cannot be satisfied by a dialog that dropped the Type
    // picker and kept the Parent one.
    expect(within(dialog).queryByRole('combobox', { name: 'Parent' })).toBeNull();
    expect(
      screen.getByText(/the list of tickets that could be a parent cannot be shown/),
    ).toBeInTheDocument();

    // The type picker is untouched: types still gate creation, parents do not.
    expect(await typeOptionLabels(user)).toContain('Epic');
  });

  it('offers the real rows once the list ANSWERS, so the gate is not "never offer it"', async () => {
    // Without this control the case above passes for a page that withholds the
    // create flow unconditionally.
    render(
      <Providers
        services={stubServices({
          getBoard: async () => BOARD,
          getTickets: async () => LIST,
          getTicketTypes: async () => WORKSPACE_TYPES,
          getPreferences: async () => EMPTY_PREFERENCES,
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New ticket' }));
    // Still exactly these two, and still in this order, after the shared-Select migration: the
    // synthetic `{ value: '', label: 'None (project root)' }` option replaces the hand-written
    // `<option value="">` one-for-one at the head of the list rather than adding to it.
    expect(await parentOptionLabels(user)).toEqual(['None (project root)', 'Rewire the shop sign']);
    // The paired absence is the REASON, not the old refusal. `"…could be a parent, so
    // New ticket is not offered"` was deleted with `createRegion`'s list arm and is
    // produced by no source file now, so asserting it absent asserted nothing — it
    // could not have been present. This string can be.
    expect(
      screen.queryByText(/the list of tickets that could be a parent cannot be shown/),
    ).not.toBeInTheDocument();
  });
});

describe('3.158 a preferences failure does not claim the parent list cannot be shown', () => {
  /**
   * `parentCandidates` is built from `list.rows`; `list.error` is
   * `list.error ?? preferences.error` (`ticket-list.ts`). Keyed on the error, the
   * dialog told a user the tickets that could be a parent *"cannot be shown"* — and
   * offered a **preferences** 500 as the reason — while the rows sat there intact and
   * the very same page could have shown them. Two false statements at once, and the
   * state the stale-parent submit fired from.
   *
   * Keyed on `list.rows === null` it says only what it can see.
   */
  it('the rows are intact, so the picker is offered and the preferences error is not misused', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => BOARD,
          getTickets: async () => LIST,
          getTicketTypes: async () => WORKSPACE_TYPES,
          getPreferences: () =>
            Promise.reject(new HttpError(500, '/v1/me/preferences?workspaceId=w1')),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New ticket' }));

    // The true thing present...
    expect(await parentOptionLabels(user)).toEqual(['None (project root)', 'Rewire the shop sign']);
    // ...and the false one absent. Paired, as every case in this file is.
    expect(
      screen.queryByText(/the list of tickets that could be a parent cannot be shown/),
    ).not.toBeInTheDocument();
  });
});

describe('3.143 the type picker offers the WORKSPACE’s ticket types, not the built-in ladder', () => {
  it('shows what the workspace defines, and the ladder’s other two entries are absent', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => BOARD,
          getTickets: async () => LIST,
          getTicketTypes: async () => WORKSPACE_TYPES,
          getPreferences: async () => EMPTY_PREFERENCES,
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New ticket' }));

    // Read ONCE and asserted three times: opening the panel is now a real interaction, so three
    // separate reads would be three open/close cycles of the same list to no purpose.
    const typeLabels = await typeOptionLabels(user);
    // The whole list, in the server's order. `toEqual` is simultaneously the pin
    // and its own control: these, in this order, and no others. A `toContain`
    // would stay green for a page rendering the ladder AND the answer.
    expect(typeLabels).toEqual(['Epic', 'Chore', 'Task']);
    // Named individually as well, because the ladder shares `Epic` and `Task`
    // with this fixture: presence alone cannot tell the two apart.
    expect(typeLabels).not.toContain('Story');
    expect(typeLabels).not.toContain('Sub-task');
    // And the loading marker is gone, because this is an answer.
    expect(screen.queryByText(BUILTIN_LADDER_NOTICE)).not.toBeInTheDocument();
  });

  it('shows the ladder ONLY while the read is in flight, and says that is what it is', async () => {
    // Plan 6's Open question 7: "the built-in ladder remains only the LOADING
    // FALLBACK, since Plan 4's bootstrap guarantees the four built-ins exist as
    // real `ticket-type.defined` events in every workspace from its first
    // moment". A promise that never settles IS that window.
    render(
      <Providers
        services={stubServices({
          getBoard: async () => BOARD,
          getTickets: async () => LIST,
          getTicketTypes: () => new Promise<never>(() => undefined),
          getPreferences: async () => EMPTY_PREFERENCES,
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New ticket' }));
    expect(await typeOptionLabels(user)).toEqual(['Epic', 'Story', 'Task', 'Sub-task']);
    // The sentence that stops the ladder from passing itself off as the answer.
    expect(screen.getByText(BUILTIN_LADDER_NOTICE)).toBeInTheDocument();
  });

  it('a REFUSED types read withholds the control — the ladder does not stand in for an answer', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => BOARD,
          getTickets: async () => LIST,
          getTicketTypes: () => Promise.reject(new HttpError(404, `/v1/workspaces/${WORKSPACE}/ticket-types`)),
          getPreferences: async () => EMPTY_PREFERENCES,
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    expect(
      await screen.findByText(
        /This workspace’s ticket types, so New ticket is not offered could not be loaded/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/HTTP 404 for \/v1\/workspaces\/.*\/ticket-types/)).toBeInTheDocument();
    // Both falsehoods absent: no control, and no ladder shown as the answer.
    expect(screen.queryByRole('button', { name: 'New ticket' })).not.toBeInTheDocument();
    expect(screen.queryByText(BUILTIN_LADDER_NOTICE)).not.toBeInTheDocument();
  });
});

describe('3.144 the write door is never offered an empty actor', () => {
  const servedWorld = () =>
    stubServices({
      getBoard: async () => BOARD,
      getTickets: async () => LIST,
      getTicketTypes: async () => WORKSPACE_TYPES,
      getPreferences: async () => EMPTY_PREFERENCES,
    });

  it('WHILE THE SESSION RESOLVES: a wait state, not a button — the window a fast click used to post through', async () => {
    // `useCurrentUser()` answers null here AND when signed out, and the page
    // used to collapse both to `actorId: ''`. The event reached
    // `POST /v1/events` and `checkRolePermission` refused it
    // (`env.actorId !== ctx.sessionUserId`), so the person was told about their
    // PERMISSIONS when the truth was that this browser had not finished asking
    // who they were.
    session = { data: null, isPending: true };
    render(<Providers services={servedWorld()}><ProjectPage /></Providers>);
    expect(await screen.findByText('Preparing the New ticket form…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New ticket' })).not.toBeInTheDocument();
    expect(screen.queryByText('Sign in to create a ticket.')).not.toBeInTheDocument();
  });

  it('WHEN SIGNED OUT: the door is not offered, and the reason is the true one', async () => {
    session = { data: null, isPending: false };
    render(<Providers services={servedWorld()}><ProjectPage /></Providers>);
    expect(await screen.findByText('Sign in to create a ticket.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New ticket' })).not.toBeInTheDocument();
    // The two no-user states are DISTINGUISHED, which is the whole point of
    // reading `useSessionStatus` rather than `useCurrentUser`.
    expect(screen.queryByText('Preparing the New ticket form…')).not.toBeInTheDocument();
  });

  it('WHEN SIGNED IN: the control is offered, and the event it submits carries the real actor', async () => {
    const ingested: Array<{ actorId: string }> = [];
    const services = servedWorld();
    services.dataSource.ingest = async (events) => {
      for (const event of events) ingested.push({ actorId: event.actorId });
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-08-20T09:00:00.000Z',
      }));
    };
    render(<Providers services={services}><ProjectPage /></Providers>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New ticket' }));
    await user.type(screen.getByLabelText('Title'), 'Order the new sign');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    // The actor id, printed. `not.toBe('')` alone would pass for `undefined`.
    await waitFor(() => expect(ingested.map((event) => event.actorId)).toEqual([ANSELMA]));
  });
});

/**
 * 13.591f (backlog/closed spec §5.4, Task 9) — `parentCandidates`'s own
 * `inFocus` derivation, at the ONE site that computes it from real row data:
 * `page.tsx`'s `inFocus: row.stateId !== BACKLOG_STATE_ID && row.closed ===
 * null`. Nothing in `packages/app-core` can witness this — its own tests pass
 * `inFocus` in as a literal on the fixture, never derive it — so a wrong `!==`
 * or a dropped `row.closed === null` half here would ship with every gate
 * this task ran reporting green. Three rows, told apart only by the two facts
 * the formula reads: a BACKLOG row (`stateId: 'backlog'`, the reserved id —
 * dispatch context's own binding ruling — never closed), a plain ACTIVE row
 * (neither backlog nor closed — the one case that should show the checkbox),
 * and a CLOSED terminal row (not backlog, but closed). `typeRank`/`typeId`
 * copy `LIST.rows[0]`'s shape; only the three fields the formula reads differ
 * between rows.
 */
describe('13.591f the New-ticket dialog\'s "Start in focus" checkbox tracks a REAL row\'s state', () => {
  const BACKLOG_ROW = {
    ...LIST.rows[0]!,
    ticketId: '01J9TICKET0000000BACKLOG01',
    title: 'Sits in the backlog',
    stateId: 'backlog',
    stateName: 'Backlog',
    stateCategory: 'open' as const,
    closed: null,
  };
  const ACTIVE_ROW = {
    ...LIST.rows[0]!,
    ticketId: '01J9TICKET0000000ACTIVE001',
    title: 'Actively worked, never closed',
    stateId: 'doing',
    stateName: 'Doing',
    stateCategory: 'active' as const,
    closed: null,
  };
  const CLOSED_ROW = {
    ...LIST.rows[0]!,
    ticketId: '01J9TICKET0000000CLOSED001',
    title: 'Done, and closed',
    stateId: 'done',
    stateName: 'Done',
    stateCategory: 'terminal' as const,
    closed: { actorId: ANSELMA, at: '2026-09-17T09:00:00.000Z' },
  };
  const LIST_THREE: TicketListView = {
    projectId: PROJECT,
    rows: [BACKLOG_ROW, ACTIVE_ROW, CLOSED_ROW],
  };

  async function pickParent(user: ReturnType<typeof userEvent.setup>, title: string): Promise<void> {
    await user.click(screen.getByRole('combobox', { name: 'Parent' }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: title }));
  }

  it('13.591f a backlog row and a closed row both compute inFocus: false — only the plain active row shows the checkbox', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => BOARD,
          getTickets: async () => LIST_THREE,
          getTicketTypes: async () => WORKSPACE_TYPES,
          getPreferences: async () => EMPTY_PREFERENCES,
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New ticket' }));

    await pickParent(user, 'Sits in the backlog');
    expect(screen.queryByRole('checkbox', { name: 'Start in focus' })).not.toBeInTheDocument();

    await pickParent(user, 'Done, and closed');
    expect(screen.queryByRole('checkbox', { name: 'Start in focus' })).not.toBeInTheDocument();

    await pickParent(user, 'Actively worked, never closed');
    expect(screen.getByRole('checkbox', { name: 'Start in focus' })).toBeInTheDocument();
  });
});

/**
 * V1 (round-2 ruling, IMPORTANT, 2026-09-21) — the empty board's instruction and
 * its control, at the mount where the control had to be wired.
 *
 * `Board`'s empty state renders *"No tickets here yet — create one."* and a
 * "Create a ticket" button gated on `onCreateTicket`. **No caller in this app
 * passed it** — `grep -rn 'onCreateTicket=' apps/web/app apps/web/src` answered 0
 * across 63 files at the ruling — so the sentence instructed an action the page
 * made impossible from where it was read, while the control itself sat three
 * centimetres to the left in this header. The board's half of the fix is in
 * `packages/app-core/test/views/board.test.tsx` (V1); this is the shell's half:
 * the page lifts `CreateTicketFlow`'s open state and passes a real handler, so
 * the banner's button opens the SAME dialog the header's "New ticket" does.
 */
describe('V1 an empty project’s board offers the control its sentence names', () => {
  const emptyWorld = () =>
    stubServices({
      getBoard: async () => ({ projectId: PROJECT, groups: [] }),
      getTickets: async () => LIST,
      getTicketTypes: async () => WORKSPACE_TYPES,
      getPreferences: async () => EMPTY_PREFERENCES,
    });

  it('13.1162 the sentence is the pinned one, and its button opens the New-ticket dialog', async () => {
    session = { data: { user: { id: ANSELMA, name: 'Anselma Marak' } }, isPending: false };
    render(
      <Providers services={emptyWorld()}>
        <ProjectPage />
      </Providers>,
    );

    expect(await screen.findByText(EMPTY_BOARD_COPY)).toBeInTheDocument();
    const create = screen.getByRole('button', { name: 'Create a ticket' });
    // No dialog before the press — otherwise the assertion below would pass on a
    // page that opened one on load.
    expect(screen.queryByRole('combobox', { name: 'Parent' })).not.toBeInTheDocument();

    await userEvent.setup().click(create);

    // The SAME dialog the header's own trigger opens: its Parent picker is the
    // control that exists only inside it.
    expect(await screen.findByRole('combobox', { name: 'Parent' })).toBeInTheDocument();
  });
});
