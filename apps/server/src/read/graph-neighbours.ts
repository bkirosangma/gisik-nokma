import {
  GRAPH_RING_PAGE, GROUP_OF_EDGE_KIND, GROUP_RANK, compareRingEntries, graphRef, inGraphScope, parseGraphRef,
  type GraphEdgeKind, type GraphEdgeView, type GraphGroup, type GraphItemKind, type GraphItemView, type GraphRingResponse, type StateCategory,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { readActorNames, readActorNamesForGuest } from '../routes/builder-reads.js';
import { workspaceIdentityFromLedger } from '../workspaces/workspace-name.js';
import { visibleConceptIds } from './concepts.js';
import { requireMember } from './membership.js';
import { NOTE_HOME_SQL, NOTE_PROJECT_LIVE_WHERE } from './notes.js';
import { SqlParams } from './sql-params.js';
import { cardKeysFor } from './ticket-cards.js';
import { visibleSuggestions } from './suggestions.js';
import { visibleProjects } from './visible-projects.js';
import { LIVE_TICKET_WHERE, visibleNotesWhere, visibleTicketsWhere } from './visible-where.js';

/**
 * ONE RING of the Knowledge Graph around a centre (spec C §2.2): the items at exactly `hops` steps, the edges from the
 * previous ring into them, and the edges among them. Stateless: the walk is recomputed from the centre on every call,
 * so a client can ask for any ring and the server holds nothing between calls.
 *
 * ## Visibility is decided per WORKSPACE, by the predicates every other read uses
 *
 * A ring can span workspaces (a person connects them), so each item is resolved in its own workspace with the viewer's
 * effective role THERE (`requireMember`), through `visibleTicketsWhere` / `visibleNotesWhere` / `visibleProjects`, a
 * concept through `visibleConceptIds` (spec D's D4), and a model suggestion through `visibleSuggestions` (members only,
 * every item visible).
 * Nothing here restates who may see what.
 *
 * ## An item the viewer cannot see is never returned, never walked THROUGH, and no edge into it is returned
 *
 * `expand` reads the link tables raw, but an edge is kept only when BOTH ends resolved, and only resolved items join the
 * next frontier. So for visible A → hidden H → visible B, H is absent, A–H is absent, and B is not reached via H
 * (case 27.293). A "1 hidden link" count would leak H's existence (spec A §2.4), so there is none.
 *
 * ## Out of scope = fog, never walked past
 *
 * An item outside the chosen workspaces/projects is returned with `out: true` and is not put in the next frontier (C-scope).
 * The centre is always walked, whatever its scope. People are always in scope (they belong to no workspace).
 */
export type GraphRingRequest = {
  center: { kind: GraphItemKind; id: string };
  hops: number;
  workspaceIds: readonly string[];
  projectIds: readonly string[];
  groups: ReadonlySet<GraphGroup>;
  offset: number;
  /** Tests only (27.297); the route never sets it. */
  pageSize?: number;
};

type Resolved = Omit<GraphItemView, 'hop' | 'out'>;
type RawEdge = { id: string; kind: GraphEdgeKind; from: string; to: string; snippet: string | null; addedById: string | null; addedAt: Date | null; origin: string | null; suggested: boolean };

export function createGraphVisibility(db: Queryable, viewerId: string) {
  const roles = new Map<string, EffectiveRole | null>();
  const names = new Map<string, Map<string, string>>();

  async function roleIn(workspaceId: string): Promise<EffectiveRole | null> {
    if (!roles.has(workspaceId)) roles.set(workspaceId, await requireMember(db, viewerId, workspaceId));
    return roles.get(workspaceId) ?? null;
  }
  /** The label read every "who" in the app uses (owner ruling 2026-09-29: names are not the sensitive part); a guest gets the people on their own tickets, as `builder-reads.ts:814-817` decides. */
  async function namesIn(workspaceId: string): Promise<Map<string, string>> {
    const cached = names.get(workspaceId);
    if (cached !== undefined) return cached;
    const eff = await roleIn(workspaceId);
    const rows = eff === null ? [] : eff.workspaceRole === 'guest' ? await readActorNamesForGuest(db, workspaceId, eff, viewerId) : await readActorNames(db, workspaceId);
    const map = new Map(rows.map((row) => [row.userId, row.displayName]));
    names.set(workspaceId, map);
    return map;
  }
  async function nameOf(userId: string): Promise<string | null> {
    for (const [workspaceId, eff] of roles) {
      if (eff === null) continue;
      const found = (await namesIn(workspaceId)).get(userId);
      if (found !== undefined) return found;
    }
    return null;
  }
  async function groupByWorkspace(table: string, idColumn: string, ids: readonly string[]): Promise<Map<string, string[]>> {
    const grouped = new Map<string, string[]>();
    if (ids.length === 0) return grouped;
    const { rows } = await db.query<{ id: string; workspace_id: string }>(
      `SELECT ${idColumn} AS id, workspace_id FROM ${table} WHERE ${idColumn} = ANY ($1::text[])`,
      [ids],
    );
    for (const row of rows) grouped.set(row.workspace_id, [...(grouped.get(row.workspace_id) ?? []), row.id]);
    return grouped;
  }

  async function resolve(refs: readonly string[]): Promise<Map<string, Resolved>> {
    const out = new Map<string, Resolved>();
    const ids: Record<GraphItemKind, string[]> = { ticket: [], note: [], person: [], project: [], workspace: [], concept: [] };
    for (const ref of new Set(refs)) {
      const parsed = parseGraphRef(ref);
      if (parsed !== null) ids[parsed.kind].push(parsed.id);
    }

    for (const [workspaceId, ticketIds] of await groupByWorkspace('proj_tickets', 'ticket_id', ids.ticket)) {
      const eff = await roleIn(workspaceId);
      if (eff === null) continue;
      const params = new SqlParams();
      const { rows } = await db.query<{ ticket_id: string; workspace_id: string; project_id: string; state_category: StateCategory; title: string | null }>(
        `SELECT t.ticket_id, t.workspace_id, t.project_id, t.state_category, t.fields -> 'title' ->> 'value' AS title
           FROM proj_tickets t JOIN proj_visibility v ON v.ticket_id = t.ticket_id
          WHERE t.workspace_id = ${params.add(workspaceId)} AND t.ticket_id = ANY (${params.add(ticketIds)}::text[])
            AND ${LIVE_TICKET_WHERE} AND ${visibleTicketsWhere(eff, viewerId, params)}`,
        params.toArray(),
      );
      for (const row of rows) {
        const ref = graphRef('ticket', row.ticket_id);
        out.set(ref, { ref, kind: 'ticket', id: row.ticket_id, workspaceId: row.workspace_id, projectId: row.project_id, label: row.title ?? '', title: row.title, category: row.state_category, suggested: false });
      }
    }

    for (const [workspaceId, noteIds] of await groupByWorkspace('proj_notes', 'note_id', ids.note)) {
      const eff = await roleIn(workspaceId);
      if (eff === null) continue;
      const params = new SqlParams();
      const { rows } = await db.query<{ note_id: string; workspace_id: string; home_project_id: string; title: string }>(
        `SELECT n.note_id, n.workspace_id, ${NOTE_HOME_SQL} AS home_project_id, n.title FROM proj_notes n
          WHERE n.workspace_id = ${params.add(workspaceId)} AND n.note_id = ANY (${params.add(noteIds)}::text[])
            AND n.deleted = FALSE AND ${visibleNotesWhere(eff, viewerId, params)} AND ${NOTE_PROJECT_LIVE_WHERE}`,
        params.toArray(),
      );
      for (const row of rows) {
        const ref = graphRef('note', row.note_id);
        out.set(ref, { ref, kind: 'note', id: row.note_id, workspaceId: row.workspace_id, projectId: row.home_project_id === '' ? null : row.home_project_id, label: row.title, title: row.title, category: null, suggested: false });
      }
    }

    for (const [workspaceId, projectIds] of await groupByWorkspace('proj_projects', 'project_id', ids.project)) {
      const eff = await roleIn(workspaceId);
      if (eff === null) continue;
      const wanted = new Set(projectIds);
      for (const project of await visibleProjects(db, eff, workspaceId)) {
        if (!wanted.has(project.projectId)) continue;
        const ref = graphRef('project', project.projectId);
        out.set(ref, { ref, kind: 'project', id: project.projectId, workspaceId, projectId: project.projectId, label: project.name, title: null, category: null, suggested: false });
      }
    }

    for (const workspaceId of ids.workspace) {
      if ((await roleIn(workspaceId)) === null) continue;
      const ref = graphRef('workspace', workspaceId);
      out.set(ref, { ref, kind: 'workspace', id: workspaceId, workspaceId, projectId: null, label: (await workspaceIdentityFromLedger(db, workspaceId)).name ?? '', title: null, category: null, suggested: false });
    }

    for (const userId of ids.person) {
      const name = await nameOf(userId);
      if (name === null) continue; // a person no workspace of the viewer's names is not drawn
      const ref = graphRef('person', userId);
      out.set(ref, { ref, kind: 'person', id: userId, workspaceId: null, projectId: null, label: name, title: null, category: null, suggested: false });
    }
    // Spec D §6 (KG-D Task 6): a concept is drawn only for a reader who sees it, which `visibleConceptIds` decides (D4: every
    // live item visible, an empty concept for non-guests only; a deleted concept for nobody), and nothing here restates.
    for (const [workspaceId, conceptIds] of await groupByWorkspace('proj_concepts', 'concept_id', ids.concept)) {
      const eff = await roleIn(workspaceId);
      if (eff === null) continue;
      const visible = await visibleConceptIds(db, eff, viewerId, workspaceId, conceptIds);
      const { rows } = await db.query<{ concept_id: string; name: string; summary: string }>(
        'SELECT concept_id, name, summary FROM proj_concepts WHERE concept_id = ANY ($1::text[])',
        [[...visible]],
      );
      for (const row of rows) {
        const ref = graphRef('concept', row.concept_id);
        out.set(ref, { ref, kind: 'concept', id: row.concept_id, workspaceId, projectId: null, label: row.name, title: row.summary === '' ? null : row.summary, category: null, suggested: false });
      }
    }
    // Spec D §4.2/§6 (27.507): a concept id that is no concept may be a model suggestion (a `sem_suggestions` id, a ULID like
    // a concept's, never the same one), drawn as a concept with `suggested: true`. `visibleSuggestions` decides who sees it,
    // as it does for the suggestions list: members only, every item visible, and not a rejected or confirmed one, although
    // its row waits for the job's next run.
    const leftover = ids.concept.filter((id) => !out.has(graphRef('concept', id)));
    for (const [workspaceId, suggestionIds] of await groupByWorkspace('sem_suggestions', 'id', leftover)) {
      for (const row of await visibleSuggestions(db, await roleIn(workspaceId), viewerId, workspaceId, suggestionIds)) {
        const ref = graphRef('concept', row.id);
        out.set(ref, { ref, kind: 'concept', id: row.id, workspaceId, projectId: null, label: row.label, title: null, category: null, suggested: true });
      }
    }
    return out;
  }

  /** The card keys of the tickets a response returns: ONE `cardKeysFor` call per read. */
  async function keysFor(items: readonly Resolved[]): Promise<Map<string, string | null>> {
    return cardKeysFor(
      db,
      items.filter((item) => item.kind === 'ticket' && item.workspaceId !== null && item.projectId !== null).map((item) => ({ ticket_id: item.id, workspace_id: item.workspaceId as string, project_id: item.projectId as string })),
    );
  }

  return { roleIn, resolve, nameOf, keysFor };
}

const edgeId = (kind: GraphEdgeKind, from: string, to: string) => `${kind}|${from}|${to}`;

/** A raw edge as every graph read answers it (the ring, `graph/path`): the author's display NAME, never an id, and an ISO date. */
export async function graphEdgeView(vis: ReturnType<typeof createGraphVisibility>, edge: RawEdge): Promise<GraphEdgeView> {
  return {
    id: edge.id, kind: edge.kind, from: edge.from, to: edge.to, snippet: edge.snippet,
    addedBy: edge.addedById === null ? null : await vis.nameOf(edge.addedById),
    addedAt: edge.addedAt === null ? null : edge.addedAt.toISOString(),
    origin: edge.origin, suggested: edge.suggested,
  };
}

/** Every edge touching `frontier` in the enabled groups, UNFILTERED by visibility: the caller keeps an edge only when both ends resolved. */
async function expand(db: Queryable, frontier: readonly string[], groups: ReadonlySet<GraphGroup>, within = false): Promise<RawEdge[]> {
  const ids: Record<GraphItemKind, string[]> = { ticket: [], note: [], person: [], project: [], workspace: [], concept: [] };
  for (const ref of frontier) {
    const parsed = parseGraphRef(ref);
    if (parsed !== null) ids[parsed.kind].push(parsed.id);
  }
  const t = ids.ticket, n = ids.note, p = ids.person, pr = ids.project, w = ids.workspace, c = ids.concept;
  const edges = new Map<string, RawEdge>();
  const add = (kind: GraphEdgeKind, from: string, to: string, extra: Partial<RawEdge> = {}) => {
    const id = edgeId(kind, from, to);
    if (!edges.has(id)) edges.set(id, { id, kind, from, to, snippet: null, addedById: null, addedAt: null, origin: null, suggested: false, ...extra });
  };
  // Spec B's planner ruling: a reference's edge starts at its PARENT item. `source_parent_*` is the ticket or note a comment is filed
  // against, and for a ticket or note source it is the source itself, so one expression covers all three source kinds.
  const sourceRef = (r: RefRow) => graphRef(r.source_parent_kind, r.source_parent_id);

  if (groups.has('structure') && t.length > 0) {
    const { rows } = await db.query<{ ticket_id: string; parent_id: string }>(
      `SELECT ticket_id, parent_id FROM proj_tickets WHERE parent_id IS NOT NULL AND (ticket_id = ANY ($1::text[]) ${within ? 'AND' : 'OR'} parent_id = ANY ($1::text[]))`, [t]);
    for (const r of rows) add('parent', graphRef('ticket', r.parent_id), graphRef('ticket', r.ticket_id));
  }
  const linkKinds = (['blocks', 'relates', 'duplicates'] as const).filter((kind) => groups.has(GROUP_OF_EDGE_KIND[kind]));
  if (linkKinds.length > 0 && t.length > 0) {
    const { rows } = await db.query<{ source_id: string; target_id: string; kind: 'blocks' | 'relates' | 'duplicates'; created_by: string; created_at: Date; origin: string }>(
      `SELECT source_id, target_id, kind, created_by, created_at, origin FROM proj_ticket_links
        WHERE kind = ANY ($2::text[]) AND (source_id = ANY ($1::text[]) ${within ? 'AND' : 'OR'} target_id = ANY ($1::text[]))`, [t, linkKinds]);
    for (const r of rows) add(r.kind, graphRef('ticket', r.source_id), graphRef('ticket', r.target_id), { addedById: r.created_by, addedAt: r.created_at, origin: r.origin });
  }
  if (groups.has('attached') && (t.length > 0 || n.length > 0)) {
    // A note links only to a ticket of its own workspace (18.522): a link written before 18.500 refused it is no edge,
    // even for a viewer who could see both ends, each in its own workspace.
    const { rows } = await db.query<{ note_id: string; ticket_id: string; attached_at: Date }>(
      `SELECT na.note_id, na.ticket_id, na.attached_at FROM proj_note_attachments na
         JOIN proj_notes an ON an.note_id = na.note_id
         JOIN proj_tickets tk ON tk.ticket_id = na.ticket_id AND tk.workspace_id = an.workspace_id
        WHERE na.note_id = ANY ($1::text[]) ${within ? 'AND' : 'OR'} na.ticket_id = ANY ($2::text[])`, [n, t]);
    for (const r of rows) add('attached', graphRef('note', r.note_id), graphRef('ticket', r.ticket_id), { addedAt: r.attached_at });
  }
  type RefRow = {
    source_kind: string; source_id: string; source_parent_kind: 'ticket' | 'note'; source_parent_id: string;
    target_kind: GraphItemKind; target_id: string; snippet: string; updated_by: string; updated_at: Date;
  };
  const refRows = async (targetKinds: string[], extraTarget: string[]) =>
    (await db.query<RefRow>(
      `SELECT source_kind, source_id, source_parent_kind, source_parent_id, target_kind, target_id, snippet, updated_by, updated_at FROM proj_references
        WHERE target_kind = ANY ($4::text[]) AND ${
          within
            ? `((source_parent_kind = 'ticket' AND source_parent_id = ANY ($1::text[])) OR (source_parent_kind = 'note' AND source_parent_id = ANY ($2::text[])))
           AND ((target_kind = 'ticket' AND target_id = ANY ($1::text[])) OR (target_kind = 'note' AND target_id = ANY ($2::text[])) OR (target_kind = 'person' AND target_id = ANY ($3::text[])))`
            : `(
              (target_kind = 'ticket' AND target_id = ANY ($1::text[])) OR (target_kind = 'note' AND target_id = ANY ($2::text[]))
           OR (target_kind = 'person' AND target_id = ANY ($3::text[]))
           OR (source_parent_kind = 'ticket' AND source_parent_id = ANY ($1::text[]))
           OR (source_parent_kind = 'note' AND source_parent_id = ANY ($2::text[])))`
        }
        ORDER BY source_kind, source_id, ordinal`, [t, n, extraTarget, targetKinds])).rows;
  if (groups.has('ref') && (t.length > 0 || n.length > 0)) {
    for (const r of await refRows(['ticket', 'note'], [])) add('ref', sourceRef(r), graphRef(r.target_kind, r.target_id), { snippet: r.snippet, addedById: r.updated_by, addedAt: r.updated_at });
  }
  if (groups.has('people')) {
    if (t.length > 0 || p.length > 0) {
      const { rows } = await db.query<{ ticket_id: string; assignee_id: string }>(
        `SELECT ticket_id, assignee_id FROM proj_tickets WHERE assignee_id IS NOT NULL AND (ticket_id = ANY ($1::text[]) ${within ? 'AND' : 'OR'} assignee_id = ANY ($2::text[]))`, [t, p]);
      for (const r of rows) add('assignee', graphRef('person', r.assignee_id), graphRef('ticket', r.ticket_id));
    }
    if (t.length > 0 || n.length > 0 || p.length > 0) {
      for (const r of await refRows(['person'], p)) add('mention', sourceRef(r), graphRef('person', r.target_id), { snippet: r.snippet, addedById: r.updated_by, addedAt: r.updated_at });
    }
  }
  if (groups.has('projects')) {
    if (t.length > 0 || pr.length > 0) {
      const { rows } = await db.query<{ ticket_id: string; project_id: string }>(
        `SELECT ticket_id, project_id FROM proj_tickets WHERE ticket_id = ANY ($1::text[]) ${within ? 'AND' : 'OR'} project_id = ANY ($2::text[])`, [t, pr]);
      for (const r of rows) add('in', graphRef('project', r.project_id), graphRef('ticket', r.ticket_id));
    }
    if (n.length > 0 || pr.length > 0) {
      // Only a home project of the note's own workspace (18.522), as the item's `projectId` (`NOTE_HOME_SQL`).
      const { rows } = await db.query<{ note_id: string; home_project_id: string }>(
        `SELECT hn.note_id, hn.home_project_id FROM proj_notes hn
           JOIN proj_projects hp ON hp.project_id = hn.home_project_id AND hp.workspace_id = hn.workspace_id
          WHERE hn.note_id = ANY ($1::text[]) ${within ? 'AND' : 'OR'} hn.home_project_id = ANY ($2::text[])`, [n, pr]);
      for (const r of rows) add('in', graphRef('project', r.home_project_id), graphRef('note', r.note_id));
    }
    if (pr.length > 0 || w.length > 0) {
      const { rows } = await db.query<{ project_id: string; workspace_id: string }>(
        `SELECT project_id, workspace_id FROM proj_projects WHERE project_id = ANY ($1::text[]) ${within ? 'AND' : 'OR'} workspace_id = ANY ($2::text[])`, [pr, w]);
      for (const r of rows) add('in', graphRef('workspace', r.workspace_id), graphRef('project', r.project_id));
    }
  }
  // Spec D §6: a concept's tags, from the item side (a ticket or note in the frontier) and from the concept side (a concept in it).
  if (groups.has('concepts') && (t.length > 0 || n.length > 0 || c.length > 0)) {
    const { rows } = await db.query<{ concept_id: string; item_kind: 'ticket' | 'note'; item_id: string; tagged_by: string; tagged_at: Date; origin: string }>(
      `SELECT concept_id, item_kind, item_id, tagged_by, tagged_at, origin FROM proj_concept_items
        WHERE ((item_kind = 'ticket' AND item_id = ANY ($1::text[])) OR (item_kind = 'note' AND item_id = ANY ($2::text[])))
              ${within ? 'AND' : 'OR'} concept_id = ANY ($3::text[])`, [t, n, c]);
    for (const r of rows) add('tag', graphRef('concept', r.concept_id), graphRef(r.item_kind, r.item_id), { addedById: r.tagged_by, addedAt: r.tagged_at, origin: r.origin });
    // A model suggestion's tags (27.507), `suggested: true`. `item_id &&` matches a WHOLE row and ignores the kind, so
    // each item is checked again here, with its kind: an edge is answered only when it touches the frontier (or,
    // `within`, has both ends in it), as every other arm's rows are selected. The emitter stays exact so no read has to
    // rely on `graph-path.ts`'s guard: the path walk also skips an edge with neither end in the frontier (27.552).
    const suggestionRows = await db.query<{ id: string; item_kind: ('ticket' | 'note')[]; item_id: string[] }>(
      `SELECT id, item_kind, item_id FROM sem_suggestions
        WHERE (item_id && $1::text[] OR item_id && $2::text[]) ${within ? 'AND' : 'OR'} id = ANY ($3::text[])`, [t, n, c]);
    const inFrontier = { ticket: new Set(t), note: new Set(n) };
    const conceptsIn = new Set(c);
    for (const r of suggestionRows.rows) {
      r.item_id.forEach((itemId, index) => {
        const kind = r.item_kind[index]!;
        const itemIn = inFrontier[kind].has(itemId);
        const rowIn = conceptsIn.has(r.id);
        if (within ? itemIn && rowIn : itemIn || rowIn) add('tag', graphRef('concept', r.id), graphRef(kind, itemId), { suggested: true });
      });
    }
  }
  return [...edges.values()];
}
/** `expand`, for spec D's path read (`read/graph-path.ts`), which walks layer by layer and needs every layer's edges. */
export { expand as expandGraph };

export async function readGraphRing(db: Queryable, viewerId: string, req: GraphRingRequest): Promise<GraphRingResponse | null> {
  const vis = createGraphVisibility(db, viewerId);
  for (const workspaceId of req.workspaceIds) if ((await vis.roleIn(workspaceId)) === null) return null; // same 404 as an unknown id
  const centerRef = graphRef(req.center.kind, req.center.id);
  const known = await vis.resolve([centerRef]);
  if (!known.has(centerRef)) return null;

  const dist = new Map<string, number>([[centerRef, 0]]);
  const rank = new Map<string, number>();
  let frontier = [centerRef];
  let ring: string[] = [];
  let intoRing: RawEdge[] = [];
  for (let hop = 1; hop <= req.hops && frontier.length > 0; hop += 1) {
    const raw = await expand(db, frontier, req.groups);
    const unseen = [...new Set(raw.flatMap((edge) => [edge.from, edge.to]))].filter((ref) => !known.has(ref));
    for (const [ref, item] of await vis.resolve(unseen)) known.set(ref, item);
    const inFrontier = new Set(frontier);
    const next: string[] = [];
    const edgesIn: RawEdge[] = [];
    for (const edge of raw) {
      if (!known.has(edge.from) || !known.has(edge.to)) continue; // an invisible end: no edge, and no step through it
      if (inFrontier.has(edge.from) === inFrontier.has(edge.to)) continue; // both in the frontier (the previous ring's own edge) or neither
      const far = inFrontier.has(edge.from) ? edge.to : edge.from;
      if (!dist.has(far)) {
        dist.set(far, hop);
        next.push(far);
      }
      if (dist.get(far) !== hop) continue; // an edge back to an earlier ring was returned with that ring
      rank.set(far, Math.min(rank.get(far) ?? Number.POSITIVE_INFINITY, GROUP_RANK[GROUP_OF_EDGE_KIND[edge.kind]]));
      edgesIn.push(edge);
    }
    ring = next;
    intoRing = edgesIn;
    frontier = next.filter((ref) => inGraphScope(known.get(ref)!, req)); // never walk past an out-of-scope item
    if (hop < req.hops && frontier.length === 0) ring = [];
  }
  const centerResolved = known.get(centerRef)!;
  const centerOf = (keys: ReadonlyMap<string, string | null>): GraphItemView => ({ ...centerResolved, label: keys.get(centerResolved.id) ?? centerResolved.label, hop: 0, out: !inGraphScope(centerResolved, req) });
  if (dist.size === 1 || ring.length === 0 || ![...dist.values()].includes(req.hops)) {
    return { hop: req.hops, center: centerOf(await vis.keysFor([centerResolved])), items: [], edges: [], frontier: [], truncated: false, cursor: null };
  }

  const ordered = ring.map((ref) => ({ ref, rank: rank.get(ref) ?? 0 })).sort(compareRingEntries).map((entry) => entry.ref);
  const size = req.pageSize ?? GRAPH_RING_PAGE;
  const upTo = new Set(ordered.slice(0, req.offset + size));
  const page = ordered.slice(req.offset, req.offset + size);
  const onPage = new Set(page);
  const among = (await expand(db, ring, req.groups, true)).filter((edge) => upTo.has(edge.from) && upTo.has(edge.to) && (onPage.has(edge.from) || onPage.has(edge.to)));
  const raw = [...intoRing.filter((edge) => onPage.has(edge.from) || onPage.has(edge.to)), ...among];

  const edges: GraphEdgeView[] = [];
  const seen = new Set<string>();
  for (const edge of raw) {
    if (seen.has(edge.id)) continue;
    seen.add(edge.id);
    edges.push(await graphEdgeView(vis, edge));
  }
  edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // A ticket's card key is only DISPLAYED for the page that is returned (and the centre), and `cardKeysFor` scans the workspace's creations per
  // call, so the walk's resolves skip it (label = title) and the page asks ONCE, the centre with it (27.210, 27.363).
  const pageKeys = await vis.keysFor([centerResolved, ...page.map((ref) => known.get(ref)!)]);
  const items: GraphItemView[] = page.map((ref) => {
    const item = known.get(ref)!;
    return { ...item, label: pageKeys.get(item.id) ?? item.label, hop: req.hops, out: !inGraphScope(item, req) };
  });
  const truncated = ordered.length > req.offset + size;
  return {
    hop: req.hops,
    center: centerOf(pageKeys),
    items,
    edges,
    frontier: items.filter((item) => !item.out).map((item) => item.ref),
    truncated,
    cursor: truncated ? String(req.offset + size) : null,
  };
}
