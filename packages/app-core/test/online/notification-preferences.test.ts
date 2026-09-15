import { describe, expect, it } from 'vitest';
import type { NotificationPreferences } from '@gisik-nokma/domain';
import { createHttpClient, type FetchLike } from '../../src/online/http.js';
import { createHttpNotificationPreferencesGateway } from '../../src/online/notification-preferences.js';

/**
 * ## The transport under test is the REAL one
 *
 * Same argument `notifications.test.ts` makes for itself, and the same
 * reason: a hand-written `HttpClient` stub (the plan sketch's `fakeHttp` /
 * `as never`) would let THIS file decide what a 404 or a malformed 200
 * means, when those are exactly what `createHttpClient` and this gateway are
 * built on. Driving the real transport over a scripted `fetch` is what lets
 * a mutation in either layer redden a case here.
 *
 * Account/help-screens plan, Task 6. Task 5's server route
 * (`apps/server/src/routes/notification-preferences.ts`) is what these
 * scripted bodies are shaped after.
 */
function scriptedHttp(routes: Record<string, { status: number; body?: unknown }>) {
  const seen: Array<{ method: string; path: string; hadBody: boolean; body: unknown }> = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const method = init?.method ?? 'GET';
    const hadBody = init?.body !== undefined;
    seen.push({
      method,
      path: input,
      hadBody,
      // Parsed, not left as the raw JSON string — a case asserting on this is
      // asserting the actual DOCUMENT `save()` sent (coordinator review,
      // Important #1: `hadBody` alone would pass for `{}`, a hardcoded body,
      // or a renamed key), not incidentally pinning `JSON.stringify`'s own
      // key order too.
      body: hadBody ? JSON.parse(init!.body as string) : undefined,
    });
    const scripted = routes[`${method} ${input}`];
    if (scripted === undefined) throw new Error(`this case scripted no ${method} ${input}`);
    return new Response(
      scripted.status === 204 || scripted.body === undefined
        ? null
        : JSON.stringify(scripted.body),
      {
        status: scripted.status,
        headers: scripted.body === undefined ? undefined : { 'content-type': 'application/json' },
      },
    );
  };
  return { http: createHttpClient('', fetchImpl), seen };
}

describe('createHttpNotificationPreferencesGateway — against the route Task 5 shipped', () => {
  it('11.201 load() GETs the global endpoint and parses the result', async () => {
    const { http, seen } = scriptedHttp({
      'GET /v1/me/notification-preferences': { status: 200, body: { mutedKinds: ['mention'] } },
    });
    const gateway = createHttpNotificationPreferencesGateway(http);
    await expect(gateway.load()).resolves.toEqual({ mutedKinds: ['mention'] });
    expect(seen).toEqual([
      { method: 'GET', path: '/v1/me/notification-preferences', hadBody: false, body: undefined },
    ]);
  });

  it('11.202 save() PUTs the whole document — the actual body, not merely a body', async () => {
    const { http, seen } = scriptedHttp({
      'PUT /v1/me/notification-preferences': { status: 204 },
    });
    const gateway = createHttpNotificationPreferencesGateway(http);
    const document: NotificationPreferences = { mutedKinds: ['stale-ticket'] };
    await gateway.save(document);
    // Asserting the parsed `body`, not just `hadBody: true` — a mutation that
    // sent `{}`, a hardcoded document, or a renamed key would have passed the
    // weaker assertion unnoticed (coordinator review, Important #1).
    expect(seen).toEqual([
      {
        method: 'PUT',
        path: '/v1/me/notification-preferences',
        hadBody: true,
        body: document,
      },
    ]);
  });

  it('11.203 load() refuses a body naming an unreal kind rather than returning it', async () => {
    const { http } = scriptedHttp({
      'GET /v1/me/notification-preferences': {
        status: 200,
        body: { mutedKinds: ['not-a-real-kind'] },
      },
    });
    await expect(createHttpNotificationPreferencesGateway(http).load()).rejects.toThrow();
  });

  it('11.204 load() names the door on a 404, rather than handing zod a null to parse', async () => {
    // This route is session-gated and answers 401 to a stranger, never 404 —
    // so a 404 here means the request never reached it (a proxy, a rewrite, a
    // wrong origin), the same reasoning `notifications.ts`'s own `read()`
    // guard is built on for its two GETs.
    const { http } = scriptedHttp({
      'GET /v1/me/notification-preferences': { status: 404 },
    });
    await expect(createHttpNotificationPreferencesGateway(http).load()).rejects.toThrow(
      /session-gated/,
    );
  });
});
