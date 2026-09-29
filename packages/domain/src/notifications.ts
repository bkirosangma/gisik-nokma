import { z } from 'zod';
import { IST_DAY_REGEX } from './ist-day.js';

/**
 * Notifications are server-owned per-user rows, NOT ledger events (series
 * amendment 14's reasoning, applied): a notification is a message to a
 * person; the fact it points at stays in the ledger. Every payload is
 * .strict() — it carries the originating claim's provenance verbatim and
 * has no field where invented urgency could live.
 *
 * The day shape comes from Plan 1's IST_DAY_REGEX, never a local literal:
 * a notification about a claimed day must agree, character for character,
 * with the day the claim was validated as and the day the calendar places it
 * in. Three copies of one regex is three chances to disagree.
 *
 * Ruling (Plan 9 coordination): a notification row stays UNREDACTED after
 * the recipient's visibility to the underlying ticket is later revoked — "a
 * message you were sent is yours; revocation removes future sight, not
 * letters delivered." This module carries no scrub-on-revoke field or
 * behaviour, and none should be added here.
 *
 * This is a distinct vocabulary from `vocabulary.ts`'s `claim.contested` /
 * `claim.contested_resolved` ledger event types: those are the
 * event-envelope provenance surface (what happened, in the ledger); the
 * `'contested-claim'` NotificationKind below is a message ABOUT one of
 * those events, addressed to a person's inbox. They must never be merged.
 */
export const NOTIFICATION_KINDS = [
  'assignment',
  'mention',
  'contested-claim',
  'date-approaching',
  'stale-ticket',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const nonEmpty = z.string().min(1);

/** A date claim's provenance — the FieldClaim flattened, never summarised. */
export const dateClaimProvenanceSchema = z
  .object({
    date: z.string().regex(IST_DAY_REGEX, 'a claimed date is a day in YYYY-MM-DD form'),
    note: z.string().optional(),
    actorId: nonEmpty,
    clientTime: nonEmpty,
    serverTime: nonEmpty,
  })
  .strict();
export type DateClaimProvenance = z.infer<typeof dateClaimProvenanceSchema>;

export const assignmentNotificationPayloadSchema = z
  .object({
    ticketId: nonEmpty,
    ticketTitle: z.string(),
    assignedBy: nonEmpty,
    eventId: nonEmpty,
    clientTime: nonEmpty,
    serverTime: nonEmpty,
  })
  .strict();
export type AssignmentNotificationPayload = z.infer<typeof assignmentNotificationPayloadSchema>;

export const mentionNotificationPayloadSchema = z
  .object({
    ticketId: nonEmpty,
    ticketTitle: z.string(),
    mentionedBy: nonEmpty,
    eventId: nonEmpty,
    source: z.enum(['comment', 'description']),
    excerpt: z.string(),
    clientTime: nonEmpty,
    serverTime: nonEmpty,
  })
  .strict();
export type MentionNotificationPayload = z.infer<typeof mentionNotificationPayloadSchema>;

/**
 * A mention in a NOTE — its body or one of its comments (owner ruling
 * 2026-09-29, "yes, notify on note mentions").
 *
 * It is a second SHAPE of the `mention` kind, not a sixth kind, and that is the
 * least invasive way to honour "it follows the existing `mention` mute": the
 * kind is what `notification_preferences.mutedKinds`, the inbox's Mentions tab,
 * the `/account` row and the unread count all key on, so one kind means a person
 * who muted mentions is not told about note mentions either, with no second
 * setting and no second SQL filter to keep in step. What differs is the TARGET,
 * so the payload names a note where the ticket shape names a ticket — the two
 * are told apart by which of `noteId` / `ticketId` a payload carries (both
 * schemas are `.strict()`, so a payload with both is refused by each).
 *
 * `source` says where the mention sat: `note` (the body) or `note-comment`. For
 * `note-comment` the comment's id IS `eventId` — the comments projection files a
 * comment under its event id (`projections/ticket-comments.ts`), which is why no
 * `commentId` field exists to drift from it.
 */
export const noteMentionNotificationPayloadSchema = z
  .object({
    noteId: nonEmpty,
    noteTitle: z.string(),
    mentionedBy: nonEmpty,
    eventId: nonEmpty,
    source: z.enum(['note', 'note-comment']),
    excerpt: z.string(),
    clientTime: nonEmpty,
    serverTime: nonEmpty,
  })
  .strict();
export type NoteMentionNotificationPayload = z.infer<typeof noteMentionNotificationPayloadSchema>;

/** True for the note shape of a `mention` payload — the one place the two are told apart. */
export function isNoteMentionPayload(
  payload: MentionNotificationPayload | NoteMentionNotificationPayload,
): payload is NoteMentionNotificationPayload {
  return 'noteId' in payload;
}

export const contestedClaimNotificationPayloadSchema = z
  .object({
    ticketId: nonEmpty,
    rule: nonEmpty,
    reason: nonEmpty,
    claim: z.object({ eventId: nonEmpty, type: nonEmpty, actorId: nonEmpty, clientTime: nonEmpty }).strict(),
    contestEventId: nonEmpty,
    serverTime: nonEmpty,
  })
  .strict();
export type ContestedClaimNotificationPayload = z.infer<typeof contestedClaimNotificationPayloadSchema>;

export const dateApproachingNotificationPayloadSchema = z
  .object({
    ticketId: nonEmpty,
    ticketTitle: z.string(),
    field: z.literal('dueDate'),
    claim: dateClaimProvenanceSchema,
  })
  .strict();
export type DateApproachingNotificationPayload = z.infer<typeof dateApproachingNotificationPayloadSchema>;

export const staleTicketNotificationPayloadSchema = z
  .object({
    ticketId: nonEmpty,
    ticketTitle: z.string(),
    stateId: nonEmpty,
    stateName: z.string().nullable(),
    enteredAt: nonEmpty,
    enteredBy: nonEmpty,
  })
  .strict();
export type StaleTicketNotificationPayload = z.infer<typeof staleTicketNotificationPayloadSchema>;

export const notificationPayloadSchemaByKind = {
  assignment: assignmentNotificationPayloadSchema,
  mention: z.union([mentionNotificationPayloadSchema, noteMentionNotificationPayloadSchema]),
  'contested-claim': contestedClaimNotificationPayloadSchema,
  'date-approaching': dateApproachingNotificationPayloadSchema,
  'stale-ticket': staleTicketNotificationPayloadSchema,
} as const;

export type NotificationPayload =
  | AssignmentNotificationPayload
  | MentionNotificationPayload
  | NoteMentionNotificationPayload
  | ContestedClaimNotificationPayload
  | DateApproachingNotificationPayload
  | StaleTicketNotificationPayload;

export type Notification = {
  id: string;
  userId: string;
  workspaceId: string;
  kind: NotificationKind;
  dedupeKey: string;
  payload: NotificationPayload;
  read: boolean;
  createdAt: string;
};

const notificationBaseSchema = z
  .object({
    id: nonEmpty,
    userId: nonEmpty,
    workspaceId: nonEmpty,
    kind: z.enum(NOTIFICATION_KINDS),
    dedupeKey: nonEmpty,
    payload: z.unknown(),
    read: z.boolean(),
    createdAt: nonEmpty,
  })
  .strict();

/** Boundary parser: validates the payload against its kind's schema. */
export function parseNotification(value: unknown): Notification {
  const base = notificationBaseSchema.parse(value);
  const payload = notificationPayloadSchemaByKind[base.kind].parse(base.payload) as NotificationPayload;
  return { ...base, payload };
}
