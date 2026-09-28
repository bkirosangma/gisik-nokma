import {
  inviteAcceptedPayload,
  inviteDeclinedPayload,
  inviteRevokedPayload,
  inviteSentPayload,
} from '@gisik-nokma/domain';
import { purgedIdsAmong } from '../purge/purged-lookup.js';
import type { Projection } from './registry.js';

/**
 * Projects the invitation vocabulary (Plan 4 Task 14) into `proj_invites`: one
 * row per invitation, carrying the CLAIM and never the credential.
 *
 * ## `tables` names one table, and the other one in the migration is the reason
 *
 * `1787961600000_proj-invites.sql` creates TWO tables. `invite_tokens` is
 * deliberately absent from `tables` below, because `reset()` empties what that
 * array names and `invite_tokens` is not rebuildable from the ledger — the
 * token is not in the ledger, which is the point of the design. A rebuild or a
 * `verify-projections` run that emptied it would destroy every live invitation
 * link in the product with no way to put them back.
 *
 * Nothing in this file may name `invite_tokens` at all, for a second reason:
 * `tools/verify-projections.ts` creates a shadow copy of every table in
 * `tables` and runs projections with `search_path = verify_shadow, public`, so
 * an unlisted table's unqualified name resolves to the LIVE one and a verify
 * would write production credential state.
 *
 * ## One entity stream writes every row, so there is no interleaving question
 *
 * All four invite types are filed against the INVITE entity, and
 * `parse-event.ts` refuses any whose `entity.id` and `payload.inviteId`
 * disagree. So the key `invite_id` has exactly one totally-ordered writer — the
 * invitation's own stream — and canonical replay order `(entity_kind,
 * entity_id, seq)` is that stream's own order. Live and rebuild cannot diverge,
 * whatever else was interleaved with them. This is the same disjoint-key
 * argument `proj-memberships.ts` makes, in its easy case.
 *
 * ## `pending` is a one-way door
 *
 * All THREE terminal transitions carry `AND status = 'pending'`. That is not
 * defensive noise: an invitation reaching two terminal claims is exactly what
 * happens when an admin revokes one at the moment somebody opens it, and
 * without the guard the LAST event would win — so a person who genuinely
 * accepted before the revoke landed would find their acceptance overwritten by
 * a revocation of an invitation that no longer existed to revoke. With it, the
 * first terminal claim in the invitation's own stream order stands, and the
 * ledger's order is what decides rather than a projection's write order.
 *
 * Task 17's `invite.declined` is the third, and it needs the guard for a
 * SHARPER version of the same reason: a decline and an acceptance of one
 * invitation are two people's claims about the same thing, and the product
 * lets both be attempted (an emailed link in one hand, the `/workspaces` banner
 * in the other). The concurrent race between them is decided in the database,
 * by the conditional DELETE on `invite_tokens` that both doors run — this guard
 * is the SEQUENTIAL net underneath it, and the migration for that table records
 * why one is not the other.
 *
 * ## Determinism
 *
 * Payloads are parsed with the domain's own schemas rather than cast, so a
 * shape this projection cannot honestly write throws here instead of silently
 * storing `undefined` (`workflowsProjection`'s precedent). No clock and no
 * random source is read: `invited_at` and `accepted_at` are the event's stored
 * `serverTime`, the received instant, never a clock read at apply time.
 */
const INSERT_SENT = `
  INSERT INTO proj_invites
    (invite_id, workspace_id, address, channel, role, project_ids, status, invited_by, invited_at)
  VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
  ON CONFLICT (invite_id) DO NOTHING`;

const MARK_ACCEPTED = `
  UPDATE proj_invites
     SET status = 'accepted', accepted_user_id = $2, accepted_at = $3
   WHERE invite_id = $1 AND status = 'pending'`;

const MARK_REVOKED = `
  UPDATE proj_invites
     SET status = 'revoked'
   WHERE invite_id = $1 AND status = 'pending'`;

const MARK_DECLINED = `
  UPDATE proj_invites
     SET status = 'declined'
   WHERE invite_id = $1 AND status = 'pending'`;

export const projInvites: Projection = {
  name: 'proj_invites',
  // ONE table. `invite_tokens` is deliberately absent — see the docblock.
  tables: ['proj_invites'] as const,

  async apply(event, tx) {
    if (event.type === 'invite.sent') {
      const payload = inviteSentPayload.parse(event.payload);
      // Trash series Plan 2 (spec §5.6): a project erased after the invitation
      // was sent is no longer offered — live (the purge's survivor update) and on
      // rebuild (this filter) alike.
      const projectIds = payload.projectIds ?? [];
      const erased = await purgedIdsAmong(tx, 'project', projectIds);
      await tx.query(INSERT_SENT, [
        payload.inviteId,
        event.workspaceId,
        payload.address,
        payload.channel,
        payload.role,
        projectIds.filter((id) => !erased.has(id)),
        event.actorId,
        event.serverTime,
      ]);
      return;
    }
    if (event.type === 'invite.accepted') {
      const payload = inviteAcceptedPayload.parse(event.payload);
      await tx.query(MARK_ACCEPTED, [payload.inviteId, payload.userId, event.serverTime]);
      return;
    }
    if (event.type === 'invite.revoked') {
      const payload = inviteRevokedPayload.parse(event.payload);
      await tx.query(MARK_REVOKED, [payload.inviteId]);
      return;
    }
    if (event.type === 'invite.declined') {
      const payload = inviteDeclinedPayload.parse(event.payload);
      await tx.query(MARK_DECLINED, [payload.inviteId]);
    }
  },

  async reset(tx) {
    // `proj_invites` ONLY. Adding `invite_tokens` here would empty the
    // credential store on every rebuild and every verify run.
    await tx.query('DELETE FROM proj_invites');
  },
};
