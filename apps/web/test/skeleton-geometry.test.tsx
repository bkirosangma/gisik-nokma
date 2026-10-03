import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardView, WorkspaceRef } from '@gisik-nokma/app-core';
import { themeStylesheet } from '../../../packages/ui/src/tokens.js';
import { Providers } from '../src/providers.js';
import { clearReadCaches } from '../src/clear-read-caches.js';
import { ProjectPageSkeleton, ListPageShell } from '../src/skeletons/page-shells.js';
import { stubServices } from './helpers/stub-services.js';
import { REPO_ROOT } from '../../../packages/ui/test/helpers/colour-scan.js';
import { parseRules, ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readUiCss } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';

/**
 * Smoothness-2 G1 (cases 25.240-25.253; RE-AUDIT §3 G1, `smoothness-2-g1/DIAGNOSIS.md`): the skeleton a swap leaves behind reserves
 * the geometry of what replaces it. jsdom lays nothing out, so the geometry contract is read from the stylesheet text with the code's
 * own selectors, and the DOM halves mount the real page. The painted numbers are the capture's (`smoothness-baseline.json`, 25.244).
 * This file holds the BOARD half (25.240-25.243); the notes half and the my-work half have their own files.
 */
const WORKSPACE = 'ws_1';
const PROJECT = 'p_1';
const PHONE = '@media (max-width: 40rem)';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: 'ws_1', projectId: 'p_1' }),
  usePathname: () => '/w/ws_1/p/p_1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro' } }, isPending: false }), signOut: async () => ({ data: {}, error: null }) },
}));
vi.mock('../src/use-can-moderate-comments.js', () => ({ useCanModerateComments: () => false }));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

const ui = readUiCss();
const globals = readGlobalsCss();
const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8');

const workspace = (): WorkspaceRef => ({
  id: WORKSPACE,
  name: 'Corner Shop',
  prefix: 'CS',
  role: 'owner',
  archived: false,
  memberCount: 1,
  nameRestrictedProjectCount: 0,
  projects: [{ id: PROJECT, name: 'Stockroom', archived: false, prefix: 'SR', ticketCount: 0, blockedCount: 0 }],
});
const group = (workflowId: string, workflowName: string) => ({
  workflowId,
  workflowVersion: 1,
  workflowName,
  columns: [{ stateId: `${workflowId}_doing`, name: 'Doing', category: 'active' as const, blocked: false, creatable: true, cards: [] }],
});
const board = (groups: number): BoardView => ({ projectId: PROJECT, groups: [group('wf_1', 'Basic'), group('wf_2', 'Errands')].slice(0, groups) });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}
function stubViewport(phone: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => ({ matches: phone, media, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}
const mount = (overrides: Parameters<typeof stubServices>[0] = {}) =>
  render(
    <Providers services={stubServices({ getMyWorkspaces: async () => [workspace()], getMembers: async () => [], getTickets: async () => ({ projectId: PROJECT, rows: [] }), ...overrides })}>
      <ProjectPage />
    </Providers>,
  );

beforeEach(() => {
  window.localStorage.clear();
  clearReadCaches();
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'matchMedia');
});

/** The `--gn-skeleton-h` a skeleton part carries inline (what `Skeleton` writes from its `height` prop). */
const heightOf = (el: Element | null) => (el as HTMLElement | null)?.style.getPropertyValue('--gn-skeleton-h') ?? null;

describe('a title skeleton is the title (G1 §0; board 1440 CLS 0.2115 -> 0.0071)', () => {
  it('25.240 the title placeholder takes the title\'s own line box at both sizes, and no site names the undeclared --gn-title-page-size', () => {
    // The class carries the height; the two numbers are the real title's line heights, read from the rules they must equal.
    const title = valueOf(ruleExactly(globals, '.gn-skeleton--title'), '--gn-skeleton-h');
    expect(title).toBe(valueOf(ruleExactly(globals, '.gn-page-title'), 'line-height'));
    expect(title).toBe(valueOf(ruleExactly(ui, '.gn-project__title'), 'line-height'));
    const phone = valueOf(ruleExactly(globals, '.gn-skeleton--title', PHONE), '--gn-skeleton-h');
    expect(phone).toBe(valueOf(ruleExactly(globals, '.gn-page-title', PHONE), 'line-height'));
    expect(phone).toBe(valueOf(ruleExactly(ui, '.gn-project__title', PHONE), 'line-height'));
    // The phantom variable: not one of the eight sites uses it, and no stylesheet or token file declares it. CONTROL: the real tokens
    // (`--gn-title-page`, `--gn-title-page-phone`) ARE declared in the files scanned, so the scan reads declarations at all, and a
    // `var(--gn-title-page-size)` height would resolve to nothing (1em, 16px).
    const sites = [
      'apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx',
      'apps/web/app/w/[workspaceId]/page.tsx',
      'apps/web/src/notes/note-skeletons.tsx',
      'apps/web/src/skeletons/page-shells.tsx',
    ];
    for (const site of sites) expect(read(site), site).not.toContain('--gn-title-page-size');
    const declarations = [ui, globals, themeStylesheet()].join('\n');
    expect(declarations).toMatch(/--gn-title-page:/);
    expect(declarations).toMatch(/--gn-title-page-phone:/);
    expect(declarations).not.toMatch(/--gn-title-page-size\s*:/);
    // Every title placeholder uses the class (five in the route shells, one each on the workspace home, the note document, the board).
    const shells = renderToStaticMarkup(<ListPageShell title="Inbox" />);
    expect(shells).toContain('gn-skeleton--title');
  });

  it('25.243 the identity block reserves the real block\'s heights: breadcrumb at its line height, the title row at the Edit button\'s 2.75rem, for every role', async () => {
    const open = deferred<WorkspaceRef[]>();
    mount({ getBoard: async () => board(1), getMyWorkspaces: () => open.promise });
    const identity = await waitFor(() => {
      const el = document.querySelector('.gn-project__identity');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    const crumb = identity.querySelector('.gn-project__breadcrumb .gn-skeleton');
    expect(heightOf(crumb)).toBe(valueOf(ruleExactly(ui, '.gn-project__breadcrumb'), 'line-height'));
    // The title placeholder sits inside the real `.gn-project__title-row`, which holds 2.75rem whatever its content is.
    const row = identity.querySelector('.gn-project__title-row');
    expect(row).not.toBeNull();
    expect(row?.querySelector('.gn-skeleton--title')).not.toBeNull();
    expect(valueOf(ruleExactly(globals, '.gn-project__title-row'), 'min-height')).toBe('2.75rem');
    // The row the names then arrive in is the SAME element class (a viewer's row has no Edit button and would otherwise be 41px).
    open.resolve([workspace()]);
    await screen.findByRole('heading', { name: 'Stockroom' });
    expect(identity.querySelector('.gn-project__title-row .gn-project__title')).not.toBeNull();
    // Control: the old placeholders (1em, an undeclared variable) are not what the identity carries.
    expect(identity.querySelectorAll('[style*="1em"], [style*="title-page-size"]')).toHaveLength(0);
  });
});

describe('the header keeps the workflow select\'s place while the board is on its way (G1; board 1440 header grew leftwards)', () => {
  it('25.241 a desktop header holds a 10.5rem x 2.75rem slot until the board answers; it is replaced by the select (2+ workflows) or leaves (1); a phone has none, and CSS hides it in the pre-script frame', async () => {
    stubViewport(false);
    const open = deferred<BoardView>();
    mount({ getBoard: () => open.promise });
    const slot = await waitFor(() => {
      const el = document.querySelector('.gn-project__header > .gn-project__workflow-slot');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(slot.style.getPropertyValue('--gn-skeleton-w')).toBe('10.5rem');
    expect(heightOf(slot)).toBe(valueOf(ruleExactly(ui, '.gn-project__workflow-select'), 'min-height'));
    open.resolve(board(2));
    expect(await screen.findByRole('combobox', { name: 'Workflow' })).toBeInTheDocument();
    expect(document.querySelector('.gn-project__workflow-slot')).toBeNull();
    // A one-workflow board has no picker: the slot leaves.
    cleanup();
    clearReadCaches();
    mount({ getBoard: async () => board(1) });
    await screen.findByRole('heading', { name: 'Stockroom' });
    await waitFor(() => expect(document.querySelector('.gn-project__workflow-slot')).toBeNull());
    expect(screen.queryByRole('combobox', { name: 'Workflow' })).toBeNull();
    // Control: a phone never had the picker in the header, so it reserves nothing for it.
    cleanup();
    clearReadCaches();
    stubViewport(true);
    mount({ getBoard: () => new Promise<BoardView>(() => {}) });
    await waitFor(() => expect(document.querySelector('.gn-project__header')).not.toBeNull());
    expect(document.querySelector('.gn-project__workflow-slot')).toBeNull();
    // The first frame at a phone width is the desktop arm (`isPhone` is false until script), so the stylesheet hides the slot there,
    // exactly as ui.css hides the real select; control: the real select's own rule is the one this mirrors.
    expect(valueOf(ruleExactly(globals, '.gn-project__header > .gn-project__workflow-slot', PHONE), 'display')).toBe('none');
    expect(parseRules(ui).some((rule) => rule.atRule === PHONE && rule.selectors.includes('.gn-project__header > .gn-project__workflow-select'))).toBe(true);
  });
});

describe('the route fallback is the page\'s own head, scope row and rail (S-R1; G1)', () => {
  it('25.242 ProjectPageSkeleton nests the real head > identity > breadcrumb + title row, then the scope row and the rail, in the real order (control: a list shell has none of it)', () => {
    const html = renderToStaticMarkup(<ProjectPageSkeleton tab="board" />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const q = (selector: string) => doc.querySelector(selector);
    expect(q('.gn-project > .gn-project__head > .gn-project__identity > .gn-project__breadcrumb')).not.toBeNull();
    expect(q('.gn-project > .gn-project__head > .gn-project__identity > .gn-project__title-row > .gn-skeleton--title')).not.toBeNull();
    const kids = Array.from(q('.gn-project')?.children ?? []).map((child) => child.className.split(' ')[0]);
    expect(kids).toEqual(['gn-project__head', 'gn-project__scope-row', 'gn-segmented', 'gn-board__rail']);
    expect(html).toContain('gn-project__header');
    // The rail's five tab places are the real segmented control's 2.75rem items, not the loose 2.25rem blocks it had.
    const rail = q('.gn-project__rail');
    expect(rail?.querySelectorAll('.gn-skeleton')).toHaveLength(5);
    for (const part of Array.from(rail?.querySelectorAll('.gn-skeleton') ?? [])) expect((part as HTMLElement).style.getPropertyValue('--gn-skeleton-h')).toBe('2.75rem');
    expect(html).not.toContain('gn-project__tabs-skeleton');
    // The header's controls take the real ones' places too (search, Filters, Create ticket), so a phone's two-row head is the same
    // 144px before and after the swap; the classes are the ones the stylesheet's tablet arm orders.
    expect(q('.gn-project__head > .gn-project__header > .gn-project__search-slot')).not.toBeNull();
    expect(q('.gn-project__head > .gn-project__header > .gn-project__filters')).not.toBeNull();
    expect(q('.gn-project__head > .gn-project__header > .gn-project__create-slot')).not.toBeNull();
    expect(valueOf(ruleExactly(globals, '.gn-project__header > .gn-project__create-slot', '@media (max-width: 64rem)'), 'order')).toBe('1');
    // Control: a screen with no project head draws none of these.
    const list = new DOMParser().parseFromString(renderToStaticMarkup(<ListPageShell title="Inbox" />), 'text/html');
    expect(list.querySelector('.gn-project__head, .gn-project__rail')).toBeNull();
  });
});
