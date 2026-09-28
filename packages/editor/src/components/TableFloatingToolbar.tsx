import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';

export type TableFloatingToolbarProps = {
  editor: Editor | null;
  editable: boolean;
};

type Cmd =
  | 'addRowBefore'
  | 'addRowAfter'
  | 'deleteRow'
  | 'addColumnBefore'
  | 'addColumnAfter'
  | 'deleteColumn'
  | 'toggleHeaderRow'
  | 'toggleHeaderColumn'
  | 'deleteTable';

/**
 * Ported from the owner's knowledge-base `TableFloatingToolbar.tsx` (read in
 * full before this port; last commit `59b3394`), with three deliberate
 * departures, each measured against THIS repo rather than assumed from the
 * source:
 *
 * 1. **Caret-tracking only, no hover-only mode.** The KB component also shows
 *    the bar when the mouse merely hovers a table with the caret elsewhere
 *    (`hoverTable` state, `lastHoverCellRef`) — dropped per the brief
 *    ("caret/selection is inside a table"), which simplifies away an entire
 *    tracking effect and the cursor-snap-on-click it exists to support.
 * 2. **`position: absolute` against `.ticket-editor`, not `position: fixed`
 *    against the viewport.** The KB component's own comment names exactly the
 *    bug this dodges in reverse: it uses `fixed` because ITS editor scrolls
 *    inside an ancestor the toolbar is not anchored to. This repo's ticket
 *    description editor lives inside a `Sheet`/`Dialog`, which applies a CSS
 *    `transform` — and `position: fixed` is document-relative only until an
 *    ancestor has a transform, after which it becomes relative to THAT
 *    ancestor (a standing CSS fact, not a KB-specific one), silently breaking
 *    fixed positioning inside a transformed panel. `.ticket-editor` already
 *    carries `position: relative` (`editor.css:106-108`) for exactly this
 *    class of child, so anchoring there sidesteps the transform trap entirely
 *    and needs no viewport math.
 * 3. **BEM classes and text/glyph labels, no Tailwind or `lucide-react`.**
 *    Neither exists in this package (Measurement 12) — the house pattern
 *    (`EditorToolbar.tsx`) is short text labels with a descriptive
 *    `aria-label`, followed here. `title=` is deliberately OMITTED: this
 *    repo has a standing product ruling against `title=` as an information
 *    mechanism (`packages/ui/src/ui.css:853,2939` — "unreachable by touch and
 *    keyboard"), and `EditorToolbar.tsx` itself never uses `title=`, only
 *    `aria-label`. A hover-name affordance is deferred until a shared
 *    tooltip component lands (none exists yet, per the same measurement).
 */
const BUTTONS: { cmd: Cmd; label: string; name: string; sep?: boolean }[] = [
  { cmd: 'addRowBefore', label: '↑row', name: 'Add row above' },
  { cmd: 'addRowAfter', label: '↓row', name: 'Add row below' },
  { cmd: 'deleteRow', label: '−row', name: 'Delete row' },
  { cmd: 'addColumnBefore', label: '←col', name: 'Add column left', sep: true },
  { cmd: 'addColumnAfter', label: '→col', name: 'Add column right' },
  { cmd: 'deleteColumn', label: '−col', name: 'Delete column' },
  { cmd: 'toggleHeaderRow', label: 'H row', name: 'Toggle header row', sep: true },
  { cmd: 'toggleHeaderColumn', label: 'H col', name: 'Toggle header column' },
  { cmd: 'deleteTable', label: '−table', name: 'Delete table', sep: true },
];

/** Walk the selection up to the nearest tableCell/tableHeader and return its DOM element. */
function findActiveCellDom(editor: Editor): HTMLElement | null {
  const { $head } = editor.state.selection;
  for (let d = $head.depth; d > 0; d -= 1) {
    const name = $head.node(d).type.name;
    if (name === 'tableCell' || name === 'tableHeader') {
      const dom = editor.view.nodeDOM($head.before(d));
      return dom instanceof HTMLElement ? dom : null;
    }
  }
  return null;
}

export function TableFloatingToolbar({ editor, editable }: TableFloatingToolbarProps): React.JSX.Element | null {
  const [table, setTable] = useState<HTMLTableElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Cursor tracking: on every selection change/transaction, find the table
  // (if any) the caret currently sits inside.
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      if (editor.isDestroyed) return;
      const cell = findActiveCellDom(editor);
      setTable(cell ? (cell.closest('table') as HTMLTableElement | null) : null);
    };
    update();
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
    };
  }, [editor]);

  // Position: absolute against `.ticket-editor` (the nearest positioned
  // ancestor — Measurement 5), recomputed on resize/scroll/size change.
  useEffect(() => {
    if (!table) {
      setPos(null);
      return;
    }
    const anchor = table.closest('.ticket-editor') as HTMLElement | null;
    const updatePos = () => {
      if (!anchor || !table.isConnected) {
        setPos(null);
        return;
      }
      const a = anchor.getBoundingClientRect();
      const t = table.getBoundingClientRect();
      setPos({ top: t.top - a.top - 36, left: t.left - a.left });
    };
    updatePos();
    // jsdom has no ResizeObserver by default; guard rather than crash under test.
    const RO = typeof ResizeObserver === 'undefined' ? null : ResizeObserver;
    const ro = RO ? new RO(updatePos) : null;
    ro?.observe(table);
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      ro?.disconnect();
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [table]);

  // A control that runs a mutating table command against a document the
  // surface won't let you save is a worse defect than no control at all —
  // `!editable` refuses before `!table`/`!pos` so a read-only mount never
  // renders this even transiently while positioning settles.
  if (!editable || !editor || editor.isDestroyed || !table || !pos) return null;

  const run = (cmd: Cmd) => editor.chain().focus()[cmd]().run();
  /**
   * Investigated and found INERT for all nine commands here, not fixed:
   * a React-staleness concern was raised — a command that leaves the active
   * cell's `<table>` DOM node identity-equal (e.g. a header toggle) would
   * make `setTable` bail, and a forced-repaint subscription (the shape
   * `EditorToolbar.tsx` uses for its own `isActive` reads) would be needed
   * to keep `canRun` fresh. Traced into the installed prosemirror-tables@1.8.5
   * source (`deleteRow`/`deleteColumn`/`toggleHeader*`, dist/index.js) and
   * every one of them checks ONLY `isInTable(state)` when called without a
   * `dispatch` (which is exactly how `.can()` calls them) — the "last row",
   * "last column" etc. guards live INSIDE the `if (dispatch)` branch only,
   * so `can()` can never see them. Concretely: `canRun('deleteRow')` is
   * `true` even on a table's only remaining row, and clicking it is a
   * silent no-op rather than a disabled button — a real, if minor and
   * library-inherited, UX gap, not something a repaint would fix, since
   * `disabled` never becomes stale when it never becomes `true` at all.
   */
  const canRun = (cmd: Cmd) => editor.can()[cmd]();

  return (
    <div
      className="table-toolbar"
      role="toolbar"
      aria-label="Table"
      // `position: absolute` itself is `.table-toolbar`'s own rule
      // (editor.css) — only the dynamic per-render coordinates are inline.
      style={{ top: pos.top, left: pos.left }}
      // Prevent a click from stealing selection away from the editor.
      onMouseDown={(event) => event.preventDefault()}
    >
      {BUTTONS.map((b) => (
        <span key={b.cmd} className="table-toolbar__group">
          {b.sep ? <span className="table-toolbar__sep" /> : null}
          <button
            type="button"
            className="table-toolbar__btn"
            disabled={!canRun(b.cmd)}
            aria-label={b.name}
            onClick={() => run(b.cmd)}
          >
            {b.label}
          </button>
        </span>
      ))}
    </div>
  );
}
