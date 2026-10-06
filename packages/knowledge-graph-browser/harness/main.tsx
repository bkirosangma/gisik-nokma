import { createRoot } from 'react-dom/client';
import '@gisik-nokma/ui/ui.css';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import type { GraphItemView, GraphRingResponse } from '@gisik-nokma/domain';
import { KnowledgeGraph, type GraphRenderer, type GraphSource, type GraphZonesSummary, type RendererProbe, type ScopeChoices } from '@gisik-nokma/knowledge-graph';
import { createSigmaRenderer } from '@gisik-nokma/knowledge-graph/sigma';
import { fixtureDelay, fixtureRing, setFixtureTitle } from './fixture-source.js';

/*
 * The VIEW harness (KG-C T7): `KnowledgeGraph` on the fixture, centred on GN-142, with the REAL Sigma adapter injected, so
 * the probe is on (`data-kg-probe`). `?config=phone|desktop|home`, `?hl=<ref>,<ref>` (Home's highlight), `?delay=<ms>`
 * (every ring answers late), `?long=<ref>` (that item's title is 200 characters: Review Focus 4), `?world=gn9-blocks|gn9-lonely`
 * (instead of the fixture, GN-9 with one Blocks link to GN-5, or with nothing linked: the empty states, 27.668). `window.__kgView`
 * exposes the probe and the last `onZones` report.
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

createRoot(document.getElementById('root')!).render(
  <KnowledgeGraph
    centre={world === null ? 'ticket:t142' : 'ticket:t9'}
    config={config}
    source={world === null ? { ring: (q) => fixtureRing({ ...q, workspaceIds: [...q.workspaceIds], projectIds: [...q.projectIds], groups: [...q.groups] }) } : gn9}
    scope={SCOPE}
    defaultWorkspaceIds={ws}
    highlight={hl === null ? null : new Set(hl.split(','))}
    onZones={(z) => (state.zones = z)}
    onOpen={() => undefined}
    createRenderer={async () => () => (state.renderer = createSigmaRenderer())}
  />,
);
