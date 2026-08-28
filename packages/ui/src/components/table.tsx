import type { ReactNode } from 'react';

export type TableColumn<Row> = { id: string; header: ReactNode; cell: (row: Row) => ReactNode };

export type TableProps<Row> = {
  columns: TableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  caption?: string;
};

export function Table<Row>({ columns, rows, rowKey, onRowClick, caption }: TableProps<Row>) {
  return (
    <div className="gn-table__scroll">
      <table className="gn-table">
        {caption ? <caption className="gn-table__caption">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} scope="col" className="gn-table__header">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? 'gn-table__row gn-table__row--clickable' : 'gn-table__row'}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => (
                <td key={column.id} className="gn-table__cell">
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
