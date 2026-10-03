import { describe, expect, it } from 'vitest';
import { GRAPH_EDGE_KINDS, GRAPH_GROUPS, GROUP_OF_EDGE_KIND, GROUP_RANK, compareRingEntries, graphRef, inGraphScope, parseGraphRef } from '../src/graph.js';

describe('27.200 the graph wire vocabulary', () => {
  it('27.200 every edge kind has a group, refs round-trip, and the ring order is typed links → structure → references → people, newest first; control: an unknown kind and an empty id are refused', () => {
    for (const kind of GRAPH_EDGE_KINDS) expect(GRAPH_GROUPS).toContain(GROUP_OF_EDGE_KIND[kind]);
    expect(parseGraphRef(graphRef('ticket', '01JABC'))).toEqual({ kind: 'ticket', id: '01JABC' });
    expect(parseGraphRef('ticket:a:b')).toEqual({ kind: 'ticket', id: 'a:b' });
    // spec §2.2: typed links first, then structure, then references, then people
    expect(GROUP_RANK.blocks).toBeLessThan(GROUP_RANK.structure);
    expect(GROUP_RANK.structure).toBeLessThan(GROUP_RANK.ref);
    expect(GROUP_RANK.ref).toBeLessThan(GROUP_RANK.people);
    const sorted = [
      { ref: 'ticket:01A', rank: GROUP_RANK.people },
      { ref: 'ticket:01B', rank: GROUP_RANK.blocks },
      { ref: 'note:01C', rank: GROUP_RANK.blocks },
    ].sort(compareRingEntries).map((entry) => entry.ref);
    expect(sorted).toEqual(['note:01C', 'ticket:01B', 'ticket:01A']); // 01C is newer than 01B: newest first within a group
    // control
    expect(parseGraphRef('widget:01A')).toBeNull();
    expect(parseGraphRef('ticket:')).toBeNull();
    expect(parseGraphRef('01A')).toBeNull();
  });
});

describe('27.201 C-scope', () => {
  const scope = { workspaceIds: ['w1'], projectIds: ['p1'] };
  const item = (over: Partial<{ kind: 'ticket' | 'note' | 'person' | 'project' | 'workspace' | 'concept'; id: string; workspaceId: string | null; projectId: string | null }>) =>
    ({ kind: 'ticket' as const, id: 'x', workspaceId: 'w1', projectId: 'p1', ...over });
  it('27.201 in scope: a ticket in a chosen project, a workspace-level note, a person anywhere, the workspace itself; control: the same ticket in another project, and in another workspace, is out', () => {
    expect(inGraphScope(item({}), scope)).toBe(true);
    expect(inGraphScope(item({ kind: 'note', projectId: null }), scope)).toBe(true);
    expect(inGraphScope(item({ kind: 'person', workspaceId: null, projectId: null }), scope)).toBe(true);
    expect(inGraphScope(item({ kind: 'workspace', id: 'w1', projectId: null }), scope)).toBe(true);
    expect(inGraphScope(item({ kind: 'project', id: 'p1' }), scope)).toBe(true);
    expect(inGraphScope(item({}), { workspaceIds: ['w1'], projectIds: [] })).toBe(true); // no project chosen = all projects
    // control
    expect(inGraphScope(item({ projectId: 'p2' }), scope)).toBe(false);
    expect(inGraphScope(item({ kind: 'project', id: 'p2' }), scope)).toBe(false);
    expect(inGraphScope(item({ workspaceId: 'w2' }), scope)).toBe(false);
  });
});
