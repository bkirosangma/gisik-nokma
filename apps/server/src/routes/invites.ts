import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import {
  membershipId,
  newUlid,
  type IngestResult,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { ClientIngest } from '../ingest/ingest-service.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { workspaceNameFromLedger } from '../workspaces/workspace-name.js';

/**
 * The internal, UNGATED append path, handed to this module as a named
 * capability rather than reached for.
 *
 * `AppDeps.ingest` is narrowed to `ClientIngest` precisely so no route can call
 * `ingestBatch` by reflex (`../ingest/ingest-service.ts` says so at length), and
 * that narrowing stays. Acceptance genuinely needs the internal door, and the
 * need is FORCED rather than chosen — every event in the acceptance sequence is
 * refused at the client door, by design:
 *
 * - `invite.accepted` is refused from every client envelope-origin at every
 *   role (`INVITE_ACCEPTANCE_IS_THE_SERVERS_REASON`) — that refusal is the
 *   thing that makes possession of the token the only way in, so routing
 *   acceptance through the client door would mean deleting it.
 * - `membership.granted` is owner/admin only, and the person accepting an
 *   invitation is by definition not yet either.
 * - `project.member_added` needs project-admin rights on the target project,
 *   which the acceptor certainly does not hold.
 *
 * So the capability is declared with a name that says what it is, at one call
 * site, rather than by widening the type that protects every other route. This
 * is the same shape `bootstrapWorkspace` uses for the founding sequence
 * (`InternalAppend`), and for the same reason.
 */
export type ServerAppend = (events: SubmittedEvent[]) => Promise<IngestResult[]>;

export type InviteRouteDeps = {
  pool: Queryable;
  /** The GATED door: issuance goes through it, so the admin-only refusal fires. */
  ingest: ClientIngest;
  /** The internal door: acceptance only. See `ServerAppend`. */
  serverAppend: ServerAppend;
  /** Where the product's web client lives — the link's host. `WEB_ORIGIN`. */
  webOrigin: string;
};

/**
 * How long an unaccepted invitation link opens anything.
 *
 * ## The mechanism is not optional; the DURATION is a product decision
 *
 * Task 14's plan text has no lifetime and no single-use semantics anywhere —
 * word-boundary sweep over its lines: `ttl` 0, `expire` 0, `expiry` 0,
 * `single-use` 0, `one-time` 0, against `invite` 37. What it does say is about
 * STORAGE (the token is not the event id, and `invite_tokens` is excluded from
 * `reset()`), which is correct and orthogonal.
 *
 * An invitation link with no clock and no consumption is a durable, replayable
 * credential. Anyone who ever sees it — a forwarded email, a screenshot, a QR
 * on a noticeboard, a browser history on a shared machine — joins that
 * workspace at the granted role, repeatedly, forever, long after the invitation
 * was meant to lapse. Revocation is an event, so a revoked invitation can be
 * refused; an un-revoked one that nobody remembers sending is indefinitely
 * live, and nobody revokes what they have forgotten.
 *
 * Two cases could not be told apart here — an owner who wants links to lapse
 * and an owner who wants them permanent — and the safe branch is the bound. So
 * the mechanism ships, enforced on both token-addressed routes and reachable on
 * every row (`invite_tokens.expires_at` is NOT NULL, always set, never a
 * nullable check that would pass because no row ever exercised it).
 *
 * **Fourteen days is a default under uncertainty, not a decision the series has
 * taken.** It is one constant, in one place, so changing it is one line.
 * *Owner: the product owner, to confirm or replace. Recorded as case 6.113.*
 */
export const INVITE_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * ONE body for every way an invitation link fails to open, on BOTH
 * token-addressed routes: unknown token, revoked invitation, already-accepted
 * invitation, lapsed invitation, and a token row whose invitation somehow has no
 * projection row.
 *
 * ## Why one body and not the plan text's 404-here-410-there
 *
 * The plan's own principle is that "a dead link that explains *why* it is dead
 * is an oracle", and it applies that principle to `GET` (unknown, revoked and
 * accepted all answer an identical 404) while giving the accept route a `410`
 * for a non-pending invitation. The two cannot both be right, and the second is
 * the one that goes.
 *
 * It also cannot be implemented as written. `410` on a second acceptance
 * assumes the token row is still there to be found — but the plan ALSO deletes
 * that row on acceptance, so an ordinary second attempt finds no row and could
 * only ever answer the unknown-token code. The `410` would be observable on
 * exactly one path: an acceptance whose row-deletion did not land. Shipping a
 * status code whose only real meaning is "the server crashed here once" is
 * worse than not distinguishing at all.
 *
 * So both routes answer 404 with this body. The MESSAGE covers every case
 * without discriminating between them, which is what stops the honest answer
 * from becoming a support ticket: the person is told what to do, and nobody
 * learns which of the five they hit.
 *
 * *Cross-plan: Plan 6 Task 15's `InviteGateway` must branch on 404 alone and
 * must NOT branch on 410, which this route never sends. Owner: Plan 6.*
 */
export const INVITE_NOT_OPENABLE_BODY = {
  error: 'not_found',
  message:
    'This invitation link does not open anything. It may have been used, withdrawn, or lapsed — ask whoever invited you for a new one.',
} as const;

/** The refusal a plain member meets on both admin-only invite doors. */
export const INVITE_ADMIN_ONLY_BODY = {
  error: 'forbidden',
  rule: 'permission.role',
  message: 'Only a workspace owner or admin can see or manage this workspace’s invitations.',
} as const;

/**
 * sha256, hex. The raw token is never stored and never logged; a lost link is
 * reissued, never looked up.
 *
 * A plain hash rather than a password KDF, and that is the right choice HERE for
 * a reason that does not generalise: the input is 32 bytes from
 * `randomBytes` — 256 bits of uniform entropy, not a human-chosen secret — so
 * there is no dictionary and no brute-force to slow down. A KDF would buy
 * nothing and would put a deliberate delay on every anonymous `GET`.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * The redaction the app-wide request logger applies. Exported so it can be
 * tested directly AND observed through a real logger — see `../app.ts`.
 *
 * MEASURED, not assumed: Fastify's default `info`-level request log line
 * contains `req.url` verbatim. With the token in the path — which it must be,
 * because `GET /v1/invites/:token` is Plan 6's pinned contract and cannot be
 * renamed — every issued credential would land in the process log of any
 * deployment running at `info` or below, and log access would become workspace
 * access. The plan text's sentence "the raw token exists only in this response —
 * never in a log line" is true of the mint response and was false of these two
 * routes until this function existed.
 *
 * It rewrites the token SEGMENT and leaves the rest of the path alone, so the
 * operator still sees which route was called and what happened.
 */
export function redactInviteToken(url: string): string {
  return url.replace(/^(\/v1\/invites\/)[^/?#]+/, '$1[redacted]');
}

type TokenRow = { invite_id: string; expires_at: Date };
type InviteRow = {
  invite_id: string;
  workspace_id: string;
  role: 'admin' | 'member' | 'guest';
  status: 'pending' | 'accepted' | 'revoked';
  project_ids: string[];
};

/**
 * The invitation surface: issue, read a link, accept a link, list what is
 * outstanding.
 *
 * ## The two design lines, and what actually enforces them
 *
 * **1. The token is a credential, so it is not the event id and never enters
 * the ledger.** Anyone who can read a workspace's history can read an event id
 * and a payload; if either were the link's token, any member could accept an
 * invitation addressed to somebody else. Lookup is by `sha256(token)` against
 * `invite_tokens`, a table no projection may touch, and the raw token exists in
 * exactly one place for exactly one moment — the body of the 201 that minted it.
 *
 * **2. An invitation is a claim like everything else.** `invite.sent` goes
 * through the GATED client door as the admin who made it, so the admin-only
 * refusal and every payload rule fire exactly as they would for any event.
 * Revocation is an ordinary `POST /v1/events` claim and needs no route here.
 *
 * ## The CONSUME is atomic; only the ordering around it is a choice
 *
 * Two different claims were conflated here until 2026-09-01, and the module's
 * headline sentence — *"the deletion is hygiene and the status check is the
 * guard"* — was the false one. It is true that this route cannot enlist in the
 * LEDGER's transaction: `commitOne` takes its own pool connection, opens its own
 * transaction and commits it. It does not follow that nothing on this path can
 * be atomic. `invite_tokens` is server-owned state and **not** a projection, so
 * this module owns its transactions entirely, and one conditional statement
 * against it is atomic in Postgres by itself:
 *
 * ```sql
 * DELETE FROM invite_tokens WHERE token_hash = $1 AND expires_at > now()
 *   RETURNING invite_id
 * ```
 *
 * At most one presentation of a token can ever get a row back from that.
 * Concurrent presentations queue on the row lock, re-evaluate when the winner
 * commits, and match nothing. **The database decides who spent the link**, not a
 * read this handler took a few awaits earlier.
 *
 * **The status check was never a guard against concurrency, only against
 * sequence.** MEASURED at `0fd416d`, when acceptance read the status and then
 * appended: three parallel `POST /v1/invites/<token>/accept` on ONE token from
 * three accounts all answered 200, `proj_memberships` ended with three `admin`
 * rows, and the ledger held 3× `invite.accepted` and 3× `membership.granted` —
 * in 24 of 25 trials. The record concealed it, too: the projection's own
 * `AND status = 'pending'` drops the 2nd and Nth acceptance, so
 * `proj_invites.accepted_user_id` named ONE person while three had joined and
 * the owner's pending list showed nothing amiss. Case 6.128.
 *
 * So the two checks do two different jobs and neither substitutes for the other:
 * `openableInvite` answers *does this invitation still open anything* (unknown,
 * lapsed, no projection row, revoked, already accepted); the conditional DELETE
 * answers *is this the one presentation that gets to use it*.
 *
 * ### The orderings, and the crash windows they choose
 *
 * - **Mint appends FIRST, then stores the hash.** A crash between leaves a
 *   pending invitation with no token — dead, listable, revocable, and **no
 *   credential exists anywhere**. The reverse ordering would leave a live
 *   credential with no ledger claim behind it: unlistable, unrevocable, and
 *   able to grant membership.
 * - **Accept CONSUMES first, then appends.** This is reversed from what the
 *   module used to do, and the old order is precisely what admitted N joins: a
 *   deletion that runs after the append cannot stop a second appender who is
 *   already past the read. A crash between consume and append now leaves an
 *   invitation that is `pending` in the ledger with no credential — the SAME
 *   residue the mint crash leaves, already served by the pending list's LEFT
 *   JOIN as `expiresAt: null`, revocable and re-issuable through a path that
 *   exists today. **The harm moved from the workspace to the acceptor, and that
 *   is the trade**: an un-membered acceptor is told to ask for another link and
 *   the admin can see the dead invitation in their own list; N silent admin
 *   joins that erase their own evidence has no such path.
 *
 * ### What is still open: a revocation in flight
 *
 * An atomic consume closes the multi-join and does **not** close this, because
 * the revoke lands *after* the consume, not against it. MEASURED, 19 of 20
 * trials: an `invite.revoked` submitted concurrently with an acceptance leaves
 * `proj_invites.status = 'revoked'` and the joiner holding their role — the
 * owner has positive evidence the invitation was withdrawn while the person is
 * inside the workspace. The projection's one-way `pending` door (case 6.118)
 * drops the losing `invite.accepted`, but `membership.granted` is a separate
 * event on a separate entity and nothing drops it. Closing it needs the
 * membership grant and the invitation's status decided in ONE transaction,
 * which means reaching inside the ledger's commit — machinery this surface does
 * not have. **Recorded as case 6.129 rather than papered over.** *Owner: Plan
 * 10, which owns the ingest transaction boundary.*
 *
 * ## What acceptance does NOT do
 *
 * It does not change the workspace role of somebody who already has one. An
 * invitation link is bearer-authorised: whoever holds it may use it, which is
 * the point (the address is a claim about where to reach a person, never an
 * assertion about who they are). But `membership.granted` is an UPSERT keyed on
 * the person, so an owner who opened a guest link addressed to somebody else
 * would demote themselves out of their own workspace, and no event would look
 * wrong. Changing an existing member's role is `membership.granted` submitted by
 * an admin, an attributed act with its own gate; it is not something a link
 * someone forwarded may do. So an existing member's acceptance records
 * `invite.accepted` — the invitation really was consumed — and appends the
 * promised project rows, and leaves their role exactly as it was.
 */
export function registerInviteRoutes(
  app: FastifyInstance,
  deps: InviteRouteDeps,
  requireSession: preHandlerHookHandler,
): void {
  /**
   * Issue an invitation. Admin-only, and admin-only BY THE INGEST GATE rather
   * than by a check here: `invite.sent` is in `ADMIN_ONLY_TYPES`, and submitting
   * through `ingestClientBatch` as the session user is what makes the refusal
   * this route returns the same refusal `POST /v1/events` would have given for
   * the same claim. A second membership check in this handler would be a second
   * answer to one question, free to drift from the first.
   */
  app.post<{ Params: { workspaceId: string }; Body: { address: string; channel: string; role: string; projectIds?: string[] } }>(
    '/v1/workspaces/:workspaceId/invites',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object',
          required: ['address', 'channel', 'role'],
          // The client does not get to name the invitation it mints: `inviteId`
          // is a ULID minted here, and a body naming one is refused rather than
          // silently ignored (`app.ts` sets `removeAdditional: false` for
          // exactly this). A client-chosen inviteId would let somebody file a
          // fresh `invite.sent` onto an existing invitation's entity stream.
          additionalProperties: false,
          properties: {
            address: { type: 'string', minLength: 1 },
            channel: { type: 'string' },
            role: { type: 'string' },
            projectIds: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const { address, channel, role, projectIds } = request.body;
      const inviteId = newUlid();

      const submitted: SubmittedEvent = {
        id: newUlid(),
        workspaceId,
        entity: { kind: 'invite', id: inviteId },
        type: 'invite.sent',
        version: 1,
        // `projectIds` is omitted rather than sent as `[]` when absent: the
        // domain schema refuses the key entirely on a guest invite, and an
        // empty array a client never asked for would be refused as if they had.
        payload: projectIds === undefined
          ? { inviteId, address, channel, role }
          : { inviteId, address, channel, role, projectIds },
        actorId: request.currentUserId,
        // envelope-origin `'web'` — a person's claim that they invited someone,
        // not the server's own record. The gate refuses a client-submitted
        // event wearing the server's provenance.
        origin: 'web',
        clientTime: new Date().toISOString(),
      };

      const [result] = await deps.ingest.ingestClientBatch([submitted], request.currentUserId);
      if (result === undefined) {
        throw new Error('ingest returned no result for the invite.sent event');
      }
      if (result.status !== 'committed') {
        // The ingest layer's own refusal, verbatim — the same contract the
        // founding door publishes. A plain member's `permission.role` and a
        // guest-with-projects parse refusal both arrive here unchanged.
        return reply.code(422).send(result);
      }

      // ONLY NOW does a credential exist. See the docblock on ordering: this
      // line failing leaves a pending invitation nobody can open, which is
      // recoverable (revoke it, invite again); the reverse order would leave an
      // openable link with no claim behind it, which is not.
      const token = randomBytes(32).toString('base64url');
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + INVITE_TOKEN_TTL_MS);
      await deps.pool.query(
        `INSERT INTO invite_tokens (invite_id, token_hash, created_at, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [inviteId, hashToken(token), createdAt.toISOString(), expiresAt.toISOString()],
      );

      // The one and only copy of the raw token leaves here. `expiresAt` rides
      // with it so the admin can be told when the link lapses rather than
      // discovering it from a person who could not get in.
      return reply.code(201).send({
        inviteId,
        url: `${deps.webOrigin}/invite/${token}`,
        expiresAt: expiresAt.toISOString(),
      });
    },
  );

  /**
   * What is behind this link. NO SESSION, deliberately: the token IS the
   * credential, and requiring a session first would mean a person had to create
   * an account before being told which workspace they were being asked to join.
   *
   * It answers the three fields Plan 6 pinned and nothing else. In particular it
   * does not answer the ADDRESS the invitation names: the link may have been
   * forwarded, and echoing somebody's email or phone number back to whoever
   * holds the URL would turn a bearer credential into a disclosure of the
   * invitee's contact details.
   */
  app.get<{ Params: { token: string } }>('/v1/invites/:token', async (request, reply) => {
    const invite = await openableInvite(deps.pool, request.params.token);
    if (invite === null) {
      return reply.code(404).send(INVITE_NOT_OPENABLE_BODY);
    }
    return {
      workspaceId: invite.workspace_id,
      workspaceName: await workspaceNameFromLedger(deps.pool, invite.workspace_id),
      role: invite.role,
    };
  });

  /**
   * Accept. Session required — this is where an address-shaped claim becomes a
   * person, and there is no person until somebody has authenticated. Account
   * creation, if they have none, happened at `/api/auth/*` before they got here;
   * no new auth path exists for invitations, deliberately.
   */
  app.post<{ Params: { token: string } }>(
    '/v1/invites/:token/accept',
    { preHandler: requireSession },
    async (request, reply) => {
      const invite = await openableInvite(deps.pool, request.params.token);
      if (invite === null) {
        // The identical body the GET sends. A second acceptance lands here
        // because the first consumed the token row; a revoked or lapsed one
        // lands here because of the status and expiry checks. Nothing that
        // reaches this line appends anything.
        return reply.code(404).send(INVITE_NOT_OPENABLE_BODY);
      }

      // THE CONSUME, and the only thing that makes this link single-use. The
      // read above says the invitation still opens something; this says THIS
      // presentation is the one that gets to open it. Losing it is a 404 with
      // the same body — "it may have been used" is exactly what happened, and a
      // loser learns nothing about the winner.
      //
      // It runs BEFORE the append on purpose; see the ordering section on the
      // module docblock. A consume that ran after would be a deletion two
      // appenders had already raced past.
      const consumed = await consumeInviteToken(deps.pool, request.params.token);
      if (consumed === null) {
        return reply.code(404).send(INVITE_NOT_OPENABLE_BODY);
      }

      const userId = request.currentUserId;
      const { workspace_id: workspaceId } = invite;
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

      // No deletion here any more: the token row went at the consume, before a
      // single event was appended. A second DELETE would be a no-op that read
      // like a guard.
      return { workspaceId };
    },
  );

  /**
   * The pending list, for the invite-mint screen (added at Plan 6's walk).
   *
   * An admin who can send invitations but cannot see which are outstanding sends
   * the same one twice and cannot withdraw what they cannot name.
   *
   * **No tokens in the response.** The token's one copy went to whoever minted
   * it; a list that re-served credentials would turn a read into an issuance,
   * and would hand every admin a working link to every invitation anyone else
   * had sent. `expiresAt` is served instead, because an invitation that is
   * `pending` in the ledger and lapsed in the credential store is dead, and an
   * admin looking at a list with no expiry column would be reading a list of
   * links, some of which silently no longer work.
   *
   * A LEFT JOIN, so an invitation whose token row is missing still appears —
   * with `expiresAt: null`, which is the mint-crash residue the ordering above
   * deliberately allows. It is dead and it is listed, which is exactly what an
   * admin needs in order to withdraw it and send another.
   */
  app.get<{ Params: { workspaceId: string } }>(
    '/v1/workspaces/:workspaceId/invites',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      // The same rule as sync-down (`../visibility/visible-events-for.ts`),
      // applied to the read path: an invitation's address is PII and reaches
      // owners and admins only. Enforced HERE rather than inherited, because a
      // read route has no ingest gate to defer to.
      const eff = await resolveEffectiveRole(deps.pool, request.currentUserId, workspaceId);
      if (eff.workspaceRole !== 'owner' && eff.workspaceRole !== 'admin') {
        return reply.code(403).send(INVITE_ADMIN_ONLY_BODY);
      }
      const { rows } = await deps.pool.query<{
        invite_id: string;
        address: string;
        channel: string;
        role: string;
        project_ids: string[];
        invited_by: string;
        invited_at: Date;
        expires_at: Date | null;
      }>(
        `SELECT i.invite_id, i.address, i.channel, i.role, i.project_ids,
                i.invited_by, i.invited_at, t.expires_at
           FROM proj_invites i
           LEFT JOIN invite_tokens t ON t.invite_id = i.invite_id
          WHERE i.workspace_id = $1 AND i.status = 'pending'
          ORDER BY i.invited_at DESC, i.invite_id DESC`,
        [workspaceId],
      );
      return {
        invites: rows.map((row) => ({
          inviteId: row.invite_id,
          address: row.address,
          channel: row.channel,
          role: row.role,
          projectIds: row.project_ids,
          invitedBy: row.invited_by,
          invitedAt: row.invited_at.toISOString(),
          expiresAt: row.expires_at === null ? null : row.expires_at.toISOString(),
        })),
      };
    },
  );
}

/**
 * The one resolver both token-addressed routes use, so they cannot disagree
 * about what an openable invitation is.
 *
 * Returns `null` for every way a link fails, and the caller answers all of them
 * with one body. The checks, in order, and each is load-bearing:
 *
 * 1. **A token row matching this hash.** Unknown and spent links stop here.
 * 2. **Not lapsed.** `expires_at > now()`, compared in Postgres, where both
 *    sides are absolute instants.
 * 3. **A projection row for the invitation.** The mint-crash residue in the
 *    other direction, and belt-and-braces.
 * 4. **`status = 'pending'`.** The token row proves only that somebody holds
 *    the link; this is what says the link still opens something. It is what
 *    makes a revoked invitation's surviving token row worthless, and what makes
 *    a hand-restored token row on an accepted invitation open nothing.
 *
 * **This resolver is a READ and it is not, by itself, a guard against two
 * people presenting the same link at the same time** — every concurrent
 * presentation passes all four checks, because none of them writes. The accept
 * route pairs it with `consumeInviteToken`, which is the part the database
 * decides. Naming that distinction here rather than leaving it implied: the
 * sentence "the status check is the guard" was true of this function's
 * SEQUENTIAL behaviour and false of the product, and it cost 24 of 25 trials.
 *
 * Both time comparisons are `timestamptz` against `now()` INSIDE Postgres.
 * That is deliberate and it has a consequence worth naming: the comparison is
 * between two absolute instants, so the process's own zone setting — and the
 * database's, and the operator's locale — cannot move it. There is no
 * clock-sensitive assertion here for a test to vary `TZ` against; a TZ-varying
 * test on this path could only assert that nothing changed, which is a check
 * that cannot fail.
 */
async function openableInvite(db: Queryable, token: string): Promise<InviteRow | null> {
  const { rows: tokenRows } = await db.query<TokenRow>(
    `SELECT invite_id, expires_at FROM invite_tokens
      WHERE token_hash = $1 AND expires_at > now()`,
    [hashToken(token)],
  );
  const tokenRow = tokenRows[0];
  if (tokenRow === undefined) {
    return null;
  }
  const { rows } = await db.query<InviteRow>(
    `SELECT invite_id, workspace_id, role, status, project_ids
       FROM proj_invites WHERE invite_id = $1`,
    [tokenRow.invite_id],
  );
  const invite = rows[0];
  if (invite === undefined || invite.status !== 'pending') {
    return null;
  }
  return invite;
}

/**
 * Spend the token, atomically, and hand back the invitation it opened — or
 * `null` if this presentation was not the one that got it.
 *
 * ## Why this is atomic when the acceptance sequence is not
 *
 * `invite_tokens` is server-owned state, not a projection, and nothing else in
 * the product writes it. So this module owns the row's whole lifetime and does
 * not need to enlist in the ledger's transaction to make a decision about it:
 * ONE statement is one transaction, and a conditional `DELETE ... RETURNING`
 * either matches the row or matches nothing.
 *
 * Under concurrency Postgres serialises the matching backends on the row lock.
 * The first to commit removes the row; every other re-evaluates its `WHERE`
 * against the committed state, finds nothing, and returns zero rows. There is
 * no interleaving in which two callers both get an `invite_id` back, which is
 * the property the accept route needs and the property a prior read can never
 * provide.
 *
 * `expires_at > now()` is repeated here rather than trusted from the read: a
 * token that lapsed in the milliseconds since is not one this call may spend,
 * and re-stating the condition costs nothing because it is on the same row the
 * statement already has to find. It also means the mutation that deletes the
 * expiry clause from `openableInvite` does not silently survive here.
 */
async function consumeInviteToken(db: Queryable, token: string): Promise<string | null> {
  const { rows } = await db.query<{ invite_id: string }>(
    `DELETE FROM invite_tokens
      WHERE token_hash = $1 AND expires_at > now()
      RETURNING invite_id`,
    [hashToken(token)],
  );
  return rows[0]?.invite_id ?? null;
}
