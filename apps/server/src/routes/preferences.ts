import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { preferencesDocSchema } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { getPreferences, putPreferences } from '../preferences/store.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';

/** A workspace this caller may not read is the same 404 every read route answers. */
const INVALID_QUERY_BODY = { error: 'invalid_query' } as const;
/** A document this door will not store, named so a client can tell it from bad bytes. */
const INVALID_PREFERENCES_BODY = { error: 'invalid_preferences' } as const;

/**
 * `GET` and `PUT /v1/me/preferences?workspaceId=` — the FIRST WRITE SURFACE on
 * this branch's read plan, and the one exception to everything-is-a-claim.
 *
 * ## Rows, not ledger events (coordination amendment 14)
 *
 * View preferences ARRANGE truth: they change how the record is displayed, never
 * what it says. So there is no claim to attribute, nothing a replica must
 * replay, and recording them as events would put non-facts in the ledger and
 * make every reader of it sort history from furniture. They are server-owned
 * per-user rows instead. The exception is stated in three places — here, the
 * migration, and `packages/domain/src/preferences.ts` — and made FALSIFIABLE in
 * one: `preferences.test.ts` 7.31 asserts a PUT appends zero events, with a
 * control proving the counter can move.
 *
 * ## The subject is the SESSION, and nothing else can name it
 *
 * `request.currentUserId` is the whole of it. There is no `userId` parameter,
 * and the route reads none — which matters because Fastify hands every unknown
 * query parameter to the handler anyway, so "not declared" is not "not read".
 * This is the same position `routes/my-work.ts` is in, one step more dangerous:
 * there, reading an actor-supplied id would have DISCLOSED somebody's queue;
 * here it would OVERWRITE their saved filters. Case 7.125 sends five spellings
 * of "act as the owner" on both verbs and pins the answers byte-for-byte against
 * the request that names nobody, then reads the owner's row back out of the
 * table.
 *
 * ## The order of the gate, and the one place it deviates from the plan text
 *
 * 1. `requireSession` (the preHandler) — no session and a forged bearer alike
 *    are **401 `{error:'unauthenticated'}`**, and the handler never runs.
 * 2. `workspaceId` — a missing, empty or REPEATED one is **400
 *    `{error:'invalid_query'}`**. It is a QUERY parameter here rather than a
 *    path segment, so unlike the attention strip this route has a 400 cell. The
 *    `typeof` check is not decoration: `?workspaceId=a&workspaceId=b` arrives as
 *    an ARRAY, and a route that took `raw.workspaceId` on trust would bind an
 *    array into a text comparison. Shape inherited verbatim from
 *    `routes/my-work.ts`, the other `/v1/me` route.
 * 3. `requireMember` — a caller outside the workspace and a caller naming a
 *    workspace that does not exist are the same **404** with the same frozen
 *    `READ_NOT_FOUND_BODY`, down to `content-length`. A 403 for the first would
 *    confirm the workspace exists to somebody with no business knowing it does.
 * 4. **only then** the body. This is the deviation: the plan's snippet parses
 *    the document BEFORE resolving membership. Parsing first is not a leak, but
 *    it does mean an unauthorised caller's payload is read at all and that their
 *    answer depends on what they sent — a stranger with a malformed document
 *    would be told their DOCUMENT was the problem rather than their standing.
 *    Membership first makes the 404 unconditional; 7.31 pins that a stranger's
 *    malformed PUT is byte-identical to their well-formed one.
 * 5. The document — anything `preferencesDocSchema` refuses is **400
 *    `{error:'invalid_preferences'}`**, whole. Nothing partial is ever stored:
 *    the schema parses the document as one value, and `putPreferences` is
 *    reached only by a document that passed.
 *
 * There is deliberately NO role gate above membership. A guest writes their own
 * preferences exactly as an owner does (7.131), because a preference is one
 * person's arrangement — there is no such thing as one somebody else may not
 * have.
 *
 * ## What the named 400s buy
 *
 * `invalid_query` and `invalid_preferences` are distinct, and both are distinct
 * from Fastify's own parse refusals (malformed JSON, an unsupported content
 * type, a body past the 1 MiB limit), which reach the client as Fastify's
 * standard error body through `app.setErrorHandler`. A client can therefore tell
 * "your bytes are not JSON" from "your document is not a preferences document"
 * from "you did not say which workspace" — 7.130 asserts all three stay
 * distinguishable.
 *
 * ## `requireSession` by parameter
 *
 * The plan's signature is `(app, { pool, auth })` and its snippet imports
 * `makeRequireSession` from `../auth/routes.js`, which exports no such thing (it
 * lives in `../auth/require-session.ts`). This follows the shape every route on
 * this branch has instead: the preHandler arrives as an argument, so there is no
 * version of this registration that forgets the session check and still
 * compiles — which on a WRITE surface is the difference between a preference and
 * an anonymous write.
 */
export function registerPreferencesRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get<{ Querystring: { workspaceId?: string } }>(
    '/v1/me/preferences',
    { preHandler: requireSession },
    async (request, reply) => {
      const raw = request.query;
      if (typeof raw.workspaceId !== 'string' || raw.workspaceId.length === 0) {
        return reply.status(400).send(INVALID_QUERY_BODY);
      }
      const viewerId = request.currentUserId;
      const eff = await requireMember(deps.pool, viewerId, raw.workspaceId);
      if (eff === null) {
        return reply.status(404).send(READ_NOT_FOUND_BODY);
      }
      return getPreferences(deps.pool, viewerId, raw.workspaceId);
    },
  );

  app.put<{ Querystring: { workspaceId?: string } }>(
    '/v1/me/preferences',
    { preHandler: requireSession },
    async (request, reply) => {
      const raw = request.query;
      if (typeof raw.workspaceId !== 'string' || raw.workspaceId.length === 0) {
        return reply.status(400).send(INVALID_QUERY_BODY);
      }
      const viewerId = request.currentUserId;
      const eff = await requireMember(deps.pool, viewerId, raw.workspaceId);
      if (eff === null) {
        return reply.status(404).send(READ_NOT_FOUND_BODY);
      }
      const parsed = preferencesDocSchema.safeParse(request.body);
      if (!parsed.success) {
        // The zod error is deliberately not forwarded: its `path` array names
        // the document's own field spellings back at whoever probed for them,
        // and the refusal is the same whatever failed.
        return reply.status(400).send(INVALID_PREFERENCES_BODY);
      }
      await putPreferences(deps.pool, viewerId, raw.workspaceId, parsed.data);
      // The stored document, so a client needs no second call to know what it
      // now has. It is `parsed.data` — what was stored — and not the request
      // body, which may carry whatever the schema stripped.
      return parsed.data;
    },
  );
}
