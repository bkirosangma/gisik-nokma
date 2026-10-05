import { describe, expect, it } from 'vitest';
import { BACKLOG_STATE_ID, promotionsFor, type FlowEdge, type FlowNode } from '../src/index.js';

/**
 * wtg2 T13 (spec AP-1 to AP-3): `promotionsFor`, the pure rule that says which Backlog tickets a flow promotes and from
 * which source. The plan's legs come first in each describe; the second `it` holds the legs the lane's mutation pass
 * added (a clause or a second element the plan's legs cannot tell apart), each with its control beside it.
 */

const node = (id: string, over: Partial<FlowNode> = {}): FlowNode => ({
  id, typeId: 'task', stateId: 'todo', category: 'open', closed: false, trashed: false, draft: false, parentId: null,
  isDecision: false, outcome: null, passes: [], notTaken: null, waitForAll: false, started: false, rounds: 1, periods: [],
  explicitStart: null, explicitDue: null, estimate: null, reworkEstimate: null, initialStateId: 'todo',
  firstTerminalStateId: 'done', ...over,
});
const backlog = (id: string, over: Partial<FlowNode> = {}) => node(id, { stateId: BACKLOG_STATE_ID, ...over });
const done = (id: string, end = '2026-10-02T09:00:00.000Z', over: Partial<FlowNode> = {}) =>
  node(id, { stateId: 'done', category: 'terminal', periods: [{ start: '2026-10-01T09:00:00.000Z', end, pass: 1 }], ...over });
const active = (id: string) => node(id, { stateId: 'doing', category: 'active' });
const NOT_TAKEN = { kind: 'not-taken' as const, decisionTicketId: 'd', outcome: 'No', pass: 1 };
const edge = (sourceId: string, targetId: string, label: string | null = null): FlowEdge => ({ sourceId, targetId, label });
const ids = (p: ReturnType<typeof promotionsFor>) => p.map((x) => `${x.sourceTicketId}>${x.targetId}`);

describe('29.210 the satisfied edge (any)', () => {
  it('29.210 terminal category without a not-taken resolution; a Decision only by its label', () => {
    const run = (source: FlowNode) => promotionsFor({ nodes: [source, backlog('t')], edges: [edge('s', 't')], targetIds: ['t'] });
    expect(ids(run(done('s')))).toEqual(['s>t']);
    expect(run(active('s'))).toEqual([]); // control: same graph, source still active
    expect(run(done('s', undefined, { notTaken: NOT_TAKEN }))).toEqual([]);
    const decide = (outcome: string | null) =>
      promotionsFor({
        nodes: [done('d', undefined, { isDecision: true, outcome }), backlog('y'), backlog('n')],
        edges: [edge('d', 'y', 'yes'), edge('d', 'n', 'No')], targetIds: ['y', 'n'],
      });
    expect(decide('Yes')).toEqual([{ targetId: 'y', sourceTicketId: 'd', label: 'yes' }]); // case-folded
    expect(decide(null)).toEqual([]); // loop-reset Decision satisfies nothing
  });
  it('29.210 an unlabelled edge from a Decision with no outcome satisfies nothing; an ordinary source ignores the label', () => {
    // a Decision edge with no label (one filed before the label rule, or before the type became a Decision): two absent
    // labels agree in sameLabel, so only the outcome test keeps a pending Decision from satisfying it
    const unlabelled = (outcome: string | null) =>
      promotionsFor({ nodes: [done('d', undefined, { isDecision: true, outcome }), backlog('t')], edges: [edge('d', 't')], targetIds: ['t'] });
    expect(unlabelled(null)).toEqual([]);
    expect(unlabelled('Yes')).toEqual([]); // an outcome never matches a missing label
    // control: a plain (non-Decision) source satisfies a labelled edge, and the promotion carries that label
    expect(promotionsFor({ nodes: [done('s'), backlog('t')], edges: [edge('s', 't', 'Go')], targetIds: ['t'] })).toEqual([
      { targetId: 't', sourceTicketId: 's', label: 'Go' },
    ]);
  });
});

describe('29.211 waitForAll and I*(T)', () => {
  it('29.211 every considered edge; back edges, not-taken and other-label edges dropped; empty I* promotes nothing', () => {
    const tail = (over: Partial<FlowNode> = {}) => backlog('t', { waitForAll: true, ...over });
    expect(ids(promotionsFor({ nodes: [done('a'), done('b'), tail()], edges: [edge('a', 't'), edge('b', 't')], targetIds: ['t'] }))).toEqual(['a>t']);
    // control: one unsatisfied forward edge holds the target
    expect(promotionsFor({ nodes: [done('a'), active('b'), tail()], edges: [edge('a', 't'), edge('b', 't')], targetIds: ['t'] })).toEqual([]);
    // loop: s -> t -> u -> v -> t; v -> t is the back edge, so s alone decides. The loop's ids sort AFTER 't' on purpose:
    // without s, analyzeFlow's DFS roots at the smallest unvisited id, and a loop node named below 't' (e.g. 'later')
    // would be the root, making m -> later the back edge and later -> t FORWARD, so the fallback below would go untested.
    const loop = (v: FlowNode, withS: boolean) =>
      promotionsFor({
        nodes: [done('s'), tail(), node('u'), v],
        edges: [...(withS ? [edge('s', 't')] : []), edge('t', 'u'), edge('u', 'v'), edge('v', 't')], targetIds: ['t'],
      });
    expect(ids(loop(active('v'), true))).toEqual(['s>t']);
    expect(loop(active('v'), false)).toEqual([]); // I' empty, so I(T) = the back edge v -> t, unsatisfied
    expect(ids(loop(done('v'), false))).toEqual(['v>t']); // the "unless none remain" fallback: only the back edge decides
    // diamond tail: b was closed Not taken, so only a is waited for; with b merely open the tail waits
    const diamond = (b: FlowNode, outcome: string | null) =>
      promotionsFor({
        nodes: [done('d', undefined, { isDecision: true, outcome }), done('a'), b, tail()],
        edges: [edge('d', 'a', 'A'), edge('d', 'b', 'B'), edge('a', 't'), edge('b', 't')], targetIds: ['t'],
      });
    expect(ids(diamond(done('b', undefined, { notTaken: NOT_TAKEN }), 'A'))).toEqual(['a>t']);
    expect(diamond(backlog('b'), 'A')).toEqual([]);
    // revised to B: a (finished with work) stays, but b is now the taken branch and is not done
    expect(diamond(active('b'), 'B')).toEqual([]);
    // a Decision edge straight into the tail: another label drops it, a pending Decision still holds it
    const direct = (outcome: string | null) =>
      promotionsFor({ nodes: [done('d', undefined, { isDecision: true, outcome }), done('a'), tail()], edges: [edge('d', 't', 'B'), edge('a', 't')], targetIds: ['t'] });
    expect(ids(direct('A'))).toEqual(['a>t']);
    expect(direct(null)).toEqual([]);
    // empty I*: the only source is not taken
    expect(promotionsFor({ nodes: [done('s', undefined, { notTaken: NOT_TAKEN }), tail()], edges: [edge('s', 't')], targetIds: ['t'] })).toEqual([]);
  });
  it('29.211 waitForAll checks EVERY considered edge, whichever position the unsatisfied one holds', () => {
    const tail = backlog('t', { waitForAll: true });
    const run = (a: FlowNode, b: FlowNode) => promotionsFor({ nodes: [a, b, tail], edges: [edge('a', 't'), edge('b', 't')], targetIds: ['t'] });
    expect(run(active('a'), done('b'))).toEqual([]); // the unsatisfied edge sorts FIRST
    expect(run(done('a'), active('b'))).toEqual([]); // and LAST
    expect(ids(run(done('a'), done('b')))).toEqual(['a>t']); // control: both satisfied
    // without waitForAll one satisfied edge is enough, in either position
    const any = (a: FlowNode, b: FlowNode) => promotionsFor({ nodes: [a, b, backlog('t')], edges: [edge('a', 't'), edge('b', 't')], targetIds: ['t'] });
    expect(ids(any(active('a'), done('b')))).toEqual(['b>t']);
    expect(ids(any(done('a'), active('b')))).toEqual(['a>t']);
  });
});

describe('29.212 targets and sources that count', () => {
  it('29.212 Backlog only; live and non-draft; a trashed or draft source is not in I(T)', () => {
    const into = (target: FlowNode) => promotionsFor({ nodes: [done('s'), target], edges: [edge('s', 't')], targetIds: ['t'] });
    expect(ids(into(backlog('t')))).toEqual(['s>t']); // control
    for (const t of [node('t'), active('t'), done('t'), backlog('t', { trashed: true }), backlog('t', { draft: true })]) expect(into(t)).toEqual([]);
    const two = (b: FlowNode) => promotionsFor({ nodes: [done('a'), b, backlog('t', { waitForAll: true })], edges: [edge('a', 't'), edge('b', 't')], targetIds: ['t'] });
    expect(two(active('b'))).toEqual([]); // control: a live open source holds it
    expect(ids(two({ ...active('b'), trashed: true }))).toEqual(['a>t']);
    expect(ids(two({ ...backlog('b'), draft: true }))).toEqual(['a>t']);
  });
  it('29.212 only edges INTO the target count, and an unknown target or source id is ignored, not thrown on', () => {
    // a satisfied edge into u must not promote t, whose own edge is from an open source
    const both = promotionsFor({ nodes: [done('a'), active('b'), backlog('t'), backlog('u')], edges: [edge('a', 'u'), edge('b', 't')], targetIds: ['t', 'u'] });
    expect(ids(both)).toEqual(['a>u']);
    // a target id the read did not return (trashed, cut, or never there)
    expect(promotionsFor({ nodes: [done('s')], edges: [edge('s', 't')], targetIds: ['t'] })).toEqual([]);
    // an edge whose source is not a node (a hole) is not in I(T); the target's other edge still decides
    expect(ids(promotionsFor({ nodes: [done('s'), backlog('t')], edges: [edge('gone', 't'), edge('s', 't')], targetIds: ['t'] }))).toEqual(['s>t']);
    expect(promotionsFor({ nodes: [backlog('t')], edges: [edge('gone', 't')], targetIds: ['t'] })).toEqual([]);
  });
});

describe('29.213 attribution and order', () => {
  it('29.213 latest finisher, then smallest id; the edge label; sorted by target', () => {
    // Edges listed b first on purpose: the tie leg must need `incoming.sort` (input already in id order would pass without it).
    const pick = (a: FlowNode, b: FlowNode) => promotionsFor({ nodes: [a, b, backlog('t')], edges: [edge('b', 't', 'y'), edge('a', 't', 'x')], targetIds: ['t'] })[0];
    expect(pick(done('a', '2026-10-01T09:00:00.000Z'), done('b', '2026-10-03T09:00:00.000Z'))).toEqual({ targetId: 't', sourceTicketId: 'b', label: 'y' });
    expect(pick(done('a', '2026-10-03T09:00:00.000Z'), done('b', '2026-10-03T09:00:00.000Z'))?.sourceTicketId).toBe('a'); // tie: smallest id
    expect(pick(node('a', { stateId: 'done', category: 'terminal' }), done('b'))?.sourceTicketId).toBe('b'); // control: no period loses
    const many = promotionsFor({ nodes: [done('s'), backlog('z'), backlog('m')], edges: [edge('s', 'z'), edge('s', 'm')], targetIds: ['z', 'm', 'z'] });
    expect(many.map((p) => p.targetId)).toEqual(['m', 'z']);
  });
  it('29.213 the finish is the end of the LAST work period, not of the first', () => {
    // a has run twice (a loop): its first pass ended before b finished, its second after
    const twice = done('a', '2026-10-05T09:00:00.000Z', {
      periods: [
        { start: '2026-09-30T09:00:00.000Z', end: '2026-10-01T09:00:00.000Z', pass: 1 },
        { start: '2026-10-04T09:00:00.000Z', end: '2026-10-05T09:00:00.000Z', pass: 2 },
      ],
    });
    const pick = (a: FlowNode) =>
      promotionsFor({ nodes: [a, done('b', '2026-10-03T09:00:00.000Z'), backlog('t')], edges: [edge('a', 't'), edge('b', 't')], targetIds: ['t'] })[0]?.sourceTicketId;
    expect(pick(twice)).toBe('a');
    expect(pick(done('a', '2026-10-01T09:00:00.000Z'))).toBe('b'); // control: one pass ending first loses
  });
});
