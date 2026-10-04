import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/http-client.js';
import { ticketTools } from '../src/tools/ticket-tools.js';
import { eventBatches, recordingSession, type Recorded } from './fixtures/recording-session.js';

/**
 * MCP sweep 2 T5, `close_tickets`: cases 14.617, 14.618, 14.619 (package half), 14.622, 14.623 (package half), 14.624, 14.625.
 * The hosted half (the server decides, nothing stubbed) is `apps/server/test/mcp/mcp-close-tickets.test.ts`.
 */
const WS = 'W1';
const ME = '01J0A5ER0000000000000000AA';
const TICKETS: Record<string, { key: string; title: string }> = {
  T1: { key: 'CCSO-4', title: 'Fix login' },
  T2: { key: 'CCSO-9', title: 'Rate limits' },
};
const routes = () => Object.fromEntries(Object.entries(TICKETS).map(([id, t]) => [`GET /v1/workspaces/${WS}/tickets/${id}`, { ...t, ticketState: { fields: {}, workflowId: 'wf' }, rollup: null }]));
const tool = (session: ReturnType<typeof recordingSession>['session']) => {
  const found = ticketTools(session).find((t) => t.name === 'close_tickets');
  if (found === undefined) throw new Error('no close_tickets');
  return found;
};
const closeWith = (session: ReturnType<typeof recordingSession>['session'], ticketIds: string[], extra: Record<string, unknown> = {}) =>
  tool(session).handler({ workspaceId: WS, ticketIds, ...extra });
const ids = (n: number) => Array.from({ length: n }, (_, i) => `X${String(i).padStart(3, '0')}`);
const sent = (requests: Recorded[]) => requests.filter((r) => r.method !== 'GET');
/** Copied, not imported: a reworded sentence must turn these cases red. */
const UNKNOWN =
  'gisik-nokma did not report what happened to every ticket, so which ones closed is unknown. Do not assume any closed or any left open; read them again with list_tickets before doing anything else';
const DECIDES = 'The server decides each close; a ticket that is not in a terminal state, or has open children, will be refused and left open.';

describe('close_tickets (package)', () => {
  it('14.617 refuses zero, 101, a duplicate and an empty id BEFORE any request; 100 distinct ids is accepted', async () => {
    for (const [label, ticketIds] of [['none', []], ['101', ids(101)], ['a duplicate', ['T1', 'T2', 'T1']], ['an empty id', ['T1', '']]] as const) {
      const s = recordingSession({ routes: routes() });
      await expect(closeWith(s.session, [...ticketIds], { confirm_count: String(ticketIds.length) }), label).rejects.toThrow();
      expect(s.requests, `${label}: no request at all`).toEqual([]);
    }
    // The duplicate is named, and the count is not the reason. The whole sentence, exactly.
    const dup = recordingSession();
    await expect(closeWith(dup.session, ['T1', 'T1'], { confirm_count: '2' })).rejects.toThrow(new Error('ticketIds lists T1 more than once; list each ticket once'));
    // Without a count too: the duplicate is refused BEFORE the preview reads anything (the loop above always passes the count,
    // so a check moved below `confirmOrPreview` would still pass there).
    await expect(closeWith(dup.session, ['T1', 'T1'])).rejects.toThrow(new Error('ticketIds lists T1 more than once; list each ticket once'));
    expect(dup.requests, 'the duplicate refusal reads nothing').toEqual([]);
    // CONTROL, same `it`: the boundary 100 closes in ONE batch of 100.
    const hundred = recordingSession();
    const out = (await closeWith(hundred.session, ids(100), { confirm_count: '100' })) as { closed: number };
    expect(out.closed).toBe(100);
    expect(eventBatches(hundred.requests).map((b) => b.length)).toEqual([100]);
  });

  it('14.618 with the exact count, ONE POST /v1/events carries the N events in order: ticket.closed, an empty payload, origin mcp, the session user, no reads', async () => {
    const s = recordingSession();
    // NOT in sorted order: `['T1', 'T2', 'T3']` is already ascending, so a tool that sorted the ids would pass on it.
    await closeWith(s.session, ['T3', 'T1', 'T2'], { confirm_count: '3' });
    const batches = eventBatches(s.requests);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.map((e) => (e['entity'] as { id: string }).id)).toEqual(['T3', 'T1', 'T2']);
    for (const e of batches[0]!) {
      expect(e).toMatchObject({ type: 'ticket.closed', origin: 'mcp', actorId: ME, workspaceId: WS, entity: { kind: 'ticket' } });
      expect(e['payload']).toEqual({}); // `payload: {}` inside toMatchObject matches ANY object
    }
    expect(s.requests.filter((r) => r.method === 'GET'), 'a confirmed close reads nothing first').toEqual([]);
  });

  it('14.619 partial outcomes are reported, not thrown: two closed, one refused with the rule id and the server\'s sentence', async () => {
    const refusal = { status: 'refused', eventId: 'e2', rule: 'close-requires-terminal', reason: 'A ticket can only be closed from a terminal state; "Open" is not one.' };
    const ok = (n: number) => ({ status: 'committed', eventId: `e${n}`, seq: n, serverTime: '2026-10-03T00:00:00.000Z' });
    const s = recordingSession({ events: () => ({ results: [ok(1), refusal, ok(3)] }) });
    const out = (await closeWith(s.session, ['T1', 'T2', 'T3'], { confirm_count: '3' })) as { closed: number; refused: number; results: Array<Record<string, unknown>> };
    expect(out).toMatchObject({ closed: 2, refused: 1 });
    expect(out.results).toEqual([
      { ticketId: 'T1', status: 'closed', eventId: 'e1', seq: 1 },
      { ticketId: 'T2', status: 'refused', rule: 'close-requires-terminal', reason: refusal.reason },
      { ticketId: 'T3', status: 'closed', eventId: 'e3', seq: 3 },
    ]);
    // An `invalid` result is a row too, and counts as left open.
    const bad = recordingSession({ events: () => ({ results: [ok(1), { status: 'invalid', eventId: null, code: 'malformed', message: 'bad' }, ok(3)] }) });
    const mixed = (await closeWith(bad.session, ['T1', 'T2', 'T3'], { confirm_count: '3' })) as { closed: number; refused: number; results: Array<Record<string, unknown>> };
    expect(mixed.results[1]).toEqual({ ticketId: 'T2', status: 'invalid', code: 'malformed', message: 'bad' });
    expect(mixed).toMatchObject({ closed: 2, refused: 1 }); // CONTROL: counts add up to the batch
  });

  it('14.622 a short, holed or rejected answer is reported as an unknown outcome: nothing is claimed closed and list_tickets is named', async () => {
    const ok = { status: 'committed', eventId: 'e', seq: 1, serverTime: 't' };
    const SHORT = `${UNKNOWN} (the answer did not carry one result for each of the 3 events)`;
    for (const [label, events, sentence] of [
      ['short', () => ({ results: [ok] }), SHORT],
      ['holed', () => ({ results: [ok, null, ok] }), SHORT],
      ['rejected', () => { throw new HttpError(502, { error: 'bad_gateway' }); }, `${UNKNOWN} (gisik-nokma answered 502)`],
    ] as const) {
      const s = recordingSession({ events });
      await expect(closeWith(s.session, ['T1', 'T2', 'T3'], { confirm_count: '3' }), label).rejects.toThrow(/which ones closed is unknown.*list_tickets/);
      // The whole sentence, exactly (a reworded or truncated tail is a different answer).
      const t = recordingSession({ events });
      await expect(closeWith(t.session, ['T1', 'T2', 'T3'], { confirm_count: '3' }), `${label}, exactly`).rejects.toThrow(new Error(sentence));
    }
    // CONTROL, same `it`: a whole answer is a normal reply.
    const whole = recordingSession();
    expect(await closeWith(whole.session, ['T1', 'T2', 'T3'], { confirm_count: '3' })).toMatchObject({ closed: 3, refused: 0 });
  });

  it('14.623 each outcome is read BY INDEX: when the answer\'s event ids are rotated against the events sent, row i still belongs to ticketIds[i]', async () => {
    const s = recordingSession({
      events: (events) => ({ results: events.map((_, i) => ({ status: 'committed', eventId: String(events[(i + 1) % events.length]!['id']), seq: i + 1, serverTime: 't' })) }),
    });
    const out = (await closeWith(s.session, ['T1', 'T2', 'T3'], { confirm_count: '3' })) as { results: Array<{ ticketId: string; eventId: string }> };
    const sentIds = eventBatches(s.requests)[0]!.map((e) => String(e['id']));
    expect(out.results.map((r) => r.ticketId)).toEqual(['T1', 'T2', 'T3']);
    expect(out.results.map((r) => r.eventId)).toEqual([sentIds[1], sentIds[2], sentIds[0]]); // the answer's own ids, in the answer's own order
  });

  it('14.624 without the exact count (none, "2", "03", "3 ", 3.5, 4) the tool answers the preview and sends NOTHING; the exact count, as a string or a number, closes', async () => {
    const s = recordingSession({ routes: routes() });
    for (const wrong of [undefined, '2', '03', '3 ', 3.5, 4, '']) {
      const reply = (await closeWith(s.session, ['T1', 'T2', 'T3'], wrong === undefined ? {} : { confirm_count: wrong })) as { preview?: boolean; confirm?: string };
      expect(reply.preview, String(wrong)).toBe(true);
      expect(reply.confirm).toBe('confirm_count must be "3"');
    }
    expect(sent(s.requests), 'no event, no write of any kind').toEqual([]);
    // CONTROL, same `it`: the exact count closes, however it is spelled.
    for (const right of ['3', 3]) {
      const t = recordingSession({ routes: routes() });
      const reply = (await closeWith(t.session, ['T1', 'T2', 'T3'], { confirm_count: right })) as { closed?: number };
      expect(reply.closed, String(right)).toBe(3);
      expect(eventBatches(t.requests)).toHaveLength(1);
    }
    // The description says the two calls, exactly (an assistant reads only this before its first call).
    expect(tool(s.session).description).toBe(
      'Close several tickets at once (1-100 ticketIds), as the List view\'s Bulk close does: one close per ticket, each decided by the product\'s own rules ' +
      '(a ticket closes only from a terminal state, and not while it has open children). Two calls: without confirm_count you get a preview that names every ' +
      'ticket and nothing changes; repeat the call with confirm_count set to the number of tickets to close them. The answer lists every ticket as closed or ' +
      'refused (with the product\'s reason); a refused ticket stays open and the rest are still closed. Undo with reopen_ticket.',
    );
  });

  it('14.625 the preview names every ticket by key and title, lists an unreadable id in the same words whether it is hidden or missing, counts the tickets and says the server decides each close', async () => {
    const s = recordingSession({ routes: routes() }); // T3 has no route: a 404, which is what hidden AND missing both look like
    const reply = (await closeWith(s.session, ['T1', 'T2', 'T3'])) as { preview: boolean; wouldChange: string; counts: Record<string, number>; nothingChanged: boolean; confirm: string };
    expect(reply.preview).toBe(true);
    expect(reply.wouldChange).toContain('Closes 3 tickets: CCSO-4 "Fix login", CCSO-9 "Rate limits" and one you cannot see (T3).');
    expect(reply.wouldChange).toContain('The server decides each close');
    expect(reply.wouldChange).toContain('not in a terminal state');
    // The whole sentence, exactly.
    expect(reply.wouldChange).toBe(`Closes 3 tickets: CCSO-4 "Fix login", CCSO-9 "Rate limits" and one you cannot see (T3). ${DECIDES}`);
    expect(reply.counts).toEqual({ tickets: 3 });
    expect(reply.nothingChanged).toBe(true);
    expect(s.requests.filter((r) => r.method === 'GET')).toHaveLength(3); // one read per ticket, the caller's own
    expect(sent(s.requests)).toEqual([]);
    // CONTROL, same `it`: one ticket is "1 ticket", and a count of 1 is the confirmation.
    const one = recordingSession({ routes: routes() });
    expect(((await closeWith(one.session, ['T1'])) as { wouldChange: string; confirm: string })).toMatchObject({ confirm: 'confirm_count must be "1"', wouldChange: expect.stringContaining('Closes 1 ticket: CCSO-4 "Fix login".') });
    const oneAgain = recordingSession({ routes: routes() });
    expect(((await closeWith(oneAgain.session, ['T1'])) as { wouldChange: string }).wouldChange).toBe(`Closes 1 ticket: CCSO-4 "Fix login". ${DECIDES}`);
    // Two tickets are joined by "and" alone (the boundary of the list's wording).
    const two = recordingSession({ routes: routes() });
    expect(((await closeWith(two.session, ['T2', 'T1'])) as { wouldChange: string }).wouldChange).toBe(`Closes 2 tickets: CCSO-9 "Rate limits" and CCSO-4 "Fix login". ${DECIDES}`);
    // Only "not found" is named "one you cannot see": any other failed read (a 500) reaches the caller as it came, and nothing is sent.
    const broken = recordingSession({ routes: { ...routes(), [`GET /v1/workspaces/${WS}/tickets/T2`]: () => { throw new HttpError(500, { error: 'boom' }); } } });
    await expect(closeWith(broken.session, ['T1', 'T2'])).rejects.toThrow(new HttpError(500, { error: 'boom' })); // untouched: status and body as they came
    expect(sent(broken.requests)).toEqual([]);
  });
});
