import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { membershipId, newUlid, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { ClientIngest } from '../ingest/ingest-service.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import { isWorkspaceAdmin } from '../read/membership-roster.js';

export type MemberRouteDeps = {
  pool: Queryable;
  ingest: ClientIngest;
};

/** An invitation that could not be withdrawn after the membership went (case 6.283). */
export type InviteNotWithdrawn = { inviteId: string; rule: string; reason: string };

export type RemoveMemberResponse = {
  revoked: true;
  invitesWithdrawn: number;
  /** Present only when at least one withdrawal was refused; the removal itself stands. */
  invitesNotWithdrawn?: InviteNotWithdrawn[];
};

/**
 * The refusal an unsubmittable claim is reported as. `invalid` is a shape
 * problem the route itself never authors (it builds the envelope), so it is
 * reported as the server's own failure rather than dressed up as a rule.
 */
function outcomeOf(result: IngestResult | undefined): IngestResult {
  if (result === undefined) throw new Error('ingest returned no result for the claim');
  return result;
}

/**
 * Removing a person from the workspace (access follow-ups R5, owner ruling
 * 2026-09-29: an owner or admin can remove a member, which also withdraws that
 * person's pending invitations).
 *
 * ## Why a route, and not two kinds of claim from the client
 *
 * One call, one place that knows which invitations are "theirs", and the gate
 * STILL decides every event — the same shape as `assign-outsider`
 * (`./people.ts`). The route adds no permission rule of its own beyond the door
 * (who may ask at all).
 *
 * ## The gate decides, through the CLIENT door as the caller
 *
 * `membership.revoked` and every `invite.revoked` go through
 * `ingestClientBatch(…, callerId)`, never the internal door. That is what makes
 * the last-owner guard (`rule-engine/src/checks/membership.ts`) answer and what
 * attributes each event to the admin who acted (case 6.280). The internal door
 * has no gate: submitting there would let this route remove the sole owner
 * (mutation of case 6.282). A refusal is `409 { rule, reason }` in the guard's
 * own words, and nothing is appended.
 *
 * ## Ordering, and what "atomic" means here: it is not
 *
 * `ingestClientBatch` commits each event in its OWN transaction
 * (`../ingest/ingest-service.ts`, `commitOne`), so the membership and the N
 * invitations are N+1 separate commits. The order is chosen so the partial
 * states are safe:
 *
 * 1. Revoke the MEMBERSHIP first. A refusal (last owner, or anything else the
 *    gate says) ends the call before any invitation is touched.
 * 2. Then withdraw each pending invitation. If one is refused after the
 *    membership went (the sharpest case: an admin removing THEMSELVES, who is
 *    no longer an admin for the `invite.revoked` gate), the removal stands and
 *    the reply lists what was not withdrawn, in the gate's words, rather than
 *    a bare 500. Those invitations stay pending and are revocable by any admin
 *    from the pending list; accepting one re-adds the person with the role the
 *    admin chose, which is what an invitation is.
 *
 * ## Which invitations are theirs
 *
 * PENDING, in THIS workspace only, addressed to the person's VERIFIED email
 * (case-insensitive) or verified phone (digits only — the mint stores the
 * address exactly as typed, `../invites/address-match.ts`). An unverified
 * address is not the person's, and a synthetic phone email names no inbox.
 *
 * ## What is left as it is
 *
 * Project rows: they confer nothing once the workspace role is null
 * (`../visibility/can-see.ts`, `../projections/proj-memberships.ts`), and the
 * ledger is append-only: nothing the person authored is deleted. The person
 * keeps their account; their next read of the workspace answers what any
 * non-member gets, and sync-down sends one `scope-revoked` and then nothing
 * (`../visibility/visible-events-for.ts`).
 */
export function registerMemberRoutes(
  app: FastifyInstance,
  deps: MemberRouteDeps,
  requireSession: preHandlerHookHandler,
): void {
  app.post<{ Params: { workspaceId: string; userId: string } }>(
    '/v1/workspaces/:workspaceId/members/:userId/remove',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId, userId } = request.params;
      const callerId = request.currentUserId;

      const caller = await requireMember(deps.pool, callerId, workspaceId);
      if (caller === null || !isWorkspaceAdmin(caller)) {
        return reply.status(404).send(READ_NOT_FOUND_BODY);
      }
      // Nobody to remove: not a member here. Nothing is appended for a
      // person the workspace never had.
      if ((await resolveEffectiveRole(deps.pool, userId, workspaceId)).workspaceRole === null) {
        return reply.status(404).send(READ_NOT_FOUND_BODY);
      }

      const claim = (entity: SubmittedEvent['entity'], type: string, payload: unknown): SubmittedEvent => ({
        id: newUlid(),
        workspaceId,
        entity,
        type,
        version: 1,
        payload,
        actorId: callerId,
        origin: 'web',
        clientTime: new Date().toISOString(),
      });

      const revoked = outcomeOf(
        (
          await deps.ingest.ingestClientBatch(
            [claim({ kind: 'membership', id: membershipId(workspaceId, userId) }, 'membership.revoked', { userId })],
            callerId,
          )
        )[0],
      );
      if (revoked.status === 'refused') {
        return reply.status(409).send({ rule: revoked.rule, reason: revoked.reason });
      }
      if (revoked.status === 'invalid') {
        return reply.status(422).send({ result: revoked });
      }

      const { rows: theirs } = await deps.pool.query<{ invite_id: string }>(
        `SELECT i.invite_id
           FROM proj_invites i
           JOIN "user" u ON u."id" = $2
          WHERE i.workspace_id = $1 AND i.status = 'pending'
            AND (
              (i.channel = 'email' AND u."emailVerified" = true
                 AND lower(trim(i.address)) = lower(trim(u."email")))
              OR
              (i.channel = 'phone' AND u."phoneNumberVerified" = true AND u."phoneNumber" IS NOT NULL
                 AND regexp_replace(i.address, '[^0-9]', '', 'g') <> ''
                 AND regexp_replace(i.address, '[^0-9]', '', 'g') = regexp_replace(u."phoneNumber", '[^0-9]', '', 'g'))
            )
          ORDER BY i.invited_at, i.invite_id`,
        [workspaceId, userId],
      );

      let invitesWithdrawn = 0;
      const invitesNotWithdrawn: InviteNotWithdrawn[] = [];
      for (const { invite_id: inviteId } of theirs) {
        const outcome = outcomeOf(
          (
            await deps.ingest.ingestClientBatch(
              [claim({ kind: 'invite', id: inviteId }, 'invite.revoked', { inviteId })],
              callerId,
            )
          )[0],
        );
        if (outcome.status === 'committed') invitesWithdrawn += 1;
        else if (outcome.status === 'refused') {
          invitesNotWithdrawn.push({ inviteId, rule: outcome.rule, reason: outcome.reason });
        } else {
          invitesNotWithdrawn.push({ inviteId, rule: outcome.code, reason: outcome.message });
        }
      }

      const body: RemoveMemberResponse = { revoked: true, invitesWithdrawn };
      if (invitesNotWithdrawn.length > 0) body.invitesNotWithdrawn = invitesNotWithdrawn;
      return reply.status(200).send(body);
    },
  );
}
