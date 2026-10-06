import { GROUP_OF_EDGE_KIND, type GraphGroup, type GraphItemView } from '@gisik-nokma/domain';
import { fitItemsFor, TOP_PX, type FitItem } from '../engine/fit.js';
import { layoutRings, radius, RING_CONFIGS, type RingConfigName } from '../engine/layout.js';
import { levelOf, nodeLabel, nodeSub } from '../engine/levels.js';
import type { GraphStore } from '../engine/model.js';
import type { Zones } from '../engine/zones.js';
import type { IconSpec, Level } from '../render/node-attributes.js';
import { initialsOf } from '../render/initials.js';
import type { DrawEdge, DrawNode } from '../render/renderer.js';

/** `iconOf` (`knowledge-graph-sigma.html:813-814`): no icon in fog, at dot level, or on the centre card (a person's centre keeps its avatar). */
export function iconFor(item: GraphItemView, lv: Level | 'fog', center: boolean): IconSpec | null {
  if (lv === 'fog' || lv === 'dot' || (center && item.kind !== 'person')) return null;
  if (item.kind === 'person') return { kind: 'person', initials: initialsOf(item.label) };
  if (item.kind === 'note') return { kind: 'note' };
  if (item.kind === 'workspace' || item.kind === 'project') return { kind: 'folder' };
  return null;
}

export type DrawModel = { nodes: DrawNode[]; edges: DrawEdge[]; positions: Map<string, { x: number; y: number }>; fit: FitItem[]; topPx: number; counts: Partial<Record<GraphGroup, number>> };
export type DrawModelOptions = { config: RingConfigName; centre: string; selected: string | null; selectedEdge: string | null; on: ReadonlySet<GraphGroup> };

/**
 * The node and edge half of the mockup's `render` (`knowledge-graph-sigma.html:915-948`): zones → layout → levels and
 * labels → the renderer's draw lists. An edge touching fog is drawn as fog and not counted on its chip; with an edge
 * selected, no item's edges are lit.
 */
export function buildDrawModel(store: GraphStore, z: Zones, o: DrawModelOptions): DrawModel {
  const cfg = RING_CONFIGS[o.config], phone = o.config === 'phone';
  const res = z.walk;
  const ringOf = (id: string) => (z.fogSet.has(id) ? Math.max(res.dist.get(id) ?? 0, z.clearHop + 1) : res.dist.get(id) ?? 0);
  const positions = layoutRings(res, o.centre, cfg, ringOf);
  // Only what the store holds: before ring 1 answers (or when it fails) the walk still lists the centre, whose item the ring brings.
  const shown = [...z.clear, ...z.fog].filter((ref) => store.items.has(ref));
  const shownSet = new Set(shown);
  const nodes: DrawNode[] = shown.map((ref) => {
    const it = store.items.get(ref)!;
    const fog = z.fogSet.has(ref), lv = levelOf(cfg, res.dist.get(ref) ?? 0, fog), center = ref === o.centre;
    return { ref, kind: it.kind, fog, lv, center, lbl: fog ? '' : nodeLabel(it, lv, phone), sub: fog ? null : nodeSub(it, lv, phone), icon: iconFor(it, lv, center), sug: it.suggested, cat: it.category };
  });
  const counts: Partial<Record<GraphGroup, number>> = {};
  const edges: DrawEdge[] = [];
  for (const e of store.edges.values()) {
    const grp = GROUP_OF_EDGE_KIND[e.kind];
    if (!shownSet.has(e.from) || !shownSet.has(e.to) || !o.on.has(grp)) continue;
    const fog = z.fogSet.has(e.from) || z.fogSet.has(e.to);
    if (!fog) counts[grp] = (counts[grp] ?? 0) + 1;
    edges.push({ id: e.id, from: e.from, to: e.to, grp, fog, sug: e.suggested, on: !fog && o.selectedEdge === null && (e.from === o.selected || e.to === o.selected) });
  }
  const byRef = new Map(nodes.map((n) => [n.ref, n]));
  const clearDrawn = z.clear.filter((ref) => byRef.has(ref));
  const fit = fitItemsFor(
    clearDrawn.map((ref) => {
      const n = byRef.get(ref)!, p = positions.get(ref)!;
      return { x: p.x, y: p.y, kind: n.kind, label: n.lbl, sub: n.sub, center: n.center };
    }),
    { fogRadius: z.fog.length > 0 ? radius(cfg.R, z.clearHop + 1) : null, phone },
  );
  // The centre alone (every empty state): one item at the origin gives the fit no extent, and its solve zooms in about 100×.
  // Ring 1's four points frame it as a centre with hop-1 links is framed, so a chip turned back on draws them inside the view.
  if (clearDrawn.length === 1) fit.push(...fitItemsFor([], { fogRadius: radius(cfg.R, 1), phone }));
  return { nodes, edges, positions, fit, topPx: phone ? TOP_PX.phone : TOP_PX.desktop, counts };
}
