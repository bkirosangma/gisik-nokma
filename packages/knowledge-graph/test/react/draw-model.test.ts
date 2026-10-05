// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { zones } from '../../src/engine/zones.js';
import { buildDrawModel } from '../../src/react/draw-model.js';
import { ALL_GROUPS, edge, item, N, storeOf, T } from '../engine/fixture.js';

/*
 * The centre `c`; three chips at hop 1 (the note n1, the tickets a and b); two fog items at hop 2 (f1 past a, f2 past b).
 * Clear edges: blocks c→a, attached n1→c, relates c→b, relates a→b. Fog edges: blocks a→f1, parent b→f2.
 */
const store = storeOf(
  [item('c'), item('n1', { kind: 'note' }), item('a'), item('b'), item('f1'), item('f2')],
  [edge('blocks', T('c'), T('a')), edge('attached', N('n1'), T('c')), edge('relates', T('c'), T('b')), edge('relates', T('a'), T('b')), edge('blocks', T('a'), T('f1')), edge('parent', T('b'), T('f2'))],
);
const zonesAt = (center: string) => zones(store, { center, on: ALL_GROUPS, reach: 1, inScope: () => true, semantic: true });
const model = (center: string, selected: string | null, selectedEdge: string | null = null) =>
  buildDrawModel(store, zonesAt(center), { config: 'desktop', centre: center, selected, selectedEdge, on: ALL_GROUPS });

describe('buildDrawModel (`render`, knowledge-graph-sigma.html:915-948)', () => {
  it('27.310 fog nodes are bare, a hop-1 note has its icon, a note CENTRE has none, fog edges are not counted, and the selected item lights only its own edges; control: an edge selected lights none', () => {
    const m = model(T('c'), T('a'));
    const fog = m.nodes.filter((n) => n.fog);
    expect(fog.map((n) => n.ref).sort()).toEqual([T('f1'), T('f2')]);
    for (const n of fog) {
      expect(n.lv).toBe('fog');
      expect(n.lbl).toBe('');
      expect(n.sub).toBeNull();
      expect(n.icon).toBeNull();
    }
    expect(m.nodes.find((n) => n.ref === N('n1'))!.icon).toEqual({ kind: 'note' });
    // a ticket never has an icon, so the centre leg needs a NOTE centre: the same note, centred, has none
    const noteCentred = model(N('n1'), N('n1'));
    expect(noteCentred.nodes.find((n) => n.ref === N('n1'))!.center).toBe(true);
    expect(noteCentred.nodes.find((n) => n.ref === N('n1'))!.icon).toBeNull();
    // fog edges are drawn as fog and not counted: the LITERAL clear counts of the fixture
    const edgeOf = (id: string) => m.edges.find((e) => e.id === id)!;
    expect(edgeOf(`blocks|${T('a')}|${T('f1')}`).fog).toBe(true);
    expect(edgeOf(`parent|${T('b')}|${T('f2')}`).fog).toBe(true);
    expect(m.counts).toEqual({ blocks: 1, relates: 2, attached: 1 });
    // the selected item's edges are lit; an edge not touching it is not
    expect(edgeOf(`blocks|${T('c')}|${T('a')}`).on).toBe(true);
    expect(edgeOf(`relates|${T('a')}|${T('b')}`).on).toBe(true);
    expect(edgeOf(`relates|${T('c')}|${T('b')}`).on).toBe(false);
    expect(edgeOf(`attached|${N('n1')}|${T('c')}`).on).toBe(false);
    expect(edgeOf(`blocks|${T('a')}|${T('f1')}`).on).toBe(false); // touches a, but fog
    // control: with an edge selected, no item's edges are lit
    const withEdge = model(T('c'), T('a'), `blocks|${T('c')}|${T('a')}`);
    expect(withEdge.edges.filter((e) => e.on)).toEqual([]);
  });
});
