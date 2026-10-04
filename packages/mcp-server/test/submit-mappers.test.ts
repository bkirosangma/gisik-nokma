import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/http-client.js';
import type { Session } from '../src/session.js';
import { envelopeFor, postJson, postOutsider, putJson, rateLimitedError } from '../src/tools/submit.js';
import { recordingSession } from './fixtures/recording-session.js';

const throwing = (status: number, body: unknown): Session => ({
  ...recordingSession().session,
  post: async () => { throw new HttpError(status, body); },
  put: async () => { throw new HttpError(status, body); },
});
const COMMITTED = { status: 'committed', eventId: 'e', seq: 4, serverTime: '2026-10-03T00:00:00.000Z' };
const REFUSED = { status: 'refused', eventId: 'e', rule: 'permission.role', reason: 'That person is not in this workspace.' };
const claim = (s: Session) => envelopeFor(s, 'W', { kind: 'ticket', id: 'T' }, 'ticket.assigned', { assigneeId: 'U2' });

describe('the response mappers', () => {
  it('14.604 putJson speaks exactly as postJson for 400 and 422, and both leave 404, 429 and 500 untouched', async () => {
    // Each row's sentence is spelled out: `postJson` and `putJson` now share `wordsFor`, so `viaPut === viaPost` alone passes
    // whatever `wordsFor` says. The literal pins the words; the equality pins that postJson did not move in the refactor.
    for (const [status, body, words] of [
      [400, { error: 'invalid_notification_preferences', message: 'Not a preferences document.' }, 'invalid_notification_preferences: Not a preferences document.'],
      [400, {}, 'gisik-nokma answered 400: {}'],
      // A message with no `error` is the message alone (kills dropping `typeof b.error === 'string'`: that answers `undefined: …`).
      [400, { message: 'Only the message.' }, 'Only the message.'],
      [422, REFUSED, 'refused by permission.role: That person is not in this workspace.'],
      [422, { status: 'invalid', code: 'malformed', message: 'bad' }, 'malformed: bad'],
    ] as const) {
      const viaPost = await postJson(throwing(status, body), '/x', {}).then(() => 'resolved', (e: Error) => e.message);
      const viaPut = await putJson(throwing(status, body), '/x', {}).then(() => 'resolved', (e: Error) => e.message);
      expect(viaPut, `${status} ${JSON.stringify(body)}`).toBe(words);
      expect(viaPost, `${status} ${JSON.stringify(body)}`).toBe(words);
    }
    for (const status of [404, 429, 500]) {
      await expect(putJson(throwing(status, { error: 'x' }), '/x', {})).rejects.toMatchObject({ status });
      await expect(postJson(throwing(status, { error: 'x' }), '/x', {})).rejects.toMatchObject({ status });
    }
    // CONTROL: a success passes through.
    expect(await putJson(recordingSession({ routes: { 'PUT /x': { ok: true } } }).session, '/x', {})).toEqual({ ok: true });
  });

  it('14.604 postOutsider answers the unwrapped result on 200 and on 422, throws the server\'s words for a 400, and lets a 404 through', async () => {
    const ok = { ...recordingSession().session, post: async () => ({ result: COMMITTED }) };
    expect(await postOutsider(ok, 'W', 'U2', claim(ok))).toEqual(COMMITTED);
    // 422 { result } IS an answer (`online/people.ts:48-63` returns it, never throws it).
    const refused = throwing(422, { result: REFUSED });
    expect(await postOutsider(refused, 'W', 'U2', claim(refused))).toEqual(REFUSED);
    // A 422 with no `result` is not an answer: it is worded like any other 422.
    await expect(postOutsider(throwing(422, { nope: true }), 'W', 'U2', claim(refused))).rejects.toThrow('gisik-nokma answered 422: {"nope":true}');
    // An empty body arrives as `null` (`readBody`, `http-client.ts:34`): a 422 with one is worded too, never a TypeError (kills `?.result` → `.result`).
    await expect(postOutsider(throwing(422, null), 'W', 'U2', claim(refused))).rejects.toThrow(/^gisik-nokma answered 422: null$/);
    await expect(postOutsider(throwing(400, { error: 'bad_request', message: 'The claim must be your own ticket.created or ticket.assigned in this workspace, naming this person as the assignee.' }), 'W', 'U2', claim(refused)))
      .rejects.toThrow('bad_request: The claim must be your own ticket.created or ticket.assigned');
    // Only a 422 carries an answer: a 400 that happens to hold a `result` is still the server's refusal of the request (kills dropping `status === 422`).
    await expect(postOutsider(throwing(400, { result: REFUSED, error: 'bad_request', message: 'No.' }), 'W', 'U2', claim(refused))).rejects.toThrow('bad_request: No.');
    await expect(postOutsider(throwing(404, { error: 'not_found' }), 'W', 'U2', claim(refused))).rejects.toMatchObject({ status: 404 });
    // 200 without a result is a fault, not a success.
    await expect(postOutsider({ ...ok, post: async () => ({}) }, 'W', 'U2', claim(ok))).rejects.toThrow(/without a result/);
    // So is a 200 with an empty (null) body (kills `?.result` → `.result` on the 200 arm).
    await expect(postOutsider({ ...ok, post: async () => null }, 'W', 'U2', claim(ok))).rejects.toThrow(/without a result/);
    // The request: the route, and { userId, event } exactly.
    const rec = recordingSession({ routes: { 'POST /v1/workspaces/W%201/assign-outsider': { result: COMMITTED } } });
    await postOutsider(rec.session, 'W 1', 'U2', claim(rec.session));
    expect(rec.requests[0]).toMatchObject({ method: 'POST', path: '/v1/workspaces/W%201/assign-outsider', body: { userId: 'U2', event: { type: 'ticket.assigned', origin: 'mcp' } } });
    expect(Object.keys(rec.requests[0]!.body as object).sort()).toEqual(['event', 'userId']); // exactly these two (the route is additionalProperties: false)
  });

  it('14.604 a 429 becomes a sentence naming the wait; any other status is not this mapper\'s; postJson leaves a 429 as it was', async () => {
    const limited = new HttpError(429, { error: 'rate_limited', retryAfterSeconds: 42 });
    expect(rateLimitedError(limited, 'Looking people up by email')!.message)
      .toBe('Looking people up by email is rate limited right now. Wait about 42 seconds and call this again; nothing was changed.');
    expect(rateLimitedError(new HttpError(429, { error: 'rate_limited', retryAfterSeconds: 1 }), 'X')!.message).toContain('about 1 second and');
    expect(rateLimitedError(new HttpError(429, {}), 'X')!.message).toContain('Wait a minute and');
    // The edges of `retryAfterSeconds`: zero is no wait to name, a fraction rounds UP (0.5 → 1 and 1.2 → 2: only 1.2 tells
    // `ceil` from `round` and `floor`), only a number counts, and a proxy's empty body (`null`) is no wait either, not a TypeError.
    expect(rateLimitedError(new HttpError(429, { retryAfterSeconds: 0 }), 'X')!.message).toContain('Wait a minute and');
    expect(rateLimitedError(new HttpError(429, { retryAfterSeconds: 0.5 }), 'X')!.message).toContain('Wait about 1 second and');
    expect(rateLimitedError(new HttpError(429, { retryAfterSeconds: 1.2 }), 'X')!.message).toContain('Wait about 2 seconds and');
    expect(rateLimitedError(new HttpError(429, { retryAfterSeconds: '42' }), 'X')!.message).toContain('Wait a minute and');
    expect(rateLimitedError(new HttpError(429, null), 'X')!.message).toContain('Wait a minute and');
    expect(rateLimitedError(new HttpError(500, {}), 'X')).toBeNull(); // CONTROL
    // postJson itself, not the constructor: a 429 still comes out of it as the untouched HttpError (the sentence this replaces).
    await expect(postJson(throwing(429, { error: 'rate_limited', retryAfterSeconds: 42 }), '/x', {})).rejects.toMatchObject({ status: 429, message: 'gisik-nokma answered 429' });
  });
});
