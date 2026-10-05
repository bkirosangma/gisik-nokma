import { describe, expect, it } from 'vitest';
import { analyzeFlow, branchOf, effectiveEdges, liveSet, loopBody, sameLabel } from '../../src/index.js';
import { M, decision, edge, fnode, keysOf, mockupEdges, mockupNodes, uid } from './fixtures.js';

const A = uid(1);
const X = uid(2);
const Y = uid(3);
const T = uid(4);
const Z = uid(5);

/** a (Decision): Yes -> x, No -> y; x -> t; y -> t (the shared tail); y -> z (only behind No). */
const tailEdges = [edge(A, X, 'Yes'), edge(A, Y, 'No'), edge(X, T), edge(Y, T), edge(Y, Z)];
const tailNodes = (outcome: string | null) => [decision(A, { outcome }), fnode(X), fnode(Y), fnode(T), fnode(Z)];
const live = (outcome: string | null) => {
  const nodes = tailNodes(outcome);
  return keysOfTail(liveSet(nodes, tailEdges, analyzeFlow(nodes, tailEdges)));
};
const NAME: Record<string, string> = { [A]: 'a', [X]: 'x', [Y]: 'y', [T]: 't', [Z]: 'z' };
const keysOfTail = (set: Set<string>): string[] => [...set].map((id) => NAME[id] ?? id).sort();

describe('29.183 the effective graph and the live set', () => {
  it('29.183 a chosen outcome cuts the other labels (compared after trim and case folding); the shared tail stays live; undecided cuts nothing', () => {
    expect(live('  YES ')).toEqual(['a', 't', 'x']);
    expect(live('no')).toEqual(['a', 't', 'y', 'z']);
    // CONTROL: no outcome yet, everything is live
    expect(live(null)).toEqual(['a', 't', 'x', 'y', 'z']);
    // an outcome that names no edge cuts every branch; the Decision itself stays live
    expect(live('Maybe')).toEqual(['a']);

    // the effective graph keeps the chosen edge and drops the other label's edge; everything else is untouched
    const decided = effectiveEdges(tailNodes('Yes'), tailEdges).map((e) => `${NAME[e.sourceId]}>${NAME[e.targetId]}`);
    expect(decided).toEqual(['a>x', 'x>t', 'y>t', 'y>z']);
    // an edge out of a Not-taken source stays in the effective graph (only a Decision's choice cuts edges)
    const notTaken = { kind: 'not-taken' as const, decisionTicketId: A, outcome: 'Yes', pass: 1 };
    const withNotTaken = [decision(A), fnode(X), fnode(Y, { notTaken }), fnode(T), fnode(Z)];
    expect(effectiveEdges(withNotTaken, tailEdges)).toEqual(tailEdges);
    // only a DECISION's outcome cuts: a task holding a stale outcome cuts nothing, and an edge out of a hole (no node,
    // so no choice) is kept as it is
    const stale = [decision(A), fnode(X, { outcome: 'Yes' }), fnode(Y), fnode(T), fnode(Z)];
    const fromHole = edge(uid(99), X, 'No');
    expect(effectiveEdges(stale, [fromHole, ...tailEdges])).toEqual([fromHole, ...tailEdges]);

    // a hole neither roots, blocks nor joins the live set: a link from a hidden id into a does not take a's root,
    // and a link from z to a hidden id does not bring the hidden id in
    const holeNodes = tailNodes(null);
    const holeEdges = [edge(uid(99), A), ...tailEdges, edge(Z, uid(98))];
    expect(keysOfTail(liveSet(holeNodes, holeEdges, analyzeFlow(holeNodes, holeEdges)))).toEqual(['a', 't', 'x', 'y', 'z']);

    // a ticket cut off by the choice must not become a root and so live for free (z has no other way in)
    expect(live('Yes')).not.toContain('z');

    // the mockup: GN-144 = "No" keeps 145 and 146 and cuts 147, and 148 to 152 behind it (they are only reachable through 147)
    const nodes = mockupNodes({ '144': { outcome: 'No' } });
    const edges = mockupEdges();
    expect(keysOf(liveSet(nodes, edges, analyzeFlow(nodes, edges)))).toEqual(['140', '141', '142', '143', '144', '145', '146']);
  });

  it('29.183 sameLabel: trim and case fold, an absent label equals only an absent label', () => {
    expect(sameLabel(' Need more INFO', 'need more info ')).toBe(true);
    expect(sameLabel('Yes', 'No')).toBe(false);
    expect(sameLabel(null, null)).toBe(true);
    expect(sameLabel(null, 'Yes')).toBe(false);
    expect(sameLabel('Yes', null)).toBe(false);
  });

  it('29.183 the live set walks each ticket once: a ladder of Decisions that rejoin costs a lookup per link, not one per path', () => {
    // c0 -> {a0, b0} -> c1 -> {a1, b1} -> ... -> c12: 37 tickets, 48 links, 2^12 paths. The walk's `seen` check is what keeps
    // the queue to one entry per ticket; without it the queue holds one entry per PATH (16,000+ lookups here). That cost
    // doubles with each rung (about 160 ms at 20 rungs), and a flow at the 300-ticket cap has room for about 100 rungs, so it
    // is unbounded long before the cap. The result alone cannot tell the two apart, so count the lookups.
    const rungs = 12;
    const c = (i: number) => uid(100 + i);
    const nodes = [fnode(c(0))];
    const edges: Array<ReturnType<typeof edge>> = [];
    for (let i = 0; i < rungs; i += 1) {
      nodes.push(fnode(uid(200 + i)), fnode(uid(300 + i)), fnode(c(i + 1)));
      edges.push(edge(c(i), uid(200 + i)), edge(c(i), uid(300 + i)), edge(uid(200 + i), c(i + 1)), edge(uid(300 + i), c(i + 1)));
    }
    const analysis = analyzeFlow(nodes, edges);
    const get = Map.prototype.get;
    let lookups = 0;
    Map.prototype.get = function (this: Map<unknown, unknown>, key: unknown) {
      lookups += 1;
      return get.call(this, key);
    };
    let live = new Set<string>();
    try {
      live = liveSet(nodes, edges, analysis);
    } finally {
      Map.prototype.get = get;
    }
    expect(live.size).toBe(nodes.length);
    // CONTROL: the counter sees the walk (one adjacency lookup per ticket at least), so a pass is not a blind instrument
    expect(lookups).toBeGreaterThanOrEqual(nodes.length);
    expect(lookups).toBeLessThan(4 * (nodes.length + edges.length));
  });
});

describe('29.184 loop bodies and branches', () => {
  it('29.184 a loop body is the tickets on a forward path from the target to the Decision, never one the walk merely passes through', () => {
    const edges = mockupEdges();
    const nodes = mockupNodes();
    const analysis = analyzeFlow(nodes, edges);
    const back = (from: keyof typeof M, to: keyof typeof M) => ({ sourceId: M[from], targetId: M[to] });
    expect(keysOf(loopBody(back('151', '149'), edges, analysis))).toEqual(['149', '150', '151']);
    // 145 and 146 are reachable from 141 but never reach 151, so they are not in the "No" loop; 140 and 152 are outside it
    expect(keysOf(loopBody(back('151', '141'), edges, analysis))).toEqual(['141', '142', '143', '144', '147', '148', '149', '150', '151']);
    // a two-ticket loop: both
    const pair = [edge(A, X), edge(X, A)];
    const pairAnalysis = analyzeFlow([fnode(A), fnode(X)], pair);
    expect([...loopBody({ sourceId: X, targetId: A }, pair, pairAnalysis)].sort()).toEqual([A, X]);
    // a self-link: just the ticket
    expect([...loopBody({ sourceId: A, targetId: A }, [edge(A, A)], analyzeFlow([fnode(A)], [edge(A, A)]))]).toEqual([A]);
  });

  it('29.184 a branch is what an edge leads to without passing back through the Decision; a shared tail is on both', () => {
    const edges = mockupEdges();
    const analysis = analyzeFlow(mockupNodes(), edges);
    const yes = branchOf(M['144'], 'yes', edges, analysis);
    const no = branchOf(M['144'], 'No', edges, analysis);
    expect(keysOf(yes)).toEqual(['146', '147', '148', '149', '150', '151', '152']);
    expect(keysOf(no)).toEqual(['145', '146']);
    expect(yes.has(M['146']) && no.has(M['146'])).toBe(true); // GN-146 is the shared tail
    expect(branchOf(M['144'], 'Maybe', edges, analysis).size).toBe(0); // CONTROL: no such label, no branch
    // never through the Decision itself: 149 -> 150 -> 151 stops AT 151 (exact set, so a walk through it, which adds 151 and 152, fails)
    expect(keysOf(branchOf(M['151'], 'Need more info', edges, analysis))).toEqual(['149', '150']);
    // the branch is THIS Decision's edge: GN-148's "No" is 148 -> 146 (146 -> 143 closes a loop), not GN-144's "No" -> 145
    expect(keysOf(branchOf(M['148'], 'No', edges, analysis))).toEqual(['146']);
    // a Decision's labelled link to itself leads nowhere new: the walk never passes through the Decision
    const again = [edge(A, A, 'Again')];
    expect(branchOf(A, 'Again', again, analyzeFlow([decision(A)], again)).size).toBe(0);
  });

  it('29.184 an edge with an end the analysis does not know (a hole) is dropped by the loop body and the branch, as by analyzeFlow', () => {
    const H = uid(9); // a hidden ticket: in the edges, not in the nodes
    // the loop x -> y, y -> x (closing), plus x -> h -> y around the hole
    const loopEdges = [edge(X, Y), edge(X, H), edge(H, Y), edge(Y, X)];
    const loopAnalysis = analyzeFlow([fnode(X), decision(Y)], loopEdges);
    expect(keysOfTail(loopBody({ sourceId: Y, targetId: X }, loopEdges, loopAnalysis))).toEqual(['x', 'y']);
    // a back edge that is itself a hole edge has no body
    expect(loopBody({ sourceId: Y, targetId: H }, loopEdges, loopAnalysis).size).toBe(0);
    // CONTROL: the same edges with h a node of the flow: h is in the body
    const seen = analyzeFlow([fnode(X), decision(Y), fnode(H)], loopEdges);
    expect([...loopBody({ sourceId: Y, targetId: X }, loopEdges, seen)].sort()).toEqual([X, Y, H]);

    // a: Yes -> h (the hole) -> y; No -> x -> h
    const branchEdges = [edge(A, H, 'Yes'), edge(A, X, 'No'), edge(X, H), edge(H, Y)];
    const branchAnalysis = analyzeFlow([decision(A), fnode(X), fnode(Y)], branchEdges);
    expect(branchOf(A, 'Yes', branchEdges, branchAnalysis).size).toBe(0); // the edge itself leads into the hole
    expect(keysOfTail(branchOf(A, 'No', branchEdges, branchAnalysis))).toEqual(['x']); // y is behind the hole only
    // CONTROL: with h a node, both branches reach it and y behind it
    const open = analyzeFlow([decision(A), fnode(X), fnode(Y), fnode(H)], branchEdges);
    expect([...branchOf(A, 'Yes', branchEdges, open)].sort()).toEqual([Y, H]);
    expect([...branchOf(A, 'No', branchEdges, open)].sort()).toEqual([X, Y, H]);
  });
});
