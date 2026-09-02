import { describe, expect, it } from 'vitest';
import { HttpError, createHttpClient, refusalText } from '../../src/online/http.js';

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

  /**
   * 3.115 PLANTED DEFECT — the refusal BODY, without which every write refusal
   * on this branch reached the screen as `HTTP 422 for /v1/workspaces`.
   *
   * Every write door answers a refusal as a body and uses the status only to
   * classify it: `POST /v1/workspaces` sends `INVALID_NAME_BODY` at 400 and an
   * `IngestResult` at 422, `POST /v1/workspaces/:id/invites` sends that same
   * `IngestResult`, `GET /v1/workspaces/:id/invites` sends
   * `INVITE_ADMIN_ONLY_BODY` at 403. Until this field existed the shell could
   * only paraphrase a refusal it had never read.
   */
  it('3.115 carries the parsed refusal body out on the error, alongside the status', async () => {
    const body = { error: 'forbidden', rule: 'permission.role', message: 'Only an admin can.' };
    const { fetchImpl } = fakeFetch(403, body);
    await expect(createHttpClient('', fetchImpl).get('/v1/workspaces/ws/invites')).rejects.toMatchObject(
      { name: 'HttpError', status: 403, body },
    );
  });

  /**
   * 3.115 — `undefined` is distinct from a body that parsed, and the
   * distinction is load-bearing: a proxy's HTML 502 page must not surface as
   * `SyntaxError: Unexpected token '<'`, which names neither the status nor the
   * door.
   */
  it('3.115 leaves the body undefined when nothing readable came back, and still raises the STATUS', async () => {
    const fetchImpl = async () =>
      ({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError("Unexpected token '<', \"<html>\"... is not valid JSON");
        },
      }) as unknown as Response;
    const error = await createHttpClient('', fetchImpl)
      .post('/v1/events', {})
      .then(() => null, (cause: unknown) => cause);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(502);
    expect((error as HttpError).body).toBeUndefined();
    // CONTROL, same run: a readable body IS read, so the case above is the
    // catch discriminating rather than the field never being set.
    const { fetchImpl: readable } = fakeFetch(502, { message: 'upstream said no' });
    await expect(createHttpClient('', readable).post('/v1/events', {})).rejects.toMatchObject({
      body: { message: 'upstream said no' },
    });
  });

  describe('3.115 refusalText — the server’s own words, or null', () => {
    it('reads `message` from a frozen refusal body and `reason` from an IngestResult', () => {
      expect(refusalText({ error: 'forbidden', message: 'Only an admin can.' })).toBe(
        'Only an admin can.',
      );
      expect(refusalText({ status: 'refused', rule: 'permission.role', reason: 'Not yours.' })).toBe(
        'Not yours.',
      );
    });

    /**
     * PLANTED DEFECT: a fallback sentence minted here — "something went wrong"
     * — would be this module inventing words no server said, which every
     * caller would then render as though the server had said them.
     */
    it('answers null rather than a manufactured sentence, for every unreadable shape', () => {
      for (const body of [undefined, null, 'a string', 42, {}, { error: 'forbidden' }, []]) {
        expect(refusalText(body), JSON.stringify(body ?? null)).toBeNull();
      }
    });
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
