import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/http-client.js';
import { flowTools } from '../src/tools/flow-tools.js';
import { readTools } from '../src/tools/read-tools.js';
import { WS, detail, fakeFlow, flowNode, flowWire, ulid } from './fixtures/flow-fixtures.js';

/** Graph Part 5 T2: `get_flow` and the flow facts on `get_ticket` (29.379–29.381). */
const D = ulid('DEC'); // the Decision
const T1 = ulid('TK1'); // the loop target, in its second round
const T2 = ulid('TK2'); // the branch not taken
const DR = ulid('DRF'); // the caller's own draft
const HIDDEN = ulid('HID'); // a ticket the caller cannot see
const FLOW = `/v1/workspaces/${WS}/tickets/${T1}/flow`;
const tool = (f: ReturnType<typeof fakeFlow>, name: string) => flowTools(f.session).find((t) => t.name === name)!;

const PASSES = [
  { pass: 1, outcome: 'Needs rework', by: 'u1', at: '2026-10-02T10:00:00.000Z', revisions: [{ from: 'Approved', to: 'Needs rework', by: 'u1', at: '2026-10-02T11:00:00.000Z' }] },
  { pass: 2, outcome: 'Approved', by: 'u1', at: '2026-10-03T10:00:00.000Z', revisions: [] },
];
const wire = () => flowWire(
  [
    flowNode(T1, { round: 2, periods: [{ start: '2026-10-01', end: '2026-10-02', pass: 1 }, { start: '2026-10-04', end: null, pass: 2 }], planned: [{ pass: 1, start: '2026-10-01', end: '2026-10-02', basis: 'explicit', pruned: false }] }),
    flowNode(D, { kind: 'decision', state: { id: 'done', name: 'Done', category: 'terminal' }, outcome: 'Approved', passes: PASSES }),
    flowNode(T2, { resolution: { kind: 'not-taken', decisionTicketId: D, outcome: 'Approved', pass: 2 }, alternates: [{ viaDecisionId: D, outcome: 'Needs rework', firstTicketId: T1 }] }),
    flowNode(DR, { draft: true, key: null, title: 'A draft step' }),
  ],
  {
    edges: [
      { kind: 'leads_to', from: T1, to: D, label: null, loop: false, taken: 0 },
      { kind: 'leads_to', from: D, to: T1, label: 'Needs rework', loop: true, taken: 1 },
      { kind: 'leads_to', from: D, to: T2, label: 'Approved', loop: false, taken: 1 },
    ],
    autoMoves: [{ ticketId: T2, at: '2026-10-03T10:00:00.000Z', kind: 'branch-not-taken', becauseTicketId: D, pass: 2 }],
  },
);

const GET_FLOW_DESCRIPTION =
  'Read the flow a ticket belongs to: the tickets connected to it by "leads to" arrows, in flow order, with the arrows. Per ticket: status, wait-for-all, estimate and rework estimate, round (how many times the flow reran it), ' +
  'a Decision\'s current outcome and every pass (with its revisions), a "Not taken" resolution, the alternate branches of a Decision it sits behind, its work periods (real time worked, one per pass), ' +
  'planned intervals (pruned ones are branches the Decision left), its actual start and end, the reason it is not on the timeline, and the notes attached to it. Arrows carry `loop` and, for a loop, `taken`: ' +
  'how many passes took it. `autoMoves` lists what the flow did by itself (moved to To do, reopened, closed Not taken). Only what you can see; your own drafts are included, other people\'s never are.';

describe('29.379 get_flow', () => {
  it('29.379 answers passes with revisions, periods, resolution, alternates, loop and taken; the own draft has no key', async () => {
    const f = fakeFlow({ [FLOW]: wire() });
    const out = (await tool(f, 'get_flow').handler({ workspaceId: WS, ticketId: T1 })) as ReturnType<typeof wire>;
    expect(f.gets).toEqual([FLOW]); // one read, the flow route of the ticket asked about
    expect(out.nodes.map((n) => n.id)).toEqual([T1, D, T2, DR]); // the route's order
    const decision = out.nodes.find((n) => n.id === D)!;
    expect(decision.passes.map((p) => [p.pass, p.outcome, p.revisions.length])).toEqual([[1, 'Needs rework', 1], [2, 'Approved', 0]]);
    expect(out.nodes.find((n) => n.id === T1)).toMatchObject({ round: 2, periods: [{ pass: 1 }, { pass: 2, end: null }] });
    expect(out.nodes.find((n) => n.id === T2)?.resolution).toEqual({ kind: 'not-taken', decisionTicketId: D, outcome: 'Approved', pass: 2 });
    expect(out.edges.find((e) => e.loop)).toMatchObject({ label: 'Needs rework', taken: 1 });
    expect(out.nodes.find((n) => n.id === DR)).toMatchObject({ draft: true, key: null });
    expect(out.draftCount).toBe(1);
    expect(out).toEqual(wire()); // a flow with nothing hidden is answered as served
    // ids are path-encoded
    const odd = fakeFlow({ '/v1/workspaces/w%20s/tickets/t%2F1/flow': wire() });
    await expect(tool(odd, 'get_flow').handler({ workspaceId: 'w s', ticketId: 't/1' })).resolves.toMatchObject({ flowId: 'f1' });
    expect(tool(f, 'get_flow').description).toBe(GET_FLOW_DESCRIPTION);
  });

  it('29.379 a flow missing a member the tool reads fails by naming it; control: the complete wire passes', async () => {
    const broken = wire() as unknown as { nodes: Array<Record<string, unknown>> };
    delete broken.nodes[1]!['passes'];
    const bad = fakeFlow({ [FLOW]: broken });
    await expect(tool(bad, 'get_flow').handler({ workspaceId: WS, ticketId: T1 })).rejects.toThrow(
      /^the flow answer is not the shape this tool reads \(nodes\.1\.passes: Required\)\. This is a server mismatch, not something a retry fixes\.$/,
    );
    await expect(tool(fakeFlow({ [FLOW]: wire() }), 'get_flow').handler({ workspaceId: WS, ticketId: T1 })).resolves.toMatchObject({ flowId: 'f1', draftCount: 1 }); // the parsed flow, not just "something"
    await expect(tool(fakeFlow({}), 'get_flow').handler({ workspaceId: WS, ticketId: T1 })).rejects.toThrow(/^ticket not found or not visible to you$/);
  });
});

describe('29.380 get_flow shows only what the caller can see', () => {
  it('29.380 an id outside the visible nodes is null, an edge or move naming it is dropped, and the hidden id is nowhere in the reply', async () => {
    const w = wire();
    w.nodes[2]!.resolution = { kind: 'not-taken', decisionTicketId: HIDDEN, outcome: 'Approved', pass: 2 };
    // a hidden alternate FIRST and a visible one after it: each is judged on its own
    w.nodes[2]!.alternates = [{ viaDecisionId: HIDDEN, outcome: 'Needs rework', firstTicketId: HIDDEN }, { viaDecisionId: D, outcome: 'Later', firstTicketId: T1 }];
    w.nodes[2]!.parentId = HIDDEN;
    w.nodes[3]!.parentId = T1; // a visible parent stays
    w.start.push(HIDDEN);
    w.end.unshift(HIDDEN);
    w.edges.push(
      { kind: 'leads_to', from: HIDDEN, to: T2, label: 'x', loop: false, taken: 0 },
      { kind: 'blocks', from: T2, to: HIDDEN, label: null, loop: false, taken: 0 },
    );
    w.autoMoves.push({ ticketId: T2, at: '2026-10-03T10:00:00.000Z', kind: 'led-to', becauseTicketId: HIDDEN, pass: null }, { ticketId: HIDDEN, at: '2026-10-03T10:00:00.000Z', kind: 'led-to', becauseTicketId: T1, pass: null });
    // a member this tool does not read (the server's flow-order list) is not passed on, whatever it holds
    (w as unknown as Record<string, unknown>)['order'] = [T1, HIDDEN];
    const out = await tool(fakeFlow({ [FLOW]: w }), 'get_flow').handler({ workspaceId: WS, ticketId: T1 });
    expect(JSON.stringify(out)).not.toContain(HIDDEN);
    const flow = out as ReturnType<typeof wire>;
    expect(flow.nodes[2]).toMatchObject({ parentId: null, resolution: { decisionTicketId: null }, alternates: [{ viaDecisionId: null, firstTicketId: null }, { viaDecisionId: D, firstTicketId: T1 }] });
    expect(flow.nodes[3]?.parentId).toBe(T1);
    expect(flow.edges).toHaveLength(3); // the edges from and to HIDDEN are gone
    expect([flow.start, flow.end]).toEqual([[T1], [DR]]); // a hidden end is dropped from start and end
    expect(flow.autoMoves.map((m) => [m.ticketId, m.becauseTicketId])).toEqual([[T2, D], [T2, null]]);
    // control: with the Decision among the visible nodes every id survives
    const kept = (await tool(fakeFlow({ [FLOW]: wire() }), 'get_flow').handler({ workspaceId: WS, ticketId: T1 })) as ReturnType<typeof wire>;
    expect(kept.nodes[2]).toMatchObject({ resolution: { decisionTicketId: D }, alternates: [{ viaDecisionId: D, firstTicketId: T1 }] });
  });
});

describe('29.381 get_ticket flow facts', () => {
  const tw = `/v1/workspaces/${WS}/tickets`;
  const stateOf = (extra: Record<string, unknown>) => ({ ...detail({ typeId: 'task' }), ticketState: { ...detail().ticketState, ...extra } });
  const getTicket = (f: ReturnType<typeof fakeFlow>) => readTools(f.session).find((t) => t.name === 'get_ticket')!;
  // get_ticket reads the ticket, its links and its notes (MCP sweep 2 T3): all three are served
  const routes = (id: string, extra: Record<string, unknown>, more: Record<string, unknown> = {}) => ({
    [`${tw}/${id}`]: stateOf(extra), [`${tw}/${id}/links`]: { links: [] }, [`${tw}/${id}/notes`]: { notes: [] }, ...more,
  });
  type Out = Record<string, unknown> & { ticketState: Record<string, unknown> };
  const read = async (f: ReturnType<typeof fakeFlow>, id: string) => (await getTicket(f).handler({ workspaceId: WS, ticketId: id })) as Out;

  it('29.381 passes, round and periods are lifted and leave ticketState; a round-1 ticket has no round or periods', async () => {
    // `resolution: null` is served so the "ticketState.resolution is gone" leg below has a member to remove
    const f = fakeFlow(routes(D, { outcome: 'Approved', passes: PASSES, rounds: 2, periods: [{ start: '2026-10-01', end: '2026-10-02', pass: 1 }], resolution: null }));
    const out = await read(f, D);
    expect(out['passes']).toEqual(PASSES);
    expect(out['round']).toBe(2);
    expect(out['periods']).toEqual([{ start: '2026-10-01', end: '2026-10-02', pass: 1 }]);
    for (const k of ['passes', 'rounds', 'periods', 'resolution']) expect(out.ticketState, `ticketState.${k} is gone`).not.toHaveProperty(k);
    expect(out.ticketState['outcome']).toBe('Approved');
    expect(out).not.toHaveProperty('resolution');
    const once = fakeFlow(routes(T1, { rounds: 1, periods: [{ start: '2026-10-01', end: '2026-10-02', pass: 1 }] })); // control
    const plain = await read(once, T1);
    expect(plain).not.toHaveProperty('round');
    expect(plain).not.toHaveProperty('periods');
    expect(plain.ticketState).not.toHaveProperty('periods');
    // no `rounds` at all is a first run; `passes: []` is no pass to show
    const bare = await read(fakeFlow(routes(T1, { passes: [], periods: [{ start: '2026-10-01', end: null, pass: 1 }] })), T1);
    for (const k of ['round', 'periods', 'passes']) expect(bare, k).not.toHaveProperty(k);
    expect(bare.ticketState).not.toHaveProperty('passes');
    // a third round served without periods still answers the list
    const third = await read(fakeFlow(routes(T1, { rounds: 3 })), T1);
    expect([third['round'], third['periods']]).toEqual([3, []]);
    expect(getTicket(f).description).toContain(
      ' Also: for a Decision its `passes`; for a ticket in its second round or later, `round` and `periods`; for a ticket closed as Not taken, its `resolution` (the Decision is named only if you can read it); `leads_to` links carry their `label`.',
    );
  });

  it('29.381 a Not-taken resolution names its Decision only when the caller can read it; closed.cause never leaves', async () => {
    // Part 2 serves no `resolution` member: the cause alone carries it (decision 2).
    const closed = { actorId: 'flow', at: '2026-10-03T10:00:00.000Z', cause: { kind: 'branch-not-taken', decisionTicketId: D, outcome: 'Approved', pass: 1 } };
    const visible = fakeFlow(routes(T2, { closed }, { [`${tw}/${D}`]: detail({ key: 'GN-145', typeId: 'decision' }) }));
    const seen = (await getTicket(visible).handler({ workspaceId: WS, ticketId: T2 })) as { resolution: { decision: unknown }; ticketState: { closed: Record<string, unknown> } };
    expect(seen.resolution).toEqual({ kind: 'not-taken', outcome: 'Approved', pass: 1, decision: { id: D, key: 'GN-145', title: 'A ticket' } });
    expect(seen.ticketState.closed).toEqual({ actorId: 'flow', at: '2026-10-03T10:00:00.000Z' }); // no cause
    const hidden = fakeFlow(routes(T2, { closed })); // the Decision's route answers 404
    const out = await getTicket(hidden).handler({ workspaceId: WS, ticketId: T2 });
    expect((out as { resolution: { decision: unknown } }).resolution.decision).toBeNull();
    expect(JSON.stringify(out)).not.toContain(D);
    // any other failure of the Decision's read fails the call: it is not "hidden"
    const broken = fakeFlow(routes(T2, { closed }, { [`${tw}/${D}`]: () => { throw new HttpError(500, { error: 'boom' }); } }));
    await expect(getTicket(broken).handler({ workspaceId: WS, ticketId: T2 })).rejects.toThrow();
    // a SERVED resolution (the code accepts one besides the cause) is lifted the same way and leaves ticketState
    const served = fakeFlow(routes(T2, { resolution: { kind: 'not-taken', decisionTicketId: D, outcome: 'Approved', pass: 1 } }));
    const fromServed = (await getTicket(served).handler({ workspaceId: WS, ticketId: T2 })) as { resolution: Record<string, unknown>; ticketState: Record<string, unknown> };
    expect(fromServed.resolution).toEqual({ kind: 'not-taken', outcome: 'Approved', pass: 1, decision: null });
    expect(fromServed.ticketState).not.toHaveProperty('resolution');
    expect(JSON.stringify(fromServed)).not.toContain(D);
    // a served resolution wins over a cause that disagrees with it
    const both = await read(fakeFlow(routes(T2, { closed, resolution: { kind: 'not-taken', decisionTicketId: D, outcome: 'Later', pass: 2 } })), T2);
    expect(both['resolution']).toEqual({ kind: 'not-taken', outcome: 'Later', pass: 2, decision: null });
    // a resolution with no Decision id asks nothing more
    const noId = fakeFlow(routes(T2, { resolution: { kind: 'not-taken', decisionTicketId: null, outcome: 'Approved', pass: 1 } }));
    expect((await read(noId, T2))['resolution']).toEqual({ kind: 'not-taken', outcome: 'Approved', pass: 1, decision: null });
    expect(noId.gets).toEqual([`${tw}/${T2}`, `${tw}/${T2}/links`, `${tw}/${T2}/notes`]);
    // control: a cause or a served resolution of another kind names nothing, and the cause still leaves
    const other = { ...closed, cause: { ...closed.cause, kind: 'reopened-by-flow' } };
    const notNotTaken = await read(fakeFlow(routes(T2, { closed: other }, { [`${tw}/${D}`]: detail({ key: 'GN-145' }) })), T2);
    expect(notNotTaken).not.toHaveProperty('resolution');
    expect(notNotTaken.ticketState['closed']).toEqual({ actorId: 'flow', at: '2026-10-03T10:00:00.000Z' });
    const servedOther = await read(fakeFlow(routes(T2, { resolution: { kind: 'taken', decisionTicketId: D, outcome: 'Approved', pass: 1 } }, { [`${tw}/${D}`]: detail({ key: 'GN-145' }) })), T2);
    expect(servedOther).not.toHaveProperty('resolution');
    // an open ticket's `closed: null` is kept as served
    expect((await read(fakeFlow(routes(T2, { closed: null })), T2)).ticketState['closed']).toBeNull();
  });
});
