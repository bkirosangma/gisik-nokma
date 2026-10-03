import { UndirectedGraph } from 'graphology';
import louvainImport from 'graphology-communities-louvain';
import type { KnnEdge } from './knn.js';

/**
 * The ONLY server file that imports `graphology*` (spec D §4.1 step 4). The package is CommonJS: under
 * NodeNext `tsc` types the default import as the module record (`.default`), while Node hands back
 * `module.exports` itself, so `.default` alone is undefined at runtime and a bare default import fails
 * `tsc` with TS2339 on `detailed`. Measured 2026-10-03 (Node 22.23.2, tsc 5.9, vitest 3); the shim below
 * passed all three.
 */
type Louvain = typeof louvainImport.default;
const louvain: Louvain = (louvainImport as { default?: Louvain }).default ?? (louvainImport as unknown as Louvain);

/** mulberry32. Louvain's default rng is Math.random, which makes communities — and so signatures — unstable. */
export function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One community index per node, in node order. An isolated node is its own community. */
export function communities(nodeCount: number, edges: readonly KnnEdge[], seed: number): number[] {
  const graph = new UndirectedGraph();
  for (let index = 0; index < nodeCount; index += 1) graph.addNode(String(index));
  for (const edge of edges) graph.addEdge(String(edge.a), String(edge.b), { weight: edge.weight });
  const out = louvain.detailed(graph, { getEdgeWeight: 'weight', rng: seededRng(seed) });
  return Array.from({ length: nodeCount }, (_unused, index) => out.communities[String(index)] ?? -1);
}
