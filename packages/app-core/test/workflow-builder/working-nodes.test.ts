import { act, renderHook } from '@testing-library/react';
import type { Node, NodeChange } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { mergeDraftNodes, useWorkingNodes } from '../../src/workflow-builder/ui/use-working-nodes.js';

const n = (id: string, x: number, y = 0): Node => ({ id, type: 'state', position: { x, y }, data: {} });
const moved = (id: string, x: number, dragging: boolean): NodeChange => ({ type: 'position', id, position: { x, y: 0 }, dragging });

describe('25.502 the working copy follows the draft', () => {
  it('re-derives positions and membership from the draft when no drag is in flight', () => {
    expect(mergeDraftNodes([n('a', 0), n('b', 10)], [n('a', 5)], null).map((m) => [m.id, m.position.x])).toEqual([['a', 0], ['b', 10]]);
  });

  it('25.502 (hook level) follows a new draft: a state added and another moved show up; control, same it: before the rerender it is the first draft', () => {
    const first = [n('a', 0), n('b', 10)];
    const second = [n('a', 0), n('b', 99), n('c', 50)];
    const { result, rerender } = renderHook(({ d }) => useWorkingNodes(d), { initialProps: { d: first } });
    expect(result.current.nodes.map((m) => [m.id, m.position.x])).toEqual([['a', 0], ['b', 10]]); // control
    rerender({ d: second });
    expect(result.current.nodes.map((m) => [m.id, m.position.x])).toEqual([['a', 0], ['b', 99], ['c', 50]]);
  });
});

// F1: the draft owns membership, selection and placement. Only `select`, `dimensions` and the live gesture's own position reach the canvas.
describe('25.502 (hook level) onNodesChange is an allow-list: React Flow edits the draft does not know about are dropped', () => {
  const draft = [n('a', 10), n('b', 400)];
  const snapshot = () => JSON.stringify(draft);
  const ids = (nodes: Node[]) => nodes.map((m) => [m.id, m.position.x]);

  it('a remove change (React Flow\'s Backspace) leaves the node and the draft alone; control, same it: a select and a dimensions change on it ARE applied', () => {
    const before = snapshot();
    const { result } = renderHook(() => useWorkingNodes(draft));
    act(() => result.current.onNodesChange([{ type: 'remove', id: 'a' }]));
    expect(ids(result.current.nodes)).toEqual([['a', 10], ['b', 400]]);
    expect(result.current.nodes).toEqual(draft);
    expect(snapshot()).toBe(before);
    act(() => result.current.onNodesChange([{ type: 'select', id: 'a', selected: true }, { type: 'dimensions', id: 'a', dimensions: { width: 210, height: 118 } }]));
    expect(result.current.nodes[0]!.selected).toBe(true);
    expect(result.current.nodes[0]!.measured).toEqual({ width: 210, height: 118 });
  });

  it('a position change with no gesture (an arrow-key nudge) moves nothing; control, same it: the same change during a gesture on that id IS applied', () => {
    const before = snapshot();
    const { result } = renderHook(() => useWorkingNodes(draft));
    act(() => result.current.onNodesChange([moved('a', 14, false)]));
    expect(ids(result.current.nodes)).toEqual([['a', 10], ['b', 400]]);
    expect(snapshot()).toBe(before);
    act(() => result.current.beginDrag('a'));
    act(() => result.current.onNodesChange([moved('a', 14, true)]));
    expect(ids(result.current.nodes)).toEqual([['a', 14], ['b', 400]]);
  });

  it('a position change for ANOTHER id during a gesture (a multi-drag move) moves nothing; control, same it: the same kind for the gesture id IS applied', () => {
    const before = snapshot();
    const { result } = renderHook(() => useWorkingNodes(draft));
    act(() => result.current.beginDrag('a'));
    act(() => result.current.onNodesChange([moved('b', 420, true)]));
    expect(ids(result.current.nodes)).toEqual([['a', 10], ['b', 400]]);
    expect(snapshot()).toBe(before);
    act(() => result.current.onNodesChange([moved('a', 30, true)]));
    expect(ids(result.current.nodes)).toEqual([['a', 30], ['b', 400]]);
  });
});

describe('25.503 a draft change mid-drag keeps the dragged node where the pointer has it', () => {
  it('keeps the in-flight position for the dragged id, still adds a state created meanwhile, and carries measured sizes; control: without an in-flight drag the draft position wins', () => {
    const measuredA = { ...n('a', 120), measured: { width: 210, height: 118 } };
    const merged = mergeDraftNodes([n('a', 0), n('c', 50)], [measuredA, n('b', 10)], 'a');
    expect(merged.map((m) => [m.id, m.position.x])).toEqual([['a', 120], ['c', 50]]);
    expect(merged[0]!.measured).toEqual({ width: 210, height: 118 });
    expect(mergeDraftNodes([n('a', 0)], [measuredA], null)[0]!.position.x).toBe(0); // control
    expect(mergeDraftNodes([n('a', 0)], [measuredA], null)[0]!.measured).toEqual({ width: 210, height: 118 }); // measured survives either way
  });
});

describe('25.517 (hook level) Escape: the cancelled gesture stays active, and the end reads the position the last change left', () => {
  it('after cancelDrag every later change for the id is dropped and endDrag returns null with the node at its start; control, same it: without cancelDrag the last applied position is returned', () => {
    const draft = [n('a', 10), n('b', 400)];
    const run = (cancel: boolean) => {
      const { result } = renderHook(() => useWorkingNodes(draft));
      act(() => result.current.beginDrag('a'));
      act(() => result.current.onNodesChange([moved('a', 150, true)]));
      if (cancel) act(() => result.current.cancelDrag());
      act(() => result.current.onNodesChange([moved('a', 230, true)]));
      act(() => result.current.onNodesChange([moved('a', 260, false)]));
      let done: ReturnType<typeof result.current.endDrag> = null;
      act(() => { done = result.current.endDrag(); });
      return { done, x: result.current.nodes.find((m) => m.id === 'a')!.position.x };
    };
    const cancelled = run(true);
    expect(cancelled.done).toBeNull();
    expect(cancelled.x).toBe(10);
    const control = run(false);
    expect(control.done).toEqual({ id: 'a', position: { x: 260, y: 0 } });
    expect(control.x).toBe(260);
  });

  it('endDrag called in the same tick as the drag-end change (React Flow does both in one pointer-up) returns that change\'s position, not the one from the last render', () => {
    const draft = [n('a', 10)]; // stable, like the canvas's memoised graph
    const { result } = renderHook(() => useWorkingNodes(draft));
    act(() => result.current.beginDrag('a'));
    act(() => result.current.onNodesChange([moved('a', 150, true)]));
    let done: ReturnType<typeof result.current.endDrag> = null;
    act(() => {
      result.current.onNodesChange([moved('a', 175, false)]);
      done = result.current.endDrag();
    });
    expect(done).toEqual({ id: 'a', position: { x: 175, y: 0 } });
  });
});
