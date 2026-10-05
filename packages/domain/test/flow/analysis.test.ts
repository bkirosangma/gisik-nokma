import { describe, expect, it } from 'vitest';
import { analyzeFlow, edgeKey } from '../../src/index.js';
import { NUMERIC_ORDER, edge, fnode, keysOf, mockup, mockupEdges, mockupNodes, uid } from './fixtures.js';

const A = uid(1);
const B = uid(2);
const C = uid(3);
const D = uid(4);
const keysOfEdges = (set: ReadonlySet<string>, keys: (ids: Iterable<string>) => string[] = keysOf): string[] =>
  [...set].map((k) => k.split('>').map((id) => keys([id])[0] ?? id).join('>')).sort();

describe('29.180 Start and End nodes', () => {
  it('29.180 the mockup flow has one Start (GN-140) and one End (GN-152); a node in a pure loop has neither; edges to a hidden id are ignored', () => {
    const a = analyzeFlow(mockupNodes(), mockupEdges());
    expect(keysOf(a.starts)).toEqual(['140']);
    expect(keysOf(a.ends)).toEqual(['152']);

    // two starts feeding one node (nodes given in DESCENDING id, so "ascending id" needs the `ids` sort)
    const two = analyzeFlow([fnode(C), fnode(B), fnode(A)], [edge(A, C), edge(B, C)]);
    expect(two.starts).toEqual([A, B]);
    expect(two.ends).toEqual([C]);

    // a pure two-ticket loop: no Start, no End. CONTROL: a feeder makes its target a non-Start but the feeder a Start.
    const loop = analyzeFlow([fnode(A), fnode(B)], [edge(A, B), edge(B, A)]);
    expect(loop.starts).toEqual([]);
    expect(loop.ends).toEqual([]);
    const fed = analyzeFlow([fnode(A), fnode(B), fnode(C)], [edge(A, B), edge(B, A), edge(C, A)]);
    expect(fed.starts).toEqual([C]);

    // a link whose other end is a hole (not in `nodes`) is dropped, not resurrected as a node
    const hole = analyzeFlow([fnode(A), fnode(B)], [edge(A, B), edge(B, uid(99))]);
    expect(hole.ends).toEqual([B]);
    expect(hole.order).toEqual([A, B]);
  });
});

describe('29.181 back edges', () => {
  it('29.181 DFS from the Starts in ascending id, out-edges ascending: the mockup loops are 146>143, 151>141, 151>149; the id order decides which edge of a cycle closes it', () => {
    const a = analyzeFlow(mockupNodes(), mockupEdges());
    expect(keysOfEdges(a.backEdges)).toEqual(['146>143', '151>141', '151>149']);

    // CONTROL: in creation order (GN-142 sorts before GN-143) the same graph closes its cycle at 143>144 instead.
    const natural = mockup(NUMERIC_ORDER);
    const flipped = analyzeFlow(natural.nodes(), natural.edges());
    expect(keysOfEdges(flipped.backEdges, natural.keys)).toEqual(['143>144', '151>141', '151>149']);

    // a pure cycle starts its search at the smallest id; with a Start in front the same pair closes at B>A
    const pure = analyzeFlow([fnode(A), fnode(B)], [edge(A, B), edge(B, A)]);
    expect([...pure.backEdges]).toEqual([edgeKey({ sourceId: B, targetId: A })]);
    // nodes AND edges given in reverse: the root is the smallest id by the sort, not by input position
    const swappedPure = analyzeFlow([fnode(B), fnode(A)], [edge(B, A), edge(A, B)]);
    expect([...swappedPure.backEdges]).toEqual([edgeKey({ sourceId: B, targetId: A })]);
    // the search enters at the Start, not at the smallest id: a(1) <-> b(2) with the feeder f(3) -> b closes at a>b
    const feeder = analyzeFlow([fnode(A), fnode(B), fnode(C)], [edge(A, B), edge(B, A), edge(C, B)]);
    expect([...feeder.backEdges]).toEqual([edgeKey({ sourceId: A, targetId: B })]);
    // a self-link closes on itself
    expect([...analyzeFlow([fnode(A)], [edge(A, A)]).backEdges]).toEqual([`${A}>${A}`]);
  });
});

describe('29.182 flow order', () => {
  it('29.182 Kahn over the edges without back edges; ready ties by (explicit sort day, id), a node with no day sorts last', () => {
    const full = analyzeFlow(mockupNodes(), mockupEdges());
    expect(keysOf(full.order).length).toBe(13);
    expect(full.order.map((id) => keysOf([id])[0])).toEqual(['140', '141', '143', '142', '144', '145', '147', '148', '146', '149', '150', '151', '152']);

    // diamond a -> {b, c} -> d. b has only a due day, c a start day one later: start-else-due puts b first.
    const diamond = [edge(A, B), edge(A, C), edge(B, D), edge(C, D)];
    const dated = [fnode(A), fnode(B, { explicitDue: '2026-10-02' }), fnode(C, { explicitStart: '2026-10-03' }), fnode(D)];
    expect(analyzeFlow(dated, diamond).order).toEqual([A, B, C, D]);
    // CONTROL: start earlier than b's due flips them, and with no days at all the id decides.
    const flipped = [fnode(A), fnode(B, { explicitDue: '2026-10-05' }), fnode(C, { explicitStart: '2026-10-03' }), fnode(D)];
    expect(analyzeFlow(flipped, diamond).order).toEqual([A, C, B, D]);
    expect(analyzeFlow([fnode(A), fnode(B), fnode(C), fnode(D)], diamond).order).toEqual([A, B, C, D]);
    // a dated node beats an undated one even when the undated id is smaller
    const undatedFirst = [fnode(A), fnode(B), fnode(C, { explicitDue: '2026-10-03' }), fnode(D)];
    expect(analyzeFlow(undatedFirst, diamond).order).toEqual([A, C, B, D]);
    // a node with BOTH days sorts by its start: c (start 10-03, due 10-09) before b (due 10-05). No other row has a node
    // with both, so without this one "due else start" would pass.
    const both = [fnode(A), fnode(B, { explicitDue: '2026-10-05' }), fnode(C, { explicitStart: '2026-10-03', explicitDue: '2026-10-09' }), fnode(D)];
    expect(analyzeFlow(both, diamond).order).toEqual([A, C, B, D]);
    // a loop is not an ordering constraint: the back edge is left out
    expect(analyzeFlow([fnode(A), fnode(B)], [edge(A, B), edge(B, A)]).order).toEqual([A, B]);
  });
});

describe('29.186 purity', () => {
  it('29.186 analysis does not mutate its inputs and gives the same answer for any input order', () => {
    const nodes = Object.freeze(mockupNodes().map((n) => Object.freeze(n)));
    const edges = Object.freeze(mockupEdges().map((e) => Object.freeze(e)));
    const a = analyzeFlow(nodes, edges);
    const b = analyzeFlow([...nodes].reverse(), [...edges].reverse());
    expect(b.order).toEqual(a.order);
    expect([...b.backEdges].sort()).toEqual([...a.backEdges].sort());
    expect(b.starts).toEqual(a.starts);
    expect(b.ends).toEqual(a.ends);
  });
});
