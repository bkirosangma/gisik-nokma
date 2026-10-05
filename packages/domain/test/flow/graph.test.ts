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
  });
});
