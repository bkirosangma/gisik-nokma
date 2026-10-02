import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardView, WorkspaceRef } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';
import { parseRules, readUiCss, ruleExactly, rulesNaming, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Neo follow-up F-2 (audit BRD-06, PV-03), cases 23.330–23.335: the phone project header. At 390×844 the first card sat at 78% of
 * the screen under a header that spent 283px on controls; the owner's ruling (2026-10-02) moves the workflow picker and the
 * in-progress switch into the Filters sheet on phones, makes Edit an icon in the title's row, collapses the empty scope-note
 * band, hides the board's column chip and drops the List's Columns chooser. The behaviour halves (23.330, 23.331) mount the real
 * page with a stubbed `matchMedia`; the stylesheet halves (23.331–23.335) read the sources, because jsdom paints nothing. The
 * paint itself — the first card or list row at or above 51% of 844 at 390 and 360 — is a browser measurement recorded in
 * `test-cases/23-ux-fixes.md` (23.336).
 */

const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';
const PHONE = '@media (max-width: 40rem)';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: '01J9WORKSPACE0000000000000', projectId: '01J9PROJECT000000000000000' }),
  usePathname: () => '/w/01J9WORKSPACE0000000000000/p/01J9PROJECT000000000000000',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

const ui = readUiCss();
const globals = readGlobalsCss();

function workspace(role: string): WorkspaceRef {
  return {
    id: WORKSPACE,
    name: 'Garo Hills Logistics',
    prefix: 'GH',
    role,
    archived: false,
    memberCount: 3,
    nameRestrictedProjectCount: 0,
    projects: [{ id: PROJECT, name: 'Errand tracking', prefix: 'ET', description: 'Runs', archived: false, ticketCount: 0, blockedCount: 0 }],
  };
}

/** Two workflows, so the picker is offered (a project with one has no real choice). */
function twoWorkflows(): BoardView {
  const group = (workflowId: string, workflowName: string) => ({
    workflowId,
    workflowVersion: 1,
    workflowName,
    columns: [{ stateId: `${workflowId}_doing`, name: 'Doing', category: 'active' as const, blocked: false, creatable: true, cards: [] }],
  });
  return { projectId: PROJECT, groups: [group('wf_1', 'Basic'), group('wf_2', 'Errands')] };
}

function stubViewport(phone: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => ({ matches: phone, media, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}

function mount(role = 'owner') {
  render(
    <Providers
      services={stubServices({
        getMyWorkspaces: async () => [workspace(role)],
        getBoard: async () => twoWorkflows(),
        getMembers: async () => [],
        getTickets: async () => ({ projectId: PROJECT, rows: [] }),
      })}
    >
      <ProjectPage />
    </Providers>,
  );
}

beforeEach(() => {
  cleanup();
  clearWorkspaceNameCache();
  clearWorkspaceProjectsCache();
});
afterEach(() => Reflect.deleteProperty(window, 'matchMedia'));

const header = () => document.querySelector('.gn-project__header') as HTMLElement;

describe('23.330 on a phone the workflow picker and the in-progress switch live in the Filters sheet, not the header (audit BRD-06, PV-03)', () => {
  it('23.330 at ≤40rem the header holds neither control and the sheet carries both, writing the page state; above it the header keeps them and the sheet has none', async () => {
    stubViewport(true);
    mount();
    const filters = await screen.findByRole('button', { name: 'Filters' });
    // The picker waits for the board (two groups), so wait on the sheet's copy, not on an absence.
    await userEvent.click(filters);
    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    const picker = await within(dialog).findByRole('combobox', { name: 'Workflow' });
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual(['All workflows', 'Basic', 'Errands']);
    const sheetSwitch = within(dialog).getByRole('checkbox', { name: 'Only tickets in progress' });
    expect(sheetSwitch).not.toBeChecked();
    // Neither is in the header any more.
    expect(within(header()).queryByRole('combobox', { name: 'Workflow' })).toBeNull();
    expect(within(header()).queryByRole('checkbox', { name: 'Only tickets in progress' })).toBeNull();

    // The sheet's controls write the PAGE's state: the switch fills the standing scope-note row behind the sheet, and the picker
    // narrows the board (its chip names the workflow).
    await userEvent.click(sheetSwitch);
    expect(screen.getByTestId('list-filter-note').textContent).toMatch(/only for tickets in progress/);
    await userEvent.selectOptions(picker, 'wf_2');
    expect(within(dialog).getByRole('combobox', { name: 'Workflow' })).toHaveValue('wf_2');

    // CONTROL (same it): the very same page above the phone breakpoint keeps both in the header and the sheet repeats neither.
    cleanup();
    stubViewport(false);
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Filters' }));
    const wide = await screen.findByRole('dialog', { name: 'Filters' });
    expect(await within(header()).findByRole('combobox', { name: 'Workflow' })).toBeInTheDocument();
    expect(within(header()).getByRole('checkbox', { name: 'Only tickets in progress' })).toBeInTheDocument();
    expect(within(wide).queryByRole('combobox', { name: 'Workflow' })).toBeNull();
    expect(within(wide).queryByRole('checkbox', { name: 'Only tickets in progress' })).toBeNull();
  });
});

describe('23.331 Edit is a same-row icon button on a phone (audit BRD-06)', () => {
  it('23.331 the Edit button carries the glyph and the word, its accessible name is the same at every width, and the phone arm swaps them and stops the row wrapping', async () => {
    stubViewport(false);
    mount();
    const edit = await screen.findByRole('button', { name: 'Edit Errand tracking' });
    expect(edit.classList.contains('gn-project__edit')).toBe(true);
    expect(edit.querySelector('.gn-project__edit-icon svg[aria-hidden="true"]')).not.toBeNull();
    expect(edit.querySelector('.gn-project__edit-label')?.textContent).toBe('Edit');
    // It is a child of the title's own row (`ProjectTitle`'s `.gn-project__title-row`), beside the h1.
    expect(edit.parentElement?.className).toBe('gn-project__title-row');
    expect(edit.parentElement?.querySelector('h1')).not.toBeNull();

    const row = ruleExactly(globals, '.gn-project__title-row', PHONE);
    expect(valueOf(row, 'flex-wrap')).toBe('nowrap');
    const button = ruleExactly(globals, '.gn-project__title-row .gn-project__edit', PHONE);
    expect(valueOf(button, 'width')).toBe('2.75rem');
    expect(valueOf(button, 'padding')).toBe('0');
    expect(valueOf(ruleExactly(globals, '.gn-project__title-row .gn-project__edit-label', PHONE), 'display')).toBe('none');
    expect(valueOf(ruleExactly(globals, '.gn-project__title-row .gn-project__edit-icon', PHONE), 'display')).toBe('inline-flex');
    // The button keeps the shared 44px floor: nothing here lowers `min-height`.
    expect(valueOf(button, 'min-height')).toBeNull();

    // CONTROL (same it): above 40rem the row still wraps, the glyph is not drawn, and the word is (no rule hides it).
    expect(valueOf(ruleExactly(globals, '.gn-project__title-row'), 'flex-wrap')).toBe('wrap');
    expect(valueOf(ruleExactly(globals, '.gn-project__edit-icon'), 'display')).toBe('none');
    expect(rulesNaming(globals, '.gn-project__edit-label').filter((rule) => rule.atRule === null)).toEqual([]);

    // A member sees the title without Edit at all.
    cleanup();
    mount('member');
    await screen.findByRole('heading', { level: 1, name: 'Errand tracking' });
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
  });
});

/** The index of the rule in the stylesheet, so source order can be compared. */
function position(css: string, selectors: string[], atRule: string | null): number {
  const index = parseRules(css).findIndex(
    (rule) => rule.atRule === atRule && rule.selectors.length === selectors.length && rule.selectors.every((s, i) => s === selectors[i]),
  );
  if (index === -1) throw new Error(`no rule ${selectors.join(', ')} under ${atRule ?? 'top level'}`);
  return index;
}

describe('23.332 the empty scope-note band collapses on phones only (owner 2026-10-02; amends 13.1383)', () => {
  it('23.332 the standing row is `display: none` while empty at ≤40rem, after its base rule; the reserved 1.125rem band above 40rem is untouched', () => {
    expect(valueOf(ruleExactly(ui, '.gn-project__scope-row:empty', PHONE), 'display')).toBe('none');
    expect(position(ui, ['.gn-project__scope-row:empty'], PHONE)).toBeGreaterThan(position(ui, ['.gn-project__scope-row'], null));

    // CONTROL: the base rule still reserves one line and carries no `display`, and no OTHER phone rule hides the row (a note with
    // words must show).
    const base = ruleExactly(ui, '.gn-project__scope-row');
    expect(valueOf(base, 'min-height')).toBe('1.125rem');
    expect(valueOf(base, 'display')).toBeNull();
    const hiders = parseRules(ui).filter(
      (rule) => rule.atRule === PHONE && rule.selectors.some((selector) => selector.startsWith('.gn-project__scope-row')),
    );
    expect(hiders.map((rule) => rule.selectors)).toEqual([['.gn-project__scope-row:empty']]);
  });

  it('23.332 the row is the same node, empty with the switch off and filled with it on (the element the :empty rule keys on)', async () => {
    stubViewport(false);
    mount();
    const note = await screen.findByTestId('list-filter-note');
    expect(note.textContent).toBe('');
    expect(note.matches(':empty')).toBe(true);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Only tickets in progress' }));
    expect(screen.getByTestId('list-filter-note')).toBe(note);
    expect(note.matches(':empty')).toBe(false);
  });
});

describe('23.333 the phone header is tight: one row of identity, 8px gaps, a one-line crumb (audit BRD-06, PV-03)', () => {
  it('23.333 the phone arm sets the 0.5rem column gap, a 0.5rem head margin and a one-line breadcrumb; the 0.875rem column gap and 1.5rem margin hold above 40rem', () => {
    expect(valueOf(ruleExactly(ui, '.gn-project', PHONE), 'gap')).toBe('0.5rem');
    const head = ruleExactly(ui, '.gn-project__head', PHONE);
    expect(valueOf(head, 'margin-top')).toBe('0.5rem');
    expect(valueOf(head, 'row-gap')).toBe('0.25rem');
    const crumb = ruleExactly(ui, '.gn-project__breadcrumb', PHONE);
    expect(valueOf(crumb, 'white-space')).toBe('nowrap');
    expect(valueOf(crumb, 'text-overflow')).toBe('ellipsis');
    expect(position(ui, ['.gn-project'], PHONE)).toBeGreaterThan(position(ui, ['.gn-project'], null));
    expect(position(ui, ['.gn-project__head'], PHONE)).toBeGreaterThan(position(ui, ['.gn-project__head'], null));

    // CONTROL: the desktop column gap and head margin are what they were.
    expect(valueOf(ruleExactly(ui, '.gn-project'), 'gap')).toBe('0.875rem');
    expect(valueOf(ruleExactly(ui, '.gn-project__head'), 'margin-top')).toBe('1.5rem');
    expect(valueOf(ruleExactly(ui, '.gn-project__breadcrumb'), 'white-space')).toBeNull();
  });

  it('23.333 the two header controls the sheet carries are hidden inline for the frames before script runs, by direct-child selectors only (the sheet\'s own picker has the same class)', () => {
    const hidden = ruleExactly(ui, ['.gn-project__header > .gn-project__workflow-select', '.gn-project__header > .gn-switch-row'], PHONE);
    expect(valueOf(hidden, 'display')).toBe('none');
    // CONTROL: no phone rule hides the bare class, which the sheet's picker wears.
    const bare = parseRules(ui).filter((rule) => rule.atRule === PHONE && rule.selectors.includes('.gn-project__workflow-select'));
    expect(bare).toEqual([]);
  });
});

describe('23.334 the board column header and the List controls on a phone (audit BRD-06, PV-03)', () => {
  it('23.334 at ≤40rem the column chip and count are hidden, and a header with no `Close all` is not drawn; above 40rem the header is the one rule it was', () => {
    expect(valueOf(ruleExactly(ui, ['.gn-board__column-header > .gn-chip', '.gn-board__column-header > .gn-board__count'], PHONE), 'display')).toBe('none');
    expect(valueOf(ruleExactly(ui, '.gn-board__column-header--bare', PHONE), 'display')).toBe('none');
    // The action stays: nothing in the phone arm hides it.
    const hidesAction = parseRules(ui).filter(
      (rule) => rule.atRule === PHONE && rule.selectors.some((selector) => selector.includes('.gn-board__column-action')),
    );
    expect(hidesAction.filter((rule) => valueOf(rule.body, 'display') === 'none')).toEqual([]);
    // CONTROL: the base header rule is untouched and the `--bare` hook is only ever painted by the phone arm.
    expect(valueOf(ruleExactly(ui, '.gn-board__column-header'), 'display')).toBe('flex');
    expect(rulesNaming(ui, '.gn-board__column-header--bare').filter((rule) => rule.atRule === null)).toEqual([]);
  });

  it('23.335 at ≤40rem the List drops its Columns chooser and tray, gives the count a line, and tightens its gaps, after the base rules; above it nothing changes', () => {
    const arm = ruleExactly(ui, ['.gn-list__columns-toggle', '.gn-list__columns-tray'], PHONE);
    expect(valueOf(arm, 'display')).toBe('none');
    expect(valueOf(ruleExactly(ui, '.gn-list__summary', PHONE), 'flex')).toBe('1 0 100%');
    expect(valueOf(ruleExactly(ui, '.gn-list', PHONE), 'gap')).toBe('0.5rem');
    expect(valueOf(ruleExactly(ui, '.gn-list__controls', PHONE), 'gap')).toBe('0.5rem 0.875rem');
    expect(position(ui, ['.gn-list__columns-toggle', '.gn-list__columns-tray'], PHONE)).toBeGreaterThan(position(ui, ['.gn-list__columns-tray[hidden]'], null));
    expect(position(ui, ['.gn-list'], PHONE)).toBeGreaterThan(position(ui, ['.gn-list'], null));
    // CONTROL: the base toggle is the inline-flex pill and the base list gap is 1.1rem.
    expect(valueOf(ruleExactly(ui, '.gn-list__columns-toggle'), 'display')).toBe('inline-flex');
    expect(valueOf(ruleExactly(ui, '.gn-list'), 'gap')).toBe('1.1rem');
    expect(valueOf(ruleExactly(ui, '.gn-list__summary'), 'flex')).toBeNull();
  });
});
