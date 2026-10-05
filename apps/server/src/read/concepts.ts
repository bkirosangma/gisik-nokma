import type { ConceptAudienceResponse, ConceptItemView, ConceptLinkView, ConceptView } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole, type EffectiveRole } from '../permissions/effective-role.js';
import { hiddenItems, type ItemRef } from './item-visibility.js';
import { cardKeysFor } from './ticket-cards.js';
import { LIVE_TICKET_WHERE } from './visible-where.js';

const key = (item: ItemRef): string => `${item.kind}:${item.id}`;

/** §3.2 "workspace members only", read as non-guests (plan Task 4, G11): who sees a concept with no live item. */
function seesEmptyConcept(eff: EffectiveRole): boolean {
  return eff.workspaceRole !== null && eff.workspaceRole !== 'guest';
}

/**
 * Spec D §3.2 (D4), at READ time: of the workspace's live concepts (or of `conceptIds`), the ones this viewer sees,
 * each with its LIVE item count. A concept is seen when every live item in it is visible; an empty one (no live
 * item) by non-guests only. ONE `hiddenItems` call over the union of every concept's items, so a list costs two
 * queries per item kind, not two per concept. Nothing is cached: an audience that narrows after a tag is answered
 * by the next read (Review Focus 1, 27.468).
 */
export async function visibleConcepts(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  workspaceId: string,
  conceptIds?: readonly string[],
): Promise<Map<string, number>> {
  const { rows } = await db.query<{ concept_id: string; item_kind: 'ticket' | 'note' | null; item_id: string | null }>(
    `SELECT c.concept_id, i.item_kind, i.item_id
       FROM proj_concepts c LEFT JOIN proj_concept_items i ON i.concept_id = c.concept_id
      WHERE c.workspace_id = $1 AND c.deleted = FALSE AND ($2::text[] IS NULL OR c.concept_id = ANY ($2::text[]))`,
    [workspaceId, conceptIds === undefined ? null : [...conceptIds]],
  );
  const itemsOf = new Map<string, ItemRef[]>();
  for (const row of rows) {
    const list = itemsOf.get(row.concept_id) ?? [];
    if (row.item_kind !== null && row.item_id !== null) list.push({ kind: row.item_kind, id: row.item_id });
    itemsOf.set(row.concept_id, list);
  }
  const all = [...itemsOf.values()].flat();
  const hidden = new Set((await hiddenItems(db, eff, userId, workspaceId, all)).map(key));
  const live = new Set((await liveOf(db, workspaceId, all)).map(key));
  const out = new Map<string, number>();
  for (const [conceptId, items] of itemsOf) {
    const liveItems = items.filter((item) => live.has(key(item)));
    if (liveItems.length === 0 ? seesEmptyConcept(eff) : liveItems.every((item) => !hidden.has(key(item)))) out.set(conceptId, liveItems.length);
  }
  return out;
}

/** The ids of {@link visibleConcepts}: the concepts this viewer sees, of the workspace's or of `conceptIds`. */
export async function visibleConceptIds(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  workspaceId: string,
  conceptIds?: readonly string[],
): Promise<Set<string>> {
  return new Set((await visibleConcepts(db, eff, userId, workspaceId, conceptIds)).keys());
}

/** The live subset of `items` (trashed and absent items do not count toward D4 or toward "empty"). */
async function liveOf(db: Queryable, workspaceId: string, items: readonly ItemRef[]): Promise<ItemRef[]> {
  const tickets = items.filter((item) => item.kind === 'ticket').map((item) => item.id);
  const notes = items.filter((item) => item.kind === 'note').map((item) => item.id);
  const out: ItemRef[] = [];
  if (tickets.length > 0) {
    const { rows } = await db.query<{ id: string }>(
      `SELECT t.ticket_id AS id FROM proj_tickets t
        WHERE t.workspace_id = $1 AND t.ticket_id = ANY ($2::text[]) AND ${LIVE_TICKET_WHERE}`,
      [workspaceId, tickets],
    );
    out.push(...rows.map((row) => ({ kind: 'ticket' as const, id: row.id })));
  }
  if (notes.length > 0) {
    const { rows } = await db.query<{ id: string }>(
      'SELECT note_id AS id FROM proj_notes WHERE workspace_id = $1 AND note_id = ANY ($2::text[]) AND deleted = FALSE',
      [workspaceId, notes],
    );
    out.push(...rows.map((row) => ({ kind: 'note' as const, id: row.id })));
  }
  return out;
}

/**
 * Whether this viewer may name `items` to a concept read: every one LIVE and visible to them. `hiddenItems` alone
 * ignores an absent or trashed item, so it would answer "seen" for a random id and "hidden" for a real one, which
 * tells the two apart; this is the door's `seesItem` (`permissions/check-concept.ts`), so a refused read and a
 * refused tag mean the same thing (27.470, 27.482).
 */
export async function seesLiveItems(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  workspaceId: string,
  items: readonly ItemRef[],
): Promise<boolean> {
  const wanted = new Set(items.map(key));
  const live = await liveOf(db, workspaceId, items);
  if (new Set(live.map(key)).size !== wanted.size) return false;
  return (await hiddenItems(db, eff, userId, workspaceId, live)).length === 0;
}

/**
 * One concept as this viewer may read it, or `null` (absent, deleted and hidden alike), composed in four steps:
 * 1. the live concept row;
 * 2. D4: `visibleConceptIds(…, [id])`;
 * 3. its LIVE items, labelled (a ticket by its key and title, `read/ticket-cards.ts` `cardKeysFor`; a note by its
 *    title). A trashed item keeps its tag and is left out until a restore (Review Focus 3);
 * 4. its links, keeping only those whose other concept this viewer sees. A hidden one is DROPPED, not redacted: the
 *    link would name it, and a concept's name is content.
 */
export async function readConceptView(db: Queryable, eff: EffectiveRole, userId: string, conceptId: string): Promise<ConceptView | null> {
  const concept = await db.query<{
    workspace_id: string;
    name: string;
    summary: string;
    created_by: string;
    created_at: Date;
    origin: string;
    from_suggestion: string | null;
  }>(
    `SELECT workspace_id, name, summary, created_by, created_at, origin, from_suggestion
       FROM proj_concepts WHERE concept_id = $1 AND deleted = FALSE`,
    [conceptId],
  );
  const row = concept.rows[0];
  if (row === undefined) return null;
  const workspaceId = row.workspace_id;
  if (!(await visibleConceptIds(db, eff, userId, workspaceId, [conceptId])).has(conceptId)) return null;

  const tagged = await db.query<{ item_kind: 'ticket' | 'note'; item_id: string; tagged_by: string; tagged_at: Date; origin: string }>(
    `SELECT item_kind, item_id, tagged_by, tagged_at, origin FROM proj_concept_items
      WHERE workspace_id = $1 AND concept_id = $2 ORDER BY tagged_at, item_kind, item_id`,
    [workspaceId, conceptId],
  );
  const live = new Set((await liveOf(db, workspaceId, tagged.rows.map((r) => ({ kind: r.item_kind, id: r.item_id })))).map(key));
  const liveRows = tagged.rows.filter((r) => live.has(`${r.item_kind}:${r.item_id}`));
  const labels = await itemLabels(db, workspaceId, liveRows.map((r) => ({ kind: r.item_kind, id: r.item_id })));
  const items: ConceptItemView[] = liveRows.map((r) => ({
    kind: r.item_kind,
    id: r.item_id,
    label: labels.get(`${r.item_kind}:${r.item_id}`) ?? '',
    taggedBy: r.tagged_by,
    taggedAt: r.tagged_at.toISOString(),
    origin: r.origin,
  }));

  const linkRows = await db.query<{ a: string; b: string; relation: 'broader' | 'related' }>(
    'SELECT a, b, relation FROM proj_concept_links WHERE workspace_id = $1 AND (a = $2 OR b = $2) ORDER BY relation, a, b',
    [workspaceId, conceptId],
  );
  const others = linkRows.rows.map((link) => (link.a === conceptId ? link.b : link.a));
  const seen = others.length === 0 ? new Set<string>() : await visibleConceptIds(db, eff, userId, workspaceId, others);
  const names = new Map(
    (
      await db.query<{ concept_id: string; name: string }>('SELECT concept_id, name FROM proj_concepts WHERE concept_id = ANY ($1::text[])', [
        [...seen],
      ])
    ).rows.map((r) => [r.concept_id, r.name]),
  );
  const links: ConceptLinkView[] = [];
  for (const link of linkRows.rows) {
    const otherId = link.a === conceptId ? link.b : link.a;
    if (!seen.has(otherId)) continue;
    // A `broader` row (a, b) says b is broader than a (`events/concept-events.ts`); `related` has no direction.
    const direction = link.relation === 'related' ? 'related' : link.a === conceptId ? 'broader' : 'narrower';
    links.push({ otherId, otherName: names.get(otherId) ?? '', relation: link.relation, direction });
  }

  return {
    id: conceptId,
    name: row.name,
    summary: row.summary,
    itemCount: items.length,
    createdBy: row.created_by,
    origin: row.origin,
    workspaceId,
    createdAt: row.created_at.toISOString(),
    fromSuggestion: row.from_suggestion,
    items,
    links,
  };
}

/** A ticket's `<key> <title>` (the title alone when it has no key, as `read/deleted-items.ts` labels one); a note's title. */
async function itemLabels(db: Queryable, workspaceId: string, items: readonly ItemRef[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ticketIds = items.filter((item) => item.kind === 'ticket').map((item) => item.id);
  const noteIds = items.filter((item) => item.kind === 'note').map((item) => item.id);
  if (ticketIds.length > 0) {
    const { rows } = await db.query<{ ticket_id: string; workspace_id: string; project_id: string; title: string | null }>(
      `SELECT ticket_id, workspace_id, project_id, fields -> 'title' ->> 'value' AS title
         FROM proj_tickets WHERE workspace_id = $1 AND ticket_id = ANY ($2::text[])`,
      [workspaceId, ticketIds],
    );
    const keys = await cardKeysFor(db, rows);
    for (const row of rows) {
      const ticketKey = keys.get(row.ticket_id) ?? null;
      const title = row.title ?? '';
      out.set(`ticket:${row.ticket_id}`, ticketKey === null ? title : `${ticketKey} ${title}`);
    }
  }
  if (noteIds.length > 0) {
    const { rows } = await db.query<{ note_id: string; title: string }>(
      'SELECT note_id, title FROM proj_notes WHERE workspace_id = $1 AND note_id = ANY ($2::text[])',
      [workspaceId, noteIds],
    );
    for (const row of rows) out.set(`note:${row.note_id}`, row.title);
  }
  return out;
}

/**
 * "Fewer people will see this concept: <after> of <members> members" (§3.2): who sees the concept now (`before`) and
 * with `add` tagged too (`after`). `members` counts the workspace's people at workspace scope, guests included (the
 * roster `routes/builder-reads.ts` reads). Each person is asked D4's question as the reads ask it (`hiddenItems`
 * over the LIVE items, the empty-concept rule for none), so the preview cannot disagree with what they will be
 * served. One role resolution and two `hiddenItems` calls per person: a preview, read before a write, not a list.
 */
export async function conceptAudience(
  db: Queryable,
  workspaceId: string,
  conceptId: string | null,
  add: readonly ItemRef[],
): Promise<ConceptAudienceResponse> {
  const roster = await db.query<{ user_id: string }>(
    `SELECT user_id FROM proj_memberships WHERE workspace_id = $1 AND scope_kind = 'workspace' ORDER BY user_id`,
    [workspaceId],
  );
  const current =
    conceptId === null
      ? []
      : (
          await db.query<{ item_kind: 'ticket' | 'note'; item_id: string }>(
            'SELECT item_kind, item_id FROM proj_concept_items WHERE workspace_id = $1 AND concept_id = $2',
            [workspaceId, conceptId],
          )
        ).rows.map((row) => ({ kind: row.item_kind, id: row.item_id }));
  const liveBefore = await liveOf(db, workspaceId, current);
  const liveAfter = await liveOf(db, workspaceId, [...current, ...add]);
  let before = 0;
  let after = 0;
  for (const { user_id: userId } of roster.rows) {
    const eff = await resolveEffectiveRole(db, userId, workspaceId);
    const sees = async (items: ItemRef[]) =>
      items.length === 0 ? seesEmptyConcept(eff) : (await hiddenItems(db, eff, userId, workspaceId, items)).length === 0;
    if (await sees(liveBefore)) before += 1;
    if (await sees(liveAfter)) after += 1;
  }
  return { conceptId, members: roster.rows.length, before, after };
}
