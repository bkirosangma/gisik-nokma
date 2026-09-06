import { useMemo, useState } from 'react';
import { Avatar, Chip, Table, type TableColumn } from '@gisik-nokma/ui';
import type { DataSource } from '../data-source.js';
import { actorLabel, formatDate } from '../provenance.js';
import {
  DEFAULT_GROUPING,
  DEFAULT_LIST_COLUMNS,
  DEFAULT_VIEW_PREFS,
  prefsOriginOf,
  type Grouping,
  type ListColumnId,
  type ListRow,
  type PrefsOrigin,
  type ProjectViewPrefs,
} from '../view-types.js';
import {
  columnLabel,
  countRows,
  groupRows,
  nestRows,
  recentlyAssignedRows,
  visibleNodes,
  type GroupLabels,
  type ListRowNode,
} from './list-model.js';
import { formatRollup } from './rollup-text.js';
import { useLiveQuery } from './use-live-query.js';
import { usePreferences } from './use-preferences.js';

const GROUPING_OPTIONS: Grouping[] = ['epic', 'status', 'assignee', 'type', 'flat'];
const AVAILABLE_COLUMNS: ListColumnId[] = ['status', 'assignee', 'dueDate', 'type', 'progress'];

/**
 * Whether the arrangement on screen is the user's own or this client's stock
 * one. Ruling P24 (coordination doc): *"reaching for a default there presents a
 * default as the user's own choice"* — so the surface says which it is showing.
 *
 * DECLARED IN `view-types.ts` and re-exported here. It used to be declared here
 * and describe the PROJECT only; the same ruling's other asymmetry needs the
 * same word per HALF (`Chosen<T>`), and two spellings of one ruling is the
 * two-sources-of-truth shape this series keeps catching. One name, both scopes.
 */
export type { PrefsOrigin };

export type TicketListProps = {
  rows: ListRow[];
  currentUserId: string;
  /**
   * Both halves, each carrying whether the user chose it. There is deliberately
   * NO separate `prefsOrigin` prop beside this one: the origin is a fact ABOUT
   * these halves, and a second prop carrying it could be passed disagreeing with
   * them — `prefsOrigin="stored"` over two `default` halves would put the user's
   * name on a stock arrangement, which is the exact thing ruling P24 forbids,
   * reintroduced through the prop list. Derived here via `prefsOriginOf`.
   */
  prefs: ProjectViewPrefs;
  onPrefsChange: (prefs: ProjectViewPrefs) => void;
  /**
   * False while the preferences document has not loaded. The controls are
   * DISABLED rather than silently inert, because a write in that window cannot
   * merge into a document this client has not read — see `useTicketList`.
   */
  prefsEditable?: boolean;
  labels: GroupLabels;
  onOpenTicket: (ticketId: string) => void;
};

/**
 * The Asana-shaped list, and the three ways it refuses to lie.
 *
 * 1. **Grouping is a REARRANGEMENT, never a filter.** Every row this view is
 *    given renders exactly once ACROSS THE SECTIONS, under all five groupings.
 *    A grouping that drops a row is a filter wearing a grouping's name, and the
 *    ticket it dropped is gone with nothing saying so.
 *
 *    "Exactly once across the sections" and not "exactly once on the page":
 *    *Recently assigned* is an additional SURFACE pinned above them, so a row
 *    assigned to the viewer legitimately appears twice on screen — once pinned,
 *    once in its section. Measuring the invariant document-wide measures the
 *    pin instead of the grouping.
 *
 * 2. **Counts never shrink for visibility.** The summary reads `countRows` over
 *    the FLAT set, so neither the grouping nor a collapsed subtree can move it;
 *    and a restricted child stays in the progress column's denominator with the
 *    restriction NAMED beside it (`formatRollup`), never quietly subtracted.
 *
 * 3. **Nesting never hides a row.** A row whose parent is restricted has no
 *    visible parent to indent under, so it renders at the root WITH the
 *    restriction named — never dropped for want of somewhere to put it.
 *
 * Every instant here goes through `formatDate`, which is `provenance.ts`'s one
 * door onto the domain's `formatIstInstant`. No `toLocaleString`, no
 * `iso.slice(0, 10)`: a timestamp that shifts with the viewer's laptop is a
 * claim the record never made.
 */
export function TicketList({
  rows,
  currentUserId,
  prefs,
  onPrefsChange,
  prefsEditable = true,
  labels,
  onOpenTicket,
}: TicketListProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const counts = countRows(rows); // ALWAYS from the flat set — sections cannot alter it
  // The ONE place a stock value is named, with the origin still in hand. The
  // `default` arm of `Chosen` carries no `value`, so this narrowing is not a
  // style choice — reading `prefs.columns.value` unguarded does not compile.
  const columns = prefs.columns.origin === 'stored' ? prefs.columns.value : DEFAULT_LIST_COLUMNS;
  const grouping = prefs.grouping.origin === 'stored' ? prefs.grouping.value : DEFAULT_GROUPING;
  const sections = useMemo(() => groupRows(rows, grouping, labels), [rows, grouping, labels]);
  const pinned = useMemo(() => recentlyAssignedRows(rows, currentUserId), [rows, currentUserId]);

  const toggleCollapse = (ticketId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  // Toggling is where the user ACQUIRES authority over this half: whatever was
  // on screen becomes theirs, so the half goes out `origin: 'stored'`. The other
  // half is passed through untouched — including its `default` origin, which is
  // why `toServerPreferences` can still decline to store it.
  const toggleColumn = (id: ListColumnId) => {
    const next = columns.includes(id) ? columns.filter((column) => column !== id) : [...columns, id];
    onPrefsChange({ ...prefs, columns: { origin: 'stored', value: next } });
  };

  return (
    <div className="gn-list">
      <div className="gn-list__controls">
        <span data-testid="list-summary" className="gn-list__summary">
          {counts.total} tickets · {counts.terminal} done
        </span>
        <label className="gn-list__control">
          Group by
          <select
            value={grouping}
            disabled={!prefsEditable}
            onChange={(event) =>
              onPrefsChange({
                ...prefs,
                grouping: { origin: 'stored', value: event.target.value as Grouping },
              })
            }
          >
            {GROUPING_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <details className="gn-list__columns-picker">
          <summary>Columns</summary>
          {AVAILABLE_COLUMNS.map((id) => (
            <label key={id} className="gn-list__column-option">
              <input
                type="checkbox"
                checked={columns.includes(id)}
                disabled={!prefsEditable}
                onChange={() => toggleColumn(id)}
              />
              {columnLabel(id)}
            </label>
          ))}
        </details>
        {/*
          P24's asymmetry, at the only place a user can see it. Both scopes of
          it, because the ruling has two and the surface used to say only one:

          - NEITHER half chosen — the project is absent from the stored document
            and the whole arrangement on screen is this client's stock one.
          - ONE half chosen — the server holds the project in `listColumns` and
            not in `grouping` (or the reverse), which `mapPreferences` used to
            erase by filling the missing half with a default. It reaches here
            intact now, so the note names WHICH half nobody chose.

          Silence in either case signs a default with the user's name.
        */}
        {prefsOriginOf(prefs) === 'default' ? (
          <span className="gn-list__origin" data-testid="list-prefs-origin">
            default arrangement — you have not arranged this project
          </span>
        ) : (
          <>
            {prefs.columns.origin === 'default' ? (
              <span className="gn-list__origin" data-testid="list-prefs-origin-columns">
                default columns — you have not chosen columns for this project
              </span>
            ) : null}
            {prefs.grouping.origin === 'default' ? (
              <span className="gn-list__origin" data-testid="list-prefs-origin-grouping">
                default grouping — you have not chosen a grouping for this project
              </span>
            ) : null}
          </>
        )}
      </div>

      {pinned.length > 0 ? (
        <section role="region" aria-label="Recently assigned" className="gn-list__pinned">
          <h3 className="gn-list__section-title">Recently assigned</h3>
          <ListTable
            nodes={pinned.map((row) => ({ row, depth: 0, hasChildren: false }))}
            columns={columns}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            onOpenTicket={onOpenTicket}
          />
        </section>
      ) : null}

      {sections.map((section) => {
        const nodes = visibleNodes(nestRows(section.rows), collapsed);
        return (
          <section key={section.key} role="region" aria-label={section.label} className="gn-list__section">
            {grouping === 'flat' ? null : <h3 className="gn-list__section-title">{section.label}</h3>}
            <ListTable
              nodes={nodes}
              columns={columns}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              onOpenTicket={onOpenTicket}
            />
          </section>
        );
      })}
    </div>
  );
}

/**
 * The shipped `Table` (`@gisik-nokma/ui`), not a second one. The plan hand-rolls
 * markup identical to it — `gn-table__scroll` / `gn-table__header` /
 * `gn-table__cell` — which is a copy of a component the design system owns, and
 * the day the table grows a sticky header or a scroll shadow this surface would
 * silently not get it. The indentation, the collapse toggle and the
 * restricted-parent marker all fit in the first column's `cell`.
 */
function ListTable({
  nodes,
  columns,
  collapsed,
  onToggleCollapse,
  onOpenTicket,
}: {
  nodes: ListRowNode[];
  columns: ListColumnId[];
  collapsed: ReadonlySet<string>;
  onToggleCollapse: (ticketId: string) => void;
  onOpenTicket: (ticketId: string) => void;
}) {
  const tableColumns: TableColumn<ListRowNode>[] = [
    {
      id: 'title',
      header: 'Title',
      cell: (node) => (
        <span
          className="gn-list__title-cell"
          data-testid={`ticket-card-${node.row.ticketId}`}
          style={{ paddingLeft: `${node.depth * 1.1}rem` }}
        >
          {node.hasChildren ? (
            <button
              type="button"
              className="gn-list__collapse"
              aria-label={`${collapsed.has(node.row.ticketId) ? 'Expand' : 'Collapse'} ${node.row.title}`}
              onClick={() => onToggleCollapse(node.row.ticketId)}
            >
              {collapsed.has(node.row.ticketId) ? '▸' : '▾'}
            </button>
          ) : null}
          <button type="button" className="gn-list__open" onClick={() => onOpenTicket(node.row.ticketId)}>
            {node.row.title}
          </button>
          {node.row.pending ? (
            <Chip tone="pending" title="A claim for this ticket is queued and the server has not answered it yet">
              claim in transit
            </Chip>
          ) : null}
          {node.row.hasRestrictedParent ? (
            <Chip tone="restricted" title="This ticket hangs under a ticket you may not see">
              under a restricted parent
            </Chip>
          ) : null}
        </span>
      ),
    },
    ...columns.map((id) => ({
      id,
      header: columnLabel(id),
      cell: (node: ListRowNode) => <ListCell row={node.row} columnId={id} />,
    })),
  ];
  return <Table columns={tableColumns} rows={nodes} rowKey={(node) => node.row.ticketId} />;
}

function ListCell({ row, columnId }: { row: ListRow; columnId: ListColumnId }) {
  switch (columnId) {
    case 'status':
      return (
        <Chip
          tone={row.stateCategory}
          title={`marked ${row.stateName} by ${actorLabel(row.stateProvenance.actorId, row.stateProvenance.actorName)} on ${formatDate(row.stateProvenance.serverTime)}`}
        >
          {row.stateName}
        </Chip>
      );
    case 'assignee':
      return row.assignee === null ? (
        <span className="gn-list__empty-cell">—</span>
      ) : (
        <span className="gn-list__assignee">
          <Avatar name={actorLabel(row.assignee.id, row.assignee.name)} size="small" />
          {actorLabel(row.assignee.id, row.assignee.name)}
        </span>
      );
    case 'dueDate':
      // A date is a CLAIM and renders attributed (spec §7 Calendar's rule,
      // applied here too): whose claim it is travels with it, so nobody reads a
      // due date as a fact the system established.
      return row.dueDate === null ? (
        <span className="gn-list__empty-cell">—</span>
      ) : (
        <span>
          {formatDate(row.dueDate.date)} — {actorLabel(row.dueDate.claim.actorId, row.dueDate.claim.actorName)}
          &apos;s claim
        </span>
      );
    case 'type':
      return <span>{row.typeId}</span>;
    case 'progress':
      return row.rollup === null ? (
        <span className="gn-list__empty-cell">—</span>
      ) : (
        <span>{formatRollup(row.rollup)}</span>
      );
    default: {
      const fieldId = columnId.slice('field:'.length);
      const fieldClaim = row.fields[fieldId];
      if (fieldClaim === undefined) return <span className="gn-list__empty-cell">—</span>;
      return (
        <span title={`set by ${actorLabel(fieldClaim.actorId, null)} on ${formatDate(fieldClaim.serverTime)}`}>
          {String(fieldClaim.value)}
        </span>
      );
    }
  }
}

export type TicketListState = {
  /** `null` until the rows load, and it stays null when the read FAILS. */
  rows: ListRow[] | null;
  prefs: ProjectViewPrefs;
  /**
   * The PROJECT-level summary of `prefs`' two halves — `'default'` only when the
   * user has arranged neither. Derived by `prefsOriginOf`, never stored, and not
   * passed on to `TicketList`, which derives it from `prefs` by the same rule.
   */
  prefsOrigin: PrefsOrigin;
  /** False until the preferences document has loaded. See `setPrefs`. */
  canSetPrefs: boolean;
  setPrefs: (next: ProjectViewPrefs) => void;
  currentUserId: string;
  error: string | null;
  reload: () => void;
};

/**
 * Rows + preferences for one project.
 *
 * ## `grouping: 'flat'` is a decision, not a placeholder
 *
 * The client regroups, so it asks the server NOT to. Asking for a grouping and
 * regrouping the answer is the double-grouping lie `list-model.ts` opens with:
 * the shipped route groups per PAGE. The complete-set premise that licenses
 * client-side grouping is tripwired on `keyof TicketListView` in the tests.
 *
 * ## RULING P24 — the asymmetry, and the one case this hook can honour
 *
 * The server keeps `listColumns` and `grouping` as two records keyed by project;
 * the client pairs them under one key. P24 names the consequence: a project in
 * one record and absent from the other has no faithful client representation,
 * and defaulting the missing half *"presents a default as the user's own
 * choice"*. Two cases fall out and only ONE is reachable from here:
 *
 *  - **project absent from the document entirely** — `prefsOrigin: 'default'`,
 *    which `TicketList` says out loud on screen.
 *  - **project in `listColumns`, absent from `grouping`** (or the reverse) —
 *    **now reachable and honoured too, and this is what changed.** It used to be
 *    unreachable for the wrong reason: `mapPreferences` filled the missing half
 *    with `DEFAULT_VIEW_PREFS` before any view was handed the document, so the
 *    distinction was destroyed one layer below rather than represented. That
 *    substitution is what P24 forbids in as many words, and closing it needed
 *    the type to change, not this hook — `ProjectViewPrefs`' halves are each a
 *    `Chosen<T>` whose `default` arm carries no value, so a half nobody chose
 *    cannot be read as one somebody did without the compiler objecting.
 *
 * `prefsOrigin` here is the PROJECT-level summary of those halves, computed by
 * the one exported `prefsOriginOf` that `TicketList` also uses — the same rule
 * in one place rather than the same rule twice.
 *
 * The old root-cause note said **the client pairs `{columns, grouping}` under
 * one key**, so changing only the grouping of an unarranged project persists the
 * DEFAULT COLUMNS alongside it, and *"there is no way to write one half through
 * a paired type."* That is no longer true and the fix is on the write path:
 * `toServerPreferences` contributes no key for a `default` half, so a grouping
 * chosen alone is stored alone. The pair survives as a client-side shape; it no
 * longer forces a stock value into storage under the user's name.
 *
 * ## Why `setPrefs` refuses before the document loads
 *
 * A preference change is a whole-document PUT. Composed from a document this
 * client has not read, it necessarily carries `savedFilters: []` and no other
 * project — so a click landing in the load window would silently DELETE every
 * saved filter and every other project's arrangement, server-side, for good.
 * `canSetPrefs` is false in that window and `TicketList` disables the controls,
 * so the refusal is visible rather than a click that does nothing. The window
 * re-opens on a workspace switch, where `usePreferences` clears the document
 * before asking.
 */
export function useTicketList(
  source: DataSource,
  workspaceId: string,
  projectId: string,
  currentUserId: string,
): TicketListState {
  // `projectId` is the query key for the same reason the board's is: it is
  // exactly what changes when the list is pointed somewhere else.
  const list = useLiveQuery(source, workspaceId, projectId, () =>
    source.query.getTickets(projectId, {}, 'flat'),
  );
  const preferences = usePreferences(source, workspaceId);
  const stored = preferences.document?.projects[projectId];

  const setPrefs = (next: ProjectViewPrefs) => {
    const current = preferences.document;
    if (current === null) return; // refuse: see the docblock — this PUT would erase the rest
    preferences.save({
      ...current,
      projects: { ...current.projects, [projectId]: next },
    });
  };

  const prefs = stored ?? DEFAULT_VIEW_PREFS;

  return {
    rows: list.data?.rows ?? null,
    prefs,
    prefsOrigin: prefsOriginOf(prefs),
    canSetPrefs: preferences.document !== null,
    setPrefs,
    currentUserId,
    error: list.error ?? preferences.error,
    reload: list.reload,
  };
}
