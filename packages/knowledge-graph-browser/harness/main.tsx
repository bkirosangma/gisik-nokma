import { createRoot } from 'react-dom/client';
import '@gisik-nokma/ui/ui.css';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import { Sheet, Skeleton, SkeletonRegion } from '@gisik-nokma/ui';
import type { ConceptAudienceResponse, ConceptView, GraphItemView, GraphRingResponse, IngestResult, SubmittedEvent, SuggestionView } from '@gisik-nokma/domain';
import { ConceptInspector, makeSubmittedFactory, type DataSource } from '@gisik-nokma/app-core';
import { KnowledgeGraph, type GraphRenderer, type GraphSource, type GraphZonesSummary, type RendererProbe, type ScopeChoices } from '@gisik-nokma/knowledge-graph';
import { createSigmaRenderer } from '@gisik-nokma/knowledge-graph/sigma';
import { fixtureDelay, fixtureRing, setFixtureTitle } from './fixture-source.js';

/*
 * The VIEW harness (KG-C T7): `KnowledgeGraph` on the fixture, centred on GN-142, with the REAL Sigma adapter injected, so
 * the probe is on (`data-kg-probe`). `?config=phone|desktop|home`, `?hl=<ref>,<ref>` (Home's highlight), `?delay=<ms>`
 * (every ring answers late), `?long=<ref>` (that item's title is 200 characters: Review Focus 4), `?world=gn9-blocks|gn9-lonely`
 * (instead of the fixture, GN-9 with one Blocks link to GN-5, or with nothing linked: the empty states, 27.668), `?panel=`
 * (below), `?concepts=on` (the concept inspector, below). `window.__kgView` exposes the probe and the last `onZones` report.
 */
const style = document.createElement('style');
style.textContent = themeStylesheet();
document.head.prepend(style);

const params = new URLSearchParams(location.search);
const config = (params.get('config') ?? 'desktop') as 'desktop' | 'phone' | 'home';
const hl = params.get('hl');
/** The host's default workspaces (`?ws=st` leaves GN-142's own out: its scope note shows). */
const ws = (params.get('ws') ?? 'gn').split(',');
fixtureDelay.ms = Number(params.get('delay') ?? 0);
const long = params.get('long');
if (long !== null) setFixtureTitle(long, 'Move sheet loses its scroll position on phone when the board column jumps after a drag, '.repeat(3).slice(0, 200));

const SCOPE: ScopeChoices = {
  workspaces: [
    { id: 'gn', name: 'Gisik Nokma', projects: [{ id: 'j_mw', name: 'Mobile web' }, { id: 'j_wf', name: 'Workflows' }, { id: 'j_ds', name: 'Design' }] },
    { id: 'st', name: 'Studio', projects: [{ id: 'j_web', name: 'Website' }, { id: 'j_br', name: 'Brand' }] },
  ],
};

/** The empty states' world (27.668): GN-9 alone at its centre, its one Blocks link to GN-5 held only in `gn9-blocks`. */
const world = params.get('world');
const gn = (id: string, label: string): GraphItemView => ({ ref: `ticket:${id}`, kind: 'ticket', id, workspaceId: 'gn', projectId: 'j_mw', label, title: `${label} title`, category: 'open', hop: 0, out: false, suggested: false });
const gn9: GraphSource = {
  ring: async (q): Promise<GraphRingResponse> => {
    const linked = world === 'gn9-blocks' && q.hops === 1;
    return {
      hop: q.hops, center: gn('t9', 'GN-9'), frontier: [], truncated: false, cursor: null,
      items: linked ? [{ ...gn('t5', 'GN-5'), hop: 1 }] : [],
      edges: linked ? [{ id: 'blocks|ticket:t9|ticket:t5', kind: 'blocks', from: 'ticket:t9', to: 'ticket:t5', snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false }] : [],
    };
  },
};

/*
 * `?concepts=on` (KG-D Task 8, case 27.530): the concept inspector as the web hosts it (`ConceptInspector` through
 * `renderConceptPanel`, `apps/web/src/knowledge-graph/graph-panel.tsx`), on a data source that answers the fixture's two
 * concepts the way the server would: `concept:c1` confirmed, created over MCP, its four items and one link; `concept:c2`
 * the suggestion, its four items, and one person fewer seeing it. Writes commit and are dropped.
 */
const concepts = params.get('concepts');
const AT = '2026-10-05T04:00:00.000Z';
const tagged = (kind: 'ticket' | 'note', id: string, label: string) => ({ kind, id, label, taggedBy: 'pA', taggedAt: AT, origin: 'mcp' });
const C1: ConceptView = {
  id: 'c1', workspaceId: 'gn', name: 'Scroll position on phone sheets', summary: 'Why sheets on phone jump back to the top, and the fixes we tried.', itemCount: 4,
  createdBy: 'pA', origin: 'mcp', createdAt: AT, fromSuggestion: null,
  items: [
    tagged('ticket', 't142', 'GN-142 Move sheet loses its scroll position on phone'),
    tagged('ticket', 't151', 'GN-151 Restore scroll after Move closes'),
    tagged('ticket', 't139', 'GN-139 Sheet scroll resets on iOS Safari'),
    tagged('note', 'n2', 'Scroll restoration: what we tried'),
  ],
  links: [{ otherId: 'c9', otherName: 'Board performance', relation: 'related', direction: 'related' }],
};
const C2: SuggestionView = {
  id: 'c2', label: 'drag · column · board', terms: ['drag', 'column', 'board'], score: 0.82, computedAt: AT,
  signature: '7f3a'.repeat(16), itemHashes: ['a1', 'b2', 'c3', 'd4'].map((h) => h.repeat(16)),
  items: [
    { kind: 'ticket', id: 't160', label: 'GN-160 Board column jumps after a drag' },
    { kind: 'note', id: 'n4', label: 'Board drag measurements' },
    { kind: 'ticket', id: 't157', label: 'GN-157 Swipe between board columns' },
    { kind: 'ticket', id: 't130', label: 'GN-130 Live drag on the workflow canvas' },
  ],
};
const conceptData = {
  query: {
    getConcept: async (): Promise<ConceptView> => C1,
    getSuggestions: async (): Promise<SuggestionView[]> => [C2],
    getConceptAudience: async (): Promise<ConceptAudienceResponse> => ({ conceptId: null, members: 9, before: 9, after: 8 }),
  },
  ingest: async (events: SubmittedEvent[]): Promise<IngestResult[]> => events.map((e, i) => ({ status: 'committed', eventId: e.id, seq: i, serverTime: AT })),
} as unknown as DataSource;
const make = makeSubmittedFactory({ actorId: 'pA', origin: 'web' });
const renderConcept =
  concepts === null
    ? undefined
    : (item: GraphItemView, ctx: { refresh: () => void }) => (
        <ConceptInspector item={item} workspaceId={item.workspaceId ?? 'gn'} dataSource={conceptData} make={make} nameOf={() => 'Ama Rangsa'} onChanged={ctx.refresh} onRefusal={() => undefined} />
      );

const state: { renderer: GraphRenderer | null; zones: GraphZonesSummary | null } = { renderer: null, zones: null };
declare global {
  interface Window {
    __kgView: { readonly probe: RendererProbe | null; readonly renderer: GraphRenderer | null; readonly zones: GraphZonesSummary | null };
  }
}
window.__kgView = {
  get probe() {
    return state.renderer?.inspect() ?? null;
  },
  get renderer() {
    return state.renderer;
  },
  get zones() {
    return state.zones;
  },
};

const view = (
  <KnowledgeGraph
    centre={world === null ? 'ticket:t142' : 'ticket:t9'}
    config={config}
    source={world === null ? { ring: (q) => fixtureRing({ ...q, workspaceIds: [...q.workspaceIds], projectIds: [...q.projectIds], groups: [...q.groups] }) } : gn9}
    scope={SCOPE}
    defaultWorkspaceIds={ws}
    highlight={hl === null ? null : new Set(hl.split(','))}
    onZones={(z) => (state.zones = z)}
    onOpen={() => undefined}
    renderConceptPanel={renderConcept}
    createRenderer={async () => () => (state.renderer = createSigmaRenderer())}
  />
);

/*
 * `?panel=sheet|bare|loading` (KG-C T9, case 27.342's browser half): the view as the web hosts it, in the ui `Sheet` inside a
 * `.gn-kg-panel` (`apps/web/src/knowledge-graph/graph-panel.tsx`); `bare` is the same Sheet without the panel class (the
 * control); `loading` is graph-panel.tsx's loading box in the Sheet instead of the view (its markup, copied: the harness
 * cannot import the web app).
 */
const panel = params.get('panel');
createRoot(document.getElementById('root')!).render(
  panel === null ? (
    view
  ) : (
    <Sheet open title="Knowledge Graph" onClose={() => undefined}>
      {panel === 'loading' ? (
        <SkeletonRegion label="Loading the Knowledge Graph" className="gn-kg-panel gn-kg-panel--loading">
          <Skeleton shape="block" height="100%" />
        </SkeletonRegion>
      ) : (
        <div className={panel === 'bare' ? undefined : 'gn-kg-panel'}>{view}</div>
      )}
    </Sheet>
  ),
);
