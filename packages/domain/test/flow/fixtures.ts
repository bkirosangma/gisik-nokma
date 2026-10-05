import type { FlowEdge, FlowNode } from '../../src/index.js';

/** A valid-shaped ULID whose sort order is `n`: `uid(3) < uid(12)`. Flow code only compares ids, but the settle events need the real shape. */
export function uid(n: number): string {
  return `01J00000000000000000000${String(n).padStart(3, '0')}`;
}

/** A node with every field at its quiet default (an open To do task with nothing claimed). Override what the case is about. */
export function fnode(id: string, over: Partial<FlowNode> = {}): FlowNode {
  return {
    id,
    typeId: 'task',
    stateId: 'todo',
    category: 'open',
    closed: false,
    trashed: false,
    draft: false,
    parentId: null,
    isDecision: false,
    outcome: null,
    passes: [],
    notTaken: null,
    waitForAll: false,
    started: false,
    rounds: 1,
    periods: [],
    explicitStart: null,
    explicitDue: null,
    estimate: null,
    reworkEstimate: null,
    initialStateId: 'todo',
    firstTerminalStateId: 'done',
    ...over,
  };
}

export const edge = (sourceId: string, targetId: string, label: string | null = null): FlowEdge => ({ sourceId, targetId, label });

/** A Decision node. */
export const decision = (id: string, over: Partial<FlowNode> = {}): FlowNode => fnode(id, { typeId: 'decision', isDecision: true, ...over });

/**
 * The mockup's 13-node flow (`wtg-preview/Main.dc.html`, NODES / EDGES), keyed by its ticket numbers.
 * Decisions: 144 (Yes -> 147, No -> 145), 148 (No -> 146, Yes -> 149), 151 (Yes -> 152, Need more info -> 149, No -> 141).
 *
 * The ids are assigned in `order`. The DEFAULT order is not the numeric one: GN-143 sorts before GN-142,
 * because FL-3 picks the loop-closing edge of a cycle by id order and the mockup draws the loop as 146 -> 143.
 * With the numeric order (creation order) the same graph closes its cycle at 143 -> 144 instead (case 29.181's control).
 */
export const MOCKUP_ORDER = ['140', '141', '143', '142', '144', '145', '146', '147', '148', '149', '150', '151', '152'] as const;
export const NUMERIC_ORDER = ['140', '141', '142', '143', '144', '145', '146', '147', '148', '149', '150', '151', '152'] as const;
export type MockupKey = (typeof MOCKUP_ORDER)[number];

export type Mockup = {
  ids: Record<MockupKey, string>;
  nodes: (over?: Partial<Record<MockupKey, Partial<FlowNode>>>) => FlowNode[];
  edges: () => FlowEdge[];
  /** Ticket numbers of a set of ids, sorted, for readable expectations. */
  keys: (ids: Iterable<string>) => string[];
};

export function mockup(order: readonly MockupKey[] = MOCKUP_ORDER): Mockup {
  const ids = Object.fromEntries(order.map((k, i) => [k, uid(i + 1)])) as Record<MockupKey, string>;
  const decisions = new Set<MockupKey>(['144', '148', '151']);
  const e = (from: MockupKey, to: MockupKey, label: string | null = null): FlowEdge => edge(ids[from], ids[to], label);
  const byId = new Map(Object.entries(ids).map(([k, id]) => [id, k] as const));
  return {
    ids,
    nodes: (over = {}) => order.map((k) => (decisions.has(k) ? decision(ids[k], over[k]) : fnode(ids[k], over[k]))),
    edges: () => [
      e('140', '141'), e('141', '142'), e('141', '143'), e('142', '144'), e('143', '144'),
      e('144', '147', 'Yes'), e('144', '145', 'No'), e('145', '146'), e('146', '143'),
      e('147', '148'), e('148', '146', 'No'), e('148', '149', 'Yes'), e('149', '150'), e('150', '151'),
      e('151', '152', 'Yes'), e('151', '149', 'Need more info'), e('151', '141', 'No'),
    ],
    keys: (set) => [...set].map((id) => byId.get(id) ?? id).sort(),
  };
}

export const M0 = mockup();
export const M = M0.ids;
export const mockupNodes = M0.nodes;
export const mockupEdges = M0.edges;
export const keysOf = M0.keys;
