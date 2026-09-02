import { describe, expect, it } from 'vitest';
import { HttpError, type HttpClient } from '../../src/online/http.js';
import {
  InviteAdminError,
  createHttpInviteAdminGateway,
} from '../../src/online/invites-admin.js';

/**
 * The two admin doors, re-derived from `apps/server/src/routes/invites.ts`:
 * `POST /v1/workspaces/:workspaceId/invites` (:285) and
 * `GET /v1/workspaces/:workspaceId/invites` (:542).
 *
 * Cases 3.95–3.99 (`test-cases/03-foundation-ledger.md`).
 */
type Call = { method: string; path: string; body?: unknown };

function fakeHttp(answers: Record<string, unknown>): HttpClient & { calls: Call[] } {
  const calls: Call[] = [];
  const answer = (method: string, path: string, body?: unknown): unknown => {
    calls.push(body === undefined ? { method, path } : { method, path, body });
    const value = answers[`${method} ${path}`];
    if (value instanceof Error) throw value;
    return value ?? null;
  };
  return {
    calls,
    get: async (path) => answer('GET', path),
    post: async (path, body) => answer('POST', path, body),
    put: async (path, body) => answer('PUT', path, body),
  };
}

const MINTED = {
  inviteId: '01J0000000000000000000000A',
  url: 'http://localhost:3001/invite/tok_raw',
  expiresAt: '2026-09-09T00:00:00.000Z',
};

describe('3.95 mintInvite — the body the door accepts, and the one it refuses', () => {
  it('posts address, channel and role, and OMITS projectIds when there are none', async () => {
    const http = fakeHttp({ 'POST /v1/workspaces/ws_1/invites': MINTED });
    const gateway = createHttpInviteAdminGateway(http);
    expect(await gateway.mintInvite('ws_1', { address: 'a@b.test', channel: 'email', role: 'guest' })).toEqual(
      MINTED,
    );
    /**
     * PLANTED DEFECT: `projectIds: []` here is refused as if the admin had
     * asked for a project on a guest invitation — `inviteSentPayload` refuses
     * the key entirely on a guest, so an empty array a client never asked for
     * turns a legal invitation into a parse refusal. The assertion is on the
     * KEYS, not on a subset, because `toMatchObject` would pass with the key
     * present and empty.
     */
    expect(Object.keys(http.calls[0]?.body as object)).toEqual(['address', 'channel', 'role']);
  });

  it('3.95 sends projectIds when the admin named some', async () => {
    const http = fakeHttp({ 'POST /v1/workspaces/ws_1/invites': MINTED });
    await createHttpInviteAdminGateway(http).mintInvite('ws_1', {
      address: '+919000000000',
      channel: 'sms',
      role: 'member',
      projectIds: ['prj_1', 'prj_2'],
    });
    expect(http.calls[0]?.body).toEqual({
      address: '+919000000000',
      channel: 'sms',
      role: 'member',
      projectIds: ['prj_1', 'prj_2'],
    });
  });

  /**
   * 3.96 PLANTED DEFECT — the ingest layer's own refusal reaches the admin.
   *
   * The mint door returns `result` verbatim at 422 when the gate refuses:
   * a plain member's `permission.role`, or the guest-with-projects parse
   * refusal. Those are `IngestResult`s, so the sentence is on `reason` and not
   * on `message` — which is why `refusalText` reads both keys.
   */
  it('carries a 422 IngestResult refusal out with the engine’s own reason', async () => {
    const refusal = {
      status: 'refused',
      eventId: '01J0000000000000000000000B',
      rule: 'permission.role',
      reason: 'Only a workspace owner or admin can invite somebody into this workspace.',
    };
    const http = fakeHttp({
      'POST /v1/workspaces/ws_1/invites': new HttpError(422, '/v1/workspaces/ws_1/invites', refusal),
    });
    await expect(
      createHttpInviteAdminGateway(http).mintInvite('ws_1', {
        address: 'a@b.test',
        channel: 'email',
        role: 'member',
      }),
    ).rejects.toMatchObject({
      name: 'InviteAdminError',
      status: 422,
      serverMessage: refusal.reason,
    });
  });

  it('3.96 a mint answering no expiry is a failure, not a link shown under copy that promises one', async () => {
    const http = fakeHttp({
      'POST /v1/workspaces/ws_1/invites': { inviteId: 'i_1', url: 'http://x/invite/t' },
    });
    await expect(
      createHttpInviteAdminGateway(http).mintInvite('ws_1', {
        address: 'a@b.test',
        channel: 'email',
        role: 'member',
      }),
    ).rejects.toBeInstanceOf(InviteAdminError);
  });
});

describe('3.97 listPending — the roster of outstanding invitations', () => {
  it('maps the shipped rows, expiresAt included, and keeps a null expiry null', async () => {
    const http = fakeHttp({
      'GET /v1/workspaces/ws_1/invites': {
        invites: [
          {
            inviteId: 'i_1',
            address: 'anselma@example.test',
            channel: 'email',
            role: 'member',
            projectIds: ['prj_1'],
            invitedBy: 'user_kiro',
            invitedAt: '2026-09-01T10:00:00.000Z',
            expiresAt: '2026-09-08T10:00:00.000Z',
          },
          {
            inviteId: 'i_2',
            address: '+919000000000',
            channel: 'sms',
            role: 'guest',
            projectIds: [],
            invitedBy: 'user_kiro',
            invitedAt: '2026-08-31T10:00:00.000Z',
            // The mint-crash residue the server's LEFT JOIN deliberately lists:
            // pending in the ledger, no credential behind it. It is dead and it
            // is listed, which is what an admin needs to withdraw it.
            expiresAt: null,
          },
        ],
      },
    });
    const rows = await createHttpInviteAdminGateway(http).listPending('ws_1');
    expect(rows.map((row) => [row.inviteId, row.expiresAt])).toEqual([
      ['i_1', '2026-09-08T10:00:00.000Z'],
      ['i_2', null],
    ]);
    expect(rows[0]?.projectIds).toEqual(['prj_1']);
  });

  /**
   * 3.98 PLANTED DEFECT — NO TOKEN, on the type and in the values.
   *
   * The server holds only a sha256 hash and the one raw copy went to whoever
   * minted it; a list that re-served credentials would turn a read into an
   * issuance and hand every admin a working link to everybody else's
   * invitations. A row is asserted key-by-key rather than with `toMatchObject`,
   * because a subset match passes with a `token` field sitting in the result.
   */
  it('never carries a token out of the pending list, even when the wire has one', async () => {
    const http = fakeHttp({
      'GET /v1/workspaces/ws_1/invites': {
        invites: [
          {
            inviteId: 'i_1',
            address: 'a@b.test',
            channel: 'email',
            role: 'member',
            projectIds: [],
            invitedBy: 'u_1',
            invitedAt: '2026-09-01T10:00:00.000Z',
            expiresAt: '2026-09-08T10:00:00.000Z',
            token: 'tok_leaked',
            url: 'http://localhost:3001/invite/tok_leaked',
          },
        ],
      },
    });
    const [row] = await createHttpInviteAdminGateway(http).listPending('ws_1');
    expect(Object.keys(row ?? {}).sort()).toEqual([
      'address',
      'channel',
      'expiresAt',
      'inviteId',
      'invitedAt',
      'invitedBy',
      'projectIds',
      'role',
    ]);
    expect(JSON.stringify(row)).not.toContain('tok_leaked');
  });

  /**
   * 3.99 — the 403 that the members page uses as its role gate.
   *
   * `INVITE_ADMIN_ONLY_BODY` (`routes/invites.ts:118`) is what a plain member
   * meets on this door. It is the ONLY client-readable statement of the
   * caller's own role on this branch: `/v1/me/workspaces` carries a `role` but
   * `getMyWorkspaces` refuses whole (`mapWorkspaceRefs`), so nothing else can
   * tell an admin from a member.
   */
  it('carries the 403 status AND the door’s sentence, because a caller acts on both', async () => {
    const body = {
      error: 'forbidden',
      rule: 'permission.role',
      message: 'Only a workspace owner or admin can see or manage this workspace’s invitations.',
    };
    const http = fakeHttp({
      'GET /v1/workspaces/ws_1/invites': new HttpError(403, '/v1/workspaces/ws_1/invites', body),
    });
    await expect(createHttpInviteAdminGateway(http).listPending('ws_1')).rejects.toMatchObject({
      name: 'InviteAdminError',
      status: 403,
      serverMessage: body.message,
    });
  });

  /**
   * 3.99 PLANTED DEFECT — a `null` from the transport is not an empty list.
   *
   * This route has no 404 branch: it answers 403 or 200. A `null` therefore
   * means the route moved or something else answered, and `[]` there would
   * draw "no invitations outstanding" over a read that never happened — an
   * admin would then send a second copy of an invitation they already sent.
   */
  it('refuses to read a missing route as an empty list', async () => {
    const http = fakeHttp({});
    await expect(createHttpInviteAdminGateway(http).listPending('ws_1')).rejects.toMatchObject({
      name: 'InviteAdminError',
      status: 404,
    });
    // CONTROL, same run: a real empty list IS an empty list.
    const empty = fakeHttp({ 'GET /v1/workspaces/ws_1/invites': { invites: [] } });
    expect(await createHttpInviteAdminGateway(empty).listPending('ws_1')).toEqual([]);
  });

  it('3.99 encodes the workspace id into both paths', async () => {
    const http = fakeHttp({ 'POST /v1/workspaces/a%2Fb/invites': MINTED });
    const gateway = createHttpInviteAdminGateway(http);
    await gateway.mintInvite('a/b', { address: 'a@b.test', channel: 'email', role: 'member' });
    await gateway.listPending('a/b').catch(() => undefined);
    expect(http.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /v1/workspaces/a%2Fb/invites',
      'GET /v1/workspaces/a%2Fb/invites',
    ]);
  });
});

/**
 * The absence that is part of this module's contract. `invite.revoked` is an
 * ordinary domain event through `DataSource.ingest`, and it is in
 * `ADMIN_ONLY_TYPES` so the door refuses a member's revoke in the same words as
 * their mint. A revoke method here would be a second write path for a claim the
 * one write path already carries.
 */
describe('3.99 revoke is deliberately NOT on this gateway', () => {
  it('exposes mint and list, and nothing that writes a revocation', () => {
    const gateway = createHttpInviteAdminGateway(fakeHttp({}));
    expect(Object.keys(gateway).sort()).toEqual(['listPending', 'mintInvite']);
  });
});
