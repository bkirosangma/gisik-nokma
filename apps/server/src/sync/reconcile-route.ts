import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Pool } from 'pg';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { canReadNoteById } from '../visibility/can-read-note.js';
import { canSee } from '../visibility/can-see.js';
import { MAX_BATCH_SIZE } from '../routes/events.js';

/**
 * One id the client presented that it may no longer hold.
 *
 * **The `{ kind: 'restricted', id }` register, reused rather than re-minted.**
 * `routes/tickets.ts`'s `ParentRef` already spells the product's one way of
 * saying "this exists as far as you are concerned, and nothing more travels" —
 * a discriminated arm with no field an implementation could be talked into
 * filling. Answering a reconcile in a second, parallel vocabulary would leave a
 * reader asking which of the two is the real one.
 *
 * Here it says something narrower than it does there, and the difference is the
 * whole safety argument: at the read door the arm asserts that a parent EXISTS.
 * Here it asserts nothing about existence at all — see the route.
 */
export type ReconcileRestriction = { kind: 'restricted'; id: string };

export type ReconcileResponse = {
  workspaceId: string;
  /** Every presented id the caller may not see now, in the order presented. */
  restricted: ReconcileRestriction[];
  /**
   * The same answer for the NOTE ids the caller presented (notes series,
   * Plan 2 of 6, spec §5.1), in their own array because they are answered by
   * their own predicate and a client has two different purges to run.
   *
   * ALWAYS present, and empty when the request named no note ids. A field that
   * appeared only when `heldNoteIds` was sent would make an old client's reply
   * and a new client's empty one indistinguishable from a door that had stopped
   * answering notes — and 18.072 is the case that pins the compatibility, so
   * the shape it pins has to be the shape that is actually sent.
   */
  restrictedNotes: ReconcileRestriction[];
};

export type ReconcileRouteDeps = { pool: Pool };

/**
 * `POST /v1/sync/reconcile` — closure 5's NARROW half (ruling P37, 2026-09-06):
 * the copy nobody takes away.
 *
 * ## Why the client presents the ids, and the server never enumerates
 *
 * The residual is case 6.104: a member un-shared by a plain `visibility.set`
 * receives no tombstone and keeps the stale copy until a full resync. The
 * obvious repair — have the server walk the narrowing and purge — is the one
 * that was already tried and STRUCK (6.100, 6.101). A server-initiated purge
 * names an entity id to a device that may never have held it, and "could they
 * see it BEFORE" is a question `proj_visibility` keeps no history to answer. So
 * the walk was removed rather than approximated, and P23's disposition is not
 * reopened here.
 *
 * This door inverts the direction instead. **The client names what it holds;
 * the server answers only about what the client named.** A device asking about
 * a ticket it holds is not being told that ticket exists — it is holding it.
 * The client's own holding IS the relationship, which is what makes the answer
 * disclose nothing the recipient did not already have.
 *
 * ## Existence is never consulted, and that is a property of the code
 *
 * This handler asks `canSee` and nothing else. It does not check whether a row
 * exists, and it must not: an answer that OMITTED unknown ids while marking
 * known-but-invisible ones `restricted` would make presence-versus-absence the
 * oracle, and "cannot distinguish lost from never-had" would come back through
 * the SHAPE of the reply after being closed in its content.
 *
 * `canSee` already answers this way and says so — *"A ticket with no
 * `proj_visibility` row answers `false`, identically to a ticket the viewer may
 * not see... giving them different answers here would put the oracle one layer
 * down instead of removing it."* This route is the second reader to depend on
 * that sentence. So a fabricated id comes back `restricted` exactly like a real
 * one, and the client purges nothing for it, because it holds nothing to purge.
 * Case 12.286 presents an id that was never minted and asserts the answer is
 * indistinguishable from a genuine loss.
 *
 * ## The answer can only contain ids the caller presented
 *
 * Structurally: `restricted` is built by walking `heldIds` and pushing a subset.
 * There is no query here that could return an id, so no id the caller did not
 * type can reach the response. Case 12.285 pins it against a mutation that
 * enumerates the workspace instead.
 *
 * ## Bounds and refusals
 *
 * `heldIds` is 1..`MAX_BATCH_SIZE`, the same bound `/v1/events` and `/v1/sync`
 * take and imported rather than restated. `additionalProperties: false` matches
 * both. 403 `{error:'not_a_member'}` when `resolveEffectiveRole` answers null,
 * exactly as `/v1/sync/bootstrap` does — a stranger gets the membership answer
 * and never reaches `canSee`, so they cannot use this door as an id probe at
 * all. A client holding more than `MAX_BATCH_SIZE` tickets calls repeatedly;
 * the answer is per-request and order-independent, so chunking changes nothing.
 *
 * Duplicates in `heldIds` are answered once. That is not deduplication for
 * tidiness — repeating an id must not multiply the work `canSee` does per
 * request.
 */
/**
 * The reconcile RULE, extracted so it has exactly one implementation.
 *
 * **This function exists because a second implementation of it already
 * existed.** `apps/server/test/dual-client/rig.ts` restated this loop
 * in-process for its `SyncTransport.reconcile`, and #139's own review named
 * that as the branch's weakest claim: *"the rig restates the route's rule
 * rather than calling it, so no case runs client and real route together."*
 * The hazard a restatement carries is not that the copy is wrong today — it
 * was right — but that the two can drift, and the harness would then prove
 * replicas against a rule the server does not have. That is this series'
 * signature failure, and it is closed by deletion rather than by a comment
 * asking the next author to keep two copies in step.
 *
 * **Why extraction and not `inject()`.** The lane's brief asked for the rig to
 * call the real route over HTTP. Measured cost: the route reads
 * `request.currentUserId`, which `makeRequireSession` fills from better-auth's
 * session — so the rig's three seeded users (`USER_A`, `USER_B`, `USER_ADMIN`,
 * fixed ULIDs referenced 96 times across `scenarios.test.ts`) would have to
 * become real auth users signed in through `signInWithPhone`, whose ids
 * better-auth mints and the rig cannot choose. That is a large mechanical
 * ripple through shared test files for a property already covered: the HTTP
 * shell — bearer session, the 403 membership gate, the body schema and its
 * bounds — has its own cases in `test/sync/reconcile-route.test.ts` (12.284-12.286,
 * plus 12.304's guest side from closure 5b).
 * What those cases could NOT cover is the rig holding a second copy of the
 * rule, and that is precisely what this extraction removes. One implementation,
 * two callers, and the HTTP layer tested where it lives.
 *
 * The membership gate stays in the ROUTE and is deliberately not pulled in
 * here: it is a 403 with a reply body, an HTTP fact, and a caller that is not a
 * route has no reply to send. Callers that need it ask `resolveEffectiveRole`
 * as the route does.
 *
 * Duplicates in `heldIds` are answered once — not for tidiness, but so
 * repeating an id cannot multiply the `canSee` work one request does.
 */
export async function reconcileHeldIds(
  db: Queryable,
  userId: string,
  heldIds: readonly string[],
): Promise<ReconcileRestriction[]> {
  const restricted: ReconcileRestriction[] = [];
  const asked = new Set<string>();
  for (const id of heldIds) {
    if (asked.has(id)) continue;
    asked.add(id);
    // The ONE question. Not "does it exist", not "did they hold it" — see the
    // route's docblock on why either would reopen what this door closes.
    if (!(await canSee(db, userId, id))) {
      restricted.push({ kind: 'restricted', id });
    }
  }
  return restricted;
}

/**
 * `reconcileHeldIds`'s sibling for notes, and it is a SEPARATE function rather
 * than a parameterised one because the question it asks is a different question.
 *
 * ## Why the predicate cannot be shared
 *
 * Tickets are answered by `canSee`, which resolves a row in `proj_visibility`.
 * A note has no row there, so `canSee` answers `false` for every note and every
 * caller — a device would be told to purge its entire note store on every
 * catch-up, which is the "answer that wipes a replica" failure `reconcile-route`'s
 * own docblock names, one entity kind over. Notes are answered by
 * `canReadNoteById`, which is `can-read-note.ts`'s ONE definition of who may
 * read a note; that file already carries the argument for why the note rule is
 * its own function rather than a call into the ticket one, and this is the
 * second door to depend on it.
 *
 * ## Everything ELSE is the ticket arm's rule, unchanged
 *
 * - **Existence is never consulted.** `canReadNoteById` answers `false` for a
 *   note that does not exist and for one that exists and is unreadable, and it
 *   does so through the same single sentence `canSee` does — so a fabricated
 *   note id comes back `restricted` exactly like a genuine loss, and the
 *   presence-versus-absence oracle stays closed on this arm too. Case 18.071 is
 *   the witness, and it is written against the implementation that would
 *   "helpfully" skip unknown ids.
 * - **The answer can only contain ids the caller presented.** Structurally: the
 *   loop walks `heldNoteIds` and pushes a subset. No query here can produce an
 *   id, so no id the caller did not type can reach the response.
 * - **Duplicates are answered once**, for the same reason: repeating an id must
 *   not multiply the work the predicate does per request.
 *
 * The membership gate is NOT here, exactly as it is not in `reconcileHeldIds`:
 * it is a 403 with a reply body, and a caller that is not a route has no reply
 * to send. The route asks it once for both arms.
 */
export async function reconcileHeldNoteIds(
  db: Queryable,
  userId: string,
  heldNoteIds: readonly string[],
): Promise<ReconcileRestriction[]> {
  const restricted: ReconcileRestriction[] = [];
  const asked = new Set<string>();
  for (const id of heldNoteIds) {
    if (asked.has(id)) continue;
    asked.add(id);
    // The ONE question, and it is the note one — see the docblock above for why
    // borrowing the ticket arm's predicate here answers `true` for nobody.
    if (!(await canReadNoteById(db, userId, id))) {
      restricted.push({ kind: 'restricted', id });
    }
  }
  return restricted;
}

export function registerReconcileRoute(
  app: FastifyInstance,
  deps: ReconcileRouteDeps,
  requireSession: preHandlerHookHandler,
): void {
  app.post<{ Body: { workspaceId: string; heldIds: string[]; heldNoteIds?: string[] } }>(
    '/v1/sync/reconcile',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object',
          required: ['workspaceId', 'heldIds'],
          additionalProperties: false,
          properties: {
            workspaceId: { type: 'string' },
            heldIds: {
              type: 'array',
              minItems: 1,
              maxItems: MAX_BATCH_SIZE,
              items: { type: 'string' },
            },
            // Declared and NOT required, which is the whole compatibility story:
            // a client that predates notes sends a body without it and gets a
            // working reply with an empty `restrictedNotes` (case 18.072). It is
            // bounded like `heldIds` — a caller holding more notes than
            // `MAX_BATCH_SIZE` chunks, and the answer is per-request and
            // order-independent, so chunking changes nothing.
            heldNoteIds: {
              type: 'array',
              maxItems: MAX_BATCH_SIZE,
              items: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, heldIds, heldNoteIds } = request.body;
      const userId = request.currentUserId;
      const eff = await resolveEffectiveRole(deps.pool, userId, workspaceId);
      if (eff.workspaceRole === null) {
        return await reply.code(403).send({ error: 'not_a_member' });
      }
      const body: ReconcileResponse = {
        workspaceId,
        restricted: await reconcileHeldIds(deps.pool, userId, heldIds),
        restrictedNotes: await reconcileHeldNoteIds(deps.pool, userId, heldNoteIds ?? []),
      };
      return body;
    },
  );
}
