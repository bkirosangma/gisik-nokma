import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { INVITE_NOT_OPENABLE_BODY } from '../../src/routes/invites.js';
import { INVITATION_NOT_YOURS_BODY } from '../../src/routes/my-invitations.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithEmail, signInWithPhone } from '../helpers/session.js';

/**
 * Task 17 — `GET /v1/me/invitations`, and Accept/Decline for the caller's own.
 *
 * ## The real app, the real doors, and no seeding backdoor
 *
 * Every invitation here is minted through `POST /v1/workspaces/:id/invites` by a
 * real admin who founded the workspace through `POST /v1/workspaces`, and every
 * caller is signed in over the wire. Nothing hand-writes a `proj_invites` row or
 * an `invite_tokens` row except where a case must age one, and that case says so
 * and shows its control.
 *
 * ## Why the callers sign in by EMAIL and not by phone
 *
 * The scope this route enforces is the caller's VERIFIED address, and
 * `signInWithPhone` cannot produce one — better-auth's phone plugin mints a
 * synthetic `@phone.gisik-nokma.invalid` address and never sets `emailVerified`.
 * `signInWithEmail` follows a real magic link, and the helper ASSERTS
 * `emailVerified` on the session it returns, because an empty invitations list
 * is what both "correctly scoped" and "the caller has no verified address" look
 * like from outside. Case 13.375 uses a phone caller deliberately, as the other
 * side of that same distinction.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let magic: LogMagicLinkSender;

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  magic = built.magic;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

let addressCounter = 0;

type Caller = { userId: string; email: string; headers: { authorization: string } };

/** A signed-in caller with a real, verified email. */
async function signedIn(): Promise<Caller> {
  addressCounter += 1;
  const email = `person${addressCounter}@invitations.test`;
  const user = await signInWithEmail(app, magic, email);
  return { userId: user.userId, email, headers: { authorization: `Bearer ${user.token}` } };
}

/** Found a workspace through the product's own door, asserting it worked. */
async function found(caller: Caller, name = 'Convenience Corner'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: caller.headers,
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { workspaceId: string }).workspaceId;
}

/** Found a project through the product's own door, asserting it committed. */
async function foundProject(owner: Caller, workspaceId: string): Promise<string> {
  const projectId = newUlid();
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: owner.headers,
    payload: {
      events: [
        {
          id: newUlid(),
          workspaceId,
          entity: { kind: 'project', id: projectId },
          type: 'project.created',
          version: 1,
          payload: { name: 'Books' },
          actorId: owner.userId,
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });
  expect((res.json() as { results: Array<{ status: string }> }).results[0]?.status, res.body).toBe('committed');
  return projectId;
}

/** Mint an invitation through the admin door. Returns the id and the ONE raw token. */
async function invite(
  admin: Caller,
  workspaceId: string,
  address: string,
  role: 'admin' | 'member' | 'guest' = 'member',
  projectIds?: string[],
): Promise<{ inviteId: string; token: string }> {
  const res = await app.inject({
    method: 'POST',
    url: `/v1/workspaces/${workspaceId}/invites`,
    headers: admin.headers,
    payload: projectIds === undefined ? { address, channel: 'email', role } : { address, channel: 'email', role, projectIds },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { inviteId: string; url: string };
  return { inviteId: body.inviteId, token: body.url.slice(body.url.lastIndexOf('/') + 1) };
}

type ServedInvitation = {
  inviteId: string;
  workspaceId: string;
  workspaceName: string | null;
  role: string;
  invitedByName: string | null;
  invitedAt: string;
  expiresAt: string;
};

async function myInvitations(caller: Caller): Promise<ServedInvitation[]> {
  const res = await app.inject({ method: 'GET', url: '/v1/me/invitations', headers: caller.headers });
  expect(res.statusCode).toBe(200);
  return (res.json() as { invitations: ServedInvitation[] }).invitations;
}

async function statusOf(inviteId: string): Promise<string | undefined> {
  const { rows } = await db.pool.query<{ status: string }>(
    'SELECT status FROM proj_invites WHERE invite_id = $1',
    [inviteId],
  );
  return rows[0]?.status;
}

async function inviteEventTypes(inviteId: string): Promise<string[]> {
  const { rows } = await db.pool.query<{ type: string; actor_id: string }>(
    `SELECT type, actor_id FROM events
      WHERE entity_kind = 'invite' AND entity_id = $1 ORDER BY seq`,
    [inviteId],
  );
  return rows.map((row) => row.type);
}

describe('GET /v1/me/invitations — the caller-scoped read', () => {
  /**
   * 13.373 — the scope, and it is the whole point of the route.
   *
   * Two invitations are minted from ONE workspace to TWO different addresses, so
   * the two candidate rows differ in exactly the field under test and in nothing
   * else — same workspace, same inviter, same role, same expiry. A read that
   * dropped `lower(i.address) = lower($1)` would serve both to both callers, and
   * that is the mutation this case is built to redden: removing the address
   * predicate turns each `toEqual([...one id...])` into a two-element array.
   *
   * The CASE-INSENSITIVE half is asserted in the same case rather than in its
   * own: the invitation is addressed in mixed case and the caller's account is
   * lower-case, so a comparison written as `i.address = $1` fails here while an
   * exact-case fixture would have passed it. `seed/users.ts` matches addresses
   * the same way, which is what makes this the product's rule and not this
   * route's private one.
   */
  it('13.373 serves only the invitations addressed to the caller, matching the address case-insensitively', async () => {
    const admin = await signedIn();
    const workspaceId = await found(admin, 'Scoped Workspace');
    const mine = await signedIn();
    const theirs = await signedIn();

    const forMe = await invite(admin, workspaceId, mine.email.toUpperCase(), 'member');
    const forThem = await invite(admin, workspaceId, theirs.email, 'member');

    expect((await myInvitations(mine)).map((row) => row.inviteId)).toEqual([forMe.inviteId]);
    expect((await myInvitations(theirs)).map((row) => row.inviteId)).toEqual([forThem.inviteId]);

    // The ACTIONS are scoped by the same rule as the list, which is the half a
    // list-only assertion would leave open: an id is a ULID any member can read
    // out of their own workspace's history, so a decline that did not re-check
    // the address would let anyone destroy anyone's invitation.
    const poach = await app.inject({
      method: 'POST',
      url: `/v1/me/invitations/${forThem.inviteId}/decline`,
      headers: mine.headers,
    });
    expect(poach.statusCode).toBe(404);
    expect(poach.json()).toEqual(INVITATION_NOT_YOURS_BODY);
    expect(await statusOf(forThem.inviteId)).toBe('pending');
  });

  /**
   * 13.374 — the four dead shapes, each against a live positive control in the
   * same response.
   *
   * `pending` is not enough on its own to say an invitation is live: the
   * projection carries the claim and the CREDENTIAL carries the clock, and they
   * can disagree. So all four are checked here — accepted, declined, revoked,
   * and lapsed-but-still-pending — and a fifth invitation to the same address
   * stays live throughout, so a route that answered `[]` for an unrelated reason
   * would fail this case rather than pass it.
   *
   * The lapsed one is aged by moving `invite_tokens.expires_at` into the past.
   * That is the only hand-written row in this file and it is written to the
   * CREDENTIAL store, never to the projection: `expires_at` genuinely lives
   * there (a projection reads no clock), so there is no product path that makes
   * a token old except waiting a fortnight.
   */
  it('13.374 withholds an accepted, declined, revoked or lapsed invitation while a live one still shows', async () => {
    const admin = await signedIn();
    const workspaceId = await found(admin, 'Dead Shapes');
    const me = await signedIn();

    // Five invitations to ONE address that must stay five: a repeat of the same
    // role and project set would rotate the pending one instead of adding a row
    // (case 6.242), so each differs in role or in project set (case 6.246).
    const [projectA, projectB] = [await foundProject(admin, workspaceId), await foundProject(admin, workspaceId)];
    const live = await invite(admin, workspaceId, me.email, 'member');
    const accepted = await invite(admin, workspaceId, me.email, 'admin');
    const declined = await invite(admin, workspaceId, me.email, 'guest');
    const revoked = await invite(admin, workspaceId, me.email, 'member', [projectA as string]);
    const lapsed = await invite(admin, workspaceId, me.email, 'member', [projectB as string]);

    // All five are live before anything kills four of them — the control that
    // says this case's `[live]` at the end is a filter working and not a route
    // that never served anything.
    expect((await myInvitations(me)).map((row) => row.inviteId).sort()).toEqual(
      [live.inviteId, accepted.inviteId, declined.inviteId, revoked.inviteId, lapsed.inviteId].sort(),
    );

    const acceptRes = await app.inject({
      method: 'POST',
      url: `/v1/invites/${accepted.token}/accept`,
      headers: me.headers,
    });
    expect(acceptRes.statusCode).toBe(200);

    const declineRes = await app.inject({
      method: 'POST',
      url: `/v1/me/invitations/${declined.inviteId}/decline`,
      headers: me.headers,
    });
    expect(declineRes.statusCode).toBe(204);

    const revokeRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: admin.headers,
      payload: {
        events: [
          {
            id: newUlid(),
            workspaceId,
            entity: { kind: 'invite', id: revoked.inviteId },
            type: 'invite.revoked',
            version: 1,
            payload: { inviteId: revoked.inviteId },
            actorId: admin.userId,
            origin: 'web',
            clientTime: new Date().toISOString(),
          },
        ],
      },
    });
    expect(revokeRes.statusCode).toBe(200);
    expect((revokeRes.json() as { results: Array<{ status: string }> }).results[0]?.status).toBe(
      'committed',
    );

    await db.pool.query(
      "UPDATE invite_tokens SET expires_at = now() - interval '1 day' WHERE invite_id = $1",
      [lapsed.inviteId],
    );
    expect(await statusOf(lapsed.inviteId)).toBe('pending');

    expect((await myInvitations(me)).map((row) => row.inviteId)).toEqual([live.inviteId]);
  });

  /**
   * 13.375 — an account with no PROVEN address is answered an empty list, and
   * the emptiness is a fact about the account rather than about the route.
   *
   * The control is what makes this case worth having: the very same invitation,
   * addressed to the very same string, IS served to a caller who has verified
   * that address. So the two responses differ in exactly one property —
   * `"emailVerified"` — and a route that dropped the flag from its `WHERE`
   * would hand a phone-only account somebody else's invitations, which is the
   * escalation the flag exists to stop (anyone may sign up claiming an address;
   * only the address's holder can prove it).
   */
  it('13.375 answers a caller with no verified address an empty list, even for an invitation naming that very address', async () => {
    const admin = await signedIn();
    const workspaceId = await found(admin, 'Unproven Address');
    const target = await signedIn();
    const forVerified = await invite(admin, workspaceId, target.email);

    const phoneUser = await signInWithPhone(app, otp, '+919000450001');
    // The account really has an address — better-auth requires one — and it
    // really is unverified. Read rather than assumed, because this case's whole
    // claim is about that column.
    const { rows } = await db.pool.query<{ email: string; verified: boolean }>(
      'SELECT "email", "emailVerified" AS verified FROM "user" WHERE "id" = $1',
      [phoneUser.userId],
    );
    const synthetic = rows[0]?.email ?? '';
    expect(synthetic).toMatch(/@phone\.gisik-nokma\.invalid$/);
    expect(rows[0]?.verified).toBe(false);
    const phoneCaller: Caller = {
      userId: phoneUser.userId,
      email: synthetic,
      headers: { authorization: `Bearer ${phoneUser.token}` },
    };

    // THE FIXTURE THAT MAKES THIS CASE MEAN ANYTHING, and it was not here at
    // first: the invitation is addressed to the unverified account's OWN
    // address. Without it the empty answer below was produced by the ADDRESS
    // filter — the synthetic address matched nothing — and deleting
    // `"emailVerified" = true` from the read left every case in this file
    // green. Measured, not reasoned about. With this row the two predicates are
    // separated: the address matches and the proof does not.
    await invite(admin, workspaceId, synthetic);

    expect(await myInvitations(phoneCaller)).toEqual([]);
    // The positive control, in the same run: the read serves invitations, so
    // the empty answer above is a rule and not a broken query.
    expect((await myInvitations(target)).map((row) => row.inviteId)).toEqual([forVerified.inviteId]);
  });
});

describe('Decline — the state change the product could not express', () => {
  /**
   * 13.376 — declining is a real, attributed, terminal claim *made by the
   * server for the person the invitation names, and by nobody else*. One rule,
   * measured on both sides in one case, because a case that measured only the
   * first half would leave the dangerous half untested.
   *
   * The POSITIVE half asserts four things, because a decline that did only three
   * of them would be a different, wrong feature: the EVENT is in the ledger
   * under the decliner's name (not the admin's), the PROJECTION moved to
   * `declined`, the invitation left the caller's list, and — the one that is
   * easy to forget — the emailed LINK stops opening. Without that last one a
   * person could decline an invitation and still be admitted by the link they
   * already had, which is the whole invitation still being live under a new
   * name.
   *
   * The NEGATIVE half is at the bottom: the same claim submitted through the
   * client door by the workspace OWNER is refused and appends nothing.
   *
   * Mutations this reddens: make the decline a no-op (the invitation stays in
   * the caller's list); delete the `invite.declined` branch from
   * `checkRolePermission` (the owner's forged decline commits).
   *
   * **What this case CANNOT detect, corrected after a reviewer caught the claim
   * standing here:** dropping the token spend from the decline handler. Every
   * assertion above survives it, because `openableInvite` refuses on `status`
   * BEFORE it consults the credential — so once the projection reads `declined`
   * the link 404s whether or not the row was spent, the second decline is
   * refused by `pendingFor`'s own `status = 'pending'`, and the list is empty
   * for the same reason. The spend is a CONCURRENCY guard and 13.377's race is
   * the instrument for it. That race reddens on this mutation when the decline's
   * read lands before the winner's projection write, which over twelve trials is
   * likely and is **not** guaranteed — stated as the probabilistic thing it is,
   * because asserting flat coverage here would repeat the error being corrected.
   */
  it('13.376 records invite.declined as the decliner, moves the projection, and kills the link', async () => {
    const admin = await signedIn();
    const workspaceId = await found(admin, 'Declining Workspace');
    const me = await signedIn();
    const { inviteId, token } = await invite(admin, workspaceId, me.email);

    // The link opens BEFORE the decline — the positive control for the assertion
    // below it, which would otherwise pass against a link that never worked.
    const beforeLink = await app.inject({ method: 'GET', url: `/v1/invites/${token}` });
    expect(beforeLink.statusCode).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: `/v1/me/invitations/${inviteId}/decline`,
      headers: me.headers,
    });
    expect(res.statusCode).toBe(204);

    expect(await inviteEventTypes(inviteId)).toEqual(['invite.sent', 'invite.declined']);
    const { rows } = await db.pool.query<{ actor_id: string; origin: string }>(
      `SELECT actor_id, origin FROM events
        WHERE entity_kind = 'invite' AND entity_id = $1 AND type = 'invite.declined'`,
      [inviteId],
    );
    expect(rows).toEqual([{ actor_id: me.userId, origin: 'server' }]);

    expect(await statusOf(inviteId)).toBe('declined');
    expect(await myInvitations(me)).toEqual([]);

    const afterLink = await app.inject({ method: 'GET', url: `/v1/invites/${token}` });
    expect(afterLink.statusCode).toBe(404);
    expect(afterLink.json()).toEqual(INVITE_NOT_OPENABLE_BODY);

    // Declining twice is not a second claim: the credential is spent and the
    // status is terminal, so the second attempt is refused with the frozen body
    // and the ledger still holds exactly one decline.
    const again = await app.inject({
      method: 'POST',
      url: `/v1/me/invitations/${inviteId}/decline`,
      headers: me.headers,
    });
    expect(again.statusCode).toBe(404);
    expect(await inviteEventTypes(inviteId)).toEqual(['invite.sent', 'invite.declined']);

    // ── THE OTHER SIDE OF THE SAME CLAIM ────────────────────────────────────
    // "Declining is recorded by the server for the person the invitation
    // names" is one rule with two halves, and a case measuring only the first
    // leaves the dangerous half untested. A FRESH invitation is declined
    // through the CLIENT door by the workspace OWNER — the role that reaches
    // the check with every earlier guard already passed, and the role the
    // escalation belongs to: an inviteId is readable by every member, so
    // without this refusal any admin could destroy any pending invitation
    // *under the invited person's name*, which is strictly worse than the
    // revocation they are already entitled to make.
    const second = await invite(admin, workspaceId, me.email);
    const forged = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: admin.headers,
      payload: {
        events: [
          {
            id: newUlid(),
            workspaceId,
            entity: { kind: 'invite', id: second.inviteId },
            type: 'invite.declined',
            version: 1,
            payload: { inviteId: second.inviteId },
            actorId: admin.userId,
            origin: 'web',
            clientTime: new Date().toISOString(),
          },
        ],
      },
    });
    expect(forged.statusCode).toBe(200);
    const [refusal] = (forged.json() as { results: Array<{ status: string; reason?: string }> })
      .results;
    expect(refusal?.status).toBe('refused');
    expect(refusal?.reason).toBe(
      'Declining is recorded by the server for the person the invitation names.',
    );
    // Nothing landed, and the invitation is still the invited person's to act
    // on — the refusal protected it rather than half-consuming it.
    expect(await statusOf(second.inviteId)).toBe('pending');
    expect(await inviteEventTypes(second.inviteId)).toEqual(['invite.sent']);
    expect((await myInvitations(me)).map((row) => row.inviteId)).toEqual([second.inviteId]);
  });

});

describe('Accept — from the banner, on the same semantics as the link', () => {
  /**
   * 13.377 — accepting from the caller-scoped door joins the workspace, and the
   * invitation is spent for the LINK too.
   *
   * The last assertion is the one that says the two doors share a credential
   * rather than merely resembling each other: after a banner acceptance the
   * emailed link opens nothing. Were they to spend separate state — or were the
   * banner door to skip the spend — a person could accept twice, and the second
   * acceptance would append a second `membership.granted` for somebody already
   * inside.
   */
  it('13.377 joins the workspace at the invited role and spends the link with it', async () => {
    const admin = await signedIn();
    const workspaceId = await found(admin, 'Banner Accept');
    const me = await signedIn();
    const { inviteId, token } = await invite(admin, workspaceId, me.email, 'admin');

    const res = await app.inject({
      method: 'POST',
      url: `/v1/me/invitations/${inviteId}/accept`,
      headers: me.headers,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ workspaceId });

    expect(await inviteEventTypes(inviteId)).toEqual(['invite.sent', 'invite.accepted']);
    expect(await statusOf(inviteId)).toBe('accepted');

    // The membership is real, at the role the invitation named, and it is read
    // back through the product's own directory rather than out of the table.
    const mine = await app.inject({
      method: 'GET',
      url: '/v1/me/workspaces',
      headers: me.headers,
    });
    expect(mine.statusCode).toBe(200);
    const workspaces = (mine.json() as { workspaces: Array<{ workspaceId: string; role: string }> })
      .workspaces;
    expect(workspaces.map((row) => ({ workspaceId: row.workspaceId, role: row.role }))).toEqual([
      { workspaceId, role: 'admin' },
    ]);

    expect(await myInvitations(me)).toEqual([]);
    const afterLink = await app.inject({ method: 'GET', url: `/v1/invites/${token}` });
    expect(afterLink.statusCode).toBe(404);

    // ── THE HALF NO SEQUENTIAL ASSERTION CAN SEE ────────────────────────────
    // Everything above passes with the token spend DELETED from both
    // caller-scoped handlers, and that was measured rather than guessed:
    // `openableInvite` refuses on `status` before it reaches the credential, so
    // a link stops opening the moment the projection moves whether or not the
    // row was spent. The spend's real job is the CONCURRENT window, and the
    // only instrument that can see it is a race — the same shape case 6.129
    // needed when three parallel acceptances of one token all committed in 24
    // of 25 trials.
    //
    // Each trial fires ALL THREE doors at one invitation AT ONCE: acceptance by
    // link, acceptance from the banner, and decline from the banner. Exactly one
    // may win, because all three spend the same row in one conditional DELETE
    // and one statement is one transaction.
    //
    // All three and not a pair, and that is not thoroughness for its own sake —
    // it was measured. A race between the LINK accept and the banner DECLINE
    // cannot see a missing spend in the banner ACCEPT, because that handler
    // never runs in it: with the pair, deleting the banner accept's spend left
    // every case green. The invariant is about the invitation, so the race has
    // to be about every door onto it.
    //
    // Without a spend, two doors both read a pending invitation, both append,
    // and the ledger holds an invitation accepted twice — or accepted AND
    // declined, a membership granted to somebody who refused it.
    for (let trial = 0; trial < 12; trial += 1) {
      const racer = await signedIn();
      const raced = await invite(admin, workspaceId, racer.email);
      const [byLink, byBanner, declined] = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/v1/invites/${raced.token}/accept`,
          headers: racer.headers,
        }),
        app.inject({
          method: 'POST',
          url: `/v1/me/invitations/${raced.inviteId}/accept`,
          headers: racer.headers,
        }),
        app.inject({
          method: 'POST',
          url: `/v1/me/invitations/${raced.inviteId}/decline`,
          headers: racer.headers,
        }),
      ]);
      const outcome =
        `link=${byLink?.statusCode} banner=${byBanner?.statusCode} decline=${declined?.statusCode}`;
      const won = [
        byLink?.statusCode === 200,
        byBanner?.statusCode === 200,
        declined?.statusCode === 204,
      ].filter(Boolean);
      expect(won, `trial ${trial}: ${outcome}`).toHaveLength(1);
      // And the ledger agrees with the HTTP answers: one terminal event, not two.
      const types = await inviteEventTypes(raced.inviteId);
      expect(types.filter((type) => type !== 'invite.sent'), `trial ${trial}: ${outcome}`)
        .toHaveLength(1);
    }
  });
});
