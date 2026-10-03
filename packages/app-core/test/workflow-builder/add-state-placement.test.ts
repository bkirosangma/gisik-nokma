import { describe, expect, it } from 'vitest';
import { newDraft, createDraftStore } from '../../src/workflow-builder/draft-store.js';
import { NODE_GAP, rectsOverlap, type Rect } from '../../src/workflow-builder/collision.js';
import { GRID } from '../../src/workflow-builder/snap.js';
import { nextFreePosition } from '../../src/workflow-builder/layout.js';
import { UNMEASURED_NODE } from '../../src/workflow-builder/ui/flow-graph.js';

// G-9 T3: Add state drops the new state on the free grid point nearest the middle of what the author is looking at.

/** Three states stacked 16 px apart at the origin, so every grid point near (0, 0) is taken. */
function crowded() {
  const store = createDraftStore(newDraft('Placement'));
  const ids = [store.actions.addState(), store.actions.addState(), store.actions.addState()];
  ids.forEach((id, at) => store.actions.moveState(id, { x: at * GRID, y: 0 }));
  return { store, ids };
}
const rectsOf = (store: ReturnType<typeof crowded>['store'], sizes: Record<string, { width: number; height: number }> = {}, skip?: string): Rect[] =>
  Object.entries(store.getState().positions)
    .filter(([id]) => id !== skip)
    .map(([id, p]) => ({ ...p, ...(sizes[id] ?? UNMEASURED_NODE) }));

describe('25.527/25.528 Add state with a near point', () => {
  it('25.527 lands on the free grid point nearest `near`, clear of every state by the gap; 25.528 control: with no `near` it keeps the old nextFreePosition result', () => {
    const { store } = crowded();
    // control first (25.528): the old behaviour, which the templates rely on
    const before = store.getState().positions;
    const plain = store.actions.addState();
    expect(store.getState().positions[plain]).toEqual(nextFreePosition(before));

    const near = { x: 0, y: 0 };
    const id = store.actions.addState({ near });
    const placed = store.getState().positions[id]!;
    const others = rectsOf(store, {}, id);
    const free = (p: { x: number; y: number }) => others.every((o) => !rectsOverlap({ ...p, ...UNMEASURED_NODE }, o, NODE_GAP));
    expect(free(placed)).toBe(true);
    expect(Math.abs(placed.x % GRID)).toBe(0);
    expect(Math.abs(placed.y % GRID)).toBe(0);
    // nearest: no grid point strictly closer to `near` is free (an independent brute-force oracle over the neighbourhood)
    const d = (p: { x: number; y: number }) => Math.hypot(p.x - near.x, p.y - near.y);
    const radius = Math.ceil(d(placed) / GRID);
    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        const candidate = { x: near.x + i * GRID, y: near.y + j * GRID };
        if (d(candidate) < d(placed) - 1e-9) expect(free(candidate), `${candidate.x},${candidate.y} is closer and free`).toBe(false);
      }
    }
    // `near` itself is taken, so the answer is not `near`
    expect(placed).not.toEqual(near);
  });

  it('25.527 `near` is snapped to the grid first, and measured sizes replace the unmeasured guess', () => {
    const { store, ids } = crowded();
    const wide = { [ids[0]!]: { width: 600, height: 120 } };
    const id = store.actions.addState({ near: { x: 5, y: 3 }, sizes: wide });
    const placed = store.getState().positions[id]!;
    expect(Math.abs(placed.x % GRID)).toBe(0);
    expect(Math.abs(placed.y % GRID)).toBe(0);
    // the new state is as big as the biggest MEASURED state (here 600 wide), not the 208x120 guess
    expect(rectsOf(store, wide, id).every((o) => !rectsOverlap({ ...placed, ...wide[ids[0]!]! }, o, NODE_GAP))).toBe(true);
  });

  it('25.527 the new state takes the largest measured box, and the gap decides the answer (a state measures taller than the 120 guess; its edge sits off the grid)', () => {
    const store = createDraftStore(newDraft('Measured'));
    // a smaller state far away FIRST, the big one in the middle, another smaller one far away LAST: the new box is the LARGEST measured
    // one, not the smallest, the first or the last (the order of def.states is the order the sizes are read in)
    const small = store.actions.addState();
    store.actions.moveState(small, { x: 5000, y: 5000 });
    const only = store.actions.addState();
    store.actions.moveState(only, { x: 0, y: 0 });
    const tiny = store.actions.addState();
    store.actions.moveState(tiny, { x: -5000, y: 5000 });
    // 192 = 12 grid steps: with no gap the first free row above is y = -192, with the 8 px gap it is -208; the 120 guess would say -128
    const sizes = { [small]: { width: 100, height: 60 }, [only]: { width: 200, height: 192 }, [tiny]: { width: 80, height: 48 } };
    const id = store.actions.addState({ near: { x: 0, y: -100 }, sizes });
    expect(store.getState().positions[id]).toEqual({ x: 0, y: -208 });
    // the same on x: 200 wide + the gap puts the first free column to the left at -208, where the smallest box (100) would say -112
    const beside = store.actions.addState({ near: { x: -100, y: 0 }, sizes });
    expect(store.getState().positions[beside]).toEqual({ x: -208, y: 0 });
    // and with nothing measured the guess stands: 120 + 8 = 128
    const bare = createDraftStore(newDraft('Unmeasured'));
    const lone = bare.actions.addState();
    bare.actions.moveState(lone, { x: 0, y: 0 });
    const guessed = bare.actions.addState({ near: { x: 0, y: -100 } });
    expect(bare.getState().positions[guessed]).toEqual({ x: 0, y: -128 });
  });

  it('25.527 nothing free within the search keeps the old nextFreePosition rather than failing', () => {
    const { store, ids } = crowded();
    ids.forEach((id) => store.actions.moveState(id, { x: -50_000, y: -50_000 })); // a rect covering the whole search area
    const huge = Object.fromEntries(ids.map((id) => [id, { width: 100_000, height: 100_000 }]));
    const before = store.getState().positions;
    const id = store.actions.addState({ near: { x: 0, y: 0 }, sizes: huge });
    expect(store.getState().positions[id]).toEqual(nextFreePosition(before));
  });
});
