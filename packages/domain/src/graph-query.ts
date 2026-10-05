import type { GraphEdgeView, GraphItemView } from './graph.js';

/**
 * Spec D §5.1's two graph QUERIES beside the ring read: `GET /v1/graph/path` (the shortest chains of links between two
 * items) and `GET /v1/graph/trace` (one kind of link followed transitively). The server answers them
 * (`apps/server/src/routes/graph-query.ts`) and the MCP tools `graph_path` / `graph_trace` pass them through, so the
 * wire shapes live here. Every item is one the viewer may open, and every sentence is `edgeSentence` over the
 * response's own labels.
 */
export const GRAPH_TRACE_KINDS = ['blocks', 'parent', 'duplicates', 'ref'] as const;
export type GraphTraceKind = (typeof GRAPH_TRACE_KINDS)[number];
export const GRAPH_TRACE_DIRECTIONS = ['out', 'in'] as const;
export type GraphTraceDirection = (typeof GRAPH_TRACE_DIRECTIONS)[number];

export type GraphPathResponse = {
  from: string;
  to: string;
  /** Every shortest path (all of one length), at most three, sorted by their node-id sequences; `[]` when none is within `maxHops`. */
  paths: Array<{ refs: string[]; edges: GraphEdgeView[]; sentences: string[] }>;
  /** The items the paths pass through, each once, `hop` = its distance from `from`. */
  items: GraphItemView[];
};

export type GraphTraceResponse = {
  from: string;
  kind: GraphTraceKind;
  direction: GraphTraceDirection;
  /** Breadth-first, by depth then ref; `via` is the item one step back. */
  chain: Array<{ ref: string; depth: number; via: string }>;
  /** The start (`hop` 0) and every chain item (`hop` = its depth). */
  items: GraphItemView[];
  /** One per chain entry, in chain order. */
  sentences: string[];
};
