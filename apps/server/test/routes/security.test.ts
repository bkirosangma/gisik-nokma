import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import {
  PERMISSION_VISIBILITY_RULE,
  TICKET_NOT_VISIBLE_REASON,
} from '../../src/permissions/check-permission.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  applyAll,
  seedGuest,
  seedMember,
  seedProject,
  seedTicket,
  setVisibilityEnv,
} from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Plan 4 Task 12 — route-level security proofs and session hygiene.
 *
 * ## This is the real app, end to end
 *
 * `buildTestApp` is `buildApp` with the real auth, the real gated ingest and
 * the real projection registry (`test/helpers/app.ts`) — the same assembly
 * `tickets-read.test.ts` uses. Nothing here is a unit test of a door in
 * isolation: `check-visibility-permission.test.ts` already proves the ingest
 * refusal at the gate, and `tickets-read.test.ts` already proves the read 404.
 * What is new here is that the SAME two properties hold when a real signed-in
 * caller drives them through the real HTTP surface, plus the session-hygiene
 * paths (sign-out, fixation) that have no other home.
 *
 * ## Every case reaches the check it names
 *
 * The guest below really is a guest (via `seedGuest`, the real
 * `membership.granted` event), the ticket really exists and really is not
 * shared with them (`seedTicket`, no `visibility.set`). (Amended 2026-09-29,
 * owner ruling (A): the read-404 case used a member of `mine` off `other`; a
 * member is on every project now, so its no-see viewer is a guest too, and the
 * member is asserted to READ across projects.) A refusal that fired because the caller was never signed in,
 * or because the project did not exist, would prove nothing about the check
 * each test names — so every earlier guard here is made to pass first, and
 * each refusal case carries its own POSITIVE CONTROL: the same caller and the
 * same route against a ticket the audience check should let through, so the
 * refusal is pinned to the property named rather than to a session, route or
 * workspace mistake that would refuse everything indiscriminately.
 *
 * ## `SubmittedEvent`, not `LedgerEvent`
 *
 * The HTTP door is what a client posts BEFORE the server assigns `serverTime`
 * and `seq` — `testEnvelope` (which mints both) is for seeding through the
 * internal projections, not for a wire payload, so the ingest envelopes below
 * are built by hand to the `SubmittedEvent` shape `registerEventRoutes` reads.
 *
 * ## The ingest result shape
 *
 * The plan text's stub asserted `{refused: true, rule, reason}`. The route
 * always answers `200 { results: [...] }` — HTTP status means "was this a
 * batch", not "did this event commit" — and each per-event result is
 * `{status: 'refused', eventId, rule, reason}` (`src/ingest/ingest-service.ts`).
 * Asserted against the exported rule/reason constants rather than restated
 * strings, so a wording change here fails at the same place a real drift would.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

/** The origin `buildTestApp` (`test/helpers/app.ts`) configures `createAuth` with — the one better-auth trusts. */
const TRUSTED_ORIGIN = 'http://localhost:3000';

let phoneCounter = 0;

/** A signed-in caller, real sign-in over the wire. */
async function signedIn(): Promise<{
  userId: string;
  token: string;
  headers: { authorization: string };
}> {
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9190002${String(phoneCounter).padStart(5, '0')}`);
  return { userId: user.userId, token: user.token, headers: { authorization: `Bearer ${user.token}` } };
}

describe('security at the HTTP surface', () => {
  it('a guest ingesting an event on a ticket not shared with them is refused permission.visibility', async () => {
    const workspaceId = newUlid();
    const projectId = newUlid();
    const ticketId = newUlid();
    await seedProject(db.pool, workspaceId, projectId);
    const { userId, headers } = await signedIn();
    await seedGuest(db.pool, workspaceId, userId);
    // Not explicitly shared: no visibility.set names this guest.
    await seedTicket(db.pool, { workspaceId, projectId, ticketId });

    // `comment.added`, not `ticket.transitioned`: this branch's rule engine
    // has no `proj_tickets` to read (`getEntityState('ticket')` answers `null`
    // by design, `src/engine-context.ts`), so EVERY `ticket.transitioned`
    // refuses `unknown-ticket` regardless of visibility — a positive control
    // built on it could never reach `committed`, for a reason unrelated to
    // audience. `comment.added` reaches ingest's default pass-through in the
    // engine switch (`evaluate.ts`) and is exactly the type
    // `check-visibility-permission.test.ts` gates on for the same reason.
    const env: SubmittedEvent = {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'comment.added',
      version: 1,
      payload: { body: { text: 'checked' } },
      actorId: userId,
      origin: 'web',
      clientTime: new Date().toISOString(),
    };
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers,
      payload: { events: [env] },
    });

    // The batch itself was heard: HTTP 200. The refusal rides inside the
    // per-event result, index-aligned with what was submitted.
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      results: [
        {
          status: 'refused',
          eventId: env.id,
          rule: PERMISSION_VISIBILITY_RULE,
          reason: TICKET_NOT_VISIBLE_REASON,
        },
      ],
    });

    // Positive control: the same caller, the same route, a ticket explicitly
    // shared with them — everything but the audience held equal. Without this
    // the refusal above is equally consistent with the guest's session, the
    // route, or the workspace being broken; this is what pins the refusal to
    // visibility specifically.
    const sharedTicketId = newUlid();
    await seedTicket(db.pool, { workspaceId, projectId, ticketId: sharedTicketId });
    await applyAll(db.pool, [setVisibilityEnv(workspaceId, sharedTicketId, 'explicit', [userId])]);
    const shared: SubmittedEvent = { ...env, id: newUlid(), entity: { kind: 'ticket', id: sharedTicketId } };
    const controlRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers,
      payload: { events: [shared] },
    });
    expect(controlRes.statusCode).toBe(200);
    const controlBody = controlRes.json() as { results: Array<{ status: string }> };
    expect(controlBody.results[0]?.status).toBe('committed');
  });

  /**
   * AMENDED 2026-09-29, owner ruling (A). This case read "a member reading
   * another project's ticket via direct id is refused as an indistinguishable
   * 404". A member is on every founded project now, so that read is a 200 (the
   * second half below pins it). The protective intent — a viewer who may not see
   * a ticket gets a 404 no different from "no such ticket" — is kept with a
   * GUEST, the viewer rule A leaves without a project.
   */
  it('a viewer who may not see a ticket (a guest) reading it via direct id is refused as an indistinguishable 404; a member reads it', async () => {
    const workspaceId = newUlid();
    const mine = newUlid();
    const other = newUlid();
    await seedProject(db.pool, workspaceId, mine);
    await seedProject(db.pool, workspaceId, other);
    const otherTicketId = newUlid();
    await seedTicket(db.pool, { workspaceId, projectId: other, ticketId: otherTicketId });
    const sharedTicketId = newUlid();
    await seedTicket(db.pool, { workspaceId, projectId: mine, ticketId: sharedTicketId });
    const { headers, userId } = await signedIn();
    await seedGuest(db.pool, workspaceId, userId);
    await applyAll(db.pool, [setVisibilityEnv(workspaceId, sharedTicketId, 'explicit', [userId])]);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/tickets/${otherTicketId}`,
      headers,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });

    // Indistinguishable from a ticket that does not exist at all: same status,
    // same body, same content-length. Without this the 404 could still be an
    // existence oracle.
    const ghost = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/tickets/${newUlid()}`,
      headers,
    });
    expect(ghost.statusCode).toBe(404);
    expect(ghost.json()).toEqual(res.json());
    expect(ghost.headers['content-length']).toBe(res.headers['content-length']);

    // Positive control: the same caller, the same route, a ticket explicitly
    // shared with them — proving the 404 above is the visibility check and not a
    // broken session, a broken route, or a workspace mismatch.
    const controlRes = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/tickets/${sharedTicketId}`,
      headers,
    });
    expect(controlRes.statusCode).toBe(200);
    expect((controlRes.json() as { ticket: { ticket_id: string } }).ticket.ticket_id).toBe(sharedTicketId);

    // Rule A, the other half: a MEMBER of `mine` only reads the ticket in
    // `other` — a project-mode ticket in a project off their roster.
    const roster = await signedIn();
    await seedMember(db.pool, workspaceId, roster.userId, 'member', [{ projectId: mine }]);
    const memberRes = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/tickets/${otherTicketId}`,
      headers: roster.headers,
    });
    expect(memberRes.statusCode).toBe(200);
    expect((memberRes.json() as { ticket: { ticket_id: string } }).ticket.ticket_id).toBe(otherTicketId);
  });

  it('an unauthenticated ingest is a 401 before any permission logic runs', async () => {
    const workspaceId = newUlid();
    const env: SubmittedEvent = {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'ticket', id: newUlid() },
      type: 'ticket.transitioned',
      version: 1,
      payload: { to: 'done' },
      // No session, so no `request.currentUserId` — this actorId is never
      // read: requireSession refuses before the gate ever sees the envelope.
      actorId: newUlid(),
      origin: 'web',
      clientTime: new Date().toISOString(),
    };
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: { events: [env] },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });

  /**
   * Covered independently and more thoroughly at the preHandler level by
   * `test/auth/require-session.test.ts`'s "refuses a token whose session has
   * been signed out" — the same property, proven against the bare
   * `requireSession` factory rather than the assembled app. Restated here so
   * this file's own end-to-end run pins the whole session-hygiene set in one
   * place, per Task 12.
   */
  it('sign-out invalidates the session token — the old token opens nothing afterward', async () => {
    const { headers } = await signedIn();

    const before = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers,
    });
    expect(before.statusCode).toBe(200);
    expect(before.json()?.user).toBeTruthy();

    const signOut = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers,
      payload: {},
    });
    expect(signOut.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers,
    });
    expect(after.json() ?? null).toBeNull();
  });

  /**
   * No fixation: verifying an OTP while carrying an attacker-chosen
   * `better-auth.session_token` cookie must never adopt that value — sign-in
   * mints and sets a FRESH token regardless of what arrived. A trusted
   * `Origin` rides along because this request carries a cookie (the general
   * origin check `sign-in-flows.test.ts` pins, not the per-endpoint
   * `formCsrfMiddleware`), and asserting the property under a request that
   * origin-checking would itself have refused would prove nothing about
   * fixation.
   */
  it('a pre-set cookie value never becomes the session: verify issues a fresh, HttpOnly token', async () => {
    const phone = `+9190003${String((phoneCounter += 1)).padStart(5, '0')}`;
    const before = otp.sent.length;
    await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/send-otp',
      payload: { phoneNumber: phone },
    });
    const code = otp.sent[before]?.code;
    expect(code).toBeDefined();

    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/verify',
      headers: {
        cookie: 'better-auth.session_token=attacker-chosen-value',
        origin: TRUSTED_ORIGIN,
      },
      payload: { phoneNumber: phone, code },
    });
    expect(verify.statusCode).toBe(200);

    const raw = verify.headers['set-cookie'];
    const cookies = Array.isArray(raw) ? raw : [String(raw)];
    const sessionCookie = cookies.find((entry) => entry.startsWith('better-auth.session_token='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).not.toContain('attacker-chosen-value');
    expect(sessionCookie).toMatch(/HttpOnly/i);
  });
});
