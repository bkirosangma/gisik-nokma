import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Button } from '@gisik-nokma/ui';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { clampToAvoidOverlap, type Rect } from '../collision.js';
import type { DraftStore } from '../draft-store.js';
import { layoutDraft, type StatePosition } from '../layout.js';
import { useBuilderEnv, useBuilderStore } from './builder-context.js';
import { UNMEASURED_NODE } from './flow-graph.js';

/** How long "Undo tidy" stays on offer (spec §3.5). */
export const TIDY_UNDO_MS = 10_000;

/** Node sizes by position key, as the draft keys positions: a state's id, or `any-state`. */
export type NodeSizes = Record<string, { width: number; height: number }>;

/**
 * `layoutDraft`, each position then passed through the collision check against those already placed (spec §3.1, §3.5):
 * a state taller than `ROW_HEIGHT` or wider than `COLUMN_WIDTH` would otherwise sit on its neighbour. Every box, the
 * one being placed and the ones already placed, is its measured size from `sizes` (keyed like the draft's positions);
 * `UNMEASURED_NODE` stands in only for a key `sizes` has no entry for. A neo state measures about 200 flow px tall
 * against rows 140 apart, so a caller that has measurements must pass them: without, only the fallback box is cleared.
 */
export function tidyPositions(def: WorkflowDef, sizes: NodeSizes = {}): Record<string, StatePosition> {
  const placed: Rect[] = [];
  const tidied: Record<string, StatePosition> = {};
  for (const [id, target] of Object.entries(layoutDraft(def))) {
    const size = sizes[id] ?? UNMEASURED_NODE;
    const position = clampToAvoidOverlap(target, size, placed, target);
    tidied[id] = position;
    placed.push({ ...position, ...size });
  }
  return tidied;
}

type TidyOffer = { prev: Record<string, StatePosition>; tidied: Record<string, StatePosition>; owner: object };

/**
 * The "Undo tidy" offer of ONE draft store, shared by every {@link TidyControl} on it (the header's and the canvas
 * corner's): it was per instance, so a second Tidy re-armed a fresh offer whose `prev` was the first TIDIED layout
 * and the first instance's still-live subscription cleared it. Here a Tidy while an offer is open keeps the original
 * `prev` and restarts the 10 s; any write that is not a Tidy or an Undo drops the offer at once.
 */
function createTidyUndo(store: DraftStore) {
  let offer: TidyOffer | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let unwatch: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    unwatch?.();
    unwatch = null;
    if (offer === null) return;
    offer = null;
    for (const listener of [...listeners]) listener();
  };

  return {
    get: () => offer,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    tidy(owner: object, sizes: NodeSizes) {
      const state = store.getState();
      const tidied = tidyPositions(state.def, sizes);
      const prev = offer?.prev ?? state.positions;
      // armed BEFORE the write, so the watcher sees `positions === offer.tidied` on the write's own notify and a re-Tidy keeps the offer
      offer = { prev, tidied, owner };
      unwatch ??= store.subscribe(() => {
        if (store.getState().positions !== offer?.tidied) clear();
      });
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(clear, TIDY_UNDO_MS);
      store.actions.setPositions(tidied);
      for (const listener of [...listeners]) listener();
    },
    undo() {
      if (offer === null) return;
      const { prev } = offer;
      // the write is not a Tidy, so the watcher drops the offer
      store.actions.setPositions(prev);
    },
    /** A control that offered the Undo is gone: take the offer with it. */
    release(owner: object) {
      if (offer?.owner === owner) clear();
    },
  };
}

type TidyUndo = ReturnType<typeof createTidyUndo>;
const undoByStore = new WeakMap<DraftStore, TidyUndo>();
function tidyUndoOf(store: DraftStore): TidyUndo {
  let undo = undoByStore.get(store);
  if (undo === undefined) {
    undo = createTidyUndo(store);
    undoByStore.set(store, undo);
  }
  return undo;
}

/**
 * Tidy re-lays out every state in one store action, and "Undo tidy" puts the pre-Tidy positions back for 10 s. The
 * button goes on the first position change that is not a Tidy (a drag, a nudge, an add): it would otherwise restore
 * a layout the author has since moved away from. `sizes` is the caller's measured node sizes, read when Tidy is
 * pressed (the canvas corner passes React Flow's, the header the screen's canvas api); omitted, every box is the
 * unmeasured fallback. Only the control that was pressed shows "Undo tidy". No other undo exists (spec §3.5). `role="menuitem"`
 * when the full-screen toolbar's More menu holds it (G-9 T5); the guard and the shared offer are the same in every place.
 */
export function TidyControl(props: { sizes?: () => NodeSizes; role?: 'menuitem' }) {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const tidyUndo = tidyUndoOf(store);
  const offer = useSyncExternalStore(tidyUndo.subscribe, tidyUndo.get, tidyUndo.get);
  const self = useRef({});
  useEffect(() => {
    const owner = self.current;
    return () => tidyUndo.release(owner);
  }, [tidyUndo]);

  if (!canAuthor) return null;

  return (
    <span className="gn-tidy">
      <Button className="gn-tidy__tidy" role={props.role} onClick={() => tidyUndo.tidy(self.current, props.sizes?.() ?? {})}>
        Tidy
      </Button>
      {offer?.owner !== self.current ? null : (
        <Button className="gn-tidy__undo" role={props.role} onClick={tidyUndo.undo}>
          Undo tidy
        </Button>
      )}
    </span>
  );
}
