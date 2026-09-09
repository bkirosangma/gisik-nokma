import type { FastifyInstance } from 'fastify';
import type { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';

/**
 * What a signed-in caller needs to be one.
 *
 * Both halves ship together rather than as two helpers, because different later
 * tasks need different halves: a route test needs the `token` to authenticate,
 * and a ledger test needs the `userId` to build the `actorId` on the events it
 * submits — and the two must be the same person or the test proves nothing.
 */
export type SignedInUser = {
  /** Bearer token, from the `set-auth-token` response header. */
  token: string;
  /** The user's ULID — the same string that becomes `actorId` on their events. */
  userId: string;
};

/**
 * Sign a user in over the wire, exactly the way a phone will: request a code,
 * read it out of the dev sender, post it back. Nothing is stubbed, so a test
 * that uses this is testing the real sign-in path and not a fixture of it.
 *
 * Bearer and not cookie, and that is not arbitrary. A cookie-carrying POST must
 * also send a trusted `Origin` or better-auth's CSRF check answers 403 (see
 * `sign-in-flows.test.ts`); a bearer request sends no cookie and is exempt. So
 * `Authorization: Bearer …` is the shape that makes a later task's route test
 * one header instead of two, and it is the shape the mobile and desktop apps
 * use in production.
 *
 * `phone` must be unique per call within a test file — a phone number is a
 * user's identity here, so reusing one signs the SAME user in again.
 *
 * Every failure throws with the server's own answer in the message: a helper
 * that returned `undefined` for a token would fail later, inside whichever route
 * the caller was actually trying to test.
 */
export async function signInWithPhone(
  app: FastifyInstance,
  sender: LogOtpSender,
  phone: string,
): Promise<SignedInUser> {
  // Read the transcript's length first: the sender is shared across a file, so
  // "the code we were just sent" is the entry at this index, not `sent[0]`.
  const before = sender.sent.length;

  const send = await app.inject({
    method: 'POST',
    url: '/api/auth/phone-number/send-otp',
    payload: { phoneNumber: phone },
  });
  if (send.statusCode >= 300) {
    throw new Error(`send-otp failed for ${phone}: ${send.statusCode} ${send.body}`);
  }
  const code = sender.sent[before]?.code;
  if (code === undefined) {
    throw new Error(`send-otp answered ${send.statusCode} but delivered no code for ${phone}`);
  }

  const verify = await app.inject({
    method: 'POST',
    url: '/api/auth/phone-number/verify',
    payload: { phoneNumber: phone, code },
  });
  if (verify.statusCode >= 300) {
    throw new Error(`verify failed for ${phone}: ${verify.statusCode} ${verify.body}`);
  }

  const token = verify.headers['set-auth-token'];
  if (typeof token !== 'string' || token === '') {
    throw new Error(`verify answered 200 for ${phone} but sent no set-auth-token header`);
  }
  const userId = (verify.json() as { user?: { id?: unknown } }).user?.id;
  if (typeof userId !== 'string' || userId === '') {
    throw new Error(`verify answered 200 for ${phone} but named no user: ${verify.body}`);
  }

  return { token, userId };
}

/**
 * Sign a user in over the wire by EMAIL, the way somebody with an inbox will:
 * ask for a link, read it out of the dev sender, follow it. Nothing is stubbed.
 *
 * ## Why this exists beside `signInWithPhone` rather than instead of it
 *
 * The two differ in one property that Task 17 made load-bearing: **this one
 * produces a caller with a VERIFIED email and the phone one cannot.**
 * better-auth's magic-link plugin creates its user with `emailVerified: true`
 * (`plugins/magic-link/index.mjs`, the `createUser` call), while its phone
 * plugin mints a synthetic address at `phone.gisik-nokma.invalid` — the library
 * requires an email and the invalid TLD guarantees nothing reaches it — and
 * never sets the flag at all. So a phone caller has no proven address, which is
 * the truth about them and is exactly what `/v1/me/invitations` answers an empty
 * list for.
 *
 * Bearer, not cookie, for the reason `signInWithPhone` states: a cookie-carrying
 * POST needs a trusted `Origin` and a bearer request sends no cookie.
 *
 * `email` must be unique per call within a test file — an address is a user's
 * identity here, so reusing one signs the SAME user in again.
 *
 * Every failure throws with the server's own answer in the message, so a broken
 * sign-in fails HERE rather than inside whichever route the caller was testing.
 */
export async function signInWithEmail(
  app: FastifyInstance,
  sender: LogMagicLinkSender,
  email: string,
): Promise<SignedInUser> {
  // The sender is shared across a file, so "the link we were just sent" is the
  // entry at this index and not `sent[0]`.
  const before = sender.sent.length;

  const start = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/magic-link',
    payload: { email },
  });
  if (start.statusCode >= 300) {
    throw new Error(`sign-in/magic-link failed for ${email}: ${start.statusCode} ${start.body}`);
  }
  const link = sender.sent[before]?.url;
  if (link === undefined) {
    throw new Error(`sign-in/magic-link answered ${start.statusCode} but delivered no link for ${email}`);
  }

  const url = new URL(link);
  const follow = await app.inject({ method: 'GET', url: url.pathname + url.search });
  // A 302 to the callback IS the success shape — the session rides out on the
  // headers, which is what `sign-in-flows.test.ts` asserts at the same door.
  if (follow.statusCode >= 400) {
    throw new Error(`following the magic link failed for ${email}: ${follow.statusCode} ${follow.body}`);
  }
  const token = follow.headers['set-auth-token'];
  if (typeof token !== 'string' || token === '') {
    throw new Error(`the magic link for ${email} opened no session: ${follow.statusCode}`);
  }

  // The user id comes from the SESSION the token opens rather than from the
  // redirect, which carries none. Asked through the product's own door, so a
  // token that does not actually authenticate fails here and not later.
  const session = await app.inject({
    method: 'GET',
    url: '/api/auth/get-session',
    headers: { authorization: `Bearer ${token}` },
  });
  const user = (session.json() as { user?: { id?: unknown; emailVerified?: unknown } }).user;
  if (typeof user?.id !== 'string' || user.id === '') {
    throw new Error(`the session opened for ${email} names no user: ${session.body}`);
  }
  // Asserted rather than assumed: this helper's whole reason to exist is the
  // verified address, and a better-auth upgrade that stopped setting it would
  // otherwise turn every Task 17 case green-for-the-wrong-reason at once — an
  // empty invitations list is what BOTH "no verified email" and "correctly
  // scoped, nothing pending" look like from the outside.
  if (user.emailVerified !== true) {
    throw new Error(
      `signInWithEmail signed ${email} in but the account is not emailVerified — ` +
        `every caller-scoped invitation case depends on it`,
    );
  }

  return { token, userId: user.id };
}
