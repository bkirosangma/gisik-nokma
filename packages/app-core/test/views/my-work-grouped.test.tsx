import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AttentionItem, AttentionKind, MyWorkView, WorkItem, WorkspaceRef } from '../../src/view-types.js';
import { ATTENTION_CAP, AttentionStrip } from '../../src/views/attention-strip.js';
import { MyWork } from '../../src/views/my-work.js';
import { groupByWorkspaceProject } from '../../src/views/my-work-global.js';

/**
 * Case 30.020's rendering half (my-work-global T3, Step 5): given `groups`, the strip and My
 * Work draw a workspace heading, then each project's heading over its rows; without them
 * they render as they always have. The strip's headings are h2/h3 (its banner is a `<p>`);
 * My Work's are h3/h4, inside its existing h2 sections (plan AMEND 16:3x).
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
  workspace('w-b', 'beta', [
    ['p-zinc', 'zinc'],
    ['p-apple', 'Apple'],
  ]),
  workspace('w-a', 'Alpha', [['p-mango', 'mango']]),
];

const attention = (ticketId: string, kind: AttentionKind, workspaceId: string, projectId: string): AttentionItem => ({
  kind,
  ticketId,
  workspaceId,
  projectId,
  title: ticketId,
  reason: `${kind} reason`,
  claim: null,
});

/** The outline the reader meets, in document order: headings and row titles. */
function outline(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('h2, h3, h4, .gn-attention__title, .gn-my-work__title')).map(
    (node) => `${node.tagName === 'BUTTON' ? '·' : node.tagName.toLowerCase()} ${node.textContent ?? ''}`,
  );
}

describe('30.020 AttentionStrip, grouped and not', () => {
  const items = [
    attention('t1-blocked', 'blocked', 'w-b', 'p-zinc'),
    attention('t2-overdue', 'overdue', 'w-a', 'p-mango'),
    attention('t3-stale', 'stale', 'w-b', 'p-apple'),
    attention('t4-overdue', 'overdue', 'w-b', 'p-zinc'),
  ];

  it('30.020 grouped: h2 workspaces and h3 projects in name order, each project\'s rows strongest first', () => {
    const { container } = render(
      <AttentionStrip items={items} groups={groupByWorkspaceProject(items, WORKSPACES)} onOpenTicket={() => {}} />,
    );
    expect(outline(container)).toEqual([
      'h2 Alpha',
      'h3 mango',
      '· t2-overdue',
      'h2 beta',
      'h3 Apple',
      '· t3-stale',
      'h3 zinc',
      '· t4-overdue',
      '· t1-blocked',
    ]);
    // The banner is unchanged: the region keeps its name, and its heading stays a <p>.
    expect(screen.getByRole('complementary', { name: 'Needs your attention' })).toBeInTheDocument();
  });

  it('30.020 ungrouped: today\'s flat list — no workspace or project headings at all', () => {
    const { container } = render(<AttentionStrip items={items} onOpenTicket={() => {}} />);
    expect(outline(container)).toEqual(['· t2-overdue', '· t4-overdue', '· t1-blocked', '· t3-stale']);
    expect(container.querySelectorAll('.gn-attention__items')).toHaveLength(1);
  });

  it('30.020 grouped keeps ATTENTION_CAP: the strongest rows across ALL groups, under their own headings', () => {
    // Seven rows; the two due-soon ones are the weakest, and one of them is ALONE in its
    // workspace, so a cap applied group by group (or in group order) would show it.
    const many = [
      attention('a-due', 'due-soon', 'w-a', 'p-mango'),
      attention('b1', 'overdue', 'w-b', 'p-zinc'),
      attention('b2', 'overdue', 'w-b', 'p-zinc'),
      attention('b3', 'blocked', 'w-b', 'p-apple'),
      attention('b4', 'blocked', 'w-b', 'p-apple'),
      attention('b5', 'stale', 'w-b', 'p-apple'),
      attention('b6-due', 'due-soon', 'w-b', 'p-zinc'),
    ];
    expect(ATTENTION_CAP).toBe(5);
    const { container } = render(
      <AttentionStrip items={many} groups={groupByWorkspaceProject(many, WORKSPACES)} onOpenTicket={() => {}} />,
    );
    // Alpha's only row is among the two weakest, so neither it nor its headings are drawn.
    expect(outline(container)).toEqual(['h2 beta', 'h3 Apple', '· b3', '· b4', '· b5', 'h3 zinc', '· b1', '· b2']);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 7' }));
    expect(outline(container)).toEqual([
      'h2 Alpha',
      'h3 mango',
      '· a-due',
      'h2 beta',
      'h3 Apple',
      '· b3',
      '· b4',
      '· b5',
      'h3 zinc',
      '· b1',
      '· b2',
      '· b6-due',
    ]);
  });

  it('30.020 grouped and empty renders nothing, like the flat strip', () => {
    const { container } = render(<AttentionStrip items={[]} groups={[]} onOpenTicket={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

const provenance = {
  actorId: 'u',
  actorName: null,
  clientTime: '2026-10-01T04:00:00.000Z',
  serverTime: '2026-10-01T04:00:01.000Z',
};

const work = (ticketId: string, workspaceId: string, projectId: string): WorkItem => ({
  ticketId,
  workspaceId,
  projectId,
  projectName: 'a project',
  title: ticketId,
  stateId: 'doing',
  stateName: 'Doing',
  stateCategory: 'active',
  stateProvenance: provenance,
  dueDate: null,
});

describe('30.020 MyWork, grouped and not', () => {
  const view: MyWorkView = {
    assigned: [work('w-zinc-1', 'w-b', 'p-zinc'), work('w-mango-1', 'w-a', 'p-mango'), work('w-zinc-2', 'w-b', 'p-zinc')],
    inTransit: [],
    contested: [
      {
        ticketId: 'c1',
        title: 'contested one',
        rule: 'state-machine',
        reason: 'no transition',
        claim: { actorId: 'u', clientTime: '2026-10-01T04:00:00.000Z', contestedAt: '2026-10-01T04:00:02.000Z' },
      } as MyWorkView['contested'][number],
    ],
    shared: [work('w-apple-1', 'w-b', 'p-apple')],
  };

  it('30.020 grouped: h3 workspace and h4 project inside each h2 section; contested stays flat; empty copy kept', () => {
    const groups = {
      assigned: groupByWorkspaceProject(view.assigned, WORKSPACES),
      inTransit: groupByWorkspaceProject(view.inTransit, WORKSPACES),
      shared: groupByWorkspaceProject(view.shared, WORKSPACES),
    };
    const { container } = render(<MyWork view={view} groups={groups} onOpenTicket={() => {}} />);
    expect(outline(container)).toEqual([
      'h2 Assigned to me',
      'h3 Alpha',
      'h4 mango',
      '· w-mango-1',
      'h3 beta',
      'h4 zinc',
      '· w-zinc-1',
      '· w-zinc-2',
      'h2 My claims in transit',
      'h2 My contested claims',
      '· contested one',
      'h2 Shared with me',
      'h3 beta',
      'h4 Apple',
      '· w-apple-1',
    ]);
    expect(screen.getByText('No claims in transit.')).toBeInTheDocument();
  });

  it('30.020 ungrouped: today\'s sections, no workspace or project headings', () => {
    const { container } = render(<MyWork view={view} onOpenTicket={() => {}} />);
    expect(outline(container)).toEqual([
      'h2 Assigned to me',
      '· w-zinc-1',
      '· w-mango-1',
      '· w-zinc-2',
      'h2 My claims in transit',
      'h2 My contested claims',
      '· contested one',
      'h2 Shared with me',
      '· w-apple-1',
    ]);
  });
});
