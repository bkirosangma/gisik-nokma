import { GROUP_OF_EDGE_KIND, graphRef, type GraphEdgeKind, type GraphEdgeView, type GraphItemKind, type GraphItemView, type GraphRingResponse } from '@gisik-nokma/domain';
import { emptyStore, mergeRing, type GraphStore } from '../../src/engine/model.js';

type ItemSpec = { kind?: GraphItemKind; label?: string; title?: string | null; ws?: string | null; project?: string | null; cat?: 'open' | 'active' | 'terminal' | null };
export function item(id: string, spec: ItemSpec = {}): GraphItemView {
  const kind = spec.kind ?? 'ticket';
  return {
    ref: graphRef(kind, id), kind, id,
    workspaceId: spec.ws === undefined ? (kind === 'person' ? null : 'w1') : spec.ws,
    projectId: spec.project === undefined ? (kind === 'ticket' || kind === 'note' ? 'p1' : null) : spec.project,
    label: spec.label ?? id.toUpperCase(), title: spec.title === undefined ? (kind === 'ticket' || kind === 'note' ? `Title of ${id}` : null) : spec.title,
    category: spec.cat === undefined ? (kind === 'ticket' ? 'open' : null) : spec.cat,
    hop: 0, out: false, suggested: false,
  };
}
export function edge(kind: GraphEdgeKind, from: string, to: string, extra: Partial<GraphEdgeView> = {}): GraphEdgeView {
  return { id: `${kind}|${from}|${to}`, kind, from, to, snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false, ...extra };
}
/** One "ring" holding everything: the engine never needs the server's ring split to walk. */
export function storeOf(items: GraphItemView[], edges: GraphEdgeView[]): GraphStore {
  const ring: GraphRingResponse = { hop: 1, items, edges, frontier: items.map((i) => i.ref), truncated: false, cursor: null };
  return mergeRing(emptyStore(), ring);
}
export const T = (id: string) => graphRef('ticket', id);
export const N = (id: string) => graphRef('note', id);
export const P = (id: string) => graphRef('person', id);
export const ALL_GROUPS = new Set(Object.values(GROUP_OF_EDGE_KIND));
