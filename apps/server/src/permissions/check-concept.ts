import {
  conceptCreatedPayload,
  conceptItemTaggedPayload,
  conceptLinkedPayload,
  conceptMergedPayload,
  suggestionRejectedPayload,
  type ConceptEventType,
  type EventEnvelope,
} from '@gisik-nokma/domain';
import type { Refusal } from '@gisik-nokma/rule-engine'; // as check-permission.ts:20 and check-purged.ts:2
import { itemsMissingFromTarget } from '../concepts/merge.js';
import type { Queryable } from '../db/queryable.js';
import { hiddenItems, type ItemRef } from '../read/item-visibility.js';
import { openSuggestionIds } from '../read/suggestions.js';
import { LIVE_TICKET_WHERE } from '../read/visible-where.js';
import type { VisibilityContext } from './check-permission.js'; // type-only: erased, so no runtime cycle

export const CONCEPT_RULES = {
  permission: 'permission.concept',
  unknown: 'concept.unknown',
  itemUnknown: 'concept.item-unknown',
  alreadyTagged: 'concept.already-tagged',
  notTagged: 'concept.not-tagged',
  linkExists: 'concept.link-exists',
  linkUnknown: 'concept.link-unknown',
  self: 'concept.self',
  relatedStream: 'concept.related-stream',
  mergeIncomplete: 'concept.merge-incomplete',
} as const;
export const CONCEPT_GUEST_REASON = 'Guests can read concepts but cannot change them.';
export const CONCEPT_UNKNOWN_REASON = 'That concept does not exist or you cannot see it.';
export const CONCEPT_ITEM_UNKNOWN_REASON = 'That ticket or note does not exist or you cannot see it.';
export const CONCEPT_RELATED_STREAM_REASON = 'A related link is posted on the concept with the lower id.';
/** KG-D Task 5: ONE answer for an absent suggestion, one this actor cannot see in full, and a rejection whose hashes are not the row's. */
export const SUGGESTION_UNKNOWN_RULE = 'suggestion.unknown';
export const SUGGESTION_UNKNOWN_REASON = 'That suggestion does not exist or you cannot see it.';

/** The merge waits for D's tags (`concepts/merge.ts`); the refusal counts what is still missing. */
export function conceptMergeIncompleteReason(missing: number): string {
  return missing === 1
    ? 'One item in this concept is not yet in the concept it merges into. Add it there first.'
    : `${missing} items in this concept are not yet in the concept it merges into. Add them there first.`;
}

const refuse = (rule: string, reason: string): Refusal => ({ refused: true, rule, reason });

/** The concept's tagged items, live or not: D4 counts live items only, and `hiddenItems` ignores the rest. */
export async function liveConceptItems(db: Queryable, workspaceId: string, conceptId: string): Promise<ItemRef[]> {
  const { rows } = await db.query<{ item_kind: 'ticket' | 'note'; item_id: string }>(
    'SELECT item_kind, item_id FROM proj_concept_items WHERE workspace_id = $1 AND concept_id = $2',
    [workspaceId, conceptId],
  );
  return rows.map((row) => ({ kind: row.item_kind, id: row.item_id }));
}

/** A live concept this actor can see (every live item), or false. ONE answer for absent, deleted and hidden. */
async function seesConcept(db: Queryable, ctx: VisibilityContext, workspaceId: string, conceptId: string): Promise<boolean> {
  const { rows } = await db.query(
    'SELECT 1 FROM proj_concepts WHERE workspace_id = $1 AND concept_id = $2 AND deleted = FALSE',
    [workspaceId, conceptId],
  );
  if (rows.length === 0) return false;
  const items = await liveConceptItems(db, workspaceId, conceptId);
  return (await hiddenItems(db, ctx.eff, ctx.sessionUserId, workspaceId, items)).length === 0;
}

/**
 * The cached suggestion (`sem_suggestions`) with this signature or id in this workspace, when nobody has resolved it
 * (`openSuggestionIds`: a second Confirm would make a second concept from it, 27.551) and the actor sees every live item
 * in it (D4, as the suggestions read decides it, `routes/suggestions.ts`); `null` for absent, resolved and hidden alike.
 * Its `itemHashes` are returned so a rejection can be bound to the row it names.
 */
async function visibleSuggestion(
  db: Queryable,
  ctx: VisibilityContext,
  workspaceId: string,
  where: { signature?: string; id?: string },
): Promise<{ itemHashes: string[] } | null> {
  const { rows } = await db.query<{ id: string; item_kind: ('ticket' | 'note')[]; item_id: string[]; item_hashes: string[] }>(
    'SELECT id, item_kind, item_id, item_hashes FROM sem_suggestions WHERE workspace_id = $1 AND (signature = $2 OR id = $3)',
    [workspaceId, where.signature ?? null, where.id ?? null],
  );
  const row = rows[0];
  if (row === undefined) return null;
  if ((await openSuggestionIds(db, workspaceId, [row.id])).length === 0) return null;
  const items = row.item_id.map((id, index) => ({ kind: row.item_kind[index] as ItemRef['kind'], id }));
  return (await hiddenItems(db, ctx.eff, ctx.sessionUserId, workspaceId, items)).length === 0 ? { itemHashes: row.item_hashes } : null;
}

/** The same multiset of hashes, in any order. */
function sameHashes(a: readonly string[], b: readonly string[]): boolean {
  return [...a].sort().join('\n') === [...b].sort().join('\n');
}

/**
 * `workspace.concept_suggestion_rejected` (spec D §4.2/§4.3, KG-D Task 5): a member who sees every item of the
 * suggestion. A pass of its own, after `checkConceptPermission` in `checkPermission`'s chain, because the event is on
 * the WORKSPACE, which `checkConceptPermission` never reads. The payload's hashes must be the row's: the job skips any
 * group too like a rejected hash set (`pipeline.ts`), so a rejection naming its own hashes could suppress groups its
 * author never saw.
 */
export async function checkSuggestionRejection(env: EventEnvelope, ctx: VisibilityContext): Promise<Refusal | null> {
  if (env.type !== 'workspace.concept_suggestion_rejected') return null;
  if (ctx.eff.workspaceRole === 'guest') return refuse(CONCEPT_RULES.permission, CONCEPT_GUEST_REASON);
  const p = suggestionRejectedPayload.parse(env.payload);
  const seen = await visibleSuggestion(ctx.db, ctx, env.workspaceId, { signature: p.signature });
  return seen !== null && sameHashes(seen.itemHashes, p.itemHashes) ? null : refuse(SUGGESTION_UNKNOWN_RULE, SUGGESTION_UNKNOWN_REASON);
}

async function seesItem(db: Queryable, ctx: VisibilityContext, workspaceId: string, item: ItemRef): Promise<boolean> {
  // LIVE means what hiddenItems means by it, or an item in a deleted project would pass as "seen" (hiddenItems ignores it).
  const sql =
    item.kind === 'ticket'
      ? `SELECT 1 FROM proj_tickets t WHERE t.workspace_id = $1 AND t.ticket_id = $2 AND ${LIVE_TICKET_WHERE}`
      : 'SELECT 1 FROM proj_notes n WHERE n.workspace_id = $1 AND n.note_id = $2 AND n.deleted = FALSE';
  const { rows } = await db.query(sql, [workspaceId, item.id]);
  if (rows.length === 0) return false;
  return (await hiddenItems(db, ctx.eff, ctx.sessionUserId, workspaceId, [item])).length === 0;
}

/**
 * Knowledge Graph spec D §3.3, one pass for the whole `concept` kind, placed after `checkNotePermission`
 * for the reason that one gives (`check-permission.ts:2071-2076`): `checkVisibilityPermission` returns early on a
 * non-ticket kind, so nothing else would ask.
 * - guests: read only;
 * - every write: the actor sees the concept (D4), plus every item or concept the event adds;
 * - the state rules (already tagged, self-link, …) after the audience questions, so a refusal never describes a
 *   concept the actor may not see;
 * - and the two that keep every concept row key on ONE stream (the planner's R1 ruling, 2026-10-05; why in
 *   `concepts/merge.ts`): a related link is posted and removed by the lower id, and a merge waits until the target
 *   holds every live item the merged concept holds.
 */
export async function checkConceptPermission(env: EventEnvelope, ctx: VisibilityContext): Promise<Refusal | null> {
  if (env.entity.kind !== 'concept') return null;
  if (ctx.eff.workspaceRole === 'guest') return refuse(CONCEPT_RULES.permission, CONCEPT_GUEST_REASON);
  const type = env.type as ConceptEventType;
  const ws = env.workspaceId;
  const self = env.entity.id;
  if (type === 'concept.created') {
    // KG-D Task 5: a concept made FROM a suggestion names one this actor sees in full (its items are tagged after).
    const p = conceptCreatedPayload.parse(env.payload);
    if (p.fromSuggestion !== undefined && (await visibleSuggestion(ctx.db, ctx, ws, { id: p.fromSuggestion })) === null) {
      return refuse(SUGGESTION_UNKNOWN_RULE, SUGGESTION_UNKNOWN_REASON);
    }
    return null;
  }
  if (!(await seesConcept(ctx.db, ctx, ws, self))) return refuse(CONCEPT_RULES.unknown, CONCEPT_UNKNOWN_REASON);

  if (type === 'concept.item_tagged' || type === 'concept.item_untagged') {
    const p = conceptItemTaggedPayload.parse(env.payload);
    const item = { kind: p.itemKind, id: p.itemId };
    const tagged =
      (
        await ctx.db.query('SELECT 1 FROM proj_concept_items WHERE concept_id = $1 AND item_kind = $2 AND item_id = $3', [
          self,
          p.itemKind,
          p.itemId,
        ])
      ).rows.length > 0;
    if (type === 'concept.item_tagged') {
      if (!(await seesItem(ctx.db, ctx, ws, item))) return refuse(CONCEPT_RULES.itemUnknown, CONCEPT_ITEM_UNKNOWN_REASON);
      if (tagged) return refuse(CONCEPT_RULES.alreadyTagged, 'That item is already in this concept.');
      return null;
    }
    return tagged ? null : refuse(CONCEPT_RULES.notTagged, 'That item is not in this concept.');
  }

  if (type === 'concept.linked' || type === 'concept.unlinked') {
    const p = conceptLinkedPayload.parse(env.payload);
    if (p.otherId === self) return refuse(CONCEPT_RULES.self, 'A concept cannot be linked to itself.');
    if (!(await seesConcept(ctx.db, ctx, ws, p.otherId))) return refuse(CONCEPT_RULES.unknown, CONCEPT_UNKNOWN_REASON);
    if (p.relation === 'related' && p.otherId < self) return refuse(CONCEPT_RULES.relatedStream, CONCEPT_RELATED_STREAM_REASON);
    // Stored as written, (this concept, the other): `broader` is directed, and `related` only ever comes from the lower id.
    const exists =
      (await ctx.db.query('SELECT 1 FROM proj_concept_links WHERE a = $1 AND b = $2 AND relation = $3', [self, p.otherId, p.relation]))
        .rows.length > 0;
    if (type === 'concept.linked' && exists) return refuse(CONCEPT_RULES.linkExists, 'These concepts are already linked that way.');
    if (type === 'concept.unlinked' && !exists) return refuse(CONCEPT_RULES.linkUnknown, 'These concepts are not linked that way.');
    return null;
  }

  if (type === 'concept.merged') {
    const p = conceptMergedPayload.parse(env.payload);
    if (p.intoId === self) return refuse(CONCEPT_RULES.self, 'A concept cannot be merged into itself.');
    if (!(await seesConcept(ctx.db, ctx, ws, p.intoId))) return refuse(CONCEPT_RULES.unknown, CONCEPT_UNKNOWN_REASON);
    const missing = await itemsMissingFromTarget(ctx.db, ws, self, p.intoId);
    if (missing.length > 0) return refuse(CONCEPT_RULES.mergeIncomplete, conceptMergeIncompleteReason(missing.length));
    return null;
  }
  return null; // renamed, described, deleted: seeing the concept is the whole rule (D2: any member who sees it)
}
