import type { StateCategory } from './workflow.js';

/**
 * The Knowledge Graph's wire vocabulary (spec C §2), shared by the server's ring read and the client engine.
 * The ring ORDER lives here for that reason: the server's page cut and the client's 500-item cap must cut
 * by the same order (§2.2, §3.2), so there is one comparator.
 */
export const GRAPH_ITEM_KINDS = ['ticket', 'note', 'person', 'project', 'workspace', 'concept'] as const;
export type GraphItemKind = (typeof GRAPH_ITEM_KINDS)[number];

export const GRAPH_EDGE_KINDS = ['in', 'parent', 'blocks', 'relates', 'duplicates', 'attached', 'ref', 'mention', 'assignee', 'tag'] as const;
export type GraphEdgeKind = (typeof GRAPH_EDGE_KINDS)[number];

/**
 * The filter groups in RING ORDER (spec §2.2): typed links, then structure (parent, attachments, containment),
 * then references, then people, then concepts. NOT the mockup's `GROUPS_ALL` order
 * (`knowledge-graph-sigma.html:554`, structure before typed links, label order within): the spec rules.
 */
export const GRAPH_GROUPS = ['blocks', 'relates', 'dup', 'structure', 'attached', 'projects', 'ref', 'people', 'concepts'] as const;
export type GraphGroup = (typeof GRAPH_GROUPS)[number];

/** The chips' DISPLAY order, which is the mockup's (`knowledge-graph-sigma.html:554`). */
export const GRAPH_CHIP_ORDER: readonly GraphGroup[] = ['projects', 'structure', 'blocks', 'relates', 'dup', 'attached', 'ref', 'people', 'concepts'];

export const GROUP_OF_EDGE_KIND: Record<GraphEdgeKind, GraphGroup> = {
  in: 'projects',
  parent: 'structure',
  blocks: 'blocks',
  relates: 'relates',
  duplicates: 'dup',
  attached: 'attached',
  ref: 'ref',
  mention: 'people',
  assignee: 'people',
  tag: 'concepts',
};

export const GROUP_RANK = Object.fromEntries(GRAPH_GROUPS.map((group, index) => [group, index])) as Record<GraphGroup, number>;

export const GROUP_LABEL: Record<GraphGroup, string> = {
  projects: 'Projects',
  structure: 'Parent and subtasks',
  blocks: 'Blocks',
  relates: 'Relates to',
  dup: 'Duplicates',
  attached: 'Attached notes',
  ref: 'Links in text',
  people: 'People',
  concepts: 'Concepts',
};

/** Rings past this are refused by the endpoint. "Everything" stops here too: 7 clear rings and 1 of fog. */
export const GRAPH_MAX_HOPS = 8;
/** One page of one ring. The fog budget (§3.2): a ring is never more than this much fog. */
export const GRAPH_RING_PAGE = 2000;

export type GraphItemView = {
  ref: string;
  kind: GraphItemKind;
  id: string;
  /** null for a person: people cross workspaces. */
  workspaceId: string | null;
  /** null for a workspace-level note, a workspace, a person or a concept. */
  projectId: string | null;
  /** The ticket key, a note's title, a person's display name, a project's, workspace's or concept's name. */
  label: string;
  /** A ticket's or note's title, or a concept's summary (null when it has none); null otherwise. */
  title: string | null;
  category: StateCategory | null;
  hop: number;
  /** Outside the chosen workspaces/projects: drawn as fog and never walked past (C-scope). */
  out: boolean;
  /** A concept suggestion (spec D); always false until D. */
  suggested: boolean;
};

export type GraphEdgeView = {
  /** `${kind}|${from}|${to}`: one edge per kind per ordered pair. */
  id: string;
  kind: GraphEdgeKind;
  /** The source item's ref; the sentence reads from here (§2.1). */
  from: string;
  to: string;
  /** A reference's or mention's snippet, the reference marked `[[…]]` (spec B §2.1). */
  snippet: string | null;
  /** A display name, never a user id. */
  addedBy: string | null;
  addedAt: string | null;
  /** The ledger origin of a typed link (`'mcp'` → "via an assistant"); null where the table records none. */
  origin: string | null;
  suggested: boolean;
};

export type GraphRingResponse = {
  hop: number;
  /**
   * The centre itself, keyed and visibility-resolved like a ring item (`hop` 0), on EVERY answer, an empty ring
   * included (planner ruling Q1, 2026-10-05). It is NOT in `items`: a ring is the items at exactly `hop` steps
   * (27.302). The view seeds its store from it, so a centre with no links still has its label.
   */
  center: GraphItemView;
  items: GraphItemView[];
  edges: GraphEdgeView[];
  /** The refs in this page that may be walked from (in scope). */
  frontier: string[];
  truncated: boolean;
  cursor: string | null;
};

export function graphRef(kind: GraphItemKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseGraphRef(ref: string): { kind: GraphItemKind; id: string } | null {
  const at = ref.indexOf(':');
  if (at <= 0) return null;
  const kind = ref.slice(0, at);
  const id = ref.slice(at + 1);
  if (id === '' || !(GRAPH_ITEM_KINDS as readonly string[]).includes(kind)) return null;
  return { kind: kind as GraphItemKind, id };
}

export type RingEntry = { ref: string; rank: number };

/** Spec §2.2: by group rank, then newest first (ids are ULIDs, so a larger id is newer), then by ref for a total order. */
export function compareRingEntries(a: RingEntry, b: RingEntry): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const ia = a.ref.slice(a.ref.indexOf(':') + 1);
  const ib = b.ref.slice(b.ref.indexOf(':') + 1);
  if (ia !== ib) return ia < ib ? 1 : -1;
  return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
}

export type GraphScope = { workspaceIds: readonly string[]; projectIds: readonly string[] };

/**
 * C-scope, ported from the mockup's `inScope` (`knowledge-graph-sigma.html:717-718`). ONE rule for the server's `out`
 * flag and the client's re-walk. A person is always in scope (people belong to no workspace); a workspace-level note
 * (projectId null) follows its workspace; a project item is in scope when it is one of the chosen projects.
 */
export function inGraphScope(item: Pick<GraphItemView, 'kind' | 'id' | 'workspaceId' | 'projectId'>, scope: GraphScope): boolean {
  if (item.kind === 'person') return true;
  if (item.workspaceId === null || !scope.workspaceIds.includes(item.workspaceId)) return false;
  if (item.kind === 'workspace' || item.kind === 'concept' || scope.projectIds.length === 0) return true;
  if (item.kind === 'project') return scope.projectIds.includes(item.id);
  return item.projectId === null || scope.projectIds.includes(item.projectId);
}
