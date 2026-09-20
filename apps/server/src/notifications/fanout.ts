import { z } from 'zod';
import {
  docToPlainText,
  extractMentionedUserIds,
  newUlid,
  type EventEnvelope,
  type Notification,
  type NotificationKind,
  type NotificationPayload,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { getTicketStateFromDb } from '../projections/tickets.js';
import { canSee } from '../visibility/can-see.js';
import { deliverToAll, type NotificationTransport } from './transport.js';

/**
 * Turns committed events into messages addressed to people.
 *
 * THE RULING THIS MODULE EXISTS TO HONOUR: the mention gate is SILENT
 * server-side. A mention must never become a probe for who can see a ticket.
 * `canSeeTicket` is applied BEFORE delivery, and a refusal produces no error,
 * no count, no log line naming the unreachable user, and no difference in what
 * the reachable recipients receive. Mentioning someone who cannot see a ticket
 * is, to the mentioning user, indistinguishable from mentioning someone who
 * can. Any editor-side hint about an unreachable mention is client polish and
 * deliberately not built here.
 *
 * SECOND RULING: the gate decides ONCE, at delivery. A row already written
 * stays unredacted when the recipient's visibility is later revoked — "a
 * message you were sent is yours; revocation removes future sight, not letters
 * delivered." Nothing here re-checks a delivered row, and nothing should.
 *
 * `claim.contested` is the deliberate exception to the gate (see
 * `handleContested`), and its exemption is pinned by its own test.
 *
 * DEVIATION FROM PLAN 9 TASK 5's declared cross-plan types, recorded: the plan
 * writes `pool: Pool` in `FanoutDeps` and `db: Pool` in `CanSeeFn`. Both take
 * `Queryable` (`Pool | PoolClient`) here — every collaborator (`canSee`,
 * `getTicketStateFromDb`, `insertNotification`) already takes `Queryable`, and
 * `app.ts` holds the handle as `AppDeps['pool']: Queryable`, so a `Pool` there
 * would not compile. A widening: `Pool` is assignable to `Queryable`.
 */

const assignedPayloadSchema = z.object({ assigneeId: z.string().nullable() }).passthrough();
const commentPayloadSchema = z.object({ body: z.record(z.string(), z.unknown()) }).passthrough();
const fieldSetPayloadSchema = z.object({ fieldId: z.string(), value: z.unknown() }).passthrough();
/** Amendment 16 pins the event; this shape is the Open-questions pin for Plan 10. */
const contestedPayloadSchema = z
  .object({
    originalEvent: z
      .object({
        id: z.string().min(1),
        type: z.string().min(1),
        actorId: z.string().min(1),
        clientTime: z.string().min(1),
      })
      .passthrough(),
    rule: z.string().min(1),
    reason: z.string().min(1),
  })
  .passthrough();

export type CanSeeFn = (db: Queryable, userId: string, ticketId: string) => Promise<boolean>;

export type FanoutDeps = {
  pool: Queryable;
  transports: NotificationTransport[];
  canSeeTicket?: CanSeeFn;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
};

export type NotificationFanout = { onCommitted(event: EventEnvelope): Promise<void> };

const EXCERPT_LENGTH = 140;

export function createNotificationFanout(deps: FanoutDeps): NotificationFanout {
  const canSeeTicket: CanSeeFn = deps.canSeeTicket ?? ((db, userId, ticketId) => canSee(db, userId, ticketId));
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error));

  function compose(
    kind: NotificationKind,
    userId: string,
    workspaceId: string,
    dedupeKey: string,
    payload: NotificationPayload,
  ): Notification {
    return {
      id: newUlid(),
      userId,
      workspaceId,
      kind,
      dedupeKey,
      payload,
      read: false,
      createdAt: now().toISOString(),
    };
  }

  // Reads head state through `getTicketStateFromDb`, which does NOT filter
  // `deleted_at` — deliberately, and not a hole here: this fanout runs on a
  // claim that has just COMMITTED, about a ticket the actor could see at the
  // time, and it addresses the assignee. A ticket deleted in the same instant
  // is a race the `canSeeTicket` guard below cannot close either; the
  // soft-delete predicate belongs to the READS that render notifications
  // (`notifications/sweep.ts` filters at the source), not to an event handler
  // that must not silently swallow a delivery it was told to make.
  async function titleOf(workspaceId: string, ticketId: string): Promise<string> {
    const state = await getTicketStateFromDb(deps.pool, workspaceId, ticketId);
    const value = state?.fields['title']?.value;
    return typeof value === 'string' ? value : '';
  }

  async function handleAssigned(env: EventEnvelope): Promise<void> {
    const parsed = assignedPayloadSchema.safeParse(env.payload);
    if (!parsed.success) return;
    const assigneeId = parsed.data.assigneeId;
    // Unassignment addresses nobody; self-assignment tells you what you just did.
    if (assigneeId === null || assigneeId === env.actorId) return;
    // A notification must not out-leak the ticket it points at.
    if (!(await canSeeTicket(deps.pool, assigneeId, env.entity.id))) return;
    await deliverToAll(
      deps.transports,
      compose('assignment', assigneeId, env.workspaceId, `assignment:${env.id}`, {
        ticketId: env.entity.id,
        ticketTitle: await titleOf(env.workspaceId, env.entity.id),
        assignedBy: env.actorId,
        eventId: env.id,
        clientTime: env.clientTime,
        serverTime: env.serverTime,
      }),
      log,
    );
  }

  async function handleMentions(
    env: EventEnvelope,
    doc: unknown,
    source: 'comment' | 'description',
  ): Promise<void> {
    const mentioned = extractMentionedUserIds(doc);
    if (mentioned.length === 0) return;
    const excerpt = docToPlainText(doc).slice(0, EXCERPT_LENGTH);
    const ticketTitle = await titleOf(env.workspaceId, env.entity.id);
    for (const userId of mentioned) {
      if (userId === env.actorId) continue;
      // PER-RECIPIENT ISOLATION, and it is a disclosure property rather than
      // resilience polish, which is why the catch is here and not only around
      // `onCommitted`. With one outer catch, a `canSeeTicket` that THROWS for
      // the recipient named first in a document would drop that recipient AND
      // everyone named after them — so who receives a mention would be decided
      // by the order the mentions happen to sit in the prose. Two people
      // mentioned in one comment must not be able to silence each other by
      // position, and a disclosure path must not have an order-dependent
      // outcome at all. Pinned by the three-world isolation test in
      // `test/notifications/fanout.test.ts`, which distinguishes
      // "isolated" from "batch aborted" — a single-recipient test cannot.
      //
      // The log line names the EVENT and never the recipient: a lookup that
      // fails must not become the tell the gate below refuses to be.
      try {
        // The silent gate. `continue`, never a log line and never a marker on the
        // siblings' payloads: what the reachable recipients receive is identical
        // whether or not this branch was taken.
        if (!(await canSeeTicket(deps.pool, userId, env.entity.id))) continue;
        await deliverToAll(
          deps.transports,
          compose('mention', userId, env.workspaceId, `mention:${env.id}:${userId}`, {
            ticketId: env.entity.id,
            ticketTitle,
            mentionedBy: env.actorId,
            eventId: env.id,
            source,
            excerpt,
            clientTime: env.clientTime,
            serverTime: env.serverTime,
          }),
          log,
        );
      } catch (error) {
        log(`notification fan-out failed for one mention recipient on event ${env.id}`, error);
      }
    }
  }

  async function handleContested(env: EventEnvelope): Promise<void> {
    const parsed = contestedPayloadSchema.safeParse(env.payload);
    if (!parsed.success) {
      log(`claim.contested payload did not match the pinned shape for event ${env.id} — no notification sent`);
      return;
    }
    const original = parsed.data.originalEvent;
    // NO canSee GATE HERE, deliberately, and its own test pins the absence: the
    // payload is the claimant's own refused event echoed back — rule, reason
    // and their claim's provenance — and carries no title. It discloses nothing
    // they did not themselves author, and a claimant who is told nothing about
    // their own refusal cannot act on it.
    //
    // THE ADDRESSEE IS `original.actorId` — THE CLAIMANT — AND NOT `env.actorId`.
    // That is the whole of the exemption's justification, not an incidental
    // choice of field: `env.actorId` is the SERVER identity that filed the
    // contest (`sync/contest-coherence.ts`'s `buildContestedClaim`, whose
    // docblock records that the two differ by design and that
    // `proj_contested.claimant_id` reads `originalEvent.actorId` for exactly
    // this reason). Address this row to the contest's own actor instead and it
    // delivers rule, reason, ticketId and another person's claim provenance to
    // someone who is NOT its author, through the one branch with no visibility
    // gate. Pinned by a fixture whose contester and claimant are different
    // users; while they were the same user the misrouting was invisible.
    await deliverToAll(
      deps.transports,
      compose('contested-claim', original.actorId, env.workspaceId, `contested-claim:${env.id}`, {
        ticketId: env.entity.id,
        rule: parsed.data.rule,
        reason: parsed.data.reason,
        claim: {
          eventId: original.id,
          type: original.type,
          actorId: original.actorId,
          clientTime: original.clientTime,
        },
        contestEventId: env.id,
        serverTime: env.serverTime,
      }),
      log,
    );
  }

  return {
    async onCommitted(env: EventEnvelope): Promise<void> {
      try {
        if (env.type === 'ticket.assigned') {
          await handleAssigned(env);
        } else if (env.type === 'comment.added') {
          const parsed = commentPayloadSchema.safeParse(env.payload);
          if (parsed.success) await handleMentions(env, parsed.data.body, 'comment');
        } else if (env.type === 'ticket.field_set') {
          const parsed = fieldSetPayloadSchema.safeParse(env.payload);
          if (
            parsed.success &&
            parsed.data.fieldId === 'description' &&
            parsed.data.value !== null &&
            parsed.data.value !== undefined
          ) {
            await handleMentions(env, parsed.data.value, 'description');
          }
        } else if (env.type === 'claim.contested') {
          await handleContested(env);
        }
      } catch (error) {
        // A notification failure must never surface as an ingest failure, and a
        // visibility lookup that throws must not become a different observable
        // outcome than one that answers false. Pinned by
        // `test/notifications/fanout.test.ts`'s throwing-canSeeTicket test —
        // without it this catch is reachable by nothing the suite runs.
        log(`notification fan-out failed for event ${env.id}`, error);
      }
    },
  };
}
