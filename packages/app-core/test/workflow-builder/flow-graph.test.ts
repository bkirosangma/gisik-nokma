import { describe, expect, it } from 'vitest';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { summaryContextFor } from '../../src/workflow-builder/summaries.js';
import { ANY_STATE_NODE_ID } from '../../src/workflow-builder/layout.js';
import { connectionToTransition, toFlowGraph } from '../../src/workflow-builder/ui/flow-graph.js';

const errand = WORKFLOW_TEMPLATES.find((template) => template.id === 'errand-with-waits')!;

function graph() {
  const draft = draftFromTemplate(errand);
  return { draft, ...toFlowGraph(draft, summaryContextFor(draft.def)) };
}

describe('toFlowGraph', () => {
  it('maps every state to an s:-prefixed node plus the any-state node', () => {
    const { draft, nodes } = graph();
    expect(nodes.map((node) => node.id)).toEqual([
      ...draft.def.states.map((state) => `s:${state.id}`),
      ANY_STATE_NODE_ID,
    ]);
    expect(nodes.every((node) => node.id === ANY_STATE_NODE_ID || node.type === 'state')).toBe(true);
  });

  it('carries name, category, blocked, and the initial marker in node data', () => {
    const { nodes } = graph();
    const waiting = nodes.find((node) => node.id === 's:waiting')!;
    expect(waiting.data).toEqual({
      stateId: 'waiting',
      name: 'Waiting',
      category: 'active',
      blocked: true,
      isInitial: false,
    });
    const start = nodes.find((node) => node.id === 's:later')!;
    expect(start.data).toMatchObject({ blocked: false, isInitial: true });
  });

  it('maps transitions to t:index edges with summaries, routing "*" from the any-state node', () => {
    const draft = draftFromTemplate(errand);
    draft.def = { ...draft.def, transitions: [...draft.def.transitions, { from: '*', to: 'in-progress', rules: [] }] };
    const { edges } = toFlowGraph(draft, summaryContextFor(draft.def));
    // t:3 is later→done, the template's first ruled transition (require-comment).
    expect(edges[3]).toMatchObject({
      id: 't:3',
      source: 's:later',
      target: 's:done',
      data: { index: 3, summaries: ['Must carry a comment explaining it.'] },
    });
    expect(edges[edges.length - 1]).toMatchObject({ source: ANY_STATE_NODE_ID, target: 's:in-progress' });
  });

  it('drops edges whose endpoint state is missing — the issues panel names them instead', () => {
    const draft = draftFromTemplate(errand);
    draft.def = { ...draft.def, transitions: [...draft.def.transitions, { from: 'ghost', to: 'done', rules: [] }] };
    const { edges } = toFlowGraph(draft, summaryContextFor(draft.def));
    expect(edges.some((edge) => edge.source === 's:ghost')).toBe(false);
  });

  // Coordination doc (~line 489, recorded unfixed): transitionSchema admits a
  // dangling `to: '*'` — the literal string, naming no real state — and it
  // publishes clean today. The test above only covers a dangling FROM; this
  // is the untested TO half. toFlowGraph must drop it the same way (`'*'` is
  // never in stateIds), not merely fail to crash — the edge count is the
  // discriminating assertion, not "no edge with a weird target" (which a
  // buggy source-side check alone could also satisfy).
  it('drops an edge dangling to the literal state "*" — the count says so, not just its absence', () => {
    const draft = draftFromTemplate(errand);
    const transitionCount = draft.def.transitions.length;
    draft.def = { ...draft.def, transitions: [...draft.def.transitions, { from: 'later', to: '*', rules: [] }] };
    const { edges } = toFlowGraph(draft, summaryContextFor(draft.def));
    expect(edges).toHaveLength(transitionCount);
  });

  it('marks selection on the selected node or edge', () => {
    const draft = draftFromTemplate(errand);
    draft.selection = { kind: 'transition', index: 0 };
    const { edges } = toFlowGraph(draft, summaryContextFor(draft.def));
    expect(edges[0]?.selected).toBe(true);
    expect(edges[1]?.selected).toBe(false);
  });
});

/**
 * 10.5 — a connect gesture becomes a transition; any-state maps to '*'; the any-state node accepts no inbound.
 */
describe('connectionToTransition', () => {
  it('strips prefixes and turns the any-state node into "*"', () => {
    expect(connectionToTransition({ source: 's:todo', target: 's:doing' })).toEqual({ from: 'todo', to: 'doing' });
    expect(connectionToTransition({ source: ANY_STATE_NODE_ID, target: 's:done' })).toEqual({ from: '*', to: 'done' });
  });

  it('refuses connections into the any-state node or with missing ends', () => {
    expect(connectionToTransition({ source: 's:todo', target: ANY_STATE_NODE_ID })).toBeNull();
    expect(connectionToTransition({ source: null, target: 's:done' })).toBeNull();
    expect(connectionToTransition({ source: 's:todo', target: null })).toBeNull();
  });
});
