import { describe, expect, it } from 'vitest';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { HttpError, type HttpClient } from '../../src/online/http.js';
import { createHttpPeopleGateway, PeopleLookupError } from '../../src/online/people.js';

/** Access plan Task 7, cases 3.982–3.983. */

type Call = { method: string; path: string; body?: unknown };
function fakeHttp(answer: (path: string, body: unknown) => unknown): HttpClient & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    get: async (path) => {
      calls.push({ method: 'GET', path });
      return answer(path, undefined);
    },
    post: async (path, body) => {
      calls.push({ method: 'POST', path, body });
      const value = answer(path, body);
      if (value instanceof Error) throw value;
      return value;
    },
    put: async () => undefined,
    del: async () => undefined,
  } as HttpClient & { calls: Call[] };
}

const PERSON = { userId: '01J9USER000000000000000000', name: 'Anselma Marak', email: 'anselma@example.test', inWorkspace: false, role: null };
const EVENT = { id: '01J9EVT0000000000000000000', type: 'ticket.assigned' } as unknown as SubmittedEvent;

describe('3.982 lookup', () => {
  it('3.982 POSTs {email}, maps the person or null; a 404 throws with its status', async () => {
    const http = fakeHttp((_p, body) => ((body as { email: string }).email === 'anselma@example.test' ? { user: PERSON } : { user: null }));
    const people = createHttpPeopleGateway(http);
    expect(await people.lookup('ws_1', 'anselma@example.test')).toEqual(PERSON);
    expect(http.calls[0]).toEqual({ method: 'POST', path: '/v1/workspaces/ws_1/people-lookup', body: { email: 'anselma@example.test' } });
    expect(await people.lookup('ws_1', 'nobody@example.test')).toBeNull();

    const refusing = createHttpPeopleGateway(fakeHttp(() => new HttpError(404, '/v1/workspaces/ws_1/people-lookup', { error: 'not_found' })));
    await expect(refusing.lookup('ws_1', 'a@b.test')).rejects.toMatchObject({ name: 'PeopleLookupError', status: 404 });
    await expect(refusing.lookup('ws_1', 'a@b.test')).rejects.toBeInstanceOf(PeopleLookupError);
  });
});

describe('3.983 assignOutsider', () => {
  it('3.983 returns the IngestResult for 200 and for 422; a 400 throws with the message', async () => {
    const committed = { status: 'committed', eventId: EVENT.id, seq: 1, serverTime: '2026-09-29T10:00:00.000Z' };
    const refused = { status: 'refused', eventId: EVENT.id, rule: 'people.outsider', reason: 'That person has no account.' };
    const ok = createHttpPeopleGateway(fakeHttp(() => ({ result: committed })));
    expect(await ok.assignOutsider('ws_1', PERSON.userId, EVENT)).toEqual(committed);

    const no = createHttpPeopleGateway(fakeHttp(() => new HttpError(422, '/x', { result: refused })));
    expect(await no.assignOutsider('ws_1', PERSON.userId, EVENT)).toEqual(refused);

    const bad = createHttpPeopleGateway(
      fakeHttp(() => new HttpError(400, '/x', { error: 'bad_request', message: 'The claim must be your own…' })),
    );
    await expect(bad.assignOutsider('ws_1', PERSON.userId, EVENT)).rejects.toThrow('The claim must be your own…');
  });
});
