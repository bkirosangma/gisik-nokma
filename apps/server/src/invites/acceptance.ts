import { membershipId, newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import type { ServerAppend } from '../routes/invites.js';

/**
 * The acceptance sequence, and the token spend keyed on an invitation id —
 * the two pieces TWO doors now need.
 *
 * ## Why there are two doors at all, when the plan text named one
 *
 * Task 17's dispatch says Accept "reuses the existing `/v1/invites/:token/accept`
 * flow (do not reimplement it)". The `/workspaces` banner cannot call that route,
 * and the reason is a measured property of the design rather than an oversight:
 * **`invite_tokens` stores `sha256(token)` and the raw token exists in exactly
 * one place for exactly one moment — the body of the 201 that minted it.** It is
 * not in the ledger, not in the table, and not recoverable from either. A
 * caller-scoped list therefore has no token to serve and could not be given one
 * without changing how invitations are stored.
 *
 * So the flow is not reimplemented; it is SHARED. This module holds the whole
 * acceptance semantics once, and the two doors differ only in the proof they
 * demand:
 *
 * - `/v1/invites/:token/accept` — proof is **possession of the link**.
 * - `/v1/me/invitations/:inviteId/accept` — proof is **a verified email equal to
 *   the address the invitation names**.
 *
 * The second is STRICTLY NARROWER than the first, which is why adding it widens
 * nothing: a forwarded link admits somebody the invitation was never addressed
 * to, and a verified address cannot. Both spend the same credential row through
 * the same conditional DELETE, so an acceptance-by-link and an
 * acceptance-or-decline-from-the-banner race in the database rather than in a
 * projection — see `spendInviteTokenByInviteId`.
 *
 * `INVITE_ACCEPTANCE_IS_THE_SERVERS_REASON` is untouched by this and stays
 * exactly as strong: it refuses CLIENT-SUBMITTED `invite.accepted`, and both
 * doors append through the server's internal door. The threat it names — an
 * admin binding any pending invitation to any user, having never seen the link —
 * is unreachable from a door that can only ever act for the caller's own
 * verified address.
 */
export type AcceptanceDeps = {
  pool: Queryable;
  serverAppend: ServerAppend;
};

/**
 * The columns the acceptance sequence reads. Both doors resolve their own row —
 * one from a token hash, one from an invitation id and an email — and hand it
 * here, so this function never decides WHO may accept and cannot be mistaken for
 * the gate.
 */
export type AcceptableInvite = {
  invite_id: string;
  workspace_id: string;
  role: string;
  project_ids: string[];
};

/**
 * Spend the credential row for an invitation, atomically, keyed on the
 * invitation id instead of a token hash.
 *
 * This is the sibling of `consumeInviteToken` in `../routes/invites.ts` and the
 * two are deliberately the same statement with a different key column: ONE
 * conditional `DELETE ... RETURNING` is one transaction, so concurrent callers
 * serialise on the row lock and exactly one of them gets a row back. That is
 * what makes an invitation single-use, and it is the ONLY thing that does — a
 * prior read cannot stop two people acting at once, and the 2026-09-01
 * measurement of three parallel acceptances committing three memberships is in
 * `migrations/1787961600000_proj-invites.sql` for anyone tempted to replace it
 * with a status check.
 *
 * Because both doors spend the SAME row, the three live outcomes of one
 * invitation — accepted by link, accepted from the banner, declined from the
 * banner — are mutually exclusive by construction, and the loser of any race
 * gets `false` here rather than a second commit.
 *
 * `expires_at > now()` is repeated from the read that preceded it, exactly as
 * the token-keyed sibling repeats it and for the same reason: a row that lapsed
 * in the milliseconds since is not one this call may spend. Both comparisons are
 * `timestamptz` against `now()` INSIDE Postgres, between two absolute instants,
 * so no process's zone setting can move them — there is no clock-sensitive
 * assertion here for a test to vary `TZ` against.
 */
export async function spendInviteTokenByInviteId(
  db: Queryable,
  inviteId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ invite_id: string }>(
    `DELETE FROM invite_tokens
      WHERE invite_id = $1 AND expires_at > now()
      RETURNING invite_id`,
    [inviteId],
  );
  return rows.length > 0;
}

/**
 * Append the acceptance sequence for one invitation, as the accepting person.
 *
 * Moved here verbatim from `registerInviteRoutes`' accept handler when the
 * caller-scoped door arrived; every judgement it carries was made there and is
 * preserved with its reasoning, because the reasoning is what stops the next
 * editor undoing it.
 *
 * The caller has ALREADY spent the token row. This function appends and nothing
 * else: it makes no authorization decision, so neither door can accidentally
 * inherit the other's.
 */
export async function appendAcceptance(
  deps: AcceptanceDeps,
  invite: AcceptableInvite,
  userId: string,
): Promise<string> {
  const workspaceId = invite.workspace_id;
  const clientTime = new Date().toISOString();
  const serverEvent = (
    entity: SubmittedEvent['entity'],
    type: string,
    payload: unknown,
  ): SubmittedEvent => ({
    id: newUlid(),
    workspaceId,
    entity,
    type,
    version: 1,
    payload,
    // The ACTOR is the accepting person: accepting is their act. The
    // AUTHORIZATION traces through `inviteId` to the admin's attributed
    // `invite.sent`, which is what a history view shows when the grant
    // unfolds. Envelope-origin is `'server'` because the server is what
    // recorded it — the two fields answer different questions and this is
    // the one place in the product where they visibly diverge.
    actorId: userId,
    origin: 'server',
    clientTime,
  });

  // Membership read through `resolveEffectiveRole` and nothing else: a
  // project-scope row in `proj_memberships` survives `membership.revoked` by
  // design, so a direct query would report a stranger as a member.
  const existing = await resolveEffectiveRole(deps.pool, userId, workspaceId);

  const sequence: SubmittedEvent[] = [
    serverEvent({ kind: 'invite', id: invite.invite_id }, 'invite.accepted', {
      inviteId: invite.invite_id,
      userId,
    }),
  ];
  if (existing.workspaceRole === null) {
    sequence.push(
      serverEvent(
        { kind: 'membership', id: membershipId(workspaceId, userId) },
        'membership.granted',
        { userId, role: invite.role },
      ),
    );
  }
  // The projects the invitation promised — appended for a newcomer and for
  // an existing NON-GUEST member, because an admin authored that promise
  // and putting a member on a project is coherent with any role they hold.
  //
  // **Withheld from someone who is a GUEST and stays one**, and that is the
  // hole this guard closes rather than a nicety. `inviteSentPayload` refuses
  // `projectIds` on a guest INVITATION — "a guest reaches work through
  // visibility.set explicit lists, so a project association would promise
  // something membership no longer means" — but that refusal keys on the
  // invitation's role, not on the acceptor's. MEASURED before this line
  // existed: an existing guest accepting a perfectly legal MEMBER invitation
  // carrying a project kept their guest role (the rule above) and got the
  // project row anyway, so the 2026-08-27 collapse's inert association grew
  // back through the accept door with no event looking wrong.
  //
  // Written against the role the person will actually HOLD, not against the
  // invitation's — the invitation's role is the field that was already
  // checked and already insufficient.
  const resultingRole = existing.workspaceRole ?? invite.role;
  const projectIds = resultingRole === 'guest' ? [] : invite.project_ids;
  for (const projectId of projectIds) {
    sequence.push(
      serverEvent({ kind: 'project', id: projectId }, 'project.member_added', {
        userId,
        projectAdmin: false,
      }),
    );
  }

  const results = await deps.serverAppend(sequence);
  // Length first, then each result: a short array would make the per-result
  // loop pass over exactly the events it never saw.
  if (results.length !== sequence.length) {
    throw new Error(
      `invite acceptance appended ${sequence.length} events for invite ${invite.invite_id} ` +
        `and got ${results.length} results back`,
    );
  }
  results.forEach((result, index) => {
    if (result.status !== 'committed') {
      throw new Error(
        `invite acceptance for ${invite.invite_id} failed at event ${index} ` +
          `(${sequence[index]?.type ?? 'unknown'}): ${JSON.stringify(result)}`,
      );
    }
  });

  return workspaceId;
}
