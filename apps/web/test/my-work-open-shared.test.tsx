import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyWorkView, WorkItem } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 3.162 — the My Work page can OPEN a ticket from the "Shared with me" section.
 *
 * ## Why this file exists rather than a component-level case
 *
 * `MyWork` (the app-core view) renders the button and calls `onOpenTicket` with
 * a ticket id; the PAGE is what turns that id into a route, and it does so by
 * looking the id up in the view to recover its `projectId` — the sheet lives at
 * `/w/:ws/p/:projectId?ticket=…`, so the id alone cannot build the URL. The
 * defect this case pins lived entirely in that lookup, which no component test
 * can reach: `MyWork` was already calling `onOpenTicket` correctly.
 *
 * **The defect, found by review after the section had shipped green.** The
 * resolver searched `assigned` and `inTransit` and NOT `shared`. A shared errand
 * is typically not assigned to the viewer — that is the entire reason the
 * section exists — so `find` returned `undefined`, the `if (item !== undefined)`
 * guard swallowed it, and the button did nothing: no navigation, no error, no
 * way for a user to distinguish it from a slow page. The most reachable
 * instance is also the least suspicious: an OWNER, whose `projectName` is never
 * withheld, clicking a ticket shared with them that nobody assigned.
 *
 * A dead click is the failure mode this shell has already been bitten by once
 * (3.157/3.158: a control that read as working and was not), and it is why the
 * assertion here is on the ROUTER CALL rather than on the button existing.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: '01J9WORKSPACE0000000000000' }),
  usePathname: () => '/w/01J9WORKSPACE0000000000000/my-work',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: '01J9USER000000000000000000', name: 'Anselma Marak' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import MyWorkPage from '../app/w/[workspaceId]/my-work/page.js';

afterEach(() => {
  push.mockClear();
});

const claim = { actorId: '01J9USER000000000000000000', actorName: 'Anselma Marak', clientTime: '2026-08-19T09:58:12.000Z', serverTime: '2026-08-19T10:00:00.000Z', cause: null };

function item(overrides: Partial<WorkItem>): WorkItem {
  return {
    ticketId: '01J9TICKETSHARED0000000000',
    workspaceId: '01J9WORKSPACE0000000000000',
    projectId: '01J9PROJECTSIBLING00000000',
    projectName: 'Sibling project',
    title: 'Countersign the sibling lease',
    stateId: 'todo',
    stateName: 'To do',
    stateCategory: 'open',
    stateProvenance: claim,
    dueDate: null,
    ...overrides,
  };
}

describe('3.162 My Work opens a ticket from the Shared with me section', () => {
  it('routes to the shared ticket’s OWN project — the id resolves through `shared`, not only `assigned`', async () => {
    const shared = item({});
    const assignedOne = item({
      ticketId: '01J9TICKETASSIGNED00000000',
      projectId: '01J9PROJECTSHOPFLOOR000000',
      projectName: 'Shop floor',
      title: 'File the GST return',
    });
    const view: MyWorkView = {
      assigned: [assignedOne],
      inTransit: [],
      contested: [],
      shared: [shared],
    };

    render(
      <Providers
        services={stubServices({
          getMyWork: async () => view,
          getAttention: async () => [],
        })}
      >
        <MyWorkPage />
      </Providers>,
    );

    const region = await screen.findByRole('region', { name: 'Shared with me' });
    await userEvent.click(
      await within(region).findByRole('button', { name: 'Countersign the sibling lease' }),
    );

    // The whole claim: the router was called AT ALL (the defect called it
    // never), and with the SHARED ticket's own project — not the assigned
    // card's, which is the wrong-project answer a resolver that fell through to
    // the first list would give.
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/w/01J9WORKSPACE0000000000000/p/01J9PROJECTSIBLING00000000?ticket=01J9TICKETSHARED0000000000`,
      ),
    );

    // CONTROL, same render: the assigned section still routes, so the assertion
    // above is about `shared` being reachable rather than about the page having
    // started working at all.
    push.mockClear();
    const assignedRegion = screen.getByRole('region', { name: 'Assigned to me' });
    await userEvent.click(
      within(assignedRegion).getByRole('button', { name: 'File the GST return' }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/w/01J9WORKSPACE0000000000000/p/01J9PROJECTSHOPFLOOR000000?ticket=01J9TICKETASSIGNED00000000`,
      ),
    );
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
 */
describe('V5 My Work opens a contested claim, or says why it cannot', () => {
  const contestedView = (): MyWorkView => ({
    assigned: [],
    inTransit: [],
    shared: [],
    contested: [
      {
        ticketId: '01J9TICKETCONTESTED0000000',
        title: 'Renew the shop licence',
        rule: 'state.terminal',
        reason: 'the ticket is already closed',
        claim: {
          actorId: '01J9USER000000000000000000',
          clientTime: '2026-08-19T09:58:12.000Z',
          contestedAt: '2026-08-19T10:00:00.000Z',
        },
      },
    ],
  });

  it('13.1163 routes to the contested ticket’s own project, asked of the locator', async () => {
    const locate = vi.fn(async () => ({
      workspaceId: '01J9WORKSPACE0000000000000',
      projectId: '01J9PROJECTCONTESTED000000',
    }));
    render(
      <Providers
        services={stubServices(
          { getMyWork: async () => contestedView(), getAttention: async () => [] },
          { ticketLocation: { locate } },
        )}
      >
        <MyWorkPage />
      </Providers>,
    );

    const region = await screen.findByRole('region', { name: 'My contested claims' });
    await userEvent.click(
      await within(region).findByRole('button', { name: 'Renew the shop licence' }),
    );

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        '/w/01J9WORKSPACE0000000000000/p/01J9PROJECTCONTESTED000000?ticket=01J9TICKETCONTESTED0000000',
      ),
    );
    // The id really was ASKED FOR — a resolver that guessed a project would
    // otherwise pass the assertion above on a coincidence of fixture ids.
    expect(locate).toHaveBeenCalledWith(
      '01J9WORKSPACE0000000000000',
      '01J9TICKETCONTESTED0000000',
    );
  });

  it('13.1163 says so, and navigates nowhere, when the server will not place the ticket', async () => {
    // `null` is the locator's answer for BOTH "no such ticket" and "not yours" —
    // the route refuses to distinguish them — so the sentence may not guess.
    const locate = vi.fn(async () => null);
    render(
      <Providers
        services={stubServices(
          { getMyWork: async () => contestedView(), getAttention: async () => [] },
          { ticketLocation: { locate } },
        )}
      >
        <MyWorkPage />
      </Providers>,
    );

    const region = await screen.findByRole('region', { name: 'My contested claims' });
    await userEvent.click(
      await within(region).findByRole('button', { name: 'Renew the shop licence' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('cannot be opened from here');
    expect(alert).not.toHaveTextContent('no longer exists');
    expect(push).not.toHaveBeenCalled();
  });
});
