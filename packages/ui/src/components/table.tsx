import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Ruling 21 (coordinator, 2026-09-16) — `className`/`headerClassName`/
 * `rowClassName`/`cellClassName` below, all OPTIONAL, all composed the way
 * `card.tsx:7` already composes `Card`'s own: `[own, extra].filter(Boolean).
 * join(' ')`, appending to `gn-table*` rather than replacing it. This is the
 * approved answer to the Board prototype port Task 9 report's ruling
 * request — five List metrics (table min-width, header cell, zebra, data
 * cell, the title cell's own min-width) were reachable only by styling an
 * element `Table` renders itself (`<table>`/`<th>`/`<td>`/`<tr>`), and
 * `.gn-table`/`.gn-table__header`/`.gn-table__cell`/`.gn-table__row` are on
 * that port's do-not-edit list — this extension is what makes them
 * reachable from a caller's OWN selector (`.gn-list-*`) instead.
 *
 * Optional and additive is what makes this safe for `Table`'s only other
 * boundary: `apps/desktop` imports `@gisik-nokma/ui/ui.css`
 * (`apps/desktop/src/main.tsx:6`), so any rule this file's do-not-edit
 * classes carry ships there too — but `Table` itself has exactly one
 * PRODUCTION consumer repo-wide (`ticket-list.tsx`, confirmed by
 * `grep -rn '<Table\b'` before this change), so a caller passing nothing
 * gets BYTE-IDENTICAL output to before this change; nothing here is a
 * breaking change dressed as an addition.
 */
export type TableColumn<Row> = {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Appended to this column's `<th>`, alongside `gn-table__header`. */
  headerClassName?: string;
  /** Appended to this column's `<td>` on every row, alongside `gn-table__cell`. */
  cellClassName?: string;
};

export type TableProps<Row> = {
  columns: TableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  caption?: string;
  /** Appended to `<table>`, alongside `gn-table`. */
  className?: string;
  /** Appended to every `<tr>` in `<tbody>`, alongside `gn-table__row`(`--clickable`). */
  rowClassName?: string;
  /**
   * Per-row attributes, resolved once per row and spread onto that row's
   * `<tr>` AFTER the built-ins (second wave Task 4, 2026-09-18).
   *
   * `rowClassName` above can only say ONE class for EVERY row, and the List's
   * drag plumbing needs a fact about a ROW — `draggable`, the four drag
   * handlers, and a class naming which row is being dragged or hovered.
   *
   * **`className` is the one key the built-ins keep; everything else a caller
   * returns wins, `onClick` included.** That is the deliberate consequence of
   * spreading after the built-ins, and it is stated here rather than left to be
   * discovered: a caller returning `onClick` would REPLACE `onRowClick`, so the
   * two cannot be composed by accident. No caller does this today — `Table` has
   * exactly one production consumer and it passes neither — which is why this is
   * a documented edge rather than a guarded one. A guard would be a second
   * decision point with nothing to decide.
   *
   * **`className` is the one key the built-ins keep, and it is APPENDED.**
   * A hook that replaced it would strip `gn-table__row` off a row the moment
   * a caller passed anything, and the shared stylesheet keys on that class —
   * a silently unstyled row rather than an override. The extra class joins the
   * same `[own, extra].filter(Boolean).join(' ')` composition `Card` has used
   * since `card.tsx:7` and Ruling 21 applied to this component's other three
   * hooks (13.706 pins the order, because "appended" and "present" are not the
   * same claim).
   *
   * Optional and additive, like the rest of Ruling 21: a caller passing
   * nothing gets BYTE-IDENTICAL output to before this prop existed, and
   * `Table` still has exactly one production consumer (`ticket-list.tsx`).
   */
  rowProps?: (row: Row) => HTMLAttributes<HTMLTableRowElement>;
};

export function Table<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  caption,
  className,
  rowClassName,
  rowProps,
}: TableProps<Row>) {
  return (
    <div className="gn-table__scroll">
      <table className={['gn-table', className].filter(Boolean).join(' ')}>
        {caption ? <caption className="gn-table__caption">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={['gn-table__header', column.headerClassName].filter(Boolean).join(' ')}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            // `className` is pulled OUT of the caller's attributes so the
            // composed class list below is the only one this `<tr>` receives;
            // everything else spreads after the built-ins, so a caller's own
            // `draggable`/`onDrop`/`data-*` lands on the row unchanged.
            const { className: callerClassName, ...callerAttributes } = rowProps?.(row) ?? {};
            return (
              <tr
                key={rowKey(row)}
                className={[
                  onRowClick ? 'gn-table__row gn-table__row--clickable' : 'gn-table__row',
                  rowClassName,
                  callerClassName,
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                {...callerAttributes}
              >
                {columns.map((column) => (
                  <td key={column.id} className={['gn-table__cell', column.cellClassName].filter(Boolean).join(' ')}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
