import type { FastifyInstance } from 'fastify';
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
