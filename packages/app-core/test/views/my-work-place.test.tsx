import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AttentionItem, MyWorkView, WorkItem, WorkspaceRef } from '../../src/view-types.js';
import { AttentionStrip } from '../../src/views/attention-strip.js';
import { MyWork } from '../../src/views/my-work.js';
import { placeLookup, UNKNOWN_PROJECT_NAME } from '../../src/views/my-work-global.js';

/**
 * Case 30.037's app-core half (my-work-global T4): the FLAT arrangement of the global My work
 * page labels every row with where it lives, because no heading says so. The label is two
 * names with the ticket sheet's crumb separator between them (`›`, aria-hidden), never one
 * string joined by a spaced middle dot, which 23.191 bans from UI copy (planner ruling 20:06).
 * Absent `placeOf`, both views draw exactly what they drew before.
 */

function workspace(id: string, name: string, projects: Array<[string, string]>): WorkspaceRef {
  return {
    id,
    name,
    prefix: 'W',
    role: 'member',
    archived: false,
    memberCount: null,
    nameRestrictedProjectCount: 0,
    projects: projects.map(([projectId, projectName]) => ({
      id: projectId,
      name: projectName,
      archived: false,
      prefix: 'P',
      ticketCount: null,
      blockedCount: null,
    })),
  };
}

const WORKSPACES = [
  workspace('w-hills', 'Garo Hills Logistics', [['p-shop', 'Shop floor']]),
  workspace('w-coast', 'Coastal Freight', [['p-dock', 'Dockside']]),
];

const attention = (ticketId: string, workspaceId: string, projectId: string): AttentionItem => ({
  kind: 'blocked',
  ticketId,
  workspaceId,
  projectId,
  title: ticketId,
  reason: 'blocked reason',
  claim: null,
});

const provenance = {
  actorId: 'u',
  actorName: null,
  clientTime: '2026-10-01T04:00:00.000Z',
  serverTime: '2026-10-01T04:00:01.000Z',
};

const work = (ticketId: string, workspaceId: string, projectId: string, projectName: string | null): WorkItem => ({
  ticketId,
  workspaceId,
  projectId,
  projectName,
  title: ticketId,
  stateId: 'doing',
  stateName: 'Doing',
  stateCategory: 'active',
  stateProvenance: provenance,
  dueDate: null,
});

/** One place element's parts: the visible names in order, and whether the separator is hidden. */
function parts(place: Element): { names: string[]; separator: string | null; separatorHidden: boolean } {
  const separator = place.querySelector('[aria-hidden="true"]');
  const names = Array.from(place.children)
    .filter((child) => child !== separator)
    .map((child) => child.textContent ?? '');
  return { names, separator: separator?.textContent ?? null, separatorHidden: separator !== null };
}

describe('placeLookup', () => {
  it('30.037 names an item\'s workspace and project from WorkspaceRef; an unknown project is "Unknown project"; an unknown workspace is null', () => {
    const placeOf = placeLookup(WORKSPACES);
    expect(placeOf({ workspaceId: 'w-hills', projectId: 'p-shop' })).toEqual({
      workspaceName: 'Garo Hills Logistics',
      projectName: 'Shop floor',
    });
    expect(placeOf({ workspaceId: 'w-coast', projectId: 'p-gone' })).toEqual({
      workspaceName: 'Coastal Freight',
      projectName: UNKNOWN_PROJECT_NAME,
    });
    expect(UNKNOWN_PROJECT_NAME).toBe('Unknown project');
    expect(placeOf({ workspaceId: 'w-nowhere', projectId: 'p-shop' })).toBeNull();
  });
});

describe('30.037 AttentionStrip with placeOf', () => {
  const items = [attention('t-hills', 'w-hills', 'p-shop'), attention('t-coast', 'w-coast', 'p-dock')];

  it('30.037 every row carries its workspace and project as two names, the › between them aria-hidden; no headings', () => {
    const { container } = render(
      <AttentionStrip items={items} placeOf={placeLookup(WORKSPACES)} onOpenTicket={() => {}} />,
    );
    const rows = Array.from(container.querySelectorAll('.gn-attention__item'));
    expect(rows).toHaveLength(2);
    const labels = rows.map((row) => {
      const place = row.querySelector('.gn-attention__place');
      expect(place).not.toBeNull();
      return [within(row as HTMLElement).getByRole('button').textContent, parts(place as Element)];
    });
    expect(labels).toEqual([
      ['t-hills', { names: ['Garo Hills Logistics', 'Shop floor'], separator: '›', separatorHidden: true }],
      ['t-coast', { names: ['Coastal Freight', 'Dockside'], separator: '›', separatorHidden: true }],
    ]);
    expect(container.querySelectorAll('h2, h3, h4')).toHaveLength(0);
    // No spaced middle dot anywhere in what the reader sees (23.191).
    expect(container.textContent ?? '').not.toMatch(/ · /);
  });

  it('30.037 a row placeOf cannot name gets no label; absent placeOf, no row has one (today\'s markup)', () => {
    const { container, rerender } = render(
      <AttentionStrip
        items={items}
        placeOf={(item) => (item.workspaceId === 'w-hills' ? placeLookup(WORKSPACES)(item) : null)}
        onOpenTicket={() => {}}
      />,
    );
    expect(container.querySelectorAll('.gn-attention__place')).toHaveLength(1);
    rerender(<AttentionStrip items={items} onOpenTicket={() => {}} />);
    expect(container.querySelectorAll('.gn-attention__place')).toHaveLength(0);
  });
});

describe('30.037 MyWork with placeOf', () => {
  const view: MyWorkView = {
    assigned: [work('a-hills', 'w-hills', 'p-shop', 'Shop floor')],
    inTransit: [work('i-coast', 'w-coast', 'p-dock', 'Dockside')],
    contested: [
      {
        ticketId: 'c1',
        title: 'contested one',
        rule: 'state-machine',
        reason: 'no transition',
        claim: { actorId: 'u', clientTime: '2026-10-01T04:00:00.000Z', contestedAt: '2026-10-01T04:00:02.000Z' },
      } as MyWorkView['contested'][number],
    ],
    shared: [work('s-withheld', 'w-coast', 'p-secret', null)],
  };

  /** The work card whose title button reads `title`. */
  const cardTitled = (container: HTMLElement, title: string): Element => {
    const card = Array.from(container.querySelectorAll('.gn-my-work__item')).find(
      (candidate) => candidate.querySelector('.gn-my-work__title')?.textContent === title,
    );
    expect(card).toBeDefined();
    return card as Element;
  };

  it('30.037 every work card names its workspace, then its project by the grouped headings\' own name (a withheld one is "Unknown project", never its id, and gains no id line), › aria-hidden; CONTROL: without placeOf the id line is 3.161\'s', () => {
    const { container, rerender } = render(<MyWork view={view} placeOf={placeLookup(WORKSPACES)} onOpenTicket={() => {}} />);
    const cards = Array.from(container.querySelectorAll('.gn-my-work__item')).filter(
      (card) => card.querySelector('.gn-my-work__title') !== null && card.querySelector('.gn-my-work__place') !== null,
    );
    const labels = cards.map((card) => [
      card.querySelector('.gn-my-work__title')?.textContent,
      parts(card.querySelector('.gn-my-work__place') as Element),
    ]);
    expect(labels).toEqual([
      ['a-hills', { names: ['Garo Hills Logistics', 'Shop floor'], separator: '›', separatorHidden: true }],
      ['i-coast', { names: ['Coastal Freight', 'Dockside'], separator: '›', separatorHidden: true }],
      // A withheld project reads as its grouped heading does, never as its id (planner 22:09 P1).
      ['s-withheld', { names: ['Coastal Freight', 'Unknown project'], separator: '›', separatorHidden: true }],
    ]);
    expect(container.querySelectorAll('h3, h4')).toHaveLength(0);
    expect(container.textContent ?? '').not.toMatch(/ · /);
    // Nor does the flat card draw 3.161's id line beside its label (planner 22:26 (A)).
    const flat = cardTitled(container, 's-withheld');
    expect(flat.textContent ?? '').not.toContain('p-secret');
    expect(flat.querySelectorAll('.gn-my-work__project--id')).toHaveLength(0);

    // CONTROL: without placeOf the same card keeps its id-only project line (case 3.161, untouched).
    rerender(<MyWork view={view} onOpenTicket={() => {}} />);
    expect(cardTitled(container, 's-withheld').querySelector('.gn-my-work__project--id')?.textContent).toBe('p-secret');
  });

  it('30.037 when the served project name and the workspace list disagree, the flat label prints the list\'s (the grouped heading\'s); CONTROL: without placeOf the card prints the served one', () => {
    const renamed: MyWorkView = {
      assigned: [work('a-renamed', 'w-coast', 'p-dock', 'Dock (old name)')],
      inTransit: [],
      contested: [],
      shared: [],
    };
    const { container, rerender } = render(<MyWork view={renamed} placeOf={placeLookup(WORKSPACES)} onOpenTicket={() => {}} />);
    const place = cardTitled(container, 'a-renamed').querySelector('.gn-my-work__place');
    // No label at all is its own failure here, not a crash inside `parts`.
    expect(place).not.toBeNull();
    expect(parts(place as Element).names).toEqual(['Coastal Freight', 'Dockside']);
    // CONTROL: the two sources really differ here, so the leg above can tell them apart.
    rerender(<MyWork view={renamed} onOpenTicket={() => {}} />);
    expect(cardTitled(container, 'a-renamed').querySelector('.gn-my-work__project')?.textContent).toBe('Dock (old name)');
  });

  it('30.037 absent placeOf, no card carries a place label and the project line is today\'s', () => {
    const { container } = render(<MyWork view={view} onOpenTicket={() => {}} />);
    expect(container.querySelectorAll('.gn-my-work__place')).toHaveLength(0);
    expect(Array.from(container.querySelectorAll('.gn-my-work__project')).map((node) => node.textContent)).toEqual([
      'Shop floor',
      'Dockside',
      'p-secret',
    ]);
  });
});
