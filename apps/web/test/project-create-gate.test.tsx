import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TicketTypeDef } from '@gisik-nokma/domain';
import type { BoardView, TicketListView } from '@gisik-nokma/app-core';
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
 *    was `(list.rows ?? []).map(…)` and `getTickets` REFUSES against the shipped
 *    server, so `list.rows` is null forever and the picker offered *None
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

/** A board that HAS a ticket, so "the picker says none exist" has a counterpart. */
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
              ticketId: '01J9TICKET00000000000000EP',
              title: 'Rewire the shop sign',
              typeId: 'epic',
              assignee: null,
              stateProvenance: PROVENANCE,
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

/** The type `<select>`'s option labels, in order, printed rather than counted. */
function typeOptionLabels(): string[] {
  const picker = screen.getByLabelText('Type');
  return within(picker).getAllByRole('option').map((option) => option.textContent ?? '');
}

function parentOptionLabels(): string[] {
  const picker = screen.getByLabelText('Parent');
  return within(picker).getAllByRole('option').map((option) => option.textContent ?? '');
}

describe('3.142 a refused ticket list is never rendered as "this project has no parents"', () => {
  it('withholds the New-ticket control and names the read — while the board shows the tickets the picker used to deny', async () => {
    render(
      <Providers
        services={stubServices({
          // `getTickets` refuses BY DEFAULT here: it is one of the six, and this
          // is the exact state the shipped server puts this page in.
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

    // The refusal names the parent read AND says what it cost.
    expect(
      await screen.findByText(
        /The tickets that could be a parent, so New ticket is not offered cannot be shown yet\./,
      ),
    ).toBeInTheDocument();

    // The half that makes those a test: the control that would have lied is not
    // on the page at all, so no dialog can be opened to be told there are no
    // parents. Measured before the fix: `PARENT OPTIONS: ['None (project root)']`.
    expect(screen.queryByRole('button', { name: 'New ticket' })).not.toBeInTheDocument();
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
    await userEvent.setup().click(await screen.findByRole('button', { name: 'New ticket' }));
    expect(parentOptionLabels()).toEqual(['None (project root)', 'Rewire the shop sign']);
    expect(screen.queryByText(/could be a parent, so New ticket is not offered/)).not.toBeInTheDocument();
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
    await userEvent.setup().click(await screen.findByRole('button', { name: 'New ticket' }));

    // The whole list, in the server's order. `toEqual` is simultaneously the pin
    // and its own control: these, in this order, and no others. A `toContain`
    // would stay green for a page rendering the ladder AND the answer.
    expect(typeOptionLabels()).toEqual(['Epic', 'Chore', 'Task']);
    // Named individually as well, because the ladder shares `Epic` and `Task`
    // with this fixture: presence alone cannot tell the two apart.
    expect(typeOptionLabels()).not.toContain('Story');
    expect(typeOptionLabels()).not.toContain('Sub-task');
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
    await userEvent.setup().click(await screen.findByRole('button', { name: 'New ticket' }));
    expect(typeOptionLabels()).toEqual(['Epic', 'Story', 'Task', 'Sub-task']);
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
        /This workspace’s ticket types, so New ticket is not offered cannot be shown yet\./,
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
