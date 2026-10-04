// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { inGraphScope } from '@gisik-nokma/domain';
import { walk } from '../../src/engine/walk.js';
import { ALL_GROUPS, edge, item, N, P, storeOf, T } from './fixture.js';

const everyone = () => true;

describe('the walk (port of bfs, knowledge-graph-sigma.html:592)', () => {
  it('27.213 distances and parents by breadth; control: a cycle does not re-visit', () => {
    const s = storeOf([item('a'), item('b'), item('c')], [edge('parent', T('a'), T('b')), edge('parent', T('b'), T('c')), edge('relates', T('c'), T('a'))]);
    const w = walk(s, T('a'), ALL_GROUPS, 5, everyone);
    expect(w.dist.get(T('b'))).toBe(1);
    expect(w.dist.get(T('c'))).toBe(1); // a–c relates: one step, not two
    expect(w.parent.get(T('c'))?.edge.kind).toBe('relates');
    expect(w.order).toEqual([T('a'), T('c'), T('b')]); // relates (a typed link) ranks before structure
    expect(new Set(w.order).size).toBe(w.order.length);
    // control: `reach` is the last distance walked FROM, so a chain a–b–c walked at reach 1 stops at b
    const chain = storeOf([item('a'), item('b'), item('c')], [edge('parent', T('a'), T('b')), edge('parent', T('b'), T('c'))]);
    expect(walk(chain, T('a'), ALL_GROUPS, 1, everyone).order).toEqual([T('a'), T('b')]);
    expect(walk(chain, T('a'), ALL_GROUPS, 2, everyone).dist.get(T('c'))).toBe(2);
  });

  it('27.214 a hidden group is not walked; control: switched on, the same item is reached', () => {
    const s = storeOf([item('a'), item('b'), item('c')], [edge('blocks', T('a'), T('b')), edge('parent', T('b'), T('c'))]);
    expect(walk(s, T('a'), new Set(['structure'] as const), 5, everyone).dist.has(T('c'))).toBe(false);
    expect(walk(s, T('a'), new Set(['blocks', 'structure'] as const), 5, everyone).dist.get(T('c'))).toBe(2);
  });

  it('27.215 an out-of-scope item is reached, marked out and never walked past; control: an in-scope item at the same place is walked past', () => {
    const s = storeOf(
      [item('a'), item('x', { project: 'p2' }), item('y'), item('b'), item('c')],
      [edge('relates', T('a'), T('x')), edge('relates', T('x'), T('y')), edge('relates', T('a'), T('b')), edge('relates', T('b'), T('c'))],
    );
    const scope = { workspaceIds: ['w1'], projectIds: ['p1'] };
    const w = walk(s, T('a'), ALL_GROUPS, 5, (ref) => inGraphScope(s.items.get(ref)!, scope));
    expect(w.out.has(T('x'))).toBe(true);
    expect(w.dist.has(T('y'))).toBe(false);
    expect(w.dist.get(T('c'))).toBe(2);
    expect(w.out.has(T('b'))).toBe(false);
  });

  it('27.216 an edge to an item the store does not hold (the server withheld it) is not followed; control: once the item arrives it is', () => {
    const s = storeOf([item('a')], [edge('relates', T('a'), T('h'))]);
    expect(walk(s, T('a'), ALL_GROUPS, 5, everyone).order).toEqual([T('a')]);
    const s2 = storeOf([item('a'), item('h')], [edge('relates', T('a'), T('h'))]);
    expect(walk(s2, T('a'), ALL_GROUPS, 5, everyone).order).toEqual([T('a'), T('h')]);
  });

  it('27.217 ring order is spec §2.2: typed links, structure, references, people; newest first within a group; control: the mockup label order would put b01 first', () => {
    const s = storeOf(
      [item('a'), item('b01'), item('b02'), item('n1', { kind: 'note' }), item('u1', { kind: 'person' })],
      [edge('parent', T('a'), T('b01')), edge('blocks', T('a'), T('b02')), edge('ref', N('n1'), T('a')), edge('assignee', P('u1'), T('a'))],
    );
    expect(walk(s, T('a'), ALL_GROUPS, 1, everyone).order).toEqual([T('a'), T('b02'), T('b01'), N('n1'), P('u1')]);
    const s2 = storeOf([item('a'), item('b01'), item('b02')], [edge('parent', T('a'), T('b01')), edge('parent', T('a'), T('b02'))]);
    expect(walk(s2, T('a'), ALL_GROUPS, 1, everyone).order).toEqual([T('a'), T('b02'), T('b01')]); // newest (larger ULID) first
  });

  it('27.218 a rejected concept (the `gone` set) is skipped; control: without it, it is reached', () => {
    const s = storeOf([item('a'), item('c1', { kind: 'concept', ws: 'w1', project: null })], [edge('tag', 'concept:c1', T('a'))]);
    expect(walk(s, T('a'), ALL_GROUPS, 2, everyone, new Set(['concept:c1'])).order).toEqual([T('a')]);
    expect(walk(s, T('a'), ALL_GROUPS, 2, everyone).order).toEqual([T('a'), 'concept:c1']);
  });
});
