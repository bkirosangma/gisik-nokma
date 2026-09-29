import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Pool } from 'pg';
import { newUlid, parseEvent, type EventEnvelope, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import { alertWithoutWaiting, type ErrorAlerter } from '../alerts/error-alerter.js';
import { isSyntheticPhoneEmail } from '../auth/synthetic-address.js';
import type { Queryable } from '../db/queryable.js';
import type { ClientIngest } from '../ingest/ingest-service.js';
import { appendAcceptance } from '../invites/acceptance.js';
import { addressMatchesAccount, maskAddress } from '../invites/address-match.js';
import { INVITER_FALLBACK, type InviteMailer } from '../invites/invite-mailer.js';
import { checkPermission } from '../permissions/check-permission.js';
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
  /** A real `Pool`, not a `Queryable`: the mint holds a dedicated client for its advisory lock. */
  pool: Pool;
  /** The GATED door: issuance goes through it, so the admin-only refusal fires. */
  ingest: ClientIngest;
  /** The internal door: acceptance only. See `ServerAppend`. */
  serverAppend: ServerAppend;
  /** Where the product's web client lives — the link's host. `WEB_ORIGIN`. */
  webOrigin: string;
  /** Where an EMAIL invitation's letter goes (access plan W5). */
  mailer: InviteMailer;
  /** Told, without waiting, when that letter fails — the invitation still stands. */
  alerter: ErrorAlerter;
};

/** The inviter as a person would name them: account name, else a REAL email, else `INVITER_FALLBACK`. */
async function inviterLabel(db: Queryable, userId: string): Promise<string> {
  const { rows } = await db.query<{ name: string | null; email: string | null }>(
    'SELECT "name", "email" FROM "user" WHERE "id" = $1',
    [userId],
  );
  const name = rows[0]?.name?.trim() ?? '';
  if (name !== '') return name;
  const email = rows[0]?.email ?? '';
  return email !== '' && !isSyntheticPhoneEmail(email) ? email : INVITER_FALLBACK;
}

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

/**
 * R4 (owner ruling 2026-09-29, "refuse"): the link was addressed to another
 * account. `403`, and the body names the address only in its MASKED form
 * (`maskAddress`). Sent only for a link that is still openable, so it never
 * tells anyone that a revoked, lapsed, spent or unknown link is live.
 */
export const INVITE_NOT_YOURS_STATUS = 403;
export function inviteNotYoursBody(masked: string): { error: 'not_yours'; message: string } {
  return {
    error: 'not_yours',
    message: `This invitation was sent to ${masked}. Sign in with that account to accept it.`,
  };
}

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

/**
 * Per-phase wall-clock for one mint, in whole milliseconds. Measurement, not
 * control flow (owner ruling 2026-09-29, S1): the first send after a restart
 * measured 18 s in production and the per-phase split was unknown. Each `mark`
 * charges the time since the previous mark to `name`. What it carries is
 * durations only — never an address, a link or a token.
 */
function phaseTimer(): { mark: (name: string) => void; ms: Record<string, number> } {
  let last = performance.now();
  const ms: Record<string, number> = {};
  return {
    mark(name) {
      const now = performance.now();
      ms[name] = Math.round((ms[name] ?? 0) + (now - last));
      last = now;
    },
    ms,
  };
}

/**
 * The key one mint serialises on. Email addresses compare case-insensitively
 * (the rule `routes/my-invitations.ts` applies), so they are lower-cased here;
 * a phone number is compared as written.
 */
function mintLockKey(workspaceId: string, channel: string, address: string): string {
  return `invite-mint:${workspaceId}:${channel}:${channel === 'email' ? address.toLowerCase() : address}`;
}

/**
 * Run `work` while holding a transaction-scoped advisory lock on `key`, on a
 * dedicated pool client, and hand `work` that client to query through (so its
 * reads and writes see the lock's serialisation). The lock is released by the
 * COMMIT/ROLLBACK, and the client goes back to the pool before this returns.
 * `null` runs `work` unlocked on the pool.
 *
 * A waiter gives up after `lock_timeout` rather than queueing forever: every
 * waiter holds one of the pool's connections, and the holder needs one more for
 * ingest, so an unbounded pile-up of one key could otherwise wedge the pool.
 */
async function withMintLock<T>(pool: Pool, key: string | null, work: (db: Queryable) => Promise<T>): Promise<T> {
  if (key === null) return work(pool);
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // A connection that cannot roll back is destroyed, not returned to the pool.
      broken = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
    }
    throw error;
  } finally {
    client.release(broken);
  }
}

/**
 * The PENDING invitation this request repeats: same workspace, channel and
 * address, the same role and the SAME project set (order-insensitive — `@>` and
 * `<@` together are set equality). A revoked, accepted or declined invitation is
 * never matched. A pending one that differs in role or projects is NOT matched
 * either: that case mints a new invitation as it always did (an open question
 * for the owner). Newest first, because rows minted before this dedupe existed
 * may already be duplicated.
 */
async function findPendingMatch(
  db: Queryable,
  args: { workspaceId: string; channel: string; role: string; address: string; projectIds: string[] },
): Promise<string | null> {
  const { rows } = await db.query<{ invite_id: string }>(
    `SELECT invite_id FROM proj_invites
      WHERE workspace_id = $1 AND channel = $2 AND role = $3 AND status = 'pending'
        AND (CASE WHEN channel = 'email' THEN lower(address) = lower($4) ELSE address = $4 END)
        AND project_ids @> $5::text[] AND project_ids <@ $5::text[]
      ORDER BY invited_at DESC
      LIMIT 1`,
    [args.workspaceId, args.channel, args.role, args.address, args.projectIds],
  );
  return rows[0]?.invite_id ?? null;
}

type TokenRow = { invite_id: string; expires_at: Date };
type InviteRow = {
  invite_id: string;
  workspace_id: string;
  role: 'admin' | 'member' | 'guest';
  status: 'pending' | 'accepted' | 'revoked' | 'declined';
  project_ids: string[];
  /** R4: who the link was addressed to; read for the acceptance check, never served. */
  address: string;
  channel: 'email' | 'phone';
};

/**
 * The invitation PLUS the presented token's own expiry.
 *
 * **The expiry is a fact about the TOKEN, not about the invitation**, and that
 * distinction is why it is carried here rather than added to `InviteRow`:
 * `invite_tokens` is server-owned state with one row per presentation and a
 * `NOT NULL` `expires_at`, while `proj_invites` is the invitation itself and has
 * no such column. A revoked-and-reissued invitation has one `proj_invites` row
 * and several token rows over its life, each with its own window.
 *
 * `openableInvite` has read this column from the beginning — it is the whole
 * point of its `expires_at > now()` predicate — and **threw it away**, because
 * until now nothing downstream needed it. The read now does.
 */
type OpenableInvite = InviteRow & { expires_at: Date };

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
 * the owner's pending list showed nothing amiss. Case 6.129.
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
 * not have. **Recorded as case 6.130 rather than papered over.** *Owner:
 * UNASSIGNED, and said so rather than parked on a plan that would not receive
 * it — the fix belongs in `commitOne` (`../ingest/ingest-service.ts`), Plan 1's
 * surface, and no plan in the series has an open task there.*
 *
 * ## What acceptance does NOT do
 *
 * The link is NOT bearer-authorised any more (R4, owner ruling 2026-09-29): it
 * opens only for the account the address names, matching the `/workspaces`
 * banner door. A different account — including an existing member — is refused
 * `403` before anything is consumed or appended.
 *
 * It does not change the workspace role of somebody who already has one.
 * `membership.granted` is an UPSERT keyed on the person, so an owner who opened
 * a guest link addressed to THEM (their own address, a second invitation) would
 * demote themselves out of their own workspace, and no event would look wrong.
 * Changing an existing member's role is `membership.granted` submitted by an
 * admin, an attributed act with its own gate; it is not something a link may do.
 * So an existing member's acceptance records `invite.accepted` — the invitation
 * really was consumed — and appends the promised project rows, and leaves their
 * role exactly as it was.
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
      const timing = phaseTimer();
      const newInviteId = newUlid();

      const submitted: SubmittedEvent = {
        id: newUlid(),
        workspaceId,
        entity: { kind: 'invite', id: newInviteId },
        type: 'invite.sent',
        version: 1,
        // `projectIds` is omitted rather than sent as `[]` when absent: the
        // domain schema refuses the key entirely on a guest invite, and an
        // empty array a client never asked for would be refused as if they had.
        payload: projectIds === undefined
          ? { inviteId: newInviteId, address, channel, role }
          : { inviteId: newInviteId, address, channel, role, projectIds },
        actorId: request.currentUserId,
        // envelope-origin `'web'` — a person's claim that they invited someone,
        // not the server's own record. The gate refuses a client-submitted
        // event wearing the server's provenance.
        origin: 'web',
        clientTime: new Date().toISOString(),
      };

      // THE AUTHORISATION COMES FIRST, and it is the gate itself run dry — the
      // pre-flight `routes/people.ts` uses for the same reason. A repeat
      // invitation to a pending address ROTATES that invitation's token and
      // hands the new link to the caller, so the dedupe below must never be
      // reachable by anybody the ingest gate would refuse: a plain member or a
      // guest who could rotate a pending invitation would receive a working link
      // to it. Only a `null` (allowed) pre-flight may dedupe; ANY refusal takes
      // the ordinary path below untouched, where ingest produces the 422 itself
      // — byte for byte the body a fresh mint gets, with no second copy of the
      // role rule to drift from the first.
      //
      // The gate reads a PARSED event — a payload the schema would refuse (a guest
      // with projects, an `owner` invitation) reaches it as undefined fields and
      // throws — so the parse runs first, as `routes/people.ts` does, and an
      // unparseable claim simply may not dedupe: ingest refuses it below with its
      // own 422.
      const parsed = parseEvent(submitted);
      const mayDedupe =
        parsed.ok &&
        (await checkPermission(
          { ...parsed.event, serverTime: new Date().toISOString(), seq: 0 } satisfies EventEnvelope,
          { db: deps.pool, sessionUserId: request.currentUserId },
        )) === null;
      timing.mark('gate');

      // ONE request at a time per (workspace, channel, address) inside the
      // check-and-mint, so a double submit makes ONE invitation. The lock is a
      // transaction-scoped advisory lock on a dedicated connection and is
      // released BEFORE the letter is sent: holding a pooled connection across
      // an SMTP send would starve the pool.
      const outcome = await withMintLock(
        deps.pool,
        mayDedupe ? mintLockKey(workspaceId, channel, address) : null,
        async (db) => {
          // Connect, BEGIN and the lock wait: everything since the gate.
          timing.mark('lock');
          const existing = mayDedupe
            ? await findPendingMatch(db, { workspaceId, channel, role, address, projectIds: projectIds ?? [] })
            : null;

          timing.mark('match');
          if (existing === null) {
            const [result] = await deps.ingest.ingestClientBatch([submitted], request.currentUserId);
            if (result === undefined) {
              throw new Error('ingest returned no result for the invite.sent event');
            }
            if (result.status !== 'committed') {
              // The ingest layer's own refusal, verbatim — the same contract the
              // founding door publishes. A plain member's `permission.role` and a
              // guest-with-projects parse refusal both arrive here unchanged.
              return { kind: 'refused' as const, result };
            }
          }
          timing.mark('ingest');
          const inviteId = existing ?? newInviteId;

          // ONLY NOW does a credential exist. See the docblock on ordering: this
          // line failing leaves a pending invitation nobody can open, which is
          // recoverable (revoke it, invite again); the reverse order would leave an
          // openable link with no claim behind it, which is not.
          //
          // On a REPEAT the invitation already exists and only its credential
          // changes: tokens are stored hashed, so the original link cannot be
          // re-sent, and a fresh token REPLACES the old one — the old link stops
          // opening anything. An upsert, because the old row may be expired or
          // may have been swept.
          const token = randomBytes(32).toString('base64url');
          const createdAt = new Date();
          const expiresAt = new Date(createdAt.getTime() + INVITE_TOKEN_TTL_MS);
          await db.query(
            `INSERT INTO invite_tokens (invite_id, token_hash, created_at, expires_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (invite_id) DO UPDATE
               SET token_hash = EXCLUDED.token_hash,
                   created_at = EXCLUDED.created_at,
                   expires_at = EXCLUDED.expires_at`,
            [inviteId, hashToken(token), createdAt.toISOString(), expiresAt.toISOString()],
          );
          timing.mark('token');
          return { kind: 'minted' as const, inviteId, token, expiresAt, deduped: existing !== null };
        },
      );
      timing.mark('commit');
      if (outcome.kind === 'refused') {
        return reply.code(422).send(outcome.result);
      }
      const { inviteId, token, expiresAt, deduped } = outcome;

      // The one and only copy of the raw token leaves here. `expiresAt` rides
      // with it so the admin can be told when the link lapses rather than
      // discovering it from a person who could not get in.
      const url = `${deps.webOrigin}/invite/${token}`;
      // THE LETTER (access plan W5) — email channel only, and only now, AFTER
      // the credential exists (case 6.201): a crash before this line leaves an
      // invitation the admin still holds the link to; a letter sent before the
      // INSERT could carry a link that never opens. A failure is logged and
      // alerted and answered as `emailSent: false` — never a 500, because the
      // invitation itself committed and the one-time link below is still the
      // admin's to hand over (case 6.200). The alert context names the
      // invitation, never the url: the url IS the credential.
      let emailSent = false;
      if (channel === 'email') {
        try {
          const inviterName = await inviterLabel(deps.pool, request.currentUserId);
          const workspaceName = (await workspaceNameFromLedger(deps.pool, workspaceId)) ?? 'a workspace';
          timing.mark('lookups');
          await deps.mailer.send({
            to: address,
            inviterName,
            workspaceName,
            role,
            url,
            expiresAt: expiresAt.toISOString(),
          });
          emailSent = true;
        } catch (error) {
          request.log.error({ err: error, inviteId }, 'invitation email failed');
          alertWithoutWaiting(deps.alerter, `invitation email for invite ${inviteId}`, error);
        }
      }
      timing.mark('send');
      // The measurement the owner asked for (S1): where an invite's seconds go.
      // Durations and ids only.
      request.log.info({ inviteId, channel, deduped, emailSent, timingMs: timing.ms }, 'invite mint timing');
      return reply.code(201).send({ inviteId, url, expiresAt: expiresAt.toISOString(), emailSent });
    },
  );

  /**
   * What is behind this link. NO SESSION, deliberately: the token IS the
   * credential, and requiring a session first would mean a person had to create
   * an account before being told which workspace they were being asked to join.
   *
   * **It answers FOUR fields as of 2026-09-19, and this sentence used to say
   * three.** The fourth is `expiresAt` — when the presented token stops
   * working — added by the `isInvite` expiry ruling. **The sentence is corrected
   * rather than deleted**, because the reason it gave for the other three still
   * binds and a reader must be able to tell which half moved.
   *
   * What it still does NOT answer is the ADDRESS the invitation names: the link
   * may have been forwarded, and echoing somebody's email or phone number back
   * to whoever holds the URL would turn a bearer credential into a disclosure of
   * the invitee's contact details. **`expiresAt` is not that kind of fact** — it
   * is a property of the credential the caller is already holding, and telling
   * them when it lapses is what lets them act before it does. The distinction is
   * the one this docblock already draws; the fourth field lands on the allowed
   * side of it rather than eroding it.
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
      // **ADDED 2026-09-19.** When the presented TOKEN stops working — the
      // `isInvite` expiry ruling. It is the token row's own `expires_at`, the
      // one `openableInvite` matched on, so it cannot disagree with the
      // predicate that admitted this call.
      //
      // It is NOT a disclosure the read's own docblock forbids: what that
      // guards is the ADDRESS the invitation names, which belongs to somebody
      // other than whoever may be holding a forwarded link. This is a fact
      // about the credential the caller is already holding.
      expiresAt: invite.expires_at.toISOString(),
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

      // R4 (owner ruling 2026-09-29: "refuse"). AFTER the openable read, so a
      // revoked, lapsed, spent or unknown link answers its usual 404 and this
      // refusal never says a link is live; BEFORE the consume, so a
      // wrong-account attempt does not burn the link for the person it names.
      const account = await accountOf(deps.pool, request.currentUserId);
      if (account === null || !addressMatchesAccount(invite.channel, invite.address, account)) {
        return reply
          .code(INVITE_NOT_YOURS_STATUS)
          .send(inviteNotYoursBody(maskAddress(invite.channel, invite.address)));
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

      // The acceptance semantics live in ONE place — `../invites/acceptance.ts`
      // — because Task 17 added a second door that needs exactly them: the
      // `/workspaces` banner, which cannot call THIS route because the raw token
      // is unrecoverable (hashed at rest, one copy, gone at mint). Everything
      // that used to be spelled out here is there verbatim, with its reasoning:
      // the actor/origin split, the membership read through
      // `resolveEffectiveRole`, and the guest-stays-guest projectIds guard that
      // closes a measured hole. This handler keeps what is ITS OWN — the proof
      // it demands (possession of the link, and — R4 — being the account it names) and
      // the refusal that follows.
      const workspaceId = await appendAcceptance(deps, invite, request.currentUserId);

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
type AcceptingAccount = {
  email: string;
  emailVerified: boolean;
  phoneNumber: string | null;
  phoneNumberVerified: boolean | null;
};

/** The columns `addressMatchesAccount` compares an invitation's address against. */
async function accountOf(db: Queryable, userId: string): Promise<AcceptingAccount | null> {
  const { rows } = await db.query<AcceptingAccount>(
    `SELECT "email", "emailVerified", "phoneNumber", "phoneNumberVerified" FROM "user" WHERE "id" = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

async function openableInvite(db: Queryable, token: string): Promise<OpenableInvite | null> {
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
    `SELECT invite_id, workspace_id, role, status, project_ids, address, channel
       FROM proj_invites WHERE invite_id = $1`,
    [tokenRow.invite_id],
  );
  const invite = rows[0];
  if (invite === undefined || invite.status !== 'pending') {
    return null;
  }
  // The token's own window rides out with the invitation. It is the row this
  // function just matched on, so the value is the one that admitted the call —
  // not a second read that could disagree with the predicate above.
  return { ...invite, expires_at: tokenRow.expires_at };
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
 * statement already has to find.
 *
 * The repetition is a genuine ALTERNATIVE and not decoration, and the mutation
 * rows say which way round. Dropping this clause alone kills nothing — the read
 * has already refused a lapsed token before control gets here. Dropping the
 * READ's clause alone now kills one case where it used to kill two, because
 * THIS clause catches the accept path. Dropping both kills both. So neither
 * copy is load-bearing on its own and the pair is; whoever removes one should
 * know the other is the only thing left.
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
