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
import { canReadNoteById } from '../visibility/can-read-note.js';
import { canSee } from '../visibility/can-see.js';
import { deliverToAll, type NotificationTransport } from './transport.js';

/**
 * Turns committed events into messages addressed to people. `ticket.created` with a
 * birth `assigneeId` is an assignment too (W4).
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
/** `note.created` carries an OPTIONAL body; `note.body_set` always does. */
const noteBodyPayloadSchema = z.object({ body: z.record(z.string(), z.unknown()).optional() }).passthrough();
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
/** The note's own read rule (`visibility/can-read-note.ts`) — NOT the ticket rule. */
export type CanReadNoteFn = (db: Queryable, userId: string, noteId: string) => Promise<boolean>;

export type FanoutDeps = {
  pool: Queryable;
  transports: NotificationTransport[];
  canSeeTicket?: CanSeeFn;
  canReadNote?: CanReadNoteFn;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
};

export type NotificationFanout = { onCommitted(event: EventEnvelope): Promise<void> };

const EXCERPT_LENGTH = 140;

export function createNotificationFanout(deps: FanoutDeps): NotificationFanout {
  const canSeeTicket: CanSeeFn = deps.canSeeTicket ?? ((db, userId, ticketId) => canSee(db, userId, ticketId));
  const canReadNote: CanReadNoteFn = deps.canReadNote ?? ((db, userId, noteId) => canReadNoteById(db, userId, noteId));
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
  // `deleted_at`, and the reason that is safe is the DOOR, not this handler:
  // the engine's live-ticket gate (`packages/rule-engine/src/checks/deletion.ts`,
  // `checkTicketLive`, E6-2) refuses every ordinary write against a
  // soft-deleted ticket, so a claim that reaches this fanout COMMITTED against
  // a ticket that was live when the engine read it. Until that gate existed
  // this paragraph asserted the premise and the door did not enforce it —
  // round 2 measured `ticket.assigned` committing against a ticket whose
  // detail door already answered 404, and the peer's inbox serving the result.
  // What remains is the same-instant race, a delete that commits between the
  // engine's read and this one; the `canSeeTicket` guard below cannot close it
  // (`canSee` does not mean "not deleted" — `read/visible-where.ts`), and the
  // inbox read (`notifications/store.ts`) filters nothing, so a letter
  // delivered inside that window stays delivered — the Delete PR's own ruling
  // for letters delivered before a ticket went away. `notifications/sweep.ts`
  // is a PRODUCER (due-soon, stale) that filters at its source; it is not the
  // read that renders this handler's rows, and an earlier wording said it was.
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
    // MCP-everything T2: the body a comment EDIT replaced, so only the mentions the edit adds notify.
    // `null` (every `comment.added` and every description, which keeps "every mention every time")
    // means nothing precedes it. `anchorId` is the id the notification's `eventId` carries: the
    // COMMENT's id for an edit (the thread anchor), the event's own id otherwise. The dedupe key
    // stays `mention:${env.id}:…`, so an edit's rows never collide with the add's.
    previous: unknown = null,
    anchorId: string = env.id,
  ): Promise<void> {
    const before = new Set(previous === null ? [] : extractMentionedUserIds(previous));
    const mentioned = extractMentionedUserIds(doc).filter((userId) => !before.has(userId));
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
            eventId: anchorId,
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

  /**
   * The body a note's PREVIOUS version carried: the nearest earlier
   * `note.created` / `note.body_set` in the note's own stream, by `seq`. Read from
   * the ledger (there is no versions table — `read/notes.ts`'s `listNoteHistory`
   * says why), strictly BEFORE this event, so replaying the fan-out for an event
   * that is not the newest still compares it with the version it replaced.
   * `null` when there is none, and a `note.created` written without a body is
   * `null` too — both mean "no mentions yet".
   */
  async function previousBodyOf(env: EventEnvelope): Promise<unknown> {
    const { rows } = await deps.pool.query<{ body: unknown }>(
      `SELECT payload -> 'body' AS body
         FROM events
        WHERE entity_kind = 'note' AND entity_id = $1 AND seq < $2
          AND type IN ('note.created', 'note.body_set')
        ORDER BY seq DESC
        LIMIT 1`,
      [env.entity.id, env.seq],
    );
    return rows[0]?.body ?? null;
  }

  /**
   * The body a comment carried just BEFORE this edit: its `comment.added`, or its latest earlier
   * `comment.edited` — strictly below this event's seq, in the parent's own stream, so a replayed
   * fan-out compares against the version the edit replaced (the `note.body_set` rule, spec §6).
   */
  async function previousCommentBodyOf(env: EventEnvelope, commentId: string): Promise<unknown> {
    const { rows } = await deps.pool.query<{ body: unknown }>(
      `SELECT payload -> 'body' AS body FROM events
        WHERE entity_kind = $1 AND entity_id = $2 AND seq < $3
          AND ((type = 'comment.added' AND id = $4) OR (type = 'comment.edited' AND payload ->> 'commentId' = $4))
        ORDER BY seq DESC LIMIT 1`,
      [env.entity.kind, env.entity.id, env.seq, commentId],
    );
    return rows[0]?.body ?? null;
  }

  async function noteTitleOf(noteId: string): Promise<string> {
    const { rows } = await deps.pool.query<{ title: string }>('SELECT title FROM proj_notes WHERE note_id = $1', [noteId]);
    return rows[0]?.title ?? '';
  }

  /**
   * Mentions in a NOTE, mirroring `handleMentions` step for step: the same
   * per-recipient isolation, the same silent gate, the same excerpt and the same
   * `mention:${env.id}:${userId}` dedupe key. Three differences, each deliberate:
   *
   * - **The gate is the note's read rule** (`canReadNoteById`), not `canSee`. A
   *   mention of someone who cannot read the note creates no row and no log line.
   * - **Only NEWLY added mentions notify** (`previous` is the body this event
   *   replaced). A note body is autosaved, so the ticket path's "every mention in
   *   the document, every time" would tell the same person again on every save.
   *   A comment's `previous` is `null` on `comment.added` and its prior body on
   *   `comment.edited`.
   * - **The payload names a note** (`noteMentionNotificationPayloadSchema`), and
   *   the kind stays `mention` so the person's mute setting covers it.
   */
  async function handleNoteMentions(
    env: EventEnvelope,
    doc: unknown,
    previous: unknown,
    source: 'note' | 'note-comment',
    anchorId: string = env.id,
  ): Promise<void> {
    const before = new Set(previous === null ? [] : extractMentionedUserIds(previous));
    const added = extractMentionedUserIds(doc).filter((userId) => !before.has(userId));
    if (added.length === 0) return;
    const excerpt = docToPlainText(doc).slice(0, EXCERPT_LENGTH);
    const noteTitle = await noteTitleOf(env.entity.id);
    for (const userId of added) {
      if (userId === env.actorId) continue;
      // Per-recipient isolation and a log line that names the EVENT, never the
      // recipient — the same disclosure argument `handleMentions` makes.
      try {
        if (!(await canReadNote(deps.pool, userId, env.entity.id))) continue;
        await deliverToAll(
          deps.transports,
          compose('mention', userId, env.workspaceId, `mention:${env.id}:${userId}`, {
            noteId: env.entity.id,
            noteTitle,
            mentionedBy: env.actorId,
            eventId: anchorId,
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

  /**
   * `ticket.published` (drafts spec R31): the moment a draft becomes a ticket is the moment the people it already
   * names are told. While it was a draft `canSeeTicket` answered false for everyone, so the birth assignee, every
   * `ticket.assigned` and every description mention were silent; publish is the single event that settles them, and it
   * sends exactly what the ticket's head state says NOW (the assignee it holds, the mentions its description holds).
   *
   * It reuses the two handlers rather than copying them, so the guards are the same ones: nobody is told of their own
   * act (the publisher), an unassigned ticket addresses nobody, and `canSeeTicket` is asked per recipient. The dedupe
   * keys are the ones those handlers derive from the event, so the PUBLISH event id is the key and a redelivery is one
   * row: `assignment:${env.id}` and `mention:${env.id}:${userId}`.
   */
  async function handlePublished(env: EventEnvelope): Promise<void> {
    const state = await getTicketStateFromDb(deps.pool, env.workspaceId, env.entity.id);
    if (state === null) return;
    if (state.assigneeId !== null && state.assigneeId !== undefined) {
      await handleAssigned({ ...env, payload: { assigneeId: state.assigneeId } });
    }
    const description = state.fields['description']?.value;
    if (description !== undefined && description !== null) await handleMentions(env, description, 'description');
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
    // and their claim's provenance. It discloses nothing they did not author or
    // could not see when they made the claim: a `link.reverse` /
    // `link.duplicate` reason does name the other ticket's TITLE, but the
    // claimant passed `canSee` on that ticket at the gate (typed-links T4b
    // withholds that cause from every OTHER viewer, `withhold-link-targets.ts`).
    // A claimant who is told nothing about their own refusal cannot act on it.
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
        if (env.type === 'ticket.assigned' || env.type === 'ticket.created') {
          // `ticket.created` carries the New ticket dialog's birth assignee
          // (W4, owner ruling 2026-09-29). Same handler, same guards (unassigned,
          // self), same `canSee` gate — which the assignee arm (W3) now answers
          // true for them — and the same `assignment:${env.id}` key, so a
          // redelivery is one row. A payload with no `assigneeId` fails the
          // handler's parse and addresses nobody: born unassigned.
          await handleAssigned(env);
        } else if (env.type === 'comment.added' || env.type === 'comment.edited') {
          const parsed = commentPayloadSchema.safeParse(env.payload);
          if (!parsed.success) return;
          const commentId = env.type === 'comment.edited' ? String((env.payload as { commentId?: unknown }).commentId) : null;
          const previous = commentId === null ? null : await previousCommentBodyOf(env, commentId);
          const anchor = commentId ?? env.id;
          if (env.entity.kind === 'note') await handleNoteMentions(env, parsed.data.body, previous, 'note-comment', anchor);
          else await handleMentions(env, parsed.data.body, 'comment', previous, anchor);
        } else if (env.type === 'note.created' || env.type === 'note.body_set') {
          const parsed = noteBodyPayloadSchema.safeParse(env.payload);
          if (parsed.success && parsed.data.body !== undefined) {
            await handleNoteMentions(
              env,
              parsed.data.body,
              env.type === 'note.created' ? null : await previousBodyOf(env),
              'note',
            );
          }
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
        } else if (env.type === 'ticket.link_added' || env.type === 'ticket.link_removed') {
          // Spec A §7: links notify nobody. An explicit arm writes the decision where the next reader of this chain looks; case 27.007 pins that nobody is notified.
        } else if (env.type === 'ticket.published') {
          await handlePublished(env);
        } else if (env.type === 'ticket.discarded') {
          // Drafts: a discard erases a private draft, so it notifies nobody. An explicit arm writes the
          // decision where the next reader of this chain looks; case 28.005 pins that no row appears.
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
