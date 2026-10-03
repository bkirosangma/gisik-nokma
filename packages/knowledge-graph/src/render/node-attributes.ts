import type { GraphGroup, GraphItemKind, StateCategory } from '@gisik-nokma/domain';

/** Levels of detail by hop (spec §3.3). `cardS` is the phone's centre card (`knowledge-graph-sigma.html:604`). */
export type Level = 'card' | 'cardS' | 'chip' | 'tap' | 'compact' | 'dot';

/** What a drawn node carries. Sigma's display data keeps only declared style keys (§4.2 trap 4), so these are read through styles. */
export type NodeAttributes = {
  x: number;
  y: number;
  ref: string;
  kind: GraphItemKind;
  fog: boolean;
  lv: Level | 'fog';
  center: boolean;
  lbl: string;
  sub: string | null;
  image: string;
  sug: boolean;
  cat: StateCategory | null;
};

export type EdgeAttributes = { id: string; grp: GraphGroup; fog: boolean; sug: boolean; on: boolean };

/** A node's icon (spec §3.4), drawn by `layerImage` from `render/sigma/icons.ts`. Declared here, outside the seam, because the view chooses it. */
export type IconSpec = { kind: 'person'; initials: string } | { kind: 'note' } | { kind: 'folder' };
