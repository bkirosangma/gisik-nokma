import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '../src/providers.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 13.431/13.432 — the project page's breadcrumb and title (board-prototype-
 * port Task 2, fix round 1, coordinator Ruling 6).
 *
 * `.gn-project__breadcrumb` and `.gn-project__title` shipped in Task 2's own
 * commit with no consumer: this page had no read carrying either name.
 * `useWorkspaceName`/`useProjectName` close that gap over the SAME
 * `GET /v1/me/workspaces` read `<AppNav>` already makes on this page for its
 * own nav link — no second endpoint.
 *
 * **The asymmetry these two cases exist to prove:** a resolved name renders
 * in each slot (13.431), and a name that has not resolved — pending or
 * refused, indistinguishable to the caller — renders NEITHER text NOR the
 * raw id in its place (13.432). Rendering the id would be the exact defect
 * `use-workspace-name.ts`'s own docblock names: "a caller renders no name
 * rather than the raw id or a stale guess." `getMyWorkspaces` is left
 * UNSTUBBED for 13.432 (`stubServices`'s default: every un-stubbed read
 * rejects by name) rather than resolved-without-a-match, because the
 * simpler failure is the one every other unstubbed read in this project's
 * test suite already represents, and both failure shapes collapse to the
 * same `null` in the hook regardless.
 */

const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';
const ANSELMA = '01J9USER000000000000000000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: WORKSPACE, projectId: PROJECT }),
  usePathname: () => `/w/${WORKSPACE}/p/${PROJECT}`,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: ANSELMA, name: 'Anselma Marak' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

/**
 * `use-workspace-name.ts`'s own docblock: "Tests share one module, so they
 * share this. Cleared between cases." 13.431 populates the module-scoped
 * `nameCache` for `WORKSPACE`; without this, 13.432 (run second) would paint
 * that cached name on its OWN first render instead of starting from the
 * pending/refused state its own name describes — the same order-dependence
 * `app-nav.test.tsx` already guards against for the identical cache. Fixed
 * here the same way: cleared before each case, so every one starts cold.
 */
beforeEach(() => {
  clearWorkspaceNameCache();
});

describe('the project page names itself from the same read AppNav already makes', () => {
  it('13.431 renders the workspace name in the breadcrumb and the project name as the title', async () => {
    render(
      <Providers
        services={stubServices({
          getMyWorkspaces: async () => [
            {
              id: WORKSPACE,
              name: 'Garo Hills Logistics',
              prefix: 'GH',
              role: 'owner',
              memberCount: 3,
              nameRestrictedProjectCount: 0,
              projects: [
                {
                  id: PROJECT,
                  name: 'Errand tracking',
                  prefix: 'ET',
                  archived: false,
                  ticketCount: 4,
                  blockedCount: 0,
                },
              ],
            },
          ],
        })}
      >
        <ProjectPage />
      </Providers>,
    );

    // Disambiguated from `<AppNav>`'s OWN workspace-name nav link, which reads
    // the same `useWorkspaceName` hook and renders the identical text as an
    // `<a>` — a bare `getByText` would match both once the fixture resolves.
    expect(
      await screen.findByText('Garo Hills Logistics', { selector: '.gn-project__breadcrumb' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Errand tracking', level: 1 }),
    ).toBeInTheDocument();
  });

  it('13.432 omits both names — never the raw id — while getMyWorkspaces has not answered', async () => {
    render(
      // `getMyWorkspaces` deliberately left un-stubbed: `stubServices`'s
      // default rejects it by name, the same "pending or refused, and the
      // hook cannot tell which" state every other consumer of this read
      // meets elsewhere in this suite.
      <Providers services={stubServices({})}>
        <ProjectPage />
      </Providers>,
    );

    // A settled-render witness first, so "neither name present" is a decision
    // read off a mounted page rather than a snapshot taken before either async
    // read has had a chance to settle. `getTicketTypes` is ALSO left
    // unstubbed (same default), so waiting for ITS refusal proves the async
    // layer has flushed at least once — the two reads are independent, but
    // React settles them in the same pass here.
    await screen.findByText(
      /This workspace.s ticket types, so New ticket is not offered cannot be shown yet\./,
    );

    expect(document.querySelector('.gn-project__breadcrumb')).toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    // The specific failure this pair guards against: the raw id standing in
    // for the name nobody could confirm.
    expect(screen.queryByText(WORKSPACE)).not.toBeInTheDocument();
    expect(screen.queryByText(PROJECT)).not.toBeInTheDocument();
  });
});
