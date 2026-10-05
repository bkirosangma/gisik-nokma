import { describe, expect, it } from 'vitest';
import { planFlow, type FlowEdge, type FlowNode, type NodePlan } from '../../src/index.js';
import { decision, edge, fnode, mockup, uid } from './fixtures.js';

const [A, B, C, D, E, F] = [1, 2, 3, 4, 5, 6].map(uid) as [string, string, string, string, string, string];

function planOf(nodes: FlowNode[], edges: FlowEdge[] = []): Map<string, NodePlan> {
  return planFlow({ nodes, edges });
}
const get = (plan: Map<string, NodePlan>, id: string): NodePlan => {
  const found = plan.get(id);
  if (found === undefined) throw new Error(`no plan for ${id}`);
  return found;
};
const span = (plan: Map<string, NodePlan>, id: string, i = 0): string => {
  const x = get(plan, id).intervals[i];
  return x === undefined ? 'none' : `${x.start}..${x.end} ${x.basis}`;
};
/** An IST-day-boundary instant: 19:00Z on the 4th is 00:30 IST on the 5th. */
const period = (end: string | null, pass = 1) => ({ start: '2026-10-01T04:00:00.000Z', end, pass });

describe('29.190 every row of the planned-interval table', () => {
  it('29.190 explicit dates win, in the spec order; a missing piece names its reason', () => {
    const p = planOf([
      fnode(A, { explicitStart: '2026-10-01', explicitDue: '2026-10-04', estimate: 9 }), // start and due: the estimate is ignored
      fnode(B, { explicitStart: '2026-10-05', explicitDue: '2026-10-01' }), // start after due
      fnode(C, { explicitStart: '2026-10-01', estimate: 3 }),
      fnode(D, { explicitDue: '2026-10-10', estimate: 4 }),
      fnode(E, { explicitStart: '2026-10-07' }),
      fnode(F, { explicitDue: '2026-10-08' }),
      fnode(uid(7), { explicitStart: '2026-10-04', explicitDue: '2026-10-04' }), // start EQUAL to due is scheduled (kills `>=`)
    ]);
    expect(span(p, uid(7))).toBe('2026-10-04..2026-10-04 explicit');
    expect(span(p, A)).toBe('2026-10-01..2026-10-04 explicit');
    expect(get(p, B)).toEqual({ intervals: [], unscheduled: 'start-after-due', onTimeline: false });
    expect(span(p, C)).toBe('2026-10-01..2026-10-03 explicit');
    expect(span(p, D)).toBe('2026-10-07..2026-10-10 explicit');
    expect(span(p, E)).toBe('2026-10-07..2026-10-07 explicit');
    expect(span(p, F)).toBe('2026-10-08..2026-10-08 explicit');
    expect(get(p, A).unscheduled).toBeNull();
  });

  it('29.190 with neither date: estimate and a ready day chain; a ready day with no estimate is "no-estimate"; anything else is "no-dates"', () => {
    const edges = [edge(A, B), edge(A, C), edge(D, E)];
    const p = planOf(
      [
        fnode(A, { explicitDue: '2026-12-30' }),
        fnode(B, { estimate: 3 }), // chained across the year end: ready 2026-12-31, three days
        fnode(C), // ready day, no estimate
        fnode(D), // no dates and no predecessor
        fnode(E, { estimate: 2 }), // estimate, but its only predecessor has no end: no ready day
      ],
      edges,
    );
    expect(span(p, B)).toBe('2026-12-31..2027-01-02 chained');
    expect(get(p, C)).toEqual({ intervals: [], unscheduled: 'no-estimate', onTimeline: false });
    expect(get(p, D)).toEqual({ intervals: [], unscheduled: 'no-dates', onTimeline: false });
    expect(get(p, E).unscheduled).toBe('no-dates');
    // CONTROL: an estimate and no predecessor at all is also "no-dates"
    expect(get(planOf([fnode(A, { estimate: 3 })]), A).unscheduled).toBe('no-dates');
  });
});

describe('29.191 explicit dates and the warning glyph', () => {
  it('29.191 an explicit start earlier than the ready day carries startsBeforePredecessor and still wins; a later one does not', () => {
    const edges = [edge(A, B), edge(A, C)];
    const nodes = [
      fnode(A, { explicitStart: '2026-10-05', estimate: 3 }), // ends 2026-10-07, so successors are ready 2026-10-08
      fnode(B, { explicitStart: '2026-10-06', estimate: 2 }),
      fnode(C, { explicitStart: '2026-10-09', estimate: 2 }),
    ];
    const p = planOf(nodes, edges);
    expect(get(p, B).intervals[0]).toEqual({ pass: 1, start: '2026-10-06', end: '2026-10-07', basis: 'explicit', startsBeforePredecessor: true });
    expect(get(p, C).intervals[0]).toEqual({ pass: 1, start: '2026-10-09', end: '2026-10-10', basis: 'explicit' });
    // a start-less explicit due never carries the glyph
    const due = planOf([nodes[0] as FlowNode, fnode(B, { explicitDue: '2026-10-06', estimate: 1 })], [edge(A, B)]);
    // exact, so a missing interval cannot pass a `not.toHaveProperty` on `undefined`, and the flag is keyed on the explicit
    // START (`from` is 10-06, before the ready day 10-08: a flag computed from `from` would appear here)
    expect(get(due, B).intervals[0]).toEqual({ pass: 1, start: '2026-10-06', end: '2026-10-06', basis: 'explicit' });
  });
});

describe('29.192 chaining from what happened', () => {
  it('29.192 a closed period ends the chain on its IST day; an open period or none falls back to the plan; today is never an input', () => {
    const edges = [edge(A, B)];
    const planned = { explicitStart: '2026-10-01', estimate: 9 }; // planned end 2026-10-09
    const succ = fnode(B, { estimate: 2 });
    // actual end 19:00Z on the 4th is 00:30 IST on the 5th: the successor is ready on the 6th
    const closed = planOf([fnode(A, { ...planned, periods: [period('2026-10-04T19:00:00.000Z')] }), succ], edges);
    expect(span(closed, B)).toBe('2026-10-06..2026-10-07 chained');
    // an open period (an overdue active predecessor) does not slide its successors: the planned end stands
    const open = planOf([fnode(A, { ...planned, started: true, periods: [period(null)] }), succ], edges);
    expect(span(open, B)).toBe('2026-10-10..2026-10-11 chained');
    // CONTROL: no period at all gives the same
    expect(span(planOf([fnode(A, planned), succ], edges), B)).toBe('2026-10-10..2026-10-11 chained');
    // a person-reopened ticket has two periods of the same pass; the LAST decides
    const reopened = planOf([fnode(A, { ...planned, started: true, periods: [period('2026-10-04T06:00:00.000Z'), period(null)] }), succ], edges);
    expect(span(reopened, B)).toBe('2026-10-10..2026-10-11 chained');
    // an actual end with no plan at all still chains
    const unplanned = planOf([fnode(A, { periods: [period('2026-10-04T06:00:00.000Z')] }), succ], edges);
    expect(span(unplanned, B)).toBe('2026-10-05..2026-10-06 chained');
    expect(planFlow.length).toBe(1); // the function takes one argument: there is no `today` to pass
  });
});

describe('29.193 any versus wait-for-all', () => {
  it('29.193 any = the earliest predecessor end + 1; waitForAll = the latest + 1, and an unknown end leaves it unscheduled', () => {
    const nodes = (waitForAll: boolean, withY: boolean): FlowNode[] => [
      fnode(A, { explicitDue: '2026-10-05' }),
      withY ? fnode(B, { explicitDue: '2026-10-09' }) : fnode(B), // B has no plan when withY is false
      fnode(C, { estimate: 2, waitForAll }),
    ];
    const edges = [edge(A, C), edge(B, C)];
    expect(span(planOf(nodes(false, true), edges), C)).toBe('2026-10-06..2026-10-07 chained');
    expect(span(planOf(nodes(true, true), edges), C)).toBe('2026-10-10..2026-10-11 chained');
    // any ignores the predecessor with no end; waitForAll cannot know when it is ready
    expect(span(planOf(nodes(false, false), edges), C)).toBe('2026-10-06..2026-10-07 chained');
    expect(get(planOf(nodes(true, false), edges), C)).toEqual({ intervals: [], unscheduled: 'no-dates', onTimeline: false });
  });
});

describe('29.194 loop edges are not chained', () => {
  it('29.194 the mockup loop 146 -> 143 gives GN-143 no ready day from GN-146; GN-143 chains from GN-141 only', () => {
    const m = mockup();
    const nodes = m.nodes({
      '140': { explicitDue: '2026-10-01' },
      '141': { estimate: 2 },
      '143': { estimate: 1, waitForAll: true }, // waitForAll would wait for the late GN-146 if the loop edge counted
      '146': { explicitDue: '2026-10-20' },
    });
    const p = planFlow({ nodes, edges: m.edges() });
    expect(span(p, m.ids['141'])).toBe('2026-10-02..2026-10-03 chained');
    expect(span(p, m.ids['143'])).toBe('2026-10-04..2026-10-04 chained'); // not 2026-10-21
    // CONTROL: a forward edge from the same late ticket does feed its successor
    const forward = planFlow({ nodes: [fnode(A, { explicitDue: '2026-10-20' }), fnode(B, { estimate: 1 })], edges: [edge(A, B)] });
    expect(span(forward, B)).toBe('2026-10-21..2026-10-21 chained');
  });
});

/** d (Decision) -> x 'Yes', -> y 'No'; x -> t, y -> t. */
const diamondEdges = [edge(D, A, 'Yes'), edge(D, B, 'No'), edge(A, C), edge(B, C)];
const diamond = (over: { d?: Partial<FlowNode>; a?: Partial<FlowNode>; b?: Partial<FlowNode>; c?: Partial<FlowNode> } = {}): FlowNode[] => [
  decision(D, { explicitDue: '2026-10-06', ...over.d }),
  fnode(A, { estimate: 1, ...over.a }),
  fnode(B, { estimate: 3, ...over.b }),
  fnode(C, { estimate: 2, ...over.c }),
];

describe('29.195 decisions: pruned ghosts and revisions', () => {
  it('29.195 before a choice both branches are planned; after one the other branch is a pruned ghost that no live ticket chains from', () => {
    const undecided = planOf(diamond(), diamondEdges);
    expect(span(undecided, A)).toBe('2026-10-07..2026-10-07 chained');
    expect(span(undecided, B)).toBe('2026-10-07..2026-10-09 chained');
    expect(span(undecided, C)).toBe('2026-10-08..2026-10-09 chained'); // any: min(end A, end B) = 10-07, +1
    expect(get(undecided, A).intervals[0]).not.toHaveProperty('pruned');

    const decided = planOf(diamond({ d: { outcome: 'No', category: 'terminal', stateId: 'done' } }), diamondEdges);
    expect(get(decided, A).intervals[0]).toMatchObject({ start: '2026-10-07', end: '2026-10-07', pruned: true });
    expect(get(decided, A).onTimeline).toBe(false);
    expect(span(decided, B)).toBe('2026-10-07..2026-10-09 chained'); // the interval exists, so the next leg is not about `undefined`
    expect(get(decided, B).intervals[0]).not.toHaveProperty('pruned');
    // the tail is live through B alone: ready 10-10, not 10-08 from the pruned ghost
    expect(span(decided, C)).toBe('2026-10-10..2026-10-11 chained');
  });

  it('29.195 a revised Decision ends at the later of its period end and its latest revision, so the new branch chains from the revision', () => {
    const base = {
      outcome: 'No',
      category: 'terminal' as const,
      periods: [period('2026-10-06T08:00:00.000Z')],
      passes: [{ pass: 1, outcome: 'No', by: 'u', at: '2026-10-06T08:00:00.000Z', revisions: [] as Array<{ from: string | null; to: string | null; by: string; at: string }> }],
    };
    const plain = planOf(diamond({ d: base }), diamondEdges);
    expect(span(plain, B)).toBe('2026-10-07..2026-10-09 chained');
    const revised = planOf(
      diamond({ d: { ...base, passes: [{ ...base.passes[0]!, revisions: [{ from: 'Yes', to: 'No', by: 'u', at: '2026-10-09T08:00:00.000Z' }] }] } }),
      diamondEdges,
    );
    expect(span(revised, B)).toBe('2026-10-10..2026-10-12 chained');
    // a revision before the period end changes nothing (max, not last)
    const early = planOf(
      diamond({ d: { ...base, passes: [{ ...base.passes[0]!, revisions: [{ from: 'Yes', to: 'No', by: 'u', at: '2026-10-05T08:00:00.000Z' }] }] } }),
      diamondEdges,
    );
    expect(span(early, B)).toBe('2026-10-07..2026-10-09 chained');
  });

  it('29.195 waitForAll on the shared tail waits for the branch taken only, and a Not-taken source is not a predecessor', () => {
    const tail = planOf(diamond({ d: { outcome: 'Yes', category: 'terminal' }, c: { waitForAll: true } }), diamondEdges);
    expect(span(tail, C)).toBe('2026-10-08..2026-10-09 chained'); // waits for A (10-07), not for the pruned B (10-09)
    const notTaken = { kind: 'not-taken' as const, decisionTicketId: D, outcome: 'Yes', pass: 1 };
    // The Decision's outcome is cleared again (a loop reset), so B is LIVE in the effective graph; only its old Not-taken
    // resolution keeps it out. (With the outcome 'Yes' B is already excluded as pruned, and the notTaken test is never reached.)
    const stale = planOf(diamond({ b: { notTaken, category: 'terminal' }, c: { waitForAll: true } }), diamondEdges);
    expect(span(stale, C)).toBe('2026-10-08..2026-10-09 chained');
    // CONTROL: the same undecided diamond without the resolution waits for B (10-09)
    expect(span(planOf(diamond({ c: { waitForAll: true } }), diamondEdges), C)).toBe('2026-10-10..2026-10-11 chained');
  });
});

/**
 * a -> b -> d (Decision); d -> a 'Again' (the loop), d -> e 'Done'.
 * Pass 1 ran: a ended 10-07, b ended 10-10, d ended 10-12 (so d's planned pass 1 is 10-11, the day after b).
 */
function loopWorld(over: { passes?: number } = {}) {
  const closedPass1 = (end: string) => [period(end, 1)];
  const reset = (over.passes ?? 2) >= 2;
  const nodes = [
    fnode(A, { explicitStart: '2026-10-05', estimate: 3, reworkEstimate: 2, rounds: reset ? 2 : 1, periods: closedPass1('2026-10-07T06:00:00.000Z') }),
    fnode(B, { estimate: 2, rounds: reset ? 2 : 1, periods: closedPass1('2026-10-10T06:00:00.000Z') }),
    decision(D, {
      estimate: 1,
      rounds: reset ? 2 : 1,
      periods: closedPass1('2026-10-12T06:00:00.000Z'),
      outcome: reset ? null : 'Again',
      passes: [{ pass: 1, outcome: 'Again', by: 'u', at: '2026-10-12T06:00:00.000Z', revisions: [] }],
    }),
    fnode(E, { estimate: 2 }),
  ];
  const edges = [edge(A, B), edge(B, D), edge(D, A, 'Again'), edge(D, E, 'Done')];
  return { nodes, edges };
}

describe('29.196 passes: a loop re-runs its body', () => {
  it('29.196 pass 2 chains from the Decision pass-1 finish with the rework estimate; pass 1 is kept; explicit dates are pass 1 only', () => {
    const { nodes, edges } = loopWorld();
    const p = planOf(nodes, edges);
    expect(p.get(A)?.intervals.map((i) => `${i.pass}:${i.start}..${i.end}:${i.basis}`)).toEqual([
      '1:2026-10-05..2026-10-07:explicit',
      '2:2026-10-13..2026-10-14:chained', // D ended 10-12: the target starts the day after, two days (rework estimate)
    ]);
    expect(p.get(B)?.intervals.map((i) => `${i.pass}:${i.start}..${i.end}`)).toEqual([
      '1:2026-10-08..2026-10-09', // chained from A's pass-1 end, 10-07 (actual and plan agree for A; D's pass 1 below is where B's actual 10-10 beats its plan 10-09)
      '2:2026-10-15..2026-10-16', // A pass 2 ends 10-14; no rework estimate, so the estimate (2)
    ]);
    expect(p.get(D)?.intervals.map((i) => `${i.pass}:${i.start}..${i.end}`)).toEqual(['1:2026-10-11..2026-10-11', '2:2026-10-17..2026-10-17']);
    // a node that does not run again has pass 1 only
    expect(get(p, E).intervals.map((i) => i.pass)).toEqual([1]);
    expect(get(p, A).unscheduled).toBeNull();
  });

  it('29.196 what leaves the loop chains from the loop\'s LAST run, not from the pass-1 finish', () => {
    const { nodes, edges } = loopWorld();
    const p = planOf(nodes, edges);
    expect(span(p, E)).toBe('2026-10-18..2026-10-19 chained'); // D pass 2 ends 10-17
    // CONTROL: before any loop outcome there is one pass and E follows the actual pass-1 finish
    const once = loopWorld({ passes: 1 });
    const q = planOf(
      once.nodes.map((n) => (n.id === D ? { ...n, passes: [], outcome: null } : n)),
      once.edges,
    );
    expect(span(q, E)).toBe('2026-10-13..2026-10-14 chained');
  });

  it('29.196 a pass with no estimate is unscheduled "no-estimate" while pass 1 keeps its interval; a loop outcome not yet reset still plans the target\'s next pass', () => {
    const { nodes, edges } = loopWorld();
    const noRework = nodes.map((n) => (n.id === A ? { ...n, estimate: null, reworkEstimate: null, explicitDue: '2026-10-07' } : n));
    const p = planOf(noRework, edges);
    expect(get(p, A).intervals.map((i) => i.pass)).toEqual([1]);
    expect(get(p, A).unscheduled).toBe('no-estimate');
    // the Decision recorded the loop outcome but nothing was reset yet (rounds still 1): the target still gets a pass 2
    const pending = loopWorld({ passes: 1 });
    const q = planOf(pending.nodes, pending.edges);
    expect(get(q, A).intervals.map((i) => i.pass)).toEqual([1, 2]);
    expect(get(q, B).intervals.map((i) => i.pass)).toEqual([1]);
  });
});

describe('29.197 who is on the timeline', () => {
  it('29.197 a planned interval or an actual start puts a ticket on the timeline; neither (or only a pruned ghost) does not', () => {
    const p = planOf([
      fnode(A, { explicitDue: '2026-10-05' }),
      fnode(B), // undated, never worked
      fnode(C, { periods: [period(null)], started: true }), // undated but worked: drawn
      fnode(D, { estimate: 2 }), // estimate with no ready day
    ]);
    expect([A, B, C, D].map((id) => get(p, id).onTimeline)).toEqual([true, false, true, false]);
    expect(get(p, C).unscheduled).toBe('no-dates'); // on the timeline AND unscheduled: the bar is actual-only
  });
});

describe('29.198 the planner is pure', () => {
  it('29.198 it does not mutate its input and ignores input order', () => {
    // Two worlds: the loop, and the undecided diamond, whose tail C has two predecessors with DIFFERENT ends (10-07, 10-09).
    // In the loop alone no node has two predecessors, so an order-dependent pick (the first known end instead of the
    // earliest) would answer the same for both orders; reversing the diamond's edges reverses C's incoming list.
    for (const { nodes, edges } of [loopWorld(), { nodes: diamond(), edges: diamondEdges }]) {
      const frozenNodes = Object.freeze(nodes.map((n) => Object.freeze({ ...n, periods: Object.freeze([...n.periods]) as FlowNode['periods'] })));
      const frozenEdges = Object.freeze(edges.map((e) => Object.freeze(e)));
      const a = planFlow({ nodes: frozenNodes, edges: frozenEdges });
      const b = planFlow({ nodes: [...frozenNodes].reverse(), edges: [...frozenEdges].reverse() });
      expect(a.size).toBe(nodes.length); // two empty maps would agree on every `get`
      for (const n of nodes) expect(b.get(n.id)).toEqual(a.get(n.id));
    }
  });
});

describe('29.199 a half-applied cascade still plans', () => {
  it('29.199 a Decision that recorded a loop outcome before its body was reset (so passes depend on each other) terminates; pass 1 is unchanged', () => {
    // d has not finished and still counts one round, while b and a were already reset to round 2.
    const nodes = [
      fnode(A, { explicitStart: '2026-10-05', estimate: 3, rounds: 2 }),
      fnode(B, { estimate: 2, rounds: 2 }),
      decision(D, { estimate: 1, rounds: 1, passes: [{ pass: 1, outcome: 'Again', by: 'u', at: '2026-10-12T06:00:00.000Z', revisions: [] }] }),
    ];
    const edges = [edge(A, B), edge(B, D), edge(D, A, 'Again')];
    const p = planOf(nodes, edges);
    expect(span(p, A, 0)).toBe('2026-10-05..2026-10-07 explicit');
    expect(span(p, B, 0)).toBe('2026-10-08..2026-10-09 chained');
    // CONTROL (the case line's): pass 1 of A and B equals their plan without the half-applied pass
    const clean = planOf(nodes.map((n) => ({ ...n, rounds: 1, passes: [] })), edges);
    for (const id of [A, B]) expect(get(p, id).intervals[0]).toEqual(get(clean, id).intervals[0]);
    // the cycle through passes is cut where it closes: A's and B's pass 2 are unscheduled, nothing is invented, none throws
    for (const id of [A, B]) expect([get(p, id).intervals.map((i) => i.pass), get(p, id).unscheduled]).toEqual([[1], 'no-dates']);
    const all = [A, B, D].flatMap((id) => get(p, id).intervals);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((i) => i.start <= i.end)).toBe(true);
  });
});
