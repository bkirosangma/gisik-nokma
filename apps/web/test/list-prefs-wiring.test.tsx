import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TicketListView } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { EMPTY_PREFERENCES, stubServices } from './helpers/stub-services.js';

/**
 * ## THE ONE PROP THE PLAN'S PAGE DID NOT PASS
 *
 * `useTicketList` returns `canSetPrefs`, false until the preferences document
 * has loaded, and `setPrefs` RETURNS SILENTLY in that window rather than PUT a
 * partial document over the rest of the user's arrangements. `TicketList` takes
 * `prefsEditable` and disables both controls when it is false — but the prop
 * DEFAULTS TO TRUE, so a page that does not pass it renders live controls whose
 * clicks vanish, with nothing on screen saying so. The plan's project page does
 * not pass it. This shell does, and this is the file that keeps it passed.
 *
 * The stubs here are the reason both directions are reachable at all: against
 * the real server `getTickets` refuses, so no list ever renders and neither
 * state of the control could be observed.
 */

const EMPTY_LIST: TicketListView = { projectId: '01J9PROJECT000000000000000', rows: [] };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({
    workspaceId: '01J9WORKSPACE0000000000000',
    projectId: '01J9PROJECT000000000000000',
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: '01J9USER000000000000000000', name: 'Anselma Marak' } },
    }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

async function renderListTab(getPreferences: () => Promise<never> | Promise<typeof EMPTY_PREFERENCES>) {
  render(
    <Providers
      services={stubServices({
        getTickets: async () => EMPTY_LIST,
        getPreferences,
      })}
    >
      <ProjectPage />
    </Providers>,
  );
  await userEvent.setup().click(await screen.findByRole('tab', { name: 'List' }));
}

/**
 * 3.88 — cited on the block: the list’s preference controls are DISABLED while the preferences document has not loaded and ENABLED once it has, because only then does a write have a document to merge into.
 */
describe('the list’s preference controls follow whether a write would actually land', () => {
  it('are DISABLED while the preferences document has not loaded', async () => {
    // A promise that never settles is the window itself: `usePreferences` has
    // asked and has no document, which is exactly `canSetPrefs === false`.
    await renderListTab(() => new Promise<never>(() => undefined));
    const groupBy = await screen.findByLabelText('Group by');
    expect(groupBy).toBeDisabled();
  });

  it('are ENABLED once it has, because a write then has a document to merge into', async () => {
    await renderListTab(async () => EMPTY_PREFERENCES);
    const groupBy = await screen.findByLabelText('Group by');
    await waitFor(() => expect(groupBy).toBeEnabled());
  });
});
