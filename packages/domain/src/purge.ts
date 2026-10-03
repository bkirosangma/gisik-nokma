import type { DocTextOptions } from './doc-text.js';
import type { EventEnvelope } from './envelope.js';
import { PURGEABLE_KINDS, type LifecycleKind } from './lifecycle.js';

/**
 * The purge's shared vocabulary (trash series Plan 2; spec §5.3, §5.4, §5.6,
 * §5.7). Domain-level because the server door (Plan 2), the replica (Plan 3) and
 * the renderer (Plan 3) all speak it.
 */

/** The door's answer for any claim about an erased item (spec §5.7). */
export const PURGED_REASON = 'This item was permanently deleted.';

/** The door's answer for a `purge.completed` submitted by anyone but the purge. */
export const PURGE_SERVER_ONLY_REASON = 'Only the permanent-deletion sweep can record a purge.';

/** What a chip to an erased item renders as, in search text now and on screen in Plan 3 (spec §5.6). */
export const PURGED_ITEM_LABEL = 'Deleted item';

/**
 * The payload a purged ticket's `ticket.created` is REDACTED to (spec §5.4). The
 * row is kept, not deleted, so `row_number()` over the numbering rows
 * (`apps/server/src/read/ticket-numbers.ts`'s `NUMBERING_ROWS_SQL`) still counts
 * it and no later ticket is renumbered. `purge_ledger` builds the same object in
 * SQL; the trigger accepts nothing else.
 */
export function redactedTicketCreatedPayload(
  projectId: string,
  draft?: true,
): { projectId: string; purged: true; draft?: true } {
  // Drafts T2: a DRAFT's creation keeps its marker, so the key query (which does not count a draft's
  // creation) still does not count it after a purge. `purge_ledger` builds the same object in SQL.
  return draft === true ? { projectId, purged: true, draft: true } : { projectId, purged: true };
}

/**
 * True exactly for a redacted `ticket.created`. Every replay reader of
 * `ticket.created` asks this FIRST and produces no ticket from it — the payload
 * no longer satisfies `ticketCreatedPayload` (no `typeId`, `parentId`, `title`).
 * `=== true`, not truthiness: the flag is written by one SQL statement as a JSON
 * boolean, and anything else is not that statement's row.
 */
export function isRedactedTicketCreated(env: Pick<EventEnvelope, 'type' | 'payload'>): boolean {
  if (env.type !== 'ticket.created') return false;
  const payload = env.payload;
  if (payload === null || typeof payload !== 'object') return false;
  return (payload as { purged?: unknown }).purged === true;
}

/**
 * A purged ticket's `ticket.published` is KEPT, redacted (drafts T2): it is a numbering row, and deleting it
 * would shift every later key in the project down by one.
 */
export function redactedTicketPublishedPayload(projectId: string): { projectId: string; purged: true } {
  return { projectId, purged: true };
}

/**
 * True exactly for a redacted `ticket.published` (`=== true`, for `isRedactedTicketCreated`'s reason). Every
 * replay reader that asks `isRedactedTicketCreated` first asks this too: the payload no longer satisfies the
 * strict `ticketPublishedPayload`.
 */
export function isRedactedTicketPublished(env: Pick<EventEnvelope, 'type' | 'payload'>): boolean {
  if (env.type !== 'ticket.published') return false;
  const payload = env.payload;
  if (payload === null || typeof payload !== 'object') return false;
  return (payload as { purged?: unknown }).purged === true;
}

/**
 * The rule id every purge refusal carries. Declared by trash Plan 2 in
 * `apps/server/src/purge/check-purged.ts`; moved here by Plan 3 because the
 * DEVICE must recognise it (the outbox turns such a refusal into a notice) and
 * `packages/sync-client` may not import `apps/server`. The server re-exports
 * this constant; nothing else spells the string.
 */
export const PURGE_RULE = 'purge.erased';

/** The most ids one `POST /v1/purged-lookup` accepts. Every caller chunks at this size. */
export const PURGED_LOOKUP_MAX_IDS = 500;

/** One erased item as the lookup names it: its kind and id, and nothing else. */
export type PurgedRef = { kind: LifecycleKind; id: string };

/** The one predicate every chip renderer asks (the `DocTextOptions` shape Plan 2 gave search). */
export type PurgedPredicate = NonNullable<DocTextOptions['isPurged']>;

/**
 * What a device shows for an offline change it removed from its outbox because
 * the item it was about was permanently deleted (spec §5.7: "dropped from its
 * outbox with a visible notice — never silently").
 */
export const PURGED_OUTBOX_NOTICE =
  'A change to an item that was permanently deleted could not be saved, and was removed.';

const PURGEABLE: readonly string[] = PURGEABLE_KINDS;

/** A wire entry of the lookup's answer, read defensively: a lifecycle kind and a non-empty id. */
export function isPurgedRef(value: unknown): value is PurgedRef {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { kind?: unknown; id?: unknown };
  return (
    typeof candidate.kind === 'string' &&
    PURGEABLE.includes(candidate.kind) &&
    typeof candidate.id === 'string' &&
    candidate.id !== ''
  );
}
