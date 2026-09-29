import { useEffect, useRef, useState } from 'react';

/**
 * The size grid that opens under the toolbar's "Insert table" tool, ported from
 * the knowledge-base app's `TablePicker.tsx` (Excel-style 8×8, hover lights the
 * cells from the corner, the label says "R × C table").
 *
 * ## WHAT THE PORT CHANGED, AND WHY
 *
 * The source is a mouse-only grid of 64 `<div>`s committed on `mousedown`: no
 * keyboard, no screen reader, no touch. This one is the same grid with the same
 * label and the same eight-by-eight bound, drawn as real `<button>`s with a
 * ROVING tabindex — one tab stop for the whole grid, arrow keys move the lit
 * corner, Enter/Space commits, Escape closes — so a table can be inserted from
 * the keyboard and on a phone. Committing is `click`, which is what a tap and
 * a keypress both produce. The trigger button and the "not inside a table" rule
 * live in `EditorToolbar`; this component is only the panel.
 */

export const TABLE_PICKER_SIZE = 8;

export type TablePickerProps = {
  onSelect: (rows: number, cols: number) => void;
  /** Escape or an outside press. On Escape the picker returns focus to the trigger itself. */
  onClose: () => void;
};

type Cell = { row: number; col: number };

export function TablePicker({ onSelect, onClose }: TablePickerProps): React.JSX.Element {
  // 1-based, like the label. The active cell is BOTH the roving-tabindex stop
  // and the corner of the lit rectangle, so hover, arrows and the label all
  // read one value.
  const [active, setActive] = useState<Cell>({ row: 1, col: 1 });
  const [engaged, setEngaged] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Open focused on the first cell, so the keyboard reader is already inside.
  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
  }, []);

  // An outside press closes it (the source's `window` mousedown listener).
  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      const panel = root.current;
      if (panel === null || panel.contains(event.target as Node)) return;
      // The trigger lives beside the panel in the same wrapper and toggles it
      // itself; letting it through here would close and re-open on one click.
      if (panel.parentElement?.contains(event.target as Node) === true) return;
      onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  function move(next: Cell): void {
    const clamped = {
      row: Math.min(TABLE_PICKER_SIZE, Math.max(1, next.row)),
      col: Math.min(TABLE_PICKER_SIZE, Math.max(1, next.col)),
    };
    setActive(clamped);
    setEngaged(true);
    const index = (clamped.row - 1) * TABLE_PICKER_SIZE + (clamped.col - 1);
    // Focus follows the roving stop after React commits the new tabindex.
    queueMicrotask(() => {
      root.current?.querySelectorAll<HTMLButtonElement>('button')[index]?.focus();
    });
  }

  function onKeyDown(event: React.KeyboardEvent): void {
    const { row, col } = active;
    const step: Record<string, Cell> = {
      ArrowUp: { row: row - 1, col },
      ArrowDown: { row: row + 1, col },
      ArrowLeft: { row, col: col - 1 },
      ArrowRight: { row, col: col + 1 },
      Home: { row, col: 1 },
      End: { row, col: TABLE_PICKER_SIZE },
    };
    const next = step[event.key];
    if (next !== undefined) {
      event.preventDefault();
      move(next);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      // The keyboard reader opened this from the trigger, so Escape returns to
      // it. (An outside press does not move focus — the reader chose elsewhere.)
      const trigger = root.current?.parentElement?.querySelector<HTMLButtonElement>('.ticket-editor__tool');
      onClose();
      trigger?.focus();
    }
  }

  const cells: Cell[] = [];
  for (let row = 1; row <= TABLE_PICKER_SIZE; row += 1) {
    for (let col = 1; col <= TABLE_PICKER_SIZE; col += 1) cells.push({ row, col });
  }

  return (
    <div ref={root} className="ticket-editor__table-picker" onKeyDown={onKeyDown}>
      <div
        className="ticket-editor__table-grid"
        role="group"
        aria-label="Table size"
        onMouseLeave={() => setEngaged(false)}
      >
        {cells.map(({ row, col }) => {
          const isActive = row === active.row && col === active.col;
          const lit = engaged && row <= active.row && col <= active.col;
          return (
            <button
              key={`${row}x${col}`}
              type="button"
              className={lit ? 'ticket-editor__table-cell ticket-editor__table-cell--lit' : 'ticket-editor__table-cell'}
              tabIndex={isActive ? 0 : -1}
              aria-label={`${row} × ${col} table`}
              // Keep the editor's selection while the pointer is on the grid.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => {
                setActive({ row, col });
                setEngaged(true);
              }}
              onFocus={() => setEngaged(true)}
              onClick={() => onSelect(row, col)}
            />
          );
        })}
      </div>
      <div className="ticket-editor__table-label" role="status">
        {engaged ? `${active.row} × ${active.col} table` : 'Select size'}
      </div>
    </div>
  );
}
