import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Pool } from 'pg';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
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
export function registerReconcileRoute(
  app: FastifyInstance,
  deps: ReconcileRouteDeps,
  requireSession: preHandlerHookHandler,
): void {
  app.post<{ Body: { workspaceId: string; heldIds: string[] } }>(
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
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, heldIds } = request.body;
      const userId = request.currentUserId;
      const eff = await resolveEffectiveRole(deps.pool, userId, workspaceId);
      if (eff.workspaceRole === null) {
        return await reply.code(403).send({ error: 'not_a_member' });
      }
      const restricted: ReconcileRestriction[] = [];
      const asked = new Set<string>();
      for (const id of heldIds) {
        if (asked.has(id)) continue;
        asked.add(id);
        // The ONE question. Not "does it exist", not "did they hold it" — see
        // the docblock on why either would reopen what this door closes.
        if (!(await canSee(deps.pool, userId, id))) {
          restricted.push({ kind: 'restricted', id });
        }
      }
      const body: ReconcileResponse = { workspaceId, restricted };
      return body;
    },
  );
}
