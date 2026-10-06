// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildFlowRead, type FlowCardFacts, type FlowReadInput } from '../src/flow-read.js';
import type { FlowAnalysis, FlowEdge, FlowNode, FlowPlan } from '../src/flow/index.js';
import type { FlowRead } from '../src/read-models-flow.js';

const node = (id: string, over: Partial<FlowNode> = {}): FlowNode => ({
  id, typeId: 'task', stateId: 'todo', category: 'open', closed: false, trashed: false, draft: false, parentId: null, isDecision: false, outcome: null, passes: [],
  notTaken: null, waitForAll: false, started: false, rounds: 1, periods: [], explicitStart: null, explicitDue: null, estimate: null, reworkEstimate: null,
  initialStateId: 'todo', firstTerminalStateId: 'done', ...over,
});
const facts = (id: string, over: Partial<FlowCardFacts> = {}): FlowCardFacts => ({
  key: `GN-${id}`, title: `Title ${id}`, projectId: 'p1', stateName: 'To do', initialStateName: 'To do', assigneeId: null, assigneeName: null, notes: [], pinNotes: 0, pinAttachments: 0, ...over,
});
const edge = (s: string, t: string, label: string | null = null): FlowEdge => ({ sourceId: s, targetId: t, label });

/** A -> D; D -Yes-> B -> E; D -No-> C -> E; D -Need rework-> A (a back edge). D chose "Need rework" in pass 1 and "Yes" in pass 2. */
function diamond(over: Partial<FlowReadInput> = {}): FlowReadInput {
  const nodes = [
    node('A', { periods: [{ start: '2026-10-02T19:00:00Z', end: '2026-10-02T21:00:00Z', pass: 1 }, { start: '2026-10-03T04:00:00Z', end: null, pass: 2 }], rounds: 2, started: true }),
    node('D', {
      isDecision: true, category: 'terminal', closed: true, outcome: 'Yes',
      passes: [
        { pass: 1, outcome: 'Need rework', by: 'u1', at: '2026-10-02T21:00:00Z', revisions: [] },
        { pass: 2, outcome: 'Yes', by: 'u1', at: '2026-10-03T05:00:00Z', revisions: [{ from: 'No', to: 'Yes', by: 'u1', at: '2026-10-03T05:00:00Z' }] },
      ],
    }),
    node('B'),
    node('C', { category: 'terminal', closed: true, notTaken: { kind: 'not-taken', decisionTicketId: 'D', outcome: 'Yes', pass: 2 } }),
    node('E'),
  ];
  const edges = [edge('A', 'D'), edge('D', 'B', 'Yes'), edge('D', 'C', 'No'), edge('D', 'A', 'Need rework'), edge('B', 'E'), edge('C', 'E')];
  const analysis: FlowAnalysis = { starts: ['A'], ends: ['E'], backEdges: new Set(['D>A']), order: ['A', 'D', 'B', 'C', 'E'] };
  const plan: FlowPlan = new Map([
    ['A', { intervals: [{ pass: 1, start: '2026-10-02', end: '2026-10-03', basis: 'explicit' }], unscheduled: null, onTimeline: true }],
    ['C', { intervals: [{ pass: 2, start: '2026-10-04', end: '2026-10-05', basis: 'chained', pruned: true }], unscheduled: null, onTimeline: false }],
    ['E', { intervals: [], unscheduled: 'no-estimate', onTimeline: false }],
  ]);
  return {
    rootId: 'B', truncated: false, reached: 5, nodes, edges, blocks: [{ sourceId: 'B', targetId: 'C' }, { sourceId: 'B', targetId: 'GHOST' }, { sourceId: 'GHOST', targetId: 'B' }], analysis, plan,
    facts: new Map(nodes.map((n) => [n.id, facts(n.id)])), autoMoves: [], draftCount: 0, ...over,
  };
}

describe('buildFlowRead (Part 3 T3)', () => {
  it('29.240 alternates: a ticket on exactly one branch names the other branches\' first tickets; the Decision, the ticket before it and the shared tail get none', () => {
    const read = buildFlowRead(diamond());
    const of = (id: string) => read.nodes.find((n) => n.id === id)!.alternates;
    expect(of('B')).toEqual([{ viaDecisionId: 'D', outcome: 'No', firstTicketId: 'C' }]);
    expect(of('C')).toEqual([{ viaDecisionId: 'D', outcome: 'Yes', firstTicketId: 'B' }]);
    expect(of('E')).toEqual([]); // on both branches
    expect(of('D')).toEqual([]);
    expect(of('A')).toEqual([]); // the loop target is reached over a back edge only
    // control: a Decision with ONE forward label has no alternates to name
    const single = buildFlowRead(diamond({ edges: [edge('A', 'D'), edge('D', 'B', 'Yes'), edge('B', 'E'), edge('D', 'A', 'Need rework')] }));
    expect(single.nodes.find((n) => n.id === 'B')!.alternates).toEqual([]);
  });

  it('29.240 an unlabelled edge out of a Decision is not a branch: it is never named as an alternate, and beside ONE label it makes no pair', () => {
    const base = diamond();
    const nodes = [...base.nodes, node('F')];
    const withF = { ...base, nodes, facts: new Map(nodes.map((n) => [n.id, facts(n.id)])), analysis: { ...base.analysis, ends: ['E', 'F'], order: ['A', 'D', 'B', 'C', 'F', 'E'] } };
    const read = buildFlowRead({ ...withF, edges: [...base.edges, edge('D', 'F')] });
    const of = (r: typeof read, id: string) => r.nodes.find((n) => n.id === id)!.alternates;
    expect(of(read, 'B')).toEqual([{ viaDecisionId: 'D', outcome: 'No', firstTicketId: 'C' }]);
    expect(of(read, 'F')).toEqual([]);
    // one label and one unlabelled edge are not two branches
    const lone = buildFlowRead({ ...withF, edges: [edge('A', 'D'), edge('D', 'B', 'Yes'), edge('D', 'F'), edge('B', 'E')] });
    expect(of(lone, 'B')).toEqual([]);
  });

  it('29.240 alternates fold over every branch and every Decision: three labels name two others each; a ticket on one branch of two Decisions names both, in flow order', () => {
    // D has three forward labels: Yes -> B, No -> C, Later -> L; B, C and L each name the OTHER two, in edge order
    const t = diamond();
    const three = buildFlowRead({
      ...t, nodes: [...t.nodes, node('L')], edges: [...t.edges, edge('D', 'L', 'Later')], analysis: { ...t.analysis, order: [...t.analysis.order, 'L'], ends: ['E', 'L'] },
      facts: new Map<string, FlowCardFacts>([...t.facts, ['L', facts('L')]]),
    });
    const of3 = (id: string) => three.nodes.find((n) => n.id === id)!.alternates;
    expect(of3('B')).toEqual([{ viaDecisionId: 'D', outcome: 'No', firstTicketId: 'C' }, { viaDecisionId: 'D', outcome: 'Later', firstTicketId: 'L' }]);
    expect(of3('C')).toEqual([{ viaDecisionId: 'D', outcome: 'Yes', firstTicketId: 'B' }, { viaDecisionId: 'D', outcome: 'Later', firstTicketId: 'L' }]);
    expect(of3('L')).toEqual([{ viaDecisionId: 'D', outcome: 'Yes', firstTicketId: 'B' }, { viaDecisionId: 'D', outcome: 'No', firstTicketId: 'C' }]);
    // Two Decisions in a row: P (first in flow order, id 'P') -Go-> Q, -Stop-> S; Q (a Decision, id 'K' sorts before 'P')
    // -Ok-> X, -Fail-> F. X is on P's Go branch AND on K's Ok branch: it names S (via P) first, then F (via K),
    // although the input lists K before P: the Decisions are walked in FLOW order, not in input or id order.
    const nodes = [node('X'), node('F'), node('K', { isDecision: true }), node('S'), node('P', { isDecision: true })];
    const edges = [edge('P', 'K', 'Go'), edge('P', 'S', 'Stop'), edge('K', 'X', 'Ok'), edge('K', 'F', 'Fail')];
    const two = buildFlowRead({
      rootId: 'X', truncated: false, reached: 5, nodes, edges, blocks: [],
      analysis: { starts: ['P'], ends: ['F', 'S', 'X'], backEdges: new Set(), order: ['P', 'K', 'S', 'F', 'X'] },
      plan: new Map(), facts: new Map(nodes.map((n) => [n.id, facts(n.id)])), autoMoves: [], draftCount: 0,
    });
    expect(two.nodes.find((n) => n.id === 'X')!.alternates).toEqual([
      { viaDecisionId: 'P', outcome: 'Stop', firstTicketId: 'S' },
      { viaDecisionId: 'K', outcome: 'Fail', firstTicketId: 'F' },
    ]);
    // K itself is on P's Go branch only: it names Stop; F names Stop and Ok
    expect(two.nodes.find((n) => n.id === 'K')!.alternates).toEqual([{ viaDecisionId: 'P', outcome: 'Stop', firstTicketId: 'S' }]);
    expect(two.nodes.find((n) => n.id === 'F')!.alternates).toEqual([
      { viaDecisionId: 'P', outcome: 'Stop', firstTicketId: 'S' },
      { viaDecisionId: 'K', outcome: 'Ok', firstTicketId: 'X' },
    ]);
  });

  it('29.241 a loop edge counts the passes whose final outcome is its label; the chosen edge is full weight and the others are not; control: a pending Decision chooses none', () => {
    const read = buildFlowRead(diamond());
    const edgeOf = (id: string) => read.edges.find((e) => e.id === id)!;
    expect(edgeOf('D>A')).toMatchObject({ loop: true, taken: 1, takenPasses: [1], chosen: false });
    expect(edgeOf('D>B')).toMatchObject({ loop: false, taken: 1, takenPasses: [2], chosen: true });
    expect(edgeOf('D>C')).toMatchObject({ taken: 0, takenPasses: [], chosen: false });
    expect(edgeOf('A>D')).toMatchObject({ taken: 0, takenPasses: [], chosen: null });
    const pending = diamond();
    pending.nodes = pending.nodes.map((n) => (n.id === 'D' ? { ...n, outcome: null } : n));
    const after = buildFlowRead(pending);
    expect(after.edges.filter((e) => e.from === 'D').map((e) => e.chosen)).toEqual([null, null, null]);
    expect(after.edges.find((e) => e.id === 'D>A')!.taken).toBe(1); // history stays
    // a source that is not a settled Decision chooses nothing: an UNLABELLED edge out of the settled D (a relabelled link) ...
    const unlabelled = buildFlowRead(diamond({ edges: [...diamond().edges, edge('D', 'E')] }));
    expect(unlabelled.edges.find((e) => e.id === 'D>E')).toMatchObject({ taken: 0, takenPasses: [], chosen: null });
    // ... and a source that is no longer a Decision, even one still carrying an outcome and passes (its type changed)
    const retyped = diamond();
    retyped.nodes = retyped.nodes.map((n) => (n.id === 'D' ? { ...n, isDecision: false } : n));
    expect(buildFlowRead(retyped).edges.filter((e) => e.from === 'D').map((e) => [e.id, e.taken, e.chosen])).toEqual([['D>B', 0, null], ['D>C', 0, null], ['D>A', 0, null]]);
  });

  it('29.241 every pass is counted, labels compare after trim and case folding, and an edge whose source is not in the flow reads as no choice', () => {
    // three passes: rework, rework (written in another case), then Yes: the loop edge counts BOTH rework passes
    const t = diamond();
    t.nodes = t.nodes.map((n) =>
      n.id === 'D'
        ? {
            ...n, outcome: ' YES ',
            passes: [
              { pass: 1, outcome: 'Need rework', by: 'u1', at: '2026-10-02T21:00:00Z', revisions: [] },
              { pass: 2, outcome: 'need REWORK', by: 'u1', at: '2026-10-03T05:00:00Z', revisions: [] },
              { pass: 3, outcome: 'yes', by: 'u1', at: '2026-10-04T05:00:00Z', revisions: [] },
            ],
          }
        : n,
    );
    const read = buildFlowRead(t);
    const edgeOf = (id: string) => read.edges.find((e) => e.id === id)!;
    expect(edgeOf('D>A')).toMatchObject({ taken: 2, takenPasses: [1, 2], chosen: false });
    expect(edgeOf('D>B')).toMatchObject({ taken: 1, takenPasses: [3], chosen: true });
    // a labelled edge from a source the read does not hold (no node): no history, no choice, and no crash
    const stray = buildFlowRead(diamond({ edges: [...diamond().edges, edge('GHOST', 'B', 'Yes')] }));
    expect(stray.edges.find((e) => e.id === 'GHOST>B')).toEqual({ id: 'GHOST>B', kind: 'leads_to', from: 'GHOST', to: 'B', label: 'Yes', loop: false, taken: 0, takenPasses: [], chosen: null });
  });

  it('29.242 periods and the actual span are IST days, an open period has a null end, the boundary minute falls on the right side; control: no work, no actual', () => {
    const read = buildFlowRead(diamond());
    const a = read.nodes.find((n) => n.id === 'A')!;
    expect(a.periods).toEqual([{ start: '2026-10-03', end: '2026-10-03', pass: 1 }, { start: '2026-10-03', end: null, pass: 2 }]);
    expect(a.actual).toEqual({ start: '2026-10-03', end: null });
    const edgeCase = diamond();
    // the boundary pair on BOTH ends of a period: 18:29:59Z is the 2nd in IST, 18:30:00Z the 3rd (a UTC slice says the 2nd for both)
    edgeCase.nodes = edgeCase.nodes.map((n) => (n.id === 'B' ? { ...n, periods: [{ start: '2026-10-02T18:29:59Z', end: '2026-10-02T18:30:00Z', pass: 1 }, { start: '2026-10-02T18:30:00Z', end: null, pass: 2 }] } : n));
    const b = buildFlowRead(edgeCase).nodes.find((n) => n.id === 'B')!;
    expect(b.periods).toEqual([{ start: '2026-10-02', end: '2026-10-03', pass: 1 }, { start: '2026-10-03', end: null, pass: 2 }]);
    expect(b.actual).toEqual({ start: '2026-10-02', end: null }); // the FIRST period's start, the LAST period's end
    // a closed last period ends the actual span on ITS day, not the first period's
    const closed = diamond();
    closed.nodes = closed.nodes.map((n) => (n.id === 'B' ? { ...n, periods: [{ start: '2026-10-02T04:00:00Z', end: '2026-10-02T06:00:00Z', pass: 1 }, { start: '2026-10-05T04:00:00Z', end: '2026-10-06T19:00:00Z', pass: 2 }] } : n));
    expect(buildFlowRead(closed).nodes.find((n) => n.id === 'B')!.actual).toEqual({ start: '2026-10-02', end: '2026-10-07' });
    expect(read.nodes.find((n) => n.id === 'E')!.actual).toBeNull();
  });

  it('29.242 planned intervals keep their pass, basis and pruned flag, the tray carries the reason, and a Not-taken ticket keeps its resolution; control: a ticket the plan does not know has none of these', () => {
    const read = buildFlowRead(diamond());
    const c = read.nodes.find((n) => n.id === 'C')!;
    expect(c.planned).toEqual([{ pass: 2, start: '2026-10-04', end: '2026-10-05', basis: 'chained', pruned: true }]);
    // an interval the plan did not prune reads pruned: false (never absent), with its own pass and basis
    expect(read.nodes.find((n) => n.id === 'A')!.planned).toEqual([{ pass: 1, start: '2026-10-02', end: '2026-10-03', basis: 'explicit', pruned: false }]);
    expect(c.resolution).toEqual({ kind: 'not-taken', decisionTicketId: 'D', outcome: 'Yes', pass: 2 });
    expect(read.nodes.find((n) => n.id === 'E')!.tray).toBe('no-estimate');
    const b = read.nodes.find((n) => n.id === 'B')!;
    expect(b.planned).toEqual([]);
    expect(b.tray).toBeNull();
    expect(b.resolution).toBeNull();
    // every interval of a two-pass plan is carried, in the plan's order
    const twoPass = diamond();
    (twoPass.plan as FlowPlan).set('A', {
      intervals: [{ pass: 1, start: '2026-10-02', end: '2026-10-03', basis: 'explicit' }, { pass: 2, start: '2026-10-06', end: '2026-10-07', basis: 'chained', pruned: true }],
      unscheduled: 'start-after-due', onTimeline: true,
    });
    const a2 = buildFlowRead(twoPass).nodes.find((n) => n.id === 'A')!;
    expect(a2.planned).toEqual([
      { pass: 1, start: '2026-10-02', end: '2026-10-03', basis: 'explicit', pruned: false },
      { pass: 2, start: '2026-10-06', end: '2026-10-07', basis: 'chained', pruned: true },
    ]);
    expect(a2.tray).toBe('start-after-due');
  });

  it('29.242 a Not-taken ticket whose Decision the read does not hold keeps its resolution without naming that Decision or its outcome (a hole leaves no id, 29.449)', () => {
    const input = diamond();
    input.nodes = input.nodes.map((n) => (n.id === 'C' ? { ...n, notTaken: { kind: 'not-taken', decisionTicketId: 'HIDDEN', outcome: 'HIDDEN-branch', pass: 2 } } : n));
    const read = buildFlowRead(input);
    expect(read.nodes.find((n) => n.id === 'C')!.resolution).toEqual({ kind: 'not-taken', decisionTicketId: null, pass: 2 });
    expect(JSON.stringify(read)).not.toContain('HIDDEN');
  });

  it('29.240 the shape: flow order, starts and ends, blocks only between members, stable flowId, a draft has no key; control: a missing card fact is a loud error, not a blank', () => {
    const input = diamond();
    // reversed, so the flow order below is the builder's sort and not the input's order
    input.nodes = [...input.nodes].reverse().map((n) => (n.id === 'B' ? { ...n, draft: true } : n));
    expect(input.nodes.map((n) => n.id)).toEqual(['E', 'C', 'B', 'D', 'A']); // precondition: not already in flow order
    const read = buildFlowRead(input);
    expect(read.nodes.map((n) => n.id)).toEqual(['A', 'D', 'B', 'C', 'E']);
    expect([read.start, read.end, read.flowId, read.rootId]).toEqual([['A'], ['E'], 'A', 'B']);
    // flowId is the SMALLEST id, not the first in order, the start or the root: a tail ticket '0' sorts before 'A'
    const t = diamond();
    const tail = buildFlowRead({ ...t, nodes: [...t.nodes, node('0')], edges: [...t.edges, edge('E', '0')], analysis: { ...t.analysis, ends: ['0'], order: [...t.analysis.order, '0'] }, facts: new Map<string, FlowCardFacts>([...t.facts, ['0', facts('0')]]) });
    expect([tail.flowId, tail.start, tail.order[0]]).toEqual(['0', ['A'], 'A']);
    expect(read.nodes.find((n) => n.id === 'B')).toMatchObject({ key: null, draft: true, kind: 'ticket' });
    expect(read.nodes.find((n) => n.id === 'D')).toMatchObject({ kind: 'decision', round: 1, outcome: 'Yes' });
    expect(read.nodes.find((n) => n.id === 'A')).toMatchObject({ round: 2, key: 'GN-A' });
    expect(read.edges.filter((e) => e.kind === 'blocks').map((e) => e.id)).toEqual(['B~C']);
    expect(read.edges.filter((e) => e.kind === 'leads_to').map((e) => e.id)).toEqual(['A>D', 'D>B', 'D>C', 'D>A', 'B>E', 'C>E']);
    expect(() => buildFlowRead({ ...diamond(), facts: new Map() })).toThrow('buildFlowRead: no facts for ticket A: the read must load every node it passes in');
  });

  it('29.240 the whole wire: every member of a node and of an edge, leads_to before blocks, the walk\'s counts, an unordered node last, and an empty read keeps its root as its flowId', () => {
    const input = diamond({ truncated: true, reached: 9 });
    input.nodes = input.nodes.map((n) =>
      n.id === 'B' ? { ...n, typeId: 'bug', stateId: 'doing', category: 'active', parentId: 'EPIC', explicitDue: '2026-10-09', waitForAll: true, estimate: 3, reworkEstimate: 1 } : n,
    );
    (input.facts as Map<string, FlowCardFacts>).set('B', facts('B', { projectId: 'p2', stateName: 'Doing' }));
    const read = buildFlowRead(input);
    expect([read.truncated, read.reached, read.order]).toEqual([true, 9, ['A', 'D', 'B', 'C', 'E']]);
    expect(read.nodes.find((n) => n.id === 'B')).toEqual({
      id: 'B', key: 'GN-B', draft: false, title: 'Title B', kind: 'ticket', typeId: 'bug', parentId: 'EPIC', projectId: 'p2',
      state: { id: 'doing', name: 'Doing', category: 'active' }, initialStateName: 'To do', assigneeId: null, assigneeName: null,
      dueDate: '2026-10-09', waitForAll: true, estimate: 3, reworkEstimate: 1, round: 1, outcome: null, passes: [], resolution: null,
      alternates: [{ viaDecisionId: 'D', outcome: 'No', firstTicketId: 'C' }], periods: [], planned: [], actual: null, tray: null, notes: [], pin: { notes: 0, attachments: 0 },
    });
    expect(read.nodes.find((n) => n.id === 'D')!.passes).toEqual(input.nodes.find((n) => n.id === 'D')!.passes);
    expect(read.edges.map((e) => e.id)).toEqual(['A>D', 'D>B', 'D>C', 'D>A', 'B>E', 'C>E', 'B~C']);
    expect(read.edges.at(-1)).toEqual({ id: 'B~C', kind: 'blocks', from: 'B', to: 'C', label: null, loop: false, taken: 0, takenPasses: [], chosen: null });
    expect(read.edges.find((e) => e.id === 'B>E')).toEqual({ id: 'B>E', kind: 'leads_to', from: 'B', to: 'E', label: null, loop: false, taken: 0, takenPasses: [], chosen: null });
    // a node the analysis did not order (a hand-built analysis) goes after every ordered one
    const t = diamond();
    const loose = buildFlowRead({ ...t, nodes: [node('0'), ...t.nodes], facts: new Map<string, FlowCardFacts>([...t.facts, ['0', facts('0')]]) });
    expect(loose.nodes.map((n) => n.id)).toEqual(['A', 'D', 'B', 'C', 'E', '0']);
    // no node at all: the flow is named after the ticket it was asked about
    const empty = buildFlowRead({ ...t, nodes: [], edges: [], blocks: [], facts: new Map(), analysis: { starts: [], ends: [], backEdges: new Set(), order: [] } });
    expect([empty.flowId, empty.rootId, empty.nodes, empty.edges]).toEqual(['B', 'B', [], []]);
  });

  it('29.242 notes and the pin pass through unchanged; the auto moves and the draft count are the caller\'s', () => {
    const input = diamond();
    (input.facts as Map<string, FlowCardFacts>).set('B', facts('B', { notes: [{ id: 'n1', title: 'Brief' }], pinNotes: 1, pinAttachments: 2, assigneeId: 'u1', assigneeName: 'Ama', initialStateName: 'Ready' }));
    const move = { ticketId: 'B', at: '2026-10-03T05:00:00Z', kind: 'led-to' as const, becauseTicketId: 'A', pass: null, outcome: null };
    const read = buildFlowRead({ ...input, autoMoves: [move], draftCount: 3 });
    expect(read.nodes.find((n) => n.id === 'B')).toMatchObject({ notes: [{ id: 'n1', title: 'Brief' }], pin: { notes: 1, attachments: 2 }, assigneeId: 'u1', assigneeName: 'Ama', initialStateName: 'Ready' });
    expect(read.autoMoves).toEqual([move]);
    expect(read.draftCount).toBe(3);
  });
  it('29.449 a Not-taken ticket whose Decision the read does not hold (a hole) has a resolution with no outcome KEY, the kind and the pass kept; control: the Decision in the read keeps its id and outcome', () => {
    const resolutionOfC = (read: FlowRead) => read.nodes.find((n) => n.id === 'C')?.resolution;
    // D is a hole for this viewer: no node, its labelled edges passed in anyway (the strongest input; the walk drops them)
    const hole = buildFlowRead(diamond({ nodes: diamond().nodes.filter((n) => n.id !== 'D') }));
    expect(resolutionOfC(hole)).toEqual({ kind: 'not-taken', decisionTicketId: null, pass: 2 });
    expect(resolutionOfC(hole)).not.toHaveProperty('outcome');
    // a client's withheld cause folds to no id and no outcome: still no outcome key
    const served = diamond();
    served.nodes = served.nodes.map((n) => (n.id === 'C' ? { ...n, notTaken: { kind: 'not-taken', decisionTicketId: null, pass: 2 } } : n));
    expect(resolutionOfC(buildFlowRead(served))).toEqual({ kind: 'not-taken', decisionTicketId: null, pass: 2 });
    // control in the same it(): D in the read
    expect(resolutionOfC(buildFlowRead(diamond()))).toEqual({ kind: 'not-taken', decisionTicketId: 'D', outcome: 'Yes', pass: 2 });
  });

  it('29.450 an alternate never names a Decision the read does not hold: with D a hole (its labelled edges still passed in) no node gets an alternate; control: D in the read gives B the No branch and C the Yes branch, via D', () => {
    const alternatesOf = (read: FlowRead) => read.nodes.map((n) => [n.id, n.alternates]);
    const hole = buildFlowRead(diamond({ nodes: diamond().nodes.filter((n) => n.id !== 'D') }));
    expect(alternatesOf(hole)).toEqual([['A', []], ['B', []], ['C', []], ['E', []]]);
    // control in the same it(): the same edges with D a node of the read
    expect(alternatesOf(buildFlowRead(diamond()))).toEqual([
      ['A', []],
      ['D', []],
      ['B', [{ viaDecisionId: 'D', outcome: 'No', firstTicketId: 'C' }]],
      ['C', [{ viaDecisionId: 'D', outcome: 'Yes', firstTicketId: 'B' }]],
      ['E', []],
    ]);
  });
});
