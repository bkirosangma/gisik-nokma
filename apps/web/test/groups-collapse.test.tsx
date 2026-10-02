import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupRow } from '@gisik-nokma/domain';
import type { ProjectRef } from '@gisik-nokma/app-core';
import { parseRules, rulesNaming, ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { cssOf } from '../../../packages/ui/test/helpers/style-patterns.js';
import { GroupedProjects } from '../src/grouped-projects.js';
import { GroupsTree, type GroupActionResult } from '../src/settings/groups-tree.js';

/**
 * Smoothness add-on G-1 (bucket 25, block 25.300-25.319, `test-cases/25-smoothness.md`): every group level
 * collapses, on the workspace home and in Settings → Groups, and a group's coloured line runs the whole of its
 * contents like an IDE's bracket guide. Owner, 2026-10-02 ~21:05: "Groups, all 4 levels are collapsible" and
 * "make the Groups Coloured lines span their entire contents".
 */
const USER = 'user_kiro';
const WORKSPACE = '01J9WORKSPACE0000000000000';
const HOME_KEY = `gn-groups-collapsed:${USER}:${WORKSPACE}`;
const TREE_KEY = `gn-groups-tree-collapsed:${USER}:${WORKSPACE}`;

const g = (id: string, parentId: string | null, level: 1 | 2 | 3 | 4, name: string, rank: string, childCount = 0): GroupRow => ({
  id,
  parentId,
  level,
  name,
  rank,
  projectCount: 0,
  childCount,
});

/** Retail > Stores > Kiosks > Carts is the four-deep spine; Retail > Online and Operations are the siblings. */
const GROUPS: GroupRow[] = [
  g('g-retail', null, 1, 'Retail', 'a1', 2),
  g('g-ops', null, 1, 'Operations', 'a2'),
  g('g-stores', 'g-retail', 2, 'Stores', 'a1', 1),
  g('g-online', 'g-retail', 2, 'Online', 'a2'),
  g('g-kiosks', 'g-stores', 3, 'Kiosks', 'a1', 1),
  g('g-carts', 'g-kiosks', 4, 'Carts', 'a1'),
];
const project = (id: string, name: string, groupId: string | null): ProjectRef => ({
  id,
  name,
  prefix: id.toUpperCase(),
  archived: false,
  ticketCount: 0,
  blockedCount: 0,
  groupId,
});
const PROJECTS: ProjectRef[] = [
  project('p1', 'Shop operations', 'g-stores'),
  project('p2', 'Deliveries', 'g-ops'),
  project('p3', 'Old signage', 'g-stores'),
  project('p4', 'Cart rota', 'g-carts'),
  project('p5', 'Loose ends', null),
  project('p6', 'Kiosk plan', 'g-kiosks'),
  project('p7', 'Web shop', 'g-online'),
];

function home(userId: string | undefined = USER) {
  return render(
    <GroupedProjects
      groups={GROUPS}
      projects={PROJECTS}
      userId={userId}
      workspaceId={WORKSPACE}
      renderCard={(p) => (
        <li key={p.id} data-testid={`row-${p.id}`}>
          {p.name}
        </li>
      )}
    />,
  );
}
const toggle = (name: string, state: 'Collapse' | 'Expand' = 'Collapse') => screen.getByRole('button', { name: `${state} ${name}` });
/** The collapsible body of a group section: the element the toggle controls. */
const bodyOf = (name: string): HTMLElement => {
  const id = toggle(name, 'Collapse').getAttribute('aria-controls') ?? '';
  return document.getElementById(id)!;
};

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('25.300 every group level collapses on the workspace home', () => {
  it.each([
    [1, 'Retail', 'Stores', ['p1', 'p3', 'p4', 'p6']],
    [2, 'Stores', 'Kiosks', ['p4', 'p6']],
    [3, 'Kiosks', 'Carts', ['p4']],
    [4, 'Carts', null, []],
  ])('25.300 level %i (%s): the disclosure collapses and re-opens it', async (_level, name, child, hiddenRows) => {
    home();
    const open = toggle(name);
    // CONTROL: expanded, named "Collapse <name>", wired to a body that is shown, with its projects present.
    expect(open).toHaveAttribute('aria-expanded', 'true');
    const body = bodyOf(name);
    expect(body).not.toHaveAttribute('hidden');
    if (child !== null) expect(screen.getByRole('heading', { name: child })).toBeVisible();
    await userEvent.click(open);
    const closed = toggle(name, 'Expand');
    expect(closed).toHaveAttribute('aria-expanded', 'false');
    expect(closed).toHaveAttribute('aria-controls', body.id);
    expect(body).toHaveAttribute('hidden');
    if (child !== null) expect(screen.queryByRole('heading', { name: child })).toBeNull();
    for (const id of hiddenRows) expect(screen.getByTestId(`row-${id}`)).not.toBeVisible();
    // The heading itself stays: only the subtree goes.
    expect(screen.getByRole('heading', { name })).toBeVisible();
    await userEvent.click(closed);
    expect(toggle(name)).toHaveAttribute('aria-expanded', 'true');
    for (const id of hiddenRows) expect(screen.getByTestId(`row-${id}`)).toBeVisible();
  });
});

describe('25.301 collapsing level 1 hides levels 2-4 and every project under it; the count is the subtree', () => {
  it('25.301 Retail collapsed hides Stores, Kiosks, Carts, Online and their five projects; "Retail · 5 projects"', async () => {
    home();
    // CONTROL: expanded shows no count, and the sibling group and the ungrouped section are untouched below.
    expect(screen.queryByText('5 projects')).toBeNull();
    await userEvent.click(toggle('Retail'));
    for (const name of ['Stores', 'Kiosks', 'Carts', 'Online']) expect(screen.queryByRole('heading', { name })).toBeNull();
    for (const id of ['p1', 'p3', 'p4', 'p6', 'p7']) expect(screen.getByTestId(`row-${id}`)).not.toBeVisible();
    const retail = screen.getByRole('region', { name: 'Retail' });
    expect(within(retail).getByText('5 projects')).toBeVisible();
    expect(retail.querySelector('.gn-group-section__head')).toHaveTextContent('Retail· 5 projects');
    // Operations and Ungrouped did not move.
    expect(screen.getByTestId('row-p2')).toBeVisible();
    expect(screen.getByTestId('row-p5')).toBeVisible();
    // A level-2 collapse counts ITS subtree (Stores: its own two, Kiosks' one and Carts' one), and one project is "1 project".
    await userEvent.click(toggle('Retail', 'Expand'));
    await userEvent.click(toggle('Stores'));
    expect(within(screen.getByRole('region', { name: 'Stores' })).getByText('4 projects')).toBeVisible();
    await userEvent.click(toggle('Online'));
    expect(within(screen.getByRole('region', { name: 'Online' })).getByText('1 project')).toBeVisible();
  });
});

describe('25.302 the default is expanded, and Ungrouped is not collapsible', () => {
  it('25.302 every group starts expanded; the Ungrouped section has no disclosure', () => {
    home();
    for (const name of ['Retail', 'Stores', 'Kiosks', 'Carts', 'Online', 'Operations']) {
      expect(toggle(name)).toHaveAttribute('aria-expanded', 'true');
    }
    expect(screen.getByTestId('row-p5')).toBeVisible();
    // CONTROL: the same page does have six toggles, so "none for Ungrouped" is a fact about Ungrouped.
    expect(screen.getAllByRole('button')).toHaveLength(6);
    expect(within(screen.getByRole('region', { name: 'Ungrouped' })).queryByRole('button')).toBeNull();
  });
});

describe('25.303 the home remembers a collapse per user and per workspace', () => {
  it('25.303 the set of collapsed ids is stored under gn-groups-collapsed:<user>:<workspace> and survives a remount', async () => {
    const first = home();
    await userEvent.click(toggle('Stores'));
    await userEvent.click(toggle('Operations'));
    expect(JSON.parse(window.localStorage.getItem(HOME_KEY) ?? 'null')).toEqual(['g-stores', 'g-ops']);
    first.unmount();
    home();
    expect(await screen.findByRole('button', { name: 'Expand Stores' })).toHaveAttribute('aria-expanded', 'false');
    expect(toggle('Operations', 'Expand')).toBeVisible();
    // CONTROL: what was not collapsed is still open.
    expect(toggle('Retail')).toHaveAttribute('aria-expanded', 'true');
    cleanup();
    // Another user on the same device, and another workspace, read the default.
    window.localStorage.setItem(`gn-groups-collapsed:someone-else:${WORKSPACE}`, '["g-retail"]');
    home('someone-else-again');
    expect(toggle('Retail')).toHaveAttribute('aria-expanded', 'true');
    cleanup();
    window.localStorage.setItem(`gn-groups-collapsed:${USER}:another-workspace`, '["g-retail"]');
    home();
    expect(await screen.findByRole('button', { name: 'Expand Stores' })).toBeVisible();
    expect(toggle('Retail')).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('25.304 storage that throws or holds rubbish still renders, expanded', () => {
  it('25.304 a throwing localStorage and an unreadable value both leave every group open, and a toggle still works', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    home();
    expect(toggle('Retail')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('row-p4')).toBeVisible();
    await userEvent.click(toggle('Retail'));
    expect(screen.getByRole('button', { name: 'Expand Retail' })).toHaveAttribute('aria-expanded', 'false');
    expect(get).toHaveBeenCalled();
    cleanup();
    vi.restoreAllMocks();
    // CONTROL: a value that is not a list of ids is refused whole rather than half-honoured.
    window.localStorage.setItem(HOME_KEY, '{"g-retail":true}');
    home();
    expect(toggle('Retail')).toHaveAttribute('aria-expanded', 'true');
    cleanup();
    window.localStorage.setItem(HOME_KEY, '["g-retail",7]');
    home();
    expect(toggle('Retail')).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('25.305 the disclosure is a real, 44px control', () => {
  const css = cssOf('globals');
  it('25.305 the toggle is at least 2.75rem square, drawn by a caret span (the name stays "Collapse <name>"), and its body honours [hidden]', async () => {
    const rule = ruleExactly(css, '.gn-group-section__toggle');
    expect(valueOf(rule, 'min-width')).toBe('2.75rem');
    expect(valueOf(rule, 'min-height')).toBe('2.75rem');
    // The body is `display: flex`, which outranks the UA's own `hidden`: the pair is the proof, the attribute alone is decoration.
    expect(valueOf(ruleExactly(css, '.gn-group-section__body'), 'display')).toBe('flex');
    expect(valueOf(ruleExactly(css, '.gn-group-section__body[hidden]'), 'display')).toBe('none');
    home();
    // CONTROL: the accessible name carries no glyph; the caret is a separate aria-hidden element.
    expect(toggle('Retail').textContent).toBe('');
    expect(toggle('Retail').querySelector('.gn-group-section__caret')).toHaveAttribute('aria-hidden', 'true');
    expect(valueOf(ruleExactly(css, '.gn-group-section__caret::after'), 'content')).toBe("'▸'");
    expect(
      valueOf(ruleExactly(css, ".gn-group-section__toggle[aria-expanded='true'] .gn-group-section__caret::after"), 'content'),
    ).toBe("'▾'");
  });
});

describe('25.306 the home guide is one continuous 2px line in the level colour', () => {
  const css = cssOf('globals');
  const GUIDE = '.gn-group-section[data-level]::before';
  it('25.306 a pseudo-element on the section, from its top to its bottom, 2px, rounded, flat, painted from --gn-level-N', () => {
    const rule = ruleExactly(css, GUIDE);
    expect(valueOf(rule, 'position')).toBe('absolute');
    expect(valueOf(rule, 'top')).toBe('0');
    expect(valueOf(rule, 'bottom')).toBe('0');
    expect(valueOf(rule, 'width')).toBe('2px');
    expect(valueOf(rule, 'border-radius')).toBe('999px');
    expect(valueOf(rule, 'box-shadow')).toBe('none');
    expect(valueOf(ruleExactly(css, '.gn-group-section[data-level]'), 'position')).toBe('relative');
    const painted = [1, 2, 3, 4].map((n) => valueOf(ruleExactly(css, `.gn-group-section[data-level="${n}"]::before`), 'background'));
    expect(painted).toEqual(['var(--gn-level-1)', 'var(--gn-level-2)', 'var(--gn-level-3)', 'var(--gn-level-4)']);
    // CONTROL: it is a line and not a surface, so no style gives it depth. A planted neo rule would be caught by the same scan.
    const withShadow = (sheet: string) =>
      parseRules(sheet).filter(
        (r) => r.selectors.some((s) => s.includes('data-style') && s.includes('.gn-group-section')) && valueOf(r.body, 'box-shadow') !== null,
      );
    expect(withShadow(css)).toEqual([]);
    expect(withShadow(`${css}\n[data-style="neo"] ${GUIDE} { box-shadow: var(--gn-shadow-lift); }`)).not.toEqual([]);
  });

  it('25.306 the markup carries the level on the section, and the old short strip element is gone', () => {
    home();
    const levels = [...document.querySelectorAll('section[data-level]')].map((s) => `${s.getAttribute('data-level')}:${s.getAttribute('data-group-id')}`);
    expect(levels).toEqual(['1:g-retail', '2:g-stores', '3:g-kiosks', '4:g-carts', '2:g-online', '1:g-ops']);
    expect(document.querySelector('.gn-group-section__strip')).toBeNull();
    // CONTROL: the Ungrouped section carries no level and so draws no guide.
    expect(screen.getByRole('region', { name: 'Ungrouped' })).not.toHaveAttribute('data-level');
  });

  it('25.306 a collapsed group keeps the guide down its own heading row only: the body is gone from the section box', async () => {
    home();
    await userEvent.click(toggle('Retail'));
    const section = screen.getByRole('region', { name: 'Retail' });
    // The guide spans the section, and the section now holds only the heading row because the body is hidden.
    expect([...section.children].filter((el) => !el.hasAttribute('hidden')).map((el) => el.className)).toEqual(['gn-group-section__head']);
  });
});

describe('25.307 phones keep a 2px guide and may shrink the indent', () => {
  const css = cssOf('globals');
  const PHONE = '@media (max-width: 40rem)';
  it('25.307 the phone arm narrows the indent; no rule in any arm changes the guide width; the tree guide stays 2px', () => {
    const base = valueOf(ruleExactly(css, '.gn-group-section[data-level]'), 'padding-inline-start')!;
    const phone = valueOf(ruleExactly(css, '.gn-group-section[data-level]', PHONE), 'padding-inline-start')!;
    expect(parseFloat(phone)).toBeLessThan(parseFloat(base));
    for (const r of rulesNaming(css, '.gn-group-section[data-level]::before')) {
      expect(valueOf(r.body, 'width') ?? '2px').toBe('2px');
    }
    // The tree's list form draws its guide as the column's own border: 2px, in the level colour, no shorter than the column.
    const column = ruleExactly(css, '.gn-groups__children', PHONE);
    expect(valueOf(column, 'border-left')).toBe('2px solid var(--gn-border)');
    for (const n of [1, 2, 3, 4]) {
      expect(valueOf(ruleExactly(css, `.gn-groups__children[data-level="${n}"]`, PHONE), 'border-left-color')).toBe(`var(--gn-level-${n})`);
    }
  });
});

/* ── Settings → Groups ─────────────────────────────────────────────────────────────────────────────── */
const OK: GroupActionResult = { ok: true };
const TREE_GROUPS: GroupRow[] = [
  g('t-delivery', null, 1, 'Delivery', 'a1', 3),
  g('t-support', null, 1, 'Support', 'a2'),
  g('t-alpha', 't-delivery', 2, 'Alpha', 'a1', 1),
  g('t-beta', 't-delivery', 2, 'Beta', 'a2'),
  g('t-chi', 't-delivery', 2, 'Chi', 'a3'),
  g('t-gamma', 't-alpha', 3, 'Gamma', 'a1', 1),
  g('t-deep', 't-gamma', 4, 'Deep', 'a1'),
];
function tree(options: { canEdit?: boolean; userId?: string | undefined } = {}) {
  return render(
    <GroupsTree
      workspaceId={WORKSPACE}
      userId={'userId' in options ? options.userId : USER}
      canEdit={options.canEdit ?? true}
      groups={TREE_GROUPS}
      onSubmit={vi.fn(async () => OK)}
    />,
  );
}
const item = (name: string): HTMLElement => screen.getByRole('treeitem', { name });
const treeToggle = (name: string, state: 'Collapse' | 'Expand' = 'Collapse') => screen.getByRole('button', { name: `${state} ${name}` });
const nameButton = (name: string): HTMLElement => within(item(name)).getAllByRole('button', { name })[0]!;

describe('25.310 every node with children collapses in the Settings tree, at every level', () => {
  it.each([
    [1, 'Delivery', 'Alpha'],
    [2, 'Alpha', 'Gamma'],
    [3, 'Gamma', 'Deep'],
  ])('25.310 level %i (%s): aria-expanded on the treeitem, the subtree hides, a leaf has no toggle', async (_level, name, child) => {
    tree();
    // CONTROL: open, the child item is reachable and the item says so.
    expect(item(name)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('treeitem', { name: child })).toBeVisible();
    await userEvent.click(treeToggle(name));
    expect(item(name)).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('treeitem', { name: child })).toBeNull();
    // The item's own box (name, ⊕) is still there; only the subtree is gone.
    expect(within(item(name)).getByRole('button', { name: `Add a group under ${name}` })).toBeVisible();
    await userEvent.click(treeToggle(name, 'Expand'));
    expect(screen.getByRole('treeitem', { name: child })).toBeVisible();
  });

  it('25.310 a leaf (Deep, Beta, Support) carries no aria-expanded and no toggle; the toggle names its group', () => {
    tree();
    for (const leaf of ['Deep', 'Beta', 'Support']) {
      expect(item(leaf)).not.toHaveAttribute('aria-expanded');
      expect(screen.queryByRole('button', { name: new RegExp(`(Collapse|Expand) ${leaf}$`) })).toBeNull();
    }
    expect(treeToggle('Delivery')).toHaveAttribute('aria-controls');
    expect(document.getElementById(treeToggle('Delivery').getAttribute('aria-controls')!)).toHaveAttribute('role', 'group');
  });

  it('25.310 the editing controls of a collapsed branch are not focusable (hidden, not merely dimmed)', async () => {
    tree();
    expect(screen.getByRole('button', { name: 'Delete Beta' })).toBeVisible();
    await userEvent.click(treeToggle('Delivery'));
    expect(screen.queryByRole('button', { name: 'Delete Beta' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a group under Alpha' })).toBeNull();
    const column = document.getElementById(treeToggle('Delivery', 'Expand').getAttribute('aria-controls')!)!;
    expect(column).toHaveAttribute('hidden');
    await userEvent.tab();
    expect(column.contains(document.activeElement)).toBe(false);
  });

  it('25.310 a member (no edit rights) still gets the toggle; adding under a collapsed parent opens it', async () => {
    tree({ canEdit: false });
    expect(treeToggle('Delivery')).toBeVisible();
    cleanup();
    tree();
    await userEvent.click(treeToggle('Delivery'));
    await userEvent.click(within(item('Delivery')).getByRole('button', { name: 'Add a group under Delivery' }));
    expect(item('Delivery')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('textbox', { name: 'Group name' })).toBeVisible();
  });
});

describe('25.311 the tree follows the WAI-ARIA keys: → expands, ← collapses, then goes to the parent', () => {
  it('25.311 ArrowLeft collapses an open node, then a collapsed one hands focus to its parent; ArrowRight expands, then enters the first child', async () => {
    tree();
    nameButton('Alpha').focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(item('Alpha')).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(nameButton('Alpha'));
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(nameButton('Delivery'));
    // A root with nobody above it keeps focus where it is.
    await userEvent.keyboard('{ArrowLeft}');
    expect(item('Delivery')).toHaveAttribute('aria-expanded', 'false');
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(nameButton('Delivery'));
    await userEvent.keyboard('{ArrowRight}');
    expect(item('Delivery')).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(nameButton('Delivery'));
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(nameButton('Alpha'));
    // Alpha was left collapsed above: → opens it. CONTROL: Alt+Arrow is the reorder chord and does not toggle it back.
    await userEvent.keyboard('{ArrowRight}');
    expect(item('Alpha')).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(item('Alpha')).toHaveAttribute('aria-expanded', 'true');
  });

  it('25.311 the keys work from the toggle itself, which is the only stop of a read-only tree', async () => {
    tree({ canEdit: false });
    treeToggle('Delivery').focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(item('Delivery')).toHaveAttribute('aria-expanded', 'false');
    await userEvent.keyboard('{ArrowRight}');
    expect(item('Delivery')).toHaveAttribute('aria-expanded', 'true');
    treeToggle('Alpha').focus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(document.activeElement).toBe(treeToggle('Delivery'));
    // Enter on the toggle is the button's own press.
    await userEvent.keyboard('{Enter}');
    expect(item('Delivery')).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('25.312 the tree remembers a collapse under its own key', () => {
  it('25.312 gn-groups-tree-collapsed:<user>:<workspace> holds the ids, survives a remount, and is not the home key', async () => {
    const first = tree();
    await userEvent.click(treeToggle('Alpha'));
    expect(JSON.parse(window.localStorage.getItem(TREE_KEY) ?? 'null')).toEqual(['t-alpha']);
    expect(window.localStorage.getItem(HOME_KEY)).toBeNull();
    first.unmount();
    tree();
    expect(await screen.findByRole('treeitem', { name: 'Alpha' })).toHaveAttribute('aria-expanded', 'false');
    // CONTROL: the home's key does not collapse the tree, another user is not honoured, and a throwing store still renders open.
    cleanup();
    window.localStorage.clear();
    window.localStorage.setItem(HOME_KEY, '["t-alpha"]');
    tree();
    expect(item('Alpha')).toHaveAttribute('aria-expanded', 'true');
    cleanup();
    window.localStorage.setItem(TREE_KEY, '["t-alpha"]');
    tree({ userId: 'someone-else' });
    expect(item('Alpha')).toHaveAttribute('aria-expanded', 'true');
    cleanup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    tree();
    expect(item('Alpha')).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(treeToggle('Alpha'));
    expect(item('Alpha')).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('25.313 the tree spine IS the level guide: one line, in the parent’s level colour', () => {
  const css = cssOf('globals');
  const NODE = '.gn-groups__children[data-level="N"] > .gn-groups__node';
  it('25.313 every level paints the spine and its elbows from --gn-level-N; the base spine is not a second line', () => {
    for (const n of [1, 2, 3, 4]) {
      const at = (s: string) => s.replaceAll('"N"', `"${n}"`);
      expect(valueOf(ruleExactly(css, at(`${NODE}::after`)), 'background')).toBe(`var(--gn-level-${n})`);
      const elbows = ruleExactly(css, [at('.gn-groups__children[data-level="N"]::before'), at(`${NODE}::before`)]);
      expect(valueOf(elbows, 'border-top-color')).toBe(`var(--gn-level-${n})`);
    }
    // 2px, and the ends are rounded: the first segment's top and the last's bottom.
    const spine = ruleExactly(css, '.gn-groups__children > .gn-groups__node:not(:only-child)::after');
    expect(valueOf(spine, 'width')).toBe('2px');
    expect(valueOf(ruleExactly(css, '.gn-groups__children > .gn-groups__node:not(:only-child):first-child::after'), 'border-radius')).toBe('1px 1px 0 0');
    expect(valueOf(ruleExactly(css, '.gn-groups__children > .gn-groups__node:not(:only-child):last-child::after'), 'border-radius')).toBe('0 0 1px 1px');
    // ONE line: nothing else draws a vertical in the column (the old grey border is still transparent).
    expect(valueOf(ruleExactly(css, '.gn-groups__children'), 'border-left')).toBe('2px solid transparent');
    expect(valueOf(ruleExactly(css, '.gn-groups__children[hidden]'), 'display')).toBe('none');
    // No style gives the guide depth.
    const shadowed = rulesNaming(css, '.gn-groups__children[data-level="1"] > .gn-groups__node::after').filter(
      (r) => valueOf(r.body, 'box-shadow') !== null,
    );
    expect(shadowed).toEqual([]);
  });

  it('25.313 the column carries its PARENT’s level (data-level) so the colour is the group’s, not the child’s', () => {
    tree();
    const columnOf = (name: string) => item(name).querySelector(':scope > .gn-groups__children');
    expect(columnOf('Delivery')).toHaveAttribute('data-level', '1');
    expect(columnOf('Alpha')).toHaveAttribute('data-level', '2');
    expect(columnOf('Gamma')).toHaveAttribute('data-level', '3');
    // CONTROL: a leaf has no column.
    expect(columnOf('Beta')).toBeNull();
  });
});
