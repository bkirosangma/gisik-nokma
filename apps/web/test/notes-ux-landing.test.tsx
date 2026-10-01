import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';
import { parseRules, readUiCss, ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';

/**
 * UX fixes Task 9 (audit NP-01, NP-02, NP-04), cases 23.160–23.162: the Notes screen on a phone
 * and a tablet, and the editor's dead band.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/notes',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { NotesPage } from '../src/notes/notes-page.js';

const WORKSPACE: WorkspaceRef = {
  id: '01J9WSLOGISTICS000000000000',
  name: 'Garo Hills Logistics',
  prefix: 'GH',
  role: 'owner',
  archived: false,
  memberCount: 3,
  nameRestrictedProjectCount: 0,
  projects: [],
};

function mount(noteId?: string) {
  return render(
    <Providers
      services={stubServices(
        { getMyWorkspaces: async () => [WORKSPACE], getNote: async () => null, getMembers: async () => [], getNotes: async () => [], getDeletedNotes: async () => [] },
        { notifications: { unreadCount: async () => 0, list: async () => ({ notifications: [], nextCursor: null }) } },
      )}
    >
      <NotesPage noteId={noteId} />
    </Providers>,
  );
}

const globals = readGlobalsCss();
const ui = readUiCss();
const TABLET = '@media (max-width: 60rem)';

describe('23.160 the Notes drawer toggle is a styled ghost Button named "Notes" (audit NP-01)', () => {
  it('23.160 the toggle is a `.gn-button` ghost named "Notes" that still discloses the tree; CONTROL: the button class carries an explicit fill, radius, font and a 44px floor', async () => {
    mount();
    const toggle = await screen.findByRole('button', { name: 'Notes' });
    expect(toggle).toHaveClass('gn-button', 'gn-button--ghost', 'gn-notes__tree-toggle');
    expect(screen.queryByRole('button', { name: 'Notes list' })).toBeNull();
    // still a disclosure: it names the tree it opens and flips aria-expanded
    expect(toggle).toHaveAttribute('aria-controls', 'gn-notes-tree');
    const before = toggle.getAttribute('aria-expanded');
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).not.toBe(before);
    // CONTROL: what the class brings, so "no UA button" is a statement about the CSS, not about a class name
    const rule = ruleExactly(ui, '.gn-button');
    expect(valueOf(rule, 'border-radius')).toBe('999px');
    expect(valueOf(rule, 'font')).toBe('inherit');
    expect(valueOf(rule, 'background')).toBe('transparent');
    expect(valueOf(rule, 'border')).toBe('none');
    expect(valueOf(rule, 'min-height')).toBe('2.75rem');
    // and nothing at ≤60rem takes the floor back off the toggle
    const tablet = parseRules(globals).filter((r) => r.atRule === TABLET && r.selectors.includes('.gn-notes__tree-toggle'));
    expect(tablet.map((r) => valueOf(r.body, 'min-height'))).not.toContain('0');
    expect(tablet.map((r) => valueOf(r.body, 'height'))).toEqual(tablet.map(() => null));
  });
});

describe('23.161 the Notes landing opens on the list, with "Create note" showing (audit NP-02)', () => {
  it('23.161 with no note open the tree is expanded (data-open and aria-expanded true) and "Create note" is in it; CONTROL: with a note open the tree starts collapsed, and above 60rem the grid is unchanged', async () => {
    const landing = mount();
    const tree = await screen.findByRole('navigation', { name: 'Notes' });
    expect(tree).toHaveAttribute('data-open', 'true');
    expect(screen.getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('button', { name: 'Create note' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New note' })).toBeNull(); // the old label is gone
    landing.unmount();

    // CONTROL: a note open → the drawer starts closed (the document is the page)
    mount('01J9NOTE00000000000000000A');
    const closed = await screen.findByRole('navigation', { name: 'Notes' });
    expect(closed).toHaveAttribute('data-open', 'false');
    expect(screen.getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-expanded', 'false');
    // CONTROL: above 60rem the split is exactly as it was
    expect(valueOf(ruleExactly(globals, '.gn-notes__body'), 'grid-template-columns')).toBe('18rem minmax(0, 1fr)');
  });
});

describe('23.162 the note editor has no dead band (audit NP-04)', () => {
  it('23.162 `.gn-notes__editor` carries no min-height; the visible field inside it does; CONTROL: that floor is at least 40dvh, so an empty note is still a tall typing area', () => {
    const wrapper = ruleExactly(globals, '.gn-notes__editor');
    expect(valueOf(wrapper, 'min-height')).toBeNull();
    const field = ruleExactly(globals, '.gn-notes__editor .ticket-editor .ticket-editor__content');
    const floor = valueOf(field, 'min-height') ?? '';
    expect(floor).toMatch(/^max\(40dvh,/);
    expect(floor).toContain('var(--app-nav-offset, 0px)');
    // CONTROL: the wrapper's own padding is still a click-to-focus surface (13.1488)
    expect(valueOf(wrapper, 'cursor')).toBe('text');
  });
});
