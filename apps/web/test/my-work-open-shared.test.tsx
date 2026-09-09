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
