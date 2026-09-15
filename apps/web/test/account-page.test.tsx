import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/account',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: { signOut: vi.fn(), useSession: () => ({ data: null }) },
}));

import AccountPage from '../app/account/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

function mount() {
  render(
    <Providers services={stubServices({ getMyWorkspaces: async () => [] }, {})}>
      <AccountPage />
    </Providers>,
  );
}

describe('AccountPage — the global settings shell', () => {
  it('renders AppNav and a page title', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
  });

  it('renders the Appearance section with both the Style and Theme controls', async () => {
    mount();
    expect(await screen.findByRole('button', { name: /Style/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Theme:/ })).toBeInTheDocument();
  });
});
