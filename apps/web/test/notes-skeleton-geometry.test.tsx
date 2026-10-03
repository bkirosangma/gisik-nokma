import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELP_PHONE_QUERY } from '@gisik-nokma/app-core';
import type { DataSourceQuery, WorkspaceRef } from '@gisik-nokma/app-core';
import type { NoteSummary } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { clearReadCaches } from '../src/clear-read-caches.js';
import { stubServices } from './helpers/stub-services.js';
import { parseRules, readUiCss, ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';

/**
 * Smoothness-2 G1, the NOTES half (cases 25.245-25.248; notes 390 CLS 1.05, DIAGNOSIS §2): at phone width the first frame is the
 * phone layout, the panel's top edge never moves, and the lists of every workspace arrive in one commit. jsdom paints nothing, so the
 * stylesheet halves read the rules with the code's own selectors; the behaviour halves mount the real page.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/notes',
  useSearchParams: () => new URLSearchParams(),
}));
let mockSession: { data: { user: { id: string; name: string; email: string } } | null; isPending: boolean } = {
  data: { user: { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' } },
  isPending: false,
};
vi.mock('../src/auth-client.js', () => ({
  authClient: { useSession: () => mockSession, signOut: async () => ({ data: {}, error: null }) },
}));

import { NotesPage } from '../src/notes/notes-page.js';

const ui = readUiCss();
const globals = readGlobalsCss();
const PHONE = `@media ${HELP_PHONE_QUERY}`;

const ws = (id: string, name: string): WorkspaceRef => ({ id, name, prefix: id.slice(0, 2).toUpperCase(), role: 'owner', archived: false, memberCount: 1, nameRestrictedProjectCount: 0, projects: [] });
const note = (workspaceId: string, noteId: string, title: string): NoteSummary => ({
  noteId,
  workspaceId,
  homeProjectId: '',
  authorId: 'u_kiro',
  title,
  scope: { mode: 'workspace' },
  attachedTickets: [],
  deleted: false,
  createdAt: '2026-09-20T09:00:00.000Z',
  updatedAt: '2026-09-20T09:00:00.000Z',
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}
function stubPhone(on: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: on
      ? (query: string) => ({ matches: query === HELP_PHONE_QUERY, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null })
      : undefined,
  });
}
const world = (query: Partial<DataSourceQuery>) =>
  stubServices(
    { getMyWorkspaces: async () => [ws('wsa', 'Alpha'), ws('wsb', 'Beta')], getMembers: async () => [], getDeletedNotes: async () => [], getNoteComments: async () => [], getActorNames: async () => [], ...query } as Partial<DataSourceQuery>,
    { notifications: { unreadCount: async () => 0, list: async () => ({ notifications: [], nextCursor: null }) } },
  );
const page = (services: ReturnType<typeof world>) => (
  <Providers services={services}>
    <NotesPage />
  </Providers>
);

beforeEach(() => {
  cleanup();
  clearReadCaches();
  window.localStorage.clear();
  mockSession = { data: { user: { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' } }, isPending: false };
});
afterEach(() => {
  cleanup();
  stubPhone(false);
});

describe('the phone layout is the first frame (G1 §2 A, D)', () => {
  it('25.245 at the phone breakpoint the pre-script frame draws neither the in-flow tree nor the drawer toggle, the bar and the panel head hold the heights of what arrives, and the drawer rules still apply above it', () => {
    // The breakpoint is /help's own (the phone arm of the script is `useNotesPhone`, which asks the same query).
    expect(HELP_PHONE_QUERY).toBe('(max-width: 47.9375rem)');
    expect(valueOf(ruleExactly(globals, ['.gn-notes__tree--drawer', ".gn-notes__tree--drawer[data-open='true']", '.gn-notes__tree-toggle'], PHONE), 'display')).toBe('none');
    // It comes AFTER the `max-width: 60rem` arm that shows the open drawer and the toggle: the later equal-specificity rule wins.
    const source = parseRules(globals);
    const order = (atRule: string | null, selector: string) => source.findIndex((rule) => rule.atRule === atRule && rule.selectors.includes(selector));
    expect(order(PHONE, '.gn-notes__tree-toggle')).toBeGreaterThan(order('@media (max-width: 60rem)', '.gn-notes__tree-toggle'));
    expect(order(PHONE, ".gn-notes__tree--drawer[data-open='true']")).toBeGreaterThan(order('@media (max-width: 60rem)', ".gn-notes__tree--drawer[data-open='true']"));
    // CONTROL: the 60rem arm still shows them (a tablet keeps its drawer), and no top-level rule hides the open drawer.
    expect(valueOf(ruleExactly(globals, ".gn-notes__tree--drawer[data-open='true']", '@media (max-width: 60rem)'), 'display')).toBe('block');
    expect(source.filter((rule) => rule.atRule === null && rule.selectors.includes(".gn-notes__tree--drawer[data-open='true']") && valueOf(rule.body, 'display') === 'none')).toEqual([]);
    // The bar holds Create note's 2.75rem; the panel head holds the search header's two 2.75rem rows and the 0.5rem gap between them.
    expect(valueOf(ruleExactly(globals, '.gn-notes__bar--reserved'), 'min-height')).toBe('2.75rem');
    expect(valueOf(ruleExactly(globals, '.gn-notes__panel-head--reserved'), 'min-height')).toBe('6rem');
    expect(valueOf(ruleExactly(globals, '.gn-notes__search'), 'gap')).toBe('0.5rem');
    // At 48rem and up the search is in the page's own header row, which holds the input's 2.75rem (the field's own `min-height`) before
    // the input arrives; the h1's 41px line alone would leave the row 3px short.
    const header = valueOf(ruleExactly(globals, '.gn-notes__header', '@media (min-width: 48rem)'), 'min-height');
    expect(header).toBe('2.75rem');
    expect(header).toBe(valueOf(ruleExactly(ui, '.gn-field__input'), 'min-height'));
  });

  it('25.246 the panel and its launcher are not drawn until the session answers, so the bottom bar\'s lift is in place when they first appear; control: once it answers both are there', async () => {
    stubPhone(true);
    mockSession = { data: null, isPending: true };
    const services = world({ getNotes: async () => [] });
    const view = render(page(services));
    await waitFor(() => expect(document.querySelector('.gn-notes__bar')).not.toBeNull());
    expect(screen.queryByTestId('notes-panel')).toBeNull();
    expect(screen.queryByTestId('notes-launcher')).toBeNull();
    // The bar already holds its place while the session is open (the Create note button arrives later).
    expect(document.querySelector('.gn-notes__bar')).toHaveClass('gn-notes__bar--reserved');
    mockSession = { data: { user: { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' } }, isPending: false };
    view.rerender(page(services));
    expect(await screen.findByTestId('notes-panel')).toBeInTheDocument();
    expect(screen.getByTestId('notes-launcher')).toBeInTheDocument();
    // The head holds the search header's place while the workspaces read is open.
    expect(screen.getByTestId('notes-panel').querySelector('.gn-help__sidebar-head')).toHaveClass('gn-notes__panel-head--reserved');
  });
});

describe('the lists arrive together (G1 §2 C)', () => {
  it('25.247 with the two workspaces\' reads FORCED in reverse order no list is shown until both have answered, and then both are, in one commit', async () => {
    const first = deferred<NoteSummary[]>();
    const second = deferred<NoteSummary[]>();
    const services = world({ getNotes: (workspaceId: string) => (workspaceId === 'wsa' ? first.promise : second.promise) });
    render(page(services));
    const sections = await waitFor(() => {
      const el = document.querySelector('.gn-notes__sections');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    // Reads pending: ONE skeleton list, the sections mounted (their reads run) but out of sight.
    expect(sections).toHaveAttribute('hidden');
    expect(document.querySelectorAll('.gn-notes__tree [aria-busy="true"]')).toHaveLength(1);
    // The SECOND workspace answers first: it must not paint above (or below) the first.
    second.resolve([note('wsb', 'nb', 'Beta note')]);
    await new Promise((settle) => setTimeout(settle, 30));
    expect(sections).toHaveAttribute('hidden');
    expect(document.querySelectorAll('.gn-notes__tree [aria-busy="true"]')).toHaveLength(1);
    // The first answers: both lists appear in the same commit, and the skeleton goes in it.
    first.resolve([note('wsa', 'na', 'Alpha note')]);
    await waitFor(() => expect(sections).not.toHaveAttribute('hidden'));
    expect(document.querySelectorAll('.gn-notes__tree [aria-busy="true"]')).toHaveLength(0);
    expect(document.querySelectorAll('.gn-notes__section')).toHaveLength(2);
    expect(screen.getByText('Alpha note')).toBeInTheDocument();
    expect(screen.getByText('Beta note')).toBeInTheDocument();
    // Control: the wrapper adds no box (`display: contents`), and its hidden state is the only thing that hides it.
    expect(valueOf(ruleExactly(globals, '.gn-notes__sections'), 'display')).toBe('contents');
    expect(valueOf(ruleExactly(globals, '.gn-notes__sections[hidden]'), 'display')).toBe('none');
  });

  it('25.247 the deleted-notes read is half of "settled": with every list answered and one workspace\'s deleted read still open, no list is shown; when it answers, all are', async () => {
    // A section's deleted group arriving after the lists showed would land inside them and move them.
    const lateDeleted = deferred<NoteSummary[]>();
    const services = world({
      getNotes: async (workspaceId: string) => [note(workspaceId, `n_${workspaceId}`, workspaceId === 'wsa' ? 'Alpha note' : 'Beta note')],
      getDeletedNotes: (workspaceId: string) => (workspaceId === 'wsb' ? lateDeleted.promise : Promise.resolve([])),
    });
    render(page(services));
    const sections = await waitFor(() => {
      const el = document.querySelector('.gn-notes__sections');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    // Both note lists have answered (their rows are in the DOM, inside the hidden wrapper); only wsb's deleted read is open.
    await waitFor(() => expect(sections.querySelectorAll('[data-testid^="note-row-"]')).toHaveLength(2));
    await new Promise((settle) => setTimeout(settle, 30));
    expect(sections).toHaveAttribute('hidden');
    expect(document.querySelectorAll('.gn-notes__tree [aria-busy="true"]')).toHaveLength(1);
    // It answers: the lists show, and the skeleton goes, together.
    lateDeleted.resolve([]);
    await waitFor(() => expect(sections).not.toHaveAttribute('hidden'));
    expect(document.querySelectorAll('.gn-notes__tree [aria-busy="true"]')).toHaveLength(0);
    expect(screen.getByText('Alpha note')).toBeInTheDocument();
    expect(screen.getByText('Beta note')).toBeInTheDocument();
  });
});

describe('the phone panel has one height while open (G1 §2 B; owner: a fixed height)', () => {
  it('25.248 `.gn-help__sidebar--notes` is exactly as tall as /help\'s panel is allowed to be (both the vh and the dvh line), the aside wears it, and /help\'s own panel does not (control)', async () => {
    const cap = ruleExactly(ui, '.gn-help__sidebar', PHONE);
    const fixed = ruleExactly(globals, '.gn-help__sidebar--notes', PHONE);
    // Two `max-height` declarations in the original (vh fallback, dvh), two `height`s here: compare each in order.
    const declarations = (body: string, property: string) => [...body.matchAll(new RegExp(`(?:^|;|\\s)${property}\\s*:\\s*([^;]+);`, 'g'))].map((m) => m[1]!.replace(/\s+/g, ' ').trim());
    expect(declarations(fixed, 'height')).toEqual(declarations(cap, 'max-height'));
    expect(declarations(fixed, 'height')).toHaveLength(2);
    expect(valueOf(fixed, 'min-height')).toBeNull();
    // The aside wears the class (the one Notes panel), and the modifier exists nowhere else in a stylesheet or component.
    stubPhone(true);
    render(page(world({ getNotes: async () => [] })));
    expect(await screen.findByTestId('notes-panel')).toHaveClass('gn-help__sidebar', 'gn-help__sidebar--notes');
    expect(ui).not.toContain('gn-help__sidebar--notes');
  });
});
