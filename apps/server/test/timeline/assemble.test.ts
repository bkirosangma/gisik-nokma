import { describe, expect, it } from 'vitest';
import { DECISION_TYPE_ID, type FlowNode, type NotTakenResolution } from '@gisik-nokma/domain';
import { assembleScope, componentsOf, mergeCores, type LoadedEdge, type LoadedTicket } from '../../src/timeline/assemble.js';

const id = (n: number): string => `01HZ${String(n).padStart(22, '0')}`;
/** Part 2's `FlowNode` (Part 2 plan :4036), the same literal as Part 3 T3's `node` fixture; `load.ts` makes the real ones with `flowNodeOf`. */
const fnode = (nid: string, over: Partial<FlowNode> = {}): FlowNode => ({
  id: nid, typeId: 'task', stateId: 'todo', category: 'open', closed: false, trashed: false, draft: false, parentId: null, isDecision: false, outcome: null, passes: [],
  notTaken: null, waitForAll: false, started: false, rounds: 1, periods: [], explicitStart: null, explicitDue: null, estimate: null, reworkEstimate: null,
  initialStateId: 'todo', firstTerminalStateId: 'done', ...over,
});
type Over = Partial<FlowNode> & Partial<Pick<LoadedTicket, 'workspaceId' | 'projectId' | 'stateName' | 'assigneeId' | 'title' | 'inScope'>>;
function t(n: number, over: Over = {}): LoadedTicket {
  const { workspaceId = 'W', projectId = 'P1', stateName = 'To do', assigneeId = null, title = `T${n}`, inScope = true, ...node } = over;
  return { id: id(n), workspaceId, projectId, stateName, assigneeId, title, inScope, closedDay: node.notTaken ? '2026-10-02' : null, node: fnode(id(n), { isDecision: node.typeId === DECISION_TYPE_ID, ...node }) };
}
const lead = (a: number, b: number, label: string | null = null): LoadedEdge =>
  ({ workspaceId: 'W', from: id(a), to: id(b), kind: 'leads_to', label });
const none = new Map<string, string | null>();
const pins = new Map();
const TODAY = '2026-10-03';
/** Every id in the answer, Maps included. */
const text = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (x instanceof Map ? [...x] : x));

describe('29.295 assembleScope', () => {
  it('29.295 chains a successor the day after; singleton has no flow; Me-hidden member rides flows[]; a never-started Not taken is a stub entry, never a tray row', () => {
    const tickets = [
      t(1, { explicitStart: '2026-10-05', estimate: 3 }),                                   // [10-05, 10-07]
      t(2, { estimate: 2, inScope: false }),                                                // chained [10-08, 10-09], hidden by Me
      t(3, { estimate: 2 }),                                                                // chained after 2: [10-10, 10-11]
      t(4, { explicitStart: '2026-10-20', estimate: 1 }),                                   // singleton
      t(5, { notTaken: { kind: 'not-taken', decisionTicketId: id(9), outcome: 'No', pass: 1 }, category: 'terminal' }),
      // Not taken with NO known close day: no segment at all (no stub), and still never a tray row
      { ...t(6, { notTaken: { kind: 'not-taken', decisionTicketId: id(9), outcome: 'No', pass: 1 }, category: 'terminal' }), closedDay: null },
      t(7),                                                                                 // undated singleton: the tray is not empty (control for the two tray legs)
    ];
    const core = assembleScope({ tickets, edges: [lead(1, 2), lead(2, 3)], keys: none, pins, today: TODAY });
    const seg = (n: number) => core.entries.find((e) => e.id === id(n))?.segments;
    expect(seg(1)).toEqual([{ start: '2026-10-05', end: '2026-10-07', pass: 1, type: 'planned' }]);
    expect(seg(3)).toEqual([{ start: '2026-10-10', end: '2026-10-11', pass: 1, type: 'planned' }]);
    expect(core.entries.find((e) => e.id === id(2))).toBeUndefined();                       // not in scope: not an item
    expect(core.flows).toHaveLength(1);
    expect(core.flows[0]?.nodes.map((n) => n.id)).toContain(id(2));                         // but its plan inputs ride along
    expect(core.entries.find((e) => e.id === id(4))?.flowId).toBeNull();
    expect(core.entries.find((e) => e.id === id(1))?.flowId).toBe(id(1));                   // named by the smallest member
    expect(core.details.get(id(3))).toMatchObject({ basis: 'chained', startsBeforePredecessor: false, passes: null });
    expect(core.details.get(id(7))).toMatchObject({ basis: null });                          // nothing planned: no basis
    expect(core.entries.find((e) => e.id === id(5))?.segments).toEqual([{ start: '2026-10-02', end: '2026-10-02', pass: 1, type: 'stub' }]); // D-W4-11
    expect(core.tray.find((r) => r.id === id(5))).toBeUndefined();                          // Not taken is never in the tray
    expect(core.tray.map((r) => r.id)).toEqual([id(7)]);                                    // ... not even with no segment (id 6); control: the undated ticket is
    expect(core.entries.some((e) => e.id === id(6))).toBe(false);
  });

  it('29.295 tray reasons and reachedBy; control: an estimate puts the same ticket on the timeline', () => {
    const dec = t(10, { typeId: DECISION_TYPE_ID, explicitStart: '2026-10-05', estimate: 1, title: 'Client decides' });
    const tickets = [dec, t(11, { estimate: 2 }), t(12), t(13, { explicitStart: '2026-10-09' })];
    const edges = [lead(10, 11, 'Needs rework'), lead(10, 12, 'Yes')];
    const core = assembleScope({ tickets, edges, keys: new Map([[id(10), 'GN-151']]), pins, today: TODAY });
    const row = (n: number) => core.tray.find((r) => r.id === id(n));
    expect(row(12)?.reason).toBe('no-estimate');                                            // ready day, no estimate
    expect(row(12)?.reachedBy).toEqual({ decisionTicketId: id(10), decisionKey: 'GN-151', decisionTitle: 'Client decides', outcome: 'Yes' });
    expect(row(11)).toBeUndefined();                                                        // control: estimate → on the timeline
    expect(core.entries.some((e) => e.id === id(11))).toBe(true);
    const lone = assembleScope({ tickets: [t(20)], edges: [], keys: none, pins, today: TODAY });
    expect(lone.tray[0]?.reason).toBe('no-dates');
    // an UNLABELLED edge from a Decision names no outcome: no reachedBy (the door refuses one, LK-2; the assembler must not invent it)
    const bare = assembleScope({ tickets: [t(40, { typeId: DECISION_TYPE_ID, explicitStart: '2026-10-05', estimate: 1 }), t(41)], edges: [lead(40, 41)], keys: none, pins, today: TODAY });
    expect(bare.tray.find((r) => r.id === id(41))).toMatchObject({ reachedBy: null });
    // a LABELLED edge from a task (not a Decision) names no outcome either; control: the same edge from a Decision does
    const fromTask = assembleScope({ tickets: [t(42, { explicitStart: '2026-10-05', estimate: 1 }), t(43)], edges: [lead(42, 43, 'Yes')], keys: none, pins, today: TODAY });
    expect(fromTask.tray.find((r) => r.id === id(43))).toMatchObject({ reachedBy: null });
    // two Decisions lead here: the lowest id names it, whatever order the edges arrive in
    const two = (edges: LoadedEdge[]) =>
      assembleScope({ tickets: [t(45, { typeId: DECISION_TYPE_ID, explicitStart: '2026-10-05', estimate: 1 }), t(44, { typeId: DECISION_TYPE_ID, explicitStart: '2026-10-05', estimate: 1 }), t(46)], edges, keys: none, pins, today: TODAY })
        .tray.find((r) => r.id === id(46))?.reachedBy?.decisionTicketId;
    expect(two([lead(45, 46, 'B'), lead(44, 46, 'A')])).toBe(id(44));
    expect(two([lead(44, 46, 'A'), lead(45, 46, 'B')])).toBe(id(44));
  });

  it('29.295 a started ticket with no dates is drawn (PL-4); a draft has no key', () => {
    // 20:00 UTC on 30 Sep is 01:30 IST on 1 Oct: a UTC slice of the instant would say 09-30
    const started = t(30, { category: 'active', periods: [{ start: '2026-09-30T20:00:00.000Z', end: null, pass: 1 }] });
    const draft = t(31, { draft: true, explicitStart: '2026-10-06', estimate: 1 });
    const core = assembleScope({ tickets: [started, draft], edges: [], keys: new Map([[id(31), null]]), pins, today: TODAY });
    expect(core.entries.find((e) => e.id === id(30))?.segments).toEqual([{ start: '2026-10-01', end: TODAY, pass: 1, type: 'actual' }]);
    expect(core.entries.find((e) => e.id === id(31))).toMatchObject({ draft: true, key: null });
    // a closed period's END is an instant too: 19:00 UTC on 2 Oct is 00:30 IST on 3 Oct
    const done = assembleScope({ tickets: [t(32, { category: 'terminal', periods: [{ start: '2026-09-29T04:00:00.000Z', end: '2026-10-02T19:00:00.000Z', pass: 1 }] })], edges: [], keys: none, pins, today: TODAY });
    expect(done.entries[0]?.segments).toEqual([{ start: '2026-09-29', end: '2026-10-03', pass: 1, type: 'actual' }]);
  });

  it('29.295 an entry carries its key, pin, kind, lane, category and workspace; the detail is the chunk row; control: a ticket with no pin row reads zero', () => {
    const pin = new Map([[id(61), { notes: 2, attachments: 1 }]]);
    const tickets = [
      t(60, { typeId: DECISION_TYPE_ID, explicitStart: '2026-10-05', estimate: 1, title: 'Pick', passes: [{ pass: 1, outcome: 'Yes', by: id(99), at: '2026-10-04T00:00:00.000Z', revisions: [] }] }),
      t(61, { estimate: 2, explicitDue: '2026-10-20', projectId: 'P2', workspaceId: 'W2', stateName: 'Doing', stateId: 'doing', category: 'active', assigneeId: id(98), waitForAll: true, rounds: 2 }),
      t(62, { explicitStart: '2026-10-22', estimate: 1 }),
    ];
    const core = assembleScope({ tickets, edges: [lead(60, 61, 'Yes'), lead(61, 62)], keys: new Map([[id(60), 'GN-1'], [id(61), 'GN-2']]), pins: pin, today: TODAY });
    expect(core.entries.find((e) => e.id === id(61))).toEqual({
      id: id(61), workspaceId: 'W2', key: 'GN-2', draft: false, kind: 'ticket', lane: 'P2',
      segments: [{ start: '2026-10-19', end: '2026-10-20', pass: 1, type: 'planned' }], // a due day plans backwards from it (PL-1)
      pin: { notes: 2, attachments: 1 }, resolution: null, category: 'active', flowId: id(60),
    });
    expect(core.entries.find((e) => e.id === id(60))).toMatchObject({ kind: 'decision', key: 'GN-1', pin: { notes: 0, attachments: 0 } });
    expect(core.details.get(id(61))).toEqual({
      id: id(61), title: 'T61', stateId: 'doing', stateName: 'Doing', assigneeId: id(98), dueDate: '2026-10-20', basis: 'explicit',
      startsBeforePredecessor: false, round: 2, waitForAll: true, estimate: 2, passes: null,
    });
    expect(core.details.get(id(60))).toMatchObject({ basis: 'explicit', passes: [{ pass: 1, outcome: 'Yes' }] }); // a Decision's own records
    // PL-3: an explicit start before the predecessor's end + 1 is kept and flagged; control: 62 starts after 61 and is not flagged
    const early = assembleScope({ tickets: [t(64, { explicitStart: '2026-10-05', estimate: 3 }), t(65, { explicitStart: '2026-10-06', estimate: 1 })], edges: [lead(64, 65)], keys: none, pins, today: TODAY });
    expect(early.details.get(id(65))).toMatchObject({ basis: 'explicit', startsBeforePredecessor: true });
    expect(core.details.get(id(62))).toMatchObject({ basis: 'explicit', startsBeforePredecessor: false });
  });

  it('29.295 a flow with no member in scope is not served; a blocks link joins no flow; entries and tray are in id order', () => {
    const out = assembleScope({ tickets: [t(70, { explicitStart: '2026-10-05', estimate: 1, inScope: false }), t(71, { estimate: 1, inScope: false })], edges: [lead(70, 71)], keys: none, pins, today: TODAY });
    expect(out.flows).toEqual([]);
    expect(out.entries).toEqual([]);
    const blocks: LoadedEdge = { workspaceId: 'W', from: id(72), to: id(73), kind: 'blocks', label: null };
    const b = assembleScope({ tickets: [t(72, { explicitStart: '2026-10-05', estimate: 1 }), t(73, { explicitStart: '2026-10-06', estimate: 1 })], edges: [blocks], keys: none, pins, today: TODAY });
    expect(b.flows).toEqual([]);
    expect(b.entries.map((e) => e.flowId)).toEqual([null, null]);
    expect([...componentsOf([id(72), id(73)], [blocks]).keys()]).toEqual([id(72), id(73)]);
    // a flow's blocks link between two members rides the flow (drawn fainter); control: its leads_to is there too
    const withBlocks = assembleScope({ tickets: [t(74, { explicitStart: '2026-10-05', estimate: 1 }), t(75, { estimate: 1 })], edges: [lead(74, 75), { ...blocks, from: id(74), to: id(75) }], keys: none, pins, today: TODAY });
    expect(withBlocks.flows[0]?.edges).toEqual([{ from: id(74), to: id(75), kind: 'leads_to', label: null }, { from: id(74), to: id(75), kind: 'blocks', label: null }]);
    const order = assembleScope({ tickets: [t(83), t(81), t(82, { explicitStart: '2026-10-06', estimate: 1 }), t(80, { explicitStart: '2026-10-05', estimate: 1 })], edges: [], keys: none, pins, today: TODAY });
    expect(order.tray.map((r) => r.id)).toEqual([id(81), id(83)]);
    expect(order.entries.map((e) => e.id)).toEqual([id(80), id(82)]);
  });

  it('29.295 each edge goes to the ONE component holding both its ends, in input order; one touching an unloaded id goes nowhere; control: the loaded pair is drawn', () => {
    // 86 and 87 are never loaded (hidden): one edge has an unloaded target, one an unloaded source, one has BOTH ends unloaded
    const tickets = [t(84, { explicitStart: '2026-10-05', estimate: 1 }), t(85, { estimate: 2 }), t(88, { explicitStart: '2026-10-20', estimate: 1 })];
    const edges = [lead(84, 86), lead(86, 85), lead(86, 87), { workspaceId: 'W', from: id(85), to: id(84), kind: 'blocks' as const, label: null }, lead(84, 85), lead(87, 88)];
    const out = assembleScope({ tickets, edges, keys: none, pins, today: TODAY });
    expect(out.flows).toHaveLength(1);
    expect(out.flows[0]?.edges).toEqual([{ from: id(85), to: id(84), kind: 'blocks', label: null }, { from: id(84), to: id(85), kind: 'leads_to', label: null }]); // input order
    expect(text(out)).not.toContain(id(86)); // a hole is never named
    expect(text(out)).not.toContain(id(87));
    expect(out.entries.find((e) => e.id === id(85))?.segments).toEqual([{ start: '2026-10-06', end: '2026-10-07', pass: 1, type: 'planned' }]); // chained by the loaded edge
    expect(out.entries.find((e) => e.id === id(88))?.flowId).toBeNull(); // the edge from an unloaded id makes no flow of 88
  });

  it('29.295 a Not-taken resolution names its Decision only when this viewer has it loaded (FL-1), in items and in flows; control: loaded (even out of scope), it is named', () => {
    const nt: NotTakenResolution = { kind: 'not-taken', decisionTicketId: id(50), outcome: 'No', pass: 1 };
    const target = t(51, { notTaken: nt, category: 'terminal', closed: true });
    const before = t(52, { explicitStart: '2026-10-05', estimate: 1 });
    const blind = assembleScope({ tickets: [before, target], edges: [lead(52, 51)], keys: none, pins, today: TODAY });
    expect(blind.entries.find((e) => e.id === id(51))?.resolution).toEqual({ ...nt, decisionTicketId: null });
    expect(blind.flows[0]?.nodes.find((n) => n.id === id(51))?.notTaken).toEqual({ ...nt, decisionTicketId: null });
    expect(text(blind)).not.toContain(id(50));
    const dec = t(50, { typeId: DECISION_TYPE_ID, explicitStart: '2026-10-04', estimate: 1, inScope: false, outcome: 'Yes' });
    const seeing = assembleScope({ tickets: [dec, before, target], edges: [lead(52, 51), lead(50, 52, 'Yes'), lead(50, 51, 'No')], keys: none, pins, today: TODAY });
    expect(seeing.entries.find((e) => e.id === id(51))?.resolution).toEqual(nt);
    expect(seeing.flows[0]?.nodes.find((n) => n.id === id(51))?.notTaken).toEqual(nt);
  });
});

describe('29.298 the caps', () => {
  it('29.298 over the index cap the longest-ago entries go; control: at the cap nothing is cut', () => {
    const tickets = [1, 2, 3, 4, 5].map((n) => t(n, { explicitStart: `2026-10-0${n}`, estimate: 1 }));
    const cores = [assembleScope({ tickets, edges: [], keys: none, pins, today: TODAY })];
    const cut = mergeCores(TODAY, cores, { index: 3, flow: 300 });
    expect(cut.entries.map((e) => e.id)).toEqual([id(3), id(4), id(5)]);
    expect(cut.truncated).toEqual({ dropped: 2, before: '2026-10-03' });
    expect(mergeCores(TODAY, cores, { index: 5, flow: 300 }).truncated).toBeNull();
    expect(mergeCores(TODAY, cores, { index: 5, flow: 300 }).entries).toHaveLength(5);
  });

  it('29.298 the cut runs over the MERGED cores; flows, tray and details of every core are kept', () => {
    const w1 = assembleScope({ tickets: [t(1, { explicitStart: '2026-10-01', estimate: 1 }), t(3, { explicitStart: '2026-10-03', estimate: 1 }), t(7)], edges: [], keys: none, pins, today: TODAY });
    const w2 = assembleScope({ tickets: [t(2, { explicitStart: '2026-10-02', estimate: 1, workspaceId: 'W2' }), t(4, { explicitStart: '2026-10-04', estimate: 1, workspaceId: 'W2' }), t(8, { workspaceId: 'W2' })], edges: [], keys: none, pins, today: TODAY });
    const m = mergeCores(TODAY, [w1, w2], { index: 2, flow: 300 });
    expect(m.entries.map((e) => e.id).sort()).toEqual([id(3), id(4)]);
    expect(m.truncated).toEqual({ dropped: 2, before: '2026-10-03' });
    expect(m.tray.map((r) => r.id)).toEqual([id(7), id(8)]);
    expect([...m.details.keys()].sort()).toEqual([id(1), id(2), id(3), id(4), id(7), id(8)].sort());
  });

  it('29.298 a flow over the flow cap is truncated with no nodes, still planned; control: at the cap it keeps its nodes', () => {
    const chain = (n: number) => Array.from({ length: n }, (_, i) => t(i + 1, i === 0 ? { explicitStart: '2026-10-05', estimate: 1 } : { estimate: 1 }));
    const edges = (n: number) => Array.from({ length: n - 1 }, (_, i) => lead(i + 1, i + 2));
    const big = assembleScope({ tickets: chain(5), edges: edges(5), keys: none, pins, today: TODAY }, { index: 100, flow: 4 });
    expect(big.flows[0]).toMatchObject({ truncated: true, nodes: [], edges: [] });
    expect(big.entries).toHaveLength(5);
    expect(big.entries[4]?.segments[0]).toMatchObject({ start: '2026-10-09', type: 'planned' }); // still chained
    const ok = assembleScope({ tickets: chain(4), edges: edges(4), keys: none, pins, today: TODAY }, { index: 100, flow: 4 });
    expect(ok.flows[0]?.truncated).toBe(false);
    expect(ok.flows[0]?.nodes).toHaveLength(4);
    expect(ok.flows[0]?.edges).toHaveLength(3);
  });
});
