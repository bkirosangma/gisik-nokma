import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import type { MyWorkView, TicketRead, WorkItem } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 3.162 — the My work page can OPEN a ticket from the "Shared with me" section.
 *
 * ## Why this file exists rather than a component-level case
 *
 * `MyWork` (the app-core view) renders the button and calls `onOpenTicket` with
 * a ticket id; the PAGE is what turns that id into a ticket on screen, and a
 * `?ticket=` param names no project. So the page looks the id up in the view to
 * recover its `projectId`, and the defect this case pins lived entirely in that
 * lookup — no component test can reach it, because `MyWork` was already calling
 * `onOpenTicket` correctly.
 *
 * **The defect, found by review after the section had shipped green.** The
 * resolver searched `assigned` and `inTransit` and NOT `shared`. A shared errand
 * is typically not assigned to the viewer — that is the entire reason the
 * section exists — so `find` returned `undefined`, the guard swallowed it, and
 * the button was a dead click: no navigation, no error, no way for a user to
 * distinguish it from a slow page. The most reachable instance is also the least
 * suspicious: an OWNER, whose `projectName` is never withheld, clicking a ticket
 * shared with them that nobody assigned.
 *
 * ## ⚠ WHAT THE OWNER'S 2026-09-23 REQUEST CHANGED ABOUT THIS CASE
 *
 * *"opening a ticket from my work should open the sheet on the my work page, not
 * redirect to the project page."* The click no longer pushes
 * `/w/:ws/p/:projectId?ticket=…`; it opens the sheet in place, and **the project
 * the resolver recovers is now what the sheet is TOLD** — the name over the
 * ticket and the address its breadcrumb links to — rather than what the URL
 * said.
 *
 * So this case got STRONGER rather than merely different, and the mechanism is
 * the locator trap below: a resolver that still missed `shared` would fall
 * through to `ticketLocation.locate`, and the fixture's locator answers the
 * ASSIGNED card's project. The wrong answer is therefore reachable and asserted
 * against, instead of being a dead click.
 */

const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT_SHOPFLOOR = '01J9PROJECTSHOPFLOOR000000';
const PROJECT_SIBLING = '01J9PROJECTSIBLING00000000';
const WORKSPACE_NAME = 'Garo Hills Logistics';
const SHOPFLOOR_NAME = 'Shop floor';
const SIBLING_NAME = 'Sibling project';

const TICKET_ASSIGNED = '01J9TICKETASSIGNED00000000';
const TICKET_SHARED = '01J9TICKETSHARED0000000000';
const TICKET_CONTESTED = '01J9TICKETCONTESTED0000000';

const ASSIGNED_TITLE = 'File the GST return';
const SHARED_TITLE = 'Countersign the sibling lease';
const CONTESTED_TITLE = 'Renew the shop licence';

const ANSELMA = '01J9USER000000000000000000';

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: WORKSPACE }),
  usePathname: () => `/w/${WORKSPACE}/my-work`,
  useSearchParams: () => searchParams,
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: ANSELMA, name: 'Anselma Marak' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import MyWorkPage from '../app/w/[workspaceId]/my-work/page.js';

const claim = {
  actorId: ANSELMA,
  actorName: 'Anselma Marak',
  clientTime: '2026-08-19T09:58:12.000Z',
  serverTime: '2026-08-19T10:00:00.000Z',
  cause: null,
};

function item(overrides: Partial<WorkItem>): WorkItem {
  return {
    ticketId: TICKET_SHARED,
    workspaceId: WORKSPACE,
    projectId: PROJECT_SIBLING,
    projectName: SIBLING_NAME,
    title: SHARED_TITLE,
    stateId: 'todo',
    stateName: 'To do',
    stateCategory: 'open',
    stateProvenance: claim,
    dueDate: null,
    ...overrides,
  };
}

/**
 * ⚠ A FULL `TicketState`, not a cast. The two arguments that matter here are
 * `fields.title` — the sheet reads the title through `read.data.ticket.fields`,
 * and an absent `fields` takes the whole page down with
 * `Cannot read properties of undefined (reading 'dueDate')` from
 * `dateClaimOf`, which reads as a broken page rather than a thin fixture — and
 * the workflow pair, which the sheet's state chip resolves through.
 */
function ticketRead(id: string, title: string, projectId: string): TicketRead {
  const ticket: TicketState = {
    kind: 'ticket',
    id,
    workspaceId: WORKSPACE,
    projectId,
    typeId: 'task',
    parentId: null,
    workflowId: 'wf-errand',
    workflowVersion: 1,
    stateId: 'todo',
    stateCategory: 'open',
    assigneeId: null,
    collaboratorIds: [],
    fields: {
      title: {
        value: title,
        actorId: ANSELMA,
        clientTime: '2026-08-19T09:58:12.000Z',
        serverTime: '2026-08-19T10:00:00.000Z',
      },
    },
    transitions: [],
    closed: null,
    rank: null,
    reopenedAt: null,
    deleted: null,
  };
  return {
    ticket,
    title,
    stateProvenance: claim,
    assignedProvenance: null,
    visibility: null,
    parent: null,
    rollup: null,
    key: null,
    epic: null,
  };
}

/** The three tickets this file's views can name, each with its own project. */
function ticketFor(id: string): TicketRead {
  if (id === TICKET_SHARED) return ticketRead(id, SHARED_TITLE, PROJECT_SIBLING);
  if (id === TICKET_CONTESTED) return ticketRead(id, CONTESTED_TITLE, PROJECT_SIBLING);
  return ticketRead(id, ASSIGNED_TITLE, PROJECT_SHOPFLOOR);
}

function workspaceRow() {
  return {
    id: WORKSPACE,
    name: WORKSPACE_NAME,
    prefix: 'GH',
    role: 'owner',
    archived: false,
    memberCount: 1,
    nameRestrictedProjectCount: 0,
    projects: [
      {
        id: PROJECT_SHOPFLOOR,
        name: SHOPFLOOR_NAME,
        prefix: 'SF',
        archived: false,
        ticketCount: 1,
        blockedCount: 0,
      },
      {
        id: PROJECT_SIBLING,
        name: SIBLING_NAME,
        prefix: 'ET',
        archived: false,
        ticketCount: 1,
        blockedCount: 0,
      },
    ],
  };
}

/**
 * THE TRAP. A locator that answers the ASSIGNED card's project is the
 * wrong-project answer this case was written about — a shared ticket whose sheet
 * arrives wearing the first list's project. It is a `vi.fn` so the case can also
 * assert it was never asked, which is the difference between "the resolver found
 * `shared`" and "the resolver asked somebody who guessed right".
 */
const trapLocate = vi.fn(async () => ({
  workspaceId: WORKSPACE,
  projectId: PROJECT_SHOPFLOOR,
}));

function mount(view: MyWorkView) {
  return stubServices(
    {
      getMyWork: async () => view,
      getAttention: async () => [],
      getTicket: async (_workspaceId, ticketId) => ticketFor(ticketId),
      getTicketAttachments: async () => [],
      getMyWorkspaces: async () => [workspaceRow()],
    },
    { ticketLocation: { locate: trapLocate } },
  );
}

/** Land the router on the ticket the click named, the way `push` would. */
function landOn(ticketId: string) {
  searchParams = new URLSearchParams({ ticket: ticketId });
}

beforeEach(() => {
  push.mockClear();
  searchParams = new URLSearchParams();
  trapLocate.mockClear();
});

afterEach(() => {
  clearWorkspaceNameCache();
});

describe('3.162 My work opens a ticket from the Shared with me section', () => {
  it('3.162 the shared ticket’s OWN project reaches the sheet — the id resolves through `shared`, not only `assigned`', async () => {
    const shared = item({});
    const assignedOne = item({
      ticketId: TICKET_ASSIGNED,
      projectId: PROJECT_SHOPFLOOR,
      projectName: SHOPFLOOR_NAME,
      title: ASSIGNED_TITLE,
    });
    const services = mount({
      assigned: [assignedOne],
      inTransit: [],
      contested: [],
      shared: [shared],
    });

    const view = render(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    const region = await screen.findByRole('region', { name: 'Shared with me' });
    await userEvent.click(
      await within(region).findByRole('button', { name: SHARED_TITLE }),
    );

    // The click opens it HERE — the owner's request, and the precondition for
    // everything below: the sheet that answers must be this page's.
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/w/${WORKSPACE}/my-work?ticket=${TICKET_SHARED}`,
        { scroll: false },
      ),
    );
    expect(push).toHaveBeenCalledTimes(1);

    landOn(TICKET_SHARED);
    view.rerender(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    const sheet = await screen.findByRole('dialog');
    const title = await within(sheet).findByLabelText('Ticket title');
    expect(title).toHaveValue(SHARED_TITLE);

    // THE WHOLE CLAIM, now carried by the breadcrumb rather than by the URL.
    // The sheet's project crumb is an ADDRESS, so a resolver that fell through
    // to the first list cannot pass by naming things plausibly.
    const bar = await screen.findByRole('navigation', { name: 'Ticket location' });
    expect(within(bar).getByRole('link', { name: SIBLING_NAME })).toHaveAttribute(
      'href',
      `/w/${WORKSPACE}/p/${PROJECT_SIBLING}`,
    );
    expect(within(bar).queryByRole('link', { name: SHOPFLOOR_NAME })).toBeNull();

    // …AND IT WAS NOT LUCK. The locator would have answered the SHOP FLOOR
    // project — the wrong answer — so its silence is what makes the crumb above
    // a measurement of the resolver rather than of a gateway.
    expect(trapLocate).not.toHaveBeenCalled();

    // CONTROL, same render: the assigned card routes too, so the assertion above
    // is about `shared` being reachable rather than about the page having
    // started working at all. Its own project, not the shared one's.
    push.mockClear();
    searchParams = new URLSearchParams();
    const assignedRegion = screen.getByRole('region', { name: 'Assigned to me' });
    await userEvent.click(
      within(assignedRegion).getByRole('button', { name: ASSIGNED_TITLE }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/w/${WORKSPACE}/my-work?ticket=${TICKET_ASSIGNED}`,
        { scroll: false },
      ),
    );

    landOn(TICKET_ASSIGNED);
    view.rerender(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );
    const assignedBar = await screen.findAllByRole('navigation', { name: 'Ticket location' });
    expect(
      within(assignedBar[assignedBar.length - 1]!).getByRole('link', { name: SHOPFLOOR_NAME }),
    ).toHaveAttribute('href', `/w/${WORKSPACE}/p/${PROJECT_SHOPFLOOR}`);
    expect(trapLocate).not.toHaveBeenCalled();
  });
});

/**
 * V5 (round-2 ruling, IMPORTANT, 2026-09-21) — the CONTESTED section's click.
 *
 * The page's resolver searched `assigned`, `inTransit` and `shared` under a
 * comment reading *"Every section this component renders a title button for must
 * be resolvable here, and that is now all four."* **Three arms.** `contested` is
 * the fourth, its rows carry no `projectId` at all (`ContestedClaim` has a
 * `ticketId` and no project), so the lookup could never place one and the title
 * button — the one affordance on a contested row that looks like every other
 * section's — did nothing: no navigation, no error, indistinguishable from a
 * slow page.
 *
 * The fix has two halves and both are asserted here: the contested id is placed
 * by asking the server (`ticketLocation.locate`, the same one-shot gateway the
 * inbox uses), and a ticket the server will NOT place says so instead of
 * clicking into silence.
 *
 * ⚠ **2026-09-23: "placed" now means the sheet opens in place**, so the arm that
 * used to read the project off the URL reads it off the sheet's own breadcrumb.
 * The second arm is unchanged in substance — a refusal is still a sentence and
 * still no sheet — with one addition the new design makes necessary: the click
 * DOES set the param now (the param is the request; the sentence is the answer),
 * so the assertion is that no sheet follows and no project page is navigated to,
 * rather than that the router was never called.
 */
describe('V5 My work opens a contested claim, or says why it cannot', () => {
  const contestedView = (): MyWorkView => ({
    assigned: [],
    inTransit: [],
    shared: [],
    contested: [
      {
        ticketId: TICKET_CONTESTED,
        title: CONTESTED_TITLE,
        rule: 'state.terminal',
        reason: 'the ticket is already closed',
        claim: {
          actorId: ANSELMA,
          clientTime: '2026-08-19T09:58:12.000Z',
          contestedAt: '2026-08-19T10:00:00.000Z',
        },
      },
    ],
  });

  it('13.1163 opens the contested ticket in place, its project asked of the locator', async () => {
    const locate = vi.fn(async () => ({
      workspaceId: WORKSPACE,
      projectId: PROJECT_SIBLING,
    }));
    const services = stubServices(
      {
        getMyWork: async () => contestedView(),
        getAttention: async () => [],
        getTicket: async (_workspaceId, ticketId) => ticketFor(ticketId),
        getTicketAttachments: async () => [],
        getMyWorkspaces: async () => [workspaceRow()],
      },
      { ticketLocation: { locate } },
    );
    const view = render(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    const region = await screen.findByRole('region', { name: 'My contested claims' });
    await userEvent.click(
      await within(region).findByRole('button', { name: CONTESTED_TITLE }),
    );

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/w/${WORKSPACE}/my-work?ticket=${TICKET_CONTESTED}`,
        { scroll: false },
      ),
    );

    // ⚠ THE LANDING COMES BEFORE THE ASK, and that is the design rather than a
    // test artefact: the param is what names the open ticket, so the locator is
    // asked by the page's RESOLUTION of `?ticket=` — not by the click handler.
    // One code path serves the click, the reload and a shared link alike.
    searchParams = new URLSearchParams({ ticket: TICKET_CONTESTED });
    view.rerender(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    // The id really was ASKED FOR — a page that guessed a project would
    // otherwise pass everything below on a coincidence of fixture ids.
    await waitFor(() =>
      expect(locate).toHaveBeenCalledWith(WORKSPACE, TICKET_CONTESTED),
    );

    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByLabelText('Ticket title')).toHaveValue(CONTESTED_TITLE);
    const bar = await screen.findByRole('navigation', { name: 'Ticket location' });
    expect(within(bar).getByRole('link', { name: SIBLING_NAME })).toHaveAttribute(
      'href',
      `/w/${WORKSPACE}/p/${PROJECT_SIBLING}`,
    );
  });

  it('13.1163 says so, and opens nothing, when the server will not place the ticket', async () => {
    // `null` is the locator's answer for BOTH "no such ticket" and "not yours" —
    // the route refuses to distinguish them — so the sentence may not guess.
    const locate = vi.fn(async () => null);
    const services = stubServices(
      {
        getMyWork: async () => contestedView(),
        getAttention: async () => [],
        getTicket: async (_workspaceId, ticketId) => ticketFor(ticketId),
        getTicketAttachments: async () => [],
      },
      { ticketLocation: { locate } },
    );
    const view = render(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    const region = await screen.findByRole('region', { name: 'My contested claims' });
    await userEvent.click(
      await within(region).findByRole('button', { name: CONTESTED_TITLE }),
    );
    // The landing, as above: the request is the param, and the answer to it is
    // the sentence below.
    searchParams = new URLSearchParams({ ticket: TICKET_CONTESTED });
    view.rerender(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('cannot be opened from here');
    expect(alert).not.toHaveTextContent('no longer exists');
    // The server WAS asked — this is a refusal, not a resolver that gave up.
    expect(locate).toHaveBeenCalledWith(WORKSPACE, TICKET_CONTESTED);
    // Nothing was opened, and the reader was not sent anywhere: the one push is
    // this page's own path carrying the request that could not be honoured.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(
      `/w/${WORKSPACE}/my-work?ticket=${TICKET_CONTESTED}`,
      { scroll: false },
    );
    expect(push).not.toHaveBeenCalledWith(
      expect.stringContaining('/p/'),
      expect.anything(),
    );
  });
});
