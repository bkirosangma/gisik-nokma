import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InvitePage from '../app/invite/[token]/page.js';
import { Providers } from '../src/providers.js';
import { stubServices, type GatewayStubs } from './helpers/stub-services.js';

/**
 * Smoothness T8 — the invite page's two waits are skeletons INSIDE its own card, and Join is a busy button
 * (spec S6, S7; audit SM-11; cases 25.147, 25.148). The page has no nav and no `main` shell of its own to borrow
 * (`FormPageShell` would add both), so the parts live in `Card.gn-invite`.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ token: 'tok_e2e' }),
  useSearchParams: () => new URLSearchParams(),
}));
let session: { data?: { user?: { id: string; name: string } }; isPending: boolean } = { isPending: false };
vi.mock('../src/auth-client.js', () => ({
  authClient: { useSession: () => session, signOut: async () => ({ data: {}, error: null }) },
}));

const SUMMARY = { workspaceId: '01J9WORKSPACE0000000000000', workspaceName: 'Convenience Corner', role: 'guest' as const, expiresAt: null };
function mount(invites: GatewayStubs['invites']) {
  render(
    <Providers services={stubServices({}, { invites })}>
      <InvitePage />
    </Providers>,
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  cleanup();
  session = { isPending: false, data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } } };
});

describe('25.147 the invite page waits as skeletons in its own card', () => {
  it('25.147 while the invitation is read, Card.gn-invite holds a named busy region (no sentence); a session still loading is a region where the Join button will be (no sentence, no button)', async () => {
    const read = deferred<typeof SUMMARY>();
    mount({ getInvite: () => read.promise });
    const first = await screen.findByText('Checking the invitation');
    expect(first.parentElement).toHaveClass('gn-skeleton-region');
    expect(first.parentElement!.closest('.gn-invite')).not.toBeNull();
    expect(screen.queryByText('Checking the invitation…')).toBeNull();
    session = { isPending: true };
    cleanup();
    mount({ getInvite: async () => SUMMARY });
    await screen.findByText(/invited to join/);
    const second = screen.getByText('Checking whether you are signed in');
    expect(second.parentElement).toHaveAttribute('aria-busy', 'true');
    expect(second.parentElement!.closest('.gn-invite')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /^Join / })).toBeNull();
    expect(screen.queryByText('Checking whether you are signed in…')).toBeNull();
  });
});

describe('25.148 Join is a busy button', () => {
  it('25.148 Join is disabled and aria-busy while the accept is in flight, a second click accepts nothing, and a refusal frees it', async () => {
    const accept = deferred<{ workspaceId: string }>();
    const acceptInvite = vi.fn(() => accept.promise);
    mount({ getInvite: async () => SUMMARY, acceptInvite });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Join Convenience Corner' }));
    const busy = screen.getByRole('button', { name: /Joining/ });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await user.click(busy);
    expect(acceptInvite).toHaveBeenCalledTimes(1);
    await act(async () => {
      accept.resolve({ workspaceId: SUMMARY.workspaceId });
    });
  });

  it('25.148 CONTROL: a refused accept ends the busy state and shows the refusal', async () => {
    mount({ getInvite: async () => SUMMARY, acceptInvite: () => Promise.reject(new Error('lapsed')) });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Join Convenience Corner' }));
    await screen.findByRole('alert');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Join Convenience Corner' })).not.toBeDisabled());
  });
});
