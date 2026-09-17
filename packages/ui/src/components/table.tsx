import type { ReactNode } from 'react';

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
};

export function Table<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  caption,
  className,
  rowClassName,
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
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={[
                onRowClick ? 'gn-table__row gn-table__row--clickable' : 'gn-table__row',
                rowClassName,
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => (
                <td key={column.id} className={['gn-table__cell', column.cellClassName].filter(Boolean).join(' ')}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
