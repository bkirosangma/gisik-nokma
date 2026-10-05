import { describe, expect, it } from 'vitest';
import {
  SYSTEM_ACTOR_FLOW,
  parseEvent,
  planSettle,
  settleEvents,
  type FlowEdge,
  type FlowNode,
  type SettlePlan,
} from '../../src/index.js';
import { decision, edge, fnode, keysOf, mockup, uid } from './fixtures.js';

const m = mockup();
const K = m.ids;
const [P, X, Y, Z, Q, W] = [21, 22, 23, 24, 25, 26].map(uid) as [string, string, string, string, string, string];
const DEC = uid(20);

const FINISHED: Partial<FlowNode> = { stateId: 'done', category: 'terminal' };
const WORKING: Partial<FlowNode> = { stateId: 'doing', category: 'active', started: true, periods: [{ start: '2026-10-01T04:00:00.000Z', end: null, pass: 1 }] };
const BACKLOG: Partial<FlowNode> = { stateId: 'backlog', category: 'open' };
const notTaken = (decisionTicketId: string, outcome = 'Yes', pass = 1) =>
  ({ ...FINISHED, closed: true, notTaken: { kind: 'not-taken' as const, decisionTicketId, outcome, pass } }) satisfies Partial<FlowNode>;
const decided = (outcome: string | null, over: Partial<FlowNode> = {}): Partial<FlowNode> => ({ outcome, ...FINISHED, ...over });

/** `kind:ticket-number` per step, for readable expectations. */
function show(plan: SettlePlan, keys: (ids: Iterable<string>) => string[] = keysOf): string[] {
  return plan.steps.map((s) => `${s.kind}:${keys([s.ticketId])[0]}`);
}
/** The hand-built flows' ids as letters, in the order given (unlike `keysOf`, which sorts). */
const letters = (ids: Iterable<string>): string[] =>
  [...ids].map((id) => ({ [P]: 'p', [X]: 'x', [Y]: 'y', [Z]: 'z', [Q]: 'q', [W]: 'w', [DEC]: 'd' })[id] ?? id);

describe('29.364 a non-loop outcome closes what only the other branches lead to', () => {
  it('29.364 GN-144 = Yes: only GN-145 (reached only through "No") closes Not taken; the shared tail GN-146 stays', () => {
    const nodes = m.nodes({ '144': decided('Yes') });
    const plan = planSettle({ nodes, edges: m.edges(), decisionId: K['144'] });
    expect(show(plan)).toEqual(['not-taken-transition:145', 'not-taken-close:145']);
    expect(plan.steps[0]).toEqual({ kind: 'not-taken-transition', ticketId: K['145'], toStateId: 'done' });
    expect(plan.touchesOthers).toBe(true);
    expect(plan.blocked).toBeNull();
    expect(plan.started).toEqual([]);
    // CONTROL: GN-146 is also reached through GN-148 ("No" of the undecided GN-148), so it is live; it is not in the plan
    expect(show(plan)).not.toContain('not-taken-transition:146');
  });

  it('29.364 GN-144 = No: the whole "Yes" side closes Not taken in flow order, Decisions included; finished work and started work are left', () => {
    const edges = m.edges();
    const nodes = m.nodes({ '144': decided('No'), '147': FINISHED, '149': WORKING });
    const plan = planSettle({ nodes, edges, decisionId: K['144'] });
    // 147 is finished with work (kept, PS-5.2); 149 is started (kept, asked about); the rest of the side closes
    expect(show(plan)).toEqual([
      'not-taken-transition:148', 'not-taken-close:148',
      'not-taken-transition:150', 'not-taken-close:150',
      'not-taken-transition:151', 'not-taken-close:151',
      'not-taken-transition:152', 'not-taken-close:152',
    ]);
    expect(keysOf(plan.started)).toEqual(['149']);
    // naming the started ticket closes it too, in its place in the flow order
    const named = planSettle({ nodes, edges, decisionId: K['144'], closeStarted: [K['149']] });
    expect(show(named)).toEqual([
      'not-taken-transition:148', 'not-taken-close:148',
      'not-taken-transition:149', 'not-taken-close:149',
      'not-taken-transition:150', 'not-taken-close:150',
      'not-taken-transition:151', 'not-taken-close:151',
      'not-taken-transition:152', 'not-taken-close:152',
    ]);
    expect(named.started).toEqual([]);
    // an id that is not on a left branch is not honoured (it is the gate's job to refuse it)
    const stray = planSettle({ nodes, edges, decisionId: K['144'], closeStarted: [K['140']] });
    expect(show(stray)).toEqual(show(plan));
  });

  it('29.364 the left side is only this Decision\'s other forward branches: not its loop label, not another Decision\'s cut side, not a stray name', () => {
    // s -> w -> e (Decision, chose Again): Again -> a -> d, No -> b -> d; d (Decision, chose Go): Go -> f, Again -> w (d's
    // loop); f (Decision, chose A): A -> p, B -> q. b is cut by e and q by f: neither is live, neither is on a branch d leaves
    const [w, e, a, b, f, p, q, s] = [30, 31, 32, 33, 34, 35, 36, 41].map(uid) as [string, string, string, string, string, string, string, string];
    const edges = [edge(s, w), edge(w, e), edge(e, a, 'Again'), edge(e, b, 'No'), edge(a, DEC), edge(b, DEC), edge(DEC, f, 'Go'), edge(DEC, w, 'Again'), edge(f, p, 'A'), edge(f, q, 'B')];
    const nodes = [fnode(s), fnode(w), decision(e, { outcome: 'Again' }), fnode(a), fnode(b, WORKING), decision(DEC, decided('Go')), decision(f, { outcome: 'A' }), fnode(p), fnode(q, WORKING)];
    const quiet = { steps: [], blocked: null, started: [], touchesOthers: false };
    expect(planSettle({ nodes, edges, decisionId: DEC })).toEqual(quiet);
    // a name for a ticket off d's branches is not honoured either
    expect(planSettle({ nodes, edges, decisionId: DEC, closeStarted: [b, q] })).toEqual(quiet);
    // CONTROL: d's own other forward label does close what only it leads to (z); y, already resolved Not taken (its state
    // since edited off the terminal one), is not closed again
    const resolved = { closed: true, notTaken: { kind: 'not-taken' as const, decisionTicketId: uid(97), outcome: 'Yes', pass: 1 } };
    const stop = planSettle({ nodes: [...nodes, fnode(Z), fnode(Y, resolved)], edges: [...edges, edge(DEC, Z, 'Stop'), edge(DEC, Y, 'Halt')], decisionId: DEC });
    expect(show(stop, letters)).toEqual(['not-taken-transition:z', 'not-taken-close:z']);
  });

  it('29.364 started tickets on the left side are listed in flow order, whatever order the links were drawn in', () => {
    // d: Go -> p, Stop -> y, Halt -> x; the Stop link is drawn first, the flow order puts x (the smaller id) first
    const edges = [edge(DEC, P, 'Go'), edge(DEC, Y, 'Stop'), edge(DEC, X, 'Halt')];
    const plan = planSettle({ nodes: [decision(DEC, decided('Go')), fnode(P), fnode(Y, WORKING), fnode(X, WORKING)], edges, decisionId: DEC });
    expect(plan.steps).toEqual([]);
    expect(letters(plan.started)).toEqual(['x', 'y']);
  });

  it('29.364 the children of a closing ticket close before it; a child that must stay open blocks the whole plan', () => {
    // d: Yes -> a (live), No -> x -> y; y is a child of x, and the flow order puts x before y
    const edges = [edge(DEC, P, 'Yes'), edge(DEC, X, 'No'), edge(X, Y)];
    const nodes = [decision(DEC, decided('Yes')), fnode(P), fnode(X), fnode(Y, { parentId: X })];
    expect(show(planSettle({ nodes, edges, decisionId: DEC }), (ids) => [...ids].map((id) => ({ [X]: 'x', [Y]: 'y' })[id] ?? id))).toEqual([
      'not-taken-transition:y', 'not-taken-close:y', 'not-taken-transition:x', 'not-taken-close:x',
    ]);
    // a child that the live side also leads to is live and cannot close with its parent
    const live = planSettle({
      nodes: [decision(DEC, decided('Yes')), fnode(P), fnode(X), fnode(Y, { parentId: X })],
      edges: [...edges, edge(P, Y)],
      decisionId: DEC,
    });
    expect(live).toEqual({ steps: [], blocked: { ticketId: X, reason: 'child-open' }, started: [], touchesOthers: false });
    // and a started child that nobody named blocks too; naming it lets the plan through
    const startedChild = [decision(DEC, decided('Yes')), fnode(P), fnode(X), fnode(Y, { parentId: X, ...WORKING })];
    expect(planSettle({ nodes: startedChild, edges, decisionId: DEC }).blocked).toEqual({ ticketId: X, reason: 'child-open' });
    expect(planSettle({ nodes: startedChild, edges, decisionId: DEC, closeStarted: [Y] }).blocked).toBeNull();
    // a started child off the flow's left side (cut by another Decision, e chose A): named, it closes with its parent;
    // unnamed, it blocks (the name is honoured in the child walk too, not only on the left side)
    const E = uid(40);
    const offSide = [...edges, edge(E, Q, 'A'), edge(E, Z, 'B')];
    const offChild = [decision(DEC, decided('Yes')), fnode(P), fnode(X), decision(E, { outcome: 'A' }), fnode(Q), fnode(Z, { parentId: X, ...WORKING })];
    expect(planSettle({ nodes: offChild, edges: offSide, decisionId: DEC }).blocked).toEqual({ ticketId: X, reason: 'child-open' });
    expect(show(planSettle({ nodes: offChild, edges: offSide, decisionId: DEC, closeStarted: [Z] }), letters)).toEqual([
      'not-taken-transition:z', 'not-taken-close:z', 'not-taken-transition:x', 'not-taken-close:x',
    ]);
    // a finished child (live: it is on no link) is left as it is, and does not block its parent's close
    const doneChild = [decision(DEC, decided('Yes')), fnode(P), fnode(X), fnode(Y, { parentId: X, ...FINISHED })];
    expect(show(planSettle({ nodes: doneChild, edges, decisionId: DEC }), letters)).toEqual(['not-taken-transition:x', 'not-taken-close:x']);
    // a draft child the live side does not reach blocks as well: a draft is never moved, so it cannot close with its parent
    const draftChild = [decision(DEC, decided('Yes')), fnode(P), fnode(X), fnode(Y, { parentId: X, draft: true })];
    expect(planSettle({ nodes: draftChild, edges, decisionId: DEC })).toEqual({ steps: [], blocked: { ticketId: X, reason: 'child-open' }, started: [], touchesOthers: false });
  });

  it('29.364 a three-level chain closes grandchild, child, parent; a corrupt parent loop still plans', () => {
    // d: Yes -> p (live), No -> x -> y -> z; z is y's child and y is x's, the flow order is x, y, z: only depth reverses it
    const chain = [edge(DEC, P, 'Yes'), edge(DEC, X, 'No'), edge(X, Y), edge(Y, Z)];
    const nodes = [decision(DEC, decided('Yes')), fnode(P), fnode(X), fnode(Y, { parentId: X }), fnode(Z, { parentId: Y })];
    expect(show(planSettle({ nodes, edges: chain, decisionId: DEC }), letters)).toEqual([
      'not-taken-transition:z', 'not-taken-close:z', 'not-taken-transition:y', 'not-taken-close:y', 'not-taken-transition:x', 'not-taken-close:x',
    ]);
    // x's parent is y and y's parent is x: the depth count is bounded by the node count, so the plan returns (both at the
    // same depth, so the flow order decides)
    const edges = [edge(DEC, P, 'Yes'), edge(DEC, X, 'No'), edge(X, Y)];
    const loop = [decision(DEC, decided('Yes')), fnode(P), fnode(X, { parentId: Y }), fnode(Y, { parentId: X })];
    expect(show(planSettle({ nodes: loop, edges, decisionId: DEC }), letters)).toEqual([
      'not-taken-transition:x', 'not-taken-close:x', 'not-taken-transition:y', 'not-taken-close:y',
    ]);
  });

  it('29.364 the depth walk is bounded: a corrupt parent cycle stops after exactly nodes + 1 hops; a real chain of n takes n - 1', () => {
    // d: Yes -> p, No -> x -> y. x and y close; their one sort comparison asks depth(x) once. x hangs under c1, whose
    // counted parentId getters see each hop. The same flow with x under nothing is the baseline (it subtracts every
    // other read of those getters, which does not depend on x).
    const edges = [edge(DEC, P, 'Yes'), edge(DEC, X, 'No'), edge(X, Y)];
    const [c1, c2, c3] = [50, 51, 52].map(uid) as [string, string, string];
    let reads = 0;
    const counted = (id: string, parentId: string | null): FlowNode =>
      Object.defineProperty(fnode(id), 'parentId', { get: () => ((reads += 1), parentId), enumerable: true });
    const walk = (xParent: string | null, above: () => FlowNode[]): number => {
      reads = 0;
      planSettle({ nodes: [decision(DEC, decided('Yes')), fnode(P), fnode(X, { parentId: xParent }), fnode(Y), ...above()], edges, decisionId: DEC });
      return reads;
    };
    // A hop reads its ticket's parentId twice (the null test, then the lookup); a null parent ends the walk after one read.
    // The corrupt cycle c1 <-> c2 in a flow of SIX nodes: the cap is the node count, 6, so hops 0..6 pass and the walk
    // stops after 7 hops (the literal is the cap's own pin: x10 walks 61 hops, '<' walks 6)
    const cycle = () => [counted(c1, c2), counted(c2, c1)];
    expect(walk(c1, cycle) - walk(null, cycle)).toBe(2 * 7);
    // CONTROL: a real chain x -> c1 -> c2 -> c3 (four tickets) takes 3 hops, n - 1: two reads each, the last one null
    const chain = () => [counted(c1, c2), counted(c2, c3), counted(c3, null)];
    expect(walk(c1, chain) - walk(null, chain)).toBe(2 + 2 + 1);
  });

  it('29.364 drafts and trashed tickets are never moved', () => {
    const nodes = m.nodes({ '144': decided('Yes'), '145': { draft: true } });
    expect(planSettle({ nodes, edges: m.edges(), decisionId: K['144'] }).steps).toEqual([]);
    const trashed = m.nodes({ '144': decided('Yes'), '145': { trashed: true } });
    expect(planSettle({ nodes: trashed, edges: m.edges(), decisionId: K['144'] }).steps).toEqual([]);
  });
});

describe('29.365 a loop outcome re-runs the loop body', () => {
  it('29.365 GN-151 = "Need more info": the target reopens to its initial state, the rest of the body (the Decision too) goes to Backlog, nothing is pruned', () => {
    const edges = m.edges();
    const nodes = m.nodes({
      // an initial state that is not 'todo', so the step must read the node's own `initialStateId`
      '149': { ...FINISHED, closed: true, initialStateId: 'intake' },
      '150': FINISHED, // finished but not closed: no reopen step
      '151': decided('Need more info'), // decided, not closed: no reopen step for the Decision either
    });
    const plan = planSettle({ nodes, edges, decisionId: K['151'] });
    expect(show(plan)).toEqual(['reopen:149', 'to-initial:149', 'to-backlog:150', 'to-backlog:151']);
    expect(plan.steps[1]).toEqual({ kind: 'to-initial', ticketId: K['149'], toStateId: 'intake' });
    expect(plan.touchesOthers).toBe(true);
    // nothing is closed Not taken: GN-152 ("Yes") keeps waiting
    expect(show(plan).some((s) => s.startsWith('not-taken'))).toBe(false);
  });

  it('29.365 a started body ticket goes back too; a target that is not finished stays where it is; Backlog tickets are not moved again', () => {
    const edges = m.edges();
    const nodes = m.nodes({ '149': WORKING, '150': { ...WORKING, stateId: 'doing' }, '151': decided('Need more info', { closed: true }) });
    const plan = planSettle({ nodes, edges, decisionId: K['151'] });
    expect(show(plan)).toEqual(['to-backlog:150', 'reopen:151', 'to-backlog:151']);
    // CONTROL: the target left in Backlog, the body in Backlog: only the Decision moves
    const quiet = planSettle({ nodes: m.nodes({ '149': BACKLOG, '150': BACKLOG, '151': decided('Need more info') }), edges, decisionId: K['151'] });
    expect(show(quiet)).toEqual(['to-backlog:151']);
    expect(quiet.touchesOthers).toBe(false);
  });

  it('29.365 the "No" loop (GN-151 -> GN-141) resets GN-141 to GN-151 and leaves GN-145, GN-146 and GN-152 alone', () => {
    const nodes = m.nodes({
      '141': FINISHED, '142': FINISHED, '143': FINISHED, '144': FINISHED, '145': FINISHED, '146': FINISHED,
      '147': FINISHED, '148': FINISHED, '149': FINISHED, '150': FINISHED, '151': decided('No'),
    });
    const plan = planSettle({ nodes, edges: m.edges(), decisionId: K['151'] });
    // in step order (`keysOf` sorts, so it would not see the order): parents first, then the flow order 141, 143, 142, ...;
    // the loop body's own order (from the walk) puts 142 before 143, so dropping the sort turns this red
    expect(show(plan)).toEqual([
      'to-initial:141', 'to-backlog:143', 'to-backlog:142', 'to-backlog:144', 'to-backlog:147',
      'to-backlog:148', 'to-backlog:149', 'to-backlog:150', 'to-backlog:151',
    ]);
  });

  it('29.365 this Decision\'s own Not-taken tickets return to Backlog with the loop; another Decision\'s stay', () => {
    // q -> x -> d, and d -> x 'Again' closes the loop (a Start in front so the search enters at q); d -> y 'No' was Not taken by d in pass 1; z was Not taken by someone else
    const edges: FlowEdge[] = [edge(Q, X), edge(X, DEC), edge(DEC, X, 'Again'), edge(DEC, Y, 'No'), edge(W, Z)];
    const nodes = [
      fnode(Q), decision(DEC, decided('Again')), fnode(X, { ...FINISHED, closed: true }),
      fnode(Y, notTaken(DEC, 'Yes', 1)), fnode(W), fnode(Z, notTaken(uid(99), 'Yes', 1)),
    ];
    const plan = planSettle({ nodes, edges, decisionId: DEC });
    const names = (ids: Iterable<string>) => [...ids].map((id) => ({ [X]: 'x', [Y]: 'y', [Z]: 'z', [DEC]: 'd' })[id] ?? id);
    expect(show(plan, names)).toEqual(['reopen:x', 'to-initial:x', 'to-backlog:d', 'reopen:y', 'to-backlog:y']);
    expect(show(plan, names).some((s) => s.endsWith(':z'))).toBe(false);
  });
});

describe('29.366 revising, clearing and the second pass', () => {
  /** d: Yes -> x, No -> y. Pass 1 chose Yes: x ran, y is Not taken. */
  const edges = [edge(DEC, X, 'Yes'), edge(DEC, Y, 'No')];
  const pass1 = (outcome: string | null, x: Partial<FlowNode>, y: Partial<FlowNode> = notTaken(DEC)) => [decision(DEC, decided(outcome)), fnode(X, x), fnode(Y, y)];
  const names = (ids: Iterable<string>) => [...ids].map((id) => ({ [X]: 'x', [Y]: 'y', [DEC]: 'd' })[id] ?? id);

  it('29.366 revising Yes -> No reopens the Not-taken "No" side to Backlog and closes the old side if it has not run; the old side\'s work is kept', () => {
    const idle = planSettle({ nodes: pass1('No', {}), edges, decisionId: DEC });
    expect(show(idle, names)).toEqual(['reopen:y', 'to-backlog:y', 'not-taken-transition:x', 'not-taken-close:x']);
    // x has finished work on the old side: it keeps its periods and is not closed (PS-5.2); y still returns
    const worked = planSettle({ nodes: pass1('No', FINISHED), edges, decisionId: DEC });
    expect(show(worked, names)).toEqual(['reopen:y', 'to-backlog:y']);
    // x is started: asked about, untouched
    const running = planSettle({ nodes: pass1('No', WORKING), edges, decisionId: DEC });
    expect(show(running, names)).toEqual(['reopen:y', 'to-backlog:y']);
    expect(names(running.started)).toEqual(['x']);
  });

  it('29.366 clearing (or a loop reset) returns only this Decision\'s Not-taken tickets; a non-terminal Decision with an outcome waits', () => {
    const cleared = planSettle({ nodes: pass1(null, {}), edges, decisionId: DEC });
    expect(show(cleared, names)).toEqual(['reopen:y', 'to-backlog:y']);
    // CONTROL: a Not-taken ticket of another Decision is not this Decision's to return
    const other = planSettle({ nodes: pass1(null, {}, notTaken(uid(98))), edges, decisionId: DEC });
    expect(other.steps).toEqual([]);
    // an outcome on a Decision that has not finished: the cascade waits for the finish
    const waiting = planSettle({ nodes: [decision(DEC, { outcome: 'No', stateId: 'doing', category: 'active' }), fnode(X), fnode(Y, notTaken(DEC))], edges, decisionId: DEC });
    expect(waiting).toEqual({ steps: [], blocked: null, started: [], touchesOthers: false });
    // not a Decision, or not in the flow: nothing. y's Not-taken cause names x here, so the `isDecision` test is what
    // stops the plan (x has no outcome, and without the test its unsettled arm would return y)
    expect(planSettle({ nodes: pass1('No', {}, notTaken(X)), edges, decisionId: X }).steps).toEqual([]);
    expect(planSettle({ nodes: pass1('No', {}), edges, decisionId: uid(77) }).steps).toEqual([]);
  });

  it('29.366 a ticket to reopen under a finished parent that stays refuses the plan, on a clear and on a revise', () => {
    const under = (outcome: string | null, parent: Partial<FlowNode>) => [...pass1(outcome, {}, { ...notTaken(DEC), parentId: P }), fnode(P, parent)];
    const refused = { steps: [], blocked: { ticketId: Y, reason: 'parent-finished' }, started: [], touchesOthers: false };
    expect(planSettle({ nodes: under(null, FINISHED), edges, decisionId: DEC })).toEqual(refused);
    expect(planSettle({ nodes: under('No', FINISHED), edges, decisionId: DEC })).toEqual(refused);
    // CONTROL: the same reopens under an unfinished parent move
    expect(show(planSettle({ nodes: under(null, {}), edges, decisionId: DEC }), names)).toEqual(['reopen:y', 'to-backlog:y']);
    expect(show(planSettle({ nodes: under('No', {}), edges, decisionId: DEC }), names)).toEqual(['reopen:y', 'to-backlog:y', 'not-taken-transition:x', 'not-taken-close:x']);
  });

  it('29.366 a returning Not-taken ticket must be live and movable: one cut by a later Decision, or trashed, stays', () => {
    // d: Yes -> x, No -> e (Decision): P -> p, Q -> y; y was closed Not taken by d
    const E = uid(40);
    const flow = [edge(DEC, X, 'Yes'), edge(DEC, E, 'No'), edge(E, P, 'P'), edge(E, Y, 'Q')];
    const nodes = (eOutcome: string | null, y: Partial<FlowNode>) => [decision(DEC, decided(null)), fnode(X), decision(E, { outcome: eOutcome }), fnode(P), fnode(Y, y)];
    // cleared d: y is cut by e's P, so it is not live and stays; CONTROL: e undecided, y is live and returns
    expect(planSettle({ nodes: nodes('P', notTaken(DEC)), edges: flow, decisionId: DEC }).steps).toEqual([]);
    expect(show(planSettle({ nodes: nodes(null, notTaken(DEC)), edges: flow, decisionId: DEC }), letters)).toEqual(['reopen:y', 'to-backlog:y']);
    // a trashed Not-taken ticket never returns, on a clear or on a revise
    expect(planSettle({ nodes: nodes(null, { ...notTaken(DEC), trashed: true }), edges: flow, decisionId: DEC }).steps).toEqual([]);
    const revise = (y: Partial<FlowNode>) => planSettle({ nodes: [decision(DEC, decided('No')), fnode(X), fnode(Y, y)], edges: [edge(DEC, X, 'Yes'), edge(DEC, Y, 'No')], decisionId: DEC });
    expect(show(revise({ ...notTaken(DEC), trashed: true }), letters)).toEqual(['not-taken-transition:x', 'not-taken-close:x']);
    expect(show(revise(notTaken(DEC)), letters)).toEqual(['reopen:y', 'to-backlog:y', 'not-taken-transition:x', 'not-taken-close:x']); // CONTROL
  });

  it('29.366 an outcome whose label has no edge any more refuses the plan instead of closing every branch', () => {
    const plan = planSettle({ nodes: pass1('Maybe', {}), edges, decisionId: DEC });
    expect(plan).toEqual({ steps: [], blocked: { ticketId: DEC, reason: 'outcome-has-no-branch' }, started: [], touchesOthers: false });
  });

  it('29.366 a settle is idempotent: applying the plan to the nodes and planning again moves nothing', () => {
    const cases: Array<{ nodes: FlowNode[]; edges: FlowEdge[]; decisionId: string }> = [
      { nodes: m.nodes({ '144': decided('No'), '147': FINISHED }), edges: m.edges(), decisionId: K['144'] },
      { nodes: m.nodes({ '149': { ...FINISHED, closed: true }, '150': FINISHED, '151': decided('Need more info') }), edges: m.edges(), decisionId: K['151'] },
      { nodes: pass1('No', {}), edges, decisionId: DEC },
      { nodes: pass1(null, {}), edges, decisionId: DEC },
    ];
    for (const c of cases) {
      const plan = planSettle(c);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(planSettle({ ...c, nodes: apply(c.nodes, plan, c.decisionId) }).steps).toEqual([]);
    }
  });
});

/** The state a plan leaves behind, as the reducer folds it (a reopen clears the flag and the resolution; a Decision reset clears its outcome). */
function apply(nodes: FlowNode[], plan: SettlePlan, decisionId: string): FlowNode[] {
  const by = new Map<string, FlowNode>(nodes.map((n) => [n.id, { ...n }]));
  for (const s of plan.steps) {
    const n = by.get(s.ticketId);
    if (n === undefined) throw new Error(`step names an unknown ticket ${s.ticketId}`);
    if (s.kind === 'reopen') {
      n.closed = false;
      n.notTaken = null;
    } else if (s.kind === 'to-initial' || s.kind === 'to-backlog') {
      Object.assign(n, { stateId: s.toStateId, category: 'open', started: false });
      if (n.id === decisionId) n.outcome = null;
    } else if (s.kind === 'not-taken-transition') {
      Object.assign(n, { stateId: s.toStateId, category: 'terminal', started: false });
    } else {
      n.closed = true;
      n.notTaken = { kind: 'not-taken', decisionTicketId: decisionId, outcome: 'x', pass: 1 };
    }
  }
  return [...by.values()];
}

describe('29.367 a plan the engine would refuse is refused whole; the events carry the flow causes', () => {
  it('29.367 a ticket that would leave a finished state under a finished parent blocks the plan, unless the parent leaves first', () => {
    // q -> x -> d, d -> x 'Again' is the loop; x is a finished child of the finished parent p
    const edges = [edge(Q, X), edge(X, DEC), edge(DEC, X, 'Again')];
    const child = (parent: Partial<FlowNode>) => [fnode(Q), fnode(P, parent), fnode(X, { ...FINISHED, parentId: P }), decision(DEC, decided('Again'))];
    const blocked = planSettle({ nodes: child(FINISHED), edges, decisionId: DEC });
    expect(blocked).toEqual({ steps: [], blocked: { ticketId: X, reason: 'parent-finished' }, started: [], touchesOthers: false });
    // CONTROL: the same child under an unfinished parent moves
    expect(planSettle({ nodes: child({ stateId: 'doing', category: 'active' }), edges, decisionId: DEC }).blocked).toBeNull();
    // a Decision that is itself the finished child blocks for the same reason
    const dChild = [fnode(Q), fnode(P, FINISHED), fnode(X), decision(DEC, decided('Again', { parentId: P }))];
    expect(planSettle({ nodes: dChild, edges, decisionId: DEC }).blocked).toEqual({ ticketId: DEC, reason: 'parent-finished' });
    // a parent in the same plan that leaves first lets the child through
    const both = [fnode(Q), fnode(P, { ...FINISHED, closed: true }), fnode(X, { ...FINISHED, parentId: P }), decision(DEC, decided('Again'))];
    const bothEdges = [edge(Q, P), edge(P, X), edge(X, DEC), edge(DEC, P, 'Again')];
    const together = planSettle({ nodes: both, edges: bothEdges, decisionId: DEC });
    expect(together.blocked).toBeNull();
    expect(show(together, (ids) => [...ids].map((id) => ({ [P]: 'p', [X]: 'x', [DEC]: 'd' })[id] ?? id))).toEqual([
      'reopen:p', 'to-initial:p', 'to-backlog:d', 'to-backlog:x', // parents (depth 0) before children, then flow order
    ]);
  });

  it('29.367 only a ticket leaving a FINISHED state needs its parent to leave: an open one under a finished parent moves', () => {
    // s -> w -> x -> d; d: Again -> w (the loop), Done -> p. x is working, its parent q is finished and stays
    const S0 = uid(41);
    const edges = [edge(S0, W), edge(W, X), edge(X, DEC), edge(DEC, W, 'Again'), edge(DEC, P, 'Done')];
    const plan = planSettle({ nodes: [fnode(S0), fnode(W), fnode(X, { ...WORKING, parentId: Q }), decision(DEC, decided('Again')), fnode(P), fnode(Q, FINISHED)], edges, decisionId: DEC });
    expect(plan.blocked).toBeNull();
    expect(show(plan, letters)).toEqual(['to-backlog:d', 'to-backlog:x']);
  });

  it('29.367 a ticket to close Not taken whose workflow has no terminal state refuses the plan, naming the first such ticket in closing order', () => {
    const one = planSettle({ nodes: m.nodes({ '144': decided('Yes'), '145': { firstTerminalStateId: null } }), edges: m.edges(), decisionId: K['144'] });
    expect(one).toEqual({ steps: [], blocked: { ticketId: K['145'], reason: 'no-terminal-state' }, started: [], touchesOthers: false });
    // the last of four closing tickets: the block names it, not the first one that closes
    const later = planSettle({ nodes: m.nodes({ '144': decided('No'), '147': FINISHED, '149': WORKING, '152': { firstTerminalStateId: null } }), edges: m.edges(), decisionId: K['144'] });
    expect(later).toEqual({ steps: [], blocked: { ticketId: K['152'], reason: 'no-terminal-state' }, started: [], touchesOthers: false });
  });

  it('29.367 settleEvents files each step as the flow actor, with the right cause, and every event passes the door', () => {
    const nodes = m.nodes({ '149': { ...FINISHED, closed: true }, '150': FINISHED, '151': decided('Need more info') });
    const loop = planSettle({ nodes, edges: m.edges(), decisionId: K['151'] });
    let n = 0;
    const ctx = {
      workspaceId: '01J9GWS0000000000000000000',
      decisionId: K['151'],
      decisionEventId: uid(500),
      decidedBy: uid(501),
      outcome: 'Need more info',
      pass: 1,
      clientTime: '2026-10-03T09:00:00.000Z',
      mintId: () => uid(600 + n++),
    };
    const events = settleEvents(loop, ctx);
    expect(events.map((e) => [e.type, keysOf([e.entity.id])[0]])).toEqual([
      ['ticket.reopened', '149'], ['ticket.transitioned', '149'], ['ticket.transitioned', '150'], ['ticket.transitioned', '151'],
    ]);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    for (const e of events) {
      expect(e.actorId).toBe(SYSTEM_ACTOR_FLOW);
      expect(e.origin).toBe('server');
      expect(e).toMatchObject({ workspaceId: ctx.workspaceId, clientTime: ctx.clientTime, version: 1 });
      expect(parseEvent(e)).toMatchObject({ ok: true });
      expect((e.payload as { cause: unknown }).cause).toEqual({
        kind: 'reopened-by-flow', decisionTicketId: K['151'], outcome: 'Need more info', pass: 1, decidedBy: uid(501), decisionEventId: uid(500),
      });
    }
    expect((events[1]?.payload as { to: string }).to).toBe('todo');
    expect((events[3]?.payload as { to: string }).to).toBe('backlog');

    // the Not-taken pair: a transition to the first terminal state, then the close, both branch-not-taken
    const branch = settleEvents(planSettle({ nodes: m.nodes({ '144': decided('Yes') }), edges: m.edges(), decisionId: K['144'] }), { ...ctx, decisionId: K['144'], outcome: 'Yes' });
    expect(branch.map((e) => [e.type, keysOf([e.entity.id])[0]])).toEqual([['ticket.transitioned', '145'], ['ticket.closed', '145']]);
    expect((branch[0]?.payload as { to: string }).to).toBe('done');
    for (const e of branch) {
      expect(parseEvent(e)).toMatchObject({ ok: true });
      expect((e.payload as { cause: { kind: string } }).cause.kind).toBe('branch-not-taken');
    }
    // a blocked or empty plan files nothing
    expect(settleEvents({ steps: [], blocked: { ticketId: X, reason: 'child-open' }, started: [], touchesOthers: false }, ctx)).toEqual([]);
  });
});
