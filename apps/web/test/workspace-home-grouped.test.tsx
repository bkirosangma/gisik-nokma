import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupRow, IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import { readProjectGrouping, rememberProjectGrouping, type WorkspaceRef } from '@gisik-nokma/app-core';
import WorkspaceHomePage from '../app/w/[workspaceId]/page.js';
import { Providers } from '../src/providers.js';
import { parseRules, ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Prefixes and groups plan Task 7 — the workspace home's nav row on top, the Projects heading row and
 * the grouped view. Cases 22.120–22.122, 22.140–22.149 (bucket 22, `test-cases/22-prefixes-and-groups.md`).
 * 22.120 is the amended 13.673 in `workspace-home.test.tsx`; 22.143 is `packages/ui/test/level-colours.test.ts`.
 */
const WORKSPACE = '01J9WORKSPACE0000000000000';
const KIRO = 'user_kiro';
const OTHER = 'user_other';

let session = { data: { user: { id: KIRO, name: 'Kiro' } }, isPending: false };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: WORKSPACE }),
  usePathname: () => `/w/${WORKSPACE}`,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => session,
    signOut: async () => ({ data: {}, error: null }),
  },
}));

/** Served out of rank order on purpose: the view must sort, not trust the wire. */
const GROUPS: GroupRow[] = [
  { id: 'g-ops', parentId: null, level: 1, name: 'Operations', rank: 'a2', projectCount: 1, childCount: 0 },
  { id: 'g-vacant', parentId: null, level: 1, name: 'Vacant', rank: 'a3', projectCount: 0, childCount: 1 },
  { id: 'g-vacant-child', parentId: 'g-vacant', level: 2, name: 'Vacant child', rank: 'a1', projectCount: 0, childCount: 0 },
  { id: 'g-online', parentId: 'g-retail', level: 2, name: 'Online', rank: 'a2', projectCount: 1, childCount: 0 },
  { id: 'g-carts', parentId: 'g-kiosks', level: 4, name: 'Carts', rank: 'a1', projectCount: 1, childCount: 0 },
  { id: 'g-kiosks', parentId: 'g-stores', level: 3, name: 'Kiosks', rank: 'a1', projectCount: 1, childCount: 1 },
  { id: 'g-stores', parentId: 'g-retail', level: 2, name: 'Stores', rank: 'a1', projectCount: 1, childCount: 1 },
  { id: 'g-retail', parentId: null, level: 1, name: 'Retail', rank: 'a1', projectCount: 0, childCount: 2 },
];

function workspaceAs(role: string, over: Partial<WorkspaceRef> = {}): WorkspaceRef {
  return {
    id: WORKSPACE,
    name: 'Convenience Corner',
    prefix: 'CC',
    role,
    archived: false,
    memberCount: 5,
    nameRestrictedProjectCount: 0,
    projects: [
      { id: 'p1', name: 'Shop operations', prefix: 'SO', archived: false, ticketCount: 9, blockedCount: 3, groupId: 'g-stores' },
      { id: 'p2', name: 'Deliveries', prefix: 'DL', archived: false, ticketCount: 4, blockedCount: 0, groupId: 'g-ops' },
      { id: 'p3', name: 'Old signage', prefix: 'OS', archived: true, ticketCount: 7, blockedCount: 1, groupId: 'g-stores' },
      { id: 'p4', name: 'Cart rota', prefix: 'CR', archived: false, ticketCount: 2, blockedCount: 0, groupId: 'g-carts' },
      { id: 'p5', name: 'Loose ends', prefix: 'LE', archived: false, ticketCount: 1, blockedCount: 0, groupId: null },
      { id: 'p6', name: 'Kiosk plan', prefix: 'KP', archived: false, ticketCount: 3, blockedCount: 0, groupId: 'g-kiosks' },
      { id: 'p7', name: 'Web shop', prefix: 'WS', archived: false, ticketCount: 5, blockedCount: 0, groupId: 'g-online' },
    ],
    ...over,
  };
}

function mount(workspace: WorkspaceRef, groups: () => Promise<GroupRow[]> = async () => GROUPS) {
  const getGroups = vi.fn(groups);
  const getMyWorkspaces = vi.fn(async () => [workspace]);
  const services = stubServices({ getMyWorkspaces, getGroups });
  // A COMMITTING ingest: the stub's default `[]` is "the server answered 0 of 1 claims", which the page
  // reports as a failure and does not reload on.
  services.dataSource.ingest = async (events: SubmittedEvent[]): Promise<IngestResult[]> =>
    events.map((event) => ({ status: 'committed', eventId: event.id, seq: 1, serverTime: '2026-10-02T10:00:00.000Z' }));
  render(
    <Providers services={services}>
      <WorkspaceHomePage />
    </Providers>,
  );
  return { getGroups, getMyWorkspaces };
}

const row = (projectId: string) => screen.getByTestId(`project-row-${projectId}`);
const groupedTab = () => screen.getByRole('tab', { name: 'Grouped' });
const plainTab = () => screen.getByRole('tab', { name: 'Plain' });

async function showGrouped(workspace = workspaceAs('owner'), groups?: () => Promise<GroupRow[]>) {
  const handle = mount(workspace, groups);
  await screen.findByRole('heading', { name: 'Projects' });
  await userEvent.click(groupedTab());
  return handle;
}

/** The name of the group section a project card sits in — the nearest section above its row. */
function sectionNameOf(projectId: string): string | null {
  const section = row(projectId).closest('section');
  const heading = section?.getAttribute('aria-labelledby');
  return heading === null || heading === undefined ? null : (document.getElementById(heading)?.textContent ?? null);
}
/** Every group section's level and name, in document order (the level guide is CSS; the section carries the level). */
const sectionLevels = (): string[] =>
  [...document.querySelectorAll('section[data-level]')].map(
    (section) => `Level ${section.getAttribute('data-level')} group: ${document.getElementById(section.getAttribute('aria-labelledby') ?? '')?.textContent}`,
  );

beforeEach(() => {
  window.localStorage.clear();
  session = { data: { user: { id: KIRO, name: 'Kiro' } }, isPending: false };
  vi.clearAllMocks();
});

describe('22.121 the Projects heading row', () => {
  it('22.121 holds, in order, the heading, the archived toggle, the Grouped/Plain control and the Create project button', async () => {
    mount(workspaceAs('owner'));
    const heading = await screen.findByRole('heading', { name: 'Projects' });
    const archived = screen.getByRole('button', { name: 'Show archived projects in Convenience Corner' });
    const control = screen.getByRole('tablist', { name: 'Show projects' });
    const slot = screen.getByRole('button', { name: 'Create project' }); // Task 8 (22.152) filled the slot this case once found by attribute
    const rowOf = heading.parentElement!;
    expect(rowOf).toHaveClass('gn-workspace-home__projects-heading');
    const inOrder = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(inOrder(heading, archived)).toBe(true);
    expect(inOrder(archived, control)).toBe(true);
    expect(inOrder(control, slot!)).toBe(true);
    for (const part of [archived, control, slot!]) expect(rowOf.contains(part)).toBe(true);
    expect(within(control).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Grouped', 'Plain']);
    expect(plainTab()).toHaveAttribute('aria-selected', 'true'); // the default
  });

  it('22.121 CONTROL: a member has the control but no Create project button; a guest has neither (the groups door is closed to them)', async () => {
    mount(workspaceAs('member'));
    await screen.findByRole('heading', { name: 'Projects' });
    expect(screen.getByRole('tablist', { name: 'Show projects' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create project' })).toBeNull();
    cleanup();
    mount(workspaceAs('guest'));
    await screen.findByRole('heading', { name: 'Projects' });
    expect(screen.queryByRole('tablist', { name: 'Show projects' })).toBeNull();
  });
});

describe('22.122 the Grouped choice is remembered per user', () => {
  it('22.122 Grouped persists and survives a remount; another user on the same device gets the default', async () => {
    await showGrouped();
    expect(groupedTab()).toHaveAttribute('aria-selected', 'true');
    expect(readProjectGrouping(KIRO, WORKSPACE)).toBe('grouped');

    cleanup();
    mount(workspaceAs('owner'));
    await screen.findByRole('heading', { name: 'Projects' });
    await waitFor(() => expect(groupedTab()).toHaveAttribute('aria-selected', 'true'));

    // CONTROL: the same device, another person — never Kiro's choice.
    cleanup();
    session = { data: { user: { id: OTHER, name: 'Other' } }, isPending: false };
    mount(workspaceAs('owner'));
    await screen.findByRole('heading', { name: 'Projects' });
    expect(plainTab()).toHaveAttribute('aria-selected', 'true');
    expect(readProjectGrouping(OTHER, WORKSPACE)).toBe('plain');
  });
});

describe('22.140 the grouped view nests the groups, level by level', () => {
  it('22.140 L1→L4 sections in rank order, each with its level strip, and a project sits in its own group’s section', async () => {
    await showGrouped();
    await screen.findByRole('region', { name: 'Retail' });
    // Rank order at every depth, whatever order the wire served: Retail before Operations; Stores before Online.
    expect(sectionLevels()).toEqual([
      'Level 1 group: Retail',
      'Level 2 group: Stores',
      'Level 3 group: Kiosks',
      'Level 4 group: Carts',
      'Level 2 group: Online',
      'Level 1 group: Operations',
    ]);
    expect(screen.getByRole('region', { name: 'Kiosks' })).toHaveAttribute('data-level', '3');
    expect(sectionNameOf('p1')).toBe('Stores');
    expect(sectionNameOf('p6')).toBe('Kiosks');
    expect(sectionNameOf('p4')).toBe('Carts');
    expect(sectionNameOf('p7')).toBe('Online');
    // CONTROL: the same page files Deliveries under Operations, not under the first group on the page.
    expect(sectionNameOf('p2')).toBe('Operations');
    // The headings step with the level: h3 for L1 down to h6 for L4, under the page's own h2 "Projects".
    expect(screen.getByRole('heading', { name: 'Retail', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stores', level: 4 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kiosks', level: 5 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Carts', level: 6 })).toBeInTheDocument();
    // CONTROL: "Ungrouped" has no level of its own and sits at the top of the tree, an h3.
    expect(screen.getByRole('heading', { name: 'Ungrouped', level: 3 })).toBeInTheDocument();
    // Nested for real: Carts' section is inside Kiosks', inside Stores', inside Retail's.
    expect(screen.getByRole('region', { name: 'Retail' }).contains(screen.getByRole('region', { name: 'Carts' }))).toBe(true);
    expect(screen.getByRole('region', { name: 'Operations' }).contains(screen.getByRole('region', { name: 'Carts' }))).toBe(false);
  });
});

describe('22.141 ungrouped projects come last', () => {
  it('22.141 projects with no group sit under “Ungrouped”, the LAST section', async () => {
    await showGrouped();
    await screen.findByRole('region', { name: 'Ungrouped' });
    expect(sectionNameOf('p5')).toBe('Ungrouped');
    const topLevel = [...document.querySelectorAll('.gn-grouped-projects > section')].map((section) =>
      document.getElementById(section.getAttribute('aria-labelledby')!)?.textContent,
    );
    expect(topLevel).toEqual(['Retail', 'Operations', 'Ungrouped']);
    // CONTROL: a grouped project is not under Ungrouped.
    expect(sectionNameOf('p2')).not.toBe('Ungrouped');
  });
});

describe('22.142 the plain view is unchanged', () => {
  it('22.142 plain draws the one flat grid with no sections and no groups request; Grouped asks for them', async () => {
    const { getGroups } = mount(workspaceAs('owner'));
    await screen.findByRole('heading', { name: 'Projects' });
    expect(document.querySelectorAll('.gn-workspace-home__projects')).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Ungrouped' })).toBeNull();
    expect(document.querySelector('[data-level]')).toBeNull();
    expect(screen.getByTestId('project-row-p5')).toBeInTheDocument();
    expect(getGroups).not.toHaveBeenCalled();
    // CONTROL: choosing Grouped is what asks.
    await userEvent.click(groupedTab());
    await waitFor(() => expect(getGroups).toHaveBeenCalledWith(WORKSPACE));
    await userEvent.click(plainTab());
    expect(document.querySelector('[data-level]')).toBeNull();
    expect(document.querySelectorAll('.gn-workspace-home__projects')).toHaveLength(1);
  });

  it('22.142 Grouped with a groups read that fails says so and keeps the plain list', async () => {
    await showGrouped(workspaceAs('owner'), () => Promise.reject(new Error('boom')));
    expect(await screen.findByRole('status')).toHaveTextContent('could not be loaded');
    expect(screen.getByTestId('project-row-p5')).toBeInTheDocument();
    expect(document.querySelector('[data-level]')).toBeNull();
  });
});

describe('22.143 each level guide uses its own level token', () => {
  it('22.143 the rule for .gn-group-section[data-level="N"]::before paints var(--gn-level-N), for N = 1…4', () => {
    const globals = readGlobalsCss();
    for (const level of [1, 2, 3, 4]) {
      const rule = ruleExactly(globals, `.gn-group-section[data-level="${level}"]::before`);
      expect(valueOf(rule, 'background'), `level ${level}`).toBe(`var(--gn-level-${level})`);
    }
    // CONTROL: the four rules are four rules, not one shared one — a test that cannot fail would pass here too.
    const painted = new Set(
      [1, 2, 3, 4].map((level) => valueOf(ruleExactly(globals, `.gn-group-section[data-level="${level}"]::before`), 'background')),
    );
    expect(painted.size).toBe(4);
  });
});

describe('22.144 a project or group pointing at nothing still shows', () => {
  it('22.144 an unknown groupId files the project under “Ungrouped”; a group with an unknown parent is a top-level section holding its project', async () => {
    const orphanGroup: GroupRow = { id: 'g-orphan', parentId: 'g-gone', level: 2, name: 'Orphan', rank: 'a1', projectCount: 1, childCount: 0 };
    const workspace = workspaceAs('owner');
    workspace.projects = [
      { id: 'q1', name: 'Lost project', prefix: 'LP', archived: false, ticketCount: 1, blockedCount: 0, groupId: 'g-gone' },
      { id: 'q2', name: 'Orphan project', prefix: 'OP', archived: false, ticketCount: 1, blockedCount: 0, groupId: 'g-orphan' },
      { id: 'q3', name: 'Filed project', prefix: 'FP', archived: false, ticketCount: 1, blockedCount: 0, groupId: 'g-ops' },
    ];
    await showGrouped(workspace, async () => [...GROUPS, orphanGroup]);
    await screen.findByRole('region', { name: 'Orphan' });
    expect(sectionNameOf('q1')).toBe('Ungrouped');
    expect(sectionNameOf('q2')).toBe('Orphan');
    const topLevel = [...document.querySelectorAll('.gn-grouped-projects > section')].map((section) =>
      document.getElementById(section.getAttribute('aria-labelledby')!)?.textContent,
    );
    expect(topLevel).toContain('Orphan');
    // CONTROL: a project with a known group stays in it.
    expect(sectionNameOf('q3')).toBe('Operations');
  });
});

describe('22.145 the groups are re-read after a committed act', () => {
  const act = async (): Promise<void> => {
    await userEvent.click(within(row('p1')).getByRole('button', { name: 'More actions for Shop operations' }));
    await userEvent.click(within(row('p1')).getByRole('menuitem', { name: 'Archive' }));
  };

  it('22.145 in Grouped, archiving a project through its menu reads the groups once more; control: in Plain the same act makes no groups request', async () => {
    const { getGroups, getMyWorkspaces } = await showGrouped();
    await screen.findByRole('region', { name: 'Retail' });
    await waitFor(() => expect(getGroups).toHaveBeenCalled());
    const reads = getMyWorkspaces.mock.calls.length;
    const before = getGroups.mock.calls.length;
    await act();
    // Other components read the directory too, so the act's reload is "more reads", not "exactly one".
    await waitFor(() => expect(getMyWorkspaces.mock.calls.length).toBeGreaterThan(reads));
    await waitFor(() => expect(getGroups.mock.calls.length).toBeGreaterThan(before));

    // CONTROL: Plain asks for nothing, before or after the same act.
    cleanup();
    window.localStorage.clear();
    const plain = mount(workspaceAs('owner'));
    await screen.findByRole('heading', { name: 'Projects' });
    const plainReads = plain.getMyWorkspaces.mock.calls.length;
    await act();
    await waitFor(() => expect(plain.getMyWorkspaces.mock.calls.length).toBeGreaterThan(plainReads));
    expect(plain.getGroups).not.toHaveBeenCalled();
  });
});

describe('22.146 empty groups render nothing', () => {
  it('22.146 a group with no projects and no descendants with projects has no section; Ungrouped is absent when every project has a group', async () => {
    await showGrouped();
    await screen.findByRole('region', { name: 'Retail' });
    expect(screen.queryByRole('img', { name: /Vacant/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Vacant' })).toBeNull();
    // CONTROL: a group with no projects of its own but a descendant with some DOES render.
    expect(screen.getByRole('region', { name: 'Retail' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ungrouped' })).toBeInTheDocument();

    cleanup();
    const filed = workspaceAs('owner');
    filed.projects = filed.projects.map((project) => (project.groupId === null ? { ...project, groupId: 'g-ops' } : project));
    await showGrouped(filed);
    await screen.findByRole('region', { name: 'Operations' });
    expect(screen.queryByRole('region', { name: 'Ungrouped' })).toBeNull();
  });
});

describe('22.149 a guest never asks for the groups', () => {
  it('22.149 with Grouped remembered, a guest gets the plain list, no groups request and no “could not be loaded” line; control: a member with the same stored choice asks', async () => {
    rememberProjectGrouping(KIRO, WORKSPACE, 'grouped');
    const guest = mount(workspaceAs('guest'));
    await screen.findByRole('heading', { name: 'Projects' });
    await screen.findByTestId('project-row-p5');
    expect(guest.getGroups).not.toHaveBeenCalled();
    expect(document.querySelector('[data-level]')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/could not be loaded/)).toBeNull();

    // CONTROL: the same remembered value, as a member, DOES ask.
    cleanup();
    const member = mount(workspaceAs('member'));
    await waitFor(() => expect(member.getGroups).toHaveBeenCalledWith(WORKSPACE));
  });
});

describe('22.147 the project card: one link, one overflow menu, a chevron', () => {
  it('22.147 the card exposes one link “Open <project>” and a “More actions for <project>” button, with no inline Archive or Delete', async () => {
    mount(workspaceAs('owner'));
    await screen.findByRole('heading', { name: 'Projects' });
    const card = row('p1');
    expect(within(card).getAllByRole('link')).toHaveLength(1);
    expect(within(card).getByRole('link', { name: 'Open Shop operations' })).toHaveAttribute('href', `/w/${WORKSPACE}/p/p1`);
    expect(within(card).getByRole('button', { name: 'More actions for Shop operations' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Archive Shop operations' })).toBeNull();
    expect(within(card).queryByRole('button', { name: 'Delete Shop operations…' })).toBeNull();
    expect(within(card).queryByRole('button', { name: 'Edit Shop operations' })).toBeNull();
    // The chevron: on the title row, decorative, inside the one door.
    const chevron = card.querySelector('.gn-project-card__head .gn-project-card__chevron');
    expect(chevron).not.toBeNull();
    expect(chevron).toHaveAttribute('aria-hidden', 'true');
    expect(within(card).getByRole('link').contains(chevron)).toBe(true);

    // CONTROL: the acts are still one open menu away.
    await userEvent.click(within(card).getByRole('button', { name: 'More actions for Shop operations' }));
    const menu = within(card).getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Edit', 'Archive', 'Delete…']);
  });

  it('22.147 CONTROL: a member sees the card and its one link but no menu at all', async () => {
    mount(workspaceAs('member'));
    await screen.findByRole('heading', { name: 'Projects' });
    expect(within(row('p1')).getByRole('link', { name: 'Open Shop operations' })).toBeInTheDocument();
    expect(within(row('p1')).queryByRole('button', { name: /More actions/ })).toBeNull();
  });
});

describe('22.148 the workspace home header on a phone', () => {
  const globals = readGlobalsCss();
  const PHONE = '@media (max-width: 40rem)';
  const phoneRule = (selector: string) => ruleExactly(globals, selector, PHONE);

  it('22.148 at ≤40rem the title takes its own line, the controls share one row under it, and the nav cards are a scrollable row of compact chips', () => {
    const heading = phoneRule('.gn-workspace-home__projects-heading');
    expect(valueOf(heading, 'flex-direction')).toBe('column');
    expect(valueOf(heading, 'align-items')).toBe('stretch');
    const links = phoneRule('.gn-workspace-home__links');
    expect(valueOf(links, 'display')).toBe('flex');
    expect(valueOf(links, 'flex-wrap')).toBe('nowrap');
    expect(valueOf(links, 'overflow-x')).toBe('auto');
    expect(valueOf(phoneRule('.gn-workspace-home__link'), 'flex')).toBe('0 0 auto');
    expect(valueOf(phoneRule('.gn-workspace-home__link-note'), 'display')).toBe('none');
    // Each phone rule follows the base rule it overrides (equal specificity: source order decides).
    const order = parseRules(globals).map((rule) => `${rule.atRule ?? ''}|${rule.selectors.join(',')}`);
    for (const selector of ['.gn-workspace-home__projects-heading', '.gn-workspace-home__links', '.gn-workspace-home__link']) {
      expect(order.indexOf(`|${selector}`), selector).toBeGreaterThanOrEqual(0);
      expect(order.indexOf(`|${selector}`), selector).toBeLessThan(order.indexOf(`${PHONE}|${selector}`));
    }
  });

  it('22.148 CONTROL: above 40rem the nav cards are still the card grid and the heading row is a wrapping flex row', () => {
    const links = ruleExactly(globals, '.gn-workspace-home__links');
    expect(valueOf(links, 'display')).toBe('grid');
    expect(valueOf(links, 'grid-template-columns')).toContain('auto-fit');
    expect(valueOf(ruleExactly(globals, '.gn-workspace-home__projects-heading'), 'flex-wrap')).toBe('wrap');
  });
});

describe('25.316 the workspace home page remembers a collapsed group for the signed-in user (G-1 persistence at the real door)', () => {
  it('25.316 collapsing Stores stores its id under gn-groups-collapsed:<session user>:<workspace>; a remount of the page still has it collapsed, and the sibling Operations stays open', async () => {
    await showGrouped();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Stores' }));
    expect(JSON.parse(window.localStorage.getItem(`gn-groups-collapsed:${KIRO}:${WORKSPACE}`) ?? 'null')).toEqual(['g-stores']);
    cleanup();
    await showGrouped();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Expand Stores' })).toHaveAttribute('aria-expanded', 'false'));
    // CONTROL (same it): a group nobody collapsed is open, so the page reads the ids, not "everything collapsed".
    expect(screen.getByRole('button', { name: 'Collapse Operations' })).toHaveAttribute('aria-expanded', 'true');
    // A different person on the same device does not inherit it.
    cleanup();
    session = { data: { user: { id: OTHER, name: 'Other' } }, isPending: false };
    await showGrouped();
    expect(screen.getByRole('button', { name: 'Collapse Stores' })).toHaveAttribute('aria-expanded', 'true');
  });
});
