import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '../../src/view-types.js';
import { groupByWorkspaceProject, showForWorkspace, showOptionsFor } from '../../src/views/my-work-global.js';

/**
 * The pure half of the global My work page (my-work-global T3, cases 30.019–30.024): the
 * workspace → project tree both sections render, and which "Show" chips a viewer is offered.
 */

function project(id: string, name: string) {
  return { id, name, archived: false, prefix: 'P', ticketCount: null, blockedCount: null };
}

function workspace(id: string, name: string, overrides: Partial<WorkspaceRef> = {}): WorkspaceRef {
  return {
    id,
    name,
    prefix: 'W',
    role: 'member',
    // `adminProjectIds` is OPTIONAL on the type (plan AMEND 16:3x) and absent here by
    // default, so every case below also proves an absent list reads as "runs no project".
    archived: false,
    memberCount: null,
    nameRestrictedProjectCount: 0,
    projects: [],
    ...overrides,
  };
}

type Item = { ticketId: string; workspaceId: string; projectId: string };
const item = (ticketId: string, workspaceId: string, projectId: string): Item => ({ ticketId, workspaceId, projectId });

const shape = (groups: ReturnType<typeof groupByWorkspaceProject<Item>>) =>
  groups.map((g) => [g.workspaceName, g.projects.map((p) => [p.projectName, p.items.map((i) => i.ticketId)])]);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('groupByWorkspaceProject', () => {
  it('30.019 orders workspaces by name case-insensitively ("Alpha" before "beta"), then projects by name inside each', () => {
    const workspaces = [
      workspace('w-b', 'beta', { projects: [project('pz', 'zinc'), project('pa', 'Apple')] }),
      workspace('w-a', 'Alpha', { projects: [project('pm', 'mango'), project('pb', 'Banana')] }),
    ];
    const groups = groupByWorkspaceProject(
      [item('t1', 'w-b', 'pz'), item('t2', 'w-a', 'pm'), item('t3', 'w-b', 'pa'), item('t4', 'w-a', 'pb')],
      workspaces,
    );
    // The plan's pair alone cannot tell a case-insensitive sort from a code-point one —
    // "Alpha" (A=65) sorts before "beta" (b=98) either way — so the second call below is the
    // case leg: code points would put "Zeta" (Z=90) before "alpha" (a=97).
    expect(shape(groups)).toEqual([
      ['Alpha', [['Banana', ['t4']], ['mango', ['t2']]]],
      ['beta', [['Apple', ['t3']], ['zinc', ['t1']]]],
    ]);
    const three = groupByWorkspaceProject(
      [item('t1', 'w-z', 'p1'), item('t2', 'w-a', 'p2')],
      [
        workspace('w-z', 'Zeta', { projects: [project('p1', 'one')] }),
        workspace('w-a', 'alpha', { projects: [project('p2', 'two')] }),
      ],
    );
    expect(three.map((g) => g.workspaceName)).toEqual(['alpha', 'Zeta']);
    expect(three.map((g) => g.workspaceId)).toEqual(['w-a', 'w-z']);
  });

  it('30.020 keeps the INPUT order of items inside a project (overdue fed before blocked stays first)', () => {
    const workspaces = [workspace('w', 'Shop', { projects: [project('p', 'Errands')] })];
    const overdue = { ...item('t-overdue', 'w', 'p'), kind: 'overdue' };
    const blocked = { ...item('t-blocked', 'w', 'p'), kind: 'blocked' };
    const stale = { ...item('t-stale', 'w', 'p'), kind: 'stale' };
    // Fed in bucket order and in the reverse: the output follows the input both times,
    // so neither a ticketId sort nor a kind sort can pass both legs.
    expect(groupByWorkspaceProject([overdue, blocked, stale], workspaces)[0]?.projects[0]?.items).toEqual([
      overdue,
      blocked,
      stale,
    ]);
    expect(groupByWorkspaceProject([stale, overdue, blocked], workspaces)[0]?.projects[0]?.items).toEqual([
      stale,
      overdue,
      blocked,
    ]);
  });

  it('30.021 drops (and warns about) an item whose workspace is not in the list, never grouping it under "undefined"', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const groups = groupByWorkspaceProject(
      [item('t1', 'w', 'p'), item('t-orphan', 'w-gone', 'p-gone')],
      [workspace('w', 'Shop', { projects: [project('p', 'Errands')] })],
    );
    expect(shape(groups)).toEqual([['Shop', [['Errands', ['t1']]]]]);
    expect(JSON.stringify(groups)).not.toContain('undefined');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('w-gone');
    // CONTROL: every item known → no warning at all.
    warn.mockClear();
    groupByWorkspaceProject([item('t1', 'w', 'p')], [workspace('w', 'Shop', { projects: [project('p', 'Errands')] })]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('30.023 takes the project name from WorkspaceRef.projects, and an unknown project is "Unknown project", never its id', () => {
    const groups = groupByWorkspaceProject(
      [item('t1', 'w', 'p-known'), item('t2', 'w', 'p-secret')],
      [workspace('w', 'Shop', { projects: [project('p-known', 'Errands')] })],
    );
    expect(shape(groups)).toEqual([['Shop', [['Errands', ['t1']], ['Unknown project', ['t2']]]]]);
    expect(groups[0]?.projects.map((p) => p.projectId)).toEqual(['p-known', 'p-secret']);
    expect(JSON.stringify(groups.map((g) => g.projects.map((p) => p.projectName)))).not.toContain('p-secret');
  });

  it('30.024 a ticket moved to another project groups under its CURRENT project on the next call (Review Focus 4)', () => {
    const workspaces = [workspace('w', 'Shop', { projects: [project('p1', 'Old home'), project('p2', 'New home')] })];
    const before = groupByWorkspaceProject([item('t1', 'w', 'p1')], workspaces);
    expect(shape(before)).toEqual([['Shop', [['Old home', ['t1']]]]]);
    const after = groupByWorkspaceProject([item('t1', 'w', 'p2')], workspaces);
    expect(shape(after)).toEqual([['Shop', [['New home', ['t1']]]]]);
  });
});

describe('showOptionsFor', () => {
  it('30.022 offers created+assigned always, ws-admin for an owner/admin somewhere, project-admin for a project admin somewhere', () => {
    expect(showOptionsFor([workspace('w1', 'A'), workspace('w2', 'B')])).toEqual(['created', 'assigned']);
    expect(showOptionsFor([workspace('w1', 'A', { adminProjectIds: [] })])).toEqual(['created', 'assigned']);
    expect(showOptionsFor([workspace('w1', 'A'), workspace('w2', 'B', { role: 'admin' })])).toEqual([
      'created',
      'assigned',
      'ws-admin',
    ]);
    expect(showOptionsFor([workspace('w1', 'A', { role: 'owner' })])).toEqual(['created', 'assigned', 'ws-admin']);
    expect(showOptionsFor([workspace('w1', 'A', { adminProjectIds: ['p'] }), workspace('w2', 'B')])).toEqual([
      'created',
      'assigned',
      'project-admin',
    ]);
    // Neither widening role is read from a guest, and an ARCHIVED workspace offers nothing:
    // the global page never queries it, so a chip it alone justified would select nothing.
    expect(showOptionsFor([workspace('w1', 'A', { role: 'guest' })])).toEqual(['created', 'assigned']);
    expect(
      showOptionsFor([workspace('w1', 'A', { role: 'owner', adminProjectIds: ['p'], archived: true })]),
    ).toEqual(['created', 'assigned']);
    expect(showOptionsFor([])).toEqual(['created', 'assigned']);
  });
});

describe('showForWorkspace', () => {
  it('30.030 (pure leg) intersects the selection with what ONE workspace allows, in canonical order', () => {
    const all = ['project-admin', 'ws-admin', 'assigned', 'created'] as const;
    expect(showForWorkspace(workspace('w', 'A'), all)).toEqual(['created', 'assigned']);
    expect(showForWorkspace(workspace('w', 'A', { role: 'admin' }), all)).toEqual(['created', 'assigned', 'ws-admin']);
    expect(showForWorkspace(workspace('w', 'A', { adminProjectIds: ['p'] }), all)).toEqual([
      'created',
      'assigned',
      'project-admin',
    ]);
    expect(showForWorkspace(workspace('w', 'A'), ['ws-admin', 'project-admin'])).toEqual([]);
    expect(showForWorkspace(workspace('w', 'A', { role: 'owner' }), ['created', 'created'])).toEqual(['created']);
  });
});
