// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptyStore, mergeRing } from '../../src/engine/model.js';
import { edge, item, T } from './fixture.js';
import { kgNodeId, parseKgNodeId } from '../../src/ids.js';

describe('the ring store (spec §2.3)', () => {
  it('27.212 merging rings unions items and edges and indexes both ends; control: the same edge in a second ring is not added twice', () => {
    const r1 = { hop: 1, items: [item('a'), item('b')], edges: [edge('parent', T('a'), T('b'))], frontier: [T('b')], truncated: false, cursor: null };
    const r2 = { hop: 2, items: [item('c'), item('b', { label: 'LATER' })], edges: [edge('blocks', T('b'), T('c')), edge('parent', T('a'), T('b'))], frontier: [T('c')], truncated: false, cursor: null };
    const s = mergeRing(mergeRing(emptyStore(), r1), r2);
    expect([...s.items.keys()].sort()).toEqual([T('a'), T('b'), T('c')]);
    expect(s.adj.get(T('b'))?.map((x) => x.to).sort()).toEqual([T('a'), T('c')]);
    expect(s.rings).toBe(2);
    expect(s.exhausted).toBe(false);
    // control
    expect(s.edges.size).toBe(2);
    expect(s.adj.get(T('a'))).toHaveLength(1);
    expect(s.items.get(T('b'))?.label).toBe('B'); // the first copy of an item stays
    expect(kgNodeId('ticket', 'a')).toBe(T('a'));
    expect(parseKgNodeId(T('a'))).toEqual({ kind: 'ticket', id: 'a' });
    // an empty last ring with no cursor: "Everything" has reached the end; control: an empty page with a cursor has not
    const end = { hop: 3, items: [], edges: [], frontier: [], truncated: false, cursor: null };
    expect(mergeRing(s, end).exhausted).toBe(true);
    expect(mergeRing(s, { ...end, cursor: 'next' }).exhausted).toBe(false);
    expect(mergeRing(s, { ...end, items: [item('d')] }).exhausted).toBe(false);
    expect(mergeRing(s, { ...end, hop: 1, cursor: 'next' }).rings).toBe(2); // a later page of an earlier ring keeps the farthest ring
  });
});
