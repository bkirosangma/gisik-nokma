import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteDetail } from '@gisik-nokma/domain';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/notes/n_1',
  useSearchParams: () => new URLSearchParams(),
}));

import { Providers } from '../src/providers.js';
import { NoteByline } from '../src/notes/note-byline.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * The web app on phones, Plan Task 9 — the markup half of case 21.131 (§21.9): a note's byline
 * puts Copy as Markdown / History / Knowledge Graph / Delete behind a "⋯" menu at phone width, inline above it.
 * (The CSS half — the title on one line — is `phone-screens-b.test.ts`.)
 */
const NOTE: NoteDetail = {
  noteId: 'n_1',
  workspaceId: 'w_1',
  homeProjectId: '',
  authorId: 'u_kiro',
  title: 'Compressor log',
  scope: { mode: 'private' },
  attachedTickets: [],
  deleted: false,
  createdAt: '2026-09-23T06:00:00.000Z',
  updatedAt: '2026-09-23T06:00:00.000Z',
  body: { type: 'doc', content: [{ type: 'paragraph' }] },
  schemaVersion: 2,
};
const WORKSPACE: WorkspaceRef = { id: 'w_1', name: 'Convenience Corner', prefix: 'CC', role: 'owner', archived: false, memberCount: 1, nameRestrictedProjectCount: 0, projects: [] };

function stubViewport(phone: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => ({ matches: phone, media, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}

function byline(over: { onDelete?: () => void; onOpenHistory?: () => void; onOpenGraph?: () => void; onCopyMarkdown?: () => void } = {}) {
  return render(
    <Providers services={stubServices({ getMyWorkspaces: async () => [WORKSPACE] })}>
      <NoteByline
        note={NOTE}
        workspace={WORKSPACE}
        members={[]}
        authorName="Kiro"
        editedLabel="Edited today"
        canEdit
        onScopeChanged={() => undefined}
        onDetach={() => undefined}
        onOpenTicket={() => undefined}
        readingLabel="1 min read"
        onCopyMarkdown={over.onCopyMarkdown ?? (() => undefined)}
        onOpenHistory={over.onOpenHistory ?? (() => undefined)}
        onOpenGraph={over.onOpenGraph ?? (() => undefined)}
        {...(over.onDelete === undefined ? {} : { onDelete: over.onDelete })}
      />
    </Providers>,
  );
}

beforeEach(() => cleanup());
afterEach(() => Reflect.deleteProperty(window, 'matchMedia'));

describe('21.131 the note byline on a phone', () => {
  it('21.131 / 27.345 at phone width Copy / History / Knowledge Graph / Delete sit behind one "⋯" menu whose items run the same handlers; above it they are inline buttons and there is no menu', async () => {
    stubViewport(true);
    const user = userEvent.setup();
    const onHistory = vi.fn();
    const onCopy = vi.fn();
    const onDelete = vi.fn();
    const onGraph = vi.fn();
    byline({ onOpenHistory: onHistory, onCopyMarkdown: onCopy, onDelete, onOpenGraph: onGraph });

    // Closed: no inline action, one trigger named for the note.
    expect(screen.queryByRole('button', { name: 'Copy as Markdown' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Knowledge Graph' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete…' })).toBeNull();
    const trigger = screen.getByRole('button', { name: 'More actions for Compressor log' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // The wrapper carries BOTH classes: the card menu's base (the list's anchor and placement) and the in-flow
    // modifier — the byline dropping the modifier, or OverflowMenu dropping the base when given one, reddens here.
    expect(trigger.parentElement?.classList.contains('gn-card-menu')).toBe(true);
    expect(trigger.parentElement?.classList.contains('gn-card-menu--inline')).toBe(true);

    // Open: the actions are menu items, in the inline order, and each runs its handler (Knowledge Graph after History,
    // spec C §1, KG-C T9).
    await user.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Note actions' });
    expect(within(menu).getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Copy as Markdown', 'History', 'Knowledge Graph', 'Delete…']);
    await user.click(within(menu).getByRole('menuitem', { name: 'History' }));
    expect(onHistory).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More actions for Compressor log' }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy as Markdown' }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'More actions for Compressor log' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'More actions for Compressor log' }));
    await user.click(screen.getByRole('menuitem', { name: 'Knowledge Graph' }));
    expect(onGraph).toHaveBeenCalledTimes(1);
    expect(onHistory).toHaveBeenCalledTimes(1);

    // CONTROL — the same props above phone width: inline buttons, no trigger, no menu.
    cleanup();
    stubViewport(false);
    byline({ onDelete, onOpenGraph: onGraph });
    expect(screen.getByRole('button', { name: 'Copy as Markdown' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'History' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Knowledge Graph' }));
    expect(onGraph).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Delete…' })).toBeTruthy();
    // The inline order is the menu's: the manual's "Delete… beside History and Knowledge Graph" (§15, 27.348).
    const ACTIONS = ['Copy as Markdown', 'History', 'Knowledge Graph', 'Delete…'];
    expect(screen.getAllByRole('button').map((el) => el.textContent).filter((t) => ACTIONS.includes(t ?? ''))).toEqual(ACTIONS);
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('21.131 a pointer-down outside the open menu closes it (OverflowMenu\'s second consumer keeps the card menu\'s behaviour); one inside the menu does not', async () => {
    stubViewport(true);
    const user = userEvent.setup();
    byline();
    const trigger = screen.getByRole('button', { name: 'More actions for Compressor log' });
    await user.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Note actions' });
    fireEvent.pointerDown(menu);
    expect(screen.queryByRole('menu')).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('21.131 a reader (no Delete) gets a menu of Copy, History and Knowledge Graph only', async () => {
    stubViewport(true);
    const user = userEvent.setup();
    byline();
    await user.click(screen.getByRole('button', { name: 'More actions for Compressor log' }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Copy as Markdown', 'History', 'Knowledge Graph']);
  });
});
