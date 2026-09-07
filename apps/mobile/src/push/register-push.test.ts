import { describe, expect, it, vi } from 'vitest';
import { registerPushToken } from './register-push.js';

/**
 * 12.39 — registerPushToken registers on a 200, reports transport-unavailable on a 404 (missing transport), and reports no-token when getToken throws (denied permission) — the three clauses this row names, each its own it().
 * 12.227 — registerPushToken registers the Expo token on a 200, reports transport-unavailable on the real 404 apps/server answers (no /v1/push/registrations route registered — asserted by the response status the fake fetchImpl returns, matching the route's real absence), reports no-token on a denied OS permission, and reports http-<status> for any other non-404 error.
 */
describe('registerPushToken', () => {
  const getToken = vi.fn(async () => ({ data: 'ExponentPushToken[abc]' }));

  it('POSTs the expo token to the push registration route', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const result = await registerPushToken({ baseUrl: 'http://api', token: 't', getToken, fetchImpl });
    expect(result).toEqual({ registered: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api/v1/push/registrations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ platform: 'expo', token: 'ExponentPushToken[abc]' }),
      }),
    );
  });

  it('tolerates the transport not existing yet — stub honestly says so', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }));
    const result = await registerPushToken({ baseUrl: 'http://api', token: 't', getToken, fetchImpl });
    expect(result).toEqual({ registered: false, reason: 'transport-unavailable' });
  });

  it('reports permission denial without throwing', async () => {
    const denied = vi.fn(async () => {
      throw new Error('permission denied');
    });
    const result = await registerPushToken({ baseUrl: 'http://api', token: 't', getToken: denied, fetchImpl: vi.fn() });
    expect(result).toEqual({ registered: false, reason: 'no-token' });
  });

  it('reports a non-404 error status without throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('server error', { status: 500 }));
    const result = await registerPushToken({ baseUrl: 'http://api', token: 't', getToken, fetchImpl });
    expect(result).toEqual({ registered: false, reason: 'http-500' });
  });
});
