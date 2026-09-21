import { describe, expect, it, vi } from 'vitest';
import { queryWorkspaceMembers } from './mention-query.js';
import type { MemberListResponse } from '@gisik-nokma/domain';

/**
 * 12.406 — E2-52: `@`-mention queries on the phone resolve against the real
 * workspace roster (`GET /v1/workspaces/:id/members`) instead of always
 * answering `[]` — the shape the popup renders as "No people match" for
 * every query.
 */
describe('queryWorkspaceMembers', () => {
  const body: MemberListResponse = {
    workspaceId: 'ws1',
    members: [
      { userId: 'u1', displayName: 'Alice Rai', role: 'member' } as MemberListResponse['members'][number],
      { userId: 'u2', displayName: 'Bob Sen', role: 'member' } as MemberListResponse['members'][number],
    ],
  };

  it('12.406 — resolves matching members from the roster endpoint, bearer-authenticated', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    const result = await queryWorkspaceMembers({
      apiBase: 'http://api',
      token: 't',
      workspaceId: 'ws1',
      query: 'ali',
      fetchImpl,
    });
    expect(result).toEqual([{ userId: 'u1', name: 'Alice Rai' }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api/v1/workspaces/ws1/members',
      expect.objectContaining({ headers: { authorization: 'Bearer t' } }),
    );
  });

  it('returns every member for an empty query', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    const result = await queryWorkspaceMembers({ apiBase: 'http://api', token: 't', workspaceId: 'ws1', query: '', fetchImpl });
    expect(result).toEqual([
      { userId: 'u1', name: 'Alice Rai' },
      { userId: 'u2', name: 'Bob Sen' },
    ]);
  });

  it('resolves [] rather than throwing when the roster door refuses', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }));
    const result = await queryWorkspaceMembers({ apiBase: 'http://api', token: 't', workspaceId: 'ws1', query: 'a', fetchImpl });
    expect(result).toEqual([]);
  });
});
