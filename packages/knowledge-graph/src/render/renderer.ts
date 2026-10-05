import type { GraphGroup, GraphItemKind, StateCategory } from '@gisik-nokma/domain';
import type { CameraState } from '../engine/camera.js';
import type { FitItem } from '../engine/fit.js';
import type { RingConfig } from '../engine/layout.js';
import type { IconSpec, Level } from './node-attributes.js';
import type { ThemePalette } from './palette.js';

export type DrawNode = { ref: string; kind: GraphItemKind; fog: boolean; lv: Level | 'fog'; center: boolean; lbl: string; sub: string | null; icon: IconSpec | null; sug: boolean; cat: StateCategory | null };
export type DrawEdge = { id: string; from: string; to: string; grp: GraphGroup; fog: boolean; sug: boolean; on: boolean };
/** `highlight` (Home's stat filter, spec E) WINS over hover dimming: lit items 100%, the rest 25%, edges 12% (`knowledge-graph-sigma.html:784,795`). */
export type DrawStates = { selected: string | null; selectedEdge: string | null; highlight: ReadonlySet<string> | null };
export type DrawView = { fit: readonly FitItem[]; topPx: number; clearHop: number; keepView: boolean };
export type PickEvent = { kind: 'node'; ref: string; double: boolean } | { kind: 'edge'; id: string } | { kind: 'stage' };
/** x/y are px inside the mount element. */
export type HoverEvent = { kind: 'edge'; id: string; x: number; y: number } | { kind: 'edge-leave' } | { kind: 'node'; ref: string } | { kind: 'node-leave' };
export type MountOptions = { phone: boolean; config: RingConfig; reduceMotion: () => boolean };

/** The seam (spec §4.1). Everything above it speaks layout coordinates (y down) and refs; nothing above it imports Sigma. */
export interface GraphRenderer {
  mount(el: HTMLElement, palette: ThemePalette, opts: MountOptions): void;
  setGraph(nodes: readonly DrawNode[], edges: readonly DrawEdge[], positions: ReadonlyMap<string, { x: number; y: number }>, states: DrawStates, view: DrawView): void;
  setStates(states: DrawStates): void;
  setCamera(target: 'fit' | CameraState, opts?: { instant?: boolean }): void;
  zoomBy(factor: number): void;
  onCamera(cb: (state: CameraState) => void): () => void;
  onPick(cb: (event: PickEvent) => void): () => void;
  onHover(cb: (event: HoverEvent) => void): () => void;
  refreshTheme(palette: ThemePalette): void;
  destroy(): void;
  /** Test hook (the browser suite); returns null unless the mount element carries `data-kg-probe`. */
  inspect(): RendererProbe | null;
}

export type RendererProbe = {
  camera(): CameraState;
  fitRatio(): number;
  viewportOf(ref: string): { x: number; y: number } | null;
  graphAt(x: number, y: number): { x: number; y: number };
  normalise(p: { x: number; y: number }): { x: number; y: number };
  /** `backdropBorderColor` added by the planner ruling 2026-10-04, so 27.280 can pin the selection ring. */
  nodeDisplay(ref: string): { size: number; opacity: number; image: string; attachment: string | null; color: string; backdropColor: string; backdropBorderColor: string } | null;
  edgeDisplay(id: string): { size: number; opacity: number } | null;
  frames(): number;
  /** Every Sigma `clickNode`, fog included (27.270's control: the fog dot DID fire Sigma's own click, the adapter dropped it). */
  rawClicks(): number;
  inkLog(): number[];
  clearInk(): void;
  alphaAt(points: readonly { x: number; y: number }[]): number[];
  /** What Sigma's picking buffer holds at each stage point, as `kind:key` (null: the stage). 27.353's hit-area control. */
  hitAt(points: readonly { x: number; y: number }[]): (string | null)[];
  invalidated(): string[];
  positions(): Record<string, { x: number; y: number }>;
};

export type CreateRenderer = () => GraphRenderer;
