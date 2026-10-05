import { edgeKey, type FlowAnalysis, type FlowEdge, type FlowNode } from './types.js';

function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * FL-3, pure and clock-free. Edges naming an id that is not in `nodes` are ignored (a hidden ticket
 * is a hole: the read drops its links, and this function must not invent the node back).
 *
 * - Start / End: no incoming / no outgoing `leads_to`.
 * - Back edges: depth-first search from the Starts in ascending id, then from every still-unvisited
 *   node in ascending id; out-edges visited in ascending target id; an edge into a node that is
 *   currently on the stack is a back edge. Deterministic for a graph, and iterative (a 300-node
 *   chain must not depend on the engine's stack depth).
 * - Order: Kahn's order over the edges without back edges (a DFS back-edge removal leaves a DAG, so
 *   every node is emitted); among ready nodes the smallest (explicit sort day, id), where the sort
 *   day is `explicitStart`, else `explicitDue`, and a node with neither sorts after every dated one.
 */
export function analyzeFlow(
  nodes: ReadonlyArray<Pick<FlowNode, 'id' | 'explicitStart' | 'explicitDue'>>,
  edges: readonly FlowEdge[],
): FlowAnalysis {
  const known = new Set(nodes.map((n) => n.id));
  const ids = [...known].sort(byId);
  const targets = new Map<string, Set<string>>();
  const hasIncoming = new Set<string>();
  for (const e of edges) {
    if (!known.has(e.sourceId) || !known.has(e.targetId)) continue;
    const set = targets.get(e.sourceId) ?? new Set<string>();
    set.add(e.targetId);
    targets.set(e.sourceId, set);
    hasIncoming.add(e.targetId);
  }
  const out = new Map<string, string[]>([...targets].map(([source, set]) => [source, [...set].sort(byId)]));

  const starts = ids.filter((id) => !hasIncoming.has(id));
  const ends = ids.filter((id) => (out.get(id)?.length ?? 0) === 0);

  const color = new Map<string, 1 | 2>(); // absent = unvisited, 1 = on the stack, 2 = finished
  const backEdges = new Set<string>();
  for (const root of [...starts, ...ids]) {
    if (color.has(root)) continue;
    color.set(root, 1);
    const stack: Array<{ id: string; next: number }> = [{ id: root, next: 0 }];
    for (let frame = stack.at(-1); frame !== undefined; frame = stack.at(-1)) {
      const list = out.get(frame.id) ?? [];
      const target = list[frame.next];
      if (target === undefined) {
        color.set(frame.id, 2);
        stack.pop();
        continue;
      }
      frame.next += 1;
      const seen = color.get(target);
      if (seen === 1) backEdges.add(edgeKey({ sourceId: frame.id, targetId: target }));
      else if (seen === undefined) {
        color.set(target, 1);
        stack.push({ id: target, next: 0 });
      }
    }
  }

  const sortDay = new Map(nodes.map((n) => [n.id, n.explicitStart ?? n.explicitDue] as const));
  const comesFirst = (a: string, b: string): boolean => {
    const da = sortDay.get(a) ?? null;
    const db = sortDay.get(b) ?? null;
    if (da !== db) return db === null ? true : da === null ? false : da < db;
    return a < b;
  };
  const waiting = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const [source, list] of out) {
    for (const target of list) {
      if (!backEdges.has(edgeKey({ sourceId: source, targetId: target }))) waiting.set(target, (waiting.get(target) ?? 0) + 1);
    }
  }
  const ready = ids.filter((id) => waiting.get(id) === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    let best = 0;
    for (let i = 1; i < ready.length; i += 1) {
      if (comesFirst(ready[i] as string, ready[best] as string)) best = i;
    }
    const [id] = ready.splice(best, 1) as [string];
    order.push(id);
    for (const target of out.get(id) ?? []) {
      if (backEdges.has(edgeKey({ sourceId: id, targetId: target }))) continue;
      const left = (waiting.get(target) ?? 0) - 1;
      waiting.set(target, left);
      if (left === 0) ready.push(target);
    }
  }
  return { starts, ends, backEdges, order };
}
