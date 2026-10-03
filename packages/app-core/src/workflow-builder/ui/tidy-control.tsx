import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@gisik-nokma/ui';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { clampToAvoidOverlap, type Rect } from '../collision.js';
import { layoutDraft, type StatePosition } from '../layout.js';
import { useBuilderEnv, useBuilderStore } from './builder-context.js';
import { UNMEASURED_NODE } from './flow-graph.js';

/** How long "Undo tidy" stays on offer (spec §3.5). */
export const TIDY_UNDO_MS = 10_000;

/**
 * `layoutDraft`, each position then passed through the collision check against those already placed (spec §3.5): a
 * state wider than `COLUMN_WIDTH` or taller than `ROW_HEIGHT` would otherwise sit on its neighbour. The store holds no
 * measured sizes (React Flow does), and this runs outside the canvas too (the header's Tidy), so every box is the
 * unmeasured size the phone opening view already uses.
 */
export function tidyPositions(def: WorkflowDef): Record<string, StatePosition> {
  const placed: Rect[] = [];
  const tidied: Record<string, StatePosition> = {};
  for (const [id, target] of Object.entries(layoutDraft(def))) {
    const position = clampToAvoidOverlap(target, UNMEASURED_NODE, placed, target);
    tidied[id] = position;
    placed.push({ ...position, ...UNMEASURED_NODE });
  }
  return tidied;
}

/**
 * Tidy re-lays out every state in one store action, and "Undo tidy" puts the previous positions back for 10 s. The
 * button goes on the first position change that is not the tidy itself (a drag, a nudge, an add): it would otherwise
 * restore a layout the author has since moved away from. No other undo exists (spec §3.5).
 */
export function TidyControl() {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const [undo, setUndo] = useState<{ prev: Record<string, StatePosition>; tidied: Record<string, StatePosition> } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => clearTimer, [clearTimer]);

  useEffect(() => {
    if (undo === null) return;
    return store.subscribe(() => {
      if (store.getState().positions !== undo.tidied) {
        clearTimer();
        setUndo(null);
      }
    });
  }, [store, undo, clearTimer]);

  if (!canAuthor) return null;

  const tidy = () => {
    const state = store.getState();
    const tidied = tidyPositions(state.def);
    clearTimer();
    // armed BEFORE the write: the subscription above checks `positions` against `tidied` on the write's own notify
    setUndo({ prev: state.positions, tidied });
    timer.current = setTimeout(() => setUndo(null), TIDY_UNDO_MS);
    store.actions.setPositions(tidied);
  };
  const undoTidy = () => {
    if (undo === null) return;
    clearTimer();
    store.actions.setPositions(undo.prev);
    setUndo(null);
  };

  return (
    <span className="gn-tidy">
      <Button className="gn-tidy__tidy" onClick={tidy}>
        Tidy
      </Button>
      {undo === null ? null : (
        <Button className="gn-tidy__undo" onClick={undoTidy}>
          Undo tidy
        </Button>
      )}
    </span>
  );
}
