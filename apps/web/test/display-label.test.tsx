import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { avatarNameOf, displayLabelOf } from '../src/display-label.js';

/**
 * **E4-33 — for a person with no display name, the shell's own labels say who
 * they are instead of trailing off. Case `13.1054`.**
 *
 * The finding, measured on the painted app as the seeded guest
 * `accountant@e2e.gisik-nokma.local` with `name = ''` — **the product's DEFAULT
 * email sign-up path**: `/workspaces`' `<h1>` read `"Workspaces — "`, the nav
 * button's accessible name read `"Account menu for "`, and the monogram was a
 * `?` with an empty `title`. The signed-in owner paints `Workspaces — Kiro` /
 * `Account menu for Kiro` / `KI` on the same elements. The cause is the one the
 * members page already documents: magic-link sign-up creates `name: ''` and the
 * sign-in form asks for no name.
 *
 * **Why the shell rather than the picker or provenance.** exec 5's E5-4 owns the
 * visibility editor's people picker and E4-6 the provenance fallback, where
 * `provenance.ts` records a RULED decision to fall back to the raw actor id. This
 * is neither: it is the two labels every signed-in screen carries, and they are
 * the person's own.
 *
 * The fixture is a mutable user so the SAME assertions can be run against a named
 * person and a nameless one — the named half is the positive control, and the
 * defect is only visible in the difference between them.
 */

const WORKSPACE: WorkspaceRef = {
  id: '01J9WS00000000000000000000',
  name: 'Convenience Corner',
  prefix: 'CC',
  role: 'owner',
  archived: false,
  memberCount: 1,
  nameRestrictedProjectCount: 0,
  projects: [],
};

let mockUser: { id: string; name: string; email: string | null } = {
  id: '01J9USER000000000000000000',
  name: 'Kiro',
  email: 'kiro@example.com',
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/workspaces',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: mockUser === null ? null : { user: mockUser }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { AppNav } from '../src/app-nav.js';
import { Providers } from '../src/providers.js';
import WorkspacesPage from '../app/workspaces/page.js';
import { stubServices } from './helpers/stub-services.js';

beforeEach(() => {
  mockUser = { id: '01J9USER000000000000000000', name: 'Kiro', email: 'kiro@example.com' };
});
afterEach(cleanup);

const NAV_SERVICES = () => stubServices({}, { notifications: { unreadCount: async () => 0 } });

function mountNav() {
  render(
    <Providers services={NAV_SERVICES()}>
      <AppNav />
    </Providers>,
  );
}

function mountWorkspaces() {
  render(
    <Providers services={stubServices({ getMyWorkspaces: async () => [WORKSPACE] }, {})}>
      <WorkspacesPage />
    </Providers>,
  );
}

describe('E4-33 the shell names a person who has no display name', () => {
  it('13.1054 displayLabelOf prefers the name and falls back to the email, never to punctuation', () => {
    expect(displayLabelOf({ name: 'Kiro', email: 'kiro@example.com' })).toBe('Kiro');
    expect(displayLabelOf({ name: '', email: 'accountant@e2e.gisik-nokma.local' })).toBe(
      'accountant@e2e.gisik-nokma.local',
    );
    // A whitespace-only name is NO name — the same reading the ledger's own
    // `displayName` refine takes.
    expect(displayLabelOf({ name: '   ', email: 'a@b.co' })).toBe('a@b.co');
    // Nothing at all answers the empty string, and every caller omits its
    // suffix for that, rather than printing a dangling separator.
    expect(displayLabelOf({ name: '', email: null })).toBe('');
  });

  it('13.1054 avatarNameOf is the name, or the email LOCAL PART when there is none', () => {
    expect(avatarNameOf({ name: 'Kiro', email: 'kiro@example.com' })).toBe('Kiro');
    expect(avatarNameOf({ name: '', email: 'accountant@e2e.gisik-nokma.local' })).toBe('accountant');
    // An address with no local part is not a handle; the empty string reaches
    // `initialsOf`, whose own documented answer for it is `?`.
    expect(avatarNameOf({ name: '', email: '@x.co' })).toBe('');
  });

  it('13.1054 the nav button names the person by their email when they have no name', () => {
    // POSITIVE CONTROL: the named person's label, which is unchanged by the fix.
    mountNav();
    expect(screen.getByRole('button', { name: 'Account menu for Kiro' })).toBeInTheDocument();
    cleanup();

    mockUser = { id: mockUser.id, name: '', email: 'accountant@e2e.gisik-nokma.local' };
    mountNav();
    // THE WITNESS — before the fix this read `Account menu for `, a name ending
    // in a preposition, and `getByRole(…, { name: 'Account menu for Kiro' })`
    // above still passed because that arm is the other person entirely.
    expect(
      screen.getByRole('button', { name: 'Account menu for accountant@e2e.gisik-nokma.local' }),
    ).toBeInTheDocument();
    // ...and nothing dangles. Asserted as an absence of the bare prefix so a
    // regression that appends the email somewhere else still fails here.
    expect(screen.queryByRole('button', { name: 'Account menu for' })).toBeNull();
  });

  it('13.1054 the monogram is the handle\'s initials, not a question mark', () => {
    mockUser = { id: mockUser.id, name: '', email: 'accountant@e2e.gisik-nokma.local' };
    mountNav();
    const monogram = document.querySelector('.gn-nav__avatar-button .gn-avatar') as HTMLElement;
    expect(monogram).not.toBeNull();
    expect(monogram.textContent).toBe('AC');
    // The title and label carry the handle rather than an empty string — the
    // finding measured `title=""` and `aria-label=""` on this span.
    expect(monogram.getAttribute('title')).toBe('accountant');
    expect(monogram.getAttribute('aria-label')).toBe('accountant');
  });

  it('13.1054 the /workspaces heading ends in a name, not an em dash', () => {
    // POSITIVE CONTROL: the named person's heading, unchanged by the fix.
    mountWorkspaces();
    expect(screen.getByRole('heading', { level: 1, name: 'Workspaces: Kiro' })).toBeInTheDocument();
    cleanup();

    mockUser = { id: mockUser.id, name: '', email: 'accountant@e2e.gisik-nokma.local' };
    mountWorkspaces();
    // THE WITNESS — the measured defect was a heading that ended in its separator (`"Workspaces — "`, now `"Workspaces: "`).
    expect(
      screen.getByRole('heading', { level: 1, name: 'Workspaces: accountant@e2e.gisik-nokma.local' }),
    ).toBeInTheDocument();
    expect(document.querySelector('h1.gn-page-title')?.textContent).not.toMatch(/—\s*$/);
  });
});
