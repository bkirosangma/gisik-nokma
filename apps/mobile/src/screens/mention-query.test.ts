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
      // 13.1296 — the magic-link population: no display name, a real address.
      {
        userId: 'u3',
        displayName: '',
        role: 'guest',
        email: 'accountant@example.test',
      } as MemberListResponse['members'][number],
      // …and the floor beneath it, so the two steps are separable: no name and
      // no address is the ID, and neither member alone could distinguish them.
      { userId: 'u4', displayName: '', role: 'guest' } as MemberListResponse['members'][number],
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
      { userId: 'u3', name: 'accountant@example.test' },
      { userId: 'u4', name: 'u4' },
    ]);
  });

  /**
   * 13.1296 — the phone's `@`-mention list names a member the same way every
   * other surface does: name, then the ADDRESS, then the id.
   *
   * It resolved `displayName` verbatim on BOTH sides — the label it returned
   * and the string it matched the query against — so the magic-link population
   * was a blank row in the popup that no typing could reach, the same defect
   * E5-4 closed on the web sheet's `queryUsers`. Both halves are asserted here
   * because fixing the LABEL alone would leave the member unfindable: a
   * resolved name that the filter does not match against is a row nobody can
   * type their way to.
   */
  it('13.1296 names a nameless member by their email, and finds them by typing it', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    const opts = { apiBase: 'http://api', token: 't', workspaceId: 'ws1', fetchImpl };

    const byEmail = await queryWorkspaceMembers({ ...opts, query: 'account' });
    expect(byEmail).toEqual([{ userId: 'u3', name: 'accountant@example.test' }]);

    // The control, on the same roster: the member with no name and no address
    // is still reachable, by their id.
    const byId = await queryWorkspaceMembers({ ...opts, query: 'u4' });
    expect(byId).toEqual([{ userId: 'u4', name: 'u4' }]);

    // And the named member is untouched by the change.
    const byName = await queryWorkspaceMembers({ ...opts, query: 'bob' });
    expect(byName).toEqual([{ userId: 'u2', name: 'Bob Sen' }]);
  });

  it('resolves [] rather than throwing when the roster door refuses', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }));
    const result = await queryWorkspaceMembers({ apiBase: 'http://api', token: 't', workspaceId: 'ws1', query: 'a', fetchImpl });
    expect(result).toEqual([]);
  });
});
