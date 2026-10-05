import { GRAPH_GROUPS, GROUP_OF_EDGE_KIND, inGraphScope, type GraphEdgeView, type GraphItemView } from '@gisik-nokma/domain';
import {
  RING_CONFIGS, TOP_PX, emptyStore, fitItemsFor, iconFor, layoutRings, levelOf, mergeRing, nodeLabel, nodeSub, radius, readThemePalette, watchTheme, zones,
  type DrawEdge, type DrawNode, type DrawStates, type DrawView, type GraphRenderer, type GraphStore, type PickEvent, type RendererProbe,
} from '@gisik-nokma/knowledge-graph';
import { createSigmaRenderer } from '@gisik-nokma/knowledge-graph/sigma';
import type { HoverEvent } from '@gisik-nokma/knowledge-graph';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import { fixtureItems } from './fixture.js';
import { fixtureRing, setFixtureTitle } from './fixture-source.js';

/*
 * Mounts the Sigma adapter directly (no view): the fixture centred on GN-142, desktop config, 2 clear hops, laid out
 * through the engine exactly as Task 7's view will, with the palette read from the app's own tokens.
 */
const style = document.createElement('style');
style.textContent = themeStylesheet();
document.head.prepend(style);

const CFG = RING_CONFIGS.desktop;
const REACH = 2;
const SCOPE = { workspaceIds: ['gn'], projectIds: [] as string[] };
const ON = new Set(GRAPH_GROUPS);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const palette = () => readThemePalette(document.documentElement);

type Scene = { nodes: DrawNode[]; edges: DrawEdge[]; positions: Map<string, { x: number; y: number }>; states: DrawStates; view: DrawView };

/** The rings around `center`, fetched one hop at a time from the fixture's stand-in for the endpoint. */
async function load(center: string): Promise<GraphStore> {
  const self = fixtureItems().find((i) => i.ref === center)!;
  let store = mergeRing(emptyStore(), { hop: 0, center: self, items: [self], edges: [], frontier: [center], truncated: false, cursor: null });
  for (let hop = 1; hop <= REACH + 1; hop += 1) store = mergeRing(store, await fixtureRing({ center, hops: hop, ...SCOPE, groups: [...GRAPH_GROUPS] }));
  return store;
}

/** Zones → layout → levels/labels → draw lists (`knowledge-graph-sigma.html:915-940`). */
function scene(store: GraphStore, center: string, selected: string | null, keepView: boolean): Scene {
  const item = (ref: string) => store.items.get(ref)!;
  const z = zones(store, { center, on: ON, reach: REACH, inScope: (r) => inGraphScope(item(r), SCOPE), semantic: true });
  const dist = (r: string) => z.walk.dist.get(r) ?? 0;
  const ringOf = (r: string) => (z.fogSet.has(r) ? Math.max(dist(r), z.clearHop + 1) : dist(r));
  const pos = layoutRings(z.walk, center, CFG, ringOf);
  const shown = [...z.clear, ...z.fog];
  const shownSet = new Set(shown);
  const nodes: DrawNode[] = shown.map((ref) => {
    const it: GraphItemView = item(ref);
    const fog = z.fogSet.has(ref);
    const lv = levelOf(CFG, dist(ref), fog);
    return { ref, kind: it.kind, fog, lv, center: ref === center, lbl: fog ? '' : nodeLabel(it, lv, false), sub: fog ? null : nodeSub(it, lv, false), icon: iconFor(it, lv, ref === center), sug: it.suggested, cat: it.category };
  });
  const edges: DrawEdge[] = [...store.edges.values()]
    .filter((e: GraphEdgeView) => shownSet.has(e.from) && shownSet.has(e.to) && ON.has(GROUP_OF_EDGE_KIND[e.kind]))
    .map((e) => {
      const fog = z.fogSet.has(e.from) || z.fogSet.has(e.to);
      return { id: e.id, from: e.from, to: e.to, grp: GROUP_OF_EDGE_KIND[e.kind], fog, sug: e.suggested, on: !fog && selected !== null && (e.from === selected || e.to === selected) };
    });
  const byRef = new Map(nodes.map((n) => [n.ref, n]));
  const fit = fitItemsFor(
    z.clear.map((ref) => ({ ...pos.get(ref)!, kind: item(ref).kind, label: byRef.get(ref)!.lbl, sub: byRef.get(ref)!.sub, center: ref === center })),
    { fogRadius: z.fog.length > 0 ? radius(CFG.R, z.clearHop + 1) : null, phone: false },
  );
  const positions = new Map(shown.map((ref) => [ref, pos.get(ref)!]));
  return { nodes, edges, positions, states: { selected, selectedEdge: null, highlight: null }, view: { fit, topPx: TOP_PX.desktop, clearHop: z.clearHop, keepView } };
}

const mountEl = document.getElementById('mount')!;
const renderer: GraphRenderer = createSigmaRenderer();
const picks: PickEvent[] = [];
const hovers: HoverEvent[] = [];
renderer.mount(mountEl, palette(), { phone: false, config: CFG, reduceMotion });
renderer.onPick((e) => picks.push(e));
renderer.onHover((e) => hovers.push(e));
watchTheme(() => renderer.refreshTheme(palette()));

let center = 'ticket:t142';
let current: Scene;
async function show(ref: string, opts: { selected?: string | null; keepView?: boolean } = {}): Promise<Scene> {
  center = ref;
  current = scene(await load(ref), ref, opts.selected === undefined ? ref : opts.selected, opts.keepView ?? false);
  renderer.setGraph(current.nodes, current.edges, current.positions, current.states, current.view);
  return current;
}

/** The layout positions `center` would get, without drawing it (27.281 finds an item the re-centre leaves in place). */
async function layoutOf(ref: string): Promise<Record<string, { x: number; y: number }>> {
  return Object.fromEntries(scene(await load(ref), ref, ref, false).positions);
}

/** 500 clear + 2,000 fog + 3,000 edges (spec §7) through `setGraph`; returns its time (27.283). */
function stressGraph(): number {
  const nodes: DrawNode[] = [], positions = new Map<string, { x: number; y: number }>(), edges: DrawEdge[] = [];
  for (let i = 0; i < 2500; i += 1) {
    const fog = i >= 500, a = i * 2.399, r = fog ? 40 * Math.sqrt(500) + 36 * Math.sqrt(i - 499) : 40 * Math.sqrt(i);
    nodes.push({ ref: `ticket:s${i}`, kind: 'ticket', fog, lv: fog ? 'fog' : i < 25 ? 'chip' : 'compact', center: i === 0, lbl: fog ? '' : `GN-${1000 + i}`, sub: !fog && i < 25 ? `Stress ticket ${i}` : null, icon: null, sug: false, cat: fog ? null : 'open' });
    positions.set(`ticket:s${i}`, { x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  const groups = ['structure', 'blocks', 'relates', 'dup', 'attached', 'ref', 'people'] as const;
  for (let i = 0, k = 0; k < 3000; i += 1) {
    const a = (i * 7919) % 2500, b = (i * 104729 + 13) % 2500;
    if (a === b) continue;
    edges.push({ id: `x${k}`, from: `ticket:s${a}`, to: `ticket:s${b}`, grp: groups[k % groups.length]!, fog: a >= 500 || b >= 500, sug: false, on: false });
    k += 1;
  }
  const fit = fitItemsFor(nodes.filter((n) => !n.fog).map((n) => ({ ...positions.get(n.ref)!, kind: n.kind, label: n.lbl, sub: n.sub, center: n.center })), { fogRadius: null, phone: false });
  const t0 = performance.now();
  renderer.setGraph(nodes, edges, positions, { selected: null, selectedEdge: null, highlight: null }, { fit, topPx: TOP_PX.desktop, clearHop: 1, keepView: false });
  return performance.now() - t0;
}

declare global {
  interface Window {
    __kg: {
      renderer: GraphRenderer;
      probe: RendererProbe | null;
      picks: PickEvent[];
      hovers: HoverEvent[];
      layoutOf: (ref: string) => Promise<Record<string, { x: number; y: number }>>;
      rawClicks: () => number;
      scene: () => Scene;
      setCenter: (ref: string) => Promise<Scene>;
      show: typeof show;
      setTheme: (theme: 'light' | 'dark' | null) => void;
      readPalette: () => ReturnType<typeof readThemePalette>;
      setFixtureTitle: (ref: string, title: string) => Promise<Scene>;
      stressGraph: () => number;
    };
  }
}

void show(center).then(() => {
  window.__kg = {
    renderer,
    probe: renderer.inspect(),
    picks,
    hovers,
    layoutOf,
    rawClicks: () => renderer.inspect()?.rawClicks() ?? 0,
    scene: () => current,
    setCenter: (ref) => show(ref),
    show,
    setTheme: (theme) => (theme === null ? document.documentElement.removeAttribute('data-theme') : document.documentElement.setAttribute('data-theme', theme)),
    readPalette: palette,
    setFixtureTitle: (ref, title) => {
      setFixtureTitle(ref, title);
      return show(center);
    },
    stressGraph,
  };
});
