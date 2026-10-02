import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rankBetween, type GroupRow, type SubmittedEvent } from '@gisik-nokma/domain';
import type { DataSource, WorkspaceMember } from '@gisik-nokma/app-core';
import { HttpError } from '@gisik-nokma/app-core/online';
import { ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { cssOf } from '../../../packages/ui/test/helpers/style-patterns.js';
import { Providers } from '../src/providers.js';
import { GroupsTree, type GroupAction, type GroupActionResult } from '../src/settings/groups-tree.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Settings → Groups, the tree page (prefixes and groups plan Task 11, cases 22.200–22.215).
 *
 * The component cases render `GroupsTree` with a spy `onSubmit` and read what it was asked to do; the page cases
 * (22.200, 22.213–22.215) render `/settings?tab=groups` and read the ONE claim the page ingests. The server's door (sibling
 * names, in-use deletes) is Task 6's: here a refusal is a string the tree must show, not a rule it re-decides.
 */

const WORKSPACE = '01J9WORKSPACE0000000000000';
const ME = '01J9USER000000000000000000';
const push = vi.fn();
const { query } = vi.hoisted(() => ({ query: { current: new URLSearchParams() } }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/settings',
  useSearchParams: () => query.current,
  useParams: () => ({}),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: ME, name: 'Anselma Marak' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import SettingsPage from '../app/settings/page.js';

const R1 = rankBetween(null, null);
const R2 = rankBetween(R1, null);
const R3 = rankBetween(R2, null);

function group(
  id: string,
  parentId: string | null,
  level: GroupRow['level'],
  name: string,
  rank: string,
  projectCount = 0,
  childCount = 0,
): GroupRow {
  return { id, parentId, level, name, rank, projectCount, childCount };
}

/**
 * Delivery (L1) holds Alpha, Beta, Chi (L2); Alpha holds Gamma (L3), Gamma holds Deep (L4); Support (L1) has
 * three projects. Deletable (no projects, no children): Beta, Chi, Deep. Used: Delivery, Alpha, Gamma, Support.
 */
const GROUPS: GroupRow[] = [
  group('g-delivery', null, 1, 'Delivery', R1, 0, 3),
  group('g-support', null, 1, 'Support', R2, 3, 0),
  group('g-alpha', 'g-delivery', 2, 'Alpha', R1, 0, 1),
  group('g-beta', 'g-delivery', 2, 'Beta', R2),
  group('g-chi', 'g-delivery', 2, 'Chi', R3),
  group('g-gamma', 'g-alpha', 3, 'Gamma', R1, 0, 1),
  group('g-deep', 'g-gamma', 4, 'Deep', R1),
];

const OK: GroupActionResult = { ok: true };

function renderTree(options: { canEdit?: boolean; groups?: GroupRow[]; result?: GroupActionResult } = {}) {
  const onSubmit = vi.fn(async (_action: GroupAction): Promise<GroupActionResult> => options.result ?? OK);
  render(
    <GroupsTree
      workspaceId={WORKSPACE}
      canEdit={options.canEdit ?? true}
      groups={options.groups ?? GROUPS}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

function item(name: string): HTMLElement {
  return screen.getByRole('treeitem', { name });
}

/** The box (the card) of one group, found through its treeitem. */
function box(name: string): HTMLElement {
  const found = item(name).querySelector<HTMLElement>(':scope > .gn-groups__box');
  if (found === null) throw new Error(`no box for ${name}`);
  return found;
}

afterEach(() => {
  cleanup();
  push.mockClear();
  query.current = new URLSearchParams();
});

function rosterWhereIAm(role: WorkspaceMember['role']): WorkspaceMember[] {
  return [{ userId: ME, displayName: 'Anselma Marak', role }];
}

type IngestAnswer = (event: SubmittedEvent) => Awaited<ReturnType<DataSource['ingest']>>[number];

/** Renders `/settings?tab=groups` as `role`; `getGroups` answers `groups` (a function, to answer differently per call). */
function renderPage(
  role: WorkspaceMember['role'],
  captured: SubmittedEvent[][],
  options: { groups?: () => Promise<GroupRow[]>; answer?: IngestAnswer } = {},
): void {
  const services = stubServices(
    { getGroups: options.groups ?? (async () => GROUPS) },
    {
      authoring: {
        listMembers: async () => rosterWhereIAm(role),
        listTicketTypes: async () => [],
        listWorkflows: async () => [],
      },
    },
  );
  const committed: IngestAnswer = (event) => ({
    status: 'committed' as const,
    eventId: event.id,
    seq: 1,
    serverTime: '2026-10-02T04:00:02.000Z',
  });
  const dataSource = {
    ...services.dataSource,
    ingest: async (events: SubmittedEvent[]) => {
      captured.push(events);
      return events.map(options.answer ?? committed);
    },
  };
  query.current = new URLSearchParams({ workspaceId: WORKSPACE, tab: 'groups' });
  render(
    <Providers services={{ ...services, dataSource }}>
      <SettingsPage />
    </Providers>,
  );
}

describe('22.200 Settings has a Groups tab', () => {
  it('22.200 the sidebar lists Ticket types, Workflows, Groups, Workspace and ?tab=groups renders the tree, which files a group.created through the page', async () => {
    const captured: SubmittedEvent[][] = [];
    renderPage('admin', captured);
    // The tab's own content: the tree of the server's groups.
    expect(await screen.findByRole('tree')).toBeInTheDocument();
    expect(item('Delivery')).toBeInTheDocument();
    const sidebar = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(sidebar).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Ticket types',
      'Workflows',
      'Groups',
      'Workspace',
    ]);
    // CONTROL — only the current tab is marked, and it is Groups (not a tab list that merely contains the word).
    expect(within(sidebar).getByRole('link', { name: 'Groups' })).toHaveAttribute('aria-current', 'page');
    expect(within(sidebar).getByRole('link', { name: 'Workspace' })).not.toHaveAttribute('aria-current');

    // The page files the tree's action as ONE group.created claim against a `group` entity, in this workspace.
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add group' }));
    await user.type(screen.getByRole('textbox', { name: 'Group name' }), 'Platform{Enter}');
    await waitFor(() => expect(captured).toHaveLength(1));
    const [claim] = captured[0]!;
    expect(claim).toMatchObject({
      workspaceId: WORKSPACE,
      type: 'group.created',
      entity: { kind: 'group' },
      payload: { parentId: null, level: 1, name: 'Platform', rank: rankBetween(R2, null) },
    });
    expect(captured[0]).toHaveLength(1);
  });
});

describe('22.201 the tree is a real tree, one column per level', () => {
  it('22.201 role=tree / treeitem with aria-level, nested by parent and ordered by rank however the wire served them; each box has a named level strip', () => {
    // The rows are served OUT of rank order (Support before Delivery, Chi before Beta before Alpha, children before
    // their parents): the tree's order is a function of the ranks, not of the wire.
    renderTree({ groups: [...GROUPS].reverse() });
    expect(screen.getByRole('tree')).toBeInTheDocument();
    const levels: Array<[string, number]> = [
      ['Delivery', 1],
      ['Support', 1],
      ['Alpha', 2],
      ['Gamma', 3],
      ['Deep', 4],
    ];
    for (const [name, level] of levels) {
      expect(item(name), name).toHaveAttribute('aria-level', String(level));
      const strip = box(name).querySelector<HTMLElement>('.gn-groups__strip');
      expect(strip, `${name} strip`).not.toBeNull();
      expect(strip).toHaveAttribute('data-level', String(level));
      expect(strip).toHaveAttribute('aria-label', `Level ${level} group: ${name}`);
    }
    // The hierarchy is in the DOM: Gamma is inside Alpha, inside Delivery; Support is NOT inside Delivery.
    expect(within(item('Alpha')).getByRole('treeitem', { name: 'Gamma' })).toBeInTheDocument();
    expect(within(item('Delivery')).getByRole('treeitem', { name: 'Alpha' })).toBeInTheDocument();
    expect(within(item('Delivery')).queryByRole('treeitem', { name: 'Support' })).toBeNull();
    // Siblings are in rank order whatever order the wire served them — roots, and a parent's children.
    const roots = screen.getByRole('tree').querySelectorAll(':scope > .gn-groups__node');
    expect([...roots].map((node) => node.getAttribute('data-group-id'))).toEqual(['g-delivery', 'g-support']);
    const kids = item('Delivery').querySelectorAll(':scope > .gn-groups__children > .gn-groups__node');
    expect([...kids].map((node) => node.getAttribute('data-group-id'))).toEqual(['g-alpha', 'g-beta', 'g-chi']);
    // CONTROL (same it) — the left-to-right layout is a real rule, not a bare list: a node is a row (box, then
    // its children column) and the children column draws the spine that joins them (22.210 pins the connectors).
    const css = cssOf('globals');
    expect(valueOf(ruleExactly(css, '.gn-groups__node'), 'display')).toBe('flex');
    expect(valueOf(ruleExactly(css, '.gn-groups__children'), 'border-left')).toMatch(/^2px solid /);
  });
});

describe('22.202 Add group makes a first-level group', () => {
  it('22.202 "Add group" is the one primary, with an icon; its inline field files a level-1 group ranked after the last root', async () => {
    const onSubmit = renderTree();
    const add = screen.getByRole('button', { name: 'Add group' });
    expect(add).toHaveClass('gn-button--primary');
    expect(add.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1);
    expect(document.querySelectorAll('.gn-button--primary')).toHaveLength(1);
    const user = userEvent.setup();
    await user.click(add);
    await user.type(screen.getByRole('textbox', { name: 'Group name' }), '  Platform {Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const action = onSubmit.mock.calls[0]![0];
    expect(action.type).toBe('group.created');
    expect(action.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(action.payload).toEqual({ parentId: null, level: 1, name: 'Platform', rank: rankBetween(R2, null) });
    // CONTROL — Escape in the same field submits nothing and closes it.
    await user.click(screen.getByRole('button', { name: 'Add group' }));
    await user.type(screen.getByRole('textbox', { name: 'Group name' }), 'Nope{Escape}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox', { name: 'Group name' })).toBeNull();
  });
});

describe('22.203 each box adds a child one level down', () => {
  it('22.203 the ⊕ on a box files a child at level+1 after its last child; a level-4 box has none', async () => {
    const onSubmit = renderTree();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add a group under Delivery' }));
    await user.type(screen.getByRole('textbox', { name: 'Group name' }), 'Docs{Enter}');
    const action = onSubmit.mock.calls[0]![0];
    expect(action.type).toBe('group.created');
    expect(action.payload).toEqual({ parentId: 'g-delivery', level: 2, name: 'Docs', rank: rankBetween(R3, null) });
    // A box with no children yet files the first rank.
    await user.click(screen.getByRole('button', { name: 'Add a group under Support' }));
    await user.type(screen.getByRole('textbox', { name: 'Group name' }), 'Billing{Enter}');
    expect(onSubmit.mock.calls[1]![0].payload).toEqual({
      parentId: 'g-support',
      level: 2,
      name: 'Billing',
      rank: rankBetween(null, null),
    });
    // CONTROL — level 3 still has a ⊕, and the level-4 box has none.
    expect(screen.getByRole('button', { name: 'Add a group under Gamma' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a group under Deep' })).toBeNull();
    // The ⊕ is a 44px round button.
    expect(valueOf(ruleExactly(cssOf('globals'), '.gn-groups__add'), 'width')).toBe('2.75rem');
  });
});

describe('22.204 a name is renamed in place', () => {
  it('22.204 clicking a name opens a rename field; Enter files group.renamed, Escape cancels, and a refusal shows its reason', async () => {
    const onSubmit = renderTree();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Alpha' }));
    const field = screen.getByRole('textbox', { name: 'Rename Alpha' });
    expect(field).toHaveValue('Alpha');
    await user.clear(field);
    await user.type(field, 'Alpha two{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toEqual({ type: 'group.renamed', id: 'g-alpha', payload: { name: 'Alpha two' } });
    // CONTROL — Escape cancels: nothing more is submitted and the name button is back.
    await user.click(screen.getByRole('button', { name: 'Beta' }));
    await user.type(screen.getByRole('textbox', { name: 'Rename Beta' }), 'x{Escape}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument();
  });

  it('22.204 Enter on an unchanged name files nothing and closes the field; while the field is open the item keeps its name', async () => {
    const onSubmit = renderTree();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Alpha' }));
    // The treeitem is still named for its group while the name is a text field.
    expect(screen.getByRole('treeitem', { name: /Alpha/ })).toHaveAttribute('aria-level', '2');
    await user.type(screen.getByRole('textbox', { name: 'Rename Alpha' }), '{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Rename Alpha' })).toBeNull();
    // CONTROL — a changed name does file.
    await user.click(screen.getByRole('button', { name: 'Alpha' }));
    await user.type(screen.getByRole('textbox', { name: 'Rename Alpha' }), '2{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toEqual({ type: 'group.renamed', id: 'g-alpha', payload: { name: 'Alpha2' } });
  });

  it('22.204 a refused rename shows the server\'s reason and keeps the field open', async () => {
    const reason = 'Refused by the server: group-name-unique: a group named "Beta" already exists here.';
    renderTree({ result: { ok: false, message: reason } });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Alpha' }));
    await user.clear(screen.getByRole('textbox', { name: 'Rename Alpha' }));
    await user.type(screen.getByRole('textbox', { name: 'Rename Alpha' }), 'Beta{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(reason);
    expect(screen.getByRole('textbox', { name: 'Rename Alpha' })).toBeInTheDocument();
  });
});

describe('22.205 a group is reordered among its siblings', () => {
  it('22.205 dragging a box onto a sibling files group.reordered with rankBetween of its new neighbours; a drop on another parent files nothing', async () => {
    const onSubmit = renderTree();
    // Chi (last) dropped on Beta: it lands between Alpha and Beta.
    fireEvent.dragStart(box('Chi'));
    fireEvent.dragOver(box('Beta'));
    fireEvent.drop(box('Beta'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toEqual({ type: 'group.reordered', id: 'g-chi', payload: { rank: rankBetween(R1, R2) } });
    await act(async () => {}); // the tree files one change at a time: let this one answer before the next drop
    // Alpha (first) dropped on Beta: it moves DOWN, so it lands after Beta, between Beta and Chi.
    fireEvent.dragStart(box('Alpha'));
    fireEvent.drop(box('Beta'));
    expect(onSubmit.mock.calls[1]![0]).toEqual({ type: 'group.reordered', id: 'g-alpha', payload: { rank: rankBetween(R2, R3) } });
    await act(async () => {});
    // CONTROL — a drop on a box of a DIFFERENT parent (Support is a root) is not a reorder.
    fireEvent.dragStart(box('Beta'));
    fireEvent.drop(box('Support'));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('22.205 Alt+↑ and Alt+↓ on a name move it one place among its siblings (the non-pointer path)', async () => {
    const onSubmit = renderTree();
    const user = userEvent.setup();
    const beta = screen.getByRole('button', { name: 'Beta' });
    beta.focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(onSubmit.mock.calls[0]![0]).toEqual({ type: 'group.reordered', id: 'g-beta', payload: { rank: rankBetween(null, R1) } });
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(onSubmit.mock.calls[1]![0]).toEqual({ type: 'group.reordered', id: 'g-beta', payload: { rank: rankBetween(R3, null) } });
    // CONTROL — a bare arrow is not a move, and the first sibling cannot move up.
    await user.keyboard('{ArrowUp}');
    screen.getByRole('button', { name: 'Alpha' }).focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});

describe('22.206 Delete shows only on an unused group, and confirms', () => {
  it('22.206 a group with no projects and no children has Delete; a used one has none; Delete asks first, then files group.deleted', async () => {
    const onSubmit = renderTree();
    for (const name of ['Beta', 'Chi', 'Deep']) {
      expect(screen.getByRole('button', { name: `Delete ${name}` }), name).toBeInTheDocument();
    }
    for (const name of ['Delivery', 'Support', 'Alpha', 'Gamma']) {
      expect(screen.queryByRole('button', { name: `Delete ${name}` }), name).toBeNull();
    }
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete Beta' }));
    const dialog = await screen.findByRole('dialog');
    expect(onSubmit).not.toHaveBeenCalled();
    // CONTROL — Cancel files nothing; the confirm is the filled danger, the in-list button the quiet one.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete Beta' })).toHaveClass('gn-button--danger-quiet');
    await user.click(screen.getByRole('button', { name: 'Delete Beta' }));
    const confirm = within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete group' });
    expect(confirm).toHaveClass('gn-button--danger');
    await user.click(confirm);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toEqual({ type: 'group.deleted', id: 'g-beta', payload: {} });
  });
});

describe('22.207 a non-admin sees the tree read-only', () => {
  it('22.207 no Add, ⊕, rename, drag or Delete for a member; CONTROL: the same tree as an admin has all of them', () => {
    // CONTROL (first, same it) — the SAME rows as an admin carry every control the member must not see.
    renderTree({ canEdit: true });
    expect(screen.getByRole('button', { name: 'Add group' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a group under Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Beta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
    expect(box('Alpha')).toHaveAttribute('draggable', 'true');
    cleanup();
    renderTree({ canEdit: false });
    // The tree is still there, with its levels and names.
    expect(screen.getAllByRole('treeitem')).toHaveLength(GROUPS.length);
    expect(box('Alpha').querySelector('.gn-groups__strip')).toHaveAttribute('data-level', '2');
    expect(screen.queryByRole('button', { name: 'Add group' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Add a group under / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();
    for (const node of document.querySelectorAll('.gn-groups__box')) {
      expect(node.getAttribute('draggable')).not.toBe('true');
    }
  });
});

describe('22.208 at 40rem the tree is an indented list', () => {
  const css = cssOf('globals');
  const PHONE = '@media (max-width: 40rem)';

  it('22.208 above 40rem a node is a row (columns); at ≤40rem it stacks, each level indents 1rem, the connectors are off and the strip is kept', () => {
    // CONTROL — the base arm is the columns.
    expect(valueOf(ruleExactly(css, '.gn-groups__node'), 'display')).toBe('flex');
    expect(valueOf(ruleExactly(css, '.gn-groups__children'), 'display')).toBe('flex');
    const node = ruleExactly(css, '.gn-groups__node', PHONE);
    expect(valueOf(node, 'display')).toBe('block');
    const children = ruleExactly(css, '.gn-groups__children', PHONE);
    expect(valueOf(children, 'margin-left')).toBe('1rem');
    expect(valueOf(children, 'border-left')).toBe('0');
    // The offset that keeps a non-root column off its box (22.210) is the SAME 1rem: it cannot double the indent here.
    expect(valueOf(ruleExactly(css, '.gn-groups__children > .gn-groups__node > .gn-groups__children'), 'margin-left')).toBe(
      valueOf(children, 'margin-left'),
    );
    // The connectors are a column-form device: the list form draws none (the indent is the structure).
    expect(valueOf(ruleExactly(css, '.gn-groups__children > .gn-groups__node::before', PHONE), 'display')).toBe('none');
    expect(valueOf(ruleExactly(css, '.gn-groups__children::before', PHONE), 'display')).toBe('none');
    // The strip is NOT hidden by the phone arm: depth stays visible (and named) in the list form.
    expect(() => ruleExactly(css, '.gn-groups__strip', PHONE)).toThrow();
    expect(valueOf(ruleExactly(css, '.gn-groups__strip[data-level="1"]'), 'background')).toBe('var(--gn-level-1)');
    expect(valueOf(ruleExactly(css, '.gn-groups__strip[data-level="4"]'), 'background')).toBe('var(--gn-level-4)');
  });
});

describe('22.209 an empty workspace', () => {
  it('22.209 says "No groups yet. Add the first one to sort your projects." with the Add button; a member gets the fact without the button', () => {
    renderTree({ groups: [] });
    expect(screen.getByText('No groups yet. Add the first one to sort your projects.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add group' })).toBeInTheDocument();
    cleanup();
    // CONTROL — a member is told there are none, but not to add one; and a non-empty tree has no such sentence.
    renderTree({ groups: [], canEdit: false });
    expect(screen.getByText('No groups yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add group' })).toBeNull();
    cleanup();
    renderTree();
    expect(screen.queryByText(/No groups yet/)).toBeNull();
  });
});

describe('22.210 real level columns joined by real connectors', () => {
  it('22.210 every box has a FIXED width (one x per level) and a connector leaves the spine to each child and the parent to the spine', () => {
    const css = cssOf('globals');
    const boxRule = ruleExactly(css, '.gn-groups__box');
    // CONTROL — the box is a fixed width, not a minimum a long name can outgrow.
    expect(valueOf(boxRule, 'width')).toMatch(/^\d+(\.\d+)?rem$/);
    expect(valueOf(boxRule, 'min-width')).toBeNull();
    expect(valueOf(ruleExactly(css, '.gn-groups__name'), 'overflow-wrap')).toBe('anywhere');
    // The connector: a real pseudo-element with content and a non-zero line, on each child and on the column.
    for (const selector of ['.gn-groups__children > .gn-groups__node::before', '.gn-groups__children::before']) {
      const rule = ruleExactly(css, selector);
      expect(valueOf(rule, 'content'), selector).not.toBeNull();
      expect(valueOf(rule, 'border-top'), selector).toMatch(/^[1-9]\d*px solid /);
    }
    // A NON-root node's `gap: 0` (stub flush with its box) must not also close the gap between that node's box and its
    // OWN children column: the offset rule restores it, and it equals the column connector's length, so the
    // connector ends at the box's edge instead of painting over it.
    const offset = ruleExactly(css, '.gn-groups__children > .gn-groups__node > .gn-groups__children');
    expect(valueOf(offset, 'margin-left')).toBe(valueOf(ruleExactly(css, '.gn-groups__children::before'), 'width'));
    expect(valueOf(offset, 'margin-left')).toBe('1rem');
  });
});

describe('22.211 one change at a time', () => {
  it('22.211 a second action while the first is unanswered files nothing; once it answers, the next files', async () => {
    let answer: (result: GroupActionResult) => void = () => {};
    const onSubmit = vi.fn(
      (_action: GroupAction) => new Promise<GroupActionResult>((resolve) => (answer = resolve)),
    );
    render(<GroupsTree workspaceId={WORKSPACE} canEdit groups={GROUPS} onSubmit={onSubmit} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add group' }));
    await user.type(screen.getByRole('textbox', { name: 'Group name' }), 'Platform{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // The first is still pending: a move is ignored.
    screen.getByRole('button', { name: 'Beta' }).focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // CONTROL — answered, the next action files.
    await act(async () => answer({ ok: true }));
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[1]![0].type).toBe('group.reordered');
  });
});

describe('22.212 dragover allows a drop only on a sibling', () => {
  it('22.212 over a sibling the default is prevented (a drop is allowed); over another parent\'s box it is not', () => {
    renderTree();
    fireEvent.dragStart(box('Chi'));
    // `fireEvent` returns false when the default was prevented — which is what lets the browser fire `drop`.
    expect(fireEvent.dragOver(box('Beta'))).toBe(false);
    // CONTROL — a box of a different parent is not a place: the default stands, the browser shows no drop.
    expect(fireEvent.dragOver(box('Support'))).toBe(true);
  });
});

describe('22.213 the page gives the tree its controls by role', () => {
  it('22.213 an owner and an admin each get Add group; a member gets the tree read-only', async () => {
    for (const role of ['owner', 'admin'] as const) {
      renderPage(role, []);
      expect(await screen.findByRole('tree'), role).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add group' }), role).toBeInTheDocument();
      cleanup();
    }
    // CONTROL — the same page, as a member: every group drawn, no control.
    renderPage('member', []);
    expect(await screen.findByRole('tree')).toBeInTheDocument();
    expect(screen.getAllByRole('treeitem')).toHaveLength(GROUPS.length);
    expect(screen.queryByRole('button', { name: 'Add group' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Add a group under / })).toBeNull();
  });
});

describe('22.214 a guest is told, not shown an error', () => {
  it('22.214 a 404 from the groups read is a plain sentence, not an alert; a 500 is still an alert', async () => {
    renderPage('guest', [], {
      groups: async () => {
        throw new HttpError(404, `/v1/workspaces/${WORKSPACE}/groups`);
      },
    });
    expect(await screen.findByText('Groups are shown to workspace members.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('tree')).toBeNull();
    cleanup();
    // CONTROL — a server failure is not a role: it is still reported.
    renderPage('admin', [], {
      groups: async () => {
        throw new HttpError(500, `/v1/workspaces/${WORKSPACE}/groups`);
      },
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Groups are shown to workspace members.')).toBeNull();
  });
});

describe('22.215 the page reports what the server said', () => {
  it('22.215 a refused claim shows the rule and reason in the alert; a committed one re-reads the groups and draws the new one', async () => {
    const user = userEvent.setup();
    // Refused: the door's own words, shown as given.
    renderPage('admin', [], {
      answer: (event) => ({
        status: 'refused' as const,
        eventId: event.id,
        rule: 'group.name-taken',
        reason: 'A group named "Platform" already exists here.',
      }),
    });
    await screen.findByRole('tree');
    await user.click(screen.getByRole('button', { name: 'Add group' }));
    await user.type(screen.getByRole('textbox', { name: 'Group name' }), 'Platform{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Refused by the server: group.name-taken: A group named "Platform" already exists here.',
    );
    // The refused field stays open and nothing was drawn.
    expect(screen.queryByRole('treeitem', { name: 'Platform' })).toBeNull();
    cleanup();
    // CONTROL — committed: `getGroups` is asked a second time and the answer's new group is drawn.
    const calls = vi.fn();
    renderPage('admin', [], {
      groups: async () => {
        calls();
        return calls.mock.calls.length === 1 ? GROUPS : [...GROUPS, group('g-platform', null, 1, 'Platform', rankBetween(R2, null))];
      },
    });
    await screen.findByRole('tree');
    expect(screen.queryByRole('treeitem', { name: 'Platform' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add group' }));
    await user.type(screen.getByRole('textbox', { name: 'Group name' }), 'Platform{Enter}');
    expect(await screen.findByRole('treeitem', { name: 'Platform' })).toBeInTheDocument();
    expect(calls.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
