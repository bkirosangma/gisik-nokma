import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '../src/providers.js';
import { useCanModerateComments } from '../src/use-can-moderate-comments.js';
import { stubServices } from './helpers/stub-services.js';

/** Case 26.112 — who is offered Delete on someone else's comment: the workspace owner and admin, nobody else. */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/notes',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

const WS = '01J9WSLOGISTICS000000000000';

function Probe({ workspaceId }: { workspaceId: string | undefined }) {
  return <p data-testid="probe">{String(useCanModerateComments(workspaceId))}</p>;
}

function mount(role: string | null, workspaceId: string | null = WS) {
  const services = stubServices({
    getMyWorkspaces: async () =>
      role === null
        ? []
        : [{ id: WS, name: 'Garo Hills', prefix: 'CC', role, archived: false, memberCount: 2, nameRestrictedProjectCount: 0, projects: [] }],
  });
  render(
    <Providers services={services}>
      <Probe workspaceId={workspaceId ?? undefined} />
    </Providers>,
  );
  return services;
}

beforeEach(() => cleanup());

describe('26.112 useCanModerateComments', () => {
  it('26.112 an owner moderates; CONTROL (same it): an admin does too, a member and a guest do not', async () => {
    const answers: Record<string, string> = {};
    for (const role of ['owner', 'admin', 'member', 'guest']) {
      cleanup();
      mount(role);
      if (role === 'owner' || role === 'admin') {
        await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('true'));
      } else {
        // A false that is only "not yet": give the read a turn to land, then assert it stayed false.
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      answers[role] = screen.getByTestId('probe').textContent ?? '';
    }
    expect(answers).toEqual({ owner: 'true', admin: 'true', member: 'false', guest: 'false' });
  });

  it('26.112 a workspace the viewer is not in, or no workspace id, is false', async () => {
    mount(null);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId('probe').textContent).toBe('false');
    cleanup();
    mount('owner', null);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId('probe').textContent).toBe('false');
  });
});
