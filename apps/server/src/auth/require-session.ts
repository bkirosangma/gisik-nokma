import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * The signed-in user, as a ULID. Written only by `requireSession`.
     *
     * Declared non-optional because every route that reads it is registered
     * WITH the preHandler, and four later tasks would otherwise carry a `!` or a
     * `?? ''` apiece. The cost is stated rather than hidden: on a route that
     * forgot the preHandler this property is `undefined` at runtime while the
     * type says `string`. The rule that keeps that from mattering is short —
     * a route that reads `currentUserId` registers `requireSession`.
     */
    currentUserId: string;
  }
}

/**
 * The body a caller with no session gets, and the only one.
 *
 * Deliberately NOT the ledger's `{refused, rule, reason}` shape. A refusal is a
 * judgement about a claim — the actor was identified, the claim was understood,
 * and a named rule declined it. Being unauthenticated is none of those: there is
 * no actor to attribute the attempt to, so there is nothing for a rule to judge.
 * Collapsing the two would put "you may not do this" and "I do not know who you
 * are" behind one shape, and a client cannot act on the difference it can no
 * longer see.
 *
 * It is also deliberately contentless. `unauthenticated` is the same answer for
 * no header, an expired session, a revoked session and a forged token: a caller
 * who cannot prove who they are learns nothing about why, because every
 * distinction here is an oracle someone can query.
 */
export const UNAUTHENTICATED_BODY = { error: 'unauthenticated' } as const;

/**
 * Session resolution for every protected route in the product.
 *
 * Cookie (web) and bearer (apps) both arrive as ordinary request headers and
 * better-auth resolves either, so this preHandler has no transport branch — the
 * whole difference between a browser and a phone is which header they happened
 * to send. `getSession` answers `null` for a forged token, an absent header and
 * a signed-out session alike, which is why the guard is a null check and not a
 * signature check: revocation is a database fact, and a token whose signature
 * still verifies but whose session row is gone must not pass.
 *
 * A thrown error is deliberately not caught. If the session store is unreachable
 * that is a 5xx through the app's error handler, not a 401 — answering
 * "unauthenticated" to a database outage would tell every signed-in user they
 * had been signed out.
 */
export function makeRequireSession(auth: Auth) {
  return async function requireSession(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      await reply.code(401).send(UNAUTHENTICATED_BODY);
      return;
    }
    request.currentUserId = session.user.id;
  };
}
