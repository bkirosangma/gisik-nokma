import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from './auth.js';
import type { Queryable } from '../db/queryable.js';
import { resolveMcpToken } from '../mcp/token-store.js';

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
 *
 * ## The MCP personal access token is a FALLBACK, and the order is the design
 *
 * better-auth is asked first, always, and the token table is consulted only
 * when it answers `null`. Reversing that — or branching on the header shape
 * before calling `getSession` — would put a second credential system in front
 * of the one that owns sessions, and every mobile and desktop client, plus
 * every test in this repository, authenticates with a better-auth BEARER
 * token. They are the same header. Only the order keeps them from contending.
 *
 * The fallback runs on the raw `Authorization: Bearer <value>` and nothing
 * else: an MCP token is never a cookie, so a cookie-carrying request that
 * better-auth rejected falls straight through to the same 401 it always got.
 *
 * **The order is held by a test, not only by this paragraph** — see case 14.35,
 * which mints a value that is valid as BOTH credentials at once (an
 * `mcp_tokens` row keyed on the hash of a live session token, pointed at a
 * DIFFERENT user) and asserts the request resolves as better-auth's user. The
 * plan for this task judged such a value impossible to construct and settled
 * for review; it is constructible, and the order is now falsifiable.
 *
 * The cost, stated rather than hidden: every request that FALLS THROUGH to the
 * PAT branch performs one indexed single-row write, because `resolveMcpToken`
 * stamps `last_used`. A better-auth session never reaches it, so web, mobile
 * and desktop pay nothing; only MCP calls do.
 */
export function makeRequireSession(auth: Auth, db: Queryable, now: () => Date = () => new Date()) {
  return async function requireSession(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (session) {
      request.currentUserId = session.user.id;
      return;
    }

    const header = request.headers.authorization;
    if (header !== undefined && header.startsWith('Bearer ')) {
      const userId = await resolveMcpToken(db, header.slice('Bearer '.length), now());
      if (userId !== null) {
        request.currentUserId = userId;
        return;
      }
    }

    await reply.code(401).send(UNAUTHENTICATED_BODY);
  };
}
