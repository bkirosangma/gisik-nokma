import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PendingInvitation } from '@gisik-nokma/app-core/online';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import WorkspacesPage from '../app/workspaces/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 13.378 — the *"One invitation is waiting"* banner (Task 17).
 *
 * The claim under test is as much about the EMPTY answer as the full one: a
 * person with no invitation must not be told about invitations, so the honest
 * rendering of "nothing is waiting" is nothing at all — no heading, no empty
 * state, no placeholder. Both halves are asserted here against the same page and
 * the same stub shape, differing only in what the gateway answers.
 *
 * The gateway is stubbed and the DataSource is not mocked away: `stubServices`
 * drives the REAL `Providers`/`useAppServices` pair, so the seam this page reads
 * through is the shipped one.
 */

/**
 * Run one body with the PROCESS's timezone moved, and put it back.
 *
 * This file needs it because the machine every gate runs on is already
 * `Asia/Kolkata` (owner decision; both clocks match), which makes the obvious
 * assertion a check that cannot fail: dropping `timeZone: IST_TIME_ZONE` from
 * the component renders the identical string here, so the mutation survives and
 * the case certifies nothing. Under a non-IST zone the two renderings separate.
 *
 * The delete-when-unset restore is not tidiness. `= undefined` assigns the
 * STRING "undefined", which ICU resolves to GMT — silently switching every
 * later file in this worker to UTC, and only when TZ was unset, which is the
 * default here and in CI. `test/ist-today.test.ts` records the same trap.
 */
function underZone<T>(zone: string, body: () => T): T {
  const original = process.env['TZ'];
  process.env['TZ'] = zone;
  try {
    return body();
  } finally {
    if (original === undefined) delete process.env['TZ'];
    else process.env['TZ'] = original;
  }
}

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } },
      isPending: false,
    }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

const WORKSPACES: WorkspaceRef[] = [];

const WAITING: PendingInvitation = {
  inviteId: 'inv1',
  workspaceId: 'ws9',
  workspaceName: 'Convenience Corner',
  role: 'member',
  invitedByName: 'Rukhang',
  // Fixed instants, and the assertions below read the IST day they fall on.
  // `2026-09-20T19:30:00.000Z` is 2026-09-21 in Asia/Kolkata — chosen ON THE FAR
  // SIDE of the date line from UTC on purpose, so a component that formatted in
  // the machine's zone instead of the product's would render 20 Sep and redden
  // this, which a same-day instant could never do.
  invitedAt: '2026-09-10T06:00:00.000Z',
  expiresAt: '2026-09-20T19:30:00.000Z',
};

function mount(invitations: PendingInvitation[], overrides = {}) {
  render(
    <Providers
      services={stubServices(
        { getMyWorkspaces: async () => WORKSPACES },
        { myInvitations: { list: async () => invitations, ...overrides } },
      )}
    >
      <WorkspacesPage />
    </Providers>,
  );
}

describe('Workspaces page — the invitation banner (Task 17)', () => {
  /**
   * The two controls this file's date assertion rests on, run in the same file
   * as the assertion so a reader can see what makes it discriminate.
   */
  it('CONTROL — the TZ knob moves this process, and this instant really lands on two different days', () => {
    expect(underZone('UTC', () => new Date(0).getHours())).toBe(0);
    expect(underZone('Asia/Kolkata', () => new Date(0).getHours())).toBe(5);
    // Niue is a fixed −11, so 19:30Z on the 20th is 08:30 on the TWENTIETH
    // there and 01:00 on the TWENTY-FIRST in IST. Computed by arithmetic here,
    // not by the TZ database and not by anything under test, which is what
    // makes the assertion below a test rather than a tautology.
    const naiveDayAt = (offsetHours: number) =>
      new Date(new Date(WAITING.expiresAt).getTime() + offsetHours * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
    expect(naiveDayAt(-11)).toBe('2026-09-20');
    expect(naiveDayAt(5.5)).toBe('2026-09-21');
  });

  it('13.378 renders the waiting invitation with its terms, and renders NOTHING when none is waiting', async () => {
    // Rendered under a NON-IST zone deliberately. The gate's machine is already
    // Asia/Kolkata, so an unvaried render would pass identically with the
    // component's explicit `timeZone` deleted — the mutation would survive and
    // the date assertion below would certify nothing.
    underZone('Pacific/Niue', () => mount([WAITING]));

    const banner = await screen.findByRole('region', { name: 'One invitation is waiting' });
    // The offer is a sentence, and the role inside it is a sentence too — never
    // the raw enum, which is a database value rather than terms being offered to
    // a person.
    expect(
      within(banner).getByText('Rukhang invited you to Convenience Corner as a member.'),
    ).toBeInTheDocument();
    expect(within(banner).queryByText('member')).toBeNull();
    // The product's timezone, not the machine's: 19:30Z on the 20th is the 21st
    // in Asia/Kolkata and the TWENTIETH in the `Pacific/Niue` this renders
    // under, so a component reading the machine's zone reddens exactly here.
    //
    // "Sept" and not "Sep" — that is what ICU's `en-IN` abbreviates September
    // to, read off the runtime rather than guessed from the American three
    // letters. Asserted as the whole line in one `getByText`, because the
    // component builds it as ONE interpolation: three would be three text
    // nodes, split in the accessibility tree and invisible to this query.
    expect(
      within(banner).getByText('Invited 10 Sept 2026 · lapses 21 Sept 2026'),
    ).toBeInTheDocument();
    // The accessible names carry the workspace, so two waiting invitations never
    // present two identically-named buttons.
    expect(
      within(banner).getByRole('button', { name: 'Accept the invitation to Convenience Corner' }),
    ).toBeInTheDocument();
    expect(
      within(banner).getByRole('button', { name: 'Decline the invitation to Convenience Corner' }),
    ).toBeInTheDocument();

    screen.getByRole('heading', { name: 'New workspace' });

    // ── THE EMPTY HALF, which is the same claim from the other side ──────────
    // Without it, a banner that rendered its heading unconditionally would pass
    // every assertion above.
    // `cleanup()`, not a no-op: `screen` has no `unmount`, and leaving the first
    // page mounted would make every query below ambiguous between two pages.
    cleanup();
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => WORKSPACES },
          { myInvitations: { list: async () => [] } },
        )}
      >
        <WorkspacesPage />
      </Providers>,
    );
    // Waited for rather than asserted immediately: the read resolves on a
    // microtask, so an instant `queryBy` would pass against a banner that simply
    // had not rendered yet — the check that cannot fail. The founding form is
    // the thing waited ON, because it renders unconditionally: once it is there,
    // the page has settled and a missing banner is a decision rather than a
    // pending promise.
    expect(await screen.findByRole('heading', { name: 'New workspace' })).toBeInTheDocument();
    expect(screen.queryByText(/invitation is waiting/)).toBeNull();
    expect(screen.queryByText(/invitations are waiting/)).toBeNull();
  });

  /**
   * The two actions, and the thing that separates them: Accept navigates into
   * the workspace, Decline re-reads and the invitation is gone. A page that
   * dropped the row from its own copy instead of re-reading would pass a weaker
   * assertion; this one counts the CALLS, so the re-read is the thing measured.
   */
  it('13.378 accepts into the workspace, and declines by re-reading rather than editing its own copy', async () => {
    const user = userEvent.setup();
    push.mockClear();
    const accept = vi.fn(async () => ({ workspaceId: 'ws9' }));
    mount([WAITING], { accept });

    const banner = await screen.findByRole('region', { name: 'One invitation is waiting' });
    await user.click(
      within(banner).getByRole('button', { name: 'Accept the invitation to Convenience Corner' }),
    );
    await waitFor(() => expect(accept).toHaveBeenCalledWith('inv1'));
    expect(push).toHaveBeenCalledWith('/w/ws9/my-work');

    // Decline, on a fresh mount whose list ANSWERS DIFFERENTLY the second time.
    cleanup();
    const decline = vi.fn(async () => undefined);
    let listed = 0;
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => WORKSPACES },
          {
            myInvitations: {
              list: async () => {
                listed += 1;
                return listed === 1 ? [WAITING] : [];
              },
              decline,
            },
          },
        )}
      >
        <WorkspacesPage />
      </Providers>,
    );
    const second = await screen.findByRole('region', { name: 'One invitation is waiting' });
    await user.click(
      within(second).getByRole('button', { name: 'Decline the invitation to Convenience Corner' }),
    );
    await waitFor(() => expect(decline).toHaveBeenCalledWith('inv1'));
    // The banner is gone because the SERVER's second answer said so — `listed`
    // reaching 2 is the re-read, and it is asserted rather than inferred.
    await waitFor(() => expect(listed).toBe(2));
    expect(screen.queryByText(/invitation is waiting/)).toBeNull();
  });

  /**
   * A failed invitations read must not take the page down. The founding form is
   * the thing that must survive it: a person who cannot be told which workspaces
   * they are in, and cannot be told about their invitations either, is exactly
   * the person who most needs to be able to make one.
   */
  it('13.378 keeps the page usable when the invitations read fails, and says so in one line', async () => {
    mount([], { list: async () => Promise.reject(new Error('the invitations read broke')) });

    expect(
      await screen.findByText('Your invitations could not be loaded: the invitations read broke'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New workspace' })).toBeInTheDocument();
    // NOT a refusal panel: this page's `<ShellRefusal>` is reserved for the read
    // the page exists to serve, and there is exactly one live region here.
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });
});
