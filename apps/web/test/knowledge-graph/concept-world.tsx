import type { ConceptView, GraphEdgeView, GraphItemView, GraphRingResponse, SuggestionView } from '@gisik-nokma/domain';
import type { CreateRenderer, DrawEdge, DrawNode, GraphRenderer, GraphRingQuery, GraphSource, PickEvent } from '@gisik-nokma/knowledge-graph';

/*
 * A small world for the web host's concept cases (KG-D Task 8: 27.528, 27.529, 27.533, 27.535): the REAL Knowledge
 * Graph view, mounted by `GraphPanel` through its own `next/dynamic` loader, on a recording stand-in renderer (jsdom has
 * no WebGL). Centre `ticket:T`; ring 1 holds the confirmed concept CP (tags T and TV), the suggestion SG (tags T) and
 * the ticket TV; ring 2 is empty.
 */
export const WS = '01J9WSGISIKNOKMA0000000000';
export const T = '01J9TICKETCENTRE0000000000';
export const TV = '01J9TICKETVISIBLE000000000';
export const CP = '01J9CONCEPTSCROLL000000000';
export const SG = 'sug_drag';
export const AMA = 'u_ama';

const item = (over: Partial<GraphItemView> & Pick<GraphItemView, 'ref' | 'kind' | 'id' | 'label'>): GraphItemView => ({
  workspaceId: WS, projectId: null, title: null, category: null, hop: 1, out: false, suggested: false, ...over,
});
export const CENTRE = item({ ref: `ticket:${T}`, kind: 'ticket', id: T, label: 'GN-1', title: 'Move sheet loses its scroll', category: 'open', hop: 0 });
export const VISIBLE = item({ ref: `ticket:${TV}`, kind: 'ticket', id: TV, label: 'GN-7', title: 'Renew the trade licence', category: 'open' });
export const CONCEPT = item({ ref: `concept:${CP}`, kind: 'concept', id: CP, label: 'Scroll position on phone sheets' });
export const SUGGESTION = item({ ref: `concept:${SG}`, kind: 'concept', id: SG, label: 'drag · column · board', suggested: true });
const tag = (from: GraphItemView, to: GraphItemView, suggested = false): GraphEdgeView => ({
  id: `tag|${from.ref}|${to.ref}`, kind: 'tag', from: from.ref, to: to.ref, snippet: null, addedBy: null, addedAt: null, origin: null, suggested,
});
const EDGES: GraphEdgeView[] = [tag(CONCEPT, CENTRE), tag(CONCEPT, VISIBLE), tag(SUGGESTION, CENTRE, true)];

/** The ring door, recording every question; Off's rings (no `concepts` group) hold no concept and no tag edge. */
export function conceptWorld() {
  const log: GraphRingQuery[] = [];
  const source: GraphSource = {
    async ring(q) {
      log.push(q);
      const concepts = q.groups.includes('concepts');
      const items = q.hops === 1 ? [VISIBLE, ...(concepts ? [CONCEPT, SUGGESTION] : [])] : [];
      const edges = q.hops === 1 && concepts ? EDGES : [];
      const answer: GraphRingResponse = { hop: q.hops, center: CENTRE, items, edges, frontier: items.map((i) => i.ref), truncated: false, cursor: null };
      return answer;
    },
  };
  return { source, log };
}

/** A renderer that records each draw and lets a case pick an item, as a click on the canvas would. */
export function recordingRenderer() {
  const draws: { nodes: DrawNode[]; edges: DrawEdge[] }[] = [];
  let pick: (e: PickEvent) => void = () => undefined;
  const r: GraphRenderer = {
    mount() {},
    setGraph(nodes, edges) {
      draws.push({ nodes: [...nodes], edges: [...edges] });
    },
    setStates() {},
    setCamera() {},
    zoomBy() {},
    onCamera: () => () => {},
    onPick: (cb) => ((pick = cb), () => {}),
    onHover: () => () => {},
    refreshTheme() {},
    destroy() {},
    inspect: () => null,
  };
  const create: CreateRenderer = () => r;
  return {
    createRenderer: async () => create,
    draws,
    pick: (ref: string) => pick({ kind: 'node', ref, double: false }),
    drawnRefs: () => (draws.at(-1)?.nodes ?? []).map((n) => n.ref),
  };
}

export const T_AT = '2026-10-05T04:00:00.000Z';
export function conceptView(over: Partial<ConceptView> = {}): ConceptView {
  return {
    id: CP, workspaceId: WS, name: 'Scroll position on phone sheets', summary: 'Why sheets on phone jump back to the top.', itemCount: 2,
    createdBy: AMA, origin: 'web', createdAt: T_AT, fromSuggestion: null,
    items: [
      { kind: 'ticket', id: T, label: 'GN-1 Move sheet loses its scroll', taggedBy: AMA, taggedAt: T_AT, origin: 'web' },
      { kind: 'ticket', id: TV, label: 'GN-7 Renew the trade licence', taggedBy: AMA, taggedAt: T_AT, origin: 'web' },
    ],
    links: [],
    ...over,
  };
}
export const SUGGESTION_VIEW: SuggestionView = {
  id: SG, label: 'drag · column · board', terms: ['drag', 'column', 'board'], score: 0.8, computedAt: T_AT,
  signature: '7f3a'.repeat(16), itemHashes: ['a1'.repeat(16), 'b2'.repeat(16), 'c3'.repeat(16)],
  items: [{ kind: 'ticket', id: T, label: 'GN-1 Move sheet loses its scroll' }],
};
