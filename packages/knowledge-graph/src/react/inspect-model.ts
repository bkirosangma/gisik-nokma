import { GROUP_OF_EDGE_KIND, GROUP_RANK, compareRingEntries, type GraphEdgeView, type GraphGroup, type GraphItemView } from '@gisik-nokma/domain';
import type { GraphStore } from '../engine/model.js';
import type { Walk } from '../engine/walk.js';

/*
 * What the inspector and the list compute (spec C §3.5), pure: the computations inside the mockup's `renderInsp`
 * (`knowledge-graph-sigma.html:998-1027`) and `outsideOf` (`:977-982`). Neighbours are taken in the spec's ring order
 * (§2.2), the walk's own order, never the mockup's `cmp`.
 */

export type PathStep = { from: string; to: string; edge: GraphEdgeView };

/** "How it connects to <centre>" (`:1018-1020`): the walk's parent links from the item back to the centre, centre first. */
export function pathTo(w: Walk, ref: string): PathStep[] {
  const steps: PathStep[] = [];
  let cur = ref;
  while (w.dist.get(cur) !== 0) {
    const p = w.parent.get(cur);
    if (p === undefined) return [];
    steps.unshift({ from: p.from, to: cur, edge: p.edge });
    cur = p.from;
  }
  return steps;
}

/** "Direct links" (`:1023-1026`): in-scope neighbours in enabled groups, in the spec's ring order. */
export function directLinks(store: GraphStore, ref: string, on: ReadonlySet<GraphGroup>, inScope: (r: string) => boolean): { edge: GraphEdgeView; to: string }[] {
  return (store.adj.get(ref) ?? [])
    .filter((x) => on.has(GROUP_OF_EDGE_KIND[x.edge.kind]) && inScope(x.to) && store.items.has(x.to))
    .map((x) => ({ ...x, ref: x.to, rank: GROUP_RANK[GROUP_OF_EDGE_KIND[x.edge.kind]] }))
    .sort(compareRingEntries)
    .map(({ edge, to }) => ({ edge, to }));
}

/** "Linked from" (`:1021-1022`): references INTO the item, with their snippets. */
export function linkedFrom(store: GraphStore, ref: string, inScope: (r: string) => boolean): GraphEdgeView[] {
  return [...store.edges.values()].filter((e) => e.kind === 'ref' && e.to === ref && inScope(e.from) && e.snippet !== null);
}

/** What "Add <name>" adds to the scope: a workspace that is not chosen, or a project of a chosen one. */
export type ScopeKey = { workspaceId: string } | { projectId: string; workspaceId: string };

/**
 * `outsideOf` (`:977-982`): links that lead outside the scope, grouped by what to add (a workspace, or a project). An item
 * with no workspace has nothing to add, so it gets no group.
 */
export function outsideScope(store: GraphStore, ref: string, on: ReadonlySet<GraphGroup>, inScope: (r: string) => boolean, chosenWorkspaces: readonly string[]): { key: ScopeKey; refs: string[] }[] {
  const groups = new Map<string, { key: ScopeKey; refs: string[] }>();
  for (const x of store.adj.get(ref) ?? []) {
    const it = store.items.get(x.to);
    if (it === undefined || !on.has(GROUP_OF_EDGE_KIND[x.edge.kind]) || inScope(x.to) || it.workspaceId === null) continue;
    const key: ScopeKey = !chosenWorkspaces.includes(it.workspaceId) ? { workspaceId: it.workspaceId } : { projectId: it.projectId ?? '', workspaceId: it.workspaceId };
    const k = JSON.stringify(key);
    groups.set(k, { key, refs: [...(groups.get(k)?.refs ?? []), x.to] });
  }
  return [...groups.values()];
}

/** "Center brings N items out of the fog" (`:1012`): enabled, in-scope neighbours that are not clear. */
export function fogNext(store: GraphStore, ref: string, on: ReadonlySet<GraphGroup>, clearSet: ReadonlySet<string>, inScope: (r: string) => boolean): number {
  return (store.adj.get(ref) ?? []).filter((x) => on.has(GROUP_OF_EDGE_KIND[x.edge.kind]) && !clearSet.has(x.to) && inScope(x.to)).length;
}

/** `kindWord` (`:564`): a ticket's key, else the kind. */
export const kindWord = (it: GraphItemView): string =>
  it.kind === 'ticket' ? it.label : ({ note: 'Note', person: 'Person', concept: 'Concept', workspace: 'Workspace', project: 'Project' } as const)[it.kind];

/** The Open button's words (`:1011`). */
export const openLabel = (it: GraphItemView): string =>
  ({ ticket: 'Open ticket', note: 'Open note', project: 'Open board', workspace: 'Open workspace', person: 'Show their work', concept: 'Open concept' } as const)[it.kind];

/** `longLabel` (`:563`): a ticket is its key and title; anything else is its label. */
export const longLabel = (it: GraphItemView): string => (it.kind === 'ticket' && it.title !== null ? `${it.label} ${it.title}` : it.label);
