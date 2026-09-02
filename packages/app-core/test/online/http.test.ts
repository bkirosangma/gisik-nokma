import { describe, expect, it } from 'vitest';
import { HttpError, createHttpClient } from '../../src/online/http.js';

function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    calls.push(init === undefined ? { input } : { input, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  };
  return { fetchImpl, calls };
}

/** Case 3.36 (`test-cases/03-foundation-ledger.md`). */
describe('3.36 createHttpClient', () => {
  it('GETs with credentials included and returns parsed JSON', async () => {
    const { fetchImpl, calls } = fakeFetch(200, { hello: true });
    const http = createHttpClient('http://server.test', fetchImpl);
    expect(await http.get('/v1/me/work')).toEqual({ hello: true });
    expect(calls[0]?.input).toBe('http://server.test/v1/me/work');
    expect(calls[0]?.init?.credentials).toBe('include');
    expect(calls[0]?.init?.method).toBe('GET');
    // No body, and therefore no content-type: a GET that declared one would be
    // describing a payload it does not send.
    expect(calls[0]?.init?.body).toBeUndefined();
    expect(calls[0]?.init?.headers).toBeUndefined();
  });

  it('3.36 POSTs JSON with the content-type set', async () => {
    const { fetchImpl, calls } = fakeFetch(200, { results: [] });
    const http = createHttpClient('', fetchImpl);
    await http.post('/v1/events', { events: [] });
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.headers).toEqual({ 'content-type': 'application/json' });
    expect(calls[0]?.init?.body).toBe('{"events":[]}');
    expect(calls[0]?.input).toBe('/v1/events');
  });

  it('3.36 PUTs JSON the same way', async () => {
    const { fetchImpl, calls } = fakeFetch(200, {});
    const http = createHttpClient('', fetchImpl);
    await http.put('/v1/me/preferences?workspaceId=ws', { savedFilters: [] });
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(calls[0]?.init?.body).toBe('{"savedFilters":[]}');
  });

  it('3.36 answers null for a 404 on a GET — the server refuses to say whether it exists', async () => {
    const { fetchImpl } = fakeFetch(404, { error: 'not_found' });
    const http = createHttpClient('', fetchImpl);
    expect(await http.get('/v1/workspaces/ws/tickets/nope')).toBeNull();
  });

  /**
   * 3.45 — 404-as-`null` is a READ affordance, and a write that inherited it
   * reported a success the server refused.
   *
   * `PUT /v1/me/preferences` answers 404 whenever `requireMember` is null
   * (`apps/server/src/routes/preferences.ts`) — a member revoked mid-session —
   * and `putPreferences` discards this transport's return value, so a `null`
   * there resolved the promise with nothing stored and nothing said. Reads keep
   * the affordance because every `/v1` read route answers ONE frozen 404 body
   * for "no such thing" and "not yours" alike, and a client that distinguished
   * them would invent a distinction the server refused to make. A write has no
   * such reading: there is nothing to be coy about, only something that did not
   * happen.
   */
  it('3.45 THROWS on a 404 from a PUT or a POST, where the same status is a refusal and not an answer', async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      const { fetchImpl } = fakeFetch(status, { error: 'not_found' });
      const http = createHttpClient('', fetchImpl);
      await expect(
        http.put('/v1/me/preferences?workspaceId=ws', { savedFilters: [] }),
        `PUT ${status}`,
      ).rejects.toMatchObject({ name: 'HttpError', status });
      await expect(http.post('/v1/events', { events: [] }), `POST ${status}`).rejects.toBeInstanceOf(
        HttpError,
      );
    }
    // Control, SAME RUN and same status: the GET affordance is untouched, so
    // this case pins the method gate rather than "404 now throws".
    const { fetchImpl } = fakeFetch(404, { error: 'not_found' });
    expect(await createHttpClient('', fetchImpl).get('/v1/me/preferences?workspaceId=ws')).toBeNull();
  });

  it('3.36 throws HttpError carrying the status for other failures', async () => {
    for (const status of [400, 401, 403, 500]) {
      const { fetchImpl } = fakeFetch(status, {});
      const http = createHttpClient('', fetchImpl);
      await expect(http.get('/v1/me/work')).rejects.toMatchObject({
        name: 'HttpError',
        status,
      });
      // The instance, not merely the shape: a caller switching on `instanceof`
      // is the reason the class exists.
      await expect(http.get('/v1/me/work')).rejects.toBeInstanceOf(HttpError);
    }
  });

  it('3.36 answers undefined for 204 without asking for a body', async () => {
    const calls: string[] = [];
    const fetchImpl = async () =>
      ({
        ok: true,
        status: 204,
        json: async () => {
          calls.push('json');
          throw new Error('a 204 has no body to parse');
        },
      }) as unknown as Response;
    const http = createHttpClient('', fetchImpl);
    expect(await http.put('/v1/me/preferences', {})).toBeUndefined();
    expect(calls).toEqual([]);
  });
});
