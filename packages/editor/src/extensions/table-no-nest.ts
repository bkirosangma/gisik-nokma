import { Table } from '@tiptap/extension-table';

/**
 * `Table` whose `insertTable` refuses while the selection is already inside a
 * table — ported from the knowledge-base app's `tableNoNest.ts`.
 *
 * The node NAME stays `table`, so the schema vocabulary and both censuses are
 * unmoved; only the command changes. The reference's reason (GFM pipe tables
 * cannot nest) holds here too: `markdown/serializer.ts` emits pipe tables only,
 * and a nested table would corrupt or drop on Copy as Markdown. The toolbar's
 * table picker disables itself inside a table (the mouse and touch door); this
 * guard is the other doors — a keyboard binding, a programmatic call, a paste
 * that reaches `insertTable`.
 */
export const TableNoNest = Table.extend({
  addCommands() {
    const parent = this.parent?.() ?? {};
    const parentInsert = parent.insertTable;
    return {
      ...parent,
      insertTable:
        (options) =>
        (props) => {
          if (props.editor.isActive('table')) return false;
          if (!parentInsert) return false;
          return parentInsert(options)(props);
        },
    };
  },
});
