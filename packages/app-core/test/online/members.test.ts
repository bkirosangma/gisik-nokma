import { describe, expect, it } from 'vitest';
import { HttpError, type HttpClient } from '../../src/online/http.js';
import { createHttpMembersGateway, MemberRemovalError } from '../../src/online/members.js';

/** Access follow-ups R5 — the gateway under 6.288 (the page is `apps/web/test/members-page.test.tsx`). */

type Call = { method: string; path: string; body?: unknown };
function fakeHttp(answer: () => unknown): HttpClient & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    get: async () => undefined,
    post: async (path, body) => {
      calls.push({ method: 'POST', path, body });
      const value = answer();
      if (value instanceof Error) throw value;
      return value;
    },
    put: async () => undefined,
    del: async () => undefined,
  } as HttpClient & { calls: Call[] };
}

describe('6.288 members gateway', () => {
  it('6.288 POSTs the remove door once and maps 200; a 409 {rule, reason} is RETURNED as the gate’s answer; anything else throws with the server’s words', async () => {
    const http = fakeHttp(() => ({ revoked: true, invitesWithdrawn: 2 }));
    const members = createHttpMembersGateway(http);
    expect(await members.remove('ws 1', 'u/2')).toEqual({ kind: 'removed', invitesWithdrawn: 2, invitesNotWithdrawn: [] });
    expect(http.calls).toEqual([{ method: 'POST', path: '/v1/workspaces/ws%201/members/u%2F2/remove', body: {} }]);

    const partial = createHttpMembersGateway(fakeHttp(() => ({ revoked: true, invitesWithdrawn: 0, invitesNotWithdrawn: [{ inviteId: 'i1', rule: 'permission.role', reason: 'No.' }] })));
    expect(await partial.remove('ws_1', 'u_2')).toMatchObject({ kind: 'removed', invitesNotWithdrawn: [{ inviteId: 'i1', reason: 'No.' }] });

    const refused = createHttpMembersGateway(fakeHttp(() => new HttpError(409, '/x', { rule: 'last-owner', reason: 'A workspace must keep an owner.' })));
    expect(await refused.remove('ws_1', 'u_2')).toEqual({ kind: 'refused', rule: 'last-owner', reason: 'A workspace must keep an owner.' });

    const notFound = createHttpMembersGateway(fakeHttp(() => new HttpError(404, '/x', { error: 'not_found' })));
    await expect(notFound.remove('ws_1', 'u_2')).rejects.toBeInstanceOf(MemberRemovalError);
    await expect(notFound.remove('ws_1', 'u_2')).rejects.toMatchObject({ status: 404 });
    const broke = createHttpMembersGateway(fakeHttp(() => new HttpError(500, '/x', { message: 'Boom.' })));
    await expect(broke.remove('ws_1', 'u_2')).rejects.toThrow('Boom.');
  });
});
