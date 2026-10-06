import { createRoot } from 'react-dom/client';
import '@gisik-nokma/ui/ui.css';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import { Sheet, Skeleton, SkeletonRegion } from '@gisik-nokma/ui';
import { KnowledgeGraph, type GraphRenderer, type GraphZonesSummary, type RendererProbe, type ScopeChoices } from '@gisik-nokma/knowledge-graph';
import { createSigmaRenderer } from '@gisik-nokma/knowledge-graph/sigma';
import { fixtureDelay, fixtureRing, setFixtureTitle } from './fixture-source.js';

/*
 * The VIEW harness (KG-C T7): `KnowledgeGraph` on the fixture, centred on GN-142, with the REAL Sigma adapter injected, so
 * the probe is on (`data-kg-probe`). `?config=phone|desktop|home`, `?hl=<ref>,<ref>` (Home's highlight), `?delay=<ms>`
 * (every ring answers late), `?long=<ref>` (that item's title is 200 characters: Review Focus 4), `?panel=` (below). `window.__kgView` exposes the
 * probe and the last `onZones` report.
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
    centre="ticket:t142"
    config={config}
    source={{ ring: (q) => fixtureRing({ ...q, workspaceIds: [...q.workspaceIds], projectIds: [...q.projectIds], groups: [...q.groups] }) }}
    scope={SCOPE}
    defaultWorkspaceIds={ws}
    highlight={hl === null ? null : new Set(hl.split(','))}
    onZones={(z) => (state.zones = z)}
    onOpen={() => undefined}
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
