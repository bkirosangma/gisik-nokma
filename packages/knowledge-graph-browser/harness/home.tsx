import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@gisik-nokma/ui/ui.css';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import { KnowledgeGraph, type DrawEdge, type GraphRenderer, type GraphZonesSummary, type HopChoice, type RendererProbe, type ScopeChoices } from '@gisik-nokma/knowledge-graph';
import { createSigmaRenderer } from '@gisik-nokma/knowledge-graph/sigma';
import { GRAPH_CHIP_ORDER } from '@gisik-nokma/domain';
import { fixtureRing, setBigWorld } from './fixture-source.js';

/*
 * Home's seed (KG-E T4, cases 27.653–27.656): `KnowledgeGraph` mounted the way `HomeBody` mounts it
 * (`apps/web/src/home/home-graph.tsx`): centred on the fixture's workspace (`workspace:wgn`), every chip including
 * Projects, no Hops control, the list in its own box (`listBox`), `config` 'home' with hops 2 on a desktop and 'phone' with hops 1 at 40rem and under (the
 * width the page opened at; `?hops=3` stands for a pick Show more hops made earlier, which Home keeps passing), and
 * `onEscape` as `HomeBody` wires it: a lit set clears and the view does nothing more;
 * with none lit it answers false and the view goes Back. Three buttons set the highlight, from the last `onZones`:
 * `light-a` = the first three clear items other than the centre; `light-b` = the first fog item and the first clear
 * item outside A; `clear`. `window.__kgHome` exposes the probe, the zones, the drawn edges and the lit set. `?big=<n>` adds
 * n tickets to Mobile web (the release walk's big workspace, row 8).
 */
const style = document.createElement('style');
style.textContent = themeStylesheet();
document.head.prepend(style);

const phone = window.matchMedia('(max-width: 40rem)').matches;
const held = new URLSearchParams(location.search).get('hops');
const big = new URLSearchParams(location.search).get('big');
if (big !== null) setBigWorld(Number(big));
const hops: HopChoice = held !== null ? (Number(held) as HopChoice) : phone ? 1 : 2;
const CENTRE = 'workspace:wgn';
const SCOPE: ScopeChoices = {
  workspaces: [
    { id: 'gn', name: 'Gisik Nokma', projects: [{ id: 'j_mw', name: 'Mobile web' }, { id: 'j_wf', name: 'Workflows' }, { id: 'j_ds', name: 'Design' }] },
    { id: 'st', name: 'Studio', projects: [{ id: 'j_web', name: 'Website' }, { id: 'j_br', name: 'Brand' }] },
  ],
};

const state: { renderer: GraphRenderer | null; zones: GraphZonesSummary | null; edges: readonly DrawEdge[]; lit: readonly string[] | null; sets: { a: string[]; b: string[] } } = {
  renderer: null,
  zones: null,
  edges: [],
  lit: null,
  sets: { a: [], b: [] },
};
declare global {
  interface Window {
    __kgHome: {
      readonly probe: RendererProbe | null;
      readonly zones: GraphZonesSummary | null;
      readonly edges: readonly DrawEdge[];
      readonly lit: readonly string[] | null;
      readonly sets: { a: string[]; b: string[] };
      readonly phone: boolean;
    };
  }
}
window.__kgHome = {
  get probe() {
    return state.renderer?.inspect() ?? null;
  },
  get zones() {
    return state.zones;
  },
  get edges() {
    return state.edges;
  },
  get lit() {
    return state.lit;
  },
  get sets() {
    return state.sets;
  },
  phone,
};

/** The Sigma adapter, its `setGraph` recording the edges it was handed (so a case can read every drawn edge). */
function recordingRenderer(): GraphRenderer {
  const r = createSigmaRenderer();
  const setGraph = r.setGraph.bind(r);
  r.setGraph = (nodes, edges, positions, states, view) => {
    state.edges = edges;
    setGraph(nodes, edges, positions, states, view);
  };
  state.renderer = r;
  return r;
}

function setsFrom(z: GraphZonesSummary | null): { a: string[]; b: string[] } {
  if (z === null) return { a: [], b: [] };
  const clear = [...z.clear].filter((ref) => ref !== CENTRE);
  const a = clear.slice(0, 3);
  return { a, b: [...[...z.fog].slice(0, 1), ...clear.filter((ref) => !a.includes(ref)).slice(0, 1)] };
}

function Home() {
  const [lit, setLit] = useState<ReadonlySet<string> | null>(null);
  const light = (refs: readonly string[] | null) => {
    state.lit = refs;
    setLit(refs === null ? null : new Set(refs));
  };
  return (
    <>
      <div className="harness-row">
        <button type="button" id="light-a" onClick={() => light((state.sets = setsFrom(state.zones)).a)}>
          light-a
        </button>
        <button type="button" id="light-b" onClick={() => light((state.sets = setsFrom(state.zones)).b)}>
          light-b
        </button>
        <button type="button" id="clear" onClick={() => light(null)}>
          clear
        </button>
      </div>
      <KnowledgeGraph
        centre={CENTRE}
        config={phone ? 'phone' : 'home'}
        source={{ ring: (q) => fixtureRing({ ...q, workspaceIds: [...q.workspaceIds], projectIds: [...q.projectIds], groups: [...q.groups] }) }}
        scope={SCOPE}
        defaultWorkspaceIds={['gn']}
        groups={GRAPH_CHIP_ORDER}
        showHops={false}
        listBox
        hops={hops}
        highlight={lit}
        onZones={(z) => (state.zones = z)}
        onEscape={() => {
          if (state.lit === null) return false;
          light(null);
          return true;
        }}
        onOpen={() => undefined}
        createRenderer={async () => recordingRenderer}
      />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Home />);
