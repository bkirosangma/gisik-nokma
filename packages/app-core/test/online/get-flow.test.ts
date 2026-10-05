// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { FlowRead } from '@gisik-nokma/domain';
import { HttpError } from '../../src/online/http.js';
import { mapFlow } from '../../src/online/mappers.js';
import { createOnlineDataSource } from '../../src/online/online-data-source.js';

/** Part 3 T3, case 29.245: `getFlow` is the route's body through `mapFlow`, a guard and not a reshape. */

// non-empty arrays, so a mapper that blanked or rebuilt a list could not pass the round trip
const body = {
  flowId: 't1', rootId: 't2', truncated: false, reached: 2, start: ['t1'], end: ['t2'], order: ['t1', 't2'],
  nodes: [{ id: 't1', title: 'Draft the pitch' }, { id: 't2', title: 'Send to the client' }],
  edges: [{ id: 't1>t2', kind: 'leads_to', from: 't1', to: 't2', label: null, loop: false, taken: 0, takenPasses: [], chosen: null }],
  autoMoves: [{ ticketId: 't2', at: '2026-10-03T05:00:00.000Z', kind: 'led-to', becauseTicketId: 't1', pass: null, outcome: null }],
  draftCount: 0,
};

describe('29.245 mapFlow', () => {
  it('29.245 a complete body passes through unchanged; control: a body missing nodes, edges, order, flowId or autoMoves throws, naming the key', () => {
    expect(mapFlow(body)).toEqual(body);
    for (const key of ['nodes', 'edges', 'order', 'start', 'end', 'autoMoves'] as const) {
      const { [key]: _gone, ...rest } = body;
      expect(() => mapFlow(rest), key).toThrow(new Error(`mapFlow: ${key} is missing or not an array`));
      // present but not a list is the same refusal
      expect(() => mapFlow({ ...body, [key]: 'many' }), key).toThrow(new Error(`mapFlow: ${key} is missing or not an array`));
    }
    for (const key of ['flowId', 'rootId'] as const) {
      const { [key]: _gone, ...rest } = body;
      expect(() => mapFlow(rest), key).toThrow(new Error(`mapFlow: ${key} is missing or not a string`));
      expect(() => mapFlow({ ...body, [key]: 7 }), key).toThrow(new Error(`mapFlow: ${key} is missing or not a string`));
    }
    // the guard's own sentence, not the TypeError a null would raise at `body.flowId` without it
    expect(() => mapFlow(null)).toThrow(new Error('mapFlow: the flow body is not an object'));
    expect(() => mapFlow('a flow')).toThrow(new Error('mapFlow: the flow body is not an object'));
  });

  it('29.245 the online source reads GET /v1/workspaces/:ws/tickets/:id/flow and hands back its body through mapFlow; a 404 is re-raised as HttpError 404', async () => {
    const calls: string[] = [];
    const answers: Record<string, unknown> = { '/v1/workspaces/ws1/tickets/t2/flow': body, '/v1/workspaces/ws1/tickets/t9/flow': { ...body, nodes: undefined } };
    const fetchImpl = async (input: string) => {
      calls.push(input);
      const path = input.replace(/^https?:\/\/[^/]+/, '').split('?')[0] ?? '';
      const answer = answers[path];
      return { ok: answer !== undefined, status: answer === undefined ? 404 : 200, json: async () => answer } as Response;
    };
    const source = createOnlineDataSource({ baseUrl: 'http://server.test', fetchImpl });
    const read: FlowRead = await source.query.getFlow('ws1', 't2');
    expect(read).toEqual(body);
    expect(calls).toEqual(['http://server.test/v1/workspaces/ws1/tickets/t2/flow']);
    // the mapper is on the path: a body without its nodes is refused, not drawn as an empty flow
    await expect(source.query.getFlow('ws1', 't9')).rejects.toThrow('mapFlow: nodes is missing or not an array');
    // `Promise<FlowRead>` has no absence value: the route's 404 (a deleted ticket, one the viewer cannot see, another's draft)
    // comes back as the STATUS it was (`getBoard`'s rule), never as a mapping failure about a body that never came
    const gone = source.query.getFlow('ws1', 'gone');
    await expect(gone).rejects.toBeInstanceOf(HttpError);
    await expect(gone).rejects.toMatchObject({ status: 404, message: 'HTTP 404 for /v1/workspaces/ws1/tickets/gone/flow' });
  });
});
