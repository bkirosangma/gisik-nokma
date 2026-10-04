import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import {
  membershipId,
  newUlid,
  parseEvent,
  type EventEnvelope,
  type IngestResult,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { isSyntheticPhoneEmail } from '../auth/synthetic-address.js';
import type { Queryable } from '../db/queryable.js';
import type { ClientIngest } from '../ingest/ingest-service.js';
import { checkPermission, NAMED_PERSON_NOT_IN_WORKSPACE_REASON } from '../permissions/check-permission.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import { isOpenableDraft } from '../visibility/can-open.js';
import type { ServerAppend } from './invites.js';

/** The refusal for a `userId` that is no account at all (case 6.215). */
export const NO_ACCOUNT_REASON = 'That person has no account.';
/** Drafts spec R8: a draft is private to its author, so there is nobody to bring in to see it. */
export const DRAFT_NO_OUTSIDERS_RULE = 'draft.no-outsiders';
export const DRAFT_NO_OUTSIDERS_REASON = 'Publish the ticket before inviting someone from outside';

/** A `ticket.created` that is born a draft (the payload's `draft` flag; a malformed payload is the ingest door's to refuse). */
function isDraftBirth(event: SubmittedEvent): boolean {
  return (
    event.type === 'ticket.created' &&
    typeof event.payload === 'object' &&
    event.payload !== null &&
    (event.payload as { draft?: unknown }).draft === true
  );
}
export const PEOPLE_RULE = 'people.outsider';
export const OUTSIDER_EVENT_MISMATCH_MESSAGE =
  'The claim must be your own ticket.created or ticket.assigned in this workspace, naming this person as the assignee.';

export type LookedUpPerson = {
  userId: string;
  name: string;
  email: string;
  inWorkspace: boolean;
};

/**
 * The ONE account whose REAL email is exactly this address — owner ruling 5
 * (2026-09-29): "have them type up their email, and only show if a user matching
 * that email is found."
 *
 * - EXACT: `lower(email) = lower(trim($1))`. No prefix, no LIKE, no list — a
 *   partial address answers `null` (case 6.203).
 * - VERIFIED only: an address better-auth never verified is not "an account
 *   with that email" (the `my-invitations.ts` rule).
 * - A synthetic phone address never matches (`auth/synthetic-address.ts`),
 *   typed or not: its local part IS a phone number (case 6.207).
 * - NO ROLE and NO GUEST CALLER (R2, owner ruling 2026-09-29): the pickers need
 *   only `inWorkspace`, and a guest is not given a people directory.
 * - TWO case-variant accounts (constructible — `my-invitations.ts` records
 *   why) answer `null` rather than a guess: "the one exact match" does not exist.
 */
export async function lookupPerson(db: Queryable, workspaceId: string, email: string): Promise<LookedUpPerson | null> {
  const wanted = email.trim();
  if (wanted === '' || isSyntheticPhoneEmail(wanted)) return null;
  const { rows } = await db.query<{ id: string; name: string | null; email: string }>(
    `SELECT "id", "name", "email" FROM "user"
      WHERE lower("email") = lower($1) AND "emailVerified" = true
      ORDER BY "id" LIMIT 2`,
    [wanted],
  );
  if (rows.length !== 1) return null;
  const row = rows[0]!;
  if (isSyntheticPhoneEmail(row.email)) return null;
  const eff = await resolveEffectiveRole(db, row.id, workspaceId);
  const name = row.name?.trim() ?? '';
  return {
    userId: row.id,
    name: name === '' ? row.email : name,
    email: row.email,
    inWorkspace: eff.workspaceRole !== null,
  };
}

export type PeopleRouteDeps = {
  pool: Queryable;
  ingest: ClientIngest;
  serverAppend: ServerAppend;
};

function refused(eventId: string, reason: string): IngestResult {
  return { status: 'refused', eventId, rule: PEOPLE_RULE, reason };
}

/** The assignee the caller's claim names, or `null` when it names none. */
function assigneeOf(event: SubmittedEvent): string | null {
  const payload = event.payload as { assigneeId?: unknown };
  return typeof payload.assigneeId === 'string' ? payload.assigneeId : null;
}

/**
 * Finding an account, and pulling an outsider in (access plan W6–W8).
 *
 * ## Why a route, and not two events in one batch (deviation D5)
 *
 * `ingestAll` commits each event on its own and no check sees its batch
 * (`../ingest/ingest-service.ts:432-446`), so "a grant paired with an
 * assignment in the same batch" is not a thing a check could recognise. The
 * grant goes through the INTERNAL door (a member may not grant through the
 * client door — `check-permission.ts:716` — and still may not: case 6.209),
 * the caller's own claim through the GATED door as the caller.
 *
 * ## The pre-flight is the gate, dry
 *
 * The outsider is not yet a member, so the real gate answers the named-person
 * refusal for a claim that would otherwise pass: that check is the LAST one on
 * both arms. So a dry `checkPermission` answers null (already a member — no
 * grant), the named-person sentence (grant, then submit) or anything else (the
 * answer; nothing granted, case 6.211). No gate rule is restated here. What the
 * gate cannot see — an engine refusal, e.g. a soft-deleted ticket — arrives
 * after the grant and is compensated with `membership.revoked` (case 6.212).
 */
export function registerPeopleRoutes(
  app: FastifyInstance,
  deps: PeopleRouteDeps,
  requireSession: preHandlerHookHandler,
): void {
  app.post<{ Params: { workspaceId: string }; Body: { email: string } }>(
    '/v1/workspaces/:workspaceId/people-lookup',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: { email: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const eff = await requireMember(deps.pool, request.currentUserId, workspaceId);
      // R2 (owner ruling 2026-09-29): a guest may not look people up. The same
      // 404 a non-member gets — the route does not confirm the workspace to them.
      if (eff === null || eff.workspaceRole === 'guest') {
        return reply.status(404).send(READ_NOT_FOUND_BODY);
      }
      return { user: await lookupPerson(deps.pool, workspaceId, request.body.email) };
    },
  );

  app.post<{ Params: { workspaceId: string }; Body: { userId: string; event: unknown } }>(
    '/v1/workspaces/:workspaceId/assign-outsider',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object',
          required: ['userId', 'event'],
          additionalProperties: false,
          properties: { userId: { type: 'string', minLength: 1 }, event: { type: 'object' } },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const callerId = request.currentUserId;
      const { userId } = request.body;
      if ((await requireMember(deps.pool, callerId, workspaceId)) === null) {
        return reply.status(404).send(READ_NOT_FOUND_BODY);
      }

      const parsed = parseEvent(request.body.event);
      if (
        !parsed.ok ||
        (parsed.event.type !== 'ticket.assigned' && parsed.event.type !== 'ticket.created') ||
        parsed.event.workspaceId !== workspaceId ||
        parsed.event.actorId !== callerId ||
        assigneeOf(parsed.event) !== userId
      ) {
        return reply.status(400).send({ error: 'bad_request', message: OUTSIDER_EVENT_MISMATCH_MESSAGE });
      }
      const event = parsed.event;

      const { rows: account } = await deps.pool.query('SELECT 1 FROM "user" WHERE "id" = $1', [userId]);
      if (account.length === 0) {
        return reply.status(422).send({ result: refused(event.id, NO_ACCOUNT_REASON) });
      }

      const dry: EventEnvelope = { ...event, serverTime: new Date().toISOString(), seq: 0 };
      const preflight = await checkPermission(dry, { db: deps.pool, sessionUserId: callerId });
      const needsGrant = preflight !== null && preflight.reason === NAMED_PERSON_NOT_IN_WORKSPACE_REASON;
      if (preflight !== null && !needsGrant) {
        return reply.status(422).send({
          result: { status: 'refused', eventId: event.id, rule: preflight.rule, reason: preflight.reason } satisfies IngestResult,
        });
      }
      // Drafts (spec 1, R8): nobody from outside is pulled into a draft, whether or not they need a guest grant. Anyone
      // but the author has already been answered as for an unknown ticket by the preflight above, so what reaches
      // this line is the author's own act, and refusing it BEFORE the grant means no guest is added and then removed.
      if (isDraftBirth(event) || (event.type === 'ticket.assigned' && (await isOpenableDraft(deps.pool, callerId, event.entity.id)))) {
        return reply.status(422).send({
          result: {
            status: 'refused', eventId: event.id, rule: DRAFT_NO_OUTSIDERS_RULE, reason: DRAFT_NO_OUTSIDERS_REASON,
          } satisfies IngestResult,
        });
      }

      const membership = { kind: 'membership' as const, id: membershipId(workspaceId, userId) };
      const serverEvent = (type: string, payload: unknown): SubmittedEvent => ({
        id: newUlid(),
        workspaceId,
        entity: membership,
        type,
        version: 1,
        payload,
        // The caller's act (they pulled this person in), recorded by the server —
        // the acceptance precedent (`../invites/acceptance.ts:129-149`).
        actorId: callerId,
        origin: 'server',
        clientTime: new Date().toISOString(),
      });

      if (needsGrant) {
        const [granted] = await deps.serverAppend([serverEvent('membership.granted', { userId, role: 'guest' })]);
        if (granted?.status !== 'committed') {
          throw new Error(`assign-outsider could not grant ${userId} in ${workspaceId}: ${JSON.stringify(granted)}`);
        }
      }

      const [result] = await deps.ingest.ingestClientBatch([event], callerId);
      if (result === undefined) throw new Error('ingest returned no result for the outsider assignment');
      if (result.status === 'committed') return reply.status(200).send({ result });

      if (needsGrant) {
        // Compensation (case 6.212). A failure here THROWS — a 500, alerted by
        // the app's error handler — because a guest with no assignment has been
        // left in the workspace and an operator must see it.
        const [revoked] = await deps.serverAppend([serverEvent('membership.revoked', { userId })]);
        if (revoked?.status !== 'committed') {
          throw new Error(`assign-outsider could not revoke ${userId} in ${workspaceId}: ${JSON.stringify(revoked)}`);
        }
      }
      return reply.status(422).send({ result });
    },
  );
}
