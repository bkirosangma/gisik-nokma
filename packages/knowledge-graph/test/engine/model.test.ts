// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptyStore, mergeRing } from '../../src/engine/model.js';
import { edge, item, T } from './fixture.js';
import { kgNodeId, parseKgNodeId } from '../../src/ids.js';

describe('the ring store (spec §2.3)', () => {
  it('27.212 merging rings unions items and edges and indexes both ends; control: the same edge in a second ring is not added twice', () => {
    const r1 = { hop: 1, center: item('a'), items: [item('a'), item('b')], edges: [edge('parent', T('a'), T('b'))], frontier: [T('b')], truncated: false, cursor: null };
    const r2 = { hop: 2, center: item('a'), items: [item('c'), item('b', { label: 'LATER' })], edges: [edge('blocks', T('b'), T('c')), edge('parent', T('a'), T('b'))], frontier: [T('c')], truncated: false, cursor: null };
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
    const end = { hop: 3, center: item('a'), items: [], edges: [], frontier: [], truncated: false, cursor: null };
    expect(mergeRing(s, end).exhausted).toBe(true);
    expect(mergeRing(s, { ...end, cursor: 'next' }).exhausted).toBe(false);
    expect(mergeRing(s, { ...end, items: [item('d')] }).exhausted).toBe(false);
    expect(mergeRing(mergeRing(s, end), { ...end, hop: 4, cursor: 'next' }).exhausted).toBe(true); // the end stays the end
    expect(mergeRing(s, { ...end, hop: 1, cursor: 'next' }).rings).toBe(2); // a later page of an earlier ring keeps the farthest ring
  });

  it('27.364 the ring\'s `center` seeds the store, so a centre with no links still has its item; control: a centre already held keeps its first copy', () => {
    const lonely = { hop: 1, center: item('z', { label: 'GN-9' }), items: [], edges: [], frontier: [], truncated: false, cursor: null };
    const s = mergeRing(emptyStore(), lonely);
    expect([...s.items.keys()]).toEqual([T('z')]);
    expect(s.items.get(T('z'))?.label).toBe('GN-9');
    expect(s.exhausted).toBe(true); // the centre is not a ring item: an empty ring 1 is still the end
    // control: the same centre answered again with another label does not replace the held one
    expect(mergeRing(s, { ...lonely, hop: 2, center: item('z', { label: 'LATER' }) }).items.get(T('z'))?.label).toBe('GN-9');
  });
});
