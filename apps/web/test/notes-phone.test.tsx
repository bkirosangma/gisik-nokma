import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELP_PHONE_QUERY, HelpBrowser } from '@gisik-nokma/app-core';
import type { DataSourceQuery, WorkspaceRef } from '@gisik-nokma/app-core';
import type { NoteDetail } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Cases 25.346–25.349 — Notes on a phone, modelled on /help (smoothness G-3).
 *
 * The phone is a stubbed `matchMedia` answering the query /help itself uses (`HELP_PHONE_QUERY`); jsdom has none,
 * which is the desktop layout every other Notes suite drives. The note's body carries four headings so the
 * Contents pane has an order to prove.
 */
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

import { NotesPage } from '../src/notes/notes-page.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const UI_CSS = readFileSync(resolve(TEST_DIR, '../../../packages/ui/src/ui.css'), 'utf8');
const GLOBALS_CSS = readFileSync(resolve(TEST_DIR, '../app/globals.css'), 'utf8');

const WS = '01J9WSLOGISTICS000000000000';
const NOTE = '01J9NOTECOLDROOM000000000000';
const OTHER_NOTE = '01J9NOTEOTHER00000000000000';

const WS_REF: WorkspaceRef = {
  id: WS,
  name: 'Garo Hills Logistics',
  prefix: 'CC',
  role: 'owner',
  archived: false,
  memberCount: 3,
  nameRestrictedProjectCount: 0,
  projects: [],
};

function heading(level: number, text: string) {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}

const NOTE_DETAIL: NoteDetail = {
  noteId: NOTE,
  workspaceId: WS,
  homeProjectId: '',
  authorId: 'u_kiro',
  title: 'Compressor log',
  scope: { mode: 'workspace' },
  attachedTickets: [],
  deleted: false,
  createdAt: '2026-09-23T06:00:00.000Z',
  updatedAt: '2026-09-23T06:00:00.000Z',
  body: {
    type: 'doc',
    content: [
      heading(2, 'Overview'),
      { type: 'paragraph', content: [{ type: 'text', text: 'Stopped overnight.' }] },
      heading(2, 'Cold chain'),
      heading(3, 'Compressor'),
      heading(2, 'Audit'),
    ],
  },
  schemaVersion: 2,
};

function summary(noteId: string, title: string) {
  return {
    noteId,
    workspaceId: WS,
    homeProjectId: '',
    authorId: 'u_kiro',
    title,
    scope: { mode: 'workspace' as const },
    attachedTickets: [],
    deleted: false,
    createdAt: '2026-09-20T09:00:00.000Z',
    updatedAt: '2026-09-20T09:00:00.000Z',
  };
}

function world() {
  return stubServices(
    {
      getMyWorkspaces: async () => [WS_REF],
      getMembers: async () => [{ id: 'u_kiro', name: 'Kiro', role: 'owner' }],
      getNote: async (_workspaceId: string, id: string) => (id === NOTE ? NOTE_DETAIL : null),
      getNotes: async () => [summary(NOTE, 'Compressor log'), summary(OTHER_NOTE, 'Cold room audit')],
      getDeletedNotes: async () => [],
      getNoteComments: async () => [],
      getActorNames: async () => [],
    } as Partial<DataSourceQuery>,
    { notifications: { unreadCount: async () => 0, list: async () => ({ notifications: [], nextCursor: null }) } },
  );
}

function stubPhone(on: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: on
      ? (query: string) => ({
          matches: query === HELP_PHONE_QUERY,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
          onchange: null,
        })
      : undefined,
  });
}

function renderPage(noteId?: string) {
  return render(
    <Providers services={world()}>
      <NotesPage {...(noteId === undefined ? {} : { noteId })} />
    </Providers>,
  );
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  stubPhone(false);
});

describe('G-3 Notes on a phone', () => {
  it('25.346 the floating button opens a panel with a Notes/Contents switch: Contents lists the note’s headings in order, Notes lists the notes', async () => {
    stubPhone(true);
    renderPage(NOTE);
    const launcher = await screen.findByRole('button', { name: 'Notes and contents' });
    const panel = screen.getByTestId('notes-panel');
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('data-panel-open', 'false');
    // The drawer toggle and the bottom-left launcher are the DESKTOP forms; neither is drawn on a phone.
    expect(document.querySelector('.gn-notes__tree-toggle')).toBeNull();

    fireEvent.click(launcher);
    expect(launcher).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveAttribute('data-panel-open', 'true');
    const tabs = within(panel).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Notes', 'Contents']);
    expect(within(panel).getByRole('tab', { name: 'Contents' })).toHaveAttribute('aria-selected', 'true');

    // Contents: this note's headings, in document order, as /help's own contents links.
    const list = await within(panel).findByTestId('notes-contents');
    await waitFor(() =>
      expect([...list.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Overview', 'Cold chain', 'Compressor', 'Audit']),
    );
    expect(list.querySelector('a')!.className).toBe('gn-help__nav-link');
    expect(list.querySelectorAll('li[data-heading-level="3"]')).toHaveLength(1);
    // The bottom-left launcher is the DESKTOP form; with the headings known (so it WOULD draw) it is absent here.
    expect(screen.queryByRole('button', { name: 'On this page' })).toBeNull();

    // CONTROL, same it(): the Notes pane is the list, and the headings are gone.
    fireEvent.click(within(panel).getByRole('tab', { name: 'Notes' }));
    expect(await within(panel).findByTestId(`note-row-${OTHER_NOTE}`)).toBeInTheDocument();
    expect(within(panel).queryByTestId('notes-contents')).toBeNull();
    expect(within(panel).getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');

    // CONTROL, same it(): a desktop viewport draws none of this.
    cleanup();
    stubPhone(false);
    renderPage(NOTE);
    await screen.findByTestId('note-document');
    expect(screen.queryByRole('button', { name: 'Notes and contents' })).toBeNull();
    expect(screen.queryByTestId('notes-panel')).toBeNull();
    expect(document.querySelector('.gn-notes__tree-toggle')).not.toBeNull();
    // ...and it is the headings that make that launcher draw, so the phone arm's absence above is a real one.
    expect(await screen.findByRole('button', { name: 'On this page' })).toBeInTheDocument();
  });

  it('25.347 the floating button sits where /help’s does: the same classes, and no rule of Notes’ own moves it', async () => {
    stubPhone(true);
    renderPage(NOTE);
    const notesLauncher = await screen.findByRole('button', { name: 'Notes and contents' });
    cleanup();
    render(<HelpBrowser />);
    const helpLauncher = await screen.findByRole('button', { name: 'Contents and search' });

    expect(notesLauncher.className).toBe(helpLauncher.className);
    expect(notesLauncher.className.split(' ')).toEqual(expect.arrayContaining(['gn-toc-launcher__button', 'gn-help__launcher']));
    // The one rule that places it: bottom-right, lifted over the bottom bar, inside /help's own phone arm.
    const placed = UI_CSS.match(/\.gn-help__launcher\s*\{([^}]*)\}/g)!.join('\n');
    expect(placed).toContain('right: max(1rem');
    expect(placed).toContain('var(--gn-bar-lift, 0px)');
    // CONTROL: nothing in the page stylesheet re-places it, so the two screens cannot drift apart.
    expect(GLOBALS_CSS).not.toMatch(/\.gn-help__launcher\b/);
  });

  it('25.348 the panel holds the page’s ONE search box, and it narrows the Contents list', async () => {
    stubPhone(true);
    renderPage(NOTE);
    fireEvent.click(await screen.findByRole('button', { name: 'Notes and contents' }));
    const panel = screen.getByTestId('notes-panel');
    // One field, in the panel — not a second copy in the page header.
    expect(screen.getAllByRole('searchbox', { name: 'Search notes' })).toHaveLength(1);
    expect(within(panel).getByRole('searchbox', { name: 'Search notes' })).toBeInTheDocument();

    const list = await within(panel).findByTestId('notes-contents');
    await waitFor(() => expect(list.querySelectorAll('a')).toHaveLength(4));
    fireEvent.change(within(panel).getByRole('searchbox', { name: 'Search notes' }), { target: { value: 'cold' } });
    await waitFor(() =>
      expect([...within(panel).getByTestId('notes-contents').querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Cold chain']),
    );
    // CONTROL: a query matching nothing says so; clearing it brings every heading back.
    fireEvent.change(within(panel).getByRole('searchbox', { name: 'Search notes' }), { target: { value: 'zzz' } });
    expect(await within(panel).findByText('No headings match.')).toBeInTheDocument();
    fireEvent.change(within(panel).getByRole('searchbox', { name: 'Search notes' }), { target: { value: '' } });
    await waitFor(() => expect(within(panel).getByTestId('notes-contents').querySelectorAll('a')).toHaveLength(4));

    // And on a desktop the same box is back in the page header, outside any panel.
    cleanup();
    stubPhone(false);
    renderPage(NOTE);
    expect(await screen.findByRole('searchbox', { name: 'Search notes' })).toBeInTheDocument();
    expect(screen.getAllByRole('searchbox', { name: 'Search notes' })).toHaveLength(1);
    expect(screen.queryByTestId('notes-panel')).toBeNull();
  });

  it('25.349 with no note open the phone panel opens onto the list and offers no Contents segment', async () => {
    stubPhone(true);
    renderPage();
    const panel = await screen.findByTestId('notes-panel');
    expect(panel).toHaveAttribute('data-panel-open', 'true');
    expect(await within(panel).findByTestId(`note-row-${OTHER_NOTE}`)).toBeInTheDocument();
    expect(within(panel).queryByRole('tab', { name: 'Contents' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Notes and contents' })).toHaveAttribute('aria-expanded', 'true');

    // CONTROL, same it(): with a note open the same panel does offer the switch.
    cleanup();
    renderPage(NOTE);
    fireEvent.click(await screen.findByRole('button', { name: 'Notes and contents' }));
    expect(within(screen.getByTestId('notes-panel')).getByRole('tab', { name: 'Contents' })).toBeInTheDocument();
  });
});
