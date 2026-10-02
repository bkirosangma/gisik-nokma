import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import {
  appendAcceptance,
  spendInviteTokenByInviteId,
  type AcceptableInvite,
} from '../invites/acceptance.js';
import type { ServerAppend } from './invites.js';
import { workspaceNameFromLedger } from '../workspaces/workspace-name.js';

/**
 * The invitations addressed to the SIGNED-IN person, and the two things they can
 * do about them (Task 17, HIG per-screen plan, owner brief 2026-09-09).
 *
 * ## What was already there, and what was missing
 *
 * `routes/invites.ts` is ADMIN-and-TOKEN shaped: an admin mints
 * (`POST /v1/workspaces/:id/invites`), an admin lists their workspace's pending
 * ones, and anybody holding a link can read it and accept it. Measured before
 * this file was written: there was **no caller-scoped read at all**, so a person
 * who had lost the email had no way to discover they had been invited, and
 * **Decline existed nowhere in the product** — the only ways out of `pending`
 * were an acceptance or an admin's revocation. Saying no was not expressible.
 *
 * ## The scope is the session's VERIFIED email, and nothing the caller sends
 *
 * Every query below is keyed on the address resolved from the caller's own
 * `"user"` row, never on a parameter — the rule `routes/my-work.ts:38` states
 * for the same class of route. An invitation for another address is not
 * filtered out of a wider answer; it is never in scope in the first place.
 *
 * **`"emailVerified"` is required, and it is doing real work.** An unverified
 * address is a claim the account made about itself, and honouring it would let
 * anyone sign up naming somebody else's address and collect their invitations.
 * The two ways a real person gets a verified address here are Google (the
 * provider asserts it) and the magic link (better-auth writes
 * `emailVerified: true` when the link is followed, `plugins/magic-link`).
 *
 * ## Three named absences, so nobody reads a gap as coverage
 *
 * 1. **`channel = 'phone'` invitations never surface here.** This read is
 *    email-scoped by the task's own words. A phone-channel invitation is
 *    reachable through its link exactly as before, and a caller-scoped read for
 *    it would key on `"phoneNumberVerified"` and is not built.
 *    *Owner: whoever next takes the invitations surface.*
 * 2. **A phone-only account never matches anything.** better-auth's phone plugin
 *    mints a synthetic address at `phone.gisik-nokma.invalid` and never sets
 *    `emailVerified`, so such an account has no verified address and this route
 *    answers it an empty list — which is the truth, not a failure.
 * 3. **`"user"."email"` is UNIQUE case-sensitively**, so two accounts differing
 *    only in case are constructible and would both match one invitation under
 *    the `lower()` comparison below. The comparison stays case-insensitive
 *    because that is what an email address means to the person who typed it (and
 *    `seed/users.ts` already matches that way); the residual hazard is that BOTH
 *    such accounts would see the invitation and the single-use DELETE would give
 *    it to whichever acted first. Recorded rather than closed — closing it is a
 *    citext or a normalising constraint on the auth table, which is
 *    better-auth's schema and not this task's to change.
 *    *Owner: whoever next touches the auth tables.*
 */
export type MyInvitationRouteDeps = {
  pool: Queryable;
  /** The internal door. Acceptance and decline both go through it — see `../invites/acceptance.ts`. */
  serverAppend: ServerAppend;
};

/**
 * ONE body for every way an invitation is not the caller's to act on: it does
 * not exist, it is addressed to somebody else, it was already accepted,
 * declined or withdrawn, or its credential row has lapsed.
 *
 * Undistinguished for the reason `INVITE_NOT_OPENABLE_BODY` is undistinguished,
 * and one this door needs MORE than that one does: the id in the path is a
 * ULID a signed-in member can read out of their own workspace's history, so a
 * route that answered "that invitation exists but is not yours" differently from
 * "no such invitation" would be a queryable oracle for other people's pending
 * invitations.
 *
 * It deliberately does NOT say "link". The caller reached this from a banner,
 * not from an email, and telling them their link is dead when they never had one
 * would send them looking for something that does not exist.
 */
export const INVITATION_NOT_YOURS_BODY = {
  error: 'not_found',
  message:
    'This invitation is no longer open. It may have been accepted, declined, or withdrawn, or it may have lapsed. Ask whoever invited you for a new one.',
} as const;

type PendingRow = {
  invite_id: string;
  workspace_id: string;
  role: string;
  project_ids: string[];
  invited_by: string;
  invited_by_name: string | null;
  invited_at: Date;
  expires_at: Date;
};

/**
 * The caller's verified address, or `null` when they have none.
 *
 * Separated from the queries that use it so both routes and the list ask the
 * same question in the same words — the shape `readMembers` and Task 16's counts
 * settled on when a count and a directory disagreed about who was visible.
 */
async function verifiedEmailOf(db: Queryable, userId: string): Promise<string | null> {
  const { rows } = await db.query<{ email: string }>(
    'SELECT "email" FROM "user" WHERE "id" = $1 AND "emailVerified" = true',
    [userId],
  );
  return rows[0]?.email ?? null;
}

/**
 * The pending invitations for one verified address.
 *
 * The join to `invite_tokens` is INNER and the expiry comparison is here rather
 * than in the caller, which is the difference between this and the admin
 * listing's LEFT JOIN. That listing deliberately shows an invitation whose token
 * row is missing, because an admin needs to see a dead invitation in order to
 * withdraw it and send another. The INVITED person can do nothing with one: an
 * invitation with no live credential row cannot be accepted (both doors spend
 * that row) and offering Accept beside it would be a button that always fails.
 *
 * `expires_at` is read from the CREDENTIAL and not from the projection, because
 * a projection reads no clock and therefore cannot hold one — the reasoning is
 * in `migrations/1787961600000_proj-invites.sql` at length.
 *
 * `LEFT JOIN "user"` for the inviter, so an invitation whose inviter's account
 * has since gone still reaches the person it names, with `invitedByName: null`.
 * `builder-reads.ts` DROPS a membership row in that situation, and this is the
 * opposite choice made deliberately: dropping a membership loses a roster entry
 * the workspace can re-add, and dropping an invitation would silently withhold
 * something only its recipient can act on.
 */
async function pendingFor(db: Queryable, email: string): Promise<PendingRow[]> {
  const { rows } = await db.query<PendingRow>(
    `SELECT i.invite_id, i.workspace_id, i.role, i.project_ids, i.invited_by,
            u."name" AS invited_by_name, i.invited_at, t.expires_at
       FROM proj_invites i
       JOIN invite_tokens t ON t.invite_id = i.invite_id
       LEFT JOIN "user" u ON u."id" = i.invited_by
      WHERE i.status = 'pending'
        AND i.channel = 'email'
        AND lower(i.address) = lower($1)
        AND t.expires_at > now()
      ORDER BY i.invited_at DESC, i.invite_id DESC`,
    [email],
  );
  return rows;
}

/**
 * One invitation, if it is this address's to act on. `null` for every other
 * reason, which the callers answer with one body.
 *
 * It reuses `pendingFor` rather than writing a second, nearly-identical `WHERE`:
 * the scope rule — verified address, email channel, still pending, credential
 * still live — is stated once, so the list cannot show something the actions
 * refuse or the reverse. A caller has a handful of invitations at most, so
 * filtering in the process costs nothing that a second query would save.
 */
async function actionableInvitation(
  db: Queryable,
  email: string,
  inviteId: string,
): Promise<PendingRow | null> {
  const rows = await pendingFor(db, email);
  return rows.find((row) => row.invite_id === inviteId) ?? null;
}

export function registerMyInvitationRoutes(
  app: FastifyInstance,
  deps: MyInvitationRouteDeps,
  requireSession: preHandlerHookHandler,
): void {
  /**
   * The caller's own pending invitations. Never a token: the raw one is
   * unrecoverable (sha256 at rest, one copy, spent at mint), which is also why
   * Accept below is a door of its own rather than a link to the token route.
   */
  app.get('/v1/me/invitations', { preHandler: requireSession }, async (request) => {
    const email = await verifiedEmailOf(deps.pool, request.currentUserId);
    // No verified address is an EMPTY LIST and not a refusal. Nothing is being
    // withheld — an invitation names an address, and this account has proven
    // none, so there is genuinely nothing addressed to it.
    if (email === null) return { invitations: [] };
    const rows = await pendingFor(deps.pool, email);
    return {
      invitations: await Promise.all(
        rows.map(async (row) => ({
          inviteId: row.invite_id,
          workspaceId: row.workspace_id,
          workspaceName: await workspaceNameFromLedger(deps.pool, row.workspace_id),
          role: row.role,
          // The inviter's raw user id is NOT served. It was, until a reviewer
          // asked who reads it: nothing does — the client type does not declare
          // it and the mapper drops it — and it is a user identifier handed to
          // somebody who is not yet in the workspace. An unread field is not
          // free when it is also a disclosure.
          invitedByName: row.invited_by_name,
          invitedAt: row.invited_at.toISOString(),
          expiresAt: row.expires_at.toISOString(),
        })),
      ),
    };
  });

  /**
   * Accept, from the banner rather than from the link.
   *
   * The proof is the caller's verified address matching the one the invitation
   * names — STRICTLY NARROWER than possession of a link, which a forward hands
   * to somebody the invitation never named. The semantics are shared with the
   * token door (`../invites/acceptance.ts`), so the two cannot drift.
   */
  app.post<{ Params: { inviteId: string } }>(
    '/v1/me/invitations/:inviteId/accept',
    { preHandler: requireSession },
    async (request, reply) => {
      const email = await verifiedEmailOf(deps.pool, request.currentUserId);
      if (email === null) return reply.code(404).send(INVITATION_NOT_YOURS_BODY);
      const invite = await actionableInvitation(deps.pool, email, request.params.inviteId);
      if (invite === null) return reply.code(404).send(INVITATION_NOT_YOURS_BODY);

      // THE SPEND, before a single event is appended, exactly as the token door
      // does it and for the same reason: one conditional DELETE is one
      // transaction, so concurrent acceptances — by link, from the banner, or
      // one of each — cannot both get the row. A spend that ran after the append
      // would be a deletion two appenders had already raced past.
      if (!(await spendInviteTokenByInviteId(deps.pool, request.params.inviteId))) {
        return reply.code(404).send(INVITATION_NOT_YOURS_BODY);
      }
      const acceptable: AcceptableInvite = {
        invite_id: invite.invite_id,
        workspace_id: invite.workspace_id,
        role: invite.role,
        project_ids: invite.project_ids,
      };
      const workspaceId = await appendAcceptance(deps, acceptable, request.currentUserId);
      return { workspaceId };
    },
  );

  /**
   * Decline — a real state change, and the thing the product could not express
   * before this task.
   *
   * It spends the credential row too, and that is not symmetry for its own sake:
   * without it the emailed link would keep opening an invitation its recipient
   * had just refused, and the decline and a concurrent acceptance would race in
   * a projection rather than in the database. With it, the three outcomes of one
   * invitation are mutually exclusive by construction.
   *
   * `invite.declined` is refused from every client door
   * (`INVITE_DECLINE_IS_THE_SERVERS_REASON`), so this append goes through the
   * server's internal door — the same reason acceptance does.
   */
  app.post<{ Params: { inviteId: string } }>(
    '/v1/me/invitations/:inviteId/decline',
    { preHandler: requireSession },
    async (request, reply) => {
      const email = await verifiedEmailOf(deps.pool, request.currentUserId);
      if (email === null) return reply.code(404).send(INVITATION_NOT_YOURS_BODY);
      const invite = await actionableInvitation(deps.pool, email, request.params.inviteId);
      if (invite === null) return reply.code(404).send(INVITATION_NOT_YOURS_BODY);

      if (!(await spendInviteTokenByInviteId(deps.pool, request.params.inviteId))) {
        return reply.code(404).send(INVITATION_NOT_YOURS_BODY);
      }

      const declined: SubmittedEvent = {
        id: newUlid(),
        workspaceId: invite.workspace_id,
        entity: { kind: 'invite', id: invite.invite_id },
        type: 'invite.declined',
        version: 1,
        payload: { inviteId: invite.invite_id },
        // The ACTOR is the person declining: refusing is their act, and the
        // ledger says so under their name. Envelope-origin is `'server'`
        // because the server is what recorded it, having checked the address —
        // the same divergence the acceptance path carries, for the same reason.
        actorId: request.currentUserId,
        origin: 'server',
        clientTime: new Date().toISOString(),
      };
      const [result] = await deps.serverAppend([declined]);
      if (result === undefined || result.status !== 'committed') {
        throw new Error(
          `invite decline for ${invite.invite_id} did not commit: ${JSON.stringify(result)}`,
        );
      }
      // Nothing to navigate to and nothing to say: the invitation is gone from
      // the caller's list, which the client observes by re-reading it.
      return reply.code(204).send();
    },
  );
}
