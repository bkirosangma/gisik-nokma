import { describe, expect, it } from 'vitest';
import { HttpError, createHttpClient, type HttpClient } from '../../src/online/http.js';
import { InviteAcceptanceError, createHttpInviteGateway } from '../../src/online/invites.js';

/**
 * The paths these cases assert are the SHIPPED registrations, re-derived from
 * `apps/server/src/routes/invites.ts` rather than copied from the plan text:
 * `GET /v1/invites/:token` at :378 and `POST /v1/invites/:token/accept` at :397.
 * Plan 6 Task 15 calls invite routes an unowned surface gap; Plan 4 Task 14
 * built them, and this file is pinned to what was built.
 *
 * Cases 3.89–3.94 (`test-cases/03-foundation-ledger.md`).
 */
function fakeHttp(answers: Record<string, unknown>): HttpClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    get: async (path) => {
      calls.push(`GET ${path}`);
      const answer = answers[path];
      if (answer instanceof Error) throw answer;
      return answer ?? null;
    },
    post: async (path) => {
      calls.push(`POST ${path}`);
      const answer = answers[path];
      if (answer instanceof Error) throw answer;
      return answer ?? null;
    },
    put: async () => undefined,
    del: async () => undefined,
  };
}

describe('3.89 createHttpInviteGateway — reading what a link opens', () => {
  it('reads an invite summary from the shipped GET, and answers null for a dead token', async () => {
    const http = fakeHttp({
      '/v1/invites/tok_1': {
        workspaceId: 'ws_1',
        workspaceName: 'Convenience Corner',
        role: 'guest',
      },
    });
    const gateway = createHttpInviteGateway(http);
    expect(await gateway.getInvite('tok_1')).toEqual({
      workspaceId: 'ws_1',
      workspaceName: 'Convenience Corner',
      role: 'guest',
      // The shape widened for E5-18 (2026-09-21); THIS body sends no expiry,
      // so it is carried as null — 17.066 is the case that measures one present.
      expiresAt: null,
    });
    // The transport turns the door's 404 into `null`; the fake stands in for
    // that by answering `null` for an unknown path, which is the same value.
    expect(await gateway.getInvite('tok_dead')).toBeNull();
    expect(http.calls).toEqual(['GET /v1/invites/tok_1', 'GET /v1/invites/tok_dead']);
  });

  /**
   * 17.066 — E5-18. The door has served a FOURTH field since 2026-09-19 —
   * `expiresAt`, the presented token's own window
   * (`apps/server/src/routes/invites.ts:417`, the `isInvite` expiry ruling) — and
   * this mapper read three fields and dropped it. So the invitee-facing page could
   * not say when the link lapses, while `/workspaces` renders the same fact for a
   * waiting invitation (`Invited … · lapses …`). The fact was on the wire and
   * thrown away between the door and the screen.
   */
  it('17.066 carries the token’s own expiry, which the door has served since 2026-09-19', async () => {
    const http = fakeHttp({
      '/v1/invites/tok_1': {
        workspaceId: 'ws_1',
        workspaceName: 'Convenience Corner',
        role: 'guest',
        expiresAt: '2026-09-30T04:30:00.000Z',
      },
    });
    const gateway = createHttpInviteGateway(http);
    expect(await gateway.getInvite('tok_1')).toEqual({
      workspaceId: 'ws_1',
      workspaceName: 'Convenience Corner',
      role: 'guest',
      expiresAt: '2026-09-30T04:30:00.000Z',
    });
  });

  /**
   * 17.066's control — a body that carries NO expiry answers `null` for it rather
   * than inventing a day, and the rest of the summary still arrives. Without this
   * the widening could be satisfied by a mapper that defaulted the field, which
   * would put an expiry on screen that no door sent.
   */
  it('17.066 control: a body with no expiry answers null for it, not an invented day', async () => {
    const http = fakeHttp({
      '/v1/invites/tok_1': { workspaceId: 'ws_1', workspaceName: 'CC', role: 'guest' },
    });
    const summary = await createHttpInviteGateway(http).getInvite('tok_1');
    expect(summary).not.toBeNull();
    expect(summary?.expiresAt).toBeNull();
  });

  it('3.90 PLANTED DEFECT: an unrecognised role is a dead link, not a cast', async () => {
    // The plan's snippet writes `(record.role ?? 'member') as InviteSummary['role']`,
    // which would answer `{role: 'owner'}` here and `{role: 'member'}` for the
    // second — one stamping a union onto a string the door refuses to mint, the
    // other inventing terms of membership nobody offered. The page prints this
    // value in "You are invited to join X as Y".
    const http = fakeHttp({
      '/v1/invites/tok_owner': { workspaceId: 'ws_1', workspaceName: 'CC', role: 'owner' },
      '/v1/invites/tok_none': { workspaceId: 'ws_1', workspaceName: 'CC' },
      '/v1/invites/tok_ok': { workspaceId: 'ws_1', workspaceName: 'CC', role: 'admin' },
    });
    const gateway = createHttpInviteGateway(http);
    expect(await gateway.getInvite('tok_owner')).toBeNull();
    expect(await gateway.getInvite('tok_none')).toBeNull();
    // CONTROL, same run: a legal role still comes back, so these two are the
    // check discriminating rather than the method answering null for everything.
    expect(await gateway.getInvite('tok_ok')).toEqual({
      workspaceId: 'ws_1',
      workspaceName: 'CC',
      role: 'admin',
      expiresAt: null,
    });
  });

  it('3.91 a body missing the workspace it names is not an invitation', async () => {
    const http = fakeHttp({ '/v1/invites/tok_1': { workspaceName: 'CC', role: 'guest' } });
    expect(await createHttpInviteGateway(http).getInvite('tok_1')).toBeNull();
  });
});

describe('3.92 createHttpInviteGateway — accepting', () => {
  it('accepts through the shipped POST and hands back the workspace to enter', async () => {
    const http = fakeHttp({ '/v1/invites/tok_1/accept': { workspaceId: 'ws_1' } });
    const gateway = createHttpInviteGateway(http);
    expect(await gateway.acceptInvite('tok_1')).toEqual({ workspaceId: 'ws_1' });
    expect(http.calls).toEqual(['POST /v1/invites/tok_1/accept']);
  });

  /**
   * 3.93 PLANTED DEFECT — the dead-link sentence reaches the person.
   *
   * `INVITE_NOT_OPENABLE_BODY` (`routes/invites.ts:111`) is what a used,
   * withdrawn or lapsed link gets, at 404, on the POST. The transport's
   * 404-as-null affordance is gated on the METHOD precisely so this body can be
   * read on a write — and before `HttpError` carried a body, the only thing a
   * page could show was `HTTP 404 for /v1/invites/tok_dead/accept`.
   */
  it('carries the door’s own sentence out of a refused acceptance', async () => {
    const body = {
      error: 'not_found',
      message:
        'This invitation link does not open anything. It may have been used, withdrawn, or lapsed — ask whoever invited you for a new one.',
    };
    const http = fakeHttp({
      '/v1/invites/tok_dead/accept': new HttpError(404, '/v1/invites/tok_dead/accept', body),
    });
    const gateway = createHttpInviteGateway(http);
    await expect(gateway.acceptInvite('tok_dead')).rejects.toMatchObject({
      name: 'InviteAcceptanceError',
      status: 404,
      serverMessage: body.message,
    });
  });

  it('3.93 a refusal that sent nothing readable carries null, never a manufactured sentence', async () => {
    const http = fakeHttp({
      '/v1/invites/tok_x/accept': new HttpError(502, '/v1/invites/tok_x/accept', undefined),
    });
    await expect(createHttpInviteGateway(http).acceptInvite('tok_x')).rejects.toMatchObject({
      name: 'InviteAcceptanceError',
      status: 502,
      serverMessage: null,
    });
  });

  it('3.93 a 2xx that names no workspace is a failure, not a redirect to nowhere', async () => {
    const http = fakeHttp({ '/v1/invites/tok_1/accept': { ok: true } });
    await expect(createHttpInviteGateway(http).acceptInvite('tok_1')).rejects.toBeInstanceOf(
      InviteAcceptanceError,
    );
  });
});

describe('3.94 the token is an opaque bearer credential', () => {
  it('URI-encodes it into the path on both routes', async () => {
    const http = fakeHttp({});
    const gateway = createHttpInviteGateway(http);
    await gateway.getInvite('a/b');
    await gateway.acceptInvite('a/b').catch(() => undefined);
    expect(http.calls).toEqual(['GET /v1/invites/a%2Fb', 'POST /v1/invites/a%2Fb/accept']);
  });

  /**
   * The base64url alphabet the server actually mints from
   * (`randomBytes(32).toString('base64url')`) contains `-` and `_` and nothing
   * `encodeURIComponent` touches — so the encoding above is a guard against a
   * hand-typed or mangled token, not against the ordinary one. Proven here so
   * the encoding case above is not read as "tokens need escaping".
   */
  it('leaves a real base64url token byte-identical in the path', async () => {
    const http = fakeHttp({});
    const token = 'aB3-_xYz0123456789abcdefghijklmnopqrstuvwxyzABCDEF';
    await createHttpInviteGateway(http).getInvite(token);
    expect(http.calls).toEqual([`GET /v1/invites/${token}`]);
  });
});

describe('3.94 the gateway over the REAL transport, not a stub of it', () => {
  it('sends credentials, POSTs a body, and reads a 404 body on the write', async () => {
    const seen: Array<{ input: string; init?: RequestInit }> = [];
    const http = createHttpClient('', async (input, init) => {
      seen.push({ input, ...(init === undefined ? {} : { init }) });
      if (init?.method === 'POST') {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: 'not_found', message: 'gone' }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ workspaceId: 'ws_1', workspaceName: 'CC', role: 'member' }),
      } as Response;
    });
    const gateway = createHttpInviteGateway(http);
    expect(await gateway.getInvite('tok_1')).toEqual({
      workspaceId: 'ws_1',
      workspaceName: 'CC',
      role: 'member',
      expiresAt: null,
    });
    await expect(gateway.acceptInvite('tok_1')).rejects.toMatchObject({ serverMessage: 'gone' });
    expect(seen.map((call) => call.input)).toEqual([
      '/v1/invites/tok_1',
      '/v1/invites/tok_1/accept',
    ]);
    expect(seen[0]?.init?.credentials).toBe('include');
    expect(seen[1]?.init?.credentials).toBe('include');
  });
});
